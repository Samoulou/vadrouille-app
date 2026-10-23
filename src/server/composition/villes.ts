import "server-only";

import { fuseauParPosition, paysParCode, villeDuPays } from "@/lib/fuseaux";
import { creerClientVilles, type OptionsClientsGoogle } from "@/server/composition/clients-google";
import { cookieAccesValide, ouvertureP0, type DependancesAcces } from "@/server/p0/acces";
import { periodesDe } from "@/server/usage/periodes";
import { horlogeSysteme, type PortConsommation } from "@/server/usage/port";

/**
 * Recherche de la ville de l'écran 1 du site d'essai (demande de Samuel du 23 octobre 2026, fil Routine cycle du studio :
 * « un autocomplete avec google maps et on sélectionne » ; soumise aux verdicts de la Sécurité et du Tech Lead).
 *
 * - **Même barrière que le lancement** : garde du mode réel ouverte (`ouvertureP0` : conditions (1) à (7), jamais en
 *   production) **et** cookie d'accès valide (`cookieAccesValide`). Garde fermée : `indisponible`, aucune clé lue, aucun
 *   appel ; cookie absent ou expiré : `acces`, aucun appel.
 * - **Un appel Google par action**, au plus : port de consommation en mémoire borné à une réservation (`portUnAppel`) ;
 *   la clé serveur est lue par le client réel, après la barrière de sortie, jamais envoyée au navigateur.
 * - **Données Google** : les suggestions (textes affichés avec l'attribution « Google Maps ») passent par le navigateur
 *   sans être stockées ; de la fiche, seuls le code ISO du pays et la position sont lus, en mémoire. Le navigateur ne
 *   reçoit que des valeurs **maison** : code du pays de la table maison, fuseau et nom du pays de la table, nom maison de
 *   la ville s'il est dans la table, et le `placeId` (seul identifiant Google conservable). Rien n'atteint un prompt :
 *   la destination envoyée au modèle reste le texte tapé par la personne, ou le nom maison.
 * Aucune donnée Google ni saisie n'est journalisée.
 */

/**
 * Formes du client de recherche de ville (`ClientVilles` de `@/grounding/interfaces`), recopiées ici : ce module est
 * atteint par une action serveur, et l'application n'atteint `src/grounding` que par la fabrique commune (test « graphe
 * de l'application », 0081 B9-TL-1). Le contrôle de type de `creerClientVilles` ci-dessous les tient égales.
 */
type SuggestionVille = { readonly placeId: string; readonly principal: string; readonly secondaire: string | null };
type ClientVilles = {
  suggererVilles(saisie: string, session: string): Promise<readonly SuggestionVille[]>;
  ficheVille(placeId: string, session: string): Promise<{ readonly placeId: string; readonly pays: string | null; readonly position: { lat: number; lng: number } }>;
};

/** Identifiant de lieu Google et jeton de session, contrôlés avant tout appel (mêmes formes que le client réel). */
const PLACE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const SESSION = /^[A-Za-z0-9_-]{1,36}$/;
const SAISIE = { min: 2, max: 80 } as const;
const TEXTE_SUGGESTION_MAX = 300;

export type IssueSuggestions =
  | { readonly statut: "ok"; readonly suggestions: readonly SuggestionVille[] }
  | { readonly statut: "acces" | "indisponible" | "entree_invalide" };

/** Ville choisie : valeurs maison seulement, et le `placeId`. */
export type VilleChoisie = {
  readonly placeId: string;
  /** Code ISO 3166-1 alpha-2 de la table maison des pays. */
  readonly country: string;
  /** Fuseau IANA de la table maison (ville de la table, seul fuseau du pays, ou repère maison le plus proche). */
  readonly timeZone: string;
  /** Nom français du pays, table maison. */
  readonly nomPays: string;
  /** Nom maison de la ville (table des villes, dans ce pays), ou `null` : la destination reste le texte tapé. */
  readonly nomMaison: string | null;
};

export type IssueChoix =
  | { readonly statut: "ok"; readonly ville: VilleChoisie }
  | { readonly statut: "acces" | "indisponible" | "entree_invalide" | "pays_inconnu" };

export type DependancesVilles = DependancesAcces & {
  /** Valeur du cookie `__Host-p0_acces` reçu avec la requête. */
  readonly cookie: string | undefined;
  /** Fabrique du client (doubles des tests) ; par défaut le client Places réel (`creerClientVilles`). */
  readonly client?: (options: OptionsClientsGoogle) => ClientVilles;
};

