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
    fichier: "tests/unit/p0/imports.test.ts",
    portee: "test",
    usage: "test d'imports de PR 149 (P0a1), non modifiable par P0c1 (0038, TL-2 point 1)",
    capacites: [{ capacite: "identifiant:module", formes: ["declaration", "reference"] }],
    ecart: "paramètre local nommé `module` : identifiant refusé sans analyse de portée (2.3) : 0040 D2, A2 (permanente)",
  },
  {
    fichier: "tests/unit/p0/cli.test.ts",
    portee: "test",
    usage:
      "test de `pnpm p0` (P0a1) : sous-processus `spawnSync(\"pnpm\", [\"-s\", \"p0\", …])` sans `shell`, arguments `pnpm` et `p0` " +
      "fixes, environnement littéral (`NODE_ENV` et variables système lues par propriété littérale, aucune variable de clé)",
    capacites: [{ capacite: "module:node:child_process", formes: ["spawnSync"], nombre: 1 }],
    ecart: "sous-processus dans un test (section 4), fichier de P0a1 (PR 180) : ligne ordinaire, décision du Tech Lead 0042 ; ticket 221",
  },
  // Relevé de `f57153c` (T18, PR 199, fusionnée après la décision 0038).
  {
    fichier: "scripts/ci/techlead-gate.mjs",
    portee: "outil",
    usage: "porte techlead-gate (0035) : `git cat-file` et `git ls-tree` sur le clone, environnement restreint à `PATH`, `HOME` et `GIT_LITERAL_PATHSPECS`",
    capacites: [{ capacite: "module:node:child_process", formes: ["execFileSync"] }],
    ecart: "script de CI (T18, PR 199) : 0040 D2, A8 ; `execFileSync` permanent (outil)",
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
  // Relevé de `ab683eb` (B2, PR 219, fusionnée après la revue du head `eb7e3bf`) : accepté par 0040 D6 (lignes nominatives,
  // exactes et bornées ; aucune règle élargie ; verdict Sécurité non requis, portée test).
  {
    fichier: "src/contracts/b2.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : copie d'un objet sans les clés données (`omit`)",
    capacites: [{ capacite: "acces-calcule:type", formes: ["copy[key] (type de clé non admis)"], nombre: 1 }],
    ecart: "clé générique `K extends keyof T` (contrainte `string | number | symbol`, refusée par 2.6), B2 (PR 219) : 0040 D6, accepté, permanent (portée test, ensemble de clés fini et typé)",
  },
  {
    fichier: "src/contracts/snapshot.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : `omit` et altération d'un champ d'étape pour un cas négatif",
    capacites: [
      { capacite: "acces-calcule:type", formes: ["copy[key] (type de clé non admis)", "(item.stop as Json)[cle] (objet any/unknown)"], nombre: 1 },
    ],
    ecart:
      "clé générique `K extends keyof T` et objet admis seulement par une conversion (0038 TL-5 point 7), B2 (PR 219) : 0040 D6, accepté, permanent (même régime que 0040 A7)",
  },
  {
    fichier: "tests/unit/contracts/derived-storage.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : copie d'un objet sans les clés données (`omit`)",
    capacites: [{ capacite: "acces-calcule:type", formes: ["copy[key] (type de clé non admis)"], nombre: 1 }],
    ecart: "clé générique `K extends keyof T` (contrainte `string | number | symbol`, refusée par 2.6), B2 (PR 219) : 0040 D6, accepté, permanent (portée test, ensemble de clés fini et typé)",
  },
  {
    fichier: "tests/unit/contracts/categories.test.ts",
    portee: "test",
    usage: "test des contrats de B2 : paramètre local `module` de `exportedSchemas`",
    capacites: [{ capacite: "identifiant:module", formes: ["declaration", "reference"], nombre: 1 }],
    ecart: "paramètre local nommé `module` : identifiant refusé sans analyse de portée (2.3), même cas que 0040 A2, B2 (PR 219) : 0040 D6, accepté, permanent (« ligne inutile » la retire si le paramètre est renommé)",
  },
  // Relevé de la mise à jour avec `main` après F10b (PR 212, fusionnée à 09:30 UTC le 2026-10-13, après la revue du
  // head `eb7e3bf`) : lignes exactes et bornées en nombre, tranchées par 0040 D6 (aucune règle élargie). Les lignes de
  // portée application et `playwright.config.ts` ont reçu le verdict Sécurité de la revue consolidée du head `ad0b008`
  // (sous condition de son bloquant 2 pour la portée application). `node:vm` n'est
  // plus utilisé par `tests/unit/sw-route.test.ts` (chargement par `vi.stubGlobal("self", …)` et `import()` littéral) :
  // sa ligne est retirée (revue du head `ad0b008`, bloquant 3).
  {
    fichier: "public/sw.js",
    portee: "application",
    usage:
      "service worker de la page de repli (F10b, F10-TL-4) : charge `public/sw-route.js` et sert `/hors-ligne` quand une navigation " +
      "échoue (aucune autre origine, aucune donnée du voyage, selon F10-PO-11). Justification navigateur : `importScripts` d'un " +
      "texte littéral de même origine ; `fetch` de la même origine ou de la requête interceptée, sans en-tête ni secret ajouté " +
      "(`credentials: \"omit\"` pour la mise en cache)",
    capacites: [
      { capacite: "fichier:mode-non-strict", formes: [".js"], nombre: 1 },
      { capacite: "identifiant:importScripts", formes: ["reference"], nombre: 1 },
      { capacite: "identifiant:fetch", formes: ["reference"], nombre: 4 },
    ],
    ecart: "script classique `.js` (section 1), `fetch` et `importScripts` dans le service worker, F10b (PR 212) : 0040 D6 ; verdict Sécurité : accepté par la revue consolidée du head `ad0b008`, sous condition de la correction de son bloquant 2",
  },
  {
    fichier: "public/sw-route.js",
    portee: "application",
    usage:
      "aiguillage pur du service worker (F10b), chargé par `importScripts` dans `public/sw.js` ; publie ses fonctions sur `self`. " +
      "Justification navigateur : accès calculé sur un objet local, `self` seulement pour publier ses fonctions",
    capacites: [
      { capacite: "fichier:mode-non-strict", formes: [".js"], nombre: 1 },
      { capacite: "acces-calcule:cle-non-litterale", formes: ["found[url.pathname + url.search]"], nombre: 1 },
      { capacite: "global:self", formes: ["autre"], nombre: 1 },
    ],
    ecart: "script classique `.js` (section 1), accès calculé (2.6, règle fermée) et `self` passé en argument (2.3), F10b (PR 212) : 0040 D6 ; verdict Sécurité : accepté par la revue consolidée du head `ad0b008`, sous condition de la correction de son bloquant 2",
  },
  {
    fichier: "src/lib/offline/register.ts",
    portee: "application",
    usage:
      "enregistrement du service worker (F10b) : `window` comme valeur par défaut du paramètre `env` de `registerOfflineFallback`. " +
      "Justification navigateur : `window` n'est lu que pour enregistrer le service worker",
    capacites: [{ capacite: "global:window", formes: ["autre"], nombre: 1 }],
    ecart: "objet global passé comme valeur (2.3), F10b (PR 212) : 0040 D6 ; verdict Sécurité : accepté par la revue consolidée du head `ad0b008`, sous condition de la correction de son bloquant 2",
  },
  {
    fichier: "scripts/icones-provisoires.mjs",
    portee: "outil",
    usage: "génération des icônes provisoires (F10b) : tables d'octets indexées par des nombres calculés",
    capacites: [
      {
        capacite: "acces-calcule:cle-non-litterale",
        formes: ["CRC_TABLE[(c ^ byte) & 0xff]", "row[1 + px * 3 + i]", "background[i]", "foreground[i]"],
        nombre: 1,
      },
    ],
    ecart: "accès calculés numériques refusés par la règle fermée de 2.6 (fichier hors programme), F10b (PR 212) : 0040 D6, accepté, permanent (outil de génération, hors application)",
  },
  {
    fichier: "playwright.config.ts",
    portee: "outil",
    usage: "drapeau Playwright des requêtes réseau des service workers (F10b, F10-TL-6), posé pour le processus principal et ses workers",
    capacites: [{ capacite: "environnement:ecriture", formes: ["PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS"], nombre: 1 }],
    ecart:
      "écriture de `process.env` (section 5, refusée hors `vi.stubEnv`), F10b (PR 212) : 0040 D6, permanent (nom littéral non secret, " +
      "valeur constante) ; verdict Sécurité : accepté par la revue consolidée du head `ad0b008`",
  },
  {
    fichier: "tests/e2e/hors-ligne.e2e.spec.ts",
    portee: "test",
    usage: "vérifie dans le service worker qu'une requête vers Google échoue (`fetch` évalué dans le worker par Playwright)",
    capacites: [{ capacite: "identifiant:fetch", formes: ["reference"], nombre: 1 }],
    ecart: "appel `fetch` réel (section 4) dans un test e2e, F10b (PR 212) : 0040 D6, accepté, permanent (portée test ; sentinelle : le worker ne met pas en cache les requêtes Google)",
  },
  // B1 (PR 188, fusionnée le 2026-10-13, `d1ba047`, après P0c1) : lignes attendues par la spécification P0c, section 9,
  // relevées par la PR du ticket 242. Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242) pour chacune.
  {
    fichier: "db/connection.ts",
    portee: "application",
    usage:
      "pool de connexion gardé des rôles applicatifs (spécification B1, « Garde de connexion »). Justification côté serveur : " +
      "module `server-only`, jamais dans le navigateur ; refus en production (0034) et de tout rôle autre que celui attendu, " +
      "ou qui a SUPERUSER ou BYPASSRLS, avant toute requête",
    capacites: [{ capacite: "module:pg", formes: ["default"], nombre: 1 }],
    ecart: "module à capacité `pg` (section 3) dans le module de connexion de B1 (décisions 0006, 0036) : spécification P0c, section 9 ; verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242)",
  },
  {
    fichier: "db/migrate.ts",
    portee: "application",
    usage:
      "application des migrations sous `vadrouille_migrator` (`pnpm db:migrate`). Justification côté serveur : module " +
      "`server-only` lancé par Node hors de Next, importé par aucun fichier de l'application ; même garde de rôle que " +
      "`db/connection.ts`. Portée application parce que le fichier est sous `db/` (fermeture transitive, section 3)",
    capacites: [{ capacite: "module:pg", formes: ["default"], nombre: 1 }],
    ecart: "module à capacité `pg` (section 3) dans l'outil de migration de B1 (décisions 0006, 0007) : spécification P0c, section 9 ; verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242)",
  },
  {
    fichier: "scripts/test-db.mjs",
    portee: "outil",
    usage: "`pnpm test:db` : lance `pnpm exec vitest run --config vitest.db.config.mts` sans `shell`, après le refus de `SKIP_DB_TESTS` en CI",
    capacites: [{ capacite: "module:node:child_process", formes: ["spawnSync"], nombre: 1 }],
    ecart: "script de B1 (décision 0036, B1-TL-1) : spécification P0c, section 9 ; verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242)",
  },
  {
    fichier: "tests/db/global-setup.ts",
    portee: "test",
    usage: "préalable de `pnpm test:db` : une connexion réelle par rôle à la base de test (conteneur de CI), message explicite sans base",
    capacites: [{ capacite: "module:pg", formes: ["default"], nombre: 1 }],
    ecart: "connexion réelle dans un test (section 4), tests de base de B1 (décisions 0006, 0036) : verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242)",
  },
  {
    fichier: "tests/db/helpers.ts",
    portee: "test",
    usage: "outils des tests de base : connexions réelles à la base de test sous le rôle éprouvé ; seul fichier de `tests/db/*.test.ts` qui importe `pg`",
    capacites: [{ capacite: "module:pg", formes: ["default"], nombre: 1 }],
    ecart: "connexion réelle dans un test (section 4), tests de base de B1 (décisions 0006, 0036) : verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242)",
  },
  {
    fichier: "tests/unit/db/garde-connexion.test.ts",
    portee: "test",
    usage: "test de la garde de connexion sans base : espions sur `pg.Client.prototype` (`connect`, `end`, `query`), adresse injoignable (port 1)",
    capacites: [{ capacite: "module:pg", formes: ["default"], nombre: 1 }],
    ecart: "import réel d'un module à capacité dans un test (section 4), B1 (décision 0034, garde de production) : verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242)",
  },
  {
    fichier: "tests/unit/db/test-db-sans-base.test.ts",
    portee: "test",
    usage: "lance `node scripts/test-db.mjs` sans base joignable (environnement réduit à `PATH`, `HOME` et aux variables du cas)",
    capacites: [{ capacite: "module:node:child_process", formes: ["spawnSync"], nombre: 1 }],
    ecart: "sous-processus dans un test (section 4), critère « sans base joignable » de B1 (décisions 0006, 0036) : verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242)",
  },
  // P0r1 (ticket 267 ; spécification de P0r1, « Modules de capacité réseau » ; décision 0031 § 5 ; spécification P0c,
  // section 9). Les lignes dont la forme contient un hôte ou un fragment surveillé (client de modèles, hôtes Google)
  // sont dans `donnees/lignes-textes.json`. Verdict Sécurité à rendre sur la PR de P0r1.
  {
    fichier: "src/research/undici-transport.ts",
    portee: "application",
    usage:
      "transport réel de la lecture des pages (P0r1), injecté dans `fetch-page.ts` et branché à aucun point d'entrée : un `Agent` " +
      "par saut dont `connect.lookup` rend l'adresse vérifiée, résolveur réel `lookup` (`all: true`). Justification côté serveur : " +
      "module `server-only`, importé seulement par ses tests (fermeture `fermeture-module-p0r1`)",
    capacites: [
      { capacite: "module:undici", formes: ["Agent"], nombre: 1 },
      { capacite: "module:node:dns", formes: ["lookup"], nombre: 1 },
    ],
    ecart: "module de capacité de P0r1 (décision 0031 § 5 ; spécification P0c, section 9) : verdict Sécurité à rendre sur la PR de P0r1 (ticket 267)",
  },
  {
    fichier: "src/grounding/places-client.ts",
    portee: "application",
    usage:
      "client réel de Places (P0r1), branché à aucun point d'entrée : `fetch` global seulement comme valeur par défaut du paramètre " +
      "`transport` de `createPlacesClient`, toujours appelé à travers l'enveloppe. Justification côté serveur : module `server-only`",
    capacites: [{ capacite: "identifiant:fetch", formes: ["reference"], nombre: 1 }],
    ecart: "module de capacité de P0r1 (décision 0031 § 5 ; spécification P0c, section 9) : verdict Sécurité à rendre sur la PR de P0r1 (ticket 267)",
  },
  {
    fichier: "src/grounding/routes-client.ts",
    portee: "application",
    usage:
      "client réel de Routes (P0r1), branché à aucun point d'entrée : `fetch` global seulement comme valeur par défaut du paramètre " +
      "`transport` de `createRoutesClient`, toujours appelé à travers l'enveloppe. Justification côté serveur : module `server-only`",
    capacites: [{ capacite: "identifiant:fetch", formes: ["reference"], nombre: 1 }],
    ecart: "module de capacité de P0r1 (décision 0031 § 5 ; spécification P0c, section 9) : verdict Sécurité à rendre sur la PR de P0r1 (ticket 267)",
  },
] as const satisfies readonly LigneCapacite[];

/** Lignes de textes (hôtes, fragments, noms secrets), lues dans les données du régime. */
export const LIGNES_CAPACITE_TEXTES: readonly LigneCapacite[] = (
  JSON.parse(readFileSync(new URL("../donnees/lignes-textes.json", import.meta.url), "utf8")) as { lignes: readonly LigneCapacite[] }
).lignes;
