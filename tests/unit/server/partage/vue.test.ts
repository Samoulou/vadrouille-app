// @vitest-environment node
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { projectSharedTrip } from "@/adapters/share-projection";
import { SharedTripViewSchema } from "@/contracts/share";
import type { HeadersLike } from "@/server/ip";
import { apiShareAvailable } from "@/adapters/share-guard";
import { type DependancesLimiteVue, EN_TETE_COMPTE, requeteComptee, valeurCompte } from "@/server/partage/limite-vue";
import { creerLectureVue, projeterVuePartagee, SQL_TRANSACTION_VUE, type ExecuteurVue, type TransactionVue } from "@/server/partage/vue";
import { edimbourgDebloque } from "@/mocks/edimbourg";

/**
 * Lecture de la vue partagée sur `api` (ticket 1013, M6a ; décision 0158 § 3 et § 4.2 ; décision 0157 § 1.4 et § 2.1
 * point 5), sur un client simulé : **la même suite de requêtes**, dans le même ordre et avec les mêmes paramètres, pour
 * un jeton inconnu, un lien désactivé, un lien expiré, un voyage reverrouillé (vues vides) et un lien valide ; la
 * décision n'est prise qu'après la dernière lecture. La requête non « comptée » ne lit rien. La projection ne recopie que
 * les champs de `SharedTripSchema`. Le comportement des vues en base est éprouvé par `tests/db/partage-api.test.ts`.
 */

const JETON = "B".repeat(43);
const CHEMIN = `/p/${JETON}`;

const VOYAGE = {
  destination: edimbourgDebloque.destination,
  start: edimbourgDebloque.start,
  end: edimbourgDebloque.end,
  adults: edimbourgDebloque.travellers.adults,
  children: edimbourgDebloque.travellers.children,
  time_zone: edimbourgDebloque.timeZone,
};
/** Instantané tel que la version le garde, avec des champs que la vue ne doit jamais recopier. */
const VERSION = { version: 3, snapshot: { days: edimbourgDebloque.days, budget: { total: 1200 }, surprise: true } };

type Scenario = { etat: string | null; voyages: Record<string, unknown>[]; versions: Record<string, unknown>[] };

const SCENARIOS: Record<string, Scenario> = {
  "jeton inconnu": { etat: null, voyages: [], versions: [] },
  "lien désactivé": { etat: "revoked", voyages: [], versions: [] },
  "lien expiré": { etat: "expired", voyages: [], versions: [] },
  "voyage reverrouillé (0158 § 2 : vues vides sans droit tripUnlocked)": { etat: "valid", voyages: [], versions: [] },
  "lien valide": { etat: "valid", voyages: [VOYAGE], versions: [VERSION] },
};

function client(scenario: Scenario) {
  const requetes: { texte: string; valeurs: readonly unknown[] }[] = [];
  const executeur: ExecuteurVue = {
    async query(texte, valeurs = []) {
      requetes.push({ texte, valeurs });
      if (texte === SQL_TRANSACTION_VUE[1]) return { rows: scenario.etat === null ? [] : [{ state: scenario.etat }] };
      if (texte === SQL_TRANSACTION_VUE[3]) return { rows: scenario.voyages };
      if (texte === SQL_TRANSACTION_VUE[4]) return { rows: scenario.versions };
      return { rows: [] };
    },
  };
  const appels = vi.fn();
  const transaction: TransactionVue = (fn) => {
    appels();
    return fn(executeur);
  };
  return { transaction, appels, requetes };
}

const entetes: HeadersLike = { get: () => null };

/** Environnement validé, par le type des dépendances (le module d'environnement ne s'importe pas ici). */
type ServerEnv = ReturnType<NonNullable<DependancesLimiteVue["env"]>>;
const SECRET = Buffer.alloc(32, 9);
const STAGING = { environment: "staging", trustedIpHeader: "x-vercel-forwarded-for", rateLimitHmacSecret: SECRET } as unknown as ServerEnv;
const MAINTENANT = Date.parse("2026-11-01T10:00:30Z");
const avecEnTetes = (valeurs: Record<string, string>): HeadersLike => {
  const h = new Headers(valeurs);
  return { get: (nom: string) => h.get(nom) };
};

