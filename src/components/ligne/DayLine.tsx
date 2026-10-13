import Link from "next/link";
import type { ReactNode } from "react";

import type { Meal, Segment, Stop } from "@/contracts";
import { format, messages } from "@/i18n";
import { formatDuree } from "@/lib/duree";
import { formatFaits } from "@/lib/faits";
import { cn } from "@/lib/utils";

import { StopMarker } from "./StopMarker";
import { Tag } from "./Tag";

const t = messages.ligne;

/** Texture du rail : plein (transport, arrêt), pointillé (marche), fin (temps libre). */
export type RailTexture = "plein" | "pointille" | "libre";

/** Le rail ne change jamais de couleur (line), sauf pendant le temps libre (track-free). */
const RAIL_CLASSES: Record<RailTexture, string> = {
  plein: "w-(--ligne-rail) bg-line",
  pointille: "w-(--ligne-rail) text-line",
  libre: "w-(--ligne-rail-free) bg-track-free",
};

/** Pointillé de la marche : traits de --ligne-rail-dash, vides de --ligne-rail-gap, en currentColor (line). */
const POINTILLE = {
  backgroundImage:
    "repeating-linear-gradient(to bottom, currentColor 0 var(--ligne-rail-dash), transparent var(--ligne-rail-dash) calc(var(--ligne-rail-dash) + var(--ligne-rail-gap)))",
};

/** Moitié haute ou basse d'un rail qui commence ou finit au centre d'un terminus. */
const CENTRE = "calc(var(--ligne-marqueur-decalage) + var(--ligne-terminus) / 2)";

interface RailProps {
  texture: RailTexture;
  /** « start » : le rail part du centre du marqueur ; « end » : il s'y arrête. */
  extent?: "full" | "start" | "end";
  marker?: ReactNode;
}

function Rail({ texture, extent = "full", marker }: RailProps) {
  return (
    <div aria-hidden="true" data-part="rail" className="relative">
      <span
        data-rail={texture}
        className={cn("absolute left-1/2 -translate-x-1/2", RAIL_CLASSES[texture])}
        style={{
          ...(texture === "pointille" ? POINTILLE : {}),
          top: extent === "start" ? CENTRE : 0,
          bottom: extent === "full" || extent === "start" ? 0 : undefined,
          height: extent === "end" ? CENTRE : undefined,
        }}
      />
      {marker ? (
        <span className="absolute left-1/2 top-(--ligne-marqueur-decalage) flex -translate-x-1/2">{marker}</span>
      ) : null}
    </div>
  );
}

const ROW = "grid grid-cols-[var(--ligne-col-heure)_var(--ligne-col-rail)_minmax(0,1fr)] gap-x-(--ligne-espace-2)";
const HEURE =
  "text-right text-(length:--ligne-texte-heure) leading-(--ligne-texte-heure-interligne) font-bold tabular-nums text-ink";

function Heure({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div data-part="heure" className={cn(HEURE, className)}>
      {children}
    </div>
  );
}

export interface DayLineTerminusProps {
  role: "start" | "end";
  time: string;
  /**
   * Nom du logement. Sans libellé (vue partagée, F10-TL-12) : « Début de journée » ou « Fin de journée »,
   * aucune information de logement n'est montrée.
   */
  label?: string;
}

/** Terminus de départ ou de retour : carré ink, « Départ de … » / « Retour à … », ou sans libellé. */
function Terminus({ role, time, label }: DayLineTerminusProps) {
  return (
    <li data-type="terminus" data-role={role} className={ROW}>
      <Heure>{time}</Heure>
      <Rail
        texture="plein"
        extent={role === "start" ? "start" : "end"}
        marker={<StopMarker kind="terminus" variant="ligne" />}
      />
      <p className={cn("text-corps font-bold text-ink", role === "start" ? "pb-3" : "")}>
        {label === undefined ? t.terminusSansLibelle[role] : format(t.terminus[role], { label })}
      </p>
    </li>
  );
}

/**
 * Étape telle que la ligne la lit (F10-TL-12) : `Stop` en est un sous-type, comme l'étape réduite de la vue
 * partagée (sans `id`, `reason`, `placeId`, `locked`, `source` ni `verifiedAt`, avec une clé locale au jour).
 * La ligne ne lit jamais `placeId`, `source` ni `verifiedAt`.
 */
export type DayLineViewStop = Pick<Stop, "name" | "start" | "facts" | "exceptions"> &
  Partial<Pick<Stop, "id" | "end" | "reason" | "locked">> & {
    /** Clé locale au jour (vue partagée), quand l'étape n'a pas d'`id`. */
    key?: string;
  };

/** Élément accepté par `DayLine` : `DayLineItem` et les éléments réduits de la vue partagée en sont des sous-types. */
export type DayLineViewItem<S extends DayLineViewStop = DayLineViewStop> =
  | { type: "terminus"; role: "start" | "end"; time: string; label?: string }
  | { type: "stop"; stop: S }
  | { type: "segment"; segment: Segment }
  | { type: "free"; from: string; to: string }
  | { type: "openMeal"; time: string; meal: Meal };

