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
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logEvent, errorNameOf } = await import("@/server/log");
  try {
    const { assertServerProcessEnv, parseServerEnv, ServerEnvError } = await import("@/server/env");
    try {
      parseServerEnv(process.env);
      assertServerProcessEnv(process.env);
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
