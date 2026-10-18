// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CODE_CONNEXION, cookiesSecurises, entetesIp, SESSION } from "@/tenancy/options";

/**
 * Réglages de Better Auth (spécification B3, B3b point 2). En-têtes d'adresse IP (décision 0051 § 2.6) : sans
 * `TRUSTED_IP_HEADER`, la liste passée à `advanced.ipAddress.ipAddressHeaders` est **vide** ; Better Auth 1.7.7 lit
 * `ipAddressHeaders || ["x-forwarded-for"]` (`@better-auth/core`, `utils/ip`), et une liste vide, vraie, remplace ce
 * défaut forgeable : aucun en-tête n'est lu.
 */

const configuration = readFileSync(path.join(process.cwd(), "src/tenancy/auth.ts"), "utf8");

describe("auth: aucun en-tête forgeable lu sans TRUSTED_IP_HEADER", () => {
  it("sans en-tête de confiance : liste vide (jamais undefined, jamais x-forwarded-for) ; avec : l'en-tête seul", () => {
    const sans = entetesIp(null);
    expect(sans).toEqual([]);
    expect(Array.isArray(sans) && Boolean(sans)).toBe(true);
    expect(entetesIp("x-vercel-forwarded-for")).toEqual(["x-vercel-forwarded-for"]);
  });

  it("la configuration passe entetesIp(trustedIpHeader) et ne désactive pas le suivi d'adresse", () => {
    expect(configuration).toContain("ipAddressHeaders: entetesIp(config.trustedIpHeader)");
    expect(configuration).toContain("disableIpTracking: false");
    expect(configuration).not.toMatch(/x-forwarded-for|x-real-ip/i);
  });
});

describe("auth: réglages de la session et du code", () => {
  it("code de 6 chiffres, 10 minutes, 3 essais ; session de 7 jours prolongée au plus une fois par jour", () => {
    expect(CODE_CONNEXION).toEqual({ chiffres: 6, dureeSecondes: 600, essais: 3 });
    expect(SESSION).toEqual({ dureeSecondes: 604_800, prolongationSecondes: 86_400 });
  });

  it("cookies sécurisés hors local ; cache de session désactivé ; cookie httpOnly et sameSite=lax", () => {
    expect(cookiesSecurises("local")).toBe(false);
    expect(cookiesSecurises("ci")).toBe(true);
    expect(configuration).toContain("cookieCache: { enabled: false }");
    expect(configuration).toContain('defaultCookieAttributes: { httpOnly: true, sameSite: "lax" }');
    expect(configuration).toContain("rateLimit: { enabled: false }");
    expect(configuration).toContain("telemetry: { enabled: false }");
  });
});
