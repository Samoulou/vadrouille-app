import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPagesLegales } from "@/adapters";
import { PRODUCT_NAME } from "@/config/site";
import { PageLegale, titrePageLegale } from "@/features/accueil/PageLegale";
import { formatPrice } from "@/features/presentation/price";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

// `PREVENTE` et l'identité du vendeur sont lus à chaque requête.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: format(messages.legal.titreDocument, { titre: titrePageLegale("mentions"), produit: PRODUCT_NAME }),
  robots: { index: false, follow: false },
};

/** « Qui vend … » (ticket 1125). Précommande fermée, ou identité du vendeur absente ou invalide : 404. */
export default function MentionsLegalesPage() {
  const legal = getPagesLegales();
  if (!legal) notFound();
  return (
    <PageLegale
      page="mentions"
      vendeur={legal.vendeur}
      prix={formatPrice(legal.prevente.amount, legal.prevente.currency)}
      publication={legal.publication}
      conservation={legal.conservation}
    />
  );
}
