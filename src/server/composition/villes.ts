import "server-only";

import type { IssueChoixEssai, IssueSuggestionsEssai } from "@/contracts/villes";
import { villeDuPays } from "@/lib/fuseaux";
import { creerClientVilles, type OptionsClientsGoogle } from "@/server/composition/clients-google";
import { errorNameOf, logEvent, type LogFields, type LogVilleReason } from "@/server/log";
import { cookieAccesValide, empreinteCookieAcces, ouvertureP0, type DependancesAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { reserverVille, type DemandeVille, type LimitesVille, type ResultatVille } from "@/server/usage/neon";
import { choisirVille, suggererVilles, type ClientVilles, type PortsRecherche } from "@/server/villes/recherche";

import prixGoogle from "../../../prototype/config/prix-google.json";

/**
 * Recherche de ville de l'écran 1 du site d'essai (décision 0129 ; demande de Samuel du 2026-10-23, fil « Routine cycle
 * du studio »).
 *
 * - **Même barrière que le lancement** : garde du mode réel ouverte (`ouvertureP0` : conditions (1) à (7), jamais en
 *   production) **et** cookie d'accès valide (`cookieAccesValide`). Garde fermée : `indisponible`, aucune clé lue, aucune
 *   connexion, aucun appel ; cookie absent ou expiré : `acces`, aucun appel.
 * - **Plafond persistant** (0129 § 3) : avant tout appel Google, une ligne `prototype.forfaits` de nature `ville` est
 *   réservée (`reserverVille`) sous les limites `LIMITES_VILLE` (par jour de quota, et par cookie et par minute) ; au
 *   plafond de la minute, `limite`, au plafond du jour, `limite_jour` ; le client (clé serveur) est construit avant la
 *   réservation, clé absente : `indisponible` sans unité consommée ; base indisponible ou migration 0019 absente : `indisponible` (échec fermé). Le coût de chaque
 *   action, au prix plein, entre dans le mois Google des forfaits.
 * - **Un appel Google par action**, au plus : port de consommation en mémoire borné à une réservation (`portUnAppel`) ;
 *   la clé serveur est lue par le client réel, après la barrière de sortie, jamais envoyée au navigateur.
 * - **Données Google** : les suggestions (textes affichés avec l'attribution « Google Maps ») passent par le navigateur
 *   sans être stockées ; de la fiche, seuls le code ISO du pays et la position sont lus, en mémoire. Le navigateur ne
 *   reçoit que des valeurs **maison** et le `placeId` (seul identifiant Google conservable). Rien n'atteint un prompt :
 *   la destination envoyée au modèle est le nom maison, ou le texte tapé filtré (`briefDepuisFormulaire`, 0129 § 4).
 * Aucune donnée Google ni saisie n'est journalisée. Chaque refus écrit `p0.ville_refusee` (constat du 2026-10-25 : les
 * refus étaient muets), motif fermé seulement (`MotifRefus`), avec la garde fermée, le code fermé et le code HTTP d'une
 * erreur de Google : ni texte tapé, ni `placeId`, ni texte Google, ni cookie, ni clé.
 *
 * **Terminal mince** (décision 0141 § 6.1 point 3) : contrôles d'entrée, port borné à un appel, fabrique, diagnostic,
 * lecture de la fiche et ordre d'une action sont au cœur commun `src/server/villes/recherche.ts` ; ce module ne garde
 * que ses ports (barrière `ouvertureP0` et cookie, `reserverVille` sur `poolPrototype()` sous `LIMITES_VILLE`, coût au
 * prix plein, table élargie `villeDuPays`, journal `p0.ville_refusee`). Comportement inchangé
 * (`tests/unit/composition/villes.test.ts`, attentes inchangées).
 */

/**
 * Limites de la recherche de ville (décision 0129 § 3) : 150 suggestions et 40 choix par jour de quota Google, et
 * 20 actions par cookie d'accès et par minute. Au prix plein (2,83 USD les 1 000 suggestions, 5 USD les 1 000 fiches
 * Essentials), un jour au plafond coûte 0,6245 USD, un mois de 31 jours 19,36 USD : sous le plafond Google de 20 USD par
 * mois de 0027 § 2 même sans tranche gratuite ; dans les tranches gratuites (10 000 par mois chacune), 0 USD.
 */
export const LIMITES_VILLE: LimitesVille = { suggestionsParJour: 150, choixParJour: 40, actionsParMinuteEtCookie: 20 };

/** Suggestions du site d'essai (types de `@/contracts/villes`, 0141 § 6.1 point 5). */
export type IssueSuggestions = IssueSuggestionsEssai;
export type { VilleChoisie } from "@/contracts/villes";
export type IssueChoix = IssueChoixEssai;

export type DependancesVilles = DependancesAcces & {
  /** Valeur du cookie `__Host-p0_acces` reçu avec la requête. */
  readonly cookie: string | undefined;
  /** Fabrique du client (doubles des tests) ; par défaut le client Places réel (`creerClientVilles`). */
  readonly client?: (options: OptionsClientsGoogle) => ClientVilles;
  /** Réservation de l'action (doubles des tests) ; par défaut `reserverVille` sur `poolPrototype()`, sous `LIMITES_VILLE`. */
  readonly reserver?: (demande: DemandeVille) => Promise<ResultatVille>;
};

/** Motif d'un refus : dérivé de la liste fermée du journal (`LOG_VILLE_REASONS`), jamais recopié. */
export type MotifRefus = LogVilleReason;

type Action = DemandeVille["action"];

/** Motifs écrits au niveau `info` : possibles à chaque pause de frappe, par tout appelant (décision 0131, volume). */
const MOTIFS_INFO: ReadonlySet<MotifRefus> = new Set<MotifRefus>(["entree_invalide", "acces", "garde"]);

/** Journal d'un refus : champs fermés seulement (le journal retire toute valeur hors liste). */
export function journaliserRefus(action: Action, motif: MotifRefus, details: Pick<LogFields, "guard" | "googleCode" | "httpStatus" | "errorName"> = {}): void {
  logEvent("p0.ville_refusee", { reason: motif, action, ...details }, MOTIFS_INFO.has(motif) ? "info" : "warn");
}

/** Exception attrapée par l'action serveur : nom de classe seulement. */
export function journaliserException(action: Action, erreur: unknown): void {
  const errorName = errorNameOf(erreur);
  journaliserRefus(action, "exception", errorName !== undefined ? { errorName } : {});
}

/** Barrière : l'empreinte du cookie si elle est ouverte, sinon le statut à rendre (aucune connexion, aucun appel). */
function barriere(action: Action, dependances: DependancesVilles): { readonly empreinte: string } | { readonly refus: "acces" | "indisponible" } {
  // Sans journal `p0.guard_closed` (la recherche part à chaque pause de frappe) : `p0.ville_refusee` porte le code fermé.
  const ouverture = ouvertureP0(dependances, false);
  if (!ouverture.ok) {
    journaliserRefus(action, "garde", { guard: ouverture.code });
    return { refus: "indisponible" };
  }
  const maintenant = (dependances.maintenant ?? Date.now)();
  const cookie = dependances.cookie;
  if (cookie === undefined || !cookieAccesValide(cookie, ouverture.attendu, maintenant)) {
    journaliserRefus(action, "acces");
    return { refus: "acces" };
  }
  return { empreinte: empreinteCookieAcces(ouverture.attendu, cookie) };
}

/**
 * Coût au prix plein d'une action, en micro-USD (table de prix commitée) ; `null` si la table est illisible. SKU facturés
 * (ceux du client réel, `SKU_SUGGESTIONS` et `SKU_FICHE_VILLE` de `places-client.ts`) : `places_autocomplete_requests`
 * pour les suggestions, `places_details_essentials` pour le choix.
 */
function coutDe(action: DemandeVille["action"]): number | null {
  const table = TablePrixGoogleSchema.safeParse(prixGoogle);
  if (!table.success) return null;
  const ligne = action === "suggestions" ? table.data.skus.places_autocomplete_requests : table.data.skus.places_details_essentials;
  return ligne === undefined ? null : Math.ceil(ligne.prixPour1000 * 1_000);
}

/** Réservation de l'action : `null` si elle est accordée, sinon le statut à rendre (aucun appel Google). */
async function reserver(action: DemandeVille["action"], empreinte: string, dependances: DependancesVilles): Promise<"limite" | "limite_jour" | "indisponible" | null> {
  const coutGoogleMicros = coutDe(action);
  if (coutGoogleMicros === null) {
    journaliserRefus(action, "prix");
    return "indisponible";
  }
  const reserve = dependances.reserver ?? ((demande: DemandeVille) => reserverVille(poolPrototype(), demande, LIMITES_VILLE));
  let resultat: ResultatVille;
  try {
    resultat = await reserve({ action, empreinte, coutGoogleMicros });
  } catch (erreur) {
    journaliserRefus(action, "reservation", { ...(errorNameOf(erreur) !== undefined ? { errorName: errorNameOf(erreur) } : {}) });
    return "indisponible";
  }
  if (resultat.ok) return null;
  if (resultat.code === "usage_unavailable") {
    journaliserRefus(action, "usage_unavailable");
    return "indisponible";
  }
  const statut = resultat.code === "ville_jour_atteint" ? "limite_jour" : "limite";
  journaliserRefus(action, statut);
  return statut;
}

type RefusEssai = "acces" | "indisponible" | "limite" | "limite_jour";

/** Ports du site d'essai pour une action (l'empreinte du cookie passe de la barrière à la réservation). */
function ports(dependances: DependancesVilles): PortsRecherche<RefusEssai, "fuseau"> {
  let empreinte: string | null = null;
  return {
    async ouvrir(action) {
      const ouverte = barriere(action, dependances);
      if ("refus" in ouverte) return ouverte.refus;
      empreinte = ouverte.empreinte;
      return null;
    },
    fabrique: (options) => (dependances.client ?? creerClientVilles)(options),
    async reserver(action) {
      return empreinte === null ? "indisponible" : reserver(action, empreinte, dependances);
    },
    async apres() {},
    villeDeLaTable: villeDuPays,
    horsTable: "fuseau",
    journal: (action, motif, details = {}) => journaliserRefus(action, motif, details),
  };
}

/** Suggestions de villes pour la saisie (Autocomplete (New), `(cities)`, en français, jeton de session). */
export async function suggererVillesEssai(entree: { readonly saisie: unknown; readonly session: unknown }, dependances: DependancesVilles): Promise<IssueSuggestions> {
  return suggererVilles(entree, ports(dependances));
}

/**
 * Ville choisie : fiche Essentials dans la même session (close la session), puis pays et fuseau des tables maison. Le
 * nom maison est cherché dans la table élargie des villes du pays, d'après le texte tapé puis le texte principal de la
 * suggestion (comparaison en mémoire seulement : le texte Google n'est jamais rendu ni stocké).
 */
export async function choisirVilleEssai(
  entree: { readonly placeId: unknown; readonly session: unknown; readonly saisie: unknown; readonly principal: unknown },
  dependances: DependancesVilles,
): Promise<IssueChoix> {
  return choisirVille(entree, ports(dependances));
}
