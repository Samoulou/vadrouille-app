# 0045 — Décisions du Tech Lead pour B5 (B5-TL-1 à TL-6, questions 4, 5, 6, 8 et 9 de la spécification) ; amende 0032

Statut : décision déléguée (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Rédaction : CEO (commit `[ceo]`), comme 0038, 0040 et 0042 · Décideur : Tech Lead · Ticket #255 · Spécification `specs/B5-moteur-sans-ia.md` (#229, fusionnée) · Questions Q333, Q337, Q338 · **Amende la décision 0032** (A2, A3.1 et A3.2, ligne `src/domain/**`, et règle « types partagés »), sans la réécrire

**§ 1.3 amendé par 0077** (§ 1 point 8, ticket #415) : `src/ai` ne lit plus les types de `src/prototype`, qui restent pour P0 seulement.

**§ 1.5 précisé par 0063** (amendement P0r3c-5a, ticket #349) : `assemblage.ts` et `vers-moteur.ts` vivent désormais dans `src/server/p0/` ; `scripts/p0` les importe.

Numérotation (vérifiée le 2026-10-13) : `main` va de 0001 à 0044 ; aucune PR ouverte (#238, #243, #245, #248) n'ajoute de fichier sous `docs/decisions/`. Cette PR ajoute `0045`.

## Contexte
La spécification B5 pose six propositions au Tech Lead (B5-TL-1 à TL-6) et lui adresse les questions 4 (excursions), 5 (conflit entre étapes verrouillées, avec UX/UI), 6 (transfert vers l'aéroport), 8 (réduction du budget de trajet comme version, liée à Q41) et 9 (lecture de « R1 à R10 testées à 100 % »). La décision 0041 (découpage B5a, B5b, B5c, veto levé par Samuel le 2026-10-13 à 17:36 UTC) fait attendre B5a sur B5-TL-1 à TL-4, B5c sur TL-5, et TL-6 au plus tard à la revue de B5a. Chaque point ci-dessous donne la décision, sa justification vérifiée sur `main` (`99f0565`) et ce qu'elle impose aux tests de B5a.

Ce qui ne relève pas du Tech Lead reste une question ouverte, avec son destinataire (section « Questions ouvertes »).

## État vérifié sur `main`
- `src/domain` importe `@/prototype/ancrage` (`validation.ts:5-6`, `planification.ts:4`, `assemblage.ts:19`), `@/prototype/brief` (`squelette.ts:3`, `validation.ts:7`, `assemblage.ts:20`), `@/prototype/candidat` (`classement.ts:2`, `planification.ts:5`, `assemblage.ts:21`) et `@/prototype/config` (`classement.ts:3`), comme le permet 0032 A3.2 (ligne `src/domain/**`), et `tests/unit/p0/imports.test.ts:360-362` le vérifie. Le handover § 3 (`docs/handovers/backend.md:139`) n'admet que `@/contracts`, `zod` et `src/domain` ; sa liste noire (`backend.md:146`) n'interdit à `src/domain` que `process.env` et `fetch`, plus étroit que le § 3 ci-dessous.
- `src/ai/requetes.ts:6-9` et `src/research/agent.ts:4-6` importent `@/prototype/brief`, `candidat` et `config` ; 0032 A3.2 (règles complémentaires) interdit à `src/ai`, `src/research` et à l'application d'atteindre `@/domain` ; `imports.test.ts:875` le vérifie pour `src/ai` et `src/research`, et le test du graphe de l'application (`imports.test.ts:889-900`, préfixe refusé l. 895) pour l'application.
- Le moteur de P0 est déjà sans horloge ni hasard : la date de référence est une entrée (`classement.ts:15-19`, `dateExecution`), les seuls usages de `Date` sont `Date.parse` et `new Date(argument)` (`temps.ts:27-38`), les trajets passent par une fonction synchrone en mémoire (`Trajets`, `src/prototype/ancrage.ts:52`) et les identifiants d'étape sont dérivés du jour et du rang (`assemblage.ts:138`, `176`, `181`, `198`).
- Les valeurs du squelette sont des constantes du moteur (`squelette.ts:14-26`) et le budget de trajet une constante de `src/prototype/brief.ts:14` : contraire à PO-1 (« jamais codées […] dans le moteur », `backend.md:714`).
- `src/server/config/offer.ts:1` importe `server-only`, obligatoire dans `src/server` sans exception (`eslint.config.mjs:431-439`, liste `files`) ; `pnpm p0` ne peut donc pas charger un module de `src/server`.
- `TripPatchSchema` : `candidateId` est un `uuid` (`src/contracts/patch.ts:26`), `revert` est seul dans son patch (`patch.ts:45`). `API_ERROR_CODES` (`src/contracts/values.ts:136-145`) n'a ni `no_option` ni code de refus de patch autre que `version_conflict`. Chaque version après la première porte son patch (`db/schema/business.ts:166`).
- `lockedStopViolations` (`src/features/sejour/revision.ts:52`) ne compare ni le `placeId` ni ne protège les engagements déverrouillés autrement que par `locked`. 0016 § 4.2 (l. 116) prévoit qu'en B11 cette fonction passe dans `src/domain` et que **le serveur** l'importe, sans seconde copie, sur le modèle de `preferencePromptFor` (0013 § 3.2, l. 96, où c'est aussi le serveur qui devient seul juge) ; l'interface, elle, reçoit le refus `lockedStop` du serveur (`apply`, 0016 l. 129). Ni 0016 ni 0013 ne font importer `@/domain` par l'interface.
- `Day.travelBudgetMinutes` est stocké, « copie de la configuration PO-1 au moment de la planification, réduction comprise » (`backend.md:337`) ; `preference_signals` a le signal `travelReduction` et le statut `cancelled` (`backend.md:538`, correspondance `backend.md:250`).
- Aucun outil de couverture n'est installé ni configuré (`package.json`, scripts `test` et `verify`).

## Décision

### 1. B5-TL-1 — Un seul moteur : accordé, sens « adaptateur dans `scripts/p0` »
1. B5 fait évoluer le moteur de P0 dans `src/domain`. Aucun second moteur.
2. **`src/domain` n'importe plus rien de `src/prototype`.** Ses types d'entrée sont les siens (`src/domain/entrees.ts` ou nom choisi par la PR), construits sur les types de `src/contracts` (`Brief`, `TripCommitment`, `StopFacts`, `Category`, `Pace`, `Segment["mode"]`) : brief, nuits et logements, engagements, candidats de la réserve (identifiant opaque, nom et résumé maison, catégorie, faits, sources, notes, `placeId`), candidats d'événement et d'idée, état de choix (B5-PO-8), configuration (§ 4). Les données dérivées de Google n'entrent que par les interfaces du § 2 : `AncrageResolu`, `Position` et `estAncre` ne sont plus lus par le moteur.
3. **Sens retenu : `scripts/p0` adapte.** L'option « `src/prototype` importe depuis `src/domain` » est rejetée : les modules de `src/prototype` sont des feuilles (`@/contracts` et `zod` seulement, 0032 A3.2) et `src/ai` les lit ; les faire dépendre de `src/domain` ferait atteindre `@/domain` depuis `src/ai` par transitivité. Les types que lisent `src/ai` et `src/research` (`Brief`, `Candidat`, `Notes`, `ConfigRecherche`, `Routage`) **restent** dans `src/prototype`. Un seul fichier, `scripts/p0/vers-moteur.ts` (nom libre), convertit les types de P0 vers les entrées du moteur : rythme (`tranquille`, `equilibre`, `intense` → `relaxed`, `balanced`, `intense`), heures d'arrivée et de départ du brief de P0 → engagement `flight` aux dates d'arrivée et de départ (B5-PO-7, B5-PO-12, ce qui reproduit `squelette.ts:82-83`), ancrages → doubles en mémoire des interfaces du § 2. Ce n'est pas une copie de types : le moteur parle le vocabulaire des contrats, P0 le sien, et la conversion est une fonction testée.
4. **`ConfigClassementSchema` passe de `src/prototype/config.ts` à `src/domain`** (seul `src/domain` l'applique, aucun fichier de `src/ai` ni de `src/research` ne le lit) ; `scripts/p0/fichiers.ts` valide `prototype/config/classement.json` avec ce schéma. Le fichier JSON reste à sa place et à ia-recherche (0032 A2).
5. **Sorties propres à P0 hors du moteur** : la construction des cartes (`DayMap` à partir des positions, `assemblage.ts:258`) et le programme complet destiné à la réduction quittent `src/domain` pour `scripts/p0`. En production, les positions sont recomposées à la lecture (B8) ; le moteur n'en a pas besoin.
6. **Périmètre de fichiers de B5a ajusté** (0041 point 4) : en plus de `src/domain`, de la configuration (§ 4) et des tests, B5a modifie `scripts/p0/` (adaptateur, `pipeline.ts`, `fichiers.ts`), `src/prototype/config.ts` et `config.test.ts` (retrait de `ConfigClassementSchema`), `src/prototype/brief.ts` (retrait de `BUDGET_TRAJET_PAR_RYTHME`), `tests/unit/p0/imports.test.ts` et `eslint.config.mjs`. Le rapport de P0 garde sa forme (six compteurs, `scripts/p0/rapport.ts`), dérivée du nouveau rapport du moteur par l'adaptateur. Rôle `ia` informé par cette décision (question 7 de la spécification) ; il ne bloque pas B5a.

**Amendement de 0032 (A2, A3.1 et A3.2).**
- A2 (§ 1.4) : `ConfigClassementSchema` est défini dans `src/domain` et non plus dans `src/prototype/config.ts` ; le fichier `prototype/config/classement.json` et son propriétaire (ia-recherche) ne changent pas.
- Ligne `src/prototype/` de A3.1 : `config.ts` ne porte plus le schéma de `classement.json` ; `brief.ts` ne porte plus `BUDGET_TRAJET_PAR_RYTHME` (valeurs dans `src/server/config/moteur.json`, § 4).
- Ligne `src/domain/**` du tableau de A3.2 : **`@/contracts`, `zod`, `@/domain/*`** seulement (retrait de `@/prototype/brief`, `config`, `candidat`, `ancrage`).
- Ligne `src/domain/` de A3.1 : « validateurs R1, R2, R4 à R8 » devient « validateurs R1 à R10, budget de trajet, refus typés » ; l'identifiant `proto_<slug>_<AAAAMMJJ>_<n>` reste dans `identifiant.ts` tant que P0 tourne.
- Règle « Les types partagés entre étapes ne sont définis qu'une fois, dans `src/prototype/candidat.ts` et `src/prototype/ancrage.ts` » : elle vaut pour les étapes de P0 (recherche, ancrage) ; les entrées du moteur sont définies une fois, dans `src/domain`, et reçues de P0 par l'adaptateur de `scripts/p0`.
- Les autres règles de 0032 (graphe de `src/ai` et `src/research`, graphe de l'application, `process` refusé) ne changent pas. Aucune exception au graphe de l'application n'est accordée (§ 6).

**Ce que B5a doit tester.**
- `tests/unit/p0/imports.test.ts` : la ligne `src/domain` n'admet plus `@/prototype/*` ; cas refusé ajouté (`import type { Brief } from "@/prototype/brief"` dans `src/domain/x.ts`).
- Adaptateur : un test de conversion (rythmes, `flight` synthétique, doubles d'interfaces) ; `pnpm p0` vert, et **sortie simulée de `pnpm p0` sur les briefs commités égale avant et après B5a** (programme réduit et rapport), écarts éventuels listés et justifiés dans la PR.
- `src/domain/moteur.test.ts` ou son successeur n'importe plus `@/prototype/programme-reduit` ni `@/prototype/reduction` (`moteur.test.ts:15-16`) : les cas de réduction partent dans `tests/unit/p0/`.

### 2. B5-TL-2 — Interfaces injectées : accordé, **synchrones**
1. **Synchrones et en mémoire.** Le serveur (B8) fait ses relectures Places et Routes avant d'appeler le moteur (étape e, `backend.md:832`), puis lui passe des fonctions qui lisent une table en mémoire. Raisons : le moteur de P0 fonctionne déjà ainsi (`Trajets`, `ancrage.ts:52`) ; une interface asynchrone ferait dépendre le résultat de l'ordre des réponses et rendrait la pureté invérifiable.
2. **Forme** (noms indicatifs, à garder dans le fichier `src/domain/relectures.ts` ou équivalent), sans aucun champ de forme Google :
   ```ts
   type Inconnu = "inconnu";
   type Point = { lieu: string /* placeId */ } | { logement: number /* index de la nuit, 0 = première nuit */ };
   type Validite = "valide" | "ferme_definitivement" | "introuvable" | Inconnu;
   type Plage = { debut: number; fin: number }; // minutes depuis minuit du jour, fin ≤ 2 880
   type Relectures = {
     validite(placeId: string): Validite;
     plages(placeId: string, date: string /* AAAA-MM-JJ */): readonly Plage[] | Inconnu;
     duree(depuis: Point, vers: Point, mode: "walk" | "transit" | "car"): number | Inconnu;
   };
   ```
   - Les plages sont demandées **par date**, pas par jour de semaine : B8 peut y refléter une fermeture temporaire ou des horaires exceptionnels sans changer le moteur.
   - Un logement est désigné par l'index de sa nuit (0 = première nuit, `N − 1` = dernière pour `N` nuits), pas par un `placeId` (B5a, point 1 : `placeId` facultatif) : B8 résout un logement ou un quartier.
   - Logements d'un jour (B5-PO-7), jours numérotés de 0 à `N` : le jour `j` part de `{ logement: max(j − 1, 0) }` et finit à `{ logement: min(j, N − 1) }`. Le premier jour part donc du logement de la nuit 0 et le dernier jour (`j = N`) finit au logement de la dernière nuit (`N − 1`) ; un jour de changement part de l'ancien index et finit au nouveau.
   - R1 n'est conforme que si `validite` répond `valide` ; `inconnu` est traité comme un lieu non ancré, comme `estAncre` de P0 (`ancrage.ts:48-50`).
3. Le moteur n'appelle ces fonctions que pendant un calcul et ne renvoie jamais leurs valeurs dans une sortie d'écriture ni dans le rapport (0011 points 2, 4, 5).

**Ce que B5a doit tester.** Doubles fabriqués dans les tests, à valeurs sentinelles ; chaque fonction répond au moins une fois `inconnu` dans un test de règle (R1 : violation ; R4 : conforme et `toConfirm` en mémoire ; R5 : violation) ; le test `validation: le rapport ne contient que des codes et des identifiants` sérialise le rapport et n'y trouve aucune sentinelle des trois fonctions.

### 3. B5-TL-3 — `src/domain` sans entrée-sortie : accordé, liste précisée
1. **Règle ESLint** (handover § 3 et ligne B5 du backlog) sur `src/domain/**/*.ts`, tests compris :
   - imports admis : `@/contracts` (sous-chemins compris), `zod`, fichiers de `src/domain` ; en plus, pour `*.test.ts` seulement : `vitest`. Tout autre import est refusé, `import type` et `export … from` compris ;
   - refusés : `process` (tout accès, pas seulement `process.env`, comme 0032 amendement point 12), `fetch`, `Date.now`, `new Date()` et `Date()` sans argument, `Math.random`, `crypto`, `performance`, `globalThis`, `require`, `import()`, `eval`, `Function`. `Date.parse`, `Date.UTC` et `new Date(argument)` restent permis (`temps.ts:27-38`).
2. `tests/unit/p0/imports.test.ts` garde sa ligne `src/domain` (même liste, § 1) tant que P0 tourne ; la règle ESLint est la référence de production. Les deux listes doivent rester égales ; la PR le vérifie par un cas commun.
3. **Handover** : la liste noire de `docs/handovers/backend.md:146` (`process.env`, `fetch`) est alignée sur le point 1 par la PR B5a (rôle `back`), dans le même commit que la règle ESLint ; le Tech Lead le vérifie à la revue de B5a.
4. **Date** : le moteur reçoit la date de référence (`dateReference`, comme `dateExecution` de `classement.ts:18`).
5. **Identifiants d'étape** : déterministes, sans graine aléatoire. Une étape créée par le moteur dans la version `n` a l'identifiant `v<n>-j<jour>-<rang>` (rang à partir de 1 dans le jour ; suffixes `e<rang>` pour un événement, `idee` pour l'idée, `c<rang>` pour une proposition, comme `assemblage.ts:176-198`). Le serveur passe `n` (version à produire, connue sous le verrou de `trips`). Une étape qui existe déjà garde son identifiant d'une version à l'autre ; le moteur ne renomme jamais. Les identifiants d'un patch (`newStopId`, ajout) sont attribués par le serveur (0037) et repris tels quels.

**Ce que B5a doit tester.** `lint: src/domain sans entrée-sortie` (`tests/unit/lint/`, sur la configuration réelle, comme `server-only-lint.test.ts`) : un cas signalé par import refusé (`node:fs`, `@/server/config/moteur`, `@/grounding/ancrage`, `@/prototype/brief`) et par construction refusée (`process.env.X`, `process.argv`, `fetch(…)`, `Date.now()`, `new Date()`, `Math.random()`, `crypto.randomUUID()`, `performance.now()`, `globalThis.fetch`) ; passent : un fichier qui n'importe que `@/contracts`, `zod` et `@/domain/*`, `new Date("2026-10-13")`, et un `*.test.ts` qui importe `vitest`. Les identifiants sont vérifiés en B5b (`moteur: déterministe`).

### 4. B5-TL-4 — Configuration du moteur : accordé, avec un fichier de valeurs unique
1. **Schéma** : `src/domain/configuration.ts` (Zod strict, bornes, `schema: 1`), type d'entrée du moteur ; il porte PO-1 (budget par rythme), B5-PO-1 (activités par rythme, fenêtre du jour, fenêtres de repas, début de soirée, durées par défaut, marge) et B5-PO-9 (temps libre minimal, seuil de 30 min). Une seule clé est facultative : `transfertAeroportMinutes` (nom indicatif, § 9). La formule de classement y est ajoutée en B5b (§ 1.4).
2. **Valeurs** : un seul fichier, `src/server/config/moteur.json`. Il est lu par `src/server/config/moteur.ts` (`import "server-only"`, validation au chargement, sur le modèle de `offer.ts`) pour la production, et par `scripts/p0/fichiers.ts` (`node:fs`, déjà permis là, puis validation par le même schéma) pour P0. Raisons : `server-only` interdit à `pnpm p0` de charger le module (`eslint.config.mjs:431-439`), et la spécification exige une seule copie des valeurs. Lire un JSON n'est pas charger un module de `src/server` : la règle `ligne/no-p0-server-modules` n'est pas touchée.
3. Les constantes `squelette.ts:14-26` et `BUDGET_TRAJET_PAR_RYTHME` (`src/prototype/brief.ts:14`) disparaissent ; `src/domain` n'importe jamais `@/server/config/*` (§ 3).
4. La formule de classement reste dans `prototype/config/classement.json` tant que P0 tourne (ia-recherche, 0032 A2). Le jour où la génération de production la consomme (B9), elle passe dans `moteur.json` et P0 la lit là : une seule source à tout moment.

**Ce que B5a doit tester.** Test nommé par la PR (par exemple `configuration du moteur: valeur absente ou hors bornes refusée`) : chaque clé obligatoire absente (toutes sauf `transfertAeroportMinutes`, § 9), une valeur hors bornes, une clé inconnue et un `schema` différent sont refusés ; `moteur.json` commité passe ; le module serveur et `scripts/p0` donnent le même objet validé ; `transfertAeroportMinutes` absente comme présente est acceptée (cas du § 9).

### 5. B5-TL-5 — Refus typés : accordé, noms fixés ; requis pour B5c
1. Résultat du moteur : `{ ok: true, … } | { ok: false, code }`, énumération fermée `REFUS_MOTEUR` dans `src/domain` : `version_conflict`, `unknown_stop`, `unknown_candidate`, `out_of_trip`, `locked_stop`, `no_effect`, `no_option`, `invalid_revert` (noms de la spécification, retenus tels quels). Aucun détail, sauf `currentVersion` sur `version_conflict`, nécessaire à `ApiError` (`backend.md`, § 4 « Concurrence »).
2. `candidateId` : chaîne opaque pour le moteur ; le contrat (`uuid`, `patch.ts:26`) ne change pas ; `scripts/p0` garde `c_\d{3}`.
3. Une seule fonction de `src/domain` convertit `version_conflict` en `ApiError` validée par `ApiErrorSchema`. Elle est livrée **avec R10 en B5a** (ajustement de périmètre, 0041 point 4) ; B5c la réutilise. Les autres codes sont convertis par B11, qui ajoute à `API_ERROR_CODES`, par une PR de contrat distincte, ce qui manque (`no_option` compris).

**Ce que B5a doit tester.** `validation: R10 patch sur sa version de base` : cas conforme (même version) et cas en violation (`{ ok: false, code: "version_conflict", currentVersion }`), et la conversion passe `ApiErrorSchema` avec `retryable: true`. Les autres codes sont testés en B5c (`patch: refus typés`).

### 6. B5-TL-6 — Une seule définition de R3 : accordé, sans seconde copie
1. R3 est une fonction pure d'un fichier à part, `src/domain/verrous.ts` (nom libre), qui n'importe que `@/contracts` : `(base: readonly Day[], brouillon: readonly Day[]) → identifiants d'étapes`, selon B5-PO-11 (définition de `lockedStopViolations` étendue au `placeId` ; seules les étapes `locked: true`). Le validateur R3 du rapport l'appelle.
2. **En B11**, le serveur (`applyPatch`, aperçus de révision) importe cette fonction ; la copie locale `lockedStopViolations` (`src/features/sejour/revision.ts:52`) disparaît avec l'implémentation en mémoire quand B11 branche le serveur derrière `src/adapters` (0016 l. 158), et l'interface reçoit le refus `lockedStop` (0016 l. 129). C'est ce que prévoit 0016 § 4.2 (l. 116). **Aucune exception** au graphe de l'application de 0032 (`imports.test.ts:889-900`) : l'interface n'importe jamais `@/domain`, ce qui respecte B5-TL-6 (« Aucune règle d'import nouvelle pour l'interface »). Il n'y a donc jamais deux copies tenues égales par un test.
3. D'ici B11, l'écart sur le `placeId` entre la copie de l'interface et la fonction du moteur est toléré (spécification, « État de départ ») ; B5 ne modifie pas `revision.ts`.

**Ce que B5a doit tester.** `validation: R3 étapes verrouillées inchangées` reprend les cas de `revision.test.ts:89` (étape verrouillée déplacée, supprimée, copiée dans un autre jour), plus le changement de `placeId`, l'engagement verrouillé (contrôlé), l'engagement déverrouillé (non contrôlé) et l'étape verrouillée sans `commitment` ; un test vérifie que le graphe de `src/domain/verrous.ts` ne contient que `src/contracts` et `zod`.

### 7. Question 4 de la spécification (Q333) — Excursions
Décision de forme : un marqueur d'excursion sera **au niveau du jour** (`Day`), pas de l'étape, parce qu'une excursion occupe la journée entière (cadrage § 6.5 étape 5) et que le budget « hors excursion » est un budget du jour (`Day.travelBudgetMinutes`). Il n'est **pas ajouté maintenant** : aucune règle fonctionnelle ne dit encore ce qu'est une excursion. Il viendra par une PR de contrat distincte quand le Product Owner l'aura spécifié. D'ici là, B5-PO-2 s'applique (tous les trajets comptent). Aucun effet sur les tests de B5a.

### 8. Question 5 de la spécification (Q333) — Conflit entre deux étapes verrouillées
Côté moteur (Tech Lead) : le conflit est une entrée `R5` du rapport sur l'étape d'arrivée, sans sous-code (le rapport reste à codes fermés). Son caractère **non bloquant** se déduit du programme : une entrée `R5` dont l'étape d'arrivée et l'élément précédent du jour sont tous deux `locked` ne bloque pas la production de la version (B5-PO-6) ; la fonction qui décide « bloquant ou non » est dans `src/domain`. Côté contrat : **aucun champ stocké**, jamais. Le conflit dépend de durées dérivées de Google (0011 point 5) : s'il faut le montrer, c'est une marque calculée à la lecture par B8, comme `toConfirm`. L'affichage (badge, texte) reste à UX/UI (question ouverte).

**Ce que B5a doit tester.** `validation: R5 trajets faisables avec marge` : deux étapes verrouillées incompatibles produisent une entrée `R5` et la fonction « bloquant » répond non ; une étape non verrouillée trop proche produit une entrée `R5` bloquante.

### 9. Question 6 de la spécification (Q333) — Transfert entre l'aéroport et le logement
Décision de forme : une **durée forfaitaire dans la configuration du moteur** (§ 4), pas un champ de `TripCommitment`. Un `placeId` d'aéroport demanderait un ancrage (appel Places) et une donnée de plus à stocker, pour un gain de précision faible au MVP. La valeur (par sens, ou une seule) est un détail fonctionnel : Product Owner (question ouverte). La clé `transfertAeroportMinutes` (nom indicatif) est **facultative** dans le schéma strict de `configuration.ts` (§ 4.1) : tant que le Product Owner ne l'a pas fixée, elle est absente de `moteur.json` et B5-PO-12 s'applique (transfert non compté).

**Ce que B5a doit tester.** La clé est exclue du cas « clé obligatoire absente refusée » (§ 4) ; un cas `configuration du moteur: transfert aéroport facultatif` vérifie qu'une configuration sans la clé et une configuration avec une valeur dans les bornes passent toutes deux. L'effet de la valeur sur le premier et le dernier jour (B5-PO-12) est testé par la PR qui l'utilise, après la réponse du Product Owner.

### 10. Question 8 de la spécification (Q337) — Réduction du budget de trajet comme version
1. **Écriture** : une nouvelle opération de `TripPatch`, seule dans son patch comme `revert`, de forme `{ op: "travelBudget", reduced: boolean }`, appliquée par le moteur à **tous les jours** (B5-PO-3) : `Day.travelBudgetMinutes` = budget de la configuration pour le rythme, réduit si `reduced`. Rejetée : l'écriture directe de `travelBudgetMinutes` par B10, qui créerait un second chemin d'écriture des versions, sans patch (`business.ts:166`), hors de R10 et de l'historique.
2. **État « déjà réduit »** : il vit **dans l'instantané**, champ de niveau voyage `travelBudgetReduced` (booléen, absent = faux), hors de la liste blanche du partage. Rejetés : une colonne de `trips` (désynchronisée par un `revert`) et une déduction depuis `travelBudgetMinutes` (copie de la configuration au moment de la planification, `backend.md:337` : un changement de configuration la rendrait fausse). Le moteur le lit dans l'instantané de base (B5-PO-3 : reçu en entrée, jamais stocké par lui) ; `travelBudget` avec `reduced` égal à l'état courant est refusé `no_effect`, ce qui tient le critère de B10 « la deuxième réponse oui ne réduit pas une seconde fois » sur une même version.
3. **Après `revert`** : `revert` recopie l'instantané (B5-PO-14), donc l'état et les budgets reviennent ensemble à ceux de `toVersion`, sans règle particulière. Conséquence : si `toVersion` précède la réduction, `travelBudgetReduced` revient à faux et le moteur accepte de nouveau `travelBudget` avec `reduced: true` ; **la réduction peut donc, de fait, être redemandée après un `revert`**. Si le Product Owner veut l'interdire (Q41), la contrainte est posée en B10, côté question posée à la personne (lecture de `preference_signals`), sans changer le moteur. Le signal `travelReduction` de `preference_signals` reste le journal de la réponse (B10) ; s'il doit passer à `cancelled` après une annulation, et si la question peut être reposée, c'est Q41 (Product Owner).
4. **Contrat** : l'opération et le champ arrivent par une PR de contrat distincte, avant B10, qui modifie `TripPatchSchema` (opération `travelBudget`), `TripSnapshotSchema` (champ `travelBudgetReduced`), `db/jsonb-keys.ts` et la liste blanche du partage (`src/contracts/share.ts`, où le champ reste exclu, avec un test qui le vérifie). Le CEO l'ordonne dans le backlog avant B10 (rôle `back`, revue Tech Lead). **B5 ne modifie pas `src/contracts`.**

**Ce que B5a doit tester.** `moteur: budget réduit 60 → 45, 90 → 65, 150 → 110, une seule fois` : la fonction pure de réduction sur les trois valeurs ; la fonction « budgets du voyage » (rythme, configuration, état déjà réduit) réduit tous les jours ; avec l'état déjà réduit, une seconde réduction ne change rien. L'opération `travelBudget` n'est pas dans B5.

### 11. Question 9 de la spécification (Q338) — « R1 à R10 testées à 100 % »
1. **Lecture retenue : par cas, pas par seuil.** Chaque règle a au moins un cas conforme et un cas en violation, plus chaque sous-cas nommé par son critère d'acceptation (par exemple R5 : marge, durée inconnue, conflit verrouillé). La PR qui livre une règle livre ses cas.
2. **Aucun seuil de couverture de code** pour B5. Un taux de lignes ne prouve pas qu'une règle est juste, et il faudrait une dépendance nouvelle (`@vitest/coverage-v8`) sans gain mesurable aujourd'hui. Revoir à B11 si une règle passe la revue sans cas de violation.
3. **Garde mécanique** : les cas des règles sont une table typée `Record<CodeRegle, { conforme, violation }>` (`CodeRegle` = `R1` à `R10`) : le compilateur refuse une règle oubliée, et le test vérifie que chaque cas en violation produit une entrée de **sa** règle et que chaque cas conforme n'en produit aucune.

**Ce que B5a doit tester.** La table ci-dessus, en plus des tests nommés `validation: R1` à `R10`. Pour R9, le cas en violation est une erreur de **calcul** du budget (B5-PO-10), pas un test de conformité de forme : un programme dont `budgetPerPerson` diffère de la somme des `costPerPerson` connus, ou est présent alors qu'un coût est inconnu, produit une entrée `R9` ; le cas conforme a la somme exacte, ou l'absence quand un coût manque.

## Conséquences
- B5a peut s'ouvrir à la fusion de cette décision (prérequis B5-TL-1 à TL-4 de 0041) ; elle cite cette décision et liste ses écarts. B5c a son prérequis B5-TL-5. TL-6 est tranchée avant la revue de B5a.
- Deux PR de contrat distinctes sont annoncées, hors B5 : celle de B11 (codes de refus dans `API_ERROR_CODES`) et celle d'avant B10 (opération `travelBudget`, champ `travelBudgetReduced`). Le CEO les ordonne.
- Le graphe de l'application (`imports.test.ts:889-900`) ne change pas : aucune exception pour `@/domain` (§ 6).

## Questions ouvertes (non tranchées ici)
- **Product Owner** : définition fonctionnelle d'une excursion (§ 7) ; bloque le marqueur de jour, pas B5.
- **UX/UI** : affichage d'un conflit entre deux étapes verrouillées (§ 8, question 5 de la spécification) ; bloque l'affichage, pas B5.
- **Product Owner** : valeur du transfert forfaitaire entre l'aéroport et le logement (§ 9) ; bloque la précision des jours d'arrivée et de départ, pas B5.
- **Product Owner, Q41** : la réduction peut-elle être redemandée après annulation, et le signal `travelReduction` passe-t-il à `cancelled` après un `revert` (§ 10.3) ; bloque B10.
- **Samuel, Q332** (question 1 de la spécification, R1 d'un lieu ajouté par la personne) : inchangée ; le validateur prend la portée en paramètre.

## Quand revoir cette décision
- Si l'adaptateur de `scripts/p0` ne peut pas garder la sortie simulée de `pnpm p0` égale sans toucher `src/ai` ou `src/research`.
- Si B8 ne peut pas fournir les relectures avant l'appel du moteur (interfaces synchrones).
- À la fin de P0 (retrait de la ligne `src/domain` de `imports.test.ts`, formule de classement dans `moteur.json`).
