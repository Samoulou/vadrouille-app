import type { Metadata } from "next";

import { PRODUCT_NAME } from "@/config/site";
import { OfflineFallback } from "@/features/voyage/OfflineFallback";
import { format, messages } from "@/i18n";

// Rendu statique à la construction (F10-TL-4) : aucune lecture d'adaptateur, aucun paramètre, aucune donnée.
export const dynamic = "force-static";

// Titre « … · {produit} » comme la page introuvable et la page d'erreur ; page jamais indexée.
export const metadata: Metadata = {
  title: format(messages.voyage.horsLigne.titreDocument, { produit: PRODUCT_NAME }),
  robots: { index: false, follow: false },
};

/**
 * Page de repli hors ligne (`R-repli`, spécification F10, F10b ; F10-TL-3). Le service worker l'enregistre à son
 * installation et la sert quand une navigation de l'application échoue faute de réseau.
 */
export default function HorsLignePage() {
  return <OfflineFallback />;
}
