"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { IconButton } from "@/components/ligne/IconButton";
import { IconRetour } from "@/components/ligne/icons";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";
import { cn } from "@/lib/utils";

const t = messages.creation.calendrier;
const MOIS = messages.ligne.dates.mois;

/** Déplacement du focus, en jours, pour chaque flèche. */
const PAS = new Map([
  ["ArrowLeft", -1],
  ["ArrowRight", 1],
  ["ArrowUp", -7],
  ["ArrowDown", 7],
]);

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (value: number) => String(value).padStart(2, "0");
const iso = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;

/** Mois (1 à 12) et année d'une date ISO valide ; `null` sinon. */
function moisDe(date: string | undefined): { year: number; month: number } | null {
  const lu = date ? ISO.exec(date) : null;
  return lu ? { year: Number(lu[1]), month: Number(lu[2]) } : null;
}

/** Jours d'un mois, précédés des cases vides qui alignent le 1er sous son jour (semaine du lundi au dimanche). Calcul en UTC. */
function grille(year: number, month: number): (string | null)[][] {
  const premier = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const jours = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cases: (string | null)[] = [
    ...Array.from({ length: premier }, () => null),
    ...Array.from({ length: jours }, (_, index) => iso(year, month, index + 1)),
  ];
  while (cases.length % 7 !== 0) cases.push(null);
  return Array.from({ length: cases.length / 7 }, (_, semaine) => cases.slice(semaine * 7, semaine * 7 + 7));
}

export interface CalendrierProps {
  /** Date choisie (`AAAA-MM-JJ`), ou chaîne vide. */
  value: string;
  /** Premier et dernier jour proposés ; hors de ces bornes, le jour est désactivé. */
  min?: string;
  max?: string;
  /** Séjour déjà saisi (arrivée, départ) : ses jours sont teintés, pour situer la date dans le voyage. */
  sejour?: { debut: string; fin: string } | null;
  /** Aujourd'hui (`AAAA-MM-JJ`), marqué `aria-current`. */
  aujourdhui?: string | null;
  onSelect: (date: string) => void;
}

/**
 * Calendrier de Ligne (décision 0176) : un mois à la fois, semaine du lundi au dimanche, un bouton par jour. Le jour
 * choisi est un aplat `line` (code de sélection), les jours du séjour sont teintés `muted`, les jours hors bornes sont
 * désactivés. Clavier : flèches d'un jour ou d'une semaine dans le mois affiché, Page précédente et Page suivante
 * changent de mois. Aucune date n'est calculée dans le fuseau du navigateur.
 */
export function Calendrier({ value, min, max, sejour = null, aujourdhui = null, onSelect }: CalendrierProps) {
  const depart = moisDe(value) ?? moisDe(min) ?? moisDe(aujourdhui ?? undefined) ?? { year: 2027, month: 1 };
  const [vue, setVue] = useState(depart);
  const table = useRef<HTMLTableElement>(null);
  const semaines = grille(vue.year, vue.month);
  const premierDuMois = iso(vue.year, vue.month, 1);
  const dernierDuMois = iso(vue.year, vue.month, new Date(Date.UTC(vue.year, vue.month, 0)).getUTCDate());
  const horsBornes = (date: string) => (min !== undefined && date < min) || (max !== undefined && date > max);
  const changer = (delta: number) =>
    setVue(({ year, month }) => {
      const rang = year * 12 + (month - 1) + delta;
      return { year: Math.floor(rang / 12), month: (rang % 12) + 1 };
    });
  const precedentFerme = min !== undefined && premierDuMois <= min;
  const suivantFerme = max !== undefined && dernierDuMois >= max;

  function auClavier(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key === "PageUp" || event.key === "PageDown") {
      const ferme = event.key === "PageUp" ? precedentFerme : suivantFerme;
      event.preventDefault();
      if (!ferme) changer(event.key === "PageUp" ? -1 : 1);
      return;
    }
    const pas = PAS.get(event.key);
    if (pas === undefined) return;
    event.preventDefault();
    const jours = Array.from(table.current?.querySelectorAll<HTMLButtonElement>("button[data-date]") ?? []);
    const rang = jours.findIndex((jour) => jour === document.activeElement);
    // Saute les jours désactivés, sans sortir du mois affiché.
    for (let cible = rang + pas; cible >= 0 && cible < jours.length; cible += pas) {
      if (!jours[cible]!.disabled) {
        jours[cible]!.focus();
        return;
      }
    }
  }

  return (
    <div data-part="calendrier" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <IconButton icon={<IconRetour />} label={t.precedent} disabled={precedentFerme} onClick={() => changer(-1)} />
        <p aria-live="polite" data-part="mois" className="text-section font-semibold text-ink first-letter:uppercase">
          {format(t.mois, { mois: MOIS[vue.month - 1] ?? "", annee: vue.year })}
        </p>
        <IconButton
          icon={<IconRetour className="rotate-180" />}
          label={t.suivant}
          disabled={suivantFerme}
          onClick={() => changer(1)}
        />
      </div>
      <table ref={table} onKeyDown={auClavier} className="w-full table-fixed border-collapse text-center">
        <thead>
          <tr>
            {t.jours.map((jour) => (
              <th key={jour.long} scope="col" abbr={jour.long} className="pb-1 text-legende font-semibold text-ink-soft">
                {jour.court}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semaines.map((semaine, rang) => (
            <tr key={rang}>
              {semaine.map((date, colonne) => {
                if (date === null) return <td key={colonne} />;
                const choisi = date === value;
                const dansSejour = sejour !== null && date >= sejour.debut && date <= sejour.fin;
                return (
                  <td key={colonne} className={cn("p-0", dansSejour && !choisi && "bg-muted")}>
                    <button
                      type="button"
                      data-date={date}
                      aria-label={formatDateLongue(date)}
                      aria-pressed={choisi}
                      aria-current={date === aujourdhui ? "date" : undefined}
                      disabled={horsBornes(date)}
                      onClick={() => onSelect(date)}
                      className={cn(
                        "inline-flex size-(--touch-target) cursor-pointer items-center justify-center rounded-control text-corps font-semibold text-ink tabular-nums disabled:cursor-not-allowed disabled:font-normal disabled:text-ink-soft disabled:line-through",
                        choisi && "bg-line text-on-line",
                        date === aujourdhui && !choisi && "border-(length:--ligne-trait-controle) border-ink",
                      )}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
