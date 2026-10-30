import "server-only";

import { z } from "zod";

import {
  ADULTS,
  CategorySchema,
  CHILDREN,
  CITY_NAME_LENGTH,
  CommitmentSchema,
  DESTINATION_LENGTH,
  IsoDateSchema,
  MAX_CITIES,
  MAX_COMMITMENTS,
  MEAL_BUDGET_CHF,
  MobilityModeSchema,
  PaceSchema,
  STOP_KINDS,
  TimeSchema,
  type LodgingRequest,
} from "@/contracts";
import { CANDIDAT_ID_PATTERN, LONGUEURS_TEXTE, texteMaison } from "@/ai/candidat";

/**
 * Types maison de production de la couche IA (décision 0077 § 1 point 2, B7-TL-1 ; B7-PO-1), construits sur
 * `src/contracts` : ce que les modèles reçoivent du voyage. **Aucun champ** pour une donnée Google (`placeId`, nom,
 * adresse, coordonnée, horaire, statut, note, prix, durée, verdict, code de validation : constructeur typé du handover
 * § 10), ni pour le récit, un logement, un engagement ou un email (B7-PO-1) : le récit et le logement de P0 vivent dans
 * `ComplementP0` (`complement-p0.ts`), jamais ici. Schémas stricts : une clé en trop est refusée avant toute requête.
 *
 * Le vocabulaire est celui des contrats (`Pace`, `Category`, `MobilityMode`) ; le constructeur de requêtes
 * (`requetes.ts`) le rend dans la vue des modèles, la même que celle de P0 (octets de P0 inchangés).
 */

const sansDoublon = <T>(valeurs: readonly T[]) => new Set(valeurs).size === valeurs.length;

/** Texte de lieu de P0 (`pays`, hors contrat) : une ligne, Unicode imprimable, sans balise ni URL (règle des sorties). */
const lieu = (max: number) => texteMaison(max);

/**
 * Valeur de lieu saisie passée au modèle (décision 0096 § 4.2 point 1) : la valeur **rognée**, puis normalisée. Fonction
 * pure unique, qui ne peut qu'enlever ou remplacer par une espace (la borne maximale du contrat ne peut donc pas être
 * dépassée) :
 * - caractères de contrôle C0 et C1 (`\p{Cc}`, tabulation et retours à la ligne compris) et séparateurs de ligne et de
 *   paragraphe U+2028 et U+2029 : remplacés par une espace ;
 * - tout caractère de format `\p{Cf}` **retiré**, sauf U+200C et U+200D (indispensables en persan et dans les écritures
 *   indiennes) : même classe que `nettoyerRequeteWeb` (contrôles de direction, U+200B, U+2060 à U+2064, U+00AD, U+180E,
 *   U+206A à U+206F, U+FEFF, U+FFF9 à U+FFFB, balises U+E0000 à U+E007F) ;
 * - sélecteurs de variation U+FE00 à U+FE0F et U+E0100 à U+E01EF **retirés** (invisibles, sans valeur dans un nom de
 *   lieu saisi, et ils servent à cacher du texte à la relecture) ;
 * - puis rognée de nouveau.
 * La saisie est protégée par sa mise en forme (cette fonction, puis `encadrer`), pas par un refus : `<`, `>`, les formes
 * d'URL et les noms de domaine restent admis ici, comme dans le contrat (« St. Gallen », « booking.com »).
 */
