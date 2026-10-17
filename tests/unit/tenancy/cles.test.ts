// @vitest-environment node
import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { cleCodeConnexion, deriverCle, ETIQUETTES_HKDF, secretBetterAuth } from "@/tenancy/cles";
import { hacherCode } from "@/tenancy/code-otp";
import { parseEmailAddress } from "@/server/email";

/**
 * Séparation des usages de `BETTER_AUTH_SECRET` (spécification B3, B3b point 2 ; décision 0051 § 5) : HKDF-SHA-256,
 * une étiquette par usage, clés de 32 octets converties par `Buffer.from` (0051 § 5.5).
 */

describe("auth: clés dérivées du secret de Better Auth", () => {
  it("les deux clés dérivées font 32 octets, diffèrent entre elles et des octets du secret, et sont stables", () => {
    const secret = randomBytes(32);
    const bibliotheque = deriverCle(secret, "betterAuth");
    const code = deriverCle(secret, "otp");
    for (const cle of [bibliotheque, code]) {
      expect(Buffer.isBuffer(cle)).toBe(true);
      expect(cle).toHaveLength(32);
      expect(cle.equals(secret)).toBe(false);
      expect(cle.includes(secret.subarray(0, 8))).toBe(false);
    }
    expect(bibliotheque.equals(code)).toBe(false);
    expect(deriverCle(Buffer.from(secret), "betterAuth").equals(bibliotheque)).toBe(true);
    expect(cleCodeConnexion(Buffer.from(secret)).equals(code)).toBe(true);
    expect(deriverCle(randomBytes(32), "otp").equals(code)).toBe(false);
  });

  it("le secret passé à la bibliothèque est la clé vadrouille/better-auth/v1 en base64url sans remplissage", () => {
    const secret = randomBytes(32);
    const transmis = secretBetterAuth(secret);
    expect(transmis).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(transmis, "base64url").equals(deriverCle(secret, "betterAuth"))).toBe(true);
    expect(transmis).not.toBe(secret.toString("base64url"));
    expect(transmis).not.toContain(secret.toString("hex").slice(0, 16));
  });

  it("étiquettes : constantes fixes, distinctes, versionnées", () => {
    expect(ETIQUETTES_HKDF).toEqual({ betterAuth: "vadrouille/better-auth/v1", otp: "vadrouille/otp/v1" });
    expect(Object.isFrozen(ETIQUETTES_HKDF)).toBe(true);
  });

  it("le code est haché en HMAC-SHA-256 à clé, lié à l'adresse", () => {
    const cle = cleCodeConnexion(randomBytes(32));
    const a = parseEmailAddress("a@exemple.test");
    const b = parseEmailAddress("b@exemple.test");
    if (!a.ok || !b.ok) throw new Error("adresse refusée");
    const hache = hacherCode(cle, a.email, "123456");
    expect(hache).toMatch(/^[0-9a-f]{64}$/);
    expect(hacherCode(cle, a.email, "123456")).toBe(hache);
    expect(hacherCode(cle, b.email, "123456")).not.toBe(hache);
    expect(hacherCode(cleCodeConnexion(randomBytes(32)), a.email, "123456")).not.toBe(hache);
  });
});
