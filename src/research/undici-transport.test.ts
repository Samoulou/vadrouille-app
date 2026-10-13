// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { creerLecteurPages } from "@/research/fetch-page";
import { createUndiciTransport, lookupEpingle, raisonDeRefus } from "@/research/undici-transport";

/**
 * Transport réel de la lecture des pages (P0r1). `undici` et `node:dns/promises` sont remplacés par des doubles
 * (régime des tests, forme 2 : fabrique sans module réel) : aucune connexion ni résolution réelle n'a lieu.
 */

const etat = vi.hoisted(() => ({
  agents: [] as { options: unknown; requetes: unknown[]; detruit: boolean }[],
  reponses: [] as (() => unknown)[],
  resolutions: 0,
}));

vi.mock("undici", () => ({
  Agent: class {
    readonly suivi: { options: unknown; requetes: unknown[]; detruit: boolean };
    constructor(options: unknown) {
      this.suivi = { options, requetes: [], detruit: false };
      etat.agents.push(this.suivi);
    }
    async request(options: unknown) {
      this.suivi.requetes.push(options);
      const suivante = etat.reponses.shift();
      if (suivante === undefined) throw new Error("requête de trop");
      return suivante();
    }
    async destroy() {
      this.suivi.detruit = true;
    }
  },
}));

vi.mock("node:dns/promises", () => ({
  lookup: async () => {
    etat.resolutions += 1;
    throw new Error("résolution réelle appelée");
  },
}));

const PREVIEW = { VERCEL_ENV: "preview" };
const ADRESSE = "93.184.216.34";

async function* corps(texte: string): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode(texte);
}

const reponse = (statut: number, entetes: Record<string, string>, texte = "") => () => ({ statusCode: statut, headers: entetes, body: corps(texte) });

beforeEach(() => {
  etat.agents.length = 0;
  etat.reponses.length = 0;
  etat.resolutions = 0;
});

type Rappel = (erreur: Error | null, adresse?: unknown, famille?: number) => void;
const appelerLookup = (lookup: ReturnType<typeof lookupEpingle>, nom: string, options: { all?: boolean }) =>
  new Promise<{ erreur: Error | null; adresse?: unknown; famille?: number }>((resolve) => {
    const rappel: Rappel = (erreur, adresse, famille) => resolve({ erreur, adresse, famille });
    lookup(nom, options, rappel as Parameters<typeof lookup>[2]);
  });

describe("p0: épinglage de connect.lookup (transport de pages)", () => {
  it("all: true : tableau de la seule adresse vérifiée", async () => {
    expect(await appelerLookup(lookupEpingle("exemple.org", ADRESSE), "exemple.org", { all: true })).toEqual({
      erreur: null,
      adresse: [{ address: ADRESSE, family: 4 }],
      famille: undefined,
    });
  });
  it("all: false : l'adresse et sa famille ; IPv6 : famille 6", async () => {
    expect(await appelerLookup(lookupEpingle("exemple.org", ADRESSE), "exemple.org", {})).toEqual({ erreur: null, adresse: ADRESSE, famille: 4 });
    expect(await appelerLookup(lookupEpingle("exemple.org", "2606:2800:220:1::1"), "exemple.org", { all: false })).toMatchObject({ famille: 6 });
  });
  it("nom d'hôte différent : erreur, aucune adresse", async () => {
    const issue = await appelerLookup(lookupEpingle("exemple.org", ADRESSE), "autre.exemple", { all: true });
    expect(issue.erreur).toBeInstanceOf(Error);
    expect(issue.adresse).toBe("");
  });
});

describe("p0: egress, un seul contrat (transport de pages)", () => {
  it.each([
    ["production_refused", { VERCEL_ENV: "production" }, "production_refused"],
    ["proxy_env_refused", { VERCEL_ENV: "preview", HTTP_PROXY: "http://p:3128" }, "proxy_required"],
    ["proxy_env_refused (minuscules)", { VERCEL_ENV: "preview", http_proxy: "http://p:3128" }, "proxy_required"],
    ["tls_env_refused", { VERCEL_ENV: "preview", SSL_CERT_DIR: "/tmp" }, "tls_env_refused"],
  ])("%s : chaque page refusée (%s), sans résolution ni connexion", async (_nom, environnement, raison) => {
    const resoudre = vi.fn(async () => [ADRESSE]);
    const lecteur = creerLecteurPages(createUndiciTransport({ environnement, resoudre }));
    expect(await lecteur.lire("https://exemple.org/page", new Set(["https://exemple.org/page"]))).toEqual({ ok: false, raison });
    expect(resoudre).not.toHaveBeenCalled();
    expect(etat.agents).toEqual([]);
    expect(etat.resolutions).toBe(0);
  });

  it("correspondance des codes", () => {
    expect([raisonDeRefus("production_refused"), raisonDeRefus("proxy_env_refused"), raisonDeRefus("tls_env_refused")]).toEqual([
      "production_refused",
      "proxy_required",
      "tls_env_refused",
    ]);
  });

  it("option de proxy dans execArgv injecté : proxy_required", async () => {
    const lecteur = creerLecteurPages(createUndiciTransport({ environnement: PREVIEW, execArgv: ["--use-env-proxy"], resoudre: vi.fn() }));
    expect(await lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]))).toEqual({ ok: false, raison: "proxy_required" });
  });
});

