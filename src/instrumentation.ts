/**
 * Validation de l'environnement au démarrage du serveur (spécification B3, B3a point 2 ; décision 0050, B3-TL-1
 * point 2). Next.js n'appelle `register()` qu'au démarrage d'un serveur (`next start`, `server.js` autonome,
 * `next dev`), jamais pendant `next build` ni sous Vitest.
 *
 * Environnement `nodejs` seulement : `parseServerEnv(process.env)` puis `assertServerProcessEnv(process.env)`. Sur
 * toute erreur, dans les quatre environnements (préversion comprise : 0050, point 2 bis retiré), l'événement
 * `config_invalid` est écrit par `src/server/log.ts` (nom de la variable et code de règle seulement, jamais une
 * valeur) puis le processus s'arrête par `process.exit(1)`. L'erreur n'est jamais relancée : Next.js écrirait son
 * message, sa pile et sa `cause` hors du journal (0051 point 6.1.2).
 *
 * Décisions 0074 et 0079 : environnement valide et adaptateur `prototype`, la barrière de la lecture des programmes
 * réels (`src/server/p0/lecture-programmes.ts`) et le relecteur Routes réel (`src/server/p0/relecture.ts`, même
 * barrière, vérifiée à chaque relecture) sont branchés sur l'adaptateur, ainsi que les déblocages simulés de l'essai
 * retenus par cookie signé (`src/server/essai/deblocage.ts`, spécification E2E-essai, lot 1). Elle ne lit rien ici : chaque lecture la
 * vérifie (garde du mode réel et cookie d'accès), et elle reste fermée hors de la préversion de `p0-reel`. Un échec du
 * branchement est journalisé sans arrêter le serveur : la liste reste vide, comme sans barrière.
 *
 * B3c (spécification B3, B3c point 1) : environnement valide et `AUTH_ADAPTER=better-auth` (admis en `local` et `ci`
 * seulement, B3-TL-2), les opérations de la liste blanche (`authOperations()`), le limiteur (`checkRateLimit`) et le
 * contexte de session (`getServerRequestContext()`) sont branchés sur l'adaptateur `better-auth`
 * (`brancherConnexionReelle`) ; rien n'est lu ni connecté ici (pools créés au premier appel). Un échec du branchement
 * est journalisé sans arrêter le serveur : la connexion reste fermée (`provider_error`, page d'erreur).
 *
 * B6b (spécification B6, B6b point 1 ; décisions 0086 § 2.1 et 0100 § 5.4, amendée par 0108) : environnement valide et `DATA_ADAPTER=api`,
 * la fabrique de l'adaptateur `api` (cas d'usage de B6a sur la source de relectures choisie par
 * `choisirSourceRelectures` : le double de la requête, ou la source réelle de B8b en `local` avec
 * `RELECTURES_SOURCE=google`) est branchée sur `src/adapters/api-instance.ts` ; rien n'est lu ni connecté ici, et la
 * garde (`assertApiAdapter`) reste vérifiée à chaque `getTripAdapter("api")`. Un échec du branchement est journalisé
 * (`voyages.action_failed`, action `branchement`) sans arrêter le serveur : chaque lecture rejette (page d'erreur).
 *
 * B9e (spécification B9, B9e points 1 et 3 ; décision 0081 B9-TL-2 et B9-TL-8, sur le modèle de 0108) : environnement valide
 * et `DATA_ADAPTER=api`, la fabrique de la création (`createApiCreationAdapter`, cas d'usage de `src/server/creation/`) est
 * branchée sur `src/adapters/api-creation-instance.ts`. Rien n'est lu ni connecté ici ; la garde (`assertApiAdapter`) reste
 * vérifiée à chaque `getCreationAdapter("api")`, et la barrière des appels réels (B9-TL-8) à l'entrée de chaque étape de la
 * génération. Un échec du branchement est journalisé (`voyages.action_failed`, action `branchement-creation`) sans arrêter
 * le serveur : chaque action de création rend `provider_error`.
 *
 * B10a (spécification B10, B10a points 2 à 4 ; décision 0112 § 2 point 3, sur le modèle de B9e) : environnement valide et
 * `DATA_ADAPTER=api`, les cas d'usage du tri enregistré (`src/server/presentation/tri.ts`) sont branchés sur
 * `src/adapters/api-tri-instance.ts`. Rien n'est lu ni connecté ici. Un échec du branchement est journalisé
 * (`voyages.action_failed`, action `branchement-tri`) sans arrêter le serveur : chaque action du tri rend `internal`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logEvent, errorNameOf } = await import("@/server/log");
  try {
    const { assertServerProcessEnv, parseServerEnv, ServerEnvError } = await import("@/server/env");
    try {
      parseServerEnv(process.env);
      assertServerProcessEnv(process.env);
      await brancherLecturePrototype(logEvent, errorNameOf);
      await brancherConnexion(logEvent, errorNameOf);
      await brancherLectureApi(logEvent, errorNameOf);
      await brancherCreationApi(logEvent, errorNameOf);
      await brancherTriApi(logEvent, errorNameOf);
      return;
    } catch (error) {
      if (!(error instanceof ServerEnvError)) throw error;
      logEvent("config_invalid", { variable: error.variable, rule: error.rule }, "error");
    }
  } catch (error) {
    logEvent("config_invalid", { errorName: errorNameOf(error) }, "error");
  }
  process.exit(1);
}

/** Branche la barrière de lecture et le relecteur réel sur l'adaptateur `prototype` (décisions 0074 et 0079). */
async function brancherLecturePrototype(
  logEvent: typeof import("@/server/log").logEvent,
  errorNameOf: typeof import("@/server/log").errorNameOf,
): Promise<void> {
  try {
    const { isPrototypeAdapter } = await import("@/adapters/payment-guard");
    if (!isPrototypeAdapter()) return;
    const { brancherLectureProgrammesReels } = await import("@/adapters/prototype-instance");
    const { poolLectureProgrammes } = await import("@/server/p0/lecture-programmes");
    const { creerRelecteurReel } = await import("@/server/p0/relecture");
    brancherLectureProgrammesReels(() => poolLectureProgrammes(), creerRelecteurReel());
  } catch (error) {
    logEvent("p0.read_unavailable", { errorName: errorNameOf(error) }, "error");
    return;
  }
  try {
    // Spécification E2E-essai, lot 1 : déblocage simulé d'un voyage d'essai retenu par cookie signé (clé tirée du code
    // d'accès, garde du mode réel ouverte seulement ; rien n'est lu ici). Échec : seul le droit simulé de la portée reste.
    const { brancherDeblocagesEssai } = await import("@/adapters/prototype-instance");
    const { deblocagesEssaiParCookie } = await import("@/server/essai/deblocage");
    brancherDeblocagesEssai(deblocagesEssaiParCookie);
  } catch (error) {
    logEvent("essai.unlock_unavailable", { errorName: errorNameOf(error) }, "error");
  }
  try {
    // Spécification E2E-essai, lot 3 : création d'un voyage d'essai depuis l'app (lancement de `p0Run` sur le brief saisi,
    // même garde que `/prototype/executions`, et avancement). Rien n'est lu ici. Échec : la création rend `provider_error`.
    const { brancherCreationEssai } = await import("@/adapters/prototype-instance");
    const { creationEssai } = await import("@/server/p0/creation-essai");
    brancherCreationEssai(creationEssai);
  } catch (error) {
    logEvent("essai.creation_unavailable", { errorName: errorNameOf(error) }, "error");
  }
}

