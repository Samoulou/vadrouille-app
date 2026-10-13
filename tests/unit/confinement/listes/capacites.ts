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
  readonly capacites: readonly { readonly capacite: string; readonly formes: readonly string[] }[];
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

  // --- Écarts relevés à la base de P0c1 (après `40b6738`), à trancher par le Tech Lead avec verdict Sécurité ------
  {
    fichier: "src/research/ip-guard.ts",
    portee: "application",
    usage: "garde d'adresses IP de la lecture de pages (P0a1) : `isIP` et `BlockList`, aucune connexion",
    capacites: [{ capacite: "module:node:net", formes: ["BlockList", "isIP"] }],
    ecart: "module à capacité dans une zone sensible, absent du tableau de la section 3 (P0a1, PR 180)",
  },
  {
    fichier: "src/adapters/prototype-loader.test.ts",
    portee: "test",
    usage: "test du chargeur de programmes du prototype (P0b1)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync"] }],
    ecart: "fichier apparu après `40b6738` (P0b1)",
  },
  {
    fichier: "tests/unit/ci/post-merge-cleanup.test.ts",
    portee: "test",
    usage: "test du nettoyage après fusion",
    capacites: [{ capacite: "module:node:child_process", formes: ["spawnSync"] }],
    ecart: "fichier apparu après `40b6738`",
  },
  {
    fichier: "tests/unit/p0/depot.test.ts",
    portee: "test",
    usage: "test de P0a1 : aucun secret dans les fichiers suivis (`git ls-files`)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync"] }],
    ecart: "fichier de P0a1 (PR 180), section 9",
  },
  {
    fichier: "src/research/fetch-page.test.ts",
    portee: "test",
    usage: "doubles du résolveur et de la couche HTTP de la lecture de pages (P0a1)",
    capacites: [{ capacite: "acces-calcule:cle-non-litterale", formes: ["table[hote]", "pages[`https://${requete.nomHote}${requete.chemin}`]"] }],
    ecart: "accès calculés à clé non littérale dans un test de zone sensible, refusés par la règle fermée de 2.6 ; types `Record<string, …>`",
  },
  {
    fichier: "tests/unit/p0/imports.test.ts",
    portee: "test",
    usage: "test d'imports de la PR 149 (P0a1), non modifiable par P0c1 (0038, TL-2 point 1)",
    capacites: [{ capacite: "identifiant:module", formes: ["declaration", "reference"] }],
    ecart: "paramètre local nommé `module` (l. 367) : identifiant refusé sans analyse de portée (2.3)",
  },
  {
    fichier: "tests/unit/p0/cli.test.ts",
    portee: "test",
    usage: "test de `pnpm p0` (P0a1) : espionne les modules réseau et surveille les lectures de `process.env`",
    capacites: [
      { capacite: "module:node:child_process", formes: ["spawnSync"] },
      { capacite: "module:node:dns", formes: ["default"] },
      { capacite: "module:node:http", formes: ["default"] },
      { capacite: "module:node:https", formes: ["default"] },
      { capacite: "module:node:net", formes: ["default"] },
      { capacite: "module:node:tls", formes: ["default"] },
      { capacite: "identifiant:fetch", formes: ["declaration", "reference"] },
      { capacite: "reflexion:Proxy", formes: ["toute forme"] },
      { capacite: "reflexion:Reflect", formes: ["toute forme"] },
      { capacite: "environnement:usage", formes: ["process.env"] },
      { capacite: "environnement:ecriture", formes: ["process.env"] },
      { capacite: "environnement:acces-calcule", formes: ["nom"] },
      { capacite: "regime-tests:stubEnv-non-litteral", formes: ["vi.stubEnv(nom, `valeur-de-test-${nom}`)"] },
    ],
    ecart:
      "fichier de P0a1 (PR 180) contraire au régime : imports réels de modules réseau (espionnés), `Proxy` et `Reflect` " +
      "(2.4, sans exception possible), écriture de `process.env`, `vi.stubEnv` de noms secrets à valeurs factices",
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
    ecart: "accès calculé admis seulement par la conversion de l'objet (`unknown` converti en `Record`) : 0038, TL-5 point 7",
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
      "script de CI hors du tableau de la section 3 ; étalement de `process.env` hors d'un fichier de test (section 5, forme 3) ; " +
      "accès calculé numérique refusé par la règle fermée de 2.6 (fichier hors programme)",
  },
  {
    fichier: "tests/unit/ci/techlead-gate.test.ts",
    portee: "test",
    usage: "test de la porte techlead-gate (dépôt git temporaire)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync", "spawnSync"] }],
    ecart: "fichier modifié par T18 (PR 199) après `40b6738`",
  },
  {
    fichier: "tests/unit/ci/techlead-gate-workflow.test.ts",
    portee: "test",
    usage: "test du workflow techlead-gate (étape YAML rejouée par `bash`, ligne de commande `node`)",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync", "spawnSync"] }],
    ecart: "fichier apparu avec T18 (PR 199) après `40b6738`",
  },
] as const satisfies readonly LigneCapacite[];

/** Lignes de textes (hôtes, fragments, noms secrets), lues dans les données du régime. */
export const LIGNES_CAPACITE_TEXTES: readonly LigneCapacite[] = (
  JSON.parse(readFileSync(new URL("../donnees/lignes-textes.json", import.meta.url), "utf8")) as { lignes: readonly LigneCapacite[] }
).lignes;
