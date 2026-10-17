/**
 * Liste des paquets déclarés (spécification P0c, section 6). Chaque nom de `dependencies` et de `devDependencies`
 * y figure avec son usage et la revue consolidée qui l'a admis ; un paquet absent de la liste, ou listé mais absent de
 * `package.json`, fait échouer le test. Propriété du Tech Lead ; ajouter un paquet demande, dans la même PR, ses lignes
 * de spécificateurs (ou de capacité) et un verdict Sécurité qui cite le lockfile.
 */

import { PAQUETS_TEXTES } from "./specificateurs";

export type LignePaquet = { readonly paquet: string; readonly usage: string; readonly verdict: string };

const EXISTANT = "existant au 2026-10-12 (`40b6738`)";
/** Paquets de B1, fusionnés avant leur ligne : verdict Sécurité qui cite le lockfile demandé dans la PR du ticket 242. */
const B1 = "B1 (PR 188, décision 0006) ; verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242 ; lockfile cité dans sa description)";

/** P0r1 (ticket 267) : paquets ajoutés, versions de l'amendement de 0006 ; lockfile cité dans la description de la PR. */
const P0R1 = "P0r1 (ticket 267, décisions 0006, 0031 et 0049 D1, D12) ; verdict Sécurité : approuvé sur le head `353bb20` (PR 272, ticket 267), qui cite le lockfile";

