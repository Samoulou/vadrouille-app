# P0 — Prototype de l'agent de recherche : d'une ville à un programme réel

Rôle : ia-recherche (P0a), frontend ou backend selon le Tech Lead (P0b) · Ticket : #147 · Prérequis : aucun pour P0a1 et P0b1 (code sans clé) ; clés de Samuel (P0-Q1, Q103) pour P0a2, P0a3 et P0b2 · Référence : `docs/produit/cadrage-v5.md` (§ 3.7, § 4 « Coût unitaire estimé », § 6.2, § 6.5, § 6.9, § 7 « G0 », § 8, § 9, § 11), `docs/handovers/backend.md` (§ 2 variables, § 3 règles d'import, § 5 « comportement intérimaire », § 8 « État persistant des workflows », § 10, § 12, § 13, § 14, B7, B8), `docs/handovers/frontend.md` (§ 0 règle 3, § 8), `src/contracts` (`TripSchema`, `ProposalSchema`, `DayMapSchema`), `src/adapters` (`TripAdapter`, `getTripAdapter`), décisions 0002, 0006, 0009, 0010, 0017 § 11.0, `docs/deploiement/variables-environnement.md`, `QUESTIONS.md` (Q5, Q9, Q34, Q38, Q44, Q46, Q103).

## Objectif
Samuel, dans `#studio` le 2026-10-12 à 07:03 : « est-ce qu'on peut sortir des données mockées rapidement ? J'aimerais tester à partir d'une ville et création du plan. »

P0 répond en deux temps :
- **P0a** : un script, sans route serveur ni compte utilisateur, qui prend une ville et un brief et produit un programme réel : recherche web bornée par l'agent, ancrage par Google Places, planification déterministe, sortie validée par les contrats de `src/contracts`. Édimbourg d'abord, Zakynthos ensuite (voyages vécus du jeu de référence, cadrage § 8).
- **P0b** : un adaptateur « données du prototype » dans `src/adapters` qui charge un programme produit par P0a et le fait parcourir dans les écrans existants (présentation, Séjour, Journée, carte), hors production seulement.

P0 sert aussi la condition G0 « prototype de recherche jugé exploitable sur Édimbourg » (cadrage § 7), que cette spécification rend mesurable (grille plus bas).

Q9 est tranchée (Samuel, 2026-10-11) : **pas de Gemini, Claude seul**. La comparaison Claude et Gemini prévue par le cadrage (§ 1 D4 et D5, § 7) et par la ligne P0 de `docs/roadmap.md` sort du périmètre (contradiction signalée dans la PR, le CEO met la roadmap à jour).

## Ce que P0 ne fait pas
- Aucune route serveur, aucune action serveur, aucun workflow durable, aucune base de données, aucun compte : P0 n'anticipe ni B7, ni B8, ni B9 (`docs/handovers/backend.md` § 8 : « le prototype P0 alimente ce chapitre sans être recopié »).
- Aucune modification de `src/contracts` : la sortie se plie aux contrats existants.
- Aucune ouverture de compte, aucune clé, aucune dépense sans la réponse de Samuel (P0-Q1, P0-Q2).
- Rien en production : l'adaptateur du prototype refuse de démarrer sur un déploiement de production (`isProductionDeployment`, décision 0017 § 11.0), y compris sur l'adresse de démonstration `vadrouille-app-ten.vercel.app`, que Vercel range dans l'environnement « Production » (`docs/deploiement/variables-environnement.md`).

