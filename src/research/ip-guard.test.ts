// @vitest-environment node
import { describe, expect, it } from "vitest";

import { adresseAutorisee, estIpLitterale, PLAGES_INTERDITES_IPV4, PLAGES_INTERDITES_IPV6 } from "./ip-guard";

/** Une adresse dans chaque plage interdite (spécification P0 : « un cas par plage interdite »). */
const CAS_IPV4: Record<string, string> = {
  "0.0.0.0/8": "0.1.2.3",
  "10.0.0.0/8": "10.20.30.40",
  "100.64.0.0/10": "100.100.1.1",
  "127.0.0.0/8": "127.0.0.1",
  "169.254.0.0/16": "169.254.169.254",
  "172.16.0.0/12": "172.31.255.1",
  "192.0.0.0/24": "192.0.0.8",
  "192.0.2.0/24": "192.0.2.10",
  "192.88.99.0/24": "192.88.99.1",
  "192.168.0.0/16": "192.168.1.1",
  "198.18.0.0/15": "198.19.0.1",
  "198.51.100.0/24": "198.51.100.7",
  "203.0.113.0/24": "203.0.113.9",
  "224.0.0.0/4": "239.255.255.250",
  "240.0.0.0/4": "255.255.255.255",
};

const CAS_IPV6: Record<string, string> = {
  "::/128": "::",
  "::1/128": "::1",
  "::/96": "::7f00:1",
  "::ffff:0:0/96": "::ffff:8.8.8.8",
  "64:ff9b::/96": "64:ff9b::808:808",
  "64:ff9b:1::/48": "64:ff9b:1::1",
  "100::/64": "100::1",
  "2001::/32": "2001:0:4136:e378::1",
  "2001:10::/28": "2001:10::1",
  "2001:20::/28": "2001:20::1",
  "2001:db8::/32": "2001:db8::1",
  "2002::/16": "2002:c000:204::1",
  "3fff::/20": "3fff::1",
  "5f00::/16": "5f00::1",
  "fc00::/7": "fd12:3456::1",
  "fe80::/10": "fe80::1",
  "fec0::/10": "fec0::1",
  "ff00::/8": "ff02::1",
};

describe("p0: lecture de pages, garde SSRF — plages d'adresses (ip-guard)", () => {
  it("couvre chaque plage de la spécification par un cas", () => {
    expect(Object.keys(CAS_IPV4).sort()).toEqual(PLAGES_INTERDITES_IPV4.map(([a, p]) => `${a}/${p}`).sort());
    expect(Object.keys(CAS_IPV6).sort()).toEqual(PLAGES_INTERDITES_IPV6.map(([a, p]) => `${a}/${p}`).sort());
  });

  for (const [plage, adresse] of Object.entries(CAS_IPV4)) {
    it(`refuse ${adresse} (${plage})`, () => expect(adresseAutorisee(adresse)).toBe(false));
  }
  for (const [plage, adresse] of Object.entries(CAS_IPV6)) {
    it(`refuse ${adresse} (${plage})`, () => expect(adresseAutorisee(adresse)).toBe(false));
  }

  it("accepte une adresse IPv4 publique", () => {
    expect(adresseAutorisee("45.10.20.30")).toBe(true);
    expect(adresseAutorisee("8.8.8.8")).toBe(true);
  });

  it("liste d'autorisation IPv6 : hors 2000::/3 refusé, unicast global hors plages accepté", () => {
    expect(adresseAutorisee("4000::1")).toBe(false);
    expect(adresseAutorisee("1::1")).toBe(false);
    expect(adresseAutorisee("2a00:1450:4001::1")).toBe(true);
  });

  it("refuse toute chaîne qui n'est pas une adresse", () => {
    for (const valeur of ["", "localhost", "exemple.org", "127.1", "0x7f.1", "[::1]"]) {
      expect(adresseAutorisee(valeur), valeur).toBe(false);
    }
  });

  it("reconnaît une IP littérale", () => {
    expect(estIpLitterale("127.0.0.1")).toBe(true);
    expect(estIpLitterale("::1")).toBe(true);
    expect(estIpLitterale("exemple.org")).toBe(false);
  });
});
