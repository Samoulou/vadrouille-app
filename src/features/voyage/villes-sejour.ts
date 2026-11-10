import type { TripCity } from "@/contracts";

/**
 * Rangement de « Jour par jour » d'un voyage à plusieurs villes (spécification M4 § 7.5). Module à part de `villes.ts` :
 * il n'est chargé qu'avec la liste groupée par ville (`JoursParVille`, chargé à la demande), jamais pour une seule ville
 * (budget du JavaScript initial, handover front § 14).
 */

/** Nuits d'une ville : de son arrivée (`start`) à l'arrivée dans la suivante ou au départ (`end` exclusif), sur le calendrier. */
export function nuitsDeLaVille(ville: Pick<TripCity, "start" | "end">): number {
  return Math.round((Date.parse(`${ville.end}T00:00:00Z`) - Date.parse(`${ville.start}T00:00:00Z`)) / 86_400_000);
}

/**
 * Rang, dans `Trip.cities`, de la ville sous laquelle Séjour range un jour (spécification M4 § 3.1 point 3 et § 7.5) : la
 * ville où l'on dort ce soir-là, donc la ville d'arrivée le jour d'un changement de ville ; le dernier jour du voyage (`end`
 * exclusif de la dernière ville) sous la dernière ville. Le rang distingue une ville qui revient (Rome, Florence, puis
 * Rome). `undefined` hors des plages.
 */
export function rangDeVilleOuLOnDort(cities: readonly TripCity[], date: string): number | undefined {
  const rang = cities.findIndex((ville) => ville.start <= date && date < ville.end);
  if (rang >= 0) return rang;
  return cities.length > 0 && date === cities.at(-1)?.end ? cities.length - 1 : undefined;
}
