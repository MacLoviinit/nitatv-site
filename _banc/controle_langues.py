"""Contrôle des pages d'accueil en 21 langues (DEC-704 du projet NitaTV) — banc, non publié.

Usage : python3 _banc/controle_langues.py [racine du site] [--fiches <dossier Docs/store du dépôt KaizokuTV>]

Ce qu'il contrôle, chaque page (attendu ÉCRIT ICI, indépendamment du générateur) :
- le fichier existe ; `lang` juste ; `dir="rtl"` pour l'arabe et lui seul ;
- 22 `hreflang` (les 21 + x-default = /en/), chacun à sa bonne adresse, la page elle-même comprise, et RÉCIPROQUES ;
- un seul `canonical`, sur elle-même ; `og:url` = canonical ;
- un `<title>` et une description non vides, avec « IPTV », écrits dans l'écriture de la langue, et distincts d'une
  langue à l'autre (pas une copie de l'anglais) ; aucun « Xtream » ;
- chaque image : un `alt` non vide, `width`/`height`, son fichier présent ; les 3 premières chargées tout de suite,
  les suivantes `loading="lazy"` ;
- aucun lien local cassé (`href`/`src` relatifs) ;
le `sitemap.xml` : un XML valide, les 21 adresses, chacune avec ses 22 `xhtml:link` ; `robots.txt` : tout permis et
la ligne `Sitemap:` ; et `node _langues/generer.mjs --verifie` : les fichiers écrits sont ceux que les sources donnent.
Avec `--fiches` : le mot pour mot de la fiche Play (avertissement, 11 fonctions, abonnement, données, crédit) se
retrouve tel quel dans le texte de chaque page.
Rend 0 si tout est conforme, 1 sinon ; affiche le nombre de contrôles.
"""
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

DOMAINE = 'https://www.nita.tv/'
# dossier, hreflang, lang, écriture attendue (None = latin, vérifié par la seule différence entre langues)
ATTENDU = [
    ('', 'fr', 'fr', None), ('en', 'en', 'en', None), ('de', 'de', 'de', None), ('nl', 'nl', 'nl', None),
    ('es', 'es-ES', 'es-ES', None), ('es-419', 'es', 'es-419', None), ('it', 'it', 'it', None),
    ('pt', 'pt', 'pt-BR', None), ('pt-pt', 'pt-PT', 'pt-PT', None), ('pl', 'pl', 'pl', None),
    ('ru', 'ru', 'ru', r'[Ѐ-ӿ]'), ('tr', 'tr', 'tr', None), ('ar', 'ar', 'ar', r'[؀-ۿ]'),
    ('zh-hans', 'zh-Hans', 'zh-Hans', r'[一-鿿]'), ('zh-hant', 'zh-Hant', 'zh-Hant', r'[一-鿿]'),
    ('ja', 'ja', 'ja', r'[぀-ヿ]'), ('ko', 'ko', 'ko', r'[가-힯]'), ('hi', 'hi', 'hi', r'[ऀ-ॿ]'),
    ('id', 'id', 'id', None), ('vi', 'vi', 'vi', r'[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹđ]'),
    ('th', 'th', 'th', r'[฀-๿]'),
]
X_DEFAULT = DOMAINE + 'en/'
# Pour --fiches : le code de chaque page dans la fiche Play (« ## Nom (code) »).
FICHE = {'': 'fr-FR', 'en': 'en-US', 'de': 'de-DE', 'nl': 'nl-NL', 'es': 'es-ES', 'es-419': 'es-419', 'it': 'it-IT',
         'pt': 'pt-BR', 'pt-pt': 'pt-PT', 'pl': 'pl-PL', 'ru': 'ru-RU', 'tr': 'tr-TR', 'ar': 'ar', 'zh-hans': 'zh-CN',
         'zh-hant': 'zh-TW', 'ja': 'ja-JP', 'ko': 'ko-KR', 'hi': 'hi-IN', 'id': 'id', 'vi': 'vi', 'th': 'th'}

controles = 0
echecs = 0


def verifie(ok, quoi):
    global controles, echecs
    controles += 1
    if not ok:
        echecs += 1
        print('ECHEC ' + quoi)
    return ok


def url_de(dossier):
    return DOMAINE + (dossier + '/' if dossier else '')


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.html = {}
        self.liens = []      # <link>
        self.metas = []
        self.titre = ''
        self.dans_titre = False
        self.images = []
        self.refs = []       # href/src locaux
        self.texte = []
        self.ignore = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html':
            self.html = a
        elif tag == 'link':
            self.liens.append(a)
        elif tag == 'meta':
            self.metas.append(a)
        elif tag == 'title':
            self.dans_titre = True
        elif tag == 'img':
            self.images.append(a)
        if tag in ('style', 'script'):
            self.ignore += 1
        for cle in ('href', 'src'):
            if cle in a and tag != 'link':
                self.refs.append(a[cle])

    def handle_endtag(self, tag):
        if tag == 'title':
            self.dans_titre = False
        if tag in ('style', 'script'):
            self.ignore -= 1

    def handle_data(self, data):
        if self.dans_titre:
            self.titre += data
        elif not self.ignore:
            self.texte.append(data)


