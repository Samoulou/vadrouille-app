import "server-only";

import { creationDeSessionBranchee } from "@/adapters";

/**
 * Connexion récente (spécification M9 § 1.3 et § 6.1 ; handover back-end § 12 ; ticket 1097, M9a, qui crée ce module ;
 * M9b le reprend pour la suppression sans en changer la forme). L'export et la suppression du compte exigent une
 * **vérification de code réussie depuis moins de 10 minutes** ; au-delà, l'appelant répond `reauthentication_required`
 * sans rien lire ni supprimer.
 *
 * Mesure (forme T1 proposée par la spécification, **à confirmer par la revue** du Tech Lead et de la Sécurité, S1) :
 * `sessions.created_at` de la session du cookie. Une session n'est créée que par une vérification de code réussie
 * (`verifyCode` → `signInEmailOTP`), qui en ouvre toujours une **nouvelle** (y compris quand la personne est déjà
 * connectée : le nouveau cookie remplace l'ancien) ; Better Auth 1.7.7 écrit `createdAt` à la création et ne le change
 * jamais à la prolongation de `SESSION.prolongationSecondes` (`src/tenancy/options.ts`) : `getSession` appelle
 * `updateSession` avec `expiresAt` et `updatedAt` seulement, et la bibliothèque mesure elle-même la fraîcheur d'une
 * session sur `createdAt` (`freshSessionMiddleware`). Aucune migration. L'ancienne session reste valable jusqu'à son
 * échéance (sort à trancher par S1).
 *
 * Bornes : récente si `maintenant − créée < 10 min` (9 min 59 s : récente ; 10 min 00 s : ancienne). Une session
 * inconnue, expirée ou illisible n'est jamais récente (échec fermé). Un instant de création postérieur à l'horloge (écart
 * d'horloge entre deux instances) est tenu pour récent : seule une vérification de code crée une session.
 */

/** Fenêtre de la connexion récente : 10 minutes (handover § 12 ; spécification M9 § 1.3 point 1). */
export const FENETRE_CONNEXION_RECENTE_MS = 10 * 60 * 1000;

/** Vrai si la session créée à `creeeLe` est récente à l'instant `maintenant`. */
export function connexionRecente(creeeLe: Date | null, maintenant: Date): boolean {
  if (creeeLe === null) return false;
  const ecart = maintenant.getTime() - creeeLe.getTime();
  return Number.isFinite(ecart) && ecart < FENETRE_CONNEXION_RECENTE_MS;
}

/** Contrôle de la connexion récente d'une session : `true` si récente, `false` sinon (`reauthentication_required`). */
export type ControleConnexionRecente = (sessionId: string, maintenant: Date) => Promise<boolean>;

/**
 * Contrôle sur une lecture injectée de l'instant de création (tests) ; une lecture qui lève donne `false` (échec fermé :
 * un code de plus, jamais un export sans connexion récente).
 */
export function creerControleConnexionRecente(creationDeSession: (sessionId: string) => Promise<Date | null>): ControleConnexionRecente {
  return async (sessionId, maintenant) => {
    try {
      return connexionRecente(await creationDeSession(sessionId), maintenant);
    } catch {
      return false;
    }
  };
}

let parDefaut: ControleConnexionRecente | undefined;

/**
 * Contrôle du serveur : instant lu par `readSessionCreatedAt` des opérations branchées au démarrage
 * (`creationDeSessionBranchee`, `authOperations()` de `src/server/auth`, rôle `vadrouille_auth`).
 */
export function controleConnexionRecente(sessionId: string, maintenant: Date): Promise<boolean> {
  parDefaut ??= creerControleConnexionRecente(creationDeSessionBranchee);
  return parDefaut(sessionId, maintenant);
}
