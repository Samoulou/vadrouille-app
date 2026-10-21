import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { DeckSessionSchema, type DeckSession } from "@/contracts";
import { logEvent } from "@/server/log";
import { identifiantLisible } from "@/server/voyages/conversion";
import { echec } from "@/server/voyages/erreurs";
import { transactionDeLecture } from "@/server/voyages/lecture";
import { withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import { EtatDuTriInvalide, lireEtatDuTri, sessionDuTri } from "./etat";

/**
 * Lecture de l'état du tri pour l'écran (`TripAdapter.getDeckSession` de l'adaptateur `api` ; décision 0112 § 4 point 1)
 * : une transaction `withOrg` en lecture seule, sans verrou. Voyage inconnu ou d'une autre organisation : `null`. Toute
 * autre erreur rejette, en erreur fermée de la lecture (`output_invalid` ou `unavailable`, aucun repli silencieux vers la
 * session locale), **sauf** l'absence du schéma du tri enregistré (migration `0014_tri_enregistre` pas encore appliquée à
 * la base : SQLSTATE `42P01` table absente, `42703` colonne absente) : `null`, l'écran garde alors la session en mémoire
 * de F6 comme sur `mock` et `prototype` (B10-PO-18), et les actions du tri ne sont jamais appelées. Ce repli est
 * **journalisé** (`presentation.deck_schema_missing`, niveau `warn`, identifiant du voyage seul) : il n'est jamais muet.
 * Écart à 0112 § 4 point 1 décidé par l'**amendement 1 de 0112** (portée, condition de retrait, perte des décisions en
 * mémoire tant que 0014 n'est pas appliquée) ; retiré quand la migration est appliquée sur toutes les bases.
 */

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";

/** Codes SQLSTATE d'un schéma absent (migration non appliquée). */
const SCHEMA_ABSENT = new Set(["42P01", "42703"]);

/** Code SQLSTATE d'une erreur de la base, cherché dans la chaîne des causes (le client enveloppe l'erreur du pilote). */
export function codeSql(erreur: unknown): string | undefined {
  let courante: unknown = erreur;
  for (let profondeur = 0; profondeur < 5 && courante !== null && typeof courante === "object"; profondeur += 1) {
    const code = (courante as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    courante = (courante as { cause?: unknown }).cause;
  }
  return undefined;
}

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
      const code = codeSql(erreur);
      if (code !== undefined && SCHEMA_ABSENT.has(code)) {
        // Repli de l'amendement 1 de 0112 : visible dans le journal (code et message de la base jamais écrits).
        logEvent("presentation.deck_schema_missing", { tripId }, "warn");
        return null;
      }
      // Erreur fermée de la lecture, journalisée avec l'identifiant du voyage seul (ni message ni pile de la base).
      throw erreur instanceof EtatDuTriInvalide ? echec("output_invalid", { tripId }) : echec("unavailable", { tripId }, "base");
    }
  };
}
