# P0 (suite) — Exécutions réelles du prototype de recherche, en ligne, sur les briques du MVP

Rôle : ia-recherche (gabarit du Product Owner) · Date : 2026-10-12 · Ticket : #170 · Après #149 (décisions 0026 à 0028 et 0030, jointes à #149) et B1 · Suite de `specs/P0-prototype-recherche.md` (#149, P0a1 et P0b1)

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
- Quotas Google : 100 requêtes par jour et par API, alerte de budget à 20 USD (Q252) ; 40 USD par mois sur OpenRouter, 20 USD par mois sur Google (0027 § 2).
- OpenRouter hors UE accepté en phase 0, briefs de test seulement (P0-Q5) ; DeepSeek via OpenRouter accepté dans les mêmes conditions, à revoir avant la bêta (Q260, 2026-10-12 à 12:48 CEST).
- Positions Google gardées dans le programme hors du dépôt, 30 jours au plus ; durées de trajet relues à l'affichage (P0-Q8, option b ; Q241).

## Prérequis (dans cet ordre)
1. **#149 fusionnée**, puis **P0a1** (pipeline en mode simulé, schéma de la forme réduite) et **P0b1** (adaptateur `prototype`, relecteurs simulés).
2. **B1 fusionnée** (socle base : Drizzle, migrations, rôles, RLS) : les tables du prototype en dépendent. Samuel a levé la porte « après G0 » pour toute la chaîne MVP (2026-10-12), B1 peut donc avancer en parallèle de P0a1.
3. **Décision A3 de P0a1 alignée sur le MVP** : le code du pipeline vit dans `src/ai`, `src/research`, `src/grounding`, `src/domain` (handover § 3), pas dans un dossier isolé du script. La commande `pnpm p0` reste une enveloppe mince autour de ces modules. Sans cela, les étapes du workflow devraient recopier le script (point signalé au Tech Lead dans #149).

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

Une tâche = une spécification courte ou une section de celle-ci = une PR, selon le découpage que le CEO retient.

## Comportement

### Où et comment une exécution tourne
- **Déploiement** : une préversion Vercel (environnement « Preview ») de la branche principale du prototype, protégée par l'**authentification Vercel** (seuls les membres de l'équipe Vercel de Samuel l'ouvrent). Jamais l'environnement « Production » ni `vadrouille-app-ten.vercel.app`.
- **Déclenchement** : Samuel (ou ia-recherche, si Samuel lui donne accès à la préversion) ouvre la page protégée `/prototype/executions` (nom proposé), choisit un brief de `prototype/briefs/` et une variante, et lance. La page appelle une **action serveur** (`src/server/actions/prototype.ts`) qui démarre le workflow et renvoie son identifiant ; aucune route HTTP nouvelle. Le suivi de l'exécution s'affiche sur la même page (statut, phase, compteurs).
- **Exécution durable** : le workflow `p0Run` (`src/workflows/p0-run.ts`) enchaîne les étapes de #149 (brief, plan de recherche, recherche, lecture des pages, ancrage, notation, classement, planification, raisons, validation, écriture), chacune dans une étape `"use step"` courte et rejouable. Une exécution dure jusqu'à 15 min (plafond) : seul un workflow durable tient cette durée sur Vercel sans dépendre d'une durée maximale de fonction.
- **État des étapes** (décision 0009, handover § 8) : identifiants internes, `placeId`, compteurs et codes d'erreur **seulement**. Les résultats intermédiaires (candidats, textes de recherche, programme) sont écrits dans les tables du prototype par l'étape elle-même et relus par identifiant. Jamais de donnée Google, de brief ni de texte libre dans l'état sérialisé du workflow (test `workflows: aucune donnée Google dans l'état sérialisé`, repris pour `p0Run`). La région du monde Vercel reste à vérifier (Q28) ; cette règle rend l'état sans risque quelle que soit la région.
- **Aucune session d'agent ne lit un programme réel** : les agents n'ont ni accès à la préversion protégée (sauf décision de Samuel), ni `DATABASE_URL` de Neon. Le rapport d'exécution que l'agent consulte ne contient que des compteurs, coûts, durées et codes (comme dans #149).

### Garde du mode réel
Le mode réel s'ouvre **seulement** si toutes les conditions suivantes sont vraies, testées une à une :
- `isProductionDeployment()` est faux (décision 0017 § 11.0), et l'environnement résolu par `src/server/env.ts` est `staging` (préversion) ou `local` (développement) ;
- `P0_REAL_RUNS=enabled` (nom proposé) est posée **sur « Preview » seulement**, par Samuel ;
- l'exécution vient de l'action serveur, jamais d'une ligne de commande en CI : en CI (`CI=true`), le mode réel est toujours refusé, sans exception (pas de reprise de l'exception `VADROUILLE_PROTOTYPE`/`CI` de l'adaptateur, revue du head 7bd89e3, point 4) ;
- le registre du jour ne montre aucune exécution réelle (une par jour, quotas) ;
- les plafonds du mois et de l'enveloppe ne sont pas atteints.
Sinon : erreur fermée constante (`real_mode_unavailable`, `daily_run_used`, `cap_reached`), aucune lecture de clé, aucun appel.

**Accès à la page.** La protection de Vercel est la première barrière ; elle ne suffit pas seule (contournable par un lien de partage ou une protection désactivée par erreur). Seconde barrière proposée (A9, Tech Lead) : l'action serveur exige un **jeton d'exécution** `P0_RUN_TOKEN` (32 octets aléatoires, posé par Samuel sur « Preview », saisi sur la page, comparé en temps constant, jamais journalisé) tant que l'authentification du MVP (B3) n'existe pas ; B3 le remplacera par la session du propriétaire. Dans tous les cas, les plafonds bornent ce qu'un abus coûterait.

### Stockage dans Neon (A8)
Tables du prototype, dans un **schéma Postgres séparé `prototype`** (proposition), supprimé à la fin de la phase 0 :
| Table | Contenu | Données Google | Rétention |
|---|---|---|---|
| `prototype.runs` | registre : identifiant, date (fuseau Europe/Zurich), brief (nom), variante, statut, phase, compteurs par API, coût estimé, durée, codes d'erreur | non | durée de P0 (aucune donnée Google, aucun texte libre) |
| `prototype.run_calls` | une ligne par appel payant : fournisseur, SKU, unités, coût estimé (forme de `usage_ledger`, handover § 13) | non | durée de P0 |
| `prototype.programmes` | programme réduit validé par le schéma strict de P0a1 (`programme-reduit.ts`), avec la table `positions` | **oui** (positions, `placeId`) | **30 jours au plus** (P0-Q8) : `expires_at` écrit à la création |
| `prototype.work` | résultats intermédiaires d'une exécution (candidats, résumés de recherche) | positions en mémoire seulement ; `placeId` | supprimés à la fin de l'exécution, réussie ou non ; 24 h au plus |

- **Écart signalé avec le handover § 10** (« seul `placeId` est stocké durablement ; aucune colonne de contenu Google ») : `prototype.programmes` garde des positions 30 jours, sur décision de Samuel (P0-Q8, Q241). Le test `schéma: aucune colonne de contenu Google` de B1 exclut le schéma `prototype` **par nom**, et un test propre au prototype vérifie qu'aucune autre table ne contient de positions. À consigner par le Tech Lead dans A8.
- **Rôles** : un rôle `vadrouille_prototype` sans `BYPASSRLS`, seul à lire et écrire le schéma `prototype` ; `vadrouille_app` n'y a aucun droit. Lignes rattachées à l'organisation fictive `org_prototype`.
- **Branches Neon** : si l'intégration Vercel crée une branche Neon par préversion, les programmes vivraient dans plusieurs branches. Exigence : une seule base pour le prototype (variable `P0_DATABASE_URL` pointant sur la branche principale, ou intégration réglée sans branche par préversion) ; vérification par data dans P0r2, notée dans la PR.
- **Purge à 30 jours**, en trois couches :
  1. toute lecture filtre `expires_at > now()` : un programme expiré n'est jamais servi, même s'il n'est pas encore supprimé ;
  2. suppression des lignes expirées au début de chaque exécution et à chaque lecture de la liste des programmes ;
  3. **purge planifiée quotidienne**, indépendante de toute visite : les tâches planifiées de Vercel ne visent que la production, donc proposition d'un workflow GitHub Actions planifié (`.github/workflows/p0-purge.yml`, porte d'approbation du propriétaire, Q245) qui se connecte avec un rôle limité à `DELETE` des lignes expirées (`P0_PURGE_DATABASE_URL`, secret GitHub posé par Samuel). Alternative à trancher par le Tech Lead : `pg_cron` de Neon, s'il tourne sur la formule gratuite malgré la mise en veille.
  Test : programme expiré jamais servi ; supprimé par chacune des trois couches.

### Clients réels (P0r1)
- **Modèles** : AI SDK et fournisseur OpenRouter (A1, amendement de 0006), confinés à `src/ai`, clé lue par `@/server/env/ai` seulement ; `provider: { data_collection: "deny" }` sur chaque requête (refus de partir sans) ; base d'URL figée dans le code ; identifiants de modèles dans la configuration commitée (A2 de #149, variante B et variante A de 0027).
- **Google** : Places API (New) et Routes API, confinés à `src/grounding`, clé lue par `@/server/env/grounding` seulement ; hôtes figés (`places.googleapis.com`, `routes.googleapis.com`) ; masques de champs minimaux ; `cache: "no-store"` sur chaque `fetch`.
- **Lecture des pages** : couche HTTP réelle derrière la garde de #149 (`fetch-page.ts`, `ip-guard.ts`) : connexion à l'adresse vérifiée (épinglage), TLS et SNI vérifiés sur le nom d'hôte, variables de proxy ignorées. Sur Vercel, la sortie est directe : le cas `proxy_required` ne se présente pas, il reste testé.
- **Règles d'import** : celles du handover § 3 remplacent la recherche statique de P0a1 (« aucun accès réseau ») pour ces trois dossiers ; la liste d'autorisation des imports de `src/research` est élargie au seul client HTTP retenu, dans `fetch-page.ts` seulement.
- **Erreurs** : converties dans l'étape en codes d'une énumération fermée et `retryable` ; aucun message, corps de réponse ni pile d'un fournisseur ne sort de l'étape (handover § 8).

### Plafonds et quotas
Repris de #149 avant découpage (0027 § 2, Q252), appliqués **avant chaque appel** à partir de `prototype.run_calls` :
| Plafond | Valeur |
|---|---|
| Par exécution : modèles et recherche web | 3 USD (proposé, P0-Q2) |
| Par exécution : recherches web, pages lues, candidats | 60, 150, 90 |
| Par exécution : Places Text Search, Place Details, Routes | 90, 90, 20 (et 400 éléments) |
| Par exécution : durée | 15 min |
| Par jour : exécutions réelles | **1** (registre) |
| Par jour : requêtes Google, **par méthode** (Text Search, Place Details, Routes ; Q256), exécutions et relectures de P0r4 comprises | sous 100, avec une marge de 5 réservée aux relectures du jour |
| Par mois | 40 USD OpenRouter (limite de crédit de la clé, plafond dur) ; 20 USD Google (quotas de la console, plafond dur) |
| Enveloppe jusqu'à G0 | 80 USD de modèles, 40 USD de Google (proposé) |

**Quota par méthode** (Q256, P0-Q14, tranchée par Samuel le 2026-10-12 à 12:48 CEST : « je suis tes reco ») : les 100 requêtes par jour se comptent **par méthode** (Text Search, Place Details et Routes séparément). Le registre compte donc chaque méthode à part ; les plafonds par exécution ci-dessus restent sous 100 pour chacune, marge des relectures comprise. Les valeurs vivent dans la configuration commitée (A2).

### Lecture des programmes (P0r4, P0b2)
- L'adaptateur `prototype` de P0b1 reçoit ses programmes d'une source injectée ; P0r4 ajoute la source **Neon** (lecture par `vadrouille_prototype`, `expires_at > now()`, schéma strict de la forme réduite, `trip.id` validé par `TRIP_ID_PATTERN`). Le chargeur de dossier de P0b1 reste pour les tests.
- **Relecteur Google réel** : durées de trajet relues à l'affichage (Routes), jamais stockées ; `no-store`, rendu dynamique, `Cache-Control: private, no-store` (A6 de #149).
- Séances de jugement (P0b2) : Samuel ouvre la préversion protégée ; ordre des variantes tiré au hasard par le code (pas par un agent, qui ne voit pas les programmes) et révélé après le formulaire.

## Exigences reprises de #149 (« Renvoyé à la spécification suivante »)
- Quotas : ci-dessus, par méthode (Q256).
- Rétention : purge à 30 jours en trois couches, ci-dessus.
- Transfert : **sans objet**, aucun programme ne quitte Neon ni la préversion.
- Garde de CI : échec sur tout fichier suivi sous `prototype/sorties/` et sur tout motif `placeId` ou coordonnées dans les fichiers suivis (hors fixtures sentinelles) ; aucune URL de base Neon dans le dépôt.
- Garde du mode réel : ci-dessus (liste blanche propre au mode réel, sans l'exception de CI).
- Clients et couche réseau réels : P0r1.
- Essai d'intégration : un essai borné (1 brief, plafonds divisés par 10) sur la préversion, avant la première exécution comptée ; compteurs dans la PR.
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
- e2e sur le build de production, préversion simulée : page `/prototype/executions` absente en mode `mock` et en production.

## Décisions d'architecture attendues (Tech Lead)
| # | Sujet | Proposition |
|---|---|---|
| A1 | Client de modèles | AI SDK et fournisseur OpenRouter, versions notées dans un amendement de 0006 |
| A3 (rappel) | Emplacement du code de P0a1 | dossiers de l'application (`src/ai`, `src/research`, `src/grounding`, `src/domain`) |
| A5 | Où vivent les programmes réels | Neon, schéma `prototype`, ci-dessus (remplace « poste local ») |
| A8 | Tables, rôle et purge du prototype | ci-dessus ; écart au handover § 10 consigné |
| A9 | Accès à la page de lancement | authentification Vercel et jeton d'exécution jusqu'à B3 |
| A10 | Workflow SDK pour `p0Run` | versions de 0009, monde Vercel en préversion, monde local en CI ; installé par P0r3 et repris par B9 |

## Hors périmètre
- Production, clés de production, comptes payants (Neon reste en formule gratuite ; Vercel selon la formule actuelle de Samuel).
- Comptes utilisateurs (B3), paiement, workflows du MVP autres que `p0Run`.
- Gemini (Q9).

## Questions pour Samuel (numérotées par le CEO)
- **P0-Q15 — Protection de la préversion** : la protection « Vercel Authentication » est-elle active sur les préversions du projet ? Si oui, rien à faire ; sinon, l'activer (Settings, Deployment Protection). Bloque P0r3.
- **P0-Q16 — Deux variables à poser sur « Preview »** : `P0_REAL_RUNS=enabled` et `P0_RUN_TOKEN` (valeur aléatoire que tu gardes pour toi). Bloque P0a2, pas le code.
- **P0-Q17 — Purge planifiée** : d'accord pour une tâche GitHub planifiée qui efface chaque jour les programmes de plus de 30 jours (un secret de base à poser dans GitHub) ? Recommandation : oui. Bloque P0r2.

## Grille de jugement G0 : « prototype jugé exploitable sur Édimbourg » (P0-PO-10, sous réserve de P0-Q6)
Le jugement porte sur la **variante B**, avec **deux exécutions** de chacun des **trois briefs de référence** d'Édimbourg (reproductibilité). Le prototype est **exploitable** si les **six** exécutions franchissent tous les critères A, et si Samuel, sur la meilleure des deux exécutions de chaque brief parcourue dans P0b2, franchit tous les critères B pour les trois briefs.

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

**Comparaison avec la variante A** (mesure de référence, décision 0027). Pour chaque brief, une exécution de la variante A (P0a2). Mesures : critères A1 à A9 (dont R1 à R10, R3 et R10 sans objet), coût et durée par voyage (rapport), et taux de « Pas pour moi » (B3), que Samuel donne sur le programme de la variante A comme sur celui de la variante B. Proposition (P0-PO-12) : Samuel juge les deux programmes d'un même brief **sans savoir lequel vient de quelle variante** (ordre tiré au hasard par le code, révélé après le formulaire). Le tableau de comparaison va dans `docs/produit/p0-jugements.md` ; si B n'apporte rien de mesurable, le Tech Lead peut revenir à A par une décision écrite (0027). La variante A ne compte pas pour G0.

Zakynthos (P0a3) suit la même grille **pour information** : G0 ne nomme qu'Édimbourg. Le résultat (critères A et B, coûts, durées) est consigné dans `docs/produit/p0-jugements.md` (proposition) par l'agent qui recueille les réponses de Samuel ; ce fichier ne contient aucune donnée Google.

Les séances se tiennent sur la préversion protégée ; l'ordre des variantes est tiré au hasard par le code (P0b2), pas par un agent. P0-Q6 (seuils) reste ouverte.
