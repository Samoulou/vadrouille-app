"use client";

import type { ReactNode } from "react";

import { CarteProvider, type CarteInjection } from "@/components/carte";
import { SimulatedMapRenderer } from "@/components/carte/SimulatedMapRenderer";

/** Seul fichier de F5 qui importe la carte simulée (décision 0015 § 1) : elle n'entre dans aucune route produit. */
const INJECTION: CarteInjection = { simulated: SimulatedMapRenderer };

export function SimulatedCarte({ children }: { children: ReactNode }) {
  return <CarteProvider value={INJECTION}>{children}</CarteProvider>;
}
