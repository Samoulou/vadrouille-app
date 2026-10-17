import { z } from "zod";

import { LONGUEURS_TEXTE, NotesSchema, TYPES_CRENEAU, texteMaison, type Notes } from "@/ai/candidat";
import { CategorySchema, InferredBriefSchema, IsoDateSchema, MAX_SUGGESTED_LODGINGS, STOP_KINDS, TimeSchema, type InferredBrief } from "@/contracts";

/**
 * Schémas stricts des sorties de modèles (spécification P0, « Sorties des modèles : schémas stricts »).
 * Chaque élément est validé à part : un élément refusé est écarté et compté (`model_output_invalid` par étape),
 * sans son contenu. Une réponse qui n'est pas un objet JSON est refusée en entier (comptée une fois, `illisible`).
 * Les identifiants acceptés sont seulement ceux de la requête.
 *
 * Habillage toléré (ticket 400) : un modèle rend souvent son objet JSON dans un bloc de code Markdown (```json … ```),
 * précédé d'une phrase ou d'un raisonnement (`<think>…</think>`). L'objet est alors cherché dans cet habillage
 * (`formesAEssayer`) ; le schéma qui le valide reste aussi strict. Une réponse de plus de `LONGUEUR_REPONSE_MAX`
 * caractères est refusée en entier, et la recherche de l'habillage reste linéaire (bloquant 1 du head `cd614d4`).
 */

export type Lecture<T> = {
  valeur: T;
  refuses: number;
  /** Vrai si la réponse entière a été refusée (aucun objet JSON de la forme attendue). */
  illisible?: boolean;
};

const FIN_RAISONNEMENT = "</think>";
const CLOTURE = "```";

/**
 * Longueur maximale (en caractères) d'une réponse de modèle lue ; au-delà, la réponse est refusée en entier
 * (`illisible`) sans être examinée (bloquant 1 du head `cd614d4`). 256 Ki : plus de trois fois le plus long tour valide
 * (30 candidats et 10 actions aux longueurs maximales du schéma, environ 80 Ki), avec la marge d'un raisonnement.
 */
export const LONGUEUR_REPONSE_MAX = 256 * 1024;

/** Nombre de blocs de code Markdown essayés, les derniers de la réponse (bloquant 1 du head `cd614d4`). */
export const BLOCS_ESSAYES_MAX = 8;

/**
 * Contenu des blocs de code Markdown (```lang … ```) d'un texte, du dernier au premier, `BLOCS_ESSAYES_MAX` au plus.
 * Balayage linéaire par `indexOf` (bloquant 1 du head `cd614d4`) : l'ancienne expression régulière paresseuse coûtait un
 * temps quadratique sur un bloc ouvert jamais fermé. Chaque position du texte est examinée une fois ; un bloc ouvert sans
 * clôture arrête le balayage (aucune clôture plus loin ne peut exister).
 */
function blocsDeCode(texte: string): string[] {
  const blocs: string[] = [];
  let position = texte.indexOf(CLOTURE);
  while (position !== -1) {
    let debut = position + CLOTURE.length;
    // Langage (lettres ASCII), espaces horizontales, puis au plus un saut de ligne, comme ```json⏎.
    while (debut < texte.length && /[A-Za-z]/.test(texte.charAt(debut))) debut += 1;
    while (debut < texte.length && texte.charAt(debut) !== "\n" && /\s/.test(texte.charAt(debut))) debut += 1;
    if (texte.charAt(debut) === "\n") debut += 1;
    const fin = texte.indexOf(CLOTURE, debut);
    if (fin === -1) break;
    blocs.push(texte.slice(debut, fin));
    if (blocs.length > BLOCS_ESSAYES_MAX) blocs.shift();
    position = texte.indexOf(CLOTURE, fin + CLOTURE.length);
  }
  return blocs.reverse();
}

/**
 * Textes où chercher l'objet JSON, dans l'ordre : la réponse telle quelle ; ce qui suit le dernier `</think>` ; le
 * contenu des derniers blocs de code Markdown, du dernier au premier ; du premier `{` au dernier `}`. Réponse plus longue
 * que `LONGUEUR_REPONSE_MAX` : aucune forme (refusée en entier). Coût : linéaire en la longueur, `BLOCS_ESSAYES_MAX + 3`
 * analyses JSON au plus.
 *
 * Limite assumée (mineur 3 du head `cd614d4`) : le dernier `</think>`, le dernier bloc et l'empan du premier `{` au
 * dernier `}` laissent un objet placé après le vrai (par exemple soufflé par une page lue et recopié par le modèle)
 * masquer celui-ci. La réponse entière, essayée d'abord, n'est pas concernée. L'effet est borné : l'objet retenu passe
 * le même schéma strict (clés de racine fermées, éléments validés un à un), et un candidat n'est gardé que si sa source
 * figure dans les résultats de recherche de l'exécution (`src/research/agent.ts`).
 */
function formesAEssayer(texte: string): string[] {
  if (texte.length > LONGUEUR_REPONSE_MAX) return [];
  const fin = texte.lastIndexOf(FIN_RAISONNEMENT);
  const reponse = fin === -1 ? texte : texte.slice(fin + FIN_RAISONNEMENT.length);
  const blocs = blocsDeCode(reponse);
  const debut = reponse.indexOf("{");
  const finObjet = reponse.lastIndexOf("}");
  return [texte, reponse, ...blocs, ...(debut !== -1 && finObjet > debut ? [reponse.slice(debut, finObjet + 1)] : [])];
}

