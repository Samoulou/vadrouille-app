# 0125 — Bout en bout, lot 3 : le brief saisi dans l'app lance `p0Run` (brief lié à l'exécution, identifiant du voyage connu au lancement, phases vers `GenerationStatus`, récit porté par `TripRequest`)

Statut : **proposée** par le rôle back-end (ticket #702), décision déléguée du **Tech Lead** (architecture, contrats, tests : « Qui décide quoi » de `docs/CONTEXT.md`), **à valider en revue** par le Tech Lead ; définitive à sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle ne supprime ni ne désactive aucun test. Elle ne tranche rien de réservé à Samuel : l'envoi du récit saisi au fournisseur de modèles repose sur sa confirmation de Q557 (« Oui », 2026-10-21 06:49 UTC) ; l'application de la migration reste à son `owner-approved` (0035). Deux points attendent le **verdict de la Sécurité** (§ 6).

Date : 2026-10-22 · Décideur : Tech Lead (proposée par back-end) · Ticket : #702 · Spécification : `specs/E2E-essai-bout-en-bout.md`, lot 3, « Points à trancher dans la relecture » · Décisions liées : 0011, 0035, 0046 (D16, S1 à S3), 0055 (§ 8), 0063, 0071, 0092, 0093, 0094, 0115, 0116, 0117 (§ 2, § 5, S5), 0124

**Amende** :
- le contrat `TripRequest` (`src/contracts/creation.ts`, § 5) ;
- le contrat de la table de travail (`ExecutionEnCours.brief`, `src/contracts/prototype-travail.ts`, § 5) ;
- la règle « briefs commités seulement » de 0115 et 0117 § 5 point 3, qui devient « brief commité, ou brief saisi sous le code d'accès sur le site d'essai » (§ 6, sous réserve du verdict de la Sécurité).

**N'amende pas** :
- 0011 : aucune donnée Google n'est stockée ni mise dans un prompt ; le brief saisi est du texte maison ;
- 0055 § 8 et 0063 : même garde, même ordre, mêmes plafonds ;
- 0071 : aucune limite par jour ;
- 0093 : nature `essai`, fusible de 2 USD.

## Contexte

Le lot 3 fait démarrer `p0Run` depuis le lancement de l'app (écran `R-lancer` du site d'essai), sur le brief que la personne vient de saisir, puis fait suivre la préparation par l'écran 5 jusqu'au voyage. Trois faits du code l'imposaient :
- une exécution ne portait qu'un **nom de fichier** de `prototype/briefs/`, contrôlé par `runs_brief_check` et lu par l'étape (`briefDe`) ;
- l'identifiant du voyage était calculé **à l'écriture** du programme (`proto_<slug>_<AAAAMMJJ>_<rang du jour>`), alors que l'écran 5 doit le connaître dès le lancement ;
- l'adaptateur `prototype` n'avait pas de création (`getCreationAdapter` rendait celle de `mock`).

La spécification laisse trois points à la relecture : la forme du brief saisi, l'identifiant connu au lancement, la correspondance des phases. Ils sont tranchés aux § 1, 2 et 4.

## 1. Forme du brief saisi : table liée `prototype.run_briefs` (migration 0017)

Retenu : une **table liée** plutôt qu'une colonne de `prototype.runs`. Raisons :
- `runs` est le registre gardé jusqu'à la fin de la phase 0, sans expiration ; le brief saisi, lui, porte un récit écrit par une personne et doit expirer ;
- une table à part a ses propres droits (ni `UPDATE` ni `DELETE` pour `vadrouille_prototype`), sa RLS et sa purge, sans toucher aux droits par colonnes de `runs`.

Forme :
- `runs.brief` vaut un nom de fichier admis **ou** le marqueur `saisi` (`BRIEF_SAISI`), jamais autre chose (`runs_brief_check` amendée).
- `run_briefs(id, organization_id, run_id UNIQUE, request_id, brief jsonb, expires_at)` :
  - clé étrangère composite vers `runs` ;
  - `UNIQUE (organization_id, request_id)` ;
  - contrainte : objet JSON, clés du premier niveau de `BriefSchema` seulement (`src/prototype/brief.ts`), 16 Kio stockés au plus ;
  - le contenu est validé par `BriefSchema` au lancement **et** dans l'étape.
