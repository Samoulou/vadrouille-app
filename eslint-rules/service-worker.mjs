/**
 * Règles ESLint locales du hors-ligne (spécification F10, F10b ; F10-TL-5) :
 * - `no-service-worker-register` : `navigator.serviceWorker.register(…)` (sous toutes ses formes : `navigator`,
 *   `window.navigator`, `self.navigator`…) refusé hors du module hors ligne désigné (`src/lib/offline/register.ts`) ;
 * - `no-cache-storage-open` : `caches.open(…)` (ou `window.caches.open(…)`…) refusé hors de `public/sw.js`.
 */

/** Nom de la propriété (ou de l'identifiant) d'une expression : `a.b` → « b », `b` → « b ». */
function nameOf(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") return node.property.name;
  if (node.type === "MemberExpression" && node.computed && node.property.type === "Literal") return String(node.property.value);
  return null;
}

/** Appel `<objet>.<méthode>(…)` dont l'objet se nomme `objectName`. */
function callRule(objectName, method, description, messageId, message) {
  return {
    meta: { type: "problem", docs: { description }, schema: [], messages: { [messageId]: message } },
    create(context) {
      return {
        CallExpression(node) {
          const callee = node.callee.type === "ChainExpression" ? node.callee.expression : node.callee;
          if (callee.type !== "MemberExpression" || nameOf(callee) !== method) return;
          if (nameOf(callee.object) === objectName) context.report({ node, messageId });
        },
      };
    },
  };
}

/** @type {import("eslint").Rule.RuleModule} */
export const noServiceWorkerRegister = callRule(
  "serviceWorker",
  "register",
  "Seul le module hors ligne désigné enregistre le service worker (F10-TL-5).",
  "register",
  "Seul src/lib/offline/register.ts enregistre le service worker (spécification F10, F10-TL-5).",
);

/** @type {import("eslint").Rule.RuleModule} */
export const noCacheStorageOpen = callRule(
  "caches",
  "open",
  "Seul le service worker ouvre un cache (F10-TL-5).",
  "open",
  "Seul public/sw.js ouvre un cache : aucune autre écriture dans Cache Storage (spécification F10, F10-TL-5).",
);
