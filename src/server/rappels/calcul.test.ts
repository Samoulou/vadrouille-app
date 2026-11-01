import { describe, expect, it } from "vitest";

import { ATTENTE_MIN_MS, HEURE_ENVOI_RAPPEL, RAPPELS_ENVOI_REEL, RELAIS_JOURS, REVEIL_MAX_HEURES } from "@/server/config/rappels";

import { attenteJusqua, envoisDuVoyage, planDuReveil } from "./calcul";

/**
 * Calcul des envois de rappel (M6c, ticket 1021 ; spécification M6 § 5.3 et § 6.3, critères 4 à 7 ; décision 0157 § 1.7
 * point 2). Voyage d'Édimbourg du 2026-08-29 au 2026-09-03, `Europe/London` (heure d'été : UTC+1).
 */

const EDIMBOURG = {
  start: "2026-08-29",
  end: "2026-09-03",
  timeZone: "Europe/London",
} as const;
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const t = (s: string) => Date.parse(s);
const AUCUNE: ReadonlySet<number> = new Set();

describe("rappels : configuration (0157 § 1.7)", () => {
  it("18:00, réveil borné à 24 heures, relais à 7 jours, attente minimale d'une seconde, envoi réel fermé", () => {
    expect(HEURE_ENVOI_RAPPEL).toBe("18:00");
    expect(REVEIL_MAX_HEURES).toBe(24);
    expect(RELAIS_JOURS).toBe(7);
    expect(ATTENTE_MIN_MS).toBe(1_000);
    expect(RAPPELS_ENVOI_REEL).toBe(false);
  });
});

describe("rappels : instants d'envoi", () => {
  it("critère 4 : six envois, du 2026-08-28 au 2026-09-02, chacun à 17:00Z ; aucun le 2026-09-03", () => {
    const envois = envoisDuVoyage(EDIMBOURG);
    expect(envois.map((e) => e.dayIndex)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(envois.map((e) => iso(e.instant))).toEqual([
      "2026-08-28T17:00:00.000Z",
      "2026-08-29T17:00:00.000Z",
      "2026-08-30T17:00:00.000Z",
      "2026-08-31T17:00:00.000Z",
      "2026-09-01T17:00:00.000Z",
      "2026-09-02T17:00:00.000Z",
    ]);
    // Fenêtre : jusqu'à minuit de la destination (23:00Z en été).
    expect(iso(envois[0]?.finFenetre ?? null)).toBe("2026-08-28T23:00:00.000Z");
    expect(envois.some((e) => iso(e.instant)?.startsWith("2026-09-03"))).toBe(false);
  });

  it("fuseaux : Lisbonne en été ; passage à l'heure d'hiver du 2026-10-25 (Paris) ; voyage d'un jour", () => {
    expect(
      envoisDuVoyage({
        start: "2026-07-10",
        end: "2026-07-11",
        timeZone: "Europe/Lisbon",
      }).map((e) => iso(e.instant)),
    ).toEqual(["2026-07-09T17:00:00.000Z", "2026-07-10T17:00:00.000Z"]);
    // Veille de J1 (24 octobre) en heure d'été (UTC+2), veille de J2 (25 octobre) en heure d'hiver (UTC+1).
    const paris = envoisDuVoyage({
      start: "2026-10-25",
      end: "2026-10-26",
      timeZone: "Europe/Paris",
    });
    expect(paris.map((e) => iso(e.instant))).toEqual(["2026-10-24T16:00:00.000Z", "2026-10-25T17:00:00.000Z"]);
    expect(iso(paris[1]?.finFenetre ?? null)).toBe("2026-10-25T23:00:00.000Z");
    expect(
      envoisDuVoyage({
        start: "2026-08-29",
        end: "2026-08-29",
        timeZone: "Europe/London",
      }),
    ).toHaveLength(1);
  });

  it("dates incohérentes ou fuseau illisible : aucun envoi", () => {
    expect(
      envoisDuVoyage({
        start: "2026-09-03",
        end: "2026-08-29",
        timeZone: "Europe/London",
      }),
    ).toEqual([]);
    expect(
      envoisDuVoyage({
        start: "2026-08-29",
        end: "2026-09-03",
        timeZone: "Pas/Un_Fuseau",
      }),
    ).toEqual([]);
  });
});

describe("rappels : plan d'un réveil", () => {
  const accord20 = t("2026-08-20T09:00:00Z");

  it("accord le 2026-08-20 : premier réveil sans envoi, prochain envoi la veille de J1", () => {
    expect(
      planDuReveil({
        maintenant: accord20,
        consentiA: accord20,
        voyage: EDIMBOURG,
        reclames: AUCUNE,
      }),
    ).toEqual({
      aEnvoyer: null,
      prochainEnvoi: t("2026-08-28T17:00:00Z"),
    });
  });

  it("dans la fenêtre : journée à envoyer ; déjà réclamée : rien ; après minuit de la destination : rien (au plus une fois)", () => {
    const soir = t("2026-08-28T17:00:00.500Z");
    expect(
      planDuReveil({
        maintenant: soir,
        consentiA: accord20,
        voyage: EDIMBOURG,
        reclames: AUCUNE,
      }),
    ).toEqual({ aEnvoyer: 1, prochainEnvoi: t("2026-08-29T17:00:00Z") });
    expect(
      planDuReveil({
        maintenant: soir,
        consentiA: accord20,
        voyage: EDIMBOURG,
        reclames: new Set([1]),
      }).aEnvoyer,
    ).toBeNull();
    expect(
      planDuReveil({
        maintenant: t("2026-08-28T23:00:00Z"),
        consentiA: accord20,
        voyage: EDIMBOURG,
        reclames: AUCUNE,
      }).aEnvoyer,
    ).toBeNull();
    expect(
      planDuReveil({
        maintenant: t("2026-08-28T22:59:59Z"),
        consentiA: accord20,
        voyage: EDIMBOURG,
        reclames: AUCUNE,
      }).aEnvoyer,
    ).toBe(1);
  });

  it("critère 5 : accord le 2026-08-30 à 20:00 heure de Londres : aucun rattrapage, premier envoi le 2026-08-31 à 18:00 (veille de J4)", () => {
    const accord = t("2026-08-30T19:00:00Z");
    expect(
      planDuReveil({
        maintenant: accord,
        consentiA: accord,
        voyage: EDIMBOURG,
        reclames: AUCUNE,
      }),
    ).toEqual({
      aEnvoyer: null,
      prochainEnvoi: t("2026-08-31T17:00:00Z"),
    });
  });

  it("veille du dernier jour passée : ni envoi ni prochain envoi (fin)", () => {
    expect(
      planDuReveil({
        maintenant: t("2026-09-03T08:00:00Z"),
        consentiA: accord20,
        voyage: EDIMBOURG,
        reclames: AUCUNE,
      }),
    ).toEqual({ aEnvoyer: null, prochainEnvoi: null });
  });

  it("attente : jusqu'au prochain envoi, bornée à 24 heures, au moins une seconde", () => {
    expect(attenteJusqua(t("2026-08-28T17:00:00Z"), t("2026-08-28T16:00:00Z"))).toBe(3_600_000);
    expect(attenteJusqua(t("2026-08-28T17:00:00Z"), accord20)).toBe(24 * 3_600_000);
    expect(attenteJusqua(t("2026-08-28T17:00:00Z"), t("2026-08-28T17:00:00Z"))).toBe(1_000);
  });
});
