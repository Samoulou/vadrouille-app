import type { Metadata } from "next";

import { LaunchStep } from "@/features/creation/LaunchStep";
import * as messages from "@/i18n/messages";
import { hasSession } from "@/server/actions/compte";

// Convention de src/app (décision 0032 § A6.2) : rendu à chaque requête ; la session est lue dans la portée de la requête.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.creation.titreDocument.lancement,
  robots: { index: false, follow: false },
};

/**
 * `R-lancer`, étape sans écran qui crée le voyage (spécification F8, « Lancement » et « Garde du lancement » ;
 * décision 0017 § 1 et § 5). La page lit seulement l'existence d'une session (garde, simple confort) ; le brouillon
 * vit dans l'onglet et `createTrip` vérifie lui-même la session.
 */
export default async function LancerPage() {
  return <LaunchStep signedIn={await hasSession()} />;
}
