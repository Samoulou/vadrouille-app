// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { capacitesAncrage } from "@/grounding/ancrage-zone";
import { fichesEtapeFinale } from "@/grounding/fiches-finales";
import { zoneDuSejour } from "@/grounding/zone";
import { BriefSchema } from "@/prototype/brief";

import { creerPlacesDouble, LAT_SENTINELLE, LNG_SENTINELLE } from "../../support/doubles-grounding";
import { RACINE } from "./resolution";

/**
 * `p0: composition sans les nouveaux masques` (décision 0085 § 2 point e, soumis au verdict de la Sécurité) :
 * `p0-reel.ts` n'appelle ni `position` ni `identifiant`. Le cas `p0: fiche introuvable écartée en mode réel` est dans
 * `src/grounding/places-client.test.ts` (client réel sur transport simulé ; aucun importateur nouveau du client réel).
 */

const CENTRE = { lat: LAT_SENTINELLE, lng: LNG_SENTINELLE };
const ZONE = zoneDuSejour([CENTRE], 30_000);

describe("p0: composition sans les nouveaux masques", () => {
  it("p0-reel.ts ne nomme ni position ni identifiant comme méthode appelée", () => {
    const texte = readFileSync(path.join(RACINE, "src/server/composition/p0-reel.ts"), "utf8");
    expect(texte).not.toMatch(/\.\s*(position|identifiant)\b/);
    expect(texte).not.toMatch(/\[\s*["'`](position|identifiant)["'`]\s*\]/);
    expect(texte).not.toMatch(/\b(position|identifiant)\s*[,}]/);
  });

  it("capacités de l'ancrage de P0 : textSearch et details seulement, jamais position ni identifiant", async () => {
    const places = creerPlacesDouble({ lieux: { P_L: { statut: "OPERATIONAL", position: CENTRE, horaires: null } }, textes: { "Hôtel, Ville": ["P_L"] } });
    const capacites = capacitesAncrage(places);
    await capacites.textSearch({ texte: "Hôtel, Ville", biais: null });
    const brief = BriefSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")));
    await capacites.detailsLogement(brief, 0).catch(() => undefined);
    await fichesEtapeFinale([{ id: "c", placeId: "P_L" }], places, ZONE, { premiereSerie: 1, marge: 0 });
    expect(new Set(places.appels.map((appel) => appel.methode))).toEqual(new Set(["textSearch", "details"]));
  });
});
