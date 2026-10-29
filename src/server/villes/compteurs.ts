import "server-only";

import { createDatabase } from "../../../db/index.ts";
import { AUTOCOMPLETE_COUNTS_RETENTION_DAYS, SEUILS_AUTOCOMPLETION } from "@/server/config/villes";
import { errorNameOf, logEvent } from "@/server/log";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";

import prixGoogle from "../../../prototype/config/prix-google.json";

/**
 * Compteurs quotidiens de la recherche de ville de l'écran 1 de `api` (décision 0141 § 1, § 2, § 5 et § 7 ; migration
 * `0021_compteurs_autocompletion`), sur le modèle exact du plafond des e-mails (`src/server/mail/plafond.ts`, 0138 § 11).
 * **Seule façon** de réserver une action de la recherche de `api` : le terminal `src/server/composition/villes-api.ts`
 * l'appelle après le limiteur et avant l'appel Google.
 *
 * - **Stockage** : table globale `autocomplete_daily_counts`, une ligne par jour UTC calculé par la base
 *   (`(now() AT TIME ZONE 'UTC')::date`, § 3), une colonne par action ; aucune saisie, aucune donnée Google, aucune
 *   empreinte, aucun identifiant de session, de personne ni d'organisation. Jamais en mémoire du processus, jamais un
 *   stockage propre à Vercel (0002).
 * - **Rôle et pool** : pool propre de `vadrouille_app` (2 connexions par instance, délais de 3 s), puis `SET LOCAL ROLE
 *   vadrouille_autocomplete_counter` dans une transaction (rôle dédié, S-859-1).
 * - **Seuils indépendants par colonne** (§ 2.1) : `INSERT … ON CONFLICT (day) DO NOTHING`, puis **un seul** `UPDATE` de la
 *   colonne de l'action sous la condition `colonne < seuil` ; le verrou de ligne et la réévaluation de la condition par
 *   Postgres sur la version verrouillée empêchent tout dépassement sous la concurrence ; zéro ligne rendue = refus, rien
 *   d'écrit. Une requête **texte constante par action** : le nom de colonne n'est jamais calculé depuis une entrée.
 * - **Purge** (`purge`, `purgerAutocompletion`) : les jours de plus de 40 jours, dans une transaction distincte,
 *   **après** l'appel Google et seulement si une réservation de cette instance a ouvert la ligne d'un jour nouveau depuis
 *   la dernière purge (indicateur propre à l'instance). Elle ne lève jamais et ne change aucune réservation : son erreur
 *   écrit `ville.purge_failed` (`errorName` seul, `warn`) ; la purge reprend à la prochaine ouverture d'un jour.
 * - **Échec fermé** : seuil absent ou invalide, action hors liste, connexion ou requête en erreur (dont `42P01`, `42501`,
 *   `42704`), compte illisible → `indisponible` ; aucun appel Google ne suit.
 * - **Coûts dérivés** (option A, § 7) : `coutDesCompteurs`, au prix plein de la table commitée, aucune colonne de coût.
 */

/** Actions comptées, une colonne chacune (liste fermée, 0141 § 5.1). */
export const ACTIONS_AUTOCOMPLETION = ["suggestions", "choix"] as const;
export type ActionAutocompletion = (typeof ACTIONS_AUTOCOMPLETION)[number];

/** Client et pool minimaux (`pg.PoolClient`, `pg.Pool`), injectables par les tests. */
export type AutocompleteCounterClient = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(error?: Error | boolean): void;
};
export type AutocompleteCounterPool = { connect(): Promise<AutocompleteCounterClient> };

/** Résultat d'une réservation : accepté avec le compte de la colonne **après** l'incrément, ou refusé (aucune valeur personnelle). */
export type ReservationAutocompletion =
  | { readonly ok: true; readonly compte: number }
  | { readonly ok: false; readonly raison: "plafond" | "indisponible" };

