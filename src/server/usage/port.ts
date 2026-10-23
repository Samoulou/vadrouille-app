import "server-only";

import { CODES_REFUS_USAGE, type CodeRefusUsage } from "@/ai/erreurs";

/**
 * Port de consommation `@/server/usage` (spécification `specs/P0-suite-executions-reelles.md`, « Port de
 * consommation » ; forme fixée par la décision 0046, D13). Les clients réels (`src/ai`, `src/grounding`) reçoivent
 * une implémentation de ce port à leur création ; ils ne connaissent ni la base ni le schéma. Implémentations : en
 * mémoire (P0r1, tests seulement, `tests/support/port-consommation-memoire.ts`), Neon (P0r2 : forfait réservé en base dans `prototype.forfaits`, registre en mémoire par appel, sans ligne par appel ; 0046 D13 point 3). Pour le MVP (B7c, B7-TL-6), **aucune** implémentation du port n'écrit `usage_ledger` : le forfait y est réservé par `reservation.ts`, et le port passé aux clients est le registre en mémoire de P0r2.
 *
 * Types maison stricts : **aucun champ** pour une donnée Google, un prompt ou un texte libre. Les périodes sont
 * calculées par l'appelant (D20) ; le port ne calcule aucun fuseau. Une réservation couvre **une seule** requête au
 * transport.
 *
 * Ce module ne contient que le contrat et l'enveloppe commune aux clients (délais, échec fermé). Il n'importe que ses
 * codes de refus, de `src/ai/erreurs.ts` (module sans import, décision 0077 § 3 point 1).
 */

export const NATURES = ["execution", "relecture"] as const;
export type Nature = (typeof NATURES)[number];

/** `modeles` : le fournisseur de modèles (OpenRouter) ; `google` : Places et Routes. */
export const FOURNISSEURS = ["modeles", "google"] as const;
export type Fournisseur = (typeof FOURNISSEURS)[number];

/**
 * Méthodes facturées, une par requête de client (`step` de `usage_ledger`, D13 point 7). `places_autocomplete` : la
 * recherche de la ville de l'écran 1 du site d'essai (demande de Samuel du 23 octobre 2026, décision 0129), hors de tout
 * forfait d'exécution (aucun forfait n'en porte : le registre la refuse) ; son plafond persistant est la ligne `ville`
 * de `prototype.forfaits` (0129 § 3).
 */
export const METHODES = ["chat", "places_text_search", "places_details", "routes_matrix", "places_autocomplete"] as const;
export type Methode = (typeof METHODES)[number];

/** Bornes d'une période, en millisecondes depuis l'époque Unix, `du` inclus, `au` exclu (D20 : calculées par l'appelant). */
export type Periode = { readonly du: number; readonly au: number };

export type Unites = { readonly requetes: number; readonly elements: number };

export const PORTEES = ["execution", "jour", "mois", "enveloppe"] as const;
export type Portee = (typeof PORTEES)[number];

/**
 * Plafond applicable à une demande, reçu par le client à sa création. `methode` absente : toutes les méthodes du
 * fournisseur. `enveloppe` : sans période (Q329). Au moins une borne est donnée.
 */
export type Plafond = {
  readonly portee: Portee;
  readonly fournisseur: Fournisseur;
  readonly methode?: Methode;
  readonly maxRequetes?: number;
  readonly maxElements?: number;
  readonly maxCoutMicros?: number;
};

export type DemandeReservation = {
  readonly nature: Nature;
  readonly fournisseur: Fournisseur;
  readonly methode: Methode;
  /** Identifiant de SKU de la table de prix (`prototype/config/prix-google.json`) ou du modèle. */
  readonly sku: string;
  readonly unites: Unites;
  readonly coutEstimeMicros: number;
  /** Identifiant d'exécution ; nul pour une relecture. */
  readonly executionId: string | null;
  /** Jour de quota et mois du plafond, calculés par l'appelant (D20). */
  readonly periodes: { readonly jour: Periode; readonly mois: Periode };
  readonly plafonds: readonly Plafond[];
};

