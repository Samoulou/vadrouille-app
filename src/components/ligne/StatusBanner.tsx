import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusBannerKind = "offline" | "conflict" | "noOption" | "error" | "generating" | "travel" | "overlap";

export interface StatusBannerProps {
  kind: StatusBannerKind;
  /** Message fourni par l'écran appelant : dit ce qui se passe et ce qu'on peut faire. */
  message: string;
  /** Action éventuelle (un `Button` `text` ou `secondary`), placée sous le message. */
  action?: ReactNode;
  /**
   * Faux quand le bandeau est écrit dans une région live déjà présente dans la page (règle des annonces de
   * 0018) : le bandeau n'a alors pas de rôle propre, la région l'annonce. Vrai par défaut.
   */
  announce?: boolean;
  className?: string;
}

/**
 * `alert` pour `error` et `conflict` (la personne doit réagir avant de continuer), `status` pour les autres
 * types (décision 0012, Q13 ; handover § 11).
 */
export function statusBannerRole(kind: StatusBannerKind): "alert" | "status" {
  return kind === "error" || kind === "conflict" ? "alert" : "status";
}

/**
 * Filet décoratif : `ink` pour `error` et `conflict`, `ink-soft` pour les autres types, jamais `line` (0012, Q13) ;
 * `overlap` compris, en `status` comme les autres (spécification M4-suite § 5, décision UX-M4S-A).
 */
const RAIL_CLASSES: Record<StatusBannerKind, string> = {
  offline: "bg-ink-soft",
  conflict: "bg-ink",
  noOption: "bg-ink-soft",
  error: "bg-ink",
  // Aucune animation : seul le message, mis à jour par l'écran appelant, dit que la génération avance (0012, Q13).
  generating: "bg-ink-soft",
  // Temps de trajet du jour au-delà du budget du rythme (décision 0015 § 7 ; filet aligné par 0018 § 2 et 0012, Q13).
  travel: "bg-ink-soft",
  // Engagement qui chevauche la ligne « Vers {ville} » (spécification M4-suite § 5, UX-M4S-A) : rien ne bloque la
  // personne, donc `status` et filet `ink-soft`, sans exception à 0012.
  overlap: "bg-ink-soft",
};

/**
 * Bandeau d'état transverse (hors ligne, conflit, aucune option, erreur, génération, trajet, chevauchement).
 * Le texte porte toute l'information ; le filet à gauche n'est qu'un repère visuel.
 * Rendu décidé par UX/UI (décision 0012, Q13), absent du design system.
 */
export function StatusBanner({ kind, message, action, announce = true, className }: StatusBannerProps) {
  return (
    <div
      role={announce ? statusBannerRole(kind) : undefined}
      data-kind={kind}
      className={cn("flex gap-3 rounded-block bg-muted p-4 text-corps text-ink-2", className)}
    >
      <span
        aria-hidden="true"
        data-rail=""
        className={cn("w-1 shrink-0 self-stretch rounded-full", RAIL_CLASSES[kind])}
      />
      <div className="flex min-w-0 flex-col items-start gap-2">
        {/* `overlap` cite un libellé saisi, parfois sans espace : il se coupe n'importe où plutôt que de déborder
            (`overflow-wrap: anywhere`, spécification M4-suite § 5, critère 17). Les autres types ne changent pas. */}
        <p className={kind === "overlap" ? "wrap-anywhere" : undefined}>{message}</p>
        {action}
      </div>
    </div>
  );
}
