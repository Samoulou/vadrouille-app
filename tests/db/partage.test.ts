import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { closeAll, connect, createOrg, type DbClient, expectRefused, inTx, token } from "./helpers";

/**
 * Vues partagées (décision 0007, « Lien privé » ; handover § 12). Le serveur lira le voyage d'un lien sous
 * `vadrouille_share` (SET LOCAL ROLE depuis `vadrouille_app`), avec le hachage du jeton reçu dans la transaction.
 */

const hex = (buffer: Buffer) => buffer.toString("hex");

type Shared = { org: string; owner: string; trip: string; valid: Buffer; expired: Buffer; revoked: Buffer; otherTrip: string };

let app: DbClient;
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
            facts: { durationMinutes: 90, area: "Old Town", openingHours: "9-17" },
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
  return inTx(app, { org, user: owner }, async (c) => {
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
    // Un lien actif par voyage : le lien valide, puis des liens expiré et révoqué (révoqués ou expirés, ils ne
    // comptent pas dans l'unicité du lien actif s'ils sont révoqués).
    await c.query(
      "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 days')",
      [org, trip, valid, owner],
    );
    await c.query(
      "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() - interval '1 day')",
      [org, otherTrip, expired, owner],
    );
    await c.query(
      "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at, revoked_at) VALUES ($1, $2, $3, $4, now() + interval '30 days', now())",
      [org, trip, revoked, owner],
    );
    return { org, owner, trip, otherTrip, valid, expired, revoked };
  });
}

/** Lecture des trois vues sous vadrouille_share, avec le jeton (ou sans) et, éventuellement, une organisation posée. */
async function readShared(tokenHash: Buffer | null, org?: string) {
  return inTx(
    app,
    { org },
    async (c) => {
      if (tokenHash) await c.query("SELECT set_config('app.share_token_hash', $1, true)", [hex(tokenHash)]);
      return {
        trip: (await c.query("SELECT * FROM shared_trip")).rows,
        version: (await c.query("SELECT * FROM shared_trip_version")).rows,
        checklist: (await c.query("SELECT * FROM shared_checklist")).rows,
      };
    },
    "vadrouille_share",
  );
}

beforeAll(async () => {
  app = await connect("app");
  const auth = await connect("auth");
  a = await seedShared(auth, "Édimbourg");
  b = await seedShared(auth, "Lisbonne");
});

afterAll(closeAll);

describe("vues partagées: lecture seulement avec un jeton valide", () => {
  it("les vues ont security_barrier et pas security_invoker", async () => {
    const { rows } = await app.query(
      "SELECT relname, COALESCE(reloptions, '{}') AS options FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'v' ORDER BY relname",
    );
    expect(rows.map((r) => r.relname)).toEqual(["shared_checklist", "shared_trip", "shared_trip_version"]);
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
    expect(shared.checklist.map((r) => r.label)).toEqual(["Réserver (partagé)"]);
    expect(Object.keys(shared.checklist[0]).sort()).toEqual(
      ["booking_url", "done", "id", "kind", "label", "moment", "sponsored", "stop_id"].sort(),
    );
  });

  it("lien expiré, révoqué ou inconnu, ou sans jeton : zéro ligne, même avec app.organization_id posé", async () => {
    for (const [name, tokenHash] of [
      ["expiré", a.expired],
      ["révoqué", a.revoked],
      ["inconnu", token()],
      ["sans jeton", null],
    ] as const) {
      const shared = await readShared(tokenHash, a.org);
      expect(shared, name).toEqual({ trip: [], version: [], checklist: [] });
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
        "checkouts:vadrouille_fn_checkout",
        "memberships:vadrouille_auth",
        "organizations:vadrouille_auth",
        "sessions:vadrouille_auth",
        "users:vadrouille_auth",
        "verifications:vadrouille_auth",
        "prototype.purges:vadrouille_fn_prototype_purge",
        "prototype.purges:vadrouille_prototype",
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
