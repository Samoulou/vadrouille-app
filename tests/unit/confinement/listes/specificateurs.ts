/**
 * Liste d'autorisation des spécificateurs (spécification P0c, section 6 ; amendement A1 de la décision 0038).
 * Propriété du Tech Lead, verdict Sécurité exigé pour toute modification. Chaque entrée est une ligne au sens de
 * « ligne inutile » : elle doit être importée au moins une fois. Zones : motifs POSIX (`*`, `**`), `@test` (fichiers
 * de test), `@src-non-test` (fichiers non-test de `src/`), `@sensible` (zones sensibles, section 1). Sauf `next`
 * (sous-chemins énumérés, `sousChemins: "exacts"`), un spécificateur couvre ses sous-chemins ; la première entrée
 * qui correspond l'emporte (`node:fs/promises` avant `node:fs`).
 */

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
  { specificateur: "vitest", zones: ["@test", "vitest.config.mts"] },
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
  // Amendement A1 de 0038 : zone exacte de la ligne `typescript`.
  { specificateur: "typescript", zones: ["tests/unit/confinement/**", "tests/unit/p0/imports.test.ts", "tests/unit/p0/enregistrer.test.ts"] },
] as const satisfies readonly LigneSpecificateur[];

const CHARGEUR =
  "module de Node dans un fichier non-test de `src/` (section 6) ; lecture bornée et gardée des programmes du prototype (P0b1, PR 208) ; " +
  "justification côté serveur : chargé seulement par `prototype-instance.ts`, derrière `prototypeAdapterAllowed`, jamais dans le navigateur : 0040 D2, A5 (amendement A7)";

const PROTOTYPE_PUR = "`src/prototype/**` (P0a1, PR 180), module pur (`zod`, `@/contracts`), hors des zones admises en zone sensible : 0040 D2, A3 et D3 (amendement A7)";

export const SPECIFICATEURS_NOMINATIFS = [
  { fichier: "src/ai/ai.test.ts", specificateur: "@/prototype/brief", noms: ["type:Brief"], motif: PROTOTYPE_PUR },
  { fichier: "src/ai/ai.test.ts", specificateur: "@/prototype/candidat", noms: ["type:Candidat"], motif: PROTOTYPE_PUR },
  { fichier: "src/ai/client.ts", specificateur: "@/prototype/config", noms: ["MODELE_ID_PATTERN", "type:Routage"], motif: PROTOTYPE_PUR },
  { fichier: "src/ai/modeles.simule.ts", specificateur: "@/prototype/candidat", noms: ["TYPES_CRENEAU"], motif: PROTOTYPE_PUR },
  { fichier: "src/ai/requetes.ts", specificateur: "@/prototype/brief", noms: ["type:Brief"], motif: PROTOTYPE_PUR },
  {
    fichier: "src/ai/requetes.ts",
    specificateur: "@/prototype/candidat",
    noms: ["type:Candidat", "type:TypeCreneau", "vuePourModele"],
    motif: PROTOTYPE_PUR,
  },
  { fichier: "src/ai/requetes.ts", specificateur: "@/prototype/config", noms: ["type:Routage"], motif: PROTOTYPE_PUR },
  {
    fichier: "src/ai/sorties.ts",
    specificateur: "@/prototype/candidat",
    noms: ["LONGUEURS_TEXTE", "NotesSchema", "TYPES_CRENEAU", "texteMaison", "type:Notes"],
    motif: PROTOTYPE_PUR,
  },
  {
    fichier: "src/grounding/ancrage.ts",
    specificateur: "@/prototype/ancrage",
    noms: ["type:Ancrage", "type:AncrageResolu", "type:Position", "type:Trajets"],
    motif: PROTOTYPE_PUR,
  },
  { fichier: "src/grounding/ancrage.ts", specificateur: "@/prototype/brief", noms: ["type:Brief"], motif: PROTOTYPE_PUR },
  { fichier: "src/grounding/ancrage.ts", specificateur: "@/prototype/candidat", noms: ["type:Candidat"], motif: PROTOTYPE_PUR },
  { fichier: "src/research/agent.ts", specificateur: "@/prototype/brief", noms: ["type:Brief"], motif: PROTOTYPE_PUR },
  {
    fichier: "src/research/agent.ts",
    specificateur: "@/prototype/candidat",
    noms: ["CandidatSchema", "type:Candidat", "type:TypeCreneau"],
    motif: PROTOTYPE_PUR,
  },
  { fichier: "src/research/agent.ts", specificateur: "@/prototype/config", noms: ["type:ConfigRecherche", "type:Routage"], motif: PROTOTYPE_PUR },
  { fichier: "src/research/sources.ts", specificateur: "@/prototype/candidat", noms: ["type:ClasseSource"], motif: PROTOTYPE_PUR },
  {
    fichier: "src/research/extract-text.ts",
    specificateur: "parse5",
    noms: ["parse"],
    motif: "paquet `parse5` (P0a1, PR 180) en zone sensible non-test, où la section 6 n'admet que `zod` : 0040 D2, A3 (amendement A7)",
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
  // À trancher par le Tech Lead avec verdict Sécurité dans la revue de PR 217 (élargir la zone de `zod` à `tests/unit/**`
  // serait l'autre forme possible).
  {
    fichier: "tests/unit/contracts/categories.test.ts",
    specificateur: "zod",
    noms: ["z"],
    motif: "`zod` dans un test de contrats hors de `src/**` (B2, PR 219) : à trancher dans la revue de la PR 217 (0038 TL-5 point 7)",
  },
  {
    fichier: "tests/unit/contracts/derived-storage.test.ts",
    specificateur: "zod",
    noms: ["type:z"],
    motif: "`zod` dans un test de contrats hors de `src/**` (B2, PR 219) : à trancher dans la revue de la PR 217 (0038 TL-5 point 7)",
  },
] as const satisfies readonly LigneSpecificateurNominative[];
