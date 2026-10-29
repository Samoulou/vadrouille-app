import Link from "next/link";

import { Button } from "@/components/ligne/Button";
import { iconButtonClassName } from "@/components/ligne/IconButton";
import { IconRetour } from "@/components/ligne/icons";
import type { Receipt } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDateLongue } from "@/lib/dates";
import { decalageMinutes } from "@/lib/fuseaux";

import { formatPrice } from "./price";

const t = messages.debloquer.recu;

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
 * Reçu maison `R9-recu` du paiement simulé (B4d ; rendus et textes provisoires, UX/UI et Product Owner) : marqué
 * « simulé » dans le titre et par une mention visible avant les détails ; montant, date, voyage et identifiant public
 * du paiement. Aucune donnée de la personne, aucune donnée de paiement (le simulé n'en demande aucune).
 */
export function ReceiptScreen({ receipt, destination, tripDates, programmeHref }: ReceiptScreenProps) {
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
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
      <p data-part="mention-simule" className="rounded-block bg-muted p-4 text-corps text-ink">
        {t.mention}
      </p>
      <section aria-labelledby="recu-details" className="flex flex-col gap-3">
        <h2 id="recu-details" className="text-section font-extrabold text-ink">
          {t.details}
        </h2>
        <dl className="flex flex-col">
          {lignes.map((ligne) => (
            <div key={ligne.key} data-part={ligne.key} className="flex flex-col gap-0.5 border-b border-hairline py-2.5 last:border-b-0">
              <dt className="text-corps-s text-ink-soft">{ligne.label}</dt>
              <dd className={`text-corps text-ink ${ligne.className ?? ""}`.trim()}>{ligne.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <Button asChild className="w-full">
        <Link href={programmeHref}>{messages.debloquer.offre.voirProgramme}</Link>
      </Button>
    </main>
  );
}
