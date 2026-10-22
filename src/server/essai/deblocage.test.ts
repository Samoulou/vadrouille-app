// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cleDeblocage, MAX_VOYAGES, NOM_COOKIE_DEBLOCAGE, OPTIONS_COOKIE_DEBLOCAGE, valeurCookieDeblocage, voyagesDuCookie } from "./deblocage";

/** Cookie de déblocage de l'essai (spécification E2E-essai, lot 1) : signature, refus, bornes. */

const cle = cleDeblocage(Buffer.from("code-d-acces-de-test", "utf8"));
const org = "org_prototype";

describe("essai: cookie signé du déblocage simulé", () => {
  it("aller-retour : voyages dédoublonnés et triés, attributs du cookie", () => {
    const valeur = valeurCookieDeblocage(cle, org, ["proto_b_1", "proto_a_1", "proto_b_1"]);
    expect(valeur).toMatch(/^v1\.proto_a_1,proto_b_1\.[0-9a-f]{64}$/);
    expect([...voyagesDuCookie(valeur, cle, org)]).toEqual(["proto_a_1", "proto_b_1"]);
    expect(NOM_COOKIE_DEBLOCAGE).toBe("__Host-p0_debloque");
    expect(OPTIONS_COOKIE_DEBLOCAGE).toMatchObject({ httpOnly: true, secure: true, sameSite: "strict", path: "/" });
  });

  it("refus : autre clé (rotation du code), autre organisation, voyage ajouté à la main, forme inconnue", () => {
    const valeur = valeurCookieDeblocage(cle, org, ["proto_a_1"]);
    expect(voyagesDuCookie(valeur, cleDeblocage(Buffer.from("autre-code", "utf8")), org).size).toBe(0);
    expect(voyagesDuCookie(valeur, cle, "org_autre").size).toBe(0);
    expect(voyagesDuCookie(valeur.replace("proto_a_1", "proto_a_1,proto_z_1"), cle, org).size).toBe(0);
    for (const brut of [undefined, 42, "", "v2.proto_a_1." + "0".repeat(64), "v1.proto a.0", valeur + "x"]) {
      expect(voyagesDuCookie(brut, cle, org).size).toBe(0);
    }
  });

  it(`au plus ${MAX_VOYAGES} voyages : le dernier donné est toujours gardé`, () => {
    const ids = Array.from({ length: MAX_VOYAGES + 3 }, (_, i) => `proto_${String(i).padStart(2, "0")}_1`);
    const gardes = voyagesDuCookie(valeurCookieDeblocage(cle, org, [...ids.slice(1), "proto_00_1"]), cle, org);
    expect(gardes.size).toBe(MAX_VOYAGES);
    expect(gardes.has("proto_00_1")).toBe(true);
  });
});
