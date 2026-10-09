import type { Trip } from "@/contracts";
import { cn } from "@/lib/utils";

export interface DestinationPlateProps {
  /** Nom de la destination. */
  name: string;
  /** Ligne d'informations : « sam. 29.08 – jeu. 03.09 · 2 adultes ». */
  meta: string;
  color: Trip["destinationColor"];
  /**
   * Balise du nom (décision 0020 § 10) : `h1` par défaut (Séjour) ; `p` quand le nom n'ouvre pas de
   * section (écran 9). Le rendu visuel ne dépend pas de la balise.
   */
  as?: "h1" | "h2" | "p";
  className?: string;
}

const COLORS: Record<Trip["destinationColor"], string> = {
  bruyere: "bg-dest-bruyere",
  azulejo: "bg-dest-azulejo",
  ocre: "bg-dest-ocre",
  granit: "bg-dest-granit",
};

/**
 * Plaque de la destination (design system : components/DestinationPlate) : aplat de la palette fermée,
 * nom en style `destination`, ligne de dates et de voyageurs en 15 px tabulaire, tout en `on-line`.
 * Une plaque par écran au maximum. Créée par F9a (F9-PO-18) selon les props de la spécification F5 ;
 * F5c la réutilise.
 */
export function DestinationPlate({ name, meta, color, as: Name = "h1", className }: DestinationPlateProps) {
  return (
    <div data-destination-plate={color} className={cn("flex flex-col gap-1.5 rounded-plate p-5 text-on-line", COLORS[color], className)}>
      <Name className="text-destination font-extrabold tracking-[-0.02em]">{name}</Name>
      <p className="text-corps tabular-nums">{meta}</p>
    </div>
  );
}
