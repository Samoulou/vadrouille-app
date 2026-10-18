/**
 * Liste d'autorisation des spécificateurs (spécification P0c, section 6 ; amendement A1 de la décision 0038).
 * Propriété du Tech Lead, verdict Sécurité exigé pour toute modification. Chaque entrée est une ligne au sens de
 * « ligne inutile » : elle doit être importée au moins une fois. Zones : motifs POSIX (`*`, `**`), `@test` (fichiers
 * de test), `@src-non-test` (fichiers non-test de `src/`), `@sensible` (zones sensibles, section 1). Sauf `next`
 * (sous-chemins énumérés, `sousChemins: "exacts"`), un spécificateur couvre ses sous-chemins ; la première entrée
 * qui correspond l'emporte (`node:fs/promises` avant `node:fs`).
 */

import { readFileSync } from "node:fs";

export type LigneSpecificateur = {
  readonly specificateur: string;
  readonly zones: readonly string[];
  readonly sauf?: readonly string[];
  readonly sousChemins?: "exacts";
};

/**
 * Ligne nominative (fichier, spécificateur, noms) : **écart** à la spécification, relevé sur `main` à la base de P0c1,
 * avec le verdict de la décision 0040 (ou à trancher, pour les lignes relevées après elle). Aucun motif de chemin :
 * un fichier, un spécificateur, ses noms importés exacts.
 */
export type LigneSpecificateurNominative = {
  readonly fichier: string;
  readonly specificateur: string;
  /** Noms importés admis, exacts (`type:<nom>` pour un import de type, `default`, `*`, `effet`) : mineur 1, 0040 D2. */
  readonly noms: readonly string[];
  readonly motif: string;
};

const NEUTRES_SAUF = ["@src-non-test", "@sensible"] as const;

/**
 * B3b (ticket 444 ; spécification B3, B3b ; décisions 0007 et 0008) : requêtes paramétrées (`sql`) de la création de
 * compte, de l'organisation personnelle, du verrou et de la purge bornée, de `withOrg` ; `drizzle-orm/node-postgres`
 * (`drizzle.mock`, sans connexion) dans le test des exports. Fichiers nommés, sans motif de dossier (revue du head
 * `f0b8c5a`, mineur 6). Verdict Sécurité : approuvé sur le head `ed79edb` (revue consolidée, PR 446), qui lève la
 * réserve « sous réserve de ce mineur » du head `f0b8c5a` (même revue, mineur 2).
 */
const ZONES_DRIZZLE_B3B = [
  "src/tenancy/creation-compte.ts",
  "src/tenancy/organisations.ts",
  "src/server/auth/index.ts",
  "src/server/with-org.ts",
  "tests/db/with-org.test.ts",
  "tests/unit/auth/operations.test.ts",
];
/** B3b : fichiers nommés qui importent `better-auth` (revue du head `f0b8c5a`, mineur 6 : pas de motif de dossier). */
const ZONES_BETTER_AUTH_B3B = ["src/tenancy/auth.ts", "src/tenancy/adaptateur.ts", "src/tenancy/creation-compte.ts", "src/tenancy/jetons-haches.ts"];

