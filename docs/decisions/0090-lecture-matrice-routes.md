# 0090 — Lecture de la matrice Routes paire par paire et journal d'arrêt `p0.step_failed` (ticket #493, PR #495)

Statut : **décision déléguée** (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; **définitive sans veto de Samuel 6 heures après sa fusion** (décision 0068). Elle n'engage ni argent, ni compte externe, ni donnée personnelle : le masque de champs Routes (donc le SKU facturé) n'est pas modifié (§ 3 point 5).

Date : 2026-10-18 · Décideur : Tech Lead · Ticket : #493 · PR : #495 (head relu : `b4f6a06`) · Revue : revue consolidée du head `b4f6a06` (2026-10-18 14:18 UTC, bloquant 2 et mineurs 1 à 8) · Diagnostic : note de l'IA-recherche « Diagnostic des exécutions Rome de l'après-midi (2026-10-18) » (fichier du projet `essai-reel/diagnostic-rome-2.md`, hors dépôt), § 2 et § 3 · Décisions liées : 0011, 0053, 0055, 0077, 0089

**Amende, sans les réécrire :**
- la **règle de correspondance stricte élément → paire** de la lecture de la matrice (`src/grounding/routes-client.ts`), posée par le mineur de la revue du head `353bb20` (P0r1, #272) et jamais écrite dans `docs/decisions/` : « la matrice rend exactement un élément par paire, chaque paire une seule fois ; sinon `invalid_response` » ; elle est remplacée par le § 1 ;
- **0055 § 6 point 1** (Routes appelé dans l'étape finale pour l'ordre final des lieux retenus de chaque jour) : **précisé, non changé** ; une durée inconnue n'arrête plus l'étape (§ 1).

**N'amende pas** 0011 (aucune durée ni donnée Google stockée, journalisée ou mise dans un prompt ; la relecture n'invente jamais de valeur), 0053 et 0088 § 13 (plafonds et limite de 840 éléments inchangés), 0077 § 3 point 1 (exemption de `src/ai/erreurs.ts`, § 3 point 8).

## Contexte

Les deux exécutions réelles Rome de l'après-midi du 2026-10-18 (exclues du décompte par 0089) se sont arrêtées en `pipeline_failed` dans la boucle des matrices Routes de l'étape finale, après une réponse Routes en 200 (diagnostic, § 2 et § 3). Cause la plus probable : une réponse TRANSIT refusée **entière** par la lecture stricte (`invalid_response`) pour un seul écart (élément mal formé, nombre d'éléments différent de origines × destinations, paire répétée). La cause exacte n'était pas journalisée : la règle S4 réduit le code avant de l'écrire.

La règle stricte de P0r1 visait un vrai risque : **attribuer une durée à une mauvaise paire** (proto3 omet un index 0). Mais elle traite toute anomalie locale comme une panne globale, alors que le moteur sait déjà traiter une durée absente (`null`) comme un trajet inconnu (`ROUTE_NOT_FOUND` passe déjà par là). Le principe « l'agent cherche, l'ancrage vérifie, le moteur planifie » place ce choix ainsi : l'ancrage (`src/grounding`) ne rend que ce qu'il a vérifié, et dit « inconnu » pour le reste ; le moteur planifie avec ce qu'il sait ; personne n'invente une durée.

## Décision

### 1. Lecture de la matrice : paire par paire, jamais une durée attribuée à une mauvaise paire

Règle unique : **une durée n'est rendue pour une paire que si elle lui appartient sans ambiguïté ; toute incertitude donne `null`** (trajet inconnu), jamais une erreur et jamais une valeur inventée.

| Cas de la réponse | Résultat |
|---|---|
| Corps qui n'est pas un tableau, ou tableau de plus de 625 éléments (`ELEMENTS_MAX`) | `invalid_response` (inchangé) : la réponse ne ressemble pas à une matrice |
| Élément illisible (pas un objet, index non entier ou négatif) | ignoré ; sa paire, si aucun autre élément ne la donne, reste inconnue |
| Index absent | 0 (règle du JSON de proto3) |
| Index hors de la matrice demandée | **toute la matrice** est inconnue : la réponse ne correspond pas à la requête, aucune de ses durées n'est sûre |
| Paire rendue deux fois ou plus (élément répété, ou élément sans index qui retombe sur `0:0`) | paire inconnue |
| Paire manquante | paire inconnue |
| `status.code` présent et différent de 0 | paire inconnue |
| `condition` différente de `ROUTE_EXISTS`, ou `duration` hors de la forme documentée | paire inconnue |
| `condition` `ROUTE_EXISTS` et `duration` de la forme `^\d{1,9}(\.\d{1,9})?s$` | durée en secondes, **fraction gardée** (§ 2) |

**Résidu accepté, à écrire dans la docstring** : une réponse d'un seul élément sans aucun index est lue comme la paire `0:0` ; c'est la lecture correcte d'un JSON proto3 pour une matrice 1 × 1, et pour une matrice plus grande les autres paires restent inconnues.

Conséquences, assumées :
- une matrice partiellement inconnue n'arrête plus l'étape ; le moteur ne planifie pas un lieu depuis ou vers un point dont le trajet est inconnu (comportement existant de `trajets` dans `p0-run.ts`) ; si le programme qui en résulte viole R1 à R10, l'arrêt reste celui de la validation (inchangé) ;
- la **relecture** (`src/server/p0/relecture.ts`) est inchangée : une durée `null` y fait échouer la journée relue (« Réessayer »), sans valeur inventée (0011, « Relecture ») ;
- aucune métrique ni journal ne dit combien de paires sont inconnues (ce serait une donnée dérivée de Routes par exécution ; S4 et 0011 § 7). Si le besoin de diagnostic revient, il passe par une nouvelle décision avec verdict Sécurité.

### 2. Durées fractionnaires : pas d'arrondi à la lecture

`ReponseMatrice.secondes` reste « durées en secondes » (`src/grounding/interfaces.ts`) : le client rend la valeur de Google, fraction comprise, sans arrondi. La conversion en minutes a déjà **un seul endroit par usage** : `Math.ceil(valeur / 60)` dans `src/grounding/ancrage.ts` (étape finale) et dans `src/server/p0/relecture.ts` ; un arrondi supplémentaire dans le client serait une seconde règle d'arrondi (duplication) et changerait la valeur du contrat. Exigence de test : § 3 point 2.

### 3. Ce que le code de #495 doit encore appliquer (rôle ia-recherche)

Sur la branche `claude/493-arret-routes-rome`, avant nouvelle revue :

1. **Docstring de `lireMatrice`** (`src/grounding/routes-client.ts`) : citer cette décision (0090 § 1) à la place du seul ticket, et écrire le résidu accepté du § 1 (élément unique sans index lu en `0:0`). Remplacer la mention « mineur de la revue du head `353bb20` » partout où elle désigne la règle stricte (il n'en reste aucune dans le code relu ; vérifier par `grep`).
2. **Durée fractionnaire de bout en bout** (mineur 2) : un test dans `src/grounding/routes-client.test.ts` (`"3.5s"` donne `3.5`, `"160s"` donne `160`, `"1.s"`, `"-3s"`, `"3,5s"` et `"1e3s"` donnent `null`) **et** un test qui passe une durée fractionnaire par `minutesDeTrajets` (`src/grounding/ancrage.ts`, ou `matriceTrajets` qui l'appelle) et vérifie les minutes rendues (`Math.ceil`, par exemple `60.5` s donne 2 min, `59.9` s donne 1 min). Aucun arrondi ajouté dans le client.
3. **`status` sans `.passthrough()`** (mineur 7) : `status: z.object({ code: z.number().int().optional() }).optional()` (Zod retire alors les champs inconnus, défense en profondeur : `message` et `details` de `google.rpc.Status` ne sont jamais gardés). Test : un élément avec `status: { code: 5, message: "…" }` donne `null` pour sa paire.
4. **Une seule liste des phases** (mineur 3) : `LOG_STEP_PHASES` devient `as const` dans `src/server/log.ts` ; `PhaseJournal` est dérivé (`(typeof LOG_STEP_PHASES)[number]`) dans `src/server/p0/journal-etape.ts`, qui ne la recopie plus ; `PHASES_JOURNAL` est supprimé (le test d'égalité de `tests/unit/p0/journal-etape.test.ts` compare alors `LOG_STEP_PHASES` à `PHASES` de `src/prototype/arret.ts` plus `fiches`, `routes`, `moteur`). `LOG_STEP_FAILURE_CODES` **reste une copie** (frontières d'imports de `log.ts`, 0055 § 3 et 0077 § 3) avec son test d'égalité à l'union des listes sources : écart accepté, la copie ne peut pas dériver sans faire échouer le test.
5. **Masque Routes inchangé** : `MASQUE_MATRICE` reste `originIndex,destinationIndex,duration,condition`. `status` n'y est **pas** ajouté : un élément en erreur a une `condition` absente (`…_UNSPECIFIED`), donc sa paire est déjà inconnue sans `status` ; ajouter un champ au masque peut changer le SKU facturé (`routes_matrix_essentials`), ce qui relève de Samuel (argent) et n'apporte rien à la correction. `status` reste **toléré** s'il est rendu (point 3). La docstring de `ElementSchema` le dit déjà ; la garder.
6. **`errorName` : la regex est gardée, les commentaires corrigés** (mineur 5). `errorNameOf` (`src/server/log.ts`, `NOM_ERREUR = /^[A-Za-z]{1,40}$/`) est la fonction déjà utilisée par les autres événements : pas de seconde règle. Les commentaires de `src/server/log.ts` (entrée `p0.step_failed` de `LOG_EVENTS`) et de `src/server/p0/journal-etape.ts` disent « nom de classe de l'erreur, filtré par `NOM_ERREUR` (lettres seulement, 40 au plus ; absent sinon) », jamais « liste fermée ». Raison : le nom vient de la classe construite par notre code ou par le moteur JavaScript, pas d'une réponse Google ; lettres seules, sans espace ni chiffre, il ne peut porter ni identifiant de lieu, ni durée, ni position. Verdict Sécurité S4 de la revue consolidée : favorable.
7. **Niveau du journal selon le code fermé** (mineur 6) : `journaliserEchecEtape` écrit `p0.step_failed` en **`warn`** quand `failureCode` est un arrêt attendu par plafond (`cap_reached`, `envelope_reached`, `daily_quota_insufficient`), en **`error`** sinon. La liste des trois codes est une constante unique de `src/server/p0/journal-etape.ts`, prise dans `LOG_STEP_FAILURE_CODES` (test : chacun en `warn`, `pipeline_failed`, `invalid_response` et `autre` en `error`).
8. **Tests de `etape()`** (mineur 4) : un test qui fait échouer l'étape finale à chacune des phases `fiches`, `routes` et `moteur` (et au moins une phase écrite en base) et vérifie que `p0.step_failed` porte cette phase, le `failureCode` d'origine (par exemple `invalid_response`, pas `pipeline_failed`) et qu'il est écrit **avant** la réduction du code persisté ; et qu'aucune ligne n'est écrite quand l'étape réussit.
9. **Import de `@/ai/erreurs` par `log.ts`** (mineur 8) : **couvert**, rien à changer. L'exemption de 0077 § 3 point 1 porte sur le chemin importé (`src/ai/erreurs.ts`, égalité exacte), quel que soit l'importateur ; `log.ts` n'en réexporte rien, il n'entre donc pas dans `REEXPORTATEURS_ERREURS_IA`. Le dire dans la description de la PR en citant `tests/unit/p0/imports.test.ts` (`p0: exemption exacte de src/ai/erreurs.ts`).
10. **Description de la PR** (bloquant 1 de la revue, hors de cette décision) : la réécrire pour le ticket 493 et citer 0090 ; la noter dans la note de version suivante.

## Conséquences

- Une réponse Routes partiellement anormale ne fait plus perdre une exécution entière ; une réponse sans rapport avec la requête (index hors matrice) ne donne aucune durée, sans arrêt.
- La cause d'un arrêt d'étape devient lisible dans les journaux (phase, classe, code fermé) sans aucune donnée Google, ce que demandait le diagnostic (§ 3).
- Aucun coût nouveau : ni champ ajouté au masque, ni appel supplémentaire.

## Question ouverte (non bloquante)

- **SKU et champ `status`** : si l'IA-recherche veut un jour demander `status` (pour distinguer « pas d'itinéraire » d'une erreur par élément), elle relève d'abord, sources Google citées, si `status` appartient au SKU « Compute Route Matrix Essentials » ; tout changement de SKU remonte à Samuel. Rien ne l'exige pour #495.
