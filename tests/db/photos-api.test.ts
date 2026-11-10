import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { photoLieuApi } from "@/adapters";
import { createApiTripAdapter } from "@/adapters/api";
import { brancherPhotosApi, debrancherPhotosApiPourTests } from "@/adapters/api-photos-instance";
import type { AdapterContext, TripAdapter } from "@/adapters/types";
import type { PlacePhoto } from "@/contracts/photo";
import { EDIMBOURG_TRIP_ID } from "@/mocks/edimbourg";
import { creerRelecturesVoyages } from "@/mocks/relectures-voyages";
import { creerPhotosApi } from "@/server/photos/api";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { ecrireVoyagesSimules } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, type DbClient, type Org } from "./helpers";

/**
 * Photos du tri sur `api`, appartenance sur la base réelle (PR 882, décision 0143 § 2) : le lieu est lu par l'adaptateur
 * `api` sous la RLS de l'organisation de la session. La session de l'organisation A qui demande la carte d'un voyage de
 * l'organisation B reçoit `null`, sans limiteur ni client. Barrière ouverte et client **injectés** (doubles) : aucun
 * appel Google, aucune clé ; `placeId` du jeu simulé seulement.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let a: Org;
let b: Org;
let voyageA: string;
let voyageB: string;
let adaptateur: TripAdapter;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });
const PHOTO: PlacePhoto = { url: "https://lh3.googleusercontent.com/p/test", authors: [{ name: "Ana" }] };

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await createOrg(auth);
  b = await createOrg(auth);
  voyageA = (await ecrireVoyagesSimules(app, a)).get(EDIMBOURG_TRIP_ID) as string;
  voyageB = (await ecrireVoyagesSimules(app, b)).get(EDIMBOURG_TRIP_ID) as string;
  adaptateur = createApiTripAdapter({ relectures: creerRelecturesVoyages(), withOrg });
});

afterEach(() => {
  debrancherPhotosApiPourTests();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.$client.end();
  await closeAll();
});

/** Photos branchées avec une barrière ouverte et un client injectés ; espions du limiteur et du client. */
function brancher() {
  const limiteur = vi.fn(async () => true);
  const photo = vi.fn<(placeId: string) => Promise<PlacePhoto>>(async () => PHOTO);
  const client = vi.fn(async () => ({ photo }));
  const photos = creerPhotosApi({ barriere: async () => "reelle", limiteur, client });
  brancherPhotosApi({ photo: (lieu) => photos.photo(lieu), ouvertes: async () => true });
  return { limiteur, photo, client };
}

/** Première carte du tri (aperçu) d'un voyage, lue dans son organisation, avec son lieu. */
async function premiereCarte(org: Org, tripId: string): Promise<{ id: string; placeId: string }> {
  const cartes = (await adaptateur.listPreviewSlots(contexte(org), tripId)).flatMap((slot) => (slot.type === "proposal" && slot.proposal.stop.placeId !== undefined ? [slot.proposal] : []));
  const carte = cartes[0];
  expect(carte, "le jeu simulé d'Édimbourg a une carte avec un lieu").toBeDefined();
  return { id: carte!.id, placeId: carte!.stop.placeId! };
}

describe("photos du tri sur api : appartenance en base (PR 882)", () => {
  it("organisation A : la carte de son voyage donne la photo ; limiteur puis client, lieu lu en base", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    const espions = brancher();
    const carte = await premiereCarte(a, voyageA);
    expect(await photoLieuApi(contexte(a), { tripId: voyageA, proposalId: carte.id }, () => adaptateur)).toEqual(PHOTO);
    expect(espions.limiteur).toHaveBeenCalledTimes(1);
    expect(espions.client).toHaveBeenCalledTimes(1);
    expect(espions.photo).toHaveBeenCalledWith(carte.placeId);
  });

  it("organisation A demande la carte d'un voyage de l'organisation B : null, sans limiteur ni client", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    const espions = brancher();
    const carteB = await premiereCarte(b, voyageB);
    expect(await photoLieuApi(contexte(a), { tripId: voyageB, proposalId: carteB.id }, () => adaptateur)).toBeNull();
    // Même identifiant de proposition sur le voyage de A, mais un autre voyage demandé : la carte n'est pas servie par B.
    expect(await photoLieuApi(contexte(b), { tripId: voyageA, proposalId: carteB.id }, () => adaptateur)).toBeNull();
    expect(espions.limiteur).not.toHaveBeenCalled();
    expect(espions.client).not.toHaveBeenCalled();
    expect(espions.photo).not.toHaveBeenCalled();
  });
});
