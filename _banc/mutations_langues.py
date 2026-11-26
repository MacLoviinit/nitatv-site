"""Mutations du contrôle des langues (`_banc/controle_langues.py`) — banc, non publié.

Chaque mutation s'applique à une COPIE du site (dossier temporaire, effacé à la fin) : le dépôt n'est jamais touché.
Une mutation compte son motif (exactement une fois, sinon elle est INVALIDE et le dit), le remplace, lance le
contrôle sur la copie, et exige qu'il rougisse sur l'échec ATTENDU (un rouge pour une autre raison ne compte pas).
Le témoin (copie intacte) doit rester vert.

Usage : python3 _banc/mutations_langues.py [--a-sec]     (--a-sec : compte les motifs sans rien lancer)
Le témoin et M17 lisent la fiche Play dans le dépôt voisin ../KaizokuTV/Docs/store.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent
CONTROLE = SITE / '_banc' / 'controle_langues.py'

# (nom, fichier, motif, remplacement, échec attendu dans la sortie du contrôle)
MUTATIONS = [
    ('M1 une page sans un hreflang (portée)', 'de/index.html',
     '<link rel="alternate" hreflang="ja" href="https://www.nita.tv/ja/">\n', '',
     'de : 22 hreflang'),
    ('M2 un alt vide', 'es/index.html',
     'alt="La guía de programación de NitaTV en una tele"', 'alt=""',
     'es : alt non vide pour ../images/guide.jpg'),
    ('M3 hreflang réciproque mais à la mauvaise adresse (valeur)', 'nl/index.html',
     'hreflang="de" href="https://www.nita.tv/de/"', 'hreflang="de" href="https://www.nita.tv/ru/"',
     'nl : hreflang="de" → https://www.nita.tv/de/'),
    ('M4 x-default sur le français (valeur)', 'it/index.html',
     'hreflang="x-default" href="https://www.nita.tv/en/"', 'hreflang="x-default" href="https://www.nita.tv/"',
     'it : hreflang="x-default"'),
    ('M5 canonical sur la racine', 'pl/index.html',
     '<link rel="canonical" href="https://www.nita.tv/pl/">', '<link rel="canonical" href="https://www.nita.tv/">',
     'pl : canonical unique sur elle-même'),
    ('M6 l\'arabe de gauche à droite', 'ar/index.html',
     '<html lang="ar" dir="rtl"', '<html lang="ar" dir="ltr"',
     'ar : dir'),
    ('M7 un lang faux', 'th/index.html',
     '<html lang="th"', '<html lang="en"',
     'th : lang="th"'),
    ('M8 un <title> vide', 'ko/index.html',
     '<title>NitaTV – Android TV, 태블릿, 휴대전화용 IPTV 플레이어</title>', '<title></title>',
     'ko : <title> non vide'),
    ('M9 la description anglaise recopiée', 'vi/index.html',
     'content="NitaTV là trình phát IPTV cho danh sách phát M3U hoặc nhà cung cấp của bạn: truyền hình trực tiếp, lịch phát sóng, ghi hình, phim lẻ và phim bộ. Một tháng dùng thử miễn phí, không cần thẻ tín dụng."',
     'content="NitaTV is an IPTV player for your M3U playlist or provider: live TV, program guide, recording, movies and series. A free one-month trial, no credit card needed."',
     'description distinct'),
    ('M10 un lien local cassé', 'pt/index.html',
     'src="../images/film.jpg"', 'src="../images/filme.jpg"',
     'pt : fichier présent pour ../images/filme.jpg'),
    ('M11 le sitemap perd une adresse', 'sitemap.xml',
     '  <url>\n    <loc>https://www.nita.tv/hi/</loc>', '  <url>\n    <loc>https://www.nita.tv/hindi/</loc>',
     'sitemap.xml : les 21 adresses'),
    ('M12 le sitemap n\'est plus du XML', 'sitemap.xml',
     '</urlset>\n', '</urlset\n',
     'sitemap.xml : XML valide'),
    ('M13 une page écrite à la main (le générateur ne la reconnaît plus)', 'id/index.html',
     '<h2>Fitur NitaTV</h2>', '<h2>Fitur NitaTV!</h2>',
     'generer.mjs --verifie'),
    ('M14 « Xtream » dans une page', 'ru/index.html',
     'Что умеет NitaTV</h2>', 'Что умеет NitaTV (Xtream)</h2>',
     'ru : aucun « Xtream »'),
    ('M15 une capture différée en tête de bande', 'ja/index.html',
     'src="../images/direct.jpg" width="960" height="540" alt="テレビで表示した NitaTV：ライブ チャンネルの一覧と、各チャンネルで放送中の番組"',
     'src="../images/direct.jpg" width="960" height="540" alt="テレビで表示した NitaTV：ライブ チャンネルの一覧と、各チャンネルで放送中の番組" loading="lazy"',
     'ja : ../images/direct.jpg chargée tout de suite'),
    ('M16 robots.txt sans Sitemap', 'robots.txt',
     'Sitemap: https://www.nita.tv/sitemap.xml\n', '',
     'robots.txt : la ligne Sitemap'),
    # Le mot pour mot de la fiche Play : la fonction changée dans la source ET dans la page (le générateur reste
    # d'accord) ; seul le contrôle `--fiches` peut la voir. Lancé avec --fiches <KaizokuTV/Docs/store>.
    ('M17 une fonction de la fiche reformulée (mot pour mot)', ('de/index.html', '_langues/textes/de.json'),
     'Auf ein Chromecast-Gerät streamen', 'Auf einen Chromecast streamen',
     'de : mot pour mot de la fiche « Auf ein Chromecast-Gerät streamen'),
    # --- site_langues2 : le prix, le menu, l'agrandissement, le compteur, la confidentialité ---
    ('M18 une page d\'accueil sans le compteur (portée)', 'nl/index.html',
     '<script defer src="https://api.nita.tv/m/n.js" data-website-id="792f18f9-4760-4e12-877c-be87ae0428ea" data-host-url="https://api.nita.tv/m" data-domains="www.nita.tv,nita.tv" data-exclude-search="true" data-exclude-hash="true"></script>\n', '',
     'nl : la balise du compteur Umami, une fois'),
    ('M19 le compteur posé sur la page de connexion', 'connexion.html',
     '</head>', '<script defer src="https://api.nita.tv/m/n.js" data-website-id="792f18f9-4760-4e12-877c-be87ae0428ea" data-host-url="https://api.nita.tv/m" data-domains="www.nita.tv,nita.tv" data-exclude-search="true" data-exclude-hash="true"></script>\n</head>',
     'connexion.html : PAS de compteur Umami'),
    ('M20 le mauvais drapeau dans le menu (valeur)', 'de/index.html',
     '<li><a href="../es-419/" hreflang="es" lang="es-419" data-langue="es-419"><img src="../images/drapeaux/mx.svg"',
     '<li><a href="../es-419/" hreflang="es" lang="es-419" data-langue="es-419"><img src="../images/drapeaux/es.svg"',
     'de : menu, drapeau « mx »'),
    ('M21 le menu perd une langue', 'ko/index.html',
     '<li><a href="../hi/" hreflang="hi" lang="hi" data-langue="hi"><img src="../images/drapeaux/in.svg" width="20" height="15" alt="" loading="lazy">हिन्दी</a></li>\n', '',
     'ko : 21 entrées dans le menu'),
    ('M22 le bas de page perd une langue (Google ne suit plus le lien)', 'tr/index.html',
     '        <li><a href="../nl/" hreflang="nl" lang="nl" data-langue="nl">Nederlands</a></li>\n', '',
     'tr : les 21 langues aussi en bas de page'),
    ('M23 un faux prix (valeur)', 'it/index.html',
     'Costa 9,99', 'Costa 7,99',
     'it : le prix « 9,99 USD »'),
    ('M24 une capture qui ne s\'agrandit plus', 'pl/index.html',
     'href="../images/grand/pistes.jpg"', 'href="../images/pistes.jpg"',
     'pl : ../images/pistes.jpg s\'agrandit'),
    ('M25 la confidentialité garde 13 mois', 'confidentialite.html',
     'sont gardées <strong>24 mois</strong>', 'sont gardées <strong>13 mois</strong>',
     'confidentialite.html #fr : section « Mesure d\'audience »'),
    ('M26 la confidentialité anglaise sans sa limite au site', 'confidentialite.html',
     '<strong>only the home pages of the www.nita.tv website</strong>', '<strong>only the home pages</strong>',
     'confidentialite.html #en : section « Audience measurement »'),
]
FICHES = Path(__file__).resolve().parent.parent.parent / 'KaizokuTV' / 'Docs' / 'store'


def copie():
    d = Path(tempfile.mkdtemp(prefix='nitatv-langues-'))
    shutil.copytree(SITE, d / 'site', ignore=shutil.ignore_patterns('.git'))
    return d


def controle(racine, fiches=False):
    args = [sys.executable, str(CONTROLE), str(racine)] + (['--fiches', str(FICHES)] if fiches else [])
    r = subprocess.run(args, capture_output=True, text=True)
    return r.returncode, r.stdout + r.stderr


def main():
    a_sec = '--a-sec' in sys.argv
    invalides = 0
    for nom, f, motif, rempl, attendu in MUTATIONS:
        for un in (f if isinstance(f, tuple) else (f,)):
            n = (SITE / un).read_bytes().count(motif.encode('utf-8'))
            if n != 1:
                invalides += 1
                print(f'INVALIDE {nom} : motif trouvé {n} fois dans {un}')
            elif a_sec:
                print(f'motif OK {nom} ({un})')
    if a_sec:
        print(f'\n{len(MUTATIONS)} motifs, {invalides} invalide(s)')
        sys.exit(1 if invalides else 0)

    base = copie()
    try:
        rc, sortie = controle(base / 'site', fiches=True)
        temoin = rc == 0
        print(('VERT  ' if temoin else 'ROUGE ') + 'témoin (copie intacte)' + ('' if temoin else '\n' + sortie[-800:]))
        rouges = 0
        for nom, f, motif, rempl, attendu in MUTATIONS:
            d = copie()
            try:
                valide = True
                for un in (f if isinstance(f, tuple) else (f,)):
                    cible = d / 'site' / un
                    octets = cible.read_bytes()
                    valide = valide and octets.count(motif.encode('utf-8')) == 1
                    cible.write_bytes(octets.replace(motif.encode('utf-8'), rempl.encode('utf-8')))
                if not valide:
                    print(f'INVALIDE {nom}')
                    continue
                rc, sortie = controle(d / 'site', fiches='mot pour mot' in attendu)
                echecs = [l for l in sortie.splitlines() if l.startswith('ECHEC ')]
                nomme = any(attendu in l for l in echecs)
                if rc == 1 and nomme:
                    rouges += 1
                    premier = next(l for l in echecs if attendu in l)
                    print(f'ROUGE {nom} — {premier}')
                else:
                    print(f'VERT  {nom} (rc={rc}, échecs lus : {echecs[:3]})')
            finally:
                shutil.rmtree(d, ignore_errors=True)
        print(f'\n{rouges}/{len(MUTATIONS)} mutations rouges sur l\'échec attendu ; témoin {"vert" if temoin else "ROUGE"}')
        sys.exit(0 if temoin and rouges == len(MUTATIONS) else 1)
    finally:
        shutil.rmtree(base, ignore_errors=True)


if __name__ == '__main__':
    main()
