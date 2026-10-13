"use client";

import { useEffect, useRef, type MouseEvent } from "react";

import { messages } from "@/i18n";

import { JourneePanel } from "./JourneePanel";
import { StopSheet } from "./StopSheet";
import { useTripShell } from "./TripShell";

const t = messages.sejour.fiche;

/**
 * Contenu du panneau de l'écran 12 « Journée » : la journée ou, avec `?etape=`, la Fiche étape (écran 13,
 * spécification F5, F5-PO-8). Le jour, le programme (verrous) et la fiche viennent du contexte du voyage :
 * l'état survit aux changements d'adresse. Gère le retour du focus sur le lien d'origine à la fermeture
 * (handover § 7), l'étape absente du jour et le verrou annulable (F5-PO-10).
 */
/** Aucune étape surlignée : la ligne garde son fondu pour la fin du surlignage (0018 § 9). */
const NO_HIGHLIGHT: readonly string[] = [];

export function JourneeView() {
  const shell = useTripShell();
  const { day, fiche, etape, routes, closedFiche, consumeClosedFiche, reportMissingEtape, focusRequest, consumeFocusRequest } = shell;
  const contentRef = useRef<HTMLDivElement>(null);

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
      "a[data-part='arret'], a[data-part='evenement'], a[data-part='remplacer']",
    );
    const href = link?.getAttribute("href");
    if (!href) return;
    // « Remplacer » de la fiche (F7-PO-2) : « Retour à la fiche » de l'écran 14 reviendra dans l'historique.
    if (link?.dataset.part === "remplacer") shell.markReplaceOrigin(href);
    else shell.markOpenedFromPanel(href);
  };

  const onToggleLock = async (locked: boolean) => {
    if (!fiche) return;
    await shell.actions.setStopLocked(fiche.stop.id, locked);
    shell.notifyChange(locked ? t.toastVerrouillee : t.toastDeverrouillee, () => {
      contentRef.current?.querySelector<HTMLButtonElement>("[data-part='verrouiller']")?.focus();
    });
  };

  return (
    <div ref={contentRef} onClickCapture={onClickCapture}>
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
          onToggleLock={onToggleLock}
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
