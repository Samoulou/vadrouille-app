import "server-only";

import { z } from "zod";

import { TRIP_ID_PATTERN } from "@/contracts/values";
import {
  PROGRAMME_REDUIT_SCHEMA,
  PropositionReduiteSchema,
  TerminusReduitSchema,
  VoyageReduitSchema,
  type ProgrammeReduit,
} from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import type { SourceProgrammes } from "./prototype";

/**
 * Source des programmes **réels** de l'adaptateur `prototype` (décision 0074 ; spécification P0-suite-2, « P0r4 », partie
 * lecture) : les programmes écrits par `p0Run` dans `prototype.programmes`, lus pour « Mes voyages » et les pages du
 * voyage de la préversion de `p0-reel`.
 *
 * - **Lecture seule** : une transaction `BEGIN READ ONLY` par lecture (la base refuse toute écriture), deux requêtes
 *   `SELECT` fixes, valeurs en paramètres liés. Rôle : `vadrouille_prototype` (pool de la garde de connexion), dont la
 *   politique de lecture ne rend que les lignes d'`org_prototype` non expirées ; `expires_at > now()` est aussi écrit ici.
 * - **Même barrière que le lancement** (exigence 4) : `pool()` est injecté et rend `null` tant que la garde du mode réel
 *   est fermée ou que le cookie d'accès manque (`src/server/p0/page-acces.ts`) ; alors **aucune connexion** n'est
 *   ouverte, la liste est vide et un voyage est introuvable (404).
 * - **Aucune position** : `place_coordinates` n'est jamais lue (0052, S6) ; le programme est servi avec une table
 *   `positions` vide, donc sans carte (aucun point, ni sur une carte Google ni ailleurs).
 * - **Schéma strict** : le contenu est validé par la forme réduite **sans** `positions` (`ProgrammeEcritSchema`), et
 *   `trip.id` doit être l'identifiant demandé. Un contenu refusé n'est jamais servi ni journalisé.
 *
 * Erreur de base (connexion, requête) : `EchecLectureProgrammes`, sans message de la base ni valeur ; la page affiche
 * l'état d'erreur existant.
 */

/** Programme tel qu'écrit par `ecrireProgramme` : forme réduite sans `positions` (Q324, 0046 D15). */
export const ProgrammeEcritSchema = z
  .strictObject({
    schema: z.literal(PROGRAMME_REDUIT_SCHEMA),
    trip: VoyageReduitSchema,
    proposals: z.array(PropositionReduiteSchema).max(8),
    terminus: z.array(TerminusReduitSchema),
  })
  .superRefine((programme, ctx) => {
    const jours = programme.trip.days.map((jour) => jour.index);
    if (new Set(jours).size !== jours.length) ctx.addIssue({ code: "custom", message: "indices de jour en double", path: ["trip", "days"] });
    const joursTerminus = programme.terminus.map((terminus) => terminus.jour);
    if (jours.length !== joursTerminus.length || jours.some((jour, index) => joursTerminus.at(index) !== jour)) {
      ctx.addIssue({ code: "custom", message: "un terminus par jour, dans l'ordre des jours", path: ["terminus"] });
    }
    const connus = new Set(jours);
    if (programme.proposals.some((proposition) => !connus.has(proposition.day))) {
      ctx.addIssue({ code: "custom", message: "proposition d'un jour absent", path: ["proposals"] });
    }
  });

/** Identifiants des voyages des programmes non expirés, triés ; plafonnés (`PROGRAMMES_MAX`). */
export const SQL_IDS = `SELECT DISTINCT contenu #>> '{trip,id}' AS id FROM prototype.programmes
WHERE expires_at > pg_catalog.now() ORDER BY 1 LIMIT 201`;
/** Contenu du programme d'un voyage, s'il n'est pas expiré. */
export const SQL_PROGRAMME = `SELECT contenu FROM prototype.programmes
WHERE contenu #>> '{trip,id}' = $1::text AND expires_at > pg_catalog.now() LIMIT 2`;

/** Programmes listés au plus ; au-delà, la lecture échoue fermée (jamais une liste tronquée en silence). */
export const PROGRAMMES_MAX = 200;

export class EchecLectureProgrammes extends Error {
  constructor() {
    super("lecture des programmes du prototype impossible");
    this.name = "EchecLectureProgrammes";
  }
}

export interface SourceProgrammesReelsOptions {
  /** Pool `vadrouille_prototype` si la barrière est ouverte pour cette requête, sinon `null` (aucune lecture). */
  pool: () => Promise<PoolSql | null>;
}

/** Une connexion, une transaction en lecture seule ; toute erreur devient `EchecLectureProgrammes`. */
async function lectureSeule<T>(pool: PoolSql, lire: (client: ClientSql) => Promise<T>): Promise<T> {
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch {
    throw new EchecLectureProgrammes();
  }
  try {
    await client.query("BEGIN READ ONLY");
    const resultat = await lire(client);
    await client.query("COMMIT");
    return resultat;
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    throw new EchecLectureProgrammes();
  } finally {
    client.release();
  }
}

/** Contenu validé, rendu sous la forme réduite avec une table `positions` vide (aucune carte). */
function programmeServi(contenu: unknown, tripId: string): ProgrammeReduit | null {
  const resultat = ProgrammeEcritSchema.safeParse(contenu);
  if (!resultat.success || resultat.data.trip.id !== tripId) return null;
  return { ...resultat.data, positions: {} };
}

export function createSourceProgrammesReels({ pool }: SourceProgrammesReelsOptions): SourceProgrammes {
  return {
    async ids() {
      const ouvert = await pool();
      if (ouvert === null) return [];
      const lignes = await lectureSeule(ouvert, async (client) => (await client.query(SQL_IDS)).rows);
      if (lignes.length > PROGRAMMES_MAX) throw new EchecLectureProgrammes();
      return lignes.map((ligne) => ligne.id).filter((id): id is string => typeof id === "string" && TRIP_ID_PATTERN.test(id));
    },
    async lire(tripId) {
      // Motif vérifié avant toute connexion.
      if (typeof tripId !== "string" || !TRIP_ID_PATTERN.test(tripId)) return null;
      const ouvert = await pool();
      if (ouvert === null) return null;
      const lignes = await lectureSeule(ouvert, async (client) => (await client.query(SQL_PROGRAMME, [tripId])).rows);
      // Deux programmes pour un même voyage : aucun n'est servi (l'identifiant est unique par construction, 0071).
      if (lignes.length !== 1) return null;
      return programmeServi(lignes[0]?.contenu, tripId);
    },
  };
}
