import "server-only";

import { PLAFONDS_USAGE, type PlafondsUsage } from "@/server/config/usage";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import type { Horloge } from "@/server/usage/port";
import type { ReglesUsage } from "@/server/usage/reservation";

import prixGoogle from "../../../prototype/config/prix-google.json";

/**
 * Règles du forfait de relecture (B8b ; décision 0100 § 1 et § 5.3) : plafonds de la configuration (`PLAFONDS_USAGE`,
 * `null` tant que Samuel n'a pas validé les montants : question 8.1 de 0100), table de prix Google commitée
 * (`prototype/config/prix-google.json`, validée par `TablePrixGoogleSchema`) et horloge du port. Aucune lecture
 * d'environnement. `null` : aucune réservation possible, donc aucun appel payant (la source rend `unavailable`).
 */
export function reglesDeLecture(horloge: Horloge, plafonds: PlafondsUsage | null = PLAFONDS_USAGE): ReglesUsage | null {
  if (plafonds === null) return null;
  const table = TablePrixGoogleSchema.safeParse(prixGoogle);
  return table.success ? { plafonds, table: table.data, horloge } : null;
}
