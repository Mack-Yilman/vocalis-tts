const { Plugin, PluginSettingTab, Setting, Notice, MarkdownView, ItemView, TFile, setIcon, getLanguage } = require('obsidian');
const { StateField, StateEffect } = require('@codemirror/state');
const { Decoration, EditorView } = require('@codemirror/view');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SPEED_OPTIONS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];
const VIEW_TYPE_PLAYER = 'vocalis-player';
const LANGUAGES = { es: 'Español', en: 'English' };

// getLanguage existe desde Obsidian 1.8.7. No usar localStorage.language: es null aunque Obsidian esté en español
const uiLang = (typeof getLanguage === 'function' ? getLanguage() : document.documentElement.lang) || 'en';
const UI_LANG = uiLang.toLowerCase().startsWith('es') ? 'es' : 'en';

const STRINGS = {
  es: {
    // voice
    voiceSharvardFemale: 'Sharvard 👩 (España - Femenina)',
    voiceDaniela: 'Daniela 👩 (Argentina - Femenina High)',
    voiceSharvardMale: 'Sharvard 👨 (España - Masculina)',
    voiceDavefx: 'Davefx 👨 (España - Masculina)',
    voiceLessac: 'Lessac 👩 (US English - Female)',
    voiceRyan: 'Ryan 👨 (US English - Male)',
    // cmd
    cmdPlayPause: 'Escuchar / Pausar / Reanudar lectura',
    cmdOpenPanel: 'Abrir panel de Vocalis',
    cmdStop: 'Detener lectura y cerrar reproductor',
    cmdNextSentence: 'Frase siguiente',
    cmdPrevSentence: 'Frase anterior',
    cmdRestart: 'Reiniciar nota desde el principio',
    cmdListenFromHere: '🔊 Escuchar desde aquí con Vocalis',
    cmdRibbonTitle: 'Vocalis TTS (Escuchar / Pausar)',
    // notice
    noticeOpenNoteToListen: 'Abre una nota en Obsidian para escucharla.',
    noticeNoActiveNote: 'No hay nota activa para leer.',
    noticeNoReadableText: 'La nota no contiene texto legible para sintetizar.',
    noticeNoVoicesInFolder: '⚠️ No hay voces de {lang} instaladas en la carpeta de modelos.',
    noticeVoiceFallback: '⚠️ La voz elegida no está instalada. Usando {voice}.',
    noticeNoVoicesInstalled: '⚠️ No hay voces de {lang} instaladas.',
    noticeProgressCleared: 'Historial de lectura borrado correctamente.',
    noticePiperFailed: '⚠️ Piper no pudo sintetizar. Revisa la ruta de piper.exe y los modelos en Ajustes.',
    // panel
    panelStatusReady: 'Listo (Offline)',
    panelStatusPaused: 'Pausado',
    panelStatusSentence: 'Frase {current}/{total} ({speed}x)',
    panelStopBtn: 'Detener lectura (Alt + D)',
    panelSeekTooltip: 'Haz clic en cualquier punto para saltar a esa frase',
    panelRestartBtn: 'Reiniciar esta nota desde el principio',
    panelPrevBtn: 'Frase anterior (Alt + Flecha Izquierda)',
    panelPlayPauseBtn: 'Play / Pausa (Alt + E)',
    panelNextBtn: 'Frase siguiente (Alt + Flecha Derecha)',
    panelVoiceChip: 'Cambiar la voz del lector',
    panelSpeedChip: 'Cambiar velocidad (hasta 2.5x al instante)',
    panelContinueListening: 'Continuar escuchando',
    panelNoActiveReading: 'Sin lectura activa',
    panelProgressSubtitle: 'Frase {current} de {total} · {percent} %',
    panelOpenNoteSubtitle: 'Abre una nota y pulsa play',
    panelNoVoice: 'Sin voz ({lang})',
    panelNoPendingNotes: 'No hay notas a medias.',
    panelContinueItemTitle: '{path}\nClic para abrir y reanudar',
    panelRemoveProgress: 'Borrar dónde ibas (la nota no se toca)',
    // settings
    settingsTitle: 'Vocalis TTS (Offline, Teleprompter y Memoria)',
    settingsLangName: 'Idioma de lectura',
    settingsLangDesc: 'Idioma por defecto de las notas. Una nota puede indicar otro con `lang: en` o `lang: es` en su frontmatter.',
    settingsVoiceName: 'Voz neuronal ({lang})',
    settingsVoiceDesc: 'Locutor para las notas en este idioma. Las voces no instaladas aparecen marcadas.',
    settingsVoiceNotInstalled: '{name} — no instalada',
    settingsSpeedName: 'Velocidad de reproducción',
    settingsSpeedDesc: 'Velocidad de habla con preservación de tono natural (0.75x a 2.5x)',
    settingsPiperExeName: 'Ruta a piper.exe',
    settingsPiperExeDesc: 'Ruta absoluta al ejecutable de Piper (se detecta automáticamente si está vacío)',
    settingsPiperExePlaceholder: 'C:\\ruta\\a\\piper.exe',
    settingsModelsDirName: 'Carpeta de modelos neuronales',
    settingsModelsDirDesc: 'Directorio con los archivos .onnx y .json de los modelos',
    settingsModelsDirPlaceholder: 'C:\\ruta\\a\\modelos',
    settingsSentencePauseName: 'Pausa entre frases',
    settingsSentencePauseDesc: 'Milisegundos de silencio entre frases del mismo párrafo (recomendado: 50).',
    settingsParagraphPauseName: 'Pausa entre párrafos',
    settingsParagraphPauseDesc: 'Milisegundos de silencio al cambiar de párrafo (recomendado: 200).',
    settingsClearHistoryName: 'Limpiar memoria de lectura',
    settingsClearHistoryDesc: 'Elimina el historial de posiciones de lectura guardadas de todas las notas',
    settingsClearHistoryBtn: 'Limpiar historial',
    settingsCreditsTitle: 'Reconocimientos y Créditos',
    settingsCreditsDesc: 'Vocalis TTS integra y da crédito a las siguientes tecnologías y datasets de código abierto:',
    settingsCreditsPiper: 'Rhasspy Piper TTS: Motor neuronal creado por Michael Hansen (Licencia MIT/Apache 2.0).',
    settingsCreditsEspeak: 'eSpeak-NG: Motor fonetizador de código abierto.',
    settingsCreditsDatasets: 'Datasets Neuronales: Sharvard (ES), Davefx (ES), Daniela (AR), Lessac (US) y Ryan (US) alojados en Piper Voices.'
  },
  en: {
    // voice
    voiceSharvardFemale: 'Sharvard 👩 (Spain - Female)',
    voiceDaniela: 'Daniela 👩 (Argentina - Female High)',
    voiceSharvardMale: 'Sharvard 👨 (Spain - Male)',
    voiceDavefx: 'Davefx 👨 (Spain - Male)',
    voiceLessac: 'Lessac 👩 (US English - Female)',
    voiceRyan: 'Ryan 👨 (US English - Male)',
    // cmd
    cmdPlayPause: 'Listen / Pause / Resume reading',
    cmdOpenPanel: 'Open Vocalis panel',
    cmdStop: 'Stop reading and close player',
    cmdNextSentence: 'Next sentence',
    cmdPrevSentence: 'Previous sentence',
    cmdRestart: 'Restart note from the beginning',
    cmdListenFromHere: '🔊 Listen from here with Vocalis',
    cmdRibbonTitle: 'Vocalis TTS (Listen / Pause)',
    // notice
    noticeOpenNoteToListen: 'Open a note in Obsidian to listen to it.',
    noticeNoActiveNote: 'No active note to read.',
    noticeNoReadableText: 'The note contains no readable text to synthesize.',
    noticeNoVoicesInFolder: '⚠️ No {lang} voices installed in the models folder.',
    noticeVoiceFallback: '⚠️ Selected voice is not installed. Using {voice}.',
    noticeNoVoicesInstalled: '⚠️ No {lang} voices installed.',
    noticeProgressCleared: 'Reading history cleared successfully.',
    noticePiperFailed: '⚠️ Piper could not synthesize. Check the piper.exe path and the models in Settings.',
    // panel
    panelStatusReady: 'Ready (Offline)',
    panelStatusPaused: 'Paused',
    panelStatusSentence: 'Sentence {current}/{total} ({speed}x)',
    panelStopBtn: 'Stop reading (Alt + D)',
    panelSeekTooltip: 'Click anywhere to jump to that sentence',
    panelRestartBtn: 'Reset this note',
    panelPrevBtn: 'Previous sentence (Alt + Left Arrow)',
    panelPlayPauseBtn: 'Play / Pause (Alt + E)',
    panelNextBtn: 'Next sentence (Alt + Right Arrow)',
    panelVoiceChip: 'Change reader voice',
    panelSpeedChip: 'Change speed (up to 2.5x instantly)',
    panelContinueListening: 'Continue listening',
    panelNoActiveReading: 'No active reading',
    panelProgressSubtitle: 'Sentence {current} of {total} · {percent}%',
    panelOpenNoteSubtitle: 'Open a note and press play',
    panelNoVoice: 'No voice ({lang})',
    panelNoPendingNotes: 'No notes in progress.',
    panelContinueItemTitle: '{path}\nClick to open and resume',
    panelRemoveProgress: 'Forget progress (note remains untouched)',
    // settings
    settingsTitle: 'Vocalis TTS (Offline, Teleprompter & Memory)',
    settingsLangName: 'Reading language',
    settingsLangDesc: 'Default language for notes. A note can specify another with `lang: en` or `lang: es` in its frontmatter.',
    settingsVoiceName: 'Neural voice ({lang})',
    settingsVoiceDesc: 'Speaker for notes in this language. Uninstalled voices appear marked.',
    settingsVoiceNotInstalled: '{name} — not installed',
    settingsSpeedName: 'Playback speed',
    settingsSpeedDesc: 'Speech speed with pitch preservation (0.75x to 2.5x)',
    settingsPiperExeName: 'Path to piper.exe',
    settingsPiperExeDesc: 'Absolute path to Piper executable (auto-detected if empty)',
    settingsPiperExePlaceholder: 'C:\\path\\to\\piper.exe',
    settingsModelsDirName: 'Neural models folder',
    settingsModelsDirDesc: 'Directory containing model .onnx and .json files',
    settingsModelsDirPlaceholder: 'C:\\path\\to\\models',
    settingsSentencePauseName: 'Pause between sentences',
    settingsSentencePauseDesc: 'Milliseconds of silence between sentences in a paragraph (recommended: 50).',
    settingsParagraphPauseName: 'Pause between paragraphs',
    settingsParagraphPauseDesc: 'Milliseconds of silence when the paragraph changes (recommended: 200).',
    settingsClearHistoryName: 'Clear reading memory',
    settingsClearHistoryDesc: 'Clears saved reading positions history for all notes',
    settingsClearHistoryBtn: 'Clear history',
    settingsCreditsTitle: 'Acknowledgments and Credits',
    settingsCreditsDesc: 'Vocalis TTS integrates and gives credit to the following open source technologies and datasets:',
    settingsCreditsPiper: 'Rhasspy Piper TTS: Neural engine created by Michael Hansen (MIT/Apache 2.0 License).',
    settingsCreditsEspeak: 'eSpeak-NG: Open-source phonemizer engine.',
    settingsCreditsDatasets: 'Neural Datasets: Sharvard (ES), Davefx (ES), Daniela (AR), Lessac (US) and Ryan (US) hosted on Piper Voices.'
  }
};

