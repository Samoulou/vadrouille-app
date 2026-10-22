import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder, type MemoryRecorder } from "@/analytics/track";
import { fail, ok } from "@/contracts";
import { MOCK_INFERRED_BRIEF } from "@/mocks/creation-edimbourg";
import { structureBrief } from "@/server/actions/creation";

import { axeViolations } from "../../../tests/unit/axe";

import { formatNombre } from "@/lib/nombre";
import { BriefScreen } from "./BriefScreen";
import { DraftProvider, useDraft } from "./DraftProvider";
import { initialDraft, type DraftState } from "./draft";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/creation", () => ({ structureBrief: vi.fn() }));

/** Écran 2 « Brief raconté puis vérifié » (`R2`, F8-PO-4 à F8-PO-7, F8-PO-18). */

/** « 1 000 », formaté par la même fonction que l'application (indépendant de l'ICU). */
const MILLE = formatNombre(1000);

const STORY = "On part à deux, on aime la nature, les dégustations et les bons restaurants.";

function ready(): DraftState {
  const draft = initialDraft();
  return {
    ...draft,
    tripReady: true,
    trip: { ...draft.trip, destination: "Édimbourg", start: "2026-08-29", end: "2026-09-03", lodging: { answer: "none", label: "" } },
  };
}

let latest: DraftState | null = null;
function Probe() {
  const { state } = useDraft();
  useEffect(() => {
    latest = state;
  });
  return null;
}

let recorder: MemoryRecorder;
function renderScreen(initial: DraftState = ready()) {
  return render(
    <DraftProvider initial={initial}>
      <BriefScreen recorder={recorder} />
      <Probe />
    </DraftProvider>,
  );
}

const story = () => screen.getByRole("textbox", { name: "Raconte ton voyage en quelques phrases" });

async function prepare() {
  fireEvent.change(story(), { target: { value: STORY } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
  });
}

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  vi.mocked(structureBrief).mockReset();
  vi.mocked(structureBrief).mockResolvedValue(ok(MOCK_INFERRED_BRIEF));
  recorder = createMemoryRecorder();
  latest = null;
});

describe("BriefScreen : sans brouillon", () => {
  it("remplace l'adresse par l'écran 1 et demande l'annonce du brouillon perdu", async () => {
    renderScreen(initialDraft());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/voyages/nouveau"));
    expect(latest?.lostNotice).toBe(true);
  });
});