/**
 * Contexte d'un appel, rendu à chaque requête par l'appelant (composition de P0r3) : nature, identifiant d'exécution
 * et périodes (D20). Commun aux trois clients réels.
 */
export type ContexteAppel = {
  readonly nature: Nature;
  readonly executionId: string | null;
  readonly periodes: { readonly jour: Periode; readonly mois: Periode };
};

/** Ce qu'un client connaît d'une requête facturée : le reste de la demande vient du contexte et des plafonds. */
export type AppelFacture = Pick<DemandeReservation, "fournisseur" | "methode" | "sku" | "unites" | "coutEstimeMicros">;

/** Demande de réservation d'une requête : seul constructeur, commun aux trois clients réels. */
export function demandeDe(contexte: ContexteAppel, appel: AppelFacture, plafonds: readonly Plafond[]): DemandeReservation {
  return {
    nature: contexte.nature,
    fournisseur: appel.fournisseur,
    methode: appel.methode,
    sku: appel.sku,
    unites: appel.unites,
    coutEstimeMicros: appel.coutEstimeMicros,
    executionId: contexte.executionId,
    periodes: contexte.periodes,
    plafonds,
  };
}

/**
 * Refus du port (D13) : définis une seule fois dans `src/ai/erreurs.ts` (décision 0077 § 3 point 1, module sans import)
 * et exportés ici sous le même nom, pour que leurs importateurs ne changent pas.
 */
export { CODES_REFUS_USAGE, type CodeRefusUsage };

export type ResultatReservation =
  | { readonly ok: true; readonly reservationId: string }
  | { readonly ok: false; readonly code: CodeRefusUsage };

/** États d'une ligne (D13 point 4) : seule `liberee` n'est pas comptée. */
export const ETATS = ["reservee", "confirmee", "abandonnee", "liberee"] as const;
export type Etat = (typeof ETATS)[number];

export type FiltreConsommation = {
  readonly fournisseur?: Fournisseur;
  readonly methode?: Methode;
  readonly sku?: string;
  readonly executionId?: string;
};

export type Consommation = Unites & { readonly coutMicros: number };

export interface PortConsommation {
  /** Réservation atomique : refuse si un plafond de la demande serait dépassé. */
  reserve(demande: DemandeReservation): Promise<ResultatReservation>;
  /** Requête aboutie : coût réel s'il est connu, sinon l'estimation reste comptée. */
  confirm(reservationId: string, reel: { readonly coutMicros: number | null }): Promise<void>;
  /** Requête partie puis interrompue (délai, erreur réseau, réponse refusée) : comptée au coût estimé. */
  abandon(reservationId: string): Promise<void>;
  /** Transport jamais appelé : la ligne n'est plus comptée. */
  release(reservationId: string): Promise<void>;
  /** Consommation des lignes comptées dont l'instant est dans la période (`null` : sans période). */
  consumption(periode: Periode | null, filtre?: FiltreConsommation): Promise<Consommation>;
}

/** Délai d'une opération du port : constante du code des clients (D13 point 5 ; 2 000 ms au plus). */
export const DELAI_PORT_MS = 2_000;

/**
 * Délais par requête (D13 point 5), posés par l'enveloppe de chaque client. Constantes, jamais une configuration.
 * `openrouterProgramme` : requête de modèle de nature `programme` seulement (rédaction du programme complet du prototype, réponse
 * longue ; décision 0116 § 2.3, qui amende D13 point 5 pour cette seule nature) ; toute autre requête de modèle garde
 * `openrouter`.
 */
export const DELAI_REQUETE_MS = { openrouter: 120_000, openrouterProgramme: 300_000, places: 10_000, routes: 10_000 } as const;

/** Horloge injectée : instant courant et minuterie annulable. */
export type Horloge = {
  maintenant(): number;
  minuterie(ms: number, rappel: () => void): () => void;
};

