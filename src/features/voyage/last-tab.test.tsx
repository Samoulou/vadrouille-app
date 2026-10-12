import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EMPTY_SESSION, lastTabOf, recordCheckout, recordLastTab } from "./trip-session";
import { TripSessionProvider, useOptionalTripSession, useTripSession, type TabMemory } from "./TripSessionProvider";

/** Dernier onglet consulté (F11a, décision 0021 § 4). */

describe("réducteur : dernier onglet", () => {
  it("enregistre le Séjour puis la Journée n, par voyage", () => {
    let state = recordLastTab(EMPTY_SESSION, "t1", { kind: "sejour" });
    expect(lastTabOf(state, "t1")).toEqual({ kind: "sejour" });
    state = recordLastTab(state, "t1", { kind: "jour", n: 3 });
    expect(lastTabOf(state, "t1")).toEqual({ kind: "jour", n: 3 });
    expect(lastTabOf(state, "t2")).toBeUndefined();
  });

  it("même onglet : état inchangé (même référence) ; pur", () => {
    const state = recordLastTab(EMPTY_SESSION, "t1", { kind: "jour", n: 2 });
    expect(recordLastTab(state, "t1", { kind: "jour", n: 2 })).toBe(state);
    expect(recordLastTab(state, "t1", { kind: "jour", n: 3 })).not.toBe(state);
    expect(lastTabOf(state, "t1")).toEqual({ kind: "jour", n: 2 });
    expect(EMPTY_SESSION.size).toBe(0);
  });

  it("garde les paiements du voyage (F9a) ; les paiements gardent le dernier onglet", () => {
    let state = recordCheckout(EMPTY_SESSION, "t1", "a".repeat(22), "twint");
    state = recordLastTab(state, "t1", { kind: "sejour" });
    expect(state.get("t1")?.checkouts.size).toBe(1);
    state = recordCheckout(state, "t1", "b".repeat(22), "card");
    expect(lastTabOf(state, "t1")).toEqual({ kind: "sejour" });
  });
});

describe("useOptionalTripSession", () => {
  it("null hors du fournisseur : rien n'est enregistré", () => {
    let memory: TabMemory | null = {} as TabMemory;
    function Probe() {
      memory = useOptionalTripSession();
      return null;
    }
    render(<Probe />);
    expect(memory).toBeNull();
  });

  it("dans le fournisseur : mémoire partagée par les écrans de l'onglet, rangée par voyage, sans stockage", () => {
    const memories: Record<string, TabMemory | null> = {};
    function Probe({ name }: { name: string }) {
      memories[name] = useOptionalTripSession();
      // La session de paiement de F9a reste disponible à côté.
      useTripSession("t1");
      return null;
    }
    const { rerender } = render(
      <TripSessionProvider>
        <Probe name="a" />
      </TripSessionProvider>,
    );
    memories.a?.recordLastTab("t1", { kind: "jour", n: 3 });
    memories.a?.recordLastTab("t2", { kind: "sejour" });
    rerender(
      <TripSessionProvider>
        <Probe name="b" />
      </TripSessionProvider>,
    );
    expect(memories.b?.lastTab("t1")).toEqual({ kind: "jour", n: 3 });
    expect(memories.b?.lastTab("t2")).toEqual({ kind: "sejour" });
    expect(memories.b?.lastTab("t3")).toBeUndefined();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("perdue avec le fournisseur (rechargement)", () => {
    let memory: TabMemory | null = null;
    function Probe() {
      memory = useOptionalTripSession();
      return null;
    }
    const first = render(
      <TripSessionProvider>
        <Probe />
      </TripSessionProvider>,
    );
    memory!.recordLastTab("t1", { kind: "sejour" });
    first.unmount();
    render(
      <TripSessionProvider>
        <Probe />
      </TripSessionProvider>,
    );
    expect(memory!.lastTab("t1")).toBeUndefined();
  });
});
