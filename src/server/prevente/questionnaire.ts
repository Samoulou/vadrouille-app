import "server-only";

import { getPrevente, questionnairePreventeDisponible } from "@/adapters";
import {
  nettoyerDestinationPrevente,
  PREVENTE_DESTINATION_BRUT_MAX,
  PREVENTE_PROVENANCE_INTERNE,
  PreventeEnvoiSchema,
  preventeReponseVide,
  type PreventeEtatEnvoi,
  type PreventeReponse,
  type PreventeSaisie,
  type PreventeStatutEnvoi,
  type PreventeVerdictReponse,
} from "@/contracts/prevente-mesure";
import { checkRateLimit, type RateLimitRequest } from "@/server/rate-limit";

import { journaliserPlafondAtteint, journaliserReponsePerdue } from "@/server/prevente/journal";
import { reponsesPrevente } from "@/server/prevente/reponses";

/**
 * Envoi du questionnaire de la prévente (spécification `specs/C2-prevente-mesure.md`, § 3.2 point 6, § 3.3 et § 3.4 ;
 * tâche C2c, ticket 1137 ; décision 0177 § 4 à § 8). Appelé par la seule action serveur
 * `src/server/actions/prevente-questionnaire.ts`.
 *
 * Ordre (0177 § 6) :
 * 1. précommande fermée ou questionnaire indisponible : `indisponible` ; rien n'est lu, compté ni journalisé ;
 * 2. lecture du formulaire et schéma strict : `validation_failed` ou `reponse_vide` ; le limiteur n'est pas appelé, un
 *    envoi refusé ici ne consomme rien ;
 * 3. limiteur (`questionnaire-prevente`) : refus ou indisponibilité (fermé par défaut), `rate_limited` ;
 * 4. `src=interne` : accepté **sans** écriture (il a consommé le limiteur, pas le plafond du jour) ;
 * 5. écriture : `admise`, accepté ; `plafond_atteint`, `rate_limited` ; toute erreur, `provider_error`.
 *
 * - Provenance et parcours viennent des **champs cachés** `src` et `parcours` : ni l'adresse de la page ni `Referer` ne
 *   sont lus. Les en-têtes ne sont que transmis au limiteur, seul à lire l'adresse IP (ce module n'importe pas
 *   `src/server/ip.ts`).
 * - L'état rendu ne dit jamais lequel du limiteur ou du plafond a refusé, ni pourquoi l'écriture a échoué. `saisie` ne
 *   porte que des réponses déjà validées, n'est rendue qu'à la personne qui vient d'envoyer et n'est jamais journalisée.
 * - **Rien ne lève** : aucune réponse 500 ne vient d'ici.
 * - Journal (0177 § 8) : `prevente.reponse_perdue` (nom de l'erreur seul) et `prevente.plafond_atteint` (aucun champ).
 *   `indisponible`, `validation_failed` et `reponse_vide` n'écrivent rien.
 */

/** Nom de l'action du limiteur (`src/server/config/limites.ts`). */
export const ACTION_LIMITEUR_QUESTIONNAIRE = "questionnaire-prevente";

/** Champs du formulaire (noms figés, 0177 § 4 point 1 ; C2d les pose). */
const CHAMPS_UNIQUES = ["src", "parcours", "destination", "periode", "decouverte"] as const;
const CHAMPS_REPETES = ["preparation", "motifs"] as const;
/** Champs que React ajoute à un formulaire envoyé sans JavaScript : ignorés. */
const PREFIXE_REACT = "$ACTION_";

type ChampUnique = (typeof CHAMPS_UNIQUES)[number];
type ChampRepete = (typeof CHAMPS_REPETES)[number];
type EntetesRequete = RateLimitRequest["headers"];

/** Envoi accepté (verdict `admise`, ou `src=interne`) : l'action redirige vers l'état « Merci ». */
export type EnvoiAccepte = { readonly statut: "envoyee" };
export type ResultatEnvoiQuestionnaire = EnvoiAccepte | PreventeEtatEnvoi;

export type DependancesQuestionnaire = {
  /** Précommande ouverte et questionnaire disponible (§ 6.2), sans ouvrir de connexion. */
  readonly ouvert: () => boolean;
  /** Vrai si l'envoi est admis par le limiteur ; faux pour un refus comme pour une indisponibilité. */
  readonly limiteur: (entetes: EntetesRequete) => Promise<boolean>;
  /** Écriture par la fonction de la base ; rend son verdict, lève en cas d'échec. */
  readonly enregistrer: (reponse: PreventeReponse) => Promise<PreventeVerdictReponse>;
  readonly journal: { readonly reponsePerdue: (error: unknown) => void; readonly plafondAtteint: () => void };
};

