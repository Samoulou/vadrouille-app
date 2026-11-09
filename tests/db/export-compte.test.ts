import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { ACCOUNT_EXPORT_FORBIDDEN_KEYS, type AccountExport, AccountExportSchema, accountExportKeys } from "@/contracts/account-export";
import { creerExportCompte, type ExecuteurExport, REQUETES_EXPORT, serialiserExport, type TransactionExport, transactionExportSur } from "@/server/account/export";
import { creerControleConnexionRecente } from "@/server/account/reauthentification";
import { type CanonicalEmail } from "@/server/email";
import { creerRouteExport, type DependancesExport, type SessionExport } from "@/server/routes/compte-export";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { adresse, type Banc, canonique, codeFaux, connecter, demanderCode, jetonDuCookie, preparerBanc } from "./auth-outils";
import { closeAll, connect, createOrg, type DbClient, inTx } from "./helpers";

/**
 * « Exporter mes données » en base (spécification M9 § 6.2, critères 1 à 6 et 8 ; ticket 1097, M9a) : le cas d'usage réel
 * de `src/server/account/export.ts` sous `vadrouille_app` (RLS et droits de la base, transaction `REPEATABLE READ READ
 * ONLY`), la route réelle de `src/server/routes/compte-export.ts` avec la session de Better Auth (`readSession`) et la
 * mesure de la connexion récente (`readSessionCreatedAt`) ; seuls le limiteur (toujours admis, critère 9 dans le test de la
 * route) et l'horloge du contrôle (injectée, critère 2) sont doublés.
 *
 * Exemple commun (§ 6) : Samuel, connecté par un vrai code, organisation personnelle ; voyage d'Édimbourg (2026-08-29 au
 * 2026-09-03, `Europe/London`) débloqué, trois versions, tri avec gestes et fin de tri, deux avis, un goût retenu, un accord
 * aux rappels retiré et un rappel envoyé, un lien privé, un paiement `succeeded`, une ligne `billing`, une ligne
 * `usage_ledger` et une ligne `place_coordinates` ; une seconde organisation (Léa) remplie de même, avec des sentinelles.
 */

const app = createDatabase("vadrouille_app");
const withOrgTest = creerWithOrg(app);

/** Textes des requêtes de chaque transaction de l'export (ce qui a été lu). */
const journal: string[] = [];
const transactionJournal: TransactionExport = (ctx, fn) =>
  transactionExportSur(withOrgTest)(ctx, (executeur) =>
    fn({
      query: (texte, valeurs) => {
        journal.push(texte);
        return executeur.query(texte, valeurs);
      },
    }),
  );
const cas = creerExportCompte(transactionJournal);

// Sentinelles Google du critère 5 : ce que des doubles de Places et Routes rendraient, et ce que la base garde ailleurs.
const NOM_GOOGLE = "SENTINELLE-NOM-GOOGLE-M9A";
const ADRESSE_GOOGLE = "SENTINELLE-ADRESSE-M9A";
const DUREE_GOOGLE = 4321;
const LAT = 12.3456;
const LNG = 65.4321;
const SENTINELLES_GOOGLE = [NOM_GOOGLE, ADRESSE_GOOGLE, String(DUREE_GOOGLE), String(LAT), String(LNG)];

/** Méthodes des doubles des clients Google (Places : recherche et fiche ; Routes : trajets). */
const METHODES_GOOGLE = ["ficheLieu", "rechercheTexte", "rechercheVille", "details", "photos", "trajet", "matrice", "computeRoutes"] as const;

/** Double d'un client Google : chaque méthode appelée est comptée et rend les sentinelles. */
function doubleGoogle() {
  const appels: string[] = [];
  const reponse = { id: "ChIJ-double", displayName: { text: NOM_GOOGLE }, formattedAddress: ADRESSE_GOOGLE, location: { latitude: LAT, longitude: LNG }, duration: `${DUREE_GOOGLE * 60}s` };
  const client: Record<string, () => Promise<unknown>> = Object.fromEntries(
    METHODES_GOOGLE.map((nom) => [
      nom,
      async () => {
        appels.push(nom);
        return reponse;
      },
    ]),
  );
  return { client, appels };
}

