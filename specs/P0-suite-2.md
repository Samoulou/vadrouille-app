# P0 (suite 2) — Exécutions réelles du prototype de recherche : base, lancement, lecture, exécutions et jugement G0

Rôle porteur : ia-recherche, avec revue Sécurité (ticket #173) · Rédaction : Product Owner · Date : 2026-10-13 · Ticket : #173 · Décisions : 0027, 0028, 0031 (découpage), 0034, 0011 et 0007 (stockage et rôles), 0009 (exécution durable), 0035 (`owner-approved`) · Suite de `specs/P0-suite-executions-reelles.md` (#172, cadre et P0r1), qui renvoie ici P0r2, P0r3, P0r4, P0a2, P0b2, P0a3, les valeurs des plafonds et la grille G0 (« Renvoyé à la spécification suivante »)

Cette spécification **ne lève pas le verrou** des exécutions réelles : il porte sur toutes les exigences d'entrée de #172 (1 à 7 et chaque point « Ainsi que »), chacune vérifiée dans la PR de la tâche qui la porte, avec un verdict explicite du rôle Sécurité **et** l'accord écrit de Samuel dans cette PR (`specs/P0-suite-executions-reelles.md`, « Verrou des exécutions réelles », repris sans changement). Aucune exécution réelle n'a lieu avant la fusion de P0r3 et de P0r4, exigences vérifiées.

## Objectif
Faire produire au prototype de recherche des programmes **réels** sur Édimbourg (puis Zakynthos), par le chemin du MVP (préversion Vercel protégée, base Neon, Workflow SDK), et permettre à Samuel de les parcourir et de les juger avec la grille G0, sans qu'aucun agent ne lise un programme réel et dans les plafonds d'argent qu'il a fixés.

À la fin de cette suite, Samuel dispose, pour chacun des trois briefs de référence d'Édimbourg, de deux exécutions de la variante B et d'une de la variante A, d'un bilan chiffré des critères A et B, et peut prendre la décision G0 (décision réservée à Samuel : phases G0 à G3, `docs/CONTEXT.md`).

## Réponses de Samuel reportées ici
Telles que `QUESTIONS.md` les consigne (le CEO les a consignées ; cette PR ne modifie pas `QUESTIONS.md`).

| Question | Réponse de Samuel | Où elle s'applique |
|---|---|---|
| **Q268** (P0-Q16) — réglages pour les exécutions réelles | 2026-10-13, 07:00 UTC, « je suis toutes tes recos » : **oui ; le studio fait les réglages** (branche d'essais, interrupteur « essais réels » `P0_REAL_RUNS` et code d'accès `P0_RUN_TOKEN`, **sur les préversions seulement**), pas Samuel | P0r3, « Réglages faits par le studio » |
| **Q269** (P0-Q17) — purge planifiée | Même message : **oui à la purge quotidienne des programmes de test de plus de 30 jours**, par un job GitHub planifié, avec un **accès à la base limité à la suppression** | P0r2, « Purge » |
| **Q270** (P0-Q18) — plafonds qui engagent de l'argent | Même message : **3 USD par exécution, 80 USD (modèles) et 40 USD (Google) jusqu'à G0** | P0r3, « Plafonds » ; grille G0, A7 |
| **Q236** (P0-Q6) — seuils de la grille G0 | 2026-10-12, 14:11 CEST (12:11 UTC), « je suis tes reco » : grille recommandée de la spec P0 d'avant découpage (head `0dd05f7`) **acceptée telle quelle** | « Grille de jugement G0 », copie conforme |
| **Q267** (P0-Q15) — protection des préversions | Constat du CEO par l'API Vercel (2026-10-12), sans réponse de Samuel : protection active ; préversions protégées ; domaine de production `vadrouille-app-ten.vercel.app` public. Le ticket #173 décrit le mode comme « tous les déploiements sauf domaines personnalisés », Q267 comme « tout sauf les domaines de production » : le mode exact est relu par l'API Vercel dans la PR de P0r3 (point [P0r3] ci-dessous) | P0r3 |

Rappels déjà tranchés qui s'appliquent : plafonds mensuels de 40 USD (OpenRouter) et 20 USD (Google) et quotas quotidiens (0027 § 2) ; 100 requêtes par jour et **par méthode** (Q252, Q256) ; règle provisoire Q5 (0027 § 4 : aucune donnée Google dans les prompts, seul l'identifiant de lieu stocké, coordonnées 30 jours au plus) ; OpenRouter et DeepSeek hors UE acceptés en phase 0 pour des briefs de test (P0-Q5, Q260) ; exécutions en ligne, jamais sur un poste, jamais en production (Q257) ; clés sur Production et identifiant propriétaire Neon sur les préversions jusqu'à la mise en public (0034, Q271).

## Règles Google appliquées (rappel de `CLAUDE.md`)
- **Aucune donnée Google dans un prompt**, ni dans une requête de recherche web, un journal, une trace, l'état d'un workflow, un rapport d'exécution ou un fichier du dépôt (tests sentinelles de P0r1 repris pour chaque nouveau chemin).
- **Seul l'identifiant de lieu (`placeId`) est stocké** dans les tables du prototype. **Les coordonnées ne sont stockées que dans le cache serveur `place_coordinates`**, 30 jours au plus, selon la décision 0011 point 6 (fonctions `store_place_coordinates` et `purge_expired_coordinates`, `CHECK` de 30 jours, aucune prolongation). Aucune autre donnée Google (nom, adresse, horaires, note, statut, durée de trajet) n'est écrite en base : elle reste en mémoire de l'étape qui l'utilise, ou elle est relue à l'affichage (durées de Routes).
- **Aucune donnée Google sur une carte non Google** : positions affichées sur la carte Google seulement ; mention « Données de lieux : Google » sous toute donnée de lieu affichée hors de la carte (P0b1, F13).

Conséquence (P0S2-PO-1) : le programme réduit de P0a1 (table `positions` incluse) est **découpé à l'écriture** : le programme sans `positions` va dans `prototype.programmes`, les positions vont dans `place_coordinates` ; P0r4 recompose le programme réduit à la lecture. La règle de `CLAUDE.md` est respectée telle qu'elle est écrite : l'exigence 6 de #172 (décision de Samuel avant tout stockage de positions hors du cache) est satisfaite par construction, sans amendement de `CLAUDE.md` (voir « Exigences d'entrée »).