const DEPENDANCES: DependancesQuestionnaire = {
  ouvert: () => getPrevente() !== null && questionnairePreventeDisponible(),
  limiteur: async (entetes) => (await checkRateLimit({ action: ACTION_LIMITEUR_QUESTIONNAIRE, headers: entetes })).ok,
  enregistrer: (reponse) => reponsesPrevente().enregistrer(reponse),
  journal: { reponsePerdue: journaliserReponsePerdue, plafondAtteint: journaliserPlafondAtteint },
};

const ACCEPTE: EnvoiAccepte = Object.freeze({ statut: "envoyee" });
const refus = (statut: PreventeStatutEnvoi, saisie: PreventeSaisie | null = null): PreventeEtatEnvoi => ({ statut, saisie });

const estChampUnique = (cle: string): cle is ChampUnique => (CHAMPS_UNIQUES as readonly string[]).includes(cle);
const estChampRepete = (cle: string): cle is ChampRepete => (CHAMPS_REPETES as readonly string[]).includes(cle);

/**
 * Du `FormData` à l'objet présenté au schéma (0177 § 4 points 2 et 3) ; `null` : `validation_failed`. Refusés ici : une
 * clé hors liste (hors champs de React), une valeur qui n'est pas une chaîne, un champ à valeur unique répété, `src` ou
 * `parcours` absent, une question 1 de plus de `PREVENTE_DESTINATION_BRUT_MAX` caractères (sans la nettoyer).
 */
function lireFormulaire(donnees: FormData): Record<ChampUnique | ChampRepete, unknown> | null {
  const uniques = new Map<ChampUnique, string>();
  const repetes: Record<ChampRepete, string[]> = { preparation: [], motifs: [] };
  for (const [cle, valeur] of donnees.entries()) {
    if (cle.startsWith(PREFIXE_REACT)) continue;
    if (typeof valeur !== "string") return null;
    if (estChampRepete(cle)) repetes[cle].push(valeur);
    else if (estChampUnique(cle) && !uniques.has(cle)) uniques.set(cle, valeur);
    else return null;
  }
  const src = uniques.get("src");
  const parcours = uniques.get("parcours");
  if (src === undefined || parcours === undefined) return null;
  const brut = uniques.get("destination");
  if (brut !== undefined && brut.length > PREVENTE_DESTINATION_BRUT_MAX) return null;
  return {
    src,
    parcours,
    destination: brut === undefined ? null : nettoyerDestinationPrevente(brut),
    periode: uniques.get("periode") || null,
    preparation: repetes.preparation,
    motifs: repetes.motifs,
    decouverte: uniques.get("decouverte") || null,
  };
}

export async function envoyerQuestionnaire(
  donnees: FormData,
  entetes: EntetesRequete,
  dependances: Partial<DependancesQuestionnaire> = {},
): Promise<ResultatEnvoiQuestionnaire> {
  const { ouvert, limiteur, enregistrer, journal } = { ...DEPENDANCES, ...dependances };

  // 1. Ouverture.
  try {
    if (!ouvert()) return refus("indisponible");
  } catch {
    return refus("indisponible");
  }

  // 2. Formulaire et schéma strict.
  let lu: ReturnType<typeof lireFormulaire>;
  try {
    lu = lireFormulaire(donnees);
  } catch {
    lu = null;
  }
  const envoi = lu === null ? null : PreventeEnvoiSchema.safeParse(lu);
  if (envoi === null || !envoi.success) return refus("validation_failed");
  const { src, parcours, ...reponses } = envoi.data;
  if (preventeReponseVide(reponses)) return refus("reponse_vide");
  const saisie: PreventeSaisie = reponses;

  // 3. Limiteur : fermé par défaut, y compris s'il lève.
  let admis: boolean;
  try {
    admis = (await limiteur(entetes)) === true;
  } catch {
    admis = false;
  }
  if (!admis) return refus("rate_limited", saisie);

  // 4. Lien de test : même parcours, rien n'est écrit.
  if (src === PREVENTE_PROVENANCE_INTERNE) return ACCEPTE;

  // 5. Écriture, qui porte le plafond du jour.
  try {
    const verdict = await enregistrer({ ...reponses, src, parcours } as PreventeReponse);
    if (verdict === "admise") return ACCEPTE;
    if (verdict === "plafond_atteint") {
      journal.plafondAtteint();
      return refus("rate_limited", saisie);
    }
    throw new VerdictInattenduError();
  } catch (error) {
    try {
      journal.reponsePerdue(error);
    } catch {
      // Le journal ne doit rien casser.
    }
    return refus("provider_error", saisie);
  }
}

/** Verdict hors contrat rendu par une écriture injectée : ne porte aucune valeur. */
class VerdictInattenduError extends Error {
  override name = "VerdictInattenduError";

  constructor() {
    super("Verdict de l'écriture inattendu.");
  }
}
