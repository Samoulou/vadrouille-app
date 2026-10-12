import { Button } from "@/components/ligne/Button";
import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { PlacesAttribution } from "./PlacesAttribution";

/** Cause de l'état de remplacement, dans l'ordre de précédence (F4-PO-8). */
export type MapFallbackCause = "offline" | "unavailable" | "error";

/** Texte de chaque cause ; aussi annoncé par la région live de `DayMap`. */
export const MAP_FALLBACK_TEXTS: Record<MapFallbackCause, string> = {
  offline: messages.carte.horsLigne,
  unavailable: messages.carte.indisponible,
  error: messages.carte.erreur,
};

export interface MapFallbackProps {
  cause: MapFallbackCause;
  /** « Réessayer », pour l'erreur de chargement seulement. */
  onRetry?: () => void;
  placesFromGoogle: boolean;
  className?: string;
}

/**
 * État de remplacement de la carte (provisoire, F4-Q2) : même emplacement et même hauteur que la carte,
 * fond `muted`, texte `ink-2`. La liste voisine reste complète.
 * Pas de `role="status"` ici : un élément live monté avec son texte n'est pas annoncé. L'annonce est faite par
 * la région live persistante de `DayMap`, dont seul le texte change ; le texte visible est donc masqué aux
 * technologies d'assistance pour ne pas être lu deux fois.
 */
export function MapFallback({ cause, onRetry, placesFromGoogle, className }: MapFallbackProps) {
  return (
    <div
      data-fallback={cause}
      className={cn("flex size-full flex-col items-center justify-center gap-3 bg-muted p-6 text-center text-corps text-ink-2", className)}
    >
      <p aria-hidden="true">{MAP_FALLBACK_TEXTS[cause]}</p>
      {cause === "error" && onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {messages.carte.reessayer}
        </Button>
      ) : null}
      <PlacesAttribution placesFromGoogle={placesFromGoogle} />
    </div>
  );
}
