// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parsePaiementParam, unlockRoutes } from "./routes";

/** Module d'adresses du parcours « Débloquer » (décision 0020 § 5). */

const ID = "Ab_9-Ab_9-Ab_9-Ab_9-Ab";

describe("unlockRoutes", () => {
  it("R9, R9 avec paiement, R9-sim, R9-retour", () => {
    const routes = unlockRoutes("mock_trip_edimbourg");
    expect(routes.debloquer()).toBe("/voyages/mock_trip_edimbourg/debloquer");
    expect(routes.debloquer(ID)).toBe(`/voyages/mock_trip_edimbourg/debloquer?paiement=${ID}`);
    expect(routes.paiementSimule(ID)).toBe(`/voyages/mock_trip_edimbourg/debloquer/paiement-simule/${ID}`);
    expect(routes.confirmation(ID)).toBe(`/voyages/mock_trip_edimbourg/debloquer/confirmation?paiement=${ID}`);
  });

  it("identifiants encodés", () => {
    expect(unlockRoutes("a b/c").debloquer("x&y")).toBe("/voyages/a%20b%2Fc/debloquer?paiement=x%26y");
  });

  it("aller-retour : l'adresse écrite se relit", () => {
    const url = new URL(unlockRoutes("t1").confirmation(ID), "http://x");
    expect(parsePaiementParam(url.searchParams.get("paiement"))).toBe(ID);
    const sim = unlockRoutes("t1").paiementSimule(ID).split("/").pop();
    expect(parsePaiementParam(decodeURIComponent(sim!))).toBe(ID);
  });
});

describe("parsePaiementParam", () => {
  it.each([undefined, null, "", "court", `${ID}x`, `${ID.slice(1)}=`, [ID], [ID, ID], "../../etc/passwd", `${ID.slice(2)} \n`])(
    "%j : null",
    (value) => {
      expect(parsePaiementParam(value as string | string[] | undefined)).toBeNull();
    },
  );

  it("identifiant conforme : renvoyé tel quel", () => {
    expect(parsePaiementParam(ID)).toBe(ID);
  });
});
