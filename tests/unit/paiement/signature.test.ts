// @vitest-environment node
import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { LONGUEUR_MAX_ENTETE, signer, TOLERANCE_SECONDES, V1_MAX, verifier } from "@/server/payment/signature";

/**
 * Signature du webhook simulé (spécification B4, critère A3 ; décision 0097 B4-TL-2) : format de Stripe, vérification
 * maison, tolérance de 300 s dans les deux sens, analyse stricte de l'en-tête. Clés tirées à l'exécution.
 */

const CLE = randomBytes(32);
const MAINTENANT = 1_800_000_000;
const corps = new TextEncoder().encode(JSON.stringify({ id: "evt_sim_x", type: "checkout.session.completed" }));
const v1 = (entete: string) => entete.split(",").find((e) => e.startsWith("v1="))?.slice(3) ?? "";

describe("paiement: horodatage de signature hors tolérance refusé (A3)", () => {
  it("tolérance de 300 s", () => expect(TOLERANCE_SECONDES).toBe(300));

  it.each([
    [-299, true],
    [-300, true],
    [-301, false],
    [299, true],
    [300, true],
    [301, false],
    [0, true],
  ])("horodatage décalé de %i s → %s", (decalage, attendu) => {
    expect(verifier(corps, signer(corps, CLE, MAINTENANT + decalage), CLE, MAINTENANT)).toBe(attendu);
  });

  it("corps, clé ou horodatage modifiés → refus", () => {
    const entete = signer(corps, CLE, MAINTENANT);
    expect(verifier(new TextEncoder().encode("{}"), entete, CLE, MAINTENANT)).toBe(false);
    expect(verifier(corps, entete, randomBytes(32), MAINTENANT)).toBe(false);
    expect(verifier(corps, `t=${MAINTENANT + 1},v1=${v1(entete)}`, CLE, MAINTENANT)).toBe(false);
    expect(verifier(corps, null, CLE, MAINTENANT)).toBe(false);
  });

  it("forme de l'en-tête produit : `t=<secondes>,v1=<64 hexadécimaux>`", () => {
    expect(signer(corps, CLE, MAINTENANT)).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(() => signer(corps, CLE, -1)).toThrow(TypeError);
    expect(() => signer(corps, CLE, 1.5)).toThrow(TypeError);
  });
});

describe("paiement: formes strictes de l'en-tête de signature (B4-TL-2 point 2)", () => {
  const valide = signer(corps, CLE, MAINTENANT);
  const bon = v1(valide);
  const faux = "0".repeat(64);

  it("autres schémas ignorés, plusieurs `v1` comparées (une seule valide suffit, à toute position)", () => {
    expect(verifier(corps, `t=${MAINTENANT},v0=abc,v1=${bon}`, CLE, MAINTENANT)).toBe(true);
    expect(verifier(corps, `t=${MAINTENANT},v1=${faux},v1=${bon}`, CLE, MAINTENANT)).toBe(true);
    expect(verifier(corps, `v1=${bon},t=${MAINTENANT}`, CLE, MAINTENANT)).toBe(true);
    expect(verifier(corps, `t=${MAINTENANT},v1=${faux},v1=${faux},v1=${bon}`, CLE, MAINTENANT)).toBe(true);
  });

  it.each([
    ["sans `t`", `v1=${bon}`],
    ["sans `v1`", `t=${MAINTENANT}`],
    ["deux `t`", `t=${MAINTENANT},t=${MAINTENANT},v1=${bon}`],
    ["`t` non décimal", `t=0x6b49d200,v1=${bon}`],
    ["`t` à zéro de tête", `t=0${MAINTENANT},v1=${bon}`],
    ["`t` signé", `t=+${MAINTENANT},v1=${bon}`],
    ["`t` de 13 chiffres", `t=1${"0".repeat(12)},v1=${bon}`],
    ["`t` vide", `t=,v1=${bon}`],
    ["`v1` en majuscules", `t=${MAINTENANT},v1=${bon.toUpperCase()}`],
    ["`v1` de 63 caractères", `t=${MAINTENANT},v1=${bon.slice(1)}`],
    ["`v1` de 65 caractères", `t=${MAINTENANT},v1=${bon}0`],
    ["plus de trois `v1`", `t=${MAINTENANT},${Array.from({ length: V1_MAX }, () => `v1=${faux}`).join(",")},v1=${bon}`],
    ["élément sans `=`", `t=${MAINTENANT},v1=${bon},x`],
    ["clé vide", `t=${MAINTENANT},=1,v1=${bon}`],
    ["espaces", `t=${MAINTENANT}, v1=${bon}`],
    ["vide", ""],
    ["trop long", `t=${MAINTENANT},v1=${bon},v0=${"a".repeat(LONGUEUR_MAX_ENTETE)}`],
  ])("%s → refus", (_cas, entete) => {
    expect(verifier(corps, entete, CLE, MAINTENANT)).toBe(false);
  });
});
