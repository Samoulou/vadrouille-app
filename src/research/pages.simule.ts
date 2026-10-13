import { z } from "zod";

import type { CoucheHttp, RequeteHttp, Resolveur } from "@/research/fetch-page";

/**
 * Doubles du résolveur DNS et de la couche HTTP de la lecture des pages, sur fixtures fabriquées à la main
 * (`prototype/fixtures/pages/` : pages fictives écrites pour le test, aucune copie d'un site réel). Aucune
 * connexion : la couche HTTP simulée sert la page `https://<nomHote><chemin>` de la table et capture la requête.
 */

export const FixturesPagesSchema = z.strictObject({
  dns: z.record(z.string(), z.array(z.string()).max(8)),
  pages: z.record(
    z.string(),
    z.strictObject({
      statut: z.number().int().min(100).max(599),
      entetes: z.record(z.string(), z.string()),
      corps: z.string().max(200_000),
    }),
  ),
});
export type FixturesPages = z.infer<typeof FixturesPagesSchema>;

export function creerResolveurSimule(table: FixturesPages["dns"]): Resolveur {
  // Map plutôt que `table[hote]` : aucun accès calculé, aucune clé héritée du prototype (`constructor`…).
  const parHote = new Map(Object.entries(table));
  return async (hote) => {
    const adresses = parHote.get(hote);
    if (adresses === undefined) throw new Error("dns_failed");
    return adresses;
  };
}

async function* morceaux(texte: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(texte);
}

export function creerHttpSimule(
  pages: FixturesPages["pages"],
  capture?: (requete: RequeteHttp) => void,
): CoucheHttp {
  const parUrl = new Map(Object.entries(pages));
  return async (requete) => {
    capture?.(requete);
    const page = parUrl.get(`https://${requete.nomHote}${requete.chemin}`);
    if (page === undefined) return { statut: 404, entetes: { "content-type": "text/plain" }, corps: morceaux("") };
    const entetes: Record<string, string> = Object.fromEntries(Object.entries(page.entetes).map(([nom, valeur]) => [nom.toLowerCase(), valeur]));
    return { statut: page.statut, entetes, corps: morceaux(page.corps) };
  };
}
