import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { ACCOUNT_EXPORT_FORMAT, ACCOUNT_EXPORT_VERSION, type AccountExport, AccountExportSchema } from "@/contracts/account-export";
import { DaySnapshotSchema, StopSnapshotSchema, SurpriseIdeaSnapshotSchema, SegmentSnapshotSchema } from "@/contracts/snapshot";
import {
  FreeItemSchema,
  OpenMealItemSchema,
  SourceSchema,
  StopFactsSchema,
  TerminusItemSchema,
  TransferItemSchema,
} from "@/contracts/trip";
import { PRODUCT_NAME } from "@/config/site";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { executeurSql, withOrg } from "@/server/with-org";

/**
 * « Exporter mes données » : construction du fichier depuis la base (spécification M9 § 3 et § 6.2 ; ticket 1097, M9a).
 *
 * - **Lu dans les tables**, jamais par `TripAdapter.getTrip` ni aucune lecture d'écran (§ 3.1 point 3) : un `Trip`
 *   d'affichage porte des données chargées à la demande (durées relues sur Google, positions, photos) qui ne sortent pas.
 * - **Une transaction en lecture** (`withOrg`, `REPEATABLE READ`, `READ ONLY`) : un instantané cohérent de la base, et
 *   aucune écriture possible (critère 8) ; RLS de `vadrouille_app` sur l'organisation et la personne de la session, et
 *   chaque requête filtrée en plus par `organization_id`.
 * - **Organisation personnelle à un seul membre**, la personne en propriétaire (M9-PO-2) : sinon `forbidden`, et rien
 *   d'autre n'est lu (§ 3.1 point 2). Tables par personne (`preferences`, `stop_reviews`, `reminder_consents`,
 *   `reminder_sends`, et `feedback` par `created_by`) : lignes de la personne seulement (§ 3.4 point 2).
 * - **Aucun appel à Google ni à Stripe** (§ 3.3 point 3) : ce module n'importe aucun client, aucun port, aucune clé.
 * - **Liste blanche** : chaque ligne est recopiée champ par champ ; l'instantané d'une version est projeté sur les clés du
 *   schéma de stockage (`DaySnapshotSchema`) avant la validation stricte par `AccountExportSchema` : une clé inconnue d'un
 *   instantané (ancienne durée de trajet, par exemple) est retirée, jamais exportée.
 * - **Aucune copie** sur le serveur, aucun journal du contenu : le fichier n'existe que dans la réponse.
 */

/** Exécuteur `{ query(texte, valeurs) }` de la transaction (`executeurSql`) ; les textes sont des constantes du module. */
export type ExecuteurExport = { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** Transaction en lecture dans l'organisation et pour la personne du contexte. */
export type TransactionExport = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (executeur: ExecuteurExport) => Promise<T>) => Promise<T>;

export type ResultatExport = { readonly ok: true; readonly value: AccountExport } | { readonly ok: false; readonly code: "forbidden" };

/**
 * Borne de taille du fichier (proposition de M9a, T3 à confirmer) : 4 000 000 octets, sous la limite de 4,5 Mo d'une
 * réponse de fonction de l'hébergeur (décision 0002). Au MVP, quelques voyages : quelques centaines de kilooctets. Au-delà,
 * l'export échoue (`compte.export_failed`) ; l'export asynchrone est hors périmètre (§ 10).
 */
export const EXPORT_TAILLE_MAX_OCTETS = 4_000_000;

/** Fichier au-delà de `EXPORT_TAILLE_MAX_OCTETS` ; ne porte aucune valeur. */
export class ExportTropVolumineuxError extends Error {
  override name = "ExportTropVolumineuxError";

  constructor() {
    super("Export au-delà de la borne de taille.");
  }
}

/** Ligne illisible de la base (type inattendu) ; ne porte aucune valeur. */
export class LigneExportIllisibleError extends Error {
  override name = "LigneExportIllisibleError";

  constructor() {
    super("Ligne de la base illisible pour l'export.");
  }
}

// --- Nom du fichier -----------------------------------------------------------------------------------------------

const DATE_ZURICH = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" });

