import type { CSSProperties } from "react";

import { StopMarker } from "@/components/ligne/StopMarker";
import { format, messages } from "@/i18n";
import { cn } from "@/lib/utils";

import type { StopMarkerSpec } from "./route";

export interface MarkerButtonProps {
  stop: StopMarkerSpec;
  selected: boolean;
  onPress?: (stopId: string) => void;
  /**
   * Faux : marqueur non interactif (vue partagée, spécification F10, F10-TL-14), image nommée « Étape {numéro} :
   * {name} », ni bouton ni cible du focus. Vrai par défaut.
   */
  interactive?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Marqueur d'étape interactif (F4-PO-10) : bouton de 44 × 44 px au moins autour de la pastille
 * `StopMarker` (26 ou 38 px, décorative), nommé « Étape {numéro} : {name} ».
 * Toucher = `onPress` (défilement de la liste), sans sélection ni fiche (F4-PO-4).
 */
export function MarkerButton({ stop, selected, onPress, interactive = true, className, style }: MarkerButtonProps) {
  const label = format(messages.carte.marqueur, { numero: stop.number, name: stop.name });
  if (!interactive) {
    return (
      <span
        role="img"
        data-stop-id={stop.stopId}
        data-number={stop.number}
        aria-label={label}
        style={style}
        className={cn("flex min-h-(--touch-target) min-w-(--touch-target) items-center justify-center", className)}
      >
        <StopMarker kind="stop" number={stop.number} selected={selected} />
      </span>
    );
  }
  return (
    <button
      type="button"
      data-stop-id={stop.stopId}
      data-number={stop.number}
      aria-label={label}
      aria-current={selected ? "true" : undefined}
      style={style}
      onClick={() => onPress?.(stop.stopId)}
      className={cn(
        "flex min-h-(--touch-target) min-w-(--touch-target) cursor-pointer items-center justify-center rounded-(--ligne-rayon-rond) bg-transparent p-0",
        className,
      )}
    >
      <StopMarker kind="stop" number={stop.number} selected={selected} />
    </button>
  );
}
