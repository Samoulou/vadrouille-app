import "server-only";

import { getWorkflowMetadata, sleep } from "workflow";
import { start } from "workflow/api";

import { rappelsDuServeur } from "@/server/auth";
import { ECHECS_CONSECUTIFS_MAX, RELAIS_ESSAIS_MAX, RELAIS_JOURS } from "@/server/config/rappels";
import { logEvent } from "@/server/log";
import type { EtatRappel, SuiteRappel } from "@/server/rappels/etat";
import { reveillerRappel } from "@/server/rappels/envoi";
import { reclamerRelais, type IssueRelais } from "@/server/rappels/relais";

import { REGION_WORKFLOWS } from "./region";

/**
 * Workflow 7, `rappelsVeille` (M6c, ticket 1021 ; spécification M6 § 5.3 ; décision 0157 § 1.7) : le pont qui **câble** le
 * réveil de `src/server/rappels/envoi.ts`, sans règle métier. Importé par `src/workflows/index.ts` seulement. Une exécution
 * par **accord**, démarrée par `setTripReminders` après l'écriture de l'accord.
 *
 * - **Boucle** : une étape `etapeReveil` relit tout en base, envoie au plus le rappel de la journée du lendemain et rend la
 *   suite (`fin`, ou une attente bornée à 24 heures) ; le workflow dort (`sleep`, minuterie du moteur, jamais un service
 *   propre à Vercel, 0002) puis recommence. Le premier réveil a lieu au démarrage.
 * - **État sérialisé** : `{ organizationId, tripId, userId, consentId, relayN? }` (`EtatRappelSchema`) ; `relayN` est le numéro
 *   de génération de l'exécution dans la chaîne des relais de l'accord (absent = génération 0, état à quatre clés des
 *   exécutions démarrées par `setTripReminders` ou par le code d'avant R-B) ; la sortie d'une étape est `SuiteRappelSchema`
 *   (fin, ou attente en millisecondes). Ni adresse, ni texte, ni donnée Google.
 * - **Reprises** : aucune (`maxRetries` 0) : la réclamation par journée est validée avant l'envoi, et aucune nouvelle tentative
 *   n'est faite après un échec (0138 C4) ; une panne rend une attente d'une heure, au plus `ECHECS_CONSECUTIFS_MAX` fois de
 *   suite, puis fin journalisée (`rappels.abandoned`, nom seul ; revue de la PR 1024, mineur 3 du Tech Lead).
 * - **Relais** (0157 § 1.7 point 8, amendé par 0162) : une exécution reprend sur le code du déploiement qui l'a démarrée
 *   (Workflow SDK 5.1.0, « Versioning ») ; après `RELAIS_JOURS` (7) jours de sommeil cumulé, elle **réclame d'abord en base**
 *   la génération suivante (`etapeReclamationRelais`, insertion d'une ligne `reminder_relays`, clé
 *   `(organization_id, consent_id, relay_n)`, `src/server/rappels/relais.ts` ; décision 0162 § 3), puis l'étape
 *   `etapeRelais` démarre l'exécution qui lui succède pour le même accord, avec `relayN` de la génération réclamée, sur le
 *   dernier déploiement (`deploymentId: "latest"`, sans effet hors du monde Vercel). Issue de la réclamation : `acquise`
 *   (insérée, ou déjà tenue par cette exécution, étape rejouée) → démarrage ; `doublon` (une autre exécution tient la
 *   génération) → `rappels.relay_duplicate` (nom seul, `info`) et fin, sans démarrage ; `fin` (accord absent ou retiré) →
 *   fin ; `panne` → comptée comme un essai de relais en échec. La réclamation n'est **jamais refaite** par la même
 *   exécution : les essais suivants de `start` portent sur la génération déjà réclamée. L'exécution ne se termine **que si
 *   le démarrage a réussi** (revue de la PR 1024, bloquant 1 du Tech Lead) ; en échec (`rappels.relay_failed`), elle
 *   continue ses réveils et réessaie avant chaque sommeil, au plus `RELAIS_ESSAIS_MAX` essais (réclamations en panne et
 *   démarrages en échec), puis se termine (`rappels.abandoned`). Une seule exécution par génération réclame la suivante ;
 *   deux successeurs d'une même génération peuvent encore vivre jusqu'au relais suivant (démarrage réussi mais rapporté en
 *   échec, 0162 § 5 cas 2), où l'un des deux se termine en `doublon`. Aucun double relais ne double un envoi (réclamation
 *   par journée, `reminder_sends`).
 */

