import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, createOrg, type DbClient, expectRefused, inTx, token } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Vues partagées (décision 0007, « Lien privé » ; handover § 12). Le serveur lira le voyage d'un lien sous
 * `vadrouille_share` (SET LOCAL ROLE depuis `vadrouille_app`), avec le hachage du jeton reçu dans la transaction.
 *
 * M6a-D (migration 0023_lien_prive_partage ; décisions 0157 § 1.5 et § 1.9, 0158 § 2 et § 4.1) : `shared_checklist`
 * retirée ; `vadrouille_app` n'écrit de `share_links` que les colonnes de l'insertion et `revoked_at`, et un lien
 * désactivé l'est pour toujours ; les vues ne servent que le voyage dont le droit `tripUnlocked` existe à la lecture.
 * Les données sont modifiées sous 0158 § 4.1 et 0157 § 1.9, sans affaiblissement : le droit `tripUnlocked` et le lien
 * expiré (dont `created_at` doit précéder `expires_at`) sont posés par la connexion d'administration des tests ; le lien
 * désactivé est créé actif, puis désactivé par `vadrouille_app` comme le fera M6a.
 */

const hex = (buffer: Buffer) => buffer.toString("hex");

type Shared = { org: string; owner: string; trip: string; valid: Buffer; expired: Buffer; revoked: Buffer; otherTrip: string };

let app: DbClient;
let admin: DbClient;
let a: Shared;
let b: Shared;

/** Instantané de test : une clé hors liste à chaque niveau, une étiquette de logement de terminus. */
const SNAPSHOT = {
  destination: "Édimbourg",
  secret: "hors liste",
  days: [
    {
      index: 1,
      date: "2027-05-01",
      title: "calculé",
      // Titre libre du jour (décision 0116 § 6) : hors de la liste blanche, jamais exposé.
      theme: "Old Town et Dean Village",
      travelBudgetMinutes: 90,
      travelMinutes: 42,
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "Hôtel Balmoral, chambre 12" },
        {
          type: "stop",
          stop: {
            id: "s1",
            kind: "visit",
            placeId: "ChIJtest",
            name: "Château",
            start: "09:30",
            end: "11:00",
            reason: "Tu aimes l'histoire",
            source: { label: "Site", url: "https://exemple.ch", checkedOn: "2026-10-01", rating: 4.8 },
            // Infos pratiques (décision 0103, condition 1 de Q-L4a) : jamais exposées par la base.
            facts: { durationMinutes: 90, area: "Old Town", openingHours: "9-17", tip: "Arrive tôt", priceNote: "Environ 20 GBP", hoursNote: "Fermé le lundi" },
            exceptions: ["toConfirm", "verified", { nested: true }, "toReserve", "unconfirmed", "toReserve"],
            locked: false,
            verifiedAt: "2026-10-01",
            rating: 4.7,
            displayName: "Edinburgh Castle",
            location: { lat: 55.9, lng: -3.2 },
          },
        },
        { type: "segment", segment: { mode: "walk", minutes: 12, estimated: false, polyline: "abc" } },
        // Sources aux adresses refusées : jamais rendues en href dans le lien privé.
        { type: "stop", stop: { id: "s2", name: "Script", source: { label: "Piège", url: "javascript:alert(1)" } } },
        {
          type: "stop",
          // Doublons : une seule occurrence de chaque valeur, dans l'ordre de première apparition.
          stop: { id: "s3", name: "Clair", source: { label: "Non chiffré", url: "http://exemple.ch" }, exceptions: ["toReserve", "toReserve", "toReserve"] },
        },
        { type: "stop", stop: { id: "s4", name: "Majuscules", source: { label: "Casse", url: "JAVASCRIPT:alert(1)" } } },
        { type: "stop", stop: { id: "s5", name: "Objet", source: { label: "Objet", url: { href: "https://exemple.ch" } } } },
        { type: "free", from: "11:00", to: "12:00", note: "x" },
        { type: "openMeal", time: "12:30", meal: "lunch", extra: 1 },
        { type: "inconnu", value: "x" },
        { type: "terminus", role: "end", time: "18:00", label: "Hôtel Balmoral" },
      ],
      events: [{ id: "e1", kind: "event", name: "Concert", start: "20:00", locked: false, exceptions: [], phone: "+44" }],
      surprise: { id: "c1", name: "Librairie", reason: "Pour flâner", source: { label: "Blog", url: "https://exemple.ch/b" }, reviews: [] },
    },
  ],
};

