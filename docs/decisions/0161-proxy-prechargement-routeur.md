# 0161 — Le proxy de `/p/` reçoit les en-têtes « flight » : `skipProxyUrlNormalize: true`

Statut : **proposée, définitive à la fusion (décision 0093)**. Elle devient une décision à la fusion de la PR du ticket 1029 (PR 1032), approuvée par le Tech Lead.

Date : 2026-11-01 · Décideur : Tech Lead (revue de la PR 1032) · Rédaction : agent `backend` · Ticket : 1029 · `main` relu : `6b516bc`

Numérotation : `main` va jusqu'à 0159 ; la PR 1035 (ouverte) ajoute 0160 ; aucune PR ouverte n'ajoute 0161.

## Contexte

La décision 0157, § 2.1 point 3, veut qu'un préchargement du routeur (`Next-Router-Prefetch: 1`) de la vue partagée (`/p/…`) reçoive 204 sans corps, sans compter de vue ni rien lire. `src/proxy.ts` applique cette règle.

Next.js 16.4.1 retire les en-têtes « flight » de la requête que reçoit le proxy, puis les rend à la page (`next/dist/server/web/adapter.js`, `FLIGHT_HEADERS`). Ce sont `rsc`, `next-router-prefetch`, `next-router-state-tree`, `next-router-segment-prefetch` et `next-hmr-refresh`.

Le proxy ne voyait donc jamais le préchargement, et il le comptait comme une vue. La page répondait 200, et `tests/e2e/partage-api.api.spec.ts` échouait en CI sur `main` après la fusion de M6a. Le retrait n'est pas fait quand `__NEXT_NO_MIDDLEWARE_URL_NORMALIZE` est vrai : c'est la valeur que l'option `skipProxyUrlNormalize` pose au build (`build/define-env.js`).

Déplacer la règle dans la page a été écarté : la page reçoit les en-têtes « flight », mais seulement après que le proxy a compté la vue.

## Décision

1. `next.config.ts` pose `skipProxyUrlNormalize: true`. Le proxy, le seul de l'application (matcher `/p/:path*`), reçoit la requête telle qu'envoyée : en-têtes « flight » compris, et adresse non normalisée (`_rsc` gardé dans la requête). Il ne lit que `pathname` et les en-têtes.
2. Le réglage est gardé par `tests/unit/server/partage/proxy.test.ts`. Le comportement réel est éprouvé par le projet Playwright `api` (« préchargement du routeur : 204 sans corps, sans lecture »).
3. **Condition de maintien (Tech Lead, revue de la PR 1032)** : « réévaluer le réglage si `i18n`, `basePath`, `trailingSlash`, `rewrites` ou `redirects` apparaissent ».

## Conséquences

- La règle « un préchargement ne compte pas une vue » s'applique au préchargement du routeur. Une vue ordinaire, ou une navigation RSC sans préchargement, est comptée comme avant.
- Aucun autre effet tant que la condition du point 3 tient : dans Next.js 16.4.1, tous les usages de l'option concernent l'entrée du proxy.
- Un passage à une nouvelle version majeure de Next.js relit `adapter.js` et ce réglage.
