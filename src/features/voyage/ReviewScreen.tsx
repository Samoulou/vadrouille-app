"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { Button } from "@/components/ligne/Button";
import { iconButtonClassName } from "@/components/ligne/IconButton";
import { IconRetour } from "@/components/ligne/icons";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { TripReview } from "@/contracts";
import { STOP_RATINGS, type StopRating } from "@/contracts/values";
import { etapesAEvaluer, type EtapeAEvaluer } from "@/domain/apres-voyage";
import { tripRoutes } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatTitreJour } from "@/lib/dates";
import { useOnline } from "@/lib/online";
import { cn } from "@/lib/utils";

import type { ReviewTrip } from "./review";
import { createMemoryReviewActions, createServerReviewActions, type ReviewActions, type ReviewMemory } from "./review-actions";
import { useOptionalTripSession } from "./TripSessionProvider";

const t = messages.apres;

/** Identifiant du bandeau hors ligne : il décrit les choix désactivés (`aria-describedby`, handover § 13). */
const OFFLINE_ID = "apres-hors-ligne";

const LINK = "inline-flex min-h-(--touch-target) items-center self-start rounded-control font-bold underline underline-offset-2";

export interface ReviewScreenProps {
  /** Voyage projeté par la page serveur (`projectReviewTrip`), sans `placeId`. */
  trip: ReviewTrip;
  /** Lecture de l'écran (`getTripReview`) : accès calculé par le serveur, avis déjà donnés (`api`). */
  review: TripReview;
  /**
   * `server` : avis enregistrés par l'action `rateStop` (`api`) ; `memory` : mémoire de l'onglet (`mock`, 0021 § 4), avec la
   * mention de démonstration (spécification M8 § 3.2 point 4).
   */
  mode: "server" | "memory";
  /** Actions injectées (tests) ; sinon celles du mode. */
  actions?: ReviewActions;
  /** Enregistreur des mesures choisi par la page (aucun envoi réseau, décision 0013 § 3.3). */
  recorderKind?: RecorderKind;
  /** Enregistreur injecté (tests) ; prime sur `recorderKind`. */
  recorder?: EventRecorder;
}

/** « Jeudi 3 septembre » → « jeudi 3 septembre » : date d'un jour dans une phrase (`redaction.md`). */
function inSentence(title: string): string {
  return title.charAt(0).toLocaleLowerCase("fr") + title.slice(1);
}

const SANS_MEMOIRE: ReviewMemory = { recordReview: () => undefined };

type Gesture = { readonly stopId: string; readonly rating: StopRating | null };

/** Étapes à évaluer groupées par jour, dans l'ordre du programme ; un jour sans étape n'est pas rendu (F11, écran 16). */
function byDay(trip: ReviewTrip, etapes: readonly EtapeAEvaluer[]) {
  return trip.days
    .map((day) => ({ day, etapes: etapes.filter((etape) => etape.dayIndex === day.index) }))
    .filter((group) => group.etapes.length > 0);
}

