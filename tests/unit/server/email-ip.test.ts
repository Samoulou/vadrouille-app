// @vitest-environment node
import { describe, expect, it } from "vitest";

import { type CanonicalEmail, isCanonicalEmail, parseEmailAddress, rateLimitEmailKey } from "@/server/email";
import { ipAddressKey, trustedIpKey } from "@/server/ip";

/**
 * Forme canonique de l'adresse e-mail (spécification B3, critère A15 ; décision 0051, points 4.3 à 4.5) et clé
 * d'adresse IP du limiteur (critère A3 ; 0051 point 2.4). Adresses en `exemple.test`, IP des plages de documentation.
 */

const canonique = (entree: string): CanonicalEmail => {
  const lu = parseEmailAddress(entree);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};

describe("auth: forme canonique de l'adresse e-mail", () => {
  it("espaces aux bords retirés, puis minuscules", () => {
    expect(parseEmailAddress(" A@Exemple.TEST ")).toEqual({ ok: true, email: "a@exemple.test" });
  });

  it("a.b_c+d-e@exemple.test → accepté, inchangé", () => {
    expect(parseEmailAddress("a.b_c+d-e@exemple.test")).toEqual({ ok: true, email: "a.b_c+d-e@exemple.test" });
  });

  it.each([
    "K@exemple.test",
    "=?utf-8?q?x?=@exemple.test",
    "a%b@exemple.test",
    "a|b@exemple.test",
    "a/b@exemple.test",
    "a!b@exemple.test",
    "+x@exemple.test",
    "a@127.0.0.1",
    "x <a@exemple.test>",
    "a,b@exemple.test",
    "a;b@exemple.test",
    '"a b"@exemple.test',
    "a(c)@exemple.test",
    "a b@exemple.test",
    "a\\b@exemple.test",
    "a:b@exemple.test",
    ".a@exemple.test",
    "a.@exemple.test",
    "a..b@exemple.test",
    "a@-exemple.test",
    "a@exemple-.test",
    "a@exemple",
    "a@exemple..test",
    "a@@exemple.test",
    "a@b@exemple.test",
    "é@exemple.test",
    "a@exémple.test",
    "a@exemple.test\r\n",
    "a\r\n@exemple.test",
    "a\u0000@exemple.test",
    "\ta@exemple.test",
    "a@exemple.test\t",
    "",
    "   ",
    "@exemple.test",
  ])("%j → refus", (entree) => {
    expect(parseEmailAddress(entree)).toEqual({ ok: false });
  });

  it("partie locale de 65 caractères → refus ; de 64 → accepté", () => {
    expect(parseEmailAddress(`${"a".repeat(65)}@exemple.test`)).toEqual({ ok: false });
    expect(parseEmailAddress(`${"a".repeat(64)}@exemple.test`).ok).toBe(true);
  });

  it("adresse de 255 caractères → refus ; de 254 → accepté", () => {
    const domaine = (longueur: number) => `${"b".repeat(60)}.${"c".repeat(60)}.${"d".repeat(60)}.${"e".repeat(longueur - 183)}`;
    const adresse = (longueur: number) => `${"a".repeat(longueur - 1 - domaine(longueur - 64).length)}@${domaine(longueur - 64)}`;
    expect(adresse(255)).toHaveLength(255);
    expect(adresse(254)).toHaveLength(254);
    expect(parseEmailAddress(adresse(255))).toEqual({ ok: false });
    expect(parseEmailAddress(adresse(254)).ok).toBe(true);
  });

  it("entrée de 100 000 caractères → refus (borne de longueur avant tout contrôle)", () => {
    expect(parseEmailAddress(`${"a".repeat(100_000)}@exemple.test`)).toEqual({ ok: false });
    expect(parseEmailAddress(`${" ".repeat(100_000)}a@exemple.test`)).toEqual({ ok: false });
  });

  it("valeur non textuelle → refus", () => {
    for (const entree of [undefined, null, 42, {}, ["a@exemple.test"]]) expect(parseEmailAddress(entree)).toEqual({ ok: false });
  });

  it("isCanonicalEmail : vrai seulement pour une forme déjà canonique", () => {
    expect(isCanonicalEmail("a@exemple.test")).toBe(true);
    expect(isCanonicalEmail("A@exemple.test")).toBe(false);
    expect(isCanonicalEmail(" a@exemple.test")).toBe(false);
    expect(isCanonicalEmail("a@exemple")).toBe(false);
  });

  it("clé e-mail du limiteur : partie locale coupée au premier +", () => {
    expect(rateLimitEmailKey(canonique("a+b+c@exemple.test"))).toBe("a@exemple.test");
    expect(rateLimitEmailKey(canonique("a@exemple.test"))).toBe("a@exemple.test");
  });
});

