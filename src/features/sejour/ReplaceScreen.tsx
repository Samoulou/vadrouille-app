"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import { EVENT_REASON } from "@/analytics/reasons";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { Button } from "@/components/ligne/Button";
import { IconButton } from "@/components/ligne/IconButton";
import { IconCroix } from "@/components/ligne/icons";
import { SegmentedControl } from "@/components/ligne/SegmentedControl";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { ApplyResult, PreferenceReason, RevisionError, RevisionPreview as RevisionPreviewData, Stop } from "@/contracts";
import { PREFERENCE_REASONS, WISH_MAX_LENGTH } from "@/contracts/values";
import { describedBy, EMPTY_LIVE_REGION_CLASS, INPUT_CLASS } from "@/features/creation/fields";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

import { ficheMoment } from "./fiche";
import { SLOW_PREVIEW_MS } from "./revision";
import { ARIA_DISABLED, RevisionPreview, targetDay } from "./RevisionPreview";
import { useTripShell } from "./TripShell";

const t = messages.revision;
const r = t.remplacer;

/** Annoncés poliment seulement à 90 % du maximum et au maximum (décision 0018, « Compteur de caractères »). */
const ANNOUNCED_LENGTHS = new Set([WISH_MAX_LENGTH * 0.9, WISH_MAX_LENGTH]);

const REASON_OPTIONS = PREFERENCE_REASONS.map((value) => ({ value, label: r.raisons[value] }));

/** État de la zone de proposition. */
type Phase =
  | { type: "idle" }
  | { type: "waiting"; slow: boolean }
  | { type: "preview"; preview: RevisionPreviewData; durationMs: number }
  | { type: "banner"; kind: "noOption" | "error" | "conflict" };

/** `costCapReached` et `rateLimited` s'affichent comme une erreur récupérable (F7-PO-14). */
function bannerFor(error: RevisionError | "conflict" | "lockedStop" | "error"): "noOption" | "error" | "conflict" {
  if (error === "noOption" || error === "conflict") return error;
  return "error";
}

export interface ReplaceViewProps {
  /** Étape à remplacer (`Stop.id`), validée par la page : étape `stop` du jour. */
  stopId: Stop["id"];
  /** Enregistreur de la mesure (`console` sur les pages de développement, `none` sinon). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests). */
  recorder?: EventRecorder;
  /** Horloge de la mesure `duration_ms` (tests) ; `performance.now` par défaut (décision 0016 § 10). */
  now?: () => number;
}

/**
 * Écran 14 « Remplacer une étape » (spécification F7, F7-PO-2 à F7-PO-7 ; rendu de la décision 0018 § 5 à § 7),
 * dans le panneau du voyage : raison obligatoire, souhait facultatif, attente avec « Arrêter » après 5 s, proposition
 * et aperçu des effets, puis « Appliquer » ou « Annuler ». Rien n'est appliqué sans aperçu (principe produit 5) ;
 * le souhait n'est ni stocké ni mesuré. La validation de la mesure est chargée au premier événement.
 */
