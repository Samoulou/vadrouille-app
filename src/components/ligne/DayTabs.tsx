"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";

import type { Weekday } from "@/contracts";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { DayBadge } from "./DayBadge";

const t = messages.ligne.jours;

export interface DayTabsDay {
  /** 1 = J1. */
  index: number;
  href: string;
  weekday?: Weekday;
  /** Ville du jour pour le nom accessible de la pastille (`DayBadge`, spécification M4 § 7.7) ; absente : aucun effet. */
  ville?: string;
  disabled?: boolean;
}

export interface DayTabsProps {
  days: DayTabsDay[];
  /** Index du jour actif, ou l'onglet « Séjour ». */
  current: number | "sejour";
  /** Proposition : adresse de l'onglet « Séjour ». */
  sejourHref: string;
  /** Proposition : nom du repère, « Jours du séjour » (fr.json) par défaut ; à changer seulement si deux rangées coexistent. */
  label?: string;
  /** Préchargement des liens de la rangée (`DayBadge`) ; absent : comportement par défaut. Vue partagée : `false`. */
  prefetch?: false;
  className?: string;
}

/**
 * Rangée « Séjour » + pastilles de jour. Design system : components/DayBadge (onglet « Aperçu » renommé
 * « Séjour », handover § 10). Seule la rangée défile horizontalement ; la pastille active est rendue
 * visible au montage, sans animation.
 */
export function DayTabs({ days, current, sejourHref, label = t.navigation, prefetch, className }: DayTabsProps) {
  const scroller = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const list = scroller.current;
    const active = list?.querySelector<HTMLElement>("[aria-current='page']");
    if (!list || !active) {
      return;
    }
    const listBox = list.getBoundingClientRect();
    const box = active.getBoundingClientRect();
    // Défilement instantané de la rangée seule : la page ne bouge pas.
    if (box.right > listBox.right) {
      list.scrollLeft += box.right - listBox.right + list.clientWidth / 2 - box.width / 2;
    } else if (box.left < listBox.left) {
      list.scrollLeft -= listBox.left - box.left;
    }
  }, [current]);

  const sejourActive = current === "sejour";

  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul
        ref={scroller}
        className="relative flex items-center gap-(--ligne-espace-2) overflow-x-auto overscroll-x-contain p-1"
      >
        <li className="shrink-0">
          <Link
            href={sejourHref}
            prefetch={prefetch}
            aria-current={sejourActive ? "page" : undefined}
            className={cn(
              "inline-flex min-h-(--touch-target) items-center border-b-(length:--ligne-trait-onglet) px-(--ligne-espace-2) text-corps",
              sejourActive ? "border-line font-extrabold text-ink" : "border-transparent font-semibold text-ink-soft",
            )}
          >
            {t.sejour}
          </Link>
        </li>
        {days.map((day) => (
          <li key={day.index} className="shrink-0">
            <DayBadge
              day={day.index}
              weekday={day.weekday}
              ville={day.ville}
              disabled={day.disabled}
              href={day.href}
              prefetch={prefetch}
              active={current === day.index}
              currentValue="page"
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
