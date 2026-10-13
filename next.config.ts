import type { NextConfig } from "next";

/**
 * En-têtes posés sur les réponses (spécification F10, F10-TL-8). L'écran 15 (`R15`) n'est jamais gardé par un
 * cache partagé ni par le navigateur : `private, no-store` (Next.js peut réécrire la valeur d'une page dynamique ;
 * les deux directives restent). Le service worker et son aiguillage (F10b) sont revalidés à chaque visite
 * (`no-cache`) : une correction atteint les appareils à la visite suivante.
 */
export const RESPONSE_HEADERS = [
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
    source: "/sw.js",
    headers: [{ key: "Cache-Control", value: "no-cache" }],
  },
  {
    source: "/sw-route.js",
    headers: [{ key: "Cache-Control", value: "no-cache" }],
  },
];

// Décision 0002 : Next.js standard, image autonome pour rester portable hors de Vercel.
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // Décision 0005 : le build vérifie les types sans les tests (absents de l'image Docker).
  // `pnpm typecheck` garde le tsconfig.json complet.
  typescript: { tsconfigPath: "tsconfig.build.json" },
  async headers() {
    return RESPONSE_HEADERS;
  },
};

export default nextConfig;
