"use client";

import Link from "next/link";

import { Button } from "@/components/ligne/Button";
import { Counter } from "@/components/ligne/Counter";
import { DestinationPlate } from "@/components/ligne/DestinationPlate";
import type { TripSummary } from "@/contracts";
import { yearOf } from "@/features/voyage/today";
import { useOptionalTripSession } from "@/features/voyage/TripSessionProvider";
import { useClientNow } from "@/features/voyage/use-client-now";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatTripDates } from "@/lib/dates";

import { classifyTrips, reopenTarget, tripToday, type TripSections } from "./trips";

const t = messages.mesVoyages;

export interface TripsScreenProps {
  /** Résumés lus par la page (`listTrips`), sans ordre garanti : le classement est fait ici, après le montage. */
  trips: readonly TripSummary[];
  /**
   * Adresse de l'écran 1 « Créer le voyage », seulement s'il existe (F11-PO-4) : sans elle, aucun lien
   * « Créer un voyage » (aucun lien ne mène à une page 404).
   */
  createHref?: string;
  /**
   * Reçus de la personne (B4d) : identifiant du voyage → adresse de son reçu (`R9-recu`), lue par la page ; un voyage
   * absent de la liste n'a pas de lien « Voir le reçu ».
   */
  receiptHrefs?: Readonly<Record<string, string>>;
  /** Horloge injectable (tests) ; `Date.now` par défaut. Fonction stable. */
  now?: () => number;
  /**
   * Rendu dans une autre page (catalogue des états, décision 0021 § 8) : conteneur `div` au lieu de `main`, et
   * titre de niveau 3, sous le titre de section de cette page (un seul titre de niveau 1 par page).
   */
  embedded?: boolean;
}

type SectionKey = "current" | "upcoming" | "locked" | "past";

const SECTIONS: readonly { key: SectionKey; title: string }[] = [
  { key: "current", title: t.sections.enCours },
  { key: "upcoming", title: t.sections.aVenir },
  { key: "locked", title: t.sections.nonDebloques },
  { key: "past", title: t.sections.passes },
];

/** Ligne de dates et de voyageurs, avec l'année quand le voyage ne commence pas l'année en cours. */
function tripDates(summary: TripSummary, now: number): string {
  return formatTripDates(summary.start, summary.end, summary.travellers, {
    currentYear: yearOf(tripToday(summary, now)),
  });
}

function Title({ embedded }: { embedded: boolean }) {
  const Heading = embedded ? "h3" : "h1";
  return (
    <Heading id="mes-voyages-titre" className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">
      {t.titre}
    </Heading>
  );
}

function TripRow({
  summary,
  section,
  href,
  dates,
  receiptHref,
}: {
  summary: TripSummary;
  section: SectionKey;
  href: string;
  dates: string;
  receiptHref: string | undefined;
}) {
  const mention =
    section === "locked" ? t.mentions.premieresPropositions : section === "past" && !summary.unlocked ? t.mentions.nonDebloque : null;
  // Réservations restantes : seulement « En cours » et « À venir » (F11-PO-2) ; rien à 0.
  const toReserve = section === "current" || section === "upcoming" ? summary.toReserveCount : 0;
  return (
    <li className="border-b border-hairline last:border-b-0" data-trip={summary.id}>
      {/* Espaces entre les parties : nom accessible « destination dates mention réservations ». */}
      <Link href={href} className="flex min-h-(--touch-target) flex-col gap-1 rounded-control py-3">
        <span className="text-arret font-bold text-ink">{summary.destination}</span>{" "}
        <span className="text-corps-s text-ink-soft tabular-nums">{dates}</span>
        {mention ? (
          <>
            {" "}
            <span className="text-legende text-ink-soft">{mention}</span>
          </>
        ) : null}
        {toReserve > 0 ? (
          <>
            {" "}
            <span className="flex items-center gap-2 text-corps-s text-ink">
              <Counter
                value={toReserve}
                label={toReserve === 1 ? t.reservations.un : format(t.reservations.plusieurs, { n: toReserve })}
              />
              {/* Le nombre est dit par le compteur ; la suite visible ne le répète pas. */}
              <span aria-hidden="true">{toReserve === 1 ? t.reservations.suiteUn : t.reservations.suitePlusieurs}</span>
            </span>
          </>
        ) : null}
      </Link>
      {/* Lien à part, jamais dans le lien du voyage (pas de lien imbriqué) ; nom accessible avec la destination. */}
      {receiptHref ? (
        <Button asChild variant="text" size="sm" className="-mt-2 mb-1 px-0">
          <Link href={receiptHref} aria-label={format(t.recuNom, { destination: summary.destination })} data-part="recu">
            {t.recu}
          </Link>
        </Button>
      ) : null}
    </li>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="text-corps-s text-ink-soft">
        {t.chargement}
      </p>
      {/* Squelette immobile de trois lignes (décision 0018, « Attente ») : aucune animation. */}
      <div aria-hidden="true" data-part="squelette" className="flex flex-col gap-3">
        {[0, 1, 2].map((line) => (
          <div key={line} className="h-16 rounded-block bg-muted" />
        ))}
      </div>
    </div>
  );
}

