import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import type { Meal, Segment, Stop, TransferItem } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
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
  | { type: "openMeal"; time: string; meal: Meal }
  /**
   * Changement de ville (décision 0148 § 1) : ligne « Vers {ville} », rendue seulement par l'écran qui la demande
   * (`renderTransfer`, spécification M4 § 7.6) ; sans elle (vue partagée, écran 15), rien n'est rendu.
   */
  | TransferItem;

/** État d'une étape sur l'écran 15 : en cours (`aria-current="step"`) ou passée. */
export type DayLineStopState = "current" | "past";

export interface DayLineStopProps {
  stop: DayLineViewStop;
  /** Adresse de la fiche étape (écran 13) ; sans adresse, l'étape n'est pas interactive (même disposition). */
  href?: string;
  /** Une ligne : heure, nom, étiquette d'état et `Tag` ; ni faits, ni raison, ni mention de verrou. */
  compact?: boolean;
  state?: DayLineStopState;
  /**
   * Étape modifiée, surlignée 2 s après « Appliquer » (F7, décision 0016 § 9 ; rendu de 0018 § 9) : fond `muted`
   * derrière la ligne et arrêt plein `line`, texte en `ink` ; fondu bref à la fin, sans transition sous
   * `prefers-reduced-motion`.
   */
  highlighted?: boolean;
  /**
   * Ligne d'une Journée qui peut être surlignée (`highlightedStopIds` fourni) : fondu bref du fond et du marqueur.
   * Sans elle, aucune transition (section « Ligne » de /dev/composants, vues en lecture seule).
   */
  fades?: boolean;
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
/** Fondu du surlignage (0018 § 9), retiré sous `prefers-reduced-motion`. */
const FONDU = "transition-colors duration-200 motion-reduce:transition-none";

function StopRow({ stop, href, compact = false, state, highlighted = false, fades = false }: DayLineStopProps) {
  const past = state === "past";
  // Pendant le surlignage, tout le texte reste en `ink` sur `muted` (exception voulue, 0018 § 9).
  const soft = highlighted ? "text-ink" : "text-ink-soft";
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
        <span data-part="faits" className={cn("text-corps-s", soft)}>
          {faits}
        </span>
      )}
      {!compact && stop.locked ? (
        <span data-part="verrou" className={cn("text-legende", soft)}>
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
      data-highlighted={highlighted ? "true" : undefined}
      aria-current={state === "current" ? "step" : undefined}
      className={cn(
        ROW,
        "rounded-control",
        fades ? FONDU : undefined,
        highlighted ? "bg-muted" : "bg-transparent",
      )}
    >
      <Heure className={past ? "text-ink-soft" : undefined}>{stop.start}</Heure>
      <Rail texture="plein" marker={<StopMarker kind="stop" variant="ligne" filled={highlighted} className={fades ? FONDU : undefined} />} />
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

/**
 * Libellé d'un segment : « À pied, 20 min », « Bus, environ 25 min (estimation) » ; sans durée (temps indisponible,
 * prototype seulement, décision 0092 § 4) : « À pied, durée à confirmer » (décision 0095 § 2), jamais une durée
 * inventée ni « environ », même si `estimated` vaut `true`.
 */
export function segmentLabel(segment: Segment): string {
  if (segment.minutes === null) return format(t.segment.libelleSansDuree, { mode: t.segment[segment.mode] });
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

/** Textes de la ligne « Vers {ville} », composés par l'écran (textes de `sejour.json`, spécification M4 § 8). */
export interface DayLineTransferText {
  /** « Vers Florence ». */
  title: string;
  /** « [Train Rome–Florence], 12:00 – 13:40 », « En voiture, départ vers 10:00 (estimation), durée à confirmer ». */
  detail: string;
  /** Nom accessible de la ligne : « Vers Florence, {détail} ». */
  name: string;
  /** Heure de la colonne des heures : le départ d'un billet ou d'un vol saisi ; absente pour un départ estimé. */
  time?: string;
}

export interface DayLineTransferProps {
  text: DayLineTransferText;
}

/**
 * Changement de ville (spécification M4 § 7.6) : gabarit d'une ligne de segment (heure, rail plein, texte), « Vers {ville} »
 * en `corps` gras puis le détail en `legende`. Ni lien, ni focus, ni marqueur : ce n'est pas une étape (ni fiche, ni
 * « Remplacer », « Déplacer » ou « Verrouiller »). Nom accessible de l'élément de liste : « Vers {ville}, {détail} ».
 */
function TransferRow({ text }: DayLineTransferProps) {
  return (
    <li data-type="transfer" aria-label={text.name} className={ROW}>
      <Heure className="pt-2">{text.time}</Heure>
      <Rail texture="plein" />
      <p className="flex min-h-10 flex-col justify-center py-2 break-words">
        <span className="text-corps font-bold text-ink">{text.title}</span>
        <span className="text-legende text-ink-soft tabular-nums">{text.detail}</span>
      </p>
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

/**
 * Lien « Choisir » d'un repas pas encore choisi (F7-PO-8, M5d-3), textes composés par l'écran (`sejour.json`) : la ligne
 * du jour ne connaît ni l'adresse ni la condition (voyage débloqué, M5-PO-1).
 */
export interface DayLineMealLink {
  /** `…/ajouter?de={heure}&repas={lunch|dinner}`. */
  href: string;
  /** Libellé visible : « Choisir ». */
  label: string;
  /** Nom accessible : « Choisir le déjeuner », « Choisir le dîner » (il commence par le libellé visible, WCAG 2.5.3). */
  name: string;
}

export interface DayLineOpenMealProps {
  time: string;
  meal: Meal;
  /** Lien « Choisir » ; sans lui, la ligne n'a ni lien ni focus (vue partagée, écran 15, voyage non débloqué). */
  link?: DayLineMealLink;
}

/**
 * Créneau de repas pas encore choisi (F5-PO-13, décision 0015 § 2 ; provisoire UX/UI) : heure, anneau et
 * rail comme un arrêt, « Déjeuner pas encore choisi » ou « Dîner pas encore choisi » en `arret` `ink-2`.
 * Sans lieu : ni fiche, ni marqueur sur la carte ; signalé par son texte, sans badge. Avec `link` (M5d-3, rendu UX/UI) :
 * « Choisir » à droite, même rendu que « Idées » d'un temps libre (texte `ink` gras souligné, cible de 44 px), aligné
 * sur la ligne de base du texte du repas ; le texte du repas passe à la ligne avant le lien.
 */
function OpenMeal({ time, meal, link }: DayLineOpenMealProps) {
  return (
    <li data-type="openMeal" data-meal={meal} className={ROW}>
      <Heure>{time}</Heure>
      <Rail texture="plein" marker={<StopMarker kind="stop" variant="ligne" />} />
      {link === undefined ? (
        <p className="flex min-h-(--touch-target) items-start pb-4 text-arret font-bold text-ink-2">{t.repasNonChoisi[meal]}</p>
      ) : (
        <div className="flex min-h-(--touch-target) items-baseline justify-between gap-(--ligne-espace-2) pb-4">
          <p className="min-w-0 text-arret font-bold text-ink-2">{t.repasNonChoisi[meal]}</p>
          <Link
            href={link.href}
            aria-label={link.name}
            data-part={`choisir-repas-${meal}`}
            className="inline-flex min-h-(--touch-target) min-w-(--touch-target) shrink-0 justify-center px-2 text-corps-s font-bold text-ink underline underline-offset-2"
          >
            {link.label}
          </Link>
        </div>
      )}
    </li>
  );
}

/**
 * Ligne insérée dans la `DayLine` après l'élément de rang `afterIndex` (F7b : point « Placer ici, vers {heure} » de
 * la feuille « Déplacer », décision 0018 § 11). Colonne d'heure vide, rail du temps libre s'il suit un temps libre,
 * plein sinon ; le contenu (bouton) occupe la colonne de texte.
 */
export interface DayLineInsertion {
  afterIndex: number;
  key: string;
  content: ReactNode;
}

function InsertionRow({ texture, children }: { texture: RailTexture; children: ReactNode }) {
  return (
    <li data-type="insertion" className={ROW}>
      <Heure />
      <Rail texture={texture} />
      <div className="flex min-w-0 flex-col py-1">{children}</div>
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
  /**
   * Lien « Choisir » d'un repas pas encore choisi (F7-PO-8, M5d-3), adresse et textes fournis par l'écran ; sans fonction
   * (ou si elle rend `undefined`), pas de lien.
   */
  getMealLink?: (openMeal: { time: string; meal: Meal }) => DayLineMealLink | undefined;
  /** Écran 15 : une ligne par élément, ni faits ni raison (F10-TL-12). */
  compact?: boolean;
  /** Clé de l'étape en cours (`id`, sinon clé locale) : `aria-current="step"` et étiquette « En cours ». */
  currentKey?: string;
  /** Étape passée : étiquette « Terminée ». Sans effet sur un terminus, un segment, un temps libre ou un repas. */
  isPast?: (stop: S) => boolean;
  /** Identifiants des étapes surlignées après une modification (F7, décision 0016 § 9) ; sans la prop, rien ne change. */
  highlightedStopIds?: readonly string[];
  /** Lignes insérées entre les éléments (points d'insertion de « Déplacer », F7b) ; sans la prop, rien ne change. */
  insertions?: readonly DayLineInsertion[];
  /**
   * Ligne « Vers {ville} » d'un changement de ville (spécification M4 § 7.6, § 8) : l'écran rend `DayLine.Transfer` avec
   * ses textes ; sans la fonction, le changement de ville n'est pas rendu (vue partagée, écran 15 : spécification M4 § 7.8).
   */
  renderTransfer?: (transfer: TransferItem) => ReactNode;
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
  getMealLink,
  compact = false,
  currentKey,
  isPast,
  highlightedStopIds,
  insertions,
  renderTransfer,
  className,
}: DayLineProps<S>) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => [
        row(item, index),
        ...(insertions ?? [])
          .filter((insertion) => insertion.afterIndex === index)
          .map((insertion) => (
            <InsertionRow key={`insertion-${insertion.key}`} texture={item.type === "free" ? "libre" : "plein"}>
              {insertion.content}
            </InsertionRow>
          )),
      ])}
    </ol>
  );

  function row(item: DayLineViewItem<S>, index: number) {
    switch (item.type) {
      case "terminus":
        return <Terminus key={`terminus-${item.role}-${index}`} role={item.role} time={item.time} label={item.label} />;
      case "stop": {
        const key = stopKey(item.stop, index);
        const state: DayLineStopState | undefined =
          currentKey !== undefined && key === currentKey ? "current" : isPast?.(item.stop) ? "past" : undefined;
        return (
          <StopRow
            key={`stop-${key}`}
            stop={item.stop}
            href={getStopHref?.(item.stop)}
            compact={compact}
            state={state}
            highlighted={item.stop.id !== undefined && (highlightedStopIds?.includes(item.stop.id) ?? false)}
            fades={highlightedStopIds !== undefined}
          />
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
        return (
          <OpenMeal
            key={`openMeal-${index}`}
            time={item.time}
            meal={item.meal}
            link={getMealLink?.({ time: item.time, meal: item.meal })}
          />
        );
      case "transfer":
        // Ligne « Vers {ville} » (décision 0148 § 1 point 3) : seulement avec les textes de l'écran.
        return renderTransfer ? <Fragment key={`transfer-${index}`}>{renderTransfer(item)}</Fragment> : null;
    }
  }
}

export const DayLine = Object.assign(DayLineRoot, {
  Insertion: InsertionRow,
  Terminus,
  Stop: StopRow,
  Segment: SegmentRow,
  Transfer: TransferRow,
  FreeTime,
  OpenMeal,
});