const EXPECTED_SNAPSHOT = {
  days: [
    {
      index: 1,
      date: "2027-05-01",
      travelBudgetMinutes: 90,
      items: [
        { type: "terminus", role: "start", time: "09:00" },
        {
          type: "stop",
          stop: {
            id: "s1",
            kind: "visit",
            placeId: "ChIJtest",
            name: "Château",
            start: "09:30",
            end: "11:00",
            reason: "Tu aimes l'histoire",
            source: { label: "Site", url: "https://exemple.ch" },
            facts: { durationMinutes: 90, area: "Old Town" },
            exceptions: ["toReserve", "unconfirmed"],
            locked: false,
          },
        },
        { type: "segment", segment: { mode: "walk", estimated: false } },
        { type: "stop", stop: { id: "s2", name: "Script", source: { label: "Piège" } } },
        { type: "stop", stop: { id: "s3", name: "Clair", source: { label: "Non chiffré" }, exceptions: ["toReserve"] } },
        { type: "stop", stop: { id: "s4", name: "Majuscules", source: { label: "Casse" } } },
        { type: "stop", stop: { id: "s5", name: "Objet", source: { label: "Objet" } } },
        { type: "free", from: "11:00", to: "12:00" },
        { type: "openMeal", time: "12:30", meal: "lunch" },
        { type: "terminus", role: "end", time: "18:00" },
      ],
      events: [{ id: "e1", kind: "event", name: "Concert", start: "20:00", locked: false, exceptions: [] }],
      surprise: { id: "c1", name: "Librairie", reason: "Pour flâner", source: { label: "Blog", url: "https://exemple.ch/b" } },
    },
  ],
};

async function seedShared(auth: DbClient, destination: string): Promise<Shared> {
  const { org, owner } = await createOrg(auth);
  const valid = token();
  const expired = token();
  const revoked = token();
  const shared = await inTx(app, { org, user: owner }, async (c) => {
    const insertTrip = async (name: string) =>
      (
        await c.query(
          "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, $3, $4, '2027-05-01', '2027-05-06', 2, 'Europe/London') RETURNING id",
          [org, owner, randomUUID(), name],
        )
      ).rows[0].id as string;
    const trip = await insertTrip(destination);
    const otherTrip = await insertTrip(`${destination} (autre voyage)`);
    for (const t of [trip, otherTrip]) {
      await c.query(
        "INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, 1, $3, $4, 'engine')",
        [org, t, randomUUID(), JSON.stringify(SNAPSHOT)],
      );
      await c.query("UPDATE trips SET current_version = 1 WHERE id = $1", [t]);
      await c.query(
        `INSERT INTO checklist_items (organization_id, trip_id, kind, label, moment, booking_url) VALUES ($1, $2, 'reservation', $3, '{"type": "tripDay", "day": 1}', 'https://exemple.ch/reserver')`,
        [org, t, `Réserver (${t === trip ? "partagé" : "autre"})`],
      );
    }
    // Un lien actif par voyage : le lien révoqué, créé actif puis désactivé (0157 § 1.9 : `revoked_at` n'est plus
    // fourni à l'insertion), puis le lien valide ; le lien expiré, sur l'autre voyage, est posé plus bas.
    await c.query(
      "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 days')",
      [org, trip, revoked, owner],
    );
    const desactive = await c.query("UPDATE share_links SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [revoked]);
    expect(desactive.rowCount).toBe(1);
    await c.query(
      "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 days')",
      [org, trip, valid, owner],
    );
    return { org, owner, trip, otherTrip, valid, expired, revoked };
  });
  // Lien expiré (0157 § 1.9 : `created_at` n'est pas écrit par l'application et doit précéder `expires_at`) et droits
  // `tripUnlocked` des deux voyages (0158 § 4.1 : `vadrouille_app` n'a que `SELECT` sur `entitlements`), posés par la
  // connexion d'administration des tests. Les deux voyages sont débloqués : un lien expiré ou révoqué ne rend zéro ligne
  // que par le lien, jamais faute de droit.
  await admin.query(
    "INSERT INTO public.share_links (organization_id, trip_id, token_hash, created_by, created_at, expires_at) VALUES ($1, $2, $3, $4, now() - interval '2 days', now() - interval '1 day')",
    [shared.org, shared.otherTrip, shared.expired, shared.owner],
  );
  for (const t of [shared.trip, shared.otherTrip]) {
    await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [shared.org, t]);
  }
  return shared;
}

/**
 * Lecture des deux vues sous vadrouille_share, avec le jeton (ou sans) et, éventuellement, une organisation posée.
 * `shared_checklist` n'existe plus (0157 § 1.5, T5).
 */
async function readShared(tokenHash: Buffer | null, org?: string) {
  return inTx(
    app,
    { org },
    async (c) => {
      if (tokenHash) await c.query("SELECT set_config('app.share_token_hash', $1, true)", [hex(tokenHash)]);
      return {
        trip: (await c.query("SELECT * FROM shared_trip")).rows,
        version: (await c.query("SELECT * FROM shared_trip_version")).rows,
      };
    },
    "vadrouille_share",
  );
}

