# 0029 — Décision du Tech Lead : découpage de la spécification P0

Statut : décision déléguée (périmètre technique d'une tâche), à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-12 · Décideur : Tech Lead (délégation « Qui décide quoi » de `docs/CONTEXT.md`), consignée par IA-recherche dans #149 à sa demande, confirmée par la revue du Tech Lead du head `aefc7bf` · Ticket #147

Numérotation : 0028 est jointe à #149 ; 0011 reste réservé par #27. 0029 est le prochain numéro libre.

## Contexte
La spécification P0 (#149) a connu trois corrections comptées. La revue consolidée du head `0dd05f7` (2026-10-12) relevait six bloquants, tous issus des ajouts sur les exécutions réelles (programmes réels hors du dépôt, transfert, purge, quotas Google). La règle du cycle de Samuel prévoit qu'au-delà de deux corrections, une troisième tentative ou un découpage se décide avec le Tech Lead.

## Décision
1. **Découpage.** `specs/P0-prototype-recherche.md` (#149) ne couvre que le prototype **sans clé ni réseau** : P0a1 (script en mode simulé) et P0b1 (adaptateur `prototype` sur un programme de test, relecteurs simulés).
2. **Aucun chemin réel dans ce périmètre** (revue Sécurité du head `9d61978`) : ni client réel d'OpenRouter, de Places ou de Routes, ni relecteur Google réel, ni lecture de clé ; l'option `--reel` sort en erreur fermée constante.
3. **Spécification suivante** (`specs/P0-suite-executions-reelles.md`, nom proposé ; ticket et PR ouverts par le CEO après les réponses de Samuel à P0-Q13 et P0-Q14) : P0a2, P0b2, P0a3, P0c ; A5 (emplacement, transfert, purge et garde de CI des programmes réels) ; plafonds définitifs par exécution et calendrier ; clients réels avec hôtes figés dans le code ; grille G0 et P0-Q6. Ses exigences d'entrée sont listées dans la section « Renvoyé à la spécification suivante » de la spécification P0.

## Conséquences
- P0a1 démarre à la fusion de #149 et des décisions A2, A3 et A7 ; P0b1 après la fusion de P0a1, propriétaire du schéma de la forme réduite (ou d'une PR intermédiaire de P0a1 qui ne livre que ce schéma), et des décisions A4 et A6. A1 (AI SDK) accompagne le client réel de la spécification suivante.
- Aucune exécution réelle n'a lieu avant la fusion de la spécification suivante.
- L'ordre de la spécification suivante dans le backlog reste au CEO.

## Quand revoir cette décision
À l'ouverture de la spécification suivante.
