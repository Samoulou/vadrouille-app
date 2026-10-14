"use client";

import { DraftProvider } from "@/features/creation/DraftProvider";
import { LodgingScreen } from "@/features/creation/LodgingScreen";
import type { DraftState } from "@/features/creation/draft";

import { SimulatedCarte } from "../../SimulatedCarte";

/**
 * `R3-dev` (décision 0017 § 7) : l'écran 3 avec son propre brouillon de démonstration et la carte simulée, injectée
 * par `SimulatedCarte` (seul point d'entrée de la carte simulée, réservé à `/dev`).
 */
export function DevLogement({ initial }: { initial: DraftState }) {
  return (
    <DraftProvider initial={initial}>
      <SimulatedCarte>
        <LodgingScreen />
      </SimulatedCarte>
    </DraftProvider>
  );
}
