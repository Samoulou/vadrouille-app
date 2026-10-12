import { describe, expect, it } from "vitest";

import { SERVER_LOG_ENV, serverLogPath } from "../../scripts/e2e-server-log.mjs";

// Spécification F8, critère « Aucune persistance locale » : sortie du serveur de test capturée et relue.
describe("serverLogPath", () => {
  it("donne un fichier par port, dans le dossier temporaire", () => {
    expect(serverLogPath({ port: 3100, tmpDir: "/tmp" })).toBe("/tmp/vadrouille-e2e-serveur-3100.log");
    expect(serverLogPath({ port: 3456, tmpDir: "/tmp" })).not.toBe(serverLogPath({ port: 3100, tmpDir: "/tmp" }));
  });

  it.each([0, 65536, 3100.5, Number.NaN])("refuse le port %s", (port) => {
    expect(() => serverLogPath({ port, tmpDir: "/tmp" })).toThrow(/Port invalide/);
  });

  it("nomme la variable d'environnement lue par le serveur", () => {
    expect(SERVER_LOG_ENV).toBe("E2E_SERVER_LOG");
  });
});
