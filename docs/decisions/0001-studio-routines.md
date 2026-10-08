# 0001 — Le studio tourne sur les Routines Claude Code

Statut : accepté · Date : 2026-10-07 · Décideur : Samuel

## Contexte
Le développement est confié à des agents automatisés, avec un cycle de 4 heures et une release de staging toutes les 4 heures, dans un budget compatible avec la phase 0.

## Décision
- Quatre routines Claude Code (Cycle, Revue, Release, Hebdo) sur l'abonnement Claude, crédits d'usage désactivés.
- Rôles sous forme de sous-agents dans `.claude/agents/`.
- Passage au Project Claude Code « Studio » dès que la fonction est disponible sur le compte.
- CI GitHub sans IA et porte « techlead-approved » comme conditions de fusion.

## Conséquences
- Pas de serveur ni d'ordinateur allumé ; coût plafonné par l'abonnement.
- Actions visibles au nom de Samuel sur GitHub et Slack.
- Si l'abonnement ne suffit plus : spécialistes sur GitHub Actions avec une clé API, sans changer le reste.

## Évolution
- 2026-10-08 (Samuel) : la routine Cycle passe à un cycle toutes les 3 heures, jusqu'à 3 tâches par cycle, avec le libellé `in-progress` comme verrou sur les tickets. La release de staging reste toutes les 4 heures.
- 2026-10-08 (CEO, délégation « ordre des tâches » ; statut : décision déléguée, définitive sans veto de Samuel avant le 2026-10-10 ; voir Q23) : une tâche dont le ticket est référencé par une PR ouverte (« Closes # » ou « Refs # ») est en revue ; elle n'est pas prête et n'est pas reprise.
