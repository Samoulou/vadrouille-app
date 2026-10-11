/**
 * Adresse des écrans 6 et 6b « Présentation » (spécification D1, D1-PO-4). `tripRoutes` (décision 0015
 * § 1) ne la connaît pas : sa base `/dev/voyages` n'a pas de présentation. Le Tech Lead peut préférer une
 * méthode `presentation()` de `tripRoutes` (D1-Q2). L'identifiant est encodé.
 */
export function presentationRoute(tripId: string): string {
  return `/voyages/${encodeURIComponent(tripId)}/presentation`;
}
