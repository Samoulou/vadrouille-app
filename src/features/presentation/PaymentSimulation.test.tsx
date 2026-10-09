import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockTripAdapter } from "@/adapters/mock";
import { createMockPaymentAdapter } from "@/adapters/mock-payment";
import { OFFER_INCLUSIONS, type CheckoutStatus } from "@/contracts";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { PaymentSimulation, type SimulateOutcome } from "./PaymentSimulation";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/paiement", () => ({
  startCheckout: vi.fn(),
  simulateCheckoutOutcome: vi.fn(),
  getCheckoutStatus: vi.fn(),
}));

/** Page de paiement simulé `R9-sim` (F9-PO-6). */

const TRIP = "mock_trip_edimbourg";
const ID = "c".repeat(22);
const ctx = { organizationId: MOCK_ORGANIZATION_ID };
const normalize = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

/** Paiement créé par l'adaptateur simulé construit sur une configuration à 3900 (point d'injection de F9-TL-4). */
async function checkoutAt3900(): Promise<CheckoutStatus> {
  const adapter = createMockPaymentAdapter({
    offer: { amount: 3900, currency: "CHF", priceVariant: "chf_29", methods: ["twint", "card"], includes: [...OFFER_INCLUSIONS], accessDaysAfterReturn: 30 },
    trips: createMockTripAdapter(),
    now: () => 0,
    store: { checkouts: new Map(), entitlements: new Map(), confirmationDelayMs: 0 },
    checkoutTtlMs: 1000,
    confirmationDelayMs: 0,
    simulationPath: () => "/x",
  });
  const start = await adapter.createCheckout(ctx, { tripId: TRIP, method: "twint" });
  if (!start.ok) throw new Error();
  const status = await adapter.getCheckoutStatus(ctx, start.value.checkoutId);
  if (!status.ok) throw new Error();
  return status.value;
}

const status = (value: CheckoutStatus["status"]) => ({
  ok: true as const,
  value: { checkoutId: ID, tripId: TRIP, method: "card" as const, status: value, priceVariant: "chf_29" as const, amount: 2900, currency: "CHF" as const },
});

function renderSim(simulate: SimulateOutcome, amount = 2900, method: "twint" | "card" = "card") {
  return render(
    <PaymentSimulation tripId={TRIP} checkoutId={ID} destination="Édimbourg" amount={amount} currency="CHF" method={method} simulate={simulate} />,
  );
}

beforeEach(() => {
  router.replace.mockClear();
});

describe("contenu", () => {
  it("dit qu'il est simulé, récapitulatif, trois boutons, aucun champ de saisie", async () => {
    const { container } = renderSim(vi.fn() as unknown as SimulateOutcome);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Paiement simulé");
    expect(screen.getByText("Démonstration : aucun paiement n'est effectué et aucune donnée de paiement n'est demandée.")).toBeInTheDocument();
    expect(screen.getByText("Voyage : Édimbourg")).toBeInTheDocument();
    expect(normalize(screen.getByText(/^Montant :/).textContent)).toBe("Montant : 29 CHF");
    expect(screen.getByText("Moyen : carte")).toBeInTheDocument();
    expect(screen.getAllByRole("button").map((button) => button.textContent || button.getAttribute("aria-label"))).toEqual([
      "Retour",
      "Simuler un paiement réussi",
      "Simuler un refus",
      "Annuler",
    ]);
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(container.querySelector("img, svg[data-brand]")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("montant de l'adaptateur simulé construit sur une configuration à 3900 : « 39 CHF », « Moyen : TWINT »", async () => {
    const checkout = await checkoutAt3900();
    renderSim(vi.fn() as unknown as SimulateOutcome, checkout.amount, checkout.method);
    expect(normalize(screen.getByText(/^Montant :/).textContent)).toBe("Montant : 39 CHF");
    expect(screen.getByText("Moyen : TWINT")).toBeInTheDocument();
  });
});

describe("issues", () => {
  it.each([
    ["Simuler un paiement réussi", "succeeded", "succeeded", `/voyages/${TRIP}/debloquer/confirmation?paiement=${ID}`],
    ["Simuler un paiement réussi", "succeeded", "pending", `/voyages/${TRIP}/debloquer/confirmation?paiement=${ID}`],
    ["Simuler un paiement réussi", "succeeded", "expired", `/voyages/${TRIP}/debloquer?paiement=${ID}`],
    ["Simuler un refus", "declined", "declined", `/voyages/${TRIP}/debloquer?paiement=${ID}`],
    ["Annuler", "cancelled", "cancelled", `/voyages/${TRIP}/debloquer?paiement=${ID}`],
    ["Retour", "cancelled", "cancelled", `/voyages/${TRIP}/debloquer?paiement=${ID}`],
  ] as const)("« %s » envoie %s ; état %s → %s (adresse remplacée)", async (name, outcome, result, target) => {
    const simulate = vi.fn(async () => status(result));
    renderSim(simulate as unknown as SimulateOutcome);
    await act(async () => fireEvent.click(screen.getByRole("button", { name })));
    expect(simulate).toHaveBeenCalledWith({ checkoutId: ID, outcome });
    expect(router.replace).toHaveBeenCalledWith(target);
  });

  it("erreur : bandeau et « Réessayer », sans navigation", async () => {
    const simulate = vi.fn(async () => ({ ok: false as const, error: { code: "not_found" as const } }));
    renderSim(simulate as unknown as SimulateOutcome);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Simuler un refus" })));
    expect(screen.getByRole("alert")).toHaveTextContent("La simulation n'a pas pu être envoyée.");
    expect(router.replace).not.toHaveBeenCalled();
  });
});
