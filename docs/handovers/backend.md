# Handover back-end — Vadrouille (MVP)

Destinataires : les agents `backend`, `data` et `ia-recherche`, et le Tech Lead qui relit leurs PR.
Émetteurs : Tech Lead (architecture, décisions 0006 à 0010) et Product Owner (règles fonctionnelles, décisions PO-1 à PO-7 de `specs/B0-handover-backend.md`). Spécification : `specs/B0-handover-backend.md` (ticket #22).

**Version B0a (2026-10-11, corrections 1 et 2 de la PR #114) : tout le handover sauf ce qui dépend de Q5.** Elle reprend la PR #27 (rédigée le 2026-10-08), découpée par le CEO et le Tech Lead (Q43) en application d'une règle de Samuel du 2026-10-11 (« pour B0, découpe ce qui ne dépend pas de Q5 »). Les passages qui dépendent de la réponse juridique de Samuel sur les données dérivées de Google (Q5, et les questions qui en dépendent : Q29, Q34, Q38, Q44) étaient retirés et listés dans la dernière section, « En attente de Q5 », devenue « Partie Q5 » (PR #27). Cette version est alignée sur les décisions 0013 à 0023 fusionnées depuis.

**Partie Q5 (2026-10-12, PR #27).** Samuel a fixé une règle provisoire pour Q5 (décision 0027, point 4 : « aucune donnée Google dans les prompts, seul l'identifiant de lieu stocké, coordonnées gardées 30 jours au plus » ; validation juridique formelle avant le lancement) et demandé de finaliser #27 sur cette base (Q237). La dernière section, « Partie Q5 », remplace « En attente de Q5 » et applique cette règle (décision 0011). Quand un passage du corps renvoie encore à « En attente de Q5 », la « Partie Q5 » fait foi.

Ce document est le pendant du handover front-end (`docs/handovers/frontend.md`). Il ne contient ni code, ni migration, ni compte, ni clé : il fixe ce qui est décidé, par qui, et comment chaque bloc sera vérifié. Les tâches B1 à B12 qu'il décrit sont ouvertes avant G0 (décision 0029) ; G0 reste la condition de passage de la phase 0. Quand une information manque, l'agent ne l'invente pas : il l'inscrit dans la description de sa PR (le CEO la reporte dans `QUESTIONS.md`).

---

## § 0. À lire en premier

**Mission.** Construire le serveur du MVP : base Postgres multi-organisation, authentification, actions serveur, workflows durables de génération et de révision, paiement en mode test, et l'adaptateur `api` qui remplace l'adaptateur `mock` **sans toucher à l'interface ni aux contrats** sans décision écrite.

**Règles d'or du back-end**

1. **L'agent cherche, l'ancrage vérifie, le moteur planifie** (cadrage § 6.2). Le modèle de sélection choisit parmi des candidats ancrés, par identifiant ; le moteur déterministe (`src/domain`) calcule et valide ; toute écriture passe par le serveur. Aucun composant IA ne dispose d'un outil d'écriture.
2. **Aucune donnée Google** dans un prompt, un journal, une trace ou un jeu d'évaluation ; seul l'identifiant de lieu Google (`placeId`) est stocké durablement. Le sort des données **dérivées** de réponses Google (verdict d'ancrage, y compris l'écart d'un candidat fermé ou introuvable, date de contrôle, durée de trajet, code tiré d'horaires, cache de coordonnées) suit la règle provisoire de Samuel pour Q5 (décision 0027, point 4) : voir « Partie Q5 » et la décision 0011. Aucune colonne, aucun champ d'instantané, aucun état de workflow et aucun prompt ne les porte ; seules les coordonnées peuvent être gardées 30 jours au plus, dans le cache `place_coordinates`. Seule exception pour un prompt : l'appartenance d'un lieu à l'ensemble présenté au modèle (0011 point 1).
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
| C16 | Spécification B0 § 6 : `trip_versions` « en ajout seulement (aucune mise à jour ni suppression autorisée par la base) » ; cadrage § 3.5 (suppression des données du compte) et décision 0007 : `DELETE` sur `trip_versions` par `vadrouille_fn_purge`, à l'intérieur de `purge_organization_data` seulement | Le cadrage § 3.5 (rang 2) prime sur la spécification (rang 3) : la suppression de compte efface l'historique de l'organisation. **Écart signalé** : aucune mise à jour n'est permise, et aucune suppression hors de la fonction de purge (droits et déclencheur, décision 0007 « Ajout seulement ») ; la purge des durées de conservation (Q27) ne passera pas par cette exception |
| C17 | Décisions 0017 § 3.3 et 0020 § 11 : hors de `src/server`, seul `@/server/actions/*` est importable, y compris depuis `src/app` ; § 3 de ce document : route handlers (webhooks, suivi de génération) qui appellent `src/server` | Amendement proposé par la décision 0006 (« Amendement de 0017 § 3.3 et 0020 § 11 ») : les seuls fichiers `src/app/api/**/route.ts` peuvent importer `@/server/routes/*` ; un webhook n'est jamais une action serveur (§ 3) |
| C18 | Décision 0017 § 11.0 : `isProductionDeployment` (l'une des deux variables vaut `production`), sans refus de démarrer ; § 2 de ce document : environnement serveur fermé par défaut | Amendement proposé par la décision 0006 (« Amendement de 0017 § 11.0 ») ; **provisoire** tant que le Tech Lead ne l'a pas approuvé (Q204) : 0017 § 11.0 reste en vigueur pour l'interface et `src/dev/flags.ts` |

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
- Variables d'environnement serveur sans préfixe `NEXT_PUBLIC_`, validées une fois par Zod (`src/server/env/index.ts`, importé sous le nom `@/server/env` ; toute mention de `src/server/env.ts` dans ce handover s'y lit, décision 0050, B3-TL-1) ; `.env.example` sans valeur. Variables d'exécution prévues : `VADROUILLE_DATABASE_URL` (rôle `vadrouille_app`), `VADROUILLE_DATABASE_URL_AUTH` (rôle `vadrouille_auth`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `EMAIL_TRANSPORT`, `SMTP_URL`, `DATA_ADAPTER`, `AUTH_ADAPTER`, `PAYMENT_ADAPTER`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SIMULATED_WEBHOOK_ENABLED`, `SIMULATED_WEBHOOK_SECRET`, `TRUSTED_IP_HEADER`, `RATE_LIMIT_HMAC_SECRET`, `APP_URL`, `GOOGLE_MAPS_SERVER_KEY`, clés des fournisseurs de modèles. **Lecture par module** : `src/server/env/index.ts` valide toutes les variables au démarrage mais n'exporte aucune clé de fournisseur ; les clés sont exposées par des modules étroits, chacun importable par un seul dossier (règle ESLint du § 3) : `@/server/env/ai` (clés des fournisseurs de modèles seulement) pour `src/ai`, `@/server/env/grounding` (`GOOGLE_MAPS_SERVER_KEY` seulement) pour `src/grounding`, `@/server/env/payment` (secrets Stripe et du webhook simulé) pour `src/server/routes` et `src/server/payment`. `VADROUILLE_DATABASE_URL_MIGRATOR` (rôle `vadrouille_migrator`) n'existe que dans l'environnement des migrations (CI, déploiement), **jamais** dans celui de l'application. L'application ne lit jamais `DATABASE_URL` ni les autres variables posées par l'intégration Neon de Vercel, qui portent l'identifiant propriétaire (décision 0036, B1-TL-3). Aucune valeur dans le dépôt. **Outillage des tests de base, jamais lu par l'application** (B1, décision 0036, B1-TL-1 et B1-TL-2) : `SKIP_DB_TESTS` (hors CI seulement, refusée en CI par `scripts/test-db.mjs`, que lance `pnpm test:db`), `VADROUILLE_DB_BOOTSTRAP_ROLE` (rôle d'amorçage nommé par le test `rôles`) et `VADROUILLE_DB_ADMIN_URL` (administrateur de la base jetable, pour les tests qui prouvent un refus) ; voir `db/README.md`.
- **Gardes de `src/server/env/index.ts`** (refus de démarrer, testés par `env: gardes de configuration`) : clé secrète ou publiable Stripe portant le préfixe de **production** (`live`) refusée dans tous les environnements tant que la mise en production n'est pas décidée par Samuel (seul le préfixe de mode test est accepté) ; `BETTER_AUTH_SECRET`, `SIMULATED_WEBHOOK_SECRET` et `RATE_LIMIT_HMAC_SECRET` d'au moins 32 octets aléatoires, distincts par environnement ; `SIMULATED_WEBHOOK_ENABLED=true` refusé sur un déploiement de production ; `TRUSTED_IP_HEADER` requise à l'usage du limiteur hors local et CI, avec échec fermé ; refusée en `local` et hors Vercel ; seule valeur admise : `x-vercel-forwarded-for` (décision 0050, P3, amendement de ce § 2) ; `VADROUILLE_DATABASE_URL_MIGRATOR` ou `VADROUILLE_DB_ADMIN_URL` présente dans le processus serveur, ou `TRUSTED_IP_HEADER` présente en `ci` sur un serveur dont `HOSTNAME` n'est pas `127.0.0.1`, `::1` ou `localhost` : refus au démarrage par `assertServerProcessEnv` (appelée par `register()` de `src/instrumentation.ts` seulement, jamais par `serverEnv()`), décisions 0050 et 0051 ; le script `dev` ne retire ni l'une ni l'autre de ces deux variables (une variable exportée dans le shell refuse donc `pnpm dev`, échec fermé voulu : `VADROUILLE_DATABASE_URL_MIGRATOR` se pose sur la seule ligne de commande de `pnpm db:migrate`, `VADROUILLE_DB_ADMIN_URL` sur celle de `pnpm test:db`, consigne de `docs/deploiement/variables-environnement.md` et de `db/README.md`), tandis que `scripts/serve-standalone.mjs` les retire toutes deux de l'environnement des serveurs lancés par `pnpm start` (B3a) ; `serverEnv()` ne met en cache qu'une réussite ; toute erreur de configuration arrête le démarrage dans tous les environnements, préversion comprise (0050, B3-TL-1 point 2 ; aucun mode tolérant). Le déploiement de production se reconnaît par `isProductionDeployment` (décision 0017 § 11.0 : `VADROUILLE_ENV` ou `VERCEL_ENV` valant `production`), jamais par `NODE_ENV` seul. **Côté serveur, l'environnement est fermé par défaut** (B3 ; amendement de 0017 § 11.0 écrit dans la décision 0006, approuvé par la revue de #114, Q204, conflit C18 ; mention « provisoire » levée par la décision 0050) : `resolveServerEnvironment` (`src/server/env/resolve.ts`, fonction pure sans `server-only` et **sans aucun import**, seul calcul de l'environnement, réutilisée par `db/connection.ts`, qui l'importe par le chemin relatif `../src/server/env/resolve.ts` car `pnpm db:migrate` la charge sous Node sans alias `@/`, et par `parseServerEnv` ; décision 0050) résout un environnement à partir de `VADROUILLE_ENV` et de `VERCEL_ENV` (comparaison après `trim().toLowerCase()`, comme 0017 § 11.0) ; valeurs connues : `local`, `ci`, `staging` (et `preview`, `development` de Vercel, lues comme `staging` et `local`), `production`. Règles, dans cet ordre : (1) **si l'une des deux variables vaut `production`, l'environnement est `production`**, quelle que soit l'autre (`isProductionDeployment` de 0017 § 11.0, inchangée) : un `VADROUILLE_ENV=ci` laissé sur un déploiement `VERCEL_ENV=production` n'ouvre rien ; (2) **si l'une des deux variables a une valeur inconnue, l'environnement est `production`** ; (3) si les deux sont déclarées et divergent, la **plus restrictive** l'emporte (ordre `production` > `staging` > `ci` > `local`) ; (4) si une seule est déclarée, elle s'applique ; (5) **aucune déclarée : refus de démarrer**. En `production`, toutes les gardes d'ouverture sont fermées (webhook simulé, pages de développement, connexion simulée) et les clés de production restent refusées. Les tests unitaires qui n'importent pas `src/server/env/index.ts` ne sont pas concernés. Cas testés par `env: gardes de configuration` : aucune variable (refus), valeur inconnue ou mal orthographiée dans l'une ou l'autre (production), `VERCEL_ENV=preview` sans `VADROUILLE_ENV` (staging), `VADROUILLE_ENV=ci` avec `VERCEL_ENV=production` (production), `VADROUILLE_ENV=local` avec `VERCEL_ENV=preview` (staging).
- Chaque action serveur commence par `"use server"`, vérifie la session, construit le contexte côté serveur, valide son entrée par `parseInput` (décision 0017 § 3) et renvoie `Result` (§ 4).
- Toute dépendance nouvelle est notée dans une décision (version, raison) avant la fusion.

---

## § 3. Structure du dépôt (partie back)

Réconciliation du cadrage § 6.11, du handover front § 3 et de l'existant :

```
src/
  app/            pages ; route handlers minces dans app/api/v1/**/route.ts (webhooks, suivi de génération)
  features/       écrans (front) ; appellent les actions et src/adapters, jamais la base
  components/     composants (front)
  contracts/      schémas Zod partagés interface ↔ serveur (existant)
  adapters/       mock | api pour les voyages ; auth ; payment (existant, complété)
  mocks/          jeux simulés, importés seulement par src/adapters et les tests (règle F1)
  server/         actions/ (« use server », décision 0017 § 3), routes/ (logique des route handlers, jamais « use server »), config/ (offre, décision 0020), env (et env/ai, env/grounding, env/payment), session → contexte, withOrg, cas d'usage
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

**Règles d'import, vérifiées par ESLint** (`no-restricted-imports`, `no-restricted-syntax`, `no-restricted-globals` par dossier ; chaque règle a un test qui prouve qu'une violation est signalée, comme `tests/unit/lint`). Elles complètent celles déjà en place (décision 0016 § 3.1 ; décision 0017 § 3.3 et 0020 § 11 : hors de `src/server`, seul `@/server/actions/*` est importable).

**Route handlers : amendement de 0017 § 3.3 et 0020 § 11** (écrit dans la décision 0006, conflit C17 ; à appliquer par la première tâche qui crée un route handler, B4 ou B9) :
- la logique des route handlers vit dans `src/server/routes/` (un module par route : `stripe-webhook.ts`, `simulated-webhook.ts`, `generation-stream.ts`), avec `import "server-only"` et **jamais** la directive `"use server"` ;
- `@/server/routes/*` n'est importable que depuis les fichiers `src/app/api/**/route.ts` ; ces fichiers n'importent rien d'autre de `src/server` ; tout autre fichier de `src/app`, `src/features`, `src/components` et `src/lib` garde la règle de 0017 § 3.3 (seul `@/server/actions/*`) ;
- **un webhook n'est jamais une action serveur** : une fonction exportée d'un module `"use server"` est appelable depuis le navigateur par sa référence d'action, ce qui contournerait la vérification de signature du corps brut. Dans `src/server/actions/**` sont donc interdits : `@/server/routes/*`, `@/server/env/payment`, le paquet `stripe` (sauf `src/server/actions/paiement.ts` pour créer la session de paiement, sans le secret de signature) et les identifiants `constructEvent`, `STRIPE_WEBHOOK_SECRET`, `SIMULATED_WEBHOOK_SECRET` ;
- tests (`tests/unit/lint/`) : un import de `@/server/routes/stripe-webhook` depuis `src/app/api/v1/webhooks/stripe/route.ts` passe ; le même import depuis une page de `src/app` ou depuis `src/features` est refusé ; un import de `@/server/routes/*` ou de `@/server/env/payment` depuis `src/server/actions/` est refusé ; un fichier de `src/server/routes/` qui commence par `"use server"` est refusé.

**Liste blanche** pour les dossiers les plus sensibles (tout import absent de la liste est refusé, ce qui ferme les contournements par un module intermédiaire comme `@/server`) :
| Dossier | Seuls imports autorisés |
|---|---|
| `src/domain` | `@/contracts`, `zod`, fichiers de `src/domain` |
| `src/ai` | `@/contracts`, `@/ai/*`, `zod`, `server-only`, SDK de modèles (`ai`, `@openrouter/ai-sdk-provider` : dans le seul module de capacité `src/ai/openrouter-client.ts`, P0r1), `@/server/env/ai` (clé du fournisseur de modèles seulement ; jamais `@/server/env` ni un autre module d'environnement), `@/server/env/egress` (barrière de sortie, codes fermés seulement), `@/server/usage/port` (port de consommation : le contrat seul, jamais une implémentation ni une écriture directe de `usage_ledger` ; décisions 0031 § 6 et 0046, D13), sans accès à `src/grounding` |
| `src/grounding` | `@/contracts`, `@/grounding/*`, `zod`, `server-only`, `@/server/env/grounding` (clé serveur Google), `@/server/env/egress`, `@/server/usage/port` (le port seulement, jamais une implémentation) ; `fetch` global seulement comme transport par défaut des modules de capacité `places-client.ts` et `routes-client.ts` (P0r1, décision 0031 § 5 et § 6) |
| `src/research` | `@/contracts`, `@/ai`, `@/research/*`, `zod`, `server-only`, `node:net` (`BlockList` et `isIP`, dans `ip-guard.ts` seulement) ; `node:dns/promises`, client HTTP du lecteur de pages (`undici`, `Agent` seulement) et `@/server/env/egress` confinés au seul module de capacité `src/research/undici-transport.ts` (P0r1, décision 0031 § 5 et § 6) |

Admis nommément, hors du tableau (décision 0080, B7a) : `parse5` dans le seul `src/research/extract-text.ts` ; `node:fs` dans le seul test `src/ai/openrouter-client.test.ts` ; `node:fs`, `node:path` et `node:zlib` dans le seul test `src/research/fetch-page.test.ts`. Pour `src/ai` et `src/research`, la liste blanche est vérifiée par les règles du plugin `ligne/ia-recherche-liste-blanche` et `ligne/complement-p0-imports` (et non par `no-restricted-imports`), qui signalent aussi toute source non littérale d'`import()` ou de `require`.

**Liste noire** pour les autres dossiers :
| Dossier | Interdit |
|---|---|
| `src/domain` | en plus de la liste blanche (`@/contracts` et ses sous-chemins, `zod`, fichiers de `src/domain` ; `vitest` en plus pour les `*.test.ts`, tout autre import refusé, `import type` et `export … from` compris) : `process` (tout accès), `fetch`, `Date.now`, `new Date()` et `Date()` sans argument, `Math.random`, `crypto`, `performance`, `globalThis`, `require`, `import()`, `eval`, `Function` ; `Date.parse`, `Date.UTC` et `new Date(argument)` restent permis (aucune entrée-sortie, ni horloge, ni hasard ; décision 0045 § 3, règle ESLint de `eslint.config.mjs`, test `lint: src/domain sans entrée-sortie`) |
| `src/ai`, `src/research` | en plus de la liste blanche, vérifié explicitement : `@/grounding`, `db/` (aucune donnée Google ne peut atteindre un prompt ; la recherche écrit par le serveur) |
| `src/app`, `src/features`, `src/components` | `db/`, `drizzle-orm`, `pg`, `better-auth`, `@/workflows`, `@/grounding`, `@/ai`, `@/research` (ils passent par les actions et `src/adapters`) |
| tout sauf `src/ai` | SDK de modèles (`ai`, `@ai-sdk/*`, SDK des fournisseurs) |
| tout sauf `src/workflows` | directives `"use workflow"` et `"use step"`, paquet `workflow` |
| tout sauf `src/server/env/index.ts` (validation au démarrage, sans export de la valeur) et `src/server/env/grounding.ts` | lecture de `GOOGLE_MAPS_SERVER_KEY` (`process.env` et chaîne littérale) |
| tout sauf `src/grounding` | import de `@/server/env/grounding` |
| tout sauf `src/ai`, `src/grounding`, `src/research/undici-transport.ts` et `src/server/env/` | import de `@/server/env/egress` (règle `ligne/server-env-imports`, P0r1 ; décision 0031 § 6) |
| tout sauf `src/ai` | import de `@/server/env/ai` ; lecture des clés des fournisseurs de modèles hors `src/server/env/index.ts` et `src/server/env/ai.ts` |
| tout sauf `src/server/routes` et `src/server/payment` | import de `@/server/env/payment` |
| tout sauf `src/tenancy` et `src/server/auth` | paquet `better-auth` et objet `auth.api` (décision 0008 : seules les opérations de la liste blanche sont appelées) |
| tout sauf `src/server/account/delete.ts` et `db/` | la chaîne `purge_organization_data` (décision 0007) |

`import "server-only"` obligatoire dans `src/server` (hors `actions/`, déjà protégés par `"use server"`), `db/`, `src/tenancy`, `src/ai`, `src/research`, `src/grounding` et `src/workflows`, à partir de B1 (règle ESLint dédiée, avec son test). Test des modules d'environnement (B3) : `src/server/env/index.ts` n'exporte ni `GOOGLE_MAPS_SERVER_KEY` ni une clé de fournisseur de modèles ; un import de `@/server/env/grounding` depuis `src/ai` ou `src/research` est refusé. En phase 0, la décision 0020 n'ajoute pas le paquet `server-only` et s'appuie sur la règle de lint de 0017 § 3.3 ; B1 ajoute le paquet (décision 0006) sans retirer cette règle. Exception : 20 modules de phase 0 de `src/ai`, `src/research` et `src/grounding` n'importent pas `server-only`, et la garde qui les tient hors du navigateur n'est pas la règle de 0017 § 3.3 (limitée à `src/server`) mais `ligne/no-p0-server-modules` ; voir l'amendement de la décision 0006 du 2026-10-13.

---

## § 4. Contrats serveur

**Principe d'accès.** L'interface appelle des **actions serveur** (`src/server/actions/`) ; chaque action construit le contexte (`AdapterContext`) depuis la session, appelle l'adaptateur choisi (`mock` ou `api`), qui appelle un cas d'usage de `src/server`. Les lectures des composants serveur passent par `TripAdapter` (ou par `getTripReader`, décision 0020 § 3). Les schémas existants (`TripSchema`, `DaySchema`, `ProposalSchema`, `StopSchema`, `ChecklistItemSchema`, `ChangeSchema`, `OfferSchema`, `PreferencePromptSchema`…) sont importés, jamais recopiés. Toute action renvoie `Result` : `{ ok: true, value }` ou `{ ok: false, error: ApiError }` (décision 0017 § 4).

### Points d'accès par écran (handover front § 6)
| Écran | Route ou action | Méthode | Entrée | Sortie | Rôle requis | Idempotence | Erreurs possibles |
|---|---|---|---|---|---|---|---|
| 1 Créer le voyage | aucun appel : brouillon validé et gardé en mémoire de l'onglet jusqu'à la connexion (F8-PO-1, Q79) | — | `TripDraft` | — | anonyme | — | `validation_failed` (côté interface) |
| 2 Brief raconté | `structureBrief` | action | `BriefRequest` | `InferredBrief` | anonyme, limité par adresse IP (limiteur maison, § 7) puis plafond global | sans état (rien n'est stocké) | `validation_failed`, `rate_limited`, `cost_cap_reached`, `provider_error` |
| 3 Où loger | `suggestLodging` | action | `LodgingRequest` | `LodgingSuggestion` | anonyme, limité par adresse IP (limiteur maison, § 7) puis plafond global | sans état | `validation_failed`, `rate_limited`, `cost_cap_reached`, `no_option`, `provider_error` |
| 4 Compte | `requestCode` ; `verifyCode` ; `signOut`, par `AuthAdapter` (aucune route `/api/auth/*`, décision 0008) | action | `CodeRequest` ; `CodeVerification` | `Session` (cookie) | anonyme | limité par notre limiteur dans les actions (décision 0008, § 7) | `invalid_code`, `code_expired`, `too_many_attempts`, `rate_limited` |
| 5 Propositions prêtes | `createTrip` puis `getGenerationStatus` (interrogation, décision 0017 § 9) ; « Réessayer » : `retryGeneration` (0081 § B9-TL-11) ; flux `/api/v1/trips/[id]/generation` plus tard | action ; route GET | `TripRequest` ; `GenerationStatusRequest` ; `RetryGenerationRequest` (`{ tripId, requestId }`) | identifiant du voyage (`CreatedTrip`, `{ tripId }`, 0017) ; `GenerationStatus` ; `CreatedTrip` | propriétaire ou conseiller | `createTrip` : `requestId` unique par organisation ; `retryGeneration` : `requestId` unique par essai (`generation_runs.request_id`) | `createTrip` : `validation_failed`, `unauthenticated`, `active_preview_exists` (aucun appel de fournisseur : plafond, quota et erreur de fournisseur ne sont jamais une erreur de `createTrip`, mais une raison d'échec de `GenerationStatus` : `provider_error`, `cost_cap_reached`, `quota_reached`, 0077 § 3 point 5) ; `getGenerationStatus` : `unauthenticated`, `not_found` ; `retryGeneration` : `validation_failed` (rien à relancer), `unauthenticated`, `active_preview_exists`, `not_found` |
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
| Vue partagée | `createShareLink` ; `revokeShareLink` ; lecture `/p/[token]` par `TripAdapter.getSharedTrip` ; `getPlaceDetails` depuis la vue partagée, seulement pour un `placeId` du voyage du lien (§ 12) | action ; lecture | — | `ShareLink` ; `SharedTrip` ; `PlaceDetails` | propriétaire ou conseiller ; lecture : lien valide | un lien actif par voyage (PO-7) | `link_expired`, `link_revoked`, `not_found`, `rate_limited`, `cost_cap_reached` |
| Compte : export et suppression (cadrage § 3.5) | `exportAccount` ; `deleteAccount` (§ 12) | action | — | `AccountExport` | propriétaire (vérifié dans `src/server` et par `purge_organization_data`), avec **réauthentification récente** : code vérifié depuis moins de 10 minutes (§ 12) | suppression idempotente | `forbidden`, `reauthentication_required` (ajouté par B11) |

Un voyage d'une autre organisation renvoie `not_found`, jamais `forbidden` : on ne révèle pas son existence.

### Contrats à créer
Les contrats déjà exportés par `src/contracts` ou `src/adapters` ne figurent pas ici. Une tâche F déjà décidée crée le contrat dans sa forme de phase 0 ; la tâche B le complète sans le renommer.
| Contrat | Rôle | Tâche |
|---|---|---|
| `TripDraft` | Brouillon de l'écran 1 (décision 0017 § 2.2) | F8a ; complété par B9 |
| `BriefRequest` | Récit et voyage minimal envoyés à la structuration (0017 § 2.3) | F8a ; côté serveur par B9 |
| `Brief` | Brief structuré complet (0017 § 2.3) | F8a ; complété par B9 |
| `InferredBrief` | Brief déduit, champs facultatifs (0017 § 2.3) | F8a ; côté serveur par B9 |
| `Lodging` | Logement d'une ville (0017 § 2.2, amendé par 0081 § B9-TL-5) : saisi, quartier, aucun, ou suggestion retenue avec ses valeurs maison (identifiants, nom, et pour une zone centre et rayon) ; sous-contrat de `TripDraft` et `Brief` | F8a ; complété par B9 |
| `OtherCity` | Autre ville du séjour (0017 § 2.2), sous-contrat de `TripDraft` et `Brief` | F8a ; complété par B9 |
| `TripCommitment` | Engagement saisi à l'écran 1 (décision 0015 § 9), sous-contrat de `TripDraft` et `Brief` | F8a ; complété par B9 |
| `Travellers` | Adultes et enfants du brouillon et du brief (0017 § 2.2) | F8a ; complété par B9 |
| `LodgingRequest` | Brouillon et ville visée (0017 § 2.4) | F8b |
| `LodgingSuggestion` | Quartier conseillé et jusqu'à 3 logements, noms maison (0017 § 2.4) | F8b |
| `CodeRequest` | Adresse email (0017 § 2.4) | F8b |
| `CodeVerification` | Adresse et code à 6 chiffres (0017 § 2.4) | F8b |
| `Session` | Session lue par l'interface : `sessionId`, `userId`, `organizationId` (0017 § 2.4) | F8b ; complété par B3 |
| `AuthAdapter` | Adaptateur `auth` : demander un code, le vérifier, lire la session, se déconnecter | F8b ; adaptateur Better Auth par B3 |
| `TripRequest` | `requestId`, brouillon, brief (0017 § 2.4) | F8c ; repris par B9 |
| `GenerationStatus` | Phases, jours prêts, compteurs `expected` et `ready`, raison d'échec (0017 § 2.4) | F8c ; complété par B9 |
| `ReplacementRequest` | Étape, raison (`PreferenceReason`), souhait, version de base (0016 § 4.1) | F7a ; complété par B11 |
| `RevisionPreview` | Aperçu d'une révision : jours touchés, `Change`, étape visée (0016 § 4.2) | F7a ; complété par B11 |
| `ReplacementDraft` | Brouillon simulé de remplacement : aperçu sans identifiant ni version (0016 § 6), phase 0 | F7a ; remplacé par le moteur en B11 |
| `ReplacementFixture` | Brouillon de remplacement d'une étape du jeu simulé (0016 § 6), phase 0 | F7a ; remplacé par B11 |
| `RevisionFixtures` | Jeu simulé de révision d'un voyage, lu par `getRevisionFixtures` (adaptateur `mock`, 0016 § 6) ; F7b et F7c le complètent | F7a ; remplacé par B11 |
| `RevisionError` | Codes d'écran de la révision (0016 § 4.4), convertis depuis `ApiError` par l'adaptateur `api` | F7a |
| `MoveRequest` | Déplacement d'une étape vers un point d'insertion (0016 § 4.1) | F7b ; complété par B11 |
| `MoveOptions` | Jours et points d'insertion possibles (0016 § 4.3) | F7b ; complété par B11 |
| `MoveDraft` | Brouillon simulé de déplacement : aperçu sans identifiant ni version (0016 § 6), phase 0 | F7b ; remplacé par le moteur en B11 |
| `MoveFixture` | Options et brouillons de déplacement d'une étape du jeu simulé (0016 § 6), phase 0 | F7b ; remplacé par B11 |
| `AddRequest` | Ajout d'un lieu : source opaque, nom saisi, moment (0016 § 4.1) | F7c |
| `AddMoment` | Moment d'un ajout : temps libre ou repas laissé vide (0016 § 4.3) | F7c |
| `PlaceSearchResult` | Résultat de recherche : `resultId`, `placeId`, nom chargé à la demande et jamais recopié dans `Stop.name`, moments (0016 § 4.3) | F7c ; complété par B11 |
| `TripSummary` | Carte de « Mes voyages », sans `organizationId`, avec `dayCount` (décision 0021) | F11 ; complété par B6 |
| `TripReview` | Avis rapide, adresse découverte, préférences retenues (décision 0021) | F11 ; complété par B12 |
| `TripPatch` | Patch, contrat interne du serveur : `requestId`, `baseVersion`, opérations (`replace`, `add`, `move`, `lock`, `unlock`, `revert`) désignant les étapes par identifiant ; `replace` porte `newStopId` (identifiant attribué par le serveur) ; `add` porte `kind` (`activity` ou `meal`), le `placeId` et le nom saisi par la personne (jamais le nom Google, § 5) | B2 (fait) |
| `PatchResult` | Nouvelle version, jours touchés, `Change` (liste) | B2 (fait) |
| `TripSnapshot` | Instantané d'une version : `{ days: DaySnapshot[] }`, dérivé des jours de `TripSchema` (`TripBaseSchema.pick({ days })`) par omission des champs calculés et chargés à la demande (décisions 0010, 0037) | B2 (fait) |
| `ChecklistMoment` | Moment d'un élément de la liste (PO-2, § 5) | B2 (fait) |
| `StopFacts` | Faits structurés d'une étape : durée, coût estimé par personne, secteur (remplace le texte de `Stop.meta`) | B2 (fait) |
| `ProposalNeighbours` | Étapes voisines d'une proposition (remplace le texte de `Proposal.context`) | B2 (fait) |
| `PreviewSlot` | Case de l'aperçu : proposition ou « aucune option compatible » (PO-6, § 5) | B2 (fait) |
| `PaymentEvent` | Événement de paiement interne normalisé (identifiant d'événement, type, paiement, montant, devise, mode test) | B4 |
| `DeckDecision` | `requestId`, proposition, décision (`like`, `dislike` avec raison facultative, `choose`, `nextOption`), geste | B10 |
| `DeckDecisionResult` | Question de préférence éventuelle (`PreferencePrompt`), compteurs | B10 |
| `PreferenceSignal` | Signal enregistré : catégorie, signal, origine, statut (`confirmed`, `inferred`, `cancelled`) ; correspondance avec `RetainedPreference` ci-dessous | B10 |
| `PreferenceSubject` | Sujet d'une préférence : `{ kind: "category", category, direction }` ou `{ kind: "distance" }` (décision 0021 § 1.3, `src/contracts/preference.ts`) | F9b ou F11b (la première des deux, 0021 § 1.3) |
| `RetainedPreference` | Préférence retenue : `{ id, origin, subject }`, `id === preferenceKey(subject)` (décision 0021 § 1.3, forme de 0020 § 7 déplacée) | F9b ou F11b (idem) ; B10 la produit depuis `PreferenceSignal` |
| `AdjustmentSummary` | `{ tripId, retained: RetainedPreference[], days: { day, changes: Change[] }[], toReserveCount, generatingDays }` (décision 0020 § 7, `src/contracts/adjustment.ts`) | F9b ; complété par B10 (calcul déplacé dans `src/domain`, réponse du serveur) |
| `ChecklistUpdate` | Élément et état coché | B11 |
| `PlaceDetails` | Détail d'un lieu chargé à la demande (contenu Google, jamais stocké, affiché avec attribution) | B11 |
| `StopReport` | Signalement d'erreur sur une étape : motif (code), texte libre facultatif | B11 |
| `AccountExport` | Export des données de la personne (format JSON) | B11 |
| `ShareLink` | Adresse du lien privé, expiration | B12 |
| `SharedTrip` | Lecture seule des écrans 11 et 12, sans information de logement tant que Q50 n'est pas tranchée, **sans `organizationId`** (schéma strict ; test `partage: SharedTrip n'expose pas organizationId`) | B12 |

**Correspondance `PreferenceSignal` → `RetainedPreference`** (B10, fonction pure de `src/domain`) : seuls les signaux de statut `confirmed` ou `inferred` (jamais `cancelled`) produisent une préférence retenue ; `origin` reprend le statut ; un signal de catégorie (refus confirmé par `answerYes`, ou trois « j'aime » déduits) donne `subject = { kind: "category", category, direction }` (`less` pour un refus, `more` pour une envie) ; un signal `travelReduction` donne `subject = { kind: "distance" }` ; `id = preferenceKey(subject)`, si bien que plusieurs signaux d'un même sujet donnent une seule préférence, et « Retirer » annule tous les signaux de ce sujet (`status = cancelled`). Test `préférences: un signal annulé ne produit aucune préférence retenue` (B10).

### Format d'erreur commun et états de l'interface
`ApiError` existe (`src/contracts/errors.ts`, décision 0017 § 4) : `code` (énumération `API_ERROR_CODES` de `src/contracts/values.ts`, étendue sans renommer par chaque tâche), `field` (chemin construit à partir des clés connues du schéma, jamais la valeur reçue), `retryable`, `currentVersion` (conflit, évolution E10, fait par B2) et `activeTripId` (aperçu déjà en préparation, évolution E12, fait par F8c). L'interface choisit le texte (`src/i18n/fr.json`) et l'état à afficher :
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
Appliquées par **B2** (une seule PR, avec `src/mocks/edimbourg.ts`, les composants touchés et leurs tests), sauf mention (E8 fait ; E11 par F10a ou F11a). État : E1 à E6, E9 et E10 **fait (B2)** ; E7 **partiel** (B2 : `listPreviewSlots` ; `getSharedTrip` : B12) :
| # | Changement | Effet sur `src/mocks/edimbourg.ts` | Effet sur les composants |
|---|---|---|---|
| E1 | `Day.weekday`, `Day.title`, `Proposal.weekday` retirés (calculés par l'interface depuis `date`, `Intl.DateTimeFormat("fr-CH")`) — **fait (B2)** | champs supprimés | DayBadge, DayTabs, DeckCard, en-tête de Journée |
| E2 | `Proposal.context` remplacé par `neighbours: ProposalNeighbours` — **fait (B2)** | voisins par identifiant | DeckCard compose « Entre ton déjeuner et … » via `fr.json` |
| E3 | `Stop.meta` et `SurpriseIdea.meta` remplacés par `facts: StopFacts` — **fait (B2)** | faits structurés | ligne du jour, Fiche étape, idée « Surprends-moi » (formatage) |
| E4 | `ChecklistItem.when` devient `ChecklistMoment` (PO-2) — **fait (B2)** | « [Déjà réservé] » → `beforeDeparture` avec `done`, « [Une semaine avant] » → `deadline`, « [Avant le départ] » → `beforeDeparture` ; « [Au plus tôt] » : Q42 | ChecklistRow produit le libellé |
| E5 | `PreviewSlot` et `TripAdapter.listPreviewSlots` (PO-6) — **fait (B2)** | aperçu Édimbourg avec une case `noOption` pour le test | DeckCard et état `noOption` (F6) |
| E6 | `AdapterContext` : ajout de `userId` et `role` (`owner`, `member`) — **fait (B2)** | — | aucun (construit côté serveur) |
| E7 | `TripAdapter` : ajout de `listPreviewSlots`, `getSharedTrip` (B2, B12) ; pas de `getToday` (C15, F10-TL-2) ; `listTrips` par F11 (décision 0021) ; `getDayMap` et `getTripMap` déjà en place (décision 0013) ; l'offre reste sur `PaymentAdapter` (décision 0020) — **partiel** (B2 : `listPreviewSlots` ; `getSharedTrip` : B12) | lectures simulées correspondantes | écrans concernés, au fil des tâches F |
| E8 | Fait : repas « pas encore choisi » (`DayLineItem` `openMeal`), `Stop.commitment`, `Day.surprise` (décision 0015) | — | — |
| E9 | `ChecklistItem.stopId` (décision 0016 § 11), par la tâche qui applique F7-PO-19, ou par B2 si le schéma de base vient avant — **fait (B2)** | lignes du Tattoo reliées à leur étape | ChecklistRow, rappels de l'écran 15 (Q187) |
| E10 | `ApiError.currentVersion` (B5) — **fait (B2)** | — | bandeau `conflict` |
| E11 | `Trip.timeZone` (identifiant IANA obligatoire, F10-TL-1 ; décision 0021 § 3) et `TripSummary.timeZone` (repris de `TripSchema` par `pick`, 0021 § 1.2), créés par F10a (ou par F11a si F10a n'est pas fusionnée, 0021 § 3) ; côté serveur, colonne `trips.time_zone` (§ 6) et ligne `Trip.timeZone` du § 5 | `Europe/London` (Édimbourg), `Europe/Lisbon` | écran 15, « Mes voyages » (date locale de la destination) |
| E12 | `ApiError.activeTripId` (F8c) — **fait** : identifiant du voyage en préparation, présent si et seulement si `code` vaut `active_preview_exists` (`superRefine`, comme `currentVersion`) ; `createTrip` renvoie `Result<CreatedTrip>` | — | `R-lancer` : bandeau `conflict` et « Voir ces propositions » |

---

## § 5. Répartition des champs : stockés, chargés à la demande, calculés (Q14, Tech Lead)

Décision 0010. Catégories :
- **stocké** : contenu maison (nom et résumé issus de notre recherche web, choix de l'utilisateur, sortie du moteur conservée dans la version, paiement enregistré) ou identifiant de lieu ;
- **chargé à la demande** : contenu Google obtenu côté serveur à l'affichage, jamais persisté, affiché sur la carte Google ou avec la mention « Données de lieux : Google » ;
- **calculé** : à la lecture, par le moteur (`src/domain`, appelé par le serveur), par le serveur (configuration, identifiants) ou par l'interface (formatage) ; jamais persisté.

Le tableau couvre chaque champ de chaque schéma objet ou union discriminée exporté par `src/contracts` au 2026-10-11 (144 clés, notation du critère § 5 de la spécification B0), **sauf les 7 clés qui dépendent de Q5**, classées dans « Partie Q5 » (décision 0011, point 5) : 137 lignes ici, 7 là-bas, sans recouvrement ; les 144 clés ont donc une catégorie. **Après B2** (2026-10-13) : 6 lignes retirées (`Day.weekday`, `Day.title`, `Proposal.weekday`, `Proposal.context`, `Stop.meta`, `SurpriseIdea.meta`) et 56 ajoutées (`Trip.timeZone` comprise) : 187 lignes ici, 194 clés avec les 7 de 0011 ; les contrats de création (`TripDraft`, `Brief`, `BriefRequest`, `InferredBrief`, `Lodging`, `OtherCity`, `TripCommitment`, `Travellers`, tâche B9) et `TripSummary` (B6) n'avaient pas encore de lignes à cette date, et les schémas de stockage dérivés (`TripSnapshot`, `DaySnapshot`, `DayLineItemSnapshot`, `StopSnapshot`, `EventSnapshot`, `SegmentSnapshot`, `SurpriseIdeaSnapshot`, `ProposalRecord`) n'en ont pas (exclusions du test `contrats: chaque champ a une seule catégorie`, `tests/unit/contracts/categories.test.ts`, décision 0037). **Après la PR de contrat de B9b** (2026-10-17, décision 0081 § B9-TL-14) : 66 lignes ajoutées pour les contrats de création de l'écran 1 et du lancement (`TripRequest`, `TripDraft`, `OtherCity`, `TripCommitment`, `Lodging`, `Brief`, `Travellers`, `GenerationStatus` et `GenerationDay`, exporté pour l'occasion), retirés des exclusions ; `BriefRequest`, `InferredBrief`, `LodgingRequest` et `LodgingSuggestion` (actions sans compte, B9a) restent exclus. **Après B6a** (2026-10-18, spécification B6, B6-PO-12) : 11 lignes `TripSummary.*` ajoutées, `TripSummary` retiré des exclusions. Un champ dont le type est un autre schéma exporté a une ligne ; ses sous-champs sont dans les lignes du schéma référencé.

| Champ | Catégorie | Règle |
|---|---|---|
| `Stop.id` | stocké | Identifiant d'étape stable entre versions, attribué par le moteur |
| `Stop.kind` | stocké | Type d'étape |
| `Stop.placeId` | stocké | Identifiant de lieu Google, seul élément Google conservable |
| `Stop.name` | stocké | Nom trouvé par notre recherche web (`candidates.name`, source citée) ou saisi par la personne ; **jamais écrit depuis le `displayName` Google**, y compris pour un lieu ajouté par la recherche (le nom Google y est seulement chargé à la demande, avec attribution ; décision 0016 § 12, F7-PO-10) |
| `Stop.start` | stocké | Sortie du moteur |
| `Stop.end` | stocké | Sortie du moteur |
| `Stop.facts` | stocké | Faits structurés de l'étape (évolution E3), copie de `candidates.facts` (contenu maison) ; voir `StopFacts.*`. L'interface compose le texte affiché ; aucun texte stocké |
| `Stop.reason` | stocké | Résumé maison de la sélection, commence par ce que la personne a choisi |
| `Stop.source` | stocké | Source web relue (jamais Google) |
| `Stop.locked` | stocké | Choix de la personne, ou engagement verrouillé à la création (décision 0015 § 9) |
| `Stop.commitment` | stocké | Engagement saisi par la personne à l'écran 1 (`TripDraft`), décision 0015 § 9 |
| `StopFacts.durationMinutes` | stocké | Durée de visite estimée par notre recherche web (minutes, entier positif) ; jamais tirée de Google |
| `StopFacts.costPerPerson` | stocké | Coût estimé par personne en CHF (0 = gratuit), issu de notre recherche web ; jamais un niveau de prix Google |
| `StopFacts.area` | stocké | Secteur ou quartier, texte maison ; jamais l'adresse Google |
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
| `DayLineItem[segment].segment` | stocké | Voir `Segment.*` : seuls `mode` et `estimated` sont dans l'instantané ; `Segment.minutes` en est omis (« Partie Q5 », décision 0011 point 5 ; paragraphe « Champs composés » ci-dessous) |
| `DayLineItem[free].type` | stocké | Discriminant |
| `DayLineItem[free].from` | stocké | Sortie du moteur (R8) |
| `DayLineItem[free].to` | stocké | Sortie du moteur (R8) |
| `DayLineItem[openMeal].type` | stocké | Discriminant (décision 0015 § 2) |
| `DayLineItem[openMeal].time` | stocké | Sortie du moteur : créneau de repas laissé vide (F6-PO-7) |
| `DayLineItem[openMeal].meal` | stocké | Déjeuner ou dîner |
| `Day.index` | stocké | 1 = J1 |
| `Day.date` | stocké | Date ISO |
| `Day.items` | stocké | Ligne du jour, voir `DayLineItem[*].*` |
| `Day.budgetPerPerson` | calculé | Moteur (R9), somme des coûts estimés de `StopFacts` |
| `Day.events` | stocké | Événements du jour, voir `Stop.*` |
| `Day.generating` | calculé | Serveur, à la lecture, depuis `generation_runs` |
| `Day.travelBudgetMinutes` | stocké | Copie de la configuration PO-1 au moment de la planification, réduction comprise |
| `Day.surprise` | stocké | Copie d'un candidat de la réserve choisi par la sélection (décision 0015 § 3), voir `SurpriseIdea.*` |
| `SurpriseIdea.id` | stocké | Identifiant du candidat |
| `SurpriseIdea.placeId` | stocké | Identifiant de lieu Google |
| `SurpriseIdea.name` | stocké | Règle de `Stop.name` |
| `SurpriseIdea.facts` | stocké | Règle de `Stop.facts`, voir `StopFacts.*` |
| `SurpriseIdea.reason` | stocké | Justification maison |
| `SurpriseIdea.source` | stocké | Source web relue (jamais Google) |
| `ChecklistItem.id` | stocké | Identifiant |
| `ChecklistItem.label` | stocké | Contenu maison : ce qu'il faut réserver |
| `ChecklistItem.when` | stocké | `ChecklistMoment` (PO-2, évolution E4) |
| `ChecklistItem.done` | stocké | Choix de l'utilisateur |
| `ChecklistItem.stopId` | stocké | `checklist_items.stop_id` : étape du voyage concernée (évolution E9, décision 0016 § 11) ; contrôlé par `TripSchema` à la recomposition |
| `ChecklistItem.bookingUrl` | stocké | Lien de réservation issu de la recherche web (jamais Google), `https:` seulement (§ 12) |
| `ChecklistItem.sponsored` | stocké | Lien rémunéré signalé |
| `ChecklistMoment[deadline].type` | stocké | Discriminant (`checklist_items.moment`, PO-2) |
| `ChecklistMoment[deadline].date` | stocké | Date limite ISO ; l'interface affiche « Avant le {date} » |
| `ChecklistMoment[beforeDeparture].type` | stocké | Discriminant |
| `ChecklistMoment[tripDay].type` | stocké | Discriminant |
| `ChecklistMoment[tripDay].day` | stocké | Jour du voyage (1 = J1, au plus `days.length`) ; l'interface affiche « À l'arrivée » pour le J1 |
| `Trip.id` | stocké | Identifiant |
| `Trip.organizationId` | stocké | `trips.organization_id` ; jamais fourni par le client |
| `Trip.destination` | stocké | Saisie de l'utilisateur |
| `Trip.destinationColor` | calculé | Moteur, attribution stable depuis la destination |
| `Trip.start` | stocké | Saisie de l'utilisateur |
| `Trip.end` | stocké | Saisie de l'utilisateur |
| `Trip.timeZone` | stocké | `trips.time_zone`, identifiant IANA validé par le schéma (évolution E11) ; recopié dans `TripSummary.timeZone` (calculé par `pick`, 0021 § 1.2). Source à la création fixée par B9 (destination choisie et table maison des fuseaux) ; **jamais tirée d'une réponse Google** |
| `Trip.travellers.adults` | stocké | Brief |
| `Trip.travellers.children` | stocké | Brief |
| `Trip.days` | stocké | Instantané de la version courante, voir `Day.*` |
| `Trip.checklist` | stocké | `checklist_items`, voir `ChecklistItem.*` |
| `Trip.unlocked` | calculé | Serveur, depuis `entitlements` (PO-4) seulement ; aucune colonne de `trips` ne porte le déblocage (`trips.status` n'a pas de valeur `unlocked`, § 6) |
| `TripSummary.id` | stocké | `trips.id` (B6-PO-12) |
| `TripSummary.destination` | stocké | `trips.destination` |
| `TripSummary.destinationColor` | calculé | Moteur, comme `Trip.destinationColor` |
| `TripSummary.start` | stocké | `trips.start_date` |
| `TripSummary.end` | stocké | `trips.end_date` |
| `TripSummary.timeZone` | stocké | `trips.time_zone` (repris de `TripSchema` par `pick`, 0021 § 1.2) |
| `TripSummary.travellers.adults` | stocké | `trips.travellers_adults` |
| `TripSummary.travellers.children` | stocké | `trips.travellers_children` |
| `TripSummary.unlocked` | calculé | Serveur, depuis `entitlements` seulement, comme `Trip.unlocked` (B6-PO-7) |
| `TripSummary.toReserveCount` | calculé | Serveur, `countToReserve` des lignes de `checklist_items` du voyage |
| `TripSummary.dayCount` | calculé | Serveur, nombre de jours de l'instantané de la version courante ; « Mes voyages » ne relit rien chez Google |
| `Proposal.id` | stocké | Identifiant |
| `Proposal.kind` | stocké | Activité ou repas |
| `Proposal.day` | stocké | Jour de la proposition |
| `Proposal.time` | stocké | Sortie du moteur |
| `Proposal.stop` | stocké | Voir `Stop.*` |
| `Proposal.category` | stocké | Copie de `candidates.category` (vocabulaire `Category`, décision 0013 § 3.1), jamais un type de lieu Google |
| `Proposal.neighbours` | calculé | Moteur, depuis la ligne du jour à la lecture (0037, B2-TL-1) ; voir `ProposalNeighbours.*` ; absent de `proposals.content` |
| `ProposalNeighbours.before` | calculé | Voisin précédent, voir `ProposalNeighbour[*].*` |
| `ProposalNeighbours.after` | calculé | Voisin suivant, voir `ProposalNeighbour[*].*` |
| `ProposalNeighbour[stop].type` | calculé | Discriminant |
| `ProposalNeighbour[stop].stopId` | calculé | `Stop.id` d'une étape du jour ; l'interface lit son nom dans le jour |
| `ProposalNeighbour[meal].type` | calculé | Discriminant |
| `ProposalNeighbour[meal].meal` | calculé | Déjeuner ou dîner ; l'interface écrit « ton déjeuner », « ton dîner » |
| `ProposalNeighbour[free].type` | calculé | Discriminant ; l'interface écrit « ton temps libre » |
| `ProposalNeighbour[terminus].type` | calculé | Discriminant |
| `ProposalNeighbour[terminus].role` | calculé | Départ ou retour au logement |
| `Proposal.option.index` | calculé | Moteur, rang de l'option parmi les candidats du créneau |
| `Proposal.option.total` | calculé | Moteur, nombre d'options du créneau (3 au plus) |
| `Proposal.photoUrl` | chargé à la demande | Provisoire, suit Q6 ; jamais persisté |
| `Proposal.travelFromPrevious` | stocké | Voir `Segment.*` : seuls `mode` et `estimated` sont dans `proposals.content` (§ 6) ; `Segment.minutes` en est omis (« Partie Q5 », décision 0011 point 5 ; paragraphe « Champs composés » ci-dessous) |
| `Proposal.detour` | stocké | Justification maison du détour ; l'interface y ajoute la durée. Son caractère obligatoire dépend de `Segment.minutes` (raffinement de `ProposalSchema`) : jamais à l'écriture ; contrôlé à la recomposition (0011 point 5) |
| `PreviewSlot[proposal].type` | stocké | Discriminant : `proposals.slot_type` (PO-6) |
| `PreviewSlot[proposal].proposal` | stocké | `proposals.content` (`ProposalRecordSchema`), recomposé en `Proposal` à la lecture ; voir `Proposal.*` |
| `PreviewSlot[noOption].type` | stocké | Discriminant : `proposals.slot_type`, `content` nul |
| `PreviewSlot[noOption].day` | stocké | `proposals.day` |
| `PreviewSlot[noOption].time` | stocké | `proposals.time` |
| `PreviewSlot[noOption].kind` | stocké | `proposals.kind` : activité ou repas |
| `TripPatch.requestId` | stocké | `trip_versions.request_id` (idempotence) |
| `TripPatch.baseVersion` | stocké | `trip_versions.parent_version` |
| `TripPatch.operations` | stocké | `trip_versions.patch`, voir `TripPatchOperation[*].*` |
| `TripPatchOperation[replace].op` | stocké | Discriminant |
| `TripPatchOperation[replace].stopId` | stocké | Étape remplacée, par identifiant |
| `TripPatchOperation[replace].candidateId` | stocké | Candidat de la réserve (UUID de `candidates`) |
| `TripPatchOperation[replace].newStopId` | stocké | Identifiant attribué par le serveur à la nouvelle étape (0037) |
| `TripPatchOperation[add].op` | stocké | Discriminant |
| `TripPatchOperation[add].stopId` | stocké | Identifiant attribué par le serveur à l'étape ajoutée |
| `TripPatchOperation[add].kind` | stocké | Activité ou repas (0037) |
| `TripPatchOperation[add].day` | stocké | Jour visé |
| `TripPatchOperation[add].time` | stocké | Heure visée |
| `TripPatchOperation[add].name` | stocké | Nom saisi par la personne (80 caractères au plus) ; **jamais le nom Google** |
| `TripPatchOperation[add].placeId` | stocké | Identifiant de lieu Google, seul élément Google conservable |
| `TripPatchOperation[move].op` | stocké | Discriminant |
| `TripPatchOperation[move].stopId` | stocké | Étape déplacée |
| `TripPatchOperation[move].day` | stocké | Jour d'arrivée |
| `TripPatchOperation[move].time` | stocké | Heure d'arrivée |
| `TripPatchOperation[lock].op` | stocké | Discriminant |
| `TripPatchOperation[lock].stopId` | stocké | Étape verrouillée |
| `TripPatchOperation[unlock].op` | stocké | Discriminant |
| `TripPatchOperation[unlock].stopId` | stocké | Étape déverrouillée |
| `TripPatchOperation[revert].op` | stocké | Discriminant |
| `TripPatchOperation[revert].toVersion` | stocké | Version rétablie, antérieure à `baseVersion` (PO-5) |
| `PatchResult.version` | stocké | `trip_versions.version` de la version produite |
| `PatchResult.touchedDays` | calculé | Moteur, jours modifiés par le patch |
| `PatchResult.changes` | calculé | Moteur, voir `Change[*].*` (jamais persisté ; le patch l'est) |
| `Change[replaced].type` | calculé | Moteur, aperçu des effets (jamais persisté ; le patch l'est) |
| `Change[replaced].time` | calculé | Moteur |
| `Change[replaced].before` | calculé | Moteur, depuis `Stop.name` |
| `Change[replaced].after` | calculé | Moteur, depuis `Stop.name` |
| `Change[moved].type` | calculé | Moteur |
| `Change[moved].label` | calculé | Moteur, depuis `Stop.name` |
| `Change[added].type` | calculé | Moteur (variante de la décision 0016 § 4.5, créée par F7a) |
| `Change[added].time` | calculé | Moteur, heure de l'étape ajoutée |
| `Change[added].label` | calculé | Moteur, nom saisi par la personne ; **jamais le nom Google** |
| `Change[moved].before.day` | calculé | Moteur, jour d'origine (forme structurée de la décision 0016 § 4.5, appliquée par F7a) |
| `Change[moved].before.time` | calculé | Moteur, heure d'origine |
| `Change[moved].after.day` | calculé | Moteur, jour d'arrivée |
| `Change[moved].after.time` | calculé | Moteur, heure d'arrivée |
| `Change[segment].type` | calculé | Moteur |
| `Change[segment].label` | calculé | Moteur, depuis `Stop.name` de l'étape d'arrivée (décision 0016 § 4.5, F7a) |
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
| `MapPoint.lat` | chargé à la demande | Position Google obtenue côté serveur par `placeId`, affichée sur la carte Google seulement ; conservation côté serveur : cache `place_coordinates` de 30 jours au plus (« Partie Q5 », décision 0011 point 6) |
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
| `ApiError.currentVersion` | calculé | Serveur, depuis `trips.current_version`, seulement avec le code `version_conflict` (évolution E10) |
| `ApiError.activeTripId` | calculé | Serveur, voyage de l'organisation dont la génération n'est pas finie, seulement avec le code `active_preview_exists` (évolution E12, F8c) |
| `TripRequest.requestId` | stocké | `trips.request_id` (idempotence de `createTrip` par organisation, B9b point 3) |
| `TripRequest.draft` | stocké | Voir `TripDraft.*` ; écrit par `createTrip` dans une seule transaction (B9b point 2) |
| `TripRequest.brief` | stocké | Voir `Brief.*` ; `briefs`, version 1 (B9-PO-1) |
| `TripDraft.destination` | stocké | `trips.destination`, saisie par la personne |
| `TripDraft.start` | stocké | `trips.start_date` ; « arrivée au plus tôt aujourd'hui » revérifiée par `createTrip` dans le fuseau du voyage |
| `TripDraft.end` | stocké | `trips.end_date` |
| `TripDraft.lodging` | stocké | Voir `Lodging.*` ; `stays` de la destination (B9-PO-1) |
| `TripDraft.otherCities` | stocké | Voir `OtherCity.*` ; une ligne `stays` par ville (B9-PO-1) |
| `TripDraft.commitments` | stocké | Voir `TripCommitment.*` ; engagements de l'écran 1 (décision 0015 § 9, B9-TL-6) |
| `OtherCity.name` | stocké | Ville saisie par la personne (B9-TL-6, ville de chaque logement) |
| `OtherCity.arrival` | stocké | `stays.from_date` de la ville ; la fin se déduit de l'arrivée suivante ou du départ (borne exclusive, B9-PO-1) |
| `OtherCity.lodging` | stocké | Voir `Lodging.*` |
| `TripCommitment.kind` | stocké | Type d'engagement saisi par la personne |
| `TripCommitment.label` | stocké | Libellé saisi par la personne ; jamais envoyé à un modèle |
| `TripCommitment.date` | stocké | Date saisie par la personne |
| `TripCommitment.start` | stocké | Heure saisie par la personne |
| `TripCommitment.end` | stocké | Heure saisie par la personne, facultative |
| `Lodging[known].kind` | stocké | Type de logement d'origine (B9-TL-6 (c)) |
| `Lodging[known].label` | stocké | `stays.label`, saisi par la personne, ancré au début du workflow 1 (B9-PO-2) |
| `Lodging[area].kind` | stocké | Type de logement d'origine (B9-TL-6 (c)) |
| `Lodging[area].label` | stocké | `stays.label`, quartier saisi par la personne, sans `placeId` |
| `Lodging[none].kind` | stocké | Type de logement d'origine (B9-TL-6 (c)) ; `stays.kind` `none`, libellé = la ville |
| `Lodging[suggestedLodging].kind` | stocké | Type de logement d'origine (B9-TL-6 (c)) |
| `Lodging[suggestedLodging].lodgingId` | stocké | Identifiant maison de la suggestion retenue (0081 § B9-TL-5) |
| `Lodging[suggestedLodging].placeId` | stocké | `stays.place_id`, identifiant de lieu Google, seul élément Google conservable ; revérifié par une fiche au début du workflow 1, jamais cru (B9-PO-2) |
| `Lodging[suggestedLodging].name` | stocké | `stays.label`, nom **maison** de la suggestion (sortie du modèle, B7), jamais un nom Google (0081 § B9-TL-5) |
| `Lodging[suggestedArea].kind` | stocké | Type de logement d'origine (B9-TL-6 (c)) |
| `Lodging[suggestedArea].areaId` | stocké | Identifiant maison de la zone retenue (0081 § B9-TL-5) |
| `Lodging[suggestedArea].name` | stocké | `stays.label`, nom **maison** de la zone, jamais un nom Google (0081 § B9-TL-5) |
| `Lodging[suggestedArea].center.lat` | stocké | Centre de la zone **maison** (sortie du modèle, B7), jamais une coordonnée Google (0011, 0027, 0081 § B9-TL-5) |
| `Lodging[suggestedArea].center.lng` | stocké | Comme `Lodging[suggestedArea].center.lat` |
| `Lodging[suggestedArea].radiusM` | stocké | Rayon de la zone maison, 50 à 20 000 m (0081 § B9-TL-5) |
| `Brief.travellers` | stocké | Voir `Travellers.*` |
| `Brief.pace` | stocké | `briefs.pace` |
| `Brief.wishes` | stocké | `briefs.wishes` (codes `Category`) |
| `Brief.limits` | stocké | `briefs.limits` (codes `Category`) |
| `Brief.mobility` | stocké | `briefs.mobility` (format fixé par B9-TL-6) |
| `Brief.mealBudgetPerPerson` | stocké | `briefs.meal_budget`, CHF par personne, facultatif |
| `Brief.inferredFields` | stocké | `briefs.inferred_fields` : champs déduits du récit par la structuration (B7-PO-1) |
| `Travellers.adults` | stocké | `trips.travellers_adults` |
| `Travellers.children` | stocké | `trips.travellers_children` |
| `GenerationStatus[preparing].phase` | calculé | Serveur, depuis `generation_runs.phase` de la dernière exécution du voyage (`queued` et `preparing` → `preparing`, B9b point 5) |
| `GenerationStatus[preparing].tripId` | calculé | Serveur, identifiant du voyage demandé |
| `GenerationStatus[preparing].days` | calculé | Voir `GenerationDay.*` |
| `GenerationStatus[preparing].expected` | calculé | Serveur, nombre de cases attendues de l'aperçu (B9-PO-5) |
| `GenerationStatus[preparing].ready` | calculé | Serveur, somme des `readyStops`, depuis `proposals` |
| `GenerationStatus[ready].phase` | calculé | Serveur, depuis `generation_runs.phase` de la dernière exécution du voyage (`queued` et `preparing` → `preparing`, B9b point 5) |
| `GenerationStatus[ready].tripId` | calculé | Serveur, identifiant du voyage demandé |
| `GenerationStatus[ready].days` | calculé | Voir `GenerationDay.*` |
| `GenerationStatus[ready].expected` | calculé | Serveur, nombre de cases attendues de l'aperçu (B9-PO-5) |
| `GenerationStatus[ready].ready` | calculé | Serveur, somme des `readyStops`, depuis `proposals` |
| `GenerationStatus[incomplete].phase` | calculé | Serveur, depuis `generation_runs.phase` de la dernière exécution du voyage (`queued` et `preparing` → `preparing`, B9b point 5) |
| `GenerationStatus[incomplete].tripId` | calculé | Serveur, identifiant du voyage demandé |
| `GenerationStatus[incomplete].days` | calculé | Voir `GenerationDay.*` |
| `GenerationStatus[incomplete].expected` | calculé | Serveur, nombre de cases attendues de l'aperçu (B9-PO-5) |
| `GenerationStatus[incomplete].ready` | calculé | Serveur, somme des `readyStops`, depuis `proposals` |
| `GenerationStatus[failed].phase` | calculé | Serveur, depuis `generation_runs.phase` de la dernière exécution du voyage (`queued` et `preparing` → `preparing`, B9b point 5) |
| `GenerationStatus[failed].tripId` | calculé | Serveur, identifiant du voyage demandé |
| `GenerationStatus[failed].days` | calculé | Voir `GenerationDay.*` |
| `GenerationStatus[failed].expected` | calculé | Serveur, nombre de cases attendues de l'aperçu (B9-PO-5) |
| `GenerationStatus[failed].ready` | calculé | Serveur, somme des `readyStops`, depuis `proposals` |
| `GenerationStatus[failed].reason` | calculé | Serveur, conversion unique de `generation_runs.stop_reason` (B9-TL-6 (h), B9-PO-9) ; `no_option` n'est jamais une raison d'échec |
| `GenerationStatus[failed].retryable` | calculé | Serveur, vrai seulement pour `upstream_unavailable`, `upstream_timeout` et `step_expired` (B9-PO-9, B9-TL-3 point 5) |
| `GenerationDay.index` | calculé | Serveur, rang du jour (1 = J1) |
| `GenerationDay.state` | calculé | Serveur, jour publié dans la version ou non (B9-PO-12) |
| `GenerationDay.readyStops` | calculé | Serveur, cases prêtes de ce jour, depuis `proposals` ; aucun nom de lieu ni identifiant d'étape |

**Où vit l'aperçu et la suite du tri (fait, B2).** `Proposal` et `PreviewSlot` ne sont pas dans l'instantané d'une version : ils vivent dans la table `proposals` (§ 6), une ligne par case, écrite par le workflow 1 (aperçu) ou par la suite du tri, jamais modifiée ensuite (les décisions vont dans `preference_signals`). Une case `noOption` n'y a que `day`, `time` et `kind`. Une case `proposal` porte `content`, validé par `ProposalRecordSchema` (`src/contracts/snapshot.ts`), dérivé de `ProposalBaseSchema` par omission des champs calculés (`neighbours`, `option`) et chargés à la demande (`photoUrl`), avec `stop` en `StopSnapshot` (sans `verifiedAt`, `exceptions` sans `toConfirm`) et `travelFromPrevious` en `SegmentSnapshot` (sans `minutes`) ; `detour` y est obligatoire (« Partie Q5 ») et `stop.commitment` refusé. `TripAdapter.listPreviewSlots` et `listProposals` recomposent la `Proposal` complète et la valident par `ProposalSchema` (`neighbours` calculé à la lecture, 0037).

**Champs composés touchés par les 7 clés de la « Partie Q5 ».** `Segment.minutes` apparaît dans `DayLineItem[segment].segment` et dans `Proposal.travelFromPrevious` ; `Stop.verifiedAt` et `Stop.exceptions` dans `Day.events`, `DayLineItem[stop].stop`, `Proposal.stop` ; `SurpriseIdea.verifiedAt` dans `Day.surprise`. L'omission (ou, pour `Stop.exceptions`, la restriction à `toReserve` et `unconfirmed`, décision 0011 point 5) se fait **une seule fois, sur le schéma imbriqué** (`SegmentSchema`, `StopSchema`, `SurpriseIdeaSchema` dérivés par `.omit()`), et vaut donc pour toutes ces positions, dans `TripSnapshotSchema` comme dans `ProposalRecordSchema` (décision 0010, principe 6). Test `versions: l'instantané ne contient ni durée de trajet ni date de contrôle`, étendu à `proposals.content` (B2).

**Coordonnées.** Jamais dans un contrat stocké, une version, un journal ou l'état d'un workflow ; seulement dans `DayMap`, chargé à la demande pour la carte Google. La carte du navigateur peut aussi les obtenir par la bibliothèque Google à partir de `placeId`. Le cache serveur de 30 jours au plus prévu par le cadrage § 6.5 est admis par la règle provisoire de Samuel (0027) : table `place_coordinates` de la « Partie Q5 » (décision 0011, point 6).

**Forme de PO-2 (`ChecklistMoment`)** : union discriminée par `type` : `{ type: "deadline", date }` (date ISO), `{ type: "beforeDeparture" }`, `{ type: "tripDay", day }` (1 = J1 ; l'interface affiche « à l'arrivée » pour le J1). Aucun libellé dans les données. Critère de B2 : `ChecklistItemSchema` refuse un texte libre dans `when` et accepte les trois formes.

**Forme de PO-6 (`PreviewSlot`)** : union discriminée par `type` : `{ type: "proposal", proposal }` (une `Proposal`) ou `{ type: "noOption", day, time, kind }` (`kind` : `activity` ou `meal`). L'aperçu est une liste ordonnée de 8 cases au plus, lue par `TripAdapter.listPreviewSlots` ; `GenerationStatus` porte `expected` et `ready`. Une case `noOption` n'a ni lieu ni texte ; elle n'est jamais remplie par un lieu non ancré (R1). Critères de B2 et B9 : un aperçu de moins de 8 propositions ancrées renvoie des cases `noOption` pour le reste ; aucune case ne contient de texte d'interface.

---

## § 6. Schéma Postgres multi-organisation (Tech Lead)

Décisions 0006 et 0007. Région UE exigée ; fournisseur et compte : Samuel (§ 14, Q24).

**Règles communes**
- Chaque table métier a `organization_id uuid NOT NULL` (clé étrangère vers `organizations`), un index qui commence par `organization_id`, la RLS activée et forcée, et la politique type de la décision 0007 (`organization_id = app_current_org()` en lecture et en écriture) pour le rôle `vadrouille_app`. Les clés étrangères vers `trips` sont composites `(organization_id, trip_id)` : une ligne ne peut pas pointer vers le voyage d'une autre organisation.
- Aucun rôle n'a `BYPASSRLS` : le propriétaire des tables n'a aucune politique (il ne voit aucune ligne, RLS forcée) ; les fonctions `SECURITY DEFINER` et les vues partagées appartiennent à des rôles dédiés `vadrouille_fn_*` sans appartenance avec `SET` ni `INHERIT` (0036, B1-TL-2), avec des droits par colonne et des politiques étroites (décision 0007).
- Organisation transmise par `set_config('app.organization_id', …, true)` dans la transaction. Les permissions serveur (rôle `owner` ou `member`) sont vérifiées dans `src/server` ; la RLS double la vérification d'**organisation** (cadrage § 9), pas celle du rôle : au MVP, propriétaire et conseiller ont les mêmes droits sur les voyages ; seuls l'export et la suppression du compte sont réservés au propriétaire, contrôle repris en base par `purge_organization_data`.
- **Sommes de consommation** (décision 0083, migration 0010) : le quota du jour Google, le mois et l'enveloppe sont des sommes **globales** ; `vadrouille_app` les lit par la seule fonction `usage_forfait_totals()` (`SECURITY DEFINER`, rôle propriétaire `vadrouille_fn_usage`, sans appartenance avec `SET` ni `INHERIT`), qui rend des sommes et jamais une ligne, et seulement avec une organisation dans le contexte ; la somme du jour par organisation est celle de l'organisation du contexte.
- **Suppressions** : `vadrouille_app` n'a `DELETE` que sur `checklist_items`, `preferences` et `stays` ; les données d'un compte sont supprimées par `purge_organization_data` (qui couvre aussi `place_coordinates`) ; sur `place_coordinates`, `vadrouille_app` n'a que `SELECT` : remplacement d'une ligne et purge des lignes expirées passent par les fonctions `store_place_coordinates` et `purge_expired_coordinates` du rôle `vadrouille_fn_coords` (décision 0011 point 6) ; aucune autre suppression (décision 0007 amendée, tableau des droits).
- Toute migration ajoute sa politique et son test d'isolation (rôle `data`).

**Tables**
| Table | Colonnes principales | Clés et index | `organization_id` | RLS | Données personnelles |
|---|---|---|---|---|---|
| `users` (Better Auth) | `id`, `email`, `email_verified`, `created_at`, `updated_at` | `email` unique | exception : une personne peut appartenir à plusieurs organisations | `vadrouille_auth` (droits par table de la décision 0007) ; `vadrouille_app` : `SELECT` de sa seule ligne (`id = app_current_user()`, décision 0007) | oui (email) |
| `sessions` (Better Auth) | `id`, `user_id`, `token` (SHA-256 du jeton, jamais le jeton clair : B3b, vérification 7.1 de 0008), `expires_at`, `active_organization_id` (IP et agent utilisateur vidés avant écriture, décision 0008) | `token` unique ; `user_id` ; `expires_at` | exception : précède le choix d'organisation | `vadrouille_auth` seulement | oui (pseudonyme ; jeton haché ; sessions expirées purgées techniquement par lots bornés, § 12) |
| `accounts` (Better Auth, si la bibliothèque la crée pour la connexion par code) | `id`, `user_id`, `provider_id` | `user_id` | exception : authentification | `vadrouille_auth` seulement | oui (pseudonyme) |
| `verifications` (Better Auth) | `id`, `identifier` (`sign-in-otp-<adresse canonique>`), `value` (HMAC-SHA-256 du code lié à l'adresse, et compteur d'essais), `expires_at`, `updated_at` (migration 0009, B3b) | `identifier` ; `expires_at` | exception : avant toute session | `vadrouille_auth` seulement | oui (email en clair dans `identifier` jusqu'à la purge ; `updated_at` : date technique, non personnelle ; lignes consommées supprimées, lignes expirées purgées techniquement par lots bornés, § 12) |
| `rate_limits` (Better Auth, **créée seulement si B3 garde le limiteur intégré comme second verrou**, § 7) | `key` (HMAC de la clé du limiteur ; jamais en clair, décision 0008), `count`, `last_request` | `key` unique ; `last_request` | exception : limitation avant session | `vadrouille_auth` seulement | oui (pseudonyme ; fenêtres expirées purgées à l'écriture, § 12) |
| `action_rate_limits` (limiteur maison, **limiteur par défaut de la connexion par code et des actions sans compte**, § 7) | `key` (HMAC à préfixe de domaine par usage : `rl/v1/<action>/<fenêtre>/ip/<adresse IPv4 ou préfixe IPv6 /64>`, `rl/v1/<action>/<fenêtre>/email/<email normalisé>` ou `rl/v1/<action>/<fenêtre>/no-trusted-ip`, § 7, décision 0050), `window_start`, `expires_at` (échéance posée par la base, décision 0050), `count` | `key` unique ; `window_start` | exception : actions anonymes (écrans 2, 3 et 4, `/p/[token]`) | forcée ; rôle `vadrouille_limiter` seulement (décision 0007) | oui (pseudonyme, conservation courte : fenêtres expirées purgées à l'écriture, § 12) |
| `organizations` (Better Auth) | `id`, `name`, `slug` (valeurs neutres générées, jamais l'email), `kind` (`personal`, `agency`), `deletion_requested_at` (état « suppression en cours », § 12), `created_at` | `slug` unique | exception : `id` est l'organisation elle-même | `vadrouille_app` : `id = app_current_org()` ; `vadrouille_auth` : `SELECT`, `INSERT` **par colonnes** (`id`, `name`, `slug`, `kind`, `created_at` : jamais `deletion_requested_at`, qui reste nul à la création), `DELETE` (suppression de compte), jamais `UPDATE` ; `deletion_requested_at` écrit seulement par `purge_organization_data` (décision 0007) | non |
| `memberships` (Better Auth) | `id`, `organization_id`, `user_id`, `role` (`owner`, `member`), `created_at` | unique `(organization_id, user_id)` ; une seule adhésion `owner` par organisation qui n'est pas en suppression (déclencheur contraint différé, décision 0007) | oui | `vadrouille_app` : organisation courante ; `vadrouille_auth` : `SELECT`, `INSERT`, `DELETE` (suppression de compte), jamais `UPDATE` (décision 0007) | oui (pseudonyme) |
| `invitations` (Better Auth, hors MVP) | `id`, `organization_id`, `email`, `role`, `status`, `expires_at` | `organization_id` | oui | aucun droit au MVP (greffon d'invitation désactivé) | oui (email) |
| `trips` | `id`, `organization_id`, `created_by`, `request_id`, `destination`, `start_date`, `end_date`, `travellers_adults`, `travellers_children`, `current_version`, `status` (`active`, `archived` ; **aucune valeur de déblocage** : `Trip.unlocked` se calcule depuis `entitlements` seulement, § 5 ; `CHECK` sur les deux valeurs), `time_zone` (identifiant IANA, évolution E11), `created_at` | unique `(organization_id, request_id)` ; unique `(organization_id, id)` (cible des clés composites) ; `(organization_id, start_date)` | oui | type ; lecture partagée par la vue `shared_trip` (décision 0007) | oui (projet de voyage d'une personne) |
| `briefs` | `id`, `organization_id`, `trip_id`, `version`, `story` (récit libre), `pace`, `mobility`, `wishes` (codes `Category`), `limits`, `meal_budget`, `inferred_fields`, `created_at` | unique `(trip_id, version)` ; ajout seulement | oui | type | oui (récit libre) |
| `stays` | `id`, `organization_id`, `trip_id`, `kind` (`lodging`, `neighbourhood`), `place_id`, `label` (nom saisi ou maison), `from_date`, `to_date`, `arrival_time`, `departure_time`, `luggage` | `(trip_id, from_date)` | oui | type ; aucune vue partagée tant que Q50 n'est pas tranchée | oui (lieu de séjour) |
| `trip_versions` | `id`, `organization_id`, `trip_id`, `version`, `parent_version`, `request_id`, `snapshot` (JSONB validé par `TripSnapshotSchema` : `{ days: DaySnapshot[] }`, dérivé des jours de `TripSchema`, décision 0037), `patch` (JSONB `TripPatch`, nul pour la version 1), `author_kind` (`user`, `engine`, `workflow`), `author_user_id`, `created_at` | unique `(trip_id, version)` ; unique `(trip_id, request_id)` ; **aucune colonne `validation_report`** (décision 0011, point 5 : rapport en mémoire seulement) | oui | type ; `INSERT` et `SELECT` seulement (droits et déclencheur ; seule exception : `DELETE` par la fonction de suppression de compte, décision 0007 ; écart C16 avec la spécification B0 § 6) ; lecture partagée par la vue `shared_trip_version` (projection en liste blanche, § 12) | indirecte (via le voyage) |
| `generation_runs` | `id`, `organization_id`, `trip_id`, `workflow_run_id`, `kind` (`preview`, `full`, `batch`, `mini`), `phase`, `stop_reason`, `last_version`, `started_at`, `updated_at`, `finished_at` | `(trip_id, started_at)` | oui | type | non |
| `proposals` (aperçu et suite du tri, § 5) | `id`, `organization_id`, `trip_id`, `generation_run_id`, `phase` (`preview`, `deck`), `position` (1 à 8 pour l'aperçu), `slot_type` (`proposal`, `noOption`), `day`, `time`, `kind` (`activity`, `meal`), `candidate_id`, `content` (JSONB `ProposalRecord`, nul pour `noOption` ; `CHECK` des clés de premier niveau comme `candidates.facts`, `CHECK` : `content IS NULL` si et seulement si `slot_type = 'noOption'`), `created_at` | unique `(trip_id, generation_run_id, phase, position)` ; `(trip_id, phase)` | oui | type ; `vadrouille_app` : `SELECT`, `INSERT` seulement (aucune mise à jour : les décisions vont dans `preference_signals`) | indirecte (via le voyage) |
| `research_runs` | `id`, `organization_id`, `trip_id`, `generation_run_id`, `queries` (requêtes web, sans nom de personne), `pages_read`, `duration_ms`, `cost_estimate_micros`, `errors` (codes d'une énumération fermée, jamais un message de fournisseur), `started_at`, `finished_at` ; **aucun compteur de candidats trouvés, ancrés ou retenus** (décision 0011 point 2, question S4) | `(trip_id)` | oui | type | oui (indirecte : les requêtes sont tirées du brief d'une personne ; conservation : Q27) |
| `candidates` | `id`, `organization_id`, `trip_id`, `research_run_id`, `kind` (`place`, `event`), `name` (nom trouvé sur le web), `summary` (résumé maison), `category` (`Category`), `facts` (JSONB `StopFacts` ; `CHECK` : `(facts - ARRAY[<clés de StopFacts>]) = '{}'::jsonb`, aucune autre clé), `sources` (JSONB : tableau d'objets `{ label, url, checkedOn }` ; `CHECK` par une fonction `IMMUTABLE` qui vérifie, pour **chaque élément**, qu'il n'a que ces trois clés et que `url` commence par `https://`), `confidence`, `place_id` (écrit par l'étape d'ancrage pour un candidat `compatible` seulement, décision 0011 point 2), notes du Decider (`fit`, `not_for_me_risk` 1 à 10, `must_see`, `slot_fit` ; données maison issues de nos descriptions, 0027). Aucune colonne de verdict d'ancrage, de motif d'écart ni de date de contrôle (« Partie Q5 ») | `(trip_id, place_id)` | oui | type | non |
| `event_occurrences` | `id`, `organization_id`, `trip_id`, `candidate_id`, `place_id`, `starts_at`, `ends_at`, `timezone`, `category`, `price_note` (texte maison issu de la page de l'événement), `source_url`, `source_checked_at` (relecture de la page web, jamais Google), `status` (`confirmed`, `unconfirmed`) | `(trip_id, starts_at)` | oui | type | non |
| `feedback` | `id`, `organization_id`, `trip_id`, `target_stop_id`, `place_id`, `reason` (code), `text`, `scope` (`stop`, `trip`), `created_by`, `created_at` | `(trip_id)` | oui | type | oui (texte libre) |
| `preference_signals` | `id`, `organization_id`, `trip_id`, `request_id`, `candidate_id`, `place_id`, `category`, `signal` (`like`, `dislike`, `choose`, `nextOption`, `answerYes`, `answerNo`, `travelReduction`), `reason` (`PreferenceReason`), `origin` (`gesture`, `question`, `brief`), `status` (`confirmed`, `inferred`, `cancelled`), `created_at` | unique `(trip_id, request_id)` ; `(trip_id, category)` | oui | type | oui (goûts) |
| `preferences` | `id`, `organization_id`, `user_id`, `category`, `value`, `consented_at`, `created_at` | `(organization_id, user_id)` | oui | type | oui (goûts, avec accord) |
| `checklist_items` | `id`, `organization_id`, `trip_id`, `stop_id`, `kind` (`reservation`, `ticket`, `other`), `label`, `moment` (JSONB `ChecklistMoment`), `booking_url` (`CHECK` : commence par `https://`), `sponsored`, `done`, `done_at` | `(trip_id)` | oui | type, avec `DELETE` ; lecture partagée par la vue `shared_checklist` | indirecte (via le voyage) |
| `share_links` | `id`, `organization_id`, `trip_id`, `token_hash` (SHA-256 d'un jeton aléatoire de 32 octets), `created_by`, `created_at`, `expires_at` (fin du voyage + 30 jours, PO-7), `revoked_at` | `token_hash` unique ; unique `(trip_id) WHERE revoked_at IS NULL` (un lien actif par voyage) | oui | type ; lecture par `resolve_share_link` et par les vues partagées, chacune par son rôle propriétaire, des colonnes nommées et une politique `token_hash = ` hachage du jeton de la transaction, jamais `USING (true)` (décision 0007) | indirecte (le jeton en clair passe dans l'adresse : journaux de la plateforme, § 12, Q27) |
| `usage_ledger` | `id`, `organization_id`, `trip_id`, `generation_run_id`, `step`, `provider`, `sku`, `units`, `cost_estimate_micros`, `created_at` | `(organization_id, created_at)` ; `(trip_id)` ; unique partiel `(organization_id, generation_run_id, provider, sku)` où `generation_run_id` n'est pas nul (une ligne par méthode du forfait d'une génération ; les relectures, à identifiant nul, n'y sont pas soumises ; migration 0010, décision 0083) | oui | type ; ajout seulement ; lignes de forfait seulement (`CHECK` : `step` = `forfait`, fournisseur `modeles` ou `google`, unités et coût positifs ou nuls, unités nulles pour `modeles`) ; écrite par `vadrouille_app` sous `withOrg` (générations, relectures) ou sous le contexte de l'organisation technique des actions sans compte (pool `vadrouille_app`, décisions 0081 B9-TL-4 et 0083) ; sommes globales lues par la fonction `usage_forfait_totals()` (`SECURITY DEFINER`, propriété de `vadrouille_fn_usage`, `EXECUTE` à `vadrouille_app` seul ; `vadrouille_fn_usage` : `SELECT` par colonnes, sans `id`, `trip_id` ni `generation_run_id`, aucune écriture) ; `trip_id` et `generation_run_id` sans clé étrangère (identifiants historiques, Q48) ; `organization_id` en clé étrangère `ON DELETE RESTRICT` | non |
| `checkouts` | `id`, `organization_id`, `trip_id`, `request_id`, `stripe_checkout_session_id`, `price_variant`, `amount_cents`, `currency`, `method`, `status`, `created_by`, `created_at`, `updated_at` | unique `stripe_checkout_session_id` ; unique `(organization_id, request_id)` ; clé composite `(organization_id, trip_id)` | oui | type ; `vadrouille_app` : `SELECT`, `INSERT`, et `UPDATE` **sur la seule colonne `stripe_checkout_session_id`** (écrite après la création de la session de paiement, une seule fois : déclencheur qui refuse de remplacer une valeur non nulle) ; `status`, `amount_cents`, `currency`, `price_variant` et `updated_at` mis à jour par `vadrouille_webhook` seulement (décision 0007) ; organisation retrouvée par `checkout_organization` (propriété de `vadrouille_fn_checkout`) pour le webhook | indirecte |
| `billing` | `id`, `organization_id`, `stripe_event_id`, `type`, `livemode`, `checkout_id`, `amount_cents`, `currency`, `outcome` (`granted`, `alreadyGranted`, `ignored`, `rejected` avec code), `received_at` (la ligne et le droit sont écrits dans la même transaction, § 9) | **unique `stripe_event_id`** (idempotence) | oui | type ; ajout seulement ; écriture par `vadrouille_webhook` seulement (`INSERT … ON CONFLICT (stripe_event_id) DO NOTHING`, jamais `DO UPDATE`), qui a aussi `SELECT` sur les colonnes `id`, `stripe_event_id`, `checkout_id`, `outcome` pour la reprise idempotente (décision 0007) ; `checkout_id` est un identifiant historique **sans clé étrangère** (la ligne `checkouts` peut être purgée, la pièce reste : Q48) ; `organization_id` en clé étrangère `ON DELETE RESTRICT`, jamais `CASCADE` | indirecte |
| `entitlements` | `id`, `organization_id`, `trip_id`, `kind` (`preview`, `tripUnlocked`), `billing_id`, `granted_at` | **unique `(organization_id, trip_id, kind)`** (PO-4) ; clé composite `(organization_id, trip_id)` | oui | type ; écriture par `vadrouille_webhook` seulement ; aucune vue partagée | non |
| `place_coordinates` (B8, cache de coordonnées de 30 jours au plus) | voir décision 0011 point 6 et « Partie Q5 », § 6 | décision 0011 point 6 | oui | décision 0007 amendée | non |
| `place_memory` (**bêta**, cadrage § 6.7, non créée au MVP) | à concevoir en bêta, après Q5 | — | exception à justifier en bêta | à concevoir en bêta | — |

Tables de l'exécution durable : si le monde Postgres est retenu (décision 0009), ses tables vivent dans un schéma dédié `workflow`, gérées par la bibliothèque, et ne contiennent que des identifiants (§ 8) ; exception à `organization_id` justifiée, accès réservé au rôle des workflows.

**Colonnes interdites.** Aucune colonne, dans aucune table, pour un contenu Google : note (`rating`, `user_rating_count`), avis (`reviews`), horaires d'ouverture (`opening_hours`, `regular_opening_hours`), statut brut (`business_status`), photo (`photos`, `photo_url`), téléphone (`phone`), adresse (`address`, `formatted_address`), niveau de prix (`price_level`), nom Google (`display_name`), coordonnées (`lat`, `lng`, `location`), ni équivalent. Test `schéma: aucune colonne de contenu Google` (liste de motifs sur `information_schema.columns`). **Clés JSONB** : les colonnes JSONB qui portent un contrat fermé (`candidates.facts`, `candidates.sources`, `checklist_items.moment`, `proposals.content`) ont un `CHECK` qui refuse toute clé hors du contrat ; test `schéma: les JSONB refusent les clés hors contrat` (insertion dans `candidates.facts` ou dans un élément de `candidates.sources` d'une clé `rating`, `openingHours`, `displayName` ou `location` refusée ; `sources` avec une `url` en `http:` refusée). **Limite connue** : un `CHECK` par différence de clés ne contrôle que le premier niveau d'un objet (ou de chaque élément d'un tableau, par la fonction de `sources`). Pour les JSONB imbriqués (`trip_versions.snapshot`, `proposals.content`, `trip_versions.patch`), le verrou principal est la validation par le schéma Zod strict (`TripSnapshotSchema`, `ProposalRecordSchema`, `TripPatchSchema`) **avant toute écriture**, dans le seul module d'écriture de `src/server` ; le `CHECK` de premier niveau et les vues partagées en liste blanche sont des seconds verrous. Test `versions: une écriture d'instantané passe par le schéma strict` (B2 : une clé imbriquée `displayName` dans une étape est refusée avant la base). **Colonnes dérivées** : aucune colonne de verdict, de date de contrôle d'un lieu ni de durée de trajet (`grounding_verdict`, `grounding_checked_at`, `verified_at`, `travel_minutes` ou équivalent) ; test `schéma: aucune colonne dérivée de Google`. Seule exception, nommée dans le test `schéma: aucune colonne de contenu Google` : `place_coordinates.lat` et `.lng` (cache de 30 jours au plus, « Partie Q5 », décision 0011 point 6) ; aucune colonne `validation_report`.

---

## § 7. Authentification et organisations (Better Auth, Q4 tranchée par Samuel)

Décision 0008.

- **Connexion par code** : greffon `emailOTP` ; code à 6 chiffres, valable 10 minutes, 3 essais puis invalidé, stocké haché ; compte créé à la première vérification réussie ; aucun mot de passe (cadrage D8, écran 4).
- **Aucune route Better Auth exposée** (décision 0008). Le gestionnaire HTTP de Better Auth (`/api/auth/[...all]`) n'est **pas monté** : toute requête vers `/api/auth/*` reçoit 404. Les seules opérations utilisées sont appelées côté serveur, depuis `src/server/auth`, par les actions `requestCode`, `verifyCode` et `signOut` (`src/server/actions/compte.ts`, décision 0017 § 3) et par `getRequestContext()` : envoi du code, vérification du code (connexion), lecture de la session, déconnexion. Toute autre opération de la bibliothèque (suppression d'utilisateur, changement d'email, création, mise à jour ou suppression d'organisation, ajout, retrait ou changement de rôle d'un membre, invitations, sessions multiples) est **désactivée dans la configuration** quand la bibliothèque le permet, et en tout cas jamais appelée (règle ESLint du § 3 : `auth.api` seulement dans `src/server/auth` et `src/tenancy`, avec la liste des opérations permises). La suppression de compte passe par `deleteAccount` (§ 12). Tests `auth: aucune route /api/auth n'est exposée` et `auth: seules les opérations de la liste blanche sont appelées`.
- **Limitation des envois et des vérifications** (décision 0008) : **conception par défaut : notre limiteur, dans les actions** `requestCode` et `verifyCode`, avant tout appel à `auth.api`, sur la table `action_rate_limits` (rôle `vadrouille_limiter`, mêmes compteurs que les actions sans compte). Raison : le limiteur intégré de Better Auth est branché sur son routeur HTTP, que nous ne montons pas ; son stockage personnalisé (`rateLimit.customStorage`) ne s'exécuterait probablement pas lors d'un appel direct à `auth.api`. B3 vérifie ce point sur 1.7.7 et le note dans la décision 0008 ; si le limiteur intégré s'applique aussi aux appels `auth.api`, B3 peut le garder comme **second verrou** (table `rate_limits`, clés HMAC par `customStorage`), jamais comme seul verrou. Clés : **HMAC-SHA-256** avec `RATE_LIMIT_HMAC_SECRET`, sur un message à **préfixe de domaine par usage** (`rl/v1/<action>/<fenêtre>/ip/…`, `rl/v1/<action>/<fenêtre>/email/…`, la fenêtre étant sa durée en secondes, décision 0050, B3-TL-6) : une même valeur donne des clés différentes d'un usage à l'autre, et le secret ne sert à rien d'autre ; les clés d'un appel (adresse IP puis e-mail) sont traitées dans une transaction et **l'incrément s'arrête à la première clé au-dessus de son seuil** (les suivantes restent inchangées : une adresse IP refusée n'épuise pas la limite d'une adresse e-mail tierce ; décision 0051, point 6.2.2, acceptée par 0050) ; aucune adresse IP ni email en clair en base ; test `auth: aucune adresse IP ni email en clair dans les limiteurs`. **Purge à l'écriture** : chaque écriture du limiteur supprime, par lot borné, les fenêtres expirées de toutes les clés (donnée technique sans valeur après la fenêtre ; ce n'est pas une durée de conservation, Q27) : une entrée reste au plus jusqu'à la première écriture du limiteur qui suit la fin de sa fenêtre ; aucune tâche planifiée. Valeurs de départ : 3 envois par 10 minutes et par adresse IP, 10 vérifications par 10 minutes et par adresse IP ; par adresse email **normalisée** (minuscules, NFC, alias `+` retiré, clé HMAC), 5 envois et 10 vérifications par heure. La forme normalisée ne sert **qu'au limiteur** : l'identité du compte est l'adresse en minuscules, jamais la forme sans alias (sinon `a+x@…` et `a@…`, deux boîtes distinctes chez certains fournisseurs, fusionneraient en un compte) ; test `auth: deux adresses qui ne diffèrent que par l'alias + sont deux comptes distincts`. Les seuils réels relèvent de Q86 (Tech Lead, Sécurité). `disableIpTracking` n'est pas activé (dans Better Auth 1.7.7, il désactive le limiteur intégré) ; l'IP et l'agent utilisateur sont vidés de la session par un crochet. Même réponse pour une adresse connue ou inconnue (décision 0017 § 4). Un attaquant peut épuiser la limite par email d'une autre personne et lui refuser la connexion pendant une heure : limite connue, acceptée au MVP, suivie avec Q86.
- **Déconnexion en panne de base** (B3b, revue consolidée du head `f0b8c5a` de la PR #446, mineur 12) : Better Auth 1.7.7 journalise l'erreur de base de `signOut` et efface quand même le cookie ; l'opération `signOut` rend alors `ok` alors que la ligne `sessions` peut subsister jusqu'à son expiration (purge technique, § 12). Le jeton n'étant plus chez le client, la session n'est plus utilisable que par qui l'aurait copié ; à reprendre si une révocation garantie est exigée (B11, réauthentification).
- **Adresse IP de confiance par environnement** (`TRUSTED_IP_HEADER`, décision 0008) : en staging et en production sur Vercel, seul `x-vercel-forwarded-for` est lu (à confirmer par B3 sur la documentation Vercel et sur staging) ; `X-Forwarded-For`, `X-Real-IP`, `Forwarded` et les autres sont ignorés ; en local, aucun en-tête n'est lu (`TRUSTED_IP_HEADER` refusée au démarrage, compartiment commun ; les tests du limiteur injectent leur configuration) ; en CI, `TRUSTED_IP_HEADER` n'est admise que sur un serveur autonome lié à la boucle locale (décision 0051, point 2.3), et seuls les tests posent l'en-tête (décision 0050). Sans en-tête de confiance, la requête tombe dans un compartiment commun strict (échec fermé). Tests `auth: limitation des envois` (en-têtes forgés et changeants, variantes de casse et d'alias), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`.
- **Limiteur des actions sans compte** (`structureBrief`, `suggestLodging`, lecture `/p/[token]`, et `requestCode`, `verifyCode` ci-dessus) : hors Better Auth, table `action_rate_limits` en Postgres (§ 6), accès par le seul rôle `vadrouille_limiter` (décision 0007), même adresse IP de confiance. Limite par adresse IP **bien inférieure au plafond global** : valeurs de départ 5 par heure et 20 par jour par action et par adresse, et le plafond global quotidien vaut au moins 50 fois la limite quotidienne par adresse, pour qu'une seule adresse ne puisse pas l'épuiser ; le compartiment commun « sans IP de confiance » a sa propre limite stricte. **Regroupement IPv6** : une adresse IPv6 est comptée par son **préfixe /64** (un abonné reçoit en général un /64 entier et peut en changer l'adresse à volonté) ; une adresse IPv4 est comptée entière ; une IPv4 intégrée à une IPv6 est ramenée à l'IPv4. Test `limitation: les adresses d'un même préfixe IPv6 /64 partagent un compteur` (B3 pour la connexion, B9 pour les actions sans compte). **Risque résiduel, non accepté ici** : avec ces valeurs, une cinquantaine d'adresses (ou de préfixes /64) suffit à épuiser le plafond global quotidien, ce qui coupe les écrans 2 et 3 à tout le monde jusqu'au lendemain (déni de service) et engage la dépense de modèle jusqu'au plafond. Le plafond global et l'acceptation de ce risque engagent de l'argent et la disponibilité du produit : **décision de Samuel (Q45)**, nouvelle question 3 du § 17 ; les seuils techniques par adresse restent au Tech Lead et à la Sécurité (Q86). Test `limitation: une adresse seule n'épuise pas le plafond global des actions sans compte` (B9).
- **Protection des requêtes** : les actions serveur s'appuient sur le contrôle d'origine de Next.js (en-tête `Origin` comparé à l'hôte) ; `BETTER_AUTH_URL` et `APP_URL` fixent l'origine attendue ; cookie de session `httpOnly`, `secure`, `sameSite=lax`. **Hachage des jetons de session : critère bloquant de B3.** B3 vérifie sur 1.7.7 si Better Auth stocke les jetons de session hachés et note le résultat dans la décision 0008. S'ils sont en clair, B3 ne fusionne pas tant qu'une parade n'est pas décidée par le Tech Lead (amendement de 0008) et testée (`auth: aucun jeton de session en clair dans sessions`).
- **Organisations et rôles** : greffon `organization` ; `owner` = `propriétaire`, `member` = `conseiller` (cadrage § 6.8) ; `admin` non attribué au MVP ; création d'organisation par l'utilisateur, invitations et changements de rôle désactivés au MVP. Invariant en base : toute organisation **qui n'est pas en suppression** (`deletion_requested_at` nul) a exactement une adhésion `owner` ; une organisation en suppression n'en a plus aucune (§ 12) (déclencheur contraint différé, décisions 0007 et 0008, test `organisations: exactement un propriétaire`). Les droits de `vadrouille_auth` sont limités table par table (décision 0007).
- **Organisation personnelle** (PO-3) : créée avec l'adhésion `owner` dans la transaction de création du compte ; posée comme organisation active de chaque session ; invisible dans l'interface au MVP.
- **Session → `AdapterContext` → RLS** : `getRequestContext()` lit la session, vérifie l'adhésion à l'organisation active et renvoie `{ organizationId, userId, role }` (évolution E6) ; ce contexte est passé à l'adaptateur et à `withOrg`, qui pose `app.organization_id` et `app.user_id` pour la transaction (décision 0007). Aucune action n'accepte une organisation venue du client ; un identifiant de voyage reçu du client est toujours filtré par la RLS. En phase 0, `getRequestContext()` de `src/adapters` renvoie le contexte simulé (décision 0013 § 3.6) ; B3 le remplace sans changer ce qu'elle renvoie : B3b crée `getServerRequestContext()` (asynchrone, `src/server/session.ts`), B3c rend `getRequestContext()` asynchrone (décision 0077 § 5.3).
- **Adaptateur `auth`** (handover front § 17, point 3) : contrat `AuthAdapter` (décision 0017 § 3 : `getAuthAdapter` lit `AUTH_ADAPTER`) ; adaptateur simulé (F8) et adaptateur Better Auth passent la même suite de tests.
- **Emails** : en local et en CI, SMTP vers Mailpit, sans fournisseur externe ; textes des emails dans `src/i18n/fr.json` ; le fournisseur réel relève de Samuel (Q25).
- **Accès administrateur** : aucune interface d'administration au MVP (jugement du Tech Lead) ; quand elle existera, double authentification obligatoire (greffons `admin` et `twoFactor`, cadrage § 9).

---

## § 8. Workflows durables (Tech Lead pour l'exécution, Product Owner pour les règles)

Décision 0009. Pour chaque étape, les tableaux donnent : type (déterministe, IA, appel externe) ; entrée → sortie (contrats stricts de l'étape, identifiants seulement) ; données Google dans l'étape (« oui » interdit pour une étape IA ; une étape « oui » recharge la donnée à l'intérieur et ne la renvoie jamais) ; plafond vérifié avant l'appel (`usage_ledger`) ; relances bornées ; idempotence ; état publié dans `GenerationStatus`.

### Workflows couverts
Les workflows 1 à 5 (aperçu, ancrage, planification et validation, voyage complet, recalcul par lot et révision unitaire) sont fixés dans la **« Partie Q5 », § 8**, et leurs règles de données dans la **décision 0011** (points 3, 4 et 7) : ancrage en mémoire avec le `placeId` pour seule trace, réparation déterministe sans appel de modèle, plan en mémoire publié dans une seule étape. Le workflow 6 (paiement) est fixé ci-dessous.

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
Les entrées et sorties d'étapes sont sérialisées et conservées par le moteur d'exécution durable : elles sont traitées comme un stockage durable. Règle (décision 0009) : elles ne contiennent que des identifiants internes (organisation, voyage, version, exécution, candidat), des compteurs et des codes d'erreur ; ni `placeId` (relu en base par l'étape qui en a besoin), ni verdict, ni date de contrôle (décision 0011, point 3, qui amende 0009). Jamais de donnée Google : horaires, prix, statut brut, note, adresse, photo, téléphone, coordonnées, durée, distance ou matrice de Routes API. Jamais le brief ni un texte libre. **Erreurs normalisées** : une erreur de fournisseur ou de base est convertie, à l'intérieur de l'étape, en un code d'une énumération fermée (`API_ERROR_CODES` ou codes d'étape typés) et en `retryable` ; ni message, ni pile, ni corps de réponse d'un fournisseur (qui peuvent contenir un fragment de prompt, du brief ou une donnée Google) ne sortent de l'étape ni n'entrent dans `research_runs.errors`. Une étape qui a besoin d'une donnée Google la recharge côté serveur à l'intérieur de l'étape et ne la renvoie pas. Les contrats d'entrée et de sortie de chaque étape sont des types maison stricts sans champ pour ces données. Une étape d'ancrage n'ajoute rien à cette liste : elle écrit `candidates.place_id` et ne renvoie que l'identifiant de la recherche (0011 point 3). Les compteurs admis dans l'état sérialisé sont sans lien avec l'ancrage (pages lues, par exemple).

Test nommé `workflows: aucune donnée Google dans l'état sérialisé` : pour chaque étape, l'entrée et la sortie sérialisées sont validées par leur contrat strict ; les champs d'erreur ne prennent que des valeurs de l'énumération (une erreur de fournisseur simulée dont le message contient un nom de lieu et une adresse ne laisse que son code) ; aucune clé interdite n'apparaît, à aucun niveau : `rating`, `userRatingCount`, `openingHours`, `regularOpeningHours`, `currentOpeningHours`, `businessStatus`, `priceLevel`, `photos`, `phone`, `nationalPhoneNumber`, `internationalPhoneNumber`, `address`, `formattedAddress`, `displayName`, `reviews`, `lat`, `lng`, `latitude`, `longitude`, `location`, `viewport`, `duration`, `staticDuration`, `distanceMeters`, `polyline`.

---

## § 9. Paiement en mode test

Phase 0 : la décision 0020 a livré l'écran 9 avec un adaptateur de paiement simulé en mémoire (`PaymentAdapter`, `PaymentSimulator`, `src/server/config/offer.ts`). Ce chapitre décrit le paiement serveur de B4, qui suit les mêmes contrats.

- **Stripe Checkout**, TWINT et carte (cadrage § 6.4) : la session de paiement est créée côté serveur par `startCheckout`, avec `price_data` construit depuis la configuration (`src/server/config/offer.ts`, 29 CHF, Q2, jamais en dur), montant en centimes (`2900`) et devise `CHF` dans les données ; moyens `card` et `twint` ; métadonnées `checkoutId` ; ligne `checkouts` écrite avant la redirection, avec l'instantané du prix (décision 0020 § 1.3).
- **Webhook** `/api/v1/webhooks/stripe` : corps brut lu tel quel, signature vérifiée avec le secret de signature (`STRIPE_WEBHOOK_SECRET`) et **tolérance d'horodatage** de la bibliothèque (300 s par défaut, jamais désactivée) ; une signature invalide ou un horodatage hors tolérance (rejeu d'un vieil événement signé) renvoie 400 sans rien écrire. La route est un route handler (`src/app/api/v1/webhooks/stripe/route.ts` → `src/server/routes/stripe-webhook.ts`, § 3), jamais une action serveur. Événements traités : `checkout.session.completed` et `checkout.session.async_payment_succeeded` ; les autres sont enregistrés (`outcome = ignored`) sans effet. Remboursement et litige (`charge.refunded`, `charge.dispute.created`) : enregistrés `ignored` avec une alerte sans donnée personnelle ; leur effet sur le droit suit Q129 (Samuel).
- **Une seule transaction** (décision 0007, rôle `vadrouille_webhook`) : organisation retrouvée par `checkout_organization` ; contrôles ; insertion dans `billing` ; mise à jour de `checkouts.status` ; si les contrôles passent, insertion du droit `tripUnlocked` dans `entitlements` ; validation. Une panne avant la validation n'écrit rien : Stripe rejoue et l'événement est traité comme neuf. Il n'existe donc jamais de ligne `billing` « traitée » sans le droit correspondant.
- **Contrôles avant tout droit**, chacun contre la ligne `checkouts` (jamais contre les métadonnées seules) : `livemode = false` (le mode test seul est accepté tant que Samuel n'a pas décidé la mise en production) ; `payment_status = paid` ; `amount_total` égal à `checkouts.amount_cents` ; devise égale à `checkouts.currency` (comparaison sans casse : Stripe écrit `chf`) ; identifiant de session Stripe égal à `checkouts.stripe_checkout_session_id` et métadonnée `checkoutId` cohérente ; voyage `checkouts.trip_id` appartenant à l'organisation retrouvée (clé composite `(organization_id, trip_id)` et lecture sous RLS). Un contrôle en échec enregistre `outcome = rejected` avec son code, n'accorde rien, renvoie 200 (inutile que Stripe rejoue) et produit une alerte sans donnée personnelle.
- **Session Stripe inconnue** (aucune ligne `checkouts` pour `stripe_checkout_session_id` : `checkout_organization` ne renvoie rien) : aucune organisation, donc aucune ligne `billing` possible (`organization_id NOT NULL`, RLS) ; la transaction n'écrit rien, n'accorde rien, renvoie 200 et produit une alerte sans donnée personnelle (identifiant d'événement, type, code `unknown_checkout`). Un paiement réellement encaissé dans ce cas se règle à la main sur l'alerte ; le remboursement suit Q129 (Samuel, argent). Test `paiement: un événement d'une session inconnue n'écrit rien, n'accorde rien et alerte`.
- **Idempotence et reprise** : `stripe_event_id` unique ; insertion par `ON CONFLICT (stripe_event_id) DO NOTHING` ; un événement déjà reçu ne réécrit rien, `vadrouille_webhook` relit la ligne `billing` existante (droit `SELECT` par colonnes, décision 0007) et le droit associé, puis l'étape « suite » est rejouée : si le droit existe sans workflow 4 démarré, celui-ci est démarré (un seul par droit). Une réconciliation au chargement de `Trip.unlocked` fait de même. Le droit `tripUnlocked` est unique par voyage : un second paiement du même voyage ne crée pas un second droit (PO-4, `outcome = alreadyGranted` ; remboursement : Q129). La décision 0020 garde, pour le simulé, sa machine d'états ; B4 y ajoute la déduplication par identifiant d'événement.
- **Le droit « voyage débloqué » n'est accordé que par le webhook** vérifié. La page de retour après paiement n'accorde rien : elle attend le droit (lecture de `Trip.unlocked` ou `CheckoutStatus`). Adresses de retour construites depuis `APP_URL`, jamais depuis la requête.
- L'organisation est celle de la ligne `checkouts`, retrouvée par `checkout_organization` (décision 0007), jamais crue depuis les métadonnées seules. `vadrouille_app` ne peut écrire ni dans `billing` ni dans `entitlements`.
- **Clés de test uniquement**, et seulement quand Samuel aura ouvert le compte (Q26). `src/server/env/index.ts` refuse de démarrer avec une clé Stripe de production (§ 2).
- **Paiement simulé côté serveur** (B4, jusqu'à l'ouverture du compte) : même contrat (`PaymentAdapter`), webhook simulé `/api/v1/webhooks/simulated` traité par le même code (signature, contrôles, transaction, idempotence, droit). **Fermé par défaut** : la route répond 404 sauf si `SIMULATED_WEBHOOK_ENABLED=true` ; activée en local et en CI seulement par défaut ; sur un déploiement accessible sur Internet seulement selon la réponse de Samuel à Q131, puis refermée ; **jamais sur un déploiement de production** (refus au démarrage, `isProductionDeployment`). Secret `SIMULATED_WEBHOOK_SECRET` hors dépôt, au moins 32 octets aléatoires, distinct par environnement.
- **Tests de B4** : `paiement: un événement rejoué ne crédite pas deux fois`, `paiement: signature invalide refusée sans écriture`, `paiement: horodatage de signature hors tolérance refusé sans écriture`, `paiement: le droit n'est accordé que par le webhook`, `paiement: prix lu dans la configuration`, `paiement: statut, montant, devise, mode ou voyage incohérents n'accordent rien`, `paiement: une panne entre l'enregistrement et le droit ne perd pas le paiement` (panne injectée après l'insertion dans `billing` : rien n'est validé ; le rejeu accorde le droit une fois), `paiement: un événement déjà enregistré relance la suite manquante`, `paiement: un événement d'une session inconnue n'écrit rien, n'accorde rien et alerte`, `paiement: webhook simulé fermé par défaut et en production`.

---

## § 10. Règles Google

Reprise du cadrage § 6.5 et du handover front § 8 ; chaque règle a son test nommé et sa tâche. Les règles qui dépendent de Q5 (statut des données dérivées, cache de coordonnées) suivent la règle provisoire de Samuel et sont complétées dans « Partie Q5 ».
| Règle | Test nommé | Tâche |
|---|---|---|
| Seul `placeId` est stocké durablement ; aucune colonne de contenu Google (§ 6) | `schéma: aucune colonne de contenu Google` | B1 |
| Aucune colonne dérivée de Google (verdict, date de contrôle, durée de trajet, rapport de validation), règle provisoire de Q5 (0027, 0011) | `schéma: aucune colonne dérivée de Google` | B1 |
| L'instantané d'une version ne contient ni durée de trajet ni date de contrôle | `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` | B2 |
| L'état persistant des workflows ne contient que des identifiants internes, des compteurs et des codes d'erreur ; jamais de donnée Google, de `placeId`, de verdict, de coordonnées ni de durée (0011) | `workflows: aucune donnée Google dans l'état sérialisé` | B9 |
| Un plafond de coût ou un quota atteint conserve le dernier programme valide, sans version partielle publiée (extension signalée du test de sortie du cadrage § 9) | `workflows: plafond ou quota atteint conserve le dernier programme valide` | B9 |
| Aucun prompt ne contient de donnée Google : le constructeur de prompts (`src/ai`) n'accepte que des types maison (identifiants internes, résumés de notre recherche web) ; un test parcourt les prompts journalisés, étendu en canari à valeurs sentinelles par B9 (« Partie Q5 », § 10) | `prompts: aucun prompt journalisé ne contient de donnée Google` | B7, B9 |
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
- **Suite de contrat commune** : une même suite de tests (`tests/support/trip-adapter-contrat.ts`, décision 0086 § 1.5, au lieu de `src/adapters/contract.suite.ts`) exécutée sur `mock` (`tests/unit/adapters/trip-adapter-contrat.test.ts`) et sur `api` (base de test, `tests/db/adaptateur-api.test.ts`) : formes des sorties, `null` ou liste vide pour un voyage d'une autre organisation (isolation), cohérence des résumés et des cartes. Test nommé `adaptateurs: mock et api passent la même suite de contrat` (B6). **Versions et conflits** entrent dans la suite avec la première écriture versionnée (B11, B6-PO-15) : `TripAdapter` n'en porte aucune dans B6.

---

## § 12. Sécurité et conformité

**Modèle de menace.** Les rôles Postgres séparés (décision 0007) protègent contre les **erreurs** de code (une requête sans contexte, un `DELETE` oublié, une fonction appelée hors de son cas d'usage) et contre l'abus des points d'entrée exposés (webhooks, vue partagée, limiteurs). Les rôles accordés à `vadrouille_app` le sont **`WITH INHERIT FALSE, SET TRUE`** (décision 0007) : `vadrouille_app` n'hérite d'aucun de leurs droits (ni `billing`, ni `entitlements`, ni `EXECUTE` sur la purge) et ne les obtient que par un `SET LOCAL ROLE` explicite, dans le seul cas d'usage prévu. Ils ne protègent pas contre une **compromission** du processus serveur : `vadrouille_app` peut prendre les rôles `vadrouille_webhook`, `vadrouille_account_admin`, `vadrouille_share` et `vadrouille_limiter` par `SET LOCAL ROLE` et poser lui-même `app.organization_id`. Des identifiants de connexion distincts par rôle sont une évolution possible, à décider par le Tech Lead si un besoin apparaît (hors MVP).

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
- Export et suppression des données (cadrage § 3.5) : B11. `exportAccount` et `deleteAccount` exigent une **réauthentification récente** : la session doit avoir été ouverte par une vérification de code réussie depuis moins de 10 minutes (horodatage de création de la session, ou horodatage de réauthentification si B3 en ajoute un) ; sinon l'action renvoie `reauthentication_required` (code ajouté à `API_ERROR_CODES` par B11) et l'interface demande un nouveau code (parcours à fixer par UX/UI et le Product Owner : nouvelle question 4 du § 17). Test `compte: export et suppression exigent une réauthentification récente` (B11). `deleteAccount`, réservé au propriétaire, est **idempotent et reprenable** ; il suit ces étapes :
  1. **Marque et purge métier** (une transaction `withOrg`, `SET LOCAL ROLE vadrouille_account_admin`) : `purge_organization_data` (décision 0007) pose `organizations.deletion_requested_at` s'il est nul (état « suppression en cours »), puis supprime les données métier de l'organisation personnelle, **sauf `billing` et `usage_ledger` tant que Q48 est ouverte** (pièces comptables et registre des coûts : leur sort est une décision de Samuel). Elle refuse (exception, rien n'est supprimé) si l'organisation a **un autre membre** que l'appelant (décision 0007) : ce cas suit la dernière phrase de ce point. Rejouée, elle ne trouve plus rien à supprimer et ne lève pas d'erreur.
  2. **Authentification** (depuis `src/server/account/delete.ts` seulement, par `vadrouille_auth`, puis `vadrouille_limiter` pour le limiteur) : `sessions`, `accounts`, `verifications` (par identifiant email), entrées du limiteur sous les clés HMAC de son email (`action_rate_limits`, et `rate_limits` si B3 garde le limiteur intégré), adhésions, puis `users`. Chaque suppression vise des lignes qui peuvent déjà manquer : rejouer l'étape est sans effet. Les entrées du limiteur sous la clé HMAC d'une adresse IP ne sont rattachées à aucun compte ; elles sont supprimées par la purge à l'écriture du limiteur (§ 7) : au plus jusqu'à la première écriture qui suit la fin de leur fenêtre (une journée au plus pour la plus longue), sans tâche planifiée.
  3. **Organisation** : tant que Q48 est ouverte, la ligne `organizations` **n'est pas supprimée** : elle reste en état « suppression en cours », sans adhésion ni donnée personnelle (nom et `slug` neutres), parce que `billing.organization_id` et `usage_ledger.organization_id` la référencent (`ON DELETE RESTRICT` : jamais de cascade sur les pièces). Sa suppression finale, avec ou sans les pièces, suit la réponse de Samuel à Q48. L'invariant « exactement un propriétaire » ne s'applique pas à une organisation en suppression (décision 0007).
  4. **Reprise** : une panne entre les étapes laisse l'organisation en état « suppression en cours ». `getRequestContext()` refuse toute session d'une organisation dans cet état (`unauthenticated`, aucune lecture ni écriture métier). La reprise ne demande donc pas de contexte : `deleteAccount` relance lui-même les étapes manquantes en cas d'erreur, et une vérification de code réussie pour une personne dont l'organisation personnelle est en suppression reprend l'étape 2 au lieu d'ouvrir une session. **Ordre dans `verifyCode`** : (a) notre limiteur ; (b) vérification du code par Better Auth ; (c) le crochet `databaseHooks.session.create.before` lit l'organisation personnelle et, si elle est en suppression, **refuse la création de la session** (aucun cookie posé ; B3 vérifie sur 1.7.7 qu'un refus du crochet n'ouvre aucune session) ; (d) `verifyCode` appelle alors la reprise de l'étape 2 (`src/server/account/delete.ts`), qui supprime aussi toute session restante ; (e) la réponse est `unauthenticated`. Aucune session n'existe donc, même brièvement, pour une organisation en suppression.
  5. Les journaux suivent la durée de conservation fixée par Samuel (Q27).
  Une organisation qui a d'autres membres n'est pas purgée : seule l'adhésion de la personne est retirée (cas hors MVP, PO-3). Tests (B11) : `compte: la suppression efface les données métier et d'authentification` (et laisse `billing` et `usage_ledger` intacts tant que Q48 est ouverte), `compte: une suppression interrompue reprend sans erreur ni doublon` (panne injectée entre les étapes 1 et 2, puis entre les suppressions de l'étape 2 : la relance termine, la session restante est refusée entre-temps).
- **Vue partagée** `/p/[token]` : en-têtes `Referrer-Policy: strict-origin` sur `/p/*` (l'origine seule est envoyée, jamais le chemin qui porte le jeton, et rien en cas de passage de `https` à `http` ; `no-referrer` n'est pas retenu : il supprimerait le référent dont la restriction de la clé navigateur Google par référents HTTP a besoin pour la carte de la vue partagée), `X-Robots-Tag: noindex, nofollow`, `Cache-Control: no-store` ; liens sortants avec `rel="noopener noreferrer"` ; limite par adresse IP (`action_rate_limits`) ; lecture par les vues partagées seulement, qui exigent un jeton valide (décision 0007) et projettent une **liste blanche de clés** de l'instantané (`shared_trip_version` : jamais la colonne `snapshot` telle quelle ; ni `patch`, ni étiquette de logement des `terminus` tant que Q50 n'est pas tranchée), réponse validée par un `SharedTripSchema` strict, qui n'a pas de champ `organizationId` (test `partage: SharedTrip n'expose pas organizationId`) ; aucune information de logement tant que Q50 n'est pas tranchée ; **aucune coordonnée** : ni `getSharedTrip` ni `getPlaceDetails` appelé depuis la vue partagée ne lisent ou n'exposent `place_coordinates` (aucune vue partagée sur cette table, décision 0011 point 6 ; test `partage: la vue partagée n'expose jamais place_coordinates`). **`getPlaceDetails` depuis la vue partagée** : appelé en anonyme, il exige le jeton du lien et **un `placeId` qui appartient au voyage de ce lien** : le serveur relit, sous `vadrouille_share`, les `placeId` projetés par `shared_trip_version` (étapes, événements, idée « Surprends-moi » de la version courante) et refuse tout autre `placeId` par `not_found`, **avant tout appel à Google** ; il passe ensuite par la limite par adresse et par un plafond propre aux lectures partagées (Q45 pour sa valeur). Sans cette règle, un jeton valide permettrait d'interroger l'API Google payante pour n'importe quel lieu. Test `partage: getPlaceDetails refuse un placeId hors du voyage du lien` (B12 : un `placeId` d'un autre voyage et un `placeId` inventé renvoient `not_found` sans appel au client Google simulé). **Jeton dans les journaux** : le jeton en clair est dans le chemin de l'adresse, donc dans les journaux d'accès de la plateforme d'hébergement et de tout intermédiaire ; nos journaux applicatifs le masquent (liste des champs masqués), ainsi que **les attributs de traces et d'erreurs** : `http.url`, `http.target`, `url.full`, `url.path`, `http.route` réel, en-tête `Referer` des traces OpenTelemetry, événements et fil d'Ariane de Sentry, adresse de page et propriétés de PostHog ; le chemin y est réécrit en `/p/[token]` avant tout export. Test `traces: le jeton de /p/[token] n'apparaît dans aucun attribut exporté` (B12, avec des exportateurs simulés). Sa durée de vie dans les journaux de la plateforme est à couvrir par la politique de conservation (Q27, Samuel) ; un lien révoqué ou expiré n'ouvre plus rien, même relu dans un journal. Tests `partage: en-têtes de confidentialité et limite par adresse` (dont `Referrer-Policy: strict-origin` sur `/p/*`) et `vues partagées: l'instantané partagé ne contient que les clés de la liste blanche` (instantané de test avec une clé en trop et une étiquette de logement : absentes de la vue) (B1 pour la vue, B12 pour la route).
- **Sauvegardes et retour arrière** : sauvegardes de la base, test de restauration et procédure de retour arrière d'une migration : pas de conception ici, car elles dépendent du fournisseur (Q24, Samuel). Critère de B1 : procédure écrite de retour arrière des migrations ; test de restauration à faire sur la base de staging dès que Q24 est tranchée.
- **Durées de conservation** (voyages, briefs, comptes, journaux, limiteur) : renvoyées à Samuel (Q27). **Purges techniques** (données sans valeur une fois expirées ; ce ne sont pas des durées de conservation) : les limiteurs (`action_rate_limits`, et `rate_limits` s'il existe) purgent leurs fenêtres expirées à l'écriture (§ 7) ; `requestCode` et `verifyCode` suppriment, par lot borné, les lignes de `verifications` expirées ou consommées (dont l'email en clair de `identifier`) et les lignes de `sessions` dont `expires_at` est passé (si Better Auth 1.7.7 le fait déjà, B3 le constate et garde le test). Test `auth: les vérifications et sessions expirées sont purgées` (B3 : une vérification et une session expirées disparaissent à la requête suivante ; une session valide reste). **Seule autre purge automatique** : les coordonnées expirées de `place_coordinates` (règle provisoire de Samuel, 30 jours au plus, 0027 ; ce n'est pas une durée de conservation de Q27), supprimées au plus tard à 30 jours ; le mécanisme de purge (déclencheur, secret, tests) est défini par la spécification de B8 (décision 0011 point 6). Aucune autre avant la décision de Samuel. À couvrir par Q27 : les journaux de la plateforme qui contiennent l'adresse `/p/[token]` et les requêtes de `research_runs.queries`.
- Secrets côté serveur seulement ; séparation test et production ; aucune clé de production (garde de `src/server/env/index.ts`, § 2).

---

## § 13. Observabilité et coûts

- **`usage_ledger`** (amendé par la décision 0083, B7-TL-6 et B7-TL-9) : **aucune ligne par appel**. Au début d'une génération (aperçu, voyage complet, mini-recherche), d'une relecture ou d'une action sans compte, `reserverForfait` ou `reserverAction` (`src/server/usage/reservation.ts`, seul module qui écrit la table) réserve un **forfait** et écrit une ligne par méthode du forfait (`step` = `forfait`, fournisseur `modeles` ou `google`, SKU, unités et coût au prix plein, valeurs fonction du seul profil et de la configuration) ; les appels sont ensuite bornés par le registre en mémoire de P0r2. `src/ai`, `src/research` et `src/grounding` ne connaissent que le port de consommation et n'écrivent jamais la table.
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
| Fournisseurs de modèles (Anthropic ; Google Gemini pour la comparaison de P0) | Brief, notation (Decider) | selon le fournisseur (à vérifier) ; critère proposé : aucun entraînement sur nos données, contrat de sous-traitance | 200 CHF au plus (IA et recherche web) | à décider par Samuel (Q9 pour Gemini ; Q46) |
| DeepSeek (0027, variantes A et B) | Recherche web à partir du brief, raisons des lieux retenus, notation et raisons de la variante A | probablement hors de Suisse et de l'UE (à vérifier) ; sous-traitance et entraînement sur nos données : à vérifier ; reçoit le brief (données personnelles possibles) | compris dans les 200 CHF ci-dessus | à décider par Samuel (Q9, Q46) ; **transfert hors Suisse et UE : nouvelle question 5 du § 17** |
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

### Décisions du Tech Lead (`docs/decisions/`, statut « proposé », définitives sans veto de Samuel avant le 2026-10-13 ; 0011 et l'amendement de 0007 qu'elle porte : avant le 2026-10-14)
Rédigées le 2026-10-08 dans #27, reprises le 2026-10-11 sans leurs parties qui dépendent de Q5. L'accord tacite sous veto ne vaut que pour leur partie technique : il **ne couvre pas les aspects juridiques** (conservation et purge des données : Q27, Q48), qui restent soumis à une décision écrite de Samuel. **La décision 0011 est écrite par la PR #27** (« Partie Q5 », règle provisoire de Samuel, 2026-10-12) ; elle amende 0009 (point 3) et 0010 (principes 6 et 8).
| Décision | Objet |
|---|---|
| 0006 | Stack serveur : actions serveur, Drizzle ORM 0.45.4, drizzle-kit 0.31.11, `pg` 8.23.1, Postgres 17 en conteneur local et en CI ; amendements proposés de 0017 § 3.3 et 0020 § 11 (route handlers, C17) et de 0017 § 11.0 (environnement serveur fermé par défaut, C18, provisoire : Q204) ; modules d'environnement par dossier |
| 0007 | RLS : rôles dédiés (dont `vadrouille_webhook`, `vadrouille_account_admin`, `vadrouille_limiter`), droits par table, contexte de transaction, fonctions `SECURITY DEFINER` et vues partagées possédées par des rôles `vadrouille_fn_*` sans appartenance avec `SET` ni `INHERIT` (0036, B1-TL-2), vues partagées à jeton, purge limitée à l'organisation courante et au propriétaire, ajout seulement (`trip_versions`, `billing`, `usage_ledger`) |
| 0008 | Better Auth 1.7.7 : aucune route exposée, opérations en liste blanche appelées côté serveur, droits de `vadrouille_auth` par table, code à 6 chiffres, limitation des envois et des vérifications, rôles, un seul propriétaire, organisation personnelle, contexte de session, secret, Mailpit |
| 0009 | Exécution durable : Workflow SDK isolé, état réduit aux identifiants, mondes local, Vercel et Postgres, région de l'état à vérifier (Q28) |
| 0010 | Répartition des champs (Q14) hors Q5, `Stop.name` jamais tiré de Google, instantané dérivé de `TripSchema`, formes de PO-2 et PO-6 |
| 0011 | Données dérivées de Google, règle provisoire de Q5 (0027) : verdicts en mémoire seulement, `placeId` seule trace de l'ancrage, état des workflows sans `placeId` ni verdict, réparation sans modèle, 7 champs calculés ou restreints, cache de coordonnées de 30 jours au plus, pipeline de la variante B |

### Backlog (ordre de construction du cadrage § 7)
| # | Tâche | Rôle | Prérequis | Critères d'acceptation |
|---|---|---|---|---|
| B1 | Socle base de données : Docker Compose et conteneur CI Postgres 17, Drizzle, migrations, rôles (appartenances `INHERIT FALSE, SET TRUE`), RLS, tables du § 6 (sauf `place_memory` et, si B3 ne garde pas le limiteur intégré, `rate_limits`), fonctions `resolve_share_link`, `checkout_organization`, `purge_organization_data`, vues partagées, table `action_rate_limits`, paquet `server-only` | data | B0 ; Q24 seulement pour la base de staging ; Q40 pour l'exécution locale | `pnpm test:db` dans `pnpm verify` et en CI ; tests `schéma: RLS activée et forcée partout`, `isolation: une organisation ne lit ni ne modifie les voyages d'une autre`, `rôles: aucun rôle ne contourne la RLS` (tous les rôles de la décision 0007), `fonctions: SECURITY DEFINER durcies`, `vues partagées: lecture seulement avec un jeton valide`, `vues partagées: l'instantané partagé ne contient que les clés de la liste blanche`, `purge: vadrouille_app ne peut pas purger une autre organisation`, `schéma: les JSONB refusent les clés hors contrat`, `versions: trip_versions est en ajout seulement`, `registres: billing et usage_ledger sont en ajout seulement`, `organisations: exactement un propriétaire`, `schéma: aucune colonne de contenu Google`, `schéma: aucune colonne dérivée de Google` verts (dont, dans `rôles` : `pg_auth_members.inherit_option = false` et `set_option = true` pour chaque rôle accordé à `vadrouille_app`, `UPDATE` de `vadrouille_app` sur `checkouts` limité à `stripe_checkout_session_id`, `INSERT` de `vadrouille_auth` sur `organizations` sans `deletion_requested_at`) ; procédure écrite de retour arrière des migrations |
| B2 | Évolutions des contrats E1 à E7, E9 et E10 et contrats communs (`TripPatch`, `PatchResult`, `TripSnapshot`, `ProposalRecord`, `ChecklistMoment`, `StopFacts`, `ProposalNeighbours`, `PreviewSlot`), raffinement `https:` des adresses, mocks et composants adaptés | backend | B0, F1 ; composants concernés livrés ou adaptés dans leur tâche ; Q42 pour « [Au plus tôt] » | Script du critère § 5 de B0 rejoué sur les nouveaux contrats (une catégorie par champ, **7 clés de la « Partie Q5 » comprises** ; comportement définitif de la « Partie Q5 ») ; `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` ; `contrats: aucune adresse autre que https` ; `ChecklistItemSchema` refuse un texte libre dans `when` ; un aperçu de moins de 8 propositions renvoie des cases `noOption` ; aucun texte d'interface dans les données simulées ; `pnpm verify` vert |
| B3 | Authentification Better Auth et organisations (§ 7), adaptateur `auth`, Mailpit en local et en CI | backend | B1, B2, F8b ; Q25 seulement pour l'envoi réel ; Q86 pour les seuils | Tests `auth: code à 6 chiffres valable 10 minutes, 3 essais`, `auth: aucune route /api/auth n'est exposée`, `auth: seules les opérations de la liste blanche sont appelées`, `auth: limitation des envois` (en-têtes d'IP forgés, variantes de casse et d'alias `+`), `auth: réponse identique pour une adresse connue ou inconnue`, `auth: sans en-tête de confiance, la limite reste appliquée`, `env: gardes de configuration` (environnement absent : refus ; inconnu : production ; `VERCEL_ENV=production` l'emporte), `auth: aucune adresse IP ni email en clair dans les limiteurs`, `limitation: les adresses d'un même préfixe IPv6 /64 partagent un compteur`, `auth: les vérifications et sessions expirées sont purgées`, limiteur de la connexion dans nos actions (comportement du limiteur intégré sur `auth.api` vérifié et noté dans 0008), `auth: deux adresses qui ne diffèrent que par l'alias + sont deux comptes distincts`, `auth: organisation personnelle créée à la première connexion`, `auth: le contexte vient de la session, jamais du client`, `journaux: aucun email ni code dans les journaux` ; en-tête d'IP de confiance de Vercel confirmé (documentation et essai sur staging) et noté dans la décision 0008 ; IP et agent utilisateur absents de `sessions` (sinon Q47) ; **bloquant** : jetons de session hachés en base, vérifiés et notés dans 0008, sinon parade décidée par le Tech Lead et test `auth: aucun jeton de session en clair dans sessions` avant la fusion ; scénario e2e de connexion avec le code lu dans Mailpit |
| B4 | Paiement en mode test (§ 9) : adaptateur simulé serveur, webhook signé et idempotent, droits ; Stripe quand Samuel aura ouvert le compte | backend | B1, B3 ; Q26 pour Stripe ; Q129 pour les remboursements ; Q131 pour l'ouverture du simulé sur Internet | Tests du § 9 (dont `paiement: statut, montant, devise, mode ou voyage incohérents n'accordent rien`, `paiement: une panne entre l'enregistrement et le droit ne perd pas le paiement`, `paiement: un événement déjà enregistré relance la suite manquante`, `paiement: un événement d'une session inconnue n'écrit rien, n'accorde rien et alerte`, `paiement: webhook simulé fermé par défaut et en production`) ; PO-4 vérifiée (second paiement sans second droit) ; adresses de retour depuis `APP_URL` ; version de `stripe` notée dans un amendement de 0006 |
| B5 | Moteur sans IA (`src/domain`) : modèle, squelette, planificateur, validateurs R1 à R10, patches, versions, annulation (PO-5), budget de trajet (PO-1) | backend | B2 ; durées réelles fournies à la lecture par B8 (« Partie Q5 », 0011 point 5) : B5 travaille sur des durées de test en mémoire et ne les écrit jamais | R1 à R10 testées à 100 % sur des données de test ; `moteur: une étape verrouillée est conservée`, `versions: une révision obsolète est refusée explicitement`, `moteur: budget réduit 60 → 45, 90 → 65, 150 → 110, une seule fois`, `versions: annuler crée une version identique` ; règle ESLint « `src/domain` sans entrée-sortie » et son test ; `ApiError.currentVersion` |
| B6 | API de lecture et adaptateur `api` (Séjour, Journée, Mes voyages) sur données de test, actions serveur de base, suite de contrat commune | backend | B1, B2, B3, B5 | `adaptateurs: mock et api passent la même suite de contrat` ; `isolation: une organisation ne lit ni ne modifie les voyages d'une autre` rejoué par l'adaptateur `api` ; `not_found` pour une autre organisation ; écrans 11 et 12 fonctionnent avec `DATA_ADAPTER=api` sans changement d'interface |
| B7 | Couche IA et recherche bornée (`src/ai`, `src/research`), constructeur de prompts typé, lecteur de pages protégé, `usage_ledger`, jeu d'évaluation | ia-recherche | B1, B2, P0 ; Q9 pour la comparaison Gemini ; Q46 pour un fournisseur réel | `prompts: aucun prompt journalisé ne contient de donnée Google`, `evals: aucune donnée Google dans les jeux d'évaluation`, `recherche: une page contenant des instructions ne modifie pas l'agent`, `recherche: le lecteur de pages refuse les adresses internes`, `recherche: le lecteur de pages refuse les formes d'adresse alternatives, les ports non standard et les réponses trop grosses après décompression`, `traces: aucun prompt ni brief dans les attributs exportés` ; règles ESLint en liste blanche pour `src/ai`, `src/research`, `src/domain` et leurs tests ; version des SDK de modèles notée dans un amendement de 0006 |
| B8 | Ancrage et trajets (`src/grounding`) | ia-recherche | B1, B7 ; Q3 (clé serveur Places/Routes, Samuel) ; règle provisoire de Q5 (0027) | `clés: clé serveur distincte et confinée à src/grounding` ; critères de « Partie Q5 » (B8) |
| B9 | Workflows de génération (§ 8), `GenerationStatus`, aperçu en `PreviewSlot`, plafonds, actions `structureBrief`, `suggestLodging`, `createTrip` côté serveur | backend | B4, B5, B7, B8 ; règle provisoire de Q5 (0027, 0011) ; P0-Q9 pour l'écriture des horaires planifiés de programmes réels ; Q39, Q45 ; Q135 | `workflows: aucune donnée Google dans l'état sérialisé`, `workflows: plafond ou quota atteint conserve le dernier programme valide`, `workflows: une erreur de fournisseur est visible et récupérable`, `workflows: une relance ne double aucune écriture`, `limitation: une adresse seule n'épuise pas le plafond global des actions sans compte` ; région de l'état du monde Vercel vérifiée et notée (Q28) ; aperçu en moins de 60 s sur Édimbourg (mesure) ; critères de « Partie Q5 » (B9) |
| B10 | Présentation, signaux, questions de préférence (2 refus), préférences déduites (3 « j'aime »), réduction de trajet (PO-1), recalcul par lot, déblocage, `AdjustmentSummary` | backend | B9 ; Q41 | `préférences: aucune généralisation sans réponse` ; la deuxième réponse « oui » à la question de trajet ne réduit pas une seconde fois ; décisions idempotentes par `requestId`, `choose` et `nextOption` compris ; recalcul par lot en moins de 60 s |
| B11 | Révision : remplacer, ajouter, déplacer, verrouiller, annuler, liste à réserver, fiche (`PlaceDetails`), signalement, export et suppression du compte | backend | B6, B9 ; Q48 pour `billing` ; Q90 pour l'affichage du nom Google | Révision depuis la réserve en moins de 5 s ; `versions: une révision obsolète est refusée explicitement` rejoué par les actions ; `affichage: données de lieux Google avec la carte ou l'attribution`, `révision: aucun nom Google écrit dans Stop.name`, `ajouter: le nom n'est jamais prérempli par le nom Google` rejoué sur l'adaptateur `api`, `compte: la suppression efface les données métier et d'authentification` (sans toucher `billing` ni `usage_ledger` tant que Q48 est ouverte), `compte: une suppression interrompue reprend sans erreur ni doublon`, `compte: export et suppression exigent une réauthentification récente` |
| B12 | Pendant et après le voyage : écran 15 sur l'adaptateur `api` (jours projetés, F10-TL-2, sans contrat `Today`), avis, mémoire des goûts sur accord, liens privés (PO-7) | backend | B6, B11 ; Q50 ; Q150, Q151 pour l'après-voyage | `partage: un lien révoqué ou expiré n'ouvre plus le voyage`, `partage: en-têtes de confidentialité et limite par adresse` (`Referrer-Policy: strict-origin` sur `/p/*`) ; lecture par les seules vues partagées, en liste blanche de clés ; un nouveau lien révoque le précédent ; expiration à la fin du voyage + 30 jours ; vue partagée en lecture seule (aucune action accessible) ; `partage: getPlaceDetails refuse un placeId hors du voyage du lien` ; `partage: SharedTrip n'expose pas organizationId` ; `traces: le jeton de /p/[token] n'apparaît dans aucun attribut exporté` ; préférences entre voyages seulement avec accord |

---

## § 16. Hors périmètre

- Tout code, migration, workflow ou adaptateur `api` dans B0 : tâches B1 et suivantes (ouvertes avant G0, décision 0029).
- Ouverture de tout compte ou service payant ; toute clé, même de test, tant que Samuel ne l'a pas fournie ; toute mise en production.
- Vercel KV, Edge Config et toute API propre à Vercel dans le code métier : interdits (décision 0002).
- La validation juridique formelle des règles Google (Q5) : la « Partie Q5 » applique la règle provisoire de Samuel sans l'interpréter ; les photos (Q6) ; les prix (Q2 tranchée, révisable par Samuel) ; les durées de conservation des données (Q27).
- Le contenu du prototype de recherche (P0, rôle ia-recherche) ; la mémoire automatique (`place_memory`, bêta) ; la vérification à J-7, l'espace agence, les invitations, la marque blanche (phase 3) ; l'interface d'administration.
- Les modifications de `src/contracts`, `src/mocks` et des composants qu'entraînent Q14, PO-2 et PO-6 : décrites ici, appliquées par B2.

---

## § 17. Questions ouvertes

Questions inscrites dans `QUESTIONS.md` (non tranchées ici) :
- **Q4** (Samuel) : tranchée, Better Auth ; intégration conçue ici (§ 7, décision 0008).
- **Q5** (Samuel, juridique) : règle provisoire fixée le 2026-10-12 (décision 0027, point 4), appliquée dans « Partie Q5 » (décision 0011) ; **Q29**, **Q34**, **Q38** et **Q44** y reçoivent une réponse provisoire. La validation juridique formelle reste ouverte (avant le lancement) ; les points S1 à S3 de la décision 0011 sont tranchés, **S4 et S5 attendent Samuel** (« Partie Q5 », dernière sous-section).
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
- **Q39, Q45** (Samuel, argent) : plafonds de coût et plafond global des actions sans compte (§ 7, § 13), plafond des lectures partagées de `getPlaceDetails` (§ 12) ; le risque d'épuisement du plafond global par une cinquantaine d'adresses n'est pas accepté ici (nouvelle question 3).
- **Q40** (Samuel) : Docker dans les sessions d'agents (B1 en local). Ne bloque plus B1 : sans base, `SKIP_DB_TESTS=1` hors CI (décision 0036, B1-TL-1).
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
2. **CEO** : B0a ne remplit pas les critères de la spécification B0 qui dépendent de Q5 (tableaux d'étapes des workflows 1 à 5, catégories des 7 champs dérivés, § 17 sur les verdicts) ; le ticket #22 reste ouvert avec #27. Faut-il un ticket distinct « B0b — partie Q5 » ? Bloque la clôture de #22. *Sans objet depuis la « Partie Q5 » de #27 (2026-10-12), qui ferme #22.*
3. **Samuel (argent, disponibilité), sous Q45** : avec une limite de 20 appels par jour et par adresse (ou préfixe IPv6 /64) et un plafond global d'au moins 50 fois cette limite, une cinquantaine d'adresses suffit à épuiser le plafond global quotidien des écrans 2 et 3 (déni de service pour tous jusqu'au lendemain, dépense de modèle jusqu'au plafond). Ce risque est-il accepté au MVP, ou faut-il une autre parade (plafond plus haut, preuve de travail, défi anti-robot, compte obligatoire avant l'écran 2) ? Bloque le branchement d'un fournisseur réel pour `structureBrief` et `suggestLodging` (B9), pas la phase 0.
4. **UX/UI et Product Owner** : parcours de réauthentification avant l'export et la suppression du compte (`reauthentication_required` : nouveau code demandé, textes, retour à l'action). Bloque l'interface de B11, pas la conception serveur.
5. **Samuel (données personnelles hors Suisse et UE, sous Q9 et Q46)** : DeepSeek (0027) reçoit le brief pour la recherche web et nos descriptions pour les raisons ; ses serveurs sont probablement hors de Suisse et de l'UE. Ce transfert est-il admis, et à quelles conditions (contrat de sous-traitance, aucun entraînement sur nos données, mention dans la politique de confidentialité) ? Bloque le branchement de DeepSeek réel (B7, B9), pas la phase 0. *Tranchée par Samuel le 2026-10-12 à 12:48 CEST (Q260) pour la phase 0 : DeepSeek via OpenRouter accepté, briefs de test seulement, aucune donnée client ; à revoir avant la bêta.*

---

## Partie Q5

**Règle appliquée** : règle provisoire de Samuel pour Q5 (décision 0027, point 4, #studio, 2026-10-12 09:46 CEST) : « lecture stricte du cadrage : **aucune donnée Google dans les prompts, seul l'identifiant de lieu stocké, coordonnées gardées 30 jours au plus** ». La validation juridique formelle viendra avant le lancement ; Q5 reste ouverte pour elle. Décision d'architecture : **0011** (Tech Lead), qui amende 0009 (point 3) et 0010 (principes 6 et 8). Cette section ne donne aucune réponse juridique : elle applique le texte de la règle et signale ses points d'interprétation (décision 0011) : S1 à S3 tranchés par Samuel le 2026-10-12, **S4 et S5 en attente de sa réponse** (dernière sous-section). Elle **renvoie à 0011** pour les règles de données (7 clés, `place_coordinates`, pipeline) au lieu de les recopier.

En une phrase : en dehors du `placeId` et du cache de coordonnées de 30 jours, toute donnée Google ou **dérivée** d'une réponse Google (verdict, motif d'écart, date de contrôle, durée, horaire, code tiré d'horaires ou de durées) ne vit qu'en mémoire, dans une étape ou une requête, et est recalculée quand on en a besoin ; aucune n'atteint un prompt (seule exception, fixée par Samuel : l'appartenance d'un lieu à l'ensemble des candidats ancrés ou retenus présenté au modèle, 0027 points 1.3 et 1.5, décision 0011 point 1).

Réponses provisoires : **Q29** (verdicts : jamais conservés, ni en base, ni dans l'état des workflows) ; **Q34** (coordonnées : cache de 30 jours au plus) ; **Q38** (`Segment.minutes` : calculé à la lecture, jamais stocké) ; **Q44** (codes tirés d'horaires ou de Routes : ni dans les versions, ni dans l'état des workflows, ni dans un prompt ; `validation_report` non créée) ; **Q139** (copie hors ligne de F10) : elle ne garde ni durée de trajet ni badge `toConfirm`, faute de stockage.

### § 5 — catégorie des 7 clés
Catégories et sources : **décision 0011, point 5** (tableau qui fait foi). En bref : `Segment.minutes`, `Day.travelMinutes`, `Change[segment].before` et `.after` sont **calculés** à la lecture (Routes, dans `src/grounding`, sans stockage ni cache partagé) ; `Stop.verifiedAt` et `SurpriseIdea.verifiedAt` sont **calculés** depuis `created_at` de la version (**en attente de S5**) ; `Stop.exceptions` est **stocké sans `toConfirm`**, ajouté à la lecture. `Proposal.detour`, relecture en échec, `validation_report` non créée, horaires planifiés (P0-Q9) : 0011 point 5.

**Fonction de recomposition** (amendée par B6a, spécification B6, B6-TL-2 (b), décision 0086 § 1.2 : l'**assemblage** est dans `src/domain`, `src/domain/recomposition.ts`, une seule implémentation pour B6, B11 et B12 ; `src/grounding` (B8) ne fournit que les **relectures**, par le port `SourceRelectures` de `src/domain/relectures.ts` implémenté côté serveur ; les cas d'usage de `src/server/voyages/` les appellent pour l'adaptateur `api`) : relit, pour la journée ou la proposition demandée, les durées (Routes) et, si besoin, les horaires (badge `toConfirm`), ajoute `verifiedAt` depuis la version, puis valide par `TripSchema`, `ProposalSchema` et `DayMapSchema` avant de répondre. **Règles de relecture** (reprises de P0b, spec P0, #149) : aucun cache des données relues (Next.js, CDN, module partagé) : `fetch` avec `cache: "no-store"`, réponses `Cache-Control: private, no-store` ; clé serveur en en-tête seulement ; un relecteur simulé sert les tests (aucune réponse réelle de Google enregistrée comme fixture). Relecture en échec : la journée s'affiche avec l'état d'erreur existant et « Réessayer », la carte avec « Carte indisponible ».

**Comportement définitif de B2, B5 et B6.** B2 crée `StopSnapshot` (sans `verifiedAt`, `exceptions` restreint), `SegmentSnapshot` (sans `minutes`), `SurpriseIdeaSnapshot` (sans `verifiedAt`) et le `ProposalRecordSchema` qui exige `detour` ; le script du critère § 5 compte désormais 144 clés catégorisées. B5 calcule avec des durées fournies en mémoire (données de test, puis relecture de B8) et n'écrit jamais une durée. B6 lit des données de test et branche la recomposition de B8 quand elle existe.

### § 6 — schéma
- `candidates` : `place_id` écrit par l'étape d'ancrage pour un candidat `compatible` seulement ; **aucune** colonne de verdict, de motif d'écart ni de date de contrôle (S1) ; notes du Decider (`fit`, `not_for_me_risk`, `must_see`, `slot_fit`), données maison tirées de nos descriptions (0027).
- `research_runs` : **aucun compteur** de candidats trouvés, ancrés ou retenus (0011 point 2) ; la mesure des variantes A et B passe par le rapport P0 ; leur retour éventuel est la question S4.
- `trip_versions` : **pas de colonne `validation_report`** (0011 point 5).
- `place_coordinates` (B8) : **décision 0011, point 6** (colonnes, `CHECK` de 30 jours, lecture des seules lignes non expirées, `vadrouille_app` en `SELECT` seulement, écriture par suppression puis insertion dans `store_place_coordinates`, purge par `purge_expired_coordinates` à chaque écriture, coordonnées supprimées au plus tard à 30 jours, mécanisme de purge défini par la spécification de B8, rôle `vadrouille_fn_coords`, jamais exposée par la vue partagée) ; droits et rôle dans la décision 0007 amendée. Seule exception au test `schéma: aucune colonne de contenu Google`. `CLAUDE.md` admet cette exception depuis le 2026-10-12 (S3).
- Aucune table de plan de travail : le plan reste en mémoire dans l'étape e (0011 point 7).
- `purge_organization_data` couvre aussi `place_coordinates` (amende 0007).
- `place_memory` : bêta, inchangé.

### § 8 — workflows
Pipeline de la **variante B** (0027, point 1) ; données admises par étape : **décision 0011, point 7** ; la variante A (DeepSeek seul, mesure de référence) remplace la notation (d) et l'appel des raisons (dans e) par un appel DeepSeek aux mêmes règles d'entrée. Modèles et variante choisis par configuration. Colonnes comme au § 8 : type ; entrée → sortie sérialisées (identifiants internes seulement, décision 0011 point 3) ; données Google dans l'étape (« oui » : en mémoire, jamais renvoyées, jamais dans un prompt) ; plafond vérifié avant l'appel ; relances ; idempotence ; état publié.

**Workflow 1 — aperçu (`generatePreview`)**
| Étape | Type | Entrée → sortie | Google | Plafond | Relances | Idempotence | État publié |
|---|---|---|---|---|---|---|---|
| a Brief | déterministe | voyage, version du brief → identifiant du brief validé | non | — | 2 | `(runId, a)` | `preparing` |
| b Recherche web | IA (DeepSeek) et recherche bornée | brief → identifiant de la recherche ; écrit `candidates` (contenu maison, sans `placeId`) et `research_runs` | non | oui | 2 | unicité `(research_run_id, nom normalisé)` | `preparing` |
| c Ancrage | appel externe (Places « IDs only », puis Place Details, champ de statut) | identifiant de la recherche → identifiant de la recherche ; écrit `candidates.place_id` des seuls `compatible` | oui | oui | 3 | écriture idempotente de `place_id` | `preparing` |
| d Notation | IA (Decider) | identifiant de la recherche → identifiant de la recherche ; lit les candidats qui ont un `placeId`, envoie nos descriptions et des identifiants internes ; écrit les notes | non | oui | 2 | `(runId, d, candidat)` | `preparing` |
| e Planification et publication | moteur `src/domain` avec relectures Places et Routes, puis un appel IA (DeepSeek) pour les raisons | identifiant de voyage → identifiant de version ; en mémoire : classement, planification, validation R1 à R10, réparation déterministe (option suivante, sinon `noOption`), puis raisons sur nos descriptions des seuls lieux retenus (0027 point 1.5) ; à la fin, **une seule transaction** : la version validée par `TripSnapshotSchema` (raisons comprises), qui devient `current_version`, et les 8 cases `proposals` (PO-6) | oui (en mémoire ; jamais dans le prompt des raisons) | oui (avant les relectures et avant l'appel des raisons) | 2 (l'étape est rejouée en entier) | unique `(trip_id, request_id)` | `preparing`, puis `ready` ou `incomplete` (`readyStops` à jour) |

**Relances amendées par 0081** (B9-TL-3) : étape a : 2 ; étapes b, c, d et e : 0 (une étape rejouée repaierait ses appels) ; un nouvel essai passe par `retryGeneration`.

**Workflow 2 — ancrage (`groundCandidates`)** : l'étape c ci-dessus, appelée comme sous-étape par les workflows 1, 4 et 5. Les trois verdicts (`compatible`, `discarded`, `closedPermanently`, décision 0011 point 2) ne vivent qu'en mémoire ; un candidat réutilisé est **ré-ancré** (le `placeId` présent ne vaut pas verdict).

**Workflow 3 — planification et validation (`planDays`)** : la partie moteur de l'étape e ci-dessus. R1 à R10 en mémoire ; **aucun appel de modèle pour réparer** (décision 0011 point 4) ; rapport de validation en mémoire seulement ; aucune version qui échoue à la validation n'est écrite.

**Workflow 4 — voyage complet (`generateFullTrip`)** : comme le workflow 1, jour par jour, à partir des candidats existants ré-ancrés (c), complétés si besoin par une recherche (b) ; chaque jour terminé passe par e et publie une version (`generating` pour les jours suivants).

**Workflow 5 — recalcul par lot (`batchRecompute`) et révision unitaire** : la révision depuis la réserve s'exécute dans l'action serveur (sans workflow) : ré-ancrage du candidat, planification et validation déterministes du jour, nouvelle version, réponse `PatchResult` dont les `Change[segment]` sont recalculés à la réponse. Le recalcul par lot et la mini-recherche suivent b à e. Aucune liste de candidats écartés n'est écrite.

**Arrêt sur plafond ou quota** : inchangé (§ 8) ; le plan d'une exécution arrêtée n'a jamais quitté la mémoire : rien n'est écrit.

**Écart signalé avec la spécification B0** (§ 8 et critère « état persistant des workflows ») : la spécification admettait dans l'état d'une étape le `placeId`, un verdict et la date de contrôle ; la règle provisoire de Samuel (0027) n'admet que le `placeId` comme donnée stockée, et l'état ne garde ni verdict, ni date, ni `placeId` (décision 0011, point 3). La conservation des verdicts reste listée au § 17 avec Q5, désormais avec une réponse provisoire.

### § 10 — règles Google
| Règle | Test nommé | Tâche |
|---|---|---|
| Aucune donnée Google ni dérivée (valeur, code, motif, verdict, coordonnée, `placeId`, durée, code de validation) dans un prompt, pour les étapes de recherche, de notation et de planification et publication ; canari à valeurs sentinelles | `prompts: aucun prompt journalisé ne contient de donnée Google` (étendu en canari, décision 0011 ; un seul test) | B7, B9 |
| La réparation n'appelle aucun modèle | `réparation: aucun appel de modèle` | B9 |
| État des workflows sans `placeId`, verdict, `checkedAt`, compteur d'ancrage ni liste de candidats en sortie de l'ancrage | `workflows: aucune donnée Google dans l'état sérialisé` (étendu, décision 0011) | B9 |
| Aucune colonne dérivée, dont `validation_report` et les compteurs d'ancrage ; aucune table de plan de travail | `schéma: aucune colonne dérivée de Google` (étendu) | B1 |
| Instantané sans `toConfirm` | `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` (étendu) | B2 |
| Champs calculés recomposés à chaque lecture, sans cache partagé, sans valeur inventée en cas d'échec | `lecture: les champs calculés sont recomposés et validés` | B6, B8 |
| Coordonnées gardées 30 jours au plus, illisibles une fois expirées, purgées ; jamais dans un contrat stocké, une version, un état, un journal ni un prompt | `coordonnées: expiration à 30 jours au plus` | B8 |
| `place_coordinates` sans `UPDATE` ni `DELETE` pour `vadrouille_app` ; écriture par suppression puis insertion | `coordonnées: DELETE limité et aucun UPDATE` | B8 |
| La purge et l'écriture des coordonnées n'ont aucun effet sur une autre organisation | `coordonnées: purge sans effet sur une autre organisation` | B8 |
| La vue partagée n'expose jamais `place_coordinates` | `partage: la vue partagée n'expose jamais place_coordinates` | B1, B12 |
| Un candidat réutilisé est ré-ancré | `ancrage: un candidat réutilisé est ré-ancré` | B9 |
| `placeId` de plus de 12 mois rafraîchi par une résolution « IDs only » avant usage ; un `placeId` devenu invalide fait retirer ou remplacer l'étape | `ancrage: un placeId de plus de 12 mois est rafraîchi` | B8 |
| Clé navigateur restreinte par référents HTTP et à Maps JavaScript seule (console Google, Samuel, § 14) | contrôle manuel noté par B8 dans sa PR | B8 |

### § 15 — backlog
- **B8** : relecteurs Places et Routes (`src/grounding`) avec leur double simulé ; ancrage en mémoire ; recomposition des 7 clés et de `detour` (`verifiedAt` sous réserve de S5) ; cache `place_coordinates` et ses deux fonctions ; mécanisme de purge (déclencheur, secret, tests) défini par la spécification de B8, coordonnées supprimées au plus tard à 30 jours ; critères : `clés: clé serveur distincte et confinée à src/grounding`, `lecture: les champs calculés sont recomposés et validés`, `coordonnées: expiration à 30 jours au plus`, `coordonnées: DELETE limité et aucun UPDATE`, `coordonnées: purge sans effet sur une autre organisation`, `ancrage: un placeId de plus de 12 mois est rafraîchi`.
- **B9** (partie ancrage, sélection et validation) : workflows 1 à 5 ci-dessus ; critères : `workflows: aucune donnée Google dans l'état sérialisé` (étendu), `prompts: aucun prompt journalisé ne contient de donnée Google` (étendu en canari), `réparation: aucun appel de modèle`, `ancrage: un candidat réutilisé est ré-ancré` ; mesure des variantes A et B par le rapport P0 (coût et temps par voyage ; aucun compteur d'ancrage en base, S4) ; aucun programme réel écrit avant P0-Q9.

### Points d'interprétation et questions pour Samuel
Détail et motifs de réouverture : décision 0011, section du même nom.
- **S1** : répondu par Samuel le 2026-10-12 (fil « Finalisation B0 sur Q5 », 10:38 CEST) : **acceptable**. Seul le `placeId` est stocké ; un candidat sans `placeId` laisse savoir qu'il n'a pas été ancré, sans motif.
- **S2** : répondu par Samuel le 2026-10-12 (même fil, 10:39 CEST) : **le Decider note les seuls candidats ancrés** (0027 point 1.3) ; les raisons sont rédigées pour les seuls lieux retenus (0027 point 1.5).
- **S3** : répondu par Samuel le 2026-10-12 : **`CLAUDE.md` est aligné** sur l'exception de 30 jours des coordonnées. Message : #studio, 2026-10-12 10:35 CEST, « Q253, Q254 : oui, aligne CLAUDE.md sur la règle provisoire Q5. » (horodatage Slack 1791794153.089509).
- **S4 (en attente)** : les compteurs `candidates_found`, `candidates_grounded`, `candidates_retained` sont retirés de `research_runs` (la différence entre trouvés et ancrés redonne le nombre d'écartés par Google). **Peuvent-ils revenir en production pour la mesure continue des variantes A et B ?** Sans réponse, ils restent exclus ; rien n'est bloqué.
- **S5 (en attente)** : `Stop.verifiedAt` et `SurpriseIdea.verifiedAt` sont reconstitués à la lecture depuis `created_at` de la version (date de contrôle rétablie indirectement). **Cette reconstitution est-elle admise ?** Sinon : relecture du statut Google à chaque affichage, ou retrait du champ du contrat. Bloque la recomposition de `verifiedAt` (B6, B8), pas le reste.
