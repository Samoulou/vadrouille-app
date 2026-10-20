import "server-only";

import { ChecklistUpdateSchema, type ChecklistItem } from "@/contracts";

import { executerActionVoyage, type DependancesAction } from "./actions";
import { elementAFaire, identifiantLisible } from "./conversion";

/**
 * Cas d'usage `toggleChecklistItem` (spécification B6, B6b point 3 et B6-PO-14 ; décision 0086 § 2.2 point 4) : coche ou
 * décoche une ligne « À faire » du voyage, **hors des versions** (aucune version, aucun verrou, aucune annulation : B11).
 * État final, idempotent : rejouer la même entrée donne la même ligne ; `done_at` est posé par la base (`now()`) au
 * premier cochage et gardé tant que la ligne reste cochée, remis à nul au décochage. Rend la ligne à jour validée par
 * `ChecklistItemSchema` ; une ligne inconnue, d'un autre voyage ou d'une autre organisation : `not_found`, sans
 * écriture. **Non branché sur l'écran 11** (B6-PO-14 : la liste reste gérée par les actions locales jusqu'à B11).
 */

const SQL_COCHER = `UPDATE public.checklist_items
  SET done = $4, done_at = CASE WHEN $4 THEN COALESCE(done_at, now()) ELSE NULL END
  WHERE organization_id = $1 AND trip_id = $2 AND id = $3
  RETURNING id, label, moment, done, booking_url, sponsored, stop_id`;

/** Erreur d'une ligne écrite qui ne valide plus le contrat : convertie en `internal` par le cadre. */
class LigneAFaireInvalide extends Error {
  override name = "LigneAFaireInvalide";
}

export function basculerAFaire(dependances: DependancesAction, entree: unknown) {
  return executerActionVoyage("toggle-checklist-item", dependances, ChecklistUpdateSchema, entree, async (executeur, ctx, valeur): Promise<ChecklistItem | null> => {
    if (!identifiantLisible(valeur.itemId)) return null;
    const lignes = (await executeur.query(SQL_COCHER, [ctx.organizationId, valeur.tripId, valeur.itemId, valeur.done])).rows;
    if (lignes.length !== 1) return null;
    const item = elementAFaire(lignes[0] ?? {});
    if (item === null) throw new LigneAFaireInvalide();
    return item;
  });
}
