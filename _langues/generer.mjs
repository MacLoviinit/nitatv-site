// Le générateur des pages d'accueil du site, une par langue de l'app (DEC-704 du projet NitaTV).
//
// MODE D'EMPLOI
//   node _langues/generer.mjs            écrit les 21 pages, accueil.js, sitemap.xml et robots.txt
//   node _langues/generer.mjs --verifie  n'écrit RIEN : rend 1 si un fichier écrit diffère de ce que les sources donnent
//
// LES SOURCES (le seul endroit où l'on modifie)
//   _langues/gabarit.html         la page, avec ses {{trous}}
//   _langues/accueil.gabarit.js   le programme de la page (bandeau de langue, flèches de la bande) ; __LANGUES__ = la table
//   _langues/textes/<code>.json   les textes d'une langue (`prix` suit la 4e réponse de la FAQ). Le français et l'anglais sont ceux approuvés par Antony ;
//                                 l'avertissement, les 11 fonctions, l'abonnement, vos données et le crédit de Sintel sont
//                                 recopiés MOT POUR MOT de la fiche Play (dépôt KaizokuTV, Docs/store/fiche_play*.md).
//   LANGUES ci-dessous            l'ordre, l'adresse, le code hreflang, l'attribut lang, le sens d'écriture, le nom
//
// LES ADRESSES : « / » est le français (comme avant), les autres langues sont des dossiers (« /de/ »...). Les codes
// hreflang suivent Google (ISO 639-1 + région ISO 3166-1 ; « es-419 » n'y est PAS pris en charge) : l'espagnol d'Espagne
// est « es-ES », celui d'Amérique latine le générique « es » ; le portugais du Brésil « pt », celui du Portugal « pt-PT » ;
// les chinois par l'écriture, « zh-Hans » / « zh-Hant ». x-default = /en/.
//
// Régénérer ne change rien (aucune date, aucun hasard) : `--verifie` le contrôle, et `_banc/controle_langues.mjs` aussi.
// Les captures se refont à part : `python3 _langues/images.py <dossier des captures de démo>` (bande + grandes) ;
// les drapeaux : `node _langues/drapeaux.mjs <dossier de flag-icons>` (licence MIT, images/drapeaux/LICENCE-flag-icons.txt).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(ICI, '..');
const DOMAINE = 'https://www.nita.tv/';

// [code (= fichier de textes), dossier, hreflang, lang, dir, nom dans sa langue, drapeau (images/drapeaux/<pays>.svg)]
export const LANGUES = [
  ['fr', '', 'fr', 'fr', 'ltr', 'Français', 'fr'],
  ['en', 'en', 'en', 'en', 'ltr', 'English', 'gb'],
  ['de', 'de', 'de', 'de', 'ltr', 'Deutsch', 'de'],
  ['nl', 'nl', 'nl', 'nl', 'ltr', 'Nederlands', 'nl'],
  ['es', 'es', 'es-ES', 'es-ES', 'ltr', 'Español (España)', 'es'],
  ['es-419', 'es-419', 'es', 'es-419', 'ltr', 'Español (Latinoamérica)', 'mx'],
  ['it', 'it', 'it', 'it', 'ltr', 'Italiano', 'it'],
  ['pt', 'pt', 'pt', 'pt-BR', 'ltr', 'Português (Brasil)', 'br'],
  ['pt-pt', 'pt-pt', 'pt-PT', 'pt-PT', 'ltr', 'Português (Portugal)', 'pt'],
  ['pl', 'pl', 'pl', 'pl', 'ltr', 'Polski', 'pl'],
  ['ru', 'ru', 'ru', 'ru', 'ltr', 'Русский', 'ru'],
  ['tr', 'tr', 'tr', 'tr', 'ltr', 'Türkçe', 'tr'],
  ['ar', 'ar', 'ar', 'ar', 'rtl', 'العربية', 'sa'],
  ['zh-hans', 'zh-hans', 'zh-Hans', 'zh-Hans', 'ltr', '中文（简体）', 'cn'],
  ['zh-hant', 'zh-hant', 'zh-Hant', 'zh-Hant', 'ltr', '中文（繁體）', 'tw'],
  ['ja', 'ja', 'ja', 'ja', 'ltr', '日本語', 'jp'],
  ['ko', 'ko', 'ko', 'ko', 'ltr', '한국어', 'kr'],
  ['hi', 'hi', 'hi', 'hi', 'ltr', 'हिन्दी', 'in'],
  ['id', 'id', 'id', 'id', 'ltr', 'Bahasa Indonesia', 'id'],
  ['vi', 'vi', 'vi', 'vi', 'ltr', 'Tiếng Việt', 'vn'],
  ['th', 'th', 'th', 'th', 'ltr', 'ไทย', 'th'],
].map(([code, dossier, hreflang, lang, dir, nom, drapeau]) => ({ code, dossier, hreflang, lang, dir, nom, drapeau }));
export const X_DEFAULT = 'en';

