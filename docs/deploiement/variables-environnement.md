# Variables d'environnement : ce qui ne se pose jamais en production

Note de sécurité (revue de F9a, PR #86). Elle ne crée aucune règle : elle rassemble les gardes déjà fixées par les décisions 0017 (§ 11) et 0020 (§ 2.3, § 5, § 6) pour la personne qui configure un environnement (Vercel, image `docker`, CI).

## À ne jamais poser sur un déploiement de production (ni sur un staging ouvert au public)

| Variable | Ce qu'elle ouvre | Garde dans le code |
|---|---|---|
| `NODE_ENV=development` | Les pages de développement (`/dev/…`, dont `POST /dev/api/simulation`, ouvertes dès que `NODE_ENV` n'est pas `production`) et le paiement simulé (ouvert en `development` et `test`). | `devPagesEnabled` (`src/dev/flags.ts`) n'a **aucune** autre garde ; `paymentDemoAllowed` (`src/adapters/payment-guard.ts`) reste fermé si `VADROUILLE_ENV` ou `VERCEL_ENV` vaut `production`. |
| `VADROUILLE_DEV_PAGES=1` | Les pages de développement sur un build de production (prévue pour les tests Playwright). | `devPagesEnabled` l'accepte même en production ; seule la portée des simulations exige en plus `!isProductionDeployment()`. Ne compter que sur l'absence de la variable. |
| `VADROUILLE_DEMO_PAYMENT=1` | Le paiement simulé (écran 9, `R9-sim`, `R9-retour`, actions de paiement). | Ignorée si `VADROUILLE_ENV` ou `VERCEL_ENV` vaut `production` (le `Dockerfile` pose `VADROUILLE_ENV=production` ; le job `docker` de la CI vérifie la fermeture). |
| `VADROUILLE_PROTOTYPE=1` | L'adaptateur `prototype` sur un build de production lancé hors de Vercel (`next start`, serveur autonome), **en CI seulement** (tests Playwright, spécification P0, P0b1). | Prise en compte seulement si `CI` vaut exactement `true`, sans `VERCEL_ENV`, et jamais si `VADROUILLE_ENV` ou `VERCEL_ENV` vaut `production` (`prototypeAdapterAllowed`, `src/dev/flags.ts`, décision 0032 § A4.2 ; le job `docker` vérifie la fermeture). Voir « Adaptateur prototype » ci-dessous : poser `CI=true` sur un poste est trivial, ce second garde n'est pas une protection. |

## Choix des adaptateurs

| Variable | Valeurs | Effet |
|---|---|---|
| `DATA_ADAPTER` | absente, vide ou `mock` (défaut) ; `api` ; `prototype` (**jamais en production**) | `api` ferme les parcours simulés : `getRequestContext()` lève tant que l'authentification (B3) n'existe pas, et le paiement simulé reste indisponible. `prototype` sert les programmes du prototype de recherche (section « Adaptateur prototype » ci-dessous) et lève une erreur hors de sa liste blanche. Toute autre valeur lève une erreur. |
| `PAYMENT_ADAPTER` | absente, vide ou `mock` (défaut) ; `stripe` réservé | `stripe` lève « non implémenté » jusqu'à la tâche de paiement réel (décision 0020). Toute autre valeur lève une erreur. `mock` ne suffit pas à ouvrir le paiement simulé : `paymentAvailable` exige aussi `paymentDemoAllowed` et `DATA_ADAPTER` à `mock`. |

Ni l'une ni l'autre n'ouvre quoi que ce soit à elle seule : l'ouverture dépend des variables du tableau précédent.

## Adaptateur prototype (spécification P0, P0b1 ; décision 0032 § A4 et § A6)

`DATA_ADAPTER=prototype` fait parcourir un programme produit par le prototype de recherche dans les écrans existants (accueil, présentation, Séjour, Journée, carte). **Jamais sur l'environnement « Production »** de Vercel ni dans l'image `docker`.

| Variable | Valeur | Où la poser |
|---|---|---|
| `DATA_ADAPTER` | `prototype` | `.env.local` du poste (avec `pnpm dev`) ; le second serveur de `playwright.config.ts`. Jamais en production. |
| `VADROUILLE_PROTOTYPE_DIR` | chemin **absolu et canonique** du dossier des programmes (sans lien symbolique : `realpath` du chemin égal au chemin donné), lu une fois au démarrage | `.env.local` ; `playwright.config.ts` (programme de test `prototype/programmes-test/`). Absente ou vide : la section « Prototype » de l'accueil est absente, sans erreur. |
| `VADROUILLE_PROTOTYPE` | `1`, avec `CI=true` | **En CI seulement** : `playwright.config.ts`, pour les tests sur le build de production. |

**Liste blanche** (`prototypeAdapterAllowed`, `src/dev/flags.ts`) : l'adaptateur et son contexte (`org_prototype`) ne s'ouvrent que si aucun déploiement de production n'est détecté (`VADROUILLE_ENV` et `VERCEL_ENV` différents de `production`, même en majuscules ou avec des espaces), si `VADROUILLE_ENV` est absente, `local` ou `ci`, **et** dans l'un de ces trois cas :
- `VERCEL_ENV=preview` ou `VERCEL_ENV=development` ;
- sans `VERCEL_ENV`, `NODE_ENV=development` ou `test` (`pnpm dev`, Vitest) ;
- sans `VERCEL_ENV`, `VADROUILLE_PROTOTYPE=1` **et** `CI=true` exactement.

Sinon, `getTripAdapter("prototype")` et `getRequestContext()` lèvent une erreur : la page répond 500, jamais un programme. Le job `docker` lance l'image avec `-e DATA_ADAPTER=prototype`, puis avec `-e VADROUILLE_PROTOTYPE=1 -e CI=true` en plus, et vérifie le 500 sans section « Prototype » ni identifiant `proto_`.

**Écart assumé** (spécification P0) : `VADROUILLE_PROTOTYPE=1` ouvre aussi un serveur `NODE_ENV=production` lancé hors de Docker et de Vercel, par exemple `next start` sur un poste, si `CI=true` y est posé. Ce second garde **réduit** l'écart sans le supprimer : poser `CI=true` est trivial. Consigne : ne poser `VADROUILLE_PROTOTYPE` qu'en CI ; Playwright en local pose aussi `CI=true` pour ces tests, sur son seul second serveur.

**Préversions Vercel** : `VERCEL_ENV=preview` est dans la liste blanche. Une préversion avec `DATA_ADAPTER=prototype` sert donc le prototype. Q235 demande que rien ne soit public, mais la protection des préversions par Vercel n'est pas vérifiée ici, et une preview peut être publique (section « Déploiements de preview Vercel » ci-dessous) : **à vérifier avant d'y poser un dossier de programmes**. Dans P0b1, aucun dossier de programmes n'existe sur Vercel (pas de valeur pour `VADROUILLE_PROTOTYPE_DIR`) : la section est absente. L'emplacement des programmes réels hors du dépôt (A5) relève de la spécification suivante, sans stockage propre à Vercel (décision 0002).

**Aucune clé, aucun appel à Google dans P0b1** : les durées de trajet sont relues par un relecteur **simulé** (durées sentinelles), dans tous les environnements, y compris une préversion qui porterait `GOOGLE_MAPS_SERVER_KEY`. La ligne de `GOOGLE_MAPS_SERVER_KEY` et son module d'environnement arrivent avec le relecteur réel (spécification suivante).

**Aucun cache** : les pages servies par l'adaptateur sont rendues à chaque requête (`dynamic = "force-dynamic"`, jamais prérendues) et répondent `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` (en-tête par défaut de Next.js, vérifié par l'e2e sur le build de production). Aucune durée relue n'est gardée entre deux requêtes.

`GET /dev/api/prototype/relectures` (compteur du relecteur simulé, pour l'e2e) répond 404 sauf avec les pages de développement **et** la liste blanche ouvertes.

## Déploiements de preview Vercel

Ils sont construits avec `NODE_ENV=production` et `VERCEL_ENV=preview` : les pages de développement, `POST /dev/api/simulation` et le paiement simulé y restent **fermés** tant qu'aucune des trois premières variables du premier tableau n'y est posée. Ne pas les poser sur l'environnement « Preview » de Vercel non plus : l'état en mémoire n'y serait pas fiable (voir ci-dessous) et une preview peut être publique.

Dans le dépôt, seuls `playwright.config.ts` (tests sur le build local), `pnpm dev` (`NODE_ENV=development`) et la seconde image du job `docker` (qui vérifie la fermeture) les posent.

## Pourquoi

- Le paiement simulé et les simulations gardent leur état **en mémoire** dans le processus : sur Vercel, cet état n'est pas partagé entre instances (F9-Q6, décision 0020 § 6). La démonstration du paiement n'est fiable qu'en local, en CI et dans l'image `docker`.
- La portée par défaut des simulations partage **une seule organisation simulée** entre tous les visiteurs : un droit simulé posé par l'un serait vu par les autres. Avant toute ouverture publique d'un environnement où le paiement simulé serait ouvert, une session par visiteur (tâche B3) est nécessaire.

## À vérifier avant de modifier un environnement

1. `VADROUILLE_ENV=production` ou `VERCEL_ENV=production` est présent sur tout déploiement de production.
2. Aucune des quatre variables du tableau n'est définie (`vercel env ls`, `docker inspect`), et `DATA_ADAPTER` ne vaut pas `prototype`.
3. `GET /dev/composants`, `GET /voyages/mock_trip_edimbourg/debloquer` et `POST /dev/api/simulation` répondent 404.

## Carte Google Maps (F4, Q3)

Samuel seul pose les variables et déclenche les déploiements (`docs/CONTEXT.md`, « Qui décide quoi »). Aucune valeur n'est écrite dans ce dépôt.

| Nom exact lu par le code | Où il est lu | Environnements Vercel |
|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | `src/components/carte/config.tsx` (`readMapConfig`) | Production (déploiement de `main`) et, si voulu, Preview |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | même fichier | mêmes environnements que la clé |

- **Figées au build.** Les variables `NEXT_PUBLIC_*` sont recopiées dans le JavaScript au moment du build. Ajouter ou changer une valeur dans Vercel n'a aucun effet sur un déploiement existant : il faut un **nouveau déploiement** (nouveau commit sur `main`, ou « Redeploy » sans le cache de build dans Vercel).
- **Nom exact.** Sans le préfixe `NEXT_PUBLIC_`, la variable n'arrive jamais au navigateur.
- **Environnement.** L'adresse de démonstration (`vadrouille-app-ten.vercel.app`) sert le déploiement de `main`, que Vercel range dans l'environnement « Production ». Une variable cochée seulement « Preview » ou « Development » n'y est pas lue.
- **Restriction de la clé.** La clé doit accepter le domaine qui sert la page (référents HTTP) et la Maps JavaScript API. Une clé refusée ne donne pas « Carte indisponible » mais « La carte n'a pas pu être chargée » (voir « Lire le message affiché » ci-dessous).

### Référents HTTP autorisés sur la clé

Réglés par Samuel dans Google Cloud Console (Identifiants, restrictions de sites web) ; état constaté par Samuel le 2026-10-12. Seule API autorisée sur la clé : Maps JavaScript API (constaté par Samuel le 2026-10-12).

| Référent | Pour |
|---|---|
| `http://localhost:3000/*` | `pnpm dev` et les tests sur le poste |
| `https://vadrouille-app-ten.vercel.app/*` | adresse de démonstration (déploiement de `main`) |
| `https://*.vercel.app/*` | previews Vercel : chaque déploiement a sa propre adresse, de la forme `vadrouille-<hash>-<équipe>.vercel.app` (ajouté par Samuel le 2026-10-12, bug #159) |

Google n'accepte le joker qu'en tête du domaine : on ne peut pas limiter la clé aux seules previews de ce projet. N'importe quel site en `vercel.app` peut donc l'utiliser. Aucun plafond de quota sur Maps JavaScript API n'est consigné ici ; à confirmer par Samuel dans Google Cloud Console. La restriction est vérifiée par Google : la changer ne demande aucun redéploiement (délai de prise en compte jusqu'à 5 minutes).

## Lire le message affiché

| Message | Causes possibles dans le code (`src/components/carte/DayMap.tsx`) |
|---|---|
| « Carte indisponible hors ligne. La liste reste utilisable. » | Navigateur hors ligne. |
| « Carte indisponible. La liste contient tout le programme. » | (a) clé ou Map ID absent du build ; **ou** (b) aucune position pour ce jour (`getDayMap` renvoie `null`). Aucun script Google n'est demandé. |
| « La carte n'a pas pu être chargée. La liste contient tout le programme. » + « Réessayer » | Script Google en échec : clé refusée (`gm_authFailure` : référent non autorisé, API non activée, facturation), réseau, ou délai de 10 s dépassé. |

## Vérifier un déploiement sans exposer la clé

1. Ouvrir une page Journée dont le voyage a des positions, par exemple `/voyages/mock_trip_edimbourg/jour/1` : si la carte s'affiche, les deux variables sont dans le build.
2. Autre contrôle : dans les outils du navigateur (onglet Sources ou Réseau), chercher `AIza` dans les fichiers `/_next/static/chunks/…` : présent = la clé est dans le build. Ne jamais recopier la valeur.

## Bug #106 (2026-10-11) : « Carte indisponible » sur la démonstration

- **Constat** : `/voyages/mock_trip_edimbourg_debloque/jour/1` affichait « Carte indisponible. La liste contient tout le programme. ».
- **Ce qui a été vérifié** (2026-10-11, 09:10 UTC, déploiement servi par `vadrouille-app-ten.vercel.app`) :
  - la clé (préfixe `AIza`) et le Map ID sont présents dans le JavaScript servi : les noms sont bons, l'environnement Production les reçoit et le déploiement en cours a été construit après leur ajout ;
  - aucun en-tête `Content-Security-Policy` n'est envoyé : rien ne bloque le script Google ;
  - la page `/voyages/mock_trip_edimbourg/jour/1` (voyage non débloqué) monte la carte, sans état de remplacement ;
  - le message affiché est celui de la cause « indisponible », pas celui d'une clé refusée.
- **Cause** : dans le code. Le voyage débloqué de la démonstration (`mock_trip_edimbourg_debloque`, décision 0013 § 3.6) était déclaré sans positions simulées dans `src/adapters/mock.ts` (question D1-Q3, Q100). `getDayMap` renvoyait `null` et la carte affichait son état de remplacement, avec ou sans clé.
- **Correction** : positions dérivées de celles d'Édimbourg pour le voyage débloqué (`deriveEdimbourgCarte`), sauf le J6 en préparation, comme le prévoit la tâche T6 de la décision 0017 § 13. Test qui reproduit : `src/adapters/mock.test.ts`, « voyage débloqué de la démonstration (bug n° 106) ».
- **Voyage payé par le paiement simulé (F9a)** : `withSimulatedUnlock` (`src/adapters/mock-unlock.ts`) sert `mock_trip_edimbourg` débloqué à partir de son pendant `mock_trip_edimbourg_debloque` ; ses positions sont donc aussi celles de `deriveEdimbourgCarte`, réétiquetées et revalidées (`src/adapters/mock-unlock.test.ts`).
- **Action de Samuel** : aucune variable à changer. Après la fusion, le déploiement automatique de `main` suffit ; vérifier ensuite que la carte du Jour 1 s'affiche sur l'adresse de démonstration.

## Bug #159 (2026-10-12) : « La carte n'a pas pu être chargée » sur les previews

- **Constat** : sur une preview (`vadrouille-<hash>-<équipe>.vercel.app/voyages/mock_trip_edimbourg_debloque` et `/jour/1`), la carte affichait « La carte n'a pas pu être chargée. La liste contient tout le programme. » ; la liste du programme restait complète.
- **Ce qui a été vérifié** (2026-10-12, 08:55 UTC) : la console du navigateur montre `RefererNotAllowedMapError` sur la preview ; la même page sur `vadrouille-app-ten.vercel.app` affiche la carte ; aucune erreur serveur dans les journaux Vercel.
- **Cause** : hors du code. La clé n'acceptait que `localhost:3000` et `vadrouille-app-ten.vercel.app`.
- **Correction** : Samuel a ajouté `https://*.vercel.app/*` aux référents de la clé (tableau ci-dessus). Aucun changement de code. Vérifié le 2026-10-12 à 09:00 UTC : la carte du Jour 1 s'affiche sur la même preview, sans redéploiement.
