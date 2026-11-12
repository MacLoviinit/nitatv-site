// Banc (non publié) — essai local des pages `ajouter`, `connexion` (« un seul scan », § 5 bis) et `supprimer` dans un Chrome sans tête (protocole
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
    await pause(350); // les transitions de la maquette (.2 s : points, boutons) finies avant l'image
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

    // --- 11. Le verre Sombre de la maquette, QUEL QUE SOIT le thème du système (Antony : « le sombre … notre thème
    //     par défaut ») ; au téléphone (captures plus haut) et au bureau (1280 px) ---
    const habitS = () => evaluer(`[getComputedStyle(document.documentElement).colorScheme, getComputedStyle(document.body).color,
      getComputedStyle(document.body).backgroundImage.includes('linear-gradient(rgb(19, 23, 41)'), getComputedStyle(document.querySelector('section.langue.active')).backgroundImage.startsWith('linear-gradient(165deg'),
      getComputedStyle(document.getElementById('supprimer')).backgroundImage].join(' | ')`);
    await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await ouvrir(`${S.site}/supprimer.html#fr`);
    await bouton();
    const hs = await habitS();
    verifie(hs === 'dark | rgb(243, 247, 251) | true | true | linear-gradient(165deg, rgb(255, 122, 134), rgb(224, 56, 74))', 'supprimer : système en CLAIR → la page reste au verre Sombre (fond .app, carte .verre, bouton danger de la maquette) — lu : ' + hs);
    await capture('supprimer_bureau_fr_1_bouton');
    c = neuf(); await choisirCompte(c);
    await cliquer('faux-google'); await confirmation();
    await capture('supprimer_bureau_fr_2_confirmer');
    await cliquer('supprimer'); await fini("C'est fait");
    await capture('supprimer_bureau_fr_3_fait');
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await ouvrir(`${S.site}/supprimer.html#en`);
    await bouton();
    c = neuf(); await choisirCompte(c);
    await cliquer('faux-google'); await confirmation();
    await capture('supprimer_bureau_en_confirmer');
    await cliquer('supprimer'); await fini('Done');
    await capture('supprimer_bureau_en_fait');
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

  // ================= ajouter et connexion : l'onboarding du téléphone (contrat § 5, § 5 bis) =================
  // La « télé » du banc : sa paire P-256 ; son k va dans le QR, sa clé privée déchiffre ce que le faux serveur a reçu.
  const tele = crypto.createECDH('prime256v1'); tele.generateKeys();
  const k = tele.getPublicKey(null, 'uncompressed').toString('base64url');
  const autre = crypto.createECDH('prime256v1'); autre.generateKeys(); // une clé qui n'est PAS celle du QR (le piège du serveur)
  const kAutre = autre.getPublicKey(null, 'uncompressed').toString('base64url');
  const dechiffrer = (chiffre, sel) => {
    const env = JSON.parse(Buffer.from(chiffre, 'base64').toString('utf8'));
    const cle = Buffer.from(crypto.hkdfSync('sha256', tele.computeSecret(Buffer.from(env.epk, 'base64url')), Buffer.from(sel), Buffer.from('nitatv-depot-v1'), 32));
    const ct = Buffer.from(env.ct, 'base64url');
    const d = crypto.createDecipheriv('aes-256-gcm', cle, Buffer.from(env.iv, 'base64url'));
    d.setAuthTag(ct.subarray(-16));
    return JSON.parse(Buffer.concat([d.update(ct.subarray(0, -16)), d.final()]).toString('utf8'));
  };
  // Le clair reçu par la « télé », ou l'échec NOMMÉ (un déchiffrement refusé n'est pas un plantage du banc).
  const clairRecu = (depot, sel = depot) => {
    const d = serveur.depots.get(depot);
    if (!d || !d.chiffre) return 'RIEN REÇU';
    try { return JSON.stringify(dechiffrer(d.chiffre, sel)); } catch (e) { return 'DÉCHIFFREMENT REFUSÉ : ' + e.message; }
  };
  const el = (id) => `document.getElementById('${id}')`;
  const vu = (id) => `(!!${el(id)} && !${el(id)}.hidden && ${el(id)}.getClientRects().length > 0)`;
  const texteDe = (id) => evaluer(`${el(id)}.textContent.replace(/ /g, " ").replace(/\\s+/g, " ").trim()`);
  const cliquer = (id) => evaluer(`${el(id)}.click(); true`);
  const etape = (id) => attendre(`${vu('etape-' + id)}`, 'étape ' + id);
  const finAvec = (titre) => attendre(`${vu('etape-fin')} && ${el('fin-titre')}.textContent.replace(/ /g, " ") === ${JSON.stringify(titre)}`, 'fin ' + titre);
  const points = () => evaluer(`[...document.querySelectorAll('.points i')].map(i => i.className || '-').join(',')`);
  const remplir = (v) => evaluer(`(() => { const v = ${JSON.stringify(v)}; for (const c in v) { const e = document.getElementById(c); e.value = v[c]; e.dispatchEvent(new Event('input', { bubbles: true })); } return true; })()`);
  const choisirType = (t) => evaluer(`document.querySelector('#etape-type .ligne[data-type="${t}"]').click(); true`);
  const ua = await evaluer('navigator.userAgent');
  const langue = (l) => cdp('Emulation.setUserAgentOverride', { userAgent: ua, acceptLanguage: l === 'fr' ? 'fr-FR,fr' : 'en-US,en' });
  const ouvrir = async (url) => { await aller('about:blank'); await aller(url); };
  const champsVides = () => evaluer(`['url','guide','serveur','utilisateur','mot_de_passe'].every(i => document.getElementById(i).value === '')`);
  // Le verre SOMBRE de la maquette, mesuré dans la page : fond, texte, bouton plein, case
  const habit = () => evaluer(`(() => { const cs = (s) => document.querySelector(s) && getComputedStyle(document.querySelector(s));
      return [getComputedStyle(document.documentElement).colorScheme, cs('body').color, cs('body').backgroundImage.includes('linear-gradient(rgb(19, 23, 41)'),
        cs('.boite') ? (parseFloat(cs('.boite').borderRadius) / parseFloat(cs('.boite').fontSize)).toFixed(2) + 'em' : '-', cs('.bouton.plein') ? cs('.bouton.plein').backgroundImage : '-'].join(' | '); })()`);

  if (parties.has('ajouter')) {
  // ---------- A. FR : Type de connexion → Xtream → Validé ----------
  await langue('fr');
  let dep = await appelBanc('/_banc/depot');
  await ouvrir(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  verifie(await evaluer('location.hash === "" && location.href.endsWith("/ajouter.html")'), 'ajouter : le « # » est effacé de la barre d\'adresse');
  verifie(await etape('type'), 'ajouter : le QR de playlist mène DROIT à « Type de connexion »');
  verifie((await texteDe('type-titre')) === 'Type de connexion' && (await evaluer(`[...document.querySelectorAll('#etape-type .ligne b')].map(b => b.textContent).join('/')`)) === 'Xtream Codes/Fichier M3U',
    'ajouter : FR — « Type de connexion », « Xtream Codes » / « Fichier M3U » (libellés de l\'app)');
  verifie(await evaluer(`document.querySelector('#etape-type .ligne.sel').dataset.type === 'xtream' && document.querySelectorAll('#etape-type .ligne .icone-carre svg').length === 2`), 'ajouter : Xtream choisi d\'office, une icône par carte (live, films)');
  verifie(!(await evaluer(vu('plus-tard'))), 'ajouter : pas de « Plus tard » (QR de playlist seul)');
  verifie((await points()) === 'ici,-', 'ajouter : les points — 1er sur 2');
  const h = await habit();
  verifie(h === 'dark | rgb(243, 247, 251) | true | 1.50em | linear-gradient(135deg, rgb(0, 229, 255), rgb(0, 193, 255))', 'ajouter : verre Sombre de la maquette (color-scheme, texte #F3F7FB, fond .app, rayon 1,5 em, bouton cyan → bleu) — lu : ' + h);
  await capture('ajouter_fr_1_type');
  await cliquer('suivant');
  verifie(await etape('xtream'), 'ajouter : Suivant → « Connexion Xtream »');
  verifie((await points()) === 'fait,ici', 'ajouter : les points — 2e sur 2');
  verifie((await evaluer(`[...document.querySelectorAll('#etape-xtream label')].map(l => l.textContent).join('/')`)) === 'Serveur/Nom d\'utilisateur/Mot de passe', 'ajouter : les champs Xtream de l\'onboarding');
  await capture('ajouter_fr_2_xtream_vide');
  await cliquer('envoyer-xtream');
  verifie(await attendre(`${el('etat-xtream')}.textContent === 'Veuillez remplir tous les champs' && document.activeElement === ${el('serveur')}`, 'champs vides'), 'ajouter : champs vides → « Veuillez remplir tous les champs » (l\'app), le curseur au 1er');
  verifie(!serveur.journal.some((j) => j.chemin === '/v1/depot/' + dep.depot), 'ajouter : aucune requête tant que le formulaire est incomplet');
  await capture('ajouter_fr_3_champs_vides');
  await remplir({ serveur: '  http://exemple.tv:8080 ', utilisateur: 'antony', mot_de_passe: 'p@ss:w/rd&é ' });
  verifie(!(await evaluer(vu('etat-xtream'))), 'ajouter : le refus s\'efface dès qu\'on tape de nouveau');
  await cliquer('oeil');
  verifie(await evaluer(`${el('mot_de_passe')}.type === 'text' && ${el('oeil')}.getAttribute('aria-label') === 'Masquer le mot de passe'`), 'ajouter : l\'œil montre le mot de passe (« Masquer le mot de passe »)');
  await capture('ajouter_fr_4_xtream_rempli');
  await cliquer('envoyer-xtream');
  verifie(await finAvec('Validé !'), 'ajouter : Envoyer → « Validé ! »');
  verifie((await texteDe('fin-texte')) === 'Votre playlist est envoyée à votre appareil.', 'ajouter : « Votre playlist est envoyée à votre appareil. »');
  verifie((await points()) === 'fait,fait', 'ajouter : fini — tous les points faits');
  await capture('ajouter_fr_5_valide');
  const reqs = serveur.journal.filter((j) => j.chemin === '/v1/depot/' + dep.depot);
  verifie(reqs.some((j) => j.methode === 'OPTIONS') && reqs.some((j) => j.methode === 'POST' && j.origine === serveur.site), 'ajouter : pré-vol CORS puis POST depuis l\'origine du site');
  const recu = serveur.depots.get(dep.depot);
  verifie(!['p@ss', 'antony', 'exemple.tv'].some((s) => recu.chiffre.includes(s) || Buffer.from(recu.chiffre, 'base64').toString('utf8').includes(s)), 'ajouter : rien du clair dans ce que reçoit le serveur');
  verifie(clairRecu(dep.depot) === JSON.stringify({ v: 1, type: 'xtream', serveur: 'http://exemple.tv:8080', utilisateur: 'antony', mot_de_passe: 'p@ss:w/rd&é ' }),
    'ajouter : la « télé » (node:crypto, clé du QR, sel = d du QR) déchiffre le contrat § 5 exact (serveur rogné, mot de passe intact, pas de nom) — ' + clairRecu(dep.depot));
  verifie(await champsVides(), 'ajouter : les champs sont vidés à la fin');
  verifie(await rienGarde(), 'ajouter : rien dans localStorage, sessionStorage, cookies, IndexedDB');

  // ---------- B. Le même QR une 2e fois (même onglet : hashchange → rechargement) → 410 ----------
  await aller(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await etape('type'); await choisirType('m3u'); await cliquer('suivant'); await etape('m3u');
  await remplir({ url: 'https://exemple.tv/liste.m3u' }); await cliquer('envoyer-m3u');
  verifie(await finAvec('Ce QR code n\'est plus valable'), 'ajouter : même onglet, QR déjà servi rouvert → « n\'est plus valable » (410)');
  await capture('ajouter_fr_6_deja_servi');

  // ---------- C. M3U SANS guide : l'adresse sans schéma devient http:// (comme l'app), le guide blanc est ABSENT ----------
  dep = await appelBanc('/_banc/depot');
  await ouvrir(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await etape('type'); await choisirType('m3u');
  verifie(await evaluer(`document.querySelector('#etape-type .ligne.sel').dataset.type === 'm3u' && document.querySelector('#etape-type .ligne[data-type="xtream"]').getAttribute('aria-checked') === 'false'`), 'ajouter : un appui sur « Fichier M3U » le choisit');
  await capture('ajouter_fr_7_type_m3u');
  await cliquer('suivant');
  verifie(await etape('m3u'), 'ajouter : Suivant → « Playlist M3U »');
  verifie((await evaluer(`[...document.querySelectorAll('#etape-m3u label, #etape-m3u small')].map(l => l.textContent.replace(/ /g, ' ')).join('/')`)) === 'URL de la playlist/Entrez l\'URL complète de votre fichier M3U ou M3U8./Adresse du guide TV (XMLTV)/Vide : celui de la playlist',
    'ajouter : M3U — l\'adresse, puis « Adresse du guide TV (XMLTV) » et « Vide : celui de la playlist » (libellés de l\'app)');
  await capture('ajouter_fr_8_m3u_vide');
  await cliquer('envoyer-m3u');
  verifie(await attendre(`${el('etat-m3u')}.textContent === 'Veuillez entrer une URL'`, 'url manquante'), 'ajouter : adresse vide → « Veuillez entrer une URL »');
  await remplir({ url: 'ftp://exemple.tv/x' }); await cliquer('envoyer-m3u');
  verifie(await attendre(`${el('etat-m3u')}.textContent === 'URL invalide'`, 'url invalide'), 'ajouter : ftp:// → « URL invalide », rien d\'envoyé');
  await capture('ajouter_fr_9_url_invalide');
  verifie(!serveur.journal.some((j) => j.methode === 'POST' && j.chemin === '/v1/depot/' + dep.depot), 'ajouter : … aucune requête');
  await remplir({ url: ' exemple.tv/get.php?username=a&password=b ', guide: '   ' }); await cliquer('envoyer-m3u');
  await finAvec('Validé !');
  verifie(clairRecu(dep.depot) === JSON.stringify({ v: 1, type: 'm3u', url: 'http://exemple.tv/get.php?username=a&password=b' }),
    'ajouter : M3U sans guide → { v, type, url } — le guide blanc est ABSENT du clair, l\'adresse prend http:// — ' + clairRecu(dep.depot));

  // ---------- D. M3U AVEC guide ----------
  dep = await appelBanc('/_banc/depot');
  await ouvrir(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await etape('type'); await choisirType('m3u'); await cliquer('suivant'); await etape('m3u');
  await remplir({ url: 'https://exemple.tv/liste.m3u', guide: ' https://exemple.tv/epg.xml.gz ' });
  await capture('ajouter_fr_10_m3u_guide');
  await cliquer('envoyer-m3u');
  await finAvec('Validé !');
  verifie(clairRecu(dep.depot) === JSON.stringify({ v: 1, type: 'm3u', url: 'https://exemple.tv/liste.m3u', guide: 'https://exemple.tv/epg.xml.gz' }),
    'ajouter : M3U avec guide → « guide » rogné, après « url » — ' + clairRecu(dep.depot));

  // ---------- E. Retour, trop gros (local puis 413), réseau ----------
  dep = await appelBanc('/_banc/depot');
  await ouvrir(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await etape('type'); await choisirType('m3u'); await cliquer('suivant'); await etape('m3u');
  await evaluer(`document.querySelector('#etape-m3u .retour-type').click(); true`);
  verifie(await etape('type') && (await points()) === 'ici,-', 'ajouter : Retour → « Type de connexion »');
  await cliquer('suivant'); await etape('m3u');
  await remplir({ url: 'https://exemple.tv/?' + 'x'.repeat(13000) }); await cliquer('envoyer-m3u');
  verifie(await attendre(`${el('etat-m3u')}.textContent.startsWith('Trop long')`, 'trop long'), 'ajouter : plus de 16 Ko → « Trop long », sans requête');
  verifie(!serveur.journal.some((j) => j.methode === 'POST' && j.chemin === '/v1/depot/' + dep.depot), 'ajouter : … et rien n\'est parti');
  serveur.reglages.tailleMax = 100;
  await remplir({ url: 'https://exemple.tv/liste.m3u' }); await cliquer('envoyer-m3u');
  verifie(await attendre(`${el('etat-m3u')}.textContent.startsWith('Trop long') && !${el('envoyer-m3u')}.disabled`, '413'), 'ajouter : 413 du serveur → « Trop long », on peut corriger');
  serveur.reglages.tailleMax = 16 * 1024;
  serveur.reglages.origine = 'https://nita.tv';
  await cliquer('envoyer-m3u');
  verifie(await attendre(`${el('etat-m3u')}.textContent.startsWith('Pas de connexion')`, 'cors'), 'ajouter : réponse bloquée (CORS d\'une autre origine) → « Pas de connexion »');
  await capture('ajouter_fr_11_reseau');
  serveur.reglages.origine = serveur.site;
  serveur.reglages.pasBranche = true;
  await cliquer('envoyer-m3u');
  verifie(await attendre(`${el('etat-m3u')}.textContent.startsWith('Le service n\\'est pas encore ouvert')`, '503'), 'ajouter : 503 → « pas encore ouvert »');
  serveur.reglages.pasBranche = false;

  // ---------- F. Liens abîmés ----------
  await ouvrir(`${serveur.site}/ajouter.html`);
  verifie(await finAvec('Ce lien est incomplet'), 'ajouter : sans « # » → « Ce lien est incomplet »');
  await capture('ajouter_fr_12_lien_incomplet');
  await ouvrir(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k.slice(0, -4)}AAAA`);
  verifie(await finAvec('Ce lien est incomplet'), 'ajouter : clé hors de la courbe → refusée');
  await ouvrir(`${serveur.site}/ajouter.html#d=../x&t=${dep.jeton}&k=${k}`);
  verifie(await finAvec('Ce lien est incomplet'), 'ajouter : identifiant de dépôt hors alphabet → refusé');

  // ---------- G. EN ----------
  await langue('en');
  dep = await appelBanc('/_banc/depot');
  await ouvrir(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await etape('type');
  verifie((await texteDe('type-titre')) === 'Connection type' && (await evaluer(`[...document.querySelectorAll('#etape-type .ligne b, #etape-type .ligne small')].map(b => b.textContent).join('/')`)) === 'Xtream Codes/Server, username, password/M3U file/M3U/M3U8 playlist URL' && (await evaluer('document.documentElement.lang')) === 'en',
    'ajouter : EN — « Connection type », les cartes en anglais (libellés de l\'app), lang=en');
  await capture('ajouter_en_1_type');
  await cliquer('suivant'); await etape('xtream');
  await capture('ajouter_en_2_xtream_vide');
  await cliquer('envoyer-xtream');
  verifie(await attendre(`${el('etat-xtream')}.textContent === 'Please fill in all fields'`, 'en vides'), 'ajouter : EN — « Please fill in all fields »');
  await evaluer(`document.querySelector('#etape-xtream .retour-type').click(); true`);
  await choisirType('m3u'); await cliquer('suivant'); await etape('m3u');
  verifie((await evaluer(`[...document.querySelectorAll('#etape-m3u label, #etape-m3u small')].map(l => l.textContent).join('/')`)) === 'Playlist URL/Enter the full URL of your M3U or M3U8 file./TV Guide address (XMLTV)/Empty: the playlist\'s own', 'ajouter : EN — les champs M3U et le guide');
  await capture('ajouter_en_3_m3u_vide');
  await remplir({ url: 'https://exemple.tv/liste.m3u' }); await cliquer('envoyer-m3u');
  verifie(await finAvec('Done!') && (await texteDe('fin-texte')) === 'Your playlist has been sent to your device.', 'ajouter : EN — « Done! Your playlist has been sent to your device. »');
  await capture('ajouter_en_4_valide');
  await aller(`${serveur.site}/ajouter.html#d=${dep.depot}&t=${dep.jeton}&k=${k}`);
  await etape('type'); await choisirType('m3u'); await cliquer('suivant'); await etape('m3u');
  await remplir({ url: 'https://exemple.tv/liste.m3u' }); await cliquer('envoyer-m3u');
  verifie(await finAvec('This QR code is no longer valid'), 'ajouter : EN — 410');
  await capture('ajouter_en_5_deja_servi');
  await ouvrir(`${serveur.site}/ajouter.html`);
  verifie(await finAvec('This link is incomplete'), 'ajouter : EN — lien incomplet');
  await capture('ajouter_en_6_lien_incomplet');
  await langue('fr');
  }

  // ================= connexion : « un seul scan » (contrat § 1, § 5 bis) =================
  if (parties.has('connexion')) {
  const bouton = () => attendre(`!!document.getElementById('faux-google') && ${vu('bouton-google')}`, 'bouton Google');
  const polls = (a) => serveur.journal.filter((j) => j.methode === 'POST' && j.chemin === `/v1/appairage/${a}/depot`);
  const rattacher = (a) => appelBanc(`/_banc/appairage/${a}/rattacher`);
  const qr = (ap, avecK = k) => `${serveur.site}/connexion.html#a=${ap.appairage}&t=${ap.jeton}` + (avecK ? `&k=${avecK}` : '');
  const connecteFin = (texte) => attendre(`${vu('etape-fin')} && ${el('fin-titre')}.textContent.replace(/ /g, " ") === 'Connecté : a…@gmail.com' && ${el('fin-texte')}.textContent.replace(/ /g, " ") === ${JSON.stringify(texte)}`, 'Connecté — ' + texte);

  // ---------- 1. Le parcours entier : Google → Connecté (attente) → Type → M3U avec guide → Validé ----------
  await langue('fr');
  let ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap));
  verifie(await evaluer('location.hash === ""'), 'connexion : le « # » est effacé (a, t ET k)');
  verifie(await bouton(), 'connexion : le bouton (doublure GIS) s\'affiche après le nonce');
  const cfg = await evaluer('window.__gisCfg');
  verifie(cfg.client_id === '720100975511-ovrrf97ocsdactpc61b2peg26vgqt6nt.apps.googleusercontent.com' && serveur.nonces.has(cfg.nonce) && cfg.nonce.length === 43, 'connexion : client Web du contrat, nonce frais du serveur');
  verifie((await texteDe('etape-compte')).startsWith('Connectez votre compte Google') && (await evaluer('window.__gisBouton.text + "/" + window.__gisBouton.locale')) === 'continue_with/fr', 'connexion : FR — « Connectez votre compte Google », bouton « Continuer avec Google » en français');
  verifie((await points()) === 'ici,-,-', 'connexion : les points — 1er sur 3');
  verifie((await habit()).startsWith('dark | rgb(243, 247, 251) | true | 1.50em'), 'connexion : le même verre Sombre');
  await capture('connexion_fr_1_compte');
  serveur.reglages.kPiege = kAutre; // le faux serveur glisse une AUTRE clé dans sa réponse : la page doit garder celle du QR
  await cliquer('faux-google');
  verifie(await etape('attente'), 'connexion : 200 { suite } → « Connecté », la page attend la télé');
  const lie = serveur.appairages.get(ap.appairage);
  verifie(lie.lie && lireFauxJeton(lie.google)?.nonce === cfg.nonce, 'connexion : le serveur a reçu { jeton, google_id_token, nonce } cohérents');
  verifie((await texteDe('attente-compte')) === 'Connecté : a…@gmail.com' && (await texteDe('etape-attente')).includes('Votre télé prépare l\'envoi de votre playlist…'), 'connexion : « Connecté : a…@gmail.com » (masquée comme l\'app), « Votre télé prépare l\'envoi… »');
  verifie(await evaluer(vu('plus-tard-attente')), 'connexion : « Plus tard » offert pendant l\'attente');
  await capture('connexion_fr_2_attente');
  await pause(6500);
  const p1 = polls(ap.appairage);
  verifie(p1.length >= 2 && p1.length <= 4 && p1.every((j) => j.origine === serveur.site), `connexion : la page interroge …/depot toutes les 3 s (${p1.length} POST en ~6,5 s), depuis l\'origine du site`);
  verifie(serveur.journal.some((j) => j.methode === 'OPTIONS' && j.chemin === `/v1/appairage/${ap.appairage}/depot`), 'connexion : pré-vol CORS de …/depot');
  verifie(await evaluer(vu('etape-attente')), 'connexion : 202 → toujours en attente');
  const rat = await rattacher(ap.appairage); // la télé : POST /v1/depot { appairage }
  verifie(await etape('type'), 'connexion : la télé rattache son dépôt → 200 { depot, jeton } → « Type de connexion », DIRECTEMENT');
  verifie((await points()) === 'fait,ici,-' && await evaluer(vu('plus-tard')), 'connexion : les points — 2e sur 3 ; « Plus tard » sur « Type de connexion »');
  await capture('connexion_fr_3_type');
  await choisirType('m3u'); await cliquer('suivant'); await etape('m3u');
  verifie((await points()) === 'fait,fait,ici', 'connexion : les points — 3e sur 3');
  await remplir({ url: 'https://exemple.tv/liste.m3u', guide: 'https://exemple.tv/epg.xml' });
  await capture('connexion_fr_4_m3u');
  await cliquer('envoyer-m3u');
  verifie(await finAvec('Validé !') && (await texteDe('fin-texte')) === 'Votre playlist est envoyée à votre appareil.', 'connexion : Envoyer → « Validé ! Votre playlist est envoyée à votre appareil. »');
  await capture('connexion_fr_5_valide');
  verifie(clairRecu(rat.depot) === JSON.stringify({ v: 1, type: 'm3u', url: 'https://exemple.tv/liste.m3u', guide: 'https://exemple.tv/epg.xml' }),
    'connexion : la « télé » déchiffre avec la clé DU QR et le sel = d reçu de la route (pas la clé glissée par le serveur) — ' + clairRecu(rat.depot));
  verifie(serveur.journal.some((j) => j.methode === 'POST' && j.chemin === '/v1/depot/' + rat.depot && j.origine === serveur.site), 'connexion : POST /v1/depot/{d} avec le d rendu par le serveur');
  const nPolls = polls(ap.appairage).length;
  await pause(3500);
  verifie(polls(ap.appairage).length === nPolls, 'connexion : plus aucune interrogation après le dépôt');
  verifie(await champsVides() && await rienGarde(), 'connexion : champs vidés, rien gardé dans le navigateur');
  serveur.reglages.kPiege = null;

  // ---------- 2. Xtream par le même chemin ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  let r2 = await rattacher(ap.appairage);
  await etape('type'); await cliquer('suivant'); await etape('xtream');
  await remplir({ serveur: 'http://exemple.tv:8080', utilisateur: 'léa', mot_de_passe: ' secret ' });
  await cliquer('envoyer-xtream'); await finAvec('Validé !');
  verifie(clairRecu(r2.depot) === JSON.stringify({ v: 1, type: 'xtream', serveur: 'http://exemple.tv:8080', utilisateur: 'léa', mot_de_passe: ' secret ' }), 'connexion : Xtream par le seul scan — ' + clairRecu(r2.depot));

  // ---------- 3. Le serveur d'avant (204) → s'arrêter à « Connecté », sans interroger ----------
  serveur.reglages.appairageAncien = true;
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google');
  verifie(await connecteFin('Retournez à votre télé.'), 'connexion : 204 (ancien serveur) → « Connecté : a…@gmail.com — Retournez à votre télé. »');
  await pause(3500);
  verifie(polls(ap.appairage).length === 0, 'connexion : … aucune interrogation de …/depot');
  verifie((await points()) === 'fait,fait,fait', 'connexion : fini — tous les points faits');
  await capture('connexion_fr_6_connecte_ancien');
  serveur.reglages.appairageAncien = false;

  // ---------- 4. Sans k dans le QR (une app plus ancienne) ; k inutilisable ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap, null)); await bouton(); await cliquer('faux-google');
  verifie(await connecteFin('Retournez à votre télé.'), 'connexion : sans k → « Connecté — Retournez à votre télé. »');
  await pause(3500);
  verifie(polls(ap.appairage).length === 0, 'connexion : … aucune interrogation (le suite n\'est pas utilisé sans clé)');
  await capture('connexion_fr_7_connecte_sans_k');
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap, k.slice(0, -4) + 'AAAA')); await bouton(); await cliquer('faux-google');
  verifie(await connecteFin('Retournez à votre télé.') && polls(ap.appairage).length === 0, 'connexion : k hors courbe → traité comme absent : la connexion passe, « Connecté », rien d\'autre');

  // ---------- 5. 410 pendant l'attente ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  serveur.appairages.get(ap.appairage).expire = Date.now() - 1;
  verifie(await connecteFin('Retournez à votre télé.'), 'connexion : 410 de …/depot (appairage expiré) → « Connecté — Retournez à votre télé. »');
  await capture('connexion_fr_8_connecte_410');
  const n410 = polls(ap.appairage).length;
  await pause(3500);
  verifie(polls(ap.appairage).length === n410, 'connexion : … et la page cesse d\'interroger');

  // ---------- 6. 401 suite ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  serveur.appairages.get(ap.appairage).suite = 'u_un_autre_suite_du_banc';
  const r401 = await fetch(`${serveur.api}/v1/appairage/${ap.appairage}/depot`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suite: 'u_faux' }) });
  verifie(r401.status === 401 && (await r401.json()).erreur === 'suite', 'faux serveur : un suite inconnu → 401 { erreur: suite }');
  verifie(await connecteFin('Retournez à votre télé.'), 'connexion : 401 suite → « Connecté — Retournez à votre télé. »');
  await rattacher(ap.appairage);
  await pause(3500);
  verifie(!(await evaluer(vu('etape-type'))), 'connexion : … même si la télé rattache ensuite un dépôt, rien n\'est révélé à ce téléphone');

  // ---------- 7. 503 pendant l'attente ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  serveur.reglages.pasBranche = true;
  verifie(await connecteFin('Retournez à votre télé.'), 'connexion : 503 de …/depot (CORS présent) → « Connecté — Retournez à votre télé. »');
  serveur.reglages.pasBranche = false;

  // ---------- 8. Réseau coupé pendant l'attente : on réinterroge, puis on repart ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  serveur.reglages.origine = 'https://nita.tv'; // le navigateur bloque les réponses : comme un réseau coupé
  await pause(3500);
  verifie(await evaluer(vu('etape-attente')), 'connexion : réponse perdue → toujours en attente (la page réinterroge)');
  serveur.reglages.origine = serveur.site;
  r2 = await rattacher(ap.appairage);
  verifie(await etape('type'), 'connexion : … le réseau revenu, la télé rattache → « Type de connexion »');

  // ---------- 9. « Plus tard » : pendant l'attente, puis sur « Type de connexion » ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  await cliquer('plus-tard-attente');
  verifie(await connecteFin('Retournez à votre télé : vous y ajouterez votre playlist.'), 'connexion : « Plus tard » pendant l\'attente → « Connecté — vous y ajouterez votre playlist »');
  await capture('connexion_fr_9_plus_tard');
  const nPT = polls(ap.appairage).length;
  await rattacher(ap.appairage);
  await pause(3500);
  verifie(polls(ap.appairage).length === nPT && !(await evaluer(vu('etape-type'))), 'connexion : … plus aucune interrogation, la page reste à « Connecté »');
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  r2 = await rattacher(ap.appairage);
  await etape('type');
  await cliquer('plus-tard');
  verifie(await connecteFin('Retournez à votre télé : vous y ajouterez votre playlist.'), 'connexion : « Plus tard » sur « Type de connexion » → « Connecté »');
  verifie(clairRecu(r2.depot) === 'RIEN REÇU', 'connexion : … et rien n\'est déposé');

  // ---------- 10. Ce qui existait : 2e téléphone (410), nonce refusé, nonce injoignable, 503, lien incomplet ----------
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google');
  verifie(await finAvec('Ce QR code n\'est plus valable'), 'connexion : 2e téléphone sur le même QR → 410 « n\'est plus valable » (il ne reçoit pas de suite)');
  await capture('connexion_fr_10_deja_servi');
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton();
  const nonce1 = (await evaluer('window.__gisCfg')).nonce;
  serveur.reglages.refuserProchainNonce = true;
  await cliquer('faux-google');
  verifie(await attendre(`${el('etat-compte')}.textContent.includes('trop de temps') && !!document.getElementById('faux-google') && window.__gisCfg.nonce !== ${JSON.stringify(nonce1)}`, 'nouveau nonce'),
    'connexion : 401 nonce_invalide → message, NOUVEAU nonce, bouton de nouveau');
  await capture('connexion_fr_11_nonce_refuse');
  await cliquer('faux-google');
  verifie(await etape('attente'), 'connexion : … et le 2e appui réussit');
  serveur.reglages.corsNonce = false;
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap));
  verifie(await attendre(`${el('etat-compte')}.textContent.includes('Impossible de joindre') && ${vu('reessayer')}`, 'nonce bloqué'), 'connexion : nonce injoignable → « Impossible de joindre » + Réessayer');
  await capture('connexion_fr_12_injoignable');
  serveur.reglages.corsNonce = true;
  await cliquer('reessayer');
  verifie(await attendre(`!!document.getElementById('faux-google') && !${vu('reessayer')}`, 'reprise'), 'connexion : « Réessayer » repart quand le serveur répond');
  serveur.reglages.pasBranche = true;
  await ouvrir(qr(ap));
  verifie(await finAvec('Pas encore ouvert'), 'connexion : 503 pas_branche → « Pas encore ouvert »');
  serveur.reglages.pasBranche = false;
  await ouvrir(`${serveur.site}/connexion.html`);
  verifie(await finAvec('Ce lien est incomplet'), 'connexion : sans « # » → « Ce lien est incomplet »');
  await capture('connexion_fr_13_lien_incomplet');

  // ---------- 11. EN ----------
  await langue('en');
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton();
  verifie((await texteDe('etape-compte')).startsWith('Connect your Google account') && (await evaluer('window.__gisBouton.locale')) === 'en' && (await evaluer('document.documentElement.lang')) === 'en', 'connexion : EN — « Connect your Google account », bouton Google en anglais');
  await capture('connexion_en_1_compte');
  await cliquer('faux-google'); await etape('attente');
  verifie((await texteDe('attente-compte')) === 'Signed in: a…@gmail.com' && (await texteDe('plus-tard-attente')) === 'Later', 'connexion : EN — « Signed in: a…@gmail.com », « Later »');
  await capture('connexion_en_2_attente');
  r2 = await rattacher(ap.appairage);
  await etape('type');
  await capture('connexion_en_3_type');
  await cliquer('suivant'); await etape('xtream');
  await remplir({ serveur: 'http://exemple.tv:8080', utilisateur: 'antony', mot_de_passe: 'x' });
  await capture('connexion_en_4_xtream');
  await cliquer('envoyer-xtream');
  verifie(await finAvec('Done!'), 'connexion : EN — « Done! »');
  await capture('connexion_en_5_valide');
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google'); await etape('attente');
  await cliquer('plus-tard-attente');
  verifie(await attendre(`${el('fin-titre')}.textContent === 'Signed in: a…@gmail.com' && ${el('fin-texte')}.textContent === 'Go back to your TV: you will add your playlist there.'`, 'en plus tard'), 'connexion : EN — « Later » → « Signed in — Go back to your TV… »');
  await capture('connexion_en_6_plus_tard');
  serveur.reglages.appairageAncien = true;
  ap = await appelBanc('/_banc/appairage');
  await ouvrir(qr(ap)); await bouton(); await cliquer('faux-google');
  verifie(await attendre(`${el('fin-texte')}.textContent === 'Go back to your TV.'`, 'en connecté'), 'connexion : EN — « Signed in — Go back to your TV. »');
  await capture('connexion_en_7_connecte');
  serveur.reglages.appairageAncien = false;
  await ouvrir(`${serveur.site}/connexion.html`);
  verifie(await finAvec('This link is incomplete'), 'connexion : EN — lien incomplet');
  await langue('fr');
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
