import "server-only";

/**
 * Règles de l'aperçu (décision 0136 § 1.7, M1a-1) : **réexportation seule** de `src/domain/apercu.ts`, pour les
 * adaptateurs du site d'essai (`src/adapters/prototype-parcours.ts`, `prototype-lecture.ts`), qui ne peuvent pas
 * atteindre `src/domain` (frontière de 0048 § 1). `src/server` importe `@/domain/apercu` directement. Aucune copie :
 * les fonctions sont les mêmes objets (test `apercu: fonctions du site d'essai = celles de src/domain/apercu.ts`).
 */
export {
  avecBadgeSansLieu,
  CATEGORIE_ACTIVITE,
  CATEGORIE_REPAS,
  etapeEnCase,
  JOURS_APERCU,
  selectionApercu,
  servisAvantDeblocage,
  type EtapeEnCase,
  type EtapeLue,
  type JourLu,
  type SelectionApercu,
} from "@/domain/apercu";
