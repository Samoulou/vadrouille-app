import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Result, RetainedPreference, RetainedTaste, TripReview } from "@/contracts";
import * as messages from "@/i18n/messages";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { projectReviewTrip } from "./review";
import type { ReviewActions } from "./review-actions";
import { ReviewScreen, type ReviewScreenProps } from "./ReviewScreen";
import { TripSessionProvider } from "./TripSessionProvider";

/**
 * « Retenir mes goûts » de l'écran 16 (M8c-1, ticket 1121 ; spécification M8 § 5.1, § 5.2, § 6.5 critères 2, 3, 7, 8 et 9,
 * § 7 ; F11 C22). Rendu par `ReviewScreen`, actions injectées.
 */

vi.mock("@/server/actions/avis", () => ({ rateStop: vi.fn() }));
vi.mock("@/server/actions/gouts", () => ({ retainTastes: vi.fn(), removeTaste: vi.fn(), restoreTaste: vi.fn(), removeAllTastes: vi.fn() }));

const t = messages.apres.gouts;
const TRIP = projectReviewTrip(edimbourgDebloque);

const EVITER_MUSEES: RetainedPreference = { id: "category:museum:less", origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" } };
const AIMER_DEGUSTATIONS: RetainedPreference = { id: "category:tasting:more", origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" } };
const CANDIDATS = [EVITER_MUSEES, AIMER_DEGUSTATIONS];

const LIBELLE_MUSEES = "Tu préfères éviter les musées et monuments";
const LIBELLE_DEGUSTATIONS = "Tu aimes les dégustations";

const review = (extra: Partial<TripReview> = {}): TripReview => ({ tripId: TRIP.id, access: "open", reviews: [], tasteCandidates: CANDIDATS, retainedIds: [], ...extra });

type Retenue = { resolve: (value: Result<RetainedTaste[]>) => void; tripId: string; ids: readonly string[] };

function actionsDeGouts() {
  const calls: Retenue[] = [];
  const refus = async () => ({ ok: false as const, error: { code: "internal" as const } });
  const actions: ReviewActions = {
    rateStop: refus,
    removeTaste: refus,
    restoreTaste: refus,
    removeAllTastes: refus,
    retainTastes: (tripId, ids) =>
      new Promise((resolve) => {
        calls.push({ resolve, tripId, ids });
      }),
  };
  return { actions, calls };
}

const retenus = (...candidats: RetainedPreference[]): Result<RetainedTaste[]> => ({ ok: true, value: candidats.map((c) => ({ ...c, fromTripId: TRIP.id })) });

function renderScreen(props: Partial<ReviewScreenProps> = {}) {
  const recorder = createMemoryRecorder();
  const view = render(<ReviewScreen trip={TRIP} review={review()} mode="server" recorder={recorder} {...props} />);
  return { ...view, recorder };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const section = () => screen.getByRole("region", { name: t.titre });
const choix = (name: string) => within(section()).getByRole("button", { name });
const retenir = () => within(section()).getByRole("button", { name: t.retenir });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Retenir mes goûts : accord explicite (critère 2)", () => {
  it("texte d'accord, un choix par candidat, tous décochés ; origine sous chaque libellé ; le déduit en pointillé, « déduit » dans son nom", async () => {
    const { container } = renderScreen();
    expect(within(section()).getByText(t.accord)).toBeInTheDocument();
    expect(t.accord).toContain("sans les appliquer d'office");
    expect(t.accord).toContain("Tu peux les retirer à tout moment dans Mes voyages.");
    const musees = choix(LIBELLE_MUSEES);
    const degustations = choix(`${LIBELLE_DEGUSTATIONS}, déduit`);
    expect(musees).toHaveAttribute("aria-pressed", "false");
    expect(degustations).toHaveAttribute("aria-pressed", "false");
    expect(degustations).toHaveAttribute("data-inferred", "true");
    expect(degustations).toHaveTextContent(LIBELLE_DEGUSTATIONS);
    expect(musees).not.toHaveAttribute("data-inferred");
    expect(within(section()).getByText("Confirmé par toi pendant la présentation")).toBeInTheDocument();
    expect(within(section()).getByText("Déduit de tes J'aime")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("« Retenir ces goûts » sans choix coché : message en role=alert, aucun appel, aucune mesure", async () => {
    const { actions, calls } = actionsDeGouts();
    const { recorder } = renderScreen({ actions });
    expect(within(section()).getByRole("alert")).toBeEmptyDOMElement();
    fireEvent.click(retenir());
    expect(within(section()).getByRole("alert")).toHaveTextContent("Coche au moins un goût à retenir.");
    expect(calls).toEqual([]);
    // Cocher un goût retire le message.
    fireEvent.click(choix(LIBELLE_MUSEES));
    expect(within(section()).getByRole("alert")).toBeEmptyDOMElement();
    await flush();
    expect(recorder.events).toEqual([]);
  });

  it("choix cochés : un appel avec leurs clés ; rien n'est affiché comme retenu avant la réponse ; puis « Goûts retenus : », lien et annonce", async () => {
    const { actions, calls } = actionsDeGouts();
    const { recorder } = renderScreen({ actions });
    fireEvent.click(choix(LIBELLE_MUSEES));
    fireEvent.click(choix(`${LIBELLE_DEGUSTATIONS}, déduit`));
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(retenir());
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tripId: TRIP.id, ids: [EVITER_MUSEES.id, AIMER_DEGUSTATIONS.id] });
    expect(within(section()).queryByText(t.retenus)).toBeNull();
    expect(retenir()).toHaveAttribute("aria-disabled", "true");
    // Un envoi à la fois : un second appui pendant l'envoi ne part pas.
    fireEvent.click(retenir());
    expect(calls).toHaveLength(1);

    await act(async () => calls[0]!.resolve(retenus(EVITER_MUSEES, AIMER_DEGUSTATIONS)));
    expect(within(section()).getByText("Goûts retenus :")).toBeInTheDocument();
    expect(within(section()).getAllByRole("listitem").map((li) => li.textContent)).toEqual([LIBELLE_MUSEES, LIBELLE_DEGUSTATIONS]);
    expect(within(section()).getByRole("link", { name: "Voir dans Mes voyages" })).toHaveAttribute("href", "/voyages");
    expect(within(section()).getByRole("status")).toHaveTextContent("2 goûts retenus.");
    expect(within(section()).queryByRole("button")).toBeNull();
    // Le bouton qui avait le focus est démonté : le focus va sur « Goûts retenus : » (revue de la PR 1124, bloquant 2).
    expect(within(section()).getByText("Goûts retenus :")).toHaveFocus();
    await flush();
    expect(recorder.events).toEqual([{ name: "tastes_retained", properties: { count: 2, inferred_count: 1 } }]);
  });

  it("un seul goût : « 1 goût retenu. » ; la mesure compte les goûts nouvellement retenus par le serveur", async () => {
    const { actions, calls } = actionsDeGouts();
    const { recorder } = renderScreen({ actions });
    fireEvent.click(choix(LIBELLE_MUSEES));
    fireEvent.click(retenir());
    await act(async () => calls[0]!.resolve(retenus(EVITER_MUSEES)));
    expect(within(section()).getByRole("status")).toHaveTextContent("1 goût retenu.");
    await flush();
    expect(recorder.events).toEqual([{ name: "tastes_retained", properties: { count: 1, inferred_count: 0 } }]);
  });

  it("erreur : rien n'est retenu, message du § 7 et « Réessayer » qui renvoie les mêmes clés ; aucune mesure", async () => {
    const { actions, calls } = actionsDeGouts();
    const { recorder } = renderScreen({ actions });
    fireEvent.click(choix(LIBELLE_MUSEES));
    fireEvent.click(retenir());
    await act(async () => calls[0]!.resolve({ ok: false, error: { code: "internal" } }));
    expect(within(section()).getByText("Impossible de retenir tes goûts pour le moment.")).toBeInTheDocument();
    expect(within(section()).queryByText(t.retenus)).toBeNull();
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(section()).getByRole("button", { name: "Réessayer" }));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.ids).toEqual([EVITER_MUSEES.id]);
    await act(async () => calls[1]!.resolve(retenus(EVITER_MUSEES)));
    expect(within(section()).getByText(t.retenus)).toBeInTheDocument();
    await flush();
    expect(recorder.events).toHaveLength(1);
  });
});

