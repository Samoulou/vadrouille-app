"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { Button } from "@/components/ligne/Button";
import { IconButton } from "@/components/ligne/IconButton";
import { IconCroix } from "@/components/ligne/icons";
import { DateConsultation, LienSource } from "@/components/ligne/LienSource";
import { PracticalNotes } from "@/components/ligne/PracticalNotes";
import { ReasonBlock } from "@/components/ligne/ReasonBlock";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { Tag } from "@/components/ligne/Tag";
import type { Day } from "@/contracts";
import { EMPTY_LIVE_REGION_CLASS } from "@/features/creation/fields";
import * as messages from "@/i18n/messages";
import { formatFaits } from "@/lib/faits";

import { PLACES_FROM_GOOGLE } from "./constants";
import { ficheMoment, type FicheTarget } from "./fiche";
import type { TripRoutes } from "./routes";
import { etapeSignalableSurFiche } from "./signalement";
import { pathTo, pathToLabel } from "./travel";

const t = messages.sejour.fiche;

/** Refus d'un verrou affiché sur la fiche : conflit de version, ou tout autre refus ou panne. */
export type LockFailure = { kind: "conflict" | "error"; message: string };

export interface StopSheetProps extends FicheTarget {
  day: Day;
  routes: TripRoutes;
  /** « Fermer » et Échap (F5-PO-8). */
  onClose: () => void;
  /**
   * Bascule du verrou (F5-PO-10) ; reçoit la nouvelle valeur. Sans fonction, pas de bouton « Verrouiller » (adaptateur
   * `api` : voyage non débloqué, M5-PO-1).
   */
  onToggleLock?: (locked: boolean) => void;
  /**
   * Verrou non enregistré (adaptateur `api`, M5a) : bandeau d'état de Ligne (`StatusBanner`, `conflict` ou `error`) annoncé
   * par la région `role="alert"` sous les actions, ou `null`. La région existe dès l'ouverture de la fiche quand le bouton
   * « Verrouiller » est là.
   */
  lockFailure?: LockFailure | null;
  /**
   * Engagement en lecture seule (adaptateur `api`, M5a ; spécification M5 § 3, M5-PO-3) : toute fiche à `commitment`, dans
   * le programme ou non, affiche « Déjà réservé : cette étape ne bouge pas. » sans « Verrouiller », « Déplacer » ni
   * « Remplacer ». Faux par défaut : `mock` inchangé.
   */
  commitmentReadOnly?: boolean;
  /** « Déplacer » (F7-PO-15) : ouvre la feuille « Déplacer » ; sans fonction, pas de bouton. */
  onMove?: () => void;
  /** Préchargement de la feuille « Déplacer » au survol ou au focus du bouton. */
  onMoveIntent?: () => void;
  /**
   * « Signaler une erreur » (M5c ; spécification M5 § 5) : ouvre la feuille du signalement ; sans fonction, pas de bouton.
   * Jamais pour un événement, un engagement ni un lieu à soi (`etapeSignalable`).
   */
  onReport?: () => void;
  /** Préchargement de la feuille du signalement au survol ou au focus du bouton. */
  onReportIntent?: () => void;
  /**
   * Signalement enregistré pour cette étape : « Merci, c'est noté. » (`role="status"`), et, pour un motif `closed` sur une
   * étape non verrouillée d'un voyage débloqué, le lien « Remplacer cette étape » (`replaceHref`) ; `null` sinon.
   */
  reported?: { replaceHref: string | null } | null;
  /**
   * Mention « Données de lieux : Google » en fin de fiche (adaptateur `prototype`, spécification P0) : la fiche
   * remplace le panneau du jour et recouvre en grande partie la carte. `PLACES_FROM_GOOGLE` par défaut.
   */
  placesFromGoogle?: boolean;
}

