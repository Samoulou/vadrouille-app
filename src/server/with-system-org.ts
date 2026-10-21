import "server-only";

import { sql } from "drizzle-orm";

import { createDatabase, type Database } from "../../db/index.ts";
// Chemin relatif (et non l'alias `@/`) : la commande de reprise du studio (`scripts/reprise-studio.ts`, 0087 § 1.6) charge ce
// module avec Node seul, sans résolveur d'alias.
import { executeurSql, WithOrgContextError, type OrgTransaction } from "./with-org.ts";

/** Exécuteur à paramètres liés de `with-org.ts`, réexporté pour la commande du studio (qui n'importe que ce module et la reprise). */
export { executeurSql };

/** Identifiant d'organisation valide : un `uuid` (même motif que `with-org.ts`, dont la liste d'exports est figée). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Contexte système d'une organisation (décisions 0081 B9-TL-12 point 3 et 0087 § 1.6 point 1) : ouvre la transaction de
 * l'organisation et pose `app.organization_id` **seul**, par un paramètre lié, sans `userId` (`withOrg` refuse un contexte
 * sans `userId`). Destinataires : les étapes des workflows de génération (aucune session n'existe dans une étape),
 * la suite du paiement, la réconciliation et la commande de reprise du studio. L'identifiant est validé comme `uuid` avant toute requête ; un refus lève
 * `WithOrgContextError`, sans valeur. Les politiques de sécurité par ligne des tables métier ne dépendent que de
 * `app.organization_id` : aucune ligne d'une autre organisation n'est visible. Ce module n'importe que l'accès à la base
 * et ce qu'exporte `with-org.ts`.
 */

type FonctionWithSystemOrg = <T>(organizationId: string, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

/** Fabrique liée à un client donné (tests). */
export function creerWithSystemOrg(database: Database): FonctionWithSystemOrg {
  return async (organizationId, fn) => {
    if (typeof organizationId !== "string" || !UUID.test(organizationId)) throw new WithOrgContextError();
    return database.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.organization_id', ${organizationId}, true)`);
      return fn(tx);
    });
  };
}

let parDefaut: FonctionWithSystemOrg | undefined;

/** Sur le client du rôle `vadrouille_app` de `db/index.ts`. */
export async function withSystemOrg<T>(organizationId: string, fn: (tx: OrgTransaction) => Promise<T>): Promise<T> {
  parDefaut ??= creerWithSystemOrg(createDatabase("vadrouille_app"));
  return parDefaut(organizationId, fn);
}
