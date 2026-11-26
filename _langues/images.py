"""Les captures de la bande, allégées — un outil à part du générateur (il ne tourne qu'au changement d'une capture).

Source : les captures de la base de démo publiées sur Play (dépôt KaizokuTV,
`Logs/captures_play/a_publier_2026-11-14/`, toutes fictives). Sortie : `images/` du site, 960x540, JPEG progressif
(la bande) ; `images/grand/` 1920x1080 (la capture agrandie au clic, chargée seulement à l'ouverture).
La capture « telephone » assemble trois écrans du téléphone (le direct, la fiche d'un film, une série) dans le même
format 16:9 que les autres, pour que la bande garde une hauteur unique.

Usage : python3 _langues/images.py <dossier a_publier_2026-11-14>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

FORMATS = [('', 960, 540, 78), ('grand', 1920, 1080, 80)]  # (sous-dossier, largeur, hauteur, qualité)
FOND = (16, 19, 32)  # --fond du site (#101320)
TELE = {
    'direct': 'TV/1.png', 'guide': 'TV/4.png', 'films': 'TV/6.png', 'film': 'TV/7.png',
    'pistes': 'TV/3.png', 'enregistrement': 'TV/9_reserve_record.png',
}
TELEPHONE = ['Telephone/1.png', 'Telephone/7.png', 'Telephone/8.png']


def enregistrer(im, nom, sortie, qualite):
    sortie.mkdir(parents=True, exist_ok=True)
    chemin = sortie / f'{nom}.jpg'
    im.convert('RGB').save(chemin, 'JPEG', quality=qualite, optimize=True, progressive=True)
    print(f'{chemin.parent.name}/{chemin.name}: {im.size[0]}x{im.size[1]}, {chemin.stat().st_size} octets')


def telephones(source, largeur, hauteur):
    """Trois téléphones côte à côte, coins arrondis, dans le format 16:9 des autres."""
    k = largeur / 960
    toile = Image.new('RGB', (largeur, hauteur), FOND)
    marge = round(12 * k)
    h = hauteur - 2 * marge
    l = round(h * 1080 / 1920)
    ecart = round(24 * k)
    x = (largeur - 3 * l - 2 * ecart) // 2
    for f in TELEPHONE:
        tel = Image.open(source / f).convert('RGB').resize((l, h), Image.LANCZOS)
        masque = Image.new('L', (l, h), 0)
        ImageDraw.Draw(masque).rounded_rectangle((0, 0, l - 1, h - 1), radius=round(18 * k), fill=255)
        toile.paste(tel, (x, marge), masque)
        x += l + ecart
    return toile


def main():
    source = Path(sys.argv[1])
    images = Path(__file__).resolve().parent.parent / 'images'
    for dossier, largeur, hauteur, qualite in FORMATS:
        sortie = images / dossier if dossier else images
        for nom, f in TELE.items():
            im = Image.open(source / f).convert('RGB')
            if im.size != (largeur, hauteur):
                im = im.resize((largeur, hauteur), Image.LANCZOS)
            enregistrer(im, nom, sortie, qualite)
        enregistrer(telephones(source, largeur, hauteur), 'telephone', sortie, qualite)


if __name__ == '__main__':
    main()