/**
 * Écran 13 « Fiche étape », dans le panneau de la Journée (spécification F5, F5-PO-8 à F5-PO-11 ; rendu
 * provisoire, F5-Q1). Titre de niveau 1 (le titre du jour n'est plus rendu), focus sur ce titre à
 * l'ouverture ; Échap ou « Fermer » ferment la fiche. Un événement de `Day.events` est en lecture seule,
 * signalé comme hors programme, sans action. « Garder » attend la réponse de Samuel (Q67) ; « Déplacer » (F7b)
 * suit « Remplacer », absent pour une étape verrouillée ; « Signaler une erreur » (M5c) vient après les autres actions, sur
 * toute étape du programme sauf un engagement ou un lieu à soi, sa confirmation juste après. Sur `api` (M5a), une fiche à
 * engagement est en lecture seule : « Déjà réservé », aucune action (`commitmentReadOnly`).
 */
export function StopSheet({
  stop,
  inProgramme,
  day,
  routes,
  onClose,
  onToggleLock,
  lockFailure = null,
  commitmentReadOnly = false,
  onMove,
  onMoveIntent,
  onReport,
  onReportIntent,
  reported = null,
  placesFromGoogle = PLACES_FROM_GOOGLE,
}: StopSheetProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Ouverture : focus sur le titre de la fiche (handover § 7), à chaque nouvelle étape.
  useEffect(() => {
    titleRef.current?.focus();
  }, [stop.id]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  const path = inProgramme ? pathTo(day.items, stop.id) : null;
  const titleId = `fiche-${stop.id}`;
  const faits = formatFaits(stop.facts);
  // Ni engagement, ni lieu à soi (`etapeSignalableSurFiche`, équivalente à la règle du serveur) ; le serveur la refait.
  const reportable = inProgramme && onReport !== undefined && etapeSignalableSurFiche(stop);
  // Engagement sur `api` : déjà réservé, jamais verrouillé, déplacé ni remplacé (M5-PO-3) ; le serveur refuse aussi.
  const dejaReserve = commitmentReadOnly && stop.commitment !== undefined;
  const actionsDuProgramme = inProgramme && !dejaReserve;

  return (
    <div data-part="fiche" data-stop-id={stop.id} onKeyDown={onKeyDown} className="flex flex-col gap-4 px-5 pt-2 pb-8">
      <header className="flex items-start justify-between gap-3">
        <h1
          ref={titleRef}
          id={titleId}
          tabIndex={-1}
          className="min-w-0 text-titre-fiche font-extrabold tracking-(--ligne-titre-jour-approche) text-ink"
        >
          {stop.name}
        </h1>
        <IconButton icon={<IconCroix />} label={t.fermer} onClick={onClose} data-part="fermer" />
      </header>

      {dejaReserve ? (
        <p data-part="deja-reserve" className="text-corps-s text-ink-2">
          {t.dejaReserve}
        </p>
      ) : inProgramme ? null : (
        <p data-part="hors-programme" className="text-corps-s text-ink-2">
          {t.evenement}
        </p>
      )}
      {/* Lieu à soi (décision 0147 § 6.1, M5d-2) : marque stockée dans l'instantané, jamais dans la vue partagée. */}
      {stop.addedBy === "person" ? (
        <p data-part="ajoute-par-toi" className="text-corps-s text-ink-2">
          {t.ajouteParToi}
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <p data-part="moment" className="text-corps font-bold text-ink-2 tabular-nums">
          {ficheMoment(day, stop)}
        </p>
        {faits ? (
          <p data-part="faits" className="text-corps-s text-ink-soft">
            {faits}
          </p>
        ) : null}
        {stop.exceptions.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-2">
            {stop.exceptions.map((exception) => (
              <Tag key={exception} kind={exception} />
            ))}
          </span>
        ) : null}
        {actionsDuProgramme && stop.locked ? (
          <p data-part="verrou" className="text-legende text-ink-soft">
            {t.verrou}
          </p>
        ) : null}
      </div>

      {path ? (
        <section aria-labelledby={`${titleId}-pour-y-aller`} data-part="pour-y-aller" className="flex flex-col gap-1">
          <h2 id={`${titleId}-pour-y-aller`} className="text-corps-s font-bold text-ink-2">
            {t.pourYAller}
          </h2>
          <p className="text-corps text-ink">{pathToLabel(path)}</p>
        </section>
      ) : null}

      {stop.reason && stop.source ? (
        <ReasonBlock text={stop.reason} sourceLabel={stop.source.label} sourceUrl={stop.source.url} verifiedAt={stop.verifiedAt} />
      ) : stop.reason ? (
        <p data-part="raison-simple" className="text-corps text-ink">
          {stop.reason}
        </p>
      ) : stop.source ? (
        // Ticket 800 : le site vérifié s'affiche aussi sans raison (lien seul ; date seulement si `verifiedAt` existe,
        // jamais pour un site du prototype, PPI-PO-8).
        <section aria-labelledby={`${titleId}-site`} data-part="site" className="flex flex-col gap-1">
          <h2 id={`${titleId}-site`} className="text-corps-s font-bold text-ink-2">
            {t.siteOfficiel}
          </h2>
          <LienSource href={stop.source.url} nouvelOnglet={messages.presentation.detail.nouvelOnglet}>
            {stop.source.label}
          </LienSource>
          <DateConsultation verifiedAt={stop.verifiedAt} />
        </section>
      ) : null}

      <PracticalNotes facts={stop.facts} />

      {actionsDuProgramme ? (
        <section aria-label={t.actions} data-part="actions" className="flex flex-wrap gap-3">
          {stop.locked ? null : (
            <Button asChild variant="secondary" size="sm">
              <Link href={routes.remplacer(day.index, stop.id)} data-part="remplacer">
                {t.remplacer}
              </Link>
            </Button>
          )}
          {stop.locked || !onMove ? null : (
            <Button
              variant="secondary"
              size="sm"
              aria-haspopup="dialog"
              data-part="deplacer"
              onClick={onMove}
              onPointerEnter={onMoveIntent}
              onFocus={onMoveIntent}
            >
              {t.deplacer}
            </Button>
          )}
          {onToggleLock ? (
            <Button
              variant="secondary"
              size="sm"
              aria-pressed={stop.locked}
              data-part="verrouiller"
              onClick={() => onToggleLock(!stop.locked)}
            >
              {t.verrouiller}
            </Button>
          ) : null}
          {reportable ? (
            <Button
              variant="secondary"
              size="sm"
              aria-haspopup="dialog"
              data-part="signaler"
              onClick={onReport}
              onPointerEnter={onReportIntent}
              onFocus={onReportIntent}
            >
              {t.signaler}
            </Button>
          ) : null}
        </section>
      ) : null}

      {actionsDuProgramme && onToggleLock ? (
        <div role="alert" data-part="verrou-echec" className={lockFailure ? undefined : EMPTY_LIVE_REGION_CLASS}>
          {lockFailure ? <StatusBanner kind={lockFailure.kind} message={lockFailure.message} announce={false} /> : null}
        </div>
      ) : null}

      {reportable ? (
        <div data-part="signalement" className={reported ? "flex flex-col items-start gap-2" : undefined}>
          {/* Région présente dès l'ouverture de la fiche : la confirmation y est annoncée sans déplacer le focus. */}
          <p role="status" data-part="confirmation-signalement" className={reported ? "text-corps text-ink" : EMPTY_LIVE_REGION_CLASS}>
            {reported ? messages.sejour.signaler.merci : null}
          </p>
          {reported?.replaceHref ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={reported.replaceHref} data-part="signalement-remplacer">
                {messages.sejour.signaler.remplacer}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <PlacesAttribution placesFromGoogle={placesFromGoogle} />
    </div>
  );
}
