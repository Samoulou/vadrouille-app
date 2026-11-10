import { createHash, randomBytes, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  ACTION_LIMITEUR_SUPPRESSION,
  creerSuppressionCompte,
  type DependancesActionSuppression,
  identifiantDeVerification,
  type PortsSuppression,
  portsSuppressionSur,
  type SessionSuppression,
  type SuppressionCompte,
  supprimerMonCompte,
} from "@/server/account/delete";
import { creerControleConnexionRecente } from "@/server/account/reauthentification";
import { RATE_LIMITS } from "@/server/config/limites";
import { type CanonicalEmail } from "@/server/email";
import type { NotificationMailer } from "@/server/mail/port";
import { reveillerRappel } from "@/server/rappels/envoi";
import type { EtatRappel } from "@/server/rappels/etat";
import { reclamerRelais } from "@/server/rappels/relais";
import { clesDeLaPersonne, createRateLimiter } from "@/server/rate-limit";
import { creerContexteServeur } from "@/server/session";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { adresse, type Banc, canonique, connecter, demanderCode, preparerBanc, URL_APPLICATION } from "./auth-outils";
import { closeAll, connect, createOrg, type DbClient, insertSql, inTx, SNAPSHOT } from "./helpers";

/**
 * « Supprimer mon compte » en base (spécification M9 § 6.3, critères 1 à 11 ; handover § 12 ; ticket 1106, M9b) :
 * le cas d'usage réel de `src/server/account/delete.ts` sur les rôles prévus (`vadrouille_app` puis
 * `vadrouille_account_admin` pour la purge, `vadrouille_auth` pour l'authentification, `vadrouille_limiter` pour le
 * limiteur), le cœur réel de l'action avec la session de Better Auth, et la reprise réelle de `verifyCode`
 * (`src/server/auth/reprise.ts`, branchée sur le cas d'usage du banc). Seuls l'horloge du contrôle de connexion récente
 * (critère 1) et les pannes (critère 4) sont injectés. Option A de Q48 : `billing` et `usage_ledger` restent. Critère 7
 * (rappels) : le vrai code de réclamation du relais et du réveil (`src/server/rappels`, décision 0162) sur la base, avec
 * un transport de capture ; la partie Mailpit de bout en bout (exécution durable réelle) est le ticket de suite 1118
 * (dépendance M9c).
 *
 * Exemple commun (§ 6) : Samuel, connecté par un vrai code, organisation personnelle ; voyage d'Édimbourg débloqué, trois
 * versions, tri avec gestes, deux avis, un goût retenu, un accord aux rappels, un lien privé, un paiement `succeeded`, une
 * ligne `billing`, une ligne `usage_ledger` et une ligne `place_coordinates` ; une seconde organisation (Léa) remplie de
 * même. Chaque test qui supprime ouvre son propre compte de Samuel ; Léa est commune et doit rester intacte.
 */

const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
const SECRET = randomBytes(32);
const ENV = { VADROUILLE_ENV: "ci", [HMAC]: SECRET.toString("base64url") };

const app = createDatabase("vadrouille_app");
const poolAuth = createDatabase("vadrouille_auth");
const limiteur = createRateLimiter({ pool: app.$client, env: ENV, config: RATE_LIMITS });
const portsReels = portsSuppressionSur({ auth: poolAuth.$client, avecOrg: creerWithOrg(app), oublier: (personne) => limiteur.oublier(personne) });
const compte = creerSuppressionCompte(portsReels);

/** Ports réels, avec une panne tenace avant le port nommé tant que `panne.avant` le désigne. */
const panne: { avant: keyof PortsSuppression | null } = { avant: null };
class PanneInjecteeError extends Error {
  override name = "PanneInjecteeError";
}
const portsAvecPanne = Object.fromEntries(
  (Object.keys(portsReels) as (keyof PortsSuppression)[]).map((nom) => [
    nom,
    (...args: unknown[]) => {
      if (panne.avant === nom) throw new PanneInjecteeError("panne injectée");
      return (portsReels[nom] as (...a: unknown[]) => unknown)(...args);
    },
  ]),
) as PortsSuppression;
const compteAvecPanne = creerSuppressionCompte(portsAvecPanne);

type Personne = { email: CanonicalEmail; org: string; user: string };
type Compte = Personne & { banc: Banc; session: SessionSuppression; creeeLe: Date; trip: string; jeton: Buffer };

let admin: DbClient;
let auth: DbClient;
let client: DbClient;
let lea: Personne & { trip: string };
const bancs: Banc[] = [];

const sha256 = (octets: Buffer) => createHash("sha256").update(octets).digest();

/** Banc dont la reprise de `verifyCode` passe par le cas d'usage du test (mêmes pools, même limiteur). */
function nouveauBanc(cas: SuppressionCompte = compte): Banc {
  const banc = preparerBanc({ reprise: (userId) => cas.reprendre(userId) });
  bancs.push(banc);
  return banc;
}

