import type { ReactNode } from "react";

import { TripSessionProvider } from "@/features/voyage/TripSessionProvider";

/**
 * Layout commun aux écrans du voyage (`R6`, `R9` et ses sous-routes, `R11`, la Journée ; décision 0020 § 8) :
 * il ne monte **que** le fournisseur de l'onglet. Ni `TripShell`, ni lecture de données, ni dépendance ; le
 * groupe `(programme)` garde seul la carte et le panneau (0016 § 1.1).
 */
export default function VoyageLayout({ children }: { children: ReactNode }) {
  return <TripSessionProvider>{children}</TripSessionProvider>;
}
