import "server-only";

import { JETON_SESSION_MOTIF, PLACE_ID_MOTIF } from "@/contracts/values";
import type { SuggestionVille, VilleChoisie } from "@/contracts/villes";
import { fuseauParPosition, paysParCode } from "@/lib/fuseaux";
import { errorNameOf, type LogFields } from "@/server/log";
import { periodesDe } from "@/server/usage/periodes";
import { horlogeSysteme, type PortConsommation } from "@/server/usage/port";

/**
 * Cœur de la recherche de ville de l'écran 1 (décision 0141 § 6.1, bloquant 3), commun au site d'essai
 * (`src/server/composition/villes.ts`, décision 0129) et à `api` (`src/server/composition/villes-api.ts`) : **aucune
 * ligne de la recherche Places n'est écrite deux fois**. Ce module tient les contrôles d'entrée, le port de consommation
 * borné à un appel, la construction du client par une fabrique **injectée**, le diagnostic fermé des erreurs Google, la
 * lecture de la fiche (pays et fuseau des tables maison) et **l'ordre** d'une action :
 *
 * entrées revalidées → `ouvrir` (barrière propre à l'adaptateur, avant toute clé) → client construit (clé lue après la
 * barrière de sortie, sans appel ; échec : `client`, aucune unité consommée) → `reserver` (plafond propre à
 * l'adaptateur) → un seul appel Google → `apres` (après tout appel tenté, réussi ou en erreur).
 *
 * Il n'importe ni la fabrique des clients Google, ni `@/server/p0/**`, ni `@/server/usage/neon`, ni le limiteur, la
 * barrière ou les compteurs : tout ce qui est propre à un adaptateur passe par les ports (`PortsRecherche`). Données
 * Google : les suggestions passent au navigateur sans être stockées ; de la fiche, seuls le code du pays (et, sur le site
 * d'essai, la position) sont lus, en mémoire ; le navigateur ne reçoit que des valeurs maison et le `placeId`. Aucune
 * saisie ni donnée Google n'est journalisée : le journal ne reçoit qu'un motif fermé et un diagnostic fermé.
 */

export type ActionVille = "suggestions" | "choix";

/**
 * Formes du client de recherche de ville (`ClientVilles` de `@/grounding/interfaces`), recopiées ici : ce module est
 * atteint par une action serveur, et l'application n'atteint `src/grounding` que par la fabrique commune (test « graphe
 * de l'application », 0081 B9-TL-1). Le contrôle de type de `creerClientVilles` dans chaque terminal les tient égales.
 */
export type ClientVilles = {
  suggererVilles(saisie: string, session: string): Promise<readonly SuggestionVille[]>;
  ficheVille(placeId: string, session: string): Promise<{ readonly placeId: string; readonly pays: string | null; readonly position: { lat: number; lng: number } | null }>;
};

/** Options remises à la fabrique : port borné à un appel, nature `execution` sans exécution, aucun plafond de forfait. */
export type OptionsFabriqueVilles = {
  readonly usage: PortConsommation;
  readonly contexte: () => { readonly nature: "execution"; readonly executionId: null; readonly periodes: ReturnType<typeof periodesDe> };
  readonly plafonds: readonly [];
  readonly horloge: typeof horlogeSysteme;
};

/** Sans ville de la table : fuseau du pays ou du repère (site d'essai, 0129 § 2 point 4), ou refus `hors_table` (`api`, 0141 § 8). */
export type HorsTable = "fuseau" | "refus";

/** Motifs écrits par le cœur ; ceux de la barrière et du plafond sont écrits par les ports eux-mêmes. */
export type MotifCoeur<H extends HorsTable = HorsTable> = "entree_invalide" | "client" | "google_erreur" | "pays_inconnu" | (H extends "refus" ? "hors_table" : never);

/** Diagnostic fermé d'une erreur : code, code HTTP, nom de classe ; jamais le message. */
export type DiagnosticVille = Pick<LogFields, "googleCode" | "httpStatus" | "errorName">;

/**
 * Ports d'un adaptateur (0141 § 6.1 point 2). `R` : statuts de refus propres à l'adaptateur (barrière et plafond).
 */
