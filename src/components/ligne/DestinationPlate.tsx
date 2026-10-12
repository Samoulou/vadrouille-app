import Link from "next/link";

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
   * section (écran 9, « Mes voyages »). Le rendu visuel ne dépend pas de la balise.
   */
  as?: "h1" | "h2" | "p";
  /**
   * Adresse : avec elle, la plaque entière est un lien (« Mes voyages », décision 0021 § 11), dont le nom
   * accessible est le contenu visible (nom puis ligne d'informations), sans `aria-label` (WCAG 2.5.3). Le
   * contour de focus de Ligne est à l'extérieur de l'aplat, sur le fond de la page.
   */
  href?: string;
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
 * F5c la réutilise ; F11a ajoute `href`.
 */
export function DestinationPlate({ name, meta, color, as: Name = "h1", href, className }: DestinationPlateProps) {
  const classes = cn("flex flex-col gap-1.5 rounded-plate p-5 text-on-line", COLORS[color], className);
  const content = (
    <>
      <Name className="text-destination font-extrabold tracking-(--ligne-destination-approche)">{name}</Name>
      <p className="text-corps tabular-nums">{meta}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} data-destination-plate={color} className={cn(classes, "min-h-(--touch-target)")}>
        {content}
      </Link>
    );
  }
  return (
    <div data-destination-plate={color} className={classes}>
      {content}
    </div>
  );
}