/** État d'une étape sur l'écran 15 : en cours (`aria-current="step"`) ou passée. */
export type DayLineStopState = "current" | "past";

export interface DayLineStopProps {
  stop: DayLineViewStop;
  /** Adresse de la fiche étape (écran 13) ; sans adresse, l'étape n'est pas interactive (même disposition). */
  href?: string;
  /** Une ligne : heure, nom, étiquette d'état et `Tag` ; ni faits, ni raison, ni mention de verrou. */
  compact?: boolean;
  state?: DayLineStopState;
}

/**
 * Arrêt : anneau line, nom, métadonnées, mention de verrou, justification et tags ; toute la zone ouvre
 * la fiche étape. Étape verrouillée (F5-PO-14) : « Verrouillée » en `legende` `ink-soft` sous les
 * métadonnées, texte seul tant que le tracé du cadenas manque (Q13, Q51) ; ce n'est pas une `Tag`.
 *
 * Écran 15 (F10-TL-12, rendu provisoire UX/UI) : étape en cours avec `aria-current="step"` et l'étiquette
 * visible « En cours » ; étape passée avec l'étiquette visible « Terminée », nom et heure en `ink-soft` en
 * complément (jamais la seule couleur), sans `Tag` : le jaune `quai` ne signale qu'une action requise
 * (handover § 0 règle 6, § 4.2), et une étape terminée n'en demande plus.
 */
function StopRow({ stop, href, compact = false, state }: DayLineStopProps) {
  const past = state === "past";
  const faits = formatFaits(stop.facts);
  const body = (
    <>
      <span className={cn("text-arret font-bold", past ? "text-ink-soft" : "text-ink")}>{stop.name}</span>
      {state ? (
        <>
          {" "}
          <span data-part="etat-etape" className="text-legende font-bold text-ink">
            {state === "current" ? t.etape.enCours : t.etape.terminee}
          </span>
        </>
      ) : null}
      {compact || faits === "" ? null : (
        <span data-part="faits" className="text-corps-s text-ink-soft">
          {faits}
        </span>
      )}
      {!compact && stop.locked ? (
        <span data-part="verrou" className="text-legende text-ink-soft">
          {t.verrouillee}
        </span>
      ) : null}
      {!compact && stop.reason ? <span className="text-corps-s text-ink">{stop.reason}</span> : null}
      {!past && stop.exceptions.length > 0 ? (
        <span className="mt-1 flex flex-wrap gap-(--ligne-espace-2)">
          {stop.exceptions.map((exception) => (
            <Tag key={exception} kind={exception} />
          ))}
        </span>
      ) : null}
    </>
  );
  return (
    <li
      data-type="stop"
      data-locked={stop.locked ? "true" : undefined}
      data-state={state}
      aria-current={state === "current" ? "step" : undefined}
      className={ROW}
    >
      <Heure className={past ? "text-ink-soft" : undefined}>{stop.start}</Heure>
      <Rail texture="plein" marker={<StopMarker kind="stop" variant="ligne" />} />
      {href === undefined ? (
        <div data-part="arret" className={cn("flex min-w-0 flex-col items-start gap-1", compact ? "pb-3" : "pb-4")}>
          {body}
        </div>
      ) : (
        <Link
          href={href}
          scroll={false}
          data-part="arret"
          className="flex min-h-(--touch-target) min-w-0 flex-col items-start gap-1 rounded-badge pb-4"
        >
          {body}
        </Link>
      )}
    </li>
  );
}

/** Libellé d'un segment : « À pied, 20 min », « Bus, environ 25 min (estimation) ». */
export function segmentLabel(segment: Segment): string {
  const values = { mode: t.segment[segment.mode], duree: formatDuree(segment.minutes) };
  return format(segment.estimated ? t.segment.libelleEstime : t.segment.libelle, values);
}

export interface DayLineSegmentProps {
  segment: Segment;
}

/** Trajet entre deux lignes : pointillé à pied, plein en transport et en voiture (provisoire, Q16). */
function SegmentRow({ segment }: DayLineSegmentProps) {
  return (
    <li data-type="segment" data-mode={segment.mode} className={ROW}>
      <Heure />
      <Rail texture={segment.mode === "walk" ? "pointille" : "plein"} />
      <p className="flex min-h-10 items-center text-legende text-ink-soft">{segmentLabel(segment)}</p>
    </li>
  );
}

export interface DayLineFreeTimeProps {
  from: string;
  to: string;
  /** Destination du lien « Idées » ; sans adresse, pas de lien (Q17). */
  ideasHref?: string;
}

