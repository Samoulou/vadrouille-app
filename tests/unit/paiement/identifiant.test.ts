// @vitest-environment node
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { CHECKOUT_ID_PATTERN } from "@/contracts/values";
import { depuisIdentifiantPublic, versIdentifiantPublic } from "@/server/payment/identifiant";

/** Identifiant public d'un paiement (décision 0097 B4-TL-1) : `uuid` en base64url canonique, 22 caractères. */
describe("paiement: identifiant public", () => {
  it("aller-retour sur 1 000 uuid, forme de `CHECKOUT_ID_PATTERN`", () => {
    for (let i = 0; i < 1000; i += 1) {
      const uuid = randomUUID();
      const public_ = versIdentifiantPublic(uuid);
      expect(public_).toHaveLength(22);
      expect(public_).toMatch(CHECKOUT_ID_PATTERN);
      expect(depuisIdentifiantPublic(public_)).toBe(uuid);
    }
  });

  it("majuscules de l'uuid acceptées, uuid rendu en minuscules ; entrée qui n'est pas un uuid refusée", () => {
    const uuid = randomUUID();
    expect(depuisIdentifiantPublic(versIdentifiantPublic(uuid.toUpperCase()))).toBe(uuid);
    for (const entree of ["", "abc", uuid.replaceAll("-", ""), `${uuid}0`]) expect(() => versIdentifiantPublic(entree)).toThrow(TypeError);
  });

  it("formes non canoniques, longueurs 21 et 23, caractères hors base64url et non-textes → `null`", () => {
    const public_ = versIdentifiantPublic(randomUUID());
    const dernier = public_.at(-1) ?? "A";
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    // Même octets décodés, bits de remplissage non nuls : refusé.
    const voisin = alphabet[alphabet.indexOf(dernier) ^ 1] ?? "B";
    expect(depuisIdentifiantPublic(`${public_.slice(0, -1)}${voisin}`)).toBeNull();
    for (const entree of [public_.slice(1), `${public_}A`, `${public_.slice(0, -1)}=`, `${public_.slice(0, -1)}+`, `${public_.slice(0, -1)}/`, " ".repeat(22), null, undefined, 42, {}]) {
      expect(depuisIdentifiantPublic(entree)).toBeNull();
    }
  });
});
