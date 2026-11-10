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
  title: format(messages.legal.titreDocument, { titre: titrePageLegale("conditions"), produit: PRODUCT_NAME }),
  robots: { index: false, follow: false },
};

/** « Conditions de vente de la précommande » (ticket 1125). Précommande fermée, ou vendeur absent ou invalide : 404. */
export default function ConditionsDeVentePage() {
  const legal = getPagesLegales();
  if (!legal) notFound();
  return (
    <PageLegale
      page="conditions"
      vendeur={legal.vendeur}
      prix={formatPrice(legal.prevente.amount, legal.prevente.currency)}
      publication={legal.publication}
      conservation={legal.conservation}
    />
  );
}
