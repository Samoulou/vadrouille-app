import { z } from "zod";

/**
 * Photo d'un lieu du tri « J'aime / Pas pour moi » d'un voyage d'essai (décision 0128, demande de Samuel du
 * 2026-10-23 15:23 UTC). **Chargée à la demande**, jamais stockée : c'est la forme de `Proposal.photoUrl` (« chargé à la
 * demande », `snapshot.ts`) enrichie des attributions que Google exige avec une photo. Donnée Google : elle ne va ni en
 * base, ni dans un journal, ni dans un prompt, ni dans un cache (réponse d'action, jamais gardée).
 *
 * Non exporté par `src/contracts/index.ts` : un contrat de transport d'une seule action (`photoDuLieuEssai`,
 * `src/server/actions/photo-essai.ts`), hors des contrats du voyage et de leurs catégories
 * (`tests/unit/contracts/categories.test.ts`). Le client n'en importe que le type (décision 0016 § 3.1).
 */
export const PlacePhotoSchema = z.strictObject({
  /** Image (`photoUri` de Place Photos (New)) : `https`, hôte `googleusercontent.com`, adresse de courte durée. */
  url: z.url({ protocol: /^https$/ }),
  /** Auteurs de la photo (`authorAttributions`), affichés avec elle ; lien vers leur profil s'il est sûr. */
  authors: z.array(z.strictObject({ name: z.string().min(1).max(120), profileUrl: z.url({ protocol: /^https$/ }).optional() })).max(10),
  /** Lien de la photo sur Google Maps (`googleMapsUri`) : l'accès à la photo source exigé par Google. */
  mapsUrl: z.url({ protocol: /^https$/ }).optional(),
});
export type PlacePhoto = z.infer<typeof PlacePhotoSchema>;

/** Entrée de l'action : l'identifiant de lieu de l'étape (`Stop.placeId`, seule donnée Google stockée), de forme Google. */
export const PlacePhotoRequestSchema = z.strictObject({ placeId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/) });
export type PlacePhotoRequest = z.infer<typeof PlacePhotoRequestSchema>;

/** Réponse de l'action : `null` sans photo, garde fermée, quota ou erreur (aucune distinction côté client). */
export const PlacePhotoResponseSchema = z.strictObject({ photo: PlacePhotoSchema.nullable() });
export type PlacePhotoResponse = z.infer<typeof PlacePhotoResponseSchema>;
