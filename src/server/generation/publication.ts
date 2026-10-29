import "server-only";

import type { TripSnapshot } from "@/contracts";
import type { ExecuteurPublication, ResultatEcriturePositions } from "@/server/composition/generation";
import { RANG_ETAPE, TENTATIVES_PUBLICATION } from "@/server/config/generation";
import { DELAI_PORT_MS } from "@/server/usage/port";
import { ecrireVersion } from "@/server/versions/ecrire";
import { executeurSql } from "@/server/with-org";

import type { CaseApercu } from "./cases";
import { ArretEtape } from "./codes";
import type { DependancesResolues } from "./dependances";
import type { CaseProgramme } from "./cases-programme";
import { gardeOuverteAuRang } from "./garde";

/**
 * Publication de l'aperçu, **une seule transaction** (décision 0081 B9-TL-3 points 4 et 6 ; B9-TL-10 ; spécification B9c
 * point 3, critère `aperçu: une seule transaction de publication`) : sous la garde `step_seq = 6 AND phase = 'preparing'`,
 * la version 1 (`ecrireVersion`, `author_kind` `workflow`, `request_id` de l'exécution, `trips.current_version`), les cases
 * `proposals` (`phase` `preview`) et la fin de l'exécution (`ready` ou `incomplete`, `last_version`). Une erreur de base
 * annule tout. **Positions** (B8c fusionnée ; 0081 B9-TL-9, 0060 § 1.3 « Ce que fait l'appelant ») : quand l'appelant fournit
 * `ecrirePositions` (configuration et interrupteur de suspension, `barriere.ts`), les positions des lieux de la version sont
 * écrites **dans cette transaction** : `perimees` (ou entrée refusée) → la version est écrite sans elles, la transaction
 * continue ; `base` → la transaction est annulée en entier (version comprise) et rejouée si `retryable`, sinon l'étape
 * s'arrête. Ce dossier n'importe jamais le port d'écriture : il reçoit une fonction de la composition.
 *
 * **Rejeu borné** : une erreur de la transaction (connexion perdue, conflit) la rejoue, `TENTATIVES_PUBLICATION` fois au plus,
 * **sans aucun nouvel appel externe** (les données sont déjà en mémoire) et seulement si l'échéance de l'étape le permet. Si la
 * confirmation d'une transaction réussie s'est perdue, le rejeu trouve l'exécution déjà finie (`ready` ou `incomplete`) : il
 * n'écrit rien de plus et rend la publication existante.
 */

export type DonneesPublication = {
  readonly instantane: TripSnapshot;
  readonly cases: readonly (CaseApercu | CaseProgramme)[];
  readonly statut: "ready" | "incomplete";
  /** Écriture des positions de la version dans la transaction de publication ; absente : aucune écriture (suspendue, non autorisée, simulée). */
  readonly ecrirePositions?: (executeur: ExecuteurPublication) => Promise<ResultatEcriturePositions>;
  /**
   * Écritures de plus de la chaîne inversée (décision 0136 § 3 points 2 et 3 ; verdict 0139 § 3 point 1) : `stays.place_id` et
   * lignes « À faire », **dans la même transaction**, après la version et les cases et avant la fin de l'exécution ; rejouées
   * avec elle. Absentes : l'ancienne chaîne, inchangée.
   */
  readonly ecrireDePlus?: (executeur: ExecuteurPublication) => Promise<void>;
  /**
   * Révision de la chaîne inversée (M1b, ticket 868 ; décision 0142) : contrôle fait **sous la garde, dans la transaction**,
   * avant toute écriture (l'appelant y prend le verrou des versions et relit la version courante). Faux : ni version, ni case,
   * ni position, ni écriture de plus ; l'exécution finit quand même sur `statut`, `last_version` nul. Absent : on écrit toujours.
   */
  readonly ecrireSi?: (executeur: ReturnType<typeof executeurSql>) => Promise<boolean>;
};

