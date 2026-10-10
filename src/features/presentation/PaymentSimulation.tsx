"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, IconButton, StatusBanner } from "@/components/ligne";
import { IconRetour } from "@/components/ligne/icons";
import type { CheckoutOutcome, Currency, PaymentMethod } from "@/contracts/values";
import { isCheckoutFailure } from "@/contracts/values";
import { format, messages } from "@/i18n";
import { simulateCheckoutOutcome } from "@/server/actions/paiement";

import { formatPrice } from "./price";
import { unlockRoutes } from "./routes";

const t = messages.debloquer.simule;

export type SimulateOutcome = typeof simulateCheckoutOutcome;

export interface PaymentSimulationProps {
  tripId: string;
  checkoutId: string;
  destination: string;
  /** Instantané du prix pris à la création du paiement (décision 0020 § 1.3). */
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  /** Action injectée (tests). */
  simulate?: SimulateOutcome;
}

/**
 * Page de paiement simulé `R9-sim` (F9-PO-6 ; rendus et textes provisoires, UX/UI) : interne, dite simulée,
 * **sans aucun champ de saisie** ni marque de prestataire. Chaque bouton joue le rôle du webhook du
 * prestataire, puis remplace l'adresse : réussite (ou attente) → confirmation ; refus, annulation ou
 * expiration → écran 9 avec le paramètre `paiement`. « Retour » vaut « Annuler ».
 */
export function PaymentSimulation({ tripId, checkoutId, destination, amount, currency, method, simulate = simulateCheckoutOutcome }: PaymentSimulationProps) {
  const router = useRouter();
  const routes = unlockRoutes(tripId);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<CheckoutOutcome | null>(null);

  async function send(outcome: CheckoutOutcome) {
    if (pending) return;
    setPending(true);
    setFailed(null);
    let result: Awaited<ReturnType<SimulateOutcome>> | null = null;
    try {
      result = await simulate({ checkoutId, outcome });
    } catch {
      result = null;
    }
    if (result?.ok) {
      router.replace(isCheckoutFailure(result.value.status) ? routes.debloquer(checkoutId) : routes.confirmation(checkoutId));
      return;
    }
    setPending(false);
    setFailed(outcome);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-3 pb-10">
      <IconButton icon={<IconRetour />} label={messages.debloquer.retour} className="self-start" disabled={pending} onClick={() => void send("cancelled")} />
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
      <p className="text-corps text-ink-2">{t.mention}</p>
      <ul aria-label={t.recapitulatif} data-part="recapitulatif" className="flex flex-col gap-1 rounded-block bg-muted p-4 text-corps text-ink">
        <li>{format(t.voyage, { destination })}</li>
        <li className="tabular-nums">{format(t.montant, { prix: formatPrice(amount, currency) })}</li>
        <li>{t.moyen[method]}</li>
      </ul>
      {failed ? (
        <StatusBanner
          kind="error"
          message={t.erreur}
          action={
            <Button variant="text" size="sm" onClick={() => void send(failed)}>
              {t.reessayer}
            </Button>
          }
        />
      ) : null}
      <div className="flex flex-col gap-3">
        <Button className="w-full" disabled={pending} onClick={() => void send("succeeded")}>
          {t.reussi}
        </Button>
        <Button variant="secondary" className="w-full" disabled={pending} onClick={() => void send("declined")}>
          {t.refus}
        </Button>
        <Button variant="text" className="self-center" disabled={pending} onClick={() => void send("cancelled")}>
          {t.annuler}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {pending ? t.envoi : ""}
      </p>
    </main>
  );
}
