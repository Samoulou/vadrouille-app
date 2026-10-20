import "server-only";

import { z } from "zod";

import modelesP0 from "../../../prototype/config/modeles.json";
import rechercheP0 from "../../../prototype/config/recherche.json";

import production from "./ia.json";

/**
 * Configuration de production de la couche IA et de la recherche (décision 0096 § 3, B7-TL-8), sur le modèle de
 * `moteur.ts` : **une seule source par valeur, à tout moment**. Lue côté serveur seulement, par la composition de
 * génération (B9c, `src/server/composition/`), qui passe les valeurs à `creerCoucheIa` et à `creerRecherche` ; `src/ai` et
 * `src/research` ne l'importent jamais, et B7b n'ajoute aucun importateur (aucun point d'entrée).
 *
 * - `ia.json` : les **seules** valeurs propres à la production (variante, `zdr` par étape, profils `apercu`, `complet` et
 *   `mini`). Schéma strict : une clé de plus (en particulier une valeur dérivée de P0, tableau ci-dessous) est refusée.
 * - **Valeurs dérivées des fichiers de P0, tant que P0 tourne** (lus comme des données JSON, jamais un module de
 *   `src/prototype`, 0048 § 1) : modèles par étape, routage, moteur de recherche web (`modeles.json`) ; profil `complet`,
 *   `ageSourceMaxJours` et taille d'un lot de notation (`recherche.json`). Les fichiers du profil d'essai de P0
 *   (`recherche-essai.json`, `essai.json`, `mode-reel.json`, `plafonds.json`) ne sont pas lus. Un changement d'un fichier
 *   de P0 qui change la production fait échouer l'instantané `configuration ia: valeurs de départ` : la PR qui le fait
 *   choisit entre suivre P0 et passer la valeur dans `ia.json` (décision 0096 § 3 points 2 et 8).
 * - **Ce module n'importe que `zod` et ses fichiers JSON** : ni `@/ai`, ni `@/research`, pas même en type (0081 B9-TL-1
 *   point 2 : les arêtes `import type` comptent). Son schéma ne contrôle donc que la **forme** (clés exactes, entiers
 *   positifs ou nuls, chaînes de 1 à 100 caractères, `routage.data_collection` égal à `"deny"`, variante parmi `a` et
 *   `b`). Les règles de fond (`BornesRechercheSchema`, `ProfilMiniSchema`, `MODELE_ID_PATTERN`, `MOTEURS_RECHERCHE_WEB`)
 *   sont appliquées à `CONFIGURATION_IA` par la composition de B9c, au chargement du module (échec au démarrage), et par
 *   `validerConfigurationIa` (`tests/support/configuration-ia.ts`) dans les tests ; aucune n'est recopiée ici.
 * - Aucun plafond, aucun montant, aucune estimation de coût par requête : les plafonds restent dans `usage.ts` (0083).
 */

// --- Formes (clés exactes) ---------------------------------------------------------------------------------------------

const entier = z.number().int().min(0);
const texte = z.string().min(1).max(100);

/**
 * Étapes qui admettent un réglage `zdr` : copie en dur de `ETAPES_REQUETE` (`src/ai/client.ts`) que ce module n'importe
 * pas ; le test `configuration ia: valeur absente, inconnue ou hors bornes refusée` vérifie l'égalité des deux listes.
 */
export const ETAPES_ZDR = ["plan", "recherche", "notation", "raisons", "structuration", "quartier"] as const;
/** Étapes de la couche IA (`ReglagesIa`), copie en dur contrôlée de la même façon. */
export const ETAPES_REGLAGES = ["structuration", "quartier", "plan", "notation", "raisons"] as const;

const CiblesSchema = z.strictObject({
  activity: entier,
  meal: entier,
  evening: entier,
});

const ProductionSchema = z.strictObject({
  schema: z.literal(1),
  variante: z.enum(["a", "b"]),
  // Clés dérivées de `ETAPES_ZDR` (une seule liste) ; une clé inconnue est refusée (objet strict).
  zdr: z.strictObject(Object.fromEntries(ETAPES_ZDR.map((etape) => [etape, z.boolean().optional()])) as Record<(typeof ETAPES_ZDR)[number], z.ZodOptional<z.ZodBoolean>>),
  profils: z.strictObject({
    apercu: z.strictObject({
      ciblesParCreneau: CiblesSchema,
      totalCandidats: entier,
      toursMax: entier,
      delaiMs: entier,
    }),
    complet: z.strictObject({ delaiMs: entier }),
    mini: z.strictObject({
      cible: entier,
      totalCandidats: entier,
      toursMax: entier,
      delaiMs: entier,
      logements: z.strictObject({ cible: entier, recherchesWeb: entier }),
    }),
  }),
});

/** Forme de `prototype/config/modeles.json` (lue comme des données ; le schéma de P0 reste dans `src/prototype/config.ts`). */
const ModelesP0Schema = z.strictObject({
  schema: z.literal(1),
  etapes: z.strictObject({ recherche: texte, notation: texte, raisons: texte }),
  variantes: z.strictObject({ a: z.strictObject({ notation: texte }) }),
  routage: z.strictObject({ data_collection: z.literal("deny") }),
  rechercheWeb: z.strictObject({ moteur: texte }),
});

