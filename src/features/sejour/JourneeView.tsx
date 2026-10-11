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
export function JourneeView() {
  const shell = useTripShell();
  const { day, fiche, etape, routes, closedFiche, consumeClosedFiche, reportMissingEtape } = shell;
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

  if (!day) return null;

  // Lien vers une fiche activé dans le panneau du jour : « Fermer » reviendra dans l'historique.
  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>("a[data-part='arret'], a[data-part='evenement']");
    const href = link?.getAttribute("href");
    if (href) shell.markOpenedFromPanel(href);
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
        />
      ) : (
        <JourneePanel day={day} routes={routes} />
      )}
    </div>
  );
}
