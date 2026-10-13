/**
 * Exceptions nominatives de capacité (spécification P0c, section 3). Propriété du Tech Lead, verdict Sécurité exigé
 * pour tout ajout, retrait ou élargissement. Chaque ligne nomme un fichier exact et ses seules capacités, chacune
 * avec ses formes exactes (noms importés, texte exact, forme d'usage) ; toute autre capacité reste refusée dans ce
 * fichier, et une forme qui ne correspond plus à rien fait échouer le test (« ligne inutile »).
 *
 * Capacités : `module:<module>` (formes : noms importés, `type:<nom>` pour un import de type, `default`, `*`,
 * `import()`), `identifiant:<nom>`, `global:<nom>` (alias et ses accès), `hote:<hôte>` et `fragment:<fragment>`
 * (forme : texte exact). Une ligne marquée `ecart` couvre une forme que la spécification refuse sans ligne
 * (`<règle>:<constat>`, `secret:<nom>`) : écart relevé sur `main` à la base de P0c1, à trancher par le Tech Lead
 * avec verdict Sécurité (description de la PR de P0c1).
 *
 * Les lignes dont la forme contient une valeur refusée (hôte, fragment, nom secret) vivent dans
 * `donnees/lignes-textes.json`, extension non analysée (section 1, « Données du régime ») ; elles sont lues ici.
 */

import { readFileSync } from "node:fs";

export type Portee = "test" | "outil" | "application";

export type LigneCapacite = {
  readonly fichier: string;
  readonly portee: Portee;
  readonly usage: string;
  /** `nombre` : occurrences admises de chaque forme dans le fichier (décision 0040 D1) ; sans borne s'il est absent. */
  readonly capacites: readonly { readonly capacite: string; readonly formes: readonly string[]; readonly nombre?: number }[];
  /** Écart à la spécification couvert par la ligne ; obligatoire pour toute capacité hors de la section 3. */
  readonly ecart?: string;
};

