# 0074 — Programmes des essais réels dans « Mes voyages » (lecture texte, sans durées ni carte)

Statut : **décidée par le Tech Lead à l'approbation de la PR #406** (architecture : source de l'adaptateur, chemin sans carte, branchement au démarrage), après le verdict de la Sécurité (barrière, lecture de la base depuis l'application sur une préversion, ligne du régime de confinement). Délai de veto de Samuel selon la décision 0068 (6 heures après la fusion) ; à lister dans la note de version. Elle anticipe la **partie lecture** de P0r4 (`specs/P0-suite-2.md`, « P0r4 — Lecture des programmes réels ») sans la remplacer : la relecture Routes, la carte et la page de jugement restent à P0r4.

Date : 2026-10-16 · Rédacteur : back-end · Ticket : #403 · PR : #406.

Demande de Samuel (fil projet « Routine cycle du studio ») :

- 2026-10-16 14:47 UTC : « mainteant ce que j'aimerais c'est afficher ce programme sur nos page https://vadrouille-app-git-p0-reel-…/voyages/ »
- 2026-10-16 14:49 UTC : « et je peux lire le programme aussi? au moins »

## Contexte

Le premier essai réel complet (brief `edimbourg-court.json`, variante B, déploiement `51be8a9`) a écrit un programme dans `prototype.programmes` (forme réduite **sans** `positions`, Q324 ; positions dans `place_coordinates`, 29 jours). Jusqu'ici, seul `/prototype/executions` lisait ce contenu, pour le rapport A1 à A9. L'adaptateur `prototype` lisait un dossier (`VADROUILLE_PROTOTYPE_DIR`) et, sans dossier, ne servait aucun programme ; son relecteur de trajets est simulé (P0b1).

## Décision

1. **Un seul schéma du programme écrit** : `ProgrammeEcritSchema` (`src/prototype/programme-reduit.ts`), forme réduite sans `positions` (clés `CLES_PROGRAMME_ECRIT` : `schema`, `trip`, `proposals`, `terminus`) avec les contrôles de structure communs (`controlerStructure` : jours uniques, un terminus par jour dans l'ordre, propositions sur des jours connus). `ProgrammeReduitSchema` = ces mêmes champs et contrôles + `positions`. Le découpage à l'écriture (`decoupage.ts`, `prototype-ecriture.ts`), le rapport (`rapport.ts`) et la lecture de l'adaptateur s'appuient sur ce seul schéma.
2. **Source réelle de l'adaptateur `prototype`** (`src/adapters/prototype-lecture.ts`). Sans `VADROUILLE_PROTOTYPE_DIR`, l'adaptateur lit `prototype.programmes` :
   - **lecture seule** : une transaction `BEGIN READ ONLY` par lecture, `SET LOCAL statement_timeout = 5000`, un seul `SELECT` fixe, valeurs en paramètres liés, `expires_at > now()` écrit en plus de la politique de lecture ; après une erreur, le client est rendu au pool comme cassé (`release(true)`) ;
   - **« Mes voyages » en une seule requête** : la liste lit tous les contenus non expirés en un `SELECT` (201 lignes au plus) sur une connexion ; la page d'un voyage lit son contenu par `contenu #>> '{trip,id}'` (2 lignes au plus). **Limite assumée** : ce filtre balaie le JSONB sans index ; la table ne contient que quelques programmes de 30 jours au plus, un index relèverait d'une migration de P0r4 si le volume grandit ;
   - **rôle** : `vadrouille_prototype` (pool de la garde de connexion, `poolPrototype()`), comme le prévoit P0r4 ; c'est le rôle qui lit déjà ce contenu pour le rapport. Aucun nouveau rôle, aucune migration, aucune nouvelle variable ;
   - **contenu refusé** : schéma unique, puis `trip.id` égal à l'identifiant demandé ; plus de 200 programmes : échec fermé (jamais une liste tronquée) ;
   - **identifiant en double** (impossible par construction, 0071) : aucun des deux programmes n'est servi, ni par la liste ni par la page du voyage. Le voyage est absent des deux de façon cohérente, sans journal ;
   - le chargeur de dossier reste pour `pnpm dev`, la CI et les e2e (programme de test), avec le relecteur simulé.
3. **Chemin explicite « sans carte »** : la source réelle est servie par `createPrototypeAdapterSansCarte` (`src/adapters/prototype.ts`), qui ne reçoit que des `ProgrammeEcrit` (type sans `positions`) et aucun relecteur. Aucune table de positions n'existe sur ce chemin : `getDayMap` rend `null` et `getTripMap` une liste vide, quel que soit le contenu (test : le même programme complet a une carte par le chemin du chargeur, aucune par ce chemin). Le chemin du chargeur (`createPrototypeAdapter`) garde `ProgrammeReduitSchema`, qui exige une position par lieu.

   **Rapport avec 0046 D15 point 9** (« position manquante ou expirée : programme non servi ») : cette règle protège la **recomposition avec positions** (durées relues, carte). Elle s'applique sans changement au chemin du chargeur et s'appliquera à la lecture de P0r4 qui recomposera avec `place_coordinates` (`recomposerProgramme`). Le chemin sans carte ne lit, n'attend ni ne sert aucune position : il n'y a pas de position « manquante » à masquer, seulement un programme lu en texte. Écart assumé et borné : texte seul, préversion de `p0-reel`, barrière du mode réel.
4. **Aucune durée de trajet** : sans relecteur, aucun appel Routes n'est fait à l'affichage (chaque appel serait payant). Les lignes de trajet sont retirées de la journée, `travelMinutes` vaut 0, les propositions n'ont ni `travelFromPrevious` ni `detour`.

   **Déduction assumée côté interface** : le contrat `Day` ne distingue pas « durée inconnue » de « zéro ». `withoutTravel` (`src/features/sejour/travel.ts`) traite comme « sans trajet » une journée à `travelMinutes === 0` **sans** ligne de trajet. Elle n'affiche alors aucune durée : le budget seul (« Environ {montant} CHF par personne ») ou rien sous le titre du jour, le nombre d'étapes seul dans « Jour par jour » (« Aucune étape » pour 0). Jamais « 0 min de trajet ». Effet de bord accepté : avec l'adaptateur simulé, un vrai jour d'une seule étape perd aussi la ligne « 0 min de trajet », qui n'apportait rien. Tests de rendu dans `JourneePanel.test.tsx` et `SejourPanel.test.tsx`. Un champ explicite « durée inconnue » demanderait de changer `src/contracts` : à reprendre à P0r4 si besoin.
5. **Même barrière que le lancement** (exigence 4) : `src/server/p0/lecture-programmes.ts`, `poolLectureProgrammes()`, rend le pool seulement si la garde du mode réel est ouverte (conditions (1) à (7) de `lireEnvP0` et déploiement autre que la production) **et** si la requête porte un cookie `__Host-p0_acces` valide (posé par la saisie du code sur `/prototype/executions`, chemin `/`, 12 heures). Sinon : aucune connexion, liste vide, voyage introuvable (404). Garde fermée : rien n'est journalisé. Vérifiée à **chaque** lecture. Un échec de création du pool écrit `p0.read_unavailable` (nom d'erreur seulement) et rend `null`.
6. **Branchement au démarrage** : `src/instrumentation.ts`, après la validation de l'environnement, seulement dans le runtime `nodejs` et seulement avec `DATA_ADAPTER=prototype`, branche la barrière sur l'adaptateur (`brancherLectureProgrammesReels`, état sur `globalThis` sous la clé existante `Symbol.for("vadrouille.prototype")`). Les imports sont ciblés (`@/adapters/payment-guard`, `@/adapters/prototype-instance`), pas le barrel `@/adapters`. `src/adapters` n'importe ainsi ni la base ni la garde : les doubles de `@/adapters` des tests restent sans capacité (régime de confinement). Un échec du branchement écrit `p0.read_unavailable` (nom d'erreur seulement), le serveur démarre et la liste reste vide.
7. **Ce qui est affiché** : ce que contient le programme écrit, qui n'est pas une donnée Google stockée (0011 § 1, 0046, 0052) : noms maison des lieux (issus de la recherche web), horaires **planifiés** des étapes, libellés des logements (brief), faits maison, raisons, sources web, événements, idée « Surprends-moi », propositions de la présentation. Aucun nom, adresse, horaire d'ouverture ni statut Google n'est lu ni affiché ; aucun appel Google n'est fait à l'affichage ; `place_coordinates` n'est jamais lue (0052, S6). La mention « Données de lieux : Google » reste affichée par les écrans du prototype.
8. **Aucun cache** : `/voyages` et les pages du voyage sont dynamiques (`force-dynamic`, lecture du cookie par `cookies()`) et répondent `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` ; l'e2e du build de production le vérifie.