/** Exemple commun dans l'organisation `p`, écrit par les rôles prévus ; `jeton` : jeton en clair du lien privé. */
async function peupler(p: Personne, destination: string, placeId: string, jeton: Buffer, paiement: "succeeded" | "pending" = "succeeded"): Promise<string> {
  const ctx = { org: p.org, user: p.user };
  const instantane = JSON.stringify({ days: [{ index: 1, date: "2026-08-29", items: [], events: [] }] });
  const trip = await inTx(client, ctx, async (c) => {
    const id = (
      await c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, travellers_children, time_zone) VALUES ($1, $2, $3, $4, '2026-08-29', '2026-09-03', 2, 0, 'Europe/London') RETURNING id",
        [p.org, p.user, randomUUID(), destination],
      )
    ).rows[0].id as string;
    await c.query("INSERT INTO briefs (organization_id, trip_id, version, story, pace, wishes) VALUES ($1, $2, 1, 'Un long week-end', 'balanced', '{museum}')", [p.org, id]);
    await c.query(
      `INSERT INTO stays (organization_id, trip_id, kind, place_id, label, from_date, to_date, lodging_kind, area_center_lat, area_center_lng, area_radius_m)
       VALUES ($1, $2, 'lodging', $3, 'Hôtel Balmoral', '2026-08-29', '2026-09-03', 'area', 55.9486, -3.1999, 500)`,
      [p.org, id, placeId],
    );
    for (const version of [1, 2, 3]) {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind) VALUES ($1, $2, $3, $4, $5, $6, 'engine')",
        [p.org, id, version, version === 1 ? null : version - 1, randomUUID(), instantane],
      );
    }
    await c.query("UPDATE trips SET current_version = 3 WHERE id = $1", [id]);
    const run = (await c.query("INSERT INTO generation_runs (organization_id, trip_id, kind, phase) VALUES ($1, $2, 'preview', 'ready') RETURNING id", [p.org, id])).rows[0].id as string;
    const proposition = (
      await c.query(
        "INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind) VALUES ($1, $2, $3, 'preview', 1, 'noOption', 1, '10:00', 'activity') RETURNING id",
        [p.org, id, run],
      )
    ).rows[0].id as string;
    await c.query(
      "INSERT INTO preference_signals (organization_id, trip_id, request_id, place_id, category, signal, origin, proposal_id) VALUES ($1, $2, $3, $4, 'museum', 'like', 'gesture', $5)",
      [p.org, id, randomUUID(), placeId, proposition],
    );
    for (const [stopId, avis] of [["s1", "liked"], ["s2", "notDone"]] as const) {
      await c.query("INSERT INTO stop_reviews (organization_id, trip_id, stop_id, place_id, opinion, created_by, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7)", [p.org, id, stopId, placeId, avis, p.user, randomUUID()]);
    }
    await c.query("INSERT INTO preferences (organization_id, user_id, subject_kind, category, direction, origin, source_trip_id) VALUES ($1, $2, 'category', 'museum', 'more', 'confirmed', $3)", [p.org, p.user, id]);
    await c.query("INSERT INTO reminder_consents (organization_id, trip_id, user_id) VALUES ($1, $2, $3)", [p.org, id, p.user]);
    await c.query("INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 days')", [p.org, id, sha256(jeton), p.user]);
    await c.query(
      "INSERT INTO checkouts (organization_id, trip_id, request_id, stripe_checkout_session_id, price_variant, amount_cents, currency, method, created_by) VALUES ($1, $2, $3, $4, 'chf_29', 2900, 'CHF', 'twint', $5)",
      [p.org, id, randomUUID(), `cs_test_m9b_${randomUUID()}`, p.user],
    );
    await c.query("INSERT INTO usage_ledger (organization_id, trip_id, step, provider, sku, units, cost_estimate_micros) VALUES ($1, $2, 'forfait', 'google', 'test', 1, 10)", [p.org, id]);
    await c.query("SELECT public.store_place_coordinates($1, $2, $3)", [placeId, 55.9486, -3.1999]);
    return id;
  });
  if (paiement === "succeeded") {
    await inTx(
      client,
      ctx,
      async (c) => {
        const billing = (
          await c.query("INSERT INTO billing (organization_id, stripe_event_id, type, livemode, outcome) VALUES ($1, $2, 'checkoutCompleted', false, 'granted') RETURNING id", [p.org, `evt_${randomUUID()}`])
        ).rows[0].id as string;
        await c.query("INSERT INTO entitlements (organization_id, trip_id, kind, billing_id) VALUES ($1, $2, 'tripUnlocked', $3)", [p.org, trip, billing]);
        await c.query("UPDATE checkouts SET status = 'succeeded', updated_at = now() WHERE organization_id = $1 AND trip_id = $2", [p.org, trip]);
      },
      "vadrouille_webhook",
    );
  }
  return trip;
}

