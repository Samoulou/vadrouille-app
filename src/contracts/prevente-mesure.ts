import { z } from "zod";

/**
 * Mesure de la prévente (spécification `specs/C2-prevente-mesure.md`, § 2.2 point 4, § 3.1, § 3.2 et § 5 ; tâche C2b,
 * ticket 1130) : provenances, parcours, codes des questions 2 à 5, réponse au questionnaire, verdict de l'écriture et
 * lignes du relevé. Schémas **stricts** (§ 7). Tâche C2c (ticket 1137 ; décision 0177 § 4 et § 5) : nettoyage de la
 * question 1, schéma de l'envoi, prédicat « réponse vide », statuts et état rendus au formulaire.
 *
 * **Seule source de ces listes hors de `db/`** (décision 0172 § 1 point 7) : `db/prevente-codes.ts` porte les mêmes
 * valeurs pour le schéma et la migration `0029_prevente_mesure`, sans importer ce fichier ; l'égalité des deux côtés
 * est prouvée par `tests/unit/contracts/prevente-mesure-codes.test.ts`. Aucune troisième copie : un adaptateur ou une
 * page lit ces listes ici. Ajouter un code demande une migration (les `CHECK` et le domaine `public.prevente_code`
 * portent la liste dans la base).
 *
 * Aucune donnée personnelle : ni adresse IP, ni agent utilisateur, ni heure, ni identifiant de session ou de paiement.
 */

/**
 * Provenances de `docs/commercial/suivi.md` (« Provenance »), gardées telles quelles quand `?src=` en porte une
 * (§ 2.2 point 4). Seule constante de la liste côté application : une valeur s'ajoute par une PR (et une migration).
 */
export const PREVENTE_PROVENANCES_SUIVI = ["proches", "forum", "groupe", "reddit", "instagram", "instagram-pub", "createur"] as const;

/** `src` absent, répété ou de forme invalide (ligne « sans `src` » de `suivi.md`). */
export const PREVENTE_PROVENANCE_DIRECT = "direct";
/** `src` de forme valide mais hors liste : la table ne grossit pas au gré d'adresses fabriquées (C2-PO-4). */
export const PREVENTE_PROVENANCE_AUTRE = "autre";
/** Lien de test de Samuel et du studio : **jamais stockée**, ni visite ni réponse (C2-PO-11). */
export const PREVENTE_PROVENANCE_INTERNE = "interne";

/** Provenances stockées : la liste de `suivi.md`, puis `direct` et `autre`. `interne` n'y est jamais. */
export const PREVENTE_PROVENANCES = [...PREVENTE_PROVENANCES_SUIVI, PREVENTE_PROVENANCE_DIRECT, PREVENTE_PROVENANCE_AUTRE] as const;
export const PreventeProvenanceSchema = z.enum(PREVENTE_PROVENANCES);
export type PreventeProvenance = z.infer<typeof PreventeProvenanceSchema>;

/**
 * Provenance déclarée par un lien ou par le champ caché `src` du questionnaire (§ 3.2 point 6) : une provenance
 * stockée, ou `interne` (même parcours, rien n'est écrit).
 */
export const PreventeProvenanceDeclareeSchema = z.enum([...PREVENTE_PROVENANCES, PREVENTE_PROVENANCE_INTERNE]);
export type PreventeProvenanceDeclaree = z.infer<typeof PreventeProvenanceDeclareeSchema>;

/** Parcours d'une réponse : branche de la question 4 (§ 3.2 point 2). Une déclaration, pas une preuve de paiement. */
export const PREVENTE_PARCOURS = ["precommande", "visite"] as const;
export const PreventeParcoursSchema = z.enum(PREVENTE_PARCOURS);
export type PreventeParcours = z.infer<typeof PreventeParcoursSchema>;

