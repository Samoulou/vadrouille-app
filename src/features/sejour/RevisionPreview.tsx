"use client";

import type { Ref } from "react";

import { Button } from "@/components/ligne/Button";
import { ChangeSet } from "@/components/ligne/ChangeSet";
import { ReasonBlock } from "@/components/ligne/ReasonBlock";
import { StatusBanner } from "@/components/ligne/StatusBanner";
import { Tag } from "@/components/ligne/Tag";
import type { Day, RevisionPreview as RevisionPreviewData, Stop } from "@/contracts";
import { format, messages } from "@/i18n";
import { formatFaits } from "@/lib/faits";
import { cn } from "@/lib/utils";

import { travelBannerMessage } from "./travel";

const t = messages.revision;

/** Titres de niveau 3 en style `bloc` (décision 0018 § 7). */
const BLOC = "text-(length:--ligne-texte-bloc) leading-(--ligne-texte-bloc-interligne) font-extrabold text-ink";

/** Bouton en `aria-disabled` (hors ligne, F7-PO-13) : rendu de l'état désactivé, toujours atteignable au clavier. */
export const ARIA_DISABLED = "aria-disabled:cursor-not-allowed aria-disabled:border-muted aria-disabled:bg-muted aria-disabled:text-ink-soft";

/** Jour du brouillon qui contient l'étape visée (jour affiché après « Appliquer »). */
export function targetDay(preview: RevisionPreviewData): Day | undefined {
  return preview.days.find((day) => day.items.some((item) => item.type === "stop" && item.stop.id === preview.targetStopId));
}

/** Étape d'un brouillon désignée par un changement `unchanged` (nom et heure) : exceptions et verrou à afficher. */
function unchangedStop(days: readonly Day[], label: string, time: string): Stop | undefined {
  for (const day of days) {
    for (const item of day.items) {
      if (item.type === "stop" && item.stop.name === label && item.stop.start === time) return item.stop;
    }
  }
  return undefined;
}

export interface RevisionPreviewProps {
  preview: RevisionPreviewData;
  /** Nom de la proposition (niveau 2) : reçoit le focus à l'affichage (F7-PO-5). */
  proposalTitleRef?: Ref<HTMLHeadingElement>;
  onApply: () => void;
  onCancel: () => void;
  /** Hors ligne : « Appliquer » en `aria-disabled`, décrit par le bandeau (F7-PO-13). */
  disabledBy?: string;
}

/**
 * Aperçu commun des révisions (spécification F7, F7-PO-5 et F7-PO-6 ; rendu de la décision 0018 § 7) : proposition
 * (bloc `raised` à contour `outline`, proposée et pas encore appliquée), bandeau de trajet calculé sur le brouillon,
 * « Ce qui change », « Ce qui ne bouge pas », puis « Appliquer » et « Annuler » dans le flux, en fin de contenu.
 */
export function RevisionPreview({ preview, proposalTitleRef, onApply, onCancel, disabledBy }: RevisionPreviewProps) {
  const day = targetDay(preview);
  const banner = day ? travelBannerMessage(day) : null;
  const unchanged = preview.changes.flatMap((change) => (change.type === "unchanged" ? [change] : []));
  const proposal = preview.kind === "replace" ? preview.proposal : null;
  const faits = proposal ? formatFaits(proposal.facts) : "";

  return (
    <div data-part="apercu" className="flex flex-col gap-6">
      {proposal ? (
        <section
          aria-labelledby="proposition-nom"
          data-part="proposition"
          className="flex flex-col gap-2 rounded-block border border-outline bg-raised p-4"
        >
          <h2 id="proposition-nom" ref={proposalTitleRef} tabIndex={-1} className="text-section font-extrabold text-ink">
            {proposal.name}
          </h2>
          <p data-part="moment" className="text-corps-s text-ink-soft tabular-nums">
            {proposal.end ? format(t.remplacer.moment, { start: proposal.start, end: proposal.end }) : proposal.start}
          </p>
          {faits ? (
            <p data-part="faits" className="text-corps-s text-ink-soft">
              {faits}
            </p>
          ) : null}
          {proposal.exceptions.length > 0 ? (
            <span className="flex flex-wrap gap-2">
              {proposal.exceptions.map((exception) => (
                <Tag key={exception} kind={exception} />
              ))}
            </span>
          ) : null}
          {proposal.reason && proposal.source ? (
            <ReasonBlock text={proposal.reason} sourceLabel={proposal.source.label} sourceUrl={proposal.source.url} verifiedAt={proposal.verifiedAt} />
          ) : null}
        </section>
      ) : null}

      {banner ? <StatusBanner kind="travel" message={banner} /> : null}

      <section aria-labelledby="ce-qui-change" className="flex flex-col gap-3">
        <h3 id="ce-qui-change" tabIndex={-1} className={BLOC}>
          {t.ceQuiChange}
        </h3>
        <ChangeSet changes={preview.changes} />
      </section>

      {unchanged.length > 0 ? (
        <section aria-labelledby="ce-qui-ne-bouge-pas" className="flex flex-col gap-3">
          <h3 id="ce-qui-ne-bouge-pas" className={BLOC}>
            {t.ceQuiNeBougePas}
          </h3>
          <ul data-part="ne-bouge-pas" className="flex flex-col gap-2 text-corps text-ink">
            {unchanged.map((change) => {
              const stop = unchangedStop(preview.days, change.label, change.time);
              return (
                <li key={`${change.time}-${change.label}`} className="flex flex-col items-start gap-1">
                  <span>
                    <span className="font-bold tabular-nums">{change.time}</span> {change.label}
                  </span>
                  {stop?.locked ? <span className="text-legende text-ink-soft">{messages.ligne.verrouillee}</span> : null}
                  {stop && stop.exceptions.length > 0 ? (
                    <span className="flex flex-wrap gap-2">
                      {stop.exceptions.map((exception) => (
                        <Tag key={exception} kind={exception} />
                      ))}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="mt-2 flex flex-col gap-3">
        <Button
          variant="primary"
          className={cn("w-full", ARIA_DISABLED)}
          aria-disabled={disabledBy ? true : undefined}
          aria-describedby={disabledBy}
          data-part="appliquer"
          onClick={() => {
            if (!disabledBy) onApply();
          }}
        >
          {t.appliquer}
        </Button>
        <Button variant="secondary" className="w-full" data-part="annuler-apercu" onClick={onCancel}>
          {t.annuler}
        </Button>
      </div>
    </div>
  );
}
