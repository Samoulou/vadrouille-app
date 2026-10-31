import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

import type { CityMarkerSpec, TerminusMarkerSpec } from "./route";

/*
 * Textes des repères de ville (décision 0150 § 2 point 1, § 3 point 1 et § 4), séparés de `CityLabel` : le rendu Google
 * les lit au calcul des hôtes et ne charge `CityLabel` qu'à plusieurs villes (décision 0152 § 4).
 */

const t = messages.carte;

/** Décalages verticaux permis : trois sur Séjour, un le jour du changement de ville (décision 0150 § 4). */
export const DECALAGES_SEJOUR = 3;
export const DECALAGES_JOURNEE = 1;

/** « 1 et 3 » : numéros d'une ville dont le logement revient. */
function listeNumeros(numbers: readonly number[]): string {
  const dernier = numbers.at(-1);
  if (numbers.length < 2 || dernier === undefined) return String(numbers[0] ?? "");
  return format(t.listeNumeros, { debut: numbers.slice(0, -1).join(", "), dernier });
}

/** Texte de l'étiquette d'un repère de Séjour : « 1 · Rome », ou « 1 et 3 · Rome ». */
export function texteEtiquette(marker: Pick<CityMarkerSpec, "city" | "numbers">): string {
  return marker.numbers.length > 1
    ? format(t.etiquetteVilles, { liste: listeNumeros(marker.numbers), ville: marker.city })
    : format(t.etiquetteVille, { n: marker.numbers[0] ?? "", ville: marker.city });
}

/** Nom accessible d'un repère de Séjour : « Rome, ville 1 », ou « Rome, villes 1 et 3 ». */
export function nomRepere(marker: Pick<CityMarkerSpec, "city" | "numbers">): string {
  return marker.numbers.length > 1
    ? format(t.repereVilles, { ville: marker.city, liste: listeNumeros(marker.numbers) })
    : format(t.repereVille, { ville: marker.city, n: marker.numbers[0] ?? "" });
}

/**
 * Nom accessible et ville d'un terminus de la Journée d'un changement de ville (décision 0150 § 3 point 1) : « Logement
 * quitté, Rome » pour `start`, « Nouveau logement, Florence » pour `end` ; rien pour deux terminus confondus.
 */
export function nomTerminus(terminus: TerminusMarkerSpec, villes: { de: string; vers: string }): { name: string; city: string } | undefined {
  if (terminus.roles.length !== 1) return undefined;
  return terminus.roles[0] === "start"
    ? { name: format(t.logementQuitte, { ville: villes.de }), city: villes.de }
    : { name: format(t.nouveauLogement, { ville: villes.vers }), city: villes.vers };
}
