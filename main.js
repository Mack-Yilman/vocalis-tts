const { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, ItemView, TFile, setIcon } = require('obsidian');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];
const VIEW_TYPE_PLAYER = 'vocalis-player';
const LANGUAGES = { es: 'Español', en: 'English' };

// Femeninas primero en cada idioma: la primera instalada sirve de respaldo
const VOICE_DEFINITIONS = {
  'sharvard-female': {
    name: 'Sharvard 👩 (España - Femenina)',
    modelFile: 'es_ES-sharvard-medium.onnx',
    speaker: 1,
    lang: 'es',
    badge: '👩 Sharvard (ES)'
  },
  'daniela': {
    name: 'Daniela 👩 (Argentina - Femenina High)',
    modelFile: 'es_AR-daniela-high.onnx',
    speaker: 0,
    lang: 'es',
    badge: '👩 Daniela (AR)'
  },
  'sharvard-male': {
    name: 'Sharvard 👨 (España - Masculina)',
    modelFile: 'es_ES-sharvard-medium.onnx',
    speaker: 0,
    lang: 'es',
    badge: '👨 Sharvard (ES)'
  },
  'davefx': {
    name: 'Davefx 👨 (España - Masculina)',
    modelFile: 'es_ES-davefx-medium.onnx',
    speaker: 0,
    lang: 'es',
    badge: '👨 Davefx (ES)'
  },
  'lessac': {
    name: 'Lessac 👩 (US English - Female)',
    modelFile: 'en_US-lessac-medium.onnx',
    speaker: 0,
    lang: 'en',
    badge: '👩 Lessac (US)'
  },
  'ryan': {
    name: 'Ryan 👨 (US English - Male)',
    modelFile: 'en_US-ryan-medium.onnx',
    speaker: 0,
    lang: 'en',
    badge: '👨 Ryan (US)'
  }
};

const DEFAULT_SETTINGS = {
  piperExe: '',
  modelsDir: '',
  language: 'es',
  voiceByLang: { es: 'sharvard-female', en: 'lessac' },
  playbackSpeed: 1.0,
  sentenceSilence: 0.02, // 0.02s para transiciones naturales sin pausas artificiales
  progress: {} // { [filePath]: { index, total, percent, timestamp, snippet } }
};

function getLineCh(text, charIndex) {
  const lines = text.slice(0, charIndex).split('\n');
  const line = lines.length - 1;
  const ch = lines[lines.length - 1].length;
  return { line, ch };
}

