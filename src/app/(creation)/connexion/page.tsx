import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAuthAdapter, isPrototypeAdapter } from "@/adapters";
import { SignInForm } from "@/features/compte/SignInForm";
import { normaliserSuite } from "@/features/compte/suite";
import { creationRoutes } from "@/features/creation/routes";
import * as messages from "@/i18n/messages";
import { hasSession } from "@/server/actions/compte";

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
 *
 * F8c : appelée par la création (`suite` = `R-lancer`) alors qu'une session existe dans la portée de la requête,
 * l'adresse est remplacée par `R-lancer` (une personne déjà connectée saute l'écran 4, F8-PO-2 ; `redirect` d'un
 * composant serveur remplace l'entrée d'historique). Le brouillon, dans le layout du groupe `(creation)`, est conservé.
 *
 * Site d'essai (adaptateur `prototype` ; spécification E2E-essai, lot 2, D3) : le code d'accès tient lieu de compte,
 * demandé par `R-lancer` lui-même ; appelée par la création, la page mène à `R-lancer` sans lire l'adaptateur `auth`.
 */
export default async function ConnexionPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = (await searchParams).suite;
  const suite = normaliserSuite(Array.isArray(raw) ? raw[0] : raw);
  if (suite === creationRoutes.lancer() && isPrototypeAdapter()) redirect(suite);
  const adapter = getAuthAdapter();
  if (suite === creationRoutes.lancer() && (await hasSession())) redirect(suite);
  return <SignInForm suite={suite} codeTtlMs={adapter.config.codeTtlMs} authMode={adapter.mode} />;
}
