# 0074 — Programmes des essais réels dans « Mes voyages » (lecture texte, sans durées ni carte)

Statut : proposée par le rôle back-end **pour le Tech Lead** (architecture : source de l'adaptateur, branchement au démarrage) et **pour la Sécurité** (barrière, lecture de la base depuis l'application sur une préversion, ligne du régime de confinement) ; délai de veto de Samuel selon la décision 0068. Elle anticipe la **partie lecture** de P0r4 (`specs/P0-suite-2.md`, « P0r4 — Lecture des programmes réels ») sans la remplacer : la relecture Routes, la carte et la page de jugement restent à P0r4.

Date : 2026-10-16 · Rédacteur : back-end · Ticket : #403 · Demande de Samuel du 2026-10-16 14:47 UTC (« afficher ce programme sur nos pages /voyages/ »), précisée à 14:49 UTC (« et je peux lire le programme aussi ? au moins »).

## Contexte

Le premier essai réel complet (brief `edimbourg-court.json`, variante B, déploiement `51be8a9`) a écrit un programme dans `prototype.programmes` (forme réduite **sans** `positions`, Q324 ; positions dans `place_coordinates`, 29 jours). Jusqu'ici, seul `/prototype/executions` lisait ce contenu, pour le rapport A1 à A9. L'adaptateur `prototype` lisait un dossier (`VADROUILLE_PROTOTYPE_DIR`) et, sans dossier, ne servait aucun programme ; son relecteur de trajets est simulé (P0b1).

## Décision

1. **Source réelle de l'adaptateur `prototype`** (`src/adapters/prototype-lecture.ts`). Sans `VADROUILLE_PROTOTYPE_DIR`, l'adaptateur lit `prototype.programmes` :
   - **lecture seule** : une transaction `BEGIN READ ONLY` par lecture, deux `SELECT` fixes (identifiants, puis contenu d'un voyage par `contenu #>> '{trip,id}'`), valeurs en paramètres liés, `expires_at > now()` écrit en plus de la politique de lecture ;
   - **rôle** : `vadrouille_prototype` (pool de la garde de connexion, `poolPrototype()`), comme le prévoit P0r4 ; c'est le rôle qui lit déjà ce contenu pour le rapport. Aucun nouveau rôle, aucune migration, aucune nouvelle variable ;
   - **schéma strict** : forme réduite sans `positions` (`ProgrammeEcritSchema`), `trip.id` égal à l'identifiant demandé ; deux lignes pour un même voyage : rien n'est servi ; plus de 200 programmes : échec fermé ;
   - le chargeur de dossier reste pour `pnpm dev`, la CI et les e2e (programme de test), avec le relecteur simulé.
2. **Même barrière que le lancement** (exigence 4) : `src/server/p0/lecture-programmes.ts`, `poolLectureProgrammes()`, rend le pool seulement si la garde du mode réel est ouverte (conditions (1) à (7) de `lireEnvP0` et déploiement autre que la production) **et** si la requête porte un cookie `__Host-p0_acces` valide (posé par la saisie du code sur `/prototype/executions`, chemin `/`, 12 heures). Sinon : aucune connexion, liste vide, voyage introuvable (404). Garde fermée : rien n'est journalisé. Vérifiée à **chaque** lecture.
3. **Branchement au démarrage** : `src/instrumentation.ts`, après la validation de l'environnement et seulement avec `DATA_ADAPTER=prototype`, branche la barrière sur l'adaptateur (`brancherLectureProgrammesReels`, état sur `globalThis` sous la clé existante `Symbol.for("vadrouille.prototype")`). `src/adapters` n'importe ainsi ni la base ni la garde : les doubles de `@/adapters` des tests restent sans capacité (régime de confinement). Un échec du branchement écrit `p0.read_unavailable` (nom d'erreur seulement) et la liste reste vide.
4. **Aucune durée de trajet** : sans relecteur (`relecteurs.trajets: null`), aucun appel Routes n'est fait à l'affichage (chaque appel serait payant). Les lignes de trajet sont retirées de la journée, `travelMinutes` vaut 0, les propositions n'ont ni `travelFromPrevious` ni `detour`. L'interface n'affiche aucune durée pour une journée sans ligne de trajet (`withoutTravel`, `src/features/sejour/travel.ts`) : le budget seul (« Environ {montant} CHF par personne ») ou rien sous le titre du jour, le nombre d'étapes seul dans « Jour par jour ». Jamais « 0 min de trajet ».
5. **Aucune position, aucune carte** : `place_coordinates` n'est jamais lue (0052, S6) ; le programme est servi avec une table `positions` vide, donc `getDayMap` rend `null` et `getTripMap` une liste vide. Aucune donnée de lieu Google n'atteint une carte, Google ou non. La mention « Données de lieux : Google » reste affichée par les écrans du prototype.
6. **Ce qui est affiché** : ce que contient le programme écrit, qui n'est pas une donnée Google stockée (0011 § 1, 0046, 0052) : noms maison des lieux (issus de la recherche web), horaires **planifiés** des étapes, libellés des logements (brief), faits maison, raisons, sources web, événements, idée « Surprends-moi », propositions de la présentation. Aucun nom, adresse, horaire d'ouverture ni statut Google n'est lu ni affiché ; aucun appel Google n'est fait à l'affichage.

## Ce qui reste à P0r4 (questions à Samuel, aucune réponse ne bloque cette lecture)

- **Carte** : afficher les positions sur la carte Google Maps demande de lire `place_coordinates` (lignes non expirées) et d'appliquer « position manquante ou expirée : programme non servi » (0046 D15 point 9) ; la carte Google n'est chargée que si une clé navigateur est posée sur la préversion.
- **Durées de trajet** : relecture Routes à chaque affichage d'une journée, payante, réservée (nature `relecture`) et plafonnée (P0r4).

## Réglages hors du dépôt (Samuel seulement)

- Variable Vercel `DATA_ADAPTER=prototype`, environnement **Preview**, branche **`p0-reel`** seulement (jamais Production). Sans elle, la préversion garde l'adaptateur `mock` et rien ne change.
- Sur cette préversion, `VADROUILLE_ENV` doit rester absente (la liste blanche du prototype refuse `staging`) et `VADROUILLE_PROTOTYPE_DIR` absente.
- Effets de bord assumés sur la préversion de `p0-reel` : « Mes voyages » ne montre plus les voyages simulés (organisation `org_prototype`), la création et le paiement simulés y sont indisponibles (comportement existant de l'adaptateur `prototype`).

## Tests

`src/adapters/prototype-lecture.test.ts` (barrière fermée sans connexion, lecture seule, schéma strict, aucune durée ni position, autre organisation, erreur sans message, plafond), `tests/unit/p0/lecture-programmes.test.ts` (garde et cookie), `src/features/sejour/travel.test.ts` (aucune durée inventée). Ligne ajoutée au régime de confinement : `server-only` de `src/adapters/prototype-lecture.ts` (verdict Sécurité à rendre). Événement de journal ajouté : `p0.read_unavailable`.
