// Vigilante semanal de Piper y voces: solo avisa, nunca actualiza nada.
// Uso local (sin issue): node scripts/check-upstream.mjs [--setup <ruta del .cmd>]
// En GitHub Actions, con GITHUB_TOKEN y GITHUB_REPOSITORY, abre o comenta un único issue.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ISSUE_TITLE = 'Vigilante: novedades de Piper o voces';
const UPSTREAM_HF = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';

async function fetchRetry(url, options = {}) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(60000) });
      if (res.status < 500 && res.status !== 429) return res;
      last = new Error(`HTTP ${res.status}`);
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, options.retryDelay ?? 5000));
  }
  throw last;
}

// Lee los valores fijos del propio instalador, para no duplicarlos
export function parseSetup(text) {
  const one = (re, label) => {
    const m = text.match(re);
    if (!m) throw new Error(`No se encuentra ${label} en el instalador`);
    return m[1];
  };
  const urls = (name) => [...one(new RegExp(`\\$${name} = @\\(([^)]*)\\)`), name).matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const voices = [...text.matchAll(/path = '([^']+)'\s+onnx = '([0-9a-f]{64})'\s+json = '([0-9a-f]{64})'/g)]
    .map((m) => ({ path: m[1], onnx: m[2], json: m[3], file: m[1].split('/').pop() }));
  if (voices.length === 0) throw new Error('No se encuentran voces en el instalador');
  return {
    engineVersion: one(/\$engineVersion = '([^']+)'/, 'engineVersion'),
    engineUrls: urls('engineUrls'),
    voiceSources: urls('voiceSources'),
    voices
  };
}

async function reachable(url, findings) {
  try {
    const res = await fetchRetry(url, { method: 'HEAD', redirect: 'follow' });
    if (!res.ok) findings.push(`Enlace caído (HTTP ${res.status}): ${url}`);
  } catch (e) {
    findings.push(`Enlace sin respuesta (${e.message}): ${url}`);
  }
}

async function latestRelease(repo, headers) {
  const res = await fetchRetry(`https://api.github.com/repos/${repo}/releases/latest`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function collectFindings(setup, headers = {}) {
  const findings = [];

  for (const url of setup.engineUrls) await reachable(url, findings);
  for (const voice of setup.voices) {
    for (const template of setup.voiceSources) {
      for (const suffix of ['.onnx', '.onnx.json']) {
        await reachable(template.replace('{path}', voice.path + suffix).replace('{file}', voice.file + suffix), findings);
      }
    }
  }

  try {
    const piper = await latestRelease('rhasspy/piper', headers);
    if (piper.tag_name !== setup.engineVersion) findings.push(`rhasspy/piper publicó ${piper.tag_name} (fijado: ${setup.engineVersion}).`);
  } catch (e) {
    findings.push(`No se pudo consultar rhasspy/piper: ${e.message}`);
  }

  try {
    const successor = await latestRelease('OHF-Voice/piper1-gpl', headers);
    const standalone = successor.assets.map((a) => a.name).filter((n) => /\.exe$|windows.*\.zip$|win.*\.zip$/i.test(n));
    if (standalone.length > 0) findings.push(`OHF-Voice/piper1-gpl ${successor.tag_name} publicó un posible motor autónomo para Windows: ${standalone.join(', ')}. Migrarlo es un rediseño: ver agents.md.`);
  } catch (e) {
    findings.push(`No se pudo consultar OHF-Voice/piper1-gpl: ${e.message}`);
  }

  // Compara el contenido actual en la rama main de piper-voices con los hash fijados
  for (const voice of setup.voices) {
    try {
      const res = await fetchRetry(`${UPSTREAM_HF}${voice.path}.onnx`, { method: 'HEAD', redirect: 'manual' });
      const etag = (res.headers.get('x-linked-etag') || '').replace(/"/g, '');
      if (etag !== voice.onnx) findings.push(`Cambió el modelo de ${voice.file} en piper-voices (${etag || 'sin hash'}).`);
      const json = await fetchRetry(`${UPSTREAM_HF}${voice.path}.onnx.json`, { redirect: 'follow' });
      const sha = crypto.createHash('sha256').update(Buffer.from(await json.arrayBuffer())).digest('hex');
      if (sha !== voice.json) findings.push(`Cambió la configuración de ${voice.file} en piper-voices.`);
    } catch (e) {
      findings.push(`No se pudo comprobar ${voice.file}: ${e.message}`);
    }
  }

  return findings;
}

// Abre un único issue y comenta solo si el contenido cambió
export async function reportIssue(findings, repo, token) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'vocalis-check-upstream' };
  const api = `https://api.github.com/repos/${repo}/issues`;
  const body = `${findings.map((f) => `- ${f}`).join('\n')}\n\nProcedimiento: calcular SHA-256, revisar licencia y compatibilidad, probar y publicar con tag nuevo.`;
  const list = await (await fetchRetry(`${api}?state=open&per_page=100`, { headers })).json();
  const existing = list.find((i) => i.title === ISSUE_TITLE);
  if (!existing) {
    const res = await fetchRetry(api, { method: 'POST', headers, body: JSON.stringify({ title: ISSUE_TITLE, body }) });
    if (!res.ok) throw new Error(`No se pudo crear el issue: HTTP ${res.status}`);
    return 'creado';
  }
  const comments = await (await fetchRetry(`${existing.comments_url}?per_page=100`, { headers })).json();
  const lastBody = comments.length > 0 ? comments[comments.length - 1].body : existing.body;
  if (lastBody === body) return 'sin cambios';
  const res = await fetchRetry(existing.comments_url, { method: 'POST', headers, body: JSON.stringify({ body }) });
  if (!res.ok) throw new Error(`No se pudo comentar el issue: HTTP ${res.status}`);
  return 'comentado';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const flag = process.argv.indexOf('--setup');
  const setupPath = flag > 0 ? process.argv[flag + 1] : new URL('./vocalis-setup.cmd', import.meta.url);
  const setup = parseSetup(fs.readFileSync(setupPath, 'utf8'));
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  const headers = token ? { Authorization: `Bearer ${token}`, 'User-Agent': 'vocalis-check-upstream' } : { 'User-Agent': 'vocalis-check-upstream' };
  const findings = await collectFindings(setup, headers);
  if (findings.length === 0) {
    console.log('Sin novedades.');
  } else {
    console.log(findings.join('\n'));
    if (token && repo) console.log(`Issue: ${await reportIssue(findings, repo, token)}`);
  }
}
