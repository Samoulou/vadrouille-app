import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail, type PatchResult, type Result, type RevertPreview, type TripVersionPage, type TripVersionSummary } from "@/contracts";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { TripShell } from "./TripShell";
import { VersionsView, type VersionCalls } from "./VersionsView";

/**
 * « Versions du programme » (tâche M5b, ticket 934 ; spécification M5 § 4 ; décision 0147 § 5.3) avec des actions
 * injectées : liste, groupe « Avant le déblocage », pages, aperçu « Ce qui change », phrase des étapes verrouillées,
 * « Appliquer » et toast « Programme rétabli. », « Annuler » du toast (retour ordinaire), conflit, borne, hors ligne.
 */

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

const TRIP = edimbourgDebloque.id;
const ZONE = "Europe/Zurich";

const v = (version: number, extra: Partial<TripVersionSummary>): TripVersionSummary => ({
  version,
  createdAt: `2026-10-2${version}T12:05:00.000Z`,
  kind: "complete",
  current: false,
  revertible: true,
  ...extra,
});

const PAGE: TripVersionPage = {
  items: [
    v(4, { kind: "locked", subject: "Château d'Édimbourg", current: true, revertible: false }),
    v(3, { kind: "unlocked", subject: "Château d'Édimbourg" }),
    v(2, { kind: "complete" }),
    v(1, { kind: "prepared", revertible: false }),
  ],
  nextBefore: null,
};

const APERCU: RevertPreview = {
  baseVersion: 4,
  toVersion: 3,
  changes: [{ type: "unlocked", label: "Château d'Édimbourg", time: "10:00" }],
  currentHasLockedStop: true,
};

function fakeCalls(over: Partial<VersionCalls> = {}) {
  return {
    listTripVersions: vi.fn(async (): Promise<Result<TripVersionPage>> => ({ ok: true, value: PAGE })),
    previewRevert: vi.fn(async (): Promise<Result<RevertPreview>> => ({ ok: true, value: APERCU })),
    applyRevert: vi.fn(async (): Promise<Result<PatchResult>> => ({ ok: true, value: { version: 5, touchedDays: [1], changes: APERCU.changes } })),
    ...over,
  };
}

function renderVersions(calls: VersionCalls, initial: TripVersionPage | null = PAGE) {
  let n = 0;
  return render(
    <TripShell trip={edimbourgDebloque} maps={[]} base="/voyages" versionable>
      <VersionsView tripId={TRIP} initial={initial} calls={calls} timeZone={ZONE} newRequestId={() => `00000000-0000-4000-8000-00000000000${++n}`} />
    </TripShell>,
  );
}

const liste = () => document.querySelector<HTMLElement>("[data-part='liste-versions']")!;
const revenir = (version: number) => within(document.querySelector<HTMLElement>(`[data-version="${version}"]`)!).getByRole("button", { name: /^Revenir à cette version : / });

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

