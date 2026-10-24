// @vitest-environment node
import { readFileSync } from "node:fs";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RequeteModele } from "@/ai/client";
import {
  COUT_ESTIME_PROGRAMME_MICROS,
  createOpenRouterClient,
  ErreurOpenRouter,
  JETONS_RAISONNEMENT_MAX_PROGRAMME,
  JETONS_SORTIE_MAX_PROGRAMME,
  ORIGINE_MODELES,
  type OptionsOpenRouter,
} from "@/ai/openrouter-client";
import { CODE_CLE_ABSENTE, CODES_ERREUR_OPENROUTER } from "@/ai/erreurs";

import { creerHorlogeManuelle } from "../../tests/support/horloge-manuelle";
import { creerPortMemoire } from "../../tests/support/port-consommation-memoire";

// 0046 D21 : la barrière de sortie lit aussi le vrai `process.env` ; ces tests le posent en préversion, puis le rétablissent.
beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

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
    { usage: port, contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 10_000, coutEstimeRechercheWebMicros: 25_000, horloge, environnement: ENV, ...options },
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
      createOpenRouterClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, coutEstimeRechercheWebMicros: 1, horloge, environnement }, transport);
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
        createOpenRouterClient({ usage: creerPortMemoire(horloge), contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, coutEstimeRechercheWebMicros: 1, horloge, environnement }, vi.fn()),
      ).toThrow(CODE_CLE_ABSENTE);
    }
  });
});

