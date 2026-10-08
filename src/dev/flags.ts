/**
 * Les pages de développement (/dev/…) sont désactivées en production.
 * Elles restent accessibles en développement, ou quand VADROUILLE_DEV_PAGES=1
 * est fourni explicitement (tests Playwright sur le build de production).
 */
export function devPagesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.VADROUILLE_DEV_PAGES === "1";
}
