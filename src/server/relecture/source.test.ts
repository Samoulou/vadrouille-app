// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INCONNU, type DemandeRelectures, type VoyageARelire } from "@/domain/relectures";
import { erreurGoogleDe } from "@/grounding/enveloppe-google";
import { cleMaison, type ClientPlacesMvp, type ClientRoutes, type Coordonnees, type ModeRoutes } from "@/grounding/interfaces";
import { creerSourceRelectures, LOT_ECRITURE_POSITIONS, type DependancesSource, type FabriqueClients } from "@/server/relecture/source";
import * as journal from "@/server/log";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { avecReservation, demandeDe, horlogeSysteme } from "@/server/usage/port";
import type { ReglesUsage, TransactionOrganisation } from "@/server/usage/reservation";

import { creerPlacesDouble, creerRoutesDouble, LAT_SENTINELLE, LNG_SENTINELLE, type LieuDouble } from "../../../tests/support/doubles-grounding";
import { PLAFONDS_USAGE_TEST } from "../../../tests/support/plafonds-usage";
import { voyageARelire } from "../../../tests/support/voyage-a-relire";

/**
 * Source réelle de relectures (B8b ; décision 0100 § 3 à § 6), sur une base simulée et des clients Google simulés qui
 * **réservent par le registre en mémoire du forfait** (comme les vrais clients, `avecReservation`). Aucune donnée
 * Google réelle : positions et durées sont des sentinelles fabriquées ici.
 */

const TABLE = TablePrixGoogleSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "prototype/config/prix-google.json"), "utf8")));
const ORG = "00000000-0000-4000-8000-000000000001";
const LUNDI = "2027-05-03";

const ZERO = { org_jour_micros: 0, jour_text_search: 0, jour_place_details: 0, mois_google_micros: 0, enveloppe_google_micros: 0, mois_modeles_micros: 0, enveloppe_modeles_micros: 0 };

type Options = {
  sommes?: Record<string, number> | null;
  cache?: Record<string, Coordonnees>;
  ecritureEchoue?: boolean;
  lectureCacheEchoue?: boolean;
};

/** Base simulée : chronologie, transactions ouvertes, lignes insérées, positions lues et écrites. */
function base(options: Options = {}) {
  const chronologie: string[] = [];
  let ouvertes = 0;
  let maxOuvertes = 0;
  let appelsPendantTransaction = 0;
  const inserts: { unites: unknown; cout: unknown }[] = [];
  const ecritures: string[][] = [];
  const lectures: string[][] = [];
  const transaction = (): TransactionOrganisation => async (fn) => {
    ouvertes += 1;
    maxOuvertes = Math.max(maxOuvertes, ouvertes);
    chronologie.push("tx:ouverte");
    const executeur = {
      async query(texte: string, valeurs: readonly unknown[] = []) {
        if (texte.includes("app_current_org")) return { rows: [{ set_config: "2000", org: ORG }] };
        if (texte.includes("usage_forfait_totals")) {
          if (options.sommes === null) return { rows: [] };
          return { rows: [Object.fromEntries(Object.entries({ ...ZERO, ...options.sommes }).map(([k, v]) => [k, String(v)]))] };
        }
        if (texte.includes("INSERT INTO public.usage_ledger")) {
          chronologie.push("tx:reserve");
          inserts.push({ unites: valeurs[6], cout: valeurs[7] });
          return { rows: [] };
        }
        if (texte.includes("FROM public.place_coordinates")) {
          if (options.lectureCacheEchoue === true) throw Object.assign(new Error("base"), { code: "08006" });
          const ids = valeurs[0] as string[];
          lectures.push(ids);
          chronologie.push("tx:lecture-cache");
          return { rows: ids.filter((id) => options.cache?.[id] !== undefined).map((id) => ({ place_id: id, lat: options.cache?.[id]?.lat, lng: options.cache?.[id]?.lng })) };
        }
        // Écriture du cache : la seule requête à trois paramètres (identifiants, latitudes, longitudes) ; sa fonction n'est pas nommée ici (0060 § 1.4).
        if (valeurs.length === 3 && Array.isArray(valeurs[0])) {
          if (options.ecritureEchoue === true) throw new Error("base");
          ecritures.push(valeurs[0] as string[]);
          chronologie.push("tx:ecriture-cache");
          return { rows: [] };
        }
        return { rows: [] };
      },
    };
    try {
      const resultat = await fn(executeur);
      chronologie.push("tx:validee");
      return resultat;
    } catch (erreur) {
      chronologie.push("tx:annulee");
      throw erreur;
    } finally {
      ouvertes -= 1;
    }
  };
  return {
    transaction,
    chronologie,
    inserts,
    ecritures,
    lectures,
    ouvertes: () => ouvertes,
    maxOuvertes: () => maxOuvertes,
    appelEnTransaction: () => {
      if (ouvertes > 0) appelsPendantTransaction += 1;
    },
    appelsPendantTransaction: () => appelsPendantTransaction,
  };
}

