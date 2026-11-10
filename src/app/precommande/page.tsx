import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { adressePaiementPrevente, getPrevente, sourcePrevente } from "@/adapters";
import { Button } from "@/components/ligne/Button";
import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

// `PREVENTE` et `PREVENTE_LIEN_PAIEMENT` lus à chaque requête.
export const dynamic = "force-dynamic";

const t = messages.prevente.bientot;

export const metadata: Metadata = {
  title: format(t.titreDocument, { produit: PRODUCT_NAME }),
  robots: { index: false, follow: false },
};

/**
 * Bouton « Précommander » de l'accueil : redirige vers le lien de paiement hébergé par Stripe, avec la provenance.
 * Précommande fermée : 404. Paiement pas encore ouvert (lien absent ou invalide) : page « ouvre très bientôt ».
 */
export default async function PrecommandePage({ searchParams }: { searchParams: Promise<{ src?: string | string[] }> }) {
  const prevente = getPrevente();
  if (!prevente) notFound();
  const adresse = adressePaiementPrevente(prevente, sourcePrevente((await searchParams).src));
  if (adresse) redirect(adresse);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-10 pb-16">
      <h1 className="text-titre-jour font-extrabold tracking-(--ligne-titre-jour-approche) text-ink">{t.titre}</h1>
      <p className="text-corps text-ink-soft">{t.texte}</p>
      <Button asChild variant="secondary" className="mt-2 w-full">
        <Link href="/">{t.retour}</Link>
      </Button>
    </main>
  );
}