/** Question 2, « Quand pars-tu ? » (choix unique). */
export const PREVENTE_PERIODES = ["paques", "ascension", "pentecote", "printemps", "plus-tard", "sans-date"] as const;
export const PreventePeriodeSchema = z.enum(PREVENTE_PERIODES);

/** Question 3, « Comment as-tu préparé ton dernier voyage ? » (plusieurs choix). */
export const PREVENTE_PREPARATIONS = ["guides-blogs", "avis-cartes", "assistant", "application", "agence", "presque-rien", "autre"] as const;
export const PreventePreparationSchema = z.enum(PREVENTE_PREPARATIONS);

/** Question 4, une liste par parcours : « Qu'est-ce qui t'a décidé ? » et « Qu'est-ce qui t'a retenu ? ». */
export const PREVENTE_MOTIFS = {
  precommande: ["adresses-sourcees", "evenements", "remplacer", "prix", "gain-de-temps", "demonstration", "autre"],
  visite: ["prix", "pas-de-voyage", "attendre", "assistant-gratuit", "fiabilite", "destination", "autre"],
} as const satisfies Record<PreventeParcours, readonly string[]>;

/** Question 5, « Comment as-tu découvert le produit ? » (choix unique). */
export const PREVENTE_DECOUVERTES = ["connait-createur", "ami", "forum-groupe", "instagram", "createur-contenu", "autre"] as const;
export const PreventeDecouverteSchema = z.enum(PREVENTE_DECOUVERTES);

/** Question 1 : longueur maximale du texte libre (C2-PO-9). */
export const PREVENTE_DESTINATION_MAX = 80;

/** Liste de codes sans doublon, dans l'ordre reçu. */
const codesDistincts = <T extends string>(codes: readonly [T, ...T[]]) =>
  z.array(z.enum(codes)).max(codes.length).refine((valeurs) => new Set(valeurs).size === valeurs.length, { error: "doublon" });

/**
 * Question 1 : longueur maximale du texte reçu, **avant** nettoyage (borne de travail, décision 0177 § 4 point 3). Au-delà,
 * l'envoi est refusé sans être nettoyé.
 */
export const PREVENTE_DESTINATION_BRUT_MAX = 1000;

/** Blancs de contrôle : tabulations, sauts de ligne et de page, `U+0085`, `U+2028`, `U+2029`. Ils deviennent une espace. */
const BLANCS_DE_CONTROLE = /[\t\n\v\f\r\u0085\u2028\u2029]/g;
/** Autres caractères de contrôle (C0, DEL, C1), de sens d'écriture ou de largeur nulle : retirés. */
const CONTROLES_ET_MISE_EN_FORME = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/**
 * Nettoyage de la question 1 (spécification C2 § 3.3 point 3 ; décision 0177 § 4 point 3), **seule mise en œuvre** :
 * les blancs de contrôle deviennent une espace, les autres caractères de contrôle et de mise en forme sont retirés, les
 * suites de blancs sont réduites à une espace, début et fin sont rognés ; vide : `null` (question sans réponse).
 * Fonction pure. Elle ne borne pas la longueur : `PREVENTE_DESTINATION_BRUT_MAX` se contrôle avant l'appel, et les
 * `PREVENTE_DESTINATION_MAX` caractères se mesurent **après**, par le schéma (`String.length`, unités UTF-16 comme
 * `maxlength` : jamais plus large que le `char_length` de la base).
 */
export function nettoyerDestinationPrevente(brut: string): string | null {
  const nettoye = brut.replace(BLANCS_DE_CONTROLE, " ").replace(CONTROLES_ET_MISE_EN_FORME, "").replace(/\s+/g, " ").trim();
  return nettoye === "" ? null : nettoye;
}

