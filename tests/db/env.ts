/** Variables de connexion des tests de base (`pnpm test:db`) ; en CI, posées par le job `db` (mots de passe jetables). */
export const DB_ENV = {
  app: "VADROUILLE_DATABASE_URL",
  auth: "VADROUILLE_DATABASE_URL_AUTH",
  migrator: "VADROUILLE_DATABASE_URL_MIGRATOR",
  admin: "VADROUILLE_DB_ADMIN_URL",
} as const;
