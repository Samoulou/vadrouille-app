// @vitest-environment node
import { describe, expect, it } from "vitest";

import { BLOC_MATRICE } from "@/grounding/ancrage";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { chargerTrajets, minutesEstimees } from "@/grounding/trajets";
import { distanceVolOiseauMetres } from "@/grounding/zone";

import { creerRoutesDouble, LAT_SENTINELLE, LNG_SENTINELLE, SENTINELLES_B8 } from "../../tests/support/doubles-grounding";

/**
 * Trajets et estimation sans itinéraire (B8a ; spécification B8, B8-PO-8 ; décision 0085 § 1.6). Durées sentinelles
 * (4 321 s, 2 222 s), jamais tirées d'une réponse réelle.
 */

const A = { placeId: "P_A", position: { lat: LAT_SENTINELLE, lng: LNG_SENTINELLE } };
const B = { placeId: "P_B", position: { lat: LAT_SENTINELLE + 0.01, lng: LNG_SENTINELLE } };
const C = { placeId: "P_C", position: { lat: LAT_SENTINELLE, lng: LNG_SENTINELLE + 0.02 } };

describe("relectures: durée estimée seulement sans itinéraire", () => {
  it("absence d'itinéraire pour tous les modes admis d'une paire : estimee, formule de B8-PO-8", async () => {
    const routes = creerRoutesDouble({ secondes: (de, vers) => ((de === "P_A" && vers === "P_B") || (de === "P_B" && vers === "P_A") ? null : 4321) });
    const resultat = await chargerTrajets([A, B, C], ["walk", "transit"], routes);
    if (!resultat.ok) throw new Error(resultat.code);
    const distance = distanceVolOiseauMetres(A.position, B.position);
    const marche = Math.ceil((((distance * 1.3) / 1000 / 4.5) * 60) / 5) * 5;
    expect(resultat.valeur.duree("P_A", "P_B", "walk")).toEqual({ minutes: marche, estimee: true });
    expect(resultat.valeur.duree("P_A", "P_B", "transit")).toEqual({ minutes: minutesEstimees(A.position, B.position, "transit"), estimee: true });
    expect(marche % 5).toBe(0);
    // Paire mesurée : minute supérieure, comme P0.
    expect(resultat.valeur.duree("P_A", "P_C", "walk")).toEqual({ minutes: Math.ceil(4321 / 60), estimee: false });
    // Mode non admis : inconnu ; même point : 0.
    expect(resultat.valeur.duree("P_A", "P_C", "car")).toBeUndefined();
    expect(resultat.valeur.duree("P_A", "P_A", "walk")).toEqual({ minutes: 0, estimee: false });
  });

  it("un mode mesuré pour la paire : aucune estimation pour les autres modes", async () => {
    const routes = creerRoutesDouble({ secondes: (_de, _vers, mode) => (mode === "transit" ? 2222 : null) });
    const resultat = await chargerTrajets([A, B], ["walk", "transit", "car"], routes);
    if (!resultat.ok) throw new Error(resultat.code);
    expect(resultat.valeur.duree("P_A", "P_B", "transit")).toEqual({ minutes: Math.ceil(2222 / 60), estimee: false });
    expect(resultat.valeur.duree("P_A", "P_B", "walk")).toBeUndefined();
    expect(resultat.valeur.duree("P_A", "P_B", "car")).toBeUndefined();
  });

  it.each([
    ["erreur", () => new Error(SENTINELLES_B8.corps), "upstream_error"],
    ["plafond", () => new ErreurClientGoogle("cap_reached"), "cap_reached"],
    ["quota", () => new ErreurClientGoogle("daily_quota_insufficient"), "daily_quota_insufficient"],
  ])("%s de Routes : code fermé, aucune durée", async (_cas, fabrique, code) => {
    const routes = creerRoutesDouble({ secondes: () => 4321, erreur: { auAppel: 2, fabrique } });
    expect(await chargerTrajets([A, B], ["walk", "transit"], routes)).toEqual({ ok: false, code, retryable: false });
  });

  it("matrice découpée par BLOC_MATRICE (réutilisé)", async () => {
    const points = Array.from({ length: BLOC_MATRICE + 2 }, (_, i) => ({ placeId: `P_${i}`, position: { lat: LAT_SENTINELLE + i / 1000, lng: LNG_SENTINELLE } }));
    const routes = creerRoutesDouble({ secondes: () => 4321 });
    const resultat = await chargerTrajets(points, ["walk"], routes);
    expect(resultat.ok).toBe(true);
    expect(routes.appels).toHaveLength(4);
    for (const appel of routes.appels) {
      expect(appel.origines.length).toBeLessThanOrEqual(BLOC_MATRICE);
      expect(appel.destinations.length).toBeLessThanOrEqual(BLOC_MATRICE);
    }
  });
});
