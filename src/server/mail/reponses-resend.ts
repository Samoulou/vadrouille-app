import "server-only";

/**
 * Correspondance des réponses de l'API de Resend (spécification B3d, point 5 ; décision 0138 § 7, noms constatés sur la
 * documentation publique le 2026-10-28). **Seul tableau** qui lit une réponse de Resend : il rend un résultat de
 * transport (succès, plafond, ou échec avec une raison de la liste fermée `RAISONS_ECHEC_RESEND`), **jamais** un code
 * d'`API_ERROR_CODES` ; il est distinct d'`ERREURS_BIBLIOTHEQUE` et d'`ERREURS_ENVOI` (`src/server/auth/erreurs.ts`).
 *
 * La correspondance se fait sur **le statut et le nom ensemble** ; le `message` n'est jamais lu, les en-têtes de la
 * réponse ne sont ni lus ni journalisés. Succès sur le statut 200 seul (0138 § 1.1 point 8) : le corps n'est pas lu.
 *
 * Seuls les noms qui changent le résultat sont écrits dans la liste fermée `NOMS_ERREUR_RESEND` : les autres noms de
 * 0138 § 7 donnent le même résultat que « autre nom » de leur statut (401 et 403 → `auth`, 400, 404, 405, 409 et 422 →
 * `invalid_request`, 5xx → `server_error`, 429 → `rate_limited`). Les noms de Resend qui finissent en `_api_key` ne sont
 * pas écrits ici : ce seraient des textes à nom secret du régime de confinement (spécification P0c, section 5), et leur
 * résultat (`auth`) est déjà celui de leur statut. Le repli ne donne jamais `quota` : un nom renommé par Resend fait au
 * pire passer un quota pour une panne (0138 § 7, « Quand revoir »).
 */

/** Raisons fermées d'un échec de l'envoi par Resend (événement `email.provider_refused`, spécification B3d, point 6). */
export const RAISONS_ECHEC_RESEND = [
  "quota",
  "rate_limited",
  "auth",
  "recipient_refused",
  "invalid_request",
  "server_error",
  "timeout",
  "network",
] as const;
export type RaisonEchecResend = (typeof RAISONS_ECHEC_RESEND)[number];

/** Noms d'erreur de Resend retenus (liste fermée, littérale) : seuls ceux qui changent le résultat de leur statut. */
export const NOMS_ERREUR_RESEND = ["daily_quota_exceeded", "monthly_quota_exceeded", "validation_error"] as const;
export type NomErreurResend = (typeof NOMS_ERREUR_RESEND)[number];

/** Résultat de transport : jamais un code d'`API_ERROR_CODES`, jamais une valeur reçue. */
export type ResultatResend =
  | { readonly issue: "succes" }
  | { readonly issue: "plafond"; readonly reason: "quota" }
  | { readonly issue: "echec"; readonly reason: Exclude<RaisonEchecResend, "quota"> };

/** Taille maximale lue d'un corps d'erreur (0138 § 1.1 point 9). */
export const OCTETS_CORPS_MAX = 4_096;

const SUCCES: ResultatResend = Object.freeze({ issue: "succes" });
const QUOTA: ResultatResend = Object.freeze({ issue: "plafond", reason: "quota" });
const echec = (reason: Exclude<RaisonEchecResend, "quota">): ResultatResend => Object.freeze({ issue: "echec", reason });

/** Statuts d'une requête refusée (0138 § 7) : `invalid_request`, quel que soit le nom. */
const STATUTS_REQUETE_REFUSEE: ReadonlySet<number> = new Set([400, 404, 405, 409, 422]);

/**
 * Nom d'erreur de Resend tiré d'un corps déjà borné (au plus `OCTETS_CORPS_MAX` octets) : seul le champ `name`, s'il
 * est une chaîne de `NOMS_ERREUR_RESEND`, est retenu ; tout autre contenu (JSON illisible, autre champ, autre nom)
 * donne `undefined`. Le corps n'est ni rendu, ni copié, ni journalisé.
 */
export function nomErreurResend(corps: string): NomErreurResend | undefined {
  let lu: unknown;
  try {
    lu = JSON.parse(corps);
  } catch {
    return undefined;
  }
  if (typeof lu !== "object" || lu === null || Array.isArray(lu) || !Object.hasOwn(lu, "name")) return undefined;
  const nom: unknown = (lu as { name?: unknown }).name;
  return NOMS_ERREUR_RESEND.find((admis) => admis === nom);
}

/** Tableau de 0138 § 7 : statut HTTP et nom retenu (ou `undefined`) → résultat de transport. */
export function traduireReponseResend(statut: number, nom: NomErreurResend | undefined): ResultatResend {
  if (statut === 200) return SUCCES;
  if (statut === 429) return nom === "daily_quota_exceeded" || nom === "monthly_quota_exceeded" ? QUOTA : echec("rate_limited");
  if (statut === 401) return echec("auth");
  if (statut === 403) return nom === "validation_error" ? echec("recipient_refused") : echec("auth");
  if (STATUTS_REQUETE_REFUSEE.has(statut)) return echec("invalid_request");
  // 500, 503, tout autre statut, 2xx autre que 200, 3xx.
  return echec("server_error");
}

/** Délai dépassé, échec réseau ou TLS, redirection refusée (`redirect: "error"`) : résultat sans réponse lue. */
export const ECHEC_DELAI: ResultatResend = echec("timeout");
export const ECHEC_RESEAU: ResultatResend = echec("network");
export const ECHEC_SERVEUR: ResultatResend = echec("server_error");
