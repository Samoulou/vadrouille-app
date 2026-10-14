import { MODELE_ID_PATTERN, MOTEURS_RECHERCHE_WEB, type MoteurRechercheWeb, type Routage } from "@/prototype/config";

/**
 * Interface du client de modèles (spécification P0, A1 : « P0a1 définit sa propre interface de client de modèles
 * (requête, réponse, réglage `data_collection`) avec un double, sans dépendance »).
 *
 * Aucun client réel n'existe dans P0a1 : seul le double sur fixtures (`modeles.simule.ts`) implémente cette
 * interface. Le client réel (AI SDK et fournisseur OpenRouter, A1) arrive avec la spécification suivante.
 */

/** Étapes qui appellent un modèle, dans l'ordre du déroulement. */
export const ETAPES_REQUETE = ["plan", "recherche", "notation", "raisons"] as const;
export type EtapeRequete = (typeof ETAPES_REQUETE)[number];

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

export type ReponseModele = {
  /** Texte brut renvoyé par le modèle : du JSON attendu, validé par un schéma strict avant usage. */
  texte: string;
  /** Coût renvoyé par le fournisseur, en USD. */
  coutUsd: number;
};

export interface ClientModeles {
  envoyer(requete: RequeteModele): Promise<ReponseModele>;
}

// --- Recherche web du fournisseur (P0r3c-3 ; correction 1 de la PR 326, mineur 8) ---------------------------------
// Contrat partagé par le client réel de modèles (`openrouter-client.ts`, module de capacité) et le client de recherche
// web (`recherche-web-reelle.ts`, sans capacité) : le module de capacité n'importe rien du client de recherche web.

/** Nombre maximal de résultats demandés par requête de recherche web. */
export const MAX_RESULTATS_WEB = 10;

/** Moteurs admis du greffon `web` (valeurs de `@/prototype/config`, fixées par la configuration, bloquant 1c). */
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
 * (`src/research/recherche-web.ts`), que `src/ai/client.ts` ne peut pas importer (règle d'import de `src/ai`,
 * `tests/unit/p0/imports.test.ts`) : l'égalité des deux types est vérifiée par `recherche-web-reelle.test.ts`.
 */
export type SourceWebFournisseur = { readonly url: string; readonly titre: string; readonly extrait: string };

/** Sources rendues par le fournisseur et coût de la requête. */
export type ReponseRechercheWebFournisseur = { readonly sources: readonly SourceWebFournisseur[]; readonly coutUsd: number };

/** Point d'entrée de recherche web du fournisseur, construit par la composition (`rechercherWeb` du client de modèles). */
export type PointEntreeRechercheWeb = (requete: RequeteRechercheWebFournisseur) => Promise<ReponseRechercheWebFournisseur>;

/** Codes d'erreur fermés du client de modèles (jamais un message de fournisseur). */
export const CODES_ERREUR_MODELE = ["data_collection_missing", "model_id_invalid", "model_unavailable", "model_error"] as const;
export type CodeErreurModele = (typeof CODES_ERREUR_MODELE)[number];

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