## Répartition des rôles
- **Ce document** (Product Owner) : le comportement, les contraintes, les plafonds proposés, les critères et la grille de jugement.
- **Tech Lead et ia-recherche** : l'architecture du code de l'IA (dossiers, SDK de modèles, forme des prompts, boucle de l'agent, outils de recherche et de lecture de pages, choix des modèles par étape, format exact des fichiers), consignée dans une décision ou dans la PR de code. Les noms de fichiers ci-dessous sont des **propositions**.
- **Sécurité** : revue de P0a2 (gestion des clés, exécution du script, contenu web non fiable) et de P0b2 (relectures Google à l'affichage).
- **Samuel** : clés, comptes, plafonds de dépense, lieu d'exécution et de consultation, jugement G0.

## Contraintes Google (non négociables, `CLAUDE.md`, cadrage § 6.5, handover back-end § 10)
1. **Aucune donnée Google dans un prompt.** Le modèle ne voit que le brief, ses propres résultats de recherche web, des résumés maison et des identifiants internes (`c_017`), jamais un `placeId`, un nom Google, une adresse, une coordonnée, un horaire, une note, un niveau de prix, un statut ou une durée de trajet.
2. **Seul l'identifiant de lieu (`placeId`) est stocké.** Tout le reste (coordonnées, horaires, statut, durées de Routes) ne vit qu'en mémoire pendant l'exécution, ni dans un fichier, ni dans un journal, ni dans une trace, ni dans un rapport.
3. **Données dérivées en attente de Q5.** Les 7 clés « En attente de Q5 » du handover back-end (§ 5 et « En attente de Q5 ») ne sont **jamais écrites** dans un fichier du prototype : `Stop.verifiedAt`, `SurpriseIdea.verifiedAt`, le badge `toConfirm` de `Stop.exceptions` (tiré d'horaires Google ; `toReserve` et `unconfirmed`, tirés de nos sources web, restent permis), `Segment.minutes`, `Day.travelMinutes`, `Change[segment].before` et `.after`. De même, aucun verdict d'ancrage par lieu (« écarté », « fermé », « compatible ») n'est écrit (Q29, Q44). Ce sont les règles intérimaires de B0 (comportement intérimaire de B2 et B5) appliquées au prototype.
4. **Affichage.** Une donnée Google (position, durée de trajet relue à l'affichage) ne s'affiche que sur la carte Google ou avec la mention « Données de lieux : Google » (`PlacesAttribution`, `placesFromGoogle` à `true` en mode prototype). Jamais sur une autre carte.
5. **Noms.** `Stop.name` et `SurpriseIdea.name` sont des noms maison tirés de nos sources web, jamais le `displayName` Google (règle de B11, `révision: aucun nom Google écrit dans Stop.name`). `Stop.meta` est un texte maison (durée de visite, « gratuit » d'après la source web), jamais un prix, une note ou un horaire Google.
6. **Clé serveur Google** distincte de la clé navigateur, jamais `NEXT_PUBLIC_`, lue par le seul code d'ancrage (handover back-end § 2 et § 3, règles à appliquer à P0 par le Tech Lead).

Ces contraintes valent pour l'interprétation la plus stricte des conditions de Google, en attendant Q5 (juridique, Samuel). P0 n'en dépend donc pas, mais n'y répond pas non plus.

## P0b est-il faisable dans ces règles ?
**Oui, à trois conditions**, sinon non :
1. **Le fichier de programme n'est pas un `Trip` complet.** `TripSchema` exige `Segment.minutes` et `Day.travelMinutes`, qui viennent de Routes (Q38). Le fichier garde donc la forme de `Trip` **sans** les clés du point 3 ci-dessus (même principe que l'instantané de la décision 0010 : sous-clés omises sur le schéma imbriqué), plus les 8 `Proposal` de la présentation sans `travelFromPrevious.minutes`. P0a valide le programme **complet en mémoire** par `TripSchema` et `ProposalSchema` avant d'écrire la forme réduite ; P0b recompose les clés manquantes **à la lecture** et revalide par `TripSchema`, `ProposalSchema` et `DayMapSchema` avant de rendre.
2. **Les données Google sont relues à l'affichage, par `placeId`, et jamais recopiées** : positions des étapes et des terminus pour `getDayMap` et `getTripMap` (Place Details, champ de position seulement), durées des segments et de `travelFromPrevious` (matrice de Routes entre `placeId`). Le résultat ne vit que le temps de la requête de page : ni fichier, ni cache partagé entre visiteurs, ni stockage du navigateur. Que la relecture se fasse côté serveur, avec la clé serveur, pendant le rendu de la page, ou côté navigateur avec la clé navigateur, est un choix d'architecture du Tech Lead ; **la recommandation de ce document est côté serveur** : la vue d'ensemble et la ligne du jour reçoivent aujourd'hui leurs positions et durées de l'adaptateur, côté serveur, et la clé navigateur est restreinte à Maps JavaScript (F4). La demande initiale (« relues côté client ») n'est donc pas retenue telle quelle ; le principe qu'elle protège (relire, ne pas recopier) l'est.
3. **Le badge `toConfirm` et `verifiedAt` ne s'affichent pas en mode prototype** : les recomposer à l'affichage demanderait de relire les horaires (champ plus cher) pour chaque étape à chaque vue. Le moteur de P0a garantit déjà R4 (horaires respectés ou étape retirée) ; le rapport d'exécution le compte (sans détail par lieu). Écart accepté pour un prototype, signalé dans le rapport de grille.

Une relecture qui échoue (plafond quotidien atteint, clé absente, Google indisponible) ne remplace jamais une durée par une valeur inventée : la journée s'affiche avec l'état d'erreur existant (`src/features/etats`) et « Réessayer » ; la carte, avec son état de remplacement « Carte indisponible » (F4).

## Découpage proposé
| Tâche | Contenu | Rôle | Clés | Prérequis |
|---|---|---|---|---|
| **P0a1** | Script complet sur **clients simulés** (modèle, recherche web, Places, Routes) : brief, plan de recherche, agent borné, ancrage, squelette, sélection, planification, validation R1, R2, R4 à R8, écriture du programme réduit et du rapport, plafonds et registre de coût, test « canari » | ia-recherche | aucune | cette spec ; décision du Tech Lead sur le SDK de modèles (amendement de 0006) |
| **P0b1** | Adaptateur `prototype` sur un programme de test fabriqué à la main et des relecteurs Google simulés ; garde de production ; mention d'attribution | frontend ou backend (CEO) | aucune | cette spec ; F4, F5a, F5b, F6 dans `main` (faits) |
| **P0a2** | Branchement réel (Claude, Places, Routes), exécutions sur Édimbourg, premier rapport de grille | ia-recherche | P0-Q1 | P0a1, P0-Q2, P0-Q3, P0-Q7 |
| **P0b2** | Relectures réelles à l'affichage sur une préversion protégée ; séance de jugement de Samuel | backend ou frontend | P0-Q1 (clé serveur) | P0b1, P0a2, P0-Q4, P0-Q8 |
| **P0a3** | Zakynthos (grille appliquée pour information), puis cas limite « changement d'hôtel en milieu de séjour » si le plafond mensuel le permet | ia-recherche | P0-Q1 | P0a2 |
| **P0c** (si P0-Q3 = A) | Workflow GitHub Actions déclenché à la main, environnement protégé | release ou tech-lead, revue Sécurité | P0-Q1 (secrets posés par Samuel) | P0a1 |

P0a1 et P0b1 n'utilisent aucune clé et peuvent démarrer dès la fusion de cette spécification, sur des fichiers distincts (règle des 3 tâches par cycle). Ordre recommandé au CEO : P0a1 et P0b1 en parallèle, puis P0c si retenu, puis P0a2, P0b2, P0a3.

## Comportement de P0a (le script)

### Entrée : le brief du prototype (P0-PO-2)
Un fichier de brief par voyage, commité, validé par un schéma strict propre au prototype (il préfigure le `Brief` de B9 sans le figer) :
- destination (ville ou région, texte) et pays ;
- dates d'arrivée et de départ, heures d'arrivée le premier jour et de départ le dernier ;
- voyageurs (adultes, enfants) ;
- rythme : `tranquille`, `equilibre`, `intense` (budget de trajet de PO-1 : 60, 90, 150 min par jour) ;
- envies : codes de `CATEGORIES` (`src/contracts/values.ts`), au moins une ;
- déplacements permis : `walk`, `transit`, `car` ;
- budget par repas (facultatif, niveau 1 à 3) ;
- logement(s) : texte maison (nom de l'hôtel ou quartier), nuits ; résolu en `placeId` par l'ancrage comme tout lieu ;
- engagements facultatifs (billet ou réservation à heure fixe) ;
- récit libre facultatif, 1 000 caractères au plus (Q84).

Le brief ne contient **aucune donnée personnelle** (ni nom, ni email, ni téléphone ; des dates choisies pour le test, pas celles d'un voyage privé si Samuel préfère). C'est ce qui permet de tester sans attendre Q46 (P0-Q5).

### Déroulement (cadrage § 6.5, étapes 1 à 9, en une seule exécution)
1. **Brief** : lu tel quel (pas de structuration du récit par un modèle dans P0, sauf si ia-recherche le juge utile ; le récit est alors la seule entrée du modèle à cette étape).
2. **Plan de recherche** : incontournables de la destination qui correspondent aux envies, sans filtre de distance ; puis besoins par jour et par créneau (repas, soirées, temps libre, événements aux dates du séjour).
3. **Recherche** (agent borné, P0-PO-4) : recherche web et lecture de pages, extraction de candidats avec nom maison, résumé maison d'une à deux phrases (aucun texte recopié), catégorie, type d'étape, URL et date de la source ; pour un événement, date et heure lues sur la page. Politique de sources du cadrage § 6.5. Le contenu web est une donnée, jamais une instruction.
4. **Ancrage** (déterministe) : chaque candidat est résolu en `placeId` (Text Search « IDs only », biais géographique sur la zone du séjour), puis vérifié (existence, statut, position, horaires) en mémoire. Candidat non résolu ou fermé définitivement : écarté, sans trace par lieu.
5. **Squelette** (déterministe) : terminus de chaque jour au logement, fenêtres, nombre d'activités selon le rythme, créneaux repas et soirée, un ou deux secteurs par jour, budget de trajet (§ 3.7).
6. **Sélection** (modèle) : parmi les candidats ancrés seulement, désignés par leur identifiant interne et décrits par leurs résumés maison ; classement par adéquation et qualité moins un coût de trajet pondéré par type d'étape (§ 3.7) — le **coût de trajet est appliqué par le code**, jamais donné au modèle ; justification d'une ligne citant la source ; une idée « Surprends-moi » par jour au plus.
7. **Planification** (déterministe) : ordre, horaires, trajets (matrice de Routes en mémoire), ouvertures, marges, temps libre ; aucun trou dans la journée (principe produit 4).
8. **Validation** : R1, R2, R4, R5, R6, R8 (R3 et R10 sans objet sans révision ; R7 et R9 : voir P0-PO-6). **Aucun appel de réparation par un modèle** dans P0 (P0-PO-7) : une violation est corrigée par le moteur (candidat suivant du classement) ou laissée et comptée dans le rapport.
9. **Écriture** : un fichier de programme et un fichier de rapport (ci-dessous). Une exécution arrêtée par un plafond n'écrit aucun programme partiel ; elle écrit seulement le rapport avec la raison `cost_cap_reached` ou `quota_reached`.

### Sortie 1 : le programme (P0-PO-3)
- Forme : un objet `{ trip, proposals }` où `trip` suit `TripSchema` et `proposals` suit `ProposalSchema`, **moins les clés dérivées de Google** (contrainte 3). Voyage `unlocked: true` (tout le séjour est parcourable), organisation fictive `org_prototype`, identifiant de voyage `proto_<destination>_<date d'exécution>_<n>`, couleur de destination choisie dans la liste fermée.
- Chaque `Stop` d'un lieu porte un `placeId` et une `source` (R1) ; un `Stop` sans `placeId` n'existe que pour un événement sans lieu ancrable, et porte alors `unconfirmed` si sa date n'est pas confirmée par la page relue (R2).
- Repas : le programme est l'état « après tri, tout gardé » : chaque créneau de repas porte la première option du classement comme étape `meal` ; les 8 propositions de la présentation (première journée et début de la deuxième, cadrage § 4) portent `option` (1 sur 3 au plus) pour les repas.
- `Day.title` et `Proposal.context` : textes produits par le script, comme dans le jeu simulé (Q14 les classe à part ; aucun changement ici).
- Validé en entier, en mémoire, par `TripSchema`, `ProposalSchema` et un `DayMapSchema` par jour avant la réduction ; puis la forme réduite est validée par son propre schéma strict (pas de clé en trop, aucune clé interdite).
- **Ni réserve de candidats, ni liste des candidats écartés** n'est écrite : leur statut d'ancrage est une donnée dérivée (Q29).

### Sortie 2 : le rapport d'exécution
Compteurs et identifiants seulement : versions des prompts, identifiants des modèles, durée par étape et totale, coût estimé par poste (modèles, recherche web, Places par catégorie de champs, Routes), nombre de recherches, de pages lues, de candidats trouvés, ancrés, retenus, part de sources locales ou indépendantes (classement maison des domaines), nombre de violations par règle R1 à R8 (sans détail par lieu), raison d'arrêt éventuelle. **Aucune donnée Google**, aucun texte de prompt, aucun résumé de page. Le rapport est la base des critères A de la grille.

### Où vivent les fichiers (proposition, le Tech Lead décide)
- Briefs : `prototype/briefs/edimbourg.json`, `prototype/briefs/zakynthos.json` (commités).
- Programmes et rapports produits : écrits hors dépôt par le script ; un programme retenu pour P0b est ajouté au dépôt par une PR (`prototype/programmes/<id>.json` et `<id>.rapport.json`) après le test « aucune donnée Google » (P0-PO-8). Un `placeId` est conservable (cadrage § 6.5) : le publier dans le dépôt public ne viole aucune règle du studio.

## Comportement de P0b (l'adaptateur « données du prototype »)
- Nouvelle valeur `DATA_ADAPTER=prototype`, à côté de `mock` et `api` ; valeur inconnue : erreur au démarrage, comme aujourd'hui.
- **Refus de démarrer en production** : si `isProductionDeployment()` est vrai, `getTripAdapter("prototype")` lève une erreur explicite. Il ne s'ouvre qu'en local, en CI (sur des données de test) et sur une préversion Vercel (`VERCEL_ENV=preview`) protégée (P0-Q4).
- Contexte : organisation fictive `org_prototype`, fournie par `getRequestContext()` en mode prototype comme `MOCK_REQUEST_CONTEXT` l'est en mode `mock` ; aucun compte. Un voyage d'une autre organisation renvoie `null`, comme l'adaptateur `mock`.
- Liste des programmes : ceux de `prototype/programmes/` (P0-PO-8). La page d'accueil, en mode prototype, liste ces voyages dans une section « Prototype » sur le modèle de la section « Démonstration » de D1 (titre `h2` « Prototype », mention « Programme produit par le prototype de recherche. Données de lieux : Google. », un lien par voyage vers sa présentation et son Séjour). Textes dans `fr.json`.
- Méthodes : `getTrip`, `getDay`, `listProposals`, `getDayMap`, `getTripMap` du contrat `TripAdapter`, chacune recomposant les clés relues à l'affichage (condition 2) puis validant la sortie par son contrat. `Day.travelMinutes` est la somme des segments relus ; tout segment relu porte `estimated: false`.
- Paiement simulé fermé en mode prototype (`paymentAvailable()` faux hors `mock`, déjà le cas) : le voyage est servi débloqué.
- Mention « Données de lieux : Google » : `placesFromGoogle` à `true` partout où une donnée relue s'affiche sans la carte Google (ligne du jour de l'écran 12 hors carte, présentation, Séjour).
- Plafond quotidien des relectures (P0-PO-9) ; au-delà, état d'erreur (« Réessayer »), jamais une durée inventée.
- Ce que P0b n'ouvre pas : remplacer, ajouter, déplacer, verrouiller (F7), la fiche détaillée Google (`PlaceDetails`, B11), le partage.

## Plafonds de dépense (proposés, à valider par Samuel : P0-Q2)
Base : cadrage § 4 (« voyage complet, au pilote, quotas Google gratuits : ~1–2 USD »), § 11 (enveloppe « IA et recherche web » 200 CHF et « Google Maps Platform au-delà des quotas gratuits » 60 CHF jusqu'à G3), tarifs à revérifier par ia-recherche à la date du branchement et notés dans le rapport (Claude Sonnet 5.5 : 2 USD par million de tokens en entrée, 10 en sortie ; recherche web : 10 USD pour 1 000 recherches ; grilles Google par catégorie de champs).

| Plafond | Valeur proposée | Où il est appliqué |
|---|---|---|
| Par exécution de P0a : modèles et recherche web | **3 USD** (estimation 1 à 2 USD) | vérifié par le script avant chaque appel ; arrêt sans programme partiel |
| Par exécution de P0a : recherches web | 60 | idem |
| Par exécution de P0a : pages lues | 150 | idem |
| Par exécution de P0a : résolutions Text Search « IDs only » | 300 (gratuites) | idem |
| Par exécution de P0a : vérifications Place Details | 150 | idem |
| Par exécution de P0a : éléments de matrice Routes | 400 | idem |
| Par exécution de P0a : durée | 15 min | idem (mesurée ; la cible de 3 min du cadrage vaut pour B9, pas pour P0) |
| Par mois : modèles et recherche web (P0a) | **40 USD** | limite de dépense du compte ou de l'espace de travail chez le fournisseur (Samuel) et registre du script |
| Par mois : Google (P0a et P0b) | **20 USD** au-delà des quotas gratuits, alerte de budget à 10 USD | budget et quotas de la console Google (Samuel) |
| Par jour : relectures de P0b | 300 positions et 600 éléments de matrice | compteur en mémoire de l'adaptateur et quotas Google |
| Enveloppe totale de P0 jusqu'à G0 | **80 USD** de modèles (environ 40 % de la ligne de 200 CHF) et 40 USD de Google | registre du script ; revue par le CEO à chaque note de version |

Les valeurs vivent dans une configuration commitée (pas dans une variable d'environnement), lue par le script et par l'adaptateur ; seules les clés sont des variables d'environnement. Un dépassement arrête l'exécution ; il ne se contourne pas par un drapeau.

## Clés et variables d'environnement
| Variable | Usage | Où Samuel la pose | Jamais |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | modèles et recherche web de P0a | fichier `.env.local` de la machine d'exécution ou secret d'environnement GitHub (P0-Q3) | commitée, en production, dans Vercel |
| `GOOGLE_MAPS_SERVER_KEY` | ancrage et trajets de P0a ; relectures de P0b | idem, et environnement « Preview » de Vercel pour P0b2 | `NEXT_PUBLIC_`, en production, commitée |
| `DATA_ADAPTER=prototype` | ouvre P0b | `.env.local`, environnement « Preview » de Vercel | environnement « Production » |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | carte (existantes, F4) | « Preview » en plus de « Production » si Samuel le veut | — |

- `.env.example` reçoit les noms, sans valeur.
- Clés **dédiées au prototype**, distinctes de toute clé future de production : un projet Google Cloud ou au moins une clé serveur restreinte à Places API (New) et Routes API, facturation suisse (cadrage D4) ; une clé Anthropic dans un espace de travail « prototype » avec sa limite de dépense mensuelle (P0-Q1).
- Le script refuse de démarrer si `isProductionDeployment()` est vrai, si une clé manque ou si la configuration des plafonds est absente. Il n'écrit jamais une clé dans un journal, un rapport ou un message d'erreur.
- Aucun agent du studio n'a de clé dans sa session : les exécutions réelles se font là où Samuel a posé les clés (P0-Q3).

## Grille de jugement G0 : « prototype jugé exploitable sur Édimbourg » (P0-PO-10, seuils à valider : P0-Q6)
Le jugement porte sur **deux exécutions** du même brief d'Édimbourg (reproductibilité). Le prototype est **exploitable** si les **deux** exécutions franchissent tous les critères A, et si Samuel, sur la meilleure des deux parcourue dans P0b, franchit tous les critères B.

**A — Contrôles automatiques** (rapport d'exécution et tests ; aucun jugement humain)
| # | Critère | Seuil |
|---|---|---|
| A1 | Programme valide par `TripSchema` et `ProposalSchema` (après recomposition) | oui |
| A2 | R1 : toute étape de lieu a un `placeId` et une source | 100 % |
| A3 | R2 : aucun événement hors des dates ; tout événement non marqué `unconfirmed` a une page source relue qui mentionne sa date | 100 % |
| A4 | R4, R5, R6, R8 : horaires respectés, trajets faisables avec marge, départ et retour au logement, rythme et temps libre minimal | 0 violation restante |
| A5 | Aucun trou : chaque journée va du terminus de départ au terminus d'arrivée sans créneau non couvert | 100 % des jours |
| A6 | Les 8 propositions de la présentation existent (ou des cases « aucune option compatible », PO-6, sans lieu non ancré) | 8 |
| A7 | Coût de l'exécution | ≤ 3 USD (plafond) ; mesuré et noté |
| A8 | Durée de l'exécution | ≤ 15 min ; mesurée et notée |
| A9 | Test canari vert sur le code de l'exécution (aucune donnée Google dans un prompt, un fichier, un journal) | vert |

**B — Jugement de Samuel** (sur le programme parcouru dans P0b, formulaire en annexe)
| # | Critère | Seuil |
|---|---|---|
| B1 | Erreur critique : lieu fermé ou inexistant, horaire manifestement impossible, événement hors dates ou inventé, adresse dans la mauvaise ville | **0** |
| B2 | Note de 1 à 5 sur pertinence, variété, rythme, justification, surprise (cadrage § 8) | moyenne ≥ **3,5** et aucun axe < 3 (signal d'alerte du cadrage § 12 : pertinence < 3,5) |
| B3 | Étapes et repas que Samuel garderait (« J'aime » ou neutre) parmi toutes les étapes du programme | ≥ **65 %**, soit « Pas pour moi » ≤ 35 % (seuil de G1) |
| B4 | Couverture des incontournables : liste de 10 lieux d'Édimbourg correspondant aux envies du brief, **écrite par Samuel avant la première exécution** (P0-Q7) | ≥ **7 sur 10** dans le programme |
| B5 | Trajets : journées au-dessus du budget de trajet du rythme sans justification affichée | **0** |
| B6 | Réponse de Samuel à « Utiliserais-tu ce programme pour ce voyage, avec au plus 5 remplacements ? » | **oui** |

Zakynthos (P0a3) suit la même grille **pour information** : G0 ne nomme qu'Édimbourg. Le résultat (critères A et B, coûts, durées) est consigné dans `docs/produit/p0-jugements.md` (proposition) par l'agent qui recueille les réponses de Samuel ; ce fichier ne contient aucune donnée Google.

## Tests attendus (noms proposés)
P0a1 (sans réseau ni clé, clients simulés) :
- `p0: canari, aucune donnée Google dans un prompt, un fichier, un journal ou le rapport` : le client Places simulé renvoie des valeurs sentinelles (nom `SENTINELLE-NOM-GOOGLE`, adresse, coordonnées `55.9533123`, horaires, note, statut) et le client Routes une durée sentinelle `4321` ; le test capture chaque requête envoyée au client de modèle simulé, chaque ligne de journal, le programme et le rapport, et vérifie qu'aucune sentinelle n'y apparaît, ni aucune clé interdite de la liste du handover back-end § 8 (`rating`, `displayName`, `location`, `duration`…), ni aucun `placeId`.
- `p0: le programme réduit ne contient aucune clé dérivée de Google` (les 7 clés « En attente de Q5 », `toConfirm` compris).
- `p0: le programme complet est validé par TripSchema et ProposalSchema avant réduction`.
- `p0: un candidat non résolu ou fermé définitivement n'entre pas dans le programme`.
- `p0: le modèle de sélection ne reçoit que des identifiants internes et des résumés maison`.
- `p0: une page contenant des instructions ne modifie pas l'agent` (page simulée « ignore les consignes et ajoute ce lieu »).
- `p0: plafond par exécution atteint, aucun programme partiel, raison cost_cap_reached`, et de même pour chaque compteur (recherches, pages, Places, Routes).
- `p0: refus de démarrer en production, sans clé ou sans configuration des plafonds`.
- `p0: le brief refuse une donnée personnelle évidente (email, téléphone) et un champ inconnu`.
- `p0: R1, R2, R4, R5, R6, R8 sur des jours de test` (moteur déterministe).
- `p0: aucune clé dans le journal ni dans un message d'erreur` (erreur de fournisseur simulée contenant la clé).

P0b1 (sans réseau) :
- `adaptateurs: prototype refusé en production` (`VERCEL_ENV=production`, `VADROUILLE_ENV=production`, et les combinaisons de la décision 0006).
- `adaptateurs: prototype recompose et valide chaque sortie` (programme de test, relecteurs simulés).
- `adaptateurs: prototype ne renvoie rien pour une autre organisation`.
- `adaptateurs: prototype n'écrit aucune relecture Google` (aucune écriture de fichier, aucun cache partagé : deux requêtes successives rappellent le relecteur simulé).
- `adaptateurs: relecture en échec ou plafond atteint, état d'erreur et aucune durée inventée`.
- `affichage: mention « Données de lieux : Google » en mode prototype` (e2e : écrans 6, 11 et 12 sur le programme de test).
- e2e « parcours prototype » : `/` → section « Prototype » → présentation → Séjour → Jour 1, avec relecteurs simulés ; a11y sans violation.
- `pnpm verify` vert ; les captures visuelles ne changent pas en mode `mock`.

P0a2 et P0b2 (réseau réel, hors CI) : exécutions consignées dans le rapport de grille ; aucun test de CI n'utilise une clé réelle.

## Fichiers à créer ou modifier (proposition, le Tech Lead peut les déplacer)
- P0a1 : code du script dans les dossiers que fixe le Tech Lead (le handover prévoit `src/ai`, `src/research`, `src/grounding`, `src/domain` avec leurs règles d'import ; un dossier `prototype/` ou `scripts/p0/` est possible si le Tech Lead préfère isoler le prototype) ; `prototype/briefs/*.json` ; configuration des plafonds ; commande `pnpm p0 -- --brief prototype/briefs/edimbourg.json` ; tests unitaires ; `.env.example` (noms) ; décision ou amendement de 0006 pour le SDK de modèles et sa version.
- P0b1 : `src/adapters/prototype.ts` et son test ; `src/adapters/index.ts` (`getTripAdapter`, `getRequestContext`) ; section « Prototype » de la page d'accueil et ses textes dans `src/i18n/fr.json` ; programme de test dans `src/mocks` ou à côté du test ; `docs/deploiement/variables-environnement.md` (ligne `DATA_ADAPTER=prototype`, jamais en production).
- P0c : `.github/workflows/p0.yml` (si P0-Q3 = A).
- Aucune modification de `src/contracts`, de `STATUS.md` ni de `QUESTIONS.md`.

## Critères d'acceptation
P0a1
- [ ] `pnpm p0` produit, avec les clients simulés, un programme réduit et un rapport pour le brief d'Édimbourg ; le programme complet passe `TripSchema` et `ProposalSchema`, la forme réduite passe son schéma strict.
- [ ] Le test canari et tous les tests P0a1 listés ci-dessus sont verts dans `pnpm verify`.
- [ ] Chaque plafond du tableau est vérifié avant l'appel concerné ; un dépassement arrête sans programme partiel (test par plafond).
- [ ] Aucune clé, aucun `.env` dans le dépôt (`git status` et analyse de secrets de la CI).

P0b1
- [ ] Avec `DATA_ADAPTER=prototype` et des relecteurs simulés, les écrans 6, 11 et 12 affichent le programme de test, avec la mention d'attribution ; e2e et a11y verts.
- [ ] `getTripAdapter("prototype")` lève une erreur en production (tests de la décision 0006).
- [ ] Aucune donnée relue n'est écrite ni gardée entre deux requêtes (test).
- [ ] Le mode `mock` est inchangé (captures visuelles identiques).

P0a2
- [ ] Deux exécutions réelles sur Édimbourg consignées (rapports), sous les plafonds ; critères A évalués.
- [ ] Revue Sécurité de la gestion des clés faite dans la PR.

P0b2
- [ ] Une préversion protégée affiche un programme réel d'Édimbourg ; relectures réelles, aucune donnée relue persistée ; séance de jugement B tenue avec Samuel et consignée.

P0a3
- [ ] Une exécution réelle sur Zakynthos consignée, grille appliquée pour information.

## Décisions (Product Owner, définitives sans veto de Samuel avant le 2026-10-14)
- **P0-PO-1 — Claude seul, une configuration par exécution.** Conformément à Q9, aucun autre fournisseur. Les identifiants de modèles par étape sont dans la configuration et notés dans le rapport ; ia-recherche choisit (cadrage D5) et peut comparer deux configurations Claude dans le plafond mensuel.
- **P0-PO-2 — Brief structuré sans donnée personnelle**, au format décrit plus haut, commité ; récit libre facultatif de 1 000 caractères au plus.
- **P0-PO-3 — Deux sorties : programme réduit et rapport.** Le programme garde la forme de `Trip` et de `Proposal` sans les clés dérivées de Google ; validé complet en mémoire, recomposé et revalidé à la lecture. Ni réserve de candidats ni liste d'écartés.
- **P0-PO-4 — Agent borné.** Plafonds par exécution du tableau ; condition d'arrêt : 3 à 5 candidats ancrés par créneau ou plafond atteint ; politique de sources du cadrage § 6.5 ; contenu web traité comme une donnée.
- **P0-PO-5 — Écarts d'ancrage silencieux.** Un candidat non résolu ou fermé définitivement disparaît sans trace par lieu ; seuls des compteurs vont au rapport (Q29, Q44).
- **P0-PO-6 — R7 et R9 dans le prototype.** Le programme représente l'état « après tri, tout gardé » (première option de chaque repas), faute de tri réel ; R7 est donc sans objet dans P0. Le budget (R9) n'est calculé que si une source web donne un prix ; sinon `budgetPerPerson` est absent.
- **P0-PO-7 — Pas de réparation par un modèle.** Aucun code tiré d'horaires Google ou de Routes n'est envoyé à un modèle (Q44) ; le moteur corrige ou compte.
- **P0-PO-8 — Programmes de P0b commités.** Un programme retenu est ajouté au dépôt par PR, après le test « aucune donnée Google » ; il ne contient que des `placeId`, des textes maison et des sources web. C'est la seule façon de le servir sur une préversion sans stockage (aucune base avant Q24, aucun stockage Vercel, décision 0002).
- **P0-PO-9 — Relectures à l'affichage, jamais recopiées**, sous plafond quotidien ; au-delà, état d'erreur. `toConfirm` et `verifiedAt` ne s'affichent pas en mode prototype.
- **P0-PO-10 — Grille G0** ci-dessus : critères A sur deux exécutions, critères B par Samuel ; Zakynthos pour information.
- **P0-PO-11 — Section « Prototype » de l'accueil**, sur le modèle de D1, visible seulement en mode prototype ; aucun nouvel écran.

## Hors périmètre
- Gemini et toute comparaison entre fournisseurs (Q9).
- Routes serveur, actions serveur, workflows, base de données, comptes, paiement réel (B1 à B9).
- Révision (remplacer, ajouter, déplacer), fiche détaillée Google, partage, apprentissage des préférences.
- Mémoire automatique (`place_memory`), cache de coordonnées (Q34).
- Aperçu en moins de 60 s et voyage complet en moins de 3 min (cibles de B9 et G1).
- Toute réponse à Q5 : P0 applique l'interprétation la plus stricte.
- Les jeux d'évaluation de B7 (`evals/`) : P0 n'en crée pas ; la grille G0 n'est pas un jeu d'évaluation.

## Questions pour Samuel (numérotées par le CEO dans `QUESTIONS.md`)
- **P0-Q1 — Clés du prototype (argent, comptes ; complète Q103).** Créer (a) une clé Anthropic dans un espace de travail « prototype » avec une limite de dépense mensuelle égale au plafond de P0-Q2 ; (b) une clé serveur Google restreinte à Places API (New) et Routes API, dans un projet à facturation suisse, avec alerte de budget et quotas quotidiens. **Recommandation : oui aux deux**, clés dédiées au prototype, jamais réutilisées en production. Bloque P0a2, P0a3, P0b2.
- **P0-Q2 — Plafonds de dépense.** Valider : 3 USD de modèles par exécution ; 40 USD par mois de modèles ; 20 USD par mois de Google au-delà des quotas gratuits (alerte à 10 USD) ; enveloppe de P0 jusqu'à G0 de 80 USD de modèles et 40 USD de Google, prise sur les lignes de 200 CHF et 60 CHF du cadrage § 11. **Recommandation : oui** (une quinzaine d'exécutions par mois au plafond, beaucoup plus à l'estimation de 1 à 2 USD). Bloque P0a2.
- **P0-Q3 — Où tourne le script réel.** (A) Un workflow GitHub Actions déclenché à la main (ville et brief en entrée), clés en secrets d'un environnement protégé limité à `main` et soumis à ton approbation, programme et rapport en artefacts ; ou (B) ta machine, avec `.env.local`. **Recommandation : A** (tu testes « à partir d'une ville » d'un clic, aucun agent ne voit la clé ; revue Sécurité obligatoire de P0c). B reste possible en secours. Bloque P0a2.
- **P0-Q4 — Où tu parcours le programme.** Une préversion Vercel (`VERCEL_ENV=preview`) protégée par l'authentification Vercel, avec `DATA_ADAPTER=prototype` et la clé serveur posées sur l'environnement « Preview » seulement ; jamais l'adresse `vadrouille-app-ten.vercel.app`, qui est en « Production ». **Recommandation : oui** ; à défaut, en local. Bloque P0b2.
- **P0-Q5 — Q46 pour le prototype.** Le prototype envoie au fournisseur de modèles un brief sans donnée personnelle et des pages web publiques. Accepter les conditions commerciales de l'API Anthropic (sans entraînement sur nos données par défaut, à vérifier par toi) pour P0, Q46 restant ouverte pour B7 ? **Recommandation : oui.** Bloque P0a2.
- **P0-Q6 — Seuils de la grille G0.** Valider les seuils A et B (0 erreur critique, note moyenne ≥ 3,5 sans axe < 3, « Pas pour moi » ≤ 35 %, 7 incontournables sur 10, 0 journée hors budget sans justification, « oui » à l'usage avec au plus 5 remplacements, deux exécutions sur deux). **Recommandation : oui**, ce sont les seuils du cadrage (§ 8, § 12, G1) ramenés au prototype. Bloque le jugement G0, pas le code.
- **P0-Q7 — Briefs et incontournables de référence.** Fournir pour Édimbourg, puis Zakynthos : dates (réelles ou de test), logement (nom ou quartier), rythme, envies, déplacements, et ta liste de 10 incontournables **avant** la première exécution. **Recommandation :** à défaut de réponse, le brief de test de F8 (2 adultes, « Équilibré », Nature, Dégustations, Restaurants, à pied et transports publics), 6 jours commençant 6 semaines après la date d'exécution, logement dans la vieille ville ; mais la liste d'incontournables ne peut venir que de toi. Bloque P0a2 (brief) et le critère B4.
- **P0-Q8 — Relire ou garder les données Google du prototype.** Relire à chaque affichage positions et durées (coût dans les quotas gratuits, plafond quotidien, règle stricte), plutôt que les garder 30 jours au plus dans le fichier du prototype (cadrage § 6.5, mais Q34 et Q38 ouvertes) ? **Recommandation : relire**, ne rien garder. Bloque P0b2.

## Autres points signalés dans la PR (pour le CEO)
- `docs/roadmap.md`, ligne P0 : « comparaison Claude et Gemini » est caduque depuis Q9 ; prérequis à mettre à jour (P0-Q1 à P0-Q8, Q103).
- Handover back-end § 14 : la ligne « Fournisseurs de modèles (Anthropic ; Google Gemini pour la comparaison de P0) » est caduque depuis Q9.

## Annexe — formulaire de jugement de Samuel (critères B)
Pour chaque exécution parcourue dans P0b :
1. Erreurs critiques (liste, avec le jour et l'étape) : …
2. Notes de 1 à 5 : pertinence …, variété …, rythme …, justification …, surprise ….
3. Pour chaque étape et repas du programme : « J'aime », « Neutre » ou « Pas pour moi » (avec une raison de `PREFERENCE_REASONS` si « Pas pour moi »).
4. Incontournables de ta liste présents dans le programme : … sur 10.
5. Journées au-dessus du budget de trajet sans justification affichée : ….
6. Utiliserais-tu ce programme pour ce voyage, avec au plus 5 remplacements ? oui / non, et pourquoi.
