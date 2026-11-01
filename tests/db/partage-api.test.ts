import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { SharedTripSchema } from "@/contracts/share";
import { creerCasLiens } from "@/server/partage/liens";
import { creerLectureVue, creerTransactionVue, type TransactionVue } from "@/server/partage/vue";
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
async function voyage(debloque = true): Promise<Voyage> {
  const { org, owner } = await createOrg(auth);
  const debut = isoDans(10);
  const fin = isoDans(12);
  const snapshot = {
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
    const expire = "Y".repeat(43);
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