export function normaliserLieu(valeur: string): string {
  return valeur
    .trim()
    .replace(/[\p{Cc}\u2028\u2029]/gu, " ")
    .replace(/(?![\u200C\u200D])\p{Cf}/gu, "")
    .replace(/[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu, "")
    .trim();
}

/**
 * Lieu saisi (`destination`, `ville`) : **le verdict du contrat** (`z.string().trim()` borné, aucune seconde copie des
 * bornes), puis la valeur normalisée (`normaliserLieu`). Exception déclarée à « verdict identique à celui du contrat » :
 * une valeur que le contrat accepte mais dont il ne reste rien d'utilisable après normalisation (moins que la borne
 * minimale : `"\u200B\u200B"`, `"a\u202E"`, des contrôles) est refusée `invalid_input`.
 */
const lieuSaisi = (bornes: { readonly min: number; readonly max: number }) =>
  z
    .string()
    .trim()
    .min(bornes.min)
    .max(bornes.max)
    .transform(normaliserLieu)
    .pipe(z.string().min(bornes.min).max(bornes.max));

/**
 * Entrée des étapes `plan`, `recherche`, `notation` et `raisons` (B7-PO-1) : destination et dates **d'une** ville,
 * voyageurs, rythme, envies, limites, déplacements, budget des repas. `pays` et `budgetRepas` (niveau de 1 à 3) sont
 * ceux de P0 (brief du prototype) ; `budgetRepasChf` est celui du contrat (`mealBudgetPerPerson`) ; au plus un des deux.
 */
export const EntreeModelesSchema = z
  .strictObject({
    destination: lieuSaisi(DESTINATION_LENGTH),
    pays: lieu(60).optional(),
    arrivee: IsoDateSchema,
    depart: IsoDateSchema,
    voyageurs: z.strictObject({
      adultes: z.number().int().min(ADULTS.min).max(ADULTS.max),
      enfants: z.number().int().min(CHILDREN.min).max(CHILDREN.max),
    }),
    rythme: PaceSchema,
    envies: z.array(CategorySchema).min(1).refine(sansDoublon, "envies sans doublon"),
    limites: z.array(CategorySchema).refine(sansDoublon, "limites sans doublon").optional(),
    deplacements: z.array(MobilityModeSchema).min(1).refine(sansDoublon, "déplacements sans doublon"),
    budgetRepas: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    budgetRepasChf: z.number().int().min(MEAL_BUDGET_CHF.min).max(MEAL_BUDGET_CHF.max).optional(),
  })
  .superRefine((entree, ctx) => {
    if (entree.depart < entree.arrivee) ctx.addIssue({ code: "custom", path: ["depart"], message: "départ avant l'arrivée" });
    if (entree.budgetRepas !== undefined && entree.budgetRepasChf !== undefined) {
      ctx.addIssue({ code: "custom", path: ["budgetRepasChf"], message: "un seul budget des repas" });
    }
    const envies = new Set<string>(entree.envies);
    if ((entree.limites ?? []).some((limite) => envies.has(limite))) {
      ctx.addIssue({ code: "custom", path: ["limites"], message: "élément commun avec les envies" });
    }
  });
export type EntreeModeles = z.infer<typeof EntreeModelesSchema>;

/**
 * Ce qu'un modèle voit d'un candidat (notation, raisons) : identifiant interne, nom maison, résumé maison, catégorie,
 * type d'étape. **Exactement** la projection de `vuePourModele` de P0 (0077 § 1 point 5 : égalité de types dans
 * `tests/unit/p0/copies.test.ts`) ; aucun autre champ (0027, `CLAUDE.md`).
 */
export const CandidatPourModeleSchema = z.strictObject({
  id: z.string().regex(CANDIDAT_ID_PATTERN),
  nom: texteMaison(LONGUEURS_TEXTE.nom),
  resume: texteMaison(LONGUEURS_TEXTE.resume),
  categorie: CategorySchema,
  typeEtape: z.enum(STOP_KINDS),
});
export type CandidatPourModele = z.infer<typeof CandidatPourModeleSchema>;

/** Nom d'hôte d'une source (`exemple.org`) : lettres, chiffres, tirets et points seulement. */
const DOMAINE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Lieu retenu passé à l'étape `raisons` : le candidat vu par le modèle et le domaine de sa source (P0, étape 9) ; depuis
 * la version 2 du prompt (P0S2-PO-21), et quand l'appelant les connaît, le **secteur maison** du plan (60 caractères au
 * plus, limite de `StopFacts.area`) et `incontournable` (le lieu est un incontournable du plan). Jamais un prix, un
 * horaire, un conseil ni une donnée Google.
 */
export const LieuRetenuSchema = z.strictObject({
  ...CandidatPourModeleSchema.shape,
  sourceDomaine: z.string().min(1).max(253).regex(DOMAINE_PATTERN),
  secteur: texteMaison(LONGUEURS_TEXTE.secteur).optional(),
  incontournable: z.literal(true).optional(),
});
export type LieuRetenu = z.infer<typeof LieuRetenuSchema>;

