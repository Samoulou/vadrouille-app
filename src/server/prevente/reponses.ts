import "server-only";

import { PreventeReponseSchema, PreventeVerdictReponseSchema, type PreventeReponse, type PreventeVerdictReponse } from "@/contracts/prevente-mesure";

import { poolPrevente, type PoolPrevente } from "@/server/prevente/pool";

/**
 * Écriture d'une réponse au questionnaire de la prévente sur Postgres et lecture du verdict (spécification
 * `specs/C2-prevente-mesure.md`, § 3.3 point 7, § 3.4 point 3 et § 4 ; tâche C2c, ticket 1137 ; décision 0177 § 7 ;
 * migration `0029_prevente_mesure`, décision 0172 § 1), sur le modèle de `visites.ts`.
 *
 * - **Une seule requête, texte constant** : la fonction `SECURITY DEFINER`, avec **sept** arguments. Le plafond du jour
 *   n'est jamais passé : la base applique le sien (0172 § 1 point 3). Le rôle `vadrouille_app` n'a aucun droit sur les
 *   tables : ce module n'en nomme aucune, ne lit rien et ne compte rien. Le jour UTC et l'identifiant sont posés par la
 *   base.
 * - **Ce qui part vers la base** : la réponse revalidée ici par le schéma strict (provenance stockée, jamais `interne` ;
 *   jamais vide). Ni adresse IP, ni agent utilisateur, ni heure, ni identifiant de session ou de paiement.
 * - **Verdict** : la colonne `verdict` de la première ligne, validée par le contrat. Ligne absente ou autre valeur :
 *   `VerdictPreventeIllisibleError`, qui ne porte aucune valeur.
 * - **Pool** : celui de la mesure (`pool.ts`), partagé avec le compteur de visites.
 * - **Erreurs** : `enregistrer` lève (base, garde, délai, contrainte, fonction absente). L'appelant
 *   (`questionnaire.ts`) rend `provider_error` et n'en journalise que le nom (0172 § 6).
 * - **Limite acceptée** (0177 § 7 point 5) : le délai de 2 s coupe l'attente, pas la transaction ; une réponse peut être
 *   écrite alors que l'appelant a rendu un échec.
 */

export type ReponsesPrevente = {
  /** Écrit la réponse si le plafond du jour n'est pas atteint ; rend le verdict de la base. Lève en cas d'échec. */
  readonly enregistrer: (reponse: PreventeReponse) => Promise<PreventeVerdictReponse>;
};

export type ReponsesPreventeOptions = {
  /** Tests seulement : fabrique du pool (sinon le pool de la mesure) ; elle lève si la garde refuse. */
  readonly creerPool?: () => PoolPrevente;
};

/** Seule requête de l'écriture : la fonction, jamais une table ; sept arguments, jamais le plafond. */
export const REQUETE_ENREGISTRER_REPONSE =
  "SELECT public.prevente_enregistrer_reponse($1::text, $2::text, $3::text, $4::text, $5::text[], $6::text[], $7::text) AS verdict";

/** Verdict absent ou hors contrat : ne porte aucune valeur. */
export class VerdictPreventeIllisibleError extends Error {
  override name = "VerdictPreventeIllisibleError";

  constructor() {
    super("Verdict de l'écriture d'une réponse illisible.");
  }
}

export function creerReponsesPrevente(options: ReponsesPreventeOptions = {}): ReponsesPrevente {
  const creerPool = options.creerPool ?? poolPrevente;
  return Object.freeze({
    async enregistrer(reponse: PreventeReponse): Promise<PreventeVerdictReponse> {
      const r = PreventeReponseSchema.parse(reponse);
      const valeurs = [r.src, r.parcours, r.destination, r.periode, r.preparation, r.motifs, r.decouverte];
      const resultat = (await creerPool().query(REQUETE_ENREGISTRER_REPONSE, valeurs)) as { rows?: readonly { verdict?: unknown }[] } | null | undefined;
      const verdict = PreventeVerdictReponseSchema.safeParse(resultat?.rows?.[0]?.verdict);
      if (!verdict.success) throw new VerdictPreventeIllisibleError();
      return verdict.data;
    },
  });
}

let parDefaut: ReponsesPrevente | undefined;

/** Écriture du serveur (pool de la mesure, créé au premier appel). */
export function reponsesPrevente(): ReponsesPrevente {
  return (parDefaut ??= creerReponsesPrevente());
}
