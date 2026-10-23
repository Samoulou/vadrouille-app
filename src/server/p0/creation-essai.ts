import "server-only";

import { cookies } from "next/headers";

import type { EtatVoyageEssai, IssueLancementEssai, PortCreationEssai } from "@/adapters/prototype-creation";
import { lireIdentifiantVoyageSaisi, slugDestination } from "@/domain/identifiant";
import { joursEntre } from "@/domain/temps";
import { NOM_COOKIE_ACCES } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { lancerBriefSaisi, relancerBriefSaisi, reviserVoyageSaisi, type CleRevisionLue, type IssueLancementSaisi } from "@/server/p0/lancement";
import { poolLectureProgrammes } from "@/server/p0/lecture-programmes";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Création d'un voyage d'essai depuis l'app (spécification E2E-essai, lot 3 ; décision 0125 § 2 et § 4) : port de
 * l'adaptateur `prototype` (`src/adapters/prototype-creation.ts`), **branché au démarrage** par `src/instrumentation.ts`
 * comme la lecture des programmes réels. Ce module lit le cookie d'accès de la requête et le pool `vadrouille_prototype` ;
 * l'adaptateur n'importe ni la base, ni la garde, ni les workflows.
 *
 * - `lancer` et `relancer` : `lancerBriefSaisi` et `relancerBriefSaisi` (même garde que `/prototype/executions`) ;
 * - `reviser` : `reviserVoyageSaisi` (décision 0126), même garde ; brief de la version servie et clés de révision lus
 *   dans la réservation ;
 * - `etat` : barrière de la lecture des programmes (garde ouverte **et** cookie d'accès valide, sinon `null` sans
 *   connexion), puis l'état de l'exécution du voyage (`en_cours`, `programme_ecrit`, `arretee`) et le nombre de jours du
 *   séjour, lus en lecture seule ; un identifiant qui n'est pas celui d'un voyage de l'app, une exécution inconnue, un
 *   brief expiré ou une autre destination : `null`.
 * Aucun journal : ni brouillon, ni brief, ni récit.
 */

/** Délai d'une lecture de l'état (comme la lecture des programmes, `DELAI_LECTURE_MS`). */
const DELAI_ETAT_MS = 5000;

/** État de l'exécution d'un voyage de l'app et dates de son brief (aucune autre valeur du brief n'est lue). */
export const SQL_ETAT_VOYAGE_SAISI = `SELECT r.status, b.brief ->> 'destination' AS destination, b.brief ->> 'arrivee' AS arrivee, b.brief ->> 'depart' AS depart
FROM prototype.runs AS r JOIN prototype.run_briefs AS b ON b.run_id = r.id
WHERE r.id = $1::uuid AND r.brief = 'saisi'`;

/** Brief saisi d'une exécution arrêtée, pour « Réessayer » (relu dans la réservation, garde ouverte). */
export const SQL_BRIEF_ARRETE = `SELECT b.brief FROM prototype.runs AS r JOIN prototype.run_briefs AS b ON b.run_id = r.id
WHERE r.id = $1::uuid AND r.brief = 'saisi' AND r.status = 'arretee'`;

/**
 * Brief saisi de l'exécution qui a écrit la **version servie** du voyage (la plus récente non expirée, décision 0126
 * § 1), pour une révision (relu dans la réservation, garde ouverte). Aucune ligne pour un voyage d'un brief commité.
 */
export const SQL_BRIEF_VERSION = `SELECT b.brief, p.contenu FROM prototype.programmes AS p
JOIN prototype.runs AS r ON r.id = p.run_id
JOIN prototype.run_briefs AS b ON b.run_id = r.id
WHERE p.contenu #>> '{trip,id}' = $1::text AND p.expires_at > pg_catalog.now() AND r.brief = 'saisi' AND r.status = 'programme_ecrit'
ORDER BY r.started_at DESC, r.id DESC LIMIT 1`;

/**
 * Clés de révision déjà écrites parmi celles données (décision 0126 § 2), avec le statut de leur exécution et son
 * ancienneté, mesurée par l'horloge de la base (révision orpheline : 0126 § 2).
 */
export const SQL_CLES_REVISION = `SELECT b.request_id::text AS request_id, r.status,
  (EXTRACT(EPOCH FROM pg_catalog.now() - r.started_at) * 1000)::bigint AS ecoule_ms
FROM prototype.run_briefs AS b JOIN prototype.runs AS r ON r.id = b.run_id
WHERE b.request_id = ANY($1::uuid[])`;

