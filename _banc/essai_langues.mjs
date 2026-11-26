// Banc (non publié) — les pages d'accueil en 21 langues dans un Chrome sans tête (protocole DevTools), servies par un
// petit serveur local : le bandeau qui PROPOSE la langue (jamais une redirection), le choix retenu, la page sans
// stockage, la bande de captures (trois visibles, flèches, sens de l'arabe), aucune page plus large que l'écran, et
// les captures d'écran à regarder.
// Usage : node _banc/essai_langues.mjs <dossier des captures>
// La langue du navigateur est simulée par Network.setUserAgentOverride (acceptLanguage → navigator.languages, qui y
// GARDE les « ;q= » qu'un vrai navigateur n'y met pas : le banc donne des listes sans poids, sauf un cas exprès) ; la
// souris / le doigt par Emulation (mobile + toucher → « pointer: coarse »). Ce que ça ne reproduit pas : un vrai téléphone
// (ses polices, son défilement à l'inertie), Safari et Firefox.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUES } from '../_langues/generer.mjs';

const SITE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';
const CHROME = process.env.CHROME || (WINDOWS ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : 'google-chrome');
const PORT_CDP = 9334;
const captures = process.argv[2];
if (!captures) throw new Error('usage : node _banc/essai_langues.mjs <dossier des captures>');
fs.mkdirSync(captures, { recursive: true });

let echecs = 0, controles = 0;
const verifie = (ok, quoi) => { controles++; console.log((ok ? 'OK    ' : 'ECHEC ') + quoi); if (!ok) echecs++; return ok; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// --- le serveur statique ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg',
  '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.css': 'text/css' };
