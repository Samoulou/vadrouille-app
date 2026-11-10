// @vitest-environment node
import { describe, expect, it } from "vitest";

import { mockTripAdapter, MOCK_REQUEST_CONTEXT } from "@/adapters/mock";
import { ACCOUNT_EXPORT_FORBIDDEN_KEYS, accountExportKeys, AccountExportSchema } from "@/contracts/account-export";
import { construireExportSimule, INSTANT_SIMULE } from "@/server/account/export-simule";

/**
 * Export du jeu simulé (M9c, ticket 1122 ; spécification M9 § 6.4, critère 10) : construit depuis l'adaptateur `mock`,
 * par le même schéma que l'export réel.
 */

const MAINTENANT = new Date("2026-11-09T22:30:00.000Z");
const entree = { lecteur: mockTripAdapter, ctx: MOCK_REQUEST_CONTEXT, email: "camille@exemple.ch", maintenant: MAINTENANT, notice: "Texte." };

describe("construireExportSimule", () => {
  it("valide le schéma strict de l'export : en-tête, compte, un voyage par voyage du jeu simulé", async () => {
    const fichier = await construireExportSimule(entree);
    expect(AccountExportSchema.parse(fichier)).toEqual(fichier);
    expect(fichier).toMatchObject({ format: "vadrouille-export", version: 1, exportedAt: MAINTENANT.toISOString(), notice: "Texte." });
    expect(fichier.account).toEqual({ email: "camille@exemple.ch", createdAt: INSTANT_SIMULE });
    const resumes = await mockTripAdapter.listTrips(MOCK_REQUEST_CONTEXT);
    expect(fichier.trips.map((trip) => trip.id)).toEqual(resumes.map((resume) => resume.id).sort((a, b) => a.localeCompare(b)));
    expect(fichier.tastes).toEqual([]);
  });

  it("chaque voyage : dates, voyageurs, déblocage et programme du jeu simulé, en une version", async () => {
    const fichier = await construireExportSimule(entree);
    for (const exporte of fichier.trips) {
      const voyage = await mockTripAdapter.getTrip(MOCK_REQUEST_CONTEXT, exporte.id);
      if (voyage === null) throw new Error("voyage simulé absent");
      expect(exporte).toMatchObject({ destination: voyage.destination, startDate: voyage.start, endDate: voyage.end, unlocked: voyage.unlocked, currentVersion: 1 });
      expect(exporte.versions).toHaveLength(1);
      expect(exporte.versions[0]!.days.map((jour) => jour.index)).toEqual(voyage.days.map((jour) => jour.index));
      expect(exporte.checklist.map((ligne) => ligne.label)).toEqual(voyage.checklist.map((ligne) => ligne.label));
    }
  });

  it("aucune clé exclue de l'export (durée de trajet, position, identifiants), à aucun niveau", async () => {
    const cles = new Set(accountExportKeys(await construireExportSimule(entree)));
    expect(ACCOUNT_EXPORT_FORBIDDEN_KEYS.filter((cle) => cles.has(cle))).toEqual([]);
  });

  it("une autre organisation n'exporte aucun voyage", async () => {
    const fichier = await construireExportSimule({ ...entree, ctx: { ...MOCK_REQUEST_CONTEXT, organizationId: "org_autre" } });
    expect(fichier.trips).toEqual([]);
  });
});
