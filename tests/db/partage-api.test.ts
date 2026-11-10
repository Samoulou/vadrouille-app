import { createHash, randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { SharedTripSchema } from "@/contracts/share";
import { creerCasLiens } from "@/server/partage/liens";
import { creerLectureVue, creerTransactionVue, type TransactionVue } from "@/server/partage/vue";
import { RATE_LIMITS } from "@/server/config/limites";
import { ipAddressKey } from "@/server/ip";
import { createRateLimiter, rateLimitKey, rateLimitMessage } from "@/server/rate-limit";
import { creerWithOrg } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { closeAll, connect, createOrg, type DbClient, inTx } from "./helpers";

/**
 * Lien privé sur `api` en base (ticket 1013, M6a ; spécification M6 § 3.2 et § 3.3 ; décisions 0157 § 1.2, § 1.3 et
 * § 1.9, 0158 § 3 et § 4.2) : les cas d'usage réels de `src/server/partage/liens.ts` et la lecture réelle de
 * `src/server/partage/vue.ts`, sous `vadrouille_app` (migration 0023, aucun droit de plus), sans limiteur réel (doublé,
 * toujours admis) ni en-tête « compté » (vérification doublée : admise). Le voyage reverrouillé est obtenu en retirant
 * le droit `tripUnlocked` par la connexion d'administration des tests (0158 § 4.1).
 */

const JOUR_MS = 86_400_000;
const isoDans = (jours: number) => new Date(Date.now() + jours * JOUR_MS).toISOString().slice(0, 10);

const app = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(app);
const base = creerTransactionVue(app);

/** Transaction de la vue qui note le texte de chaque requête (0158 § 4.2 : même suite pour chaque état). */
const journal: string[][] = [];
const transaction: TransactionVue = (fn) =>
  base((executeur) => {
    const textes: string[] = [];
    journal.push(textes);
    return fn({
      query: (texte, valeurs) => {
        textes.push(texte);
        return executeur.query(texte, valeurs);
      },
    });
  });

const entetes = { get: () => null };
const cas = creerCasLiens({ withOrg, limiteur: async () => ({ ok: true }), entetes: async () => entetes });
const vue = creerLectureVue({ transaction, entetes: async () => entetes, comptee: () => true });

let admin: DbClient;
let auth: DbClient;
let client: DbClient;

type Voyage = { org: string; owner: string; trip: string; ctx: AdapterContext; debut: string; fin: string };

/** Voyage d'une version, dates à venir, fuseau de Paris ; droit `tripUnlocked` posé par l'administration si demandé. */
async function voyage(debloque = true, instantane?: (debut: string) => Record<string, unknown>): Promise<Voyage> {
  const { org, owner } = await createOrg(auth);
  const debut = isoDans(10);
  const fin = isoDans(12);
  const snapshot = instantane?.(debut) ?? {
    days: [
      {
        index: 1,
        date: debut,
        items: [
          { type: "terminus", role: "start", time: "09:00", label: "Hôtel" },
          {
            type: "stop",
            stop: { id: "s1", kind: "activity", placeId: "ChIJtest", name: "Château", start: "09:30", end: "11:00", facts: { area: "Vieille ville" }, exceptions: ["unconfirmed"], locked: false },
          },
          { type: "segment", segment: { mode: "walk", minutes: 12, estimated: false } },
          { type: "terminus", role: "end", time: "18:00", label: "Hôtel" },
        ],
        events: [],
      },
    ],
  };
  const trip = await inTx(client, { org, user: owner }, async (c) => {
    const id = (
      await c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, $3, 'Lyon', $4, $5, 2, 'Europe/Paris') RETURNING id",
        [org, owner, randomUUID(), debut, fin],
      )
    ).rows[0].id as string;
    await c.query("INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, 1, $3, $4, 'engine')", [
      org,
      id,
      randomUUID(),
      JSON.stringify(snapshot),
    ]);
    await c.query("UPDATE trips SET current_version = 1 WHERE id = $1", [id]);
    return id;
  });
  if (debloque) await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org, trip]);
  return { org, owner, trip, ctx: { organizationId: org, userId: owner } as AdapterContext, debut, fin };
}

