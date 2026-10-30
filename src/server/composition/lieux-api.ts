import "server-only";

import { creerClientLieux } from "@/server/composition/clients-google";
import { SEUILS_LIEUX_VALIDES } from "@/server/config/lieux";
import { PLAFONDS_USAGE } from "@/server/config/usage";
import { accesReelApi } from "@/server/generation/acces-reel";
import { evaluerBarriere, plafondsDeGenerationPoses, type EtatBarriere } from "@/server/generation/barriere";
import { errorNameOf, logEvent, type LogLieuReason } from "@/server/log";
import { verdictRateLimit } from "@/server/rate-limit";
import { purgerAutocompletion, reserverAutocompletion } from "@/server/villes/compteurs";
import { rechercherLieux, type DependancesRechercheLieux, type PortsRechercheLieux } from "@/server/lieux/recherche";

/**
 * Recherche d'un lieu à soi sur `api` (tâche M5d-1, ticket 939 ; décision 0147 § 3 point 6, § 6.4 et § 12 S1 à S3).
 * **Terminal mince**, sur le modèle de `villes-api.ts` (0141 § 6.1) : le cœur `src/server/lieux/recherche.ts` tient l'ordre
 * d'une action ; ce module ne fournit que les ports de `api` et il est le **seul importateur de `clients-google`** pour ce
 * chemin :
 *
 * - `ouvrir` : **d'abord** la garde des seuils non validés (`SEUILS_LIEUX_VALIDES`, `false` jusqu'à la validation écrite de
 *   Samuel à M1h, Q682), **puis** la barrière B9-TL-8 avec le crochet d'accès de `api` (`accesReelApi`, fermé jusqu'à M1h).
 *   Fermée : `provider_error`, **aucune clé lue, aucun compteur, aucun appel** ;
 * - `fabrique` : `creerClientLieux` (Text Search Pro, masque `places.id,places.displayName,places.shortFormattedAddress`,
 *   sans position) ;
 * - `reserver` : limiteur `lieu-recherche` (5 par minute et par adresse IP, puis 20 par voyage et par 24 heures ; § 6.4
 *   point 1), **puis** compteur global du jour (colonne `lieux` de la table des compteurs quotidiens, migration 0022 ;
 *   `SEUILS_LIEUX.recherches`, § 6.4 point 3) ; une rafale ne consomme donc pas le plafond du jour ;
 * - `apres` : purge des jours échus (module des compteurs de M1f), après tout appel Google tenté ; ne lève jamais ;
 * - `journal` : **une** ligne `lieu.recherche` par action (§ 12 S1 point 5), issue fermée, `info` ou `warn`.
 *
 * Aujourd'hui partout : `provider_error` (motif `seuils_non_valides`), sans clé, sans compteur, sans appel. En CI, les tests
 * injectent la garde, la barrière et le double (`creerRechercheLieuxSimulee`). Jamais journalisés : la requête, la ville,
 * un `placeId`, un texte Google, le voyage, l'organisation, l'adresse IP, la clé HMAC, une clé.
 */

export type DependancesLieuxApi = DependancesRechercheLieux & {
  /** En-têtes de la requête (lus par l'action serveur) : seul l'en-tête de confiance est lu, par le limiteur. */
  readonly headers: Parameters<typeof verdictRateLimit>[0]["headers"];
  /** Tests seulement : seuils validés ou non (défaut : `SEUILS_LIEUX_VALIDES`). */
  readonly seuilsValides?: () => boolean;
  /** Tests seulement : état de la barrière (défaut : `barriereLieuxApi()`, crochet `accesReelApi`). */
  readonly barriere?: () => Promise<EtatBarriere>;
  /** Tests seulement : fabrique du client (défaut : `creerClientLieux`). */
  readonly client?: typeof creerClientLieux;
  /** Tests seulement : limiteur (défaut : `verdictRateLimit`). */
  readonly limiteur?: typeof verdictRateLimit;
  /** Tests seulement : réservation du jour (défaut : `reserverAutocompletion`). */
  readonly reserver?: typeof reserverAutocompletion;
  /** Tests seulement : purge des jours échus (défaut : `purgerAutocompletion`). */
  readonly purger?: typeof purgerAutocompletion;
};

