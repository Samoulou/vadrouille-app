import "server-only";

import type { PlafondsUsage } from "@/server/config/usage";
import type { TablePrixGoogle } from "@/server/usage/cout-google";
import {
  forfaitAction,
  forfaitExecution,
  forfaitRelecture,
  lignesDuForfait,
  refusDuForfait,
  refusParOrganisation,
  type Forfait,
  type SkusForfait,
  type SommesForfaits,
} from "@/server/usage/forfait";
import type { PoolSql, ResultatRequeteSql } from "@/server/usage/neon";
import { DELAI_PORT_MS, type CodeRefusUsage, type Horloge, type Plafond } from "@/server/usage/port";

/**
 * Réservation du **forfait** d'une génération, d'une relecture ou d'une action sans compte dans `usage_ledger`
 * (spécification B7, B7c points 1 et 3, « Consommation et plafonds » ; décision 0083, qui tranche B7-TL-6 et B7-TL-9 ;
 * décision 0081, B9-TL-4, pour B7-TL-10). Seul module qui écrit `usage_ledger` ; aucune implémentation du port n'y
 * écrit (0083 § 1).
 *
 * Deux chemins, une même séquence (0083 § 2) :
 * - **génération ou relecture** (`reserverForfait`) : dans la transaction ouverte par **`withOrg`** (B3b) avec le
 *   contexte de la génération (organisation et utilisateur de la génération, jamais ceux du navigateur), que la
 *   composition passe sous la forme d'une `TransactionOrganisation` ; le module vérifie que l'organisation du contexte
 *   est celle de la demande ;
 * - **action sans compte** (`reserverAction`) : l'organisation technique n'a aucun membre, donc aucun utilisateur pour
 *   `withOrg` (0081 B9-TL-4 point 2) ; la transaction est ouverte sur le pool `vadrouille_app` et le contexte posé par
 *   paramètre lié (`set_config('app.organization_id', …, true)`), comme `src/server/usage/neon.ts` pour
 *   `org_prototype`.
 *
 * Séquence, dans **une** transaction du rôle `vadrouille_app` :
 * 1. délai de requête de la base borné à `DELAI_PORT_MS` ; organisation du contexte égale à celle de la demande ;
 * 2. verrou consultatif **global** (`CLE_VERROU_USAGE`) : les sommes comparées sont globales (une clé de fournisseur
 *    pour toutes les organisations), deux réservations simultanées sont sérialisées ;
 * 3. **reprise** (0083 § 4) : si des lignes existent déjà pour cette `generationRunId` (reprise d'étape du Workflow
 *    SDK), elles doivent être exactement celles du forfait : la réservation est alors rendue telle quelle, sans
 *    nouvelle écriture ni nouvelle comparaison ; différentes, `usage_unavailable` ;
 * 4. sommes des lignes de forfait par `public.usage_forfait_totals()` (migration 0010, fonction en lecture seule
 *    `SECURITY DEFINER`, 0083 § 3 : sommes globales et somme du jour de la seule organisation du contexte ; aucune
 *    ligne rendue) ;
 * 5. comparaison par `refusDuForfait` (quota du jour Google, enveloppe, mois ; `forfait.ts` de P0r2, réutilisé) puis
 *    par `refusParOrganisation` (plafond par organisation et par jour, ou global quotidien des actions sans compte) ;
 *    un refus annule la transaction **avant tout appel** ;
 * 6. écriture d'**une** ligne par méthode du forfait (`lignesDuForfait`, B7-TL-9 : `step` = `forfait`), en ajout
 *    seulement.
 * Toute erreur, ou une base muette au-delà de `DELAI_PORT_MS` (horloge injectée), rend `usage_unavailable` (échec
 * fermé) : aucun registre n'est rendu, donc aucun appel. Une transaction qui aboutirait après ce délai compterait un
 * forfait sans appel : la consommation est alors surestimée, jamais sous-estimée.
 *
 * Les appels passent ensuite par le registre **en mémoire** de P0r2 (`creerRegistreForfait(forfait, executionId,
 * horloge)`, `registre.ts`, repris tel quel, B7-TL-9), borné par ce forfait, avec les plafonds de `plafonds` ; rien
 * n'est écrit par appel. Le module n'importe ni `pg` ni `withOrg` : il reçoit la transaction de `withOrg` ou le pool
 * du rôle `vadrouille_app` par la composition (B9, B8).
 */

