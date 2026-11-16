import { fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { RetainedPreference } from "@/contracts";

import { axeViolations } from "../../../tests/unit/axe";

import { BriefScreen } from "./BriefScreen";
import { DraftProvider, useDraft } from "./DraftProvider";
import { draftReducer, initialDraft, type DraftState } from "./draft";
import { toBrief } from "./validation";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/creation", () => ({ structureBrief: vi.fn() }));

/**
 * Bloc « Tes goûts retenus » de l'écran 2 (M8c-2, ticket 1131 ; spécification M8 § 5.4 et § 6.6, critères 1 à 3 ; textes
 * du § 7). Le bloc reçoit les goûts lus par la page ; ici, passés en propriété.
 */

const EVITER_MUSEES: RetainedPreference = { id: "category:museum:less", origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" } };
const AIMER_DEGUSTATIONS: RetainedPreference = { id: "category:tasting:more", origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" } };
const DISTANCE: RetainedPreference = { id: "distance", origin: "confirmed", subject: { kind: "distance" } };

const LIBELLE_MUSEES = "Tu préfères éviter les musées et monuments";
const LIBELLE_DEGUSTATIONS = "Tu aimes les dégustations";

/** Écran 2 à l'état « Vérification », rempli par la personne (« Remplir moi-même »). */
function review(): DraftState {
  const draft = initialDraft();
  const ready = { ...draft, tripReady: true, trip: { ...draft.trip, destination: "Édimbourg", start: "2026-08-29", end: "2026-09-03", lodging: { answer: "none" as const, label: "" } } };
  return draftReducer(ready, { type: "fillMyself" });
}

let latest: DraftState | null = null;
function Probe() {
  const { state } = useDraft();
  useEffect(() => {
    latest = state;
  });
  return null;
}

function renderScreen(retainedTastes: readonly RetainedPreference[] | undefined, initial: DraftState = review()) {
  return render(
    <DraftProvider initial={initial}>
      <BriefScreen recorder={createMemoryRecorder()} {...(retainedTastes === undefined ? {} : { retainedTastes })} />
      <Probe />
    </DraftProvider>,
  );
}

const bloc = () => screen.getByRole("region", { name: "Tes goûts retenus" });
const choix = (libelle: string) => within(bloc()).getByRole("button", { name: libelle });
const envies = () => screen.getByRole("group", { name: "Envies" });

beforeEach(() => {
  latest = null;
});

describe("BriefScreen : goûts retenus absents", () => {
  it("sans goût lu par la page : aucun bloc, mêmes titres de section qu'aujourd'hui", () => {
    renderScreen(undefined);
    expect(screen.queryByRole("heading", { name: "Tes goûts retenus" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Voyageurs", "Rythme", "Envies", "DéplacementsFacultatif", "À limiterFacultatif", "Budget par repasFacultatif"]);
  });

  it("seul le goût « distance » retenu : aucun bloc (il n'est pas proposé à l'écran 2)", () => {
    renderScreen([DISTANCE]);
    expect(screen.queryByRole("heading", { name: "Tes goûts retenus" })).toBeNull();
  });

  it("à l'état « Récit » : aucun bloc", () => {
    const draft = initialDraft();
    renderScreen([EVITER_MUSEES], { ...draft, tripReady: true, trip: { ...draft.trip, destination: "Édimbourg", start: "2026-08-29", end: "2026-09-03" } });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Raconte ton voyage en quelques phrases");
    expect(screen.queryByRole("heading", { name: "Tes goûts retenus" })).toBeNull();
  });
});

describe("BriefScreen : goûts retenus proposés", () => {
  it("titre, aide et un choix par goût, tous décochés ; rien n'entre dans le brief sans geste ; axe", async () => {
    const { container } = renderScreen([EVITER_MUSEES, AIMER_DEGUSTATIONS, DISTANCE]);
    expect(within(bloc()).getByRole("heading", { level: 2, name: "Tes goûts retenus" })).toBeInTheDocument();
    expect(within(bloc()).getByText("Retenus après tes voyages précédents. Coche ceux qui valent pour ce voyage.")).toBeInTheDocument();
    expect(within(bloc()).getAllByRole("button").map((b) => b.textContent)).toEqual([LIBELLE_MUSEES, LIBELLE_DEGUSTATIONS]);
    for (const bouton of within(bloc()).getAllByRole("button")) {
      expect(bouton).toHaveAttribute("aria-pressed", "false");
      expect(bouton).not.toHaveAttribute("aria-disabled");
    }
    expect(latest?.brief.values.limits).toEqual([]);
    expect(latest?.brief.values.wishes).toEqual([]);
    // Le bloc suit les envies et précède les sections facultatives.
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).slice(2, 4)).toEqual(["Envies", "Tes goûts retenus"]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("cocher « éviter les musées » ajoute museum à limits comme une saisie ; décocher le retire", () => {
    renderScreen([EVITER_MUSEES]);
    fireEvent.click(choix(LIBELLE_MUSEES));
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-pressed", "true");
    expect(choix(LIBELLE_MUSEES)).not.toHaveAttribute("aria-disabled");
    expect(latest?.brief.values.limits).toEqual(["museum"]);
    expect(latest?.brief.marks.limits).toEqual([]);
    expect(toBrief(latest!.brief).limits).toEqual(["museum"]);
    expect(toBrief(latest!.brief).inferredFields).not.toContain("limits");
    // La section repliée « À limiter » résume la valeur ; la `Chip` « Musées » des envies devient indisponible.
    expect(screen.getByRole("button", { name: /À limiter/ })).toHaveTextContent("Musées");
    expect(within(envies()).getByRole("button", { name: "Musées" })).toHaveAttribute("aria-disabled", "true");

    fireEvent.click(choix(LIBELLE_MUSEES));
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-pressed", "false");
    expect(latest?.brief.values.limits).toEqual([]);
    expect(screen.getByRole("button", { name: /À limiter/ })).toHaveTextContent("Facultatif");
  });

  it("cocher « aimer les dégustations » ajoute tasting aux envies ; décocher le retire", () => {
    renderScreen([AIMER_DEGUSTATIONS]);
    fireEvent.click(choix(LIBELLE_DEGUSTATIONS));
    expect(latest?.brief.values.wishes).toEqual(["tasting"]);
    expect(toBrief(latest!.brief).inferredFields).not.toContain("wishes");
    expect(within(envies()).getByRole("button", { name: "Dégustations" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(choix(LIBELLE_DEGUSTATIONS));
    expect(latest?.brief.values.wishes).toEqual([]);
  });

  it("goût déjà vrai dans le brief : coché, indisponible, « Déjà dans ce voyage », sans effet", async () => {
    const { container } = renderScreen([AIMER_DEGUSTATIONS]);
    fireEvent.click(within(envies()).getByRole("button", { name: "Dégustations" }));
    expect(choix(LIBELLE_DEGUSTATIONS)).toHaveAttribute("aria-pressed", "true");
    expect(choix(LIBELLE_DEGUSTATIONS)).toHaveAttribute("aria-disabled", "true");
    expect(choix(LIBELLE_DEGUSTATIONS)).toHaveAccessibleDescription("Déjà dans ce voyage");
    fireEvent.click(choix(LIBELLE_DEGUSTATIONS));
    expect(latest?.brief.values.wishes).toEqual(["tasting"]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("goût contraire au brief : décoché, indisponible, « Contraire à ce voyage », le brief l'emporte", () => {
    renderScreen([EVITER_MUSEES]);
    fireEvent.click(within(envies()).getByRole("button", { name: "Musées" }));
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-pressed", "false");
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-disabled", "true");
    expect(choix(LIBELLE_MUSEES)).toHaveAccessibleDescription("Contraire à ce voyage");
    fireEvent.click(choix(LIBELLE_MUSEES));
    expect(latest?.brief.values.limits).toEqual([]);
    expect(latest?.brief.values.wishes).toEqual(["museum"]);
    // L'envie retirée, le goût redevient libre.
    fireEvent.click(within(envies()).getByRole("button", { name: "Musées" }));
    expect(choix(LIBELLE_MUSEES)).not.toHaveAttribute("aria-disabled");
  });

  it("une valeur déduite du récit et déjà « à limiter » : « Déjà dans ce voyage », la marque « déduit » reste", () => {
    const deduit = draftReducer({ ...review(), stage: "story" }, { type: "inferred", brief: { limits: ["museum"], inferredFields: ["limits"] } });
    renderScreen([EVITER_MUSEES], deduit);
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-pressed", "true");
    expect(choix(LIBELLE_MUSEES)).toHaveAccessibleDescription("Déjà dans ce voyage");
    fireEvent.click(choix(LIBELLE_MUSEES));
    expect(latest?.brief.marks.limits).toEqual(["museum"]);
    expect(toBrief(latest!.brief).inferredFields).toContain("limits");
  });
});