const PAQUETS_TS = [
  { paquet: "@googlemaps/js-api-loader", usage: "carte Google du navigateur (F4) ; module à capacité", verdict: EXISTANT },
  { paquet: "@radix-ui/react-dialog", usage: "composants Ligne", verdict: EXISTANT },
  { paquet: "@radix-ui/react-slot", usage: "composants Ligne", verdict: EXISTANT },
  { paquet: "class-variance-authority", usage: "composants Ligne", verdict: EXISTANT },
  { paquet: "clsx", usage: "classes CSS", verdict: EXISTANT },
  { paquet: "next", usage: "application", verdict: EXISTANT },
  { paquet: "parse5", usage: "extraction du texte des pages (P0a1, `src/research/extract-text.ts`)", verdict: "revue consolidée de la PR 180 (P0a1), fusionnée" },
  { paquet: "react", usage: "application", verdict: EXISTANT },
  { paquet: "react-dom", usage: "application", verdict: EXISTANT },
  { paquet: "tailwind-merge", usage: "classes CSS", verdict: EXISTANT },
  { paquet: "zod", usage: "contrats et validation", verdict: EXISTANT },
  { paquet: "@axe-core/playwright", usage: "accessibilité e2e", verdict: EXISTANT },
  { paquet: "@playwright/test", usage: "e2e, visuel, performance", verdict: EXISTANT },
  { paquet: "@tailwindcss/postcss", usage: "chaîne CSS (`postcss.config.mjs`, sans import)", verdict: EXISTANT },
  { paquet: "@testing-library/dom", usage: "dépendance de `@testing-library/react` (sans import)", verdict: EXISTANT },
  { paquet: "@testing-library/jest-dom", usage: "assertions DOM des tests unitaires", verdict: EXISTANT },
  { paquet: "@testing-library/react", usage: "tests de composants", verdict: EXISTANT },
  { paquet: "@types/google.maps", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "@types/node", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "@types/react", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "@types/react-dom", usage: "types (sans import)", verdict: EXISTANT },
  { paquet: "axe-core", usage: "accessibilité des tests unitaires", verdict: EXISTANT },
  { paquet: "eslint", usage: "lint", verdict: EXISTANT },
  { paquet: "eslint-config-next", usage: "lint", verdict: EXISTANT },
  { paquet: "jsdom", usage: "environnement des tests unitaires (sans import)", verdict: EXISTANT },
  { paquet: "lighthouse", usage: "mesure de performance (0022) ; module à capacité", verdict: EXISTANT },
  { paquet: "tailwindcss", usage: "styles", verdict: EXISTANT },
  { paquet: "typescript", usage: "vérification de types ; analyse du régime de confinement", verdict: EXISTANT },
  { paquet: "vitest", usage: "tests unitaires", verdict: EXISTANT },
  // B1 (PR 188, fusionnée le 2026-10-13, `d1ba047` ; versions de la décision 0006) : relevé après P0c1.
  { paquet: "drizzle-orm", usage: "requêtes et schéma de la base (`db/`)", verdict: B1 },
  { paquet: "pg", usage: "pilote Postgres (`db/connection.ts`, `db/migrate.ts`, tests de base) ; module à capacité", verdict: B1 },
  { paquet: "server-only", usage: "garde des modules serveur (`db/`, `src/server/`)", verdict: B1 },
  { paquet: "@types/pg", usage: "types (sans import)", verdict: B1 },
  { paquet: "drizzle-kit", usage: "génération des migrations (`drizzle.config.ts`, `pnpm db:generate`)", verdict: B1 },
  { paquet: "ai", usage: "AI SDK du client réel de modèles (P0r1) ; module à capacité", verdict: P0R1 },
  { paquet: "undici", usage: "transport réel de la lecture des pages (P0r1, `src/research/undici-transport.ts`) ; module à capacité", verdict: P0R1 },
  {
    paquet: "pg-connection-string",
    usage: "analyse des chaînes de connexion par `db/migrate.ts`, refus de tout hôte non local (0056 § 2.8) ; sans capacité",
    verdict:
      "PR du workflow des migrations (décisions 0056 et 0057 ; Q412, Q419, Q422) ; verdict Sécurité à rendre ; dépendance directe épinglée à la version que `pg` résout (2.14.1), déjà dans `pnpm-lock.yaml` : " +
      "le verrou ne gagne que l'entrée de la racine, aucun paquet nouveau (test `tests/unit/db/hote-local-migrations.test.ts`)",
  },
  {
    paquet: "workflow",
    usage:
      "Workflow SDK de `p0Run` (P0r3c-4, décisions 0009 et 0063) : `src/workflows/` et `withWorkflow` de `next.config.ts` ; module à capacité (exécution durable, file et stockage du monde Vercel)",
    verdict:
      "P0r3c-4 (ticket 316, décision 0063 points 1 et 2) ; verdict Sécurité à rendre dans la PR, qui cite le lockfile : version exacte 5.1.0, " +
      "`@swc/core`, `esbuild` et `cbor-extract` hors de `onlyBuiltDependencies` (build prouvé sans leurs scripts)",
  },
  {
    paquet: "nodemailer",
    usage:
      "e-mail du code de connexion vers Mailpit (B3b-envoi, décision 0008) : compilation de l'enveloppe par `nodemailer/lib/mail-composer` (`src/server/mail/enveloppe.ts`), " +
      "`nodemailer/lib/addressparser` du critère E3 ; sous-chemins exacts, aucun transport ; aucune dépendance, aucun script d'installation",
    verdict:
      "B3b-envoi (ticket 435, PR 437) ; Sécurité : dépendance conforme sur le head `1b3a97d` (revue consolidée : lockfile, version exacte 10.0.16, intégrité " +
      "`sha512-VL9xKErxN+el77o8eBOuYKUPMyEx7F9hfnDCuiUKJRp9v3wnWMOudYgP/SWbwSHy8rUL4cylobuXtki1LpQS7A==`, aucun script d'installation, hors de `onlyBuiltDependencies`) ; " +
      "spécificateurs réduits à deux sous-chemins exacts (bloquant 1 de cette revue)",
  },
] as const satisfies readonly LignePaquet[];

export const PAQUETS: readonly LignePaquet[] = [...PAQUETS_TS, ...PAQUETS_TEXTES];

/** `pnpm.onlyBuiltDependencies` exact (section 6). */
export const CONSTRUITS = ["sharp", "unrs-resolver"] as const;

/**
 * `pnpm.overrides` admis, exacts (P0r3c-4, bloquant 3 de la revue du head `608ee99`, PR 348 ; décision 0063 point 1) :
 * transitives épinglées par `@workflow/core` 5.1.0 à des versions sous avis, forcées vers la première version corrigée
 * de même majeure, pour ce seul parent. Verdict Sécurité à rendre dans la PR. À retirer quand `workflow` les corrige.
 */
export const SUBSTITUTIONS: Readonly<Record<string, string>> = {
  "@workflow/core>devalue": "5.9.4",
  "@workflow/core>nanoid": "5.1.16",
};
