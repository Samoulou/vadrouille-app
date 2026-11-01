import "server-only";

import { createHash } from "node:crypto";

import { headers } from "next/headers";

import { destinationColor } from "@/domain/calculs";
import type { HeadersLike } from "@/server/ip";
import { carteDeLaVuePartagee } from "@/server/voyages/carte-partagee";
import { executeurSql, type OrgTransaction } from "@/server/with-org";

import { createDatabase, type Database } from "../../../db/index.ts";
import { sansDetail } from "./erreurs";
import { requeteComptee } from "./limite-vue";

/**
 * Lecture de la vue partagée sur `api` (`RP`, `RPJ` ; spécification M6 § 3.3 ; décision 0157 § 1.4 point 3 et § 2.1
 * point 5 ; décision 0158 § 3 ; ticket 1013, M6a). Appelée par l'adaptateur `api` du partage (`src/adapters/api-share.ts`,
 * branché par `src/instrumentation.ts`), dans le même processus, après la garde et la forme du jeton.
 *
 * 1. **En-tête « compté »** (0157 § 2.1 point 5) : hors de `local` et `ci`, la requête doit porter l'en-tête posé par
 *    `src/proxy.ts` pour ce chemin ; sinon `null` (404 commun) **sans rien lire**. C'est la protection contre une requête
 *    qui n'est pas passée par le proxy (CVE-2025-29927 comprise). **En `local` et `ci`, elle n'existe pas** :
 *    `requeteComptee` admet la requête sans vérifier l'en-tête (postes et CI, sans exposition ; le proxy y compte
 *    quand même). Ces deux valeurs ne sont jamais atteintes sur un déploiement Vercel, où `VERCEL_ENV` est toujours
 *    posé : `resolveServerEnvironment` rend `staging` ou `production` dès que `VERCEL_ENV` vaut `preview` ou
 *    `production` (la plus restrictive des valeurs déclarées l'emporte) ; équivalence éprouvée par
 *    `tests/unit/server/env.test.ts`.
 * 2. **Transaction 1, chemin unique** (0158 § 3 point 1) : sous `vadrouille_app`, sans organisation, en lecture seule,
 *    **toujours la même suite de requêtes**, quel que soit l'état du lien : `resolve_share_link(empreinte)` (qui pose
 *    l'empreinte dans la transaction), `SET LOCAL ROLE vadrouille_share`, lecture de `shared_trip`, puis de
 *    `shared_trip_version`. Jeton inconnu, lien désactivé, expiré, et voyage reverrouillé (les vues rendent zéro ligne
 *    sans droit `tripUnlocked`, 0158 § 2) suivent le même chemin. Aucune lecture d'une table, ni d'`entitlements`
 *    (0158 § 3 point 4), ni de `shared_checklist` (retirée par 0023).
 * 3. **Décision après lecture** (0158 § 3 point 2) : une vue seulement si l'état est `valid` **et** chaque vue rend une
 *    ligne ; sinon `null` (404 commun). La règle de date de 0157 § 1.3 point 2 est appliquée ensuite par l'adaptateur.
 * 4. **Carte** : `carteDeLaVuePartagee` (`src/server/voyages/carte-partagee.ts`), sans aucune position tant que Samuel n'a
 *    pas répondu à Q814 (0157 § 1.4, S7) ; aucune transaction 2, aucun `withSystemOrg`.
 * 5. **Projection champ par champ** de l'instantané déjà filtré par `public.shared_snapshot` : seuls les champs de
 *    `SharedTripSchema` sont recopiés (ni `id`, ni `placeId`, ni `reason`, ni `source`, ni `locked`, ni `commitment`,
 *    ni « Surprends-moi », ni budget) ; l'adaptateur valide ensuite par les schémas stricts. Un trajet de la vue n'a pas
 *    de durée (`Segment.minutes` est recomposé à la lecture depuis Routes, jamais stocké, et aucune relecture n'est faite
 *    pour un visiteur) : `minutes: null`, rendu « durée à confirmer » comme dans la vue de la personne (contrat de
 *    `SharedDayItemSchema`). Un jour sans étape est « en préparation » (règle de `jourSansEtape`, reprise par la lecture du voyage).
 *
 * Aucun journal (`no-console`) : ni jeton, ni empreinte, ni chemin.
 */

