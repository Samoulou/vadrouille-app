"use client";

import { useState, type Ref, type TouchEvent } from "react";

import { IconCalendrier } from "@/components/ligne/icons";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { Calendrier } from "./Calendrier";
import { describedBy, errorId, FieldHelp, fieldId, FieldLabel, FieldMessage, helpId, INPUT_CLASS } from "./fields";

/**
 * Champ de date de la création (décision 0176) : le champ `type="date"` garde la saisie, les bornes et la
 * validation ; le calendrier du navigateur est remplacé par une feuille de calendrier de Ligne (bouton dans le
 * champ, et appui au doigt sur le champ). Module à part de `fields.tsx`, que le séjour importe aussi : le
 * calendrier et ses textes ne pèsent ainsi que sur les écrans de la création (budget JavaScript, 0016 § 3.1).
 */

const t = messages.creation.calendrier;

export interface DateFieldProps {
  field: string;
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  /** Premières et dernières dates proposées (`AAAA-MM-JJ`). */
  min?: string;
  max?: string;
  /** Séjour déjà saisi, teinté dans le calendrier ; et aujourd'hui. */
  sejour?: { debut: string; fin: string } | null;
  aujourdhui?: string | null;
  autoComplete?: string;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

export function DateField({
  field,
  label,
  help,
  value,
  onChange,
  error = null,
  min,
  max,
  sejour = null,
  aujourdhui = null,
  autoComplete = "off",
  inputRef,
  className,
}: DateFieldProps) {
  const id = fieldId(field);
  const [calendrier, setCalendrier] = useState(false);
  // Au doigt, le calendrier de Ligne remplace celui du téléphone : l'appui n'atteint pas le champ (ni focus ni clic).
  const auDoigt = (event: TouchEvent<HTMLInputElement>) => {
    event.preventDefault();
    setCalendrier(true);
  };
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {help ? <FieldHelp id={helpId(id)}>{help}</FieldHelp> : null}
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(help && helpId(id), error && errorId(id))}
          onChange={(event) => onChange(event.target.value)}
          onTouchEnd={auDoigt}
          // Le bouton du navigateur est retiré : le calendrier de Ligne (bouton à droite) le remplace (décision 0176).
          className={cn(
            INPUT_CLASS,
            "pr-13 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-line",
          )}
        />
        <button
          type="button"
          data-part="ouvrir-calendrier"
          aria-haspopup="dialog"
          onClick={() => setCalendrier(true)}
          className="absolute inset-y-0 right-0 inline-flex w-13 cursor-pointer items-center justify-center rounded-control text-ink"
        >
          <IconCalendrier className="size-5" />
          {/* Nom du bouton en texte masqué, pas en `aria-label` : une recherche par libellé ne trouve que le champ. */}
          <span className="sr-only">{format(t.ouvrir, { champ: label })}</span>
        </button>
        <Dialog open={calendrier} onOpenChange={setCalendrier}>
          <DialogSheet aria-describedby={undefined} data-part="feuille-calendrier">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="text-section font-semibold text-ink">{format(t.titre, { champ: label })}</DialogTitle>
              <DialogClose className="min-h-(--touch-target) cursor-pointer rounded-control px-2 text-corps text-ink underline underline-offset-2">
                {t.fermer}
              </DialogClose>
            </div>
            <Calendrier
              value={value}
              min={min}
              max={max}
              sejour={sejour}
              aujourdhui={aujourdhui}
              onSelect={(date) => {
                onChange(date);
                setCalendrier(false);
              }}
            />
          </DialogSheet>
        </Dialog>
      </div>
      <FieldMessage id={errorId(id)} message={error} />
    </div>
  );
}