const COUT = { places_text_search: 0, places_details: 20_000, routes_matrix: 5_000 } as const;
const SKU = { places_text_search: "places_text_search_essentials_ids_only", places_details: "places_details_enterprise", routes_matrix: "routes_matrix_essentials" } as const;

type Methode = keyof typeof COUT;

/** Clients simulés : chaque appel passe par la réservation du registre en mémoire, puis par le double. */
function fabrique(places: ClientPlacesMvp, routes: ClientRoutes, db: ReturnType<typeof base>, appels: string[]): FabriqueClients {
  return ({ usage, contexte, plafonds, horloge }) => {
    const appeler = async <T>(methode: Methode, elements: number, f: () => Promise<T>): Promise<T> => {
      const demande = demandeDe(
        contexte(),
        { fournisseur: "google", methode, sku: SKU[methode], unites: { requetes: 1, elements }, coutEstimeMicros: COUT[methode] * Math.max(elements, 1) },
        plafonds,
      );
      const issue = await avecReservation({ port: usage, horloge }, demande, 1_000, async (_signal, transporte) => {
        transporte();
        db.appelEnTransaction();
        appels.push(methode);
        db.chronologie.push(`google:${methode}`);
        return { valeur: await f(), coutReelMicros: null };
      });
      if (issue.ok) return issue.valeur;
      throw erreurGoogleDe(issue);
    };
    return {
      places: {
        textSearch: (r) => appeler("places_text_search", 0, () => places.textSearch(r)),
        details: (id) => appeler("places_details", 0, () => places.details(id)),
        position: (id) => appeler("places_details", 0, () => places.position(id)),
        identifiant: (id) => appeler("places_details", 0, () => places.identifiant(id)),
      },
      routes: { matrice: (r) => appeler("routes_matrix", r.origines.length * r.destinations.length, () => routes.matrice(r)) },
    };
  };
}

const lieu = (decalage: number, extra: Partial<LieuDouble> = {}): LieuDouble => ({
  position: { lat: LAT_SENTINELLE + decalage, lng: LNG_SENTINELLE + decalage },
  horaires: [{ jour: 1, debut: 540, fin: 1080 }],
  ...extra,
});

const LIEUX = { test_place_a: lieu(0.01), test_place_b: lieu(0.02), test_place_c: lieu(0.03), test_place_hotel: lieu(0.04, { horaires: null }), test_place_ville: lieu(0.05, { horaires: null }) };
const secondesParDefaut = (de: string, vers: string, mode: ModeRoutes) => (mode === "walk" ? 1_201 : mode === "transit" ? 601 : 301) + de.length + vers.length;

const demandeDeBase = (lieux = ["test_place_a", "test_place_b"]): DemandeRelectures => ({
  lieux: lieux.map((placeId) => ({ placeId, dates: [LUNDI] })),
  trajets: [{ depuis: { lieu: lieux[0] as string }, vers: { lieu: lieux[1] as string }, modes: ["walk", "transit"] }],
});

type Mise = {
  options?: Options;
  places?: ClientPlacesMvp;
  routes?: ClientRoutes;
  regles?: ReglesUsage | null;
  suspendues?: boolean;
  fabriqueQuiLeve?: boolean;
};

