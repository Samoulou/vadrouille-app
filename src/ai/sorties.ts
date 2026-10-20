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

/**
 * Clé de comparaison d'un nom maison (doublons de l'agent, secteurs et incontournables du plan, mesures de `evals/`) :
 * formes de compatibilité ramenées (NFKC : lettres pleine chasse, ligatures), minuscules, accents latins, grecs et
 * cyrilliques retirés (« Château » et « chateau », « Αθήνα » et « αθηνα »), ponctuation et symboles remplacés par une
 * espace. Les autres marques sont gardées, car elles changent le mot : dakuten japonais (« ガ » n'est pas « カ »),
 * voyelles du devanagari ou du thaï. Les lettres sans décomposition sont gardées telles quelles (« Łódź » donne
 * « łodz », « Øresund » donne « øresund »). Un nom fait seulement de symboles donne une clé vide, que les appelants
 * refusent (plan : `secteur_en_double` ou `incontournable_en_double` ; agent : candidat `invalid`). Réexportée par
 * `src/research/agent.ts` (`cleDeNom`), où la spécification la cite (amendement 3 de la suite 2 de P0, vocabulaire).
 */
export function cleDeNom(nom: string): string {
  // Correction 2 de la PR 505 (mineurs 3 et 4) : seuls les diacritiques du bloc U+0300 à U+036F sont retirés, puis la
  // forme composée est rétablie (NFC), pour que les autres marques restent dans leur lettre.
  return nom
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Longueurs des textes maison du plan par secteurs (P0S2-PO-19 ; nom de secteur : limite de `StopFacts.area`).
 * `secteur` et `incontournable` sont **dérivées** de `LONGUEURS_TEXTE` (décision 0094 § 1 point 2 : le candidat enrichi
 * porte les mêmes champs) ; `raisonSecteur` reste propre au plan.
 */
export const LONGUEURS_PLAN = { secteur: LONGUEURS_TEXTE.secteur, raisonSecteur: 160, incontournable: LONGUEURS_TEXTE.incontournable } as const;

/** Nombre de secteurs du plan : au plus 9 (P0S2-PO-19 : 3 × 9 + 2 = 29 requêtes, sous la limite de 30). */
export const SECTEURS_MAX = 9;
/** Requêtes du plan : 30 au plus (inchangé) ; requêtes d'événements : 2 au plus, en fin de liste. */
export const REQUETES_PLAN_MAX = 30;
export const REQUETES_EVENEMENT_MAX = 2;

/**
 * Borne de forme du schéma par secteur (garde de taille seulement) : 2 incontournables par jour sur 31 jours, au-delà de
 * tout séjour admis (15 jours au plus pour un brief de P0). La vraie borne, `min(2 × jours, cible d'activités)` sur tout
 * le plan, est appliquée par `reglePlanManquee`.
 */
export const INCONTOURNABLES_SCHEMA_MAX = 2 * 31;

export const SecteurPlanSchema = z.strictObject({
  nom: texteMaison(LONGUEURS_PLAN.secteur),
  raison: texteMaison(LONGUEURS_PLAN.raisonSecteur),
  voisins: z.array(texteMaison(LONGUEURS_PLAN.secteur)).max(SECTEURS_MAX - 1),
  incontournables: z.array(texteMaison(LONGUEURS_PLAN.incontournable)).max(INCONTOURNABLES_SCHEMA_MAX),
});
export type SecteurPlan = z.infer<typeof SecteurPlanSchema>;

export const RequetePlanSchema = z.strictObject({
  requete: texteMaison(LONGUEURS_TEXTE.requete),
  creneau: z.enum([...TYPES_CRENEAU, "event"]),
  /** Nom d'un secteur du plan ; `null` pour une requête d'événements seulement (P0S2-PO-19). */
  secteur: texteMaison(LONGUEURS_PLAN.secteur).nullable(),
});
export type RequetePlan = z.infer<typeof RequetePlanSchema>;

const PlanSchema = z.strictObject({
  secteurs: z.array(SecteurPlanSchema).min(1).max(SECTEURS_MAX),
  requetes: z.array(RequetePlanSchema).max(REQUETES_PLAN_MAX),
});

/** Plan de recherche par secteurs (prompt `plan` v2), validé en entier par `lirePlan`. */
export type PlanRecherche = { readonly secteurs: readonly SecteurPlan[]; readonly requetes: readonly RequetePlan[] };

/** Plan vide : sortie refusée en entier, ou recherche sans plan. Aucun secteur : la règle des secteurs ne s'applique pas. */
export const PLAN_VIDE: PlanRecherche = { secteurs: [], requetes: [] };

/**
 * Contexte de contrôle du plan : nombre de jours du séjour (arrivée et départ compris) et, quand l'appelant la connaît,
 * la cible d'activités de la recherche (`bornesDepuisDemande`, 0088 § 1 à § 3), qui borne le nombre d'incontournables.
 */
export type ContextePlan = { readonly jours: number; readonly cibleActivites?: number };

/** Nombre de jours d'un séjour, arrivée et départ compris (dates ISO `AAAA-MM-JJ`) ; au moins 1. */
export function joursDuSejour(arrivee: string, depart: string): number {
  const jour = 24 * 60 * 60 * 1000;
  const ecart = Math.round((Date.parse(`${depart}T00:00:00Z`) - Date.parse(`${arrivee}T00:00:00Z`)) / jour);
  return Number.isFinite(ecart) ? Math.max(1, ecart + 1) : 1;
}

/** Bornes du nombre de secteurs (P0S2-PO-19) : de `⌈jours / 2⌉` à `min(jours + 1, 9)`. */
export function bornesSecteurs(jours: number): { min: number; max: number } {
  return { min: Math.min(SECTEURS_MAX, Math.ceil(jours / 2)), max: Math.min(jours + 1, SECTEURS_MAX) };
}

/**
 * Règles de forme du plan par secteurs (P0S2-PO-19), au-delà du schéma : `undefined` si le plan est conforme, sinon la
 * première règle manquée (jamais montrée au modèle ni journalisée avec un texte du plan).
 */
export function reglePlanManquee(plan: PlanRecherche, contexte: ContextePlan): string | undefined {
  const { min, max } = bornesSecteurs(contexte.jours);
  if (plan.secteurs.length < min || plan.secteurs.length > max) return "nombre_de_secteurs";
  const rang = new Map<string, number>();
  for (const [indice, secteur] of plan.secteurs.entries()) {
    const cle = cleDeNom(secteur.nom);
    if (cle === "" || rang.has(cle)) return "secteur_en_double";
    rang.set(cle, indice);
  }
  for (const secteur of plan.secteurs) {
    for (const voisin of secteur.voisins) {
      const cle = cleDeNom(voisin);
      if (!rang.has(cle) || cle === cleDeNom(secteur.nom)) return "voisin_inconnu";
    }
  }
  const incontournables = plan.secteurs.flatMap((secteur) => secteur.incontournables.map(cleDeNom));
  if (incontournables.some((cle) => cle === "") || new Set(incontournables).size !== incontournables.length) return "incontournable_en_double";
  const plafond = Math.min(2 * contexte.jours, contexte.cibleActivites ?? Number.POSITIVE_INFINITY);
  if (incontournables.length > plafond) return "trop_d_incontournables";
  let evenements = 0;
  let dernierRang = -1;
  const creneauxVus = new Map<number, Set<string>>();
  for (const requete of plan.requetes) {
    if (requete.creneau === "event") {
      if (requete.secteur !== null) return "evenement_avec_secteur";
      evenements += 1;
      continue;
    }
    // Les requêtes d'événements ferment la liste : aucune requête de secteur après elles.
    if (evenements > 0) return "evenements_hors_fin";
    if (requete.secteur === null) return "requete_sans_secteur";
    const indice = rang.get(cleDeNom(requete.secteur));
    if (indice === undefined) return "requete_secteur_inconnu";
    if (indice < dernierRang) return "secteurs_hors_ordre";
    dernierRang = indice;
    const vus = creneauxVus.get(indice) ?? new Set<string>();
    if (vus.has(requete.creneau)) return "requete_en_double";
    // Pour chaque secteur, la requête d'incontournables (activité) précède ses requêtes de repas et de soirée.
    if (requete.creneau === "activity" && vus.size > 0) return "incontournables_apres_repas";
    vus.add(requete.creneau);
    creneauxVus.set(indice, vus);
  }
  if (evenements > REQUETES_EVENEMENT_MAX) return "trop_d_evenements";
  return undefined;
}

/**
 * Plan de recherche par secteurs (prompt `plan` v2, P0S2-PO-19). Sortie non conforme, au schéma comme aux règles de
 * forme (`reglePlanManquee`), refusée **en entier** (`illisible`, comptée une fois) : la recherche part alors sans plan.
 */
export function lirePlan(texte: string, contexte: ContextePlan): Lecture<PlanRecherche> {
  const objet = racine(texte, ["secteurs", "requetes"]);
  const lu = objet === undefined ? undefined : PlanSchema.safeParse(objet);
  if (lu === undefined || !lu.success || reglePlanManquee(lu.data, contexte) !== undefined) return { valeur: PLAN_VIDE, refuses: 1, illisible: true };
  return { valeur: lu.data, refuses: 0 };
}

/**
 * Plan de secteurs gardé entre les étapes de `p0Run` dans la table du plan de secteurs du prototype (décision 0094 § 2 point 1 ; verdict de
 * la Sécurité 0103, question 1) : le **schéma du plan restreint** aux clés stockées, sans second schéma. Noms, voisins et
 * incontournables seulement : **ni `raison`, ni `requetes`** (les requêtes reprennent des envies du brief), ni jour, rang,
 * ordre, position ou compteur. Contenu maison, écrit avant tout ancrage, fonction de la sortie de l'agent seule.
 */
export const PlanSecteursStockeSchema = z.strictObject({
  secteurs: z.array(SecteurPlanSchema.pick({ nom: true, voisins: true, incontournables: true })).min(1).max(SECTEURS_MAX),
});
export type PlanSecteursStocke = z.infer<typeof PlanSecteursStockeSchema>;

/**
 * Forme stockée du plan lu et validé (`lirePlan`) : chaque secteur réduit à `nom`, `voisins` et `incontournables`, dans
 * l'ordre du plan. Plan vide (refusé, illisible ou sans secteur) : `undefined`, rien n'est stocké (jamais un plan par défaut
 * inventé). Fonction pure.
 */
export function planSecteursStocke(plan: PlanRecherche): PlanSecteursStocke | undefined {
  if (plan.secteurs.length === 0) return undefined;
  const lu = PlanSecteursStockeSchema.safeParse({
    secteurs: plan.secteurs.map((secteur) => ({ nom: secteur.nom, voisins: [...secteur.voisins], incontournables: [...secteur.incontournables] })),
  });
  return lu.success ? lu.data : undefined;
}

/**
 * Relecture d'une ligne de la table du plan de secteurs (0103, question 1, condition 8) : validée par `PlanSecteursStockeSchema`
 * ; contenu invalide : `undefined`, que l'appelant traite comme une erreur fermée (jamais un plan par défaut).
 */
export function lirePlanSecteursStocke(valeur: unknown): PlanSecteursStocke | undefined {
  const lu = PlanSecteursStockeSchema.safeParse(valeur);
  return lu.success ? lu.data : undefined;
}

// --- Tour de recherche -------------------------------------------------------

export const ActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("rechercher"), requete: texteMaison(LONGUEURS_TEXTE.requete) }),
  z.strictObject({ type: z.literal("lire"), url: z.string().min(1).max(2048) }),
]);
export type Action = z.infer<typeof ActionSchema>;

