import { z } from "zod";

import { LONGUEURS_TEXTE, NotesSchema, TYPES_CRENEAU, texteMaison, type Notes } from "@/ai/candidat";
import { CategorySchema, InferredBriefSchema, IsoDateSchema, MAX_SUGGESTED_LODGINGS, STOP_KINDS, TimeSchema, type InferredBrief } from "@/contracts";

/**
 * Schémas stricts des sorties de modèles (spécification P0, « Sorties des modèles : schémas stricts »).
 * Chaque élément est validé à part : un élément refusé est écarté et compté (`model_output_invalid` par étape),
 * sans son contenu. Une réponse qui n'est pas un objet JSON est refusée en entier (comptée une fois, `illisible`).
 * Les identifiants acceptés sont seulement ceux de la requête. Exception (ticket 595, décision 0111) : un champ facultatif
 * d'enrichissement invalide d'un candidat extrait (`CHAMPS_ENRICHIS_TOLERANTS`) est retiré seul, une clé inconnue
 * ignorée et un texte trop long coupé (`texteCoupe`, décision de Samuel du 2026-10-20) : le lieu est gardé.
 *
 * Habillage toléré (ticket 400) : un modèle rend souvent son objet JSON dans un bloc de code Markdown (```json … ```),
 * précédé d'une phrase ou d'un raisonnement (`<think>…</think>`). L'objet est alors cherché dans cet habillage
 * (`formesAEssayer`) ; le schéma qui le valide reste aussi strict. Une réponse de plus de `LONGUEUR_REPONSE_MAX`
 * caractères est refusée en entier, et la recherche de l'habillage reste linéaire (bloquant 1 du head `cd614d4`).
 */

