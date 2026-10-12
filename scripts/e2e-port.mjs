// Port du serveur Playwright (décision 0017 § 14, Q107) : un port par worktree, sans réutilisation de serveur.
// Fonctions pures, testées dans tests/unit/e2e-port.test.ts ; playwright.config.ts les appelle.

/** Port fixe en CI (une seule exécution par machine, rien à isoler). */
export const CI_PORT = 3100;
/** Bornes incluses des ports locaux dérivés du chemin du dépôt. */
export const LOCAL_PORT_MIN = 3100;
export const LOCAL_PORT_MAX = 3899;

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** Hachage FNV-1a 32 bits d'une chaîne (octets UTF-8), entier non signé. */
export function fnv1a(text) {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return hash >>> 0;
}

/** Port local stable pour un chemin absolu de dépôt, entre LOCAL_PORT_MIN et LOCAL_PORT_MAX inclus. */
export function worktreePort(repoPath) {
  const span = LOCAL_PORT_MAX - LOCAL_PORT_MIN + 1;
  return LOCAL_PORT_MIN + (fnv1a(repoPath) % span);
}

/**
 * Port du serveur de test : `E2E_PORT` s'il est fourni, sinon 3100 en CI, sinon le port du worktree.
 * Une valeur `E2E_PORT` qui n'est pas un port valide fait échouer la configuration avec un message clair.
 */
export function e2ePort({ env, repoPath }) {
  const explicit = env.E2E_PORT?.trim();
  if (explicit) {
    const port = /^\d+$/.test(explicit) ? Number(explicit) : Number.NaN;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`E2E_PORT invalide : « ${env.E2E_PORT} » (entier attendu entre 1 et 65535).`);
    }
    return port;
  }
  if (env.CI) return CI_PORT;
  return worktreePort(repoPath);
}