/** Nouveau compte de Samuel, ouvert par un vrai code, avec l'exemple commun. */
async function ouvrirCompte(paiement: "succeeded" | "pending" = "succeeded", cas: SuppressionCompte = compte): Promise<Compte> {
  const banc = nouveauBanc(cas);
  const email = adresse("samuel-m9b");
  const ouverte = await connecter(banc, email);
  const personne = { email, org: ouverte.organizationId, user: ouverte.userId };
  const jeton = randomBytes(32);
  const trip = await peupler(personne, "Édimbourg", `ChIJ-m9b-${randomUUID()}`, jeton, paiement);
  const creeeLe = await banc.operations.readSessionCreatedAt(ouverte.sessionId);
  if (creeeLe === null) throw new Error("session sans instant de création");
  return { ...personne, banc, session: { sessionId: ouverte.sessionId, userId: ouverte.userId, organizationId: ouverte.organizationId, role: ouverte.role }, creeeLe, trip, jeton };
}

/** Cœur réel de l'action sur la session du banc ; horloge une minute après le code, limiteur réel, sauf surcharges. */
function action(c: Compte, surcharges: Partial<DependancesActionSuppression> = {}) {
  return supprimerMonCompte({
    disponible: () => true,
    session: () => c.banc.operations.readSession(new Headers({ cookie: c.banc.enTetes().get("cookie") ?? "" })),
    connexionRecente: creerControleConnexionRecente((id) => c.banc.operations.readSessionCreatedAt(id)),
    limiteur: (userId) => limiteur.verdict({ action: ACTION_LIMITEUR_SUPPRESSION, headers: new Headers(), userId }),
    compte,
    maintenant: () => new Date(c.creeeLe.getTime() + 60_000),
    effacerCookie: async () => {
      await c.banc.operations.signOut(c.banc.enTetes());
    },
    ...surcharges,
  });
}

/** Tables par organisation purgées avec le compte, puis celles que l'option A de Q48 garde. */
const TABLES_PURGEES = [
  "trips", "briefs", "stays", "trip_commitments", "trip_versions", "generation_runs", "research_runs", "candidates", "event_occurrences",
  "proposals", "preference_signals", "preference_prompts", "deck_closures", "checklist_items", "feedback", "stop_reviews", "preferences",
  "reminder_consents", "reminder_sends", "reminder_relays", "share_links", "checkouts", "entitlements", "place_coordinates",
];
const TABLES_GARDEES = ["billing", "usage_ledger"];

async function comptes(org: string, tables: readonly string[]): Promise<Record<string, number>> {
  const resultat: Record<string, number> = {};
  for (const table of tables) resultat[table] = Number((await admin.query(`SELECT count(*)::int AS n FROM public.${table} WHERE organization_id = $1`, [org])).rows[0].n);
  return resultat;
}

/** Empreinte des lignes d'une organisation et de sa personne (connexion d'administration) : aucune ne doit changer. */
async function empreinte(p: Personne): Promise<Record<string, string>> {
  const resultat: Record<string, string> = {};
  for (const table of [...TABLES_PURGEES, ...TABLES_GARDEES, "memberships"]) {
    const { rows } = await admin.query(`SELECT count(*)::text || ':' || coalesce(md5(string_agg(t::text, ',' ORDER BY t::text)), '') AS e FROM public.${table} t WHERE organization_id = $1`, [p.org]);
    resultat[table] = rows[0].e as string;
  }
  for (const [nom, requete, valeur] of [
    ["users", "SELECT md5(t::text) AS e FROM public.users t WHERE id = $1", p.user],
    ["organizations", "SELECT md5(t::text) AS e FROM public.organizations t WHERE id = $1", p.org],
    ["sessions", "SELECT count(*)::text AS e FROM public.sessions WHERE user_id = $1", p.user],
    ["verifications", "SELECT count(*)::text AS e FROM public.verifications WHERE identifier = $1", identifiantDeVerification(p.email)],
  ] as const) {
    resultat[nom] = (await admin.query(requete, [valeur])).rows[0]?.e as string;
  }
  return resultat;
}

async function authentification(p: Personne): Promise<Record<string, number>> {
  const un = async (requete: string, valeur: string) => Number((await admin.query(requete, [valeur])).rows[0].n);
  return {
    sessions: await un("SELECT count(*)::int AS n FROM sessions WHERE user_id = $1", p.user),
    accounts: await un("SELECT count(*)::int AS n FROM accounts WHERE user_id = $1", p.user),
    verifications: await un("SELECT count(*)::int AS n FROM verifications WHERE identifier = $1", identifiantDeVerification(p.email)),
    memberships: await un("SELECT count(*)::int AS n FROM memberships WHERE user_id = $1", p.user),
    users: await un("SELECT count(*)::int AS n FROM users WHERE id = $1", p.user),
  };
}
const AUCUNE = { sessions: 0, accounts: 0, verifications: 0, memberships: 0, users: 0 };

