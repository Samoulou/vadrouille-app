# 0107 — Second importeur admis de l'adaptateur de la table de travail : `prototype-ecriture.ts` (constat A de 0103), garde renforcée

Statut : **décision déléguée** (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`) : renforcement d'une garde de test (comme 0052 § 1.10 et 0063 point 9), demandé par la revue consolidée Tech Lead et Sécurité de la PR #572 (head `0ea7d39`, bloquant 1). À lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion (décision 0093) ; Samuel peut la remettre en cause à tout moment. Elle n'affaiblit ni ne supprime aucun test, ne change ni droits, ni RLS, ni migration, n'engage ni argent, ni compte externe, ni donnée personnelle hors UE, et ne touche aucun plafond.

Date : 2026-10-20 · Décideur : Tech Lead (rédaction : data) · Ticket : #561 · PR : #572 (revues consolidées des heads `0ea7d39` et `a5c66b5`) · Décisions liées : 0046 (D15 point 3, S4), 0052 § 1.10, 0063 point 9, 0103 (constat A), Q531 (choix du CEO)

## Contexte

0063 point 9 confine l'adaptateur de la table de travail `src/adapters/prototype-travail.ts` : importé par `src/workflows/p0-run.ts` seul, hors tests. Le constat A de 0103 exige que les lignes de `prototype.run_candidates` d'une exécution soient supprimées **dans la transaction** de `ecrireProgramme`. Selon Q531, la suppression reste dans l'adaptateur de la table de travail (seul module de `src/` qui nomme la table) et `src/adapters/prototype-ecriture.ts` l'appelle : `supprimerCandidatsDansTransaction(client, runId)`, sans connexion ni transaction propre.

La garde de `tests/unit/p0/base-prototype.test.ts` ne reconnaissait que le spécificateur `@/adapters/prototype-travail` : un import relatif lui échappait.

## Décision

1. **Importeurs admis hors tests**, exactement : `src/adapters/prototype-ecriture.ts` (pour la seule suppression des candidats, constat A de 0103) et `src/workflows/p0-run.ts`. Aucun autre module de `src/` ni de `scripts/` ; toujours ni fabrique ni réexportation par `src/adapters/index.ts`.
2. **Garde insensible à la forme du spécificateur** : tout spécificateur de module entre guillemets simples, doubles ou obliques sans interpolation (import statique ou dynamique, `export … from`, `vi.mock`, `require`), alias `@/…` ou relatif (`./`, `../`), extension `.ts` facultative, est résolu depuis le dossier du fichier et comparé au chemin de l'adaptateur. Le contrat `src/contracts/prototype-travail.ts` ne compte pas. Les tests (`tests/`, `*.test.ts`, `*.test.tsx`) sont exclus.
3. **Auto-tests** du motif, positifs (alias, relatif, remontant, extension, `vi.mock`, import dynamique, import dynamique entre guillemets obliques, `export … from`, `require`) et négatifs (contrat par alias ou relatif, autre module au nom voisin, mention hors spécificateur).
4. Le commentaire de tête de `prototype-travail.ts` décrit la même règle.

## Hors périmètre

`prototype.run_secteurs`, que le constat A demande aussi de supprimer à l'écriture du programme, n'existe pas encore (Q-L2a, #562) : la tâche qui crée la table ajoute sa suppression dans la même transaction.

## Quand revoir

Si un troisième module doit importer l'adaptateur : nouvelle décision écrite, et la liste de la garde la nomme.
