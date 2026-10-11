/**
 * Les pages de développement (/dev/…) sont désactivées en production.
 * Elles restent accessibles en développement, ou quand VADROUILLE_DEV_PAGES=1
 * est fourni explicitement (tests Playwright sur le build de production).
 */
export function devPagesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.VADROUILLE_DEV_PAGES === "1";
}

/**
 * Déploiement de production, quel que soit l'hébergeur (décision 0017 § 11.0, créée par F9a selon
 * 0020 § 2.3) : `VADROUILLE_ENV=production` (posé par le `Dockerfile`) ou `VERCEL_ENV=production`.
 * Cette condition ne peut que fermer : elle n'ouvre jamais rien.
 */
export function isProductionDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VADROUILLE_ENV === "production" || env.VERCEL_ENV === "production";
}