beforeAll(async () => {
  app = await connect("app");
  admin = await connect("admin");
  const auth = await connect("auth");
  a = await seedShared(auth, "Édimbourg");
  b = await seedShared(auth, "Lisbonne");
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

describe("vues partagées: lecture seulement avec un jeton valide", () => {
  it("les vues ont security_barrier et pas security_invoker", async () => {
    const { rows } = await app.query(
      "SELECT relname, COALESCE(reloptions, '{}') AS options FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'v' ORDER BY relname",
    );
    // M6a-D (0157 § 1.5, T5) : `shared_checklist` retirée.
    expect(rows.map((r) => r.relname)).toEqual(["shared_trip", "shared_trip_version"]);
    for (const row of rows) {
      expect(row.options, row.relname).toContain("security_barrier=true");
      expect(row.options.some((o: string) => o.startsWith("security_invoker")), row.relname).toBe(false);
    }
  });

  it("avec le hachage d'un lien valide : seules les lignes de son voyage, et seulement les colonnes prévues", async () => {
    const shared = await readShared(a.valid);
    expect(shared.trip).toHaveLength(1);
    expect(Object.keys(shared.trip[0]).sort()).toEqual(
      ["destination", "end_date", "start_date", "time_zone", "travellers_adults", "travellers_children"].sort(),
    );
    expect(shared.trip[0].destination).toBe("Édimbourg");
    expect(shared.version).toHaveLength(1);
    expect(Object.keys(shared.version[0]).sort()).toEqual(["created_at", "snapshot", "version"]);
  });

  it("lien expiré, révoqué ou inconnu, ou sans jeton : zéro ligne, même avec app.organization_id posé", async () => {
    for (const [name, tokenHash] of [
      ["expiré", a.expired],
      ["révoqué", a.revoked],
      ["inconnu", token()],
      ["sans jeton", null],
    ] as const) {
      const shared = await readShared(tokenHash, a.org);
      expect(shared, name).toEqual({ trip: [], version: [] });
    }
  });

  it("le jeton d'une organisation ne donne jamais le voyage d'une autre", async () => {
    const shared = await readShared(b.valid, a.org);
    expect(shared.trip.map((r) => r.destination)).toEqual(["Lisbonne"]);
  });

  it("sous vadrouille_share, SELECT direct sur une table refusé", async () => {
    await inTx(
      app,
      { org: a.org },
      async (c) => {
        await c.query("SELECT set_config('app.share_token_hash', $1, true)", [hex(a.valid)]);
        for (const table of ["trips", "trip_versions", "checklist_items", "share_links", "stays", "entitlements"]) {
          await expectRefused(c, `SELECT 1 FROM ${table} LIMIT 1`);
        }
      },
      "vadrouille_share",
    );
  });

  it("resolve_share_link : seule la ligne du jeton reçu, avec son état ; aucune ligne pour un jeton inconnu", async () => {
    await inTx(app, {}, async (c) => {
      const resolve = async (tokenHash: Buffer) => (await c.query("SELECT * FROM resolve_share_link($1)", [tokenHash])).rows;
      expect(await resolve(a.valid)).toEqual([{ organization_id: a.org, trip_id: a.trip, state: "valid" }]);
      expect(await resolve(a.expired)).toEqual([{ organization_id: a.org, trip_id: a.otherTrip, state: "expired" }]);
      expect(await resolve(a.revoked)).toEqual([{ organization_id: a.org, trip_id: a.trip, state: "revoked" }]);
      expect(await resolve(token())).toEqual([]);
    });
  });

  it("parcours prévu : resolve_share_link pose le jeton, puis les vues lisent le voyage sous vadrouille_share", async () => {
    await inTx(app, {}, async (c) => {
      await c.query("SELECT * FROM resolve_share_link($1)", [b.valid]);
      await c.query("SET LOCAL ROLE vadrouille_share");
      expect((await c.query("SELECT destination FROM shared_trip")).rows).toEqual([{ destination: "Lisbonne" }]);
    });
  });

  it("politiques de share_links : jamais USING (true), le jeton de la transaction pour vadrouille_fn_share et vadrouille_fn_share_views", async () => {
    const { rows } = await app.query(
      "SELECT policyname, roles::text[] AS roles, qual FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'share_links' ORDER BY policyname",
    );
    const byRole = Object.fromEntries(rows.map((r) => [r.roles.join(","), r.qual]));
    expect(byRole.vadrouille_fn_share).toBe("(token_hash = app_share_token_hash())");
    expect(byRole.vadrouille_fn_share_views).toBe("(token_hash = app_share_token_hash())");
    expect(rows.every((r) => r.qual !== "true")).toBe(true);
  });

  // Amendée par 0046 D16 point 6 : politiques de prototype.purges (lecture de la date par vadrouille_prototype,
  // insertion par la fonction de purge) ; le test couvre USING (true) et WITH CHECK (true), dans tous les schémas.
  // Amendée par B7c (0010_usage_forfait) : usage_ledger pour vadrouille_fn_usage ; par B3d (0020_plafond_emails) :
  // email_daily_counts pour vadrouille_mail_counter ; par M1f-D (0021_compteurs_autocompletion) : autocomplete_daily_counts
  // pour vadrouille_autocomplete_counter.
  it("liste fermée des politiques USING (true) et WITH CHECK (true)", async () => {
    const { rows } = await app.query(
      `SELECT CASE WHEN schemaname = 'public' THEN '' ELSE schemaname || '.' END || tablename || ':' || array_to_string(roles::text[], ',') AS policy
       FROM pg_catalog.pg_policies
       WHERE qual = 'true' OR with_check = 'true' ORDER BY 1`,
    );
    expect(rows.map((r) => r.policy)).toEqual(
      [
        "accounts:vadrouille_auth",
        "action_rate_limits:vadrouille_limiter",
        // M1f-D (migration 0021_compteurs_autocompletion) : compteur global anonyme, rôle des compteurs seulement.
        "autocomplete_daily_counts:vadrouille_autocomplete_counter",
        "checkouts:vadrouille_fn_checkout",
        // B3d (migration 0020_plafond_emails ; 0138 § 11, T1) : compteur global anonyme, rôle du plafond seulement.
        "email_daily_counts:vadrouille_mail_counter",
        "memberships:vadrouille_auth",
        "organizations:vadrouille_auth",
        "sessions:vadrouille_auth",
        "users:vadrouille_auth",
        "verifications:vadrouille_auth",
        "prototype.purges:vadrouille_fn_prototype_purge",
        "prototype.purges:vadrouille_prototype",
        // B7c (migration 0010_usage_forfait) : lecture des sommes par la seule fonction usage_forfait_totals(),
        // colonnes nécessaires seulement (tests/db/roles.test.ts, tests/db/usage.test.ts).
        "usage_ledger:vadrouille_fn_usage",
      ].sort(),
    );
  });

  it("checkout_organization : l'organisation enregistrée à la création, sous vadrouille_webhook seulement", async () => {
    const session = `cs_test_${randomUUID()}`;
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query(
        "INSERT INTO checkouts (organization_id, trip_id, request_id, stripe_checkout_session_id, price_variant, amount_cents, currency, method, created_by) VALUES ($1, $2, $3, $4, 'chf_29', 2900, 'CHF', 'card', $5)",
        [a.org, a.trip, randomUUID(), session, a.owner],
      );
    });
    await inTx(app, {}, (c) => expectRefused(c, "SELECT checkout_organization($1)", [session]));
    const org = await inTx(app, {}, async (c) => (await c.query("SELECT checkout_organization($1) AS org", [session])).rows[0].org, "vadrouille_webhook");
    expect(org).toBe(a.org);
  });
});

