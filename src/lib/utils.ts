import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

import { COLOR_TOKENS, RADIUS_TOKENS, TEXT_STYLES } from "@/styles/tokens";

/**
 * tailwind-merge ne connaît pas les tokens Ligne : sans cette configuration, il prend
 * `text-corps` (taille) pour une couleur et le supprime à côté de `text-ink`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [...COLOR_TOKENS],
      radius: [...RADIUS_TOKENS],
      text: TEXT_STYLES.map((style) => style.name),
    },
  },
});

/** Fusion de classes utilisée par les composants shadcn/ui et Ligne. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