/**
 * Entrée de l'étape `quartier` (B7-PO-1, B7-PO-3) : la ville et les dates de son séjour, **réduites à ce que porte le
 * contrat** `LodgingRequest` (ni voyageurs, ni rythme, ni envies : question 12 de la spécification B7).
 */
export const EntreeQuartierSchema = z
  .strictObject({ ville: lieuSaisi(CITY_NAME_LENGTH), debut: IsoDateSchema, fin: IsoDateSchema })
  .superRefine((entree, ctx) => {
    if (entree.fin < entree.debut) ctx.addIssue({ code: "custom", path: ["fin"], message: "fin avant le début" });
  });
export type EntreeQuartier = z.infer<typeof EntreeQuartierSchema>;

/**
 * `EntreeQuartier` d'une demande `suggestLodging` (B7-PO-3) : `ville` = destination (`city` = 0) ou
 * `otherCities[city − 1].name` ; `debut` = début du voyage ou arrivée de cette ville ; `fin` = arrivée de la ville
 * suivante, ou fin du voyage. **Ne lit jamais** `lodging` ni `commitments` du brouillon (critère `prompts: l'entrée du
 * quartier ne vient que du contrat`). Une ville absente du brouillon est une erreur de l'appelant (`RangeError`) : la
 * demande est validée par `LodgingRequestSchema` avant l'appel.
 */
export function versEntreeQuartier(demande: LodgingRequest): EntreeQuartier {
  const { draft, city } = demande;
  const autres = draft.otherCities;
  const suivante = autres.at(city)?.arrival ?? draft.end;
  if (city === 0) return { ville: draft.destination, debut: draft.start, fin: suivante };
  const ville = city > 0 ? autres.at(city - 1) : undefined;
  if (ville === undefined) throw new RangeError("versEntreeQuartier : ville absente du brouillon");
  return { ville: ville.name, debut: ville.arrival, fin: suivante };
}

/**
 * Entrée de l'étape `programme` du prototype (décision 0115 § 2 et § 3 étape 1 ; spécification P0-programme-par-ia § 0
 * point 1) : **toutes les saisies du questionnaire** du brief de P0 (décision de Samuel du 2026-10-21) : destination et
 * pays, dates et heures d'arrivée et de départ, voyageurs, rythme (libellé de P0), envies, catégories « à éviter »
 * (lot 5 de E2E-essai), déplacements, budget des repas, logements (texte saisi et nuits), billets à heure fixe et
 * récit. Type distinct d'`EntreeModeles` (qui reste sans récit ni logement pour le MVP, B7-PO-1) ; construit par
 * `src/server/p0/vers-couche-ia.ts` seul. **Aucun champ** pour une donnée Google (identifiant, nom, adresse, position,
 * horaire, statut, durée, verdict) : schéma strict, une clé en trop est refusée avant toute requête.
 */
const texteBrief = (max: number) => z.string().trim().min(1).max(max);
export const EntreeProgrammeSchema = z
  .strictObject({
    destination: texteBrief(80),
    pays: texteBrief(60),
    arrivee: IsoDateSchema,
    depart: IsoDateSchema,
    heureArrivee: TimeSchema,
    heureDepart: TimeSchema,
    voyageurs: z.strictObject({ adultes: z.number().int().min(1).max(9), enfants: z.number().int().min(0).max(9) }),
    rythme: z.enum(["tranquille", "equilibre", "intense"]),
    envies: z.array(CategorySchema).min(1).refine(sansDoublon, "envies sans doublon"),
    /** Catégories « à éviter » saisies (lot 5 de E2E-essai), absentes quand rien n'est coché. */
    aEviter: z.array(CategorySchema).min(1).refine(sansDoublon, "à éviter sans doublon").optional(),
    deplacements: z.array(MobilityModeSchema).min(1).refine(sansDoublon, "déplacements sans doublon"),
    budgetRepas: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    logements: z.array(z.strictObject({ texte: texteBrief(120), nuits: z.number().int().min(1).max(60) })).min(1).max(5),
    engagements: z
      .array(z.strictObject({ libelle: texteBrief(80), date: IsoDateSchema, heure: TimeSchema, type: CommitmentSchema }))
      .max(10)
      .optional(),
    recit: texteBrief(1000).optional(),
  })
  .superRefine((entree, ctx) => {
    if (entree.depart < entree.arrivee) ctx.addIssue({ code: "custom", path: ["depart"], message: "départ avant l'arrivée" });
    const envies = new Set<string>(entree.envies);
    if ((entree.aEviter ?? []).some((categorie) => envies.has(categorie))) {
      ctx.addIssue({ code: "custom", path: ["aEviter"], message: "à éviter commun avec les envies" });
    }
  });
