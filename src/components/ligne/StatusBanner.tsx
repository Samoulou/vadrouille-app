import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusBannerKind = "offline" | "conflict" | "noOption" | "error" | "generating" | "travel";

export interface StatusBannerProps {
  kind: StatusBannerKind;
  /** Message fourni par l'écran appelant : dit ce qui se passe et ce qu'on peut faire. */
  message: string;
  /** Action éventuelle (un `Button` `text` ou `secondary`), placée sous le message. */
  action?: ReactNode;
  className?: string;
}

/**
 * `alert` pour `error` et `conflict` (la personne doit réagir avant de continuer), `status` pour les autres
 * types (décision 0012, Q13 ; handover § 11).
 */
export function statusBannerRole(kind: StatusBannerKind): "alert" | "status" {
  return kind === "error" || kind === "conflict" ? "alert" : "status";
}

/** Filet décoratif : `ink` pour `error` et `conflict`, `ink-soft` pour les autres types, jamais `line` (0012, Q13). */
const RAIL_CLASSES: Record<StatusBannerKind, string> = {
  offline: "bg-ink-soft",
  conflict: "bg-ink",
  noOption: "bg-ink-soft",
  error: "bg-ink",
  // Aucune animation : seul le message, mis à jour par l'écran appelant, dit que la génération avance (0012, Q13).
  generating: "bg-ink-soft",
  // Temps de trajet du jour au-delà du budget du rythme (décision 0015 § 7 ; filet aligné par 0018 § 2 et 0012, Q13).
  travel: "bg-ink-soft",
};

/**
 * Bandeau d'état transverse (hors ligne, conflit, aucune option, erreur, génération, trajet).
 * Le texte porte toute l'information ; le filet à gauche n'est qu'un repère visuel.
 * Rendu décidé par UX/UI (décision 0012, Q13), absent du design system.
 */
export function StatusBanner({ kind, message, action, className }: StatusBannerProps) {
  return (
    <div
      role={statusBannerRole(kind)}
      data-kind={kind}
      className={cn("flex gap-3 rounded-block bg-muted p-4 text-corps text-ink-2", className)}
    >
      <span
        aria-hidden="true"
        data-rail=""
        className={cn("w-1 shrink-0 self-stretch rounded-full", RAIL_CLASSES[kind])}
      />
      <div className="flex min-w-0 flex-col items-start gap-2">
        <p>{message}</p>
        {action}
      </div>
    </div>
  );
}