describe("vue partagée : un seul chemin de lecture (0158 § 3 et § 4.2)", () => {
  it.each(Object.keys(SCENARIOS))("%s : même suite de requêtes, mêmes paramètres", async (nom) => {
    const scenario = SCENARIOS[nom] as Scenario;
    const { transaction, appels, requetes } = client(scenario);
    const lecture = creerLectureVue({ transaction, entetes: async () => entetes, comptee: () => true });
    const vue = await lecture.lire(JETON, CHEMIN);
    expect(appels).toHaveBeenCalledTimes(1);
    expect(requetes.map((r) => r.texte)).toEqual([...SQL_TRANSACTION_VUE]);
    const empreinte = createHash("sha256").update(JETON, "utf8").digest();
    expect(requetes.map((r) => r.valeurs)).toEqual([[], [empreinte], [], [], []]);
    expect(JSON.stringify(requetes)).not.toContain(JETON);
    if (nom === "lien valide") expect(vue).not.toBeNull();
    else expect(vue).toBeNull();
  });

  it("état valid mais une seule des deux vues rend une ligne : null (404 commun), après la même suite", async () => {
    for (const scenario of [
      { etat: "valid", voyages: [VOYAGE], versions: [] },
      { etat: "valid", voyages: [], versions: [VERSION] },
      { etat: "revoked", voyages: [VOYAGE], versions: [VERSION] },
    ]) {
      const { transaction, requetes } = client(scenario);
      expect(await creerLectureVue({ transaction, entetes: async () => entetes, comptee: () => true }).lire(JETON, CHEMIN)).toBeNull();
      expect(requetes).toHaveLength(SQL_TRANSACTION_VUE.length);
    }
  });

  it("aucune requête ne lit une table, entitlements ou shared_checklist", () => {
    const sql = SQL_TRANSACTION_VUE.join("\n");
    expect(sql).not.toMatch(/\bentitlements\b|\bshared_checklist\b|public\.(trips|trip_versions|share_links|place_coordinates)\b/);
    expect(SQL_TRANSACTION_VUE[2]).toBe("SET LOCAL ROLE vadrouille_share");
  });

  it("sans en-tête compté, hors local/ci, garde ouverte : 404 sans lecture (revue du ticket 1013, Sécurité point 9)", async () => {
    // Garde ouverte hors de local et ci : préversion déclarée, en-tête de confiance posé, ouverture de M1h simulée.
    const preview = { DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth", VERCEL_ENV: "preview", TRUSTED_IP_HEADER: "x-vercel-forwarded-for" } as unknown as NodeJS.ProcessEnv;
    expect(apiShareAvailable(preview, true)).toBe(true);
    // Vérification réelle (`requeteComptee`), environnement `staging` : seule la requête passée par le proxy est lue.
    const comptee = (h: HeadersLike, chemin: string) => requeteComptee(h, chemin, { env: () => STAGING, maintenant: () => MAINTENANT });
    const autreChemin = valeurCompte(SECRET, `${CHEMIN}/jour/1`, MAINTENANT);
    const autreSecret = valeurCompte(Buffer.alloc(32, 1), CHEMIN, MAINTENANT);
    const essais: Record<string, string>[] = [{}, { [EN_TETE_COMPTE]: "" }, { [EN_TETE_COMPTE]: "v1.0.forge" }, { [EN_TETE_COMPTE]: autreChemin }, { [EN_TETE_COMPTE]: autreSecret }, { "x-middleware-subrequest": "src/proxy" }];
    for (const valeurs of essais) {
      const { transaction, appels, requetes } = client(SCENARIOS["lien valide"] as Scenario);
      const h = avecEnTetes(valeurs);
      expect(await creerLectureVue({ transaction, entetes: async () => h, comptee }).lire(JETON, CHEMIN), JSON.stringify(valeurs)).toBeNull();
      expect(appels, JSON.stringify(valeurs)).not.toHaveBeenCalled();
      expect(requetes).toEqual([]);
    }
    // Témoin : avec l'en-tête posé par le proxy pour ce chemin, la vue est lue.
    const { transaction, appels } = client(SCENARIOS["lien valide"] as Scenario);
    const h = avecEnTetes({ [EN_TETE_COMPTE]: valeurCompte(SECRET, CHEMIN, MAINTENANT) });
    expect(await creerLectureVue({ transaction, entetes: async () => h, comptee }).lire(JETON, CHEMIN)).not.toBeNull();
    expect(appels).toHaveBeenCalledTimes(1);
  });

  it("erreur de la base, jeton sentinelle : message fixe, sans cause, ni jeton ni empreinte (critère 16 ; revue, point 4)", async () => {
    const empreinte = createHash("sha256").update(JETON, "utf8").digest();
    const executeur: ExecuteurVue = {
      async query(texte, valeurs = []) {
        if (texte !== SQL_TRANSACTION_VUE[1]) return { rows: [] };
        // À la façon de Drizzle (`DrizzleQueryError`) : texte, paramètres en clair, cause de `pg`.
        const parametres = valeurs.map((v) => (Buffer.isBuffer(v) ? v.toString("hex") : String(v))).join(",");
        throw Object.assign(new Error(`Failed query: ${texte}\nparams: ${parametres}`), {
          cause: Object.assign(new Error("canceling statement"), { code: "57014", detail: parametres, parameters: valeurs }),
        });
      },
    };
    const erreur = await creerLectureVue({ transaction: (fn) => fn(executeur), entetes: async () => entetes, comptee: () => true })
      .lire(JETON, CHEMIN)
      .then(
        () => undefined,
        (e: unknown) => e as Error & { cause?: unknown },
      );
    expect(erreur?.message).toBe("vue partagée : lecture impossible");
    expect(erreur?.cause).toBeUndefined();
    const texte = [String(erreur), erreur?.stack ?? "", JSON.stringify(erreur)].join("\n");
    for (const interdit of [JETON, empreinte.toString("hex"), "Failed query", "params", "resolve_share_link"]) expect(texte, interdit).not.toContain(interdit);
  });

  it("requête non comptée (0157 § 2.1 point 5) : null sans aucune lecture", async () => {
    const { transaction, appels } = client(SCENARIOS["lien valide"] as Scenario);
    const comptee = vi.fn(() => false);
    expect(await creerLectureVue({ transaction, entetes: async () => entetes, comptee }).lire(JETON, CHEMIN)).toBeNull();
    expect(comptee).toHaveBeenCalledWith(entetes, CHEMIN);
    expect(appels).not.toHaveBeenCalled();
  });
});

describe("vue partagée : projection champ par champ, sans carte (0157 § 1.4, Q814)", () => {
  it("vue valide : conforme au schéma strict, mêmes champs que la projection simulée, aucune position", async () => {
    const { transaction } = client(SCENARIOS["lien valide"] as Scenario);
    const vue = await creerLectureVue({ transaction, entetes: async () => entetes, comptee: () => true }).lire(JETON, CHEMIN);
    expect(vue?.timeZone).toBe(edimbourgDebloque.timeZone);
    const parsee = SharedTripViewSchema.parse({ trip: vue?.trip, maps: vue?.maps });
    // Même vue que la projection de l'adaptateur simulé, à trois écarts près : couleur recalculée depuis la destination,
    // durée des trajets inconnue (jamais stockée, aucune relecture pour un visiteur) et « en préparation » déduit de
    // l'absence d'étape (l'instantané ne porte pas `generating` ; le jour 6 simulé est marqué en génération).
    const attendu = projectSharedTrip(edimbourgDebloque);
    const sansDurees = (trip: typeof attendu) =>
      trip.days.map((d) => ({
        ...d,
        generating: !d.items.some((i) => i.type === "stop"),
        items: d.items.map((i) => (i.type === "segment" ? { ...i, segment: { ...i.segment, minutes: null } } : i)),
      }));
    expect(parsee.trip.days).toEqual(sansDurees(attendu));
    expect({ ...parsee.trip, days: [], destinationColor: "" }).toEqual({ ...attendu, days: [], destinationColor: "" });
    expect(parsee.maps).toEqual(attendu.days.map((d) => ({ index: d.index, points: [] })));
    const texte = JSON.stringify(vue);
    for (const interdit of ["placeId", '"id"', "reason", "source", "locked", "commitment", "budget", "surprise", "toReserve", "time_zone"]) {
      expect(texte, interdit).not.toContain(interdit);
    }
  });

  it("jour sans étape : en préparation ; exceptions réduites à toConfirm et unconfirmed", () => {
    const { trip } = projeterVuePartagee(VOYAGE, {
      snapshot: {
        days: [
          { index: 1, date: "2026-11-10", items: [], events: [] },
          {
            index: 2,
            date: "2026-11-11",
            items: [{ type: "stop", stop: { id: "x", placeId: "ChIJ", kind: "activity", name: "Château", start: "10:00", end: "11:00", facts: { tip: "t" }, exceptions: ["toReserve", "toConfirm", "unconfirmed"] } }],
            events: [],
          },
          { index: 3, date: "2026-11-12", items: [{ type: "transfer", from: "a", to: "b" }], events: [] },
        ],
      },
    });
    const jours = trip.days as { generating: boolean; items: { stop?: { exceptions: string[]; key: string } }[] }[];
    expect(jours.map((j) => j.generating)).toEqual([true, false, true]);
    expect(jours[1]?.items[0]?.stop).toEqual({ kind: "activity", name: "Château", start: "10:00", end: "11:00", facts: {}, key: "1", exceptions: ["toConfirm", "unconfirmed"] });
    expect(jours[2]?.items).toEqual([]);
  });

  it("instantané sentinelle complet (critères 11 et 12 ; revue, point 6) : aucun champ hors de la vue n'est recopié", () => {
    const SENTINELLES = ["SENTINELLE_LOGEMENT", "SENTINELLE_AJOUT", "SENTINELLE_RAISON", "SENTINELLE_CLE", "SENTINELLE_A_FAIRE", "SENTINELLE_PLACE", "SENTINELLE_BUDGET", "SENTINELLE_SOURCE"];
    const { trip } = projeterVuePartagee(VOYAGE, {
      snapshot: {
        sentinelle: "SENTINELLE_CLE",
        checklist: [{ label: "SENTINELLE_A_FAIRE", status: "todo" }],
        budget: { note: "SENTINELLE_BUDGET" },
        days: [
          {
            index: 1,
            date: "2026-11-10",
            cleEnTrop: "SENTINELLE_CLE",
            items: [
              { type: "terminus", role: "start", time: "09:00", label: "SENTINELLE_LOGEMENT", lodging: { name: "SENTINELLE_LOGEMENT" } },
              {
                type: "stop",
                cleEnTrop: "SENTINELLE_CLE",
                stop: {
                  id: "SENTINELLE_CLE",
                  placeId: "SENTINELLE_PLACE",
                  kind: "activity",
                  name: "[Vieille ville]",
                  start: "09:30",
                  end: "11:00",
                  addedBy: "SENTINELLE_AJOUT",
                  reason: "SENTINELLE_RAISON",
                  source: "SENTINELLE_SOURCE",
                  facts: { area: "Centre", tip: "SENTINELLE_CLE", lodging: "SENTINELLE_LOGEMENT" },
                  exceptions: ["toReserve", "unconfirmed"],
                  locked: true,
                },
              },
              { type: "segment", segment: { mode: "walk", minutes: 12, estimated: false, polyline: "SENTINELLE_CLE" } },
              { type: "terminus", role: "end", time: "18:00", label: "SENTINELLE_LOGEMENT" },
            ],
            events: [{ id: "e", kind: "event", name: "Concert", start: "20:00", end: "22:00", addedBy: "SENTINELLE_AJOUT", facts: {}, exceptions: [] }],
          },
        ],
      },
    });
    const texte = JSON.stringify(trip);
    for (const interdit of SENTINELLES) expect(texte, interdit).not.toContain(interdit);
    expect(texte).toContain("[Vieille ville]");
    expect(() => SharedTripViewSchema.parse({ trip, maps: [{ index: 1, points: [] }] })).not.toThrow();
  });

  it("voyage sans fuseau ni destination : erreur (page d'erreur commune), jamais un 404", () => {
    expect(() => projeterVuePartagee({ ...VOYAGE, time_zone: null }, VERSION)).toThrow();
    expect(() => projeterVuePartagee({ ...VOYAGE, destination: null }, VERSION)).toThrow();
  });
});