async function organisation(org: string): Promise<{ existe: boolean; enSuppression: boolean; adhesions: number }> {
  const { rows } = await admin.query(
    "SELECT o.deletion_requested_at IS NOT NULL AS en_suppression, (SELECT count(*)::int FROM memberships m WHERE m.organization_id = o.id) AS adhesions FROM organizations o WHERE o.id = $1",
    [org],
  );
  return { existe: rows.length === 1, enSuppression: rows[0]?.en_suppression === true, adhesions: Number(rows[0]?.adhesions ?? 0) };
}

async function entreesLimiteur(p: Personne): Promise<number> {
  const cles = clesDeLaPersonne(SECRET, RATE_LIMITS, { email: p.email, userId: p.user });
  return Number((await admin.query("SELECT count(*)::int AS n FROM action_rate_limits WHERE key = ANY($1::text[])", [cles])).rows[0].n);
}

/** Entrées du limiteur de la personne : une par adresse (`request-code`), une par identifiant (`export`). */
async function compterAuLimiteur(p: Personne): Promise<void> {
  expect((await limiteur.verdict({ action: "request-code", headers: new Headers(), email: p.email })).ok).toBe(true);
  expect((await limiteur.verdict({ action: "export", headers: new Headers(), userId: p.user })).ok).toBe(true);
}

/** Réponse du lien privé : lignes de `resolve_share_link` pour le jeton (aucune : lien inconnu). */
async function lienPrive(jeton: Buffer): Promise<unknown[]> {
  return inTx(client, {}, async (c) => (await c.query("SELECT * FROM resolve_share_link($1)", [sha256(jeton)])).rows);
}

beforeAll(async () => {
  admin = await connect("admin");
  auth = await connect("auth");
  client = await connect("app");
  const baseLea = await createOrg(auth);
  const personne = { email: canonique(baseLea.email), org: baseLea.org, user: baseLea.owner };
  lea = { ...personne, trip: await peupler(personne, "Lisbonne", `ChIJ-m9b-lea-${randomUUID()}`, randomBytes(32)) };
  await compterAuLimiteur(lea);
});

afterEach(() => {
  panne.avant = null;
  vi.restoreAllMocks();
});

afterAll(async () => {
  await Promise.all(bancs.map((banc) => banc.fermer()));
  await app.$client.end();
  await poolAuth.$client.end();
  await closeAll();
});

describe("compte: export et suppression exigent une réauthentification récente", () => {
  it("suppression : connexion de plus de 10 minutes → reauthentication_required, rien supprimé, deletion_requested_at nul ; à 9 min 59 s, suppression faite", async () => {
    const samuel = await ouvrirCompte();
    const avant = await empreinte(samuel);
    const tard = await action(samuel, { maintenant: () => new Date(samuel.creeeLe.getTime() + 600_000) });
    expect(tard).toEqual({ ok: false, error: { code: "reauthentication_required" } });
    expect(await empreinte(samuel)).toEqual(avant);
    expect(await organisation(samuel.org)).toEqual({ existe: true, enSuppression: false, adhesions: 1 });
    // Aucune entrée de la règle `suppression` : le refus ne débite pas le limiteur.
    expect(await entreesLimiteur(samuel)).toBe(0);

    const juste = await action(samuel, { maintenant: () => new Date(samuel.creeeLe.getTime() + 599_000) });
    expect(juste).toEqual({ ok: true, value: { deleted: true } });
    expect(await authentification(samuel)).toEqual(AUCUNE);
  });
});

