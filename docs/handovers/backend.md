# Handover back-end — Vadrouille (MVP)

Destinataires : les agents `backend`, `data` et `ia-recherche`, et le Tech Lead qui relit leurs PR.
Émetteurs : Tech Lead (architecture, décisions 0006 à 0011) et Product Owner (règles fonctionnelles, décisions PO-1 à PO-7 de `specs/B0-handover-backend.md`). Date : 2026-10-08. Spécification : `specs/B0-handover-backend.md`.

Ce document est le pendant du handover front-end (`docs/handovers/frontend.md`). Il ne contient ni code, ni migration, ni compte, ni clé : il fixe ce qui est décidé, par qui, et comment chaque bloc sera vérifié. Toutes les tâches qu'il décrit commencent **après G0**. Quand une information manque, l'agent ne l'invente pas : il l'inscrit dans la description de sa PR (le CEO la reporte dans `QUESTIONS.md`).

---

## § 0. À lire en premier

**Mission.** Construire le serveur du MVP : base Postgres multi-organisation, authentification, actions serveur, workflows durables de génération et de révision, paiement en mode test, et l'adaptateur `api` qui remplace l'adaptateur `mock` **sans toucher à l'interface ni aux contrats** sans décision écrite.

**Règles d'or du back-end**

1. **L'agent cherche, l'ancrage vérifie, le moteur planifie** (cadrage § 6.2). Le modèle de sélection choisit parmi des candidats ancrés, par identifiant ; le moteur déterministe (`src/domain`) calcule et valide ; toute écriture passe par le serveur. Aucun composant IA ne dispose d'un outil d'écriture.
2. **Aucune donnée Google** dans un prompt, un journal, une trace ou un jeu d'évaluation ; seul l'identifiant de lieu Google (`placeId`) est stocké durablement (cache de coordonnées de 30 jours au plus : § 5, § 6). Par défaut, toute donnée dérivée d'une réponse Google (verdict, date de contrôle, durée de trajet) est calculée, non stockée, tant que Samuel n'a pas répondu à Q5 et Q29 (décision 0010).
3. **Toute donnée appartient à une organisation** ; l'organisation vient de la session, jamais d'un paramètre envoyé par le client (§ 7, décision 0007).
4. **Données uniquement via `src/contracts`** (Zod), côté serveur comme côté interface ; aucun texte d'interface dans les données (handover front § 9) : codes, énumérations et nombres seulement.
5. **Clés de test uniquement** ; aucune clé ni secret dans le dépôt ; aucune mise en production.
6. **Aucun stockage ni API propres à Vercel (KV, Edge Config) : interdits.** Postgres pour les données (décision 0002).
7. **Toute écriture du programme est un patch sur une version identifiée** (R10) ; l'historique (`trip_versions`) est en ajout seulement.

---

## § 1. Sources de vérité

