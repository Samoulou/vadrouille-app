// @vitest-environment node
import { describe, expect, it } from "vitest";

import { RAYON_BIAIS_METRES } from "@/grounding/ancrage";
import { ancrerCandidats, ancrerLogement, ancrerLogementsSuggeres } from "@/grounding/ancrage-production";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { chargerFiches, ficherSerie, rafraichirPlaceId } from "@/grounding/fiches";
import { ErreurAncrage, type ClientPlacesMvp, type ClientRoutes } from "@/grounding/interfaces";
import { CODES_ANCRAGE, echecDe, type ResultatAncrage } from "@/grounding/resultat";
import { chargerTrajets } from "@/grounding/trajets";
import { zoneDuSejour } from "@/grounding/zone";

import { creerPlacesDouble, creerRoutesDouble, LAT_SENTINELLE, LNG_SENTINELLE, SENTINELLES_B8 } from "../../tests/support/doubles-grounding";

/**
 * `ancrage: erreur de Google réduite à son code` et `ancrage: résultat fermé` (spécification B8, B8a ; décision 0085
 * § 1.2 et « Conséquences testables »), sur le modèle de `p0: erreur de fournisseur réduite à un code`. Chaque
 * fonction de B8a, avec un double dont l'erreur porte des sentinelles : `{ ok: false, code, retryable }`, code de
 * `CODES_ANCRAGE`, sans sentinelle. Les mêmes fonctions sur les clients réels (transport de test, corps sentinelle) sont
 * dans les tests des clients (`places-client.test.ts`, `routes-client.test.ts`), seuls importateurs admis hors de la
 * composition.
 */

const VILLE = "Ville-de-test";
const CENTRE = { lat: LAT_SENTINELLE, lng: LNG_SENTINELLE };
const ZONE = zoneDuSejour([CENTRE], RAYON_BIAIS_METRES);
const SENTINELLES = [...Object.values(SENTINELLES_B8).map(String), String(LAT_SENTINELLE)];

type Cas = readonly [string, (places: ClientPlacesMvp, routes: ClientRoutes) => Promise<ResultatAncrage<unknown>>];
const MAINTENANT = Date.UTC(2026, 9, 17);
const FONCTIONS: readonly Cas[] = [
  ["ancrerCandidats", (places) => ancrerCandidats([{ id: "c", nom: "Lieu maison" }], VILLE, ZONE, places)],
  ["ancrerLogement", (places) => ancrerLogement({ kind: "known", label: "Hôtel maison" }, VILLE, places)],
  ["ancrerLogementsSuggeres", (places) => ancrerLogementsSuggeres({ zone: null, logements: [{ nom: "Hôtel maison" }] }, VILLE, places)],
  ["rafraichirPlaceId", (places) => rafraichirPlaceId({ placeId: "P_VIEUX", reference: 0 }, MAINTENANT, places)],
  ["chargerFiches", (places) => chargerFiches(["P_A"], places)],
  ["ficherSerie", (places) => ficherSerie([{ id: "c", placeId: "P_A" }], { premiereSerie: 1, marge: 0 }, ZONE, places)],
  ["chargerTrajets", (_places, routes) => chargerTrajets([{ placeId: "P_A", position: CENTRE }, { placeId: "P_B", position: CENTRE }], ["walk"], routes)],
];

function verifierEchec(resultat: ResultatAncrage<unknown>, code?: string) {
  expect(resultat.ok).toBe(false);
  if (resultat.ok) return;
  expect(Object.keys(resultat).sort()).toEqual(["code", "ok", "retryable"]);
  expect(CODES_ANCRAGE).toContain(resultat.code);
  expect(resultat.code).not.toBe("upstream_not_found");
  if (code !== undefined) expect(resultat.code).toBe(code);
  for (const sentinelle of SENTINELLES) expect(JSON.stringify(resultat)).not.toContain(sentinelle);
}

describe("ancrage: erreur de Google réduite à son code", () => {
  it.each(FONCTIONS)("%s : erreur du double à corps sentinelle → upstream_error, sans sentinelle ni message", async (_nom, appeler) => {
    const erreur = () => new Error(`${SENTINELLES_B8.corps} ${SENTINELLES_B8.nom}`);
    const places = creerPlacesDouble({ textes: { [`Hôtel maison, ${VILLE}`]: ["P_H"] }, erreur: { auAppel: 1, fabrique: erreur } });
    const routes = creerRoutesDouble({ secondes: () => 4321, erreur: { auAppel: 1, fabrique: erreur } });
    verifierEchec(await appeler(places, routes), "upstream_error");
  });
});

describe("ancrage: résultat fermé", () => {
  it("conversion unique : ErreurClientGoogle → son code et retryable ; ErreurAncrage → son code ; autre → upstream_error", () => {
    expect(echecDe(new ErreurClientGoogle("upstream_rate_limited"))).toEqual({ ok: false, code: "upstream_rate_limited", retryable: true });
    expect(echecDe(new ErreurAncrage("lodging_unresolved"))).toEqual({ ok: false, code: "lodging_unresolved", retryable: false });
    expect(echecDe(new TypeError(SENTINELLES_B8.corps))).toEqual({ ok: false, code: "upstream_error", retryable: false });
    expect(echecDe("chaîne")).toEqual({ ok: false, code: "upstream_error", retryable: false });
    // Filet : upstream_not_found ne sort d'aucune fonction.
    expect(echecDe(new ErreurClientGoogle("upstream_not_found"))).toEqual({ ok: false, code: "upstream_error", retryable: false });
  });

  it("chargerFiches et rafraichirPlaceId ne rendent jamais place_not_found comme code", async () => {
    const places = creerPlacesDouble({});
    const fiches = await chargerFiches(["P_ABSENT"], places);
    expect(fiches).toEqual({ ok: true, valeur: [{ placeId: "P_ABSENT", issue: "introuvable" }] });
    const rafraichi = await rafraichirPlaceId({ placeId: "P_ABSENT", reference: 0 }, MAINTENANT, places);
    expect(rafraichi).toEqual({ ok: true, valeur: { placeId: "P_ABSENT", issue: "introuvable" } });
  });

  it("ancrerLogement rend place_not_found sous lodging_unresolved", async () => {
    const places = creerPlacesDouble({ textes: { [`Hôtel maison, ${VILLE}`]: ["P_ABSENT"] } });
    expect(await ancrerLogement({ kind: "known", label: "Hôtel maison" }, VILLE, places)).toEqual({ ok: false, code: "lodging_unresolved", retryable: false });
  });
});
