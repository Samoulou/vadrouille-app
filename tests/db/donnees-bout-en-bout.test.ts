import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { randomUUID } from "node:crypto";

import {
  ADRESSE_A,
  ADRESSE_B,
  ADRESSE_DEBLOQUER,
  ADRESSE_DEBLOQUER_REFUS,
  ADRESSE_PARTAGE,
  ADRESSE_REMPLACER,
  ADRESSE_PHOTOS,
  JETON_PARTAGE_REVERROUILLE,
  JETON_PARTAGE_VALIDE,
} from "../support/bout-en-bout-api";
import { convertirVoyagesSimules, ecrireVoyagesSimules } from "../support/voyages-en-base";
import { closeAll, connect, createOrg, inTx, type DbClient } from "./helpers";

/**
 * Données des scénarios de bout en bout de l'adaptateur `api` (spécification B6, B6b point 5 ; décision 0086 § 2.3 et
 * § 1.6 point 4 : « les données de bout en bout de B6b passent par le même module »). Écrites par le **processus de
 * test** (jamais par le serveur), dans `pnpm test:db`, que le job `db` exécute avant le projet Playwright `auth` sur la
 * même base : personnes et organisations personnelles par `createOrg` (chemin de B3b, `vadrouille_auth`), voyages par
 * `ecrireVoyagesSimules` (`vadrouille_app`, droit par `vadrouille_webhook`). Idempotent : une personne existante est
 * reprise, et ses voyages ne sont écrits que si son organisation n'en a aucun. Voir `tests/support/bout-en-bout-api.ts`.
 */

let app: DbClient;
let auth: DbClient;
let admin: DbClient;

type Identite = { org: string; owner: string };

/** Organisation personnelle de l'adresse (adhésion `owner`), créée par `createOrg` si la personne n'existe pas. */
async function identite(adresse: string): Promise<Identite> {
  const existante = await inTx(auth, {}, async (c) =>
    (
      await c.query(
        `SELECT m.organization_id AS org, u.id AS owner FROM users u
         JOIN memberships m ON m.user_id = u.id AND m.role = 'owner'
         JOIN organizations o ON o.id = m.organization_id AND o.kind = 'personal'
         WHERE u.email = $1`,
        [adresse],
      )
    ).rows,
  );
  if (existante.length === 1) return existante[0] as Identite;
  expect(existante).toHaveLength(0);
  const { org, owner } = await createOrg(auth, 0, adresse);
  return { org, owner };
}

async function nombreDeVoyages(id: Identite): Promise<number> {
  return inTx(app, { org: id.org, user: id.owner }, async (c) => Number((await c.query("SELECT count(*) AS n FROM trips WHERE organization_id = $1", [id.org])).rows[0].n));
}

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
});

afterAll(closeAll);

describe("données de bout en bout de l'adaptateur api (B6b ; B4b pour le déblocage)", () => {
  it.each([ADRESSE_A, ADRESSE_B, ADRESSE_DEBLOQUER, ADRESSE_DEBLOQUER_REFUS, ADRESSE_REMPLACER, ADRESSE_PHOTOS])("%s : organisation personnelle et quatre voyages du jeu simulé", async (adresse) => {
    const id = await identite(adresse);
    // Le scénario du remplacement (M1g, PR 869) a besoin des candidats de ses propositions déjà vérifiées, et de la réserve
    // du jeu simulé de révision (« [Dégustation…] » pour « [Dean Village] »).
    if ((await nombreDeVoyages(id)) === 0) await ecrireVoyagesSimules(app, id, { candidats: adresse === ADRESSE_REMPLACER, reserveDeRevision: adresse === ADRESSE_REMPLACER });
    expect(await nombreDeVoyages(id)).toBe(convertirVoyagesSimules().length);
    // Rejouer ne crée ni personne ni voyage de plus.
    expect(await identite(adresse)).toEqual(id);
  });
});

/**
 * Lien privé sur `api` (ticket 1013, M6a ; décision 0158 § 4.2) : deux voyages à venir (dates relatives au jour de
 * l'écriture, fuseau de Paris), chacun d'une version et d'un lien actif de 30 jours. Lignes métier et lien sous
 * `vadrouille_app` (insertion des cinq colonnes admises par 0023) ; droit `tripUnlocked` posé, puis retiré pour le voyage
 * reverrouillé, par la connexion d'administration des tests (0158 § 4.1 : `vadrouille_app` n'a que `SELECT` sur
 * `entitlements`). Idempotent : rien n'est écrit si l'organisation a déjà des voyages.
 */
describe("données de bout en bout du lien privé sur api (M6a)", () => {
  const isoDans = (jours: number) => new Date(Date.now() + jours * 86_400_000).toISOString().slice(0, 10);

  async function voyagePartage(id: Identite, destination: string, jeton: string): Promise<string> {
    const debut = isoDans(20);
    const snapshot = {
      days: [
        {
          index: 1,
          date: debut,
          items: [
            { type: "terminus", role: "start", time: "09:00", label: "Hôtel" },
            { type: "stop", stop: { id: "s1", kind: "activity", placeId: "test_place_m6a", name: "[Vieille ville]", start: "09:30", end: "11:00", facts: {}, exceptions: [], locked: false } },
            { type: "terminus", role: "end", time: "18:00", label: "Hôtel" },
          ],
          events: [],
        },
      ],
    };
    return inTx(app, { org: id.org, user: id.owner }, async (c) => {
      const trip = (
        await c.query(
          "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, $3, $4, $5, $5, 2, 'Europe/Paris') RETURNING id",
          [id.org, id.owner, randomUUID(), destination, debut],
        )
      ).rows[0].id as string;
      await c.query("INSERT INTO trip_versions (organization_id, trip_id, version, request_id, snapshot, author_kind) VALUES ($1, $2, 1, $3, $4, 'engine')", [
        id.org,
        trip,
        randomUUID(),
        JSON.stringify(snapshot),
      ]);
      await c.query("UPDATE trips SET current_version = 1 WHERE id = $1", [trip]);
      await c.query(
        "INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, sha256(convert_to($3, 'UTF8')), $4, now() + interval '30 days')",
        [id.org, trip, jeton, id.owner],
      );
      return trip;
    });
  }

  it(`${ADRESSE_PARTAGE} : un voyage débloqué et un voyage reverrouillé, chacun avec un lien actif`, async () => {
    const id = await identite(ADRESSE_PARTAGE);
    if ((await nombreDeVoyages(id)) === 0) {
      const valide = await voyagePartage(id, "Lyon", JETON_PARTAGE_VALIDE);
      const reverrouille = await voyagePartage(id, "Marseille", JETON_PARTAGE_REVERROUILLE);
      for (const trip of [valide, reverrouille]) {
        await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [id.org, trip]);
      }
      const retire = await admin.query("DELETE FROM public.entitlements WHERE organization_id = $1 AND trip_id = $2 AND kind = 'tripUnlocked'", [id.org, reverrouille]);
      expect(retire.rowCount).toBe(1);
    }
    expect(await nombreDeVoyages(id)).toBe(2);
    for (const jeton of [JETON_PARTAGE_VALIDE, JETON_PARTAGE_REVERROUILLE]) {
      const etat = (await admin.query("SELECT state FROM public.resolve_share_link(sha256(convert_to($1, 'UTF8')))", [jeton])).rows[0]?.state;
      expect(etat, jeton).toBe("valid");
    }
  });
});
