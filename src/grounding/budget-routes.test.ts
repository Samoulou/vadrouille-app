// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  creerCadence,
  ErreurBudgetRoutes,
  partDuJour,
  planRoutes,
  requetesMatrice,
  requetesReprise,
  routesDuSejour,
  tailleMatriceDuJour,
  type HorlogeCadence,
} from "@/grounding/budget-routes";
import type { ClientRoutes, RequeteMatrice } from "@/grounding/interfaces";
import { distanceVolOiseauMetres, ordreVolOiseau, regrouperParJour, zoneDuSejour } from "@/grounding/zone";

/** Budgets Routes de `p0Run` (0055 § 6 point 1 ; 0053 ; Q330) : client Routes simulé, aucun appel réel. */

const PLAFONDS = { elements: 500, requetes: 20 };

function horlogeManuelle(): HorlogeCadence & { attentes: number[] } {
  let maintenant = 0;
  const attentes: number[] = [];
  return {
    attentes,
    maintenant: () => maintenant,
    async attendre(ms) {
      attentes.push(ms);
      maintenant += ms;
    },
  };
}

function routesSimulees() {
  const requetes: RequeteMatrice[] = [];
  const routes: ClientRoutes = {
    matrice: vi.fn(async (requete: RequeteMatrice) => {
      requetes.push(requete);
      return { secondes: requete.origines.map((_o, a) => requete.destinations.map((_d, b) => 60 * (a + b + 1))) };
    }),
  };
  return { routes, requetes };
}

const ids = (n: number, prefixe = "P") => Array.from({ length: n }, (_v, i) => `${prefixe}${i}`);