export type AutocompleteCounterOptions = {
  /** Tests seulement : pool injecté (sinon le pool propre de `vadrouille_app`, créé au premier appel). */
  readonly pool?: AutocompleteCounterPool;
  /** Tests seulement : seuils par action (sinon `SEUILS_AUTOCOMPLETION`) ; invalides : échec fermé. */
  readonly seuils?: Readonly<Record<string, unknown>>;
  /** Tests seulement : appelé dans la transaction de purge, avant la suppression (purge en erreur). */
  readonly beforePurge?: () => void | Promise<void>;
};

/** Compteurs : réservation, puis purge des jours échus, à appeler **après** l'appel Google (elle ne lève jamais). */
export type AutocompleteCounter = {
  readonly reserve: (action: ActionAutocompletion) => Promise<ReservationAutocompletion>;
  readonly purge: () => Promise<void>;
};

/** Bornes du pool propre (0141 § 5.2) : 2 connexions, attente et requête de quelques secondes. */
const POOL_COMPTEURS = { max: 2, connectionTimeoutMillis: 3_000, query_timeout: 3_000 } as const;

const ROLE = "SET LOCAL ROLE vadrouille_autocomplete_counter";
const JOUR = "(pg_catalog.now() AT TIME ZONE 'UTC')::date";
const LIGNE_DU_JOUR = `INSERT INTO public.autocomplete_daily_counts (day) VALUES (${JOUR}) ON CONFLICT (day) DO NOTHING RETURNING day`;
/** Une requête par action, texte constant : le nom de colonne n'est jamais calculé à partir d'une entrée. */
const RESERVATIONS: Readonly<Record<ActionAutocompletion, string>> = Object.freeze({
  suggestions: `UPDATE public.autocomplete_daily_counts SET suggestions = suggestions + 1
WHERE day = ${JOUR} AND suggestions < $1::integer
RETURNING suggestions AS compte`,
  choix: `UPDATE public.autocomplete_daily_counts SET choix = choix + 1
WHERE day = ${JOUR} AND choix < $1::integer
RETURNING choix AS compte`,
});
const PURGE = `DELETE FROM public.autocomplete_daily_counts WHERE day < ${JOUR} - $1::integer`;

const PLAFOND: ReservationAutocompletion = Object.freeze({ ok: false, raison: "plafond" });
const INDISPONIBLE: ReservationAutocompletion = Object.freeze({ ok: false, raison: "indisponible" });

const actionAdmise = (action: unknown): action is ActionAutocompletion => (ACTIONS_AUTOCOMPLETION as readonly unknown[]).includes(action);
const seuilValide = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 1;

/** Pool propre de `vadrouille_app` (fabrique gardée de `db/connection.ts`, environnement lu à l'appel). */
const poolParDefaut = (): AutocompleteCounterPool => createDatabase("vadrouille_app", undefined, POOL_COMPTEURS).$client;

async function annuler(client: AutocompleteCounterClient): Promise<void> {
  await client.query("ROLLBACK").catch(() => undefined);
}

