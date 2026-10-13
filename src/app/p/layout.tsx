import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * Vue partagée (`RP`, `RPJ` ; spécification F10, F10c ; décision 0039, F10-TL-8) : jamais indexée. La balise
 * `<meta name="robots" content="noindex, nofollow">` vaut pour toutes les réponses sous `/p/`, 404 comprises ;
 * `next.config.ts` pose en plus `X-Robots-Tag`, `Cache-Control: private, no-store` et `Referrer-Policy: strict-origin`.
 */
// Comme chaque layout qui encadre des données lues à la requête (décision 0032 § A6.2).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function SharedLayout({ children }: { children: ReactNode }) {
  return children;
}
