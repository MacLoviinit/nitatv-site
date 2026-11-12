// Banc (non publié) — faux serveur NitaTV fidèle au contrat (§ 1 nonce + appairage, § 3 bis suppression par le web,
// § 5 dépôt) ET le site statique.
// Le faux jeton Google est un JWT sans vraie signature : « en-tête.charge.banc », la charge porte sub, email, nonce, aud
// (la doublure GIS de l'essai le fabrique avec le nonce qu'on lui a donné, comme le vrai Google).
// Site : http://127.0.0.1:8787   API : http://127.0.0.1:8788 (une autre origine : le CORS est vraiment exercé).
// Seul : node _banc/faux_serveur.mjs   (puis ouvrir l'adresse affichée)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const CLIENT_WEB = '720100975511-ovrrf97ocsdactpc61b2peg26vgqt6nt.apps.googleusercontent.com';
export function lireFauxJeton(jwt) {
  const parts = String(jwt).split('.');
  if (parts.length !== 3 || parts[2] !== 'banc') return null; // « signature » du banc : tout autre jeton est refusé
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return null; }
}
const racineSite = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.m3u': 'audio/x-mpegurl' };

export function demarrer({ portSite = 8787, portApi = 8788 } = {}) {
  const reglages = {
    origine: `http://127.0.0.1:${portSite}`, // Access-Control-Allow-Origin rendu (le vrai serveur : https://nita.tv)
    corsNonce: true,                          // le vrai serveur n'en met PAS sur GET /v1/nonce (mesuré le 2026-11-12)
    pasBranche: false,                        // 503 pas_branche partout
    tailleMax: 16 * 1024,
    refuserProchainNonce: false,              // le prochain POST appairage répond 401 nonce_invalide
    refuserProchainGoogle: false,             // le prochain POST suppression répond 401 google (nonce consommé)
    reponseForcee: null                       // { statut, corps } : la prochaine réponse de POST suppression, telle quelle
  };
  const depots = new Map();     // id -> { jeton, expire, chiffre, use }
  const appairages = new Map(); // id -> { jeton, expire, lie, google, use }
  const nonces = new Map();     // nonce -> { expire, servi }
  const comptes = new Map();    // sub -> { email } : les comptes du faux serveur
  const suppressions = [];      // { sub, existait } : chaque 204 de POST /v1/compte/suppression
  const journal = [];

  const json = (res, statut, corps, cors) => {
    const h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (cors) { h['Access-Control-Allow-Origin'] = reglages.origine; h['Vary'] = 'Origin'; }
    res.writeHead(statut, h);
    res.end(corps === undefined ? '' : JSON.stringify(corps));
  };
  const lireCorps = (req) => new Promise((ok) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => ok(b)); });

  const api = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    journal.push({ methode: req.method, chemin: p, origine: req.headers.origin || null });
    const routeWeb = /^\/v1\/(depot|appairage)\/[^/]+$/.test(p) || p === '/v1/compte/suppression';

    if (req.method === 'OPTIONS') {
      if (!routeWeb) return json(res, 404, { erreur: 'inconnu', message: 'route inconnue' });
      res.writeHead(204, { 'Access-Control-Allow-Origin': reglages.origine, 'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
      return res.end();
    }
    if (reglages.pasBranche && p.startsWith('/v1/')) {
      return json(res, 503, { erreur: 'pas_branche', message: 'pas encore branché' }, routeWeb || (p === '/v1/nonce' && reglages.corsNonce));
    }
    // --- banc : créer un dépôt / un appairage comme la télé, relire ce qui a été déposé ---
    if (req.method === 'POST' && p === '/_banc/depot') {
      const id = 'd_' + crypto.randomBytes(9).toString('base64url');
      const jeton = 't_' + crypto.randomBytes(12).toString('base64url');
      depots.set(id, { jeton, expire: Date.now() + 15 * 60e3, chiffre: null, use: false });
      return json(res, 200, { depot: id, jeton });
    }
    if (req.method === 'POST' && p === '/_banc/appairage') {
      const id = 'a_' + crypto.randomBytes(9).toString('base64url');
      const jeton = 't_' + crypto.randomBytes(12).toString('base64url');
      appairages.set(id, { jeton, expire: Date.now() + 15 * 60e3, lie: false, google: null, use: false });
      return json(res, 200, { appairage: id, jeton });
    }
    if (req.method === 'GET' && p.startsWith('/_banc/depot/')) return json(res, 200, depots.get(p.split('/')[3]) || null);
    if (req.method === 'GET' && p.startsWith('/_banc/appairage/')) return json(res, 200, appairages.get(p.split('/')[3]) || null);
    if (req.method === 'GET' && p === '/_banc/journal') return json(res, 200, { journal, nonces: [...nonces.entries()] });
    if (req.method === 'POST' && p === '/_banc/compte') { const c = JSON.parse(await lireCorps(req)); comptes.set(c.sub, { email: c.email }); return json(res, 200, c); }
    if (req.method === 'POST' && p === '/_banc/reglages') { Object.assign(reglages, JSON.parse(await lireCorps(req))); return json(res, 200, reglages); }

    // --- contrat ---
    if (req.method === 'GET' && p === '/v1/nonce') {
      const nonce = crypto.randomBytes(32).toString('base64url'); // 43 car.
      const expire = Date.now() + 5 * 60e3;
      nonces.set(nonce, { expire, servi: false });
      return json(res, 200, { nonce, expire_a: new Date(expire).toISOString().replace(/\.\d+Z$/, 'Z') }, reglages.corsNonce);
    }
    if (req.method === 'POST' && p === '/v1/compte/suppression') {
      // L'ordre MESURÉ sur le vrai serveur (2026-11-12 19:14 UTC) : corps (400) → nonce, consommé même si la suite
      // échoue (401 nonce_invalide) → jeton Google (401 google) → le nonce du jeton = celui envoyé → 204.
      let corps;
      try { corps = JSON.parse(await lireCorps(req)); } catch { corps = {}; }
      if (!corps || typeof corps.google_id_token !== 'string' || !corps.google_id_token || typeof corps.nonce !== 'string' || !corps.nonce) {
        return json(res, 400, { erreur: 'corps', message: 'il faut « google_id_token » et « nonce »' }, true);
      }
      const n = nonces.get(corps.nonce);
      if (!n || n.servi || n.expire < Date.now()) return json(res, 401, { erreur: 'nonce_invalide', message: 'nonce inconnu, expiré ou déjà servi : en redemander un' }, true);
      n.servi = true;
      if (reglages.reponseForcee) { const f = reglages.reponseForcee; reglages.reponseForcee = null; return json(res, f.statut, f.corps, true); }
      const charge = lireFauxJeton(corps.google_id_token);
      if (reglages.refuserProchainGoogle || !charge || charge.aud !== CLIENT_WEB || !charge.sub) {
        reglages.refuserProchainGoogle = false;
        return json(res, 401, { erreur: 'google', message: 'jeton Google refusé' }, true);
      }
      if (charge.nonce !== corps.nonce) return json(res, 401, { erreur: 'nonce_invalide', message: 'nonce inconnu, expiré ou déjà servi : en redemander un' }, true);
      const existait = comptes.delete(charge.sub); // 204 aussi sans compte, et RIEN n'est créé
      suppressions.push({ sub: charge.sub, existait });
      return json(res, 204, undefined, true);
    }
    if (req.method === 'POST' && routeWeb) {
      const brut = await lireCorps(req);
      let corps;
      try { corps = JSON.parse(brut); } catch { return json(res, 400, { erreur: 'requete', message: 'JSON illisible' }, true); }
      const [, genre, id] = p.split('/').slice(1);
      if (genre === 'depot') {
        const d = depots.get(id);
        if (!d || d.use || d.expire < Date.now() || corps.jeton !== d.jeton) return json(res, 410, { erreur: 'expire', message: 'ce QR code n\'est plus valable' }, true);
        if (typeof corps.chiffre !== 'string' || !corps.chiffre) return json(res, 400, { erreur: 'requete', message: 'chiffre manquant' }, true);
        if (corps.chiffre.length > reglages.tailleMax) return json(res, 413, { erreur: 'trop_gros', message: 'trop gros' }, true);
        d.use = true; d.chiffre = corps.chiffre;
        return json(res, 204, undefined, true);
      }
      const a = appairages.get(id);
      if (!a || a.use || a.expire < Date.now() || corps.jeton !== a.jeton) return json(res, 410, { erreur: 'expire', message: 'ce QR code a déjà servi ou n\'est plus valable : en afficher un nouveau' }, true);
      const n = nonces.get(corps.nonce);
      const nonceOk = n && !n.servi && n.expire > Date.now();
      if (n) n.servi = true; // un nonce sert une fois, même un échec le consume
      // Le faux jeton Google du banc porte le nonce qu'on lui a donné, comme le vrai.
      const charge = lireFauxJeton(corps.google_id_token);
      if (reglages.refuserProchainNonce || !nonceOk || !charge || charge.nonce !== corps.nonce) {
        reglages.refuserProchainNonce = false;
        return json(res, 401, { erreur: 'nonce_invalide', message: 'nonce inconnu, expiré ou déjà servi' }, true);
      }
      a.use = true; a.lie = true; a.google = corps.google_id_token;
      return json(res, 204, undefined, true);
    }
    return json(res, 404, { erreur: 'inconnu', message: 'route inconnue' });
  });

  const site = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const fichier = path.join(racineSite, p === '/' ? 'index.html' : p);
    if (!fichier.startsWith(racineSite) || p.includes('/_banc') || !fs.existsSync(fichier) || fs.statSync(fichier).isDirectory()) {
      res.writeHead(404); return res.end('404');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(fichier).pipe(res);
  });

  return new Promise((ok) => {
    api.listen(portApi, '127.0.0.1', () => site.listen(portSite, '127.0.0.1', () => ok({
      reglages, depots, appairages, nonces, journal, comptes, suppressions,
      site: `http://127.0.0.1:${portSite}`, api: `http://127.0.0.1:${portApi}`,
      arreter: () => Promise.all([new Promise((r) => api.close(r)), new Promise((r) => site.close(r))])
    })));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const s = await demarrer();
  console.log(`site ${s.site}  —  api ${s.api}  (POST ${s.api}/_banc/depot pour un dépôt)`);
}