## Prérequis et ordre
| Tâche | Contenu | Rôle | Prérequis |
|---|---|---|---|
| **P0r2** | Base du prototype : tables, rôles, cache `place_coordinates`, purge en trois couches dont le job GitHub quotidien ; implémentation Neon du port de consommation ; corrections tardives de P0r1 | data, avec ia-recherche | P0r1 fusionnée ; B1 fusionnée (#188) ; spécification **et** code de P0c fusionnés (exigence 7 ; #193 fusionnée, code #217) ; réponses à P0-Q22 et P0-Q24 ; décisions D15 à D18 écrites |
| **P0r3** | Branche d'essais `p0-reel` et ses réglages ; garde complète du mode réel ; jeton d'accès ; page de lancement ; workflow `p0Run` ; plafonds ; module de composition `p0-reel.ts` ; essai d'intégration (exécuté après P0r4) | ia-recherche, backend | P0r2 ; `src/server/env.ts` (B3, dépendance déclarée par #172) ou décision D19 ; P0-Q23 |
| **P0r4** | Source Neon de l'adaptateur `prototype` ; relecteur Routes réel ; même barrière sur la lecture et la relecture ; page de jugement | ia-recherche (frontend pour la page de jugement) | P0r3 |
| **Essai d'intégration** | Un essai borné contre les services réels | Samuel lance | P0r3 et P0r4 fusionnées, exigences vérifiées |
| **P0a2** | 9 exécutions réelles d'Édimbourg | Samuel lance, ia-recherche consigne les rapports | Essai d'intégration réussi |
| **P0b2** | Séances de jugement de Samuel, à l'aveugle ; bilan G0 | Samuel juge, ia-recherche consigne le bilan | Exécutions de P0a2 du brief concerné |
| **P0a3** | Zakynthos, pour information | Samuel lance et juge | P0b2 ; briefs et incontournables de Zakynthos (P0-Q26) |

Une tâche = une PR. P0a2, P0b2 et P0a3 ne livrent pas de code : leur PR (rôle ia-recherche) ne contient que les rapports chiffrés et le bilan dans `docs/produit/`.

## Exigences d'entrée de #172 : traitement
| Exigence | Traitement retenu ici | Échéance | Vérification |
|---|---|---|---|
| **1** — identifiants de l'intégration Neon–Vercel visibles de toutes les préversions | **Base du prototype isolée** des identifiants de l'intégration. Proposition (P0-Q22) : un **projet Neon distinct** (« vadrouille-prototype », Francfort, formule gratuite), **non relié à Vercel** ; ainsi l'identifiant propriétaire que 0034 laisse sur les préversions n'a aucun droit sur la base du prototype, sans revenir sur 0034. Variante si Samuel la refuse : limiter l'intégration à « Development » (contraire à 0034, décision de Samuel). Test ou vérification « aucun identifiant avec droit sur `prototype` ou `place_coordinates` hors `p0-reel` » : liste des variables de chaque environnement Vercel (API) et des rôles de la base (`pg_roles`, droits) | P0r2 | Sécurité et Samuel |
| **2** — branches Neon enfants | Dans le projet distinct : aucune intégration, donc aucune branche par préversion ; création de branche interdite par procédure (D17). **Fenêtre de restauration de l'historique** relevée dans la console (valeur réelle, non supposée ici) et consignée comme **durée réelle maximale** de conservation : 30 jours + cette fenêtre. Si une branche existe, elle est supprimée ou recréée sans le schéma `prototype` ni `place_coordinates` | P0r2 | Sécurité et Samuel |
| **3** — secret de purge dans un dépôt public | GitHub Environment `p0-purge` limité à `main`, workflow `schedule` et `workflow_dispatch` seulement ; suppression par une fonction `SECURITY DEFINER` (D16) ; rôle de connexion sans autre droit ; 0007 amendée pour `vadrouille_prototype` et `vadrouille_prototype_purge`. **Contradiction signalée** : un relecteur obligatoire sur l'environnement met en attente **chaque** exécution planifiée jusqu'à son approbation, donc une purge quotidienne demanderait une approbation quotidienne (P0-Q25) | P0r2 | Sécurité et Samuel |
| **4** — même barrière sur la lecture et la relecture | Jeton d'accès, puis cookie dérivé, exigés par la page de lancement, les écrans de lecture, la relecture Routes et la page de jugement (P0r3, P0r4) ; test e2e « sans barrière : refus et aucun appel Routes » | P0r3 et P0r4 | Sécurité et Samuel |
| **5** — passe de sécurité avant la mise en public | Inchangée (0034) ; rien dans cette suite n'est une mise en public | Avant toute mise en public | Sécurité et Samuel |
| **6** — règle de stockage de `CLAUDE.md` | **Satisfaite par construction** : aucune coordonnée hors de `place_coordinates`, aucune autre donnée Google en base (« Règles Google appliquées »). Q287 (P0-Q20) devient sans objet pour P0r2 ; sa clôture est proposée à Samuel (P0-Q27). Si Samuel préfère garder les positions dans le programme (0028, P0-Q8 b), il amende `CLAUDE.md` de sa main avant P0r2 et D15 est revue | P0r2 | Sécurité (test « aucune coordonnée hors de `place_coordinates` ») et Samuel |
| **7** — régime de confinement P0c | Spécification fusionnée (#193) ; code en cours (#217) ; doit être fusionné avant l'ouverture de la PR de P0r2 | P0r2 | Sécurité et Samuel |

Points « Ainsi que » de #172, repris avec leur échéance :
| Point | Traitement | Échéance |
|---|---|---|
| B1 fusionnée | Prérequis de P0r2 | P0r2 |
| Colonnes Google stockées et origine du nom affiché | Colonnes : `placeId` (tables du prototype), `lat` et `lng` (`place_coordinates` seulement). Nom affiché : celui du candidat issu de notre recherche web, jamais un nom renvoyé par Google (test sentinelle : `displayName` simulé absent de la base et de l'écran) ; migration et mots de passe des rôles (P0-Q24) | P0r2 |
| Protection des déploiements de forks | Vérifiée par lecture (réglages Vercel et GitHub Actions : aucun secret d'environnement pour une PR de fork), jointe au verdict | P0r2 |
| Garde de la CI | Refus dans le dépôt de `prototype/sorties/`, de motifs de `placeId` et de coordonnées (hors fixtures sentinelles), et de toute URL de base Neon | P0r2 |
| Bloquant 3 de la revue du head `335d925` (`NODE_OPTIONS` : `_` pour `-`) | Correction du code de P0r1 telle que décrite dans #172 (texte repris mot pour mot là-bas) : jetons, normalisation de `_` en `-`, option entière, formes `--no-…`, tests avec `_`, guillemets et `=valeur` | P0r2 |
| Bloquant 4 de la même revue (`env` injecté) | Option retenue (P0S2-PO-2) : `egress` lit **aussi** le vrai `process.env` pour `VERCEL_ENV`, `VERCEL_TARGET_ENV` et `VADROUILLE_ENV` et refuse si l'un indique la production, quel que soit l'`env` injecté ; test avec un `env` injecté « preview » sur un `process.env` « production » | P0r2 |
| Mineur 2 de la même revue (délai par requête) | Délai par requête OpenRouter, Places et Routes (valeurs fixées par D13 ou à défaut par le Tech Lead dans P0r2), `AbortSignal`, libération de la réservation, test avec horloge injectée | P0r2 |
| Garde complète du mode réel | « Garde du mode réel » ci-dessous | P0r3 |
| Seul Samuel lance ; fusions vers `p0-reel` | « Branche d'essais » et « Jeton d'accès » ci-dessous | P0r3 |
| Rotation de la clé Google, plafond de facturation de Q249 | Procédure écrite dans la PR de P0r3 ; plafond lu dans la console (P0-Q28) ; rotation effective à l'exigence 5 | P0r3 |
| Clé OpenRouter côté serveur, variables de proxy et de TLS absentes de la préversion | Revérifié sur `p0-reel.ts` ; variables de la préversion de `p0-reel` lues par l'API Vercel par le rôle Sécurité | P0r3 |
| Relectures plafonnées ; nombre de programmes présentés par brief | « Relecture Routes » et P0b2 ci-dessous | P0r4 |
| Mineur 4 de la revue du head `335d925` | Test : `src/server/usage/port.ts` et tout le code atteint depuis lui n'importent ni `src/grounding`, ni `@/prototype/ancrage`, ni `scripts/` | P0r3 |
| Mineur 5 de la même revue | `src/server/composition/p0-reel.ts` nommé par la décision D18 (seul importateur des modules de capacité hors de leurs tests, verdict Sécurité dans la PR de P0r3) | P0r3 |

## P0r2 — Base du prototype

### Où
La base désignée par la réponse à P0-Q22 (proposition : projet Neon distinct). `P0_DATABASE_URL` désigne le rôle `vadrouille_prototype` sur cette base ; elle n'est posée que sur la préversion de `p0-reel` (« Réglages faits par le studio »). La CI teste sur une base Postgres de service, sans aucune URL réelle.

### Tables (contenu fonctionnel ; forme exacte : D15)
| Table | Contenu | Donnée Google | Conservation |
|---|---|---|---|
| `prototype.runs` | Registre : identifiant, jour de quota, mode (`reel`, `essai`), brief (nom de fichier), variante, statut, phase, compteurs par méthode, coût mesuré (modèles) et estimé (Google), durée, codes d'erreur, résultats des critères A1 à A9 | non | jusqu'à la fin de la phase 0 (aucune donnée Google, aucun texte libre) |
| `prototype.run_calls` | Une ligne par appel payant : exécution (nulle pour une relecture), nature (`execution` ou `relecture`), fournisseur, méthode, SKU, unités, coût en micro-USD, état de la réservation | non | jusqu'à la fin de la phase 0 |
| `prototype.run_attempts` | Essais du jeton : heure, résultat ; aucune adresse IP | non | 24 h |
| `prototype.programmes` | Programme réduit validé par le schéma strict de P0a1, **sans la table `positions`** ; `expires_at` = début de l'exécution + 30 jours | `placeId` seulement | 30 jours au plus |
| `prototype.work` | Résultats intermédiaires d'une exécution (candidats, résumés de notre recherche) | `placeId` seulement | supprimés à la fin de l'exécution, réussie ou non ; 24 h au plus |
| `prototype.jugements` | Réponses structurées de Samuel (P0b2) | aucune (références par numéro de jour et d'étape) | 30 jours au plus, comme le programme jugé |
| `place_coordinates` | Cache de coordonnées de la décision 0011 point 6, organisation fictive `org_prototype` | `lat`, `lng` | 30 jours au plus, sans prolongation |

Le programme expire au plus tard en même temps que ses coordonnées : `expires_at` part du **début** de l'exécution, avant toute lecture de Google.

### Rôles
- `vadrouille_prototype` (connexion, sans `BYPASSRLS`) : lit et écrit le schéma `prototype` ; sur `place_coordinates`, droits de `vadrouille_app` seulement (`SELECT`, écriture par `store_place_coordinates`).
- `vadrouille_prototype_purge` (connexion) : **aucun** droit sur les tables ; `EXECUTE` sur la seule fonction de purge (D16).
- `vadrouille_app` n'a **aucun** droit sur le schéma `prototype` (test), si le schéma vit dans une base que l'application atteint.
- Rôles créés par migration, sans mot de passe dans le dépôt ; mots de passe posés hors du dépôt (P0-Q24). 0007 amendée (liste des rôles, test « aucun rôle ne contourne la RLS »).

### Purge (Q269)
Trois couches :
1. **Lecture** : toute lecture filtre `expires_at > now()` ; un programme ou une coordonnée expirés ne sont jamais servis.
2. **Écriture** : suppression des lignes expirées au début de chaque exécution, et purge par lot de `place_coordinates` à chaque écriture (0011).
3. **Job GitHub quotidien** (`.github/workflows/p0-purge.yml`, déclencheurs `schedule` et `workflow_dispatch` seulement) : il appelle la fonction de purge avec le rôle `vadrouille_prototype_purge` ; secret `P0_PURGE_DATABASE_URL` dans l'environnement GitHub `p0-purge`, limité à `main`. La fonction supprime les programmes de test, jugements, résultats intermédiaires et essais du jeton expirés, et les coordonnées expirées. Le fichier touche `.github/workflows/` : la PR de P0r2 attend `owner-approved` (0035). GitHub suspend une tâche planifiée après 60 jours sans activité du dépôt : la date de la dernière purge réussie figure au rapport de chaque cycle (P0S2-PO-3).

Tests : programme et coordonnée expirés jamais servis, et supprimés par chacune des trois couches ; `vadrouille_prototype_purge` ne peut ni lire, ni modifier, ni supprimer une ligne non expirée ; la fonction ne prend aucun paramètre.

### Port de consommation : implémentation Neon
Implémentation de `@/server/usage` sur `prototype.run_calls` (forme fixée par D13) : réservation atomique avant chaque appel, puis confirmation ou libération ; jour et mois passés par l'appelant (P0S2-PO-4) ; échec fermé (`usage_unavailable`) ; test de concurrence (deux réservations simultanées qui dépasseraient un plafond : une seule réussit).

## P0r3 — Lancement des exécutions réelles

### Branche d'essais `p0-reel`
- Branche longue `p0-reel`, déployée par Vercel dans l'environnement « Preview » ; adresse de branche protégée par l'authentification Vercel ; jamais le domaine de production.
- `p0-reel` ne reçoit que des **fusions de `main`**, par PR, **fusionnées par Samuel seul**, hors fusion automatique (#172, [P0r3]) ; règle de protection : PR obligatoire, pas de poussée forcée.
- Les préversions `claude/…` ne servent jamais à une exécution réelle : les variables `P0_*` n'y sont pas posées.

### Réglages faits par le studio (Q268)
Samuel a confié les réglages au studio, sur les préversions seulement. Le CEO désigne le rôle qui les fait (proposition : Release, par l'API Vercel et GitHub), le rôle Sécurité les vérifie et joint l'état relevé à son verdict de P0r3 :
1. créer `p0-reel` et sa règle de protection ;
2. poser sur « Preview », **branche `p0-reel` seulement** : `P0_REAL_RUNS=enabled` (interrupteur « essais réels ») et `P0_RUN_TOKEN` (code d'accès) ; et, par la même délégation, `DATA_ADAPTER=prototype` (réglage sans secret) ;
3. **ne rien poser** sur « Production » ni sur « Development », ni sur une autre branche.

**Code d'accès jamais vu par un agent** (P0S2-PO-5) : la valeur (32 octets aléatoires au moins) est générée et transmise à Vercel dans une seule commande, sans affichage ni fichier intermédiaire ; elle est posée en variable chiffrée **lisible par Samuel dans le tableau de bord Vercel**, où il la consulte. Aucun agent, aucun fichier, aucun ticket ni message ne la contient. Même procédure pour la rotation, qui invalide tous les cookies d'accès.

Hors de la délégation de Q268, donc posés selon la réponse à P0-Q24 : `P0_DATABASE_URL` (contient un mot de passe), le secret `P0_PURGE_DATABASE_URL` et l'environnement GitHub `p0-purge`.

### Garde du mode réel
Le mode réel s'ouvre seulement si **toutes** ces conditions sont vraies, chacune testée seule ; sinon erreur fermée constante, aucune lecture de clé, aucun appel :
- barrière de déploiement de P0r1 (`egress`, liste d'autorisation de `VERCEL_ENV`, avec la correction du bloquant 4) ;
- `isProductionDeployment()` faux (0017 § 11.0) ;
- environnement résolu par `src/server/env.ts` égal à `staging` ; `local` refusé (Q257) ; `CI` posée : refus ;
- `VERCEL_GIT_COMMIT_REF` égal à `p0-reel` ;
- `P0_REAL_RUNS` vaut exactement `enabled` ;
- `P0_DATABASE_URL` posée ;
- jeton ou cookie d'accès valide ;
- réservation du jour réussie, plafonds non atteints.

`src/server/env.ts` refuse de démarrer si une variable `P0_*` est posée en production. **Chaque étape du workflow revérifie la garde à son entrée** : une étape atteinte hors de ces conditions sort en erreur fermée, sans appel externe.

### Jeton d'accès (exigence 4, première partie)
- Le jeton est saisi sur la page de lancement ; comparaison en temps constant ; **5 essais par heure** au plus, puis refus pendant une heure (`prototype.run_attempts`).
- Un jeton valide ouvre un **cookie d'accès dérivé** du jeton (mécanisme : D19), `HttpOnly`, `Secure`, `SameSite=Strict`, valable **12 heures** (P0S2-PO-6) ; rotation du jeton : tous les cookies deviennent invalides.
- Jeton et cookie jamais journalisés, jamais dans l'état d'un workflow, une trace ou une erreur.
- Tant que l'authentification du MVP (B3) n'existe pas, ce jeton est la seconde barrière après la protection Vercel ; B3 la remplacera par la session du propriétaire.

### Page de lancement
`/prototype/executions` (nom proposé), sur `p0-reel` seulement (ailleurs : page absente, 404). Samuel choisit un brief de `prototype/briefs/` et une variante (B ou A), lance, et suit l'exécution (statut, phase, compteurs, coût, durée, codes). Une **action serveur** réserve le jour puis démarre `p0Run`.
- **Rapport sans donnée Google** : à la fin, la page affiche le rapport de l'exécution (compteurs, coûts, durées, codes, résultats A1 à A9) et un bouton « Copier le rapport » ; Samuel colle ce texte dans le fil de la tâche, et ia-recherche le consigne dans `docs/produit/p0-executions.md` (P0S2-PO-7). Le rapport est construit à partir des seuls champs de `prototype.runs` (test sentinelle).

### Workflow `p0Run`
- `src/workflows/p0-run.ts`, point d'entrée unique `src/workflows/index.ts` (créé par P0r3, complété par B9) ; Workflow SDK aux versions de 0009 ; monde Vercel sur la préversion, monde local en CI.
- Étapes de #149 (brief, plan de recherche, recherche, lecture des pages, ancrage, notation, classement, planification, raisons, validation, écriture), chacune courte et rejouable.
- **État des étapes** : identifiants internes, `placeId`, compteurs, codes d'erreur ; jamais de coordonnée, de donnée Google, de brief ni de texte libre (test `workflows: aucune donnée Google dans l'état sérialisé`). Les coordonnées passent d'une étape à l'autre par `place_coordinates`, relues par `placeId`.
- Routes HTTP du SDK : le Tech Lead relève leur authentification sur la version installée et la consigne ; une route qui accepterait un appel non authentifié bloque P0r3. Sur « Production », `p0Run` n'est pas démarrable et toute étape refuse (test e2e sur le build de production : appel direct aux routes du SDK, aucun appel aux clients simulés).
- Région de l'état du monde Vercel relevée et notée dans la PR (Q28, 0009 § 5) ; si elle est hors UE, la question remonte à Samuel, et la règle « identifiants seulement » reste la condition du lancement.
- Formule Vercel : P0r3 vérifie que la formule actuelle permet le Workflow SDK ; sinon, question à Samuel (argent) avant tout changement.

### Plafonds (Q270 et rappels)
Appliqués **avant chaque appel** par la réservation du port de consommation ; un plafond atteint arrête l'exécution sans programme partiel (`cap_reached`).
| Plafond | Valeur | Source |
|---|---|---|
| Par exécution : modèles et recherche web (coût renvoyé par OpenRouter) | **3 USD** | Samuel, Q270 |
| Par exécution : Text Search, Place Details, Routes | 90, 90, 20 matrices (400 éléments) | P0S2-PO-8, sous le quota de 100 par méthode |
| Par exécution : recherches web, pages lues, candidats | 60, 150, 90 | P0S2-PO-8 |
| Par exécution : durée | 15 min | grille G0, A8 (P0-Q2) |
| Par jour : exécutions réelles | 1 (réservation atomique ; une exécution échouée consomme le jour) | #149, #172 |
| Par jour et par méthode (exécutions et relectures) | 100 (quota de la console) ; le code s'arrête à 95 | Q252, Q256 |
| Par mois : OpenRouter | 40 USD | 0027 § 2 |
| Par mois : Google | 20 USD, appliqué par le code (table de prix de P0r1) | 0027 § 2 |
| **Jusqu'à G0 : modèles** (OpenRouter, recherche web comprise) | **80 USD** | Samuel, Q270 |
| **Jusqu'à G0 : Google** | **40 USD** | Samuel, Q270 |

- **Périmètre des 3 USD** (P0S2-PO-9) : modèles et recherche web, comme la question posée à Samuel (P0-Q18 : « 3 USD au plus par exécution (modèles et recherche web) »). Le coût Google estimé de l'exécution est mesuré et noté à côté, borné par les plafonds en requêtes ; A7 est jugé sur le même périmètre que le plafond.
- **Enveloppe « jusqu'à G0 »** (P0S2-PO-10) : elle compte tous les appels réels depuis le premier (essai d'intégration et relectures compris) jusqu'à la décision G0 de Samuel consignée dans `docs/decisions/`. Coût Google calculé comme le plafond mensuel (table de prix de P0r1, tranches gratuites déduites). Enveloppe atteinte : tout lancement et toute relecture sont refusés (`envelope_reached`), et le CEO pose la question à Samuel. Risque connu : les tranches gratuites de Google sont partagées avec la carte du navigateur, que le registre serveur ne voit pas ; l'alerte de budget de la console (Q252) reste le filet.
- **Jour et mois** (P0S2-PO-4) : comptés dans le fuseau des quotas Google (`America/Los_Angeles`, minuit heure du Pacifique, #172), pour Google comme pour OpenRouter.
- **Lancement refusé si le jour est entamé** (P0S2-PO-11) : si les compteurs du jour ne laissent pas à l'exécution tous ses plafonds par méthode sous 95, le lancement est refusé (`daily_quota_insufficient`) **sans** consommer le jour.

### Essai d'intégration
Un essai borné sur `p0-reel`, après la fusion de P0r4, avant la première exécution comptée : brief réduit à un jour de séjour ; plafonds 0,30 USD de modèles, 6 recherches web, 15 pages, 9 candidats, 9 Text Search, 9 Place Details, 2 matrices Routes (40 éléments), 5 min (P0S2-PO-12) ; il consomme le jour et compte dans l'enveloppe ; il ne compte pas pour G0. Son rapport est consigné comme les autres.

## P0r4 — Lecture des programmes réels
- **Source Neon** de l'adaptateur `prototype` de P0b1 : lecture par `vadrouille_prototype`, `expires_at > now()`, schéma strict de la forme réduite, `trip.id` validé ; positions recomposées depuis `place_coordinates` (lignes non expirées) ; le chargeur de dossier de P0b1 reste pour les tests.
- **Même barrière que le lancement** (exigence 4) : écrans de lecture (présentation, Séjour, Journée, carte), relecture Routes et page de jugement exigent le cookie d'accès ; sans lui, page de saisie du jeton, aucune lecture en base et aucun appel Routes.
- **Relecture Routes** : durées de trajet relues à chaque affichage d'une Journée (`no-store`, jamais stockées, `Cache-Control: private, no-store`) ; chaque relecture passe par la réservation (nature `relecture`) ; compteur Routes du jour à 95 ou enveloppe atteinte : la relecture échoue fermée, sans appel, et la Journée affiche l'état d'erreur existant, jamais une durée inventée ni conservée.
- Affichage des positions sur la carte Google seulement ; mention « Données de lieux : Google » hors de la carte (P0b1).
- **Page de jugement** `/prototype/jugement` (nom proposé) : formulaire de l'annexe, réponses structurées seulement (P0b2).

## P0a2 — Exécutions réelles d'Édimbourg
- **9 exécutions** : pour chacun des 3 briefs de référence (0027 § 6, champs déduits listés dans #180, Q280 ouverte), 2 de la variante B et 1 de la variante A ; **une par jour de quota**, en commençant par les deux exécutions B du brief 1 (#149) ; dates et logement par défaut de P0-Q7.
- **Samuel lance** chaque exécution (seul détenteur du code d'accès) ; ia-recherche prépare l'ordre et consigne les rapports qu'il colle.
- **Exécution non aboutie** (P0S2-PO-13) : une exécution arrêtée par une cause externe ou d'infrastructure (`upstream_unavailable`, `upstream_redirect`, `usage_unavailable`) avant d'avoir produit un programme est notée et **relancée un autre jour**, au plus une fois par brief et par variante, dans l'enveloppe. Toute autre fin, dont un plafond atteint, **compte** comme une exécution qui ne franchit pas les critères A.
- Calendrier : au moins 10 jours de quota (essai compris). Les séances de P0b2 se tiennent de préférence les jours sans exécution (quota Routes partagé).

## P0b2 — Séances de jugement
- Samuel ouvre la préversion de `p0-reel` et juge, pour chaque brief, **la meilleure des deux exécutions B** et **l'exécution A**, présentées sous les lettres X et Y dans un **ordre tiré au hasard par le code**, révélé après l'envoi du formulaire.
- **« Meilleure des deux »** (P0S2-PO-14) : désignée par le code à partir du seul rapport, parmi les exécutions qui franchissent tous les critères A : la moins de cases « aucune option compatible », puis le coût le plus bas. Aucun agent ne la choisit (aucun agent ne voit les programmes), et Samuel ne sait pas laquelle des deux il voit.
- **Formulaire** : celui de l'annexe, sur la page de jugement ; erreurs critiques choisies dans une liste fermée (lieu fermé ou inexistant, horaire impossible, événement hors dates ou inventé, adresse dans la mauvaise ville) avec le numéro du jour et de l'étape ; notes de 1 à 5 ; « J'aime », « Neutre » ou « Pas pour moi » (raison de `PREFERENCE_REASONS`) pour chaque étape et repas ; liste des 10 incontournables à cocher (module de la page de jugement, jamais importé par le pipeline : test d'imports) ; journées hors budget sans justification ; question B6 (oui ou non, raison facultative gardée en base seulement, purgée avec le programme).
- **Bilan** : le code calcule B1 à B6 par brief et le résultat de la grille ; « Copier le bilan » rend un texte fait seulement de nombres, de lettres X et Y, de numéros de jour et d'étape et de catégories (test sentinelle : aucun nom, aucune adresse, aucun texte libre). Samuel le colle dans le fil de la tâche ; ia-recherche écrit `docs/produit/p0-jugements.md` (tableau des critères A et B, comparaison A et B). Ce fichier ne contient aucune donnée Google.
- **G0** : la grille dit si le prototype est « exploitable » ; la décision G0 reste celle de Samuel, consignée par le CEO dans `docs/decisions/`.

## P0a3 — Zakynthos (pour information)
Même chemin et même formulaire, **une exécution de la variante B par brief** (P0S2-PO-15), dans l'enveloppe si elle tombe avant G0. Bloquée tant que Samuel n'a pas fourni le ou les récits de Zakynthos et sa liste d'incontournables (P0-Q26).

## Grille de jugement G0 (copie conforme)
Copie conforme de `specs/P0-prototype-recherche.md` au head `0dd05f7`, lignes 306 à 333 (sous le titre de la ligne 305, « Grille de jugement G0 : « prototype jugé exploitable sur Édimbourg » (P0-PO-10, sous réserve de P0-Q6) »), et de son annexe (lignes 501 à 507), grille **acceptée telle quelle par Samuel** (Q236, P0-Q6, 2026-10-12 14:11 CEST, « je suis tes reco ») ; reprise aussi sur le ticket #173. La mention « sous réserve de P0-Q6 » du titre est d'origine : P0-Q6 est tranchée. Seules différences d'application, hors de la copie : la séance « P0b » est P0b2 ; l'ordre des variantes est tiré par le code et non par un agent (« P0b2 ») ; le formulaire est rempli sur la page de jugement.

Le jugement porte sur la **variante B**, avec **deux exécutions** de chacun des **trois briefs de référence** d'Édimbourg (reproductibilité). Le prototype est **exploitable** si les **six** exécutions franchissent tous les critères A, et si Samuel, sur la meilleure des deux exécutions de chaque brief parcourue dans P0b, franchit tous les critères B pour les trois briefs.

**A — Contrôles automatiques** (rapport d'exécution et tests ; aucun jugement humain). A1 à A6 et A9 sont des **seuils de qualité** (P0-Q6) ; A7 et A8 sont des **plafonds** de coût et de durée (P0-Q2), mesurés et notés ; la cible de 3 min du cadrage vaut pour B9, pas pour P0.
| # | Critère | Seuil |
|---|---|---|
| A1 | Programme valide par `TripSchema` et `ProposalSchema` (après recomposition) | oui |
| A2 | R1 : toute étape de lieu a un `placeId` et une source | 100 % |
| A3 | R2 : aucun événement hors des dates ; tout événement non marqué `unconfirmed` a une page source relue qui mentionne sa date | 100 % |
| A4 | R4, R5, R6, R8 : horaires respectés, trajets faisables avec marge, départ et retour au logement, rythme et temps libre minimal | 0 violation restante |
| A5 | Aucun trou : chaque journée va du terminus de départ au terminus d'arrivée sans créneau non couvert | 100 % des jours |
| A6 | Les 8 propositions de la présentation existent (ou des cases « aucune option compatible », PO-6, sans lieu non ancré) | 8 |
| A7 | Coût de l'exécution (plafond, P0-Q2) | ≤ 3 USD ; mesuré et noté |
| A8 | Durée de l'exécution (plafond, P0-Q2) | ≤ 15 min ; mesurée et notée |
| A9 | Test canari vert sur le code de l'exécution | vert |

**B — Jugement de Samuel** (sur le programme parcouru dans P0b, formulaire en annexe ; seuils de qualité, P0-Q6)
| # | Critère | Seuil |
|---|---|---|
| B1 | Erreur critique : lieu fermé ou inexistant, horaire manifestement impossible, événement hors dates ou inventé, adresse dans la mauvaise ville | **0** |
| B2 | Note de 1 à 5 sur pertinence, variété, rythme, justification, surprise (cadrage § 8) | moyenne ≥ **3,5** et aucun axe < 3 (signal d'alerte du cadrage § 12 : pertinence < 3,5) |
| B3 | Étapes et repas que Samuel garderait (« J'aime » ou neutre) parmi toutes les étapes du programme | ≥ **65 %**, soit « Pas pour moi » ≤ 35 % (seuil de G1) |
| B4 | Couverture des incontournables : la liste de 10 lieux d'Édimbourg de Samuel (décision 0027 § 6), jamais donnée au prototype | ≥ **7 sur 10** dans le programme de chaque brief |
| B5 | Trajets : journées au-dessus du budget de trajet du rythme sans justification affichée | **0** |
| B6 | Réponse de Samuel à « Utiliserais-tu ce programme pour ce voyage, avec au plus 5 remplacements ? » | **oui** |

**Comparaison avec la variante A** (mesure de référence, décision 0027). Pour chaque brief, une exécution de la variante A (P0a2). Mesures : critères A1 à A9 (dont R1 à R10, R3 et R10 sans objet), coût et durée par voyage (rapport), et taux de « Pas pour moi » (B3), que Samuel donne sur le programme de la variante A comme sur celui de la variante B. Proposition (P0-PO-12) : Samuel juge les deux programmes d'un même brief **sans savoir lequel vient de quelle variante** (ordre tiré au hasard par l'agent qui prépare la séance, révélé après). Le tableau de comparaison va dans `docs/produit/p0-jugements.md` ; si B n'apporte rien de mesurable, le Tech Lead peut revenir à A par une décision écrite (0027). La variante A ne compte pas pour G0.

Zakynthos (P0a3) suit la même grille **pour information** : G0 ne nomme qu'Édimbourg. Le résultat (critères A et B, coûts, durées) est consigné dans `docs/produit/p0-jugements.md` (proposition) par l'agent qui recueille les réponses de Samuel ; ce fichier ne contient aucune donnée Google.

### Annexe — formulaire de jugement de Samuel (critères B)
Pour chaque programme parcouru dans P0b (meilleure exécution B et exécution A de chaque brief, sans savoir laquelle est laquelle) :
1. Erreurs critiques (liste, avec le jour et l'étape) : …
2. Notes de 1 à 5 : pertinence …, variété …, rythme …, justification …, surprise ….
3. Pour chaque étape et repas du programme : « J'aime », « Neutre » ou « Pas pour moi » (avec une raison de `PREFERENCE_REASONS` si « Pas pour moi »).
4. Incontournables de ta liste présents dans le programme : … sur 10.
5. Journées au-dessus du budget de trajet sans justification affichée : ….
6. Utiliserais-tu ce programme pour ce voyage, avec au plus 5 remplacements ? oui / non, et pourquoi.

## Critères d'acceptation

### P0r2
- [ ] `p0: aucune coordonnée hors de place_coordinates` (aucune colonne `lat`, `lng`, `location` ni JSON de positions dans le schéma `prototype` ; programme écrit sans `positions`)
- [ ] `p0: programme découpé puis recomposé` (programme réduit sentinelle : `placeId` dans `prototype.programmes`, coordonnée sentinelle dans `place_coordinates` seulement ; recomposition identique)
- [ ] `p0: aucune donnée Google en base hormis placeId et place_coordinates` (sentinelles de nom, adresse, horaires, note, statut, durée absentes de toutes les tables ; `displayName` simulé jamais affiché)
- [ ] `p0: expiration du programme au plus tard avec ses coordonnées`
- [ ] `p0: programme expiré jamais servi et supprimé` (chacune des trois couches)
- [ ] `base: vadrouille_prototype_purge ne fait que purger` (aucun `SELECT`, `UPDATE`, `DELETE` direct ; fonction sans paramètre ; lignes non expirées intactes)
- [ ] `base: vadrouille_app n'a aucun droit sur le schéma prototype` ; liste des rôles de 0007 amendée et test « aucun rôle ne contourne la RLS » à jour
- [ ] `p0: réservation atomique du port Neon` (concurrence, échec fermé, libération après délai)
- [ ] `p0: egress refuse la production même avec un env injecté` (bloquant 4) ; `p0: options de NODE_OPTIONS normalisées` (bloquant 3) ; `p0: délai par requête et réservation libérée` (mineur 2)
- [ ] Garde de la CI : `prototype/sorties/`, motifs de `placeId` et de coordonnées, URL Neon refusés (cas négatifs)
- [ ] Workflow `p0-purge.yml` : déclencheurs `schedule` et `workflow_dispatch` seulement, `environment: p0-purge` ; `owner-approved` posé par Samuel
- [ ] PR : exigences 1, 2, 3, 6 et 7 vérifiées (état relevé des environnements Vercel et des rôles, fenêtre de restauration de Neon), verdict Sécurité et accord écrit de Samuel

### P0r3
- [ ] `p0: mode réel refusé` pour chaque condition de la garde prise seule (production, CI, local, autre branche, `P0_REAL_RUNS` absente ou différente de `enabled`, `P0_DATABASE_URL` absente, jeton invalide)
- [ ] `p0: chaque étape revérifie la garde` (étape appelée directement hors des conditions : refus sans appel)
- [ ] `p0: une seule exécution réelle par jour de quota` (deux lancements simultanés : une réservation, un workflow) ; `p0: une exécution échouée consomme le jour` ; `p0: jour entamé, lancement refusé sans consommer le jour`
- [ ] `p0: jeton limité à 5 essais par heure, comparé en temps constant, masqué` ; `p0: cookie d'accès de 12 heures invalidé par la rotation du jeton`
- [ ] `p0: plafonds` : 3 USD par exécution, plafonds en requêtes, 15 min, mois, enveloppe jusqu'à G0 (modèles 80 USD, Google 40 USD) ; chacun atteint : arrêt sans programme partiel ou refus du lancement (client simulé, valeurs réelles de configuration)
- [ ] `workflows: aucune donnée Google dans l'état sérialisé` (étapes de `p0Run`, coordonnées comprises)
- [ ] `p0: rapport sans donnée Google` (rapport copié construit des seuls champs de `prototype.runs`)
- [ ] `p0: port de consommation isolé` (mineur 4)
- [ ] e2e sur le build de production : `/prototype/executions` absente ; appel direct aux routes du SDK pour `p0Run` : aucun appel aux clients simulés
- [ ] PR : réglages de Q268 relevés par l'API Vercel (variables par environnement et par branche, mode exact de la protection), authentification des routes du SDK et région de l'état consignées, procédure de rotation de la clé Google, verdict Sécurité sur `p0-reel.ts`, accord écrit de Samuel

### P0r4
- [ ] e2e `p0: lecture sans barrière : refus et aucun appel Routes` (écrans de lecture, relecture, page de jugement)
- [ ] `p0: relecture refusée à 95 requêtes Routes du jour ou enveloppe atteinte` (état d'erreur existant, aucune durée inventée)
- [ ] `affichage: positions Google seulement sur la carte Google ou avec la mention`
- [ ] `p0: les incontournables ne sont jamais importés par le pipeline`
- [ ] `p0: bilan sans texte libre ni donnée Google` (sentinelles) ; `p0: ordre X et Y tiré par le code, révélé après l'envoi`
- [ ] PR : exigence 4 vérifiée, verdict Sécurité et accord écrit de Samuel

### Essai, P0a2, P0b2, P0a3
- [ ] Rapport de l'essai d'intégration consigné ; essai dans ses plafonds
- [ ] `docs/produit/p0-executions.md` : un rapport par exécution (compteurs, coûts, durées, codes, A1 à A9), aucune donnée Google
- [ ] `docs/produit/p0-jugements.md` : bilan B1 à B6 par brief, comparaison A et B, résultat de la grille ; aucune donnée Google
- [ ] Dépenses cumulées sous 80 USD (modèles) et 40 USD (Google) à la décision G0

## Décisions (Product Owner, définitives sans veto de Samuel avant le 2026-10-15)
- **P0S2-PO-1 — Stockage conforme à `CLAUDE.md` tel qu'écrit** : programme sans `positions` en base, coordonnées dans `place_coordinates` seulement ; exigence 6 satisfaite par construction. Motif : la consigne de Samuel (0027 § 4) et `CLAUDE.md` le permettent sans exception nouvelle.
- **P0S2-PO-2 — Bloquant 4** : `egress` lit aussi le vrai `process.env` pour les trois variables de déploiement (option la plus sûre des trois de la revue).
- **P0S2-PO-3 — Suivi de la purge** : date de la dernière purge réussie au rapport de chaque cycle.
- **P0S2-PO-4 — Fuseau** : jour et mois comptés à l'heure du Pacifique (quotas Google), pour tous les compteurs.
- **P0S2-PO-5 — Code d'accès jamais vu par un agent** : généré et posé en une commande, lu par Samuel dans Vercel.
- **P0S2-PO-6 — Cookie d'accès de 12 heures** (une séance de jugement tient dans une journée).
- **P0S2-PO-7 — Rapports et bilans transmis par copier-coller de Samuel** : aucun agent n'accède à la préversion ni à la base.
- **P0S2-PO-8 — Plafonds en requêtes par exécution** : 90 Text Search, 90 Place Details, 20 matrices Routes (400 éléments), 60 recherches web, 150 pages, 90 candidats (valeurs du brouillon de la revue du head `2639d52`, sous le quota de 100).
- **P0S2-PO-9 — Périmètre des 3 USD** : modèles et recherche web ; coût Google noté à part.
- **P0S2-PO-10 — Enveloppe jusqu'à G0** : du premier appel réel à la décision G0, relectures comprises ; Google compté comme le plafond mensuel.
- **P0S2-PO-11 — Jour entamé** : lancement refusé sans consommer le jour.
- **P0S2-PO-12 — Plafonds de l'essai d'intégration** (repris du brouillon du head `2639d52`).
- **P0S2-PO-13 — Exécution non aboutie** : relancée une fois au plus par brief et variante si la cause est externe ; sinon comptée.
- **P0S2-PO-14 — « Meilleure des deux »** désignée par le code à partir du rapport.
- **P0S2-PO-15 — Zakynthos** : une exécution B par brief, pour information.

## Décisions attendues du Tech Lead (avant le code de la tâche concernée)
Numérotation à la suite de #172 (D1 à D14).
| # | Sujet | Proposition | Tâche |
|---|---|---|---|
| D15 | Forme des tables du prototype et découpage du programme réduit | tables ci-dessus ; `place_coordinates` créée dans la base du prototype selon 0011 point 6, par les mêmes migrations que B8 la créera (B8 la reprend sans la changer) ; organisation `org_prototype` | P0r2 |
| D16 | Mécanisme de la purge | fonction `SECURITY DEFINER` sans paramètre, propriétaire `NOLOGIN` sans appartenance (règles de 0007 et 0036), `EXECUTE` au seul `vadrouille_prototype_purge` ; elle appelle aussi la purge des coordonnées expirées | P0r2 |
| D17 | Migrations de la base du prototype | même chaîne de migrations que la base principale (B1 puis schéma `prototype`), même mécanisme que la réponse à Q278 et Q294 ; procédure « aucune branche Neon » | P0r2 |
| D18 | Module de composition `src/server/composition/p0-reel.ts` | seul importateur des modules de capacité hors de leurs tests (mineur 5) | P0r3 |
| D19 | Garde complète sans B3 | soit attendre `src/server/env.ts` de B3, soit le livrer en avance comme P0r1 l'a fait pour `src/server/env/` ; mécanisme du cookie dérivé (HMAC du jeton, durée de 12 h) | P0r3 |
| D13 (rappel, ouverte) | Port de consommation | délais par requête (mineur 2) et forme de la réservation | P0r1, P0r2 |

## Hors périmètre
- Production, clés de production, comptes payants, changement de formule Vercel ou Neon sans décision de Samuel.
- Comptes utilisateurs (B3), paiement, workflows du MVP autres que `p0Run`, B8 au-delà du cache des coordonnées.
- Gemini (Q9) ; toute comparaison de fournisseurs.
- Passe de sécurité avant la mise en public (exigence 5, 0034).

## Questions ouvertes
Destinataires et blocages dans la description de la PR ; le CEO les reporte dans `QUESTIONS.md`.
- **P0-Q22** (Samuel) — Base du prototype isolée : projet Neon distinct, non relié à Vercel (recommandé), ou intégration limitée à « Development » (revient sur 0034) ? Bloque P0r2.
- **P0-Q23** (Tech Lead) — D19 : attendre B3 ou livrer `src/server/env.ts` en avance ? Bloque P0r3.
- **P0-Q24** (Samuel) — Q268 et Q269 ne disent pas qui pose les mots de passe des rôles, `P0_DATABASE_URL`, l'environnement GitHub `p0-purge` et `P0_PURGE_DATABASE_URL`. Le studio aussi, par la même procédure sans affichage que le code d'accès (recommandé), ou Samuel dans les consoles ? Bloque P0r2 (secret de purge) et P0r3.
- **P0-Q25** (Sécurité, puis Samuel) — Exigence 3 : un relecteur obligatoire sur `p0-purge` bloque chaque purge planifiée jusqu'à approbation. Garder l'environnement limité à `main` **sans** relecteur obligatoire (le secret reste inaccessible à toute autre branche ; le fichier du workflow est gardé par `owner-approved`, 0035), ou approbation quotidienne par Samuel ? Recommandation : sans relecteur. Bloque P0r2.
- **P0-Q26** (Samuel) — Zakynthos : récit ou récits, et liste d'incontournables (comme pour Édimbourg, 0027 § 6). Bloque P0a3.
- **P0-Q27** (Samuel) — Clore Q287 (P0-Q20) : le stockage reste conforme à `CLAUDE.md` tel qu'écrit. Ne bloque rien.
- **P0-Q28** (Samuel) — Limite de crédit de la clé OpenRouter (40 USD par mois) et plafonds de la console Google (Q249) : sont-ils posés ? Lecture demandée avant l'essai d'intégration. Bloque l'essai d'intégration.
