# 0079 — Carte Google et temps de trajet des programmes réels (P0r4, partie lecture et relecture)

Statut : **proposée**. **Décideur : Tech Lead** (architecture, plafond d'une relecture), avec la réserve de la
Sécurité sur la barrière, les positions et la relecture (verdict demandé sur le head de la correction 1 de la PR #419) ;
décidée à l'approbation de la PR. Délai de veto de Samuel selon la décision 0068 (6 heures après la fusion) ; à lister dans la
note de version. Elle **complète 0074** (dont elle remplace les points 3 et 4 : chemin « sans carte » et « aucune durée »)
et livre la partie lecture et relecture de P0r4 (`specs/P0-suite-2.md`, « P0r4 — Lecture des programmes réels ») ; la
**page de jugement** et la désignation de la « meilleure des deux » (P0b2, P0-Q32) restent à une tâche suivante.

Date : 2026-10-16 · Rédacteur : back-end · Ticket : #414 · PR : #419. Numéro **0079** : 0076 est prise par #412,
0077 et 0078 sont réservées par #420 et #418 (consigne du CEO à la correction 1).

## Demande de Samuel

Fil « Routine cycle du studio », 2026-10-16 20:54 UTC, carte de décision, option « Oui, les deux » : ajouter la carte
Google **et** les temps de trajet aux voyages réels lus dans « Mes voyages » sur la préversion de `p0-reel`.

## Prérequis relevés sur `main` (head `3108d40`)

1. **Positions écrites** : oui. L'étape finale de `p0Run` écrit le programme et ses positions ensemble
   (`ecrireProgramme`, `src/adapters/prototype-ecriture.ts`, `store_prototype_coordinates`, 0052 S10, 29 jours). Le
   verrou S8 est **levé** : migration `0006_deverrouillage_positions_prototype` (`GRANT EXECUTE … TO vadrouille_prototype`),
   PR #381 fusionnée avec `owner-approved`, appliquée par `db-migrate` (run 38876502011, 2026-10-16 08:51 UTC, relevé de
   `STATUS.md`). Le lancement refuse toute exécution tant que le verrou n'est pas levé (`verrouS8Leve`) : tout programme
   écrit l'a été avec ses positions. Aucune régénération n'est nécessaire, sauf pour un programme dont une position a
   expiré (29 jours) : il n'est alors plus servi (ci-dessous).
2. **Lecture des positions** : `vadrouille_prototype` a `SELECT` sur `public.place_coordinates`, politique limitée à
   `org_prototype` et `expires_at > now()` (`0002_place_coordinates.sql`). Aucune migration.
3. **Durées de trajet** : elles ne sont **pas** dans le programme écrit (forme réduite sans `minutes`, P0-PO-9 ; une durée
   Routes est une donnée Google, jamais stockée). Elles sont **relues à l'affichage** par Routes (payant, réservé).
4. **Purge** : la règle « relecture refusée si la dernière purge a plus de 24 h » (0046 D16 point 8) est appliquée ici.
   Constat : la même règle **au lancement** (P0r3) n'est pas codée dans `src/server/p0/lancement.ts` ; signalé dans la PR,
   hors du périmètre de cette tâche.

## Décision

1. **Source réelle avec positions** (`src/adapters/prototype-lecture.ts`) : dans la transaction en lecture seule de
   0074, après le contenu, **une** requête `SQL_POSITIONS` (`place_id = ANY($1::text[])`, `expires_at > now()`) pour
   tous les `placeId` des programmes lus ; recomposition validée par `ProgrammeReduitSchema` (une position par lieu,
   aucune en trop ; même règle que `recomposerProgramme`, que l'application ne peut pas importer, 0048 § 1). **Une
   position manquante ou expirée : programme non servi** (0046 D15 point 9) — absent de « Mes voyages », et la page du
   voyage lève `PositionsManquantes` (état d'erreur existant, « Réessayer »), jamais un programme sans positions ni une
   position inventée. Les positions ne vont qu'à la carte Google (`getDayMap`, `getTripMap`) ; jamais journalisées.
2. **Adaptateur** : `createPrototypeAdapterReel` (`src/adapters/prototype.ts`) remplace `createPrototypeAdapterSansCarte`.
   Le chemin du chargeur de dossier (`pnpm dev`, CI, e2e, relecteur simulé) ne change pas. L'interface garde
   `withoutTravel` (0074 point 4) pour une journée sans trajet ; elle ne sert plus au chemin réel.
3. **Relecteur réel** (`src/server/p0/relecture.ts`, `creerRelecteurReel`), branché au démarrage par
   `src/instrumentation.ts` avec la barrière de 0074 (`brancherLectureProgrammesReels(barriere, relecteur)`) ; à
   **chaque** Journée relue :
   1. même barrière que le lancement (garde du mode réel, cookie d'accès ; cookie illisible hors portée de requête :
      refus) : nouvelle preuve `GardeRelecture` (`src/server/p0/garde.ts`, même marque que `GardeOuverte`, sans
      exécution) ; fermée : aucune connexion. `GardeRelecture` a la **même protection** que `GardeOuverte` : règles
      `no-restricted-syntax` (conversion, assertion, prédicat de type) et mêmes exemptions dans `eslint.config.mjs`,
      test `@ts-expect-error` (`tests/unit/p0/garde-marque.test.ts`) ; **non-confusion** par les types (une preuve n'est
      jamais l'autre) et à l'exécution (`composerP0Reel` refuse une preuve sans `runId` ou avec `relecture`,
      `composerRelecture` une preuve avec `runId`) ;
   2. purge de moins de 24 h, calculée par la base (`SQL_PURGE_RECENTE`) ; sinon refus ;
   3. forfait de relecture réservé (`reserverRelecture`, nature `relecture`, P0r2) ; plafond du mois ou enveloppe
      atteints : refus `quota_reached` (ces limites sont levées par 0071 tant qu'elle tient ; le code reste prêt) ;
      aucun seuil Routes par jour (Q330) : `daily_quota_insufficient` (forfait au-delà du quota d'une minute, erreur de
      configuration) est traité comme une indisponibilité, jamais comme un plafond atteint ;
   4. client Routes de la composition, **nouvelle fonction** `composerRelecture` (`src/server/composition/p0-reel.ts`),
      borné par le registre en mémoire du forfait et par une **cadence unique par processus** de 3 000 éléments par
      minute (Q330 ; `cadenceRelecture`, `src/server/p0/relecture.ts`, instance de `creerCadence` créée par la
      composition, partagée par toutes les relectures simultanées) ; une requête de matrice par (mode, lieu de départ),
      un élément par trajet distinct ; minutes arrondies au-dessus ; aucun itinéraire : refus. La cadence de `p0Run`
      reste propre à chaque exécution (étape d'un workflow, autre fonction) : le quota de la console Google reste le
      filet commun.
   Un refus rend l'état d'erreur existant de la Journée (`RelectureError`), jamais une durée inventée ni conservée.
4. **Plafonds d'une relecture** : **40 requêtes et 40 éléments** par Journée, **valeur du Tech Lead** qui lève le « non
   tranché » de 0053 (ligne 30) (`PLAFONDS_RELECTURE`, `src/workflows/p0-run.ts`), forfait au prix plein **0,20 USD** ;
   constant (S4). Forfait et règles calculés dans le pont `p0Run` (`relectureDuMode`), comme ceux du lancement.
   **À revoir si 0071 est abrogée** : une ligne de `prototype.forfaits` est écrite par Journée relue, à 0,20 USD
   (≈ 0,60 à 0,80 USD pour un Séjour de 3 jours, pour ≈ 0,13 USD réels), tranche gratuite non déduite (Q329) ; avec le
   plafond de 20 USD par mois rétabli, ≈ 25 affichages de Séjour l'épuiseraient. Aujourd'hui, aucun plafond n'est actif
   côté application (0071) : seuls comptent la cadence, le forfait par relecture et les quotas que Samuel pose chez
   Google.
5. **Imports** : `src/server/p0/relecture.ts` devient le **second importateur admis** de la composition du mode réel
   (`tests/unit/p0/composition.test.ts`), par `import()` littéral, chargé seulement à la première relecture ; il charge
   `@/workflows` de même. La composition reste le seul importateur des modules de capacité.
6. **Journal** : un refus après la garde écrit `p0.read_unavailable` avec un nom fermé (`PurgeAncienne`,
   `PlafondAtteint`, `ReservationImpossible`, ou le nom de l'erreur du client), jamais une durée, un identifiant de lieu
   ni un message. Garde fermée : rien. Le même événement couvre donc **deux niveaux** : `error` quand le branchement ou
   le pool de lecture échoue (0074), `warn` quand une relecture est refusée (ici).
7. **Cache** : les pages `/voyages` et du voyage sont dynamiques ; Next.js y répond `Cache-Control: private, no-cache,
   no-store, max-age=0, must-revalidate` (vérifié par `tests/e2e/lecture-reelle.e2e.spec.ts`, liste, voyage et Journée).
   Aucune règle `/voyages/:path*` n'est ajoutée à `RESPONSE_HEADERS` : elle s'appliquerait aussi aux voyages simulés et
   au hors-ligne (F10b), hors du périmètre.
8. **Parité de la recomposition** : `tests/unit/p0/recomposition-parite.test.ts` compare la recomposition de la lecture
   réelle à `recomposerProgramme` (positions complètes, en trop, manquantes, hors bornes).

## Coût estimé (Routes, matrice Essentials, 5 USD les 1 000 éléments, 10 000 gratuits par mois)

Un élément par trajet affiché. Un voyage de 3 jours d'environ 6 trajets par jour : ~18 éléments à l'affichage du Séjour
(chaque Journée relue), plus ~8 pour la présentation (propositions) ; soit **~0,09 à 0,13 USD au prix plein**, **0 USD**
dans la tranche gratuite. Chaque Journée réserve 0,20 USD de forfait dans `prototype.forfaits` (compte de surestimation,
sans effet depuis 0071).

## Tests remplacés (règle de `CLAUDE.md`)

Dans `src/adapters/prototype-lecture.test.ts`, « chemin sans carte : aucune carte, aucune durée » et « chemin sans carte
explicite » sont **remplacés** par « programme réel servi avec sa carte et ses durées relues » et « relecture refusée :
la journée n'est pas servie » : le chemin qu'ils protégeaient n'existe plus (décision de Samuel). Le test de lecture
seule couvre désormais aussi `SQL_POSITIONS`. Les tests de rendu de 0074 (`travel.test.ts`, `JourneePanel.test.tsx`,
`SejourPanel.test.tsx`) restent.

## Tests ajoutés

- `p0: position manquante ou expirée : programme non servi` (`prototype-lecture.test.ts`) ;
- `p0: lecture sans barrière : refus et aucun appel Routes` (relecteur, `tests/unit/p0/relecture.test.ts`) ;
- `p0: relecture refusée si la dernière purge a plus de 24 h` ;
- `p0: relecture refusée si le plafond Google du mois ou l'enveloppe est atteint` (et aucun refus au titre d'un seuil
  Routes par jour, Q330) ;
- registre du forfait, regroupement des requêtes, aucun itinéraire, forfait constant ;
- cadence partagée par plusieurs relectures simultanées (horloge injectée) et instance unique ;
- `GardeRelecture` : règles ESLint (`tests/unit/lint/canonical-email-lint.test.ts`), `@ts-expect-error` et non-confusion
  (`garde-marque.test.ts`, `composition.test.ts`) ;
- parité de la recomposition.

## Ce qui reste

- Page de jugement, « meilleure des deux », bilan (P0b2, P0-Q32) ;
- e2e « sans barrière » sur la page de jugement (n'existe pas encore) ;
- exigence 4 : verdict Sécurité et accord écrit de Samuel sur la PR.

## Réglages hors du dépôt (Samuel seulement)

- Clé **navigateur** Google Maps et identifiant de carte sur la préversion de `p0-reel` (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`,
  `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`, environnement Preview, branche `p0-reel`), clé restreinte aux référents de la
  préversion et à l'API Maps JavaScript ; sans elles, la carte affiche son état de remplacement (les durées s'affichent).
- API Routes déjà activée pour la clé serveur de `p0Run` (aucun réglage nouveau).