type Personne = { email: CanonicalEmail; org: string; user: string; trip: string; ctx: AdapterContext };

let admin: DbClient;
let auth: DbClient;
let client: DbClient;
let bancSamuel: Banc;
let samuel: Personne;
let lea: Personne;
let sessionSamuel: SessionExport;
let creeeLe: Date;

const PLACE_SAMUEL = "ChIJ-chateau-m9a";
const LEA = {
  destination: "SENTINELLE-LEA-DESTINATION",
  recit: "SENTINELLE-LEA-RECIT",
  etape: "SENTINELLE-LEA-ETAPE",
  placeId: "ChIJ-SENTINELLE-LEA",
};

function instantane(nomEtape: string, placeId: string) {
  return {
    days: [
      {
        index: 1,
        date: "2026-08-29",
        travelMinutes: DUREE_GOOGLE,
        travelBudgetMinutes: 240,
        items: [
          { type: "terminus", role: "start", time: "09:00", label: "Hôtel Balmoral" },
          {
            type: "stop",
            stop: {
              id: "s1",
              kind: "activity",
              placeId,
              name: nomEtape,
              start: "09:30",
              end: "11:00",
              facts: { area: "Old Town", tip: "Réserve le créneau de 9 h" },
              source: { label: "Site officiel", url: "https://www.edinburghcastle.scot" },
              exceptions: [],
              locked: false,
              // Clés hors liste blanche (instantané ancien ou altéré) : jamais exportées.
              displayName: NOM_GOOGLE,
              formattedAddress: ADRESSE_GOOGLE,
            },
          },
          { type: "segment", segment: { mode: "walk", minutes: DUREE_GOOGLE, estimated: false } },
          { type: "terminus", role: "end", time: "18:00", label: "Hôtel Balmoral" },
        ],
        events: [],
      },
    ],
  };
}

