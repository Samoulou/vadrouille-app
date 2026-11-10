# 0175 — Mesure de la prévente (C2b) : liste des robots (T2), où compter (T3), disponibilités (T4), amendement du critère A6

Statut : **proposée par l'agent tech-lead, définitive à la fusion (0093)**. Décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Elle répond au bloquant 1 des revues consolidées des heads `4bda87f` et `4a035e7` de la PR #1133, et aux questions **T2**, **T3** et **T4** de `specs/C2-prevente-mesure.md`. Elle ne tranche rien de ce qui revient à la **Sécurité** (§ 6) ni à **Samuel** ou au **Product Owner** (§ 7). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment, par une nouvelle décision.

Date : 2026-11-10 · Décideur : Tech Lead · Ticket : #1130 · PR : #1133 (branche `claude/1130-c2b-prevente-mesure-contrats`) · Head relu : `4a035e7` · `main` relu : `40ee48b`

Numérotation : les revues consolidées écrivent « 0173 ou supérieur », et la demande de cette décision la nommait « 0174 ». **0173 et 0174 sont pris** par la PR #1126 (`0173-deuxieme-tour-unslop.md`, `0174-tour-ecran-par-ecran.md`, avec 0170 et 0171). `main` va jusqu'à 0172 ; aucune autre PR ouverte (#1127, #1133) ne porte de fichier de décision (vérifié le 2026-11-10 sur les fichiers de chaque PR ouverte). Partout où une revue ou un commentaire de #1133 écrit « 0173 » ou « 0174 » pour C2b, lire **0175**.

Décisions liées : 0002, 0034, 0036, 0093, 0157 (§ 2.1), 0161, 0168, 0172 (§ 1 points 3 et 7, § 6).

## Contexte

C2b branche un compteur de visites sur la page d'accueil quand la précommande est ouverte. La spécification laissait trois formes au Tech Lead (T2, T3, T4) ; l'auteur les a codées selon la proposition de la spécification, marquées « à confirmer », et a signalé un écart au critère A6 (une requête `HEAD` est comptée). Les deux revues consolidées ont jugé le code sain et bloqué la PR faute de trace écrite.

Chaque point ci-dessous a été vérifié sur le code du head `4a035e7`, pas sur la description de la PR. Ce qui n'a été que lu, sans être exécuté, est dit comme tel.

## 1. T2 : liste maison de robots, acceptée

1. **Source : `src/server/config/robots.ts`, liste maison, sans dépendance ni appel réseau.** Une bibliothèque embarquée est écartée : elle ajouterait un paquet au régime de confinement et une liste que le studio ne relit pas, pour un compteur dont la seule exigence est de ne pas compter ce qui se déclare automate. Passer à une liste tierce demanderait une nouvelle décision.
2. **Règle de reconnaissance, telle que livrée** : un agent utilisateur est un robot déclaré s'il contient l'un des fragments de `FRAGMENTS_ROBOTS`, sans tenir compte de la casse, sur ses 512 premiers caractères, après retrait des faux amis (`cubot`). Absent ou vide : non compté (C2-PO-3).
3. **Sens de l'erreur, admis.** Les fragments génériques (`bot`, `fetch`, `preview`, `monitor`, `python`, `ruby`…) peuvent écarter un vrai navigateur dont l'agent utilisateur les contiendrait : le compte est alors sous-estimé, ce qui est le sens prudent pour un seuil. À l'inverse, un automate qui se présente comme un navigateur est compté (limite connue, S4 : § 6).
4. **`HeadlessChrome` et Playwright sont des robots : confirmé** (fragments `headless` et `playwright` ; de même `puppeteer`, `selenium`, `cypress`, `lighthouse`). Les passes de la CI et des agents (a11y, e2e, visuel) ne doivent jamais gonfler le compteur d'une base réelle. Conséquence pour les tests : **un test qui attend une écriture pose lui-même un agent utilisateur de navigateur**, pris dans `tests/support/agents-utilisateurs.ts`. Aucune variable ni aucun chemin « de test » dans le code ne lève l'exclusion.
5. **Une seule source, une valeur par PR.** Ajouter un fragment ou un faux ami se fait par une PR, avec son cas dans `tests/unit/prevente/robots.test.ts`. Aucune copie de la liste ailleurs.

## 2. T3 : compter dans le rendu de `/`, écriture après la réponse

