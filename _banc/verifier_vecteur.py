# Banc (non publié) — rejoue le vecteur nitatv-depot-v1 avec Python `cryptography`, sans rien de la page.
# Usage : python _banc/verifier_vecteur.py <vecteur.json>
import base64
import json
import sys

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

sys.stdout.reconfigure(encoding="utf-8")


def b64u(texte):
    return base64.urlsafe_b64decode(texte + "=" * (-len(texte) % 4))


vecteur = json.load(open(sys.argv[1], encoding="utf-8"))
d = int(vecteur["tele"]["prive_d_hex"], 16)
prive = ec.derive_private_key(d, ec.SECP256R1())
public_k = prive.public_key().public_bytes(
    encoding=__import__("cryptography.hazmat.primitives.serialization", fromlist=["Encoding"]).Encoding.X962,
    format=__import__("cryptography.hazmat.primitives.serialization", fromlist=["PublicFormat"]).PublicFormat.UncompressedPoint,
)
echecs = 0


def verifie(ok, quoi):
    global echecs
    print(("OK    " if ok else "ECHEC ") + quoi)
    if not ok:
        echecs += 1


verifie(base64.urlsafe_b64encode(public_k).rstrip(b"=").decode() == vecteur["tele"]["public_k"], "k = clé publique brute de d")
for cas in vecteur["cas"]:
    env = json.loads(base64.b64decode(cas["chiffre"], validate=True).decode("utf-8"))
    epk = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), b64u(env["epk"]))
    secret = prive.exchange(ec.ECDH(), epk)
    verifie(secret.hex() == cas["secret_ecdh_hex"], f"{cas['nom']} : secret ECDH")
    cle = HKDF(algorithm=hashes.SHA256(), length=32, salt=cas["depot"].encode("utf-8"),
               info=b"nitatv-depot-v1").derive(secret)
    verifie(cle.hex() == cas["cle_aes_hex"], f"{cas['nom']} : clé AES (HKDF)")
    clair = AESGCM(cle).decrypt(b64u(env["iv"]), b64u(env["ct"]), None)
    verifie(clair.decode("utf-8") == cas["clair_utf8"], f"{cas['nom']} : clair exact à l'octet")
    try:
        AESGCM(cle).decrypt(b64u(env["iv"]), b64u(env["ct"])[:-1] + bytes([b64u(env["ct"])[-1] ^ 1]), None)
        verifie(False, f"{cas['nom']} : témoin — étiquette abîmée refusée")
    except Exception:
        verifie(True, f"{cas['nom']} : témoin — étiquette abîmée refusée")
print(f"{echecs} échec(s)")
sys.exit(1 if echecs else 0)