describe("p0: budgets Routes par jour (0055 § 6 point 1)", () => {
  it("part du jour = floor(500 / jours) ; n² + 2n ≤ part ; exemples de 0055", () => {
    expect([1, 4, 7, 10].map((jours) => partDuJour(500, jours))).toEqual([500, 125, 71, 50]);
    expect([500, 125, 71, 50].map(tailleMatriceDuJour)).toEqual([21, 10, 7, 6]);
    for (let part = 0; part <= 600; part += 1) {
      const n = tailleMatriceDuJour(part);
      expect(n * n + 2 * n).toBeLessThanOrEqual(part);
      expect((n + 1) ** 2 + 2 * (n + 1)).toBeGreaterThan(part);
    }
  });

  it("cas de 1, 4, 7 et 10 jours : sous 500 éléments et 20 requêtes sans reprise ; reprises admises", () => {
    const plans = [1, 4, 7, 10].map((jours) => planRoutes(jours, PLAFONDS));
    expect(plans.map((p) => [p.n, p.elementsSansReprise, p.requetesSansReprise, p.reprisesAdmises, p.tient])).toEqual([
      [21, 441, 9, 1, true],
      [10, 400, 4, 4, true],
      [7, 343, 7, 6, true],
      [6, 360, 10, 5, true],
    ]);
    for (const plan of plans) {
      expect(plan.n * plan.n + 2 * plan.n).toBeLessThanOrEqual(plan.part);
      expect(plan.elementsSansReprise + plan.reprisesAdmises * 2 * (plan.n - 1)).toBeLessThanOrEqual(500);
      expect(plan.requetesSansReprise + plan.reprisesAdmises * requetesReprise(plan.n)).toBeLessThanOrEqual(20);
    }
    // Proposition au PO (P0S2-PO-8) : 30 requêtes admettent une reprise chaque jour à 7 et 10 jours.
    expect([7, 10].map((jours) => planRoutes(jours, { elements: 500, requetes: 30 }).reprisesAdmises)).toEqual([7, 10]);
    expect([requetesMatrice(21), requetesReprise(21), requetesReprise(6)]).toEqual([9, 4, 2]);
  });

  it("part insuffisante pour deux lieux : le plan ne tient pas, la matrice est refusée sans appel (cap_reached)", async () => {
    // 500 éléments sur 100 jours : part 5, n = 1.
    const plan = planRoutes(100, PLAFONDS);
    expect([plan.n, plan.tient]).toEqual([1, false]);
    const { routes } = routesSimulees();
    const sejour = routesDuSejour(routes, plan, creerCadence(3_000, horlogeManuelle()));
    await expect(sejour.matriceDuJour(0, ids(2), "walk")).rejects.toBeInstanceOf(ErreurBudgetRoutes);
    expect(routes.matrice).not.toHaveBeenCalled();
  });

  it("aucun jour au-delà de sa part, total ≤ 500, requêtes ≤ 20, sur 1, 4, 7 et 10 jours avec une reprise par jour admise", async () => {
    for (const jours of [1, 4, 7, 10]) {
      const plan = planRoutes(jours, PLAFONDS);
      const { routes, requetes } = routesSimulees();
      const sejour = routesDuSejour(routes, plan, creerCadence(3_000, horlogeManuelle()));
      let reprises = 0;
      for (let jour = 0; jour < jours; jour += 1) {
        const lieux = ids(plan.n, `J${jour}_`);
        const trajets = await sejour.matriceDuJour(jour, lieux, "transit");
        if (reprises < plan.reprisesAdmises) {
          await sejour.reprise(jour, `J${jour}_R`, lieux.slice(1), "transit", trajets);
          reprises += 1;
        }
      }
      const { elements, requetes: nombre } = sejour.consommation();
      expect(elements).toBeLessThanOrEqual(500);
      expect(nombre).toBeLessThanOrEqual(20);
      expect(requetes).toHaveLength(nombre);
      expect(requetes.every((r) => r.origines.length <= 10 && r.destinations.length <= 10)).toBe(true);
      // Par jour : éléments demandés ≤ part.
      for (let jour = 0; jour < jours; jour += 1) {
        const duJour = requetes.filter((r) => r.origines.concat(r.destinations).every((id) => typeof id === "string" && id.startsWith(`J${jour}_`)));
        expect(duJour.reduce((s, r) => s + r.origines.length * r.destinations.length, 0)).toBeLessThanOrEqual(plan.part);
      }
    }
  });

  it("une reprise reste dans la part du jour ; une seconde reprise est refusée sans appel", async () => {
    const plan = planRoutes(4, PLAFONDS);
    const { routes, requetes } = routesSimulees();
    const sejour = routesDuSejour(routes, plan, creerCadence(3_000, horlogeManuelle()));
    const lieux = ids(10);
    const trajets = await sejour.matriceDuJour(0, lieux, "walk");
    const avant = requetes.length;
    const repris = await sejour.reprise(0, "NOUVEAU", lieux.slice(1), "walk", trajets);
    expect(requetes.length - avant).toBe(2);
    expect(sejour.consommation().elements).toBe(100 + 18);
    expect(sejour.consommation().elements).toBeLessThanOrEqual(plan.part);
    // Durées : nouvelles paires depuis la reprise, anciennes inchangées, jamais inventées.
    expect(repris("NOUVEAU", "P1")).toBe(1);
    expect(repris("P1", "NOUVEAU")).toBe(1);
    expect(repris("P1", "P2")).toBe(trajets("P1", "P2"));
    expect(repris("NOUVEAU", "INCONNU")).toBeUndefined();
    await expect(sejour.reprise(0, "AUTRE", lieux.slice(1), "walk", repris)).rejects.toBeInstanceOf(ErreurBudgetRoutes);
    expect(requetes.length - avant).toBe(2);
  });

  it("plus de lieux que n, jour hors du séjour, matrice demandée deux fois, reprise avant matrice : refusés sans appel", async () => {
    const plan = planRoutes(4, PLAFONDS);
    const { routes } = routesSimulees();
    const sejour = routesDuSejour(routes, plan, creerCadence(3_000, horlogeManuelle()));
    await expect(sejour.matriceDuJour(0, ids(11), "walk")).rejects.toBeInstanceOf(ErreurBudgetRoutes);
    await expect(sejour.matriceDuJour(4, ids(2), "walk")).rejects.toThrow(RangeError);
    await expect(sejour.reprise(1, "X", ids(2), "walk", () => undefined)).rejects.toThrow(RangeError);
    await sejour.matriceDuJour(1, ids(2), "walk");
    await expect(sejour.matriceDuJour(1, ids(2), "walk")).rejects.toThrow(RangeError);
    expect(routes.matrice).toHaveBeenCalledTimes(1);
  });

  it("plafond de requêtes de l'exécution : une reprise qui ne tiendrait pas entière est refusée avant tout appel", async () => {
    // 7 jours sous 20 requêtes : 7 matrices (7 requêtes), 6 reprises (12 requêtes) ; la 7e est refusée.
    const plan = planRoutes(7, PLAFONDS);
    const { routes } = routesSimulees();
    const sejour = routesDuSejour(routes, plan, creerCadence(3_000, horlogeManuelle()));
    for (let jour = 0; jour < 7; jour += 1) {
      const lieux = ids(7, `J${jour}_`);
      const trajets = await sejour.matriceDuJour(jour, lieux, "walk");
      if (jour < 6) await sejour.reprise(jour, `J${jour}_R`, lieux.slice(1), "walk", trajets);
      else await expect(sejour.reprise(jour, `J${jour}_R`, lieux.slice(1), "walk", trajets)).rejects.toBeInstanceOf(ErreurBudgetRoutes);
    }
    expect(sejour.consommation().requetes).toBe(19);
  });
});

