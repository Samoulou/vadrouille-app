import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@/components/ligne/Button";
import { DayLine, type DayLineViewItem, type DayLineViewStop } from "@/components/ligne/DayLine";
import { DestinationPlate } from "@/components/ligne/DestinationPlate";
import { IconCoche } from "@/components/ligne/icons";
import { PRODUCT_NAME } from "@/config/site";
import * as messages from "@/i18n/messages";

const t = messages.accueil;
const e = t.exemple.etapes;
const offre = messages.debloquer.offre.inclus;

/**
 * « Ce que tu reçois » : lignes de l'offre affichée sur « Débloquer », reprises telles quelles (une seule source de
 * vérité, contenu de Samuel) ; seules les lignes sans date propre au voyage sont reprises.
 */
const INCLUS = [offre.mealsAndEvenings, offre.events, offre.replacements, offre.checklist, offre.calendarAndSharing] as const;

/**
 * Journée d'exemple de l'accueil (ticket 802, décision 0132) : illustration écrite à la main, destination et secteurs
 * génériques, sans lieu réel nommé ni événement daté (règle d'or 2 du handover frontend), sans donnée Google ; aucune
 * étape n'est un lien ni ne porte d'exception (pas de jaune sur un écran sans action à faire). La ligne est celle du
 * programme (`DayLine`), pour montrer le vrai rendu.
 */
const EXEMPLE: readonly DayLineViewItem<DayLineViewStop>[] = [
  { type: "terminus", role: "start", time: "09:00", label: t.exemple.hotel },
  { type: "segment", segment: { mode: "walk", minutes: 15, estimated: false } },
  {
    type: "stop",
    stop: {
      key: "belvedere",
      name: e.belvedere.nom,
      start: "09:15",
      facts: { durationMinutes: 45, area: e.belvedere.secteur },
      reason: e.belvedere.raison,
      exceptions: [],
    },
  },
  { type: "segment", segment: { mode: "walk", minutes: 20, estimated: false } },
  {
    type: "stop",
    stop: {
      key: "dejeuner",
      name: e.dejeuner.nom,
      start: "12:30",
      facts: { durationMinutes: 60, area: e.dejeuner.secteur },
      exceptions: [],
    },
  },
  { type: "segment", segment: { mode: "transit", minutes: 25, estimated: false } },
  {
    type: "stop",
    stop: {
      key: "jardin",
      name: e.jardin.nom,
      start: "14:30",
      facts: { durationMinutes: 150, area: e.jardin.secteur },
      exceptions: [],
    },
  },
  { type: "segment", segment: { mode: "transit", minutes: 30, estimated: false } },
  {
    type: "stop",
    stop: {
      key: "diner",
      name: e.diner.nom,
      start: "20:00",
      facts: { durationMinutes: 150, area: e.diner.secteur },
      reason: e.diner.raison,
      exceptions: [],
    },
  },
  { type: "terminus", role: "end", time: "23:00", label: t.exemple.hotel },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 border-t border-hairline pt-8">
      <h2 id={id} className="text-section font-extrabold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export interface LandingProps {
  /** Adresse de « Créer un voyage » (écran 1, avec `?site=essai` sur le site d'essai). */
  createHref: string;
  /** Sous le premier bouton : « Mes voyages » (site d'essai). */
  secondary?: ReactNode;
  /** En fin de page : section « Démonstration » (données simulées, spécification D1). */
  footer?: ReactNode;
}

/**
 * Page d'accueil (ticket #802, décision UX 0132) : promesse, bouton « Créer un voyage », journée d'exemple, trois
 * étapes, ce que l'on reçoit, fiabilité, puis le bouton une seconde fois. Composant serveur, aucun JavaScript client.
 * Règles de Ligne : un seul aplat de destination, le bleu pour la ligne et l'action seulement, ni ombre ni emoji.
 */
export function Landing({ createHref, secondary, footer }: LandingProps) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-10 px-5 pt-10 pb-16">
      <header className="flex flex-col gap-4">
        <h1 className="text-destination font-extrabold tracking-(--ligne-destination-approche) text-ink">{PRODUCT_NAME}</h1>
        <p className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.accroche}</p>
        <p className="text-corps text-ink-soft">{messages.produit.promesse}</p>
        <div className="mt-2 flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href={createHref}>{t.creer}</Link>
          </Button>
          <p className="text-center text-corps-s text-ink-soft">{t.offert}</p>
          {secondary}
        </div>
      </header>

      <figure aria-labelledby="exemple-titre" className="flex flex-col gap-4">
        <h2 id="exemple-titre" className="text-section font-extrabold text-ink">
          {t.exemple.titre}
        </h2>
        <DestinationPlate as="p" name={t.exemple.ville} meta={t.exemple.infos} color="azulejo" />
        <div className="rounded-block border border-outline bg-raised px-3 py-4">
          <DayLine items={EXEMPLE} />
        </div>
        <figcaption className="text-legende text-ink-soft">{t.exemple.legende}</figcaption>
      </figure>

      <Section id="etapes-titre" title={t.etapes.titre}>
        <ol role="list" className="flex flex-col gap-5">
          {t.etapes.liste.map((etape, index) => (
            <li key={etape.titre} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3">
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-full border-(length:--ligne-stop-ring) border-ink bg-raised text-corps font-extrabold text-ink tabular-nums"
              >
                {index + 1}
              </span>
              <div className="flex flex-col gap-1">
                <h3 className="text-arret font-bold text-ink">{etape.titre}</h3>
                <p className="text-corps text-ink-soft">{etape.texte}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="inclus-titre" title={t.inclus.titre}>
        <ul role="list" className="flex flex-col">
          {INCLUS.map((ligne) => (
            <li key={ligne} className="flex items-start gap-3 border-b border-hairline py-3 last:border-b-0">
              <IconCoche aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink" />
              <span className="text-corps text-ink">{ligne}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="fiable-titre" title={t.fiable.titre}>
        <p className="text-corps text-ink-soft">{t.fiable.texte}</p>
      </Section>

      <section aria-labelledby="final-titre" className="flex flex-col gap-3 rounded-block bg-muted p-5">
        <h2 id="final-titre" className="text-section font-extrabold text-ink-2">
          {t.final.titre}
        </h2>
        <p className="text-corps text-ink-2">{t.final.texte}</p>
        <Button asChild className="mt-2 w-full">
          <Link href={createHref}>{t.creer}</Link>
        </Button>
      </section>
      {footer}
    </main>
  );
}
