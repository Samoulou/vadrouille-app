import type { ReactNode } from "react";

import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";

const t = messages.ligne.raison;

export interface LienSourceProps {
  /** Adresse `https` de la source, déjà vérifiée (`HttpsUrlSchema`). */
  href: string;
  children: ReactNode;
  /**
   * Mention lue par les technologies d'assistance après le libellé (« s'ouvre dans un nouvel onglet »). Sans valeur,
   * rien n'est ajouté : `ReasonBlock` garde son nom accessible (amendement 4 de `specs/P0-programme-par-ia.md`).
   */
  nouvelOnglet?: string;
}

/**
 * Lien d'une source (ticket 822) : nouvel onglet, `rel="noopener noreferrer"`, cible tactile minimale ; un nom d'hôte
 * long se coupe n'importe où plutôt que de déborder (`wrap-anywhere`). Partagé par `ReasonBlock` et la section
 * « Site officiel » de `StopSheet`.
 */
export function LienSource({ href, children, nouvelOnglet }: LienSourceProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-part="source"
      className="flex min-h-(--touch-target) items-center self-start text-corps-s font-semibold text-ink underline underline-offset-2 wrap-anywhere"
    >
      {children}
      {nouvelOnglet ? <span className="sr-only">{nouvelOnglet}</span> : null}
    </a>
  );
}

/** « Source consultée le … » en `legende` `ink-soft` ; rien sans date (jamais le mot « Vérifié », F5-PO-9). */
export function DateConsultation({ verifiedAt }: { verifiedAt?: string }) {
  if (!verifiedAt) return null;
  return (
    <p data-part="consultee" className="text-legende text-ink-soft tabular-nums">
      {format(t.consultee, { date: formatDateLongue(verifiedAt) })}
    </p>
  );
}
