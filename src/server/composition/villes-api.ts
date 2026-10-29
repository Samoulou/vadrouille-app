import "server-only";

import type { IssueChoixApi, IssueSuggestionsApi } from "@/contracts/villes";
import { villeMvpDuPays } from "@/lib/fuseaux";
import { creerClientVilles } from "@/server/composition/clients-google";
import { PLAFONDS_USAGE } from "@/server/config/usage";
import { SEUILS_AUTOCOMPLETION_VALIDES } from "@/server/config/villes";
import { accesReelApi } from "@/server/generation/acces-reel";
import { evaluerBarriere, plafondsDeGenerationPoses, type EtatBarriere } from "@/server/generation/barriere";
import { errorNameOf, logEvent } from "@/server/log";
import { checkRateLimit } from "@/server/rate-limit";
import { purgerAutocompletion, reserverAutocompletion } from "@/server/villes/compteurs";
import { choisirVille, suggererVilles, type PortsRecherche } from "@/server/villes/recherche";

/**
 * Recherche de ville de l'écran 1 de `api` (décision 0141 ; plan du MVP, ligne M1f). **Terminal mince** : le cœur commun
 * `src/server/villes/recherche.ts` tient l'ordre d'une action ; ce module ne fournit que les ports de `api` :
 *
 * - `ouvrir` : **d'abord** la garde des seuils non validés (`SEUILS_AUTOCOMPLETION_VALIDES`, § 2.3 : `false` jusqu'à la
 *   validation écrite de Samuel à M1h), **puis** la barrière B9-TL-8 avec le crochet d'accès de `api` (`accesReelApi`,
 *   fermé jusqu'à M1h, § 6.2). Fermée : `indisponible`, **aucune clé lue, aucune connexion à la base, aucun appel** ;
 * - `fabrique` : `creerClientVilles` avec la fiche sans position (masque `id,addressComponents`, § 6.3 point 3) ;
 * - `reserver` : limiteur `ville-recherche` par adresse IP (§ 4 : `limite`), **puis** compteur du jour
 *   (table des compteurs quotidiens de la migration 0021, § 5 : `limite_jour` ou, en échec fermé, `indisponible`) ;
 * - `apres` : purge des jours échus, après tout appel Google tenté (§ 5.5), ne lève jamais ;
 * - table des **62 villes du MVP** (`villeMvpDuPays`, § 8.2) : hors de la table, `hors_table` ;
 * - journal `ville.refusee`, motifs fermés, `info` pour ce qu'un visiteur anonyme peut provoquer, `warn` pour une panne.
 *
 * Rien du chemin d'essai n'entre ici (plan, § 0.2 point 2) : ni `@/server/p0/**`, ni `poolPrototype`, ni `reserverVille`.
 * Jamais journalisés : la saisie, un `placeId`, un texte Google, l'adresse IP, la clé HMAC, une clé.
 */

type Action = "suggestions" | "choix";
type RefusApi = "indisponible" | "limite" | "limite_jour";
type Ports = PortsRecherche<RefusApi, "refus">;
type Motif = Parameters<Ports["journal"]>[1] | "seuils_non_valides" | "barriere" | "limite" | "limite_jour" | "compteur_indisponible" | "exception";
type Details = NonNullable<Parameters<Ports["journal"]>[2]>;

export type DependancesVillesApi = {
  /** En-têtes de la requête (lus par l'action serveur) : seul l'en-tête de confiance est lu, par le limiteur. */
  readonly headers: Parameters<typeof checkRateLimit>[0]["headers"];
  /** Tests seulement : seuils validés ou non (défaut : `SEUILS_AUTOCOMPLETION_VALIDES`, § 2.3). */
  readonly seuilsValides?: () => boolean;
  /** Tests seulement : état de la barrière (défaut : `barriereApi()`, crochet `accesReelApi`). */
  readonly barriere?: () => Promise<EtatBarriere>;
  /** Tests seulement : fabrique du client (défaut : `creerClientVilles`, toujours appelée avec `{ position: false }`). */
  readonly client?: typeof creerClientVilles;
  /** Tests seulement : limiteur (défaut : `checkRateLimit`). */
  readonly limiteur?: typeof checkRateLimit;
  /** Tests seulement : réservation du jour (défaut : `reserverAutocompletion`). */
  readonly reserver?: typeof reserverAutocompletion;
  /** Tests seulement : purge des jours échus (défaut : `purgerAutocompletion`). */
  readonly purger?: typeof purgerAutocompletion;
};

/**
 * Niveaux de `ville.refusee` (0141 § 6.3 point 4, mineur 4) : `info` pour ce qu'un visiteur anonyme peut provoquer en
 * rafale sans panne du service, `warn` pour une panne ou un défaut de configuration. Écart assumé avec 0131 (`limite` et
 * `limite_jour` en `warn` sur le site d'essai, qui est derrière un code d'accès).
 */
