import type { CSSProperties } from "react";

import { StopMarker } from "@/components/ligne";
import { format, messages } from "@/i18n";
import { cn } from "@/lib/utils";

import type { StopMarkerSpec } from "./route";

export interface MarkerButtonProps {
  stop: StopMarkerSpec;
  selected: boolean;
  onPress?: (stopId: string) => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Marqueur d'étape interactif (F4-PO-10) : bouton de 44 × 44 px au moins autour de la pastille
 * `StopMarker` (26 ou 38 px, décorative), nommé « Étape {numéro} : {name} ».
 * Toucher = `onPress` (défilement de la liste), sans sélection ni fiche (F4-PO-4).
 */
export function MarkerButton({ stop, selected, onPress, className, style }: MarkerButtonProps) {
  return (
    <button
      type="button"
      data-stop-id={stop.stopId}
      data-number={stop.number}
      aria-label={format(messages.carte.marqueur, { numero: stop.number, name: stop.name })}
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
