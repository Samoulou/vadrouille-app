import "server-only";

import { cookies } from "next/headers";

import type { PaireRelecture, RaisonRelecture, RelecteurTrajets, ReponseRelecture } from "@/adapters/prototype";
import { NOM_COOKIE_ACCES, type DependancesAcces } from "@/server/p0/acces";
import { poolPrototype } from "@/server/p0/base";
import { ouvrirGardeRelecture, type GardeRelecture } from "@/server/p0/garde";
import { errorNameOf, logEvent } from "@/server/log";
import type { Forfait } from "@/server/usage/forfait";
import { reserverRelecture, type PoolSql, type ReglesForfait } from "@/server/usage/neon";
import { horlogeSysteme, type Horloge, type Plafond, type PortConsommation } from "@/server/usage/port";
import { creerRegistreForfait } from "@/server/usage/registre";

/**
 * Relecteur **réel** des durées de trajet des programmes réels (P0r4 de `specs/P0-suite-2.md`, « Relecture Routes » ;
 * décision 0076, qui complète 0074). Branché au démarrage par `src/instrumentation.ts` sur l'adaptateur `prototype`
 * (`brancherLectureProgrammesReels`), appelé une fois par Journée relue.
 *
 * À **chaque** relecture, dans cet ordre, le premier refus l'emportant (refus : `{ ok: false }`, aucun appel Routes ;
 * l'adaptateur lève alors `RelectureError` et la page affiche l'état d'erreur existant, jamais une durée inventée ni
 * conservée) :
 * 1. **même barrière que le lancement** (exigence 4) : garde du mode réel ouverte (conditions (1) à (7), déploiement
 *    autre que la production) et cookie d'accès valide ; sinon aucune connexion à la base ;
 * 2. **purge** : la dernière purge réussie a moins de 24 h (0046 D16 point 8), lu par la base ; sinon refus ;
 * 3. **réservation** du forfait de relecture (`reserverRelecture`, nature `relecture`, P0r2 ; `relectureDuMode`) : plafond
 *    Google du mois ou enveloppe atteints (`cap_reached`, `envelope_reached` ; levés par la décision 0071 tant qu'elle
 *    tient) : refus `quota_reached`. Aucun seuil Routes par jour (Q330) ;
 * 4. **appels** : le client Routes de la composition (`composerRelecture`), borné par le registre en mémoire du forfait
 *    (aucune ligne par appel en base). Une requête de matrice par lieu de départ et par mode, un élément par trajet
 *    distinct (jamais le produit de toutes les origines et destinations). Durées arrondies à la minute supérieure.
 *
 * Les durées sont des **données Google** : rendues à l'adaptateur seulement, jamais stockées, journalisées ni mises en
 * cache (pages `force-dynamic`, `Cache-Control: private, no-store`). Un refus après la garde écrit `p0.read_unavailable`
 * avec un nom fermé seulement (`PurgeAncienne`, `PlafondAtteint`, `ReservationImpossible`, ou le nom de l'erreur du
 * client : `ErreurClientGoogle`), jamais une durée, un identifiant de lieu ni un message.
 */

/** Une requête de matrice : origines, destinations et mode, comme `RequeteMatrice` de `src/grounding`. */
type RequeteMatrice = { origines: string[]; destinations: string[]; mode: PaireRelecture["mode"] };
/** Client Routes tel que la composition le rend (durées en secondes, `null` sans itinéraire). */
export type ClientMatrice = { matrice(requete: RequeteMatrice): Promise<{ secondes: (number | null)[][] }> };

/** Codes de refus de la réservation qui signifient « plafond atteint » (jamais un seuil Routes par jour, Q330). */
const PLAFONDS_ATTEINTS: ReadonlySet<string> = new Set(["cap_reached", "envelope_reached", "daily_quota_insufficient"]);

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

/** Code fermé d'une erreur de client (`ErreurClientGoogle.code`), sans jamais lire son message. */
const codeDe = (erreur: unknown): string | undefined => {
  const code = (erreur as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
};

/** Plafond du forfait pour les clients (le registre l'applique ; la demande le porte, comme pour une exécution). */
const plafondsDu = (forfait: Forfait): Plafond[] => [
  { portee: "execution", fournisseur: "google", methode: "routes_matrix", maxRequetes: forfait.routesRequetes, maxElements: forfait.routesElements },
];

/** Durées des paires : une requête par (mode, origine), un élément par destination distincte. */
async function relirePaires(routes: ClientMatrice, paires: readonly PaireRelecture[]): Promise<number[]> {
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

  return {
    async relireJournee(paires) {
      if (paires.length === 0) return { ok: true, minutes: [] };
      let reglage: Awaited<ReturnType<NonNullable<DependancesRelecteur["relecture"]>>> = null;
      const garde = await ouvrirGardeRelecture({
        env: dependances.env,
        execArgv: dependances.execArgv,
        maintenant: dependances.maintenant,
        cookie: await lireCookie(),
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
        else if (garde.code === "usage_unavailable") logEvent("p0.read_unavailable", { errorName: "ReservationImpossible" }, "warn");
        return refus(PLAFONDS_ATTEINTS.has(garde.code) ? "quota_reached" : "unavailable");
      }
      const { forfait } = reglage!;
      try {
        const registre = creerRegistreForfait(forfait, null, horloge);
        const client = await routes(garde.garde, registre, plafondsDu(forfait));
        return { ok: true, minutes: await relirePaires(client, paires) };
      } catch (erreur) {
        const code = codeDe(erreur);
        if (code !== undefined && PLAFONDS_ATTEINTS.has(code)) return refus("quota_reached");
        logEvent("p0.read_unavailable", { errorName: errorNameOf(erreur) }, "warn");
        return refus("unavailable");
      }
    },
  };
}