export const horlogeSysteme: Horloge = {
  maintenant: () => Date.now(),
  minuterie(ms, rappel) {
    const id = setTimeout(rappel, ms);
    return () => clearTimeout(id);
  },
};

/** Valeur sentinelle « le port n'a pas répondu à temps ». */
const MUET: { readonly muet: true } = Object.freeze({ muet: true });

/** Opération du port bornée par `DELAI_PORT_MS` : `MUET` si elle ne répond pas à temps ; ses erreurs sont propagées. */
async function borner<T>(operation: () => Promise<T>, horloge: Horloge): Promise<T | typeof MUET> {
  let annuler = () => {};
  const delai = new Promise<typeof MUET>((resolve) => {
    annuler = horloge.minuterie(DELAI_PORT_MS, () => resolve(MUET));
  });
  try {
    return await Promise.race([operation(), delai]);
  } finally {
    annuler();
  }
}

/** Issue d'un appel fait sous réservation, rendue au client qui la traduit dans ses propres codes. */
export type IssueAppel<T> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly code: CodeRefusUsage }
  | { readonly ok: false; readonly code: "upstream_timeout" }
  | { readonly ok: false; readonly erreur: unknown };

/** Résultat d'une requête au transport : la valeur, et le coût réel s'il est connu. */
export type ResultatRequete<T> = { readonly valeur: T; readonly coutReelMicros: number | null };

/**
 * Réserve, appelle le transport **une fois**, puis confirme, abandonne ou libère (D13 points 4 et 5) :
 * - le port lève ou ne répond pas dans `DELAI_PORT_MS` : l'appel n'a pas lieu (`usage_unavailable`, échec fermé) ;
 * - réservation refusée : son code, l'appel n'a pas lieu ;
 * - `requete` lève avant d'appeler le transport (`transportAppele()` faux) : réservation libérée ;
 * - transport appelé puis erreur ou délai de requête dépassé (`signal` abandonné) : réservation abandonnée, comptée ;
 * - succès : réservation confirmée.
 * Une erreur du port après l'appel (confirmation, abandon, libération) est ignorée : la ligne reste `reservee` et
 * reste comptée (D13 point 4).
 */
export async function avecReservation<T>(
  dependances: { readonly port: PortConsommation; readonly horloge: Horloge },
  demande: DemandeReservation,
  delaiRequeteMs: number,
  requete: (signal: AbortSignal, transportAppele: () => void) => Promise<ResultatRequete<T>>,
): Promise<IssueAppel<T>> {
  const { port, horloge } = dependances;
  let reservation: ResultatReservation | typeof MUET;
  try {
    reservation = await borner(() => port.reserve(demande), horloge);
  } catch {
    return { ok: false, code: "usage_unavailable" };
  }
  if ("muet" in reservation) return { ok: false, code: "usage_unavailable" };
  if (!reservation.ok) return { ok: false, code: reservation.code };
  const id = reservation.reservationId;
  const solder = async (operation: () => Promise<void>) => {
    try {
      await borner(operation, horloge);
    } catch {
      // Ligne laissée « réservée » : toujours comptée.
    }
  };

  const controleur = new AbortController();
  const annuler = horloge.minuterie(delaiRequeteMs, () => controleur.abort());
  let appele = false;
  try {
    const abandon = new Promise<never>((_, rejeter) => {
      controleur.signal.addEventListener("abort", () => rejeter(new Error("upstream_timeout")), { once: true });
    });
    const resultat = await Promise.race([
      requete(controleur.signal, () => {
        appele = true;
      }),
      abandon,
    ]);
    await solder(() => port.confirm(id, { coutMicros: resultat.coutReelMicros }));
    return { ok: true, valeur: resultat.valeur };
  } catch (erreur) {
    await solder(() => (appele ? port.abandon(id) : port.release(id)));
    if (controleur.signal.aborted) return { ok: false, code: "upstream_timeout" };
    return { ok: false, erreur };
  } finally {
    annuler();
  }
}
