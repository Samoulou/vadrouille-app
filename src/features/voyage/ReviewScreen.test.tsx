import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Result, StopReview, TripReview } from "@/contracts";
import type { StopRating } from "@/contracts/values";
import * as messages from "@/i18n/messages";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { projectReviewTrip } from "./review";
import type { ReviewActions } from "./review-actions";
import { ReviewScreen, type ReviewScreenProps } from "./ReviewScreen";
import { TripSessionProvider } from "./TripSessionProvider";

/**
 * Écran 16 « Après le voyage » (M8a, ticket 1062 ; spécification M8 § 3, § 6.3 critères 1, 2, 3, 7, 10, 12 et 13 ; décision
 * 0160 § 3.3 : un geste à la fois par étape, effacement sans événement). Actions injectées, rendu unitaire.
 */

vi.mock("@/server/actions/avis", () => ({ rateStop: vi.fn() }));

const t = messages.apres;
const TRIP = projectReviewTrip(edimbourgDebloque);
const review = (access: TripReview["access"], reviews: StopReview[] = []): TripReview => ({
  tripId: TRIP.id,
  access,
  reviews,
  tasteCandidates: [],
  retainedIds: [],
});

const CHATEAU = "[Château d'Édimbourg]";

type Deferred = { resolve: (value: Result<StopReview | null>) => void; request: { stopId: string; rating: StopRating | null } };

/** Actions dont chaque appel attend sa résolution par le test. */
function deferredActions() {
  const calls: Deferred[] = [];
  const actions: ReviewActions = {
    rateStop: (_tripId, stopId, rating) =>
      new Promise((resolve) => {
        calls.push({ resolve, request: { stopId, rating } });
      }),
  };
  return { actions, calls };
}