describe("p0: cadence Routes par minute (Q330 : 3 000 éléments par minute)", () => {
  it("fenêtre glissante : attend la sortie des plus anciennes, jamais plus de 3 000 sur une minute", async () => {
    const horloge = horlogeManuelle();
    const cadence = creerCadence(3_000, horloge);
    const instants: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      await cadence.reserver(100);
      instants.push(horloge.maintenant());
    }
    expect(horloge.attentes).toEqual([60_000]);
    expect(instants.at(-1)).toBe(60_000);
    for (const instant of instants) {
      const fenetre = instants.filter((t) => t > instant - 60_000 && t <= instant).length * 100;
      expect(fenetre).toBeLessThanOrEqual(3_000);
    }
  });

  it("une demande seule au-delà du quota d'une minute : cap_reached", async () => {
    const cadence = creerCadence(3_000, horlogeManuelle());
    await expect(cadence.reserver(3_001)).rejects.toBeInstanceOf(ErreurBudgetRoutes);
    await expect(cadence.reserver(-1)).rejects.toBeInstanceOf(ErreurBudgetRoutes);
  });

  it("une exécution de 500 éléments n'attend jamais", async () => {
    const horloge = horlogeManuelle();
    const plan = planRoutes(1, PLAFONDS);
    const sejour = routesDuSejour(routesSimulees().routes, plan, creerCadence(3_000, horloge));
    await sejour.matriceDuJour(0, ids(21), "walk");
    expect(horloge.attentes).toEqual([]);
  });
});

