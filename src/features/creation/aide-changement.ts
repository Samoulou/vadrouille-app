import { engagementDuChangement } from "@/domain/changement-de-ville";

import type { TripForm } from "./draft";

/**
 * Aide de l'écran 1 sous le « Billet » qui deviendra le changement de ville (spécification M4-suite § 4.2, Q728) : rend,
 * par rang d'engagement du brouillon, le nom de la ville vers laquelle ce billet sera le transport. Un engagement reçoit
 * l'aide quand **toutes** ces conditions sont réunies :
 * - le voyage a plus d'une ville, et l'autre ville a un nom et une date d'arrivée (sans nom, la phrase n'aurait pas de
 *   ville : aucune aide) ;
 * - l'engagement est daté de l'arrivée de la ville 2 ou de la ville 3 ;
 * - c'est le changement de ville de ce jour, choisi par **la même fonction pure que le serveur** (`engagementDuChangement`,
 *   0148 § 9 point 1 ; T-M4S-2) : le premier « Billet » ou « Vol », dans l'ordre des heures puis de la saisie ;
 * - c'est un « Billet » : un « Vol » ce jour-là est toujours le changement de ville, sans aide.
 * Un engagement dont l'heure de début n'est pas encore saisie est rangé après ceux qui en ont une, puis par ordre de saisie :
 * la fonction du domaine ne reçoit que ceux qui ont une heure s'il y en a, sinon les autres.
 */
export function aidesDeChangement(trip: Pick<TripForm, "otherCities" | "commitments">): ReadonlyMap<number, string> {
  const aides = new Map<number, string>();
  const dates = new Set<string>();
  for (const ville of trip.otherCities) {
    const nom = ville.name.trim();
    if (nom === "" || ville.arrival === "" || dates.has(ville.arrival)) continue;
    dates.add(ville.arrival);
    const transports = trip.commitments.flatMap((engagement, rang) =>
      engagement.date === ville.arrival && (engagement.kind === "ticket" || engagement.kind === "flight")
        ? [{ rang, kind: engagement.kind, date: engagement.date, start: engagement.start }]
        : [],
    );
    const avecHeure = transports.filter((engagement) => engagement.start !== "");
    const candidats = avecHeure.length > 0 ? avecHeure : transports;
    const retenu = engagementDuChangement(candidats, ville.arrival);
    const choisi = retenu === undefined ? undefined : candidats.at(retenu);
    if (choisi?.kind === "ticket") aides.set(choisi.rang, nom);
  }
  return aides;
}