function renderScreen(props: Partial<ReviewScreenProps> = {}) {
  const recorder = createMemoryRecorder();
  const view = render(<ReviewScreen trip={TRIP} review={review("open")} mode="server" recorder={recorder} {...props} />);
  return { ...view, recorder };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const group = (name: string) => screen.getByRole("group", { name: `Ton avis sur ${name}` });
const choice = (name: string, label: string) => within(group(name)).getByRole("button", { name: label });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ReviewScreen : avant le dernier jour (critère 1)", () => {
  it("seulement « Ton voyage n'est pas terminé… » et « Voir le séjour » ; aucun choix", () => {
    renderScreen({ review: review("notEnded") });
    expect(screen.getByRole("heading", { level: 1, name: t.avant.titre })).toBeInTheDocument();
    expect(screen.getByText("Ton voyage n'est pas terminé. Tu pourras donner ton avis à partir du jeudi 3 septembre.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.avant.voirSejour })).toHaveAttribute("href", `/voyages/${TRIP.id}`);
    expect(screen.queryAllByRole("group")).toHaveLength(0);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });
});

describe("ReviewScreen : écran complet (critères 2, 3, 10, 12)", () => {
  it("titre, « Tes étapes », un titre de niveau 3 par jour prêt, un groupe par étape, sans valeur au départ ; « Retour » vers le Séjour", async () => {
    const { container } = renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Ton avis sur Édimbourg" })).toBeInTheDocument();
    expect(screen.getByText(t.intro)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: t.etapes })).toBeInTheDocument();
    // J6 est en préparation dans le jeu simulé : pas de titre ni de ligne.
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
      "Samedi 29 août",
      "Dimanche 30 août",
      "Lundi 31 août",
      "Mardi 1er septembre",
      "Mercredi 2 septembre",
    ]);
    const stops = edimbourgDebloque.days.filter((day) => !day.generating).flatMap((day) => day.items.filter((item) => item.type === "stop"));
    expect(screen.getAllByRole("group")).toHaveLength(stops.length);
    for (const button of within(group(CHATEAU)).getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "false");
    expect(within(group(CHATEAU)).getAllByRole("button").map((b) => b.textContent)).toEqual(["J'ai aimé", "Pas pour moi", "Pas fait"]);
    expect(screen.getByRole("link", { name: t.retour })).toHaveAttribute("href", `/voyages/${TRIP.id}`);
    expect(container.querySelector("[data-part='demonstration']")).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("avis déjà donnés (api) affichés ; aucun terminus ni segment évalué", () => {
    const chateau = edimbourgDebloque.days[0]!.items.find((item) => item.type === "stop" && item.stop.name === CHATEAU);
    const id = chateau?.type === "stop" ? chateau.stop.id : "";
    renderScreen({ review: review("open", [{ stopId: id, rating: "disliked" }]) });
    expect(choice(CHATEAU, "Pas pour moi")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("group", { name: /Hôtel/ })).toBeNull();
  });

  it("choisir, changer, effacer : une valeur au plus ; stop_reviewed à chaque choix, jamais à l'effacement", async () => {
    const { actions, calls } = deferredActions();
    const { recorder } = renderScreen({ actions });
    fireEvent.click(choice(CHATEAU, "J'ai aimé"));
    // Pas encore enregistré : rien n'est affiché comme choisi ; l'attente est visible (bloquant 4).
    expect(choice(CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "false");
    expect(group(CHATEAU)).toHaveAttribute("aria-busy", "true");
    expect(within(group(CHATEAU).closest("li")!).getByText(t.enregistrement)).toBeInTheDocument();
    await act(async () => calls[0]!.resolve({ ok: true, value: { stopId: calls[0]!.request.stopId, rating: "liked" } }));
    await flush();
    expect(choice(CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(t.enregistrement)).toBeNull();
    expect(document.querySelector("[data-part='annonce-avis']")).toHaveTextContent(t.enregistre);

    fireEvent.click(choice(CHATEAU, "Pas fait"));
    expect(calls[1]!.request.rating).toBe("notDone");
    await act(async () => calls[1]!.resolve({ ok: true, value: { stopId: calls[1]!.request.stopId, rating: "notDone" } }));
    await flush();
    expect(choice(CHATEAU, "Pas fait")).toHaveAttribute("aria-pressed", "true");
    expect(choice(CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "false");

    // Toucher le choix actif l'efface.
    fireEvent.click(choice(CHATEAU, "Pas fait"));
    expect(calls[2]!.request.rating).toBeNull();
    await act(async () => calls[2]!.resolve({ ok: true, value: null }));
    await flush();
    for (const button of within(group(CHATEAU)).getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "false");
    expect(document.querySelector("[data-part='annonce-avis']")).toHaveTextContent(t.efface);

    expect(recorder.events).toEqual([
      { name: "stop_reviewed", properties: { rating: "liked", kind: "activity" } },
      { name: "stop_reviewed", properties: { rating: "notDone", kind: "activity" } },
    ]);
  });

  it("un geste à la fois par étape : un second appui pendant l'envoi est mis en attente, le dernier l'emporte", async () => {
    const { actions, calls } = deferredActions();
    renderScreen({ actions });
    fireEvent.click(choice(CHATEAU, "J'ai aimé"));
    fireEvent.click(choice(CHATEAU, "Pas pour moi"));
    fireEvent.click(choice(CHATEAU, "Pas fait"));
    expect(calls).toHaveLength(1);
    await act(async () => calls[0]!.resolve({ ok: true, value: { stopId: calls[0]!.request.stopId, rating: "liked" } }));
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.request.rating).toBe("notDone");
    await act(async () => calls[1]!.resolve({ ok: true, value: { stopId: calls[1]!.request.stopId, rating: "notDone" } }));
    await flush();
    expect(calls).toHaveLength(2);
    expect(choice(CHATEAU, "Pas fait")).toHaveAttribute("aria-pressed", "true");
  });

  it("erreur d'écriture : le choix revient à son état d'avant, message et « Réessayer » (nouvel appel)", async () => {
    const { actions, calls } = deferredActions();
    const { recorder } = renderScreen({ actions });
    fireEvent.click(choice(CHATEAU, "J'ai aimé"));
    await act(async () => calls[0]!.resolve({ ok: false, error: { code: "internal" } }));
    await flush();
    expect(choice(CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "false");
    // Sous l'étape concernée (bloquant 5).
    const ligne = group(CHATEAU).closest("li")!;
    expect(within(ligne).getByRole("alert")).toHaveTextContent(t.erreur);
    fireEvent.click(within(ligne).getByRole("button", { name: `Réessayer : ${CHATEAU}` }));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.request).toEqual(calls[0]!.request);
    await act(async () => calls[1]!.resolve({ ok: true, value: { stopId: calls[1]!.request.stopId, rating: "liked" } }));
    await flush();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(choice(CHATEAU, "J'ai aimé")).toHaveAttribute("aria-pressed", "true");
    expect(recorder.events).toHaveLength(1);
  });

  it("erreur : un geste sur une autre étape ne l'efface pas ; seul le réessai ou un nouveau geste sur l'étape la remplace", async () => {
    const { actions, calls } = deferredActions();
    renderScreen({ actions });
    fireEvent.click(choice(CHATEAU, "J'ai aimé"));
    await act(async () => calls[0]!.resolve({ ok: false, error: { code: "internal" } }));
    await flush();
    const autre = screen.getAllByRole("group").find((g) => g.getAttribute("aria-label") !== `Ton avis sur ${CHATEAU}`)!;
    fireEvent.click(within(autre).getByRole("button", { name: "Pas fait" }));
    await act(async () => calls[1]!.resolve({ ok: true, value: { stopId: calls[1]!.request.stopId, rating: "notDone" } }));
    await flush();
    expect(within(group(CHATEAU).closest("li")!).getByRole("alert")).toHaveTextContent(t.erreur);
    fireEvent.click(choice(CHATEAU, "Pas pour moi"));
    expect(within(group(CHATEAU).closest("li")!).queryByRole("alert")).toBeNull();
  });

  it("échec avec un geste en attente : rien n'est envoyé d'office ; « Réessayer » rejoue le dernier geste (mineur 6)", async () => {
    const { actions, calls } = deferredActions();
    renderScreen({ actions });
    fireEvent.click(choice(CHATEAU, "J'ai aimé"));
    fireEvent.click(choice(CHATEAU, "Pas fait"));
    await act(async () => calls[0]!.resolve({ ok: false, error: { code: "internal" } }));
    await flush();
    expect(calls).toHaveLength(1);
    fireEvent.click(within(group(CHATEAU).closest("li")!).getByRole("button", { name: `Réessayer : ${CHATEAU}` }));
    expect(calls).toHaveLength(2);
    expect(calls[1]!.request.rating).toBe("notDone");
  });

  it("hors ligne : bandeau, choix en aria-disabled décrits par le bandeau, aucun appel ; avis déjà donnés affichés", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { actions, calls } = deferredActions();
    const { container } = renderScreen({ actions });
    expect(screen.getByText(t.horsLigne)).toBeInTheDocument();
    const bouton = choice(CHATEAU, "J'ai aimé");
    expect(bouton).toHaveAttribute("aria-disabled", "true");
    // Rendu indisponible visible (bloquant 3) : contour et texte `ink-soft`, fond `muted`.
    expect(bouton.className).toMatch(/border-ink-soft/);
    expect(bouton.className).toMatch(/text-ink-soft/);
    expect(group(CHATEAU)).toHaveAttribute("aria-describedby", "apres-hors-ligne");
    fireEvent.click(bouton);
    expect(calls).toHaveLength(0);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("ReviewScreen : lecture seule (critère 7)", () => {
  it("texte du § 7, avis affichés, aucun bouton d'écriture", () => {
    const chateau = edimbourgDebloque.days[0]!.items.find((item) => item.type === "stop" && item.stop.name === CHATEAU);
    const id = chateau?.type === "stop" ? chateau.stop.id : "";
    const { container } = renderScreen({ review: review("readOnly", [{ stopId: id, rating: "liked" }]) });
    expect(screen.getByText(t.lectureSeule)).toBeInTheDocument();
    expect(screen.queryAllByRole("group")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(container.querySelector(`[data-stop='${id}'] [data-part='avis-lu']`)?.textContent).toBe("Ton avis : J'ai aimé");
    // Étape sans avis : « Pas d'avis » (mineur 15).
    const autre = container.querySelector(`[data-stop]:not([data-stop='${id}']) [data-part='avis-lu']`);
    expect(autre?.textContent).toBe(t.sansAvis);
  });
});

describe("ReviewScreen : mock, mémoire de l'onglet (critère 13)", () => {
  it("mention de démonstration ; l'avis est gardé par le fournisseur au remontage (navigation côté client)", async () => {
    const tree = (key: string) => (
      <TripSessionProvider>
        <ReviewScreen key={key} trip={TRIP} review={review("open")} mode="memory" />
      </TripSessionProvider>
    );
    const { rerender } = render(tree("a"));
    expect(screen.getByText(t.demonstration)).toBeInTheDocument();
    fireEvent.click(choice(CHATEAU, "Pas pour moi"));
    await flush();
    expect(choice(CHATEAU, "Pas pour moi")).toHaveAttribute("aria-pressed", "true");
    rerender(tree("b"));
    expect(choice(CHATEAU, "Pas pour moi")).toHaveAttribute("aria-pressed", "true");
  });
});

/**
 * M8b (ticket 1111 ; spécification M8 § 4.2 point 2, § 6.4 critère M8b-6 et § 7) : section « Adresses découvertes », lue
 * dans les étapes `discovered` du voyage ; chaque adresse garde sa ligne d'avis dans « Tes étapes ».
 */
describe("ReviewScreen : adresses découvertes (M8b, critère 6)", () => {
  const NOM = "SENTINELLE-NOM-DECOUVERT-M8B";
  const PLACE = "SENTINELLE_PLACE_DECOUVERT_M8B";
  /** Voyage simulé où la première étape de J2 est une adresse découverte et celle de J4 un lieu à soi `person`. */
  const avecDecouvertes = () => {
    const marquer = (index: number, addedBy: "person" | "discovered", name: string) => (day: (typeof edimbourgDebloque.days)[number]) => {
      if (day.index !== index) return day;
      const premiere = day.items.find((item) => item.type === "stop");
      return { ...day, items: day.items.map((item) => (item === premiere && item.type === "stop" ? { ...item, stop: { ...item.stop, name, placeId: PLACE, addedBy } } : item)) };
    };
    return projectReviewTrip({ ...edimbourgDebloque, days: edimbourgDebloque.days.map(marquer(2, "discovered", NOM)).map(marquer(4, "person", "Lieu à soi préparé")) });
  };

  it("aucune adresse : titre de niveau 2, sous-titre et « Aucune adresse découverte pendant ce voyage. », après « Tes étapes »", () => {
    renderScreen();
    const titres = screen.getAllByRole("heading", { level: 2 }).map((titre) => titre.textContent);
    expect(titres).toEqual([t.etapes, "Adresses découvertes"]);
    const section = screen.getByRole("region", { name: "Adresses découvertes" });
    expect(within(section).getByText("Les lieux que tu as ajoutés pendant ton voyage.")).toBeInTheDocument();
    expect(within(section).getByText("Aucune adresse découverte pendant ce voyage.")).toBeInTheDocument();
    expect(within(section).queryByRole("list")).toBeNull();
    expect(within(section).queryByRole("button")).toBeNull();
  });

  it("« {nom} · Jour {n} » pour chaque étape discovered, jamais pour un lieu à soi person ; ligne d'avis gardée dans « Tes étapes »", async () => {
    const trip = avecDecouvertes();
    const { container } = renderScreen({ trip });
    const section = screen.getByRole("region", { name: "Adresses découvertes" });
    const lignes = within(section).getAllByRole("listitem").map((ligne) => ligne.textContent);
    expect(lignes).toEqual([`${NOM} · Jour 2`]);
    expect(within(section).queryByText("Aucune adresse découverte pendant ce voyage.")).toBeNull();
    expect(section).not.toHaveTextContent("Lieu à soi préparé");
    // Sans action ni lien : la section liste, elle n'ajoute rien après le voyage.
    expect(within(section).queryByRole("button")).toBeNull();
    expect(within(section).queryByRole("link")).toBeNull();
    // Les deux lieux ajoutés ont leur ligne d'avis dans « Tes étapes ».
    const etapes = screen.getByRole("region", { name: t.etapes });
    expect(within(etapes).getByRole("group", { name: `Ton avis sur ${NOM}` })).toBeInTheDocument();
    expect(within(etapes).getByRole("group", { name: "Ton avis sur Lieu à soi préparé" })).toBeInTheDocument();
    // Aucune donnée Google : le `placeId` n'est ni projeté ni rendu.
    expect(JSON.stringify(trip)).not.toContain(PLACE);
    expect(container.innerHTML).not.toContain(PLACE);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("lecture seule : la section reste affichée ; avant le dernier jour : absente", () => {
    const trip = avecDecouvertes();
    const { unmount } = renderScreen({ trip, review: review("readOnly") });
    expect(within(screen.getByRole("region", { name: "Adresses découvertes" })).getByText(`${NOM} · Jour 2`)).toBeInTheDocument();
    unmount();
    renderScreen({ trip, review: review("notEnded") });
    expect(screen.queryByRole("region", { name: "Adresses découvertes" })).toBeNull();
    expect(screen.queryByText(`${NOM} · Jour 2`)).toBeNull();
  });

  it("projection : seule la marque addedBy s'ajoute aux champs de l'étape, et seulement si elle est posée", () => {
    const trip = avecDecouvertes();
    const stops = trip.days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])));
    expect(stops.filter((stop) => stop.addedBy !== undefined).map((stop) => [stop.name, stop.addedBy])).toEqual([
      [NOM, "discovered"],
      ["Lieu à soi préparé", "person"],
    ]);
    for (const stop of stops) expect(Object.keys(stop).filter((cle) => !["id", "kind", "name", "start", "addedBy"].includes(cle))).toEqual([]);
    for (const stop of TRIP.days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])))) expect(Object.keys(stop).sort()).toEqual(["id", "kind", "name", "start"]);
  });
});
