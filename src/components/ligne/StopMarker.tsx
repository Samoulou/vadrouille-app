import { cn } from "@/lib/utils";

import { IconMaison } from "./icons";

export type StopMarkerKind = "stop" | "terminus" | "overview";

export interface StopMarkerProps {
  kind: StopMarkerKind;
  /** Numéro de l'arrêt dans la journée, affiché seulement sur un arrêt de carte. Jamais sur un terminus. */
  number?: number;
  /** Arrêt de carte sélectionné : 38 px, plein line (un seul à la fois, celui de la fiche ouverte). */
  selected?: boolean;
  /** Proposition (Q18) : « ligne » pour la ligne du jour, « carte » (par défaut) pour la carte. */
  variant?: "ligne" | "carte";
  className?: string;
}

const ROND = "rounded-(--ligne-rayon-rond) box-border";

function classes({ kind, selected, variant }: Required<Omit<StopMarkerProps, "number" | "className">>): string {
  if (kind === "overview") {
    return cn(ROND, "size-(--ligne-stop-ensemble) border-(length:--ligne-anneau-carte) border-line bg-raised");
  }
  if (kind === "terminus") {
    return variant === "ligne"
      ? "size-(--ligne-terminus) rounded-(--ligne-rayon-terminus) bg-ink"
      : "size-(--ligne-terminus-carte) rounded-(--ligne-rayon-mini) bg-ink text-on-line";
  }
  if (variant === "ligne") {
    return cn(ROND, "size-(--ligne-stop) border-(length:--ligne-stop-ring) border-line bg-raised");
  }
  return selected
    ? cn(
        ROND,
        "size-(--ligne-stop-map-selected) border-(length:--ligne-anneau-carte) border-page bg-line text-on-line text-(length:--ligne-numero-carte-selection) font-extrabold",
      )
    : cn(
        ROND,
        "size-(--ligne-stop-map) border-(length:--ligne-anneau-carte) border-line bg-raised text-ink text-(length:--ligne-numero-carte) font-extrabold",
      );
}

/**
 * Marqueur d'arrêt et de terminus, même forme sur la ligne et sur la carte. Design system : components/StopMarker.
 * Toujours décoratif (`aria-hidden`) : la liste porte l'information (handover § 11).
 */
export function StopMarker({ kind, number, selected = false, variant = "carte", className }: StopMarkerProps) {
  const showNumber = kind === "stop" && variant === "carte" && number !== undefined;
  const showHouse = kind === "terminus" && variant === "carte";
  return (
    <span
      aria-hidden="true"
      data-kind={kind}
      data-variant={variant}
      data-selected={kind === "stop" && variant === "carte" && selected ? "true" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center leading-none tabular-nums",
        classes({ kind, selected, variant }),
        className,
      )}
    >
      {showNumber ? number : null}
      {showHouse ? <IconMaison className="size-(--ligne-icone-terminus-carte)" /> : null}
    </span>
  );
}