const questionsCommunes = {
  /**
   * Question 1, déjà nettoyée par l'appelant (`nettoyerDestinationPrevente`) ; absente : `null`. La borne est tenue deux
   * fois : `max` de Zod compte les caractères (points de code, comme le `char_length` de la base), le contrôle explicite
   * compte les unités UTF-16 (`String.length`, comme `maxlength` ; décision 0177 § 4 point 3). Le second est le plus
   * strict pour les caractères hors du plan de base : jamais l'inverse.
   */
  destination: z
    .string()
    .min(1)
    .max(PREVENTE_DESTINATION_MAX)
    .refine((texte) => texte.length <= PREVENTE_DESTINATION_MAX, { error: "trop_long" })
    .nullable(),
  periode: PreventePeriodeSchema.nullable(),
  preparation: codesDistincts(PREVENTE_PREPARATIONS),
  decouverte: PreventeDecouverteSchema.nullable(),
};

/**
 * Fabrique des deux schémas d'une réponse (décision 0177 § 4 point 4) : même union discriminée stricte (motifs du
 * parcours, listes sans doublon, clé inconnue refusée), seule la provenance admise change.
 */
const reponseStricte = <S extends z.ZodType<string>>(src: S) =>
  z.discriminatedUnion("parcours", [
    z.strictObject({ src, ...questionsCommunes, parcours: z.literal("precommande"), motifs: codesDistincts(PREVENTE_MOTIFS.precommande) }),
    z.strictObject({ src, ...questionsCommunes, parcours: z.literal("visite"), motifs: codesDistincts(PREVENTE_MOTIFS.visite) }),
  ]);

/** Réponses aux cinq questions, sans provenance ni parcours. */
export type PreventeReponses = {
  readonly destination: string | null;
  readonly periode: string | null;
  readonly preparation: readonly string[];
  readonly motifs: readonly string[];
  readonly decouverte: string | null;
};

/**
 * Réponse entièrement vide (C2-PO-10 ; décision 0177 § 4 point 5), **seule définition** : aucune des cinq questions n'a
 * de réponse. Utilisé par `PreventeReponseSchema` et par l'envoi (statut `reponse_vide`), `src=interne` compris.
 */
export function preventeReponseVide(reponse: PreventeReponses): boolean {
  return reponse.destination === null && reponse.periode === null && reponse.decouverte === null && reponse.preparation.length === 0 && reponse.motifs.length === 0;
}

/**
 * Envoi du questionnaire, après lecture du formulaire et nettoyage de la question 1 (tâche C2c, ticket 1137 ; décision
 * 0177 § 4 point 4) : la même union stricte que la réponse stockée, avec la provenance **déclarée** par le champ caché
 * `src` (`interne` admis : même parcours, rien n'est écrit) et **sans** la règle « réponse vide », que l'envoi distingue
 * par `preventeReponseVide` (statut `reponse_vide`, pas `validation_failed`).
 */
export const PreventeEnvoiSchema = reponseStricte(PreventeProvenanceDeclareeSchema);
export type PreventeEnvoi = z.infer<typeof PreventeEnvoiSchema>;

/**
 * Réponse au questionnaire telle qu'elle est stockée (§ 3.3 point 7) : provenance, parcours et réponses, rien d'autre
 * (l'identifiant et le jour sont posés par la base). La provenance est stockée : jamais `interne` (une réponse `interne`
 * n'atteint pas l'écriture). Les motifs sont ceux du parcours (union discriminée), une clé inconnue est refusée, et une
 * réponse entièrement vide aussi (C2-PO-10). Le nettoyage de la question 1 et la lecture du formulaire reviennent à
 * l'envoi (C2c).
 */
export const PreventeReponseSchema = reponseStricte(PreventeProvenanceSchema).refine((reponse) => !preventeReponseVide(reponse), { error: "reponse_vide" });
export type PreventeReponse = z.infer<typeof PreventeReponseSchema>;

/** Statuts de l'état rendu au formulaire du questionnaire (décision 0177 § 5) : liste propre à ce formulaire. */
export const PREVENTE_STATUTS_ENVOI = ["attente", "validation_failed", "reponse_vide", "rate_limited", "provider_error", "indisponible"] as const;
export type PreventeStatutEnvoi = (typeof PREVENTE_STATUTS_ENVOI)[number];

