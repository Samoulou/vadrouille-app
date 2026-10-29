import { z } from "zod";

import { ADDED_STOP_NAME_MAX } from "./patch";
import { texteMaison } from "./texte";
import { ChangeSchema, TimeSchema } from "./trip";
import {
  GOOGLE_PLACE_LABEL_MAX,
  PLACE_ID_MOTIF,
  PLACE_SEARCH_MAX_RESULTS,
  PLACE_SEARCH_QUERY_LENGTH,
  TRIP_ID_PATTERN,
  TRIP_VERSION_KINDS,
} from "./values";

/**
 * Contrats des retouches de M5 (décision 0147, PR de contrat M5-C ; spécification `specs/M5-retouches.md`) : liste des
 * versions et aperçu d'un retour (§ 5.3), recherche d'un lieu à soi et demande d'ajout (§ 3). Objets stricts. Aucun
 * cas d'usage ni action ici : M5a, M5b et M5d-1 les branchent.
 */

const TripIdSchema = z.string().regex(TRIP_ID_PATTERN);
const VersionSchema = z.number().int().positive();
const DayIndexSchema = z.number().int().positive();
const NomMaisonSchema = z.string().min(1);

// --- Versions (0147 § 5.3) ---------------------------------------------------------------------------------------

/** Sortes qui nomment une étape (`subject` obligatoire). */
const SORTES_AVEC_SUJET: ReadonlySet<string> = new Set(["replaced", "added", "moved", "locked", "unlocked"]);

/**
 * Ligne de la liste « Versions du programme » (0147 § 5.3 point 1). Noms tirés **des instantanés** (nom de l'IA ou nom
 * saisi), jamais d'un nom Google ; le libellé est composé par l'écran (spécification § 9), jamais stocké.
 *
 * - `subject` : nom de l'étape concernée, pour `replaced`, `added`, `moved`, `locked` et `unlocked` seulement ;
 * - `previous` : ancien nom, `replaced` seulement ; `day` : jour d'arrivée, `moved` seulement ;
 * - `revertedTo` : numéro et date de la version visée, `reverted` seulement ;
 * - `revertible` : version proposée au retour (écrite après le déblocage et pas la version courante, § 5.3 point 4) ;
 * - `current` : version courante (la première de la liste), jamais `revertible`.
 */
export const TripVersionSummarySchema = z
  .strictObject({
    version: VersionSchema,
    /** Instant ISO ; l'écran l'affiche à l'heure de l'appareil. */
    createdAt: z.iso.datetime({ offset: true }),
    kind: z.enum(TRIP_VERSION_KINDS),
    subject: NomMaisonSchema.optional(),
    previous: NomMaisonSchema.optional(),
    day: DayIndexSchema.optional(),
    revertedTo: z.strictObject({ version: VersionSchema, createdAt: z.iso.datetime({ offset: true }) }).optional(),
    revertible: z.boolean(),
    current: z.boolean(),
  })
  .superRefine((ligne, ctx) => {
    const exige = (champ: "subject" | "previous" | "day" | "revertedTo", requis: boolean) => {
      if ((ligne[champ] !== undefined) !== requis) {
        ctx.addIssue({
          code: "custom",
          message: `${champ} : ${requis ? "obligatoire" : "interdit"} pour la sorte ${ligne.kind}`,
          path: [champ],
        });
      }
    };
    exige("subject", SORTES_AVEC_SUJET.has(ligne.kind));
    exige("previous", ligne.kind === "replaced");
    exige("day", ligne.kind === "moved");
    exige("revertedTo", ligne.kind === "reverted");
    if (ligne.revertedTo !== undefined && ligne.revertedTo.version >= ligne.version) {
      ctx.addIssue({ code: "custom", message: "revertedTo : version antérieure", path: ["revertedTo", "version"] });
    }
    if (ligne.current && ligne.revertible) {
      ctx.addIssue({ code: "custom", message: "la version courante n'est jamais proposée au retour", path: ["revertible"] });
    }
  });
export type TripVersionSummary = z.infer<typeof TripVersionSummarySchema>;

/**
 * Page de la liste des versions (`listTripVersions`, 0147 § 5.3 point 2) : 20 au plus, de la plus récente à la plus
 * ancienne ; `nextBefore` (exclusif) pour la page suivante, `null` en fin de liste.
 */
export const TripVersionPageSchema = z.strictObject({
  items: z.array(TripVersionSummarySchema),
  nextBefore: VersionSchema.nullable(),
});
export type TripVersionPage = z.infer<typeof TripVersionPageSchema>;

