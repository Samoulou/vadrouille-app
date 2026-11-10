import "server-only";

import type { AdapterContext } from "@/adapters/types";
import { TripRequestSchema, fail, ok, type CreatedTrip, type Result } from "@/contracts";
import { controlerVilles, dateLocale } from "@/lib/fuseaux";
import { briefProgrammeDepuisFormulaire } from "@/server/programme/brief";

import { lignesDuBrouillon } from "./brouillon";
import {
  SQL_APERCU_ACTIF,
  SQL_NOUVELLE_EXECUTION,
  SQL_VERROU_APERCU,
  contexteValide,
  demarrer,
  executeurSql,
  type Outils,
} from "./commun";

/**
 * `createTrip(ctx, TripRequest)` (spécification B9, B9b points 2 à 4 ; B9-PO-1 à B9-PO-5, B9-PO-18 ; décisions 0081
 * B9-TL-5 à B9-TL-7 et 0087 §§ 4 et 5). Ordre :
 * 1. contexte de la session (`unauthenticated` sinon, rien n'est lu ni écrit) et revalidation par `TripRequestSchema` ;
 *    puis le même `requestId` déjà écrit → le même voyage, avant tout autre contrôle (B9b point 3) ;
 * 1 bis. sous la chaîne inversée seulement, refus de la conversion du site d'essai (`validation_failed` sur son champ,
 *    décision 0136 § 3.8) ;
 * 2. villes : chacune connue de la table maison et de même décalage UTC que la destination pendant le voyage
 *    (`validation_failed` sur le nom de la première ville refusée) ; fuseau du voyage : celui de la destination, jamais
 *    tiré d'une réponse Google ;
 * 3. « arrivée au plus tôt aujourd'hui » dans le fuseau du voyage, sur l'horloge injectée (`validation_failed`,
 *    `draft.start`) ;
 * 4. **une** transaction, sous le verrou d'organisation de B9-PO-4 : même `requestId` → le même voyage, sans écriture,
 *    quel que soit l'état de sa génération (B9b point 3) ; sinon un aperçu actif de l'organisation → `active_preview_exists`
 *    sans écriture ; sinon `trips`, `briefs` (version 1), `stays`, `trip_commitments` et l'exécution `preview` `queued` ;
 * 5. après validation, démarrage du workflow 1 par le port (double sans appel en B9b).
 * Aucun journal du brouillon ni du brief ; une erreur de base devient `provider_error` sans message.
 */

const SQL_EXISTANT = "SELECT id FROM public.trips WHERE organization_id = $1 AND request_id = $2";

const SQL_VOYAGE = `INSERT INTO public.trips
  (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, travellers_children, time_zone)
  VALUES ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9) RETURNING id`;

const SQL_BRIEF = `INSERT INTO public.briefs
  (organization_id, trip_id, version, story, pace, mobility_modes, wishes, limit_categories, meal_budget, inferred_fields)
  VALUES ($1, $2, 1, NULL, $3, $4::text[], $5::text[], $6::text[], $7, $8::text[])`;

const SQL_SEJOUR = `INSERT INTO public.stays
  (organization_id, trip_id, kind, place_id, label, from_date, to_date, city, lodging_kind, suggestion_id, area_center_lat, area_center_lng, area_radius_m)
  VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8, $9, $10, $11, $12, $13)`;

const SQL_ENGAGEMENT = `INSERT INTO public.trip_commitments
  (organization_id, trip_id, rank, kind, label, date, start_time, end_time)
  VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8)`;

type Issue =
  | { readonly type: "existant"; readonly tripId: string }
  | { readonly type: "actif"; readonly tripId: string }
  | { readonly type: "cree"; readonly tripId: string; readonly generationRunId: string };

const champVille = (indice: number) => (indice === 0 ? "draft.destination" : `draft.otherCities.${indice - 1}.name`);

