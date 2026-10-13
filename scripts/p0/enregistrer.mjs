// Point d'accroche de résolution de `pnpm p0` (décision 0032, A3.4). Fichier figé par empreinte
// (`tests/unit/p0/enregistrer.test.ts`) : le modifier demande une nouvelle revue Sécurité.
// Il traduit les alias `@/…` vers `src/…` et complète les imports relatifs sans extension du code de `src/`
// et de `scripts/p0/` (`.ts`, puis `/index.ts`). Aucun accès au réseau, au système de fichiers ni à l'environnement.
import { registerHooks } from "node:module";

const SRC = new URL("../../src/", import.meta.url).href;
const P0 = new URL("./", import.meta.url).href;

function underRoots(url) {
  return url.startsWith(SRC) || url.startsWith(P0);
}

function resolve(specifier, context, nextResolve) {
  let base;
  if (specifier.startsWith("@/")) {
    base = new URL(specifier.slice(2), SRC).href;
  } else if (
    (specifier.startsWith("./") || specifier.startsWith("../")) &&
    typeof context.parentURL === "string" &&
    underRoots(context.parentURL)
  ) {
    base = new URL(specifier, context.parentURL).href;
  } else {
    return nextResolve(specifier, context);
  }
  if (!underRoots(base)) {
    throw new Error("p0: import hors de src/ et de scripts/p0/ refusé");
  }
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
    let resolved;
    try {
      resolved = nextResolve(candidate, context);
    } catch {
      continue;
    }
    if (!underRoots(resolved.url)) {
      throw new Error("p0: import hors de src/ et de scripts/p0/ refusé");
    }
    return resolved;
  }
  throw new Error("p0: module introuvable");
}

registerHooks({ resolve });
