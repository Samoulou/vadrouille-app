import { describe, expect, expectTypeOf, it } from "vitest";

import { CODES_ERREUR_IA } from "@/ai/erreurs";
import { NATURES_ECHEC, natureEchec } from "@/ai/natures";
import { GENERATION_FAILURE_REASONS, type GenerationFailureReason } from "@/contracts/values";
import { CODES_ANCRAGE } from "@/grounding/resultat";

import { CODES_ANCRAGE_SEULS, CODES_ARRET, CODE_ETAPE_EXPIREE, echecDeCode, raisonDeNature, relancable, type NatureArret } from "./raison-echec";

/** B9-PO-9 : nature → raison d'échec. */
const ATTENDU: Record<NatureArret, GenerationFailureReason> = {
  quota: "quota_reached",
  plafond: "cost_cap_reached",
  entree: "provider_error",
  serveur: "provider_error",
  fournisseur: "provider_error",
};

describe("génération: raison d'échec par nature", () => {
  it("chaque nature sauf no_option a sa raison (B9-PO-9)", () => {
    const natures = NATURES_ECHEC.filter((nature): nature is NatureArret => nature !== "no_option");
    expect(natures.sort()).toEqual(Object.keys(ATTENDU).sort());
    for (const nature of natures) {
      expect(raisonDeNature(nature)).toBe(ATTENDU[nature]);
      expect(GENERATION_FAILURE_REASONS).toContain(raisonDeNature(nature));
    }
  });

  it("une nature ajoutée sans correspondance ne compile pas ; no_option n'est pas une nature d'arrêt", () => {
    expectTypeOf<NatureArret>().toEqualTypeOf<Exclude<(typeof NATURES_ECHEC)[number], "no_option">>();
    // @ts-expect-error -- `no_option` n'a jamais de raison d'échec.
    raisonDeNature("no_option");
  });

  it("chaque code de la couche IA suit sa nature ; retryable seulement pour upstream_unavailable et upstream_timeout", () => {
    for (const code of CODES_ERREUR_IA) {
      const nature = natureEchec(code);
      const echec = echecDeCode(code);
      if (nature === "no_option") {
        expect(echec).toEqual({ reason: "provider_error", retryable: false });
        continue;
      }
      expect(echec.reason, code).toBe(ATTENDU[nature]);
      expect(echec.retryable, code).toBe(code === "upstream_unavailable" || code === "upstream_timeout");
    }
    expect(echecDeCode("daily_quota_insufficient")).toEqual({ reason: "quota_reached", retryable: false });
    expect(echecDeCode("cap_reached")).toEqual({ reason: "cost_cap_reached", retryable: false });
  });

  it("codes propres à l'ancrage, lodging_unresolved et step_expired → provider_error ; step_expired réessayable", () => {
    for (const code of CODES_ANCRAGE_SEULS) expect(echecDeCode(code), code).toEqual({ reason: "provider_error", retryable: false });
    expect(echecDeCode("lodging_unresolved")).toEqual({ reason: "provider_error", retryable: false });
    expect(echecDeCode(CODE_ETAPE_EXPIREE)).toEqual({ reason: "provider_error", retryable: true });
    expect(relancable(CODE_ETAPE_EXPIREE)).toBe(true);
    expect(relancable("upstream_rate_limited")).toBe(false);
  });

  it("code nul ou inconnu : provider_error, non réessayable (échec fermé)", () => {
    expect(echecDeCode(null)).toEqual({ reason: "provider_error", retryable: false });
    expect(echecDeCode("code_inconnu")).toEqual({ reason: "provider_error", retryable: false });
  });
});

describe("génération: codes d'arrêt", () => {
  it("les codes propres à l'ancrage recopiés sont exactement CODES_ANCRAGE hors des codes de la couche IA", () => {
    const ia = new Set<string>(CODES_ERREUR_IA);
    expect([...CODES_ANCRAGE_SEULS].sort()).toEqual(CODES_ANCRAGE.filter((code) => !ia.has(code)).sort());
  });

  it("CODES_ARRET = codes de la couche IA ∪ codes de l'ancrage ∪ step_expired, sans doublon", () => {
    expect(new Set(CODES_ARRET).size).toBe(CODES_ARRET.length);
    expect([...CODES_ARRET].sort()).toEqual([...new Set<string>([...CODES_ERREUR_IA, ...CODES_ANCRAGE, CODE_ETAPE_EXPIREE])].sort());
  });
});
