import "server-only";

import { sleep } from "workflow";
import { start } from "workflow/api";

import { rappelsDuServeur } from "@/server/auth";
import { ECHECS_CONSECUTIFS_MAX, RELAIS_ESSAIS_MAX, RELAIS_JOURS } from "@/server/config/rappels";
import { logEvent } from "@/server/log";
import type { EtatRappel, SuiteRappel } from "@/server/rappels/etat";
import { reveillerRappel } from "@/server/rappels/envoi";

import { REGION_WORKFLOWS } from "./region";

/**
 * Workflow 7, `rappelsVeille` (M6c, ticket 1021 ; spécification M6 § 5.3 ; décision 0157 § 1.7) : le pont qui **câble** le
 * réveil de `src/server/rappels/envoi.ts`, sans règle métier. Importé par `src/workflows/index.ts` seulement. Une exécution
 * par **accord**, démarrée par `setTripReminders` après l'écriture de l'accord.
 *
 * - **Boucle** : une étape `etapeReveil` relit tout en base, envoie au plus le rappel de la journée du lendemain et rend la
 *   suite (`fin`, ou une attente bornée à 24 heures) ; le workflow dort (`sleep`, minuterie du moteur, jamais un service
 *   propre à Vercel, 0002) puis recommence. Le premier réveil a lieu au démarrage.
 * - **État sérialisé** : `{ organizationId, tripId, userId, consentId }` (`EtatRappelSchema`) ; la sortie d'une étape est
 *   `SuiteRappelSchema` (fin, ou attente en millisecondes). Ni adresse, ni texte, ni donnée Google.
 * - **Reprises** : aucune (`maxRetries` 0) : la réclamation par journée est validée avant l'envoi, et aucune nouvelle tentative
 *   n'est faite après un échec (0138 C4) ; une panne rend une attente d'une heure, au plus `ECHECS_CONSECUTIFS_MAX` fois de
 *   suite, puis fin journalisée (`rappels.abandoned`, nom seul ; revue de la PR 1024, mineur 3 du Tech Lead).
 * - **Relais** (0157 § 1.7 point 8) : une exécution reprend sur le code du déploiement qui l'a démarrée (Workflow SDK 5.1.0,
 *   « Versioning ») ; après `RELAIS_JOURS` (7) jours de sommeil cumulé, l'étape `etapeRelais` démarre une exécution qui lui
 *   succède pour le même accord, sur le dernier déploiement (`deploymentId: "latest"`, sans effet hors du monde Vercel), et
 *   l'exécution ne se termine **que si ce démarrage a réussi** (revue de la PR 1024, bloquant 1 du Tech Lead). En échec
 *   (`rappels.relay_failed`), elle continue ses réveils et réessaie avant chaque sommeil, au plus `RELAIS_ESSAIS_MAX` fois,
 *   puis se termine (`rappels.abandoned`). La succession n'est pas réclamée en base : écart accepté provisoirement par le
 *   Tech Lead (revue de la PR 1024) tant que `RAPPELS_ENVOI_REEL` est faux ; voir la décision du Tech Lead à venir sur le
 *   relais (table `reminder_relays`, tâche future). Un double relais ne double aucun envoi (réclamation par journée).
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

/** Fin sur pannes répétées (réveils ou relais) : une ligne, nom seul (revue de la PR 1024, mineur 3 du Tech Lead). */
export async function etapeAbandon(): Promise<void> {
  "use step";
  logEvent("rappels.abandoned", {}, "warn");
}
etapeAbandon.maxRetries = 0;

/** Workflow 7 : rappels la veille de chaque journée, pour un accord, jusqu'à la veille du dernier jour. */
export async function rappelsVeille(entree: EtatRappel): Promise<void> {
  "use workflow";
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
      // Fin seulement si le successeur a démarré ; sinon, la boucle continue (essais bornés).
      if (await etapeRelais(entree)) return;
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
