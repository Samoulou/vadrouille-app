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
 * module n'importe que le code `missing_key` de `@/server/env/egress` (admis dans tout `src/grounding`) : le port de
 * consommation et le module de la clé ne sont importés que par les deux clients (exceptions nominatives de 0031 § 5).
 */

/** Signature du transport : celle du `fetch` global, toujours appelée à travers l'enveloppe. */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

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
] as const;
export type CodeErreurGoogle = (typeof CODES_ERREUR_GOOGLE)[number];

const REESSAYABLES: ReadonlySet<CodeErreurGoogle> = new Set(["upstream_unavailable", "upstream_timeout", "upstream_rate_limited"]);

export class ErreurClientGoogle extends Error {
  readonly code: CodeErreurGoogle;
  readonly retryable: boolean;
  constructor(code: CodeErreurGoogle) {
    super(code);
    this.code = code;
    this.retryable = REESSAYABLES.has(code);
    this.name = "ErreurClientGoogle";
  }
}

export type RequeteGoogle = {
  readonly chemin: string;
  readonly methode: "GET" | "POST";
  readonly masque: string;
  readonly corps?: string;
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
    throw new ErreurClientGoogle("upstream_redirect");
  }
  if (reponse.status !== 200) {
    await abandonnerCorps(reponse);
    if (reponse.status === 429) throw new ErreurClientGoogle("upstream_rate_limited");
    if (reponse.status >= 500) throw new ErreurClientGoogle("upstream_unavailable");
    throw new ErreurClientGoogle("upstream_error");
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