export const SPECIFICATEURS = [
  { specificateur: "react", zones: ["src/**", "tests/unit/**"] },
  { specificateur: "react-dom", zones: ["src/**", "tests/unit/**"] },
  { specificateur: "next", zones: ["src/**", "next.config.ts"], sousChemins: "exacts" },
  { specificateur: "next/link", zones: ["src/**", "next.config.ts"], sousChemins: "exacts" },
  { specificateur: "next/navigation", zones: ["src/**", "next.config.ts"], sousChemins: "exacts" },
  { specificateur: "next/cache", zones: ["src/**", "next.config.ts"], sousChemins: "exacts" },
  { specificateur: "next/headers", zones: ["src/**", "next.config.ts"], sousChemins: "exacts" },
  // `scripts/p0/**` : section 9 (P0a1, `scripts/p0/rapport.ts`).
  { specificateur: "zod", zones: ["src/**", "scripts/p0/**"] },
  { specificateur: "clsx", zones: ["src/lib/**"] },
  { specificateur: "tailwind-merge", zones: ["src/lib/**"] },
  { specificateur: "class-variance-authority", zones: ["src/components/**"] },
  { specificateur: "@radix-ui/react-dialog", zones: ["src/components/**"] },
  { specificateur: "@radix-ui/react-slot", zones: ["src/components/**"] },
  // `vitest.db.config.mts` : projet Vitest de `pnpm test:db` (B1, PR 188, décision 0036 B1-TL-1). Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { specificateur: "vitest", zones: ["@test", "vitest.config.mts", "vitest.db.config.mts"] },
  { specificateur: "@testing-library/react", zones: ["@test"] },
  { specificateur: "@testing-library/jest-dom", zones: ["tests/unit/**"] },
  { specificateur: "axe-core", zones: ["tests/unit/**"] },
  { specificateur: "@playwright/test", zones: ["tests/e2e/**", "tests/visual/**", "tests/perf/**", "playwright.config.ts"] },
  { specificateur: "@axe-core/playwright", zones: ["tests/e2e/**"] },
  { specificateur: "eslint", zones: ["eslint.config.mjs", "eslint-rules/**", "tests/unit/**"] },
  { specificateur: "eslint-config-next", zones: ["eslint.config.mjs", "eslint-rules/**", "tests/unit/**"] },
  { specificateur: "node:fs/promises", zones: ["**"], sauf: NEUTRES_SAUF },
  { specificateur: "node:fs", zones: ["**"], sauf: NEUTRES_SAUF },
  { specificateur: "node:path", zones: ["**"], sauf: NEUTRES_SAUF },
  { specificateur: "node:url", zones: ["**"], sauf: NEUTRES_SAUF },
  { specificateur: "node:os", zones: ["**"], sauf: NEUTRES_SAUF },
  { specificateur: "node:zlib", zones: ["**"], sauf: NEUTRES_SAUF },
  { specificateur: "node:crypto", zones: ["**"], sauf: ["@sensible"] },
  // Section 9 (P0a1) : `scripts/p0/cli.ts`.
  { specificateur: "node:util", zones: ["scripts/p0/**"] },
  // B1 (PR 188, décisions 0006 et 0036 ; spécification P0c, section 9) : paquets sans capacité du socle base de
  // données. `pg` est un module à capacité : lignes nominatives de `listes/capacites.ts`. Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { specificateur: "server-only", zones: ["db/**", "src/server/**", "src/tenancy/**"] },
  { specificateur: "drizzle-orm", zones: ["db/**", ...ZONES_DRIZZLE_B3B] },
  // PR du workflow des migrations (décisions 0056 et 0057 ; Q412, Q419, Q422) ; verdict Sécurité à rendre : analyseur de chaînes de
  // connexion de `pg` (même version), pour le refus de tout hôte non local de `db/migrate.ts` (0056 § 2.8). Sans capacité.
  { specificateur: "pg-connection-string", zones: ["db/migrate.ts"] },
  // B3b (ticket 444 ; spécification B3, B3b point 4 ; décision 0008) : `better-auth` 1.7.7, sous-chemins exacts, dans
  // `src/tenancy/` seulement (`src/server/auth/` n'importe que `@/tenancy/auth` ; même confinement tenu par
  // `ligne/better-auth-confinement`). `node:async_hooks` : contexte d'appel (`AsyncLocalStorage`) de l'adresse du code
  // et de l'état d'envoi, sans capacité. Verdict Sécurité : approuvé sur le head `ed79edb` (revue consolidée, PR 446).
  { specificateur: "better-auth", zones: ZONES_BETTER_AUTH_B3B, sousChemins: "exacts" },
  { specificateur: "better-auth/adapters/drizzle", zones: ZONES_BETTER_AUTH_B3B, sousChemins: "exacts" },
  { specificateur: "better-auth/next-js", zones: ZONES_BETTER_AUTH_B3B, sousChemins: "exacts" },
  { specificateur: "better-auth/plugins", zones: ZONES_BETTER_AUTH_B3B, sousChemins: "exacts" },
  { specificateur: "better-auth/plugins/organization/access", zones: ZONES_BETTER_AUTH_B3B, sousChemins: "exacts" },
  { specificateur: "node:async_hooks", zones: ["src/tenancy/code-otp.ts", "src/server/auth/index.ts"] },
  { specificateur: "drizzle-kit", zones: ["drizzle.config.ts"] },
  // P0r3c-4 (ticket 316, décisions 0009 et 0063) : Workflow SDK, confiné à `src/workflows/` (et `workflow/next` à
  // `next.config.ts`) ; même confinement tenu par `ligne/workflow-directives`. Verdict Sécurité à rendre dans la PR.
  { specificateur: "workflow", zones: ["src/workflows/**", "next.config.ts", "tests/unit/workflows/**"] },
  // B3b-envoi (ticket 435, spécification B3b-envoi, points 1 et 4 ; liste de 0008) : deux sous-chemins **exacts** de
  // `nodemailer` 10.0.16, sans capacité réseau : `MailComposer` (compilation de l'enveloppe) dans `src/server/mail/`,
  // `addressparser` dans le seul test du critère E3. Ni `nodemailer`, ni `createTransport`, ni `smtp-connection`, ni
  // `fetch` : le transport SMTP et le classement en module à capacité suivent dans la PR de `src/server/mail/smtp.ts`.
  // Sécurité : dépendance conforme (lockfile, intégrité, aucun script), lignes exactes demandées par le bloquant 1 de
  // la revue consolidée du head `1b3a97d` (PR 437).
  { specificateur: "nodemailer/lib/mail-composer", zones: ["src/server/mail/**"], sousChemins: "exacts" },
  { specificateur: "nodemailer/lib/addressparser", zones: ["tests/unit/server/email-ip.test.ts"], sousChemins: "exacts" },
  // Amendement A1 de 0038 : zone exacte de la ligne `typescript`.
  // P0r3c-3 (ticket 316) : `tests/unit/p0/composition.test.ts` lit les imports du dépôt sur l'arbre syntaxique (test « seule
  // composition », décision 0055, section 3 point 2), comme `imports.test.ts`. Verdict Sécurité : approuvé sur le head `59878f0` (PR 326).
  // B8c (ticket 438) : `tests/unit/lint/positions-imports.test.ts` applique les règles d'import de 0060 § 1.4 sur l'arbre
  // syntaxique, comme `imports.test.ts`. Verdict Sécurité à rendre.
  { specificateur: "typescript", zones: ["tests/unit/confinement/**", "tests/unit/p0/imports.test.ts", "tests/unit/p0/enregistrer.test.ts", "tests/unit/p0/composition.test.ts", "tests/unit/lint/positions-imports.test.ts"] },
] as const satisfies readonly LigneSpecificateur[];

