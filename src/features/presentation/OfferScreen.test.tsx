import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import { createMockTripAdapter } from "@/adapters/mock";
import { createMockPaymentAdapter } from "@/adapters/mock-payment";
import { OFFER_INCLUSIONS, type Offer, type OfferConfig } from "@/contracts";
import { ORIGINE_PRESTATAIRE } from "@/contracts/billing";
import { TripSessionProvider, useTripSession } from "@/features/voyage/TripSessionProvider";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { nouveauRequestId, OfferScreen, type OfferScreenProps, type StartCheckout } from "./OfferScreen";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/paiement", () => ({
  startCheckout: vi.fn(),
  simulateCheckoutOutcome: vi.fn(),
  getCheckoutStatus: vi.fn(),
}));

/** Écran 9 « Débloquer » (F9a). */

const TRIP = "mock_trip_edimbourg";
/** `requestId` tiré par `crypto.randomUUID()` (spécification B4, B4-PO-8). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ctx = { organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" as const };
const BASE: OfferConfig = {
  amount: 2900,
  currency: "CHF",
  priceVariant: "chf_29",
  methods: ["twint", "card"],
  includes: [...OFFER_INCLUSIONS],
  accessDaysAfterReturn: 30,
};

/** Offre lue par l'adaptateur simulé construit sur une configuration injectée (point d'injection de F9-TL-4). */
async function offerFrom(config: Partial<OfferConfig> = {}): Promise<Offer> {
  const adapter = createMockPaymentAdapter({
    offer: { ...BASE, ...config },
    trips: createMockTripAdapter(),
    now: () => 0,
    store: { checkouts: new Map(), entitlements: new Map(), confirmationDelayMs: 0 },
    checkoutTtlMs: 1000,
    confirmationDelayMs: 0,
    simulationPath: () => "/x",
  });
  const result = await adapter.getOffer(ctx, TRIP);
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

const normalize = (text: string | null) => (text ?? "").replace(/[  ]/g, " ");

async function renderOffer(props: Partial<OfferScreenProps> = {}, config: Partial<OfferConfig> = {}) {
  const recorder = createMemoryRecorder();
  const offer = await offerFrom(config);
  const result = render(
    <TripSessionProvider>
      <OfferScreen
        tripId={TRIP}
        destination="Édimbourg"
        destinationColor="bruyere"
        plateMeta="sam. 29.08 – jeu. 03.09 · 2 adultes"
        programmeHref={`/voyages/${TRIP}`}
        offer={{ ...offer, start: "2026-08-29", end: "2026-09-03" }}
        simulated
        recorder={recorder}
        {...props}
      />
    </TripSessionProvider>,
  );
  return { ...result, recorder };
}

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  router.refresh.mockClear();
});

