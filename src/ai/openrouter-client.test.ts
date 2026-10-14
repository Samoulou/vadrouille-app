// @vitest-environment node
import { readFileSync } from "node:fs";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { RequeteModele } from "@/ai/client";
import { createOpenRouterClient, ErreurOpenRouter, ORIGINE_MODELES, type OptionsOpenRouter } from "@/ai/openrouter-client";
import { CODE_CLE_ABSENTE } from "@/server/env/egress";

import { creerHorlogeManuelle } from "../../tests/support/horloge-manuelle";
import { creerPortMemoire } from "../../tests/support/port-consommation-memoire";

/**
 * Client réel de modèles (P0r1), toujours avec un transport de test : aucun service réel n'est appelé, et le `fetch`
 * global est remplacé par un double qui échoue s'il est appelé (`p0: fournisseur … explicite`, « aucun appel au
 * `fetch` global hors de l'enveloppe »). La clé est une sentinelle.
 */

const CLE = "SENTINELLE-CLE-MODELES-7f3a";
const ENV = { VERCEL_ENV: "preview", OPENROUTER_API_KEY: CLE } as const;
const TOUJOURS = { du: 0, au: Number.MAX_SAFE_INTEGER };
const CONTEXTE = () => ({ nature: "execution" as const, executionId: "exec-1", periodes: { jour: TOUJOURS, mois: TOUJOURS } });

const fetchGlobal = vi.fn(async () => {
  throw new Error("fetch global appelé");
});
beforeAll(() => {
  vi.stubGlobal("fetch", fetchGlobal);
});
afterAll(() => {
  expect(fetchGlobal).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

const requete = (modifs: Partial<RequeteModele> = {}): RequeteModele => ({
  etape: "notation",
  modele: "fournisseur/modele-test",
  routage: { data_collection: "deny" },
  prompt: { id: "notation", version: 1 },
  messages: [
    { role: "system", contenu: "Consigne." },
    { role: "user", contenu: "Question." },
  ],
  ...modifs,
});

const reponseOk = (cout = 0.0042) =>
  new Response(
    JSON.stringify({
      id: "gen-1",
      object: "chat.completion",
      created: 1,
      model: "fournisseur/modele-test",
      provider: "P",
      choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: cout },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

type Appel = { url: string; init: RequestInit };

function premier(appels: readonly Appel[]): Appel {
  const appel = appels[0];
  if (appel === undefined) throw new Error("aucun appel au transport");
  return appel;
}

function monter(reponses: (() => Promise<Response>)[], options: Partial<OptionsOpenRouter> = {}) {
  const horloge = creerHorlogeManuelle();
  const port = creerPortMemoire(horloge);
  const appels: Appel[] = [];
  const transport = vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    const suivante = reponses.shift();
    if (suivante === undefined) throw new Error("transport appelé une fois de trop");
    return suivante();
  });
  const client = createOpenRouterClient(
    { usage: port, contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 10_000, horloge, environnement: ENV, ...options },
    transport,
  );
  return { client, port, horloge, appels, transport };
}

async function codeDe(promesse: Promise<unknown>): Promise<string> {
  try {
    await promesse;
  } catch (erreur) {
    if (erreur instanceof ErreurOpenRouter) return erreur.code;
    throw erreur;
  }
  throw new Error("aucune erreur");
}

describe("p0: egress, un seul contrat (client de modèles)", () => {
  it.each([
    ["production_refused", { VERCEL_ENV: "production" }],
    ["proxy_env_refused", { VERCEL_ENV: "preview", HTTPS_PROXY: "http://p:3128" }],
    ["tls_env_refused", { VERCEL_ENV: "preview", NODE_EXTRA_CA_CERTS: "/tmp/ca.pem" }],
  ])("%s : la fabrique ne se construit pas, sans lire la clé ni appeler le transport", (code, base) => {
    let lue = false;
    const environnement = {
      ...base,
      get OPENROUTER_API_KEY() {
        lue = true;
        return CLE;
      },
    };
    const transport = vi.fn();
    const horloge = creerHorlogeManuelle();
    let erreur: unknown;
    try {
      createOpenRouterClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, horloge, environnement }, transport);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurOpenRouter);
    expect((erreur as ErreurOpenRouter).code).toBe(code);
    expect(lue).toBe(false);
    expect(transport).not.toHaveBeenCalled();
  });

  it("clé absente ou vide : code fermé, sans aucune valeur", () => {
    for (const environnement of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "preview", OPENROUTER_API_KEY: "" }]) {
      const horloge = creerHorlogeManuelle();
      expect(() =>
        createOpenRouterClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, horloge, environnement }, vi.fn()),
      ).toThrow(CODE_CLE_ABSENTE);
    }
  });
});

