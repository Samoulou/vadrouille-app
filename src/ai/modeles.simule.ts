import { z } from "zod";

import { TYPES_CRENEAU } from "@/ai/candidat";
import type { ClientModeles, RequeteModele, ReponseModele } from "@/ai/client";
import { donneesDe } from "@/ai/requetes";

/**
 * Double du client de modèles, sur fixtures fabriquées à la main (mode simulé, spécification P0). Aucune connexion :
 * il lit les réponses types reçues à sa construction (le script les charge depuis `prototype/fixtures/modeles/`).
 *
 * - plan : la réponse type `plan` ;
 * - recherche : la réponse type du tour (1er appel, 2e appel…), puis « terminé » ;
 * - notation : pour chaque identifiant de la requête, les notes types du **nom maison** reçu, sinon les notes par
 *   défaut ; aucun autre identifiant ;
 * - raisons : une raison et une justification construites à partir du nom maison reçu ;
 * - structuration et quartier (B7a) : la réponse type si les fixtures en ont une, sinon un brief déduit vide et
 *   « aucune zone » (les fixtures de P0 n'en ont pas : `pnpm p0` n'appelle pas ces étapes).
 */

export const FixturesModelesSchema = z.strictObject({
  coutParRequeteUsd: z.number().finite().nonnegative().max(1),
  plan: z.unknown(),
  recherche: z.array(z.unknown()).max(20),
  notes: z.record(z.string(), z.unknown()),
  notesParDefaut: z.strictObject({
    matchesWishes: z.boolean(),
    notForMeRisk: z.number().int().min(1).max(10),
    mustSee: z.boolean(),
  }),
  structuration: z.unknown().optional(),
  quartier: z.unknown().optional(),
});
export type FixturesModeles = z.infer<typeof FixturesModelesSchema>;

const VueSchema = z.object({ id: z.string(), nom: z.string(), typeEtape: z.string() });
const DonneesNotationSchema = z.object({ candidats: z.array(VueSchema) });
const DonneesRaisonsSchema = z.object({ lieux: z.array(VueSchema) });

function creneauParDefaut(typeEtape: string): (typeof TYPES_CRENEAU)[number] {
  if (typeEtape === "meal") return "meal";
  return "activity";
}

export function creerModelesSimules(fixtures: FixturesModeles): ClientModeles {
  let tour = 0;
  const notesParNom = new Map(Object.entries(fixtures.notes));
  const repondre = (valeur: unknown): ReponseModele => ({
    texte: typeof valeur === "string" ? valeur : JSON.stringify(valeur),
    coutUsd: fixtures.coutParRequeteUsd,
  });
  return {
    async envoyer(requete: RequeteModele): Promise<ReponseModele> {
      const donnees = donneesDe(requete.messages.at(-1)?.contenu ?? "");
      switch (requete.etape) {
        case "plan":
          return repondre(fixtures.plan);
        case "recherche": {
          const reponse = fixtures.recherche.at(tour) ?? { actions: [], candidats: [], termine: true };
          tour += 1;
          return repondre(reponse);
        }
        case "notation": {
          const { candidats } = DonneesNotationSchema.parse(donnees);
          return repondre({
            notes: candidats.map((candidat) => ({
              id: candidat.id,
              ...((notesParNom.get(candidat.nom) as object | undefined) ?? {
                ...fixtures.notesParDefaut,
                slotFit: [creneauParDefaut(candidat.typeEtape)],
              }),
            })),
          });
        }
        case "structuration":
          return repondre(fixtures.structuration ?? { inferredFields: [] });
        case "quartier":
          return repondre(fixtures.quartier ?? { zone: null, logements: [] });
        case "raisons": {
          const { lieux } = DonneesRaisonsSchema.parse(donnees);
          return repondre({
            raisons: lieux.map((lieu) => ({
              id: lieu.id,
              raison: `Retenu pour ton brief : ${lieu.nom}.`,
              detour: `Un lieu que nos sources recommandent : ${lieu.nom}.`,
            })),
          });
        }
      }
    },
  };
}
