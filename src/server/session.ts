import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { type AuthOperations, authOperations } from "@/server/auth";

/**
 * Contexte de requête serveur (spécification B3, B3b point 9 ; décision 0077 § 5.3, B3-TL-4). La session est lue par
 * l'opération de lecture de la liste blanche (`readSession`, rôle `vadrouille_auth`), qui vérifie l'adhésion à
 * l'organisation active et son rôle et refuse une organisation en suppression (droits `SELECT` et politiques
 * `organizations_auth` et `memberships_auth` de B1, sans droit nouveau ; amendement de 0007).
 *
 * Aucun identifiant d'organisation, d'utilisateur ou de rôle n'est lu dans l'entrée, l'adresse, un en-tête autre que
 * le cookie de session, ni un champ de formulaire : seul l'en-tête `Cookie` est transmis à la bibliothèque. Rend
 * `{ organizationId, userId, role }` ou `null`. B3c y branche `getRequestContext()` (`src/adapters/context.ts`).
 */

export type ServerRequestContextOptions = {
  /** En-têtes de la requête ; par défaut, ceux de Next.js (`next/headers`). */
  readonly headers?: Headers;
  /** Opérations injectées (tests) ; par défaut, `authOperations()`. */
  readonly operations?: AuthOperations;
};

/** Seul le cookie est transmis : aucun autre en-tête ne peut porter un identifiant. */
function cookieSeulement(source: Headers): Headers {
  const filtres = new Headers();
  const cookie = source.get("cookie");
  if (cookie !== null) filtres.set("cookie", cookie);
  return filtres;
}

export async function getServerRequestContext(options: ServerRequestContextOptions = {}): Promise<AdapterContext | null> {
  const source = options.headers ?? new Headers(await (await import("next/headers")).headers());
  const operations = options.operations ?? authOperations();
  const session = await operations.readSession(cookieSeulement(source));
  if (session === null) return null;
  return { organizationId: session.organizationId, userId: session.userId, role: session.role };
}