export type Lecture<T> = {
  valeur: T;
  refuses: number;
  /**
   * Champs facultatifs retirés d'éléments gardés (ticket 595, `lireTour` seulement) : un champ d'enrichissement invalide
   * est retiré, l'élément reste. Un nombre, jamais le champ ni son texte.
   */
  champsRetires?: number;
  /**
   * Textes trop longs coupés à leur longueur maximale dans des éléments gardés (décision de Samuel du 2026-10-20,
   * décision 0111, `lireTour` seulement). Un nombre, jamais le texte.
   */
  textesCoupes?: number;
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

/**
 * Valide chaque élément d'un tableau, borne sa longueur, compte les refus. `garde` (facultatif) est appelé pour chaque
 * élément gardé, avec l'élément brut et sa forme validée (ticket 595 : compte des champs retirés et des textes coupés).
 */
function elements<T>(brut: unknown, schema: z.ZodType<T>, max: number, garde?: (element: unknown, lu: T) => void): Lecture<T[]> {
  if (!Array.isArray(brut)) return { valeur: [], refuses: 1 };
  let refuses = Math.max(0, brut.length - max);
  const valeur: T[] = [];
  for (const element of brut.slice(0, max)) {
    const resultat = schema.safeParse(element);
    if (resultat.success) {
      valeur.push(resultat.data);
      garde?.(element, resultat.data);
    } else refuses += 1;
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

/**
 * Champs facultatifs d'enrichissement d'un candidat extrait (ticket 595, amendement Tech Lead 0111) : une valeur invalide
 * (caractère interdit, balise, URL ou domaine, texte vide, nombre hors bornes, forme inattendue) est **retirée**, le lieu
 * est gardé ; jamais corrigée ni recopiée (un texte seulement trop long est coupé, `texteCoupe`). Les champs
 * obligatoires et `evenement` invalides font toujours écarter le lieu.
 */
export const CHAMPS_ENRICHIS_TOLERANTS = ["secteur", "incontournable", "prix", "horaires", "conseil", "prixParPersonne", "dureeMinutes", "slotFit"] as const;

/**
 * Textes libres d'un candidat extrait et leur longueur maximale : trop longs, ils sont coupés (`texteCoupe`), jamais
 * refusés pour leur longueur.
 */
const TEXTES_CANDIDAT = {
  nom: LONGUEURS_TEXTE.nom,
  resume: LONGUEURS_TEXTE.resume,
  secteur: LONGUEURS_PLAN.secteur,
  incontournable: LONGUEURS_PLAN.incontournable,
  prix: LONGUEURS_INFOS.prix,
  horaires: LONGUEURS_INFOS.horaires,
  conseil: LONGUEURS_INFOS.conseil,
} as const;

/**
 * Compte d'un candidat gardé : `retires`, champs tolérants présents dans l'élément brut (valeur autre que `undefined`)
 * mais retirés par le schéma, plus les clés inconnues ignorées (leur nombre n'est borné que par `LONGUEUR_REPONSE_MAX` :
 * un compteur, sans autre effet) ; `coupes`, textes gardés dont la valeur brute dépassait leur longueur maximale (une
 * valeur assez courte dont seules les espaces de fin tombent n'est pas comptée). Ne compare que des présences et des
 * longueurs, jamais un texte.
 */
function compteCandidat(brut: unknown, lu: CandidatExtrait): { retires: number; coupes: number } {
  if (typeof brut !== "object" || brut === null) return { retires: 0, coupes: 0 };
  const present = new Map(Object.entries(brut));
  const garde = new Map(Object.entries(lu));
  const connues = new Set(Object.keys(CandidatExtraitSchema.shape));
  const inconnues = [...present.keys()].filter((cle) => !connues.has(cle)).length;
  const retires = inconnues + CHAMPS_ENRICHIS_TOLERANTS.filter((champ) => present.get(champ) !== undefined && garde.get(champ) === undefined).length;
  const coupes = Object.entries(TEXTES_CANDIDAT).filter(([champ, max]) => {
    const avant = present.get(champ);
    return typeof avant === "string" && avant.length > max && typeof garde.get(champ) === "string";
  }).length;
  return { retires, coupes };
}

const DECOUPAGE = new Intl.Segmenter("fr", { granularity: "grapheme" });
const ESPACE = /\s/u;

/**
 * Coupe un texte à `max` unités (la longueur de `String.length`, celle que `texteMaison` borne), sans couper un
 * caractère (graphème : paire de substitution, lettre et ses marques), de préférence sur une fin de mot : la dernière
 * espace de la coupe si elle laisse au moins la moitié de `max`. Espaces de fin retirées. Texte assez court : rendu tel
 * quel. Décision de Samuel du 2026-10-20 (décision 0111). Fonction pure.
 */
export function couperTexte(texte: string, max: number): string {
  if (texte.length <= max) return texte;
  let coupe = "";
  for (const { segment } of DECOUPAGE.segment(texte)) {
    if (coupe.length + segment.length > max) break;
    coupe += segment;
  }
  const suivant = texte.charAt(coupe.length);
  if (!ESPACE.test(suivant)) {
    let fin = coupe.length - 1;
    while (fin >= 0 && !ESPACE.test(coupe.charAt(fin))) fin -= 1;
    if (fin >= max / 2) coupe = coupe.slice(0, fin);
  }
  return coupe.trimEnd();
}

/** Mêmes règles que `texteMaison` (caractères interdits, balises, URL), sans borne de longueur. */
const TEXTE_SANS_BORNE = texteMaison(Number.MAX_SAFE_INTEGER);

/**
 * Texte maison d'un candidat extrait (décision de Samuel du 2026-10-20, décision 0111) : trop long, il est **coupé** à
 * `max` (`couperTexte`) au lieu d'être refusé. Caractères interdits, balises et URL restent refusés, vérifiés sur le
 * texte **entier** avant la coupe (une coupe ne peut pas faire passer un domaine tronqué, « exemple.c »), puis de
 * nouveau sur le texte coupé (`texteMaison(max)`). Les motifs d'URL sont linéaires (`contientUrl`) : le contrôle du
 * texte entier, borné seulement par `LONGUEUR_REPONSE_MAX`, ne bloque pas la boucle d'événements. Échec fermé : une coupe
 * qui fait apparaître un domaine (« foo.commerce » coupé en « foo.com ») ou qui ne laisse rien (graphème plus long que
 * `max`) est refusée par le second contrôle ; pour `nom` et `resume`, le lieu est alors écarté (décision 0111 § 3).
 */
export function texteCoupe(max: number) {
  return z
    .string()
    .refine((valeur) => TEXTE_SANS_BORNE.safeParse(valeur).success, "texte refusé avant la coupe")
    .transform((valeur) => couperTexte(valeur, max))
    .pipe(texteMaison(max));
}

/**
 * Candidat tel que l'extrait le modèle ; l'identifiant et la classe de source sont posés par le code. Champs
 * `CHAMPS_ENRICHIS_TOLERANTS` : invalides, retirés (`.catch(undefined)`), le lieu gardé (ticket 595). Textes trop
 * longs, nom et résumé compris : coupés (`texteCoupe`), jamais refusés pour leur longueur (décision 0111). Clés inconnues
 * (un `placeId` proposé par le modèle, par exemple) : **ignorées**, jamais recopiées (objet `z.object`, qui les retire de
 * la sortie), et comptées dans `champsRetires`. `evenement` reste un objet strict.
 */
export const CandidatExtraitSchema = z.object({
  nom: texteCoupe(LONGUEURS_TEXTE.nom),
  resume: texteCoupe(LONGUEURS_TEXTE.resume),
  categorie: CategorySchema,
  typeEtape: z.enum(STOP_KINDS),
  sourceUrl: z.string().min(1).max(2048),
  sourceDate: IsoDateSchema,
  evenement: z.strictObject({ date: IsoDateSchema, heure: TimeSchema.optional() }).optional(),
  aReserver: z.boolean(),
  prixParPersonne: z.number().finite().nonnegative().max(1000).optional().catch(undefined),
  dureeMinutes: z.number().int().min(15).max(600).optional().catch(undefined),
  /**
   * Secteur du plan où se trouve le lieu (P0S2-PO-20) ; `null` admis pour un événement seulement (contrôlé par l'agent).
   * Invalide : retiré, et l'agent écarte alors un lieu (`secteur_inconnu`) comme un secteur absent.
   */
  secteur: texteCoupe(LONGUEURS_PLAN.secteur).nullable().optional().catch(undefined),
  /** Nom de l'incontournable du plan que ce lieu est, du même secteur ; sinon `null` (P0S2-PO-20). Invalide : retiré. */
  incontournable: texteCoupe(LONGUEURS_PLAN.incontournable).nullable().optional().catch(undefined),
  /**
   * Infos pratiques tirées de la page source, réécrites en texte maison (P0S2-PO-21) ; absentes si la source ne les donne
   * pas. Trop longues : coupées ; caractère interdit, balise, URL : retirées, jamais recopiées (ticket 595, décision 0111).
   */
  prix: texteCoupe(LONGUEURS_INFOS.prix).optional().catch(undefined),
  horaires: texteCoupe(LONGUEURS_INFOS.horaires).optional().catch(undefined),
  conseil: texteCoupe(LONGUEURS_INFOS.conseil).optional().catch(undefined),
  /**
   * Créneaux auxquels le lieu convient selon le modèle de recherche (ticket 483, forme du `slotFit` de la notation) : sert
   * seulement à compter les cibles de l'agent (`creneauCompte`) : rendu par ce schéma, il n'est jamais recopié dans le
   * candidat de recherche (`CandidatRecherche`) ; la notation reste seule
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
  let champsRetires = 0;
  let textesCoupes = 0;
  const compter = (brut: unknown, lu: CandidatExtrait) => {
    const { retires, coupes } = compteCandidat(brut, lu);
    champsRetires += retires;
    textesCoupes += coupes;
  };
  const candidats = objet.candidats === undefined ? { valeur: [], refuses: 0 } : elements(objet.candidats, CandidatExtraitSchema, 30, compter);
  return {
    valeur: { actions: actions.valeur, candidats: candidats.valeur, termine: objet.termine },
    refuses: actions.refuses + candidats.refuses,
    champsRetires,
    textesCoupes,
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

// --- Programme écrit par l'IA (décision 0115 ; verdict de la Sécurité 0117 § 1) ------------------------------------

/** Natures d'un créneau du programme (liste fermée, spécification § 3 ; une nature invalide retire le créneau). */
export const NATURES_CRENEAU = ["arrivee", "visite", "repas_midi", "repas_soir", "apero", "soiree", "pause", "depart"] as const;
export type NatureCreneau = (typeof NATURES_CRENEAU)[number];

/** Natures admises sans lieu (T1 proposé, 0117 § 1 point 4) : arrivée, départ, pause. */
export const NATURES_SANS_LIEU: ReadonlySet<NatureCreneau> = new Set<NatureCreneau>(["arrivee", "depart", "pause"]);

/**
 * Bornes de quantité, techniques et non de qualité (0117 § 1 point 3) : au-delà, les éléments en trop sont ignorés et
 * comptés, jamais un refus du programme.
 */
export const CRENEAUX_PAR_JOUR_MAX = 30;
export const ELEMENTS_LISTE_PROGRAMME_MAX = 20;

/** Heure `HH:MM` de 00:00 à 23:59. */
const HEURE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** Textes d'un créneau et leur longueur de coupe (0117 § 1 point 2). */
const TEXTES_CRENEAU = {
  lieu: LONGUEURS_TEXTE.nom,
  ville: LONGUEURS_TEXTE.secteur,
  quartier: LONGUEURS_TEXTE.secteur,
  pourquoi: LONGUEURS_TEXTE.pourquoi,
  conseil: LONGUEURS_TEXTE.conseil,
  prix: LONGUEURS_TEXTE.prix,
  horaires: LONGUEURS_TEXTE.horaires,
} as const;

/** Champs facultatifs d'un créneau : invalides, retirés seuls (`.catch(undefined)`), le créneau gardé (modèle 0111). */
const CHAMPS_FACULTATIFS_CRENEAU = ["fin", "lieu", "pourquoi", "ville", "quartier", "conseil", "prix", "horaires", "aReserver", "incontournable", "site"] as const;

/**
 * Longueur maximale de l'adresse `site` lue **brute** (décision 0121 § 3.3) : la forme (https, hôte public non Google,
 * réduction, 300 caractères après réduction) est contrôlée ensuite par `reduireSite` (`src/research/fetch-page.ts`),
 * que `src/ai` n'importe pas ; une seule analyse d'adresse.
 */
export const SITE_BRUT_MAX = 2_048;

/** Natures dont le créneau ne devient jamais une étape (lignes `terminus`) : `site` y est ignoré (0122 § 2.2 point 1). */
const NATURES_TERMINUS: ReadonlySet<NatureCreneau> = new Set<NatureCreneau>(["arrivee", "depart"]);

/**
 * Créneau écrit par l'IA. Tout texte passe par `texteCoupe` (contrôle du texte entier, coupe, recontrôle : 0111 § 3,
 * 0117 § 1 point 1), donc par la règle du contrat (`texteMaison` de `src/contracts/texte.ts`, réexportée par
 * `src/ai/candidat.ts` depuis la PR 652, ticket 633) : `conseil`, `prix`, `horaires` et le titre du jour vont aux
 * champs du contrat (`StopFacts.tip`, `priceNote`, `hoursNote`, `Day.theme` ; 0116 § 6, lot 1 bis). Clés inconnues
 * (`placeId`, `url`, `source`, `website`, `lat`…) : ignorées (`z.object` les retire), jamais lues ni recopiées (0117
 * § 1 point 5), et comptées dans `champsRetires`.
 *
 * Seule exception (lot 2a, 0117 § 1 point 5 amendé par 0122 § 2.2) : le champ nommé `site`, lu comme une **chaîne
 * brute** de `SITE_BRUT_MAX` caractères au plus, sur un créneau avec `lieu` qui devient une étape (ni arrivée ni
 * départ) ; sinon retiré et compté. Jamais écrit tel quel : la forme et la réduction sont celles de `reduireSite`, la
 * vérification celle de `src/server/p0/sites.ts`. `contientUrl` reste entier pour tous les autres textes (A15).
 */
const CreneauIaObjet = z.object({
    debut: z.string().regex(HEURE),
    fin: z.string().regex(HEURE).optional().catch(undefined),
    nature: z.enum(NATURES_CRENEAU),
    lieu: texteCoupe(TEXTES_CRENEAU.lieu).optional().catch(undefined),
    ville: texteCoupe(TEXTES_CRENEAU.ville).optional().catch(undefined),
    quartier: texteCoupe(TEXTES_CRENEAU.quartier).optional().catch(undefined),
    pourquoi: texteCoupe(TEXTES_CRENEAU.pourquoi).optional().catch(undefined),
    conseil: texteCoupe(TEXTES_CRENEAU.conseil).optional().catch(undefined),
    prix: texteCoupe(TEXTES_CRENEAU.prix).optional().catch(undefined),
    horaires: texteCoupe(TEXTES_CRENEAU.horaires).optional().catch(undefined),
    aReserver: z.boolean().optional().catch(undefined),
    incontournable: z.boolean().optional().catch(undefined),
    site: z.string().min(1).max(SITE_BRUT_MAX).optional().catch(undefined),
});
export const CreneauIaSchema = CreneauIaObjet
  .refine((creneau) => creneau.lieu !== undefined || NATURES_SANS_LIEU.has(creneau.nature), "lieu obligatoire pour cette nature")
  .refine((creneau) => creneau.lieu === undefined || creneau.pourquoi !== undefined, "pourquoi obligatoire dès qu'il y a un lieu");
export type CreneauIa = z.infer<typeof CreneauIaSchema>;

export type JourIa = { readonly date: string; readonly titre?: string; readonly creneaux: readonly CreneauIa[] };
export type ProgrammeIa = {
  readonly titre?: string;
  readonly jours: readonly JourIa[];
  readonly bonsPlans: readonly string[];
};

/** Lecture du programme : la valeur (ou `null`, programme refusé) et les compteurs maison de 0117 § 4 (des nombres). */
export type LectureProgramme = {
  readonly valeur: ProgrammeIa | null;
  readonly joursRetires: number;
  readonly creneauxRetires: number;
  readonly champsRetires: number;
  readonly textesCoupes: number;
  /** Vrai si la réponse n'est pas un objet JSON lisible (dans `LONGUEUR_REPONSE_MAX`). */
  readonly illisible: boolean;
};

const objetBrut = (valeur: unknown): Record<string, unknown> | undefined =>
  typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : undefined;

/** Texte brut plus long que `max` gardé (donc coupé) : compté, jamais recopié. */
const coupe = (brut: unknown, garde: unknown, max: number) => typeof brut === "string" && brut.length > max && typeof garde === "string";

/**
 * Programme écrit par l'IA, lu **tolérant** (décision 0115 § 4.4, verdict 0117 § 1) :
 * - réponse sans objet JSON lisible : `illisible`, `valeur: null` (l'appelant arrête `model_output_invalid`) ;
 * - journée dont la date n'est pas une date du séjour (`sejour`), ou répète une date déjà lue : retirée, `joursRetires` ;
 * - créneau sans heure valide, sans nature de la liste, sans `pourquoi`, ou sans `lieu` (hors arrivée, départ, pause) :
 *   retiré, `creneauxRetires` ; au-delà de `CRENEAUX_PAR_JOUR_MAX` : ignorés et comptés de même ; une journée n'est
 *   jamais retirée pour un créneau ;
 * - champ facultatif invalide ou clé inconnue : retiré ou ignoré, `champsRetires` ; texte trop long : coupé,
 *   `textesCoupes` ; bons plans au-delà de `ELEMENTS_LISTE_PROGRAMME_MAX` : ignorés,
 *   `champsRetires` ;
 * - aucune journée restante : `valeur: null`.
 * Journées rangées par date ; l'ordre des créneaux est celui de l'IA, que `ordreEcrit` met ensuite en ordre écrit.
 * Aucune règle de nombre de lieux, de durée, de distance ni de cohérence des horaires.
 */
export function lireProgramme(texte: string, sejour: { readonly arrivee: string; readonly depart: string }): LectureProgramme {
  let joursRetires = 0;
  let creneauxRetires = 0;
  let champsRetires = 0;
  let textesCoupes = 0;
  const racineLue = objetJson(texte);
  if (racineLue === undefined) return { valeur: null, joursRetires, creneauxRetires, champsRetires, textesCoupes, illisible: true };
  // `alternative` et `aEmporter` sont retirés de la v1 (décision 0116 § 1.1) : ignorés comme toute clé inconnue.
  const connuesRacine = new Set(["titre", "jours", "bonsPlans"]);
  champsRetires += Object.keys(racineLue).filter((cle) => !connuesRacine.has(cle)).length;
  const champsRacine = new Map(Object.entries(racineLue));

  const titreRacine = (cle: string, max: number): string | undefined => {
    const brut = champsRacine.get(cle);
    if (brut === undefined) return undefined;
    const lu = texteCoupe(max).safeParse(brut);
    if (!lu.success) {
      champsRetires += 1;
      return undefined;
    }
    if (coupe(brut, lu.data, max)) textesCoupes += 1;
    return lu.data;
  };
  const liste = (cle: string, max: number): string[] => {
    const brut = champsRacine.get(cle);
    if (brut === undefined) return [];
    if (!Array.isArray(brut)) {
      champsRetires += 1;
      return [];
    }
    champsRetires += Math.max(0, brut.length - ELEMENTS_LISTE_PROGRAMME_MAX);
    const gardes: string[] = [];
    for (const element of brut.slice(0, ELEMENTS_LISTE_PROGRAMME_MAX)) {
      const lu = texteCoupe(max).safeParse(element);
      if (!lu.success) champsRetires += 1;
      else {
        if (coupe(element, lu.data, max)) textesCoupes += 1;
        gardes.push(lu.data);
      }
    }
    return gardes;
  };

  const titre = titreRacine("titre", LONGUEURS_TEXTE.titreProgramme);
  const bonsPlans = liste("bonsPlans", LONGUEURS_TEXTE.bonPlan);

  const joursBruts = Array.isArray(racineLue.jours) ? racineLue.jours : [];
  if (!Array.isArray(racineLue.jours) && racineLue.jours !== undefined) champsRetires += 1;
  const dates = new Set<string>();
  const jours: JourIa[] = [];
  for (const jourBrut of joursBruts) {
    const objet = objetBrut(jourBrut);
    const date = IsoDateSchema.safeParse(objet?.date);
    if (objet === undefined || !date.success || date.data < sejour.arrivee || date.data > sejour.depart || dates.has(date.data)) {
      joursRetires += 1;
      continue;
    }
    dates.add(date.data);
    champsRetires += Object.keys(objet).filter((cle) => !["date", "titre", "creneaux"].includes(cle)).length;
    let titreJour: string | undefined;
    if (objet.titre !== undefined) {
      const lu = texteCoupe(LONGUEURS_TEXTE.titreJour).safeParse(objet.titre);
      if (!lu.success) champsRetires += 1;
      else {
        if (coupe(objet.titre, lu.data, LONGUEURS_TEXTE.titreJour)) textesCoupes += 1;
        titreJour = lu.data;
      }
    }
    const creneauxBruts = Array.isArray(objet.creneaux) ? objet.creneaux : [];
    if (!Array.isArray(objet.creneaux) && objet.creneaux !== undefined) champsRetires += 1;
    creneauxRetires += Math.max(0, creneauxBruts.length - CRENEAUX_PAR_JOUR_MAX);
    const creneaux: CreneauIa[] = [];
    for (const creneauBrut of creneauxBruts.slice(0, CRENEAUX_PAR_JOUR_MAX)) {
      const lu = CreneauIaSchema.safeParse(creneauBrut);
      if (!lu.success) {
        creneauxRetires += 1;
        continue;
      }
      const present = objetBrut(creneauBrut) ?? {};
      const connues = new Set(Object.keys(CreneauIaObjet.shape));
      champsRetires += Object.keys(present).filter((cle) => !connues.has(cle)).length;
      // `site` hors d'un créneau d'étape (sans lieu, arrivée, départ) : retiré, compté ci-dessous (0122 § 2.2 point 1).
      const creneau: CreneauIa = { ...lu.data };
      if (creneau.site !== undefined && (creneau.lieu === undefined || NATURES_TERMINUS.has(creneau.nature))) delete creneau.site;
      const lus = new Map(Object.entries(present));
      const gardes = new Map(Object.entries(creneau));
      champsRetires += CHAMPS_FACULTATIFS_CRENEAU.filter((champ) => lus.get(champ) !== undefined && gardes.get(champ) === undefined).length;
      textesCoupes += Object.entries(TEXTES_CRENEAU).filter(([champ, max]) => coupe(lus.get(champ), gardes.get(champ), max)).length;
      creneaux.push(creneau);
    }
    jours.push({ date: date.data, ...(titreJour === undefined ? {} : { titre: titreJour }), creneaux });
  }
  jours.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const valeur = jours.length === 0 ? null : { ...(titre === undefined ? {} : { titre }), jours, bonsPlans };
  return { valeur, joursRetires, creneauxRetires, champsRetires, textesCoupes, illisible: false };
}

/**
 * **Ordre écrit** du programme (décision 0116 § 1.7) : l'ordre de l'IA, puis un tri **stable** par `debut` (à heure égale,
 * l'ordre de l'IA), jour par jour, appliqué **une seule fois** par l'appelant ; la vérification, les trajets et l'écran
 * suivent cet ordre. Mise en ordre, jamais un contrôle : aucun créneau n'est retiré.
 */
export function ordreEcrit(programme: ProgrammeIa): ProgrammeIa {
  return {
    ...programme,
    jours: programme.jours.map((jour) => ({
      ...jour,
      creneaux: jour.creneaux
        .map((creneau, rang) => ({ creneau, rang }))
        .sort((a, b) => (a.creneau.debut < b.creneau.debut ? -1 : a.creneau.debut > b.creneau.debut ? 1 : a.rang - b.rang))
        .map(({ creneau }) => creneau),
    })),
  };
}


/**
 * Lieux distincts d'un programme **déjà dans l'ordre écrit** (`ordreEcrit`), jours puis créneaux (décision 0116 § 4.3
 * et § 4.5) : un
 * lieu cité plusieurs fois (même `cleDeNom` du nom, même ville ou, sans ville, la destination) est vérifié une fois.
 * `cleDe(jour, rang)` rend l'identifiant du lieu du créneau `rang` de la journée `jour`, ou `undefined`
 * pour un créneau sans lieu. Arrivée et départ ne sont jamais vérifiés (0116 § 4.1).
 * Lieu rendu : identifiant interne (`l_001`…), nom et ville de l'IA, contrôlés et coupés (0117 § 2 point 1). Le seul
 * type nommé est `LieuProgramme` (`src/grounding/ancrage-zone.ts`) ; `src/ai` ne peut pas l'importer (graphe d'import,
 * 0077 § 1 point 7), la forme littérale ci-dessous lui est vérifiée par le compilateur à l'appel de `p0Run`.
 */
export function lieuxDuProgramme(
  programme: ProgrammeIa,
  destination: string,
): { readonly lieux: readonly { readonly id: string; readonly lieu: string; readonly ville?: string }[]; readonly cleDe: (jour: number, rang: number) => string | undefined } {
  const parCle = new Map<string, string>();
  const lieux: { id: string; lieu: string; ville?: string }[] = [];
  const parCreneau = new Map<string, string>();
  programme.jours.forEach((jour, indiceJour) => {
    jour.creneaux.forEach((creneau, rang) => {
      if (creneau.lieu === undefined || creneau.nature === "arrivee" || creneau.nature === "depart") return;
      const cle = `${cleDeNom(creneau.lieu)}\u0000${cleDeNom(creneau.ville ?? destination)}`;
      let id = parCle.get(cle);
      if (id === undefined) {
        id = `l_${String(lieux.length + 1).padStart(3, "0")}`;
        parCle.set(cle, id);
        lieux.push({ id, lieu: creneau.lieu, ...(creneau.ville === undefined ? {} : { ville: creneau.ville }) });
      }
      parCreneau.set(`${indiceJour}:${rang}`, id);
    });
  });
  return { lieux, cleDe: (jour, rang) => parCreneau.get(`${jour}:${rang}`) };
}

/**
 * **Retours de quartier** d'un programme **déjà dans l'ordre écrit** (`ordreEcrit`) : mesure de la règle « les étapes
 * d'un même quartier se suivent » du prompt `programme` v4 et `revision` v2 (amendement 4 de
 * la spécification P0-programme-par-ia, ticket #800). Pour chaque journée, on suit les créneaux d'étape (avec `lieu` et
 * `quartier`, ni arrivée ni départ) ; un retour est compté chaque fois qu'un créneau revient dans un quartier (même
 * `cleDeNom`) que la journée a déjà quitté (A, B, A : 1 retour). Un créneau sans quartier n'interrompt rien.
 *
 * Mesure seulement, jamais un contrôle : aucun créneau n'est retiré ni déplacé, rien n'est journalisé (la liste fermée
 * de `p0.programme_written` est inchangée). Elle ne lit que les textes de l'IA : aucune coordonnée, aucun temps de
 * trajet, aucune donnée Google. Rend le nombre de retours par journée, dans l'ordre des journées.
 */
export function retoursDeQuartier(programme: Pick<ProgrammeIa, "jours">): number[] {
  return programme.jours.map((jour) => {
    const quittes = new Set<string>();
    let courant: string | undefined;
    let retours = 0;
    for (const creneau of jour.creneaux) {
      if (creneau.lieu === undefined || creneau.quartier === undefined || NATURES_TERMINUS.has(creneau.nature)) continue;
      const cle = cleDeNom(creneau.quartier);
      if (cle === "" || cle === courant) continue;
      if (quittes.has(cle)) retours += 1;
      if (courant !== undefined) quittes.add(courant);
      courant = cle;
    }
    return retours;
  });
}