const CHARGEUR =
  "module de Node dans un fichier non-test de `src/` (section 6) ; lecture bornée et gardée des programmes du prototype (P0b1, PR 208) ; " +
  "justification côté serveur : chargé seulement par `prototype-instance.ts`, derrière `prototypeAdapterAllowed`, jamais dans le navigateur : 0040 D2, A5 (amendement M4)";

const OPENSSL_CONF_0062 =
  "module de Node en zone sensible non-test (section 6 : `zod` seulement), examen synchrone et borné du fichier désigné " +
  "par `OPENSSL_CONF` (`examinerOpensslConf`, appelé par la barrière de sortie seulement) ; décision 0062, sections 6.5 et 7.4 " +
  "(ticket 341) ; aucun autre module de `src/server/env/` n'importe `node:fs` ni `node:path` ; verdict Sécurité à rendre";

const PROTOTYPE_PUR = "`src/prototype/**` (P0a1, PR 180), module pur (`zod`, `@/contracts`), hors des zones admises en zone sensible : 0040 D2, A3 et D3 (amendement M4)";

const SERVER_ONLY_P0R1 =
  "marqueur `server-only` (sans capacité) d'un nouveau module de zone sensible de P0r1, exigé par `ligne/require-server-only` ; " +
  "P0r1 (ticket 267), décisions 0031 § 5 et 0049 C1 ; spécification P0c, section 9 ; verdict Sécurité : approuvé sur le head `353bb20` (PR 272, ticket 267)";
