import "server-only";

import { CODE_CLE_ABSENTE } from "@/server/env/egress";

/**
 * Enveloppe commune des clients Google réels (spécification de P0r1, « P0, suite : exécutions réelles », « Clients
 * réels », « Redirections et place de la clé »). Ce module n'ouvre aucune connexion et ne connaît aucun hôte : il
 * reçoit l'origine figée et le transport du module de capacité (`places-client.ts`, `routes-client.ts`), seul à les
 * nommer. Sur **chaque** requête, l'enveloppe (seule fonction qui appelle le transport) :
 * - refuse toute URL dont l'origine n'est pas l'origine figée, avant d'appeler le transport ;
 * - met la clé en en-tête `X-Goog-Api-Key` seulement, jamais dans l'URL ;
 * - impose `redirect: "manual"` et `cache: "no-store"` ;
 * - ne suit jamais une réponse 300 à 399 ou `opaqueredirect` : corps abandonné, `upstream_redirect`.
 * Aucun message, corps de réponse ni pile du fournisseur ne sort : seulement un code fermé. De `src/server`, ce
 * module n'importe que le code `missing_key` de `@/server/env/egress` (admis dans tout `src/grounding`), qui le
 * réexporte sous le même nom depuis `src/ai/erreurs.ts`, sa définition unique (décision 0077 § 3 point 1, module sans
 * import) : le port de consommation et le module de la clé ne sont importés que par les deux clients (exceptions
 * nominatives de 0031 § 5).
 */

/** Signature du transport : celle du `fetch` global, toujours appelée à travers l'enveloppe. */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Identifiant de lieu Google (base64url, 256 caractères au plus) : contrôlé avant toute interpolation dans un chemin
 * ou un corps, et sur chaque identifiant rendu. Commun à Places et Routes.
 */
export const PLACE_ID_GOOGLE = /^[A-Za-z0-9_-]{1,256}$/;

export const CODES_ERREUR_GOOGLE = [
  "production_refused",
  "proxy_env_refused",
  "tls_env_refused",
  CODE_CLE_ABSENTE,
  "cap_reached",
  "envelope_reached",
  "daily_quota_insufficient",
  "usage_unavailable",
  "invalid_request",
  "upstream_redirect",
  "upstream_unavailable",
  "upstream_timeout",
  "upstream_rate_limited",
  "upstream_error",
  "invalid_response",
  // B8a (décision 0085 § 2 point c, soumis au verdict de la Sécurité) : 404 d'une méthode Place Details posée avec
  // `introuvableSur404`. Ne sort jamais du client Places, qui le traduit en `ErreurAncrage("place_not_found")`.
  "upstream_not_found",
] as const;
export type CodeErreurGoogle = (typeof CODES_ERREUR_GOOGLE)[number];

const REESSAYABLES: ReadonlySet<CodeErreurGoogle> = new Set(["upstream_unavailable", "upstream_timeout", "upstream_rate_limited"]);

export class ErreurClientGoogle extends Error {
  readonly code: CodeErreurGoogle;
  readonly retryable: boolean;
  /**
   * Code HTTP d'une réponse de Google autre que 200 (entier de 100 à 599), seul diagnostic gardé de la réponse (journal
   * `p0.ville_refusee`, constat du 2026-10-25) ; jamais le corps. Absent pour toute autre erreur.
   */
  readonly status: number | undefined;
  constructor(code: CodeErreurGoogle, status?: number) {
    super(code);
    this.code = code;
    this.retryable = REESSAYABLES.has(code);
    this.name = "ErreurClientGoogle";
    this.status = status !== undefined && Number.isInteger(status) && status >= 100 && status <= 599 ? status : undefined;
  }
}

/**
 * Erreur levée par un client Google pour une issue refusée de `avecReservation` (forme structurelle : ce module
 * n'importe pas le port) : code de refus ou de délai tel quel ; erreur de l'enveloppe recréée par son code (aucune
 * pile ni cause d'origine ne sort) ; toute autre erreur, `upstream_error`.
 */
export function erreurGoogleDe(issue: { readonly code: CodeErreurGoogle } | { readonly erreur: unknown }): ErreurClientGoogle {
  if ("code" in issue) return new ErreurClientGoogle(issue.code);
  return issue.erreur instanceof ErreurClientGoogle ? new ErreurClientGoogle(issue.erreur.code, issue.erreur.status) : new ErreurClientGoogle("upstream_error");
}

export type RequeteGoogle = {
  readonly chemin: string;
  readonly methode: "GET" | "POST";
  readonly masque: string;
  readonly corps?: string;
  /**
   * Option fermée des seules méthodes Place Details du client Places (décision 0085 § 2 point c) : une réponse 404
   * (`NOT_FOUND`, identifiant obsolète ou inconnu) lève `upstream_not_found` au lieu d'`upstream_error`. Corps
   * abandonné comme pour toute autre réponse ; sans elle (Text Search, Routes), rien ne change.
   */
  readonly introuvableSur404?: true;
};

export type ParametresEnveloppe = {
  readonly origine: string;
  readonly cle: string;
  readonly transport: Transport;
};

/**
 * Seule fonction qui appelle le transport. `transportAppele` est signalé juste avant l'appel (réservation abandonnée
 * plutôt que libérée si la requête est partie).
 */
export async function envoyerGoogle(
  parametres: ParametresEnveloppe,
  requete: RequeteGoogle,
  signal: AbortSignal,
  transportAppele: () => void,
): Promise<unknown> {
  let url: URL;
  try {
    url = new URL(requete.chemin, parametres.origine);
  } catch {
    throw new ErreurClientGoogle("invalid_request");
  }
  if (url.origin !== parametres.origine || url.username !== "" || url.password !== "" || url.searchParams.has("key")) {
    throw new ErreurClientGoogle("invalid_request");
  }
  const entetes: Record<string, string> = {
    "X-Goog-Api-Key": parametres.cle,
    "X-Goog-FieldMask": requete.masque,
  };
  if (requete.corps !== undefined) entetes["Content-Type"] = "application/json";
  const init: RequestInit = {
    method: requete.methode,
    headers: entetes,
    redirect: "manual",
    cache: "no-store",
    signal,
    ...(requete.corps !== undefined ? { body: requete.corps } : {}),
  };
  let reponse: Response;
  transportAppele();
  try {
    reponse = await parametres.transport(url.href, init);
  } catch {
    if (signal.aborted) throw new ErreurClientGoogle("upstream_timeout");
    throw new ErreurClientGoogle("upstream_unavailable");
  }
  if (reponse.type === "opaqueredirect" || (reponse.status >= 300 && reponse.status < 400)) {
    await abandonnerCorps(reponse);
    throw new ErreurClientGoogle("upstream_redirect", reponse.status);
  }
  if (reponse.status !== 200) {
    await abandonnerCorps(reponse);
    if (reponse.status === 429) throw new ErreurClientGoogle("upstream_rate_limited", reponse.status);
    if (reponse.status >= 500) throw new ErreurClientGoogle("upstream_unavailable", reponse.status);
    if (reponse.status === 404 && requete.introuvableSur404 === true) throw new ErreurClientGoogle("upstream_not_found", reponse.status);
    throw new ErreurClientGoogle("upstream_error", reponse.status);
  }
  try {
    return (await reponse.json()) as unknown;
  } catch {
    throw new ErreurClientGoogle("invalid_response");
  }
}

async function abandonnerCorps(reponse: Response): Promise<void> {
  try {
    await reponse.body?.cancel();
  } catch {
    // Corps déjà consommé ou flux en erreur : rien ne sort.
  }
}
