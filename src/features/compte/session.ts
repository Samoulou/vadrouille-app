import { redirect } from "next/navigation";

import { getRequestContext, SessionRequiseError, type AdapterContext } from "@/adapters";

import { connexionRoute } from "./suite";

/**
 * Contexte de la requête pour les pages, les chargeurs et les actions (spécification B3, B3c point 5 ; décision 0017
 * § 4). Passe toujours par `getRequestContext()` de `@/adapters` (asynchrone depuis B3c, B3-TL-4) : le contexte de la
 * session avec `AUTH_ADAPTER=better-auth`, celui de la phase 0 sinon (jamais d'absence de session en `mock`).
 */

/** Contexte de la requête, ou `null` sans session (`better-auth` seulement) ; toute autre erreur est relancée. */
export async function contexteFacultatif(): Promise<AdapterContext | null> {
  try {
    return await getRequestContext();
  } catch (error) {
    if (error instanceof SessionRequiseError) return null;
    throw error;
  }
}

/**
 * Contexte d'une **page** : celui de la requête, ou, sans session, redirection vers l'écran 4,
 * `/connexion?suite=<suite>`. `suite` est le chemin de la page, écrit par ses fonctions d'adresse (jamais une valeur du
 * navigateur) ; l'écran 4 le relit par `normaliserSuite`.
 *
 * Seule la page redirige : la mise en page et les métadonnées lisent `contexteFacultatif()` et rendent, sans session,
 * leur forme vide, pour qu'aucune autre redirection ni 404 ne concoure avec celle de la page.
 */
export async function exigerSession(suite: string): Promise<AdapterContext> {
  const ctx = await contexteFacultatif();
  if (ctx === null) redirect(connexionRoute(suite));
  return ctx;
}