/** Forme de `prototype/config/recherche.json`. */
const RechercheP0Schema = z.strictObject({
  schema: z.literal(1),
  ciblesParCreneau: CiblesSchema,
  totalCandidats: entier,
  tailleLotNotation: entier,
  toursMax: entier,
  ageSourceMaxJours: entier,
});

// --- Chargement ---------------------------------------------------------------------------------------------------------

type Routage = { data_collection: "deny"; zdr?: boolean };
type ReglageEtape = { readonly modele: string; readonly routage: Routage };

/** Bornes d'une recherche complète (forme de `BornesRecherche`, `src/research/bornes.ts`). */
export type BornesProfil = {
  readonly ciblesParCreneau: {
    readonly activity: number;
    readonly meal: number;
    readonly evening: number;
  };
  readonly totalCandidats: number;
  readonly toursMax: number;
  readonly ageSourceMaxJours: number;
  readonly delaiMs: number;
};

/** Profil `mini` (forme de `ProfilMini`, `src/research/bornes.ts`), sans `ageSourceMaxJours` (celui de `apercu`). */
export type ProfilMiniConfiguration = {
  readonly cible: number;
  readonly totalCandidats: number;
  readonly toursMax: number;
  readonly delaiMs: number;
  readonly logements: {
    readonly cible: number;
    readonly recherchesWeb: number;
  };
};

export type ConfigurationIa = {
  readonly variante: "a" | "b";
  /** Forme de `ReglagesIa` (`src/ai/couche.ts`) : modèle et routage de chaque étape de la couche IA. */
  readonly reglages: {
    readonly structuration: ReglageEtape;
    readonly quartier: ReglageEtape;
    readonly plan: ReglageEtape;
    readonly notation: ReglageEtape;
    readonly raisons: ReglageEtape;
  };
  /** Étape `recherche` de l'agent (appel de modèle hors de la couche IA, `creerRecherche`). */
  readonly recherche: ReglageEtape;
  /** Forme de `ReglageRechercheWeb` sans `maxResultats` (posé par la composition à `MAX_RESULTATS_WEB`). */
  readonly rechercheWeb: ReglageEtape & { readonly moteur: string };
  readonly profils: {
    readonly apercu: BornesProfil;
    readonly complet: BornesProfil;
    readonly mini: ProfilMiniConfiguration;
  };
  /** Taille d'un lot de notation (lue par B9). */
  readonly tailleLotNotation: number;
};

/**
 * Charge et valide la configuration (forme seulement). Pure : les trois sources sont des paramètres, pour les tests. Une
 * valeur absente, inconnue ou de mauvaise forme lève une `ZodError`.
 */
export function chargerConfigurationIa(brute: unknown, modelesBruts: unknown, rechercheBrute: unknown): ConfigurationIa {
  const ia = ProductionSchema.parse(brute);
  const modeles = ModelesP0Schema.parse(modelesBruts);
  const recherche = RechercheP0Schema.parse(rechercheBrute);

  const reglage = (modele: string, zdr: boolean | undefined): ReglageEtape => ({
    modele,
    routage: {
      data_collection: modeles.routage.data_collection,
      ...(zdr === undefined ? {} : { zdr }),
    },
  });
  const modeleNotation = ia.variante === "a" ? modeles.variantes.a.notation : modeles.etapes.notation;
  const bornes = (
    delaiMs: number,
    base: {
      ciblesParCreneau: BornesProfil["ciblesParCreneau"];
      totalCandidats: number;
      toursMax: number;
    },
  ): BornesProfil => ({
    ciblesParCreneau: { ...base.ciblesParCreneau },
    totalCandidats: base.totalCandidats,
    toursMax: base.toursMax,
    ageSourceMaxJours: recherche.ageSourceMaxJours,
    delaiMs,
  });

  return {
    variante: ia.variante,
    reglages: {
      structuration: reglage(modeles.etapes.recherche, ia.zdr.structuration),
      quartier: reglage(modeles.etapes.recherche, ia.zdr.quartier),
      plan: reglage(modeles.etapes.recherche, ia.zdr.plan),
      notation: reglage(modeleNotation, ia.zdr.notation),
      raisons: reglage(modeles.etapes.raisons, ia.zdr.raisons),
    },
    recherche: reglage(modeles.etapes.recherche, ia.zdr.recherche),
    // Le greffon `web` n'a pas de réglage `zdr` : la requête de recherche web ne le porte jamais (décision 0096 § 4.1).
    rechercheWeb: {
      ...reglage(modeles.etapes.recherche, undefined),
      moteur: modeles.rechercheWeb.moteur,
    },
    profils: {
      apercu: bornes(ia.profils.apercu.delaiMs, ia.profils.apercu),
      complet: bornes(ia.profils.complet.delaiMs, recherche),
      mini: {
        cible: ia.profils.mini.cible,
        totalCandidats: ia.profils.mini.totalCandidats,
        toursMax: ia.profils.mini.toursMax,
        delaiMs: ia.profils.mini.delaiMs,
        logements: { ...ia.profils.mini.logements },
      },
    },
    tailleLotNotation: recherche.tailleLotNotation,
  };
}

/** Configuration de production : valeurs de `ia.json` et valeurs dérivées des fichiers de P0 (une source par valeur). */
export const CONFIGURATION_IA: ConfigurationIa = chargerConfigurationIa(production, modelesP0, rechercheP0);
