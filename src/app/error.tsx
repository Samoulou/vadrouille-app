"use client";

import { ErrorContent } from "@/features/etats/ErrorContent";

/**
 * Erreur inattendue au rendu d'une page (écran 18, F11-PO-17, décision 0021 § 7). L'erreur reçue n'est
 * transmise à aucun composant : rien de son message, de son `digest` ni de sa pile n'apparaît.
 */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent reset={reset} />;
}