const JOUR_MS = 86_400_000;

export async function etapeReveil(entree: EtatRappel): Promise<SuiteRappel> {
  "use step";
  return reveillerRappel(entree, { composer: rappelsDuServeur });
}
etapeReveil.maxRetries = 0;

export async function etapeRelais(entree: EtatRappel): Promise<boolean> {
  "use step";
  try {
    await start(rappelsVeille, [entree], { region: REGION_WORKFLOWS, deploymentId: "latest" });
    return true;
  } catch {
    // Nom seul : ni l'état, ni le message du SDK.
    logEvent("rappels.relay_failed", {}, "warn");
    return false;
  }
}
etapeRelais.maxRetries = 0;

/**
 * Réclamation en base de la génération `relayN` par l'exécution `runId`, avant tout démarrage (décision 0162 § 3 point 3).
 * `doublon` (une autre exécution tient la génération) : `rappels.relay_duplicate`, nom seul, `info`, écrit dans l'étape
 * (une ligne par réclamation, jamais rejouée par le corps du workflow).
 */
export async function etapeReclamationRelais(entree: EtatRappel, relayN: number, runId: string): Promise<IssueRelais> {
  "use step";
  const issue = await reclamerRelais(entree, { relayN, runId });
  if (issue === "doublon") logEvent("rappels.relay_duplicate", {}, "info");
  return issue;
}
etapeReclamationRelais.maxRetries = 0;

/** Fin sur pannes répétées (réveils ou relais) : une ligne, nom seul (revue de la PR 1024, mineur 3 du Tech Lead). */
export async function etapeAbandon(): Promise<void> {
  "use step";
  logEvent("rappels.abandoned", {}, "warn");
}
etapeAbandon.maxRetries = 0;

/** Workflow 7 : rappels la veille de chaque journée, pour un accord, jusqu'à la veille du dernier jour. */
export async function rappelsVeille(entree: EtatRappel): Promise<void> {
  "use workflow";
  // Identifiant de cette exécution, lu une fois : reconnaît une réclamation rejouée (0162 § 2 point 2).
  const { workflowRunId } = getWorkflowMetadata();
  // Génération du successeur (absent = génération 0, 0162 § 3 point 1) et son état.
  const generation = (entree.relayN ?? 0) + 1;
  const successeur: EtatRappel = { ...entree, relayN: generation };
  let reclame = false;
  let dormi = 0;
  let echecs = 0;
  let relaisEchoues = 0;
  for (;;) {
    const suite = await etapeReveil(entree);
    if (suite.suite === "fin") return;
    echecs = suite.echec === true ? echecs + 1 : 0;
    if (echecs >= ECHECS_CONSECUTIFS_MAX) {
      await etapeAbandon();
      return;
    }
    if (dormi + suite.attenteMs > RELAIS_JOURS * JOUR_MS) {
      // Réclamation d'abord, une seule fois ; puis démarrage du successeur. Fin seulement si le successeur a démarré, si
      // une autre exécution tient la génération (`doublon`) ou si l'accord n'est plus actif (`fin`) ; sinon, la boucle
      // continue (essais bornés : réclamations en panne et démarrages en échec).
      if (!reclame) {
        const issue = await etapeReclamationRelais(entree, generation, workflowRunId);
        if (issue === "fin" || issue === "doublon") return;
        reclame = issue === "acquise";
      }
      if (reclame && (await etapeRelais(successeur))) return;
      relaisEchoues += 1;
      if (relaisEchoues >= RELAIS_ESSAIS_MAX) {
        await etapeAbandon();
        return;
      }
    }
    await sleep(suite.attenteMs);
    dormi += suite.attenteMs;
  }
}
