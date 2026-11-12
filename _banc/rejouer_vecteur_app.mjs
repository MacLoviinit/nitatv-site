// Banc (non publié) — rejoue le vecteur produit par l'app (lot serveur_depot, pointycastle) avec le code de la page.
// Usage : node _banc/rejouer_vecteur_app.mjs <…\Logs\agents\serveur_depot\vecteur.json>
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(ici, '..', 'depot.js'), 'utf8'), { filename: 'depot.js' });
const D = globalThis.NitaDepot;
const v = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let echecs = 0;
const verifie = (ok, quoi) => { console.log((ok ? 'OK    ' : 'ECHEC ') + quoi); if (!ok) echecs++; };
const s = globalThis.crypto.subtle;

// 1. La page, avec la paire de page et l'IV fixés de l'app, doit refaire le même chiffre.
const cleTele = await D.importerCleTele(v.k);
const priv = await s.importKey('jwk', v.page_jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const { d, ...pubJwk } = v.page_jwk;
const pub = await s.importKey('jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
const chiffre = await D.chiffrer(cleTele, v.depot, v.clair, { ephemere: { privateKey: priv, publicKey: pub }, iv: Buffer.from(v.iv_hex, 'hex') });
const env = JSON.parse(Buffer.from(chiffre, 'base64').toString('utf8'));
verifie(env.epk === v.epk, 'epk de la page = epk de l\'app');
verifie(env.iv === v.iv, 'iv identique');
verifie(env.ct === v.ct, 'ct de la page = ct de l\'app, octet pour octet');
verifie(chiffre === v.chiffre, '« chiffre » entier identique (même ordre et mêmes espaces du JSON)');

// 2. La télé (node:crypto, clé privée de l'app) déchiffre leur cas « WebCrypto seul » et le nôtre.
const tele = crypto.createECDH('prime256v1');
tele.setPrivateKey(Buffer.from(v.tele_privee_hex, 'hex'));
const dechiffrer = (c, depot) => {
  const e = JSON.parse(Buffer.from(c, 'base64').toString('utf8'));
  const cle = Buffer.from(crypto.hkdfSync('sha256', tele.computeSecret(Buffer.from(e.epk, 'base64url')), Buffer.from(depot, 'utf8'), Buffer.from('nitatv-depot-v1', 'utf8'), 32));
  const ct = Buffer.from(e.ct, 'base64url');
  const dc = crypto.createDecipheriv('aes-256-gcm', cle, Buffer.from(e.iv, 'base64url'));
  dc.setAuthTag(ct.subarray(-16));
  return Buffer.concat([dc.update(ct.subarray(0, -16)), dc.final()]).toString('utf8');
};
try { verifie(dechiffrer(v.webcrypto_seul.chiffre, v.webcrypto_seul.depot) === v.webcrypto_seul.clair, 'leur cas « WebCrypto seul » se déchiffre au clair exact'); }
catch (e) { verifie(false, 'leur cas « WebCrypto seul » : refusé — ' + e.message); }
const aleatoire = await D.chiffrer(cleTele, 'd_page_aleatoire', v.clair);
try { verifie(dechiffrer(aleatoire, 'd_page_aleatoire') === v.clair, 'un chiffre de la page (paire aléatoire) vers leur télé se déchiffre'); }
catch (e) { verifie(false, 'chiffre aléatoire de la page : refusé — ' + e.message); }
console.log(`${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
