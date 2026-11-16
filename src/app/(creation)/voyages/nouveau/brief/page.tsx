import type { Metadata } from "next";

import { goutsEnregistres, goutsRetenus, isPrototypeAdapter } from "@/adapters";
import type { RetainedPreference } from "@/contracts";
import { devPagesEnabled } from "@/dev/flags";
import { contexteFacultatif } from "@/features/compte/session";
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
 * tests sur le build de production (pages de développement actives), aucun enregistrement en production. Sur le site
 * d'essai (adaptateur `prototype`), le récit n'est pas structuré (spécification E2E-essai, lot 2, D2).
 *
 * « Tes goûts retenus » (M8c-2, ticket 1131 ; décision 0160 § 1.6) : sur `api`, avec une session, les goûts de la personne
 * sont relus à chaque affichage et proposés à la vérification ; un goût retiré ailleurs n'est donc plus proposé au
 * prochain affichage. Sans session, sans goût, sur `mock` et sur le site d'essai : aucune lecture, aucun bloc.
 */
export default async function BriefPage() {
  const retainedTastes = await goutsDeLaSession();
  return (
    <BriefScreen
      recorderKind={devPagesEnabled() ? "console" : "none"}
      essai={isPrototypeAdapter()}
      {...(retainedTastes.length > 0 ? { retainedTastes } : {})}
    />
  );
}

/** Goûts de la personne connectée ; la session n'est lue que si l'adaptateur a des goûts enregistrés (`api`). */
async function goutsDeLaSession(): Promise<RetainedPreference[]> {
  if (goutsEnregistres() === null) return [];
  const ctx = await contexteFacultatif();
  return ctx === null ? [] : goutsRetenus(ctx);
}
