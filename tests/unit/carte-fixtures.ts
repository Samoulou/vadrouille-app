import { readFileSync } from "node:fs";
import { join } from "node:path";

import { vi } from "vitest";

import type { Day, DayMap } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";

/** Données des tests de la carte : jeu simulé d'Édimbourg (les tests peuvent importer src/mocks). */
export const days: Day[] = edimbourg.days;
export const maps: DayMap[] = edimbourgCarte;
export const day2 = days.find((day) => day.index === 2)!;
export const map2 = maps.find((map) => map.dayIndex === 2)!;
export const day4 = days.find((day) => day.index === 4)!;
export const map4 = maps.find((map) => map.dayIndex === 4)!;

const css = readFileSync(join(process.cwd(), "src/styles/globals.css"), "utf8");

/** Pose sur :root les variables CSS des tokens lues dans globals.css (jsdom ne charge pas la feuille). */
export function applyTokens(names: string[]) {
  for (const name of names) {
    const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
    if (!match?.[1]) {
      throw new Error(`${name} introuvable dans globals.css`);
    }
    document.documentElement.style.setProperty(name, match[1].trim());
  }
}

/** Donne une taille au conteneur de la carte simulée (jsdom n'a pas de mise en page). */
export function stubLayout(width: number, height: number) {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(width);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(height);
}

/** Simule `navigator.onLine` ; renvoie une fonction qui change l'état et émet l'événement. */
export function stubOnline(initial: boolean) {
  let online = initial;
  vi.spyOn(window.navigator, "onLine", "get").mockImplementation(() => online);
  return (next: boolean) => {
    online = next;
    window.dispatchEvent(new Event(next ? "online" : "offline"));
  };
}
