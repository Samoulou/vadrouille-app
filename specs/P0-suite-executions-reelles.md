# P0 (suite) — Exécutions réelles du prototype de recherche, en ligne : cadre et clients réels (P0r1)

Rôle : ia-recherche (gabarit du Product Owner) · Date : 2026-10-12 · Ticket : #170 · Décisions 0026 à 0028 et 0030 (#149, fusionnée), 0031 (découpage, jointe à cette PR) · Suite de `specs/P0-prototype-recherche.md` (#149, P0a1 et P0b1)

**Périmètre (découpage décidé par le Tech Lead le 2026-10-12, décision 0031).** Cette spécification fixe le **cadre** des exécutions réelles et ne spécifie en détail que **P0r1** (clients réels, sans aucun appel déclenchable). P0r2 à P0r4 et les exécutions P0a2, P0b2, P0a3 sont renvoyés à la spécification suivante (« Renvoyé à la spécification suivante »), avec leurs exigences d'entrée.

## Objectif
Faire tourner le prototype de recherche **pour de vrai** (OpenRouter, Google Places et Routes) sur Édimbourg puis Zakynthos, et laisser Samuel parcourir les programmes produits dans les écrans existants, pour juger G0.

Samuel, 2026-10-12 à 12:47 CEST, dans le projet Claude (réponse à Q257, P0-Q13) : « Non ça ne tournera pas sur mon poste, je suis en full remote, je travail dans le cloud, sur des ordi différents. On a défini un architecture pour lancer le projet en MVP on la suit, Fait en sorte que arrive en MVP. C'est important d'itérer vers une version assez proche de la réalité. »

