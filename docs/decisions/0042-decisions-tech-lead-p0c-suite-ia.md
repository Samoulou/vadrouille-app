# 0042 — Décisions du Tech Lead et de la Sécurité pour P0c-suite-ia (P0cS-TL-1 à TL-5, P0cS-Q1)

Statut : décision déléguée, à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Rédaction : CEO (commit `[ceo]`), comme 0038 et 0040 · Décideurs : Tech Lead (outillage et tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) et Sécurité (P0cS-Q1), réponses données dans la revue consolidée du head `8f1f299` de la PR #231 · Ticket #221 · Spécification `specs/P0c-suite-ia.md` (#231, fusionnée) · Question Q339

Numérotation (vérifiée le 2026-10-13) : `main` va de 0001 à 0041 ; aucune PR ouverte n'ajoute de fichier `0042`. Cette PR l'ajoute.

## Contexte
La décision 0040 (D1, « Échéance et tâche de suivi ») demande de retirer avant P0r2 l'exception A1 de `tests/unit/p0/cli.test.ts`, et D2 les accès de A6 et A7. La spécification P0c-suite-ia décrit ce retrait et pose cinq propositions au Tech Lead et une question à la Sécurité. Elle exige une décision écrite avant la PR de code, parce que l'option retenue pour P0cS-Q1 retire deux cas de test et que `CLAUDE.md` interdit de supprimer un test sans décision écrite dans `docs/decisions/`.

## Décision
1. **P0cS-TL-1, doubles réseau de `cli.test.ts` : accordé.** Doubles par `vi.mock` à fabrique littérale sans paramètre (ni `importOriginal`, ni `vi.importActual`, ni `import()`) pour `node:dns`, `node:dns/promises`, `node:http`, `node:https` et `node:tls` ; espions par `vi.hoisted` ; `fetch` par `vi.stubGlobal`. `node:net` n'est pas doublé, et aucun faux `BlockList` ni `isIP` n'est fabriqué (le mode simulé en a besoin par `src/research/ip-guard.ts`, ligne A4). Les espions `net.connect` et `net.createConnection` disparaissent ; la compensation est la ligne A4 (seuls `BlockList` et `isIP`) et `tests/unit/p0/imports.test.ts`.
2. **P0cS-TL-2, forme de A6 : accordé.** `src/research/fetch-page.test.ts` lit ses tables par `Map` (`.get(…)`) ; `Object.hasOwn` ne convient pas, car l'accès calculé resterait. Cette décision précise 0040 D2, qui citait « `Map` ou `Object.hasOwn` » : seule `Map` convient.
3. **P0cS-TL-3, forme de A7 : accordé.** `tests/unit/p0/pipeline.test.ts` lit le champ sur une vue typée sans signature d'index, sans conversion d'objet ni `zod`.
4. **P0cS-TL-4, tests du régime propres à D1 : accordé.** Aucun test du régime n'est supprimé : ils deviennent des tests d'absence de l'exception ; `cas-exception-d1.json` est conservé et renommé ; le cas `d1-surveiller-env-admis` passe à `refus` ; `tests/unit/confinement/analyse.ts` ne change pas (`formeReflexion` conservé). La recommandation de la Sécurité de retirer plus tard `formeReflexion` est une tâche distincte, non ouverte par cette décision.
5. **P0cS-TL-5, environnement du sous-processus : accordé.** Six lectures littérales (`PATH`, `HOME`, `SystemRoot`, `TMPDIR`, `TEMP`, `TMP`) au lieu de la boucle `process.env[nom]`, sans étalement de `process.env` ; la ligne `LECTURES_ENV` de `cli.test.ts` est ajustée.
6. **P0cS-Q1 : option a retenue (Sécurité et Tech Lead).** Les deux variantes « avec variables de clé » de `cli.test.ts` (cas générés par `for (const avecCles of [false, true])`) sont retirées ; les variantes « sans » restent. **Cette décision est la décision écrite exigée par `CLAUDE.md`** pour ce retrait, avec 0040 D1 (« Échéance et tâche de suivi ») : le nombre de cas de la suite unitaire baisse de 2 exactement (critère 8 de la spécification). La preuve « aucune clé lue » devient uniquement statique (`imports.test.ts`) ; le contrôle de l'absence de clé dans l'environnement des tests sera complété par P0r1 avant P0r2. L'option b (valeurs factices sous des noms secrets dans un fichier de test) est rejetée, contraire à la section 5 de `specs/P0c-confinement-capacites.md`.

## Conséquences
- La PR de code de #221 (rôle `ia`) peut s'ouvrir à la fusion de cette décision ; elle cite cette décision et 0040 D1, et son verdict Sécurité est lu sur son head courant.
- À la fusion de la PR de code, le CEO met à jour les sections 2.4 et 5 de `specs/P0c-confinement-capacites.md` et les amendements M1 et M2 de 0040 (« exception transitoire »), devenus périmés.

## Quand revoir cette décision
Si la PR de code ne peut pas tenir ces formes sans nouvelle ligne de liste, ou si P0r1 ne complète pas le contrôle « Clés » avant P0r2.