describe("vues partagées: l'instantané partagé ne contient que les clés de la liste blanche", () => {
  it("clés hors liste et étiquette de logement des terminus absentes de shared_trip_version", async () => {
    const shared = await readShared(a.valid);
    expect(shared.version[0].snapshot).toEqual(EXPECTED_SNAPSHOT);
    const text = JSON.stringify(shared.version[0].snapshot);
    for (const forbidden of ["Balmoral", "secret", "rating", "displayName", "location", "openingHours", "minutes\"", "verifiedAt", "polyline", "phone", "reviews", "title"]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });

  it("partage: un voyage dont l'étape porte priceNote, hoursNote et tip ne les expose ni par la projection ni par la base (base)", async () => {
    const shared = await readShared(a.valid);
    const text = JSON.stringify(shared.version[0].snapshot);
    // Sentinelles de SNAPSHOT (décision 0103, condition 1 ; titre libre du jour, décision 0116 § 6).
    for (const sentinelle of ["tip", "priceNote", "hoursNote", "Arrive tôt", "Environ 20 GBP", "Fermé le lundi", "theme", "Old Town et Dean Village"]) {
      expect(text, sentinelle).not.toContain(sentinelle);
    }
  });

  it("source.url : seulement une chaîne en https:// (javascript:, http:, autre type retirés)", async () => {
    const shared = await readShared(a.valid);
    const text = JSON.stringify(shared.version[0].snapshot);
    for (const forbidden of ["javascript:", "JAVASCRIPT:", "http://", "href"]) expect(text, forbidden).not.toContain(forbidden);
    const urls = [...text.matchAll(/"url":"([^"]*)"/g)].map((m) => m[1] ?? "");
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url.startsWith("https://"), url).toBe(true);
  });

  it("exceptions : toReserve et unconfirmed seulement, sans doublon, au plus 2 (décision 0011, point 5 ; jamais toConfirm)", async () => {
    const shared = await readShared(a.valid);
    const stop = shared.version[0].snapshot.days[0].items[1].stop;
    expect(stop.exceptions).toEqual(["toReserve", "unconfirmed"]);
    // Sans doublon : ["toReserve", "toReserve", "toReserve"] donne ["toReserve"].
    expect(shared.version[0].snapshot.days[0].items[4].stop.exceptions).toEqual(["toReserve"]);
    expect(JSON.stringify(shared.version[0].snapshot)).not.toContain("toConfirm");
  });
});