// t('clave', { n: 1 }) reemplaza {n} en el texto
function t(key, vars = {}) {
  const text = STRINGS[UI_LANG][key] ?? STRINGS.es[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

// Femeninas primero en cada idioma: la primera instalada sirve de respaldo.
// speaker solo en modelos con varios locutores: speaker_id en uno de un locutor hace caer a Piper (0xC0000409)
const VOICE_DEFINITIONS = {
  'sharvard-female': {
    nameKey: 'voiceSharvardFemale',
    modelFile: 'es_ES-sharvard-medium.onnx',
    speaker: 1,
    lang: 'es',
    badge: '👩 Sharvard (ES)'
  },
  'daniela': {
    nameKey: 'voiceDaniela',
    modelFile: 'es_AR-daniela-high.onnx',
    lang: 'es',
    badge: '👩 Daniela (AR)'
  },
  'sharvard-male': {
    nameKey: 'voiceSharvardMale',
    modelFile: 'es_ES-sharvard-medium.onnx',
    speaker: 0,
    lang: 'es',
    badge: '👨 Sharvard (ES)'
  },
  'davefx': {
    nameKey: 'voiceDavefx',
    modelFile: 'es_ES-davefx-medium.onnx',
    lang: 'es',
    badge: '👨 Davefx (ES)'
  },
  'lessac': {
    nameKey: 'voiceLessac',
    modelFile: 'en_US-lessac-medium.onnx',
    lang: 'en',
    badge: '👩 Lessac (US)'
  },
  'ryan': {
    nameKey: 'voiceRyan',
    modelFile: 'en_US-ryan-medium.onnx',
    lang: 'en',
    badge: '👨 Ryan (US)'
  }
};

const DEFAULT_SETTINGS = {
  piperExe: '',
  modelsDir: '',
  language: UI_LANG,
  voiceByLang: { es: 'sharvard-female', en: 'lessac' },
  playbackSpeed: 1.0,
  sentencePauseMs: 50,
  paragraphPauseMs: 200,
  progress: {} // { [filePath]: { index, total, percent, timestamp, snippet } }
};

const LOOKAHEAD = 3; // Frases sintetizadas por adelantado
const HIGHLIGHT_NAME = 'vocalis';
const WATCH_INTERVAL_MS = 500;
const RETRY_MS = 150;
const RETRY_MAX = 14;
const MAX_SYNTH_FAILURES = 3;
const ALNUM = /[\p{L}\p{N}]/u;

// Resaltado del modo edición: decoración de CM6, no toca cursor ni selección y sigue las ediciones
const setEditHighlight = StateEffect.define();
const editHighlightMark = Decoration.mark({ class: 'vocalis-teleprompter-selection' });
const editHighlightField = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setEditHighlight)) {
        next = effect.value ? Decoration.set([editHighlightMark.range(effect.value.from, effect.value.to)]) : Decoration.none;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field)
});