function monter(mise: Mise = {}) {
  const db = base(mise.options);
  const appels: string[] = [];
  const places = mise.places ?? creerPlacesDouble({ lieux: LIEUX, textes: { Edimbourg: ["test_place_ville"] } });
  const routes = mise.routes ?? creerRoutesDouble({ secondes: secondesParDefaut });
  const regles: ReglesUsage | null = mise.regles === undefined ? { plafonds: PLAFONDS_USAGE_TEST, table: TABLE, horloge: horlogeSysteme } : mise.regles;
  const fabriqueDesClients = fabrique(places, routes, db, appels);
  const dep: DependancesSource = {
    regles,
    transaction: () => db.transaction(),
    clients: mise.fabriqueQuiLeve === true ? () => { throw new Error("barrière fermée"); } : fabriqueDesClients,
    positionsSuspendues: () => mise.suspendues === true,
    horloge: horlogeSysteme,
  };
  return { db, appels, source: creerSourceRelectures(dep) };
}

const voyageDeBase = (portee: VoyageARelire["portee"] = "voyage"): VoyageARelire => voyageARelire(["test_place_hotel"], portee);

let evenements: { evenement: string; champs: unknown }[] = [];
beforeEach(() => {
  evenements = [];
  vi.spyOn(journal, "logEvent").mockImplementation(((evenement: string, champs: unknown) => {
    evenements.push({ evenement, champs });
  }) as typeof journal.logEvent);
});
afterEach(() => vi.restoreAllMocks());

describe("lecture: réservation validée avant le premier appel (0100 § 3.2)", () => {
  it("la transaction de réservation est validée avant le premier appel Google, l'écriture des positions après le dernier", async () => {
    const { source, db } = monter();
    const rendu = await source.pour(voyageDeBase(), demandeDeBase());
    expect(rendu.ok).toBe(true);
    const c = db.chronologie;
    const iReserve = c.indexOf("tx:reserve");
    const iPremier = c.findIndex((e) => e.startsWith("google:"));
    const iDernier = c.map((e) => e.startsWith("google:")).lastIndexOf(true);
    expect(iReserve).toBeGreaterThanOrEqual(0);
    expect(c[iReserve + 1]).toBe("tx:validee");
    expect(iReserve + 1).toBeLessThan(iPremier);
    expect(c.indexOf("tx:ecriture-cache")).toBeGreaterThan(iDernier);
  });

  it("aucune transaction n'est ouverte pendant un appel Google, une seule connexion à la fois", async () => {
    const { source, db } = monter();
    await source.pour(voyageDeBase(), demandeDeBase(["test_place_a", "test_place_b", "test_place_c"]));
    expect(db.appelsPendantTransaction()).toBe(0);
    expect(db.maxOuvertes()).toBe(1);
    expect(db.ouvertes()).toBe(0);
  });

  it.each([
    ["cap_reached", { org_jour_micros: 5_000_000 }, "quota_reached"],
    ["daily_quota_insufficient", { jour_place_details: 1_000 }, "quota_reached"],
    ["envelope_reached", { enveloppe_google_micros: 100_000_000 }, "quota_reached"],
  ])("réservation refusée (%s) : %s, aucun appel Google", async (_code, sommes, refus) => {
    const { source, appels } = monter({ options: { sommes } });
    expect(await source.pour(voyageDeBase(), demandeDeBase())).toEqual({ ok: false, refus });
    expect(appels).toEqual([]);
  });

  it("sommes illisibles, plafonds nuls, barrière fermée ou exception : unavailable, rien n'est appelé", async () => {
    const illisibles = monter({ options: { sommes: null } });
    expect(await illisibles.source.pour(voyageDeBase(), demandeDeBase())).toEqual({ ok: false, refus: "unavailable" });
    const nuls = monter({ regles: null });
    expect(await nuls.source.pour(voyageDeBase(), demandeDeBase())).toEqual({ ok: false, refus: "unavailable" });
    const fermee = monter({ fabriqueQuiLeve: true });
    expect(await fermee.source.pour(voyageDeBase(), demandeDeBase())).toEqual({ ok: false, refus: "unavailable" });
    expect(fermee.db.inserts).toEqual([]);
    for (const m of [illisibles, nuls, fermee]) expect(m.appels).toEqual([]);
  });

  it("deux lectures sont comptées chacune (une ligne de réservation par lecture)", async () => {
    const { source, db } = monter();
    await source.pour(voyageDeBase(), demandeDeBase());
    await source.pour(voyageDeBase(), demandeDeBase());
    expect(db.inserts).toHaveLength(2);
  });
});

