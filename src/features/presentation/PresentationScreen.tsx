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
import type { DeckSession, PreferenceAnswer, PreferencePrompt, Proposal, TrialRevisionResult } from "@/contracts";
import { weekdayOf } from "@/contracts/values";
import { SaisieCodeAcces } from "@/features/prototype/SaisieCodeAcces";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

import { createLocalDeckActions, type DeckActions, type RefusDuTri } from "./actions";
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
import { usePhotoLieu } from "./photo";
import { choixDuTri, demanderRevision as demanderRevisionServeur, type DemanderRevision } from "./revision";
import { createServerDeckActions } from "./server-actions";

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
  /**
   * Voyage d'essai (adaptateur `prototype`, spécification E2E-essai, lot 1 ; D4) : le tri reste en mémoire, sans question
   * de préférence (le programme n'écrit pas de catégorie), et la fin du tri dit que les choix ne changent pas encore le
   * programme. Faux par défaut.
   */
  essai?: boolean;
  /**
   * Voyage d'essai lancé depuis l'app (spécification E2E-essai, lot 4 ; décision 0126) : à la fin du paquet, s'il y a au
   * moins un « Pas pour moi », le programme est réécrit sans ces étapes (`reviserVoyageEssai`) ; la phrase « choix sans
   * effet » laisse place à l'état de la réécriture. Faux par défaut.
   */
  revisable?: boolean;
  /** Demande de révision injectée (tests) ; par défaut, l'action serveur. */
  demanderRevision?: DemanderRevision;
  /** Enregistreur des mesures choisi par la page (aucun envoi réseau, décision 0013 § 3.3). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests) ; prime sur `recorderKind`. */
  recorder?: EventRecorder;
  /**
   * Actions de décision (décision 0013, § 3.2). Implémentation locale en mémoire par défaut : une
   * fonction ne traverse pas la frontière serveur/client. Sans `actions` : implémentation serveur si `deck` est non
   * nul (tri enregistré, décision 0112 § 4 point 3), locale sinon.
   */
  actions?: DeckActions;
  /**
   * État du tri enregistré (adaptateur `api`, B10a point 5) : `proposals` est alors le paquet de reprise ; la question
   * ouverte rouvre la feuille ; un tri clos montre l'écran de fin ; la progression part des cartes déjà décidées du tri
   * ouvert (F6-PO-16). `null` ou absent : session en mémoire de F6 (`mock`, `prototype`).
   */
  deck?: DeckSession | null;
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
  essai = false,
  revisable = false,
  demanderRevision = demanderRevisionServeur,
  actions: injected,
  deck = null,
  track,
}: DeckProps) {
  const [state, dispatch] = useReducer(deckReducer, proposals, (initial) => ({ ...initDeck(initial), prompt: deck?.openPrompt ?? null }));
  const [actions] = useState<DeckActions>(() => injected ?? (deck ? createServerDeckActions(tripId) : createLocalDeckActions({ questions: !essai })));
  /** Cartes du tri ouvert déjà décidées avant ce chargement (tri enregistré) : la progression part d'elles (F6-PO-16). */
  const offset = deck?.counts.decided ?? 0;
  /** Tri clos par cette instance (« Passer » ou fin du paquet) : une seule clôture. */
  const completedRef = useRef(deck?.closed ?? false);
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
  /**
   * Dernière décision ou réponse non enregistrée par le tri enregistré, carte gardée (B10-PO-14 ; revue de la PR 621,
   * bloquant 6) : bandeau `generating` (recalcul) ou `error` (échec), annoncé par la région `role="status"` de l'écran.
   * Effacé au geste suivant.
   */
  const [refus, setRefus] = useState<Exclude<RefusDuTri, "dejaDecidee"> | null>(null);
  /**
   * Réponse à la question non enregistrée (recalcul, échec ; revue de la PR 621, correction 2) : la feuille reste ouverte
   * et montre le refus dans un bandeau annoncé ; effacé à la réponse suivante ou à la fermeture de la feuille.
   */
  const [refusReponse, setRefusReponse] = useState<Exclude<RefusDuTri, "dejaDecidee"> | null>(null);

  /** Réécriture du programme après le tri (lot 4, décision 0126) : en cours d'envoi, statut rendu, ou échec réseau. */
  const [revision, setRevision] = useState<"envoi" | TrialRevisionResult["status"] | "erreur" | null>(null);
  /** Une seule demande par paquet terminé : « Réessayer » et la saisie du code la relancent explicitement. */
  const revisionDemandeeRef = useRef(false);

  const card = currentCard(state);
  // Décision 0128 : photo de la carte affichée seulement (voyage d'essai, données de lieux Google), puis celle du détail
  // ouvert, servie par la même demande de la page.
  const photoCarte = usePhotoLieu(card?.stop.placeId, placesFromGoogle);
  const photoDetail = usePhotoLieu(detail?.stop.placeId, placesFromGoogle);
  const position = offset + state.index + 1;
  const total = offset + state.cards.length;
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

  /** Montre et annonce un refus du tri enregistré qui garde la carte (ou la question) en place. */
  function signalerRefus(motif: RefusDuTri) {
    if (motif === "dejaDecidee") return;
    setRefus(motif);
    setAnnouncement(motif === "recalcul" ? t.refus.recalcul : t.refus.echec);
  }

  function decide(decision: Decision, gesture: Gesture, from: FocusTarget) {
    if (!card || state.prompt || state.pending) return;
    returnFocusRef.current = from === "card" ? null : (document.activeElement as HTMLElement | null);
    setRefus(null);
    setAnnouncement("");
    dispatch({ type: "decide", decision });
    // Durée inconnue (`minutes: null`, prototype, décision 0092 § 4 point 3) : `travel_minutes` n'est pas envoyé,
    // jamais 0. Sans `travelFromPrevious`, 0 comme avant (comportement de F6, inchangé).
    const minutes = card.travelFromPrevious === undefined ? 0 : card.travelFromPrevious.minutes;
    track({
      name: "deck_decision",
      properties: {
        decision,
        kind: card.kind,
        category: card.category,
        position,
        gesture,
        ...(minutes === null ? {} : { travel_minutes: minutes }),
      },
    });
    requestFocus(from);
    void actions
      .decide({ proposalId: card.id, kind: card.kind, category: card.category, decision, lastOption: isLastOption(state) })
      .then(({ prompt, refus: motif }) => {
        if (motif === undefined) {
          dispatch({ type: "resolved", prompt });
          return;
        }
        // Rien n'est enregistré : la carte reste (recalcul, échec) ou le paquet avance (déjà décidée), sans toast.
        dispatch({ type: "rejected", keep: motif !== "dejaDecidee" });
        signalerRefus(motif);
        if (motif !== "dejaDecidee") requestFocus("card");
      });
  }

  /** Clôt le tri enregistré, une fois (B10-PO-4 point 3) ; sans tri enregistré, rien. */
  function complete(): Promise<void> {
    if (!actions.complete || completedRef.current) return Promise.resolve();
    completedRef.current = true;
    return actions.complete().catch(() => {});
  }

  // Fin du paquet devenue définitive (plus d'annulation possible, aucune question ouverte) : le tri est clos.
  useEffect(() => {
    if (card || state.prompt || state.pending || state.undo || (offset === 0 && state.decisions.length + state.keptDays.length === 0)) return;
    void complete();
    // `complete` ne dépend que de `actions`, fixé au montage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, state.prompt, state.pending, state.undo, offset, state.decisions.length, state.keptDays.length]);

  /** Envoie les choix du tri pour réécrire le programme (lot 4) : seulement s'il y a au moins un « Pas pour moi ». */
  function reviser() {
    const { notForMe, liked } = choixDuTri(state.decisions);
    if (notForMe.length === 0) return;
    setRevision("envoi");
    setAnnouncement(t.fin.revision.envoi);
    void demanderRevision({ tripId, notForMe, liked })
      .then((resultat) => (resultat.ok ? resultat.value.status : "erreur"))
      .catch(() => "erreur" as const)
      .then((statut) => {
        setRevision(statut);
        setAnnouncement(statut === "accessExpired" ? t.fin.revision.acces.aide : t.fin.revision[statut === "erreur" ? "unavailable" : statut]);
      });
  }

  // Fin du paquet devenue définitive (plus d'annulation possible, aucune question ouverte) : la révision part une fois.
  useEffect(() => {
    if (!revisable || revisionDemandeeRef.current || card || state.prompt || state.pending || state.undo) return;
    if (!state.decisions.some(({ decision }) => decision === "dislike")) return;
    revisionDemandeeRef.current = true;
    // Hors du rendu de l'effet (l'envoi pose un état) ; `reviser` lit l'état courant, seule la fin du paquet l'envoie.
    queueMicrotask(reviser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revisable, card, state.prompt, state.pending, state.undo, state.decisions]);

  function passer() {
    track({ name: "deck_skipped", properties: { position, scope: "all" } });
    // Tri enregistré : « Passer » clôt le tri (B10-PO-4 point 3). La requête part avant la navigation du lien, qui ne
    // l'interrompt pas ; elle est idempotente et le tri se relit clos au retour.
    void complete();
  }

  function keepDay() {
    if (!card || state.prompt || state.pending) return;
    setRefus(null);
    dispatch({ type: "keepDay" });
    track({ name: "deck_skipped", properties: { position, scope: "day" } });
    requestFocus("keep");
  }

  function undo() {
    const pending = state.undo;
    if (!pending) return;
    const restored = pending.snapshot.cards[pending.snapshot.index];
    dispatch({ type: "undo" });
    track({ name: "deck_undo", properties: { position: offset + pending.position } });
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
    setRefus(null);
    setRefusReponse(null);
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
    void actions.answerPrompt(prompt, value).then(({ next, refus: motif }) => {
      answeringRef.current = null;
      if (motif === "dejaDecidee") {
        // La question n'est plus ouverte côté serveur (fermée ailleurs) : la feuille se ferme, le paquet ne change pas.
        dispatch({ type: "dismissPrompt" });
        return;
      }
      if (motif !== undefined) {
        // Recalcul ou échec : rien n'est enregistré ; la feuille reste ouverte avec le refus, la personne peut réessayer.
        setRefusReponse(motif);
        return;
      }
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

  const endVariant: DeckEndVariant = total === 0 && !deck?.closed ? "vide" : unlocked ? "suite" : "apercu";
  /** Tri clos à l'ouverture (« Passer », fin du paquet ou déblocage) : titre propre, les cartes non triées sont gardées. */
  const closedAtLoad = deck?.closed === true;
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
      {/* Refus du tri enregistré : annoncé par la région `role="status"` ci-dessous (bandeau sans rôle propre, 0018). */}
      {refus ? (
        <StatusBanner
          kind={refus === "recalcul" ? "generating" : "error"}
          message={refus === "recalcul" ? t.refus.recalcul : t.refus.echec}
          announce={false}
          className="shrink-0"
        />
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
              total={total}
              label={format(t.progression, { current: position, total })}
              text={format(t.progressionVisible, { current: position, total })}
            />
            <Button asChild variant="text" size="sm" className="min-w-(--touch-target) font-semibold">
              <Link
                href={programme}
                prefetch={false}
                onClick={passer}
              >
                {t.passer}
              </Link>
            </Button>
          </div>
          <DeckCard
            className="contents"
            proposal={card}
            photo={photoCarte}
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
        <DeckEnd
          variant={endVariant}
          closed={closedAtLoad}
          notAllSorted={state.keptDays.length > 0 || state.removedByAnswer > 0}
          tripId={tripId}
          canUnlock={canUnlock}
          choixSansEffet={essai && !revisable && endVariant !== "vide"}
          revision={
            revision === null ? null : (
              <EtatRevision
                etat={revision}
                onRetry={reviser}
                onAcces={() => {
                  // Code accepté : la saisie se démonte (nouvel envoi) ; le focus revient au titre de la fin (WCAG 2.4.3).
                  reviser();
                  endTitleRef.current?.focus();
                }}
              />
            )
          }
          titleRef={endTitleRef}
        />
      )}
      <UndoToastRegion className="mt-1 shrink-0">{toast}</UndoToastRegion>
      <PlacesAttribution placesFromGoogle={placesFromGoogle} className="shrink-0" />
      {/* Montées seulement à l'ouverture : la fermeture les démonte, et Radix rend le focus (`onReturnFocus`). */}
      {state.prompt ? (
        <Suspense fallback={null}>
          <PreferenceSheet
            prompt={state.prompt}
            onAnswer={answer}
            refus={
              refusReponse === null
                ? null
                : { kind: refusReponse === "recalcul" ? "generating" : "error", message: refusReponse === "recalcul" ? t.refus.recalcul : t.refus.echec }
            }
            onDismiss={() => {
              setRefusReponse(null);
              dispatch({ type: "dismissPrompt" });
            }}
            onReturnFocus={returnFocus}
          />
        </Suspense>
      ) : null}
      {detail ? (
        <Suspense fallback={null}>
          <ProposalDetailSheet
            proposal={detail}
            weekday={weekdayOf(dayOf(detail.day)?.date ?? "")}
            onClose={() => setDetail(null)}
            onReturnFocus={returnFocus}
            placesFromGoogle={placesFromGoogle}
            photo={photoDetail}
          />
        </Suspense>
      ) : null}
    </main>
  );
}

/**
 * État de la réécriture du programme à la fin du tri (lot 4, décision 0126) : message (annoncé par la région
 * `role="status"` de l'écran), « Réessayer » après un échec, saisie du code d'accès s'il a expiré (puis nouvel envoi).
 */
function EtatRevision({ etat, onRetry, onAcces }: { etat: "envoi" | TrialRevisionResult["status"] | "erreur"; onRetry: () => void; onAcces: () => void }) {
  const r = t.fin.revision;
  if (etat === "accessExpired") {
    return (
      <div data-part="revision" data-revision="accessExpired">
        <SaisieCodeAcces ouverte={false} parcours={{ titre: r.acces.titre, aide: r.acces.aide, surAcces: onAcces, focusAuMontage: true, niveauTitre: 3 }} />
      </div>
    );
  }
  const echec = etat === "erreur" || etat === "unavailable";
  return (
    <div data-part="revision" data-revision={etat} className="flex flex-col gap-3">
      <p className={echec || etat === "capReached" ? "text-corps text-ink" : "text-corps text-ink-2"}>{r[etat === "erreur" ? "unavailable" : etat]}</p>
      {echec ? (
        <Button variant="secondary" onClick={onRetry} className="self-start">
          {r.reessayer}
        </Button>
      ) : null}
    </div>
  );
}