- **Jamais les deux** : le déclencheur `run_briefs_set_values` (S1) n'accepte qu'une exécution `saisi`, `en_cours`, d'`org_prototype`. Il écrase l'identifiant, l'organisation et l'expiration.
- **Jamais aucun** : le déclencheur de contrainte différé `runs_brief_saisi_present` refuse au `COMMIT` une exécution `saisi` sans son brief.
- **Expiration** : début de l'exécution + 29 jours, celle de son programme. `prototype.purge_expired()` est remplacée sous son propriétaire et supprime les briefs expirés avec les programmes. La politique de lecture de `vadrouille_prototype` cache déjà une ligne expirée.
- **Migration inverse** (`0017_brief_saisi_prototype.down.sql`, partielle) : règle du rôle `data`, aucune suppression. Elle rétablit seulement l'ancienne contrainte de `runs` en `NOT VALID`. La table, ses droits et sa purge restent (`db/README.md` § 2).
- **Application** : par `db-migrate`, après l'`owner-approved` de Samuel sur la ligne de `MIGRATIONS_APPROUVEES`. Comme pour #675 puis #681, cette ligne est ajoutée par une **PR de workflow à part**, après la fusion, avec l'empreinte calculée sur `origin/main`. Avant l'application, un lancement depuis l'app est refusé par la base dans la transaction de réservation (`usage_unavailable`, rien n'est écrit) ; `/prototype/executions` est inchangé.

## 2. Lancement : point d'entrée commun, identifiant du voyage connu au lancement

- **Point d'entrée commun** (`src/server/p0/lancement.ts`). `lancerExecutionP0` (formulaire de `/prototype/executions`) et `lancerBriefSaisi` (app) partagent `ouvrirGardeLancement` et `demarrer`. Ordre, le premier refus l'emportant :
  1. garde (conditions de 0055 et code d'accès) ;
  2. `P0RUN_COMPLET` ;
  3. conversion du formulaire (§ 3) et `BriefSchema` (`validerBriefSaisi`) ;
  4. `lancementDuMode("essai")` et commit ;
  5. plafonds du mode sur le brief converti (`briefSaisiTientDansLeMode`, même calcul que `briefTientDansLeMode`) ;
  6. verrou S8 ;
  7. réservation ;
  8. démarrage.

  Jusqu'au point 5 compris, aucune connexion à la base. Nature `essai` (fusible de 2 USD, 0093), variante `A`.
- **Idempotence** : par `requestId`, une clé par brouillon, créée une fois par l'étape. Sous le verrou de la réservation, une clé déjà écrite rend son exécution (`existante`) : rien n'est écrit, et le workflow **n'est pas redémarré**, car un second démarrage clorait le premier. Double appui, « Réessayer » après une réponse perdue et retour du navigateur rendent donc le même voyage.
- **Identifiant du voyage** : `proto_<slug>_<uuid de l'exécution sans tirets>` (`identifiantVoyageSaisi`, 63 caractères au plus). Il est connu dès la réservation et stable, et n'a pas de course sur le rang du jour. L'étape l'écrit pour une exécution `saisi` ; les essais de `/prototype/executions` gardent `proto_<slug>_<AAAAMMJJ>_<n>`. `lireIdentifiantVoyageSaisi` ne lit que la forme à 32 chiffres hexadécimaux.
- **Pas de session sur le site d'essai** (D3) : le code d'accès tient lieu de compte.
  - `createTrip` saute le contrôle de session quand l'adaptateur est `prototype`, garde `parseInput` et le contrôle de la date d'arrivée, puis passe le contexte `org_prototype`.
  - L'adaptateur rend `unauthenticated` si le cookie d'accès manque ou a expiré, et l'étape redemande alors le code.
- **Branchement** : `src/server/p0/creation-essai.ts` est le port branché par `src/instrumentation.ts`. Il lit le cookie et le pool `vadrouille_prototype`. L'adaptateur `src/adapters/prototype-creation.ts` n'importe ni la base ni la garde.
- Un échec du branchement écrit l'événement `essai.creation_unavailable` (`errorName` seul) ; la création rend alors `provider_error`.

## 3. Conversion du formulaire (D1)

Module pur `src/server/p0/depuis-formulaire.ts`, sans lecture, réseau ni donnée Google. Le type du brief y est **recopié**, car l'application n'importe pas `src/prototype` (0048 § 1). Un contrôle de type du pont (`src/workflows/p0-run.ts`, `MemesCles`) le tient égal à `BriefSchema`.

Conversion :
- pays : table maison `src/lib/fuseaux/pays.json`, mêmes clés que `villes.json` ;
- heures : celles du vol saisi, sinon `09:00` et `22:30` (`CONFIGURATION_MOTEUR.fenetreJour`) ;
- budget : 25 CHF au plus → 1, 26 à 60 → 2, au-delà → 3 ;
- logement : nom saisi, ou « quartier, destination », ou la destination ;
- déplacements vides : marche et transports ;
- engagements : réservations et billets ; un vol n'en est pas un ;
- limites : non transmises (lot 5).

Refus, chacun sur son champ et avant toute réservation :
- `draft.destination` : ville absente de la table des fuseaux ou des pays ;
- `draft.otherCities` : une autre ville ;
- `draft.end` : plus de 15 jours ;
- `story` : récit refusé par `BriefSchema` (e-mail ou téléphone). Seul le chemin du champ est rendu, jamais la valeur.

## 4. Phases de l'exécution vers `GenerationStatus` (écran 5)

| État de l'exécution | `GenerationStatus` |
| --- | --- |
| `en_cours` | `preparing`. Jours de l'aperçu (1 et 2, un seul pour un séjour d'un jour) « En préparation », `expected` = `MAX_PREVIEW_SLOTS`, `ready` = 0. Le programme est écrit d'un coup (D4), il n'y a pas d'avancement par étape. |
| `programme_ecrit` | `ready`. Jours et étapes de l'aperçu tels que le parcours d'essai les sert (`selectionApercu`, lot 1), toutes prêtes. L'écran 5 propose « Voir mes propositions » et « Passer, voir le programme ». |
| `arretee` | `failed`, `provider_error`, `retryable`. Une exécution sans programme ne compte jamais (0093 point 2). |
| autre organisation, identifiant d'un autre voyage, exécution inconnue, brief expiré, barrière fermée | `not_found` |

« Réessayer » sur un échec relance le brief stocké de l'exécution arrêtée sous une **nouvelle** exécution et un **nouveau** voyage :
- `relancerBriefSaisi` passe par la même garde que le lancement ;
- l'action dédiée `relancerVoyageEssai` est fermée hors `prototype`. Contrairement à `retryGeneration`, elle rend un autre `tripId` ;
- l'écran 5 remplace alors l'adresse par celle du nouveau voyage ;
- son `requestId` est créé une fois par écran, donc un double appui ne réserve qu'une exécution.

L'ancienne chaîne (aperçu, voyage complet, recalcul) n'est jamais atteinte (D6) : `getFullTripStatus` rend `none`.

## 5. Changements de contrat

- `TripRequest.story` : texte facultatif (`STORY_LENGTH`). Seul l'adaptateur `prototype` le lit, et le transmet au brief (`recit`). `mock` et `api` l'ignorent, sans changement de comportement (critère 7).
  - Ligne ajoutée au tableau des champs du handover back-end (§ 5), catégorie « stocké » : dans `run_briefs` seulement, 29 jours.
  - L'interface ne l'envoie que sur le site d'essai, et seulement s'il tient dans les bornes.
- `BRIEF_SAISI = "saisi"` (`src/contracts/prototype-travail.ts`) : marqueur de `ExecutionEnCours.brief` pour une exécution lancée depuis l'app.
  - `lireBriefSaisi` (`src/adapters/prototype-travail.ts`) lit son brief, exécution en cours seulement.
  - L'étape le revalide par `BriefSchema` : refusé, l'étape s'arrête sur `brief_invalid` avant tout appel.

## 6. Données personnelles et sécurité

- **Récit envoyé au fournisseur de modèles** : le récit saisi part tel quel dans la requête `programme`, entre les bornes de données, avec `zdr: true` et `data_collection: "deny"` (0117 S5). C'est le cadre de la confirmation de Samuel à Q557. Il n'entre dans aucun journal, aucune trace et aucun rapport : le lancement et l'étape ne journalisent que des codes et des nombres.
- **Aucune donnée Google** n'entre dans le brief, la base de cette table ou un prompt. Un test canari tourne avec un brief saisi.
- **À rendre par la Sécurité** :
  1. le **stockage** du récit et du brief de Samuel dans `run_briefs`, 29 jours, sous le code d'accès du site d'essai : la règle « briefs commités seulement » de 0115 et 0117 § 5 point 3 devient « brief saisi sous code d'accès, site d'essai » ;
  2. les **noms de lieux proposés par l'IA** envoyés à Text Search quand le brief vient d'un récit réel (0117 § 2). La requête reste celle de 0117 : nom du lieu et ville seulement, jamais le récit.

## 7. Limites connues

- Une clé d'idempotence n'est plus visible après l'expiration de son brief (29 jours). Une relance de la même clé au-delà se heurte alors à l'unicité et rend `usage_unavailable`, ce qui est sans effet pratique : le brouillon de l'onglet ne vit pas 29 jours.
- Si le cookie d'accès (12 heures) expire pendant que l'écran 5 suit la préparation, la lecture de l'état rend `not_found`, et un rechargement affiche une 404. La correction (redemander le code sur l'écran 5) relève de l'UX ; c'est une question ouverte.
- Un brief saisi d'une exécution arrêtée reste relançable par « Réessayer » tant qu'il n'a pas expiré.

