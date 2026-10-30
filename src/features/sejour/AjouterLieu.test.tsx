import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PatchResult, PlaceSearchResult, Result, RevisionPreview, Trip } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { AjouterLieuView, type AjouterLieuCalls } from "./AjouterLieu";
import { TripShell } from "./TripShell";

/**
 * « Ajouter un lieu » avec des actions injectées (tâche M5d-2 ; spécification M5 § 6, critères 19, 21, 22, 25, 26 ; S3
 * de la décision 0147 : valeurs sentinelles du double de Text Search de M5d-1, `src/grounding/places.simule.ts`).
 */

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ n: "2" }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

/** Valeurs du double de Text Search (M5d-1) : nom et adresse Google, jamais à stocker ni à renvoyer au serveur. */
const NOM_GOOGLE = "SENTINELLE-NOM-LIEU-M5D";
const ADRESSE_GOOGLE = "SENTINELLE-ADRESSE-LIEU-M5D";
const RESULTATS: PlaceSearchResult[] = [
  { resultId: "ChIJ-M5D-1", name: `${NOM_GOOGLE} 1`, address: `${ADRESSE_GOOGLE} 1` },
  { resultId: "ChIJ-M5D-2", name: `${NOM_GOOGLE} 2` },
];
const DUREES = { activity: 90, lunch: 75, dinner: 90 };
const DEBLOQUE: Trip = { ...edimbourg, unlocked: true };

/** Aperçu rendu par le serveur pour le J2 : étape ajoutée 15:00 – 16:30 dans le temps libre de l'après-midi. */
function apercu(name: string): RevisionPreview {
  const day = edimbourg.days.find((candidate) => candidate.index === 2)!;
  const items = day.items.flatMap((item) =>
    item.type === "free" && item.from === "15:00"
      ? [
          {
            type: "stop" as const,
            stop: { id: "ajout-apercu", kind: "activity" as const, placeId: "ChIJ-M5D-1", name, start: "15:00", end: "16:30", facts: {}, exceptions: [], locked: true, addedBy: "person" as const },
          },
          { type: "free" as const, from: "16:30", to: "18:30" },
        ]
      : [item],
  );
  return {
    kind: "add",
    id: "apercu",
    baseVersion: 1,
    days: [{ ...day, items }],
    changes: [{ type: "added", time: "15:00", label: name }],
    changedStopIds: ["ajout-apercu"],
    targetStopId: "ajout-apercu",
  };
}

function fakeCalls(overrides: Partial<AjouterLieuCalls> = {}) {
  const defauts = {
    searchPlaces: vi.fn<AjouterLieuCalls["searchPlaces"]>(async () => ({ ok: true, value: RESULTATS })),
    previewAddPlace: vi.fn<AjouterLieuCalls["previewAddPlace"]>(async (input) => ({ ok: true, value: apercu((input as { name: string }).name) })),
    applyAddPlace: vi.fn<AjouterLieuCalls["applyAddPlace"]>(async () => ({ ok: true, value: { version: 6, touchedDays: [2], changes: [] } })),
    applyRevert: vi.fn<AjouterLieuCalls["applyRevert"]>(async () => ({ ok: true, value: { version: 7, touchedDays: [2], changes: [] } })),
  };
  // Une action remplacée n'est pas relue comme un double (`mock`) par les tests qui la remplacent.
  return { ...defauts, ...overrides } as typeof defauts;
}

function renderScreen(
  calls: AjouterLieuCalls,
  { trip = DEBLOQUE, api = false, resultatsGoogle = api }: { trip?: Trip; api?: boolean; resultatsGoogle?: boolean } = {},
) {
  return render(
    <TripShell trip={trip} maps={[]} base="/voyages" versionable revisionVersion={api ? 5 : null}>
      <AjouterLieuView
        dayIndex={2}
        entree={null}
        durees={DUREES}
        versionSimulee={api ? null : 1}
        resultatsGoogle={resultatsGoogle}
        calls={calls}
        newRequestId={() => "00000000-0000-4000-8000-000000000001"}
      />
    </TripShell>,
  );
}

const searchField = () => screen.getByRole("searchbox", { name: "Lieu à ajouter" });
const results = () => screen.getByRole("radiogroup", { name: "Résultats" });
const nameField = () => screen.getByRole("textbox", { name: "Nom dans ton programme" });
const moments = () => screen.getByRole("radiogroup", { name: "Quel moment ?" });

async function rechercher(texte: string) {
  fireEvent.change(searchField(), { target: { value: texte } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Rechercher" }));
  });
}