/** Longueurs des infos pratiques d'un lieu (P0S2-PO-21), dérivées de `LONGUEURS_TEXTE` (décision 0094 § 1 point 2). */
export const LONGUEURS_INFOS = { prix: LONGUEURS_TEXTE.prix, horaires: LONGUEURS_TEXTE.horaires, conseil: LONGUEURS_TEXTE.conseil } as const;

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
  /** Secteur du plan où se trouve le lieu (P0S2-PO-20) ; `null` admis pour un événement seulement (contrôlé par l'agent). */
  secteur: texteMaison(LONGUEURS_PLAN.secteur).nullable().optional(),
  /** Nom de l'incontournable du plan que ce lieu est, du même secteur ; sinon `null` (P0S2-PO-20). */
  incontournable: texteMaison(LONGUEURS_PLAN.incontournable).nullable().optional(),
  /** Infos pratiques tirées de la page source, réécrites en texte maison (P0S2-PO-21) ; absentes si la source ne les donne pas. */
  prix: texteMaison(LONGUEURS_INFOS.prix).optional(),
  horaires: texteMaison(LONGUEURS_INFOS.horaires).optional(),
  conseil: texteMaison(LONGUEURS_INFOS.conseil).optional(),
  /**
   * Créneaux auxquels le lieu convient selon le modèle de recherche (ticket 483, forme du `slotFit` de la notation) : sert
   * seulement à compter les cibles de l'agent (`creneauCompte`), jamais gardé dans le candidat ; la notation reste seule
   * juge des créneaux à la planification. Indication facultative : mal formée, elle est ignorée, le lieu n'est pas écarté.
   */
  slotFit: NotesSchema.shape.slotFit.optional().catch(undefined),
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
