"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from "react";

import { messages } from "@/i18n";
import { releaseVelocity, type PointerSample } from "@/lib/pointer";
import { cn } from "@/lib/utils";

import {
  DEFAULT_SNAP,
  SHEET_TAP_MAX_DISTANCE,
  SNAP_POINTS,
  handleReduces,
  handleTarget,
  nextSnapDown,
  nextSnapUp,
  snapAfterRelease,
  type SnapPoint,
} from "./sheet-model";

const t = messages.ligne.panneau;

export interface SheetProps {
  /** Hauteurs en part de la hauteur disponible, [0.25, 0.55, 0.92] par défaut (handover § 5). */
  snapPoints?: readonly SnapPoint[];
  /** Hauteur initiale sans contrôle externe, 0.55 par défaut. */
  defaultSnap?: SnapPoint;
  /** Hauteur contrôlée par l'écran (lien d'évitement, marqueur, fiche). */
  snap?: SnapPoint;
  onSnapChange?: (snap: SnapPoint) => void;
  /** Nom de la région (« Programme », « Fiche étape »), depuis fr.json. */
  label: string;
  /** En-tête fixe sous la poignée (par exemple `DayTabs`) : il ne défile pas avec le contenu. */
  header?: ReactNode;
  /** Zone qui défile à l'intérieur du panneau. */
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
  className?: string;
}

interface DragState {
  pointerId: number;
  startY: number;
  /** Hauteur du panneau au début du geste (px). */
  startHeight: number;
  /** Hauteur disponible : celle du conteneur (px). */
  available: number;
  samples: PointerSample[];
  moved: boolean;
}

/** Part en pourcentage, arrondie au dixième (0.55 → « 55% »). */
const percent = (part: number) => `${Math.round(part * 1000) / 10}%`;

/**
 * Panneau coulissant à points d'arrêt, non modal (spécification F5, F5-PO-2 ; décision 0015 § 5).
 *
 * Posé en bas de son conteneur (la fenêtre entière dans l'écran du voyage) ; ses hauteurs sont des
 * parts de la hauteur de ce conteneur, réévaluées par le navigateur au redimensionnement. La poignée est
 * un bouton (« Agrandir le panneau » / « Réduire le panneau », flèches haut et bas) : toutes les hauteurs
 * sont atteignables sans glisser (WCAG 2.5.7). Le glisser, en Pointer Events natifs, ne part que de la
 * zone de la poignée ; le contenu défile dans le panneau et ne le déplace jamais. Pendant le glisser, le
 * panneau se déplace par `transform` ; au repos, sa hauteur est celle du point d'arrêt.
 */
export function Sheet({
  snapPoints = SNAP_POINTS,
  defaultSnap = DEFAULT_SNAP,
  snap: controlled,
  onSnapChange,
  label,
  header,
  bodyRef,
  children,
  className,
}: SheetProps) {
  const [internal, setInternal] = useState<SnapPoint>(defaultSnap);
  const snap = controlled ?? internal;
  const sheetRef = useRef<HTMLElement>(null);
  const drag = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  /** Pendant le glisser : hauteur courante et hauteur maximale (px). */
  const [dragging, setDragging] = useState<{ height: number; max: number } | null>(null);

  const maxSnap = Math.max(...snapPoints);

  const change = (next: SnapPoint) => {
    if (controlled === undefined) setInternal(next);
    if (next !== snap) onSnapChange?.(next);
  };

  // Le geste est suivi sur la fenêtre, de l'appui au relâchement : le pointeur peut quitter la poignée.
  const stopTracking = useRef<(() => void) | null>(null);
  useEffect(() => () => stopTracking.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const sheet = sheetRef.current;
    const available = sheet?.parentElement?.clientHeight ?? 0;
    if (!sheet || available <= 0 || drag.current || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const state: DragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: sheet.getBoundingClientRect().height,
      available,
      samples: [{ pos: event.clientY, t: event.timeStamp }],
      moved: false,
    };
    drag.current = state;
    const max = maxSnap * available;
    const min = Math.min(...snapPoints) * available;

    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== state.pointerId) return;
      const dy = move.clientY - state.startY;
      state.samples = [...state.samples.slice(-15), { pos: move.clientY, t: move.timeStamp }];
      if (!state.moved && Math.abs(dy) < SHEET_TAP_MAX_DISTANCE) return;
      state.moved = true;
      setDragging({ height: Math.min(max, Math.max(min, state.startHeight - dy)), max });
    };
    const onEnd = (end: PointerEvent) => {
      if (end.pointerId !== state.pointerId) return;
      stop();
      if (!state.moved) return;
      // Le clic qui suit un glisser (même tâche) ne vaut pas un appui sur la poignée.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      setDragging(null);
      if (end.type === "pointercancel") return;
      const height = Math.min(max, Math.max(0, state.startHeight - (end.clientY - state.startY))) / available;
      // La position du pointeur descend quand le panneau monte : la vitesse du panneau est l'opposée.
      const velocity = -releaseVelocity(state.samples, { pos: end.clientY, t: end.timeStamp });
      change(snapAfterRelease({ height, velocity, snaps: snapPoints }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      drag.current = null;
      stopTracking.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    stopTracking.current = stop;
  };

  const onHandleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    change(handleTarget(snap, snapPoints));
  };

  const onHandleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      change(nextSnapUp(snap, snapPoints));
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      change(nextSnapDown(snap, snapPoints));
    }
  };

  const reduces = handleReduces(snap, snapPoints);
  const style = dragging
    ? { height: percent(maxSnap), transform: `translateY(${dragging.max - dragging.height}px)` }
    : { height: percent(snap) };

  return (
    <section
      ref={sheetRef}
      aria-label={label}
      data-sheet=""
      data-snap={snap}
      data-dragging={dragging ? "true" : undefined}
      style={style}
      className={cn(
        "absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-sheet border border-b-0 border-outline bg-page",
        dragging ? "transition-none" : "transition-[height,transform] duration-200 ease-in-out motion-reduce:transition-none",
        className,
      )}
    >
      <div
        data-part="poignee-zone"
        className="flex shrink-0 touch-none justify-center select-none"
        onPointerDown={onPointerDown}
      >
        <button
          type="button"
          data-part="poignee"
          aria-label={reduces ? t.reduire : t.agrandir}
          onClick={onHandleClick}
          onKeyDown={onHandleKeyDown}
          className="flex min-h-(--touch-target) min-w-(--ligne-poignee-zone) cursor-grab items-center justify-center rounded-control"
        >
          <span
            aria-hidden="true"
            className="h-(--ligne-poignee-epaisseur) w-(--ligne-poignee-largeur) rounded-(--ligne-rayon-rond) bg-border-control"
          />
        </button>
      </div>
      {header ? <div className="shrink-0">{header}</div> : null}
      <div ref={bodyRef} data-part="contenu" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
      </div>
    </section>
  );
}
