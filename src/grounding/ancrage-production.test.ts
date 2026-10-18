// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Lodging } from "@/contracts";
import { RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import { ancrerCandidats, ancrerLogementsSuggeres, RAYON_MIN_QUARTIER_METRES, verifierLogement, zoneEtDepart } from "@/grounding/ancrage-production";
import { cleMaison } from "@/grounding/interfaces";
import { zoneDuSejour } from "@/grounding/zone";

import { creerPlacesDouble, LAT_SENTINELLE, LNG_SENTINELLE, placesInterdit, SENTINELLES_B8, type LieuDouble } from "../../tests/support/doubles-grounding";

/**
 * Ancrage de production du MVP (B8a ; spécification B8, B8-PO-1 à B8-PO-4 ; décision 0085 § 1.3, § 3, § 4). Doubles à
 * valeurs sentinelles (`tests/support/doubles-grounding.ts`), jamais une réponse réelle.
 */

const VILLE = "Ville-de-test";
const CENTRE = { lat: LAT_SENTINELLE, lng: LNG_SENTINELLE };
const ZONE = zoneDuSejour([CENTRE], RAYON_BIAIS_METRES);
const OUVERT: LieuDouble = { statut: "OPERATIONAL", position: CENTRE, horaires: [{ jour: 1, debut: 600, fin: 1080 }] };

describe("ancrage: aucune fiche pour un candidat", () => {
  it("N candidats : N Text Search au plus, zéro appel details, position ni identifiant", async () => {
    const candidats = ["c1", "c2", "c3", "c4"].map((id) => ({ id, nom: `Lieu maison ${id}` }));
    const places = creerPlacesDouble({
      lieux: { P_C1: OUVERT, P_C2: OUVERT },
      textes: { [`Lieu maison c1, ${VILLE}`]: ["P_C1"], [`Lieu maison c2, ${VILLE}`]: ["P_C2"] },
    });
    const resultat = await ancrerCandidats(candidats, VILLE, ZONE, places);
    expect(resultat.ok).toBe(true);
    expect(places.appels.length).toBeLessThanOrEqual(candidats.length);
    expect(places.appels.every((appel) => appel.methode === "textSearch")).toBe(true);
  });
});

describe("ancrage: Text Search restreint à la zone du séjour", () => {
  it("restriction de B8-PO-1, texte « <nom maison>, <ville> », sans biais ; premier placeId ; sans résultat : absent", async () => {
    const places = creerPlacesDouble({
      textes: { [`Musée maison, ${VILLE}`]: ["P_MUSEE", "P_AUTRE"], [`Introuvable maison, ${VILLE}`]: [] },
    });
    const resultat = await ancrerCandidats(
      [
        { id: "a", nom: "Musée maison" },
        { id: "b", nom: "Introuvable maison" },
      ],
      VILLE,
      ZONE,
      places,
    );
    if (!resultat.ok) throw new Error(resultat.code);
    expect([...resultat.valeur]).toEqual([["a", "P_MUSEE"]]);
    for (const appel of places.appels) {
      if (appel.methode !== "textSearch") throw new Error("appel inattendu");
      expect(appel.requete.restriction).toEqual(ZONE);
      expect(appel.requete.biais).toBeNull();
    }
    expect(places.appels.map((appel) => (appel.methode === "textSearch" ? appel.requete.texte : ""))).toEqual([`Musée maison, ${VILLE}`, `Introuvable maison, ${VILLE}`]);
    // Le client réel ne demande que `places.id` (masque fixé dans le module de capacité ; `places-client.test.ts`).
    // La sortie : identifiants maison → placeId, rien d'autre (ni verdict, ni motif, ni compteur).
    expect(resultat.valeur).toBeInstanceOf(Map);
    expect(Object.keys(resultat).sort()).toEqual(["ok", "valeur"]);
  });
});

describe("ancrage: logements", () => {
  const FERME: LieuDouble = { ...OUVERT, statut: "CLOSED_PERMANENTLY" };

  // Vérification (0087 § 2.2 et § 2.4 ; B8-PO-3, B8-PO-14) : `placeId` seul en sortie, une fiche `details`.
  it("vérification known : Text Search sans biais ni restriction, puis une fiche details ; rend le placeId seul", async () => {
    const places = creerPlacesDouble({ lieux: { P_HOTEL: OUVERT }, textes: { [`Hôtel saisi, ${VILLE}`]: ["P_HOTEL"] } });
    const resultat = await verifierLogement({ kind: "known", label: "Hôtel saisi" }, VILLE, places);
    expect(resultat).toEqual({ ok: true, valeur: { placeId: "P_HOTEL" } });
    expect(places.appels).toEqual([
      { methode: "textSearch", requete: { texte: `Hôtel saisi, ${VILLE}`, biais: null } },
      { methode: "details", placeId: "P_HOTEL" },
    ]);
  });

  it.each([
    ["sans résultat", creerPlacesDouble({})],
    ["introuvable à la fiche", creerPlacesDouble({ textes: { [`Hôtel saisi, ${VILLE}`]: ["P_ABSENT"] } })],
    ["fermé définitivement", creerPlacesDouble({ lieux: { P_HOTEL: FERME }, textes: { [`Hôtel saisi, ${VILLE}`]: ["P_HOTEL"] } })],
  ])("vérification known %s : lodging_unresolved", async (_cas, places) => {
    expect(await verifierLogement({ kind: "known", label: "Hôtel saisi" }, VILLE, places)).toEqual({ ok: false, code: "lodging_unresolved", retryable: false });
  });

  it("vérification suggestedLodging : garde son placeId (une fiche, aucun Text Search) ; sans placeId : comme known (B8-PO-14) ; fermé : lodging_unresolved", async () => {
    const logement: Lodging = { kind: "suggestedLodging", lodgingId: "l1", placeId: "P_SUGGERE", name: "[Hôtel suggéré]" };
    const places = creerPlacesDouble({ lieux: { P_SUGGERE: OUVERT } });
    expect(await verifierLogement(logement, VILLE, places)).toEqual({ ok: true, valeur: { placeId: "P_SUGGERE" } });
    expect(places.appels).toEqual([{ methode: "details", placeId: "P_SUGGERE" }]);
    const sansId = creerPlacesDouble({ lieux: { P_NOM: OUVERT }, textes: { [`[Hôtel suggéré], ${VILLE}`]: ["P_NOM"] } });
    expect(await verifierLogement({ kind: "suggestedLodging", lodgingId: "l1", name: "[Hôtel suggéré]" }, VILLE, sansId)).toEqual({ ok: true, valeur: { placeId: "P_NOM" } });
    expect(sansId.appels.map((appel) => appel.methode)).toEqual(["textSearch", "details"]);
    const ferme = await verifierLogement(logement, VILLE, creerPlacesDouble({ lieux: { P_SUGGERE: FERME } }));
    expect(ferme).toEqual({ ok: false, code: "lodging_unresolved", retryable: false });
  });

  it.each([
    { kind: "suggestedArea", areaId: "z1", name: "Quartier maison", center: { lat: 46.2, lng: 6.15 }, radiusM: 800 } as const,
    { kind: "area", label: "Vieille ville" } as const,
    { kind: "none" } as const,
  ])("vérification $kind : aucun appel, null", async (logement) => {
    expect(await verifierLogement(logement, VILLE, placesInterdit())).toEqual({ ok: true, valeur: null });
  });

  it("vérification : la fiche details ne sort pas (ni position, ni horaires, ni sentinelle)", async () => {
    const places = creerPlacesDouble({ lieux: { P_HOTEL: OUVERT }, textes: { [`Hôtel saisi, ${VILLE}`]: ["P_HOTEL"] } });
    const texte = JSON.stringify(await verifierLogement({ kind: "known", label: "Hôtel saisi" }, VILLE, places));
    expect(texte).toBe(JSON.stringify({ ok: true, valeur: { placeId: "P_HOTEL" } }));
    for (const valeur of [...Object.values(SENTINELLES_B8), LAT_SENTINELLE, LNG_SENTINELLE]) expect(texte).not.toContain(String(valeur));
  });

  // Zone et départ (0087 § 2.3, § 2.4 et § 3 ; B8-PO-1, B8-PO-15, B8-PO-16).
  it.each(["known", "suggestedLodging"] as const)("zone et départ %s vérifié : une fiche position sur son placeId, ni details ni Text Search ; zone de 30 km", async (kind) => {
    const places = creerPlacesDouble({ lieux: { P_HOTEL: OUVERT } });
    const resultat = await zoneEtDepart({ kind, placeId: "P_HOTEL" }, VILLE, places);
    expect(resultat).toEqual({ ok: true, valeur: { zone: ZONE, centre: CENTRE, placeIdLogement: "P_HOTEL", depart: { placeId: "P_HOTEL", position: CENTRE } } });
    expect(places.appels).toEqual([{ methode: "position", placeId: "P_HOTEL" }]);
  });

  it("zone et départ d'un logement vérifié devenu introuvable : lodging_unresolved", async () => {
    expect(await zoneEtDepart({ kind: "known", placeId: "P_ABSENT" }, VILLE, creerPlacesDouble({}))).toEqual({ ok: false, code: "lodging_unresolved", retryable: false });
  });

  it("zone et départ suggestedArea : aucun appel Google ; zone, centre et départ sur le centre maison (B8-PO-15, variante (i))", async () => {
    const centre = { lat: 46.2, lng: 6.15 };
    const resultat = await zoneEtDepart({ kind: "suggestedArea", areaId: "z1", name: "Quartier maison", center: centre, radiusM: 800 }, VILLE, placesInterdit());
    expect(resultat).toEqual({
      ok: true,
      valeur: { zone: zoneDuSejour([centre], RAYON_BIAIS_METRES), centre, placeIdLogement: null, depart: { cleMaison: cleMaison(centre), centreMaison: centre } },
    });
  });

  it.each([{ kind: "area", label: "Vieille ville" } as const, { kind: "none" } as const])("zone et départ $kind : ville par Text Search puis position (masque id,location)", async (logement) => {
    const places = creerPlacesDouble({ lieux: { P_VILLE: OUVERT }, textes: { [VILLE]: ["P_VILLE"] } });
    const resultat = await zoneEtDepart(logement, VILLE, places);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(resultat.valeur).toEqual({ zone: ZONE, centre: CENTRE, placeIdLogement: null, depart: { placeId: "P_VILLE", position: CENTRE } });
    expect(places.appels).toEqual([
      { methode: "textSearch", requete: { texte: VILLE, biais: null } },
      { methode: "position", placeId: "P_VILLE" },
    ]);
    expect(await zoneEtDepart(logement, VILLE, creerPlacesDouble({}))).toEqual({ ok: false, code: "lodging_unresolved", retryable: false });
  });

  it("logements suggérés : Text Search « IDs only » restreint à max(rayon, 2 000 m) ; non résolu retiré sans trace, zone gardée ; aucune fiche", async () => {
    const zone = { centre: { lat: 46.2, lng: 6.15 }, rayonM: 50 };
    const logements = [
      { nom: "Hôtel A", meta: "meta maison A", sourceUrl: "https://guide.example/a" },
      { nom: "Hôtel B", meta: "meta maison B", sourceUrl: "https://guide.example/b" },
    ];
    const places = creerPlacesDouble({ textes: { [`Hôtel A, ${VILLE}`]: ["P_A"] } });
    const resultat = await ancrerLogementsSuggeres({ zone, logements }, VILLE, places);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(resultat.valeur).toEqual([{ ...logements[0], placeId: "P_A" }]);
    const attendue = zoneDuSejour([zone.centre], RAYON_MIN_QUARTIER_METRES);
    for (const appel of places.appels) {
      if (appel.methode !== "textSearch") throw new Error("fiche inattendue");
      expect(appel.requete.restriction).toEqual(attendue);
    }
    // Zéro logement résolu : réponse valide.
    const vide = await ancrerLogementsSuggeres({ zone, logements }, VILLE, creerPlacesDouble({}));
    expect(vide).toEqual({ ok: true, valeur: [] });
  });
});

describe("ancrage: quartier sans zone, aucun appel", () => {
  it("B8-PO-13 : quartier de zone null qui porte des logements → liste vide, aucun Text Search", async () => {
    const places = placesInterdit();
    const resultat = await ancrerLogementsSuggeres({ zone: null, logements: [{ nom: "Hôtel A" }, { nom: "Hôtel B" }] }, VILLE, places);
    expect(resultat).toEqual({ ok: true, valeur: [] });
  });
});

describe("ancrage: aucune donnée Google hors de la mémoire", () => {
  it("sorties de ancrerCandidats et ancrerLogementsSuggeres : identifiants maison et placeId seulement", async () => {
    const sentinelle: LieuDouble = { statut: "CLOSED_TEMPORARILY", position: { lat: LAT_SENTINELLE, lng: LNG_SENTINELLE }, horaires: [{ jour: 3, debut: 547, fin: 1433 }] };
    const places = creerPlacesDouble({ lieux: { P_X: sentinelle }, textes: { [`Lieu X, ${VILLE}`]: ["P_X"], [`Hôtel X, ${VILLE}`]: ["P_X"] } });
    const candidats = await ancrerCandidats([{ id: "x", nom: "Lieu X" }], VILLE, ZONE, places);
    const suggeres = await ancrerLogementsSuggeres({ zone: { centre: CENTRE, rayonM: 800 }, logements: [{ nom: "Hôtel X" }] }, VILLE, places);
    if (!candidats.ok || !suggeres.ok) throw new Error("échec inattendu");
    const texte = JSON.stringify([[...candidats.valeur], suggeres.valeur]);
    for (const valeur of [...Object.values(SENTINELLES_B8), LAT_SENTINELLE, LNG_SENTINELLE, "547", "1433", "CLOSED_TEMPORARILY"]) expect(texte).not.toContain(String(valeur));
    expect(texte).toBe(JSON.stringify([[["x", "P_X"]], [{ nom: "Hôtel X", placeId: "P_X" }]]));
  });
});