describe("usage: la portée choisit le profil (0100 § 1.3 et § 1.4)", () => {
  it("jour : forfait relecture ; voyage : forfait relectureVoyage", async () => {
    const jour = monter();
    await jour.source.pour(voyageDeBase("jour"), demandeDeBase());
    const voyage = monter();
    await voyage.source.pour(voyageDeBase("voyage"), demandeDeBase());
    const unitesJour = jour.db.inserts[0]?.unites as number[];
    const unitesVoyage = voyage.db.inserts[0]?.unites as number[];
    expect(unitesJour).toContain(PLAFONDS_USAGE_TEST.relecture.jour.placesDetails);
    expect(unitesVoyage).toContain(PLAFONDS_USAGE_TEST.relecture.voyage.placesDetails);
    expect(unitesJour).not.toEqual(unitesVoyage);
  });

  it("un jour de plus de fiches que le forfait du jour : plafond atteint, quota_reached sans fiche en trop", async () => {
    const lieux = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`test_place_${i}`, lieu(i / 1000)]));
    const ids = Object.keys(lieux);
    const { source, appels } = monter({ places: creerPlacesDouble({ lieux }) });
    const rendu = await source.pour(voyageARelire([null], "jour"), { lieux: ids.map((placeId) => ({ placeId, dates: [LUNDI] })), trajets: [] });
    // Les fiches ne sont jamais un refus (B8-PO-9) : relectures sans fiches, aucun appel au-delà du plafond.
    expect(rendu.ok).toBe(true);
    expect(appels.filter((a) => a === "places_details")).toHaveLength(PLAFONDS_USAGE_TEST.relecture.jour.placesDetails);
  });
});

describe("lecture: trajets par couples (0100 § 1.5)", () => {
  it("un élément par couple et par mode, jamais une matrice complète", async () => {
    const routes = creerRoutesDouble({ secondes: secondesParDefaut });
    const { source } = monter({ routes });
    const demande: DemandeRelectures = {
      lieux: ["test_place_a", "test_place_b", "test_place_c"].map((placeId) => ({ placeId, dates: [LUNDI] })),
      trajets: [
        { depuis: { lieu: "test_place_a" }, vers: { lieu: "test_place_b" }, modes: ["walk", "transit"] },
        { depuis: { lieu: "test_place_b" }, vers: { lieu: "test_place_c" }, modes: ["car"] },
      ],
    };
    const rendu = await source.pour(voyageDeBase(), demande);
    expect(rendu.ok).toBe(true);
    expect(routes.appels).toHaveLength(3);
    for (const requete of routes.appels) expect(requete.origines.length * requete.destinations.length).toBe(1);
  });

  it("une durée mesurée n'est pas estimée ; sans itinéraire pour tous les modes, estimée à partir des fiches", async () => {
    const mesure = monter();
    const a = await mesure.source.pour(voyageDeBase(), demandeDeBase());
    if (!a.ok) throw new Error("attendu : ok");
    const depuis = { lieu: "test_place_a" };
    const vers = { lieu: "test_place_b" };
    expect(a.relectures.duree(depuis, vers, "walk")).toMatchObject({ estimee: false });
    const sansItineraire = monter({ routes: creerRoutesDouble({ secondes: () => null }) });
    const b = await sansItineraire.source.pour(voyageDeBase(), demandeDeBase());
    if (!b.ok) throw new Error("attendu : ok");
    const duree = b.relectures.duree(depuis, vers, "walk");
    expect(duree).not.toBe(INCONNU);
    expect(duree).toMatchObject({ estimee: true });
  });

  it("une erreur de Routes est un refus, même si les fiches ont réussi", async () => {
    const routes = creerRoutesDouble({ secondes: secondesParDefaut, erreur: { auAppel: 1, fabrique: () => new Error("boom") } });
    const { source } = monter({ routes });
    expect(await source.pour(voyageDeBase(), demandeDeBase())).toEqual({ ok: false, refus: "unavailable" });
  });
});