/** Port en mémoire borné à **une** requête : chaque action ne peut appeler Google qu'une fois. */
function portUnAppel(): PortConsommation {
  let reservees = 0;
  return {
    async reserve() {
      if (reservees >= 1) return { ok: false, code: "cap_reached" };
      reservees += 1;
      return { ok: true, reservationId: "ville_1" };
    },
    async confirm() {},
    async abandon() {},
    async release() {
      reservees = Math.max(0, reservees - 1);
    },
    async consumption() {
      return { requetes: reservees, elements: 0, coutMicros: 0 };
    },
  };
}

/** Barrière : `null` si ouverte, sinon le statut à rendre (aucun appel). */
function barriere(dependances: DependancesVilles): "acces" | "indisponible" | null {
  // Sans journal `p0.guard_closed` : la recherche part à chaque pause de frappe ; le lancement le journalise déjà.
  const ouverture = ouvertureP0(dependances, false);
  if (!ouverture.ok) return "indisponible";
  const maintenant = (dependances.maintenant ?? Date.now)();
  return cookieAccesValide(dependances.cookie, ouverture.attendu, maintenant) ? null : "acces";
}

function client(dependances: DependancesVilles): ClientVilles {
  const fabrique = dependances.client ?? creerClientVilles;
  const horloge = horlogeSysteme;
  return fabrique({
    usage: portUnAppel(),
    // Aucune nature nouvelle (`NATURES` du port reste fermé) : comme les actions sans compte, nature `execution` sans exécution.
    contexte: () => ({ nature: "execution", executionId: null, periodes: periodesDe("google", horloge) }),
    plafonds: [],
    horloge,
  });
}

const texte = (valeur: unknown, max: number): string | null => (typeof valeur === "string" && valeur.length <= max ? valeur : null);

/** Suggestions de villes pour la saisie (Autocomplete (New), `(cities)`, en français, jeton de session). */
export async function suggererVillesEssai(entree: { readonly saisie: unknown; readonly session: unknown }, dependances: DependancesVilles): Promise<IssueSuggestions> {
  const saisie = texte(entree.saisie, 200)?.trim() ?? "";
  const session = texte(entree.session, 36);
  if (saisie.length < SAISIE.min || saisie.length > SAISIE.max || session === null || !SESSION.test(session)) return { statut: "entree_invalide" };
  const refus = barriere(dependances);
  if (refus !== null) return { statut: refus };
  try {
    return { statut: "ok", suggestions: await client(dependances).suggererVilles(saisie, session) };
  } catch {
    return { statut: "indisponible" };
  }
}

/**
 * Ville choisie : fiche Essentials dans la même session (close la session), puis pays et fuseau des tables maison. Le
 * nom maison est cherché dans la table des villes du pays, d'après le texte tapé puis le texte principal de la
 * suggestion (comparaison en mémoire seulement : le texte Google n'est jamais rendu ni stocké).
 */
export async function choisirVilleEssai(
  entree: { readonly placeId: unknown; readonly session: unknown; readonly saisie: unknown; readonly principal: unknown },
  dependances: DependancesVilles,
): Promise<IssueChoix> {
  const placeId = texte(entree.placeId, 256);
  const session = texte(entree.session, 36);
  const saisie = texte(entree.saisie, 200)?.trim() ?? "";
  const principal = texte(entree.principal, TEXTE_SUGGESTION_MAX) ?? "";
  if (placeId === null || !PLACE_ID.test(placeId) || session === null || !SESSION.test(session) || saisie.length < SAISIE.min || saisie.length > SAISIE.max) {
    return { statut: "entree_invalide" };
  }
  const refus = barriere(dependances);
  if (refus !== null) return { statut: refus };
  let fiche;
  try {
    fiche = await client(dependances).ficheVille(placeId, session);
  } catch {
    return { statut: "indisponible" };
  }
  const pays = fiche.pays === null ? null : paysParCode(fiche.pays);
  if (pays === null) return { statut: "pays_inconnu" };
  const maison = villeDuPays(saisie, pays.code) ?? (principal === "" ? null : villeDuPays(principal, pays.code));
  const timeZone = maison?.zone ?? fuseauParPosition(pays.code, fiche.position);
  if (timeZone === null) return { statut: "pays_inconnu" };
  return { statut: "ok", ville: { placeId: fiche.placeId, country: pays.code, timeZone, nomPays: pays.nom, nomMaison: maison?.nom ?? null } };
}
