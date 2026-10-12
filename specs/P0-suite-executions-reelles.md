# P0 (suite) — Exécutions réelles du prototype de recherche, en ligne, sur les briques du MVP

Rôle : ia-recherche (gabarit du Product Owner) · Date : 2026-10-12 · Ticket : #170 · Décisions 0026 à 0028 et 0030 (#149, fusionnée) · Exécutions après B1 · Suite de `specs/P0-prototype-recherche.md` (#149, P0a1 et P0b1)

## Objectif
Faire tourner le prototype de recherche **pour de vrai** (OpenRouter, Google Places et Routes) sur Édimbourg puis Zakynthos, et laisser Samuel parcourir les programmes produits dans les écrans existants, pour juger G0.

Samuel, 2026-10-12 à 12:47 CEST, dans le projet Claude (réponse à Q257, P0-Q13) : « Non ça ne tournera pas sur mon poste, je suis en full remote, je travail dans le cloud, sur des ordi différents. On a défini un architecture pour lancer le projet en MVP on la suit, Fait en sorte que arrive en MVP. C'est important d'itérer vers une version assez proche de la réalité. »

Ce que cette spécification en tire :
- **Rien ne tourne sur un poste** : ni exécution, ni lecture des programmes. Les options « poste local » (A5 de #149) et « dossier du projet Claude » (P0-Q12 b) sont abandonnées.
- **Les exécutions réelles empruntent le chemin du MVP** (`docs/handovers/backend.md`) : modules `src/ai`, `src/research`, `src/grounding` (B7, B8), exécution durable par le Workflow SDK (décision 0009, B9), base Postgres Neon à Francfort (Q24, socle B1), déploiement Vercel (décision 0002). Le code de P0 **devient** le premier morceau de B7 et B8, au lieu d'un script jetable : « le prototype P0 alimente ce chapitre sans être recopié » (handover § 8).
- **Rien de public, rien en production** (Q235, Q250) : exécution et lecture sur une **préversion Vercel protégée par l'authentification Vercel**, jamais sur l'environnement « Production ».

## Ce qui est déjà en place (2026-10-12)
- Clés `OPENROUTER_API_KEY` et `GOOGLE_MAPS_SERVER_KEY` posées par Samuel dans Vercel, sur « Preview » et « Development » seulement (Q249, Q250).
- Projet Neon gratuit à Francfort (Postgres 17), relié à Vercel pour « Development » et « Preview » (`STATUS.md`, 2026-10-12 vers 11:35).
- Quotas Google : 100 requêtes par jour et par méthode (Q252, Q256), alerte de budget à 20 USD (Q252) ; 40 USD par mois sur OpenRouter, 20 USD par mois sur Google (0027 § 2).
- OpenRouter hors UE accepté en phase 0, briefs de test seulement (P0-Q5) ; DeepSeek via OpenRouter accepté dans les mêmes conditions, à revoir avant la bêta (Q260, 2026-10-12 à 12:48 CEST).
- Positions Google gardées dans le programme hors du dépôt, 30 jours au plus ; durées de trajet relues à l'affichage (P0-Q8, option b ; Q241).

## Prérequis (dans cet ordre)
1. **#149 fusionnée** (fait le 2026-10-12), puis **P0a1** (pipeline en mode simulé, schéma de la forme réduite) et **P0b1** (adaptateur `prototype`, relecteurs simulés).
2. **B1 fusionnée** (socle base : Drizzle, migrations, rôles, RLS) : les tables du prototype en dépendent. Samuel a levé la porte « après G0 » pour toute la chaîne MVP (2026-10-12), B1 peut donc avancer en parallèle de P0a1.
3. **Amendement de `CLAUDE.md`** par le CEO pour l'écart des positions gardées 30 jours (« Stockage dans Neon »), avant P0r2.
4. **Décision A3 de P0a1 alignée sur le MVP** : le code du pipeline vit dans `src/ai`, `src/research`, `src/grounding`, `src/domain` (handover § 3), pas dans un dossier isolé du script. La commande `pnpm p0` reste une enveloppe mince autour de ces modules. Sans cela, les étapes du workflow devraient recopier le script (point signalé au Tech Lead dans #149).

## Découpage
| Tâche | Contenu | Rôle | Prérequis |
|---|---|---|---|
| **P0r1** | Clients réels : modèles via l'AI SDK et OpenRouter (A1) dans `src/ai` ; Places et Routes dans `src/grounding` ; couche HTTP réelle de la lecture des pages dans `src/research` ; modules d'environnement étroits `@/server/env/ai` et `@/server/env/grounding` ; aucun appel déclenchable encore | ia-recherche | P0a1 |
| **P0r2** | Tables du prototype et purge à 30 jours (A8) ; registre des exécutions et des appels (embryon de `usage_ledger`) | data, avec ia-recherche | B1, P0r1 |
| **P0r3** | Workflow `p0Run` (Workflow SDK, monde Vercel en préversion, monde local en CI) ; page protégée de lancement ; garde du mode réel ; plafonds ; essai d'intégration borné | ia-recherche, backend | P0r2, P0b1 |
| **P0r4** | Adaptateur `prototype` branché sur Neon au lieu du dossier ; relecteur Google réel (durées de trajet relues à l'affichage, `no-store`) | ia-recherche | P0r3 |
| **P0a2** | Exécutions réelles d'Édimbourg : 2 de la variante B et 1 de la variante A par brief (9 au total, une par jour) | ia-recherche lance, Samuel juge | P0r4 |
| **P0b2** | Séances de jugement à l'aveugle de Samuel sur la préversion | Samuel, ia-recherche prépare | P0a2 |
| **P0a3** | Zakynthos, même chemin | ia-recherche | P0b2, récit de Zakynthos par Samuel |

Une tâche = une section de cette spécification = une PR, selon le découpage que le CEO retient. P0a2, P0b2 et P0a3 sont les tâches que #149 a nommées et renvoyées ici, pas de nouveaux numéros ; P0r1 à P0r4 sont nouveaux. **Recouvrement avec B9** : aucun fichier commun sauf `src/workflows/index.ts`, créé par P0r3 et complété par B9 ; B9 réutilise les modules d'étapes (`src/ai`, `src/research`, `src/grounding`), pas le workflow `p0Run`, qui disparaît avec le schéma `prototype` à la fin de la phase 0.

## Comportement

### Où une exécution tourne : la branche `p0-reel` (bloquant 1 de la revue du head 55d346e)
- **Branche longue dédiée** `p0-reel` (nom proposé, A11), déployée par Vercel dans l'environnement « Preview ». La branche de production (`main`) donne l'environnement « Production » : elle est exclue. Les préversions des branches `claude/…` sont éphémères et ne servent jamais aux exécutions réelles.
- **Mise à jour** : `p0-reel` ne reçoit **que des fusions de `main`**, jamais de commit propre. La fusion est faite par une PR ordinaire de `main` vers `p0-reel`, revue comme les autres, ou par Samuel. Règle de protection de branche sur `p0-reel` (Samuel) : PR obligatoire, pas de poussée forcée. Ainsi le code qui tourne avec les clés est toujours du code déjà fusionné et revu.
- **Adresse stable** : l'adresse de branche de Vercel (`vadrouille-app-git-p0-reel-<équipe>.vercel.app`), protégée par l'**authentification Vercel** (P0-Q15). Jamais `vadrouille-app-ten.vercel.app` (« Production »). La clé Maps navigateur accepte déjà `*.vercel.app` (Q263) : la carte s'affiche sur cette adresse sans autre réglage.
- **Variables propres à la branche** : Vercel permet de poser une variable « Preview » pour **une seule branche**. `P0_REAL_RUNS`, `P0_RUN_TOKEN` et `P0_DATABASE_URL` sont posées par Samuel sur « Preview », branche `p0-reel` seulement (P0-Q16). Aucune autre préversion ne peut donc lancer une exécution réelle ni lire les programmes, même si elle lit les clés `OPENROUTER_API_KEY` et `GOOGLE_MAPS_SERVER_KEY` (risque résiduel accepté par Samuel, Q250).
- **Rôle de la CI** : elle ne lance jamais d'exécution réelle (garde ci-dessous) et n'a ni `P0_DATABASE_URL` ni clé. Elle teste `p0Run` dans le monde local du Workflow SDK, avec des clients simulés et une base Postgres de service.

### Comment une exécution tourne
- **Déclenchement** : Samuel (ou ia-recherche, si Samuel lui ouvre la préversion) ouvre la page `/prototype/executions` (nom proposé) sur l'adresse de `p0-reel`, choisit un brief de `prototype/briefs/` et une variante, saisit le jeton d'exécution et lance. La page appelle une **action serveur** (`src/server/actions/prototype.ts`) qui réserve le jour, puis démarre le workflow et renvoie son identifiant. Le suivi (statut, phase, compteurs) s'affiche sur la même page.
- **Exécution durable** : le workflow `p0Run` (`src/workflows/p0-run.ts`) enchaîne les étapes de #149 (brief, plan de recherche, recherche, lecture des pages, ancrage, notation, classement, planification, raisons, validation, écriture), chacune dans une étape `"use step"` courte et rejouable. Une exécution dure jusqu'à 15 min : seul un workflow durable tient cette durée sur Vercel sans dépendre de la durée maximale d'une fonction.
- **Points d'entrée HTTP du Workflow SDK** (bloquant 2) : le SDK sert ses propres routes à l'intégration Next.js (sous `/.well-known/workflow/`, chemins exacts à relever sur la version de 0009). Ce sont les seules routes HTTP ajoutées. Exigences de A10 :
  1. le Tech Lead relève sur la version installée comment ces routes authentifient leurs appels (invocation signée par la file du monde Vercel, ou autre) et le consigne ; une route qui accepterait un appel non authentifié est refusée et bloque P0r3 ;
  2. **chaque étape revérifie la garde du mode réel à son entrée** : un appel qui atteindrait une étape en production, en CI ou hors de `p0-reel` sort en erreur fermée sans appel externe ;
  3. sur le déploiement « Production », `p0Run` n'est pas démarrable (garde de l'action serveur) et toute étape appelée refuse (point 2) ; test e2e sur le build de production : un appel direct aux routes du SDK pour `p0Run` ne produit aucun appel aux clients (simulés) ;
  4. `src/workflows/index.ts` reste le seul point d'entrée des workflows (handover § 8) ; P0r3 le crée, B9 y ajoute ses workflows.
- **État des étapes** (décision 0009, handover § 8) : identifiants internes, `placeId`, compteurs et codes d'erreur **seulement**. Les résultats intermédiaires (candidats, résumés de recherche, programme) sont écrits dans les tables du prototype par l'étape elle-même et relus par identifiant. Jamais de donnée Google, de brief ni de texte libre dans l'état sérialisé (test `workflows: aucune donnée Google dans l'état sérialisé`, repris pour `p0Run`).
- **Région de l'état** (Q28, décision 0009 § 5) : 0009 § 5 tolère un état hors UE parce qu'il ne contient que des identifiants pseudonymes. P0r3 relève la région de l'état du monde Vercel et la note dans sa PR ; si elle est hors UE, la question remonte à Samuel comme le prévoit 0009, et la règle ci-dessus reste la condition du lancement.
- **Aucune session d'agent ne lit un programme réel** : les agents n'ont ni accès à la préversion de `p0-reel` (sauf décision de Samuel), ni `P0_DATABASE_URL`, ni le jeton. Le rapport d'exécution que l'agent consulte ne contient que des compteurs, coûts, durées et codes (comme dans #149).

### Garde du mode réel
Le mode réel s'ouvre **seulement** si toutes les conditions suivantes sont vraies ; chacune est testée seule :
- `isProductionDeployment()` est faux (décision 0017 § 11.0) ;
- l'environnement résolu par `src/server/env.ts` est `staging` (préversion Vercel). **`local` est refusé** (bloquant 3) : Samuel a écarté toute exécution sur un poste (Q257) ;
- `CI` n'est pas posée : en CI, le mode réel est toujours refusé, sans exception (pas de reprise de l'exception `VADROUILLE_PROTOTYPE`/`CI` de l'adaptateur) ;
- `P0_REAL_RUNS=enabled` (nom proposé), posée par Samuel sur « Preview », branche `p0-reel` seulement ;
- le jeton d'exécution est valide (ci-dessous) ;
- la **réservation du jour** a réussi (ci-dessous) ;
- les plafonds du mois et de l'enveloppe ne sont pas atteints.
Sinon : erreur fermée constante (`real_mode_unavailable`, `daily_run_used`, `cap_reached`, `invalid_run_token`), aucune lecture de clé, aucun appel.

**Réservation atomique du jour** (bloquant 4). Avant tout appel externe, l'action serveur insère la ligne de l'exécution dans `prototype.runs` avec la date du jour (fuseau Europe/Zurich) et le mode `reel`. Une **contrainte d'unicité** sur `(jour, mode)` pour le mode `reel` refuse la seconde insertion du même jour (`daily_run_used`). Une exécution qui échoue, qui atteint un plafond ou qui est l'essai d'intégration **consomme le jour** : seule une décision écrite de Samuel libère un jour (aucun bouton). Test de concurrence : deux lancements simultanés, une seule réservation, un seul workflow démarré.

**Jeton d'exécution** (A9, mineur 12). La protection de Vercel est la première barrière ; elle ne suffit pas seule (lien de partage, protection désactivée par erreur). Tant que l'authentification du MVP (B3) n'existe pas, l'action serveur exige `P0_RUN_TOKEN` (32 octets aléatoires au moins, posé par Samuel, branche `p0-reel` seulement) :
- comparaison en temps constant, sur des empreintes de même longueur ;
- au plus 5 essais par heure, compteur dans `prototype.runs_attempts` (aucune adresse IP stockée), puis refus pendant une heure ;
- jamais journalisé ni exporté : le champ est masqué dans les journaux, les traces et les erreurs (liste des champs masqués de `src/server`) ; jamais écrit dans l'état du workflow ;
- jamais connu des agents : Samuel le garde ; aucun fichier du dépôt ni du projet ne le contient.
B3 le remplacera par la session du propriétaire. Dans tous les cas, les plafonds bornent ce qu'un abus coûterait.

### Stockage dans Neon (A8)
Tables du prototype, dans un **schéma Postgres séparé `prototype`** (proposition), supprimé à la fin de la phase 0 :
| Table | Contenu | Données Google | Rétention |
|---|---|---|---|
| `prototype.runs` | registre : identifiant, jour (Europe/Zurich), mode, brief (nom), variante, statut, phase, compteurs par méthode, coût estimé, durée, codes d'erreur ; unicité `(jour, mode)` pour `reel` | non | durée de P0 (aucune donnée Google, aucun texte libre) |
| `prototype.run_calls` | une ligne par appel payant : exécution (nulle pour une relecture à l'affichage), nature (`execution` ou `relecture`), fournisseur, méthode, SKU, unités, coût estimé (forme de `usage_ledger`, handover § 13) | non | durée de P0 |
| `prototype.runs_attempts` | essais du jeton : heure, résultat | non | 24 h |
| `prototype.programmes` | programme réduit validé par le schéma strict de P0a1 (`programme-reduit.ts`), avec la table `positions` | **oui** (positions, `placeId`) | **30 jours au plus** : `expires_at` écrit à la création |
| `prototype.work` | résultats intermédiaires d'une exécution (candidats, résumés de recherche) | `placeId` seulement ; les positions restent en mémoire de l'étape | supprimés à la fin de l'exécution, réussie ou non ; 24 h au plus |

- **Positions Google gardées 30 jours : ce que Samuel a décidé** (bloquant 6). Décision 0027 § 4, règle provisoire de Samuel pour Q5 (2026-10-12 09:46 CEST) : « aucune donnée Google dans les prompts, seul l'identifiant de lieu stocké, coordonnées gardées 30 jours au plus ». Décision 0028, P0-Q8 : Samuel suit la recommandation « garder les positions dans le programme hors dépôt 30 jours au plus » (option b). Q241 vise le dépôt public : « les programmes générés restent hors du dépôt, 30 jours au plus ». Neon est hors du dépôt. **Q5 (statut des données dérivées de Google) reste ouverte** : la validation juridique formelle viendra avant le lancement (0027 § 4) ; si elle change la règle, `prototype.programmes` est vidée.
- **Écart au « Jamais » de `CLAUDE.md`** (« stocker autre chose que l'identifiant d'un lieu Google ») et au handover § 10 : c'est l'écart que 0027 § 4 et 0028 autorisent pour le prototype, borné à `prototype.programmes` et à 30 jours. L'amendement de `CLAUDE.md` qui consigne cet écart est à faire par le CEO (demande déjà faite dans #149) ; P0r2 ne fusionne pas avant cet amendement. Le test `schéma: aucune colonne de contenu Google` de B1 exclut le schéma `prototype` **par nom**, et `p0: aucune autre table que prototype.programmes ne contient de positions` vérifie le reste.
- **Rôles** : un rôle `vadrouille_prototype` sans `BYPASSRLS`, seul à lire et écrire le schéma `prototype`, créé par migration (`DATABASE_URL_MIGRATOR`, B1) sans mot de passe dans le dépôt. Samuel lui donne un mot de passe dans la console Neon et pose `P0_DATABASE_URL` (P0-Q16). `vadrouille_app` n'a **aucun droit** sur le schéma `prototype` (test). Lignes rattachées à l'organisation fictive `org_prototype`.
- **Une seule base** : si l'intégration Vercel crée une branche Neon par préversion, `P0_DATABASE_URL` pointe sur la branche Neon principale, et la purge (ci-dessous) vise la même base. Vérification par data dans P0r2, notée dans la PR.
- **Purge à 30 jours**, en trois couches :
  1. toute lecture filtre `expires_at > now()` : un programme expiré n'est jamais servi, même s'il n'est pas encore supprimé ;
  2. suppression des lignes expirées au début de chaque exécution et à chaque lecture de la liste des programmes ;
  3. **purge planifiée quotidienne**, indépendante de toute visite. Les tâches planifiées de Vercel ne visent que la production, d'où la proposition (P0-Q17) d'un workflow GitHub Actions planifié (`.github/workflows/p0-purge.yml`). Il se connecte à la même base que `P0_DATABASE_URL` avec un rôle `vadrouille_prototype_purge` limité à `DELETE` des lignes expirées (`P0_PURGE_DATABASE_URL`, secret GitHub posé par Samuel). Points connus (mineur 9) : le fichier touche `.github/workflows/`, donc la PR de P0r2 attend `owner-approved` (Q245) ; GitHub désactive une tâche planifiée après 60 jours sans activité du dépôt, d'où un contrôle de la date de la dernière purge réussie dans le rapport du cycle ; la connexion réveille la base Neon en veille. Alternative à trancher par le Tech Lead : `pg_cron` de Neon, s'il tourne sur la formule gratuite malgré la mise en veille.
  Test : programme expiré jamais servi ; supprimé par chacune des trois couches.

### Clients réels (P0r1)
- **Modèles** : AI SDK et fournisseur OpenRouter (A1, amendement de 0006), confinés à `src/ai`, clé lue par `@/server/env/ai` seulement ; `provider: { data_collection: "deny" }` sur chaque requête (refus de partir sans) ; base d'URL figée dans le code ; identifiants de modèles dans la configuration commitée (A2 de #149, variantes B et A de 0027).
- **Google** : Places API (New) et Routes API, confinés à `src/grounding`, clé lue par `@/server/env/grounding` seulement ; hôtes figés (`places.googleapis.com`, `routes.googleapis.com`) ; masques de champs minimaux ; `cache: "no-store"` sur chaque `fetch`.
- **Lecture des pages** (mineur 16) : couche HTTP réelle derrière la garde de #149 (`fetch-page.ts`, `ip-guard.ts`). Client proposé (A12) : `undici`, par un `Agent` dont la fonction `connect` reçoit l'adresse déjà vérifiée (épinglage), avec `servername` égal au nom d'hôte (TLS et SNI vérifiés sur le nom), jamais le `fetch` global. Variables de proxy : `EnvHttpProxyAgent`, `ProxyAgent` et `setGlobalDispatcher` sont interdits dans `src/research` (liste d'autorisation), et `NODE_USE_ENV_PROXY` posée fait refuser le démarrage du mode réel ; test avec `HTTPS_PROXY` posée : connexion directe à l'adresse vérifiée. Sur Vercel la sortie est directe : le cas `proxy_required` ne se présente pas, il reste testé.
- **Règles d'import** : celles du handover § 3 remplacent la recherche statique de P0a1 (« aucun accès réseau ») pour ces trois dossiers ; la liste d'autorisation des imports de `src/research` est élargie à `undici`, dans `fetch-page.ts` seulement. Lint de confinement : `@/server/env/ai` importable depuis `src/ai` seulement, `@/server/env/grounding` depuis `src/grounding` seulement (tests de lint, handover § 3).
- **Aucune donnée Google dans un prompt** : les étapes de notation, de classement et de rédaction des raisons ne reçoivent que des types maison (identifiants internes, résumés de notre recherche web) ; le constructeur de prompts n'accepte pas d'autre type (handover § 10).
- **Erreurs** : converties dans l'étape en codes d'une énumération fermée et `retryable` ; aucun message, corps de réponse ni pile d'un fournisseur ne sort de l'étape (handover § 8).
- **Journaux et traces** : ni donnée Google, ni brief, ni clé, ni jeton, ni texte de prompt (handover § 13, redaction de #149).

### Plafonds et quotas
Appliqués **avant chaque appel** à partir de `prototype.run_calls`, mois calendaire et jour en fuseau Europe/Zurich :
| Plafond | Valeur | Source |
|---|---|---|
| Par exécution : modèles et recherche web | 3 USD | **proposé**, P0-Q18 |
| Par exécution : recherches web, pages lues, candidats | 60, 150, 90 | proposé (ia-recherche) |
| Par exécution : Text Search, Place Details, Routes | 90, 90, 20 (et 400 éléments) | proposé, sous le quota de 100 par méthode |
| Par exécution : durée | 15 min | proposé |
| Par jour : exécutions réelles | **1** (réservation atomique) | conséquence des quotas |
| Par jour et **par méthode** (Text Search, Place Details, Routes ; Q256) : requêtes Google, exécutions et relectures comprises | 100 au plus (quota de la console) ; le code s'arrête à 95 | Q252, Q256 |
| Par mois : modèles et recherche web | 40 USD | 0027 § 2 ; **plafond dur** : limite de crédit de la clé OpenRouter posée par Samuel |
| Par mois : Google | 20 USD | 0027 § 2 ; **appliqué par le code** avant chaque appel (ci-dessous) ; l'alerte de budget à 20 USD de la console (Q252) prévient seulement |
| Enveloppe jusqu'à G0 | 80 USD de modèles, 40 USD de Google | **proposé**, P0-Q18 |

**Coût Google appliqué par le code** (bloquant 5). Un quota quotidien ne borne pas un coût mensuel, et l'alerte de budget ne fait que prévenir. Donc :
- une **table de prix par SKU** commitée (`config/p0/prix-google.json`, nom proposé), relevée par ia-recherche sur la page de tarifs de Google à la date de P0r1, avec la date de relevé et les tranches gratuites mensuelles ;
- avant chaque appel Google, le code calcule le coût du mois (lignes de `run_calls` du mois, tranches gratuites déduites) et refuse l'appel (`cap_reached`) si l'appel ferait dépasser 20 USD ;
- la PR de P0r1 montre le calcul « quotas × prix » : au plus 100 requêtes par jour et par méthode, sur 31 jours, au prix de la SKU retenue ; si ce maximum dépasse 20 USD, c'est le plafond du code qui borne le mois, pas les quotas.

**Relectures à l'affichage** (mineur 10). Seules les durées de trajet sont relues (Routes). Chaque affichage d'une Journée appelle Routes (`no-store`, aucun cache) et s'inscrit dans `run_calls` (nature `relecture`, exécution nulle). Le jour d'une exécution, celle-ci prend au plus 20 requêtes Routes et laisse au moins 75 relectures. Quand le compteur Routes du jour atteint 95, la relecture **échoue fermée**, sans appel : la Journée renvoie l'état d'erreur existant (« réessayer plus tard »), jamais une durée inventée ni une durée conservée d'un affichage précédent.

### Lecture des programmes (P0r4, P0b2)
- L'adaptateur `prototype` de P0b1 reçoit ses programmes d'une source injectée ; P0r4 ajoute la source **Neon** (lecture par `vadrouille_prototype`, `expires_at > now()`, schéma strict de la forme réduite, `trip.id` validé par `TRIP_ID_PATTERN`). Le chargeur de dossier de P0b1 reste pour les tests.
- **Relecteur Google réel** : durées de trajet relues à l'affichage (Routes), jamais stockées ; `no-store`, rendu dynamique, `Cache-Control: private, no-store` (A6 de #149).
- **Affichage des positions** : les positions Google ne s'affichent que sur la carte Google, et toute donnée de lieu affichée hors de la carte porte la mention « Données de lieux : Google » (`placesFromGoogle`, comme P0b1 ; handover § 10).
- Séances de jugement (P0b2) : Samuel ouvre la préversion de `p0-reel` ; l'ordre des variantes est tiré au hasard par le code (pas par un agent, qui ne voit pas les programmes) et révélé après le formulaire.

## Exigences reprises de #149 (« Renvoyé à la spécification suivante »)
- Quotas : ci-dessus, par méthode (Q256).
- Rétention : purge à 30 jours en trois couches, ci-dessus.
- Transfert : **sans objet**, aucun programme ne quitte Neon ni la préversion.
- Garde de CI : échec sur tout fichier suivi sous `prototype/sorties/` et sur tout motif `placeId` ou coordonnées dans les fichiers suivis (hors fixtures sentinelles) ; aucune URL de base Neon dans le dépôt.
- Garde du mode réel : ci-dessus (liste blanche propre au mode réel, sans l'exception de CI).
- Clients et couche réseau réels : P0r1.
- Essai d'intégration : un essai borné sur `p0-reel`, avant la première exécution comptée, avec un brief réduit à 1 jour de séjour et ces plafonds : 0,30 USD de modèles, 6 recherches web, 15 pages, 9 candidats, 9 Text Search, 9 Place Details, 2 Routes (40 éléments), 5 min ; il consomme le jour ; compteurs dans la PR de P0r3.
- Mineurs de la revue : rotation de la clé Google et plafond de facturation (Q249) ; clé OpenRouter sur « Preview » utilisée seulement par le code serveur du prototype ; registre du jour dans `prototype.runs`.

## Tests attendus (noms proposés)
- `p0: mode réel refusé en production, en CI et sans P0_REAL_RUNS` (chaque condition seule).
- `p0: une seule exécution réelle par jour` (registre du jour, fuseau Europe/Zurich).
- `p0: plafond atteint arrête l'exécution sans programme partiel` (chaque plafond, client simulé).
- `p0: jeton d'exécution exigé et jamais journalisé`.
- `workflows: aucune donnée Google dans l'état sérialisé` (étapes de `p0Run`).
- `p0: programme expiré jamais servi et supprimé` (trois couches).
- `p0: aucune autre table que prototype.programmes ne contient de positions`.
- `p0: les clients réels n'appellent que leurs hôtes figés` ; `p0: data_collection deny sur chaque requête OpenRouter` ; `p0: no-store sur chaque appel Google`.
- `p0: erreur de fournisseur réduite à un code` (message simulé contenant un nom de lieu et une adresse).
- `recherche: le lecteur de pages refuse les adresses internes` et la suite SSRF de #149, sur la couche HTTP réelle (serveur local de test, sans réseau externe).
- e2e sur le build de production, préversion simulée : page `/prototype/executions` absente en mode `mock` et en production ; appel direct aux routes du Workflow SDK pour `p0Run` en production : aucun appel aux clients simulés.
- `p0: mode réel refusé en local` (environnement `local`, toutes les autres conditions vraies).
- `p0: réservation du jour atomique` (deux lancements simultanés : une réservation, un workflow) ; `p0: une exécution échouée ou plafonnée consomme le jour`.
- `p0: chaque étape revérifie la garde` (étape appelée directement en production, en CI, sans `P0_REAL_RUNS` : refus sans appel).
- `p0: jeton limité à 5 essais par heure, comparé en temps constant, masqué dans journaux, traces et erreurs`.
- `p0: plafond mensuel Google appliqué par le code` (table de prix de test, mois presque plein : appel refusé) ; `p0: relecture refusée quand le compteur Routes du jour atteint 95`.
- `prompts: aucun prompt ne contient de donnée Google` (étapes de notation, classement et raisons : types maison seulement ; parcours des prompts journalisés).
- `journaux: ni donnée Google, ni brief, ni clé, ni jeton` (journaux et traces de `p0Run`, exportateurs simulés).
- `affichage: positions Google seulement sur la carte Google ou avec la mention` (écrans de P0r4).
- Lint : `@/server/env/ai` hors de `src/ai` refusé ; `@/server/env/grounding` hors de `src/grounding` refusé.
- Base : `vadrouille_app` n'a aucun droit sur le schéma `prototype` ; `vadrouille_prototype_purge` ne peut que supprimer des lignes expirées.
- `p0: variables de proxy ignorées par le lecteur de pages` (`HTTPS_PROXY` posée) ; `NODE_USE_ENV_PROXY` posée : mode réel refusé.

## Décisions d'architecture attendues (Tech Lead)
| # | Sujet | Proposition |
|---|---|---|
| A1 | Client de modèles | AI SDK et fournisseur OpenRouter, versions notées dans un amendement de 0006 |
| A3 (rappel) | Emplacement du code de P0a1 | dossiers de l'application (`src/ai`, `src/research`, `src/grounding`, `src/domain`) |
| A5 | Où vivent les programmes réels | Neon, schéma `prototype`, ci-dessus (remplace « poste local ») |
| A8 | Tables, rôle et purge du prototype | ci-dessus ; écart au handover § 10 consigné |
| A9 | Accès à la page de lancement | authentification Vercel et jeton d'exécution jusqu'à B3 |
| A10 | Workflow SDK pour `p0Run` | versions de 0009, monde Vercel en préversion, monde local en CI ; routes du SDK nommées et leur authentification consignée ; garde revérifiée à chaque étape ; installé par P0r3 et repris par B9 |
| A11 | Branche et adresse des exécutions réelles | branche longue `p0-reel`, alimentée par fusion de `main` seulement, protégée ; variables « Preview » propres à la branche |
| A12 | Client HTTP de la lecture des pages | `undici` (`Agent` avec `connect` épinglé), version notée dans un amendement de 0006 |

## Hors périmètre
- Production, clés de production, comptes payants (Neon reste en formule gratuite ; Vercel selon la formule actuelle de Samuel).
- Comptes utilisateurs (B3), paiement, workflows du MVP autres que `p0Run`.
- Gemini (Q9).

## Questions pour Samuel (numérotées par le CEO)
- **P0-Q15 — Protection de la préversion** : la protection « Vercel Authentication » est-elle active sur les préversions du projet ? Si oui, rien à faire ; sinon, l'activer (Settings, Deployment Protection). Bloque P0r3.
- **P0-Q16 — Réglages à faire sur Vercel, Neon et GitHub** (liste complète, bloquant 8) : créer la branche `p0-reel` et sa règle de protection (PR obligatoire, pas de poussée forcée) ; sur « Preview », **branche `p0-reel` seulement**, poser `P0_REAL_RUNS=enabled`, `P0_RUN_TOKEN` (valeur aléatoire que tu gardes pour toi) et `P0_DATABASE_URL` ; dans la console Neon, donner un mot de passe au rôle `vadrouille_prototype` créé par la migration (c'est lui qu'utilise `P0_DATABASE_URL`) ; rien à changer sur la clé Maps navigateur (`*.vercel.app` déjà autorisé, Q263). Bloque P0a2, pas le code.
- **P0-Q17 — Purge planifiée** : d'accord pour une tâche GitHub planifiée qui efface chaque jour les programmes de plus de 30 jours (un secret de base à poser dans GitHub) ? Recommandation : oui. Bloque P0r2. Si oui, à poser aussi : le secret GitHub `P0_PURGE_DATABASE_URL` (rôle `vadrouille_prototype_purge`).
- **P0-Q18 — Plafonds qui engagent de l'argent** : d'accord pour **3 USD au plus par exécution** (modèles et recherche web) et une **enveloppe jusqu'à G0 de 80 USD de modèles et 40 USD de Google** ? Ce sont des propositions (P0-Q2 n'a confirmé que les plafonds mensuels de 40 et 20 USD). Recommandation : oui. Bloque P0a2.

## Grille de jugement G0 : « prototype jugé exploitable sur Édimbourg » (P0-PO-10, sous réserve de P0-Q6)
Le jugement porte sur la **variante B**, avec **deux exécutions** de chacun des **trois briefs de référence** d'Édimbourg (reproductibilité). Le prototype est **exploitable** si les **six** exécutions franchissent tous les critères A, et si Samuel, sur **les deux** exécutions de chaque brief parcourues dans P0b2, franchit tous les critères B pour les trois briefs. Juger seulement la meilleure des deux introduirait un biais de sélection : le seuil vaut pour chaque exécution, sous réserve de P0-Q6.

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

**B — Jugement de Samuel** (sur le programme parcouru dans P0b2, formulaire défini par P0b2 ; seuils de qualité, P0-Q6)
| # | Critère | Seuil |
|---|---|---|
| B1 | Erreur critique : lieu fermé ou inexistant, horaire manifestement impossible, événement hors dates ou inventé, adresse dans la mauvaise ville | **0** |
| B2 | Note de 1 à 5 sur pertinence, variété, rythme, justification, surprise (cadrage § 8) | moyenne ≥ **3,5** et aucun axe < 3 (signal d'alerte du cadrage § 12 : pertinence < 3,5) |
| B3 | Étapes et repas que Samuel garderait (« J'aime » ou neutre) parmi toutes les étapes du programme | ≥ **65 %**, soit « Pas pour moi » ≤ 35 % (seuil de G1) |
| B4 | Couverture des incontournables : la liste de 10 lieux d'Édimbourg de Samuel (décision 0027 § 6), jamais donnée au prototype | ≥ **7 sur 10** dans le programme de chaque brief |
| B5 | Trajets : journées au-dessus du budget de trajet du rythme sans justification affichée | **0** |
| B6 | Réponse de Samuel à « Utiliserais-tu ce programme pour ce voyage, avec au plus 5 remplacements ? » | **oui** |

**Comparaison avec la variante A** (mesure de référence, décision 0027). Pour chaque brief, une exécution de la variante A (P0a2). Mesures : critères A1 à A9 (dont R1 à R10, R3 et R10 sans objet), coût et durée par voyage (rapport), et taux de « Pas pour moi » (B3), que Samuel donne sur le programme de la variante A comme sur celui de la variante B. Proposition (P0-PO-12) : Samuel juge les deux programmes d'un même brief **sans savoir lequel vient de quelle variante** (ordre tiré au hasard par le code, révélé après le formulaire). Le tableau de comparaison va dans `docs/produit/p0-jugements.md` ; si B n'apporte rien de mesurable, le Tech Lead peut revenir à A par une décision écrite (0027). La variante A ne compte pas pour G0.

Zakynthos (P0a3) suit la même grille **pour information** : G0 ne nomme qu'Édimbourg. Le résultat (critères A et B, coûts, durées) est consigné dans `docs/produit/p0-jugements.md` (proposition) par l'agent qui recueille les réponses de Samuel ; ce fichier ne contient aucune donnée Google.

P0-Q6 (seuils) reste ouverte. Cette grille est la seule copie : #149 la renvoie ici.
