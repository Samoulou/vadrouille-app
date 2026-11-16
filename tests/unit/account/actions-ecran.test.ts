// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { brancherConnexionReelle, debrancherConnexionReellePourTests } from "@/adapters/better-auth";
import { ACCOUNT_EXPORT_FORBIDDEN_KEYS, accountExportKeys, AccountExportSchema } from "@/contracts/account-export";
import { MOCK_KNOWN_EMAIL } from "@/mocks/auth-simule";
import { adresseDuCompte } from "@/server/account/adresse";
import { exporterMonCompte } from "@/server/account/export-demande";
import { accountEmail, exportAccount, hasRecentSignIn } from "@/server/actions/compte";

/**
 * Actions de l'écran « Ton compte » (M9c, ticket 1122 ; spécification M9 § 6.4, critères 1, 4 et 10) : adresse de la
 * session, connexion récente, export (jeu simulé, et passage à `exporterMonCompte` sur `api`). Aucune base : la lecture de l'adresse est un double, la connexion
 * réelle est branchée comme au démarrage avec des opérations de test.
 */

const requete = vi.hoisted(() => ({ entetes: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => new Headers(requete.entetes) }));
vi.mock("@/server/account/adresse", () => ({ adresseDuCompte: vi.fn() }));
vi.mock("@/server/account/export-demande", () => ({ ACTION_LIMITEUR_EXPORT: "export", exporterMonCompte: vi.fn() }));

const SESSION = {
  sessionId: "0d000000-0000-4000-8000-0000000000d1",
  userId: "0d000000-0000-4000-8000-0000000000b1",
  organizationId: "0d000000-0000-4000-8000-0000000000a1",
  role: "owner" as const,
};

const readSession = vi.fn<(headers: Headers) => Promise<typeof SESSION | null>>(async () => SESSION);
const readSessionCreatedAt = vi.fn<(sessionId: string) => Promise<Date | null>>(async () => new Date());

function connexionReelle(data: "api" | "mock" = "api") {
  vi.stubEnv("AUTH_ADAPTER", "better-auth");
  vi.stubEnv("VADROUILLE_ENV", "ci");
  vi.stubEnv("DATA_ADAPTER", data);
  debrancherConnexionReellePourTests();
  brancherConnexionReelle({
    operations: () => ({ requestCode: vi.fn(), verifyCode: vi.fn(), signOut: vi.fn(), readSession, readSessionCreatedAt }),
    limiter: vi.fn(),
    contexte: vi.fn(async () => null),
  });
}

beforeEach(() => {
  requete.entetes = { cookie: "session=abc", "x-autre": "1", "x-vadrouille-simulation": "compte-ecran" };
  readSession.mockClear();
  readSession.mockImplementation(async () => SESSION);
  readSessionCreatedAt.mockClear();
  vi.mocked(adresseDuCompte).mockReset();
  vi.mocked(exporterMonCompte).mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherConnexionReellePourTests();
});

describe("accountEmail", () => {
  it("connexion simulée : l'adresse du compte du jeu simulé, sans lecture de la base", async () => {
    expect(await accountEmail()).toBe(MOCK_KNOWN_EMAIL);
    expect(adresseDuCompte).not.toHaveBeenCalled();
  });

  it("connexion réelle : adresse lue pour la personne de la session ; seul le cookie est transmis", async () => {
    connexionReelle();
    vi.mocked(adresseDuCompte).mockResolvedValue("samuel@exemple.test");
    expect(await accountEmail()).toBe("samuel@exemple.test");
    expect(adresseDuCompte).toHaveBeenCalledExactlyOnceWith({ organizationId: SESSION.organizationId, userId: SESSION.userId });
    expect([...readSession.mock.calls[0]![0].keys()]).toEqual(["cookie"]);
  });

  it("connexion réelle : sans session ou sur une erreur, null, sans lecture de l'adresse ni détail", async () => {
    connexionReelle();
    readSession.mockImplementationOnce(async () => null);
    expect(await accountEmail()).toBeNull();
    expect(adresseDuCompte).not.toHaveBeenCalled();
    vi.mocked(adresseDuCompte).mockRejectedValue(new Error("base"));
    expect(await accountEmail()).toBeNull();
  });

  it("connexion réelle non branchée : null", async () => {
    vi.stubEnv("AUTH_ADAPTER", "better-auth");
    vi.stubEnv("VADROUILLE_ENV", "ci");
    expect(await accountEmail()).toBeNull();
  });
});

