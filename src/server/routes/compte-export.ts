import "server-only";

import { authAdapterChoice, isApiAdapter, sessionBranchee } from "@/adapters";
import type { AdapterContext } from "@/adapters/types";
import type { ApiError } from "@/contracts/errors";
import { EXPORT_TAILLE_MAX_OCTETS, exportCompte, ExportTropVolumineuxError, nomFichierExport, type ResultatExport, serialiserExport } from "@/server/account/export";
import { controleConnexionRecente } from "@/server/account/reauthentification";
import { errorNameOf, logEvent } from "@/server/log";
import { verdictRateLimit, type RateLimitRequest, type RateLimitVerdict } from "@/server/rate-limit";

/**
 * Route `GET /api/v1/compte/export`, « Exporter mes données » (spécification M9 § 3.5 et § 6.2 ; ticket 1097, M9a), sur le
 * modèle du calendrier (`src/server/routes/calendrier.ts`). Forme T2 proposée par la spécification (route `GET` plutôt
 * qu'action serveur : le téléchargement par le navigateur s'y prête mieux), **à confirmer par la revue** du Tech Lead et de
 * la Sécurité (S3). Importé seulement par `src/app/api/v1/compte/export/route.ts` (`ligne/route-handlers`).
 *
 * Contrôles, dans cet ordre, tous avant la moindre lecture de l'export :
 * 1. adaptateur `api` avec la connexion réelle (`better-auth`) seulement, sinon 404 sans corps (`mock` : M9c, T8) ;
 * 2. demande intersite (`Sec-Fetch-Site: cross-site` ou `same-site`) ou préchargement (`Sec-Purpose`, `Purpose`,
 *    `Next-Router-Prefetch`) : 403 `forbidden` ; un paramètre dans l'adresse (organisation, personne…) : 400
 *    `validation_failed`. L'organisation et la personne viennent **de la session seule** ;
 * 3. session du cookie (`readSession` des opérations branchées au démarrage, `sessionBranchee` de `@/adapters`) : sans
 *    session, 401 `unauthenticated` ; lecture en échec (connexion non branchée, base) : 500 `internal` ;
 * 4. rôle `owner` exigé, sinon 403 `forbidden` (T9 : `forbidden` proposé, `not_found` possible) ;
 * 5. organisation personnelle à un seul membre (M9-PO-2), sinon 403 `forbidden` ;
 * 6. connexion récente (`src/server/account/reauthentification.ts`, moins de 10 minutes), sinon 401
 *    `reauthentication_required` ;
 * 7. limite `export` par personne (`src/server/config/limites.ts`), sinon 429 `rate_limited` : seul refus qui débite ;
 * 8. fichier construit dans une transaction en lecture (`src/server/account/export.ts`) ; échec ou taille au-delà de
 *    `EXPORT_TAILLE_MAX_OCTETS` : 500 `internal` et une ligne `compte.export_failed` (`errorName` seul).
 * Les refus portent un corps `ApiError` (`application/json`) pour que l'écran (M9c) choisisse l'étape suivante (code à
 * demander, connexion). Toute réponse porte `Cache-Control: private, no-store` et `X-Content-Type-Options: nosniff` ; le
 * fichier, en plus, `Content-Type: application/json; charset=utf-8` et `Content-Disposition: attachment;
 * filename="vadrouille-mes-donnees-AAAA-MM-JJ.json"` (date de Zurich, aucun texte de la personne dans un en-tête). Aucune
 * copie, aucun journal du contenu, aucun appel externe, aucune mesure.
 */

/** Nom d'action du limiteur (`src/server/config/limites.ts`). */
export const ACTION_LIMITEUR = "export";

/** Session lue : identifiants seulement, jamais le jeton. */
export type SessionExport = NonNullable<Awaited<ReturnType<typeof sessionBranchee>>>;

/**
 * Limiteur de la route : action `export`, espèce `user` (identifiant de la personne lu dans la session). `verdict` :
 * `verdictRateLimit` du serveur ; un test passe un limiteur sur pool simulé avec la configuration réelle.
 */
export function limiteurExport(verdict: (request: RateLimitRequest) => Promise<RateLimitVerdict> = verdictRateLimit) {
  return (request: Request, userId: string): Promise<RateLimitVerdict> => verdict({ action: ACTION_LIMITEUR, headers: request.headers, userId });
}

