// @vitest-environment node
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { PROMPT_NOTATION } from "@/ai/prompts/notation";
import { PROMPT_PLAN } from "@/ai/prompts/plan";
import { PROMPT_QUARTIER } from "@/ai/prompts/quartier";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import { PROMPT_RECHERCHE_WEB } from "@/ai/prompts/recherche-web";
import { PROMPT_STRUCTURATION } from "@/ai/prompts/structuration";

/**
 * Spécification B7a, critère `prompts: versionnés` : une empreinte SHA-256 du texte de chaque prompt est comparée à
 * cette table commitée `id → version → empreinte`. Un texte changé sans nouvelle version fait échouer le test ; une
 * nouvelle version ajoute sa ligne (l'ancienne reste, pour l'historique des mesures de P0).
 */
const EMPREINTES: Record<string, Record<number, string>> = {
  plan: { 1: "cc60044c386a445d8a09f21383982f550a35a8dac592cc9a320b3b594da289ef" },
  recherche: {
    2: "5b48d1a6aa37b9e25b96737e918c9f6ab2ecc4f175d510d343bbe70a8a36b4ad",
    3: "57abff2e2bd2ce12f94d145a274c988474436ee4e88736928166a4f268654b18",
  },
  notation: { 1: "3d65949a6a1720d74bb4173abc46346b945a1bce0b7dbc2d001689fc6716ed1b" },
  raisons: { 1: "14d91f523c80e186228f52ab3604fb4b2490f8a8d1db0ef3b3ab90d069fe08d6" },
  structuration: { 1: "e9d62fe8ce071a2c0a3f3b97dd595408eca3f62dd288e84fbcdc76aee13433be" },
  quartier: { 1: "a7d2edb04621223aa702be9058f92cadbd509aa4b3eb99e7f5bea9db7e25355b" },
  "recherche-web": { 2: "5d9657a1e8e78be1e3cfac7dacc9ce26f3667225f3ff5188158a3fe94f7fff49" },
};

const PROMPTS = [PROMPT_PLAN, PROMPT_RECHERCHE, PROMPT_NOTATION, PROMPT_RAISONS, PROMPT_STRUCTURATION, PROMPT_QUARTIER, PROMPT_RECHERCHE_WEB];
const empreinte = (texte: string) => createHash("sha256").update(texte, "utf8").digest("hex");

describe("prompts: versionnés", () => {
  it.each(PROMPTS.map((p) => [p.id, p] as const))("%s : empreinte de la version courante égale à la table", (_id, prompt) => {
    const versions = new Map(Object.entries(Object.entries(EMPREINTES).find(([id]) => id === prompt.id)?.[1] ?? {}));
    expect(versions.get(String(prompt.version)), `${prompt.id} v${prompt.version} absent de la table`).toBeDefined();
    expect(empreinte(prompt.texte)).toBe(versions.get(String(prompt.version)));
  });

  it("chaque prompt de src/ai/prompts a sa ligne, identifiants uniques ; structuration et quartier en version 1", () => {
    expect(new Set(PROMPTS.map((p) => p.id)).size).toBe(PROMPTS.length);
    expect(Object.keys(EMPREINTES).sort()).toEqual(PROMPTS.map((p) => p.id).sort());
    expect(PROMPT_STRUCTURATION.version).toBe(1);
    expect(PROMPT_QUARTIER.version).toBe(1);
  });

  it("un texte changé sans nouvelle version fait échouer la comparaison", () => {
    expect(empreinte(`${PROMPT_PLAN.texte} `)).not.toBe(EMPREINTES.plan?.[PROMPT_PLAN.version]);
  });
});
