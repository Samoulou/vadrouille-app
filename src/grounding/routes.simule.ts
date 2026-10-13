import { z } from "zod";

import type { ClientRoutes } from "@/grounding/interfaces";

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
      return {
        secondes: requete.origines.map((de) => requete.destinations.map((vers) => dureeSimulee(fixtures, de, vers))),
      };
    },
  };
}