/** Dépendances de la route, injectables par les tests (aucune base, aucun `process.env`). */
export type DependancesExport = {
  readonly adaptateur: () => "api" | "autre";
  /** Session du cookie de la requête, `null` sans session. */
  readonly session: (request: Request) => Promise<SessionExport | null>;
  /** Organisation personnelle à un seul membre, la personne propriétaire. */
  readonly organisationAdmise: (ctx: AdapterContext) => Promise<boolean>;
  /** Connexion récente de la session à l'instant donné. */
  readonly connexionRecente: (sessionId: string, maintenant: Date) => Promise<boolean>;
  readonly limiteur: (request: Request, userId: string) => Promise<RateLimitVerdict>;
  readonly construire: (ctx: AdapterContext, maintenant: Date) => Promise<ResultatExport>;
  readonly maintenant: () => Date;
};

/** Seul le cookie est transmis à la lecture de la session (modèle de `src/server/session.ts`). */
function cookieSeulement(source: Headers): Headers {
  const filtres = new Headers();
  const cookie = source.get("cookie");
  if (cookie !== null) filtres.set("cookie", cookie);
  return filtres;
}

const PAR_DEFAUT: DependancesExport = {
  adaptateur: () => (isApiAdapter() && authAdapterChoice() === "better-auth" ? "api" : "autre"),
  session: (request) => sessionBranchee(cookieSeulement(request.headers)),
  organisationAdmise: (ctx) => exportCompte().organisationAdmise(ctx),
  connexionRecente: controleConnexionRecente,
  limiteur: limiteurExport(),
  construire: (ctx, maintenant) => exportCompte().construire(ctx, maintenant),
  maintenant: () => new Date(),
};

const EN_TETES_COMMUNS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

const sansCorps = (status: number) => new Response(null, { status, headers: { ...EN_TETES_COMMUNS } });

function refus(status: number, erreur: ApiError): Response {
  return new Response(JSON.stringify(erreur), { status, headers: { ...EN_TETES_COMMUNS, "Content-Type": "application/json; charset=utf-8" } });
}

/** Échec de la base ou du contrat : une ligne `compte.export_failed` (`errorName` seul), 500 `internal`. */
function echec(erreur: unknown): Response {
  const errorName = errorNameOf(erreur);
  logEvent("compte.export_failed", errorName === undefined ? {} : { errorName }, "error");
  return refus(500, { code: "internal", retryable: true });
}

/** Demande venue d'un autre site, ou préchargement (jamais un geste de la personne). */
function intersiteOuPrechargement(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return true;
  const but = `${headers.get("sec-purpose") ?? ""} ${headers.get("purpose") ?? ""}`.toLowerCase();
  return but.includes("prefetch") || headers.has("next-router-prefetch");
}

export function creerRouteExport(surcharges: Partial<DependancesExport> = {}): (request: Request) => Promise<Response> {
  const d: DependancesExport = { ...PAR_DEFAUT, ...surcharges };
  return async (request) => {
    if (d.adaptateur() !== "api") return sansCorps(404);
    if (intersiteOuPrechargement(request.headers)) return refus(403, { code: "forbidden" });
    if (new URL(request.url).search !== "") return refus(400, { code: "validation_failed" });
    let session: SessionExport | null;
    try {
      session = await d.session(request);
    } catch (erreur) {
      return echec(erreur);
    }
    if (session === null) return refus(401, { code: "unauthenticated" });
    const ctx: AdapterContext = { organizationId: session.organizationId, userId: session.userId, role: session.role };
    if (ctx.role !== "owner") return refus(403, { code: "forbidden" });
    let admise: boolean;
    try {
      admise = await d.organisationAdmise(ctx);
    } catch (erreur) {
      return echec(erreur);
    }
    if (!admise) return refus(403, { code: "forbidden" });
    const maintenant = d.maintenant();
    if (!(await d.connexionRecente(session.sessionId, maintenant))) return refus(401, { code: "reauthentication_required" });
    if (!(await d.limiteur(request, ctx.userId)).ok) return refus(429, { code: "rate_limited", retryable: true });
    let texte: string;
    try {
      const resultat = await d.construire(ctx, maintenant);
      if (!resultat.ok) return refus(403, { code: resultat.code });
      texte = serialiserExport(resultat.value);
      if (Buffer.byteLength(texte, "utf8") > EXPORT_TAILLE_MAX_OCTETS) throw new ExportTropVolumineuxError();
    } catch (erreur) {
      return echec(erreur);
    }
    return new Response(texte, {
      status: 200,
      headers: {
        ...EN_TETES_COMMUNS,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichierExport(maintenant)}"`,
      },
    });
  };
}

let parDefaut: ((request: Request) => Promise<Response>) | undefined;

/** Gestionnaire du serveur (session du cookie, limiteur et export en base), créé au premier appel. */
export function telechargerExport(request: Request): Promise<Response> {
  parDefaut ??= creerRouteExport();
  return parDefaut(request);
}