const PORT_P0R1 =
  "port de consommation (contrat seul, jamais une implémentation) importé par un client réel de P0r1 : bloquant 2 de la revue du " +
  "head `335d925`, décisions 0031 § 5, 0046 (D13) et 0049 C1 (point 5) ; spécification P0c, section 9 ; verdict Sécurité : approuvé sur le head `353bb20` (PR 272, ticket 267)" +
  " ; correction 1 de la PR 272 (mutualisation du contexte d'appel et de la demande de réservation, mineur de la revue du head `353bb20` : `demandeDe` et `type:ContexteAppel` remplacent `type:Nature` et `type:Periode`) : verdict Sécurité d'incrément à rendre";
const COMPOSITION_P0R3C =
  "module de composition du mode réel (D18) : câblage seul, garde exigée (type `GardeOuverte`), contexte d'appel et périodes (D20) " +
  "du port de consommation ; P0r3c-3 (ticket 316), décision 0055, section 3 points 1 et 7, avis S-3 ; verdict Sécurité : approuvé sur le head `59878f0` (PR 326)";
const SERVER_ONLY_P0R3C4 =
  "marqueur `server-only` (sans capacité) d'un nouveau module serveur de `p0Run`, exigé par `ligne/require-server-only` ; " +
  "P0r3c-4 (ticket 316), décisions 0009 et 0063 ; verdict Sécurité à rendre";
const P0R3D =
  "P0r3d (ticket 354), décision 0055 section 8 et décision 0063 points 7 et 10 ; verdict Sécurité approuvé (revue consolidée du head `193603d`, PR 357)";
const NOMS_PORT = ["avecReservation", "DELAI_REQUETE_MS", "demandeDe", "horlogeSysteme", "type:ContexteAppel", "type:Horloge", "type:Plafond", "type:PortConsommation"];

