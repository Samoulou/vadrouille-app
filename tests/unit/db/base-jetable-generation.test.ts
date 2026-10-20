// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Garde de la décision 0105 § 3 (revue de la PR 563, Q-B9c-4) : toute suite de `tests/db/` qui réserve un forfait de génération
 * ou de relecture au registre `usage_ledger` (ajout seul, jamais purgé : décision 0083) tourne dans une base jetable
 * (`creerBaseApercu`). Seul `usage.test.ts`, qui mesure le quota de 1 000 requêtes par jour de la base commune, y reste.
 */
const RACINE = process.cwd();
const EXCEPTIONS: readonly string[] = ["usage.test.ts"];
/** Ce qui réserve un forfait de génération : le port de réservation, les étapes de l'aperçu et leur banc de test. */
const RESERVE = /\breserverForfait\b|@\/server\/usage\/reservation|@\/server\/generation\/etapes|support\/banc-apercu/;

const sources = (dossier: string, motif: RegExp): string[] => readdirSync(path.join(RACINE, dossier)).filter((nom) => motif.test(nom));

describe("tests de base : un forfait de génération se réserve dans une base jetable (0105 § 3)", () => {
  const suites = sources("tests/db", /\.test\.ts$/);

  it("toute suite qui réserve un forfait passe par creerBaseApercu (liste explicite des exceptions)", () => {
    const fautives = suites.filter((nom) => {
      if (EXCEPTIONS.includes(nom)) return false;
      const source = readFileSync(path.join(RACINE, "tests/db", nom), "utf8");
      return RESERVE.test(source) && !source.includes("creerBaseApercu");
    });
    expect(fautives).toEqual([]);
  });

  it("la garde voit les suites de l'aperçu et l'exception (contrôle : elle n'est pas vide)", () => {
    const reservantes = suites.filter((nom) => RESERVE.test(readFileSync(path.join(RACINE, "tests/db", nom), "utf8")));
    expect(reservantes).toEqual(expect.arrayContaining(["apercu.test.ts", "apercu-revue.test.ts", "apercu-criteres.test.ts", "apercu-idees.test.ts", "usage.test.ts"]));
    expect(EXCEPTIONS.every((nom) => reservantes.includes(nom))).toBe(true);
  });

  it("contrôle : un fichier fictif qui réserve sans base jetable serait refusé", () => {
    const fictif = 'import { reserverForfait } from "@/server/usage/reservation";\nawait reserverForfait(x, y, z);';
    expect(RESERVE.test(fictif) && !fictif.includes("creerBaseApercu")).toBe(true);
  });
});