/**
 * Niveaux de `lieu.recherche` (0147 § 12 S1 point 5, comme 0141 § 6.3 point 4) : `info` pour une issue normale ou un refus
 * qu'une personne connectée peut provoquer sans panne du service, `warn` pour une panne ou un défaut de configuration.
 */
export const NIVEAUX_LIEU_API = {
  info: ["ok", "aucun_resultat", "entree_invalide", "non_debloque", "seuils_non_valides", "barriere", "limite", "limite_voyage", "limite_jour"],
  warn: ["client", "compteur_indisponible", "google_erreur", "exception"],
} as const satisfies Readonly<Record<"info" | "warn", readonly LogLieuReason[]>>;
const MOTIFS_INFO: ReadonlySet<LogLieuReason> = new Set<LogLieuReason>(NIVEAUX_LIEU_API.info);

type Details = NonNullable<Parameters<PortsRechercheLieux["journal"]>[1]>;

/** Une ligne `lieu.recherche` : champs fermés seulement (le journal retire toute valeur hors liste). */
function journaliser(motif: LogLieuReason, details: Details = {}): void {
  logEvent("lieu.recherche", { reason: motif, ...details }, MOTIFS_INFO.has(motif) ? "info" : "warn");
}

/** Exception attrapée par l'action serveur : motif `exception`, nom de classe seulement. */
export function journaliserExceptionLieux(erreur: unknown): void {
  const errorName = errorNameOf(erreur);
  journaliser("exception", errorName !== undefined ? { errorName } : {});
}

/**
 * Barrière B9-TL-8 de `api` pour la recherche d'un lieu (même lecture que `barriereApi` de `villes-api.ts`) : plafonds de
 * génération posés et non nuls, crochet `accesReelApi` (jamais surchargeable ici). `surcharges` : tests seulement.
 */
export function barriereLieuxApi(surcharges: Omit<Partial<Parameters<typeof evaluerBarriere>[0]>, "cookieValide"> = {}): Promise<EtatBarriere> {
  const { env, branche, plafondsNonNuls } = surcharges;
  return evaluerBarriere({
    plafondsNonNuls: plafondsNonNuls ?? plafondsDeGenerationPoses(PLAFONDS_USAGE),
    ...(env !== undefined ? { env } : {}),
    ...(branche !== undefined ? { branche } : {}),
    cookieValide: accesReelApi,
  });
}

function ports(dependances: DependancesLieuxApi): PortsRechercheLieux {
  return {
    async ouvrir() {
      const seuilsValides = dependances.seuilsValides ?? (() => SEUILS_LIEUX_VALIDES);
      if (!seuilsValides()) return "seuils_non_valides";
      let etat: EtatBarriere;
      try {
        etat = await (dependances.barriere ?? (() => barriereLieuxApi()))();
      } catch {
        etat = "simulee";
      }
      return etat === "reelle" ? null : "barriere";
    },
    fabrique: (options) => (dependances.client ?? creerClientLieux)(options),
    async reserver(tripId) {
      // Le limiteur passe avant le compteur du jour (§ 6.4) : une rafale ne consomme pas le plafond global.
      const debit = await (dependances.limiteur ?? verdictRateLimit)({ action: "lieu-recherche", headers: dependances.headers, tripId });
      if (!debit.ok) return { refus: debit.kind === "trip" ? "limite_voyage" : "limite" };
      let reservation: Awaited<ReturnType<typeof reserverAutocompletion>>;
      try {
        reservation = await (dependances.reserver ?? reserverAutocompletion)("lieux");
      } catch (erreur) {
        const errorName = errorNameOf(erreur);
        return { refus: "compteur_indisponible", ...(errorName !== undefined ? { errorName } : {}) };
      }
      if (reservation.ok) return null;
      if (reservation.raison === "plafond") return { refus: "limite_jour" };
      return { refus: "compteur_indisponible", ...(reservation.errorName !== undefined ? { errorName: reservation.errorName } : {}) };
    },
    apres: () => (dependances.purger ?? purgerAutocompletion)(),
    journal: (motif, details) => journaliser(motif, details),
  };
}

/** `searchPlaces` de `api` : `PlaceSearchRequest` → `PlaceSearchResult[]` (voir l'en-tête du module et le cœur). */
export function rechercherLieuxApiTerminal(entree: unknown, dependances: DependancesLieuxApi): ReturnType<typeof rechercherLieux> {
  return rechercherLieux(dependances, entree, ports(dependances));
}