/** Organisation technique des actions sans compte (0081 B9-TL-4 point 1), créée par la migration 0010. */
export const ORGANISATION_ACTIONS_SANS_COMPTE = "5e1f0000-0000-4000-8000-000000000003";

/** Uuid fixe d'`org_prototype` (0046 D15 point 4) : le MVP n'y réserve jamais rien. */
const ORGANISATION_PROTOTYPE = "5e1f0000-0000-4000-8000-000000000001";

/** Clé du verrou consultatif des forfaits du MVP (« 5e1f0003 »), distincte de celle du prototype (`CLE_VERROU_FORFAIT`). */
export const CLE_VERROU_USAGE = 0x5e1f0003;

/** Profils d'un forfait de génération (B7-PO-5) et de relecture (B8-TL-4). */
export const PROFILS_FORFAIT = ["apercu", "complet", "mini", "relecture"] as const;
export type ProfilForfait = (typeof PROFILS_FORFAIT)[number];

/** Actions sans compte (écrans 2 et 3 ; B7-TL-10). */
export const ACTIONS_SANS_COMPTE = ["structureBrief", "suggestLodging"] as const;
export type ActionSansCompte = (typeof ACTIONS_SANS_COMPTE)[number];

/** Règles d'une réservation : plafonds (configuration), table de prix Google, horloge du délai du port. */
export type ReglesUsage = { readonly plafonds: PlafondsUsage; readonly table: TablePrixGoogle; readonly horloge: Horloge };

export type DemandeForfait = {
  /** Organisation de la génération (lue avec la génération, jamais reçue du navigateur). */
  readonly organisationId: string;
  readonly tripId: string | null;
  /** Génération couverte ; nulle pour une relecture. Sert d'identifiant d'exécution au registre. */
  readonly generationRunId: string | null;
  readonly profil: ProfilForfait;
};

/**
 * Forfait réservé : à passer à `creerRegistreForfait(forfait, executionId, horloge)` ; `plafonds` sont ceux des
 * demandes des clients (portée `execution`, une borne par méthode).
 */
export type ForfaitReserve = { readonly ok: true; readonly forfait: Forfait; readonly executionId: string | null; readonly plafonds: readonly Plafond[] };
export type ResultatForfait = ForfaitReserve | { readonly ok: false; readonly code: CodeRefusUsage };

/** Client d'une transaction déjà ouverte (forme de `ClientSql` sans `release`, comme `ExecuteurPositions`). */
export type ExecuteurUsage = { query(texte: string, valeurs?: readonly unknown[]): Promise<ResultatRequeteSql> };

/**
 * Transaction d'une génération, ouverte par la composition avec **`withOrg`** (contexte de la génération) :
 * `(fn) => withOrg({ organizationId, userId }, (tx) => fn(executeurSql(tx)))` (`src/server/with-org.ts`). Une erreur
 * levée par `fn` annule la transaction.
 */
export type TransactionOrganisation = <T>(fn: (executeur: ExecuteurUsage) => Promise<T>) => Promise<T>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (valeur: unknown): valeur is string => typeof valeur === "string" && UUID.test(valeur);

function skusDe(plafonds: PlafondsUsage): SkusForfait {
  return { textSearch: plafonds.skus.textSearch, details: plafonds.skus.details, matrice: plafonds.skus.matrice };
}

/** Forfait d'un profil : fonction de la configuration seule (B7-TL-9). */
export function forfaitDuProfil(plafonds: PlafondsUsage, table: TablePrixGoogle, profil: ProfilForfait): Forfait {
  if (profil === "relecture") return forfaitRelecture(table, skusDe(plafonds), plafonds.relecture);
  const p = plafonds.generations[profil];
  return forfaitExecution(table, skusDe(plafonds), p, p.coutModelesMicros);
}

/** Forfait d'une action sans compte (0081 B9-TL-4 point 3). */
export function forfaitDeLAction(plafonds: PlafondsUsage, table: TablePrixGoogle, action: ActionSansCompte): Forfait {
  const p = plafonds.actions[action];
  return forfaitAction(table, skusDe(plafonds), { coutModelesMicros: p.coutModelesMicros, placesTextSearch: "placesTextSearch" in p ? p.placesTextSearch : 0 });
}

