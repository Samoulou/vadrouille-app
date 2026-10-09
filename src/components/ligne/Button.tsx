import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { cn } from "@/lib/utils";

import { IconCoche } from "./icons";

/**
 * Bouton d'action Ligne, adapté du Button de shadcn/ui (cva, Slot, cn) sans ses variantes
 * hors Ligne (destructive, ombres). Design system : components/Button.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control select-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-soft disabled:no-underline",
  {
    variants: {
      variant: {
        primary: "bg-line px-5 text-(length:--ligne-bouton-texte) font-extrabold text-on-line",
        secondary:
          "border-(length:--ligne-trait-controle) border-ink bg-raised px-5 text-(length:--ligne-bouton-texte) font-bold text-ink disabled:border-muted aria-pressed:bg-ink aria-pressed:text-page",
        text: "bg-transparent px-2 text-corps font-normal underline underline-offset-2",
      },
      tone: {
        ink: "",
        soft: "",
      },
      size: {
        md: "h-13",
        sm: "h-11",
      },
    },
    compoundVariants: [
      { variant: "text", tone: "ink", className: "text-ink" },
      { variant: "text", tone: "soft", className: "text-ink-soft" },
    ],
    defaultVariants: { variant: "primary", tone: "ink", size: "md" },
  },
);

export type ButtonVariant = "primary" | "secondary" | "text";
export type ButtonSize = "md" | "sm";

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
  const classes = cn(buttonVariants({ variant, size, tone }), className);
  if (asChild) {
    return (
      <Slot className={classes} {...props}>
        {children}
      </Slot>
    );
  }
  // Bouton bascule enfoncé (`aria-pressed`) : aplat `ink` et texte `page` (variante secondaire), plus une coche
  // devant le libellé, pour que l'état ne repose pas sur la couleur seule (WCAG 1.4.1 ; rendu provisoire, UX/UI).
  const pressed = props["aria-pressed"] === true || props["aria-pressed"] === "true";
  return (
    <button type={type ?? "button"} className={classes} {...props}>
      {pressed ? <IconCoche data-part="coche" /> : null}
      {children}
    </button>
  );
}
