import type { Metadata } from "next";

import { CreateTripForm } from "@/features/creation/CreateTripForm";
import { messages } from "@/i18n";

export const metadata: Metadata = {
  title: messages.creation.titreDocument.nouveau,
  robots: { index: false, follow: false },
};

/** `R1`, écran 1 « Créer le voyage » (spécification F8). Aucun appel serveur : le brouillon vit dans l'onglet. */
export default function NouveauVoyagePage() {
  return <CreateTripForm />;
}
