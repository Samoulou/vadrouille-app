import "server-only";

import { cookies } from "next/headers";

import type { PaireRelecture, RaisonRelecture, RelecteurTrajets, ReponseRelecture } from "@/adapters/prototype";
import { NOM_COOKIE_ACCES, type DependancesAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { ouvrirGardeRelecture, type GardeRelecture } from "@/server/p0/garde";
import { errorNameOf, logEvent } from "@/server/log";
import { QUOTA_ROUTES_ELEMENTS_PAR_MINUTE, type Forfait } from "@/server/usage/forfait";
import { reserverRelecture, type PoolSql, type ReglesForfait } from "@/server/usage/neon";
import { horlogeSysteme, type Horloge, type Plafond, type PortConsommation } from "@/server/usage/port";
import type { composerRelecture, creerCadenceRelecture } from "@/server/composition/p0-reel";
import { creerRegistreForfait } from "@/server/usage/registre";

/**
 * Relecteur **réel** des durées de trajet des programmes réels (P0r4 de `specs/P0-suite-2.md`, « Relecture Routes » ;
 * décision 0079, qui complète 0074). Branché au démarrage par `src/instrumentation.ts` sur l'adaptateur `prototype`
 * (`brancherLectureProgrammesReels`), appelé une fois par Journée relue.
 *
 * Décision 0092 § 4 : l'adaptateur ne l'appelle que pour les paires **sans temps conservé** (programme écrit avant la
 * migration `0011_trajets_prototype`, ou paire absente) ; toutes conservées, il n'est pas appelé. Il n'écrit jamais
 * les durées qu'il obtient : l'étape finale de `p0Run` écrit les temps de l'exécution, et la source des programmes
 * réels (`src/adapters/prototype-lecture.ts`) conserve ceux d'une relecture réussie (décision 0109).
 *
 * À **chaque** relecture, dans cet ordre, le premier refus l'emportant (refus : `{ ok: false }`, aucun appel Routes ;
 * l'adaptateur rend alors la page sans ces durées, 0092 § 4 point 3, jamais une durée inventée) :
 * 1. **même barrière que le lancement** (exigence 4) : garde du mode réel ouverte (conditions (1) à (7), déploiement
 *    autre que la production) et cookie d'accès valide ; sinon aucune connexion à la base ;
 * 2. **purge** : la dernière purge réussie a moins de 24 h (0046 D16 point 8), lu par la base ; sinon refus ;
 * 3. **réservation** du forfait de relecture (`reserverRelecture`, nature `relecture`, P0r2 ; `relectureDuMode`) : plafond
 *    Google du mois ou enveloppe atteints (`cap_reached`, `envelope_reached` ; levés par la décision 0071 tant qu'elle
 *    tient) : refus `quota_reached`. Aucun seuil Routes par jour (Q330) ;
 * 4. **appels** : le client Routes de la composition (`composerRelecture`), borné par le registre en mémoire du forfait
 *    (aucune ligne par appel en base) et par la **cadence unique du processus** (3 000 éléments par minute, toutes
 *    relectures confondues, `cadenceRelecture`). Une requête de matrice par lieu de départ et par mode, un élément par
 *    trajet distinct (jamais le produit de toutes les origines et destinations). Durées arrondies à la minute supérieure.
 *
 * Les durées sont des **données Google** : rendues à l'adaptateur seulement, jamais stockées par ce module, journalisées ni mises en
 * cache (pages `force-dynamic` : Next.js répond `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`,
 * vérifié par `tests/e2e/lecture-reelle.e2e.spec.ts`). Un refus après la garde écrit `p0.read_unavailable`
 * avec un nom fermé seulement (`PurgeAncienne`, `PlafondAtteint`, `ReservationImpossible`, ou le nom de l'erreur du
 * client : `ErreurClientGoogle`, avec alors son code fermé dans `failureCode`, ticket 826), jamais une durée, un
 * identifiant de lieu ni un message.
 *
 * **Google indisponible** (ticket 826 : 429, 5xx, délai) : seul Routes est appelé à la lecture ; les positions des lieux
 * viennent de `place_coordinates` en base, jamais d'un appel Google (`src/adapters/prototype-lecture.ts`). Un refus de
 * Routes ne rend donc jamais la page illisible : l'adaptateur la sert avec les temps conservés et sans les durées
 * manquantes (0092 § 4 point 3), sans rien écrire.
 */

/** Client Routes tel que la composition le rend (`ClientRoutes` : durées en secondes, `null` sans itinéraire). */
export type ClientMatrice = ReturnType<typeof composerRelecture>["routes"];
/** Cadence par minute des éléments Routes (`creerCadence`), unique par processus par défaut (`cadenceRelecture`). */
export type CadenceRelecture = ReturnType<typeof creerCadenceRelecture>;

/** Instance unique de la cadence (module chargé par `src/instrumentation.ts` seul, une fois par processus). */
let cadenceDuProcessus: Promise<CadenceRelecture> | undefined;

/**
 * Cadence **unique par processus** des relectures Routes (bloquant 2 de la revue du head `e79fbed`) : 3 000 éléments
 * par minute au plus (Q330, `QUOTA_ROUTES_ELEMENTS_PAR_MINUTE`), partagée par toutes les relectures du processus,
 * simultanées comprises. Ce module n'est chargé que par `src/instrumentation.ts` (test d'importateurs de
 * `composition.test.ts`), une fois par processus : le relecteur qu'il crée est gardé par l'état de
 * `prototype-instance.ts`, et toutes les pages appellent ce même relecteur, donc cette même cadence. Créée à la première
 * relecture (composition chargée à la demande).
 */
export function cadenceRelecture(): Promise<CadenceRelecture> {
  cadenceDuProcessus ??= import("@/server/composition/p0-reel").then(({ creerCadenceRelecture }) => creerCadenceRelecture(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE));
  return cadenceDuProcessus;
}

/**
 * Codes de refus qui signifient « plafond atteint » : plafond du mois et enveloppe seulement. `daily_quota_insufficient`
 * n'en fait pas partie : aucun seuil Routes par jour (Q330) ; ce code ne peut venir que d'un forfait au-delà du quota
 * d'une minute (erreur de configuration), traité comme une indisponibilité.
 */
const PLAFONDS_ATTEINTS: ReadonlySet<string> = new Set(["cap_reached", "envelope_reached"]);

/** Dernière purge réussie de moins de 24 h, calculé par la base (0046 D16 point 8) ; aucune purge : faux. */
export const SQL_PURGE_RECENTE = `SELECT COALESCE(pg_catalog.max(purged_at) > pg_catalog.now() - interval '24 hours', false) AS recente
FROM prototype.purges`;

export type DependancesRelecteur = DependancesAcces & {
  /** Cookie `__Host-p0_acces` de la requête courante (par défaut : `cookies()` de Next.js). */
  readonly cookie?: () => Promise<string | undefined>;
  /** Pool `vadrouille_prototype` (par défaut : `poolPrototype()`), obtenu seulement garde ouverte. */
  readonly pool?: () => PoolSql;
  /** Forfait et règles de la relecture (par défaut : `relectureDuMode()` du pont `p0Run`) ; `null` : refus. */
  readonly relecture?: () => Promise<{ readonly forfait: Forfait; readonly regles: ReglesForfait } | null>;
  /** Client Routes d'une relecture (par défaut : `composerRelecture` de la composition du mode réel). */
  readonly routes?: (garde: GardeRelecture, usage: PortConsommation, plafonds: readonly Plafond[]) => Promise<ClientMatrice>;
  /** Cadence des éléments Routes (par défaut : `cadenceRelecture()`, unique par processus, 3 000 éléments par minute). */
  readonly cadence?: () => Promise<CadenceRelecture>;
  readonly horloge?: Horloge;
};

const refus = (raison: RaisonRelecture): ReponseRelecture => ({ ok: false, raison });

async function purgeRecente(pool: PoolSql): Promise<boolean> {
  const client = await pool.connect();
  try {
    return (await client.query(SQL_PURGE_RECENTE)).rows[0]?.recente === true;
  } finally {
    client.release();
  }
}

/** Nom de l'erreur des clients Google (`ErreurClientGoogle` de `src/grounding/enveloppe-google.ts`, non importé ici). */
const NOM_ERREUR_GOOGLE = "ErreurClientGoogle";

/** Code fermé d'une erreur de client (`ErreurClientGoogle.code`), sans jamais lire son message. */
const codeDe = (erreur: unknown): string | undefined => {
  const code = (erreur as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};

/** Plafond du forfait pour les clients (le registre l'applique ; la demande le porte, comme pour une exécution). */
const plafondsDu = (forfait: Forfait): Plafond[] => [
  { portee: "execution", fournisseur: "google", methode: "routes_matrix", maxRequetes: forfait.routesRequetes, maxElements: forfait.routesElements },
];

/**
 * Durées des paires : une requête par (mode, origine), un élément par destination distincte. Chaque requête attend sa
 * place dans la cadence du processus avant de partir (3 000 éléments par minute, toutes relectures confondues).
 */
async function relirePaires(routes: ClientMatrice, cadence: CadenceRelecture, paires: readonly PaireRelecture[]): Promise<number[]> {
  const groupes = new Map<string, { mode: PaireRelecture["mode"]; origine: string; destinations: string[] }>();
  for (const { origine, destination, mode } of paires) {
    const cle = `${mode}\u0000${origine}`;
    const groupe = groupes.get(cle) ?? { mode, origine, destinations: [] };
    if (!groupe.destinations.includes(destination)) groupe.destinations.push(destination);
    groupes.set(cle, groupe);
  }
  const secondes = new Map<string, number | null>();
  await Promise.all(
    [...groupes.values()].map(async ({ mode, origine, destinations }) => {
      await cadence.reserver(destinations.length);
      const reponse = await routes.matrice({ origines: [origine], destinations, mode });
      destinations.forEach((destination, rang) => {
        const valeur = reponse.secondes[0]?.[rang];
        secondes.set(`${mode}\u0000${origine}\u0000${destination}`, typeof valeur === "number" ? valeur : null);
      });
    }),
  );
  return paires.map(({ origine, destination, mode }) => {
    const valeur = secondes.get(`${mode}\u0000${origine}\u0000${destination}`);
    // Aucun itinéraire : jamais une durée inventée ; la relecture échoue.
    if (typeof valeur !== "number" || !Number.isFinite(valeur) || valeur < 0) throw new Error("route_absente");
    return Math.ceil(valeur / 60);
  });
}

export function creerRelecteurReel(dependances: DependancesRelecteur = {}): RelecteurTrajets {
  const horloge = dependances.horloge ?? horlogeSysteme;
  const lireCookie = dependances.cookie ?? (async () => (await cookies()).get(NOM_COOKIE_ACCES)?.value);
  const pool = dependances.pool ?? poolPrototype;
  const relecture =
    dependances.relecture ??
    (async () => {
      const { relectureDuMode } = await import("@/workflows");
      return relectureDuMode();
    });
  const routes =
    dependances.routes ??
    (async (garde: GardeRelecture, usage: PortConsommation, plafonds: readonly Plafond[]) => {
      const { composerRelecture } = await import("@/server/composition/p0-reel");
      return composerRelecture(garde, { usage, plafonds, horloge }).routes;
    });
  const cadence = dependances.cadence ?? cadenceRelecture;

  return {
    async relireJournee(paires) {
      if (paires.length === 0) return { ok: true, minutes: [] };
      let reglage: Awaited<ReturnType<NonNullable<DependancesRelecteur["relecture"]>>> = null;
      let cookie: string | undefined;
      try {
        cookie = await lireCookie();
      } catch {
        // Hors portée de requête (`cookies()` lève) : refus fermé, sans connexion ni journal.
        return refus("unavailable");
      }
      const garde = await ouvrirGardeRelecture({
        env: dependances.env,
        execArgv: dependances.execArgv,
        maintenant: dependances.maintenant,
        cookie,
        async reserver() {
          reglage = await relecture();
          if (reglage === null) return { ok: false, code: "usage_unavailable" };
          const ouvert = pool();
          if (!(await purgeRecente(ouvert))) return { ok: false, code: "purge_stale" };
          return reserverRelecture(ouvert, reglage.forfait, reglage.regles);
        },
      });
      if (!garde.ok) {
        // Garde fermée ou cookie absent : rien n'est journalisé (comme la lecture) ; refus après la garde : un nom fermé.
        if (garde.code === "purge_stale") logEvent("p0.read_unavailable", { errorName: "PurgeAncienne" }, "warn");
        else if (PLAFONDS_ATTEINTS.has(garde.code)) logEvent("p0.read_unavailable", { errorName: "PlafondAtteint" }, "warn");
        else if (garde.code === "usage_unavailable" || garde.code === "daily_quota_insufficient") {
          logEvent("p0.read_unavailable", { errorName: "ReservationImpossible" }, "warn");
        }
        return refus(PLAFONDS_ATTEINTS.has(garde.code) ? "quota_reached" : "unavailable");
      }
      const { forfait } = reglage!;
      try {
        const registre = creerRegistreForfait(forfait, null, horloge);
        const client = await routes(garde.garde, registre, plafondsDu(forfait));
        return { ok: true, minutes: await relirePaires(client, await cadence(), paires) };
      } catch (erreur) {
        const code = codeDe(erreur);
        if (code !== undefined && PLAFONDS_ATTEINTS.has(code)) return refus("quota_reached");
        const errorName = errorNameOf(erreur);
        // Ticket #826 : code fermé de l'erreur du client Google (`upstream_rate_limited` pour un 429, par exemple), dans
        // `failureCode`, admis sur tout événement par la liste fermée du journal (`LOG_STEP_FAILURE_CODES`) ; jamais le
        // message ni le statut HTTP. Aucun code pour une autre erreur. La page est servie sans ces durées.
        const failureCode = errorName === NOM_ERREUR_GOOGLE ? code : undefined;
        logEvent("p0.read_unavailable", { errorName, ...(failureCode === undefined ? {} : { failureCode }) }, "warn");
        return refus("unavailable");
      }
    },
  };
}
