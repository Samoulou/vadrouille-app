"use client";

import type { Ref } from "react";

import type { Weekday } from "@/contracts";
import { cn } from "@/lib/utils";

import { DayBadgeRadio } from "./DayBadge";
import { useRadioGroup } from "./useRadioGroup";

export interface DayBadgeGroupDay {
  /** 1 = J1. */
  day: number;
  /** Jour abrégé, dans le nom accessible seulement (Q18). */
  weekday?: Weekday;
  /** Jour « complet » : atteignable aux flèches, jamais coché (décision 0019 § 1.2). */
  disabled?: boolean;
}

export interface DayBadgeGroupProps {
  days: readonly DayBadgeGroupDay[];
  /** Jour coché, ou `null` : aucune présélection (spécification F7, « Présélection … sinon aucun »). */
  value: number | null;
  /** Jour coché par un clic, Espace, Entrée ou les flèches ; jamais un jour « complet ». */
  onChange: (day: number) => void;
  /** Identifiant du titre de niveau 3 qui nomme le groupe (« Vers quel jour ? », « Quel jour ? »). */
  labelledBy: string;
  /** Identifiant du groupe, qui reçoit le focus d'une erreur de choix (0018, « Message d'erreur et annonces »). */
  id?: string;
  groupRef?: Ref<HTMLDivElement>;
  /** Identifiants des textes qui décrivent le groupe (message d'erreur). */
  describedBy?: string;
  /** Erreur de choix : `aria-invalid` sur le groupe. */
  invalid?: boolean;
  className?: string;
}

/**
 * Choix d'un jour (spécification F7, F7-TL-5 ; décision 0019 § 1) : groupe radio nommé par son titre, une `DayBadge`
 * en rendu radio par jour, logique clavier de `useRadioGroup` (un seul arrêt de tabulation, flèches, Début, Fin,
 * bouclage, le choix suit le focus). Un jour « complet » est `aria-disabled="true"` : les flèches y posent le focus
 * sans le cocher. Cocher un jour n'envoie aucune demande : l'écran affiche ce qui est déjà chargé. Rendu de 0018
 * § 10 : pastilles à la ligne (écart `space-2`), jour coché en pastille active de F3, jour complet désactivé.
 */
export function DayBadgeGroup({ days, value, onChange, labelledBy, id, groupRef, describedBy, invalid = false, className }: DayBadgeGroupProps) {
  const selectedIndex = days.findIndex((day) => day.day === value && !day.disabled);
  const radio = useRadioGroup({
    count: days.length,
    selectedIndex,
    onSelect: (index) => {
      const day = days[index];
      if (day) onChange(day.day);
    },
    isDisabled: (index) => days[index]?.disabled === true,
  });

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      tabIndex={-1}
      data-part="jours"
      className={cn("flex flex-wrap gap-(--ligne-espace-2) rounded-control", className)}
    >
      {days.map((day, index) => (
        <DayBadgeRadio
          key={day.day}
          day={day.day}
          weekday={day.weekday}
          checked={index === selectedIndex}
          disabled={day.disabled}
          tabStop={index === radio.tabStop}
          buttonRef={radio.itemRef(index)}
          onActivate={() => radio.onActivate(index)}
          onKeyDown={(event) => radio.onKeyDown(event, index)}
        />
      ))}
    </div>
  );
}
