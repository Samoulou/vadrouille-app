"use client";

import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent } from "react";

import type { RecorderKind } from "@/analytics/track";
import type { StopReportReason } from "@/contracts/values";
import { connexionRoute } from "@/features/compte/suite";
import * as messages from "@/i18n/messages";

import { JourneePanel } from "./JourneePanel";
import { VerrouNonEnregistre } from "./programme";
import { cleEtapeSignalee, proposeRemplacer } from "./signalement";
import { StopSheet } from "./StopSheet";
import { useTripShell } from "./TripShell";

const t = messages.sejour.fiche;

/** Feuille « Déplacer » chargée à la demande : hors du JavaScript initial de la Journée (comme « Partager », 0039). */
const loadMoveSheet = () => import("./MoveSheet");
const MoveSheet = lazy(() => loadMoveSheet().then((loaded) => ({ default: loaded.MoveSheet })));

/** Préchargement au survol ou au focus de « Déplacer » ; un échec est retenté par l'ouverture elle-même. */
function preloadMoveSheet() {
  loadMoveSheet().catch(() => {});
}

/** Feuille « Signaler une erreur » (M5c) chargée à la demande, comme « Déplacer ». */
const loadReportSheet = () => import("./ReportSheet");
const ReportSheet = lazy(() => loadReportSheet().then((loaded) => ({ default: loaded.ReportSheet })));

function preloadReportSheet() {
  loadReportSheet().catch(() => {});
}

/**
 * Contenu du panneau de l'écran 12 « Journée » : la journée ou, avec `?etape=`, la Fiche étape (écran 13,
 * spécification F5, F5-PO-8). Le jour, le programme (verrous) et la fiche viennent du contexte du voyage :
 * l'état survit aux changements d'adresse. Gère le retour du focus sur le lien d'origine à la fermeture
 * (handover § 7), l'étape absente du jour et le verrou annulable (F5-PO-10).
 */
/** Aucune étape surlignée : la ligne garde son fondu pour la fin du surlignage (0018 § 9). */
const NO_HIGHLIGHT: readonly string[] = [];