export async function creerVoyage(o: Outils, ctx: AdapterContext | null | undefined, entree: unknown): Promise<Result<CreatedTrip>> {
  if (!contexteValide(ctx)) return fail("unauthenticated");
  const parsed = TripRequestSchema.safeParse(entree);
  if (!parsed.success) return fail("validation_failed");
  const request = parsed.data;
  const { draft } = request;
  const org = ctx.organizationId;

  // Idempotence d'abord (B9b point 3) : un rejeu du même `requestId` rend le même voyage, même si les contrôles des
  // villes ou de la date d'arrivée refuseraient désormais le brouillon (date passée depuis la création).
  let deja: string | null;
  try {
    deja = await o.withOrg(ctx, async (tx) => {
      const ligne = (await executeurSql(tx).query(SQL_EXISTANT, [org, request.requestId])).rows[0];
      return ligne === undefined ? null : String(ligne.id);
    });
  } catch {
    return fail("provider_error");
  }
  if (deja !== null) return ok({ tripId: deja });

  // Chaîne inversée (décision 0136 § 3.8 ; M4b, décision 0148 § 4) : la conversion que relit l'étape `a` de
  // `generateProgramme` (`briefProgrammeDepuisFormulaire`, qui admet deux villes ou plus) refuse **avant toute écriture** un
  // brouillon qu'elle ne sait pas convertir, sur le champ qu'elle rend (`draft.destination`, `draft.end`,
  // `draft.otherCities.<i>.name` pour une ville hors de la table). Récit : jamais lu ici tant que la garde
  // `RECIT_API_AUTORISE` est fermée (0139 § 1.2 point 6), et `story` reste `NULL` (`SQL_BRIEF`). Ancienne chaîne : inchangée.
  if (o.chaine() === "inversee") {
    const conversion = briefProgrammeDepuisFormulaire(draft, request.brief, undefined);
    if (!conversion.ok) return fail("validation_failed", conversion.champ);
  }

  const controle = controlerVilles([draft.destination, ...draft.otherCities.map((ville) => ville.name)], draft.start, draft.end);
  if (!controle.ok) return fail("validation_failed", champVille(controle.indice));
  if (draft.start < dateLocale(controle.fuseau, o.maintenant())) return fail("validation_failed", "draft.start");

  const lignes = lignesDuBrouillon(request);
  let issue: Issue;
  try {
    issue = await o.withOrg(ctx, async (tx): Promise<Issue> => {
      const sql = executeurSql(tx);
      await sql.query(SQL_VERROU_APERCU, [org]);
      const existant = (await sql.query(SQL_EXISTANT, [org, request.requestId])).rows[0];
      if (existant !== undefined) return { type: "existant", tripId: String(existant.id) };
      const actif = (await sql.query(SQL_APERCU_ACTIF, [org])).rows[0];
      if (actif !== undefined) return { type: "actif", tripId: String(actif.trip_id) };

      const { voyage, brief } = lignes;
      const cree = (
        await sql.query(SQL_VOYAGE, [
          org,
          ctx.userId,
          request.requestId,
          voyage.destination,
          voyage.startDate,
          voyage.endDate,
          voyage.travellersAdults,
          voyage.travellersChildren,
          controle.fuseau,
        ])
      ).rows[0];
      if (cree === undefined) throw new Error("création : voyage non écrit");
      const tripId = String(cree.id);
      await sql.query(SQL_BRIEF, [org, tripId, brief.pace, brief.mobilityModes, brief.wishes, brief.limitCategories, brief.mealBudget, brief.inferredFields]);
      for (const s of lignes.sejours) {
        await sql.query(SQL_SEJOUR, [
          org,
          tripId,
          s.kind,
          s.placeId,
          s.label,
          s.fromDate,
          s.toDate,
          s.city,
          s.lodgingKind,
          s.suggestionId,
          s.areaCenterLat,
          s.areaCenterLng,
          s.areaRadiusM,
        ]);
      }
      for (const e of lignes.engagements) {
        await sql.query(SQL_ENGAGEMENT, [org, tripId, e.rank, e.kind, e.label, e.date, e.startTime, e.endTime]);
      }
      const execution = (await sql.query(SQL_NOUVELLE_EXECUTION, [org, tripId, request.requestId, new Date(o.maintenant()).toISOString()])).rows[0];
      if (execution === undefined) throw new Error("création : exécution non écrite");
      return { type: "cree", tripId, generationRunId: String(execution.id) };
    });
  } catch {
    return fail("provider_error");
  }

  if (issue.type === "actif") return { ok: false, error: { code: "active_preview_exists", activeTripId: issue.tripId } };
  if (issue.type === "cree") await demarrer(o, ctx, issue.generationRunId);
  return ok({ tripId: issue.tripId });
}
