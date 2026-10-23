import { z } from "zod";

import { TRIP_ID_PATTERN } from "./values";

/**
 * Photo d'un lieu du tri « J'aime / Pas pour moi » d'un voyage d'essai (décision 0128, demande de Samuel du
 * 2026-10-23 15:23 UTC ; spécification F13, option A). **Chargée à la demande**, jamais stockée. Contrat de transport
 * d'une seule action (`photoDuLieuEssai`, `src/server/actions/photo-essai.ts`), consigné par 0128 § 6 (0123 § 2) :
 * il **ne remplace pas** `Proposal.photoUrl` (`src/contracts/trip.ts`), que F13-TL-1 retirerait et que 0128 garde tel quel
 * (jamais rempli, aucun adaptateur ne l'écrit ; retrait reporté avec l'amendement de 0010). Donnée Google : elle ne va ni
 * en base, ni dans un journal, ni dans un prompt, ni dans un cache.
 *
 * Non exporté par `src/contracts/index.ts` : hors des contrats du voyage et de leurs catégories
 * (`tests/unit/contracts/categories.test.ts`). Le client n'en importe que le type (décision 0016 § 3.1) et refait le
 * contrôle de l'hôte (`lirePhoto`, `src/features/presentation/photo.ts`).
 */

/** Hôtes admis : l'image chez `googleusercontent.com`, les liens chez `google.com` ou `goo.gl` (comme `places-client.ts`). */
const HOTES_IMAGE = ["googleusercontent.com"] as const;
const HOTES_LIENS = ["google.com", "goo.gl"] as const;

/** Adresse `https` sans identifiants ni port, dont l'hôte est l'un des domaines donnés ou l'un de leurs sous-domaines. */
export function adresseGoogleSure(brut: string, hotes: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return false;
  const hote = url.hostname.toLowerCase();
  return hotes.some((suffixe) => hote === suffixe || hote.endsWith(`.${suffixe}`));
}

const adresse = (hotes: readonly string[]) =>
  z
    .url({ protocol: /^https$/ })
    .max(2048)
    .refine((brut) => adresseGoogleSure(brut, hotes));

export const PlacePhotoSchema = z.strictObject({
  /** Image (`photoUri` de Place Photos (New)) : `https`, hôte `googleusercontent.com`, adresse de courte durée. */
  url: adresse(HOTES_IMAGE),
  /** Auteurs de la photo (`authorAttributions`), affichés avec elle ; lien vers leur profil s'il est sûr. */
  authors: z.array(z.strictObject({ name: z.string().min(1).max(120), profileUrl: adresse(HOTES_LIENS).optional() })).max(10),
  /** Lien de la photo sur Google Maps (`googleMapsUri`) : l'accès à la photo source exigé par Google. */
  mapsUrl: adresse(HOTES_LIENS).optional(),
});
export type PlacePhoto = z.infer<typeof PlacePhotoSchema>;

/**
 * Entrée de l'action : la carte (proposition `proposalId` du voyage `tripId`), **jamais un identifiant de lieu** : le
 * serveur lit le lieu sur la proposition du voyage, dans le contexte de la requête (F13-TL-2, bloquant 2 de la revue du
 * head `8232ddb`).
 */
export const PlacePhotoRequestSchema = z.strictObject({
  tripId: z.string().regex(TRIP_ID_PATTERN),
  proposalId: z.string().min(1).max(128),
});
export type PlacePhotoRequest = z.infer<typeof PlacePhotoRequestSchema>;

/** Réponse de l'action : `null` sans photo, garde fermée, cadence, quota ou erreur (aucune distinction côté client). */
export const PlacePhotoResponseSchema = z.strictObject({ photo: PlacePhotoSchema.nullable() });
export type PlacePhotoResponse = z.infer<typeof PlacePhotoResponseSchema>;
