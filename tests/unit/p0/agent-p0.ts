import type { Brief } from "@/prototype/brief";
import type { ConfigRecherche } from "@/prototype/config";
import { chercherCandidats, type DependancesAgent } from "@/research/agent";
import {
  bornesDepuisConfig,
  complementDepuisBrief,
  donneesProtegeesDepuisBrief,
  entreeModelesDepuisBrief,
} from "@/server/p0/vers-couche-ia";

/**
 * Appel de l'agent de recherche **comme le fait P0** (B7a, décision 0077 § 1 point 5) : brief et configuration de P0
 * convertis par l'adaptateur `src/server/p0/vers-couche-ia.ts`, exactement comme `scripts/p0/pipeline.ts` et
 * `src/workflows/p0-run.ts` (entrée de production, bornes, `ComplementP0`, données protégées du filtre des requêtes
 * web). Les tests de P0 qui rejouent l'agent passent par ce seul chemin.
 */
export function chercherCandidatsP0(
  brief: Brief,
  dependances: Pick<DependancesAgent, "modeles" | "modele" | "routage" | "recherche" | "lecteur" | "peutAppeler" | "observer"> & {
    readonly config: ConfigRecherche;
  },
): ReturnType<typeof chercherCandidats> {
  return chercherCandidats(entreeModelesDepuisBrief(brief), {
    modeles: dependances.modeles,
    modele: dependances.modele,
    routage: dependances.routage,
    recherche: dependances.recherche,
    lecteur: dependances.lecteur,
    bornes: bornesDepuisConfig(dependances.config),
    complement: complementDepuisBrief(brief),
    protegees: donneesProtegeesDepuisBrief(brief),
    ...(dependances.peutAppeler === undefined ? {} : { peutAppeler: dependances.peutAppeler }),
    ...(dependances.observer === undefined ? {} : { observer: dependances.observer }),
  });
}
