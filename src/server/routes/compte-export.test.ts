import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountExport } from "@/contracts/account-export";
import { RATE_LIMITS } from "@/server/config/limites";
import { createRateLimiter, type RateLimitClient } from "@/server/rate-limit";

import { creerRouteExport, type DependancesExport, limiteurExport, type SessionExport } from "./compte-export";

/**
 * Route `GET /api/v1/compte/export` (spécification M9 § 6.2, critères 1, 2, 7 et 9 ; ticket 1097, M9a), appelée
 * directement avec des dépendances injectées : aucune base, aucun `process.env`. Les cas en base sont
 * `tests/db/export-compte.test.ts`.
 */

const SESSION: SessionExport = {
  sessionId: "0d000000-0000-4000-8000-0000000000d1",
  userId: "0d000000-0000-4000-8000-0000000000b1",
  organizationId: "0d000000-0000-4000-8000-0000000000a1",
  role: "owner",
};

const FICHIER: AccountExport = {
  format: "vadrouille-export",
  version: 1,
  exportedAt: "2026-11-09T22:30:00.000Z",
  notice: "Texte.",
  account: { email: "samuel@exemple.test", createdAt: "2026-08-01T08:00:00.000Z" },
  trips: [],
  tastes: [],
};

/** 2026-11-09 à 23:30 heure de Zurich (UTC+1 en novembre). */
const SOIR = new Date("2026-11-09T22:30:00Z");

function route(surcharges: Partial<DependancesExport> = {}) {
  const ordre: string[] = [];
  const espions = {
    session: vi.fn(async () => {
      ordre.push("session");
      return SESSION as SessionExport | null;
    }),
    organisationAdmise: vi.fn(async () => {
      ordre.push("organisation");
      return true;
    }),
    connexionRecente: vi.fn(async () => {
      ordre.push("reauthentification");
      return true;
    }),
    limiteur: vi.fn(async () => {
      ordre.push("limiteur");
      return { ok: true } as const;
    }),
    construire: vi.fn(async () => {
      ordre.push("export");
      return { ok: true as const, value: FICHIER };
    }),
  };
  const gestionnaire = creerRouteExport({ adaptateur: () => "api", maintenant: () => SOIR, ...espions, ...surcharges });
  const appeler = (chemin = "/api/v1/compte/export", entetes: Record<string, string> = {}) =>
    gestionnaire(new Request(`https://app.exemple.test${chemin}`, { headers: entetes }));
  return { appeler, espions, ordre };
}

