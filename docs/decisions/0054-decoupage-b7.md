# 0054 — Découpage de B7 (couche IA et recherche)

**§ 2 amendé par 0096** (ticket #524) : le verdict de la Sécurité sur B7-TL-7 (traces) porte sur B7b, qui livre le port, et conditionne la fusion de B7b (B7c, fusionnée par #454, n'en dépend plus) ; question 9 de la spécification lue de même pour cette partie.

Statut : décision déléguée (ordre et découpage des tâches, « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-14 · Décideur : CEO · Spécification `specs/B7-couche-ia-recherche.md` (#288, fusionnée), questions 1 à 3 tranchées par le CEO (Q396) · Découpage de P0r3 : Q399 (la décision 0055, PR #294, est en cours de correction et n'est pas encore fusionnée)

## Contexte
La spécification B7 propose trois sous-tâches (section « Découpage »). Ses questions 1 à 3, tranchées par le CEO le 2026-10-14 (Q396), fixent le découpage, l'ordre par rapport à P0r3 et l'emplacement du client réel de recherche web ; la question 1 renvoie l'écriture du découpage à une décision à part : celle-ci. Le ticket de B7a attend sa fusion.

## Décision
1. **B7 se découpe en trois PR**, chacune avec son ticket et sa branche `claude/<id>-<slug>`. Ce découpage déroge à la règle « une tâche = une spécification = une branche = une PR » (`CLAUDE.md`) : une spécification, trois PR, comme pour B5 (décision 0041).
   - **B7a — Constructeur de prompts typé et règles d'import** (rôle ia-recherche) ;
   - **B7b — Recherche réelle bornée et traces** (rôle ia-recherche) ;
   - **B7c — `usage_ledger`, plafonds et jeu d'évaluation** (rôle ia-recherche).

   Le contenu, les prérequis, les relecteurs (colonne « Revue ») et les critères de chacune sont ceux du tableau « Découpage » et des sections « B7a », « B7b », « B7c » de la spécification ; cette décision n'y ajoute rien.
2. **Ordre** :
   - B7a commence **après la fusion de P0r3** (question 2 de la spécification), c'est-à-dire de P0r3a à P0r3d (Q399) : P0r3 écrit le client réel de recherche web dans `src/ai` (question 3) et touche les mêmes fichiers (`scripts/p0`, `src/server/usage`, `src/ai`).
   - B7-TL-4 (client réel de recherche web) est tranchée par le Tech Lead **avant P0r3**, qui écrit ce client (question 3 de la spécification).
   - B7b et B7c avancent **en parallèle** après la fusion de B7a ; ils touchent des fichiers distincts (spécification, ligne sous le tableau « Découpage »).
   - Chaque sous-tâche attend aussi ses propres prérequis, tels que le tableau de la spécification les répartit :

     | Sous-tâche | Prérequis propres (tableau « Découpage ») |
     |---|---|
     | B7a | P0r3 fusionnée ; cette décision ; B7-TL-1 à B7-TL-3 |
     | B7b | B7a ; B7-TL-4, TL-5, TL-7 et TL-8 |
     | B7c | B7a ; P0r2 fusionnée (fait : #287) ; B7-TL-6, TL-9 et TL-10 ; verdict de la Sécurité sur B7-TL-9 et TL-7 (question 9 de la spécification), qui bloque la fusion de B7c |
3. **Suite** : B8 (ancrage) attend B7a et B7c ; B9 (workflows) attend les trois (spécification, ligne sous le tableau « Découpage »). Ordre de tâche décidé par le CEO : la spécification B8 peut être écrite dès maintenant, sur les interfaces de la section « Ce que B7 expose à B8 et B9 ».
   § 3 amendé pour B8c par 0059 : B8c n'attend ni B7a ni B7c ; B8a et B8b restent soumis à ce § 3.
4. **Limite de corrections** : la règle du studio (au plus deux corrections par tâche, puis troisième tentative ou découpage avec le Tech Lead) s'applique à chaque sous-tâche séparément.

## Conséquences
- Le CEO ouvre le ticket de B7a quand P0r3 est fusionnée, ceux de B7b et B7c quand B7a l'est.
- Rien ne change pour P0r3 : le client réel de recherche web reste à sa charge (question 3).

## Quand revoir cette décision
Si P0r3 est découpée autrement ou retardée au point de bloquer B8, le CEO revoit l'ordre avec le Tech Lead.
