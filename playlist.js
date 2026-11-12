/*
 * NitaTV — the playlist steps of the app's onboarding, in the browser (contract § 5 and § 5 bis): « Type de
 * connexion » (Xtream Codes / Fichier M3U) → the fields → [Envoyer] → « Validé ! ». Shared by ajouter.js (the TV's
 * playlist QR) and connexion.js (the one scan: sign-in, then the playlist).
 * The playlist is encrypted IN THIS BROWSER (depot.js) with the TV's key — the CryptoKey the caller imported from the
 * `k` of the QR code, never from a server answer — and the deposit id `d` as HKDF salt, then
 * POST /v1/depot/{d} { jeton, chiffre }. The fields are emptied when the page ends; nothing is stored.
 */
var NitaPlaylist = (function () {
  'use strict';

  var P = NitaPage, $ = P.$, t = P.t;

  /*
   * o.api       the API base address
   * o.cle       CryptoKey of the TV (from the `k` of the QR code)
   * o.depot     deposit id (contract: the HKDF salt) ; o.jeton its single-use token
   * o.plusTard  optional: a function; shows « Plus tard » on « Type de connexion »
   */
  function demarrer(o) {
    var type = 'xtream';   // the app's onboarding opens on Xtream Codes (maquette: .choix .ligne.sel)
    var envoi = false;
    var termine = false;

    function viderChamps() {
      ['url', 'guide', 'serveur', 'utilisateur', 'mot_de_passe'].forEach(function (id) { $(id).value = ''; });
    }

    function finir(genre, titre, texte) {
      termine = true;
      viderChamps();
      o.cle = o.depot = o.jeton = null;
      P.fin(genre, titre, texte);
    }

    function choisir(nouveau) {
      type = nouveau;
      Array.prototype.forEach.call(document.querySelectorAll('#etape-type .ligne'), function (l) {
        var sel = l.dataset.type === type;
        l.classList.toggle('sel', sel);
        l.setAttribute('aria-checked', String(sel));
        l.tabIndex = sel ? 0 : -1;
      });
    }

    Array.prototype.forEach.call(document.querySelectorAll('#etape-type .ligne'), function (l) {
      l.addEventListener('click', function () { choisir(l.dataset.type); });
      l.addEventListener('keydown', function (e) {
        if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].indexOf(e.key) < 0) return;
        e.preventDefault();
        choisir(type === 'xtream' ? 'm3u' : 'xtream');
        document.querySelector('#etape-type .ligne.sel').focus();
      });
    });
    choisir(type);

    $('plus-tard').hidden = !o.plusTard;
    if (o.plusTard) $('plus-tard').addEventListener('click', function () { if (!envoi && !termine) o.plusTard(); });

    $('suivant').addEventListener('click', function () {
      if (termine) return;
      P.etat('etat-' + type, '');
      P.montrer(type);
      var premier = $(type === 'xtream' ? 'serveur' : 'url');
      try { premier.focus({ preventScroll: true }); } catch (e) { premier.focus(); }
    });
    Array.prototype.forEach.call(document.querySelectorAll('.retour-type'), function (b) {
      b.addEventListener('click', function () { if (!envoi && !termine) P.montrer('type'); });
    });

    $('oeil').addEventListener('click', function () {
      var champ = $('mot_de_passe');
      var clair = champ.type === 'password';
      champ.type = clair ? 'text' : 'password';
      this.innerHTML = clair ? OEIL_BARRE : OEIL;
      this.setAttribute('aria-label', t(clair ? 'masquer' : 'afficher'));
      this.title = t(clair ? 'masquer' : 'afficher');
      this.setAttribute('aria-pressed', String(clair));
    });

    // The app's checks (onboarding_screen.dart): Xtream, the three fields; M3U, the address — without a scheme it
    // becomes http://, as in the app, then it must be http(s) with a host. The guide is optional and sent as typed
    // (trimmed), as the app saves it. Returns the plaintext object, or shows the error and returns null.
    function lire() {
      var faute = null;
      var source;
      if (type === 'xtream') {
        source = { type: 'xtream', serveur: $('serveur').value, utilisateur: $('utilisateur').value,
          mot_de_passe: $('mot_de_passe').value };
        if (!source.serveur.trim()) faute = 'serveur';
        else if (!source.utilisateur.trim()) faute = 'utilisateur';
        else if (!source.mot_de_passe) faute = 'mot_de_passe';
        if (faute) { P.etat('etat-xtream', t('champsVides'), true); $(faute).focus(); return null; }
      } else {
        var url = $('url').value.trim();
        if (!url) { P.etat('etat-m3u', t('urlManquante'), true); $('url').focus(); return null; }
        if (url.indexOf('://') < 0) url = 'http://' + url;
        var ok = false;
        try { var u = new URL(url); ok = (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname; } catch (e) { ok = false; }
        if (!ok) { P.etat('etat-m3u', t('urlInvalide'), true); $('url').focus(); return null; }
        source = { type: 'm3u', url: url, guide: $('guide').value };
      }
      return NitaDepot.construireClair(source);
    }

    function envoyer(ev) {
      ev.preventDefault();
      if (envoi || termine) return;
      var ici = type;
      var etatId = 'etat-' + ici;
      var clair = lire();
      if (!clair) return;
      envoi = true;
      $('envoyer-' + ici).disabled = true;
      P.etat(etatId, t('envoi'));

      NitaDepot.chiffrer(o.cle, o.depot, clair).then(function (chiffre) {
        clair = null;
        if (chiffre.length > NitaDepot.TAILLE_MAX) return { status: 413, local: true };
        return fetch(o.api + '/v1/depot/' + encodeURIComponent(o.depot), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jeton: o.jeton, chiffre: chiffre }),
          cache: 'no-store',
          credentials: 'omit',
          referrerPolicy: 'no-referrer'
        });
      }).then(function (r) {
        if (r.status === 204 || r.status === 200) { finir('ok', t('valideTitre'), t('valideTexte')); return; }
        if (r.status === 410) { finir('info', t('plusValableTitre'), t('plusValableDepot')); return; }
        if (r.status === 413) { P.etat(etatId, t('tropLong'), true); return; }
        return (r.local ? Promise.resolve({}) : P.lireErreur(r)).then(function (j) {
          if (r.status === 429) P.etat(etatId, t('tropDEssais'), true);
          // contract § 0: only `pas_branche` means « not open »; occupe, google_injoignable… are passing: try again
          else if (r.status === 503) P.etat(etatId, t(j.erreur === 'pas_branche' ? 'pasOuvertDepot' : 'occupe'), true);
          else P.etat(etatId, t('refuse', { message: j.message, statut: r.status }), true);
        });
      }).catch(function (e) {
        // fetch() rejects with a TypeError on a network (or CORS) failure; WebCrypto rejects with a DOMException.
        P.etat(etatId, t(e instanceof TypeError ? 'reseau' : 'chiffrement'), true);
      }).then(function () {
        envoi = false;
        if (!termine) $('envoyer-' + ici).disabled = false;
      });
    }
    $('etape-xtream').addEventListener('submit', envoyer);
    $('etape-m3u').addEventListener('submit', envoyer);
    // A refusal that no longer applies goes as soon as the user types again (the « sending… » line stays).
    ['xtream', 'm3u'].forEach(function (f) {
      $('etape-' + f).addEventListener('input', function () {
        if (!envoi && $('etat-' + f).classList.contains('ko')) P.etat('etat-' + f, '');
      });
    });

    P.montrer('type');
    return { termine: function () { return termine; }, vider: viderChamps };
  }

  var OEIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12C5 7.5 8.3 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-5.8 6.5-9.5 6.5S5 16.5 2.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var OEIL_BARRE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12C5 7.5 8.3 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-5.8 6.5-9.5 6.5S5 16.5 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>';

  return { demarrer: demarrer, OEIL: OEIL };
})();
