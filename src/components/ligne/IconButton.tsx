import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-label" | "aria-labelledby"> {
  /** Icône au trait, décorative (`aria-hidden`), par exemple `<IconRetour />`. */
  icon: ReactNode;
  /** Nom accessible obligatoire : verbe ou nom exact de l'action (« Retour », « Partager »). */
  label: string;
  /** `square` : coins `radius-control` ; `round` : cercle (boutons de la présentation). */
  shape?: "square" | "round";
}

/** Bouton icône de 44 × 44 px, posé sur la carte ou dans un en-tête. Design system : Button, variante icône. */
export function IconButton({ icon, label, shape = "square", className, type, ...props }: IconButtonProps) {
  return (
    <button
      type={type ?? "button"}
      aria-label={label}
      className={cn(
        "inline-flex size-(--touch-target) shrink-0 cursor-pointer items-center justify-center border border-outline bg-raised p-0 text-ink disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-soft",
        shape === "round" ? "rounded-full" : "rounded-control",
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
