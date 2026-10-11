import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";

import { SejourOriginProvider, useSejourOrigin, type SejourOrigin } from "./SejourOrigin";

const HREF = "/voyages/mock_trip_edimbourg/jour/2?etape=j2-concert-orgue";

function setup() {
  const captured: { current: SejourOrigin | null } = { current: null };
  function Probe() {
    const origin = useSejourOrigin();
    useEffect(() => {
      captured.current = origin;
    });
    return null;
  }
  render(
    <SejourOriginProvider>
      <Probe />
    </SejourOriginProvider>,
  );
  return () => captured.current!;
}

describe("SejourOrigin : ligne d'origine d'une fiche ouverte depuis le Séjour (F5-PO-8)", () => {
  it("retour par l'historique : l'adresse retenue est rendue une fois", () => {
    const origin = setup();
    origin().remember(HREF);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(origin().take()).toBe(HREF);
    expect(origin().take()).toBeNull();
  });

  it("retour au Séjour sans l'historique (onglet « Séjour ») : rien, et la mémoire est vidée", () => {
    const origin = setup();
    origin().remember(HREF);
    expect(origin().take()).toBeNull();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(origin().take()).toBeNull();
  });

  it("hors du fournisseur : aucune mémoire", () => {
    let value: SejourOrigin | null | undefined;
    function Probe() {
      value = useSejourOrigin();
      return null;
    }
    render(<Probe />);
    expect(value).toBeNull();
  });
});