async function choisirEtVoir(nom: string) {
  await rechercher("bouquiniste");
  fireEvent.click(within(results()).getByRole("radio", { name: `${NOM_GOOGLE} 1, ${ADRESSE_GOOGLE} 1` }));
  fireEvent.change(nameField(), { target: { value: nom } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Voir l'effet" }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
});

describe("ajouter: écran", () => {
  it("titre avec le focus ; avant le déblocage, explication sans recherche (critère 25, M5-PO-1)", () => {
    renderScreen(fakeCalls(), { trip: edimbourg });
    expect(screen.getByRole("heading", { level: 1, name: "Ajouter un lieu" })).toHaveFocus();
    expect(screen.getByText("Tu pourras ajouter tes propres lieux une fois ton voyage débloqué.")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("moins de 2 lettres : « Écris au moins 2 lettres. », aucune recherche", async () => {
    const calls = fakeCalls();
    renderScreen(calls);
    await rechercher(" a ");
    expect(screen.getByText("Écris au moins 2 lettres.")).toHaveAttribute("role", "alert");
    expect(searchField()).toHaveFocus();
    expect(calls.searchPlaces).not.toHaveBeenCalled();
  });

  it("résultats en groupe radio, aucun coché, « 2 résultats. », mention Google sur `api` (critère 26) ; aucun résultat et refus", async () => {
    const calls = fakeCalls();
    const { container } = renderScreen(calls, { api: true });
    await rechercher("  librairie ");
    expect(calls.searchPlaces).toHaveBeenCalledWith({ tripId: edimbourg.id, day: 2, query: "librairie" });
    const radios = within(results()).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual([`${NOM_GOOGLE} 1, ${ADRESSE_GOOGLE} 1`, `${NOM_GOOGLE} 2`]);
    for (const radio of radios) expect(radio).toHaveAttribute("aria-checked", "false");
    expect(container.querySelector("[data-part='annonce']")).toHaveTextContent("2 résultats.");
    expect(screen.getByText("Données de lieux : Google")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);

    calls.searchPlaces.mockResolvedValueOnce({ ok: true, value: [] });
    await rechercher("aucun lieu");
    expect(container.querySelector("[data-part='annonce']")).toHaveTextContent("Aucun lieu trouvé. Essaie un autre nom.");
    expect(screen.queryByRole("radiogroup", { name: "Résultats" })).toBeNull();

    calls.searchPlaces.mockResolvedValueOnce({ ok: false, error: { code: "rate_limited", retryable: true } });
    await rechercher("musée");
    expect(screen.getByText("Tu as fait beaucoup de recherches aujourd'hui pour ce voyage. Réessaie demain.")).toBeInTheDocument();

    calls.searchPlaces.mockResolvedValueOnce({ ok: false, error: { code: "provider_error", retryable: true } });
    await rechercher("musée");
    expect(screen.getByText("La recherche n'est pas disponible pour le moment. Réessaie plus tard.")).toBeInTheDocument();
  });

  it("`mock` : résultats simulés, sans mention Google", async () => {
    renderScreen(fakeCalls());
    await rechercher("librairie");
    expect(screen.queryByText("Données de lieux : Google")).toBeNull();
  });
});

describe("ajouter: nom et moment", () => {
  it("le nom n'est jamais prérempli par le nom Google ni la requête (critère 19, C28) ; moment proposé : temps libre 15:00 – 18:30", async () => {
    renderScreen(fakeCalls(), { api: true });
    await rechercher("librairie");
    fireEvent.click(within(results()).getByRole("radio", { name: `${NOM_GOOGLE} 1, ${ADRESSE_GOOGLE} 1` }));
    expect(nameField()).toHaveValue("");
    expect(nameField()).not.toHaveAttribute("placeholder");
    expect(screen.getByText("C'est le nom qui apparaîtra dans ton programme.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reprendre/i })).toBeNull();
    expect(within(moments()).getByRole("radio", { name: "Temps libre 15:00 – 18:30" })).toHaveAttribute("aria-checked", "true");
    // Changer de résultat garde la saisie (F7-PO-21) et ne recopie toujours rien.
    fireEvent.change(nameField(), { target: { value: "Ma librairie" } });
    fireEvent.click(within(results()).getByRole("radio", { name: `${NOM_GOOGLE} 2` }));
    expect(nameField()).toHaveValue("Ma librairie");
  });

  it("nom vide : « Donne un nom à ce lieu. », focus sur le champ, aucun aperçu", async () => {
    const calls = fakeCalls();
    renderScreen(calls);
    await rechercher("librairie");
    fireEvent.click(within(results()).getAllByRole("radio")[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Voir l'effet" }));
    });
    expect(screen.getByText("Donne un nom à ce lieu.")).toHaveAttribute("role", "alert");
    expect(nameField()).toHaveFocus();
    expect(calls.previewAddPlace).not.toHaveBeenCalled();
  });
});

describe("ajouter: aperçu et application", () => {
  it("la demande ne porte ni nom Google, ni adresse, ni requête (critère 21) ; aperçu, « Temps de trajet calculé après l'ajout »", async () => {
    const calls = fakeCalls();
    const { container } = renderScreen(calls, { api: true });
    await choisirEtVoir("  Ma librairie ");
    expect(calls.previewAddPlace).toHaveBeenCalledWith({ tripId: edimbourg.id, baseVersion: 5, day: 2, time: "15:00", kind: "activity", name: "Ma librairie", resultId: "ChIJ-M5D-1" });
    const corps = JSON.stringify(calls.previewAddPlace.mock.calls);
    for (const interdit of [NOM_GOOGLE, ADRESSE_GOOGLE, "bouquiniste", "displayName", "address"]) expect(corps).not.toContain(interdit);
    expect(screen.getByRole("heading", { level: 2, name: "Ma librairie" })).toHaveFocus();
    expect(screen.getByText("15:00 – 16:30")).toBeInTheDocument();
    expect(screen.getByText("Temps de trajet calculé après l'ajout")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ce qui change" })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("refus du moteur : bandeau « pas de place » avec le focus, rien d'écrit (critère 22, Q770)", async () => {
    const calls = fakeCalls({ previewAddPlace: vi.fn(async (): Promise<Result<RevisionPreview>> => ({ ok: false, error: { code: "no_option", retryable: false } })) });
    const { container } = renderScreen(calls);
    await choisirEtVoir("Ma librairie");
    const bandeau = container.querySelector("[data-part='bandeau-pas-de-place']");
    expect(bandeau).toHaveFocus();
    expect(bandeau).toHaveTextContent("Ce lieu ne trouve pas sa place à ce moment, ou on n'a pas pu vérifier qu'il est ouvert.");
    expect(calls.applyAddPlace).not.toHaveBeenCalled();
  });

  it("conflit de version : bandeau et « Revoir l'effet » sur la version relue", async () => {
    const preview = vi
      .fn<AjouterLieuCalls["previewAddPlace"]>()
      .mockResolvedValueOnce({ ok: false, error: { code: "version_conflict", retryable: true, currentVersion: 8 } })
      .mockResolvedValueOnce({ ok: true, value: apercu("Ma librairie") });
    renderScreen(fakeCalls({ previewAddPlace: preview }), { api: true });
    await choisirEtVoir("Ma librairie");
    expect(screen.getByText("Ton programme a changé entre-temps. Rien n'a été modifié.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revoir l'effet" }));
    });
    expect(preview).toHaveBeenLastCalledWith(expect.objectContaining({ baseVersion: 8 }));
  });

  it("« Appliquer » sur `api` : `[add, lock]` demandé avec un `requestId`, toast « Lieu ajouté. », retour à la Journée ; « Annuler » revient à la version d'avant", async () => {
    const calls = fakeCalls();
    renderScreen(calls, { api: true });
    await choisirEtVoir("Ma librairie");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    });
    expect(calls.applyAddPlace).toHaveBeenCalledWith({
      tripId: edimbourg.id,
      baseVersion: 5,
      day: 2,
      time: "15:00",
      kind: "activity",
      name: "Ma librairie",
      resultId: "ChIJ-M5D-1",
      requestId: "00000000-0000-4000-8000-000000000001",
    });
    expect(JSON.stringify(calls.applyAddPlace.mock.calls)).not.toContain(NOM_GOOGLE);
    expect(router.push).toHaveBeenCalledWith("/voyages/mock_trip_edimbourg/jour/2", { scroll: false });
    expect(screen.getByText("Lieu ajouté.")).toBeInTheDocument();
    // Aucune donnée de la recherche dans le stockage du navigateur (S3 point 4).
    expect(JSON.stringify({ ...window.localStorage })).not.toContain("SENTINELLE");
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain("SENTINELLE");
    await act(async () => {
      // « Annuler » du toast (l'écran reste monté ici : la navigation est simulée).
      fireEvent.click(screen.getAllByRole("button", { name: "Annuler" }).at(-1)!);
    });
    expect(calls.applyRevert).toHaveBeenCalledWith({ tripId: edimbourg.id, requestId: "00000000-0000-4000-8000-000000000001", baseVersion: 6, toVersion: 5 });
  });

  it("refus à l'application : bandeau d'erreur, l'écran reste ouvert", async () => {
    const calls = fakeCalls({ applyAddPlace: vi.fn(async (): Promise<Result<PatchResult>> => ({ ok: false, error: { code: "provider_error", retryable: true } })) });
    renderScreen(calls);
    await choisirEtVoir("Ma librairie");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    });
    expect(screen.getByText("Le calcul n'est pas disponible pour le moment. Ton programme est inchangé. Réessaie plus tard.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});
