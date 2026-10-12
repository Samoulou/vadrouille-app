import type { ReactNode } from "react";

import { DraftProvider } from "@/features/creation/DraftProvider";

/**
 * Layout du groupe de routes `(creation)` (décision 0017 § 5, F8-TL-5) : il ne monte que le brouillon en mémoire
 * de l'onglet, commun aux écrans de la création. Naviguer entre ces écrans le garde ; recharger le perd. Aucune
 * lecture de données, aucun stockage navigateur.
 */
export default function CreationLayout({ children }: { children: ReactNode }) {
  return <DraftProvider>{children}</DraftProvider>;
}