export type PortsRecherche<R extends string, H extends HorsTable> = {
  /** Barrière propre à l'adaptateur, appelée avant toute construction du client : `null` si elle est ouverte. */
  readonly ouvrir: (action: ActionVille) => Promise<R | null>;
  /** Fabrique du client (`creerClientVilles` passé par le terminal, seul importateur de `clients-google`). */
  readonly fabrique: (options: OptionsFabriqueVilles) => ClientVilles;
  /** Plafond propre à l'adaptateur, appelé après la construction du client : `null` si l'action est accordée. */
  readonly reserver: (action: ActionVille) => Promise<R | null>;
  /** Après tout appel Google tenté (réussi ou en erreur) ; ne lève jamais. */
  readonly apres: (action: ActionVille) => Promise<void>;
  /** Ville de la table de l'adaptateur dans un pays (nom maison et fuseau), ou `null`. */
  readonly villeDeLaTable: (nom: string, codePays: string) => { readonly nom: string; readonly zone: string } | null;
  readonly horsTable: H;
  /** Journal d'un refus du cœur (motif fermé, diagnostic fermé). */
  readonly journal: (action: ActionVille, motif: MotifCoeur<H>, details?: DiagnosticVille) => void;
};

export type IssueSuggestionsCoeur<R extends string> =
  | { readonly statut: "ok"; readonly suggestions: readonly SuggestionVille[] }
  | { readonly statut: R | "entree_invalide" | "indisponible" };

export type IssueChoixCoeur<R extends string, H extends HorsTable> =
  | { readonly statut: "ok"; readonly ville: VilleChoisie }
  | { readonly statut: R | "entree_invalide" | "indisponible" | "pays_inconnu" | (H extends "refus" ? "hors_table" : never) };

const SAISIE = { min: 2, max: 80 } as const;
const TEXTE_SUGGESTION_MAX = 300;

/**
 * Diagnostic fermé d'une erreur levée par un client Google : code, code HTTP, nom de classe ; jamais le message.
 * `status` n'existe que sur une `ErreurClientGoogle` née d'une réponse autre que 200 : une fiche introuvable
 * (`ErreurAncrage("place_not_found")`, 404 traduit par le client) n'a pas de `httpStatus`, seulement son code.
 */
