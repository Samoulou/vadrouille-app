import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Point de revue de la décision 0160 § 1.4 point 3 (tâche M8b, ticket 1111 ; spécification M8 § 4.3) : après M8b, aucune
 * comparaison directe de `addedBy` à une de ses valeurs hors de `src/domain/lieu-a-soi.ts`. Toute règle écrite pour un lieu
 * à soi passe par `estLieuASoi` (vrai aussi pour une adresse découverte) ; le texte de la fiche par `estAdresseDecouverte`.
 * Une comparaison oubliée ferait entrer un nom saisi dans un prompt, ou laisserait une adresse découverte signalable.
 * Les fichiers lus sont tous ceux de `src/` (hors tests).
 */
const RACINE = path.resolve(__dirname, "../..");
const MODULE = "src/domain/lieu-a-soi.ts";
/** `addedBy === "…"`, `addedBy !== "…"` (et `==`, `!=`), dans les deux sens, avec ou sans chaînage facultatif. */
const COMPARAISON = /addedBy\s*[!=]==?\s*["'`]|["'`]\s*[!=]==?\s*[\w.?]*addedBy\b/;

const sources = readdirSync(path.join(RACINE, "src"), { recursive: true, encoding: "utf8" })
  .map((f) => path.posix.join("src", f.split(path.sep).join("/")))
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("lieu à soi: aucune comparaison directe de addedBy hors du prédicat commun", () => {
  it("le motif reconnaît les formes à refuser", () => {
    for (const code of ['stop.addedBy === "person"', 'etape.addedBy !== "person"', "ligne.stop.addedBy == 'discovered'", '"person" === stop?.addedBy']) {
      expect(COMPARAISON.test(code), code).toBe(true);
    }
    for (const code of ["stop.addedBy !== undefined", "estLieuASoi(stop)", 'addedBy: "person"', "addedBy: marque"]) expect(COMPARAISON.test(code), code).toBe(false);
  });

  it("src/ : seul src/domain/lieu-a-soi.ts compare addedBy à une valeur", () => {
    expect(sources).toContain(MODULE);
    expect(sources.length).toBeGreaterThan(100);
    const fautifs = sources.filter((f) => f !== MODULE && readFileSync(path.join(RACINE, f), "utf8").split("\n").some((ligne) => COMPARAISON.test(ligne)));
    expect(fautifs).toEqual([]);
    expect(COMPARAISON.test(readFileSync(path.join(RACINE, MODULE), "utf8"))).toBe(true);
  });

  it("les six règles appellent le prédicat commun", () => {
    for (const fichier of [
      "src/domain/patch.ts",
      "src/domain/signalement.ts",
      "src/server/programme/revision.ts",
      "src/server/generation/etapes-revision.ts",
      "src/features/sejour/signalement.ts",
      "src/features/sejour/StopSheet.tsx",
    ]) {
      expect(readFileSync(path.join(RACINE, fichier), "utf8"), fichier).toMatch(/\bestLieuASoi\(/);
    }
  });
});
