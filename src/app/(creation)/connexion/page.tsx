import type { Metadata } from "next";

import { getAuthAdapter } from "@/adapters";
import { SignInForm } from "@/features/compte/SignInForm";
import { normaliserSuite } from "@/features/compte/suite";
import * as messages from "@/i18n/messages";

// L'adaptateur `auth` et sa garde (décision 0017 § 11.2) sont lus à chaque requête, jamais au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.connexion.titreDocument,
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * `R4` = `/connexion?suite=…` (spécification F8, écran 4). `suite` est lue telle que Next.js la rend (décodée une
 * fois) et normalisée par `normaliserSuite` : seule la valeur reconstruite atteint l'écran. Le mode de la connexion
 * (`authMode`) et la durée de validité du code viennent de l'adaptateur `auth`, côté serveur. Garde fermée (0017
 * § 11.2) : `getAuthAdapter()` lève une erreur, et la page affiche l'erreur générique.
 */
export default async function ConnexionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = (await searchParams).suite;
  const suite = normaliserSuite(Array.isArray(raw) ? raw[0] : raw);
  const adapter = getAuthAdapter();
  return <SignInForm suite={suite} codeTtlMs={adapter.config.codeTtlMs} authMode={adapter.mode} />;
}
