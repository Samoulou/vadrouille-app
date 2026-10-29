import "server-only";

/**
 * Conversion du formulaire de l'app vers le brief de la chaîne inversée : code déplacé dans
 * `src/server/programme/brief.ts` (décision 0136 § 1.1, M1a-1), partagé avec la vraie app ; réexporté ici pour que
 * `p0Run` et les tests du prototype ne changent pas d'import (0136 § 1.3).
 */
export {
  briefDepuisFormulaire,
  DEPLACEMENTS_PAR_DEFAUT,
  niveauBudgetRepas,
  texteDuLogement,
  type BriefEssai,
  type ChampRefuse,
  type ResultatConversion,
  type RythmeEssai,
} from "@/server/programme/brief";
