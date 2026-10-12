import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface ActionBannerProps {
  /** Titre du bandeau, au niveau choisi par l'écran appelant dans sa hiérarchie de titres. */
  title: string;
  /** Niveau du titre (2 par défaut). */
  headingLevel?: 2 | 3 | 4;
  /** Identifiant du titre, nom accessible de la région ; dérivé de l'écran appelant. */
  titleId: string;
  /** Contenu libre : lignes, phrases, action. */
  children: ReactNode;
  className?: string;
}

/**
 * Bandeau d'action requise (F10-TL-12, rendu provisoire UX/UI) : aplat `quai`, texte `ink`, rayon `block`
 * (handover § 4.2 : le jaune `quai` signale exclusivement une action requise ; texte toujours `ink`). Ce n'est
 * pas un `StatusBanner`, qui signale un état : il n'a donc pas de rôle de zone vivante. Partagé par les rappels
 * « À réserver » de l'écran 15 (F10a) et le bandeau de l'écran 10 (F9b).
 */
export function ActionBanner({ title, headingLevel = 2, titleId, children, className }: ActionBannerProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <section aria-labelledby={titleId} data-part="bandeau-action" className={cn("flex flex-col gap-2 rounded-block bg-quai p-4 text-ink", className)}>
      <Heading id={titleId} className="text-section font-extrabold text-ink">
        {title}
      </Heading>
      {children}
    </section>
  );
}
