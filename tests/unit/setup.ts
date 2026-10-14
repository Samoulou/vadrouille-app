import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { clesDeServicePosees } from "@/server/env/garde-cles";

// P0r1 (`p0: aucune clé dans l'environnement des tests`) : Vitest ne démarre pas si une clé de service est posée.
const posees = clesDeServicePosees();
if (posees.length > 0) {
  throw new Error(`Clé de service posée dans l'environnement des tests (${posees.join(", ")}) : retire-la avant de lancer Vitest.`);
}

afterEach(() => {
  cleanup();
});
