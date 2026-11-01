import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Result, TripRemindersStatus } from "@/contracts";
import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { RappelsInterrupteur } from "./RappelsInterrupteur";
import { SejourPanel } from "./SejourPanel";
import { TripShell } from "./TripShell";

/**
 * Interrupteur « Rappel par e-mail la veille » (M6c, ticket 1021 ; spécification M6 § 5.2, § 6.3 critère 1 et § 7) : rendu
 * seul (action injectée), puis dans le Séjour (présence selon l'état lu par la page et le déblocage). Hors ligne simulé par
 * `navigator.onLine` (`useOnline`).
 */

const action = vi.hoisted(() => ({ setTripReminders: vi.fn() }));
vi.mock("@/server/actions/rappels", () => action);
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

const TRIP = "0b000000-0000-4000-8000-00000000000b";
const NOM = "Rappel par e-mail la veille";
const AIDE = "Chaque soir vers 18:00, heure de ta destination, un e-mail avec le lien de ta journée du lendemain. Tu peux l'arrêter à tout moment.";
const HORS_LIGNE = "Tu es hors ligne. Modifier les rappels demande une connexion.";

function enLigne(valeur: boolean) {
  return vi.spyOn(navigator, "onLine", "get").mockReturnValue(valeur);
}

const reussite = (active: boolean): Result<TripRemindersStatus> => ({
  ok: true,
  value: { active },
});

afterEach(() => {
  vi.restoreAllMocks();
  action.setTripReminders.mockReset();
});

