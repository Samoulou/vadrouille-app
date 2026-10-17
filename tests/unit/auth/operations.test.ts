// @vitest-environment node
import { randomBytes } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { describe, expect, it } from "vitest";

import * as moduleAuth from "@/server/auth";
import * as moduleEnvoi from "@/server/auth/envoi";
import * as moduleReprise from "@/server/auth/reprise";
import { disabledCodeMailer } from "@/server/mail/disabled";

import type { Database } from "../../../db/index";
import * as schema from "../../../db/schema/index";

/**
 * Opérations de la liste blanche (spécification B3, B3b point 4 ; critère B3, partie « exports ») et vérification
 * 7.13 de Better Auth 1.7.7, sans base : client Drizzle simulé (aucune requête n'est faite par ces cas).
 */

const configuration = (secret: Buffer | null = randomBytes(32)) => {
  const database = drizzle.mock({ schema }) as unknown as Database;
  return {
    environment: "ci" as const,
    secret,
    baseUrl: "http://127.0.0.1:3999",
    appUrl: "http://127.0.0.1:3999",
    trustedIpHeader: null,
    database,
    verrous: database,
    mailer: disabledCodeMailer,
  };
};

/** Toute valeur atteignable en profondeur 2 depuis un export : jamais l'objet `auth`, jamais une propriété `api`. */
function valeursAtteintes(valeur: unknown): unknown[] {
  if ((typeof valeur !== "object" && typeof valeur !== "function") || valeur === null) return [valeur];
  return [valeur, ...Object.values(valeur as object)];
}

describe("exports", () => {
  it("auth: seules les opérations de la liste blanche sont appelées", () => {
    // Partie « exports » du critère B3 ; la partie « lint » est `tests/unit/lint/better-auth-lint.test.ts`.
    const exports = [moduleAuth, moduleEnvoi, moduleReprise].flatMap((m) => Object.values(m));
    expect(exports.length).toBeGreaterThan(0);
    const operations = moduleAuth.createAuthOperations(configuration());
    for (const valeur of [...exports, operations].flatMap(valeursAtteintes)) {
      if ((typeof valeur === "object" || typeof valeur === "function") && valeur !== null) {
        expect(Object.hasOwn(valeur, "api")).toBe(false);
        expect("api" in valeur).toBe(false);
        expect(Object.hasOwn(valeur, "handler")).toBe(false);
        expect(Object.hasOwn(valeur, "$context")).toBe(false);
      }
    }
    expect(Object.keys(operations).sort()).toEqual(["readSession", "requestCode", "signOut", "verifyCode"]);
    expect(Object.isFrozen(operations)).toBe(true);
    expect(Object.keys(moduleAuth).sort()).toEqual(["AuthNotConfiguredError", "authOperations", "createAuthOperations"]);
  });
});


describe("configuration injectée", () => {
  it("sans secret dans la configuration injectée : provider_error à l'usage (critère C6), aucun appel", async () => {
    const operations = moduleAuth.createAuthOperations(configuration(null));
    expect(await operations.signOut(new Headers())).toEqual({ ok: false, code: "provider_error" });
    expect(await operations.readSession(new Headers())).toBeNull();
  });
});
