import "server-only";

import { etapeClotureProgramme as cloture, etapeProgrammeDebut as debut, etapeProgrammeEcriture as ecriture } from "@/server/generation/etapes-programme";
import type { EtatProgramme } from "@/server/generation/etat";

/**
 * Workflow `generateProgramme` (chaîne inversée sur `api`, décision 0136 § 2) : le pont qui **câble** les étapes de
 * `src/server/generation/etapes-programme.ts`, sans règle métier, comme `apercu.ts`. Importé par `src/workflows/index.ts`
 * seulement (règle `ligne/creation-imports`, importateur admis par 0136 § 2.1). Deux étapes `"use step"` :
 * `a` (relecture, conversion, forfait du profil `programme`) et `e` (logements, rédaction, vérification, assemblage,
 * publication).
 *
 * - **État sérialisé** : `{ generationRunId, organizationId, rang }` plus, après un arrêt, le code fermé (`EtatProgrammeSchema`) ;
 *   ni brief, ni récit, ni nom, ni `placeId`.
 * - **Reprises** : celles de `MAX_RETRIES_PROGRAMME`, écrites en littéraux comme `apercu.ts` (test d'égalité) : `a` : 2, déterministe, sans appel ; `e` : 0, une étape rejouée repaierait).
 * - **Arrêt** : une étape arrêtée a clos l'exécution en `failed` sur un code fermé ; une erreur inattendue qui sort d'une
 *   étape clôt l'exécution sur `upstream_unavailable` (`etapeClore`).
 */

export async function etapeDebut(entree: EtatProgramme): Promise<EtatProgramme> {
  "use step";
  return debut(entree);
}
etapeDebut.maxRetries = 2;

export async function etapeProgramme(entree: EtatProgramme): Promise<EtatProgramme> {
  "use step";
  return ecriture(entree);
}
etapeProgramme.maxRetries = 0;

export async function etapeClore(entree: EtatProgramme): Promise<EtatProgramme> {
  "use step";
  return cloture(entree, "upstream_unavailable");
}
etapeClore.maxRetries = 0;

/** L'exécution `preview` réservée par `createTrip` ou `retryGeneration` sous la chaîne inversée, de `a` à la publication. */
export async function generateProgramme(entree: EtatProgramme): Promise<EtatProgramme> {
  "use workflow";
  let etat = entree;
  try {
    for (const etape of [etapeDebut, etapeProgramme]) {
      if (etat.arret !== undefined) break;
      etat = await etape(etat);
    }
  } catch {
    etat = await etapeClore(etat);
  }
  return etat;
}
