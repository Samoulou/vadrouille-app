// @vitest-environment node
import { Agent } from "undici";
import { describe, expect, it } from "vitest";

import { lookupEpingle } from "@/research/undici-transport";

import { avecServeurLocal } from "../../support/serveur-local";

/**
 * Test de contrat d'`undici` (décision 0055, section 3 point 6 ; condition E4 de 0049, avant la fusion de la PR qui
 * livre la composition) : l'`Agent` **réel** de la version épinglée, avec `connect.lookup` = `lookupEpingle`, contre le
 * serveur local de test (`127.0.0.1`, port choisi par le système). Il vérifie ce que les tests de P0r1 supposent sur un
 * double : `undici` appelle bien `connect.lookup` avec le nom d'hôte de l'origine, se connecte à la **seule** adresse
 * rendue (aucune seconde résolution : le nom `.test` ne se résout pas), et échoue sans connexion si le nom diffère.
 *
 * Le transport de production n'emploie que `https:` (port 443) ; le serveur local de test n'écoute qu'en `http:` sur
 * `127.0.0.1` (régime des tests, section 4) : le contrat porte sur la résolution et la connexion, pas sur TLS (le
 * `servername` reste couvert par les tests du transport). **Limite** (mineur 5 de la PR 326, à garder dans la note de
 * version) : ce contrat ne couvre que `http:` ; la vérification TLS (`servername`) n'est couverte que par des doubles.
 */

type Rappel = Parameters<ReturnType<typeof lookupEpingle>>[2];

/** `lookupEpingle` instrumenté : chaque appel est noté (nom demandé, erreur rendue), sans changer le résultat. */
function lookupObserve(nomHote: string, adresse: string, appels: { hostname: string; erreur: string | null }[]) {
  const lookup = lookupEpingle(nomHote, adresse);
  return (hostname: string, options: { all?: boolean }, rappel: Rappel) =>
    lookup(hostname, options, ((erreur: Error | null, ...reste: unknown[]) => {
      appels.push({ hostname, erreur: erreur === null ? null : erreur.message });
      (rappel as (...args: unknown[]) => void)(erreur, ...reste);
    }) as Rappel);
}

const NOM = "vadrouille-contrat.test";

describe("p0: contrat d'undici, Agent réel et lookupEpingle contre un serveur local", () => {
  it("l'Agent se connecte à l'adresse épinglée pour le nom de l'origine, sans autre résolution", async () => {
    const hotes: (string | undefined)[] = [];
    let port = 0;
    await avecServeurLocal(
      (requete, reponse) => {
        hotes.push(requete.headers.host);
        reponse.writeHead(200, { "content-type": "text/plain" });
        reponse.end("ok");
      },
      async (serveur) => {
        port = serveur.port;
        const agent = new Agent({ connect: { lookup: lookupEpingle(NOM, serveur.hote) } });
        try {
          const reponse = await agent.request({ origin: `http://${NOM}:${serveur.port}`, path: "/", method: "GET" });
          expect(reponse.statusCode).toBe(200);
          expect(await reponse.body.text()).toBe("ok");
        } finally {
          await agent.destroy();
        }
      },
    );
    expect(port).toBeGreaterThan(0);
    expect(hotes).toEqual([`${NOM}:${String(port)}`]);
  });

  it("nom d'hôte différent de celui épinglé : la requête échoue, le serveur ne reçoit rien", async () => {
    let recues = 0;
    const appels: { hostname: string; erreur: string | null }[] = [];
    await avecServeurLocal(
      (_requete, reponse) => {
        recues += 1;
        reponse.end();
      },
      async (serveur) => {
        const agent = new Agent({ connect: { lookup: lookupObserve("autre-nom.test", serveur.hote, appels) } });
        try {
          await expect(agent.request({ origin: `http://${NOM}:${serveur.port}`, path: "/", method: "GET" })).rejects.toThrow("pinned_host_mismatch");
        } finally {
          await agent.destroy();
        }
      },
    );
    expect(recues).toBe(0);
    // L'échec vient du `lookup` épinglé : appelé avec le nom de l'origine, il a rendu `pinned_host_mismatch`.
    expect(appels.length).toBeGreaterThan(0);
    expect(appels.every((a) => a.hostname === NOM && a.erreur === "pinned_host_mismatch")).toBe(true);
  });
});
