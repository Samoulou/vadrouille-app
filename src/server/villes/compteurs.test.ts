// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTOCOMPLETE_COUNTS_RETENTION_DAYS, SEUILS_AUTOCOMPLETION, SEUILS_AUTOCOMPLETION_VALIDES } from "@/server/config/villes";

import prixGoogle from "../../../prototype/config/prix-google.json";
import { coutDesCompteurs, createAutocompleteCounter, type AutocompleteCounterClient, type AutocompleteCounterPool } from "./compteurs";

/**
 * Compteurs de la recherche de ville de `api` sans base (décision 0141 § 2, § 5 et § 7 ; T1 à T4, PR 885). La base est
 * remplacée par un pool simulé qui enregistre les requêtes ; les tests de base réels sont sous
 * `tests/db/compteurs-autocompletion.test.ts` (T5 à T10).
 */

afterEach(() => {
  vi.restoreAllMocks();
});

type Requete = { text: string; values?: unknown[] };

function poolSimule(options: { echec?: (texte: string) => Error | undefined; ligne?: (texte: string) => unknown[] | undefined; connexion?: Error } = {}) {
  const requetes: Requete[] = [];
  const liberations: unknown[] = [];
  let connexions = 0;
  const client: AutocompleteCounterClient = {
    async query(text, values) {
      requetes.push({ text, values });
      const erreur = options.echec?.(text);
      if (erreur) throw erreur;
      const lignes = options.ligne?.(text);
      if (lignes !== undefined) return { rows: lignes };
      if (text.startsWith("INSERT")) return { rows: [{ day: "2026-10-29" }] };
      if (text.startsWith("UPDATE")) return { rows: [{ compte: 1 }] };
      return { rows: [] };
    },
    release(error) {
      liberations.push(error);
    },
  };
  const pool: AutocompleteCounterPool = {
    connect: async () => {
      connexions += 1;
      if (options.connexion) throw options.connexion;
      return client;
    },
  };
  return { pool, requetes, liberations, connexions: () => connexions };
}

const premiers = (requetes: readonly Requete[]) => requetes.map((r) => r.text.split(/\s/)[0]);

describe("compteurs: seuils de la configuration", () => {
  it("150 suggestions et 40 choix, valeurs proposées non validées par Samuel (0141 § 2.3) ; rétention 40 jours", () => {
    expect(SEUILS_AUTOCOMPLETION).toEqual({ suggestions: 150, choix: 40 });
    expect(Object.isFrozen(SEUILS_AUTOCOMPLETION)).toBe(true);
    // Garde mécanique : les seuils ne sont pas validés tant que Samuel ne l'a pas écrit (M1h, question 6 de #829).
    expect(SEUILS_AUTOCOMPLETION_VALIDES).toBe(false);
    expect(AUTOCOMPLETE_COUNTS_RETENTION_DAYS).toBe(40);
    // Un jour au plafond, au prix plein : 150 × 2 830 + 40 × 5 000 micro-USD = 0,6245 USD (0141 § 2.5).
    expect(coutDesCompteurs(SEUILS_AUTOCOMPLETION)).toBe(624_500);
  });
});

