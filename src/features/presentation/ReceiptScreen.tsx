import Link from "next/link";

import { Button } from "@/components/ligne/Button";
import { iconButtonClassName } from "@/components/ligne/IconButton";
import { IconRetour } from "@/components/ligne/icons";
import type { Receipt } from "@/contracts";
import { recuStripeAdmis } from "@/contracts/values";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";
import { decalageMinutes } from "@/lib/fuseaux";

import { formatPrice } from "./price";

const t = messages.debloquer.recu;
/** Textes de la forme `stripe` (B4e ; provisoires, question 1 de la décision 0144 au Product Owner et à l'UX). */
const ts = messages.debloquer.recuStripe;

/**
 * Fuseau d'affichage de la date du reçu : celui du marché du MVP (Suisse romande, cadrage § 1). Le fuseau de la
 * personne n'est pas connu du serveur ; question au Product Owner (PR de B4d).
 */
export const FUSEAU_RECU = "Europe/Zurich";

/**
 * « 29 octobre 2026 à 14:05 (heure de Zurich) » : instant ISO lu dans `FUSEAU_RECU`, sans dépendre de la langue de l'ICU.
 * Le fuseau est nommé (revue de la PR 884, mineur 3) : écart assumé avec la règle « heure locale de la destination ».
 */
export function formatInstantRecu(iso: string, zone: string = FUSEAU_RECU): string {
  const instant = Date.parse(iso);
  if (Number.isNaN(instant)) return iso;
  const local = new Date(instant + decalageMinutes(zone, instant) * 60_000).toISOString();
  return format(t.dateHeure, { date: formatDateLongue(local.slice(0, 10)), heure: local.slice(11, 16) });
}

export interface ReceiptScreenProps {
  receipt: Receipt;
  destination: string;
  /** Dates du voyage, déjà écrites (« sam. 29.08 – jeu. 03.09 · 2 adultes »). */
  tripDates: string;
  /** Adresse du Séjour (`R11`) : « Retour » et « Voir le programme ». */
  programmeHref: string;
}

/**
 * Reçu `R9-recu` (B4d, B4e ; rendus et textes provisoires, UX/UI et Product Owner), même forme pour ses deux variantes
 * (décision 0144 § 1) : titre, mention en aplat avant les détails, puis voyage, montant, moyen, date et identifiant
 * public du paiement. Aucune donnée de la personne, aucune donnée de paiement.
 * - `simulated` : reçu maison, marqué « simulé » dans le titre et par la mention ;
 * - `stripe` : reçu du paiement de test, avec un lien texte externe vers le reçu de Stripe, **revalidé par
 *   `recuStripeAdmis` avant le `href`** (0144 § 5.3 point 3 ; lien refusé : aucun lien), même onglet (question 3 de 0144
 *   ouverte), `rel="noopener noreferrer"` et `referrerpolicy="no-referrer"`. Ce lien n'apparaît que dans ce HTML.
 */
export function ReceiptScreen({ receipt, destination, tripDates, programmeHref }: ReceiptScreenProps) {
  const textes = receipt.kind === "stripe" ? ts : t;
  const lienStripe = receipt.kind === "stripe" && recuStripeAdmis(receipt.url) ? receipt.url : null;
  const lignes: readonly { key: string; label: string; value: string; className?: string }[] = [
    { key: "voyage", label: t.voyage, value: format(t.voyageValeur, { destination, dates: tripDates }) },
    { key: "montant", label: t.montant, value: formatPrice(receipt.amount, receipt.currency), className: "tabular-nums" },
    { key: "moyen", label: t.moyen, value: t.moyens[receipt.method] },
    { key: "date", label: t.date, value: formatInstantRecu(receipt.paidAt), className: "tabular-nums" },
    { key: "identifiant", label: t.identifiant, value: receipt.checkoutId, className: "break-all" },
  ];
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-3 pb-10" data-receipt={receipt.kind}>
      <Link href={programmeHref} aria-label={messages.debloquer.retour} className={iconButtonClassName("square", "self-start")}>
        <IconRetour />
      </Link>
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{textes.titre}</h1>
      <p data-part={receipt.kind === "stripe" ? "mention-test" : "mention-simule"} className="rounded-block bg-muted p-4 text-corps text-ink">
        {textes.mention}
      </p>
      <section aria-labelledby="recu-details" className="flex flex-col gap-3">
        <h2 id="recu-details" className="text-section font-extrabold text-ink">
          {textes.details}
        </h2>
        <dl className="flex flex-col">
          {lignes.map((ligne) => (
            <div key={ligne.key} data-part={ligne.key} className="flex flex-col gap-0.5 border-b border-hairline py-2.5 last:border-b-0">
              <dt className="text-corps-s text-ink-soft">{ligne.label}</dt>
              <dd className={`text-corps text-ink ${ligne.className ?? ""}`.trim()}>{ligne.value}</dd>
            </div>
          ))}
        </dl>
        {lienStripe === null ? null : (
          <Button asChild variant="text" className="self-start">
            {/* Lien externe : `<a>` simple (jamais `next/link`), sans référent ni accès à cette fenêtre. */}
            <a data-part="lien-recu-stripe" href={lienStripe} rel="noopener noreferrer" referrerPolicy="no-referrer">
              {ts.lien}
            </a>
          </Button>
        )}
      </section>
      <Button asChild className="w-full">
        <Link href={programmeHref}>{messages.debloquer.offre.voirProgramme}</Link>
      </Button>
    </main>
  );
}
