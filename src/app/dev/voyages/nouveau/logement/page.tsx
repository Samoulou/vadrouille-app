import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MOCK_DEMO_DRAFT } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { draftForLodging } from "@/features/creation/draft";
import * as messages from "@/i18n/messages";

import { DevLogement } from "./DevLogement";

// Lu à chaque requête : la variable VADROUILLE_DEV_PAGES est évaluée à l'exécution.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.creation.titreDocument.logement,
  robots: { index: false, follow: false },
};

/**
 * `R3-dev` = `/dev/voyages/nouveau/logement` (décision 0017 § 1 et § 7) : écran 3 sur le brouillon de démonstration
 * (`MOCK_DEMO_DRAFT`, ville du jeu simulé sans logement) avec la carte simulée. 404 sans pages de développement (décision
 * 0013 § 1.6, 0017 § 11.1) : vérifié par `tests/unit/dev-creation.test.tsx` et par le job `docker`.
 */
export default function DevLogementPage() {
  if (!devPagesEnabled()) notFound();
  return <DevLogement initial={draftForLodging(MOCK_DEMO_DRAFT)} />;
}
