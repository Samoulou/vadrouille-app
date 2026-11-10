import type { ReactNode } from "react";

import type { Change } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDuree } from "@/lib/duree";
import { formatNombre } from "@/lib/nombre";
import { cn } from "@/lib/utils";

const t = messages.ligne.changeSet;

export interface ChangeSetProps {
  /** Changements de l'aperçu, dans l'ordre des données ; `unchanged` et un budget nul ne sont pas rendus. */
  changes: readonly Change[];
  className?: string;
}

/** Changement rendu par `ChangeSet` : ni `unchanged` (« Ce qui ne bouge pas »), ni budget nul. */
export function isShownChange(change: Change): boolean {
  if (change.type === "unchanged") return false;
  if (change.type === "budget") return change.deltaPerPerson !== 0;
  return true;
}

const HEURE = "font-bold tabular-nums";
const ANCIEN = "text-ink-soft";

/** Texte masqué visuellement, lu par les lecteurs d'écran (« avant : », « après : »). */
function Masque({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/**
 * Format à flèche (`moved`, `segment`) : ancienne valeur barrée précédée de « avant : » masqué, flèche décorative
 * suivie de « après : » masqué. Un lecteur d'écran lit « avant : J2 13:25 après : J4 15:45 » (décision 0018 § 8).
 */
function Fleche({ before, after }: { before: string; after: string }) {
  return (
    <>
      <Masque>{t.avant} </Masque>
      <del className={ANCIEN}>{before}</del>{" "}
      {/* Flèche liée à la valeur suivante : jamais seule en fin de ligne. */}
      <span data-part="apres" className="whitespace-nowrap">
        <span aria-hidden="true">{t.fleche}</span> <Masque>{t.apres} </Masque>
        <span>{after}</span>
      </span>
    </>
  );
}

function moment(value: { day: number; time: string }): string {
  return format(t.jourHeure, { day: value.day, time: value.time });
}

function Ligne({ change }: { change: Change }): ReactNode {
  switch (change.type) {
    case "replaced":
      // « à la place de » porte l'information : pas de « avant : » masqué (décision 0018 § 8).
      return (
        <>
          <span className={HEURE}>{change.time}</span> {change.after} {t.aLaPlaceDe}{" "}
          <del className={ANCIEN}>{change.before}</del>
        </>
      );
    case "added":
      return (
        <>
          <span className={HEURE}>{change.time}</span> {change.label} {t.ajoute}
        </>
      );
    case "moved": {
      // Même jour : « {nom} : {heure} → {heure} » ; sinon « {nom} : J{a} {heure} → J{b} {heure} ».
      const sameDay = change.before.day === change.after.day;
      return (
        <>
          {format(t.deplace, { label: change.label })}{" "}
          <span className="tabular-nums">
            <Fleche
              before={sameDay ? change.before.time : moment(change.before)}
              after={sameDay ? change.after.time : moment(change.after)}
            />
          </span>
        </>
      );
    }
    case "segment": {
      const after = formatDuree(change.after);
      return (
        <>
          {format(t.trajetVers, { label: change.label })}{" "}
          <span className="tabular-nums">
            <Fleche before={formatDuree(change.before)} after={change.estimated ? format(t.estimation, { duree: after }) : after} />
          </span>
        </>
      );
    }
    case "budget": {
      const signe = change.deltaPerPerson > 0 ? t.plus : t.moins;
      return <>{format(t.budget, { montant: `${signe}${formatNombre(Math.abs(change.deltaPerPerson))}` })}</>;
    }
    case "unchanged":
      return null;
    // Variantes de M5 (décision 0147 § 5.1) ; textes provisoires, à valider par UX/UI.
    case "removed":
      // Ancien moment (jour et heure) et nom barré ; « retiré » porte l'information (le barré ne la porte jamais seul).
      return (
        <>
          <span className={HEURE}>{moment(change.before)}</span> <del className={ANCIEN}>{change.label}</del> {t.retire}
        </>
      );
    case "locked":
      return (
        <>
          <span className={HEURE}>{change.time}</span> {format(t.verrouille, { label: change.label })}
        </>
      );
    case "unlocked":
      return (
        <>
          <span className={HEURE}>{change.time}</span> {format(t.verrouRetire, { label: change.label })}
        </>
      );
    case "checklist":
      return <>{format(change.action === "added" ? t.aFaireAjoutee : t.aFaireRetiree, { label: change.label })}</>;
  }
}

/**
 * « Ce qui change » d'un aperçu (handover § 5 ; spécification F7, F7-PO-5 ; rendu de la décision 0018 § 8) : une
 * ligne par changement, rendue d'après son type, sans texte d'interface dans les données (handover § 9). Liste
 * sans puces, `corps` `ink`, heure en 700 tabulaire, ancienne valeur barrée en `ink-soft` (le barré ne porte
 * jamais seul l'information). Le composant ne connaît ni les adresses ni les actions.
 */
export function ChangeSet({ changes, className }: ChangeSetProps) {
  return (
    <ul data-part="change-set" className={cn("flex flex-col gap-2 text-corps text-ink", className)}>
      {changes.filter(isShownChange).map((change, index) => (
        <li key={`${change.type}-${index}`} data-change={change.type}>
          <Ligne change={change} />
        </li>
      ))}
    </ul>
  );
}
