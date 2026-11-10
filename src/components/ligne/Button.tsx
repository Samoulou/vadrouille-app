import { Slot } from "@radix-ui/react-slot";
import type { VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { buttonClassName, buttonVariants, type ButtonSize, type ButtonVariant } from "./button-variants";

export { buttonVariants, type ButtonSize, type ButtonVariant };

export interface ButtonProps
  extends ComponentPropsWithRef<"button">,
    Omit<VariantProps<typeof buttonVariants>, "variant" | "size" | "tone"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Couleur de la variante `text` : `ink` (défaut) ou `ink-soft`. */
  tone?: "ink" | "soft";
  /** Rend l'enfant unique (un lien, par exemple) avec le style du bouton. */
  asChild?: boolean;
}

/**
 * Bouton d'action Ligne, adapté du Button de shadcn/ui (cva, Slot, cn ; classes dans `button-variants.ts`) sans ses variantes
 * hors Ligne (destructive, ombres). Design system : components/Button.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  tone = "ink",
  asChild = false,
  type,
  children,
  ...props
}: ButtonProps) {
  const classes = buttonClassName({ variant, size, tone }, className);
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  // Bouton bascule enfoncé (`aria-pressed`, variante secondaire) : aplat `ink` et texte `page`, l'inverse du
  // fond `raised` et du texte `ink` relâchés. Aucune icône : README Button, « pas d'icône décorative dans un
  // bouton à libellé » (rendu provisoire, à valider par UX/UI).
  return (
    <button type={type ?? "button"} className={classes} {...props}>
      {children}
    </button>
  );
}
