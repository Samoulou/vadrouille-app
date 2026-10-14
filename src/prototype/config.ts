import { z } from "zod";

/**
 * Configuration commitée du prototype P0 (décision 0032, A2) : un fichier JSON par sujet dans
 * `prototype/config/`, validé ici par un schéma Zod strict. Le script lit les fichiers par `node:fs`
 * (`scripts/p0/`), les valide, puis injecte les valeurs. Aucun identifiant de modèle, aucun hôte, aucune URL
 * ni aucun nom de variable d'environnement n'est écrit en dur dans le code.
 *
 * Les clés `activity`, `meal`, `evening` (types de créneau) de `recherche.json` sont celles de `TYPES_CRENEAU` de
 * `candidat.ts` : les modules de `src/prototype` sont des feuilles sans import entre eux (décision 0032, A3.2) ;
 * `config.test.ts` vérifie l'égalité. Le schéma de `classement.json` est dans `src/domain` (décision 0045 § 1.4).
 *
 * **Aucun champ ne peut ouvrir un chemin réel** : chaque niveau est strict, une clé inconnue (`mode`, `reel`,
 * `host`, `url`…) fait refuser le fichier. Module pur, n'importe que `zod`.
 */

/** Version des fichiers de configuration. */
export const CONFIG_SCHEMA = 1;

/** Identifiant de modèle OpenRouter (`fournisseur/modele`), 100 caractères au plus (A2). */
export const MODELE_ID_PATTERN = /^[a-z0-9-]+\/[a-z0-9._:-]+$/;

const ModeleIdSchema = z.string().max(100).regex(MODELE_ID_PATTERN, "identifiant de modèle OpenRouter attendu");
const Version = z.literal(CONFIG_SCHEMA);

/** Étapes appelant un modèle, dans l'ordre du déroulement (le plan de recherche utilise le modèle `recherche`). */
export const ETAPES_MODELE = ["recherche", "notation", "raisons"] as const;
export type EtapeModele = (typeof ETAPES_MODELE)[number];

/** Réglage de routage OpenRouter : seuls les fournisseurs qui ne collectent pas les données (décision 0026). */
export const RoutageSchema = z.strictObject({
  data_collection: z.literal("deny"),
  zdr: z.boolean().optional(),
});
export type Routage = z.infer<typeof RoutageSchema>;

/** `modeles.json` : modèles de la variante B, et la seule différence de la variante A (P0-PO-12). */
export const ConfigModelesSchema = z.strictObject({
  schema: Version,
  etapes: z.strictObject({
    recherche: ModeleIdSchema,
    notation: ModeleIdSchema,
    raisons: ModeleIdSchema,
  }),
  variantes: z.strictObject({
    /** La variante A ne peut changer que le modèle de notation : garanti par la forme. */
    a: z.strictObject({ notation: ModeleIdSchema }),
  }),
  routage: RoutageSchema,
});
export type ConfigModeles = z.infer<typeof ConfigModelesSchema>;

export const VARIANTES = ["a", "b"] as const;
export type Variante = (typeof VARIANTES)[number];

/** Modèles effectifs d'une variante : `variantes.a` appliqué sur `etapes`, sans branche de code propre à A. */
export function modelesDeLaVariante(config: ConfigModeles, variante: Variante): ConfigModeles["etapes"] {
  return variante === "a" ? { ...config.etapes, ...config.variantes.a } : { ...config.etapes };
}

const entier = (max: number) => z.number().int().min(1).max(max);

/** `recherche.json` : bornes de l'agent (P0-PO-4). */
export const ConfigRechercheSchema = z.strictObject({
  schema: Version,
  /** Cibles de candidats **trouvés** par type de créneau (contrainte 7 : jamais de candidats ancrés). */
  ciblesParCreneau: z.strictObject({
    activity: entier(200),
    meal: entier(200),
    evening: entier(200),
  }),
  /** Total de candidats visé par exécution. */
  totalCandidats: entier(300),
  /** Taille des lots envoyés au modèle de notation. */
  tailleLotNotation: entier(50),
  /** Nombre maximal de tours de l'agent de recherche. */
  toursMax: entier(20),
  /** Âge maximal d'une source, en jours, au-delà duquel le candidat est pénalisé (politique de sources). */
  ageSourceMaxJours: entier(3650),
});
export type ConfigRecherche = z.infer<typeof ConfigRechercheSchema>;

