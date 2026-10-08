import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { devPagesEnabled } from "@/dev/flags";
import { TokensShowcase } from "@/dev/TokensShowcase";
import { messages } from "@/i18n";

// Lu à chaque requête : la variable VADROUILLE_DEV_PAGES est évaluée à l'exécution.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.dev.tokens.titre,
  robots: { index: false, follow: false },
};

export default function DevTokensPage() {
  if (!devPagesEnabled()) {
    notFound();
  }
  return <TokensShowcase />;
}
