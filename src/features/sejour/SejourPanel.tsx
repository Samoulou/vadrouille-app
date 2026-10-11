import type { Trip } from "@/contracts";

/**
 * Contenu du panneau de l'écran 11 « Séjour » livré par F5a : le titre de niveau 1 (nom de la destination).
 * La plaque destination, le budget, « À faire avant de partir », « Pendant ton séjour » et « Jour par jour »
 * sont livrés par F5c (F5-PO-3, F5-PO-18).
 */
export function SejourPanel({ trip }: { trip: Trip }) {
  return (
    <div className="flex flex-col gap-5 px-5 pt-2 pb-8">
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{trip.destination}</h1>
    </div>
  );
}
