"use server";

import { headers } from "next/headers";

import { authAdapterChoice, getAuthAdapter, isApiAdapter, sessionBranchee } from "@/adapters";
import { getSimulationScope } from "@/adapters/simulation";
import { CodeRequestSchema, CodeVerificationSchema, fail, ok, type ApiError, type Result } from "@/contracts";
import type { ApiErrorCode } from "@/contracts/values";
import { ACTION_LIMITEUR_SUPPRESSION, type CompteSupprime, supprimerMonCompte, suppressionCompte } from "@/server/account/delete";
import { controleConnexionRecente } from "@/server/account/reauthentification";
import { verdictRateLimit } from "@/server/rate-limit";

import { parseInput } from "../parse-input";

/**
 * Actions serveur de la connexion par code (écran 4 ; décision 0017 § 3.3 et § 3.4, F8-PO-9, F8-PO-17 ; spécification
 * B3, B3c point 2). Actions anonymes : 1. `parseInput` de l'entrée reçue en `unknown` (`validation_failed`, sans appel à
 * l'adaptateur : aucun essai consommé, aucune demande comptée) ; 2. adaptateur `auth` de `getAuthAdapter()` : simulé
 * (`mock`, portée de simulation de la requête) ou réel (`better-auth`, qui suit l'ordre `parseEmailAddress` → limiteur
 * (adresse IP, puis e-mail) → opération, `src/adapters/better-auth.ts`). Aucune organisation n'est reçue du client.
 * **Aucun journal** : ni adresse, ni code (règle `no-console` et test « aucune donnée journalisée »).
 *
 * Les réponses sont les mêmes pour une adresse connue ou inconnue : la réussite ne renvoie aucune donnée de session au
 * navigateur (en phase 0, la session vit dans la portée de simulation, sans cookie : 0017 § 3.5 ; avec `better-auth`,
 * dans le cookie posé par la bibliothèque). Une erreur de l'adaptateur de la liste de l'action est rendue telle quelle
 * (`retryable` compris) ; toute autre erreur, garde fermée comprise, devient `provider_error`, sans détail.
 */

const REQUEST_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>(["validation_failed", "rate_limited", "provider_error", "email_cap_reached"]);
const VERIFY_ERRORS: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  "validation_failed",
  "rate_limited",
  "code_expired",
  "too_many_attempts",
  "invalid_code",
  "unauthenticated",
  "provider_error",
]);

export type CodeSent = { sent: true };
export type SignedIn = { signedIn: true };
export type SignedOut = { signedOut: true };

/** Erreur de l'adaptateur rendue telle quelle si son code est dans `admis`, sinon `provider_error`. */
function erreurAdmise<T>(error: ApiError, admis: ReadonlySet<ApiErrorCode>): Result<T> {
  return admis.has(error.code) ? { ok: false, error } : fail("provider_error");
}

export async function requestCode(input: unknown): Promise<Result<CodeSent>> {
  const parsed = parseInput(CodeRequestSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  try {
    const adapter = getAuthAdapter({ scope });
    const result = await adapter.requestCode(parsed.value);
    if (!result.ok) return erreurAdmise(result.error, REQUEST_ERRORS);
    return ok({ sent: true });
  } catch {
    // Garde fermée (0017 § 11.2) ou erreur de l'adaptateur : erreur générique, sans détail.
    return fail("provider_error");
  }
}

export async function verifyCode(input: unknown): Promise<Result<SignedIn>> {
  const parsed = parseInput(CodeVerificationSchema, input);
  if (!parsed.ok) return parsed;
  const scope = await getSimulationScope();
  try {
    const adapter = getAuthAdapter({ scope });
    const result = await adapter.verifyCode(parsed.value);
    if (!result.ok) return erreurAdmise(result.error, VERIFY_ERRORS);
    return ok({ signedIn: true });
  } catch {
    return fail("provider_error");
  }
}

/**
 * Déconnexion (B3-PO-7) : ferme la session de la requête et efface son cookie ; idempotente (sans session, réussit sans
 * rien faire) ; ne touche pas les autres sessions de la personne. Aucune entrée. Où l'interface la propose : question 5
 * de la spécification B3 (UX/UI) ; B3 livre l'action sans écran.
 */
export async function signOut(): Promise<Result<SignedOut>> {
  const scope = await getSimulationScope();
  try {
    await getAuthAdapter({ scope }).signOut();
    return ok({ signedOut: true });
  } catch {
    return fail("provider_error");
  }
}

/**
 * Une session existe-t-elle dans la portée de simulation de la requête (F8c) ? Lu par les pages `R4` et `R-lancer`
 * (composants serveur) : une personne déjà connectée saute l'écran 4 (F8-PO-2), et `R-lancer` n'appelle `createTrip`
 * qu'avec une session (garde du lancement, simple confort : `createTrip` vérifie lui-même la session). Aucune donnée de
 * session n'est renvoyée ; garde fermée de l'adaptateur `auth` ou erreur : `false`.
 */
export async function hasSession(): Promise<boolean> {
  const scope = await getSimulationScope();
  try {
    return (await getAuthAdapter({ scope }).getSession()) !== null;
  } catch {
    return false;
  }
}

export type AccountDeleted = CompteSupprime;

/**
 * « Supprimer mon compte » (M9b, ticket 1106 ; spécification M9 § 4 et § 6.3 ; handover § 12). **Aucune entrée** :
 * l'organisation et la personne viennent de la session seule. Tout est dans `supprimerMonCompte`
 * (`src/server/account/delete.ts`), qui fixe l'ordre des contrôles ; erreurs : `not_found` (hors de `api` avec la connexion
 * réelle : la suppression n'est pas proposée sur `mock`), `unauthenticated`, `forbidden` (conseiller, organisation
 * partagée ; avec `field: "payment"` : paiement en attente, forme T6 à confirmer), `reauthentication_required`,
 * `rate_limited`, `internal`. Après la réussite, plus aucune session n'existe ; le cookie est effacé si possible.
 */
export async function deleteAccount(): Promise<Result<AccountDeleted>> {
  return supprimerMonCompte({
    disponible: () => isApiAdapter() && authAdapterChoice() === "better-auth",
    session: async () => {
      const filtres = new Headers();
      const cookie = (await headers()).get("cookie");
      if (cookie !== null) filtres.set("cookie", cookie);
      return sessionBranchee(filtres);
    },
    connexionRecente: controleConnexionRecente,
    limiteur: async (userId) => verdictRateLimit({ action: ACTION_LIMITEUR_SUPPRESSION, headers: new Headers(await headers()), userId }),
    compte: { decision: (ctx) => suppressionCompte().decision(ctx), supprimer: (ctx) => suppressionCompte().supprimer(ctx) },
    maintenant: () => new Date(),
    effacerCookie: async () => getAuthAdapter({ scope: await getSimulationScope() }).signOut(),
  });
}
