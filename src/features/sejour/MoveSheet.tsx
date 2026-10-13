"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { Button } from "@/components/ligne/Button";
import { DayBadgeGroup } from "@/components/ligne/DayBadgeGroup";
import { DayLine, type DayLineInsertion } from "@/components/ligne/DayLine";
import { IconButton } from "@/components/ligne/IconButton";
import { IconCoche, IconCroix, IconPlus } from "@/components/ligne/icons";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import type { ApplyResult, Day, MoveOptions, RevisionError, RevisionPreview as RevisionPreviewData, Stop } from "@/contracts";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import { format, messages } from "@/i18n";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

import { SLOW_PREVIEW_MS } from "./revision";
import { ARIA_DISABLED, RevisionPreview, targetDay } from "./RevisionPreview";
import { useTripShell } from "./TripShell";

const t = messages.revision;
const d = t.deplacer;

/** Titres de niveau 3 en style `bloc` (décision 0018 § 10). */
const BLOC = "text-(length:--ligne-texte-bloc) leading-(--ligne-texte-bloc-interligne) font-extrabold text-ink";

/** État de la zone sous la `DayLine` compacte. */
type Phase =
  | { type: "idle" }
  | { type: "waiting"; slow: boolean }
  | { type: "preview"; preview: RevisionPreviewData }
  | { type: "banner"; kind: "noOption" | "error" | "conflict" };

/** `costCapReached`, `rateLimited` et `lockedStop` s'affichent comme une erreur récupérable (F7-PO-12, F7-PO-14). */
function bannerFor(error: RevisionError): "noOption" | "error" | "conflict" {
  if (error === "noOption" || error === "conflict") return error;
  return "error";
}

/**
 * Rang de l'élément après lequel placer un point d'insertion : le dernier élément daté (terminus, étape, temps libre,
 * repas pas encore choisi) dont l'heure est au plus celle du point ; ainsi « vers 15:45 » se place après le temps
 * libre de 15:30 et avant le trajet qui le suit. Exporté pour les tests.
 */
export function insertionIndex(day: Day, time: string): number {
  let found = 0;
  day.items.forEach((item, index) => {
    const at = item.type === "stop" ? item.stop.start : item.type === "free" ? item.from : item.type === "segment" ? null : item.time;
    if (at !== null && at <= time && !(item.type === "terminus" && item.role === "end")) found = index;
  });
  return found;
}

export interface MoveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Étape à déplacer (étape `stop` non verrouillée du jour, F7-PO-15). */
  stop: Stop;
  /** Jour d'origine de l'étape. */
  dayIndex: number;
  /** Rend le focus à « Déplacer » quand la feuille se ferme sans rien appliquer. */
  onReturnFocus: () => void;
  /** Enregistreur de la mesure `stop_moved` (`console` sur les pages de développement, `none` sinon). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests). */
  recorder?: EventRecorder;
}

/**
 * Feuille modale « Déplacer une étape » (spécification F7, F7-PO-15 ; rendu de la décision 0018 § 11 ; groupe radio
 * de la décision 0019 § 1), ouverte depuis la Fiche sans changer d'adresse. Choix du jour par `DayBadgeGroup` (jours
 * sans point d'insertion « complets ») ; la `DayLine` compacte du jour choisi porte un bouton « Placer ici, vers
 * {heure} » par point ; un point demande l'aperçu, affiché sous la ligne. Rien n'est appliqué sans aperçu ; Échap,
 * « Fermer » ou « Annuler » ferment la feuille sans rien changer. Chargée à la demande (hors du JavaScript initial de
 * la Journée, comme la feuille « Partager », décision 0039).
 */
