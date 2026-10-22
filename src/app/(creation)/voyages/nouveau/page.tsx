import type { Metadata } from "next";

import { isPrototypeAdapter } from "@/adapters";
import { CreateTripForm } from "@/features/creation/CreateTripForm";
import * as messages from "@/i18n/messages";

// Site d'essai (spécification E2E-essai, lot 2) : l'adaptateur `DATA_ADAPTER` est lu à chaque requête, jamais au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.creation.titreDocument.nouveau,
  robots: { index: false, follow: false },
};

/**
 * `R1`, écran 1 « Créer le voyage » (spécification F8). Aucun appel serveur : le brouillon vit dans l'onglet. Sur le
 * site d'essai (adaptateur `prototype`), une seule ville connue de la table des fuseaux (E2E-essai, lot 2).
 */
export default function NouveauVoyagePage() {
  return <CreateTripForm essai={isPrototypeAdapter()} />;
}
