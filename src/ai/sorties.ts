import { z } from "zod";

import { CategorySchema, IsoDateSchema, STOP_KINDS, TimeSchema } from "@/contracts";
import { LONGUEURS_TEXTE, NotesSchema, TYPES_CRENEAU, texteMaison, type Notes } from "@/prototype/candidat";

/**
 * Schémas stricts des sorties de modèles (spécification P0, « Sorties des modèles : schémas stricts »).
 * Chaque élément est validé à part : un élément refusé est écarté et compté (`model_output_invalid` par étape),
 * sans son contenu. Une réponse qui n'est pas un objet JSON est refusée en entier (comptée une fois).
 * Les identifiants acceptés sont seulement ceux de la requête.
 */

export type Lecture<T> = { valeur: T; refuses: number };

function objetJson(texte: string): Record<string, unknown> | undefined {
  try {
    const valeur: unknown = JSON.parse(texte);
    return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/** Valide chaque élément d'un tableau, borne sa longueur, compte les refus. */
function elements<T>(brut: unknown, schema: z.ZodType<T>, max: number): Lecture<T[]> {
  if (!Array.isArray(brut)) return { valeur: [], refuses: 1 };
  let refuses = Math.max(0, brut.length - max);
  const valeur: T[] = [];
  for (const element of brut.slice(0, max)) {
    const resultat = schema.safeParse(element);
    if (resultat.success) valeur.push(resultat.data);
    else refuses += 1;
  }
  return { valeur, refuses };
}

function racine(texte: string, cles: readonly string[]): Record<string, unknown> | undefined {
  const objet = objetJson(texte);
  if (objet === undefined) return undefined;
  return Object.keys(objet).every((cle) => cles.includes(cle)) ? objet : undefined;
}

// --- Plan de recherche -------------------------------------------------------

export const RequetePlanSchema = z.strictObject({
  requete: texteMaison(LONGUEURS_TEXTE.requete),
  creneau: z.enum([...TYPES_CRENEAU, "event"]),
});
export type RequetePlan = z.infer<typeof RequetePlanSchema>;

export function lirePlan(texte: string): Lecture<RequetePlan[]> {
  const objet = racine(texte, ["requetes"]);
  if (objet === undefined) return { valeur: [], refuses: 1 };
  return elements(objet.requetes, RequetePlanSchema, 30);
}

// --- Tour de recherche -------------------------------------------------------

export const ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("rechercher"), requete: texteMaison(LONGUEURS_TEXTE.requete) }),
  z.strictObject({ type: z.literal("lire"), url: z.string().min(1).max(2048) }),
]);
export type Action = z.infer<typeof ActionSchema>;

/** Candidat tel que l'extrait le modèle ; l'identifiant et la classe de source sont posés par le code. */
export const CandidatExtraitSchema = z.strictObject({
  nom: texteMaison(LONGUEURS_TEXTE.nom),
  resume: texteMaison(LONGUEURS_TEXTE.resume),
  categorie: CategorySchema,
  typeEtape: z.enum(STOP_KINDS),
  sourceUrl: z.string().min(1).max(2048),
  sourceDate: IsoDateSchema,
  evenement: z.strictObject({ date: IsoDateSchema, heure: TimeSchema.optional() }).optional(),
  aReserver: z.boolean(),
  prixParPersonne: z.number().finite().nonnegative().max(1000).optional(),
  dureeMinutes: z.number().int().min(15).max(600).optional(),
});
export type CandidatExtrait = z.infer<typeof CandidatExtraitSchema>;

export type TourRecherche = { actions: Action[]; candidats: CandidatExtrait[]; termine: boolean };

export function lireTour(texte: string): Lecture<TourRecherche> {
  const objet = racine(texte, ["actions", "candidats", "termine"]);
  if (objet === undefined || typeof objet.termine !== "boolean") {
    return { valeur: { actions: [], candidats: [], termine: true }, refuses: 1 };
  }
  const actions = objet.actions === undefined ? { valeur: [], refuses: 0 } : elements(objet.actions, ActionSchema, 10);
  const candidats = objet.candidats === undefined ? { valeur: [], refuses: 0 } : elements(objet.candidats, CandidatExtraitSchema, 30);
  return {
    valeur: { actions: actions.valeur, candidats: candidats.valeur, termine: objet.termine },
    refuses: actions.refuses + candidats.refuses,
  };
}

// --- Notation ----------------------------------------------------------------

const NoteAvecIdSchema = NotesSchema.extend({ id: z.string().min(1).max(16) });

/** Notes par identifiant ; identifiant inconnu ou en double : élément écarté et compté. */
export function lireNotes(texte: string, idsAttendus: ReadonlySet<string>): Lecture<Map<string, Notes>> {
  const objet = racine(texte, ["notes"]);
  if (objet === undefined) return { valeur: new Map(), refuses: 1 };
  const { valeur, refuses } = elements(objet.notes, NoteAvecIdSchema, idsAttendus.size);
  const notes = new Map<string, Notes>();
  let ecartes = refuses;
  for (const { id, ...note } of valeur) {
    if (!idsAttendus.has(id) || notes.has(id)) ecartes += 1;
    else notes.set(id, note);
  }
  return { valeur: notes, refuses: ecartes };
}

// --- Raisons -----------------------------------------------------------------

const RaisonSchema = z.strictObject({
  id: z.string().min(1).max(16),
  raison: texteMaison(LONGUEURS_TEXTE.raison),
  detour: texteMaison(LONGUEURS_TEXTE.raison),
});

export function lireRaisons(
  texte: string,
  idsAttendus: ReadonlySet<string>,
): Lecture<Map<string, { raison: string; detour: string }>> {
  const objet = racine(texte, ["raisons"]);
  if (objet === undefined) return { valeur: new Map(), refuses: 1 };
  const { valeur, refuses } = elements(objet.raisons, RaisonSchema, idsAttendus.size);
  const raisons = new Map<string, { raison: string; detour: string }>();
  let ecartes = refuses;
  for (const { id, raison, detour } of valeur) {
    if (!idsAttendus.has(id) || raisons.has(id)) ecartes += 1;
    else raisons.set(id, { raison, detour });
  }
  return { valeur: raisons, refuses: ecartes };
}
