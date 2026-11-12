/*
 * NitaTV — www.nita.tv/ajouter#d=<dépôt>&t=<jeton>&k=<clé publique de la télé> (contract § 5): the TV's playlist QR
 * code alone. Reads the fragment and erases it, then straight to « Type de connexion » → the fields → [Envoyer] →
 * « Validé ! » (playlist.js), encrypted with the `k` of this QR code and the `d` of this QR code as salt.
 * Nothing is stored: no storage API, the fragment is dropped at once.
 */
(function () {
  'use strict';

  var P = NitaPage, t = P.t;
  // Only a page served from this machine talks to the local test server; www.nita.tv always uses the real API.
  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var API = LOCAL ? 'http://127.0.0.1:8788' : 'https://api.nita.tv';

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

  P.traduire();
  document.getElementById('oeil').innerHTML = NitaPlaylist.OEIL;

  function lienIncomplet() { P.fin('info', t('incompletTitre'), t('incompletAjouter')); }

  if (!depot || !jeton || !k || !P.ID.test(depot) || !P.ID.test(jeton)) { lienIncomplet(); return; }
  if (!window.crypto || !window.crypto.subtle || !window.NitaDepot) {
    P.fin('info', t('ancienTitre'), t('ancienTexte'));
    return;
  }

  NitaDepot.importerCleTele(k).then(function (cle) {
    NitaPlaylist.demarrer({ api: API, cle: cle, depot: depot, jeton: jeton, plusTard: null });
    depot = jeton = k = null;
  }, lienIncomplet);
})();
