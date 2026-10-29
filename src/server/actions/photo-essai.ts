"use server";

import { cheminPhotosDuTri, photoLieuApi, photoLieuEssai } from "@/adapters";
import { PlacePhotoRequestSchema, type PlacePhotoResponse } from "@/contracts/photo";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Photo d'une carte du tri « J'aime / Pas pour moi » (décision 0128, demande de Samuel du 2026-10-23 15:23 UTC),
 * appelée par l'écran quand la carte s'affiche : voyage d'essai (adaptateur `prototype`) et, depuis M1e (ticket 879),
 * voyage de la vraie app (adaptateur `api`).
 *
 * - Hors adaptateurs `prototype` et `api` : `{ photo: null }`, avant toute lecture de l'entrée ou du contexte, aucun appel.
 * - Entrée revalidée (`PlacePhotoRequestSchema`, stricte : la carte, `tripId` et `proposalId`, **jamais un identifiant
 *   de lieu**) ; contexte de la requête (organisation de la session), jamais de l'entrée. Le lieu est lu sur la
 *   proposition du voyage demandé, dans cette organisation : `photoLieuEssai` (site d'essai) ou `photoLieuApi` (`api`,
 *   lecture en base) ; une proposition d'un autre voyage ou inconnue vaut `null` (F13-TL-2).
 * - Toujours `{ photo: PlacePhoto | null }` : `null` sans session, garde ou barrière fermée (site d'essai : production,
 *   autre branche, cookie d'accès absent ; `api` : barrière B9-TL-8), aucune photo, cadence (40 par heure), quota ou
 *   erreur ; la carte garde alors son emplacement « photo », sans message. Aucun journal ici. Réponse d'action (POST,
 *   jamais mise en cache par Next.js ni par le navigateur).
 */
export async function photoDuLieuEssai(input: unknown): Promise<PlacePhotoResponse> {
  const chemin = cheminPhotosDuTri();
  if (chemin === null) return { photo: null };
  const parsed = PlacePhotoRequestSchema.safeParse(input);
  if (!parsed.success) return { photo: null };
  try {
    const ctx = await contexteFacultatif();
    if (ctx === null) return { photo: null };
    return { photo: await (chemin === "prototype" ? photoLieuEssai(ctx, parsed.data) : photoLieuApi(ctx, parsed.data)) };
  } catch {
    return { photo: null };
  }
}
