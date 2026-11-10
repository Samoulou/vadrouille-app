import { z } from "zod";

/**
 * Mesure de la prévente (spécification `specs/C2-prevente-mesure.md`, § 2.2 point 4, § 3.1, § 3.2 et § 5 ; tâche C2b,
 * ticket 1130) : provenances, parcours, codes des questions 2 à 5, réponse au questionnaire, verdict de l'écriture et
 * lignes du relevé. Schémas **stricts** (§ 7).
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

const questionsCommunes = {
  /** Provenance stockée : jamais `interne` (une réponse `interne` n'atteint pas l'écriture). */
  src: PreventeProvenanceSchema,
  /** Question 1, déjà nettoyée par l'appelant (C2c, § 3.3 point 3) ; absente : `null`. */
  destination: z.string().min(1).max(PREVENTE_DESTINATION_MAX).nullable(),
  periode: PreventePeriodeSchema.nullable(),
  preparation: codesDistincts(PREVENTE_PREPARATIONS),
  decouverte: PreventeDecouverteSchema.nullable(),
};

/**
 * Réponse au questionnaire telle qu'elle est stockée (§ 3.3 point 7) : provenance, parcours et réponses, rien d'autre
 * (l'identifiant et le jour sont posés par la base). Les motifs sont ceux du parcours (union discriminée), une clé
 * inconnue est refusée, et une réponse entièrement vide aussi (C2-PO-10). Le nettoyage de la question 1 et la lecture
 * du formulaire reviennent à C2c.
 */
export const PreventeReponseSchema = z
  .discriminatedUnion("parcours", [
    z.strictObject({ ...questionsCommunes, parcours: z.literal("precommande"), motifs: codesDistincts(PREVENTE_MOTIFS.precommande) }),
    z.strictObject({ ...questionsCommunes, parcours: z.literal("visite"), motifs: codesDistincts(PREVENTE_MOTIFS.visite) }),
  ])
  .refine(
    (reponse) =>
      reponse.destination !== null || reponse.periode !== null || reponse.decouverte !== null || reponse.preparation.length > 0 || reponse.motifs.length > 0,
    { error: "reponse_vide" },
  );
export type PreventeReponse = z.infer<typeof PreventeReponseSchema>;

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