export function createAutocompleteCounter(options: AutocompleteCounterOptions = {}): AutocompleteCounter {
  const seuils = options.seuils ?? SEUILS_AUTOCOMPLETION;
  let pool: AutocompleteCounterPool | undefined = options.pool;
  /** Une réservation de cette instance a ouvert la ligne d'un jour nouveau depuis la dernière purge. */
  let purgeDue = false;

  async function purge(): Promise<void> {
    if (!purgeDue) return;
    purgeDue = false;
    let client: AutocompleteCounterClient | undefined;
    try {
      client = await (pool ??= poolParDefaut()).connect();
      await client.query("BEGIN");
      await client.query(ROLE);
      await options.beforePurge?.();
      await client.query(PURGE, [AUTOCOMPLETE_COUNTS_RETENTION_DAYS]);
      await client.query("COMMIT");
      client.release();
    } catch (error) {
      // 0141 § 5.5 : la réservation est déjà validée ; la purge reprendra à la prochaine ouverture d'un jour.
      if (client) {
        await annuler(client);
        client.release(error instanceof Error ? error : true);
      }
      const errorName = errorNameOf(error);
      logEvent("ville.purge_failed", errorName !== undefined ? { errorName } : {}, "warn");
    }
  }

  async function reserve(action: ActionAutocompletion): Promise<ReservationAutocompletion> {
    if (!actionAdmise(action) || !Object.hasOwn(seuils, action)) return INDISPONIBLE;
    const seuil = seuils[action];
    if (!seuilValide(seuil)) return INDISPONIBLE;
    let client: AutocompleteCounterClient | undefined;
    let compte: number | null;
    let jourOuvert: boolean;
    try {
      client = await (pool ??= poolParDefaut()).connect();
      await client.query("BEGIN");
      await client.query(ROLE);
      jourOuvert = (await client.query(LIGNE_DU_JOUR)).rows.length > 0;
      const ligne = (await client.query(RESERVATIONS[action], [seuil])).rows[0] as { compte?: unknown } | undefined;
      compte = ligne === undefined ? null : Number(ligne.compte);
      await client.query("COMMIT");
      client.release();
    } catch (error) {
      if (client) {
        await annuler(client);
        client.release(error instanceof Error ? error : true);
      }
      return INDISPONIBLE;
    }
    if (jourOuvert) purgeDue = true;
    if (compte === null) return PLAFOND;
    // Ligne rendue mais compte illisible : la réservation est validée, l'appel reste refusé (échec fermé).
    if (!Number.isSafeInteger(compte) || compte < 1) return INDISPONIBLE;
    return Object.freeze({ ok: true, compte });
  }

  return Object.freeze({ reserve, purge });
}

let parDefaut: AutocompleteCounter | undefined;

/** Réserve une action dans le seuil du jour (pool propre de `vadrouille_app`, seuils de `src/server/config/villes.ts`). */
export function reserverAutocompletion(action: ActionAutocompletion): Promise<ReservationAutocompletion> {
  return (parDefaut ??= createAutocompleteCounter()).reserve(action);
}

/**
 * Purge des jours échus (instance par défaut), à appeler **après** l'appel Google ; ne lève jamais. Sans réservation de
 * cette instance ouvrant un jour nouveau depuis la dernière purge, ne fait rien (aucune connexion).
 */
export function purgerAutocompletion(): Promise<void> {
  return (parDefaut ??= createAutocompleteCounter()).purge();
}

/** Compteurs lus d'un ou plusieurs jours (somme), pour le coût dérivé. */
export type CompteursAutocompletion = { readonly suggestions: number; readonly choix: number };

/**
 * Coût dérivé des compteurs (option A, 0141 § 7.1), en micro-USD arrondis au-dessus, au **prix plein** de la table
 * commitée (`prototype/config/prix-google.json`), sans tranche gratuite : `suggestions × places_autocomplete_requests +
 * choix × places_details_essentials` (`places_autocomplete_session_usage`, gratuit, n'entre pas). Table illisible ou
 * compteurs invalides : `null`, jamais 0. Aucun consommateur encore (relevé mensuel, § 14).
 */
export function coutDesCompteurs(compteurs: CompteursAutocompletion, table: unknown = prixGoogle): number | null {
  const lue = TablePrixGoogleSchema.safeParse(table);
  if (!lue.success) return null;
  const suggestion = lue.data.skus.places_autocomplete_requests;
  const fiche = lue.data.skus.places_details_essentials;
  if (suggestion === undefined || fiche === undefined) return null;
  const entier = (n: number) => Number.isSafeInteger(n) && n >= 0;
  if (!entier(compteurs.suggestions) || !entier(compteurs.choix)) return null;
  // Prix d'une action arrondi au micro-USD supérieur (comme le site d'essai), puis produit entier : aucun flottant cumulé.
  return compteurs.suggestions * Math.ceil(suggestion.prixPour1000 * 1_000) + compteurs.choix * Math.ceil(fiche.prixPour1000 * 1_000);
}