export function MoveSheet({ open, onOpenChange, ...props }: MoveSheetProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <MoveContent {...props} close={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function MoveContent({
  stop,
  dayIndex,
  onReturnFocus,
  recorderKind = "none",
  recorder,
  close,
}: Omit<MoveSheetProps, "open" | "onOpenChange"> & { close: () => void }) {
  const shell = useTripShell();
  const { trip, routes, revision } = shell;
  const router = useRouter();
  const online = useOnline();
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);

  const ids = useId();
  const titleId = `${ids}-jour-titre`;
  const offlineId = `${ids}-hors-ligne`;

  const titleRef = useRef<HTMLHeadingElement>(null);
  const changesRef = useRef<HTMLHeadingElement>(null);
  const noOptionRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const token = useRef(0);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applying = useRef(false);
  // Fermeture après « Appliquer » : le focus va à l'étape déplacée (Journée), pas à « Déplacer ».
  const applied = useRef(false);

  const [options, setOptions] = useState<MoveOptions | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [point, setPoint] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [status, setStatus] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ target: "changes" | "noOption"; serial: number } | null>(null);

  // Options lues une fois à l'ouverture (décision 0019 § 1.2) ; présélection du jour d'origine s'il a un point.
  useEffect(() => {
    let current = true;
    revision.getMoveOptions(stop.id).then(
      (loaded) => {
        if (!current) return;
        setOptions(loaded);
        if ((loaded.days.find((day) => day.index === dayIndex)?.points.length ?? 0) > 0) setSelectedDay(dayIndex);
      },
      () => {
        if (current) setOptions({ stopId: stop.id, days: [] });
      },
    );
    return () => {
      current = false;
    };
  }, [revision, stop.id, dayIndex]);

  useEffect(() => {
    if (!focusTarget) return;
    (focusTarget.target === "changes" ? changesRef.current : noOptionRef.current)?.focus();
  }, [focusTarget]);

  const stopWaiting = () => {
    if (slowTimer.current !== null) clearTimeout(slowTimer.current);
    slowTimer.current = null;
  };

  /** Abandonne la demande en cours : aucune réponse arrivée ensuite n'est affichée (jeton). */
  const abort = () => {
    token.current += 1;
    controller.current?.abort();
    controller.current = null;
    stopWaiting();
  };

  // Fermeture de la feuille : demande et minuteur abandonnés (décision 0016 § 10).
  useEffect(
    () => () => {
      token.current += 1;
      controller.current?.abort();
      if (slowTimer.current !== null) clearTimeout(slowTimer.current);
    },
    [],
  );

  const focus = (target: "changes" | "noOption") => setFocusTarget((previous) => ({ target, serial: (previous?.serial ?? 0) + 1 }));

  // Noms « Jour 4 », « Jour 3, complet » (critère C20, décision 0019 § 1.2) : sans jour de la semaine.
  const days = trip.days.map((day) => ({
    day: day.index,
    disabled: (options?.days.find((candidate) => candidate.index === day.index)?.points.length ?? 0) === 0,
  }));
  const allFull = options !== null && days.every((day) => day.disabled);
  const shownDay = selectedDay === null ? undefined : trip.days.find((day) => day.index === selectedDay);
  const points = options?.days.find((day) => day.index === selectedDay)?.points ?? [];

  const chooseDay = (day: number) => {
    abort();
    setSelectedDay(day);
    setPoint(null);
    setPhase({ type: "idle" });
    setStatus(null);
  };

  const ask = async (pointId: string) => {
    if (!online) return;
    abort();
    const current = token.current;
    const signal = new AbortController();
    controller.current = signal;
    setPoint(pointId);
    setPhase({ type: "waiting", slow: false });
    setStatus(t.recherche);
    // Règles d'attente de l'écran 14, sans « On cherche autour de … » : « Arrêter » après 5 s.
    slowTimer.current = setTimeout(() => {
      slowTimer.current = null;
      if (token.current === current) setPhase({ type: "waiting", slow: true });
    }, SLOW_PREVIEW_MS);
    let result;
    try {
      result = await revision.previewMove({ stopId: stop.id, pointId, baseVersion: revision.version() }, { signal: signal.signal });
    } catch {
      if (token.current !== current) return;
      stopWaiting();
      setPhase({ type: "banner", kind: "error" });
      setStatus(null);
      return;
    }
    if (token.current !== current || signal.signal.aborted) return;
    stopWaiting();
    controller.current = null;
    setStatus(null);
    if (result.ok) {
      setPhase({ type: "preview", preview: result.preview });
      focus("changes");
      return;
    }
    const kind = bannerFor(result.error);
    setPhase({ type: "banner", kind });
    if (kind === "noOption") focus("noOption");
  };

  const stopAsking = () => {
    abort();
    setPhase({ type: "idle" });
    setStatus(null);
    setPoint(null);
  };

  const apply = async () => {
    if (!online || phase.type !== "preview" || applying.current) return;
    const { preview } = phase;
    applying.current = true;
    let result: ApplyResult;
    try {
      result = await revision.apply(preview.id);
    } catch {
      result = { ok: false, error: "error" };
    }
    if (!result.ok) {
      applying.current = false;
      setPhase({ type: "banner", kind: bannerFor(result.error) });
      return;
    }
    // Une mesure perdue (chargement impossible) n'interrompt rien.
    track({ name: "stop_moved", properties: { method: "button" } }).catch(() => {});
    const arrival = targetDay(preview)?.index ?? dayIndex;
    applied.current = true;
    close();
    shell.notifyApplied({
      message: d.deplacee,
      dayIndex: arrival,
      highlighted: preview.changedStopIds,
      targetStopId: preview.targetStopId,
      originStopId: stop.id,
    });
    router.push(routes.jour(arrival), { scroll: false });
  };

  const insertions: DayLineInsertion[] = shownDay
    ? points.map((candidate) => {
        const chosen = candidate.id === point;
        return {
          afterIndex: insertionIndex(shownDay, candidate.time),
          key: candidate.id,
          content: (
            <Button
              variant="secondary"
              size="sm"
              aria-current={chosen ? "true" : undefined}
              aria-disabled={online ? undefined : true}
              aria-describedby={online ? undefined : offlineId}
              data-part="placer-ici"
              onClick={() => {
                if (online) void ask(candidate.id);
              }}
              className={cn("w-full justify-start", ARIA_DISABLED, chosen ? "border-line bg-line text-on-line" : undefined)}
            >
              {chosen ? (
                <IconCoche className="size-(--ligne-icone-petite) shrink-0" />
              ) : (
                <IconPlus className="size-(--ligne-icone-petite) shrink-0" />
              )}
              {format(d.placerIci, { time: candidate.time })}
            </Button>
          ),
        };
      })
    : [];

  return (
    <DialogSheet
      data-sheet="deplacer"
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        titleRef.current?.focus();
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (!applied.current) onReturnFocus();
      }}
    >
      <div className="flex flex-col gap-6">
        <header className="flex items-start justify-between gap-3">
          <DialogTitle ref={titleRef} tabIndex={-1} className="min-w-0 text-section font-extrabold text-ink">
            {format(d.titre, { name: stop.name })}
          </DialogTitle>
          <DialogClose asChild>
            <IconButton icon={<IconCroix />} label={messages.sejour.fiche.fermer} data-part="fermer" />
          </DialogClose>
        </header>

        {online ? null : (
          <div id={offlineId}>
            <StatusBanner kind="offline" message={t.horsLigne} />
          </div>
        )}

        <section aria-labelledby={titleId} className="flex flex-col gap-3">
          <h3 id={titleId} className={BLOC}>
            {d.versQuelJour}
          </h3>
          <DayBadgeGroup days={days} value={selectedDay} onChange={chooseDay} labelledBy={titleId} />
          {allFull ? (
            <p data-part="aucun-jour" className="text-corps text-ink-2">
              {d.aucunJour}
            </p>
          ) : null}
        </section>

        {shownDay ? (
          <section aria-label={format(messages.sejour.journee.etapes, { n: shownDay.index })} data-part="ligne-compacte">
            <DayLine items={shownDay.items} compact insertions={insertions} />
          </section>
        ) : null}

        <div data-part="zone-apercu" aria-busy={phase.type === "waiting"} className="flex flex-col gap-4">
          <p role="status" data-part="annonce-apercu" className={cn("text-corps-s text-ink-soft", status ? undefined : EMPTY_LIVE_REGION_CLASS)}>
            {status}
          </p>
          {phase.type === "waiting" ? (
            <>
              <div aria-hidden="true" data-part="squelette" className="flex flex-col gap-3">
                <span className="h-6 w-3/4 rounded-block bg-muted" />
                <span className="h-4 w-full rounded-block bg-muted" />
                <span className="h-4 w-5/6 rounded-block bg-muted" />
              </div>
              {phase.slow ? (
                <Button variant="secondary" size="sm" className="self-start" data-part="arreter" onClick={stopAsking}>
                  {t.arreter}
                </Button>
              ) : null}
            </>
          ) : null}
          {phase.type === "preview" ? (
            <RevisionPreview
              preview={phase.preview}
              changesTitleRef={changesRef}
              onApply={apply}
              onCancel={close}
              disabledBy={online ? undefined : offlineId}
            />
          ) : null}
          {phase.type === "banner" && phase.kind === "noOption" ? (
            <div ref={noOptionRef} tabIndex={-1} data-part="bandeau-aucune-option" className="rounded-block">
              <StatusBanner kind="noOption" message={t.aucuneOption} />
            </div>
          ) : null}
          <div role="alert" className={phase.type === "banner" && phase.kind !== "noOption" ? undefined : EMPTY_LIVE_REGION_CLASS}>
            {phase.type === "banner" && phase.kind !== "noOption" ? (
              <StatusBanner
                kind={phase.kind}
                announce={false}
                message={phase.kind === "error" ? t.erreur : t.conflit}
                action={
                  point === null ? undefined : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className={ARIA_DISABLED}
                      aria-disabled={online ? undefined : true}
                      aria-describedby={online ? undefined : offlineId}
                      onClick={() => {
                        if (online) void ask(point);
                      }}
                    >
                      {phase.kind === "error" ? t.reessayer : t.revoirProposition}
                    </Button>
                  )
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </DialogSheet>
  );
}
