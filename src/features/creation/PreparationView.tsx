"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { createLazyTrack } from "@/analytics/lazy";
import type { EventRecorder, RecorderKind } from "@/analytics/track";
import { Button } from "@/components/ligne/Button";
import { DayBadge } from "@/components/ligne/DayBadge";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import type { GenerationStatus } from "@/contracts";
import { presentationRoute } from "@/features/presentation/routes";
import { SaisieCodeAcces } from "@/features/prototype/SaisieCodeAcces";
import { mesVoyagesRoute, tripRoutes } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { getGenerationStatus, relancerVoyageEssai } from "@/server/actions/creation";

import { CreationShell, TITLE_CLASS } from "./CreationShell";
import { EMPTY_LIVE_REGION_CLASS } from "./fields";
import { creationRoutes } from "./routes";
import { isPreviewReady, missingMessage, newlyReadyDays, readyCounter, useGenerationStatus, type FetchStatus } from "./generation";
import { takePreviewReady } from "./launch-timing";

const t = messages.creation.ecran5;
const e = t.essai;

/**
 * Relance d'un voyage d'essai (décision 0125 § 4) : en cours (annoncée, titre de la préparation), en échec avec son
 * message, ou accès expiré (saisie du code dans l'écran, puis relance).
 */
type Relance = { kind: "idle" } | { kind: "pending" } | { kind: "echec"; message: string } | { kind: "code" };

const fetchFromAction: FetchStatus = (tripId) => getGenerationStatus({ tripId });

export interface PreparationViewProps {
  tripId: string;
  /** État lu par la page (composant serveur) : premier rendu sans attendre l'interrogation. */
  initial: GenerationStatus;
  /** Enregistreur des mesures (`preview_ready`) : console en développement et en test, aucun en production. */
  recorderKind?: RecorderKind;
  recorder?: EventRecorder;
  /** Lecture de l'avancement (tests) ; l'action `getGenerationStatus` par défaut. */
  fetchStatus?: FetchStatus;
  /**
   * Site d'essai (adaptateur `prototype`, valeur serveur ; spécification E2E-essai, lot 3 ; décision 0125 § 4) : sur un
   * échec (exécution arrêtée), « Réessayer » relance le brief saisi sous un **nouveau** voyage (`relancerVoyageEssai`),
   * puis l'adresse est remplacée par l'écran 5 du nouveau voyage. Ailleurs, « Réessayer » reprend l'interrogation.
   */
  essai?: boolean;
}

/**
 * Écran 5 « Propositions prêtes » (spécification F8, F8-PO-12, F8-PO-19, F8-PO-20 ; décision 0018 § 19) :
 * - ordre : titre, compteur (pas une région live), une rangée par jour (pastille réduite, mini-ligne `aria-hidden`,
 *   état), bandeaux, actions ; aucun `StatusBanner` `generating` ;
 * - une région `role="status"` présente dès le chargement reçoit chaque passage à « Jour {n} prêt », puis l'état
 *   final, une fois chacun, sans déplacer le focus ;
 * - prêt ou aperçu incomplet : « Voir mes propositions » et « Passer, voir le programme », sans redirection ;
 *   incomplet : `StatusBanner` `noOption` ; échec : `StatusBanner` `error`, avec « Réessayer » si `retryable` (ou
 *   si l'interrogation a échoué, focus sur le titre après l'appui), sinon « Voir mes voyages » ; le titre et les
 *   jours non prêts disent alors l'interruption (« Préparation interrompue », « Interrompu ») ;
 * - `preview_ready` à la première vue de l'état prêt ou incomplet dans l'onglet (`launch-timing.ts`) ; la
 *   validation de la mesure est chargée à ce moment (`createLazyTrack`), hors du JavaScript initial.
 * Aucun nom de lieu : les arrêts sont des anneaux sans numéro (F8-PO-12).
 */
