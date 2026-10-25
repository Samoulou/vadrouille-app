import "server-only";

import { JETON_SESSION_MOTIF, PLACE_ID_MOTIF } from "@/contracts/values";
import { fuseauParPosition, paysParCode, villeDuPays } from "@/lib/fuseaux";
import { creerClientVilles, type OptionsClientsGoogle } from "@/server/composition/clients-google";
import { errorNameOf, logEvent, type LogFields, type LogVilleReason } from "@/server/log";
import { cookieAccesValide, empreinteCookieAcces, ouvertureP0, type DependancesAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { reserverVille, type DemandeVille, type LimitesVille, type ResultatVille } from "@/server/usage/neon";
import { periodesDe } from "@/server/usage/periodes";
import { horlogeSysteme, type PortConsommation } from "@/server/usage/port";

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

const SAISIE = { min: 2, max: 80 } as const;
const TEXTE_SUGGESTION_MAX = 300;

/**
 * Limites de la recherche de ville (décision 0129 § 3) : 150 suggestions et 40 choix par jour de quota Google, et
 * 20 actions par cookie d'accès et par minute. Au prix plein (2,83 USD les 1 000 suggestions, 5 USD les 1 000 fiches
 * Essentials), un jour au plafond coûte 0,6245 USD, un mois de 31 jours 19,36 USD : sous le plafond Google de 20 USD par
 * mois de 0027 § 2 même sans tranche gratuite ; dans les tranches gratuites (10 000 par mois chacune), 0 USD.
 */
export const LIMITES_VILLE: LimitesVille = { suggestionsParJour: 150, choixParJour: 40, actionsParMinuteEtCookie: 20 };

export type IssueSuggestions =
  | { readonly statut: "ok"; readonly suggestions: readonly SuggestionVille[] }
  | { readonly statut: "acces" | "indisponible" | "limite" | "limite_jour" | "entree_invalide" };

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
  | { readonly statut: "acces" | "indisponible" | "limite" | "limite_jour" | "entree_invalide" | "pays_inconnu" };

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

/**
 * Diagnostic fermé d'une erreur levée par un client Google : code, code HTTP, nom de classe ; jamais le message.
 * `status` n'existe que sur une `ErreurClientGoogle` née d'une réponse autre que 200 : une fiche introuvable
 * (`ErreurAncrage("place_not_found")`, 404 traduit par le client) n'a pas de `httpStatus`, seulement son code.
 */
function diagnosticGoogle(erreur: unknown): Pick<LogFields, "googleCode" | "httpStatus" | "errorName"> {
  const lu = typeof erreur === "object" && erreur !== null ? (erreur as { code?: unknown; status?: unknown }) : {};
  return {
    ...(typeof lu.code === "string" ? { googleCode: lu.code } : {}),
    ...(typeof lu.status === "number" ? { httpStatus: lu.status } : {}),
    ...(errorNameOf(erreur) !== undefined ? { errorName: errorNameOf(erreur) } : {}),
  };
}

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

function client(dependances: DependancesVilles): ClientVilles {
  const fabrique = dependances.client ?? creerClientVilles;
  const horloge = horlogeSysteme;
  return fabrique({
    usage: portUnAppel(),
    // Aucune nature nouvelle au port de consommation (`NATURES` reste fermé) : comme les actions sans compte, nature
    // `execution` sans exécution ; le plafond persistant est la ligne `ville` réservée avant l'appel.
    contexte: () => ({ nature: "execution", executionId: null, periodes: periodesDe("google", horloge) }),
    plafonds: [],
    horloge,
  });
}

/**
 * Client construit **avant** la réservation (revue du head de4ab92, mineur 16) : la construction lit la clé serveur
 * après la barrière de sortie, sans appel ; clé absente ou sortie refusée, `indisponible` sans consommer d'unité du
 * plafond.
 */
function construire(action: Action, dependances: DependancesVilles): ClientVilles | null {
  try {
    return client(dependances);
  } catch (erreur) {
    journaliserRefus(action, "client", diagnosticGoogle(erreur));
    return null;
  }
}

const texte = (valeur: unknown, max: number): string | null => (typeof valeur === "string" && valeur.length <= max ? valeur : null);

/** Suggestions de villes pour la saisie (Autocomplete (New), `(cities)`, en français, jeton de session). */
export async function suggererVillesEssai(entree: { readonly saisie: unknown; readonly session: unknown }, dependances: DependancesVilles): Promise<IssueSuggestions> {
  const saisie = texte(entree.saisie, 200)?.trim() ?? "";
  const session = texte(entree.session, 36);
  if (saisie.length < SAISIE.min || saisie.length > SAISIE.max || session === null || !JETON_SESSION_MOTIF.test(session)) {
    journaliserRefus("suggestions", "entree_invalide");
    return { statut: "entree_invalide" };
  }
  const ouverte = barriere("suggestions", dependances);
  if ("refus" in ouverte) return { statut: ouverte.refus };
  const places = construire("suggestions", dependances);
  if (places === null) return { statut: "indisponible" };
  const refus = await reserver("suggestions", ouverte.empreinte, dependances);
  if (refus !== null) return { statut: refus };
  try {
    return { statut: "ok", suggestions: await places.suggererVilles(saisie, session) };
  } catch (erreur) {
    journaliserRefus("suggestions", "google_erreur", diagnosticGoogle(erreur));
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
  const entreeValide =
    placeId !== null &&
    PLACE_ID_MOTIF.test(placeId) &&
    session !== null &&
    JETON_SESSION_MOTIF.test(session) &&
    saisie.length >= SAISIE.min &&
    saisie.length <= SAISIE.max;
  if (!entreeValide) {
    journaliserRefus("choix", "entree_invalide");
    return { statut: "entree_invalide" };
  }
  const ouverte = barriere("choix", dependances);
  if ("refus" in ouverte) return { statut: ouverte.refus };
  const places = construire("choix", dependances);
  if (places === null) return { statut: "indisponible" };
  const refus = await reserver("choix", ouverte.empreinte, dependances);
  if (refus !== null) return { statut: refus };
  let fiche;
  try {
    fiche = await places.ficheVille(placeId, session);
  } catch (erreur) {
    journaliserRefus("choix", "google_erreur", diagnosticGoogle(erreur));
    return { statut: "indisponible" };
  }
  const pays = fiche.pays === null ? null : paysParCode(fiche.pays);
  const maison = pays === null ? null : (villeDuPays(saisie, pays.code) ?? (principal === "" ? null : villeDuPays(principal, pays.code)));
  const timeZone = pays === null ? null : (maison?.zone ?? fuseauParPosition(pays.code, fiche.position));
  if (pays === null || timeZone === null) {
    journaliserRefus("choix", "pays_inconnu");
    return { statut: "pays_inconnu" };
  }
  return { statut: "ok", ville: { placeId: fiche.placeId, country: pays.code, timeZone, nomPays: pays.nom, nomMaison: maison?.nom ?? null } };
}
