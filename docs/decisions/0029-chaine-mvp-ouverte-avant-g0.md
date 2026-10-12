# 0029 — Chaîne MVP complète ouverte avant G0 (B1 à B12)

Statut : accepté · Date : 2026-10-12 · Décideur : Samuel (fil « Parcours cible du MVP » du projet Claude « Vadrouille », 2026-10-12, 11:09 à 11:12 CEST) · Consigné par le CEO (cycle lancé à 11:07 CEST, décision reçue en cours de cycle) · Ticket #164

## Contexte
Jusqu'ici, « Phase en cours » de `docs/CONTEXT.md` limitait la phase 0 au front sur données simulées (F1 à F12), au handover back-end (B0) et au prototype de recherche (P0). Les tâches B1 à B12 du handover back-end (`docs/handovers/backend.md`, « Backlog ») portent la mention « après G0 ».

## Décision (Samuel), citée mot pour mot
Source : fil « Parcours cible du MVP » du projet Claude « Vadrouille », trois messages de Samuel (horodatages UTC 09:09:16, 09:11:01 et 09:12:05) :

> j'aimerais qu'on priorise la phase 1 en p0, c'est une partie importante de l'app, je veux la chaine complete pour mvp
>
> toute la chaine MVP est ouverte y compris la révisions, ... je comprends pas
>
> on construit tout, c'est un gros chantier pour le MVP mais il est essentiel pour avoir le temps d'ittérer

Le deuxième message répond à une question du fil qui proposait d'ouvrir la chaîne en partie seulement ; « je comprends pas » porte sur cette question, pas sur la décision.

Lecture retenue par le CEO : **G0 reste la condition de passage de la phase 0 ; la construction de la phase 1 est autorisée en parallèle.** La mention « après G0 » ne bloque plus la construction. Le studio peut engager toute la chaîne du MVP : formulaire, compte, génération réelle, présentation (swipe), paiement simulé, révision du programme, pendant et après le voyage, soit **B1 à B12** du handover back-end.

## Précédence
Cette décision prime sur toute mention « après G0 » attachée à la construction de B1 à B12, notamment :
- `docs/handovers/backend.md` : l. 10 (« Toutes les tâches qu'il décrit commencent après G0 »), l. 692, et la mention « — après G0 » des lignes B1 à B12 du backlog (l. 675 à 686), numéros de ligne du handover tel que fusionné par #27 ;
- `specs/B0-handover-backend.md` : l. 155 et l. 160 (« le CEO ne dépasse pas la ligne 6 en phase 0 »).

Ces fichiers ne sont pas modifiés ici : #27 a modifié le handover sans aligner ces mentions ; la prochaine PR qui touche chacun d'eux l'aligne.

## Ce qui ne change pas
- **G0 reste la condition commerciale** de passage de la phase 0 (`docs/roadmap.md`).
- **Restent à Samuel** (« Qui décide quoi ») : mise en production, clés de production, comptes et services payants, envoi réel d'e-mails (Q25), paiement réel (Q26), ouverture du paiement simulé sur Internet (Q131), clé serveur Places/Routes (Q3), fournisseur de modèles au-delà de la phase 0 (Q46). Toute donnée personnelle envoyée hors UE remonte à Samuel.
- Les prérequis de chaque tâche B restent ceux du handover, sans la mention « G0 ».
- Les règles Google de `CLAUDE.md` s'appliquent à B7, B8 et B9. **B7 à B9 s'appuient sur la spec P0 (#149, décisions 0026 à 0028 et 0030, règle provisoire de Q5) et sur B0 (#27, décision 0011), toutes deux fusionnées le 2026-10-12.**

## Conséquences
- `docs/CONTEXT.md`, « Phase en cours », et `docs/roadmap.md` sont mis à jour dans la même PR.
- **B1 démarre en local** (Docker Compose, conteneur Postgres en CI, aucun compte externe). La base de staging utilise le projet Neon (Francfort, Postgres 17) que Samuel a créé via Vercel, comme annoncé dans sa réponse à Q24 (#studio, 2026-10-12 10:35 CEST : « Neon à Francfort. Je crée le compte au démarrage de B1, via Vercel. »). Création constatée par le CEO dans les variables du projet Vercel : intégration Neon ajoutée par Samuel le 2026-10-12 à 11:34 CEST, pour Development et Preview seulement. Q24 est reportée dans `QUESTIONS.md` par la PR « chore: status » #168. Vercel y a injecté des identifiants d'administration : B1 crée les rôles à moindre privilège de la décision 0007 et l'application ne lit jamais ces identifiants.
- Ordre retenu par le CEO (délégation « ordre des tâches ») : par choix d'ordonnancement, P0 d'abord (P0a1 et P0b1, le code sans clé de la spec P0, fusionnée dans #149), car B7 et B8 en dépendent ; en parallèle, **B1 et B2**, qui ne demandent aucun compte externe ; **B5 après B2** (son prérequis) ; ensuite l'ordre des prérequis du handover. Chaque tâche B reçoit un ticket et, si la ligne du handover ne suffit pas comme spécification, une spécification du Product Owner d'abord.

## Quand revoir cette décision
À la demande de Samuel, ou si une tâche B exige un engagement réservé (compte payant, clé de production, mise en production).