/** Texte comparé par sous-chaînes tolérantes (0158 § 4.1) : espaces normalisés, conversions `::text` retirées. */
const tolerant = (texte: string) => texte.replace(/::text/g, "").replace(/\s+/g, " ");

/**
 * Voyage avec version, lien valide de la personne propriétaire et droits choisis, posés par la connexion
 * d'administration des tests (0158 § 4.1). Rend aussi l'organisation, pour un second voyage de la même organisation.
 */
async function voyagePartage(
  auth: DbClient,
  options: { droits: readonly ("preview" | "tripUnlocked")[]; organisation?: { org: string; owner: string } },
): Promise<{ org: string; owner: string; trip: string; jeton: Buffer }> {
  const { org, owner } = options.organisation ?? (await createOrg(auth));
  const jeton = token();
  const trip = await inTx(app, { org, user: owner }, async (c) => {
    const id = (
      await c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, $3, 'Porto', '2027-06-01', '2027-06-04', 2, 'Europe/Lisbon') RETURNING id",
        [org, owner, randomUUID()],
      )
    ).rows[0].id as string;
    await c.query(
      "INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, 1, $3, $4, 'engine')",
      [org, id, randomUUID(), JSON.stringify(SNAPSHOT)],
    );
    await c.query("UPDATE trips SET current_version = 1 WHERE id = $1", [id]);
    await c.query(
      "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 days')",
      [org, id, jeton, owner],
    );
    return id;
  });
  for (const kind of options.droits) {
    await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, $3)", [org, trip, kind]);
  }
  return { org, owner, trip, jeton };
}

/** État rendu par `resolve_share_link` pour un jeton (la fonction ne contrôle que le lien, 0158 § 4.1). */
async function etatDuLien(jeton: Buffer): Promise<string | undefined> {
  return inTx(app, {}, async (c) => (await c.query("SELECT state FROM resolve_share_link($1)", [jeton])).rows[0]?.state as string | undefined);
}

describe("partage: shared_checklist retirée (M6a-D, 0157 § 1.5)", () => {
  it("to_regclass('public.shared_checklist') est nul ; sous vadrouille_share avec un jeton valide, SELECT sur checklist_items refusé", async () => {
    const { rows } = await app.query("SELECT pg_catalog.to_regclass('public.shared_checklist') IS NULL AS absente");
    expect(rows[0].absente).toBe(true);
    await inTx(
      app,
      { org: a.org },
      async (c) => {
        await c.query("SELECT set_config('app.share_token_hash', $1, true)", [hex(a.valid)]);
        await expectRefused(c, "SELECT label, booking_url FROM checklist_items");
        expect((await attempt(c, "SELECT 1 FROM shared_checklist")).code).toBe("42P01");
      },
      "vadrouille_share",
    );
    const politiques = await app.query(
      "SELECT count(*)::int AS n FROM pg_catalog.pg_policies WHERE tablename = 'checklist_items' AND 'vadrouille_fn_share_views' = ANY (roles::text[])",
    );
    expect(politiques.rows[0].n).toBe(0);
  });
});

