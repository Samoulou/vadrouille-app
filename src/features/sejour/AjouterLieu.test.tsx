import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockPlaces } from "@/adapters/mock-lieux";
import { ADDED_STOP_NAME_MAX, type DayLineItem, type PatchResult, type PlaceSearchResult, type Result, type RevisionPreview, type Trip } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { AjouterLieuView, NOM_LIEU_MAX, type AjouterLieuCalls } from "./AjouterLieu";
import type { EntreeAjout } from "./ajouter-lieu";
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
  {
    trip = DEBLOQUE,
    api = false,
    resultatsGoogle = api,
    entree = null,
    newRequestId = () => "00000000-0000-4000-8000-000000000001",
  }: { trip?: Trip; api?: boolean; resultatsGoogle?: boolean; entree?: EntreeAjout | null; newRequestId?: () => string } = {},
) {
  return render(
    <TripShell trip={trip} maps={[]} base="/voyages" versionable revisionVersion={api ? 5 : null}>
      <AjouterLieuView
        dayIndex={2}
        entree={entree}
        durees={DUREES}
        versionSimulee={api ? null : 1}
        resultatsGoogle={resultatsGoogle}
        calls={calls}
        newRequestId={newRequestId}
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

  it("nom : 80 caractères au plus, comme le contrat (M5-PO-10)", async () => {
    expect(NOM_LIEU_MAX).toBe(ADDED_STOP_NAME_MAX);
    renderScreen(fakeCalls());
    await rechercher("librairie");
    fireEvent.click(within(results()).getAllByRole("radio")[0]!);
    expect(nameField()).toHaveAttribute("maxLength", String(ADDED_STOP_NAME_MAX));
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

  it("tout `no_option` (lieu fermé ou introuvable compris, en attendant la cause dans le contrat) : texte du manque de place (0154 § 1), focus, rien d'écrit", async () => {
    const calls = fakeCalls({ previewAddPlace: vi.fn(async (): Promise<Result<RevisionPreview>> => ({ ok: false, error: { code: "no_option", retryable: false } })) });
    const { container } = renderScreen(calls, { api: true });
    await choisirEtVoir("Ma librairie");
    const bandeau = container.querySelector("[data-part='bandeau-pas-de-place']");
    expect(bandeau).toHaveFocus();
    expect(bandeau).toHaveTextContent("Pas de place à ce moment-là. Ton programme est inchangé. Choisis un autre moment ou un autre jour.");
    expect(calls.applyAddPlace).not.toHaveBeenCalled();
  });

  it("trop de gestes (`rate_limited`) : texte de 0154, sans « Réessayer »", async () => {
    const calls = fakeCalls({ previewAddPlace: vi.fn(async (): Promise<Result<RevisionPreview>> => ({ ok: false, error: { code: "rate_limited", retryable: true } })) });
    renderScreen(calls, { api: true });
    await choisirEtVoir("Ma librairie");
    expect(screen.getByText("Trop de retouches en peu de temps. Ton programme est inchangé. Réessaie dans une heure.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Réessayer" })).toBeNull();
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

  it("réponse perdue à l'application : « Réessayer » rejoue le même `requestId` tant que l'aperçu ne change pas (0147 A.7)", async () => {
    const apply = vi
      .fn<AjouterLieuCalls["applyAddPlace"]>()
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValueOnce({ ok: true, value: { version: 6, touchedDays: [2], changes: [] } });
    let tirage = 0;
    renderScreen(fakeCalls({ applyAddPlace: apply }), { api: true, newRequestId: () => `00000000-0000-4000-8000-00000000000${String(++tirage)}` });
    await choisirEtVoir("Ma librairie");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]?.[0]).toMatchObject({ requestId: "00000000-0000-4000-8000-000000000001" });
    expect(apply.mock.calls[1]?.[0]).toMatchObject({ requestId: "00000000-0000-4000-8000-000000000001" });
  });
});

/** Jour du critère 22 sans temps libre assez long : A 09:00 – 10:30, temps libre 10:30 – 11:15, B et D verrouillées, C. */
const etape = (id: string, start: string, end: string, locked = false): DayLineItem => ({
  type: "stop",
  stop: { id, kind: "activity", placeId: `mock_place_${id}`, name: `[${id}]`, start, end, facts: {}, exceptions: [], locked },
});
const CRITERE_22: Trip = {
  ...DEBLOQUE,
  days: DEBLOQUE.days.map((day) =>
    day.index === 2
      ? {
          ...day,
          items: [
            etape("A", "09:00", "10:30"),
            { type: "free", from: "10:30", to: "11:15" },
            etape("B", "11:15", "13:00", true),
            etape("C", "13:00", "14:30"),
            etape("D", "14:30", "18:00", true),
          ],
        }
      : day,
  ),
};

describe("ajouter: critère 22 sur `mock`", () => {
  it("aucune heure proposée, « Temps libre 10:30 – 11:15 » choisi, « Voir l'effet » → `no_option`, texte de la spécification, aucune version écrite", async () => {
    // Adaptateur `mock` réel (M5d-1) : seule la demande d'application est observée, rien n'est simulé au-delà.
    const adaptateur = createMockPlaces({ trips: { getTrip: async () => CRITERE_22 }, store: { records: [] }, now: () => 0, plafond: 20, durees: DUREES, max: 100 });
    const ctx = { organizationId: "org", userId: "user", role: "owner" as const };
    const calls = {
      searchPlaces: (input: unknown) => adaptateur.searchPlaces(ctx, input),
      previewAddPlace: vi.fn((input: unknown) => adaptateur.previewAddPlace(ctx, input)),
      applyAddPlace: vi.fn((input: unknown) => adaptateur.applyAddPlace(ctx, input)),
      applyRevert: vi.fn<AjouterLieuCalls["applyRevert"]>(),
    };
    const { container } = renderScreen(calls, { trip: CRITERE_22 });
    await rechercher("bouquiniste");
    fireEvent.click(within(results()).getByRole("radio", { name: "Lieu simulé 1, Adresse simulée 1" }));
    fireEvent.change(nameField(), { target: { value: "Ma librairie" } });
    const options = within(moments()).getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual(["Temps libre 10:30 – 11:15"]);
    expect(options[0]).toHaveAttribute("aria-checked", "false");
    fireEvent.click(options[0]!);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Voir l'effet" }));
    });
    expect(calls.previewAddPlace).toHaveBeenCalledWith(expect.objectContaining({ day: 2, time: "10:30", kind: "activity" }));
    expect(await calls.previewAddPlace.mock.results[0]?.value).toMatchObject({ ok: false, error: { code: "no_option" } });
    const bandeau = container.querySelector("[data-part='bandeau-pas-de-place']");
    expect(bandeau).toHaveTextContent("Pas de place à ce moment-là. Ton programme est inchangé. Choisis un autre moment ou un autre jour.");
    expect(bandeau).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Appliquer" })).toBeNull();
    expect(calls.applyAddPlace).not.toHaveBeenCalled();
  });
});