describe("RappelsInterrupteur", () => {
  it("critère 1 : éteint par défaut, role switch, nom et description du § 7, cible tactile ; axe sans violation", async () => {
    enLigne(true);
    const { container } = render(<RappelsInterrupteur tripId={TRIP} active={false} modifier={vi.fn()} />);
    const interrupteur = screen.getByRole("switch", { name: NOM });
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
    expect(interrupteur).toHaveAccessibleDescription(AIDE);
    expect(interrupteur).toHaveClass("min-h-(--touch-target)");
    expect(interrupteur).not.toHaveAttribute("aria-disabled");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("activer : action { tripId, enabled: true }, interrupteur allumé, annonce « Rappels activés. » ; éteindre : « Rappels arrêtés. »", async () => {
    enLigne(true);
    const modifier = vi.fn(async ({ enabled }: { tripId: string; enabled: boolean }) => reussite(enabled));
    render(<RappelsInterrupteur tripId={TRIP} active={false} modifier={modifier} />);
    const interrupteur = screen.getByRole("switch", { name: NOM });
    fireEvent.click(interrupteur);
    await waitFor(() => expect(interrupteur).toHaveAttribute("aria-checked", "true"));
    expect(modifier).toHaveBeenCalledWith({ tripId: TRIP, enabled: true });
    expect(screen.getByRole("status")).toHaveTextContent("Rappels activés.");
    fireEvent.click(interrupteur);
    await waitFor(() => expect(interrupteur).toHaveAttribute("aria-checked", "false"));
    expect(modifier).toHaveBeenLastCalledWith({ tripId: TRIP, enabled: false });
    expect(screen.getByRole("status")).toHaveTextContent("Rappels arrêtés.");
  });

  it("pendant l'enregistrement, un second geste est ignoré ; l'état ne bascule qu'à la réponse", async () => {
    enLigne(true);
    let resoudre: (r: Result<TripRemindersStatus>) => void = () => undefined;
    const modifier = vi.fn(() => new Promise<Result<TripRemindersStatus>>((r) => (resoudre = r)));
    render(<RappelsInterrupteur tripId={TRIP} active={false} modifier={modifier} />);
    const interrupteur = screen.getByRole("switch", { name: NOM });
    fireEvent.click(interrupteur);
    fireEvent.click(interrupteur);
    expect(modifier).toHaveBeenCalledTimes(1);
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
    // Revue de la PR 1024 (UX/UI, mineur 12) : enregistrement visible, interrupteur atténué tant que `aria-busy`.
    expect(interrupteur).toHaveAttribute("aria-busy", "true");
    expect(interrupteur).toHaveClass("aria-busy:opacity-60");
    await act(async () => resoudre(reussite(true)));
    expect(interrupteur).toHaveAttribute("aria-checked", "true");
    expect(interrupteur).not.toHaveAttribute("aria-busy");
  });

  it("mineur 13 (revue de la PR 1024) : le bandeau d'erreur est effacé dès le début du nouvel essai", async () => {
    enLigne(true);
    let resoudre: (r: Result<TripRemindersStatus>) => void = () => undefined;
    const modifier = vi.fn<(input: { tripId: string; enabled: boolean }) => Promise<Result<TripRemindersStatus>>>();
    modifier.mockResolvedValueOnce({ ok: false, error: { code: "internal", retryable: true } }).mockImplementationOnce(() => new Promise((r) => (resoudre = r)));
    render(<RappelsInterrupteur tripId={TRIP} active={false} modifier={modifier} />);
    fireEvent.click(screen.getByRole("switch", { name: NOM }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await act(async () => resoudre(reussite(true)));
    expect(screen.getByRole("switch", { name: NOM })).toHaveAttribute("aria-checked", "true");
  });

  it("mineur 11 (revue de la PR 1024) : erreur puis hors ligne, « Réessayer » en aria-disabled, décrit par le bandeau hors ligne, sans effet", async () => {
    const enLigneSpy = enLigne(true);
    const modifier = vi.fn<(input: { tripId: string; enabled: boolean }) => Promise<Result<TripRemindersStatus>>>();
    modifier.mockResolvedValue({ ok: false, error: { code: "internal", retryable: true } });
    const { container } = render(<RappelsInterrupteur tripId={TRIP} active={false} modifier={modifier} />);
    fireEvent.click(screen.getByRole("switch", { name: NOM }));
    await screen.findByRole("alert");
    enLigneSpy.mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    const reessayer = screen.getByRole("button", { name: "Réessayer" });
    expect(reessayer).toHaveAttribute("aria-disabled", "true");
    expect(reessayer).toHaveAccessibleDescription(HORS_LIGNE);
    fireEvent.click(reessayer);
    expect(modifier).toHaveBeenCalledTimes(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("échec : alerte « Impossible de modifier les rappels pour le moment. » et « Réessayer », qui rejoue le geste ; état inchangé", async () => {
    enLigne(true);
    const modifier = vi.fn<(input: { tripId: string; enabled: boolean }) => Promise<Result<TripRemindersStatus>>>();
    modifier
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "rate_limited", retryable: true },
      })
      .mockResolvedValueOnce(reussite(true));
    const { container } = render(<RappelsInterrupteur tripId={TRIP} active={false} modifier={modifier} />);
    const interrupteur = screen.getByRole("switch", { name: NOM });
    fireEvent.click(interrupteur);
    const alerte = await screen.findByRole("alert");
    expect(alerte).toHaveTextContent("Impossible de modifier les rappels pour le moment.");
    expect(interrupteur).toHaveAttribute("aria-checked", "false");
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(interrupteur).toHaveAttribute("aria-checked", "true"));
    expect(modifier).toHaveBeenLastCalledWith({ tripId: TRIP, enabled: true });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("hors ligne : aria-disabled, décrit par le bandeau hors ligne, aucun appel au geste", async () => {
    enLigne(false);
    const modifier = vi.fn();
    const { container } = render(<RappelsInterrupteur tripId={TRIP} active modifier={modifier} />);
    const interrupteur = screen.getByRole("switch", { name: NOM });
    expect(interrupteur).toHaveAttribute("aria-disabled", "true");
    expect(interrupteur).toHaveAccessibleDescription(`${AIDE} ${HORS_LIGNE}`);
    fireEvent.click(interrupteur);
    expect(modifier).not.toHaveBeenCalled();
    expect(interrupteur).toHaveAttribute("aria-checked", "true");
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe("SejourPanel : interrupteur des rappels (critère 1)", () => {
  function renderSejour(trip: typeof edimbourg, rappels: { active: boolean } | null) {
    return render(
      <TripShell trip={trip} maps={[]} base="/voyages">
        <SejourPanel rappels={rappels} />
      </TripShell>,
    );
  }

  it("voyage débloqué avec l'état lu par la page : interrupteur rendu, à l'état lu", async () => {
    enLigne(true);
    renderSejour(edimbourgDebloque, { active: true });
    expect(await screen.findByRole("switch", { name: NOM })).toHaveAttribute("aria-checked", "true");
  });

  it("sans état (rappels indisponibles : port non branché, autre adaptateur) : aucun interrupteur ni texte", async () => {
    enLigne(true);
    const { container } = renderSejour(edimbourgDebloque, null);
    await act(async () => undefined);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(container).not.toHaveTextContent(AIDE);
  });

  it("voyage non débloqué : aucun interrupteur, sauf un accord actif, qui reste toujours retirable", async () => {
    enLigne(true);
    const { unmount } = renderSejour(edimbourg, { active: false });
    await act(async () => undefined);
    expect(screen.queryByRole("switch")).toBeNull();
    unmount();
    renderSejour(edimbourg, { active: true });
    expect(await screen.findByRole("switch", { name: NOM })).toHaveAttribute("aria-checked", "true");
  });
});