describe("contenu", () => {
  it("titre, plaque (sans titre), prix, inclusions dans l'ordre, boutons, sortie sans payer, mention", async () => {
    const { container, recorder } = await renderOffer();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Débloquer ton voyage");
    expect(screen.queryByRole("heading", { name: "Édimbourg" })).not.toBeInTheDocument();
    expect(screen.getByText("Édimbourg").closest("[data-destination-plate]")).toHaveAttribute("data-destination-plate", "bruyere");
    expect(normalize(container.querySelector("[data-part='prix'] p")!.textContent)).toBe("29 CHF");
    expect(screen.getByText("Paiement unique pour ce voyage, sans abonnement.")).toBeInTheDocument();
    expect(screen.getByText("Démonstration : le paiement est simulé, aucun montant n'est débité.")).toBeInTheDocument();
    const items = within(screen.getByRole("region", { name: "Ce qui est inclus" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Toutes les journées de ton voyage, du 29 août au 3 septembre",
      "Les repas et les soirées",
      "Les événements pendant ton séjour",
      "Des remplacements pour ajuster ton programme",
      "La liste à réserver avant de partir",
      "Le calendrier et le partage avec tes proches",
      "Accès jusqu'au 3 octobre 2026",
    ]);
    const buttons = within(screen.getByRole("group", { name: "Moyens de paiement" })).getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Payer avec TWINT", "Payer par carte"]);
    expect(screen.getByRole("link", { name: "Continuer sans débloquer" })).toHaveAttribute("href", `/voyages/${TRIP}`);
    expect(screen.getByRole("link", { name: "Retour" })).toHaveAttribute("href", `/voyages/${TRIP}`);
    expect(screen.getByText("Tes premières propositions restent accessibles, même sans payer.")).toBeInTheDocument();
    expect(recorder.events).toEqual([{ name: "paywall_viewed", properties: { price_variant: "chf_29" } }]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("offre à 3900 injectée dans l'adaptateur simulé : « 39 CHF »", async () => {
    const { container } = await renderOffer({}, { amount: 3900 });
    expect(normalize(container.querySelector("[data-part='prix'] p")!.textContent)).toBe("39 CHF");
  });

  it("replacementLimit: 10 : « Jusqu'à 10 remplacements pour ajuster ton programme »", async () => {
    await renderOffer({}, { replacementLimit: 10 });
    expect(screen.getByText("Jusqu'à 10 remplacements pour ajuster ton programme")).toBeInTheDocument();
    expect(screen.queryByText("Des remplacements pour ajuster ton programme")).not.toBeInTheDocument();
  });

  it("offre sans calendarAndSharing : ligne absente, les autres dans l'ordre des données", async () => {
    await renderOffer({}, { includes: ["access", "allDays"] });
    const items = within(screen.getByRole("region", { name: "Ce qui est inclus" })).getAllByRole("listitem");
    expect(items.map((item) => item.getAttribute("data-inclusion"))).toEqual(["access", "allDays"]);
    expect(screen.queryByText("Le calendrier et le partage avec tes proches")).not.toBeInTheDocument();
  });

  it("sans mention de simulation hors adaptateur simulé", async () => {
    await renderOffer({ simulated: false });
    expect(screen.queryByText(/le paiement est simulé/)).not.toBeInTheDocument();
  });
});

describe("voyage déjà débloqué", () => {
  it("« Ton voyage est débloqué », plaque, « Voir le programme » seul ; ni prix, ni bouton, ni paywall_viewed", async () => {
    const { container, recorder } = await renderOffer({ offer: null });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Ton voyage est débloqué");
    expect(screen.getByText("Édimbourg")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", `/voyages/${TRIP}`);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/CHF/);
    expect(recorder.events).toEqual([]);
    expect(screen.queryByRole("link", { name: "Voir le reçu" })).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("PR 878 : avec un reçu, « Voir le reçu » vers R9-recu, après « Voir le programme » ; toujours aucun bouton", async () => {
    const href = `/voyages/${TRIP}/debloquer/recu`;
    const { container } = await renderOffer({ offer: null, receiptHref: href });
    const liens = within(screen.getByRole("main")).getAllByRole("link");
    expect(liens.map((lien) => lien.textContent)).toEqual(["", "Voir le programme", "Voir le reçu"]);
    expect(screen.getByRole("link", { name: "Voir le reçu" })).toHaveAttribute("href", href);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("PR 878 : voyage non débloqué : aucun lien de reçu, même si une adresse est passée", async () => {
    await renderOffer({ receiptHref: `/voyages/${TRIP}/debloquer/recu` });
    expect(screen.queryByRole("link", { name: "Voir le reçu" })).not.toBeInTheDocument();
  });
});

describe("paiement", () => {
  it("TWINT : boutons désactivés et « Préparation du paiement… » pendant l'appel, payment_started puis navigation", async () => {
    let resolve: (value: Awaited<ReturnType<StartCheckout>>) => void = () => {};
    const start = vi.fn(() => new Promise<Awaited<ReturnType<StartCheckout>>>((r) => (resolve = r)));
    const { recorder } = await renderOffer({ start: start as unknown as StartCheckout });
    fireEvent.click(screen.getByRole("button", { name: "Payer avec TWINT" }));
    expect(start).toHaveBeenCalledWith({ tripId: TRIP, method: "twint", requestId: expect.stringMatching(UUID) });
    expect(screen.getByRole("button", { name: "Payer avec TWINT" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Payer par carte" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Préparation du paiement…");
    // Texte d'attente visible (décision 0018, « Attente »), pas seulement annoncé.
    expect(screen.getByRole("status")).not.toHaveClass("sr-only");
    expect(screen.getByRole("status")).toHaveClass("text-corps-s", "text-ink-soft");
    await act(async () => resolve({ ok: true, value: { checkoutId: "c".repeat(22), redirectUrl: "/voyages/x/debloquer/paiement-simule/c" } }));
    expect(recorder.events.at(-1)).toEqual({ name: "payment_started", properties: { method: "twint", price_variant: "chf_29" } });
    expect(router.push).toHaveBeenCalledWith("/voyages/x/debloquer/paiement-simule/c");
  });

  // B4c (PR 863 ; décision 0140 § 4, dernier paragraphe) : l'adresse absolue du prestataire est passée telle quelle au
  // routeur, qui fait pour une adresse externe une navigation complète (Next 16.4.1 : `completeHardNavigation`, puis
  // `location.assign`).
  it("carte (stripe) : adresse absolue du prestataire passée telle quelle au routeur", async () => {
    const adresse = `${ORIGINE_PRESTATAIRE}/c/pay/cs_test_a1#fidabc`;
    const start = vi.fn(async () => ({ ok: true as const, value: { checkoutId: "c".repeat(22), redirectUrl: adresse } }));
    await renderOffer({ start: start as unknown as StartCheckout });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Payer par carte" })));
    expect(router.push).toHaveBeenCalledWith(adresse);
  });

  it("erreur : bandeau « Le paiement n'a pas pu commencer. » avec « Réessayer », focus sur le bouton appuyé", async () => {
    const start = vi.fn(async () => ({ ok: false as const, error: { code: "not_found" as const } }));
    await renderOffer({ start: start as unknown as StartCheckout });
    const card = screen.getByRole("button", { name: "Payer par carte" });
    card.focus();
    await act(async () => fireEvent.click(card));
    await act(async () => new Promise<void>((r) => requestAnimationFrame(() => r())));
    expect(screen.getByRole("alert")).toHaveTextContent("Le paiement n'a pas pu commencer.");
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(card).toBeEnabled();
    expect(card).toHaveFocus();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("debloquer: requestId tiré par appui et réutilisé par Réessayer", async () => {
    // Spécification B4, critère A23 (B4-PO-8) : textes et rendu inchangés, seule l'entrée de `startCheckout` change.
    const start = vi.fn<(input: { tripId: string; method: string; requestId: string }) => Promise<unknown>>(async () => ({
      ok: false as const,
      error: { code: "provider_error" as const, retryable: true },
    }));
    await renderOffer({ start: start as unknown as StartCheckout });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Payer avec TWINT" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Payer par carte" })));
    const [premier, second] = start.mock.calls.map(([input]) => input);
    expect(premier?.requestId).toMatch(UUID);
    expect(second?.requestId).toMatch(UUID);
    expect(second?.requestId).not.toBe(premier?.requestId);
    // « Réessayer » renvoie le `requestId` de l'appui en échec (le second), avec le même moyen.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Réessayer" })));
    expect(start.mock.calls.at(-1)?.[0]).toEqual({ tripId: TRIP, method: "card", requestId: second?.requestId });
    // Un nouvel appui sur un bouton de paiement après l'erreur en tire un nouveau.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Payer par carte" })));
    const dernier = start.mock.calls.at(-1)?.[0];
    expect(dernier?.requestId).toMatch(UUID);
    expect([premier?.requestId, second?.requestId]).not.toContain(dernier?.requestId);
    expect(screen.getByRole("alert")).toHaveTextContent("Le paiement n'a pas pu commencer.");
  });

  it("requestId hors contexte sécurisé (sans crypto.randomUUID) : uuid v4 tiré de getRandomValues, distinct à chaque appel", () => {
    const reel = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: (tableau: Uint8Array<ArrayBuffer>) => reel.getRandomValues(tableau) });
    try {
      const a = nouveauRequestId();
      const b = nouveauRequestId();
      expect(a).toMatch(UUID);
      expect(b).toMatch(UUID);
      expect(a).not.toBe(b);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("already_unlocked : l'écran est relu (état « déjà débloqué »)", async () => {
    const start = vi.fn(async () => ({ ok: false as const, error: { code: "already_unlocked" as const } }));
    await renderOffer({ start: start as unknown as StartCheckout });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Payer avec TWINT" })));
    expect(router.refresh).toHaveBeenCalled();
  });
});

describe("retour après un échec", () => {
  it.each([
    ["declined", "Le paiement n'a pas abouti. Aucun montant n'a été débité."],
    ["cancelled", "Paiement annulé."],
    ["expired", "Ce paiement a expiré. Tu peux recommencer."],
  ] as const)("%s : bandeau role=alert, boutons disponibles", async (reason, text) => {
    await renderOffer({ failure: { reason, checkoutId: "c".repeat(22), priceVariant: "chf_29" } });
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("button", { name: "Payer avec TWINT" })).toBeEnabled();
  });

  it("payment_failed seulement pour un paiement commencé dans cet onglet, une seule fois", async () => {
    const id = "d".repeat(22);
    const recorder = createMemoryRecorder();
    const offer = { ...(await offerFrom()), start: "2026-08-29", end: "2026-09-03" };
    function Started() {
      const session = useTripSession(TRIP);
      session.recordCheckout(id, "card");
      return null;
    }
    const screenFor = (checkoutId: string) => (
      <OfferScreen
        tripId={TRIP}
        destination="Édimbourg"
        destinationColor="bruyere"
        plateMeta="m"
        programmeHref="/p"
        offer={offer}
        failure={{ reason: "declined", checkoutId, priceVariant: "chf_29" }}
        recorder={recorder}
      />
    );
    const { rerender } = render(
      <TripSessionProvider>
        <Started />
        {screenFor(id)}
      </TripSessionProvider>,
    );
    expect(recorder.events.filter((event) => event.name === "payment_failed")).toEqual([
      { name: "payment_failed", properties: { method: "card", price_variant: "chf_29", reason: "declined" } },
    ]);
    // Paiement d'un autre onglet (inconnu de la session) : aucun payment_failed.
    rerender(
      <TripSessionProvider>
        <div key="autre">{screenFor("e".repeat(22))}</div>
      </TripSessionProvider>,
    );
    expect(recorder.events.filter((event) => event.name === "payment_failed")).toHaveLength(1);
  });
});
