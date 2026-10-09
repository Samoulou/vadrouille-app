import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { CheckoutStatusCode } from "@/contracts/values";
import { TripSessionProvider, useTripSession } from "@/features/voyage/TripSessionProvider";

import { axeViolations } from "../../../tests/unit/axe";

import { PaymentReturn, type GetCheckoutStatus } from "./PaymentReturn";
import { CHECKOUT_POLL_FAST_MS, CHECKOUT_POLL_SLOW_MS, CHECKOUT_POLL_SLOWDOWN_AFTER_MS, CHECKOUT_POLL_STOP_AFTER_MS, nextPollDelay } from "./payment-polling";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/paiement", () => ({
  startCheckout: vi.fn(),
  simulateCheckoutOutcome: vi.fn(),
  getCheckoutStatus: vi.fn(),
}));

/** Confirmation `R9-retour` (F9-PO-8) : rythme d'interrogation par horloge simulée (décision 0020 § 5). */

const TRIP = "mock_trip_edimbourg";
const ID = "c".repeat(22);
const R11 = `/voyages/${TRIP}`;

function statusOf(value: CheckoutStatusCode) {
  return { ok: true as const, value: { checkoutId: ID, tripId: TRIP, method: "twint" as const, status: value, priceVariant: "chf_29" as const, amount: 2900, currency: "CHF" as const } };
}

function Started({ id = ID }: { id?: string }) {
  useTripSession(TRIP).recordCheckout(id, "twint");
  return null;
}

function renderReturn(poll: GetCheckoutStatus, initialStatus: CheckoutStatusCode = "pending", { started = true } = {}) {
  const recorder = createMemoryRecorder();
  const result = render(
    <TripSessionProvider>
      {started ? <Started /> : null}
      <PaymentReturn
        tripId={TRIP}
        checkoutId={ID}
        initialStatus={initialStatus}
        method="twint"
        priceVariant="chf_29"
        successHref={R11}
        presentationHref={`${R11}/presentation`}
        recorder={recorder}
        poll={poll}
        now={() => Date.now()}
      />
    </TripSessionProvider>,
  );
  return { ...result, recorder };
}

beforeEach(() => {
  vi.useFakeTimers();
  router.replace.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("nextPollDelay", () => {
  it("1 s pendant 30 s, puis 5 s, arrêt après 10 min", () => {
    expect(nextPollDelay(0)).toBe(CHECKOUT_POLL_FAST_MS);
    expect(nextPollDelay(CHECKOUT_POLL_SLOWDOWN_AFTER_MS - 1)).toBe(1000);
    expect(nextPollDelay(CHECKOUT_POLL_SLOWDOWN_AFTER_MS)).toBe(CHECKOUT_POLL_SLOW_MS);
    expect(nextPollDelay(CHECKOUT_POLL_STOP_AFTER_MS - 1)).toBe(5000);
    expect(nextPollDelay(CHECKOUT_POLL_STOP_AFTER_MS)).toBeNull();
  });
});

describe("attente", () => {
  it("titre, squelette immobile, attente annoncée ; aucun « Retour »", async () => {
    const poll = vi.fn(async () => statusOf("pending"));
    const { container } = renderReturn(poll as unknown as GetCheckoutStatus);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("On confirme ton paiement");
    expect(screen.getByRole("status")).toHaveTextContent("Confirmation du paiement en cours.");
    expect(container.querySelector("[data-part='squelette']")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(screen.queryByRole("link", { name: "Retour" })).not.toBeInTheDocument();
    vi.useRealTimers();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("rythme : 1 s pendant 30 s, puis 5 s ; jamais deux appels en même temps ; arrêt après 10 min et « Vérifier de nouveau »", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const poll = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return statusOf("pending");
    });
    renderReturn(poll as unknown as GetCheckoutStatus);
    expect(poll).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(poll).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(29_000));
    expect(poll).toHaveBeenCalledTimes(30);
    // Après 30 s : message d'attente longue et lien vers les premières propositions.
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(screen.getByRole("status")).toHaveTextContent(
      "La confirmation prend plus de temps que prévu. Ton voyage sera débloqué dès qu'elle arrivera.",
    );
    expect(screen.getByRole("link", { name: "Voir mes premières propositions" })).toHaveAttribute("href", `${R11}/presentation`);
    // Le 30e appel (à 30 s) programme le suivant 5 s plus tard, à 35 s.
    const at31 = poll.mock.calls.length;
    expect(at31).toBe(30);
    await act(async () => vi.advanceTimersByTimeAsync(3_000));
    expect(poll.mock.calls.length).toBe(at31);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(poll.mock.calls.length).toBe(at31 + 1);
    await act(async () => vi.advanceTimersByTimeAsync(4_000));
    expect(poll.mock.calls.length).toBe(at31 + 1);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(poll.mock.calls.length).toBe(at31 + 2);
    // Jusqu'à 10 min, puis arrêt.
    await act(async () => vi.advanceTimersByTimeAsync(CHECKOUT_POLL_STOP_AFTER_MS));
    const stopped = poll.mock.calls.length;
    expect(screen.getByRole("button", { name: "Vérifier de nouveau" })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(60_000));
    expect(poll.mock.calls.length).toBe(stopped);
    expect(maxInFlight).toBe(1);
    // « Vérifier de nouveau » relance un cycle complet (1 s).
    fireEvent.click(screen.getByRole("button", { name: "Vérifier de nouveau" }));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(poll.mock.calls.length).toBe(stopped + 1);
    expect(screen.queryByRole("button", { name: "Vérifier de nouveau" })).not.toBeInTheDocument();
  });

  it("arrêt au démontage", async () => {
    const poll = vi.fn(async () => statusOf("pending"));
    const { unmount } = renderReturn(poll as unknown as GetCheckoutStatus);
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    const calls = poll.mock.calls.length;
    unmount();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(poll.mock.calls.length).toBe(calls);
  });
});

describe("états finaux", () => {
  it("succeeded : un seul payment_succeeded (paiement commencé dans l'onglet), adresse remplacée par le Séjour", async () => {
    const poll = vi.fn().mockResolvedValueOnce(statusOf("pending")).mockResolvedValue(statusOf("succeeded"));
    const { recorder } = renderReturn(poll as unknown as GetCheckoutStatus);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(router.replace).toHaveBeenCalledWith(R11);
    expect(recorder.events).toEqual([{ name: "payment_succeeded", properties: { method: "twint", price_variant: "chf_29" } }]);
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it("succeeded dès le rendu serveur, après un rechargement (paiement inconnu de l'onglet) : aucun payment_succeeded", async () => {
    const { recorder } = renderReturn(vi.fn() as unknown as GetCheckoutStatus, "succeeded", { started: false });
    expect(router.replace).toHaveBeenCalledWith(R11);
    expect(recorder.events).toEqual([]);
  });

  it("duplicate : cible de réussite, sans payment_succeeded", async () => {
    const { recorder } = renderReturn(vi.fn() as unknown as GetCheckoutStatus, "duplicate");
    expect(router.replace).toHaveBeenCalledWith(R11);
    expect(recorder.events).toEqual([]);
  });

  it.each(["declined", "cancelled", "expired"] as const)("%s : adresse remplacée par l'écran 9 avec le paramètre paiement", (value) => {
    renderReturn(vi.fn() as unknown as GetCheckoutStatus, value);
    expect(router.replace).toHaveBeenCalledWith(`/voyages/${TRIP}/debloquer?paiement=${ID}`);
  });
});
