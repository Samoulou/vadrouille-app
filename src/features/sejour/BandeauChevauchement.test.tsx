import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Day, DayLineItem, Stop, TransferItem, Trip } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { romeFlorence } from "@/mocks/rome-florence";

import { axeViolations } from "../../../tests/unit/axe";

import { messageDuChevauchement } from "./BandeauChevauchement";
import { JourneePanel } from "./JourneePanel";
import { tripRoutes } from "./routes";
import { SejourOriginProvider } from "./SejourOrigin";
import { SejourPanel } from "./SejourPanel";
import { TripShell } from "./TripShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

/**
 * Spécification M4-suite § 5 et § 6, critère 12 (décision UX-M4S-A) : bandeau de chevauchement de la Journée du changement
 * de ville. Rome puis Florence ; J3 est le jour du changement de ville. Le calcul est celui du domaine
 * (`chevauchementDuChangement`, testé par M4-suite-back) ; ces tests portent sur le rendu.
 */

const N = " ";
const routes = tripRoutes("/voyages", romeFlorence.id);
const jour = (n: number): Day => romeFlorence.days.find((day) => day.index === n)!;

const BILLET: TransferItem = { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "12:00", end: "13:30", label: "[Train Rome–Florence]" };

function sortie(name: string, start: string, end?: string): Stop {
  return { id: `ev-${name}-${start}`, kind: "event", name, start, ...(end === undefined ? {} : { end }), facts: {}, exceptions: [], locked: false };
}

/** J3 avec la ligne « Vers Florence » donnée et ces événements. */
function j3(events: Stop[], transfer: TransferItem = BILLET, patch: Partial<Day> = {}): Day {
  const items: DayLineItem[] = jour(3).items.map((item) => (item.type === "transfer" ? transfer : item));
  return { ...jour(3), items, events, ...patch };
}

/** Attend le rendu des éléments chargés à la demande (ligne « Vers {ville} », bandeau). */
async function rendre(day: Day) {
  const vue = render(<JourneePanel day={day} routes={routes} />);
  await screen.findByRole("listitem", { name: /^Vers Florence/ });
  await act(async () => {});
  return vue;
}

const bandeaux = (container: HTMLElement) => container.querySelectorAll("[data-kind='overlap']");
/** `kind` des `StatusBanner` rendus (tous en `role="status"` sur la Journée), dans l'ordre du document. */
const kindsDesBandeaux = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("[role='status'][data-kind]")).map((bandeau) => bandeau.getAttribute("data-kind"));

