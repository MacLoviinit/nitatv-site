/*
 * NitaTV — shared by connexion.js and supprimer.js (contract § 1, § 3 bis): the server's nonce and the
 * "Sign in with Google" button (Google Identity Services, Web client).
 * A nonce serves ONCE, even a failed attempt spends it: the button is always armed with a fresh nonce from
 * GET /v1/nonce, renewed 45 s before it expires; after an attempt, the page calls preparer() again, which asks the
 * server for a new nonce BEFORE Google is shown again. Nothing is stored by this file.
 */
var NitaGoogle = (function () {
  'use strict';

  var CLIENT_WEB = '720100975511-ovrrf97ocsdactpc61b2peg26vgqt6nt.apps.googleusercontent.com';
  var GIS = 'https://accounts.google.com/gsi/client';
  // Only a page served from this machine talks to the local test server; www.nita.tv always uses the real API.
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API = LOCAL ? 'http://127.0.0.1:8788' : 'https://api.nita.tv';

  var gis = null; // Promise of the loaded Google library

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

  // The claims of a Google ID token, READ for display only (the email to confirm). Never trusted: the server
  // verifies the signature. Google's own example (decodeJwtResponse) does the same.
  function lireJeton(jwt) {
    try {
      var b = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      var octets = atob(b + '==='.slice((b.length + 3) % 4));
      return JSON.parse(decodeURIComponent(octets.split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join('')));
    } catch (e) { return {}; }
  }

  /*
   * One Google button kept armed with a fresh nonce.
   * o.div        the element where Google draws its button
   * o.actif()    false once the page no longer wants a Google answer (sending, finished, confirming…)
   * o.avant()    optional; return false to stop before asking the server (e.g. the QR code has expired)
   * o.recu(credential, nonce)   a Google answer: the ID token and the nonce it was asked with (now spent)
   * o.erreur(e)  preparation failed: e.message is 'pas_branche', 'gis', or a network/HTTP failure
   * o.apparence() the GsiButtonConfiguration overrides (text, locale), read at every drawing
   */
  function bouton(o) {
    var nonce = null;
    var minuteur = null;
    var perime = false;

    function dessiner() {
      var div = o.div;
      div.textContent = '';
      div.hidden = false;
      var a = o.apparence ? o.apparence() : {};
      google.accounts.id.renderButton(div, {
        type: 'standard', theme: 'filled_blue', size: 'large', text: a.text || 'continue_with', shape: 'pill',
        logo_alignment: 'left', locale: a.locale || 'fr',
        width: Math.max(200, Math.min(320, div.clientWidth || 320))
      });
    }

    // A new nonce: re-initialise Google Identity Services with it (initialize() replaces the configuration)
    // and draw the button again. Renewed 45 s before it expires, at most every 4 min.
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
      dessiner();
    }

    // Google Identity Services callback: response.credential is the ID token (JWT).
    function recu(reponse) {
      if (!o.actif() || !reponse || !reponse.credential || !nonce) return;
      var n = nonce;
      nonce = null;
      clearTimeout(minuteur);
      o.div.hidden = true;
      o.recu(reponse.credential, n);
    }

    function preparer() {
      if (!o.actif()) return Promise.resolve();
      if (o.avant && o.avant() === false) return Promise.resolve();
      return Promise.all([chargerGis(), demanderNonce()]).then(function (r) {
        if (o.actif()) armer(r[1]);
      }).catch(function (e) {
        if (!o.actif()) return;
        o.div.hidden = true;
        o.erreur(e);
      });
    }

    function renouveler() {
      if (!o.actif()) return;
      if (document.hidden) { perime = true; return; } // renewed when the page is shown again
      preparer();
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && perime) preparer();
    });

    return {
      preparer: preparer,
      arme: function () { return nonce !== null; },
      // Draw the button again (another language) without spending its nonce.
      redessiner: function () { if (nonce !== null && !o.div.hidden && window.google) dessiner(); },
      arreter: function () { clearTimeout(minuteur); nonce = null; }
    };
  }

  return { API: API, LOCAL: LOCAL, CLIENT_WEB: CLIENT_WEB, bouton: bouton, lireJeton: lireJeton };
})();