Ce que cette spécification en tire :
- **Rien ne tourne sur un poste** : ni exécution, ni lecture des programmes. Les options « poste local » (A5 de #149) et « dossier du projet Claude » (P0-Q12 b) sont abandonnées, ainsi que l'option « workflow GitHub approuvé » de Q235 ; P0c de #149 est absorbé par l'exécution en ligne (spécification suivante).
- **Les exécutions réelles empruntent le chemin du MVP** (`docs/handovers/backend.md`) : modules `src/ai`, `src/research`, `src/grounding` (B7, B8), exécution durable par le Workflow SDK (décision 0009, B9), base Postgres Neon à Francfort (Q24, socle B1), déploiement Vercel (décision 0002). Le code de P0 **devient** le premier morceau de B7 et B8, au lieu d'un script jetable : « le prototype P0 alimente ce chapitre sans être recopié » (handover § 8).
- **Rien de public, rien en production** (Q235, Q250) : exécution et lecture sur une préversion Vercel protégée, jamais sur l'environnement « Production ».

## Ce qui est déjà en place (2026-10-12)
- Clés `OPENROUTER_API_KEY` et `GOOGLE_MAPS_SERVER_KEY` posées par Samuel dans Vercel, sur « Preview » et « Development » seulement (Q249, Q250).
- Projet Neon gratuit à Francfort (Postgres 17), relié à Vercel pour « Development » et « Preview » (`STATUS.md`, 2026-10-12 vers 11:35).
- Quotas Google : 100 requêtes par jour et par méthode (Q252, Q256), alerte de budget à 20 USD (Q252) ; 40 USD par mois sur OpenRouter, 20 USD par mois sur Google (0027 § 2).
- OpenRouter hors UE accepté en phase 0, briefs de test seulement (P0-Q5) ; DeepSeek via OpenRouter accepté dans les mêmes conditions, à revoir avant la bêta (Q260, 2026-10-12 à 12:48 CEST).
- Positions Google gardées dans le programme hors du dépôt, 30 jours au plus ; durées de trajet relues à l'affichage (0027 § 4, 0028 P0-Q8 b ; Q241). Q5 reste ouverte.
- Chaîne MVP B1 à B12 ouverte avant G0 par Samuel (décision 0029, ticket #164).

## Prérequis de P0r1
1. **P0a1 fusionnée** (pipeline en mode simulé, schéma de la forme réduite, garde de lecture des pages `fetch-page.ts` et `ip-guard.ts`).
2. **Décision A3 de P0a1 alignée sur le MVP** : le code du pipeline vit dans `src/ai`, `src/research`, `src/grounding`, `src/domain` (handover § 3), pas dans un dossier isolé du script. La commande `pnpm p0` reste une enveloppe mince autour de ces modules.
3. Décisions D1, D12 et D13 (ci-dessous) prises par le Tech Lead avant ou avec la PR de P0r1.

P0r1 ne dépend ni de B1, ni de B3, ni d'une base : il n'écrit rien en base et ne lit aucune variable par `src/server/env.ts`.

## Découpage (feuille de route)
| Tâche | Contenu | Rôle | Spécifiée |
|---|---|---|---|
| **P0r1** | Clients réels (modèles, Places, Routes, lecture des pages) ; modules d'environnement étroits ; port de consommation `@/server/usage` avec implémentation en mémoire ; table de prix Google ; aucun appel déclenchable | ia-recherche | **ici** |
| **P0r2** | Tables du prototype dans Neon, rôles, purge à 30 jours ; implémentation Neon du port de consommation | data, avec ia-recherche | spécification suivante |
| **P0r3** | Workflow `p0Run`, branche et préversion des exécutions, page de lancement, garde complète du mode réel, plafonds, essai d'intégration | ia-recherche, backend | spécification suivante |
| **P0r4** | Adaptateur `prototype` sur Neon ; relecteur Google réel | ia-recherche | spécification suivante |
| **P0a2, P0b2, P0a3** | Exécutions d'Édimbourg, jugement de Samuel, Zakynthos (tâches nommées par #149) | ia-recherche, Samuel | spécification suivante |

## Comportement de P0r1

### Aucun appel déclenchable
P0r1 livre des clients réels **qui ne sont branchés à aucun point d'entrée** : ni action serveur, ni route, ni workflow, ni commande. L'option `--reel` de `pnpm p0` reste fermée (`real_mode_unavailable`, #149) ; le branchement et la garde complète du mode réel arrivent avec P0r3. Les tests appellent les clients avec une couche HTTP de test (serveur local ou double), jamais les services réels. Test `p0: aucun client réel atteignable depuis un point d'entrée` (graphe d'imports : aucun fichier de `src/app`, `src/server/actions`, `src/workflows` ni du script n'importe les fabriques de clients réels).

### Modules d'environnement étroits (bloquant 5 de la revue du head 2639d52)
- P0r1 livre `src/server/env/ai.ts` (`@/server/env/ai`), qui lit et valide **seulement** `OPENROUTER_API_KEY`, et `src/server/env/grounding.ts` (`@/server/env/grounding`), qui lit et valide **seulement** `GOOGLE_MAPS_SERVER_KEY`. Chacun est autonome : il ne dépend pas de `src/server/env.ts` (absent de `main`, livré par B3). Quand B3 livrera `src/server/env.ts`, celui-ci validera ces variables au démarrage sans exporter leur valeur (handover § 2), sans changer ces deux modules.
- Lecture **paresseuse**, à l'appel de la fabrique du client, jamais à l'import ; valeur absente : erreur fermée `missing_key`, sans aucune valeur dans un message exporté.
- Lint de confinement (handover § 3), avec ses tests : `@/server/env/ai` importable depuis `src/ai` seulement ; `@/server/env/grounding` depuis `src/grounding` seulement ; lecture de `OPENROUTER_API_KEY` ou de `GOOGLE_MAPS_SERVER_KEY` (`process.env` et chaîne littérale) refusée hors de ces deux fichiers.

### Port de consommation `@/server/usage` (bloquant 6)
Le handover § 3 interdit à `src/ai` et à `src/grounding` d'accéder à `db/` ; `src/ai` n'importe que `@/server/usage` pour la consommation. P0r1 définit donc ce port :
- **Interface** (`src/server/usage/port.ts`) : enregistrer un appel (`recordCall`, avec fournisseur, méthode, SKU, unités, coût estimé en micro-USD, nature `execution` ou `relecture`, identifiant d'exécution facultatif) et consulter les consommations du jour ou du mois avant un appel (`consumption`) ; forme exacte, dont une réservation atomique pour la spécification suivante : décision D13. Types maison stricts, aucun champ pour une donnée Google, un prompt ou un texte libre.
- **Injection** : les clients reçoivent une implémentation du port à leur création ; ils ne connaissent ni la base ni le schéma.
- **Implémentation de P0r1** : en mémoire seulement, pour les tests. L'implémentation Neon (`prototype.run_calls`) arrive avec P0r2 ; l'implémentation `usage_ledger` du MVP la remplacera avec B7 et B9 (migration nommée : `run_calls` vers `usage_ledger`, mêmes colonnes).
- **Contrôle avant appel** : chaque client consulte le port et refuse l'appel (`cap_reached`) si un plafond passé à sa création serait dépassé. Les **valeurs** des plafonds sont fixées par la spécification suivante ; P0r1 teste le mécanisme avec des valeurs de test.
- Test d'import : `src/ai` et `src/grounding` n'importent de `src/server` que `@/server/usage` (le port, jamais une implémentation) et leur module d'environnement.

### Clients réels
- **Modèles** : AI SDK et fournisseur OpenRouter (décision D1, amendement de 0006), confinés à `src/ai`, clé par `@/server/env/ai` ; `provider: { data_collection: "deny" }` sur chaque requête (refus de partir sans) ; base d'URL figée dans le code ; identifiants de modèles dans la configuration commitée (A2 de #149, variantes B et A de 0027).
- **Google** : Places API (New) et Routes API, confinés à `src/grounding`, clé par `@/server/env/grounding` ; hôtes figés (`places.googleapis.com`, `routes.googleapis.com`) ; masques de champs minimaux ; `cache: "no-store"` sur chaque requête.
- **Lecture des pages** : couche HTTP réelle derrière la garde de #149 (`fetch-page.ts`, `ip-guard.ts`). Client proposé (décision D12) : `undici`, par un `Agent` dont l'option `connect.lookup` renvoie **l'adresse déjà vérifiée** par la garde (épinglage, aucune seconde résolution), avec `servername` égal au nom d'hôte (TLS et SNI vérifiés sur le nom) ; jamais le `fetch` global. Chaque redirection est suivie à la main et **revalidée** par la garde (3 au plus) ; corps limité à 2 Mo après décompression et 10 s par page au total, comme dans #149. Variables de proxy : `EnvHttpProxyAgent`, `ProxyAgent` et `setGlobalDispatcher` sont refusés dans `src/research` (liste d'autorisation des imports et des identifiants) ; test avec `HTTPS_PROXY` posée : connexion directe à l'adresse vérifiée.
- **Règles d'import** : celles du handover § 3 remplacent, pour ces trois dossiers, la recherche statique « aucun accès réseau » de P0a1 ; la liste d'autorisation des imports de `src/research` est élargie à `undici`, dans `fetch-page.ts` seulement.

### Prompts et contenu web
- **Aucune donnée Google dans un prompt** : les étapes de notation, de classement et de rédaction des raisons ne reçoivent que des types maison (identifiants internes, résumés de notre recherche web) ; le constructeur de prompts n'accepte pas d'autre type (handover § 10).
- Les étapes qui reçoivent des résumés de pages n'ont **aucun outil** ; leur sortie est validée par un schéma strict ; les URL de source ne peuvent être que `https:` (test).
- **Erreurs** : converties dans le client en codes d'une énumération fermée et `retryable` ; aucun message, corps de réponse ni pile d'un fournisseur ne sort du client (handover § 8).
- **Journaux et traces** : ni donnée Google, ni brief, ni clé, ni texte de prompt (handover § 13, redaction de #149).

### Table de prix Google
Une **table de prix par SKU** commitée (`config/p0/prix-google.json`, nom proposé), relevée par ia-recherche sur la page de tarifs de Google à la date de la PR de P0r1, avec la date de relevé et les tranches gratuites mensuelles. P0r1 livre la fonction qui calcule le coût d'un mois à partir des consommations du port (tranches gratuites déduites), et montre dans sa PR le calcul « quotas × prix » : au plus 100 requêtes par jour et par méthode, sur 31 jours, au prix de chaque SKU retenue. L'application du plafond mensuel de 20 USD (0027 § 2) arrive avec P0r3.

### Dépendances nouvelles
`ai`, le fournisseur OpenRouter de l'AI SDK et `undici` suivent les conditions du studio : version exacte publiée depuis au moins deux semaines, licence compatible, `pnpm audit` sans vulnérabilité haute, `onlyBuiltDependencies` inchangé (aucun script d'installation), lockfile commité, revue Sécurité, versions notées dans un amendement de 0006.

## Tests attendus de P0r1 (noms proposés)
- `p0: aucun client réel atteignable depuis un point d'entrée`.
- `p0: modules d'environnement étroits` (chacun ne lit que sa variable, à l'appel ; valeur absente : `missing_key` sans valeur) ; lint : `@/server/env/ai` hors de `src/ai` et `@/server/env/grounding` hors de `src/grounding` refusés.
- `p0: les clients réels n'appellent que leurs hôtes figés` ; `p0: data_collection deny sur chaque requête OpenRouter` ; `p0: no-store sur chaque appel Google`.
- `p0: plafond atteint, appel refusé` (port en mémoire, valeurs de test, pour chaque client).
- `p0: src/ai et src/grounding n'importent que le port de consommation`.
- `p0: erreur de fournisseur réduite à un code` (message simulé contenant un nom de lieu et une adresse).
- `prompts: aucun prompt ne contient de donnée Google` (étapes de notation, classement et raisons : types maison seulement ; parcours des prompts journalisés).
- `journaux: ni donnée Google, ni brief, ni clé` (clients réels, exportateurs simulés).
- `recherche: le lecteur de pages refuse les adresses internes` et la suite SSRF de #149, sur la couche `undici` réelle face à un serveur local de test ; épinglage (`connect.lookup` ne résout jamais une seconde fois) ; redirection revalidée ; `HTTPS_PROXY` ignorée.
- `p0: coût Google du mois` (table de prix de test, tranches gratuites).

## Décisions d'architecture attendues (Tech Lead)
Libellés `D…`, pour ne pas les confondre avec les critères A1 à A9 de la grille G0.

| # | Sujet | Proposition |
|---|---|---|
| D1 | Client de modèles | AI SDK et fournisseur OpenRouter, versions notées dans un amendement de 0006 |
| D3 (rappel) | Emplacement du code de P0a1 | dossiers de l'application (`src/ai`, `src/research`, `src/grounding`, `src/domain`) |
| D12 | Client HTTP de la lecture des pages | `undici` (`Agent`, `connect.lookup` épinglé), version notée dans un amendement de 0006 |
| D13 | Port de consommation `@/server/usage` | interface ci-dessus ; implémentations en mémoire (P0r1), Neon (P0r2), `usage_ledger` (B7, B9) |

## Renvoyé à la spécification suivante (décision 0031)
Spécification `specs/P0-suite-2.md` (nom proposé), ticket et PR ouverts par le CEO, place dans le backlog fixée par le CEO. Elle couvre P0r2, P0r3, P0r4, P0a2, P0b2, P0a3, les valeurs des plafonds, la grille G0 et P0-Q6. Le brouillon issu de la revue du head `2639d52` lui sert de base : branche longue `p0-reel` et variables propres à la branche, routes du Workflow SDK et garde revérifiée à chaque étape, réservation atomique du jour, jeton d'exécution, schéma `prototype` et purge en trois couches, relectures plafonnées, grille G0 jugée sur les deux exécutions de chaque brief.

**Exigences d'entrée** (bloquants 1 à 4 de la revue consolidée du head `2639d52`, repris tels quels) :
1. « L'intégration Neon–Vercel […] pose ses propres identifiants (rôle propriétaire, hors RLS) sur toutes les préversions Preview, `claude/…` comprises. Le risque accepté en Q250 ne couvre que les clés OpenRouter et Google. Limiter ces variables à Development (ou désactiver l'intégration pour Preview), le dire dans la spec, l'ajouter à P0-Q16 et aux vérifications de P0r2, avec un test ou une vérification « aucun identifiant avec droit sur `prototype` hors `p0-reel` ». »
2. « Une branche Neon enfant copie `prototype.programmes` (positions Google comprises) et échappe à la purge. Désactiver les branches Neon par préversion, ou les créer sans le schéma `prototype`, et consigner la fenêtre de restauration d'historique de Neon comme durée réelle maximale. »
3. « `P0_PURGE_DATABASE_URL` est un simple secret GitHub dans un dépôt public ; une PR `claude/…` peut modifier un workflow et le lire. Exiger un GitHub Environment limité à `main` avec relecteur obligatoire, et un workflow déclenché par `schedule`/`workflow_dispatch` seulement. De plus, « limité à `DELETE` des lignes expirées » n'est pas faisable par simple `GRANT` : préciser le mécanisme (politique RLS ou fonction `SECURITY DEFINER`), et amender la liste de rôles de 0007 et le test « aucun rôle ne contourne la RLS » pour `vadrouille_prototype` et `vadrouille_prototype_purge`. »
4. « Seul le lancement exige le jeton ; la lecture des programmes et la relecture Routes ne reposent que sur la protection Vercel. Si elle tombe, les positions stockées sont lisibles et des appels payants déclenchables. Même barrière (jeton ou cookie dérivé) sur les écrans de lecture et la relecture, et test e2e « lecture sans barrière : refus et aucun appel Routes ». »

Ainsi que :
- la garde complète du mode réel : `isProductionDeployment()` ; environnement `staging` résolu par `src/server/env.ts` de B3 (dépendance déclarée) ; `local` et `CI` refusés ; `VERCEL_GIT_COMMIT_REF` égal à `p0-reel` ; `P0_DATABASE_URL` absente : refus ; `src/server/env.ts` refuse de démarrer si une variable `P0_*` est posée en production ;
- les mineurs 7 à 14 et 18 à 21 de la même revue : seul Samuel lance ; protection des déploiements de forks ; fusions vers `p0-reel` par Samuel seul, hors fusion automatique ; jeton vérifié avant la réservation du jour, compteur atomique ; jour des quotas Google à minuit heure du Pacifique ; relectures plafonnées à part ; colonnes Google stockées et origine du nom affiché (pour l'amendement de `CLAUDE.md`) ; authentification des rappels de la file testée sur `p0-reel` ; migration et mots de passe des rôles ; formule Vercel compatible avec le Workflow SDK ; nombre de programmes présentés par brief ;
- l'amendement de `CLAUDE.md` par le CEO avant tout stockage de positions ; B1 avant P0r2.

**Questions déjà posées à Samuel** (fil du projet Claude, 2026-10-12), reprises par la spécification suivante :
- **P0-Q15** — la protection « Vercel Authentication » est-elle active sur les préversions ?
- **P0-Q16** — réglages sur Vercel, Neon et GitHub (branche `p0-reel`, variables propres à la branche, mots de passe des rôles).
- **P0-Q17** — purge quotidienne par une tâche GitHub planifiée (secret dans un GitHub Environment).
- **P0-Q18** — 3 USD au plus par exécution ; enveloppe jusqu'à G0 de 80 USD de modèles et 40 USD de Google.

## Hors périmètre
- Tout appel réel : P0r1 ne déclenche rien.
- Base de données, workflow, préversion, page de lancement (spécification suivante).
- Production, clés de production, comptes payants ; Gemini (Q9).
