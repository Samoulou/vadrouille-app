// @vitest-environment node
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { BriefSchema, NOM_BRIEF_PATTERN } from "@/prototype/brief";

const lire = (nom: string): unknown => JSON.parse(readFileSync(new URL(`../../prototype/briefs/${nom}.json`, import.meta.url), "utf8"));

describe("p0: briefs de référence d'Édimbourg", () => {
  it("les trois briefs passent le schéma strict", () => {
    for (const nom of ["edimbourg-1", "edimbourg-2", "edimbourg-3"]) {
      expect(NOM_BRIEF_PATTERN.test(nom)).toBe(true);
      expect(BriefSchema.safeParse(lire(nom)).success, nom).toBe(true);
    }
  });
});

describe("p0: le brief refuse une donnée personnelle évidente (email, téléphone) et un champ inconnu", () => {
  const base = lire("edimbourg-1") as Record<string, unknown>;

  it("email ou téléphone dans un champ texte : refusé, sans recopier la valeur", () => {
    for (const recit of ["Écrivez à prenom.nom@exemple.org", "Appelez le +33 6 12 34 56 78", "tel 0612345678"]) {
      const resultat = BriefSchema.safeParse({ ...base, recit });
      expect(resultat.success, recit).toBe(false);
      expect(JSON.stringify(resultat.error?.issues)).not.toContain(recit);
    }
    const logement = BriefSchema.safeParse({ ...base, logements: [{ texte: "Hôtel, contact@hotel.example", nuits: 5 }] });
    expect(logement.success).toBe(false);
  });

  it("champ inconnu refusé, à la racine comme dans un objet", () => {
    for (const brief of [
      { ...base, nom: "Samuel" },
      { ...base, email: "x" },
      { ...base, mode: "reel" },
      { ...base, voyageurs: { adultes: 2, enfants: 0, noms: ["A"] } },
    ]) {
      expect(BriefSchema.safeParse(brief).success).toBe(false);
    }
  });

  it("nuits incohérentes avec les dates : refusé", () => {
    expect(BriefSchema.safeParse({ ...base, logements: [{ texte: "Vieille ville", nuits: 2 }] }).success).toBe(false);
  });

  it("le nom de brief n'est jamais un chemin", () => {
    for (const nom of ["../x", "/etc/passwd", "a/b", "A", "a.json", "", "a".repeat(33)]) expect(NOM_BRIEF_PATTERN.test(nom), nom).toBe(false);
  });
});