describe("compte: suppression (M9b, critères 2, 3, 5, 6 et 11)", () => {
  it("compte: la suppression efface les données métier et d'authentification", async () => {
    const samuel = await ouvrirCompte();
    // Deux sessions sur deux appareils, un code en attente pour l'adresse, des entrées du limiteur.
    const second = nouveauBanc();
    const autre = await connecter(second, samuel.email);
    expect(autre.userId).toBe(samuel.user);
    await demanderCode(second, samuel.email);
    await compterAuLimiteur(samuel);
    expect(await authentification(samuel)).toEqual({ sessions: 2, accounts: 0, verifications: 1, memberships: 1, users: 1 });
    expect(await entreesLimiteur(samuel)).toBe(2);
    expect(await lienPrive(samuel.jeton)).toEqual([{ organization_id: samuel.org, trip_id: samuel.trip, state: "valid" }]);
    const avantSamuel = await comptes(samuel.org, [...TABLES_PURGEES, ...TABLES_GARDEES]);
    for (const table of ["trips", "trip_versions", "stop_reviews", "preferences", "reminder_consents", "share_links", "checkouts", "entitlements", "place_coordinates", "billing", "usage_ledger"]) {
      expect(avantSamuel[table], table).toBeGreaterThan(0);
    }
    const gardees = Object.fromEntries(Object.entries(await empreinte(samuel)).filter(([table]) => TABLES_GARDEES.includes(table)));
    const avantLea = await empreinte(lea);
    const limiteurLea = await entreesLimiteur(lea);

    const lignes: string[] = [];
    for (const methode of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    }
    const resultat = await action(samuel);
    vi.restoreAllMocks();
    expect(resultat).toEqual({ ok: true, value: { deleted: true } });
    // Aucune adresse ni identifiant dans les journaux.
    for (const ligne of lignes) for (const interdit of [samuel.email, samuel.user, samuel.org, samuel.session.sessionId]) expect(ligne).not.toContain(interdit);

    // Données métier, `place_coordinates` comprise (migration 0028, critère 3) ; authentification ; limiteur.
    expect(await comptes(samuel.org, TABLES_PURGEES)).toEqual(Object.fromEntries(TABLES_PURGEES.map((table) => [table, 0])));
    expect(await authentification(samuel)).toEqual(AUCUNE);
    expect(await entreesLimiteur(samuel)).toBe(0);
    // Option A de Q48 : `billing` et `usage_ledger` intacts, organisation gardée en suppression, sans adhésion.
    const apres = await empreinte(samuel);
    for (const table of TABLES_GARDEES) expect(apres[table], table).toBe(gardees[table]);
    expect(await organisation(samuel.org)).toEqual({ existe: true, enSuppression: true, adhesions: 0 });
    // Léa intacte, ligne pour ligne, et ses entrées du limiteur aussi.
    expect(await empreinte(lea)).toEqual(avantLea);
    expect(await entreesLimiteur(lea)).toBe(limiteurLea);
    expect(limiteurLea).toBe(2);

    // Critère 11 : le lien privé répond comme un lien inconnu.
    expect(await lienPrive(samuel.jeton)).toEqual([]);
    // Sessions des deux appareils refusées ; second onglet : unauthenticated (§ 4.3 point 2).
    expect(await creerContexteServeur(second.operations)(second.enTetes())).toBeNull();
    expect(await action({ ...samuel, banc: second })).toEqual({ ok: false, error: { code: "unauthenticated" } });

    // Critère 5 : rejouer après la fin, aucune erreur, rien de plus.
    expect(await compte.supprimer({ organizationId: samuel.org, userId: samuel.user })).toEqual({ ok: true, issue: "deja_supprime" });
    await compte.reprendre(samuel.user);
    expect(await organisation(samuel.org)).toEqual({ existe: true, enSuppression: true, adhesions: 0 });
    expect(await empreinte(lea)).toEqual(avantLea);

    // Critère 6 : la même adresse ouvre un compte neuf, sans aucun voyage.
    const neuf = nouveauBanc();
    const ouverte = await connecter(neuf, samuel.email);
    expect(ouverte.userId).not.toBe(samuel.user);
    expect(ouverte.organizationId).not.toBe(samuel.org);
    expect(await comptes(ouverte.organizationId, [...TABLES_PURGEES, ...TABLES_GARDEES])).toEqual(
      Object.fromEntries([...TABLES_PURGEES, ...TABLES_GARDEES].map((table) => [table, 0])),
    );
    expect(await organisation(ouverte.organizationId)).toEqual({ existe: true, enSuppression: false, adhesions: 1 });
  });
});

