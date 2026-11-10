import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { authAdapterChoice, isApiAdapter, isPrototypeAdapter } from "@/adapters";
import { PRODUCT_NAME } from "@/config/site";
import { AccountScreen } from "@/features/compte/AccountScreen";
import { compteRoute } from "@/features/compte/routes";
import { exigerSession } from "@/features/compte/session";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { accountEmail } from "@/server/actions/compte";

// Session et adaptateurs lus à chaque requête, jamais au build.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: format(messages.compte.titreDocument, { produit: PRODUCT_NAME }),
  robots: { index: false, follow: false },
};

/** L'adresse de la session n'a pas pu être lue ; ne porte aucune valeur. */
class AdresseIllisibleError extends Error {
  override name = "AdresseIllisibleError";

  constructor() {
    super("Adresse du compte illisible.");
  }
}

/**
 * « Ton compte » (`/compte` ; M9c, ticket 1122 ; spécification M9 § 6.4 ; adresse proposée par la spécification, T7 à
 * confirmer par le Tech Lead). Sans session (`better-auth`) : redirection vers `/connexion?suite=/compte`, puis retour ici
 * (critère 1). L'adresse affichée est celle de la session, lue côté serveur (`accountEmail`) ; illisible : page d'erreur.
 *
 * `simulated` est une valeur serveur : hors de `api` avec la connexion réelle, l'export télécharge le fichier du jeu
 * simulé et la suppression n'est pas proposée (critère 10). Site d'essai (adaptateur `prototype`) : aucun compte, 404.
 */
export default async function ComptePage() {
  if (isPrototypeAdapter()) notFound();
  await exigerSession(compteRoute());
  const email = await accountEmail();
  if (email === null) throw new AdresseIllisibleError();
  return <AccountScreen email={email} simulated={!(isApiAdapter() && authAdapterChoice() === "better-auth")} />;
}