describe("partage: droits de vadrouille_app sur share_links (M6a-D, 0157 § 1.9)", () => {
  /** Transaction annulée sous vadrouille_app, avec le contexte de l'organisation : rien n'est gardé. */
  async function enAnnulant<T>(ctx: { org: string; user: string }, fn: (c: DbClient) => Promise<T>): Promise<T> {
    await app.query("BEGIN");
    try {
      await app.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [ctx.org, ctx.user]);
      return await fn(app);
    } finally {
      await app.query("ROLLBACK");
    }
  }

  it("partage: réactivation refusée ; désactivation WHERE revoked_at IS NULL d'un lien déjà désactivé : zéro ligne, aucune erreur", async () => {
    await enAnnulant({ org: a.org, user: a.owner }, async (c) => {
      expect((await attempt(c, "UPDATE share_links SET revoked_at = NULL WHERE token_hash = $1", [a.revoked])).code).toBe("42501");
      expect((await attempt(c, "UPDATE share_links SET revoked_at = now() WHERE token_hash = $1", [a.revoked])).code).toBe("42501");
      const encore = await attempt(c, "UPDATE share_links SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL", [a.revoked]);
      expect(encore).toEqual({ rowCount: 0 });
    });
    expect(await etatDuLien(a.revoked)).toBe("revoked");
  });

  it("partage: expires_at, token_hash et les autres colonnes non modifiables ; revoked_at nul refusé ; verrou FOR UPDATE possible", async () => {
    await enAnnulant({ org: a.org, user: a.owner }, async (c) => {
      for (const set of [
        "expires_at = now() + interval '60 days'",
        "token_hash = token_hash",
        "trip_id = trip_id",
        "organization_id = organization_id",
        "created_by = created_by",
        "created_at = created_at",
      ]) {
        expect((await attempt(c, `UPDATE share_links SET ${set} WHERE token_hash = $1`, [a.valid])).code, set).toBe("42501");
      }
      // Droit `UPDATE (revoked_at)` : la mise à jour est admise par les droits, refusée par le déclencheur.
      expect((await attempt(c, "UPDATE share_links SET revoked_at = NULL WHERE token_hash = $1", [a.valid])).code).toBe("42501");
      const verrou = await attempt(c, "SELECT id FROM share_links WHERE token_hash = $1 FOR UPDATE", [a.valid]);
      expect(verrou).toEqual({ rowCount: 1 });
    });
    expect(await etatDuLien(a.valid)).toBe("valid");
  });

  it("partage: revoked_at posé par la base (now()), jamais la valeur de l'appelant", async () => {
    await enAnnulant({ org: a.org, user: a.owner }, async (c) => {
      const r = await c.query(
        "UPDATE share_links SET revoked_at = '2001-01-01T00:00:00Z' WHERE token_hash = $1 AND revoked_at IS NULL RETURNING revoked_at = now() AS maintenant",
        [a.valid],
      );
      expect(r.rows).toEqual([{ maintenant: true }]);
    });
    expect(await etatDuLien(a.valid)).toBe("valid");
  });

  it("partage: insertion avec revoked_at, created_at ou id refusée ; expires_at hors bornes refusé (insertion directe)", async () => {
    const autre = await voyagePartage(await connect("auth"), { droits: [] });
    const ctx = { org: autre.org, user: autre.owner };
    // Un lien actif existe déjà sur ce voyage : il est désactivé d'abord, dans la transaction annulée.
    await enAnnulant(ctx, async (c) => {
      expect((await c.query("UPDATE share_links SET revoked_at = now() WHERE trip_id = $1 AND revoked_at IS NULL", [autre.trip])).rowCount).toBe(1);
      const inserer = (colonnes: string, valeurs: string, params: unknown[]) =>
        attempt(c, `INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, ${colonnes}) VALUES ($1, $2, $3, $4, ${valeurs})`, [
          autre.org,
          autre.trip,
          token(),
          autre.owner,
          ...params,
        ]);
      expect((await inserer("expires_at, revoked_at", "now() + interval '30 days', now()", [])).code).toBe("42501");
      expect((await inserer("expires_at, created_at", "now() + interval '30 days', now()", [])).code).toBe("42501");
      expect((await inserer("expires_at, id", "now() + interval '30 days', $5", [randomUUID()])).code).toBe("42501");
      // Bornes (`created_at` = now() de la transaction) : passé, maintenant, au-delà de 3 ans refusés (23514).
      for (const expires of ["now() - interval '1 day'", "now()", "now() + interval '3 years' + interval '1 second'"]) {
        expect((await inserer("expires_at", expires, [])).code, expires).toBe("23514");
      }
      // La borne de 3 ans exactement est admise (`<=`).
      expect(await inserer("expires_at", "now() + interval '3 years'", [])).toEqual({ rowCount: 1 });
    });
    const bornes = await app.query(
      `SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS def FROM pg_catalog.pg_constraint
       WHERE conrelid = 'public.share_links'::regclass AND contype = 'c' AND conname LIKE 'share_links_expires%' ORDER BY conname`,
    );
    expect(bornes.rows.map((r) => r.conname)).toEqual(["share_links_expires_after_created_check", "share_links_expires_within_3_years_check"]);
  });

  it("partage: le déclencheur de désactivation définitive est une fonction ordinaire de vadrouille_owner, search_path fixé, sans EXECUTE pour PUBLIC", async () => {
    const { rows } = await app.query(
      `SELECT p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.proconfig,
              EXISTS (SELECT 1 FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS acl
                      WHERE acl.grantee = 0) AS pour_public,
              (SELECT count(*)::int FROM pg_catalog.pg_trigger t
               WHERE t.tgrelid = 'public.share_links'::regclass AND t.tgfoid = p.oid AND NOT t.tgisinternal) AS declencheurs
       FROM pg_catalog.pg_proc p WHERE p.oid = 'public.share_links_revoke_once()'::regprocedure`,
    );
    expect(rows).toEqual([{ prosecdef: false, owner: "vadrouille_owner", proconfig: ["search_path=pg_catalog, pg_temp"], pour_public: false, declencheurs: 1 }]);
  });
});

