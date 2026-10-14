// @vitest-environment node
import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { etatPageAcces, saisirCodeAcces } from "@/server/p0/acces";
import { ouvrirGardeLancement, verifierGardeEtape } from "@/server/p0/garde";

/**
 * `isProductionDeployment()` faux, contrôlé **seul** par la garde (décision 0055, section 1 point 2 ; 0017 § 11.0 ;
 * 0050, B3-TL-1 point 2, « équivalence avec l'interface ») : il est impliqué par la condition (2) de `lireEnvP0`, qui
 * est donc remplacée ici par un double ouvert, pour que le contrôle de production soit le seul à pouvoir fermer.
 */
const jeton = vi.hoisted(() => Buffer.alloc(32, 7));
vi.mock("@/server/env/p0", () => ({
  CODES_ENV_P0: [],
  lireEnvP0: () => ({ ok: true, jeton }),
  decoderJetonSaisi: () => null,
}));

const production: NodeJS.ProcessEnv[] = [
  { NODE_ENV: "test", VERCEL_ENV: "production" },
  { NODE_ENV: "test", VADROUILLE_ENV: "production" },
  { NODE_ENV: "test", VADROUILLE_ENV: " Production " },
];

describe("p0: garde fermée sur un déploiement de production, contrôle pris seul", () => {
  it.each(production)("%o → fermée partout, sans réservation ni connexion", async (env) => {
    const reserver = vi.fn();
    const pool = vi.fn();
    expect(
      await ouvrirGardeLancement({
        env,
        execArgv: [],
        cookie: undefined,
        reserver,
      }),
    ).toEqual({ ok: false, code: "production_deployment" });
    expect(
      await verifierGardeEtape("0b6c1a52-4c3e-4f7a-9d2e-5a1b2c3d4e5f", {
        env,
        execArgv: [],
        pool,
        dureeMaxMs: 900_000,
      }),
    ).toEqual({
      ok: false,
      code: "production_deployment",
    });
    expect(etatPageAcces(undefined, { env })).toBe("fermee");
    expect(await saisirCodeAcces(randomBytes(32).toString("hex"), pool, { env })).toEqual({ ok: false, code: "fermee" });
    expect(reserver).not.toHaveBeenCalled();
    expect(pool).not.toHaveBeenCalled();
  });

  it("hors production, le double ouvert laisse passer jusqu'au cookie (le contrôle de production est bien le seul refus ci-dessus)", async () => {
    expect(
      await ouvrirGardeLancement({
        env: { NODE_ENV: "test", VERCEL_ENV: "preview" },
        execArgv: [],
        cookie: undefined,
        reserver: vi.fn(),
      }),
    ).toEqual({
      ok: false,
      code: "access_refused",
    });
  });
});
