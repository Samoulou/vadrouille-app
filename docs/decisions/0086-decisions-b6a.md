# 0086 — Préalables de B6a : B6-TL-1 à B6-TL-11 et questions au Tech Lead de la spécification B6

Statut : décision déléguée (architecture, interfaces, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel 6 heures après sa fusion (décision 0068). **N'entrent pas dans ce régime** et restent des questions : les verdicts de la Sécurité (positions, journal, cadre des actions, garde, chemins gardés : § 4) et les réponses du rôle data (§ 5). Le Tech Lead donne sa position sur ces points ; il ne les tranche pas.

Date : 2026-10-18 · Décideur : Tech Lead · Ticket : #466 · Spécification : `specs/B6-api-lecture.md` (#308, ticket #304), sections « Propositions au Tech Lead » (B6-TL-1 à B6-TL-11 ; B6-TL-12 retirée) et « Questions ouvertes », questions 1 à 13 au Tech Lead · Découpage : 0059 § 1 (B6a attend « B6-TL-1 à B6-TL-6, B6-TL-9 et B6-TL-11 ») et § 5 (une seule recomposition, une seule lecture de `place_coordinates`)

État vérifié sur `main` `631082e` (2026-10-18) : B3b (#446), B3b-envoi (#437), B3c (#452), B8c (#442) et B8a (#464) sont fusionnées ; B6a ne l'est pas (aucun `src/server/voyages/`, aucun `SourceRelectures`) ; `main` porte 0001 à 0085 ; la seule PR ouverte (#460) ne touche que `.github/workflows/db-migrate.yml`. Code relu : `src/server/with-org.ts`, `src/server/positions/{lecture,cache-positions}.ts`, `src/server/relecture/relectures.ts`, `src/domain/{relectures,calculs}.ts`, `src/contracts/{map,values,trip}.ts`, `src/server/log.ts`, `src/adapters/index.ts`, `eslint.config.mjs`, `tests/unit/p0/imports.test.ts`, `tests/support/auth-contrat.ts`, `tests/db/helpers.ts`, `playwright.config.ts`.

**Amende, sans les réécrire** (renvoi ajouté en tête de chacune) :
- **0048 § 1** (frontière « `src/domain` n'est atteint que par `src/server` ») : une arête de plus, en `import type` seulement, depuis le double de relectures (§ 1.2 point 4) ;
- **0059 § 1**, colonne « Fichiers » de B6a : la suite de contrat commune vit dans `tests/support/`, pas dans `src/adapters/contract.suite.ts` (§ 1.5) ;
- **0015 § 3** (« sélection de B6 dans la réserve ») et **0016 § 12** point 1 (« lieux déjà trouvés et ancrés par l'agent (B6) ») : § 3, questions 3 et 4.

## Contexte
La spécification B6 renvoie au Tech Lead onze propositions et treize questions. 0059 § 1 en exige huit avant le code de B6a ; les autres (B6-TL-7, TL-8, TL-10) bloquent B6b et sont tranchées ici aussi, pour que le ticket de B6b ne les attende pas. Principe appliqué : **l'agent cherche, l'ancrage vérifie, le moteur planifie** ; l'assemblage d'un `Day` et d'une `Proposal` est écrit **une fois**, dans `src/domain`, et B8b ne fournit que les relectures (0059 § 5 point 2).

Constats sur le code fusionné, que la spécification (écrite avant B3b, B8c et B8a) ne pouvait pas faire :
1. `withOrg` exécute déjà une requête (`SELECT set_config(…)`) avant le rappel (`src/server/with-org.ts`). `SET TRANSACTION READ ONLY` vient donc en **deuxième** instruction. Postgres l'admet : seul le passage d'une transaction en lecture-écriture après sa première requête est refusé, jamais le passage en lecture seule. `executeurSql(tx)` (même fichier) donne l'exécuteur structurel attendu par `lirePositions`.
2. La lecture du cache existe : `lirePositions(executeur, placeIds)` (`src/server/positions/lecture.ts`, B8c, 0060 § 1.2), sans filtre d'organisation (la RLS seule). 0060 § 1.4 interdit tout autre littéral `place_coordinates` dans `src/` : B6a **importe** cette fonction et n'écrit aucune autre requête sur la table, ni jointure.
3. Le test du graphe (`tests/unit/p0/imports.test.ts`, `violationsApplication`) compte les `import type` comme des arêtes et refuse tout chemin vers `src/domain/` qui ne passe pas par `src/server/` (0048 § 1). Un double de `src/mocks` qui importe le type de `src/domain/relectures.ts` serait refusé. Précédent : l'arête admise vers `src/grounding/port-positions.ts`, en `import type` seulement (0060 § 1.4, `areteAdmise`).
4. B3c a déjà posé la forme d'une suite de contrat commune : `tests/support/auth-contrat.ts`, exécutée par `tests/unit/adapters/auth-contrat.test.ts` (`pnpm test`) et `tests/db/auth-contrat.test.ts` (`pnpm test:db`), sans aucune exception de lint, de confinement ni de build.
5. `versRelectures` (B8a, 0085 § 1.7) prend `logementsParNuit: readonly string[]` et rend exactement `Relectures` ; `@/server/relecture/*` n'est importable que par `src/server/composition/generation.ts` et les tests (0085 § 1.8).
6. 0081 (B9-TL-6) tranche déjà trois points posés au rôle data : fuseau obligatoire par `CHECK (time_zone IS NOT NULL) NOT VALID` (d) ; nouvelle colonne `briefs.mobility` en `text[]` écrite par B9 (e) ; `stays.to_date` borne exclusive (f). Elle ajoute `stays.kind = 'none'` et `stays.city` (a, c).
7. `src/adapters/index.ts` importe déjà statiquement des modules serveur (`@/server/config/offer`, qui porte `import "server-only"`, et `./better-auth`) ; aucun composant client n'importe `@/adapters`.
8. `API_ERROR_CODES` contient `unauthenticated` (F8c) mais pas `internal` (`src/contracts/values.ts`).
9. `createOrg` (`tests/db/helpers.ts`) crée personne, organisation personnelle et adhésion `owner` sous `vadrouille_auth`, le rôle de B3b, sans contourner l'invariant « exactement un propriétaire ».

## Décision

### 1. Préalables de B6a

#### 1.1 B6-TL-1 — Emplacement des cas d'usage et règle d'import : **retenue**
1. Cas d'usage dans `src/server/voyages/` (`import "server-only"` sur chaque module ; noms de fichiers libres, ceux de la spécification conseillés). C'est le seul point d'entrée de lecture des voyages pour l'adaptateur `api`, le cadre des actions (§ 2.2) et les tâches suivantes (B4b, B11, B12).
2. Règle ESLint et son test (`tests/unit/lint/`) telles que B6a point 9 : hors de `src/server`, seul `src/adapters/api.ts` importe `@/server/voyages/*` ; `tests/support` est refusé ; les `*.test.ts` de `src/server/voyages/` et `tests/db/` restent permis. Aucun amendement de 0017 § 3.3 ni de 0020 § 11.
3. **Point à trancher de B6-TL-1** : `getTripAdapter` (B6b) importe `./api` **statiquement**, comme `@/server/config/offer` et `./better-auth` aujourd'hui (constat 7). Pas d'import dynamique : il cacherait l'arête au test du graphe sans rien protéger de plus. La garantie reste la règle des composants clients et le `server-only` des modules de `src/server/voyages/`, qui casse le build s'ils entrent dans un paquet client.
4. `src/server/voyages/` n'importe ni `@/server/relecture/*` (0085 § 1.8), ni `@/grounding/*` hors de `import type { … } from "@/grounding/port-positions"` (0060 § 1.4), ni `@/mocks/*` (règle existante : `src/mocks` n'est importé que par `src/adapters` et les tests). Le double de relectures est **injecté** par la fabrique de l'adaptateur.

#### 1.2 B6-TL-2 — Port de relectures et assemblage pur : **retenue**, variante (c), avec la forme ci-dessous
1. **Assemblage unique** dans `src/domain` (noms libres, par exemple `recomposerJour`, `recomposerProposition`) : fonctions pures sur les fonctions de B5 (`destinationColor`, `voisins`, `optionDeRepas`, `budgetParPersonne`, `pointsDuJour`, `minutesDeTrajet`, `aConfirmer`, `modesAdmis`, `logementsDuJour`), jamais recopiées. Ce sont **les** fonctions `recomposerJour` et `recomposerProposition` que la spécification B8 (B8b point 1) attribuait à `src/server/relecture/recomposer.ts` : B8b ne les réécrit pas et n'implémente que le port (0059 § 5 point 2). Amendement de la « Partie Q5 » § 5 du handover, porté par B6a : l'assemblage est dans `src/domain`, `src/grounding` ne fournit que les relectures.
2. **Demande calculée par le moteur.** Une fonction pure de `src/domain` (nom libre, par exemple `demandeDeRelectures`) calcule, depuis les jours de l'instantané demandés, les propositions et le nombre de nuits, **tout ce que l'assemblage lira** : les `placeId` et leurs dates (`validite`, `plages`, pour `toConfirm` et `verifiedAt`) ; les couples de points (`Point` de B5, résolus par `pointsDuJour` et par la règle de B6-PO-4) avec leurs modes : mode stocké pour chaque `Segment` et pour `travelFromPrevious`, modes admis (`modesAdmis` de la mobilité lue) pour `minutesDeTrajet`. Un jour en préparation (§ 1.7) n'y entre pas. Cette fonction et l'assemblage partagent les mêmes fonctions de points : la demande ne peut pas diverger de ce qui est lu. Raison : B8b saura exactement quelles fiches et quels trajets charger (`chargerFiches`, `chargerTrajets`), sans reconstruire les points du jour une seconde fois.
3. **Type du port**, déclaré dans `src/domain/relectures.ts` à côté de `Relectures` (déclarations de type seules, aucune entrée-sortie). Les noms `SourceRelectures` et `pour` sont fixés ; les autres noms sont libres, la forme est fixée :
   ```ts
   export type VoyageARelire = {
     /** `stays.place_id` de chaque nuit (B6-PO-17), index 0 = première nuit ; `null` : logement sans lieu. */
     readonly logementsParNuit: readonly (string | null)[];
   };
   export type DemandeRelectures = {
     readonly lieux: readonly { readonly placeId: string; readonly dates: readonly string[] }[];
     readonly trajets: readonly { readonly depuis: Point; readonly vers: Point; readonly modes: readonly ModeTrajet[] }[];
   };
   export type RefusRelectures = "quota_reached" | "unavailable";
   export type SourceRelectures = {
     pour(voyage: VoyageARelire, demande: DemandeRelectures): Promise<{ readonly ok: true; readonly relectures: Relectures } | { readonly ok: false; readonly refus: RefusRelectures }>;
   };
   ```
   - **Un appel par lecture** : `getDay` et `listProposals` appellent `pour` une fois ; `getTrip` une fois pour tous ses jours mesurés, jamais une fois par jour. `listTrips`, `getDayMap` et `getTripMap` ne l'appellent jamais (B6-PO-18 et critère `lecture: Mes voyages ne relit rien`). Aucune valeur relue n'est gardée entre deux appels ni dans un cache de module.
   - **Refus** : rendu, jamais levé. Une exception levée par le port est traitée comme `unavailable`. Le cas d'usage lève alors son erreur fermée (B6a point 10), sans durée ni plage inventée.
   - **Compatibilité avec `versRelectures`** (0085, « Quand revoir ») : B8b passe `logementsParNuit` à `versRelectures` après avoir résolu chaque `null`. La résolution d'un logement sans lieu (`neighbourhood`, `none`) est à B8b (question 11, § 3). B8b peut **ajouter** un champ à `VoyageARelire` (par exemple la ville de la nuit, `stays.city` de 0081) sans changer les champs ci-dessus ; le double l'ignore.
   - `estimee`, rendue par `duree`, n'est lue par aucune sortie de B6 (B6-PO-4) ; la règle d'affichage d'une durée estimée reste la question 9 (§ 3).
4. **Double simulé** : un seul, `src/mocks/relectures-voyages.ts`, nouveau fichier ; aucun fichier existant de `src/mocks` modifié. Il est indexé par `placeId` (`validite`, `plages` par date) et par triplet (`placeId`, `placeId`, mode) (`duree`), un logement étant résolu par `logementsParNuit` ; jamais par voyage, organisation ni version. Il compte ses appels, simule `quota_reached` et `unavailable`, et **ne répond qu'à ce que la demande contient** : hors demande, `inconnu`. Ainsi, un voyage converti qui se recompose à l'identique prouve que la demande est complète, ce dont B8b dépend. Il importe de `@/domain/relectures` **en `import type` seulement** : le littéral `"inconnu"` suffit pour la valeur.
   - **Arête admise (amende 0048 § 1)** : `src/mocks/relectures-voyages.ts` → `src/domain/relectures.ts`, `import type` seulement. B6a l'ajoute à `areteAdmise` (`tests/unit/p0/imports.test.ts`) sur le modèle de `PORT_POSITIONS`, avec deux cas de test : l'arête de type est admise, un import de valeur depuis ce même fichier est refusé (règle `no-restricted-imports` avec `allowTypeImports`, ou équivalent, plus son test sous `tests/unit/lint/`). Aucun autre fichier de l'application n'atteint `src/domain` hors de `src/server` : `src/adapters/api.ts` reçoit le type par `@/server/voyages/*` (réexport de type), la suite et les données de test vivent sous `tests/support/`, hors du graphe de l'application.
   - La variante `allowTypeImports` sur `@/server/voyages/*` (type laissé dans `src/server/voyages/`) n'est pas retenue : elle ouvrirait au double une arête vers `src/server`, que la règle de B6a point 9 veut fermée.

#### 1.3 B6-TL-3 — Positions depuis `place_coordinates` : **position du Tech Lead favorable, verdict de la Sécurité dans la PR de B6a**
1. `getDayMap` et `getTripMap` lisent par `lirePositions(executeurSql(tx), placeIds)` (constats 1 et 2). Une seule lecture par appel de `getTripMap` pour tous les jours (lots de 500 internes à `lirePositions`) : le nombre de requêtes ne dépend pas du nombre de jours. Point absent si la coordonnée manque ; jour sans aucun point : `null`.
2. `placeId` demandés : ceux des étapes du jour de l'instantané et ceux des logements de départ et d'arrivée du jour (`stays.place_id`, B6-PO-17). Aucun appel au port de relectures, aucune lecture de `proposals` ni de `checklist_items`.
3. `EchecPositions` (`entree_invalide`, `base`) devient l'erreur fermée de lecture (`reason` `output_invalid` ou le code fixé par la Sécurité, § 4) ; aucun `placeId` ni coordonnée n'est journalisé (0060 § 1.2).
4. Les données de test écrivent leurs coordonnées fabriquées par `store_place_coordinates`, sous `vadrouille_app` avec le contexte de l'organisation, depuis `tests/support/` seulement (0060 § 1.4 l'admet).
5. **Verdict de la Sécurité** (question 2 à la Sécurité) : requis avant la fusion de B6a, pas avant son code.

#### 1.4 B6-TL-4 — Transactions : **retenue** (première option ; question 7)
1. Une transaction `withOrg` par appel d'adaptateur. `SET TRANSACTION READ ONLY` en **première instruction du rappel** (deuxième de la transaction, constat 1), sans modifier `withOrg` ni sa signature. L'option `{ readOnly: true }` de `withOrg` n'est pas retenue.
2. Le critère `lecture: une transaction de lecture n'écrit pas` exerce le chemin réel : une écriture tentée dans le rappel d'un cas d'usage échoue (SQLSTATE `25006`).
3. **Double vérification** (cadrage § 9) : chaque requête de `src/server/voyages/` porte `organization_id = $n`, lié à `ctx.organizationId`, **sauf** la lecture des positions, qui reste sous la seule RLS par 0060 § 1.2. Aucun paramètre ni option qui retire ce filtre. Le test d'isolation vérifie la RLS seule par des requêtes SQL sans filtre écrites **dans le test**, sous `withOrg`, une par table lue.
4. **Nombre de requêtes borné** : `listTrips` en un nombre constant de requêtes, quel que soit le nombre de voyages ; la chaîne des parents en une requête récursive (B6-PO-6) ; aucune requête par jour.

#### 1.5 B6-TL-5 — Forme de la suite de contrat : **variante retenue, `tests/support/`** (question 10 ; amende 0059 § 1)
1. La suite vit dans **`tests/support/trip-adapter-contrat.ts`** (nom libre sous `tests/support/`), sur le modèle de `tests/support/auth-contrat.ts` (constat 4). Elle exporte une fonction (nom libre) qui décrit les cas sur un adaptateur et un jeu de références (`preparer()` : adaptateur, contexte de l'organisation, contexte d'une autre organisation, identifiants attendus).
2. Elle est exécutée par `tests/unit/adapters/trip-adapter-contrat.test.ts` sur `mock` (`pnpm test`) et par `tests/db/adaptateur-api.test.ts` sur `api` (`pnpm test:db`) ; noms libres. Même liste de cas des deux côtés ; les cas propres à un adaptateur restent hors de la suite.
3. Raisons : aucune exception à trois contrôles (lint des imports de test, confinement, `next build`) ; aucun module qui importe `vitest` sous `src/` ; précédent déjà relu par la Sécurité. `src/adapters/contract.suite.ts` n'est pas créé, et le critère qui le nommait se lit : « la suite n'est importée que par ses deux fichiers d'exécution ».
4. **Amendement du handover § 11** (ligne « Suite de contrat commune », qui nomme `src/adapters/contract.suite.ts`), porté par B6a avec celui de B6-PO-15.
5. `tests/support/**` est un chemin gardé (P0c section 8), comme `src/adapters/contract.suite.ts` ne l'aurait pas été : la suite passe donc sous la revue de la Sécurité à la revue consolidée de B6a (§ 4 point 3), ce que le Tech Lead juge préférable pour un module qui fixe les cas d'isolation.

#### 1.6 B6-TL-6 — Données de test en base : **retenue** (question 13)
1. Module `tests/support/voyages-en-base.ts` (nom libre), selon les règles de conversion de B6a point 7 telles qu'écrites (`placeId` sentinelles `test_place_<id>`, logements `test_place_logement_<voyage>`, coordonnées d'Édimbourg seulement, mobilité `null`, `estimated` recopié, J6 du voyage débloqué servi comme un jour en préparation, contrôles préalables, deux écarts connus et pas d'autre).
2. **Organisations et personnes** : par le chemin de B3b (`vadrouille_auth`). B6a **réutilise** `createOrg` de `tests/db/helpers.ts` ; si le module de `tests/support/` en a besoin, la fonction y est déplacée telle quelle et importée par les deux, sans changer aucune attente (même forme que 0050 pour `workflow-steps.ts`). Aucune seconde implémentation. Réponse de data attendue (question 3 à data, § 5).
3. **Droit** `tripUnlocked` par `vadrouille_webhook` (`SET LOCAL ROLE`, comme `seedOrganization`) ; le reste sous `vadrouille_app` avec le contexte de l'organisation ; instantanés validés par `TripSnapshotSchema`, propositions par `ProposalRecordSchema` avant l'insertion.
4. Le module construit aussi le double correspondant (§ 1.2 point 4). Aucune commande de semis dans l'application ni dans `package.json`. Les données de bout en bout de B6b passent par le même module (§ 2.3).
5. **Suite avec B9b** (0081 B9-TL-6 d, e) : quand B9b pose `CHECK (time_zone IS NOT NULL) NOT VALID` et la colonne `briefs.mobility` en `text[]`, B9b met à jour ce module et les tests de B6a qui en dépendent. Le cas « voyage visible au fuseau nul » du critère `lecture: Mes voyages et un fuseau manquant` ne peut plus être inséré : B9b le remplace par le refus de l'insertion par la base, et garde la levée de `listTrips` sur un fuseau nul couverte par un test sans base de la fonction de conversion. Ce n'est pas la suppression d'un test sans décision : cette décision le prévoit.

#### 1.7 B6-TL-9 — Jours « en génération » : **retenue**
Pendant une exécution `full` ou `batch` non terminée de l'organisation pour ce voyage, `generating` est vrai pour les jours de la version courante qui n'ont **aucun élément de type `stop`**. La règle couvre la forme d'un jour pas encore planifié que fixe B9 (B9-PO-6, 0081 B9-TL-13 : termini de logement seuls) comme celle des données de test (aucun élément). B9 la réécrit seulement si son workflow publie autrement.

#### 1.8 B6-TL-11 — Contrôle des cartes sans recomposition : **(a) retenue** (question 8)
B6a élargit le type du paramètre `day` de `validateDayMap` (`src/contracts/map.ts`) au minimum structurel lu (`index`, et des `items` dont seuls `type` et, pour une étape, `stop.id` sont lus ; forme exacte libre), qui accepte `Day` et `DaySnapshot` sans assertion de type. Aucun changement de comportement ; les tests existants de `validateDayMap` passent sans modification de leurs attentes. L'option (b), un second contrôle dans `src/domain`, n'est pas retenue (duplication).

### 2. Préalables de B6b (tranchés ici pour que son ticket ne les attende pas)

#### 2.1 B6-TL-7 — Garde de l'adaptateur `api` : **retenue**
`getTripAdapter("api")` lève **à l'appel**, jamais à l'import, sauf si l'environnement résolu (`resolveServerEnvironment`) est `local` ou `ci`, que `AUTH_ADAPTER=better-auth` et qu'une source de relectures est configurée. Dans B6b, la seule source est le double de § 1.2 point 4. Aucun repli vers `mock`. B8 et la levée de Q25 amendent cette garde, par décision écrite. Verdict de la Sécurité : question 3 (§ 4).

#### 2.2 B6-TL-8 — Cadre des actions et `ChecklistUpdate` : **retenue**, emplacement précisé (question 1)
1. Le cadre (nom libre, par exemple `executerActionVoyage`) vit dans `src/server/voyages/` (fichier libre), et non dans `src/server/actions-voyage.ts` : tout accès aux voyages reste dans un seul dossier, couvert par la même règle d'import (§ 1.1). Il ne porte jamais `"use server"` ; les actions de `src/server/actions/` l'appellent. Ordre : contexte de session (`unauthenticated`), `parseInput` (schéma strict ; un champ `organizationId` ou `userId` dans l'entrée : `validation_failed`), `withOrg`, contrôle du voyage dans l'organisation (`not_found`, jamais `forbidden`), traitement, conversion de toute erreur en `ApiError` sans message de base (`not_found` ou `internal`).
2. **`ChecklistUpdate`** (`{ tripId, itemId, done }`, objet strict) est créé par B6b au lieu de B11 ; B6b met à jour la ligne du handover § 4 « Contrats à créer » et ajoute les lignes `ChecklistUpdate.*` au § 5.
3. **`internal`** est ajouté à `API_ERROR_CODES` par B6b, à la fin de la liste, sans renommer ni réordonner les codes existants (constat 8).
4. `toggleChecklistItem` dans `src/server/actions/sejour.ts` : nom retenu. Non branchée sur l'écran 11 (B6-PO-14).
5. Verdict de la Sécurité : question 1 (§ 4).

#### 2.3 B6-TL-10 — Bout en bout : **retenue**, second serveur
1. Les scénarios de B6b tournent sur un **serveur de plus** de `playwright.config.ts` (port décalé, `AUTH_ADAPTER=better-auth`, `DATA_ADAPTER=api`), démarré par la même variable d'outillage que le serveur `auth` de B3c (`E2E_AUTH_SERVER=1`), avec son propre projet (motif de fichiers distinct, par exemple `*.api.spec.ts`). Le serveur et les tests de B3c ne changent pas. Si le job `db` doit changer, la PR suit la porte `owner-approved` (0035).
2. Session ouverte par le code lu dans Mailpit (B3b-envoi, fusionnée, #437) ; données écrites par le processus de test pour l'organisation personnelle de la session, par le module du § 1.6 ; **aucune session forgée** (ni cookie fabriqué, ni insertion directe dans `sessions`).
3. Verdict de la Sécurité : question 3 (§ 4).

### 3. Autres questions au Tech Lead de la spécification
- **Question 1** (B6-TL-1 à B6-TL-10, amendement de la « Partie Q5 » § 5, `ChecklistUpdate`, `internal`) : § 1 et § 2.
- **Question 2** (exclusions du test des catégories) : **non** ; seul `TripSummary` sort des exclusions dans B6a et `ChecklistUpdate` entre avec ses lignes dans B6b ; les contrats de création restent exclus jusqu'à B9.
- **Question 3** (idée « Surprends-moi ») : la sélection est faite par la **génération** (`ideeDuJour` de B5b, B9) ; B6 lit `Day.surprise` tel que stocké. Renvoi ajouté en tête de 0015 par cette PR. Le commentaire de `SurpriseIdeaSchema` (`src/contracts/trip.ts`, « sélection de B6 ») est corrigé par la prochaine PR qui modifie `src/contracts/`, B6b au plus tard ; B6a ne le touche pas (périmètre de `src/contracts`).
- **Question 4** (recherche de lieux de l'ajout) : rattachée à **B11** (action de l'écran « Ajouter ») ; renvoi ajouté en tête de 0016.
- **Question 5** (B6b sans B3b-envoi) : sans objet, B3b-envoi est fusionnée ; la règle de 0059 § 5 point 4 (aucune session forgée, aucune fusion sans les scénarios) reste.
- **Questions 6, 7, 8, 10, 12, 13** : § 1.2 point 4, § 1.4, § 1.8, § 1.5, § 1.2 point 3 (variante (c)), § 1.6.
- **Question 9** (durée estimée par B8 pour un segment stocké `estimated: false`) : **non tranchée ici**. Elle l'est avec la forme de `recomposer.ts` (B8-TL-1, avant B8b, 0059 § 5 point 2) ; aucun contrat ne change dans B6. Ne bloque pas B6.
- **Question 11** (logement sans `place_id`) : **orientation**, tranchée avec la forme de `recomposer.ts` avant B8b. B9 n'impose pas de `place_id` à chaque ligne `stays` : 0081 crée `stays.kind = 'none'` et 0085 § 1.6 fait partir les trajets d'un logement `area` ou `none` du `placeId` de la ville. C'est donc B8b qui résout un `null` de `logementsParNuit` (§ 1.2 point 3). Dans B6, la règle de la spécification ne change pas : `inconnu`, donc `travel_unknown`, et pas de point sur la carte. Ne bloque pas B6.

### 4. Ce qui revient à la Sécurité (positions du Tech Lead, verdicts non rendus ici)
1. **Positions** (question 2, § 1.3) : position favorable. Bloque la fusion de B6a.
2. **Journal de B6a** (question 4 ; B6a point 10) : position **favorable** à la forme proposée, avec deux précisions. (a) Le champ `reason` est contrôlé par sa liste fermée dans `CONTROLES` de `src/server/log.ts` : une valeur hors liste est retirée, comme pour les autres champs. (b) Le refus du port est journalisé par le cas d'usage seul (`voyages.relecture_refused`, `reason` `quota_reached` ou `unavailable`), une fois par lecture. Le champ existant `cause` (noms de variables de proxy ou de TLS, 0058) n'est pas réutilisé. Bloque la fusion de B6a.
3. **Chemins gardés** touchés par B6a (P0c section 8) : `eslint.config.mjs`, `eslint-rules/**` si la règle d'import passe par le plugin `ligne`, et `tests/support/**` (suite de contrat et données de test). Ligne `- securite : **approuvé**` attendue sur la revue consolidée du head de fusion. L'arête admise du § 1.2 point 4 (`tests/unit/p0/imports.test.ts`) n'est pas un chemin gardé, mais elle élargit une frontière : la Sécurité est invitée à la relire dans la même revue. Bloque la fusion de B6a.
4. **Cadre des actions** (question 1, § 2.2) et **garde et bout en bout** (question 3, § 2.1 et § 2.3) : position favorable. `playwright.config.ts`, que B6b modifie, est un chemin gardé. Bloque la fusion de B6b.

### 5. Ce qui revient au rôle data (réponses attendues dans la PR de B6a, non tranchées ici)
1. **Question 1** (`time_zone` obligatoire) : déjà réglée par 0081 (B9-TL-6 d) ; conséquence pour les tests de B6a : § 1.6 point 5.
2. **Question 2** (index de lecture) : mesure dans la PR de B6a (plan d'exécution et durée, voyage à trois versions et chaîne de 50 versions). Ne bloque pas.
3. **Question 3** (création des organisations de test) : position du Tech Lead, `createOrg` sous `vadrouille_auth` (§ 1.6 point 2). Bloque les données de test de B6a.
4. **Question 4** (format de `briefs.mobility`) : la cible est fixée par 0081 (e) (`text[]`, par B9b). Reste, pour B6a, la lecture de l'ancienne colonne `text` : position du Tech Lead, une seule fonction de conversion, format à virgules dans l'ordre de `ORDRE_MODES`, `null` ou chaîne vide pour les trois modes, valeur inconnue = `mobility_invalid` ; B9b la remplace par la lecture de `text[]`. Bloque le critère `lecture: trajets` (modes admis), pas le reste de B6a.
5. **Question 5** (rattachement des nuits aux lignes `stays`) : la borne exclusive de `to_date` est retenue par 0081 (f) ; le critère `lecture: terminus rattachés aux logements` n'est plus conditionnel. Data peut le confirmer ; ne bloque pas.
6. **Question 6** (conversion des données de test) : position du Tech Lead, accepter (§ 1.6). Bloque le critère `lecture: l'adaptateur api recompose le voyage simulé`.

### 6. Cycles et ordre
- B6a modifie `eslint.config.mjs`, `tests/unit/lint/**`, `tests/unit/p0/imports.test.ts` et `src/server/log.ts` : elle n'est dans le même cycle qu'aucune PR qui touche ces fichiers (0060 § 1.4, 0085 § 1.11). Le CEO l'applique à l'assignation.
- Le **code** de B6a peut commencer dès la fusion de cette décision. Sa **fusion** attend la fin du délai de veto (6 heures après la fusion de cette décision, 0068), les verdicts de la Sécurité du § 4 points 1 à 3 et les réponses de data du § 5 points 3 et 6 (point 4 pour le seul critère des modes admis).
- B8b attend B6a (0059 § 4) et la forme de `recomposer.ts`, qui doit implémenter `SourceRelectures` tel que fixé au § 1.2 ; l'amendement de 0081 et de 0085 § 1.8 qui ouvrira `@/server/relecture/*` à la lecture est décidé avant B8b (0085 § 1.8), pas ici.

## Conséquences testables (en plus des critères B6a et B6b de la spécification)
- `relectures: la demande couvre l'assemblage` : sur les quatre voyages convertis, le double, qui ne répond qu'à la demande, permet de redonner les valeurs attendues ; un double privé d'une seule entrée de la demande fait lever une erreur fermée.
- `relectures: un appel par lecture` : `getTrip` d'un voyage de six jours appelle `pour` une fois ; `getDayMap`, `getTripMap` et `listTrips` jamais.
- `relectures: refus levé par le port` : une exception levée par `pour` donne l'erreur fermée de `unavailable`, sans message d'origine.
- `lecture: transaction en lecture seule après le contexte` : une écriture dans le rappel échoue (SQLSTATE `25006`) alors que `set_config` a déjà été exécuté.
- `lint: double de relectures, type seulement` : `import type` de `@/domain/relectures` admis dans `src/mocks/relectures-voyages.ts`, import de valeur refusé ; test du graphe : arête admise en type, aucun autre fichier de l'application hors de `src/server` n'atteint `src/domain`.
- `contrats: validateDayMap accepte un jour stocké` : appel avec un `DaySnapshot` sans assertion de type ; attentes existantes inchangées.
- Aucun littéral `place_coordinates` dans `src/server/voyages/` (garde existante de 0060 § 1.4, verte sans modification).

## Questions ouvertes (non tranchées ici)
1. **Sécurité** — Verdicts du § 4 : points 1 à 3 dans la PR de B6a, point 4 dans celle de B6b. Posées le 2026-10-18. Bloquent la fusion de la sous-tâche concernée, pas son code.
2. **data** — Réponses du § 5, points 3, 4 et 6, dans la PR de B6a. Posées le 2026-10-14 (spécification), reprises le 2026-10-18. Bloquent les données de test de B6a et deux critères.
3. **CEO** — Règle de cycle du § 6 ; renvois de tête de 0059 (§ 1) et de 0048 ajoutés par cette PR ; à la prochaine mise à jour du handover, ligne B6 du « Backlog » (`ChecklistUpdate` déplacé de B11 à B6b). Posée le 2026-10-18. Bloque l'assignation de B6a, pas son code.

## Quand revoir cette décision
Si la Sécurité refuse un point du § 4 ; si la forme de `recomposer.ts` (B8-TL-1, avant B8b) ne peut pas implémenter `SourceRelectures` tel que fixé au § 1.2 ; si B9 publie un jour pas encore planifié sous une autre forme que B9-PO-6 ; si B9b change 0081 (d) ou (e) ; si `withOrg` cesse d'exécuter `set_config` avant le rappel.
