import type { TripCity } from "@/contracts";

/**
 * Ville d'un jour (décision 0148 § 6 point 3 ; spécification M4 § 3.1) : fonction pure **unique**, appelée par le serveur
 * (cadrage de la chaîne inversée) et par les écrans (M4c). Les villes sont celles de `Trip.cities` (ou de la même forme : nom
 * maison, `start` inclus, `end` exclusif, dans l'ordre du voyage) :
 * - `{ ville }` pour un jour ordinaire : la ville dont la plage contient la date ;
 * - `{ de, vers }` pour une journée de changement de ville : la date est le `start` d'une ville autre que la première ;
 * - `undefined` pour une date hors des plages (avant la première, ou à la fin du voyage, `end` exclusif de la dernière : le
 *   jour du départ appartient à la dernière ville).
 *
 * Le jour du départ du voyage (`end` de la dernière ville) est rendu comme un jour de la dernière ville : c'est le dernier
 * jour du voyage, jamais un changement de ville (§ 3.1 point 4). Le nom `villeDuJour` n'est **pas** repris (mineur 7 de
 * 0148) : il existe dans `src/server/generation/reserve-text-search.ts`, pour l'ancienne chaîne.
 */
export type VilleDeLaDate = { readonly ville: string } | { readonly de: string; readonly vers: string };

export function villesDeLaDate(cities: readonly Pick<TripCity, "name" | "start" | "end">[], date: string): VilleDeLaDate | undefined {
  for (const [rang, ville] of cities.entries()) {
    const precedente = rang === 0 ? undefined : cities.at(rang - 1);
    if (precedente !== undefined && date === ville.start) return { de: precedente.name, vers: ville.name };
    if (ville.start <= date && date < ville.end) return { ville: ville.name };
  }
  const derniere = cities.at(-1);
  return derniere !== undefined && date === derniere.end ? { ville: derniere.name } : undefined;
}

/**
 * `Trip.cities` lu depuis les séjours (décision 0148 § 6 point 2 : jamais depuis l'instantané) : séjours triés par date
 * d'arrivée, séjours consécutifs d'une même ville réunis (`start` du premier, `end` du dernier). Rend `undefined` pour
 * une seule ville, un séjour sans ville, une plage vide ou un trou entre deux séjours (forme du contrat : 2 villes au moins,
 * `end` exclusif égal au `start` suivant). Les noms sont ceux que l'appelant a déjà ramenés au nom maison.
 */
export function villesDesSejours(sejours: readonly { readonly ville: string | null; readonly from: string; readonly to: string }[]): TripCity[] | undefined {
  const villes: { name: string; start: string; end: string }[] = [];
  for (const sejour of [...sejours].sort((a, b) => a.from.localeCompare(b.from))) {
    if (sejour.ville === null || sejour.ville.trim() === "" || sejour.to <= sejour.from) return undefined;
    const derniere = villes.at(-1);
    if (derniere !== undefined && derniere.end !== sejour.from) return undefined;
    if (derniere !== undefined && derniere.name === sejour.ville) derniere.end = sejour.to;
    else villes.push({ name: sejour.ville, start: sejour.from, end: sejour.to });
  }
  return villes.length >= 2 ? villes : undefined;
}
