// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SQL_CONTENU, SQL_DERNIERE_PURGE, SQL_EXECUTIONS } from "@/adapters/prototype-suivi";
import ExecutionsPage from "@/app/prototype/executions/page";
import * as messages from "@/i18n/messages";
import { decouperProgramme } from "@/prototype/decoupage";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import { lancerExecutionP0Action } from "@/server/actions/p0-lancement";
import { valeurCookieAcces } from "@/server/p0/acces";
import { pageExecutionsP0 } from "@/server/p0/page-acces";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Page de lancement (P0r3d ; spécification P0-suite-2, « Page de lancement » ; D24, S4) : rendue accès ouvert
 * seulement ; choix sans valeur par défaut ; suivi, décompte et rapport sans donnée Google ; coût et durée pendant
 * l'exécution seulement. Module étroit, base et interface des workflows simulés.
 */

const t = messages.prototype.lancement;
/** Texte tel que React l'échappe dans le HTML rendu. */
const html$ = (texte: string) => texte.replaceAll("'", "&#x27;");
const SOURCE = readFileSync(path.join(process.cwd(), "prototype/programmes-test/proto_test_20261012_1.json"), "utf8");
const PREFIXE = "SENTINELLEGOOGLE_";
const CONTENU = decouperProgramme(ProgrammeReduitSchema.parse(JSON.parse(SOURCE.replaceAll("SENTINELLE_PLACE_ID_", PREFIXE)))).contenu;

const d = vi.hoisted(() => ({
  ouvert: true,
  jeton: Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))),
  cookies: new Map<string, string>(),
  lignes: [] as Record<string, unknown>[],
  panne: false,
  requetes: [] as string[],
  revalidees: [] as string[],
  lancer: vi.fn(),
}));

