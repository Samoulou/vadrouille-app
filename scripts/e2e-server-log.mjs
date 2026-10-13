// Sortie capturée du serveur de test Playwright (spécification F8, critère « Aucune persistance locale ») :
// `serve-standalone.mjs` recopie la sortie standard et la sortie d'erreur du serveur dans ce fichier, que les
// tests relisent en fin de test. Fonction pure, testée dans tests/unit/e2e-server-log.test.ts.
import { join } from "node:path";

/** Variable d'environnement qui donne au serveur le chemin du fichier de sortie (posée par playwright.config.ts). */
export const SERVER_LOG_ENV = "E2E_SERVER_LOG";

/**
 * Fichier de sortie du serveur de test pour un port : un par worktree, comme le port (décision 0017 § 14), dans le
 * dossier temporaire du système (hors du dépôt, jamais versionné). Le serveur le vide à chaque démarrage.
 */
export function serverLogPath({ port, tmpDir }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Port invalide pour la sortie du serveur de test : « ${port} ».`);
  }
  return join(tmpDir, `vadrouille-e2e-serveur-${port}.log`);
}
