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

/** Plafonds des exemples de 0055 (500 éléments, 20 requêtes) ; limite en vigueur : 840 et 30 (0088 § 13, test dédié). */
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

  // Décision 0088 § 13 (Samuel, 2026-10-18 11:42 UTC) : 840 éléments par voyage, 30 requêtes ; vérification du Tech Lead.
  it("limite de 840 éléments et 30 requêtes (0088 § 13) : séjours de 1 à 10 jours tenus ; exemples de la décision", () => {
    const plafonds = { elements: 840, requetes: 30 };
    for (let jours = 1; jours <= 10; jours += 1) expect(planRoutes(jours, plafonds).tient, `${jours} jours`).toBe(true);
    const plans = [1, 4, 5, 7, 10].map((jours) => planRoutes(jours, plafonds));
    expect(plans.map((p) => [p.n, p.elementsSansReprise, p.requetesSansReprise, p.reprisesAdmises])).toEqual([
      [28, 784, 9, 1],
      [13, 676, 16, 3],
      [12, 720, 20, 2],
      [10, 700, 7, 7],
      [8, 640, 10, 10],
    ]);
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

  it("un quartier par jour : centres éloignés, lieux au centre le plus proche, groupes rendus dans l'ordre d'entrée", () => {
    const groupes = regrouperParJour(LIEUX, [jour(2, 1, 1, 10), jour(2, 1, 1, 10)]);
    expect(groupes).toEqual([
      ["a1", "a2", "a3", "a4"],
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

  // Ticket 483 (essai rome-1, 2026-10-18) : avec moins de lieux que demandé, les derniers jours restaient vides.
  it("pénurie : répartie sur tous les jours, jamais les derniers jours vides", () => {
    const quatre = [lieu("p1", "activity", 0, 0), lieu("p2", "activity", 0, 0.001), lieu("p3", "activity", 0, 0.002), lieu("p4", "activity", 0, 0.003)];
    const groupes = regrouperParJour(quatre, [jour(2, 0, 0, 5), jour(2, 0, 0, 5), jour(2, 0, 0, 5)]);
    expect(groupes.map((groupe) => groupe.length).sort()).toEqual([1, 1, 2]);
    expect(new Set(groupes.flat())).toEqual(new Set(["p1", "p2", "p3", "p4"]));
    // Rome, 5 jours (demandes de l'essai rome-1), 23 lieux pour 32 demandés : chaque jour reçoit sa part, en proportion de
    // sa demande (le jour du départ, qui demande moins, n'est pas privé de ce qu'il demande).
    const rome = [jour(3, 2, 1, 20), jour(4, 2, 1, 20), jour(4, 2, 1, 20), jour(4, 2, 1, 20), jour(4, 1, 0, 20)];
    const vingtTrois = Array.from({ length: 23 }, (_, k) => lieu(`r${k}`, k < 12 ? "activity" : k < 20 ? "meal" : "evening", 41.9 + k * 0.001, 12.49));
    const tailles = regrouperParJour(vingtTrois, rome).map((groupe) => groupe.length);
    expect(tailles.reduce((somme, n) => somme + n, 0)).toBe(23);
    for (const taille of tailles) expect(taille).toBeGreaterThanOrEqual(3);
    expect(Math.max(...tailles) - Math.min(...tailles)).toBeLessThanOrEqual(2);
  });

  // Demande de Samuel (2026-10-18 09:47 UTC) : « répartis de manière cohérente, par exemple par quartier ».
  it("cohérence géographique : un jour ne mélange pas deux zones éloignées, même classées en alternance", () => {
    // Zone A autour de (41.890, 12.492), zone B à ~4 km (41.903, 12.453) ; ordre d'entrée alterné A, B, A, B…
    const type = (k: number): Type => (k % 3 === 2 ? "meal" : "activity");
    const alternes = [0, 1, 2, 3, 4, 5].flatMap((k) => [lieu(`a${k}`, type(k), 41.89 + k * 0.0005, 12.492), lieu(`b${k}`, type(k), 41.903 + k * 0.0005, 12.453)]);
    const zones = (groupe: readonly string[]) => new Set(groupe.map((id) => id[0])).size;
    const groupes = regrouperParJour(alternes, [jour(4, 2, 0, 8), jour(4, 2, 0, 8)]);
    for (const groupe of groupes) {
      expect(groupe).toHaveLength(6);
      expect(zones(groupe)).toBe(1);
    }
    // Trois jours pour deux zones (8 activités pour 9 demandées) : parts 4, 4 et 3 ; au plus un jour à cheval.
    const trois = regrouperParJour(alternes, [jour(3, 1, 0, 8), jour(3, 1, 0, 8), jour(3, 1, 0, 8)]);
    expect(trois.map((groupe) => groupe.length)).toEqual([4, 4, 3]);
    expect(trois.filter((groupe) => zones(groupe) > 1).length).toBeLessThanOrEqual(1);
  });

  // Mineur 6 de la revue de la PR #490 : la distance range, elle n'écarte aucun lieu mieux classé.
  it("plus de lieux que les parts : les mieux classés de chaque type sont retenus, jamais un plus proche moins bien classé", () => {
    // Ordre d'entrée = classement : a1 (loin, bien classé) avant les trois activités proches du repas.
    const lieux = [
      lieu("loin", "activity", 55.95, -3.0),
      lieu("repas", "meal", 55.95, -3.19),
      lieu("proche1", "activity", 55.95, -3.191),
      lieu("proche2", "activity", 55.95, -3.192),
      lieu("proche3", "activity", 55.95, -3.193),
    ];
    const groupes = regrouperParJour(lieux, [jour(2, 1, 0, 10)]);
    expect(groupes).toEqual([["loin", "repas", "proche1"]]);
    // Deux jours : les trois premières activités du classement, réparties par proximité ; proche3 n'entre pas.
    const deux = regrouperParJour(lieux, [jour(2, 1, 0, 10), jour(1, 0, 0, 10)]);
    expect(deux.flat().sort()).toEqual(["loin", "proche1", "proche2", "repas"]);
  });

  // Mineur 7 de la revue de la PR #490 : capacité d'un jour inférieure à sa demande.
  it("capacité inférieure à la demande : les types sont servis dans l'ordre des clés (filet ; la demande reçue est déjà bornée)", () => {
    const lieux = [
      lieu("a1", "activity", 55.95, -3.19),
      lieu("a2", "activity", 55.95, -3.191),
      lieu("a3", "activity", 55.95, -3.192),
      lieu("m1", "meal", 55.95, -3.193),
      lieu("m2", "meal", 55.95, -3.194),
    ];
    // Décision 0088 § 8 : l'ordre de service de la capacité n'est écrit que dans `demandeBornee` ; `typesPrioritaires` retiré.
    expect(regrouperParJour(lieux, [jour(3, 2, 0, 3)])).toEqual([["a1", "a2", "a3"]]);
  });

  // Mineur 9 de la revue de la PR #490 : non-régression, la capacité de la matrice Routes du jour n'est jamais dépassée.
  it("capacités serrées : aucun jour au-delà de sa capacité ni de sa demande par type, aucun lieu deux fois", () => {
    const types: Type[] = ["activity", "meal", "evening"];
    const typeDe = (k: number): Type => (k % 3 === 0 ? "activity" : k % 3 === 1 ? "meal" : "evening");
    const lieux = Array.from({ length: 40 }, (_, k) => lieu(`l${k}`, typeDe(k), 55.9 + ((k * 7) % 11) * 0.004, -3.25 + ((k * 5) % 13) * 0.006));
    const demandes = [jour(4, 2, 1, 0), jour(4, 2, 1, 1), jour(4, 2, 1, 2), jour(3, 2, 1, 3), jour(4, 2, 1, 5), jour(4, 2, 1, 7), jour(4, 1, 0, 20)];
    for (let decalage = 0; decalage < demandes.length; decalage += 1) {
      const jours = [...demandes.slice(decalage), ...demandes.slice(0, decalage)];
      for (const n of [5, 12, 25, 40]) {
        const groupes = regrouperParJour(lieux.slice(0, n), jours);
        expect(new Set(groupes.flat()).size).toBe(groupes.flat().length);
        groupes.forEach((groupe, rang) => {
          const attendu = jours.at(rang);
          expect(groupe.length).toBeLessThanOrEqual(attendu?.capacite ?? 0);
          for (const type of types) {
            const nombre = groupe.filter((id) => lieux.find((l) => l.id === id)?.type === type).length;
            const demande = new Map(Object.entries(attendu?.demande ?? {}));
            expect(nombre).toBeLessThanOrEqual(demande.get(type) ?? 0);
          }
        });
      }
    }
  });

  // Bloquant 2 de la revue de la PR #490 (p0-run-finale, « lieu fermé définitivement ») : un lieu fermé toute la fenêtre
  // d'un jour (horaires de sa fiche) n'y est mis qu'en dernier recours.
  it("jours de fermeture : un lieu fermé un jour va dans un autre jour s'il le peut ; sinon en dernier recours", () => {
    // Quartier A (a1 à a3), quartier B (b1 à b3) ; a2 est fermé le jour 0, qui est centré sur A.
    const lieux = [
      lieu("a1", "activity", 55.95, -3.19),
      lieu("b1", "activity", 55.95, -3.11),
      { ...lieu("a2", "activity", 55.951, -3.191), fermeLes: [0] },
      lieu("b2", "activity", 55.951, -3.111),
      lieu("a3", "activity", 55.952, -3.189),
      lieu("b3", "activity", 55.952, -3.109),
    ];
    const jours = [jour(3, 0, 0, 10), jour(3, 0, 0, 10)];
    const sansFermeture = regrouperParJour(
      lieux.map(({ id, type, position }) => ({ id, type, position })),
      jours,
    );
    expect(sansFermeture).toEqual([
      ["a1", "a2", "a3"],
      ["b1", "b2", "b3"],
    ]);
    const groupes = regrouperParJour(lieux, jours);
    expect(groupes[0]).not.toContain("a2");
    expect(groupes[1]).toContain("a2");
    expect(groupes.flat().sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "b3"]);
    // Fermé tous les jours : toujours regroupé (la planification décidera), jamais écarté par le regroupement.
    const partout = regrouperParJour([{ ...lieu("x", "activity", 0, 0), fermeLes: [0, 1] }, lieu("y", "activity", 0, 0.001)], [jour(1, 0, 0, 5), jour(1, 0, 0, 5)]);
    expect(partout.flat().sort()).toEqual(["x", "y"]);
    // Le classement prime : seul retenu (part de 1), le premier du classement est mis même fermé, jamais remplacé par un
    // lieu ouvert moins bien classé.
    const centre = regrouperParJour([{ ...lieu("f", "activity", 0, 0), fermeLes: [0] }, lieu("o", "activity", 0, 0.001)], [jour(1, 0, 0, 5)]);
    expect(centre).toEqual([["f"]]);
  });

  it("déterministe : mêmes entrées, mêmes groupes", () => {
    const jours = [jour(2, 1, 1, 4), jour(2, 1, 1, 4)];
    expect(regrouperParJour(LIEUX, jours)).toEqual(regrouperParJour(LIEUX, jours));
  });
});