describe("ajouter: « Ajouter à ma journée » (`?idee=`, F7-PO-8, F7-PO-10)", () => {
  it("sans recherche : l'idée du jour est le lieu choisi, nom prérempli et modifiable, `placeId` de l'idée envoyé", async () => {
    const calls = fakeCalls();
    renderScreen(calls, { entree: { type: "idee", id: "j2-surprise-circus-lane" } });
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "[Circus Lane]" })).toBeInTheDocument();
    expect(nameField()).toHaveValue("[Circus Lane]");
    fireEvent.change(nameField(), { target: { value: "Ma ruelle" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Voir l'effet" }));
    });
    expect(calls.previewAddPlace).toHaveBeenCalledWith(expect.objectContaining({ name: "Ma ruelle", resultId: "mock_place_circus_lane" }));
    expect(calls.searchPlaces).not.toHaveBeenCalled();
  });

  it("idée d'un autre jour : écran ordinaire, nom vide", () => {
    renderScreen(fakeCalls(), { entree: { type: "idee", id: "j4-surprise-dunbars-close" } });
    expect(searchField()).toBeInTheDocument();
  });
});

describe("ajouter: retour sans application", () => {
  it("« Retour à la Journée » revient à la Journée", () => {
    renderScreen(fakeCalls());
    fireEvent.click(screen.getByRole("button", { name: "Retour à la Journée" }));
    expect(router.replace).toHaveBeenCalledWith("/voyages/mock_trip_edimbourg/jour/2", { scroll: false });
  });
});
