// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

import { CONTRAT_INTERNE, IDENTIFIANTS_REFUSES_ACTIONS } from "../../../eslint-rules/route-handlers.mjs";

/**
 * Règle `ligne/route-handlers` (spécification B4, B4a point 7 et critère A20 ; amendement de 0006 ; décision 0097
 * B4-TL-5). Configuration réelle du projet. Les identifiants refusés dans les actions sont lus dans la règle (noms
 * secrets : jamais écrits en texte ici).
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULE = "ligne/route-handlers";

async function messagesFor(code: string, filePath: string, regle = RULE) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === regle) ?? [];
}

const imp = (source: string) => `import { x } from "${source}";\nexport const y = x;\n`;

describe("lint: route handlers (A20)", () => {
  it.each([
    ["src/app/api/v1/webhooks/simulated/route.ts", "@/server/routes/simulated-webhook"],
    ["src/app/api/v1/autre/route.ts", "../../../../server/routes/simulated-webhook"],
    ["tests/db/paiement.test.ts", "@/server/routes/simulated-webhook"],
    ["src/server/env/payment.test.ts", "@/server/routes/simulated-webhook"],
    ["src/server/actions/paiement.ts", "@/contracts"],
    ["src/server/actions/paiement.ts", "stripe"],
    ["src/server/payment/webhook.ts", "@/server/env/payment"],
    ["src/server/routes/simulated-webhook.ts", "@/server/payment/webhook"],
  ])("%s peut importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier)).toHaveLength(0);
  });

  it.each([
    // `@/server/routes/*` hors d'un route.ts de src/app/api.
    ["src/app/page.tsx", "@/server/routes/simulated-webhook"],
    ["src/app/voyages/[id]/page.tsx", "@/server/routes/simulated-webhook"],
    ["src/app/api/v1/webhooks/simulated/autre.ts", "@/server/routes/simulated-webhook"],
    ["src/features/presentation/OfferScreen.tsx", "@/server/routes/simulated-webhook"],
    ["src/server/actions/paiement.ts", "@/server/routes/simulated-webhook"],
    ["src/server/payment/composition.ts", "../routes/simulated-webhook"],
    ["src/adapters/simulated-payment.ts", "@/server/routes"],
    // Un route.ts n'importe rien d'autre de src/server.
    ["src/app/api/v1/webhooks/simulated/route.ts", "@/server/payment/webhook"],
    ["src/app/api/v1/webhooks/simulated/route.ts", "@/server/env"],
    ["src/app/api/v1/webhooks/simulated/route.ts", "../../../../../server/log"],
    // Actions : `@/server/env/payment` et le paquet `stripe` hors de paiement.ts.
    ["src/server/actions/paiement.ts", "@/server/env/payment"],
    ["src/server/actions/compte.ts", "stripe"],
    ["src/server/actions/compte.ts", "stripe/lib/x"],
  ])("%s ne peut pas importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier)).toHaveLength(1);
  });

  it("le route.ts réel est admis par la configuration (règle, restrictions d'import du bloc de src/app/api)", async () => {
    const code = 'import { webhookSimule } from "@/server/routes/simulated-webhook";\n\nexport const POST = webhookSimule;\n';
    const [result] = await eslint.lintText(code, { filePath: "src/app/api/v1/webhooks/simulated/route.ts" });
    expect(result?.messages.filter((m) => m.severity === 2)).toEqual([]);
    const refus = await messagesFor(imp("@/server/payment/webhook"), "src/app/api/v1/webhooks/simulated/route.ts", "no-restricted-imports");
    expect(refus.length).toBeGreaterThan(0);
  });

  it("identifiants de vérification de signature et de secrets des webhooks refusés dans src/server/actions, admis ailleurs et dans les tests", async () => {
    expect(IDENTIFIANTS_REFUSES_ACTIONS.size).toBe(3);
    for (const nom of IDENTIFIANTS_REFUSES_ACTIONS) {
      const code = `export const ${nom} = 1;\n`;
      expect(await messagesFor(code, "src/server/actions/paiement.ts"), nom).toHaveLength(1);
      expect(await messagesFor(code, "src/server/actions/paiement.test.ts"), nom).toHaveLength(0);
      expect(await messagesFor(code, "src/server/payment/exemple.ts"), nom).toHaveLength(0);
    }
  });

  it("`PaymentEvent` et `PaymentEventSchema` refusés depuis @/contracts dans src/features et src/components", async () => {
    for (const nom of CONTRAT_INTERNE) {
      const code = `import { ${nom} } from "@/contracts/billing";\nexport const y = ${nom};\n`;
      expect(await messagesFor(code, "src/features/presentation/Exemple.tsx"), nom).toHaveLength(1);
      expect(await messagesFor(code, "src/components/ligne/Exemple.tsx"), nom).toHaveLength(1);
      expect(await messagesFor(code, "src/server/payment/exemple.ts"), nom).toHaveLength(0);
    }
    expect(await messagesFor('import { CheckoutRequestSchema } from "@/contracts";\nexport const y = CheckoutRequestSchema;\n', "src/features/presentation/Exemple.tsx")).toHaveLength(0);
  });

  it("toutes les formes de chargement sont lues", async () => {
    for (const code of [
      'export { x } from "@/server/routes/simulated-webhook";\n',
      'export * from "@/server/routes/simulated-webhook";\n',
      'export const m = import("@/server/routes/simulated-webhook");\n',
      'import type { X } from "@/server/routes/simulated-webhook";\nexport type Y = X;\n',
    ]) {
      expect(await messagesFor(code, "src/app/exemple.ts"), code).toHaveLength(1);
    }
  });

  it('"use server" refusé dans src/server/routes/ (`ligne/use-server-only-in-actions`)', async () => {
    const code = '"use server";\n\nexport async function agir(): Promise<number> {\n  return 1;\n}\n';
    expect(await messagesFor(code, "src/server/routes/simulated-webhook.ts", "ligne/use-server-only-in-actions")).toHaveLength(1);
  });
});