describe("lecture: fiche en échec, trajets mesurés (B8-PO-9, 0100 § 4.1)", () => {
  it.each([
    ["une erreur de Google", { places: creerPlacesDouble({ lieux: LIEUX, erreur: { auAppel: 2, fabrique: () => new Error("boom") } }) }, "unavailable"],
    ["un plafond atteint avant l'appel", { regles: { plafonds: { ...PLAFONDS_USAGE_TEST, relecture: { ...PLAFONDS_USAGE_TEST.relecture, voyage: { ...PLAFONDS_USAGE_TEST.relecture.voyage, placesDetails: 0 } } }, table: TABLE, horloge: horlogeSysteme } }, "cap_reached"],
  ] as const)("%s : relectures sans fiches, trajets mesurés, un seul journal", async (_nom, mise, raison) => {
    const { source, appels } = monter({ ...mise, places: "places" in mise ? mise.places : undefined });
    const rendu = await source.pour(voyageDeBase(), demandeDeBase());
    if (!rendu.ok) throw new Error("attendu : ok");
    expect(rendu.relectures.validite("test_place_a")).toBe(INCONNU);
    expect(rendu.relectures.plages("test_place_a", LUNDI)).toBe(INCONNU);
    expect(rendu.relectures.duree({ lieu: "test_place_a" }, { lieu: "test_place_b" }, "walk")).toMatchObject({ estimee: false });
    const fiches = evenements.filter((e) => e.evenement === "voyages.fiches_non_relues");
    expect(fiches).toHaveLength(1);
    expect(fiches[0]?.champs).toMatchObject({ reason: raison });
    expect(appels).toContain("routes_matrix");
  });
});

describe("lecture: logement sans lieu (0100 § 6.2)", () => {
  const sejour = (extra: Partial<VoyageARelire["sejoursParNuit"][number]>): VoyageARelire => ({
    ...voyageARelire([null]),
    sejoursParNuit: [{ placeId: null, ville: null, centre: null, type: "none", logement: "none", ...extra }],
  });
  const demandeLogement: DemandeRelectures = { lieux: [{ placeId: "test_place_a", dates: [LUNDI] }], trajets: [{ depuis: { logement: 0 }, vers: { lieu: "test_place_a" }, modes: ["walk"] }] };

  it("suggestedArea avec centre : clé maison, aucun appel pour le logement, un seul élément Routes", async () => {
    const routes = creerRoutesDouble({ secondes: secondesParDefaut });
    const { source, appels } = monter({ routes });
    const centre = { lat: 55.95, lng: -3.19 };
    const rendu = await source.pour(sejour({ type: "neighbourhood", logement: "suggestedArea", centre }), demandeLogement);
    if (!rendu.ok) throw new Error("attendu : ok");
    expect(appels.filter((a) => a === "places_text_search")).toHaveLength(0);
    expect(appels.filter((a) => a === "places_details")).toHaveLength(1);
    expect(routes.appels).toHaveLength(1);
    expect(routes.appels[0]?.origines[0]).toEqual({ centreMaison: centre });
    expect(cleMaison(centre)).toMatch(/^maison:/);
    expect(rendu.relectures.duree({ logement: 0 }, { lieu: "test_place_a" }, "walk")).not.toBe(INCONNU);
  });

  it.each([
    ["known", "lodging"],
    ["suggestedLodging", "lodging"],
  ] as const)("%s sans lieu : aucun appel pour le logement, trajet inconnu", async (logement, type) => {
    const routes = creerRoutesDouble({ secondes: secondesParDefaut });
    const { source, appels } = monter({ routes });
    const rendu = await source.pour(sejour({ type, logement, ville: "Edimbourg" }), demandeLogement);
    if (!rendu.ok) throw new Error("attendu : ok");
    expect(appels.filter((a) => a === "places_text_search")).toHaveLength(0);
    expect(routes.appels).toHaveLength(0);
    expect(rendu.relectures.duree({ logement: 0 }, { lieu: "test_place_a" }, "walk")).toBe(INCONNU);
  });

  it("ville seule : Text Search puis position, une fois par ville et par lecture", async () => {
    const { source, appels } = monter();
    const deuxNuits: VoyageARelire = {
      ...voyageARelire([null, null]),
      sejoursParNuit: [
        { placeId: null, ville: "Edimbourg", centre: null, type: "neighbourhood", logement: "area" },
        { placeId: null, ville: "Edimbourg", centre: null, type: "neighbourhood", logement: "area" },
      ],
    };
    const rendu = await source.pour(deuxNuits, {
      lieux: [{ placeId: "test_place_a", dates: [LUNDI] }],
      trajets: [
        { depuis: { logement: 0 }, vers: { lieu: "test_place_a" }, modes: ["walk"] },
        { depuis: { logement: 1 }, vers: { lieu: "test_place_a" }, modes: ["walk"] },
      ],
    });
    if (!rendu.ok) throw new Error("attendu : ok");
    expect(appels.filter((a) => a === "places_text_search")).toHaveLength(1);
    expect(rendu.relectures.duree({ logement: 1 }, { lieu: "test_place_a" }, "walk")).not.toBe(INCONNU);
  });

  it("ville introuvable : trajet inconnu, ni refus ni exception", async () => {
    const { source } = monter({ places: creerPlacesDouble({ lieux: LIEUX, textes: {} }) });
    const rendu = await source.pour(sejour({ type: "neighbourhood", logement: "area", ville: "Nulle-Part" }), demandeLogement);
    if (!rendu.ok) throw new Error("attendu : ok");
    expect(rendu.relectures.duree({ logement: 0 }, { lieu: "test_place_a" }, "walk")).toBe(INCONNU);
  });
});