def lire_page(racine, dossier):
    p = Page()
    p.feed((racine / dossier / 'index.html').read_text(encoding='utf-8'))
    return p


def ref_locale_existe(racine, dossier, ref):
    if re.match(r'^[a-z]+:', ref) or ref.startswith('#') or ref.startswith('//'):
        return True
    chemin = (racine / dossier / ref.split('#')[0].split('?')[0]).resolve()
    if ref.endswith('/') or chemin.is_dir():
        chemin = chemin / 'index.html'
    return chemin.is_file()


def fiches_play(dossier_store):
    """{code: {'paras': [...]}} lu dans fiche_play.md et fiche_play_langues.md."""
    out = {}
    for nom in ('fiche_play.md', 'fiche_play_langues.md'):
        t = (Path(dossier_store) / nom).read_text(encoding='utf-8')
        for sec in re.split(r'\n## ', t)[1:]:
            tete = sec.split('\n', 1)[0]
            code = re.search(r'\(([^()]+)\)\s*$', tete).group(1)
            blocs = re.findall(r'```\n(.*?)\n```', sec, re.S)
            if len(blocs) >= 3:
                out[code] = blocs[2].split('\n\n')
    return out


def main():
    args = sys.argv[1:]
    fiches = None
    if '--fiches' in args:
        i = args.index('--fiches')
        fiches = fiches_play(args[i + 1])
        del args[i:i + 2]
    racine = Path(args[0] if args else Path(__file__).resolve().parent.parent).resolve()
    attendus = {url_de(d): (d, h, l, e) for d, h, l, e in ATTENDU}
    hreflang_attendu = {h: url_de(d) for d, h, l, e in ATTENDU}
    hreflang_attendu['x-default'] = X_DEFAULT
    verifie(len(ATTENDU) == 21 and len(hreflang_attendu) == 22, 'la table attendue compte 21 langues + x-default')

    pages = {}
    for d, h, l, ecriture in ATTENDU:
        nom = d or '(racine)'
        if not verifie((racine / d / 'index.html').is_file(), f'{nom} : index.html existe'):
            continue
        pages[d] = p = lire_page(racine, d)
        verifie(p.html.get('lang') == l, f'{nom} : lang="{l}" (lu : {p.html.get("lang")!r})')
        verifie(p.html.get('dir') == ('rtl' if d == 'ar' else 'ltr'), f'{nom} : dir (lu : {p.html.get("dir")!r})')
        alts = [x for x in p.liens if x.get('rel') == 'alternate' and 'hreflang' in x]
        lus = {}
        for x in alts:
            lus.setdefault(x['hreflang'], []).append(x.get('href'))
        verifie(len(alts) == 22, f'{nom} : 22 hreflang (lus : {len(alts)})')
        for code, href in hreflang_attendu.items():
            verifie(lus.get(code) == [href], f'{nom} : hreflang="{code}" → {href} (lu : {lus.get(code)})')
        verifie(set(lus) == set(hreflang_attendu), f'{nom} : aucun hreflang inattendu ({sorted(set(lus) - set(hreflang_attendu))})')
        verifie(lus.get(h) == [url_de(d)], f'{nom} : se cite elle-même')
        canon = [x.get('href') for x in p.liens if x.get('rel') == 'canonical']
        verifie(canon == [url_de(d)], f'{nom} : canonical unique sur elle-même (lu : {canon})')
        ogurl = [m.get('content') for m in p.metas if m.get('property') == 'og:url']
        verifie(ogurl == [url_de(d)], f'{nom} : og:url = canonical (lu : {ogurl})')
        desc = [m.get('content', '') for m in p.metas if m.get('name') == 'description']
        verifie(len(desc) == 1 and desc[0].strip(), f'{nom} : une description non vide')
        verifie(p.titre.strip() != '', f'{nom} : <title> non vide')
        verifie('IPTV' in p.titre, f'{nom} : « IPTV » dans le <title>')
        verifie(bool(desc) and 'IPTV' in desc[0], f'{nom} : « IPTV » dans la description')
        if ecriture:
            verifie(re.search(ecriture, p.titre) is not None, f'{nom} : <title> dans l\'écriture de la langue')
            verifie(bool(desc) and re.search(ecriture, desc[0]) is not None, f'{nom} : description dans l\'écriture de la langue')
        tout = (racine / d / 'index.html').read_text(encoding='utf-8')
        verifie('xtream' not in tout.lower(), f'{nom} : aucun « Xtream »')
        verifie(len(p.images) == 7, f'{nom} : 7 captures (lues : {len(p.images)})')
        for i, img in enumerate(p.images):
            src = img.get('src', '')
            verifie(img.get('alt', '').strip() != '', f'{nom} : alt non vide pour {src}')
            verifie(img.get('width') and img.get('height'), f'{nom} : width/height pour {src}')
            verifie(ref_locale_existe(racine, d, src), f'{nom} : fichier présent pour {src}')
            verifie((img.get('loading') == 'lazy') == (i >= 3), f'{nom} : {src} {"différée" if i >= 3 else "chargée tout de suite"}')
        for ref in p.refs:
            verifie(ref_locale_existe(racine, d, ref), f'{nom} : lien local « {ref} »')
        if fiches is not None:
            texte = re.sub(r'\s+', ' ', ' '.join(p.texte))
            paras = fiches[FICHE[d]]
            morceaux = [l[2:] for l in paras[2].split('\n')[1:]]             # les 11 fonctions
            morceaux.append(paras[4].split('\n')[1])                         # l'abonnement
            morceaux.append(paras[5].split('\n')[0])                         # le crédit de Sintel
            if d not in ('', 'en'):                    # FR / EN : la réponse « identifiants » est adaptée, approuvée
                morceaux.append(paras[3].split('\n')[1])                     # vos identifiants
                morceaux.append(paras[3].split('\n')[3])                     # ni publicité ni traqueur
            verifie(len(morceaux) >= 13, f'{nom} : morceaux de la fiche trouvés ({len(morceaux)})')
            for m in morceaux:
                verifie(re.sub(r'\s+', ' ', m) in texte, f'{nom} : mot pour mot de la fiche « {m[:50]}… »')
            # L'avertissement : le DÉBUT du paragraphe de la fiche, mot pour mot (sa dernière phrase, la démo, est réécrite).
            av = re.search(r'<p class="avertissement">(.*?)</p>', tout, re.S)
            av = av.group(1) if av else ''
            verifie(len(av) > len(paras[1]) // 2 and paras[1].startswith(av),
                    f'{nom} : avertissement = début mot pour mot de celui de la fiche')

    # Réciprocité : si A cite B, B cite A (déjà impliqué par les ensembles égaux ; vérifié pour lui-même).
    for da, pa in pages.items():
        for x in pa.liens:
            if x.get('rel') == 'alternate' and x.get('hreflang') != 'x-default' and x.get('href') in attendus:
                db = attendus[x['href']][0]
                if db in pages:
                    retour = [y.get('href') for y in pages[db].liens if y.get('rel') == 'alternate']
                    verifie(url_de(da) in retour, f'réciprocité : {db or "(racine)"} cite {da or "(racine)"}')

    for champ in ('titre', 'description'):
        valeurs = {}
        for d, p in pages.items():
            v = p.titre.strip() if champ == 'titre' else [m.get('content') for m in p.metas if m.get('name') == 'description'][0]
            valeurs.setdefault(v, []).append(d or '(racine)')
        doubles = [v for v in valeurs.values() if len(v) > 1]
        verifie(not doubles, f'{champ} distinct d\'une langue à l\'autre (doublons : {doubles})')

    # sitemap.xml
    plan = racine / 'sitemap.xml'
    try:
        arbre = ET.parse(plan)
        ok_xml = True
    except (ET.ParseError, FileNotFoundError) as e:
        ok_xml = False
        verifie(False, f'sitemap.xml : XML valide ({e})')
    if ok_xml:
        verifie(True, 'sitemap.xml : XML valide')
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'x': 'http://www.w3.org/1999/xhtml'}
        racine_xml = arbre.getroot()
        verifie(racine_xml.tag == '{%s}urlset' % ns['s'], 'sitemap.xml : <urlset> du schéma sitemaps.org')
        urls = racine_xml.findall('s:url', ns)
        locs = [u.findtext('s:loc', namespaces=ns) for u in urls]
        verifie(sorted(locs) == sorted(attendus), f'sitemap.xml : les 21 adresses ({len(locs)} lues)')
        for u in urls:
            loc = u.findtext('s:loc', namespaces=ns)
            liens = {l.get('hreflang'): l.get('href') for l in u.findall('x:link', ns) if l.get('rel') == 'alternate'}
            verifie(liens == hreflang_attendu and len(u.findall('x:link', ns)) == 22,
                    f'sitemap.xml : {loc} porte ses 22 alternatives')
    robots = (racine / 'robots.txt').read_text(encoding='utf-8') if (racine / 'robots.txt').is_file() else ''
    verifie(f'Sitemap: {DOMAINE}sitemap.xml' in robots.splitlines(), 'robots.txt : la ligne Sitemap')
    verifie(not re.search(r'^Disallow:\s*/\s*$', robots, re.M), 'robots.txt : rien d\'interdit')

    # Les fichiers écrits sont ceux que les sources donnent.
    r = subprocess.run(['node', str(racine / '_langues' / 'generer.mjs'), '--verifie'], capture_output=True, text=True)
    verifie(r.returncode == 0, 'generer.mjs --verifie : conforme' + ('' if r.returncode == 0 else '\n' + r.stdout + r.stderr))

    print(f'\n{controles} contrôles, {echecs} échec(s)')
    sys.exit(1 if echecs else 0)


if __name__ == '__main__':
    main()
