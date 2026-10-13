import type { Metadata } from "next";

import { devPagesEnabled } from "@/dev/flags";
import { BriefScreen } from "@/features/creation/BriefScreen";
import * as messages from "@/i18n/messages";

// Le choix de l'enregistreur des mesures dépend de l'environnement du serveur (pages de développement).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.creation.titreDocument.brief,
  robots: { index: false, follow: false },
};

/**
 * `R2`, écran 2 « Brief raconté puis vérifié » (spécification F8). Mesures : console en développement et dans les
 * tests sur le build de production (pages de développement actives), aucun enregistrement en production.
 */
export default function BriefPage() {
  return <BriefScreen recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