export function JourneeView({ recorderKind = "none" }: { recorderKind?: RecorderKind } = {}) {
  const shell = useTripShell();
  // Feuille « Déplacer » (F7b) : étape visée, montée au premier usage, ouverte ou fermée sans changer d'adresse.
  const [moving, setMoving] = useState<{ stopId: string; dayIndex: number; open: boolean } | null>(null);
  // Feuille « Signaler une erreur » (M5c) : étape visée, et dernier signalement enregistré (confirmation de la fiche).
  const [reporting, setReporting] = useState<{ stopId: string; dayIndex: number; open: boolean } | null>(null);
  // Identité de l'étape : jour, identifiant et `placeId` (`cleEtapeSignalee`) ; vidé dès que la fiche se ferme ou change.
  const [reported, setReported] = useState<{ cle: string; reason: StopReportReason } | null>(null);
  // Verrou non enregistré (adaptateur `api`, M5a) : message de la fiche, vidé dès que la fiche change.
  const [lockFailure, setLockFailure] = useState<string | null>(null);
  const { day, fiche, etape, routes, closedFiche, consumeClosedFiche, reportMissingEtape, focusRequest, consumeFocusRequest } = shell;
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const ficheCle = day && fiche ? cleEtapeSignalee(day.index, fiche.stop) : null;

  // Confirmation d'un signalement : propre à la fiche affichée. Fermée, ou remplacée par une autre étape (même après un
  // remplacement qui garde l'identifiant), la confirmation disparaît. Ajustement pendant le rendu, sans effet.
  const [ficheVue, setFicheVue] = useState(ficheCle);
  if (ficheVue !== ficheCle) {
    setFicheVue(ficheCle);
    setReported(null);
    setLockFailure(null);
  }

  // `?etape=` absent des étapes et des événements du jour : journée sans fiche, adresse sans le paramètre, annonce.
  const missing = Boolean(day && etape && !fiche);
  useEffect(() => {
    if (missing) reportMissingEtape();
  }, [missing, reportMissingEtape]);

  // Fiche fermée (« Fermer », Échap, retour du navigateur) : focus sur le lien d'origine, étape de la
  // ligne du jour ou ligne de l'événement (handover § 6 et § 7).
  useEffect(() => {
    if (fiche || !day || !closedFiche || closedFiche.dayIndex !== day.index) return;
    const href = routes.etape(day.index, closedFiche.stopId);
    const link = Array.from(contentRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []).find(
      (candidate) => candidate.getAttribute("href") === href,
    );
    link?.focus();
    consumeClosedFiche();
  }, [fiche, day, closedFiche, routes, consumeClosedFiche]);

  // Après « Appliquer » ou « Annuler » d'une modification (F7-PO-1) : lien de l'étape demandée s'il est dans la
  // ligne du jour, sinon titre du jour. Déclaré après le retour de fiche : il passe en dernier.
  useEffect(() => {
    if (fiche || !day || !focusRequest || focusRequest.dayIndex !== day.index) return;
    const href = focusRequest.stopId === undefined ? null : routes.etape(day.index, focusRequest.stopId);
    const link = Array.from(contentRef.current?.querySelectorAll<HTMLAnchorElement>("a[data-part='arret']") ?? []).find(
      (candidate) => candidate.getAttribute("href") === href,
    );
    (link ?? contentRef.current?.querySelector<HTMLElement>("[data-part='titre-jour']"))?.focus();
    consumeFocusRequest();
  }, [fiche, day, focusRequest, routes, consumeFocusRequest]);

  if (!day) return null;

  // Lien vers une fiche activé dans le panneau du jour : « Fermer » reviendra dans l'historique.
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>(
      "a[data-part='arret'], a[data-part='evenement'], a[data-part='remplacer'], a[data-part='signalement-remplacer']",
    );
    const href = link?.getAttribute("href");
    if (!href) return;
    // « Remplacer » de la fiche (F7-PO-2), ou de la confirmation d'un signalement (M5c) : « Retour à la fiche » de
    // l'écran 14 reviendra dans l'historique.
    if (link?.dataset.part === "remplacer" || link?.dataset.part === "signalement-remplacer") shell.markReplaceOrigin(href);
    else shell.markOpenedFromPanel(href);
  };

  const onToggleLock = async (locked: boolean) => {
    if (!fiche) return;
    setLockFailure(null);
    try {
      await shell.actions.setStopLocked(fiche.stop.id, locked);
    } catch (erreur) {
      // Rien n'est affiché : conflit de version (le voyage est relu) ou refus ; le message est annoncé sur la fiche.
      setLockFailure(erreur instanceof VerrouNonEnregistre && erreur.raison === "conflict" ? t.verrouConflit : messages.sejour.echecEnregistrement);
      return;
    }
    shell.notifyChange(locked ? t.toastVerrouillee : t.toastDeverrouillee, () => {
      contentRef.current?.querySelector<HTMLButtonElement>("[data-part='verrouiller']")?.focus();
    });
  };

  // Étape de la feuille « Déplacer » : celle de la fiche ouverte quand la feuille a été ouverte.
  const movingStop =
    moving && fiche && fiche.inProgramme && fiche.stop.id === moving.stopId && moving.dayIndex === day.index ? fiche.stop : null;
  // Étape de la feuille « Signaler une erreur » : celle de la fiche ouverte quand la feuille a été ouverte.
  const reportingStop =
    reporting && fiche && fiche.inProgramme && fiche.stop.id === reporting.stopId && reporting.dayIndex === day.index ? fiche.stop : null;
  // Confirmation (spécification M5 § 5) : « Remplacer cette étape » pour un motif `closed`, étape non verrouillée et voyage débloqué.
  const reportedHere = fiche && reported && reported.cle === ficheCle ? reported : null;
  const reportConfirmation =
    fiche && reportedHere
      ? { replaceHref: proposeRemplacer(reportedHere.reason, fiche.stop, shell.trip.unlocked) ? routes.remplacer(day.index, fiche.stop.id) : null }
      : null;
  const focusReportButton = () => contentRef.current?.querySelector<HTMLButtonElement>("[data-part='signaler']")?.focus();

  return (
    <div ref={contentRef} onClickCapture={onClickCapture}>
      {moving && movingStop ? (
        <Suspense fallback={null}>
          <MoveSheet
            open={moving.open}
            onOpenChange={(open) => setMoving((current) => (current ? { ...current, open } : current))}
            stop={movingStop}
            dayIndex={moving.dayIndex}
            recorderKind={recorderKind}
            onReturnFocus={() => contentRef.current?.querySelector<HTMLButtonElement>("[data-part='deplacer']")?.focus()}
          />
        </Suspense>
      ) : null}
      {reporting && reportingStop ? (
        <Suspense fallback={null}>
          <ReportSheet
            open={reporting.open}
            onOpenChange={(open) => setReporting((current) => (current ? { ...current, open } : current))}
            tripId={shell.trip.id}
            stop={reportingStop}
            onReported={(reason) => setReported({ cle: cleEtapeSignalee(day.index, reportingStop), reason })}
            onReturnFocus={focusReportButton}
            onUnauthenticated={() => router.replace(connexionRoute(routes.etape(day.index, reportingStop.id)))}
          />
        </Suspense>
      ) : null}
      <p role="status" data-part="annonce-etape" className="px-5 text-corps-s text-ink-2">
        {shell.missingNoticeDay === day.index && !fiche ? t.absente : null}
      </p>
      {fiche ? (
        <StopSheet
          key={fiche.stop.id}
          stop={fiche.stop}
          inProgramme={fiche.inProgramme}
          day={day}
          routes={routes}
          onClose={shell.closeFiche}
          {...(shell.lockable ? { onToggleLock } : {})}
          lockFailure={lockFailure}
          commitmentReadOnly={shell.commitmentReadOnly}
          onMove={() => setMoving({ stopId: fiche.stop.id, dayIndex: day.index, open: true })}
          onMoveIntent={preloadMoveSheet}
          {...(shell.reportable
            ? {
                onReport: () => {
                  setReported(null);
                  setReporting({ stopId: fiche.stop.id, dayIndex: day.index, open: true });
                },
                onReportIntent: preloadReportSheet,
              }
            : {})}
          reported={reportConfirmation}
          placesFromGoogle={shell.placesFromGoogle}
        />
      ) : (
        <JourneePanel
          day={day}
          routes={routes}
          placesFromGoogle={shell.placesFromGoogle}
          highlightedStopIds={shell.highlight?.dayIndex === day.index ? shell.highlight.stopIds : NO_HIGHLIGHT}
        />
      )}
    </div>
  );
}