describe("M4-suite: bandeau de chevauchement", () => {
  it("billet de 12:00 à 13:30 et « Concert » de 11:30 à 12:30 : un seul bandeau overlap, role=status, filet ink-soft ; l'action amène le focus sur « Événements du jour »", async () => {
    const { container } = await rendre(j3([sortie("Concert", "11:30", "12:30")]));
    const bandeau = await waitFor(() => {
      const trouve = container.querySelector<HTMLElement>("[data-kind='overlap']");
      expect(trouve).not.toBeNull();
      return trouve!;
    });
    expect(bandeaux(container)).toHaveLength(1);
    expect(bandeau).toHaveAttribute("role", "status");
    expect(bandeau.querySelector("p")!.textContent).toBe(`À 11:30, «${N}Concert${N}» tombe pendant que tu te rends à Florence. Vérifie tes horaires.`);
    expect(bandeau.querySelector("[data-rail]")).toHaveClass("bg-ink-soft");
    expect(bandeau.querySelector("p")).toHaveClass("wrap-anywhere");

    const region = screen.getByRole("region", { name: "Événements du jour" });
    expect(region).toHaveAttribute("tabindex", "-1");
    fireEvent.click(within(bandeau).getByRole("button", { name: "Voir les événements du jour" }));
    expect(document.activeElement).toBe(region);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("aucun bandeau : Sortie qui commence à l'arrivée (13:30), Sortie à 11:00 sans fin, Sortie à 13:45 (dans la marge)", async () => {
    for (const events of [[sortie("A", "13:30", "14:00")], [sortie("B", "11:00")], [sortie("C", "13:45")]]) {
      const { container, unmount } = await rendre(j3(events));
      expect(bandeaux(container)).toHaveLength(0);
      unmount();
    }
  });

  it("Sortie à 12:30 sans heure de fin : bandeau", async () => {
    const { container } = await rendre(j3([sortie("Musée", "12:30")]));
    await waitFor(() => expect(bandeaux(container)).toHaveLength(1));
    expect(bandeaux(container)[0]!.querySelector("p")!.textContent).toBe(`À 12:30, «${N}Musée${N}» tombe pendant que tu te rends à Florence. Vérifie tes horaires.`);
  });

  it("deux Sorties qui chevauchent : un seul bandeau, « 2 de tes réservations… »", async () => {
    const { container } = await rendre(j3([sortie("Concert", "11:30", "12:30"), sortie("Musée", "12:30")]));
    await waitFor(() => expect(bandeaux(container)).toHaveLength(1));
    expect(bandeaux(container)[0]!.querySelector("p")!.textContent).toBe(
      "2 de tes réservations tombent pendant que tu te rends à Florence. Vérifie tes horaires.",
    );
  });

  it("départ estimé à 10:00 avec 480 minutes, Sortie de 17:00 à 19:00 : texte « d'après la durée estimée »", async () => {
    const estime: TransferItem = { type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00", estimatedMinutes: 480, mode: "transit" };
    const { container } = await rendre(j3([sortie("Opéra", "17:00", "19:00")], estime));
    await waitFor(() => expect(bandeaux(container)).toHaveLength(1));
    expect(bandeaux(container)[0]!.querySelector("p")!.textContent).toBe(
      `À 17:00, «${N}Opéra${N}» tombe pendant que tu te rends à Florence, d'après la durée estimée. Vérifie tes horaires.`,
    );
    expect(messageDuChevauchement([estime], [sortie("A", "11:00", "12:00"), sortie("B", "12:00")])).toBe(
      "2 de tes réservations tombent pendant que tu te rends à Florence, d'après la durée estimée. Vérifie tes horaires.",
    );
  });

  it("départ estimé sans durée, ou billet sans heure de fin : aucun bandeau, quelle que soit l'heure", async () => {
    const sansDuree: TransferItem = { type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00" };
    const sansFin: TransferItem = { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "12:00", label: "[Train]" };
    const events = [sortie("A", "10:30", "11:30"), sortie("B", "12:30"), sortie("C", "15:00", "16:00")];
    for (const transfer of [sansDuree, sansFin]) {
      const { container, unmount } = await rendre(j3(events, transfer));
      expect(bandeaux(container)).toHaveLength(0);
      unmount();
    }
  });

  it("ordre : chevauchement, puis budget de trajet ; une journée en préparation n'a pas de bandeau de chevauchement", async () => {
    const depasse = j3([sortie("Concert", "11:30", "12:30")], BILLET, { travelMinutes: 200, travelBudgetMinutes: 90 });
    const { container, unmount } = await rendre(depasse);
    await waitFor(() => expect(bandeaux(container)).toHaveLength(1));
    expect(kindsDesBandeaux(container)).toEqual(["overlap", "travel"]);
    unmount();

    const enPreparation = render(<JourneePanel day={j3([sortie("Concert", "11:30", "12:30")], BILLET, { generating: true })} routes={routes} />);
    await act(async () => {});
    expect(kindsDesBandeaux(enPreparation.container)).toEqual(["generating"]);
  });

  it("aucun bandeau les autres jours (mêmes heures), ni pour Édimbourg seul", async () => {
    const concert = [sortie("Concert", "11:30", "12:30"), sortie("Soir", "12:00", "13:00")];
    for (const n of [1, 2, 4, 5]) {
      const { container, unmount } = render(<JourneePanel day={{ ...jour(n), events: concert }} routes={routes} />);
      await act(async () => {});
      expect(bandeaux(container), `J${n}`).toHaveLength(0);
      unmount();
    }
    for (const day of edimbourg.days) {
      const { container, unmount } = render(<JourneePanel day={day} routes={tripRoutes("/voyages", edimbourg.id)} />);
      await act(async () => {});
      expect(bandeaux(container), `Édimbourg J${day.index}`).toHaveLength(0);
      unmount();
    }
  });

  it("aucun bandeau sur Séjour, même quand un engagement chevauche la ligne de J3", async () => {
    const trip: Trip = { ...romeFlorence, days: romeFlorence.days.map((day) => (day.index === 3 ? j3([sortie("Concert", "11:30", "12:30")]) : day)) };
    const { container } = render(
      <TripShell trip={trip} maps={[]} base="/voyages" unlockHref={null}>
        <SejourOriginProvider>
          <SejourPanel recorder={createMemoryRecorder()} />
        </SejourOriginProvider>
      </TripShell>,
    );
    await act(async () => {});
    expect(bandeaux(container)).toHaveLength(0);
  });

  it("seule la Journée rend le bandeau overlap : aucun autre écran (5, 6, Pendant le voyage, vue partagée) ne l'emploie", () => {
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom)) fichiers.push(chemin);
      }
    };
    parcourir("src");
    const emplois = fichiers.filter((fichier) => /kind="overlap"|kind: "overlap"/.test(readFileSync(fichier, "utf8")));
    expect(emplois).toEqual([join("src", "features", "sejour", "BandeauChevauchement.tsx")]);
  });
});
