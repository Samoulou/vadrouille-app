"use client";

import { ErrorContent } from "@/features/etats/ErrorContent";
import "@/styles/globals.css";

import { hankenGrotesk } from "./fonts";

/**
 * Erreur dans le layout racine : remplace ce layout, d'où son propre document, la feuille de styles et la
 * police (décision 0021 § 7). Mêmes textes et même rendu que `error.tsx` ; l'erreur reçue n'est pas lue.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr" className={hankenGrotesk.variable}>
      <body className="bg-page font-sans text-ink antialiased">
        <ErrorContent reset={reset} />
      </body>
    </html>
  );
}
