import type { ReactNode, SVGProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Icônes au trait de Ligne : grille 24, trait 2,2, extrémités et angles arrondis, sans remplissage,
 * couleur héritée (`ink` ou `ink-soft`). Décoratives : le nom accessible vient du contrôle qui les porte.
 * Seuls les tracés présents dans Button/preview.html existent ; le reste du jeu attend l'export SVG (Q13).
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, "children">;

function Icon({ className, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("size-5 shrink-0", className)}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconRetour(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M15 18l-6-6 6-6" />
    </Icon>
  );
}

export function IconPartager(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 14v6h14v-6" />
    </Icon>
  );
}

/** Maison du terminus de carte (StopMarker/preview.html). Les tracés à pied, bus et voiture attendent l'export SVG (Q13). */
export function IconMaison(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 11l9-7 9 7" />
      <path d="M6 10v10h12V10" />
    </Icon>
  );
}
