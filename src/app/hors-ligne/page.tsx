import type { Metadata } from "next";

import { OfflineFallback } from "@/features/voyage/OfflineFallback";
import { messages } from "@/i18n";

// Rendu statique à la construction (F10-TL-4) : aucune lecture d'adaptateur, aucun paramètre, aucune donnée.
export const dynamic = "force-static";

export const metadata: Metadata = { title: messages.voyage.horsLigne.titre };

/**
 * Page de repli hors ligne (`R-repli`, spécification F10, F10b ; F10-TL-3). Le service worker l'enregistre à son
 * installation et la sert quand une navigation de l'application échoue faute de réseau.
 */
export default function HorsLignePage() {
  return <OfflineFallback />;
}
