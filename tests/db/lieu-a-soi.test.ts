import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { ok, PatchResultSchema, RevisionPreviewSchema, TripPatchSchema, TripSnapshotSchema, type Result, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { INCONNU, memePoint, type Point, type SourceRelectures, type Validite } from "@/domain/relectures";
import { creerRelecturesVoyages, type DoubleRelectures } from "@/mocks/relectures-voyages";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { appliquerAjout, identifiantAjout, proposerAjout, type DependancesAjout } from "@/server/lieux/ajout";
import { rechercherLieuxApiTerminal } from "@/server/composition/lieux-api";
import { SQL_VILLE_DU_JOUR } from "@/server/lieux/recherche";
import { basculerVerrou } from "@/server/versions/retouches";
import { creerWithOrg } from "@/server/with-org";
import { createApiCreationAdapter } from "@/adapters/api-creation";
import { chargerDoubles } from "@/server/composition/fixtures-simulees";
import { composerSimuleeAvec, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import { lieuxASoiReinjectes } from "@/server/generation/etapes-revision";
import { etapeLotDebut, etapeLotPlanification } from "@/server/generation/etapes-lot";
import { etapeProgrammeDebut, etapeProgrammeEcriture } from "@/server/generation/etapes-programme";
import type { EtatLot } from "@/server/generation/etat";

import { createDatabase } from "../../db/index";
import {
  BRIEF_EDIMBOURG,
  MAINTENANT,
  PLAFONDS_LARGES,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg as creerWithOrgApercu,
  creerWithSystemOrgPourTests,
} from "../support/banc-apercu";
import { convertirVoyagesSimules, ecrireVoyage, type DonneesVoyage } from "../support/voyages-en-base";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Lieu à soi sur l'adaptateur `api` (tâche M5d-1, ticket 939 ; spécification M5 § 6 ; décision 0147 § 3 point 5, § 4, § 8,
 * § 11, § 5.3 point 7, § 12 S4), sur la base réelle : cas d'usage `proposerAjout` et `appliquerAjout` de
 * `src/server/lieux/ajout.ts` sous `vadrouille_app` avec le `withOrg` réel. Le débit `retouche` est injecté et toujours
 * admis (éprouvé par les tests du limiteur). Voyage d'Édimbourg du jeu simulé, débloqué par une ligne `tripUnlocked`.
 *
 * Aucune donnée Google : le lieu choisi a un `placeId` sentinelle (jamais revérifié auprès de Google, § 3 point 4) et un nom
 * saisi sentinelle (`texteMaison`) ; le port de relectures est le double des voyages simulés, qui rend une durée fixe pour
 * les trajets vers et depuis le lieu ajouté (le double ne connaît que les lieux du jeu). Aucun appel Google ni Routes.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Org;
let b: Org;
let double: DoubleRelectures;
let relectures: SourceRelectures;

const EDIMBOURG = "mock_trip_edimbourg";
const LIEU = "SENTINELLE_PLACE_AJOUT_M5D";
const NOM = "SENTINELLE-NOM-SAISI-M5D";
/** Temps libre du J2 du jeu (15 h à 18 h 30, entre le jardin botanique et le dîner). */
const DEMANDE = { day: 2, time: "16:00", kind: "activity" as const, name: NOM, resultId: LIEU };

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });

const donnees = (debloque: boolean): DonneesVoyage => {
  const converti = convertirVoyagesSimules().find((v) => v.mockId === EDIMBOURG);
  if (!converti) throw new Error(`voyage simulé absent : ${EDIMBOURG}`);
  const { entitlements } = converti.donnees;
  return { ...converti.donnees, entitlements: debloque ? [...entitlements.filter((k) => k !== "tripUnlocked"), "tripUnlocked"] : entitlements.filter((k) => k !== "tripUnlocked") };
};
const nouveauVoyage = (debloque = true, org: Org = a) => ecrireVoyage(app, org, donnees(debloque), undefined, { candidats: true });

const dependances = (ctx: AdapterContext | null): DependancesAjout => ({ contexte: async () => ctx, withOrg, limiteur: async () => ok(undefined), relectures });
const apercu = (tripId: string, baseVersion = 1, extra: Record<string, unknown> = {}, ctx: AdapterContext | null = contexte(a)) =>
  proposerAjout(dependances(ctx), { tripId, baseVersion, ...DEMANDE, ...extra });
