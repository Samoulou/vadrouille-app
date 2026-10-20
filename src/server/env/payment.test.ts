import { describe, expect, it } from "vitest";

import { parseServerEnv, SERVER_ENV_VARIABLES, type ServerEnvVariable } from "./index";
import { cleWebhookSimule, webhookSimuleOuvert } from "./payment";

/**
 * Module d'environnement du paiement (spécification B4, B4a point 5 ; décision 0097 B4-TL-3 point 5 et B4-TL-7) :
 * prédicat « webhook simulé ouvert » et clé rendue seulement s'il est vrai. Environnements injectés, jamais
 * `process.env` ; clé tirée à l'exécution ; noms secrets en clés d'objet (`NOM`). Les réponses du gestionnaire (A10,
 * A24) sont testées dans `tests/unit/server/env.test.ts`.
 */

type Env = Record<string, string | undefined>;
const NOM = Object.fromEntries(SERVER_ENV_VARIABLES.map((nom) => [nom, nom])) as { readonly [K in ServerEnvVariable]: K };

const aleatoire = () => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32)));
const CLE = aleatoire();

const ouvertWebhook = (extra: Env = {}): Env => ({
  VADROUILLE_ENV: "ci",
  AUTH_ADAPTER: "better-auth",
  [NOM.BETTER_AUTH_SECRET]: aleatoire().toString("base64url"),
  [NOM.BETTER_AUTH_URL]: "http://127.0.0.1:3000",
  [NOM.APP_URL]: "http://127.0.0.1:3000",
  [NOM.VADROUILLE_DATABASE_URL_AUTH]: "postgresql://vadrouille_auth@127.0.0.1:5432/vadrouille",
  [NOM.RATE_LIMIT_HMAC_SECRET]: aleatoire().toString("base64url"),
  [NOM.SIMULATED_WEBHOOK_SECRET]: CLE.toString("base64url"),
  SIMULATED_WEBHOOK_ENABLED: "true",
  PAYMENT_ADAPTER: "simulated",
  DATA_ADAPTER: "api",
  ...extra,
});

describe("env: module du paiement (B4-TL-7)", () => {
  it("ouvert : drapeau exactement `true`, `PAYMENT_ADAPTER=simulated`, `local` ou `ci` ; la clé n'est rendue que si ouvert", () => {
    for (const environnement of ["ci", "local"]) {
      const env = parseServerEnv(ouvertWebhook({ VADROUILLE_ENV: environnement }));
      expect(webhookSimuleOuvert(env)).toBe(true);
      expect(cleWebhookSimule(env)?.equals(CLE)).toBe(true);
    }
    for (const drapeau of [undefined, "TRUE", "1", " true", "true "]) {
      const env = parseServerEnv({ VADROUILLE_ENV: "ci", SIMULATED_WEBHOOK_ENABLED: drapeau, [NOM.SIMULATED_WEBHOOK_SECRET]: CLE.toString("base64url") });
      expect(webhookSimuleOuvert(env)).toBe(false);
      expect(cleWebhookSimule(env)).toBeNull();
    }
    const sansAdaptateur = parseServerEnv({ VADROUILLE_ENV: "ci", SIMULATED_WEBHOOK_ENABLED: "true", [NOM.SIMULATED_WEBHOOK_SECRET]: CLE.toString("base64url") });
    expect(webhookSimuleOuvert(sansAdaptateur)).toBe(false);
    expect(cleWebhookSimule(sansAdaptateur)).toBeNull();
  });
});
