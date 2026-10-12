import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DEV_ERROR_MESSAGE } from "@/dev/EtatsShowcase";
import { devPagesEnabled } from "@/dev/flags";

// Rendue à chaque requête : l'erreur n'est levée qu'à la requête, jamais pendant `next build`.
export const dynamic = "force-dynamic";

// Pas de titre propre : le titre du document est celui de la page d'erreur (élément <title> de ErrorContent).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Page de développement qui lève une erreur, pour montrer `error.tsx` (décision 0021 § 8). Le contrôle du
 * drapeau vient en premier : sans lui, 404 et aucune erreur.
 */
export default function DevEtatsErreurPage(): never {
  if (!devPagesEnabled()) {
    notFound();
  }
  throw new Error(DEV_ERROR_MESSAGE);
}
