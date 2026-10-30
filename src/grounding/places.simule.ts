import { z } from "zod";

import { ErreurAncrage, STATUTS_GOOGLE, type ClientLieux, type ClientPlacesMvp } from "@/grounding/interfaces";

/**
 * Double de Places à **valeurs sentinelles** (contrainte 8 : aucune réponse réelle de Google enregistrée). Les
 * fixtures (`prototype/fixtures/places/`) associent un nom maison à un lieu fictif : `placeId` sentinelle, nom
 * `SENTINELLE-NOM-GOOGLE`, adresse, coordonnée `55.9533123`, horaires, note et niveau de prix sentinelles.
 */

const LieuSchema = z.strictObject({
  placeId: z.string().min(1).max(256),
  statut: z.enum(STATUTS_GOOGLE),
  position: z.strictObject({ lat: z.number(), lng: z.number() }),
  horaires: z
    .array(z.strictObject({ jour: z.number().int(), debut: z.number().int(), fin: z.number().int(), finLendemain: z.number().int().optional() }))
    .nullable(),
  nom: z.string(),
  adresse: z.string(),
  note: z.number(),
  niveauPrix: z.string(),
});

export const FixturesPlacesSchema = z.strictObject({
  /** Lieu par nom maison (ou texte du logement). Un nom absent n'est pas résolu. */
  lieux: z.record(z.string(), LieuSchema),
  /**
   * B8a : nouvel identifiant rendu par `identifiant` pour un `placeId` rafraîchi (B8-PO-12). Absent : chaque lieu connu
   * garde son identifiant. Les fixtures de P0 n'en ont pas (comportement de `pnpm p0` inchangé).
   */
  renommes: z.record(z.string(), z.string().min(1).max(256)).optional(),
});
export type FixturesPlaces = z.infer<typeof FixturesPlacesSchema>;

/** Texte maison d'une requête Text Search : « <nom>, <destination> » ; le double garde la partie nom. */
function nomDe(texte: string): string {
  const separateur = texte.lastIndexOf(", ");
  return separateur === -1 ? texte : texte.slice(0, separateur);
}

export function creerPlacesSimule(fixtures: FixturesPlaces): ClientPlacesMvp {
  const parPlaceId = new Map(Object.values(fixtures.lieux).map((lieu) => [lieu.placeId, lieu]));
  const parNom = new Map(Object.entries(fixtures.lieux));
  const renommes = new Map(Object.entries(fixtures.renommes ?? {}));
  return {
    async textSearch(requete) {
      const lieu = parNom.get(nomDe(requete.texte));
      return { placeIds: lieu === undefined ? [] : [lieu.placeId] };
    },
    async details(placeId) {
      const lieu = parPlaceId.get(placeId);
      if (lieu === undefined) throw new ErreurAncrage("place_not_found");
      return { ...lieu, horaires: lieu.horaires === null ? null : lieu.horaires.map((plage) => ({ ...plage })) };
    },
    // B8a (0085 § 2) : masque `id,location` ; introuvable comme `details`.
    async position(placeId) {
      const lieu = parPlaceId.get(placeId);
      if (lieu === undefined) throw new ErreurAncrage("place_not_found");
      return { placeId, position: { ...lieu.position } };
    },
    // B8a (0085 § 2, B8-PO-12) : masque `id` ; un identifiant renommé rend le nouveau, un inconnu est introuvable.
    async identifiant(placeId) {
      const nouveau = renommes.get(placeId);
      if (nouveau !== undefined) return { placeId: nouveau };
      if (!parPlaceId.has(placeId)) throw new ErreurAncrage("place_not_found");
      return { placeId };
    },
  };
}

/**
 * Valeurs sentinelles du double de la recherche d'un lieu à soi (décision 0147 § 12 S3) : nom et adresse Google simulés,
 * cherchés par les tests dans la base, le journal, les réponses de l'ajout, l'adresse, le stockage du navigateur et les
 * requêtes de modèle (ils ne doivent y apparaître nulle part).
 */
export const SENTINELLE_NOM_LIEU = "SENTINELLE-NOM-LIEU-M5D";
export const SENTINELLE_ADRESSE_LIEU = "SENTINELLE-ADRESSE-LIEU-M5D";

/**
 * Double de la recherche d'un lieu à soi (M5d-1, décision 0147 § 3 point 1 et § 12 S3) : aucun appel, aucune réponse réelle
 * de Google. Rend `resultats` résultats (5 au plus, 3 par défaut ; 0 pour « Aucun lieu trouvé. »), chacun au `placeId`
 * sentinelle `ChIJ-M5D-<rang>`, au nom `SENTINELLE-NOM-LIEU-M5D` et à l'adresse `SENTINELLE-ADRESSE-LIEU-M5D` (suivis du
 * rang). Les requêtes reçues sont gardées dans `requetes` (texte et ville), pour les tests seulement.
 */
export function creerRechercheLieuxSimulee(options: { readonly resultats?: number } = {}): ClientLieux & {
  readonly requetes: { readonly texte: string; readonly ville: string | null }[];
} {
  const nombre = Math.max(0, Math.min(5, options.resultats ?? 3));
  const requetes: { texte: string; ville: string | null }[] = [];
  return {
    requetes,
    async rechercherLieux(texte, ville) {
      requetes.push({ texte, ville });
      return Array.from({ length: nombre }, (_, rang) => ({
        placeId: `ChIJ-M5D-${String(rang + 1)}`,
        nom: `${SENTINELLE_NOM_LIEU} ${String(rang + 1)}`,
        adresse: rang === nombre - 1 && nombre > 1 ? null : `${SENTINELLE_ADRESSE_LIEU} ${String(rang + 1)}`,
      }));
    },
  };
}
