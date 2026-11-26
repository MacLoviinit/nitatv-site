// Page d'accueil — ÉCRIT par _langues/generer.mjs depuis _langues/accueil.gabarit.js : ne pas modifier ici.
// Deux aides, la page marche sans elles (sans programme : pas de bandeau, la bande défile au doigt ou à la molette) :
// 1. la langue PROPOSÉE, jamais imposée (consigne de Google : aucune redirection) — si la langue de l'appareil
//    (navigator.languages) est une autre langue du site, un bandeau dans CETTE langue la propose, avec une croix ;
//    le choix (lien du bandeau ou du sélecteur) ou le refus (la croix) est retenu dans localStorage, s'il est permis ;
// 2. les flèches de la bande de captures, à l'ordinateur (souris) : elles avancent d'une capture, dans le sens de lecture ;
// 3. le menu des langues (un <details>, qui s'ouvre et se ferme sans programme) : Échap, le clic dehors et la sortie
//    au clavier le referment ; Échap rend le focus à son bouton ;
// 4. la capture agrandie au clic (un <dialog>) : flèches, touches ← →, glissé au doigt, ✕, Échap ; le focus revient à
//    la capture montrée en dernier. Sans programme, le lien ouvre la grande image.
(function () {
  'use strict';
  var LANGUES = {
  "fr": {
    "chemin": "",
    "lang": "fr",
    "dir": "ltr",
    "bandeau": "Voir cette page en français →",
    "fermer": "Fermer"
  },
  "en": {
    "chemin": "en/",
    "lang": "en",
    "dir": "ltr",
    "bandeau": "View this page in English →",
    "fermer": "Close"
  },
  "de": {
    "chemin": "de/",
    "lang": "de",
    "dir": "ltr",
    "bandeau": "Diese Seite auf Deutsch ansehen →",
    "fermer": "Schließen"
  },
  "nl": {
    "chemin": "nl/",
    "lang": "nl",
    "dir": "ltr",
    "bandeau": "Deze pagina in het Nederlands bekijken →",
    "fermer": "Sluiten"
  },
  "es": {
    "chemin": "es/",
    "lang": "es-ES",
    "dir": "ltr",
    "bandeau": "Ver esta página en español (España) →",
    "fermer": "Cerrar"
  },
  "es-419": {
    "chemin": "es-419/",
    "lang": "es-419",
    "dir": "ltr",
    "bandeau": "Ver esta página en español (Latinoamérica) →",
    "fermer": "Cerrar"
  },
  "it": {
    "chemin": "it/",
    "lang": "it",
    "dir": "ltr",
    "bandeau": "Vedi questa pagina in italiano →",
    "fermer": "Chiudi"
  },
  "pt": {
    "chemin": "pt/",
    "lang": "pt-BR",
    "dir": "ltr",
    "bandeau": "Ver esta página em português (Brasil) →",
    "fermer": "Fechar"
  },
  "pt-pt": {
    "chemin": "pt-pt/",
    "lang": "pt-PT",
    "dir": "ltr",
    "bandeau": "Ver esta página em português (Portugal) →",
    "fermer": "Fechar"
  },
  "pl": {
    "chemin": "pl/",
    "lang": "pl",
    "dir": "ltr",
    "bandeau": "Zobacz tę stronę po polsku →",
    "fermer": "Zamknij"
  },
  "ru": {
    "chemin": "ru/",
    "lang": "ru",
    "dir": "ltr",
    "bandeau": "Открыть эту страницу на русском →",
    "fermer": "Закрыть"
  },
  "tr": {
    "chemin": "tr/",
    "lang": "tr",
    "dir": "ltr",
    "bandeau": "Bu sayfayı Türkçe görüntüle →",
    "fermer": "Kapat"
  },
  "ar": {
    "chemin": "ar/",
    "lang": "ar",
    "dir": "rtl",
    "bandeau": "عرض هذه الصفحة بالعربية ←",
    "fermer": "إغلاق"
  },
  "zh-hans": {
    "chemin": "zh-hans/",
    "lang": "zh-Hans",
    "dir": "ltr",
    "bandeau": "以简体中文查看此页 →",
    "fermer": "关闭"
  },
  "zh-hant": {
    "chemin": "zh-hant/",
    "lang": "zh-Hant",
    "dir": "ltr",
    "bandeau": "以繁體中文檢視此頁 →",
    "fermer": "關閉"
  },
  "ja": {
    "chemin": "ja/",
    "lang": "ja",
    "dir": "ltr",
    "bandeau": "このページを日本語で表示 →",
    "fermer": "閉じる"
  },
  "ko": {
    "chemin": "ko/",
    "lang": "ko",
    "dir": "ltr",
    "bandeau": "이 페이지를 한국어로 보기 →",
    "fermer": "닫기"
  },
  "hi": {
    "chemin": "hi/",
    "lang": "hi",
    "dir": "ltr",
    "bandeau": "यह पेज हिन्दी में देखें →",
    "fermer": "बंद करें"
  },
  "id": {
    "chemin": "id/",
    "lang": "id",
    "dir": "ltr",
    "bandeau": "Lihat halaman ini dalam Bahasa Indonesia →",
    "fermer": "Tutup"
  },
  "vi": {
    "chemin": "vi/",
    "lang": "vi",
    "dir": "ltr",
    "bandeau": "Xem trang này bằng tiếng Việt →",
    "fermer": "Đóng"
  },
  "th": {
    "chemin": "th/",
    "lang": "th",
    "dir": "ltr",
    "bandeau": "ดูหน้านี้เป็นภาษาไทย →",
    "fermer": "ปิด"
  }
};
  var CLE = 'nitatv.langue';
  var AMERIQUES = ['419', 'mx', 'ar', 'co', 'cl', 'pe', 've', 'ec', 'gt', 'cu', 'bo', 'do', 'hn', 'py', 'sv', 'ni', 'cr',
    'pa', 'uy', 'pr', 'us'];
  var script = document.currentScript;
  var racine = script ? new URL('.', script.src).href : '/';
  var page = document.documentElement.getAttribute('data-langue');

  function lire() { try { return window.localStorage.getItem(CLE); } catch (e) { return null; } }
  function retenir(code) { try { window.localStorage.setItem(CLE, code); } catch (e) { /* page sans stockage : rien */ } }

  // Une étiquette de langue du navigateur (« de-CH », « zh-TW », « es-MX »...) → la page du site, ou null.
  function correspondance(etiquette) {
    var t = String(etiquette || '').toLowerCase().replace(/_/g, '-').replace(/;.*$/, '');
    var p = t.split('-');
    if (p[0] === 'zh') return /-(hant|tw|hk|mo)(-|$)/.test(t) ? 'zh-hant' : 'zh-hans';
    if (p[0] === 'es') return p[1] && AMERIQUES.indexOf(p[1]) >= 0 ? 'es-419' : 'es';
    if (p[0] === 'pt') return p[1] === 'pt' ? 'pt-pt' : 'pt';
    return Object.prototype.hasOwnProperty.call(LANGUES, p[0]) ? p[0] : null;
  }

  function langueVoulue() {
    var retenue = lire();
    if (retenue && Object.prototype.hasOwnProperty.call(LANGUES, retenue)) return retenue;
    var liste = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language];
    for (var i = 0; i < liste.length; i++) {
      var c = correspondance(liste[i]);
      if (c) return c;
    }
    return null;
  }

  var liens = document.querySelectorAll('.langues a[data-langue], .menu-langue a[data-langue]');
  for (var i = 0; i < liens.length; i++) {
    liens[i].addEventListener('click', function () { retenir(this.getAttribute('data-langue')); });
  }

  var cible = page ? langueVoulue() : null;
  if (cible && cible !== page) {
    var l = LANGUES[cible];
    var bandeau = document.createElement('div');
    bandeau.className = 'bandeau';
    bandeau.setAttribute('lang', l.lang);
    bandeau.setAttribute('dir', l.dir);
    var lien = document.createElement('a');
    lien.href = racine + l.chemin;
    lien.hreflang = l.lang;
    lien.textContent = l.bandeau;
    lien.addEventListener('click', function () { retenir(cible); });
    var croix = document.createElement('button');
    croix.type = 'button';
    croix.setAttribute('aria-label', l.fermer);
    croix.title = l.fermer;
    croix.textContent = '×';
    croix.addEventListener('click', function () { retenir(page); bandeau.remove(); });
    bandeau.appendChild(lien);
    bandeau.appendChild(croix);
    document.body.insertBefore(bandeau, document.body.firstChild);
  }

  var menu = document.querySelector('.menu-langue');
  if (menu) {
    var bouton = menu.querySelector('summary');
    menu.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) { e.preventDefault(); menu.open = false; bouton.focus(); }
    });
    document.addEventListener('click', function (e) { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    menu.addEventListener('focusout', function (e) {
      if (menu.open && e.relatedTarget && !menu.contains(e.relatedTarget)) menu.open = false;
    });
  }

  agrandir();

  var bande = document.querySelector('.bande');
  if (!bande) return;
  var defile = bande.querySelector('.defile');
  var prec = bande.querySelector('.prec');
  var suiv = bande.querySelector('.suiv');
  var rtl = window.getComputedStyle(defile).direction === 'rtl';
  var doux = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function pas() {
    var li = defile.querySelector('li');
    var ecart = parseFloat(window.getComputedStyle(defile).columnGap) || 0;
    return li ? li.getBoundingClientRect().width + ecart : defile.clientWidth;
  }
  function aller(sens) {
    defile.scrollBy({ left: sens * pas() * (rtl ? -1 : 1), behavior: doux ? 'smooth' : 'auto' });
  }
  function bornes() {
    // En RTL, scrollLeft va de 0 à -max (Chrome, Firefox, Safari récents) : on compare la distance au début.
    var x = Math.abs(defile.scrollLeft);
    var max = defile.scrollWidth - defile.clientWidth;
    prec.disabled = x <= 1;
    suiv.disabled = x >= max - 1;
  }
  prec.addEventListener('click', function () { aller(-1); });
  suiv.addEventListener('click', function () { aller(1); });
  defile.addEventListener('scroll', bornes, { passive: true });
  window.addEventListener('resize', bornes);
  prec.hidden = false;
  suiv.hidden = false;
  bornes();

  function agrandir() {
    var fenetre = document.querySelector('dialog.grand');
    var captures = document.querySelectorAll('.defile a');
    if (!fenetre || typeof fenetre.showModal !== 'function' || !captures.length) return;
    var droiteAGauche = document.documentElement.dir === 'rtl';
    var image = fenetre.querySelector('img');
    var legende = fenetre.querySelector('figcaption');
    var courante = 0;
    function montrer(i) {
      courante = (i + captures.length) % captures.length;
      var a = captures[courante];
      image.src = a.href;
      image.alt = a.querySelector('img').alt;
      legende.textContent = a.parentNode.querySelector('figcaption').textContent;
    }
    for (var k = 0; k < captures.length; k++) {
      (function (i) {
        captures[i].addEventListener('click', function (e) {
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // nouvel onglet : laissé au navigateur
          e.preventDefault();
          montrer(i);
          fenetre.showModal();
        });
      })(k);
    }
    fenetre.querySelector('.prec').addEventListener('click', function () { montrer(courante - 1); });
    fenetre.querySelector('.suiv').addEventListener('click', function () { montrer(courante + 1); });
    fenetre.querySelector('.fermer').addEventListener('click', function () { fenetre.close(); });
    // Échap ferme le <dialog> de lui-même ; à la fermeture, le focus revient à la capture montrée (la bande s'y cale).
    fenetre.addEventListener('close', function () { captures[courante].focus(); });
    fenetre.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      var avant = (e.key === 'ArrowRight') !== droiteAGauche;
      montrer(courante + (avant ? 1 : -1));
    });
    // Un clic sur le fond (hors de l'image et des boutons) ferme.
    fenetre.addEventListener('click', function (e) { if (e.target === fenetre || e.target.tagName === 'FIGURE') fenetre.close(); });
    // Glisser : vers la gauche = la suivante (vers la droite en arabe).
    var depart = null;
    image.addEventListener('pointerdown', function (e) {
      depart = { x: e.clientX, y: e.clientY };
      try { image.setPointerCapture(e.pointerId); } catch (err) { /* sans capture : le glissé doit finir sur l'image */ }
    });
    image.addEventListener('pointerup', function (e) {
      if (!depart) return;
      var dx = e.clientX - depart.x, dy = e.clientY - depart.y;
      depart = null;
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
      montrer(courante + ((dx < 0) !== droiteAGauche ? 1 : -1));
    });
    image.addEventListener('pointercancel', function () { depart = null; });
  }
})();