describe("partage: voyage reverrouillé, condition des vues partagées (M6a-D, 0158 § 2 et § 4.1)", () => {
  it("politique : exactement entitlements_fn_share_views pour vadrouille_fn_share_views, PERMISSIVE, FOR SELECT, sans WITH CHECK", async () => {
    const { rows } = await app.query(
      `SELECT policyname, permissive, cmd, qual, with_check FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND tablename = 'entitlements' AND 'vadrouille_fn_share_views' = ANY (roles::text[])`,
    );
    expect(rows).toHaveLength(1);
    const [politique] = rows;
    expect(politique).toMatchObject({ policyname: "entitlements_fn_share_views", permissive: "PERMISSIVE", cmd: "SELECT", with_check: null });
    const qual = tolerant(politique.qual as string);
    for (const morceau of ["app_share_token_hash()", "revoked_at IS NULL", "expires_at > now()", "'tripUnlocked'"]) {
      expect(qual, morceau).toContain(morceau);
    }
    const roles = await app.query(
      "SELECT roles::text[] AS roles FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND policyname = 'entitlements_fn_share_views'",
    );
    expect(roles.rows).toEqual([{ roles: ["vadrouille_fn_share_views"] }]);
  });

  it("définition des vues : shared_trip et shared_trip_version lisent entitlements et kind = 'tripUnlocked'", async () => {
    for (const vue of ["shared_trip", "shared_trip_version"]) {
      const { rows } = await app.query("SELECT pg_catalog.pg_get_viewdef($1::regclass, true) AS def", [`public.${vue}`]);
      const def = tolerant(rows[0].def as string);
      expect(def, vue).toContain("entitlements");
      expect(def, vue).toContain("kind = 'tripUnlocked'");
    }
  });

  it("voyage débloqué : une ligne dans chaque vue ; droit retiré : zéro ligne alors que le lien reste valid ; droit remis : de nouveau une ligne", async () => {
    const auth = await connect("auth");
    const v = await voyagePartage(auth, { droits: ["tripUnlocked"] });
    const avant = await readShared(v.jeton);
    expect(avant.trip).toHaveLength(1);
    expect(avant.version).toHaveLength(1);
    expect(avant.trip[0].destination).toBe("Porto");

    const retire = await admin.query("DELETE FROM public.entitlements WHERE organization_id = $1 AND trip_id = $2 AND kind = 'tripUnlocked'", [v.org, v.trip]);
    expect(retire.rowCount).toBe(1);
    expect(await readShared(v.jeton)).toEqual({ trip: [], version: [] });
    expect(await readShared(v.jeton, v.org)).toEqual({ trip: [], version: [] });
    expect(await etatDuLien(v.jeton)).toBe("valid");

    await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [v.org, v.trip]);
    const apres = await readShared(v.jeton);
    expect(apres.trip).toHaveLength(1);
    expect(apres.version).toHaveLength(1);
  });

  it("seul le bon droit compte : preview seul, tripUnlocked d'un autre voyage de l'organisation ou d'une autre organisation → zéro ligne", async () => {
    const auth = await connect("auth");
    // Ligne `preview` seule.
    const apercu = await voyagePartage(auth, { droits: ["preview"] });
    // Voyage sans droit, alors qu'un autre voyage de la même organisation est débloqué.
    const sansDroit = await voyagePartage(auth, { droits: [] });
    const voisin = await voyagePartage(auth, { droits: ["tripUnlocked"], organisation: { org: sansDroit.org, owner: sansDroit.owner } });
    // Voyage sans droit, alors qu'un voyage d'une autre organisation est débloqué.
    const seul = await voyagePartage(auth, { droits: [] });
    const ailleurs = await voyagePartage(auth, { droits: ["tripUnlocked"] });
    for (const [nom, v] of [
      ["preview seul", apercu],
      ["tripUnlocked d'un autre voyage de la même organisation", sansDroit],
      ["tripUnlocked d'un voyage d'une autre organisation", seul],
    ] as const) {
      expect(await etatDuLien(v.jeton), nom).toBe("valid");
      expect(await readShared(v.jeton), nom).toEqual({ trip: [], version: [] });
      expect(await readShared(v.jeton, v.org), nom).toEqual({ trip: [], version: [] });
    }
    // Témoins : les voyages débloqués sont servis par leur propre lien.
    for (const v of [voisin, ailleurs]) {
      const lu = await readShared(v.jeton);
      expect(lu.trip).toHaveLength(1);
      expect(lu.version).toHaveLength(1);
    }
  });
});

