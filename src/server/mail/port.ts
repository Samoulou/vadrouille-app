import "server-only";

import type { CanonicalEmail } from "@/server/email";

/**
 * Port d'envoi du code de connexion (spécification B3, B3b point 2 ; noms fixés par la décision 0077 § 5.6). Une seule
 * opération : le destinataire est la forme canonique rendue par `parseEmailAddress` (type de marque), le code et sa
 * durée de validité. Le port ne reçoit ni objet, ni corps, ni en-tête, ni option de transport : la composition du
 * message et son envoi appartiennent à l'implémentation (B3b-envoi).
 *
 * Implémentations : `disabledCodeMailer` (`./disabled.ts`), seule implémentation sous `src/` jusqu'à B3b-envoi ; un
 * double de capture hors de `src/` pour les tests (`tests/support/capture-code-mailer.ts`). Le port est **injecté**
 * dans la configuration de `src/server/auth`, jamais choisi par une variable d'environnement.
 *
 * Contrat : un refus ou une panne **lève** (l'opération de `src/server/auth` rend alors `provider_error`) ; le message
 * de l'erreur levée n'est jamais journalisé (seul `error.name` peut l'être, `src/server/log.ts`).
 */
export type LoginCodeMessage = {
  readonly to: CanonicalEmail;
  readonly code: string;
  readonly expiresInMinutes: number;
};

export interface CodeMailer {
  sendLoginCode(message: LoginCodeMessage): Promise<void>;
}