export const NIVEAUX_VILLE_API = {
  info: ["entree_invalide", "seuils_non_valides", "barriere", "limite", "limite_jour", "pays_inconnu", "hors_table"],
  warn: ["client", "compteur_indisponible", "google_erreur", "exception"],
} as const satisfies Readonly<Record<"info" | "warn", readonly Motif[]>>;
const MOTIFS_INFO: ReadonlySet<Motif> = new Set<Motif>(NIVEAUX_VILLE_API.info);

/** Journal d'un refus : `ville.refusee`, champs fermés seulement (le journal retire toute valeur hors liste). */
function journaliser(action: Action, motif: Motif, details: Details = {}): void {
  logEvent("ville.refusee", { reason: motif, action, ...details }, MOTIFS_INFO.has(motif) ? "info" : "warn");
}

/** Exception attrapée par l'action serveur : motif `exception`, nom de classe seulement. */
export function journaliserExceptionApi(action: Action, erreur: unknown): void {
  const errorName = errorNameOf(erreur);
  journaliser(action, "exception", errorName !== undefined ? { errorName } : {});
}

/**
 * Barrière B9-TL-8 de `api` (0141 § 6.2 point 2) : plafonds de génération posés et non nuls, crochet `accesReelApi`.
 * `surcharges` : tests seulement (environnement, branche, plafonds) ; le crochet reste celui-ci sauf surcharge explicite.
 */
export function barriereApi(surcharges: Partial<Parameters<typeof evaluerBarriere>[0]> = {}): Promise<EtatBarriere> {
  return evaluerBarriere({ plafondsNonNuls: plafondsDeGenerationPoses(PLAFONDS_USAGE), cookieValide: accesReelApi, ...surcharges });
}

/** Seuils validés **puis** barrière réelle ; toute erreur de la barrière la ferme. */
async function ouverte(dependances: Pick<DependancesVillesApi, "seuilsValides" | "barriere">): Promise<"seuils_non_valides" | "barriere" | null> {
  const seuilsValides = dependances.seuilsValides ?? (() => SEUILS_AUTOCOMPLETION_VALIDES);
  if (!seuilsValides()) return "seuils_non_valides";
  let etat: EtatBarriere;
  try {
    etat = await (dependances.barriere ?? (() => barriereApi()))();
  } catch {
    etat = "simulee";
  }
  return etat === "reelle" ? null : "barriere";
}

/**
 * La recherche de `api` peut-elle servir (0141 § 6.4) ? Même lecture que le port `ouvrir` : seuils validés, puis barrière
 * réelle. Lue par la page de l'écran 1 (avec `isApiAdapter()`), qui n'importe ni la barrière, ni le crochet, ni la
 * configuration. Aucun journal, aucune clé, aucune connexion.
 */
export async function rechercheVilleApiOuverte(dependances: Pick<DependancesVillesApi, "seuilsValides" | "barriere"> = {}): Promise<boolean> {
  return (await ouverte(dependances)) === null;
}

function ports(dependances: DependancesVillesApi): Ports {
  return {
    async ouvrir(action) {
      const motif = await ouverte(dependances);
      if (motif === null) return null;
      journaliser(action, motif);
      return "indisponible";
    },
    fabrique: (options) => (dependances.client ?? creerClientVilles)(options, { position: false }),
    async reserver(action) {
      // Le limiteur passe avant la réservation du jour (§ 4.4) : une rafale ne consomme pas le plafond du jour.
      const debit = await (dependances.limiteur ?? checkRateLimit)({ action: "ville-recherche", headers: dependances.headers });
      if (!debit.ok) {
        journaliser(action, "limite");
        return "limite";
      }
      let reservation: Awaited<ReturnType<typeof reserverAutocompletion>>;
      try {
        reservation = await (dependances.reserver ?? reserverAutocompletion)(action);
      } catch (erreur) {
        const errorName = errorNameOf(erreur);
        journaliser(action, "compteur_indisponible", errorName !== undefined ? { errorName } : {});
        return "indisponible";
      }
      if (reservation.ok) return null;
      if (reservation.raison === "plafond") {
        journaliser(action, "limite_jour");
        return "limite_jour";
      }
      journaliser(action, "compteur_indisponible");
      return "indisponible";
    },
    apres: () => (dependances.purger ?? purgerAutocompletion)(),
    villeDeLaTable: villeMvpDuPays,
    horsTable: "refus",
    journal: (action, motif, details) => journaliser(action, motif, details),
  };
}

/** Suggestions de villes pour la saisie de la destination (écran 1 de `api`). */
export async function suggererVillesApiTerminal(entree: { readonly saisie: unknown; readonly session: unknown }, dependances: DependancesVillesApi): Promise<IssueSuggestionsApi> {
  return suggererVilles(entree, ports(dependances));
}

/** Ville choisie (écran 1 de `api`) : une des 62 villes du MVP dans le pays de la fiche, sinon `hors_table`. */
export async function choisirVilleApiTerminal(
  entree: { readonly placeId: unknown; readonly session: unknown; readonly saisie: unknown; readonly principal: unknown },
  dependances: DependancesVillesApi,
): Promise<IssueChoixApi> {
  return choisirVille(entree, ports(dependances));
}