describe("hasRecentSignIn", () => {
  const MINUTE = 60_000;

  it("hors de api avec la connexion réelle : false, sans lire la session", async () => {
    expect(await hasRecentSignIn()).toBe(false);
    connexionReelle("mock");
    expect(await hasRecentSignIn()).toBe(false);
    expect(readSession).not.toHaveBeenCalled();
  });

  it("session créée il y a moins de 10 minutes : true ; au-delà : false", async () => {
    connexionReelle();
    readSessionCreatedAt.mockImplementationOnce(async () => new Date(Date.now() - 9 * MINUTE));
    expect(await hasRecentSignIn()).toBe(true);
    expect(readSessionCreatedAt).toHaveBeenLastCalledWith(SESSION.sessionId);
    readSessionCreatedAt.mockImplementationOnce(async () => new Date(Date.now() - 11 * MINUTE));
    expect(await hasRecentSignIn()).toBe(false);
  });

  it("sans session, session inconnue ou erreur : false (un code de plus, jamais un contrôle en moins)", async () => {
    connexionReelle();
    readSession.mockImplementationOnce(async () => null);
    expect(await hasRecentSignIn()).toBe(false);
    readSessionCreatedAt.mockImplementationOnce(async () => null);
    expect(await hasRecentSignIn()).toBe(false);
    readSession.mockImplementationOnce(async () => {
      throw new Error("base");
    });
    expect(await hasRecentSignIn()).toBe(false);
  });
});

describe("exportAccount", () => {
  it("mock : fichier du jeu simulé, validé par le schéma de l'export réel, nom daté, sans clé exclue", async () => {
    const resultat = await exportAccount();
    if (!resultat.ok) throw new Error("export simulé refusé");
    expect(resultat.value.fileName).toMatch(/^vadrouille-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/);
    expect(resultat.value.content.endsWith("\n")).toBe(true);
    const fichier = AccountExportSchema.parse(JSON.parse(resultat.value.content));
    expect(fichier.account.email).toBe(MOCK_KNOWN_EMAIL);
    expect(fichier.trips.map((trip) => trip.destination)).toContain("Édimbourg");
    expect(fichier.trips.every((trip) => trip.versions.length === 1 && trip.versions[0]!.days.length > 0)).toBe(true);
    const cles = new Set(accountExportKeys(fichier));
    expect(ACCOUNT_EXPORT_FORBIDDEN_KEYS.filter((cle) => cles.has(cle))).toEqual([]);
  });

  it("ni mock avec la connexion simulée, ni api avec la connexion réelle : not_found", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    expect(await exportAccount()).toEqual({ ok: false, error: { code: "not_found" } });
    connexionReelle("mock");
    expect(await exportAccount()).toEqual({ ok: false, error: { code: "not_found" } });
    expect(exporterMonCompte).not.toHaveBeenCalled();
  });

  it("api avec la connexion réelle : rend le résultat de exporterMonCompte ; session lue par le cookie seul", async () => {
    connexionReelle();
    const rendu = { ok: false as const, error: { code: "reauthentication_required" as const } };
    vi.mocked(exporterMonCompte).mockResolvedValueOnce(rendu);
    expect(await exportAccount()).toBe(rendu);
    expect(exporterMonCompte).toHaveBeenCalledTimes(1);
    const dependances = vi.mocked(exporterMonCompte).mock.calls[0]![0];
    expect(dependances.disponible()).toBe(true);
    expect(await dependances.session()).toEqual(SESSION);
    expect([...readSession.mock.calls[0]![0].keys()]).toEqual(["cookie"]);
    readSessionCreatedAt.mockImplementationOnce(async () => new Date(Date.now() - 11 * 60_000));
    expect(await dependances.connexionRecente(SESSION.sessionId, new Date())).toBe(false);
  });
});