/** Exemple commun dans l'organisation `p`, écrit par les rôles prévus. */
async function peupler(p: Personne, textes: { destination: string; recit: string; etape: string; placeId: string }): Promise<string> {
  const ctx = { org: p.org, user: p.user };
  const trip = await inTx(client, ctx, async (c) => {
    const id = (
      await c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, travellers_children, time_zone) VALUES ($1, $2, $3, $4, '2026-08-29', '2026-09-03', 2, 1, 'Europe/London') RETURNING id",
        [p.org, p.user, randomUUID(), textes.destination],
      )
    ).rows[0].id as string;
    await c.query("INSERT INTO briefs (organization_id, trip_id, version, story, pace, wishes) VALUES ($1, $2, 1, $3, 'balanced', '{museum}')", [p.org, id, textes.recit]);
    await c.query(
      `INSERT INTO stays (organization_id, trip_id, kind, place_id, label, from_date, to_date, lodging_kind, area_center_lat, area_center_lng, area_radius_m)
       VALUES ($1, $2, 'lodging', $3, 'Hôtel Balmoral', '2026-08-29', '2026-09-03', 'area', $4, $5, 500)`,
      [p.org, id, textes.placeId, LAT, LNG],
    );
    await c.query("INSERT INTO trip_commitments (organization_id, trip_id, rank, kind, label, date, start_time, end_time) VALUES ($1, $2, 0, 'flight', 'Vol LX 460', '2026-08-29', '07:10', '08:05')", [p.org, id]);
    for (const version of [1, 2, 3]) {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, patch, author_kind) VALUES ($1, $2, $3, $4, $5, $6, $7, 'engine')",
        [p.org, id, version, version === 1 ? null : version - 1, randomUUID(), JSON.stringify(instantane(textes.etape, textes.placeId)), version === 1 ? null : JSON.stringify([{ op: "lock", stopId: "s1" }])],
      );
    }
    await c.query("UPDATE trips SET current_version = 3 WHERE id = $1", [id]);
    const run = (await c.query("INSERT INTO generation_runs (organization_id, trip_id, kind, phase) VALUES ($1, $2, 'preview', 'ready') RETURNING id", [p.org, id])).rows[0].id as string;
    const contenu = {
      id: "p1",
      kind: "activity",
      day: 1,
      time: "10:00",
      stop: { id: "p1s", kind: "activity", placeId: textes.placeId, name: textes.etape, start: "10:00", facts: {}, exceptions: [], locked: false },
      category: "museum",
      detour: "Sur le chemin.",
    };
    const proposition = (
      await c.query(
        "INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, content) VALUES ($1, $2, $3, 'preview', 1, 'proposal', 1, '10:00', 'activity', $4) RETURNING id",
        [p.org, id, run, JSON.stringify(contenu)],
      )
    ).rows[0].id as string;
    await c.query("INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind) VALUES ($1, $2, $3, 'preview', 2, 'noOption', 1, '14:00', 'activity')", [p.org, id, run]);
    await c.query(
      "INSERT INTO preference_signals (organization_id, trip_id, request_id, place_id, category, signal, origin, proposal_id) VALUES ($1, $2, $3, $4, 'museum', 'like', 'gesture', $5)",
      [p.org, id, randomUUID(), textes.placeId, proposition],
    );
    await c.query("INSERT INTO deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', 2, $4)", [p.org, id, run, randomUUID()]);
    await c.query(`INSERT INTO checklist_items (organization_id, trip_id, kind, label, moment, booking_url) VALUES ($1, $2, 'reservation', 'Château', '{"type": "beforeDeparture"}', 'https://exemple.test/reserver')`, [p.org, id]);
    await c.query("INSERT INTO feedback (organization_id, trip_id, target_stop_id, place_id, reason, scope, created_by) VALUES ($1, $2, 's1', $3, 'closed', 'stop', $4)", [p.org, id, textes.placeId, p.user]);
    for (const [stopId, avis] of [["s1", "liked"], ["s2", "notDone"]] as const) {
      await c.query("INSERT INTO stop_reviews (organization_id, trip_id, stop_id, place_id, opinion, created_by, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [p.org, id, stopId, textes.placeId, avis, p.user, randomUUID()]);
    }
    await c.query("INSERT INTO preferences (organization_id, user_id, subject_kind, category, direction, origin, source_trip_id) VALUES ($1, $2, 'category', 'museum', 'more', 'confirmed', $3)", [p.org, p.user, id]);
    await c.query("INSERT INTO reminder_consents (organization_id, trip_id, user_id) VALUES ($1, $2, $3)", [p.org, id, p.user]);
    await c.query("INSERT INTO reminder_sends (organization_id, trip_id, user_id, day_index) VALUES ($1, $2, $3, 1)", [p.org, id, p.user]);
    await c.query("UPDATE reminder_consents SET withdrawn_at = now() WHERE organization_id = $1 AND trip_id = $2 AND user_id = $3", [p.org, id, p.user]);
    await c.query("INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 days')", [p.org, id, randomBytes(32), p.user]);
    await c.query(
      "INSERT INTO checkouts (organization_id, trip_id, request_id, stripe_checkout_session_id, price_variant, amount_cents, currency, method, created_by) VALUES ($1, $2, $3, $4, 'chf_29', 2900, 'CHF', 'twint', $5)",
      [p.org, id, randomUUID(), `cs_test_SENTINELLE_${randomUUID()}`, p.user],
    );
    await c.query("INSERT INTO usage_ledger (organization_id, trip_id, step, provider, sku, units, cost_estimate_micros) VALUES ($1, $2, 'forfait', 'google', 'test', 1, 10)", [p.org, id]);
    await c.query("SELECT public.store_place_coordinates($1, $2, $3)", [textes.placeId, LAT, LNG]);
    return id;
  });
  await inTx(
    client,
    ctx,
    async (c) => {
      const billing = (
        await c.query("INSERT INTO billing (organization_id, stripe_event_id, type, livemode, outcome) VALUES ($1, $2, 'checkout.session.completed', false, 'granted') RETURNING id", [p.org, `evt_${randomUUID()}`])
      ).rows[0].id as string;
      await c.query("INSERT INTO entitlements (organization_id, trip_id, kind, billing_id) VALUES ($1, $2, 'tripUnlocked', $3)", [p.org, trip, billing]);
      await c.query("UPDATE checkouts SET status = 'succeeded', updated_at = now() WHERE organization_id = $1 AND trip_id = $2", [p.org, trip]);
    },
    "vadrouille_webhook",
  );
  return trip;
}

