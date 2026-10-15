// @vitest-environment node
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ExecutionsPage from "@/app/prototype/executions/page";
import * as messages from "@/i18n/messages";
import { saisirCodeAccesP0 } from "@/server/actions/p0-acces";
import { DUREE_COOKIE_S, valeurCookieAcces } from "@/server/p0/acces";
import { etatPageExecutionsP0 } from "@/server/p0/page-acces";

import { baseEssais } from "../../support/base-essais-p0";

/**
 * Page de saisie du code d'accès `/prototype/executions` et ses actions serveur (décision 0055, sections 1 et 2 ;
 * avis de la Sécurité S-2 points 3 et 5) : 404 quand la garde est fermée ; saisie par l'action seulement (l'état de
 * la page est lu par un module ordinaire, `src/server/p0/page-acces.ts`, jamais exporté d'une action) ; le code
 * n'apparaît ni dans le HTML rendu, ni dans l'état du formulaire, ni dans un journal. Le module étroit est remplacé
 * par un double (ouvert ou fermé) : aucun nom secret n'est posé dans l'environnement du processus.
 */

const etat = vi.hoisted(() => ({
  ouvert: true,
  // Code tiré à l'exécution (revue du head 6be9299, mineur 10) : aucun secret de 32 octets écrit dans le dépôt.
  jeton: Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))),
  cookies: new Map<string, string>(),
  poses: [] as { nom: string; valeur: string; options: unknown }[],
  base: undefined as undefined | { pool: unknown },
}));

vi.mock("@/server/env/p0", () => ({
  CODES_ENV_P0: [],
  CAUSES_ENV_P0: [],
  EXCEPTIONS_ENV_P0: [],
  ZONES_ENV_P0: [],
  VERDICTS_ENV_P0: [],
  lireEnvP0: () => (etat.ouvert ? { ok: true, jeton: etat.jeton } : { ok: false, code: "branch_refused" }),
  decoderJetonSaisi: (saisie: string) => (/^[0-9a-f]{64}$/.test(saisie) ? Buffer.from(saisie, "hex") : null),
}));
vi.mock("@/server/p0/base", () => ({ poolPrototype: () => etat.base?.pool }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nom: string) => (etat.cookies.has(nom) ? { name: nom, value: etat.cookies.get(nom) } : undefined),
    set: (nom: string, valeur: string, options: unknown) => void etat.poses.push({ nom, valeur, options }),
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: () => undefined }),
}));

const CODE_HEX = etat.jeton.toString("hex");
const formulaire = (code: string) => {
  const donnees = new FormData();
  donnees.set("code", code);
  return donnees;
};

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  etat.ouvert = true;
  etat.cookies.clear();
  etat.poses.length = 0;
  etat.base = baseEssais(Date.now());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("p0: page de saisie du code d'accès", () => {
  it("garde fermée → 404 (notFound), état « fermee », saisie refusée sans connexion", async () => {
    etat.ouvert = false;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await expect(ExecutionsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(await etatPageExecutionsP0()).toBe("fermee");
    expect(await saisirCodeAccesP0({ statut: "attente" }, formulaire(CODE_HEX))).toEqual({ statut: "erreur" });
    expect(etat.poses).toEqual([]);
  });

  it("garde ouverte sans cookie : formulaire POST masqué, sans le code ; avec un cookie valide : accès ouvert", async () => {
    const html = renderToString(await ExecutionsPage());
    expect(html).toContain('type="password"');
    expect(html.toLowerCase()).toContain('autocomplete="off"');
    expect(html).toContain('name="code"');
    expect(html).not.toContain(CODE_HEX);
    expect(html).not.toMatch(/<form[^>]*method="get"/i);
    etat.cookies.set("__Host-p0_acces", valeurCookieAcces(etat.jeton, Date.now()));
    expect(await etatPageExecutionsP0()).toBe("ouverte");
    expect(renderToString(await ExecutionsPage())).not.toContain('type="password"');
  });

  it("bon code → cookie __Host-p0_acces de 12 heures posé, état « accepte » sans le code ; mauvais code → invalid_code", async () => {
    const accepte = await saisirCodeAccesP0({ statut: "attente" }, formulaire(CODE_HEX));
    expect(accepte).toEqual({ statut: "accepte" });
    expect(JSON.stringify(accepte)).not.toContain(CODE_HEX);
    expect(etat.poses).toHaveLength(1);
    expect(etat.poses[0]?.nom).toBe("__Host-p0_acces");
    expect(etat.poses[0]?.valeur).toMatch(/^v1\.[0-9]{10}\.[0-9a-f]{64}$/);
    expect(etat.poses[0]?.valeur).not.toContain(CODE_HEX);
    expect(etat.poses[0]?.options).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      path: "/",
      maxAge: 43_200,
    });
    const refuse = await saisirCodeAccesP0({ statut: "attente" }, formulaire("f".repeat(64)));
    expect(refuse).toEqual({ statut: "invalid_code" });
    expect(etat.poses).toHaveLength(1);
  });

  it("6e essai de l'heure → too_many_attempts ; champ absent → essai refusé", async () => {
    expect(await saisirCodeAccesP0({ statut: "attente" }, new FormData())).toEqual({ statut: "invalid_code" });
    for (let i = 0; i < 4; i += 1) await saisirCodeAccesP0({ statut: "attente" }, formulaire("faux"));
    expect(await saisirCodeAccesP0({ statut: "attente" }, formulaire(CODE_HEX))).toEqual({ statut: "too_many_attempts" });
  });

  it("le fichier d'action n'exporte que la saisie (aucun état de la garde appelable par un client)", async () => {
    expect(Object.keys(await import("@/server/actions/p0-acces")).sort()).toEqual(["saisirCodeAccesP0"]);
  });

  it("les « 12 heures » des textes restent alignées sur la durée du cookie (Max-Age)", () => {
    const heures = `${DUREE_COOKIE_S / 3600} heures`;
    expect(DUREE_COOKIE_S).toBe(43_200);
    expect(messages.prototype.acces.aide).toContain(heures);
    expect(messages.prototype.acces.ouverte).toContain(heures);
  });
});
