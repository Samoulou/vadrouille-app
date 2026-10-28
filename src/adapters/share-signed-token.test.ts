// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SHARE_TOKEN_PATTERN, SIGNED_SHARE_TOKEN_PATTERN } from "@/contracts/values";
import { parseShareToken } from "@/features/partage/routes";

import { signShareToken, verifyShareToken, type SignedSharePayload } from "./share-signed-token";

/** Jeton signé du partage réel, sans stockage (décision 0135 § 4). */

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 8);
const PAYLOAD: SignedSharePayload = {
  tripId: "proto_tokyo_0123456789abcdef0123456789abcdef",
  organizationId: "5e1f0000-0000-4000-8000-000000000001",
  expiresOn: "2027-06-13",
};

/** Remplace le caractère `i` d'une chaîne par un autre du même alphabet. */
function flip(value: string, i: number): string {
  const c = value[i] === "A" ? "B" : "A";
  return value.slice(0, i) + c + value.slice(i + 1);
}

describe("signShareToken et verifyShareToken", () => {
  it("aller-retour : forme v1.<charge>.<mac>, contenu rendu tel quel ; même voyage, même jeton", () => {
    const token = signShareToken(KEY, PAYLOAD);
    expect(token).toMatch(SIGNED_SHARE_TOKEN_PATTERN);
    expect(SHARE_TOKEN_PATTERN.test(token)).toBe(false);
    expect(verifyShareToken(KEY, token)).toEqual(PAYLOAD);
    expect(signShareToken(KEY, PAYLOAD)).toBe(token);
    expect(parseShareToken(token)).toBe(token);
  });

  it("le jeton ne porte ni personne ni nom : la charge décodée est voyage~organisation~date", () => {
    const charge = signShareToken(KEY, PAYLOAD).split(".")[1]!;
    expect(Buffer.from(charge, "base64url").toString("utf8")).toBe(`${PAYLOAD.tripId}~${PAYLOAD.organizationId}~${PAYLOAD.expiresOn}`);
  });

  it("jeton altéré (charge ou mac, un caractère), autre clé, autre organisation recollée : null", () => {
    const token = signShareToken(KEY, PAYLOAD);
    const [, charge, mac] = token.split(".") as [string, string, string];
    expect(verifyShareToken(OTHER_KEY, token)).toBeNull();
    for (let i = 0; i < charge.length; i += 5) expect(verifyShareToken(KEY, `v1.${flip(charge, i)}.${mac}`)).toBeNull();
    for (let i = 0; i < mac.length; i += 3) expect(verifyShareToken(KEY, `v1.${charge}.${flip(mac, i)}`)).toBeNull();
    const autre = signShareToken(KEY, { ...PAYLOAD, organizationId: "org_autre" }).split(".")[1]!;
    expect(verifyShareToken(KEY, `v1.${autre}.${mac}`)).toBeNull();
    const plusTard = signShareToken(KEY, { ...PAYLOAD, expiresOn: "2099-12-31" }).split(".")[2]!;
    expect(verifyShareToken(KEY, `v1.${charge}.${plusTard}`)).toBeNull();
  });

  it("formes refusées sans calcul utile : autre version, mal formé, non-chaîne, clé courte", () => {
    const token = signShareToken(KEY, PAYLOAD);
    for (const value of [token.replace(/^v1/, "v2"), `${token}=`, token.slice(0, -1), "abc", "A".repeat(43), 42, null, undefined]) {
      expect(verifyShareToken(KEY, value)).toBeNull();
    }
    expect(verifyShareToken(Buffer.alloc(16, 7), token)).toBeNull();
    expect(() => signShareToken(Buffer.alloc(16, 7), PAYLOAD)).toThrow();
  });

  it("charge la plus longue (voyage et organisation de 64 caractères) : 234 caractères, forme admise ; plus court : 19 caractères de charge", () => {
    const longest = signShareToken(KEY, { tripId: "t".repeat(64), organizationId: "o".repeat(64), expiresOn: "2027-06-13" });
    expect(longest).toHaveLength(234);
    expect(longest).toMatch(SIGNED_SHARE_TOKEN_PATTERN);
    expect(verifyShareToken(KEY, longest)).not.toBeNull();
    const shortest = signShareToken(KEY, { tripId: "t", organizationId: "o", expiresOn: "2027-06-13" });
    expect(shortest.split(".")[1]).toHaveLength(19);
    expect(SIGNED_SHARE_TOKEN_PATTERN.test(`v1.${"A".repeat(188)}.${"A".repeat(43)}`)).toBe(false);
    expect(SIGNED_SHARE_TOKEN_PATTERN.test(`v1.${"A".repeat(18)}.${"A".repeat(43)}`)).toBe(false);
  });

  it("charge signée mais mal formée (date impossible, séparateur en trop, voyage hors motif) : refusée à la signature", () => {
    for (const payload of [
      { ...PAYLOAD, expiresOn: "2027-02-30" },
      { ...PAYLOAD, expiresOn: "27-06-13" },
      { ...PAYLOAD, tripId: "a~b" },
      { ...PAYLOAD, tripId: "" },
      { ...PAYLOAD, organizationId: "x".repeat(65) },
    ]) {
      expect(() => signShareToken(KEY, payload)).toThrow();
    }
  });
});