/** Suite de requêtes de la transaction 1, dans l'ordre (0158 § 3 point 1) ; le test l'éprouve sur un client simulé. */
export const SQL_TRANSACTION_VUE = [
  "SET TRANSACTION READ ONLY",
  "SELECT state FROM public.resolve_share_link($1::bytea)",
  "SET LOCAL ROLE vadrouille_share",
  `SELECT destination, start_date::text AS start, end_date::text AS "end", travellers_adults AS adults, travellers_children AS children, time_zone FROM public.shared_trip`,
  "SELECT version, snapshot FROM public.shared_trip_version",
] as const;

/** Exécuteur d'une transaction (`executeurSql`). */
export type ExecuteurVue = { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** Transaction 1 : sous `vadrouille_app`, sans `app.organization_id` ni `app.user_id`. */
export type TransactionVue = <T>(fn: (executeur: ExecuteurVue) => Promise<T>) => Promise<T>;

/** Vue lue, avant la validation stricte par l'adaptateur ; `timeZone` sert à la règle de date et ne sort pas du serveur. */
export type VuePartageeLue = {
  readonly trip: unknown;
  readonly maps: unknown;
  readonly timeZone: string;
};

export type DependancesVue = {
  /** **Tests seulement** : transaction sur le client de `vadrouille_app` de `db/index.ts` par défaut. */
  readonly transaction?: TransactionVue;
  /** En-têtes de la requête (`headers()` de Next.js par défaut). */
  readonly entetes?: () => Promise<HeadersLike>;
  /** Vérification de l'en-tête « compté » (`requeteComptee` par défaut). */
  readonly comptee?: (entetes: HeadersLike, chemin: string) => boolean;
};

export function creerTransactionVue(database: Database): TransactionVue {
  return (fn) => database.transaction(async (tx: OrgTransaction) => fn(executeurSql(tx)));
}

let transactionParDefaut: TransactionVue | undefined;
const transactionDuServeur: TransactionVue = (fn) => (transactionParDefaut ??= creerTransactionVue(createDatabase("vadrouille_app")))(fn);

// --- Projection (champ par champ) ----------------------------------------------------------------------------

type Json = Record<string, unknown>;

const objet = (valeur: unknown): Json | null => (typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Json) : null);
const tableau = (valeur: unknown): unknown[] => (Array.isArray(valeur) ? valeur : []);
/** Recopie une valeur scalaire si elle est définie ; sinon aucune clé (la validation stricte tranche). */
const si = (cle: string, valeur: unknown): Json => (valeur === undefined || valeur === null ? {} : { [cle]: valeur });

function faits(valeur: unknown): Json {
  const f = objet(valeur) ?? {};
  return { ...si("durationMinutes", f.durationMinutes), ...si("costPerPerson", f.costPerPerson), ...si("area", f.area) };
}

/** Exceptions de la vue partagée : celles de `SHARED_EXCEPTIONS` seulement (« À réserver » n'est jamais montrée). */
function exceptions(valeur: unknown): unknown[] {
  return tableau(valeur).filter((e) => e === "toConfirm" || e === "unconfirmed");
}

function etape(valeur: unknown, cle: string | null): Json {
  const s = objet(valeur) ?? {};
  return {
    ...si("kind", s.kind),
    ...si("name", s.name),
    ...si("start", s.start),
    ...si("end", s.end),
    facts: faits(s.facts),
    ...(cle === null ? {} : { key: cle }),
    exceptions: exceptions(s.exceptions),
  };
}