## Ce qui reste à P0r4 (questions à Samuel, aucune réponse ne bloque cette lecture)

- **Carte** : afficher les positions sur la carte Google Maps demande de lire `place_coordinates` (lignes non expirées) et d'appliquer 0046 D15 point 9 ; la carte Google n'est chargée que si une clé navigateur est posée sur la préversion.
- **Durées de trajet** : relecture Routes à chaque affichage d'une journée, payante, réservée (nature `relecture`) et plafonnée (P0r4).

## Réglages hors du dépôt (Samuel seulement)

1. **D'abord**, vérifier la protection des préversions Vercel (Q235) : une préversion peut être publique, et la lecture ne tient alors qu'au cookie d'accès (code saisi sur `/prototype/executions`).
2. Variable Vercel `DATA_ADAPTER=prototype`, environnement **Preview**, branche **`p0-reel`** seulement (jamais Production). Sans elle, la préversion garde l'adaptateur `mock` et rien ne change.
3. Sur cette préversion, `VADROUILLE_ENV` doit rester absente (la liste blanche du prototype refuse `staging`) et `VADROUILLE_PROTOTYPE_DIR` absente.
4. Reporter `main` sur `p0-reel` après la fusion, puis saisir le code sur `/prototype/executions` et ouvrir `/voyages`.

