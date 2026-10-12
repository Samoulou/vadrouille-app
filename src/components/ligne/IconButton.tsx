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

/**
 * Classes du bouton icône, partagées avec les liens icônes (par exemple « Retour » rendu par un `Link`),
 * pour qu'un lien et un bouton de même rôle aient le même rendu.
 */
export function iconButtonClassName(shape: IconButtonProps["shape"] = "square", className?: string): string {
  return cn(
    "inline-flex size-(--touch-target) shrink-0 cursor-pointer items-center justify-center border border-outline bg-raised p-0 text-ink disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-soft",
    shape === "round" ? "rounded-full" : "rounded-control",
    className,
  );
}

/** Bouton icône de 44 × 44 px, posé sur la carte ou dans un en-tête. Design system : Button, variante icône. */
export function IconButton({ icon, label, shape = "square", className, type, ...props }: IconButtonProps) {
  return (
    <button type={type ?? "button"} aria-label={label} className={iconButtonClassName(shape, className)} {...props}>
      {icon}
    </button>
  );
}
