import { CHECKOUT_ID_PATTERN } from "@/contracts/values";

/**
 * Adresse des écrans 6 et 6b « Présentation » (spécification D1, D1-PO-4). `tripRoutes` (décision 0015
 * § 1) ne la connaît pas : sa base `/dev/voyages` n'a pas de présentation. Le Tech Lead peut préférer une
 * méthode `presentation()` de `tripRoutes` (D1-Q2). L'identifiant est encodé.
 */
export function presentationRoute(tripId: string): string {
  return `/voyages/${encodeURIComponent(tripId)}/presentation`;
}

export interface UnlockRoutes {
  /** `R9` « Débloquer », avec le paramètre `paiement` au retour d'un échec. */
  debloquer(paiementId?: string): string;
  /** `R9-sim` : page de paiement simulé. */
  paiementSimule(paiementId: string): string;
  /** `R9-retour` : confirmation du paiement. */
  confirmation(paiementId: string): string;
}

/**
 * Adresses du parcours « Débloquer » (décision 0020 § 5) : seul module qui les écrit, et seul qui relit le
 * paramètre `paiement` (`parsePaiementParam`). Identifiants encodés. Aucune adresse du parcours n'est
 * concaténée ailleurs.
 */
export function unlockRoutes(tripId: string): UnlockRoutes {
  const debloquer = `/voyages/${encodeURIComponent(tripId)}/debloquer`;
  return {
    debloquer: (paiementId) => (paiementId === undefined ? debloquer : `${debloquer}?paiement=${encodeURIComponent(paiementId)}`),
    paiementSimule: (paiementId) => `${debloquer}/paiement-simule/${encodeURIComponent(paiementId)}`,
    confirmation: (paiementId) => `${debloquer}/confirmation?paiement=${encodeURIComponent(paiementId)}`,
  };
}

/**
 * Paramètre `paiement` (ou segment `[paiementId]`) lu par les pages : l'identifiant s'il respecte
 * `CHECKOUT_ID_PATTERN`, sinon `null` (absent, tableau, vide, caractère hors motif).
 */
export function parsePaiementParam(value: string | string[] | undefined | null): string | null {
  return typeof value === "string" && CHECKOUT_ID_PATTERN.test(value) ? value : null;
}