export type EntreeProgramme = z.infer<typeof EntreeProgrammeSchema>;

/**
 * Entrée du prompt `programme` **v5**, plusieurs villes (spécification M4 § 5 point 1 ; décision 0148 § 5.1 point 2,
 * § 8 point 3 ; verdict de la Sécurité 0149 S-M4-1, S-M4-2 et S-M4-5). Construite par une fonction de
 * `src/server/programme/entree.ts` à partir du `BriefProgramme` (M4b) ; M4a en fixe la forme ici. Elle reprend les
 * saisies du brief de l'entrée v4, sauf `logements`, remplacé par :
 * - `villes` : la liste **ordonnée** des villes (1 à `MAX_CITIES`), chacune avec son **nom maison** (table des villes,
 *   contrôlé par `controlerVilles`, jamais la saisie brute), sa date d'arrivée, ses nuits et le texte de son logement
 *   (120 caractères au plus, comme en v4). La ville de chaque jour est celle dont la plage contient la date : c'est le
 *   **code** qui la pose (0148 § 7.1 point 3), jamais l'IA ;
 * - `changements` : le **cadre** de chaque journée de changement de ville, calculé par le domaine avant le prompt
 *   (0148 § 5.1 point 1) : date, ville quittée et ville d'arrivée, source (`saisi` : billet ou vol de ce jour ;
 *   `estime` : départ estimé), heure de départ, heure d'arrivée (seulement saisie), nombre maximal d'activités. **Aucun
 *   libellé** : le libellé du billet ou du vol devenu changement de ville n'est jamais envoyé au modèle (0149 § 1.2) ;
 * - `engagements[].fin` : heure de fin saisie, facultative, au format `TimeSchema`, postérieure au début (0149 § 5) ;
 *   l'engagement devenu changement de ville n'est pas dans `engagements` (ses heures passent par `changements`).
 *
 * **Aucun champ** pour une donnée Google (identifiant, nom, adresse, position, horaire, statut, durée de trajet), ni
 * pour une ville par créneau, ni pour un libellé de billet de changement de ville : schéma **strict** à chaque niveau,
 * une clé en trop est refusée avant toute requête. Seule voie vers le modèle : la projection champ par champ de
 * `requeteProgrammeV5` (`src/ai/requetes.ts`), jamais une décomposition d'un objet du brief.
 */
export const VillesProgrammeSchema = z
  .array(
    z.strictObject({
      nom: texteBrief(CITY_NAME_LENGTH.max),
      arrivee: IsoDateSchema,
      nuits: z.number().int().min(1).max(60),
      logement: texteBrief(120),
    }),
  )
  .min(1)
  .max(MAX_CITIES);

/** Nombre maximal d'activités d'une journée de changement de ville (`changementDeVille.activitesParRythme`, 0148 § 5.4). */
export const ACTIVITES_CHANGEMENT_MAX = 4;

export const ChangementDeVilleEntreeSchema = z
  .strictObject({
    date: IsoDateSchema,
    de: texteBrief(CITY_NAME_LENGTH.max),
    vers: texteBrief(CITY_NAME_LENGTH.max),
    source: z.enum(["saisi", "estime"]),
    depart: TimeSchema,
    /** Heure d'arrivée : seulement l'heure de fin saisie du billet ou du vol ; absente = « à confirmer ». */
    arrivee: TimeSchema.optional(),
    activitesMax: z.number().int().min(0).max(ACTIVITES_CHANGEMENT_MAX),
  })
  .superRefine((changement, ctx) => {
    if (changement.source === "estime" && changement.arrivee !== undefined) {
      ctx.addIssue({ code: "custom", path: ["arrivee"], message: "aucune arrivée pour un départ estimé" });
    }
    if (changement.arrivee !== undefined && changement.arrivee <= changement.depart) {
      ctx.addIssue({ code: "custom", path: ["arrivee"], message: "arrivée avant le départ" });
    }
  });
