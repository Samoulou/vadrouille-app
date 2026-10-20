# 0105 — Décisions du Tech Lead pour B9c : `organizationId` dans l'état du workflow, fixtures d'Édimbourg hors de l'image, base des tests de l'aperçu, créneaux `noOption` de repli et arrêt sans raison

Statut : **décision déléguée** (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion (décision 0093) ; Samuel peut la remettre en cause à tout moment. Elle n'engage ni argent, ni compte externe, ni donnée personnelle hors UE, et ne touche aucun plafond.

Date : 2026-10-20 · Décideur : Tech Lead · Ticket : #522 (PR #563, revue consolidée du head `065634d`, bloquants 1 et 5, mineurs 13 et 17) · Spécification : `specs/B9-generation.md` · Décisions liées : 0009, 0032 § A4.4, 0063 point 11, 0081 (B9-TL-3, B9-TL-8), 0083

**Hors de cette décision, volontairement** : les écarts produit de la PR (« Surprends-moi », événements sans heure, villes limitées à J1 et J2, repas avec options, réutilisation des candidats d'exécutions précédentes) sont au Product Owner (0106). Le bloquant 2 (clôture `upstream_unavailable`), les bloquants 3, 4 et 6 (tests) et les mineurs restants de la revue sont des corrections de code, sans décision.

## 1. `organizationId` dans l'état sérialisé (Q-B9c-1 ; bloquant 5)

**Confirmé**, comme règle et non comme exception.

Raisons : (a) la règle de fond est celle de 0009 et du handover back-end § 8 (« État persistant des workflows ») : l'état ne contient que des **identifiants internes (organisation, voyage, version, exécution, candidat)**, des compteurs et des codes fermés ; `{ generationRunId, rang }` de 0081 B9-TL-3 point 3 était le minimum, pas une liste fermée de la règle. (b) Les politiques par ligne des tables de génération ne montrent une ligne que sous `app.organization_id` (`withSystemOrg`) : sans l'organisation, une étape ne peut pas lire son exécution. Relire l'organisation hors politique exigerait un accès sans isolation, ce qui est pire. (c) L'identifiant d'organisation n'est ni une donnée de lieu ni une donnée Google.

Règle (amende 0081 B9-TL-3 point 3 et son point 1 (4) : l'entrée de `generatePreview` et `generateFullTrip` est `{ generationRunId, organizationId, rang }`, plus `arret?` en sortie) :
1. L'état contient au plus `generationRunId`, `organizationId`, `rang` et `arret` (code fermé de `CODES_ARRET`). Tout autre champ exige une décision écrite. Le schéma reste `z.strictObject`.
2. `organizationId` est une **indication de portée, jamais une preuve** : l'étape lit sa ligne `generation_runs` sous `withSystemOrg(organizationId)`. Si la ligne n'est pas visible (organisation fausse ou exécution inconnue), l'étape s'arrête sans écriture ni appel ; elle n'élargit jamais la portée.
3. Le démarreur (`startWorkflow`, B9d, et la réconciliation de B9-TL-12) tire `organizationId` de la ligne réservée en base, jamais d'une entrée de la personne.
4. Le test `workflows: aucune donnée Google dans l'état sérialisé` valide l'état par ce schéma, exige un `organizationId` UUID, refuse une clé de plus ou de moins, et ajoute un cas « organisation qui ne possède pas l'exécution : arrêt sans écriture ni appel » (base, `pnpm test:db`).
5. Renvoi à ajouter en tête de 0081 par la PR de B9c (une ligne), sans réécrire le texte.

Q-B9c-1 est close : B9d n'est plus bloquée par elle.

## 2. Fixtures d'Édimbourg hors de l'image Docker (bloquant 1)

**Option du CEO validée, amendée sur un point** : le chargement ne doit pas passer par un `import()` à spécificateur littéral.

**Pourquoi l'amendement.** Le bundler résout à la construction tout `import("../../../prototype/…json")` dont le chemin est un littéral, y compris dans une branche jamais exécutée : l'image échouerait de la même façon (`Module not found`). L'isolement par `import()` dynamique n'écarte donc le défaut que si le chemin n'est pas résoluble par le bundler.

**Règle.**
1. Les cinq fixtures (`modeles`, `pages`, `places`, `recherche`, `routes`) sont lues par **un seul module** de `src/server/composition/` (par exemple `fixtures-simulees.ts`), par **lecture de fichier à l'exécution** (`node:fs/promises`, chemin construit à l'appel à partir de la racine du dépôt), validée par les schémas existants (`FixturesModelesSchema`, `FixturesPagesSchema`, `FixturesPlacesSchema`, `FixturesRechercheSchema`, `FixturesRoutesSchema`). `generation.ts` n'importe plus aucun fichier de `prototype/` ; il atteint ce module par un `import()` dynamique d'un fichier de `src/` (résoluble), **seulement** dans `composerSimulee`, donc seulement après la barrière.
2. **Jamais atteignable en production** : la composition simulée n'est appelée qu'après `evaluerBarriere`, et `composer("production")` lève `ArretEtape("production_refused")` avant tout chargement (0081 B9-TL-8). Par défense en profondeur, le module de fixtures **refuse lui-même** de lire quand l'environnement déclare `production` (ou une valeur inconnue, règle de la barrière) et rend une erreur fermée, jamais un chemin ou un message de fichier.
3. `.dockerignore` et 0032 § A4.4 ne changent pas : l'image ne contient aucun fichier de `prototype/` hors ceux que lit `p0Run` (0063 point 11). Les fixtures y étant absentes, la lecture échouerait de toute façon.
4. `composerSimulee` devient asynchrone (ou reçoit les fixtures déjà chargées par l'appelant, après la barrière) ; `composer(etat)` de `dependances.ts` s'adapte. Aucune lecture de fichier au chargement du module ni au niveau du module (aucune fixture en cache de module : la règle « fabrique appelée dans l'étape » de `generation.ts` est conservée).
5. Sur Vercel (préversion, hors Docker), `prototype/fixtures/**` doit être embarqué par le traçage de fichiers (`outputFileTracingIncludes` dans `next.config.ts`, pour la route du workflow). Ce réglage est inoffensif dans l'image, où les fichiers sont absents du contexte. La PR vérifie, par une construction locale, que la préversion simulée trouve ses fixtures ; si le traçage ne suffit pas, elle le signale (question au Tech Lead), sans ré-inclure `prototype/` dans `.dockerignore`.

**Tests qui gardent l'option.**
- `tests/unit/docker/dockerignore.test.ts` (déjà exécuté par `pnpm verify`) est étendu : le balayage des imports JSON, aujourd'hui limité à `src/workflows`, couvre **tout `src/` hors tests** et compte comme import tout spécificateur **littéral**, statique ou `import()`, qui aboutit à un fichier exclu du contexte (règles `.dockerignore` appliquées par le test). Un cas de contrôle (fichier fictif qui importe `prototype/fixtures/…`) doit être refusé ; les trois imports `p0Run` ré-inclus nommément restent admis.
- Un test unitaire de `composition` : `composer("production")` ne charge aucune fixture (espion sur le chargeur : zéro appel) et lève `production_refused` ; le module de fixtures refuse de lire sous `VADROUILLE_ENV=production`.
- Preuve de bout en bout : le job CI `docker` (A4.4) redevient vert ; il est la garde finale. Un job `docker` rouge bloque la fusion.

## 3. Q-B9c-4 : budget de requêtes du jour de la base commune

**Du ressort du Tech Lead (tests). Décision : l'isolation actuelle est confirmée, sans extension générale.**
1. Les trois fichiers de tests de l'aperçu tournent dans une **base jetable** (`tests/db/base-apercu.ts`). `usage.test.ts` reste sur la base commune : il mesure le quota de 1 000 requêtes par jour de la base partagée et doit rester le seul à le faire.
2. Règle : **toute suite qui réserve un forfait de génération ou de relecture au registre `usage_ledger`** (ajout seul, jamais purgé) tourne dans une base jetable ; une suite qui n'y écrit rien reste sur la base commune. Pas de migration générale des autres suites : leur consommation est nulle ou négligeable, et un déplacement massif sans besoin coûte du temps de CI.
3. Le registre n'est jamais purgé ni tronqué pour les besoins des tests (0083 : ajout seul). Un échec local de `usage.test.ts` dû aux cumuls d'exécutions antérieures sur une vieille base locale se règle en recréant la base locale ; la CI part d'une base neuve et n'est pas concernée.
4. Test de garde à ajouter à la PR, léger : un test unitaire qui échoue si un fichier de `tests/db/` importe `reserverForfait`/le port de consommation de génération sans passer par `creerBaseApercu` (liste explicite des exceptions : `usage.test.ts`).

## 4. Q-B9c-6 : créneaux `noOption` de repli et arrêt sans raison

**Du ressort du Tech Lead pour la manière ; la règle produit est B9-PO-5.**

**4.1 Créneaux `noOption` de repli (mineur 13).** Conservés **tirés du squelette** (`creneauxDeRepli` de `cases.ts`) : demi-heures de la fenêtre de chaque jour planifié, `kind` `meal` dans la fenêtre d'un repas du jour, `activity` sinon. Raison : B9-PO-5 demande des cases `noOption` à la suite jusqu'à huit, avec `day`, `time` et `kind` d'une case manquante, et la règle du dépôt interdit les heures fixes. Ordre : d'abord les créneaux manquants de `creneauxAttendus`, puis les créneaux de repli, jamais de doublon `(jour, heure)`. Corrections à la PR : la description cesse de dire « conservés en l'état » ; un test fige l'ordre et le `kind` des créneaux de repli (5 `proposal`, 3 `noOption`, `ready` = 5, `expected` = 8, comme le demande le bloquant 4). Si le Product Owner juge que le nombre de cases affichées doit s'écarter de B9-PO-5, il le dit dans 0106.

**4.2 Arrêt sans raison laissé dans la version 1 (mineur 17).** Accepté : `StopSnapshot.reason` est facultatif (`src/contracts/trip.ts`). Quand la rédaction des raisons échoue pour un lieu (après le retrait borné des candidats sans raison), l'arrêt reste dans la version 1 **sans `reason`** et **ne donne aucune case `proposal`** (la case exige sa raison et son lieu ancré) ; il n'est jamais inventé. À ajouter : un test (une raison absente pour un lieu → arrêt présent dans l'instantané sans `reason`, aucune case `proposal` pour lui, `incomplete`), et une phrase dans le commentaire d'`etapes.ts` près de `sansRaison`. Le même commentaire documente le mineur 17 de la revue (dédoublonnage de `c` avant la notation : un candidat gardé non noté laisse le lieu sans candidat éligible en `e`).

## Conséquences pour la PR #563

Corrections attendues, sans autre décision : `etat.ts` (commentaire : la règle de la section 1 remplace « écart à 0081 »), chargeur de fixtures de la section 2 et extension de `dockerignore.test.ts`, garde de la section 3, description de la PR (section 4). Les bloquants 2, 3, 4 et 6 restent à corriger dans le code, et les écarts produit à 0106.

## Questions

Aucune pour Samuel. Au Tech Lead, à la PR : si le traçage de fichiers de Vercel n'embarque pas les fixtures (section 2 point 5).
