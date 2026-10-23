// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type ClientSql, type LimitesVille, type PoolSql, reserverVille } from "@/server/usage/neon";

/**
 * Réservation de la recherche de ville (décision 0129 § 3) sur une base simulée : sommes rendues par le test, requêtes
 * enregistrées. Les cas sur la vraie base (contraintes de 0019, valeurs posées par la base) sont dans
 * `tests/db/forfait-ville.test.ts`.
 */

const E = "a".repeat(64);
const LIMITES: LimitesVille = { suggestionsParJour: 150, choixParJour: 40, actionsParMinuteEtCookie: 20 };

function base(sommes: { jour_suggestions?: number; jour_choix?: number; minute_cookie?: number } = {}, panne?: (texte: string) => boolean) {
  const requetes: { texte: string; valeurs: readonly unknown[] | undefined }[] = [];
  let liberations = 0;
  const client: ClientSql = {
    async query(texte, valeurs) {
      requetes.push({ texte, valeurs });
      if (panne?.(texte)) throw new Error("panne");
      if (texte.startsWith("SELECT\n  COALESCE(SUM(f.autocomplete_requests)")) {
        return { rows: [{ jour_suggestions: "0", jour_choix: "0", minute_cookie: "0", ...sommes }] };
      }
      return { rows: [] };
    },
    release: () => void (liberations += 1),
  };
  const pool: PoolSql = { connect: async () => client };
  return { pool, requetes, liberees: () => liberations };
}

const textes = (requetes: { texte: string }[]) => requetes.map((r) => r.texte.split(/\s/)[0]);

describe("reserverVille (base simulée)", () => {
  it("accordée : contexte d'organisation, verrou, sommes sous l'empreinte, puis une ligne `ville` et COMMIT", async () => {
    const { pool, requetes, liberees } = base({ jour_suggestions: 149, jour_choix: 39, minute_cookie: 19 });
    expect(await reserverVille(pool, { action: "suggestions", empreinte: E, coutGoogleMicros: 2_830 }, LIMITES)).toEqual({ ok: true });
    expect(textes(requetes)).toEqual(["BEGIN", "SELECT", "SELECT", "SELECT", "INSERT", "COMMIT"]);
    expect(requetes[3]?.valeurs).toEqual([E]);
    expect(requetes[4]?.texte).toContain("VALUES ('ville', NULL, 0, $1, 0, 0, $2, NULL, $3, $4)");
    expect(requetes[4]?.valeurs).toEqual([0, 2_830, 1, E]);
    expect(liberees()).toBe(1);
    const choix = base();
    expect(await reserverVille(choix.pool, { action: "choix", empreinte: E, coutGoogleMicros: 5_000 }, LIMITES)).toEqual({ ok: true });
    expect(choix.requetes[4]?.valeurs).toEqual([1, 5_000, 0, E]);
  });

  it("au plafond : débit du cookie d'abord, puis jour de l'action ; ROLLBACK, aucune insertion", async () => {
    const cas: [Parameters<typeof base>[0], "suggestions" | "choix", string][] = [
      [{ minute_cookie: 20 }, "suggestions", "ville_debit_atteint"],
      [{ minute_cookie: 20, jour_suggestions: 150 }, "suggestions", "ville_debit_atteint"],
      [{ jour_suggestions: 150 }, "suggestions", "ville_jour_atteint"],
      [{ jour_choix: 40 }, "choix", "ville_jour_atteint"],
    ];
    for (const [sommes, action, code] of cas) {
      const { pool, requetes, liberees } = base(sommes);
      expect(await reserverVille(pool, { action, empreinte: E, coutGoogleMicros: 1 }, LIMITES), JSON.stringify(sommes)).toEqual({ ok: false, code });
      expect(textes(requetes)).toEqual(["BEGIN", "SELECT", "SELECT", "SELECT", "ROLLBACK"]);
      expect(liberees()).toBe(1);
    }
    // Le plafond d'une action ne bloque pas l'autre.
    const { pool } = base({ jour_suggestions: 150 });
    expect(await reserverVille(pool, { action: "choix", empreinte: E, coutGoogleMicros: 1 }, LIMITES)).toEqual({ ok: true });
  });

  it("échec fermé : connexion refusée, requête en erreur, somme illisible, empreinte ou coût mal formés → usage_unavailable", async () => {
    const injoignable: PoolSql = { connect: async () => Promise.reject(new Error("ECONNREFUSED")) };
    expect(await reserverVille(injoignable, { action: "suggestions", empreinte: E, coutGoogleMicros: 1 }, LIMITES)).toEqual({ ok: false, code: "usage_unavailable" });
    const enErreur = base({}, (t) => t.startsWith("INSERT"));
    expect(await reserverVille(enErreur.pool, { action: "suggestions", empreinte: E, coutGoogleMicros: 1 }, LIMITES)).toEqual({ ok: false, code: "usage_unavailable" });
    expect(textes(enErreur.requetes).at(-1)).toBe("ROLLBACK");
    expect(enErreur.liberees()).toBe(1);
    const illisible = base({ minute_cookie: "x" as unknown as number });
    expect(await reserverVille(illisible.pool, { action: "suggestions", empreinte: E, coutGoogleMicros: 1 }, LIMITES)).toEqual({ ok: false, code: "usage_unavailable" });
    for (const demande of [
      { action: "suggestions" as const, empreinte: "COOKIE", coutGoogleMicros: 1 },
      { action: "suggestions" as const, empreinte: E.toUpperCase(), coutGoogleMicros: 1 },
      { action: "suggestions" as const, empreinte: E, coutGoogleMicros: -1 },
      { action: "suggestions" as const, empreinte: E, coutGoogleMicros: 0.5 },
    ]) {
      const { pool, requetes } = base();
      expect(await reserverVille(pool, demande, LIMITES)).toEqual({ ok: false, code: "usage_unavailable" });
      expect(requetes).toEqual([]);
    }
  });
});
