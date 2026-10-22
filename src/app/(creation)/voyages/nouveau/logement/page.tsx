import type { Metadata } from "next";

import { isPrototypeAdapter } from "@/adapters";
import { LodgingScreen } from "@/features/creation/LodgingScreen";
import * as messages from "@/i18n/messages";

// Convention de src/app (décision 0032 § A6.2) : rendu à chaque requête, aucune page en cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.creation.titreDocument.logement,
  robots: { index: false, follow: false },
};

/**
 * `R3`, écran 3 « Où loger » (spécification F8, décision 0017 § 1). La ville vient du brouillon en mémoire de
 * l'onglet ; la suggestion est demandée par l'action `suggestLodging`. Mini-carte Google, ou état « configuration
 * absente » de F4 sans clé (CI) ; la carte simulée n'est servie que par `R3-dev`. Sur le site d'essai (adaptateur
 * `prototype`), aucune suggestion ni carte : « Continuer sans logement » (spécification E2E-essai, lot 2, D2).
 */
export default function LogementPage() {
  return <LodgingScreen essai={isPrototypeAdapter()} />;
}
