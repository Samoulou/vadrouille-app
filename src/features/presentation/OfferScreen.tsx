"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { AnalyticsProvider, useTrack } from "@/analytics/context";
import { recorderFor, type EventRecorder, type RecorderKind } from "@/analytics/track";
import { Button, DestinationPlate, StatusBanner, iconButtonClassName } from "@/components/ligne";
import { IconRetour } from "@/components/ligne/icons";
import type { Offer, Trip } from "@/contracts";
import type { CheckoutFailure, OfferInclusion, PaymentMethod, PriceVariant } from "@/contracts/values";
import { formatDateLongue } from "@/lib/dates";
import { format, messages } from "@/i18n";
import { startCheckout } from "@/server/actions/paiement";
import { useTripSession } from "@/features/voyage/TripSessionProvider";

import { accessUntil, formatPrice } from "./price";

const t = messages.debloquer;

/** Échec désigné par le paramètre `paiement`, déjà résolu côté serveur (F9-PO-20, décision 0020 § 11). */
export interface OfferFailure {
  reason: CheckoutFailure;
  /** Identifiant validé par la page, seulement pour retrouver un paiement commencé dans cet onglet. */
  checkoutId: string;
  priceVariant: PriceVariant;
}

export type StartCheckout = typeof startCheckout;

export interface OfferScreenProps {
  tripId: string;
  destination: string;
  destinationColor: Trip["destinationColor"];
  /** Ligne de la plaque : « sam. 29.08 – jeu. 03.09 · 2 adultes ». */
  plateMeta: string;
  /** Adresse du Séjour (`R11`) : « Retour », « Continuer sans débloquer » et « Voir le programme ». */
  programmeHref: string;
  /** Voyage non débloqué : offre lue par l'adaptateur de paiement ; débloqué : `null` (F9-PO-9). */
  offer: (Offer & { start: string; end: string }) | null;
  failure?: OfferFailure | null;
  /** Mention permanente de simulation (adaptateur de paiement simulé). */
  simulated?: boolean;
  recorderKind?: RecorderKind;
  recorder?: EventRecorder;
  /** Action injectée (tests). */
  start?: StartCheckout;
}

/** Écran 9 « Débloquer » (spécification F9a ; rendus et textes provisoires, UX/UI, F9-Q1). */
export function OfferScreen({ recorderKind = "none", recorder, ...props }: OfferScreenProps) {
  const chosen = useMemo(() => recorder ?? recorderFor(recorderKind), [recorder, recorderKind]);
  return (
    <AnalyticsProvider recorder={chosen}>
      <OfferContent {...props} />
    </AnalyticsProvider>
  );
}

function inclusionText(code: OfferInclusion, offer: NonNullable<OfferScreenProps["offer"]>): string {
  switch (code) {
    case "allDays":
      return format(t.offre.inclus.allDays, { debut: jourMois(offer.start), fin: jourMois(offer.end) });
    case "replacements":
      return offer.replacementLimit === undefined
        ? t.offre.inclus.replacements
        : format(t.offre.remplacementsLimite, { n: offer.replacementLimit });
    case "access":
      return format(t.offre.inclus.access, { date: formatDateLongue(accessUntil(offer.end, offer.accessDaysAfterReturn)) });
    default:
      return t.offre.inclus[code];
  }
}

/** « 29 août » : date dans une phrase, sans l'année (redaction.md). */
function jourMois(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  const name = month ? messages.ligne.dates.mois[month - 1] : undefined;
  return name && day ? format(t.offre.jourMois, { day, month: name }) : iso;
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label={t.retour}
      className={iconButtonClassName("square", "self-start")}
    >
      <IconRetour />
    </Link>
  );
}