export function PreparationView({ tripId, initial, recorderKind = "none", recorder, fetchStatus = fetchFromAction, essai = false }: PreparationViewProps) {
  const router = useRouter();
  const { status, interrupted, retry } = useGenerationStatus(tripId, initial, fetchStatus);
  // Relance d'un voyage d'essai : un `requestId` par écran (double appui : une seule exécution réservée).
  const relanceId = useRef<string | null>(null);
  const relanceEnVol = useRef(false);
  const [relance, setRelance] = useState<Relance>({ kind: "idle" });
  // Retour de la saisie du code : le titre de l'écran reçoit le focus (un seul focus, WCAG 2.4.3).
  const [retourAcces, setRetourAcces] = useState(false);
  const track = useMemo(() => createLazyTrack(recorderKind, recorder), [recorderKind, recorder]);
  const [announcements, setAnnouncements] = useState<string[]>([]);
  const previous = useRef(initial);
  const title = useRef<HTMLHeadingElement>(null);
  const ready = isPreviewReady(status);

  // Annonces : passages de jour puis état final, observés dans cet onglet (un état déjà final au chargement est dit par le titre).
  useEffect(() => {
    const before = previous.current;
    if (before === status) return;
    previous.current = status;
    const next = newlyReadyDays(before, status).map((n) => format(t.jourPret, { n }));
    if (isPreviewReady(status) && !isPreviewReady(before)) next.push(t.titrePret);
    if (next.length > 0) setAnnouncements((current) => [...current, ...next]);
  }, [status]);

  useEffect(() => {
    if (!ready) return;
    const timing = takePreviewReady(tripId);
    if (!timing) return;
    const properties = timing.durationMs === undefined ? {} : { duration_ms: timing.durationMs };
    // Un échec du chargement de la validation n'interrompt rien (`createLazyTrack`).
    track({ name: "preview_ready", properties }).catch(() => undefined);
  }, [ready, tripId, track]);

  useEffect(() => {
    if (retourAcces) title.current?.focus();
  }, [retourAcces]);

  const failed = status.phase === "failed" ? status : null;
  const enRelance = relance.kind === "pending";
  const showError = (failed !== null || interrupted) && !enRelance;
  const canRetry = interrupted || (failed?.retryable ?? false);
  const routes = tripRoutes("/voyages", tripId);

  function retryWithFocus() {
    // Le bandeau (et le bouton) disparaît pendant la reprise : le focus va au titre (WCAG 2.4.3).
    title.current?.focus();
    if (essai && failed !== null && !interrupted) {
      setRelance({ kind: "pending" });
      void relancer();
      return;
    }
    retry();
  }

  /** Relance du brief saisi ; l'appelant a déjà affiché l'attente. Chaque échec a son message (WCAG 4.1.3). */
  async function relancer() {
    if (relanceEnVol.current) return;
    relanceEnVol.current = true;
    relanceId.current ??= crypto.randomUUID();
    let code: string | null = null;
    try {
      const result = await relancerVoyageEssai({ tripId, requestId: relanceId.current });
      if (result.ok) {
        router.replace(creationRoutes.preparation(result.value.tripId));
        return;
      }
      code = result.error.code;
    } catch {
      // Erreur réseau ou serveur : message générique de la relance.
    } finally {
      relanceEnVol.current = false;
    }
    if (code === "unauthenticated") {
      setRetourAcces(false);
      setRelance({ kind: "code" });
      return;
    }
    setRelance({ kind: "echec", message: code === "cost_cap_reached" ? messages.creation.lancement.essai.plafond : e.relanceEchec });
  }

  function surAcces() {
    setRelance({ kind: "pending" });
    setRetourAcces(true);
    void relancer();
  }

  if (relance.kind === "code") {
    return (
      <CreationShell backHref={mesVoyagesRoute()}>
        <SaisieCodeAcces ouverte={false} parcours={{ titre: e.acces.titre, aide: e.acces.aide, surAcces }} />
      </CreationShell>
    );
  }

  return (
    <CreationShell backHref={mesVoyagesRoute()}>
      <div className="flex flex-col gap-2">
        <h1 ref={title} tabIndex={-1} className={TITLE_CLASS}>
          {ready ? t.titrePret : showError ? t.titreInterrompu : t.titre}
        </h1>
        <p className="text-corps text-ink-2 tabular-nums" data-compteur="">
          {readyCounter(status.ready, status.expected)}
        </p>
      </div>
      <ul aria-label={t.jours} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-4">
        {status.days.map((day) => (
          <li key={day.index} className="col-span-3 grid grid-cols-subgrid items-center" data-day-state={day.state}>
            <DayBadge day={day.index} size="sm" />
            <MiniLine ready={day.state === "ready"} readyStops={day.readyStops} />
            <DayStateLabel index={day.index} ready={day.state === "ready"} interrupted={showError} />
          </li>
        ))}
      </ul>
      <div role="status" className="sr-only" data-annonces="">
        {announcements.map((message, index) => (
          // Liste qui ne fait que s'allonger : l'index est stable.
          <p key={index}>{message}</p>
        ))}
      </div>
      {/* Relance d'un voyage d'essai : annoncée dès l'appui, région présente dès l'affichage (décision 0125 § 4). */}
      <p role="status" className={enRelance ? "text-corps-s text-ink-soft" : EMPTY_LIVE_REGION_CLASS}>
        {enRelance ? e.relance : null}
      </p>
      <div role="status" className={status.phase === "incomplete" ? undefined : EMPTY_LIVE_REGION_CLASS}>
        {status.phase === "incomplete" ? (
          <StatusBanner kind="noOption" announce={false} message={missingMessage(status.expected - status.ready)} />
        ) : null}
      </div>
      <div role="alert" className={showError ? undefined : EMPTY_LIVE_REGION_CLASS}>
        {showError ? (
          <StatusBanner
            kind="error"
            announce={false}
            message={relance.kind === "echec" ? relance.message : t.interrompue}
            action={
              canRetry ? (
                <Button variant="secondary" size="sm" onClick={retryWithFocus}>
                  {t.reessayer}
                </Button>
              ) : (
                <Button variant="text" size="sm" asChild className="px-0">
                  <Link href={mesVoyagesRoute()}>{t.voirMesVoyages}</Link>
                </Button>
              )
            }
          />
        ) : null}
      </div>
      {ready ? (
        <div className="flex flex-col gap-2">
          <Button asChild>
            <Link href={presentationRoute(tripId)}>{t.voirPropositions}</Link>
          </Button>
          <Button variant="text" asChild>
            <Link href={routes.sejour()}>{t.passer}</Link>
          </Button>
        </div>
      ) : null}
    </CreationShell>
  );
}