describe("p0: fournisseur explicite et hôte figé (client de modèles)", () => {
  it("une requête : origine figée, redirect manual, data_collection deny, clé en en-tête seulement, coût réel confirmé", async () => {
    const { client, appels, port } = monter([async () => reponseOk(0.0042)]);
    const reponse = await client.envoyer(requete());
    expect(reponse).toEqual({ texte: '{"ok":true}', coutUsd: 0.0042, fin: "stop", tokens: { entree: 10, sortie: 5 } });
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

  it("décision 0096 § 2 point 6 : seuls inputTokens et outputTokens entrent dans la réponse, gardés s'ils sont des entiers bornés", async () => {
    const corps = (usage: Record<string, unknown>) =>
      new Response(
        JSON.stringify({
          id: "g",
          object: "chat.completion",
          created: 1,
          model: "m",
          provider: "SENTINELLE-FOURNISSEUR",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "x" },
              finish_reason: "stop",
            },
          ],
          usage,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const ok = monter([
      async () =>
        corps({
          prompt_tokens: 1200,
          completion_tokens: 340,
          total_tokens: 1540,
          cost: 0.002,
        }),
    ]);
    const reponse = await ok.client.envoyer(requete());
    expect(reponse.tokens).toEqual({ entree: 1200, sortie: 340 });
    expect(Object.keys(reponse).sort()).toEqual([
      "coutUsd",
      "fin",
      "texte",
      "tokens",
    ]);
    expect(JSON.stringify(reponse)).not.toContain("SENTINELLE");
    // Au-delà de la borne : l'attribut manque, la réponse reste valide.
    const trop = monter([
      async () =>
        corps({
          prompt_tokens: 10_000_001,
          completion_tokens: 5,
          total_tokens: 10_000_006,
          cost: 0.002,
        }),
    ]);
    const reponseTrop = await trop.client.envoyer(requete());
    expect(reponseTrop.tokens).toBeUndefined();
    expect(reponseTrop.texte).toBe("x");
  });

  it("zdr est transmis quand la configuration le demande", async () => {
    const { client, appels } = monter([async () => reponseOk()]);
    await client.envoyer(requete({ routage: { data_collection: "deny", zdr: true } }));
    expect(JSON.parse(String(appels[0]?.init.body))).toMatchObject({ provider: { data_collection: "deny", zdr: true } });
  });

  it("zdr absent du corps quand le routage n'en pose pas (décision 0096 § 4.1 : jamais de zdr hors de l'étape qui le demande)", async () => {
    const { client, appels } = monter([async () => reponseOk()]);
    await client.envoyer(requete());
    expect((JSON.parse(String(appels[0]?.init.body)) as { provider: unknown }).provider).toEqual({ data_collection: "deny" });
  });

  it("sans coût rendu : l'estimation reste comptée", async () => {
    const { client, port } = monter([
      async () =>
        new Response(
          JSON.stringify({ id: "g", object: "chat.completion", created: 1, model: "m", choices: [{ index: 0, message: { role: "assistant", content: "x" }, finish_reason: "stop" }] }),
          { status: 200 },
        ),
    ]);
    // Sans `usage`, l'AI SDK rend des jetons nuls (0) : la valeur 0 est admise (entier de 0 à 10 000 000).
    expect(await client.envoyer(requete())).toEqual({ texte: "x", coutUsd: 0.01, fin: "stop", tokens: { entree: 0, sortie: 0 } });
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
    const client = createOpenRouterClient({ usage, contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, coutEstimeRechercheWebMicros: 1, horloge, environnement: ENV }, transport);
    expect(await codeDe(client.envoyer(requete()))).toBe("usage_unavailable");
    expect(transport).not.toHaveBeenCalled();
  });

  it("port muet : usage_unavailable après 2 000 ms, transport jamais appelé", async () => {
    const horloge = creerHorlogeManuelle();
    const port = creerPortMemoire(horloge);
    const usage = { ...port, reserve: () => new Promise<never>(() => undefined) };
    const transport = vi.fn();
    const client = createOpenRouterClient({ usage, contexte: CONTEXTE, plafonds: [], coutEstimeMicros: 1, coutEstimeRechercheWebMicros: 1, horloge, environnement: ENV }, transport);
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

  // Décision 0116 § 2.3 (amende 0046 D13 point 5 pour la seule nature `programme`).
  it("programme: délai de la requête programme à 300 s, autres délais inchangés", async () => {
    const pendante = (appels: () => readonly Appel[]) => () =>
      new Promise<Response>((_resolve, rejeter) => {
        const signal = appels()[0]?.init.signal;
        signal?.addEventListener("abort", () => rejeter(new DOMException("abandon", "AbortError")), { once: true });
      });
    const programme: ReturnType<typeof monter> = monter([pendante(() => programme.appels)]);
    const issue = codeDe(programme.client.envoyer(requete({ etape: "programme", prompt: { id: "programme", version: 1 } })));
    await programme.horloge.avancer(299_999);
    expect(programme.port.lignes.map((l) => l.etat)).toEqual(["reservee"]);
    await programme.horloge.avancer(1);
    expect(await issue).toBe("upstream_timeout");
    expect(programme.port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
    // Toute autre nature garde 120 s.
    const autre: ReturnType<typeof monter> = monter([pendante(() => autre.appels)]);
    const issueAutre = codeDe(autre.client.envoyer(requete({ etape: "notation" })));
    await autre.horloge.avancer(119_999);
    expect(autre.port.lignes.map((l) => l.etat)).toEqual(["reservee"]);
    await autre.horloge.avancer(1);
    expect(await issueAutre).toBe("upstream_timeout");
  });
});

describe("programme: requête zdr (verdict S5 de 0117, décision 0116 § 2.2)", () => {
  it.each([
    ["404 (aucun fournisseur zdr)", 404, "upstream_error"],
    ["400", 400, "upstream_error"],
    ["503", 503, "upstream_unavailable"],
  ] as [string, number, string][])("programme: requête programme en zdr, refus du fournisseur sans second appel, code fermé (%s)", async (_nom, statut, code) => {
    const refus = async () => new Response('{"error":{"message":"SENTINELLE-FOURNISSEUR No endpoints found matching your data policy"}}', { status: statut });
    const { client, appels, port } = monter([refus, refus, refus]);
    let erreur: unknown;
    try {
      await client.envoyer(requete({ etape: "programme", prompt: { id: "programme", version: 1 }, routage: { data_collection: "deny", zdr: true } }));
    } catch (e) {
      erreur = e;
    }
    // Un seul appel, jamais un second sans zdr ni vers un autre fournisseur ; code fermé, aucun message du fournisseur.
    expect(appels).toHaveLength(1);
    const corps = JSON.parse(String(appels[0]!.init.body)) as { provider?: Record<string, unknown> };
    expect(corps.provider).toMatchObject({ data_collection: "deny", zdr: true });
    expect((erreur as ErreurOpenRouter).code).toBe(code);
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
    expect(`${(erreur as Error).message} ${JSON.stringify(erreur)}`).not.toContain("SENTINELLE-FOURNISSEUR");
  });
});

describe("programme: plafond de jetons de sortie et réservation (revue 1 de la PR 632, mineur 9)", () => {
  it("programme: max_tokens et coût estimé propres à la requête programme ; autres requêtes inchangées", async () => {
    const { client, appels, port } = monter([async () => reponseOk(0.02), async () => reponseOk(0.001)]);
    await client.envoyer(requete({ etape: "programme", prompt: { id: "programme", version: 1 }, routage: { data_collection: "deny", zdr: true } }));
    await client.envoyer(requete());
    const corps = appels.map((appel) => JSON.parse(String(appel.init.body)) as { max_tokens?: number });
    expect(corps[0]?.max_tokens).toBe(JETONS_SORTIE_MAX_PROGRAMME);
    expect(corps[1]?.max_tokens).toBeUndefined();
    expect(port.lignes.map((l) => l.demande.coutEstimeMicros)).toEqual([COUT_ESTIME_PROGRAMME_MICROS, 10_000]);
    expect(JETONS_SORTIE_MAX_PROGRAMME).toBe(32_000);
    // Sous le plafond de 3 USD par exécution, avec une seule requête programme.
    expect(COUT_ESTIME_PROGRAMME_MICROS).toBe(90_000);
    expect(COUT_ESTIME_PROGRAMME_MICROS).toBeLessThan(3_000_000);
  });
});

describe("programme: raisonnement borné par hypothèse (décision 0130 § 1)", () => {
  it("programme: reasoning.max_tokens demandé pour la requête programme (prompts programme et revision), routage inchangé ; aucune autre requête", async () => {
    const { client, appels } = monter([async () => reponseOk(), async () => reponseOk(), async () => reponseOk()]);
    await client.envoyer(requete({ etape: "programme", prompt: { id: "programme", version: 1 }, routage: { data_collection: "deny", zdr: true } }));
    // Révision : même nature de requête (`etape: "programme"`, prompt distinct).
    await client.envoyer(requete({ etape: "programme", prompt: { id: "revision", version: 1 }, routage: { data_collection: "deny", zdr: true } }));
    await client.envoyer(requete());
    const corps = appels.map((appel) => JSON.parse(String(appel.init.body)) as { max_tokens?: number; reasoning?: unknown; provider?: unknown });
    for (const programme of corps.slice(0, 2)) {
      expect(programme.reasoning).toEqual({ max_tokens: JETONS_RAISONNEMENT_MAX_PROGRAMME });
      expect(programme.provider).toEqual({ data_collection: "deny", zdr: true });
    }
    expect(corps[2]?.reasoning).toBeUndefined();
    // Plafond total inchangé (réservation inchangée) ; budget demandé sous ce plafond. Ce que le fournisseur en fait n'est
    // pas vérifiable ici (0130 § 1.2) : aucun nombre de jetons n'est garanti à la réponse.
    expect(corps[0]?.max_tokens).toBe(JETONS_SORTIE_MAX_PROGRAMME);
    expect(JETONS_RAISONNEMENT_MAX_PROGRAMME).toBe(8_000);
    expect(JETONS_RAISONNEMENT_MAX_PROGRAMME).toBeLessThan(JETONS_SORTIE_MAX_PROGRAMME);
  });

  it("programme: raisonnement qui épuise le plafond, texte vide, fin `length` et jetons rendus (jamais le texte)", async () => {
    const epuise = async () =>
      new Response(
        JSON.stringify({
          id: "gen-2",
          object: "chat.completion",
          created: 1,
          model: "fournisseur/modele-test",
          choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "length" }],
          usage: { prompt_tokens: 9000, completion_tokens: 32000, total_tokens: 41000, cost: 0.08 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    const { client } = monter([epuise]);
    const reponse = await client.envoyer(requete({ etape: "programme", prompt: { id: "programme", version: 1 }, routage: { data_collection: "deny", zdr: true } }));
    expect(reponse).toEqual({ texte: "", coutUsd: 0.08, fin: "length", tokens: { entree: 9000, sortie: 32000 } });
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

describe("p0: recherche web du fournisseur (0055 § 7 point 2)", () => {
  const requeteWeb = (modifs: Record<string, unknown> = {}) => ({
    modele: "fournisseur/recherche-test",
    routage: { data_collection: "deny" as const },
    moteur: "exa" as const,
    prompt: { id: "recherche-web", version: 2 },
    messages: [
      { role: "system" as const, contenu: "Consigne." },
      { role: "user" as const, contenu: "musées Édimbourg" },
    ],
    maxResultats: 3,
    ...modifs,
  });

  const reponseWeb = (annotations: unknown[], cout = 0.0061) =>
    new Response(
      JSON.stringify({
        id: "gen-2",
        object: "chat.completion",
        created: 1,
        model: "fournisseur/recherche-test",
        provider: "P",
        choices: [{ index: 0, message: { role: "assistant", content: "SENTINELLE-TEXTE-MODELE", annotations }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: cout },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const citation = (url: string, title: string, content: string) => ({ type: "url_citation", url_citation: { url, title, content, start_index: 0, end_index: 1 } });

  it("même enveloppe et même réservation ; greffon web seul, borné ; sources rendues, texte du modèle ignoré", async () => {
    const { client, appels, port } = monter([async () => reponseWeb([citation("https://exemple.org/a", "A", "Extrait A")])]);
    const reponse = await client.rechercherWeb(requeteWeb());
    expect(reponse).toEqual({ sources: [{ url: "https://exemple.org/a", titre: "A", extrait: "Extrait A" }], coutUsd: 0.0061 });
    expect(JSON.stringify(reponse)).not.toContain("SENTINELLE-TEXTE-MODELE");
    const { url, init } = premier(appels);
    expect(new URL(url).origin).toBe(ORIGINE_MODELES);
    expect(init.redirect).toBe("manual");
    const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(corps.plugins).toEqual([{ id: "web", engine: "exa", max_results: 3 }]);
    expect(corps.provider).toEqual({ data_collection: "deny" });
    expect(corps.model).toBe("fournisseur/recherche-test");
    expect(String(init.body)).not.toContain(CLE);
    expect(port.lignes.map((l) => [l.etat, l.coutReelMicros, l.demande.fournisseur, l.demande.methode, l.demande.sku, l.demande.coutEstimeMicros])).toEqual([
      ["confirmee", 6100, "modeles", "chat", "fournisseur/recherche-test", 25_000],
    ]);
  });

  it("moteur fixé (bloquant 1c de la PR 326) : `native` envoyé tel quel ; moteur absent ou inconnu : invalid_request, ni réservation ni requête", async () => {
    const { client, appels } = monter([async () => reponseWeb([])]);
    await client.rechercherWeb(requeteWeb({ moteur: "native" }));
    expect((JSON.parse(String(premier(appels).init.body)) as { plugins: unknown }).plugins).toEqual([{ id: "web", engine: "native", max_results: 3 }]);
    for (const moteur of [undefined, "auto", "firecrawl", "parallel", "EXA"]) {
      const refus = monter([]);
      expect(await codeDe(refus.client.rechercherWeb(requeteWeb({ moteur }))), String(moteur)).toBe("invalid_request");
      expect(refus.transport).not.toHaveBeenCalled();
      expect(refus.port.lignes).toEqual([]);
    }
  });

  it("estimation distincte (mineur 2 de la PR 326) : la recherche web réserve son propre coût estimé, repli quand le coût réel manque", async () => {
    const sansCout = new Response(
      JSON.stringify({
        id: "gen-3",
        object: "chat.completion",
        created: 1,
        model: "fournisseur/recherche-test",
        provider: "P",
        choices: [{ index: 0, message: { role: "assistant", content: "x", annotations: [] }, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const { client, port } = monter([async () => sansCout, async () => reponseOk()]);
    expect((await client.rechercherWeb(requeteWeb())).coutUsd).toBe(0.025);
    await client.envoyer(requete());
    expect(port.lignes.map((l) => l.demande.coutEstimeMicros)).toEqual([25_000, 10_000]);
  });

  it("envoyer n'ajoute jamais le greffon web", async () => {
    const { client, appels } = monter([async () => reponseOk()]);
    await client.envoyer(requete());
    expect(JSON.parse(String(premier(appels).init.body))).not.toHaveProperty("plugins");
  });

  it.each([0, 11, 2.5, Number.NaN])("nombre de résultats %s hors de [1, 10] : invalid_request, ni réservation ni requête", async (maxResultats) => {
    const { client, transport, port } = monter([]);
    expect(await codeDe(client.rechercherWeb(requeteWeb({ maxResultats })))).toBe("invalid_request");
    expect(transport).not.toHaveBeenCalled();
    expect(port.lignes).toEqual([]);
  });

  it("data_collection absent, identifiant mal formé, rôle inconnu : refus avant toute réservation ni requête", async () => {
    const { client, transport, port } = monter([]);
    expect(await codeDe(client.rechercherWeb(requeteWeb({ routage: { data_collection: "allow" } })))).toBe("data_collection_missing");
    expect(await codeDe(client.rechercherWeb(requeteWeb({ modele: "https://exemple.org/x" })))).toBe("model_id_invalid");
    expect(await codeDe(client.rechercherWeb(requeteWeb({ messages: [{ role: "assistant", contenu: "x" }] })))).toBe("invalid_request");
    expect(transport).not.toHaveBeenCalled();
    expect(port.lignes).toEqual([]);
  });

  it("erreur du fournisseur : code fermé, aucun texte de la réponse, un seul appel", async () => {
    const { client, appels, port } = monter([async () => new Response('{"error":{"message":"SENTINELLE-FOURNISSEUR"}}', { status: 503 })]);
    let erreur: unknown;
    try {
      await client.rechercherWeb(requeteWeb());
    } catch (e) {
      erreur = e;
    }
    expect((erreur as ErreurOpenRouter).code).toBe("upstream_unavailable");
    expect(`${(erreur as Error).message} ${JSON.stringify(erreur)}`).not.toContain("SENTINELLE-FOURNISSEUR");
    expect(appels).toHaveLength(1);
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
  });
});

describe("B7a : retryable des erreurs du client réel (décision 0077 § 3 point 3)", () => {
  it("vrai seulement pour upstream_unavailable et upstream_timeout (REESSAYABLES de src/ai/erreurs.ts)", () => {
    for (const code of CODES_ERREUR_OPENROUTER) expect(new ErreurOpenRouter(code).retryable, code).toBe(code === "upstream_unavailable" || code === "upstream_timeout");
  });
});