/**
 * Réponses validées, rendues au formulaire après un refus du limiteur, du plafond ou de l'écriture (§ 3.3 point 6, § 3.4
 * point 4) : la destination nettoyée et les codes, **jamais** `src` ni `parcours` (la page les relit dans son adresse).
 */
export type PreventeSaisie = Pick<PreventeEnvoi, "destination" | "periode" | "preparation" | "decouverte"> & { readonly motifs: string[] };

/** État du formulaire : un statut fermé et, pour `rate_limited` et `provider_error` seulement, la saisie validée. */
export type PreventeEtatEnvoi = { readonly statut: PreventeStatutEnvoi; readonly saisie: PreventeSaisie | null };

/** État initial du formulaire (C2d). */
export const PREVENTE_ETAT_ENVOI_INITIAL: PreventeEtatEnvoi = Object.freeze({ statut: "attente", saisie: null });

/** Verdict de `public.prevente_enregistrer_reponse` : seule valeur rendue par l'écriture d'une réponse (§ 3.4 point 3). */
export const PREVENTE_VERDICTS_REPONSE = ["admise", "plafond_atteint"] as const;
export const PreventeVerdictReponseSchema = z.enum(PREVENTE_VERDICTS_REPONSE);
export type PreventeVerdictReponse = z.infer<typeof PreventeVerdictReponseSchema>;

/** Plafond global des réponses stockées par jour UTC, tenu dans la base (§ 3.4 point 3 ; proposition, seuil réel : S2). */
export const PREVENTE_PLAFOND_REPONSES_JOUR = 200;

/** Rubriques de `public.prevente_releve_reponses()` : une ligne `total`, puis une répartition par rubrique (§ 5 point 3). */
export const PREVENTE_RUBRIQUES = ["total", "src", "parcours", "periode", "preparation", "motifs-precommande", "motifs-visite", "decouverte"] as const;

/** Tous les codes des listes fermées, sans doublon : ce qu'une ligne du relevé peut porter comme `code`. */
const CODES_DU_RELEVE = [
  ...new Set<string>([
    ...PREVENTE_PROVENANCES,
    ...PREVENTE_PARCOURS,
    ...PREVENTE_PERIODES,
    ...PREVENTE_PREPARATIONS,
    ...PREVENTE_MOTIFS.precommande,
    ...PREVENTE_MOTIFS.visite,
    ...PREVENTE_DECOUVERTES,
  ]),
];

const JourSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const NombreSchema = z.number().int().nonnegative();

/**
 * Lignes du relevé (§ 5 ; fonctions d'agrégat de C2a) : des nombres, des jours et des codes de listes fermées, jamais un
 * texte saisi (C2-PO-13). Lu par le workflow de C2e ; l'application ne lit aucun relevé.
 */
export const PreventeReleveVisitesSchema = z.strictObject({ semaine: JourSchema, src: PreventeProvenanceSchema, visites: NombreSchema });
export type PreventeReleveVisites = z.infer<typeof PreventeReleveVisitesSchema>;

export const PreventeReleveReponsesSchema = z.strictObject({
  rubrique: z.enum(PREVENTE_RUBRIQUES),
  /** Nul pour la ligne `total`. */
  code: z.enum(CODES_DU_RELEVE).nullable(),
  reponses: NombreSchema,
});
export type PreventeReleveReponses = z.infer<typeof PreventeReleveReponsesSchema>;

/** Question 1 : deux nombres seulement (§ 5 point 4). */
export const PreventeReleveDestinationsSchema = z.strictObject({ reponsesAvecDestination: NombreSchema, destinationsCiteesDeuxFois: NombreSchema });
export type PreventeReleveDestinations = z.infer<typeof PreventeReleveDestinationsSchema>;
