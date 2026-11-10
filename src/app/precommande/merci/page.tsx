import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getPrevente, pagesLegalesDisponibles } from "@/adapters";
import { Button } from "@/components/ligne/Button";
import { PRODUCT_NAME } from "@/config/site";
import { LiensLegaux } from "@/features/accueil/LiensLegaux";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

export const dynamic = "force-dynamic";

const t = messages.prevente.merci;

export const metadata: Metadata = {
  title: format(t.titreDocument, { produit: PRODUCT_NAME }),
  robots: { index: false, follow: false },
};

/**
 * Retour du paiement Stripe d'une précommande (adresse de confirmation du lien de paiement). La page n'affirme rien
 * que Stripe n'ait fait : elle ne lit ni paiement ni adresse e-mail. Précommande fermée : 404.
 */
export default function PrecommandeMerciPage() {
  if (!getPrevente()) notFound();
  const date = messages.prevente.ouverture;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-10 pb-16">
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
      <p className="text-corps text-ink">{t.texte}</p>
      <p className="text-corps text-ink-soft">{format(t.suite, { date })}</p>
      <p className="text-corps text-ink-soft">{t.remboursement}</p>
      {pagesLegalesDisponibles() ? <LiensLegaux /> : null}
      <Button asChild variant="secondary" className="mt-2 w-full">
        <Link href="/">{t.retour}</Link>
      </Button>
    </main>
  );
}
