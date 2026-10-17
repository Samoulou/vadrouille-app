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
 * barrière, vérifiée à chaque relecture) sont branchés sur l'adaptateur. Elle ne lit rien ici : chaque lecture la
 * vérifie (garde du mode réel et cookie d'accès), et elle reste fermée hors de la préversion de `p0-reel`. Un échec du
 * branchement est journalisé sans arrêter le serveur : la liste reste vide, comme sans barrière.
 *
 * B3c (spécification B3, B3c point 1) : environnement valide et `AUTH_ADAPTER=better-auth` (admis en `local` et `ci`
 * seulement, B3-TL-2), les opérations de la liste blanche (`authOperations()`), le limiteur (`checkRateLimit`) et le
 * contexte de session (`getServerRequestContext()`) sont branchés sur l'adaptateur `better-auth`
 * (`brancherConnexionReelle`) ; rien n'est lu ni connecté ici (pools créés au premier appel). Un échec du branchement
 * est journalisé sans arrêter le serveur : la connexion reste fermée (`provider_error`, page d'erreur).
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
