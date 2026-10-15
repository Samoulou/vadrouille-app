import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LancementP0 } from "@/features/prototype/LancementP0";
import { SaisieCodeAcces } from "@/features/prototype/SaisieCodeAcces";
import * as messages from "@/i18n/messages";
import { pageExecutionsP0 } from "@/server/p0/page-acces";

// Lue à chaque requête, jamais prérendue (S-2 point 5) : une copie servie par le CDN contournerait la garde.
// `Cache-Control: private, no-store` et `X-Robots-Tag` sont posés par `next.config.ts`.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: messages.prototype.lancement.titreDocument, robots: { index: false, follow: false } };

/**
 * Page des exécutions réelles (décision 0055, sections 1, 2 et 8 ; lignes P0r3b et P0r3d) : 404 hors de la préversion
 * de `p0-reel` (garde fermée : environnement, branche, réglages ou déploiement de production), donc absente en
 * production ; sinon la saisie du code d'accès, puis, accès ouvert par un cookie valide, la page de lancement (choix,
 * suivi, décompte, rapport).
 */
export default async function ExecutionsPage() {
  const page = await pageExecutionsP0();
  if (page.etat === "fermee") notFound();
  if (page.etat !== "ouverte") return <SaisieCodeAcces ouverte={false} />;
  return <LancementP0 modele={page.modele} />;
}
