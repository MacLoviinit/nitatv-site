/*
 * NitaTV — www.nita.tv/connexion#a=<appairage>&t=<jeton> (contrat § 1, parcours « téléphone »).
 * Reads the fragment and erases it, gets a nonce from the server (GET /v1/nonce, 5 min, single use), shows
 * "Sign in with Google" (Google Identity Services, Web client, that nonce), then
 * POST /v1/appairage/{a} { jeton, google_id_token, nonce } -> 204: the TV picks up its session.
 * Nothing is stored by this page.
 */
(function () {
  'use strict';

  var CLIENT_WEB = '720100975511-ovrrf97ocsdactpc61b2peg26vgqt6nt.apps.googleusercontent.com';
  var GIS = 'https://accounts.google.com/gsi/client';
  // Only a page served from this machine talks to the local test server; www.nita.tv always uses the real API.
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API = LOCAL ? 'http://127.0.0.1:8788' : 'https://api.nita.tv';
  var ID = /^[A-Za-z0-9_-]{1,200}$/;
  var DUREE_MAX = 20 * 60 * 1000; // the pairing lives 15 min: past 20, stop asking the server for nonces

  var $ = function (id) { return document.getElementById(id); };

  // A new QR opened in this same tab only changes the fragment: the browser does not reload the page, so do it.
  // (history.replaceState below does not fire hashchange.)
  window.addEventListener('hashchange', function () { location.reload(); });

  // 1. Read the fragment, then erase it from the address bar and from this history entry.
  var params = new URLSearchParams(location.hash.slice(1));
  var appairage = params.get('a');
  var jeton = params.get('t');
  params = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  var debut = Date.now();
  var nonce = null;
  var minuteur = null;
  var perime = false;
  var envoi = false;
  var termine = false;
  var gis = null; // Promise of the loaded Google library

  function fin(titre, texte) {
    termine = true;
    appairage = jeton = nonce = null;
    clearTimeout(minuteur);
    $('connexion').hidden = true;
    $('fin-titre').textContent = titre;
    $('fin-texte').textContent = texte;
    $('fin').hidden = false;
  }

  function etat(texte, genre) {
    var e = $('etat');
    e.textContent = texte;
    e.className = 'etat' + (genre ? ' ' + genre : '');
    e.hidden = !texte;
  }

  function reessayer(visible) { $('reessayer').hidden = !visible; }

  if (!appairage || !jeton || !ID.test(appairage) || !ID.test(jeton)) {
    fin('Ce lien est incomplet',
      'Scannez le QR code affiché par votre télé. Si vous avez rechargé cette page, scannez-le de nouveau : ' +
      'elle ne garde rien.');
    return;
  }
  $('connexion').hidden = false;

  function chargerGis() {
    if (gis) return gis;
    gis = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = GIS;
      s.async = true;
      s.onload = function () {
        if (window.google && google.accounts && google.accounts.id) ok(); else ko(new Error('gis'));
      };
      s.onerror = function () { ko(new Error('gis')); };
      document.head.appendChild(s);
    });
    gis.catch(function () { gis = null; });
    return gis;
  }

  function demanderNonce() {
    return fetch(API + '/v1/nonce', { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) {
        if (r.status === 503) throw new Error('pas_branche');
        if (!r.ok) throw new Error('nonce_http_' + r.status);
        return r.json();
      }).then(function (j) {
        if (!j || typeof j.nonce !== 'string' || !j.nonce) throw new Error('nonce_vide');
        return j;
      });
  }

  // A new nonce: re-initialise Google Identity Services with it (initialize() replaces the configuration)
  // and render the button again. Renewed 45 s before it expires, at most every 4 min.
  function armer(j) {
    nonce = j.nonce;
    perime = false;
    clearTimeout(minuteur);
    var reste = Date.parse(j.expire_a) - Date.now();
    var delai = isFinite(reste) ? Math.min(Math.max(reste - 45000, 30000), 240000) : 240000;
    minuteur = setTimeout(renouveler, delai);
    google.accounts.id.initialize({
      client_id: CLIENT_WEB,
      callback: recu,
      nonce: nonce,
      ux_mode: 'popup',
      auto_select: false
    });
    var div = $('bouton-google');
    div.textContent = '';
    div.hidden = false;
    google.accounts.id.renderButton(div, {
      type: 'standard', theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill',
      logo_alignment: 'left', locale: 'fr', width: Math.max(200, Math.min(320, div.clientWidth || 320))
    });
  }

  function erreurPreparation(e) {
    if (termine) return;
    if (e && e.message === 'pas_branche') {
      fin('Pas encore ouvert', 'La connexion par téléphone n\'est pas encore ouverte. Connectez-vous directement sur la télé.');
      return;
    }
    $('bouton-google').hidden = true;
    if (e && e.message === 'gis') {
      etat('Le bouton de Google n\'a pas pu se charger. Vérifiez le réseau de ce téléphone (ou un bloqueur de ' +
        'contenu), puis réessayez.', 'erreur');
    } else {
      etat('Impossible de joindre le serveur de NitaTV. Vérifiez le réseau de ce téléphone, puis réessayez.', 'erreur');
    }
    reessayer(true);
  }

  function preparer() {
    if (termine) return Promise.resolve();
    if (Date.now() - debut > DUREE_MAX) {
      fin('Ce QR code a expiré', 'Il vaut 15 minutes. Affichez un nouveau QR code sur la télé.');
      return Promise.resolve();
    }
    reessayer(false);
    return Promise.all([chargerGis(), demanderNonce()]).then(function (r) {
      if (termine || envoi) return;
      armer(r[1]);
    }).catch(erreurPreparation);
  }

  function renouveler() {
    if (termine || envoi) return;
    if (document.hidden) { perime = true; return; } // renewed when the page is shown again
    preparer();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && perime) preparer();
  });

  $('reessayer').addEventListener('click', function () {
    etat('');
    preparer();
  });

  function lireErreur(reponse) {
    return reponse.json().then(function (j) { return j || {}; }, function () { return {}; });
  }

  // The nonce is spent by any attempt that reached the server: ask for a new one and a new tap.
  function nouvelEssai(texte) {
    envoi = false;
    etat(texte, 'erreur');
    preparer();
  }

  // Google Identity Services callback: response.credential is the ID token (JWT).
  function recu(reponse) {
    if (envoi || termine || !reponse || !reponse.credential) return;
    envoi = true;
    clearTimeout(minuteur);
    var n = nonce;
    nonce = null;
    $('bouton-google').hidden = true;
    etat('Connexion de votre télé…');

    fetch(API + '/v1/appairage/' + encodeURIComponent(appairage), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: jeton, google_id_token: reponse.credential, nonce: n }),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (r) {
      if (r.status === 204 || r.status === 200) {
        fin('C\'est fait', 'Regardez votre télé : elle se connecte à votre compte Google.');
        return;
      }
      if (r.status === 410) {
        fin('Ce QR code n\'est plus valable',
          'Il sert une seule fois, pendant 15 minutes. Si vous venez de vous connecter, regardez votre télé. ' +
          'Sinon, affichez un nouveau QR code sur la télé.');
        return;
      }
      return lireErreur(r).then(function (j) {
        if (r.status === 503) {
          fin('Pas encore ouvert', 'La connexion par téléphone n\'est pas encore ouverte. Connectez-vous directement sur la télé.');
        } else if (r.status === 401 && j.erreur === 'nonce_invalide') {
          nouvelEssai('La connexion a pris trop de temps. Appuyez de nouveau sur le bouton de Google.');
        } else if (r.status === 429) {
          nouvelEssai('Trop d\'essais. Patientez une minute, puis appuyez de nouveau sur le bouton.');
        } else if (r.status === 400 || r.status === 401 || r.status === 403) {
          nouvelEssai('Ce compte Google n\'a pas pu être confirmé' + (j.message ? ' : ' + j.message : '') +
            '. Réessayez, ou choisissez un autre compte.');
        } else {
          nouvelEssai('La connexion a été refusée' + (j.message ? ' : ' + j.message : '') + ' (' + r.status + '). Réessayez.');
        }
      });
    }).catch(function () {
      if (!termine) nouvelEssai('Pas de connexion avec le serveur. Vérifiez le réseau de ce téléphone, puis réessayez.');
    });
  }

  etat('Préparation…');
  preparer().then(function () { if (!envoi && !termine && nonce) etat(''); });
})();
