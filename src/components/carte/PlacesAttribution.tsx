import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

export interface PlacesAttributionProps {
  /** Les données de lieux affichées viennent de Google ; `false` en phase 0 (adaptateur mock). */
  placesFromGoogle: boolean;
  className?: string;
}

/**
 * Mention « Données de lieux : Google » pour tout affichage de données de lieux Google sans la carte
 * Google (handover § 8, F4-PO-9). Rien n'est rendu quand les données ne viennent pas de Google.
 */
export function PlacesAttribution({ placesFromGoogle, className }: PlacesAttributionProps) {
  if (!placesFromGoogle) {
    return null;
  }
  return (
    <p data-part="attribution" className={cn("text-legende text-ink-soft", className)}>
      {messages.carte.attribution}
    </p>
  );
}
