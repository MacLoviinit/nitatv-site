// Banc (non publié) — mutations du lot « site_scan » (un seul scan, le guide, le verre) : chaque mutation casse UNE chose que l'essai navigateur doit voir.
// Le motif est compté en OCTETS (exactement 1 occurrence, sinon « motif cassé ») ; le fichier est restauré dans un
// finally ET sur Ctrl+C, puis vérifié par empreinte. Un rouge compte seulement s'il est NOMMÉ (ligne « ECHEC … »),
// jamais au seul code de sortie (un plantage n'est pas l'échec attendu).
// Usage : node _banc/mutations_scan.mjs <dossier de sortie>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sortie = process.argv[2];
if (!sortie) throw new Error('usage : node _banc/mutations_scan.mjs <dossier de sortie>');
fs.mkdirSync(sortie, { recursive: true });

const MUTATIONS = [
  { id: 'K0', quoi: 'TÉMOIN : aucune mutation (vert attendu)', fichier: null, parties: 'ajouter,connexion' },
  { id: 'K1', quoi: 'TÉMOIN DU BRIEF — la clé prise AILLEURS que dans le QR : celle que glisse la réponse de …/depot', fichier: 'connexion.js',
    avant: '            NitaPlaylist.demarrer({ api: API, cle: cle, depot: j.depot, jeton: j.jeton, plusTard: plusTard });',
    apres: '            NitaDepot.importerCleTele(j.k).then(function (c) { NitaPlaylist.demarrer({ api: API, cle: c, depot: j.depot, jeton: j.jeton, plusTard: plusTard }); });',
    parties: 'connexion' },
  { id: 'K2', quoi: 'TÉMOIN DU BRIEF — un guide vide est envoyé (« guide": "" » dans le clair)', fichier: 'depot.js',
    avant: '      if (guide) clair.guide = guide;', apres: '      clair.guide = guide;', parties: 'ajouter' },
  { id: 'K3', quoi: 'TÉMOIN DU BRIEF — le sel n\'est pas d (le jeton à sa place)', fichier: 'playlist.js',
    avant: 'NitaDepot.chiffrer(o.cle, o.depot, clair)', apres: 'NitaDepot.chiffrer(o.cle, o.jeton, clair)', parties: 'ajouter,connexion' },
  { id: 'K4', quoi: 'un 202 n\'est pas réinterrogé (la page attend pour toujours)', fichier: 'connexion.js',
    avant: '        if (r.status === 202) { encore(); return; }', apres: '        if (r.status === 202) { return; }', parties: 'connexion' },
  { id: 'K5', quoi: 'sans k dans le QR, la page interroge quand même …/depot', fichier: 'connexion.js',
    avant: 'if (suite && cleTele) attendre(suite);', apres: 'if (suite) attendre(suite);', parties: 'connexion' },
  { id: 'K6', quoi: '410 / 401 suite / 503 de …/depot pris pour « attendre encore »', fichier: 'connexion.js',
    avant: '        connecte(); // 410 (expired), 401 suite', apres: '        encore(); // 410 (expired), 401 suite', parties: 'connexion' },
  { id: 'K7', quoi: 'le « # » (a, t, k) n\'est plus effacé de la barre d\'adresse', fichier: 'connexion.js',
    avant: "  if (location.hash) history.replaceState(null, '', location.pathname + location.search);",
    apres: "  if (false) history.replaceState(null, '', location.pathname + location.search);", parties: 'connexion' },
  { id: 'K8', quoi: 'les champs (mot de passe compris) ne sont plus vidés à la fin', fichier: 'playlist.js',
    avant: "      ['url', 'guide', 'serveur', 'utilisateur', 'mot_de_passe'].forEach(function (id) { $(id).value = ''; });",
    apres: '      void 0;', parties: 'ajouter' },
  { id: 'K9', quoi: 'FAUX SERVEUR : …/depot accepte n\'importe quel suite (≠ contrat : remis au SEUL téléphone qui lie)', fichier: '_banc/faux_serveur.mjs',
    avant: 'if (!a.suite || corps.suite !== a.suite)', apres: 'if (!a.suite)', parties: 'connexion' },
  { id: 'K10', quoi: 'la page toujours en français (la langue du navigateur ignorée)', fichier: 'page.js',
    avant: "  var langue = /^fr\\b/i.test(navigator.language || '') ? 'fr' : 'en';", apres: "  var langue = 'fr';", parties: 'ajouter' },
  { id: 'K11', quoi: 'le verre s\'écarte de la maquette (texte blanc pur au lieu de #F3F7FB)', fichier: 'verre.css',
    avant: '  --texte: #F3F7FB;', apres: '  --texte: #FFFFFF;', parties: 'ajouter' }
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
