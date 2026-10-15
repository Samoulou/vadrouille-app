import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Route de flux du Workflow SDK et page de lancement hors de la préversion de `p0-reel` (décision 0063, point 8 ; 0055,
 * sections 1 et 8, ligne P0r3d).
 *
 * **Build de la CI** (monde local du SDK, aucune variable de Vercel ; la garde du mode réel est fermée) :
 * - sans en-têtes de file (`x-vqs-*`), ou avec des en-têtes de file d'une autre forme (CloudEvent de `@vercel/queue`),
 *   la route `/.well-known/workflow/v1/flow` refuse avant son gestionnaire (400, en-têtes invalides ou corps absent) ;
 * - avec des en-têtes `x-vqs-*` bien formés et un message forgé, le monde local **atteint** son gestionnaire (exposition
 *   hors de Vercel, connue : 0063 point 8), qui refuse une exécution qu'il ne connaît pas (500,
 *   `WorkflowRunNotFoundError`) : aucune étape de `p0Run` ne part ; une étape qui partirait rencontrerait la garde
 *   (`tests/unit/workflows/p0-run-hors-vercel.test.ts`) ;
 * - `webhook/[token]` rend 404 (aucun jeton créé, 0063 point 4) ; `/prototype/executions` rend 404 (page absente) ;
 * - l'action de lancement, appelée directement par son identifiant (une action serveur reste appelable même quand sa
 *   page rend 404), rend `fermee` : la garde est dans l'action, aucune base n'est lue, rien n'est réservé ni démarré.
 *
 * **Préversion de `p0-reel`** (condition du premier lancement réel, 0063 point 8 ; relevé humain, l'adresse et le jeton
 * de contournement de la protection Vercel ne sont pas accessibles aux agents) : avec `E2E_P0_REEL_URL` (adresse de la
 * préversion) et `E2E_P0_REEL_BYPASS` (jeton « Protection Bypass for Automation » du projet), le bloc « préversion »
 * envoie les mêmes requêtes directes, avec et sans en-têtes de file, dont un CloudEvent binaire bien formé : `@vercel/queue`
 * 0.8.0 passe un tel message au gestionnaire du workflow **sans le vérifier auprès du service de files**
 * (`handleCallback` → `consumeMessage` → `processMessage`) ; seule la protection de la plateforme (« Consumer function
 * security ») l'arrête. Critère, fermé : chaque requête est refusée par la plateforme (401 ou 403) ; toute autre réponse
 * fait échouer le relevé, et la Sécurité décide. Sans ces variables, le bloc est ignoré. L'adresse doit être en `https:`
 * sur une préversion du projet : contrôlée avant tout envoi du jeton ; aucune redirection n'est suivie.
 */

const FLUX = "/.well-known/workflow/v1/flow";
const RUN_FORGE = "wrun_01FORGE00000000000000000";

/** En-têtes de file du monde local (`createQueueHandler` de `@workflow/world-local` 5.0.2), bien formés. */
const ENTETES_VQS = {
  "x-vqs-queue-name": "__wkf_workflow_p0Run",
  "x-vqs-message-id": "msg_forge",
  "x-vqs-message-attempt": "1",
  "content-type": "application/json",
};

/** CloudEvent binaire de `@vercel/queue` 0.8.0 (`parseBinaryHeaders`), bien formé, reçu de file forgé. */
const ENTETES_CLOUDEVENT = {
  "ce-type": "com.vercel.queue.v2beta",
  "ce-vqsqueuename": "__wkf_workflow_p0Run",
  "ce-vqsconsumergroup": "forge",
  "ce-vqsmessageid": "msg_forge",
  "ce-vqsreceipthandle": "forge",
  "ce-vqsdeliverycount": "1",
  "content-type": "application/json",
};

type Sonde = { readonly nom: string; readonly envoyer: (requete: APIRequestContext, base: string, entetes: Record<string, string>) => ReturnType<APIRequestContext["get"]> };

/** Aucune redirection suivie : le jeton de contournement ne part jamais vers une autre adresse (mineur 6 du head `b85e797`). */
const SANS_REDIRECTION = { maxRedirects: 0 } as const;

const SONDES: readonly Sonde[] = [
  { nom: "GET sans en-têtes", envoyer: (r, base, e) => r.get(`${base}${FLUX}`, { ...SANS_REDIRECTION, headers: e }) },
  { nom: "POST sans en-têtes", envoyer: (r, base, e) => r.post(`${base}${FLUX}`, { ...SANS_REDIRECTION, headers: e, data: { runId: RUN_FORGE } }) },
  {
    nom: "POST x-vqs-* forgé",
    envoyer: (r, base, e) => r.post(`${base}${FLUX}`, { ...SANS_REDIRECTION, headers: { ...e, ...ENTETES_VQS }, data: { runId: RUN_FORGE } }),
  },
  {
    nom: "POST CloudEvent forgé",
    envoyer: (r, base, e) => r.post(`${base}${FLUX}`, { ...SANS_REDIRECTION, headers: { ...e, ...ENTETES_CLOUDEVENT }, data: { runId: RUN_FORGE } }),
  },
];

/** Identifiant de l'action de lancement dans le build servi (manifeste des références serveur de Next). */
function identifiantAction(nom: string): string {
  const manifeste = JSON.parse(readFileSync(path.join(process.cwd(), ".next/server/server-reference-manifest.json"), "utf8")) as {
    node: Record<string, { exportedName?: string; filename?: string }>;
  };
  const trouves = Object.entries(manifeste.node).filter(([, v]) => v.exportedName === nom && v.filename === "src/server/actions/p0-lancement.ts");
  expect(trouves).toHaveLength(1);
  return trouves[0]![0];
}

