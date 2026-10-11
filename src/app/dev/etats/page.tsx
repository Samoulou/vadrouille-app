import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EtatsShowcase } from "@/dev/EtatsShowcase";
import { devPagesEnabled } from "@/dev/flags";
import { messages } from "@/i18n";

// Lu à chaque requête : la variable VADROUILLE_DEV_PAGES est évaluée à l'exécution.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.etats.catalogue.titre,
  robots: { index: false, follow: false },
};

/** Catalogue des états transverses (`R-etats`, écran 18, décision 0021 § 8). 404 sans le drapeau. */
export default function DevEtatsPage() {
  if (!devPagesEnabled()) {
    notFound();
  }
  return <EtatsShowcase />;
}
