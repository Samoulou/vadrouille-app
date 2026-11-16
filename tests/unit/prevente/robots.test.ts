// @vitest-environment node
import { describe, expect, it } from "vitest";

import { estPrechargement, provenancePrevente, visiteACompter } from "@/adapters/prevente-mesure";
import { PREVENTE_PROVENANCES_SUIVI } from "@/contracts/prevente-mesure";
import { estRobotDeclare, FRAGMENTS_ROBOTS } from "@/server/config/robots";

import { NAVIGATEURS, ROBOTS } from "../../support/agents-utilisateurs";

/**
 * Compteur de visites de la prévente, fonctions pures (spécification C2 § 2.2 points 2 à 4 ; tâche C2b, ticket 1130) :
 * robots déclarés (critère A5), préchargements (A6), provenance gardée (A2 à A4).
 */

describe("robots déclarés (critère A5)", () => {
  it.each(ROBOTS)("robot : %s", (agent) => {
    expect(estRobotDeclare(agent)).toBe(true);
  });

  it.each([undefined, null, "", "   ", "\t"])("agent utilisateur absent ou vide (%j) : non compté, comme un robot", (agent) => {
    expect(estRobotDeclare(agent)).toBe(true);
  });

  it.each(NAVIGATEURS)("navigateur : %s", (agent) => {
    expect(estRobotDeclare(agent)).toBe(false);
  });

  it("casse ignorée ; seuls les 512 premiers caractères sont lus", () => {
    expect(estRobotDeclare("GOOGLEBOT")).toBe(true);
    expect(estRobotDeclare(`${"x".repeat(600)} Googlebot`)).toBe(false);
  });

  it("liste embarquée : fragments en minuscules, sans doublon, sans appel réseau ni dépendance", () => {
    expect(new Set(FRAGMENTS_ROBOTS).size).toBe(FRAGMENTS_ROBOTS.length);
    for (const fragment of FRAGMENTS_ROBOTS) expect(fragment).toBe(fragment.toLowerCase());
    expect(Object.isFrozen(FRAGMENTS_ROBOTS)).toBe(true);
  });
});

describe("préchargements (critère A6)", () => {
  it.each<Record<string, string>>([
    { "Next-Router-Prefetch": "1" },
    { "Next-Router-Segment-Prefetch": "/_tree" },
    { Purpose: "prefetch" },
    { "Sec-Purpose": "prefetch" },
    { "Sec-Purpose": "prefetch;prerender" },
    { "sec-purpose": "Prefetch" },
    { "X-Moz": "prefetch" },
  ])("préchargement : %o", (entetes) => {
    expect(estPrechargement(new Headers(entetes))).toBe(true);
    expect(visiteACompter("forum", new Headers({ ...entetes, "User-Agent": NAVIGATEURS[0] }))).toBeNull();
  });

  it.each<Record<string, string>>([{}, { RSC: "1" }, { RSC: "1", "Next-Router-State-Tree": "x" }, { Purpose: "navigate" }, { "Sec-Fetch-Dest": "document" }])(
    "affichage, navigation du routeur comprise : %o",
    (entetes) => {
      expect(estPrechargement(new Headers(entetes))).toBe(false);
      expect(visiteACompter("forum", new Headers({ ...entetes, "User-Agent": NAVIGATEURS[0] }))).toBe("forum");
    },
  );
});

describe("provenance gardée (critères A2 à A4)", () => {
  it.each(PREVENTE_PROVENANCES_SUIVI)("%s : gardée telle quelle", (src) => {
    expect(provenancePrevente(src)).toBe(src);
  });

  it("interne reste interne ; valeur valide hors liste : autre ; absente ou invalide (null) : direct", () => {
    expect(provenancePrevente("interne")).toBe("interne");
    expect(provenancePrevente("inconnu-123")).toBe("autre");
    expect(provenancePrevente("direct")).toBe("autre");
    expect(provenancePrevente("autre")).toBe("autre");
    expect(provenancePrevente("constructor")).toBe("autre");
    expect(provenancePrevente(null)).toBe("direct");
  });

  it("visiteACompter : interne et robot ne comptent pas ; l'agent utilisateur n'entre pas dans le résultat", () => {
    const navigateur = new Headers({ "User-Agent": NAVIGATEURS[1] });
    expect(visiteACompter("interne", navigateur)).toBeNull();
    expect(visiteACompter(null, navigateur)).toBe("direct");
    expect(visiteACompter("reddit", navigateur)).toBe("reddit");
    expect(visiteACompter("reddit", new Headers({ "User-Agent": "curl/8.5.0" }))).toBeNull();
    expect(visiteACompter("reddit", new Headers())).toBeNull();
  });
});
