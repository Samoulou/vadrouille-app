import { TRIP_ID_PATTERN } from "@/contracts/values";
import { creationRoutes } from "@/features/creation/routes";
import { presentationRoute } from "@/features/presentation/routes";
import { tripRoutes } from "@/features/sejour/routes";

/**
 * Paramètre `suite` de l'écran 4 (`/connexion?suite=…`, F8-PO-10, décision 0017 § 1) : le module qui écrit
 * l'adresse est celui qui la relit. `suite` ne contient jamais l'email, le récit ni aucune donnée du brouillon.
 */

const CONNEXION = "/connexion";
/** Longueur au-delà de laquelle la valeur est refusée. */
const MAX_SUITE_LENGTH = 200;

/** `R4(x)` : adresse de l'écran 4, `x` encodé par `encodeURIComponent`. */
export function connexionRoute(suite: string): string {
  return `${CONNEXION}?suite=${encodeURIComponent(suite)}`;
}

/**
 * Caractères de contrôle (U+0000 à U+001F, U+007F à U+009F), espaces (dont l'espace insécable), barre oblique
 * inversée, `%` (signe d'un double encodage : la valeur a déjà été décodée une fois), `?` et `#`.
 */
const FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\s\\%?#]/u;

/**
 * Normalise `suite`, valeur **déjà décodée une fois** (`searchParams` ou `URLSearchParams`) : ce module n'appelle
 * jamais `decodeURIComponent` ni `decodeURI`. Renvoie une adresse **reconstruite** à partir d'une forme de la liste
 * blanche, jamais la valeur reçue ; repli `/voyages` dans tous les autres cas (F8-PO-10) :
 * 1. absente, vide ou de plus de 200 caractères ;
 * 2. caractère de contrôle, espace, `\`, `//` à n'importe quelle position, valeur qui ne commence pas par `/`
 *    (donc tout `:` avant le premier `/`), `%`, `?`, `#`, segment `.` ou `..` ;
 * 3. hors des formes `/voyages`, `R-lancer`, `/voyages/{id}`, `/voyages/{id}/preparation`,
 *    `/voyages/{id}/presentation`, avec `{id}` conforme à `TRIP_ID_PATTERN`.
 */
export function normaliserSuite(valeur: string | undefined): string {
  const repli = creationRoutes.mesVoyages();
  if (!valeur || valeur.length > MAX_SUITE_LENGTH) return repli;
  if (FORBIDDEN.test(valeur) || valeur.includes("//") || !valeur.startsWith("/")) return repli;
  const segments = valeur.slice(1).split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return repli;

  if (valeur === repli) return repli;
  if (valeur === creationRoutes.lancer()) return creationRoutes.lancer();
  const [voyages, id, sous, ...reste] = segments;
  if (voyages !== "voyages" || id === undefined || !TRIP_ID_PATTERN.test(id) || reste.length > 0) return repli;
  const voyage = tripRoutes("/voyages", id);
  if (sous === undefined) return voyage.sejour();
  if (sous === "preparation") return creationRoutes.preparation(id);
  if (sous === "presentation") return presentationRoute(id);
  return repli;
}
