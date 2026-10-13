/**
 * Cas communs à la règle ESLint « `src/domain` sans entrée-sortie » (`domain-lint.test.ts`) et à la ligne
 * `src/domain` de `tests/unit/p0/imports.test.ts` (décision 0045 § 3.2 : les deux listes restent égales tant que P0
 * tourne). Chaque spécificateur est importé depuis `src/domain/exemple.ts`, en `import type` et en `export … from`.
 */
export const IMPORTS_DOMAINE: readonly { specificateur: string; admis: boolean }[] = [
  { specificateur: "@/contracts", admis: true },
  { specificateur: "@/contracts/values", admis: true },
  { specificateur: "zod", admis: true },
  { specificateur: "@/domain/tables", admis: true },
  { specificateur: "./temps", admis: true },
  { specificateur: "@/prototype/brief", admis: false },
  { specificateur: "@/prototype/config", admis: false },
  { specificateur: "@/prototype/candidat", admis: false },
  { specificateur: "@/prototype/ancrage", admis: false },
  { specificateur: "@/grounding/ancrage", admis: false },
  { specificateur: "@/ai/requetes", admis: false },
  { specificateur: "node:fs", admis: false },
];

export const sourcesDomaine = (specificateur: string) => [
  `import type { X } from "${specificateur}";\nexport type Y = X;\n`,
  `export { X } from "${specificateur}";\n`,
];
