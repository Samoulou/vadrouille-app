# 0024 — Amendement de 0022 : arbitrages du Tech Lead sur F12a (R6, attente du réseau, réglages Lighthouse, inventaire, Q210)

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-13) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-11 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #124

Numérotation : 0006 à 0012 restent réservés par #27 (seule autre PR ouverte au 2026-10-11) ; 0024 est le prochain numéro libre après 0023.

## Contexte
F12a (#117, branche `claude/116-f12a-mesure`) met en place la mesure décidée par 0022 § 1 à § 4. Deux revues du Tech Lead, publiées sur #117 le 2026-10-11 à 15:31 et à 15:32 UTC, l'ont approuvée sur le head `c1aa255`. Elles ont accepté quatre écarts ou ajouts à 0022 et reporté un point à F12d, en annonçant une décision 0024. La présente décision les écrit, comme l'exige 0022 (« Conséquences », dernier point : un écart demande un amendement écrit, pas une exception silencieuse).

Elle tranche aussi **Q210** (spécification F7, F7-Q9), déléguée au Tech Lead.

Questions liées : **Q205** (R6 au-dessus du budget), **Q206** (attente bornée, réglages Lighthouse), **Q208** (test instable de la présentation), **Q210** (budget des routes de F7).

Le code décrit est celui de #117 au head `343ee4f`. Ce head ajoute la préparation `confirmation-en-attente` (route `R9-retour`) et une garde contre les redirections, sans changer les points ci-dessous. Cette décision ne modifie pas le code de #117.

**Argent, comptes, données** : rien. Aucun service, aucun compte, aucune donnée personnelle ; les mesures portent sur le jeu simulé.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : non concerné. Il s'agit uniquement d'outillage de mesure et de tests.

**Règles Google** : inchangées. Les domaines Google restent bloqués dans les deux mesures, par la liste unique `GOOGLE_HOSTS` de `tests/e2e/carte-helpers.ts`.

## Décisions

### 1. R6 (présentation) au-dessus du budget : dépassement connu à plafond non croissant — amende 0022 § 4 (Q205)
Mesure de F12a, le 2026-10-11 : **219 305 octets** gzip (15 scripts) sur `/voyages/mock_trip_edimbourg/presentation`, pour un seuil strictement inférieur à 200 000 octets.

**Décision** : le champ `knownExceedance` de `RouteEntry` est accepté. C'est une **mesure transitoire**, pas une dérogation durable.
- **Le seuil reste à 200 000 octets.** Il ne se relève pas. R6 garde `budgets.javascript: "seuil"` et ne repasse pas en `journal`.
- **Le plafond ne croît pas.** Le test `budget: JavaScript initial par route` échoue si la mesure de R6 dépasse `knownExceedance.javascriptBytes` (219 305). Une PR peut **abaisser** ce plafond à sa nouvelle mesure ; le relever demande une décision écrite.
- **Sortie obligatoire.** Le test échoue aussi quand la mesure passe sous 200 000 octets : la PR qui y parvient retire `knownExceedance`, et le seuil ordinaire s'applique.
- **Champ réservé.** `knownExceedance` n'est permis que sur une entrée `seuil` dont le dépassement a été tranché par une décision écrite. Au 2026-10-11, seule R6 est dans ce cas. Toute autre entrée qui en aurait besoin demande un amendement.
- **Tâche T14** (`[front]`, `src/features/presentation`) : ramener R6 sous 200 000 octets et retirer `knownExceedance`. Elle a lieu après la fusion de F12a et **avant F12d** (ordre : CEO, Q205). Méthode : celle de 0016 § 3.1 (imports côté client, `zod/mini`, chargement différé de ce qui n'est pas affiché au premier rendu), sans changer le comportement de l'écran. T14 remplace aussi le texte de `reason` de R6 (« décision du Tech Lead attendue ») par un renvoi à cette décision, si `knownExceedance` existe encore à sa fusion.
- **Q208 rattachée à T14.** Le test instable `presentation: détail et retour du focus` (`src/features/presentation/PresentationScreen.test.tsx`) touche les mêmes fichiers. T14 le fiabilise sur sa cause (attente d'un état observable plutôt que d'un délai), sans le désactiver ni l'affaiblir.
- **Si T14 n'y parvient pas**, sa PR donne la mesure et la répartition par script. Le Tech Lead tranche alors par un nouvel amendement. **F12d ne fusionne pas** tant qu'une entrée de `ROUTES` porte `knownExceedance` sans décision écrite postérieure à celle-ci. C'est la clôture des budgets de F12d (spécification F12, C5).

### 2. Attente du réseau bornée à 10 s dans le test par route — écart à 0016 § 3.1 règle 5 (Q206)
**Décision : accepté, pour le seul test `budget: JavaScript initial par route`.**
- `measureInitialJavaScript` reçoit `idleTimeoutMs`. Le test par route passe `IDLE_TIMEOUT_MS = 10_000` ; à l'échéance, la mesure est prise, `networkIdle` vaut faux et le test porte l'annotation « réseau jamais inactif ».
- **Le test de T4** (`budget: JavaScript initial de la Journée`) garde l'attente **sans échéance** de 0016 § 3.1 règle 5 : il appelle la fonction sans `idleTimeoutMs`. Il reste la référence du budget de la Journée.
- **Raison** : une requête qui ne se termine jamais, comme le préchargement par Next d'une adresse encore absente (`/voyages`, Q207, traitée par F11a), ferait échouer la mesure de toute la route sur un délai et non sur le budget. La fonction reste unique (0022 § 4) ; seule l'échéance change.
- **Limite** : un script chargé après 10 s n'est pas compté. Sur une entrée `journal`, l'annotation suffit. Sur une entrée `seuil` (R11, R12, R6), une mesure à l'échéance pourrait sous-compter. C'est donc un **point de revue** : toute PR dont le journal montre « réseau jamais inactif » sur une entrée `seuil` en donne la cause. **F12d au plus tard** fait échouer le test par route quand `networkIdle` vaut faux sur une entrée `seuil`, après la fusion de F11a qui supprime la cause connue (Q207).
- Toute autre valeur d'échéance, ou une échéance ajoutée au test de T4, demande un amendement.

### 3. Réglages Lighthouse `extraHeaders` et `ignoreStatusCode` — complète 0022 § 1 (Q206)
0022 § 1 limite les modifications de la configuration de Lighthouse à `onlyCategories`, `blockedUrlPatterns` et `enableErrorReporting`. Deux réglages s'y ajoutent, **acceptés** :
- **`extraHeaders`** : seulement pour une entrée préparée (`prepare`). Il contient l'en-tête de la portée de simulation (`HEADER` de `tests/e2e/debloquer-helpers.ts`, 0017 § 10.3) qui donne accès à l'état créé par la préparation (paiement commencé, confirmation en attente). Aucune autre en-tête, aucun secret, aucune clé.
- **`ignoreStatusCode: true`** : seulement pour une entrée dont le statut attendu n'est pas 200, c'est-à-dire la page introuvable (`R-introuvable`, 404). Sans lui, Lighthouse s'arrête sur une erreur au lieu de mesurer la page.

Ni l'un ni l'autre ne change le **profil**, le **ralentissement**, l'**émulation** ou un **seuil**. La règle de 0022 § 1 reste entière : toute autre modification demande un amendement.

### 4. Champs ajoutés à `RouteEntry` — complète 0022 § 3
Trois champs facultatifs sont **acceptés** dans `tests/e2e/routes.ts` :
- **`status?: 200 | 404`** : statut attendu du document, 200 par défaut ; 404 pour la page introuvable. Il est lu par les deux mesures.
- **`prepare?: RoutePreparationName`** : nom d'une préparation qui crée l'adresse réelle (`paiement-en-attente`, `confirmation-en-attente`). Les actions vivent dans `ROUTE_PREPARATIONS` de `tests/e2e/route-states.ts`, sur le modèle de `ROUTE_STATES` : `routes.ts` reste des données pures, n'importe que des noms de types et reste lisible par Vitest. Avec `prepare`, `path` est une adresse documentaire (`[paiementId]`).
- **`knownExceedance?`** : voir le § 1.

Toute PR qui inscrit une route peut utiliser ces champs selon leur commentaire dans `routes.ts`. Un champ nouveau dans `RouteEntry` est un point de revue et demande un amendement.

### 5. Octets de JavaScript initial dans `summary.json` : reportés à F12d — amende 0022 § 1
0022 § 1 prévoit dans `lighthouse-report/summary.json` les « octets de JavaScript initial si mesurés ». F12a ne les y met pas : les deux mesures tournent dans deux projets distincts (`perf` hors `pnpm verify`, `e2e` dedans).

**Décision** : report à **F12d**. Celle-ci ajoute à chaque entrée de `summary.json` le total gzip de JavaScript initial de la route, obtenu par `measureInitialJavaScript` (pas de seconde mesure, par exemple tirée de l'audit Lighthouse). Le tableau des mesures de F12d (C30) s'appuie sur ce fichier. D'ici là, le journal du test `budget: JavaScript initial par route` fait foi.

### 6. Q210 — Budget des routes `…/jour/[n]/remplacer/[stopId]` et `…/jour/[n]/ajouter` (F7-Q9)
**Décision** : les deux routes s'inscrivent avec `budgets: { lighthouse: "journal", javascript: "journal" }`.
- **Raison** : la liste des routes soumises aux seuils est fixée par la spécification F12 (F12-PO-2 pour Lighthouse : R11, R12 ; F12-PO-4 pour le JavaScript initial : R12, R11, R6, R15, « journalisé ailleurs »), et 0022 § 4 l'applique. Les deux écrans de F7 n'y figurent pas. Le Tech Lead décide de l'outillage, pas du périmètre des budgets produit. Placer ces routes en `seuil` étendrait F12-PO-2 ou F12-PO-4 : ce serait au Product Owner de le décider.
- **Ce qui reste bloquant** : l'accessibilité Lighthouse = 100 à chaque passage (F12-PO-2, toutes les routes) et l'absence de requête hors de l'application (0022 § 1). Ces deux routes affichent aussi la carte et le panneau du voyage, comme R12 : le JavaScript commun est déjà tenu par le seuil de R12. Leur mesure journalisée montre ce qu'elles ajoutent.
- **Application** : F7a inscrit `…/remplacer/[stopId]`, F7c inscrit `…/ajouter` (critère C29 de la spécification F7), en `journal` pour les deux budgets, avec leurs états. Aucune n'utilise `knownExceedance`.
- Si le Product Owner étend un jour F12-PO-4 à ces écrans, le passage en `seuil` se fait par une simple mise à jour de l'inventaire, sans nouvelle décision d'outil.

## Conséquences
- **0022 § 1** est complété par les § 3 et § 5 de cette décision. **0022 § 3** est complété par le § 4. **0022 § 4** est amendé par le § 1 (dépassement connu) et précisé par le § 2. **0016 § 3.1 règle 5** reste entière pour le test de T4 ; seul le test par route s'en écarte (§ 2).
- **#117** n'a rien à changer pour être conforme à cette décision.
- **T14** (`[front]`, après F12a, avant F12d) : réduction de R6 sous 200 000 octets, retrait de `knownExceedance`, fiabilisation de Q208 (§ 1).
- **F12d** : `networkIdle` bloquant sur les entrées `seuil` (§ 2), JavaScript initial dans `summary.json` (§ 5), et pas de fusion avec un `knownExceedance` sans décision (§ 1).
- **F7a, F7c** : inscription en `journal` (§ 6).
- **Spécification F7** : F7-Q9 est tranchée. Sa prochaine mise à jour peut renvoyer à ce § 6 dans C29.
- Revue : le Tech Lead vérifie ces points sur T14, F7a, F7c et F12d.

## Questions liées
- **Q205** (Tech Lead ; CEO pour l'ordre) : **tranchée** par le § 1. La création de T14 reste au CEO, après la fusion de F12a.
- **Q206** (Tech Lead) : **tranchée** par les § 2 et § 3.
- **Q208** (Tech Lead) : **affectée à T14** (§ 1). Elle reste ouverte jusqu'à la fusion de T14.
- **Q210** (Tech Lead) : **tranchée** par le § 6.

**Nouvelles questions** : aucune.
