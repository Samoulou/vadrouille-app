/**
 * Pages de développement (`/dev/…`), portée des simulations et `R-sim` (décision 0017 § 11.1, **fermées par
 * défaut**) : toujours fermées sur un déploiement de production (`isProductionDeployment`) ; sinon ouvertes
 * seulement en `development` ou `test`, ou quand `VADROUILLE_DEV_PAGES` vaut exactement `1` (tests Playwright sur
 * le build de production). Toute autre valeur de `NODE_ENV` (absente, `staging`, faute de frappe) ferme.
 */
export function devPagesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.VADROUILLE_DEV_PAGES === "1";
}

/**
 * Déploiement de production, quel que soit l'hébergeur (décision 0017 § 11.0, créée par F9a selon
 * 0020 § 2.3) : `VADROUILLE_ENV=production` (posé par le `Dockerfile`) ou `VERCEL_ENV=production`.
 * Cette condition ne peut que fermer : elle n'ouvre jamais rien. **Comparaison tolérante, parce que la garde
 * ferme** (0017 § 11.0, F8b) : chaque valeur est comparée après `trim().toLowerCase()` ; ` Production` ou
 * `PRODUCTION` ferment aussi. Les drapeaux qui ouvrent restent comparés exactement à `1`.
 */
export function isProductionDeployment(env: NodeJS.ProcessEnv = process.env): boolean {
  const normalisee = (value: string | undefined) => value?.trim().toLowerCase();
  return normalisee(env.VADROUILLE_ENV) === "production" || normalisee(env.VERCEL_ENV) === "production";
}

/**
 * Cible de production (décision 0140 § 3 point 6) : prédicat de production **partagé** du paiement Stripe, seule
 * définition de la règle. Vrai si `isProductionDeployment(env)` l'est, **ou** si `VERCEL_TARGET_ENV` (variable que la
 * barrière de sortie lit aussi) vaut `production` après la même normalisation (`trim().toLowerCase()`). Comme
 * `isProductionDeployment`, il ne peut que fermer : il est lu par la garde de `PAYMENT_ADAPTER=stripe` de
 * `parseServerEnv`, par `productionPaiement` (`src/server/env/payment.ts`, qui lit aussi le vrai `process.env`) et par la
 * branche `stripe` de `paymentAvailable()` (`src/adapters/payment-guard.ts`). Lecture non secrète.
 */
export function isProductionTarget(env: NodeJS.ProcessEnv = process.env): boolean {
  return isProductionDeployment(env) || env.VERCEL_TARGET_ENV?.trim().toLowerCase() === "production";
}

/**
 * Liste blanche de l'adaptateur `prototype` (spécification P0, « Comportement de P0b » ; décision 0032 § A4.2),
 * **stricte, sans normalisation** : vraie seulement si toutes les conditions suivantes le sont.
 * 1. `isProductionDeployment(env)` est fausse : évaluée en premier, elle l'emporte toujours.
 * 2. Ni `VADROUILLE_ENV` ni `VERCEL_ENV`, après `trim().toLowerCase()`, ne vaut `production`.
 * 3. `VADROUILLE_ENV` est absente, ou vaut exactement `local` ou `ci`.
 * 4. Et l'un des trois cas, comparé exactement :
 *    - `VERCEL_ENV` vaut `preview` ou `development` ;
 *    - `VERCEL_ENV` est absente et `NODE_ENV` vaut `development` ou `test` ;
 *    - `VERCEL_ENV` est absente, `VADROUILLE_PROTOTYPE` vaut `1` et `CI` vaut exactement `true` (tests
 *      Playwright sur le build de production, en CI seulement : `docs/deploiement/variables-environnement.md`).
 * Toute autre combinaison ferme. Comme `isProductionDeployment`, cette garde ne lit que les variables reçues.
 */
export function prototypeAdapterAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  const normalisee = (value: string | undefined) => value?.trim().toLowerCase();
  if (normalisee(env.VADROUILLE_ENV) === "production" || normalisee(env.VERCEL_ENV) === "production") return false;
  if (env.VADROUILLE_ENV !== undefined && env.VADROUILLE_ENV !== "local" && env.VADROUILLE_ENV !== "ci") return false;
  if (env.VERCEL_ENV !== undefined) return env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development";
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return true;
  return env.VADROUILLE_PROTOTYPE === "1" && env.CI === "true";
}