// Les captures, dans l'ordre de la bande ; les trois premières (visibles à l'arrivée) ne sont pas différées.
const CAPTURES = ['direct', 'guide', 'films', 'film', 'pistes', 'enregistrement', 'telephone'];
const VISIBLES = 3;

const url = (l) => DOMAINE + (l.dossier ? l.dossier + '/' : '');
const texte = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (s) => texte(s).replace(/"/g, '&quot;');

function lireTextes(code) {
  return JSON.parse(fs.readFileSync(path.join(ICI, 'textes', code + '.json'), 'utf8'));
}

function hreflang() {
  const lignes = LANGUES.map((l) => `<link rel="alternate" hreflang="${l.hreflang}" href="${url(l)}">`);
  const def = LANGUES.find((l) => l.code === X_DEFAULT);
  lignes.push(`<link rel="alternate" hreflang="x-default" href="${url(def)}">`);
  return lignes.join('\n');
}

function page(l) {
  const t = lireTextes(l.code);
  const racine = l.dossier ? '../' : '';
  const captures = CAPTURES.map((nom, i) => {
    const c = t.captures[nom];
    const differe = i >= VISIBLES ? ' loading="lazy"' : '';
    return `      <li><figure><a href="${racine}images/grand/${nom}.jpg"><img src="${racine}images/${nom}.jpg" width="960" height="540" alt="${attr(c.alt)}"${differe} decoding="async"></a>` +
      `<figcaption>${texte(c.legende)}</figcaption></figure></li>`;
  }).join('\n');
  const fonctions = t.fonctions.map((f) => `    <li>${texte(f)}</li>`).join('\n');
  // La 4e réponse (le prix) : le texte de la fiche Play, puis la phrase du prix (`prix`, Antony 2026-11-26).
  const reponse = (e, i) => (i === 3 ? e.r + (e.r.endsWith('。') ? '' : ' ') + t.prix : e.r);
  const faq = t.faq.map((e, i) => `  <h3>${texte(e.q)}</h3>\n  <p>${texte(reponse(e, i))}</p>`).join('\n');
  // Le menu des langues (en haut) : drapeau + nom dans sa langue ; la page courante n'est pas un lien.
  const menu = LANGUES.map((a) => {
    const img = `<img src="${racine}images/drapeaux/${a.drapeau}.svg" width="20" height="15" alt="" loading="lazy">`;
    if (a.code === l.code) return `      <li><span lang="${a.lang}" aria-current="page">${img}${texte(a.nom)}</span></li>`;
    const vers = racine + (a.dossier ? a.dossier + '/' : '');
    return `      <li><a href="${vers || './'}" hreflang="${a.hreflang}" lang="${a.lang}" data-langue="${a.code}">${img}${texte(a.nom)}</a></li>`;
  }).join('\n');
  const valeurs = {
    lang: l.lang, dir: l.dir, code: l.code, url: url(l), racine, hreflang: hreflang(),
    titre: texte(t.titre), description: attr(t.description), og_description: attr(t.og_description),
    sous_titre: texte(t.sous_titre), intro: t.intro /* fragment HTML écrit à la main (<strong>) */, bouton: texte(t.bouton),
    essai: texte(t.essai), bande_nom: attr(t.bande.nom), bande_precedente: attr(t.bande.precedente),
    bande_suivante: attr(t.bande.suivante), captures, note_demo: texte(t.note_demo), credit: texte(t.credit),
    avertissement: texte(t.avertissement), fonctions_titre: texte(t.fonctions_titre), fonctions,
    faq_titre: texte(t.faq_titre), faq, langues: attr(t.langues), menu, drapeau: l.drapeau,
    nom_langue: texte(l.nom), fermer: attr(t.fermer), grand_precedente: attr(t.grand.precedente),
    grand_suivante: attr(t.grand.suivante),
    pied_confidentialite: texte(t.pied.confidentialite), pied_conditions: texte(t.pied.conditions),
    pied_supprimer: texte(t.pied.supprimer), pied_abonnement: texte(t.pied.abonnement),
  };
  // Le titre « og:title » reprend le <title> : même trou, attribut ou texte, la valeur ne contient ni « " » ni « < ».
  let html = fs.readFileSync(path.join(ICI, 'gabarit.html'), 'utf8');
  html = html.replace(/\{\{(\w+)\}\}/g, (m, cle) => {
    if (!(cle in valeurs)) throw new Error(`gabarit : trou inconnu {{${cle}}}`);
    return valeurs[cle];
  });
  return html;
}

function programme() {
  const table = {};
  for (const l of LANGUES) {
    const t = lireTextes(l.code);
    table[l.code] = { chemin: l.dossier ? l.dossier + '/' : '', lang: l.lang, dir: l.dir, bandeau: t.bandeau, fermer: t.fermer };
  }
  const js = fs.readFileSync(path.join(ICI, 'accueil.gabarit.js'), 'utf8');
  if (!js.includes('__LANGUES__')) throw new Error('accueil.gabarit.js : __LANGUES__ absent');
  return js.replace('__LANGUES__', JSON.stringify(table, null, 2));
}

function sitemap() {
  const alternatives = LANGUES.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.hreflang}" href="${url(l)}"/>`);
  const def = LANGUES.find((l) => l.code === X_DEFAULT);
  alternatives.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${url(def)}"/>`);
  const urls = LANGUES.map((l) => `  <url>\n    <loc>${url(l)}</loc>\n${alternatives.join('\n')}\n  </url>`);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
    urls.join('\n') + '\n</urlset>\n';
}

const robots = () => `User-agent: *\nAllow: /\n\nSitemap: ${DOMAINE}sitemap.xml\n`;

export function fichiers() {
  const f = new Map();
  for (const l of LANGUES) f.set(path.join(l.dossier, 'index.html'), page(l));
  f.set('accueil.js', programme());
  f.set('sitemap.xml', sitemap());
  f.set('robots.txt', robots());
  return f;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const verifie = process.argv.includes('--verifie');
  let ecarts = 0;
  for (const [rel, contenu] of fichiers()) {
    const cible = path.join(SITE, rel);
    const avant = fs.existsSync(cible) ? fs.readFileSync(cible, 'utf8') : null;
    if (verifie) {
      if (avant !== contenu) { ecarts++; console.log('DIFFÉRENT ' + rel); }
      continue;
    }
    if (avant === contenu) { console.log('inchangé  ' + rel); continue; }
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, contenu);
    console.log((avant === null ? 'créé      ' : 'réécrit   ') + rel);
  }
  if (verifie) {
    console.log(ecarts ? `${ecarts} fichier(s) ne correspondent pas aux sources` : 'conforme : les fichiers écrits sont ceux que les sources donnent');
    process.exit(ecarts ? 1 : 0);
  }
}