describe("carte: positions du cache alimenté par la lecture (0100 § 3.2 point 4)", () => {
  it("écrit les positions fraîches absentes du cache, jamais celles que `lire` rend", async () => {
    const { source, db } = monter({ options: { cache: { test_place_a: { lat: 1, lng: 2 } } } });
    await source.pour(voyageDeBase(), demandeDeBase());
    expect(db.ecritures).toHaveLength(1);
    expect(db.ecritures[0]).toEqual(["test_place_b", "test_place_hotel"]);
  });

  it("n'écrit pas le centre d'une ville, écrit la position d'un logement pourvu d'un lieu", async () => {
    const { source, db } = monter();
    const voyage: VoyageARelire = {
      ...voyageARelire([null, "test_place_hotel"]),
      sejoursParNuit: [
        { placeId: null, ville: "Edimbourg", centre: null, type: "neighbourhood", logement: "area" },
        { placeId: "test_place_hotel", ville: null, centre: null, type: "lodging", logement: "known" },
      ],
    };
    await source.pour(voyage, {
      lieux: [{ placeId: "test_place_a", dates: [LUNDI] }],
      trajets: [
        { depuis: { logement: 0 }, vers: { lieu: "test_place_a" }, modes: ["walk"] },
        { depuis: { logement: 1 }, vers: { lieu: "test_place_a" }, modes: ["walk"] },
      ],
    });
    const ecrits = db.ecritures.flat();
    expect(ecrits).toContain("test_place_a");
    expect(ecrits).toContain("test_place_hotel");
    expect(ecrits).not.toContain("test_place_ville");
  });

  it("interrupteur POSITIONS_ECRITURE_SUSPENDUE : aucune écriture, ni lecture du cache", async () => {
    const { source, db } = monter({ suspendues: true });
    const rendu = await source.pour(voyageDeBase(), demandeDeBase());
    expect(rendu.ok).toBe(true);
    expect(db.ecritures).toEqual([]);
    expect(db.lectures).toEqual([]);
  });

  it("écriture qui échoue (base) : transaction annulée, lecture servie, aucune relance", async () => {
    const { source, db } = monter({ options: { ecritureEchoue: true } });
    const rendu = await source.pour(voyageDeBase(), demandeDeBase());
    expect(rendu.ok).toBe(true);
    expect(db.chronologie.filter((e) => e === "tx:annulee")).toHaveLength(1);
    expect(db.ecritures).toEqual([]);
  });

  it("lecture du cache qui échoue : écriture abandonnée, lecture servie", async () => {
    const { source, db } = monter({ options: { lectureCacheEchoue: true } });
    const rendu = await source.pour(voyageDeBase(), demandeDeBase());
    expect(rendu.ok).toBe(true);
    expect(db.ecritures).toEqual([]);
  });

  it("positions périmées (plus d'une heure) : écriture abandonnée", async () => {
    const maintenant = Date.now();
    const vieille = { maintenant: () => maintenant - 2 * 60 * 60 * 1000, minuterie: horlogeSysteme.minuterie };
    const db = base();
    const dep: DependancesSource = {
      regles: { plafonds: PLAFONDS_USAGE_TEST, table: TABLE, horloge: horlogeSysteme },
      transaction: () => db.transaction(),
      clients: fabrique(creerPlacesDouble({ lieux: LIEUX }), creerRoutesDouble({ secondes: secondesParDefaut }), db, []),
      positionsSuspendues: () => false,
      horloge: vieille,
    };
    const rendu = await creerSourceRelectures(dep).pour(voyageDeBase(), demandeDeBase());
    expect(rendu.ok).toBe(true);
    expect(db.ecritures).toEqual([]);
    expect(db.chronologie).toContain("tx:annulee");
  });

  it("par lots de 500 au plus", () => {
    expect(LOT_ECRITURE_POSITIONS).toBe(500);
  });
});

