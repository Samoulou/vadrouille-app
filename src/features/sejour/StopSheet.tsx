"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";

import { Button } from "@/components/ligne/Button";
import { IconButton } from "@/components/ligne/IconButton";
import { IconCroix } from "@/components/ligne/icons";
import { ReasonBlock } from "@/components/ligne/ReasonBlock";
import { Tag } from "@/components/ligne/Tag";
import type { Day } from "@/contracts";
import { messages } from "@/i18n";

import { ficheMoment, type FicheTarget } from "./fiche";
import type { TripRoutes } from "./routes";
import { pathTo, pathToLabel } from "./travel";

const t = messages.sejour.fiche;

export interface StopSheetProps extends FicheTarget {
  day: Day;
  routes: TripRoutes;
  /** « Fermer » et Échap (F5-PO-8). */
  onClose: () => void;
  /** Bascule du verrou (F5-PO-10) ; reçoit la nouvelle valeur. */
  onToggleLock: (locked: boolean) => void;
}

/**
 * Écran 13 « Fiche étape », dans le panneau de la Journée (spécification F5, F5-PO-8 à F5-PO-11 ; rendu
 * provisoire, F5-Q1). Titre de niveau 1 (le titre du jour n'est plus rendu), focus sur ce titre à
 * l'ouverture ; Échap ou « Fermer » ferment la fiche. Un événement de `Day.events` est en lecture seule,
 * signalé comme hors programme, sans action. « Garder » attend la réponse de Samuel (Q67) ; « Déplacer »
 * vient avec F7, « Signaler une erreur » après B11.
 */
export function StopSheet({ stop, inProgramme, day, routes, onClose, onToggleLock }: StopSheetProps) {
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

      {inProgramme ? null : (
        <p data-part="hors-programme" className="text-corps-s text-ink-2">
          {t.evenement}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <p data-part="moment" className="text-corps font-bold text-ink-2 tabular-nums">
          {ficheMoment(day, stop)}
        </p>
        <p data-part="meta" className="text-corps-s text-ink-soft">
          {stop.meta}
        </p>
        {stop.exceptions.length > 0 ? (
          <span className="mt-1 flex flex-wrap gap-2">
            {stop.exceptions.map((exception) => (
              <Tag key={exception} kind={exception} />
            ))}
          </span>
        ) : null}
        {inProgramme && stop.locked ? (
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
      ) : null}

      {inProgramme ? (
        <section aria-label={t.actions} data-part="actions" className="flex flex-wrap gap-3">
          {stop.locked ? null : (
            <Button asChild variant="secondary" size="sm">
              <Link href={routes.remplacer(day.index, stop.id)} data-part="remplacer">
                {t.remplacer}
              </Link>
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            aria-pressed={stop.locked}
            data-part="verrouiller"
            onClick={() => onToggleLock(!stop.locked)}
          >
            {t.verrouiller}
          </Button>
        </section>
      ) : null}
    </div>
  );
}
