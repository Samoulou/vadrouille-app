import { MODELE_ID_PATTERN, MOTEURS_RECHERCHE_WEB } from "@/ai/reglages";
import { BornesRechercheSchema, bornesMini, ProfilMiniSchema } from "@/research/bornes";
import { TYPES_CRENEAU } from "@/ai/candidat";
import { chargerConfigurationIa, type ConfigurationIa } from "@/server/config/ia";

/**
 * Validation **de fond** de la configuration de production de la couche IA (décision 0096 § 3 point 1) : `ia.ts` ne
 * contrôle que la forme (il n'importe ni `@/ai` ni `@/research`) ; cette fonction de test compose `chargerConfigurationIa`
 * et les trois règles de fond, **sans en recopier aucune** :
 * - les bornes des profils : `BornesRechercheSchema` (cibles à 0 admises, au moins une non nulle, somme au plus le
 *   total, délai borné) pour `apercu` et `complet`, `ProfilMiniSchema` (une cible à 0 refusée) et `bornesMini` pour
 *   chaque type de créneau du profil `mini` ;
 * - l'identifiant de modèle : `MODELE_ID_PATTERN`, 100 caractères au plus ;
 * - le moteur du greffon `web` : `MOTEURS_RECHERCHE_WEB`.
 * C'est elle qui refuse « hors bornes » dans les tests ; la composition de B9c applique les mêmes règles au chargement de
 * son module (échec au démarrage). Lève une erreur (`ZodError` ou `Error`) au premier écart.
 */
export function validerConfigurationIa(production: unknown, modeles: unknown, recherche: unknown): ConfigurationIa {
  const configuration = chargerConfigurationIa(production, modeles, recherche);
  const { apercu, complet, mini } = configuration.profils;
  BornesRechercheSchema.parse(apercu);
  BornesRechercheSchema.parse(complet);
  const profilMini = ProfilMiniSchema.parse(mini);
  for (const creneau of TYPES_CRENEAU) BornesRechercheSchema.parse(bornesMini(profilMini, creneau, apercu.ageSourceMaxJours));
  const reglages = [...Object.values(configuration.reglages), configuration.recherche, configuration.rechercheWeb];
  for (const { modele } of reglages) {
    if (modele.length > 100 || !MODELE_ID_PATTERN.test(modele)) throw new Error("identifiant de modèle hors de MODELE_ID_PATTERN");
  }
  if (!(MOTEURS_RECHERCHE_WEB as readonly string[]).includes(configuration.rechercheWeb.moteur)) throw new Error("moteur de recherche web inconnu");
  return configuration;
}
