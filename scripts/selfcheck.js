// Comprobación sin Obsidian de la lógica pura de main.js. Uso: npm test
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

class Stub {}
const decoration = { mark: () => ({ range: () => ({}) }), none: {}, set: () => ({}) };
const mocks = {
  obsidian: {
    Plugin: Stub, PluginSettingTab: Stub, ItemView: Stub, Setting: Stub, Notice: Stub, MarkdownView: Stub, TFile: Stub,
    setIcon() {}, getLanguage: () => 'es'
  },
  '@codemirror/state': { StateField: { define: (spec) => spec }, StateEffect: { define: () => ({}) } },
  '@codemirror/view': { Decoration: decoration, EditorView: { decorations: { from: () => ({}) } } }
};
const realLoad = Module._load;
Module._load = (request, ...rest) => mocks[request] || realLoad(request, ...rest);

const mainPath = path.join(__dirname, '..', 'main.js');
const { ENGINE_BUNDLE, STRINGS, t, UI_LANG, trimWav, matchAlnum, parseSentences } = require(mainPath).internals;

// --- Idiomas: mismas claves y ningún t() sin definir
assert.strictEqual(UI_LANG, 'es');
assert.deepStrictEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS.es).sort());
const source = fs.readFileSync(mainPath, 'utf8');
for (const [, key] of source.matchAll(/\bt\('(\w+)'/g)) {
  if (key !== 'clave') assert.ok(STRINGS.es[key], `t() sin clave: ${key}`);
}
for (const [, key] of source.matchAll(/nameKey: '(\w+)'/g)) assert.ok(STRINGS.es[key], `voz sin clave: ${key}`);
assert.strictEqual(t('panelProgressSubtitle', { current: 1, total: 2, percent: 50 }), 'Frase 1 de 2 · 50 %');

// --- Funciona sin red
for (const banned of [/\bfetch\s*\(/, /\brequestUrl\b/, /XMLHttpRequest/, /WebSocket/]) {
  assert.ok(!banned.test(source), `main.js no debe usar la red: ${banned}`);
}

// --- Instalador y plugin de acuerdo; cada voz del instalador existe en el catálogo
const setupText = fs.readFileSync(path.join(__dirname, 'vocalis-setup.cmd'), 'utf8');
assert.ok(setupText.includes(`$bundle = '${ENGINE_BUNDLE}'`), 'ENGINE_BUNDLE distinto de $bundle en el instalador');
const setupVoices = [...setupText.matchAll(/path = '[^']*\/([^'/]+)'/g)].map((m) => m[1]);
assert.strictEqual(setupVoices.length, 2);
for (const voice of setupVoices) assert.ok(source.includes(`modelFile: '${voice}.onnx'`), `voz sin catálogo: ${voice}`);

// --- trimWav: 22050 Hz; 100 ms de silencio, 200 ms de voz, 100 ms de silencio
function wav(samples, rate = 22050) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + samples.length * 2, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(samples.length * 2, 40);
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(v, i * 2));
  return Buffer.concat([header, data]);
}
const rate = 22050;
const ms = (n) => Math.round((rate * n) / 1000);
const voiced = [...Array(ms(100)).fill(0), ...Array(ms(200)).fill(5000), ...Array(ms(100)).fill(0)];
const trimmed = trimWav(wav(voiced), 50, 300, 10);
const trimmedSamples = trimmed.readUInt32LE(40) / 2;
assert.strictEqual(trimmedSamples, ms(10) + ms(200) + ms(10) + ms(50));
assert.strictEqual(trimmed.readUInt32LE(4) + 8, trimmed.length);
assert.strictEqual(trimmed.length, 44 + trimmedSamples * 2);
assert.strictEqual(trimmed.readInt16LE(44 + ms(10) * 2), 5000);
assert.strictEqual(trimmed.readInt16LE(trimmed.length - 2), 0);
const silent = wav(Array(100).fill(0));
assert.strictEqual(trimWav(silent, 50), silent);

// --- matchAlnum: ignora marcas, signos y mayúsculas; devuelve posiciones originales
assert.deepStrictEqual(matchAlnum('Antes. Hola, mundo. Después', 'hola mundo'), [7, 19]);
assert.deepStrictEqual(matchAlnum('Uno dos', 'tres'), null);
assert.deepStrictEqual(matchAlnum('Uno', '...'), null);
const longSentence = 'Esta es una frase bastante larga con una nota en medio y un final distinto';
const withFootnote = longSentence.replace('nota en', 'nota 3 en');
assert.deepStrictEqual(matchAlnum(`X ${withFootnote} Y`, longSentence), [2, 2 + withFootnote.length]);
assert.ok(matchAlnum('a|b|c', 'a, b, c'));

// --- parseSentences: fin de párrafo y frontmatter
const parsed = parseSentences('---\ntitle: x\n---\nUna frase. Otra frase.\n\nNuevo párrafo.\nSin línea en blanco.', 'es');
assert.deepStrictEqual(parsed.map((p) => p.clean), ['Una frase.', 'Otra frase.', 'Nuevo párrafo.', 'Sin línea en blanco.']);
assert.deepStrictEqual(parsed.map((p) => !!p.paragraphEnd), [false, true, false, false]);
assert.strictEqual(parsed[2].from.line, 5);

console.log('selfcheck ok');
