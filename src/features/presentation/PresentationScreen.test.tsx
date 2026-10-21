import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Category, Proposal } from "@/contracts";
import { apercu, edimbourg, edimbourgDebloque, propositions, propositionsDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { createLocalDeckActions } from "./actions";
import { presentationDay } from "./load";
import { noOptionMessage } from "./contexte";
import { PresentationScreen, type PresentationScreenProps } from "./PresentationScreen";

const DAYS = edimbourg.days.map(presentationDay);

function setup(props: Partial<PresentationScreenProps> = {}) {
  const recorder = createMemoryRecorder();
  const view = render(
    <PresentationScreen
      tripId="mock_trip_edimbourg"
      unlocked={false}
      generatingDays={[]}
      proposals={propositions}
      days={DAYS}
      recorder={recorder}
      {...props}
    />,
  );
  const events = (name?: string) => recorder.events.filter((e) => !name || e.name === name);
  return { ...view, recorder, events };
}

const card = () => document.querySelector<HTMLButtonElement>("[data-part='carte']")!;
const cardName = () => card().getAttribute("aria-label")!.replace("Voir le détail de ", "");
const progress = () => screen.getByRole("progressbar");
/** Texte visible « 4 sur 8 » sous la ligne (décision 0014, § 3). */
const progressText = () => document.querySelector("[data-part='progression'] [data-part='texte']");
const button = (name: string) => screen.getByRole("button", { name });
const toast = () => document.querySelector("[data-undo-toast]");
/** Laisse se résoudre les promesses de DeckActions. */
const flush = () => act(async () => {});

/** Comme un vrai clic : le bouton prend le focus, puis l'action. */
async function click(name: string) {
  const target = button(name);
  target.focus();
  fireEvent.click(target);
  await flush();
}

async function key(target: Element, key: "ArrowLeft" | "ArrowRight") {
  fireEvent.keyDown(target, { key });
  await flush();
}

function activity(id: string, day: number, time: string, category: Category): Proposal {
  return {
    id,
    kind: "activity",
    day,
    time,
    neighbours: {},
    category,
    stop: { id: `s-${id}`, kind: "activity", name: `[${id}]`, start: time, facts: {}, exceptions: [], locked: false },
  };
}

describe("PresentationScreen", () => {
  it("affiche la première carte, la progression, « Passer », les boutons et « Tout garder pour le jour 1 »", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeInTheDocument();
    expect(cardName()).toBe("[Château d'Édimbourg]");
    expect(progress()).toHaveAccessibleName("Proposition 1 sur 8");
    expect(progressText()).toHaveTextContent(/^1 sur 8$/);
    expect(screen.getByRole("link", { name: "Passer" })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg");
    expect(button("Pas pour moi")).toBeInTheDocument();
    expect(button("J'aime")).toBeInTheDocument();
    expect(button("Tout garder pour le jour 1")).toBeInTheDocument();
  });

  it("deck_decision : durée inconnue (minutes: null, décision 0092 § 4) : travel_minutes absent, jamais 0", async () => {
    const [premiere, ...autres] = propositions;
    const sansDuree = { ...premiere!, travelFromPrevious: { ...premiere!.travelFromPrevious!, minutes: null } };
    const { events } = setup({ proposals: [sansDuree, ...autres] });
    await click("J'aime");
    await waitFor(() => expect(events("deck_decision")).toHaveLength(1));
    const properties = events("deck_decision")[0]!.properties as Record<string, unknown>;
    expect(properties).toMatchObject({ decision: "like", position: 1 });
    expect("travel_minutes" in properties).toBe(false);
  });

  it("presentation: boutons et clavier", async () => {
    const { events } = setup();
    await click("J'aime");
    await waitFor(() =>
      expect(events("deck_decision").at(-1)?.properties).toMatchObject({ decision: "like", gesture: "button", position: 1, kind: "activity", category: "museum", travel_minutes: 15 }),
    );
    // Le focus reste sur le bouton qui sert à la carte suivante.
    await click("Option suivante");
    await waitFor(() => expect(events("deck_decision").at(-1)?.properties).toMatchObject({ decision: "dislike", kind: "meal", category: "restaurant", position: 2 }));
    card().focus();
    await key(card(), "ArrowRight");
    await waitFor(() => expect(events("deck_decision").at(-1)?.properties).toMatchObject({ decision: "like", gesture: "key", position: 3 }));
    // Depuis la carte, le focus passe à la carte suivante.
    expect(document.activeElement).toBe(card());
    expect(cardName()).toBe("[Dean Village]");
    await key(button("J'aime"), "ArrowLeft");
    await waitFor(() => expect(events("deck_decision").at(-1)?.properties).toMatchObject({ decision: "dislike", gesture: "key", position: 4 }));

    // Sans effet sur le toast.
    const count = events("deck_decision").length;
    await key(within(toast() as HTMLElement).getByRole("button", { name: "Annuler" }), "ArrowRight");
    expect(events("deck_decision")).toHaveLength(count);
  });

  it("après chaque décision, un toast role=status sans déplacer le focus, remplacé par la suivante", async () => {
    setup();
    const region = document.querySelector("[data-undo-region]");
    expect(region).toHaveAttribute("role", "status");
    expect(region).toBeEmptyDOMElement();
    const pasPourMoi = button("Pas pour moi");
    pasPourMoi.focus();
    await click("Pas pour moi");
    expect(document.querySelector("[data-undo-region]")).toBe(region);
    expect(toast()?.parentElement).toBe(region);
    expect(toast()).toHaveTextContent("[Château d'Édimbourg] écarté.");
    expect(document.activeElement).toBe(pasPourMoi);
    await click("Je choisis");
    expect(document.querySelectorAll("[data-undo-toast]")).toHaveLength(1);
    expect(toast()).toHaveTextContent("[Bonne table de l'Old Town] choisi.");
    await click("J'aime");
    expect(toast()).toHaveTextContent("[Dean Village] gardé.");
  });

  it("presentation: annuler restaure l'état exact", async () => {
    const { events } = setup();
    await click("J'aime");
    await click("Je choisis");
    expect(progress()).toHaveAccessibleName("Proposition 3 sur 7");
    expect(progressText()).toHaveTextContent(/^3 sur 7$/);
    expect(progressText()).toHaveAttribute("aria-hidden", "true");
    fireEvent.click(within(toast() as HTMLElement).getByRole("button", { name: "Annuler" }));
    await flush();
    expect(cardName()).toBe("[Bonne table de l'Old Town]");
    expect(progress()).toHaveAccessibleName("Proposition 2 sur 8");
    expect(progressText()).toHaveTextContent(/^2 sur 8$/);
    expect(document.activeElement).toBe(card());
    await waitFor(() => expect(events("deck_undo").at(-1)?.properties).toEqual({ position: 2 }));
    expect(toast()).toBeNull();
  });

  it("presentation: créneau de repas", async () => {
    setup();
    await click("J'aime");
    expect(card()).toHaveTextContent("option 1 sur 2");
    expect(button("Je choisis")).toBeInTheDocument();
    await click("Option suivante");
    expect(card()).toHaveTextContent("option 2 sur 2");
    expect(button("Pas pour moi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Option suivante" })).toBeNull();
    expect(progress()).toHaveAccessibleName("Proposition 3 sur 8");
  });

  it("presentation: écarter deux musées et répondre", async () => {
    const { events } = setup();
    await click("Pas pour moi"); // château (museum)
    await click("Je choisis"); // dîner
    await click("J'aime"); // Dean Village
    await click("J'aime"); // jardin
    await click("J'aime"); // Arthur's Seat
    await click("Pas pour moi"); // musée national (museum)
    const dialog = await screen.findByRole("dialog", { name: "On arrête les musées et monuments pour ce voyage ?" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
    expect(toast()).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Trop cher" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Oui" }));
    await flush();
    await waitFor(() =>
      expect(events("preference_prompt_answered")).toEqual([
        { name: "preference_prompt_answered", properties: { category: "museum", answer: "yes", reason: "too_expensive" } },
      ]),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toast()).toHaveTextContent("[Musée national d'Écosse] écarté.");
  });

  it("presentation: un double appui sur « Oui » ne répond qu'une fois", async () => {
    const proposals = [
      activity("m1", 1, "09:00", "museum"),
      activity("m2", 1, "10:00", "museum"),
      activity("m3", 1, "11:00", "museum"),
      activity("w1", 1, "12:00", "walk"),
    ];
    const local = createLocalDeckActions();
    const answerPrompt = vi.spyOn(local, "answerPrompt");
    const { events } = setup({ proposals, actions: local });
    await click("Pas pour moi");
    await click("Pas pour moi");
    const oui = within(await screen.findByRole("dialog")).getByRole("button", { name: "Oui" });
    fireEvent.click(oui);
    fireEvent.click(oui);
    await flush();
    expect(answerPrompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(events("preference_prompt_answered")).toHaveLength(1));
    expect(cardName()).toBe("[w1]");
    expect(document.querySelector("[data-announce]")).toHaveTextContent("1 proposition retirée");
  });

  it("préférences: aucune généralisation sans réponse", async () => {
    const proposals = [
      activity("m1", 1, "09:00", "museum"),
      activity("m2", 1, "10:00", "museum"),
      activity("m3", 1, "11:00", "museum"),
      activity("n1", 2, "09:00", "nature"),
      activity("n2", 2, "10:00", "nature"),
      activity("m4", 2, "11:00", "museum"),
    ];
    const { events } = setup({ proposals });
    await click("Pas pour moi");
    await click("Pas pour moi");
    const dialog = await screen.findByRole("dialog");
    // Validation chargée (deux décisions enregistrées) : l'absence de réponse ci-dessous est une vraie absence.
    await waitFor(() => expect(events("deck_decision")).toHaveLength(2));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(events("preference_prompt_answered")).toEqual([]);
    // Radix rend le focus dans un setTimeout après la fermeture : on attend le retour.
    await waitFor(() => expect(document.activeElement).toBe(button("Pas pour moi")));
    await click("Pas pour moi"); // m3 : pas de nouvelle question
    expect(screen.queryByRole("dialog")).toBeNull();
    await click("Pas pour moi"); // n1
    await click("Pas pour moi"); // n2 → question nature
    expect(await screen.findByRole("dialog", { name: "On arrête la nature et les points de vue pour ce voyage ?" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Fermer" }));
    await flush();
    await click("Pas pour moi"); // m4 : museum déjà posée
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("les flèches sont sans effet dans la feuille", async () => {
    const { events } = setup({ proposals: [activity("m1", 1, "09:00", "museum"), activity("m2", 1, "10:00", "museum"), activity("m3", 1, "11:00", "walk")] });
    await click("Pas pour moi");
    await click("Pas pour moi");
    const heading = within(await screen.findByRole("dialog")).getByRole("heading");
    await waitFor(() => expect(events("deck_decision")).toHaveLength(2));
    const count = events("deck_decision").length;
    await key(heading, "ArrowRight");
    expect(events("deck_decision")).toHaveLength(count);
  });

  it("presentation: réponse oui ou non", async () => {
    const proposals = [
      activity("m1", 1, "09:00", "museum"),
      activity("m2", 1, "10:00", "museum"),
      activity("m3", 1, "11:00", "museum"),
      activity("m4", 1, "12:00", "museum"),
      activity("w1", 1, "13:00", "walk"),
    ];
    setup({ proposals });
    await click("Pas pour moi");
    await click("Pas pour moi");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Oui" }));
    await flush();
    expect(cardName()).toBe("[w1]");
    expect(progress()).toHaveAccessibleName("Proposition 3 sur 3");
    expect(document.querySelector("[data-announce]")).toHaveTextContent("2 propositions retirées");
  });

  it("« Non » ne retire rien", async () => {
    const proposals = [activity("m1", 1, "09:00", "museum"), activity("m2", 1, "10:00", "museum"), activity("m3", 1, "11:00", "museum")];
    setup({ proposals });
    await click("Pas pour moi");
    await click("Pas pour moi");
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Non" }));
    await flush();
    expect(cardName()).toBe("[m3]");
    expect(progress()).toHaveAccessibleName("Proposition 3 sur 3");
    expect(document.querySelector("[data-announce]")).toHaveTextContent("");
  });

  it("presentation: question de distance après deux feuilles « Trop loin » (nature puis museum)", async () => {
    const { events } = setup();
    await click("Pas pour moi"); // château (museum 1)
    await click("Je choisis"); // dîner
    await click("J'aime"); // Dean Village
    await click("Pas pour moi"); // jardin (nature 1)
    await click("Pas pour moi"); // Arthur's Seat (nature 2) → question nature
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Trop loin" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Non" }));
    await flush();
    await click("Pas pour moi"); // musée national (museum 2) → question museum
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Trop loin" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Oui" }));
    await flush();
    const distance = await screen.findByRole("dialog", { name: "On reste plus près de ton hôtel ?" });
    expect(document.activeElement).toBe(within(distance).getByRole("heading"));
    expect(within(distance).queryByRole("button", { name: "Trop loin" })).toBeNull();
    fireEvent.click(within(distance).getByRole("button", { name: "Oui" }));
    await flush();
    await waitFor(() =>
      expect(events("preference_prompt_answered").map((e) => e.properties)).toEqual([
        { category: "nature", answer: "no", reason: "too_far" },
        { category: "museum", answer: "yes", reason: "too_far" },
        { category: "distance", answer: "yes" },
      ]),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("presentation: passer et tout garder", async () => {
    const { events } = setup();
    await click("Tout garder pour le jour 1");
    expect(cardName()).toBe("[Dean Village]");
    await waitFor(() => expect(events("deck_skipped").at(-1)?.properties).toEqual({ position: 1, scope: "day" }));
    // Les événements gardent leur ordre : une décision envoyée avant serait déjà enregistrée.
    expect(events("deck_decision")).toEqual([]);
    expect(toast()).toHaveTextContent("Jour 1 gardé.");
    fireEvent.click(within(toast() as HTMLElement).getByRole("button", { name: "Annuler" }));
    await flush();
    expect(cardName()).toBe("[Château d'Édimbourg]");
    fireEvent.click(screen.getByRole("link", { name: "Passer" }));
    await waitFor(() => expect(events("deck_skipped").at(-1)?.properties).toEqual({ position: 1, scope: "all" }));
  });

  it("presentation: fin de l'aperçu", async () => {
    setup();
    await click("Tout garder pour le jour 1");
    await click("Tout garder pour le jour 2");
    await click("Tout garder pour le jour 4");
    await click("J'aime");
    await click("J'aime");
    const title = screen.getByRole("heading", { name: "Tu as vu tes premières propositions" });
    expect(document.activeElement).toBe(title);
    expect(screen.getByRole("link", { name: "Débloquer" })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg/debloquer");
    expect(screen.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg");
    expect(document.body.textContent).not.toMatch(/CHF|\d+[.,]\d{2}/);
  });

  it("presentation: suite du tri", async () => {
    setup({ tripId: edimbourgDebloque.id, unlocked: true, generatingDays: [6], proposals: propositionsDebloque });
    expect(screen.getByRole("heading", { level: 1, name: "Suite du tri" })).toBeInTheDocument();
    expect(screen.getByText("Jour 6 en préparation").closest("[role='status']")).toHaveAttribute("data-kind", "generating");
    expect(progress()).toHaveAccessibleName("Proposition 1 sur 7");
    await click("Tout garder pour le jour 3");
    await click("Tout garder pour le jour 4");
    // Des jours gardés sans tri carte à carte : « Tu as fini ce tri. », jamais « Tu as tout trié » (revue UX/UI tardive).
    expect(screen.getByRole("heading", { name: "Tu as fini ce tri." })).toBeInTheDocument();
    expect(screen.queryByText("Tu as tout trié")).toBeNull();
    expect(screen.getByText("Jour 6 en préparation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", `/voyages/${edimbourgDebloque.id}`);
    expect(screen.queryByRole("link", { name: "Débloquer" })).toBeNull();
  });

  it("paquet vide : état vide", () => {
    setup({ proposals: [] });
    expect(screen.getByRole("heading", { name: "Aucune proposition à trier" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voir le programme" })).toBeInTheDocument();
  });

  it("presentation: détail et retour du focus", async () => {
    setup({ proposals: propositions.slice(7) });
    card().focus();
    fireEvent.click(card());
    const dialog = await screen.findByRole("dialog", { name: "[Distillerie accessible en bus]" });
    expect(document.activeElement).toBe(within(dialog).getByRole("heading"));
    expect(within(dialog).getByRole("link", { name: "[Site de la distillerie]" })).toHaveAttribute("href", "https://example.org/mock/distillerie");
    expect(dialog).toHaveTextContent("Informations vérifiées le 15 août 2026");
    expect(within(dialog).queryByRole("button", { name: "J'aime" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
    await flush();
    expect(screen.queryByRole("dialog")).toBeNull();
    // Radix rend le focus dans un setTimeout après la fermeture ; `flush` (act asynchrone) n'attend qu'un
    // setImmediate, que Node exécute avant ou après ce délai selon la charge (Q208). On attend donc l'état
    // observable, comme pour la feuille de question.
    await waitFor(() => expect(document.activeElement).toBe(card()));
  });

  it("aucune violation axe : carte, feuille, fin", async () => {
    const { container } = setup();
    expect(await axeViolations(container)).toEqual([]);
    await click("Pas pour moi");
    await click("Je choisis");
    expect(await axeViolations(document.body)).toEqual([]);
  });
});

describe("PresentationScreen : aperçu avec des cases noOption (B2-PO-9)", () => {
  const cartes = apercu.flatMap((slot) => (slot.type === "proposal" ? [slot.proposal] : []));
  const sansOption = apercu.flatMap((slot) => (slot.type === "noOption" ? [{ day: slot.day, time: slot.time, kind: slot.kind }] : []));

  it("presentation: les cases noOption ne sont pas des cartes", async () => {
    const { container } = setup({ proposals: cartes, noOptionSlots: sansOption });
    expect(sansOption.length).toBeGreaterThan(0);
    const banner = container.querySelector('[data-kind="noOption"]');
    expect(banner).toHaveTextContent(noOptionMessage(sansOption));
    expect(banner).toHaveTextContent("le jour 4, vers 16:00 (activité)");
    expect(banner).toHaveAttribute("role", "status");
    expect(progress()).toHaveAccessibleName(`Proposition 1 sur ${cartes.length}`);
    expect(cartes).toHaveLength(7);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("sans case noOption : aucun bandeau", () => {
    const { container } = setup();
    expect(container.querySelector('[data-kind="noOption"]')).toBeNull();
  });

  it("la carte affiche le contexte composé depuis ses voisins", () => {
    setup();
    expect(card()).toHaveTextContent("Entre ton déjeuner et ton temps libre");
  });
});

describe("PresentationScreen : tri enregistré (B10a point 5, décision 0112 § 4)", () => {
  /** Actions injectées qui notent chaque appel (implémentation serveur remplacée). */
  function actionsEspion() {
    const appels: string[] = [];
    const actions = {
      decide: vi.fn(async (input: { decision: string; kind: string; lastOption?: boolean }) => {
        appels.push(`decide:${input.kind}:${input.decision}:${input.lastOption === true ? "derniere" : "-"}`);
        return { prompt: null };
      }),
      undo: vi.fn(async () => undefined),
      answerPrompt: vi.fn(async () => ({ next: null })),
      complete: vi.fn(async () => {
        appels.push("complete");
      }),
    };
    return { actions, appels };
  }
  const session = (proposalIds: string[], decided: number, extra: Partial<{ openPrompt: { kind: "category"; category: Category } | null; closed: boolean }> = {}) => ({
    tripId: "mock_trip_edimbourg",
    proposalIds,
    openPrompt: null,
    closed: false,
    counts: { decided, remaining: proposalIds.length },
    ...extra,
  });

  it("la progression part des cartes déjà décidées du tri ouvert", () => {
    const reprise = propositions.slice(2);
    setup({ proposals: reprise, deck: session(reprise.map((p) => p.id), 2), actions: actionsEspion().actions });
    expect(progress()).toHaveAccessibleName(`Proposition 3 sur ${reprise.length + 2}`);
    expect(progressText()).toHaveTextContent(new RegExp(`^3 sur ${reprise.length + 2}$`));
  });

  it("la question ouverte rouvre la feuille au chargement", async () => {
    const reprise = propositions.slice(2);
    setup({ proposals: reprise, deck: session(reprise.map((p) => p.id), 2, { openPrompt: { kind: "category", category: "museum" } }), actions: actionsEspion().actions });
    expect(await screen.findByRole("dialog", { name: "On arrête les musées et monuments pour ce voyage ?" })).toBeInTheDocument();
  });

  it("tri clos : écran de fin de l'aperçu, aucune clôture de plus", async () => {
    const { actions } = actionsEspion();
    setup({ proposals: [], deck: session([], 0, { closed: true }), actions });
    expect(document.querySelector("[data-deck-end]")).toHaveAttribute("data-deck-end", "apercu");
    await flush();
    expect(actions.complete).not.toHaveBeenCalled();
  });

  it.each([
    [false, "apercu", "Tu as vu tes premières propositions"],
    [true, "suite", "Tu as fini ce tri."],
  ] as const)("tri clos à l'ouverture (débloqué : %s) : titre de la variante %s, jamais « Tu as tout trié »", (unlocked, variante, titre) => {
    setup({ unlocked, proposals: [], deck: session([], 0, { closed: true }), actions: actionsEspion().actions });
    const fin = document.querySelector("[data-deck-end]");
    expect(fin).toHaveAttribute("data-deck-end", variante);
    expect(fin).toHaveAttribute("data-deck-closed");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(new RegExp(`^${titre.replace(".", "\\.")}$`));
    expect(screen.queryByText("Tu as tout trié")).toBeNull();
    // Rien ne dit qu'il reste des cartes non triées : la phrase « Le reste est gardé… » n'est pas affichée.
    expect(screen.queryByText(/Le reste est gardé/)).toBeNull();
  });

  it("la feuille rouverte au chargement, fermée sans réponse : le focus revient sur la carte", async () => {
    const reprise = propositions.slice(2);
    setup({ proposals: reprise, deck: session(reprise.map((p) => p.id), 2, { openPrompt: { kind: "category", category: "museum" } }), actions: actionsEspion().actions });
    const feuille = await screen.findByRole("dialog");
    fireEvent.click(within(feuille).getByRole("button", { name: "Fermer" }));
    await flush();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(card()));
  });

  /** Actions dont la décision (ou la réponse) n'est pas enregistrée, avec le refus donné. */
  it.each([
    ["Oui", "Tu as fini ce tri."],
    ["Non", "Tu as tout trié"],
  ] as const)("suite du tri, réponse « %s » à une question de catégorie puis fin du paquet : « %s »", async (reponse, titre) => {
    const cartes = [activity("n1", 1, "09:00", "nature"), activity("n2", 1, "11:00", "nature"), activity("m1", 1, "14:00", "museum")];
    setup({
      tripId: edimbourgDebloque.id,
      unlocked: true,
      proposals: cartes,
      deck: session(cartes.map((c) => c.id), 0, { openPrompt: { kind: "category", category: "nature" } }),
      actions: actionsEspion().actions,
    });
    const feuille = await screen.findByRole("dialog");
    fireEvent.click(within(feuille).getByRole("button", { name: reponse }));
    await flush();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // « Oui » retire les cartes « nature » restantes, qui n'ont pas été triées une à une (spécification B10, question 8).
    while (document.querySelector("[data-part='carte']")) await click("J'aime");
    expect(screen.getByRole("heading", { name: titre })).toBeInTheDocument();
    if (reponse === "Oui") expect(screen.queryByText("Tu as tout trié")).toBeNull();
  });

  function actionsRefusees(refus: "recalcul" | "echec" | "dejaDecidee") {
    return {
      decide: vi.fn(async () => ({ prompt: null, refus })),
      undo: vi.fn(async () => undefined),
      answerPrompt: vi.fn(async (): Promise<{ next: null; refus?: typeof refus }> => ({ next: null, refus })),
      complete: vi.fn(async () => undefined),
    };
  }
  const annonce = () => document.querySelector("[data-announce]");

  it.each([
    ["recalcul", "generating", "Ça se prépare, réessaie dans un instant."],
    ["echec", "error", "Ce choix n'a pas été enregistré. Réessaie."],
  ] as const)("décision non enregistrée (%s) : la carte reste, bandeau %s annoncé, aucun toast d'annulation", async (refus, kind, texte) => {
    setup({ deck: session(propositions.map((p) => p.id), 0), actions: actionsRefusees(refus) });
    const avant = cardName();
    await click("J'aime");
    expect(cardName()).toBe(avant);
    expect(progress()).toHaveAccessibleName("Proposition 1 sur 8");
    // Bandeau repéré par son texte, visible hors de la région d'annonce, du type attendu.
    const bandeau = screen.getAllByText(texte).map((n) => n.closest("[data-kind]")).find((n) => n !== null);
    expect(bandeau).toHaveAttribute("data-kind", kind);
    expect(annonce()).toHaveTextContent(texte);
    expect(annonce()).toHaveAttribute("role", "status");
    expect(toast()).toBeNull();
    expect(await axeViolations(document.body)).toEqual([]);
    // Un nouveau geste, refusé de même, le redit (le bandeau est effacé au geste, puis reposé) ; la carte ne bouge pas.
    await click("J'aime");
    expect(cardName()).toBe(avant);
    expect(annonce()).toHaveTextContent(texte);
  });

  it("décision refusée parce que la carte est déjà décidée ailleurs : le paquet avance, sans bandeau ni toast", async () => {
    setup({ deck: session(propositions.map((p) => p.id), 0), actions: actionsRefusees("dejaDecidee") });
    const avant = cardName();
    await click("J'aime");
    expect(cardName()).not.toBe(avant);
    expect(document.querySelector("[data-kind='generating'], [data-kind='error']")).toBeNull();
    expect(toast()).toBeNull();
  });

  it("« Tout garder pour le jour » efface le bandeau d'un refus précédent", async () => {
    setup({ deck: session(propositions.map((p) => p.id), 0), actions: actionsRefusees("echec") });
    await click("J'aime");
    expect(screen.getAllByText("Ce choix n'a pas été enregistré. Réessaie.").length).toBeGreaterThan(0);
    await click("Tout garder pour le jour 1");
    expect(document.querySelector("[data-kind='error']")).toBeNull();
  });

  it.each([
    ["recalcul", "generating", "Ça se prépare, réessaie dans un instant."],
    ["echec", "error", "Ce choix n'a pas été enregistré. Réessaie."],
  ] as const)("réponse non enregistrée (%s) : la feuille reste ouverte avec le bandeau %s ; une nouvelle réponse l'efface et s'enregistre", async (refus, kind, texte) => {
    const reprise = propositions.slice(2);
    const actions = actionsRefusees(refus);
    actions.answerPrompt.mockImplementationOnce(async () => ({ next: null, refus })).mockImplementation(async () => ({ next: null }));
    setup({ proposals: reprise, deck: session(reprise.map((p) => p.id), 2, { openPrompt: { kind: "category", category: "museum" } }), actions });
    const feuille = await screen.findByRole("dialog");
    fireEvent.click(within(feuille).getByRole("button", { name: "Oui" }));
    await flush();
    // La feuille reste ouverte ; le bandeau est dans la feuille, annoncé ; le paquet ne change pas.
    const ouverte = screen.getByRole("dialog");
    const bandeau = within(ouverte).getByText(texte).closest("[data-kind]");
    expect(bandeau).toHaveAttribute("data-kind", kind);
    expect(bandeau).toHaveAttribute("role", kind === "error" ? "alert" : "status");
    // Paquet inchangé (la barre est sous la feuille modale, donc masquée aux technologies d'assistance).
    expect(screen.getByRole("progressbar", { hidden: true })).toHaveAccessibleName(`Proposition 3 sur ${reprise.length + 2}`);
    expect(await axeViolations(ouverte)).toEqual([]);
    // Nouvelle réponse : bandeau effacé, réponse enregistrée, feuille fermée.
    fireEvent.click(within(ouverte).getByRole("button", { name: "Non" }));
    await flush();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText(texte)).toBeNull();
    expect(actions.answerPrompt).toHaveBeenCalledTimes(2);
  });

  it("réponse refusée parce que la question n'est plus ouverte : la feuille se ferme, sans bandeau", async () => {
    const reprise = propositions.slice(2);
    setup({ proposals: reprise, deck: session(reprise.map((p) => p.id), 2, { openPrompt: { kind: "category", category: "museum" } }), actions: actionsRefusees("dejaDecidee") });
    const feuille = await screen.findByRole("dialog");
    fireEvent.click(within(feuille).getByRole("button", { name: "Oui" }));
    await flush();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector("[data-kind='generating'], [data-kind='error']")).toBeNull();
    expect(progress()).toHaveAccessibleName(`Proposition 3 sur ${reprise.length + 2}`);
  });

  it("« Passer » clôt le tri enregistré", async () => {
    const { actions } = actionsEspion();
    setup({ deck: session(propositions.map((p) => p.id), 0), actions });
    const passer = screen.getByRole("link", { name: "Passer" });
    passer.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(passer);
    await flush();
    expect(actions.complete).toHaveBeenCalledTimes(1);
  });

  it("repas : la dernière option est signalée à l'action ; la fin du paquet clôt le tri une fois l'annulation expirée", async () => {
    vi.useFakeTimers();
    try {
      const { actions, appels } = actionsEspion();
      const repas = propositions.filter((p) => p.kind === "meal").slice(0, 2);
      setup({ proposals: repas, deck: session(repas.map((p) => p.id), 0), actions });
      await click("Option suivante");
      await click("Pas pour moi");
      expect(appels).toEqual(["decide:meal:dislike:-", "decide:meal:dislike:derniere"]);
      expect(actions.complete).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(6000);
      });
      expect(actions.complete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
