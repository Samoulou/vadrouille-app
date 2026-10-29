// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Règle `ligne/server-env-imports` (P0r1, `p0: modules d'environnement étroits`, partie lint ; décision 0031 § 6) :
 * les modules de `src/server/env/` ne sont importés que depuis les dossiers permis. Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const RULE = "ligne/server-env-imports";

async function messagesFor(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === RULE) ?? [];
}

const imp = (source: string) => `import { x } from "${source}";\nexport const y = x;\n`;

describe("p0: modules d'environnement étroits (lint des imports)", () => {
  const ADMIS: [string, string][] = [
    ["src/ai/exemple.ts", "@/server/env/ai"],
    ["src/ai/sous/exemple.ts", "@/server/env/egress"],
    ["src/grounding/exemple.ts", "@/server/env/grounding"],
    ["src/grounding/exemple.ts", "@/server/env/egress"],
    ["src/research/undici-transport.ts", "@/server/env/egress"],
    ["src/server/env/ai.ts", "./egress"],
    ["src/server/env/exemple.test.ts", "@/server/env/ai"],
    ["tests/unit/setup.ts", "@/server/env/garde-cles"],
    ["playwright.config.ts", "./src/server/env/garde-cles"],
    // B3a (décision 0050, B3-TL-1 point 1) : index, resolve, payment.
    ["src/instrumentation.ts", "@/server/env"],
    ["src/server/rate-limit.ts", "@/server/env"],
    // B3b (décision 0077 § 5.1) : opérations de connexion.
    ["src/server/auth/index.ts", "@/server/env"],
    ["tests/unit/server/env.test.ts", "@/server/env"],
    ["tests/unit/server/env.test.ts", "@/server/env/resolve"],
    ["db/connection.ts", "../src/server/env/resolve.ts"],
    ["src/server/env/index.ts", "./resolve"],
    // B4a (décision 0097 B4-TL-3 point 5 (e)) : deux importateurs nommés, pour `index` comme pour `payment`.
    ["src/server/payment/composition.ts", "@/server/env/payment"],
    ["src/server/routes/simulated-webhook.ts", "@/server/env/payment"],
    ["src/server/payment/composition.ts", "@/server/env"],
    ["src/server/routes/simulated-webhook.ts", "@/server/env"],
    ["src/server/env/payment.test.ts", "./payment"],
    // B4c (décision 0140 § 6 ligne 10) : composition du paiement Stripe et webhook Stripe, pour `index` et `payment` ;
    // fabrique commune des webhooks, pour `index` seulement (classe `ServerEnvError`).
    ["src/server/payment/composition-stripe.ts", "@/server/env/payment"],
    ["src/server/routes/stripe-webhook.ts", "@/server/env/payment"],
    ["src/server/payment/composition-stripe.ts", "@/server/env"],
    ["src/server/routes/stripe-webhook.ts", "@/server/env"],
    ["src/server/routes/webhook-commun.ts", "@/server/env"],
    // P0r3b (décision 0055, section 1 point 2) : module étroit du mode réel, deux importateurs nommés.
    ["src/server/p0/garde.ts", "@/server/env/p0"],
    ["src/server/p0/acces.ts", "@/server/env/p0"],
    // P0r3d (ticket 354) : le lancement, pour le commit du déploiement.
    ["src/server/p0/lancement.ts", "@/server/env/p0"],
    ["src/server/env/p0.test.ts", "./p0"],
    ["src/server/env/p0.ts", "@/server/env/index"],
    // B8b (décision 0100 § 5.3) : module étroit de la lecture, importé par la composition de la lecture seule.
    ["src/server/composition/lecture.ts", "@/server/env/relectures"],
    ["src/server/env/relectures.test.ts", "./relectures"],
    ["src/server/env/relectures.ts", "@/server/env/resolve"],
    // B9c (décision 0081 B9-TL-8) : déclarations de la barrière des appels réels, importées par la barrière seule.
    ["src/server/generation/barriere.ts", "@/server/env/generation"],
    ["src/server/env/generation.test.ts", "./generation"],
    // B3d (M2a ; décision 0138 § 9, ligne 7) : clé de Resend, importée par l'implémentation Resend seule.
    ["src/server/mail/resend.ts", "@/server/env/cle-resend"],
    ["src/server/env/cle-resend.test.ts", "./cle-resend"],
    ["src/server/env/cle-resend.ts", "@/server/env/index"],
  ];
  it.each(ADMIS)("%s peut importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier)).toHaveLength(0);
  });

  const REFUSES: [string, string][] = [
    // B8b : `relectures` hors de la composition de la lecture.
    ["src/server/composition/p0-reel.ts", "@/server/env/relectures"],
    // B9c : `generation` hors de la barrière.
    ["src/server/generation/etapes.ts", "@/server/env/generation"],
    ["src/server/composition/generation.ts", "@/server/env/generation"],
    ["src/workflows/apercu.ts", "@/server/env/generation"],
    ["src/server/composition/clients-google.ts", "@/server/env/relectures"],
    ["src/server/relecture/source.ts", "@/server/env/relectures"],
    ["src/server/voyages/lecture.ts", "@/server/env/relectures"],
    ["src/adapters/index.ts", "@/server/env/relectures"],
    ["src/grounding/exemple.ts", "@/server/env/relectures"],
    ["tests/unit/exemple.test.ts", "@/server/env/relectures"],
    ["src/grounding/exemple.ts", "@/server/env/ai"],
    ["src/ai/exemple.ts", "@/server/env/grounding"],
    ["src/research/agent.ts", "@/server/env/egress"],
    ["src/research/fetch-page.ts", "@/server/env/ai"],
    ["src/app/page.tsx", "@/server/env/ai"],
    ["src/server/actions/exemple.ts", "@/server/env/grounding"],
    ["scripts/p0/main.ts", "../../src/server/env/ai"],
    ["src/ai/exemple.ts", "../server/env/../env/grounding"],
    ["src/ai/exemple.ts", "@/server/env/garde-cles"],
    ["tests/unit/exemple.test.ts", "@/server/env/egress"],
    ["src/ai/exemple.ts", "@/server/env"],
    ["src/ai/exemple.ts", "@/server/env/autre"],
    // B3a : index, resolve, payment hors de leurs importateurs nommés.
    ["src/server/actions/compte.ts", "@/server/env"],
    ["src/server/actions/compte.ts", "@/server/env/index"],
    ["src/app/page.tsx", "../server/env/index.ts"],
    ["tests/unit/autre.test.ts", "@/server/env"],
    ["db/index.ts", "../src/server/env/resolve.ts"],
    ["src/server/rate-limit.ts", "@/server/env/resolve"],
    ["src/instrumentation.ts", "@/server/env/payment"],
    ["src/server/actions/paiement.ts", "@/server/env/payment"],
    // B3d (M2a) : `cle-resend` hors de l'implémentation Resend (autre module d'envoi, connexion, tests hors de src/server/env/).
    ["src/server/mail/smtp.ts", "@/server/env/cle-resend"],
    ["src/server/mail/plafond.ts", "./../env/cle-resend"],
    ["src/server/auth/index.ts", "@/server/env/cle-resend"],
    ["src/server/mail/resend.test.ts", "@/server/env/cle-resend"],
    ["tests/unit/server/mail-resend.test.ts", "@/server/env/cle-resend"],
    // B4a : l'entrée `payment` n'admet plus les dossiers entiers (0097 B4-TL-3 point 5 (e)).
    ["src/server/routes/exemple.ts", "@/server/env/payment"],
    ["src/server/payment/exemple.ts", "@/server/env/payment"],
    ["src/server/payment/simulated-provider.ts", "@/server/env/payment"],
    ["src/server/payment/paiements.ts", "@/server/env"],
    ["src/server/routes/autre.ts", "@/server/env"],
    ["src/adapters/simulated-payment.ts", "@/server/env/payment"],
    // B4c (0140 § 6 ligne 10) : ni la fabrique commune, ni le module du paquet, ni l'adaptateur `stripe` pour `payment`.
    ["src/server/routes/webhook-commun.ts", "@/server/env/payment"],
    ["src/server/payment/stripe.ts", "@/server/env/payment"],
    ["src/server/payment/stripe.ts", "@/server/env"],
    ["src/adapters/stripe-payment.ts", "@/server/env/payment"],
    ["src/adapters/stripe-payment-instance.ts", "@/server/env"],
    // P0r3b : `p0` hors de la garde et de l'accès (action, page, autre module de src/server/p0, tests de tests/).
    ["src/server/actions/p0-acces.ts", "@/server/env/p0"],
    ["src/app/prototype/executions/page.tsx", "@/server/env/p0"],
    ["src/server/p0/base.ts", "@/server/env/p0"],
    ["src/server/p0/garde.test.ts", "./../env/p0"],
    ["tests/unit/p0/garde.test.ts", "@/server/env/p0"],
    ["src/server/composition/p0-reel.ts", "@/server/env/p0"],
    // P0r3d : ni l'action de lancement, ni l'état de la page, ni le décompte ou le rapport.
    ["src/server/actions/p0-lancement.ts", "@/server/env/p0"],
    ["src/server/p0/page-acces.ts", "@/server/env/p0"],
    ["src/server/p0/decompte.ts", "@/server/env/p0"],
    ["src/server/p0/lancement.test.ts", "@/server/env/p0"],
  ];
  it.each(REFUSES)("%s ne peut pas importer %s", async (fichier, source) => {
    expect(await messagesFor(imp(source), fichier)).toHaveLength(1);
  });

  it("toutes les formes de chargement sont lues", async () => {
    const fichier = "src/app/exemple.ts";
    const formes = [
      'export { x } from "@/server/env/ai";\n',
      'export * from "@/server/env/ai";\n',
      'type T = typeof import("@/server/env/ai");\nexport const t: T | null = null;\n',
      'import type { X } from "@/server/env/grounding";\nexport type Y = X;\n',
    ];
    for (const code of formes) expect(await messagesFor(code, fichier), code).toHaveLength(1);
  });
});
