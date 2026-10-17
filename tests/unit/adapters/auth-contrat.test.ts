// @vitest-environment node
import { randomBytes } from "node:crypto";

import { describe, it } from "vitest";

import { createMockAuthAdapter } from "@/adapters/mock-auth";
import type { AuthStore } from "@/adapters/simulation";
import { MOCK_AUTH_CODE } from "@/mocks/auth-simule";

import { executerContratAuth } from "../../support/auth-contrat";

/**
 * Critère C1 de B3 (B3c point 4), côté simulé (`pnpm test`) : la suite de `tests/support/auth-contrat.ts` sur
 * l'adaptateur `mock`, horloge de portée manuelle. Côté `better-auth` : `tests/db/auth-contrat.test.ts`.
 */
describe("contrat auth : mock", () => {
  it("adaptateurs: mock et better-auth passent la même suite de contrat auth", async () => {
    let instant = Date.UTC(2026, 9, 17, 9);
    const store: AuthStore = { addresses: new Map(), session: null };
    const adapter = createMockAuthAdapter({ now: () => instant, store, key: randomBytes(32), maxAddresses: 100 });
    let suivante = 0;
    await executerContratAuth({
      adapter,
      adresse: () => `contrat-${(suivante += 1)}@exemple.test`,
      code: () => MOCK_AUTH_CODE,
      expirer: async () => {
        instant += adapter.config.codeTtlMs + 1;
      },
    });
  });
});
