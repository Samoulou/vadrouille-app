import { expect } from "vitest";

import type { AuthAdapter } from "@/adapters/types";

/**
 * Suite de contrat commune de `AuthAdapter` (spécification B3, B3c point 4 ; critère C1) : exécutée sur l'adaptateur
 * simulé (`tests/unit/adapters/auth-contrat.test.ts`, `pnpm test`) et sur l'adaptateur `better-auth`
 * (`tests/db/auth-contrat.test.ts`, `pnpm test:db`, code lu dans le double de capture du port d'envoi ; B3b-envoi la
 * rejoue avec Mailpit, critère E8). Les cas propres au simulé (horloge de portée, plafond d'adresses) restent dans
 * `src/adapters/mock-auth.test.ts`.
 *
 * Cas : code juste ; code faux ; `maxAttempts` essais faux puis `too_many_attempts`, **et encore `too_many_attempts`**
 * à l'essai suivant, code juste compris ; expiration ; renvoi qui invalide l'ancien code (essais remis à zéro) ;
 * déconnexion idempotente ; `getSession` après déconnexion = `null`.
 *
 * Au `maxAttempts`-ième essai faux, les deux adaptateurs ne répondent pas pareil (question au Product Owner, PR de
 * B3c) : le simulé rend `too_many_attempts`, `better-auth` rend `invalid_code` (la bibliothèque compte l'essai et
 * recrée la ligne ; vérifications 7.11 et 7.12 de 0008, test protégé de `tests/db/auth.test.ts`). La suite admet l'un
 * ou l'autre à cet essai, puis exige `too_many_attempts` aux deux essais suivants.
 */
export type BancContrat = {
  readonly adapter: AuthAdapter;
  /** Adresse valide propre à l'appel ; le banc peut en profiter pour changer de client (adresse IP de confiance). */
  adresse(): string;
  /** Dernier code reçu par `email` (double de capture, constante du simulé ou API de Mailpit), ou `undefined`. */
  code(email: string): string | undefined | Promise<string | undefined>;
  /** Fait expirer le code en cours de `email` (horloge de portée, ou échéance reculée en base). */
  expirer(email: string): Promise<void>;
};

const codeFaux = (code: string) => (code === "000000" ? "111111" : "000000");

async function demander(banc: BancContrat, email: string): Promise<string> {
  expect(await banc.adapter.requestCode({ email })).toEqual({ ok: true, value: { sent: true } });
  const code = await banc.code(email);
  expect(code).toMatch(/^[0-9]{6}$/);
  return code as string;
}

export async function executerContratAuth(banc: BancContrat): Promise<void> {
  const { adapter } = banc;
  const { maxAttempts } = adapter.config;
  expect(maxAttempts).toBeGreaterThanOrEqual(2);

  // Code juste : session ouverte, rendue par `getSession`.
  const juste = banc.adresse();
  const ouverte = await adapter.verifyCode({ email: juste, code: await demander(banc, juste) });
  expect(ouverte.ok).toBe(true);
  if (!ouverte.ok) return;
  expect(Object.keys(ouverte.value).sort()).toEqual(["organizationId", "sessionId", "userId"]);
  for (const valeur of Object.values(ouverte.value)) expect(typeof valeur === "string" && valeur.length > 0).toBe(true);
  expect(await adapter.getSession()).toEqual(ouverte.value);

  // Déconnexion idempotente ; `getSession` après déconnexion = `null`.
  await expect(adapter.signOut()).resolves.toBeUndefined();
  expect(await adapter.getSession()).toBeNull();
  await expect(adapter.signOut()).resolves.toBeUndefined();
  expect(await adapter.getSession()).toBeNull();

  // Code faux.
  const faux = banc.adresse();
  const codeFauxRecu = await demander(banc, faux);
  expect(await adapter.verifyCode({ email: faux, code: codeFaux(codeFauxRecu) })).toEqual({ ok: false, error: { code: "invalid_code" } });
  expect(await adapter.getSession()).toBeNull();

  // `maxAttempts` essais faux, puis `too_many_attempts`, et encore à l'essai suivant (code juste compris).
  const bloquee = banc.adresse();
  const codeBloque = await demander(banc, bloquee);
  for (let essai = 1; essai < maxAttempts; essai += 1) {
    expect(await adapter.verifyCode({ email: bloquee, code: codeFaux(codeBloque) })).toEqual({ ok: false, error: { code: "invalid_code" } });
  }
  const dernier = await adapter.verifyCode({ email: bloquee, code: codeFaux(codeBloque) });
  expect([
    { ok: false, error: { code: "invalid_code" } },
    { ok: false, error: { code: "too_many_attempts" } },
  ]).toContainEqual(dernier);
  expect(await adapter.verifyCode({ email: bloquee, code: codeFaux(codeBloque) })).toEqual({ ok: false, error: { code: "too_many_attempts" } });
  expect(await adapter.verifyCode({ email: bloquee, code: codeBloque })).toEqual({ ok: false, error: { code: "too_many_attempts" } });
  expect(await adapter.getSession()).toBeNull();

  // Expiration.
  const expiree = banc.adresse();
  const codeExpire = await demander(banc, expiree);
  await banc.expirer(expiree);
  expect(await adapter.verifyCode({ email: expiree, code: codeExpire })).toEqual({ ok: false, error: { code: "code_expired" } });

  // Renvoi : l'ancien code est invalidé, les essais repartent de zéro.
  const renvoi = banc.adresse();
  const ancien = await demander(banc, renvoi);
  for (let essai = 1; essai < maxAttempts; essai += 1) {
    expect(await adapter.verifyCode({ email: renvoi, code: codeFaux(ancien) })).toEqual({ ok: false, error: { code: "invalid_code" } });
  }
  const nouveau = await demander(banc, renvoi);
  if (nouveau !== ancien) {
    expect(await adapter.verifyCode({ email: renvoi, code: ancien })).toEqual({ ok: false, error: { code: "invalid_code" } });
  }
  const reprise = await adapter.verifyCode({ email: renvoi, code: nouveau });
  expect(reprise.ok).toBe(true);
  // Le code consommé ne rouvre pas de session.
  await adapter.signOut();
  expect((await adapter.verifyCode({ email: renvoi, code: nouveau })).ok).toBe(false);
  expect(await adapter.getSession()).toBeNull();
}
