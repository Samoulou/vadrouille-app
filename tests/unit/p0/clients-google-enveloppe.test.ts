// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import type { ClientPlacesMvp, ClientRoutes } from "@/grounding/interfaces";
import { createPlacesClient } from "@/grounding/places-client";
import { createRoutesClient } from "@/grounding/routes-client";
import { envelopperClientsGoogle } from "@/server/composition/clients-google";
import type { Plafond } from "@/server/usage/port";

import { creerHorlogeManuelle } from "../../support/horloge-manuelle";
import { creerPortMemoire } from "../../support/port-consommation-memoire";

/**
 * `composition: l'enveloppe des doubles réserve comme les clients réels` (revue de la PR #563, bloquant 3) : les doubles de la
 * variante simulée de la génération passent par `envelopperClientsGoogle`, qui importe SKU, méthodes et coûts des clients
 * réels. Ce test impose l'égalité : pour chaque méthode, les lignes réservées par les clients **réels** (transport de test,
 * clé sentinelle) et par l'enveloppe d'un double sont identiques. Aucun appel réel : le transport est un double.
 */

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const CLE = "SENTINELLE-CLE-GOOGLE-ENVELOPPE";
const PLACE_ID = "SENTINELLE_PLACE_ID_42";
const TOUJOURS = { du: 0, au: Number.MAX_SAFE_INTEGER };
const CONTEXTE = () => ({ nature: "execution" as const, executionId: "exec-1", periodes: { jour: TOUJOURS, mois: TOUJOURS } });
const json = (valeur: unknown) => new Response(JSON.stringify(valeur), { status: 200, headers: { "content-type": "application/json" } });

/** Transport de test : répond à chaque chemin par une réponse valide pour le client concerné. */
const transport = vi.fn(async (url: string, init: RequestInit) => {
  const chemin = new URL(url).pathname;
  if (chemin === "/v1/places:searchText") return json({ places: [{ id: PLACE_ID }] });
  if (chemin.startsWith("/v1/places/")) {
    const masque = new Headers(init.headers).get("x-goog-fieldmask") ?? "";
    if (masque === "id") return json({ id: PLACE_ID });
    if (masque === "id,location") return json({ id: PLACE_ID, location: { latitude: 55.95, longitude: -3.19 } });
    return json({ id: PLACE_ID, businessStatus: "OPERATIONAL", location: { latitude: 55.95, longitude: -3.19 } });
  }
  return json([
    { originIndex: 0, destinationIndex: 0, duration: "60s", condition: "ROUTE_EXISTS" },
    { originIndex: 0, destinationIndex: 1, duration: "90s", condition: "ROUTE_EXISTS" },
  ]);
});

/** Doubles qui répondent comme le transport, sans réseau. */
const placesDouble: ClientPlacesMvp = {
  textSearch: async () => ({ placeIds: [PLACE_ID] }),
  details: async (placeId) => ({ placeId, position: { lat: 55.95, lng: -3.19 }, horaires: null, nom: "n", adresse: "a", note: 1, niveauPrix: "p" }),
  position: async (placeId) => ({ placeId, position: { lat: 55.95, lng: -3.19 } }),
  identifiant: async (placeId) => ({ placeId }),
};
const routesDouble: ClientRoutes = { matrice: async () => ({ secondes: [[60, 90]] }) };

async function utiliser(clients: { places: ClientPlacesMvp; routes: ClientRoutes }): Promise<void> {
  await clients.places.textSearch({ texte: "musée", biais: null });
  await clients.places.details(PLACE_ID);
  await clients.places.position(PLACE_ID);
  await clients.places.identifiant(PLACE_ID);
  await clients.routes.matrice({ origines: ["A"], destinations: ["B", "C"], mode: "walk" });
}

const lignesDe = (port: ReturnType<typeof creerPortMemoire>) =>
  port.lignes.map((l) => ({ fournisseur: l.demande.fournisseur, methode: l.demande.methode, sku: l.demande.sku, unites: l.demande.unites, cout: l.demande.coutEstimeMicros }));

describe("composition: l'enveloppe des doubles réserve comme les clients réels", () => {
  it("mêmes méthodes, SKU, unités et coûts estimés, pour chaque méthode de Places et pour Routes", async () => {
    const horlogeReelle = creerHorlogeManuelle();
    const portReel = creerPortMemoire(horlogeReelle);
    const options = { usage: portReel, contexte: CONTEXTE, plafonds: [], horloge: horlogeReelle };
    const environnement = { VERCEL_ENV: "preview", GOOGLE_MAPS_SERVER_KEY: CLE };
    await utiliser({ places: createPlacesClient({ ...options, environnement }, transport), routes: createRoutesClient({ ...options, environnement }, transport) });

    const horlogeDouble = creerHorlogeManuelle();
    const portDouble = creerPortMemoire(horlogeDouble);
    await utiliser(envelopperClientsGoogle({ places: placesDouble, routes: routesDouble }, { usage: portDouble, contexte: CONTEXTE, plafonds: [], horloge: horlogeDouble }));

    expect(lignesDe(portReel)).toHaveLength(5);
    expect(lignesDe(portDouble)).toEqual(lignesDe(portReel));
  });

  it("un refus du port lève l'erreur fermée du client réel, sans appeler le double", async () => {
    const horloge = creerHorlogeManuelle();
    const port = creerPortMemoire(horloge);
    const appels: string[] = [];
    const places: ClientPlacesMvp = { ...placesDouble, details: async (placeId) => (appels.push(placeId), placesDouble.details(placeId)) };
    const plafond: Plafond = { fournisseur: "google", methode: "places_details", portee: "execution", maxRequetes: 0 };
    const clients = envelopperClientsGoogle({ places, routes: routesDouble }, { usage: port, contexte: CONTEXTE, plafonds: [plafond], horloge });
    const erreur = await clients.places.details(PLACE_ID).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(ErreurClientGoogle);
    expect(appels).toHaveLength(0);
  });
});