describe("p0: premier tri à vol d'oiseau (0053, amendement 1, point 4)", () => {
  it("haversine : Paris–Londres ≈ 343 km ; plus proche voisin déterministe", () => {
    const paris = { lat: 48.857, lng: 2.352 };
    const londres = { lat: 51.507, lng: -0.128 };
    expect(Math.round(distanceVolOiseauMetres(paris, londres) / 1000)).toBe(343);
    const lieux = [
      { id: "loin", position: { lat: 48.9, lng: 2.35 } },
      { id: "pres", position: { lat: 48.857, lng: 2.353 } },
      { id: "milieu", position: { lat: 48.87, lng: 2.35 } },
    ];
    expect(ordreVolOiseau(paris, lieux).map((l) => l.id)).toEqual(["pres", "milieu", "loin"]);
  });

  it("zone : rectangle des cercles, bornée aux pôles et à l'antiméridien, jamais plus grande", () => {
    const zone = zoneDuSejour([{ lat: 0, lng: 0 }], 111_195);
    expect(zone.nordEst.lat).toBeCloseTo(1, 3);
    expect(zone.sudOuest.lng).toBeCloseTo(-1, 3);
    const pole = zoneDuSejour([{ lat: 89.9, lng: 179.9 }], 30_000);
    expect(pole.nordEst).toEqual({ lat: 90, lng: 180 });
    expect(() => zoneDuSejour([], 30_000)).toThrow(RangeError);
    expect(() => zoneDuSejour([{ lat: Number.NaN, lng: 0 }], 30_000)).toThrow(RangeError);
  });
});

describe("p0: regroupement par jour à vol d'oiseau, après les fiches (0053 amendement 1 point 4 ; 0055 § 6 point 4)", () => {
  type Type = "activity" | "meal" | "evening";
  const lieu = (id: string, type: Type, lat: number, lng: number) => ({ id, type, position: { lat, lng } });
  // Deux quartiers éloignés (~ 5 km) : A autour de 55.95/-3.19, B autour de 55.95/-3.11.
  const LIEUX = [
    lieu("a1", "activity", 55.95, -3.19),
    lieu("b1", "activity", 55.95, -3.11),
    lieu("a2", "meal", 55.951, -3.191),
    lieu("b2", "meal", 55.951, -3.111),
    lieu("a3", "activity", 55.952, -3.189),
    lieu("b3", "evening", 55.949, -3.112),
    lieu("a4", "evening", 55.949, -3.192),
    lieu("b4", "activity", 55.952, -3.109),
  ];
  const jour = (activity: number, meal: number, evening: number, capacite: number) => ({ demande: { activity, meal, evening }, capacite });

  it("le premier lieu restant ouvre le jour ; puis le plus proche d'un type encore demandé ; aucun lieu dans deux jours", () => {
    const groupes = regrouperParJour(LIEUX, [jour(2, 1, 1, 10), jour(2, 1, 1, 10)]);
    expect(groupes).toEqual([
      // a2 à ~130 m de a1, a4 à ~170 m, a3 à ~230 m.
      ["a1", "a2", "a4", "a3"],
      ["b1", "b2", "b3", "b4"],
    ]);
    expect(new Set(groupes.flat()).size).toBe(groupes.flat().length);
  });

  it("capacité de la matrice du jour : jamais dépassée ; capacité nulle : jour vide", () => {
    const groupes = regrouperParJour(LIEUX, [jour(2, 1, 1, 2), jour(2, 1, 1, 0), jour(2, 1, 1, 3)]);
    expect(groupes[0]).toHaveLength(2);
    expect(groupes[1]).toEqual([]);
    expect(groupes[2]?.length).toBeLessThanOrEqual(3);
  });

  it("demande par type respectée : un type déjà servi n'est plus pris ; un lieu d'aucun type demandé n'ouvre pas le jour", () => {
    const groupes = regrouperParJour(LIEUX, [jour(0, 1, 0, 10)]);
    expect(groupes).toEqual([["a2"]]);
    expect(regrouperParJour(LIEUX, [jour(0, 0, 0, 10)])).toEqual([[]]);
  });

  it("égalité de distance : ordre d'entrée ; lieux restants non regroupés (non planifiés)", () => {
    const egaux = [lieu("x", "activity", 0, 0), lieu("y", "activity", 0, 1), lieu("z", "activity", 0, -1)];
    expect(regrouperParJour(egaux, [jour(2, 0, 0, 5)])).toEqual([["x", "y"]]);
    expect(regrouperParJour(egaux, [jour(1, 0, 0, 5), jour(1, 0, 0, 5)])).toEqual([["x"], ["y"]]);
  });
});
