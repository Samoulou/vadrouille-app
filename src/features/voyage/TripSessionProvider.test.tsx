import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EMPTY_SESSION, recordCheckout, reportCheckout } from "./trip-session";
import { TripSessionProvider, useTripSession, type TripSession } from "./TripSessionProvider";

/** Session de l'onglet, forme minimale de F9a (décision 0020 § 8). */

const A = "a".repeat(22);
const B = "b".repeat(22);

describe("réducteur", () => {
  it("un paiement commencé est rapporté une seule fois", () => {
    const state = recordCheckout(EMPTY_SESSION, "t1", A, "twint");
    const first = reportCheckout(state, "t1", A, "succeeded");
    expect(first.report).toEqual({ checkoutId: A, method: "twint", reported: null });
    expect(reportCheckout(first.state, "t1", A, "succeeded").report).toBeNull();
    expect(reportCheckout(first.state, "t1", A, "failed").report).toBeNull();
  });

  it("paiement inconnu de l'onglet ou d'un autre voyage : rien à rapporter", () => {
    const state = recordCheckout(EMPTY_SESSION, "t1", A, "card");
    expect(reportCheckout(state, "t1", B, "failed").report).toBeNull();
    expect(reportCheckout(state, "t2", A, "failed").report).toBeNull();
  });

  it("duplicate (kind null) : marqué rapporté sans rien mesurer", () => {
    const state = recordCheckout(EMPTY_SESSION, "t1", A, "card");
    const duplicate = reportCheckout(state, "t1", A, null);
    expect(duplicate.report).toBeNull();
    expect(reportCheckout(duplicate.state, "t1", A, "succeeded").report).toBeNull();
  });

  it("pur : l'état précédent n'est pas modifié", () => {
    const state = recordCheckout(EMPTY_SESSION, "t1", A, "card");
    reportCheckout(state, "t1", A, "failed");
    expect(state.get("t1")?.checkouts.get(A)?.reported).toBeNull();
    expect(EMPTY_SESSION.size).toBe(0);
  });
});

describe("TripSessionProvider", () => {
  it("garde les paiements de l'onglet d'un écran à l'autre, rangés par voyage", () => {
    const sessions: Record<string, TripSession> = {};
    function Probe({ tripId, name }: { tripId: string; name: string }) {
      sessions[name] = useTripSession(tripId);
      return null;
    }
    const { rerender } = render(
      <TripSessionProvider>
        <Probe tripId="t1" name="offre" />
      </TripSessionProvider>,
    );
    sessions.offre!.recordCheckout(A, "twint");
    // Autre écran du même voyage, puis d'un autre voyage, sous le même fournisseur.
    rerender(
      <TripSessionProvider>
        <Probe tripId="t1" name="confirmation" />
        <Probe tripId="t2" name="autre" />
      </TripSessionProvider>,
    );
    expect(sessions.autre!.reportCheckout(A, "succeeded")).toBeNull();
    expect(sessions.confirmation!.reportCheckout(A, "succeeded")).toMatchObject({ checkoutId: A, method: "twint" });
    expect(sessions.confirmation!.reportCheckout(A, "succeeded")).toBeNull();
  });

  it("sans fournisseur : session locale, sans erreur", () => {
    let session: TripSession | null = null;
    function Probe() {
      session = useTripSession("t1");
      return null;
    }
    render(<Probe />);
    session!.recordCheckout(A, "card");
    expect(session!.reportCheckout(A, "failed")).toMatchObject({ method: "card" });
  });

  it("aucun stockage navigateur ni cookie", () => {
    function Probe() {
      useTripSession("t1").recordCheckout(A, "card");
      return null;
    }
    render(
      <TripSessionProvider>
        <Probe />
      </TripSessionProvider>,
    );
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });
});
