// Banc (non publié : dossier « _ », exclu par Jekyll) — vecteur de test du chiffrement d'un dépôt (contrat § 5).
// Usage : node _banc/vecteur.mjs <sortie.json>
// Runs the PRODUCTION file depot.js, with fixed keys and IV, then decrypts with node:crypto (an independent
// implementation) and checks that a wrong salt / info / tag is refused.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ici = path.dirname(fileURLToPath(import.meta.url));
vm.runInThisContext(fs.readFileSync(path.join(ici, '..', 'depot.js'), 'utf8'), { filename: 'depot.js' });
const D = globalThis.NitaDepot;
if (!D) throw new Error('depot.js ne définit pas NitaDepot');

const sortie = process.argv[2];
if (!sortie) throw new Error('usage : node _banc/vecteur.mjs <sortie.json>');

const hex = (u8) => Buffer.from(u8).toString('hex');
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fixe = (graine) => crypto.createHash('sha256').update(graine).digest(); // 32 bytes, < n with overwhelming probability

// A fixed P-256 key pair from a fixed private scalar.
function paireFixe(graine) {
  const d = fixe(graine);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(d);
  const pub = ecdh.getPublicKey(null, 'uncompressed'); // 65 bytes
  return { d, pub, jwk: { kty: 'EC', crv: 'P-256', d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)), ext: true } };
}

const tele = paireFixe('nitatv-vecteur-v1-tele');
const page = paireFixe('nitatv-vecteur-v1-page');
const s = globalThis.crypto.subtle;
const pagePriv = await s.importKey('jwk', page.jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const { d: _d, ...pagePubJwk } = page.jwk;
const pagePub = await s.importKey('jwk', pagePubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);

const cas = [
  {
    nom: 'xtream',
    depot: 'd_71c3vecteur01',
    iv: Buffer.from('a0a1a2a3a4a5a6a7a8a9aaab', 'hex'),
    // Non-ASCII name and a password with symbols and a trailing space: UTF-8 and no trimming are part of the test.
    clair: '{"v":1,"type":"xtream","serveur":"http://exemple.tv:8080","utilisateur":"antony","mot_de_passe":"p@ss:w/rd&é ","nom":"Ma liste été 📺"}'
  },
  {
    nom: 'm3u',
    depot: 'd_71c3vecteur02',
    iv: Buffer.from('000102030405060708090a0b', 'hex'),
    clair: '{"v":1,"type":"m3u","url":"https://exemple.tv/get.php?username=a&password=b&type=m3u_plus"}'
  }
];

const k = b64u(tele.pub);
const cleTele = await D.importerCleTele(k);
const resultats = [];
let echecs = 0;
const verifie = (ok, quoi) => { console.log((ok ? 'OK    ' : 'ECHEC ') + quoi); if (!ok) echecs++; };

// node:crypto decryption, as the TV would do it.
// The contract's values are written here, NOT read from depot.js: a mutated constant there must be caught.
const INFO_CONTRAT = 'nitatv-depot-v1';
function dechiffrerNode(chiffre, depot, { sel = depot, info = INFO_CONTRAT, abimer = false } = {}) {
  const env = JSON.parse(Buffer.from(chiffre, 'base64').toString('utf8'));
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(tele.d);
  const secret = ecdh.computeSecret(Buffer.from(env.epk, 'base64url'));
  const cle = Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.from(sel, 'utf8'), Buffer.from(info, 'utf8'), 32));
  const ct = Buffer.from(env.ct, 'base64url');
  if (abimer) ct[0] ^= 1;
  const dec = crypto.createDecipheriv('aes-256-gcm', cle, Buffer.from(env.iv, 'base64url'));
  dec.setAuthTag(ct.subarray(ct.length - 16));
  return { texte: Buffer.concat([dec.update(ct.subarray(0, ct.length - 16)), dec.final()]).toString('utf8'), secret, cle, env };
}
const refuse = (f) => { try { f(); return false; } catch { return true; } };

