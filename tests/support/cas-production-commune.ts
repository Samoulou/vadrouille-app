/**
 * Table de cas commune à la barrière de sortie (`src/server/env/egress.ts`) et à la garde de connexion
 * (`db/connection.ts`) : décision 0046, D21, et son verdict Sécurité. `reel` est le vrai `process.env` (posé par
 * `vi.stubEnv`, rétabli après chaque cas ; une variable absente de l'objet est retirée), `injecte` l'environnement passé
 * en paramètre. Attendus : `egress` (`ok` ou `production_refused`), `prototype` (connexion `vadrouille_prototype`,
 * liste d'autorisation) et `app` (connexions `vadrouille_app` et `vadrouille_auth`, liste de refus).
 */

export type EnvDeploiement = {
  readonly VERCEL_ENV?: string;
  readonly VERCEL_TARGET_ENV?: string;
  readonly VADROUILLE_ENV?: string;
};

export type CasProduction = {
  readonly nom: string;
  readonly reel: EnvDeploiement;
  readonly injecte: EnvDeploiement;
  readonly egress: "ok" | "production_refused";
  readonly prototype: "admise" | "refusee";
  readonly app: "admise" | "refusee";
};

export const CAS_PRODUCTION_COMMUNS: readonly CasProduction[] = [
  {
    nom: "VERCEL_ENV absente des deux côtés (runner, poste, CI)",
    reel: {},
    injecte: {},
    egress: "production_refused",
    prototype: "refusee",
    app: "admise",
  },
  {
    nom: "VERCEL_ENV absente du vrai process.env, preview injectée (CI)",
    reel: {},
    injecte: { VERCEL_ENV: "preview" },
    egress: "production_refused",
    prototype: "refusee",
    app: "admise",
  },
  {
    nom: "preview réelle, VERCEL_ENV absente de l'env injecté",
    reel: { VERCEL_ENV: "preview" },
    injecte: {},
    egress: "production_refused",
    prototype: "refusee",
    app: "admise",
  },
  {
    nom: "preview et VERCEL_TARGET_ENV preview, réels et injectés",
    reel: { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" },
    injecte: { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" },
    egress: "ok",
    prototype: "admise",
    app: "admise",
  },
  {
    nom: "development, réel et injecté",
    reel: { VERCEL_ENV: "development" },
    injecte: { VERCEL_ENV: "development" },
    egress: "ok",
    prototype: "admise",
    app: "admise",
  },
  {
    nom: "VERCEL_ENV production réelle, preview injectée",
    reel: { VERCEL_ENV: "production" },
    injecte: { VERCEL_ENV: "preview" },
    egress: "production_refused",
    prototype: "refusee",
    app: "refusee",
  },
  {
    nom: "VERCEL_TARGET_ENV production réelle, preview injectée",
    reel: { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "production" },
    injecte: { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" },
    egress: "production_refused",
    prototype: "refusee",
    app: "admise",
  },
  {
    nom: "VADROUILLE_ENV production réelle, preview injectée",
    reel: { VERCEL_ENV: "preview", VADROUILLE_ENV: "production" },
    injecte: { VERCEL_ENV: "preview" },
    egress: "production_refused",
    prototype: "refusee",
    app: "refusee",
  },
  {
    nom: "VADROUILLE_ENV Production (casse) réelle",
    reel: { VERCEL_ENV: "preview", VADROUILLE_ENV: " Production " },
    injecte: { VERCEL_ENV: "preview" },
    egress: "production_refused",
    prototype: "refusee",
    app: "refusee",
  },
  {
    nom: "preview réelle, production injectée (l'env injecté resserre)",
    reel: { VERCEL_ENV: "preview" },
    injecte: { VERCEL_ENV: "production" },
    egress: "production_refused",
    prototype: "refusee",
    app: "refusee",
  },
  {
    nom: "preview réelle, VADROUILLE_ENV production injectée",
    reel: { VERCEL_ENV: "preview" },
    injecte: { VERCEL_ENV: "preview", VADROUILLE_ENV: "production" },
    egress: "production_refused",
    prototype: "refusee",
    app: "refusee",
  },
  {
    nom: "valeur inconnue réelle (staging)",
    reel: { VERCEL_ENV: "staging" },
    injecte: { VERCEL_ENV: "preview" },
    egress: "production_refused",
    prototype: "refusee",
    app: "admise",
  },
];
