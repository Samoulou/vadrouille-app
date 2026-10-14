# 0054 — Découpage de B7 (couche IA et recherche)

Statut : décision du CEO (ordre et découpage des tâches : « Qui décide quoi » de `docs/CONTEXT.md`) · Date : 2026-10-14 · Décideur : CEO · Liée à la spécification B7 (`specs/B7-couche-ia-recherche.md`, #288, fusionnée), à Q396 et à la décision 0055 (#294)

## Contexte

La spécification B7 propose trois sous-tâches (section « Découpage »). Sa question 1, tranchée par le CEO le 2026-10-14 (Q396), renvoie l'écriture du découpage à une décision à part : celle-ci. Le ticket de B7a attend sa fusion.

## Décision

1. **B7 se découpe en trois PR**, chacune avec son ticket et sa branche `claude/<id>-<slug>` :
   - **B7a — Constructeur de prompts typé et règles d'import** (rôle ia-recherche) ;
   - **B7b — Recherche réelle bornée et traces** (rôle ia-recherche) ;
   - **B7c — `usage_ledger`, plafonds et jeu d'évaluation** (rôle ia-recherche, avec le rôle data pour une migration éventuelle).
     Le contenu, les prérequis et les critères de chacune sont ceux du tableau « Découpage » et des sections « B7a », « B7b », « B7c » de la spécification ; cette décision n'y ajoute rien.
2. **Ordre** :
   - B7a commence **après la fusion de P0r3** (question 2 de la spécification), c'est-à-dire après P0r3a à P0r3d (0055, Q399) : P0r3 écrit le client réel de recherche web dans `src/ai` (Q396) et touche les mêmes fichiers (`scripts/p0`, `src/server/usage`, `src/ai`).
   - B7b et B7c avancent **en parallèle** après la fusion de B7a ; ils touchent des fichiers distincts (spécification, ligne sous le tableau « Découpage »).
   - Chaque sous-tâche attend aussi les décisions du Tech Lead qu'elle cite (B7-TL-1 à B7-TL-10).
3. **Suite** : B8 (ancrage) attend B7a et B7c ; B9 (workflows) attend les trois. La spécification B8 peut être écrite dès maintenant, sur les interfaces de la section « Ce que B7 expose à B8 et B9 ».
4. **Limite de corrections** : la règle du studio (au plus deux corrections par tâche, puis troisième tentative ou découpage avec le Tech Lead) s'applique à chaque sous-tâche séparément.

## Conséquences

- Le CEO ouvre le ticket de B7a quand P0r3 est fusionnée, ceux de B7b et B7c quand B7a l'est.
- Rien ne change pour P0r3 : le client réel de recherche web reste à sa charge (Q396).

## Quand revoir cette décision

Si P0r3 est découpée autrement ou retardée au point de bloquer B8, le CEO revoit l'ordre avec le Tech Lead.