/**
 * Bornes du schéma de `plafonds.json` : provisoires et non décisionnelles (décision 0032, A2). Elles empêchent
 * une valeur absurde dans le mode simulé et ne fixent aucun plafond d'exécution réelle. Relever une borne
 * demande un amendement écrit de 0032.
 */
export const BORNES_PLAFONDS = {
  /** Proposition du studio (P0-Q2), non citée par Samuel. */
  coutUsd: 3,
  placesTextSearch: 100,
  placesDetails: 100,
  routesRequetes: 100,
  routesElements: 5000,
  /** Bornes choisies par P0a1. */
  recherchesWeb: 200,
  pagesLues: 200,
  candidatsTrouves: 300,
  dureeMs: 1_800_000,
} as const;

const plafondEntier = (max: number) => z.number().int().min(1).max(max);

/** `plafonds.json` : un plafond par compteur, par exécution (valeurs provisoires de P0a1). */
export const ConfigPlafondsSchema = z.strictObject({
  schema: Version,
  coutUsd: z.number().finite().gt(0).max(BORNES_PLAFONDS.coutUsd),
  recherchesWeb: plafondEntier(BORNES_PLAFONDS.recherchesWeb),
  pagesLues: plafondEntier(BORNES_PLAFONDS.pagesLues),
  candidatsTrouves: plafondEntier(BORNES_PLAFONDS.candidatsTrouves),
  placesTextSearch: plafondEntier(BORNES_PLAFONDS.placesTextSearch),
  placesDetails: plafondEntier(BORNES_PLAFONDS.placesDetails),
  routesRequetes: plafondEntier(BORNES_PLAFONDS.routesRequetes),
  routesElements: plafondEntier(BORNES_PLAFONDS.routesElements),
  dureeMs: plafondEntier(BORNES_PLAFONDS.dureeMs),
});
export type ConfigPlafonds = z.infer<typeof ConfigPlafondsSchema>;
export type CompteurPlafonne = Exclude<keyof ConfigPlafonds, "schema">;

/** Unités possibles du quota Routes de la console (P0-Q31) ; égales à `UniteQuotaRoutes` de `@/server/usage/forfait` (test). */
export const UNITES_QUOTA_ROUTES = ["requetes", "elements"] as const;

/**
 * Bornes de la configuration du **mode réel** (`prototype/config/mode-reel.json`, décision 0055, section 6) : valeurs de
 * Samuel et du Product Owner, jamais relevées par le studio. Coût des modèles : 3 USD (Samuel, Q270) ; Text Search et
 * Place Details : 90 (P0S2-PO-8) ; recherches web, pages lues et candidats : 60, 150 et 90 au plus (P0S2-PO-8) ; Routes :
 * 500 éléments (Samuel, 0053), sous le quota de 3 000 éléments par minute (Q330) ; durée : 15 min (A8).
 */
export const BORNES_MODE_REEL = {
  coutUsd: 3,
  recherchesWeb: 60,
  pagesLues: 150,
  candidatsTrouves: 90,
  placesTextSearch: 90,
  placesDetails: 90,
  routesRequetes: BORNES_PLAFONDS.routesRequetes,
  routesElements: 500,
  dureeMs: 900_000,
} as const;

/** Logements d'un brief au plus (`BriefSchema`) : chacun demande un Text Search à l'ancrage. */
const LOGEMENTS_MAX = 5;

/**
 * Champs du mode réel **sans valeur par défaut** tant que leur décision manque : `coutUsd` (Q391, Product Owner) et
 * `fiches` (marge de remplacement de l'étape finale, Q389, Product Owner). Absents du fichier, la configuration est
 * refusée (`config_reel_incomplete`) et aucune exécution réelle ne démarre (même règle que `uniteQuotaRoutes`, 0055 § 6
 * point 2).
 */
export const CHAMPS_MODE_REEL_EN_ATTENTE = ["coutUsd", "fiches"] as const;

const plafondReel = (max: number) => z.number().int().min(1).max(max);

