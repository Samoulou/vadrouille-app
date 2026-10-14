// @vitest-environment node
import { describe, expect, it } from "vitest";

import { jourDeQuotaGoogle, jourGoogle, jourModeles, moisGoogle, moisModeles, periodesDe } from "@/server/usage/periodes";

import { INSTANTS_JOUR_GOOGLE } from "../../../tests/support/instants-d20";

/** Décision 0046, D20 : `p0: jour de quota à minuit heure du Pacifique` et l'équivalent UTC pour les modèles. */

const t = (iso: string) => Date.parse(iso);

describe("p0: jour de quota à minuit heure du Pacifique", () => {
  it.each(INSTANTS_JOUR_GOOGLE.map((cas) => [cas.iso, cas.jour] as const))("%s : jour de quota %s", (iso, jour) => {
    expect(jourDeQuotaGoogle(t(iso))).toBe(jour);
    const periode = jourGoogle(t(iso));
    expect(periode.du).toBeLessThanOrEqual(t(iso));
    expect(periode.au).toBeGreaterThan(t(iso));
    expect(jourDeQuotaGoogle(periode.du)).toBe(jour);
    expect(jourDeQuotaGoogle(periode.au - 1)).toBe(jour);
    expect(jourDeQuotaGoogle(periode.au)).not.toBe(jour);
  });

  it("2026-10-31 23:59 et 2026-11-01 00:00 : jours distincts ; le 1er novembre dure 25 h (fin de l'heure d'été)", () => {
    expect(jourGoogle(t("2026-11-01T06:59:00Z"))).toEqual({ du: t("2026-10-31T07:00:00Z"), au: t("2026-11-01T07:00:00Z") });
    expect(jourGoogle(t("2026-11-01T07:00:00Z"))).toEqual({ du: t("2026-11-01T07:00:00Z"), au: t("2026-11-02T08:00:00Z") });
  });

  it("2027-03-13 23:59 et 2027-03-14 00:00 : jours distincts ; le 14 mars dure 23 h (début de l'heure d'été)", () => {
    expect(jourGoogle(t("2027-03-14T07:59:00Z"))).toEqual({ du: t("2027-03-13T08:00:00Z"), au: t("2027-03-14T08:00:00Z") });
    expect(jourGoogle(t("2027-03-14T08:00:00Z"))).toEqual({ du: t("2027-03-14T08:00:00Z"), au: t("2027-03-15T07:00:00Z") });
  });

  it("mois Google à minuit heure du Pacifique, changement d'heure compris", () => {
    expect(moisGoogle(t("2026-11-01T06:59:00Z"))).toEqual({ du: t("2026-10-01T07:00:00Z"), au: t("2026-11-01T07:00:00Z") });
    expect(moisGoogle(t("2026-11-01T07:00:00Z"))).toEqual({ du: t("2026-11-01T07:00:00Z"), au: t("2026-12-01T08:00:00Z") });
    expect(moisGoogle(t("2027-01-01T00:00:00Z"))).toEqual({ du: t("2026-12-01T08:00:00Z"), au: t("2027-01-01T08:00:00Z") });
  });
});

describe("p0: jour et mois des modèles à minuit UTC", () => {
  it("31 décembre 23:59 et 1er janvier 00:00 UTC : jours et mois distincts", () => {
    expect(jourModeles(t("2026-12-31T23:59:00Z"))).toEqual({ du: t("2026-12-31T00:00:00Z"), au: t("2027-01-01T00:00:00Z") });
    expect(jourModeles(t("2027-01-01T00:00:00Z"))).toEqual({ du: t("2027-01-01T00:00:00Z"), au: t("2027-01-02T00:00:00Z") });
    expect(moisModeles(t("2026-12-31T23:59:00Z"))).toEqual({ du: t("2026-12-01T00:00:00Z"), au: t("2027-01-01T00:00:00Z") });
    expect(moisModeles(t("2027-01-01T00:00:00Z"))).toEqual({ du: t("2027-01-01T00:00:00Z"), au: t("2027-02-01T00:00:00Z") });
  });

  it("le changement d'heure du Pacifique n'a aucun effet sur les modèles", () => {
    expect(jourModeles(t("2026-11-01T07:00:00Z"))).toEqual({ du: t("2026-11-01T00:00:00Z"), au: t("2026-11-02T00:00:00Z") });
  });
});

describe("p0: périodes d'un appel calculées à horloge injectée", () => {
  it("Google : Pacifique ; modèles : UTC ; instant invalide refusé", () => {
    const horloge = { maintenant: () => t("2027-01-01T00:00:00Z") };
    expect(periodesDe("google", horloge).jour).toEqual(jourGoogle(t("2027-01-01T00:00:00Z")));
    expect(periodesDe("modeles", horloge).mois).toEqual(moisModeles(t("2027-01-01T00:00:00Z")));
    expect(() => jourGoogle(Number.NaN)).toThrow(RangeError);
  });
});
