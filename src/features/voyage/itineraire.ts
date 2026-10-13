import type { Segment } from "@/contracts";

/** Mode de déplacement des adresses publiques de Google Maps, d'après le segment de la ligne du jour. */
const TRAVEL_MODES: Record<Segment["mode"], string> = {
  walk: "walking",
  transit: "transit",
  car: "driving",
};

/**
 * Adresse du lien « Itinéraire » de l'écran 15 (F10-PO-6, F10-TL-11) : adresse publique de Google Maps
 * (« Maps URLs »), sans clé, ouverte dans un nouvel onglet. L'application n'envoie elle-même aucune requête à
 * Google ; le `placeId` est lu en mémoire au moment du rendu, jamais stocké. Le nom et le `placeId` passent par
 * `encodeURIComponent` : un nom qui contient `&`, `#` ou `%` ne casse pas l'adresse. Sans segment, le mode est
 * laissé à Google Maps.
 */
export function itineraryUrl(destination: { name: string; placeId: string }, mode?: Segment["mode"]): string {
  const params = [
    "api=1",
    `destination=${encodeURIComponent(destination.name)}`,
    `destination_place_id=${encodeURIComponent(destination.placeId)}`,
  ];
  if (mode) params.push(`travelmode=${TRAVEL_MODES[mode]}`);
  return `https://www.google.com/maps/dir/?${params.join("&")}`;
}
