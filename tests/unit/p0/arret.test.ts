// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CODES_ARRET, CODES_AVANT_APPEL, CODES_EXTERNES, CODES_LIMITE, CODES_REFUS_LANCEMENT, codePersiste, PHASES } from "@/prototype/arret";

import { CODES_JOURNAL } from "../../../scripts/p0/journal";

/** Décision 0046, D24 et S4 : `p0: stop_code et phase selon S4` (correspondance complète et repli). */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const MIGRATIONS = path.join(RACINE, "db/migrations");
const JOURNAL = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
/** Migrations appliquées, dans l'ordre du journal (les migrations inverses `.down.sql` n'y sont pas). */
const TEXTES = JOURNAL.entries.map((entree) => readFileSync(path.join(MIGRATIONS, `${entree.tag}.sql`), "utf8"));

/** Valeurs d'un `CHECK (colonne IN (…))`, dans la dernière migration du journal qui pose la contrainte. */
function valeursDuCheck(contrainte: string): string[] {
  const texte = TEXTES.findLast((t) => t.includes(`CONSTRAINT ${contrainte} CHECK`));
  expect(texte, contrainte).toBeDefined();
  const debut = texte!.indexOf(`CONSTRAINT ${contrainte} CHECK`);
  const fin = texte!.indexOf("))", debut);
  return [...texte!.slice(debut, fin).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

/** Correspondance attendue de chaque code du journal (D24, « correspondance avec scripts/p0/journal.ts »). */
const ATTENDU_AVANT_APPEL: Readonly<Record<string, string>> = {
  brief_not_found: "brief_invalid",
  brief_name_invalid: "brief_invalid",
  brief_invalid: "brief_invalid",
  real_mode_unavailable: "real_mode_unavailable",
  config_invalid: "config_invalid",
  data_collection_missing: "data_collection_missing",
  model_id_invalid: "model_id_invalid",
};

describe("p0: stop_code et phase selon S4", () => {
  it("énumérations égales aux CHECK de la migration", () => {
    expect(valeursDuCheck("runs_stop_code_values_check")).toEqual([...CODES_ARRET]);
    expect(valeursDuCheck("runs_phase_values_check")).toEqual([...PHASES]);
  });

  it("correspondance complète des codes d'arrêt du journal, avant tout appel payant", () => {
    const arrets = CODES_JOURNAL.slice(CODES_JOURNAL.indexOf("cost_cap_reached"));
    for (const code of arrets) {
      const attendu = ATTENDU_AVANT_APPEL[code] ?? "pipeline_failed";
      expect(codePersiste(code, false), code).toBe(attendu);
    }
    // `usage` et `fixtures_invalid` (ligne de commande, mode simulé) : pipeline_failed s'ils parvenaient à l'écriture.
    expect(codePersiste("usage", false)).toBe("pipeline_failed");
    expect(codePersiste("fixtures_invalid", false)).toBe("pipeline_failed");
  });

  it("après le premier appel payant, un code « avant appel » devient pipeline_failed", () => {
    for (const code of [...CODES_AVANT_APPEL, "brief_not_found", "brief_name_invalid"]) expect(codePersiste(code, true), code).toBe("pipeline_failed");
  });

  it("codes externes : eux-mêmes, avant comme après un appel payant", () => {
    for (const code of CODES_EXTERNES) {
      expect(codePersiste(code, false)).toBe(code);
      expect(codePersiste(code, true)).toBe(code);
    }
  });

  it("limite d'appels (429 de Google) : elle-même, avant comme après un appel payant ; hors des codes externes (pas de relance)", () => {
    expect([...CODES_LIMITE]).toEqual(["upstream_rate_limited"]);
    for (const code of CODES_LIMITE) {
      expect(codePersiste(code, false)).toBe(code);
      expect(codePersiste(code, true)).toBe(code);
      expect(CODES_EXTERNES as readonly string[]).not.toContain(code);
    }
  });

  it("ancrage, planification, plafonds, délai, modèles et erreurs internes : pipeline_failed", () => {
    for (const code of [
      "lodging_unresolved",
      "place_not_found",
      "routes_unavailable",
      "reduction_refused",
      "programme_invalid",
      // Ticket 400 : recherche sans aucun lieu (code interne de l'étape de recherche).
      "research_empty",
      "cap_reached",
      "cost_cap_reached",
      "quota_reached",
      "timeout",
      "model_unavailable",
      "model_error",
      "internal_error",
    ]) {
      expect(codePersiste(code, true), code).toBe("pipeline_failed");
    }
  });

  it("repli par défaut : code inconnu, absent ou non textuel → pipeline_failed", () => {
    for (const code of ["code_inconnu", "", "PIPELINE_FAILED", undefined, null, 42, { code: "brief_invalid" }]) {
      expect(codePersiste(code, false)).toBe("pipeline_failed");
    }
  });

  it("les refus de lancement ne sont jamais écrits dans runs", () => {
    for (const code of CODES_REFUS_LANCEMENT) expect(() => codePersiste(code, false)).toThrow(/jamais écrit/);
  });
});
