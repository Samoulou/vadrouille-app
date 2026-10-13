Règles ESLint locales, dont ligne/no-hardcoded-colors.

- `service-worker.mjs` (F10b, F10-TL-5) : `ligne/no-service-worker-register` (seul `src/lib/offline/register.ts` enregistre le service worker) et `ligne/no-cache-storage-open` (seul `public/sw.js` ouvre un cache).
