// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TripSchema } from "@/contracts";
import { COMMITMENT_LABEL_LENGTH, MAX_CITIES } from "@/contracts/values";

import { chevauchement, LIBELLE_AVEC_ESPACES, LIBELLE_SANS_ESPACE } from "./chevauchement";

/** Jeu `mock` du bandeau de chevauchement (spécification M4-suite § 5, critère 17). */
describe("M4-suite: jeu simulé du bandeau de chevauchement", () => {
  it("est un Trip valide à 3 villes, end exclusif, un transfer par ville ajoutée", () => {
    expect(TripSchema.parse(chevauchement)).toEqual(chevauchement);
    const cities = chevauchement.cities ?? [];
    expect(cities).toHaveLength(MAX_CITIES);
    expect(cities.at(0)?.start).toBe(chevauchement.start);
    expect(cities.at(-1)?.end).toBe(chevauchement.end);
    for (let i = 1; i < cities.length; i += 1) expect(cities[i]?.start).toBe(cities[i - 1]?.end);
    const avecTransfer = chevauchement.days.filter((day) => day.items.some((item) => item.type === "transfer"));
    expect(avecTransfer.map((day) => day.date)).toEqual(cities.slice(1).map((city) => city.start));
  });

  it("libellés de 80 caractères, avec et sans espace, sur les deux journées de changement de ville", () => {
    expect(LIBELLE_AVEC_ESPACES).toHaveLength(COMMITMENT_LABEL_LENGTH.max);
    expect(LIBELLE_AVEC_ESPACES).toContain(" ");
    expect(LIBELLE_SANS_ESPACE).toHaveLength(COMMITMENT_LABEL_LENGTH.max);
    expect(LIBELLE_SANS_ESPACE).not.toMatch(/\s/);
    const libelles = chevauchement.days.map((day) => day.events.map((event) => event.name));
    expect(libelles).toEqual([[], [LIBELLE_AVEC_ESPACES], [], [LIBELLE_SANS_ESPACE], []]);
  });
});
