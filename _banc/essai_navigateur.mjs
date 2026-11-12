// Banc (non publié) — essai local des pages `ajouter`, `connexion` et `supprimer` dans un Chrome sans tête (protocole
// DevTools), contre le faux serveur. Google Identity Services est REMPLACÉ par une doublure (interception de
// accounts.google.com) : ce banc ne prouve rien de Google lui-même.
// Usage : node _banc/essai_navigateur.mjs <dossier des captures> [ajouter,connexion,supprimer]   (défaut : tout)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { demarrer, lireFauxJeton } from './faux_serveur.mjs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT_CDP = 9333;
const captures = process.argv[2];
if (!captures) throw new Error('usage : node _banc/essai_navigateur.mjs <dossier des captures> [parties]');
const parties = new Set((process.argv[3] || 'ajouter,connexion,supprimer').split(','));
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

  // Doublure de Google Identity Services : renderButton() dessine un bouton ; un clic appelle le callback avec un faux
  // jeton au FORMAT d'un JWT (« en-tête.charge.banc ») dont la charge porte aud, sub, email et le nonce passé à
  // initialize(), comme le vrai jeton de Google. Le compte choisi : window.__compteBanc (défaut ci-dessous).
  const DOUBLURE_GIS = `window.google = { accounts: { id: {
      _cfg: null, _inits: 0,
      initialize: function (c) { this._cfg = c; this._inits++; window.__gisInits = this._inits; window.__gisCfg = { client_id: c.client_id, nonce: c.nonce, ux_mode: c.ux_mode }; },
      renderButton: function (div, o) { window.__gisRendus = (window.__gisRendus || 0) + 1; window.__gisBouton = { text: o.text, locale: o.locale, nonce: this._cfg.nonce };
        var b = document.createElement('button'); b.id = 'faux-google'; b.textContent = (o.locale === 'en' ? 'Sign in with Google' : 'Se connecter avec Google') + ' (doublure du banc)';
        b.style.cssText = 'padding:12px 20px;border-radius:24px;border:0;background:#1a73e8;color:#fff;font:600 16px system-ui';
        var cfg = this._cfg;
        var b64 = function (x) { return btoa(unescape(encodeURIComponent(JSON.stringify(x)))).split('+').join('-').split('/').join('_').split('=').join(''); };
        b.onclick = function () { var c = window.__compteBanc || { sub: '1001', email: 'antony.banc@gmail.com' };
          cfg.callback({ credential: b64({ alg: 'none', typ: 'JWT' }) + '.' + b64({ aud: cfg.client_id, sub: c.sub, email: c.email, nonce: cfg.nonce }) + '.banc', select_by: 'btn' }); };
        div.appendChild(b); },
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

  // ================= supprimer (contrat § 3 bis) =================
  async function essaiSupprimer() {
    const S = serveur;
    // La même adresse (même #) ne recharge pas la page : passer par une page vide pour repartir de zéro.
    const ouvrir = async (url) => { await aller('about:blank'); await aller(url); };
    const el = (id) => `document.getElementById('${id}')`;
    const vu = (id) => `(!!${el(id)} && !${el(id)}.hidden && ${el(id)}.getClientRects().length > 0)`;
    const posts = () => S.journal.filter((j) => j.chemin === '/v1/compte/suppression' && j.methode === 'POST');
    const cliquer = (id) => evaluer(`${el(id)}.click(); true`);
    const bouton = () => attendre(`!!document.getElementById('faux-google') && ${vu('bouton-google')}`, 'bouton Google');
    const nonceBouton = () => evaluer('window.__gisCfg ? window.__gisCfg.nonce : null');
    const choisirCompte = (c) => evaluer(`window.__compteBanc = ${JSON.stringify(c)}; true`);
    const texte = (id) => evaluer(`${el(id)}.textContent.replace(/\u00a0/g, " ")`);
    const fini = (mot) => attendre(`${vu('fin')} && ${el('fin-titre')}.textContent.replace(/\u00a0/g, " ") === ${JSON.stringify(mot)}`, 'fin ' + mot);
    const confirmation = () => attendre(`${vu('confirmer')} && !${vu('bouton-google')}`, 'confirmation');
    let compteur = 0;
    const neuf = (avec = true) => { const c = { sub: 'sub-' + (++compteur), email: `compte${compteur}.banc@gmail.com` }; if (avec) S.comptes.set(c.sub, { email: c.email }); return c; };

    // --- 0. Le faux serveur rejoue la séquence MESURÉE sur le vrai (serveur_reel.txt, 2026-11-12 19:14 UTC) ---
    const appel = async (corps) => { const r = await fetch(S.api + '/v1/compte/suppression', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: S.site }, body: JSON.stringify(corps) });
      const t = await r.text(); return { statut: r.status, erreur: t ? JSON.parse(t).erreur : null, cors: r.headers.get('access-control-allow-origin') }; };
    const pre = await fetch(S.api + '/v1/compte/suppression', { method: 'OPTIONS', headers: { Origin: S.site, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
    verifie(pre.status === 204 && pre.headers.get('access-control-allow-methods') === 'POST' && pre.headers.get('access-control-allow-headers') === 'Content-Type' && pre.headers.get('access-control-allow-origin') === S.site,
      'faux serveur ≡ vrai : OPTIONS → 204, POST, Content-Type, l\'origine du site');
    const fauxJwt = 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJiYW5jIn0.faux';
    const r1 = await appel({ google_id_token: fauxJwt, nonce: 'faux_nonce_du_banc_site_suppression_000000' });
    const nReel = (await (await fetch(S.api + '/v1/nonce')).json()).nonce;
    const r2 = await appel({ google_id_token: fauxJwt, nonce: nReel });
    const r3 = await appel({ google_id_token: fauxJwt, nonce: nReel });
    const r4 = await appel({});
    verifie(JSON.stringify([r1, r2, r3, r4].map((r) => [r.statut, r.erreur, r.cors === S.site])) === JSON.stringify([[401, 'nonce_invalide', true], [401, 'google', true], [401, 'nonce_invalide', true], [400, 'corps', true]]),
      'faux serveur ≡ vrai : faux nonce → 401 nonce_invalide ; nonce réel + faux jeton → 401 google, puis le même nonce → 401 nonce_invalide (consommé) ; {} → 400 corps ; CORS partout');

    // --- 1. La langue : #fr / #en, sinon celle du navigateur ---
    const ua = await evaluer('navigator.userAgent');
    for (const [accept, attendue] of [['fr-CH,fr', 'fr'], ['en-US,en', 'en'], ['de-DE,de', 'en']]) {
      await cdp('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: accept });
      await ouvrir(`${S.site}/supprimer.html`);
      verifie(await attendre(`document.querySelector('section.langue.active')?.id === '${attendue}' && document.documentElement.lang === '${attendue}' && document.querySelector('section.langue.active .place-ici #ici') !== null`, 'langue ' + attendue),
        `supprimer : navigateur en « ${accept} » sans # → la page en ${attendue}, le bloc dans sa section`);
    }
    await cdp('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: 'en-US,en' });

    // --- 2. FR : le bouton, la confirmation, Annuler, puis la suppression ---
    await ouvrir(`${S.site}/supprimer.html#fr`);
    verifie(await bouton(), 'supprimer : #fr → le bouton Google s\'affiche après le nonce (navigateur en anglais)');
    let cfg = await evaluer('window.__gisCfg');
    const rendu = await evaluer('window.__gisBouton');
    verifie(cfg.client_id === '720100975511-ovrrf97ocsdactpc61b2peg26vgqt6nt.apps.googleusercontent.com' && cfg.ux_mode === 'popup', 'supprimer : client Web du contrat, fenêtre de Google (popup)');
    verifie(S.nonces.has(cfg.nonce) && !S.nonces.get(cfg.nonce).servi && cfg.nonce.length === 43, 'supprimer : le nonce passé à Google est un nonce frais du serveur');
    verifie(rendu.text === 'signin_with' && rendu.locale === 'fr', 'supprimer : bouton « Se connecter avec Google » (signin_with), en français');
    verifie(!(await evaluer(vu('etat'))) && !(await evaluer(vu('confirmer'))), 'supprimer : ni message ni confirmation au départ');
    await capture('supprimer_fr_1_bouton');

    let c = neuf();
    await choisirCompte(c);
    const avantPosts = posts().length;
    await cliquer('faux-google');
    verifie(await confirmation(), 'supprimer : l\'appui Google ouvre une CONFIRMATION (le bouton Google disparaît)');
    verifie((await texte('confirmer-titre')) === `Supprimer le compte NitaTV de ${c.email} ?`, 'supprimer : la confirmation nomme l\'adresse du compte Google choisi');
    verifie(await evaluer(`document.activeElement === ${el('annuler')}`), 'supprimer : le focus est sur « Annuler »');
    verifie(await evaluer(`document.getElementById('confirmer-titre').textContent.endsWith('\u00a0?')`), 'supprimer : typographie française — espace insécable avant « ? » (pas de « ? » seul en début de ligne)');
    await pause(400);
    verifie(posts().length === avantPosts && S.comptes.has(c.sub), 'supprimer : rien n\'est envoyé, rien n\'est effacé au seul appui Google');
    await capture('supprimer_fr_2_confirmer');

    const nonceA = cfg.nonce;
    await cliquer('annuler');
    verifie(await attendre(`${vu('bouton-google')} && !${vu('confirmer')} && window.__gisCfg.nonce !== ${JSON.stringify(nonceA)}`, 'annuler'), 'supprimer : « Annuler » → retour au bouton, avec un NOUVEAU nonce');
    verifie(posts().length === avantPosts && S.comptes.has(c.sub), 'supprimer : … et toujours rien d\'envoyé');

    cfg = await evaluer('window.__gisCfg');
    await cliquer('faux-google');
    await confirmation();
    await cliquer('supprimer');
    verifie(await fini('C\'est fait'), 'supprimer : « Supprimer mon compte » → 204 → « C\'est fait »');
    verifie((await texte('fin-texte')).startsWith(`Si un compte NitaTV était lié à ${c.email}, il est supprimé. Sinon, aucun compte NitaTV n'est lié à ce compte Google`), 'supprimer : le message couvre « supprimé » ET « aucun compte » (le 204 ne les distingue pas)');
    verifie(!S.comptes.has(c.sub) && S.suppressions.at(-1)?.sub === c.sub && S.suppressions.at(-1).existait === true, 'supprimer : le faux serveur a effacé CE compte');
    const p = posts().at(-1);
    verifie(S.journal.some((j) => j.chemin === '/v1/compte/suppression' && j.methode === 'OPTIONS' && j.origine === S.site) && p.origine === S.site, 'supprimer : pré-vol CORS puis POST depuis l\'origine du site');
    verifie(S.nonces.get(cfg.nonce)?.servi === true, 'supprimer : le POST portait le nonce donné à Google (consommé)');
    verifie(!(await evaluer(vu('bouton-google'))) && !(await evaluer(vu('confirmer'))) && !(await evaluer(vu('reessayer'))), 'supprimer : fini — plus de bouton ni de confirmation');
    verifie(await rienGarde(), 'supprimer : rien dans localStorage, sessionStorage, cookies, IndexedDB');
    await capture('supprimer_fr_3_fait');

    // --- 3. Aucun compte : le même 204, rien de créé ---
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    c = neuf(false);
    await choisirCompte(c);
    await cliquer('faux-google'); await confirmation(); await cliquer('supprimer');
    verifie(await fini('C\'est fait'), 'supprimer : aucun compte → 204 → le même « C\'est fait »');
    verifie(S.suppressions.at(-1)?.sub === c.sub && S.suppressions.at(-1).existait === false && !S.comptes.has(c.sub), 'supprimer : … et le faux serveur n\'a rien créé');

    // --- 4. 401 google → nouveau nonce AVANT de relancer Google ; le 2e essai réussit ---
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    c = neuf(); await choisirCompte(c);
    const nonceG = await nonceBouton();
    S.reglages.refuserProchainGoogle = true;
    await cliquer('faux-google'); await confirmation(); await cliquer('supprimer');
    verifie(await attendre(`${el('etat')}.textContent.replace(/\u00a0/g, " ").startsWith(${JSON.stringify('Google n\'a pas pu confirmer ce compte : rien n\'a été supprimé')}) && ${vu('bouton-google')} && !${vu('confirmer')} && window.__gisCfg.nonce !== ${JSON.stringify(nonceG)}`, '401 google'),
      'supprimer : 401 google → « rien n\'a été supprimé », le bouton revient avec un NOUVEAU nonce');
    const nonceG2 = await nonceBouton();
    verifie(S.nonces.get(nonceG)?.servi === true && S.nonces.has(nonceG2) && !S.nonces.get(nonceG2).servi, 'supprimer : l\'ancien nonce est consommé, le nouveau est frais (demandé au serveur)');
    verifie(S.comptes.has(c.sub), 'supprimer : … et le compte est toujours là');
    await capture('supprimer_fr_4_refus_google');
    await cliquer('faux-google'); await confirmation(); await cliquer('supprimer');
    verifie(await fini('C\'est fait') && !S.comptes.has(c.sub), 'supprimer : … le 2e essai (nouveau nonce) efface le compte');

    // --- 5. 401 nonce_invalide (la confirmation a trop attendu) ---
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    c = neuf(); await choisirCompte(c);
    const nonceN = await nonceBouton();
    await cliquer('faux-google'); await confirmation();
    if (S.nonces.has(nonceN)) S.nonces.get(nonceN).expire = Date.now() - 1; // les 5 minutes du nonce passées pendant la confirmation
    await cliquer('supprimer');
    verifie(await attendre(`${el('etat')}.textContent.replace(/\u00a0/g, " ").startsWith('La confirmation a pris trop de temps') && ${vu('bouton-google')} && window.__gisCfg.nonce !== ${JSON.stringify(nonceN)}`, '401 nonce'),
      'supprimer : 401 nonce_invalide → « trop de temps », le bouton revient avec un NOUVEAU nonce');
    await capture('supprimer_fr_5_nonce_expire');
    await cliquer('faux-google'); await confirmation(); await cliquer('supprimer');
    verifie(await fini('C\'est fait') && !S.comptes.has(c.sub), 'supprimer : … et le 2e essai réussit');

    // --- 6. Les autres refus, tels quels (400/429 → refusée ; 500 → erreur du serveur) ---
    for (const [statut, corps, debut] of [[400, { erreur: 'corps', message: 'x' }, 'La suppression a été refusée (400) : rien n\'a été supprimé'],
      [429, { erreur: 'trop', message: 'x' }, 'La suppression a été refusée (429)'], [500, { erreur: 'interne', message: 'x' }, 'Le serveur de NitaTV a répondu par une erreur (500)']]) {
      await ouvrir(`${S.site}/supprimer.html#fr`);
      await bouton();
      const avant = await nonceBouton();
      S.reglages.reponseForcee = { statut, corps };
      await cliquer('faux-google'); await confirmation(); await cliquer('supprimer');
      verifie(await attendre(`${el('etat')}.textContent.replace(/\u00a0/g, " ").startsWith(${JSON.stringify(debut)}) && ${vu('bouton-google')} && window.__gisCfg.nonce !== ${JSON.stringify(avant)}`, 'refus ' + statut),
        `supprimer : ${statut} → « ${debut}… », nouveau nonce, bouton`);
    }

    // --- 7. Réseau : la réponse n'arrive pas (ici, le navigateur bloque : CORS d'une autre origine) ---
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    c = neuf(); await choisirCompte(c);
    const nonceR = await nonceBouton();
    await cliquer('faux-google'); await confirmation();
    S.reglages.origine = 'https://nita.tv';
    await cliquer('supprimer');
    verifie(await attendre(`${el('etat')}.textContent.replace(/\u00a0/g, " ").startsWith(${JSON.stringify('La réponse du serveur de NitaTV n\'est pas arrivée')})`, 'réseau'), 'supprimer : réponse perdue → « n\'est pas arrivée… la refaire ne change rien »');
    verifie(S.comptes.has(c.sub), 'supprimer : … (le navigateur a bloqué : rien d\'effacé)');
    // Le réseau toujours coupé : le nouveau nonce ne vient pas non plus → le message RESTE, « Réessayer » s'ajoute.
    verifie(await attendre(`${vu('reessayer')} && !${vu('bouton-google')}`, 'réessayer') && (await texte('etat')).startsWith('La réponse du serveur de NitaTV n\'est pas arrivée'),
      'supprimer : … réseau toujours coupé → le message reste (pas remplacé par « Impossible de joindre »), « Réessayer »');
    await capture('supprimer_fr_6_reseau');
    S.reglages.origine = S.site;
    await cliquer('reessayer');
    verifie(await attendre(`${vu('bouton-google')} && !${vu('reessayer')} && window.__gisCfg.nonce !== ${JSON.stringify(nonceR)}`, 'nouveau nonce'), 'supprimer : … « Réessayer » → le bouton revient avec un NOUVEAU nonce');

    // --- 8. Préparation impossible : serveur injoignable, puis « Réessayer » ---
    S.reglages.corsNonce = false;
    await ouvrir(`${S.site}/supprimer.html#fr`);
    verifie(await attendre(`${el('etat')}.textContent.replace(/\u00a0/g, " ").startsWith('Impossible de joindre le serveur') && ${vu('reessayer')} && !${vu('bouton-google')}`, 'injoignable'), 'supprimer : nonce injoignable → message + « Réessayer »');
    S.reglages.corsNonce = true;
    await cliquer('reessayer');
    verifie(await attendre(`${vu('bouton-google')} && !${vu('reessayer')} && !${vu('etat')}`, 'reprise'), 'supprimer : « Réessayer » repart quand le serveur répond');

    // --- 9. 503 pas_branche : au chargement, puis après la confirmation ---
    S.reglages.pasBranche = true;
    await ouvrir(`${S.site}/supprimer.html#fr`);
    verifie(await fini('Le service des comptes n\'est pas encore ouvert') && (await texte('fin-texte')) === 'Il n\'y a rien à supprimer : aucun compte NitaTV n\'existe encore.', 'supprimer : 503 au chargement → « pas encore ouvert : il n\'y a rien à supprimer »');
    await capture('supprimer_fr_7_pas_branche');
    S.reglages.pasBranche = false;
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    await cliquer('faux-google'); await confirmation();
    S.reglages.pasBranche = true;
    const noncesAvant503 = S.journal.filter((j) => j.chemin === '/v1/nonce').length;
    await cliquer('supprimer');
    verifie(await fini('Le service des comptes n\'est pas encore ouvert'), 'supprimer : 503 au POST (CORS présent) → le même message, pas « réseau »');
    await pause(300);
    verifie(S.journal.filter((j) => j.chemin === '/v1/nonce').length === noncesAvant503, 'supprimer : … reconnu AU POST : la page s\'arrête là, sans redemander de nonce');
    S.reglages.pasBranche = false;

    // --- 10. Changer de langue en cours de route : le bouton se redessine, SANS nouveau nonce ---
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    const nonceL = await nonceBouton();
    const nbNonces = S.nonces.size;
    await evaluer(`document.querySelector('.langues a[href="#en"]').click(); true`);
    verifie(await attendre(`document.querySelector('section.langue.active')?.id === 'en' && document.documentElement.lang === 'en' && document.querySelector('#en .place-ici #ici') !== null && ${el('ici-intro')}.textContent.replace(/\u00a0/g, " ").startsWith('Sign in with the Google account')`, 'anglais'),
      'supprimer : « English » → la section anglaise, le bloc déplacé, les textes en anglais');
    verifie(await attendre(`window.__gisBouton.locale === 'en' && window.__gisBouton.nonce === ${JSON.stringify(nonceL)}`, 'bouton en anglais') && S.nonces.size === nbNonces,
      'supprimer : le bouton Google redessiné en anglais, avec le MÊME nonce (aucun nouveau demandé)');
    await capture('supprimer_en_1_bouton');
    c = neuf(); await choisirCompte(c);
    await cliquer('faux-google'); await confirmation();
    verifie((await texte('confirmer-titre')) === `Delete the NitaTV account of ${c.email}?` && (await texte('supprimer')) === 'Delete my account', 'supprimer : confirmation en anglais');
    await capture('supprimer_en_2_confirmer');
    await evaluer(`document.querySelector('.langues a[href="#fr"]').click(); true`);
    verifie(await attendre(`${el('confirmer-titre')}.textContent.replace(/\u00a0/g, " ") === ${JSON.stringify(`Supprimer le compte NitaTV de ${c.email} ?`)} && ${vu('confirmer')}`, 'retour fr'), 'supprimer : changer de langue PENDANT la confirmation la garde (traduite)');
    await evaluer(`document.querySelector('.langues a[href="#en"]').click(); true`);
    await attendre(`${el('supprimer')}.textContent.replace(/\u00a0/g, " ") === 'Delete my account'`, 'en');
    await cliquer('supprimer');
    verifie(await fini('Done') && !S.comptes.has(c.sub) && (await texte('fin-texte')).startsWith(`If a NitaTV account was linked to ${c.email}, it is deleted.`), 'supprimer : EN → « Done », compte effacé');
    await capture('supprimer_en_3_fait');
    S.reglages.refuserProchainGoogle = true;
    await ouvrir(`${S.site}/supprimer.html#en`);
    await bouton();
    await cliquer('faux-google'); await confirmation(); await cliquer('supprimer');
    verifie(await attendre(`${el('etat')}.textContent.replace(/\u00a0/g, " ").startsWith('Google could not confirm this account: nothing was deleted.') && ${vu('bouton-google')}`, '401 en'), 'supprimer : 401 google en anglais');
    await capture('supprimer_en_4_refus_google');
    S.reglages.pasBranche = true;
    await ouvrir(`${S.site}/supprimer.html#en`);
    verifie(await fini('The account service is not open yet'), 'supprimer : 503 en anglais');
    await capture('supprimer_en_5_pas_branche');
    S.reglages.pasBranche = false;

    // --- 11. Bureau (1280 px), clair et sombre ---
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    // Le thème suit le système (sombre sur ce PC) : le clair se force, sinon il ne serait jamais regardé.
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    await capture('supprimer_bureau_fr_clair_1_bouton');
    c = neuf(); await choisirCompte(c);
    await cliquer('faux-google'); await confirmation();
    await capture('supprimer_bureau_fr_clair_2_confirmer');
    await cliquer('supprimer'); await fini("C'est fait");
    await capture('supprimer_bureau_fr_clair_3_fait');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await ouvrir(`${S.site}/supprimer.html#en`);
    await bouton();
    c = neuf(); await choisirCompte(c);
    await cliquer('faux-google'); await confirmation();
    await capture('supprimer_bureau_en_sombre_confirmer');
    await cliquer('supprimer'); await fini('Done');
    await capture('supprimer_bureau_en_sombre_fait');
    await cdp('Emulation.setEmulatedMedia', { features: [] });
    await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

    // --- 12. Sans JavaScript : les deux langues, la voie de l'app et l'e-mail restent lisibles ---
    await cdp('Emulation.setScriptExecutionDisabled', { value: true });
    await ouvrir(`${S.site}/supprimer.html`);
    await capture('supprimer_sans_js');
    await cdp('Emulation.setScriptExecutionDisabled', { value: false });
    // (l'évaluation passe par le protocole, qui tourne même scripts coupés ; on relit le DOM tel que chargé sans JS)
    verifie(await evaluer(`!document.documentElement.classList.contains('js') && getComputedStyle(document.getElementById('fr')).display !== 'none' && getComputedStyle(document.getElementById('en')).display !== 'none' && document.getElementById('ici').hidden && document.querySelectorAll('a[href^="mailto:contact@nita.tv"]').length === 2`),
      'supprimer : sans JavaScript → les deux langues visibles, le bloc Google caché, l\'e-mail de secours présent');

    // --- 13. Les liens : l'accueil mène à la page, la politique aussi (FR et EN) ---
    await aller(`${S.site}/index.html`);
    verifie(await evaluer(`!!document.querySelector('footer a[href="supprimer.html"]')`), 'accueil : le pied de page mène à supprimer.html');
    await aller(`${S.site}/confidentialite.html`);
    verifie(await evaluer(`!!document.querySelector('#fr a[href="supprimer.html#fr"]') && !!document.querySelector('#en a[href="supprimer.html#en"]')`), 'politique : la section FR mène à supprimer.html#fr, l\'anglaise à supprimer.html#en');
    verifie((await fetch(`${S.site}/supprimer.html`)).status === 200 && (await fetch(`${S.site}/google.js`)).status === 200 && (await fetch(`${S.site}/supprimer.js`)).status === 200, 'site : supprimer.html, supprimer.js, google.js servis');
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    verifie(await rienGarde(), 'supprimer : rien gardé dans le navigateur, à la fin de tout le parcours');
  }

  // ================= ajouter =================
  if (parties.has('ajouter')) {
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

  }

  // ================= connexion =================
  if (parties.has('connexion')) {
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
  verifie(lie.lie && lireFauxJeton(lie.google)?.nonce === cfg.nonce, 'connexion : le serveur a reçu { jeton, google_id_token, nonce } cohérents');
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

  }

  // ================= supprimer =================
  if (parties.has('supprimer')) await essaiSupprimer();

  const bruit = console_.filter((l) => !/Failed to load resource/.test(l));
  verifie(!bruit.some((l) => /Content Security Policy|exception/i.test(l)), 'aucune violation CSP ni exception JavaScript');
  if (console_.length) console.log('  console :\n   ' + console_.join('\n   '));
  await finir(echecs ? 1 : 0);
} catch (e) {
  console.log('ERREUR ' + (e.stack || e));
  await finir(2);
}
