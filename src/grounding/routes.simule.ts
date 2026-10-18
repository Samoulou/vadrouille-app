import { z } from "zod";

import { clePointRoutes, MODES_ROUTES, type ClientRoutes } from "@/grounding/interfaces";

/**
 * Double de Routes à **valeurs sentinelles** (contrainte 8). Durées déterministes, en secondes, calculées à partir
 * des identifiants ; une paire sentinelle renvoie `4321` s ; des lieux « loin » ajoutent une durée fixe (pour
 * vérifier qu'un incontournable éloigné reste proposé, cadrage § 3.7).
 */

export const FixturesRoutesSchema = z.strictObject({
  baseSecondes: z.number().int().min(0).max(3600),
  pasSecondes: z.number().int().min(0).max(600),
  modulo: z.number().int().min(1).max(100),
  loin: z.strictObject({ placeIds: z.array(z.string()), secondesEnPlus: z.number().int().min(0).max(7200) }),
  sentinelle: z.strictObject({ de: z.string(), vers: z.string(), secondes: z.number().int() }),
  /**
   * B8a (B8-PO-8) : paires sans itinéraire pour les modes nommés (Routes répond sans durée : `null`). Absent : toute
   * paire a une durée. Les fixtures de P0 n'en ont pas (comportement de `pnpm p0` inchangé).
   */
  sansItineraire: z.array(z.strictObject({ de: z.string(), vers: z.string(), modes: z.array(z.enum(MODES_ROUTES)) })).optional(),
});
export type FixturesRoutes = z.infer<typeof FixturesRoutesSchema>;

function empreinte(texte: string): number {
  let somme = 0;
  for (const caractere of texte) somme = (somme * 31 + (caractere.codePointAt(0) ?? 0)) % 10_007;
  return somme;
}

export function dureeSimulee(fixtures: FixturesRoutes, de: string, vers: string): number {
  if (de === vers) return 0;
  if (fixtures.sentinelle.de === de && fixtures.sentinelle.vers === vers) return fixtures.sentinelle.secondes;
  const [a, b] = [de, vers].sort();
  let secondes = fixtures.baseSecondes + fixtures.pasSecondes * ((empreinte(`${a}|${b}`) % fixtures.modulo) + 0);
  if (fixtures.loin.placeIds.includes(de) || fixtures.loin.placeIds.includes(vers)) secondes += fixtures.loin.secondesEnPlus;
  return secondes;
}

export function creerRoutesSimule(fixtures: FixturesRoutes): ClientRoutes {
  return {
    async matrice(requete) {
      const sansItineraire = (de: string, vers: string) =>
        (fixtures.sansItineraire ?? []).some((paire) => paire.de === de && paire.vers === vers && paire.modes.includes(requete.mode));
      return {
        // Un centre maison (0087 § 3.2) est lu par sa clé de trajet ; P0 ne passe que des `placeId` : clé = `placeId`.
        secondes: requete.origines.map(clePointRoutes).map((de) =>
          requete.destinations.map(clePointRoutes).map((vers) => (sansItineraire(de, vers) ? null : dureeSimulee(fixtures, de, vers))),
        ),
      };
    },
  };
}
