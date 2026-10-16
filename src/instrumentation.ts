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
 * Décision 0074 : environnement valide et adaptateur `prototype`, la barrière de la lecture des programmes réels
 * (`src/server/p0/lecture-programmes.ts`) est branchée sur l'adaptateur. Elle ne lit rien ici : chaque lecture la
 * vérifie (garde du mode réel et cookie d'accès), et elle reste fermée hors de la préversion de `p0-reel`. Un échec du
 * branchement est journalisé sans arrêter le serveur : la liste reste vide, comme sans barrière.
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

/** Branche la barrière de lecture des programmes réels sur l'adaptateur `prototype` (décision 0074). */
async function brancherLecturePrototype(
  logEvent: typeof import("@/server/log").logEvent,
  errorNameOf: typeof import("@/server/log").errorNameOf,
): Promise<void> {
  try {
    const { brancherLectureProgrammesReels, isPrototypeAdapter } = await import("@/adapters");
    if (!isPrototypeAdapter()) return;
    const { poolLectureProgrammes } = await import("@/server/p0/lecture-programmes");
    brancherLectureProgrammesReels(() => poolLectureProgrammes());
  } catch (error) {
    logEvent("p0.read_unavailable", { errorName: errorNameOf(error) }, "error");
  }
}
