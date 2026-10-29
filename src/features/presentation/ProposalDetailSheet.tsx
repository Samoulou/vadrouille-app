"use client";

import { useRef, useState, type ReactNode } from "react";

import { PlacesAttribution } from "@/components/carte/PlacesAttribution";
import { Button } from "@/components/ligne/Button";
import { PracticalNotes } from "@/components/ligne/PracticalNotes";
import { Dialog, DialogClose, DialogSheet, DialogTitle } from "@/components/ui/dialog";
import type { Proposal, Weekday } from "@/contracts";
import type { PlacePhoto } from "@/contracts/photo";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
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
  /**
   * Jour de la semaine de la proposition, calculé par l'écran depuis la date de son jour (évolution E1 de B2) ;
   * `null` si la date est illisible : la phrase s'écrit alors sans le jour de la semaine.
   */
  weekday: Weekday | null;
  onClose: () => void;
  /** Rend le focus à la carte à la fermeture (handover § 7). */
  onReturnFocus: () => void;
  /**
   * Mention « Données de lieux : Google » dans la feuille (adaptateur `prototype`, spécification P0) : la feuille
   * modale recouvre celle du pied du paquet. Absente par défaut.
   */
  placesFromGoogle?: boolean;
  /**
   * Photo du lieu (site d'essai, décision 0128 ; `api`, décision 0143), la même que celle de la carte : affichée en grand avec l'attribution
   * complète exigée par Google (auteurs, liens vers leur profil, photo sur Google Maps). Absente ou `null` : rien.
   */
  photo?: PlacePhoto | null;
  /** Photo demandée, pas encore arrivée : sa boîte est réservée dès l'ouverture (aucun saut de mise en page). */
  photoEnAttente?: boolean;
}

/**
 * Détail d'une proposition (F6-PO-12, provisoire UX/UI) : feuille modale en lecture seule ; aucune
 * décision ne s'y prend. Quand `ReasonBlock` existera (F5), le détail l'utilisera.
 */
export function ProposalDetailSheet({ proposal, weekday, onClose, onReturnFocus, placesFromGoogle = false, photo = null, photoEnAttente = false }: ProposalDetailSheetProps) {
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
          {photo ? <PhotoDetail photo={photo} /> : photoEnAttente ? <BoitePhoto /> : null}
          <div className="flex flex-col gap-1">
            <p className="text-corps-s text-ink-soft tabular-nums">
              {weekday
                ? format(t.detail.moment, { day: proposal.day, weekday, time: proposal.time })
                : format(t.detail.momentSansJour, { day: proposal.day, time: proposal.time })}
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
          {/* Infos pratiques (décision 0116 § 6) après la source et sa date : elles n'en viennent pas (PPI-PO-5). */}
          <PracticalNotes facts={stop.facts} headingLevel={3} />
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

const LIEN = "font-semibold text-ink underline underline-offset-2";

/** Boîte de la photo du détail (4:3, fond `muted`) : réservée pendant la demande, gardée si l'image échoue. */
function BoitePhoto({ children }: { children?: ReactNode }) {
  return (
    <span data-part="boite-photo" aria-hidden={children ? undefined : true} className="relative block aspect-[4/3] w-full overflow-hidden rounded-block bg-muted">
      {children}
    </span>
  );
}

/** Lien externe du crédit : nouvel onglet, annoncé aux lecteurs d'écran (mineur 10 de la revue du head `8232ddb`). */
function LienExterne({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LIEN}>
      {children}
      <span className="sr-only">{t.detail.nouvelOnglet}</span>
    </a>
  );
}

/**
 * Photo du détail (décision 0128) : « Photo : <auteur> · voir sur Google Maps », chaque auteur lié à son profil s'il est
 * connu, et la photo source sur Google Maps (conditions de Places API : créditer l'auteur, accès à la photo source).
 * Image décorative (`alt=""`, F13) : le titre de la feuille nomme le lieu. Image en échec : la boîte reste, vide, et le
 * crédit disparaît, sans message (aucun saut de mise en page).
 */
function PhotoDetail({ photo }: { photo: PlacePhoto }) {
  const [enEchec, setEnEchec] = useState(false);
  if (enEchec) return <BoitePhoto />;
  return (
    <figure data-part="photo" className="flex flex-col gap-2">
      <BoitePhoto>
        {/* eslint-disable-next-line @next/next/no-img-element -- image de Google servie telle quelle, ni optimisée ni gardée par Next.js (décision 0128) */}
        <img
          src={photo.url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setEnEchec(true)}
          className="absolute inset-0 size-full object-cover"
        />
      </BoitePhoto>
      <figcaption data-part="credit" className="text-legende text-ink-2">
        {t.detail.photoPar}
        {photo.authors.map((author, rang) => (
          <span key={`${rang}-${author.name}`}>
            {rang > 0 ? ", " : null}
            {author.profileUrl ? <LienExterne href={author.profileUrl}>{author.name}</LienExterne> : author.name}
          </span>
        ))}
        {photo.authors.length > 0 ? " · " : null}
        {photo.mapsUrl ? (
          <LienExterne href={photo.mapsUrl}>
            <span translate="no">{t.detail.photoGoogleMaps}</span>
          </LienExterne>
        ) : (
          <span translate="no">{t.detail.photoGoogle}</span>
        )}
      </figcaption>
    </figure>
  );
}