/**
 * Aperçu d'un retour à une version (0147 § 5.3 point 5) : changements entre la version courante (`baseVersion`) et la
 * version visée (`toVersion`), calculés côté serveur par `appliquerPatch` sur `[revert]` à blanc, plus les lignes
 * `checklist` de la liste « À faire » (§ 7). Un retour ne produit **jamais** `replaced` (M5-PO-2, critère 8), ni de
 * ligne `segment` (aucune relecture, § 5.2 point 5). `currentHasLockedStop` fait afficher « Ce retour peut toucher des
 * étapes verrouillées. ».
 */
export const RevertPreviewSchema = z
  .strictObject({
    baseVersion: VersionSchema,
    toVersion: VersionSchema,
    changes: z.array(ChangeSchema),
    currentHasLockedStop: z.boolean(),
  })
  .superRefine((apercu, ctx) => {
    if (apercu.toVersion >= apercu.baseVersion) {
      ctx.addIssue({ code: "custom", message: "toVersion : version antérieure à baseVersion", path: ["toVersion"] });
    }
    apercu.changes.forEach((change, index) => {
      if (change.type === "replaced" || change.type === "segment") {
        ctx.addIssue({ code: "custom", message: `un retour ne produit jamais ${change.type}`, path: ["changes", index, "type"] });
      }
    });
  });
export type RevertPreview = z.infer<typeof RevertPreviewSchema>;

// --- Lieu à soi (0147 § 3) ---------------------------------------------------------------------------------------

/**
 * Nom ou adresse d'un résultat de recherche : **contenu Google affiché**, jamais stocké, journalisé, mis dans
 * l'adresse, dans un stockage du navigateur ni dans un prompt (0147 § 3 point 3, § 12 S2 et S3). Jamais validé par un
 * schéma de `Stop`.
 */
export const GooglePlaceLabelSchema = z.string().min(1).max(GOOGLE_PLACE_LABEL_MAX);
export type GooglePlaceLabel = z.infer<typeof GooglePlaceLabelSchema>;

/** Identifiant opaque d'un résultat : le `placeId` lui-même (0147 § 3 point 4), forme `PLACE_ID_MOTIF`. */
const ResultIdSchema = z.string().regex(PLACE_ID_MOTIF);

/**
 * Recherche d'un lieu à soi (`searchPlaces`, M5d-1) : voyage, journée (la ville de son séjour oriente la requête,
 * § 3 point 2) et texte saisi, 2 à 80 caractères après retrait des espaces aux extrémités.
 */
export const PlaceSearchRequestSchema = z.strictObject({
  tripId: TripIdSchema,
  day: DayIndexSchema,
  query: z.string().trim().min(PLACE_SEARCH_QUERY_LENGTH.min).max(PLACE_SEARCH_QUERY_LENGTH.max),
});
export type PlaceSearchRequest = z.infer<typeof PlaceSearchRequestSchema>;

/** Résultat d'une recherche : `resultId` (le `placeId`), nom et adresse Google affichés (adresse facultative). */
export const PlaceSearchResultSchema = z.strictObject({
  resultId: ResultIdSchema,
  name: GooglePlaceLabelSchema,
  address: GooglePlaceLabelSchema.optional(),
});
export type PlaceSearchResult = z.infer<typeof PlaceSearchResultSchema>;

/** Résultats d'une recherche : 5 au plus, identifiants distincts. */
export const PlaceSearchResultsSchema = z
  .array(PlaceSearchResultSchema)
  .max(PLACE_SEARCH_MAX_RESULTS)
  .refine((resultats) => new Set(resultats.map((resultat) => resultat.resultId)).size === resultats.length, {
    message: "resultId : identifiants distincts",
  });

/**
 * Demande d'aperçu d'un ajout (0147 § 3 point 5) : **aucun champ** pour un nom Google, une adresse ou la requête
 * saisie (objet strict, critère 21). `name` est le nom saisi par la personne (`texteMaison`, § 12 S4) ; le serveur
 * construit le patch `[add, lock]` (§ 11) avec l'identifiant d'étape `ajout-<requestId>`.
 */
export const AddPlaceRequestSchema = z.strictObject({
  tripId: TripIdSchema,
  baseVersion: VersionSchema,
  day: DayIndexSchema,
  time: TimeSchema,
  kind: z.enum(["activity", "meal"]),
  name: texteMaison(ADDED_STOP_NAME_MAX),
  resultId: ResultIdSchema,
});
export type AddPlaceRequest = z.infer<typeof AddPlaceRequestSchema>;

/** Application d'un ajout : la demande d'aperçu et son `requestId` (idempotence). */
export const AddPlaceApplySchema = AddPlaceRequestSchema.extend({ requestId: z.uuid() });
export type AddPlaceApply = z.infer<typeof AddPlaceApplySchema>;
