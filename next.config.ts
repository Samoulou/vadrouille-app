import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

/**
 * En-têtes posés sur les réponses (spécification F10, F10-TL-8). L'écran 15 (`R15`) n'est jamais gardé par un
 * cache partagé ni par le navigateur : `private, no-store` (Next.js peut réécrire la valeur d'une page dynamique ;
 * les deux directives restent). Le service worker et son aiguillage (F10b) sont revalidés à chaque visite
 * (`no-cache`) : une correction atteint les appareils à la visite suivante.
 */
export const RESPONSE_HEADERS = [
  {
    // B6b (Q524 ; handover « Partie Q5 », règles de relecture ; spécification B8, règle 3) : les pages du voyage servies
    // par l'adaptateur `api` portent des données relues (durées de trajet, horaires à confirmer) et les données de
    // l'organisation de la session. Ni cache partagé ni cache du navigateur, pour toutes leurs réponses (« Mes voyages »,
    // Séjour, Journée, présentation, 404 et 500 comprises). La règle de `aujourdhui` ci-dessous reste, inchangée.
    source: "/voyages/:path*",
    headers: [{ key: "Cache-Control", value: "private, no-store" }],
  },
  {
    source: "/voyages/:id/aujourdhui",
    headers: [{ key: "Cache-Control", value: "private, no-store" }],
  },
  {
    // Vue partagée (`RP`, `RPJ` ; F10-TL-8) : toutes les réponses sous `/p/`, 200, 404 et 500 comprises. Ni cache
    // partagé (un lien désactivé cesse de fonctionner dès la requête suivante), ni indexation, et seule l'origine
    // part dans `Referer` : le chemin, donc le jeton, n'est jamais envoyé à une autre origine.
    source: "/p/:path*",
    headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "strict-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ],
  },
  {
    // Mode réel du prototype (décision 0055, section 2 point 5 ; S-2 point 5) : pages de saisie du code et de
    // lancement, jamais gardées par un cache ni indexées ; le chemin ne part vers aucune autre origine.
    source: "/prototype/:path*",
    headers: [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "strict-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ],
  },
  {
    source: "/sw.js",
    headers: [{ key: "Cache-Control", value: "no-cache" }],
  },
  {
    source: "/sw-route.js",
    headers: [{ key: "Cache-Control", value: "no-cache" }],
  },
];

// Décision 0002 : Next.js standard, image autonome pour rester portable hors de Vercel.
export const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Décision 0005 : le build vérifie les types sans les tests (absents de l'image Docker).
  // `pnpm typecheck` garde le tsconfig.json complet.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  // Décision 0105 § 2 point 5 : les fixtures d'Édimbourg de la variante simulée sont lues à l'exécution (`node:fs`,
  // `src/server/composition/fixtures-simulees.ts`), jamais importées. Sur Vercel (préversion), le traçage de fichiers les
  // embarque pour les routes du workflow ; dans l'image Docker, `prototype/` est hors du contexte (`.dockerignore`) et ce
  // réglage reste sans effet : la composition simulée n'y est jamais atteinte (production refusée avant tout chargement).
  outputFileTracingIncludes: {
    "/.well-known/workflow/**": ["./prototype/fixtures/**/edimbourg.json"],
  },
  async headers() {
    return RESPONSE_HEADERS;
  },
};

/**
 * Workflow SDK (décision 0009 ; décision 0063 : `workflow` 5.1.0 épinglé, `@swc/core` sans script d'installation).
 * `withWorkflow` compile les directives `"use workflow"` et `"use step"` de `src/workflows/` (seul dossier admis, règle
 * `ligne/workflow-directives`) et génère les routes `/.well-known/workflow/v1/*` dans `src/app/.well-known/workflow/`
 * (fichiers de build, ignorés par git). Hors de Vercel, le monde est le monde local ; chaque étape de `p0Run`
 * revérifie la garde à son entrée (décision 0055, S-1 point 3), qui refuse hors de la préversion de `p0-reel`.
 */
export default withWorkflow(nextConfig);
