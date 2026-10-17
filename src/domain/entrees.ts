import type { Brief, Category, StopFacts, TripCommitment } from "@/contracts";

import type { ConfigClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { Relectures } from "@/domain/relectures";
import type { PorteeR1 } from "@/domain/validation";

/**
 * Types d'entrée du moteur (décision 0045, B5-TL-1 ; spécification B5a, point 1), construits sur les types de
 * `src/contracts`. Ils sont définis une seule fois, ici ; P0 les reçoit par son adaptateur (`scripts/p0`), le
 * serveur les construira en B9. **Aucune donnée dérivée de Google** : validité, horaires et durées n'entrent que
 * par les interfaces de `relectures.ts` ; seul `placeId` (posé par l'ancrage) figure ici.
 */

/** Types de créneau du moteur (notation `slotFit`, clés de la formule de classement). */
export const TYPES_CRENEAU = ["activity", "meal", "evening"] as const;
export type TypeCreneau = (typeof TYPES_CRENEAU)[number];

/** Classes de source de la politique de sources (cadrage § 6.5), clés de la formule de classement. */
export const CLASSES_SOURCE = ["officielle", "independante", "generique"] as const;
export type ClasseSource = (typeof CLASSES_SOURCE)[number];

/** Voyage : champs maison de `trips` dont le moteur a besoin. */
export type VoyageMoteur = {
  destination: string;
  /** Date d'arrivée (AAAA-MM-JJ). */
  start: string;
  /** Date de départ (AAAA-MM-JJ). */
  end: string;
  timeZone: string;
  travellers: { adults: number; children: number };
};

/** Logement d'une nuit (B5-PO-7) : étiquette maison (nom saisi ou quartier), `placeId` facultatif. */
export type Nuit = { etiquette: string; placeId?: string };

/** Source web d'un candidat : URL `https:` déjà validée, date de la page, classe de domaine. */
export type SourceMoteur = { url: string; date: string; classe: ClasseSource };

/** Notes du modèle de notation (étape de notation), sur nos descriptions seulement. */
export type NotesMoteur = {
  matchesWishes: boolean;
  /** 1 à 10. */
  notForMeRisk: number;
  mustSee: boolean;
  slotFit: readonly TypeCreneau[];
};

/**
 * Candidat de la réserve : identifiant opaque (`uuid` en production, `c_\d{3}` dans P0 ; 0045 § 5.2), nom et
 * résumé maison, catégorie, faits, sources, notes, `placeId` posé par l'ancrage (absent : non ancré).
 */
export type CandidatMoteur = {
  id: string;
  nom: string;
  resume: string;
  categorie: Category;
  typeEtape: "activity" | "meal";
  faits: StopFacts;
  sources: readonly SourceMoteur[];
  notes: NotesMoteur;
  placeId?: string;
  /** La source indique qu'il faut réserver (exception `toReserve`). */
  aReserver: boolean;
};

/** Candidat d'événement (`Candidat.evenement` de P0) : date, heure lue sur la page si elle existe, date relue. */
export type CandidatEvenement = Omit<CandidatMoteur, "typeEtape" | "notes"> & {
  evenement: { date: string; heure?: string; dateRelue: boolean };
};

/** Candidat d'idée « Surprends-moi » (B5-PO-16) : raison maison déjà écrite (étape e, B9). */
export type CandidatIdee = Omit<CandidatMoteur, "typeEtape"> & { raison: string };

/**
 * États admis d'une étape de repas ou de soirée (B5-PO-8) : choisie, présentée et gardée sans décision (F6-PO-7),
 * engagement, ajoutée par la personne. La correspondance avec `preference_signals` est faite par B10.
 */
export const ETATS_CHOIX = ["choisi", "garde", "engagement", "ajout"] as const;
export type EtatChoix = (typeof ETATS_CHOIX)[number];

/**
 * État de choix, par identifiant : identifiant d'étape pour une étape déjà dans le programme (validation R7) ;
 * identifiant de candidat pour un repas ou une soirée à planifier (B5b : la personne choisit une proposition, qui
 * désigne un candidat, avant que l'étape existe).
 */
export type EtatsDeChoix = ReadonlyMap<string, EtatChoix>;

/** Entrée complète du moteur (B5b et B5c la consomment). */
export type EntreeMoteur = {
  voyage: VoyageMoteur;
  brief: Brief;
  nuits: readonly Nuit[];
  engagements: readonly TripCommitment[];
  candidats: readonly CandidatMoteur[];
  evenements: readonly CandidatEvenement[];
  idees: readonly CandidatIdee[];
  choix: EtatsDeChoix;
  configuration: ConfigurationMoteur;
  /**
   * Formule de classement (B5b point 2 ; décision 0045 § 4.4 : elle reste dans `prototype/config/classement.json`
   * tant que P0 tourne, validée par `ConfigClassementSchema`) et âge maximal d'une source, en jours.
   */
  classement: { formule: ConfigClassement; ageSourceMaxJours: number };
  relectures: Relectures;
  /** Portée de R1 (B5-PO-4) ; absente : `PORTEE_R1_PAR_DEFAUT` (question Q332 ouverte). */
  porteeR1?: Partial<PorteeR1>;
  /** Date de référence (AAAA-MM-JJ) : jamais lue sur une horloge (0045 § 3.4). */
  dateReference: string;
  /** Numéro de la version à produire (identifiants `v<n>-j<jour>-<rang>`, 0045 § 3.5). */
  version: number;
  /** Budget de trajet déjà réduit pour ce voyage (B5-PO-3), lu dans l'instantané de base. */
  budgetTrajetReduit: boolean;
  /**
   * Jours à planifier par `generer` (indices, 1 = J1 ; décision 0081 § B9-TL-13). Absent : tout le voyage. Les
   * autres jours sont rendus non planifiés (B9-PO-6 : termini de logement seuls). Ignoré par `replanifierJour`.
   */
  jours?: readonly number[];
};
