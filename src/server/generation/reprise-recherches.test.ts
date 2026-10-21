import { describe, expect, it } from "vitest";

import {
  SQL_CANDIDAT_REPRISE,
  SQL_CANDIDATS_SOURCE,
  SQL_OCCURRENCES_REPRISE,
  SQL_RECHERCHE_REPRISE,
  SQL_SOURCE_REPRISE,
  candidatsAReprendre,
  normaliser,
  reprendreRecherche,
  sourceDeReprise,
  type ExecuteurReprise,
} from "./reprise-recherches";

/**
 * B9c-suite (ticket #573 ; décisions 0106 § 5 et 0105 § 6) : reprise des recherches d'un essai précédent par « Réessayer ».
 * Tests sans base (les tests de base sont dans `tests/db/apercu-reprise.test.ts`).
 */

const ORG = "9292b925-a665-4b43-88c2-963c1cd0ecd8";
const TRIP = "2b6c3f8e-6f0e-4b38-9d0c-4e1f3a1b2c3d";
const RUN = "5f1d6b0a-9c4e-4c1e-8a3b-7d2e1f0a9b8c";
const SOURCE = "0c9b8a7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";

type Appel = { readonly texte: string; readonly valeurs: readonly unknown[] };

/** Exécuteur en mémoire : rend `reponses(texte)` et garde chaque requête. */
function executeur(reponses: (texte: string, valeurs: readonly unknown[]) => Record<string, unknown>[]): { x: ExecuteurReprise; appels: Appel[] } {
  const appels: Appel[] = [];
  return {
    appels,
    x: {
      async query(texte, valeurs = []) {
        appels.push({ texte, valeurs });
        return { rows: reponses(texte, valeurs) };
      },
    },
  };
}

describe("reprise: candidats à reprendre", () => {
  it("ordre de la recherche gardé ; un nom déjà écrit pour l'exécution, ou en double dans la source, n'est jamais repris", () => {
    const source = [
      { id: "a", nom: "Musée de l'Écosse" },
      { id: "b", nom: "Château d'Édimbourg" },
      { id: "c", nom: "musee de l ecosse" },
      { id: "d", nom: "Arthur's Seat" },
    ];
    expect(candidatsAReprendre(source, new Set())).toEqual(["a", "b", "d"]);
    expect(candidatsAReprendre(source, new Set([normaliser("CHÂTEAU D'ÉDIMBOURG")]))).toEqual(["a", "d"]);
    expect(candidatsAReprendre([], new Set(["x"]))).toEqual([]);
  });

  it("la fonction ne modifie pas l'ensemble des noms connus de l'appelant", () => {
    const connus = new Set<string>(["x"]);
    candidatsAReprendre([{ id: "a", nom: "Y" }], connus);
    expect([...connus]).toEqual(["x"]);
  });
});

describe("reprise: source d'une ville", () => {
  it("la recherche de même rang de l'aperçu précédent le plus récent du même voyage, ou rien", async () => {
    const { x, appels } = executeur(() => [{ id: SOURCE }]);
    expect(await sourceDeReprise(x, ORG, RUN, 1)).toBe(SOURCE);
    expect(appels).toEqual([{ texte: SQL_SOURCE_REPRISE, valeurs: [ORG, RUN, 1] }]);
    const vide = executeur(() => []);
    expect(await sourceDeReprise(vide.x, ORG, RUN, 0)).toBeNull();
  });

  it("requête de source : aperçus seulement, même voyage, exécutions antérieures, organisation partout, rang par ordre des recherches", () => {
    const texte = SQL_SOURCE_REPRISE.replace(/\s+/g, " ");
    expect(texte).toContain("id = $2 AND kind = 'preview'");
    expect(texte).toContain("g.kind = 'preview' AND g.id <> $2 AND g.started_at < c.started_at");
    expect(texte).toContain("c.trip_id = g.trip_id");
    expect(texte).toContain("PARTITION BY r.generation_run_id ORDER BY r.started_at, r.id");
    expect(texte).toContain("ORDER BY p.started_at DESC, p.id DESC");
    expect(texte.match(/organization_id = \$1/g)).toHaveLength(3);
  });
});

