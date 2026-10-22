// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import type { EtapesRapport, RapportPage } from "@/contracts/prototype-suivi";

/**
 * Contrat du rapport du prototype (décision 0116 § 4.4 ; 0117 § 4 point 2) : nombres d'étapes avec et sans `placeId`,
 * deux entiers seulement, `null` quand ils ne sont pas relevés (exécution sans programme écrit) ; affichés sur la page,
 * jamais dans le texte de « Copier le rapport ».
 */

describe("contrat: rapport du prototype, étapes avec et sans placeId", () => {
  it("contrat: rapport du prototype, étapes avec et sans placeId, null si non relevé sans programme", () => {
    expectTypeOf<RapportPage["etapes"]>().toEqualTypeOf<EtapesRapport | null>();
    expectTypeOf<EtapesRapport>().toEqualTypeOf<{ readonly avecPlaceId: number; readonly sansPlaceId: number }>();
    // Deux nombres seulement : ni nom, ni identifiant, ni motif.
    const etapes: EtapesRapport = { avecPlaceId: 12, sansPlaceId: 1 };
    expect(Object.keys(etapes).sort()).toEqual(["avecPlaceId", "sansPlaceId"]);
    // Le texte à copier reste une chaîne distincte : `etapes` n'en fait pas partie.
    expectTypeOf<RapportPage["texte"]>().toEqualTypeOf<string>();
    // Lot 2a (spécification § 11.4, A24 ; 0122 § 2.3) : nombre d'étapes avec site, sur la page seulement.
    expectTypeOf<keyof RapportPage>().toEqualTypeOf<"execution" | "criteres" | "texte" | "etapes" | "etapesAvecSite">();
    expectTypeOf<RapportPage["etapesAvecSite"]>().toEqualTypeOf<number | null | undefined>();
  });
});
