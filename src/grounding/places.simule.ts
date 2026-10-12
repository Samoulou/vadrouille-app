import { z } from "zod";

import { ErreurAncrage, STATUTS_GOOGLE, type ClientPlaces } from "@/grounding/interfaces";

/**
 * Double de Places à **valeurs sentinelles** (contrainte 8 : aucune réponse réelle de Google enregistrée). Les
 * fixtures (`prototype/fixtures/places/`) associent un nom maison à un lieu fictif : `placeId` sentinelle, nom
 * `SENTINELLE-NOM-GOOGLE`, adresse, coordonnée `55.9533123`, horaires, note et niveau de prix sentinelles.
 */

const LieuSchema = z.strictObject({
  placeId: z.string().min(1).max(256),
  statut: z.enum(STATUTS_GOOGLE),
  position: z.strictObject({ lat: z.number(), lng: z.number() }),
  horaires: z.array(z.strictObject({ jour: z.number().int(), debut: z.number().int(), fin: z.number().int() })).nullable(),
  nom: z.string(),
  adresse: z.string(),
  note: z.number(),
  niveauPrix: z.string(),
});

export const FixturesPlacesSchema = z.strictObject({
  /** Lieu par nom maison (ou texte du logement). Un nom absent n'est pas résolu. */
  lieux: z.record(z.string(), LieuSchema),
});
export type FixturesPlaces = z.infer<typeof FixturesPlacesSchema>;

/** Texte maison d'une requête Text Search : « <nom>, <destination> » ; le double garde la partie nom. */
function nomDe(texte: string): string {
  const separateur = texte.lastIndexOf(", ");
  return separateur === -1 ? texte : texte.slice(0, separateur);
}

export function creerPlacesSimule(fixtures: FixturesPlaces): ClientPlaces {
  const parPlaceId = new Map(Object.values(fixtures.lieux).map((lieu) => [lieu.placeId, lieu]));
  return {
    async textSearch(requete) {
      const lieu = fixtures.lieux[nomDe(requete.texte)];
      return { placeIds: lieu === undefined ? [] : [lieu.placeId] };
    },
    async details(placeId) {
      const lieu = parPlaceId.get(placeId);
      if (lieu === undefined) throw new ErreurAncrage("place_not_found");
      return { ...lieu, horaires: lieu.horaires === null ? null : lieu.horaires.map((plage) => ({ ...plage })) };
    },
  };
}