export const LIGNES_CAPACITE = [
  // --- Section 3, relevé de `40b6738` -------------------------------------------------------------------------
  {
    fichier: "scripts/serve-standalone.mjs",
    portee: "outil",
    usage: "lance le serveur Next autonome (`pnpm start`, e2e)",
    capacites: [{ capacite: "module:node:child_process", formes: ["spawn"] }],
  },
  {
    fichier: "tests/perf/lighthouse-helpers.ts",
    portee: "test",
    usage: "port libre et mesure Lighthouse (0022)",
    capacites: [
      { capacite: "module:node:net", formes: ["createServer"] },
      { capacite: "module:lighthouse", formes: ["import()"] },
    ],
  },
  {
    fichier: "tests/unit/ci/visual-update.test.ts",
    portee: "test",
    usage: "test du workflow de mise à jour visuelle",
    capacites: [
      { capacite: "module:node:child_process", formes: ["execFileSync", "spawn", "spawnSync"] },
      // `type:Server` : import de type seulement, dans la même déclaration que `createServer`.
      { capacite: "module:node:http", formes: ["createServer", "type:Server"] },
      { capacite: "module:node:net", formes: ["type:AddressInfo"] },
    ],
  },
  {
    fichier: "tests/unit/debloquer-regles.test.ts",
    portee: "test",
    usage: "test des règles de déblocage",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync"] }],
  },
  {
    fichier: "src/lib/large-screen.test.tsx",
    portee: "test",
    usage: "lecture du thème Tailwind",
    capacites: [
      { capacite: "module:node:module", formes: ["createRequire"] },
      { capacite: "identifiant:require", formes: ["const require = createRequire(import.meta.url)", "require.resolve(<littéral>)"] },
    ],
  },
  {
    fichier: "src/components/carte/GoogleMapRenderer.tsx",
    portee: "application",
    usage: "carte Google du navigateur (F4), clé publique restreinte par référent",
    capacites: [
      { capacite: "module:@googlemaps/js-api-loader", formes: ["importLibrary", "setOptions"] },
      { capacite: "global:window", formes: ["alias:authWindow", "authWindow.gm_authFailure"] },
    ],
  },
  {
    fichier: "src/app/fonts.ts",
    portee: "application",
    usage: "police téléchargée par Next au build et servie depuis le site ; aucune requête du navigateur vers Google",
    capacites: [{ capacite: "module:next/font/google", formes: ["Hanken_Grotesk"] }],
  },
  // --- Lignes du régime lui-même (section 3) -------------------------------------------------------------------
  {
    fichier: "tests/unit/confinement/fichiers.ts",
    portee: "test",
    usage: "énumération des fichiers suivis et de leurs modes (`git ls-files -z -s`, section 1)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync"] }],
  },
  {
    fichier: "tests/support/serveur-local.ts",
    portee: "test",
    usage: "serveur local de test, `127.0.0.1`, port `0` (section 4)",
    capacites: [{ capacite: "module:node:http", formes: ["createServer"] }],
  },

  // --- Section 9 (P0a1) ------------------------------------------------------------------------------------------
  {
    fichier: "scripts/p0/enregistrer.mjs",
    portee: "outil",
    usage: "point d'accroche de résolution de `pnpm p0` (0032 § A3.4), fichier figé par empreinte",
    capacites: [{ capacite: "module:node:module", formes: ["registerHooks"] }],
  },

  // --- Écarts relevés à la base de P0c1 (après `40b6738`) : verdicts de la décision 0040 ---------------------------
  {
    fichier: "src/research/ip-guard.ts",
    portee: "application",
    usage:
      "garde d'adresses IP de la lecture de pages (P0a1) : `isIP` et `BlockList`, aucune connexion ni résolution ; justification " +
      "côté serveur (0040 D2) : module pur exécuté seulement côté serveur dans le pipeline de recherche ; `node:net` n'existe pas dans le navigateur",
    capacites: [{ capacite: "module:node:net", formes: ["BlockList", "isIP"] }],
    ecart: "module à capacité en zone sensible, absent du tableau de la section 3 (P0a1, PR 180) : 0040 D2, A4 (permanente)",
  },
  {
    fichier: "src/adapters/prototype-loader.test.ts",
    portee: "test",
    usage: "test du chargeur de programmes du prototype (P0b1)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync"] }],
    ecart: "fichier apparu après `40b6738` (P0b1, PR 208) : ligne ordinaire B, 0040 D4",
  },
  {
    fichier: "tests/unit/ci/post-merge-cleanup.test.ts",
    portee: "test",
    usage: "test du nettoyage après fusion",
    capacites: [{ capacite: "module:node:child_process", formes: ["spawnSync"] }],
    ecart: "fichier apparu après `40b6738` (T20, PR 177) : ligne ordinaire B, 0040 D4",
  },
  {
    fichier: "tests/unit/p0/depot.test.ts",
    portee: "test",
    usage: "test de P0a1 : aucun secret dans les fichiers suivis (`git ls-files`)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync"] }],
    ecart: "fichier de P0a1 (PR 180), section 9 : ligne ordinaire B, 0040 D4",
  },
  {
    fichier: "src/research/fetch-page.test.ts",
    portee: "test",
    usage: "doubles du résolveur et de la couche HTTP de la lecture de pages (P0a1)",
    capacites: [{ capacite: "acces-calcule:cle-non-litterale", formes: ["table[hote]", "pages[`https://${requete.nomHote}${requete.chemin}`]"] }],
    ecart:
      "accès calculés à clé non littérale dans un test de zone sensible (règle fermée de 2.6 ; PR 180) : 0040 D2, A6 ; transitoire, " +
      "retrait par la tâche de suivi `ia` de 0040 D1 (`Map` ou `Object.hasOwn`)",
  },
  {
    fichier: "tests/unit/p0/imports.test.ts",
    portee: "test",
    usage: "test d'imports de PR 149 (P0a1), non modifiable par P0c1 (0038, TL-2 point 1)",
    capacites: [{ capacite: "identifiant:module", formes: ["declaration", "reference"] }],
    ecart: "paramètre local nommé `module` : identifiant refusé sans analyse de portée (2.3) : 0040 D2, A2 (permanente)",
  },
  {
    fichier: "tests/unit/p0/cli.test.ts",
    portee: "test",
    usage: "test de `pnpm p0` (P0a1) : espionne les modules réseau et surveille les lectures de `process.env` (fonction `surveillerEnv`)",
    capacites: [
      { capacite: "module:node:child_process", formes: ["spawnSync"], nombre: 1 },
      { capacite: "module:node:dns", formes: ["default"], nombre: 1 },
      { capacite: "module:node:http", formes: ["default"], nombre: 1 },
      { capacite: "module:node:https", formes: ["default"], nombre: 1 },
      { capacite: "module:node:net", formes: ["default"], nombre: 1 },
      { capacite: "module:node:tls", formes: ["default"], nombre: 1 },
      { capacite: "identifiant:fetch", formes: ["declaration", "reference"] },
      // Formes exactes de 0040 D1, contexte compris (voir `formeReflexion` de `analyse.ts`), une occurrence chacune.
      { capacite: "reflexion:Proxy", formes: ["process.env = new Proxy(original, { get, has, ownKeys })"], nombre: 1 },
      {
        capacite: "reflexion:Reflect",
        formes: ["Reflect.get(cible, nom, recepteur) (piège get)", "Reflect.has(cible, nom) (piège has)", "Reflect.ownKeys(cible) (piège ownKeys)"],
        nombre: 1,
      },
      { capacite: "environnement:usage", formes: ["const original = process.env (dans surveillerEnv)"], nombre: 1 },
      {
        capacite: "environnement:ecriture",
        formes: ["process.env = new Proxy(original, { get, has, ownKeys })", "process.env = original (finally)"],
        nombre: 1,
      },
      {
        capacite: "environnement:acces-calcule",
        formes: ['process.env[nom] (for…of ["PATH","HOME","SystemRoot","TMPDIR","TEMP","TMP"])'],
        nombre: 1,
      },
      {
        capacite: "regime-tests:stubEnv-non-litteral",
        formes: ["vi.stubEnv(nom, `valeur-de-test-${nom}`) (for…of VARIABLES_DE_CLE)"],
        nombre: 2,
      },
    ],
    ecart:
      "exception transitoire unique à la section 2.4 : 0040 D1 (amendements A4 et A5) ; fichier de P0a1 (PR 180) ; retrait par la " +
      "tâche de suivi `ia` de 0040 D1 (option b), avant l'ouverture de la PR de P0r2",
  },
  {
    fichier: "tests/unit/p0/pipeline.test.ts",
    portee: "test",
    usage: "test du pipeline de P0a1 : lecture d'un champ du message simulé",
    capacites: [
      {
        capacite: "acces-calcule:type",
        formes: ['(donneesDe(requete.messages.at(-1)?.contenu ?? "") as Record<string, Vue[]>)[champ] (objet any/unknown)'],
      },
    ],
    ecart: "accès admis seulement par la conversion d'un `unknown` (0038 TL-5 point 7 ; PR 180) : 0040 D2, A7",
  },
  // Relevé de `f57153c` (T18, PR 199, fusionnée après la décision 0038).
  {
    fichier: "scripts/ci/techlead-gate.mjs",
    portee: "outil",
    usage: "porte techlead-gate (0035) : `git cat-file` et `git ls-tree` sur le clone, environnement copié avec `GIT_LITERAL_PATHSPECS`",
    capacites: [
      { capacite: "module:node:child_process", formes: ["execFileSync"] },
      { capacite: "environnement:entier", formes: ["etalement"] },
      { capacite: "acces-calcule:cle-non-litterale", formes: ["files[files.length - 1]"] },
    ],
    ecart:
      "script de CI (T18, PR 199) : 0040 D2, A8 (amendement A6) ; `execFileSync` permanent ; étalement de `process.env` et " +
      "`files[files.length - 1]` transitoires, retrait par la tâche `release` de 0040 D2 (A8)",
  },
  {
    fichier: "tests/unit/ci/techlead-gate.test.ts",
    portee: "test",
    usage: "test de la porte techlead-gate (dépôt git temporaire)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync", "spawnSync"] }],
    ecart: "fichier modifié par T18 (PR 199) après `40b6738` : ligne ordinaire B, 0040 D4",
  },
  {
    fichier: "tests/unit/ci/techlead-gate-workflow.test.ts",
    portee: "test",
    usage: "test du workflow techlead-gate (étape YAML rejouée par `bash`, ligne de commande `node`)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync", "spawnSync"] }],
    ecart: "fichier apparu avec T18 (PR 199) après `40b6738` : ligne ordinaire B, 0040 D4",
  },
  // Relevé de `ab683eb` (B2, PR 219, fusionnée après la revue du head `eb7e3bf`) : à trancher par le Tech Lead avec verdict
  // Sécurité (0038 TL-5 point 7 : pas d'assouplissement silencieux ; correction du code possible, au choix du Tech Lead).
  {
    fichier: "src/contracts/b2.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : copie d'un objet sans les clés données (`omit`)",
    capacites: [{ capacite: "acces-calcule:type", formes: ["copy[key] (type de clé non admis)"] }],
    ecart: "clé générique `K extends keyof T` (contrainte `string | number | symbol`, refusée par 2.6), B2 (PR 219) : à trancher dans la revue de PR 217",
  },
  {
    fichier: "src/contracts/snapshot.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : `omit` et altération d'un champ d'étape pour un cas négatif",
    capacites: [
      { capacite: "acces-calcule:type", formes: ["copy[key] (type de clé non admis)", "(item.stop as Json)[cle] (objet any/unknown)"] },
    ],
    ecart:
      "clé générique `K extends keyof T` et objet admis seulement par une conversion (0038 TL-5 point 7), B2 (PR 219) : à trancher dans la revue de PR 217",
  },
  {
    fichier: "tests/unit/contracts/derived-storage.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : copie d'un objet sans les clés données (`omit`)",
    capacites: [{ capacite: "acces-calcule:type", formes: ["copy[key] (type de clé non admis)"] }],
    ecart: "clé générique `K extends keyof T` (contrainte `string | number | symbol`, refusée par 2.6), B2 (PR 219) : à trancher dans la revue de PR 217",
  },
  {
    fichier: "tests/unit/contracts/categories.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : paramètre local `module` de `exportedSchemas`",
    capacites: [{ capacite: "identifiant:module", formes: ["declaration", "reference"] }],
    ecart: "paramètre local nommé `module` : identifiant refusé sans analyse de portée (2.3), même cas que 0040 A2, B2 (PR 219) : à trancher dans la revue de PR 217",
  },
] as const satisfies readonly LigneCapacite[];

/** Lignes de textes (hôtes, fragments, noms secrets), lues dans les données du régime. */
export const LIGNES_CAPACITE_TEXTES: readonly LigneCapacite[] = (
  JSON.parse(readFileSync(new URL("../donnees/lignes-textes.json", import.meta.url), "utf8")) as { lignes: readonly LigneCapacite[] }
).lignes;