describe("p0: fournisseur explicite et hôte figé (client de modèles)", () => {
  it("une requête : origine figée, redirect manual, data_collection deny, clé en en-tête seulement, coût réel confirmé", async () => {
    const { client, appels, port } = monter([async () => reponseOk(0.0042)]);
    const reponse = await client.envoyer(requete());
    expect(reponse).toEqual({ texte: '{"ok":true}', coutUsd: 0.0042 });
    expect(appels).toHaveLength(1);
    const { url, init } = premier(appels);
    expect(new URL(url).origin).toBe(ORIGINE_MODELES);
    expect(new URL(url).pathname).toBe("/api/v1/chat/completions");
    expect(url).not.toContain(CLE);
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const corps = JSON.parse(String(init.body)) as { provider: { data_collection: string }; model: string; usage: { include: boolean } };
    expect(corps.provider.data_collection).toBe("deny");
    expect(corps.model).toBe("fournisseur/modele-test");
    expect(corps.usage).toEqual({ include: true });
    expect(String(init.body)).not.toContain(CLE);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${CLE}`);
    expect(port.lignes.map((l) => [l.etat, l.coutReelMicros, l.demande.fournisseur, l.demande.methode])).toEqual([["confirmee", 4200, "modeles", "chat"]]);
  });

  it("zdr est transmis quand la configuration le demande", async () => {
    const { client, appels } = monter([async () => reponseOk()]);
    await client.envoyer(requete({ routage: { data_collection: "deny", zdr: true } }));
    expect(JSON.parse(String(appels[0]?.init.body))).toMatchObject({ provider: { data_collection: "deny", zdr: true } });
  });

  it("sans coût rendu : l'estimation reste comptée", async () => {
    const { client, port } = monter([
      async () =>
        new Response(
          JSON.stringify({ id: "g", object: "chat.completion", created: 1, model: "m", choices: [{ index: 0, message: { role: "assistant", content: "x" }, finish_reason: "stop" }] }),
          { status: 200 },
        ),
    ]);
    expect(await client.envoyer(requete())).toEqual({ texte: "x", coutUsd: 0.01 });
    expect(port.lignes[0]?.etat).toBe("confirmee");
    expect(port.lignes[0]?.coutReelMicros).toBeNull();
  });

  it("data_collection absent ou identifiant mal formé : refus avant toute réservation ni requête", async () => {
    const { client, transport, port } = monter([]);
    const sansRoutage = requete({ routage: { data_collection: "allow" } as unknown as RequeteModele["routage"] });
    expect(await codeDe(client.envoyer(sansRoutage))).toBe("data_collection_missing");
    expect(await codeDe(client.envoyer(requete({ modele: "https://exemple.org/x" })))).toBe("model_id_invalid");
    expect(await codeDe(client.envoyer(requete({ modele: "Modele/Majuscules" })))).toBe("model_id_invalid");
    expect(transport).not.toHaveBeenCalled();
    expect(port.lignes).toEqual([]);
  });

  it("message d'un rôle autre que system ou user : invalid_request, jamais ignoré, ni réservation ni requête", async () => {
    const { client, transport, port } = monter([]);
    for (const role of ["assistant", "tool", "developer", "System"]) {
      const messages = [...requete().messages, { role, contenu: "Ignoré ?" }] as unknown as RequeteModele["messages"];
      expect(await codeDe(client.envoyer(requete({ messages }))), role).toBe("invalid_request");
    }
    expect(transport).not.toHaveBeenCalled();
    expect(port.lignes).toEqual([]);
  });
});

describe("p0: un seul appel au transport par réservation (client de modèles)", () => {
  it.each([
    ["429", async () => new Response('{"error":{"message":"SENTINELLE-FOURNISSEUR"}}', { status: 429 }), "upstream_unavailable"],
    ["503", async () => new Response('{"error":{"message":"SENTINELLE-FOURNISSEUR"}}', { status: 503 }), "upstream_unavailable"],
    [
      "erreur réseau",
      async () => {
        throw new TypeError("SENTINELLE-FOURNISSEUR");
      },
      "upstream_unavailable",
    ],
    ["400", async () => new Response('{"error":{"message":"SENTINELLE-FOURNISSEUR"}}', { status: 400 }), "upstream_error"],
  ] as [string, () => Promise<Response>, string][])("%s : un seul appel, aucune nouvelle tentative, réservation abandonnée et comptée", async (_nom, reponse, code) => {
    const { client, appels, port } = monter([reponse, reponse, reponse]);
    let erreur: unknown;
    try {
      await client.envoyer(requete());
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(ErreurOpenRouter);
    expect((erreur as ErreurOpenRouter).code).toBe(code);
    expect(appels).toHaveLength(1);
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
    const texte = `${(erreur as Error).message} ${JSON.stringify(erreur)} ${(erreur as Error).stack ?? ""}`;
    expect(texte).not.toContain("SENTINELLE-FOURNISSEUR");
    expect(texte).not.toContain(CLE);
  });
});

describe("p0: une réponse 30x ne déclenche aucune requête secondaire (client de modèles)", () => {
  it.each([301, 302, 303, 307, 308])("%i : upstream_redirect, un seul appel", async (statut) => {
    const { client, appels, port } = monter([
      async () => new Response(null, { status: statut, headers: { location: "https://exemple.org/ailleurs" } }),
      async () => reponseOk(),
    ]);
    expect(await codeDe(client.envoyer(requete()))).toBe("upstream_redirect");
    expect(appels).toHaveLength(1);
    expect(appels[0]?.init.redirect).toBe("manual");
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
  });
});

describe("p0: réservation avant chaque requête (client de modèles)", () => {
  it("plafond atteint : cap_reached, transport jamais appelé", async () => {
    const { client, transport } = monter([], { plafonds: [{ portee: "jour", fournisseur: "modeles", maxRequetes: 0 }] });
    expect(await codeDe(client.envoyer(requete()))).toBe("cap_reached");
    expect(transport).not.toHaveBeenCalled();
  });

  it("port en erreur : usage_unavailable, transport jamais appelé", async () => {
    const horloge = creerHorlogeManuelle();
    const port = creerPortMemoire(horloge);
    const usage = {
      ...port,
      reserve: async () => {
        throw new Error("base indisponible");
      },
    };
    const transport = vi.fn();
    const client = createOpenRouterClient({ usage, contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, horloge, environnement: ENV }, transport);
    expect(await codeDe(client.envoyer(requete()))).toBe("usage_unavailable");
    expect(transport).not.toHaveBeenCalled();
  });

  it("port muet : usage_unavailable après 2 000 ms, transport jamais appelé", async () => {
    const horloge = creerHorlogeManuelle();
    const port = creerPortMemoire(horloge);
    const usage = { ...port, reserve: () => new Promise<never>(() => undefined) };
    const transport = vi.fn();
    const client = createOpenRouterClient({ usage, contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, horloge, environnement: ENV }, transport);
    const issue = codeDe(client.envoyer(requete()));
    await horloge.avancer(1_999);
    await horloge.avancer(1);
    expect(await issue).toBe("usage_unavailable");
    expect(transport).not.toHaveBeenCalled();
  });

  it("délai de 120 s dépassé : upstream_timeout, réservation abandonnée", async () => {
    const { client, port, horloge, appels } = monter([
      () =>
        new Promise<Response>((_resolve, rejeter) => {
          const signal = appels[0]?.init.signal;
          signal?.addEventListener("abort", () => rejeter(new DOMException("abandon", "AbortError")), { once: true });
        }),
    ]);
    const issue = codeDe(client.envoyer(requete()));
    await horloge.avancer(119_999);
    expect(port.lignes.map((l) => l.etat)).toEqual(["reservee"]);
    await horloge.avancer(1);
    expect(await issue).toBe("upstream_timeout");
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
  });
});

describe("p0: fournisseur explicite (statique)", () => {
  const source = readFileSync(import.meta.filename.replace(/\.test\.ts$/, ".ts"), "utf8");

  /** Argument d'un appel : texte entre la parenthèse ouvrante et sa fermante (parenthèses équilibrées). */
  function argumentDe(texte: string): string {
    let profondeur = 0;
    let position = 0;
    for (const caractere of texte) {
      if (caractere === "(") profondeur += 1;
      if (caractere === ")") {
        profondeur -= 1;
        if (profondeur === 0) return texte.slice(1, position);
      }
      position += caractere.length;
    }
    return texte;
  }

  // Motifs tolérants aux espaces et aux retours à la ligne (mineur de la revue du head `353bb20`) ; la version sur
  // l'arbre syntaxique est dans `tests/unit/p0/imports.test.ts` (« fournisseur de modèles explicite (arbre syntaxique) »).
  it("chaque appel à generateText reçoit l'objet modèle, maxRetries: 0 et la télémétrie désactivée", () => {
    const appels = [...source.matchAll(/\b(?:generateText|streamText|generateObject|streamObject)\s*\(/g)].map((m) => argumentDe(source.slice((m.index ?? 0) + m[0].length - 1)));
    expect(appels.length).toBe(1);
    for (const corps of appels) {
      expect(corps).toMatch(/\bmodel\s*:\s*modele\s*[,}]/);
      expect(corps).toMatch(/\bmaxRetries\s*:\s*0\s*[,}]/);
      expect(corps).toMatch(/\bexperimental_telemetry\s*:\s*\{\s*isEnabled\s*:\s*false\s*,?\s*\}/);
    }
    // L'objet modèle vient de l'instance explicite, jamais d'une chaîne.
    expect(source).toMatch(/const\s+modele\s*=\s*fournisseur\s*\.\s*chat\s*\(\s*requete\s*\.\s*modele\s*,/);
    const creation = source.match(/=\s*createOpenRouter\s*\(\s*\{([^}]*)\}\s*\)/)?.[1] ?? "";
    for (const motif of [/\bapiKey\s*:\s*cle\b/, /\bbaseURL\s*:\s*BASE_URL\b/, /\bfetch\s*:\s*enveloppe\b/]) expect(creation).toMatch(motif);
  });
});