describe("versions: liste", () => {
  it("titre avec le focus ; de la plus récente à la plus ancienne ; « Version actuelle » sur la première ; noms du programme ; axe", async () => {
    const { container } = renderVersions(fakeCalls());
    const titre = screen.getByRole("heading", { level: 1, name: "Versions du programme" });
    expect(titre).toHaveFocus();
    const lignes = within(liste()).getAllByRole("listitem");
    expect(lignes.map((li) => li.querySelector("[data-part='libelle']")?.textContent)).toEqual([
      "Château d'Édimbourg verrouillé",
      "Verrou retiré : Château d'Édimbourg",
      "Voyage complet",
    ]);
    expect(within(lignes[0]!).getByText("Version actuelle")).toBeInTheDocument();
    expect(within(lignes[0]!).queryByRole("button")).toBeNull();
    // Boutons nommés par leur version (WCAG 2.4.6) ; texte visible « Revenir à cette version ».
    const bouton = within(lignes[1]!).getByRole("button", { name: "Revenir à cette version : Verrou retiré : Château d'Édimbourg" });
    expect(bouton).toHaveTextContent("Revenir à cette version");
    expect(lignes[0]!.querySelector("[data-part='moment']")).toHaveTextContent("sam. 24.10, 14:05");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("versions d'avant le déblocage : à part, sous « Avant le déblocage », sans bouton", () => {
    renderVersions(fakeCalls());
    const avant = screen.getByRole("region", { name: "Avant le déblocage" });
    expect(within(avant).getByText("Programme préparé")).toBeInTheDocument();
    expect(within(avant).queryByRole("button")).toBeNull();
  });

  it("« Voir les versions plus anciennes » : page suivante avec `before`, ajoutée à la suite, focus sur la première nouvelle", async () => {
    const page2: TripVersionPage = { items: [v(1, { kind: "prepared", revertible: false })], nextBefore: null };
    const calls = fakeCalls({ listTripVersions: vi.fn(async () => ({ ok: true as const, value: page2 })) });
    renderVersions(calls, { items: PAGE.items.slice(0, 3), nextBefore: 2 });
    expect(screen.queryByText("Programme préparé")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Voir les versions plus anciennes" }));
    expect(document.querySelector("[data-part='versions-statut']")).toHaveTextContent("Chargement des versions.");
    await waitFor(() => expect(screen.getByText("Programme préparé")).toBeInTheDocument());
    expect(document.querySelector("[data-part='versions-statut']")).toHaveTextContent("");
    expect(calls.listTripVersions).toHaveBeenCalledWith({ tripId: TRIP, before: 2 });
    await waitFor(() => expect(document.querySelector("[data-version='1']")).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Voir les versions plus anciennes" })).toBeNull();
  });

  it("première page illisible : bandeau d'erreur et « Réessayer », qui relit la liste", async () => {
    const calls = fakeCalls();
    const { container } = renderVersions(calls, null);
    expect(document.querySelector("[data-part='liste-versions']")).toBeNull();
    expect(screen.getByText("Les versions n'ont pas pu être chargées. Réessaie.")).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(liste()).toBeInTheDocument());
    expect(calls.listTripVersions).toHaveBeenCalledWith({ tripId: TRIP });
    expect(screen.queryByText("Les versions n'ont pas pu être chargées. Réessaie.")).toBeNull();
  });
});

describe("versions: aperçu", () => {
  it("« Revenir à cette version » : aperçu avec base et version visée, « Ce qui change », phrase des étapes verrouillées, focus sur son titre", async () => {
    const calls = fakeCalls();
    const { container } = renderVersions(calls);
    fireEvent.click(revenir(3));
    const titre = await screen.findByRole("heading", { level: 2, name: "Revenir à la version du ven. 23.10 à 14:05" });
    await waitFor(() => expect(titre).toHaveFocus());
    expect(calls.previewRevert).toHaveBeenCalledWith({ tripId: TRIP, baseVersion: 4, toVersion: 3 });
    expect(screen.getByText("Ce retour peut toucher des étapes verrouillées.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ce qui change" })).toHaveTextContent("Château d'Édimbourg");
    expect(document.querySelector("[data-part='versions-statut']")).toHaveTextContent("Ce qui change est prêt.");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("rien ne change : « Rien ne change dans ton programme. », sans phrase des étapes verrouillées", async () => {
    renderVersions(fakeCalls({ previewRevert: vi.fn(async () => ({ ok: true as const, value: { ...APERCU, changes: [], currentHasLockedStop: false } })) }));
    fireEvent.click(revenir(2));
    expect(await screen.findByText("Rien ne change dans ton programme.")).toBeInTheDocument();
    expect(screen.queryByText("Ce retour peut toucher des étapes verrouillées.")).toBeNull();
  });

  it("« Annuler » de l'aperçu : rien n'est écrit, retour à la liste, focus sur « Revenir à cette version » de la même ligne", async () => {
    const calls = fakeCalls();
    renderVersions(calls);
    fireEvent.click(revenir(3));
    fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    await waitFor(() => expect(revenir(3)).toHaveFocus());
    expect(calls.applyRevert).not.toHaveBeenCalled();
  });

  it("aperçu refusé (conflit) : bandeau `conflict`, liste relue", async () => {
    const calls = fakeCalls({ previewRevert: vi.fn(async () => ({ ok: false as const, error: { code: "version_conflict" as const, retryable: true, currentVersion: 5 } })) });
    renderVersions(calls);
    fireEvent.click(revenir(3));
    expect(await screen.findByText("Ton programme a changé entre-temps. Regarde la dernière version, puis réessaie.")).toBeInTheDocument();
    await waitFor(() => expect(calls.listTripVersions).toHaveBeenCalledWith({ tripId: TRIP }));
  });

  it("aperçu en échec : « Ce qui change n'a pas pu être calculé… », liste conservée", async () => {
    renderVersions(fakeCalls({ previewRevert: vi.fn(async () => fail("internal")) }));
    fireEvent.click(revenir(3));
    expect(await screen.findByText("Les changements n'ont pas pu être calculés. Ton programme est inchangé. Réessaie.")).toBeInTheDocument();
    expect(revenir(3)).toBeInTheDocument();
  });
});

describe("versions: appliquer", () => {
  it("« Appliquer » : un retour écrit, toast « Programme rétabli. », navigation vers le Séjour ; « Annuler » du toast : retour vers la version d'avant", async () => {
    const calls = fakeCalls();
    renderVersions(calls);
    fireEvent.click(revenir(3));
    fireEvent.click(await screen.findByRole("button", { name: "Appliquer" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/voyages/${TRIP}`));
    expect(calls.applyRevert).toHaveBeenCalledTimes(1);
    expect(calls.applyRevert).toHaveBeenCalledWith({ tripId: TRIP, requestId: "00000000-0000-4000-8000-000000000001", baseVersion: 4, toVersion: 3 });
    expect(await screen.findByText("Programme rétabli.")).toBeInTheDocument();

    const toast = document.querySelector<HTMLElement>("[data-undo-region]")!;
    fireEvent.click(within(toast).getByRole("button", { name: /Annuler/ }));
    await waitFor(() => expect(calls.applyRevert).toHaveBeenCalledTimes(2));
    expect(calls.applyRevert).toHaveBeenLastCalledWith({ tripId: TRIP, requestId: "00000000-0000-4000-8000-000000000002", baseVersion: 5, toVersion: 4 });
  });

  it("double clic sur « Appliquer » : une seule écriture", async () => {
    let resoudre: (r: Result<PatchResult>) => void = () => undefined;
    const calls = fakeCalls({ applyRevert: vi.fn(() => new Promise<Result<PatchResult>>((resolve) => (resoudre = resolve))) });
    renderVersions(calls);
    fireEvent.click(revenir(3));
    const appliquer = await screen.findByRole("button", { name: "Appliquer" });
    fireEvent.click(appliquer);
    fireEvent.click(appliquer);
    expect(calls.applyRevert).toHaveBeenCalledTimes(1);
    await act(async () => resoudre({ ok: true, value: { version: 5, touchedDays: [], changes: [] } }));
  });

  it("borne du nombre de versions (`validation_failed` sur `baseVersion`) : bandeau `trop`, retour à la liste sans « Appliquer », focus sur la ligne, aucune navigation", async () => {
    const calls = fakeCalls({ applyRevert: vi.fn(async () => fail("validation_failed", "baseVersion")) });
    renderVersions(calls);
    fireEvent.click(revenir(3));
    fireEvent.click(await screen.findByRole("button", { name: "Appliquer" }));
    expect(await screen.findByText("Tu as fait beaucoup de retouches sur ce voyage : le retour à une version n'est plus possible.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Appliquer" })).toBeNull();
    await waitFor(() => expect(revenir(3)).toHaveFocus());
    // Refus permanent : pas de relecture de la liste (seul le conflit relit).
    expect(calls.listTripVersions).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("conflit à « Appliquer » : bandeau `conflict`, retour à la liste relue, aucune navigation", async () => {
    const calls = fakeCalls({ applyRevert: vi.fn(async () => ({ ok: false as const, error: { code: "version_conflict" as const, retryable: true, currentVersion: 5 } })) });
    renderVersions(calls);
    fireEvent.click(revenir(3));
    fireEvent.click(await screen.findByRole("button", { name: "Appliquer" }));
    expect(await screen.findByText("Ton programme a changé entre-temps. Regarde la dernière version, puis réessaie.")).toBeInTheDocument();
    await waitFor(() => expect(calls.listTripVersions).toHaveBeenCalled());
    expect(router.push).not.toHaveBeenCalled();
  });

  it("échec réseau à « Appliquer » : « Le retour n'a pas pu être appliqué… », l'aperçu reste", async () => {
    renderVersions(fakeCalls({ applyRevert: vi.fn(async () => Promise.reject(new Error("réseau"))) }));
    fireEvent.click(revenir(3));
    fireEvent.click(await screen.findByRole("button", { name: "Appliquer" }));
    expect(await screen.findByText("Le retour n'a pas pu être appliqué. Ton programme est inchangé. Réessaie.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Appliquer" })).toBeInTheDocument();
  });

  it("hors ligne : bandeau `offline`, « Appliquer » en `aria-disabled` décrit par le bandeau, sans écriture", async () => {
    const calls = fakeCalls();
    renderVersions(calls);
    fireEvent.click(revenir(3));
    const appliquer = await screen.findByRole("button", { name: "Appliquer" });
    setOnline(false);
    expect(appliquer).toHaveAttribute("aria-disabled", "true");
    expect(appliquer.getAttribute("aria-describedby")).toBeTruthy();
    fireEvent.click(appliquer);
    expect(calls.applyRevert).not.toHaveBeenCalled();
    setOnline(true);
    expect(appliquer).not.toHaveAttribute("aria-disabled");
  });
});

describe("versions: correction 1 de la revue de la PR 938", () => {
  it("hors ligne, dans la liste : bandeau `offline`, « Revenir à cette version » en `aria-disabled` décrit par le bandeau, sans aperçu", () => {
    const calls = fakeCalls();
    renderVersions(calls);
    setOnline(false);
    const bandeau = screen.getByText("Tu es hors ligne. Modifier ton programme demande une connexion.");
    const bouton = revenir(3);
    expect(bouton).toHaveAttribute("aria-disabled", "true");
    expect(bandeau.closest("[id]")?.id).toBe(bouton.getAttribute("aria-describedby"));
    fireEvent.click(bouton);
    expect(calls.previewRevert).not.toHaveBeenCalled();
    setOnline(true);
    expect(revenir(3)).not.toHaveAttribute("aria-disabled");
  });

  it("conflit puis relecture en échec : « Les versions n'ont pas pu être chargées. Réessaie. » avec « Réessayer », qui relit la liste", async () => {
    const listTripVersions = vi
      .fn<VersionCalls["listTripVersions"]>()
      .mockResolvedValueOnce(fail("internal"))
      .mockResolvedValue({ ok: true, value: PAGE });
    const calls = fakeCalls({
      listTripVersions,
      previewRevert: vi.fn(async () => ({ ok: false as const, error: { code: "version_conflict" as const, retryable: true, currentVersion: 5 } })),
    });
    renderVersions(calls);
    fireEvent.click(revenir(3));
    expect(await screen.findByText("Les versions n'ont pas pu être chargées. Réessaie.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(listTripVersions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText("Les versions n'ont pas pu être chargées. Réessaie.")).toBeNull());
  });

  it("revenir pendant la lecture des versions plus anciennes, puis « Annuler » : « Voir les versions plus anciennes » redevient actif, sans annonce d'attente", async () => {
    let resoudre: (r: Result<TripVersionPage>) => void = () => undefined;
    const listTripVersions = vi.fn(() => new Promise<Result<TripVersionPage>>((resolve) => (resoudre = resolve)));
    renderVersions(fakeCalls({ listTripVersions }), { items: PAGE.items.slice(0, 3), nextBefore: 2 });
    const plus = screen.getByRole("button", { name: "Voir les versions plus anciennes" });
    fireEvent.click(plus);
    expect(plus).toBeDisabled();
    fireEvent.click(revenir(3));
    fireEvent.click(await screen.findByRole("button", { name: "Annuler" }));
    // La page arrive après le geste : ignorée (jeton dépassé), mais la lecture est terminée.
    await act(async () => resoudre({ ok: true, value: { items: [v(1, { kind: "prepared", revertible: false })], nextBefore: null } }));
    const encore = screen.getByRole("button", { name: "Voir les versions plus anciennes" });
    expect(encore).toBeEnabled();
    expect(document.querySelector("[data-part='versions-statut']")).not.toHaveTextContent("Chargement des versions.");
    expect(screen.queryByText("Programme préparé")).toBeNull();
  });

  it("échec réseau à « Appliquer » (`erreurRetour`) : l'aperçu et « Appliquer » restent, pour réessayer", async () => {
    const applyRevert = vi
      .fn<VersionCalls["applyRevert"]>()
      .mockResolvedValueOnce(fail("internal"))
      .mockResolvedValue({ ok: true, value: { version: 5, touchedDays: [], changes: [] } });
    renderVersions(fakeCalls({ applyRevert }));
    fireEvent.click(revenir(3));
    fireEvent.click(await screen.findByRole("button", { name: "Appliquer" }));
    expect(await screen.findByText("Le retour n'a pas pu être appliqué. Ton programme est inchangé. Réessaie.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/voyages/${TRIP}`));
    expect(applyRevert).toHaveBeenCalledTimes(2);
  });
});
