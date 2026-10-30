import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Classes du bouton d'action Ligne (variantes de `Button`), dans un module sans `@radix-ui/react-slot` : un élément
 * qui n'a besoin que du style du bouton (frontières d'erreur racine, décision 0152) l'importe sans embarquer `Slot`.
 * Design system : components/Button.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control select-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-soft disabled:no-underline",
  {
    variants: {
      variant: {
        primary: "bg-line px-5 text-(length:--ligne-bouton-texte) font-extrabold text-on-line",
        secondary:
          "border-(length:--ligne-trait-controle) border-ink bg-raised px-5 text-(length:--ligne-bouton-texte) font-bold text-ink disabled:border-muted aria-pressed:not-disabled:bg-ink aria-pressed:not-disabled:text-page",
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

/** Classes de `Button` pour `variant`, `size` et `tone` (mêmes défauts), suivies de `className`. */
export function buttonClassName(
  { variant = "primary", size = "md", tone = "ink" }: { variant?: ButtonVariant; size?: ButtonSize; tone?: "ink" | "soft" } = {},
  className?: string,
): string {
  return cn(buttonVariants({ variant, size, tone }), className);
}
