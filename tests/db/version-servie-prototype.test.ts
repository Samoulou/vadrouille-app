import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SQL_LISTE, SQL_PROGRAMME } from "@/adapters/prototype-lecture";
import { lireExecution, lireVersionCourante } from "@/adapters/prototype-travail";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { clesRevision } from "@/server/p0/cles-revision";
import { lireBriefVersion, lireClesRevision, lireProgrammeVersion } from "@/server/p0/creation-essai";
import type { LimitesForfait } from "@/server/usage/forfait";
import { type PoolSql, type ReglesForfait, reserverExecution } from "@/server/usage/neon";

import { closeAll, connect, type DbClient } from "./helpers";

/**
 * Version servie d'un voyage d'essai (spécification E2E-essai, lot 4 ; décision 0126 § 1, « aucune migration ») : un
 * premier programme et ses révisions portent le **même** `trip.id` ; la lecture sert celui de l'exécution commencée la
 * dernière, parmi les programmes non expirés. Une révision arrêtée n'écrit aucun programme et ne change rien ; une
 * version expirée n'est jamais servie. Requêtes réelles sous `vadrouille_prototype` ; l'administration ne pose que les
 * lignes datées (déclencheurs désactivés pour sa seule transaction).
 */

const SHA = "e".repeat(40);
const BRIEF = (recit: string) => ({
  schema: 1,
  destination: "Rome",
  pays: "Italie",
  fuseau: "Europe/Rome",
  arrivee: "2027-05-04",
  depart: "2027-05-08",
  heureArrivee: "09:00",
  heureDepart: "22:30",
  voyageurs: { adultes: 2, enfants: 0 },
  rythme: "equilibre",
  envies: ["heritage"],
  deplacements: ["walk"],
  logements: [{ texte: "Rome", nuits: 4 }],
  recit,
});

let admin: DbClient;
let proto: DbClient;

beforeAll(async () => {
  admin = await connect("admin");
  proto = await connect("p0");
});

afterAll(closeAll);

/** Pool réel : une connexion `vadrouille_prototype` par transaction, fermée à la libération. */
const poolReel: PoolSql = {
  connect: async () => {
    const client = await connect("p0");
    return { query: (texte, valeurs) => client.query(texte, valeurs as unknown[] | undefined), release: () => void client.end() };
  },
};

/** Voyage de l'app neuf (`proto_rome_<32 hex>`), propre à chaque test. */
const voyage = () => `proto_rome_${randomUUID().replaceAll("-", "")}`;

/**
 * Exécution `saisi` posée par l'administration, commencée il y a `ilYaMinutes`, avec son brief et, sur demande, son
 * programme (vivant ou expiré) sous `tripId`.
 */
