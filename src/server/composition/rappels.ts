import "server-only";

import { rappelsDuServeur } from "@/server/auth";
import { disabledNotificationMailer } from "@/server/mail/disabled";
import { verdictRateLimit } from "@/server/rate-limit";
import type { DependancesRappels } from "@/server/rappels/accord";
import { demarrerRappelsReel } from "@/server/rappels/demarrage";
import { compterEspeceRappels } from "@/server/rappels/limiteurs";

/**
 * Rappels par e-mail sur `api` (M6c, ticket 1021 ; décision 0157 § 1.7 points 1, 5 et 7). **Terminal mince**, sur le
 * modèle de `lieux-api.ts` : le cœur `src/server/rappels/accord.ts` tient l'ordre des contrôles ; ce module ne fournit que
 * les ports de `api` à l'action serveur `src/server/actions/rappels.ts`, sans en lire l'entrée :
 *
 * - `disponibles` : port des notifications branché (garde `RAPPELS_ENVOI_REEL` comprise, `rappelsDuServeur`) et origine
 *   de l'application connue ; l'adaptateur est vérifié par l'action ;
 * - `verdict` : limiteur `rappels-accord` complet (activation) ;
 * - `compter` : une seule espèce de la règle (retrait, jamais refusé ; `src/server/rappels/limiteurs.ts`) ;
 * - `demarrer` : démarrage du workflow 7 par l'interface des workflows (import dynamique).
 */

function disponibles(): boolean {
  try {
    const composition = rappelsDuServeur();
    return composition.mailer !== disabledNotificationMailer && composition.origine !== null;
  } catch {
    return false;
  }
}

/** Ports de `api` des rappels ; la session, les en-têtes et la garde d'adaptateur restent à l'action serveur. */
export const PORTS_RAPPELS_API: Pick<DependancesRappels, "verdict" | "compter" | "demarrer"> & { readonly disponibles: () => boolean } = {
  disponibles,
  verdict: verdictRateLimit,
  compter: compterEspeceRappels,
  demarrer: demarrerRappelsReel,
};