const appliquer = (tripId: string, baseVersion = 1, requestId: string = randomUUID(), extra: Record<string, unknown> = {}, ctx: AdapterContext | null = contexte(a)) =>
  appliquerAjout(dependances(ctx), { tripId, baseVersion, requestId, ...DEMANDE, ...extra });

type Ligne = Record<string, unknown>;
const versions = (org: Org, tripId: string): Promise<Ligne[]> =>
  inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (
      await c.query(
        "SELECT version, parent_version, author_kind, author_user_id, snapshot, patch FROM trip_versions WHERE organization_id = $1 AND trip_id = $2 ORDER BY version",
        [org.org, tripId],
      )
    ).rows,
  );
const instantane = (ligne: Ligne | undefined): TripSnapshot => TripSnapshotSchema.parse(ligne?.snapshot);
const etapes = (s: TripSnapshot): { jour: number; stop: StopSnapshot }[] =>
  s.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "stop" ? [{ jour: jour.index, stop: item.stop }] : [])));
const etape = (s: TripSnapshot, id: string) => etapes(s).find((e) => e.stop.id === id);

const valeur = <T>(resultat: Result<T>): T => {
  if (!resultat.ok) throw new Error(`refus inattendu : ${resultat.error.code}`);
  return resultat.value;
};
const erreur = <T>(resultat: Result<T>) => (resultat.ok ? null : resultat.error);

/** Lignes des tables du voyage qui pourraient porter un texte : versions, « À faire », retours, exécutions. */
const lignesDuVoyage = async (tripId: string): Promise<string> => {
  const textes: string[] = [];
  for (const table of ["trip_versions", "checklist_items", "feedback", "generation_runs"]) {
    const { rows } = await admin.query(`SELECT t::text AS ligne FROM public.${table} t WHERE trip_id = $1`, [tripId]);
    textes.push(...rows.map((r) => String(r.ligne)));
  }
  return textes.join("\n");
};

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await createOrg(auth);
  b = await createOrg(auth);
  double = creerRelecturesVoyages();
  const estLeLieu = (point: Point) => "lieu" in point && point.lieu === LIEU;
  // Le double ne connaît que les lieux du jeu. Pour le lieu ajouté, il répond comme le vrai port, à ce qui est **demandé**
  // seulement : sa fiche (`validite`, valide s'il est dans `demande.lieux`, sinon inconnue ; R1 exige un lieu ajouté relu
  // et valide, `PORTEE_R1_PAR_DEFAUT`), et les trajets demandés vers et depuis lui, 10 minutes ; tout le reste, le double
  // (un trajet ou une fiche non demandés restent inconnus). Correction 2 de la PR 943 : sans la fiche, R1 refusait tout
  // ajout (`no_option`) ; la demande de `src/server/lieux/ajout.ts` couvrait déjà la fiche et les trajets du cas nominal.
  relectures = {
    async pour(voyage, demande) {
      const issue = await double.pour(voyage, demande);
      if (!issue.ok) return issue;
      const base = issue.relectures;
      const ficheDemandee = demande.lieux.some((lieu) => lieu.placeId === LIEU);
      return {
        ok: true as const,
        relectures: {
          validite(placeId) {
            const lue = base.validite(placeId);
            if (lue !== INCONNU || placeId !== LIEU) return lue;
            return ficheDemandee ? "valide" : INCONNU;
          },
          plages: (placeId, date) => base.plages(placeId, date),
          duree(depuis, vers, mode) {
            const lue = base.duree(depuis, vers, mode);
            if (lue !== INCONNU) return lue;
            const demandee = demande.trajets.some((t) => memePoint(t.depuis, depuis) && memePoint(t.vers, vers) && t.modes.includes(mode));
            return demandee && (estLeLieu(depuis) || estLeLieu(vers)) ? { minutes: 10, estimee: false } : INCONNU;
          },
        },
      };
    },
  };
});

afterAll(closeAll);