vi.mock("@/server/env/p0", () => ({
  CODES_ENV_P0: [],
  CAUSES_ENV_P0: [],
  EXCEPTIONS_ENV_P0: [],
  ZONES_ENV_P0: [],
  VERDICTS_ENV_P0: [],
  lireEnvP0: () => (d.ouvert ? { ok: true, jeton: d.jeton } : { ok: false, code: "branch_refused" }),
  decoderJetonSaisi: () => null,
  commitDuDeploiement: () => null,
}));
vi.mock("@/workflows", () => ({ NOMS_BRIEFS: ["edimbourg-1.json", "edimbourg-2.json"] }));
vi.mock("@/server/p0/lancement", () => ({ lancerExecutionP0: (...args: unknown[]) => d.lancer(...args) }));
vi.mock("@/server/p0/base", () => ({
  poolPrototype: (): PoolSql => ({
    connect: async (): Promise<ClientSql> => {
      if (d.panne) throw new Error("panne");
      return {
        async query(texte) {
          d.requetes.push(texte);
          if (texte === SQL_EXECUTIONS) return { rows: d.lignes };
          if (texte === SQL_DERNIERE_PURGE) return { rows: [{ derniere: "2026-10-14T03:00:00Z" }] };
          if (texte === SQL_CONTENU) return { rows: [{ contenu: CONTENU }] };
          throw new Error("requête inattendue");
        },
        release: () => undefined,
      };
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (nom: string) => (d.cookies.has(nom) ? { name: nom, value: d.cookies.get(nom) } : undefined), set: () => undefined }),
}));
vi.mock("next/cache", () => ({ revalidatePath: (chemin: string) => void d.revalidees.push(chemin) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));

const ligne = (champs: Record<string, unknown>) => ({
  id: "77777777-7777-4777-8777-777777777777",
  mode: "reel",
  brief: "edimbourg-1.json",
  variant: "B",
  status: "programme_ecrit",
  phase: null,
  stop_code: null,
  cost_models_micros: null,
  ecoule_ms: null,
  jour_quota: "2026-10-14",
  canary_ok: true,
  commit_sha: "f".repeat(40),
  ...champs,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  d.ouvert = true;
  d.cookies.clear();
  d.cookies.set("__Host-p0_acces", valeurCookieAcces(d.jeton, Date.now()));
  d.lignes = [];
  d.panne = false;
  d.requetes = [];
  d.revalidees = [];
});

describe("p0: page de lancement", () => {
  it("garde fermée : 404 sans lecture ; accès à saisir : formulaire du code, aucune lecture du suivi", async () => {
    d.ouvert = false;
    await expect(ExecutionsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    d.ouvert = true;
    d.cookies.clear();
    const html = renderToString(await ExecutionsPage());
    expect(html).toContain('name="code"');
    expect(html).not.toContain('name="brief"');
    expect(d.requetes).toEqual([]);
  });

  it("accès ouvert : choix du brief (briefs admis), de la variante et de la nature, obligatoires, sans valeur par défaut", async () => {
    const html = renderToString(await ExecutionsPage());
    expect(html).not.toContain('name="code"');
    // Trois groupes Ligne (radiogroup), aucune option choisie ; champs cachés vides pour l'action.
    expect(html.match(/role="radiogroup"/g)).toHaveLength(3);
    for (const libelle of ["edimbourg-1.json", "edimbourg-2.json", t.formulaire.variantes.B, t.formulaire.variantes.A, t.formulaire.modes.essai, t.formulaire.modes.reel]) {
      expect(html).toContain(html$(libelle));
    }
    expect(html.match(/role="radio"/g)).toHaveLength(6);
    expect(html).not.toContain('aria-checked="true"');
    for (const nom of ["brief", "variante", "mode"]) expect(html).toContain(`type="hidden" name="${nom}" value=""`);
    expect(html).not.toMatch(/type="radio"|required/);
    expect(html).toContain(t.formulaire.lancer);
    expect(html).toContain(html$(t.suivi.aucune));
    expect(html.replaceAll("<!-- -->", "")).toContain(`${t.suivi.dernierePurge} : 14 octobre 2026 à 03:00 (UTC)`);
    expect(html).not.toContain("2026-10-14T03:00:00Z");
  });

  it("exécution en cours : statut, phase, coût et durée ; aucun rapport", async () => {
    d.lignes = [ligne({ status: "en_cours", phase: "ancrage", cost_models_micros: "120000", ecoule_ms: "61000", canary_ok: null })];
    const html = renderToString(await ExecutionsPage());
    expect(html).toContain(t.suivi.statuts.en_cours);
    expect(html).toContain(t.suivi.phases.ancrage);
    expect(html).not.toMatch(/>ancrage</);
    expect(html).toContain("0,12 USD");
    expect(html).toContain(">1 min<");
    expect(html).toContain(html$("edimbourg-1.json, variante B, jour du 14 octobre 2026"));
    expect(html).not.toContain("2026-10-14<");
    expect(html).not.toContain(t.rapport.titreSection);
    expect(d.requetes).not.toContain(SQL_CONTENU);
  });

  it("dernière exécution finie : rapport et « Copier le rapport », sans donnée Google ; décompte par brief et variante", async () => {
    d.lignes = [ligne({}), ligne({ id: "88888888-8888-4888-8888-888888888888", status: "arretee", stop_code: "upstream_unavailable" })];
    const page = await pageExecutionsP0();
    expect(page.etat).toBe("ouverte");
    if (page.etat !== "ouverte") return;
    expect(page.modele.rapport?.criteres).toMatchObject({ A1: "oui", A2: "oui", A6: "oui", A9: "oui" });
    expect(page.modele.decompte).toEqual([
      { brief: "edimbourg-1.json", variante: "B", comptees: 1, compteesMax: 2, relances: 1, relancesMax: 1 },
      { brief: "edimbourg-1.json", variante: "A", comptees: 0, compteesMax: 1, relances: 0, relancesMax: 1 },
      { brief: "edimbourg-2.json", variante: "B", comptees: 0, compteesMax: 2, relances: 0, relancesMax: 1 },
      { brief: "edimbourg-2.json", variante: "A", comptees: 0, compteesMax: 1, relances: 0, relancesMax: 1 },
    ]);
    const html = renderToString(await ExecutionsPage());
    expect(html).toContain(t.rapport.copier);
    expect(html).toContain(html$(t.rapport.titre));
    expect(html).not.toContain(PREFIXE);
    expect(html).not.toContain("[Lieu de test");
    expect(html).not.toContain("USD");
  });

  it("exécution en cours après une exécution finie : le rapport reste celui de la finie ; cause d'arrêt en clair", async () => {
    d.lignes = [
      ligne({ id: "99999999-9999-4999-8999-999999999999", status: "en_cours", phase: "recherche", cost_models_micros: "0", ecoule_ms: "5000", canary_ok: null }),
      ligne({ status: "arretee", stop_code: "upstream_unavailable", canary_ok: null }),
    ];
    const page = await pageExecutionsP0();
    if (page.etat !== "ouverte") throw new Error("page non ouverte");
    expect(page.modele.rapport?.execution.id).toBe("77777777-7777-4777-8777-777777777777");
    expect(page.modele.rapport?.criteres).toMatchObject({ A7: "non_releve", A8: "non_releve" });
    const html = renderToString(await ExecutionsPage());
    expect(html).toContain(t.rapport.titreSection);
    expect(html).toContain(html$(t.suivi.codesArret.upstream_unavailable));
    expect(html).toContain(html$(t.suivi.moinsDUneMinute));
    expect(d.requetes).not.toContain(SQL_CONTENU);
  });

  it("base injoignable : suivi indisponible, formulaire conservé", async () => {
    d.panne = true;
    const html = renderToString(await ExecutionsPage());
    expect(html).toContain(t.suivi.indisponible);
    expect(html).toContain('name="brief"');
    expect(html).not.toContain(t.decompte.titre);
  });
});

describe("p0: action de lancement", () => {
  const formulaire = (champs: Record<string, string>) => {
    const donnees = new FormData();
    for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
    return donnees;
  };

  it("champs brief, variante et mode transmis tels quels avec le cookie ; statut seul rendu ; page relue après un lancement", async () => {
    d.lancer.mockResolvedValue("lancee");
    const etat = await lancerExecutionP0Action({ statut: "attente" }, formulaire({ brief: "edimbourg-1.json", variante: "B", mode: "essai", autre: "x" }));
    expect(etat).toEqual({ statut: "lancee" });
    expect(d.lancer).toHaveBeenCalledWith(
      { brief: "edimbourg-1.json", variante: "B", mode: "essai" },
      expect.objectContaining({ cookie: d.cookies.get("__Host-p0_acces") }),
    );
    expect(d.revalidees).toEqual(["/prototype/executions"]);
  });

  it("refus : statut seul, page non relue ; exception : erreur, sans message", async () => {
    d.lancer.mockResolvedValue("run_quota_reached");
    expect(await lancerExecutionP0Action({ statut: "attente" }, formulaire({}))).toEqual({ statut: "run_quota_reached" });
    d.lancer.mockRejectedValue(new Error("SENTINELLE"));
    const etat = await lancerExecutionP0Action({ statut: "attente" }, formulaire({}));
    expect(etat).toEqual({ statut: "erreur" });
    expect(d.revalidees).toEqual([]);
    d.lancer.mockResolvedValue("demarrage_impossible");
    await lancerExecutionP0Action({ statut: "attente" }, formulaire({}));
    expect(d.revalidees).toEqual(["/prototype/executions"]);
  });

  it("le fichier d'action n'exporte que le lancement", async () => {
    expect(Object.keys(await import("@/server/actions/p0-lancement")).sort()).toEqual(["lancerExecutionP0Action"]);
  });
});