/** Route réelle : session de Better Auth (cookie du banc), contrôle sur `sessions.created_at`, horloge injectée. */
function routeReelle(banc: Banc, maintenant: () => Date, surcharges: Partial<DependancesExport> = {}) {
  return creerRouteExport({
    adaptateur: () => "api",
    session: (request) => banc.operations.readSession(new Headers({ cookie: request.headers.get("cookie") ?? "" })),
    organisationAdmise: cas.organisationAdmise,
    connexionRecente: creerControleConnexionRecente((id) => banc.operations.readSessionCreatedAt(id)),
    limiteur: async () => ({ ok: true }),
    construire: cas.construire,
    maintenant,
    ...surcharges,
  });
}

const demande = (banc: Banc) => new Request("http://127.0.0.1:3999/api/v1/compte/export", { headers: banc.enTetes() });

async function exporter(maintenant = new Date(creeeLe.getTime() + 60_000)): Promise<{ texte: string; fichier: AccountExport }> {
  const reponse = await routeReelle(bancSamuel, () => maintenant)(demande(bancSamuel));
  expect(reponse.status).toBe(200);
  const texte = await reponse.text();
  return { texte, fichier: AccountExportSchema.parse(JSON.parse(texte)) };
}

/** Empreinte des lignes d'une organisation (connexion d'administration), pour prouver qu'aucune n'a changé. */
const TABLES_EMPREINTE = [
  "trips", "briefs", "stays", "trip_commitments", "trip_versions", "generation_runs", "proposals", "preference_signals", "deck_closures",
  "checklist_items", "feedback", "stop_reviews", "preferences", "reminder_consents", "reminder_sends", "share_links", "checkouts",
  "billing", "entitlements", "usage_ledger", "place_coordinates", "memberships",
];
async function empreinte(org: string, user: string): Promise<Record<string, string>> {
  const resultat: Record<string, string> = {};
  for (const table of TABLES_EMPREINTE) {
    const { rows } = await admin.query(`SELECT count(*)::text || ':' || coalesce(md5(string_agg(t::text, ',' ORDER BY t::text)), '') AS e FROM public.${table} t WHERE organization_id = $1`, [org]);
    resultat[table] = rows[0].e as string;
  }
  for (const [table, colonne] of [["users", "id"], ["organizations", "id"]] as const) {
    const { rows } = await admin.query(`SELECT md5(t::text) AS e FROM public.${table} t WHERE ${colonne} = $1`, [table === "users" ? user : org]);
    resultat[table] = rows[0].e as string;
  }
  return resultat;
}

