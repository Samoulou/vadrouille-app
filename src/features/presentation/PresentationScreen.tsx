"use client";

import Link from "next/link";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import type { AnalyticsEvent } from "@/analytics/events";
import { createLazyTrack, type LazyTrack } from "@/analytics/lazy";
import { EVENT_REASON } from "@/analytics/reasons";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { Button } from "@/components/ligne/Button";
import { DeckCard } from "@/components/ligne/DeckCard";
import { DeckProgress } from "@/components/ligne/DeckProgress";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { UndoToast, UndoToastRegion } from "@/components/ligne/UndoToast";
import type { PreferenceAnswer, PreferencePrompt, Proposal } from "@/contracts";
import { format, messages } from "@/i18n";
import { jourAbrege } from "@/lib/dates";

import { createLocalDeckActions, type DeckActions } from "./actions";
import { formatContexte, noOptionMessage } from "./contexte";
import {
  currentCard,
  deckReducer,
  initDeck,
  isLastOption,
  type Decision,
  type Gesture,
  type UndoToastInfo,
} from "./deck";
import { DeckEnd, type DeckEndVariant } from "./DeckEnd";
import type { NoOptionSlot, PresentationDay } from "./load";

/**
 * Chargement différé (décision 0024 § 1, T14) de ce que le premier rendu n'affiche pas : les deux feuilles, avec
 * leur dialogue (`@radix-ui/react-dialog`), et la validation de la mesure (`zod/mini`, via `createLazyTrack`).
 * Le chargement commence au premier geste dans l'écran (`preloadDeferred`), avant qu'une feuille ou un
 * événement ne soit demandé ; `import()` ne charge chaque module qu'une fois.
 */
const loadPreferenceSheet = () => import("./PreferenceSheet");
const loadProposalDetailSheet = () => import("./ProposalDetailSheet");
const PreferenceSheet = lazy(() => loadPreferenceSheet().then((m) => ({ default: m.PreferenceSheet })));
const ProposalDetailSheet = lazy(() => loadProposalDetailSheet().then((m) => ({ default: m.ProposalDetailSheet })));

function preloadDeferred() {
  // Un échec du préchargement (réseau coupé) est ignoré ici : la feuille ou l'événement refait la demande.
  void loadPreferenceSheet().catch(() => {});
  void loadProposalDetailSheet().catch(() => {});
  void import("@/analytics/track").catch(() => {});
}

const t = messages.presentation;

export interface PresentationScreenProps {
  tripId: string;
  /** Écran 6 (faux) ou 6b « Suite du tri » (vrai). */
  unlocked: boolean;
  /** Jours encore en préparation (`Day.generating`), pour le `StatusBanner` (F6-PO-13). */
  generatingDays: number[];
  proposals: Proposal[];
  /** Jours du voyage (date, noms des étapes), pour composer jour de la semaine et contexte (B2-PO-14). */
  days: PresentationDay[];
  /** Créneaux de l'aperçu sans proposition (B2-PO-9) : un bandeau `noOption` les nomme ; ce ne sont pas des cartes. */
  noOptionSlots?: NoOptionSlot[];
  /**
   * Lien « Débloquer » de la fin de l'aperçu (F9-PO-19) : la page passe `paymentAvailable()`, pour qu'aucun
   * lien ne mène à une page 404 quand le paiement simulé n'est pas disponible.
   */
  canUnlock?: boolean;
  /** Mention « Données de lieux : Google » (adaptateur `prototype`, spécification P0) ; absente par défaut. */
  placesFromGoogle?: boolean;
  /** Enregistreur des mesures choisi par la page (aucun envoi réseau, décision 0013 § 3.3). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests) ; prime sur `recorderKind`. */
  recorder?: EventRecorder;
  /**
   * Actions de décision (décision 0013, § 3.2). Implémentation locale en mémoire par défaut : une
   * fonction ne traverse pas la frontière serveur/client ; en B10, la page passera des Server Actions.
   */
  actions?: DeckActions;
}

/**
 * Écrans 6 et 6b : présentation « J'aime / Pas pour moi ». État en mémoire seulement (F6-PO-15).
 * La validation de la mesure (`zod/mini`) est chargée au premier événement (`createLazyTrack`), hors du
 * JavaScript initial de la présentation (décision 0024 § 1, T14) ; les événements gardent leur ordre.
 */
export function PresentationScreen({ recorderKind = "none", recorder, ...props }: PresentationScreenProps) {
  const track = useMemo(() => sendWith(createLazyTrack(recorderKind, recorder)), [recorderKind, recorder]);
  return <Deck {...props} track={track} />;
}

type Send = (event: AnalyticsEvent) => void;

/**
 * Envoi sans attente depuis les gestes du paquet. Hors production, un échec (événement invalide) reste une
 * erreur non rattrapée, qui fait échouer les tests (décision 0013 § 3.3). En production, une mesure perdue
 * (chargement impossible) n'interrompt rien ; l'événement suivant retente le chargement (`createLazyTrack`).
 */
