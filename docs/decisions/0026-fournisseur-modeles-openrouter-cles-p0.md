# 0026 — Fournisseur de modèles via OpenRouter et clés du prototype P0

Statut : accepté · Date : 2026-10-12 · Décideur : Samuel (#studio, 2026-10-12 07:12 et 08:47 CEST) · Consigné par le CEO (37e cycle)

Numérotation : 0025 est la dernière décision de `main` ; 0011 reste réservé par #27. 0026 est le prochain numéro libre.

## Contexte
La spécification P0 (#149, ticket #147) demandait une clé API Anthropic dédiée au prototype et une clé serveur Google Places/Routes (Q234, Q103). Samuel a répondu dans #studio le 2026-10-12 à 07:12 CEST :

> Clés : pas d'Anthropic direct pour l'instant. L'IA passe par OpenRouter (OPENROUTER_API_KEY, avec plafond de crédit, fournisseurs qui entraînent sur les données exclus), via l'AI SDK, pour pouvoir changer de modèle par configuration. Je crée aussi la clé serveur Google (Q103, GOOGLE_MAPS_SERVER_KEY, limitée à Places et Routes). Je te dis dans #studio quand elles sont posées dans l'environnement vadrouille et dans Vercel.

## Décision (Samuel)
1. **Pas de compte Anthropic direct pour l'instant.** Les appels de modèles passent par **OpenRouter**, avec la variable `OPENROUTER_API_KEY`.
2. La clé OpenRouter a un **plafond de crédit** (montant fixé par Samuel).
3. Les **fournisseurs qui entraînent leurs modèles sur les données sont exclus** du routage OpenRouter.
4. Le code appelle les modèles **via l'AI SDK**, pour **changer de modèle par configuration**. Cela remplace Q9 (« Claude seul ») : le modèle est un réglage. Le choix exact de la bibliothèque et de la forme de la configuration revient au Tech Lead.
5. **Clé serveur Google** : `GOOGLE_MAPS_SERVER_KEY`, limitée à Places API et Routes API. Elle répond à la demande de clé de Q103 ; le budget mensuel reste à préciser.
6. Les deux clés sont posées par Samuel dans l'environnement « vadrouille » des routines et dans Vercel. **Samuel annonce dans #studio quand elles sont en place.** Jusque-là, P0 avance sans clé (P0a1, P0b1).
7. **Mise à jour du 2026-10-12, 08:47 CEST (#studio)** : les clés sont en place, hors du dépôt, et aussi côté serveur dans Vercel. La clé du fournisseur de modèles n'est pas exposée aux sessions des agents. La clé Google, limitée à Places et Routes avec un quota plafonné, ne doit jamais être écrite dans un fichier, un journal ou une PR. Samuel autorise le lancement de P0 ; le code démarre après la fusion de la spec (#149).

## Conséquences
- La spec P0 (#149) remplace la clé Anthropic par `OPENROUTER_API_KEY` et l'AI SDK (correction 1, 37e cycle).
- Les questions concernées sont mises à jour : Q9 (remplacée), Q103 (clé en cours de création), Q234 (choix des clés tranché ; montants et mise à disposition attendus), Q46 (exclusion des fournisseurs qui entraînent : couverte en partie ; clauses de sous-traitance toujours ouvertes).
- OpenRouter est un intermédiaire hors UE : les prompts du prototype y transitent. Les règles restent les mêmes : aucune donnée Google dans un prompt, aucune donnée personnelle dans P0. Le juridique (Q5, Q46) reste à Samuel.
- Les clés ne sont jamais committées et jamais utilisées en production (CLAUDE.md).

## Quand revoir cette décision
Quand Samuel ouvre un compte direct chez un fournisseur de modèles, ou avant le branchement d'un fournisseur réel côté produit (B7).