describe("compteurs: échec fermé sans base", () => {
  it("seuil absent, nul ou non entier, action hors liste : indisponible, aucune connexion", async () => {
    for (const seuils of [{}, { suggestions: 0, choix: 0 }, { suggestions: 1.5, choix: -1 }, { suggestions: "150", choix: null }, { suggestions: Number.NaN, choix: Infinity }]) {
      const { pool, connexions } = poolSimule();
      const compteur = createAutocompleteCounter({ pool, seuils });
      expect(await compteur.reserve("suggestions"), JSON.stringify(seuils)).toEqual({ ok: false, raison: "indisponible" });
      expect(await compteur.reserve("choix"), JSON.stringify(seuils)).toEqual({ ok: false, raison: "indisponible" });
      expect(connexions()).toBe(0);
    }
    const { pool, connexions } = poolSimule();
    const compteur = createAutocompleteCounter({ pool, seuils: { suggestions: 3, choix: 2, total: 5 } });
    for (const action of ["total", "SUGGESTIONS", "day", "", "suggestions; DROP TABLE x"]) {
      expect(await compteur.reserve(action as "suggestions"), action).toEqual({ ok: false, raison: "indisponible" });
    }
    expect(connexions()).toBe(0);
  });

  it("connexion ou requête en erreur, compte illisible : indisponible, ROLLBACK, client rendu", async () => {
    // Connexion refusée : aucun client à rendre.
    const injoignable = poolSimule({ connexion: Object.assign(new Error("SENTINELLE"), { code: "ECONNREFUSED" }) });
    expect(await createAutocompleteCounter({ pool: injoignable.pool, seuils: { suggestions: 3, choix: 2 } }).reserve("suggestions")).toEqual({
      ok: false,
      raison: "indisponible",
      errorName: "Error",
    });
    // Table absente, droits retirés, rôle absent : ROLLBACK, client rendu avec l'erreur.
    for (const [code, etape] of [
      ["42P01", "INSERT"],
      ["42501", "UPDATE"],
      ["42704", "SET"],
    ] as const) {
      const erreur = Object.assign(new Error("SENTINELLE"), { code, name: "DatabaseError" });
      const simule = poolSimule({ echec: (t) => (t.startsWith(etape) ? erreur : undefined) });
      expect(await createAutocompleteCounter({ pool: simule.pool, seuils: { suggestions: 3, choix: 2 } }).reserve("choix"), code).toEqual({ ok: false, raison: "indisponible", errorName: "DatabaseError" });
      expect(premiers(simule.requetes).at(-1), code).toBe("ROLLBACK");
      expect(simule.liberations, code).toEqual([erreur]);
    }
    // Compte illisible (ligne rendue, valeur non entière) : validé, mais l'appel reste refusé.
    for (const compte of ["x", null, 0, 1.5]) {
      const simule = poolSimule({ ligne: (t) => (t.startsWith("UPDATE") ? [{ compte }] : undefined) });
      expect(await createAutocompleteCounter({ pool: simule.pool, seuils: { suggestions: 3, choix: 2 } }).reserve("suggestions"), String(compte)).toEqual({ ok: false, raison: "indisponible" });
      expect(simule.liberations).toEqual([undefined]);
    }
    // Forme de la réservation acceptée : rôle dédié, ligne du jour, un seul UPDATE de la colonne, seuil en paramètre.
    const ok = poolSimule();
    expect(await createAutocompleteCounter({ pool: ok.pool, seuils: { suggestions: 3, choix: 2 } }).reserve("choix")).toEqual({ ok: true, compte: 1 });
    expect(premiers(ok.requetes)).toEqual(["BEGIN", "SET", "INSERT", "UPDATE", "COMMIT"]);
    expect(ok.requetes[1]?.text).toBe("SET LOCAL ROLE vadrouille_autocomplete_counter");
    expect(ok.requetes[3]?.text).toMatch(/^UPDATE public\.autocomplete_daily_counts SET choix = choix \+ 1\nWHERE day = \(pg_catalog\.now\(\) AT TIME ZONE 'UTC'\)::date AND choix < \$1::integer/);
    expect(ok.requetes[3]?.values).toEqual([2]);
    // Plafond : zéro ligne rendue, refus sans erreur.
    const plein = poolSimule({ ligne: (t) => (t.startsWith("UPDATE") ? [] : undefined) });
    expect(await createAutocompleteCounter({ pool: plein.pool, seuils: { suggestions: 3, choix: 2 } }).reserve("suggestions")).toEqual({ ok: false, raison: "plafond" });
  });
});

describe("compteurs: coût dérivé", () => {
  it("3 suggestions et 2 choix au prix plein : 3 × 2 830 + 2 × 5 000 micro-USD ; table illisible : null", () => {
    expect(coutDesCompteurs({ suggestions: 3, choix: 2 })).toBe(3 * 2_830 + 2 * 5_000);
    expect(coutDesCompteurs({ suggestions: 3, choix: 2 }, prixGoogle)).toBe(18_490);
    expect(coutDesCompteurs({ suggestions: 0, choix: 0 })).toBe(0);
    // Table illisible, ou sans l'un des deux SKU : null, jamais 0.
    expect(coutDesCompteurs({ suggestions: 3, choix: 2 }, null)).toBeNull();
    expect(coutDesCompteurs({ suggestions: 3, choix: 2 }, { skus: "x" })).toBeNull();
    const sansFiche = structuredClone(prixGoogle) as { skus: Record<string, unknown> };
    delete sansFiche.skus.places_details_essentials;
    expect(coutDesCompteurs({ suggestions: 3, choix: 2 }, sansFiche)).toBeNull();
    // Compteurs invalides : null.
    expect(coutDesCompteurs({ suggestions: -1, choix: 2 })).toBeNull();
    expect(coutDesCompteurs({ suggestions: 1.5, choix: 2 })).toBeNull();
  });
});
