/*
 * NitaTV — www.nita.tv/connexion#a=<appairage>&t=<jeton> (contrat § 1, parcours « téléphone »).
 * Reads the fragment and erases it, gets a nonce from the server (GET /v1/nonce, 5 min, single use), shows
 * "Sign in with Google" (Google Identity Services, Web client, that nonce), then
 * POST /v1/appairage/{a} { jeton, google_id_token, nonce } -> 204: the TV picks up its session.
 * Nothing is stored by this page.
 */
(function () {
  'use strict';

  var API = NitaGoogle.API;
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
  var envoi = false;
  var termine = false;

  function fin(titre, texte) {
    termine = true;
    appairage = jeton = null;
    if (google_) google_.arreter(); // not yet created when the link is incomplete
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

  function erreurPreparation(e) {
    if (termine) return;
    if (e && e.message === 'pas_branche') {
      fin('Pas encore ouvert', 'La connexion par téléphone n\'est pas encore ouverte. Connectez-vous directement sur la télé.');
      return;
    }
    if (e && e.message === 'gis') {
      etat('Le bouton de Google n\'a pas pu se charger. Vérifiez le réseau de ce téléphone (ou un bloqueur de ' +
        'contenu), puis réessayez.', 'erreur');
    } else {
      etat('Impossible de joindre le serveur de NitaTV. Vérifiez le réseau de ce téléphone, puis réessayez.', 'erreur');
    }
    reessayer(true);
  }

  var google_ = NitaGoogle.bouton({
    div: $('bouton-google'),
    actif: function () { return !termine && !envoi; },
    avant: function () {
      if (Date.now() - debut > DUREE_MAX) {
        fin('Ce QR code a expiré', 'Il vaut 15 minutes. Affichez un nouveau QR code sur la télé.');
        return false;
      }
      reessayer(false);
    },
    recu: recu,
    erreur: erreurPreparation,
    apparence: function () { return { text: 'continue_with', locale: 'fr' }; }
  });
  function preparer() { return google_.preparer(); }

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

  // A Google answer (google.js): the ID token, and the nonce it was asked with — spent by this attempt.
  function recu(credential, n) {
    envoi = true;
    etat('Connexion de votre télé…');

    fetch(API + '/v1/appairage/' + encodeURIComponent(appairage), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: jeton, google_id_token: credential, nonce: n }),
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
  preparer().then(function () { if (!envoi && !termine && google_.arme()) etat(''); });
})();
