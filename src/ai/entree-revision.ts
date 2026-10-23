import "server-only";

import { z } from "zod";

import { IsoDateSchema, TimeSchema } from "@/contracts";
import { EntreeProgrammeSchema } from "@/ai/entrees";

/**
 * Entrée de l'étape « Révision » du voyage d'essai (spécification E2E-essai, lot 4 ; décision 0126 § 3) : le brief
 * (mêmes champs que l'entrée `programme`), les **textes écrits par l'IA** dans la version précédente du programme et les
 * choix du tri. Construite par `src/server/p0/revision.ts` seul, depuis le programme stocké.
 *
 * **Aucun champ** pour une donnée Google ou un verdict d'ancrage (0011 § 1 ; 0117 § 3) : ni identifiant de lieu, ni
 * position, ni temps de trajet, ni badge (`toReserve`, `toConfirm`), ni site vérifié, ni marque « vérifié ». Schéma
 * strict : une clé en trop (un `placeId` glissé par erreur, par exemple) refuse l'entrée avant toute requête.
 */

/** Identifiant d'étape maison du programme écrit (`j<jour>-<rang>`, `src/server/p0/assemblage.ts`) ; jamais Google. */
export const ID_ETAPE_REVISION = /^j[0-9]{1,2}-[0-9]{1,2}$/;
/** Choix au plus par sorte : un séjour de 15 jours tient sous ce nombre d'étapes triées. */
export const CHOIX_REVISION_MAX = 120;

const texteIa = (max: number) => z.string().trim().min(1).max(max);
const IdEtapeSchema = z.string().regex(ID_ETAPE_REVISION);

const EtapeRevisionSchema = z.strictObject({
  id: IdEtapeSchema,
  debut: TimeSchema,
  fin: TimeSchema.optional(),
  /** Repas (déjeuner, dîner, apéro) plutôt que visite : sorte de l'étape écrite par l'IA. */
  repas: z.boolean(),
  lieu: texteIa(80),
  quartier: texteIa(120).optional(),
  pourquoi: texteIa(280).optional(),
});

const JourRevisionSchema = z.strictObject({
  date: IsoDateSchema,
  titre: texteIa(120).optional(),
  etapes: z.array(EtapeRevisionSchema).max(40),
});

export const EntreeRevisionSchema = z
  .strictObject({
    brief: EntreeProgrammeSchema,
    programme: z.strictObject({ jours: z.array(JourRevisionSchema).min(1).max(15) }),
    choix: z.strictObject({
      pasPourMoi: z.array(IdEtapeSchema).min(1).max(CHOIX_REVISION_MAX),
      jAime: z.array(IdEtapeSchema).max(CHOIX_REVISION_MAX),
    }),
  })
  .superRefine((entree, ctx) => {
    const ids = new Set(entree.programme.jours.flatMap((jour) => jour.etapes.map((etape) => etape.id)));
    const aimes = new Set(entree.choix.jAime);
    if (new Set(entree.choix.pasPourMoi).size !== entree.choix.pasPourMoi.length || aimes.size !== entree.choix.jAime.length) {
      ctx.addIssue({ code: "custom", path: ["choix"], message: "choix sans doublon" });
    }
    if ([...entree.choix.pasPourMoi, ...entree.choix.jAime].some((id) => !ids.has(id))) {
      ctx.addIssue({ code: "custom", path: ["choix"], message: "choix sur une étape du programme" });
    }
    if (entree.choix.pasPourMoi.some((id) => aimes.has(id))) {
      ctx.addIssue({ code: "custom", path: ["choix"], message: "une étape aimée et écartée" });
    }
  });
export type EntreeRevision = z.infer<typeof EntreeRevisionSchema>;
