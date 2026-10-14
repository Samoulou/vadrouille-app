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
 * `servername` reste couvert par les tests du transport).
 */

const NOM = "vadrouille-contrat.test";

describe("p0: contrat d'undici, Agent réel et lookupEpingle contre un serveur local", () => {
  it("l'Agent se connecte à l'adresse épinglée pour le nom de l'origine, sans autre résolution", async () => {
    const hotes: (string | undefined)[] = [];
    await avecServeurLocal(
      (requete, reponse) => {
        hotes.push(requete.headers.host);
        reponse.writeHead(200, { "content-type": "text/plain" });
        reponse.end("ok");
      },
      async (serveur) => {
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
    expect(hotes).toEqual([`${NOM}:${String(hotes[0]?.split(":")[1])}`]);
  });

  it("nom d'hôte différent de celui épinglé : la requête échoue, le serveur ne reçoit rien", async () => {
    let recues = 0;
    await avecServeurLocal(
      (_requete, reponse) => {
        recues += 1;
        reponse.end();
      },
      async (serveur) => {
        const agent = new Agent({ connect: { lookup: lookupEpingle("autre-nom.test", serveur.hote) } });
        try {
          await expect(agent.request({ origin: `http://${NOM}:${serveur.port}`, path: "/", method: "GET" })).rejects.toThrow();
        } finally {
          await agent.destroy();
        }
      },
    );
    expect(recues).toBe(0);
  });
});
