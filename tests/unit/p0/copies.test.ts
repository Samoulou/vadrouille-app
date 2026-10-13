// @vitest-environment node
import { describe, expect, it } from "vitest";

import { urlSourceValide as urlSourceValideR1 } from "@/domain/validation";
import { MODES_ROUTES } from "@/grounding/interfaces";
import { PositionSchema as PositionAncrage } from "@/prototype/ancrage";
import { MODES_DEPLACEMENT } from "@/prototype/brief";
import { PositionSchema as PositionReduite, urlSourceValide as urlSourceValideReduite } from "@/prototype/programme-reduit";
import { analyserUrl } from "@/research/fetch-page";

/**
 * Copies volontaires entre modules qui n'ont pas le droit de s'importer (décision 0032, A3.2) : elles doivent
 * rester d'accord. Revue Sécurité de #180, mineur 4 : une table par copie, pour qu'une divergence (comme le
 * `hostname !== ""` présent dans une seule copie avant cette correction) fasse échouer la CI.
 */

const lisible = (url: string) => (url.length > 80 ? `${url.slice(0, 40)}… (${url.length} caractères)` : url || "(vide)");

describe("p0: validation d'URL de source — même verdict partout (table)", () => {
  // [URL, source valide (programme réduit et R1), page lisible par le lecteur (plus strict : port 443, nom d'hôte)]
  const table: [string, boolean, boolean][] = [
    ["https://exemple.org/a", true, true],
    ["HTTPS://EXEMPLE.ORG/a", true, true],
    ["https://exemple.org./a", true, true],
    ["https://exemple.org/a?b=c#d", true, true],
    ["https://exemple.org:443/a", true, true],
    ["https://exemple.org:8443/a", true, false],
    ["https://127.0.0.1/", true, false],
    ["https://0x7f.1/", true, false],
    ["https://2130706433/", true, false],
    ["https://[::1]/", true, false],
    ["http://exemple.org/", false, false],
    ["ftp://exemple.org/", false, false],
    ["javascript:alert(1)", false, false],
    ["data:text/html,x", false, false],
    ["file:///etc/passwd", false, false],
    ["https://moi:secret@exemple.org/", false, false],
    ["https://moi@exemple.org/", false, false],
    ["https://:secret@exemple.org/", false, false],
    ["https://", false, false],
    ["https:///a", true, true],
    ["//exemple.org/a", false, false],
    ["pas une url", false, false],
    ["", false, false],
    [`https://exemple.org/${"a".repeat(2048 - "https://exemple.org/".length)}`, true, true],
    [`https://exemple.org/${"a".repeat(2049 - "https://exemple.org/".length)}`, false, true],
  ];

  for (const [url, source, lisibleParLeLecteur] of table) {
    it(lisible(url), () => {
      expect(urlSourceValideReduite(url), "programme-reduit.ts").toBe(source);
      expect(urlSourceValideR1(url), "domain/validation.ts").toBe(source);
      let lue: boolean;
      try {
        analyserUrl(url);
        lue = true;
      } catch {
        lue = false;
      }
      expect(lue, "research/fetch-page.ts").toBe(lisibleParLeLecteur);
      // Le lecteur n'est jamais plus permissif que la validation de source, sauf sur la longueur (il ne lit que des
      // URL déjà rendues par la recherche, et la source citée est contrôlée à la sortie).
      if (url.length <= 2048 && lue) expect(source, "lecteur plus permissif que la validation de source").toBe(true);
    });
  }
});

describe("p0: PositionSchema — ancrage.ts et programme-reduit.ts d'accord (table)", () => {
  const table: [unknown, boolean][] = [
    [{ lat: 55.95, lng: -3.19 }, true],
    [{ lat: 90, lng: 180 }, true],
    [{ lat: -90, lng: -180 }, true],
    [{ lat: 0, lng: 0 }, true],
    [{ lat: 90.0001, lng: 0 }, false],
    [{ lat: -90.0001, lng: 0 }, false],
    [{ lat: 0, lng: 180.0001 }, false],
    [{ lat: 0, lng: -180.0001 }, false],
    [{ lat: Number.NaN, lng: 0 }, false],
    [{ lat: Number.POSITIVE_INFINITY, lng: 0 }, false],
    [{ lat: "55.95", lng: -3.19 }, false],
    [{ lat: 55.95 }, false],
    [{ lat: 55.95, lng: -3.19, alt: 0 }, false],
    [[55.95, -3.19], false],
    [null, false],
  ];
  for (const [valeur, attendu] of table) {
    it(JSON.stringify(valeur) ?? String(valeur), () => {
      expect(PositionAncrage.safeParse(valeur).success, "ancrage.ts").toBe(attendu);
      expect(PositionReduite.safeParse(valeur).success, "programme-reduit.ts").toBe(attendu);
    });
  }
});

describe("p0: modes de déplacement — brief.ts et grounding/interfaces.ts d'accord", () => {
  it("MODES_DEPLACEMENT et MODES_ROUTES sont identiques, dans le même ordre", () => {
    expect([...MODES_ROUTES]).toEqual([...MODES_DEPLACEMENT]);
  });
});
