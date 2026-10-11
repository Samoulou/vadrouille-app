import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PresentationPage from "@/app/voyages/[id]/presentation/page";
import { DeckEnd } from "@/features/presentation/DeckEnd";
import type { PresentationScreenProps } from "@/features/presentation/PresentationScreen";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

/** Lien « Débloquer » de la fin de l'aperçu (F9-PO-19, décision 0020 § 5). */

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DeckEnd", () => {
  it("adresse construite par unlockRoutes", () => {
    render(<DeckEnd variant="apercu" tripId="t 1" />);
    expect(screen.getByRole("link", { name: "Débloquer" })).toHaveAttribute("href", "/voyages/t%201/debloquer");
  });

  it("paiement simulé indisponible : ni lien « Débloquer », le reste inchangé", () => {
    render(<DeckEnd variant="apercu" tripId="t1" canUnlock={false} />);
    expect(screen.queryByRole("link", { name: "Débloquer" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Tu as vu tes premières propositions" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", "/voyages/t1");
  });
});

describe("page de la présentation", () => {
  async function propsOf(): Promise<PresentationScreenProps> {
    const element = (await PresentationPage({ params: Promise.resolve({ id: "mock_trip_edimbourg" }) })) as ReactElement<PresentationScreenProps>;
    return element.props;
  }

  it("passe canUnlock = paymentAvailable()", async () => {
    expect((await propsOf()).canUnlock).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEMO_PAYMENT", undefined);
    expect((await propsOf()).canUnlock).toBe(false);
  });
});