async function poser(options: {
  tripId: string;
  ilYaMinutes: number;
  statut: "en_cours" | "programme_ecrit" | "arretee";
  programme?: "vivant" | "expire";
  requestId?: string;
  recit?: string;
}): Promise<string> {
  await admin.query("BEGIN");
  try {
    await admin.query("SET LOCAL session_replication_role = replica");
    const run = (
      await admin.query(
        `INSERT INTO prototype.runs (organization_id, quota_day, mode, brief, variant, status, stop_code, started_at, commit_sha)
         VALUES ($1, '1901-01-01'::date + $2::integer, 'essai', 'saisi', 'A', $3, $4, pg_catalog.now() - ($5::integer * interval '1 minute'), $6) RETURNING id`,
        [PROTOTYPE_ORG_ID, Math.floor(Math.random() * 30_000), options.statut, options.statut === "arretee" ? "pipeline_failed" : null, options.ilYaMinutes, SHA],
      )
    ).rows[0].id as string;
    await admin.query(
      `INSERT INTO prototype.run_briefs (organization_id, run_id, request_id, brief, expires_at) VALUES ($1, $2, $3, $4, pg_catalog.now() + interval '1 day')`,
      [PROTOTYPE_ORG_ID, run, options.requestId ?? randomUUID(), JSON.stringify(BRIEF(options.recit ?? `brief de ${run}`))],
    );
    if (options.programme !== undefined) {
      const expires = options.programme === "vivant" ? "pg_catalog.now() + interval '1 day'" : "pg_catalog.now() - interval '1 hour'";
      await admin.query(`INSERT INTO prototype.programmes (organization_id, run_id, contenu, expires_at) VALUES ($1, $2, $3, ${expires})`, [
        PROTOTYPE_ORG_ID,
        run,
        JSON.stringify({ schema: 1, trip: { id: options.tripId, version: run } }),
      ]);
    }
    await admin.query("COMMIT");
    return run;
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Lecture brute sous `vadrouille_prototype`, contexte d'organisation posé comme l'adaptateur. */
async function lire(texte: string, valeurs?: unknown[]): Promise<{ contenu: { trip?: { id: string; version: string } } }[]> {
  await proto.query("BEGIN READ ONLY");
  try {
    await proto.query("SELECT pg_catalog.set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
    return (await proto.query(texte, valeurs)).rows;
  } finally {
    await proto.query("ROLLBACK");
  }
}

/**
 * Liste : la requête de production sans sa borne de lignes (`LIMIT PROGRAMMES_MAX + 1`, contrôlée par l'adaptateur),
 * pour que les programmes des autres fichiers de test de la base partagée n'écartent pas ce voyage.
 */
const SQL_LISTE_SANS_BORNE = SQL_LISTE.replace(/ LIMIT [0-9]+$/, "");
const versionsListees = async (tripId: string) =>
  // Les autres fichiers de la base partagée posent des programmes sans `trip` : ignorés ici.
  (await lire(SQL_LISTE_SANS_BORNE)).flatMap((ligne) => (ligne.contenu.trip?.id === tripId ? [ligne.contenu.trip.version] : []));

describe("p0: version servie d'un voyage révisé (décision 0126 § 1)", () => {
  it("la liste de production n'a qu'une borne de lignes en plus de la forme testée", () => {
    expect(SQL_LISTE).toMatch(/ LIMIT [0-9]+$/);
    expect(SQL_LISTE_SANS_BORNE).not.toContain("LIMIT");
  });

  it("deux versions sous le même trip.id : la liste et la page servent la plus récente, une ligne au plus", async () => {
    const tripId = voyage();
    await poser({ tripId, ilYaMinutes: 60, statut: "programme_ecrit", programme: "vivant" });
    const revision = await poser({ tripId, ilYaMinutes: 10, statut: "programme_ecrit", programme: "vivant", recit: "brief de la révision" });
    expect(await versionsListees(tripId)).toEqual([revision]);
    expect((await lire(SQL_PROGRAMME, [tripId])).map((ligne) => ligne.contenu.trip?.version)).toEqual([revision]);
    expect(((await lireVersionCourante(poolReel, tripId)) as { trip: { version: string } }).trip.version).toBe(revision);
    expect(await lireBriefVersion(poolReel, tripId)).toMatchObject({ recit: "brief de la révision" });
    expect(((await lireProgrammeVersion(poolReel, tripId)) as { trip: { version: string } }).trip.version).toBe(revision);
  });

  it("révision arrêtée (sans programme), puis en cours : la version précédente reste servie", async () => {
    const tripId = voyage();
    const premier = await poser({ tripId, ilYaMinutes: 60, statut: "programme_ecrit", programme: "vivant", recit: "premier brief" });
    await poser({ tripId, ilYaMinutes: 20, statut: "arretee" });
    await poser({ tripId, ilYaMinutes: 5, statut: "en_cours" });
    expect(await versionsListees(tripId)).toEqual([premier]);
    expect((await lire(SQL_PROGRAMME, [tripId])).map((ligne) => ligne.contenu.trip?.version)).toEqual([premier]);
    expect(((await lireVersionCourante(poolReel, tripId)) as { trip: { version: string } }).trip.version).toBe(premier);
    expect(await lireBriefVersion(poolReel, tripId)).toMatchObject({ recit: "premier brief" });
    expect(((await lireProgrammeVersion(poolReel, tripId)) as { trip: { version: string } }).trip.version).toBe(premier);
  });

  it("version la plus récente expirée : la précédente non expirée est servie ; toutes expirées : rien", async () => {
    const tripId = voyage();
    const premier = await poser({ tripId, ilYaMinutes: 60, statut: "programme_ecrit", programme: "vivant" });
    await poser({ tripId, ilYaMinutes: 10, statut: "programme_ecrit", programme: "expire" });
    expect(await versionsListees(tripId)).toEqual([premier]);
    expect((await lire(SQL_PROGRAMME, [tripId])).map((ligne) => ligne.contenu.trip?.version)).toEqual([premier]);
    expect(((await lireVersionCourante(poolReel, tripId)) as { trip: { version: string } }).trip.version).toBe(premier);

    const expire = voyage();
    await poser({ tripId: expire, ilYaMinutes: 60, statut: "programme_ecrit", programme: "expire" });
    await poser({ tripId: expire, ilYaMinutes: 10, statut: "programme_ecrit", programme: "expire" });
    expect(await versionsListees(expire)).toEqual([]);
    expect(await lire(SQL_PROGRAMME, [expire])).toEqual([]);
    expect(await lireVersionCourante(poolReel, expire)).toBeNull();
    expect(await lireBriefVersion(poolReel, expire)).toBeNull();
    expect(await lireProgrammeVersion(poolReel, expire)).toBeNull();
  });

  it("clés de révision : statut et ancienneté lus de la base (révision orpheline, 0126 § 2)", async () => {
    const tripId = voyage();
    const [premiere, seconde] = clesRevision(tripId, 2);
    await poser({ tripId, ilYaMinutes: 60, statut: "programme_ecrit", programme: "vivant" });
    await poser({ tripId, ilYaMinutes: 45, statut: "en_cours", requestId: premiere });
    const lues = await lireClesRevision(poolReel, [premiere!, seconde!]);
    expect(lues).toHaveLength(1);
    expect(lues[0]).toMatchObject({ requestId: premiere, statut: "en_cours" });
    // Horloge de la base : 45 minutes, à quelques secondes près.
    expect(lues[0]!.ecouleMs).toBeGreaterThanOrEqual(45 * 60_000);
    expect(lues[0]!.ecouleMs).toBeLessThan(46 * 60_000);
  });

  it("forfait réservé relu par l'étape : plafonds Google et part de modèles de la révision (0126 § 2 et § 2.1)", async () => {
    const LARGES: LimitesForfait = {
      quotaJourParMethode: 1_000_000_000,
      moisGoogleMicros: Number.MAX_SAFE_INTEGER,
      enveloppeGoogleMicros: Number.MAX_SAFE_INTEGER,
      moisModelesMicros: Number.MAX_SAFE_INTEGER,
      enveloppeModelesMicros: Number.MAX_SAFE_INTEGER,
    };
    const regles: ReglesForfait = { limites: LARGES, uniteQuotaRoutes: "elements", dureeMaxMs: 900_000 };
    const forfait = {
      nature: "execution" as const,
      textSearchRequetes: 39,
      placeDetailsRequetes: 39,
      routesRequetes: 14,
      routesElements: 192,
      coutGoogleMicros: 1_740_000,
      coutModelesMicros: 250_000,
    };
    const reservation = await reserverExecution(
      poolReel,
      { mode: "essai", brief: "saisi", variant: "A", commitSha: SHA, forfait, briefSaisi: { requestId: randomUUID(), contenu: BRIEF("révision réservée") } },
      regles,
    );
    expect(reservation.ok).toBe(true);
    if (!reservation.ok) return;
    expect(await lireExecution(poolReel, reservation.runId)).toMatchObject({
      mode: "essai",
      brief: "saisi",
      forfaitModelesMicros: 250_000,
      forfaitGoogle: { textSearch: 39, details: 39, routesRequetes: 14, routesElements: 192 },
    });
  });
});
