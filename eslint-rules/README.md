Règles ESLint locales, dont ligne/no-hardcoded-colors.

- `service-worker.mjs` (F10b, F10-TL-5) : `ligne/no-service-worker-register` (seul `src/lib/offline/register.ts` enregistre le service worker) et `ligne/no-cache-storage-open` (seul `public/sw.js` ouvre un cache).
- `require-server-only.mjs` (B1, décision 0006) : `ligne/require-server-only` (`import "server-only";` obligatoire dans `db/` et les dossiers serveur, sauf la liste fermée des 20 modules de phase 0).
- `no-p0-server-modules.mjs` (B1, amendement de la décision 0006 du 2026-10-13) : `ligne/no-p0-server-modules` (ni `src/ai`, ni `src/research`, ni `src/grounding` hors des dossiers serveur, sous toutes les formes de chargement : import statique ou de type, réexport, `import()`, `require()`).