function Sections({
  sections,
  now,
  targetOf,
  receiptHrefs,
}: {
  sections: TripSections;
  now: number;
  targetOf: (summary: TripSummary) => string;
  receiptHrefs: Readonly<Record<string, string>>;
}) {
  return (
    <>
      {sections.featured ? (
        <DestinationPlate
          as="p"
          name={sections.featured.destination}
          meta={tripDates(sections.featured, now)}
          color={sections.featured.destinationColor}
          href={targetOf(sections.featured)}
        />
      ) : null}
      {SECTIONS.map(({ key, title }) => {
        const trips = sections[key];
        if (trips.length === 0) return null;
        const id = `mes-voyages-${key}`;
        return (
          <section key={key} aria-labelledby={id} data-section={key} className="flex flex-col gap-1">
            <h2 id={id} className="text-section font-extrabold text-ink">
              {title}
            </h2>
            <ul className="flex flex-col">
              {trips.map((summary) => (
                <TripRow
                  key={summary.id}
                  summary={summary}
                  section={key}
                  href={targetOf(summary)}
                  dates={tripDates(summary, now)}
                  receiptHref={Object.hasOwn(receiptHrefs, summary.id) ? receiptHrefs[summary.id] : undefined}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/**
 * Écran 17 « Mes voyages » (`R17` ; spécification F11, F11-PO-1 à F11-PO-6) : voyage mis en avant sur la plaque,
 * puis les sections « En cours », « À venir », « Pas encore débloqués » et « Passés ». Le classement se fait dans
 * le navigateur après le montage, à la date de chaque destination : avant, un squelette immobile (jamais une
 * liste classée puis reclassée). Le lien de chaque voyage rouvre au dernier onglet consulté dans l'onglet du
 * navigateur (mémoire du fournisseur, perdue au rechargement). Rendus et textes provisoires (UX/UI, Q154).
 */
const AUCUN_RECU: Readonly<Record<string, string>> = {};

export function TripsScreen({ trips, createHref, receiptHrefs = AUCUN_RECU, now: clock, embedded = false }: TripsScreenProps) {
  const now = useClientNow(clock ? { now: clock } : undefined);
  const memory = useOptionalTripSession();

  let body;
  if (trips.length === 0) {
    // « Aucun voyage » (écran 18) : ni erreur ni état de réseau, donc pas un `StatusBanner`.
    body = (
      <>
        <p className="text-corps text-ink">{t.vide}</p>
        {createHref ? (
          <Button asChild className="w-full">
            <Link href={createHref}>{t.creer}</Link>
          </Button>
        ) : null}
      </>
    );
  } else if (now === null) {
    body = <Loading />;
  } else {
    const targetOf = (summary: TripSummary) => reopenTarget(summary, now, memory?.lastTab(summary.id));
    body = (
      <>
        {createHref ? (
          <div>
            <Button asChild variant="secondary" size="sm">
              <Link href={createHref}>{t.creer}</Link>
            </Button>
          </div>
        ) : null}
        <Sections sections={classifyTrips(trips, now)} now={now} targetOf={targetOf} receiptHrefs={receiptHrefs} />
      </>
    );
  }

  if (embedded) {
    return (
      <div data-part="mes-voyages" className="flex flex-col gap-6 rounded-block border border-hairline p-4">
        <Title embedded />
        {body}
      </div>
    );
  }
  return (
    <main aria-labelledby="mes-voyages-titre" className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10">
      <Title embedded={false} />
      {body}
    </main>
  );
}
