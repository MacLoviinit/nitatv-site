/*
 * NitaTV — chiffrement d'une playlist pour la télé (contrat appli <-> serveur, § 5, format v1).
 *
 * The TV makes a fresh ECDH P-256 key pair per deposit and puts its public key in the QR (after the '#',
 * never sent to any server). This page makes its own ephemeral pair, derives the ECDH secret (256 bits),
 * HKDF-SHA-256 (salt = deposit id in UTF-8, info = "nitatv-depot-v1") -> AES-256-GCM key, random 12-byte IV.
 * Output: base64 (standard, padded) of the UTF-8 JSON {"v":1,"epk":…,"iv":…,"ct":…}, fields in base64url
 * without '='; ct = ciphertext followed by the 16-byte GCM tag (what WebCrypto returns).
 *
 * Plain script (no module, no dependency): it defines globalThis.NitaDepot, so the page and the Node test
 * vector run the very same code.
 */
(function (racine) {
  'use strict';

  var INFO = 'nitatv-depot-v1';
  var TAILLE_MAX = 16 * 1024; // contrat § 5 : « 16 Ko au plus » ; le serveur répond 413 au-delà

  function sousCrypto() {
    var c = racine.crypto;
    if (!c || !c.subtle) throw new Error('webcrypto_absent');
    return c.subtle;
  }

  function versBase64url(octets) {
    var b = '';
    for (var i = 0; i < octets.length; i++) b += String.fromCharCode(octets[i]);
    return racine.btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // Strict: only the base64url alphabet, no padding, no length that cannot be base64.
  function depuisBase64url(texte) {
    if (typeof texte !== 'string' || !/^[A-Za-z0-9_-]*$/.test(texte) || texte.length % 4 === 1) {
      throw new Error('base64url_invalide');
    }
    var b64 = texte.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    var b = racine.atob(b64);
    var octets = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) octets[i] = b.charCodeAt(i);
    return octets;
  }

  function versBase64(octets) {
    var b = '';
    for (var i = 0; i < octets.length; i++) b += String.fromCharCode(octets[i]);
    return racine.btoa(b);
  }

  function utf8(texte) {
    return new TextEncoder().encode(texte);
  }

  // k = raw uncompressed P-256 public key (65 bytes, 0x04 || X || Y), base64url without '='.
  // importKey also refuses a point that is not on the curve.
  async function importerCleTele(k) {
    var brut = depuisBase64url(k);
    if (brut.length !== 65 || brut[0] !== 0x04) throw new Error('cle_invalide');
    try {
      return await sousCrypto().importKey('raw', brut, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    } catch (e) {
      throw new Error('cle_invalide');
    }
  }

  // The plaintext object, exactly the fields of the contract; "nom" only when given.
  function construireClair(source) {
    var nom = (source.nom || '').trim();
    var clair;
    if (source.type === 'm3u') {
      clair = { v: 1, type: 'm3u', url: (source.url || '').trim() };
    } else if (source.type === 'xtream') {
      clair = {
        v: 1,
        type: 'xtream',
        serveur: (source.serveur || '').trim(),
        utilisateur: (source.utilisateur || '').trim(),
        mot_de_passe: source.mot_de_passe || '' // never trimmed: a space can be part of a password
      };
    } else {
      throw new Error('type_inconnu');
    }
    if (nom) clair.nom = nom;
    return clair;
  }

  /*
   * cleTele: CryptoKey from importerCleTele; depot: deposit id (HKDF salt); clair: object or JSON string.
   * essai (TEST VECTOR ONLY): { ephemere: CryptoKeyPair, iv: Uint8Array } to fix the random parts.
   */
  async function chiffrer(cleTele, depot, clair, essai) {
    var s = sousCrypto();
    var paire = essai && essai.ephemere
      ? essai.ephemere
      : await s.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    var secret = await s.deriveBits({ name: 'ECDH', public: cleTele }, paire.privateKey, 256);
    var materiau = await s.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
    var cle = await s.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: utf8(depot), info: utf8(INFO) },
      materiau,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    var iv = essai && essai.iv ? essai.iv : racine.crypto.getRandomValues(new Uint8Array(12));
    if (iv.length !== 12) throw new Error('iv_invalide');
    var texte = typeof clair === 'string' ? clair : JSON.stringify(clair);
    var ct = new Uint8Array(await s.encrypt({ name: 'AES-GCM', iv: iv }, cle, utf8(texte)));
    var epk = new Uint8Array(await s.exportKey('raw', paire.publicKey));
    var enveloppe = JSON.stringify({ v: 1, epk: versBase64url(epk), iv: versBase64url(iv), ct: versBase64url(ct) });
    return versBase64(utf8(enveloppe));
  }

  racine.NitaDepot = {
    INFO: INFO,
    TAILLE_MAX: TAILLE_MAX,
    versBase64url: versBase64url,
    depuisBase64url: depuisBase64url,
    importerCleTele: importerCleTele,
    construireClair: construireClair,
    chiffrer: chiffrer
  };
})(globalThis);