describe("lieu à soi sur api (M5d-1, ticket 939)", () => {
  it("aperçu add : étape ajoutée à son heure, nom saisi ; rien n'est écrit ; un appel du port", async () => {
    const tripId = await nouveauVoyage();
    const appels = double.appels();
    const lu = RevisionPreviewSchema.parse(valeur(await apercu(tripId)));
    expect(lu.kind).toBe("add");
    expect(lu.baseVersion).toBe(1);
    expect(lu.targetStopId.startsWith("ajout-")).toBe(true);
    const ajoutee = lu.days.flatMap((d) => d.items).find((i) => i.type === "stop" && i.stop.id === lu.targetStopId);
    expect(ajoutee).toMatchObject({ type: "stop", stop: { name: NOM, start: "16:00", locked: true, addedBy: "person" } });
    expect(lu.changedStopIds[0]).toBe(lu.targetStopId);
    expect(double.appels()).toBe(appels + 1);
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("application : version 2 (auteur user, patch [add, lock]), étape verrouillée et ajoutée par la personne ; seul le placeId est gardé ; rejeu idempotent", async () => {
    const tripId = await nouveauVoyage();
    const requestId = randomUUID();
    const resultat = PatchResultSchema.parse(valeur(await appliquer(tripId, 1, requestId)));
    expect(resultat.version).toBe(2);
    expect(resultat.touchedDays).toContain(2);
    expect(resultat.changes).toContainEqual({ type: "added", time: "16:00", label: NOM });

    const lignes = await versions(a, tripId);
    expect(lignes).toHaveLength(2);
    expect(lignes[1]).toMatchObject({ version: 2, parent_version: 1, author_kind: "user", author_user_id: a.owner });
    const stopId = identifiantAjout(requestId);
    expect(TripPatchSchema.parse(lignes[1]?.patch)).toEqual({
      requestId,
      baseVersion: 1,
      operations: [
        { op: "add", stopId, kind: "activity", day: 2, time: "16:00", name: NOM, placeId: LIEU },
        { op: "lock", stopId },
      ],
    });
    expect(etape(instantane(lignes[1]), stopId)).toEqual({
      jour: 2,
      stop: { id: stopId, kind: "activity", placeId: LIEU, name: NOM, start: "16:00", end: expect.any(String), facts: {}, exceptions: [], locked: true, addedBy: "person" },
    });

    // Rejeu : même réponse, sans relecture (le rejeu est cherché avant le port, `rejeuDe`), aucune nouvelle version ; autre
    // geste sous le même requestId : conflit.
    const appels = double.appels();
    expect(valeur(await appliquer(tripId, 1, requestId))).toEqual({ version: 2, touchedDays: [2], changes: [{ type: "added", time: "16:00", label: NOM }] });
    expect(double.appels()).toBe(appels);
    expect(erreur(await appliquer(tripId, 1, requestId, { time: "17:00" }))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(await versions(a, tripId)).toHaveLength(2);

    // Aucun nom ni adresse Google : la demande n'a aucun champ pour eux ; le placeId choisi est la seule donnée de Google.
    const texte = await lignesDuVoyage(tripId);
    expect(texte).toContain(LIEU);
    for (const interdit of ["SENTINELLE-NOM-LIEU-M5D", "SENTINELLE-ADRESSE-LIEU-M5D", "shortFormattedAddress", "displayName"]) expect(texte).not.toContain(interdit);
  });

  it("refusé avant le déblocage : not_unlocked (retryable faux), sans relecture ni écriture", async () => {
    const tripId = await nouveauVoyage(false);
    const appels = double.appels();
    expect(erreur(await apercu(tripId))).toEqual({ code: "not_unlocked", retryable: false });
    expect(erreur(await appliquer(tripId))).toEqual({ code: "not_unlocked", retryable: false });
    expect(double.appels()).toBe(appels);
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("conflit de version : baseVersion dépassée, version_conflict avec currentVersion, sans écriture", async () => {
    const tripId = await nouveauVoyage();
    valeur(await appliquer(tripId, 1));
    expect(erreur(await apercu(tripId, 1))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(erreur(await appliquer(tripId, 1))).toEqual({ code: "version_conflict", retryable: true, currentVersion: 2 });
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("entrée stricte : nom Google, adresse, organisation refusés ; jour hors du voyage not_found ; aucune place : no_option", async () => {
    const tripId = await nouveauVoyage();
    for (const extra of [{ googleName: "x" }, { address: "x" }, { organizationId: b.org }, { name: "" }]) {
      expect(erreur(await apercu(tripId, 1, extra))).toMatchObject({ code: "validation_failed" });
    }
    expect(erreur(await apercu(tripId, 1, { day: 30 }))).toEqual({ code: "not_found" });
    expect(erreur(await apercu(tripId, 1, { time: "23:50" }))).toEqual({ code: "no_option", cause: "no_room" });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("isolation : un voyage d'une autre organisation est not_found, aperçu comme application ; sans session : unauthenticated", async () => {
    const tripId = await nouveauVoyage(true, b);
    expect(erreur(await apercu(tripId, 1, {}, contexte(a)))).toEqual({ code: "not_found" });
    expect(erreur(await appliquer(tripId, 1, randomUUID(), {}, contexte(a)))).toEqual({ code: "not_found" });
    expect(erreur(await apercu(tripId, 1, {}, null))).toEqual({ code: "unauthenticated" });
    expect(await versions(b, tripId)).toHaveLength(1);
    // Dans son organisation, l'ajout passe.
    expect(valeur(await appliquer(tripId, 1, randomUUID(), {}, contexte(b))).version).toBe(2);
  });

  it(`${String(VERSIONS_MAX_PAR_VOYAGE)} versions atteintes : validation_failed sur baseVersion, sans relecture ni écriture (0147 § 5.3 point 7)`, async () => {
    const tripId = await nouveauVoyage();
    const [v1] = await versions(a, tripId);
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, $3, 1, $4, $5, 'engine')",
        [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE, randomUUID(), JSON.stringify(v1?.snapshot)],
      );
      await c.query("UPDATE trips SET current_version = $3 WHERE organization_id = $1 AND id = $2", [a.org, tripId, VERSIONS_MAX_PAR_VOYAGE]);
    });
    const appels = double.appels();
    expect(erreur(await apercu(tripId, VERSIONS_MAX_PAR_VOYAGE))).toEqual({ code: "validation_failed", field: "baseVersion" });
    expect(erreur(await appliquer(tripId, VERSIONS_MAX_PAR_VOYAGE))).toEqual({ code: "validation_failed", field: "baseVersion" });
    expect(double.appels()).toBe(appels);
    expect(await versions(a, tripId)).toHaveLength(2);
  });

  it("relecture refusée : forfait atteint → cost_cap_reached ; port indisponible ou en erreur → provider_error ; rien d'écrit (0147 § 4 point 3)", async () => {
    const tripId = await nouveauVoyage();
    const avec = (source: SourceRelectures): DependancesAjout => ({ ...dependances(contexte(a)), relectures: source });
    for (const [source, code] of [
      [creerRelecturesVoyages({ refus: "quota_reached" }), "cost_cap_reached"],
      [creerRelecturesVoyages({ refus: "unavailable" }), "provider_error"],
      [creerRelecturesVoyages({ leve: true }), "provider_error"],
    ] as const) {
      expect(erreur(await proposerAjout(avec(source), { tripId, baseVersion: 1, ...DEMANDE })), code).toEqual({ code });
      expect(erreur(await appliquerAjout(avec(source), { tripId, baseVersion: 1, requestId: randomUUID(), ...DEMANDE })), code).toEqual({ code });
      expect(source.appels()).toBe(2);
    }
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("fiche du lieu ajouté non valide : introuvable → no_option place_not_found, fermé → place_closed, fiches en échec → provider_error ; avant le moteur, à l'aperçu et à l'application, rien d'écrit (0155 § 1)", async () => {
    const tripId = await nouveauVoyage();
    // Double qui ne sert que la demande (règle des doubles, 0147 A.3) : la fiche du lieu ajouté vaut `etat` seulement si
    // elle est demandée (sinon inconnue) ; tout le reste, le double des voyages et les trajets du lieu ajouté (10 minutes).
    const avecFiche = (etat: Validite): SourceRelectures & { appels(): number } => {
      let appels = 0;
      return {
        appels: () => appels,
        async pour(voyage, demande) {
          appels += 1;
          const issue = await relectures.pour(voyage, demande);
          if (!issue.ok) return issue;
          const base = issue.relectures;
          const ficheDemandee = demande.lieux.some((lieu) => lieu.placeId === LIEU);
          return {
            ok: true as const,
            relectures: { ...base, validite: (placeId: string) => (placeId === LIEU ? (ficheDemandee ? etat : INCONNU) : base.validite(placeId)) },
          };
        },
      };
    };
    for (const [etat, attendu] of [
      ["introuvable", { code: "no_option", cause: "place_not_found" }],
      ["ferme_definitivement", { code: "no_option", cause: "place_closed" }],
      [INCONNU, { code: "provider_error" }],
    ] as const) {
      const source = avecFiche(etat);
      const deps: DependancesAjout = { ...dependances(contexte(a)), relectures: source };
      // À 16 h (place libre) comme à 23 h 50 (que le moteur refuserait faute de place) : la cause vient de la fiche, décidée
      // avant le moteur.
      for (const time of ["16:00", "23:50"]) {
        expect(erreur(await proposerAjout(deps, { tripId, baseVersion: 1, ...DEMANDE, time })), `${etat} ${time}`).toEqual(attendu);
        expect(erreur(await appliquerAjout(deps, { tripId, baseVersion: 1, requestId: randomUUID(), ...DEMANDE, time })), `${etat} ${time}`).toEqual(attendu);
      }
      expect(source.appels()).toBe(4);
    }
    expect(await versions(a, tripId)).toHaveLength(1);
    const texte = await lignesDuVoyage(tripId);
    expect(texte).not.toContain(LIEU);
    expect(texte).not.toContain(NOM);
    // Fiche valide, même double : l'ajout passe (le double ne refuse rien d'autre).
    expect(valeur(await appliquerAjout({ ...dependances(contexte(a)), relectures: avecFiche("valide") }, { tripId, baseVersion: 1, requestId: randomUUID(), ...DEMANDE })).version).toBe(2);
  });

  it("recalcul ou voyage complet en cours : l'application rend generation_in_progress (retryable), sans écriture", async () => {
    const tripId = await nouveauVoyage();
    await admin.query("INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase) VALUES ($1, $2, 'full', 'preparing')", [a.org, tripId]);
    expect(erreur(await appliquer(tripId))).toEqual({ code: "generation_in_progress", retryable: true });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("étape mobile repoussée après le lieu ajouté : trajet non relu, no_option avec cause no_room, sans écriture (réponse du Tech Lead, revue de la PR 943 ; 0147 A.7, 0155 § 1)", async () => {
    const tripId = await nouveauVoyage();
    // 13 h 35 au J2 : le jardin botanique (13 h 25 – 15 h, mobile) chevauche le bloc ajouté et serait repoussé après lui ; le
    // trajet du lieu ajouté vers le jardin n'est pas dans la demande de relectures. La fiche du lieu ajouté est valide : la
    // cause est le manque de place (`no_room`), posée par le cas d'usage sur le refus du moteur.
    expect(erreur(await apercu(tripId, 1, { time: "13:35" }))).toEqual({ code: "no_option", cause: "no_room" });
    expect(erreur(await appliquer(tripId, 1, randomUUID(), { time: "13:35" }))).toEqual({ code: "no_option", cause: "no_room" });
    expect(await versions(a, tripId)).toHaveLength(1);
  });

  it("ajout sur une étape verrouillée : no_option avec cause no_room, rien d'écrit, à l'aperçu comme à l'application (critère 22, ticket 954 ; 0155 § 1)", async () => {
    const tripId = await nouveauVoyage();
    // Le dîner du J2 (19 h – 20 h 30) verrouillé : version 2. Le lieu ajouté, verrouillé par son propre patch `[add, lock]`,
    // n'ouvre pas l'exception des conflits entre verrous (B5-PO-6) : refus par le contrôle des étapes fixes du moteur.
    valeur(await basculerVerrou({ contexte: async () => contexte(a), withOrg, limiteur: async () => ok(undefined) }, "lock", { tripId, requestId: randomUUID(), stopId: "j2-diner", baseVersion: 1 }));
    const avant = await versions(a, tripId);
    expect(avant).toHaveLength(2);
    // À l'heure du dîner, puis 30 minutes avant (le bloc ajouté de 90 minutes le recouvre).
    for (const time of ["19:00", "18:30"]) {
      expect(erreur(await apercu(tripId, 2, { time })), time).toEqual({ code: "no_option", cause: "no_room" });
      expect(erreur(await appliquer(tripId, 2, randomUUID(), { time })), time).toEqual({ code: "no_option", cause: "no_room" });
    }
    expect(await versions(a, tripId)).toEqual(avant);
    const texte = await lignesDuVoyage(tripId);
    expect(texte).not.toContain(LIEU);
    expect(texte).not.toContain(NOM);
  });

  it("R3 : une étape verrouillée survit à l'ajout (nom, jour, heures, placeId, verrou)", async () => {
    const tripId = await nouveauVoyage();
    // Le dîner du J2, voisin suivant du lieu ajouté (trajet demandé). Pas le jardin botanique : verrouillé à son heure
    // écrite, il ferait passer le déjeuner, mobile et décalé par la replanification, après lui ; le trajet du jardin vers
    // le déjeuner n'est pas demandé, d'où `no_option` (étape mobile repoussée, cas toléré ; correction 2 de la PR 943).
    valeur(await basculerVerrou({ contexte: async () => contexte(a), withOrg, limiteur: async () => ok(undefined) }, "lock", { tripId, requestId: randomUUID(), stopId: "j2-diner", baseVersion: 1 }));
    const avant = etape(instantane((await versions(a, tripId))[1]), "j2-diner");
    expect(avant?.stop.locked).toBe(true);
    expect(valeur(await appliquer(tripId, 2)).version).toBe(3);
    const apres = etape(instantane((await versions(a, tripId))[2]), "j2-diner");
    expect(apres).toEqual(avant);
  });
});

/**
 * Revue de la PR 943, bloquant 2 (0147 § 3 point 2) : la ville du jour est le nom maison (`stays.city`) du séjour qui couvre la
 * date du jour, sinon celui qui se termine ce jour-là ; `SQL_VILLE_DU_JOUR` exécutée par Postgres (paramètre `$3` répété).
 * Puis la recherche réelle du terminal (client doublé, garde et barrière injectées ouvertes) : ville inconnue, requête sans
 * suffixe.
 */
describe("ville du jour d'une recherche de lieu (SQL_VILLE_DU_JOUR)", () => {
  /** Voyage d'Édimbourg à deux séjours : le premier jusqu'au jour 3 (exclu), le second ensuite ; villes posées ou nulles. */
  const deuxSejours = async (premiere: string | null, seconde: string | null): Promise<{ tripId: string; jours: number }> => {
    const tripId = await nouveauVoyage();
    const [dates] = (await admin.query("SELECT (end_date - start_date + 1)::integer AS jours FROM public.trips WHERE id = $1", [tripId])).rows as { jours: number }[];
    await admin.query(
      "UPDATE public.stays s SET to_date = t.start_date + 2, city = $2 FROM public.trips t WHERE t.id = s.trip_id AND s.trip_id = $1",
      [tripId, premiere],
    );
    await admin.query(
      `INSERT INTO public.stays (organization_id, trip_id, kind, place_id, label, from_date, to_date, city)
       SELECT organization_id, id, 'lodging', NULL, '[Second logement]', start_date + 2, end_date, $2 FROM public.trips WHERE id = $1`,
      [tripId, seconde],
    );
    return { tripId, jours: dates!.jours };
  };
  const ville = (tripId: string, jour: number) =>
    inTx(app, { org: a.org, user: a.owner }, async (c) => {
      const { rows } = await c.query(SQL_VILLE_DU_JOUR, [a.org, tripId, jour]);
      return rows.length === 0 ? "aucune ligne" : (rows[0]?.city as string | null);
    });

  it("premier jour, jour du changement de ville (nouvelle ville), dernier jour, jour hors du voyage ; city nulle ; autre organisation", async () => {
    const { tripId, jours } = await deuxSejours("[Ville A]", "[Ville B]");
    expect(jours).toBeGreaterThanOrEqual(4);
    expect(await ville(tripId, 1)).toBe("[Ville A]");
    expect(await ville(tripId, 2)).toBe("[Ville A]");
    // Jour 3 : le premier séjour se termine, le second commence ; le séjour qui couvre la date l'emporte.
    expect(await ville(tripId, 3)).toBe("[Ville B]");
    expect(await ville(tripId, jours)).toBe("[Ville B]");
    expect(await ville(tripId, jours + 1)).toBe("aucune ligne");
    const nulle = await deuxSejours(null, "[Ville B]");
    expect(await ville(nulle.tripId, 1)).toBeNull();
    // Voyage d'une autre organisation : rien (organisation liée en plus de la RLS).
    const autre = await nouveauVoyage(true, b);
    expect(await inTx(app, { org: a.org, user: a.owner }, async (c) => (await c.query(SQL_VILLE_DU_JOUR, [a.org, autre, 1])).rows)).toEqual([]);
  });

  it("recherche du terminal sur la base : ville maison passée au client ; ville inconnue (city nulle), requête sans suffixe ; jour hors du voyage not_found sans appel", async () => {
    const { tripId, jours } = await deuxSejours(null, "[Ville B]");
    const requetes: { texte: string; ville: string | null }[] = [];
    const client = () => ({
      async rechercherLieux(texte: string, villeDuJour: string | null) {
        requetes.push({ texte, ville: villeDuJour });
        return [{ placeId: LIEU, nom: "[Résultat]", adresse: null }];
      },
    });
    const chercher = (day: number) =>
      rechercherLieuxApiTerminal(
        { tripId, day, query: "Café bleu" },
        {
          contexte: async () => contexte(a),
          withOrg,
          headers: new Headers(),
          seuilsValides: () => true,
          barriere: async () => "reelle",
          client: client as never,
          limiteur: async () => ({ ok: true }),
          reserver: async () => ({ ok: true, compte: 1 }),
          purger: async () => undefined,
        },
      );
    expect(valeur(await chercher(1))).toEqual([{ resultId: LIEU, name: "[Résultat]" }]);
    expect(valeur(await chercher(3))).toHaveLength(1);
    expect(requetes).toEqual([
      { texte: "Café bleu", ville: null },
      { texte: "Café bleu", ville: "[Ville B]" },
    ]);
    expect(erreur(await chercher(jours + 1))).toEqual({ code: "not_found" });
    expect(requetes).toHaveLength(2);
  });
});

/**
 * Revue de la PR 943, bloquant 1 (0147 § 12 S4) : la révision après le tri (M1b) ne voit pas le lieu à soi (il n'entre pas
 * dans la requête) et le réinjecte de la version de base avant R3 : la version révisée s'écrit, le lieu à soi y est inchangé
 * (nom, jour, heures, `placeId`, verrou). Base jetable de l'aperçu, variante simulée, chaînes déroulées sans le SDK, comme le
 * test M1b de `verrou.test.ts`. La version de base porte le lieu à soi (écrite comme une version de la personne).
 */
describe("lieu à soi et révision après le tri (M1b)", () => {
  let jetable: BaseApercu;
  let withOrgJetable: ReturnType<typeof creerWithOrgApercu>;

  beforeAll(async () => {
    jetable = await creerBaseApercu("lieuasoi");
    withOrgJetable = creerWithOrgApercu(jetable.db);
  }, 120_000);
  afterAll(async () => {
    await jetable.supprimer();
  });

  const generation = (fabrique: () => FabriqueGeneration): DependancesGeneration => ({
    transaction: creerWithSystemOrgPourTests(jetable.db),
    horloge: creerHorlogeManuelle(MAINTENANT),
    plafonds: { ...PLAFONDS_LARGES, parOrganisationJourMicros: 500_000_000 },
    barriere: { env: { VADROUILLE_ENV: "ci" } },
    reserverEnSimulee: true,
    composition: fabrique,
    chaine: "inversee",
  });
  const lire = async <T>(org: Org, texte: string, valeurs: unknown[]): Promise<T[]> =>
    inTx(jetable.app, { org: org.org, user: org.owner }, async (c) => (await c.query(texte, valeurs)).rows as T[]);
  const instantanes = async (org: Org, tripId: string): Promise<TripSnapshot[]> =>
    (await lire<{ snapshot: unknown }>(org, "SELECT snapshot FROM public.trip_versions WHERE trip_id = $1 ORDER BY version", [tripId])).map((l) => TripSnapshotSchema.parse(l.snapshot));

  it("révision M1b : version écrite, lieu à soi conservé tel quel ; jamais dans la requête", async () => {
    const org = await createOrg(jetable.auth);
    const doublesRome = await chargerDoubles({ VADROUILLE_ENV: "ci" }, "Rome");
    const deps = () => generation(() => composerSimuleeAvec({ doubles: () => doublesRome() }));
    const creation = createApiCreationAdapter({ withOrg: withOrgJetable, maintenant: () => MAINTENANT, demarrerApercu: async () => null, demarrerVoyageComplet: async () => null, chaine: "inversee" });
    const r = await creation.createTrip(contexteDe(org), {
      requestId: randomUUID(),
      draft: { destination: "Rome", start: "2027-05-04", end: "2027-05-08", lodging: { kind: "area", label: "Rione Monti (près du Colisée)" }, otherCities: [], commitments: [] },
      brief: BRIEF_EDIMBOURG,
    });
    const tripId = valeur(r).tripId;
    const [apercu] = await lire<{ id: string }>(org, "SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId]);
    const apresA = await etapeProgrammeDebut({ generationRunId: apercu!.id, organizationId: org.org, rang: 0 }, deps());
    expect((await etapeProgrammeEcriture(apresA, deps())).arret).toBeUndefined();
    await jetable.admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org.org, tripId]);

    // Version 2 : la version 1 et un lieu à soi au J2, en fin de soirée (aucune étape de l'IA retirée : les cases du tri
    // gardent leurs étapes), posé avant le terminus de fin.
    const [v1] = await instantanes(org, tripId);
    const stopId = `ajout-${randomUUID()}`;
    const ajoutee: StopSnapshot = { id: stopId, kind: "activity", placeId: LIEU, name: NOM, start: "22:15", end: "22:45", facts: {}, exceptions: [], locked: true, addedBy: "person" };
    // Règles de la réinjection (M5d-4, décision 0155 § 2) : mode de trajet du jeu (marche) et configuration du moteur.
    const avecAjout = lieuxASoiReinjectes({ days: v1!.days.map((jour) => (jour.index === 2 ? { ...jour, items: [{ type: "stop", stop: ajoutee }] } : { ...jour, items: [] })) }, v1!, {
      mode: "walk",
      configuration: CONFIGURATION_MOTEUR,
    });
    expect(etape(avecAjout, stopId)?.stop).toEqual(ajoutee);
    expect(etapes(avecAjout).filter((e) => e.stop.id !== stopId)).toEqual(etapes(v1!));
    // INSERT direct dans `trip_versions` (auteur `engine`), et non `ecrireVersion` ni `appliquerAjout` : seul l'instantané
    // de la base de la révision compte pour S4 (étape `addedBy: "person"` gardée par M1b) ; le chemin d'écriture d'un ajout
    // est éprouvé par le premier describe (auteur `user`, patch `[add, lock]`). Suffisant pour S4 (revue de la PR 943).
    await inTx(jetable.app, { org: org.org, user: org.owner }, async (c) => {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, 2, 1, $3, $4, 'engine')",
        [org.org, tripId, randomUUID(), JSON.stringify(TripSnapshotSchema.parse(avecAjout))],
      );
      await c.query("UPDATE trips SET current_version = 2 WHERE organization_id = $1 AND id = $2", [org.org, tripId]);
    });

    // « Pas pour moi » sur deux cases de l'aperçu, puis la révision (`batch`) sur la version 2.
    const cases = await lire<{ id: string; content: { category: string } }>(org, "SELECT id, content FROM public.proposals WHERE trip_id = $1 AND phase = 'preview' ORDER BY position", [tripId]);
    for (const cas of [cases[0]!, cases[4]!]) {
      await jetable.admin.query(
        `INSERT INTO public.preference_signals (organization_id, trip_id, request_id, signal, origin, category, proposal_id)
         VALUES ($1, $2, gen_random_uuid(), 'dislike', 'gesture', $3, $4)`,
        [org.org, tripId, cas.content.category, cas.id],
      );
    }
    const lot = await inTx(jetable.app, { org: org.org, user: org.owner }, async (c) => {
      const cloture = (
        await c.query(
          "INSERT INTO public.deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', 8, gen_random_uuid()) RETURNING id",
          [org.org, tripId, apercu!.id],
        )
      ).rows[0].id as string;
      return (
        await c.query(
          "INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id, request_id) VALUES ($1, $2, 'batch', 'queued', 2, $3, gen_random_uuid()) RETURNING id",
          [org.org, tripId, cloture],
        )
      ).rows[0].id as string;
    });
    const etat: EtatLot = { generationRunId: lot, organizationId: org.org, rang: 0 };
    const debut = await etapeLotDebut(etat, deps());
    const fin = debut.arret !== undefined || debut.rang === etat.rang ? debut : await etapeLotPlanification(debut, deps());
    expect(fin.arret).toBeUndefined();

    const apres = await instantanes(org, tripId);
    expect(apres).toHaveLength(3);
    expect(etape(apres[2]!, stopId)).toEqual({ jour: 2, stop: ajoutee });
    expect(await lire(org, "SELECT phase, last_version FROM public.generation_runs WHERE id = $1", [lot])).toEqual([{ phase: "ready", last_version: 3 }]);
    // Le nom saisi n'est dans aucune requête de modèle (les exécutions ne journalisent aucun texte saisi).
    const runs = await lire<{ ligne: string }>(org, "SELECT g::text AS ligne FROM public.generation_runs g WHERE trip_id = $1", [tripId]);
    expect(runs.map((l) => l.ligne).join("\n")).not.toContain(NOM);
  }, 180_000);
});
