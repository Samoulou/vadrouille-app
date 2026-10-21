import { describe, expect, it } from "vitest";

import { PARTS_FORFAIT } from "@/server/config/generation";
import type { Forfait } from "@/server/usage/forfait";

import { ArretEtape } from "./codes";
import { forfaitPartiel, partAvecReserve, partCumulee, partDe, partDuJour } from "./forfait-etape";
import { besoinPropreDeC, reserveDuPassage, reserveTextSearchE, villeDuJour } from "./reserve-text-search";

/**
 * Réserve Text Search de l'étape `e` (décision 0113 § 3 bis) : une requête par ville `area` ou `none` positionnée, prise sur
 * la part de `c` avant sa répartition ; total du profil et `PARTS_FORFAIT` inchangés ; refus `cap_reached` si la part de `c`
 * ne la couvre pas. Fonctions pures, sans appel.
 */

const FORFAIT: Forfait = { nature: "execution", textSearchRequetes: 60, placeDetailsRequetes: 40, routesRequetes: 8, routesElements: 400, coutGoogleMicros: 0, coutModelesMicros: 600_000 };
const EDIMBOURG = { rang: 0, logement: { kind: "known" } };
const GLASGOW = { rang: 1, logement: { kind: "none" } };

describe("réserve Text Search de l'étape e : villes positionnées", () => {
  // Six jours, cinq nuits : nuit 0 à Édimbourg, nuits 1 à 4 à Glasgow (arrivée en J2).
  const nuitsVille = [0, 1, 1, 1, 1];

  it("ville d'un jour : sa nuit d'arrivée (règle de preparerPlanification)", () => {
    expect([1, 2, 3, 6].map((jour) => villeDuJour(jour, nuitsVille))).toEqual([0, 1, 1, 1]);
    expect(villeDuJour(1, [])).toBe(0);
  });

  it("aperçu : une requête par ville area ou none de J1 et J2, aucune pour un logement connu", () => {
    expect(reserveTextSearchE({ jours: [1, 2], nuitsVille, villes: [EDIMBOURG, GLASGOW] })).toBe(1);
    expect(reserveTextSearchE({ jours: [1], nuitsVille, villes: [EDIMBOURG, GLASGOW] })).toBe(0);
    expect(reserveTextSearchE({ jours: [1, 2], nuitsVille: [0, 0, 0, 0, 0], villes: [EDIMBOURG] })).toBe(0);
    expect(reserveTextSearchE({ jours: [1, 2], nuitsVille, villes: [{ rang: 0, logement: { kind: "area" } }, GLASGOW] })).toBe(2);
    expect(reserveTextSearchE({ jours: [1, 2], nuitsVille, villes: [EDIMBOURG, { rang: 1, logement: { kind: "suggestedArea" } }] })).toBe(0);
  });

  it("voyage complet : une requête par jour de la ville none, ici = celle du jour de l'étape e", () => {
    const entree = { jours: [3, 4, 5, 6], nuitsVille, villes: [EDIMBOURG, GLASGOW] };
    expect(reserveDuPassage(entree, null, [GLASGOW])).toEqual({ total: 4, ici: 0, besoinC: 1 });
    expect(reserveDuPassage(entree, 5, [GLASGOW, GLASGOW])).toEqual({ total: 4, ici: 1, besoinC: 1 });
  });

  it("besoin propre de c : une requête par ville area ou none ancrée, chacune une fois", () => {
    expect(besoinPropreDeC([EDIMBOURG, GLASGOW])).toBe(1);
    expect(besoinPropreDeC([{ rang: 0, logement: { kind: "area" } }, GLASGOW, GLASGOW])).toBe(2);
    expect(besoinPropreDeC([EDIMBOURG])).toBe(0);
  });
});

describe("réserve Text Search de l'étape e : prise sur c, total inchangé", () => {
  const partC = partDe(FORFAIT.textSearchRequetes, PARTS_FORFAIT.textSearch, "c");
  const partL = partDe(FORFAIT.textSearchRequetes, PARTS_FORFAIT.textSearch, "l");

  it("aperçu : e reçoit exactement la réserve, c la perd, l inchangée, somme égale au total du profil", () => {
    const reserve = { total: 1, ici: 1, besoinC: 1 };
    const e = partAvecReserve(FORFAIT, "e", reserve).textSearchRequetes;
    const c = partAvecReserve(FORFAIT, "c", reserve).textSearchRequetes;
    const l = partAvecReserve(FORFAIT, "l", reserve).textSearchRequetes;
    expect(e).toBe(1);
    expect(c).toBe(partC - 1);
    expect(l).toBe(partL);
    expect(l + c + e).toBe(FORFAIT.textSearchRequetes);
    // Les autres ressources ne changent pas.
    expect({ ...partAvecReserve(FORFAIT, "e", reserve), textSearchRequetes: 0 }).toEqual(forfaitPartiel(FORFAIT, "e"));
    // Sans réserve, la répartition de PARTS_FORFAIT est intacte.
    expect(partAvecReserve(FORFAIT, "c", { total: 0, ici: 0, besoinC: 0 })).toEqual(forfaitPartiel(FORFAIT, "c"));
  });

  it("voyage complet : la part de c est réduite de la réserve avant sa répartition, e reçoit son nombre exact par jour", () => {
    const reserve = { total: 4, ici: 1, besoinC: 1 };
    // Deux villes introduites par le passage : la ville du premier jour reçoit la moitié de (part de c − réserve).
    const part = { avant: 0, ici: 1, total: 2 };
    const ajuster = (f: Forfait) => partDuJour(f, part);
    expect(partAvecReserve(FORFAIT, "c", reserve, ajuster).textSearchRequetes).toBe(partCumulee(partC - 4, part));
    const dernier = { avant: 1, ici: 1, total: 2 };
    expect(partCumulee(partC - 4, part) + partCumulee(partC - 4, dernier)).toBe(partC - 4);
    // e : hors découpage cumulatif (4 jours du passage), exactement la réserve du jour.
    expect(partAvecReserve(FORFAIT, "e", reserve, (f) => partDuJour(f, { avant: 2, ici: 1, total: 4 })).textSearchRequetes).toBe(1);
    expect(partAvecReserve(FORFAIT, "e", { total: 4, ici: 0, besoinC: 1 }, (f) => partDuJour(f, { avant: 0, ici: 1, total: 4 })).textSearchRequetes).toBe(0);
  });

  it("refus : réserve de e + besoin propre de c > part de c donne cap_reached à toute étape, même quand la réserve seule tient", () => {
    const refuse = (reserve: { total: number; ici: number; besoinC: number }) => {
      for (const etape of ["a", "l", "c", "e"] as const) {
        let code: string | undefined;
        try {
          partAvecReserve(FORFAIT, etape, reserve);
        } catch (erreur) {
          expect(erreur).toBeInstanceOf(ArretEtape);
          code = (erreur as ArretEtape).code;
        }
        expect(code).toBe("cap_reached");
      }
    };
    refuse({ total: partC + 1, ici: 1, besoinC: 0 });
    // La réserve seule tient (partC), mais pas avec le Text Search propre de `c`.
    refuse({ total: partC, ici: 1, besoinC: 1 });
    expect(partAvecReserve(FORFAIT, "c", { total: partC - 1, ici: 0, besoinC: 1 }).textSearchRequetes).toBe(1);
  });
});
