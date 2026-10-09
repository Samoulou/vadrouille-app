"use client";

import {
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type Ref,
} from "react";

import { DETOUR_THRESHOLD_MINUTES, type Exception, type Proposal } from "@/contracts";
import {
  MAX_ROTATION,
  TAP_MAX_DISTANCE,
  releaseVelocity,
  resolveSwipe,
  swipeRotation,
  type Decision,
  type Gesture,
} from "@/features/presentation/deck";
import { format, messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { segmentLabel } from "./DayLine";
import { IconCoeur, IconCroix, IconPhoto } from "./icons";
import { Tag } from "./Tag";

const t = messages.presentation;

/** Au plus un tag, par priorité : « Non confirmé », « À confirmer », « À réserver » (F6-PO-11). */
const TAG_PRIORITY: Exception[] = ["unconfirmed", "toConfirm", "toReserve"];
export function deckCardTag(exceptions: readonly Exception[]): Exception | undefined {
  return TAG_PRIORITY.find((kind) => exceptions.includes(kind));
}

/** Libellés des deux actions : activité, repas, dernière option d'un créneau (F6-PO-7). */
export function deckCardLabels(proposal: Proposal, isLastOption = false): Record<Decision, string> {
  if (proposal.kind === "meal") {
    return { like: t.actions.choose, dislike: isLastOption ? t.actions.dislike : t.actions.next };
  }
  return { like: t.actions.like, dislike: t.actions.dislike };
}

export interface DeckCardProps {
  proposal: Proposal;
  /** Repas : dernière option du créneau (F6-PO-7). */
  isLastOption?: boolean;
  /** « J'aime » ou « Je choisis ». */
  onLike: (gesture: Gesture) => void;
  /** « Pas pour moi » ou « Option suivante ». */
  onDislike: (gesture: Gesture) => void;
  /** Détail de la proposition (F6-PO-12). */
  onOpen: () => void;
  /** Bouton de la carte, pour y placer le focus. */
  cardRef?: Ref<HTMLButtonElement>;
  className?: string;
}

/**
 * Carte de la présentation (design system : components/DeckCard). La carte entière est un bouton qui
 * ouvre le détail ; le glisser horizontal décide, doublé des deux boutons ronds toujours visibles.
 */
export function DeckCard({ proposal, isLastOption = false, onLike, onDislike, onOpen, cardRef, className }: DeckCardProps) {
  const labels = deckCardLabels(proposal, isLastOption);
  return (
    <div data-deck-card="" data-kind={proposal.kind} className={cn("flex min-h-0 flex-col gap-4", className)}>
      <SwipeCard
        key={proposal.id}
        proposal={proposal}
        labels={labels}
        onDecide={(decision) => (decision === "like" ? onLike("swipe") : onDislike("swipe"))}
        onOpen={onOpen}
        cardRef={cardRef}
      />
      <div data-part="actions" className="flex shrink-0 justify-center gap-(--ligne-deck-ecart-boutons)">
        <RoundButton decision="dislike" label={labels.dislike} onClick={() => onDislike("button")} />
        <RoundButton decision="like" label={labels.like} onClick={() => onLike("button")} />
      </div>
    </div>
  );
}

function RoundButton({ decision, label, onClick }: { decision: Decision; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      data-action={decision}
      onClick={onClick}
      className="flex min-w-(--touch-target) cursor-pointer flex-col items-center gap-1 rounded-control text-legende text-ink"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-(--ligne-deck-bouton) items-center justify-center rounded-(--ligne-rayon-rond)",
          decision === "like"
            ? "bg-line text-on-line"
            : "border-(length:--ligne-deck-trait-bouton) border-ink bg-raised text-ink",
        )}
      >
        {decision === "like" ? (
          <IconCoeur className="size-(--ligne-deck-icone)" />
        ) : (
          <IconCroix className="size-(--ligne-deck-icone)" />
        )}
      </span>
      <span>{label}</span>
    </button>
  );
}

interface Drag {
  pointerId: number;
  startX: number;
  width: number;
  reducedMotion: boolean;
  samples: { x: number; t: number }[];
}

