/*
 * NitaTV — www.nita.tv/connexion#a=<appairage>&t=<jeton>[&k=<clé publique de la télé>] (contract § 1 and § 5 bis:
 * « un seul scan »).
 * Reads the fragment and erases it, gets a nonce from the server (GET /v1/nonce, 5 min, single use), shows
 * "Continue with Google" (Google Identity Services, Web client, that nonce — google.js), then
 * POST /v1/appairage/{a} { jeton, google_id_token, nonce }:
 *   - 200 { suite } and a valid `k` in the QR code → « Connecté », then the page asks every 3 s
 *     POST /v1/appairage/{a}/depot { suite } → 202 (the TV has not attached its deposit yet) · 200 { depot, jeton }
 *     → the playlist steps (playlist.js), encrypted with the `k` OF THE QR CODE (never a key from the server: it could
 *     substitute its own and read the playlist) and the received `depot` as salt · 410, 401 suite, 503 → « Connecté —
 *     retournez à votre télé » ;
 *   - 204 (an older server), no `k`, or no `suite` → « Connecté — retournez à votre télé ».
 * « Plus tard » stops at « Connecté » too: the TV takes the onboarding back at « Type de connexion ».
 * Nothing is stored by this page.
 */
(function () {
  'use strict';

  var P = NitaPage, t = P.t, $ = P.$;
  var API = NitaGoogle.API;
  var DUREE_MAX = 20 * 60 * 1000; // the pairing (and its `suite`) lives 15 min: past 20, stop asking the server
  var ATTENTE = 3000;             // contract § 5 bis: the page asks every 3 s

  // A new QR opened in this same tab only changes the fragment: the browser does not reload the page, so do it.
  // (history.replaceState below does not fire hashchange.)
  window.addEventListener('hashchange', function () { location.reload(); });

  // 1. Read the fragment, then erase it from the address bar and from this history entry.
  var params = new URLSearchParams(location.hash.slice(1));
  var appairage = params.get('a');
  var jeton = params.get('t');
  var k = params.get('k');
  params = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  P.traduire();
  $('oeil').innerHTML = NitaPlaylist.OEIL;

  var debut = Date.now();
  var google_ = null;    // the Google button (google.js), created once the link is known to be complete
  var envoi = false;
  var termine = false;   // the page has reached its end (or the playlist steps took over)
  var email = '';        // the Google account, read from its token for display only (masked like the app)

  // The TV's key, from the QR code only. Optional: without it (an older app) the page stops at « Connecté ».
  // An unusable k is treated like an absent one: the sign-in still goes through.
  var cleTele = null;
  var cleLue = (k && window.crypto && window.crypto.subtle && window.NitaDepot)
    ? NitaDepot.importerCleTele(k).then(function (c) { cleTele = c; }, function () { cleTele = null; })
    : Promise.resolve();
  k = null;

  function arreter() {
    termine = true;
    appairage = jeton = null;
    cleTele = null;
    if (google_) google_.arreter(); // not yet created when the link is incomplete
  }

  function fin(genre, titre, texte) {
    arreter();
    P.fin(genre, titre, texte);
  }

  // The end of the sign-in alone: « Connecté — retournez à votre télé ».
  function connecte(texte) { fin('ok', t('connecte', { email: email }), texte || t('retournez')); }

  function etat(texte, ko) { P.etat('etat-compte', texte, ko); }
  function reessayer(visible) { $('reessayer').hidden = !visible; }

  if (!appairage || !jeton || !P.ID.test(appairage) || !P.ID.test(jeton)) {
    fin('info', t('incompletTitre'), t('incompletConnexion'));
    return;
  }
  P.montrer('compte');

  function erreurPreparation(e) {
    if (termine) return;
    if (e && e.message === 'pas_branche') { fin('info', t('pasOuvertTitre'), t('pasOuvertConnexion')); return; }
    etat(t(e && e.message === 'gis' ? 'gis' : 'injoignable'), true);
    reessayer(true);
  }

  google_ = NitaGoogle.bouton({
    div: $('bouton-google'),
    actif: function () { return !termine && !envoi; },
    avant: function () {
      if (Date.now() - debut > DUREE_MAX) { fin('info', t('expireTitre'), t('expireTexte')); return false; }
      reessayer(false);
    },
    recu: recu,
    erreur: erreurPreparation,
    apparence: function () { return { text: 'continue_with', locale: P.langue }; }
  });
  function preparer() { return google_.preparer(); }

  $('reessayer').addEventListener('click', function () { etat(''); preparer(); });

  // The nonce is spent by any attempt that reached the server: ask for a new one and a new tap.
  function nouvelEssai(texte) {
    envoi = false;
    etat(texte, true);
    preparer();
  }

  // A Google answer (google.js): the ID token, and the nonce it was asked with — spent by this attempt.
  function recu(credential, n) {
    envoi = true;
    email = P.masquer(NitaGoogle.lireJeton(credential).email);
    etat(t('connexionEnCours'));

    fetch(API + '/v1/appairage/' + encodeURIComponent(appairage), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jeton: jeton, google_id_token: credential, nonce: n }),
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (r) {
      if (r.status === 204) { connecte(); return; } // an older server: no `suite`
      if (r.status === 200) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          var suite = j && typeof j.suite === 'string' && P.ID.test(j.suite) ? j.suite : null;
          return cleLue.then(function () {
            if (suite && cleTele) attendre(suite); else connecte();
          });
        });
      }
      if (r.status === 410) { fin('info', t('plusValableTitre'), t('plusValableConnexion')); return; }
      return P.lireErreur(r).then(function (j) {
        var a = { message: j.message, statut: r.status };
        if (r.status === 503) fin('info', t('pasOuvertTitre'), t('pasOuvertConnexion'));
        else if (r.status === 401 && j.erreur === 'nonce_invalide') nouvelEssai(t('nonce'));
        else if (r.status === 429) nouvelEssai(t('tropDEssaisGoogle'));
        else if (r.status === 400 || r.status === 401 || r.status === 403) nouvelEssai(t('nonConfirme', a));
        else nouvelEssai(t('connexionRefusee', a));
      });
    }).catch(function () {
      if (!termine) nouvelEssai(t('reseauConnexion'));
    });
  }

  // 2. Connected: wait until the TV attaches its deposit to this pairing (contract § 5 bis).
  var minuteur = null;
  function attendre(suite) {
    google_.arreter();
    $('attente-compte').textContent = t('connecte', { email: email });
    P.montrer('attente');

    function encore() { if (!termine) minuteur = setTimeout(interroger, ATTENTE); }

    function interroger() {
      minuteur = null;
      if (termine) return;
      if (Date.now() - debut > DUREE_MAX) { connecte(); return; }
      fetch(API + '/v1/appairage/' + encodeURIComponent(appairage) + '/depot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suite: suite }),
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
      }).then(function (r) {
        if (termine) return;
        if (r.status === 202) { encore(); return; }
        if (r.status === 200) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (termine) return;
            // Only the deposit id and its token come from the server; the key stays the QR code's.
            if (!j || typeof j.depot !== 'string' || !P.ID.test(j.depot) || typeof j.jeton !== 'string' || !P.ID.test(j.jeton)) {
              connecte();
              return;
            }
            var cle = cleTele;
            arreter();
            termine = false; // the playlist steps take over (they end the page themselves)
            NitaPlaylist.demarrer({ api: API, cle: cle, depot: j.depot, jeton: j.jeton, plusTard: plusTard });
          });
        }
        if (r.status === 429 || r.status >= 500 && r.status !== 503) { encore(); return; } // a hiccup: ask again
        connecte(); // 410 (expired), 401 suite, 503, anything else: the sign-in itself is done
      }).catch(function () { encore(); }); // network: ask again (bounded by DUREE_MAX)
    }

    interroger();
  }

  // « Plus tard » (while waiting, or on « Type de connexion »): stop at « Connecté »; the TV resumes the onboarding.
  function plusTard() {
    clearTimeout(minuteur);
    Array.prototype.forEach.call(['url', 'guide', 'serveur', 'utilisateur', 'mot_de_passe'], function (id) { $(id).value = ''; });
    connecte(t('retournezPlusTard'));
  }
  $('plus-tard-attente').addEventListener('click', plusTard);

  etat(t('preparation'));
  preparer().then(function () { if (!envoi && !termine && google_.arme()) etat(''); });
})();