/** `mode-reel.json` : plafonds par exécution du mode réel, unité du quota Routes et marge des fiches. */
export const ConfigModeReelSchema = z.strictObject({
  schema: Version,
  /** Unité du quota Routes (Q330 : `"elements"`), obligatoire, sans valeur par défaut. */
  uniteQuotaRoutes: z.enum(UNITES_QUOTA_ROUTES),
  coutUsd: z.number().finite().gt(0).max(BORNES_MODE_REEL.coutUsd),
  recherchesWeb: plafondReel(BORNES_MODE_REEL.recherchesWeb),
  pagesLues: plafondReel(BORNES_MODE_REEL.pagesLues),
  candidatsTrouves: plafondReel(BORNES_MODE_REEL.candidatsTrouves),
  placesTextSearch: plafondReel(BORNES_MODE_REEL.placesTextSearch),
  placesDetails: plafondReel(BORNES_MODE_REEL.placesDetails),
  routesRequetes: plafondReel(BORNES_MODE_REEL.routesRequetes),
  routesElements: plafondReel(BORNES_MODE_REEL.routesElements),
  dureeMs: plafondReel(BORNES_MODE_REEL.dureeMs),
  /** Marge de remplacement de l'étape finale : `max(margeMinimum, ⌈margePart × première série⌉)` (Q389). */
  fiches: z.strictObject({
    margeMinimum: z.number().int().min(0).max(BORNES_MODE_REEL.placesDetails),
    margePart: z.number().finite().min(0).max(1),
  }),
});
export type ConfigModeReel = z.infer<typeof ConfigModeReelSchema>;

export const CODES_CONFIG_MODE_REEL = ["config_reel_incomplete", "config_reel_invalide"] as const;
export type CodeConfigModeReel = (typeof CODES_CONFIG_MODE_REEL)[number];

/**
 * Configuration du mode réel, ou un code fermé (jamais la valeur reçue) : `config_reel_incomplete` si un champ
 * obligatoire manque (décision en attente), `config_reel_invalide` sinon. Contrôle croisé : chaque candidat et chaque
 * logement demandent un Text Search, `candidatsTrouves + 5 ≤ placesTextSearch`.
 */
export function validerConfigModeReel(brut: unknown): { ok: true; config: ConfigModeReel } | { ok: false; code: CodeConfigModeReel } {
  if (typeof brut === "object" && brut !== null && !Array.isArray(brut)) {
    const presents = new Set(Object.keys(brut));
    const obligatoires = Object.keys(ConfigModeReelSchema.shape);
    if (obligatoires.some((cle) => !presents.has(cle))) return { ok: false, code: "config_reel_incomplete" };
  }
  const lu = ConfigModeReelSchema.safeParse(brut);
  if (!lu.success) return { ok: false, code: "config_reel_invalide" };
  if (lu.data.candidatsTrouves + LOGEMENTS_MAX > lu.data.placesTextSearch) return { ok: false, code: "config_reel_invalide" };
  return { ok: true, config: lu.data };
}

/**
 * Fichiers de configuration de P0 validés ici. `classement.json` est validé par `ConfigClassementSchema`, défini
 * dans `src/domain` depuis B5a (décision 0045 § 1.4, amendement de 0032 A2), par `scripts/p0/fichiers.ts`.
 */
export type Configuration = {
  modeles: ConfigModeles;
  recherche: ConfigRecherche;
  plafonds: ConfigPlafonds;
};

/**
 * Valide les trois fichiers et leurs contrôles croisés : le total de candidats visé reste sous le plafond
 * `candidatsTrouves`, et la somme des cibles par créneau ne dépasse pas ce total. Lève une erreur sans recopier
 * la valeur reçue.
 */
export function validerConfiguration(brut: Record<keyof Configuration, unknown>): Configuration {
  const configuration: Configuration = {
    modeles: ConfigModelesSchema.parse(brut.modeles),
    recherche: ConfigRechercheSchema.parse(brut.recherche),
    plafonds: ConfigPlafondsSchema.parse(brut.plafonds),
  };
  if (configuration.recherche.totalCandidats > configuration.plafonds.candidatsTrouves) {
    throw new Error("configuration : totalCandidats dépasse le plafond candidatsTrouves");
  }
  const cibles = configuration.recherche.ciblesParCreneau;
  if (cibles.activity + cibles.meal + cibles.evening > configuration.recherche.totalCandidats) {
    throw new Error("configuration : la somme des cibles par créneau dépasse totalCandidats");
  }
  return configuration;
}
