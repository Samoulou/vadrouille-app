import "server-only";

import type { TripSnapshot } from "@/contracts";
import { TENTATIVES_PUBLICATION } from "@/server/config/generation";
import { DELAI_PORT_MS } from "@/server/usage/port";
import { ecrireVersion } from "@/server/versions/ecrire";
import { executeurSql } from "@/server/with-org";

import type { CaseApercu } from "./cases";
import { ArretEtape } from "./codes";
import type { DependancesResolues } from "./dependances";
import { gardeOuverte } from "./garde";

/**
 * Publication de l'aperçu, **une seule transaction** (décision 0081 B9-TL-3 points 4 et 6 ; B9-TL-10 ; spécification B9c
 * point 3, critère `aperçu: une seule transaction de publication`) : sous la garde `step_seq = 6 AND phase = 'preparing'`,
 * la version 1 (`ecrireVersion`, `author_kind` `workflow`, `request_id` de l'exécution, `trips.current_version`), les cases
 * `proposals` (`phase` `preview`) et la fin de l'exécution (`ready` ou `incomplete`, `last_version`). Une erreur de base
 * annule tout. Aucune position n'est écrite : la condition (a) de 0060 n'est pas remplie (B8c absente), et ce dossier
 * n'importe pas le port d'écriture (critère `coordonnées: aucune écriture sans B8c`).
 *
 * **Rejeu borné** : une erreur de la transaction (connexion perdue, conflit) la rejoue, `TENTATIVES_PUBLICATION` fois au plus,
 * **sans aucun nouvel appel externe** (les données sont déjà en mémoire) et seulement si l'échéance de l'étape le permet. Si la
 * confirmation d'une transaction réussie s'est perdue, le rejeu trouve l'exécution déjà finie (`ready` ou `incomplete`) : il
 * n'écrit rien de plus et rend la publication existante.
 */

export type DonneesPublication = {
  readonly instantane: TripSnapshot;
  readonly cases: readonly CaseApercu[];
  readonly statut: "ready" | "incomplete";
};

export type ContextePublication = {
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly requestId: string | null;
  readonly echeance: number;
};

const SQL_PHASE = `SELECT phase FROM public.generation_runs WHERE organization_id = $1 AND id = $2`;
const SQL_CASE = `INSERT INTO public.proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, candidate_id, content)
  VALUES ($1, $2, $3, 'preview', $4, $5, $6, $7, $8, $9, $10::jsonb)`;
const SQL_FIN = `UPDATE public.generation_runs SET phase = $4, stop_reason = NULL, last_version = $5, updated_at = $6::timestamptz, finished_at = $6::timestamptz
  WHERE organization_id = $1 AND id = $2 AND step_seq = $3 AND phase = 'preparing' RETURNING id`;

export async function publier(dependances: DependancesResolues, contexte: ContextePublication, donnees: DonneesPublication): Promise<{ readonly version: number; readonly dejaPubliee: boolean }> {
  const { organizationId, generationRunId, tripId } = contexte;
  if (contexte.requestId === null) throw new ArretEtape("invalid_input");
  const requestId = contexte.requestId;
  let derniere: unknown;
  for (let tentative = 1; tentative <= TENTATIVES_PUBLICATION; tentative += 1) {
    try {
      return await dependances.transaction(organizationId, async (tx) => {
        const x = executeurSql(tx);
        const instant = new Date(dependances.maintenant());
        if (!(await gardeOuverte(x, organizationId, generationRunId, "e", instant))) {
          const ligne = (await x.query(SQL_PHASE, [organizationId, generationRunId])).rows[0];
          if (ligne !== undefined && (ligne.phase === "ready" || ligne.phase === "incomplete")) return { version: 1, dejaPubliee: true };
          throw new ArretEtape("step_expired");
        }
        const ecrite = await ecrireVersion(x, { organizationId, tripId, requestId, auteur: "workflow", instantane: donnees.instantane });
        for (const c of donnees.cases) {
          await x.query(SQL_CASE, [
            organizationId,
            tripId,
            generationRunId,
            c.position,
            c.type,
            c.day,
            c.time,
            c.kind,
            c.type === "proposal" ? c.candidatId : null,
            c.type === "proposal" ? JSON.stringify(c.contenu) : null,
          ]);
        }
        const fin = await x.query(SQL_FIN, [organizationId, generationRunId, 6, donnees.statut, ecrite.version, instant.toISOString()]);
        if (fin.rows.length === 0) throw new ArretEtape("step_expired");
        return { version: ecrite.version, dejaPubliee: false };
      });
    } catch (erreur) {
      if (erreur instanceof ArretEtape) throw erreur;
      derniere = erreur;
      if (dependances.maintenant() + DELAI_PORT_MS >= contexte.echeance) break;
    }
  }
  throw derniere instanceof Error ? derniere : new Error("publication");
}
