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
import type { ClientSql, PoolSql } from "@/server/usage/neon";
import { DELAI_PORT_MS, type CodeRefusUsage, type Horloge, type Plafond } from "@/server/usage/port";

/**
 * Réservation du **forfait** d'une génération, d'une relecture ou d'une action sans compte dans `usage_ledger`
 * (spécification B7, B7c points 1 et 3, « Consommation et plafonds » ; propositions B7-TL-6, B7-TL-9, B7-TL-10 ;
 * décision 0081, B9-TL-4). Seul module qui écrit `usage_ledger` ; aucune implémentation du port n'y écrit (B7-TL-6).
 *
 * Séquence, dans **une** transaction du rôle `vadrouille_app` :
 * 1. contexte d'organisation posé par paramètre lié (`set_config('app.organization_id', …, true)`), celui de la
 *    génération (jamais celui de l'appelant ni du navigateur) ; délai de requête de la base borné à `DELAI_PORT_MS` ;
 * 2. verrou consultatif **global** (`CLE_VERROU_USAGE`) : les sommes comparées sont globales (une clé de fournisseur
 *    pour toutes les organisations), deux réservations simultanées sont sérialisées ;
 * 3. sommes des lignes de forfait par `public.usage_forfait_totals()` (migration 0010, fonction en lecture seule
 *    `SECURITY DEFINER` : sommes globales et somme du jour de la seule organisation du contexte ; aucune ligne
 *    rendue) ;
 * 4. comparaison par `refusDuForfait` (quota du jour Google, enveloppe, mois ; `forfait.ts` de P0r2, réutilisé) puis
 *    par `refusParOrganisation` (plafond par organisation et par jour, ou global quotidien des actions sans compte) ;
 *    un refus annule la transaction **avant tout appel** ;
 * 5. écriture d'**une** ligne par méthode du forfait (`lignesDuForfait`, B7-TL-9 : `step` = `forfait`), en ajout
 *    seulement.
 * Toute erreur, ou une base muette au-delà de `DELAI_PORT_MS` (horloge injectée), rend `usage_unavailable` (échec
 * fermé) : aucun registre n'est rendu, donc aucun appel. Une transaction qui aboutirait après ce délai compterait un
 * forfait sans appel : la consommation est alors surestimée, jamais sous-estimée.
 *
 * Les appels passent ensuite par le registre **en mémoire** de P0r2 (`creerRegistreForfait(forfait, executionId,
 * horloge)`, `registre.ts`, repris tel quel, B7-TL-9), borné par ce forfait, avec les plafonds de `plafonds` ; rien
 * n'est écrit par appel. Comme `neon.ts`, le module n'importe pas `pg` : il reçoit le pool du rôle `vadrouille_app`
 * par la composition (B9, B8). `withOrg` (B3b) n'est pas utilisé : il exige un utilisateur, et l'organisation des
 * actions sans compte n'en a aucun (0081 B9-TL-4 point 2 : « comme `src/server/usage/neon.ts` le fait pour
 * `org_prototype` ») ; la transaction pose le même contexte, de la même façon.
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

/** Transaction de réservation (séquence de l'en-tête) ; `null` si le forfait est écrit, sinon le code du refus. */
async function transaction(client: ClientSql, ecriture: Ecriture, regles: ReglesUsage): Promise<CodeRefusUsage | null> {
  const { plafonds, table } = regles;
  const lignes = lignesDuForfait(table, skusDe(plafonds), plafonds.skus.modeles, ecriture.forfait);
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_catalog.set_config('app.organization_id', $1, true), pg_catalog.set_config('statement_timeout', $2, true)", [
      ecriture.organisationId,
      String(DELAI_PORT_MS),
    ]);
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock($1)", [CLE_VERROU_USAGE]);
    const { sommes, orgJourMicros } = lireSommes((await client.query(SQL_SOMMES)).rows[0]);
    const refus =
      refusDuForfait(sommes, ecriture.forfait, plafonds.limites, "elements") ?? refusParOrganisation(orgJourMicros, ecriture.forfait, ecriture.plafondJourMicros);
    if (refus !== null) {
      await client.query("ROLLBACK");
      return refus;
    }
    await client.query(SQL_INSERER, [
      ecriture.organisationId,
      ecriture.tripId,
      ecriture.generationRunId,
      lignes.map((l) => l.step),
      lignes.map((l) => l.provider),
      lignes.map((l) => l.sku),
      lignes.map((l) => l.units),
      lignes.map((l) => l.costEstimateMicros),
    ]);
    await client.query("COMMIT");
    return null;
  } catch (erreur) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw erreur;
  }
}

/** Valeur sentinelle « la base n'a pas répondu à temps ». */
const MUET: { readonly muet: true } = Object.freeze({ muet: true });

/** Réservation bornée par `DELAI_PORT_MS` (horloge injectée) ; toute erreur ou un silence rend `usage_unavailable`. */
async function reserver(pool: PoolSql, ecriture: Ecriture, regles: ReglesUsage): Promise<CodeRefusUsage | null> {
  let annuler = () => {};
  const delai = new Promise<typeof MUET>((resolve) => {
    annuler = regles.horloge.minuterie(DELAI_PORT_MS, () => resolve(MUET));
  });
  const travail = (async () => {
    const client = await pool.connect();
    try {
      return await transaction(client, ecriture, regles);
    } finally {
      client.release();
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
 * Réserve le forfait d'une génération (`apercu`, `complet`, `mini`) ou d'une relecture, dans l'organisation de la
 * génération, contre le plafond par organisation et par jour et les limites globales. Une demande mal formée
 * (identifiant qui n'est pas un uuid, relecture avec génération, génération sans identifiant, organisation technique)
 * est une erreur de composition : `usage_unavailable`, sans requête.
 */
export async function reserverForfait(pool: PoolSql, demande: DemandeForfait, regles: ReglesUsage): Promise<ResultatForfait> {
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
    pool,
    { organisationId: demande.organisationId, tripId: demande.tripId, generationRunId: demande.generationRunId, forfait, plafondJourMicros: regles.plafonds.parOrganisationJourMicros },
    regles,
  );
  if (refus !== null) return { ok: false, code: refus };
  return { ok: true, forfait, executionId: demande.generationRunId, plafonds: plafondsDuForfait(forfait) };
}

/**
 * Réserve le forfait d'une action sans compte (`structureBrief`, `suggestLodging`) dans l'organisation technique des
 * actions sans compte, contre son plafond global quotidien (0081 B9-TL-4 point 3). L'identifiant d'exécution est
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
    pool,
    { organisationId: ORGANISATION_ACTIONS_SANS_COMPTE, tripId: null, generationRunId: executionId, forfait, plafondJourMicros: regles.plafonds.actionsSansCompteJourMicros },
    regles,
  );
  if (refus !== null) return { ok: false, code: refus };
  return { ok: true, forfait, executionId, plafonds: plafondsDuForfait(forfait) };
}