describe("reprise: copie de la recherche (aucune écriture de l'exécution précédente)", () => {
  it("une recherche au bilan vide, puis chaque candidat repris et ses occurrences, dans l'ordre ; lectures et insertions seulement", async () => {
    let suivant = 0;
    const { x, appels } = executeur((texte) => {
      if (texte === SQL_RECHERCHE_REPRISE) return [{ id: "run-copie" }];
      if (texte === SQL_CANDIDATS_SOURCE)
        return [
          { id: "s1", name: "Musée" },
          { id: "s2", name: "Déjà là" },
          { id: "s3", name: "Pub" },
        ];
      if (texte === SQL_CANDIDAT_REPRISE) return [{ id: `copie-${(suivant += 1)}` }];
      return [];
    });
    const debut = Date.parse("2026-10-20T10:00:00Z");
    await reprendreRecherche(x, { organizationId: ORG, tripId: TRIP, generationRunId: RUN }, SOURCE, new Set([normaliser("deja la")]), debut);
    expect(appels.map((a) => [a.texte, a.valeurs])).toEqual([
      [SQL_RECHERCHE_REPRISE, [ORG, TRIP, RUN, new Date(debut).toISOString()]],
      [SQL_CANDIDATS_SOURCE, [ORG, SOURCE]],
      [SQL_CANDIDAT_REPRISE, [ORG, "s1", "run-copie", new Date(debut).toISOString()]],
      [SQL_OCCURRENCES_REPRISE, [ORG, "s1", "copie-1"]],
      [SQL_CANDIDAT_REPRISE, [ORG, "s3", "run-copie", new Date(debut + 1).toISOString()]],
      [SQL_OCCURRENCES_REPRISE, [ORG, "s3", "copie-2"]],
    ]);
    for (const { texte } of appels) expect(texte).toMatch(/^\s*(SELECT|INSERT INTO|WITH)\b/);
    for (const { texte } of appels) expect(texte).not.toMatch(/\b(UPDATE|DELETE)\b/);
  });

  it("une copie non écrite arrête la reprise (la transaction gardée de l'étape est annulée)", async () => {
    const { x } = executeur((texte) => (texte === SQL_CANDIDATS_SOURCE ? [{ id: "s1", name: "Musée" }] : texte === SQL_RECHERCHE_REPRISE ? [{ id: "r" }] : []));
    await expect(reprendreRecherche(x, { organizationId: ORG, tripId: TRIP, generationRunId: RUN }, SOURCE, new Set(), 0)).rejects.toThrow("reprise : candidat non écrit");
    const sansRun = executeur(() => []);
    await expect(reprendreRecherche(sansRun.x, { organizationId: ORG, tripId: TRIP, generationRunId: RUN }, SOURCE, new Set(), 0)).rejects.toThrow("reprise : recherche non écrite");
  });

  it("bilan copié vide et aucune colonne de compteur ; place_id des seuls lieux ; occurrences sans place_id", () => {
    const recherche = SQL_RECHERCHE_REPRISE.replace(/\s+/g, " ");
    expect(recherche).toContain("VALUES ($1, $2, $3, '{}'::text[], 0, 0, 0, '{}'::text[], $4::timestamptz, $4::timestamptz)");
    const candidat = SQL_CANDIDAT_REPRISE.replace(/\s+/g, " ");
    expect(candidat).toContain("CASE WHEN kind = 'place' THEN place_id END");
    expect(candidat).toContain("WHERE organization_id = $1 AND id = $2");
    const occurrences = SQL_OCCURRENCES_REPRISE.replace(/\s+/g, " ");
    expect(occurrences).not.toContain("place_id");
    expect(occurrences).toContain("WHERE organization_id = $1 AND candidate_id = $2");
    for (const texte of [SQL_SOURCE_REPRISE, SQL_CANDIDATS_SOURCE, SQL_RECHERCHE_REPRISE, SQL_CANDIDAT_REPRISE, SQL_OCCURRENCES_REPRISE]) {
      expect(texte).not.toMatch(/count\(|_count\b|\bnombre\b/i);
    }
  });
});