export type ChangementDeVilleEntree = z.infer<typeof ChangementDeVilleEntreeSchema>;

const ajouterJours = (date: string, jours: number) => {
  const jour = new Date(`${date}T00:00:00Z`);
  jour.setUTCDate(jour.getUTCDate() + jours);
  return jour.toISOString().slice(0, 10);
};

export const EntreeProgrammeV5Schema = z
  .strictObject({
    destination: texteBrief(80),
    pays: texteBrief(60),
    arrivee: IsoDateSchema,
    depart: IsoDateSchema,
    heureArrivee: TimeSchema,
    heureDepart: TimeSchema,
    voyageurs: z.strictObject({ adultes: z.number().int().min(1).max(9), enfants: z.number().int().min(0).max(9) }),
    rythme: z.enum(["tranquille", "equilibre", "intense"]),
    envies: z.array(CategorySchema).min(1).refine(sansDoublon, "envies sans doublon"),
    aEviter: z.array(CategorySchema).min(1).refine(sansDoublon, "à éviter sans doublon").optional(),
    deplacements: z.array(MobilityModeSchema).min(1).refine(sansDoublon, "déplacements sans doublon"),
    budgetRepas: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    villes: VillesProgrammeSchema,
    changements: z.array(ChangementDeVilleEntreeSchema).max(MAX_CITIES - 1),
    engagements: z
      .array(
        z
          .strictObject({ libelle: texteBrief(80), date: IsoDateSchema, heure: TimeSchema, fin: TimeSchema.optional(), type: CommitmentSchema })
          .refine((engagement) => engagement.fin === undefined || engagement.fin > engagement.heure, { path: ["fin"], message: "fin avant le début" }),
      )
      .max(MAX_COMMITMENTS)
      .optional(),
    recit: texteBrief(1000).optional(),
  })
  .superRefine((entree, ctx) => {
    if (entree.depart < entree.arrivee) ctx.addIssue({ code: "custom", path: ["depart"], message: "départ avant l'arrivée" });
    const envies = new Set<string>(entree.envies);
    if ((entree.aEviter ?? []).some((categorie) => envies.has(categorie))) {
      ctx.addIssue({ code: "custom", path: ["aEviter"], message: "à éviter commun avec les envies" });
    }
    // Villes : la première arrive le premier jour ; chacune arrive le lendemain de la dernière nuit de la précédente ;
    // la dernière nuit de la dernière ville est la veille du départ (une ville a au moins une nuit, spécification § 3.1).
    entree.villes.forEach((ville, rang) => {
      const attendue = rang === 0 ? entree.arrivee : ajouterJours(entree.villes[rang - 1]!.arrivee, entree.villes[rang - 1]!.nuits);
      if (ville.arrivee !== attendue) ctx.addIssue({ code: "custom", path: ["villes", rang, "arrivee"], message: "arrivée hors de la suite des nuits" });
      if (rang > 0 && ville.nom === entree.villes[rang - 1]!.nom) ctx.addIssue({ code: "custom", path: ["villes", rang, "nom"], message: "même ville deux fois de suite" });
    });
    const derniere = entree.villes.at(-1);
    if (derniere !== undefined && ajouterJours(derniere.arrivee, derniere.nuits) !== entree.depart) {
      ctx.addIssue({ code: "custom", path: ["villes"], message: "nuits différentes du séjour" });
    }
    // Un changement par ville ajoutée, à sa date d'arrivée, de la ville précédente vers elle (spécification § 3.1).
    if (entree.changements.length !== entree.villes.length - 1) {
      ctx.addIssue({ code: "custom", path: ["changements"], message: "un changement par ville ajoutée" });
      return;
    }
    entree.changements.forEach((changement, rang) => {
      const de = entree.villes[rang]!;
      const vers = entree.villes[rang + 1]!;
      if (changement.date !== vers.arrivee || changement.de !== de.nom || changement.vers !== vers.nom) {
        ctx.addIssue({ code: "custom", path: ["changements", rang], message: "changement hors de la suite des villes" });
      }
    });
  });
export type EntreeProgrammeV5 = z.infer<typeof EntreeProgrammeV5Schema>;
