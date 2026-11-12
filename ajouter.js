/*
 * NitaTV — www.nita.tv/ajouter#d=<dépôt>&t=<jeton>&k=<clé publique de la télé> (contrat § 5).
 * Reads the fragment, erases it from the address bar, encrypts the playlist in the browser (depot.js),
 * POST /v1/depot/{d} { jeton, chiffre }. Nothing is stored: no storage API, the fragment is dropped at once.
 */
(function () {
  'use strict';

  // Only a page served from this machine talks to the local test server; www.nita.tv always uses the real API.
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API = LOCAL ? 'http://127.0.0.1:8788' : 'https://api.nita.tv';
  var ID = /^[A-Za-z0-9_-]{1,200}$/;

  var $ = function (id) { return document.getElementById(id); };

  // A new QR opened in this same tab only changes the fragment: the browser does not reload the page, so do it.
  // (history.replaceState below does not fire hashchange.)
  window.addEventListener('hashchange', function () { location.reload(); });

  // 1. Read the fragment, then erase it (address bar + this history entry) before anything else.
  var params = new URLSearchParams(location.hash.slice(1));
  var depot = params.get('d');
  var jeton = params.get('t');
  var k = params.get('k');
  params = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  var cleTele = null;
  var termine = false;

  function fin(titre, texte) {
    termine = true;
    depot = jeton = k = null;
    cleTele = null;
    viderChamps();
    $('formulaire').hidden = true;
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

  function viderChamps() {
    ['url', 'serveur', 'utilisateur', 'mot_de_passe', 'nom'].forEach(function (id) { $(id).value = ''; });
  }

  function typeChoisi() {
    return document.querySelector('input[name=type]:checked').value;
  }

  function lienIncomplet() {
    fin('Ce lien est incomplet',
      'Scannez le QR code affiché par votre télé dans « Ajouter une source ». ' +
      'Si vous avez rechargé cette page, scannez-le de nouveau : elle ne garde rien.');
  }

  if (!depot || !jeton || !k || !ID.test(depot) || !ID.test(jeton)) { lienIncomplet(); return; }
  if (!window.crypto || !window.crypto.subtle || !window.NitaDepot) {
    fin('Navigateur trop ancien', 'Ce navigateur ne sait pas chiffrer la playlist. Essayez avec un navigateur à jour.');
    return;
  }

  NitaDepot.importerCleTele(k).then(function (cle) {
    cleTele = cle;
    $('formulaire').hidden = false;
  }, lienIncomplet);

  // Type switch.
  Array.prototype.forEach.call(document.querySelectorAll('input[name=type]'), function (r) {
    r.addEventListener('change', function () {
      var x = typeChoisi() === 'xtream';
      $('bloc-m3u').hidden = x;
      $('bloc-xtream').hidden = !x;
      etat('');
    });
  });

  $('voir').addEventListener('click', function () {
    var champ = $('mot_de_passe');
    var montre = champ.type === 'password';
    champ.type = montre ? 'text' : 'password';
    this.textContent = montre ? 'Masquer' : 'Afficher';
    this.setAttribute('aria-pressed', String(montre));
  });

  function estAdresse(texte) {
    try {
      var u = new URL(texte);
      return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
    } catch (e) { return false; }
  }

  // Returns the plaintext object, or focuses the faulty field and returns null.
  function lireFormulaire() {
    var source = {
      type: typeChoisi(),
      url: $('url').value,
      serveur: $('serveur').value,
      utilisateur: $('utilisateur').value,
      mot_de_passe: $('mot_de_passe').value,
      nom: $('nom').value
    };
    var faute = null;
    if (source.type === 'm3u') {
      if (!source.url.trim()) faute = ['url', 'Indiquez l\'adresse de la playlist.'];
      else if (!estAdresse(source.url.trim())) faute = ['url', 'L\'adresse doit commencer par http:// ou https://.'];
    } else {
      if (!source.serveur.trim()) faute = ['serveur', 'Indiquez l\'adresse du serveur.'];
      else if (!source.utilisateur.trim()) faute = ['utilisateur', 'Indiquez votre identifiant.'];
      else if (!source.mot_de_passe) faute = ['mot_de_passe', 'Indiquez votre mot de passe.'];
    }
    if (faute) {
      etat(faute[1], 'erreur');
      $(faute[0]).focus();
      return null;
    }
    return NitaDepot.construireClair(source);
  }

  function lireErreur(reponse) {
    return reponse.json().then(function (j) { return j || {}; }, function () { return {}; });
  }

  var envoi = false;
  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (envoi || termine || !cleTele) return;
    var clair = lireFormulaire();
    if (!clair) return;
    envoi = true;
    $('envoyer').disabled = true;
    etat('Chiffrement et envoi…');

    NitaDepot.chiffrer(cleTele, depot, clair).then(function (chiffre) {
      clair = null;
      if (chiffre.length > NitaDepot.TAILLE_MAX) return { status: 413, local: true };
      return fetch(API + '/v1/depot/' + encodeURIComponent(depot), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeton: jeton, chiffre: chiffre }),
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      });
    }).then(function (r) {
      if (r.status === 204 || r.status === 200) {
        fin('Envoyé', 'Regardez votre télé : elle vous propose d\'ajouter la playlist.');
        return;
      }
      if (r.status === 410) {
        fin('Ce QR code n\'est plus valable',
          'Il sert une seule fois, pendant 15 minutes. Si vous venez de l\'envoyer, regardez votre télé : la ' +
          'playlist est peut-être déjà arrivée. Sinon, affichez un nouveau QR code sur la télé.');
        return;
      }
      if (r.status === 413) {
        etat('Trop long pour être envoyé. Vérifiez l\'adresse et le nom, ou raccourcissez le nom.', 'erreur');
        return;
      }
      return (r.local ? Promise.resolve({}) : lireErreur(r)).then(function (j) {
        if (r.status === 429) {
          etat('Trop d\'essais. Patientez une minute, puis réessayez.', 'erreur');
        } else if (r.status === 503) {
          etat('Le service n\'est pas encore ouvert. Ajoutez la playlist directement sur la télé.', 'erreur');
        } else {
          etat('L\'envoi a été refusé' + (j.message ? ' : ' + j.message : '') + ' (' + r.status + ').', 'erreur');
        }
      });
    }).catch(function (e) {
      // fetch() rejects with a TypeError on a network (or CORS) failure; WebCrypto rejects with a DOMException.
      if (e instanceof TypeError) {
        etat('Pas de connexion avec le serveur. Vérifiez le réseau de ce téléphone, puis réessayez.', 'erreur');
      } else {
        etat('Le chiffrement a échoué sur ce navigateur : rien n\'a été envoyé.', 'erreur');
      }
    }).then(function () {
      envoi = false;
      if (!termine) $('envoyer').disabled = false;
    });
  });
})();
