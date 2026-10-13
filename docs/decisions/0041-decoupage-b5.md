# 0041 — Décision du CEO : découpage de B5 en B5a, B5b et B5c

Statut : décision du CEO (ordre des tâches, « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-13 · Décideur : CEO · Ticket #228 · Spécification `specs/B5-moteur-sans-ia.md` (#229, fusionnée)

## Contexte
La spécification B5 (moteur sans IA) couvre sept blocs de la ligne B5 du backlog. Une seule PR de code serait trop grosse à relire et mélangerait l'outillage, la planification et l'écriture des versions. La spécification propose trois sous-tâches et demande au CEO d'écrire ce découpage dans `docs/decisions/` avant le premier ticket de code (question 2 de sa section « Questions ouvertes »). Précédents : F7a, F7b et F7c ; décision 0030 pour P0.

## Décision
1. **Découpage accepté.** B5 est livrée en trois PR de code, chacune avec son ticket, sa branche `claude/<id>-<slug>` et la section correspondante de `specs/B5-moteur-sans-ia.md` comme spécification :
   - **B5a** — modèle, validateurs et règles d'import ;
   - **B5b** — squelette, planificateur et réparation ;
   - **B5c** — patches, versions et annulation.
2. **Ordre séquentiel.** B5b démarre après la fusion de B5a, B5c après celle de B5b : les trois touchent `src/domain`, et deux fils ne travaillent jamais sur les mêmes fichiers.
3. **Dérogation limitée.** Cette décision déroge à la règle « une tâche = une spécification = une branche = une PR » de `CLAUDE.md` pour B5 seulement : une spécification, trois tickets, trois branches, trois PR.
4. **Prérequis inchangés.** Le ticket de B5a démarre après les décisions du Tech Lead sur B5-TL-1 à B5-TL-4 (Q333) ; B5c attend aussi B5-TL-5. Les décisions réservées à Samuel ou déléguées au Tech Lead et à la Sécurité restent les leurs.

## Conséquences
- Le CEO ouvre les tickets B5a, B5b et B5c ; seul B5a peut être pris tant que les deux autres attendent leur prédécesseur.
- Chaque PR respecte « Critères communs » de la spécification en plus de sa section.

## Quand revoir cette décision
Si une sous-tâche dépasse deux corrections, ou si une PR de code d'une autre tâche doit toucher `src/domain` pendant B5.
