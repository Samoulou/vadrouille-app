import "server-only";

import { z } from "zod";

import { IsoDateSchema, TimeSchema } from "@/contracts";
import { EntreeProgrammeSchema, EntreeProgrammeV5Schema } from "@/ai/entrees";

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

const ProgrammeRevisionSchema = z.strictObject({ jours: z.array(JourRevisionSchema).min(1).max(15) });
const ChoixRevisionSchema = z.strictObject({
  pasPourMoi: z.array(IdEtapeSchema).min(1).max(CHOIX_REVISION_MAX),
  jAime: z.array(IdEtapeSchema).max(CHOIX_REVISION_MAX),
});

/** Contrôle commun des entrées `revision` v2 et v3 : choix sans doublon, sur une étape du programme, jamais aimée et écartée. */
function controlerChoix(
  entree: { readonly programme: z.infer<typeof ProgrammeRevisionSchema>; readonly choix: z.infer<typeof ChoixRevisionSchema> },
  ctx: z.RefinementCtx,
) {
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
}

export const EntreeRevisionSchema = z
  .strictObject({ brief: EntreeProgrammeSchema, programme: ProgrammeRevisionSchema, choix: ChoixRevisionSchema })
  .superRefine(controlerChoix);
export type EntreeRevision = z.infer<typeof EntreeRevisionSchema>;

/**
 * Entrée du prompt `revision` **v3**, plusieurs villes (ticket #926, M4a-2 ; décision 0148 § 8 point 2 ; verdict de la
 * Sécurité 0149 § 1.3, S-M4-1, S-M4-2 et S-M4-5). Construite par M4b (révision de la vraie app) depuis le
 * `BriefProgramme` et l'instantané de la version de base ; la v2 (`EntreeRevision`) reste celle du site d'essai.
 *
 * - `brief` : l'entrée du prompt `programme` v5 (`EntreeProgrammeV5Schema`, mêmes contrôles : villes, `changements`
 *   sans libellé de billet, heures et source seulement, `fin` des engagements), **sans `recit`** : garde du récit
 *   (0139 § 1.2 points 2 et 6 ; 0149 § 1.3 point 7). Aucune requête de révision ne reçoit le récit tant que la
 *   Sécurité n'a pas jugé ce flux ; un récit présent refuse l'entrée, avant toute requête.
 * - `programme` et `choix` : la forme de la v2 (textes que l'IA a écrits, identifiants maison), sans champ de ville
 *   par étape ni de `transfer` (le code le recopie, 0148 § 8 point 2) ; chaque journée est une date du séjour, une
 *   seule fois.
 *
 * Schéma **strict** à chaque niveau (brief, villes, changements, engagements, journées, étapes, choix) : une clé en
 * trop (un `placeId`, une position, une durée de trajet, un libellé de billet, une ville par étape) refuse l'entrée.
 * Seule voie vers le modèle : la projection champ par champ de `requeteRevisionV3` (`src/ai/requetes.ts`).
 */
export const EntreeRevisionV3Schema = z
  .strictObject({ brief: EntreeProgrammeV5Schema, programme: ProgrammeRevisionSchema, choix: ChoixRevisionSchema })
  .superRefine((entree, ctx) => {
    if (entree.brief.recit !== undefined) ctx.addIssue({ code: "custom", path: ["brief", "recit"], message: "récit absent de la révision (garde du récit)" });
    const dates = new Set<string>();
    for (const [rang, jour] of entree.programme.jours.entries()) {
      if (jour.date < entree.brief.arrivee || jour.date > entree.brief.depart || dates.has(jour.date)) {
        ctx.addIssue({ code: "custom", path: ["programme", "jours", rang, "date"], message: "journée hors du séjour ou répétée" });
      }
      dates.add(jour.date);
    }
    controlerChoix(entree, ctx);
  });
export type EntreeRevisionV3 = z.infer<typeof EntreeRevisionV3Schema>;
