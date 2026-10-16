import "server-only";

import { z } from "zod";

/**
 * Bornes d'une recherche (décision 0077 § 1 point 2, B7-TL-1 ; B7-PO-5) : type de production nouveau, construit sans
 * `src/prototype`. Cibles de candidats **trouvés** par type de créneau (0 admis, au moins une non nulle), total visé,
 * nombre de tours de l'agent, âge maximal d'une source, délai de la recherche (facultatif : l'adaptateur de P0 n'en
 * passe pas, son échéance reste celle de `peutAppeler`). Les valeurs des profils `apercu`, `complet` et `mini` sont
 * posées par la configuration de production (B7b, B7-TL-8).
 *
 * `pnpm p0` ne charge pas ce module (`agent.ts` n'en importe que le type) : il porte `import "server-only"`
 * (spécification B7a, point 6).
 */

const entier = (max: number) => z.number().int().min(0).max(max);

export const BornesRechercheSchema = z
  .strictObject({
    ciblesParCreneau: z.strictObject({ activity: entier(200), meal: entier(200), evening: entier(200) }),
    totalCandidats: z.number().int().min(1).max(300),
    toursMax: z.number().int().min(1).max(20),
    ageSourceMaxJours: z.number().int().min(1).max(3650),
    delaiMs: z.number().int().min(1).max(1_800_000).optional(),
  })
  .superRefine((bornes, ctx) => {
    const { activity, meal, evening } = bornes.ciblesParCreneau;
    if (activity + meal + evening === 0) ctx.addIssue({ code: "custom", path: ["ciblesParCreneau"], message: "au moins une cible non nulle" });
    if (activity + meal + evening > bornes.totalCandidats) {
      ctx.addIssue({ code: "custom", path: ["ciblesParCreneau"], message: "somme des cibles au-dessus du total" });
    }
  });
export type BornesRecherche = z.infer<typeof BornesRechercheSchema>;