const reverrouiller = (v: Voyage) => admin.query("DELETE FROM public.entitlements WHERE organization_id = $1 AND trip_id = $2 AND kind = 'tripUnlocked'", [v.org, v.trip]);

async function creer(v: Voyage): Promise<string> {
  const r = await cas.creer(v.ctx, v.trip, Date.now());
  if (!r.ok) throw new Error(`création refusée : ${r.error.code}`);
  return r.value.token;
}

/** Lecture de la vue, et texte des requêtes de sa transaction. */
async function lire(jeton: string) {
  const avant = journal.length;
  const lu = await vue.lire(jeton, `/p/${jeton}`);
  expect(journal.length).toBe(avant + 1);
  return { lu, requetes: journal[avant] };
}

beforeAll(async () => {
  admin = await connect("admin");
  auth = await connect("auth");
  client = await connect("app");
});

afterAll(async () => {
  await app.$client.end();
  await closeAll();
});

describe("partage api : création, état et désactivation (0157 § 1.2 et § 1.3)", () => {
  it("création : une ligne de cinq colonnes, empreinte seulement, fin à minuit de Paris le lendemain du dernier jour du partage", async () => {
    const v = await voyage();
    const r = await cas.creer(v.ctx, v.trip, Date.now());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const fin = new Date(Date.parse(`${v.fin}T00:00:00Z`) + 30 * JOUR_MS).toISOString().slice(0, 10);
    expect(r.value.expiresOn).toBe(fin);
    const { rows } = await admin.query(
      `SELECT created_by, revoked_at, expires_at = ((($2::date + 1)::timestamp) AT TIME ZONE 'Europe/Paris') AS fin_ok,
        token_hash = sha256(convert_to($3, 'UTF8')) AS empreinte_ok FROM public.share_links WHERE trip_id = $1`,
      [v.trip, fin, r.value.token],
    );
    expect(rows).toEqual([{ created_by: v.owner, revoked_at: null, fin_ok: true, empreinte_ok: true }]);
    // État : la date rendue par la création, jamais recalculée par la feuille.
    expect(await cas.etat(v.ctx, v.trip, Date.now())).toEqual({ ok: true, value: { active: true, createdAt: r.value.createdAt, expiresOn: fin } });
  });

  it("remplacement : l'ancien lien est désactivé, un seul lien actif ; l'ancien jeton ne lit plus rien", async () => {
    const v = await voyage();
    const premier = await creer(v);
    const second = await creer(v);
    const { rows } = await admin.query("SELECT count(*)::int AS actifs FROM public.share_links WHERE trip_id = $1 AND revoked_at IS NULL", [v.trip]);
    expect(rows[0].actifs).toBe(1);
    expect((await lire(premier)).lu).toBeNull();
    expect((await lire(second)).lu).not.toBeNull();
  });

  it("autre personne de l'organisation ou autre organisation : not_found, rien n'est écrit", async () => {
    const v = await voyage();
    const autre = await voyage();
    for (const ctx of [{ organizationId: v.org, userId: autre.owner }, autre.ctx] as AdapterContext[]) {
      expect(await cas.creer(ctx, v.trip, Date.now())).toEqual({ ok: false, error: { code: "not_found" } });
      expect(await cas.etat(ctx, v.trip, Date.now())).toEqual({ ok: false, error: { code: "not_found" } });
    }
    const { rows } = await admin.query("SELECT count(*)::int AS n FROM public.share_links WHERE trip_id = $1", [v.trip]);
    expect(rows[0].n).toBe(0);
  });

  it("voyage verrouillé : création et état not_found", async () => {
    const v = await voyage(false);
    expect(await cas.creer(v.ctx, v.trip, Date.now())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await cas.etat(v.ctx, v.trip, Date.now())).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("désactivation : revoked_at posé par la base, idempotente, expires_at inchangé", async () => {
    const v = await voyage();
    const jeton = await creer(v);
    const avant = (await admin.query("SELECT expires_at FROM public.share_links WHERE trip_id = $1", [v.trip])).rows[0].expires_at;
    expect(await cas.desactiver(v.ctx, v.trip)).toEqual({ ok: true, value: { active: false } });
    expect(await cas.desactiver(v.ctx, v.trip)).toEqual({ ok: true, value: { active: false } });
    const apres = (await admin.query("SELECT expires_at, revoked_at FROM public.share_links WHERE trip_id = $1", [v.trip])).rows[0];
    expect(apres.revoked_at).not.toBeNull();
    expect(apres.expires_at).toEqual(avant);
    expect(await cas.etat(v.ctx, v.trip, Date.now())).toEqual({ ok: true, value: { active: false } });
    expect((await lire(jeton)).lu).toBeNull();
  });
});

describe("partage api : vue partagée, un seul chemin de lecture (0158 § 3 et § 4.2)", () => {
  it("lien valide : la vue du voyage, sans identifiant, placeId, libellé de terminus ni position", async () => {
    const v = await voyage();
    const jeton = await creer(v);
    const { lu } = await lire(jeton);
    expect(lu?.timeZone).toBe("Europe/Paris");
    expect(lu?.maps).toEqual([{ index: 1, points: [] }]);
    const texte = JSON.stringify(lu?.trip);
    for (const interdit of ["ChIJtest", '"id"', "Hôtel", "locked", "placeId"]) expect(texte, interdit).not.toContain(interdit);
    const trip = SharedTripSchema.parse(lu?.trip);
    expect(trip).toMatchObject({ destination: "Lyon", start: v.debut, end: v.fin, travellers: { adults: 2, children: 0 } });
    // Liste blanche de la base, puis projection : terminus sans libellé, durée du trajet inconnue (jamais stockée).
    expect(trip.days[0]?.items).toEqual([
      { type: "terminus", role: "start", time: "09:00" },
      { type: "stop", stop: { kind: "activity", name: "Château", start: "09:30", end: "11:00", facts: { area: "Vieille ville" }, key: "1", exceptions: ["unconfirmed"] } },
      { type: "segment", segment: { mode: "walk", minutes: null, estimated: false } },
      { type: "terminus", role: "end", time: "18:00" },
    ]);
  });

  it("voyage reverrouillé : 404 commun (null) par la même suite de requêtes que le jeton inconnu, désactivé, expiré et valide", async () => {
    const v = await voyage();
    const jeton = await creer(v);
    const valide = await lire(jeton);
    expect(valide.lu).not.toBeNull();

    // Reverrouillé : le lien reste `valid`, les vues rendent zéro ligne.
    expect((await reverrouiller(v)).rowCount).toBe(1);
    const reverrouille = await lire(jeton);
    expect(reverrouille.lu).toBeNull();
    const etat = (await admin.query("SELECT state FROM public.resolve_share_link(sha256(convert_to($1, 'UTF8')))", [jeton])).rows[0]?.state;
    expect(etat).toBe("valid");

    const inconnu = await lire("Z".repeat(43));
    expect(inconnu.lu).toBeNull();

    const w = await voyage();
    const desactive = await creer(w);
    await cas.desactiver(w.ctx, w.trip);
    const lienDesactive = await lire(desactive);
    expect(lienDesactive.lu).toBeNull();

    // Lien expiré, posé par l'administration (0157 § 1.9 : `created_at` doit précéder `expires_at`).
    const x = await voyage();
    // Jeton tiré à chaque exécution : rejouer le fichier sur la même base ne heurte pas l'unicité de `token_hash`.
    const expire = randomBytes(32).toString("base64url");
    await admin.query(
      "INSERT INTO public.share_links (organization_id, trip_id, token_hash, created_by, created_at, expires_at) VALUES ($1, $2, sha256(convert_to($3, 'UTF8')), $4, now() - interval '2 days', now() - interval '1 day')",
      [x.org, x.trip, expire, x.owner],
    );
    const lienExpire = await lire(expire);
    expect(lienExpire.lu).toBeNull();

    for (const autre of [reverrouille, inconnu, lienDesactive, lienExpire]) expect(autre.requetes).toEqual(valide.requetes);
    expect(valide.requetes).toHaveLength(5);
  });

  it("après reverrouillage : désactivation toujours possible ; état et création not_found (0158 § 3 points 6 et 7)", async () => {
    const v = await voyage();
    await creer(v);
    await reverrouiller(v);
    expect(await cas.etat(v.ctx, v.trip, Date.now())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await cas.creer(v.ctx, v.trip, Date.now())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await cas.desactiver(v.ctx, v.trip)).toEqual({ ok: true, value: { active: false } });
    const { rows } = await admin.query("SELECT count(*)::int AS actifs FROM public.share_links WHERE trip_id = $1 AND revoked_at IS NULL", [v.trip]);
    expect(rows[0].actifs).toBe(0);
  });
});

describe("partage api : revue du ticket 1013 (points 3 à 6)", () => {
  it("verrou FOR UPDATE sous RLS : deux créations simultanées, un seul lien actif (critère 7 ; point 5)", async () => {
    const v = await voyage();
    // Deux transactions concurrentes sur deux connexions du pool : la seconde attend le verrou de la ligne du voyage.
    const resultats = await Promise.all([cas.creer(v.ctx, v.trip, Date.now()), cas.creer(v.ctx, v.trip, Date.now())]);
    expect(resultats.map((r) => r.ok)).toEqual([true, true]);
    const { rows } = await admin.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE revoked_at IS NOT NULL)::int AS desactives FROM public.share_links WHERE trip_id = $1", [v.trip]);
    expect(rows[0]).toEqual({ total: 2, desactives: 1 });
    const actifs = (await admin.query("SELECT count(*)::int AS n FROM public.share_links WHERE trip_id = $1 AND revoked_at IS NULL", [v.trip])).rows[0].n;
    expect(actifs).toBe(1);
    // Exactement l'un des deux jetons est lisible. Lectures l'une après l'autre : `lire` compte les transactions du
    // journal commun (deux lectures simultanées l'auraient fait croître de deux).
    const lus: boolean[] = [];
    for (const r of resultats) lus.push(r.ok ? (await lire(r.value.token)).lu !== null : false);
    expect(lus.filter(Boolean)).toHaveLength(1);
    // Dix créations simultanées : toutes admises, sans `internal` (le verrou les sérialise, aucun rejeu `23505` épuisé),
    // et toujours un seul lien actif.
    const dix = await Promise.all(Array.from({ length: 10 }, () => cas.creer(v.ctx, v.trip, Date.now())));
    expect(dix.map((r) => (r.ok ? "ok" : r.error.code))).toEqual(Array.from({ length: 10 }, () => "ok"));
    const apres = (await admin.query("SELECT count(*)::int AS n FROM public.share_links WHERE trip_id = $1 AND revoked_at IS NULL", [v.trip])).rows[0].n;
    expect(apres).toBe(1);
  });

  it("instantané sentinelle complet lu par les vraies vues (critères 11 et 12 ; point 6)", async () => {
    const v = await voyage(true, (debut) => ({
      sentinelle: "SENTINELLE_CLE",
      checklist: [{ label: "SENTINELLE_A_FAIRE" }],
      days: [
        {
          index: 1,
          date: debut,
          cleEnTrop: "SENTINELLE_CLE",
          items: [
            { type: "terminus", role: "start", time: "09:00", label: "SENTINELLE_LOGEMENT" },
            {
              type: "stop",
              stop: {
                id: "SENTINELLE_ID",
                kind: "activity",
                placeId: "SENTINELLE_PLACE",
                name: "[Vieille ville]",
                start: "09:30",
                end: "11:00",
                addedBy: "SENTINELLE_AJOUT",
                reason: "SENTINELLE_RAISON",
                source: "SENTINELLE_SOURCE",
                facts: { area: "Centre", tip: "SENTINELLE_CLE" },
                exceptions: ["toReserve", "unconfirmed"],
                locked: true,
                cleEnTrop: "SENTINELLE_CLE",
              },
            },
            { type: "terminus", role: "end", time: "18:00", label: "SENTINELLE_LOGEMENT" },
          ],
          events: [],
        },
      ],
    }));
    // Lignes métier sentinelles : élément « À faire » et logement (jamais dans la vue partagée).
    await inTx(client, { org: v.org, user: v.owner }, async (c) => {
      await c.query(`INSERT INTO checklist_items (organization_id, trip_id, kind, label, moment) VALUES ($1, $2, 'other', 'SENTINELLE_A_FAIRE_LIGNE', '{"type": "beforeDeparture"}')`, [v.org, v.trip]);
      await c.query("INSERT INTO stays (organization_id, trip_id, kind, label, from_date, to_date) VALUES ($1, $2, 'lodging', 'SENTINELLE_LOGEMENT_LIGNE', $3, $4)", [v.org, v.trip, v.debut, v.fin]);
    });
    const jeton = await creer(v);
    const { lu } = await lire(jeton);
    expect(lu).not.toBeNull();
    const texte = JSON.stringify(lu);
    for (const interdit of ["SENTINELLE", "toReserve", "placeId", "addedBy", "locked", '"id"', "cleEnTrop", "checklist"]) expect(texte, interdit).not.toContain(interdit);
    const trip = SharedTripSchema.parse(lu?.trip);
    expect(trip.days[0]?.items).toEqual([
      { type: "terminus", role: "start", time: "09:00" },
      { type: "stop", stop: { kind: "activity", name: "[Vieille ville]", start: "09:30", end: "11:00", facts: { area: "Centre" }, key: "1", exceptions: ["unconfirmed"] } },
      { type: "terminus", role: "end", time: "18:00" },
    ]);
  });

  it("erreur réelle de la base, jeton sentinelle : message fixe, sans cause, ni jeton ni empreinte (critère 16 ; point 4)", async () => {
    const jeton = `sentinelle${randomBytes(8).toString("hex")}`.padEnd(43, "S");
    const empreinte = createHash("sha256").update(jeton, "utf8").digest("hex");
    // Requête fautive sur la vraie base (fonction absente) avec l'empreinte en paramètre : erreur de Drizzle et de `pg`.
    const enPanne = creerLectureVue({
      transaction: (fn) =>
        base((executeur) =>
          fn({ query: (texte, valeurs) => executeur.query(texte.replace("public.resolve_share_link(", "public.resolve_share_link_absente("), valeurs) }),
        ),
      entetes: async () => entetes,
      comptee: () => true,
    });
    const erreur = await enPanne.lire(jeton, `/p/${jeton}`).then(
      () => undefined,
      (e: unknown) => e as Error & { cause?: unknown },
    );
    expect(erreur?.message).toBe("vue partagée : lecture impossible");
    expect(erreur?.cause).toBeUndefined();
    const texte = [String(erreur), erreur?.stack ?? "", JSON.stringify(erreur)].join("\n");
    for (const interdit of [jeton, empreinte, "resolve_share_link", "params"]) expect(texte, interdit).not.toContain(interdit);
  });

  it("cardinalité d'action_rate_limits : 1 000 adresses sur deux fenêtres de partage-vue, 1 000 lignes (point 3)", async () => {
    const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
    const secret = randomBytes(32);
    const pool = createDatabase("vadrouille_app").$client;
    try {
      const limiteur = createRateLimiter({
        config: { "partage-vue": RATE_LIMITS["partage-vue"] ?? [] },
        env: { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: secret.toString("base64url") },
        pool,
      });
      // Un préfixe /64 distinct par adresse simulée (`trustedIpKey` compte une adresse IPv6 par préfixe /64).
      const adresses = Array.from({ length: 1000 }, (_, i) => `2001:db8:6b:${i.toString(16)}::1`);
      const cles = adresses.map((a) => rateLimitKey(secret, rateLimitMessage("partage-vue", 60, `ip/${ipAddressKey(a)}`)));
      const lignes = async () => (await admin.query("SELECT count(*)::int AS n, max(count)::int AS max FROM action_rate_limits WHERE key = ANY($1::text[])", [cles])).rows[0];
      for (const fenetre of [1, 2]) {
        for (let lot = 0; lot < adresses.length; lot += 50) {
          const verdicts = await Promise.all(
            adresses.slice(lot, lot + 50).map((a) => {
              const h = new Headers({ "x-vercel-forwarded-for": a });
              return limiteur.verdict({ action: "partage-vue", headers: { get: (nom: string) => h.get(nom) } });
            }),
          );
          expect(verdicts.every((d) => d.ok), `fenêtre ${fenetre}`).toBe(true);
        }
        expect(await lignes(), `fenêtre ${fenetre}`).toEqual({ n: 1000, max: 1 });
        // Fenêtre suivante : échéances reculées par SQL (jamais l'horloge du processus).
        await admin.query("UPDATE action_rate_limits SET expires_at = expires_at - interval '2 minutes', window_start = window_start - interval '2 minutes' WHERE key = ANY($1::text[])", [cles]);
      }
    } finally {
      await pool.end();
    }
  }, 180_000);
});
