// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { ErreurForfait, forfaitExecution, forfaitRelecture, LIMITES_PROTOTYPE, refusDuForfait, type SommesForfaits } from "@/server/usage/forfait";

/** Forfait d'une exécution ou d'une relecture (décision 0046, D13 point 3, S4). */

const TABLE = TablePrixGoogleSchema.parse(JSON.parse(readFileSync(path.join(import.meta.dirname, "../../../prototype/config/prix-google.json"), "utf8")));
const SKUS = { textSearch: "places_text_search_essentials_ids_only", details: "places_details_enterprise", matrice: "routes_matrix_essentials" };
const PLAFONDS = { placesTextSearch: 90, placesDetails: 90, routesRequetes: 60, routesElements: 4000 };

const VIDE: SommesForfaits = {
  jour: { textSearchRequetes: 0, placeDetailsRequetes: 0, routesRequetes: 0, routesElements: 0 },
  moisGoogleMicros: 0,
  enveloppeGoogleMicros: 0,
  moisModelesMicros: 0,
  enveloppeModelesMicros: 0,
};

describe("p0: forfait au prix catalogue plein", () => {
  it("exécution : plafonds par méthode au prix plein, sans tranche gratuite, plus le plafond des modèles", () => {
    const forfait = forfaitExecution(TABLE, SKUS, PLAFONDS, 3_000_000);
    // Text Search IDs only : 0 USD ; Place Details Enterprise : 90 × 20 USD / 1 000 ; Routes Essentials : 4 000 × 5 USD / 1 000.
    expect(forfait).toEqual({
      nature: "execution",
      textSearchRequetes: 90,
      placeDetailsRequetes: 90,
      routesRequetes: 60,
      routesElements: 4000,
      coutGoogleMicros: 1_800_000 + 20_000_000,
      coutModelesMicros: 3_000_000,
    });
  });

  it("S4 : deux exécutions du même mode ont le même forfait (fonction de la configuration seule)", () => {
    expect(forfaitExecution(TABLE, SKUS, PLAFONDS, 3_000_000)).toEqual(forfaitExecution(TABLE, { ...SKUS }, { ...PLAFONDS }, 3_000_000));
  });

  it("relecture : Routes seulement, aucun coût de modèle", () => {
    expect(forfaitRelecture(TABLE, SKUS, { routesRequetes: 1, routesElements: 20 })).toEqual({
      nature: "relecture",
      textSearchRequetes: 0,
      placeDetailsRequetes: 0,
      routesRequetes: 1,
      routesElements: 20,
      coutGoogleMicros: 100_000,
      coutModelesMicros: null,
    });
  });

  it("SKU inconnu, d'une autre méthode ou plafond invalide : erreur", () => {
    expect(() => forfaitExecution(TABLE, { ...SKUS, details: "inconnu" }, PLAFONDS, 0)).toThrow(ErreurForfait);
    expect(() => forfaitExecution(TABLE, { ...SKUS, details: "routes_matrix_pro" }, PLAFONDS, 0)).toThrow(ErreurForfait);
    expect(() => forfaitExecution(TABLE, SKUS, { ...PLAFONDS, placesDetails: -1 }, 0)).toThrow(ErreurForfait);
    expect(() => forfaitExecution(TABLE, SKUS, { ...PLAFONDS, placesDetails: 1.5 }, 0)).toThrow(ErreurForfait);
  });
});

describe("p0: plafonds du lancement comparés aux forfaits", () => {
  const forfait = forfaitExecution(TABLE, SKUS, { ...PLAFONDS, routesElements: 400 }, 3_000_000);

  it("limites de la spécification : 95 par jour, 20 et 40 USD Google, 40 et 80 USD modèles", () => {
    expect(LIMITES_PROTOTYPE).toEqual({
      quotaJourParMethode: 95,
      moisGoogleMicros: 20_000_000,
      enveloppeGoogleMicros: 40_000_000,
      moisModelesMicros: 40_000_000,
      enveloppeModelesMicros: 80_000_000,
    });
    expect(refusDuForfait(VIDE, forfait, LIMITES_PROTOTYPE, "requetes")).toBeNull();
  });

  it("jour entamé : daily_quota_insufficient, dans l'unité du quota Routes", () => {
    expect(refusDuForfait({ ...VIDE, jour: { ...VIDE.jour, placeDetailsRequetes: 6 } }, forfait, LIMITES_PROTOTYPE, "requetes")).toBe("daily_quota_insufficient");
    expect(refusDuForfait({ ...VIDE, jour: { ...VIDE.jour, placeDetailsRequetes: 5 } }, forfait, LIMITES_PROTOTYPE, "requetes")).toBeNull();
    expect(refusDuForfait(VIDE, forfait, LIMITES_PROTOTYPE, "elements")).toBe("daily_quota_insufficient");
  });

  it("enveloppe jusqu'à G0 puis plafond du mois", () => {
    expect(refusDuForfait({ ...VIDE, enveloppeGoogleMicros: 37_000_001 }, forfait, LIMITES_PROTOTYPE, "requetes")).toBe("envelope_reached");
    expect(refusDuForfait({ ...VIDE, enveloppeModelesMicros: 77_000_001 }, forfait, LIMITES_PROTOTYPE, "requetes")).toBe("envelope_reached");
    expect(refusDuForfait({ ...VIDE, moisGoogleMicros: 17_000_001 }, forfait, LIMITES_PROTOTYPE, "requetes")).toBe("cap_reached");
    expect(refusDuForfait({ ...VIDE, moisModelesMicros: 37_000_001 }, forfait, LIMITES_PROTOTYPE, "requetes")).toBe("cap_reached");
    expect(refusDuForfait({ ...VIDE, moisModelesMicros: 37_000_000 }, forfait, LIMITES_PROTOTYPE, "requetes")).toBeNull();
  });

  it("au forfait, 13 exécutions réelles par mois au plus pour les modèles (0046, « Conséquence sur l'argent »)", () => {
    const parMois = Math.floor(LIMITES_PROTOTYPE.moisModelesMicros / 3_000_000);
    expect(parMois).toBe(13);
  });
});
