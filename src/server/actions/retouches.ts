"use server";

import { signalementsDuVoyage } from "@/adapters";
import { fail, type Result } from "@/contracts";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Actions serveur des retouches du programme (spécification `specs/M5-retouches.md` ; décision 0147, § 1 et § 14). Le
 * contexte vient de la session (`contexteFacultatif`), jamais de l'entrée ; l'entrée est reçue en `unknown` et revalidée par
 * l'adaptateur (`mock`) ou par le cas d'usage (`api`, `src/server/voyages/signalement.ts`, cadre commun des actions sur un
 * voyage). Créé par M5c (ticket 904) ; M5a et M5b y ajoutent les leurs.
 *
 * `reportStop` (`StopReport` → `null`) : signaler une erreur sur une étape, avant comme après le déblocage (M5-PO-1).
 * Erreurs : `unauthenticated`, `validation_failed` (entrée, ou événement, engagement, lieu à soi : `field: "stopId"`),
 * `not_found` (voyage hors de l'organisation, étape inconnue ou d'une journée non servie), `rate_limited` (débit ou plafond du
 * jour), `internal` (et hors `mock` et `api`, sans rien lire : la fiche du site d'essai n'a pas le bouton).
 */
export async function reportStop(input: unknown): Promise<Result<null>> {
  const signalements = await signalementsDuVoyage();
  return signalements === null ? fail("internal") : signalements.reportStop(await contexteFacultatif(), input);
}
