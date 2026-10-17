// @vitest-environment node
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  brancherConnexionReelle,
  ConnexionDejaBrancheeError,
  contexteDeSessionBranche,
  createBetterAuthAdapter,
  debrancherConnexionReellePourTests,
  type DemandeLimiteur,
  type EchecConnexion,
  type Limiteur,
  type OperationsConnexion,
  type SessionOuverte,
} from "@/adapters/better-auth";
import { getOptionalRequestContext, getRequestContext, SessionRequiseError } from "@/adapters/context";
import { getAuthAdapter } from "@/adapters/index";
import { explicitScope } from "@/adapters/simulation";
import type { AdapterContext } from "@/adapters/types";
import { MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";
import type { AuthFailure, AuthOperations, AuthSession } from "@/server/auth";
import type { CanonicalEmail } from "@/server/email";
import type { checkRateLimit, RateLimitRequest } from "@/server/rate-limit";

/**
 * Branchement de la connexion réelle (B3c, ticket 447 ; revue consolidée du head `2b80bd7` de la PR 452) : second
 * branchement refusé (bloquant 2), remise à zéro réservée aux tests ; garde de `getAuthAdapter()` (critère C10) et
 * contexte de session de `getRequestContext()` (déplacés des tests colocalisés de `src/adapters`, qui ne nomment plus
 * le point d'injection) ; en-têtes transmis aux opérations (mineur 4) ; formes liées aux types d'origine (mineur 10) ;
 * lecture de la session hors rendu (mineur 9).
 */

const session = vi.hoisted(() => ({ lire: vi.fn<() => Promise<AdapterContext | null>>() }));

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherConnexionReellePourTests();
});

describe("brancherConnexionReelle : un seul branchement (bloquant 2)", () => {
  const premiere = { operations: vi.fn(), limiter: vi.fn(), contexte: vi.fn(async () => null) };
  const seconde = { operations: vi.fn(), limiter: vi.fn(), contexte: vi.fn(async (): Promise<AdapterContext> => ({ organizationId: "autre", userId: "autre", role: "owner" })) };

  it("un second branchement lève sans remplacer le premier", async () => {
    debrancherConnexionReellePourTests();
    brancherConnexionReelle(premiere);
    expect(() => brancherConnexionReelle(seconde)).toThrow(ConnexionDejaBrancheeError);
    expect(await contexteDeSessionBranche()).toBeNull();
    expect(premiere.contexte).toHaveBeenCalledTimes(1);
    expect(seconde.contexte).not.toHaveBeenCalled();
  });

  it("l'erreur ne porte aucune valeur", () => {
    debrancherConnexionReellePourTests();
    brancherConnexionReelle(premiere);
    let erreur: unknown;
    try {
      brancherConnexionReelle(seconde);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ConnexionDejaBrancheeError);
    expect(Object.keys(erreur as object)).toEqual(["name"]);
    expect((erreur as Error).message).toBe("Connexion réelle déjà branchée.");
  });

  it("non branchée : le contexte lève (échec fermé) ; après remise à zéro, un nouveau branchement est admis", async () => {
    debrancherConnexionReellePourTests();
    expect(() => contexteDeSessionBranche()).toThrow(/indisponible/);
    brancherConnexionReelle(seconde);
    expect(await contexteDeSessionBranche()).toEqual({ organizationId: "autre", userId: "autre", role: "owner" });
  });
});

describe("getAuthAdapter (B3c ; 0034, B3-TL-2)", () => {
  const env = (values: Record<string, string | undefined>) => values as unknown as NodeJS.ProcessEnv;
  const scope = explicitScope("auth-garde-branchement");

  it("C10 (B3c ; 0034, B3-TL-2) : better-auth refusé en production et en staging avant toute opération, limiteur ou base", () => {
    const operations = vi.fn();
    const limiter = vi.fn();
    const contexte = vi.fn();
    debrancherConnexionReellePourTests();
    brancherConnexionReelle({ operations, limiter, contexte });
    for (const deployment of [{ VERCEL_ENV: "production" }, { VADROUILLE_ENV: "production" }, { VADROUILLE_ENV: "staging" }, { VERCEL_ENV: "preview" }]) {
      for (const nodeEnv of ["test", "production"]) {
        expect(() => getAuthAdapter({ scope, env: env({ NODE_ENV: nodeEnv, AUTH_ADAPTER: "better-auth", ...deployment }) })).toThrow(/refusée/);
      }
    }
    expect(operations).not.toHaveBeenCalled();
    expect(limiter).not.toHaveBeenCalled();
    expect(contexte).not.toHaveBeenCalled();
  });

});

