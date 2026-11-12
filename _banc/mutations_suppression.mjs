// Banc (non publié) — mutations du lot « suppression » : chaque mutation casse UNE chose que l'essai navigateur doit voir.
// Le motif est compté en OCTETS (exactement 1 occurrence, sinon « motif cassé ») ; le fichier est restauré dans un
// finally ET sur Ctrl+C, puis vérifié par empreinte. Un rouge compte seulement s'il est NOMMÉ (ligne « ECHEC … »),
// jamais au seul code de sortie (un plantage n'est pas l'échec attendu).
// Usage : node _banc/mutations_suppression.mjs <dossier de sortie>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sortie = process.argv[2];
if (!sortie) throw new Error('usage : node _banc/mutations_suppression.mjs <dossier de sortie>');
fs.mkdirSync(sortie, { recursive: true });

const MUTATIONS = [
  { id: 'S0', quoi: 'TÉMOIN : aucune mutation (vert attendu)', fichier: null, parties: 'supprimer' },
  { id: 'S1', quoi: 'la confirmation contournée : l\'appui Google envoie aussitôt la suppression', fichier: 'supprimer.js',
    avant: "    $('annuler').focus();\n  }", apres: "    $('annuler').focus();\n    $('supprimer').click();\n  }", parties: 'supprimer' },
  { id: 'S2', quoi: 'pas de nouveau nonce après un refus (401, réseau…)', fichier: 'supprimer.js',
    avant: '    return google_.preparer();\n  }', apres: '    return Promise.resolve();\n  }', parties: 'supprimer' },
  { id: 'S3', quoi: 'le nonce du serveur n\'est pas passé à Google (google.js, partagé avec connexion)', fichier: 'google.js',
    avant: '        nonce: nonce,\n', apres: '        nonce: undefined,\n', parties: 'supprimer,connexion' },
  { id: 'S4', quoi: 'changer de langue ne redessine pas le bouton Google', fichier: 'google.js',
    avant: 'redessiner: function () { if (nonce !== null', apres: 'redessiner: function () { if (false && nonce !== null', parties: 'supprimer' },
  { id: 'S5', quoi: 'après un échec réseau, le message de l\'essai est remplacé par « Impossible de joindre »', fichier: 'supprimer.js',
    avant: "var apresEssai = vueEtat && ['google',", apres: "var apresEssai = false && ['google',", parties: 'supprimer' },
  { id: 'S6', quoi: 'la page garde le jeton Google dans le navigateur (sessionStorage)', fichier: 'supprimer.js',
    avant: '    jeton = credential;\n', apres: "    jeton = credential;\n    sessionStorage.setItem('jeton', credential);\n", parties: 'supprimer' },
  { id: 'S7', quoi: 'un 503 au POST n\'est plus reconnu (traité comme une erreur du serveur)', fichier: 'supprimer.js',
    avant: "        if (r.status === 503) fin('pasBranche');", apres: "        if (false) fin('pasBranche');", parties: 'supprimer' },
  { id: 'S8', quoi: 'FAUX SERVEUR : le nonce n\'est plus consommé quand le jeton Google est refusé (≠ vrai serveur mesuré)', fichier: '_banc/faux_serveur.mjs',
    avant: '      n.servi = true;\n      if (reglages.reponseForcee)', apres: '      if (reglages.reponseForcee)', parties: 'supprimer' },
  { id: 'S9', quoi: 'le pied de l\'accueil ne mène plus à supprimer.html', fichier: 'index.html',
    avant: '<a href="supprimer.html">', apres: '<a href="supprimer-x.html">', parties: 'supprimer' }
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