async function refus(reponse: Response, statut: number, code: string) {
  expect(reponse.status).toBe(statut);
  expect(reponse.headers.get("cache-control")).toBe("private, no-store");
  expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
  expect(reponse.headers.get("content-disposition")).toBeNull();
  expect(reponse.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(((await reponse.json()) as { code: string }).code).toBe(code);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("compte: route de l'export (critère 7)", () => {
  it("en-têtes du fichier : attachment, nom à la date de Zurich (23:30 le 09 → 09), JSON UTF-8, no-store, nosniff", async () => {
    const { appeler, ordre } = route();
    const reponse = await appeler();
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-disposition")).toBe('attachment; filename="vadrouille-mes-donnees-2026-11-09.json"');
    expect(reponse.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(reponse.headers.get("x-content-type-options")).toBe("nosniff");
    const texte = await reponse.text();
    expect(JSON.parse(texte)).toEqual(FICHIER);
    expect(texte.startsWith('{\n  "format": "vadrouille-export",')).toBe(true);
    expect(ordre).toEqual(["session", "organisation", "reauthentification", "limiteur", "export"]);
  });

  it("00:30 le 10 heure de Zurich → nom du 10", async () => {
    const reponse = await route({ maintenant: () => new Date("2026-11-09T23:30:00Z") }).appeler();
    expect(reponse.headers.get("content-disposition")).toBe('attachment; filename="vadrouille-mes-donnees-2026-11-10.json"');
  });

  it("le contexte vient de la session seule ; l'horloge est passée au contrôle et à l'export", async () => {
    const { appeler, espions } = route();
    await appeler();
    expect(espions.connexionRecente).toHaveBeenCalledWith(SESSION.sessionId, SOIR);
    expect(espions.construire).toHaveBeenCalledWith({ organizationId: SESSION.organizationId, userId: SESSION.userId, role: "owner" }, SOIR);
    expect(espions.limiteur).toHaveBeenCalledWith(expect.any(Request), SESSION.userId);
  });
});

describe("compte: refus de la route (critères 1, 2 et 9)", () => {
  it("critère 9 : limite export atteinte → 429 rate_limited, rien lu", async () => {
    const { appeler, espions, ordre } = route({ limiteur: async () => ({ ok: false, kind: "user" }) });
    await refus(await appeler(), 429, "rate_limited");
    expect(espions.construire).not.toHaveBeenCalled();
    expect(ordre).toEqual(["session", "organisation", "reauthentification"]);
  });

  it("critère 9 avec le limiteur réel sur pool simulé : 5 exports par heure et par personne, le 6e refusé sans lecture", async () => {
    const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
    const compteurs = new Map<string, number>();
    const client: RateLimitClient = {
      async query(text, values) {
        if (!text.startsWith("INSERT INTO action_rate_limits")) return { rows: [] };
        const cle = String(values?.[0]);
        compteurs.set(cle, (compteurs.get(cle) ?? 0) + 1);
        return { rows: [{ count: compteurs.get(cle) }] };
      },
      release() {},
    };
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const limiteur = createRateLimiter({ pool: { connect: async () => client }, env: { VADROUILLE_ENV: "ci", [HMAC]: randomBytes(32).toString("base64url") }, config: RATE_LIMITS });
    const { appeler, espions } = route({ limiteur: limiteurExport((demande) => limiteur.verdict(demande)) });
    for (let i = 0; i < 5; i += 1) expect((await appeler()).status).toBe(200);
    await refus(await appeler(), 429, "rate_limited");
    expect(espions.construire).toHaveBeenCalledTimes(5);
  });

  it("critère 1 : sans session → 401 unauthenticated ; conseiller → 403 forbidden ; organisation à deux membres → 403 forbidden ; rien lu", async () => {
    const sans = route({ session: async () => null });
    await refus(await sans.appeler(), 401, "unauthenticated");
    expect(sans.espions.organisationAdmise).not.toHaveBeenCalled();
    expect(sans.espions.construire).not.toHaveBeenCalled();

    const conseiller = route({ session: async () => ({ ...SESSION, role: "member" }) });
    await refus(await conseiller.appeler(), 403, "forbidden");
    expect(conseiller.espions.organisationAdmise).not.toHaveBeenCalled();
    expect(conseiller.espions.construire).not.toHaveBeenCalled();

    const partagee = route({ organisationAdmise: async () => false });
    await refus(await partagee.appeler(), 403, "forbidden");
    expect(partagee.espions.connexionRecente).not.toHaveBeenCalled();
    expect(partagee.espions.limiteur).not.toHaveBeenCalled();
    expect(partagee.espions.construire).not.toHaveBeenCalled();

    // Organisation devenue partagée entre la vérification et la transaction : refus rendu par l'export lui-même.
    const course = route({ construire: async () => ({ ok: false, code: "forbidden" }) });
    await refus(await course.appeler(), 403, "forbidden");
  });

  it("critère 2 : connexion trop ancienne → 401 reauthentication_required, ni limiteur ni lecture", async () => {
    const { appeler, espions } = route({ connexionRecente: async () => false });
    await refus(await appeler(), 401, "reauthentication_required");
    expect(espions.limiteur).not.toHaveBeenCalled();
    expect(espions.construire).not.toHaveBeenCalled();
  });

  it("demande intersite ou préchargement → 403 forbidden avant la session ; paramètre dans l'adresse → 400", async () => {
    const refusees: Record<string, string>[] = [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { "sec-purpose": "prefetch" }, { purpose: "prefetch" }, { "next-router-prefetch": "1" }];
    for (const entetes of refusees) {
      const { appeler, espions } = route();
      await refus(await appeler(undefined, entetes), 403, "forbidden");
      expect(espions.session, JSON.stringify(entetes)).not.toHaveBeenCalled();
    }
    for (const entetes of [{ "sec-fetch-site": "same-origin" }, { "sec-fetch-site": "none" }]) expect((await route().appeler(undefined, entetes)).status).toBe(200);
    const { appeler, espions } = route();
    await refus(await appeler(`/api/v1/compte/export?organizationId=${SESSION.organizationId}`), 400, "validation_failed");
    await refus(await appeler("/api/v1/compte/export?userId=x"), 400, "validation_failed");
    expect(espions.session).not.toHaveBeenCalled();
  });

  it("adaptateur autre que api avec la connexion réelle → 404 sans corps, rien lu", async () => {
    const { appeler, espions } = route({ adaptateur: () => "autre" });
    const reponse = await appeler();
    expect(reponse.status).toBe(404);
    expect(await reponse.text()).toBe("");
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(espions.session).not.toHaveBeenCalled();
  });

  it("échec de la session, de la base ou du contrat → 500 internal, une ligne compte.export_failed sans valeur", async () => {
    const lignes: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    const panne = Object.assign(new Error("samuel@exemple.test Édimbourg"), { name: "DatabaseError" });
    await refus(await route({ construire: async () => Promise.reject(panne) }).appeler(), 500, "internal");
    await refus(await route({ organisationAdmise: async () => Promise.reject(panne) }).appeler(), 500, "internal");
    // Lecture de la session en échec (connexion réelle non branchée, base) : 500, rien d'autre appelé.
    const sansConnexion = route({ session: async () => Promise.reject(panne) });
    await refus(await sansConnexion.appeler(), 500, "internal");
    expect(sansConnexion.espions.organisationAdmise).not.toHaveBeenCalled();
    expect(lignes.map((l) => JSON.parse(l) as unknown)).toEqual([
      { level: "error", event: "compte.export_failed", errorName: "DatabaseError" },
      { level: "error", event: "compte.export_failed", errorName: "DatabaseError" },
      { level: "error", event: "compte.export_failed", errorName: "DatabaseError" },
    ]);
    expect(lignes.join("\n")).not.toContain("samuel");
  });

  it("fichier au-delà de la borne de taille → 500 internal (ExportTropVolumineuxError)", async () => {
    const lignes: string[] = [];
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
    const gros = { ...FICHIER, notice: "x".repeat(4_000_001) };
    await refus(await route({ construire: async () => ({ ok: true, value: gros }) }).appeler(), 500, "internal");
    expect(lignes.map((l) => JSON.parse(l) as unknown)).toEqual([{ level: "error", event: "compte.export_failed", errorName: "ExportTropVolumineuxError" }]);
  });
});