export function diagnosticGoogle(erreur: unknown): DiagnosticVille {
  const lu = typeof erreur === "object" && erreur !== null ? (erreur as { code?: unknown; status?: unknown }) : {};
  const errorName = errorNameOf(erreur);
  return {
    ...(typeof lu.code === "string" ? { googleCode: lu.code } : {}),
    ...(typeof lu.status === "number" ? { httpStatus: lu.status } : {}),
    ...(errorName !== undefined ? { errorName } : {}),
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

/**
 * Client construit **avant** la réservation (revue du head de4ab92, mineur 16) : la construction lit la clé serveur
 * après la barrière de sortie, sans appel ; clé absente ou sortie refusée, `null` sans consommer d'unité du plafond.
 */
function construire<R extends string, H extends HorsTable>(action: ActionVille, ports: PortsRecherche<R, H>): ClientVilles | null {
  const horloge = horlogeSysteme;
  try {
    return ports.fabrique({
      usage: portUnAppel(),
      // Aucune nature nouvelle au port de consommation (`NATURES` reste fermé) : comme les actions sans compte, nature
      // `execution` sans exécution ; le plafond persistant est celui de l'adaptateur, réservé avant l'appel.
      contexte: () => ({ nature: "execution", executionId: null, periodes: periodesDe("google", horloge) }),
      plafonds: [],
      horloge,
    });
  } catch (erreur) {
    ports.journal(action, "client", diagnosticGoogle(erreur));
    return null;
  }
}

/** Port `apres`, gardé : il ne change jamais le résultat de l'action. */
async function apres<R extends string, H extends HorsTable>(action: ActionVille, ports: PortsRecherche<R, H>): Promise<void> {
  try {
    await ports.apres(action);
  } catch {
    // Le port ne lève jamais (purge de `api`) ; une erreur inattendue reste sans effet sur la réponse.
  }
}

const texte = (valeur: unknown, max: number): string | null => (typeof valeur === "string" && valeur.length <= max ? valeur : null);

/** Suggestions de villes pour la saisie (Autocomplete (New), `(cities)`, en français, jeton de session). */
export async function suggererVilles<R extends string, H extends HorsTable>(
  entree: { readonly saisie: unknown; readonly session: unknown },
  ports: PortsRecherche<R, H>,
): Promise<IssueSuggestionsCoeur<R>> {
  const saisie = texte(entree.saisie, 200)?.trim() ?? "";
  const session = texte(entree.session, 36);
  if (saisie.length < SAISIE.min || saisie.length > SAISIE.max || session === null || !JETON_SESSION_MOTIF.test(session)) {
    ports.journal("suggestions", "entree_invalide");
    return { statut: "entree_invalide" };
  }
  const ferme = await ports.ouvrir("suggestions");
  if (ferme !== null) return { statut: ferme };
  const places = construire("suggestions", ports);
  if (places === null) return { statut: "indisponible" };
  const refus = await ports.reserver("suggestions");
  if (refus !== null) return { statut: refus };
  let issue: IssueSuggestionsCoeur<R>;
  try {
    issue = { statut: "ok", suggestions: await places.suggererVilles(saisie, session) };
  } catch (erreur) {
    ports.journal("suggestions", "google_erreur", diagnosticGoogle(erreur));
    issue = { statut: "indisponible" };
  }
  await apres("suggestions", ports);
  return issue;
}

/**
 * Ville choisie : fiche Essentials dans la même session (close la session), puis pays et fuseau des tables maison. Le
 * nom maison est cherché dans la table de l'adaptateur, dans le pays de la fiche, d'après le texte tapé puis le texte
 * principal de la suggestion (comparaison en mémoire seulement : le texte Google n'est jamais rendu ni stocké).
 */
export async function choisirVille<R extends string, H extends HorsTable>(
  entree: { readonly placeId: unknown; readonly session: unknown; readonly saisie: unknown; readonly principal: unknown },
  ports: PortsRecherche<R, H>,
): Promise<IssueChoixCoeur<R, H>> {
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
    ports.journal("choix", "entree_invalide");
    return { statut: "entree_invalide" };
  }
  const ferme = await ports.ouvrir("choix");
  if (ferme !== null) return { statut: ferme };
  const places = construire("choix", ports);
  if (places === null) return { statut: "indisponible" };
  const refus = await ports.reserver("choix");
  if (refus !== null) return { statut: refus };
  let fiche: Awaited<ReturnType<ClientVilles["ficheVille"]>>;
  try {
    fiche = await places.ficheVille(placeId, session);
  } catch (erreur) {
    ports.journal("choix", "google_erreur", diagnosticGoogle(erreur));
    await apres("choix", ports);
    return { statut: "indisponible" };
  }
  await apres("choix", ports);
  return villeDeLaFiche(fiche, saisie, principal, ports);
}

/** Pays, fuseau et nom maison d'une fiche lue (en mémoire seulement). */
function villeDeLaFiche<R extends string, H extends HorsTable>(
  fiche: Awaited<ReturnType<ClientVilles["ficheVille"]>>,
  saisie: string,
  principal: string,
  ports: PortsRecherche<R, H>,
): IssueChoixCoeur<R, H> {
  const pays = fiche.pays === null ? null : paysParCode(fiche.pays);
  if (pays === null) {
    ports.journal("choix", "pays_inconnu");
    return { statut: "pays_inconnu" };
  }
  const maison = ports.villeDeLaTable(saisie, pays.code) ?? (principal === "" ? null : ports.villeDeLaTable(principal, pays.code));
  if (maison === null && ports.horsTable === "refus") {
    // `api` (0141 § 8.2) : ville hors de la table du MVP, aucun nom rendu.
    const horsTable = "hors_table" as MotifCoeur<H> & IssueChoixCoeur<R, H>["statut"];
    ports.journal("choix", horsTable);
    return { statut: horsTable } as IssueChoixCoeur<R, H>;
  }
  const timeZone = maison?.zone ?? (fiche.position === null ? null : fuseauParPosition(pays.code, fiche.position));
  if (timeZone === null) {
    ports.journal("choix", "pays_inconnu");
    return { statut: "pays_inconnu" };
  }
  return { statut: "ok", ville: { placeId: fiche.placeId, country: pays.code, timeZone, nomPays: pays.nom, nomMaison: maison?.nom ?? null } };
}