describe("compte: reprise (M9b, critère 4)", () => {
  it("compte: une suppression interrompue reprend sans erreur ni doublon", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const samuel = await ouvrirCompte("succeeded", compteAvecPanne);
    const ctx = { organizationId: samuel.org, userId: samuel.user };
    const avantLea = await empreinte(lea);

    // Panne entre les étapes 1 et 2 : la purge est validée, rien de l'authentification n'est supprimé.
    panne.avant = "supprimerSessions";
    expect(await action(samuel, { compte: compteAvecPanne })).toEqual({ ok: false, error: { code: "internal", retryable: true } });
    expect(await comptes(samuel.org, TABLES_PURGEES)).toEqual(Object.fromEntries(TABLES_PURGEES.map((table) => [table, 0])));
    expect(await organisation(samuel.org)).toEqual({ existe: true, enSuppression: true, adhesions: 1 });
    expect(await authentification(samuel)).toMatchObject({ sessions: 1, users: 1, memberships: 1 });
    // La session restante est refusée entre-temps.
    expect(await creerContexteServeur(samuel.banc.operations)(samuel.banc.enTetes())).toBeNull();
    expect(await action(samuel, { compte: compteAvecPanne })).toEqual({ ok: false, error: { code: "unauthenticated" } });

    // Panne entre deux suppressions de l'étape 2 : sessions et comptes supprimés, la personne reste.
    panne.avant = "supprimerVerifications";
    await expect(compteAvecPanne.supprimer(ctx)).rejects.toBeInstanceOf(PanneInjecteeError);
    expect(await authentification(samuel)).toMatchObject({ sessions: 0, accounts: 0, users: 1, memberships: 1 });

    // `verifyCode` pour l'adresse, panne toujours là : aucun cookie, `unauthenticated`, la reprise ne lève pas.
    const code = await demanderCode(samuel.banc, samuel.email);
    const cookiesAvant = samuel.banc.setCookies.length;
    expect(await samuel.banc.operations.verifyCode({ email: samuel.email, code })).toEqual({ ok: false, code: "unauthenticated" });
    expect(samuel.banc.setCookies.length).toBe(cookiesAvant);
    expect(await authentification(samuel)).toMatchObject({ sessions: 0, users: 1, memberships: 1 });

    // Panne levée : `verifyCode` reprend l'étape 2 et la termine, sans ouvrir de session.
    panne.avant = null;
    const second = await demanderCode(samuel.banc, samuel.email);
    expect(await samuel.banc.operations.verifyCode({ email: samuel.email, code: second })).toEqual({ ok: false, code: "unauthenticated" });
    expect(samuel.banc.setCookies.length).toBe(cookiesAvant);
    expect(await authentification(samuel)).toEqual(AUCUNE);
    expect(await organisation(samuel.org)).toEqual({ existe: true, enSuppression: true, adhesions: 0 });

    // Une relance de `deleteAccount` termine sans erreur ni doublon.
    expect(await compteAvecPanne.supprimer(ctx)).toEqual({ ok: true, issue: "deja_supprime" });
    expect(await empreinte(lea)).toEqual(avantLea);
  });

  it("après une panne dans l'étape 2, une relance du cas d'usage termine ; une ligne métier écrite entre-temps est purgée", async () => {
    const samuel = await ouvrirCompte("succeeded", compteAvecPanne);
    const ctx = { organizationId: samuel.org, userId: samuel.user };
    panne.avant = "supprimerAdhesionsEtPersonne";
    await expect(compteAvecPanne.supprimer(ctx)).rejects.toBeInstanceOf(PanneInjecteeError);
    expect(await authentification(samuel)).toMatchObject({ sessions: 0, users: 1, memberships: 1 });
    // Écriture tardive d'une génération en cours (§ 4.3 point 4) : une ligne qui référence la personne.
    await inTx(client, { org: samuel.org, user: samuel.user }, (c) =>
      c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, travellers_children, time_zone) VALUES ($1, $2, $3, 'Tardive', '2026-08-29', '2026-09-03', 2, 0, 'Europe/London')",
        [samuel.org, samuel.user, randomUUID()],
      ),
    );
    panne.avant = null;
    expect(await compteAvecPanne.supprimer(ctx)).toEqual({ ok: true, issue: "supprime" });
    expect(await authentification(samuel)).toEqual(AUCUNE);
    expect(await comptes(samuel.org, TABLES_PURGEES)).toEqual(Object.fromEntries(TABLES_PURGEES.map((table) => [table, 0])));
  });
});

