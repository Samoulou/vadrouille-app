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
