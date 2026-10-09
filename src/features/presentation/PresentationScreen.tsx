"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { AnalyticsProvider, useTrack } from "@/analytics/context";
import { EVENT_REASON } from "@/analytics/events";
import { recorderFor, type EventRecorder, type RecorderKind } from "@/analytics/track";
import { Button, DeckCard, DeckProgress, StatusBanner, UndoToast, UndoToastRegion } from "@/components/ligne";
import type { PreferenceAnswer, PreferencePrompt, Proposal } from "@/contracts";
import { format, messages } from "@/i18n";

import { createLocalDeckActions, type DeckActions } from "./actions";
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
import { PreferenceSheet } from "./PreferenceSheet";
import { ProposalDetailSheet } from "./ProposalDetailSheet";

const t = messages.presentation;

export interface PresentationScreenProps {
  tripId: string;
  /** Écran 6 (faux) ou 6b « Suite du tri » (vrai). */
  unlocked: boolean;
  /** Jours encore en préparation (`Day.generating`), pour le `StatusBanner` (F6-PO-13). */
  generatingDays: number[];
  proposals: Proposal[];
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

/** Écrans 6 et 6b : présentation « J'aime / Pas pour moi ». État en mémoire seulement (F6-PO-15). */
export function PresentationScreen({ recorderKind = "none", recorder, ...props }: PresentationScreenProps) {
  const chosen = useMemo(() => recorder ?? recorderFor(recorderKind), [recorder, recorderKind]);
  return (
    <AnalyticsProvider recorder={chosen}>
      <Deck {...props} />
    </AnalyticsProvider>
  );
}

function toastMessage(toast: UndoToastInfo): string {
  if (toast.kind === "dayKept") {
    return format(t.toast.dayKept, { day: toast.day });
  }
  return format(t.toast[toast.kind], { name: toast.name });
}

type FocusTarget = "card" | "keep";

function Deck({ tripId, unlocked, generatingDays, proposals, actions: injected }: Omit<PresentationScreenProps, "recorder" | "recorderKind">) {
  const [state, dispatch] = useReducer(deckReducer, proposals, initDeck);
  const [actions] = useState<DeckActions>(() => injected ?? createLocalDeckActions());
  const track = useTrack();
  const [detail, setDetail] = useState<Proposal | null>(null);
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
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col gap-3 px-5 pt-3 pb-4">
      <h1 className="sr-only">{unlocked ? t.titre.suite : t.titre.apercu}</h1>
      {generatingDays.map((day) => (
        <StatusBanner key={day} kind="generating" message={format(t.generation, { n: day })} className="shrink-0" />
      ))}
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
            <DeckProgress current={position} total={state.cards.length} label={format(t.progression, { current: position, total: state.cards.length })} />
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
        <DeckEnd variant={endVariant} tripId={tripId} titleRef={endTitleRef} />
      )}
      <UndoToastRegion className="mt-1 shrink-0">{toast}</UndoToastRegion>
      <PreferenceSheet
        prompt={state.prompt}
        onAnswer={answer}
        onDismiss={() => dispatch({ type: "dismissPrompt" })}
        onReturnFocus={returnFocus}
      />
      <ProposalDetailSheet proposal={detail} onClose={() => setDetail(null)} onReturnFocus={returnFocus} />
    </main>
  );
}
