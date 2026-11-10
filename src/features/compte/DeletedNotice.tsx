"use client";

import { useEffect, useState } from "react";

import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import * as messages from "@/i18n/messages";

/**
 * Annonce « Ton compte est supprimé. » de l'accueil, à l'arrivée après la suppression (M9c ; spécification M9 § 6.4,
 * critère 4 ; M9-PO-7). La région `role="status"` est rendue vide dans le HTML du serveur, puis le texte y est écrit après
 * l'hydratation : une région déjà remplie au chargement n'est en général pas annoncée par les lecteurs d'écran (revue
 * consolidée de la PR 1127, mineur 10).
 */
export function DeletedNotice() {
  const [affiche, setAffiche] = useState(false);
  useEffect(() => {
    const image = requestAnimationFrame(() => setAffiche(true));
    return () => cancelAnimationFrame(image);
  }, []);
  return (
    <p role="status" data-part="compte-supprime" className={affiche ? "rounded-block bg-muted p-4 text-corps text-ink-2" : EMPTY_LIVE_REGION_CLASS}>
      {affiche ? messages.compte.suppression.fin : null}
    </p>
  );
}
