// Banc (non publié) — essai local des pages `ajouter` et `connexion` dans un Chrome sans tête (protocole DevTools),
// contre le faux serveur. Google Identity Services est REMPLACÉ par une doublure (interception de
// accounts.google.com) : ce banc ne prouve rien de Google lui-même.
// Usage : node _banc/essai_navigateur.mjs <dossier des captures>
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { demarrer } from './faux_serveur.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT_CDP = 9333;
const captures = process.argv[2];
if (!captures) throw new Error('usage : node _banc/essai_navigateur.mjs <dossier des captures>');
fs.mkdirSync(captures, { recursive: true });

let echecs = 0, controles = 0;
const verifie = (ok, quoi) => { controles++; console.log((ok ? 'OK    ' : 'ECHEC ') + quoi); if (!ok) echecs++; };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const serveur = await demarrer();
const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'nitatv-banc-chrome-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT_CDP}`, `--user-data-dir=${profil}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });

async function finir(code) {
  try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  await serveur.arreter();
  await pause(500);
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch {}
  console.log(`\n${controles} contrôles, ${echecs} échec(s)`);
  process.exit(code);
}

try {
  // --- client DevTools minimal ---
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
  const ecouteurs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && attente.has(msg.id)) { const { ok, ko } = attente.get(msg.id); attente.delete(msg.id); msg.error ? ko(new Error(JSON.stringify(msg.error))) : ok(msg.result); }
    else ecouteurs.forEach((f) => f(msg));
  };
  const cdp = (method, params = {}) => new Promise((ok, ko) => { const id = ++n; attente.set(id, { ok, ko }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluer = async (expression) => {
    const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('évaluation : ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
    return r.result.value;
  };
  const attendre = async (expression, quoi, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await evaluer(expression)) return true; } catch {} await pause(100); }
    console.log(`  (délai dépassé en attendant : ${quoi})`);
    return false;
  };
  const capture = async (nom) => {
    const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(captures, nom + '.png'), Buffer.from(data, 'base64'));
  };
  const console_ = [];
  ecouteurs.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled') console_.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded') console_.push('[' + m.params.entry.level + '] ' + m.params.entry.text);
    if (m.method === 'Runtime.exceptionThrown') console_.push('[exception] ' + JSON.stringify(m.params.exceptionDetails).slice(0, 300));
  });

  // Doublure de Google Identity Services : renderButton() dessine un bouton ; un clic appelle le callback avec
  // un faux jeton « faux.<nonce> » — il porte le nonce passé à initialize(), comme le vrai jeton de Google.
  const DOUBLURE_GIS = `window.google = { accounts: { id: {
      _cfg: null, _inits: 0,
      initialize: function (c) { this._cfg = c; this._inits++; window.__gisInits = this._inits; window.__gisCfg = { client_id: c.client_id, nonce: c.nonce, ux_mode: c.ux_mode }; },
      renderButton: function (div, o) { var b = document.createElement('button'); b.id = 'faux-google'; b.textContent = 'Continuer avec Google (doublure du banc)';
        b.style.cssText = 'padding:12px 20px;border-radius:24px;border:0;background:#1a73e8;color:#fff;font:600 16px system-ui';
        var cfg = this._cfg; b.onclick = function () { cfg.callback({ credential: 'faux.' + cfg.nonce, select_by: 'btn' }); }; div.appendChild(b); },
      disableAutoSelect: function () {} } } };`;
  ecouteurs.push(async (m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const u = m.params.request.url;
    if (u.startsWith('https://accounts.google.com/gsi/client')) {
      await cdp('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(DOUBLURE_GIS).toString('base64') });
    } else {
      await cdp('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); // rien d'autre ne sort
    }
  });
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Log.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://*' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const aller = async (url) => { await cdp('Page.navigate', { url }); await attendre('document.readyState === "complete"', 'chargement'); await pause(150); };
  const appelBanc = async (chemin) => (await fetch(serveur.api + chemin, { method: 'POST' })).json();
  const rienGarde = async () => evaluer(`(async () => localStorage.length === 0 && sessionStorage.length === 0 && document.cookie === '' &&
      (indexedDB.databases ? (await indexedDB.databases()).length === 0 : true))()`);

  // ================= ajouter =================
  const tele = crypto.createECDH('prime256v1'); tele.generateKeys();
  const k = tele.getPublicKey(null, 'uncompressed').toString('base64url');
  const dechiffrer = (chiffre, depot) => {
    const env = JSON.parse(Buffer.from(chiffre, 'base64').toString('utf8'));
    const cle = Buffer.from(crypto.hkdfSync('sha256', tele.computeSecret(Buffer.from(env.epk, 'base64url')), Buffer.from(depot), Buffer.from('nitatv-depot-v1'), 32));
    const ct = Buffer.from(env.ct, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', cle, Buffer.from(env.iv, 'base64url'));
    d.setAuthTag(ct.subarray(-16));
    return JSON.parse(Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]).toString('utf8'));
  };

  // A. Xtream complet
  let dep = await appelBanc('/_banc/depot');
  await aller(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  verifie(await evaluer('location.hash === "" && location.href.endsWith("/ajouter.html")'), 'ajouter : le « # » est effacé de la barre d\'adresse');
  verifie(await attendre('!document.getElementById("formulaire").hidden', 'formulaire'), 'ajouter : le formulaire s\'affiche (clé de la télé acceptée)');
  await capture('ajouter_1_m3u_vide');
  await evaluer(`document.querySelector('input[value=xtream]').click(); true`);
  await capture('ajouter_2_xtream_vide');
  await evaluer(`document.getElementById('envoyer').click(); true`);
  verifie(await attendre(`document.getElementById('etat').textContent.includes('adresse du serveur')`, 'erreur champ'), 'ajouter : champ vide → message, rien envoyé');
  verifie(!serveur.journal.some((j) => j.chemin === '/v1/depot/' + dep.depot), 'ajouter : aucune requête tant que le formulaire est incomplet');
  await capture('ajouter_3_champ_manquant');
  const xt = { serveur: '  http://exemple.tv:8080 ', utilisateur: 'antony', mot_de_passe: 'p@ss:w/rd&é ', nom: 'Ma liste été' };
  await evaluer(`(() => { const v = ${JSON.stringify(xt)}; for (const c in v) document.getElementById(c).value = v[c]; return true; })()`);
  await evaluer(`document.getElementById('envoyer').click(); true`);
  verifie(await attendre(`!document.getElementById('fin').hidden && document.getElementById('fin-titre').textContent === 'Envoyé'`, 'Envoyé'), 'ajouter : xtream → « Envoyé »');
  await capture('ajouter_4_envoye');
  const recu = serveur.depots.get(dep.depot);
  verifie(recu && recu.use && typeof recu.chiffre === 'string', 'ajouter : le faux serveur a reçu un « chiffre »');
  const requete = serveur.journal.filter((j) => j.chemin === '/v1/depot/' + dep.depot);
  verifie(requete.some((j) => j.methode === 'OPTIONS') && requete.some((j) => j.methode === 'POST' && j.origine === serveur.site), 'ajouter : pré-vol CORS puis POST depuis l\'origine du site');
  verifie(!['p@ss', 'antony', 'exemple.tv'].some((s) => recu.chiffre.includes(s) || Buffer.from(recu.chiffre, 'base64').toString('utf8').includes(s)), 'ajouter : rien du clair dans ce que reçoit le serveur');
  const clair = dechiffrer(recu.chiffre, dep.depot);
  verifie(JSON.stringify(clair) === JSON.stringify({ v: 1, type: 'xtream', serveur: 'http://exemple.tv:8080', utilisateur: 'antony', mot_de_passe: 'p@ss:w/rd&é ', nom: 'Ma liste été' }),
    'ajouter : la « télé » (node:crypto) déchiffre exactement le contrat § 5 (serveur rogné, mot de passe intact)');
  verifie(await evaluer(`['url','serveur','utilisateur','mot_de_passe','nom'].every(i => document.getElementById(i).value === '')`), 'ajouter : les champs sont vidés après l\'envoi');
  verifie(await rienGarde(), 'ajouter : rien dans localStorage, sessionStorage, cookies, IndexedDB');

  // B. Le même QR une 2e fois (page rechargée par le lien) → 410
  await aller(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await attendre('!document.getElementById("formulaire").hidden', 'formulaire');
  await evaluer(`document.getElementById('url').value = 'https://exemple.tv/liste.m3u'; document.getElementById('envoyer').click(); true`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent.includes('plus valable')`, '410'), 'ajouter : même onglet, QR déjà servi rouvert (hashchange → rechargement) → « n\'est plus valable » (410)');
  await capture('ajouter_5_deja_servi');

  // C. M3U sans nom
  dep = await appelBanc('/_banc/depot');
  await aller(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await attendre('!document.getElementById("formulaire").hidden', 'formulaire');
  await evaluer(`document.getElementById('url').value = 'ftp://exemple.tv/x'; document.getElementById('envoyer').click(); true`);
  verifie(await attendre(`document.getElementById('etat').textContent.includes('http://')`, 'adresse refusée'), 'ajouter : une adresse non http(s) est refusée avant envoi');
  await evaluer(`document.getElementById('url').value = 'https://exemple.tv/get.php?username=a&password=b&type=m3u_plus'; document.getElementById('envoyer').click(); true`);
  await attendre(`document.getElementById('fin-titre').textContent === 'Envoyé'`, 'Envoyé');
  verifie(JSON.stringify(serveur.depots.get(dep.depot)?.chiffre ? dechiffrer(serveur.depots.get(dep.depot).chiffre, dep.depot) : null) === JSON.stringify({ v: 1, type: 'm3u', url: 'https://exemple.tv/get.php?username=a&password=b&type=m3u_plus' }),
    'ajouter : m3u sans nom → { v, type, url } sans champ « nom »');

  // D. Trop gros : local (> 16 Ko) puis serveur (413)
  dep = await appelBanc('/_banc/depot');
  await aller(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await attendre('!document.getElementById("formulaire").hidden', 'formulaire');
  await evaluer(`document.getElementById('url').value = 'https://exemple.tv/?' + 'x'.repeat(13000); document.getElementById('envoyer').click(); true`);
  verifie(await attendre(`document.getElementById('etat').textContent.includes('Trop long')`, 'trop long'), 'ajouter : plus de 16 Ko → « Trop long », sans requête');
  verifie(!serveur.journal.some((j) => j.methode === 'POST' && j.chemin === '/v1/depot/' + dep.depot), 'ajouter : … et rien n\'est parti');
  serveur.reglages.tailleMax = 100;
  await evaluer(`document.getElementById('url').value = 'https://exemple.tv/liste.m3u'; document.getElementById('envoyer').click(); true`);
  verifie(await attendre(`document.getElementById('etat').textContent.includes('Trop long') && !document.getElementById('envoyer').disabled`, '413'), 'ajouter : 413 du serveur → « Trop long », on peut corriger');
  await capture('ajouter_6_trop_gros');
  serveur.reglages.tailleMax = 16 * 1024;

  // E. CORS comme le VRAI serveur aujourd'hui (origine https://nita.tv) → le navigateur bloque → « Pas de connexion »
  serveur.reglages.origine = 'https://nita.tv';
  await evaluer(`document.getElementById('envoyer').click(); true`);
  verifie(await attendre(`document.getElementById('etat').textContent.includes('Pas de connexion')`, 'cors'), 'ajouter : CORS d\'une autre origine (le vrai serveur au 2026-11-12) → bloqué par le navigateur, « Pas de connexion »');
  await capture('ajouter_7_reseau');
  serveur.reglages.origine = serveur.site;

  // F. Liens abîmés
  await aller(`${serveur.site}/ajouter.html`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent.includes('incomplet')`, 'incomplet'), 'ajouter : sans « # » → « Ce lien est incomplet »');
  await capture('ajouter_8_lien_incomplet');
  await aller(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k.slice(0, -4)}AAAA`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent.includes('incomplet')`, 'clé hors courbe'), 'ajouter : clé hors de la courbe → refusée');
  await aller(`${serveur.site}/ajouter.html#d=../x&t=${dep.jeton}&k=${k}`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent.includes('incomplet')`, 'id piégé'), 'ajouter : identifiant de dépôt hors alphabet → refusé');

  // ================= connexion =================
  let ap = await appelBanc('/_banc/appairage');
  await aller(`${serveur.site}/connexion.html#a=${ap.appairage}&t=${ap.jeton}`);
  verifie(await evaluer('location.hash === ""'), 'connexion : le « # » est effacé');
  verifie(await attendre(`!!document.getElementById('faux-google')`, 'bouton'), 'connexion : le bouton (doublure GIS) s\'affiche après le nonce');
  const cfg = await evaluer('window.__gisCfg');
  verifie(cfg.client_id === '720100975511-ovrrf97ocsdactpc61b2peg26vgqt6nt.apps.googleusercontent.com', 'connexion : client Web du contrat');
  verifie(serveur.nonces.has(cfg.nonce) && cfg.nonce.length === 43, 'connexion : le nonce passé à Google est celui du serveur');
  await capture('connexion_1_bouton');
  await evaluer(`document.getElementById('faux-google').click(); true`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent === "C'est fait"`, 'fait'), 'connexion : 204 → « C\'est fait, regardez votre télé »');
  await capture('connexion_2_fait');
  const lie = serveur.appairages.get(ap.appairage);
  verifie(lie.lie && lie.google === 'faux.' + cfg.nonce, 'connexion : le serveur a reçu { jeton, google_id_token, nonce } cohérents');
  verifie(await rienGarde(), 'connexion : rien dans localStorage, sessionStorage, cookies, IndexedDB');

  // 2e téléphone sur le même QR → 410
  await aller(`${serveur.site}/connexion.html#a=${ap.appairage}&t=${ap.jeton}`);
  await attendre(`!!document.getElementById('faux-google')`, 'bouton');
  await evaluer(`document.getElementById('faux-google').click(); true`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent.includes('plus valable')`, '410'), 'connexion : QR déjà servi → 410 « n\'est plus valable »');
  await capture('connexion_3_deja_servi');

  // nonce_invalide → nouveau nonce, nouveau bouton, 2e appui réussi
  ap = await appelBanc('/_banc/appairage');
  await aller(`${serveur.site}/connexion.html#a=${ap.appairage}&t=${ap.jeton}`);
  await attendre(`!!document.getElementById('faux-google')`, 'bouton');
  const nonce1 = (await evaluer('window.__gisCfg')).nonce;
  serveur.reglages.refuserProchainNonce = true;
  await evaluer(`document.getElementById('faux-google').click(); true`);
  verifie(await attendre(`document.getElementById('etat').textContent.includes('trop de temps') && !!document.getElementById('faux-google') && window.__gisCfg.nonce !== ${JSON.stringify(nonce1)}`, 'nouveau nonce'),
    'connexion : 401 nonce_invalide → message, NOUVEAU nonce, bouton de nouveau');
  await capture('connexion_4_nonce_refuse');
  await evaluer(`document.getElementById('faux-google').click(); true`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent === "C'est fait"`, 'fait'), 'connexion : … et le 2e appui réussit');

  // CORS du vrai serveur aujourd'hui : pas d'en-tête sur GET /v1/nonce → la page ne peut pas préparer le bouton
  serveur.reglages.corsNonce = false;
  ap = await appelBanc('/_banc/appairage');
  await aller(`${serveur.site}/connexion.html#a=${ap.appairage}&t=${ap.jeton}`);
  verifie(await attendre(`document.getElementById('etat').textContent.includes('Impossible de joindre') && !document.getElementById('reessayer').hidden`, 'nonce bloqué'),
    'connexion : GET /v1/nonce sans CORS (le vrai serveur au 2026-11-12) → « Impossible de joindre » + Réessayer');
  await capture('connexion_5_nonce_bloque');
  serveur.reglages.corsNonce = true;
  await evaluer(`document.getElementById('reessayer').click(); true`);
  verifie(await attendre(`!!document.getElementById('faux-google') && document.getElementById('reessayer').hidden`, 'reprise'), 'connexion : « Réessayer » repart quand le serveur répond');

  // 503 pas_branche
  serveur.reglages.pasBranche = true;
  await aller(`${serveur.site}/connexion.html#a=${ap.appairage}&t=${ap.jeton}`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent.includes('Pas encore ouvert')`, '503'), 'connexion : 503 pas_branche → « Pas encore ouvert »');
  await capture('connexion_6_pas_branche');
  serveur.reglages.pasBranche = false;

  await aller(`${serveur.site}/connexion.html`);
  verifie(await attendre(`document.getElementById('fin-titre').textContent.includes('incomplet')`, 'incomplet'), 'connexion : sans « # » → « Ce lien est incomplet »');

  const bruit = console_.filter((l) => !/Failed to load resource/.test(l));
  verifie(!bruit.some((l) => /Content Security Policy|exception/i.test(l)), 'aucune violation CSP ni exception JavaScript');
  if (console_.length) console.log('  console :\n   ' + console_.join('\n   '));
  await finir(echecs ? 1 : 0);
} catch (e) {
  console.log('ERREUR ' + (e.stack || e));
  await finir(2);
}
