import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ComposantsShowcase } from "@/dev/ComposantsShowcase";
import { devPagesEnabled } from "@/dev/flags";
import { messages } from "@/i18n";

// Lu à chaque requête : la variable VADROUILLE_DEV_PAGES est évaluée à l'exécution.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.dev.composants.titre,
  robots: { index: false, follow: false },
};

export default function DevComposantsPage() {
  if (!devPagesEnabled()) {
    notFound();
  }
  return <ComposantsShowcase />;
}
