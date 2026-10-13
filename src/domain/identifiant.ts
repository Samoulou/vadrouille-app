import { TRIP_ID_PATTERN } from "@/contracts";

/**
 * Identifiant d'un voyage du prototype : `proto_<slug>_<AAAAMMJJ>_<n>` (spécification P0, « Sortie 1 »).
 * `<slug>` : destination en ASCII minuscule sans accent, `[a-z0-9-]`, 24 caractères au plus.
 */

export const SLUG_MAX = 24;

export function slugDestination(destination: string): string {
  const slug = destination
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return slug === "" ? "destination" : slug;
}

export function identifiantVoyage(destination: string, dateExecution: string, numero: number): string {
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) throw new RangeError("numéro de 1 à 999");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateExecution)) throw new RangeError("date AAAA-MM-JJ");
  const id = `proto_${slugDestination(destination)}_${dateExecution.replaceAll("-", "")}_${numero}`;
  if (!TRIP_ID_PATTERN.test(id)) throw new RangeError("identifiant non conforme");
  return id;
}

/**
 * Identifiants d'étape créés par le moteur (décision 0045 § 3.5) : déterministes, sans graine aléatoire. Une étape
 * créée dans la version `n` a l'identifiant `v<n>-j<jour>-<rang>` (rang à partir de 1 dans le jour) ; suffixes
 * `e<rang>` pour un événement, `idee` pour l'idée, `c<rang>` pour une proposition. Une étape existante garde son
 * identifiant ; ceux d'un patch sont attribués par le serveur (0037). P0 garde ses identifiants `j<jour>-<rang>`.
 */
export type GenreEtape = "etape" | "evenement" | "idee" | "proposition";

export function identifiantEtape(version: number, jour: number, genre: GenreEtape, rang = 1): string {
  for (const valeur of [version, jour, rang]) {
    if (!Number.isInteger(valeur) || valeur < 1) throw new RangeError("version, jour et rang entiers à partir de 1");
  }
  const prefixe = `v${version}-j${jour}`;
  switch (genre) {
    case "etape":
      return `${prefixe}-${rang}`;
    case "evenement":
      return `${prefixe}-e${rang}`;
    case "idee":
      return `${prefixe}-idee`;
    case "proposition":
      return `${prefixe}-c${rang}`;
  }
}