/**
 * Plafonds des demandes des clients, dérivés du forfait (spécification, « Consommation et plafonds » point 4) :
 * portée `execution`, une borne par méthode. Le registre borne déjà par le forfait ; ces plafonds sont ceux que la
 * composition passe aux clients à leur création.
 */
export function plafondsDuForfait(forfait: Forfait): Plafond[] {
  const plafonds: Plafond[] = [];
  if (forfait.coutModelesMicros !== null) plafonds.push({ portee: "execution", fournisseur: "modeles", methode: "chat", maxCoutMicros: forfait.coutModelesMicros });
  plafonds.push(
    { portee: "execution", fournisseur: "google", methode: "places_text_search", maxRequetes: forfait.textSearchRequetes },
    { portee: "execution", fournisseur: "google", methode: "places_details", maxRequetes: forfait.placeDetailsRequetes },
    { portee: "execution", fournisseur: "google", methode: "routes_matrix", maxRequetes: forfait.routesRequetes, maxElements: forfait.routesElements },
  );
  return plafonds;
}

const SQL_SOMMES = `SELECT org_jour_micros, jour_text_search, jour_place_details, mois_google_micros, enveloppe_google_micros,
  mois_modeles_micros, enveloppe_modeles_micros FROM public.usage_forfait_totals()`;

const SQL_INSERER = `INSERT INTO public.usage_ledger (organization_id, trip_id, generation_run_id, step, provider, sku, units, cost_estimate_micros)
SELECT $1::uuid, $2::uuid, $3::uuid, l.step, l.provider, l.sku, l.units, l.cost
FROM ROWS FROM (pg_catalog.unnest($4::text[]), pg_catalog.unnest($5::text[]), pg_catalog.unnest($6::text[]),
  pg_catalog.unnest($7::bigint[]), pg_catalog.unnest($8::bigint[])) AS l(step, provider, sku, units, cost)`;

const nombre = (valeur: unknown): number => {
  const n = typeof valeur === "string" ? Number(valeur) : typeof valeur === "number" ? valeur : Number.NaN;
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("usage: somme illisible");
  return n;
};

/**
 * Sommes lues : quota du jour Google par méthode (jour du Pacifique), mois Google (Pacifique) et des modèles (UTC),
 * enveloppes ; Routes est compté en éléments (Q330), sans seuil du jour : ses requêtes ne sont pas sommées.
 */
function lireSommes(ligne: Record<string, unknown> | undefined): { sommes: SommesForfaits; orgJourMicros: number } {
  if (ligne === undefined) throw new Error("usage: sommes absentes");
  return {
    orgJourMicros: nombre(ligne.org_jour_micros),
    sommes: {
      jour: { textSearchRequetes: nombre(ligne.jour_text_search), placeDetailsRequetes: nombre(ligne.jour_place_details), routesRequetes: 0, routesElements: 0 },
      moisGoogleMicros: nombre(ligne.mois_google_micros),
      enveloppeGoogleMicros: nombre(ligne.enveloppe_google_micros),
      moisModelesMicros: nombre(ligne.mois_modeles_micros),
      enveloppeModelesMicros: nombre(ligne.enveloppe_modeles_micros),
    },
  };
}

type Ecriture = {
  readonly organisationId: string;
  readonly tripId: string | null;
  readonly generationRunId: string | null;
  readonly forfait: Forfait;
  readonly plafondJourMicros: number;
};

/** Refus d'un plafond : annule la transaction (lancé dans `fn`), rendu comme code fermé. */
class RefusUsage extends Error {
  override name = "RefusUsage";

  constructor(readonly code: CodeRefusUsage) {
    super("usage: refus");
  }
}

const SQL_EXISTANTES = `SELECT provider, sku, units, cost_estimate_micros FROM public.usage_ledger WHERE generation_run_id = $1::uuid`;

const empreinte = (provider: unknown, sku: unknown, units: unknown, cout: unknown) => `${String(provider)}|${String(sku)}|${String(units)}|${String(cout)}`;