const UP_0023 = readFileSync(path.join(process.cwd(), "db/migrations/0023_lien_prive_partage.sql"), "utf8");
const DOWN_0023 = readFileSync(path.join(process.cwd(), "db/migrations/0023_lien_prive_partage.down.sql"), "utf8");

describe("0023 : retour arrière, puis texte rejoué (base jetable ; 0158 § 2.6)", () => {
  it("la descente recrée shared_checklist, rend les vues de 0001 et les droits de 0001 sur share_links ; le texte de 0023 se rejoue", async () => {
    const nom = await creerBase("lien_prive_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [adminJ, migrateur] = await Promise.all([connectBaseJetable("admin", nom), connectBaseJetable("migrator", nom)]);
    const etat = async () =>
      (
        await adminJ.query(
          `SELECT pg_catalog.to_regclass('public.shared_checklist') IS NOT NULL AS checklist,
                  (SELECT pg_catalog.pg_get_userbyid(relowner) FROM pg_catalog.pg_class WHERE oid = pg_catalog.to_regclass('public.shared_checklist')) AS proprietaire,
                  COALESCE(pg_catalog.has_table_privilege('vadrouille_share', pg_catalog.to_regclass('public.shared_checklist'), 'SELECT'), false) AS lecture_share,
                  (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE policyname = 'checklist_items_fn_share_views') AS politique_checklist,
                  pg_catalog.has_any_column_privilege('vadrouille_fn_share_views', 'public.checklist_items', 'SELECT') AS droit_checklist,
                  (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE policyname = 'entitlements_fn_share_views') AS politique_droits,
                  pg_catalog.has_any_column_privilege('vadrouille_fn_share_views', 'public.entitlements', 'SELECT') AS droit_entitlements,
                  pg_catalog.pg_get_viewdef('public.shared_trip'::regclass) LIKE '%entitlements%' AS trip_conditionnee,
                  pg_catalog.pg_get_viewdef('public.shared_trip_version'::regclass) LIKE '%entitlements%' AS version_conditionnee,
                  pg_catalog.to_regprocedure('public.share_links_revoke_once()') IS NOT NULL AS fonction,
                  (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgname = 'share_links_revoke_once') AS declencheur,
                  (SELECT count(*)::int FROM pg_catalog.pg_constraint WHERE conname LIKE 'share_links_expires%') AS bornes,
                  pg_catalog.has_table_privilege('vadrouille_app', 'public.share_links', 'UPDATE') AS app_update,
                  pg_catalog.has_table_privilege('vadrouille_app', 'public.share_links', 'INSERT') AS app_insert,
                  (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
                   WHERE m.roleid = 'vadrouille_fn_share_views'::regrole AND m.member = 'vadrouille_migrator'::regrole AND (m.set_option OR m.inherit_option)) AS appartenance`,
        )
      ).rows[0];
    const monte = {
      checklist: false,
      proprietaire: null,
      lecture_share: false,
      politique_checklist: 0,
      droit_checklist: false,
      politique_droits: 1,
      droit_entitlements: true,
      trip_conditionnee: true,
      version_conditionnee: true,
      fonction: true,
      declencheur: 1,
      bornes: 2,
      app_update: false,
      app_insert: false,
      appartenance: 0,
    };
    expect(await etat()).toEqual(monte);

    await migrateur.query("BEGIN");
    await migrateur.query(DOWN_0023);
    expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
    await migrateur.query("COMMIT");
    expect(await etat()).toEqual({
      checklist: true,
      proprietaire: "vadrouille_fn_share_views",
      lecture_share: true,
      politique_checklist: 1,
      droit_checklist: true,
      politique_droits: 0,
      droit_entitlements: false,
      trip_conditionnee: false,
      version_conditionnee: false,
      fonction: false,
      declencheur: 0,
      bornes: 0,
      app_update: true,
      app_insert: true,
      appartenance: 0,
    });
    // Droits de 0001 rendus exactement : aucun droit par colonne de vadrouille_app sur share_links ne reste.
    const colonnes = await adminJ.query(
      `SELECT count(*)::int AS n FROM pg_catalog.pg_attribute
       WHERE attrelid = 'public.share_links'::regclass AND attnum > 0 AND attacl IS NOT NULL AND attacl::text LIKE '%vadrouille_app=%'`,
    );
    expect(colonnes.rows[0].n).toBe(0);

    // G6 : le texte de 0023 se rejoue après sa descente, et rend l'état monté.
    await migrateur.query("BEGIN");
    await migrateur.query(UP_0023);
    await migrateur.query("COMMIT");
    expect(await etat()).toEqual(monte);
  });
});
