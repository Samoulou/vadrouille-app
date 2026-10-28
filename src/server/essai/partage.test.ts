// @vitest-environment node
import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** Garde du mode réel, cookie d'accès et pool simulés (aucun code réel, aucune base, aucun réseau). */
const etat = vi.hoisted(() => ({ ouverte: true, cookieValide: true, cookiesLus: 0, pools: 0 }));

vi.mock("@/server/p0/acces", () => ({
  NOM_COOKIE_ACCES: "__Host-p0_acces",
  ouvertureP0: () => (etat.ouverte ? { ok: true, attendu: Buffer.from("code-d-acces-de-test", "utf8") } : { ok: false, code: "missing" }),
  cookieAccesValide: (cookie: unknown) => etat.cookieValide && cookie === "cookie-de-test",
}));
vi.mock("@/server/p0/base", () => ({
  poolPrototype: () => {
    etat.pools += 1;
    return { pool: true };
  },
}));
vi.mock("@/server/log", () => ({ logEvent: vi.fn(), errorNameOf: () => "Error" }));

import { cleDeblocage } from "./deblocage";
import { clePartage, creerPartageEssai } from "./partage";

/** Partage réel du site d'essai (décision 0135 § 3) : clé tirée du code d'accès, session, barrière de la vue partagée. */

const cookie = async () => {
  etat.cookiesLus += 1;
  return "cookie-de-test";
};

beforeEach(() => {
  etat.ouverte = true;
  etat.cookieValide = true;
  etat.cookiesLus = 0;
  etat.pools = 0;
});

describe("partage de l'essai", () => {
  it("clé : HMAC-SHA-256(code, étiquette du partage), distincte de la clé du déblocage ; 32 octets", () => {
    const code = Buffer.from("code-d-acces-de-test", "utf8");
    expect(clePartage(code)).toEqual(createHmac("sha256", code).update("vadrouille/p0/partage/v1").digest());
    expect(clePartage(code)).toHaveLength(32);
    expect(clePartage(code).equals(cleDeblocage(code))).toBe(false);
    expect(creerPartageEssai({ cookie }).cle()).toEqual(clePartage(code));
  });

  it("garde fermée : aucune clé, session non vérifiée sans lire le cookie, aucune connexion", async () => {
    etat.ouverte = false;
    const port = creerPartageEssai({ cookie });
    expect(port.cle()).toBeNull();
    expect(await port.sessionVerifiee()).toBe(false);
    expect(await port.barriereLecture()).toBeNull();
    expect(etat.cookiesLus).toBe(0);
    expect(etat.pools).toBe(0);
  });

  it("session vérifiée : cookie d'accès valide seulement", async () => {
    expect(await creerPartageEssai({ cookie }).sessionVerifiee()).toBe(true);
    etat.cookieValide = false;
    expect(await creerPartageEssai({ cookie }).sessionVerifiee()).toBe(false);
  });

  it("barrière de la vue partagée : pool garde ouverte, sans lire le cookie d'accès", async () => {
    etat.cookieValide = false;
    expect(await creerPartageEssai({ cookie }).barriereLecture()).toEqual({ pool: true });
    expect(etat.cookiesLus).toBe(0);
  });
});