/**
 * Séquence de l'en-tête (points 1 à 6), dans une transaction déjà ouverte, contexte d'organisation posé. Rend sans
 * erreur si le forfait est écrit ou déjà écrit à l'identique (reprise) ; lève `RefusUsage` sur un plafond, une autre
 * erreur sinon.
 */
async function sequence(executeur: ExecuteurUsage, ecriture: Ecriture, regles: ReglesUsage): Promise<void> {
  const { plafonds, table } = regles;
  const lignes = lignesDuForfait(table, skusDe(plafonds), plafonds.skus.modeles, ecriture.forfait);
  const contexte = await executeur.query("SELECT pg_catalog.set_config('statement_timeout', $1, true), public.app_current_org()::text AS org", [String(DELAI_PORT_MS)]);
  const org = contexte.rows[0]?.org;
  if (typeof org !== "string" || org.toLowerCase() !== ecriture.organisationId.toLowerCase()) throw new Error("usage: contexte d'organisation inattendu");
  await executeur.query("SELECT pg_catalog.pg_advisory_xact_lock($1)", [CLE_VERROU_USAGE]);
  if (ecriture.generationRunId !== null) {
    const existantes = (await executeur.query(SQL_EXISTANTES, [ecriture.generationRunId])).rows;
    if (existantes.length > 0) {
      const lues = existantes.map((l) => empreinte(l.provider, l.sku, l.units, l.cost_estimate_micros)).sort();
      const attendues = lignes.map((l) => empreinte(l.provider, l.sku, l.units, l.costEstimateMicros)).sort();
      if (lues.length === attendues.length && lues.every((v, i) => v === attendues[i])) return;
      throw new Error("usage: forfait déjà réservé, différent");
    }
  }
  const { sommes, orgJourMicros } = lireSommes((await executeur.query(SQL_SOMMES)).rows[0]);
  const refus =
    refusDuForfait(sommes, ecriture.forfait, plafonds.limites, "elements") ?? refusParOrganisation(orgJourMicros, ecriture.forfait, ecriture.plafondJourMicros);
  if (refus !== null) throw new RefusUsage(refus);
  await executeur.query(SQL_INSERER, [
    ecriture.organisationId,
    ecriture.tripId,
    ecriture.generationRunId,
    lignes.map((l) => l.step),
    lignes.map((l) => l.provider),
    lignes.map((l) => l.sku),
    lignes.map((l) => l.units),
    lignes.map((l) => l.costEstimateMicros),
  ]);
}

/**
 * Transaction sur le pool brut (actions sans compte seulement, 0083 § 2) : contexte posé par paramètre lié. Une
 * connexion en erreur est rendue au pool avec l'erreur (`release(erreur)`), qui la détruit (revue de la PR #454,
 * mineur 6) ; un refus de plafond la rend saine.
 */
function transactionBrute(pool: PoolSql, organisationId: string): TransactionOrganisation {
  return async (fn) => {
    const client = await pool.connect();
    let casse: Error | undefined;
    try {
      await client.query("BEGIN");
      try {
        await client.query("SELECT pg_catalog.set_config('app.organization_id', $1, true)", [organisationId]);
        const resultat = await fn(client);
        await client.query("COMMIT");
        return resultat;
      } catch (erreur) {
        await client.query("ROLLBACK").catch((annulation: unknown) => {
          casse = annulation instanceof Error ? annulation : new Error("usage: annulation");
        });
        throw erreur;
      }
    } catch (erreur) {
      if (!(erreur instanceof RefusUsage)) casse ??= erreur instanceof Error ? erreur : new Error("usage: erreur");
      throw erreur;
    } finally {
      client.release(casse);
    }
  };
}

/** Valeur sentinelle « la base n'a pas répondu à temps ». */
const MUET: { readonly muet: true } = Object.freeze({ muet: true });

/** Réservation bornée par `DELAI_PORT_MS` (horloge injectée) ; toute erreur ou un silence rend `usage_unavailable`. */
async function reserver(transaction: TransactionOrganisation, ecriture: Ecriture, regles: ReglesUsage): Promise<CodeRefusUsage | null> {
  let annuler = () => {};
  const delai = new Promise<typeof MUET>((resolve) => {
    annuler = regles.horloge.minuterie(DELAI_PORT_MS, () => resolve(MUET));
  });
  const travail = (async (): Promise<CodeRefusUsage | null> => {
    try {
      await transaction((executeur) => sequence(executeur, ecriture, regles));
      return null;
    } catch (erreur) {
      if (erreur instanceof RefusUsage) return erreur.code;
      throw erreur;
    }
  })();
  // Une erreur tardive (après le délai) ne doit pas rester sans gestionnaire.
  travail.catch(() => undefined);
  try {
    const issue = await Promise.race([travail, delai]);
    return issue !== null && typeof issue === "object" ? "usage_unavailable" : issue;
  } catch {
    return "usage_unavailable";
  } finally {
    annuler();
  }
}

