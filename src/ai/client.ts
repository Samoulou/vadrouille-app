import type { CodeErreurModele } from "@/ai/erreurs";
import { MODELE_ID_PATTERN, MOTEURS_RECHERCHE_WEB, type MoteurRechercheWeb, type Routage } from "@/ai/reglages";

/**
 * Interface du client de modèles (spécification P0, A1 : « P0a1 définit sa propre interface de client de modèles
 * (requête, réponse, réglage `data_collection`) avec un double, sans dépendance »).
 *
 * Aucun client réel n'existe dans P0a1 : seul le double sur fixtures (`modeles.simule.ts`) implémente cette
 * interface. Le client réel (AI SDK et fournisseur OpenRouter, A1) arrive avec la spécification suivante.
 */

/**
 * Étapes qui appellent un modèle, dans l'ordre du déroulement de P0, puis les deux étapes ajoutées par B7a
 * (`structuration` du brief et `quartier` conseillé, B7-PO-4).
 */
export const ETAPES_REQUETE = ["plan", "recherche", "notation", "raisons", "structuration", "quartier"] as const;
export type EtapeRequete = (typeof ETAPES_REQUETE)[number];

/** Montant en dollars converti en micro-USD entiers (coût réel d'OpenRouter, mesures de `evals/`). */
export const usdEnMicros = (usd: number): number => Math.round(usd * 1_000_000);

export type Message = { role: "system" | "user"; contenu: string };

export type RequeteModele = {
  etape: EtapeRequete;
  /** Identifiant OpenRouter, toujours lu dans la configuration (A2). */
  modele: string;
  /** Réglage de routage OpenRouter ; `data_collection: "deny"` obligatoire (décision 0026). */
  routage: Routage;
  prompt: { id: string; version: number };
  messages: Message[];
};

/**
 * Raisons de fin d'une génération (liste fermée de l'AI SDK, `FinishReason`). Un compteur de diagnostic seulement
 * (ticket 400) : jamais le texte du modèle.
 */
export const FINS_MODELE = ["stop", "length", "content-filter", "tool-calls", "error", "other"] as const;
export type FinModele = (typeof FINS_MODELE)[number];

export type ReponseModele = {
  /** Texte brut renvoyé par le modèle : du JSON attendu, validé par un schéma strict avant usage. */
  texte: string;
  /** Coût renvoyé par le fournisseur, en USD. */
  coutUsd: number;
  /** Raison de fin rendue par le client réel (absente du double sur fixtures). */
  fin?: FinModele;
  /**
   * Jetons en entrée et en sortie lus dans `usage` de l'AI SDK par le client réel (décision 0096 § 2 point 6) :
   * `inputTokens` et `outputTokens` seulement, entiers sûrs de 0 à `MAX_TOKENS` ; absents sinon, et absents du double sur
   * fixtures. Rien d'autre de `usage`, de `providerMetadata`, de `response` ni du corps brut n'entre dans la réponse.
   */
  tokens?: { entree: number; sortie: number };
};

/** Borne des jetons rendus par le client (décision 0096 § 2 point 6) : au-delà, la valeur est absente. */
export const MAX_TOKENS = 10_000_000;

export interface ClientModeles {
  envoyer(requete: RequeteModele): Promise<ReponseModele>;
}

// --- Recherche web du fournisseur (P0r3c-3 ; correction 1 de la PR 326, mineur 8) ---------------------------------
// Contrat partagé par le client réel de modèles (`openrouter-client.ts`, module de capacité) et le client de recherche
// web (`recherche-web-reelle.ts`, sans capacité) : le module de capacité n'importe rien du client de recherche web.

/** Nombre maximal de résultats demandés par requête de recherche web. */
export const MAX_RESULTATS_WEB = 10;

/** Moteurs admis du greffon `web` (copie de `@/prototype/config` dans `@/ai/reglages`, bloquant 1c de la PR 326). */
export const MOTEURS_GREFFON_WEB = MOTEURS_RECHERCHE_WEB;
export type MoteurGreffonWeb = MoteurRechercheWeb;

/** Requête au fournisseur : modèle, routage et moteur de la configuration, messages construits par le client, nombre de résultats. */
export type RequeteRechercheWebFournisseur = {
  readonly modele: string;
  readonly routage: Routage;
  readonly moteur: MoteurGreffonWeb;
  readonly prompt: { readonly id: string; readonly version: number };
  readonly messages: readonly Message[];
  readonly maxResultats: number;
};

/**
 * Source rendue par le fournisseur (citation d'adresse), avant tout contrôle. Même forme que `ResultatWeb`
 * (`src/ai/recherche-web.ts`), mais type distinct et conservé (décision 0096 § 4.3) : une source brute est une donnée
 * **non contrôlée** (adresse non vérifiée, longueurs non bornées) alors qu'un `ResultatWeb` est un résultat **admis** par
 * `recherche-web-reelle.ts` (`https:` seulement, sans identifiants, borné, dédoublonné) : deux noms rendent ce passage
 * visible. Le contrat du module de capacité (`RequeteRechercheWebFournisseur`, `ReponseRechercheWebFournisseur`,
 * `PointEntreeRechercheWeb`) vit ici, et `openrouter-client.ts` n'importe rien de `recherche-web.ts` : le remplacer par
 * `ResultatWeb` ajouterait un import au module de capacité, donc une revue de la Sécurité, sans gain. L'égalité de forme
 * des deux types est vérifiée par `recherche-web-reelle.test.ts` (la conversion est un passage champ à champ).
 */
export type SourceWebFournisseur = { readonly url: string; readonly titre: string; readonly extrait: string };

/** Sources rendues par le fournisseur et coût de la requête. */
export type ReponseRechercheWebFournisseur = { readonly sources: readonly SourceWebFournisseur[]; readonly coutUsd: number };

/** Point d'entrée de recherche web du fournisseur, construit par la composition (`rechercherWeb` du client de modèles). */
export type PointEntreeRechercheWeb = (requete: RequeteRechercheWebFournisseur) => Promise<ReponseRechercheWebFournisseur>;

/** Erreur du client de modèles : un code fermé de `CODES_ERREUR_MODELE` (`@/ai/erreurs`), jamais un message de fournisseur. */
export class ErreurModele extends Error {
  readonly code: CodeErreurModele;
  constructor(code: CodeErreurModele) {
    super(code);
    this.code = code;
    this.name = "ErreurModele";
  }
}

/**
 * Garde `data_collection: "deny"` **avant chaque requête** (décision 0032, A2 : défense en profondeur, la requête
 * construite est contrôlée, pas seulement le fichier). Une requête sans ce réglage, ou avec un identifiant de
 * modèle mal formé, n'atteint jamais le client.
 */
export function avecGardeDataCollection(client: ClientModeles): ClientModeles {
  return {
    async envoyer(requete) {
      const routage = requete.routage as Partial<Routage> | undefined;
      if (routage === undefined || routage === null || routage.data_collection !== "deny") {
        throw new ErreurModele("data_collection_missing");
      }
      if (typeof requete.modele !== "string" || requete.modele.length > 100 || !MODELE_ID_PATTERN.test(requete.modele)) {
        throw new ErreurModele("model_id_invalid");
      }
      return client.envoyer(requete);
    },
  };
}