/** Temps libre : rail fin track-free, bloc muted « Temps libre jusqu'à … » et lien « Idées ». */
function FreeTime({ from, to, ideasHref }: DayLineFreeTimeProps) {
  return (
    <li data-type="free" className={cn(ROW, "min-h-16")}>
      <Heure className="pt-3 text-legende font-semibold text-ink-soft">{from}</Heure>
      <Rail texture="libre" />
      <div className="my-2 flex min-h-(--touch-target) items-center justify-between gap-(--ligne-espace-2) rounded-(--ligne-rayon-temps-libre) bg-muted pl-3 pr-1 text-corps-s text-ink-2">
        <span>{format(t.tempsLibre.texte, { to })}</span>
        {ideasHref ? (
          <Link
            href={ideasHref}
            data-part="idees"
            className="inline-flex min-h-(--touch-target) min-w-(--touch-target) shrink-0 items-center justify-center px-2 font-bold text-ink underline underline-offset-2"
          >
            {t.tempsLibre.idees}
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export interface DayLineOpenMealProps {
  time: string;
  meal: Meal;
}

/**
 * Créneau de repas pas encore choisi (F5-PO-13, décision 0015 § 2 ; provisoire UX/UI) : heure, anneau et
 * rail comme un arrêt, « Déjeuner pas encore choisi » ou « Dîner pas encore choisi » en `arret` `ink-2`.
 * Sans lieu : ni lien, ni fiche, ni marqueur sur la carte ; signalé par son texte, sans badge.
 */
function OpenMeal({ time, meal }: DayLineOpenMealProps) {
  return (
    <li data-type="openMeal" data-meal={meal} className={ROW}>
      <Heure>{time}</Heure>
      <Rail texture="plein" marker={<StopMarker kind="stop" variant="ligne" />} />
      <p className="flex min-h-(--touch-target) items-start pb-4 text-arret font-bold text-ink-2">{t.repasNonChoisi[meal]}</p>
    </li>
  );
}

export interface DayLineProps<S extends DayLineViewStop = Stop> {
  items: readonly DayLineViewItem<S>[];
  /** Adresse de la fiche étape d'un arrêt ; sans fonction, aucune étape n'est un lien (écran 15, vue partagée). */
  getStopHref?: (stop: S) => string;
  /**
   * Destination du lien « Idées » d'une plage de temps libre (F5-TL-8, décision 0015 § 8) ; sans
   * fonction, pas de lien. Remplace l'ancienne prop `ideasHref`.
   */
  getIdeasHref?: (free: { from: string; to: string }) => string;
  /** Écran 15 : une ligne par élément, ni faits ni raison (F10-TL-12). */
  compact?: boolean;
  /** Clé de l'étape en cours (`id`, sinon clé locale) : `aria-current="step"` et étiquette « En cours ». */
  currentKey?: string;
  /** Étape passée : étiquette « Terminée ». Sans effet sur un terminus, un segment, un temps libre ou un repas. */
  isPast?: (stop: S) => boolean;
  className?: string;
}

/** Clé d'une étape : son `id`, sinon sa clé locale, sinon son rang dans la ligne. */
function stopKey(stop: DayLineViewStop, index: number): string {
  return stop.id ?? stop.key ?? `#${index}`;
}

/**
 * La ligne du jour, du terminus de départ au terminus de retour. Design system : components/DayLine.
 * Liste ordonnée sémantique ; rail et marqueurs décoratifs. Sans `getStopHref` facultatif, `compact`,
 * `currentKey` ni `isPast`, le rendu reste celui de F3 et F5.
 */
function DayLineRoot<S extends DayLineViewStop = Stop>({
  items,
  getStopHref,
  getIdeasHref,
  compact = false,
  currentKey,
  isPast,
  className,
}: DayLineProps<S>) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        switch (item.type) {
          case "terminus":
            return <Terminus key={`terminus-${item.role}-${index}`} role={item.role} time={item.time} label={item.label} />;
          case "stop": {
            const key = stopKey(item.stop, index);
            const state: DayLineStopState | undefined =
              currentKey !== undefined && key === currentKey ? "current" : isPast?.(item.stop) ? "past" : undefined;
            return (
              <StopRow key={`stop-${key}`} stop={item.stop} href={getStopHref?.(item.stop)} compact={compact} state={state} />
            );
          }
          case "segment":
            return <SegmentRow key={`segment-${index}`} segment={item.segment} />;
          case "free":
            return (
              <FreeTime
                key={`free-${index}`}
                from={item.from}
                to={item.to}
                ideasHref={getIdeasHref?.({ from: item.from, to: item.to })}
              />
            );
          case "openMeal":
            return <OpenMeal key={`openMeal-${index}`} time={item.time} meal={item.meal} />;
        }
      })}
    </ol>
  );
}

export const DayLine = Object.assign(DayLineRoot, {
  Terminus,
  Stop: StopRow,
  Segment: SegmentRow,
  FreeTime,
  OpenMeal,
});
