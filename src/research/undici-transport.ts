import "server-only";

import { lookup as resoudreDns } from "node:dns/promises";

import { Agent } from "undici";

import type { CoucheHttp, DependancesLecteur, RaisonRefusPage, Resolveur, ReponseHttp } from "@/research/fetch-page";
import { verifierSortie, type CodeRefusSortie } from "@/server/env/egress";

/**
 * Transport réel de la lecture des pages (spécification de P0r1, « P0, suite : exécutions réelles », « Lecture des
 * pages » ; module de capacité réseau, exception nominative de 0031 § 5 ; client proposé par D12) **et de la
 * vérification de statut des sites** proposés par l'IA dans `p0Run` (lot 2a : la spécification P0-programme-par-ia § 11.3 ;
 * décision 0121 § 3.7 ; verdict 0122 § 1 conditions 1, 5 et 13). Injecté dans `fetch-page.ts`, qui garde toute la logique
 * de la garde (validation, redirections, limites, décompression) et reste le seul appelant de cette `CoucheHttp`
 * (`lire` et `creerVerificateurStatut`) ; branché par la composition du mode réel seule (`src/server/composition/p0-reel.ts`,
 * famille `programme()` pour la vérification de statut). Même `Agent` par saut, même méthode `GET` fixe, mêmes trois
 * en-têtes admis pour les deux usages : la vérification de statut n'ajoute ni capacité ni paramètre de méthode.
 *
 * - Résolveur réel : `lookup` de `node:dns/promises` avec `all: true` ; la garde vérifie **toutes** les adresses.
 * - Épinglage : un `Agent` **par saut**, dont `connect.lookup` renvoie l'adresse déjà vérifiée (aucune seconde
 *   résolution) et refuse tout autre nom d'hôte ; `servername` égal au nom d'hôte (TLS et SNI vérifiés sur le nom).
 * - `https:` et port 443 seulement (garde de `fetch-page.ts`) ; aucun en-tête d'identification (ni cookie, ni
 *   `Authorization`, ni clé) : seuls `user-agent`, `accept` et `accept-encoding` partent.
 * - Chaque `Agent` est fermé (`destroy`) à la fin de son saut, succès ou échec (`fermer`, appelé par la garde).
 * - Barrière de sortie : sur un refus de `@/server/env/egress`, le transport refuse chaque page **sans connexion ni
 *   résolution** (`pages_refused`), et le pipeline continue sans pages.
 */

const ENTETES_ADMIS = ["user-agent", "accept", "accept-encoding"] as const;

/** Raison de refus des pages pour chaque code de la barrière (spécification, « Un seul contrat pour les deux usages »). */
export function raisonDeRefus(code: CodeRefusSortie): RaisonRefusPage {
  if (code === "proxy_env_refused") return "proxy_required";
  return code;
}

type Famille = 4 | 6;
type RappelLookup = (erreur: NodeJS.ErrnoException | null, adresse: string | { address: string; family: number }[], famille?: number) => void;

/**
 * `connect.lookup` épinglé (bloquant 8 de la revue du head `d97c72a`) : nom d'hôte différent, erreur ; `all: true`,
 * tableau de la seule adresse vérifiée ; sinon l'adresse et sa famille. Aucun appel à `node:dns`.
 */
export function lookupEpingle(nomHote: string, adresse: string) {
  const famille: Famille = adresse.includes(":") ? 6 : 4;
  return (hostname: string, options: { all?: boolean }, rappel: RappelLookup): void => {
    if (hostname !== nomHote) {
      rappel(new Error("pinned_host_mismatch"), "");
      return;
    }
    if (options.all === true) rappel(null, [{ address: adresse, family: famille }]);
    else rappel(null, adresse, famille);
  };
}

/** En-têtes de réponse, noms en minuscules ; un en-tête répété devient une liste (`a, b`), que la garde refuse. */
function entetesDeReponse(brut: Readonly<Record<string, string | string[] | undefined>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(brut).flatMap(([nom, valeur]) =>
      valeur === undefined ? [] : [[nom.toLowerCase(), Array.isArray(valeur) ? valeur.join(", ") : valeur]],
    ),
  );
}

export type OptionsTransport = {
  readonly environnement?: Readonly<Record<string, string | undefined>>;
  readonly execArgv?: readonly string[];
  /** Résolveur réel par défaut ; un test peut injecter un double qui compte ses appels. */
  readonly resoudre?: Resolveur;
};

const resolveurReel: Resolveur = async (hote) => (await resoudreDns(hote, { all: true, verbatim: true })).map((entree) => entree.address);

export function createUndiciTransport(options: OptionsTransport = {}): DependancesLecteur {
  const sortie = verifierSortie(options.environnement, options.execArgv);
  if (!sortie.ok) {
    const raison = raisonDeRefus(sortie.code);
    return {
      refus: raison,
      resoudre: async () => {
        throw new Error(raison);
      },
      http: async () => {
        throw new Error(raison);
      },
    };
  }

  const http: CoucheHttp = async (requete): Promise<ReponseHttp> => {
    const agent = new Agent({ connect: { lookup: lookupEpingle(requete.nomHote, requete.adresse), servername: requete.nomHote } });
    const fermer = async () => {
      await agent.destroy().catch(() => undefined);
    };
    try {
      const admis: readonly string[] = ENTETES_ADMIS;
      const entetes = Object.fromEntries(Object.entries(requete.entetes).filter(([nom]) => admis.includes(nom)));
      const reponse = await agent.request({
        origin: `https://${requete.nomHote}:${requete.port}`,
        path: requete.chemin,
        method: "GET",
        headers: entetes,
        signal: requete.signal,
      });
      return { statut: reponse.statusCode, entetes: entetesDeReponse(reponse.headers), corps: reponse.body, fermer };
    } catch (erreur) {
      await fermer();
      throw erreur;
    }
  };

  return { resoudre: options.resoudre ?? resolveurReel, http };
}