describe("compte: refus (M9b, critères 8, 9 et 10)", () => {
  it("critère 8 : paiement en attente → refus (payment_pending), rien supprimé ; paiement expiré → suppression faite", async () => {
    const samuel = await ouvrirCompte("pending");
    const avant = await empreinte(samuel);
    expect(await action(samuel)).toEqual({ ok: false, error: { code: "payment_pending", retryable: true } });
    expect(await empreinte(samuel)).toEqual(avant);
    expect(await organisation(samuel.org)).toEqual({ existe: true, enSuppression: false, adhesions: 1 });

    // Session de paiement expirée par le temps (33 minutes), mais paiement asynchrone en cours : toujours en attente.
    await admin.query("UPDATE checkouts SET created_at = now() - interval '33 minutes' WHERE organization_id = $1", [samuel.org]);
    const checkout = (await admin.query("SELECT id FROM checkouts WHERE organization_id = $1", [samuel.org])).rows[0].id as string;
    const asynchrone = `evt_${randomUUID()}`;
    await inTx(
      client,
      { org: samuel.org, user: samuel.user },
      (c) => c.query("INSERT INTO billing (organization_id, stripe_event_id, type, livemode, outcome, checkout_id) VALUES ($1, $2, 'checkoutCompleted', false, 'ignored', $3)", [samuel.org, asynchrone, checkout]),
      "vadrouille_webhook",
    );
    expect(await compte.supprimer({ organizationId: samuel.org, userId: samuel.user })).toEqual({ ok: false, code: "paiement_en_attente" });
    expect(await organisation(samuel.org)).toMatchObject({ enSuppression: false });

    // Paiement `expired` : la suppression se fait.
    await inTx(client, { org: samuel.org, user: samuel.user }, (c) => c.query("UPDATE checkouts SET status = 'expired', updated_at = now() WHERE organization_id = $1", [samuel.org]), "vadrouille_webhook");
    expect(await compte.supprimer({ organizationId: samuel.org, userId: samuel.user })).toEqual({ ok: true, issue: "supprime" });
    expect(await authentification(samuel)).toEqual(AUCUNE);
    expect((await comptes(samuel.org, ["billing"])).billing).toBe(1);
  });

  it("critère 8 : paiement `pending` dont la session a expiré par le temps, sans paiement asynchrone → suppression faite", async () => {
    const samuel = await ouvrirCompte("pending");
    await admin.query("UPDATE checkouts SET created_at = now() - interval '33 minutes' WHERE organization_id = $1", [samuel.org]);
    expect(await action(samuel)).toEqual({ ok: true, value: { deleted: true } });
    expect(await authentification(samuel)).toEqual(AUCUNE);
  });

  it("critère 9 : organisation avec un second membre → seule l'adhésion du conseiller disparaît, aucune donnée métier supprimée ; son propriétaire est refusé", async () => {
    const partagee = await createOrg(auth, 1);
    const proprietaire = { email: canonique(partagee.email), org: partagee.org, user: partagee.owner };
    const conseiller = partagee.members[0] ?? "";
    await peupler(proprietaire, "Porto", `ChIJ-m9b-partagee-${randomUUID()}`, randomBytes(32));
    const metier = async () => Object.fromEntries(Object.entries(await empreinte(proprietaire)).filter(([table]) => table !== "memberships"));
    const avant = await metier();

    // Propriétaire : refusé, rien ne change (invariant « exactement un propriétaire », aucun transfert spécifié).
    expect(await compte.supprimer({ organizationId: partagee.org, userId: partagee.owner })).toEqual({ ok: false, code: "forbidden" });
    expect(await organisation(partagee.org)).toEqual({ existe: true, enSuppression: false, adhesions: 2 });
    expect(await metier()).toEqual(avant);

    // Conseiller : seule son adhésion est retirée ; sa ligne `users` reste, l'organisation n'est pas en suppression.
    expect(await compte.supprimer({ organizationId: partagee.org, userId: conseiller })).toEqual({ ok: true, issue: "adhesion_retiree" });
    expect(await organisation(partagee.org)).toEqual({ existe: true, enSuppression: false, adhesions: 1 });
    expect((await admin.query("SELECT user_id::text AS u, role FROM memberships WHERE organization_id = $1", [partagee.org])).rows).toEqual([{ u: partagee.owner, role: "owner" }]);
    expect(Number((await admin.query("SELECT count(*)::int AS n FROM users WHERE id = $1", [conseiller])).rows[0].n)).toBe(1);
    expect(await metier()).toEqual(avant);
  });

  it("critère 10 : conseiller forbidden ; sans session unauthenticated ; limite atteinte rate_limited ; rien supprimé", async () => {
    const samuel = await ouvrirCompte();
    const avant = await empreinte(samuel);
    const partagee = await createOrg(auth, 1);
    const conseiller = await action(samuel, { session: async () => ({ sessionId: randomUUID(), userId: partagee.members[0] ?? "", organizationId: partagee.org, role: "member" }) });
    expect(conseiller).toEqual({ ok: false, error: { code: "forbidden" } });
    // Propriétaire d'une organisation à deux membres, par l'action : refusé avant la connexion récente.
    const proprietaire = await action(samuel, { session: async () => ({ sessionId: randomUUID(), userId: partagee.owner, organizationId: partagee.org, role: "owner" }) });
    expect(proprietaire).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(await organisation(partagee.org)).toEqual({ existe: true, enSuppression: false, adhesions: 2 });

    expect(await action(samuel, { session: async () => null })).toEqual({ ok: false, error: { code: "unauthenticated" } });

    // Limite `suppression` : 5 par heure et par personne (configuration réelle) ; la sixième demande est refusée.
    for (let i = 0; i < 5; i += 1) expect((await limiteur.verdict({ action: ACTION_LIMITEUR_SUPPRESSION, headers: new Headers(), userId: samuel.user })).ok).toBe(true);
    expect(await action(samuel)).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(await empreinte(samuel)).toEqual(avant);
    expect(await organisation(samuel.org)).toEqual({ existe: true, enSuppression: false, adhesions: 1 });
  });
});

