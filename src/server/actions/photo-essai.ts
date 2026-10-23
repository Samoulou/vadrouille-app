"use server";

import { isPrototypeAdapter, photoLieuEssai } from "@/adapters";
import { PlacePhotoRequestSchema, type PlacePhotoResponse } from "@/contracts/photo";
import { contexteFacultatif } from "@/features/compte/session";

/**
 * Photo d'une carte du tri « J'aime / Pas pour moi » d'un voyage d'essai (décision 0128, demande de Samuel du
 * 2026-10-23 15:23 UTC), appelée par l'écran quand la carte s'affiche.
 *
 * - Hors adaptateur `prototype` : `{ photo: null }`, avant toute lecture de l'entrée ou du contexte, aucun appel.
 * - Entrée revalidée (`PlacePhotoRequestSchema`, stricte : la carte, `tripId` et `proposalId`, **jamais un identifiant
 *   de lieu**) ; contexte de la requête (organisation de l'essai), jamais de l'entrée. Le lieu est lu sur la proposition
 *   du voyage demandé par `photoLieuEssai` (F13-TL-2) : une proposition d'un autre voyage ou inconnue vaut `null`.
 * - Toujours `{ photo: PlacePhoto | null }` : `null` sans session, garde fermée (production, autre branche, cookie d'accès
 *   absent), aucune photo, cadence (40 par heure), quota ou erreur ; la carte garde alors son emplacement « photo », sans
 *   message. Aucun journal ici. Réponse d'action (POST, jamais mise en cache par Next.js ni par le navigateur).
 */
export async function photoDuLieuEssai(input: unknown): Promise<PlacePhotoResponse> {
  if (!isPrototypeAdapter()) return { photo: null };
  const parsed = PlacePhotoRequestSchema.safeParse(input);
  if (!parsed.success) return { photo: null };
  try {
    const ctx = await contexteFacultatif();
    if (ctx === null) return { photo: null };
    return { photo: await photoLieuEssai(ctx, parsed.data) };
  } catch {
    return { photo: null };
  }
}
