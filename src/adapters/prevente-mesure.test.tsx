import { readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage, * as pageAccueil from "@/app/page";
import PrecommandeMerciPage from "@/app/precommande/merci/page";
import PrecommandePage from "@/app/precommande/page";
import { PREVENTE_PROVENANCES_SUIVI } from "@/contracts/prevente-mesure";
import { journaliserVisitePerdue } from "@/server/prevente/journal";

import { sanitizeConnectionError } from "../../db/connection";
import { NAVIGATEURS, ROBOTS } from "../../tests/support/agents-utilisateurs";

import { compterVisitePrevente, compteurPreventeDisponible, creerMesurePreventeMemoire, type MesurePrevente } from "./prevente-mesure";
import { brancherMesurePrevente, debrancherMesurePreventePourTests } from "./prevente-mesure-instance";

/**
 * Compteur de visites branché sur `/` (spécification `specs/C2-prevente-mesure.md`, § 2 ; tâche C2b, ticket 1130 ;
 * critères A1 à A11). La page est rendue comme par le serveur (`await HomePage(…)`) ; la requête est simulée par les
 * en-têtes que rend `headers()` de Next.js, et `after()` par une file : l'écriture n'a lieu que quand la file est
 * vidée, comme après l'envoi de la réponse. « Écriture » : appel de la mise en œuvre de la mesure, observé par un espion
 * ou par la mise en œuvre en mémoire.
 *
 * Fichier colocalisé : le régime de confinement n'admet le double de `next/headers` et de `next/server` que sous `src/`.
 *
 * Hors de ce fichier : A12 (`prevente-disponibilite.test.tsx`), A14 (`tests/unit/prevente/visites-postgres.test.ts` et
 * `tests/db/prevente-compteur.test.ts`). **Non couverts** : A6 pour `HEAD` (la page ne connaît pas la méthode) et A13
 * (application construite) ; voir la description de la PR.
 */

const requete = vi.hoisted(() => ({
  entetes: new Headers(),
  lectures: 0,
  cookies: 0,
  taches: [] as (() => Promise<void>)[],
  ip: 0,
}));

vi.mock("next/headers", () => ({
  headers: async () => {
    requete.lectures += 1;
    return requete.entetes;
  },
  cookies: async () => {
    requete.cookies += 1;
    throw new Error("cookies() ne doit pas être appelé par la page de prévente");
  },
}));

vi.mock("next/server", () => ({
  after: (tache: () => Promise<void>) => {
    requete.taches.push(tache);
  },
}));

// Critère A9 : l'adresse IP n'est pas lue par le compteur.
vi.mock("@/server/ip", () => {
  const lue = () => {
    requete.ip += 1;
    return null;
  };
  return { trustedIpKey: lue, ipAddressKey: lue };
});

/** Lignes d'import du module de la mesure : ce qu'il peut atteindre. */
const IMPORTS_DE_LA_MESURE = readFileSync(path.resolve(__dirname, "prevente-mesure.ts"), "utf8")
  .split("\n")
  .filter((ligne) => /^import\b|\bfrom "/.test(ligne))
  .join("\n");

const NAVIGATEUR = NAVIGATEURS[0];

/** Vide la file de `after()` : ce qui s'exécute après l'envoi de la réponse. */
async function apresLaReponse(): Promise<void> {
  const taches = requete.taches.splice(0);
  await Promise.all(taches.map((tache) => tache()));
}

/** `GET /` : rend la page et son HTML, sans exécuter ce qui suit la réponse. */
async function get(parametres: Record<string, string | string[]> = {}, entetes: Record<string, string> = { "User-Agent": NAVIGATEUR }): Promise<string> {
  requete.entetes = new Headers(entetes);
  const { container } = render(await HomePage({ searchParams: Promise.resolve(parametres) }));
  const html = container.innerHTML;
  cleanup();
  return html;
}

/** Branche une mise en œuvre à la place de la précédente : compteur disponible et limiteur non configuré, sauf mention. */
function poser(mesure: Partial<MesurePrevente>): void {
  debrancherMesurePreventePourTests();
  brancherMesurePrevente({
    compteurDisponible: () => true,
    compterVisite: async () => undefined,
    limiteurConfigure: () => false,
    visitePerdue: journaliserVisitePerdue,
    ...mesure,
  });
}

let espion: ReturnType<typeof vi.fn<MesurePrevente["compterVisite"]>>;

function poserEspion(compterVisite: MesurePrevente["compterVisite"] = async () => undefined): void {
  espion = vi.fn(compterVisite);
  poser({ compterVisite: espion });
}

beforeEach(() => {
  vi.stubEnv("PREVENTE", "1");
  requete.entetes = new Headers();
  requete.lectures = 0;
  requete.cookies = 0;
  requete.ip = 0;
  requete.taches.length = 0;
  poserEspion();
});

afterEach(() => {
  debrancherMesurePreventePourTests();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("compteur de visites : ce qui compte", () => {
  it("A1 — GET / avec un navigateur : exactement une écriture, sous direct, pour le jour UTC", async () => {
    const memoire = creerMesurePreventeMemoire({ now: () => Date.UTC(2026, 10, 10, 23, 30) });
    poser(memoire);
    await get();
    expect(memoire.lignes()).toEqual([]);
    await apresLaReponse();
    expect(memoire.lignes()).toEqual([{ jour: "2026-11-10", src: "direct", visites: 1 }]);
  });

  it.each(PREVENTE_PROVENANCES_SUIVI)("A2 — GET /?src=%s : + 1 sous cette provenance", async (src) => {
    await get({ src });
    await apresLaReponse();
    expect(espion.mock.calls).toEqual([[src]]);
  });

  it("A3 — GET /?src=interne : aucune écriture, la requête n'est pas lue ; même page que ?src=forum, au lien près", async () => {
    const interne = await get({ src: "interne" });
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
    expect(requete.taches).toEqual([]);
    expect(requete.lectures).toBe(0);
    const forum = await get({ src: "forum" });
    expect(interne).toContain("/precommande?src=interne");
    expect(interne.replaceAll("src=interne", "src=forum")).toBe(forum);
  });

  it.each([
    [{ src: "inconnu-123" }, "autre"],
    [{ src: "FORUM" }, "direct"],
    [{ src: ["a", "b"] }, "direct"],
    [{ src: "" }, "direct"],
    [{ src: "x".repeat(31) }, "direct"],
    [{ src: "a b" }, "direct"],
    [{ src: "x".repeat(30) }, "autre"],
  ] as const)("A4 — GET / avec %j : + 1 sous %s", async (parametres, attendue) => {
    await get({ ...parametres } as Record<string, string | string[]>);
    await apresLaReponse();
    expect(espion.mock.calls).toEqual([[attendue]]);
  });

  it.each(ROBOTS)("A5 — robot déclaré, aucune écriture : %s", async (agent) => {
    await get({ src: "forum" }, { "User-Agent": agent });
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{}, { "User-Agent": "" }, { "User-Agent": "   " }])("A5 — agent utilisateur absent ou vide (%o) : aucune écriture", async (entetes) => {
    await get({ src: "forum" }, entetes);
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{ "Next-Router-Prefetch": "1" }, { Purpose: "prefetch" }, { "Sec-Purpose": "prefetch" }, { "Sec-Purpose": "prefetch;prerender" }, { "Next-Router-Segment-Prefetch": "/_tree" }])(
    "A6 — préchargement (%o) : aucune écriture",
    async (entetes) => {
      await get({ src: "forum" }, { "User-Agent": NAVIGATEUR, ...entetes });
      await apresLaReponse();
      expect(espion).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", "0", "true", " 1"])("A7 — PREVENTE=%j : aucune écriture sur /, la requête n'est pas lue, accueil habituel", async (valeur) => {
    vi.stubEnv("PREVENTE", valeur);
    const html = await get({ src: "forum" });
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
    expect(requete.lectures).toBe(0);
    expect(html).toContain("Créer un voyage");
    expect(html).not.toContain("Précommander");
    // Appel direct, hors de la page : la fonction revérifie l'interrupteur elle-même.
    requete.entetes = new Headers({ "User-Agent": NAVIGATEUR });
    await compterVisitePrevente("forum");
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
  });

  it("A7 — /precommande et /precommande/merci ne sont pas des visites : aucune écriture", async () => {
    requete.entetes = new Headers({ "User-Agent": NAVIGATEUR });
    // Sans lien de paiement : page « ouvre très bientôt » (la redirection vers le paiement ne rend rien).
    render(await PrecommandePage({ searchParams: Promise.resolve({ src: "forum" }) }));
    render(await PrecommandeMerciPage());
    cleanup();
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
    expect(requete.taches).toEqual([]);
  });

  it("A8 — deux GET / identiques : deux visites ; aucun cookie lu ni posé, aucun script dans la page", async () => {
    const premiere = await get({ src: "forum" });
    const seconde = await get({ src: "forum" });
    await apresLaReponse();
    expect(espion.mock.calls).toEqual([["forum"], ["forum"]]);
    expect(seconde).toBe(premiere);
    expect(requete.cookies).toBe(0);
    expect(premiere).not.toMatch(/<script/i);
    // Le module de la mesure n'importe de `next/headers` que `headers` : il ne peut ni lire ni poser un cookie.
    expect(IMPORTS_DE_LA_MESURE).toContain('import { headers } from "next/headers";');
    expect(IMPORTS_DE_LA_MESURE).not.toMatch(/cookies|draftMode/);
  });

  it("A9 — l'écriture ne reçoit que la provenance ; la ligne ne porte que jour, src et visites ; l'adresse IP n'est pas lue", async () => {
    const memoire = creerMesurePreventeMemoire();
    const ecritures: unknown[][] = [];
    poser({
      compteurDisponible: () => true,
      compterVisite: (...recus) => {
        ecritures.push(recus);
        return memoire.compterVisite(...recus);
      },
    });
    await get(
      { src: "groupe", utm_source: "x", email: "personne@example.org" },
      { "User-Agent": NAVIGATEUR, "X-Forwarded-For": "203.0.113.7", "X-Vercel-Forwarded-For": "203.0.113.7", Referer: "https://exemple.test/fil/42", Cookie: "session=abc" },
    );
    await apresLaReponse();
    expect(ecritures).toEqual([["groupe"]]);
    const lignes = memoire.lignes();
    expect(lignes).toHaveLength(1);
    expect(Object.keys(lignes[0]!).sort()).toEqual(["jour", "src", "visites"]);
    expect(JSON.stringify(lignes)).not.toMatch(/203\.0\.113\.7|Mozilla|exemple\.test|personne@|session/);
    expect(requete.ip).toBe(0);
    expect(IMPORTS_DE_LA_MESURE).not.toMatch(/server\/ip|rate-limit/);
  });
});

describe("compteur de visites : la page ne casse ni n'attend jamais", () => {
  /** Lignes du journal structuré écrites pendant le test. */
  function journal(): string[] {
    const lignes: string[] = [];
    for (const methode of ["log", "warn", "error"] as const) {
      vi.spyOn(console, methode).mockImplementation((...args: unknown[]) => {
        lignes.push(args.map(String).join(" "));
      });
    }
    return lignes;
  }

  it("A10 — l'écriture lève : même HTML que sans compteur, une ligne de journal, nom de l'erreur seul", async () => {
    const lignes = journal();
    poser({ compteurDisponible: () => false, compterVisite: espion });
    const sansCompteur = await get({ src: "forum" });
    class PanneDeBase extends Error {
      override name = "PanneDeBase";
    }
    poserEspion(async () => {
      throw new PanneDeBase("connect ECONNREFUSED postgres://vadrouille_app:motdepasse@db.exemple.test:5432/vadrouille");
    });
    const avecPanne = await get({ src: "forum" });
    expect(avecPanne).toBe(sansCompteur);
    expect(lignes).toEqual([]);
    await apresLaReponse();
    expect(espion).toHaveBeenCalledTimes(1);
    expect(lignes).toHaveLength(1);
    expect(JSON.parse(lignes[0]!)).toEqual({ level: "warn", event: "prevente.visite_perdue", errorName: "PanneDeBase" });
    expect(lignes[0]).not.toMatch(/postgres:|motdepasse|exemple\.test|ECONNREFUSED|Mozilla|forum/);
  });

  it("A10 — erreur de connexion telle que la rend db/connection.ts : le journal n'a que son nom, ni hôte ni code", async () => {
    const lignes = journal();
    const brute = Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:5432"), { code: "ECONNREFUSED" });
    poserEspion(async () => {
      throw sanitizeConnectionError(brute);
    });
    await expect(get({ src: "forum" })).resolves.toContain("Précommander");
    await apresLaReponse();
    expect(lignes.map((ligne) => JSON.parse(ligne) as unknown)).toEqual([{ level: "warn", event: "prevente.visite_perdue", errorName: "DatabaseConnectionError" }]);
    expect(lignes[0]).not.toMatch(/10\.1\.2\.3|5432|ECONNREFUSED/);
  });

  it("A10 — erreur sans nom lisible, ou levée de façon synchrone : la page répond, une ligne sans valeur", async () => {
    const lignes = journal();
    poserEspion(() => {
      throw "postgres://secret@hote";
    });
    await expect(get({ src: "forum" })).resolves.toContain("Précommander");
    await apresLaReponse();
    expect(lignes.map((ligne) => JSON.parse(ligne) as unknown)).toEqual([{ level: "warn", event: "prevente.visite_perdue" }]);
  });

  it("A10 — « compteur disponible » qui lève : la page répond, rien n'est écrit", async () => {
    poser({
      compteurDisponible: () => {
        throw new Error("garde");
      },
      compterVisite: espion,
    });
    await expect(get({ src: "forum" })).resolves.toContain("Précommander");
    expect(compteurPreventeDisponible()).toBe(false);
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
  });

  it("A11 — l'écriture ne se termine jamais : GET / répond quand même, le rendu ne l'attend pas", async () => {
    poserEspion(() => new Promise<void>(() => undefined));
    const html = await get({ src: "forum" });
    expect(html).toContain("Précommander");
    // La réponse est rendue avant tout appel de l'écriture : celle-ci n'est lancée qu'après (file de `after`).
    expect(espion).not.toHaveBeenCalled();
    expect(requete.taches).toHaveLength(1);
    const fin = vi.fn();
    void requete.taches[0]!().then(fin);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(espion).toHaveBeenCalledTimes(1);
    expect(fin).not.toHaveBeenCalled();
    // Une seconde requête répond aussi, sans attendre la première écriture.
    await expect(get({ src: "forum" })).resolves.toBe(html);
  });

  it("en-têtes illisibles (hors d'une requête) : la page répond, rien n'est écrit", async () => {
    const entetes = new Headers({ "User-Agent": NAVIGATEUR });
    vi.spyOn(entetes, "get").mockImplementation(() => {
      throw new Error("hors requête");
    });
    requete.entetes = entetes;
    const { container } = render(await HomePage({ searchParams: Promise.resolve({ src: "forum" }) }));
    expect(container.innerHTML).toContain("Précommander");
    cleanup();
    await apresLaReponse();
    expect(espion).not.toHaveBeenCalled();
  });
});

describe("A13 (garde statique) — la page de prévente est rendue à chaque requête, sans cache partagé", () => {
  const racine = path.resolve(__dirname, "../..");

  it("src/app/page.tsx : `dynamic` vaut « force-dynamic », aucun `revalidate`", () => {
    expect(pageAccueil.dynamic).toBe("force-dynamic");
    expect(Object.keys(pageAccueil)).not.toContain("revalidate");
    expect(readFileSync(path.join(racine, "src/app/page.tsx"), "utf8")).not.toMatch(/\brevalidate\b/);
  });

  it("next.config.ts : aucun en-tête `public` ni `s-maxage`, ni pour `/` ni ailleurs", () => {
    const config = readFileSync(path.join(racine, "next.config.ts"), "utf8");
    expect(config).toContain("Cache-Control");
    expect(config).not.toMatch(/s-maxage/i);
    const valeurs = [...config.matchAll(/key:\s*"Cache-Control",\s*value:\s*"([^"]*)"/g)].map((m) => m[1]!);
    expect(valeurs.length).toBeGreaterThan(0);
    for (const valeur of valeurs) expect(valeur).not.toMatch(/\bpublic\b/i);
    // Aucune règle d'en-têtes ne vise `/` : le cache de la page ne dépend que de son rendu dynamique.
    expect(config).not.toMatch(/source:\s*"\/"/);
  });
});