1. **Où.** Dans le rendu de `/` (`src/app/page.tsx`), par le seul appel `compterVisitePrevente(src)`, et seulement quand `getPrevente()` n'est pas nul. Un affichage est compté une fois parce qu'il n'y a qu'un appel, dans la page et non dans une mise en page.
2. **`after()` de `next/server` : admis.** La décision « compter ou non » est prise pendant le rendu, sur les en-têtes de la requête ; l'écriture est remise à `after()` et n'est jamais attendue par le rendu (critères A10 et A11). L'`await` de la page ne porte que sur la lecture des en-têtes. `after()` est une API de Next.js, pas un service propre à Vercel : 0002 est respectée. Le repli `void tache()` quand `after()` lève (hors d'une requête) est admis : il ne sert qu'aux tests, et l'écriture n'y est pas attendue non plus.
3. **Requêtes du routeur (forme exacte demandée par le § 2.2 point 2).** Ne compte pas : une requête qui porte `Next-Router-Prefetch` ou `Next-Router-Segment-Prefetch` (par leur seule présence), ou dont `Purpose`, `Sec-Purpose`, `X-Purpose` ou `X-Moz` contient `prefetch`. **Compte** : une navigation du routeur sans préchargement, et un `router.refresh()` : la page est alors affichée à la personne, comme après un rechargement (qui compte aussi, § 2.1 point 2).
4. **Le proxy n'est pas étendu à `/`.** `src/proxy.ts` reste limité à `/p/:path*` (0157 § 2.1). 0161 est écrite pour ce proxy-là (« le seul de l'application (matcher `/p/:path*`) »), qui reçoit avec `skipProxyUrlNormalize` des adresses non normalisées : l'ouvrir à `/` demanderait de la relire. `tests/unit/server/partage/proxy.test.ts` fige le `matcher`. L'étendre placerait du code devant chaque requête de la page d'accueil, précommande ouverte ou non, et ajouterait un point de panne à une page que la mesure ne doit jamais casser (règle première de la spécification).
5. **`/` reste rendue à chaque requête.** `dynamic = "force-dynamic"` dans `src/app/page.tsx`, aucun `revalidate`, aucun en-tête de cache partagé. Porteur dans C2b : le test « A13 (garde statique) » de `src/adapters/prevente-mesure.test.tsx`. Retirer `force-dynamic` ou poser un cache devant `/` éteint le compteur sans erreur : ce test doit alors échouer. Il ne voit pas une règle d'en-têtes à motif générique (`/:path*`) ; aucune n'existe aujourd'hui, et C2f la couvre (§ 5).
6. **Deux définitions de « préchargement »** (`estPrechargement` de `src/adapters/prevente-mesure.ts`, large ; `src/server/partage/limite-vue.ts`, étroite) : admis pour C2b. À aligner dans un module neutre par une tâche à part ; ne bloque rien.

## 3. Amendement du critère A6 : une requête `HEAD` est comptée, limite acceptée

1. **Le fait.** Un composant serveur ne connaît pas la méthode de la requête (`headers()` ne la donne pas). Next.js 16.4.1 rend la page pour une requête `HEAD` et n'en retire que le corps à l'envoi (`next/dist/server/send-payload.js` ; **lu, non exécuté**). Une requête `HEAD` sur `/`, précommande ouverte, sans en-tête de préchargement et avec un agent utilisateur de navigateur, est donc comptée. La même limite vaut, par construction, pour toute autre méthode pour laquelle Next.js rendrait la page ; elles ne sont pas inventoriées ici.
2. **Décision : limite acceptée ; aucun changement de code n'est demandé.** Le critère A6 perd sa clause « requête `HEAD` » ; il garde les trois en-têtes de préchargement, qui sont testés.
3. **Pourquoi.**
   - Le seul moyen d'écarter `HEAD` est de passer par le proxy (lui seul voit la méthode), donc d'étendre son `matcher` à `/` : écarté au § 2 point 4. Le coût (un proxy devant la page la plus vue, deux décisions à amender, un garde de test à rouvrir) dépasse le biais corrigé.
   - Les expéditeurs habituels de `HEAD` (vérificateurs de liens, aperçus, scripts) se déclarent pour la plupart par leur agent utilisateur et sont déjà écartés par le § 1. Reste l'outil qui se présente comme un navigateur : c'est le cas « robot non déclaré », déjà compté pour un `GET` et déjà porté par S4.
   - **Ce biais gonfle le compte, et il n'est pas mesuré.** Il va dans le sens qui rapproche du seuil de 300, comme les rechargements. Il est écrit dans les limites connues de `docs/commercial/suivi.md`.
