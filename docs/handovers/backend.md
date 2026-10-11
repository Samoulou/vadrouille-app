# Handover back-end — Vadrouille (MVP)

Destinataires : les agents `backend`, `data` et `ia-recherche`, et le Tech Lead qui relit leurs PR.
Émetteurs : Tech Lead (architecture, décisions 0006 à 0010) et Product Owner (règles fonctionnelles, décisions PO-1 à PO-7 de `specs/B0-handover-backend.md`). Spécification : `specs/B0-handover-backend.md` (ticket #22).

**Version B0a (2026-10-11) : tout le handover sauf ce qui dépend de Q5.** Elle reprend la PR #27 (rédigée le 2026-10-08), découpée par le CEO et le Tech Lead (Q43) en application d'une règle de Samuel du 2026-10-11 (« pour B0, découpe ce qui ne dépend pas de Q5 »). Les passages qui dépendent de la réponse juridique de Samuel sur les données dérivées de Google (Q5, et les questions qui en dépendent : Q29, Q34, Q38, Q44) sont retirés et listés dans la dernière section, « En attente de Q5 » ; la PR #27 est gardée pour les écrire. Cette version est alignée sur les décisions 0013 à 0023 fusionnées depuis.

Ce document est le pendant du handover front-end (`docs/handovers/frontend.md`). Il ne contient ni code, ni migration, ni compte, ni clé : il fixe ce qui est décidé, par qui, et comment chaque bloc sera vérifié. Toutes les tâches qu'il décrit commencent **après G0**. Quand une information manque, l'agent ne l'invente pas : il l'inscrit dans la description de sa PR (le CEO la reporte dans `QUESTIONS.md`).

---

## § 0. À lire en premier

**Mission.** Construire le serveur du MVP : base Postgres multi-organisation, authentification, actions serveur, workflows durables de génération et de révision, paiement en mode test, et l'adaptateur `api` qui remplace l'adaptateur `mock` **sans toucher à l'interface ni aux contrats** sans décision écrite.

**Règles d'or du back-end**

1. **L'agent cherche, l'ancrage vérifie, le moteur planifie** (cadrage § 6.2). Le modèle de sélection choisit parmi des candidats ancrés, par identifiant ; le moteur déterministe (`src/domain`) calcule et valide ; toute écriture passe par le serveur. Aucun composant IA ne dispose d'un outil d'écriture.
2. **Aucune donnée Google** dans un prompt, un journal, une trace ou un jeu d'évaluation ; seul l'identifiant de lieu Google (`placeId`) est stocké durablement. Le sort des données **dérivées** de réponses Google (verdict d'ancrage, date de contrôle, durée de trajet, code tiré d'horaires, cache de coordonnées) attend Q5 : voir « En attente de Q5 ». D'ici là, la règle stricte s'applique : aucune colonne, aucun champ d'instantané et aucun état de workflow ne les porte.
3. **Toute donnée appartient à une organisation** ; l'organisation vient de la session, jamais d'un paramètre envoyé par le client (§ 7, décision 0007).
4. **Données uniquement via `src/contracts`** (Zod), côté serveur comme côté interface ; aucun texte d'interface dans les données (handover front § 9) : codes, énumérations et nombres seulement.
5. **Clés de test uniquement** ; aucune clé ni secret dans le dépôt ; aucune mise en production.
6. **Aucun stockage ni API propres à Vercel (KV, Edge Config) : interdits.** Postgres pour les données (décision 0002).
7. **Toute écriture du programme est un patch sur une version identifiée** (R10) ; l'historique (`trip_versions`) est en ajout seulement.

---

## § 1. Sources de vérité

| Document | Contenu | Autorité |
|---|---|---|
| `QUESTIONS.md` (questions tranchées par Samuel) et `docs/decisions/` dont le décideur est Samuel | Q2 = 29 CHF, Q3 = clés Maps navigateur, Q4 = Better Auth ; décisions 0001 et 0002 ; règle « pour B0, découpe ce qui ne dépend pas de Q5 » (2026-10-11), appliquée par le CEO et le Tech Lead (Q43 : le découpage lui-même est leur décision, pas celle de Samuel) | Samuel (la règle) |
| `docs/produit/cadrage-v5.md` | Produit, architecture, données, conformité, règles R1 à R10, tests de sortie | Samuel (points « tranché » ou « confirmé par Samuel » : D4, D7…) |
| `docs/decisions/` déléguées : 0003 (agent frontend, validée par le Tech Lead), 0004, 0005, 0006 à 0010, 0013, 0015 à 0017, 0019 à 0023 (Tech Lead), 0012, 0014 et 0018 (UX/UI) | Versions, architecture, bibliothèques, outillage, tests, rendus | Rôle délégué, dans le cadre du cadrage |
| Rubriques « Décisions » des spécifications (`specs/B0-handover-backend.md`, PO-1 à PO-7 ; specs F) | Détails fonctionnels | Product Owner, dans le cadre du cadrage |
| `docs/handovers/backend.md` (ce document), puis `docs/handovers/frontend.md` pour les données | Mise en œuvre | Applique les sources ci-dessus |
| `src/contracts`, `src/adapters` | Contrats et adaptateurs existants | Évoluent seulement par une tâche qui cite sa décision (§ 4) |

**Ordre de priorité en cas de conflit** (fondé sur « Qui décide quoi », `docs/CONTEXT.md`) :
1. les décisions écrites de Samuel postérieures au cadrage (`QUESTIONS.md` tranchées, `docs/decisions/` dont le décideur est Samuel) ;
2. le cadrage, y compris ses points tranchés ou confirmés par Samuel ;
3. les décisions déléguées écrites (`docs/decisions/` déléguées ; Product Owner dans les spécifications), chacune dans le périmètre de son auteur ;
4. les handovers (back, puis front pour les données).

Une décision déléguée ne contredit jamais le cadrage ni une décision de Samuel et ne tranche aucune question réservée à Samuel ; entre deux décisions de même rang, la plus récente l'emporte si son auteur a autorité sur le sujet. Un conflit qui touche une question réservée à Samuel est listé au § 17, pas tranché.

**Conflits relevés**
| # | Documents et passages | Source retenue |
|---|---|---|
| C1 | Cadrage § 6.4 « Better Auth, Clerk ou WorkOS » ; Q4 | Q4 (Samuel) : Better Auth |
| C2 | Cadrage § 4 « 19, 29 et 39 CHF à tester » ; Q2 | Q2 (Samuel) : 29 CHF, lu dans la configuration (`src/server/config/offer.ts`, décision 0020), révisable |
| C3 | Cadrage § 6.11 `docs/adr/` ; dépôt `docs/decisions/` | `docs/decisions/` (règles du studio, `docs/CONTEXT.md`) |
| C4 | Handover front § 2 cite `docs/decisions/0001-versions.md` ; décision 0003 | Décision 0003 (le numéro 0001 était pris) |
| C5 | Cadrage § 6.8 rôles « propriétaire, conseiller » ; rôles natifs de Better Auth `owner`, `admin`, `member` | Correspondance de la décision 0008 : `owner` = propriétaire, `member` = conseiller, `admin` non attribué |
| C6 | Parcours (cadrage § 3.1, handover front § 6) : écrans 1 à 3 avant le compte ; PO-3 : organisation créée à la première connexion | Aucune donnée persistée avant le compte : brouillon gardé en mémoire de l'onglet (F8-PO-1, avis Sécurité de Q79), actions sans état avant connexion (§ 4) ; PO-3 inchangée |
| C7 | Cadrage § 6.5 étape 1 « Brief » dans le workflow ; écran 2 avant le compte | Le brief est structuré à l'écran 2 par une action sans état ; le workflow le relit et le valide (§ 8) |
| C8 | Spécification B0 § 6 « instantané validé par `TripSchema` » ; Q14 (champs calculés non stockés) | Décision 0010 : instantané validé par un schéma dérivé de `TripSchema` par omission, réponse recomposée et validée par `TripSchema` |
| C9 | Spécification B0 § 4 : `BriefRequest` = « `TripDraft` et récit libre » ; décision 0017 § 2.3 : `BriefRequest` minimal (récit, destination, dates, autres villes) | Décision 0017 : aucun logement, identifiant de lieu ni engagement n'entre dans la structuration du brief |
| C10 | #27 : `createTrip` renvoie `TripSummary` ; décision 0017 § 2.4 : `{ tripId }` | Décision 0017 ; `TripSummary` sert à « Mes voyages » (décision 0021) |
| C11 | #27 : offre lue par `TripAdapter.getOffer` ; décision 0020 § 2 : `PaymentAdapter.getOffer` | Décision 0020 (l'offre est une donnée commerciale) |
| C12 | #27 : `ActionResult` `{ ok, data }` ; décision 0017 § 4 : `Result` `{ ok, value }` dans `src/contracts/errors.ts` | Décision 0017 (contrat déjà en place) |
| C13 | Spécification B0 § 7 : route Better Auth pour l'écran 4 ; décision 0017 § 3 : actions `requestCode`, `verifyCode` | Décision 0017, complétée par 0008 : aucune route `/api/auth/*` n'est exposée (§ 7) |
| C14 | Roadmap, ligne 6 : prérequis de B0 « — » ; spécification B0 : F1 | Écart signalé par la spécification, non corrigé ici (la roadmap n'est pas modifiée par B0) |
| C15 | Handover front § 6, ligne 15, colonne « Données » : contrat `Today` (repris par #27 : `TripAdapter.getToday`, B12) ; note du 2026-10-11 du handover front (même ligne) et `specs/F10-pendant-le-voyage.md`, F10-TL-2 : `Today` n'est pas créé, l'écran 15 reçoit les jours du voyage projetés et calcule le jour courant dans le navigateur | La note du 2026-10-11 et F10-TL-2 : ni `Today` ni `TripAdapter.getToday` (§ 4, E7, B12). **Écart signalé** : F10-TL-2 est une proposition soumise au Tech Lead (Q144) ; si elle est refusée, B12 recrée le contrat par une décision écrite |

---

## § 2. Stack et conventions (Tech Lead)

Décision 0006. Versions vérifiées sur les registres le 2026-10-08 ; la tâche qui installe un outil confirme la version ou l'amende dans la décision.

| Domaine | Choix | Version | Décision |
|---|---|---|---|
| Entrée serveur de l'interface | Actions serveur Next.js (environnement `nodejs`) dans `src/server/actions/` | Next.js 16.4.0 | 0003, 0006, 0017 § 3 |
| Routes HTTP | Route handlers seulement pour le webhook Stripe, le webhook simulé et le suivi de génération ; **aucune route Better Auth exposée** | Next.js 16.4.0 | 0006, 0008 |
| Accès aux données | Drizzle ORM, pilote `pg` | 0.45.4 ; `pg` 8.23.1 | 0006 |
| Migrations | drizzle-kit, migrations SQL relues dans `db/migrations/` | 0.31.11 | 0006 |
| Base | Postgres 17 ; en local Docker Compose, en CI conteneur de service ; aucun compte externe | `postgres:17.11` | 0006 |
| Isolation | RLS forcée, rôles dédiés, contexte de transaction | — | 0007 |
| Authentification | Better Auth, greffons `emailOTP` et `organization`, appelée seulement côté serveur | 1.7.7 | 0008 |
| Emails (local, CI) | SMTP par `nodemailer` vers Mailpit | 10.0.16 ; `axllent/mailpit:v1.31.4` | 0008 |
| Exécution durable | Workflow SDK (`workflow`), monde local en développement, monde Vercel en staging, monde Postgres en repli | 5.1.0 ; mondes 5.0.2 | 0009 |
| Paiement | Stripe Checkout (mode test, quand Samuel aura ouvert le compte), adaptateur simulé avant | `stripe` : version fixée par B4 dans un amendement de 0006 | 0020 ; B4 |
| SDK de modèles | `ai`, `@ai-sdk/*`, confinés à `src/ai` | fixée par B7 dans un amendement de 0006 | B7 |
| Validation | Zod (déjà en place) | 4.6.5 | 0003 |
| Tests | Vitest (unitaires et base), Playwright (bout en bout) | 5.0.3 ; 1.56.1 | 0003 |

**Conventions**
- Tables et colonnes en `snake_case` ; contrats en `camelCase` ; conversion dans `src/server`.
- Montants en centimes avec devise (`CHF`) ; dates `date`, instants `timestamptz` UTC ; heures locales de la destination `HH:MM`.
- Variables d'environnement serveur sans préfixe `NEXT_PUBLIC_`, validées une fois par Zod (`src/server/env.ts`) ; `.env.example` sans valeur. Variables d'exécution prévues : `DATABASE_URL` (rôle `vadrouille_app`), `DATABASE_URL_AUTH` (rôle `vadrouille_auth`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_TRANSPORT`, `SMTP_URL`, `DATA_ADAPTER`, `AUTH_ADAPTER`, `PAYMENT_ADAPTER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SIMULATED_WEBHOOK_ENABLED`, `SIMULATED_WEBHOOK_SECRET`, `TRUSTED_IP_HEADER`, `RATE_LIMIT_HMAC_SECRET`, `APP_URL`, `GOOGLE_MAPS_SERVER_KEY`, clés des fournisseurs de modèles. `DATABASE_URL_MIGRATOR` n'existe que dans l'environnement des migrations (CI, déploiement), **jamais** dans celui de l'application. Aucune valeur dans le dépôt.
- **Gardes de `src/server/env.ts`** (refus de démarrer, testés par `env: gardes de configuration`) : clé secrète ou publiable Stripe portant le préfixe de **production** (`live`) refusée dans tous les environnements tant que la mise en production n'est pas décidée par Samuel (seul le préfixe de mode test est accepté) ; `BETTER_AUTH_SECRET`, `SIMULATED_WEBHOOK_SECRET` et `RATE_LIMIT_HMAC_SECRET` d'au moins 32 octets aléatoires, distincts par environnement ; `SIMULATED_WEBHOOK_ENABLED=true` refusé sur un déploiement de production ; `TRUSTED_IP_HEADER` obligatoire hors local et CI ; `DATABASE_URL_MIGRATOR` présente : refus. Le déploiement de production se reconnaît par `isProductionDeployment` (décision 0017 § 11.0 : `VADROUILLE_ENV` ou `VERCEL_ENV` valant `production`), jamais par `NODE_ENV` seul. **Côté serveur, l'environnement est fermé par défaut** (B3, amendement de 0017 § 11.0 à écrire par le Tech Lead dans la même PR) : `src/server/env.ts` résout un environnement déclaré, `VADROUILLE_ENV` d'abord, sinon `VERCEL_ENV` ; valeurs connues : `local`, `ci`, `staging` (et `preview`, `development` de Vercel), `production`. **Aucun environnement déclaré : refus de démarrer.** **Valeur inconnue : traitée comme `production`** (toutes les gardes d'ouverture fermées : webhook simulé, pages de développement, connexion simulée, clés de production toujours refusées). Les tests unitaires qui n'importent pas `src/server/env.ts` ne sont pas concernés. Cas testés par `env: gardes de configuration` : variable absente (refus), valeur inconnue ou mal orthographiée (production), `VERCEL_ENV=preview` sans `VADROUILLE_ENV` (staging).
- Chaque action serveur commence par `"use server"`, vérifie la session, construit le contexte côté serveur, valide son entrée par `parseInput` (décision 0017 § 3) et renvoie `Result` (§ 4).
- Toute dépendance nouvelle est notée dans une décision (version, raison) avant la fusion.

---

## § 3. Structure du dépôt (partie back)

Réconciliation du cadrage § 6.11, du handover front § 3 et de l'existant :

```
src/
  app/            pages, route handlers minces (webhooks, suivi de génération)
  features/       écrans (front) ; appellent les actions et src/adapters, jamais la base
  components/     composants (front)
  contracts/      schémas Zod partagés interface ↔ serveur (existant)
  adapters/       mock | api pour les voyages ; auth ; payment (existant, complété)
  mocks/          jeux simulés, importés seulement par src/adapters et les tests (règle F1)
  server/         actions/ (« use server », décision 0017 § 3), config/ (offre, décision 0020), env, session → contexte, withOrg, cas d'usage
  tenancy/        organisations et rôles (configuration Better Auth, correspondance des rôles)
  domain/         moteur pur : modèle, planificateur, validateurs R1–R10, patches, budget de trajet
  workflows/      workflows durables : seul endroit où figurent "use workflow" et "use step"
  research/       agent de recherche borné, politique de sources, lecteur de pages protégé
  grounding/      lieux (Places), trajets (Routes), événements ; seule entrée de la clé serveur Google
  ai/             point d'entrée unique des appels IA : prompts versionnés, constructeur de prompts, coûts, traces
db/               schéma Drizzle, migrations SQL, politiques RLS, fonctions, vues, tests d'isolation
evals/            voyages de référence, scripts d'évaluation (aucune donnée Google)
```

`src/server` est le seul ajout par rapport au cadrage : il porte les cas d'usage partagés par les actions serveur, les route handlers et l'adaptateur `api`, pour qu'aucune logique ne soit dupliquée entre eux. Il existe déjà (décisions 0017 et 0020) avec `actions/`, `config/` et `parse-input.ts`.

**Règles d'import, vérifiées par ESLint** (`no-restricted-imports`, `no-restricted-syntax`, `no-restricted-globals` par dossier ; chaque règle a un test qui prouve qu'une violation est signalée, comme `tests/unit/lint`). Elles complètent celles déjà en place (décision 0016 § 3.1 ; décision 0017 § 3.3 : hors de `src/server`, seul `@/server/actions/*` est importable).

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
| `src/app`, `src/features`, `src/components` | `db/`, `drizzle-orm`, `pg`, `better-auth`, `@/workflows`, `@/grounding`, `@/ai`, `@/research` (ils passent par les actions et `src/adapters`) |
| tout sauf `src/ai` | SDK de modèles (`ai`, `@ai-sdk/*`, SDK des fournisseurs) |
| tout sauf `src/workflows` | directives `"use workflow"` et `"use step"`, paquet `workflow` |
| tout sauf `src/grounding` et `src/server/env.ts` | lecture de `GOOGLE_MAPS_SERVER_KEY` |
| tout sauf `src/tenancy` et `src/server/auth` | paquet `better-auth` et objet `auth.api` (décision 0008 : seules les opérations de la liste blanche sont appelées) |
| tout sauf `src/server/account/delete.ts` et `db/` | la chaîne `purge_organization_data` (décision 0007) |

`import "server-only"` obligatoire dans `src/server` (hors `actions/`, déjà protégés par `"use server"`), `db/`, `src/tenancy`, `src/ai`, `src/research`, `src/grounding` et `src/workflows`, à partir de B1 (règle ESLint dédiée, avec son test). En phase 0, la décision 0020 n'ajoute pas le paquet `server-only` et s'appuie sur la règle de lint de 0017 § 3.3 ; B1 ajoute le paquet (décision 0006) sans retirer cette règle.

---

## § 4. Contrats serveur

**Principe d'accès.** L'interface appelle des **actions serveur** (`src/server/actions/`) ; chaque action construit le contexte (`AdapterContext`) depuis la session, appelle l'adaptateur choisi (`mock` ou `api`), qui appelle un cas d'usage de `src/server`. Les lectures des composants serveur passent par `TripAdapter` (ou par `getTripReader`, décision 0020 § 3). Les schémas existants (`TripSchema`, `DaySchema`, `ProposalSchema`, `StopSchema`, `ChecklistItemSchema`, `ChangeSchema`, `OfferSchema`, `PreferencePromptSchema`…) sont importés, jamais recopiés. Toute action renvoie `Result` : `{ ok: true, value }` ou `{ ok: false, error: ApiError }` (décision 0017 § 4).

### Points d'accès par écran (handover front § 6)
| Écran | Route ou action | Méthode | Entrée | Sortie | Rôle requis | Idempotence | Erreurs possibles |
|---|---|---|---|---|---|---|---|
| 1 Créer le voyage | aucun appel : brouillon validé et gardé en mémoire de l'onglet jusqu'à la connexion (F8-PO-1, Q79) | — | `TripDraft` | — | anonyme | — | `validation_failed` (côté interface) |
| 2 Brief raconté | `structureBrief` | action | `BriefRequest` | `InferredBrief` | anonyme, limité par adresse IP (limiteur maison, § 7) puis plafond global | sans état (rien n'est stocké) | `validation_failed`, `rate_limited`, `cost_cap_reached`, `provider_error` |
| 3 Où loger | `suggestLodging` | action | `LodgingRequest` | `LodgingSuggestion` | anonyme, limité par adresse IP (limiteur maison, § 7) puis plafond global | sans état | `validation_failed`, `rate_limited`, `cost_cap_reached`, `no_option`, `provider_error` |
| 4 Compte | `requestCode` ; `verifyCode` ; `signOut`, par `AuthAdapter` (aucune route `/api/auth/*`, décision 0008) | action | `CodeRequest` ; `CodeVerification` | `Session` (cookie) | anonyme | limité (décision 0008) | `invalid_code`, `code_expired`, `too_many_attempts`, `rate_limited` |
| 5 Propositions prêtes | `createTrip` puis `getGenerationStatus` (interrogation, décision 0017 § 9) ; flux `/api/v1/trips/[id]/generation` plus tard | action ; route GET | `TripRequest` | identifiant du voyage (`{ tripId }`, 0017) ; `GenerationStatus` | propriétaire ou conseiller | `requestId` unique par organisation | `active_preview_exists`, `validation_failed`, `cost_cap_reached`, `quota_reached`, `provider_error` |
| 6 Présentation | `TripAdapter.listPreviewSlots` ; `decideCard` ; `undoDecision` | lecture ; action | `DeckDecision` | `PreviewSlot` (liste) ; `DeckDecisionResult` | propriétaire ou conseiller | `requestId` unique par voyage ; annulation idempotente | `not_found`, `validation_failed`, `generation_in_progress` |
| 6b Suite du tri | `TripAdapter.listProposals` ; `getGenerationStatus` | lecture | — | `Proposal` (liste) ; `GenerationStatus` | propriétaire ou conseiller | lecture | `not_found` |
| 7 Confirmer une préférence | `answerPreferencePrompt` | action | `PreferenceAnswer` (étendu par B10 : `requestId`, question) | `PreferenceSignal` | propriétaire ou conseiller | `requestId` unique par voyage | `not_found`, `validation_failed` |
| 8 Choisir un repas | `decideCard` (variantes « je choisis » et « option suivante ») | action | `DeckDecision` | `DeckDecisionResult` | propriétaire ou conseiller | `requestId` unique par voyage | `not_found`, `no_option` |
| 9 Débloquer | `PaymentAdapter.getOffer` ; `startCheckout` ; `getCheckoutStatus` ; webhook `/api/v1/webhooks/stripe` | lecture ; action ; route POST | `CheckoutRequest` ; `CheckoutStatusRequest` ; événement signé | `Offer` ; `CheckoutStart` ; `CheckoutStatus` ; `PaymentEvent` (interne) | propriétaire ou conseiller ; webhook : signature | `requestId` (ajouté par B4) ; identifiant d'événement Stripe unique | `payment_failed`, `already_unlocked`, `not_found`, `provider_error` |
| 10 Programme ajusté | `completeDeck` ; lecture de `AdjustmentSummary` (phase 0 : jeu simulé, décision 0020 § 7) | action ; lecture | — | `GenerationStatus` ; `AdjustmentSummary` | propriétaire ou conseiller | une seule exécution par version de base | `version_conflict`, `generation_in_progress` |
| 11 Séjour | `TripAdapter.getTrip`, `TripAdapter.getTripMap` ; `toggleChecklistItem` | lecture ; action | `ChecklistUpdate` | `Trip`, `DayMap` (liste) ; `ChecklistItem` | propriétaire ou conseiller | état final (rejouer donne le même résultat) | `not_found` |
| 12 Journée | `TripAdapter.getDay`, `TripAdapter.getDayMap` | lecture | — | `Day` ; `DayMap` | propriétaire ou conseiller | lecture | `not_found`, `generation_in_progress` |
| 13 Fiche étape | `TripAdapter.getDay` ; `getPlaceDetails` (chargé à la demande, jamais stocké) ; verrouiller ; `reportStop` | lecture ; action | `TripPatch` (interne) ; `StopReport` | `Stop` ; `PlaceDetails` ; `PatchResult` | propriétaire ou conseiller | `requestId` | `not_found`, `version_conflict`, `provider_error` |
| 14 Remplacer une étape | `previewReplacement` ; appliquer l'aperçu (décision 0016 § 4) | action | `ReplacementRequest` ; identifiant d'aperçu | `RevisionPreview` (variante `replace`) ; `PatchResult` | propriétaire ou conseiller | aperçu sans écriture ; application : version de base | `version_conflict`, `no_option`, `cost_cap_reached`, `provider_error` |
| Ajouter un lieu | `searchPlaces` ; aperçu d'ajout ; appliquer | action | texte et jour ; `AddRequest` | `PlaceSearchResult` (liste) ; `RevisionPreview` ; `PatchResult` | propriétaire ou conseiller | recherche sans écriture | `version_conflict`, `rate_limited`, `provider_error` |
| Déplacer une étape | lecture des points d'insertion ; aperçu de déplacement ; appliquer | lecture ; action | `MoveRequest` | `MoveOptions` ; `RevisionPreview` ; `PatchResult` | propriétaire ou conseiller | version de base | `version_conflict` |
| Annuler (5 s) | opération `revert` de `TripPatch` (PO-5) | action | identifiant de version | `PatchResult` | propriétaire ou conseiller | `requestId` | `version_conflict` |
| 15 Pendant le voyage | `TripAdapter.getTrip` : jours du voyage projetés sans positions, jour courant et prochaine étape calculés dans le navigateur (F10-TL-2, C15) | lecture | — | `Trip` (jours projetés) | propriétaire ou conseiller | lecture | `not_found` |
| Mes voyages | `TripAdapter.listTrips` (décision 0021) | lecture | — | `TripSummary` (liste) | propriétaire ou conseiller | lecture | — |
| Après le voyage | lecture de l'avis (fonction à part, décision 0021) ; `saveReview` | lecture ; action | `TripReview` | `TripReview` | propriétaire ou conseiller | état final | `not_found`, `validation_failed` |
| États | transverses : chaque erreur est un `ApiError` | — | — | — | — | — | voir la correspondance ci-dessous |
| Vue partagée | `createShareLink` ; `revokeShareLink` ; lecture `/p/[token]` par `TripAdapter.getSharedTrip` | action ; lecture | — | `ShareLink` ; `SharedTrip` | propriétaire ou conseiller ; lecture : lien valide | un lien actif par voyage (PO-7) | `link_expired`, `link_revoked`, `not_found`, `rate_limited` |
| Compte : export et suppression (cadrage § 3.5) | `exportAccount` ; `deleteAccount` (§ 12) | action | — | `AccountExport` | propriétaire (vérifié dans `src/server` et par `purge_organization_data`) | suppression idempotente | `forbidden` |

Un voyage d'une autre organisation renvoie `not_found`, jamais `forbidden` : on ne révèle pas son existence.

### Contrats à créer
Les contrats déjà exportés par `src/contracts` ou `src/adapters` ne figurent pas ici. Une tâche F déjà décidée crée le contrat dans sa forme de phase 0 ; la tâche B le complète sans le renommer.
| Contrat | Rôle | Tâche |
|---|---|---|
| `TripDraft` | Brouillon de l'écran 1 (décision 0017 § 2.2) | F8a ; complété par B9 |
| `BriefRequest` | Récit et voyage minimal envoyés à la structuration (0017 § 2.3) | F8a |
| `Brief` | Brief structuré complet (0017 § 2.3) | F8a ; complété par B9 |
| `InferredBrief` | Brief déduit, champs facultatifs (0017 § 2.3) | F8a |
| `LodgingRequest` | Brouillon et ville visée (0017 § 2.4) | F8b |
| `LodgingSuggestion` | Quartier conseillé et jusqu'à 3 logements, noms maison (0017 § 2.4) | F8b |
| `CodeRequest` | Adresse email (0017 § 2.4) | F8b |
| `CodeVerification` | Adresse et code à 6 chiffres (0017 § 2.4) | F8b |
| `Session` | Session lue par l'interface : `sessionId`, `userId`, `organizationId` (0017 § 2.4) | F8b ; complété par B3 |
| `AuthAdapter` | Adaptateur `auth` : demander un code, le vérifier, lire la session, se déconnecter | F8b ; adaptateur Better Auth par B3 |
| `TripRequest` | `requestId`, brouillon, brief (0017 § 2.4) | F8c |
| `GenerationStatus` | Phases, jours prêts, compteurs `expected` et `ready`, raison d'échec (0017 § 2.4) | F8c ; complété par B9 |
| `ReplacementRequest` | Étape, raison (`PreferenceReason`), souhait, version de base (0016 § 4.1) | F7a |
| `RevisionPreview` | Aperçu d'une révision : jours touchés, `Change`, étape visée (0016 § 4.2) | F7a ; complété par B11 |
| `RevisionError` | Codes d'écran de la révision (0016 § 4.4), convertis depuis `ApiError` par l'adaptateur `api` | F7a |
| `MoveRequest` | Déplacement d'une étape vers un point d'insertion (0016 § 4.1) | F7b |
| `MoveOptions` | Jours et points d'insertion possibles (0016 § 4.3) | F7b |
| `AddRequest` | Ajout d'un lieu : source opaque, nom saisi, moment (0016 § 4.1) | F7c |
| `AddMoment` | Moment d'un ajout : temps libre ou repas laissé vide (0016 § 4.3) | F7c |
| `PlaceSearchResult` | Résultat de recherche : `resultId`, `placeId`, nom chargé à la demande et jamais recopié dans `Stop.name`, moments (0016 § 4.3) | F7c ; complété par B11 |
| `TripSummary` | Carte de « Mes voyages », sans `organizationId`, avec `dayCount` (décision 0021) | F11 ; complété par B6 |
| `TripReview` | Avis rapide, adresse découverte, préférences retenues (décision 0021) | F11 ; complété par B12 |
| `TripPatch` | Patch : `requestId`, `baseVersion`, opérations (`replace`, `add`, `move`, `lock`, `unlock`, `revert`) désignant les étapes par identifiant ; `add` porte `placeId` et le nom saisi par la personne (jamais le nom Google, § 5) | B2 |
| `PatchResult` | Nouvelle version, jours touchés, `Change` (liste) | B2 |
| `TripSnapshot` | Instantané d'une version : dérivé de `TripSchema` par omission des champs calculés et chargés à la demande (décision 0010) | B2 |
| `ChecklistMoment` | Moment d'un élément de la liste (PO-2, § 5) | B2 |
| `StopFacts` | Faits structurés d'une étape : durée, coût estimé par personne, secteur (remplace le texte de `Stop.meta`) | B2 |
| `ProposalNeighbours` | Étapes voisines d'une proposition (remplace le texte de `Proposal.context`) | B2 |
| `PreviewSlot` | Case de l'aperçu : proposition ou « aucune option compatible » (PO-6, § 5) | B2 |
| `PaymentEvent` | Événement de paiement interne normalisé (identifiant d'événement, type, paiement, montant, devise, mode test) | B4 |
| `DeckDecision` | `requestId`, proposition, décision (`like`, `dislike` avec raison facultative, `choose`, `nextOption`), geste | B10 |
| `DeckDecisionResult` | Question de préférence éventuelle (`PreferencePrompt`), compteurs | B10 |
| `PreferenceSignal` | Signal enregistré : catégorie, signal, origine, statut (`confirmed`, `inferred`, `cancelled`) | B10 |
| `AdjustmentSummary` | Préférences retenues (confirmées ou déduites, annulables), changements (`Change`), réservations à faire | B10 |
| `ChecklistUpdate` | Élément et état coché | B11 |
| `PlaceDetails` | Détail d'un lieu chargé à la demande (contenu Google, jamais stocké, affiché avec attribution) | B11 |
| `StopReport` | Signalement d'erreur sur une étape : motif (code), texte libre facultatif | B11 |
| `AccountExport` | Export des données de la personne (format JSON) | B11 |
| `ShareLink` | Adresse du lien privé, expiration | B12 |
| `SharedTrip` | Lecture seule des écrans 11 et 12, sans information de logement tant que Q50 n'est pas tranchée | B12 |

### Format d'erreur commun et états de l'interface
`ApiError` existe (`src/contracts/errors.ts`, décision 0017 § 4) : `code` (énumération `API_ERROR_CODES` de `src/contracts/values.ts`, étendue sans renommer par chaque tâche), `field` (chemin construit à partir des clés connues du schéma, jamais la valeur reçue), `retryable`. B5 y ajoute `currentVersion` (conflit). L'interface choisit le texte (`src/i18n/fr.json`) et l'état à afficher :
| Codes | État du handover front (StatusBanner, écran « États ») |
|---|---|
| (pas de réponse réseau, détecté par l'interface) | `offline` |
| `version_conflict` | `conflict`, avec « rejouer » (le patch est rejoué sur `currentVersion` si l'utilisateur le demande) |
| `no_option` | `noOption` |
| `generation_in_progress` | `generating` |
| `provider_error`, `cost_cap_reached`, `quota_reached`, `internal` | `error` (`retryable` dit si « Réessayer » est proposé) |
| `validation_failed` (avec `field`) | erreur de champ du formulaire |
| `unauthenticated` | redirection vers la connexion (décision 0017 § 4) |
| `not_found`, `forbidden`, `link_expired`, `link_revoked` | page « introuvable » ou lien expiré |
| `rate_limited`, `invalid_code`, `code_expired`, `too_many_attempts` | message du formulaire de connexion |
| `active_preview_exists`, `already_unlocked`, `payment_failed` | message de l'écran concerné (`active_preview_exists` : décision 0017, rendu 0018 ; sa levée après déblocage suit Q135) |

### Concurrence (R10, cadrage § 6.6)
Toute écriture sur un voyage porte `baseVersion`. Le serveur crée la version `baseVersion + 1` seulement si `baseVersion` est la version courante (contrainte d'unicité `(trip_id, version)` et verrou de ligne sur `trips`) ; sinon il renvoie `version_conflict` avec `currentVersion` et `retryable = true`, et l'interface propose de rejouer le patch. Rien n'est remplacé en silence.

### Évolutions de contrats
Appliquées par **B2** (une seule PR, avec `src/mocks/edimbourg.ts`, les composants touchés et leurs tests), sauf mention :
| # | Changement | Effet sur `src/mocks/edimbourg.ts` | Effet sur les composants |
|---|---|---|---|
| E1 | `Day.weekday`, `Day.title`, `Proposal.weekday` retirés (calculés par l'interface depuis `date`, `Intl.DateTimeFormat("fr-CH")`) | champs supprimés | DayBadge, DayTabs, DeckCard, en-tête de Journée |
| E2 | `Proposal.context` remplacé par `neighbours: ProposalNeighbours` | voisins par identifiant | DeckCard compose « Entre ton déjeuner et … » via `fr.json` |
| E3 | `Stop.meta` et `SurpriseIdea.meta` remplacés par `facts: StopFacts` | faits structurés | ligne du jour, Fiche étape, idée « Surprends-moi » (formatage) |
| E4 | `ChecklistItem.when` devient `ChecklistMoment` (PO-2) | « [Déjà réservé] » → `beforeDeparture` avec `done`, « [Une semaine avant] » → `deadline`, « [Avant le départ] » → `beforeDeparture` ; « [Au plus tôt] » : Q42 | ChecklistRow produit le libellé |
| E5 | `PreviewSlot` et `TripAdapter.listPreviewSlots` (PO-6) | aperçu Édimbourg avec une case `noOption` pour le test | DeckCard et état `noOption` (F6) |
| E6 | `AdapterContext` : ajout de `userId` et `role` (`owner`, `member`) | — | aucun (construit côté serveur) |
| E7 | `TripAdapter` : ajout de `listPreviewSlots`, `getSharedTrip` (B2, B12) ; pas de `getToday` (C15, F10-TL-2) ; `listTrips` par F11 (décision 0021) ; `getDayMap` et `getTripMap` déjà en place (décision 0013) ; l'offre reste sur `PaymentAdapter` (décision 0020) | lectures simulées correspondantes | écrans concernés, au fil des tâches F |
| E8 | Fait : repas « pas encore choisi » (`DayLineItem` `openMeal`), `Stop.commitment`, `Day.surprise` (décision 0015) | — | — |
| E9 | `ChecklistItem.stopId` (décision 0016 § 11), par la tâche qui applique F7-PO-19, ou par B2 si le schéma de base vient avant | lignes du Tattoo reliées à leur étape | ChecklistRow, rappels de l'écran 15 (Q187) |
| E10 | `ApiError.currentVersion` (B5) | — | bandeau `conflict` |

---

## § 5. Répartition des champs : stockés, chargés à la demande, calculés (Q14, Tech Lead)

Décision 0010. Catégories :
- **stocké** : contenu maison (nom et résumé issus de notre recherche web, choix de l'utilisateur, sortie du moteur conservée dans la version, paiement enregistré) ou identifiant de lieu ;
- **chargé à la demande** : contenu Google obtenu côté serveur à l'affichage, jamais persisté, affiché sur la carte Google ou avec la mention « Données de lieux : Google » ;
- **calculé** : à la lecture, par le moteur (`src/domain`, appelé par le serveur), par le serveur (configuration, identifiants) ou par l'interface (formatage) ; jamais persisté.

Le tableau couvre chaque champ de chaque schéma objet ou union discriminée exporté par `src/contracts` au 2026-10-11 (144 clés, notation du critère § 5 de la spécification B0), **sauf les 7 clés qui dépendent de Q5**, listées dans « En attente de Q5 » : 137 lignes ici, 7 là-bas, sans recouvrement. Un champ dont le type est un autre schéma exporté a une ligne ; ses sous-champs sont dans les lignes du schéma référencé.

| Champ | Catégorie | Règle |
|---|---|---|
| `Stop.id` | stocké | Identifiant d'étape stable entre versions, attribué par le moteur |
| `Stop.kind` | stocké | Type d'étape |
| `Stop.placeId` | stocké | Identifiant de lieu Google, seul élément Google conservable |
| `Stop.name` | stocké | Nom trouvé par notre recherche web (`candidates.name`, source citée) ou saisi par la personne ; **jamais écrit depuis le `displayName` Google**, y compris pour un lieu ajouté par la recherche (le nom Google y est seulement chargé à la demande, avec attribution ; décision 0016 § 12, F7-PO-10) |
| `Stop.start` | stocké | Sortie du moteur |
| `Stop.end` | stocké | Sortie du moteur |
| `Stop.meta` | calculé | Interface, à partir de `StopFacts` (évolution E3) ; aucun texte stocké |
| `Stop.reason` | stocké | Résumé maison de la sélection, commence par ce que la personne a choisi |
| `Stop.source` | stocké | Source web relue (jamais Google) |
| `Stop.locked` | stocké | Choix de la personne, ou engagement verrouillé à la création (décision 0015 § 9) |
| `Stop.commitment` | stocké | Engagement saisi par la personne à l'écran 1 (`TripDraft`), décision 0015 § 9 |
| `Segment.mode` | stocké | Sortie du moteur |
| `Segment.estimated` | stocké | Sortie du moteur : vrai quand la durée est une estimation du moteur |
| `Source.label` | stocké | Nom de la source web |
| `Source.url` | stocké | Adresse de la source web, `https:` seulement (§ 12) |
| `DayLineItem[terminus].type` | stocké | Discriminant |
| `DayLineItem[terminus].role` | stocké | Départ ou retour au logement |
| `DayLineItem[terminus].time` | stocké | Sortie du moteur |
| `DayLineItem[terminus].label` | stocké | Nom du logement (`stays.label`, saisi par la personne ou nom maison d'une suggestion) |
| `DayLineItem[stop].type` | stocké | Discriminant |
| `DayLineItem[stop].stop` | stocké | Voir `Stop.*` |
| `DayLineItem[segment].type` | stocké | Discriminant |
| `DayLineItem[segment].segment` | stocké | Voir `Segment.*` |
| `DayLineItem[free].type` | stocké | Discriminant |
| `DayLineItem[free].from` | stocké | Sortie du moteur (R8) |
| `DayLineItem[free].to` | stocké | Sortie du moteur (R8) |
| `DayLineItem[openMeal].type` | stocké | Discriminant (décision 0015 § 2) |
| `DayLineItem[openMeal].time` | stocké | Sortie du moteur : créneau de repas laissé vide (F6-PO-7) |
| `DayLineItem[openMeal].meal` | stocké | Déjeuner ou dîner |
| `Day.index` | stocké | 1 = J1 |
| `Day.date` | stocké | Date ISO |
| `Day.weekday` | calculé | Interface, depuis `date` (évolution E1) |
| `Day.title` | calculé | Interface, depuis `date` (évolution E1) |
| `Day.items` | stocké | Ligne du jour, voir `DayLineItem[*].*` |
| `Day.budgetPerPerson` | calculé | Moteur (R9), somme des coûts estimés de `StopFacts` |
| `Day.events` | stocké | Événements du jour, voir `Stop.*` |
| `Day.generating` | calculé | Serveur, à la lecture, depuis `generation_runs` |
| `Day.travelBudgetMinutes` | stocké | Copie de la configuration PO-1 au moment de la planification, réduction comprise |
| `Day.surprise` | stocké | Copie d'un candidat de la réserve choisi par la sélection (décision 0015 § 3), voir `SurpriseIdea.*` |
| `SurpriseIdea.id` | stocké | Identifiant du candidat |
| `SurpriseIdea.placeId` | stocké | Identifiant de lieu Google |
| `SurpriseIdea.name` | stocké | Règle de `Stop.name` |
| `SurpriseIdea.meta` | calculé | Interface, à partir de `StopFacts` (évolution E3) |
| `SurpriseIdea.reason` | stocké | Justification maison |
| `SurpriseIdea.source` | stocké | Source web relue (jamais Google) |
| `ChecklistItem.id` | stocké | Identifiant |
| `ChecklistItem.label` | stocké | Contenu maison : ce qu'il faut réserver |
| `ChecklistItem.when` | stocké | `ChecklistMoment` (PO-2, évolution E4) |
| `ChecklistItem.done` | stocké | Choix de l'utilisateur |
| `ChecklistItem.bookingUrl` | stocké | Lien de réservation issu de la recherche web (jamais Google), `https:` seulement (§ 12) |
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
| `Proposal.category` | stocké | Copie de `candidates.category` (vocabulaire `Category`, décision 0013 § 3.1), jamais un type de lieu Google |
| `Proposal.option.index` | calculé | Moteur, rang de l'option parmi les candidats du créneau |
| `Proposal.option.total` | calculé | Moteur, nombre d'options du créneau (3 au plus) |
| `Proposal.photoUrl` | chargé à la demande | Provisoire, suit Q6 ; jamais persisté |
| `Proposal.travelFromPrevious` | stocké | Voir `Segment.*` (la durée suit Q5) |
| `Proposal.detour` | stocké | Justification maison du détour ; l'interface y ajoute la durée |
| `Change[replaced].type` | calculé | Moteur, aperçu des effets (jamais persisté ; le patch l'est) |
| `Change[replaced].time` | calculé | Moteur |
| `Change[replaced].before` | calculé | Moteur, depuis `Stop.name` |
| `Change[replaced].after` | calculé | Moteur, depuis `Stop.name` |
| `Change[moved].type` | calculé | Moteur |
| `Change[moved].label` | calculé | Moteur, depuis `Stop.name` |
| `Change[moved].before` | calculé | Moteur (forme structurée de la décision 0016 § 4.5, appliquée par F7a) |
| `Change[moved].after` | calculé | Moteur (idem) |
| `Change[segment].type` | calculé | Moteur |
| `Change[segment].estimated` | calculé | Moteur |
| `Change[budget].type` | calculé | Moteur |
| `Change[budget].deltaPerPerson` | calculé | Moteur (R9) |
| `Change[unchanged].type` | calculé | Moteur |
| `Change[unchanged].label` | calculé | Moteur, depuis `Stop.name` |
| `Change[unchanged].time` | calculé | Moteur |
| `DayMap.tripId` | calculé | Serveur, identifiant du voyage demandé |
| `DayMap.dayIndex` | calculé | Serveur, jour demandé |
| `DayMap.points` | chargé à la demande | Positions pour la carte Google (décision 0013 § 1), voir `MapPoint.*` ; jamais persistées par le navigateur |
| `MapPointRef[stop].type` | calculé | Discriminant |
| `MapPointRef[stop].stopId` | calculé | Serveur, `Stop.id` de l'étape placée |
| `MapPointRef[terminus].type` | calculé | Discriminant |
| `MapPointRef[terminus].role` | calculé | Serveur, départ ou retour au logement |
| `MapPoint.ref` | calculé | Voir `MapPointRef[*].*` |
| `MapPoint.lat` | chargé à la demande | Position Google obtenue côté serveur par `placeId`, affichée sur la carte Google seulement ; conservation côté serveur : en attente de Q5 (Q34) |
| `MapPoint.lng` | chargé à la demande | Idem |
| `PreferencePrompt[category].kind` | calculé | Moteur, règle des deux refus (décision 0013 § 3.2) |
| `PreferencePrompt[category].category` | calculé | Moteur, catégorie refusée |
| `PreferencePrompt[distance].kind` | calculé | Moteur, question de trajet (PO-1) |
| `PreferenceAnswer.answer` | stocké | `preference_signals.signal` (`answerYes`, `answerNo`) |
| `PreferenceAnswer.reason` | stocké | `preference_signals.reason` |
| `CheckoutRequest.tripId` | stocké | `checkouts.trip_id` |
| `CheckoutRequest.method` | stocké | `checkouts.method` |
| `CheckoutStart.checkoutId` | stocké | `checkouts.id` |
| `CheckoutStart.redirectUrl` | calculé | Serveur : chemin de l'application en phase 0, adresse du prestataire ensuite ; adresses de retour depuis `APP_URL` (§ 9) |
| `CheckoutStatusRequest.checkoutId` | stocké | `checkouts.id` |
| `CheckoutStatus.checkoutId` | stocké | `checkouts.id` |
| `CheckoutStatus.tripId` | stocké | `checkouts.trip_id` |
| `CheckoutStatus.method` | stocké | `checkouts.method` |
| `CheckoutStatus.status` | stocké | `checkouts.status` |
| `CheckoutStatus.priceVariant` | stocké | Instantané du prix à la création (décision 0020 § 1.3) |
| `CheckoutStatus.amount` | stocké | `checkouts.amount_cents` |
| `CheckoutStatus.currency` | stocké | `checkouts.currency` |
| `OfferConfig.amount` | calculé | Serveur, lu dans `src/server/config/offer.ts` (Q2), jamais en base |
| `OfferConfig.currency` | calculé | Serveur, configuration |
| `OfferConfig.priceVariant` | calculé | Serveur, configuration |
| `OfferConfig.methods` | calculé | Serveur, configuration |
| `OfferConfig.includes` | calculé | Serveur, configuration (contenu : Q128) |
| `OfferConfig.replacementLimit` | calculé | Serveur, configuration (absent tant que Q88 n'est pas tranchée) |
| `OfferConfig.accessDaysAfterReturn` | calculé | Serveur, configuration |
| `Offer.tripId` | calculé | Serveur, identifiant du voyage demandé |
| `Offer.amount` | calculé | Voir `OfferConfig.amount` |
| `Offer.currency` | calculé | Voir `OfferConfig.currency` |
| `Offer.priceVariant` | calculé | Voir `OfferConfig.priceVariant` |
| `Offer.methods` | calculé | Voir `OfferConfig.methods` |
| `Offer.includes` | calculé | Voir `OfferConfig.includes` |
| `Offer.replacementLimit` | calculé | Voir `OfferConfig.replacementLimit` |
| `Offer.accessDaysAfterReturn` | calculé | Voir `OfferConfig.accessDaysAfterReturn` |
| `SimulateOutcomeRequest.checkoutId` | stocké | `checkouts.id` |
| `SimulateOutcomeRequest.outcome` | stocké | Issue simulée, enregistrée par le même code que le webhook (`billing.outcome`, § 9) |
| `ApiError.code` | calculé | Serveur, à chaque réponse ; jamais en base |
| `ApiError.field` | calculé | Serveur, chemin construit depuis les clés du schéma (décision 0017 § 4) |
| `ApiError.retryable` | calculé | Serveur |

**Coordonnées.** Jamais dans un contrat stocké, une version, un journal ou l'état d'un workflow ; seulement dans `DayMap`, chargé à la demande pour la carte Google. La carte du navigateur peut aussi les obtenir par la bibliothèque Google à partir de `placeId`. Le cache serveur de 30 jours prévu par le cadrage § 6.5 attend Q5 et Q34 (« En attente de Q5 »).

**Forme de PO-2 (`ChecklistMoment`)** : union discriminée par `type` : `{ type: "deadline", date }` (date ISO), `{ type: "beforeDeparture" }`, `{ type: "tripDay", day }` (1 = J1 ; l'interface affiche « à l'arrivée » pour le J1). Aucun libellé dans les données. Critère de B2 : `ChecklistItemSchema` refuse un texte libre dans `when` et accepte les trois formes.

**Forme de PO-6 (`PreviewSlot`)** : union discriminée par `type` : `{ type: "proposal", proposal }` (une `Proposal`) ou `{ type: "noOption", day, time, kind }` (`kind` : `activity` ou `meal`). L'aperçu est une liste ordonnée de 8 cases au plus, lue par `TripAdapter.listPreviewSlots` ; `GenerationStatus` porte `expected` et `ready`. Une case `noOption` n'a ni lieu ni texte ; elle n'est jamais remplie par un lieu non ancré (R1). Critères de B2 et B9 : un aperçu de moins de 8 propositions ancrées renvoie des cases `noOption` pour le reste ; aucune case ne contient de texte d'interface.

---

## § 6. Schéma Postgres multi-organisation (Tech Lead)

Décisions 0006 et 0007. Région UE exigée ; fournisseur et compte : Samuel (§ 14, Q24).

**Règles communes**
- Chaque table métier a `organization_id uuid NOT NULL` (clé étrangère vers `organizations`), un index qui commence par `organization_id`, la RLS activée et forcée, et la politique type de la décision 0007 (`organization_id = app_current_org()` en lecture et en écriture) pour le rôle `vadrouille_app`. Les clés étrangères vers `trips` sont composites `(organization_id, trip_id)` : une ligne ne peut pas pointer vers le voyage d'une autre organisation.
- Aucun rôle n'a `BYPASSRLS` : le propriétaire des tables n'a aucune politique (il ne voit aucune ligne, RLS forcée) ; les fonctions `SECURITY DEFINER` et les vues partagées appartiennent à des rôles dédiés `vadrouille_fn_*` sans membre, avec des droits par colonne et des politiques étroites (décision 0007).
- Organisation transmise par `set_config('app.organization_id', …, true)` dans la transaction. Les permissions serveur (rôle `owner` ou `member`) sont vérifiées dans `src/server` ; la RLS double la vérification d'**organisation** (cadrage § 9), pas celle du rôle : au MVP, propriétaire et conseiller ont les mêmes droits sur les voyages ; seuls l'export et la suppression du compte sont réservés au propriétaire, contrôle repris en base par `purge_organization_data`.
- **Suppressions** : `vadrouille_app` n'a `DELETE` que sur `checklist_items`, `preferences` et `stays` ; les données d'un compte sont supprimées par `purge_organization_data` ; aucune autre suppression (décision 0007, tableau des droits).
- Toute migration ajoute sa politique et son test d'isolation (rôle `data`).

**Tables**
| Table | Colonnes principales | Clés et index | `organization_id` | RLS | Données personnelles |
|---|---|---|---|---|---|
| `users` (Better Auth) | `id`, `email`, `email_verified`, `created_at`, `updated_at` | `email` unique | exception : une personne peut appartenir à plusieurs organisations | `vadrouille_auth` (droits par table de la décision 0007) ; `vadrouille_app` : `SELECT` de sa seule ligne (`id = app_current_user()`, décision 0007) | oui (email) |
| `sessions` (Better Auth) | `id`, `user_id`, `token`, `expires_at`, `active_organization_id` (IP et agent utilisateur vidés avant écriture, décision 0008) | `token` unique ; `user_id` | exception : précède le choix d'organisation | `vadrouille_auth` seulement | oui (pseudonyme) |
| `accounts` (Better Auth, si la bibliothèque la crée pour la connexion par code) | `id`, `user_id`, `provider_id` | `user_id` | exception : authentification | `vadrouille_auth` seulement | oui (pseudonyme) |
| `verifications` (Better Auth) | `id`, `identifier`, `value` (code haché), `expires_at` | `identifier` | exception : avant toute session | `vadrouille_auth` seulement | oui (email dans `identifier`) |
| `rate_limits` (Better Auth) | `key` (HMAC de la clé du limiteur : adresse IP et chemin, ou email normalisé ; jamais en clair, décision 0008), `count`, `last_request` | `key` unique ; `last_request` | exception : limitation avant session | `vadrouille_auth` seulement | oui (pseudonyme : HMAC de l'adresse IP ou de l'email ; fenêtres expirées purgées par le limiteur, § 12) |
| `action_rate_limits` (limiteur maison) | `key` (HMAC de l'adresse IP et de l'action), `window_start`, `count` | `key` unique ; `window_start` | exception : actions anonymes (écrans 2 et 3, `/p/[token]`) | forcée ; rôle `vadrouille_limiter` seulement (décision 0007) | oui (pseudonyme, conservation courte) |
| `organizations` (Better Auth) | `id`, `name`, `slug` (valeurs neutres générées, jamais l'email), `kind` (`personal`, `agency`), `deletion_requested_at` (état « suppression en cours », § 12), `created_at` | `slug` unique | exception : `id` est l'organisation elle-même | `vadrouille_app` : `id = app_current_org()` ; `vadrouille_auth` : `SELECT`, `INSERT`, `DELETE` (suppression de compte), jamais `UPDATE` ; `deletion_requested_at` écrit seulement par `purge_organization_data` (décision 0007) | non |
| `memberships` (Better Auth) | `id`, `organization_id`, `user_id`, `role` (`owner`, `member`), `created_at` | unique `(organization_id, user_id)` ; une seule adhésion `owner` par organisation qui n'est pas en suppression (déclencheur contraint différé, décision 0007) | oui | `vadrouille_app` : organisation courante ; `vadrouille_auth` : `SELECT`, `INSERT`, `DELETE` (suppression de compte), jamais `UPDATE` (décision 0007) | oui (pseudonyme) |
| `invitations` (Better Auth, hors MVP) | `id`, `organization_id`, `email`, `role`, `status`, `expires_at` | `organization_id` | oui | aucun droit au MVP (greffon d'invitation désactivé) | oui (email) |
| `trips` | `id`, `organization_id`, `created_by`, `request_id`, `destination`, `start_date`, `end_date`, `travellers_adults`, `travellers_children`, `current_version`, `status` (`preview`, `unlocked`, `archived`), `created_at` | unique `(organization_id, request_id)` ; unique `(organization_id, id)` (cible des clés composites) ; `(organization_id, start_date)` | oui | type ; lecture partagée par la vue `shared_trip` (décision 0007) | oui (projet de voyage d'une personne) |
| `briefs` | `id`, `organization_id`, `trip_id`, `version`, `story` (récit libre), `pace`, `mobility`, `wishes` (codes `Category`), `limits`, `meal_budget`, `inferred_fields`, `created_at` | unique `(trip_id, version)` ; ajout seulement | oui | type | oui (récit libre) |
| `stays` | `id`, `organization_id`, `trip_id`, `kind` (`lodging`, `neighbourhood`), `place_id`, `label` (nom saisi ou maison), `from_date`, `to_date`, `arrival_time`, `departure_time`, `luggage` | `(trip_id, from_date)` | oui | type ; aucune vue partagée tant que Q50 n'est pas tranchée | oui (lieu de séjour) |
| `trip_versions` | `id`, `organization_id`, `trip_id`, `version`, `parent_version`, `request_id`, `snapshot` (JSONB validé par `TripSnapshotSchema`, dérivé de `TripSchema`), `patch` (JSONB `TripPatch`, nul pour la version 1), `author_kind` (`user`, `engine`, `workflow`), `author_user_id`, `created_at` | unique `(trip_id, version)` ; unique `(trip_id, request_id)` ; **pas de colonne `validation_report`** tant que Q5 n'a pas fixé son contenu (« En attente de Q5 » : la partie Q5 l'ajoute par migration, avec sa garde) | oui | type ; `INSERT` et `SELECT` seulement (droits et déclencheur ; seule exception : `DELETE` par la fonction de suppression de compte, décision 0007) ; lecture partagée par la vue `shared_trip_version` (projection en liste blanche, § 12) | indirecte (via le voyage) |
| `generation_runs` | `id`, `organization_id`, `trip_id`, `workflow_run_id`, `kind` (`preview`, `full`, `batch`, `mini`), `phase`, `stop_reason`, `last_version`, `started_at`, `updated_at`, `finished_at` | `(trip_id, started_at)` | oui | type | non |
| `research_runs` | `id`, `organization_id`, `trip_id`, `generation_run_id`, `queries` (requêtes web, sans nom de personne), `pages_read`, `duration_ms`, `cost_estimate_micros`, `errors` (codes d'une énumération fermée, jamais un message de fournisseur), `started_at`, `finished_at` | `(trip_id)` | oui | type | oui (indirecte : les requêtes sont tirées du brief d'une personne ; conservation : Q27) |
| `candidates` | `id`, `organization_id`, `trip_id`, `research_run_id`, `kind` (`place`, `event`), `name` (nom trouvé sur le web), `summary` (résumé maison), `category` (`Category`), `facts` (JSONB `StopFacts` ; `CHECK` : `(facts - ARRAY[<clés de StopFacts>]) = '{}'::jsonb`, aucune autre clé), `sources` (JSONB : libellé, adresse, date), `confidence`, `place_id` (écrit pour un candidat résolu en un seul lieu). Aucune colonne de verdict d'ancrage ni de date de contrôle (« En attente de Q5 ») | `(trip_id, place_id)` | oui | type | non |
| `event_occurrences` | `id`, `organization_id`, `trip_id`, `candidate_id`, `place_id`, `starts_at`, `ends_at`, `timezone`, `category`, `price_note` (texte maison issu de la page de l'événement), `source_url`, `source_checked_at` (relecture de la page web, jamais Google), `status` (`confirmed`, `unconfirmed`) | `(trip_id, starts_at)` | oui | type | non |
| `feedback` | `id`, `organization_id`, `trip_id`, `target_stop_id`, `place_id`, `reason` (code), `text`, `scope` (`stop`, `trip`), `created_by`, `created_at` | `(trip_id)` | oui | type | oui (texte libre) |
| `preference_signals` | `id`, `organization_id`, `trip_id`, `request_id`, `candidate_id`, `place_id`, `category`, `signal` (`like`, `dislike`, `choose`, `nextOption`, `answerYes`, `answerNo`, `travelReduction`), `reason` (`PreferenceReason`), `origin` (`gesture`, `question`, `brief`), `status` (`confirmed`, `inferred`, `cancelled`), `created_at` | unique `(trip_id, request_id)` ; `(trip_id, category)` | oui | type | oui (goûts) |
| `preferences` | `id`, `organization_id`, `user_id`, `category`, `value`, `consented_at`, `created_at` | `(organization_id, user_id)` | oui | type | oui (goûts, avec accord) |
| `checklist_items` | `id`, `organization_id`, `trip_id`, `stop_id`, `kind` (`reservation`, `ticket`, `other`), `label`, `moment` (JSONB `ChecklistMoment`), `booking_url` (`CHECK` : commence par `https://`), `sponsored`, `done`, `done_at` | `(trip_id)` | oui | type, avec `DELETE` ; lecture partagée par la vue `shared_checklist` | indirecte (via le voyage) |
| `share_links` | `id`, `organization_id`, `trip_id`, `token_hash` (SHA-256 d'un jeton aléatoire de 32 octets), `created_by`, `created_at`, `expires_at` (fin du voyage + 30 jours, PO-7), `revoked_at` | `token_hash` unique ; unique `(trip_id) WHERE revoked_at IS NULL` (un lien actif par voyage) | oui | type ; lecture par `resolve_share_link` et par les vues partagées, chacune par son rôle propriétaire, des colonnes nommées et une politique `token_hash = ` hachage du jeton de la transaction, jamais `USING (true)` (décision 0007) | indirecte (le jeton en clair passe dans l'adresse : journaux de la plateforme, § 12, Q27) |
| `usage_ledger` | `id`, `organization_id`, `trip_id`, `generation_run_id`, `step`, `provider`, `sku`, `units`, `cost_estimate_micros`, `created_at` | `(organization_id, created_at)` ; `(trip_id)` | oui | type ; ajout seulement ; `trip_id` et `generation_run_id` sans clé étrangère (identifiants historiques, Q48) ; `organization_id` en clé étrangère `ON DELETE RESTRICT` | non |
| `checkouts` | `id`, `organization_id`, `trip_id`, `request_id`, `stripe_checkout_session_id`, `price_variant`, `amount_cents`, `currency`, `method`, `status`, `created_by`, `created_at`, `updated_at` | unique `stripe_checkout_session_id` ; unique `(organization_id, request_id)` ; clé composite `(organization_id, trip_id)` | oui | type ; organisation retrouvée par `checkout_organization` (propriété de `vadrouille_fn_checkout`) pour le webhook ; `status` mis à jour par `vadrouille_webhook` | indirecte |
| `billing` | `id`, `organization_id`, `stripe_event_id`, `type`, `livemode`, `checkout_id`, `amount_cents`, `currency`, `outcome` (`granted`, `alreadyGranted`, `ignored`, `rejected` avec code), `received_at` (la ligne et le droit sont écrits dans la même transaction, § 9) | **unique `stripe_event_id`** (idempotence) | oui | type ; ajout seulement ; écriture par `vadrouille_webhook` seulement ; `checkout_id` est un identifiant historique **sans clé étrangère** (la ligne `checkouts` peut être purgée, la pièce reste : Q48) ; `organization_id` en clé étrangère `ON DELETE RESTRICT`, jamais `CASCADE` | indirecte |
| `entitlements` | `id`, `organization_id`, `trip_id`, `kind` (`preview`, `tripUnlocked`), `billing_id`, `granted_at` | **unique `(organization_id, trip_id, kind)`** (PO-4) ; clé composite `(organization_id, trip_id)` | oui | type ; écriture par `vadrouille_webhook` seulement ; aucune vue partagée | non |
| `place_memory` (**bêta**, cadrage § 6.7, non créée au MVP) | à concevoir en bêta, après Q5 | — | exception à justifier en bêta | à concevoir en bêta | — |

Tables de l'exécution durable : si le monde Postgres est retenu (décision 0009), ses tables vivent dans un schéma dédié `workflow`, gérées par la bibliothèque, et ne contiennent que des identifiants (§ 8) ; exception à `organization_id` justifiée, accès réservé au rôle des workflows.

**Colonnes interdites.** Aucune colonne, dans aucune table, pour un contenu Google : note (`rating`, `user_rating_count`), avis (`reviews`), horaires d'ouverture (`opening_hours`, `regular_opening_hours`), statut brut (`business_status`), photo (`photos`, `photo_url`), téléphone (`phone`), adresse (`address`, `formatted_address`), niveau de prix (`price_level`), nom Google (`display_name`), coordonnées (`lat`, `lng`, `location`), ni équivalent. Test `schéma: aucune colonne de contenu Google` (liste de motifs sur `information_schema.columns`). **Clés JSONB** : les colonnes JSONB qui portent un contrat fermé (`candidates.facts`, `checklist_items.moment`) ont un `CHECK` qui refuse toute clé hors du contrat ; test `schéma: les JSONB refusent les clés hors contrat` (insertion dans `candidates.facts` d'une clé `rating`, `openingHours`, `displayName` ou `location` refusée). **Colonnes dérivées** : aucune colonne de verdict, de date de contrôle d'un lieu ni de durée de trajet (`grounding_verdict`, `grounding_checked_at`, `verified_at`, `travel_minutes` ou équivalent) ; test `schéma: aucune colonne dérivée de Google`. Toute exception future (cache de coordonnées, données dérivées) suit la réponse de Samuel à Q5 (« En attente de Q5 ») et amende ce test dans la même PR.

---

## § 7. Authentification et organisations (Better Auth, Q4 tranchée par Samuel)

Décision 0008.

- **Connexion par code** : greffon `emailOTP` ; code à 6 chiffres, valable 10 minutes, 3 essais puis invalidé, stocké haché ; compte créé à la première vérification réussie ; aucun mot de passe (cadrage D8, écran 4).
- **Aucune route Better Auth exposée** (décision 0008). Le gestionnaire HTTP de Better Auth (`/api/auth/[...all]`) n'est **pas monté** : toute requête vers `/api/auth/*` reçoit 404. Les seules opérations utilisées sont appelées côté serveur, depuis `src/server/auth`, par les actions `requestCode`, `verifyCode` et `signOut` (`src/server/actions/compte.ts`, décision 0017 § 3) et par `getRequestContext()` : envoi du code, vérification du code (connexion), lecture de la session, déconnexion. Toute autre opération de la bibliothèque (suppression d'utilisateur, changement d'email, création, mise à jour ou suppression d'organisation, ajout, retrait ou changement de rôle d'un membre, invitations, sessions multiples) est **désactivée dans la configuration** quand la bibliothèque le permet, et en tout cas jamais appelée (règle ESLint du § 3 : `auth.api` seulement dans `src/server/auth` et `src/tenancy`, avec la liste des opérations permises). La suppression de compte passe par `deleteAccount` (§ 12). Tests `auth: aucune route /api/auth n'est exposée` et `auth: seules les opérations de la liste blanche sont appelées`.
- **Limitation des envois et des vérifications** (décision 0008) : limiteur de Better Auth, stockage en base (`rate_limits`) par un stockage personnalisé (`rateLimit.customStorage`) qui **remplace la clé par son HMAC** (`RATE_LIMIT_HMAC_SECRET`) avant toute lecture ou écriture : aucune adresse IP ni email en clair en base ; les fenêtres expirées sont supprimées à l'écriture (donnée technique sans valeur après la fenêtre, comme `action_rate_limits`) ; si 1.7.7 ne le permet pas, B3 applique ces règles dans nos actions avec les mêmes compteurs et amende la décision 0008 ; test `auth: aucune adresse IP ni email en clair dans rate_limits` ; 3 envois par 10 minutes et par adresse IP, 10 vérifications par 10 minutes et par adresse IP ; par adresse email **normalisée** (minuscules, NFC, alias `+` retiré, clé HMAC), 5 envois et 10 vérifications par heure. La forme normalisée ne sert **qu'au limiteur** : l'identité du compte est l'adresse en minuscules, jamais la forme sans alias (sinon `a+x@…` et `a@…`, deux boîtes distinctes chez certains fournisseurs, fusionneraient en un compte) ; test `auth: deux adresses qui ne diffèrent que par l'alias + sont deux comptes distincts`. Valeurs de départ ; les seuils réels relèvent de Q86 (Tech Lead, Sécurité). `disableIpTracking` n'est pas activé (dans Better Auth 1.7.7, il désactive le limiteur) ; l'IP et l'agent utilisateur sont vidés de la session par un crochet. Même réponse pour une adresse connue ou inconnue (décision 0017 § 4). Un attaquant peut épuiser la limite par email d'une autre personne et lui refuser la connexion pendant une heure : limite connue, acceptée au MVP, suivie avec Q86.
- **Adresse IP de confiance par environnement** (`TRUSTED_IP_HEADER`, décision 0008) : en staging et en production sur Vercel, seul `x-vercel-forwarded-for` est lu (à confirmer par B3 sur la documentation Vercel et sur staging) ; `X-Forwarded-For`, `X-Real-IP`, `Forwarded` et les autres sont ignorés ; en local et en CI, seuls les tests posent l'en-tête de confiance. Sans en-tête de confiance, la requête tombe dans un compartiment commun strict (échec fermé). Tests `auth: limitation des envois` (en-têtes forgés et changeants, variantes de casse et d'alias), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`.
- **Limiteur des actions sans compte** (`structureBrief`, `suggestLodging`, lecture `/p/[token]`) : hors Better Auth, table `action_rate_limits` en Postgres (§ 6), accès par le seul rôle `vadrouille_limiter` (décision 0007), même adresse IP de confiance. Limite par adresse IP **bien inférieure au plafond global** : valeurs de départ 5 par heure et 20 par jour par action et par adresse, et le plafond global quotidien vaut au moins 50 fois la limite quotidienne par adresse, pour qu'une seule adresse ne puisse pas l'épuiser ; le compartiment commun « sans IP de confiance » a sa propre limite stricte. Le plafond global, qui engage de l'argent, est à valider par Samuel (Q45). Test `limitation: une adresse seule n'épuise pas le plafond global des actions sans compte` (B9).
- **Protection des requêtes** : les actions serveur s'appuient sur le contrôle d'origine de Next.js (en-tête `Origin` comparé à l'hôte) ; `BETTER_AUTH_URL` et `APP_URL` fixent l'origine attendue ; cookie de session `httpOnly`, `secure`, `sameSite=lax`. **Hachage des jetons de session : critère bloquant de B3.** B3 vérifie sur 1.7.7 si Better Auth stocke les jetons de session hachés et note le résultat dans la décision 0008. S'ils sont en clair, B3 ne fusionne pas tant qu'une parade n'est pas décidée par le Tech Lead (amendement de 0008) et testée (`auth: aucun jeton de session en clair dans sessions`).
- **Organisations et rôles** : greffon `organization` ; `owner` = `propriétaire`, `member` = `conseiller` (cadrage § 6.8) ; `admin` non attribué au MVP ; création d'organisation par l'utilisateur, invitations et changements de rôle désactivés au MVP. Invariant en base : toute organisation a exactement une adhésion `owner` (déclencheur contraint différé, décision 0007, test `organisations: exactement un propriétaire`). Les droits de `vadrouille_auth` sont limités table par table (décision 0007).
- **Organisation personnelle** (PO-3) : créée avec l'adhésion `owner` dans la transaction de création du compte ; posée comme organisation active de chaque session ; invisible dans l'interface au MVP.
- **Session → `AdapterContext` → RLS** : `getRequestContext()` lit la session, vérifie l'adhésion à l'organisation active et renvoie `{ organizationId, userId, role }` (évolution E6) ; ce contexte est passé à l'adaptateur et à `withOrg`, qui pose `app.organization_id` et `app.user_id` pour la transaction (décision 0007). Aucune action n'accepte une organisation venue du client ; un identifiant de voyage reçu du client est toujours filtré par la RLS. En phase 0, `getRequestContext()` de `src/adapters` renvoie le contexte simulé (décision 0013 § 3.6) ; B3 le remplace sans changer sa signature.
- **Adaptateur `auth`** (handover front § 17, point 3) : contrat `AuthAdapter` (décision 0017 § 3 : `getAuthAdapter` lit `AUTH_ADAPTER`) ; adaptateur simulé (F8) et adaptateur Better Auth passent la même suite de tests.
- **Emails** : en local et en CI, SMTP vers Mailpit, sans fournisseur externe ; textes des emails dans `src/i18n/fr.json` ; le fournisseur réel relève de Samuel (Q25).
- **Accès administrateur** : aucune interface d'administration au MVP (jugement du Tech Lead) ; quand elle existera, double authentification obligatoire (greffons `admin` et `twoFactor`, cadrage § 9).

---

## § 8. Workflows durables (Tech Lead pour l'exécution, Product Owner pour les règles)

Décision 0009. Pour chaque étape, les tableaux donnent : type (déterministe, IA, appel externe) ; entrée → sortie (contrats stricts de l'étape, identifiants seulement) ; données Google dans l'étape (« oui » interdit pour une étape IA ; une étape « oui » recharge la donnée à l'intérieur et ne la renvoie jamais) ; plafond vérifié avant l'appel (`usage_ledger`) ; relances bornées ; idempotence ; état publié dans `GenerationStatus`.

### Workflows couverts
Les tableaux d'étapes des workflows 1 à 5 passent tous par l'ancrage (workflow 2) ou par la sélection et la validation (workflow 3), dont les entrées et sorties dépendent du statut des données dérivées de Google : ils sont « En attente de Q5 ». Ce qui ne dépend pas de Q5 est fixé ici.
| # | Workflow | Déclencheur | Cible | Fixé ici | En attente de Q5 |
|---|---|---|---|---|---|
| 1 | Recherche et génération de l'aperçu (`generatePreview`, cadrage § 6.5, étapes 1 à 9) | `createTrip` | 8 propositions, moins de 60 s, budget d'appels propre | brief relu et validé (C7) ; plan de recherche et recherche (IA et recherche web, sans donnée Google) ; enregistrement de la version et des cases `noOption` (PO-6) ; arrêt sur plafond | sortie de l'ancrage, sélection, validation |
| 2 | Ancrage (`groundCandidates`) | workflows 1, 4, 5 | résolution « IDs only », puis vérification Place Details, côté serveur, avec la clé serveur (Q3) ; candidat non résolu ou fermé définitivement écarté | appels Google confinés à `src/grounding`, à l'intérieur de l'étape ; `placeId` seul en sortie | forme du résultat d'ancrage en sortie d'étape (Q29, Q44) |
| 3 | Planification et validation (`planDays`, moteur `src/domain`, R1 à R10, au plus une réparation) | workflows 1, 4, 5 | — | squelette, planification et enregistrement déterministes ; un seul appel de réparation | entrée de la sélection, codes de validation, entrée de la réparation (Q44) |
| 4 | Génération du voyage complet (`generateFullTrip`) | droit `tripUnlocked` accordé par le webhook (§ 9) | moins de 3 min, en tâche de fond, une version publiée par jour terminé | démarrage idempotent (un seul workflow par droit) ; jours non générés en `generating` | comme 1 |
| 5 | Recalcul par lot (`batchRecompute`) et révision unitaire | fin du tri, déblocage ; action « Remplacer » | moins de 60 s ; moins de 5 s depuis la réserve, moins de 45 s avec mini-recherche | révision unitaire exécutée dans l'action serveur, sans workflow ; mini-recherche dans un workflow | revérification des candidats de la réserve, codes de validation |
| 6 | Paiement en mode test (`handlePaymentEvent`) | webhook signé | — | tableau ci-dessous | — |

**Arrêt sur plafond ou quota.** Un quota atteint arrête le workflow et conserve le dernier programme valide (test de sortie du cadrage § 9). **Extension signalée** de ce test : le même comportement vaut pour un plafond de coût atteint (plafonds vérifiés avant chaque appel, cadrage § 6.9 et § 9 « Plafonds applicatifs »), et aucune version partielle n'est publiée. L'état publié devient `failed` avec la raison (`cost_cap_reached` ou `quota_reached`) et `retryable` (forme de `GenerationStatus`, décision 0017 § 2.4). « Aucune version partielle » signifie : aucune version contenant un jour à moitié planifié ou qui échoue à la validation. Test nommé `workflows: plafond ou quota atteint conserve le dernier programme valide` (§ 10, tâche B9).

### 6. Paiement en mode test (`handlePaymentEvent`)
| Étape | Type | Entrée → sortie | Données Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| 1 Vérification de la signature | déterministe (route handler) | corps brut et signature → événement vérifié ou refus 400 | non | — | 0 (Stripe relance) | — | — |
| 2 Contrôles, enregistrement et droit, **dans une seule transaction** (`vadrouille_webhook`) | déterministe | événement → ligne `billing` (avec `outcome`), `checkouts.status` et, si les contrôles passent, ligne `entitlements` | non | — | Stripe relance (rien n'est écrit si la transaction échoue) | unique `stripe_event_id` ; unique `(organization_id, trip_id, kind)` (PO-4) ; un doublon ne réécrit rien et passe à l'étape 3 | — |
| 3 Reprise et suite | appel interne | identifiant du droit → démarrage du workflow 4 | non | — | 3, puis réconciliation | un seul workflow par droit ; exécuté aussi pour un événement déjà enregistré (reprise idempotente) | `queued` |

### Exécution durable et portabilité
Vercel Workflows (cadrage D7) par le Workflow SDK, isolé derrière `src/workflows/index.ts` ; monde local en développement et en CI, monde Vercel en staging, monde Postgres (schéma `workflow` de notre base UE) en repli. État des étapes : dans le monde choisi. Remplacement hors Vercel : changement de monde par configuration, sans toucher aux étapes (décision 0002). Région de l'état du monde Vercel : à vérifier par B9 ; si elle est hors UE, la question remonte à Samuel (Q28). Le prototype P0 (ia-recherche) alimente ce chapitre sans être recopié.

### État persistant des workflows
Les entrées et sorties d'étapes sont sérialisées et conservées par le moteur d'exécution durable : elles sont traitées comme un stockage durable. Règle (décision 0009) : elles ne contiennent que des identifiants internes (organisation, voyage, version, exécution, candidat), des `placeId`, des compteurs et des codes d'erreur. Jamais de donnée Google : horaires, prix, statut brut, note, adresse, photo, téléphone, coordonnées, durée, distance ou matrice de Routes API. Jamais le brief ni un texte libre. **Erreurs normalisées** : une erreur de fournisseur ou de base est convertie, à l'intérieur de l'étape, en un code d'une énumération fermée (`API_ERROR_CODES` ou codes d'étape typés) et en `retryable` ; ni message, ni pile, ni corps de réponse d'un fournisseur (qui peuvent contenir un fragment de prompt, du brief ou une donnée Google) ne sortent de l'étape ni n'entrent dans `research_runs.errors`. Une étape qui a besoin d'une donnée Google la recharge côté serveur à l'intérieur de l'étape et ne la renvoie pas. Les contrats d'entrée et de sortie de chaque étape sont des types maison stricts sans champ pour ces données. Ce qu'une étape d'ancrage peut ajouter à cette liste (verdict, date de contrôle) attend Q5 (Q29, Q44) ; d'ici là, rien.

Test nommé `workflows: aucune donnée Google dans l'état sérialisé` : pour chaque étape, l'entrée et la sortie sérialisées sont validées par leur contrat strict ; les champs d'erreur ne prennent que des valeurs de l'énumération (une erreur de fournisseur simulée dont le message contient un nom de lieu et une adresse ne laisse que son code) ; aucune clé interdite n'apparaît, à aucun niveau : `rating`, `userRatingCount`, `openingHours`, `regularOpeningHours`, `currentOpeningHours`, `businessStatus`, `priceLevel`, `photos`, `phone`, `nationalPhoneNumber`, `internationalPhoneNumber`, `address`, `formattedAddress`, `displayName`, `reviews`, `lat`, `lng`, `latitude`, `longitude`, `location`, `viewport`, `duration`, `staticDuration`, `distanceMeters`, `polyline`.

---

## § 9. Paiement en mode test

Phase 0 : la décision 0020 a livré l'écran 9 avec un adaptateur de paiement simulé en mémoire (`PaymentAdapter`, `PaymentSimulator`, `src/server/config/offer.ts`). Ce chapitre décrit le paiement serveur de B4, qui suit les mêmes contrats.

- **Stripe Checkout**, TWINT et carte (cadrage § 6.4) : la session de paiement est créée côté serveur par `startCheckout`, avec `price_data` construit depuis la configuration (`src/server/config/offer.ts`, 29 CHF, Q2, jamais en dur), montant en centimes (`2900`) et devise `CHF` dans les données ; moyens `card` et `twint` ; métadonnées `checkoutId` ; ligne `checkouts` écrite avant la redirection, avec l'instantané du prix (décision 0020 § 1.3).
- **Webhook** `/api/v1/webhooks/stripe` : corps brut lu tel quel, signature vérifiée avec le secret de signature (`STRIPE_WEBHOOK_SECRET`) ; une signature invalide renvoie 400 sans rien écrire. Événements traités : `checkout.session.completed` et `checkout.session.async_payment_succeeded` ; les autres sont enregistrés (`outcome = ignored`) sans effet. Remboursement et litige (`charge.refunded`, `charge.dispute.created`) : enregistrés `ignored` avec une alerte sans donnée personnelle ; leur effet sur le droit suit Q129 (Samuel).
- **Une seule transaction** (décision 0007, rôle `vadrouille_webhook`) : organisation retrouvée par `checkout_organization` ; contrôles ; insertion dans `billing` ; mise à jour de `checkouts.status` ; si les contrôles passent, insertion du droit `tripUnlocked` dans `entitlements` ; validation. Une panne avant la validation n'écrit rien : Stripe rejoue et l'événement est traité comme neuf. Il n'existe donc jamais de ligne `billing` « traitée » sans le droit correspondant.
- **Contrôles avant tout droit**, chacun contre la ligne `checkouts` (jamais contre les métadonnées seules) : `livemode = false` (le mode test seul est accepté tant que Samuel n'a pas décidé la mise en production) ; `payment_status = paid` ; `amount_total` égal à `checkouts.amount_cents` ; devise égale à `checkouts.currency` (comparaison sans casse : Stripe écrit `chf`) ; identifiant de session Stripe égal à `checkouts.stripe_checkout_session_id` et métadonnée `checkoutId` cohérente ; voyage `checkouts.trip_id` appartenant à l'organisation retrouvée (clé composite `(organization_id, trip_id)` et lecture sous RLS). Un contrôle en échec enregistre `outcome = rejected` avec son code, n'accorde rien, renvoie 200 (inutile que Stripe rejoue) et produit une alerte sans donnée personnelle.
- **Session Stripe inconnue** (aucune ligne `checkouts` pour `stripe_checkout_session_id` : `checkout_organization` ne renvoie rien) : aucune organisation, donc aucune ligne `billing` possible (`organization_id NOT NULL`, RLS) ; la transaction n'écrit rien, n'accorde rien, renvoie 200 et produit une alerte sans donnée personnelle (identifiant d'événement, type, code `unknown_checkout`). Un paiement réellement encaissé dans ce cas se règle à la main sur l'alerte ; le remboursement suit Q129 (Samuel, argent). Test `paiement: un événement d'une session inconnue n'écrit rien, n'accorde rien et alerte`.
- **Idempotence et reprise** : `stripe_event_id` unique ; un événement déjà reçu ne réécrit rien, mais l'étape « suite » est rejouée : si le droit existe sans workflow 4 démarré, celui-ci est démarré (un seul par droit). Une réconciliation au chargement de `Trip.unlocked` fait de même. Le droit `tripUnlocked` est unique par voyage : un second paiement du même voyage ne crée pas un second droit (PO-4, `outcome = alreadyGranted` ; remboursement : Q129). La décision 0020 garde, pour le simulé, sa machine d'états ; B4 y ajoute la déduplication par identifiant d'événement.
- **Le droit « voyage débloqué » n'est accordé que par le webhook** vérifié. La page de retour après paiement n'accorde rien : elle attend le droit (lecture de `Trip.unlocked` ou `CheckoutStatus`). Adresses de retour construites depuis `APP_URL`, jamais depuis la requête.
- L'organisation est celle de la ligne `checkouts`, retrouvée par `checkout_organization` (décision 0007), jamais crue depuis les métadonnées seules. `vadrouille_app` ne peut écrire ni dans `billing` ni dans `entitlements`.
- **Clés de test uniquement**, et seulement quand Samuel aura ouvert le compte (Q26). `src/server/env.ts` refuse de démarrer avec une clé Stripe de production (§ 2).
- **Paiement simulé côté serveur** (B4, jusqu'à l'ouverture du compte) : même contrat (`PaymentAdapter`), webhook simulé `/api/v1/webhooks/simulated` traité par le même code (signature, contrôles, transaction, idempotence, droit). **Fermé par défaut** : la route répond 404 sauf si `SIMULATED_WEBHOOK_ENABLED=true` ; activée en local et en CI seulement par défaut ; sur un déploiement accessible sur Internet seulement selon la réponse de Samuel à Q131, puis refermée ; **jamais sur un déploiement de production** (refus au démarrage, `isProductionDeployment`). Secret `SIMULATED_WEBHOOK_SECRET` hors dépôt, au moins 32 octets aléatoires, distinct par environnement.
- **Tests de B4** : `paiement: un événement rejoué ne crédite pas deux fois`, `paiement: signature invalide refusée sans écriture`, `paiement: le droit n'est accordé que par le webhook`, `paiement: prix lu dans la configuration`, `paiement: statut, montant, devise, mode ou voyage incohérents n'accordent rien`, `paiement: une panne entre l'enregistrement et le droit ne perd pas le paiement` (panne injectée après l'insertion dans `billing` : rien n'est validé ; le rejeu accorde le droit une fois), `paiement: un événement déjà enregistré relance la suite manquante`, `paiement: un événement d'une session inconnue n'écrit rien, n'accorde rien et alerte`, `paiement: webhook simulé fermé par défaut et en production`.

---

## § 10. Règles Google

Reprise du cadrage § 6.5 et du handover front § 8 ; chaque règle a son test nommé et sa tâche. Les règles qui dépendent de Q5 (statut des données dérivées, cache de coordonnées) sont dans « En attente de Q5 ».
| Règle | Test nommé | Tâche |
|---|---|---|
| Seul `placeId` est stocké durablement ; aucune colonne de contenu Google (§ 6) | `schéma: aucune colonne de contenu Google` | B1 |
| Aucune colonne dérivée de Google (verdict, date de contrôle, durée de trajet) tant que Samuel n'a pas répondu à Q5 | `schéma: aucune colonne dérivée de Google` | B1 |
| L'instantané d'une version ne contient ni durée de trajet ni date de contrôle | `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` | B2 |
| L'état persistant des workflows ne contient que des identifiants, des `placeId`, des compteurs et des codes d'erreur ; jamais de donnée Google, de coordonnées ni de durée | `workflows: aucune donnée Google dans l'état sérialisé` | B9 |
| Un plafond de coût ou un quota atteint conserve le dernier programme valide, sans version partielle publiée (extension signalée du test de sortie du cadrage § 9) | `workflows: plafond ou quota atteint conserve le dernier programme valide` | B9 |
| Aucun prompt ne contient de donnée Google : le constructeur de prompts (`src/ai`) n'accepte que des types maison (identifiants internes, résumés de notre recherche web) ; un test parcourt les prompts journalisés | `prompts: aucun prompt journalisé ne contient de donnée Google` | B7 |
| Aucun jeu d'évaluation (`evals/`) ne contient de donnée Google | `evals: aucune donnée Google dans les jeux d'évaluation` | B7 |
| Données de lieux affichées seulement avec la carte Google ou la mention « Données de lieux : Google » (`PlaceDetails`, `PlaceSearchResult`, `DayMap`, vue partagée) | `affichage: données de lieux Google avec la carte ou l'attribution` | B11 (fiche, ajout), B12 (vue partagée) |
| Clé serveur distincte de la clé navigateur, jamais `NEXT_PUBLIC_`, lue seulement par `src/grounding` ; sa restriction par API se règle dans la console Google (Samuel, § 14) | `clés: clé serveur distincte et confinée à src/grounding` | B8 |
| `Stop.name` n'est jamais écrit depuis le `displayName` Google, y compris pour un lieu ajouté par la recherche | `révision: aucun nom Google écrit dans Stop.name` | B11 |
| Le champ « Nom dans ton programme » n'est **jamais prérempli** par le nom Google d'un résultat (`displayName`), ni par copie automatique : prérempli seulement par un nom maison (`suggestedName`, nom d'une idée « Surprends-moi »), vide sinon (F7-PO-10) ; seule une saisie de la personne peut y mettre ce nom | `ajouter: le nom n'est jamais prérempli par le nom Google` (test d'interface : résultat simulé avec un `displayName` et sans `suggestedName`, champ vide ; avec les deux, champ égal à `suggestedName`) | F7c (interface), rejoué par B11 avec l'adaptateur `api` |

---

## § 11. Adaptateurs `src/adapters`

- **`api`** : implémente `TripAdapter` et ses extensions (évolution E7) côté serveur, en appelant les cas d'usage de `src/server` dans le même processus (aucun appel HTTP vers soi-même) ; chaque sortie est validée par son contrat, comme l'adaptateur `mock`. `getTripReader` (décision 0020 § 3) renvoie l'adaptateur de base tel quel dès que le paiement n'est plus simulé.
- **`auth`** : contrat `AuthAdapter` (décision 0017 § 3) ; `mock` (F8) et `better-auth` (B3).
- **`payment`** : contrat `PaymentAdapter` (décision 0020 § 2) ; `mock` (en mémoire, phase 0), `simulated` (serveur, § 9, ajouté par B4), `stripe` (clés de test).
- **Choix** par variables serveur : `DATA_ADAPTER` (`mock`, `api`), `AUTH_ADAPTER` (`mock`, `better-auth`), `PAYMENT_ADAPTER` (`mock`, `simulated`, `stripe`) ; valeur inconnue = erreur au démarrage (comme `getTripAdapter`). Les gardes de phase 0 (`paymentAvailable`, `paymentDemoAllowed`, décision 0020 § 2.3) restent en place pour `mock`.
- **Suite de contrat commune** : une même suite de tests (`src/adapters/contract.suite.ts`) exécutée sur `mock` et sur `api` (base de test) : formes des sorties, `null` ou liste vide pour un voyage d'une autre organisation (isolation), versions et conflits. Test nommé `adaptateurs: mock et api passent la même suite de contrat` (B6).

---

## § 12. Sécurité et conformité

**Modèle de menace.** Les rôles Postgres séparés (décision 0007) protègent contre les **erreurs** de code (une requête sans contexte, un `DELETE` oublié, une fonction appelée hors de son cas d'usage) et contre l'abus des points d'entrée exposés (webhooks, vue partagée, limiteurs). Ils ne protègent pas contre une **compromission** du processus serveur : `vadrouille_app` peut prendre les rôles `vadrouille_webhook`, `vadrouille_account_admin`, `vadrouille_share` et `vadrouille_limiter` par `SET LOCAL ROLE` et poser lui-même `app.organization_id`. Des identifiants de connexion distincts par rôle sont une évolution possible, à décider par le Tech Lead si un besoin apparaît (hors MVP).

**Tests de sortie du cadrage § 9**
| Test de sortie | Test nommé | Tâche |
|---|---|---|
| Un compte d'une organisation ne peut ni consulter ni modifier les voyages d'une autre | `isolation: une organisation ne lit ni ne modifie les voyages d'une autre` | B1 (base), B6 (adaptateur `api`) |
| Un lien révoqué n'ouvre plus le voyage | `partage: un lien révoqué ou expiré n'ouvre plus le voyage` | B1 (vues), B12 |
| Un paiement répété ne crédite pas deux fois | `paiement: un événement rejoué ne crédite pas deux fois` | B4 |
| Une étape verrouillée est conservée | `moteur: une étape verrouillée est conservée` | B5 |
| Une révision obsolète ne remplace pas silencieusement une version récente | `versions: une révision obsolète est refusée explicitement` | B5 |
| Une page web contenant des instructions ne modifie pas le comportement de l'agent | `recherche: une page contenant des instructions ne modifie pas l'agent` | B7 |
| Aucun prompt journalisé ne contient de donnée Google | `prompts: aucun prompt journalisé ne contient de donnée Google` | B7 |
| Une erreur de fournisseur est visible et récupérable | `workflows: une erreur de fournisseur est visible et récupérable` | B9 |
| Un dépassement de quota conserve le dernier programme valide (étendu au plafond de coût) | `workflows: plafond ou quota atteint conserve le dernier programme valide` | B9 |

**Autres exigences**
- Contenu web traité comme des données : pages insérées dans des blocs délimités, jamais comme instructions ; sorties validées par schéma ; aucun outil d'écriture pour les modèles (cadrage § 9).
- **Adresses issues du web** (`Source.url`, `ChecklistItem.bookingUrl`, `event_occurrences.source_url`) : `https:` seulement, refusées sinon par le schéma (raffinement ajouté par B2) et par une contrainte `CHECK` en base ; l'interface les ouvre avec `rel="noopener noreferrer"`. Test `contrats: aucune adresse autre que https` (B2).
- Lecture de pages : d'abord l'outil du fournisseur de modèle ; sinon le lecteur de `src/research`, protégé contre la SSRF : `http` et `https` seulement, ports 80 et 443 seulement ; aucune information d'identification dans l'adresse (`user:pass@` refusé) ; formes d'adresse alternatives refusées (IPv4 décimale, octale ou hexadécimale, IPv4 abrégée, IPv6 avec IPv4 intégrée, `0.0.0.0`) ; résolution DNS contrôlée (refus des adresses privées, de boucle locale, de lien local, de multidiffusion et de métadonnées) et **connexion à l'adresse validée elle-même** (pas de seconde résolution : parade au rebinding DNS) ; contrôle répété à chaque redirection (3 au plus) ; délai de 10 s ; taille de 2 Mo mesurée **après décompression** ; types de contenu admis : `text/html`, `application/xhtml+xml`, `text/plain` ; aucun cookie. Tests `recherche: le lecteur de pages refuse les adresses internes` et `recherche: le lecteur de pages refuse les formes d'adresse alternatives, les ports non standard et les réponses trop grosses après décompression` (B7).
- L'agent de recherche ne reçoit du brief que ce qui est nécessaire (destination, dates, envies, rythme ; jamais d'email). Le récit libre de l'écran 2 est envoyé tel quel au fournisseur de modèles pour la structuration (`structureBrief`) : on ne peut pas garantir qu'il ne contienne aucun nom. La mention d'information à l'écran 2 est une question pour Samuel (§ 17, nouvelle question 1).
- Journaux structurés sans donnée personnelle inutile : ni email, ni récit libre, ni code de connexion, ni jeton ; liste de champs masqués dans `src/server` ; test `journaux: aucun email ni code dans les journaux` (B3).
- Inventaire des données personnelles par table : colonne « Données personnelles » du § 6, reprise dans la politique de confidentialité (Samuel).
- Export et suppression des données (cadrage § 3.5) : B11. `deleteAccount`, réservé au propriétaire, est **idempotent et reprenable** ; il suit ces étapes :
  1. **Marque et purge métier** (une transaction `withOrg`, `SET LOCAL ROLE vadrouille_account_admin`) : `purge_organization_data` (décision 0007) pose `organizations.deletion_requested_at` s'il est nul (état « suppression en cours »), puis supprime les données métier de l'organisation personnelle, **sauf `billing` et `usage_ledger` tant que Q48 est ouverte** (pièces comptables et registre des coûts : leur sort est une décision de Samuel). Rejouée, elle ne trouve plus rien à supprimer et ne lève pas d'erreur.
  2. **Authentification** (depuis `src/server/account/delete.ts` seulement, par `vadrouille_auth`) : `sessions`, `accounts`, `verifications` (par identifiant email), entrées de `rate_limits` sous la clé HMAC de son email, adhésions, puis `users`. Chaque suppression vise des lignes qui peuvent déjà manquer : rejouer l'étape est sans effet. Les entrées de `rate_limits` et `action_rate_limits` sous la clé HMAC d'une adresse IP ne sont rattachées à aucun compte ; elles disparaissent avec leur fenêtre (une journée au plus).
  3. **Organisation** : tant que Q48 est ouverte, la ligne `organizations` **n'est pas supprimée** : elle reste en état « suppression en cours », sans adhésion ni donnée personnelle (nom et `slug` neutres), parce que `billing.organization_id` et `usage_ledger.organization_id` la référencent (`ON DELETE RESTRICT` : jamais de cascade sur les pièces). Sa suppression finale, avec ou sans les pièces, suit la réponse de Samuel à Q48. L'invariant « exactement un propriétaire » ne s'applique pas à une organisation en suppression (décision 0007).
  4. **Reprise** : une panne entre les étapes laisse l'organisation en état « suppression en cours ». `getRequestContext()` refuse toute session d'une organisation dans cet état (`unauthenticated`, aucune lecture ni écriture métier). La reprise ne demande donc pas de contexte : `deleteAccount` relance lui-même les étapes manquantes en cas d'erreur, et une vérification de code réussie pour une personne dont l'organisation personnelle est en suppression reprend l'étape 2 au lieu d'ouvrir une session.
  5. Les journaux suivent la durée de conservation fixée par Samuel (Q27).
  Une organisation qui a d'autres membres n'est pas purgée : seule l'adhésion de la personne est retirée (cas hors MVP, PO-3). Tests (B11) : `compte: la suppression efface les données métier et d'authentification` (et laisse `billing` et `usage_ledger` intacts tant que Q48 est ouverte), `compte: une suppression interrompue reprend sans erreur ni doublon` (panne injectée entre les étapes 1 et 2, puis entre les suppressions de l'étape 2 : la relance termine, la session restante est refusée entre-temps).
- **Vue partagée** `/p/[token]` : en-têtes `Referrer-Policy: strict-origin` sur `/p/*` (l'origine seule est envoyée, jamais le chemin qui porte le jeton, et rien en cas de passage de `https` à `http` ; `no-referrer` n'est pas retenu : il supprimerait le référent dont la restriction de la clé navigateur Google par référents HTTP a besoin pour la carte de la vue partagée), `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` ; liens sortants avec `rel="noopener noreferrer"` ; limite par adresse IP (`action_rate_limits`) ; lecture par les vues partagées seulement, qui exigent un jeton valide (décision 0007) et projettent une **liste blanche de clés** de l'instantané (`shared_trip_version` : jamais la colonne `snapshot` telle quelle ; ni `patch`, ni étiquette de logement des `terminus` tant que Q50 n'est pas tranchée), réponse validée par un `SharedTripSchema` strict ; aucune information de logement tant que Q50 n'est pas tranchée ; `getPlaceDetails` appelé en anonyme depuis la vue partagée passe par les plafonds et la limite par adresse. **Jeton dans les journaux** : le jeton en clair est dans le chemin de l'adresse, donc dans les journaux d'accès de la plateforme d'hébergement et de tout intermédiaire ; nos journaux applicatifs le masquent (liste des champs masqués). Sa durée de vie dans les journaux de la plateforme est à couvrir par la politique de conservation (Q27, Samuel) ; un lien révoqué ou expiré n'ouvre plus rien, même relu dans un journal. Tests `partage: en-têtes de confidentialité et limite par adresse` (dont `Referrer-Policy: strict-origin` sur `/p/*`) et `vues partagées: l'instantané partagé ne contient que les clés de la liste blanche` (instantané de test avec une clé en trop et une étiquette de logement : absentes de la vue) (B1 pour la vue, B12 pour la route).
- **Sauvegardes et retour arrière** : sauvegardes de la base, test de restauration et procédure de retour arrière d'une migration : pas de conception ici, car elles dépendent du fournisseur (Q24, Samuel). Critère de B1 : procédure écrite de retour arrière des migrations ; test de restauration à faire sur la base de staging dès que Q24 est tranchée.
- **Durées de conservation** (voyages, briefs, comptes, journaux, limiteur) : renvoyées à Samuel (Q27) ; les limiteurs (`rate_limits` et `action_rate_limits`) purgent leurs fenêtres expirées (donnée technique, sans valeur après la fenêtre ; ce n'est pas une durée de conservation) ; aucune autre purge automatique avant sa décision. À couvrir par Q27 : les journaux de la plateforme qui contiennent l'adresse `/p/[token]` et les requêtes de `research_runs.queries`.
- Secrets côté serveur seulement ; séparation test et production ; aucune clé de production (garde de `src/server/env.ts`, § 2).

---

## § 13. Observabilité et coûts

- **`usage_ledger`** : une ligne par appel payant (fournisseur, SKU, unités, coût estimé en micro-USD), écrite par `src/ai` et `src/grounding`.
- **Plafonds** vérifiés avant chaque appel : par génération (aperçu, voyage complet, mini-recherche), par organisation et par jour, et un plafond global quotidien des actions sans compte (écrans 2 et 3). Valeurs dans la configuration ; les montants engagent de l'argent : valeurs de départ proposées par le Tech Lead d'après le cadrage § 4 (aperçu 1 USD, voyage complet 6 USD, seuil d'alerte du cadrage § 12), **à valider par Samuel** (Q39, Q45).
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
| Clé serveur Google Places/Routes | Ancrage, recherche de lieux et trajets côté serveur, restreinte par API | facturation suisse (cadrage D4) | quotas gratuits puis 60 CHF au plus | à décider par Samuel (Q3, avec P0) |
| Fournisseurs de modèles (Anthropic ; Google Gemini pour la comparaison de P0) | Brief, recherche, sélection, réparation | selon le fournisseur (à vérifier) ; critère proposé : aucun entraînement sur nos données, contrat de sous-traitance | 200 CHF au plus (IA et recherche web) | à décider par Samuel (Q9 pour Gemini ; Q46) |
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

### Décisions du Tech Lead (`docs/decisions/`, statut « proposé », définitives sans veto de Samuel avant le 2026-10-13)
Rédigées le 2026-10-08 dans #27, reprises le 2026-10-11 sans leurs parties qui dépendent de Q5. L'accord tacite sous veto ne vaut que pour leur partie technique : il **ne couvre pas les aspects juridiques** (conservation et purge des données : Q27, Q48), qui restent soumis à une décision écrite de Samuel. La décision 0011 (verdicts d'ancrage) reste dans #27, « En attente de Q5 ».
| Décision | Objet |
|---|---|
| 0006 | Stack serveur : actions serveur, Drizzle ORM 0.45.4, drizzle-kit 0.31.11, `pg` 8.23.1, Postgres 17 en conteneur local et en CI |
| 0007 | RLS : rôles dédiés (dont `vadrouille_webhook`, `vadrouille_account_admin`, `vadrouille_limiter`), droits par table, contexte de transaction, fonctions `SECURITY DEFINER` et vues partagées possédées par des rôles `vadrouille_fn_*` sans membre, vues partagées à jeton, purge limitée à l'organisation courante et au propriétaire, ajout seulement (`trip_versions`, `billing`, `usage_ledger`) |
| 0008 | Better Auth 1.7.7 : aucune route exposée, opérations en liste blanche appelées côté serveur, droits de `vadrouille_auth` par table, code à 6 chiffres, limitation des envois et des vérifications, rôles, un seul propriétaire, organisation personnelle, contexte de session, secret, Mailpit |
| 0009 | Exécution durable : Workflow SDK isolé, état réduit aux identifiants, mondes local, Vercel et Postgres, région de l'état à vérifier (Q28) |
| 0010 | Répartition des champs (Q14) hors Q5, `Stop.name` jamais tiré de Google, instantané dérivé de `TripSchema`, formes de PO-2 et PO-6 |

### Backlog (ordre de construction du cadrage § 7)
| # | Tâche | Rôle | Prérequis | Critères d'acceptation |
|---|---|---|---|---|
| B1 | Socle base de données : Docker Compose et conteneur CI Postgres 17, Drizzle, migrations, rôles, RLS, tables du § 6 (sauf `place_memory`), fonctions `resolve_share_link`, `checkout_organization`, `purge_organization_data`, vues partagées, table `action_rate_limits`, paquet `server-only` — après G0 | data | G0, B0 ; Q24 seulement pour la base de staging ; Q40 pour l'exécution locale | `pnpm test:db` dans `pnpm verify` et en CI ; tests `schéma: RLS activée et forcée partout`, `isolation: une organisation ne lit ni ne modifie les voyages d'une autre`, `rôles: aucun rôle ne contourne la RLS` (tous les rôles de la décision 0007), `fonctions: SECURITY DEFINER durcies`, `vues partagées: lecture seulement avec un jeton valide`, `vues partagées: l'instantané partagé ne contient que les clés de la liste blanche`, `purge: vadrouille_app ne peut pas purger une autre organisation`, `schéma: les JSONB refusent les clés hors contrat`, `versions: trip_versions est en ajout seulement`, `registres: billing et usage_ledger sont en ajout seulement`, `organisations: exactement un propriétaire`, `schéma: aucune colonne de contenu Google`, `schéma: aucune colonne dérivée de Google` verts ; procédure écrite de retour arrière des migrations |
| B2 | Évolutions des contrats E1 à E7, E9 et E10 et contrats communs (`TripPatch`, `PatchResult`, `TripSnapshot`, `ChecklistMoment`, `StopFacts`, `ProposalNeighbours`, `PreviewSlot`), raffinement `https:` des adresses, mocks et composants adaptés — après G0 | backend | G0, B0, F1 ; composants concernés livrés ou adaptés dans leur tâche ; Q42 pour « [Au plus tôt] » | Script du critère § 5 de B0 rejoué sur les nouveaux contrats (une catégorie par champ) ; `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` ; `contrats: aucune adresse autre que https` ; `ChecklistItemSchema` refuse un texte libre dans `when` ; un aperçu de moins de 8 propositions renvoie des cases `noOption` ; aucun texte d'interface dans les données simulées ; `pnpm verify` vert |
| B3 | Authentification Better Auth et organisations (§ 7), adaptateur `auth`, Mailpit en local et en CI — après G0 | backend | B1, B2, F8b ; Q25 seulement pour l'envoi réel ; Q86 pour les seuils | Tests `auth: code à 6 chiffres valable 10 minutes, 3 essais`, `auth: aucune route /api/auth n'est exposée`, `auth: seules les opérations de la liste blanche sont appelées`, `auth: limitation des envois` (en-têtes d'IP forgés, variantes de casse et d'alias `+`), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`, `env: gardes de configuration` (environnement absent : refus ; inconnu : production), `auth: aucune adresse IP ni email en clair dans rate_limits`, `auth: deux adresses qui ne diffèrent que par l'alias + sont deux comptes distincts`, `auth: organisation personnelle créée à la première connexion`, `auth: le contexte vient de la session, jamais du client`, `journaux: aucun email ni code dans les journaux` ; en-tête d'IP de confiance de Vercel confirmé (documentation et essai sur staging) et noté dans la décision 0008 ; IP et agent utilisateur absents de `sessions` (sinon Q47) ; **bloquant** : jetons de session hachés en base, vérifiés et notés dans 0008, sinon parade décidée par le Tech Lead et test `auth: aucun jeton de session en clair dans sessions` avant la fusion ; scénario e2e de connexion avec le code lu dans Mailpit |
| B4 | Paiement en mode test (§ 9) : adaptateur simulé serveur, webhook signé et idempotent, droits ; Stripe quand Samuel aura ouvert le compte — après G0 | backend | B1, B3 ; Q26 pour Stripe ; Q129 pour les remboursements ; Q131 pour l'ouverture du simulé sur Internet | Tests du § 9 (dont `paiement: statut, montant, devise, mode ou voyage incohérents n'accordent rien`, `paiement: une panne entre l'enregistrement et le droit ne perd pas le paiement`, `paiement: un événement déjà enregistré relance la suite manquante`, `paiement: un événement d'une session inconnue n'écrit rien, n'accorde rien et alerte`, `paiement: webhook simulé fermé par défaut et en production`) ; PO-4 vérifiée (second paiement sans second droit) ; adresses de retour depuis `APP_URL` ; version de `stripe` notée dans un amendement de 0006 |
| B5 | Moteur sans IA (`src/domain`) : modèle, squelette, planificateur, validateurs R1 à R10, patches, versions, annulation (PO-5), budget de trajet (PO-1) — après G0 | backend | B2 | R1 à R10 testées à 100 % sur des données de test ; `moteur: une étape verrouillée est conservée`, `versions: une révision obsolète est refusée explicitement`, `moteur: budget réduit 60 → 45, 90 → 65, 150 → 110, une seule fois`, `versions: annuler crée une version identique` ; règle ESLint « `src/domain` sans entrée-sortie » et son test ; `ApiError.currentVersion` |
| B6 | API de lecture et adaptateur `api` (Séjour, Journée, Mes voyages) sur données de test, actions serveur de base, suite de contrat commune — après G0 | backend | B1, B2, B3, B5 | `adaptateurs: mock et api passent la même suite de contrat` ; `isolation: une organisation ne lit ni ne modifie les voyages d'une autre` rejoué par l'adaptateur `api` ; `not_found` pour une autre organisation ; écrans 11 et 12 fonctionnent avec `DATA_ADAPTER=api` sans changement d'interface |
| B7 | Couche IA et recherche bornée (`src/ai`, `src/research`), constructeur de prompts typé, lecteur de pages protégé, `usage_ledger`, jeu d'évaluation — après G0 | ia-recherche | B1, B2, P0 ; Q9 pour la comparaison Gemini ; Q46 pour un fournisseur réel | `prompts: aucun prompt journalisé ne contient de donnée Google`, `evals: aucune donnée Google dans les jeux d'évaluation`, `recherche: une page contenant des instructions ne modifie pas l'agent`, `recherche: le lecteur de pages refuse les adresses internes`, `recherche: le lecteur de pages refuse les formes d'adresse alternatives, les ports non standard et les réponses trop grosses après décompression`, `traces: aucun prompt ni brief dans les attributs exportés` ; règles ESLint en liste blanche pour `src/ai`, `src/research`, `src/domain` et leurs tests ; version des SDK de modèles notée dans un amendement de 0006 |
| B8 | Ancrage et trajets (`src/grounding`) — après G0 | ia-recherche | B1, B7 ; Q3 (clé serveur Places/Routes, Samuel) ; **Q5** (forme du résultat d'ancrage, cache de coordonnées : Q29, Q34, Q44) | `clés: clé serveur distincte et confinée à src/grounding` ; le reste des critères est écrit avec la partie « En attente de Q5 » |
| B9 | Workflows de génération (§ 8), `GenerationStatus`, aperçu en `PreviewSlot`, plafonds, actions `structureBrief`, `suggestLodging`, `createTrip` côté serveur — après G0 | backend | B4, B5, B7, B8 ; **Q5** pour les étapes d'ancrage, de sélection et de validation ; Q39, Q45 ; Q135 | `workflows: aucune donnée Google dans l'état sérialisé`, `workflows: plafond ou quota atteint conserve le dernier programme valide`, `workflows: une erreur de fournisseur est visible et récupérable`, `workflows: une relance ne double aucune écriture`, `limitation: une adresse seule n'épuise pas le plafond global des actions sans compte` ; région de l'état du monde Vercel vérifiée et notée (Q28) ; aperçu en moins de 60 s sur Édimbourg (mesure) |
| B10 | Présentation, signaux, questions de préférence (2 refus), préférences déduites (3 « j'aime »), réduction de trajet (PO-1), recalcul par lot, déblocage, `AdjustmentSummary` — après G0 | backend | B9 ; Q41 | `préférences: aucune généralisation sans réponse` ; la deuxième réponse « oui » à la question de trajet ne réduit pas une seconde fois ; décisions idempotentes par `requestId`, `choose` et `nextOption` compris ; recalcul par lot en moins de 60 s |
| B11 | Révision : remplacer, ajouter, déplacer, verrouiller, annuler, liste à réserver, fiche (`PlaceDetails`), signalement, export et suppression du compte — après G0 | backend | B6, B9 ; Q48 pour `billing` ; Q90 pour l'affichage du nom Google | Révision depuis la réserve en moins de 5 s ; `versions: une révision obsolète est refusée explicitement` rejoué par les actions ; `affichage: données de lieux Google avec la carte ou l'attribution`, `révision: aucun nom Google écrit dans Stop.name`, `ajouter: le nom n'est jamais prérempli par le nom Google` rejoué sur l'adaptateur `api`, `compte: la suppression efface les données métier et d'authentification` (sans toucher `billing` ni `usage_ledger` tant que Q48 est ouverte), `compte: une suppression interrompue reprend sans erreur ni doublon` |
| B12 | Pendant et après le voyage : écran 15 sur l'adaptateur `api` (jours projetés, F10-TL-2, sans contrat `Today`), avis, mémoire des goûts sur accord, liens privés (PO-7) — après G0 | backend | B6, B11 ; Q50 ; Q150, Q151 pour l'après-voyage | `partage: un lien révoqué ou expiré n'ouvre plus le voyage`, `partage: en-têtes de confidentialité et limite par adresse` (`Referrer-Policy: strict-origin` sur `/p/*`) ; lecture par les seules vues partagées, en liste blanche de clés ; un nouveau lien révoque le précédent ; expiration à la fin du voyage + 30 jours ; vue partagée en lecture seule (aucune action accessible) ; préférences entre voyages seulement avec accord |

---

## § 16. Hors périmètre

- Tout code, migration, workflow ou adaptateur `api` dans B0 : tâches B1 et suivantes, après G0.
- Ouverture de tout compte ou service payant ; toute clé, même de test, tant que Samuel ne l'a pas fournie ; toute mise en production.
- Vercel KV, Edge Config et toute API propre à Vercel dans le code métier : interdits (décision 0002).
- La réponse juridique aux règles Google (Q5) et tout ce qui en dépend (section « En attente de Q5 ») ; les photos (Q6) ; les prix (Q2 tranchée, révisable par Samuel) ; les durées de conservation des données (Q27).
- Le contenu du prototype de recherche (P0, rôle ia-recherche) ; la mémoire automatique (`place_memory`, bêta) ; la vérification à J-7, l'espace agence, les invitations, la marque blanche (phase 3) ; l'interface d'administration.
- Les modifications de `src/contracts`, `src/mocks` et des composants qu'entraînent Q14, PO-2 et PO-6 : décrites ici, appliquées par B2.

---

## § 17. Questions ouvertes

Questions inscrites dans `QUESTIONS.md` (non tranchées ici) :
- **Q4** (Samuel) : tranchée, Better Auth ; intégration conçue ici (§ 7, décision 0008).
- **Q5** (Samuel, juridique) : statut des données dérivées et de l'interdiction liée à l'IA ; tout ce qui en dépend est dans « En attente de Q5 », avec **Q29**, **Q34**, **Q38** et **Q44**, qui la suivent.
- **Q6** (Samuel) : source des photos ; `Proposal.photoUrl` reste « chargé à la demande, provisoire » au § 5.
- **Q9** (Samuel, dépense) : clé Gemini de P0.
- **Q14** (Tech Lead) : tranchée ici (§ 5, décision 0010), hors champs dépendant de Q5.
- **Q8 et Q22** (Product Owner) : tranchées (PO-1, PO-2).
- **Q17** (Product Owner, partie données) : tranchée par la décision 0015 (évolution E8, faite).
- **Q24** (Samuel) : fournisseur Postgres UE et compte ; bloque la base de staging de B1.
- **Q25** (Samuel) : fournisseur d'envoi des codes ; bloque la connexion réelle (B3).
- **Q26** (Samuel) : compte Stripe en mode test avec TWINT ; bloque le paiement de test réel (B4).
- **Q27** (Samuel) : durées de conservation ; bloque la purge et la politique de confidentialité. Y figurent aussi : les journaux de la plateforme qui contiennent le jeton en clair de `/p/[token]` (§ 12) et `research_runs.queries` (données personnelles indirectes, § 6).
- **Q28** (Tech Lead, puis Samuel si hors UE) : partiellement traitée par la décision 0009 ; région de l'état du monde Vercel à vérifier (B9).
- **Q39, Q45** (Samuel, argent) : plafonds de coût et plafond global des actions sans compte (§ 7, § 13).
- **Q40** (Samuel) : Docker dans les sessions d'agents (B1 en local).
- **Q41** (Product Owner) : réduction de trajet redemandée après annulation (B10).
- **Q42** (Product Owner) : « [Au plus tôt] » dans `ChecklistMoment` (B2).
- **Q46** (Samuel) : engagement des fournisseurs de modèles (B7).
- **Q47** (Samuel, conditionnelle) : IP et agent utilisateur dans les sessions (B3).
- **Q48** (Samuel) : pièces comptables de `billing` (et registre `usage_ledger`) à la suppression de compte (B11) ; d'ici là, la suppression de compte les garde, avec la ligne `organizations` en état « suppression en cours » (§ 12).
- **Q50** (Product Owner) : logement dans la vue partagée (proposition F10-PO-14 : aucun ; B12).
- **Q86** (Tech Lead, Sécurité) : seuils réels de la connexion par code (B3).
- **Q90** (Samuel, suit Q5) : affichage du nom Google d'un résultat de recherche (B11).
- **Q129, Q131, Q135** (Samuel) : remboursement d'un second paiement, paiement simulé sur Internet, aperçu actif après déblocage (B4, B9).

Nouvelles questions de cette version (numérotées par le CEO dans `QUESTIONS.md`) :
1. **Samuel (juridique, données personnelles), avec UX/UI pour le texte** : le récit libre de l'écran 2 part tel quel chez le fournisseur de modèles et peut contenir des noms ou des données personnelles ; faut-il une mention d'information à l'écran 2, et laquelle ? Bloque le branchement d'un fournisseur réel pour `structureBrief` (B9), pas la phase 0.
2. **CEO** : B0a ne remplit pas les critères de la spécification B0 qui dépendent de Q5 (tableaux d'étapes des workflows 1 à 5, catégories des 7 champs dérivés, § 17 sur les verdicts) ; le ticket #22 reste ouvert avec #27. Faut-il un ticket distinct « B0b — partie Q5 » ? Bloque la clôture de #22.

---

## En attente de Q5

Ce qui reste à écrire quand Samuel aura répondu à Q5 (et, à sa suite, à Q29, Q34, Q38 et Q44). La PR #27 garde la rédaction d'origine et les revues Sécurité du 2026-10-08 (bloquants 1 à 3 de la seconde revue) ; ce document n'y apporte aucune réponse juridique.

**§ 5 — catégorie de 7 champs** (aujourd'hui sans catégorie ; aucun n'a de colonne ni de champ d'instantané) :
- `Stop.verifiedAt` (§ 5) : date de notre contrôle d'un lieu, dérivée d'une réponse Google (Q44).
- `SurpriseIdea.verifiedAt` (§ 5) : idem.
- `Stop.exceptions` (§ 5) : `toConfirm` est tiré d'horaires Google (R4) ; `toReserve` et `unconfirmed` n'en dépendent pas, mais le champ est un seul tableau (Q44).
- `Segment.minutes` (§ 5) : durée tirée de Routes API (Q38).
- `Day.travelMinutes` (§ 5) : somme de `Segment.minutes` (Q38).
- `Change[segment].before` (§ 5) : durée de trajet (Q38).
- `Change[segment].after` (§ 5) : durée de trajet (Q38).

**§ 6 — schéma** : colonnes de verdict d'ancrage et de date de contrôle dans `candidates` (Q29) ; colonne `trip_versions.validation_report` (non créée par B1 ; la partie Q5 l'ajoute par migration avec sa garde) et son contenu, `Stop.exceptions` dans l'instantané, avec la contradiction relevée en revue entre une purge ciblée et l'ajout seulement de `trip_versions` (Q44) ; cache serveur des coordonnées (table de 30 jours au plus, cadrage § 6.5, contre la règle de `CLAUDE.md` : Q34) ; `place_memory` (bêta).

**§ 8 — workflows** : tableaux d'étapes des workflows 1 à 5 ; forme du résultat d'ancrage en sortie d'étape (verdicts `compatible`, `écarté`, `fermé définitivement`, date de contrôle) et sa présence dans l'état durable (Q29, Q44) ; entrée de l'étape de sélection (filtre des candidats compatibles) et de l'étape de réparation (codes tirés d'horaires Google et de Routes, envoyés à un modèle : Q44) ; revérification des candidats de la réserve. Décision 0011 (verdicts d'ancrage), restée dans #27.

**§ 10 — règles Google** : statut des données dérivées ; coordonnées et leur purge ; durées de Routes et rafraîchissement des `placeId` de plus de 12 mois ; restriction de la clé navigateur (référents HTTP, Maps JavaScript seule).

**§ 15 — backlog** : critères de B8 et de la partie ancrage, sélection et validation de B9.