| Document | Contenu | Autorité |
|---|---|---|
| `QUESTIONS.md` (questions tranchées par Samuel) et `docs/decisions/` dont le décideur est Samuel | Q2 = 29 CHF, Q3 = clés Maps navigateur, Q4 = Better Auth ; décisions 0001 et 0002 | Samuel |
| `docs/produit/cadrage-v5.md` | Produit, architecture, données, conformité, règles R1 à R10, tests de sortie | Samuel (points « tranché » ou « confirmé par Samuel » : D4, D7…) |
| `docs/decisions/` déléguées : 0003 (agent frontend, validée par le Tech Lead en revue de #3), 0004 et 0006 à 0011 (Tech Lead) | Versions, architecture, bibliothèques, outillage, tests | Rôle délégué, dans le cadre du cadrage |
| Rubriques « Décisions » des spécifications (`specs/B0-handover-backend.md`, PO-1 à PO-7) | Détails fonctionnels | Product Owner, dans le cadre du cadrage |
| `docs/handovers/backend.md` (ce document), puis `docs/handovers/frontend.md` pour les données | Mise en œuvre | Applique les sources ci-dessus |
| `src/contracts`, `src/adapters` (F1) | Contrats et adaptateurs existants | Évoluent seulement par une tâche qui cite sa décision (§ 4) |

**Ordre de priorité en cas de conflit** (fondé sur « Qui décide quoi », `docs/CONTEXT.md`) :
1. les décisions écrites de Samuel postérieures au cadrage (`QUESTIONS.md` tranchées, `docs/decisions/` dont le décideur est Samuel) ;
2. le cadrage, y compris ses points tranchés ou confirmés par Samuel ;
3. les décisions déléguées écrites (`docs/decisions/` 0003, 0004 et 0006 à 0011 ; Product Owner dans les spécifications), chacune dans le périmètre de son auteur ;
4. les handovers (back, puis front pour les données).

Une décision déléguée ne contredit jamais le cadrage ni une décision de Samuel et ne tranche aucune question réservée à Samuel ; entre deux décisions de même rang, la plus récente l'emporte si son auteur a autorité sur le sujet. Un conflit qui touche une question réservée à Samuel est listé au § 17, pas tranché.

**Conflits relevés**
| # | Documents et passages | Source retenue |
|---|---|---|
| C1 | Cadrage § 6.4 « Better Auth, Clerk ou WorkOS » ; Q4 | Q4 (Samuel) : Better Auth |
| C2 | Cadrage § 4 « 19, 29 et 39 CHF à tester » ; Q2 | Q2 (Samuel) : 29 CHF, lu dans la configuration, révisable |
| C3 | Cadrage § 6.11 `docs/adr/` ; dépôt `docs/decisions/` | `docs/decisions/` (règles du studio, `docs/CONTEXT.md`) |
| C4 | Handover front § 2 cite `docs/decisions/0001-versions.md` ; décision 0003 | Décision 0003 (le numéro 0001 était pris) |
| C5 | Cadrage § 6.8 rôles « propriétaire, conseiller » ; rôles natifs de Better Auth `owner`, `admin`, `member` | Correspondance de la décision 0008 : `owner` = propriétaire, `member` = conseiller, `admin` non attribué |
| C6 | Parcours (cadrage § 3.1, handover front § 6) : écrans 1 à 3 avant le compte ; PO-3 : organisation créée à la première connexion | Aucune donnée persistée avant le compte : brouillon conservé dans le navigateur, actions sans état avant connexion (§ 4) ; PO-3 inchangée |
| C7 | Cadrage § 6.5 étape 1 « Brief » dans le workflow ; écran 2 avant le compte | Le brief est structuré à l'écran 2 par une action sans état ; l'étape 1 du workflow le relit et le valide (§ 8) |
| C8 | Spécification B0 § 6 « instantané validé par `TripSchema` » ; Q14 (champs calculés non stockés) | Décision 0010 : instantané validé par un schéma dérivé de `TripSchema` par omission, réponse recomposée et validée par `TripSchema` |
| C9 | Cadrage § 6.5 « les autres contenus (horaires, notes, prix) ne sont pas stockés » ; besoin de conserver les durées de trajet dans la version pour l'affichage hors ligne | **Non tranché** (question juridique réservée à Samuel, § 17) : défaut prudent, `Segment.minutes` calculé à la lecture, non stocké ; pas de durée hors ligne |
| C10 | Roadmap, ligne 6 : prérequis de B0 « — » ; spécification B0 : F1 | Écart signalé par la spécification, non corrigé ici (la roadmap n'est pas modifiée par B0) |

---

## § 2. Stack et conventions (Tech Lead)

Décision 0006. Versions vérifiées sur les registres le 2026-10-08 ; la tâche qui installe un outil confirme la version ou l'amende dans la décision.

| Domaine | Choix | Version | Décision |
|---|---|---|---|
| Entrée serveur de l'interface | Actions serveur Next.js (environnement `nodejs`) | Next.js 16.4.0 | 0003, 0006 |
| Routes HTTP | Route handlers seulement pour Better Auth (`/api/auth/[...all]`), le webhook Stripe, le webhook simulé et le suivi de génération | Next.js 16.4.0 | 0006 |
| Accès aux données | Drizzle ORM, pilote `pg` | 0.45.4 ; `pg` 8.23.1 | 0006 |
| Migrations | drizzle-kit, migrations SQL relues dans `db/migrations/` | 0.31.11 | 0006 |
| Base | Postgres 17 ; en local Docker Compose, en CI conteneur de service ; aucun compte externe | `postgres:17.11` | 0006 |
| Isolation | RLS forcée, rôles dédiés, contexte de transaction | — | 0007 |
| Authentification | Better Auth, greffons `emailOTP` et `organization` | 1.7.7 | 0008 |
| Emails (local, CI) | SMTP par `nodemailer` vers Mailpit | 10.0.16 ; `axllent/mailpit:v1.31.4` | 0008 |
| Exécution durable | Workflow SDK (`workflow`), monde local en développement, monde Vercel en staging, monde Postgres en repli | 5.1.0 ; mondes 5.0.2 | 0009 |
| Paiement | Stripe Checkout (mode test, quand Samuel aura ouvert le compte), adaptateur simulé avant | `stripe` 23.0.0, confirmée par B4 | § 9 |
| Validation | Zod (déjà en place) | 4.6.5 | 0003 |
| Tests | Vitest (unitaires et base), Playwright (bout en bout) | 5.0.3 ; 1.56.1 | 0003 |

**Conventions**
- Tables et colonnes en `snake_case` ; contrats en `camelCase` ; conversion dans `src/server`.
- Montants en centimes avec devise (`CHF`) ; dates `date`, instants `timestamptz` UTC ; heures locales de la destination `HH:MM`.
- Variables d'environnement serveur sans préfixe `NEXT_PUBLIC_`, validées une fois par Zod (`src/server/env.ts`) ; `.env.example` sans valeur. Variables prévues : `DATABASE_URL` (rôle `vadrouille_app`), `DATABASE_URL_AUTH` (rôle `vadrouille_auth`), `DATABASE_URL_MIGRATOR`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_TRANSPORT`, `SMTP_URL`, `DATA_ADAPTER`, `AUTH_ADAPTER`, `PAYMENT_ADAPTER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SIMULATED_WEBHOOK_ENABLED`, `SIMULATED_WEBHOOK_SECRET`, `TRUSTED_IP_HEADER`, `RATE_LIMIT_HMAC_SECRET`, `APP_URL`, `GOOGLE_MAPS_SERVER_KEY`, clés des fournisseurs de modèles. Aucune valeur dans le dépôt.
- **Gardes de `src/server/env.ts`** (refus de démarrer, testés par `env: gardes de configuration`) : clé secrète ou publiable Stripe portant le préfixe de **production** (`live`) refusée dans tous les environnements tant que la mise en production n'est pas décidée par Samuel (seul le préfixe de mode test est accepté) ; `BETTER_AUTH_SECRET`, `SIMULATED_WEBHOOK_SECRET` et `RATE_LIMIT_HMAC_SECRET` d'au moins 32 octets aléatoires, distincts par environnement ; `SIMULATED_WEBHOOK_ENABLED=true` refusé en production ; `TRUSTED_IP_HEADER` obligatoire hors local et CI.
- Chaque action serveur vérifie la session, construit le contexte côté serveur, valide entrée et sortie par un contrat, renvoie `ActionResult` (§ 4).
- Toute dépendance nouvelle est notée dans une décision (version, raison) avant la fusion.

---

## § 3. Structure du dépôt (partie back)

Réconciliation du cadrage § 6.11, du handover front § 3 et de l'existant :

```
src/
  app/            pages, actions serveur exposées, route handlers minces (/api/auth, webhooks, suivi)
  features/       écrans (front) ; appellent les actions, jamais la base
  components/     composants (front)
  contracts/      schémas Zod partagés interface ↔ serveur (existant, F1)
  adapters/       mock | api pour les voyages ; auth ; payment (existant, F1, complété)
  mocks/          jeux simulés, importés seulement par src/adapters et les tests (règle F1)
  server/         services applicatifs : session → contexte, autorisations, withOrg, cas d'usage
  tenancy/        organisations et rôles (configuration Better Auth, correspondance des rôles)
  domain/         moteur pur : modèle, planificateur, validateurs R1–R10, patches, budget de trajet
  workflows/      workflows durables : seul endroit où figurent "use workflow" et "use step"
  research/       agent de recherche borné, politique de sources, lecteur de pages protégé
  grounding/      lieux (Places), trajets (Routes), événements ; seule entrée de la clé serveur Google
  ai/             point d'entrée unique des appels IA : prompts versionnés, constructeur de prompts, coûts, traces
db/               schéma Drizzle, migrations SQL, politiques RLS, fonctions, tests d'isolation
evals/            voyages de référence, scripts d'évaluation (aucune donnée Google)
```

`src/server` est le seul ajout par rapport au cadrage : il porte les cas d'usage partagés par les actions serveur, les route handlers et l'adaptateur `api`, pour qu'aucune logique ne soit dupliquée entre eux.

**Règles d'import, vérifiées par ESLint** (`no-restricted-imports`, `no-restricted-syntax`, `no-restricted-globals` par dossier ; chaque règle a un test qui prouve qu'une violation est signalée, comme `tests/unit/lint`).

**Liste blanche** pour les dossiers les plus sensibles (tout import absent de la liste est refusé, ce qui ferme les contournements par un module intermédiaire comme `@/server`) :
| Dossier | Seuls imports autorisés |
|---|---|
| `src/domain` | `@/contracts`, `zod`, fichiers de `src/domain` |
| `src/ai` | `@/contracts`, `@/ai/*`, `zod`, `server-only`, SDK de modèles (`ai`, `@ai-sdk/*`), `@/server/env` (lecture des clés de modèles), `@/server/usage` (écriture de `usage_ledger`, sans accès à `src/grounding`) |
| `src/research` | `@/contracts`, `@/ai`, `@/research/*`, `zod`, `server-only`, `node:dns`, `node:net`, client HTTP du lecteur de pages |

**Liste noire** pour les autres dossiers :
| Dossier | Interdit |
|---|---|
| `src/domain` | en plus de la liste blanche : `process.env`, `fetch` (aucune entrée-sortie) |
| `src/ai`, `src/research` | en plus de la liste blanche, vérifié explicitement : `@/grounding`, `db/` (aucune donnée Google ne peut atteindre un prompt ; la recherche écrit par le serveur) |
| `src/app`, `src/features`, `src/components` | `db/`, `drizzle-orm`, `pg`, `@/workflows`, `@/grounding`, `@/ai`, `@/research` (ils passent par les actions et `src/adapters`) |
| tout sauf `src/ai` | SDK de modèles (`ai`, `@ai-sdk/*`, SDK des fournisseurs) |
| tout sauf `src/workflows` | directives `"use workflow"` et `"use step"`, paquet `workflow` |
| tout sauf `src/grounding` et `src/server/env.ts` | lecture de `GOOGLE_MAPS_SERVER_KEY` |
| tout sauf `src/server/account/delete.ts` et `db/` | la chaîne `purge_organization_data` (décision 0007) |

`import "server-only"` obligatoire dans `src/server`, `db/`, `src/ai`, `src/research`, `src/grounding` et `src/workflows` (règle ESLint dédiée, avec son test).

---

## § 4. Contrats serveur

**Principe d'accès.** L'interface appelle des **actions serveur** ; chaque action construit le contexte (`AdapterContext`) depuis la session, appelle l'adaptateur choisi (`mock` ou `api`), qui appelle un cas d'usage de `src/server`. Les lectures des composants serveur passent par `TripAdapter`. Les schémas de F1 (`TripSchema`, `DaySchema`, `ProposalSchema`, `StopSchema`, `ChecklistItemSchema`, `ChangeSchema`) sont importés, jamais recopiés. Toute action renvoie `ActionResult` : `{ ok: true, data }` ou `{ ok: false, error: ApiError }`.

### Points d'accès par écran (handover front § 6)
| Écran | Route ou action | Méthode | Entrée | Sortie | Rôle requis | Idempotence | Erreurs possibles |
|---|---|---|---|---|---|---|---|
| 1 Créer le voyage | aucun appel : brouillon validé et conservé dans le navigateur jusqu'à la connexion | — | `TripDraft` | — | anonyme | — | `validation_failed` (côté interface) |
| 2 Brief raconté | `structureBrief` | action | `BriefRequest` | `Brief` | anonyme, limité par adresse IP (limiteur maison, § 7) puis plafond global | sans état (rien n'est stocké) | `validation_failed`, `rate_limited`, `cost_cap_reached`, `provider_error` |
| 3 Où loger | `suggestLodging` | action | `TripRequest` (sans logement) | `LodgingSuggestion` | anonyme, limité par adresse IP (limiteur maison, § 7) puis plafond global | sans état | `validation_failed`, `rate_limited`, `cost_cap_reached`, `no_option`, `provider_error` |
| 4 Compte | `/api/auth/[...all]` (envoi et vérification du code) via `AuthAdapter` | route POST | email ; email et code | session (cookie) | anonyme | limité (décision 0008) | `invalid_code`, `code_expired`, `too_many_attempts`, `rate_limited` |
| 5 Propositions prêtes | `createTrip` puis `getGenerationStatus` ; suivi en flux `/api/v1/trips/[id]/generation` | action ; route GET | `TripRequest` | `TripSummary` ; `GenerationStatus` | propriétaire ou conseiller | `requestId` unique par organisation | `active_preview_exists`, `validation_failed`, `cost_cap_reached`, `quota_reached`, `provider_error` |
| 6 Présentation | `TripAdapter.listPreviewSlots` ; `decideCard` ; `undoDecision` | lecture ; action | `DeckDecision` | `PreviewSlot` (liste) ; `DeckDecisionResult` | propriétaire ou conseiller | `requestId` unique par voyage ; annulation idempotente | `not_found`, `validation_failed`, `generation_in_progress` |
| 6b Suite du tri | `TripAdapter.listProposals` ; `getGenerationStatus` | lecture | — | `Proposal` (liste) ; `GenerationStatus` | propriétaire ou conseiller | lecture | `not_found` |
| 7 Confirmer une préférence | `answerPreferencePrompt` | action | `PreferenceAnswer` | `PreferenceSignal` | propriétaire ou conseiller | `requestId` unique par voyage | `not_found`, `validation_failed` |
| 8 Choisir un repas | `decideCard` (variantes « je choisis » et « option suivante ») | action | `DeckDecision` | `DeckDecisionResult` | propriétaire ou conseiller | `requestId` unique par voyage | `not_found`, `no_option` |
| 9 Débloquer | `TripAdapter.getOffer` ; `startCheckout` ; webhook `/api/v1/webhooks/stripe` | lecture ; action ; route POST | `CheckoutRequest` ; événement signé | `Offer` ; `CheckoutRedirect` ; `PaymentEvent` (interne) | propriétaire ou conseiller ; webhook : signature | `requestId` ; identifiant d'événement Stripe unique | `payment_failed`, `already_unlocked`, `provider_error` |
| 10 Programme ajusté | `completeDeck` ; `TripAdapter.getAdjustment` | action ; lecture | — | `GenerationStatus` ; `AdjustmentSummary` | propriétaire ou conseiller | une seule exécution par version de base | `version_conflict`, `generation_in_progress` |
| 11 Séjour | `TripAdapter.getTrip` ; `toggleChecklistItem` | lecture ; action | `ChecklistUpdate` | `Trip` ; `ChecklistItem` | propriétaire ou conseiller | état final (rejouer donne le même résultat) | `not_found` |
| 12 Journée | `TripAdapter.getDay` | lecture | — | `Day` | propriétaire ou conseiller | lecture | `not_found`, `generation_in_progress` |
| 13 Fiche étape | `TripAdapter.getDay` ; `getPlaceDetails` (chargé à la demande, jamais stocké) ; `applyPatch` (verrouiller) ; `reportStop` | lecture ; action | `TripPatch` ; `StopReport` | `Stop` ; `PlaceDetails` ; `PatchResult` | propriétaire ou conseiller | `requestId` | `not_found`, `version_conflict`, `provider_error` |
| 14 Remplacer une étape | `previewReplacement` ; `applyPatch` | action | `ReplacementRequest` ; `TripPatch` | `ReplacementPreview` (avec `Change`) ; `PatchResult` | propriétaire ou conseiller | aperçu sans écriture ; patch : `requestId` et version de base | `version_conflict`, `no_option`, `cost_cap_reached`, `provider_error` |
| Ajouter un lieu | `searchPlaces` ; `applyPatch` | action | texte et jour ; `TripPatch` | `PlaceSearchResult` (liste) ; `PatchResult` | propriétaire ou conseiller | recherche sans écriture | `version_conflict`, `rate_limited`, `provider_error` |
| Déplacer une étape | `TripAdapter.getMoveOptions` ; `applyPatch` | lecture ; action | `TripPatch` | `MoveOptions` ; `PatchResult` | propriétaire ou conseiller | `requestId` et version de base | `version_conflict` |
| Annuler (5 s) | `applyPatch` (opération `revert`, PO-5) | action | `TripPatch` | `PatchResult` | propriétaire ou conseiller | `requestId` | `version_conflict` |
| 15 Pendant le voyage | `TripAdapter.getToday` | lecture | — | `Today` | propriétaire ou conseiller | lecture | `not_found` |
| Mes voyages | `TripAdapter.listTrips` | lecture | — | `TripSummary` (liste) | propriétaire ou conseiller | lecture | — |
| Après le voyage | `TripAdapter.getReview` ; `saveReview` | lecture ; action | `TripReview` | `TripReview` | propriétaire ou conseiller | état final | `not_found`, `validation_failed` |
| États | transverses : chaque erreur est un `ApiError` | — | — | — | — | — | voir la correspondance ci-dessous |
| Vue partagée | `createShareLink` ; `revokeShareLink` ; lecture `/p/[token]` par `TripAdapter.getSharedTrip` | action ; lecture | — | `ShareLink` ; `SharedTrip` | propriétaire ou conseiller ; lecture : lien valide | un lien actif par voyage (PO-7) | `link_expired`, `link_revoked`, `not_found`, `rate_limited` |
| Compte : export et suppression (cadrage § 3.5) | `exportAccount` ; `deleteAccount` (§ 12) | action | — | `AccountExport` | propriétaire (vérifié dans `src/server` et par `purge_organization_data`) | suppression idempotente | `forbidden` |

Un voyage d'une autre organisation renvoie `not_found`, jamais `forbidden` : on ne révèle pas son existence.

### Contrats à créer
| Contrat | Rôle | Tâche |
|---|---|---|
| `ApiError` | Erreur commune : `code` (énumération ci-dessous), `field` (chemin du champ, facultatif), `retryable`, `currentVersion` (conflit) ; aucun message affiché tel quel | B2 |
| `ActionResult` | Résultat de toute action : succès avec données, ou `ApiError` | B2 |
| `TripPatch` | Patch : `requestId`, `baseVersion`, opérations (`replace`, `add`, `move`, `lock`, `unlock`, `revert`) désignant les étapes par identifiant ; `add` porte `placeId` et un nom saisi par la personne (jamais le nom Google, § 5) | B2 |
| `PatchResult` | Nouvelle version, jours touchés, `Change` (liste) | B2 |
| `TripSnapshot` | Instantané d'une version : dérivé de `TripSchema` par omission des champs calculés et chargés à la demande (décision 0010) | B2 |
| `ChecklistMoment` | Moment d'un élément de la liste (PO-2, § 5) | B2 |
| `StopFacts` | Faits structurés d'une étape : durée, coût estimé par personne, secteur (remplace le texte de `Stop.meta`) | B2 |
| `ProposalNeighbours` | Étapes voisines d'une proposition (remplace le texte de `Proposal.context`) | B2 |
| `PreviewSlot` | Case de l'aperçu : proposition ou « aucune option compatible » (PO-6, § 5) | B2 |
| `AuthAdapter` | Adaptateur `auth` : demander un code, le vérifier, lire la session, se déconnecter | B3 |
| `PaymentAdapter` | Adaptateur `payment` : créer un paiement, lire le droit du voyage | B4 |
| `Offer` | Prix (centimes, devise, lu dans la configuration), moyens (`twint`, `card`), éléments inclus (codes) | B4 |
| `CheckoutRequest` | `requestId`, moyen de paiement | B4 |
| `CheckoutRedirect` | Adresse de redirection vers le paiement ; adresses de retour construites depuis `APP_URL`, jamais depuis l'en-tête `host` de la requête | B4 |
| `PaymentEvent` | Événement de paiement interne normalisé (identifiant d'événement, type, voyage, montant, devise) | B4 |
| `TripSummary` | Carte de « Mes voyages » : identifiant, destination, dates, état (aperçu, débloqué, passé), réservations restantes | B6 |
| `TripDraft` | Brouillon de l'écran 1 : destination, dates, logement (oui, quartier, pas encore), autres villes, engagements | B9 |
| `Brief` | Brief structuré : voyageurs, déplacements, rythme, envies (vocabulaire commun des catégories), limites, budget par repas, champs déduits | B9 |
| `BriefRequest` | `TripDraft` et récit libre de l'écran 2 | B9 |
| `TripRequest` | `requestId`, `TripDraft`, `Brief`, choix de logement éventuel | B9 |
| `LodgingSuggestion` | Quartier conseillé (raison maison), jusqu'à 3 logements par `placeId` et nom maison | B9 |
| `GenerationStatus` | Phase, jours prêts, compteurs de l'aperçu (`expected`, `ready`), raison d'arrêt, `retryable` | B9 |
| `DeckDecision` | `requestId`, proposition, décision (`like`, `dislike` avec raison facultative, `choose`, `nextOption`), geste | B10 |
| `DeckDecisionResult` | Question de préférence éventuelle, compteurs | B10 |
| `PreferencePrompt` | Question « On arrête … pour ce voyage ? » ou « On reste plus près de ton hôtel ? » : catégorie (code), raison | B10 |
| `PreferenceAnswer` | `requestId`, question, réponse (`yes`, `no`), raison facultative | B10 |
| `PreferenceSignal` | Signal enregistré : catégorie, signal, origine, statut (`confirmed`, `inferred`, `cancelled`) | B10 |
| `AdjustmentSummary` | Préférences retenues (confirmées ou déduites, annulables), changements (`Change`), réservations à faire | B10 |
| `ChecklistUpdate` | Élément et état coché | B11 |
| `PlaceDetails` | Détail d'un lieu chargé à la demande (contenu Google, jamais stocké, affiché avec attribution) | B11 |
| `StopReport` | Signalement d'erreur sur une étape : motif (code), texte libre facultatif | B11 |
| `ReplacementRequest` | Étape, raison (`notMyStyle`, `tooBusy`, `tooExpensive`, `tooFar`, `other`), souhait libre, version de base | B11 |
| `ReplacementPreview` | Proposition, `Change` (liste), ce qui ne bouge pas, patch prêt à appliquer | B11 |
| `PlaceSearchResult` | Résultat de recherche de lieu : `placeId`, nom chargé à la demande (affiché avec attribution, jamais recopié dans `Stop.name`), moments possibles | B11 |
| `MoveOptions` | Jours et points d'insertion possibles, jours complets désactivés | B11 |
| `AccountExport` | Export des données de la personne (format JSON) | B11 |
| `Today` | Prochaine étape, réservations à rappeler, jour compact | B12 |
| `TripReview` | Avis rapide par étape, adresse découverte, accord « Retenir mes goûts » | B12 |
| `ShareLink` | Adresse du lien privé, expiration | B12 |
| `SharedTrip` | Lecture seule des écrans 11 et 12 | B12 |

### Format d'erreur commun et états de l'interface
`ApiError.code` est une énumération stable ; l'interface choisit le texte (`src/i18n/fr.json`) et l'état à afficher :
| Codes | État du handover front (StatusBanner, écran « États ») |
|---|---|
| (pas de réponse réseau, détecté par l'interface) | `offline` |
| `version_conflict` | `conflict`, avec « rejouer » (le patch est rejoué sur `currentVersion` si l'utilisateur le demande) |
| `no_option` | `noOption` |
| `generation_in_progress` | `generating` |
| `provider_error`, `cost_cap_reached`, `quota_reached`, `internal` | `error` (`retryable` dit si « Réessayer » est proposé) |
| `validation_failed` (avec `field`) | erreur de champ du formulaire |
| `unauthenticated` | redirection vers `/connexion?suite=…` |
| `not_found`, `forbidden`, `link_expired`, `link_revoked` | page « introuvable » ou lien expiré |
| `rate_limited`, `invalid_code`, `code_expired`, `too_many_attempts` | message du formulaire de connexion |
| `active_preview_exists`, `already_unlocked`, `payment_failed` | message de l'écran concerné |

### Concurrence (R10, cadrage § 6.6)
Toute écriture sur un voyage porte `baseVersion`. Le serveur crée la version `baseVersion + 1` seulement si `baseVersion` est la version courante (contrainte d'unicité `(trip_id, version)` et verrou de ligne sur `trips`) ; sinon il renvoie `version_conflict` avec `currentVersion` et `retryable = true`, et l'interface propose de rejouer le patch. Rien n'est remplacé en silence.

### Évolutions de contrats
Appliquées par **B2** (une seule PR, avec `src/mocks/edimbourg.ts`, les composants touchés et leurs tests) :
| # | Changement | Effet sur `src/mocks/edimbourg.ts` | Effet sur les composants |
|---|---|---|---|
| E1 | `Day.weekday`, `Day.title`, `Proposal.weekday` retirés (calculés par l'interface depuis `date`, `Intl.DateTimeFormat("fr-CH")`) | champs supprimés | DayBadge, DayTabs, DeckCard, en-tête de Journée |
| E2 | `Proposal.context` remplacé par `neighbours: ProposalNeighbours` | voisins par identifiant | DeckCard compose « Entre ton déjeuner et … » via `fr.json` |
| E3 | `Stop.meta` remplacé par `facts: StopFacts` | faits structurés | `DayLine.Stop`, Fiche étape (formatage) |
| E4 | `ChecklistItem.when` devient `ChecklistMoment` (PO-2) | « [Déjà réservé] » → `beforeDeparture` avec `done`, « [Une semaine avant] » → `deadline`, « [Avant le départ] » → `beforeDeparture` ; « [Au plus tôt] » : voir § 17 | ChecklistRow produit le libellé |
| E5 | `PreviewSlot` et `TripAdapter.listPreviewSlots` (PO-6) | aperçu Édimbourg avec une case `noOption` pour le test | DeckCard et état `noOption` (F6) |
| E6 | `AdapterContext` : ajout de `userId` et `role` (`owner`, `member`) | — | aucun (construit côté serveur) |
| E7 | `TripAdapter` : ajout de `listPreviewSlots`, `getOffer`, `getAdjustment`, `getMoveOptions`, `getToday`, `listTrips`, `getReview`, `getSharedTrip` ; mutations par les actions du tableau ci-dessus | lectures simulées correspondantes | écrans concernés, au fil des tâches F |
| E8 | Réservé (Q17, Product Owner) : représentation d'un repas « pas encore choisi », affichage de `locked` et de `kind: "event"`, fixée avec la spécification de F5 ; place réservée dans `DayLineItem` ou `Stop`, non tranchée ici | — | — |

---

## § 5. Répartition des champs : stockés, chargés à la demande, calculés (Q14, Tech Lead)

Décision 0010. Catégories :
- **stocké** : contenu maison (nom et résumé issus de notre recherche web, résultat daté de nos contrôles, choix de l'utilisateur, sortie du moteur conservée dans la version) ou identifiant de lieu ;
- **chargé à la demande** : contenu Google obtenu côté serveur à l'affichage, jamais persisté, affiché sur la carte Google ou avec la mention « Données de lieux : Google » ;
- **calculé** : à la lecture, par le moteur (`src/domain`, appelé par le serveur) ou par l'interface (formatage) ; jamais persisté.

**Défaut prudent pour les données dérivées de Google** (décision 0010) : tant que Samuel n'a pas répondu par écrit à Q5 et Q29, verdicts d'ancrage, dates de contrôle et durées de trajet sont *calculés, non stockés*. Ce défaut ne tranche aucune question juridique ; une réponse écrite de Samuel autorisant leur conservation sera appliquée par une tâche dédiée.

Le tableau couvre chaque champ de chaque schéma objet ou union discriminée exporté par `src/contracts` (84 clés, notation du critère § 5 de la spécification B0). Un champ dont le type est un autre schéma exporté a une ligne ; ses sous-champs sont dans les lignes du schéma référencé.

| Champ | Catégorie | Règle |
|---|---|---|
| `Stop.id` | stocké | Identifiant d'étape stable entre versions, attribué par le moteur |
| `Stop.kind` | stocké | Type d'étape |
| `Stop.placeId` | stocké | Identifiant de lieu Google, seul élément Google conservable |
| `Stop.name` | stocké | Nom trouvé par notre recherche web (`candidates.name`, source citée) ou saisi par la personne ; **jamais écrit depuis le `displayName` Google**, y compris pour un lieu ajouté par `searchPlaces` et `applyPatch` (le nom Google y est seulement chargé à la demande, avec attribution) |
| `Stop.start` | stocké | Sortie du moteur |
| `Stop.end` | stocké | Sortie du moteur |
| `Stop.meta` | calculé | Interface, à partir de `StopFacts` (évolution E3) ; aucun texte stocké |
| `Stop.reason` | stocké | Résumé maison de la sélection, commence par ce que la personne a choisi |
| `Stop.source` | stocké | Source web relue (jamais Google) |
| `Stop.verifiedAt` | calculé | Serveur, à la lecture : `created_at` de la version la plus récente dont le rapport de validation couvre le jour de l'étape (donnée maison) ; aucune colonne de date de contrôle (défaut prudent, Q5, Q29) |
| `Stop.exceptions` | stocké | Résultat de nos contrôles conservé dans la version (R4 → `toConfirm`, événement non confirmé → `unconfirmed`, réservation nécessaire → `toReserve`) ; `toConfirm`, conclusion tirée d'horaires Google sous forme de code neutre : provisoire, suit Q5 (§ 17) |
| `Stop.locked` | stocké | Choix de l'utilisateur ou engagement saisi |
| `Segment.mode` | stocké | Sortie du moteur |
| `Segment.minutes` | calculé | Serveur, à la lecture, par Routes API dans `src/grounding`, arrondi à 5 min ; jamais conservé (défaut prudent, suit Q5) ; repli : estimation du moteur depuis le cache de coordonnées, `estimated = true` |
| `Segment.estimated` | stocké | Sortie du moteur (vrai si Routes n'a pas donné de durée en transports publics) |
| `Source.label` | stocké | Nom de la source web |
| `Source.url` | stocké | Adresse de la source web |
| `DayLineItem[terminus].type` | stocké | Discriminant |
| `DayLineItem[terminus].role` | stocké | Départ ou retour au logement |
| `DayLineItem[terminus].time` | stocké | Sortie du moteur |
| `DayLineItem[terminus].label` | stocké | Nom du logement (`stays.label`, saisi ou suggéré par nous) |
| `DayLineItem[stop].type` | stocké | Discriminant |
| `DayLineItem[stop].stop` | stocké | Voir `Stop.*` |
| `DayLineItem[segment].type` | stocké | Discriminant |
| `DayLineItem[segment].segment` | stocké | Voir `Segment.*` |
| `DayLineItem[free].type` | stocké | Discriminant |
| `DayLineItem[free].from` | stocké | Sortie du moteur (R8) |
| `DayLineItem[free].to` | stocké | Sortie du moteur (R8) |
| `Day.index` | stocké | 1 = J1 |
| `Day.date` | stocké | Date ISO |
| `Day.weekday` | calculé | Interface, depuis `date` (évolution E1) |
| `Day.title` | calculé | Interface, depuis `date` (évolution E1) |
| `Day.items` | stocké | Ligne du jour, voir `DayLineItem[*].*` |
| `Day.budgetPerPerson` | calculé | Moteur (R9), somme des coûts estimés de `StopFacts` |
| `Day.events` | stocké | Événements du jour, voir `Stop.*` |
| `Day.generating` | calculé | Serveur, à la lecture, depuis `generation_runs` |
| `Day.travelMinutes` | calculé | Moteur, somme des `Segment.minutes` du jour hors excursion |
| `Day.travelBudgetMinutes` | stocké | Copie de la configuration PO-1 au moment de la planification, réduction comprise |
| `ChecklistItem.id` | stocké | Identifiant |
| `ChecklistItem.label` | stocké | Contenu maison : ce qu'il faut réserver |
| `ChecklistItem.when` | stocké | `ChecklistMoment` (PO-2, évolution E4) |
| `ChecklistItem.done` | stocké | Choix de l'utilisateur |
| `ChecklistItem.bookingUrl` | stocké | Lien de réservation issu de la recherche web (jamais Google) |
| `ChecklistItem.sponsored` | stocké | Lien rémunéré signalé |
| `Trip.id` | stocké | Identifiant |
| `Trip.organizationId` | stocké | `trips.organization_id` ; jamais fourni par le client |
| `Trip.destination` | stocké | Saisie de l'utilisateur |
| `Trip.destinationColor` | calculé | Moteur, attribution stable depuis la destination |
| `Trip.start` | stocké | Saisie de l'utilisateur |
| `Trip.end` | stocké | Saisie de l'utilisateur |
| `Trip.travellers.adults` | stocké | Brief |
| `Trip.travellers.children` | stocké | Brief |
| `Trip.days` | stocké | Instantané de la version courante, voir `Day.*` |
| `Trip.checklist` | stocké | `checklist_items`, voir `ChecklistItem.*` |
| `Trip.unlocked` | calculé | Serveur, depuis `entitlements` (PO-4) |
| `Proposal.id` | stocké | Identifiant |
| `Proposal.kind` | stocké | Activité ou repas |
| `Proposal.day` | stocké | Jour de la proposition |
| `Proposal.weekday` | calculé | Interface, depuis la date du jour (évolution E1) |
| `Proposal.time` | stocké | Sortie du moteur |
| `Proposal.context` | calculé | Interface, depuis `ProposalNeighbours` (évolution E2) |
| `Proposal.stop` | stocké | Voir `Stop.*` |
| `Proposal.option.index` | calculé | Moteur, rang de l'option parmi les candidats du créneau |
| `Proposal.option.total` | calculé | Moteur, nombre d'options du créneau (3 au plus) |
| `Proposal.photoUrl` | chargé à la demande | Provisoire, suit Q6 ; jamais persisté |
| `Proposal.travelFromPrevious` | stocké | Voir `Segment.*` (mode stocké ; durée calculée à la lecture) |
| `Proposal.detour` | stocké | Justification maison du détour ; l'interface y ajoute la durée |
| `Change[replaced].type` | calculé | Moteur, aperçu des effets (jamais persisté ; le patch l'est) |
| `Change[replaced].time` | calculé | Moteur |
| `Change[replaced].before` | calculé | Moteur, depuis `Stop.name` |
| `Change[replaced].after` | calculé | Moteur, depuis `Stop.name` |
| `Change[moved].type` | calculé | Moteur |
| `Change[moved].label` | calculé | Moteur, depuis `Stop.name` |
| `Change[moved].before` | calculé | Moteur |
| `Change[moved].after` | calculé | Moteur |
| `Change[segment].type` | calculé | Moteur |
| `Change[segment].before` | calculé | Moteur |
| `Change[segment].after` | calculé | Moteur |
| `Change[segment].estimated` | calculé | Moteur |
| `Change[budget].type` | calculé | Moteur |
| `Change[budget].deltaPerPerson` | calculé | Moteur (R9) |
| `Change[unchanged].type` | calculé | Moteur |
| `Change[unchanged].label` | calculé | Moteur, depuis `Stop.name` |
| `Change[unchanged].time` | calculé | Moteur |

**Durées de trajet (Routes API).** Conservé dans l'instantané : `mode` et `estimated` seulement. Jamais conservé : `Segment.minutes` (recalculé à la lecture, coût compté dans `usage_ledger` et soumis aux plafonds), la matrice brute, les distances, les polylignes ; jamais dans l'état d'un workflow (décision 0011). Hors ligne, l'interface n'affiche pas de durée qu'elle n'a pas reçue. Si Samuel autorise par écrit la conservation (Q5), une tâche dédiée ajoute la durée à l'instantané.

**Coordonnées.** Jamais dans un contrat, une version, un journal ou l'état d'un workflow. Cache serveur `place_coordinates` (§ 6) : 30 jours au plus après leur obtention, `expires_at` contrôlé par la base, purge quotidienne. La carte du navigateur obtient les positions par la bibliothèque Google à partir de `placeId`.

**Forme de PO-2 (`ChecklistMoment`)** : union discriminée par `type` : `{ type: "deadline", date }` (date ISO), `{ type: "beforeDeparture" }`, `{ type: "tripDay", day }` (1 = J1 ; l'interface affiche « à l'arrivée » pour le J1). Aucun libellé dans les données. Critère de B2 : `ChecklistItemSchema` refuse un texte libre dans `when` et accepte les trois formes.

**Forme de PO-6 (`PreviewSlot`)** : union discriminée par `type` : `{ type: "proposal", proposal }` (une `Proposal`) ou `{ type: "noOption", day, time, kind }` (`kind` : `activity` ou `meal`). L'aperçu est une liste ordonnée de 8 cases au plus, lue par `TripAdapter.listPreviewSlots` ; `GenerationStatus` porte `expected` et `ready`. Une case `noOption` n'a ni lieu ni texte ; elle n'est jamais remplie par un lieu non ancré (R1). Critères de B2 et B9 : un aperçu de moins de 8 propositions ancrées renvoie des cases `noOption` pour le reste ; aucune case ne contient de texte d'interface.

---

## § 6. Schéma Postgres multi-organisation (Tech Lead)

Décisions 0006 et 0007. Région UE exigée ; fournisseur et compte : Samuel (§ 14, Q24).

**Règles communes**
- Chaque table métier a `organization_id uuid NOT NULL` (clé étrangère vers `organizations`), un index qui commence par `organization_id`, la RLS activée et forcée, et la politique type de la décision 0007 (`organization_id = app_current_org()` en lecture et en écriture) pour le rôle `vadrouille_app`. Les clés étrangères vers `trips` sont composites `(organization_id, trip_id)` : une ligne ne peut pas pointer vers le voyage d'une autre organisation.
- Aucun rôle n'a `BYPASSRLS` : le propriétaire des tables n'a aucune politique (il ne voit aucune ligne, RLS forcée) ; les fonctions `SECURITY DEFINER` appartiennent à des rôles dédiés `vadrouille_fn_*` sans membre, avec des politiques étroites, `search_path` fixé, noms qualifiés, `EXECUTE` révoqué à `PUBLIC` et accordé nommément (décision 0007).
- Organisation transmise par `set_config('app.organization_id', …, true)` dans la transaction. Les permissions serveur (rôle `owner` ou `member`) sont vérifiées dans `src/server` ; la RLS double la vérification d'**organisation** (cadrage § 9), pas celle du rôle : au MVP, propriétaire et conseiller ont les mêmes droits sur les voyages ; seules l'export et la suppression du compte sont réservés au propriétaire, contrôle repris en base par `purge_organization_data`.
- **Suppressions** : `vadrouille_app` n'a `DELETE` que sur `checklist_items`, `preferences` et `stays` ; les coordonnées expirées sont purgées par `purge_expired_coordinates`, les données d'un compte par `purge_organization_data` ; aucune autre suppression (décision 0007, tableau des droits).
- Toute migration ajoute sa politique et son test d'isolation (rôle `data`).

**Tables**
| Table | Colonnes principales | Clés et index | `organization_id` | RLS | Données personnelles |
|---|---|---|---|---|---|
| `users` (Better Auth) | `id`, `email`, `email_verified`, `created_at`, `updated_at` | `email` unique | exception : une personne peut appartenir à plusieurs organisations | rôle `vadrouille_auth` ; `vadrouille_app` : `SELECT` de sa seule ligne (`id = app_current_user()`, réglage `app.user_id`, décision 0007) | oui (email) |
| `sessions` (Better Auth) | `id`, `user_id`, `token`, `expires_at`, `active_organization_id` (IP et agent utilisateur vidés avant écriture, décision 0008) | `token` unique ; `user_id` | exception : précède le choix d'organisation | rôle `vadrouille_auth` seulement | oui (pseudonyme) |
| `accounts` (Better Auth, si la bibliothèque la crée pour la connexion par code) | `id`, `user_id`, `provider_id` | `user_id` | exception : authentification | rôle `vadrouille_auth` seulement | oui (pseudonyme) |
| `verifications` (Better Auth) | `id`, `identifier`, `value` (code haché), `expires_at` | `identifier` | exception : avant toute session | rôle `vadrouille_auth` seulement | oui (email dans `identifier`) |
| `rate_limits` (Better Auth) | `key`, `count`, `last_request` | `key` unique | exception : limitation avant session | rôle `vadrouille_auth` seulement | oui (adresse IP dans `key` ; email seulement sous forme HMAC ; conservation courte) |
| `action_rate_limits` (limiteur maison) | `key` (HMAC de l'adresse IP et de l'action), `window_start`, `count` | `key` unique ; `window_start` | exception : actions anonymes (écrans 2 et 3, `/p/[token]`) | forcée ; rôle `vadrouille_limiter` seulement (décision 0007) | oui (pseudonyme, conservation courte) |
| `organizations` (Better Auth) | `id`, `name`, `slug`, `kind` (`personal`, `agency`), `created_at` | `slug` unique | exception : `id` est l'organisation elle-même | `vadrouille_app` : `id = app_current_org()` ; écriture par `vadrouille_auth` | non |
| `memberships` (Better Auth) | `id`, `organization_id`, `user_id`, `role` (`owner`, `member`), `created_at` | unique `(organization_id, user_id)` | oui | `vadrouille_app` : organisation courante ; écriture par `vadrouille_auth` | oui (pseudonyme) |
| `invitations` (Better Auth, hors MVP) | `id`, `organization_id`, `email`, `role`, `status`, `expires_at` | `organization_id` | oui | organisation courante | oui (email) |
| `trips` | `id`, `organization_id`, `created_by`, `request_id`, `destination`, `start_date`, `end_date`, `travellers_adults`, `travellers_children`, `current_version`, `status` (`preview`, `unlocked`, `archived`), `created_at` | unique `(organization_id, request_id)` ; unique `(organization_id, id)` (cible des clés composites) ; `(organization_id, start_date)` | oui | type ; `vadrouille_share` par la vue `shared_trip` (destination, dates, voyageurs, version courante) | oui (projet de voyage d'une personne) |
| `briefs` | `id`, `organization_id`, `trip_id`, `version`, `story` (récit libre), `pace`, `mobility`, `wishes` (codes de catégories), `limits`, `meal_budget`, `inferred_fields`, `created_at` | unique `(trip_id, version)` ; ajout seulement | oui | type | oui (récit libre) |
| `stays` | `id`, `organization_id`, `trip_id`, `kind` (`lodging`, `neighbourhood`), `place_id`, `label` (nom saisi ou maison), `from_date`, `to_date`, `arrival_time`, `departure_time`, `luggage` | `(trip_id, from_date)` | oui | type ; `vadrouille_share` par la vue `shared_stays`, colonnes selon la réponse du Product Owner (§ 17) | oui (lieu de séjour) |
| `trip_versions` | `id`, `organization_id`, `trip_id`, `version`, `parent_version`, `request_id`, `snapshot` (JSONB validé par `TripSnapshotSchema`, dérivé de `TripSchema`), `patch` (JSONB `TripPatch`, nul pour la version 1), `validation_report` (JSONB), `author_kind` (`user`, `engine`, `workflow`), `author_user_id`, `created_at` | unique `(trip_id, version)` ; unique `(trip_id, request_id)` | oui | type ; `INSERT` et `SELECT` seulement (droits et déclencheur ; seule exception : `DELETE` par la fonction de purge, reconnue par `current_user = 'vadrouille_fn_purge'`, décision 0007) ; `vadrouille_share` par la vue `shared_trip_version` (instantané seulement) | indirecte (via le voyage) |
| `generation_runs` | `id`, `organization_id`, `trip_id`, `workflow_run_id`, `kind` (`preview`, `full`, `batch`, `mini`), `phase`, `stop_reason`, `last_version`, `started_at`, `updated_at`, `finished_at` | `(trip_id, started_at)` | oui | type | non |
| `research_runs` | `id`, `organization_id`, `trip_id`, `generation_run_id`, `queries` (requêtes web, sans nom de personne), `pages_read`, `duration_ms`, `cost_estimate_micros`, `errors` (codes), `started_at`, `finished_at` | `(trip_id)` | oui | type | non |
| `candidates` | `id`, `organization_id`, `trip_id`, `research_run_id`, `kind` (`place`, `event`), `name` (nom trouvé sur le web), `summary` (résumé maison), `category` (vocabulaire commun), `facts` (JSONB `StopFacts`), `sources` (JSONB : libellé, adresse, date), `confidence`, `place_id` (écrit pour un candidat résolu en un seul lieu). **Pas de `grounding_verdict` ni de `grounding_checked_at`** : verdicts non stockés en base par défaut (décisions 0010 et 0011) ; colonnes ajoutées seulement après une réponse écrite de Samuel (Q5, Q29) | `(trip_id, place_id)` | oui | type | non |
| `event_occurrences` | `id`, `organization_id`, `trip_id`, `candidate_id`, `place_id`, `starts_at`, `ends_at`, `timezone`, `category`, `price_note` (texte maison issu de la page de l'événement), `source_url`, `source_checked_at`, `status` (`confirmed`, `unconfirmed`) | `(trip_id, starts_at)` | oui | type | non |
| `place_coordinates` | `id`, `organization_id`, `place_id`, `lat`, `lng`, `fetched_at`, `expires_at` (`CHECK (expires_at <= fetched_at + interval '30 days')`) | unique `(organization_id, place_id)` ; `expires_at` | oui | type (sans `DELETE`) ; purge quotidienne des lignes expirées par `purge_expired_coordinates` (décision 0007) | non |
| `feedback` | `id`, `organization_id`, `trip_id`, `target_stop_id`, `place_id`, `reason` (code), `text`, `scope` (`stop`, `trip`), `created_by`, `created_at` | `(trip_id)` | oui | type | oui (texte libre) |
| `preference_signals` | `id`, `organization_id`, `trip_id`, `request_id`, `candidate_id`, `place_id`, `category`, `signal` (`like`, `dislike`, `answerYes`, `answerNo`, `travelReduction`), `reason`, `origin` (`gesture`, `question`, `brief`), `status` (`confirmed`, `inferred`, `cancelled`), `created_at` | unique `(trip_id, request_id)` ; `(trip_id, category)` | oui | type | oui (goûts) |
| `preferences` | `id`, `organization_id`, `user_id`, `category`, `value`, `consented_at`, `created_at` | `(organization_id, user_id)` | oui | type | oui (goûts, avec accord) |
| `checklist_items` | `id`, `organization_id`, `trip_id`, `stop_id`, `kind` (`reservation`, `ticket`, `other`), `label`, `moment` (JSONB `ChecklistMoment`), `booking_url`, `sponsored`, `done`, `done_at` | `(trip_id)` | oui | type, avec `DELETE` ; `vadrouille_share` par la vue `shared_checklist` | indirecte (via le voyage) |
| `share_links` | `id`, `organization_id`, `trip_id`, `token_hash` (SHA-256 d'un jeton aléatoire de 32 octets), `created_by`, `created_at`, `expires_at` (fin du voyage + 30 jours, PO-7), `revoked_at` | `token_hash` unique ; unique `(trip_id) WHERE revoked_at IS NULL` (un lien actif par voyage) | oui | type ; lecture par `resolve_share_link`, propriété de `vadrouille_fn_share` avec une politique de lecture qui ne vise que ce rôle (décision 0007) | indirecte |
| `usage_ledger` | `id`, `organization_id`, `trip_id`, `generation_run_id`, `step`, `provider`, `sku`, `units`, `cost_estimate_micros`, `created_at` | `(organization_id, created_at)` ; `(trip_id)` | oui | type ; ajout seulement | non |
| `checkouts` | `id`, `organization_id`, `trip_id`, `request_id`, `stripe_checkout_session_id`, `amount_cents`, `currency`, `method`, `status`, `created_by`, `created_at` | unique `stripe_checkout_session_id` ; unique `(organization_id, request_id)` ; clé composite `(organization_id, trip_id)` | oui | type ; organisation retrouvée par `checkout_organization` (propriété de `vadrouille_fn_checkout`) pour le webhook | indirecte |
| `billing` | `id`, `organization_id`, `stripe_event_id`, `type`, `checkout_id`, `amount_cents`, `currency`, `outcome` (`granted`, `alreadyGranted`, `ignored`, `rejected` avec code), `received_at` (la ligne et le droit sont écrits dans la même transaction, § 9) | **unique `stripe_event_id`** (idempotence) | oui | type ; ajout seulement ; écriture par `vadrouille_webhook` seulement | indirecte |
| `entitlements` | `id`, `organization_id`, `trip_id`, `kind` (`preview`, `tripUnlocked`), `billing_id`, `granted_at` | **unique `(organization_id, trip_id, kind)`** (PO-4) ; clé composite `(organization_id, trip_id)` | oui | type ; écriture par `vadrouille_webhook` seulement ; `vadrouille_share` : aucun accès (inutile à la vue partagée) | non |
| `place_memory` (**bêta**, cadrage § 6.7, non créée au MVP) | `place_id`, `summary`, `tags`, `sources`, `last_confirmed_at`, `keep_rate`, `reject_rate`, `expires_at` (60 à 90 jours) | `place_id` unique | exception justifiée : mémoire mutualisée, agrégée et anonyme ; accès réservé aux étapes de workflow | à concevoir en bêta | non |

Tables de l'exécution durable : si le monde Postgres est retenu (décision 0009), ses tables vivent dans un schéma dédié `workflow`, gérées par la bibliothèque, et ne contiennent que des identifiants (§ 8) ; exception à `organization_id` justifiée, accès réservé au rôle des workflows.

**Colonnes interdites.** Aucune colonne, dans aucune table, pour un contenu Google : note (`rating`, `user_rating_count`), avis (`reviews`), horaires d'ouverture (`opening_hours`, `regular_opening_hours`), statut brut (`business_status`), photo (`photos`, `photo_url`), téléphone (`phone`), adresse (`address`, `formatted_address`), niveau de prix (`price_level`), nom Google (`display_name`), ni équivalent. Coordonnées seulement dans `place_coordinates`, 30 jours au plus, avec `expires_at`. Test `schéma: aucune colonne de contenu Google` (liste de motifs sur `information_schema.columns`). **Colonnes dérivées** : aucune colonne de verdict, de date de contrôle d'un lieu ni de durée de trajet (`grounding_verdict`, `grounding_checked_at`, `verified_at`, `travel_minutes` ou équivalent) tant que Q5 et Q29 sont ouvertes ; test `schéma: aucune colonne dérivée de Google tant que Q5 et Q29 sont ouvertes`.

---

## § 7. Authentification et organisations (Better Auth, Q4 tranchée par Samuel)

Décision 0008.

- **Connexion par code** : greffon `emailOTP` ; code à 6 chiffres, valable 10 minutes, 3 essais puis invalidé, stocké haché ; compte créé à la première vérification réussie ; aucun mot de passe (cadrage D8, écran 4).
- **Limitation des envois et des vérifications** (décision 0008) : limiteur de Better Auth, stockage en base (`rate_limits`) ; 3 envois par 10 minutes et par adresse IP, 10 vérifications par 10 minutes et par adresse IP ; par adresse email **normalisée** (minuscules, NFC, alias `+` retiré, clé HMAC), 5 envois et 10 vérifications par heure. `disableIpTracking` n'est pas activé (dans Better Auth 1.7.7, il désactive le limiteur) ; l'IP et l'agent utilisateur sont vidés de la session par un crochet. Même réponse pour une adresse connue ou inconnue.
- **Adresse IP de confiance par environnement** (`TRUSTED_IP_HEADER`, décision 0008) : en staging et en production sur Vercel, seul `x-vercel-forwarded-for` est lu (à confirmer par B3 sur la documentation Vercel et sur staging) ; `X-Forwarded-For`, `X-Real-IP`, `Forwarded` et les autres sont ignorés ; en local et en CI, seuls les tests posent l'en-tête de confiance. Sans en-tête de confiance, la requête tombe dans un compartiment commun strict (échec fermé). Tests `auth: limitation des envois` (en-têtes forgés et changeants, variantes de casse et d'alias), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`.
- **Limiteur des actions sans compte** (`structureBrief`, `suggestLodging`, lecture `/p/[token]`) : hors Better Auth, table `action_rate_limits` en Postgres (§ 6), accès par le seul rôle `vadrouille_limiter` (décision 0007), même adresse IP de confiance. Limite par adresse IP **bien inférieure au plafond global** : valeurs de départ 5 par heure et 20 par jour par action et par adresse, et le plafond global quotidien vaut au moins 50 fois la limite quotidienne par adresse, pour qu'une seule adresse ne puisse pas l'épuiser ; le compartiment commun « sans IP de confiance » a sa propre limite stricte. Le plafond global, qui engage de l'argent, est à valider par Samuel (§ 17). Test `limitation: une adresse seule n'épuise pas le plafond global des actions sans compte` (B9).
- **Organisations et rôles** : greffon `organization` ; `owner` = `propriétaire`, `member` = `conseiller` (cadrage § 6.8) ; `admin` non attribué au MVP ; création d'organisation par l'utilisateur désactivée au MVP.
- **Organisation personnelle** (PO-3) : créée avec l'adhésion `owner` dans la transaction de création du compte ; posée comme organisation active de chaque session ; invisible dans l'interface au MVP.
- **Session → `AdapterContext` → RLS** : `getRequestContext()` lit la session, vérifie l'adhésion à l'organisation active et renvoie `{ organizationId, userId, role }` (évolution E6) ; ce contexte est passé à l'adaptateur et à `withOrg`, qui pose `app.organization_id` et `app.user_id` pour la transaction (décision 0007). Aucune action n'accepte une organisation venue du client ; un identifiant de voyage reçu du client est toujours filtré par la RLS.
- **Adaptateur `auth`** (handover front § 17, point 3) : contrat `AuthAdapter` (demander un code, vérifier, lire la session, se déconnecter) ; adaptateur simulé (F8) et adaptateur Better Auth passent la même suite de tests.
- **Emails** : en local et en CI, SMTP vers Mailpit, sans fournisseur externe ; textes des emails dans `src/i18n/fr.json` ; le fournisseur réel relève de Samuel (Q25).
- **Accès administrateur** : aucune interface d'administration au MVP (jugement du Tech Lead) ; quand elle existera, double authentification obligatoire (greffons `admin` et `twoFactor`, cadrage § 9).

---

## § 8. Workflows durables (Tech Lead pour l'exécution, Product Owner pour les règles)

Décisions 0009 et 0011. Colonnes de chaque tableau : type (déterministe, IA, appel externe) ; entrée → sortie (contrats stricts de l'étape, identifiants seulement) ; données Google dans l'étape (« oui » interdit pour une étape IA ; une étape « oui » recharge la donnée à l'intérieur et ne la renvoie jamais) ; plafond vérifié avant l'appel (`usage_ledger`) ; relances bornées ; idempotence ; état publié dans `GenerationStatus`.

### 1. Recherche et génération de l'aperçu (`generatePreview`)
Cadrage § 6.5, étapes 1 à 9 ; 8 propositions ; cible de moins de 60 s ; budget d'appels propre à l'aperçu ; un aperçu actif à la fois par compte (`active_preview_exists`).
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| 1 Brief | déterministe | `tripId`, version du brief → identifiant du brief validé | non | — | 2 | lecture | `queued` |
| 2 Plan de recherche | IA (petit modèle) | identifiants → `researchRunId` | non | oui (budget de l'aperçu) | 2 | `(runId, plan)` | `researching` |
| 3 Recherche | IA et appel externe (recherche web, lecture de pages) | `researchRunId`, zone, catégorie → nombre de candidats | non | oui, avant chaque appel ; agent borné (étapes et appels plafonnés) | 2 par sous-tâche | `(runId, zone, catégorie)` | `researching` |
| 4 Ancrage | appel externe (workflow 2) | `researchRunId` → `{ candidateId, placeId, verdict, checkedAt }` par candidat | oui (dans l'étape) | oui (Places) | voir workflow 2 | voir workflow 2 | `grounding` |
| 5 à 8 Squelette, sélection, planification, validation | voir workflow 3 | identifiants → identifiant de version | voir workflow 3 | oui | voir workflow 3 | voir workflow 3 | `selecting`, `planning`, `validating` |
| 9 Enregistrement | déterministe | identifiant de version → `versionId`, compteurs `expected` et `ready` | non | — | 3 | unique `(trip_id, version)` | `ready` (avec cases `noOption` si moins de 8 propositions ancrées, PO-6) |

### 2. Ancrage (`groundCandidates`)
Résolution « IDs only », puis vérification Place Details, côté serveur, avec la clé serveur Places/Routes (prévue avec P0, Q3). Candidat non résolu ou fermé définitivement écarté.
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| a Résolution | appel externe (Text Search, masque de champs `places.id`, biais sur la zone du séjour) | `candidateId` → `{ candidateId, placeId }` ou verdict `discarded` | oui (dans l'étape ; seul `placeId` sort) | oui (quota) | 3, avec attente croissante | `(runId, candidateId, resolve)` | `grounding` |
| b Vérification | appel externe (Place Details, masque de champs minimal : identifiant, statut, position) | `{ candidateId, placeId }` → `{ candidateId, placeId, verdict, checkedAt }` ; position écrite dans `place_coordinates` à l'intérieur de l'étape | oui (dans l'étape ; ni statut brut ni position en sortie) | oui (Places) | 3 | `(runId, candidateId, verify)` | `grounding` |
| c Événements | appel externe (relecture de la page source par le lecteur protégé, § 12) | `candidateId` → `{ candidateId, status }` (`confirmed` ou `unconfirmed`) | non | oui (lecture de pages) | 2 | `(runId, candidateId, event)` | `grounding` |

**Verdicts** (décision 0011) : `compatible` (résolu en un seul lieu dans la zone, non fermé définitivement ; les horaires sont jugés par le moteur, R4), `discarded` (non résolu, ambigu ou hors zone), `closedPermanently` (résolu, mais fermé définitivement selon notre contrôle). Exclusifs ; un verdict par candidat. **Non stockés en base** par défaut (décisions 0010 et 0011) : ils ne vivent que dans l'état des workflows, à titre provisoire (Q29). Un candidat de la réserve réutilisé plus tard (recalcul par lot, révision unitaire) est revérifié dans l'étape qui l'utilise.

### 3. Planification et validation (`planDays`)
Moteur `src/domain`, règles R1 à R10 (cadrage § 8) ; au plus un appel de réparation. Utilisé par les workflows 1, 4 et 5.
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| a Squelette | déterministe | identifiants, jours visés → identifiant du squelette (logements, fenêtres, créneaux, secteurs, budget de trajet PO-1) | non | — | 2 | `(runId, skeleton, jours)` | `planning` |
| b Sélection | IA (modèle intermédiaire) | identifiants internes des candidats `compatible` (reçus de l'étape d'ancrage, jamais lus en base) et résumés de notre recherche web (lus dans l'étape) → identifiants choisis par créneau, justification maison | non | oui | 1 | `(runId, select, jours)` | `selecting` |
| c Planification | déterministe et appel externe (matrice Routes API) | identifiants choisis → identifiant du brouillon de version | oui (dans l'étape ; aucune durée en sortie) | oui (Routes) | 3 | `(runId, plan, jours)` | `planning` |
| d Validation | déterministe (horaires rechargés par Place Details à l'intérieur de l'étape, R4) | identifiant du brouillon → codes neutres (`slotUnavailable`, `tooFar`, `overBudget`, `conflict`) et identifiants d'étapes | oui (dans l'étape ; codes neutres seulement en sortie, sans horaire ni jour d'ouverture ; dérivés, provisoires, suit Q5) | oui (Places) | 2 | `(runId, validate, brouillon)` | `validating` |
| e Réparation (au plus une) | IA | codes neutres de l'étape d et identifiants internes (aucun code ne révèle un horaire ou un statut Google ; décision 0011) → identifiants de remplacement | non | oui | 0 (un seul appel) | `(runId, repair)` | `validating` |
| f Enregistrement | déterministe | brouillon validé → `versionId` ; violations restantes dans `validation_report` | non | — | 3 | unique `(trip_id, request_id)` | `ready` |

**Arrêt sur plafond ou quota.** Un quota atteint arrête le workflow et conserve le dernier programme valide (test de sortie du cadrage § 9). **Extension signalée** de ce test : le même comportement vaut pour un plafond de coût atteint (plafonds vérifiés avant chaque appel, cadrage § 6.9 et § 9 « Plafonds applicatifs »), et aucune version partielle n'est publiée. L'état publié devient `stopped` avec `stopReason` (`costCap` ou `quota`) et `retryable`. Test nommé `workflows: plafond ou quota atteint conserve le dernier programme valide` (§ 10, tâche B9).

### 4. Génération du voyage complet (`generateFullTrip`)
Après déblocage (droit `tripUnlocked` accordé par le webhook, § 9), en tâche de fond ; cible de moins de 3 minutes.
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| 1 Démarrage | déterministe | `entitlementId` → `runId` | non | — | 3 | un seul workflow par droit | `queued` |
| 2 Plan de recherche des jours restants | IA (petit modèle) | identifiants → `researchRunId` (réserve de l'aperçu réutilisée d'abord) | non | oui (budget du voyage complet) | 2 | `(runId, plan)` | `researching` |
| 3a Recherche | IA et appel externe (comme l'étape 3 du workflow 1) | `researchRunId`, zone, catégorie → nombre de candidats | non | oui, avant chaque appel | 2 par sous-tâche | `(runId, zone, catégorie)` | `researching` |
| 3b Ancrage | appel externe (workflow 2) | `researchRunId` → verdicts | oui (dans l'étape ; identifiants et verdicts seulement en sortie) | oui (Places) | voir workflow 2 | voir workflow 2 | `grounding` |
| 4 Planification par jour | workflow 3, jour par jour | identifiants → `versionId` par jour terminé | comme workflow 3 | oui | comme workflow 3 | comme workflow 3 | `planning` ; `Day.generating` passe à faux jour par jour |
| 5 Fin | déterministe | identifiants → compteurs | non | — | 3 | lecture | `ready` |

Affichage progressif : une version est publiée par jour terminé ; chacune est entièrement validée (R1 à R10 sur tous les jours publiés) ; les jours non générés n'ont aucune étape et restent `generating`. « Aucune version partielle » signifie : aucune version contenant un jour à moitié planifié ou qui échoue à la validation.

### 5. Recalcul par lot et révision unitaire
Cadrage § 6.6. Recalcul par lot à la fin du tri ou au déblocage, en moins de 60 s ; révision unitaire en moins de 5 s depuis la réserve, en moins de 45 s avec mini-recherche.

*Recalcul par lot* (`batchRecompute`, workflow durable) :
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| 1 Jours touchés | déterministe | `tripId`, version de base → jours touchés | non | — | 2 | `(runId, scope)` | `planning` |
| 2 Filtrage de la réserve | déterministe et appel externe (revérification Place Details des candidats retenus, verdict recalculé dans l'étape) | identifiants → candidats restants (préférences confirmées ou affichées seulement) | oui (dans l'étape ; identifiants seulement en sortie) | — | 2 | `(runId, filter)` | `planning` |
| 3a Mini-recherche si réserve épuisée | IA et appel externe (étape 3 du workflow 1, limitée aux créneaux touchés) | identifiants → nombre de candidats | non | oui | 2 | `(runId, mini, créneau)` | `researching` |
| 3b Ancrage des nouveaux candidats | appel externe (workflow 2) | identifiants → verdicts | oui (dans l'étape ; identifiants et verdicts seulement en sortie) | oui (Places) | voir workflow 2 | voir workflow 2 | `grounding` |
| 4 Sélection, planification, validation | workflow 3 | identifiants → `versionId` | comme workflow 3 | oui | comme workflow 3 | version de base (R10) | `validating` |
| 5 Résumé | déterministe | `versionId` → identifiant d'`AdjustmentSummary` | non | — | 2 | lecture | `ready` |

*Révision unitaire* (exécutée dans l'action serveur, sans workflow, pour tenir les 5 s ; la mini-recherche, elle, passe par un workflow) :
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| 1 Candidats de la réserve | déterministe (créneau, trajet acceptable, budget, lieux refusés exclus) ; la fermeture est revérifiée à l'étape 4 | `ReplacementRequest` → identifiants candidats | non | — | 0 | lecture | — |
| 2 Classement | déterministe pour « trop cher », « trop chargé », « trop loin » ; IA pour « pas mon style » et le souhait libre | identifiants et résumés maison → identifiant retenu | non | oui (si IA) | 1 | sans écriture | — |
| 3a Mini-recherche si réserve épuisée | IA et appel externe, dans un workflow (étape 3 du workflow 1, limitée au créneau) | identifiants → nombre de candidats | non | oui | 2 | `(runId, mini)` | `researching` |
| 3b Ancrage des nouveaux candidats | appel externe (workflow 2) | identifiants → verdicts | oui (dans l'étape ; identifiants et verdicts seulement en sortie) | oui (Places) | voir workflow 2 | voir workflow 2 | `grounding` |
| 4 Replanification et validation du jour | déterministe (Routes et Place Details dans l'étape) | brouillon → `ReplacementPreview` | oui (dans l'étape ; durées seulement dans l'aperçu calculé) | oui | 1 | sans écriture | — |
| 5 Application | déterministe | `TripPatch` → `PatchResult` | non | — | 0 | `requestId`, version de base (R10) | — |

### 6. Paiement en mode test (`handlePaymentEvent`)
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| 1 Vérification de la signature | déterministe (route handler) | corps brut et signature → événement vérifié ou refus 400 | non | — | 0 (Stripe relance) | — | — |
| 2 Contrôles, enregistrement et droit, **dans une seule transaction** (`vadrouille_webhook`) | déterministe | événement → ligne `billing` (avec `outcome`) et, si les contrôles passent, ligne `entitlements` | non | — | Stripe relance (rien n'est écrit si la transaction échoue) | unique `stripe_event_id` ; unique `(organization_id, trip_id, kind)` (PO-4) ; un doublon ne réécrit rien et passe à l'étape 3 | — |
| 3 Reprise et suite | appel interne | `entitlementId` → démarrage du workflow 4 | non | — | 3, puis réconciliation | un seul workflow par droit ; exécuté aussi pour un événement déjà enregistré (reprise idempotente) | `queued` |

### Exécution durable et portabilité
Vercel Workflows (cadrage D7) par le Workflow SDK, isolé derrière `src/workflows/index.ts` ; monde local en développement et en CI, monde Vercel en staging, monde Postgres (schéma `workflow` de notre base UE) en repli. État des étapes : dans le monde choisi. Remplacement hors Vercel : changement de monde par configuration, sans toucher aux étapes (décision 0002). Région de l'état du monde Vercel : à vérifier par B9 ; si elle est hors UE, la question remonte à Samuel (Q28). Le prototype P0 (ia-recherche) alimente ce chapitre sans être recopié.

### État persistant des workflows
Les entrées et sorties d'étapes sont sérialisées et conservées par le moteur d'exécution durable : elles sont traitées comme un stockage durable. Règle : une étape ne reçoit et ne retransmet, en fait de lieu, que `placeId`, un verdict d'ancrage (`compatible`, `écarté`, `fermé définitivement`, identifiants `compatible`, `discarded`, `closedPermanently`) et la date de notre contrôle. Le verdict ne recopie ni horaire, ni jour d'ouverture, ni statut brut. L'état sérialisé ne contient jamais de donnée Google : horaires, prix, statut brut, note, adresse, photo, téléphone, ni coordonnées, **sans exception** (le cache de coordonnées vit en base, jamais dans l'état d'un workflow), ni durée, distance ou matrice de Routes API (décision 0011). Il ne contient pas non plus le brief ni aucun texte libre (décision 0009) : seulement des identifiants. Une étape qui a besoin d'une donnée Google la recharge côté serveur à l'intérieur de l'étape et ne la renvoie pas. Les contrats d'entrée et de sortie de chaque étape sont des types maison stricts sans champ pour ces données. La conservation durable des verdicts, dérivés de données Google, est provisoire, sous réserve de Q5 (Samuel), et listée au § 17 (Q29).

Test nommé `workflows: aucune donnée Google dans l'état sérialisé` : pour chaque étape, l'entrée et la sortie sérialisées sont validées par leur contrat strict ; tout verdict appartient à l'énumération ; aucune clé ni aucun motif interdit du § 6 et de la décision 0011 n'apparaît, coordonnées comprises (`lat`, `lng`, `latitude`, `longitude`, `location`, `viewport`) et durées comprises (`duration`, `staticDuration`, `distanceMeters`).

---

## § 9. Paiement en mode test

- **Stripe Checkout**, TWINT et carte (cadrage § 6.4) : la session de paiement est créée côté serveur par `startCheckout`, avec `price_data` construit depuis la configuration (`src/config`, 29 CHF, Q2, jamais en dur), montant en centimes (`2900`) et devise `CHF` dans les données ; moyens `card` et `twint` ; métadonnées `checkoutId` ; ligne `checkouts` écrite avant la redirection.
- **Webhook** `/api/v1/webhooks/stripe` : corps brut lu tel quel, signature vérifiée avec le secret de signature (`STRIPE_WEBHOOK_SECRET`) ; une signature invalide renvoie 400 sans rien écrire. Événements traités : `checkout.session.completed` et `checkout.session.async_payment_succeeded` ; les autres sont enregistrés (`outcome = ignored`) sans effet.
- **Une seule transaction** (décision 0007, rôle `vadrouille_webhook`) : organisation retrouvée par `checkout_organization` ; contrôles ; insertion dans `billing` ; si les contrôles passent, insertion du droit `tripUnlocked` dans `entitlements` ; validation. Une panne avant la validation n'écrit rien : Stripe rejoue et l'événement est traité comme neuf. Il n'existe donc jamais de ligne `billing` « traitée » sans le droit correspondant.
- **Contrôles avant tout droit**, chacun contre la ligne `checkouts` (jamais contre les métadonnées seules) : `payment_status = paid` ; `amount_total` égal à `checkouts.amount_cents` ; devise égale à `checkouts.currency` (comparaison sans casse : Stripe écrit `chf`) ; identifiant de session Stripe égal à `checkouts.stripe_checkout_session_id` et métadonnée `checkoutId` cohérente ; voyage `checkouts.trip_id` appartenant à l'organisation retrouvée (clé composite `(organization_id, trip_id)` et lecture sous RLS). Un contrôle en échec enregistre `outcome = rejected` avec son code, n'accorde rien, renvoie 200 (inutile que Stripe rejoue) et produit une alerte sans donnée personnelle.
- **Idempotence et reprise** : `stripe_event_id` unique ; un événement déjà reçu ne réécrit rien, mais l'étape « suite » est rejouée : si le droit existe sans workflow 4 démarré, celui-ci est démarré (un seul par droit). Une réconciliation au chargement de `Trip.unlocked` fait de même. Le droit `tripUnlocked` est unique par voyage : un second paiement du même voyage ne crée pas un second droit (PO-4, `outcome = alreadyGranted`).
- **Le droit « voyage débloqué » n'est accordé que par le webhook** vérifié. La page de retour après paiement n'accorde rien : elle attend le droit (lecture de `Trip.unlocked`). Adresses de retour construites depuis `APP_URL`, jamais depuis la requête.
- L'organisation est celle de la ligne `checkouts`, retrouvée par `checkout_organization` (décision 0007), jamais crue depuis les métadonnées seules. `vadrouille_app` ne peut écrire ni dans `billing` ni dans `entitlements`.
- **Clés de test uniquement**, et seulement quand Samuel aura ouvert le compte (Q26). `src/server/env.ts` refuse de démarrer avec une clé Stripe de production (§ 2).
- **Paiement simulé** (jusqu'à l'ouverture du compte) : `PAYMENT_ADAPTER=simulated`, même contrat (`PaymentAdapter`), webhook simulé `/api/v1/webhooks/simulated` traité par le même code (signature, contrôles, transaction, idempotence, droit). **Fermé par défaut** : la route répond 404 sauf si `SIMULATED_WEBHOOK_ENABLED=true` ; activée en local et en CI seulement par défaut ; en staging (accessible sur Internet, dépôt public) seulement sur décision explicite pour une session de test, puis refermée ; **jamais en production** (refus au démarrage). Secret `SIMULATED_WEBHOOK_SECRET` hors dépôt, au moins 32 octets aléatoires, distinct par environnement. L'adaptateur simulé de F9 côté interface suit le même contrat.
- **Tests de B4** : `paiement: un événement rejoué ne crédite pas deux fois`, `paiement: signature invalide refusée sans écriture`, `paiement: le droit n'est accordé que par le webhook`, `paiement: prix lu dans la configuration`, `paiement: statut, montant, devise ou voyage incohérents n'accordent rien`, `paiement: une panne entre l'enregistrement et le droit ne perd pas le paiement` (panne injectée après l'insertion dans `billing` : rien n'est validé ; le rejeu accorde le droit une fois), `paiement: un événement déjà enregistré relance la suite manquante`, `paiement: webhook simulé fermé par défaut et en production`.

---

## § 10. Règles Google

Reprise du cadrage § 6.5 et du handover front § 8 ; chaque règle a son test nommé et sa tâche.
| Règle | Test nommé | Tâche |
|---|---|---|
| Seul `placeId` est stocké durablement ; aucune colonne interdite (§ 6) | `schéma: aucune colonne de contenu Google` | B1 |
| Coordonnées seulement dans `place_coordinates`, 30 jours au plus, avec expiration | `schéma: coordonnées expirées sous 30 jours` | B1 (schéma), B8 (purge) |
| L'état persistant des workflows ne contient, en fait de lieu, que `placeId`, un verdict de l'énumération du § 8 et la date de notre contrôle ; jamais de coordonnées ni de durée Routes | `workflows: aucune donnée Google dans l'état sérialisé` | B9 |
| Un plafond de coût ou un quota atteint conserve le dernier programme valide, sans version partielle publiée (extension signalée du test de sortie du cadrage § 9) | `workflows: plafond ou quota atteint conserve le dernier programme valide` | B9 |
| Aucun prompt ne contient de donnée Google : le constructeur de prompts (`src/ai`) n'accepte que des types maison (identifiants internes, résumés de notre recherche web) ; un test parcourt les prompts journalisés | `prompts: aucun prompt journalisé ne contient de donnée Google` | B7 |
| Aucun jeu d'évaluation (`evals/`) ne contient de donnée Google | `evals: aucune donnée Google dans les jeux d'évaluation` | B7 |
| Données de lieux affichées seulement avec la carte Google ou la mention « Données de lieux : Google » (`PlaceDetails`, `PlaceSearchResult`, vue partagée) | `affichage: données de lieux Google avec la carte ou l'attribution` | B11 (fiche, ajout), B12 (vue partagée) |
| Clé serveur distincte de la clé navigateur, jamais `NEXT_PUBLIC_`, lue seulement par `src/grounding` ; sa restriction par API se règle dans la console Google (Samuel, § 14) | `clés: clé serveur distincte et confinée à src/grounding` | B8 |
| Statut des données dérivées : provisoire, suit Q5. Défaut prudent (décision 0010) : verdicts, dates de contrôle et `Segment.minutes` calculés, non stockés (aucune colonne, aucun champ d'instantané) ; codes neutres conservés à titre provisoire (`Stop.exceptions` `toConfirm`, codes R4 du rapport de validation) recensés pour une purge ciblée | `schéma: aucune colonne dérivée de Google tant que Q5 et Q29 sont ouvertes` ; `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` ; `schéma: colonnes dérivées de Google recensées (provisoire, suit Q5)` | B1 (schéma), B2 (instantané) |
| `Stop.name` n'est jamais écrit depuis le `displayName` Google, y compris pour un lieu ajouté par la recherche | `révision: aucun nom Google écrit dans Stop.name` | B11 |

---

## § 11. Adaptateurs `src/adapters`

- **`api`** : implémente `TripAdapter` et ses extensions (évolution E7) côté serveur, en appelant les cas d'usage de `src/server` dans le même processus (aucun appel HTTP vers soi-même) ; chaque sortie est validée par son contrat, comme l'adaptateur `mock`.
- **`auth`** : contrat `AuthAdapter` ; `mock` (F8) et `better-auth`.
- **`payment`** : contrat `PaymentAdapter` ; `mock` (F9, interface seule), `simulated` (serveur, § 9), `stripe` (clés de test).
- **Choix** par variables serveur : `DATA_ADAPTER` (`mock`, `api`), `AUTH_ADAPTER` (`mock`, `better-auth`), `PAYMENT_ADAPTER` (`mock`, `simulated`, `stripe`) ; valeur inconnue = erreur au démarrage (comme `getTripAdapter`).
- **Suite de contrat commune** : une même suite de tests (`src/adapters/contract.suite.ts`) exécutée sur `mock` et sur `api` (base de test) : formes des sorties, `null` ou liste vide pour un voyage d'une autre organisation (isolation), versions et conflits. Test nommé `adaptateurs: mock et api passent la même suite de contrat` (B6).

---

## § 12. Sécurité et conformité

**Tests de sortie du cadrage § 9**
| Test de sortie | Test nommé | Tâche |
|---|---|---|
| Un compte d'une organisation ne peut ni consulter ni modifier les voyages d'une autre | `isolation: une organisation ne lit ni ne modifie les voyages d'une autre` | B1 (base), B6 (adaptateur `api`) |
| Un lien révoqué n'ouvre plus le voyage | `partage: un lien révoqué ou expiré n'ouvre plus le voyage` | B12 |
| Un paiement répété ne crédite pas deux fois | `paiement: un événement rejoué ne crédite pas deux fois` | B4 |
| Une étape verrouillée est conservée | `moteur: une étape verrouillée est conservée` | B5 |
| Une révision obsolète ne remplace pas silencieusement une version récente | `versions: une révision obsolète est refusée explicitement` | B5 |
| Une page web contenant des instructions ne modifie pas le comportement de l'agent | `recherche: une page contenant des instructions ne modifie pas l'agent` | B7 |
| Aucun prompt journalisé ne contient de donnée Google | `prompts: aucun prompt journalisé ne contient de donnée Google` | B7 |
| Une erreur de fournisseur est visible et récupérable | `workflows: une erreur de fournisseur est visible et récupérable` | B9 |
| Un dépassement de quota conserve le dernier programme valide (étendu au plafond de coût) | `workflows: plafond ou quota atteint conserve le dernier programme valide` | B9 |

**Autres exigences**
- Contenu web traité comme des données : pages insérées dans des blocs délimités, jamais comme instructions ; sorties validées par schéma ; aucun outil d'écriture pour les modèles (cadrage § 9).
- Lecture de pages : d'abord l'outil du fournisseur de modèle ; sinon le lecteur de `src/research`, protégé contre la SSRF : `http` et `https` seulement, ports 80 et 443 seulement ; aucune information d'identification dans l'adresse (`user:pass@` refusé) ; formes d'adresse alternatives refusées (IPv4 décimale, octale ou hexadécimale, IPv4 abrégée, IPv6 avec IPv4 intégrée, `0.0.0.0`) ; résolution DNS contrôlée (refus des adresses privées, de boucle locale, de lien local, de multidiffusion et de métadonnées) et **connexion à l'adresse validée elle-même** (pas de seconde résolution : parade au rebinding DNS) ; contrôle répété à chaque redirection (3 au plus) ; délai de 10 s ; taille de 2 Mo mesurée **après décompression** ; types de contenu admis : `text/html`, `application/xhtml+xml`, `text/plain` ; aucun cookie. Tests `recherche: le lecteur de pages refuse les adresses internes` et `recherche: le lecteur de pages refuse les formes d'adresse alternatives, les ports non standard et les réponses trop grosses après décompression` (B7).
- L'agent de recherche ne reçoit du brief que ce qui est nécessaire (destination, dates, envies, rythme ; jamais d'email ni de nom).
- Journaux structurés sans donnée personnelle inutile : ni email, ni récit libre, ni code de connexion, ni jeton ; liste de champs masqués dans `src/server` ; test `journaux: aucun email ni code dans les journaux` (B3).
- Inventaire des données personnelles par table : colonne « Données personnelles » du § 6, reprise dans la politique de confidentialité (Samuel).
- Export et suppression des données (cadrage § 3.5) : B11. `deleteAccount`, réservé au propriétaire, supprime dans cet ordre : (1) les données métier de son organisation personnelle par `purge_organization_data` (décision 0007) ; (2) par `vadrouille_auth`, l'organisation, les adhésions, les invitations, puis `users`, `sessions`, `accounts`, `verifications` (par identifiant email) et les entrées de `rate_limits` et `action_rate_limits` liées à la personne (clés HMAC de son email) ; (3) les journaux suivent la durée de conservation fixée par Samuel (Q27). Une organisation qui a d'autres membres n'est pas purgée : seule l'adhésion de la personne est retirée (cas hors MVP, PO-3). Test `compte: la suppression efface les données métier et d'authentification` (B11).
- **Vue partagée** `/p/[token]` : en-têtes `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` ; limite par adresse IP (`action_rate_limits`) ; lecture par les vues partagées seulement (décision 0007) ; `getPlaceDetails` appelé en anonyme depuis la vue partagée passe par les plafonds et la limite par adresse. Test `partage: en-têtes de confidentialité et limite par adresse` (B12).
- **Sauvegardes et retour arrière** : sauvegardes de la base, test de restauration et procédure de retour arrière d'une migration : pas de conception ici, car elles dépendent du fournisseur (Q24, Samuel). Critère de B1 : procédure écrite de retour arrière des migrations ; test de restauration à faire sur la base de staging dès que Q24 est tranchée.
- **Durées de conservation** (voyages, briefs, comptes, journaux, limiteur) : renvoyées à Samuel (Q27) ; aucune purge automatique autre que les coordonnées (30 jours, règle Google) avant sa décision.
- Secrets côté serveur seulement ; séparation test et production ; aucune clé de production (garde de `src/server/env.ts`, § 2).

---

## § 13. Observabilité et coûts

- **`usage_ledger`** : une ligne par appel payant (fournisseur, SKU, unités, coût estimé en micro-USD), écrite par `src/ai` et `src/grounding`.
- **Plafonds** vérifiés avant chaque appel : par génération (aperçu, voyage complet, mini-recherche), par organisation et par jour, et un plafond global quotidien des actions sans compte (écrans 2 et 3). Valeurs dans la configuration ; les montants engagent de l'argent : valeurs de départ proposées par le Tech Lead d'après le cadrage § 4 (aperçu 1 USD, voyage complet 6 USD, seuil d'alerte du cadrage § 12), **à valider par Samuel** (§ 17).
- **Quotas Google** : plafonds de quotas réglés dans la console Google (Samuel, § 14) en plus des plafonds applicatifs.
- **Traces par étape** : API OpenTelemetry (dépendance du Workflow SDK) ; durée, coût, tokens, statut par étape et par voyage ; exportateur désactivé tant qu'aucun service n'est ouvert. **Aucune trace (OpenTelemetry, Langfuse ou autre) ne contient le texte d'un prompt ni du brief** tant que Samuel n'a pas retenu un service en région UE (critère de Q28) : attributs limités aux identifiants, durées, coûts et codes ; test `traces: aucun prompt ni brief dans les attributs exportés` (B7).
- **Services externes** : Sentry, traces IA (Langfuse ou OpenTelemetry), PostHog en région UE : listés au § 14, non ouverts.

---

## § 14. Engagements externes

Aucun compte n'a été ouvert pour B0. Tous les engagements sont **à décider par Samuel**.
| Service | Usage | Région des données | Coût (cadrage § 11) | Statut |
|---|---|---|---|---|
| Postgres managé en région UE (Supabase ou Neon) | Base de staging puis de production | UE (exigence) | plan payant pour la bêta, plafond 100 CHF sur ~4 mois | à décider par Samuel (Q24) |
| Envoi d'emails (codes de connexion) | Codes à 6 chiffres, email « propositions prêtes » | à choisir en UE (sous-traitant de données personnelles) | inclus dans « traces, emails, supervision », 30 CHF | à décider par Samuel (Q25) |
| Stripe (mode test, TWINT et carte) | Paiement unique par voyage | Stripe (sous-traitant de paiement) | frais par transaction en production ; test gratuit | à décider par Samuel (Q26) |
| Clé serveur Google Places/Routes | Ancrage et trajets côté serveur, restreinte par API | facturation suisse (cadrage D4) | quotas gratuits puis 60 CHF au plus | à décider par Samuel (Q3, avec P0) |
| Fournisseurs de modèles (Anthropic ; Google Gemini pour la comparaison de P0) | Brief, recherche, sélection, réparation | selon le fournisseur (à vérifier) ; critère proposé : aucun entraînement sur nos données, contrat de sous-traitance | 200 CHF au plus (IA et recherche web) | à décider par Samuel (Q9 pour Gemini ; critère contractuel, § 17) |
| Vercel Pro et Vercel Workflows | Hébergement commercial, fonctions en région UE, état des workflows | fonctions : UE à régler ; état des workflows : à vérifier (Q28) | 80 CHF sur ~4 mois | à décider par Samuel |
| Observabilité (Sentry, Langfuse ou équivalent, PostHog UE) | Erreurs, traces IA, mesure | UE à exiger | inclus dans les 30 CHF « traces, emails, supervision » | à décider par Samuel |

---

## § 15. Décisions et backlog

### Décisions du Product Owner (spécification B0, définitives sans veto de Samuel avant le 2026-10-10)
- **PO-1 — Budget de trajet par rythme (Q8).** Valeurs de départ, hors excursion : 60 min par jour pour un rythme tranquille, 90 min pour un rythme équilibré, 150 min pour un rythme intense (cadrage § 3.7). Lues dans une configuration serveur, recopiées dans `Day.travelBudgetMinutes`, jamais codées dans l'interface ni dans le moteur. Une réponse « oui » à « On reste plus près de ton hôtel ? » réduit le budget du voyage d'un quart, une seule fois par voyage, de façon visible et annulable. Arrondi : le budget réduit est le plus grand multiple de 5 min qui ne dépasse pas les trois quarts du budget (60 → 45, 90 → 65, 150 → 110), pour que la réduction soit au moins d'un quart. Pas de plancher. Calibrage en bêta.
- **PO-2 — Moment d'un élément « À faire avant de partir » (Q22).** Une date limite, « avant le départ » ou un jour du voyage (« à l'arrivée » pour le J1), sous forme structurée ; libellés produits par l'interface. Forme : `ChecklistMoment` (§ 5).
- **PO-3 — Organisation personnelle.** Créée à la première connexion ; la personne en est propriétaire ; ni nom d'organisation ni sélecteur au MVP ; espace agence hors périmètre.
- **PO-4 — Déblocage par voyage.** Le paiement débloque un voyage, pas un compte ; les 8 propositions offertes restent accessibles sans paiement ; un second paiement du même voyage ne crée pas un second droit.
- **PO-5 — Annuler.** Annuler une modification (5 secondes) crée une nouvelle version identique à la précédente ; aucune version n'est supprimée.
- **PO-6 — Aperçu incomplet.** Moins de 8 propositions ancrées : l'aperçu montre celles qui existent et, pour le reste, un état « aucune option compatible », jamais complété par un lieu non ancré (R1) ; état structuré sans texte d'interface. Forme : `PreviewSlot` (§ 5).
- **PO-7 — Lien privé.** Lecture seule, valable jusqu'à 30 jours après la fin du voyage, révocable ; en créer un nouveau révoque le précédent.

### Décisions du Tech Lead (`docs/decisions/`, statut « proposé », définitives sans veto de Samuel avant le 2026-10-10)
L'accord tacite sous veto ne vaut que pour leur partie technique : il **ne couvre pas les aspects juridiques** des décisions 0007 (conservation et purge), 0010 et 0011 (données dérivées de Google, Q5, Q29), qui restent soumis à une décision écrite de Samuel. Le CEO le mentionne dans `STATUS.md`.
| Décision | Objet |
|---|---|
| 0006 | Stack serveur : actions serveur, Drizzle ORM 0.45.4, drizzle-kit 0.31.11, `pg` 8.23.1, Postgres 17 en conteneur local et en CI |
| 0007 | RLS : rôles dédiés (dont `vadrouille_webhook`, `vadrouille_account_admin`, `vadrouille_limiter`), droits par table, contexte de transaction `app.organization_id` et `app.user_id`, fonctions `SECURITY DEFINER` durcies et possédées par des rôles `vadrouille_fn_*` sans membre, purge limitée à l'organisation courante et au propriétaire, ajout seulement (`trip_versions`, `billing`, `usage_ledger`) |
| 0008 | Better Auth 1.7.7 : code à 6 chiffres (10 min, 3 essais), limitation des envois et des vérifications (IP de confiance par environnement, email normalisé, réponse identique), rôles, organisation personnelle, contexte de session, secret, Mailpit |
| 0009 | Exécution durable : Workflow SDK isolé, état réduit aux identifiants, mondes local, Vercel et Postgres, région de l'état à vérifier (Q28) |
| 0010 | Répartition des champs (Q14), défaut prudent « calculé, non stocké » pour les données dérivées de Google, `Stop.name` jamais tiré de Google, instantané dérivé de `TripSchema`, formes de PO-2 et PO-6 |
| 0011 | Verdicts d'ancrage (`compatible`, `discarded`, `closedPermanently`), non stockés en base par défaut, contenu admis dans l'état des workflows, codes neutres vers les modèles, durées Routes exclues, extension du test de sortie |

### Backlog (ordre de construction du cadrage § 7)
| # | Tâche | Rôle | Prérequis | Critères d'acceptation |
|---|---|---|---|---|
| B1 | Socle base de données : Docker Compose et conteneur CI Postgres 17, Drizzle, migrations, rôles, RLS, tables du § 6 (sauf `place_memory`), fonctions `resolve_share_link`, `checkout_organization`, `purge_organization_data`, `purge_expired_coordinates`, vues partagées, table `action_rate_limits` — après G0 | data | G0, B0 ; Q24 seulement pour la base de staging | `pnpm test:db` dans `pnpm verify` et en CI ; tests `schéma: RLS activée et forcée partout`, `isolation: une organisation ne lit ni ne modifie les voyages d'une autre`, `rôles: aucun rôle ne contourne la RLS` (tous les rôles de la décision 0007), `fonctions: SECURITY DEFINER durcies`, `purge: vadrouille_app ne peut pas purger une autre organisation`, `coordonnées: la purge ne supprime que les lignes expirées`, `versions: trip_versions est en ajout seulement`, `registres: billing et usage_ledger sont en ajout seulement`, `schéma: aucune colonne de contenu Google`, `schéma: aucune colonne dérivée de Google tant que Q5 et Q29 sont ouvertes`, `schéma: coordonnées expirées sous 30 jours`, `schéma: colonnes dérivées de Google recensées (provisoire, suit Q5)` verts ; procédure écrite de retour arrière des migrations |
| B2 | Évolutions des contrats E1 à E7 et contrats communs (`ApiError`, `ActionResult`, `TripPatch`, `PatchResult`, `TripSnapshot`, `ChecklistMoment`, `StopFacts`, `ProposalNeighbours`, `PreviewSlot`), mocks et composants adaptés — après G0 | backend | G0, B0, F1 ; composants concernés livrés (F3, F6) ou adaptés dans leur tâche | Script du critère § 5 de B0 rejoué sur les nouveaux contrats (une catégorie par champ) ; `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` ; `ChecklistItemSchema` refuse un texte libre dans `when` ; un aperçu de moins de 8 propositions renvoie des cases `noOption` ; aucun texte d'interface dans les données simulées ; `pnpm verify` vert |
| B3 | Authentification Better Auth et organisations (§ 7), adaptateur `auth`, Mailpit en local et en CI — après G0 | backend | B1, B2 ; Q25 seulement pour l'envoi réel | Tests `auth: code à 6 chiffres valable 10 minutes, 3 essais`, `auth: limitation des envois` (en-têtes d'IP forgés, variantes de casse et d'alias `+`), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`, `env: gardes de configuration`, `auth: organisation personnelle créée à la première connexion`, `auth: le contexte vient de la session, jamais du client`, `journaux: aucun email ni code dans les journaux` ; en-tête d'IP de confiance de Vercel confirmé (documentation et essai sur staging) et noté dans la décision 0008 ; IP et agent utilisateur absents de `sessions` ; scénario e2e de connexion avec le code lu dans Mailpit |
| B4 | Paiement en mode test (§ 9) : adaptateur simulé, webhook signé et idempotent, droits ; Stripe quand Samuel aura ouvert le compte — après G0 | backend | B1, B3 ; Q26 pour Stripe | Tests du § 9 (dont `paiement: statut, montant, devise ou voyage incohérents n'accordent rien`, `paiement: une panne entre l'enregistrement et le droit ne perd pas le paiement`, `paiement: un événement déjà enregistré relance la suite manquante`, `paiement: webhook simulé fermé par défaut et en production`) ; PO-4 vérifiée (second paiement sans second droit) ; adresses de retour depuis `APP_URL` |
| B5 | Moteur sans IA (`src/domain`) : modèle, squelette, planificateur, validateurs R1 à R10, patches, versions, annulation (PO-5), budget de trajet (PO-1) — après G0 | backend | B2 | R1 à R10 testées à 100 % sur des données de test ; `moteur: une étape verrouillée est conservée`, `versions: une révision obsolète est refusée explicitement`, `moteur: budget réduit 60 → 45, 90 → 65, 150 → 110, une seule fois`, `versions: annuler crée une version identique` ; règle ESLint « `src/domain` sans entrée-sortie » et son test |
| B6 | API de lecture et adaptateur `api` (Séjour, Journée, Mes voyages) sur données de test, actions serveur de base, suite de contrat commune — après G0 | backend | B1, B2, B3, B5 | `adaptateurs: mock et api passent la même suite de contrat` ; `isolation: une organisation ne lit ni ne modifie les voyages d'une autre` rejoué par l'adaptateur `api` ; `not_found` pour une autre organisation ; écrans 11 et 12 fonctionnent avec `DATA_ADAPTER=api` sans changement d'interface |
| B7 | Couche IA et recherche bornée (`src/ai`, `src/research`), constructeur de prompts typé, lecteur de pages protégé, `usage_ledger`, jeu d'évaluation — après G0 | ia-recherche | B1, B2, P0 ; Q9 pour la comparaison Gemini | `prompts: aucun prompt journalisé ne contient de donnée Google`, `evals: aucune donnée Google dans les jeux d'évaluation`, `recherche: une page contenant des instructions ne modifie pas l'agent`, `recherche: le lecteur de pages refuse les adresses internes`, `recherche: le lecteur de pages refuse les formes d'adresse alternatives, les ports non standard et les réponses trop grosses après décompression`, `traces: aucun prompt ni brief dans les attributs exportés` ; règles ESLint en liste blanche pour `src/ai`, `src/research`, `src/domain` et leurs tests ; fournisseur de modèles réel seulement après la réponse de Samuel sur le critère contractuel (§ 17) |
| B8 | Ancrage et trajets (`src/grounding`) : résolution, vérification, verdicts, cache de coordonnées et purge, matrice Routes — après G0 | ia-recherche | B1, B7 ; Q3 (clé serveur Places/Routes, Samuel) | `clés: clé serveur distincte et confinée à src/grounding` ; verdicts conformes à la décision 0011 sur des réponses enregistrées sans contenu Google (simulations de forme) ; purge des coordonnées expirées testée |
| B9 | Workflows de génération (§ 8, workflows 1 à 4 et recalcul par lot), `GenerationStatus`, aperçu en `PreviewSlot`, plafonds, actions `structureBrief`, `suggestLodging`, `createTrip` — après G0 | backend | B4, B5, B7, B8 | `workflows: aucune donnée Google dans l'état sérialisé`, `workflows: plafond ou quota atteint conserve le dernier programme valide`, `workflows: une erreur de fournisseur est visible et récupérable`, `workflows: une relance ne double aucune écriture`, `limitation: une adresse seule n'épuise pas le plafond global des actions sans compte` ; région de l'état du monde Vercel vérifiée et notée (Q28) ; aperçu en moins de 60 s sur Édimbourg (mesure) |
| B10 | Présentation, signaux, questions de préférence (2 refus), préférences déduites (3 « j'aime »), réduction de trajet (PO-1), recalcul par lot, déblocage, `AdjustmentSummary` — après G0 | backend | B9 | `préférences: aucune généralisation sans réponse` ; la deuxième réponse « oui » à la question de trajet ne réduit pas une seconde fois ; décisions idempotentes par `requestId` ; recalcul par lot en moins de 60 s |
| B11 | Révision : remplacer, ajouter, déplacer, verrouiller, annuler, liste à réserver, fiche (`PlaceDetails`), signalement, export et suppression du compte — après G0 | backend | B6, B9 | Révision depuis la réserve en moins de 5 s ; `versions: une révision obsolète est refusée explicitement` rejoué par les actions ; `affichage: données de lieux Google avec la carte ou l'attribution`, `révision: aucun nom Google écrit dans Stop.name`, `compte: la suppression efface les données métier et d'authentification` ; candidats de la réserve revérifiés avant d'être proposés |
| B12 | Pendant et après le voyage : `Today`, avis, mémoire des goûts sur accord, liens privés (PO-7) — après G0 | backend | B6, B11 | `partage: un lien révoqué ou expiré n'ouvre plus le voyage`, `partage: en-têtes de confidentialité et limite par adresse` ; lecture par les seules vues partagées ; un nouveau lien révoque le précédent ; expiration à la fin du voyage + 30 jours ; vue partagée en lecture seule (aucune action accessible) ; préférences entre voyages seulement avec accord |

---

## § 16. Hors périmètre

- Tout code, migration, workflow ou adaptateur `api` dans B0 : tâches B1 et suivantes, après G0.
- Ouverture de tout compte ou service payant ; toute clé, même de test, tant que Samuel ne l'a pas fournie ; toute mise en production.
- Vercel KV, Edge Config et toute API propre à Vercel dans le code métier : interdits (décision 0002).
- La réponse juridique aux règles Google (Q5) et aux photos (Q6) ; les prix (Q2 tranchée, révisable par Samuel) ; les durées de conservation des données (Q27).
- Le contenu du prototype de recherche (P0, rôle ia-recherche) ; la mémoire automatique (`place_memory`, bêta) ; la vérification à J-7, l'espace agence, les invitations, la marque blanche (phase 3) ; l'interface d'administration.
- Les modifications de `src/contracts`, `src/mocks` et des composants qu'entraînent Q14, PO-2 et PO-6 : décrites ici, appliquées par B2.

---

## § 17. Questions ouvertes

Questions déjà inscrites dans `QUESTIONS.md` (non tranchées ici) :
- **Q4** (Samuel) : tranchée, Better Auth ; intégration conçue ici (§ 7, décision 0008).
- **Q5** (Samuel, juridique) : statut des données dérivées et de l'interdiction liée à l'IA ; lignes « provisoire, suit Q5 » des § 5, § 6, § 8 et § 10.
- **Q6** (Samuel) : source des photos ; `Proposal.photoUrl` reste « chargé à la demande, provisoire » au § 5.
- **Q9** (Samuel, dépense) : clé Gemini de P0 ; le § 8 ne dépend pas de son issue.
- **Q14** (Tech Lead) : tranchée ici (§ 5, décision 0010).
- **Q8 et Q22** (Product Owner) : tranchées (PO-1, PO-2).
- **Q17** (Product Owner, partie données) : repas « pas encore choisi », `locked`, `kind: "event"` ; place réservée (évolution E8), fixée avec la spécification de F5.
- **Q24** (Samuel) : fournisseur Postgres UE et compte ; bloque la base de staging de B1, pas B0.
- **Q25** (Samuel) : fournisseur d'envoi des codes ; bloque la connexion réelle (B3), pas B0.
- **Q26** (Samuel) : compte Stripe en mode test avec TWINT ; bloque le paiement de test réel (B4), pas B0.
- **Q27** (Samuel) : durées de conservation des voyages, briefs, comptes, journaux et limiteur ; bloque la purge et la politique de confidentialité.
- **Q28** (Tech Lead, puis Samuel si hors UE) : partiellement traitée par la décision 0009 (état réduit aux identifiants, monde Postgres en repli) ; la région de l'état du monde Vercel reste à vérifier (B9) et remonte à Samuel si elle est hors UE.
- **Q29** (Samuel, juridique, sous réserve de Q5) : conservation durable des verdicts d'ancrage (`compatible`, `écarté`, `fermé définitivement`), dérivés de données Google, dans l'état des workflows et en base. Défaut prudent appliqué en attendant (décisions 0010 et 0011) : verdicts présents seulement dans l'état des workflows (prévu par la spécification B0, provisoire) ; aucune colonne `grounding_verdict` ni `grounding_checked_at` en base. Non tranchée ici. Bloque la version définitive des § 5, § 8 et § 10, pas B0.

Nouvelles questions (numérotées par le CEO dans `QUESTIONS.md`) :
1. **Samuel (juridique, sous réserve de Q5)** : peut-on conserver en base ou dans les versions du programme des données dérivées de réponses Google : durées de trajet produites par notre moteur à partir de Routes API (`Segment.minutes`), date de notre contrôle d'un lieu (`Stop.verifiedAt`), verdicts d'ancrage (`grounding_verdict`, `grounding_checked_at`, avec Q29), et codes neutres tirés d'horaires Google (`Stop.exceptions` `toConfirm`, codes R4 du rapport de validation) ? Défaut prudent appliqué en attendant : les quatre premiers sont calculés, non stockés (pas de durée hors ligne, une revérification par réutilisation d'un candidat, un appel Routes par lecture) ; les codes neutres restent stockés à titre provisoire et recensés pour une purge ciblée. Le délai « sans veto » ne vaut pas réponse. Bloque la version définitive des § 5, § 6 et § 10 et le coût de lecture des journées (B6, B8) ; ne bloque pas B0.
2. **Samuel (argent)** : valeurs des plafonds de coût (par aperçu, voyage complet, mini-recherche, organisation et jour, plafond global quotidien des actions sans compte des écrans 2 et 3) ; valeurs de départ proposées au § 13. Bloque la configuration finale de B7 et B9.
3. **Samuel (environnement des routines)** : les sessions d'agents disposent-elles de Docker pour lancer Postgres et Mailpit en local ? Sinon `pnpm verify` ne peut pas passer en local après B1 et la CI fait seule foi. Bloque l'exécution locale de `pnpm test:db` (B1).
4. **Product Owner** : PO-1 dit la réduction de trajet « annulable » ; une fois annulée, la question « On reste plus près de ton hôtel ? » peut-elle être reposée et la réduction redemandée dans le même voyage ? Bloque un critère de B10.
5. **Product Owner** : la valeur simulée « [Au plus tôt] » de la liste (`src/mocks/edimbourg.ts`) n'entre dans aucun des trois genres de PO-2 ; faut-il la traduire en `beforeDeparture`, en `deadline`, ou ajouter un genre ? Bloque la conversion du jeu simulé dans B2.
6. **Product Owner, avec UX/UI** : pour un lieu ajouté par la recherche (`searchPlaces`, `applyPatch`), le nom stocké doit être saisi par la personne, l'interface ne pouvant pas pré-remplir le champ avec le nom Google (§ 5). Quel parcours (champ obligatoire, suggestion de nom maison, texte d'aide) ? Bloque l'écran « Ajouter un lieu » de B11.
7. **Product Owner** : quelles informations de logement (`stays` : nom, quartier, dates, heures) la vue partagée `/p/[token]` montre-t-elle ? Le lieu de séjour est une donnée personnelle ; la vue `shared_stays` n'exposera que les colonnes retenues. Bloque B12.
8. **Samuel (comptes externes, sous-traitance)** : exiger des fournisseurs de modèles l'absence d'entraînement sur nos données et un contrat de sous-traitance (données personnelles du brief) avant tout appel réel (§ 14). Bloque le branchement d'un fournisseur réel dans B7, pas le prototype P0 sur données de test.
9. **Samuel (argent)**, complément de la question 2 : le plafond global quotidien des actions sans compte (écrans 2 et 3) doit valoir au moins 50 fois la limite quotidienne par adresse IP (20 par action, § 7) pour qu'une seule adresse ne puisse pas l'épuiser ; la valeur du plafond reste à fixer. Bloque la configuration de B9.
10. **Samuel (données personnelles), conditionnelle** : si B3 constate que Better Auth 1.7.7 ne permet pas de vider l'adresse IP et l'agent utilisateur des sessions sans désactiver le limiteur, accepte-t-il leur conservation pendant la durée de la session (inventaire des données personnelles, Q27) ? Ne bloque rien tant que B3 n'a pas fait la vérification.
