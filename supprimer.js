/*
 * NitaTV — www.nita.tv/supprimer (contract § 3 bis): delete one's NitaTV account from the web, the link Google Play
 * requires next to the in-app path. No session here: the page proves the account like `connexion` does (Google
 * Identity Services, Web client, a nonce from GET /v1/nonce — google.js), then ASKS FOR AN EXPLICIT CONFIRMATION
 * (a distinct button: nothing is erased by the Google tap alone), then
 * POST /v1/compte/suppression { google_id_token, nonce } -> 204 (deleted, or there was no account: nothing created).
 * A nonce serves once, even a refused attempt spends it: after any answer but 204, a NEW nonce is fetched before
 * Google is shown again. Nothing is stored by this page; the ID token lives in a variable until the answer.
 * French and English on one page: one language shown at a time (#fr / #en, else the browser's language).
 */
(function () {
  'use strict';

  var API = NitaGoogle.API;
  var $ = function (id) { return document.getElementById(id); };
  document.documentElement.classList.add('js');

  var T = {
    fr: {
      intro: 'Connectez-vous avec le compte Google de votre compte NitaTV. Rien n\'est supprimé avant votre confirmation.',
      preparation: 'Préparation…',
      confirmerTitre: function (e) { return 'Supprimer le compte NitaTV de ' + e + '\u00a0?'; },
      confirmerTexte: 'C\'est définitif. Le compte, ses appareils et ses connexions sont effacés du serveur de NitaTV\u00a0; ' +
        'l\'essai gratuit ne recommence pas, et un abonnement Google Play n\'est pas résilié.',
      annuler: 'Annuler',
      supprimer: 'Supprimer mon compte',
      reessayer: 'Réessayer',
      encours: 'Suppression de votre compte…',
      faitTitre: 'C\'est fait',
      faitTexte: function (e) {
        return 'Si un compte NitaTV était lié à ' + e + ', il est supprimé. Sinon, aucun compte NitaTV n\'est lié à ce ' +
          'compte Google, et rien n\'a été créé. Un abonnement Google Play, lui, n\'est pas résilié\u00a0: il se résilie ' +
          'dans Google Play.';
      },
      pasBrancheTitre: 'Le service des comptes n\'est pas encore ouvert',
      pasBrancheTexte: 'Il n\'y a rien à supprimer\u00a0: aucun compte NitaTV n\'existe encore.',
      google: 'Google n\'a pas pu confirmer ce compte\u00a0: rien n\'a été supprimé. Reconnectez-vous avec Google, puis ' +
        'confirmez de nouveau.',
      nonce: 'La confirmation a pris trop de temps\u00a0: rien n\'a été supprimé. Reconnectez-vous avec Google, puis ' +
        'confirmez de nouveau.',
      refuse: function (c) {
        return 'La suppression a été refusée (' + c + ')\u00a0: rien n\'a été supprimé. Reconnectez-vous avec Google, puis ' +
          'réessayez.';
      },
      serveur: function (c) {
        return 'Le serveur de NitaTV a répondu par une erreur (' + c + '). Reconnectez-vous avec Google, puis ' +
          'réessayez\u00a0: si la suppression avait déjà eu lieu, la refaire ne change rien.';
      },
      reseau: 'La réponse du serveur de NitaTV n\'est pas arrivée. Vérifiez le réseau, reconnectez-vous avec Google, ' +
        'puis réessayez\u00a0: si la suppression avait déjà eu lieu, la refaire ne change rien.',
      injoignable: 'Impossible de joindre le serveur de NitaTV. Vérifiez le réseau, puis réessayez.',
      gis: 'Le bouton de Google n\'a pas pu se charger. Vérifiez le réseau (ou un bloqueur de contenu), puis réessayez.',
      ceCompte: 'ce compte Google'
    },
    en: {
      intro: 'Sign in with the Google account of your NitaTV account. Nothing is deleted until you confirm.',
      preparation: 'Getting ready…',
      confirmerTitre: function (e) { return 'Delete the NitaTV account of ' + e + '?'; },
      confirmerTexte: 'This cannot be undone. The account, its devices and its sign-ins are erased from NitaTV\'s ' +
        'server; the free trial does not start again, and a Google Play subscription is not cancelled.',
      annuler: 'Cancel',
      supprimer: 'Delete my account',
      reessayer: 'Try again',
      encours: 'Deleting your account…',
      faitTitre: 'Done',
      faitTexte: function (e) {
        return 'If a NitaTV account was linked to ' + e + ', it is deleted. Otherwise, no NitaTV account is linked to ' +
          'this Google account, and nothing was created. A Google Play subscription, however, is not cancelled: you ' +
          'cancel it in Google Play.';
      },
      pasBrancheTitre: 'The account service is not open yet',
      pasBrancheTexte: 'There is nothing to delete: no NitaTV account exists yet.',
      google: 'Google could not confirm this account: nothing was deleted. Sign in with Google again, then confirm ' +
        'again.',
      nonce: 'Confirming took too long: nothing was deleted. Sign in with Google again, then confirm again.',
      refuse: function (c) {
        return 'The deletion was refused (' + c + '): nothing was deleted. Sign in with Google again, then try again.';
      },
      serveur: function (c) {
        return 'NitaTV\'s server answered with an error (' + c + '). Sign in with Google again, then try again: if the ' +
          'deletion had already happened, doing it again changes nothing.';
      },
      reseau: 'NitaTV\'s server\'s answer did not arrive. Check the network, sign in with Google again, then try ' +
        'again: if the deletion had already happened, doing it again changes nothing.',
      injoignable: 'Cannot reach NitaTV\'s server. Check the network, then try again.',
      gis: 'Google\'s button could not load. Check the network (or a content blocker), then try again.',
      ceCompte: 'this Google account'
    }
  };

  function choisirLangue() {
    var h = location.hash.slice(1);
    if (h === 'fr' || h === 'en') return h;
    return /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';
  }

  var langue = choisirLangue();
  var phase = 'bouton';   // bouton (Google shown) · confirmer · envoi · fin
  var jeton = null;       // the Google ID token, between the Google tap and the server's answer — memory only
  var nonce = null;       // the nonce that token was asked with
  var email = '';         // read from the token for the confirmation (display only)
  var vueEtat = null;     // [key, kind, argument] of the message shown
  var vueFin = null;      // key of the final state

  function t(cle, arg) {
    var v = T[langue][cle];
    return typeof v === 'function' ? v(arg) : v;
  }

  // Everything visible, in the current language, from the state above (also after a language change).
  function rendre() {
    document.documentElement.lang = langue;
    var sections = document.querySelectorAll('section.langue');
    for (var i = 0; i < sections.length; i++) {
      var active = sections[i].id === langue;
      sections[i].classList.toggle('active', active);
      if (active) sections[i].querySelector('.place-ici').appendChild($('ici'));
    }
    $('ici').hidden = false;
    $('ici-intro').textContent = t('intro');
    $('ici-intro').hidden = phase === 'fin';
    $('annuler').textContent = t('annuler');
    $('supprimer').textContent = t('supprimer');
    $('reessayer').textContent = t('reessayer');
    var qui = email || t('ceCompte');
    $('confirmer-titre').textContent = t('confirmerTitre', qui);
    $('confirmer-texte').textContent = t('confirmerTexte');
    $('confirmer').hidden = !(phase === 'confirmer' || phase === 'envoi');
    var e = $('etat');
    e.textContent = vueEtat ? t(vueEtat[0], vueEtat[2]) : '';
    e.className = 'etat' + (vueEtat && vueEtat[1] ? ' ' + vueEtat[1] : '');
    e.hidden = !vueEtat;
    $('fin').hidden = !vueFin;
    if (vueFin) {
      $('fin-titre').textContent = t(vueFin + 'Titre');
      $('fin-texte').textContent = t(vueFin + 'Texte', qui);
    }
  }

  function etat(cle, genre, arg) { vueEtat = cle ? [cle, genre || '', arg] : null; rendre(); }
  function reessayer(visible) { $('reessayer').hidden = !visible; }

  function fin(cle) {
    phase = 'fin';
    jeton = nonce = null;
    google_.arreter();
    vueEtat = null;
    vueFin = cle;
    reessayer(false);
    $('bouton-google').hidden = true;
    rendre();
  }

  function erreurPreparation(e) {
    if (e && e.message === 'pas_branche') { fin('pasBranche'); return; }
    // After a failed attempt, its message stays (it says whether anything was deleted); only « Try again » is added.
    var apresEssai = vueEtat && ['google', 'nonce', 'refuse', 'serveur', 'reseau'].indexOf(vueEtat[0]) >= 0;
    if (!apresEssai) etat(e && e.message === 'gis' ? 'gis' : 'injoignable', 'erreur');
    reessayer(true);
  }

  // A Google answer (google.js): keep the token in memory and ASK — nothing is sent yet.
  function recu(credential, n) {
    jeton = credential;
    nonce = n;
    email = String(NitaGoogle.lireJeton(credential).email || '');
    phase = 'confirmer';
    $('supprimer').disabled = $('annuler').disabled = false;
    etat(null);
    $('annuler').focus();
  }

  var google_ = NitaGoogle.bouton({
    div: $('bouton-google'),
    actif: function () { return phase === 'bouton'; },
    avant: function () { reessayer(false); },
    recu: recu,
    erreur: erreurPreparation,
    apparence: function () { return { text: 'signin_with', locale: langue }; }
  });

  // Back to Google with a NEW nonce: the one just used is spent (or tied to a token we threw away).
  function nouvelEssai(cle, arg) {
    jeton = nonce = null;
    email = '';
    phase = 'bouton';
    if (cle) etat(cle, 'erreur', arg); else etat(null);
    return google_.preparer();
  }

  $('annuler').addEventListener('click', function () {
    if (phase !== 'confirmer') return;
    nouvelEssai(null);
  });

  $('reessayer').addEventListener('click', function () {
    if (phase !== 'bouton') return;
    etat(null);
    google_.preparer();
  });

  function lireErreur(reponse) {
    return reponse.json().then(function (j) { return j || {}; }, function () { return {}; });
  }

  $('supprimer').addEventListener('click', function () {
    if (phase !== 'confirmer' || !jeton || !nonce) return;
    phase = 'envoi';
    $('supprimer').disabled = $('annuler').disabled = true;
    etat('encours');
    var corps = JSON.stringify({ google_id_token: jeton, nonce: nonce });
    jeton = nonce = null;
    fetch(API + '/v1/compte/suppression', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: corps,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (r) {
      corps = null;
      if (r.status === 204 || r.status === 200) { fin('fait'); return; }
      return lireErreur(r).then(function (j) {
        if (r.status === 503) fin('pasBranche');
        else if (r.status === 401 && j.erreur === 'google') nouvelEssai('google');
        else if (r.status === 401 && j.erreur === 'nonce_invalide') nouvelEssai('nonce');
        else if (r.status >= 400 && r.status < 500) nouvelEssai('refuse', r.status);
        else nouvelEssai('serveur', r.status);
      });
    }).catch(function () {
      corps = null;
      if (phase === 'envoi') nouvelEssai('reseau');
    });
  });

  window.addEventListener('hashchange', function () {
    var h = location.hash.slice(1);
    if ((h === 'fr' || h === 'en') && h !== langue) {
      langue = h;
      rendre();
      google_.redessiner(); // Google's button in the new language (its nonce is kept)
    }
  });

  etat('preparation');
  google_.preparer().then(function () {
    if (phase === 'bouton' && vueEtat && vueEtat[0] === 'preparation' && google_.arme()) etat(null);
  });
})();
