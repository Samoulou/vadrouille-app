import "server-only";

import type { z } from "zod";

import type { AdapterContext } from "@/adapters/types";
import { fail, ok, type ApiErrorCode, type Result } from "@/contracts";
import { errorNameOf, logEvent } from "@/server/log";
import { parseInput } from "@/server/parse-input";
import { executeurSql, withOrg as withOrgParDefaut, type OrgTransaction } from "@/server/with-org";

import { identifiantLisible } from "./conversion";

/**
 * Cadre commun des actions authentifiées sur un voyage (spécification B6, B6b point 2 ; décision 0086 § 2.2, B6-TL-8).
 * **Jamais** sous `"use server"` : les actions de `src/server/actions/` l'appellent. Ordre des contrôles, fixé :
 * 1. contexte **de la session** (fonction injectée par l'action, `contexteFacultatif`) : sans session, `unauthenticated` ;
 * 2. `parseInput` de l'entrée reçue en `unknown`, schéma **strict** : un champ `organizationId` ou `userId` (comme tout
 *    champ inconnu) est refusé, `validation_failed`, sans rien lire ;
 * 3. identifiant du voyage lisible (`TRIP_ID_PATTERN` puis `uuid`, B6-PO-11), sinon `not_found` sans requête ;
 * 4. `withOrg` avec le contexte de la session (organisation et personne posées par paramètres liés, RLS) ;
 * 5. contrôle du voyage dans l'organisation (`organization_id` lié au contexte, en plus de la RLS) : `not_found`, jamais
 *    `forbidden` (un voyage d'une autre organisation est indiscernable d'un voyage inconnu) ;
 * 6. traitement, dans la même transaction ; `null` : `not_found` ;
 * 7. toute erreur inattendue devient `internal`, sans message ni pile de la base ; journalisée par
 *    `voyages.action_failed` (nom de l'action, classe de l'erreur, voyage), rien d'autre.
 *
 * B9, B10, B11 et B12 y écrivent leurs actions (spécification B6, « Ce que B6 expose aux tâches suivantes »).
 */

type FonctionWithOrg = <T>(ctx: Pick<AdapterContext, "organizationId" | "userId">, fn: (tx: OrgTransaction) => Promise<T>) => Promise<T>;

/** Exécuteur de la transaction de l'action (`executeurSql` de `withOrg`) : textes constants, paramètres liés. */
export type ExecuteurAction = ReturnType<typeof executeurSql>;

export type DependancesAction = {
  /** Contexte de la session, ou `null` sans session ; jamais une valeur de l'entrée. */
  readonly contexte: () => Promise<AdapterContext | null>;
  /** **Tests seulement** : `withOrg` de `src/server/with-org.ts` par défaut ; les tests de base injectent le leur. */
  readonly withOrg?: FonctionWithOrg;
};

/** Nom fixe de l'action, journalisé (`ACTION` de `src/server/log.ts` : minuscules, chiffres, tirets). */
export type NomAction =
  | "toggle-checklist-item"
  | "decide-card"
  | "undo-decision"
  | "answer-preference-prompt"
  | "complete-deck"
  // M1g (ticket 869) : remplacer une étape sur `api` (`src/server/versions/remplacement.ts`).
  | "preview-replacement"
  | "apply-replacement"
  | "undo-replacement"
  | "revision-version";

type EntreeVoyage = { readonly tripId: string };

/** Erreur fermée d'un traitement : rendue telle quelle (jamais `internal`), sans valeur. */
export class RefusAction extends Error {
  override name = "RefusAction";

  constructor(readonly code: Exclude<ApiErrorCode, "internal">) {
    super(code);
  }
}

const SQL_VOYAGE_DE_L_ORGANISATION = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";

export async function executerActionVoyage<S extends z.ZodType<EntreeVoyage>, T>(
  nom: NomAction,
  dependances: DependancesAction,
  schema: S,
  entree: unknown,
  traitement: (executeur: ExecuteurAction, ctx: AdapterContext, valeur: z.infer<S>) => Promise<T | null>,
): Promise<Result<T>> {
  let tripId: string | undefined;
  try {
    const ctx = await dependances.contexte();
    if (ctx === null) return fail("unauthenticated");
    const lue = parseInput(schema, entree);
    if (!lue.ok) return lue;
    const valeur = lue.value;
    if (!identifiantLisible(valeur.tripId)) return fail("not_found");
    tripId = valeur.tripId;
    const withOrg = dependances.withOrg ?? withOrgParDefaut;
    const resultat = await withOrg(ctx, async (tx) => {
      const executeur = executeurSql(tx);
      const voyage = await executeur.query(SQL_VOYAGE_DE_L_ORGANISATION, [ctx.organizationId, valeur.tripId]);
      if (voyage.rows.length !== 1) return null;
      return traitement(executeur, ctx, valeur);
    });
    return resultat === null ? fail("not_found") : ok(resultat);
  } catch (erreur) {
    if (erreur instanceof RefusAction) {
      // `generation_in_progress` exige `retryable: true` (`ApiErrorSchema`, décision 0112 § 1.6) : jamais `fail(code)` seul.
      return erreur.code === "generation_in_progress" ? { ok: false, error: { code: erreur.code, retryable: true } } : fail(erreur.code);
    }
    const errorName = errorNameOf(erreur);
    logEvent("voyages.action_failed", { action: nom, ...(errorName === undefined ? {} : { errorName }), ...(tripId === undefined ? {} : { tripId }) }, "error");
    return fail("internal");
  }
}
