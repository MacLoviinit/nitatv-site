"""Les captures de la bande, allégées — un outil à part du générateur (il ne tourne qu'au changement d'une capture).

Source : les captures de la base de démo publiées sur Play (dépôt KaizokuTV,
`Logs/captures_play/a_publier_2026-11-14/`, toutes fictives). Sortie : `images/` du site, 960x540, JPEG progressif.
La capture « telephone » assemble trois écrans du téléphone (le direct, la fiche d'un film, une série) dans le même
format 16:9 que les autres, pour que la bande garde une hauteur unique.

Usage : python3 _langues/images.py <dossier a_publier_2026-11-14>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

LARGEUR, HAUTEUR, QUALITE = 960, 540, 78
FOND = (16, 19, 32)  # --fond du site (#101320)
TELE = {
    'direct': 'TV/1.png', 'guide': 'TV/4.png', 'films': 'TV/6.png', 'film': 'TV/7.png',
    'pistes': 'TV/3.png', 'enregistrement': 'TV/9_reserve_record.png',
}
TELEPHONE = ['Telephone/1.png', 'Telephone/7.png', 'Telephone/8.png']


def enregistrer(im, nom, sortie):
    chemin = sortie / f'{nom}.jpg'
    im.convert('RGB').save(chemin, 'JPEG', quality=QUALITE, optimize=True, progressive=True)
    print(f'{chemin.name}: {im.size[0]}x{im.size[1]}, {chemin.stat().st_size} octets')


def main():
    source = Path(sys.argv[1])
    sortie = Path(__file__).resolve().parent.parent / 'images'
    for nom, f in TELE.items():
        enregistrer(Image.open(source / f).convert('RGB').resize((LARGEUR, HAUTEUR), Image.LANCZOS), nom, sortie)
    # Trois téléphones côte à côte : 540 de haut, coins arrondis, écart 16.
    toile = Image.new('RGB', (LARGEUR, HAUTEUR), FOND)
    h = HAUTEUR - 24
    l = round(h * 1080 / 1920)
    ecart = 24
    x = (LARGEUR - 3 * l - 2 * ecart) // 2
    for f in TELEPHONE:
        tel = Image.open(source / f).convert('RGB').resize((l, h), Image.LANCZOS)
        masque = Image.new('L', (l, h), 0)
        ImageDraw.Draw(masque).rounded_rectangle((0, 0, l - 1, h - 1), radius=18, fill=255)
        toile.paste(tel, (x, 12), masque)
        x += l + ecart
    enregistrer(toile, 'telephone', sortie)


if __name__ == '__main__':
    main()
