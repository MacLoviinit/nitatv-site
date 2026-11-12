// Banc (non publié) — mutations du lot « site_503 » (les 503 passagers : occupe, google_injoignable) : chaque mutation casse UNE chose que l'essai navigateur doit voir.
// Le motif est compté en OCTETS (exactement 1 occurrence, sinon « motif cassé ») ; le fichier est restauré dans un
// finally ET sur Ctrl+C, puis vérifié par empreinte. Un rouge compte seulement s'il est NOMMÉ (ligne « ECHEC … »),
// jamais au seul code de sortie (un plantage n'est pas l'échec attendu).
// Usage : node _banc/mutations_503.mjs <dossier de sortie>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sortie = process.argv[2];
if (!sortie) throw new Error('usage : node _banc/mutations_503.mjs <dossier de sortie>');
fs.mkdirSync(sortie, { recursive: true });

const MUTATIONS = [
  { id: 'M0', quoi: 'TÉMOIN : aucune mutation (vert attendu)', fichier: null, parties: 'ajouter,connexion,supprimer' },
  { id: 'M1', quoi: 'TÉMOIN DU BRIEF — le réessai retiré : un 503 occupe pendant l\'attente arrête à « Connecté »', fichier: 'connexion.js',
    avant: "            if (j.erreur === 'pas_branche') connecte(); else encore();", apres: '            connecte();', parties: 'connexion' },
  { id: 'M2', quoi: 'le nonce n\'est plus redemandé de lui-même après un 503 occupe', fichier: 'google.js',
    avant: "if (e && e.message === 'occupe' && essai < REPRISES)", apres: "if (e && e.message === 'occupe' && essai < 0)", parties: 'connexion,supprimer' },
  { id: 'M3', quoi: 'tout 503 au nonce redevient « pas_branche » (le défaut d\'avant)', fichier: 'google.js',
    avant: "throw new Error(j && j.erreur === 'pas_branche' ? 'pas_branche' : 'occupe');", apres: "throw new Error('pas_branche');", parties: 'connexion,supprimer' },
  { id: 'M4', quoi: 'connexion : tout 503 au POST /v1/appairage redevient « Pas encore ouvert »', fichier: 'connexion.js',
    avant: "if (r.status === 503 && j.erreur === 'pas_branche') fin('info'", apres: "if (r.status === 503) fin('info'", parties: 'connexion' },
  { id: 'M5', quoi: 'ajouter : tout 503 à l\'envoi redevient « pas encore ouvert »', fichier: 'playlist.js',
    avant: "t(j.erreur === 'pas_branche' ? 'pasOuvertDepot' : 'occupe')", apres: "t('pasOuvertDepot')", parties: 'ajouter' },
  { id: 'M6', quoi: 'supprimer : tout 503 au POST redevient « rien à supprimer » (faux : le compte existe)', fichier: 'supprimer.js',
    avant: "if (r.status === 503 && j.erreur === 'pas_branche') fin('pasBranche');", apres: "if (r.status === 503) fin('pasBranche');", parties: 'supprimer' },
  { id: 'M7', quoi: 'la borne de l\'attente retirée (une suite de 503 tournerait sans fin)', fichier: 'connexion.js',
    avant: '      if (Date.now() - debut > DUREE_MAX) { connecte(); return; }', apres: '      void 0;', parties: 'connexion' },
  { id: 'M8', quoi: 'pas_branche pendant l\'attente pris pour passager (il doit arrêter)', fichier: 'connexion.js',
    avant: "            if (j.erreur === 'pas_branche') connecte(); else encore();", apres: '            encore();', parties: 'connexion' },
  { id: 'M9', quoi: 'FAUX SERVEUR : le 503 passager sans CORS (≠ le vrai, guichet.py) — le banc masquerait le défaut', fichier: '_banc/faux_serveur.mjs',
    avant: "const rendre503 = (erreur) => json(res, 503, { erreur, message: MESSAGES_503[erreur] }, routeWeb || (p === '/v1/nonce' && reglages.corsNonce));",
    apres: "const rendre503 = (erreur) => json(res, 503, { erreur, message: MESSAGES_503[erreur] }, false);", parties: 'connexion' }
];

const empreinte = (b) => crypto.createHash('sha256').update(b).digest('hex');
let enCours = null; // { chemin, original }
const restaurer = () => {
  if (!enCours) return;
  fs.writeFileSync(enCours.chemin, enCours.original);
  const ok = empreinte(fs.readFileSync(enCours.chemin)) === empreinte(enCours.original);
  console.log(`  restauré ${path.basename(enCours.chemin)} : ${ok ? 'empreinte identique' : 'EMPREINTE DIFFÉRENTE'}`);
  if (!ok) process.exitCode = 3;
  enCours = null;
};
process.on('SIGINT', () => { restaurer(); process.exit(130); });

const lignes = [];
for (const m of MUTATIONS) {
  let motif = 'sans objet';
  try {
    if (m.fichier) {
      const chemin = path.join(racine, m.fichier);
      const original = fs.readFileSync(chemin);
      const avant = Buffer.from(m.avant, 'utf8');
      let n = 0;
      for (let i = original.indexOf(avant); i >= 0; i = original.indexOf(avant, i + 1)) n++;
      if (n !== 1) { lignes.push(`${m.id} ${m.fichier} MOTIF CASSÉ (${n} occurrence(s)) — mutation non jouée`); console.log(lignes.at(-1)); continue; }
      motif = 'trouvé 1 fois';
      enCours = { chemin, original };
      const i = original.indexOf(avant);
      fs.writeFileSync(chemin, Buffer.concat([original.subarray(0, i), Buffer.from(m.apres, 'utf8'), original.subarray(i + avant.length)]));
      if (!fs.readFileSync(chemin).includes(Buffer.from(m.apres, 'utf8'))) throw new Error('la mutation ne s\'est pas écrite');
    }
    const r = spawnSync(process.execPath, [path.join(racine, '_banc', 'essai_navigateur.mjs'), path.join(sortie, m.id + '_captures'), m.parties],
      { cwd: racine, encoding: 'utf8', timeout: 900000 });
    const texte = (r.stdout || '') + (r.stderr || '');
    fs.writeFileSync(path.join(sortie, m.id + '.txt'), texte);
    const rouges = texte.split('\n').filter((l) => l.startsWith('ECHEC '));
    const bilan = (texte.match(/(\d+) contrôles, (\d+) échec\(s\)/) || [])[0] || 'PAS DE BILAN (plantage ?)';
    const plantage = /^ERREUR /m.test(texte) || r.status === 2 || r.error;
    lignes.push(`${m.id} ${m.fichier || '—'} [${motif}] code=${r.status} ${bilan}${plantage ? ' PLANTAGE' : ''} — ${m.quoi}\n     ${rouges.length ? rouges.join('\n     ') : '(aucun rouge nommé)'}`);
    console.log(lignes.at(-1));
  } finally {
    restaurer();
  }
}
const etat = execFileSync('git', ['status', '--porcelain'], { cwd: racine, encoding: 'utf8' });
lignes.push('git status après :\n' + etat);
fs.writeFileSync(path.join(sortie, 'mutations.txt'), lignes.join('\n') + '\n');
console.log('\n' + lignes.at(-1));