function alnumIndex(text) {
  let out = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    if (ALNUM.test(text[i])) {
      out += text[i].toLowerCase()[0];
      map.push(i);
    }
  }
  return { out, map };
}

// Ubica needle en haystack comparando solo letras y números: markdown, comas y signos no cuentan.
// Devuelve [inicio, fin) en haystack. Si el medio difiere (p. ej. una nota al pie), usa el principio y el final.
function matchAlnum(haystack, needle) {
  const hay = alnumIndex(haystack);
  const target = alnumIndex(needle).out;
  if (!target) return null;
  let start = hay.out.indexOf(target);
  let end = start + target.length - 1;
  if (start < 0) {
    if (target.length <= 30) return null;
    start = hay.out.indexOf(target.slice(0, 30));
    if (start < 0) return null;
    const tail = hay.out.indexOf(target.slice(-20), start);
    end = tail >= 0 ? tail + 19 : start + 29;
  }
  // Incluye el signo final de la frase
  let stop = hay.map[end] + 1;
  while (stop < haystack.length && !/\s/.test(haystack[stop]) && !ALNUM.test(haystack[stop])) stop++;
  return [hay.map[start], stop];
}

// Quita el silencio inicial y final de un WAV PCM de 16 bits y deja pauseMs al final
function trimWav(buf, pauseMs = 0, threshold = 300, marginMs = 10) {
  const dataPos = buf.indexOf('data', 12);
  if (dataPos < 0 || buf.readUInt16LE(34) !== 16) return buf;
  const start = dataPos + 8;
  const rate = buf.readUInt32LE(24);
  const samples = Math.floor(Math.min(buf.readUInt32LE(dataPos + 4), buf.length - start) / 2);
  let first = 0;
  while (first < samples && Math.abs(buf.readInt16LE(start + first * 2)) < threshold) first++;
  if (first === samples) return buf;
  let last = samples - 1;
  while (last > first && Math.abs(buf.readInt16LE(start + last * 2)) < threshold) last--;
  const margin = Math.round((rate * marginMs) / 1000);
  const from = Math.max(0, first - margin);
  const to = Math.min(samples, last + 1 + margin);
  const kept = to - from + Math.round((rate * pauseMs) / 1000);
  const out = Buffer.alloc(start + kept * 2);
  buf.copy(out, 0, 0, start);
  buf.copy(out, start, start + from * 2, start + to * 2);
  out.writeUInt32LE(out.length - 8, 4);
  out.writeUInt32LE(kept * 2, dataPos + 4);
  return out;
}

// Piper avisa por stdout ANTES de cerrar el archivo: se espera a que su tamaño coincida con la cabecera
async function readCompleteWav(file, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const buf = await fs.promises.readFile(file);
      if (buf.length >= 44 && buf.readUInt32LE(4) + 8 === buf.length) return buf;
    } catch (e) {}
    if (Date.now() > deadline) throw new Error('WAV incompleto: ' + file);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

function removeTemp(file) {
  fs.promises.unlink(file).catch(() => {
    // Windows puede tener el archivo abierto un instante más
    setTimeout(() => fs.promises.unlink(file).catch(() => {}), 500);
  });
}

// Un piper.exe con el modelo cargado, que recibe una línea JSON por frase: evita recargar el modelo cada vez
class PiperProcess {
  constructor(exe, modelPath) {
    this.modelPath = modelPath;
    this.dead = false;
    this.pending = null;
    this.buffer = '';
    this.child = spawn(exe, ['--model', modelPath, '--json-input', '--sentence_silence', '0', '--quiet'], { stdio: ['pipe', 'pipe', 'ignore'] });
    this.fail = (err) => {
      this.dead = true;
      if (this.pending) this.pending.reject(err);
      this.pending = null;
    };
    this.child.stdout.on('data', (chunk) => {
      this.buffer += chunk;
      if (this.buffer.includes('\n')) {
        this.buffer = '';
        const pending = this.pending;
        this.pending = null;
        if (pending) pending.resolve();
      }
    });
    this.child.stdin.on('error', this.fail);
    this.child.on('error', this.fail);
    this.child.on('close', (code) => this.fail(new Error(`Piper exited with code ${code}`)));
  }