describe("p0: transport de pages, un Agent par saut, fermé à la fin du saut", () => {
  it("lecture simple : une résolution, un Agent épinglé (lookup, servername), seuls trois en-têtes, Agent détruit", async () => {
    const resoudre = vi.fn(async () => [ADRESSE]);
    etat.reponses.push(reponse(200, { "Content-Type": "text/plain" }, "Bonjour"));
    const lecteur = creerLecteurPages(createUndiciTransport({ environnement: PREVIEW, resoudre }));
    expect(await lecteur.lire("https://exemple.org/page", new Set(["https://exemple.org/page"]))).toEqual({ ok: true, texte: "Bonjour" });
    expect(resoudre).toHaveBeenCalledTimes(1);
    expect(etat.agents).toHaveLength(1);
    const [agent] = etat.agents;
    const options = agent?.options as { connect: { servername: string; lookup: ReturnType<typeof lookupEpingle> } };
    expect(options.connect.servername).toBe("exemple.org");
    expect(await appelerLookup(options.connect.lookup, "exemple.org", { all: true })).toMatchObject({ adresse: [{ address: ADRESSE, family: 4 }] });
    const requete = agent?.requetes[0] as { origin: string; path: string; method: string; headers: Record<string, string> };
    expect(requete.origin).toBe("https://exemple.org:443");
    expect(requete.path).toBe("/page");
    expect(requete.method).toBe("GET");
    expect(Object.keys(requete.headers).length).toBeGreaterThan(0);
    expect(Object.keys(requete.headers).every((n) => ["accept", "accept-encoding", "user-agent"].includes(n))).toBe(true);
    expect(agent?.detruit).toBe(true);
    expect(etat.resolutions).toBe(0);
  });

  it("redirection : un Agent par saut, une résolution par saut, chacun détruit", async () => {
    const resoudre = vi.fn(async () => [ADRESSE]);
    etat.reponses.push(reponse(302, { location: "https://exemple.org/b" }), reponse(200, { "content-type": "text/plain" }, "Fin"));
    const lecteur = creerLecteurPages(createUndiciTransport({ environnement: PREVIEW, resoudre }));
    expect(await lecteur.lire("https://exemple.org/a", new Set(["https://exemple.org/a"]))).toEqual({ ok: true, texte: "Fin" });
    expect(resoudre).toHaveBeenCalledTimes(2);
    expect(etat.agents).toHaveLength(2);
    expect(etat.agents.every((a) => a.detruit)).toBe(true);
  });

  it("erreur de connexion : Agent détruit, page refusée", async () => {
    etat.reponses.push(() => {
      throw new Error("ECONNRESET");
    });
    const lecteur = creerLecteurPages(createUndiciTransport({ environnement: PREVIEW, resoudre: async () => [ADRESSE] }));
    const issue = await lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]));
    expect(issue.ok).toBe(false);
    expect(etat.agents).toHaveLength(1);
    expect(etat.agents[0]?.detruit).toBe(true);
  });

  it("réponse refusée par la garde (type de contenu) : Agent détruit", async () => {
    etat.reponses.push(reponse(200, { "content-type": "application/pdf" }, "%PDF"));
    const lecteur = creerLecteurPages(createUndiciTransport({ environnement: PREVIEW, resoudre: async () => [ADRESSE] }));
    expect(await lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]))).toEqual({ ok: false, raison: "content_type" });
    expect(etat.agents[0]?.detruit).toBe(true);
  });

  it("adresse privée : refus de la garde, aucun Agent créé", async () => {
    const lecteur = creerLecteurPages(createUndiciTransport({ environnement: PREVIEW, resoudre: async () => ["10.0.0.1"] }));
    const issue = await lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]));
    expect(issue.ok).toBe(false);
    expect(etat.agents).toEqual([]);
  });
});