beforeAll(async () => {
  admin = await connect("admin");
  auth = await connect("auth");
  client = await connect("app");
  // Samuel : vrai compte, ouvert par un code (organisation personnelle créée par la connexion, adhésion `owner`).
  bancSamuel = preparerBanc();
  const email = adresse("samuel-m9a");
  const ouverte = await connecter(bancSamuel, email);
  sessionSamuel = { sessionId: ouverte.sessionId, userId: ouverte.userId, organizationId: ouverte.organizationId, role: ouverte.role };
  samuel = { email, org: ouverte.organizationId, user: ouverte.userId, trip: "", ctx: { organizationId: ouverte.organizationId, userId: ouverte.userId, role: "owner" } };
  samuel.trip = await peupler(samuel, { destination: "Édimbourg", recit: "Un long week-end à Édimbourg", etape: "Château d'Édimbourg", placeId: PLACE_SAMUEL });
  creeeLe = new Date(Number((await auth.query("SELECT (extract(epoch FROM created_at) * 1000)::float8 AS ms FROM sessions WHERE id = $1", [ouverte.sessionId])).rows[0].ms));
  // Léa : seconde organisation, mêmes tables, sentinelles.
  const baseLea = await createOrg(auth);
  lea = { email: canonique(baseLea.email), org: baseLea.org, user: baseLea.owner, trip: "", ctx: { organizationId: baseLea.org, userId: baseLea.owner, role: "owner" } };
  lea.trip = await peupler(lea, LEA);
});

afterAll(async () => {
  await bancSamuel.fermer();
  await app.$client.end();
  await closeAll();
});

describe("compte: export et suppression exigent une réauthentification récente", () => {
  it("export : connexion de plus de 10 minutes → reauthentication_required, rien lu ; juste après un code → export rendu (bornes 9 min 59 s et 10 min 00 s)", async () => {
    // Prolongation de la session (Better Auth, `updateSession`) : `created_at` ne bouge pas.
    await bancSamuel.operations.readSession(bancSamuel.enTetes());
    expect(await bancSamuel.operations.readSessionCreatedAt(sessionSamuel.sessionId)).toEqual(creeeLe);

    journal.length = 0;
    const tard = await routeReelle(bancSamuel, () => new Date(creeeLe.getTime() + 600_000))(demande(bancSamuel));
    expect(tard.status).toBe(401);
    expect(await tard.json()).toEqual({ code: "reauthentication_required" });
    // Seule la vérification d'accès (organisation personnelle) a été lue, aucune donnée de l'export.
    expect(journal.every((texte) => texte === REQUETES_EXPORT.adhesions || texte === REQUETES_EXPORT.organisation)).toBe(true);
    expect(journal).not.toContain(REQUETES_EXPORT.compte);
    expect(journal).not.toContain(REQUETES_EXPORT.voyages);

    const juste = await routeReelle(bancSamuel, () => new Date(creeeLe.getTime() + 599_000))(demande(bancSamuel));
    expect(juste.status).toBe(200);
    expect(AccountExportSchema.parse(JSON.parse(await juste.text())).account.email).toBe(samuel.email);

    // Un nouveau code ouvre une nouvelle session : la mesure repart de sa création.
    const banc = preparerBanc();
    try {
      const nouvelle = await connecter(banc, samuel.email);
      expect(nouvelle.sessionId).not.toBe(sessionSamuel.sessionId);
      const creeeNouvelle = await banc.operations.readSessionCreatedAt(nouvelle.sessionId);
      expect(creeeNouvelle).not.toBeNull();
      expect((creeeNouvelle as Date).getTime()).toBeGreaterThanOrEqual(creeeLe.getTime());
      const apres = await routeReelle(banc, () => new Date((creeeNouvelle as Date).getTime() + 1_000))(demande(banc));
      expect(apres.status).toBe(200);
      // Session inconnue ou close : jamais récente.
      expect(await banc.operations.readSessionCreatedAt(randomUUID())).toBeNull();
      expect((await banc.operations.signOut(banc.enTetes())).ok).toBe(true);
      expect(await banc.operations.readSessionCreatedAt(nouvelle.sessionId)).toBeNull();
    } finally {
      await banc.fermer();
    }
  });
});

