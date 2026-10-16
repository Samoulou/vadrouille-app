// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import type { UNITES_QUOTA_ROUTES } from "@/prototype/config";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { ErreurForfait, forfaitExecution, forfaitRelecture, LIMITES_PROTOTYPE, QUOTA_ROUTES_ELEMENTS_PAR_MINUTE, refusDuForfait, type SommesForfaits, type UniteQuotaRoutes } from "@/server/usage/forfait";

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

/**
 * Limites levées par la décision 0071 (valeurs de 0046 D13 point 3) : elles éprouvent le mécanisme de `refusDuForfait`,
 * qui reste, sans être appliqué au lancement du prototype (`LIMITES_PROTOTYPE`).
 */
const LIMITES_EPROUVEES = {
  quotaJourParMethode: 95,
  moisGoogleMicros: 20_000_000,
  enveloppeGoogleMicros: 40_000_000,
  moisModelesMicros: 40_000_000,
  enveloppeModelesMicros: 80_000_000,
};

describe("p0: plafonds du lancement comparés aux forfaits", () => {
  const forfait = forfaitExecution(TABLE, SKUS, { ...PLAFONDS, routesElements: 400 }, 3_000_000);

  it("0071 : aucune limite du jour, du mois ni d'enveloppe au lancement du prototype", () => {
    expect(LIMITES_PROTOTYPE).toEqual({
      quotaJourParMethode: Number.POSITIVE_INFINITY,
      moisGoogleMicros: Number.POSITIVE_INFINITY,
      enveloppeGoogleMicros: Number.POSITIVE_INFINITY,
      moisModelesMicros: Number.POSITIVE_INFINITY,
      enveloppeModelesMicros: Number.POSITIVE_INFINITY,
    });
    expect(refusDuForfait(VIDE, forfait, LIMITES_PROTOTYPE, "requetes")).toBeNull();
    const charge: SommesForfaits = {
      jour: { textSearchRequetes: 1_000_000, placeDetailsRequetes: 1_000_000, routesRequetes: 1_000_000, routesElements: 1_000_000 },
      moisGoogleMicros: 1e12,
      enveloppeGoogleMicros: 1e12,
      moisModelesMicros: 1e12,
      enveloppeModelesMicros: 1e12,
    };
    expect(refusDuForfait(charge, forfait, LIMITES_PROTOTYPE, "requetes")).toBeNull();
    expect(refusDuForfait(charge, forfait, LIMITES_PROTOTYPE, "elements")).toBeNull();
  });

  it("jour entamé : daily_quota_insufficient, dans l'unité du quota Routes", () => {
    expect(refusDuForfait({ ...VIDE, jour: { ...VIDE.jour, placeDetailsRequetes: 6 } }, forfait, LIMITES_EPROUVEES, "requetes")).toBe("daily_quota_insufficient");
    expect(refusDuForfait({ ...VIDE, jour: { ...VIDE.jour, placeDetailsRequetes: 5 } }, forfait, LIMITES_EPROUVEES, "requetes")).toBeNull();
  });

  it("p0: Q330, quota Routes en éléments sans seuil du jour, 3 000 par minute", () => {
    expect(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE).toBe(3_000);
    // Unités de la configuration du mode réel (`src/prototype/config.ts`, module pur) égales à celles du port.
    expectTypeOf<(typeof UNITES_QUOTA_ROUTES)[number]>().toEqualTypeOf<UniteQuotaRoutes>();
    // 400 éléments, jour déjà chargé en éléments et en requêtes Routes : aucun seuil du jour en unité « éléments ».
    const jourCharge = { ...VIDE, jour: { ...VIDE.jour, routesElements: 10_000, routesRequetes: 1_000 } };
    expect(refusDuForfait(jourCharge, forfait, LIMITES_EPROUVEES, "elements")).toBeNull();
    // Le même jour en unité « requêtes » (hypothèse écartée) : refusé au seuil de 95.
    expect(refusDuForfait(jourCharge, forfait, LIMITES_EPROUVEES, "requetes")).toBe("daily_quota_insufficient");
    // 500 éléments (0053) : accepté ; 3 000 : accepté ; 3 001 : refusé, il ne tiendrait pas dans la cadence d'une minute.
    // Ce contrôle propre au forfait reste appliqué au lancement du prototype (0071) : il vaut aussi pour `LIMITES_PROTOTYPE`.
    for (const [elements, attendu] of [
      [500, null],
      [3_000, null],
      [3_001, "daily_quota_insufficient"],
    ] as const) {
      const f = forfaitExecution(TABLE, SKUS, { ...PLAFONDS, routesElements: elements }, 3_000_000);
      // Montants Google hors de cause ici (3 000 éléments dépassent les 20 USD du mois) : seule l'unité Routes est éprouvée.
      const limites = { ...LIMITES_EPROUVEES, moisGoogleMicros: Number.MAX_SAFE_INTEGER, enveloppeGoogleMicros: Number.MAX_SAFE_INTEGER };
      expect(refusDuForfait(VIDE, f, limites, "elements"), String(elements)).toBe(attendu);
      expect(refusDuForfait(VIDE, f, LIMITES_PROTOTYPE, "elements"), `0071 ${elements}`).toBe(attendu);
    }
    // Text Search et Place Details gardent le seuil du jour de 95 en unité « éléments ».
    expect(refusDuForfait({ ...VIDE, jour: { ...VIDE.jour, textSearchRequetes: 6 } }, forfait, LIMITES_EPROUVEES, "elements")).toBe("daily_quota_insufficient");
  });

  it("enveloppe jusqu'à G0 puis plafond du mois", () => {
    expect(refusDuForfait({ ...VIDE, enveloppeGoogleMicros: 37_000_001 }, forfait, LIMITES_EPROUVEES, "requetes")).toBe("envelope_reached");
    expect(refusDuForfait({ ...VIDE, enveloppeModelesMicros: 77_000_001 }, forfait, LIMITES_EPROUVEES, "requetes")).toBe("envelope_reached");
    expect(refusDuForfait({ ...VIDE, moisGoogleMicros: 17_000_001 }, forfait, LIMITES_EPROUVEES, "requetes")).toBe("cap_reached");
    expect(refusDuForfait({ ...VIDE, moisModelesMicros: 37_000_001 }, forfait, LIMITES_EPROUVEES, "requetes")).toBe("cap_reached");
    expect(refusDuForfait({ ...VIDE, moisModelesMicros: 37_000_000 }, forfait, LIMITES_EPROUVEES, "requetes")).toBeNull();
  });

  it("0071 : aucun nombre maximal d'exécutions réelles par mois (13 au forfait avant la décision, 0046)", () => {
    expect(Math.floor(LIMITES_EPROUVEES.moisModelesMicros / 3_000_000)).toBe(13);
    expect(Math.floor(LIMITES_PROTOTYPE.moisModelesMicros / 3_000_000)).toBe(Number.POSITIVE_INFINITY);
  });
});
