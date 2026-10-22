import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { DeckSessionSchema, type DeckSession } from "@/contracts";
import { identifiantLisible } from "@/server/voyages/conversion";
import { echec } from "@/server/voyages/erreurs";
import { transactionDeLecture } from "@/server/voyages/lecture";
import { withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import { EtatDuTriInvalide, lireEtatDuTri, sessionDuTri } from "./etat";

/**
 * Lecture de l'état du tri pour l'écran (`TripAdapter.getDeckSession` de l'adaptateur `api` ; décision 0112 § 4 point 1)
 * : une transaction `withOrg` en lecture seule, sans verrou. Voyage inconnu ou d'une autre organisation : `null`. Toute
 * autre erreur rejette, en erreur fermée de la lecture (`output_invalid` ou `unavailable`, aucun repli silencieux vers la
 * session locale), y compris une erreur de schéma (`42P01`, `42703`) : le repli de l'amendement 1 de 0112 est retiré par
 * l'amendement 3 (migration `0014_tri_enregistre` appliquée).
 */

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";

export function creerLectureDuTri(dependances: { readonly withOrg?: FonctionWithOrg } = {}) {
  const withOrg = dependances.withOrg ?? withOrgParDefaut;
  return async function getDeckSession(ctx: AdapterContext, tripId: string): Promise<DeckSession | null> {
    if (!identifiantLisible(tripId)) return null;
    try {
      const session = await transactionDeLecture(withOrg, ctx, async (executeur) => {
        const voyage = await executeur.query(SQL_VOYAGE, [ctx.organizationId, tripId]);
        if (voyage.rows.length !== 1) return null;
        return sessionDuTri(await lireEtatDuTri(executeur, ctx.organizationId, tripId), tripId);
      });
      return session === null ? null : DeckSessionSchema.parse(session);
    } catch (erreur) {
      // Erreur fermée de la lecture, journalisée avec l'identifiant du voyage seul (ni message ni pile de la base).
      throw erreur instanceof EtatDuTriInvalide ? echec("output_invalid", { tripId }) : echec("unavailable", { tripId }, "base");
    }
  };
}
