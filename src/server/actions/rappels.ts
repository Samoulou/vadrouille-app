"use server";

import { headers } from "next/headers";

import { isApiAdapter } from "@/adapters";
import type { Result, TripRemindersStatus } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";
import { PORTS_RAPPELS_API } from "@/server/composition/rappels";
import { lireRappels, modifierRappels, type DependancesRappels } from "@/server/rappels/accord";

/**
 * Actions serveur des rappels par e-mail (M6c, ticket 1021 ; spécification M6 § 5.2 et § 6.3 ; décision 0157 § 1.7 point 5).
 * Le contexte vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée
 * par le cœur (`src/server/rappels/accord.ts`), qui fixe l'ordre des contrôles.
 *
 * - `setTripReminders` (`{ tripId, enabled }` → `{ active }`) : l'interrupteur « Rappel par e-mail la veille » du Séjour.
 *   Activation : erreurs `unauthenticated`, `validation_failed`, `not_found` (rappels indisponibles, voyage inconnu, d'une
 *   autre organisation, non débloqué, ou personne non propriétaire), `rate_limited` (règle `rappels-accord`), `internal`.
 *   Retrait : jamais refusé par la limite ; `not_found` sans accord de la personne pour ce voyage.
 * - `getTripReminders` (`{ tripId }` → `{ active }`) : état lu par la page du Séjour ; `not_found` si les rappels ne sont
 *   pas disponibles (l'interrupteur n'apparaît pas).
 */

const DEPENDANCES: DependancesRappels = {
  ...PORTS_RAPPELS_API,
  /** Adaptateur `api` d'abord, puis le port des notifications branché et l'origine (terminal `composition/rappels.ts`). */
  disponibles: () => isApiAdapter() && PORTS_RAPPELS_API.disponibles(),
  contexte: contexteFacultatif,
  headers: async () => new Headers(await headers()),
};

export async function setTripReminders(input: unknown): Promise<Result<TripRemindersStatus>> {
  return modifierRappels(input, DEPENDANCES);
}

export async function getTripReminders(input: unknown): Promise<Result<TripRemindersStatus>> {
  return lireRappels(input, DEPENDANCES);
}
