"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnalyticsProvider, useTrack } from "@/analytics/context";
import { recorderFor, type EventRecorder, type RecorderKind } from "@/analytics/track";
import { Button } from "@/components/ligne";
import type { CheckoutStatusCode, PaymentMethod, PriceVariant } from "@/contracts/values";
import { isCheckoutFailure } from "@/contracts/values";
import { useTripSession } from "@/features/voyage/TripSessionProvider";
import { messages } from "@/i18n";
import { getCheckoutStatus } from "@/server/actions/paiement";

import { CHECKOUT_POLL_SLOWDOWN_AFTER_MS, nextPollDelay } from "./payment-polling";
import { unlockRoutes } from "./routes";

const t = messages.debloquer.confirmation;

export type GetCheckoutStatus = typeof getCheckoutStatus;

export interface PaymentReturnProps {
  tripId: string;
  checkoutId: string;
  /** État lu par la page côté serveur. */
  initialStatus: CheckoutStatusCode;
  method: PaymentMethod;
  priceVariant: PriceVariant;
  /** Cible de réussite : `R11` (Séjour) en F9a, `R10` à partir de F9b (F9-PO-18). */
  successHref: string;
  /** Lien de l'attente longue : `R6`, les premières propositions. */
  presentationHref: string;
  recorderKind?: RecorderKind;
  recorder?: EventRecorder;
  /** Action et horloge injectées (tests). */
  poll?: GetCheckoutStatus;
  now?: () => number;
}

/** Confirmation `R9-retour` (F9-PO-8 ; rendus et textes provisoires, UX/UI). */
export function PaymentReturn({ recorderKind = "none", recorder, ...props }: PaymentReturnProps) {
  const chosen = useMemo(() => recorder ?? recorderFor(recorderKind), [recorder, recorderKind]);
  return (
    <AnalyticsProvider recorder={chosen}>
      <Confirmation {...props} />
    </AnalyticsProvider>
  );
}

type Phase = "waiting" | "long" | "stopped";

const defaultNow = () => performance.now();

function Confirmation({
  tripId,
  checkoutId,
  initialStatus,
  method,
  priceVariant,
  successHref,
  presentationHref,
  poll = getCheckoutStatus,
  now = defaultNow,
}: Omit<PaymentReturnProps, "recorder" | "recorderKind">) {
  const router = useRouter();
  const track = useTrack();
  const session = useTripSession(tripId);
  const [status, setStatus] = useState<CheckoutStatusCode>(initialStatus);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [cycle, setCycle] = useState(0);
  const done = useRef(false);

  // État final : mesure (une fois, pour un paiement commencé dans cet onglet) puis remplacement de l'adresse.
  useEffect(() => {
    if (status === "pending" || done.current) return;
    done.current = true;
    if (status === "succeeded" || status === "duplicate") {
      const report = session.reportCheckout(checkoutId, status === "succeeded" ? "succeeded" : null);
      if (report) track({ name: "payment_succeeded", properties: { method, price_variant: priceVariant } });
      router.replace(successHref);
    } else if (isCheckoutFailure(status)) {
      router.replace(unlockRoutes(tripId).debloquer(checkoutId));
    }
  }, [status, session, checkoutId, method, priceVariant, track, router, successHref, tripId]);

  // Interrogation : chaîne de `setTimeout` relancée à la réponse, jamais deux appels en même temps.
  useEffect(() => {
    if (status !== "pending") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = now();
    const schedule = () => {
      const elapsed = now() - startedAt;
      if (elapsed >= CHECKOUT_POLL_SLOWDOWN_AFTER_MS) setPhase((current) => (current === "waiting" ? "long" : current));
      const delay = nextPollDelay(elapsed);
      if (delay === null) {
        setPhase("stopped");
        return;
      }
      timer = setTimeout(async () => {
        let next: CheckoutStatusCode | null = null;
        try {
          const result = await poll({ checkoutId });
          next = result.ok ? result.value.status : null;
        } catch {
          next = null;
        }
        if (cancelled) return;
        if (next && next !== "pending") {
          setStatus(next);
          return;
        }
        schedule();
      }, delay);
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [status, cycle, poll, checkoutId, now]);

  const retry = useCallback(() => {
    setPhase("long");
    setCycle((value) => value + 1);
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-16 pb-10" data-phase={phase}>
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
      <div aria-hidden="true" data-part="squelette" className="flex flex-col gap-3">
        <div className="h-24 rounded-block bg-muted" />
        <div className="h-5 w-2/3 rounded-block bg-muted" />
        <div className="h-5 w-1/2 rounded-block bg-muted" />
      </div>
      <p role="status" className="text-corps-s text-ink-soft">
        {phase === "waiting" ? t.attente : t.attenteLongue}
      </p>
      {phase !== "waiting" ? (
        <div className="flex flex-col items-start gap-3">
          {phase === "stopped" ? (
            <Button variant="secondary" className="w-full" onClick={retry}>
              {t.verifier}
            </Button>
          ) : null}
          <Button asChild variant="text" className="self-center">
            <Link href={presentationHref}>{t.propositions}</Link>
          </Button>
        </div>
      ) : null}
    </main>
  );
}
