import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SaisieCodeAcces } from "@/features/prototype/SaisieCodeAcces";
import * as messages from "@/i18n/messages";
import { etatPageExecutionsP0 } from "@/server/actions/p0-acces";

// Lue à chaque requête, jamais prérendue (S-2 point 5) : une copie servie par le CDN contournerait la garde.
// `Cache-Control: private, no-store` et `X-Robots-Tag` sont posés par `next.config.ts`.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: messages.prototype.acces.titreDocument, robots: { index: false, follow: false } };

/**
 * Page de saisie du code d'accès du mode réel (décision 0055, sections 1 et 2 ; ligne P0r3b de la section 8) :
 * 404 hors de la préversion de `p0-reel` (garde fermée : environnement, branche, réglages ou déploiement de
 * production) ; sinon le formulaire, ou l'accès déjà ouvert par un cookie valide. Le lancement est la page de P0r3d.
 */
export default async function ExecutionsPage() {
  const etat = await etatPageExecutionsP0();
  if (etat === "fermee") notFound();
  return <SaisieCodeAcces ouverte={etat === "ouverte"} />;
}
