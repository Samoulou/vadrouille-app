import type { Metadata } from "next";

import { isPrototypeAdapter } from "@/adapters";
import { LaunchEssai } from "@/features/creation/LaunchEssai";
import { LaunchStep } from "@/features/creation/LaunchStep";
import * as messages from "@/i18n/messages";
import { hasSession } from "@/server/actions/compte";
import { etatPageExecutionsP0 } from "@/server/p0/page-acces";

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
 *
 * Site d'essai (adaptateur `prototype` ; spécification E2E-essai, lot 2, D3) : aucune session, le code d'accès en tient
 * lieu. La page lit l'état de la garde du mode réel et la validité du cookie d'accès (`etatPageExecutionsP0`, comme
 * `/prototype/executions`, sans connexion à la base) et ne transmet au navigateur que cet état, jamais le cookie ni le
 * code. Aucun lancement tant que le lot 3 n'est pas livré.
 */
export default async function LancerPage() {
  if (isPrototypeAdapter()) {
    return <LaunchEssai acces={await etatPageExecutionsP0()} />;
  }
  return <LaunchStep signedIn={await hasSession()} />;
}
