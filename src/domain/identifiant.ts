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
 * Identifiant du voyage d'une exécution lancée depuis l'app sur un brief saisi (spécification E2E-essai, lot 3 ; décision
 * 0125 § 2) : `proto_<slug>_<uuid de l'exécution sans tirets>`, connu **dès le lancement** (l'écran 5 le suit avant que le
 * programme ne soit écrit), stable et unique sans lecture du rang du jour. Distinct des identifiants numérotés (`_<n>`,
 * trois chiffres au plus) des essais de `/prototype/executions`.
 */
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VOYAGE_SAISI = /^proto_([a-z0-9-]{1,24})_([0-9a-f]{32})$/;

export function identifiantVoyageSaisi(destination: string, runId: string): string {
  if (!RUN_ID.test(runId)) throw new RangeError("identifiant d'exécution non conforme");
  const id = `proto_${slugDestination(destination)}_${runId.replaceAll("-", "")}`;
  if (!TRIP_ID_PATTERN.test(id)) throw new RangeError("identifiant non conforme");
  return id;
}

/** Exécution et slug d'un identifiant de `identifiantVoyageSaisi`, ou `null` pour tout autre identifiant. */
export function lireIdentifiantVoyageSaisi(tripId: string): { readonly runId: string; readonly slug: string } | null {
  const lu = typeof tripId === "string" ? VOYAGE_SAISI.exec(tripId) : null;
  if (lu === null) return null;
  const [, slug, hex] = lu as unknown as [string, string, string];
  return { slug, runId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
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