function element(valeur: unknown, cles: { rang: number }): Json | null {
  const e = objet(valeur);
  if (e === null) return null;
  switch (e.type) {
    case "terminus":
      return { type: "terminus", ...si("role", e.role), ...si("time", e.time) };
    case "stop":
      cles.rang += 1;
      return { type: "stop", stop: etape(e.stop, String(cles.rang)) };
    case "segment": {
      const segment = objet(e.segment) ?? {};
      return { type: "segment", segment: { ...si("mode", segment.mode), minutes: null, ...si("estimated", segment.estimated) } };
    }
    case "free":
      return { type: "free", ...si("from", e.from), ...si("to", e.to) };
    case "openMeal":
      return { type: "openMeal", ...si("time", e.time), ...si("meal", e.meal) };
    default:
      // Liste blanche (comme `public.shared_line_item`) : tout autre type est retiré.
      return null;
  }
}

function jour(valeur: unknown): Json {
  const j = objet(valeur) ?? {};
  const cles = { rang: 0 };
  const items = tableau(j.items)
    .map((item) => element(item, cles))
    .filter((item): item is Json => item !== null);
  return {
    ...si("index", j.index),
    ...si("date", j.date),
    // Même règle que `jourSansEtape` (`src/domain/jours-planifies.ts`) : un jour sans étape est en préparation.
    generating: !items.some((item) => item.type === "stop"),
    items,
    events: tableau(j.events).map((evenement) => etape(evenement, null)),
  };
}

/** Voyage partagé candidat (validé par `SharedTripSchema` dans l'adaptateur). */
export function projeterVuePartagee(voyage: Json, version: Json): { trip: Json; timeZone: string } {
  // Donnée incohérente de la base : erreur (page d'erreur commune, 500), jamais un 404 (F10-PO-15).
  if (typeof voyage.time_zone !== "string" || voyage.time_zone === "" || typeof voyage.destination !== "string") {
    throw new Error("vue partagée : voyage sans fuseau ni destination");
  }
  const instantane = objet(version.snapshot) ?? {};
  return {
    timeZone: voyage.time_zone,
    trip: {
      destination: voyage.destination,
      destinationColor: destinationColor(voyage.destination),
      start: voyage.start,
      end: voyage.end,
      travellers: { adults: voyage.adults, children: voyage.children },
      days: tableau(instantane.days).map(jour),
    },
  };
}

// --- Lecture ----------------------------------------------------------------------------------------------

export type LectureVue = {
  /** Vue d'un jeton déjà de la forme aléatoire, pour le chemin `/p/…` de la requête ; `null` : 404 commun. */
  lire(token: string, chemin: string): Promise<VuePartageeLue | null>;
};

const enTetesDeLaRequete = async (): Promise<HeadersLike> => headers();

export function creerLectureVue(dependances: DependancesVue = {}): LectureVue {
  const transaction = dependances.transaction ?? transactionDuServeur;
  const entetes = dependances.entetes ?? enTetesDeLaRequete;
  const comptee = dependances.comptee ?? ((h: HeadersLike, chemin: string) => requeteComptee(h, chemin));

  return {
    async lire(token, chemin) {
      if (!comptee(await entetes(), chemin)) return null;
      const empreinte = createHash("sha256").update(token, "utf8").digest();
      const [lectureSeule, resoudre, role, sqlVoyage, sqlVersion] = SQL_TRANSACTION_VUE;
      const lu = await sansDetail(
        () =>
          transaction(async (executeur) => {
            await executeur.query(lectureSeule);
            const etat = (await executeur.query(resoudre, [empreinte])).rows[0]?.state;
            await executeur.query(role);
            const voyages = (await executeur.query(sqlVoyage)).rows;
            const versions = (await executeur.query(sqlVersion)).rows;
            return { etat, voyages, versions };
          }),
        "vue partagée : lecture impossible",
      );
      // 0158 § 3 point 2 : état `valid` et une ligne (exactement) dans chaque vue.
      if (lu.etat !== "valid" || lu.voyages.length !== 1 || lu.versions.length !== 1) return null;
      const [voyage] = lu.voyages;
      const [version] = lu.versions;
      if (voyage === undefined || version === undefined) return null;
      const projete = projeterVuePartagee(voyage, version);
      const jours = (projete.trip.days as Json[]).flatMap((j) => (typeof j.index === "number" ? [{ index: j.index }] : []));
      return { trip: projete.trip, timeZone: projete.timeZone, maps: carteDeLaVuePartagee(jours) };
    },
  };
}