describe("compte: rappels après la suppression (M9b, critère 7 ; décision 0162)", () => {
  // Identifiants d'exécution du Workflow SDK relevés par R-D (`tests/db/rappels-relais-reclamation.test.ts`).
  const RUN_AVANT = "wrun_01M6ZWVHNG68KA5EAJ41PT0PCP";
  const RUN_APRES = "wrun_01M6ZWVHNH0GN4PJ1KMK7TM95T";
  // Voyage du 2027-05-01, `Europe/London` (heure d'été) : veille de J1 à 18:00 = 2027-04-30T17:00Z.
  const VEILLE_J1 = Date.parse("2027-04-30T17:00:00.500Z");
  const TABLES_RAPPELS = ["reminder_consents", "reminder_sends", "reminder_relays"];
  const AUCUN_RAPPEL = { reminder_consents: 0, reminder_sends: 0, reminder_relays: 0 };

  /** Voyage débloqué à venir avec un accord **actif** aux rappels, écrit par `vadrouille_app` : état de son exécution. */
  async function accordActif(p: Personne): Promise<EtatRappel> {
    const { tripId, consentId } = await inTx(client, { org: p.org, user: p.user }, async (c) => {
      const t = insertSql("trips", { org: p.org, owner: p.user } as Parameters<typeof insertSql>[1]);
      const trip = (await c.query(t.sql, t.params)).rows[0].id as string;
      await c.query("INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, 1, $3, $4, 'engine')", [p.org, trip, randomUUID(), JSON.stringify(SNAPSHOT)]);
      await c.query("UPDATE trips SET current_version = 1 WHERE id = $1", [trip]);
      const consent = (await c.query("INSERT INTO reminder_consents (organization_id, trip_id, user_id) VALUES ($1, $2, $3) RETURNING id", [p.org, trip, p.user])).rows[0].id as string;
      return { tripId: trip, consentId: consent };
    });
    await admin.query("INSERT INTO entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [p.org, tripId]);
    return { organizationId: p.org, tripId, userId: p.user, consentId };
  }

  it("compte: aucun rappel n'est préparé après la suppression (réclamation du relais et réveil réels)", async () => {
    const withOrg = creerWithOrg(app);
    const envois = vi.fn(async (message: Parameters<NotificationMailer["sendRappelVeille"]>[0]) => void message);
    const mailer: NotificationMailer = { sendApercuPret: vi.fn(async () => undefined), sendRappelVeille: envois };
    const deps = { composer: () => ({ mailer, origine: URL_APPLICATION }), maintenant: () => VEILLE_J1, withOrg };

    // Deux comptes préparés de même : Samuel sera supprimé, le témoin non.
    const samuel = await ouvrirCompte();
    const temoin = await ouvrirCompte();
    const etatSamuel = await accordActif(samuel);
    const etatTemoin = await accordActif(temoin);

    // Avant la suppression, l'accord de Samuel est actif : son exécution de relais réclame bien son rang.
    expect(await reclamerRelais(etatSamuel, { relayN: 1, runId: RUN_AVANT }, { withOrg })).toBe("acquise");
    expect(await comptes(samuel.org, TABLES_RAPPELS)).toEqual({ reminder_consents: 2, reminder_sends: 0, reminder_relays: 1 });

    expect(await action(samuel)).toEqual({ ok: true, value: { deleted: true } });
    expect(await authentification(samuel)).toEqual(AUCUNE);
    expect(await comptes(samuel.org, TABLES_RAPPELS)).toEqual(AUCUN_RAPPEL);

    const lignes: string[] = [];
    for (const methode of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    }
    // L'exécution déjà en cours (même rang, même identifiant) comme une exécution de relais suivante ne trouvent plus
    // d'accord : « fin », ni « acquise », ni « doublon », ni « panne » (une panne ferait réessayer l'étape).
    expect(await reclamerRelais({ ...etatSamuel, relayN: 1 }, { relayN: 1, runId: RUN_AVANT }, { withOrg })).toBe("fin");
    expect(await reclamerRelais(etatSamuel, { relayN: 1, runId: RUN_APRES }, { withOrg })).toBe("fin");
    expect(await reclamerRelais({ ...etatSamuel, relayN: 1 }, { relayN: 2, runId: RUN_APRES }, { withOrg })).toBe("fin");
    // Le réveil du soir, la veille du premier jour : rien n'est réclamé, aucun envoi n'est préparé, et la suite est
    // « fin » (pas « attendre ») : l'exécution se termine, elle ne boucle pas.
    expect(await reveillerRappel(etatSamuel, deps)).toEqual({ suite: "fin" });
    expect(await reveillerRappel({ ...etatSamuel, relayN: 1 }, deps)).toEqual({ suite: "fin" });
    expect(envois).not.toHaveBeenCalled();
    expect(await comptes(samuel.org, TABLES_RAPPELS)).toEqual(AUCUN_RAPPEL);
    vi.restoreAllMocks();
    expect(lignes.join("\n")).not.toMatch(/rappels\.relay_failed|email\.notification_failed/);
    for (const ligne of lignes) for (const interdit of [samuel.email, samuel.user, samuel.org]) expect(ligne).not.toContain(interdit);

    // Témoin non supprimé, même préparation, même réveil : le rappel part, à son adresse seule. Le contrôle ci-dessus
    // n'est donc pas vide : seule la suppression explique l'absence d'envoi pour Samuel.
    expect(await reveillerRappel(etatTemoin, deps)).toEqual({ suite: "attendre", attenteMs: 24 * 3_600_000 - 500 });
    expect(envois).toHaveBeenCalledTimes(1);
    expect(envois.mock.calls[0]?.[0]).toEqual({ to: temoin.email, origine: URL_APPLICATION, tripId: etatTemoin.tripId, dayIndex: 1 });
    expect((await comptes(temoin.org, TABLES_RAPPELS)).reminder_sends).toBe(1);
  });
});
