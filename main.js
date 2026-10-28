const { Plugin, PluginSettingTab, Setting, Notice, MarkdownView } = require('obsidian');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];

const VOICE_DEFINITIONS = {
  'sharvard-female': {
    name: 'Sharvard 👩 (España - Femenina)',
    modelFile: 'es_ES-sharvard-medium.onnx',
    speaker: 1,
    badge: '👩 Sharvard (ES)'
  },
  'sharvard-male': {
    name: 'Sharvard 👨 (España - Masculina)',
    modelFile: 'es_ES-sharvard-medium.onnx',
    speaker: 0,
    badge: '👨 Sharvard (ES)'
  },
  'davefx': {
    name: 'Davefx 👨 (España - Masculina)',
    modelFile: 'es_ES-davefx-medium.onnx',
    speaker: 0,
    badge: '👨 Davefx (ES)'
  },
  'daniela': {
    name: 'Daniela 👩 (Argentina - Femenina High)',
    modelFile: 'es_AR-daniela-high.onnx',
    speaker: 0,
    badge: '👩 Daniela (AR)'
  }
};

const DEFAULT_SETTINGS = {
  piperExe: '',
  modelsDir: '',
  selectedVoice: 'sharvard-female',
  playbackSpeed: 1.0,
  sentenceSilence: 0.15,
  progress: {} // { [filePath]: { index, total, percent, timestamp, snippet } }
};

function getLineCh(text, charIndex) {
  const lines = text.slice(0, charIndex).split('\n');
  const line = lines.length - 1;
  const ch = lines[lines.length - 1].length;
  return { line, ch };
}

function parseSentences(fullText) {
  if (!fullText) return [];

  // Omitir cabecera YAML Frontmatter
  const fmMatch = fullText.match(/^---[\s\S]*?---\n*/);
  const fmOffset = fmMatch ? fmMatch[0].length : 0;
  const bodyText = fullText.slice(fmOffset);

  const segmenter = new Intl.Segmenter('es', { granularity: 'sentence' });
  const rawSegments = Array.from(segmenter.segment(bodyText));

  const sentences = [];
  for (const s of rawSegments) {
    const absIndex = fmOffset + s.index;

    // Limpieza de formato markdown para síntesis auditiva pura
    let clean = s.segment
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[\[[^\]]*\]\]/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/^>\s*/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (clean.length > 0) {
      const from = getLineCh(fullText, absIndex);
      const to = getLineCh(fullText, absIndex + s.segment.length);
      sentences.push({
        raw: s.segment,
        clean,
        from,
        to,
        snippet: clean.slice(0, 35)
      });
    }
  }

  return sentences;
}

function findSentenceIndexAtCursor(cursor, sentences) {
  if (!cursor || !sentences || sentences.length === 0) return 0;

  for (let i = 0; i < sentences.length; i++) {
    const st = sentences[i];
    const afterFrom = (cursor.line > st.from.line) || (cursor.line === st.from.line && cursor.ch >= st.from.ch);
    const beforeTo = (cursor.line < st.to.line) || (cursor.line === st.to.line && cursor.ch <= st.to.ch);
    if (afterFrom && beforeTo) {
      return i;
    }
  }

  for (let i = 0; i < sentences.length; i++) {
    if (sentences[i].from.line >= cursor.line) {
      return i;
    }
  }

  return 0;
}

function findSentenceIndexByText(query, sentences) {
  if (!query || !sentences || sentences.length === 0) return -1;
  const cleanQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
  if (cleanQuery.length < 3) return -1;

  for (let i = 0; i < sentences.length; i++) {
    const sClean = sentences[i].clean.toLowerCase();
    if (sClean.includes(cleanQuery) || cleanQuery.includes(sClean.slice(0, 20))) {
      return i;
    }
  }
  return -1;
}

class PiperTTSPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.ensureDefaultPaths();

    this.sessionId = 0;
    this.currentAudio = null;
    this.currentFile = null;
    this.sentences = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.activeChild = null;
    this.playerEl = null;

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar("Listo (Offline)");

    // Comando unificado: Reproducir / Pausar / Reanudar (Funciona en Edición y Lectura)
    this.addCommand({
      id: "play-pause-speech",
      name: "Escuchar / Pausar / Reanudar lectura",
      icon: "volume-2",
      checkCallback: (checking) => {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!activeView) return false;
        if (!checking) {
          this.handleUniversalPlayCommand(activeView);
        }
        return true;
      }
    });

    // Comando: Detener (Alt + D)
    this.addCommand({
      id: "stop-speech",
      name: "Detener lectura y cerrar reproductor",
      icon: "square",
      callback: () => {
        this.stopPlayback();
        new Notice("⏹️ Lectura detenida.");
      }
    });

    // Comando: Siguiente frase
    this.addCommand({
      id: "next-sentence",
      name: "Frase siguiente",
      icon: "skip-forward",
      callback: async () => {
        await this.skipSentence(1);
      }
    });

    // Comando: Frase anterior
    this.addCommand({
      id: "prev-sentence",
      name: "Frase anterior",
      icon: "skip-back",
      callback: async () => {
        await this.skipSentence(-1);
      }
    });

    // Comando: Reiniciar nota
    this.addCommand({
      id: "restart-reading",
      name: "Reiniciar nota desde el principio",
      icon: "rotate-ccw",
      callback: async () => {
        await this.restartNote();
      }
    });

    // Menú contextual en el editor
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) => {
          item
            .setTitle("🔊 Escuchar desde aquí con Piper")
            .setIcon("volume-2")
            .onClick(async () => {
              await this.startReadingSession(view, true);
            });
        });
      })
    );

    // Icono Ribbon (barra lateral izquierda)
    this.addRibbonIcon("volume-2", "Piper TTS Pro (Escuchar / Pausar)", async () => {
      const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (activeView) {
        await this.handleUniversalPlayCommand(activeView);
      } else {
        new Notice("Abre una nota en Obsidian para escucharla.");
      }
    });

    this.addSettingTab(new PiperSettingTab(this.app, this));
  }

  ensureDefaultPaths() {
    const pluginBaseDir = this.manifest && this.manifest.dir
      ? this.manifest.dir
      : (this.app.vault.adapter && this.app.vault.adapter.basePath
          ? path.join(this.app.vault.adapter.basePath, '.obsidian', 'plugins', this.manifest.id || 'piper-tts-pro')
          : '');

    if (!this.settings.piperExe) {
      const localExe = pluginBaseDir ? path.join(pluginBaseDir, 'piper', 'piper.exe') : '';
      const dirnameExe = (typeof __dirname !== 'undefined') ? path.join(__dirname, 'piper', 'piper.exe') : '';
      if (localExe && fs.existsSync(localExe)) {
        this.settings.piperExe = localExe;
      } else if (dirnameExe && fs.existsSync(dirnameExe)) {
        this.settings.piperExe = dirnameExe;
      } else if (fs.existsSync('C:\\Users\\Yilman\\.gemini\\piper\\piper.exe')) {
        this.settings.piperExe = 'C:\\Users\\Yilman\\.gemini\\piper\\piper.exe';
      }
    }

    if (!this.settings.modelsDir) {
      const localModels = pluginBaseDir ? path.join(pluginBaseDir, 'piper', 'models') : '';
      const dirnameModels = (typeof __dirname !== 'undefined') ? path.join(__dirname, 'piper', 'models') : '';
      if (localModels && fs.existsSync(localModels)) {
        this.settings.modelsDir = localModels;
      } else if (dirnameModels && fs.existsSync(dirnameModels)) {
        this.settings.modelsDir = dirnameModels;
      } else if (fs.existsSync('C:\\Users\\Yilman\\.gemini\\piper\\models')) {
        this.settings.modelsDir = 'C:\\Users\\Yilman\\.gemini\\piper\\models';
      }
    }
  }

  updateStatusBar(text) {
    if (this.statusBarItem) {
      this.statusBarItem.setText(`Piper: ${text}`);
    }
  }

  async handleUniversalPlayCommand(view) {
    if (this.isPlaying && !this.isPaused) {
      this.pausePlayback();
      return;
    }

    if (this.isPlaying && this.isPaused) {
      this.resumePlayback();
      return;
    }

    await this.startReadingSession(view, false);
  }

  async startReadingSession(view, forceCursor) {
    this.stopPlayback();

    const file = view.file;
    if (!file) {
      new Notice("No hay nota activa para leer.");
      return;
    }

    this.currentFile = file;

    // Obtener texto completo compatible con Modo Edición y Modo Lectura
    const text = (typeof view.getViewData === 'function')
      ? view.getViewData()
      : (view.editor ? view.editor.getValue() : await this.app.vault.read(file));

    this.sentences = parseSentences(text);
    if (this.sentences.length === 0) {
      new Notice("La nota no contiene texto legible para sintetizar.");
      return;
    }

    this.sessionId++;
    const currentSession = this.sessionId;

    // 1. Comprobar si el usuario seleccionó texto activamente (en Edición o en Lectura)
    let selectedText = "";
    const mode = view.getMode ? view.getMode() : 'source';

    if (mode === 'preview') {
      const winSel = window.getSelection();
      if (winSel) selectedText = winSel.toString().trim();
    } else if (view.editor) {
      selectedText = view.editor.getSelection().trim();
    }

    let targetIndex = 0;
    let startedFromSelection = false;

    if (selectedText.length >= 3) {
      const matchIdx = findSentenceIndexByText(selectedText, this.sentences);
      if (matchIdx !== -1) {
        targetIndex = matchIdx;
        startedFromSelection = true;
        new Notice(`🔊 Iniciando desde selección (frase ${targetIndex + 1} de ${this.sentences.length})...`, 2500);
      }
    }

    if (!startedFromSelection) {
      if (forceCursor && view.editor) {
        const cursor = view.editor.getCursor();
        targetIndex = findSentenceIndexAtCursor(cursor, this.sentences);
        new Notice(`🔊 Iniciando desde cursor (frase ${targetIndex + 1}/${this.sentences.length})...`, 2000);
      } else {
        // Comprobar memoria persistente para este fichero específico
        const saved = this.settings.progress[file.path];
        if (saved && typeof saved.index === 'number' && saved.index > 0 && saved.index < this.sentences.length) {
          targetIndex = saved.index;
          new Notice(`🔊 Reanudando "${file.basename}" desde frase ${targetIndex + 1}/${this.sentences.length} (${saved.percent}%)...`, 3000);
        } else {
          new Notice(`🔊 Iniciando lectura de "${file.basename}"...`, 2000);
        }
      }
    }

    this.currentIndex = targetIndex;
    this.isPlaying = true;
    this.isPaused = false;

    this.createFloatingPlayer(file.basename);
    await this.playCurrentSentence(currentSession);
  }

  async playCurrentSentence(session) {
    if (session !== this.sessionId || !this.isPlaying || this.isPaused) {
      return;
    }

    if (this.currentIndex >= this.sentences.length) {
      this.finishReading();
      return;
    }

    const currentSt = this.sentences[this.currentIndex];

    // 1. Resaltado Teleprompter adaptativo (Edición / Lectura)
    this.applyTeleprompter(currentSt);

    // 2. Guardar progreso de esta nota específica
    const percent = Math.round(((this.currentIndex + 1) / this.sentences.length) * 100);
    if (this.currentFile) {
      this.settings.progress[this.currentFile.path] = {
        index: this.currentIndex,
        total: this.sentences.length,
        percent: percent,
        timestamp: Date.now(),
        snippet: currentSt.snippet
      };
      await this.saveSettings();
    }

    // 3. Actualizar interfaz
    this.updatePlayerUI();

    // 4. Determinar modelo y locutor
    const voiceDef = VOICE_DEFINITIONS[this.settings.selectedVoice] || VOICE_DEFINITIONS['sharvard-female'];
    let modelPath = path.join(this.settings.modelsDir, voiceDef.modelFile);
    let speakerId = (typeof voiceDef.speaker === 'number') ? voiceDef.speaker : 0;

    // Fallback de modelo si no existe
    if (!fs.existsSync(modelPath)) {
      new Notice(`⚠️ Voz "${voiceDef.name}" no instalada en models/. Usando Sharvard Femenina.`);
      modelPath = path.join(this.settings.modelsDir, 'es_ES-sharvard-medium.onnx');
      speakerId = 1; // Usar siempre locutor femenino (1) para evitar que suene masculino por error
    }

    const tempDir = path.dirname(this.settings.piperExe) || process.cwd();
    const tempWav = path.join(tempDir, `piper_tmp_${Date.now()}.wav`);

    try {
      await this.synthesizeText(currentSt.clean, modelPath, speakerId, tempWav, session);

      if (session !== this.sessionId || !this.isPlaying || this.isPaused) {
        try { fs.unlinkSync(tempWav); } catch (e) {}
        return;
      }

      if (!fs.existsSync(tempWav)) {
        this.skipSentence(1);
        return;
      }

      const wavBuffer = fs.readFileSync(tempWav);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      const blobUrl = URL.createObjectURL(blob);

      if (this.currentAudio) {
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.pause();
        this.currentAudio.src = "";
      }

      this.currentAudio = new Audio(blobUrl);

      // Aplicar velocidad con preservación de tono en tiempo real
      this.currentAudio.preservesPitch = true;
      this.currentAudio.playbackRate = this.settings.playbackSpeed || 1.0;

      this.currentAudio.onended = async () => {
        try { fs.unlinkSync(tempWav); } catch (e) {}
        if (session !== this.sessionId || !this.isPlaying || this.isPaused) return;

        if (this.currentIndex + 1 >= this.sentences.length) {
          this.finishReading();
          return;
        }

        this.currentIndex++;
        await this.playCurrentSentence(session);
      };

      this.currentAudio.onerror = (e) => {
        try { fs.unlinkSync(tempWav); } catch (e) {}
        if (session !== this.sessionId || !this.isPlaying) return;

        if (this.currentIndex + 1 >= this.sentences.length) {
          this.finishReading();
        } else {
          this.skipSentence(1);
        }
      };

      await this.currentAudio.play();
      this.updateStatusBar(`Frase ${this.currentIndex + 1}/${this.sentences.length} (${this.settings.playbackSpeed}x)`);

    } catch (err) {
      if (session === this.sessionId && this.isPlaying) {
        console.error("Error en playCurrentSentence:", err);
        if (this.currentIndex + 1 >= this.sentences.length) {
          this.finishReading();
        } else {
          this.skipSentence(1);
        }
      }
    }
  }

  synthesizeText(text, modelPath, speakerId, outputPath, session) {
    return new Promise((resolve, reject) => {
      if (session !== this.sessionId) {
        resolve();
        return;
      }

      const args = [
        '--model', modelPath,
        '--output_file', outputPath,
        '--speaker', String(speakerId),
        '--length_scale', '1.0',
        '--sentence_silence', String(this.settings.sentenceSilence)
      ];

      this.activeChild = spawn(this.settings.piperExe, args);
      this.activeChild.stdin.write(text, 'utf8');
      this.activeChild.stdin.end();

      this.activeChild.on('close', (code) => {
        this.activeChild = null;
        if (code === 0) resolve();
        else reject(new Error(`Piper exited with code ${code}`));
      });

      this.activeChild.on('error', (err) => {
        this.activeChild = null;
        reject(err);
      });
    });
  }

  // --- TELEPROMPTER UNIVERSAL (EDICIÓN Y LECTURA) ---
  applyTeleprompter(sentence) {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return;

    const mode = activeView.getMode ? activeView.getMode() : 'source';

    if (mode === 'preview') {
      this.highlightInReadingMode(activeView, sentence.clean);
    } else if (activeView.editor) {
      this.highlightInEditMode(activeView, sentence);
    }
  }

  highlightInEditMode(view, sentence) {
    this.clearReadingHighlights();
    const editor = view.editor;
    if (!editor) return;

    editor.setSelection(sentence.from, sentence.to);
    editor.scrollIntoView({ from: sentence.from, to: sentence.to }, true);
  }

  highlightInReadingMode(view, targetText) {
    this.clearReadingHighlights();

    const containerEl = view.previewMode ? view.previewMode.containerEl : view.contentEl;
    if (!containerEl || !targetText) return;

    const target = targetText.trim().replace(/\s+/g, ' ');
    if (target.length === 0) return;

    // Buscar en bloques HTML renderizados
    const blocks = containerEl.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td');
    let matchedRange = null;

    for (const block of Array.from(blocks)) {
      const blockText = block.textContent.replace(/\s+/g, ' ');
      if (blockText.includes(target)) {
        matchedRange = this.createRangeInElement(block, target);
        if (matchedRange) break;
      }
    }

    // Estrategia de respaldo: primeros 25 caracteres para evitar discrepancias de puntuación
    if (!matchedRange && target.length > 25) {
      const snippet = target.slice(0, 25);
      for (const block of Array.from(blocks)) {
        const blockText = block.textContent.replace(/\s+/g, ' ');
        if (blockText.includes(snippet)) {
          matchedRange = this.createRangeInElement(block, snippet);
          if (matchedRange) break;
        }
      }
    }

    if (matchedRange) {
      const mark = document.createElement('mark');
      mark.className = 'piper-teleprompter-highlight';
      try {
        matchedRange.surroundContents(mark);
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        // Si el rango cruza etiquetas anidadas, resaltar el contenedor directo
        const parent = matchedRange.startContainer.parentElement;
        if (parent) {
          parent.classList.add('piper-teleprompter-highlight');
          parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }
  }

  createRangeInElement(element, searchText) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let node;
    let accumulated = '';
    const textNodes = [];

    while ((node = walker.nextNode())) {
      const startIdx = accumulated.length;
      accumulated += node.textContent;
      const endIdx = accumulated.length;
      textNodes.push({ node, startIdx, endIdx, len: node.textContent.length });
    }

    const matchStart = accumulated.indexOf(searchText);
    if (matchStart === -1) return null;
    const matchEnd = matchStart + searchText.length;

    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;

    for (const item of textNodes) {
      if (!startNode && matchStart >= item.startIdx && matchStart < item.endIdx) {
        startNode = item.node;
        startOffset = matchStart - item.startIdx;
      }
      if (!endNode && matchEnd > item.startIdx && matchEnd <= item.endIdx) {
        endNode = item.node;
        endOffset = matchEnd - item.startIdx;
      }
    }

    if (startNode && endNode) {
      const range = document.createRange();
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      return range;
    }

    return null;
  }

  clearReadingHighlights() {
    const activeMarks = document.querySelectorAll('mark.piper-teleprompter-highlight');
    activeMarks.forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        while (m.firstChild) {
          parent.insertBefore(m.firstChild, m);
        }
        parent.removeChild(m);
      }
    });

    const activeClasses = document.querySelectorAll('.piper-teleprompter-highlight');
    activeClasses.forEach((el) => {
      if (el.tagName !== 'MARK') {
        el.classList.remove('piper-teleprompter-highlight');
      }
    });
  }

  pausePlayback() {
    this.isPaused = true;
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    this.updateStatusBar("Pausado");
    this.updatePlayerUI();
  }

  resumePlayback() {
    this.isPaused = false;
    if (this.currentAudio) {
      this.currentAudio.play();
    }
    this.updateStatusBar(`Frase ${this.currentIndex + 1}/${this.sentences.length} (${this.settings.playbackSpeed}x)`);
    this.updatePlayerUI();
  }

  stopPlayback() {
    this.sessionId++;
    this.isPlaying = false;
    this.isPaused = false;

    if (this.activeChild) {
      try { this.activeChild.kill(); } catch (e) {}
      this.activeChild = null;
    }

    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch (e) {}
      this.currentAudio = null;
    }

    this.clearReadingHighlights();
    this.removeFloatingPlayer();
    this.updateStatusBar("Listo (Offline)");
  }

  async skipSentence(direction) {
    if (!this.sentences || this.sentences.length === 0) return;

    const nextIndex = this.currentIndex + direction;
    if (nextIndex >= this.sentences.length) {
      this.finishReading();
      return;
    }

    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch (e) {}
      this.currentAudio = null;
    }

    this.sessionId++;
    const currentSession = this.sessionId;
    this.currentIndex = Math.max(0, nextIndex);
    this.isPlaying = true;
    this.isPaused = false;

    await this.playCurrentSentence(currentSession);
  }

  async restartNote() {
    this.currentIndex = 0;
    if (this.currentFile) {
      this.settings.progress[this.currentFile.path] = {
        index: 0,
        total: this.sentences.length,
        percent: 0,
        timestamp: Date.now(),
        snippet: this.sentences[0] ? this.sentences[0].snippet : ""
      };
      await this.saveSettings();
    }
    new Notice("🔄 Reiniciando nota desde el principio.");
    await this.skipSentence(0);
  }

  async cycleVoice() {
    const keys = Object.keys(VOICE_DEFINITIONS);
    let idx = keys.indexOf(this.settings.selectedVoice);
    let nextIdx = idx;
    let attempts = 0;

    // Buscar la siguiente voz disponible en disco
    do {
      nextIdx = (nextIdx + 1) % keys.length;
      attempts++;
      const candidate = keys[nextIdx];
      const candidatePath = path.join(this.settings.modelsDir, VOICE_DEFINITIONS[candidate].modelFile);
      if (fs.existsSync(candidatePath)) {
        break;
      }
    } while (attempts < keys.length);

    this.settings.selectedVoice = keys[nextIdx];
    await this.saveSettings();

    const def = VOICE_DEFINITIONS[keys[nextIdx]];
    new Notice(`🗣️ Voz: ${def.name}`);
    this.updatePlayerUI();

    if (this.isPlaying && !this.isPaused) {
      await this.skipSentence(0);
    }
  }

  async cycleSpeed() {
    let nextIdx = SPEED_OPTIONS.indexOf(this.settings.playbackSpeed) + 1;
    if (nextIdx >= SPEED_OPTIONS.length) nextIdx = 0;

    this.settings.playbackSpeed = SPEED_OPTIONS[nextIdx];
    await this.saveSettings();

    // Actualización inmediata en tiempo real del audio que está sonando
    if (this.currentAudio) {
      this.currentAudio.playbackRate = this.settings.playbackSpeed;
    }

    new Notice(`⚡ Velocidad: ${this.settings.playbackSpeed}x`);
    this.updatePlayerUI();
  }

  finishReading() {
    this.stopPlayback();
    new Notice("✅ Lectura de la nota completada.", 4000);
    if (this.currentFile) {
      // Reiniciar progreso al 0% para la siguiente sesión
      this.settings.progress[this.currentFile.path] = {
        index: 0,
        total: this.sentences.length,
        percent: 100,
        timestamp: Date.now()
      };
      this.saveSettings();
    }
  }

  // --- REPRODUCTOR FLOTANTE AUTÓNOMO ---
  createFloatingPlayer(title) {
    this.removeFloatingPlayer();

    this.playerEl = document.createElement("div");
    this.playerEl.className = "piper-floating-player";

    // Cabecera arrastrable
    const header = this.playerEl.createDiv({ cls: "piper-player-header" });
    const titleSpan = header.createSpan({ cls: "piper-player-note-title" });
    titleSpan.setText(`🎧 ${title}`);

    const closeBtn = header.createEl("button", { text: "✕", cls: "piper-player-close" });
    closeBtn.title = "Cerrar reproductor (Alt + D)";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.stopPlayback();
    };

    this.makeDraggable(this.playerEl, header);

    // Barra de progreso interactiva (Seek Bar)
    const progressContainer = this.playerEl.createDiv({ cls: "piper-progress-container" });
    const progressInfo = progressContainer.createDiv({ cls: "piper-progress-info" });
    this.progressTextEl = progressInfo.createSpan({ text: "Cargando..." });
    this.progressPercentEl = progressInfo.createSpan({ text: "0%" });

    const track = progressContainer.createDiv({ cls: "piper-progress-track" });
    this.progressBarEl = track.createDiv({ cls: "piper-progress-fill" });
    track.title = "Haz clic en cualquier punto para saltar a esa frase";
    track.onclick = (e) => {
      e.stopPropagation();
      if (!this.sentences || this.sentences.length === 0) return;
      const rect = track.getBoundingClientRect();
      const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.currentIndex = Math.floor(clickRatio * this.sentences.length);
      this.skipSentence(0);
    };

    // Fila de controles
    const controls = this.playerEl.createDiv({ cls: "piper-controls-row" });
    const mainBtns = controls.createDiv({ cls: "piper-buttons-main" });

    // Botón Anterior
    const prevBtn = mainBtns.createEl("button", { text: "⏮️", cls: "piper-btn" });
    prevBtn.title = "Frase anterior (Alt + Flecha Izquierda)";
    prevBtn.onclick = (e) => {
      e.stopPropagation();
      this.skipSentence(-1);
    };

    // Botón Play / Pausa autónomo
    this.playBtnEl = mainBtns.createEl("button", { text: "⏸️", cls: "piper-btn piper-btn-play" });
    this.playBtnEl.title = "Play / Pausa (Alt + E)";
    this.playBtnEl.onclick = (e) => {
      e.stopPropagation();
      if (this.isPlaying) {
        if (this.isPaused) {
          this.resumePlayback();
        } else {
          this.pausePlayback();
        }
      } else {
        const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (activeView) {
          this.startReadingSession(activeView, false);
        }
      }
    };

    // Botón Siguiente
    const nextBtn = mainBtns.createEl("button", { text: "⏭️", cls: "piper-btn" });
    nextBtn.title = "Frase siguiente (Alt + Flecha Derecha)";
    nextBtn.onclick = (e) => {
      e.stopPropagation();
      this.skipSentence(1);
    };

    // Botón Reiniciar
    const restartBtn = mainBtns.createEl("button", { text: "🔄", cls: "piper-btn" });
    restartBtn.title = "Reiniciar esta nota desde el principio";
    restartBtn.onclick = (e) => {
      e.stopPropagation();
      this.restartNote();
    };

    // Botones secundarios (Voz y Velocidad)
    const secondaryBtns = controls.createDiv({ cls: "piper-buttons-secondary" });

    this.voiceBtnEl = secondaryBtns.createEl("button", { cls: "piper-badge-btn" });
    this.voiceBtnEl.title = "Clic para cambiar la voz del lector";
    this.voiceBtnEl.onclick = (e) => {
      e.stopPropagation();
      this.cycleVoice();
    };

    this.speedBtnEl = secondaryBtns.createEl("button", { cls: "piper-badge-btn" });
    this.speedBtnEl.title = "Clic para cambiar velocidad (hasta 2.5x al instante)";
    this.speedBtnEl.onclick = (e) => {
      e.stopPropagation();
      this.cycleSpeed();
    };

    document.body.appendChild(this.playerEl);
    this.updatePlayerUI();
  }

  makeDraggable(element, handle) {
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.onmousedown = (e) => {
      if (e.target.tagName === "BUTTON") return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      const onMouseMove = (moveEvent) => {
        if (!isDragging) return;
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const maxLeft = window.innerWidth - element.offsetWidth - 10;
        const maxTop = window.innerHeight - element.offsetHeight - 10;
        const newLeft = Math.max(10, Math.min(maxLeft, initialLeft + deltaX));
        const newTop = Math.max(10, Math.min(maxTop, initialTop + deltaY));

        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
        element.style.right = "auto";
        element.style.bottom = "auto";
      };

      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };
  }

  updatePlayerUI() {
    if (!this.playerEl) return;

    const total = this.sentences.length || 1;
    const current = Math.min(total, this.currentIndex + 1);
    const percent = Math.round((current / total) * 100);

    if (this.progressTextEl) {
      this.progressTextEl.setText(`Frase ${current} de ${total}`);
    }
    if (this.progressPercentEl) {
      this.progressPercentEl.setText(`${percent}%`);
    }
    if (this.progressBarEl) {
      this.progressBarEl.style.width = `${percent}%`;
    }
    if (this.playBtnEl) {
      this.playBtnEl.setText(this.isPaused ? "▶️" : "⏸️");
    }
    if (this.voiceBtnEl) {
      const vDef = VOICE_DEFINITIONS[this.settings.selectedVoice] || VOICE_DEFINITIONS['sharvard-female'];
      this.voiceBtnEl.setText(vDef.badge);
    }
    if (this.speedBtnEl) {
      this.speedBtnEl.setText(`${this.settings.playbackSpeed}x`);
    }
  }

  removeFloatingPlayer() {
    if (this.playerEl) {
      this.playerEl.remove();
      this.playerEl = null;
    }
  }

  onunload() {
    this.stopPlayback();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class PiperSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Piper TTS Pro (Offline, Teleprompter y Memoria)" });

    new Setting(containerEl)
      .setName("Voz neuronal por defecto")
      .setDesc("Selecciona el locutor neuronal para la lectura")
      .addDropdown((dropdown) => {
        for (const [key, val] of Object.entries(VOICE_DEFINITIONS)) {
          dropdown.addOption(key, val.name);
        }
        dropdown.setValue(this.plugin.settings.selectedVoice);
        dropdown.onChange(async (val) => {
          this.plugin.settings.selectedVoice = val;
          await this.plugin.saveSettings();
          this.plugin.updatePlayerUI();
        });
      });

    new Setting(containerEl)
      .setName("Velocidad de reproducción")
      .setDesc("Velocidad de habla con preservación de tono natural (0.75x a 2.5x)")
      .addDropdown((dropdown) => {
        for (const spd of SPEED_OPTIONS) {
          dropdown.addOption(String(spd), `${spd}x`);
        }
        dropdown.setValue(String(this.plugin.settings.playbackSpeed));
        dropdown.onChange(async (val) => {
          this.plugin.settings.playbackSpeed = parseFloat(val);
          if (this.plugin.currentAudio) {
            this.plugin.currentAudio.playbackRate = this.plugin.settings.playbackSpeed;
          }
          await this.plugin.saveSettings();
          this.plugin.updatePlayerUI();
        });
      });

    new Setting(containerEl)
      .setName("Ruta a piper.exe")
      .setDesc("Ruta absoluta al ejecutable de Piper (se detecta automáticamente si está vacío)")
      .addText((text) => {
        text
          .setPlaceholder("C:\\ruta\\a\\piper.exe")
          .setValue(this.plugin.settings.piperExe || "")
          .onChange(async (val) => {
            this.plugin.settings.piperExe = val.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Carpeta de modelos neuronales")
      .setDesc("Directorio con los archivos .onnx y .json de los modelos")
      .addText((text) => {
        text
          .setPlaceholder("C:\\ruta\\a\\modelos")
          .setValue(this.plugin.settings.modelsDir || "")
          .onChange(async (val) => {
            this.plugin.settings.modelsDir = val.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Pausa entre oraciones")
      .setDesc("Segundos de silencio entre oraciones sintetizadas (recomendado: 0.15s)")
      .addText((text) => {
        text
          .setPlaceholder("0.15")
          .setValue(String(this.plugin.settings.sentenceSilence || 0.15))
          .onChange(async (val) => {
            const num = parseFloat(val);
            if (!isNaN(num)) {
              this.plugin.settings.sentenceSilence = num;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Limpiar memoria de lectura")
      .setDesc("Elimina el historial de posiciones de lectura guardadas de todas las notas")
      .addButton((btn) => {
        btn
          .setButtonText("Limpiar historial")
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.progress = {};
            await this.plugin.saveSettings();
            new Notice("Historial de lectura borrado correctamente.");
          });
      });
  }
}

module.exports = PiperTTSPlugin;
