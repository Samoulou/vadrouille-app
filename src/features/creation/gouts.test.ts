import { describe, expect, it } from "vitest";

import type { RetainedPreference } from "@/contracts";

import { etatDuGout, goutsProposables, type GoutPropose } from "./gouts";

/** Goûts proposés à l'écran 2 (M8c-2, ticket 1131 ; spécification M8 § 5.4 points 2 et 3 ; décision 0160 § 1.6 point 5). */

const EVITER_MUSEES: RetainedPreference = { id: "category:museum:less", origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" } };
const AIMER_DEGUSTATIONS: RetainedPreference = { id: "category:tasting:more", origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" } };
const DISTANCE: RetainedPreference = { id: "distance", origin: "confirmed", subject: { kind: "distance" } };

describe("goûts proposés à l'écran 2 : cases", () => {
  it("« éviter » vise limits, « aimer » vise wishes, dans l'ordre reçu ; « distance » n'a pas de case", () => {
    expect(goutsProposables([AIMER_DEGUSTATIONS, DISTANCE, EVITER_MUSEES])).toEqual([
      { id: "category:tasting:more", category: "tasting", field: "wishes" },
      { id: "category:museum:less", category: "museum", field: "limits" },
    ]);
    expect(goutsProposables([DISTANCE])).toEqual([]);
    expect(goutsProposables([])).toEqual([]);
  });

  it("une case ne porte que la clé, la catégorie et le champ (ni origine, ni voyage d'origine)", () => {
    const avecVoyage = { ...EVITER_MUSEES, fromTripId: "5e471e11-0000-4000-8000-0000000008c2" };
    expect(Object.keys(goutsProposables([avecVoyage])[0] ?? {}).sort()).toEqual(["category", "field", "id"]);
  });
});

describe("goûts proposés à l'écran 2 : état d'une case", () => {
  const eviter: GoutPropose = { id: "category:museum:less", category: "museum", field: "limits" };
  const aimer: GoutPropose = { id: "category:museum:more", category: "museum", field: "wishes" };
  const AUCUNE = new Set<string>();

  it("brief sans la catégorie : libre, même si la case a été cochée puis la catégorie retirée dans son champ", () => {
    expect(etatDuGout(eviter, { wishes: ["nature"], limits: [] }, AUCUNE)).toBe("libre");
    expect(etatDuGout(eviter, { wishes: [], limits: ["market"] }, new Set([eviter.id]))).toBe("libre");
  });

  it("catégorie mise par la case : cochée, modifiable", () => {
    expect(etatDuGout(eviter, { wishes: [], limits: ["museum"] }, new Set([eviter.id]))).toBe("coche");
    expect(etatDuGout(aimer, { wishes: ["museum"], limits: [] }, new Set([aimer.id]))).toBe("coche");
  });

  it("catégorie déjà dans le champ visé sans la case : « Déjà dans ce voyage »", () => {
    expect(etatDuGout(eviter, { wishes: [], limits: ["museum"] }, AUCUNE)).toBe("dejaDansCeVoyage");
    expect(etatDuGout(aimer, { wishes: ["museum"], limits: [] }, AUCUNE)).toBe("dejaDansCeVoyage");
  });

  it("catégorie dans l'autre champ : « Contraire à ce voyage », le brief l'emporte", () => {
    expect(etatDuGout(eviter, { wishes: ["museum"], limits: [] }, AUCUNE)).toBe("contraire");
    expect(etatDuGout(aimer, { wishes: [], limits: ["museum"] }, AUCUNE)).toBe("contraire");
    // « Aimer » et « éviter » retenus pour la même catégorie : cocher l'un rend l'autre contraire.
    expect(etatDuGout(aimer, { wishes: [], limits: ["museum"] }, new Set([eviter.id]))).toBe("contraire");
  });
});
