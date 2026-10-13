import { useId } from "react";

import type { ChecklistMoment } from "@/contracts";
import { format, messages } from "@/i18n";
import { formatDateCourte } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { IconCoche } from "./icons";

const t = messages.ligne.checklist;

export interface ChecklistRowProps {
  /** Nom de la réservation ; c'est aussi le nom accessible de la case. */
  label: string;
  /** Moment (évolution E4 de B2), dont la ligne compose le libellé (`formatChecklistMoment`). */
  when: ChecklistMoment;
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
 * s'annule elle-même : pas de toast d'annulation. « Lien rémunéré » est sur la même ligne, juste avant
 * « Réserver » (README : « signalé comme tel » ; place provisoire, UX/UI, F5-Q1).
 *
 * Mesures sans token (F5c-Q5, à rattacher à `provisoire.css`, gelé par Q175 pendant F12b et F12c) : case de
 * 22 px (`size-5.5`), coche de 14 px (`size-3.5`) et coins de 5 px, pris de `ChecklistRow/preview.html` ; les
 * coins réutilisent `--ligne-rayon-terminus` (5 px, Q19) en attendant.
 *
 * Volontairement sans directive `"use client"` (revue de la PR 128, M2) : ce composant n'a ni état ni effet, et il
 * est exporté par l'index de `components/ligne`, que `src/app/not-found.tsx` (composant serveur) importe.
 * Avec la directive, il deviendrait une référence client de toutes les pages et alourdirait leur JavaScript
 * initial (+4,9 Ko gzip mesurés sur l'accueil). Il est rendu côté client par les écrans qui l'importent
 * (Séjour, `/dev/composants`), qui fournissent `onToggle`. Ne pas l'utiliser depuis un composant serveur.
 */
/**
 * Libellé d'un moment (évolution E4 de B2, libellés provisoires B2-PO-10) : « Avant le sam. 22.08 » pour une date
 * limite, « Avant le départ », « À l'arrivée » pour le J1, « J{n} » pour un autre jour.
 */
export function formatChecklistMoment(moment: ChecklistMoment): string {
  switch (moment.type) {
    case "deadline":
      return format(t.moment.deadline, { date: formatDateCourte(moment.date) });
    case "beforeDeparture":
      return t.moment.beforeDeparture;
    case "tripDay":
      return moment.day === 1 ? t.moment.arrivee : format(t.moment.jour, { n: moment.day });
  }
}

export function ChecklistRow({ label, when, done, bookingUrl, sponsored, onToggle, className }: ChecklistRowProps) {
  const labelId = useId();
  const sponsoredId = useId();
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
            done ? "bg-ink text-on-line" : "bg-transparent",
          )}
        >
          {done ? <IconCoche className="size-3.5" /> : null}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 flex-col">
        <span id={labelId} className={cn("text-corps", done ? "font-semibold line-through" : "font-bold")}>
          {label}
        </span>
        <span className="text-legende text-ink-soft tabular-nums">{formatChecklistMoment(when)}</span>
      </div>
      {link ? (
        <span className="flex shrink-0 items-center gap-1">
          {sponsored ? (
            <span id={sponsoredId} data-part="remunere" className="text-legende text-ink-soft">
              {t.remunere}
            </span>
          ) : null}
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby={sponsored ? `${labelId} ${sponsoredId}` : labelId}
            data-part="reserver"
            className="inline-flex min-h-(--touch-target) items-center px-1 text-corps-s font-extrabold text-line"
          >
            {t.reserver}
          </a>
        </span>
      ) : null}
    </div>
  );
}
