# 0034 — Clés OpenRouter et Google sur Production, et identifiant propriétaire Neon sur les préversions, jusqu'à la mise en public

Statut : accepté · Date : 2026-10-12 · Décideur : Samuel (fil « Correction spec P0 » du projet Claude « Vadrouille », 2026-10-12 13:49 CEST) · Consigné par le CEO (40e cycle) · Ticket #181

Numérotation : 0029 est réservée par #164, 0031 par #172, 0033 par #177. 0034 est le prochain numéro libre.

## Contexte
Le 2026-10-12, en vérifiant l'environnement Vercel du projet, le studio a constaté deux écarts :
- L'intégration Neon–Vercel, ajoutée par Samuel le 2026-10-12 à 11:34 CEST, pose l'identifiant propriétaire de la base sur les préversions. Cet identifiant peut tout lire et tout effacer. C'est la question P0-Q19 de la spec #172.
- Les clés `OPENROUTER_API_KEY` et `GOOGLE_MAPS_SERVER_KEY` sont aussi posées sur l'environnement Production. Or la décision 0028 § 1 (Q250) dit : « clés OpenRouter et Google seulement en Preview et Development, pas en Production ».

La revue consolidée de #172 (head `a7a042b`, bloquant 6) demande une décision écrite. Celle-ci cite Samuel **mot pour mot**.

## Décisions (Samuel), citées mot pour mot

### 1. Identifiant propriétaire Neon (P0-Q19), 2026-10-12, 13:49:15 CEST
Le studio proposait de limiter l'intégration Neon à Development jusqu'à P0r2. Samuel a répondu :

> ok je comprends pas tout, pour l'instant on laisse en prod, car notre prod n'est pas sensible, c'est une chose à consolidé avant une release public, mais en gros tant qu'on est pas en pbulic on est ok, on fera la sécu quan dla release sera en pbulic

### 2. Clés OpenRouter et Google sur Production, 2026-10-12, 13:49:46 CEST
Le studio demandait s'il fallait supprimer la ligne Production de ces deux clés, conformément à Q250. Samuel a répondu :

> pareil pour ça on garde partout eton adaptera avant la mise en public

## Ce que cela change
- **Q250 et 0028 § 1** sont amendées : jusqu'à la mise en public, les deux clés restent sur Preview, Development **et Production**.
- **P0-Q19** est close : l'identifiant propriétaire Neon reste sur les préversions jusqu'à la mise en public. État vérifié par le CEO le 2026-10-12 à 13:20 CEST : les variables de l'intégration Neon visent Development et Preview, jamais Production (`POSTGRES_USER` vise Development seulement). Le choix de Samuel les laisse en l'état ; il ne les étend pas à Production.
- C'est un **risque accepté**, valable jusqu'à la **passe de sécurité avant la mise en public**. La liste de contrôle de cette passe comprend au minimum :
  1. le retrait de l'identifiant propriétaire Neon de Preview, remplacé par les rôles à moindre privilège (0007, créés par B1) ;
  2. la limitation des clés OpenRouter et Google aux environnements prévus ;
  3. la vérification de la protection des préversions.

## Ce qui ne change pas
- `CLAUDE.md`, « Jamais » : aucun agent n'utilise une clé de production ni ne promeut quoi que ce soit en production. Les clés citées ici sont celles du prototype (0026), posées par Samuel. Elles ne deviennent pas des clés de production.
- Aucun déploiement de production n'est fait par le studio.
- Le code ne doit jamais appeler un client réel quand `VERCEL_ENV=production`. Cette garde et son test sont exigés par la spec #172 (bloquant 7).
- Aucune exécution réelle n'a lieu avant P0r3, exigences d'entrée vérifiées (0031).

## Quand revoir cette décision
Avant toute mise en public, ou plus tôt si Samuel le demande.
