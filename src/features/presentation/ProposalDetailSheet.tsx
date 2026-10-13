"use client";

import { useRef } from "react";

import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { Button } from "@/components/ligne/Button";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import type { Proposal, Weekday } from "@/contracts";
import { format, messages } from "@/i18n";
import { formatFaits } from "@/lib/faits";

const t = messages.presentation;

/** « 2026-08-15 » → « 15 août 2026 » : date dans une phrase, comme « 30 août » en titre (redaction.md). */
export function formatVerifiedAt(iso: string): string {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  return `${day} ${t.detail.mois[month - 1]} ${year}`;
}

export interface ProposalDetailSheetProps {
  /** Proposition affichée ; `null` ferme la feuille. */
  proposal: Proposal | null;
  /** Jour de la semaine de la proposition, calculé par l'écran depuis la date de son jour (évolution E1 de B2). */
  weekday: Weekday;
  onClose: () => void;
  /** Rend le focus à la carte à la fermeture (handover § 7). */
  onReturnFocus: () => void;
  /**
   * Mention « Données de lieux : Google » dans la feuille (adaptateur `prototype`, spécification P0) : la feuille
   * modale recouvre celle du pied du paquet. Absente par défaut.
   */
  placesFromGoogle?: boolean;
}

/**
 * Détail d'une proposition (F6-PO-12, provisoire UX/UI) : feuille modale en lecture seule ; aucune
 * décision ne s'y prend. Quand `ReasonBlock` existera (F5), le détail l'utilisera.
 */
export function ProposalDetailSheet({ proposal, weekday, onClose, onReturnFocus, placesFromGoogle = false }: ProposalDetailSheetProps) {
  const title = useRef<HTMLHeadingElement>(null);
  const stop = proposal?.stop;
  const faits = stop ? formatFaits(stop.facts) : "";
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
              {format(t.detail.moment, { day: proposal.day, weekday, time: proposal.time })}
            </p>
            <DialogTitle ref={title} tabIndex={-1} className="text-section font-extrabold text-ink">
              {stop.name}
            </DialogTitle>
            {faits ? <p className="text-corps-s text-ink-soft">{faits}</p> : null}
          </div>
          {stop.reason ? <p className="rounded-block bg-muted px-4 py-3 text-corps text-ink-2">{stop.reason}</p> : null}
          {stop.source ? (
            <p className="text-corps-s text-ink-2">
              {t.detail.source}
              <a
                href={stop.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink underline underline-offset-2"
              >
                {stop.source.label}
              </a>
            </p>
          ) : null}
          {stop.verifiedAt ? (
            <p className="text-legende text-ink-soft tabular-nums">
              {format(t.detail.verifie, { date: formatVerifiedAt(stop.verifiedAt) })}
            </p>
          ) : null}
          <PlacesAttribution placesFromGoogle={placesFromGoogle} />
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