describe("getRequestContext avec AUTH_ADAPTER=better-auth (B3c ; décision 0077 § 5.3, B3-TL-4)", () => {
  const SESSION: AdapterContext = { organizationId: "0b5e0000-0000-4000-8000-000000000001", userId: "0b5e0000-0000-4000-8000-000000000002", role: "owner" };
  const CI: NodeJS.ProcessEnv = { NODE_ENV: "test", VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" };

  beforeEach(() => {
    debrancherConnexionReellePourTests();
    brancherConnexionReelle({
      operations: () => {
        throw new Error("non appelé");
      },
      limiter: async () => ({ ok: true, value: undefined }),
      contexte: session.lire,
    });
  });

  afterEach(() => {
    session.lire.mockReset();
  });

  it("rend le contexte de la session, quel que soit DATA_ADAPTER (B3-PO-10), et une copie", async () => {
    session.lire.mockResolvedValue(SESSION);
    for (const value of [undefined, "mock", "prototype", "api"]) {
      expect(await getRequestContext(value, CI)).toEqual(SESSION);
      expect(await getOptionalRequestContext(value, { ...CI, VADROUILLE_ENV: "local" })).toEqual(SESSION);
    }
    const ctx = await getRequestContext("mock", CI);
    ctx.organizationId = "autre";
    expect(SESSION.organizationId).toBe("0b5e0000-0000-4000-8000-000000000001");
  });

  it("sans session : getOptionalRequestContext rend null, getRequestContext lève SessionRequiseError", async () => {
    session.lire.mockResolvedValue(null);
    expect(await getOptionalRequestContext("mock", CI)).toBeNull();
    await expect(getRequestContext("mock", CI)).rejects.toBeInstanceOf(SessionRequiseError);
  });

  it("refusé hors local et ci (B3-TL-2), avant toute lecture de session", async () => {
    session.lire.mockResolvedValue(SESSION);
    for (const env of [
      { ...CI, VADROUILLE_ENV: "staging" },
      { ...CI, VADROUILLE_ENV: "production" },
      { NODE_ENV: "test", VERCEL_ENV: "production", AUTH_ADAPTER: "better-auth" },
      { NODE_ENV: "test", AUTH_ADAPTER: "better-auth" },
    ] satisfies NodeJS.ProcessEnv[]) {
      await expect(getRequestContext("mock", env)).rejects.toThrow(/better-auth refusée/);
    }
    expect(session.lire).not.toHaveBeenCalled();
  });

  it("avec AUTH_ADAPTER=mock, la session n'est jamais lue", async () => {
    expect(await getRequestContext("mock", { ...CI, AUTH_ADAPTER: "mock" })).toEqual({
      organizationId: MOCK_ORGANIZATION_ID,
      userId: MOCK_USER_ID,
      role: "owner",
    });
    expect(session.lire).not.toHaveBeenCalled();
  });
});

describe("lecture de la session hors rendu (mineur 9)", () => {
  const CI: NodeJS.ProcessEnv = { NODE_ENV: "test", VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" };

  it("chaque appel hors rendu React relit la session : une connexion puis une déconnexion sont vues aussitôt", async () => {
    const etat: { ctx: AdapterContext | null } = { ctx: null };
    const contexte = vi.fn(async () => etat.ctx);
    debrancherConnexionReellePourTests();
    brancherConnexionReelle({ operations: vi.fn(), limiter: vi.fn(), contexte });
    expect(await getOptionalRequestContext("mock", CI)).toBeNull();
    etat.ctx = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "member" };
    expect(await getOptionalRequestContext("mock", CI)).toEqual(etat.ctx);
    etat.ctx = null;
    expect(await getOptionalRequestContext("mock", CI)).toBeNull();
    expect(contexte).toHaveBeenCalledTimes(3);
  });
});

describe("en-têtes transmis aux opérations (mineur 4)", () => {
  const SESSION: SessionOuverte = { sessionId: "s", userId: "u", organizationId: "o", role: "member" };
  const requete = new Headers({
    cookie: "vadrouille.s=x",
    "x-vercel-forwarded-for": "2001:db8::1",
    "x-forwarded-for": "2001:db8::2",
    "x-organization-id": "autre",
    authorization: "Bearer y",
    "user-agent": "z",
  });

  it("readSession et signOut : le cookie seul ; verifyCode : le cookie et l'en-tête d'adresse IP de confiance ; limiteur : la requête", async () => {
    const recus: Record<string, string[]> = {};
    const noter = (nom: string, headers: Headers | undefined) => {
      recus[nom] = [...(headers ?? new Headers()).keys()].sort();
    };
    const operations: OperationsConnexion = {
      requestCode: async () => ({ ok: true }),
      verifyCode: async ({ headers }) => {
        noter("verifyCode", headers);
        return { ok: true, ...SESSION };
      },
      readSession: async (headers) => {
        noter("readSession", headers);
        return SESSION;
      },
      signOut: async (headers) => {
        noter("signOut", headers);
        return { ok: true };
      },
    };
    const limiter = vi.fn<Limiteur>(async (demande) => {
      noter(`limiteur-${demande.action}`, demande.headers);
      return { ok: true, value: undefined };
    });
    const adapter = createBetterAuthAdapter({ operations: () => operations, headers: () => requete, limiter });
    expect((await adapter.verifyCode({ email: "a@exemple.test", code: "123456" })).ok).toBe(true);
    expect(await adapter.getSession()).toEqual({ sessionId: "s", userId: "u", organizationId: "o" });
    await adapter.signOut();
    expect(recus).toEqual({
      "limiteur-verify-code": [...requete.keys()].sort(),
      verifyCode: ["cookie", "x-vercel-forwarded-for"],
      readSession: ["cookie"],
      signOut: ["cookie"],
    });
  });
});

describe("formes liées aux types d'origine (mineur 10)", () => {
  type Assignable<A, B> = [A] extends [B] ? true : false;

  it("EchecConnexion, SessionOuverte, OperationsConnexion et DemandeLimiteur suivent src/server", () => {
    expectTypeOf<EchecConnexion>().toEqualTypeOf<AuthFailure>();
    expectTypeOf<SessionOuverte>().toEqualTypeOf<AuthSession>();
    expectTypeOf<Assignable<AuthOperations, OperationsConnexion>>().toEqualTypeOf<true>();
    expectTypeOf<Assignable<DemandeLimiteur, RateLimitRequest>>().toEqualTypeOf<true>();
    expectTypeOf<Assignable<typeof checkRateLimit, Limiteur>>().toEqualTypeOf<true>();
    expectTypeOf<DemandeLimiteur["email"]>().toEqualTypeOf<CanonicalEmail | undefined>();
  });
});
