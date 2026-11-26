// Page d'accueil — ÉCRIT par _langues/generer.mjs depuis _langues/accueil.gabarit.js : ne pas modifier ici.
// Deux aides, la page marche sans elles (sans programme : pas de bandeau, la bande défile au doigt ou à la molette) :
// 1. la langue PROPOSÉE, jamais imposée (consigne de Google : aucune redirection) — si la langue de l'appareil
//    (navigator.languages) est une autre langue du site, un bandeau dans CETTE langue la propose, avec une croix ;
//    le choix (lien du bandeau ou du sélecteur) ou le refus (la croix) est retenu dans localStorage, s'il est permis ;
// 2. les flèches de la bande de captures, à l'ordinateur (souris) : elles avancent d'une capture, dans le sens de lecture.
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

  var liens = document.querySelectorAll('.langues a[data-langue]');
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
})();