  synth(request) {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.child.stdin.write(JSON.stringify(request) + '\n', 'utf8');
    });
  }

  kill() {
    // No esperar a 'close': la cola debe quedar libre de inmediato
    this.fail(new Error('Piper cancelado'));
    try { this.child.kill(); } catch (e) {}
  }
}

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
  let prevEnd = 0;
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
      // Línea en blanco antes de esta frase: la anterior cerró un párrafo
      if (sentences.length > 0 && /\n\s*\n/.test(fullText.slice(prevEnd, segmentStart))) {
        sentences[sentences.length - 1].paragraphEnd = true;
      }
      prevEnd = segmentEnd;
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
    this.currentAudioIndex = -1;
    this.piper = null;
    this.audioCache = new Map(); // índice de frase → { audio, blobUrl }
    this.synthFailed = new Set();
    this.synthFailures = 0;
    this.synthBusy = false;
    this.synthGeneration = 0;
    this.synthWaiters = [];
    this.hlSentence = null;
    this.hlNeedsScroll = false;
    this.hlViewKey = null;
    this.hlRange = null;
    this.hlBlock = null;
    this.hlRetries = 0;
    this.hlRetryTimer = null;
    this.sessionLang = this.settings.language;
    this.playerEl = null;

    this.statusBarItem = this.addStatusBarItem();
    this.updateStatusBar(t('panelStatusReady'));

    this.registerView(VIEW_TYPE_PLAYER, (leaf) => new VocalisPlayerView(leaf, this));

    // Re-aplicar teleprompter si el usuario cambia entre Modo Edición y Modo Lectura o enfoca otra nota
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        if (this.isPlaying && this.sentences && this.sentences[this.currentIndex]) {
          this.applyTeleprompter(this.sentences[this.currentIndex]);
        }
      })
    );

    this.registerEditorExtension(editHighlightField);
    // Alternar lectura/edición no dispara ningún evento útil y Obsidian descarta secciones al desplazarse
    this.registerInterval(window.setInterval(() => {
      if (this.isPlaying) this.renderHighlight();
    }, WATCH_INTERVAL_MS));

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
      name: t('cmdPlayPause'),
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
      name: t('cmdOpenPanel'),
      icon: "headphones",
      callback: () => this.activatePlayerView()
    });

    // Comando: Detener (Alt + D)
    this.addCommand({
      id: "stop-speech",
      name: t('cmdStop'),
      icon: "square",
      callback: () => {
        this.stopPlayback();
      }
    });

    // Comando: Siguiente frase
    this.addCommand({
      id: "next-sentence",
      name: t('cmdNextSentence'),
      icon: "skip-forward",
      callback: async () => {
        await this.skipSentence(1);
      }
    });

    // Comando: Frase anterior
    this.addCommand({
      id: "prev-sentence",
      name: t('cmdPrevSentence'),
      icon: "skip-back",
      callback: async () => {
        await this.skipSentence(-1);
      }
    });

    // Comando: Reiniciar nota
    this.addCommand({
      id: "restart-reading",
      name: t('cmdRestart'),
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
            .setTitle(t('cmdListenFromHere'))
            .setIcon("volume-2")
            .onClick(async () => {
              await this.startReadingSession(view, true);
            });
        });
      })
    );

    // Icono Ribbon (barra lateral izquierda)
    this.addRibbonIcon("volume-2", t('cmdRibbonTitle'), async () => {
      const targetView = this.getTargetMarkdownView();
      if (targetView) {
        await this.handleUniversalPlayCommand(targetView);
      } else {
        new Notice(t('noticeOpenNoteToListen'));
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
      new Notice(t('noticeNoActiveNote'));
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
      new Notice(t('noticeNoReadableText'));
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
      }
    }

    if (!startedFromSelection) {
      if (forceCursor && view.editor) {
        const cursor = view.editor.getCursor();
        targetIndex = findSentenceIndexAtCursor(cursor, this.sentences);
      } else {
        // Comprobar memoria persistente para este fichero específico
        const saved = this.settings.progress[file.path];
        if (saved && typeof saved.index === 'number' && saved.index > 0 && saved.index < this.sentences.length) {
          targetIndex = saved.index;
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

  isSessionLive(session) {
    return session === this.sessionId && this.isPlaying && !this.isPaused;
  }

  advanceAfterFailure() {
    if (this.currentIndex + 1 >= this.sentences.length) {
      this.finishReading();
    } else {
      this.skipSentence(1);
    }
  }

  async playCurrentSentence(session) {
    if (!this.isSessionLive(session)) return;

    if (this.currentIndex >= this.sentences.length) {
      this.finishReading();
      return;
    }

    const index = this.currentIndex;
    const currentSt = this.sentences[index];

    // 1. Guardar progreso de esta nota específica (sin esperar: el disco no debe retrasar la frase)
    const percent = Math.round(((index + 1) / this.sentences.length) * 100);
    if (this.currentFile) {
      this.settings.progress[this.currentFile.path] = {
        index,
        total: this.sentences.length,
        percent: percent,
        timestamp: Date.now(),
        snippet: currentSt.snippet
      };
      this.saveSettings();
    }

    // 2. Actualizar interfaz
    this.updatePlayerUI();

    // 3. Determinar voz
    const voiceKey = this.getVoiceFor(this.sessionLang);
    if (!voiceKey) {
      new Notice(t('noticeNoVoicesInFolder', { lang: LANGUAGES[this.sessionLang] }));
      this.stopPlayback();
      return;
    }
    if (voiceKey !== this.settings.voiceByLang[this.sessionLang] && !this.fallbackNoticed) {
      this.fallbackNoticed = true;
      new Notice(t('noticeVoiceFallback', { voice: t(VOICE_DEFINITIONS[voiceKey].nameKey) }));
    }

    // 4. Esperar el audio de la cola; nunca se sintetiza la misma frase dos veces
    this.pruneAudioCache();
    this.pumpSynthesis();
    while (!this.audioCache.has(index) && !this.synthFailed.has(index)) {
      await new Promise((resolve) => this.synthWaiters.push(resolve));
      // index distinto: otra llamada ya reprodujo esta frase (pausar y reanudar durante la espera)
      if (!this.isSessionLive(session) || index !== this.currentIndex) return;
      this.pumpSynthesis();
    }
    if (!this.isSessionLive(session)) return;

    if (this.synthFailed.has(index)) {
      if (this.synthFailures >= MAX_SYNTH_FAILURES) {
        new Notice(t('noticePiperFailed'));
        this.stopPlayback();
        return;
      }
      this.advanceAfterFailure();
      return;
    }

    const item = this.audioCache.get(index);
    this.audioCache.delete(index);

    this.releaseCurrentAudio();
    this.currentBlobUrl = item.blobUrl;
    this.currentAudio = item.audio;
    this.currentAudioIndex = index;
    this.currentAudio.preservesPitch = true;
    this.currentAudio.playbackRate = this.settings.playbackSpeed || 1.0;

    this.currentAudio.onended = async () => {
      if (!this.isSessionLive(session)) return;

      if (this.currentIndex + 1 >= this.sentences.length) {
        this.finishReading();
        return;
      }

      this.currentIndex++;
      await this.playCurrentSentence(session);
    };

    this.currentAudio.onerror = () => {
      if (session !== this.sessionId || !this.isPlaying) return;
      this.advanceAfterFailure();
    };

    // Pausa ajena al plugin (teclas multimedia, el sistema): reflejarla para no quedar «leyendo» en silencio
    const audio = this.currentAudio;
    audio.onpause = () => {
      if (audio === this.currentAudio && !audio.ended && this.isPlaying && !this.isPaused) this.pausePlayback();
    };

    // Antes de play(): una pausa al arrancar lo interrumpe, y la frase debe quedar marcada igual
    this.applyTeleprompter(currentSt);

    try {
      await this.currentAudio.play();
      this.updateStatusBar(t('panelStatusSentence', { current: this.currentIndex + 1, total: this.sentences.length, speed: this.settings.playbackSpeed }));
      this.pumpSynthesis();
    } catch (err) {
      // AbortError: una pausa interrumpió play(); no es un fallo y no debe saltar la frase
      if (err && err.name === 'AbortError') return;
      console.error("Error al iniciar reproducción:", err);
      if (this.isSessionLive(session)) this.advanceAfterFailure();
    }
  }

  releaseCurrentAudio() {
    if (this.currentAudio) {
      this.currentAudio.onended = null;
      this.currentAudio.onerror = null;
      this.currentAudio.onpause = null;
      try {
        this.currentAudio.pause();
        this.currentAudio.src = "";
      } catch (e) {}
      this.currentAudio = null;
    }
    this.currentAudioIndex = -1;
    if (this.currentBlobUrl) {
      try { URL.revokeObjectURL(this.currentBlobUrl); } catch (e) {}
      this.currentBlobUrl = null;
    }
  }

  wakeSynthWaiters() {
    const waiters = this.synthWaiters;
    this.synthWaiters = [];
    for (const resolve of waiters) resolve();
  }

  // Cola en serie: la frase actual y las LOOKAHEAD siguientes, de a una
  async pumpSynthesis() {
    if (this.synthBusy) return;
    this.synthBusy = true;
    const generation = this.synthGeneration;
    try {
      while (this.isPlaying && generation === this.synthGeneration) {
        const index = this.nextIndexToSynthesize();
        if (index === -1) break;
        await this.synthesizeSentence(index, generation);
        this.wakeSynthWaiters();
      }
    } finally {
      this.synthBusy = false;
    }
    // La caché se vació mientras se esperaba: atender a la generación nueva
    if (this.isPlaying && generation !== this.synthGeneration) this.pumpSynthesis();
  }

  nextIndexToSynthesize() {
    const last = Math.min(this.sentences.length - 1, this.currentIndex + LOOKAHEAD);
    for (let i = this.currentIndex; i <= last; i++) {
      if (!this.audioCache.has(i) && !this.synthFailed.has(i) && i !== this.currentAudioIndex) return i;
    }
    return -1;
  }

  pruneAudioCache() {
    const last = this.currentIndex + LOOKAHEAD;
    for (const [index, item] of this.audioCache.entries()) {
      if (index < this.currentIndex || index > last) {
        try { URL.revokeObjectURL(item.blobUrl); } catch (e) {}
        this.audioCache.delete(index);
      }
    }
  }

  async synthesizeSentence(index, generation) {
    const voiceKey = this.getVoiceFor(this.sessionLang);
    if (!voiceKey) {
      this.synthFailed.add(index);
      return;
    }
    const voice = VOICE_DEFINITIONS[voiceKey];
    const modelPath = path.join(this.settings.modelsDir, voice.modelFile);
    const sentence = this.sentences[index];
    const tempWav = path.join(os.tmpdir(), `vocalis_${Date.now()}_${process.pid}_${index}.wav`);

    try {
      if (!this.piper || this.piper.dead || this.piper.modelPath !== modelPath) {
        if (this.piper) this.piper.kill();
        this.piper = new PiperProcess(this.settings.piperExe, modelPath);
      }
      const request = { text: sentence.clean, output_file: tempWav };
      if (voice.speaker !== undefined) request.speaker_id = voice.speaker;
      await this.piper.synth(request);
      const wav = await readCompleteWav(tempWav);
      if (generation !== this.synthGeneration) return;

      const pause = sentence.paragraphEnd ? this.settings.paragraphPauseMs : this.settings.sentencePauseMs;
      const blobUrl = URL.createObjectURL(new Blob([trimWav(wav, pause)], { type: 'audio/wav' }));
      const audio = new Audio(blobUrl);
      audio.preload = 'auto'; // Decodificado antes de su turno para que play() sea inmediato
      this.audioCache.set(index, { audio, blobUrl });
      this.synthFailures = 0;
    } catch (err) {
      if (generation !== this.synthGeneration) return;
      console.error("Vocalis: error de síntesis:", err);
      this.synthFailed.add(index);
      this.synthFailures++;
    } finally {
      removeTemp(tempWav);
    }
  }

  clearAudioCache() {
    this.synthGeneration++;
    if (this.piper) {
      this.piper.kill();
      this.piper = null;
    }
    for (const item of this.audioCache.values()) {
      try { URL.revokeObjectURL(item.blobUrl); } catch (e) {}
    }
    this.audioCache.clear();
    this.synthFailed.clear();
    this.synthFailures = 0;
    this.wakeSynthWaiters();
  }

  // --- TELEPROMPTER UNIVERSAL (EDICIÓN Y LECTURA) ---
  // Frase nueva: siempre se desplaza hasta ella
  applyTeleprompter(sentence) {
    if (!sentence) return;
    this.hlSentence = sentence;
    this.hlNeedsScroll = true;
    this.hlRange = null;
    this.hlRetries = 0;
    this.renderHighlight();
  }

  // Idempotente: lo llaman la frase nueva, el cambio de hoja, el vigilante y los reintentos
  renderHighlight() {
    const sentence = this.hlSentence;
    if (!sentence || !this.isPlaying) return;
    const view = this.getTargetMarkdownView();
    if (!view || !this.currentFile || !view.file || view.file.path !== this.currentFile.path) return;

    const mode = view.getMode ? view.getMode() : 'source';
    const viewKey = `${mode}|${view.leaf ? view.leaf.id : ''}`;
    if (viewKey !== this.hlViewKey) {
      this.clearHighlights();
      this.hlViewKey = viewKey;
      this.hlNeedsScroll = true;
      this.hlRetries = 0;
    }

    // En una pestaña oculta no se puede medir ni desplazar: queda pendiente para cuando vuelva
    if (view.contentEl.clientHeight === 0) return;

    if (mode === 'preview') {
      this.highlightInReadingMode(view, sentence);
    } else if (view.editor) {
      this.highlightInEditMode(view, sentence);
    }
  }

  highlightInEditMode(view, sentence) {
    const editor = view.editor;
    const cm = editor.cm;
    if (!cm || !sentence.from || !sentence.to) return;
    const current = cm.state.field(editHighlightField, false);
    if (!current) return;
    if (current.size > 0 && !this.hlNeedsScroll) return;

    try {
      const length = cm.state.doc.length;
      const from = Math.min(editor.posToOffset(sentence.from), length);
      const to = Math.min(editor.posToOffset(sentence.to), length);
      if (from >= to) return;
      const effects = [setEditHighlight.of({ from, to })];
      if (this.hlNeedsScroll) effects.push(EditorView.scrollIntoView(from, { y: 'center' }));
      cm.dispatch({ effects });
      this.hlNeedsScroll = false;
    } catch (e) {
      console.error("Vocalis: error al resaltar:", e);
    }
  }

  highlightInReadingMode(view, sentence) {
    const preview = view.previewMode;
    if (!preview || !preview.containerEl) return;
    if (this.hlRange && this.hlRange.startContainer.isConnected && !this.hlNeedsScroll) return;

    const scope = this.findPreviewScope(preview, sentence);
    const range = scope.rendered ? this.findSentenceRange(scope.elements, sentence.clean) : null;

    if (range) {
      this.showReadingHighlight(range);
      if (this.hlNeedsScroll) this.scrollPreviewTo(preview, range.getBoundingClientRect());
      this.hlNeedsScroll = false;
      return;
    }

    // Sección sin renderizar: el modo lectura solo mantiene en el DOM lo cercano a la pantalla
    if (this.hlNeedsScroll && !scope.rendered && typeof preview.applyScroll === 'function') {
      preview.applyScroll(sentence.from.line);
    }
    if (this.hlRetries < RETRY_MAX) {
      this.hlRetries++;
      window.clearTimeout(this.hlRetryTimer);
      this.hlRetryTimer = window.setTimeout(() => this.renderHighlight(), RETRY_MS);
    } else if (scope.rendered && scope.elements[0]) {
      // Texto que no se puede ubicar (p. ej. una imagen o una transclusión): se marca el bloque
      this.showBlockHighlight(scope.elements[0]);
      if (this.hlNeedsScroll) this.scrollPreviewTo(preview, scope.elements[0].getBoundingClientRect());
      this.hlNeedsScroll = false;
    }
  }

  // Limita la búsqueda a la sección de la frase, para no resaltar otra igual más arriba.
  // renderer.sections es API privada: sin ella se busca en todo lo renderizado.
  findPreviewScope(preview, sentence) {
    const sections = preview.renderer && preview.renderer.sections;
    if (Array.isArray(sections)) {
      // lines 0: la cabecera con el título. Una sección fuera de pantalla conserva su texto pero queda desconectada del DOM
      const matches = sections.filter((sec) => sec.lines > 0 && sec.el && sec.start && sec.end && sec.start.line <= sentence.to.line && sec.end.line >= sentence.from.line);
      if (matches.length > 0) {
        return { rendered: matches.every((sec) => sec.el.isConnected), elements: matches.map((sec) => sec.el) };
      }
    }
    return { rendered: true, elements: Array.from(preview.containerEl.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, blockquote, tr, div.callout-content')) };
  }

  findSentenceRange(elements, text) {
    for (const element of elements) {
      const range = this.createRangeInElement(element, text);
      if (range) return range;
    }
    return null;
  }

  createRangeInElement(element, searchText) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let joined = '';
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: joined.length });
      joined += node.textContent;
    }
    const match = matchAlnum(joined, searchText);
    if (!match) return null;

    const locate = (offset) => {
      let i = nodes.length - 1;
      while (i > 0 && nodes[i].start > offset) i--;
      return { node: nodes[i].node, offset: offset - nodes[i].start };
    };
    const start = locate(match[0]);
    const end = locate(match[1] - 1);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    return range;
  }

  showReadingHighlight(range) {
    this.clearBlockHighlight();
    this.hlRange = range;
    if (window.CSS && CSS.highlights && typeof Highlight === 'function') {
      CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
    } else {
      const parent = range.commonAncestorContainer;
      this.showBlockHighlight(parent.nodeType === Node.TEXT_NODE ? parent.parentElement : parent);
    }
  }

  showBlockHighlight(element) {
    this.clearBlockHighlight();
    if (window.CSS && CSS.highlights) CSS.highlights.delete(HIGHLIGHT_NAME);
    this.hlBlock = element;
    element.classList.add('vocalis-teleprompter-highlight');
  }

  clearBlockHighlight() {
    if (this.hlBlock) this.hlBlock.classList.remove('vocalis-teleprompter-highlight');
    this.hlBlock = null;
  }

  scrollPreviewTo(preview, rect) {
    const scroller = preview.containerEl.closest('.markdown-preview-view') || preview.containerEl.querySelector('.markdown-preview-view') || preview.containerEl;
    const box = scroller.getBoundingClientRect();
    const delta = rect.top + rect.height / 2 - (box.top + box.height / 2);
    if (Math.abs(delta) < 5) return;
    // Lejos, instantáneo: el scroll suave a gran distancia se interrumpe cuando Obsidian renderiza secciones
    // Con la ventana oculta el scroll suave no se anima: también instantáneo
    scroller.scrollBy({ top: delta, behavior: Math.abs(delta) > box.height || document.hidden ? 'auto' : 'smooth' });
  }

  clearHighlights() {
    window.clearTimeout(this.hlRetryTimer);
    this.hlRange = null;
    this.clearBlockHighlight();
    if (window.CSS && CSS.highlights) CSS.highlights.delete(HIGHLIGHT_NAME);
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      const cm = leaf.view && leaf.view.editor && leaf.view.editor.cm;
      const current = cm && cm.state.field(editHighlightField, false);
      if (current && current.size > 0) cm.dispatch({ effects: setEditHighlight.of(null) });
    }
  }

  pausePlayback() {
    this.isPaused = true;
    if (this.currentAudio) {
      this.currentAudio.pause();
    }
    this.updateStatusBar(t('panelStatusPaused'));
    this.updatePlayerUI();
  }

  resumePlayback() {
    this.isPaused = false;
    // Si se pausó mientras se sintetizaba, la frase actual aún no tiene audio
    if (this.currentAudio && this.currentAudioIndex === this.currentIndex) {
      // AbortError: otra pausa interrumpió este play()
      this.currentAudio.play().catch((err) => { if (err.name !== 'AbortError') console.error(err); });
    } else {
      this.playCurrentSentence(this.sessionId);
    }
    this.updateStatusBar(t('panelStatusSentence', { current: this.currentIndex + 1, total: this.sentences.length, speed: this.settings.playbackSpeed }));
    this.updatePlayerUI();
  }

  stopPlayback() {
    this.sessionId++;
    this.isPlaying = false;
    this.isPaused = false;

    this.clearAudioCache();
    this.releaseCurrentAudio();

    this.hlSentence = null;
    this.hlViewKey = null;
    this.clearHighlights();
    this.updatePlayerUI();
    this.updateStatusBar(t('panelStatusReady'));
  }

  async skipSentence(direction) {
    if (!this.sentences || this.sentences.length === 0) return;

    const nextIndex = this.currentIndex + direction;
    if (nextIndex >= this.sentences.length) {
      this.finishReading();
      return;
    }

    this.releaseCurrentAudio();

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
      new Notice(t('noticeNoVoicesInstalled', { lang: LANGUAGES[lang] }));
      return;
    }
    const nextKey = keys[(keys.indexOf(this.getVoiceFor(lang)) + 1) % keys.length];

    this.settings.voiceByLang[lang] = nextKey;
    await this.saveSettings();

    this.clearAudioCache();

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

    this.updatePlayerUI();
  }

  finishReading() {
    this.stopPlayback();
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
    this.stopBtnEl = this.createIconButton(header, "square", t('panelStopBtn'), () => this.stopPlayback());

    // Barra de progreso interactiva (Seek Bar)
    this.progressWrapEl = card.createDiv({ cls: "vocalis-progress-track" });
    this.progressBarEl = this.progressWrapEl.createDiv({ cls: "vocalis-progress-fill" });
    this.progressWrapEl.setAttr("aria-label", t('panelSeekTooltip'));
    this.progressWrapEl.onclick = (e) => {
      if (!this.isPlaying || !this.sentences || this.sentences.length === 0) return;
      const rect = this.progressWrapEl.getBoundingClientRect();
      const clickRatio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.currentIndex = Math.min(this.sentences.length - 1, Math.floor(clickRatio * this.sentences.length));
      this.skipSentence(0);
    };

    // Controles: reiniciar, anterior, play grande, siguiente
    const controls = card.createDiv({ cls: "vocalis-controls" });
    this.createIconButton(controls, "rotate-ccw", t('panelRestartBtn'), () => this.restartNote());
    this.createIconButton(controls, "skip-back", t('panelPrevBtn'), () => this.skipSentence(-1));
    this.playBtnEl = this.createIconButton(controls, "play", t('panelPlayPauseBtn'), () => {
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
        new Notice(t('noticeOpenNoteToListen'));
      }
    }, "vocalis-play-btn");
    this.createIconButton(controls, "skip-forward", t('panelNextBtn'), () => this.skipSentence(1));

    // Chips de voz y velocidad
    const chips = card.createDiv({ cls: "vocalis-chips" });
    const createChip = (icon, label, onClick) => {
      const chip = chips.createDiv({ cls: "vocalis-chip", attr: { "aria-label": label } });
      setIcon(chip.createSpan({ cls: "vocalis-chip-icon" }), icon);
      this.makePressable(chip, onClick);
      return chip.createSpan({ cls: "vocalis-chip-text" });
    };
    this.voiceBtnEl = createChip("user", t('panelVoiceChip'), () => this.cycleVoice());
    this.speedBtnEl = createChip("gauge", t('panelSpeedChip'), () => this.cycleSpeed());

    // Notas con lectura a medias
    this.playerEl.createDiv({ cls: "vocalis-section-title", text: t('panelContinueListening') });
    this.continueListEl = this.playerEl.createDiv({ cls: "vocalis-continue-list" });

    this.updatePlayerUI();
  }

  updatePlayerUI() {
    if (!this.playerEl) return;

    const active = this.isPlaying && this.currentFile;
    const total = this.sentences.length || 1;
    const current = Math.min(total, this.currentIndex + 1);
    const percent = Math.round((current / total) * 100);

    this.playerTitleEl.setText(active ? this.currentFile.basename : t('panelNoActiveReading'));
    this.playerSubtitleEl.setText(active ? t('panelProgressSubtitle', { current, total, percent }) : t('panelOpenNoteSubtitle'));
    this.stopBtnEl.toggle(!!active);
    this.progressWrapEl.toggle(!!active);
    this.progressBarEl.style.width = `${percent}%`;
    setIcon(this.playBtnEl, active && !this.isPaused ? "pause" : "play");

    const voiceKey = this.getVoiceFor(this.currentLang());
    this.voiceBtnEl.setText(voiceKey ? VOICE_DEFINITIONS[voiceKey].badge.replace(/^\S+\s/, "") : t('panelNoVoice', { lang: this.currentLang().toUpperCase() }));
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
      this.continueListEl.createDiv({ cls: "vocalis-continue-empty", text: t('panelNoPendingNotes') });
      return;
    }

    for (const [filePath, st] of entries) {
      const file = this.app.vault.getAbstractFileByPath(filePath);
      const isCurrent = this.isPlaying && this.currentFile && this.currentFile.path === filePath;
      // title y no aria-label: el tooltip de Obsidian chocaría con el de la ✕ anidada
      const item = this.continueListEl.createDiv({ cls: "vocalis-continue-item", attr: { title: t('panelContinueItemTitle', { path: filePath }) } });
      if (isCurrent) item.addClass("is-active");

      const row = item.createDiv({ cls: "vocalis-continue-row" });
      setIcon(row.createSpan({ cls: "vocalis-continue-icon" }), "file-text");
      row.createSpan({ cls: "vocalis-continue-name", text: file.basename });
      row.createSpan({ cls: "vocalis-continue-percent", text: `${st.percent} %` });
      // La nota en lectura no se borra: se volvería a guardar en la siguiente frase
      if (!isCurrent) {
        this.createIconButton(row, "x", t('panelRemoveProgress'), async (e) => {
          e.stopPropagation();
          delete this.settings.progress[filePath];
          await this.saveSettings();
          this.renderContinueList();
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
    delete this.settings.sentenceSilence; // Desde 1.3.0: sentencePauseMs y paragraphPauseMs
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
    containerEl.createEl("h2", { text: t('settingsTitle') });

    const lang = this.plugin.settings.language;

    new Setting(containerEl)
      .setName(t('settingsLangName'))
      .setDesc(t('settingsLangDesc'))
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
      .setName(t('settingsVoiceName', { lang: LANGUAGES[lang] }))
      .setDesc(t('settingsVoiceDesc'))
      .addDropdown((dropdown) => {
        for (const [key, val] of Object.entries(VOICE_DEFINITIONS)) {
          if (val.lang !== lang) continue;
          dropdown.addOption(key, this.plugin.isVoiceInstalled(key) ? t(val.nameKey) : t('settingsVoiceNotInstalled', { name: t(val.nameKey) }));
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
      .setName(t('settingsSpeedName'))
      .setDesc(t('settingsSpeedDesc'))
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
      .setName(t('settingsPiperExeName'))
      .setDesc(t('settingsPiperExeDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settingsPiperExePlaceholder'))
          .setValue(this.plugin.settings.piperExe || "")
          .onChange(async (val) => {
            this.plugin.settings.piperExe = val.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(t('settingsModelsDirName'))
      .setDesc(t('settingsModelsDirDesc'))
      .addText((text) => {
        text
          .setPlaceholder(t('settingsModelsDirPlaceholder'))
          .setValue(this.plugin.settings.modelsDir || "")
          .onChange(async (val) => {
            this.plugin.settings.modelsDir = val.trim();
            await this.plugin.saveSettings();
          });
      });

    const addPauseSetting = (nameKey, descKey, settingKey) => {
      new Setting(containerEl)
        .setName(t(nameKey))
        .setDesc(t(descKey))
        .addText((text) => {
          text
            .setPlaceholder(String(DEFAULT_SETTINGS[settingKey]))
            .setValue(String(this.plugin.settings[settingKey]))
            .onChange(async (val) => {
              const num = parseInt(val, 10);
              if (num >= 0) {
                this.plugin.settings[settingKey] = num;
                await this.plugin.saveSettings();
              }
            });
        });
    };
    addPauseSetting('settingsSentencePauseName', 'settingsSentencePauseDesc', 'sentencePauseMs');
    addPauseSetting('settingsParagraphPauseName', 'settingsParagraphPauseDesc', 'paragraphPauseMs');

    new Setting(containerEl)
      .setName(t('settingsClearHistoryName'))
      .setDesc(t('settingsClearHistoryDesc'))
      .addButton((btn) => {
        btn
          .setButtonText(t('settingsClearHistoryBtn'))
          .setWarning()
          .onClick(async () => {
            this.plugin.settings.progress = {};
            await this.plugin.saveSettings();
            new Notice(t('noticeProgressCleared'));
          });
      });

    // Sección de Créditos y Reconocimientos
    containerEl.createEl("h3", { text: t('settingsCreditsTitle') });
    const creditsP = containerEl.createEl("p", {
      text: t('settingsCreditsDesc')
    });
    creditsP.style.fontSize = "12.5px";
    creditsP.style.color = "var(--text-muted)";

    const creditsList = containerEl.createEl("ul");
    creditsList.style.fontSize = "12px";
    creditsList.style.color = "var(--text-muted)";

    for (const key of ['settingsCreditsPiper', 'settingsCreditsEspeak', 'settingsCreditsDatasets']) {
      creditsList.createEl("li", { text: t(key) });
    }
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

VocalisTTSPlugin.internals = { STRINGS, t, UI_LANG, trimWav, matchAlnum, parseSentences };

module.exports = VocalisTTSPlugin;
