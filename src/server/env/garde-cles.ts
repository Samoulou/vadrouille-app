/**
 * Garde « aucune clé dans l'environnement des tests » (spécification `specs/P0-suite-executions-reelles.md`,
 * « Aucune clé dans les tests » ; spécification P0c, section 4, « Clés »). La mise en place de Vitest
 * (`tests/unit/setup.ts`) et celle de Playwright (`playwright.config.ts`) échouent si l'une de ces variables est posée.
 * Ne rend que des libellés fermés, jamais une valeur.
 *
 * Exception à `ligne/require-server-only` (déclarée dans `eslint.config.mjs`) : ce module est chargé par la
 * configuration de Playwright, hors de Next.js, où `import "server-only"` lèverait une erreur. Il ne lit aucune
 * valeur qu'il rende.
 */

export type CleDeService = "modeles" | "google" | "passerelle" | "oidc";

export function clesDeServicePosees(env: Readonly<Record<string, string | undefined>> = process.env): readonly CleDeService[] {
  const posees: CleDeService[] = [];
  if (env.OPENROUTER_API_KEY !== undefined && env.OPENROUTER_API_KEY !== "") posees.push("modeles");
  if (env.GOOGLE_MAPS_SERVER_KEY !== undefined && env.GOOGLE_MAPS_SERVER_KEY !== "") posees.push("google");
  if (env.AI_GATEWAY_API_KEY !== undefined && env.AI_GATEWAY_API_KEY !== "") posees.push("passerelle");
  if (env.VERCEL_OIDC_TOKEN !== undefined && env.VERCEL_OIDC_TOKEN !== "") posees.push("oidc");
  return posees;
}