describe("limitation: les adresses d'un même préfixe IPv6 /64 partagent un compteur", () => {
  const meme = (a: string, b: string) => {
    expect(ipAddressKey(a), a).not.toBeNull();
    expect(ipAddressKey(a), `${a} / ${b}`).toBe(ipAddressKey(b));
  };
  const distinct = (a: string, b: string) => {
    expect(ipAddressKey(a), a).not.toBeNull();
    expect(ipAddressKey(b), b).not.toBeNull();
    expect(ipAddressKey(a), `${a} / ${b}`).not.toBe(ipAddressKey(b));
  };

  it("même /64 → même clé ; formes différentes d'une même adresse → même clé", () => {
    meme("2001:db8:1:2::1", "2001:db8:1:2:ffff::9");
    meme("2001:DB8:1:2::1", "2001:0db8:0001:0002:0000:0000:0000:0001");
    expect(ipAddressKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
  });

  it("autre /64 → autre clé", () => {
    distinct("2001:db8:1:2::1", "2001:db8:1:3::1");
  });

  it("IPv4 intégrée → clé de l'IPv4 ; deux IPv4 voisines → clés distinctes", () => {
    meme("::ffff:192.0.2.7", "192.0.2.7");
    meme("::ffff:c000:207", "192.0.2.7");
    meme("::FFFF:C000:0207", "192.0.2.7");
    distinct("192.0.2.7", "192.0.2.8");
    expect(ipAddressKey("192.0.2.7")).toBe("192.0.2.7");
  });

  it("IPv6 de forme mixte : même /64 que la forme hexadécimale", () => {
    meme("2001:db8::192.0.2.7", "2001:db8::1");
  });

  it("forme « compatible IPv4 » (obsolète) : IPv6 ordinaire de clé ::/64, distincte de l'IPv4", () => {
    expect(ipAddressKey("::192.0.2.7")).toBe("::/64");
    distinct("::192.0.2.7", "192.0.2.7");
  });

  it.each(["192.0.2.07", "192.000.002.007", "192.0.2.7:443", "[2001:db8::1]", "[2001:db8::1]:443", "fe80::1%eth0", "", "inconnu", " 192.0.2.7", "2001:db8::1/64"])(
    "%j → compartiment commun",
    (adresse) => {
      expect(ipAddressKey(adresse)).toBeNull();
    },
  );

  it("seul l'en-tête de confiance est lu, et sa première adresse seulement", () => {
    const entetes = new Headers({
      "x-vercel-forwarded-for": "192.0.2.7, 198.51.100.1",
      "x-forwarded-for": "203.0.113.9",
      "x-real-ip": "203.0.113.10",
      forwarded: "for=203.0.113.11",
    });
    expect(trustedIpKey(entetes, "x-vercel-forwarded-for")).toBe("192.0.2.7");
    expect(trustedIpKey(entetes, null)).toBeNull();
    expect(trustedIpKey(new Headers({ "x-forwarded-for": "203.0.113.9" }), "x-vercel-forwarded-for")).toBeNull();
    expect(trustedIpKey(new Headers({ "x-vercel-forwarded-for": " , 192.0.2.7" }), "x-vercel-forwarded-for")).toBeNull();
    expect(trustedIpKey(new Headers({ "x-vercel-forwarded-for": "2001:db8:1:2::1" }), "x-vercel-forwarded-for")).toBe("2001:db8:1:2::/64");
  });
});