describe("compte: export (M9a, critères 1 à 6 et 8)", () => {
  it("critère 1 : sans session unauthenticated ; conseiller forbidden ; organisation à deux membres forbidden ; rien lu", async () => {
    const maintenant = () => new Date(creeeLe.getTime() + 60_000);
    journal.length = 0;
    const sans = await routeReelle(bancSamuel, maintenant)(new Request("http://127.0.0.1:3999/api/v1/compte/export"));
    expect(sans.status).toBe(401);
    expect(await sans.json()).toEqual({ code: "unauthenticated" });
    expect(journal).toEqual([]);

    const partagee = await createOrg(auth, 1);
    const recente = { connexionRecente: async () => true };
    // Conseiller (adhésion `member`) : refusé sur son rôle, avant toute lecture.
    const conseiller = await routeReelle(bancSamuel, maintenant, { ...recente, session: async () => ({ sessionId: randomUUID(), userId: partagee.members[0] ?? "", organizationId: partagee.org, role: "member" }) })(demande(bancSamuel));
    expect(conseiller.status).toBe(403);
    expect(await conseiller.json()).toEqual({ code: "forbidden" });
    expect(journal).toEqual([]);
    // Propriétaire d'une organisation à deux membres : la vérification d'accès seule est lue.
    const proprietaire = await routeReelle(bancSamuel, maintenant, { ...recente, session: async () => ({ sessionId: randomUUID(), userId: partagee.owner, organizationId: partagee.org, role: "owner" }) })(demande(bancSamuel));
    expect(proprietaire.status).toBe(403);
    expect(await proprietaire.json()).toEqual({ code: "forbidden" });
    expect(journal.every((texte) => texte === REQUETES_EXPORT.adhesions)).toBe(true);
    // Et le cas d'usage lui-même refuse, sans lire autre chose (organisation devenue partagée après la vérification).
    journal.length = 0;
    expect(await cas.construire({ organizationId: partagee.org, userId: partagee.owner }, new Date())).toEqual({ ok: false, code: "forbidden" });
    expect(journal).toEqual([REQUETES_EXPORT.adhesions]);
  });

  it("critère 3 : le fichier valide AccountExportSchema (strict) et contient les blocs du § 3.2 de l'exemple commun", async () => {
    const { fichier, texte } = await exporter();
    expect(fichier.format).toBe("vadrouille-export");
    expect(fichier.version).toBe(1);
    expect(fichier.account.email).toBe(samuel.email);
    expect(fichier.trips).toHaveLength(1);
    const voyage = fichier.trips[0];
    if (voyage === undefined) throw new Error("voyage absent");
    expect(voyage).toMatchObject({
      id: samuel.trip,
      destination: "Édimbourg",
      startDate: "2026-08-29",
      endDate: "2026-09-03",
      timeZone: "Europe/London",
      travellers: { adults: 2, children: 1 },
      status: "active",
      unlocked: true,
      currentVersion: 3,
    });
    expect(voyage.briefs).toEqual([expect.objectContaining({ version: 1, story: "Un long week-end à Édimbourg", pace: "balanced", wishes: ["museum"] })]);
    expect(voyage.stays).toEqual([expect.objectContaining({ kind: "lodging", lodgingKind: "area", label: "Hôtel Balmoral", placeId: PLACE_SAMUEL })]);
    expect(voyage.commitments).toEqual([{ kind: "flight", label: "Vol LX 460", date: "2026-08-29", startTime: "07:10", endTime: "08:05" }]);
    expect(voyage.versions.map((v) => [v.version, v.parentVersion])).toEqual([[1, null], [2, 1], [3, 2]]);
    expect(JSON.stringify(voyage.versions[2]?.days)).toContain("Château d'Édimbourg");
    expect(voyage.deck.proposals).toEqual([{ phase: "preview", position: 1, day: 1, time: "10:00", kind: "activity", name: "Château d'Édimbourg", category: "museum", placeId: PLACE_SAMUEL }]);
    expect(voyage.deck.gestures).toEqual([expect.objectContaining({ signal: "like", category: "museum", placeId: PLACE_SAMUEL, status: "confirmed", cancelledAt: null })]);
    expect(voyage.deck.closures).toEqual([expect.objectContaining({ phase: "preview", throughPosition: 2 })]);
    expect(voyage.checklist).toEqual([{ label: "Château", moment: { type: "beforeDeparture" }, done: false, bookingUrl: "https://exemple.test/reserver" }]);
    expect(voyage.reports).toEqual([expect.objectContaining({ stopId: "s1", placeId: PLACE_SAMUEL, reason: "closed" })]);
    expect(voyage.reviews.map((r) => [r.stopId, r.opinion])).toEqual([["s1", "liked"], ["s2", "notDone"]]);
    expect(voyage.reminders.consents).toHaveLength(1);
    expect(voyage.reminders.consents[0]?.withdrawnAt).toEqual(expect.any(String));
    expect(voyage.reminders.sends).toEqual([expect.objectContaining({ dayIndex: 1 })]);
    expect(voyage.shareLinks).toEqual([expect.objectContaining({ revokedAt: null })]);
    expect(voyage.payments).toEqual([expect.objectContaining({ method: "twint", amountCents: 2900, currency: "CHF", status: "succeeded" })]);
    expect(voyage.entitlements).toEqual([expect.objectContaining({ kind: "tripUnlocked" })]);
    expect(fichier.tastes).toEqual([expect.objectContaining({ subjectKind: "category", category: "museum", direction: "more", origin: "confirmed", sourceTripId: samuel.trip })]);
    // Format : JSON indenté de 2 espaces, instants en UTC.
    expect(texte.startsWith('{\n  "format": "vadrouille-export",\n  "version": 1,\n')).toBe(true);
    expect(fichier.exportedAt.endsWith("Z")).toBe(true);
  });

  it("critère 4 : aucune donnée de Léa (destination, récit, nom d'étape, placeId) ni identifiant d'un autre utilisateur", async () => {
    const { texte } = await exporter();
    for (const sentinelle of [...Object.values(LEA), lea.user, lea.org, lea.trip, lea.email]) expect(texte, sentinelle).not.toContain(sentinelle);
    // Ni l'identifiant de la personne, ni celui de son organisation, ni celui de sa session.
    for (const identifiant of [samuel.user, samuel.org, sessionSamuel.sessionId]) expect(texte).not.toContain(identifiant);
  });

  it("critère 5 : aucune donnée Google hors placeId ; doubles de Places et Routes jamais appelés", async () => {
    const places = doubleGoogle();
    const routes = doubleGoogle();
    // Les doubles rendent les sentinelles quand on les appelle (contrôle du double lui-même) …
    expect(JSON.stringify(await places.client.ficheLieu?.())).toContain(NOM_GOOGLE);
    places.appels.length = 0;
    const reseau = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Promise.reject(new Error("réseau interdit")));
    try {
      // … et la ligne `place_coordinates` aux mêmes coordonnées existe bien pour Samuel.
      const coords = await inTx(client, { org: samuel.org, user: samuel.user }, async (c) => (await c.query("SELECT lat, lng FROM public.place_coordinates WHERE place_id = $1", [PLACE_SAMUEL])).rows);
      expect(coords).toEqual([{ lat: LAT, lng: LNG }]);
      const { texte } = await exporter();
      for (const sentinelle of SENTINELLES_GOOGLE) expect(texte, sentinelle).not.toContain(sentinelle);
      expect(texte).toContain(PLACE_SAMUEL);
      expect(places.appels).toEqual([]);
      expect(routes.appels).toEqual([]);
      expect(reseau).not.toHaveBeenCalled();
    } finally {
      reseau.mockRestore();
    }
  });

  it("critère 6 : aucune clé exclue du § 3.2 à aucun niveau (parcours récursif des clés)", async () => {
    const { texte } = await exporter();
    const cles = new Set(accountExportKeys(JSON.parse(texte)));
    for (const interdite of ACCOUNT_EXPORT_FORBIDDEN_KEYS) expect(cles.has(interdite), interdite).toBe(false);
    // Les valeurs non plus : ni identifiant Stripe, ni empreinte de jeton.
    expect(texte).not.toContain("cs_test_SENTINELLE");
    expect(texte).not.toContain("\\\\x");
  });

  it("critère 8 : rien n'est écrit en base ; deux exports successifs identiques hormis exportedAt ; transaction en lecture seule", async () => {
    const avant = await empreinte(samuel.org, samuel.user);
    const premier = await exporter(new Date(creeeLe.getTime() + 60_000));
    const second = await exporter(new Date(creeeLe.getTime() + 120_000));
    expect(await empreinte(samuel.org, samuel.user)).toEqual(avant);
    expect(premier.fichier.exportedAt).not.toBe(second.fichier.exportedAt);
    expect({ ...premier.fichier, exportedAt: "" }).toEqual({ ...second.fichier, exportedAt: "" });
    expect(serialiserExport({ ...premier.fichier, exportedAt: "" })).toBe(serialiserExport({ ...second.fichier, exportedAt: "" }));
    // La transaction de l'export refuse toute écriture (SQLSTATE 25006, read_only_sql_transaction).
    const ecrire = (executeur: ExecuteurExport) => executeur.query("UPDATE trips SET status = 'archived' WHERE id = $1", [samuel.trip]);
    const erreur = await transactionExportSur(withOrgTest)(samuel.ctx, ecrire).then(
      () => undefined,
      (e: unknown) => e as { code?: string; cause?: { code?: string } },
    );
    expect(erreur?.code ?? erreur?.cause?.code).toBe("25006");
    expect(await empreinte(samuel.org, samuel.user)).toEqual(avant);
  });
});