describe("Retenir mes goûts : déjà retenu, aucun candidat, lecture seule, hors ligne (critères 3, 7 et 9)", () => {
  it("candidat déjà retenu : coché, indisponible, « Déjà retenu » ; un appui ne le décoche pas et il n'est pas renvoyé", async () => {
    const { actions, calls } = actionsDeGouts();
    renderScreen({ actions, review: review({ retainedIds: [EVITER_MUSEES.id] }) });
    const musees = choix(LIBELLE_MUSEES);
    expect(musees).toHaveAttribute("aria-pressed", "true");
    expect(musees).toHaveAttribute("aria-disabled", "true");
    expect(within(section()).getByText("Déjà retenu")).toBeInTheDocument();
    fireEvent.click(musees);
    expect(musees).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(retenir());
    expect(calls).toEqual([]);
    fireEvent.click(choix(`${LIBELLE_DEGUSTATIONS}, déduit`));
    fireEvent.click(retenir());
    expect(calls[0]!.ids).toEqual([AIMER_DEGUSTATIONS.id]);
  });

  it("tous les candidats déjà retenus : chacun coché, indisponible, « Déjà retenu » ; jamais « Goûts retenus : » ; plus de bouton (revue de la PR 1124, bloquant 1)", async () => {
    const { container } = renderScreen({ review: review({ retainedIds: [EVITER_MUSEES.id, AIMER_DEGUSTATIONS.id] }) });
    for (const nom of [LIBELLE_MUSEES, `${LIBELLE_DEGUSTATIONS}, déduit`]) {
      expect(choix(nom)).toHaveAttribute("aria-pressed", "true");
      expect(choix(nom)).toHaveAttribute("aria-disabled", "true");
      expect(choix(nom)).toHaveAccessibleDescription("Déjà retenu");
    }
    expect(within(section()).getAllByText("Déjà retenu")).toHaveLength(2);
    expect(within(section()).queryByText(t.retenus)).toBeNull();
    expect(within(section()).queryByRole("button", { name: t.retenir })).toBeNull();
    expect(within(section()).getByText(t.accord)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("un seul candidat, déjà retenu : coché, indisponible, « Déjà retenu »", () => {
    renderScreen({ review: review({ tasteCandidates: [EVITER_MUSEES], retainedIds: [EVITER_MUSEES.id] }) });
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-pressed", "true");
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-disabled", "true");
    expect(within(section()).getByText("Déjà retenu")).toBeInTheDocument();
    expect(within(section()).queryByText(t.retenus)).toBeNull();
  });

  it("l'annonce compte les goûts nouvellement retenus par le serveur, pas les choix envoyés (revue de la PR 1124, mineur 5)", async () => {
    const { actions, calls } = actionsDeGouts();
    renderScreen({ actions });
    fireEvent.click(choix(LIBELLE_MUSEES));
    fireEvent.click(choix(`${LIBELLE_DEGUSTATIONS}, déduit`));
    fireEvent.click(retenir());
    // Le second était déjà retenu ailleurs : le serveur n'en rend qu'un.
    await act(async () => calls[0]!.resolve(retenus(EVITER_MUSEES)));
    expect(within(section()).getByRole("status")).toHaveTextContent("1 goût retenu.");
  });

  it("aucun candidat : « Aucun goût à retenir pour ce voyage. », ni choix ni bouton", () => {
    renderScreen({ review: review({ tasteCandidates: [] }) });
    expect(within(section()).getByText("Aucun goût à retenir pour ce voyage.")).toBeInTheDocument();
    expect(within(section()).queryByRole("button")).toBeNull();
  });

  it("lecture seule : « Retenir ces goûts » absent, aucun choix ; seulement les goûts déjà retenus", () => {
    renderScreen({ review: review({ access: "readOnly", retainedIds: [EVITER_MUSEES.id] }) });
    expect(within(section()).queryByRole("button")).toBeNull();
    expect(within(section()).queryByText(t.accord)).toBeNull();
    expect(within(section()).getAllByRole("listitem").map((li) => li.textContent)).toEqual([LIBELLE_MUSEES]);
    expect(within(section()).getByRole("link", { name: "Voir dans Mes voyages" })).toBeInTheDocument();
  });

  it("lecture seule sans goût retenu : « Aucun goût retenu pour ce voyage. »", () => {
    renderScreen({ review: review({ access: "readOnly" }) });
    expect(within(section()).getByText("Aucun goût retenu pour ce voyage.")).toBeInTheDocument();
    expect(within(section()).queryByRole("button")).toBeNull();
  });

  it("avant le dernier jour : aucune section de goûts", () => {
    renderScreen({ review: review({ access: "notEnded", tasteCandidates: [] }) });
    expect(screen.queryByRole("region", { name: t.titre })).toBeNull();
  });

  it("hors ligne : choix et bouton en aria-disabled, décrits par le bandeau ; aucun appel", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { actions, calls } = actionsDeGouts();
    const { container } = renderScreen({ actions });
    const musees = choix(LIBELLE_MUSEES);
    expect(musees).toHaveAttribute("aria-disabled", "true");
    // La source du goût, puis le bandeau hors ligne (revue de la PR 1124, mineur 11).
    expect(musees).toHaveAttribute("aria-describedby", "apres-gout-source-0 apres-hors-ligne");
    expect(musees).toHaveAccessibleDescription(/^Confirmé par toi pendant la présentation/);
    expect(retenir()).toHaveAttribute("aria-disabled", "true");
    expect(retenir()).toHaveAttribute("aria-describedby", "apres-hors-ligne");
    fireEvent.click(musees);
    expect(musees).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(retenir());
    expect(calls).toEqual([]);
    expect(within(section()).getByRole("alert")).toBeEmptyDOMElement();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("Retenir mes goûts sur mock : mémoire de l'onglet (F11 C22)", () => {
  it("retenu dans la mémoire de l'onglet ; au retour sur l'écran, le goût est coché, indisponible, « Déjà retenu »", async () => {
    const ecran = (cle: string) => (
      <TripSessionProvider>
        <ReviewScreen key={cle} trip={TRIP} review={review()} mode="memory" />
      </TripSessionProvider>
    );
    const { rerender } = render(ecran("a"));
    fireEvent.click(choix(LIBELLE_MUSEES));
    fireEvent.click(retenir());
    await flush();
    expect(within(section()).getAllByRole("listitem").map((li) => li.textContent)).toEqual([LIBELLE_MUSEES]);
    // Même onglet (même fournisseur), écran remonté : le goût vient de la mémoire de l'onglet.
    rerender(ecran("b"));
    expect(choix(LIBELLE_MUSEES)).toHaveAttribute("aria-disabled", "true");
    expect(within(section()).getByText("Déjà retenu")).toBeInTheDocument();
    expect(choix(`${LIBELLE_DEGUSTATIONS}, déduit`)).toHaveAttribute("aria-pressed", "false");
  });
});