describe("trajets: un quartier conseillé part de son centre (0087 § 3.2)", () => {
  it("la requête Routes porte le centre en coordonnées, la table est lue par la clé maison", async () => {
    const routes = creerRoutesDouble({ secondes: secondesParDefaut });
    const { source } = monter({ routes });
    const centre = { lat: LAT_SENTINELLE + 0.1, lng: LNG_SENTINELLE + 0.1 };
    const voyage: VoyageARelire = { ...voyageARelire([null]), sejoursParNuit: [{ placeId: null, ville: null, centre, type: "neighbourhood", logement: "suggestedArea" }] };
    const rendu = await source.pour(voyage, { lieux: [{ placeId: "test_place_a", dates: [LUNDI] }], trajets: [{ depuis: { logement: 0 }, vers: { lieu: "test_place_a" }, modes: ["walk"] }] });
    if (!rendu.ok) throw new Error("attendu : ok");
    expect(routes.appels[0]?.origines).toEqual([{ centreMaison: centre }]);
    expect(rendu.relectures.duree({ logement: 0 }, { lieu: "test_place_a" }, "walk")).toMatchObject({ estimee: false });
  });
});

describe("lecture: aucune donnée Google ne sort", () => {
  it("le journal ne porte que la raison fermée et le voyage", async () => {
    const { source } = monter({ places: creerPlacesDouble({ lieux: LIEUX, erreur: { auAppel: 1, fabrique: () => new Error("SENTINELLE-CORPS") } }) });
    await source.pour(voyageDeBase(), demandeDeBase());
    expect(JSON.stringify(evenements)).not.toContain("SENTINELLE");
    expect(JSON.stringify(evenements)).not.toContain(String(LAT_SENTINELLE));
  });

  it("une exception interne est lue comme unavailable", async () => {
    const dep: DependancesSource = {
      regles: { plafonds: PLAFONDS_USAGE_TEST, table: TABLE, horloge: horlogeSysteme },
      transaction: () => () => Promise.reject(new Error("SENTINELLE")),
      clients: () => {
        throw new Error("ne doit pas compter");
      },
      positionsSuspendues: () => false,
      horloge: horlogeSysteme,
    };
    expect(await creerSourceRelectures(dep).pour(voyageDeBase(), demandeDeBase())).toEqual({ ok: false, refus: "unavailable" });
  });
});
