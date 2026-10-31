/**
 * Bouton ou lien en `aria-disabled` (hors ligne, F7-PO-13) : rendu de l'état désactivé, toujours atteignable au clavier.
 * Module sans dépendance (M6b, ticket 1005) : « Ajouter au calendrier » le lit sans charger `RevisionPreview` dans le
 * JavaScript initial du Séjour ; `RevisionPreview` le réexporte pour ses autres lecteurs.
 */
export const ARIA_DISABLED = "aria-disabled:cursor-not-allowed aria-disabled:border-muted aria-disabled:bg-muted aria-disabled:text-ink-soft";
