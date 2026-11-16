import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { withOrg } from "@/server/with-org";

import { type TransactionExport, transactionExportSur } from "./export";

/**
 * Adresse e-mail de la personne de la session, pour l'écran « Ton compte » (spécification M9 § 6.4, critère 1 : « la page
 * montre l'adresse de la session » ; § 1.3 point 2 : la réauthentification envoie le code à cette adresse, non
 * modifiable ; ticket 1122, M9c). La session (`AdapterContext`, `Session`) ne porte pas l'adresse : elle est lue dans
 * `users`, comme le bloc `account` de l'export (`src/server/account/export.ts`), par **la même transaction en lecture**
 * (`withOrg`, rôle `vadrouille_app`, RLS sur la personne de la session, `READ ONLY`) : aucun droit nouveau, aucun autre
 * rôle. La personne vient du contexte de la session seul, jamais d'une entrée.
 *
 * Ajout côté serveur fait par M9c faute de lecture existante : **à relire par le Tech Lead et la Sécurité** (description
 * de la PR). Aucun journal de l'adresse.
 */

const SQL_ADRESSE = "SELECT email FROM users WHERE id = $1";

type Contexte = Pick<AdapterContext, "organizationId" | "userId">;

/** Adresse de la personne du contexte, `null` si sa ligne est absente ou illisible. Peut lever (base). */
export type LectureAdresse = (ctx: Contexte) => Promise<string | null>;

/** Lecture sur une transaction injectée (tests : aucun accès à la base). */
export function creerLectureAdresse(transaction: TransactionExport): LectureAdresse {
  return (ctx) =>
    transaction(ctx, async (executeur) => {
      const lignes = (await executeur.query(SQL_ADRESSE, [ctx.userId])).rows;
      const email = lignes.length === 1 ? lignes[0]?.email : undefined;
      return typeof email === "string" && email !== "" ? email : null;
    });
}

let parDefaut: LectureAdresse | undefined;

/** Lecture du serveur : transaction de l'export (`transactionExportSur(withOrg)`). */
export function adresseDuCompte(ctx: Contexte): Promise<string | null> {
  parDefaut ??= creerLectureAdresse(transactionExportSur(withOrg));
  return parDefaut(ctx);
}