/**
 * Mini-ligne d'un jour (0018 § 19), décorative (`aria-hidden`) : terminus carrés `ink` aux extrémités, tracé fin
 * `track-free` tant que le jour n'est pas prêt, anneaux des propositions prêtes (un par `readyStops`, sans numéro ni
 * nom) ; à « Jour {n} prêt », le rail plein `line` se dessine de gauche à droite en 200 ms, par fondu sous
 * `prefers-reduced-motion: reduce` (aucune animation de tracé).
 */
function MiniLine({ ready, readyStops }: { ready: boolean; readyStops: number }) {
  return (
    <span aria-hidden="true" data-mini-ligne="" className="flex min-w-0 flex-1 items-center">
      <Terminus />
      <span className="relative flex h-(--ligne-stop-ensemble) min-w-0 flex-1 items-center">
        <span className="absolute inset-x-0 h-(--ligne-rail-free) bg-track-free" />
        <span
          data-rail-plein=""
          className={cn(
            "absolute inset-x-0 h-(--ligne-rail) origin-left bg-line transition-transform duration-200 ease-out motion-reduce:transition-opacity",
            ready ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0 motion-reduce:scale-x-100",
          )}
        />
        <span className="relative flex w-full items-center justify-evenly">
          {Array.from({ length: readyStops }, (_, index) => (
            <span
              key={index}
              data-anneau=""
              className="size-(--ligne-stop-ensemble) rounded-full border-(length:--ligne-anneau-carte) border-line bg-raised"
            />
          ))}
        </span>
      </span>
      <Terminus />
    </span>
  );
}

/**
 * État d'un jour. La colonne garde la largeur du plus long libellé possible (« Jour {n} prêt » en gras, « En
 * préparation ») : les mini-lignes ne bougent pas quand un jour devient prêt. La réserve passe par des pseudo-éléments
 * invisibles, hors du texte et de l'arbre d'accessibilité.
 */
function DayStateLabel({ index, ready, interrupted }: { index: number; ready: boolean; interrupted: boolean }) {
  const readyLabel = format(t.jourPret, { n: index });
  return (
    <span
      data-largeur-pret={readyLabel}
      data-largeur-attente={t.enPreparation}
      className="grid text-corps-s whitespace-nowrap before:invisible before:font-bold before:content-[attr(data-largeur-pret)] before:[grid-area:1/1] after:invisible after:content-[attr(data-largeur-attente)] after:[grid-area:1/1]"
    >
      <span className={cn("[grid-area:1/1]", ready ? "font-bold text-ink" : "text-ink-soft")}>
        {ready ? readyLabel : interrupted ? t.jourInterrompu : t.enPreparation}
      </span>
    </span>
  );
}

function Terminus() {
  return <span className="size-(--ligne-mini-terminus) shrink-0 rounded-tag bg-ink" />;
}