const serveur = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(SITE, p);
  if (!f.startsWith(SITE)) { res.writeHead(403); res.end(); return; }
  if (p.endsWith('/')) f = path.join(f, 'index.html');
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); res.end('404'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${serveur.address().port}/`;

const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'nitatv-banc-langues-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profil}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'],
  { stdio: 'ignore', detached: !WINDOWS });

async function finir(code) {
  if (WINDOWS) { try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
  else { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} }
  serveur.close();
  await pause(500);
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  console.log(`\n${controles} contrôles, ${echecs} échec(s)`);
  process.exit(code);
}

try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) {
    try { cible = (await (await fetch(`http://127.0.0.1:${PORT_CDP}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
    if (!cible) await pause(200);
  }
  if (!cible) throw new Error('Chrome sans tête injoignable');
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let n = 0;
  const attente = new Map();
  const erreurs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && attente.has(msg.id)) { const { ok, ko } = attente.get(msg.id); attente.delete(msg.id); msg.error ? ko(new Error(JSON.stringify(msg.error))) : ok(msg.result); }
    else if (msg.method === 'Runtime.exceptionThrown') erreurs.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
  };
  const cdp = (method, params = {}) => new Promise((ok, ko) => { const id = ++n; attente.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluer = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('évaluation : ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };
  await cdp('Page.enable');
  await cdp('Runtime.enable');

  let stockageBloque = null;
  const regler = async ({ largeur, langue, toucher }) => {
    await cdp('Emulation.setDeviceMetricsOverride', { width: largeur, height: largeur > 600 ? 800 : 860, deviceScaleFactor: 1, mobile: !!toucher });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: !!toucher, maxTouchPoints: toucher ? 5 : 1 });
    await cdp('Network.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (banc NitaTV) Chrome', acceptLanguage: langue });
    // Le toucher émulé rend le pointeur « coarse » : la page cache alors ses flèches. Sans lui, Chrome sans tête n'a
    // AUCUN pointeur (« pointer: none », « hover: none » — mesuré ; setEmulatedMedia ne change ni hover ni pointer) :
    // c'est pourquoi la page cache les flèches sur « pointer: coarse » et non sur « hover: none ».
  };
  const viderStockage = async () => {
    await cdp('Storage.clearDataForOrigin', { origin: BASE.replace(/\/$/, ''), storageTypes: 'local_storage' });
  };
  const aller = async (chemin) => {
    await cdp('Page.navigate', { url: BASE + chemin });
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      try { if (await evaluer('document.readyState === "complete"')) break; } catch {}
      await pause(100);
    }
    await pause(250);
  };
  const capture = async (nom) => {
    await pause(300);
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(captures, nom + '.png'), Buffer.from(data, 'base64'));
  };
  const bandeau = () => evaluer(`(() => { const b = document.querySelector('.bandeau'); if (!b) return null;
    const a = b.querySelector('a'); return { lang: b.lang, dir: b.dir, texte: a.textContent, href: a.getAttribute('href'),
      fermer: b.querySelector('button').getAttribute('aria-label') }; })()`);
  const memoire = () => evaluer(`(() => { try { return localStorage.getItem('nitatv.langue'); } catch (e) { return 'BLOQUÉ'; } })()`);
  const chemin = (code) => { const l = LANGUES.find((x) => x.code === code); return l.dossier ? l.dossier + '/' : ''; };

  // ---------- 1. Aucune page plus large que l'écran, à 412 et à 1280 (le texte le plus long tient) ----------
  for (const [largeur, toucher] of [[412, true], [1280, false]]) {
    for (const l of LANGUES) {
      await regler({ largeur, langue: l.lang, toucher });
      await aller(chemin(l.code));
      const m = await evaluer(`({ page: document.documentElement.scrollWidth, ecran: window.innerWidth,
        location: location.pathname, bandeau: !!document.querySelector('.bandeau') })`);
      verifie(m.page <= m.ecran, `${l.code} à ${largeur} : la page tient dans l'écran (${m.page} ≤ ${m.ecran})`);
      verifie(m.location === '/' + chemin(l.code), `${l.code} à ${largeur} : aucune redirection (${m.location})`);
      verifie(!m.bandeau, `${l.code} à ${largeur} : navigateur dans la langue de la page → pas de bandeau`);
    }
  }

  // ---------- 2. Les captures demandées : fr, en, ar, de, ja, ru à 1280 et à 412 ----------
  for (const code of ['fr', 'en', 'ar', 'de', 'ja', 'ru']) {
    const l = LANGUES.find((x) => x.code === code);
    for (const [largeur, toucher] of [[1280, false], [412, true]]) {
      await regler({ largeur, langue: l.lang, toucher });
      await viderStockage();
      await aller(chemin(code));
      await capture(`${code}_${largeur}`);
    }
  }

  // ---------- 3. La bande : trois visibles à l'ordinateur, les flèches, le sens de l'arabe ----------
  const etatBande = () => evaluer(`(() => { const d = document.querySelector('.defile'); const r = d.getBoundingClientRect();
    const lis = [...d.querySelectorAll('li')];
    const visibles = lis.map((li, i) => [i, li.getBoundingClientRect()]).filter(([i, b]) => b.left >= r.left - 1 && b.right <= r.right + 1).map(([i]) => i);
    const fl = (c) => { const b = document.querySelector(c); return { vue: b.getClientRects().length > 0 && getComputedStyle(b).display !== 'none', inactive: b.disabled }; };
    return { visibles, x: d.scrollLeft, prec: fl('.prec'), suiv: fl('.suiv'), snap: getComputedStyle(d).scrollSnapType,
      lazy: lis.map((li) => li.querySelector('img').loading) }; })()`);
  for (const code of ['fr', 'ar']) {
    await regler({ largeur: 1280, langue: LANGUES.find((x) => x.code === code).lang, toucher: false });
    await aller(chemin(code));
    let e = await etatBande();
    verifie(e.visibles.length === 3 && e.visibles.join() === '0,1,2', `${code} à 1280 : trois captures visibles, les trois premières (${e.visibles})`);
    verifie(e.snap.includes('x') && e.snap.includes('mandatory'), `${code} : scroll-snap-type x mandatory (${e.snap})`);
    verifie(e.prec.vue && e.suiv.vue, `${code} à 1280 : les deux flèches se voient`);
    verifie(e.prec.inactive && !e.suiv.inactive, `${code} : au début, « précédente » inactive, « suivante » active`);
    verifie(e.lazy.join() === 'auto,auto,auto,lazy,lazy,lazy,lazy', `${code} : chargement différé après la 3ᵉ (${e.lazy})`);
    await evaluer(`document.querySelector('.suiv').click(); true`);
    await pause(900);
    e = await etatBande();
    verifie(e.visibles.join() === '1,2,3', `${code} : « suivante » avance d'une capture (${e.visibles})`);
    verifie(code === 'ar' ? e.x < 0 : e.x > 0, `${code} : le défilement va dans le sens de lecture (scrollLeft ${Math.round(e.x)})`);
    verifie(!e.prec.inactive, `${code} : « précédente » devient active`);
    if (code === 'ar') await capture('ar_1280_bande_apres_suivante');
    for (let i = 0; i < 6; i++) { await evaluer(`document.querySelector('.suiv').click(); true`); await pause(700); }
    e = await etatBande();
    verifie(e.visibles.join() === '4,5,6' && e.suiv.inactive, `${code} : au bout, les trois dernières, « suivante » inactive (${e.visibles})`);
    if (code === 'fr') await capture('fr_1280_bande_au_bout');
  }
  await regler({ largeur: 412, langue: 'fr', toucher: true });
  await aller('');
  let e = await etatBande();
  verifie(!e.prec.vue && !e.suiv.vue, 'fr à 412 (toucher) : pas de flèches');
  verifie(e.visibles.join() === '0', `fr à 412 : une capture entière à l'écran, la suivante dépasse (${e.visibles})`);
  await evaluer(`document.querySelector('.defile').scrollBy({ left: 400 }); true`);
  await pause(800);
  e = await etatBande();
  verifie(e.visibles.join() === '1', `fr à 412 : un glissement se cale sur la capture suivante (scroll-snap) (${e.visibles}, x=${Math.round(e.x)})`);
  await capture('fr_412_bande_glissee');

  // ---------- 4. Le bandeau de langue : proposé, jamais imposé ----------
  await regler({ largeur: 1280, langue: 'de-DE,de,en', toucher: false });
  await viderStockage();
  await aller('');
  let b = await bandeau();
  verifie(b && b.texte === 'Diese Seite auf Deutsch ansehen →' && b.lang === 'de' && b.href.endsWith('/de/'),
    `navigateur allemand sur la page fr : bandeau en allemand vers /de/ (${JSON.stringify(b)})`);
  verifie(await evaluer('location.pathname') === '/', 'navigateur allemand : la page fr reste affichée (aucune redirection)');
  await capture('bandeau_de_sur_fr_1280');
  await regler({ largeur: 412, langue: 'de-DE,de', toucher: true });
  await viderStockage();
  await aller('');
  await capture('bandeau_de_sur_fr_412');
  // la croix : le refus est retenu
  await evaluer(`document.querySelector('.bandeau button').click(); true`);
  verifie(!(await bandeau()), 'la croix ferme le bandeau');
  verifie(await memoire() === 'fr', `la croix retient la langue de la page (${await memoire()})`);
  await aller('');
  verifie(!(await bandeau()), 'rechargée : le refus est retenu, plus de bandeau');
  // le lien du bandeau : le choix est retenu, et la page allemande n'en propose pas d'autre
  await viderStockage();
  await aller('');
  await evaluer(`document.querySelector('.bandeau a').click(); true`);
  await pause(1200);
  verifie(await evaluer('location.pathname') === '/de/', 'le lien du bandeau mène à /de/');
  verifie(await memoire() === 'de', `le choix est retenu (${await memoire()})`);
  verifie(!(await bandeau()), 'sur /de/ avec un navigateur allemand : pas de bandeau');
  // le sélecteur en bas de page retient aussi le choix ; revenir au français ne repropose pas l'allemand
  await evaluer(`document.querySelector('.langues a[data-langue="fr"]').click(); true`);
  await pause(1200);
  verifie(await evaluer('location.pathname') === '/', 'le sélecteur mène au français');
  verifie(await memoire() === 'fr' && !(await bandeau()), 'choisi au sélecteur : retenu, et le navigateur allemand ne le contredit pas');
  // la correspondance des variantes
  for (const [acc, attendu] of [['zh-TW', 'zh-hant'], ['zh-HK', 'zh-hant'], ['zh-CN', 'zh-hans'], ['zh', 'zh-hans'],
    ['es-MX', 'es-419'], ['es-US', 'es-419'], ['es-ES', 'es'], ['es', 'es'], ['pt-PT', 'pt-pt'], ['pt-BR', 'pt'],
    ['ar-EG', 'ar'], ['sv-SE,nb', null], ['sv-SE,ja', 'ja'], ['ja;q=0.8', 'ja'], ['fr-CA', null]]) {
    await regler({ largeur: 1280, langue: acc, toucher: false });
    await viderStockage();
    await aller('');
    b = await bandeau();
    const voulu = attendu ? '/' + chemin(attendu) : null;
    verifie(attendu ? (b && b.href.endsWith(voulu) && b.lang === LANGUES.find((x) => x.code === attendu).lang) : !b,
      `navigateur « ${acc} » sur la page fr → ${attendu ? 'propose ' + voulu : 'rien'} (${b ? b.href : 'aucun bandeau'})`);
    if (acc === 'zh-TW') await capture('bandeau_zh-hant_sur_fr_1280');
  }
  // l'arabe proposé sur la page fr : le bandeau se lit de droite à gauche
  await regler({ largeur: 412, langue: 'ar', toucher: true });
  await viderStockage();
  await aller('');
  b = await bandeau();
  verifie(b && b.dir === 'rtl' && b.lang === 'ar', `bandeau arabe : dir="rtl" (${JSON.stringify(b)})`);
  await capture('bandeau_ar_sur_fr_412');

  // ---------- 5. Sans stockage (navigation privée stricte) : la page marche ----------
  const { identifier } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source:
    `Object.defineProperty(window, 'localStorage', { get() { throw new Error('stockage bloqué (banc)'); } });` });
  stockageBloque = identifier;
  await regler({ largeur: 1280, langue: 'de', toucher: false });
  erreurs.length = 0;
  await aller('');
  b = await bandeau();
  verifie(b && b.href.endsWith('/de/'), 'stockage bloqué : le bandeau est proposé quand même');
  await evaluer(`document.querySelector('.bandeau button').click(); true`);
  verifie(!(await bandeau()), 'stockage bloqué : la croix ferme le bandeau');
  await evaluer(`document.querySelector('.suiv').click(); true`);
  await pause(800);
  verifie((await etatBande()).visibles.join() === '1,2,3', 'stockage bloqué : les flèches marchent');
  verifie(erreurs.length === 0, `stockage bloqué : aucune exception (${erreurs.join(' | ')})`);
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: stockageBloque });

  // ---------- 6. Sans programme : la page et la bande sont là ----------
  await cdp('Emulation.setScriptExecutionDisabled', { value: true });
  await regler({ largeur: 1280, langue: 'de', toucher: false });
  await aller('');
  const sansJs = await (async () => {
    await cdp('Emulation.setScriptExecutionDisabled', { value: false });
    const r = await evaluer(`({ bandeau: !!document.querySelector('.bandeau'), fleches: [...document.querySelectorAll('.fleche')].every((f) => f.hidden),
      captures: document.querySelectorAll('.defile img').length, defile: getComputedStyle(document.querySelector('.defile')).overflowX })`);
    return r;
  })();
  verifie(!sansJs.bandeau && sansJs.fleches && sansJs.captures === 7 && sansJs.defile === 'auto',
    `sans programme : pas de bandeau, flèches cachées, 7 captures dans une bande qui défile (${JSON.stringify(sansJs)})`);

  verifie(erreurs.length === 0, `aucune exception dans les pages (${erreurs.join(' | ')})`);
  await finir(echecs ? 1 : 0);
} catch (e) {
  console.log('ERREUR DU BANC ' + (e.stack || e));
  echecs++;
  await finir(2);
}
