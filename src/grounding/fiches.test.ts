// @vitest-environment node
import { describe, expect, it } from "vitest";

import { RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { AGE_RAFRAICHISSEMENT_MS, chargerFiches, ficherSerie, rafraichirPlaceId } from "@/grounding/fiches";
import { zoneDuSejour } from "@/grounding/zone";

import { creerPlacesDouble, LAT_SENTINELLE, LNG_SENTINELLE, placesInterdit, SENTINELLES_B8, type LieuDouble } from "../../tests/support/doubles-grounding";

/**
 * Fiches du MVP (B8a ; spécification B8, B8-PO-5, B8-PO-6, B8-PO-12 ; décision 0085 § 1.5, § 5). Doubles à valeurs
 * sentinelles ; `placeId` fabriqués.
 */

const CENTRE = { lat: LAT_SENTINELLE, lng: LNG_SENTINELLE };
const ZONE = zoneDuSejour([CENTRE], RAYON_BIAIS_METRES);
const HORS_ZONE = { lat: LAT_SENTINELLE + 3, lng: LNG_SENTINELLE };
const HORAIRES = [{ jour: 2, debut: 547, fin: 1433 }];
const lieu = (statut: LieuDouble["statut"], position = CENTRE): LieuDouble => ({ statut, position, horaires: HORAIRES });

const classement = (n: number, prefixe = "P") => Array.from({ length: n }, (_, i) => ({ id: `c${i + 1}`, placeId: `${prefixe}_${i + 1}` }));

describe("fiches: bornées à la série et à sa marge", () => {
  it("classement de 30, série de 8, marge de 4 : au plus 12 details, dans l'ordre ; écarté remplacé ; marge épuisée : série incomplète", async () => {
    const lieux: Record<string, LieuDouble> = Object.fromEntries(classement(30).map(({ placeId }) => [placeId, lieu("OPERATIONAL")]));
    // Tous ouverts : exactement 8 fiches, aucune de la marge.
    const pleine = creerPlacesDouble({ lieux });
    const tous = await ficherSerie(classement(30), { premiereSerie: 8, marge: 4 }, ZONE, pleine);
    if (!tous.ok) throw new Error(tous.code);
    expect(tous.valeur.complete).toBe(true);
    expect(tous.valeur.retenus.map((r) => r.id)).toEqual(classement(8).map((c) => c.id));
    expect(pleine.appels).toEqual(classement(8).map(({ placeId }) => ({ methode: "details", placeId })));

    // Le 2e fermé définitivement : remplacé par le 9e.
    const unFerme = creerPlacesDouble({ lieux: { ...lieux, P_2: lieu("CLOSED_PERMANENTLY") } });
    const remplace = await ficherSerie(classement(30), { premiereSerie: 8, marge: 4 }, ZONE, unFerme);
    if (!remplace.ok) throw new Error(remplace.code);
    expect(remplace.valeur.retenus.map((r) => r.id)).toEqual(["c1", "c3", "c4", "c5", "c6", "c7", "c8", "c9"]);
    expect(unFerme.appels).toHaveLength(9);

    // Tous fermés : 12 fiches au plus, série incomplète, aucun autre appel details.
    const fermes: Record<string, LieuDouble> = Object.fromEntries(classement(30).map(({ placeId }) => [placeId, lieu("CLOSED_PERMANENTLY")]));
    const epuisee = creerPlacesDouble({ lieux: fermes });
    const incomplete = await ficherSerie(classement(30), { premiereSerie: 8, marge: 4 }, ZONE, epuisee);
    if (!incomplete.ok) throw new Error(incomplete.code);
    expect(incomplete.valeur).toEqual({ retenus: [], ecartes: 12, complete: false });
    expect(epuisee.appels).toEqual(classement(12).map(({ placeId }) => ({ methode: "details", placeId })));
  });
});

describe("fiches: une issue pour chaque lieu relu", () => {
  const LIEUX = {
    P_OUVERT: lieu("OPERATIONAL"),
    P_TEMP: lieu("CLOSED_TEMPORARILY"),
    P_FERME: lieu("CLOSED_PERMANENTLY"),
    P_LOIN: lieu("OPERATIONAL", HORS_ZONE),
  };
  const LISTE = ["P_OUVERT", "P_TEMP", "P_FERME", "P_ABSENT", "P_LOIN"];

  it("chargee (statut, position) ou introuvable, dans l'ordre, sans filtrage ni compteur, sans appel au-delà de la liste", async () => {
    const places = creerPlacesDouble({ lieux: LIEUX });
    const resultat = await chargerFiches(LISTE, places);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(resultat.valeur).toEqual([
      { placeId: "P_OUVERT", issue: "chargee", statut: "OPERATIONAL", position: CENTRE, horaires: HORAIRES },
      { placeId: "P_TEMP", issue: "chargee", statut: "CLOSED_TEMPORARILY", position: CENTRE, horaires: HORAIRES },
      { placeId: "P_FERME", issue: "chargee", statut: "CLOSED_PERMANENTLY", position: CENTRE, horaires: HORAIRES },
      { placeId: "P_ABSENT", issue: "introuvable" },
      { placeId: "P_LOIN", issue: "chargee", statut: "OPERATIONAL", position: HORS_ZONE, horaires: HORAIRES },
    ]);
    expect(places.appels).toEqual(LISTE.map((placeId) => ({ methode: "details", placeId })));
    // Nom, adresse, note et prix du double ne sont jamais recopiés.
    for (const sentinelle of Object.values(SENTINELLES_B8)) expect(JSON.stringify(resultat)).not.toContain(String(sentinelle));
  });

  it.each([
    ["erreur", () => new Error(`${SENTINELLES_B8.corps} 500`), "upstream_error", false],
    ["plafond", () => new ErreurClientGoogle("cap_reached"), "cap_reached", false],
    ["quota", () => new ErreurClientGoogle("daily_quota_insufficient"), "daily_quota_insufficient", false],
    ["Google indisponible", () => new ErreurClientGoogle("upstream_unavailable"), "upstream_unavailable", true],
  ])("%s sur l'un des appels : erreur de l'appel entier, sans issue", async (_cas, fabrique, code, retryable) => {
    const places = creerPlacesDouble({ lieux: LIEUX, erreur: { auAppel: 3, fabrique } });
    expect(await chargerFiches(LISTE, places)).toEqual({ ok: false, code, retryable });
  });
});

describe("fiches: une fiche par placeId distinct, appels séquentiels", () => {
  it("doublon : une fiche, même issue ; erreur au deuxième appel : aucun troisième appel, aucune issue", async () => {
    const lieux = { P_A: lieu("OPERATIONAL"), P_B: lieu("OPERATIONAL"), P_C: lieu("OPERATIONAL") };
    const places = creerPlacesDouble({ lieux });
    const resultat = await chargerFiches(["P_A", "P_A"], places);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(resultat.valeur[0]).toEqual(resultat.valeur[1]);
    expect(places.appels).toHaveLength(1);
    const enErreur = creerPlacesDouble({ lieux, erreur: { auAppel: 2, fabrique: () => new ErreurClientGoogle("upstream_timeout") } });
    expect(await chargerFiches(["P_A", "P_B", "P_C"], enErreur)).toEqual({ ok: false, code: "upstream_timeout", retryable: true });
    expect(enErreur.appels).toHaveLength(2);
  });
});

describe("fiches: fermé définitivement, introuvable ou hors zone écarté", () => {
  it("série de 5 avec les cinq sentinelles, marge de 3 : trois écartés remplacés, CLOSED_TEMPORARILY gardé et non compté", async () => {
    const lieux = {
      P_OUVERT: lieu("OPERATIONAL"),
      P_TEMP: lieu("CLOSED_TEMPORARILY"),
      P_FERME: lieu("CLOSED_PERMANENTLY"),
      P_LOIN: lieu("OPERATIONAL", HORS_ZONE),
      P_6: lieu("OPERATIONAL"),
      P_7: lieu("OPERATIONAL"),
      P_8: lieu("OPERATIONAL"),
    };
    const ordre = ["P_OUVERT", "P_TEMP", "P_FERME", "P_ABSENT", "P_LOIN", "P_6", "P_7", "P_8"].map((placeId, i) => ({ id: `c${i + 1}`, placeId }));
    const places = creerPlacesDouble({ lieux });
    const resultat = await ficherSerie(ordre, { premiereSerie: 5, marge: 3 }, ZONE, places);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(resultat.valeur.retenus.map((r) => r.fiche.placeId)).toEqual(["P_OUVERT", "P_TEMP", "P_6", "P_7", "P_8"]);
    expect(resultat.valeur.ecartes).toBe(3);
    expect(resultat.valeur.complete).toBe(true);
    expect(places.appels).toHaveLength(8);
  });

  it("échec d'un appel de la série : son code, sans série partielle", async () => {
    const places = creerPlacesDouble({ lieux: { P_1: lieu("OPERATIONAL") }, erreur: { auAppel: 2, fabrique: () => new ErreurClientGoogle("cap_reached") } });
    expect(await ficherSerie(classement(5), { premiereSerie: 3, marge: 1 }, ZONE, places)).toEqual({ ok: false, code: "cap_reached", retryable: false });
  });
});

describe("ancrage: un placeId de plus de 12 mois est rafraîchi", () => {
  const MAINTENANT = Date.UTC(2026, 9, 17);
  const VIEUX = { placeId: "P_VIEUX", reference: MAINTENANT - AGE_RAFRAICHISSEMENT_MS - 1 };

  it("plus de 365 jours : un appel identifiant (masque id), aucun Text Search ; autre id rendu", async () => {
    const places = creerPlacesDouble({ renommes: { P_VIEUX: "P_NOUVEAU" } });
    expect(await rafraichirPlaceId(VIEUX, MAINTENANT, places)).toEqual({ ok: true, valeur: { issue: "identifiant", placeId: "P_NOUVEAU", rafraichi: true } });
    expect(places.appels).toEqual([{ methode: "identifiant", placeId: "P_VIEUX" }]);
  });

  it("introuvable : valeur introuvable, jamais le code place_not_found", async () => {
    expect(await rafraichirPlaceId(VIEUX, MAINTENANT, creerPlacesDouble({}))).toEqual({ ok: true, valeur: { issue: "introuvable", placeId: "P_VIEUX" } });
  });

  it.each([
    ["erreur", () => new Error(SENTINELLES_B8.corps), "upstream_error"],
    ["plafond", () => new ErreurClientGoogle("cap_reached"), "cap_reached"],
    ["quota", () => new ErreurClientGoogle("daily_quota_insufficient"), "daily_quota_insufficient"],
  ])("%s : code fermé, aucun identifiant", async (_cas, fabrique, code) => {
    const resultat = await rafraichirPlaceId(VIEUX, MAINTENANT, creerPlacesDouble({ erreur: { auAppel: 1, fabrique } }));
    expect(resultat).toEqual({ ok: false, code, retryable: false });
  });

  it("365 jours ou moins : aucun appel (client qui échoue s'il est appelé)", async () => {
    const recent = { placeId: "P_RECENT", reference: MAINTENANT - AGE_RAFRAICHISSEMENT_MS };
    expect(await rafraichirPlaceId(recent, MAINTENANT, placesInterdit())).toEqual({ ok: true, valeur: { issue: "identifiant", placeId: "P_RECENT", rafraichi: false } });
  });
});
