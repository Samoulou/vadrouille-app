import type { ReactNode } from "react";

import type { Day, TripCity } from "@/contracts";
import { estChangementDeVille, villeDeLaDate } from "@/features/voyage/villes";
import { nuitsDeLaVille, rangDeVilleOuLOnDort } from "@/features/voyage/villes-sejour";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

const ts = messages.sejour.sejour;

/** Jour de « Jour par jour » : journée servie, ou journée « À débloquer » (numéro et date seulement). */
export type LigneDuJour = { readonly kind: "servi"; readonly day: Day } | { readonly kind: "verrouille"; readonly index: number; readonly date: string };

/** Titre d'une ville dans « Jour par jour » : « Rome · 2 nuits », « Florence · 1 nuit » (spécification M4 § 8). */
function titreDeVille(ville: TripCity): string {
  const nuits = nuitsDeLaVille(ville);
  return nuits === 1 ? format(ts.villes.titre.une, { ville: ville.name }) : format(ts.villes.titre.plusieurs, { ville: ville.name, n: nuits });
}

const dateDe = (ligne: LigneDuJour) => (ligne.kind === "servi" ? ligne.day.date : ligne.date);

export interface JoursParVilleProps {
  cities: readonly TripCity[];
  lignes: readonly LigneDuJour[];
  /** Ligne d'un jour, rendue par Séjour ; `vers` : ville d'arrivée de la journée du changement de ville. */
  rendreLigne: (ligne: LigneDuJour, vers?: string) => ReactNode;
}

/**
 * « Jour par jour » d'un voyage à 2 ou 3 villes (spécification M4 § 7.5) : un titre de niveau 3 par ville, non
 * focalisable, et chaque jour sous la ville où l'on dort (`rangDeVilleOuLOnDort`), dans l'ordre du voyage ; une ville sans
 * jour n'a pas de groupe. La journée du changement de ville reçoit sa ville d'arrivée (« Vers {ville} »).
 *
 * Chargé à la demande par Séjour (`lazy`), seulement pour un voyage à plusieurs villes : un voyage à une ville n'en paie
 * pas le JavaScript initial (budget du handover front § 14).
 */
export function JoursParVille({ cities, lignes, rendreLigne }: JoursParVilleProps) {
  return cities.map((ville, rang) => {
    const duGroupe = lignes.filter((ligne) => rangDeVilleOuLOnDort(cities, dateDe(ligne)) === rang);
    if (duGroupe.length === 0) return null;
    return (
      <div key={`ville-${rang}`} data-part="jours-ville" className="flex flex-col gap-1 pt-2">
        <h3 className="text-corps font-extrabold break-words text-ink">{titreDeVille(ville)}</h3>
        <ul>
          {duGroupe.map((ligne) => {
            const changement = ligne.kind === "servi" ? villeDeLaDate(cities, ligne.day.date) : undefined;
            return rendreLigne(ligne, estChangementDeVille(changement) ? changement.vers : undefined);
          })}
        </ul>
      </div>
    );
  });
}
