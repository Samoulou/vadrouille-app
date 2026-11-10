// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AccountExport } from "@/contracts/account-export";
import { EXPORT_TAILLE_MAX_OCTETS, serialiserExport } from "@/server/account/export";
import { ACTION_LIMITEUR_EXPORT, exporterMonCompte, type DependancesDemandeExport, type SessionDemandeExport } from "@/server/account/export-demande";
import { ACTION_LIMITEUR } from "@/server/routes/compte-export";

/**
 * Cœur unique de l'export (M9c, ticket 1122 ; spécification M9 § 3.5, § 6.2 et § 6.4, critère 3), partagé par la route
 * de M9a et l'action `exportAccount`, sur des dépendances injectées (aucune base). La route sur ce cœur :
 * `src/server/routes/compte-export.test.ts` et `tests/db/export-compte.test.ts`.
 */

const SESSION = {
  sessionId: "0d000000-0000-4000-8000-0000000000d1",
  userId: "0d000000-0000-4000-8000-0000000000b1",
  organizationId: "0d000000-0000-4000-8000-0000000000a1",
  role: "owner" as const,
};
const CTX = { organizationId: SESSION.organizationId, userId: SESSION.userId, role: SESSION.role };
const MAINTENANT = new Date("2026-11-09T10:00:00.000Z");
const FICHIER = {
  format: "vadrouille-export",
  version: 1,
  exportedAt: MAINTENANT.toISOString(),
  notice: "Notice.",
  account: { email: "samuel@exemple.test", createdAt: "2026-01-01T00:00:00.000Z" },
  trips: [],
} as unknown as AccountExport;

function banc(surcharges: Partial<DependancesDemandeExport> = {}) {
  const ordre: string[] = [];
  const note = <T,>(nom: string, valeur: T) => {
    ordre.push(nom);
    return valeur;
  };
  const d: DependancesDemandeExport = {
    disponible: () => note("disponible", true),
    session: async () => note("session", SESSION),
    organisationAdmise: vi.fn(async () => note("organisation", true)),
    connexionRecente: vi.fn(async () => note("connexion", true)),
    limiteur: vi.fn(async () => note("limiteur", { ok: true } as const)),
    construire: vi.fn(async () => note("construire", { ok: true, value: FICHIER } as const)),
    maintenant: () => MAINTENANT,
    ...surcharges,
  };
  return { d, ordre };
}

const journal = vi.spyOn(console, "error").mockImplementation(() => undefined);

afterEach(() => {
  journal.mockClear();
});

describe("exporterMonCompte", () => {
  it("le compteur du limiteur est celui de la route de M9a", () => {
    expect(ACTION_LIMITEUR_EXPORT).toBe(ACTION_LIMITEUR);
  });

  it("contrôles dans l'ordre, puis le fichier sérialisé et son nom daté", async () => {
    const { d, ordre } = banc();
    expect(await exporterMonCompte(d)).toEqual({
      ok: true,
      value: { fileName: "vadrouille-mes-donnees-2026-11-09.json", content: serialiserExport(FICHIER) },
    });
    expect(ordre).toEqual(["disponible", "session", "organisation", "connexion", "limiteur", "construire"]);
    expect(d.organisationAdmise).toHaveBeenCalledExactlyOnceWith(CTX);
    expect(d.connexionRecente).toHaveBeenCalledExactlyOnceWith(SESSION.sessionId, MAINTENANT);
    expect(d.limiteur).toHaveBeenCalledExactlyOnceWith(SESSION.userId);
    expect(d.construire).toHaveBeenCalledExactlyOnceWith(CTX, MAINTENANT);
  });

  it.each([
    ["hors de api avec la connexion réelle", { disponible: () => false }, { code: "not_found" }],
    ["sans session", { session: async (): Promise<SessionDemandeExport | null> => null }, { code: "unauthenticated" }],
    ["autre rôle", { session: async (): Promise<SessionDemandeExport> => ({ ...SESSION, role: "member" }) }, { code: "forbidden" }],
    ["organisation partagée", { organisationAdmise: async () => false }, { code: "forbidden" }],
    ["connexion de plus de 10 minutes", { connexionRecente: async () => false }, { code: "reauthentication_required" }],
    ["limite atteinte", { limiteur: async () => ({ ok: false }) as never }, { code: "rate_limited", retryable: true }],
  ] as const)("%s : refus avant toute lecture de l'export ; seul le limiteur débite", async (_cas, surcharges, error) => {
    const construire = vi.fn();
    const limiteur = vi.fn(async () => ({ ok: true }) as const);
    const { d } = banc({ limiteur, construire, ...(surcharges as Partial<DependancesDemandeExport>) });
    expect(await exporterMonCompte(d)).toEqual({ ok: false, error });
    expect(construire).not.toHaveBeenCalled();
    if (error.code !== "rate_limited") expect(limiteur).not.toHaveBeenCalled();
  });

  it("refus de la construction (organisation non admise au moment de la lecture) : forbidden", async () => {
    const { d } = banc({ construire: async () => ({ ok: false, code: "forbidden" }) });
    expect(await exporterMonCompte(d)).toEqual({ ok: false, error: { code: "forbidden" } });
  });

  it.each([
    ["session", { session: async () => Promise.reject(new Error("base")) }],
    ["organisation", { organisationAdmise: async () => Promise.reject(new Error("base")) }],
    ["connexion récente", { connexionRecente: async () => Promise.reject(new Error("base")) }],
    ["limiteur", { limiteur: async () => Promise.reject(new Error("base")) }],
    ["construction", { construire: async () => Promise.reject(new Error("base")) }],
  ])("exception (%s) : internal, sans détail", async (_cas, surcharges) => {
    const { d } = banc(surcharges as Partial<DependancesDemandeExport>);
    expect(await exporterMonCompte(d)).toEqual({ ok: false, error: { code: "internal", retryable: true } });
  });

  it("fichier au-delà de la taille admise : internal, aucun contenu rendu", async () => {
    const gros = { ...FICHIER, notice: "n".repeat(EXPORT_TAILLE_MAX_OCTETS) } as AccountExport;
    const { d } = banc({ construire: async () => ({ ok: true, value: gros }) });
    expect(await exporterMonCompte(d)).toEqual({ ok: false, error: { code: "internal", retryable: true } });
  });
});