describe("journaux", () => {
  it("journaux: aucun email ni code dans les journaux (export du compte, M9a)", async () => {
    const espions = [
      ...(["log", "info", "warn", "error", "debug"] as const).map((methode) => vi.spyOn(console, methode)),
      vi.spyOn(process.stdout, "write"),
      vi.spyOn(process.stderr, "write"),
    ];
    const banc = preparerBanc();
    const codes: string[] = [];
    let jeton: string | undefined;
    try {
      // Nouveau code (réauthentification) : un faux, puis le bon ; export rendu, puis refusé (connexion ancienne).
      const code = await demanderCode(banc, samuel.email);
      codes.push(code, codeFaux(code));
      expect(await banc.operations.verifyCode({ email: samuel.email, code: codeFaux(code) })).toEqual({ ok: false, code: "invalid_code" });
      const ouverte = await banc.operations.verifyCode({ email: samuel.email, code });
      if (!ouverte.ok) throw new Error("verifyCode refusé");
      jeton = jetonDuCookie(banc);
      const creee = (await banc.operations.readSessionCreatedAt(ouverte.sessionId)) ?? new Date();
      expect((await routeReelle(banc, () => new Date(creee.getTime() + 1_000))(demande(banc))).status).toBe(200);
      expect((await routeReelle(banc, () => new Date(creee.getTime() + 600_000))(demande(banc))).status).toBe(401);
      // Export en échec (erreur dont le message porte l'adresse et la destination) : une ligne sans valeur.
      const panne = Object.assign(new Error(`${samuel.email} Édimbourg Château d'Édimbourg`), { name: "DatabaseError" });
      expect((await routeReelle(banc, () => new Date(creee.getTime() + 1_000), { construire: async () => Promise.reject(panne) })(demande(banc))).status).toBe(500);
      const ecrit = espions.flatMap((espion) => espion.mock.calls.flat()).map(String).join("\n");
      expect(ecrit).toContain("compte.export_failed");
      for (const interdit of [samuel.email, samuel.email.toUpperCase(), ...codes, "Édimbourg", "Château d'Édimbourg", "Un long week-end", PLACE_SAMUEL, samuel.trip, ...(jeton === undefined ? [] : [jeton])]) {
        expect(ecrit, interdit).not.toContain(interdit);
      }
      expect(jeton).toBeDefined();
    } finally {
      for (const espion of espions) espion.mockRestore();
      await banc.fermer();
    }
  });
});