function ChoiceGroup({
  etape,
  value,
  disabled,
  busy,
  onChoose,
}: {
  etape: EtapeAEvaluer;
  value: StopRating | undefined;
  disabled: boolean;
  busy: boolean;
  onChoose: (rating: StopRating) => void;
}) {
  return (
    <div
      role="group"
      aria-label={format(t.groupe, { name: etape.name })}
      aria-describedby={disabled ? OFFLINE_ID : undefined}
      aria-busy={busy || undefined}
      data-part="avis"
      className="flex w-full gap-1 rounded-control bg-muted p-1"
    >
      {STOP_RATINGS.map((rating) => {
        const pressed = value === rating;
        return (
          <button
            key={rating}
            type="button"
            aria-pressed={pressed}
            aria-disabled={disabled || undefined}
            data-rating={rating}
            onClick={() => {
              if (!disabled) onChoose(rating);
            }}
            className={cn(
              "inline-flex min-h-(--touch-target) flex-1 cursor-pointer items-center justify-center rounded-control px-2 text-center text-corps-s",
              pressed ? "bg-line font-bold text-on-line" : "bg-transparent font-semibold text-ink-2",
              disabled && "cursor-not-allowed",
            )}
          >
            {t.choix[rating]}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Écran 16 « Après le voyage » (`R16` ; tâche M8a, ticket 1062 ; spécification `specs/M8-apres-le-voyage-api.md` § 3 et
 * § 7, F11 écran 16 ; décision 0160 § 1.5). Page sans carte et sans donnée Google : noms maison des étapes seulement.
 *
 * - Avant le dernier jour (`notEnded`) : « Ton voyage n'est pas terminé… » et « Voir le séjour », rien d'autre.
 * - Accès `open` : une ligne par étape à évaluer (`etapesAEvaluer`, même fonction que le serveur), trois choix exclusifs
 *   sans valeur au départ ; toucher le choix actif l'efface. Un appel par geste, **un seul à la fois par étape** : un
 *   second appui pendant l'envoi est mis en attente (le dernier l'emporte), envoyé à la réponse du premier (0160 § 1.1
 *   point 4). Le choix n'est affiché qu'une fois enregistré ; une erreur le laisse à son état d'avant, avec « Réessayer ».
 * - Lecture seule (`readOnly`, plus de 30 jours après le retour) : avis affichés, aucun bouton d'écriture.
 *
 * Hors ligne : bandeau, choix en `aria-disabled="true"` décrits par le bandeau, avis déjà donnés affichés. Rien n'est
 * gardé dans le navigateur (ni stockage, ni adresse) ; sur `mock`, mémoire de l'onglet et mention de démonstration.
 * Mesure : `stop_reviewed { rating, kind }` à chaque choix enregistré, jamais à l'effacement. Rendus et textes
 * provisoires (UX/UI, U1 et U5).
 */
export function ReviewScreen({ trip, review, mode, actions: injected, recorderKind = "none", recorder }: ReviewScreenProps) {
  const online = useOnline();
  const routes = tripRoutes("/voyages", trip.id);
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);
  const memory = useOptionalTripSession();
  const etapes = useMemo(() => etapesAEvaluer(trip.days), [trip.days]);
  const starts = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of trip.days) for (const item of day.items) if (item.type === "stop") map.set(item.stop.id, item.stop.start);
    return map;
  }, [trip.days]);

  // Hors du fournisseur de l'onglet (tests isolés) : rien n'est gardé au-delà de l'état de l'écran.
  const actions = useMemo<ReviewActions>(() => {
    if (injected) return injected;
    if (mode === "server") return createServerReviewActions();
    return createMemoryReviewActions(memory ?? SANS_MEMOIRE, new Set(etapes.map((etape) => etape.stopId)));
  }, [injected, mode, etapes, memory]);

  const [ratings, setRatings] = useState<ReadonlyMap<string, StopRating>>(() =>
    mode === "memory" ? new Map(memory?.reviews(trip.id)) : new Map(review.reviews.map((avis) => [avis.stopId, avis.rating])),
  );
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<Gesture | null>(null);
  const queued = useRef(new Map<string, StopRating | null>());

  const editable = review.access === "open";
  const disabled = !online;

  const send = (gesture: Gesture) => {
    setPending((current) => new Set(current).add(gesture.stopId));
    setFailed(null);
    void actions.rateStop(trip.id, gesture.stopId, gesture.rating).then(
      (result) => settle(gesture, result.ok ? result.value : undefined, result.ok),
      () => settle(gesture, undefined, false),
    );
  };

  const settle = (gesture: Gesture, saved: { rating: StopRating } | null | undefined, ok: boolean) => {
    if (ok) {
      setRatings((current) => {
        const next = new Map(current);
        if (saved) next.set(gesture.stopId, saved.rating);
        else next.delete(gesture.stopId);
        return next;
      });
      const etape = etapes.find((candidate) => candidate.stopId === gesture.stopId);
      if (saved && etape) {
        track({ name: "stop_reviewed", properties: { rating: saved.rating, kind: etape.kind } }).catch(() => {
          // Mesure perdue (chargement impossible) : rien à montrer, elle n'est pas réessayée.
        });
      }
    } else {
      setFailed(gesture);
    }
    const next = queued.current.get(gesture.stopId);
    queued.current.delete(gesture.stopId);
    if (next !== undefined && ok) {
      send({ stopId: gesture.stopId, rating: next });
      return;
    }
    setPending((current) => {
      const rest = new Set(current);
      rest.delete(gesture.stopId);
      return rest;
    });
  };

  const choose = (stopId: string, rating: StopRating) => {
    if (!editable || disabled) return;
    const target = ratings.get(stopId) === rating ? null : rating;
    if (pending.has(stopId)) {
      queued.current.set(stopId, target);
      return;
    }
    send({ stopId, rating: target });
  };

  let content;
  if (review.access === "notEnded") {
    const last = trip.days[trip.days.length - 1];
    content = (
      <>
        <h1 id="apres-titre" className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
          {t.avant.titre}
        </h1>
        <p className="text-corps text-ink">{format(t.avant.texte, { date: inSentence(formatTitreJour(last?.date ?? trip.end)) })}</p>
        <Link href={routes.sejour()} prefetch={false} data-part="voir-sejour" className={cn(LINK, "text-corps text-line")}>
          {t.avant.voirSejour}
        </Link>
      </>
    );
  } else {
    const groups = byDay(trip, etapes);
    content = (
      <>
        <div className="flex flex-col gap-2">
          <h1 id="apres-titre" className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
            {format(t.titre, { destination: trip.destination })}
          </h1>
          <p className="text-corps-s text-ink-soft">{editable ? t.intro : t.lectureSeule}</p>
          {mode === "memory" ? (
            <p data-part="demonstration" className="text-corps-s text-ink-soft">
              {t.demonstration}
            </p>
          ) : null}
        </div>
        {/* Région live présente dès l'affichage, vide tant que le réseau est là (règle des annonces de 0018). */}
        <div id={OFFLINE_ID} role="status" data-part="hors-ligne" className="empty:-mt-5">
          {online || !editable ? null : <StatusBanner kind="offline" message={t.horsLigne} announce={false} />}
        </div>
        {failed ? (
          <StatusBanner
            kind="error"
            message={t.erreur}
            action={
              <Button variant="text" size="sm" className="px-0" onClick={() => {
                  if (!disabled) send(failed);
                }}
                aria-disabled={disabled || undefined}
              >
                {t.reessayer}
              </Button>
            }
          />
        ) : null}
        <section aria-labelledby="apres-etapes" className="flex flex-col gap-4">
          <h2 id="apres-etapes" className="text-section font-extrabold text-ink">
            {t.etapes}
          </h2>
          {groups.length === 0 ? <p className="text-corps text-ink-soft">{t.aucuneEtape}</p> : null}
          {groups.map(({ day, etapes: duJour }) => (
            <div key={day.index} className="flex flex-col gap-3" data-day={day.index}>
              <h3 className="text-arret font-bold text-ink">{formatTitreJour(day.date)}</h3>
              <ul className="flex flex-col gap-4">
                {duJour.map((etape) => {
                  const value = ratings.get(etape.stopId);
                  return (
                    <li key={etape.stopId} data-stop={etape.stopId} className="flex flex-col gap-2">
                      <p className="text-corps text-ink">
                        <span className="text-corps-s text-ink-soft tabular-nums">{starts.get(etape.stopId)}</span>{" "}
                        <span className="font-bold">{etape.name}</span>
                      </p>
                      {editable ? (
                        <ChoiceGroup
                          etape={etape}
                          value={value}
                          disabled={disabled}
                          busy={pending.has(etape.stopId)}
                          onChoose={(rating) => choose(etape.stopId, rating)}
                        />
                      ) : value ? (
                        <p data-part="avis-lu" className="text-corps-s text-ink-soft">
                          {t.choix[value]}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      </>
    );
  }

  return (
    <main aria-labelledby="apres-titre" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-3 pb-10">
      <div className="flex items-center gap-3">
        <Link href={routes.sejour()} prefetch={false} aria-label={t.retour} data-part="retour" className={iconButtonClassName("square")}>
          <IconRetour />
        </Link>
      </div>
      {content}
    </main>
  );
}