export type ContextePublication = {
  readonly organizationId: string;
  readonly generationRunId: string;
  readonly tripId: string;
  readonly requestId: string | null;
  readonly echeance: number;
  /**
   * Rang `step_seq` de l'étape qui publie (décision 0136 § 2.2) : `RANG_ETAPE.e` (6) par défaut, l'aperçu de l'ancienne
   * chaîne ; `RANG_PROGRAMME.e` (2) pour `generateProgramme`.
   */
  readonly rang?: number;
};

const SQL_PHASE = `SELECT phase, last_version FROM public.generation_runs WHERE organization_id = $1 AND id = $2`;
const SQL_CASE = `INSERT INTO public.proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, candidate_id, content)
  VALUES ($1, $2, $3, 'preview', $4, $5, $6, $7, $8, $9, $10::jsonb)`;
const SQL_FIN = `UPDATE public.generation_runs SET phase = $4, stop_reason = NULL, last_version = $5, updated_at = $6::timestamptz, finished_at = $6::timestamptz
  WHERE organization_id = $1 AND id = $2 AND step_seq = $3 AND phase = 'preparing' RETURNING id`;

export async function publier(
  dependances: DependancesResolues,
  contexte: ContextePublication,
  donnees: DonneesPublication,
): Promise<{ readonly version: number | null; readonly dejaPubliee: boolean }> {
  const { organizationId, generationRunId, tripId } = contexte;
  const rang = contexte.rang ?? RANG_ETAPE.e;
  if (contexte.requestId === null) throw new ArretEtape("invalid_input");
  const requestId = contexte.requestId;
  for (let tentative = 1; tentative <= TENTATIVES_PUBLICATION; tentative += 1) {
    try {
      return await dependances.transaction(organizationId, async (tx) => {
        const x = executeurSql(tx);
        const instant = new Date(dependances.maintenant());
        if (!(await gardeOuverteAuRang(x, organizationId, generationRunId, rang, instant))) {
          const ligne = (await x.query(SQL_PHASE, [organizationId, generationRunId])).rows[0];
          if (ligne !== undefined && (ligne.phase === "ready" || ligne.phase === "incomplete")) {
            // Révision finie sans version (`ecrireSi` faux, confirmation perdue) : rien de plus, aucune version.
            if (ligne.last_version === null && donnees.ecrireSi !== undefined) return { version: null, dejaPubliee: true };
            const derniere = Number(ligne.last_version);
            if (!Number.isInteger(derniere) || derniere < 1) throw new ArretEtape("step_expired");
            return { version: derniere, dejaPubliee: true };
          }
          throw new ArretEtape("step_expired");
        }
        if (donnees.ecrireSi !== undefined && !(await donnees.ecrireSi(x))) {
          const fin = await x.query(SQL_FIN, [organizationId, generationRunId, rang, donnees.statut, null, instant.toISOString()]);
          if (fin.rows.length === 0) throw new ArretEtape("step_expired");
          return { version: null, dejaPubliee: false };
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
        if (donnees.ecrirePositions !== undefined) {
          const positions = await donnees.ecrirePositions(x);
          if (!positions.ok && positions.code === "base") {
            // Transaction annulée en entier : rejouée dans une nouvelle transaction si l'erreur s'y prête, sinon l'étape s'arrête.
            if (positions.retryable) throw new Error("positions");
            throw new ArretEtape("upstream_error");
          }
        }
        if (donnees.ecrireDePlus !== undefined) await donnees.ecrireDePlus(x);
        const fin = await x.query(SQL_FIN, [organizationId, generationRunId, rang, donnees.statut, ecrite.version, instant.toISOString()]);
        if (fin.rows.length === 0) throw new ArretEtape("step_expired");
        return { version: ecrite.version, dejaPubliee: false };
      });
    } catch (erreur) {
      if (erreur instanceof ArretEtape) throw erreur;
      if (dependances.maintenant() + DELAI_PORT_MS >= contexte.echeance) break;
    }
  }
  // Publication épuisée (panne de base, connexion perdue, positions `base` réessayables) : cause externe passagère, donc
  // `upstream_unavailable` (réessayable, 0081 B9-TL-3 points 2 et 4) ; l'erreur brute, qui peut porter des données, ne sort pas.
  throw new ArretEtape("upstream_unavailable");
}