for (const c of cas) {
  const chiffre = await D.chiffrer(cleTele, c.depot, c.clair, { ephemere: { privateKey: pagePriv, publicKey: pagePub }, iv: new Uint8Array(c.iv) });
  const encore = await D.chiffrer(cleTele, c.depot, c.clair, { ephemere: { privateKey: pagePriv, publicKey: pagePub }, iv: new Uint8Array(c.iv) });
  verifie(chiffre === encore, `${c.nom} : deux passages donnent le même chiffre (déterminisme à clés fixées)`);
  let r;
  try { r = dechiffrerNode(chiffre, c.depot); } catch (e) {
    verifie(false, `${c.nom} : node:crypto (indépendant) retrouve le clair exact — refusé : ${e.message}`);
    continue;
  }
  verifie(r.texte === c.clair, `${c.nom} : node:crypto (indépendant) retrouve le clair exact`);
  verifie(r.env.v === 1 && Object.keys(r.env).join(',') === 'v,epk,iv,ct', `${c.nom} : enveloppe {v,epk,iv,ct}`);
  verifie(!/=/.test(r.env.epk + r.env.iv + r.env.ct), `${c.nom} : base64url sans « = » dans l'enveloppe`);
  verifie(Buffer.from(r.env.epk, 'base64url').length === 65 && r.env.epk === b64u(page.pub), `${c.nom} : epk = clé publique brute de la page (65 octets)`);
  verifie(refuse(() => dechiffrerNode(chiffre, c.depot, { sel: c.depot + 'x' })), `${c.nom} : témoin — un autre sel est refusé`);
  verifie(refuse(() => dechiffrerNode(chiffre, c.depot, { info: 'nitatv-depot-v2' })), `${c.nom} : témoin — une autre info est refusée`);
  verifie(refuse(() => dechiffrerNode(chiffre, c.depot, { abimer: true })), `${c.nom} : témoin — un octet abîmé est refusé (étiquette GCM)`);
  resultats.push({
    nom: c.nom,
    depot: c.depot,
    hkdf_sel_utf8: c.depot,
    hkdf_info_utf8: INFO_CONTRAT,
    iv_hex: c.iv.toString('hex'),
    clair_utf8: c.clair,
    clair_hex: Buffer.from(c.clair, 'utf8').toString('hex'),
    secret_ecdh_hex: r.secret.toString('hex'),
    cle_aes_hex: r.cle.toString('hex'),
    enveloppe: r.env,
    chiffre
  });
}

const vecteur = {
  format: 'nitatv-depot-v1 — contrat_serveur.md § 5',
  produit_par: 'nitatv-site/depot.js (le code de la page), node ' + process.version + ', ' + new Date().toISOString(),
  tele: {
    prive_d_hex: hex(tele.d),
    prive_jwk: tele.jwk,
    public_k: k,
    public_hex: hex(tele.pub)
  },
  page_ephemere: {
    prive_d_hex: hex(page.d),
    public_epk: b64u(page.pub),
    public_hex: hex(page.pub)
  },
  note: 'Pour rejouer côté télé : refaire le secret ECDH avec tele.prive_d et enveloppe.epk, HKDF-SHA-256 (sel = id du dépôt en UTF-8, info = nitatv-depot-v1, 32 octets), AES-256-GCM (iv, ct = chiffré || étiquette 16 octets) ; le résultat doit être clair_utf8 à l\'octet près. Les valeurs intermédiaires (secret_ecdh_hex, cle_aes_hex) servent à localiser un écart.',
  cas: resultats
};
fs.writeFileSync(sortie, JSON.stringify(vecteur, null, 2) + '\n');
console.log(`\n${resultats.length} cas écrits dans ${sortie} ; ${echecs} échec(s)`);
process.exit(echecs ? 1 : 0);