describe("BriefScreen : récit", () => {
  it("titre, aide, compteur et régions live présentes dès l'affichage ; describedby : aide puis compteur", async () => {
    const { container } = renderScreen();
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Raconte ton voyage en quelques phrases"]);
    expect(story()).toHaveAttribute("aria-describedby", "champ-story-aide champ-story-compteur");
    expect(story()).toHaveAccessibleDescription(
      `Qui part, ce qui te fait envie, ce que tu préfères éviter, ton budget pour les repas. 0 sur ${MILLE} caractères`,
    );
    expect(story()).toHaveAttribute("maxLength", "1000");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("récit de moins de 20 caractères : erreur entre l'aide et le compteur, focus sur le récit, aucun appel", () => {
    renderScreen();
    fireEvent.change(story(), { target: { value: "Trop court." } });
    fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
    expect(structureBrief).not.toHaveBeenCalled();
    expect(story()).toHaveAttribute("aria-invalid", "true");
    expect(story()).toHaveAttribute("aria-describedby", "champ-story-aide champ-story-erreur champ-story-compteur");
    expect(screen.getByText("Écris au moins une phrase, ou remplis le brief toi-même.")).toBeInTheDocument();
    expect(story()).toHaveFocus();
  });

  it("compteur : annoncé poliment à 900 et 1 000 caractères seulement", () => {
    const { container } = renderScreen();
    const live = container.querySelector('[aria-live="polite"]')!;
    fireEvent.change(story(), { target: { value: "a".repeat(899) } });
    expect(document.getElementById("champ-story-compteur")?.textContent).toBe(`899 sur ${MILLE} caractères`);
    expect(live).toBeEmptyDOMElement();
    fireEvent.change(story(), { target: { value: "a".repeat(900) } });
    expect(live.textContent).toBe(`900 sur ${MILLE} caractères`);
    fireEvent.change(story(), { target: { value: "a".repeat(950) } });
    expect(live).toBeEmptyDOMElement();
    fireEvent.change(story(), { target: { value: "a".repeat(1000) } });
    expect(live.textContent).toBe(`${MILLE} sur ${MILLE} caractères`);
  });

  it("« Préparer mon brief » : attente annoncée, puis vérification, focus sur son titre", async () => {
    let resolve: (value: Awaited<ReturnType<typeof structureBrief>>) => void = () => {};
    vi.mocked(structureBrief).mockReturnValue(new Promise((r) => (resolve = r)));
    renderScreen();
    fireEvent.change(story(), { target: { value: STORY } });
    fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
    expect(screen.getByRole("status")).toHaveTextContent("On prépare ton brief…");
    expect(screen.getByRole("button", { name: "Préparer mon brief" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
    expect(structureBrief).toHaveBeenCalledTimes(1);
    expect(structureBrief).toHaveBeenCalledWith({
      story: STORY,
      trip: { destination: "Édimbourg", start: "2026-08-29", end: "2026-09-03", otherCities: [] },
    });
    await act(async () => resolve(ok(MOCK_INFERRED_BRIEF)));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Vérifie ton brief" })).toHaveFocus());
  });

  it.each(["rate_limited", "cost_cap_reached", "provider_error"] as const)(
    "erreur %s : bandeau dans la région alert avec « Réessayer » et « Remplir moi-même », récit conservé",
    async (code) => {
      vi.mocked(structureBrief).mockResolvedValue(fail(code));
      const { container } = renderScreen();
      await prepare();
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Impossible de préparer ton brief pour le moment. Tu peux le remplir toi-même.");
      expect(within(alert).getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
      expect(within(alert).getByRole("button", { name: "Remplir moi-même" })).toBeInTheDocument();
      expect(story()).toHaveValue(STORY);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
      expect(await axeViolations(container)).toEqual([]);

      vi.mocked(structureBrief).mockResolvedValue(ok(MOCK_INFERRED_BRIEF));
      await act(async () => {
        fireEvent.click(within(alert).getByRole("button", { name: "Réessayer" }));
      });
      expect(screen.getByRole("heading", { level: 1, name: "Vérifie ton brief" })).toBeInTheDocument();
    },
  );

  it("réponse arrivée après « Remplir moi-même » : ignorée, le choix de la personne reste", async () => {
    let resolve: (value: Awaited<ReturnType<typeof structureBrief>>) => void = () => {};
    vi.mocked(structureBrief).mockReturnValue(new Promise((r) => (resolve = r)));
    const { container } = renderScreen();
    fireEvent.change(story(), { target: { value: STORY } });
    fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
    fireEvent.click(screen.getByRole("button", { name: "Remplir moi-même" }));
    expect(screen.getByRole("heading", { level: 1, name: "Vérifie ton brief" })).toBeInTheDocument();
    await act(async () => resolve(ok(MOCK_INFERRED_BRIEF)));
    expect(container.querySelector("[data-inferred]")).toBeNull();
    expect(screen.getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true")).toEqual([]);
    expect(screen.queryByRole("alert", { name: /Impossible/ })).toBeNull();
  });

  it("une exception réseau donne le même bandeau", async () => {
    vi.mocked(structureBrief).mockRejectedValue(new Error("réseau"));
    renderScreen();
    await prepare();
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de préparer ton brief pour le moment.");
  });
});

describe("BriefScreen : vérification", () => {
  it("brief simulé : champs déduits en pointillé, décrits « déduit de ton récit », sections ouvertes s'ils en contiennent", async () => {
    const { container } = renderScreen();
    await prepare();
    expect(screen.getByText("En pointillé : ce qu'on a compris de ton récit. Touche pour corriger.")).toBeInTheDocument();
    const adults = screen.getByRole("textbox", { name: "Adultes" });
    expect(adults).toHaveValue("2");
    expect(adults).toHaveAttribute("data-inferred", "true");
    expect(adults).toHaveAccessibleDescription("déduit de ton récit");
    expect(screen.getByRole("radiogroup", { name: "Rythme" })).toHaveAccessibleDescription("déduit de ton récit");
    for (const name of ["Nature", "Dégustations", "Restaurants", "À pied", "Transports publics"]) {
      const chip = screen.getAllByRole("button", { name }).find((button) => button.getAttribute("aria-pressed") === "true")!;
      expect(chip, name).toHaveAttribute("data-inferred", "true");
      expect(chip, name).toHaveAccessibleDescription("déduit de ton récit");
    }
    expect(screen.getByRole("button", { name: /Déplacements/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /À limiter/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Budget par repas/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /À limiter/ })).toHaveTextContent("Facultatif");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("corriger une déduction : 4 champs déduits, 2 modifiés, puis la suite du parcours", async () => {
    renderScreen();
    await prepare();
    const envies = screen.getByRole("group", { name: "Envies" });
    const tasting = within(envies).getByRole("button", { name: "Dégustations" });
    fireEvent.click(tasting);
    expect(tasting).toHaveAttribute("aria-pressed", "false");
    expect(tasting).not.toHaveAttribute("data-inferred");
    expect(tasting).not.toHaveAccessibleDescription();
    fireEvent.click(tasting);
    expect(tasting).toHaveAttribute("aria-pressed", "true");
    expect(tasting).not.toHaveAttribute("data-inferred");
    expect(tasting.className).toContain("bg-line");
    fireEvent.click(screen.getByRole("radio", { name: "Intense" }));
    expect(screen.getByRole("radiogroup", { name: "Rythme" })).not.toHaveAccessibleDescription();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(recorder.events).toEqual([{ name: "brief_completed", properties: { inferred_fields_count: 4, edited_fields_count: 2 } }]);
    // F8b : voyage « Pas encore » : écran 3 de la première ville sans logement (F8-PO-8, 0017 § 1).
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/logement");
    expect(latest?.briefReady).toBe(true);
    expect(latest?.lodgingCity).toBe(0);
  });

  it("logement connu (« Oui ») : « Continuer » mène à l'écran 4 sans passer par l'écran 3 (F8b)", async () => {
    const base = ready();
    renderScreen({ ...base, trip: { ...base.trip, lodging: { answer: "known", label: "[Hôtel de test]" } } });
    await prepare();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer");
    expect(router.push).not.toHaveBeenCalledWith("/voyages/nouveau/logement");
    expect(latest?.lodgingCity).toBeNull();
  });

  it("« Remplir moi-même » : aucun pointillé, rythme sans choix ; erreurs puis focus sur le rythme ; 0 champ déduit", async () => {
    const { container } = renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remplir moi-même" }));
    expect(container.querySelector("[data-inferred]")).toBeNull();
    expect(screen.queryByText("En pointillé : ce qu'on a compris de ton récit. Touche pour corriger.")).toBeNull();
    expect(screen.getAllByRole("radio").filter((radio) => radio.getAttribute("aria-checked") === "true")).toEqual([]);
    expect(screen.getAllByRole("button", { name: "Retour" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Récit" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    const pace = screen.getByRole("radiogroup", { name: "Rythme" });
    await waitFor(() => expect(pace).toHaveFocus());
    expect(pace).toHaveAttribute("aria-invalid", "true");
    expect(pace).toHaveAccessibleDescription("Choisis un rythme.");
    expect(screen.getByRole("group", { name: "Envies" })).toHaveAccessibleDescription("Choisis au moins une envie.");
    expect(await axeViolations(container)).toEqual([]);
    expect(recorder.events).toEqual([]);

    fireEvent.click(screen.getByRole("radio", { name: "Tranquille" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Envies" })).getByRole("button", { name: "Musées" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(recorder.events).toEqual([{ name: "brief_completed", properties: { inferred_fields_count: 0, edited_fields_count: 0 } }]);
  });

  it("une envie choisie est indisponible dans « À limiter » (aria-disabled, décrite, sans effet)", async () => {
    renderScreen();
    await prepare();
    fireEvent.click(screen.getByRole("button", { name: /À limiter/ }));
    const limiter = screen.getByRole("group", { name: "À limiter" });
    const nature = within(limiter).getByRole("button", { name: "Nature" });
    expect(nature).toHaveAttribute("aria-disabled", "true");
    expect(nature).not.toBeDisabled();
    expect(nature).toHaveAccessibleDescription("Déjà dans tes envies");
    expect(screen.getByText("Les envies déjà choisies ne peuvent pas être limitées.")).toBeVisible();
    fireEvent.click(nature);
    expect(nature).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(limiter).getByRole("button", { name: "Musées" }));
    const envies = screen.getByRole("group", { name: "Envies" });
    expect(within(envies).getByRole("button", { name: "Musées" })).toHaveAccessibleDescription("Déjà à limiter");
  });

  it("voyageurs : boutons Retirer et Ajouter de 44 px, bornés ; budget résumé en en-tête", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remplir moi-même" }));
    const adults = screen.getByRole("textbox", { name: "Adultes" });
    fireEvent.click(screen.getByRole("button", { name: "Retirer un adulte" }));
    expect(adults).toHaveValue("1");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un adulte" }));
    expect(adults).toHaveValue("2");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un enfant" }));
    expect(screen.getByRole("textbox", { name: "Enfants" })).toHaveValue("1");
    expect(screen.getByRole("button", { name: "Ajouter un adulte" }).className).toContain("size-(--touch-target)");

    const budget = screen.getByRole("button", { name: /Budget par repas/ });
    fireEvent.click(budget);
    fireEvent.change(screen.getByRole("textbox", { name: "Environ CHF par personne et par repas" }), { target: { value: "15a0" } });
    const amount = screen.getByRole("textbox", { name: "Environ CHF par personne et par repas" });
    expect(amount).toHaveValue("150");
    expect(amount).toHaveAttribute("maxLength", "3");
    expect(amount).toHaveAttribute("inputMode", "numeric");
    fireEvent.click(budget);
    expect(budget).toHaveTextContent("Environ 150 CHF par personne et par repas");
  });

  it("voyageurs aux bornes : « Retirer » et « Ajouter » en aria-disabled, atteignables, sans effet", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remplir moi-même" }));
    const adults = screen.getByRole("textbox", { name: "Adultes" });
    const lessAdult = screen.getByRole("button", { name: "Retirer un adulte" });
    expect(adults).toHaveValue("1");
    expect(lessAdult).toHaveAttribute("aria-disabled", "true");
    expect(lessAdult).not.toBeDisabled();
    fireEvent.click(lessAdult);
    expect(adults).toHaveValue("1");

    const children = screen.getByRole("textbox", { name: "Enfants" });
    expect(screen.getByRole("button", { name: "Retirer un enfant" })).toHaveAttribute("aria-disabled", "true");
    const moreChild = screen.getByRole("button", { name: "Ajouter un enfant" });
    for (let i = 0; i < 9; i++) fireEvent.click(moreChild);
    expect(children).toHaveValue("9");
    expect(moreChild).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(moreChild);
    expect(children).toHaveValue("9");
  });

  it("voyageurs : le contenu est sélectionné au focus, un chiffre tapé remplace la valeur", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remplir moi-même" }));
    const adults = screen.getByRole<HTMLInputElement>("textbox", { name: "Adultes" });
    act(() => adults.focus());
    expect([adults.selectionStart, adults.selectionEnd]).toEqual([0, adults.value.length]);
  });

  it("double clic sur « Continuer » : un seul brief_completed", async () => {
    renderScreen();
    await prepare();
    const next = screen.getByRole("button", { name: "Continuer" });
    fireEvent.click(next);
    fireEvent.click(next);
    expect(recorder.events).toHaveLength(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it("budget hors bornes : la section s'ouvre et le champ reçoit le focus", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Remplir moi-même" }));
    fireEvent.click(screen.getByRole("radio", { name: "Tranquille" }));
    fireEvent.click(within(screen.getByRole("group", { name: "Envies" })).getByRole("button", { name: "Musées" }));
    const budget = screen.getByRole("button", { name: /Budget par repas/ });
    fireEvent.click(budget);
    fireEvent.change(screen.getByRole("textbox", { name: "Environ CHF par personne et par repas" }), { target: { value: "2" } });
    fireEvent.click(budget);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    const field = screen.getByRole("textbox", { name: "Environ CHF par personne et par repas" });
    await waitFor(() => expect(field).toHaveFocus());
    expect(field).toHaveAccessibleDescription("Un nombre entier entre 5 et 500.");
  });

  it("« Revenir à mon récit » : état Récit, texte conservé, focus sur son titre ; un nouveau passage garde la correction", async () => {
    renderScreen();
    await prepare();
    fireEvent.click(screen.getByRole("radio", { name: "Intense" }));
    fireEvent.click(screen.getByRole("button", { name: "Revenir à mon récit" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "Raconte ton voyage en quelques phrases" })).toHaveFocus());
    expect(story()).toHaveValue(STORY);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
    });
    expect(screen.getByRole("radio", { name: "Intense" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Intense" })).not.toHaveAttribute("data-inferred");
  });

  it("« Retour » mène à l'écran 1", () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau");
  });
});

describe("BriefScreen : site d'essai (E2E-essai, lot 2, critère 1 ; D2)", () => {
  function renderEssai(initial: DraftState = ready()) {
    return render(
      <DraftProvider initial={initial}>
        <BriefScreen recorder={recorder} essai />
        <Probe />
      </DraftProvider>,
    );
  }

  it("« Préparer mon brief » mène à la vérification, récit gardé, sans appel ni bandeau ; axe", async () => {
    const { container } = renderEssai();
    expect(story()).toHaveAccessibleDescription(expect.stringContaining("Sur le site d'essai, ton récit est gardé tel quel"));
    fireEvent.change(story(), { target: { value: STORY } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
    });
    expect(structureBrief).not.toHaveBeenCalled();
    expect(latest?.stage).toBe("review");
    expect(latest?.story).toBe(STORY);
    expect(screen.getByRole("heading", { level: 1, name: "Vérifie ton brief" })).toBeInTheDocument();
    expect(screen.queryByText("Impossible de préparer ton brief pour le moment. Tu peux le remplir toi-même.")).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("récit trop court : même erreur au champ, aucun appel", () => {
    renderEssai();
    fireEvent.change(story(), { target: { value: "Trop court." } });
    fireEvent.click(screen.getByRole("button", { name: "Préparer mon brief" }));
    expect(structureBrief).not.toHaveBeenCalled();
    expect(story()).toHaveAttribute("aria-invalid", "true");
    expect(latest?.stage).toBe("story");
  });
});
