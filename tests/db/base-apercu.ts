import { createDatabase } from "../../db/index";
import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { connectBaseJetable, type DbClient } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Base jetable des tests de l'aperçu (revue de la PR 563, mineur 24 / Q-B9c-4). Chaque forfait d'aperçu réserve 30 requêtes
 * Text Search et 30 fiches au registre d'usage, qui est en ajout seul : sur la base commune, la somme du jour des tests
 * de l'aperçu épuisait le quota de 1 000 requêtes par méthode que mesure `usage.test.ts`. Les tests de l'aperçu
 * tournent donc dans leur propre base (même serveur local, 127.0.0.1 seulement, `tests/db/env.ts`), créée vide, amorcée
 * (`db/bootstrap/roles.sql`), migrée par `db/migrate.ts`, puis supprimée. Aucune clé, aucun secret réel.
 */

export type BaseApercu = {
  readonly nom: string;
  /** Client Drizzle du rôle `vadrouille_app` sur la base jetable. */
  readonly db: ReturnType<typeof createDatabase>;
  readonly app: DbClient;
  readonly auth: DbClient;
  readonly admin: DbClient;
  supprimer(): Promise<void>;
};

export async function creerBaseApercu(suffixe: string): Promise<BaseApercu> {
  const nom = await creerBase(suffixe);
  await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
  const db = createDatabase("vadrouille_app", { VADROUILLE_DATABASE_URL: urlBaseJetable("app", nom) });
  const [app, auth, admin] = await Promise.all([connectBaseJetable("app", nom), connectBaseJetable("auth", nom), connectBaseJetable("admin", nom)]);
  return {
    nom,
    db,
    app,
    auth,
    admin,
    async supprimer() {
      await db.$client.end();
      await Promise.all([app.end(), auth.end(), admin.end()].map((p) => p.catch(() => undefined)));
      await supprimerBases();
    },
  };
}
