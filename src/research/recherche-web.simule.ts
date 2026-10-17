import { z } from "zod";

import type { ClientRechercheWeb } from "@/ai/recherche-web";

/**
 * Double de la recherche web sur fixtures fabriquées à la main (`prototype/fixtures/recherche/`) : chaque requête
 * connue renvoie ses résultats types, une requête inconnue n'en renvoie aucun. Aucune connexion.
 */

export const FixturesRechercheSchema = z.strictObject({
  coutParRequeteUsd: z.number().finite().nonnegative().max(1),
  resultats: z.record(
    z.string(),
    z.array(z.strictObject({ url: z.string(), titre: z.string(), extrait: z.string() })).max(20),
  ),
});
export type FixturesRecherche = z.infer<typeof FixturesRechercheSchema>;

export function creerRechercheSimulee(fixtures: FixturesRecherche): ClientRechercheWeb {
  const parRequete = new Map(Object.entries(fixtures.resultats));
  return {
    async rechercher(requete) {
      return { resultats: [...(parRequete.get(requete) ?? [])], coutUsd: fixtures.coutParRequeteUsd };
    },
  };
}
