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
      data-busy={busy || undefined}
      className={cn("flex w-full gap-1 rounded-control bg-muted p-1", busy && "opacity-70")}
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
              // Hors ligne (revue de la PR 1068, bloquant 3) : rendu indisponible du jeu Ligne (`Chip`, `ChecklistRow`
              // `disabledBy` ; handover § 5 et § 13) : contour et texte `ink-soft` sur fond `muted` ; choisi : fond `ink-soft`.
              disabled
                ? pressed
                  ? "cursor-not-allowed border-(length:--ligne-trait-controle) border-ink-soft bg-ink-soft font-bold text-on-line"
                  : "cursor-not-allowed border-(length:--ligne-trait-controle) border-ink-soft bg-muted font-semibold text-ink-soft"
                : pressed
                  ? "bg-line font-bold text-on-line"
                  : "bg-transparent font-semibold text-ink-2",
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
 * Envoi en cours (revue de la PR 1068, bloquant 4) : groupe atténué, « Enregistrement… » sous l'étape, `aria-busy` ; à la
 *   réponse, annonce discrète (`role="status"`) « Avis enregistré. » ou « Avis effacé. ».
 * - Erreur d'écriture (bloquant 5) : message du § 7 et « Réessayer » **sous l'étape concernée** ; l'erreur reste jusqu'au
 *   réessai ou à un nouveau geste sur cette étape. Un geste mis en attente pendant un envoi qui échoue n'est pas envoyé :
 *   « Réessayer » rejoue le **dernier** geste (mineur 6).
 *
 * Hors ligne : bandeau, choix en `aria-disabled="true"` décrits par le bandeau et rendus indisponibles (contour et texte
 * `ink-soft`, fond `muted`), avis déjà donnés affichés. Rien n'est
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
  const [failed, setFailed] = useState<ReadonlyMap<string, Gesture>>(new Map());
  const [announcement, setAnnouncement] = useState("");
  const queued = useRef(new Map<string, StopRating | null>());

  const editable = review.access === "open";
  const disabled = !online;

  const clearFailure = (stopId: string) =>
    setFailed((current) => {
      if (!current.has(stopId)) return current;
      const next = new Map(current);
      next.delete(stopId);
      return next;
    });

  const send = (gesture: Gesture) => {
    setPending((current) => new Set(current).add(gesture.stopId));
    // Un nouvel envoi pour cette étape (réessai ou nouveau geste) remplace son erreur ; celles des autres étapes restent.
    clearFailure(gesture.stopId);
    setAnnouncement("");
    void actions.rateStop(trip.id, gesture.stopId, gesture.rating).then(
      (result) => settle(gesture, result.ok ? result.value : undefined, result.ok),
      () => settle(gesture, undefined, false),
    );
  };

  const settle = (gesture: Gesture, saved: { rating: StopRating } | null | undefined, ok: boolean) => {
    const next = queued.current.get(gesture.stopId);
    queued.current.delete(gesture.stopId);
    if (ok) {
      setRatings((current) => {
        const updated = new Map(current);
        if (saved) updated.set(gesture.stopId, saved.rating);
        else updated.delete(gesture.stopId);
        return updated;
      });
      const etape = etapes.find((candidate) => candidate.stopId === gesture.stopId);
      if (saved && etape) {
        track({ name: "stop_reviewed", properties: { rating: saved.rating, kind: etape.kind } }).catch(() => {
          // Mesure perdue (chargement impossible) : rien à montrer, elle n'est pas réessayée.
        });
      }
      if (next !== undefined) {
        send({ stopId: gesture.stopId, rating: next });
        return;
      }
      setAnnouncement(saved ? t.enregistre : t.efface);
    } else {
      // Le dernier geste l'emporte : « Réessayer » rejoue le geste en attente s'il y en a un, sans l'envoyer d'office.
      setFailed((current) => new Map(current).set(gesture.stopId, next === undefined ? gesture : { stopId: gesture.stopId, rating: next }));
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
      // Appui pendant l'envoi : mis en attente, le dernier l'emporte ; « Enregistrement… » reste affiché.
      queued.current.set(stopId, target);
      return;
    }
    send({ stopId, rating: target });
  };

  let content;
  if (review.access === "notEnded") {
    const last = trip.days[trip.days.length - 1];
    content = (
      <div className="mt-5 flex flex-col gap-5">
        <h1 id="apres-titre" className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
          {t.avant.titre}
        </h1>
        <p className="text-corps text-ink">{format(t.avant.texte, { date: inSentence(formatTitreJour(last?.date ?? trip.end)) })}</p>
        <Link href={routes.sejour()} prefetch={false} data-part="voir-sejour" className={cn(LINK, "text-corps text-line")}>
          {t.avant.voirSejour}
        </Link>
      </div>
    );
  } else {
    const groups = byDay(trip, etapes);
    content = (
      <>
        <div className="mt-5 flex flex-col gap-2">
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
        {/* Région live présente dès l'affichage, vide tant que le réseau est là (règle des annonces de 0018) ; sans marge
            propre : seul le bandeau, quand il est là, prend sa place (mineur 15). */}
        <div id={OFFLINE_ID} role="status" data-part="hors-ligne">
          {online || !editable ? null : <StatusBanner kind="offline" message={t.horsLigne} announce={false} className="mt-5" />}
        </div>
        {/* Annonce discrète de la fin d'un envoi (bloquant 4), lue par les lecteurs d'écran seulement. */}
        <p role="status" data-part="annonce-avis" className="sr-only">
          {announcement}
        </p>
        <section aria-labelledby="apres-etapes" className="mt-5 flex flex-col gap-4">
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
                  const busy = pending.has(etape.stopId);
                  const failure = failed.get(etape.stopId);
                  return (
                    <li key={etape.stopId} data-stop={etape.stopId} className="flex flex-col gap-2">
                      <p className="text-corps text-ink">
                        <span className="text-corps-s text-ink-soft tabular-nums">{starts.get(etape.stopId)}</span>{" "}
                        <span className="font-bold">{etape.name}</span>
                      </p>
                      {editable ? (
                        <ChoiceGroup etape={etape} value={value} disabled={disabled} busy={busy} onChoose={(rating) => choose(etape.stopId, rating)} />
                      ) : (
                        <p data-part="avis-lu" className="text-corps-s text-ink-soft">
                          {value ? format(t.avisLu, { choix: t.choix[value] }) : t.sansAvis}
                        </p>
                      )}
                      {editable && busy ? (
                        <p data-part="envoi" className="text-legende text-ink-soft">
                          {t.enregistrement}
                        </p>
                      ) : null}
                      {editable && failure ? (
                        <StatusBanner
                          kind="error"
                          message={t.erreur}
                          action={
                            <Button
                              variant="text"
                              size="sm"
                              className="px-0"
                              aria-disabled={disabled || undefined}
                              onClick={() => {
                                if (!disabled) send(failure);
                              }}
                            >
                              {t.reessayer}
                            </Button>
                          }
                        />
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
    <main aria-labelledby="apres-titre" className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-3 pb-10">
      <div className="flex items-center gap-3">
        <Link href={routes.sejour()} prefetch={false} aria-label={t.retour} data-part="retour" className={iconButtonClassName("square")}>
          <IconRetour />
        </Link>
      </div>
      {content}
    </main>
  );
}
