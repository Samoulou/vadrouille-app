"use client";

import { useRef } from "react";

import { Button } from "@/components/ligne";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import type { Proposal } from "@/contracts";
import { format, messages } from "@/i18n";

const t = messages.presentation;

/** « 2026-08-15 » → « 15.08.2026 » (formats de redaction.md). */
export function formatVerifiedAt(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export interface ProposalDetailSheetProps {
  /** Proposition affichée ; `null` ferme la feuille. */
  proposal: Proposal | null;
  onClose: () => void;
  /** Rend le focus à la carte à la fermeture (handover § 7). */
  onReturnFocus: () => void;
}

/**
 * Détail d'une proposition (F6-PO-12, provisoire UX/UI) : feuille modale en lecture seule ; aucune
 * décision ne s'y prend. Quand `ReasonBlock` existera (F5), le détail l'utilisera.
 */
export function ProposalDetailSheet({ proposal, onClose, onReturnFocus }: ProposalDetailSheetProps) {
  const title = useRef<HTMLHeadingElement>(null);
  const stop = proposal?.stop;
  return (
    <Dialog open={proposal !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      {proposal && stop ? (
        <DialogSheet
          data-sheet="detail"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            title.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onReturnFocus();
          }}
        >
          <div className="flex flex-col gap-1">
            <p className="text-corps-s text-ink-soft tabular-nums">
              {format(t.detail.moment, { day: proposal.day, weekday: proposal.weekday, time: proposal.time })}
            </p>
            <DialogTitle ref={title} tabIndex={-1} className="text-section font-extrabold text-ink">
              {stop.name}
            </DialogTitle>
            <p className="text-corps-s text-ink-soft">{stop.meta}</p>
          </div>
          {stop.reason ? <p className="rounded-block bg-muted px-4 py-3 text-corps text-ink-2">{stop.reason}</p> : null}
          {stop.source ? (
            <p className="text-corps-s text-ink-2">
              {t.detail.source}
              <a href={stop.source.url} className="font-semibold text-ink underline underline-offset-2" rel="noreferrer">
                {stop.source.label}
              </a>
            </p>
          ) : null}
          {stop.verifiedAt ? (
            <p className="text-legende text-ink-soft tabular-nums">
              {format(t.detail.verifie, { date: formatVerifiedAt(stop.verifiedAt) })}
            </p>
          ) : null}
          <DialogClose asChild>
            <Button variant="secondary" className="w-full">
              {t.detail.fermer}
            </Button>
          </DialogClose>
        </DialogSheet>
      ) : null}
    </Dialog>
  );
}
