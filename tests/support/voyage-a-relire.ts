import type { VoyageARelire } from "@/domain/relectures";

/** `VoyageARelire` complet de test : logements par nuit, séjour de chaque nuit à lieu connu (ou sans lieu si `null`). */
export function voyageARelire(logementsParNuit: readonly (string | null)[], portee: VoyageARelire["portee"] = "voyage"): VoyageARelire {
  return {
    logementsParNuit,
    contexte: { organizationId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002", tripId: "00000000-0000-4000-8000-000000000003" },
    portee,
    sejoursParNuit: logementsParNuit.map((placeId) => ({ placeId, ville: null, centre: null, type: placeId === null ? "none" : "lodging", logement: placeId === null ? "none" : "known" })),
  };
}
