/*
 * NitaTV — shared by connexion.js and ajouter.js: the language (French when the browser is in French, else English),
 * the texts, the steps of the box (one shown at a time, the dots under it) and the final states.
 * The texts of the steps are the app's (lib/l10n/app_fr.arb, app_en.arb: onboarding* (the guide: onboardingM3uGuide*), commun*,
 * motDePasse*); the others are this site's. Nothing is stored by this file.
 */
var NitaPage = (function () {
  'use strict';

  var langue = /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';

  var T = {
    fr: {
      // the app (onboarding)
      typeTitre: 'Type de connexion',
      xtream: 'Xtream Codes',
      xtreamSous: 'Serveur, nom d\'utilisateur, mot de passe',
      m3u: 'Fichier M3U',
      m3uSous: 'URL de la playlist M3U/M3U8',
      xtreamTitre: 'Connexion Xtream',
      serveur: 'Serveur',
      utilisateur: 'Nom d\'utilisateur',
      motDePasse: 'Mot de passe',
      afficher: 'Afficher le mot de passe',
      masquer: 'Masquer le mot de passe',
      m3uTitre: 'Playlist M3U',
      url: 'URL de la playlist',
      urlAide: 'Entrez l\'URL complète de votre fichier M3U ou M3U8.',
      guide: 'Guide des programmes (facultatif)',
      guideAide: 'Si votre fournisseur vous a donné une adresse de guide, collez-la ici.',
      suivant: 'Suivant',
      retour: 'Retour',
      plusTard: 'Plus tard',
      champsVides: 'Veuillez remplir tous les champs',
      urlManquante: 'Veuillez entrer une URL',
      urlInvalide: 'URL invalide',
      // this site
      envoyer: 'Envoyer',
      envoi: 'Chiffrement et envoi…',
      valideTitre: 'Validé !',
      valideTexte: 'Votre playlist est envoyée à votre appareil.',
      plusValableTitre: 'Ce QR code n\'est plus valable',
      plusValableDepot: 'Il sert une seule fois, pendant 15 minutes. Si vous venez de l\'envoyer, regardez votre télé : ' +
        'la playlist est peut-être déjà arrivée. Sinon, affichez un nouveau QR code sur la télé.',
      tropLong: 'Trop long pour être envoyé. Vérifiez l\'adresse.',
      tropDEssais: 'Trop d\'essais. Patientez une minute, puis réessayez.',
      pasOuvertDepot: 'Le service n\'est pas encore ouvert. Ajoutez la playlist directement sur la télé.',
      occupe: 'Le serveur de NitaTV ne peut pas répondre pour le moment. Réessayez dans un instant.',
      refuse: function (a) { return 'L\'envoi a été refusé' + (a.message ? ' : ' + a.message : '') + ' (' + a.statut + ').'; },
      reseau: 'Pas de connexion avec le serveur. Vérifiez le réseau de ce téléphone, puis réessayez.',
      chiffrement: 'Le chiffrement a échoué sur ce navigateur : rien n\'a été envoyé.',
      incompletTitre: 'Ce lien est incomplet',
      incompletAjouter: 'Scannez le QR code affiché par votre télé dans « Ajouter une source ». Si vous avez ' +
        'rechargé cette page, scannez-le de nouveau : elle ne garde rien.',
      ancienTitre: 'Navigateur trop ancien',
      ancienTexte: 'Ce navigateur ne sait pas chiffrer la playlist. Essayez avec un navigateur à jour.',
      noteAjouter: 'Ce que vous saisissez est chiffré avec une clé que seule votre télé possède : le serveur de NitaTV ' +
        'ne transporte qu\'un bloc illisible, effacé dès que la télé l\'a reçu. Rien n\'est gardé sur ce téléphone.',
      // connexion
      compteTitre: 'Connectez votre compte Google',
      compteTexte: 'Choisissez le compte Google à utiliser sur votre télé NitaTV.',
      preparation: 'Préparation…',
      reessayer: 'Réessayer',
      gis: 'Le bouton de Google n\'a pas pu se charger. Vérifiez le réseau de ce téléphone (ou un bloqueur de contenu), ' +
        'puis réessayez.',
      injoignable: 'Impossible de joindre le serveur de NitaTV. Vérifiez le réseau de ce téléphone, puis réessayez.',
      connexionEnCours: 'Connexion de votre télé…',
      nonce: 'La connexion a pris trop de temps. Appuyez de nouveau sur le bouton de Google.',
      tropDEssaisGoogle: 'Trop d\'essais. Patientez une minute, puis appuyez de nouveau sur le bouton.',
      nonConfirme: function (a) {
        return 'Ce compte Google n\'a pas pu être confirmé' + (a.message ? ' : ' + a.message : '') +
          '. Réessayez, ou choisissez un autre compte.';
      },
      connexionRefusee: function (a) {
        return 'La connexion a été refusée' + (a.message ? ' : ' + a.message : '') + ' (' + a.statut + '). Réessayez.';
      },
      reseauConnexion: 'Pas de connexion avec le serveur. Vérifiez le réseau de ce téléphone, puis réessayez.',
      expireTitre: 'Ce QR code a expiré',
      expireTexte: 'Il vaut 15 minutes. Affichez un nouveau QR code sur la télé.',
      plusValableConnexion: 'Il sert une seule fois, pendant 15 minutes. Si vous venez de vous connecter, regardez votre ' +
        'télé. Sinon, affichez un nouveau QR code sur la télé.',
      pasOuvertTitre: 'Pas encore ouvert',
      pasOuvertConnexion: 'La connexion par téléphone n\'est pas encore ouverte. Connectez-vous directement sur la télé.',
      incompletConnexion: 'Scannez le QR code affiché par votre télé. Si vous avez rechargé cette page, scannez-le de ' +
        'nouveau : elle ne garde rien.',
      connecte: function (a) { return a.email ? 'Connecté : ' + a.email : 'Connecté'; },
      attente: 'Votre télé prépare l\'envoi de votre playlist…',
      retournez: 'Retournez à votre télé.',
      retournezPlusTard: 'Retournez à votre télé : vous y ajouterez votre playlist.',
      noteConnexion: 'Google confirme votre compte à NitaTV ; NitaTV ne voit jamais votre mot de passe. Votre télé ' +
        'reçoit la connexion, ce téléphone ne garde rien.',
      confidentialite: 'Confidentialité'
    },
    en: {
      typeTitre: 'Connection type',
      xtream: 'Xtream Codes',
      xtreamSous: 'Server, username, password',
      m3u: 'M3U file',
      m3uSous: 'M3U/M3U8 playlist URL',
      xtreamTitre: 'Xtream connection',
      serveur: 'Server',
      utilisateur: 'Username',
      motDePasse: 'Password',
      afficher: 'Show password',
      masquer: 'Hide password',
      m3uTitre: 'M3U playlist',
      url: 'Playlist URL',
      urlAide: 'Enter the full URL of your M3U or M3U8 file.',
      guide: 'TV guide (optional)',
      guideAide: 'If your provider gave you a guide address, paste it here.',
      suivant: 'Next',
      retour: 'Back',
      plusTard: 'Later',
      champsVides: 'Please fill in all fields',
      urlManquante: 'Please enter a URL',
      urlInvalide: 'Invalid URL',
      envoyer: 'Send',
      envoi: 'Encrypting and sending…',
      valideTitre: 'Done!',
      valideTexte: 'Your playlist has been sent to your device.',
      plusValableTitre: 'This QR code is no longer valid',
      plusValableDepot: 'It works once, for 15 minutes. If you have just sent it, look at your TV: the playlist may already ' +
        'be there. Otherwise, show a new QR code on the TV.',
      tropLong: 'Too long to be sent. Check the address.',
      tropDEssais: 'Too many attempts. Wait a minute, then try again.',
      pasOuvertDepot: 'The service is not open yet. Add the playlist directly on the TV.',
      occupe: 'NitaTV\'s server cannot answer right now. Try again in a moment.',
      refuse: function (a) { return 'Sending was refused' + (a.message ? ': ' + a.message : '') + ' (' + a.statut + ').'; },
      reseau: 'No connection with the server. Check this phone\'s network, then try again.',
      chiffrement: 'Encryption failed in this browser: nothing was sent.',
      incompletTitre: 'This link is incomplete',
      incompletAjouter: 'Scan the QR code shown by your TV in “Add a source”. If you reloaded this page, scan it again: ' +
        'it keeps nothing.',
      ancienTitre: 'Browser too old',
      ancienTexte: 'This browser cannot encrypt the playlist. Try an up-to-date browser.',
      noteAjouter: 'What you type is encrypted with a key that only your TV has: NitaTV\'s server only carries an unreadable ' +
        'block, erased as soon as the TV has received it. Nothing is kept on this phone.',
      compteTitre: 'Connect your Google account',
      compteTexte: 'Choose the Google account to use on your NitaTV TV.',
      preparation: 'Getting ready…',
      reessayer: 'Try again',
      gis: 'Google\'s button could not load. Check this phone\'s network (or a content blocker), then try again.',
      injoignable: 'Cannot reach NitaTV\'s server. Check this phone\'s network, then try again.',
      connexionEnCours: 'Connecting your TV…',
      nonce: 'Signing in took too long. Tap Google\'s button again.',
      tropDEssaisGoogle: 'Too many attempts. Wait a minute, then tap the button again.',
      nonConfirme: function (a) {
        return 'This Google account could not be confirmed' + (a.message ? ': ' + a.message : '') +
          '. Try again, or choose another account.';
      },
      connexionRefusee: function (a) {
        return 'Signing in was refused' + (a.message ? ': ' + a.message : '') + ' (' + a.statut + '). Try again.';
      },
      reseauConnexion: 'No connection with the server. Check this phone\'s network, then try again.',
      expireTitre: 'This QR code has expired',
      expireTexte: 'It is valid for 15 minutes. Show a new QR code on the TV.',
      plusValableConnexion: 'It works once, for 15 minutes. If you have just signed in, look at your TV. Otherwise, show a ' +
        'new QR code on the TV.',
      pasOuvertTitre: 'Not open yet',
      pasOuvertConnexion: 'Signing in with a phone is not open yet. Sign in directly on the TV.',
      incompletConnexion: 'Scan the QR code shown by your TV. If you reloaded this page, scan it again: it keeps nothing.',
      connecte: function (a) { return a.email ? 'Signed in: ' + a.email : 'Signed in'; },
      attente: 'Your TV is getting ready for your playlist…',
      retournez: 'Go back to your TV.',
      retournezPlusTard: 'Go back to your TV: you will add your playlist there.',
      noteConnexion: 'Google confirms your account to NitaTV; NitaTV never sees your password. Your TV receives the ' +
        'sign-in, this phone keeps nothing.',
      confidentialite: 'Privacy'
    }
  };

  function t(cle, arg) {
    var v = T[langue][cle];
    if (v === undefined) throw new Error('texte absent : ' + cle);
    return typeof v === 'function' ? v(arg || {}) : v;
  }

  var $ = function (id) { return document.getElementById(id); };

  // The static texts: data-t (textContent), data-t-aria (aria-label), data-t-titre (title).
  function traduire() {
    document.documentElement.lang = langue;
    Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (e) { e.textContent = t(e.dataset.t); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-t-aria]'), function (e) {
      e.setAttribute('aria-label', t(e.dataset.tAria));
    });
  }

  // One step shown; the dots under the box (data-ordre of .points: the step ids, in order; data-point of a step
  // names the dot it belongs to). The final step marks every dot as done.
  function montrer(id) {
    Array.prototype.forEach.call(document.querySelectorAll('.boite > .etape'), function (e) {
      e.hidden = e.id !== 'etape-' + id;
    });
    var points = document.querySelector('.points');
    if (!points) return;
    var ordre = points.dataset.ordre.split(',');
    var etape = $('etape-' + id);
    var ici = ordre.indexOf(etape && etape.dataset.point ? etape.dataset.point : id);
    var fin = id === 'fin';
    Array.prototype.forEach.call(points.children, function (p, i) {
      p.className = fin || i < ici ? 'fait' : i === ici ? 'ici' : '';
    });
  }

  // The final step: an icon (ok: the green check; info: the cyan i), a title, a sentence.
  var ICONES = {
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.2"/></svg>',
    info: '<svg class="info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.7v.1"/></svg>'
  };
  function fin(genre, titre, texte) {
    $('fin-icone').innerHTML = ICONES[genre] || ICONES.info;
    $('fin-titre').textContent = titre;
    $('fin-texte').textContent = texte || '';
    $('fin-texte').hidden = !texte;
    montrer('fin');
    var e = document.activeElement;
    if (e && e !== document.body && e.blur) e.blur();
  }

  function etat(id, texte, ko) {
    var e = $(id);
    e.textContent = texte || '';
    e.className = 'etat' + (ko ? ' ko' : '');
    e.hidden = !texte;
  }

  // The address of a Google account, shortened like the app shows it (a…@gmail.com).
  function masquer(email) {
    var m = /^([^@])[^@]*(@.+)$/.exec(String(email || ''));
    return m ? m[1] + '…' + m[2] : '';
  }

  function lireErreur(reponse) {
    return reponse.json().then(function (j) { return j || {}; }, function () { return {}; });
  }

  return { langue: langue, T: T, t: t, $: $, traduire: traduire, montrer: montrer, fin: fin, etat: etat, masquer: masquer,
    lireErreur: lireErreur, ID: /^[A-Za-z0-9_-]{1,200}$/ };
})();