const ETATS: ReadonlySet<string> = new Set(["en_cours", "programme_ecrit", "arretee"]);
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** Une requête en lecture seule, bornée dans le temps ; toute erreur de la base remonte (l'adaptateur la réduit). */
async function lireUne(pool: PoolSql, texte: string, valeurs: readonly unknown[]): Promise<Record<string, unknown> | undefined> {
  const client: ClientSql = await pool.connect();
  let enTransaction = false;
  try {
    await client.query("BEGIN READ ONLY");
    enTransaction = true;
    await client.query(`SET LOCAL statement_timeout = ${DELAI_ETAT_MS}`);
    const ligne = (await client.query(texte, valeurs)).rows[0];
    await client.query("COMMIT");
    enTransaction = false;
    return ligne;
  } catch (erreur) {
    if (enTransaction) await client.query("ROLLBACK").catch(() => undefined);
    throw erreur;
  } finally {
    client.release();
  }
}

/** État du voyage de l'app `tripId`, ou `null` (identifiant d'un autre voyage, exécution inconnue, autre destination). */
export async function lireEtatVoyageSaisi(pool: PoolSql, tripId: string): Promise<EtatVoyageEssai | null> {
  const lu = lireIdentifiantVoyageSaisi(tripId);
  if (lu === null) return null;
  const ligne = await lireUne(pool, SQL_ETAT_VOYAGE_SAISI, [lu.runId]);
  if (ligne === undefined) return null;
  const { status, destination, arrivee, depart } = ligne;
  if (typeof status !== "string" || !ETATS.has(status) || typeof destination !== "string" || slugDestination(destination) !== lu.slug) return null;
  if (typeof arrivee !== "string" || typeof depart !== "string" || !DATE.test(arrivee) || !DATE.test(depart)) return null;
  const jours = joursEntre(arrivee, depart) + 1;
  if (!Number.isSafeInteger(jours) || jours < 1) return null;
  return { etat: status as EtatVoyageEssai["etat"], jours };
}

/** Brief saisi de l'exécution arrêtée du voyage `tripId`, ou `null`. */
export async function lireBriefArrete(pool: PoolSql, tripId: string): Promise<unknown> {
  const lu = lireIdentifiantVoyageSaisi(tripId);
  if (lu === null) return null;
  return (await lireUne(pool, SQL_BRIEF_ARRETE, [lu.runId]))?.brief ?? null;
}

/** Brief saisi de la version servie du voyage `tripId`, ou `null`. */
export async function lireBriefVersion(pool: PoolSql, tripId: string): Promise<unknown> {
  if (lireIdentifiantVoyageSaisi(tripId) === null) return null;
  return (await lireUne(pool, SQL_BRIEF_VERSION, [tripId]))?.brief ?? null;
}

/**
 * Programme de la version servie du voyage `tripId` (même ligne que `lireBriefVersion`), ou `null` : base des plafonds
 * Google de la révision (décision 0126 § 2.1). Validé par `plafondsGoogleRevision`, jamais rendu ni journalisé.
 */
export async function lireProgrammeVersion(pool: PoolSql, tripId: string): Promise<unknown> {
  if (lireIdentifiantVoyageSaisi(tripId) === null) return null;
  return (await lireUne(pool, SQL_BRIEF_VERSION, [tripId]))?.contenu ?? null;
}

/**
 * Clés de révision écrites parmi `cles`, avec le statut de leur exécution et son ancienneté. Toute clé présente est
 * rendue, même d'un statut inattendu (elle est alors prise, jamais libre ni « en cours » : mineur 7 de la revue de la
 * PR 717) ; une ancienneté illisible vaut `null`.
 */
export async function lireClesRevision(pool: PoolSql, cles: readonly string[]): Promise<CleRevisionLue[]> {
  const client: ClientSql = await pool.connect();
  let enTransaction = false;
  try {
    await client.query("BEGIN READ ONLY");
    enTransaction = true;
    await client.query(`SET LOCAL statement_timeout = ${DELAI_ETAT_MS}`);
    const lignes = (await client.query(SQL_CLES_REVISION, [[...cles]])).rows;
    await client.query("COMMIT");
    enTransaction = false;
    return lignes.flatMap((ligne) => {
      if (typeof ligne.request_id !== "string") return [];
      const ecoule = ligne.ecoule_ms === null || ligne.ecoule_ms === undefined ? Number.NaN : Number(ligne.ecoule_ms);
      return [{ requestId: ligne.request_id, statut: typeof ligne.status === "string" ? ligne.status : "inconnu", ecouleMs: Number.isSafeInteger(ecoule) && ecoule >= 0 ? ecoule : null }];
    });
  } catch (erreur) {
    if (enTransaction) await client.query("ROLLBACK").catch(() => undefined);
    throw erreur;
  } finally {
    client.release();
  }
}

const issue = (resultat: IssueLancementSaisi): IssueLancementEssai => resultat;

const cookieAcces = async (): Promise<string | undefined> => (await cookies()).get(NOM_COOKIE_ACCES)?.value;

/** Port branché sur l'adaptateur `prototype` (`brancherCreationEssai`). */
export const creationEssai: PortCreationEssai = {
  async lancer(demande) {
    return issue(await lancerBriefSaisi(demande, { cookie: await cookieAcces(), pool: poolPrototype }));
  },
  async relancer(demande) {
    return issue(await relancerBriefSaisi(demande, { cookie: await cookieAcces(), pool: poolPrototype, briefArrete: lireBriefArrete }));
  },
  async reviser(demande) {
    return reviserVoyageSaisi(demande, { cookie: await cookieAcces(), pool: poolPrototype, briefVersion: lireBriefVersion, clesEcrites: lireClesRevision, versionServie: lireProgrammeVersion });
  },
  async etat(tripId) {
    const pool = await poolLectureProgrammes();
    return pool === null ? null : lireEtatVoyageSaisi(pool, tripId);
  },
};
