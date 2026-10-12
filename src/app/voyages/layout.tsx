import type { ReactNode } from "react";

import { TripSessionProvider } from "@/features/voyage/TripSessionProvider";

/**
 * Layout commun à « Mes voyages » (`R17`) et aux écrans du voyage (`R6`, `R9` et ses sous-routes, `R11`, la
 * Journée ; décisions 0020 § 8 et 0021 § 4) : il ne monte **que** le fournisseur de l'onglet, pour que `R17`
 * lise l'état de chaque voyage (dernier onglet consulté) sans second fournisseur. Ni `TripShell`, ni lecture de
 * données, ni dépendance ; le groupe `(programme)` garde seul la carte et le panneau (0016 § 1.1).
 */
export default function VoyagesLayout({ children }: { children: ReactNode }) {
  return <TripSessionProvider>{children}</TripSessionProvider>;
}