/** Date du jour à Zurich, `AAAA-MM-JJ` (§ 3.5 point 2). */
export function dateDeZurich(maintenant: Date): string {
  const parties = Object.fromEntries(DATE_ZURICH.formatToParts(maintenant).map((p) => [p.type, p.value]));
  return `${parties.year}-${parties.month}-${parties.day}`;
}

/** `vadrouille-mes-donnees-AAAA-MM-JJ.json`, date du jour à Zurich ; aucun identifiant ni adresse dans le nom. */
export function nomFichierExport(maintenant: Date): string {
  return `vadrouille-mes-donnees-${dateDeZurich(maintenant)}.json`;
}

/** JSON UTF-8 indenté de 2 espaces, clés dans l'ordre du contrat, fin de ligne finale (§ 3.5 point 1). */
export function serialiserExport(fichier: AccountExport): string {
  return `${JSON.stringify(fichier, null, 2)}\n`;
}

// --- Liste blanche de l'instantané --------------------------------------------------------------------------------

type Objet = Record<string, unknown>;
const estObjet = (valeur: unknown): valeur is Objet => typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
const cles = (schema: { shape: object }): readonly string[] => Object.keys(schema.shape);

const CLES_JOUR = cles(DaySnapshotSchema);
const CLES_ETAPE = cles(StopSnapshotSchema);
const CLES_FAITS = cles(StopFactsSchema);
const CLES_SOURCE = cles(SourceSchema);
const CLES_SEGMENT = cles(SegmentSnapshotSchema);
const CLES_SURPRISE = cles(SurpriseIdeaSnapshotSchema);
const CLES_LIGNE: Readonly<Record<string, readonly string[]>> = {
  terminus: cles(TerminusItemSchema),
  free: cles(FreeItemSchema),
  openMeal: cles(OpenMealItemSchema),
  transfer: cles(TransferItemSchema),
};

/** Copie des seules clés admises ; une valeur qui n'est pas un objet passe telle quelle (la validation la refusera). */
function garder(valeur: unknown, admises: readonly string[]): unknown {
  if (!estObjet(valeur)) return valeur;
  const sortie: Objet = {};
  for (const cle of admises) if (Object.hasOwn(valeur, cle)) sortie[cle] = valeur[cle];
  return sortie;
}

function avecFaitsEtSource(valeur: unknown, admises: readonly string[]): unknown {
  const sortie = garder(valeur, admises);
  if (!estObjet(sortie)) return sortie;
  if ("facts" in sortie) sortie.facts = garder(sortie.facts, CLES_FAITS);
  if ("source" in sortie) sortie.source = garder(sortie.source, CLES_SOURCE);
  return sortie;
}

function ligneDuJour(valeur: unknown): unknown {
  if (!estObjet(valeur)) return valeur;
  if (valeur.type === "stop") return { type: "stop", stop: avecFaitsEtSource(valeur.stop, CLES_ETAPE) };
  if (valeur.type === "segment") return { type: "segment", segment: garder(valeur.segment, CLES_SEGMENT) };
  const admises = typeof valeur.type === "string" && Object.hasOwn(CLES_LIGNE, valeur.type) ? CLES_LIGNE[valeur.type] : undefined;
  // Type inconnu : recopié tel quel, refusé par la validation stricte (aucune donnée non prévue ne sort).
  return admises === undefined ? valeur : garder(valeur, admises);
}

/** Jours d'un instantané de `trip_versions.snapshot`, réduits aux clés du schéma de stockage. */
export function joursEnListeBlanche(snapshot: unknown): unknown {
  const jours = estObjet(snapshot) ? snapshot.days : undefined;
  if (!Array.isArray(jours)) return jours;
  return jours.map((jour) => {
    const sortie = garder(jour, CLES_JOUR);
    if (!estObjet(sortie)) return sortie;
    if (Array.isArray(sortie.items)) sortie.items = sortie.items.map(ligneDuJour);
    if (Array.isArray(sortie.events)) sortie.events = sortie.events.map((e) => avecFaitsEtSource(e, CLES_ETAPE));
    if ("surprise" in sortie) sortie.surprise = avecFaitsEtSource(sortie.surprise, CLES_SURPRISE);
    return sortie;
  });
}

// --- Requêtes -------------------------------------------------------------------------------------------------------