const EXIT_MS = 200;
const FADE_MS = 150;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function SwipeCard({
  proposal,
  labels,
  onDecide,
  onOpen,
  cardRef,
}: {
  proposal: Proposal;
  labels: Record<Decision, string>;
  onDecide: (decision: Decision) => void;
  onOpen: () => void;
  cardRef?: Ref<HTMLButtonElement>;
}) {
  const ids = useId();
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [width, setWidth] = useState(0);
  const [exit, setExit] = useState<"slide" | "fade" | null>(null);

  const { stop } = proposal;
  const tag = deckCardTag(stop.exceptions);
  const travel =
    proposal.travelFromPrevious && proposal.travelFromPrevious.minutes > DETOUR_THRESHOLD_MINUTES
      ? proposal.travelFromPrevious
      : undefined;
  const id = (part: string) => `${ids}-${part}`;
  const describedBy = [
    id("moment"),
    proposal.option ? id("option") : null,
    id("meta"),
    id("contexte"),
    travel ? id("trajet") : null,
    travel && proposal.detour ? id("detour") : null,
    stop.reason ? id("raison") : null,
    tag ? id("tag") : null,
  ]
    .filter(Boolean)
    .join(" ");

  /** Sortie du côté choisi (glissement), ou fondu sous mouvement réduit, puis décision. */
  function decide(node: HTMLButtonElement, decision: Decision, current: number, width: number, reducedMotion: boolean) {
    const mode = reducedMotion ? "fade" : "slide";
    setExit(mode);
    if (typeof node.animate !== "function") {
      onDecide(decision);
      return;
    }
    const sign = decision === "like" ? 1 : -1;
    const from = reducedMotion
      ? { transform: `translateX(${current}px)`, opacity: 1 }
      : { transform: `translateX(${current}px) rotate(${swipeRotation(current, width)}deg)`, opacity: 1 };
    const to = reducedMotion
      ? { transform: `translateX(${current}px)`, opacity: 0 }
      : { transform: `translateX(${sign * width * 1.5}px) rotate(${sign * MAX_ROTATION}deg)`, opacity: 1 };
    const animation = node.animate([from, to], {
      duration: reducedMotion ? FADE_MS : EXIT_MS,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
    animation.onfinish = () => {
      // Garde la carte à sa position de sortie jusqu'au rendu de la carte suivante.
      node.style.transform = to.transform;
      node.style.opacity = String(to.opacity);
      onDecide(decision);
    };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    suppressClick.current = false;
    if (exit || (event.pointerType === "mouse" && event.button !== 0)) return;
    const reducedMotion = prefersReducedMotion();
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      width: event.currentTarget.getBoundingClientRect().width,
      reducedMotion,
      samples: [{ x: event.clientX, t: event.timeStamp }],
    };
    setReduced(reducedMotion);
    setWidth(drag.current.width);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const delta = event.clientX - current.startX;
    current.samples = [...current.samples.slice(-15), { x: event.clientX, t: event.timeStamp }];
    if (!dragging && Math.abs(delta) < TAP_MAX_DISTANCE) return;
    setDragging(true);
    setDx(delta);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    const delta = event.clientX - current.startX;
    const velocity = releaseVelocity(current.samples, { x: event.clientX, t: event.timeStamp });
    const outcome = resolveSwipe({ dx: delta, velocity, width: current.width });
    if (outcome === "tap") {
      setDx(0);
      return;
    }
    suppressClick.current = true;
    if (outcome === "return") {
      setDx(0);
      return;
    }
    setDx(delta);
    decide(event.currentTarget, outcome, delta, current.width, current.reducedMotion);
  }

  function handlePointerCancel() {
    drag.current = null;
    setDragging(false);
    setDx(0);
  }

  function handleClick(event: ReactMouseEvent<HTMLButtonElement>) {
    if (suppressClick.current || exit) {
      suppressClick.current = false;
      event.preventDefault();
      return;
    }
    onOpen();
  }

  const rotation = reduced ? 0 : swipeRotation(dx, width);
  const direction: Decision | null = dragging && dx !== 0 ? (dx > 0 ? "like" : "dislike") : null;

  return (
    <button
      ref={cardRef}
      type="button"
      aria-label={format(t.carte.detail, { name: stop.name })}
      aria-describedby={describedBy}
      data-part="carte"
      data-dragging={dragging || undefined}
      data-exit={exit ?? undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      style={dx !== 0 ? { transform: reduced ? `translateX(${dx}px)` : `translateX(${dx}px) rotate(${rotation}deg)` } : undefined}
      className={cn(
        "relative flex min-h-0 shrink cursor-grab touch-pan-y select-none flex-col overflow-hidden rounded-plate border border-outline-strong bg-raised text-left text-ink",
        !dragging && "transition-transform duration-200 ease-out",
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-(--ligne-deck-photo) min-h-(--ligne-deck-photo-min) shrink flex-col items-center justify-center gap-1 self-stretch bg-muted text-legende text-ink-soft"
      >
        <IconPhoto className="size-8" />
        {t.carte.photo}
      </span>
      <span className="flex shrink-0 flex-col gap-1 p-4">
        <span className="flex items-center gap-2 text-corps-s text-ink-soft tabular-nums">
          <span id={id("moment")} className="flex items-center gap-2">
            <span className="inline-flex h-(--ligne-deck-pastille) min-w-(--ligne-deck-pastille-largeur) items-center justify-center rounded-(--ligne-deck-pastille-rayon) bg-line px-1.5 text-etiquette font-extrabold text-on-line">
              {format(messages.ligne.jour.pastille, { day: proposal.day })}
            </span>
            <span>{format(t.carte.vers, { time: proposal.time })}</span>
          </span>
          {proposal.option ? (
            <span id={id("option")} data-part="option" className="ml-auto">
              {format(t.carte.option, { index: proposal.option.index, total: proposal.option.total })}
            </span>
          ) : null}
        </span>
        <span className="text-(length:--ligne-deck-nom) leading-(--ligne-deck-nom-interligne) font-extrabold tracking-[-0.01em]">
          {stop.name}
        </span>
        <span id={id("meta")} className="text-corps-s text-ink-soft">
          {stop.meta}
        </span>
        <span id={id("contexte")} data-part="contexte" className="text-corps-s text-ink-2">
          {proposal.context}
        </span>
        {travel ? (
          <span data-part="trajet" className="flex flex-col text-corps-s text-ink-2">
            <span id={id("trajet")} className="font-semibold tabular-nums">
              {segmentLabel(travel)}
            </span>
            {proposal.detour ? <span id={id("detour")}>{proposal.detour}</span> : null}
          </span>
        ) : null}
        {stop.reason ? (
          <span id={id("raison")} className="text-corps">
            {stop.reason}
          </span>
        ) : null}
        {tag ? (
          <span id={id("tag")} className="pt-1">
            <Tag kind={tag} />
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        data-swipe-label={direction ?? undefined}
        className={cn(
          "absolute top-4 rounded-control border-(length:--ligne-deck-trait-bouton) bg-raised px-3 py-1 text-corps font-extrabold",
          direction === "like" && "left-4 border-line text-line",
          direction === "dislike" && "right-4 border-ink text-ink",
          !direction && "hidden",
        )}
      >
        {direction ? labels[direction] : null}
      </span>
    </button>
  );
}