Effets de bord assumés sur la préversion de `p0-reel` : « Mes voyages » ne montre plus les voyages simulés (organisation `org_prototype`), la création et le paiement simulés y sont indisponibles (comportement existant de l'adaptateur `prototype`).

## Tests

- `src/adapters/prototype-lecture.test.ts` : barrière fermée sans connexion, identifiant mal formé, lecture seule bornée, une connexion pour la liste, chemin sans carte (aucune durée ni position), chemin sans carte explicite, contenus refusés, doublon, autre organisation, erreur sans message avec client cassé, plafond.
- `tests/unit/p0/lecture-programmes.test.ts` : garde, cookie, échec du pool journalisé par son seul nom.
- `tests/unit/server/instrumentation.test.ts` : `register()` branche la barrière avec `DATA_ADAPTER=prototype` et `NEXT_RUNTIME=nodejs`, ne branche rien sinon, journalise un échec par son seul nom.
- `tests/e2e/lecture-reelle.e2e.spec.ts` : build de production, `DATA_ADAPTER=prototype` sans dossier, garde fermée : `/voyages` répond 200 sans programme et sans cache, un voyage répond 404, aucune requête Google, ni `p0.read_unavailable` ni erreur de configuration au journal du serveur (branchement chargé sans erreur).
- `src/features/sejour/travel.test.ts`, `JourneePanel.test.tsx`, `SejourPanel.test.tsx` : aucune durée inventée.

Ligne ajoutée au régime de confinement : `server-only` de `src/adapters/prototype-lecture.ts` (verdict Sécurité demandé). Événement de journal ajouté : `p0.read_unavailable`.