/** Instant en texte ISO 8601 UTC à la milliseconde (forme de `toISOString()`), sans conversion par le pilote. */
const instant = (colonne: string) => `to_char(${colonne} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const SQL_ADHESIONS = "SELECT user_id::text AS user_id, role FROM memberships WHERE organization_id = $1";
const SQL_ORGANISATION = "SELECT kind FROM organizations WHERE id = $1";
const SQL_COMPTE = `SELECT email, ${instant("created_at")} AS created_at FROM users WHERE id = $1`;
const SQL_VOYAGES = `SELECT id::text AS id, destination, start_date::text AS start_date, end_date::text AS end_date, time_zone,
  travellers_adults::int AS adults, travellers_children::int AS children, status, ${instant("created_at")} AS created_at,
  current_version, EXISTS (SELECT 1 FROM entitlements e WHERE e.organization_id = t.organization_id AND e.trip_id = t.id AND e.kind = 'tripUnlocked') AS unlocked
  FROM trips t WHERE organization_id = $1 ORDER BY created_at, id`;
const SQL_BRIEFS = `SELECT trip_id::text AS trip_id, version, story, pace, mobility_modes, wishes, limit_categories, limits, meal_budget,
  inferred_fields, ${instant("created_at")} AS created_at FROM briefs WHERE organization_id = $1 ORDER BY trip_id, version`;
const SQL_SEJOURS = `SELECT trip_id::text AS trip_id, kind, lodging_kind, label, city, from_date::text AS from_date, to_date::text AS to_date,
  arrival_time, departure_time, luggage, place_id FROM stays WHERE organization_id = $1 ORDER BY trip_id, from_date, id`;
const SQL_ENGAGEMENTS = `SELECT trip_id::text AS trip_id, kind, label, date::text AS date, start_time, end_time
  FROM trip_commitments WHERE organization_id = $1 ORDER BY trip_id, rank`;
const SQL_VERSIONS = `SELECT trip_id::text AS trip_id, version, parent_version, author_kind, ${instant("created_at")} AS created_at, snapshot
  FROM trip_versions WHERE organization_id = $1 ORDER BY trip_id, version`;
const SQL_PROPOSITIONS = `SELECT trip_id::text AS trip_id, phase, position, day, time, kind, content #>> '{stop,name}' AS name,
  content ->> 'category' AS category, content #>> '{stop,placeId}' AS place_id
  FROM proposals WHERE organization_id = $1 AND slot_type = 'proposal' ORDER BY trip_id, created_at, phase, position, id`;
const SQL_GESTES = `SELECT trip_id::text AS trip_id, signal, category, place_id, status, ${instant("created_at")} AS created_at,
  ${instant("cancelled_at")} AS cancelled_at FROM preference_signals WHERE organization_id = $1 ORDER BY trip_id, seq`;
const SQL_CLOTURES = `SELECT trip_id::text AS trip_id, phase, through_position, ${instant("created_at")} AS created_at
  FROM deck_closures WHERE organization_id = $1 ORDER BY trip_id, created_at, id`;
const SQL_A_FAIRE = `SELECT trip_id::text AS trip_id, label, moment, done, booking_url FROM checklist_items WHERE organization_id = $1
  ORDER BY trip_id, id`;
const SQL_SIGNALEMENTS = `SELECT trip_id::text AS trip_id, target_stop_id, place_id, reason, ${instant("created_at")} AS created_at
  FROM feedback WHERE organization_id = $1 AND created_by = $2 ORDER BY trip_id, created_at, id`;
const SQL_AVIS = `SELECT trip_id::text AS trip_id, stop_id, place_id, opinion, ${instant("updated_at")} AS updated_at
  FROM stop_reviews WHERE organization_id = $1 AND created_by = $2 ORDER BY trip_id, created_at, stop_id, id`;
const SQL_ACCORDS = `SELECT trip_id::text AS trip_id, ${instant("consented_at")} AS consented_at, ${instant("withdrawn_at")} AS withdrawn_at
  FROM reminder_consents WHERE organization_id = $1 AND user_id = $2 ORDER BY trip_id, consented_at, id`;
const SQL_ENVOIS = `SELECT trip_id::text AS trip_id, day_index, ${instant("claimed_at")} AS claimed_at
  FROM reminder_sends WHERE organization_id = $1 AND user_id = $2 ORDER BY trip_id, day_index`;
const SQL_LIENS = `SELECT trip_id::text AS trip_id, ${instant("created_at")} AS created_at, ${instant("expires_at")} AS expires_at,
  ${instant("revoked_at")} AS revoked_at FROM share_links WHERE organization_id = $1 ORDER BY trip_id, created_at, id`;
const SQL_PAIEMENTS = `SELECT trip_id::text AS trip_id, method, amount_cents, currency, status, ${instant("created_at")} AS created_at
  FROM checkouts WHERE organization_id = $1 ORDER BY trip_id, created_at, id`;
const SQL_DROITS = `SELECT trip_id::text AS trip_id, kind, ${instant("granted_at")} AS granted_at FROM entitlements WHERE organization_id = $1
  ORDER BY trip_id, granted_at, id`;
const SQL_GOUTS = `SELECT subject_kind, category, direction, origin, source_trip_id::text AS source_trip_id, ${instant("consented_at")} AS consented_at
  FROM preferences WHERE organization_id = $1 AND user_id = $2 ORDER BY created_at, id`;

/** Requêtes lues, dans l'ordre (tests : aucune autre table n'est lue). */
export const REQUETES_EXPORT = Object.freeze({
  adhesions: SQL_ADHESIONS,
  organisation: SQL_ORGANISATION,
  compte: SQL_COMPTE,
  voyages: SQL_VOYAGES,
  briefs: SQL_BRIEFS,
  sejours: SQL_SEJOURS,
  engagements: SQL_ENGAGEMENTS,
  versions: SQL_VERSIONS,
  propositions: SQL_PROPOSITIONS,
  gestes: SQL_GESTES,
  clotures: SQL_CLOTURES,
  aFaire: SQL_A_FAIRE,
  signalements: SQL_SIGNALEMENTS,
  avis: SQL_AVIS,
  accords: SQL_ACCORDS,
  envois: SQL_ENVOIS,
  liens: SQL_LIENS,
  paiements: SQL_PAIEMENTS,
  droits: SQL_DROITS,
  gouts: SQL_GOUTS,
});

// --- Construction -------------------------------------------------------------------------------------------------

type Ligne = Record<string, unknown>;

/** Nombre entier d'une colonne (`int`, ou `bigint` rendu en texte par le pilote). */
function entier(valeur: unknown): number {
  const n = typeof valeur === "string" ? Number(valeur) : valeur;
  if (typeof n !== "number" || !Number.isSafeInteger(n)) throw new LigneExportIllisibleError();
  return n;
}
const entierOuNul = (valeur: unknown): number | null => (valeur === null || valeur === undefined ? null : entier(valeur));
const nul = <T>(valeur: T | undefined): T | null => (valeur === undefined ? null : valeur);

/** Lignes regroupées par voyage, dans l'ordre de la requête. */
function parVoyage(lignes: readonly Ligne[]): Map<string, Ligne[]> {
  const groupes = new Map<string, Ligne[]>();
  for (const ligne of lignes) {
    const voyage = String(ligne.trip_id);
    const groupe = groupes.get(voyage);
    if (groupe === undefined) groupes.set(voyage, [ligne]);
    else groupe.push(ligne);
  }
  return groupes;
}

/** Vrai si l'organisation est personnelle et que la personne en est le seul membre, propriétaire (M9-PO-2). */
async function organisationAdmise(executeur: ExecuteurExport, ctx: Pick<AdapterContext, "organizationId" | "userId">): Promise<boolean> {
  const adhesions = (await executeur.query(SQL_ADHESIONS, [ctx.organizationId])).rows;
  const seule = adhesions.length === 1 && adhesions[0]?.user_id === ctx.userId && adhesions[0]?.role === "owner";
  if (!seule) return false;
  const organisation = (await executeur.query(SQL_ORGANISATION, [ctx.organizationId])).rows;
  return organisation.length === 1 && organisation[0]?.kind === "personal";
}

async function lireTout(executeur: ExecuteurExport, ctx: Pick<AdapterContext, "organizationId" | "userId">, maintenant: Date, notice: string): Promise<unknown> {
  const org = ctx.organizationId;
  const personne = ctx.userId;
  const lire = async (texte: string, parPersonne = false) => (await executeur.query(texte, parPersonne ? [org, personne] : [org])).rows;
  const compte = (await executeur.query(SQL_COMPTE, [personne])).rows;
  if (compte.length !== 1) throw new LigneExportIllisibleError();
  const voyages = await lire(SQL_VOYAGES);
  const briefs = parVoyage(await lire(SQL_BRIEFS));
  const sejours = parVoyage(await lire(SQL_SEJOURS));
  const engagements = parVoyage(await lire(SQL_ENGAGEMENTS));
  const versions = parVoyage(await lire(SQL_VERSIONS));
  const propositions = parVoyage(await lire(SQL_PROPOSITIONS));
  const gestes = parVoyage(await lire(SQL_GESTES));
  const clotures = parVoyage(await lire(SQL_CLOTURES));
  const aFaire = parVoyage(await lire(SQL_A_FAIRE));
  const signalements = parVoyage(await lire(SQL_SIGNALEMENTS, true));
  const avis = parVoyage(await lire(SQL_AVIS, true));
  const accords = parVoyage(await lire(SQL_ACCORDS, true));
  const envois = parVoyage(await lire(SQL_ENVOIS, true));
  const liens = parVoyage(await lire(SQL_LIENS));
  const paiements = parVoyage(await lire(SQL_PAIEMENTS));
  const droits = parVoyage(await lire(SQL_DROITS));
  const gouts = await lire(SQL_GOUTS, true);

  const de = (groupes: Map<string, Ligne[]>, voyage: string) => groupes.get(voyage) ?? [];
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    version: ACCOUNT_EXPORT_VERSION,
    exportedAt: maintenant.toISOString(),
    notice,
    account: { email: compte[0]?.email, createdAt: compte[0]?.created_at },
    trips: voyages.map((t) => {
      const id = String(t.id);
      return {
        id,
        destination: t.destination,
        startDate: t.start_date,
        endDate: t.end_date,
        timeZone: t.time_zone,
        travellers: { adults: entier(t.adults), children: entier(t.children) },
        status: t.status,
        createdAt: t.created_at,
        unlocked: t.unlocked === true,
        currentVersion: entierOuNul(t.current_version),
        briefs: de(briefs, id).map((b) => ({
          version: entier(b.version),
          story: nul(b.story),
          pace: nul(b.pace),
          mobilityModes: nul(b.mobility_modes),
          wishes: b.wishes,
          limitCategories: nul(b.limit_categories),
          limits: nul(b.limits),
          mealBudget: nul(b.meal_budget),
          inferredFields: b.inferred_fields,
          createdAt: b.created_at,
        })),
        stays: de(sejours, id).map((s) => ({
          kind: s.kind,
          lodgingKind: nul(s.lodging_kind),
          label: s.label,
          city: nul(s.city),
          fromDate: s.from_date,
          toDate: s.to_date,
          arrivalTime: nul(s.arrival_time),
          departureTime: nul(s.departure_time),
          luggage: nul(s.luggage),
          placeId: nul(s.place_id),
        })),
        commitments: de(engagements, id).map((c) => ({
          kind: c.kind,
          label: c.label,
          date: c.date,
          startTime: c.start_time,
          endTime: nul(c.end_time),
        })),
        versions: de(versions, id).map((v) => ({
          version: entier(v.version),
          parentVersion: entierOuNul(v.parent_version),
          authorKind: v.author_kind,
          createdAt: v.created_at,
          days: joursEnListeBlanche(v.snapshot),
        })),
        deck: {
          proposals: de(propositions, id).map((p) => ({
            phase: p.phase,
            position: entier(p.position),
            day: entier(p.day),
            time: p.time,
            kind: p.kind,
            name: p.name,
            category: p.category,
            placeId: nul(p.place_id),
          })),
          gestures: de(gestes, id).map((g) => ({
            signal: g.signal,
            category: nul(g.category),
            placeId: nul(g.place_id),
            status: g.status,
            createdAt: g.created_at,
            cancelledAt: nul(g.cancelled_at),
          })),
          closures: de(clotures, id).map((c) => ({ phase: c.phase, throughPosition: entier(c.through_position), createdAt: c.created_at })),
        },
        checklist: de(aFaire, id).map((l) => ({ label: l.label, moment: l.moment, done: l.done, bookingUrl: nul(l.booking_url) })),
        reports: de(signalements, id).map((r) => ({ stopId: nul(r.target_stop_id), placeId: nul(r.place_id), reason: r.reason, createdAt: r.created_at })),
        reviews: de(avis, id).map((r) => ({ stopId: r.stop_id, placeId: nul(r.place_id), opinion: r.opinion, updatedAt: r.updated_at })),
        reminders: {
          consents: de(accords, id).map((a) => ({ consentedAt: a.consented_at, withdrawnAt: nul(a.withdrawn_at) })),
          sends: de(envois, id).map((e) => ({ dayIndex: entier(e.day_index), claimedAt: e.claimed_at })),
        },
        shareLinks: de(liens, id).map((l) => ({ createdAt: l.created_at, expiresAt: l.expires_at, revokedAt: nul(l.revoked_at) })),
        payments: de(paiements, id).map((p) => ({
          method: p.method,
          amountCents: entier(p.amount_cents),
          currency: p.currency,
          status: p.status,
          createdAt: p.created_at,
        })),
        entitlements: de(droits, id).map((d) => ({ kind: d.kind, grantedAt: d.granted_at })),
      };
    }),
    tastes: gouts.map((g) => ({
      subjectKind: g.subject_kind,
      category: nul(g.category),
      direction: nul(g.direction),
      origin: g.origin,
      sourceTripId: nul(g.source_trip_id),
      consentedAt: g.consented_at,
    })),
  };
}

export type ExportCompte = {
  /** Vérification d'accès seule (refus gratuit, avant le limiteur) : organisation personnelle à un seul membre. */
  readonly organisationAdmise: (ctx: Pick<AdapterContext, "organizationId" | "userId">) => Promise<boolean>;
  /**
   * Fichier de la personne du contexte, construit dans une seule transaction en lecture ; l'accès y est contrôlé de nouveau
   * avant toute autre lecture. Lève si la base ou le contrat refuse une ligne (`compte.export_failed` chez l'appelant).
   */
  readonly construire: (ctx: Pick<AdapterContext, "organizationId" | "userId">, maintenant: Date) => Promise<ResultatExport>;
};

/** Cas d'usage sur une transaction injectée (tests de base : contexte d'organisation sur leur propre client). */
export function creerExportCompte(transaction: TransactionExport, notice: string = format(messages.compte.export.notice, { produit: PRODUCT_NAME })): ExportCompte {
  return {
    organisationAdmise: (ctx) => transaction(ctx, (executeur) => organisationAdmise(executeur, ctx)),
    construire: (ctx, maintenant) =>
      transaction(ctx, async (executeur): Promise<ResultatExport> => {
        if (!(await organisationAdmise(executeur, ctx))) return { ok: false, code: "forbidden" };
        const fichier = AccountExportSchema.parse(await lireTout(executeur, ctx, maintenant, notice));
        return { ok: true, value: fichier };
      }),
  };
}

/** Mode de la transaction de l'export : lecture cohérente (`REPEATABLE READ`) et aucune écriture possible (`READ ONLY`). */
export const MODE_TRANSACTION_EXPORT = Object.freeze({ isolationLevel: "repeatable read", accessMode: "read only" } as const);

/**
 * Transaction de l'export sur une fonction de contexte d'organisation (`withOrg` du serveur, ou celle d'un test sur son
 * client) : rôle `vadrouille_app`, contexte de la session, mode `MODE_TRANSACTION_EXPORT`.
 */
export function transactionExportSur(avecOrg: typeof withOrg): TransactionExport {
  return (ctx, fn) => avecOrg(ctx, (tx) => fn(executeurSql(tx)), { ...MODE_TRANSACTION_EXPORT });
}

let parDefaut: ExportCompte | undefined;

/** Cas d'usage du serveur. */
export function exportCompte(): ExportCompte {
  parDefaut ??= creerExportCompte(transactionExportSur(withOrg));
  return parDefaut;
}
