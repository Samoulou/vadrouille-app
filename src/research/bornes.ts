import "server-only";

import { z } from "zod";

import type { TypeCreneau } from "@/ai/candidat";
import { MAX_SUGGESTED_LODGINGS } from "@/contracts";

/**
 * Bornes d'une recherche (décision 0077 § 1 point 2, B7-TL-1 ; B7-PO-5) : type de production nouveau, construit sans
 * `src/prototype`. Cibles de candidats **trouvés** par type de créneau (0 admis, au moins une non nulle), total visé,
 * nombre de tours de l'agent, âge maximal d'une source, délai de la recherche (facultatif : l'adaptateur de P0 n'en
 * passe pas, son échéance reste celle de `peutAppeler`). Les valeurs des profils `apercu`, `complet` et `mini` sont
 * posées par la configuration de production (`src/server/config/ia.ts`, B7b, B7-TL-8, décision 0096 § 3) : ce module
 * reste un module de types et de schéma, **sans valeur de profil**.
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

/** Profils de bornes de la recherche (B7-PO-5) : aperçu, voyage complet, mini-recherche d'un créneau. */
export const PROFILS_RECHERCHE = ["apercu", "complet", "mini"] as const;
export type ProfilRecherche = (typeof PROFILS_RECHERCHE)[number];

/**
 * Profil `mini` (décision 0096 § 3 points 3 et 4) : mini-recherche d'un créneau (`cible` sur le type de créneau demandé,
 * 0 sur les deux autres) et recherche de logements de `suggererQuartier` (`logements` : `cible` logements, `recherchesWeb`
 * recherches web posées par le code, « tours » lus comme tel). Le type vit ici ; `src/server/config/ia.ts`, qui n'importe
 * pas `@/research`, déclare la forme équivalente, et le test de la composition vérifie que la valeur chargée passe ce
 * schéma. Une cible à 0 est refusée.
 */
export const ProfilMiniSchema = z
  .strictObject({
    cible: z.number().int().min(1).max(200),
    totalCandidats: z.number().int().min(1).max(300),
    toursMax: z.number().int().min(1).max(20),
    delaiMs: z.number().int().min(1).max(1_800_000),
    logements: z.strictObject({
      cible: z.number().int().min(1).max(MAX_SUGGESTED_LODGINGS),
      recherchesWeb: z.number().int().min(1).max(10),
    }),
  })
  .superRefine((profil, ctx) => {
    if (profil.cible > profil.totalCandidats)
      ctx.addIssue({
        code: "custom",
        path: ["cible"],
        message: "cible au-dessus du total",
      });
  });
export type ProfilMini = z.infer<typeof ProfilMiniSchema>;

/**
 * Bornes du profil `mini` pour un type de créneau (décision 0096 § 3 point 4) : `cible` sur ce créneau, 0 sur les deux
 * autres (une cible à 0 est atteinte d'emblée : l'agent s'arrête sur sa seule cible non nulle, le total, les tours ou le
 * délai). `ageSourceMaxJours` est celui de `recherche.json`, passé par la composition. Fonction pure.
 */
export function bornesMini(
  profil: ProfilMini,
  creneau: TypeCreneau,
  ageSourceMaxJours: number,
): BornesRecherche {
  const cibles = { activity: 0, meal: 0, evening: 0 };
  if (creneau === "activity") cibles.activity = profil.cible;
  else if (creneau === "meal") cibles.meal = profil.cible;
  else cibles.evening = profil.cible;
  return {
    ciblesParCreneau: cibles,
    totalCandidats: profil.totalCandidats,
    toursMax: profil.toursMax,
    ageSourceMaxJours,
    delaiMs: profil.delaiMs,
  };
}
