import { useId } from "react";

import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { IconCoche } from "./icons";

const t = messages.ligne.checklist;

export interface ChecklistRowProps {
  /** Nom de la réservation ; c'est aussi le nom accessible de la case. */
  label: string;
  /** Moment, affiché tel quel (« J2, 15:00, 2 personnes »). */
  when: string;
  done: boolean;
  /** Lien de réservation ; sans lien, pas de « Réserver ». */
  bookingUrl?: string;
  /** Lien rémunéré : signalé comme tel à côté de « Réserver » (README). */
  sponsored: boolean;
  /** Nouvel état demandé par la case. */
  onToggle: (done: boolean) => void;
  className?: string;
}

/**
 * Ligne de la liste « À faire avant de partir » (design system : components/ChecklistRow ; spécification F5,
 * F5-PO-4). Case de 22 px dans une zone de 44 px (`aria-pressed`, nom = `label`), nom en 15 px 700, moment en
 * `legende` `ink-soft`, lien « Réserver » en `line` 800 d'au moins 44 px de haut, dans un nouvel onglet. Faite,
 * la ligne passe en `ink-soft`, le nom est barré, le lien disparaît, et la ligne reste à sa place. La case
 * s'annule elle-même : pas de toast d'annulation.
 */
export function ChecklistRow({ label, when, done, bookingUrl, sponsored, onToggle, className }: ChecklistRowProps) {
  const labelId = useId();
  const link = !done && bookingUrl ? bookingUrl : undefined;

  return (
    <div
      data-part="checklist-row"
      data-done={done ? "true" : "false"}
      className={cn("flex min-h-(--touch-target) items-center gap-1.5 py-1.5", done ? "text-ink-soft" : "text-ink", className)}
    >
      <button
        type="button"
        aria-pressed={done}
        aria-labelledby={labelId}
        data-part="case"
        onClick={() => onToggle(!done)}
        className="inline-flex size-(--touch-target) shrink-0 items-center justify-center rounded-control"
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-5.5 items-center justify-center rounded-(--ligne-rayon-terminus) border-2 border-ink",
            done ? "bg-ink text-on-line" : "bg-raised",
          )}
        >
          {done ? <IconCoche className="size-3.5" /> : null}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className={cn("text-corps", done ? "font-semibold line-through" : "font-bold")}>
          {label}
        </span>
        <span className="text-legende text-ink-soft tabular-nums">{when}</span>
      </div>
      {link ? (
        <span className="flex shrink-0 flex-col items-end">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby={labelId}
            data-part="reserver"
            className="inline-flex min-h-(--touch-target) items-center px-1 text-corps-s font-extrabold text-line"
          >
            {t.reserver}
          </a>
          {sponsored ? (
            <span data-part="remunere" className="px-1 text-legende text-ink-soft">
              {t.remunere}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