function OfferContent({
  tripId,
  destination,
  destinationColor,
  plateMeta,
  programmeHref,
  offer,
  failure = null,
  simulated = false,
  start = startCheckout,
}: Omit<OfferScreenProps, "recorder" | "recorderKind">) {
  const track = useTrack();
  const router = useRouter();
  const session = useTripSession(tripId);
  const [pending, setPending] = useState<PaymentMethod | null>(null);
  const [startError, setStartError] = useState<PaymentMethod | null>(null);
  const buttons = useRef<Partial<Record<PaymentMethod, HTMLButtonElement | null>>>({});
  const viewed = useRef(false);

  const priceVariant = offer?.priceVariant;
  useEffect(() => {
    if (!priceVariant || viewed.current) return;
    viewed.current = true;
    track({ name: "paywall_viewed", properties: { price_variant: priceVariant } });
    if (failure) {
      const report = session.reportCheckout(failure.checkoutId, "failed");
      if (report) {
        track({
          name: "payment_failed",
          properties: { method: report.method, price_variant: failure.priceVariant, reason: failure.reason },
        });
      }
    }
  }, [priceVariant, failure, session, track]);

  async function pay(method: PaymentMethod) {
    if (pending || !offer) return;
    setPending(method);
    setStartError(null);
    let result: Awaited<ReturnType<StartCheckout>> | null = null;
    try {
      result = await start({ tripId, method });
    } catch {
      result = null;
    }
    if (result?.ok) {
      session.recordCheckout(result.value.checkoutId, method);
      track({ name: "payment_started", properties: { method, price_variant: offer.priceVariant } });
      router.push(result.value.redirectUrl);
      return;
    }
    setPending(null);
    if (result && !result.ok && result.error.code === "already_unlocked") {
      router.refresh();
      return;
    }
    setStartError(method);
    // Focus inchangé : le bouton appuyé le garde (il a pu le perdre pendant qu'il était désactivé).
    requestAnimationFrame(() => buttons.current[method]?.focus());
  }

  if (!offer) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-3 pb-10">
        <BackLink href={programmeHref} />
        <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.offre.titreDebloque}</h1>
        <DestinationPlate as="p" name={destination} meta={plateMeta} color={destinationColor} />
        <div className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href={programmeHref}>{t.offre.voirProgramme}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const price = formatPrice(offer.amount, offer.currency);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-3 pb-10">
      <BackLink href={programmeHref} />
      {failure ? <StatusBanner kind="error" message={t.offre.echec[failure.reason]} /> : null}
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.offre.titre}</h1>
      <DestinationPlate as="p" name={destination} meta={plateMeta} color={destinationColor} />
      <div className="flex flex-col gap-1" data-part="prix">
        <p className="text-montant font-extrabold tabular-nums text-ink">{price}</p>
        <p className="text-corps text-ink-2">{t.offre.paiementUnique}</p>
        {simulated ? <p className="text-corps-s text-ink-soft">{t.offre.simulation}</p> : null}
      </div>
      {offer.includes.length > 0 ? (
        <section aria-labelledby="inclus-titre" className="flex flex-col gap-3">
          <h2 id="inclus-titre" className="text-section font-extrabold text-ink">
            {t.offre.inclusTitre}
          </h2>
          <ul className="flex flex-col">
            {offer.includes.map((code) => (
              <li key={code} data-inclusion={code} className="border-b border-hairline py-2.5 text-corps text-ink last:border-b-0">
                {inclusionText(code, offer)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {startError ? (
        <StatusBanner
          kind="error"
          message={t.offre.erreurDebut}
          action={
            <Button variant="text" size="sm" onClick={() => void pay(startError)}>
              {t.offre.reessayer}
            </Button>
          }
        />
      ) : null}
      <div role="group" aria-label={t.offre.paiements} className="flex flex-col gap-3">
        {offer.methods.map((method, index) => (
          <Button
            key={method}
            ref={(element) => {
              buttons.current[method] = element;
            }}
            variant={index === 0 ? "primary" : "secondary"}
            className="w-full"
            disabled={pending !== null}
            onClick={() => void pay(method)}
          >
            {t.offre.payer[method]}
          </Button>
        ))}
      </div>
      {/* Texte d'attente visible et annoncé (décision 0018, « Attente ») ; la région existe avant l'annonce. */}
      <p role="status" className="text-corps-s text-ink-soft">
        {pending ? t.offre.preparation : ""}
      </p>
      <div className="flex flex-col items-center gap-2 text-center">
        <Button asChild variant="text">
          <Link href={programmeHref}>{t.offre.sansDebloquer}</Link>
        </Button>
        <p className="text-corps-s text-ink-soft">{t.offre.restentAccessibles}</p>
      </div>
    </main>
  );
}
