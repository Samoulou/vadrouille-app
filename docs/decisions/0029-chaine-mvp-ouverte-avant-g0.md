# 0029 — Chaîne MVP complète ouverte avant G0 (B1 à B12)

Statut : accepté · Date : 2026-10-12 · Décideur : Samuel (fil « Parcours cible du MVP » du projet Claude « Vadrouille », 2026-10-12, 11:09 à 11:12 CEST) · Consigné par le CEO (cycle de 11:07 CEST) · Ticket #164

Numérotation : 0011 reste réservé par #27 ; 0026, 0027 et 0028 sont dans #149. 0029 est le prochain numéro libre.

## Contexte
Jusqu'ici, « Phase en cours » de `docs/CONTEXT.md` limitait la phase 0 au front sur données simulées (F1 à F12), au handover back-end (B0) et au prototype de recherche (P0). Les tâches B1 à B12 du handover back-end (`docs/handovers/backend.md`, « Backlog ») portent la mention « après G0 ».

## Décision (Samuel), citée mot pour mot
Source : fil « Parcours cible du MVP » du projet Claude « Vadrouille », trois messages de Samuel (horodatages UTC 09:09:16, 09:11:01 et 09:12:05) :

> j'aimerais qu'on priorise la phase 1 en p0, c'est une partie importante de l'app, je veux la chaine complete pour mvp
>
> toute la chaine MVP est ouverte y compris la révisions, ... je comprends pas
>
> on construit tout, c'est un gros chantier pour le MVP mais il est essentiel pour avoir le temps d'ittérer

Lecture retenue par le CEO : la mention « après G0 » ne bloque plus la construction. Le studio peut engager toute la chaîne du MVP : formulaire, compte, génération réelle, présentation (swipe), paiement simulé, révision du programme, pendant et après le voyage, soit **B1 à B12** du handover back-end.

## Ce qui ne change pas
- **G0 reste la condition commerciale** de passage de la phase 0 (`docs/roadmap.md`) : prospects, échanges, achats ou préventes, prototype jugé exploitable, présentation comprise.
- **Restent à Samuel** (« Qui décide quoi ») : mise en production, clés de production, comptes et services payants, paiement réel et envoi réel d'e-mails (Q24, Q25, Q26). Q24 : Samuel a choisi Neon à Francfort et crée le compte au démarrage de B1, via Vercel (#studio, 2026-10-12 10:35 CEST).
- Les règles Google de `CLAUDE.md` et la règle provisoire de Q5 (décision 0027, dans #149) s'appliquent à B7, B8 et B9 comme ailleurs.
- Les prérequis de chaque tâche B restent ceux du handover, sans la mention « G0 ».

## Conséquences
- `docs/CONTEXT.md`, « Phase en cours », et `docs/roadmap.md` sont mis à jour dans la même PR.
- La mention « après G0 » des tâches B1 à B12 de `docs/handovers/backend.md` est caduque. Le texte du handover n'est pas modifié ici, car #27 le modifie : la prochaine PR qui touche le handover l'aligne.
- Ordre retenu par le CEO (délégation « ordre des tâches ») : P0 d'abord (P0a1 et P0b1 dès la fusion de #149 ; B7 et B8 en dépendent), puis **B1, B2 et B5 en parallèle**, qui ne demandent aucun compte externe ; ensuite l'ordre des prérequis du handover. Chaque tâche B reçoit un ticket et, si la ligne du handover ne suffit pas comme spécification, une spécification du Product Owner d'abord.

## Quand revoir cette décision
À la demande de Samuel, ou si une tâche B exige un engagement réservé (compte payant, clé de production, mise en production).
