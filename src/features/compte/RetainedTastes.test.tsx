import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Result, RetainedTaste, TripSummary } from "@/contracts";
import { useOptionalTripSession, TripSessionProvider } from "@/features/voyage/TripSessionProvider";
import type { ReviewActions } from "@/features/voyage/review-actions";
import * as messages from "@/i18n/messages";

import { axeViolations } from "../../../tests/unit/axe";

import { RetainedTastes, type RetainedTastesProps } from "./RetainedTastes";
import { TripsScreen } from "./TripsScreen";

/**
 * « Tes goûts retenus » de « Mes voyages » (M8c-1, ticket 1121 ; spécification M8 § 5.3, § 6.5 critères 4, 5, 8 et 9, § 7 ;
 * F11-PO-13, C23). Actions injectées ; horloge simulée pour le délai d'annulation de 5 s.
 */

vi.mock("@/server/actions/avis", () => ({ rateStop: vi.fn() }));
vi.mock("@/server/actions/gouts", () => ({ retainTastes: vi.fn(), removeTaste: vi.fn(), restoreTaste: vi.fn(), removeAllTastes: vi.fn() }));

const t = messages.mesVoyages.gouts;

const LISBONNE = "0e000000-0000-4000-8000-0000000000a1";
const MUSEES: RetainedTaste = { id: "category:museum:less", origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" }, fromTripId: LISBONNE };
const DEGUSTATIONS: RetainedTaste = { id: "category:tasting:more", origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" }, fromTripId: LISBONNE };
const DISTANCE: RetainedTaste = { id: "distance", origin: "confirmed", subject: { kind: "distance" }, fromTripId: null };

const LIBELLE_MUSEES = "Tu préfères éviter les musées et monuments";
const LIBELLE_DEGUSTATIONS = "Tu aimes les dégustations";
const LIBELLE_DISTANCE = "Tu préfères rester près de ton hôtel";

const DESTINATIONS = new Map([[LISBONNE, "Lisbonne"]]);

type Actions = NonNullable<RetainedTastesProps["actions"]>;

/** Actions qui réussissent tout de suite, avec la trace des appels ; `echecs` fait échouer les prochains appels d'un nom. */
function actionsImmediates(tastes: readonly RetainedTaste[]) {
  const appels: { nom: keyof Actions; valeur?: unknown }[] = [];
  const echecs = new Map<keyof Actions, Result<never>>();
  const refus = (nom: keyof Actions) => echecs.get(nom);
  const actions: Actions = {
    async removeTaste(tasteId) {
      appels.push({ nom: "removeTaste", valeur: tasteId });
      const taste = tastes.find((candidate) => candidate.id === tasteId);
      return refus("removeTaste") ?? (taste ? { ok: true, value: taste } : { ok: false, error: { code: "not_found" } });
    },
    async restoreTaste(taste) {
      appels.push({ nom: "restoreTaste", valeur: taste });
      return refus("restoreTaste") ?? { ok: true, value: undefined };
    },
    async removeAllTastes() {
      appels.push({ nom: "removeAllTastes" });
      return refus("removeAllTastes") ?? { ok: true, value: undefined };
    },
  };
  return { actions, appels, echecs };
}

function renderTastes(tastes: readonly RetainedTaste[], props: Partial<RetainedTastesProps> = {}) {
  const recorder = createMemoryRecorder();
  const double = actionsImmediates(tastes);
  const view = render(
    <>
      <h1 id="titre-test" tabIndex={-1}>
        Mes voyages
      </h1>
      <RetainedTastes tastes={tastes} destinations={DESTINATIONS} actions={double.actions} focusFallbackId="titre-test" recorder={recorder} {...props} />
    </>,
  );
  return { ...view, recorder, ...double };
}

const section = () => screen.getByRole("region", { name: "Tes goûts retenus" });
const lignes = () =>
  within(section())
    .getAllByRole("listitem")
    .map((li) => li.textContent);
const retirer = (libelle: string) => within(section()).getByRole("button", { name: `Retirer : ${libelle}` });

/** Laisse les promesses des actions se résoudre (horloge simulée). */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Tes goûts retenus : liste (critère 4)", () => {
  it("une ligne par goût, dans l'ordre reçu, « Retenu après {destination} » ; voyage d'origine absent : « Retenu après un voyage »", async () => {
    const { container } = renderTastes([MUSEES, DEGUSTATIONS, DISTANCE]);
    expect(lignes()).toEqual([`${LIBELLE_MUSEES}Retenu après LisbonneRetirer`, `${LIBELLE_DEGUSTATIONS}Retenu après LisbonneRetirer`, `${LIBELLE_DISTANCE}Retenu après un voyageRetirer`]);
    expect(retirer(LIBELLE_MUSEES)).toBeInTheDocument();
    vi.useRealTimers();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("voyage d'origine qui n'est plus dans les résumés : « Retenu après un voyage »", () => {
    renderTastes([{ ...MUSEES, fromTripId: "0e000000-0000-4000-8000-0000000000ff" }]);
    expect(lignes()).toEqual([`${LIBELLE_MUSEES}Retenu après un voyageRetirer`]);
  });

  it("aucun goût : rien n'est rendu, ni section ni région d'annonce", () => {
    const { container } = render(<RetainedTastes tastes={[]} destinations={DESTINATIONS} focusFallbackId="titre-test" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Tes goûts retenus : « Retirer » et « Annuler » (critères 4 et 8)", () => {
  it("« Retirer » : la ligne disparaît après la réponse, toast « Goût retiré. », focus sur le « Retirer » suivant ; mesure à l'expiration des 5 s", async () => {
    const { appels, recorder } = renderTastes([MUSEES, DEGUSTATIONS, DISTANCE]);
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    expect(appels).toEqual([{ nom: "removeTaste", valeur: MUSEES.id }]);
    expect(lignes()).toHaveLength(2);
    expect(within(section()).getByText("Goût retiré.")).toBeInTheDocument();
    expect(retirer(LIBELLE_DEGUSTATIONS)).toHaveFocus();
    expect(recorder.events).toEqual([]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(within(section()).queryByText("Goût retiré.")).toBeNull();
    expect(recorder.events).toEqual([{ name: "taste_removed", properties: { category: "museum", origin: "confirmed" } }]);
  });

  it("dernier de la liste : focus sur le « Retirer » précédent ; goût « distance » mesuré avec category distance", async () => {
    const { recorder } = renderTastes([MUSEES, DISTANCE]);
    fireEvent.click(retirer(LIBELLE_DISTANCE));
    await settle();
    expect(retirer(LIBELLE_MUSEES)).toHaveFocus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(recorder.events).toEqual([{ name: "taste_removed", properties: { category: "distance", origin: "confirmed" } }]);
  });

  it("« Annuler » dans les 5 s : le goût rendu par le retrait est rétabli à l'identique, focus sur son « Retirer », aucune mesure", async () => {
    const { appels, recorder } = renderTastes([MUSEES, DEGUSTATIONS]);
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    fireEvent.click(within(section()).getByRole("button", { name: "Annuler" }));
    await settle();
    expect(appels[1]).toEqual({ nom: "restoreTaste", valeur: MUSEES });
    // Rétabli en fin de liste (nouvel instant d'accord, 0160 § 1.3 point 7).
    expect(lignes()).toEqual([`${LIBELLE_DEGUSTATIONS}Retenu après LisbonneRetirer`, `${LIBELLE_MUSEES}Retenu après LisbonneRetirer`]);
    expect(retirer(LIBELLE_MUSEES)).toHaveFocus();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(recorder.events).toEqual([]);
  });

  it("dernier goût retiré : focus sur le titre « Mes voyages » ; la section disparaît à l'expiration du délai", async () => {
    renderTastes([MUSEES]);
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "Mes voyages" })).toHaveFocus();
    expect(within(section()).getByText("Goût retiré.")).toBeInTheDocument();
    expect(within(section()).queryByRole("button", { name: t.toutRetirer })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.queryByRole("region", { name: "Tes goûts retenus" })).toBeNull();
  });

  it("un second « Retirer » avant l'expiration rend le premier définitif (mesuré) et relance le délai", async () => {
    const { recorder } = renderTastes([MUSEES, DEGUSTATIONS, DISTANCE]);
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    fireEvent.click(retirer(LIBELLE_DEGUSTATIONS));
    await settle();
    expect(recorder.events).toEqual([{ name: "taste_removed", properties: { category: "museum", origin: "confirmed" } }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(recorder.events).toHaveLength(2);
    expect(recorder.events[1]).toEqual({ name: "taste_removed", properties: { category: "tasting", origin: "inferred" } });
  });

  it("erreur de retrait : la ligne reste, message du § 7 et « Réessayer » ; aucun toast, aucune mesure", async () => {
    const { echecs, appels, recorder } = renderTastes([MUSEES, DEGUSTATIONS]);
    echecs.set("removeTaste", { ok: false, error: { code: "internal" } });
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    expect(lignes()).toHaveLength(2);
    expect(within(section()).getByText("Impossible de retirer ce goût pour le moment.")).toBeInTheDocument();
    expect(within(section()).queryByText("Goût retiré.")).toBeNull();
    echecs.clear();
    fireEvent.click(within(section()).getByRole("button", { name: "Réessayer" }));
    await settle();
    expect(appels.map((a) => a.nom)).toEqual(["removeTaste", "removeTaste"]);
    expect(lignes()).toHaveLength(1);
    expect(within(section()).queryByText("Impossible de retirer ce goût pour le moment.")).toBeNull();
    expect(recorder.events).toEqual([]);
  });

  it("goût déjà absent sur le serveur (not_found) : la ligne disparaît sans toast d'annulation", async () => {
    const { echecs } = renderTastes([MUSEES, DEGUSTATIONS]);
    echecs.set("removeTaste", { ok: false, error: { code: "not_found" } });
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    expect(lignes()).toHaveLength(1);
    expect(within(section()).queryByText("Goût retiré.")).toBeNull();
  });

  it("« Annuler » qui échoue : message et « Réessayer » qui rejoue la restauration", async () => {
    const { echecs, appels } = renderTastes([MUSEES, DEGUSTATIONS]);
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    echecs.set("restoreTaste", { ok: false, error: { code: "rate_limited" } });
    fireEvent.click(within(section()).getByRole("button", { name: "Annuler" }));
    await settle();
    expect(within(section()).getByText(t.erreurAnnuler)).toBeInTheDocument();
    expect(lignes()).toHaveLength(1);
    echecs.clear();
    fireEvent.click(within(section()).getByRole("button", { name: "Réessayer" }));
    await settle();
    expect(appels.map((a) => a.nom)).toEqual(["removeTaste", "restoreTaste", "restoreTaste"]);
    expect(lignes()).toHaveLength(2);
  });
});

describe("Tes goûts retenus : « Retirer tous mes goûts » (critère 4)", () => {
  it("confirmation en place, focus sur « Garder » ; « Garder » ne retire rien et rend le focus", async () => {
    const { appels } = renderTastes([MUSEES, DEGUSTATIONS]);
    fireEvent.click(within(section()).getByRole("button", { name: "Retirer tous mes goûts" }));
    const confirmation = within(section()).getByRole("group", { name: "Retirer tous tes goûts retenus ? Ils ne seront plus proposés." });
    expect(within(confirmation).getByRole("button", { name: "Garder" })).toHaveFocus();
    expect(within(confirmation).getByRole("button", { name: "Tout retirer" })).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Garder" }));
    expect(appels).toEqual([]);
    expect(lignes()).toHaveLength(2);
    expect(within(section()).getByRole("button", { name: "Retirer tous mes goûts" })).toHaveFocus();
  });

  it("« Tout retirer » : un appel, plus aucune ligne, annonce, focus sur le titre, une mesure par goût ; pas d'annulation", async () => {
    const { appels, recorder } = renderTastes([MUSEES, DEGUSTATIONS]);
    fireEvent.click(within(section()).getByRole("button", { name: "Retirer tous mes goûts" }));
    fireEvent.click(within(section()).getByRole("button", { name: "Tout retirer" }));
    await settle();
    expect(appels).toEqual([{ nom: "removeAllTastes" }]);
    expect(screen.queryByRole("region", { name: "Tes goûts retenus" })).toBeNull();
    expect(screen.getByText("Tous tes goûts sont retirés.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Annuler" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Mes voyages" })).toHaveFocus();
    expect(recorder.events).toEqual([
      { name: "taste_removed", properties: { category: "museum", origin: "confirmed" } },
      { name: "taste_removed", properties: { category: "tasting", origin: "inferred" } },
    ]);
  });

  it("erreur : les lignes restent, message et « Réessayer »", async () => {
    const { echecs, recorder } = renderTastes([MUSEES, DEGUSTATIONS]);
    echecs.set("removeAllTastes", { ok: false, error: { code: "internal" } });
    fireEvent.click(within(section()).getByRole("button", { name: "Retirer tous mes goûts" }));
    fireEvent.click(within(section()).getByRole("button", { name: "Tout retirer" }));
    await settle();
    expect(lignes()).toHaveLength(2);
    expect(within(section()).getByText(t.erreurToutRetirer)).toBeInTheDocument();
    expect(recorder.events).toEqual([]);
  });
});

describe("Tes goûts retenus : hors ligne (critère 9)", () => {
  it("bandeau, « Retirer » et « Retirer tous mes goûts » en aria-disabled décrits par le bandeau ; aucun appel", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { appels, container } = renderTastes([MUSEES]);
    expect(within(section()).getByText(t.horsLigne)).toBeInTheDocument();
    const bouton = retirer(LIBELLE_MUSEES);
    expect(bouton).toHaveAttribute("aria-disabled", "true");
    expect(bouton).toHaveAttribute("aria-describedby", "gouts-hors-ligne");
    fireEvent.click(bouton);
    const tout = within(section()).getByRole("button", { name: "Retirer tous mes goûts" });
    expect(tout).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(tout);
    await settle();
    expect(appels).toEqual([]);
    expect(within(section()).queryByRole("group")).toBeNull();
    vi.useRealTimers();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("Mes voyages : section des goûts (critère 4 ; F11 C23)", () => {
  const TRIPS: TripSummary[] = [
    {
      id: LISBONNE,
      destination: "Lisbonne",
      destinationColor: "azulejo",
      start: "2026-05-01",
      end: "2026-05-06",
      timeZone: "Europe/Lisbon",
      travellers: { adults: 2, children: 0 },
      unlocked: true,
      toReserveCount: 0,
      dayCount: 6,
    },
  ];
  const now = () => Date.parse("2026-10-09T12:00:00+01:00");

  it("api : la section suit les sections de voyages, avec la destination du résumé ; sans goût, elle n'existe pas", () => {
    const { unmount } = render(<TripsScreen trips={TRIPS} now={now} retainedTastes={[MUSEES]} />);
    const titres = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titres[titres.length - 1]).toBe("Tes goûts retenus");
    expect(lignes()).toEqual([`${LIBELLE_MUSEES}Retenu après LisbonneRetirer`]);
    unmount();
    render(<TripsScreen trips={TRIPS} now={now} retainedTastes={[]} />);
    expect(screen.queryByRole("region", { name: "Tes goûts retenus" })).toBeNull();
  });

  it("aucun voyage dans la liste : les goûts restent listés et retirables (retrait toujours possible)", () => {
    render(<TripsScreen trips={[]} now={now} retainedTastes={[{ ...MUSEES, fromTripId: null }]} />);
    expect(lignes()).toEqual([`${LIBELLE_MUSEES}Retenu après un voyageRetirer`]);
  });

  it("mock : goûts de la mémoire de l'onglet ; retirés de la mémoire par « Retirer », rétablis par « Annuler »", async () => {
    let memoire: ReturnType<typeof useOptionalTripSession> = null;
    function Semis() {
      const memory = useOptionalTripSession();
      memoire = memory;
      if (memory && memory.tastes().length === 0) memory.setTastes([{ ...MUSEES, fromTripId: LISBONNE }]);
      return null;
    }
    render(
      <TripSessionProvider>
        <Semis />
        <TripsScreen trips={TRIPS} now={now} />
      </TripSessionProvider>,
    );
    expect(lignes()).toEqual([`${LIBELLE_MUSEES}Retenu après LisbonneRetirer`]);
    fireEvent.click(retirer(LIBELLE_MUSEES));
    await settle();
    expect(memoire!.tastes()).toEqual([]);
    fireEvent.click(within(section()).getByRole("button", { name: "Annuler" }));
    await settle();
    expect(memoire!.tastes().map((taste) => taste.id)).toEqual([MUSEES.id]);
    expect(lignes()).toHaveLength(1);
  });

  it("hors du fournisseur de l'onglet et sans goûts lus : rien", () => {
    render(<TripsScreen trips={TRIPS} now={now} />);
    expect(screen.queryByRole("region", { name: "Tes goûts retenus" })).toBeNull();
  });
});

/** Les actions injectées ne couvrent que les goûts : type vérifié à la compilation. */
const _typage: Pick<ReviewActions, "removeTaste" | "restoreTaste" | "removeAllTastes"> = actionsImmediates([]).actions;
void _typage;