const SPECIFICATEURS_NOMINATIFS_TS = [
  {
    fichier: "src/grounding/ancrage.ts",
    specificateur: "@/prototype/ancrage",
    noms: ["type:Ancrage", "type:AncrageResolu", "type:Position", "type:Trajets"],
    motif: PROTOTYPE_PUR,
  },
  { fichier: "src/grounding/ancrage.ts", specificateur: "@/prototype/brief", noms: ["type:Brief"], motif: PROTOTYPE_PUR },
  { fichier: "src/grounding/ancrage.ts", specificateur: "@/prototype/candidat", noms: ["type:Candidat"], motif: PROTOTYPE_PUR },
  // P0r3c-2 (ticket 316) : fonctions d'ancrage, de fiches et de budgets Routes de `p0Run` (décision 0055, section 6
  // points 1, 3 et 4) ; types seuls des modules purs du prototype, comme `src/grounding/ancrage.ts`. Verdict Sécurité : approuvé sur le head `bc0ff4c` (PR 323).
  ...["ancrage-zone", "budget-routes", "fiches-finales", "zone"].map((nom) => ({
    fichier: `src/grounding/${nom}.ts`,
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) d'un nouveau module de `src/grounding` de `p0Run`, exigé par `ligne/require-server-only` " +
      "(module non chargé par `pnpm p0`, hors de la liste fermée d'exceptions) ; P0r3c-2 (ticket 316), décision 0055, section 6 ; verdict Sécurité : approuvé sur le head `bc0ff4c` (PR 323)",
  })),
  // B8c (ticket 438) : port du cache de positions (décision 0060 § 1.1), déclarations de type seules. Verdict Sécurité à rendre.
  {
    fichier: "src/grounding/port-positions.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) du port `PortPositions` de `src/grounding` (types seuls), exigé par `ligne/require-server-only` ; " +
      "B8c (ticket 438), décision 0060 § 1.1 ; verdict Sécurité à rendre",
  },
  // B8a (ticket 462) : modules de production de `src/grounding` (décision 0085 § 1), non chargés par `pnpm p0`.
  // Verdict Sécurité à rendre (PR de B8a).
  ...["ancrage-production", "fiches", "resultat", "trajets"].map((nom) => ({
    fichier: `src/grounding/${nom}.ts`,
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) d'un module de production de `src/grounding` (B8a), exigé par `ligne/require-server-only` " +
      "(module non chargé par `pnpm p0`, hors de la liste fermée d'exceptions) ; B8a (ticket 462), décision 0085 § 1 ; verdict Sécurité à rendre",
  })),
  { fichier: "src/grounding/ancrage-zone.ts", specificateur: "@/prototype/ancrage", noms: ["type:AncrageResolu"], motif: PROTOTYPE_PUR },
  { fichier: "src/grounding/ancrage-zone.ts", specificateur: "@/prototype/brief", noms: ["type:Brief"], motif: PROTOTYPE_PUR },
  { fichier: "src/grounding/ancrage-zone.test.ts", specificateur: "@/prototype/brief", noms: ["BriefSchema", "type:Brief"], motif: PROTOTYPE_PUR },
  { fichier: "src/grounding/budget-routes.ts", specificateur: "@/prototype/ancrage", noms: ["type:Trajets"], motif: PROTOTYPE_PUR },
  { fichier: "src/grounding/fiches-finales.ts", specificateur: "@/prototype/ancrage", noms: ["type:AncrageResolu"], motif: PROTOTYPE_PUR },
  // P0r3c-3 (ticket 316) : recherche web réelle, rédaction des raisons et composition du mode réel (décision 0055,
  // sections 3 et 7). Verdict Sécurité : approuvé sur le head `59878f0` (PR 326).
  ...["src/ai/prompts/recherche-web.ts", "src/ai/recherche-web-reelle.ts", "src/ai/rediger-raisons.ts"].map((fichier) => ({
    fichier,
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) d'un nouveau module de `src/ai` du mode réel, exigé par `ligne/require-server-only` " +
      "(module non chargé par `pnpm p0`, hors de la liste fermée d'exceptions) ; P0r3c-3 (ticket 316), décision 0055, sections 3 et 7 ; verdict Sécurité : approuvé sur le head `59878f0` (PR 326)",
  })),
  // P0r3c-5 (ticket 352) : capacité de notation de l'étape finale (réponse 1 du Tech Lead à la revue de la PR 348 ;
  // amendement A3 de 0055 § 3 point 5). Verdict Sécurité demandé dans la PR du ticket 352.
  {
    fichier: "src/ai/noter-candidats.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) d'un nouveau module de `src/ai` du mode réel, exigé par `ligne/require-server-only` " +
      "(module non chargé par `pnpm p0`, hors de la liste fermée d'exceptions) ; P0r3c-5 (ticket 352), amendement A3 de 0055 § 3 point 5 ; verdict Sécurité demandé (PR du ticket 352)",
  },
  // B7a (ticket 423, décision 0077 § 1 et § 2) : `src/ai` et `src/research` n'importent plus rien de `src/prototype`
  // (lignes `PROTOTYPE_PUR` de ces dossiers retirées, 0077 § 1 point 7) ; nouveaux modules de la couche IA non chargés
  // par `pnpm p0`, marqueur `server-only` seul. Verdict Sécurité demandé dans la PR de B7a.
  ...["src/ai/complement-p0.ts", "src/ai/couche.ts", "src/ai/entrees.ts", "src/ai/natures.ts", "src/research/bornes.ts"].map((fichier) => ({
    fichier,
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) d'un nouveau module de la couche IA, exigé par `ligne/require-server-only` " +
      "(module non chargé par `pnpm p0`, hors de la liste fermée d'exceptions) ; B7a (ticket 423), décision 0077 § 1 et § 2 ; verdict Sécurité demandé (PR de B7a)",
  })),
  // B7c (ticket 449 ; spécification B7, B7c point 4) : harnais du jeu d'évaluation `evals/`, non chargé par `pnpm p0`
  // ni par l'application, marqueur `server-only` seul. Verdict Sécurité demandé dans la PR de B7c (PR 454).
  {
    fichier: "src/research/evaluation.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) d'un nouveau module de `src/research` (harnais d'`evals/`), exigé par `ligne/require-server-only` " +
      "(module non chargé par `pnpm p0`, hors de la liste fermée d'exceptions) ; B7c (ticket 449), spécification B7, B7c point 4, décision 0077 § 2 (liste blanche de `src/research`) ; verdict Sécurité demandé (PR 454)",
  },
  {
    fichier: "src/research/extract-text.ts",
    specificateur: "parse5",
    noms: ["parse"],
    motif: "paquet `parse5` (P0a1, PR 180) en zone sensible non-test, où la section 6 n'admet que `zod` : 0040 D2, A3 (amendement M4)",
  },
  {
    fichier: "src/research/fetch-page.test.ts",
    specificateur: "node:zlib",
    noms: ["gzipSync"],
    motif: "test de zone sensible (section 6 : `vitest`, `zod`, `node:fs`, `node:path` seulement), compression des corps de test (PR 180) : 0040 D2, A3",
  },
  {
    fichier: "src/adapters/prototype-loader.ts",
    specificateur: "node:fs",
    noms: ["constants"],
    motif: CHARGEUR,
  },
  {
    fichier: "src/adapters/prototype-loader.ts",
    specificateur: "node:fs/promises",
    noms: ["lstat", "open", "readdir", "realpath"],
    motif: CHARGEUR,
  },
  {
    fichier: "src/adapters/prototype-loader.ts",
    specificateur: "node:path",
    noms: ["isAbsolute", "join", "resolve"],
    motif: CHARGEUR,
  },
  // Relevé de `ab683eb` (B2, PR 219, fusionnée après la revue du head `eb7e3bf`) : `zod` hors de `src/**` (section 6).
  // Accepté par 0040 D6 en lignes nominatives par fichier ; la zone de `zod` n'est pas élargie à `tests/unit/**`.
  {
    fichier: "tests/unit/contracts/categories.test.ts",
    specificateur: "zod",
    noms: ["z"],
    motif: "`zod` dans un test de contrats hors de `src/**` (B2, PR 219) : 0040 D6, accepté en ligne nominative, permanent ; zone de `zod` non élargie",
  },
  {
    fichier: "tests/unit/contracts/derived-storage.test.ts",
    specificateur: "zod",
    noms: ["type:z"],
    motif: "`zod` dans un test de contrats hors de `src/**` (B2, PR 219) : 0040 D6, accepté en ligne nominative, permanent ; zone de `zod` non élargie",
  },
  // P0r1 (ticket 267). Les lignes du client de modèles, dont le chemin contient un fragment surveillé, sont dans
  // `donnees/lignes-textes-specificateurs.json`.
  { fichier: "src/grounding/places-client.ts", specificateur: "server-only", noms: ["effet"], motif: SERVER_ONLY_P0R1 },
  { fichier: "src/grounding/places-client.ts", specificateur: "@/server/usage/port", noms: [...NOMS_PORT, "type:DemandeReservation"], motif: PORT_P0R1 },
  { fichier: "src/grounding/routes-client.ts", specificateur: "server-only", noms: ["effet"], motif: SERVER_ONLY_P0R1 },
  { fichier: "src/grounding/routes-client.ts", specificateur: "@/server/usage/port", noms: NOMS_PORT, motif: PORT_P0R1 },
  { fichier: "src/grounding/enveloppe-google.ts", specificateur: "server-only", noms: ["effet"], motif: SERVER_ONLY_P0R1 },
  { fichier: "src/research/undici-transport.ts", specificateur: "server-only", noms: ["effet"], motif: SERVER_ONLY_P0R1 },
  { fichier: "src/server/env/ai.ts", specificateur: "server-only", noms: ["effet"], motif: SERVER_ONLY_P0R1 },
  { fichier: "src/server/env/grounding.ts", specificateur: "server-only", noms: ["effet"], motif: SERVER_ONLY_P0R1 },
  { fichier: "src/server/env/egress.ts", specificateur: "server-only", noms: ["effet"], motif: SERVER_ONLY_P0R1 },
  // Décision 0062 (ticket 341) : les deux lignes nominatives de la section 6.5, puis le marqueur `server-only` exigé par
  // la section 7.1 et par `ligne/require-server-only` (ligne non prévue par 0062 § 7.4 : verdict Sécurité demandé).
  {
    fichier: "src/server/env/openssl-conf.ts",
    specificateur: "node:fs",
    noms: ["lstatSync", "readFileSync", "readdirSync", "realpathSync"],
    motif: OPENSSL_CONF_0062,
  },
  { fichier: "src/server/env/openssl-conf.ts", specificateur: "node:path", noms: ["posix"], motif: OPENSSL_CONF_0062 },
  {
    fichier: "src/server/env/openssl-conf.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) du module d'examen d'`OPENSSL_CONF`, zone sensible, exigé par 0062 § 7.1 et " +
      "`ligne/require-server-only` ; ligne non listée par 0062 § 7.4 (ticket 341) ; verdict Sécurité à rendre",
  },
  {
    fichier: "src/server/env/index.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) du module d'environnement du serveur de B3a, zone sensible, exigé par " +
      "`ligne/require-server-only` ; décision 0050, « Lignes du régime de confinement » ; verdict Sécurité : plafond accepté par 0051 point 6.7 (ticket 293)",
  },
  {
    fichier: "src/server/env/p0.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) du module étroit du mode réel, zone sensible, exigé par `ligne/require-server-only` ; " +
      "P0r3b (ticket 311), décision 0055, section 1 point 2 ; verdict Sécurité à rendre",
  },
  {
    fichier: "src/adapters/prototype-ecriture.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) du module d'écriture des positions du prototype, exigé par 0052 § 1.10 " +
      "(« le module commence par import \"server-only\" ») ; P0r3c (ticket 316, PR 318), décision 0055, section 8 ; verdict Sécurité : accordée (revue consolidée de la PR 318, head ea7cc37)",
  },
  {
    fichier: "src/contracts/prototype-ecriture.ts",
    specificateur: "@/prototype/programme-reduit",
    noms: ["type:ProgrammeReduit"],
    motif:
      "type seul (`import type`) du programme réduit dans le contrat d'écriture du prototype (0052 § 1.10) ; " +
      PROTOTYPE_PUR +
      " ; P0r3c (ticket 316, PR 318) ; verdict Sécurité : accordée (revue consolidée de la PR 318, head ea7cc37)",
  },
  // P0r3c-3 (ticket 316) : module de composition du mode réel (D18, décision 0055, section 3 point 7) : les lignes que
  // l'analyseur relève pour `p0-reel.ts`, et rien d'autre. Verdict Sécurité : approuvé sur le head `59878f0` (PR 326).
  {
    fichier: "src/server/composition/p0-reel.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif: COMPOSITION_P0R3C,
  },
  {
    fichier: "src/server/composition/p0-reel.ts",
    specificateur: "@/prototype/config",
    noms: ["moteurRechercheWebAttendu", "type:MoteurRechercheWeb", "type:Routage"],
    motif: `${PROTOTYPE_PUR} ; ${COMPOSITION_P0R3C} ; moteur du greffon web contrôlé à la construction (bloquant 1c de la PR 326)`,
  },
  {
    fichier: "src/server/composition/p0-reel.ts",
    specificateur: "@/server/p0/garde",
    noms: ["type:GardeOuverte", "type:GardeRelecture"],
    motif: `${COMPOSITION_P0R3C} ; \`GardeRelecture\` : preuve exigée par \`composerRelecture\` (P0r4, ticket 414, décision 0079 ; preuve protégée comme \`GardeOuverte\` depuis la correction 1 de la PR 419 ; verdict Sécurité demandé sur le head de cette correction)`,
  },
  { fichier: "src/server/composition/p0-reel.ts", specificateur: "@/server/usage/periodes", noms: ["periodesDe"], motif: COMPOSITION_P0R3C },
  {
    fichier: "src/server/composition/p0-reel.ts",
    specificateur: "@/server/usage/port",
    noms: ["horlogeSysteme", "type:ContexteAppel", "type:Fournisseur", "type:Horloge", "type:Plafond", "type:PortConsommation"],
    motif: COMPOSITION_P0R3C,
  },
  // P0r3c-4 (ticket 316) : workflow `p0Run`, son interface stable, l'adaptateur de la table de travail et les plafonds de
  // l'agent (décisions 0009 et 0063). Verdict Sécurité à rendre dans la PR.
  ...["src/workflows/index.ts", "src/workflows/p0-run.ts", "src/adapters/prototype-travail.ts", "src/research/plafonds-agent.ts"].map((fichier) => ({
    fichier,
    specificateur: "server-only",
    noms: ["effet"],
    motif: SERVER_ONLY_P0R3C4,
  })),
  // P0r3d (ticket 354) : lecture du suivi des exécutions (page de lancement) et interrupteur de démarrage de `p0Run`,
  // marqueurs `server-only` sans capacité.
  ...["src/adapters/prototype-suivi.ts", "src/workflows/complet.ts"].map((fichier) => ({
    fichier,
    specificateur: "server-only",
    noms: ["effet"],
    motif: `marqueur \`server-only\` (sans capacité) d'un nouveau module serveur du lancement, exigé par \`ligne/require-server-only\` ; ${P0R3D}`,
  })),
  // Ticket 403 (décision 0074) : source des programmes réels de l'adaptateur `prototype`, lecture seule, sans capacité
  // propre (pool et barrière injectés). Verdict Sécurité : demandé sur le head de la correction 1 de la PR 406.
  {
    fichier: "src/adapters/prototype-lecture.ts",
    specificateur: "server-only",
    noms: ["effet"],
    motif:
      "marqueur `server-only` (sans capacité) de la source des programmes réels (lecture seule de `prototype.programmes`, " +
      "pool et barrière injectés) ; ticket 403, décision 0074 ; verdict Sécurité : demandé sur le head de la correction 1 de la PR 406",
  },
  {
    fichier: "tests/unit/server/env.test.ts",
    specificateur: "node:util",
    noms: ["inspect"],
    motif:
      "`util.inspect(error)` du critère A1 exigé par 0051 point 6.5 (aucune valeur sentinelle dans `util.inspect` d'un refus) ; " +
      "B3a, ticket 293 ; ligne au-delà du plafond de 0050 : verdict Sécurité écrit exigé dans la PR de B3a (0051 point 6.7.7), à rendre",
  },
] as const satisfies readonly LigneSpecificateurNominative[];

/**
 * Lignes nominatives dont le chemin ou le spécificateur contient un hôte ou un fragment surveillé (P0r1 : client de
 * modèles), lues dans `donnees/lignes-textes-specificateurs.json`, extension non analysée (section 1, « Données du
 * régime »), comme `donnees/lignes-textes.json` pour les capacités.
 */
const DONNEES_TEXTES = JSON.parse(readFileSync(new URL("../donnees/lignes-textes-specificateurs.json", import.meta.url), "utf8")) as {
  readonly nominatifs: readonly LigneSpecificateurNominative[];
  readonly paquets: readonly { readonly paquet: string; readonly usage: string; readonly verdict: string }[];
};

export const SPECIFICATEURS_NOMINATIFS: readonly LigneSpecificateurNominative[] = [...SPECIFICATEURS_NOMINATIFS_TS, ...DONNEES_TEXTES.nominatifs];

/** Paquets dont le nom contient un fragment surveillé, lus dans les mêmes données (fusionnés par `listes/paquets.ts`). */
export const PAQUETS_TEXTES = DONNEES_TEXTES.paquets;
