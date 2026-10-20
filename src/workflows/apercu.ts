import "server-only";

import {
  etapeAncrage as ancrage,
  etapeBrief as brief,
  etapeCloture as cloture,
  etapeLogement as logement,
  etapeNotation as notation,
  etapePlanification as planification,
  etapeRecherche as recherche,
} from "@/server/generation/etapes";
import type { EtatEtape } from "@/server/generation/etat";

/**
 * Workflow 1, `generatePreview` (spécification B9, B9c ; décisions 0081 B9-TL-3, 0087 § 2 et 0009) : le pont qui **câble** les
 * étapes de `src/server/generation/etapes.ts`, sans règle métier. Importé par `src/workflows/index.ts` seulement
 * (règle `ligne/creation-imports`). Étapes dans l'ordre, chacune une fonction `"use step"` :
 * `a` (brief, forfait), `l` (contrôle du logement, 0087 § 2), `b` (recherche), `c` (ancrage : workflow 2), `d` (notation :
 * workflow 3), `e` (planification et publication).
 *
 * - **État sérialisé** : `{ generationRunId, organizationId, rang }` plus, après un arrêt, le code fermé (`EtatEtapeSchema`).
 *   Aucun brouillon, brief, candidat ni `placeId` ne traverse la frontière : chaque étape relit la base.
 * - **Reprises** : `maxRetries` 2 pour `a` (déterministe, sans appel) et 0 pour `l` à `e` : une étape rejouée repaierait ses
 *   appels (`MAX_RETRIES_ETAPE`). Une étape rejouée par la file est de toute façon refusée par la garde `step_seq`.
 * - **Arrêt** : une étape arrêtée (plafond, quota, erreur de fournisseur, échéance, garde) a clos l'exécution en `failed` sur
 *   un code fermé ; les suivantes sont passées. Une erreur inattendue qui sort d'une étape clôt l'exécution sur
 *   `upstream_unavailable` (réessayable : panne de base après les reprises de la file, `etapeClore`).
 */

export async function etapeBrief(entree: EtatEtape): Promise<EtatEtape> {
  "use step";
  return brief(entree);
}
etapeBrief.maxRetries = 2;

export async function etapeLogement(entree: EtatEtape): Promise<EtatEtape> {
  "use step";
  return logement(entree);
}
etapeLogement.maxRetries = 0;

export async function etapeRecherche(entree: EtatEtape): Promise<EtatEtape> {
  "use step";
  return recherche(entree);
}
etapeRecherche.maxRetries = 0;

export async function etapeAncrage(entree: EtatEtape): Promise<EtatEtape> {
  "use step";
  return ancrage(entree);
}
etapeAncrage.maxRetries = 0;

export async function etapeNotation(entree: EtatEtape): Promise<EtatEtape> {
  "use step";
  return notation(entree);
}
etapeNotation.maxRetries = 0;

export async function etapePlanification(entree: EtatEtape): Promise<EtatEtape> {
  "use step";
  return planification(entree);
}
etapePlanification.maxRetries = 0;

export async function etapeClore(entree: EtatEtape): Promise<EtatEtape> {
  "use step";
  return cloture(entree, "upstream_unavailable");
}
etapeClore.maxRetries = 0;

/** Workflow 1 : l'exécution réservée par `createTrip` ou `retryGeneration`, de l'étape `a` à la publication. */
export async function generatePreview(entree: EtatEtape): Promise<EtatEtape> {
  "use workflow";
  let etat = entree;
  try {
    for (const etape of [etapeBrief, etapeLogement, etapeRecherche, etapeAncrage, etapeNotation, etapePlanification]) {
      if (etat.arret !== undefined) break;
      etat = await etape(etat);
    }
  } catch {
    etat = await etapeClore(etat);
  }
  return etat;
}