4. **Ce qui ne change pas.** La définition fonctionnelle reste celle du Product Owner (C2-PO-2 : un affichage est un `GET` de la page entière). L'écart est une limite de mise en œuvre, écrite dans la spécification par cette PR (§ 2.2 point 2, C2-PO-2 et A6, par renvoi à la présente décision ; la spécification prévoit que la réponse du Tech Lead prime pour le point qu'elle change).
5. **Pour l'exclure un jour** (demande de Samuel ou du Product Owner : § 7) : une tâche à part, avec une décision qui amende 0157 § 2.1 et 0161 pour ouvrir le proxy à `/`. Pas avant.

## 4. T4 : « compteur disponible », « questionnaire disponible », forme de l'adaptateur

1. **Port et branchement : confirmés.** Le port `MesurePrevente` (`src/adapters/prevente-mesure-instance.ts`) a quatre fonctions : `compteurDisponible`, `compterVisite`, `limiteurConfigure`, `visitePerdue`. `src/instrumentation.ts` le branche au démarrage, **quel que soit l'adaptateur de données** : la mesure ne dépend pas de `DATA_ADAPTER`. `@/adapters` n'atteint statiquement ni `db/`, ni `src/server/env`, ni le journal. Non branché (tests, `next build`) : rien n'est disponible, échec fermé. Un second branchement lève ; en développement avec rechargement à chaud, l'erreur est journalisée (`branchement-prevente`) et la première mise en œuvre reste en place.
2. **Compteur disponible** = une mise en œuvre est branchée et se dit disponible. Pour Postgres (`src/server/prevente/visites.ts`) : le pool gardé de `vadrouille_app` peut être créé, c'est-à-dire que la garde de production de `db/connection.ts` laisse passer (0034) et que `VADROUILLE_DATABASE_URL` est posée. **Aucune nouvelle variable** (0036) : c'est la réponse à « nom des variables ». Créer le pool n'ouvre aucune connexion et n'écrit aucun journal ; tant que la création échoue, elle est retentée à l'appel suivant ; créé, le pool est gardé.
3. **Questionnaire disponible** = compteur disponible **et** `limiteurConfigure()` (`src/server/rate-limit.ts`). Liste exacte des variables du limiteur : celles que `rateLimitSettings` (`src/server/env/index.ts`) exige à l'usage, soit `RATE_LIMIT_HMAC_SECRET` partout, et `TRUSTED_IP_HEADER` en plus en `staging` et en `production`. **Cette liste n'est recopiée nulle part** : `limiteurConfigure` appelle `rateLimitSettings` et rend faux s'il lève. Si le limiteur exige un jour une autre variable, la disponibilité suit sans changement.
4. **Pool propre au compteur : admis.** 2 connexions, attente et requête bornées à 2 s (modèle de `src/server/villes/compteurs.ts`) : une base lente ne retient ni le rendu ni le pool du limiteur. Ces 2 connexions s'ajoutent aux autres pools ; à surveiller sur le plafond de connexions de la base. Pas de `statement_timeout` côté serveur : même régime que `compteurs.ts`.
5. **Mise en œuvre en mémoire : pour les tests seulement.** Aucune variable ne la choisit ; seul un test la branche ; elle se dit indisponible et refuse d'écrire sur un déploiement de production. Conséquence : un test sur l'application construite a besoin d'un vrai Postgres (§ 5).
6. **Réserves pour C2c et C2d.** « Disponible » ne prouve ni que la base répond ni que la migration 0029 y est appliquée (C2a-2, 0172 § 4). Aucune requête de sonde n'est ajoutée : elle ouvrirait une connexion pendant le rendu, ce que le § 6.2 de la spécification interdit. Donc : à l'envoi, tout échec de la fonction d'écriture, `42883` compris, rend le message d'indisponibilité du § 3.3 point 6, sans exposer le détail ; le message et le détail de l'erreur ne sont jamais journalisés (0172 § 6). C2c appelle la fonction sans `p_plafond` (0172 § 1 point 3).
7. **Journal.** `prevente.visite_perdue` (niveau `warn`, nom de l'erreur seul), une ligne par visite perdue, sans limitation de fréquence : admis pour le prototype.

## 5. Tests

1. Le test « A13 (garde statique) » est le porteur d'A13 dans C2b. La partie d'A13 sur l'application construite (deux `GET /?src=forum` = deux écritures ; aucun `s-maxage` ni `public` dans la réponse) va en **C2f** (rôle `qa`), avec le chemin réel de `after()`, qu'aucun test unitaire n'exerce (ils le doublent).
2. C2f relève aussi, sur l'application construite, ce que fait une requête `HEAD` (§ 3 point 1 n'a été que lu) et une navigation du routeur sans préchargement (§ 2 point 3). Ce sont des constats : s'ils contredisent cette décision, le rôle `qa` le signale et le Tech Lead la rouvre.
3. Ces tests posent un agent utilisateur de navigateur (§ 1 point 4) et tournent sur le Postgres de la CI (§ 4 point 5). Si le job de bout en bout de la CI n'a pas de base, le rôle `qa` le signale dans sa PR ; la forme se décide alors, pas ici.
4. Aucun test n'est désactivé ni supprimé par C2b ni par cette décision.