## 8. Tests

**Unitaires**
- `tests/unit/p0/depuis-formulaire.test.ts`, critère 1 : Rome donne `rome-1.json`, sauf les heures ; chaque refus rend son champ ; le récit avec un e-mail est refusé sur `story`.
- `tests/unit/p0/identifiant-saisi.test.ts`.
- `tests/unit/p0/lancement-saisi.test.ts`, critère 3 :
  - ordre, nature `essai`, variante `A` ;
  - garde fermée ou cookie absent : refus sans connexion ;
  - `existante` : pas de redémarrage ;
  - aucun brief dans le journal ;
  - « Réessayer ».
- `tests/unit/adapters/prototype-creation.test.ts` : correspondance du § 4, sorties validées par `GenerationStatusSchema`.
- `tests/unit/workflows/p0-run-finale.test.ts`, critère 4 :
  - brief lu en base ;
  - identifiant du § 2 ;
  - récit dans la requête `programme` avec `zdr` et `data_collection: "deny"` ;
  - canari « aucune donnée Google dans le prompt » avec un brief saisi ;
  - brief refusé : `brief_invalid` avant tout appel.
- `src/server/actions/creation-essai.test.ts` et `creation-lancement.test.ts` (critère 7, récit facultatif ignoré par `mock`).
- Interface : `LaunchEssai.test.tsx`, `PreparationView.test.tsx`, `tests/unit/server/instrumentation.test.ts`.

**Base** (`tests/db/brief-saisi-prototype.test.ts`, critère 2)
- clés et taille ;
- « jamais les deux », « jamais aucun » ;
- droits et RLS ;
- purge ;
- réservation idempotente ;
- `lireBriefSaisi`, `lireEtatVoyageSaisi`, `lireBriefArrete`.

Les listes de `roles.test.ts`, `schema.test.ts` et `prototype.test.ts` comptent la dixième table. Critère 6 : `tests/unit/p0/lancement.test.ts` est inchangé et passe.
