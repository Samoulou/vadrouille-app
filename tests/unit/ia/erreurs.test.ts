// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { ErreurModele } from "@/ai/client";
import {
  CODE_CLE_ABSENTE,
  CODES_ERREUR_IA,
  CODES_ERREUR_MODELE,
  CODES_ERREUR_OPENROUTER,
  CODES_REFUS_SORTIE,
  CODES_REFUS_USAGE,
  REESSAYABLES,
  type CodeErreurIa,
  type ResultatIa,
} from "@/ai/erreurs";
import { NATURES_ECHEC, natureEchec, versCodeApi } from "@/ai/natures";
import { API_ERROR_CODES } from "@/contracts";
import { CODE_PLAFOND_AGENT } from "@/research/plafonds-agent";
import * as port from "@/server/usage/port";

/**
 * B7a (décision 0077 § 3) : codes d'erreur fermés de la couche IA, définis une seule fois dans `src/ai/erreurs.ts`
 * (module sans import), réexportés sous le même nom par `egress.ts` et `port.ts` ; une seule classification
 * (`src/ai/natures.ts`) et sa conversion vers `ApiError`. Sous `tests/unit/` : un test de `src/ai` ne peut pas importer
 * `src/research` (inclusion de `CODE_PLAFOND_AGENT`, § 3 point 1).
 */

describe("ia: codes d'erreur de la couche IA (0077 § 3)", () => {
  it("CODES_ERREUR_IA = codes du client réel de modèles ∪ CODES_ERREUR_MODELE ∪ { invalid_input, model_output_invalid, no_option }, sans doublon", () => {
    const attendu = new Set<string>([...CODES_ERREUR_OPENROUTER, ...CODES_ERREUR_MODELE, "invalid_input", "model_output_invalid", "no_option"]);
    expect(new Set(CODES_ERREUR_IA)).toEqual(attendu);
    expect(new Set(CODES_ERREUR_IA).size).toBe(CODES_ERREUR_IA.length);
  });

  it("codes du client réel de modèles : refus de la barrière, clé absente et refus du port", () => {
    for (const code of [...CODES_REFUS_SORTIE, CODE_CLE_ABSENTE, ...CODES_REFUS_USAGE]) expect(CODES_ERREUR_OPENROUTER).toContain(code);
  });

  it("port.ts réexporte la même liste, sous le même nom (définition unique ; egress.ts : src/server/env/egress.test.ts)", () => {
    expect(port.CODES_REFUS_USAGE).toBe(CODES_REFUS_USAGE);
  });

  it("retryable vrai seulement pour upstream_unavailable et upstream_timeout (REESSAYABLES, seule définition)", () => {
    expect([...REESSAYABLES].sort()).toEqual(["upstream_timeout", "upstream_unavailable"]);
    for (const code of CODES_ERREUR_IA) expect((REESSAYABLES as readonly string[]).includes(code), code).toBe(code === "upstream_unavailable" || code === "upstream_timeout");
    // `ErreurOpenRouter.retryable` : src/ai/openrouter-client.test.ts (seul test admis à importer le module de capacité).
  });

  it("le code du plafond de l'agent (CODE_PLAFOND_AGENT) est un code de la couche IA", () => {
    expect(CODES_ERREUR_IA).toContain(CODE_PLAFOND_AGENT);
  });

  it("les codes des erreurs du client de modèles sont des codes de la couche IA", () => {
    for (const code of CODES_ERREUR_MODELE) expect(CODES_ERREUR_IA).toContain(new ErreurModele(code).code);
  });

  it("ResultatIa : une seule union de résultat", () => {
    expectTypeOf<ResultatIa<number>>().toEqualTypeOf<
      { readonly ok: true; readonly valeur: number } | { readonly ok: false; readonly code: CodeErreurIa; readonly retryable: boolean }
    >();
  });
});

describe("ia: natures d'échec et conversion vers ApiError (0077 § 3 points 4 et 5)", () => {
  const ATTENDU: Record<CodeErreurIa, (typeof NATURES_ECHEC)[number]> = {
    no_option: "no_option",
    daily_quota_insufficient: "quota",
    cap_reached: "plafond",
    envelope_reached: "plafond",
    invalid_input: "entree",
    production_refused: "serveur",
    proxy_env_refused: "serveur",
    tls_env_refused: "serveur",
    missing_key: "serveur",
    data_collection_missing: "serveur",
    model_id_invalid: "serveur",
    invalid_request: "serveur",
    usage_unavailable: "serveur",
    upstream_redirect: "fournisseur",
    upstream_unavailable: "fournisseur",
    upstream_timeout: "fournisseur",
    upstream_error: "fournisseur",
    model_unavailable: "fournisseur",
    model_error: "fournisseur",
    model_output_invalid: "fournisseur",
  };

  it.each([...CODES_ERREUR_IA])("%s : nature et code d'ApiError", (code) => {
    const nature = natureEchec(code);
    expect(nature).toBe(ATTENDU[code]);
    const api = versCodeApi(code);
    expect(API_ERROR_CODES).toContain(api);
    const parNature = { no_option: "no_option", quota: "cost_cap_reached", plafond: "cost_cap_reached", entree: "validation_failed", serveur: "provider_error", fournisseur: "provider_error" } as const;
    expect(api).toBe(parNature[nature]);
  });

  it("un code hors de CODES_ERREUR_IA est un défaut de programmation : il lève", () => {
    expect(() => natureEchec("quota_reached" as CodeErreurIa)).toThrow(RangeError);
    expect(API_ERROR_CODES).not.toContain("quota_reached");
  });
});
