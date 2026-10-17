import { TRIP_ID_PATTERN } from "@/contracts/values";
import { creationRoutes } from "@/features/creation/routes";
import { presentationRoute, unlockRoutes } from "@/features/presentation/routes";
import { tripRoutes } from "@/features/sejour/routes";

/**
 * Paramètre `suite` de l'écran 4 (`/connexion?suite=…`, F8-PO-10, décision 0017 § 1) : le module qui écrit
 * l'adresse est celui qui la relit. `suite` ne contient jamais l'email, le récit ni aucune donnée du brouillon.
 */

const CONNEXION = "/connexion";
/** Numéro de jour d'une adresse `/jour/{n}` : entier écrit sans zéro initial (même forme que `dayFromParam`). */
const JOUR_PATTERN = /^[1-9][0-9]{0,2}$/;

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
 *    `/voyages/{id}/presentation`, et depuis B3c (B3-PO-11) `/voyages/{id}/jour/{n}`, `/voyages/{id}/aujourdhui` et
 *    `/voyages/{id}/debloquer`, avec `{id}` conforme à `TRIP_ID_PATTERN` et `{n}` entier écrit sans zéro initial
 *    (`JOUR_PATTERN`). Jamais `/jour/{n}/remplacer/…`, ni les pages de paiement simulé (`/debloquer/…`).
 * L'appartenance du voyage à l'organisation n'est pas vérifiée ici : la page cible renvoie 404 sinon.
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
  if (voyages !== "voyages" || id === undefined || !TRIP_ID_PATTERN.test(id)) return repli;
  const voyage = tripRoutes("/voyages", id);
  // B3-PO-11 : `/jour/{n}`, seul sous-chemin à deux segments ; rien après lui (« Remplacer » n'est jamais une suite).
  if (sous === "jour") {
    const [n, ...apres] = reste;
    return n !== undefined && apres.length === 0 && JOUR_PATTERN.test(n) ? voyage.jour(Number(n)) : repli;
  }
  if (reste.length > 0) return repli;
  if (sous === undefined) return voyage.sejour();
  if (sous === "preparation") return creationRoutes.preparation(id);
  if (sous === "presentation") return presentationRoute(id);
  if (sous === "aujourdhui") return voyage.aujourdhui() ?? repli;
  if (sous === "debloquer") return unlockRoutes(id).debloquer();
  return repli;
}