/** Branche la connexion réelle sur l'adaptateur `better-auth` (spécification B3, B3c point 1). */
async function brancherConnexion(
  logEvent: typeof import("@/server/log").logEvent,
  errorNameOf: typeof import("@/server/log").errorNameOf,
): Promise<void> {
  try {
    const { authAdapterChoice } = await import("@/adapters/auth-guard");
    if (authAdapterChoice() !== "better-auth") return;
    const { brancherConnexionReelle } = await import("@/adapters/better-auth");
    const { authOperations } = await import("@/server/auth");
    const { checkRateLimit } = await import("@/server/rate-limit");
    const { getServerRequestContext } = await import("@/server/session");
    brancherConnexionReelle({ operations: authOperations, limiter: checkRateLimit, contexte: getServerRequestContext });
  } catch (error) {
    logEvent("auth.operation_failed", { action: "branchement", errorName: errorNameOf(error) }, "error");
  }
}

/** Branche la fabrique de l'adaptateur `api` (spécification B6, B6b point 1). */
async function brancherLectureApi(
  logEvent: typeof import("@/server/log").logEvent,
  errorNameOf: typeof import("@/server/log").errorNameOf,
): Promise<void> {
  try {
    const { isMockAdapter, isPrototypeAdapter } = await import("@/adapters");
    if (isMockAdapter() || isPrototypeAdapter()) return;
    const { brancherLectureVoyages } = await import("@/adapters/api-instance");
    const { createApiTripAdapter } = await import("@/adapters/api");
    const { choisirSourceRelectures } = await import("@/server/composition/lecture");
    brancherLectureVoyages((double) => createApiTripAdapter({ relectures: choisirSourceRelectures(double) }));
  } catch (error) {
    const errorName = errorNameOf(error);
    logEvent("voyages.action_failed", { action: "branchement", ...(errorName === undefined ? {} : { errorName }) }, "error");
  }
}

/** Branche la fabrique de la création sur l'adaptateur `api` (spécification B9, B9e point 1). */
async function brancherCreationApi(
  logEvent: typeof import("@/server/log").logEvent,
  errorNameOf: typeof import("@/server/log").errorNameOf,
): Promise<void> {
  try {
    const { isMockAdapter, isPrototypeAdapter } = await import("@/adapters");
    if (isMockAdapter() || isPrototypeAdapter()) return;
    const { brancherCreationVoyages } = await import("@/adapters/api-creation-instance");
    const { createApiCreationAdapter } = await import("@/adapters/api-creation");
    brancherCreationVoyages(() => createApiCreationAdapter());
  } catch (error) {
    const errorName = errorNameOf(error);
    logEvent("voyages.action_failed", { action: "branchement-creation", ...(errorName === undefined ? {} : { errorName }) }, "error");
  }
}

/** Branche les cas d'usage du tri enregistré sur l'adaptateur `api` (spécification B10, B10a ; décision 0112 § 2 point 3). */
async function brancherTriApi(
  logEvent: typeof import("@/server/log").logEvent,
  errorNameOf: typeof import("@/server/log").errorNameOf,
): Promise<void> {
  try {
    const { isMockAdapter, isPrototypeAdapter } = await import("@/adapters");
    if (isMockAdapter() || isPrototypeAdapter()) return;
    const { brancherTriEnregistre } = await import("@/adapters/api-tri-instance");
    const { annulerDecision, cloreTri, deciderCarte, repondreQuestion } = await import("@/server/presentation/tri");
    brancherTriEnregistre({ decideCard: deciderCarte, undoDecision: annulerDecision, answerPreferencePrompt: repondreQuestion, completeDeck: cloreTri });
  } catch (error) {
    const errorName = errorNameOf(error);
    logEvent("voyages.action_failed", { action: "branchement-tri", ...(errorName === undefined ? {} : { errorName }) }, "error");
  }
}