function sendWith(lazyTrack: LazyTrack): Send {
  return (event) => {
    lazyTrack(event).catch((error: unknown) => {
      if (process.env.NODE_ENV !== "production") throw error;
    });
  };
}


function toastMessage(toast: UndoToastInfo): string {
  if (toast.kind === "dayKept") {
    return format(t.toast.dayKept, { day: toast.day });
  }
  return format(t.toast[toast.kind], { name: toast.name });
}

type FocusTarget = "card" | "keep";

type DeckProps = Omit<PresentationScreenProps, "recorder" | "recorderKind"> & { track: Send };

function Deck({
  tripId,
  unlocked,
  generatingDays,
  proposals,
  days,
  noOptionSlots = [],
  canUnlock = true,
  placesFromGoogle = false,
  actions: injected,
  track,
}: DeckProps) {
  const [state, dispatch] = useReducer(deckReducer, proposals, initDeck);
  const [actions] = useState<DeckActions>(() => injected ?? createLocalDeckActions());
  const [detail, setDetail] = useState<Proposal | null>(null);
  const dayOf = (index: number) => days.find((day) => day.index === index);
  const [announcement, setAnnouncement] = useState("");
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget; serial: number } | null>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const endTitleRef = useRef<HTMLHeadingElement>(null);
  /** Élément du paquet qui avait le focus avant l'ouverture d'une feuille ; `null` = carte en cours. */
  const returnFocusRef = useRef<HTMLElement | null>(null);
  /** Question dont la réponse est en cours d'envoi : un second appui sur « Oui » ou « Non » est ignoré. */
  const answeringRef = useRef<PreferencePrompt | null>(null);

  const card = currentCard(state);
  const position = state.index + 1;
  const programme = `/voyages/${encodeURIComponent(tripId)}`;

  // Focus après une action (F6-PO-5) : carte suivante, ou titre de fin en fin de paquet.
  useEffect(() => {
    if (!focusRequest) return;
    if (!card) {
      endTitleRef.current?.focus();
    } else if (focusRequest.target === "card") {
      cardRef.current?.focus();
    }
    // Seule une nouvelle demande déplace le focus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest]);

  const requestFocus = useCallback((target: FocusTarget) => {
    setFocusRequest((previous) => ({ target, serial: (previous?.serial ?? 0) + 1 }));
  }, []);

  function decide(decision: Decision, gesture: Gesture, from: FocusTarget) {
    if (!card || state.prompt || state.pending) return;
    returnFocusRef.current = from === "card" ? null : (document.activeElement as HTMLElement | null);
    dispatch({ type: "decide", decision });
    track({
      name: "deck_decision",
      properties: {
        decision,
        kind: card.kind,
        category: card.category,
        position,
        gesture,
        travel_minutes: card.travelFromPrevious?.minutes ?? 0,
      },
    });
    requestFocus(from);
    void actions
      .decide({ proposalId: card.id, kind: card.kind, category: card.category, decision })
      .then(({ prompt }) => dispatch({ type: "resolved", prompt }));
  }

  function keepDay() {
    if (!card || state.prompt || state.pending) return;
    dispatch({ type: "keepDay" });
    track({ name: "deck_skipped", properties: { position, scope: "day" } });
    requestFocus("keep");
  }

  function undo() {
    const pending = state.undo;
    if (!pending) return;
    const restored = pending.snapshot.cards[pending.snapshot.index];
    dispatch({ type: "undo" });
    track({ name: "deck_undo", properties: { position: pending.position } });
    if (pending.decision && restored) {
      void actions.undo({ proposalId: restored.id });
    }
    setAnnouncement("");
    requestFocus("card");
  }

  function answer(value: PreferenceAnswer) {
    const prompt = state.prompt;
    if (!prompt || answeringRef.current === prompt) return;
    answeringRef.current = prompt;
    const removed =
      prompt.kind === "category" && value.answer === "yes"
        ? state.cards.filter((c, i) => i >= state.index && c.kind === "activity" && c.category === prompt.category).length
        : 0;
    track({
      name: "preference_prompt_answered",
      properties: {
        category: prompt.kind === "category" ? prompt.category : "distance",
        answer: value.answer,
        ...(value.reason ? { reason: EVENT_REASON[value.reason] } : {}),
      },
    });
    void actions.answerPrompt(prompt, value).then(({ next }) => {
      answeringRef.current = null;
      dispatch({ type: "answer", prompt, answer: value, next });
      if (removed > 0) {
        setAnnouncement(removed === 1 ? t.question.retiree : format(t.question.retirees, { nombre: removed }));
      }
    });
  }

  function returnFocus() {
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target?.isConnected && target.closest("[data-deck-zone]")) {
      target.focus();
    } else if (cardRef.current) {
      cardRef.current.focus();
    } else {
      endTitleRef.current?.focus();
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const target = event.target as HTMLElement;
    // Flèches actives seulement dans la zone du paquet : ni dans une feuille, ni sur le toast.
    if (!event.currentTarget.contains(target) || target.closest("[data-undo-toast]") || state.prompt || detail) return;
    event.preventDefault();
    decide(event.key === "ArrowRight" ? "like" : "dislike", "key", target === cardRef.current ? "card" : "keep");
  }

  const endVariant: DeckEndVariant = state.cards.length === 0 ? "vide" : unlocked ? "suite" : "apercu";
  const showToast = state.undo !== null && state.prompt === null && !state.pending;
  // Un seul toast, dans une région montée en permanence sous le paquet (F6-Q1, place provisoire : Q68).
  const toast =
    showToast && state.undo ? (
      <UndoToast
        key={`${state.decisions.length}-${state.keptDays.length}`}
        message={toastMessage(state.undo.toast)}
        onUndo={undo}
        onExpire={() => dispatch({ type: "expireUndo" })}
      />
    ) : null;

  return (
    <main
      className="mx-auto flex h-dvh w-full max-w-md flex-col gap-3 px-5 pt-3 pb-4"
      onPointerDownCapture={preloadDeferred}
      onFocusCapture={preloadDeferred}
    >
      <h1 className="sr-only">{unlocked ? t.titre.suite : t.titre.apercu}</h1>
      {generatingDays.map((day) => (
        <StatusBanner key={day} kind="generating" message={format(t.generation, { n: day })} className="shrink-0" />
      ))}
      {noOptionSlots.length > 0 ? (
        <StatusBanner kind="noOption" message={noOptionMessage(noOptionSlots)} className="shrink-0" />
      ) : null}
      <p role="status" className="sr-only" data-announce="">
        {announcement}
      </p>
      {card ? (
        <div
          data-deck-zone=""
          aria-label={t.paquet}
          role="group"
          onKeyDown={handleKeyDown}
          className="grid min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,auto)_auto_auto] content-start gap-4 [&_[data-part=carte]]:col-start-1 [&_[data-part=carte]]:row-start-2 [&_[data-part=carte]]:max-h-full [&_[data-part=carte]]:self-start [&_[data-part=actions]]:col-start-1 [&_[data-part=actions]]:row-start-3"
        >
          <div className="col-start-1 row-start-1 flex items-center gap-3">
            <DeckProgress
              current={position}
              total={state.cards.length}
              label={format(t.progression, { current: position, total: state.cards.length })}
              text={format(t.progressionVisible, { current: position, total: state.cards.length })}
            />
            <Button asChild variant="text" size="sm" className="min-w-(--touch-target) font-semibold">
              <Link
                href={programme}
                prefetch={false}
                onClick={() => track({ name: "deck_skipped", properties: { position, scope: "all" } })}
              >
                {t.passer}
              </Link>
            </Button>
          </div>
          <DeckCard
            className="contents"
            proposal={card}
            context={formatContexte(card.neighbours, dayOf(card.day)?.stops ?? [])}
            isLastOption={isLastOption(state)}
            cardRef={cardRef}
            onLike={(gesture) => decide("like", gesture, gesture === "button" ? "keep" : "card")}
            onDislike={(gesture) => decide("dislike", gesture, gesture === "button" ? "keep" : "card")}
            onOpen={() => {
              returnFocusRef.current = null;
              setDetail(card);
            }}
          />
          <Button variant="text" size="sm" className="col-start-1 row-start-4 self-center justify-self-center" onClick={keepDay} data-action="keep-day">
            {format(t.toutGarder, { n: card.day })}
          </Button>
        </div>
      ) : (
        <DeckEnd variant={endVariant} tripId={tripId} canUnlock={canUnlock} titleRef={endTitleRef} />
      )}
      <UndoToastRegion className="mt-1 shrink-0">{toast}</UndoToastRegion>
      <PlacesAttribution placesFromGoogle={placesFromGoogle} className="shrink-0" />
      {/* Montées seulement à l'ouverture : la fermeture les démonte, et Radix rend le focus (`onReturnFocus`). */}
      {state.prompt ? (
        <Suspense fallback={null}>
          <PreferenceSheet
            prompt={state.prompt}
            onAnswer={answer}
            onDismiss={() => dispatch({ type: "dismissPrompt" })}
            onReturnFocus={returnFocus}
          />
        </Suspense>
      ) : null}
      {detail ? (
        <Suspense fallback={null}>
          <ProposalDetailSheet
            proposal={detail}
            weekday={jourAbrege(dayOf(detail.day)?.date ?? "")}
            onClose={() => setDetail(null)}
            onReturnFocus={returnFocus}
            placesFromGoogle={placesFromGoogle}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
