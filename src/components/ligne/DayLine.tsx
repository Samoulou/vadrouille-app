import Link from "next/link";
import type { ReactNode } from "react";

import type { DayLineItem, Segment, Stop } from "@/contracts";
import { format, messages } from "@/i18n";
import { formatDuree } from "@/lib/duree";
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
  /** Nom du logement. */
  label: string;
}

/** Terminus de départ ou de retour : carré ink, « Départ de … » / « Retour à … ». */
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
        {format(t.terminus[role], { label })}
      </p>
    </li>
  );
}

export interface DayLineStopProps {
  stop: Stop;
  /** Adresse de la fiche étape (écran 13). */
  href: string;
}

/** Arrêt : anneau line, nom, métadonnées, justification et tags ; toute la zone ouvre la fiche étape. */
function StopRow({ stop, href }: DayLineStopProps) {
  return (
    <li data-type="stop" className={ROW}>
      <Heure>{stop.start}</Heure>
      <Rail texture="plein" marker={<StopMarker kind="stop" variant="ligne" />} />
      <Link
        href={href}
        data-part="arret"
        className="flex min-h-(--touch-target) min-w-0 flex-col items-start gap-1 rounded-badge pb-4"
      >
        <span className="text-arret font-bold text-ink">{stop.name}</span>
        <span className="text-corps-s text-ink-soft">{stop.meta}</span>
        {stop.reason ? <span className="text-corps-s text-ink">{stop.reason}</span> : null}
        {stop.exceptions.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-(--ligne-espace-2)">
            {stop.exceptions.map((exception) => (
              <Tag key={exception} kind={exception} />
            ))}
          </span>
        ) : null}
      </Link>
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

export interface DayLineProps {
  items: DayLineItem[];
  /** Proposition : adresse de la fiche étape d'un arrêt. */
  getStopHref: (stop: Stop) => string;
  /** Proposition : destination du lien « Idées » du temps libre (Q17). */
  ideasHref?: string;
  className?: string;
}

/**
 * La ligne du jour, du terminus de départ au terminus de retour. Design system : components/DayLine.
 * Liste ordonnée sémantique ; rail et marqueurs décoratifs.
 */
function DayLineRoot({ items, getStopHref, ideasHref, className }: DayLineProps) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        switch (item.type) {
          case "terminus":
            return <Terminus key={`terminus-${item.role}-${index}`} role={item.role} time={item.time} label={item.label} />;
          case "stop":
            return <StopRow key={`stop-${item.stop.id}`} stop={item.stop} href={getStopHref(item.stop)} />;
          case "segment":
            return <SegmentRow key={`segment-${index}`} segment={item.segment} />;
          case "free":
            return <FreeTime key={`free-${index}`} from={item.from} to={item.to} ideasHref={ideasHref} />;
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
});