function objetJson(texte: string): Record<string, unknown> | undefined {
  for (const forme of formesAEssayer(texte)) {
    try {
      const valeur: unknown = JSON.parse(forme);
      if (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur)) return valeur as Record<string, unknown>;
    } catch {
      // Forme suivante.
    }
  }
  return undefined;
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

/**
 * Vrai si la réponse contient un objet JSON dont les clés de racine sont parmi `cles` (B7a, couche IA : une réponse
 * illisible de la notation ou des raisons donne `model_output_invalid`, 0077 § 2 point 4). `lireNotes` et `lireRaisons`
 * gardent leur forme de P0 (aucun drapeau `illisible`) ; la couche IA demande la lisibilité ici.
 */
export function racineLisible(texte: string, cles: readonly string[]): boolean {
  return racine(texte, cles) !== undefined;
}

// --- Plan de recherche -------------------------------------------------------

export const RequetePlanSchema = z.strictObject({
  requete: texteMaison(LONGUEURS_TEXTE.requete),
  creneau: z.enum([...TYPES_CRENEAU, "event"]),
});
export type RequetePlan = z.infer<typeof RequetePlanSchema>;

export function lirePlan(texte: string): Lecture<RequetePlan[]> {
  const objet = racine(texte, ["requetes"]);
  if (objet === undefined) return { valeur: [], refuses: 1, illisible: true };
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

/**
 * Tour de l'agent. Réponse illisible (ticket 400) : `termine` faux, pour que l'agent redemande au tour suivant (borné par
 * `toursMax`) au lieu de finir sur une sortie qu'il n'a pas pu lire.
 */
export function lireTour(texte: string): Lecture<TourRecherche> {
  const objet = racine(texte, ["actions", "candidats", "termine"]);
  if (objet === undefined || typeof objet.termine !== "boolean") {
    return { valeur: { actions: [], candidats: [], termine: false }, refuses: 1, illisible: true };
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
  for (const { id, matchesWishes, notForMeRisk, mustSee, slotFit } of valeur) {
    if (!idsAttendus.has(id) || notes.has(id)) ecartes += 1;
    else notes.set(id, { matchesWishes, notForMeRisk, mustSee, slotFit });
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

// --- Structuration du brief (B7-PO-2) -----------------------------------------

/**
 * Brief déduit : la réponse entière est un `InferredBrief` du contrat, validé par `InferredBriefSchema` (clés fermées,
 * `inferredFields` égal aux champs présents). Une sortie non conforme est refusée **en entier** (`illisible`, puis
 * `model_output_invalid`) : aucun brief partiel (F8-PO-17).
 */
export function lireBriefDeduit(texte: string): Lecture<InferredBrief | null> {
  const objet = objetJson(texte);
  const brief = objet === undefined ? undefined : InferredBriefSchema.safeParse(objet);
  if (brief === undefined || !brief.success) return { valeur: null, refuses: 1, illisible: true };
  return { valeur: brief.data, refuses: 0 };
}

// --- Quartier conseillé (B7-PO-3) ---------------------------------------------

/** Zone proposée par le modèle : textes et valeurs maison (centre et rayon), jamais un identifiant ni une géométrie Google. */
const ZoneSchema = z.strictObject({
  nom: texteMaison(LONGUEURS_TEXTE.nom),
  raison: texteMaison(160),
  centre: z.strictObject({ lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180) }),
  rayonM: z.number().int().min(50).max(20_000),
});
export type ZoneProposee = z.infer<typeof ZoneSchema>;

/** Logement proposé : nom et ligne `meta` maison, URL `https:` de la source choisie ; aucun identifiant. */
const LogementSchema = z.strictObject({
  nom: texteMaison(LONGUEURS_TEXTE.nom),
  meta: texteMaison(160),
  sourceUrl: z
    .string()
    .min(1)
    .max(2048)
    .refine((valeur) => URL.canParse(valeur) && new URL(valeur).protocol === "https:", "source https: exigée"),
});
export type LogementPropose = z.infer<typeof LogementSchema>;

/**
 * Quartier : `zone` valide exigée, ou « aucune zone » explicite (`"zone": null`, puis aucun logement lu) ; sinon la
 * réponse entière est refusée (`illisible`). Chaque logement est validé à part : sans source `https:`, ou avec une clé en
 * trop (un identifiant proposé par le modèle, `lodgingId`, `placeId`…), il est écarté et compté ; au-delà de
 * `MAX_SUGGESTED_LODGINGS`, les logements sont tronqués et comptés. Le contrôle « URL présente dans les résultats de
 * l'exécution » et les identifiants sont faits par `src/research` (B7b, `suggererQuartier`).
 */
export function lireQuartier(texte: string): Lecture<{ zone: ZoneProposee | null; logements: LogementPropose[] }> {
  const objet = racine(texte, ["zone", "logements"]);
  if (objet === undefined || !("zone" in objet)) return { valeur: { zone: null, logements: [] }, refuses: 1, illisible: true };
  // Aucune zone : aucun logement n'est lu ; ceux qui seraient rendus quand même sont écartés et comptés.
  if (objet.zone === null) return { valeur: { zone: null, logements: [] }, refuses: Array.isArray(objet.logements) ? objet.logements.length : 0 };
  const zone = ZoneSchema.safeParse(objet.zone);
  if (!zone.success) return { valeur: { zone: null, logements: [] }, refuses: 1, illisible: true };
  const logements = objet.logements === undefined ? { valeur: [], refuses: 0 } : elements(objet.logements, LogementSchema, MAX_SUGGESTED_LODGINGS);
  return { valeur: { zone: zone.data, logements: logements.valeur }, refuses: logements.refuses };
}