function parseSentences(fullText, lang = 'es') {
  if (!fullText) return [];

  // Omitir cabecera YAML Frontmatter
  const fmMatch = fullText.match(/^---[\s\S]*?---\n*/);
  const fmOffset = fmMatch ? fmMatch[0].length : 0;
  // URLs a espacios del mismo largo antes de segmentar: sus "?" y "." partirían la frase, y las posiciones no se desplazan
  const bodyText = fullText.slice(fmOffset).replace(/https?:\/\/[^\s)>\]]+/g, (url) => ' '.repeat(url.length));

  const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
  const rawSegments = Array.from(segmenter.segment(bodyText));

  const sentences = [];
  for (const s of rawSegments) {
    const rawSeg = s.segment;
    const leadingWsMatch = rawSeg.match(/^\s+/);
    const leadingWs = leadingWsMatch ? leadingWsMatch[0].length : 0;
    const trailingWsMatch = rawSeg.match(/\s+$/);
    const trailingWs = trailingWsMatch ? trailingWsMatch[0].length : 0;

    const trimmedSeg = rawSeg.trim();
    if (!trimmedSeg) continue;

    const segmentStart = fmOffset + s.index + leadingWs;
    const segmentEnd = fmOffset + s.index + rawSeg.length - trailingWs;

    // Limpieza de formato markdown para síntesis auditiva pura
    let clean = trimmedSeg
      .replace(/```[\s\S]*?```/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^>\s*\[![A-Za-z0-9_-]+\]\s*/gm, '')
      .replace(/\[![A-Za-z0-9_-]+\]/g, '')
      .replace(/^[A-Za-z0-9_-]+\]/g, '')
      .replace(/[*_~`]/g, '')
      .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/!\[\[[^\]]*\]\]/g, '')
      .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
      .replace(/^>\s*/gm, '')
      .replace(/^[-*+]\s+/gm, '')
      // Celdas de tabla separadas por pausas; la fila |---| queda sin letras y se descarta abajo
      .replace(/\s*\|\s*/g, ', ')
      .replace(/\s+/g, ' ')
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .replace(/(,\s*)+,/g, ',')
      .trim();

    // Comprobar que tenga al menos un caracter alfanumérico
    if (clean.length > 0 && /[a-zA-Z0-9\u00C0-\u017F]/.test(clean)) {
      const from = getLineCh(fullText, segmentStart);
      const to = getLineCh(fullText, segmentEnd);
      sentences.push({
        raw: trimmedSeg,
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

class VocalisTTSPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.ensureDefaultPaths();

    this.sessionId = 0;
    this.currentAudio = null;
    this.currentBlobUrl = null;
    this.currentFile = null;
    this.sentences = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.activeChild = null;
    this.prefetchChild = null;
    this.prefetchIndex = null;
    this.audioCache = new Map();
    this.sessionLang = this.settings.language;
    this.playerEl = null;

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar("Listo (Offline)");

    this.registerView(VIEW_TYPE_PLAYER, (leaf) => new VocalisPlayerView(leaf, this));

    // Re-aplicar teleprompter si el usuario cambia entre Modo Edición y Modo Lectura o enfoca otra nota
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.isPlaying && this.sentences && this.sentences[this.currentIndex]) {
          this.applyTeleprompter(this.sentences[this.currentIndex]);
        }
      })
    );

    // La memoria de lectura se indexa por ruta: seguir renombrados y limpiar borrados
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        if (!this.settings.progress[oldPath]) return;
        this.settings.progress[file.path] = this.settings.progress[oldPath];
        delete this.settings.progress[oldPath];
        await this.saveSettings();
        this.updatePlayerUI();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", async (file) => {
        if (!this.settings.progress[file.path]) return;
        delete this.settings.progress[file.path];
        await this.saveSettings();
        this.updatePlayerUI();
      })
    );

    // Comando unificado: Reproducir / Pausar / Reanudar (Funciona en Edición y Lectura)
    this.addCommand({
      id: "play-pause-speech",
      name: "Escuchar / Pausar / Reanudar lectura",
      icon: "volume-2",
      checkCallback: (checking) => {
        const targetView = this.getTargetMarkdownView();
        if (!targetView) return false;
        if (!checking) {
          this.handleUniversalPlayCommand(targetView);
        }
        return true;
      }
    });

    this.addCommand({
      id: "open-player-panel",
      name: "Abrir panel de Vocalis",
      icon: "headphones",
      callback: () => this.activatePlayerView()
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
            .setTitle("🔊 Escuchar desde aquí con Vocalis")
            .setIcon("volume-2")
            .onClick(async () => {
              await this.startReadingSession(view, true);
            });
        });
      })
    );

    // Icono Ribbon (barra lateral izquierda)
    this.addRibbonIcon("volume-2", "Vocalis TTS (Escuchar / Pausar)", async () => {
      const targetView = this.getTargetMarkdownView();
      if (targetView) {
        await this.handleUniversalPlayCommand(targetView);
      } else {
        new Notice("Abre una nota en Obsidian para escucharla.");
      }
    });

    this.addSettingTab(new VocalisSettingTab(this.app, this));
  }

  ensureDefaultPaths() {
    // manifest.dir es relativo al vault (".obsidian/plugins/vocalis-tts"): hay que anteponer la ruta del vault
    const adapter = this.app.vault.adapter;
    const vaultBase = adapter && typeof adapter.getBasePath === 'function' ? adapter.getBasePath() : '';
    const pluginBaseDir = vaultBase && this.manifest.dir ? path.join(vaultBase, this.manifest.dir) : '';
    if (!pluginBaseDir) return;

    const localExe = path.join(pluginBaseDir, 'piper', 'piper.exe');
    if ((!this.settings.piperExe || !fs.existsSync(this.settings.piperExe)) && fs.existsSync(localExe)) {
      this.settings.piperExe = localExe;
    }

    const localModels = path.join(pluginBaseDir, 'piper', 'models');
    if ((!this.settings.modelsDir || !fs.existsSync(this.settings.modelsDir)) && fs.existsSync(localModels)) {
      this.settings.modelsDir = localModels;
    }
  }

  // Vista de la nota que se está leyendo; si no hay lectura, la última nota usada.
  // No se usa getActiveViewOfType: al hacer clic en el panel lateral, la hoja activa deja de ser la nota.
  getTargetMarkdownView() {
    if (this.currentFile) {
      for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
        if (leaf.view instanceof MarkdownView && leaf.view.file && leaf.view.file.path === this.currentFile.path) {
          return leaf.view;
        }
      }
    }
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (active) return active;
    const recent = this.app.workspace.getMostRecentLeaf();
    return recent && recent.view instanceof MarkdownView ? recent.view : null;
  }

  async activatePlayerView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_PLAYER)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: VIEW_TYPE_PLAYER, active: false });
    }
    workspace.revealLeaf(leaf);
  }

  isVoiceInstalled(key) {
    const def = VOICE_DEFINITIONS[key];
    return !!def && !!this.settings.modelsDir && fs.existsSync(path.join(this.settings.modelsDir, def.modelFile));
  }

  // Voz elegida para el idioma; si su modelo no está en disco, la primera instalada del mismo idioma
  getVoiceFor(lang) {
    const chosen = this.settings.voiceByLang[lang];
    if (this.isVoiceInstalled(chosen)) return chosen;
    return Object.keys(VOICE_DEFINITIONS).find((k) => VOICE_DEFINITIONS[k].lang === lang && this.isVoiceInstalled(k)) || null;
  }

  getNoteLanguage(file) {
    const cache = file ? this.app.metadataCache.getFileCache(file) : null;
    const fmLang = cache && cache.frontmatter && cache.frontmatter.lang;
    const code = typeof fmLang === 'string' ? fmLang.trim().slice(0, 2).toLowerCase() : '';
    return LANGUAGES[code] ? code : this.settings.language;
  }

  updateStatusBar(text) {
    if (this.statusBarItem) {
      this.statusBarItem.setText(`Vocalis: ${text}`);
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

    this.sessionLang = this.getNoteLanguage(file);
    this.fallbackNoticed = false;
    this.sentences = parseSentences(text, this.sessionLang);
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

    await this.activatePlayerView();
    this.updatePlayerUI();
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

    // 1. Guardar progreso de esta nota específica
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

    // 2. Actualizar interfaz
    this.updatePlayerUI();

    // 3. Determinar modelo y locutor
    const voiceKey = this.getVoiceFor(this.sessionLang);
    if (!voiceKey) {
      new Notice(`⚠️ No hay voces de ${LANGUAGES[this.sessionLang]} instaladas en la carpeta de modelos.`);
      this.stopPlayback();
      return;
    }
    if (voiceKey !== this.settings.voiceByLang[this.sessionLang] && !this.fallbackNoticed) {
      this.fallbackNoticed = true;
      new Notice(`⚠️ La voz elegida no está instalada. Usando ${VOICE_DEFINITIONS[voiceKey].name}.`);
    }
    const voiceDef = VOICE_DEFINITIONS[voiceKey];
    const modelPath = path.join(this.settings.modelsDir, voiceDef.modelFile);
    const speakerId = voiceDef.speaker;

    let blobUrlToPlay = null;

    // Verificar si la frase ya fue pre-sintetizada en caché (look-ahead)
    if (this.audioCache && this.audioCache.has(this.currentIndex)) {
      const cached = this.audioCache.get(this.currentIndex);
      this.audioCache.delete(this.currentIndex);
      blobUrlToPlay = cached.blobUrl;
    } else {
      // Síntesis a archivo temporal efímero en modo binario nativo
      const tempWav = path.join(os.tmpdir(), `vocalis_${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 7)}.wav`);
      try {
        await this.synthesizeText(currentSt.clean, modelPath, speakerId, tempWav, session);

        if (session !== this.sessionId || !this.isPlaying || this.isPaused) {
          return;
        }

        if (!fs.existsSync(tempWav)) {
          this.skipSentence(1);
          return;
        }

        const wavBuffer = fs.readFileSync(tempWav);
        try { fs.unlinkSync(tempWav); } catch (e) {}

        if (!wavBuffer || wavBuffer.length === 0) {
          this.skipSentence(1);
          return;
        }

        const blob = new Blob([wavBuffer], { type: 'audio/wav' });
        blobUrlToPlay = URL.createObjectURL(blob);
      } catch (err) {
        if (session === this.sessionId && this.isPlaying) {
          console.error("Error en playCurrentSentence:", err);
          if (this.currentIndex + 1 >= this.sentences.length) {
            this.finishReading();
          } else {
            this.skipSentence(1);
          }
        }
        return;
      } finally {
        try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch (e) {}
      }
    }

    if (session !== this.sessionId || !this.isPlaying || this.isPaused) {
      if (blobUrlToPlay) {
        try { URL.revokeObjectURL(blobUrlToPlay); } catch (e) {}
      }
      return;
    }

    if (this.currentBlobUrl && this.currentBlobUrl !== blobUrlToPlay) {
      try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
    }
    this.currentBlobUrl = blobUrlToPlay;

    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch (e) {}
    }

    this.currentAudio = new Audio(this.currentBlobUrl);
    this.currentAudio.preservesPitch = true;
    this.currentAudio.playbackRate = this.settings.playbackSpeed || 1.0;

    // Sincronizar el teleprompter en cuanto comienza a emitirse sonido
    this.currentAudio.onplay = () => {
      if (session === this.sessionId && this.isPlaying) {
        this.applyTeleprompter(currentSt);
      }
    };

    this.currentAudio.onended = async () => {
      if (session !== this.sessionId || !this.isPlaying || this.isPaused) return;

      if (this.currentIndex + 1 >= this.sentences.length) {
        this.finishReading();
        return;
      }

      this.currentIndex++;
      await this.playCurrentSentence(session);
    };

    this.currentAudio.onerror = (e) => {
      if (session !== this.sessionId || !this.isPlaying) return;

      if (this.currentIndex + 1 >= this.sentences.length) {
        this.finishReading();
      } else {
        this.skipSentence(1);
      }
    };

    try {
      await this.currentAudio.play();
      this.applyTeleprompter(currentSt);
      this.updateStatusBar(`Frase ${this.currentIndex + 1}/${this.sentences.length} (${this.settings.playbackSpeed}x)`);

      // 4. Lanzar PREFETCH asíncrono para la frase siguiente (i + 1)
      const nextIndex = this.currentIndex + 1;
      if (nextIndex < this.sentences.length) {
        this.prefetchNextSentence(nextIndex, modelPath, speakerId, session);
      }
    } catch (err) {
      // AbortError: una pausa interrumpió play(); no es un fallo y no debe saltar la frase
      if (err && err.name === 'AbortError') return;
      console.error("Error al iniciar reproducción:", err);
      if (session === this.sessionId && this.isPlaying) {
        this.skipSentence(1);
      }
    }
  }

  async prefetchNextSentence(index, modelPath, speakerId, session) {
    if (session !== this.sessionId || !this.isPlaying || this.isPaused) return;
    if (index >= this.sentences.length) return;
    if (this.audioCache && this.audioCache.has(index)) return;
    if (this.prefetchIndex === index && this.prefetchChild) return;

    // Limpiar caché vieja si acumula más de 2 audios
    if (this.audioCache && this.audioCache.size >= 2) {
      for (const [k, v] of this.audioCache.entries()) {
        try { URL.revokeObjectURL(v.blobUrl); } catch (e) {}
        this.audioCache.delete(k);
        break;
      }
    }

    const nextSt = this.sentences[index];
    if (!nextSt || !nextSt.clean) return;

    this.prefetchIndex = index;
    const tempWav = path.join(os.tmpdir(), `vocalis_prefetch_${Date.now()}_${process.pid}_${Math.random().toString(36).slice(2, 7)}.wav`);

    try {
      await new Promise((resolve, reject) => {
        if (session !== this.sessionId) {
          resolve();
          return;
        }

        const args = [
          '--model', modelPath,
          '--output_file', tempWav,
          '--speaker', String(speakerId),
          '--length_scale', '1.0',
          '--sentence_silence', String(this.settings.sentenceSilence || 0.02)
        ];

        const child = spawn(this.settings.piperExe, args, { stdio: ['pipe', 'ignore', 'pipe'] });
        this.prefetchChild = child;

        child.stdin.write(nextSt.clean, 'utf8');
        child.stdin.end();

        child.on('close', (code) => {
          this.prefetchChild = null;
          if (code === 0) resolve();
          else reject(new Error(`Prefetch Piper code ${code}`));
        });

        child.on('error', (err) => {
          this.prefetchChild = null;
          reject(err);
        });
      });

      if (session !== this.sessionId || !this.isPlaying) {
        try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch (e) {}
        return;
      }

      if (fs.existsSync(tempWav)) {
        const buf = fs.readFileSync(tempWav);
        try { fs.unlinkSync(tempWav); } catch (e) {}

        if (buf && buf.length > 0) {
          const blob = new Blob([buf], { type: 'audio/wav' });
          const blobUrl = URL.createObjectURL(blob);
          if (this.audioCache) {
            this.audioCache.set(index, { blobUrl });
          }
        }
      }
    } catch (err) {
      try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch (e) {}
    } finally {
      if (this.prefetchIndex === index) {
        this.prefetchIndex = null;
      }
    }
  }

  clearAudioCache() {
    if (this.prefetchChild) {
      try { this.prefetchChild.kill(); } catch (e) {}
      this.prefetchChild = null;
    }
    this.prefetchIndex = null;

    if (this.audioCache) {
      for (const [_, v] of this.audioCache.entries()) {
        if (v && v.blobUrl) {
          try { URL.revokeObjectURL(v.blobUrl); } catch (e) {}
        }
      }
      this.audioCache.clear();
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
        '--sentence_silence', String(this.settings.sentenceSilence || 0.02)
      ];

      const child = spawn(this.settings.piperExe, args, { stdio: ['pipe', 'ignore', 'pipe'] });
      this.activeChild = child;

      child.stdin.write(text, 'utf8');
      child.stdin.end();

      child.on('close', (code) => {
        this.activeChild = null;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Piper exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        this.activeChild = null;
        reject(err);
      });
    });
  }

  // --- TELEPROMPTER UNIVERSAL (EDICIÓN Y LECTURA) ---
  applyTeleprompter(sentence) {
    if (!sentence) return;
    const activeView = this.getTargetMarkdownView();
    if (!activeView || !this.currentFile || !activeView.file || activeView.file.path !== this.currentFile.path) return;

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
    if (!editor || !sentence.from || !sentence.to) return;

    try {
      editor.setSelection(sentence.from, sentence.to);
      editor.scrollIntoView({ from: sentence.from, to: sentence.to }, true);
    } catch (e) {}
  }

  highlightInReadingMode(view, targetText) {
    this.clearReadingHighlights();

    const containerEl = view.previewMode ? view.previewMode.containerEl : view.contentEl;
    if (!containerEl || !targetText) return;

    const target = targetText.trim().replace(/\s+/g, ' ');
    if (target.length === 0) return;

    // Buscar en bloques HTML renderizados
    const blocks = containerEl.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, div.callout-content');
    let matchedRange = null;
    let targetBlock = null;

    // 1. Coincidencia completa exacta
    for (const block of Array.from(blocks)) {
      matchedRange = this.createRangeInElement(block, target);
      if (matchedRange) {
        targetBlock = block;
        break;
      }
    }

    // 2. Coincidencia por snippet (primeros 30 caracteres) si no hubo coincidencia completa
    if (!matchedRange && target.length > 30) {
      const snippet = target.slice(0, 30);
      for (const block of Array.from(blocks)) {
        matchedRange = this.createRangeInElement(block, snippet);
        if (matchedRange) {
          targetBlock = block;
          break;
        }
      }
    }

    if (matchedRange) {
      const mark = document.createElement('mark');
      mark.className = 'vocalis-teleprompter-highlight piper-teleprompter-highlight';
      try {
        matchedRange.surroundContents(mark);
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        // Si el rango cruza etiquetas anidadas (ej. <strong>, <a>, <em>)
        if (targetBlock) {
          targetBlock.classList.add('vocalis-teleprompter-highlight', 'piper-teleprompter-highlight');
          targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    } else if (targetBlock) {
      targetBlock.classList.add('vocalis-teleprompter-highlight', 'piper-teleprompter-highlight');
      targetBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  createRangeInElement(element, searchText) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let node;
    const textNodes = [];

    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    if (textNodes.length === 0) return null;

    // Mapeo con colapso de espacios idéntico al renderizado HTML
    let collapsed = '';
    const charMap = [];

    for (const tNode of textNodes) {
      const text = tNode.textContent;
      for (let c = 0; c < text.length; c++) {
        const ch = text[c];
        const isWs = /\s/.test(ch);
        if (isWs) {
          if (collapsed.length === 0 || !/\s$/.test(collapsed)) {
            charMap.push({ node: tNode, offset: c });
            collapsed += ' ';
          }
        } else {
          charMap.push({ node: tNode, offset: c });
          collapsed += ch;
        }
      }
    }

    const matchStart = collapsed.indexOf(searchText);
    if (matchStart === -1) return null;
    const matchEnd = matchStart + searchText.length - 1;

    const startInfo = charMap[matchStart];
    const endInfo = charMap[matchEnd];

    if (startInfo && endInfo) {
      const range = document.createRange();
      range.setStart(startInfo.node, startInfo.offset);
      range.setEnd(endInfo.node, endInfo.offset + 1);
      return range;
    }

    return null;
  }

  clearReadingHighlights() {
    const activeMarks = document.querySelectorAll('mark.vocalis-teleprompter-highlight, mark.piper-teleprompter-highlight');
    activeMarks.forEach((m) => {
      const parent = m.parentNode;
      if (parent) {
        while (m.firstChild) {
          parent.insertBefore(m.firstChild, m);
        }
        parent.removeChild(m);
      }
    });

    const activeClasses = document.querySelectorAll('.vocalis-teleprompter-highlight, .piper-teleprompter-highlight');
    activeClasses.forEach((el) => {
      if (el.tagName !== 'MARK') {
        el.classList.remove('vocalis-teleprompter-highlight');
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

    this.clearAudioCache();

    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch (e) {}
      this.currentAudio = null;
    }

    if (this.currentBlobUrl) {
      try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
      this.currentBlobUrl = null;
    }

    this.clearReadingHighlights();
    this.updatePlayerUI();
    this.updateStatusBar("Listo (Offline)");
  }

  async skipSentence(direction) {
    if (!this.sentences || this.sentences.length === 0) return;

    const nextIndex = this.currentIndex + direction;
    if (nextIndex >= this.sentences.length) {
      this.finishReading();
      return;
    }

    // Cancelar cualquier proceso activo inmediatamente para liberar CPU
    if (this.activeChild) {
      try { this.activeChild.kill(); } catch (e) {}
      this.activeChild = null;
    }

    if (direction !== 1) {
      this.clearAudioCache();
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

    if (this.currentBlobUrl) {
      try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
      this.currentBlobUrl = null;
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

  currentLang() {
    return this.isPlaying ? this.sessionLang : this.settings.language;
  }

  async cycleVoice() {
    // Solo voces del idioma en uso que estén en disco
    const lang = this.currentLang();
    const keys = Object.keys(VOICE_DEFINITIONS).filter((k) => VOICE_DEFINITIONS[k].lang === lang && this.isVoiceInstalled(k));
    if (keys.length === 0) {
      new Notice(`⚠️ No hay voces de ${LANGUAGES[lang]} instaladas.`);
      return;
    }
    const nextKey = keys[(keys.indexOf(this.getVoiceFor(lang)) + 1) % keys.length];

    this.settings.voiceByLang[lang] = nextKey;
    await this.saveSettings();

    this.clearAudioCache();

    const def = VOICE_DEFINITIONS[nextKey];
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

  // --- REPRODUCTOR EN LA BARRA LATERAL DERECHA ---
  // Iconos Lucide nativos (setIcon) y clickable-icon: los temas pintan los <button> y los emojis se ven como cuadritos
  createIconButton(parent, icon, label, onClick, cls = "") {
    const btn = parent.createDiv({ cls: `clickable-icon vocalis-icon-btn ${cls}`.trim(), attr: { "aria-label": label } });
    setIcon(btn, icon);
    this.makePressable(btn, onClick);
    return btn;
  }

  // Un div que actúa como botón: clic, foco con Tab y Enter/Espacio
  makePressable(el, onClick) {
    el.setAttr("role", "button");
    el.setAttr("tabindex", "0");
    el.onclick = onClick;
    el.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick(e);
      }
    };
  }

  renderPlayer(container) {
    container.empty();
    this.playerEl = container.createDiv({ cls: "vocalis-panel" });
    const card = this.playerEl.createDiv({ cls: "vocalis-card" });

    const header = card.createDiv({ cls: "vocalis-player-header" });
    const titles = header.createDiv({ cls: "vocalis-player-titles" });
    this.playerTitleEl = titles.createDiv({ cls: "vocalis-player-note-title" });
    this.playerSubtitleEl = titles.createDiv({ cls: "vocalis-player-subtitle" });
    this.stopBtnEl = this.createIconButton(header, "square", "Detener lectura (Alt + D)", () => this.stopPlayback());

    // Barra de progreso interactiva (Seek Bar)
    this.progressWrapEl = card.createDiv({ cls: "vocalis-progress-track" });
    this.progressBarEl = this.progressWrapEl.createDiv({ cls: "vocalis-progress-fill" });
    this.progressWrapEl.setAttr("aria-label", "Haz clic en cualquier punto para saltar a esa frase");
    this.progressWrapEl.onclick = (e) => {
      if (!this.isPlaying || !this.sentences || this.sentences.length === 0) return;
      const rect = this.progressWrapEl.getBoundingClientRect();
      const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.currentIndex = Math.min(this.sentences.length - 1, Math.floor(clickRatio * this.sentences.length));
      this.skipSentence(0);
    };

    // Controles: reiniciar, anterior, play grande, siguiente
    const controls = card.createDiv({ cls: "vocalis-controls" });
    this.createIconButton(controls, "rotate-ccw", "Reiniciar esta nota desde el principio", () => this.restartNote());
    this.createIconButton(controls, "skip-back", "Frase anterior (Alt + Flecha Izquierda)", () => this.skipSentence(-1));
    this.playBtnEl = this.createIconButton(controls, "play", "Play / Pausa (Alt + E)", () => {
      if (this.isPlaying) {
        if (this.isPaused) {
          this.resumePlayback();
        } else {
          this.pausePlayback();
        }
        return;
      }
      const targetView = this.getTargetMarkdownView();
      if (targetView) {
        this.startReadingSession(targetView, false);
      } else {
        new Notice("Abre una nota en Obsidian para escucharla.");
      }
    }, "vocalis-play-btn");
    this.createIconButton(controls, "skip-forward", "Frase siguiente (Alt + Flecha Derecha)", () => this.skipSentence(1));

    // Chips de voz y velocidad
    const chips = card.createDiv({ cls: "vocalis-chips" });
    const createChip = (icon, label, onClick) => {
      const chip = chips.createDiv({ cls: "vocalis-chip", attr: { "aria-label": label } });
      setIcon(chip.createSpan({ cls: "vocalis-chip-icon" }), icon);
      this.makePressable(chip, onClick);
      return chip.createSpan({ cls: "vocalis-chip-text" });
    };
    this.voiceBtnEl = createChip("user", "Cambiar la voz del lector", () => this.cycleVoice());
    this.speedBtnEl = createChip("gauge", "Cambiar velocidad (hasta 2.5x al instante)", () => this.cycleSpeed());

    // Notas con lectura a medias
    this.playerEl.createDiv({ cls: "vocalis-section-title", text: "Continuar escuchando" });
    this.continueListEl = this.playerEl.createDiv({ cls: "vocalis-continue-list" });

    this.updatePlayerUI();
  }

  updatePlayerUI() {
    if (!this.playerEl) return;

    const active = this.isPlaying && this.currentFile;
    const total = this.sentences.length || 1;
    const current = Math.min(total, this.currentIndex + 1);
    const percent = Math.round((current / total) * 100);

    this.playerTitleEl.setText(active ? this.currentFile.basename : "Sin lectura activa");
    this.playerSubtitleEl.setText(active ? `Frase ${current} de ${total} · ${percent} %` : "Abre una nota y pulsa play");
    this.stopBtnEl.toggle(!!active);
    this.progressWrapEl.toggle(!!active);
    this.progressBarEl.style.width = `${percent}%`;
    setIcon(this.playBtnEl, active && !this.isPaused ? "pause" : "play");

    const voiceKey = this.getVoiceFor(this.currentLang());
    this.voiceBtnEl.setText(voiceKey ? VOICE_DEFINITIONS[voiceKey].badge.replace(/^\S+\s/, "") : `Sin voz (${this.currentLang().toUpperCase()})`);
    this.speedBtnEl.setText(`${this.settings.playbackSpeed}x`);

    this.renderContinueList();
  }

  renderContinueList() {
    if (!this.continueListEl) return;
    this.continueListEl.empty();

    const entries = Object.entries(this.settings.progress)
      .filter(([p, st]) => st && st.index > 0 && st.percent < 100 && this.app.vault.getAbstractFileByPath(p) instanceof TFile)
      .sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0))
      .slice(0, 8);

    if (entries.length === 0) {
      this.continueListEl.createDiv({ cls: "vocalis-continue-empty", text: "No hay notas a medias." });
      return;
    }

    for (const [filePath, st] of entries) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      const isCurrent = this.isPlaying && this.currentFile && this.currentFile.path === filePath;
      // title y no aria-label: el tooltip de Obsidian chocaría con el de la ✕ anidada
      const item = this.continueListEl.createDiv({ cls: "vocalis-continue-item", attr: { title: `${filePath}\nClic para abrir y reanudar` } });
      if (isCurrent) item.addClass("is-active");

      const row = item.createDiv({ cls: "vocalis-continue-row" });
      setIcon(row.createSpan({ cls: "vocalis-continue-icon" }), "file-text");
      row.createSpan({ cls: "vocalis-continue-name", text: file.basename });
      row.createSpan({ cls: "vocalis-continue-percent", text: `${st.percent} %` });
      // La nota en lectura no se borra: se volvería a guardar en la siguiente frase
      if (!isCurrent) {
        this.createIconButton(row, "x", "Borrar dónde ibas (la nota no se toca)", async (e) => {
          e.stopPropagation();
          delete this.settings.progress[filePath];
          await this.saveSettings();
          this.renderContinueList();
          new Notice(`Se borró dónde ibas en «${file.basename}».`);
        }, "vocalis-continue-remove");
      }

      item.createDiv({ cls: "vocalis-continue-bar" }).createDiv({ cls: "vocalis-continue-bar-fill" }).style.width = `${st.percent}%`;

      // La ✕ llama a stopPropagation, así su clic o Enter no abre la nota
      this.makePressable(item, async () => {
        const leaf = this.app.workspace.getLeaf(false);
        await leaf.openFile(file);
        if (leaf.view instanceof MarkdownView) {
          await this.startReadingSession(leaf.view, false);
        }
      });
    }
  }

  onunload() {
    this.stopPlayback();
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
    this.settings.progress = Object.assign({}, data.progress);
    this.settings.voiceByLang = Object.assign({}, DEFAULT_SETTINGS.voiceByLang, data.voiceByLang);
    // Migración desde 1.0.x: la voz única pasa a ser la voz de español
    if (data.selectedVoice && !data.voiceByLang && VOICE_DEFINITIONS[data.selectedVoice]) {
      this.settings.voiceByLang.es = data.selectedVoice;
    }
    delete this.settings.selectedVoice;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class VocalisSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Vocalis TTS (Offline, Teleprompter y Memoria)" });

    const lang = this.plugin.settings.language;

    new Setting(containerEl)
      .setName("Idioma de lectura")
      .setDesc("Idioma por defecto de las notas. Una nota puede indicar otro con `lang: en` o `lang: es` en su frontmatter.")
      .addDropdown((dropdown) => {
        for (const [code, label] of Object.entries(LANGUAGES)) {
          dropdown.addOption(code, label);
        }
        dropdown.setValue(lang);
        dropdown.onChange(async (val) => {
          this.plugin.settings.language = val;
          await this.plugin.saveSettings();
          this.plugin.updatePlayerUI();
          this.display();
        });
      });

    new Setting(containerEl)
      .setName(`Voz neuronal (${LANGUAGES[lang]})`)
      .setDesc("Locutor para las notas en este idioma. Las voces no instaladas aparecen marcadas.")
      .addDropdown((dropdown) => {
        for (const [key, val] of Object.entries(VOICE_DEFINITIONS)) {
          if (val.lang !== lang) continue;
          dropdown.addOption(key, this.plugin.isVoiceInstalled(key) ? val.name : `${val.name} — no instalada`);
        }
        dropdown.setValue(this.plugin.settings.voiceByLang[lang]);
        dropdown.onChange(async (val) => {
          this.plugin.settings.voiceByLang[lang] = val;
          await this.plugin.saveSettings();
          this.plugin.clearAudioCache();
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

    // Sección de Créditos y Reconocimientos
    containerEl.createEl("h3", { text: "Reconocimientos y Créditos" });
    const creditsP = containerEl.createEl("p", {
      text: "Vocalis TTS integra y da crédito a las siguientes tecnologías y datasets de código abierto:"
    });
    creditsP.style.fontSize = "12.5px";
    creditsP.style.color = "var(--text-muted)";

    const creditsList = containerEl.createEl("ul");
    creditsList.style.fontSize = "12px";
    creditsList.style.color = "var(--text-muted)";

    const li1 = creditsList.createEl("li");
    li1.innerHTML = "<strong>Rhasspy Piper TTS</strong>: Motor neuronal creado por Michael Hansen (Licencia MIT/Apache 2.0).";

    const li2 = creditsList.createEl("li");
    li2.innerHTML = "<strong>eSpeak-NG</strong>: Motor fonetizador de código abierto.";

    const li3 = creditsList.createEl("li");
    li3.innerHTML = "<strong>Datasets Neuronales</strong>: Sharvard (ES), Davefx (ES), Daniela (AR), Lessac (US) y Ryan (US) alojados en Piper Voices.";
  }
}

class VocalisPlayerView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_PLAYER;
  }

  getDisplayText() {
    return "Vocalis TTS";
  }

  getIcon() {
    return "volume-2";
  }

  async onOpen() {
    this.plugin.renderPlayer(this.contentEl);
  }

  async onClose() {
    this.plugin.playerEl = null;
  }
}

module.exports = VocalisTTSPlugin;