test.describe("p0-flux: build de la CI (monde local, garde fermée)", () => {
  test("sans en-têtes de file ou d'une autre forme : 400 avant le gestionnaire", async ({ request, baseURL }) => {
    for (const sonde of SONDES.filter((s) => s.nom !== "POST x-vqs-* forgé")) {
      const reponse = await sonde.envoyer(request, baseURL!, {});
      expect(reponse.status(), sonde.nom).toBe(400);
      // Refus de `createQueueHandler` avant tout appel du gestionnaire : en-têtes invalides, ou corps absent (GET).
      expect(["Missing required headers", "Missing request body"], sonde.nom).toContain((await reponse.json()).error);
    }
  });

  test("x-vqs-* forgé : exécution inconnue refusée par le gestionnaire du monde local, aucune étape", async ({ request, baseURL }) => {
    const sonde = SONDES.find((s) => s.nom === "POST x-vqs-* forgé")!;
    const reponse = await sonde.envoyer(request, baseURL!, {});
    expect(reponse.status()).toBe(500);
    expect(await reponse.text()).toContain("WorkflowRunNotFoundError");
    // File d'un autre préfixe : refus avant le gestionnaire.
    const autre = await request.post(`${baseURL}${FLUX}`, { headers: { ...ENTETES_VQS, "x-vqs-queue-name": "__wkf_workflow_" }, data: { runId: RUN_FORGE } });
    expect(autre.status()).toBe(400);
  });

  test("webhook sans jeton créé et page des exécutions : 404", async ({ request, baseURL }) => {
    expect((await request.post(`${baseURL}/.well-known/workflow/v1/webhook/forge`, { data: {} })).status()).toBe(404);
    expect((await request.get(`${baseURL}/prototype/executions`)).status()).toBe(404);
  });

  test("action de lancement appelée directement : « fermee », rien de réservé", async ({ request, baseURL }) => {
    const reponse = await request.post(`${baseURL}/prototype/executions`, {
      headers: { "Next-Action": identifiantAction("lancerExecutionP0Action"), Accept: "text/x-component" },
      multipart: { "0": '[{"statut":"attente"},"$K1"]', "1_brief": "edimbourg-1.json", "1_variante": "B", "1_mode": "essai" },
    });
    expect(reponse.status()).toBe(200);
    const corps = await reponse.text();
    expect(corps).toContain('{"statut":"fermee"}');
    expect(corps).not.toMatch(/lancee|demarrage_impossible|usage_unavailable/);
  });
});

/**
 * Origine de la préversion, contrôlée **avant** tout envoi du jeton de contournement (mineur 19 de la revue du head
 * `193603d`) : `https:` et un hôte de préversion **du projet** seulement (`vadrouille-…-sams-projects-47a8db3e.vercel.app`,
 * forme des adresses de préversion relevées dans `docs/releases/` ; mineur 5 du head `b85e797`), sans identifiants ni
 * port ; sinon, erreur sans requête.
 */
const HOTE_PREVERSION = /^vadrouille-[a-z0-9]+(?:-[a-z0-9]+)*-sams-projects-47a8db3e\.vercel\.app$/;
function originePreversion(adresse: string): string {
  let url: URL;
  try {
    url = new URL(adresse);
  } catch {
    throw new Error("E2E_P0_REEL_URL : adresse invalide");
  }
  if (url.protocol !== "https:" || !HOTE_PREVERSION.test(url.hostname) || url.username || url.password || url.port) {
    throw new Error("E2E_P0_REEL_URL : https et préversion du projet seulement");
  }
  return url.origin;
}

test("p0-flux: adresse de préversion contrôlée avant l'envoi du jeton (aucune requête)", () => {
  for (const hote of ["vadrouille-git-p0-reel-sams-projects-47a8db3e.vercel.app", "vadrouille-mh95ppiqd-sams-projects-47a8db3e.vercel.app"]) {
    expect(originePreversion(`https://${hote}/prototype`)).toBe(`https://${hote}`);
  }
  for (const adresse of [
    "https://vadrouille-git-p0-reel-autre-equipe.vercel.app",
    "https://tiers-sams-projects-47a8db3e.vercel.app",
    "https://vadrouille-x-sams-projects-47a8db3e.vercel.app.example.com",
    "http://vadrouille-x-sams-projects-47a8db3e.vercel.app",
    "https://vadrouille.vercel.app.example.com",
    "https://example.com",
    "https://jeton@vadrouille-x-sams-projects-47a8db3e.vercel.app",
    "https://vadrouille-x-sams-projects-47a8db3e.vercel.app:8443",
    "pas une adresse",
  ]) {
    expect(() => originePreversion(adresse), adresse).toThrow(/E2E_P0_REEL_URL/);
  }
});

const PREVERSION = process.env.E2E_P0_REEL_URL;
const CONTOURNEMENT = process.env.E2E_P0_REEL_BYPASS;

test.describe("p0-flux: préversion de p0-reel (relevé de 0063 point 8)", () => {
  test.skip(!PREVERSION || !CONTOURNEMENT, "E2E_P0_REEL_URL et E2E_P0_REEL_BYPASS absentes : relevé humain sur la préversion");

  test("requêtes directes à la route de flux, avec et sans en-têtes de file : refusées par la plateforme", async ({ request }) => {
    const base = originePreversion(PREVERSION!);
    for (const sonde of SONDES) {
      const reponse = await sonde.envoyer(request, base, { "x-vercel-protection-bypass": CONTOURNEMENT! });
      expect([401, 403], `${sonde.nom} : ${reponse.status()}`).toContain(reponse.status());
    }
  });
});