/**
 * Réserve le forfait d'une génération (`apercu`, `complet`, `mini`) ou d'une relecture, dans la transaction de
 * `withOrg` de la génération (0083 § 2), contre le plafond par organisation et par jour et les limites globales. Une
 * demande mal formée (identifiant qui n'est pas un uuid, relecture avec génération, génération sans identifiant,
 * organisation technique) est une erreur de composition : `usage_unavailable`, sans requête. Une même
 * `generationRunId` réservée deux fois (reprise) rend le même forfait sans nouvelle ligne (0083 § 4).
 */
export async function reserverForfait(transaction: TransactionOrganisation, demande: DemandeForfait, regles: ReglesUsage): Promise<ResultatForfait> {
  const relecture = demande.profil === "relecture";
  if (
    !(PROFILS_FORFAIT as readonly string[]).includes(demande.profil) ||
    !estUuid(demande.organisationId) ||
    demande.organisationId === ORGANISATION_ACTIONS_SANS_COMPTE ||
    demande.organisationId === ORGANISATION_PROTOTYPE ||
    (demande.tripId !== null && !estUuid(demande.tripId)) ||
    (relecture ? demande.generationRunId !== null : !estUuid(demande.generationRunId))
  ) {
    return { ok: false, code: "usage_unavailable" };
  }
  let forfait: Forfait;
  try {
    forfait = forfaitDuProfil(regles.plafonds, regles.table, demande.profil);
  } catch {
    return { ok: false, code: "usage_unavailable" };
  }
  const refus = await reserver(
    transaction,
    { organisationId: demande.organisationId, tripId: demande.tripId, generationRunId: demande.generationRunId, forfait, plafondJourMicros: regles.plafonds.parOrganisationJourMicros },
    regles,
  );
  if (refus !== null) return { ok: false, code: refus };
  return { ok: true, forfait, executionId: demande.generationRunId, plafonds: plafondsDuForfait(forfait) };
}

/**
 * Réserve le forfait d'une action sans compte (`structureBrief`, `suggestLodging`) dans l'organisation technique des
 * actions sans compte, sur le pool `vadrouille_app` (0083 § 2 : aucun utilisateur pour `withOrg`), contre son plafond
 * global quotidien (0081 B9-TL-4 point 3). L'identifiant d'exécution est
 * opaque, tiré à chaque appel, jamais réutilisé ni renvoyé au navigateur ; c'est aussi le `generation_run_id` des
 * lignes écrites (aucun voyage, aucune personne, aucune adresse IP).
 */
export async function reserverAction(
  pool: PoolSql,
  action: ActionSansCompte,
  regles: ReglesUsage,
  tirerId: () => string = () => globalThis.crypto.randomUUID(),
): Promise<ResultatForfait> {
  if (!(ACTIONS_SANS_COMPTE as readonly string[]).includes(action)) return { ok: false, code: "usage_unavailable" };
  let forfait: Forfait;
  try {
    forfait = forfaitDeLAction(regles.plafonds, regles.table, action);
  } catch {
    return { ok: false, code: "usage_unavailable" };
  }
  const executionId = tirerId();
  if (!estUuid(executionId)) return { ok: false, code: "usage_unavailable" };
  const refus = await reserver(
    transactionBrute(pool, ORGANISATION_ACTIONS_SANS_COMPTE),
    { organisationId: ORGANISATION_ACTIONS_SANS_COMPTE, tripId: null, generationRunId: executionId, forfait, plafondJourMicros: regles.plafonds.actionsSansCompteJourMicros },
    regles,
  );
  if (refus !== null) return { ok: false, code: refus };
  return { ok: true, forfait, executionId, plafonds: plafondsDuForfait(forfait) };
}