export function ReplaceView({ stopId, recorderKind = "none", recorder, now }: ReplaceViewProps) {
  const shell = useTripShell();
  const { day, routes, revision } = shell;
  const router = useRouter();
  const online = useOnline();
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);
  const clock = useMemo(() => now ?? (() => performance.now()), [now]);

  // Étape lue une fois à l'ouverture : après « Appliquer », elle quitte le programme pendant la navigation.
  const [stop] = useState<Stop | null>(() => {
    for (const item of day?.items ?? []) if (item.type === "stop" && item.stop.id === stopId) return item.stop;
    return null;
  });

  const ids = useId();
  const groupId = `${ids}-raisons`;
  const reasonErrorId = `${ids}-raison-erreur`;
  const wishId = `${ids}-souhait`;
  const wishHelpId = `${ids}-souhait-aide`;
  const counterId = `${ids}-souhait-compteur`;
  const offlineId = `${ids}-hors-ligne`;

  const [reason, setReason] = useState<PreferenceReason | null>(null);
  const [wish, setWish] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [phase, setPhase] = useState<Phase>({ type: "idle" });
  const [status, setStatus] = useState<string | null>(null);

  const titleRef = useRef<HTMLHeadingElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLButtonElement>(null);
  const proposalRef = useRef<HTMLHeadingElement>(null);
  const noOptionRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const applying = useRef(false);
  const token = useRef(0);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ target: "proposal" | "noOption" | "ask"; serial: number } | null>(null);

  // Ouverture : focus sur le titre (handover § 7) ; la fiche fermée pour venir ici ne reprend pas le focus.
  const { consumeClosedFiche } = shell;
  useEffect(() => {
    titleRef.current?.focus();
    consumeClosedFiche();
  }, [consumeClosedFiche]);

  // Focus après un changement d'état : posé une fois l'élément rendu.
  useEffect(() => {
    if (!focusTarget) return;
    const element =
      focusTarget.target === "proposal" ? proposalRef.current : focusTarget.target === "noOption" ? noOptionRef.current : askRef.current;
    element?.focus();
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

  // Démontage : demande et minuteur abandonnés (décision 0016 § 10).
  useEffect(
    () => () => {
      token.current += 1;
      controller.current?.abort();
      if (slowTimer.current !== null) clearTimeout(slowTimer.current);
    },
    [],
  );

  const focus = (target: "proposal" | "noOption" | "ask") => setFocusTarget((previous) => ({ target, serial: (previous?.serial ?? 0) + 1 }));

  /** Un aperçu correspond toujours à la raison et au souhait visibles (F7-PO-3). */
  const invalidate = () => {
    if (phase.type === "idle") return;
    abort();
    setPhase({ type: "idle" });
    setStatus(null);
  };

  if (!day || !stop) {
    return (
      <div data-part="remplacer" className="flex flex-col gap-4 px-5 pt-2 pb-8">
        <p className="text-corps text-ink-2">{r.absente}</p>
        {day ? (
          <Button asChild variant="secondary" className="w-full">
            <Link href={routes.jour(day.index)}>{r.retourJournee}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  const dayIndex = day.index;
  const replaceHref = routes.remplacer(dayIndex, stop.id);

  /** « Retour à la fiche » et « Annuler » : fiche de l'étape, programme inchangé (F7-PO-2, décision 0018 § 5). */
  const backToFiche = () => {
    abort();
    if (shell.replaceOrigin === replaceHref) {
      shell.markReplaceOrigin(null);
      router.back();
    } else {
      router.replace(routes.etape(dayIndex, stop.id), { scroll: false });
    }
  };

  const ask = async () => {
    if (!online) return;
    if (reason === null) {
      setReasonError(true);
      groupRef.current?.focus();
      return;
    }
    abort();
    const current = token.current;
    const signal = new AbortController();
    controller.current = signal;
    const startedAt = clock();
    setPhase({ type: "waiting", slow: false });
    setStatus(t.recherche);
    slowTimer.current = setTimeout(() => {
      slowTimer.current = null;
      if (token.current !== current) return;
      setPhase({ type: "waiting", slow: true });
      setStatus(format(r.lent, { name: stop.name }));
    }, SLOW_PREVIEW_MS);
    const trimmed = wish.trim();
    let result;
    try {
      result = await revision.previewReplacement(
        { stopId: stop.id, reason, ...(trimmed ? { wish: trimmed } : {}), baseVersion: revision.version() },
        { signal: signal.signal },
      );
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
    if (result.ok) {
      setPhase({ type: "preview", preview: result.preview, durationMs: Math.max(0, Math.round(clock() - startedAt)) });
      setStatus(t.prete);
      focus("proposal");
      return;
    }
    const kind = bannerFor(result.error);
    setPhase({ type: "banner", kind });
    setStatus(null);
    if (kind === "noOption") focus("noOption");
  };

  const stopAsking = () => {
    abort();
    setPhase({ type: "idle" });
    setStatus(null);
    focus("ask");
  };

  const apply = async () => {
    // Un seul « Appliquer » à la fois : un second clic pendant l'application ne fait rien (l'aperçu est consommé).
    if (!online || phase.type !== "preview" || reason === null || applying.current) return;
    const { preview, durationMs } = phase;
    applying.current = true;
    let result: ApplyResult;
    try {
      result = await revision.apply(preview.id);
    } catch {
      // Échec du fournisseur ou du réseau : erreur récupérable, programme inchangé (F7-PO-1).
      result = { ok: false, error: "error" };
    }
    if (!result.ok) {
      // Après un échec, la garde est levée ; après un succès, l'écran est quitté et l'aperçu ne s'applique plus.
      applying.current = false;
      setPhase({ type: "banner", kind: bannerFor(result.error) });
      setStatus(null);
      return;
    }
    const properties = { reason: EVENT_REASON[reason], from_reserve: preview.kind === "replace" && preview.fromReserve, duration_ms: durationMs };
    // Une mesure perdue (chargement impossible) n'interrompt rien.
    track({ name: "replace_applied", properties }).catch(() => {});
    const arrival = targetDay(preview)?.index ?? dayIndex;
    shell.notifyApplied({
      message: r.modifie,
      dayIndex: arrival,
      highlighted: preview.changedStopIds,
      targetStopId: preview.targetStopId,
      originStopId: stop.id,
      onUndone: () => {
        track({ name: "replace_undone", properties }).catch(() => {});
      },
    });
    shell.markReplaceOrigin(null);
    router.push(routes.jour(arrival), { scroll: false });
  };

  const header = (
    <header className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <h1
          ref={titleRef}
          tabIndex={-1}
          className="min-w-0 text-titre-fiche font-extrabold tracking-(--ligne-titre-jour-approche) text-ink"
        >
          {format(r.titre, { name: stop.name })}
        </h1>
        <IconButton icon={<IconCroix />} label={t.retourFiche} onClick={backToFiche} data-part="retour-fiche" />
      </div>
      <p data-part="moment" className="text-corps-s text-ink-soft tabular-nums">
        {ficheMoment(day, stop)}
      </p>
    </header>
  );

  // Étape verrouillée : titre, explication et « Retour à la fiche », sans raison ni action (F7-PO-2, 0018 § 5).
  if (stop.locked) {
    return (
      <div data-part="remplacer" data-stop-id={stop.id} className="flex flex-col gap-6 px-5 pt-2 pb-8">
        {header}
        <p data-part="verrouillee" className="text-corps text-ink-2">
          {r.verrouillee}
        </p>
        <Button variant="secondary" className="w-full" onClick={backToFiche}>
          {t.retourFiche}
        </Button>
      </div>
    );
  }

  const waiting = phase.type === "waiting";
  const length = wish.length;
  const counter = format(t.compteur, { n: length, max: WISH_MAX_LENGTH });

  return (
    <div data-part="remplacer" data-stop-id={stop.id} className="flex flex-col gap-6 px-5 pt-2 pb-8">
      {header}

      {online ? null : (
        <div id={offlineId}>
          <StatusBanner kind="offline" message={t.horsLigne} />
        </div>
      )}

      <section aria-labelledby={`${groupId}-titre`} className="flex flex-col gap-3">
        <h2 id={`${groupId}-titre`} className="text-section font-extrabold text-ink">
          {r.pourquoi}
        </h2>
        <SegmentedControl
          id={groupId}
          groupRef={groupRef}
          options={REASON_OPTIONS}
          value={reason}
          onChange={(value) => {
            setReason(value);
            setReasonError(false);
            invalidate();
          }}
          label={r.pourquoi}
          labelledBy={`${groupId}-titre`}
          orientation="vertical"
          invalid={reasonError}
          describedBy={reasonErrorId}
        />
        {/* Région présente dès le chargement (0018, « Message d'erreur et annonces ») ; liée au groupe. */}
        <p id={reasonErrorId} role="alert" className={cn("text-corps-s font-semibold text-ink", reasonError ? undefined : EMPTY_LIVE_REGION_CLASS)}>
          {reasonError ? r.choisisRaison : null}
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <label htmlFor={wishId} className="text-corps font-bold text-ink">
          {r.souhait}
        </label>
        <p id={wishHelpId} className="text-corps-s text-ink-soft">
          {r.souhaitAide}
        </p>
        <textarea
          id={wishId}
          value={wish}
          maxLength={WISH_MAX_LENGTH}
          rows={6}
          aria-describedby={describedBy(wishHelpId, counterId)}
          onChange={(event) => {
            setWish(event.target.value);
            invalidate();
          }}
          className={cn(INPUT_CLASS, "h-auto min-h-40 resize-none py-3")}
        />
        <p id={counterId} className="self-end text-legende text-ink-soft tabular-nums">
          {counter}
        </p>
        {/* Le compteur visible n'est pas une région live : seuls 180 et 200 caractères sont annoncés. */}
        <p aria-live="polite" className="sr-only">
          {ANNOUNCED_LENGTHS.has(length) ? counter : null}
        </p>
      </div>

      {phase.type === "preview" ? null : (
        <Button
          ref={askRef}
          variant="primary"
          className={cn("w-full", ARIA_DISABLED)}
          aria-disabled={online ? undefined : true}
          aria-describedby={online ? undefined : offlineId}
          data-part="voir-proposition"
          onClick={ask}
        >
          {r.voirProposition}
        </Button>
      )}

      <div data-part="zone-proposition" aria-busy={waiting} className="flex flex-col gap-4">
        {/* Attente, puis « Proposition prête. » : région présente dès le chargement, texte visible (0018, « Attente »). */}
        <p role="status" data-part="annonce-proposition" className={cn("text-corps-s text-ink-soft", status ? undefined : EMPTY_LIVE_REGION_CLASS)}>
          {status}
        </p>
        {waiting ? (
          <>
            <div aria-hidden="true" data-part="squelette" className="flex flex-col gap-3">
              <span className="h-6 w-3/4 rounded-block bg-muted" />
              <span className="h-4 w-1/2 rounded-block bg-muted" />
              <span className="h-4 w-full rounded-block bg-muted" />
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
            proposalTitleRef={proposalRef}
            onApply={apply}
            onCancel={backToFiche}
            disabledBy={online ? undefined : offlineId}
          />
        ) : null}
        {phase.type === "banner" && phase.kind === "noOption" ? (
          <div ref={noOptionRef} tabIndex={-1} data-part="bandeau-aucune-option" className="rounded-block">
            <StatusBanner kind="noOption" message={t.aucuneOption} />
          </div>
        ) : null}
        <div role="alert" className={phase.type === "banner" && phase.kind !== "noOption" ? undefined : EMPTY_LIVE_REGION_CLASS}>
          {phase.type === "banner" && phase.kind === "error" ? (
            <StatusBanner
              kind="error"
              announce={false}
              message={t.erreur}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className={ARIA_DISABLED}
                  aria-disabled={online ? undefined : true}
                  aria-describedby={online ? undefined : offlineId}
                  onClick={ask}
                >
                  {t.reessayer}
                </Button>
              }
            />
          ) : null}
          {phase.type === "banner" && phase.kind === "conflict" ? (
            <StatusBanner
              kind="conflict"
              announce={false}
              message={t.conflit}
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  className={ARIA_DISABLED}
                  aria-disabled={online ? undefined : true}
                  aria-describedby={online ? undefined : offlineId}
                  onClick={ask}
                >
                  {t.revoirProposition}
                </Button>
              }
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
