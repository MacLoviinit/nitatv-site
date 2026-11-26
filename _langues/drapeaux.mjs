// Les drapeaux du menu des langues — un outil à part du générateur (il ne tourne qu'au changement d'un drapeau).
//
// Source : le jeu libre flag-icons 7.6.0 (licence MIT, https://github.com/lipis/flag-icons), format 4x3, téléchargé à
// part (`npm pack flag-icons@7.6.0`, puis extraire). Sortie : images/drapeaux/<pays>.svg + la licence recopiée.
// Les drapeaux de l'Espagne et du Mexique y pèsent ~80 ko chacun (leurs armoiries, dessinées trait par trait) pour
// une image de 20 px : ils sont rendus par Chrome sans tête en PNG 96x72, enveloppés dans un SVG (quelques ko).
// Le choix du pays par langue est dans _langues/generer.mjs (LANGUES, champ drapeau).
//
// Usage : node _langues/drapeaux.mjs <dossier « package » de flag-icons>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUES } from './generer.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(SITE, 'images', 'drapeaux');
const source = process.argv[2];
if (!source) throw new Error('usage : node _langues/drapeaux.mjs <dossier package de flag-icons>');
const A_RENDRE = new Set(['es', 'mx']);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(SORTIE, { recursive: true });
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(SORTIE, 'LICENCE-flag-icons.txt'));
const pays = [...new Set(LANGUES.map((l) => l.drapeau))];
for (const p of pays) {
  if (A_RENDRE.has(p)) continue;
  fs.copyFileSync(path.join(source, 'flags', '4x3', p + '.svg'), path.join(SORTIE, p + '.svg'));
}

const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'nitatv-drapeaux-'));
const chrome = spawn(process.env.CHROME || 'google-chrome', ['--headless=new', '--remote-debugging-port=9336',
  `--user-data-dir=${profil}`, '--no-first-run', 'about:blank'], { stdio: 'ignore', detached: true });
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) {
    try { cible = (await (await fetch('http://127.0.0.1:9336/json/list')).json()).find((t) => t.type === 'page'); } catch {}
    if (!cible) await pause(200);
  }
  if (!cible) throw new Error('Chrome sans tête injoignable');
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let n = 0;
  const attente = new Map();
  ws.onmessage = (m) => { const x = JSON.parse(m.data); if (x.id && attente.has(x.id)) attente.get(x.id)(x); };
  const cdp = (method, params = {}) => new Promise((ok) => { const id = ++n; attente.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 96, height: 72, deviceScaleFactor: 1, mobile: false });
  for (const p of A_RENDRE) {
    const svg = fs.readFileSync(path.join(source, 'flags', '4x3', p + '.svg'));
    const page = `<html><body style="margin:0"><img style="display:block;width:96px;height:72px" src="data:image/svg+xml;base64,${svg.toString('base64')}"></body></html>`;
    await cdp('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(page).toString('base64') });
    await pause(800);
    const r = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 96, height: 72, scale: 1 } });
    const png = r.result.data;
    const enveloppe = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><image width="640" height="480" href="data:image/png;base64,${png}"/></svg>\n`;
    fs.writeFileSync(path.join(SORTIE, p + '.svg'), enveloppe);
  }
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
  await pause(300);
  fs.rmSync(profil, { recursive: true, force: true });
}
for (const f of fs.readdirSync(SORTIE).sort()) console.log(f, fs.statSync(path.join(SORTIE, f)).size);
process.exit(0);