## 6. Sécurité : ce qui est rapporté, ce qui reste posé

Rien ici n'est un verdict du Tech Lead sur la sécurité.

- **Rapporté** (rôle Sécurité, revue consolidée du head `4bda87f` de la PR #1133, 2026-11-10) : « approuvé, aucun bloquant » ; **S4** (aucun plafond sur le compteur de visites) accepté ; les deux lignes ajoutées au régime de confinement (`next/server` pour `src/adapters/prevente-mesure.ts` et ses tests ; `globalThis` pour `src/adapters/prevente-mesure-instance.ts`) jugées acceptables ; pool, données stockées, journal et instrumentation conformes.
- **Non reconsultée** sur le head `4a035e7` (un test et deux mentions de verdict ajoutés), ni pour écrire cette décision.
- **Reste posé à la Sécurité** : le § 3 accepte qu'une requête `HEAD` soit comptée. C'est une variante du risque S4 (compteur gonflé par des requêtes fabriquées), que la Sécurité a accepté pour un `GET` ; elle ne s'est pas prononcée sur `HEAD`. Sa lecture fait partie de la prochaine revue consolidée de #1133. **S2** (seuils du questionnaire) bloque C2c, **S3** bloque C2e, **S5** la production : inchangés.

## 7. Ce qui revient à Samuel ou au Product Owner (non tranché ici)

Aucun de ces points ne bloque la fusion de C2b : le code fusionne éteint (aucune base en production, `PREVENTE` fermé).

1. **Définition d'une visite et sens du seuil de 300** (Samuel ; Q362, Q-C1-7 ; question 4 de la spécification). La limite du § 3 s'ajoute aux limites déjà écrites dans `suivi.md` (rechargements, robots non déclarés). Si Samuel veut que `HEAD` soit exclu strictement, c'est la tâche du § 3 point 5.
2. **C2-PO-2** (Product Owner) : la décision fonctionnelle reste en l'état ; le Product Owner peut la reformuler pour y inscrire la limite, ou demander l'exclusion stricte.
3. **Base en production** (Samuel ; question 1 de la spécification), inchangée : tant qu'elle n'existe pas, rien n'est compté en production.

## Conséquences

- **Dans cette PR (#1133)** : la présente décision ; les marqueurs « à confirmer » de T2, T3, T4 et S4 remplacés par un renvoi à 0175 dans `src/adapters/prevente-mesure.ts`, `src/adapters/prevente-mesure-instance.ts`, `src/server/prevente/visites.ts`, `src/server/config/robots.ts`, `src/server/rate-limit.ts` (commentaires seulement) et `docs/commercial/suivi.md` ; `specs/C2-prevente-mesure.md` amendée par renvoi (§ 2.2 point 2, critère A6, C2-PO-2). **Aucune instruction de code, aucune assertion de test ne change.**
- **Aucun changement de code n'est demandé au rôle `backend`** par cette décision.
- **Tâches suivantes** : C2c (§ 4 point 6), C2d (§ 4 points 2 et 3), C2f (§ 5) ; alignement des deux définitions de « préchargement » (§ 2 point 6), à ordonner par le CEO.
- **Non tranché ici** : T6 (production), T7 (compartiment commun du limiteur, C2c). Ils ne bloquent pas C2b.
- La mention « à confirmer par Samuel » de « Ce qu'est une visite » dans `suivi.md` reste : elle n'est pas du ressort du Tech Lead.

## Quand revoir

Si C2f constate qu'une requête `HEAD` n'est pas rendue, ou qu'`after()` ne tient pas l'écriture sur la plateforme ; à la réponse de Samuel sur la définition d'une visite ; avant toute base en production (T6, 0034) ; à toute montée de version de Next.js qui change `after()`, le rendu de `HEAD` ou les en-têtes de préchargement.
