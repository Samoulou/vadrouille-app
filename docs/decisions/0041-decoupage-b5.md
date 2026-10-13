# 0041 — Décision du CEO : découpage de B5 en B5a, B5b et B5c

Statut : décision déléguée (ordre des tâches, « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Décideur : CEO pour l'ordre des tâches ; séquencement et périmètre de fichiers validés par la revue du Tech Lead de la PR #232 · Ticket #228 (spécification) · Spécification `specs/B5-moteur-sans-ia.md` (#229, fusionnée)

Numérotation (vérifiée le 2026-10-13) : `main` va de 0001 à 0040 ; aucune PR ouverte n'ajoute de fichier `0041`. Cette PR (#232) l'ajoute.

## Contexte
La spécification B5 (moteur sans IA) couvre sept blocs de la ligne B5 du backlog. Une seule PR de code serait trop grosse à relire et mélangerait l'outillage, la planification et l'écriture des versions. La spécification propose trois sous-tâches et demande au CEO d'écrire ce découpage dans `docs/decisions/` avant le premier ticket de code (question 2 de sa section « Questions ouvertes »). Précédents de découpage : F7 en F7a, F7b et F7c ; décision 0030 du Tech Lead pour P0. Aucun des deux n'est une décision écrite de dérogation à `CLAUDE.md`.

## Décision
1. **Découpage accepté.** B5 est livrée en trois PR de code, chacune avec son propre ticket, sa branche `claude/<id>-<slug>` et la section correspondante de `specs/B5-moteur-sans-ia.md` comme spécification :
   - **B5a** — modèle, validateurs et règles d'import ;
   - **B5b** — squelette, planificateur et réparation ;
   - **B5c** — patches, versions et annulation.
2. **Ordre séquentiel.** B5b démarre après la fusion de B5a, B5c après celle de B5b : les trois touchent `src/domain`, et deux fils ne travaillent jamais sur les mêmes fichiers.
3. **Dérogation limitée, soumise au veto de Samuel.** La règle « une tâche = une spécification = une branche = une PR » de `CLAUDE.md` appartient à Samuel. Cette décision n'y déroge que pour B5 (une spécification, trois tickets, trois branches, trois PR) et n'est pas un précédent général. Les tickets de code ne sont pas ouverts avant la fin de la fenêtre de veto.
4. **Prérequis inchangés.** B5a démarre après les décisions du Tech Lead sur B5-TL-1 à B5-TL-4 (Q333) ; B5-TL-6 (une seule définition de R3) est attendue au plus tard à la revue de B5a et n'est appliquée qu'en B11 ; B5c attend aussi B5-TL-5. Le Tech Lead peut ajuster les périmètres des sous-tâches par décision écrite ; l'ordre reste au CEO. Cette décision ne tranche aucune question de la spécification : la question 1 (Samuel, règle R1 pour un lieu ajouté par la personne, Q332) reste ouverte pour B11, et les questions 8 et 9 restent au Tech Lead.

## Conséquences
- Le CEO ouvre trois tickets de code nouveaux (B5a, B5b, B5c) à la fin de la fenêtre de veto ; seul B5a peut être pris tant que les deux autres attendent leur prédécesseur. Le ticket #228 (spécification) reste ouvert jusqu'à la fusion de B5c.
- Chaque PR respecte « Critères communs » de la spécification en plus de sa section ; `pnpm p0` et les tests de P0 restent verts à chaque PR.

## Quand revoir cette décision
Si une sous-tâche dépasse deux tentatives comptées (décisions 0019 § 3.2 et 0023), ou si une PR de code d'une autre tâche doit toucher `src/domain` pendant B5 (question 7 de la spécification : le CEO ordonne les deux, avec le rôle `ia` si besoin).
