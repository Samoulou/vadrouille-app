import "server-only";

/**
 * Sites des étapes du programme de `p0Run` : code déplacé dans `src/server/programme/sites.ts` (décision 0136 § 1.1,
 * M1a-1), partagé avec la vraie app ; réexporté ici pour que `p0Run` et les tests du prototype ne changent pas d'import
 * (0136 § 1.3).
 */
export {
  avecSiteGarde,
  compteursNonSoumis,
  DELAI_SITE_MS,
  MARGE_SITE_MS,
  SITES_DUREE_MAX_MS,
  SITES_MAX,
  SITES_SIMULTANES,
  sitesDuProgramme,
  verifierSites,
  type CompteursSites,
  type OptionsVerificationSites,
  type ResultatSites,
  type SitesDuProgramme,
  type VerificateurSites,
} from "@/server/programme/sites";
