"use server";

import { isPrototypeAdapter, photoLieuEssai } from "@/adapters";
import { PlacePhotoRequestSchema, type PlacePhotoResponse } from "@/contracts/photo";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Photo d'une carte du tri « J'aime / Pas pour moi » d'un voyage d'essai (décision 0128, demande de Samuel du
 * 2026-10-23 15:23 UTC), appelée par l'écran quand la carte s'affiche.
 *
 * - Hors adaptateur `prototype` : `{ photo: null }`, avant toute lecture de l'entrée ou du contexte, aucun appel.
 * - Entrée revalidée (`PlacePhotoRequestSchema`, stricte : un `placeId` de forme Google) ; contexte de la requête
 *   (organisation de l'essai), jamais de l'entrée.
 * - Toujours `{ photo: PlacePhoto | null }` : `null` sans session, garde fermée (production, autre branche, cookie d'accès
 *   absent), aucune photo, quota ou erreur ; la carte garde alors son emplacement « photo », sans message. Aucun journal ici.
 * - Le voyage n'est pas lu (une lecture du programme coûterait des relectures) : le lieu est contrôlé par sa forme, et la
 *   garde (code d'accès) borne qui peut demander une photo. Réponse d'action, jamais gardée en cache.
 */
export async function photoDuLieuEssai(input: unknown): Promise<PlacePhotoResponse> {
  if (!isPrototypeAdapter()) return { photo: null };
  const parsed = PlacePhotoRequestSchema.safeParse(input);
  if (!parsed.success) return { photo: null };
  try {
    const ctx = await contexteFacultatif();
    if (ctx === null) return { photo: null };
    return { photo: await photoLieuEssai(ctx, parsed.data.placeId) };
  } catch {
    return { photo: null };
  }
}
