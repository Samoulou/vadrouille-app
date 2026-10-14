# 0006 — Stack serveur : actions serveur, Drizzle, Postgres local

Statut : proposé · Date : 2026-10-08, reprise le 2026-10-11 dans B0a (PR issue du découpage de #27, Q43), complétée le 2026-10-11 (correction 2 de #114 : amendements de 0017 § 3.3, 0020 § 11 et 0017 § 11.0, modules d'environnement) · Décideur : Tech Lead (architecture, bibliothèques, outillage et tests, délégation « Qui décide quoi ») · Définitif sans veto de Samuel avant le 2026-10-13 ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio »

## Contexte
Le handover back-end (`docs/handovers/backend.md`, B0) doit fixer la stack serveur avant les tâches B1 et suivantes, qui commencent après G0. Contraintes : TypeScript de bout en bout, Next.js 16 déjà en place (décision 0003), Postgres en région UE, portabilité hors Vercel (décision 0002), aucun compte externe pour développer et tester, contrats Zod partagés (`src/contracts`).

## Options étudiées
| Sujet | Options | Retenue |
|---|---|---|
| Entrée serveur de l'interface | API REST complète (route handlers) ; actions serveur ; les deux | Actions serveur pour l'interface, route handlers seulement là où un appel externe l'impose |
| Accès aux données | Drizzle ORM ; Prisma ; Kysely ; SQL brut | Drizzle ORM |
| Migrations | drizzle-kit ; outil SQL séparé | drizzle-kit, migrations SQL relues et versionnées |
| Base locale et CI | Postgres en conteneur ; PGlite ; base distante de développement | Postgres 17 en conteneur (Docker Compose en local, conteneur de service en CI) |

Raisons :
- **Actions serveur** : elles s'exécutent côté serveur, si bien que l'adaptateur (`mock` ou `api`) et le contexte d'organisation restent côté serveur ; une seule couche de services (`src/server`) sert les actions et les quelques route handlers, sans API REST en double. Elles vivent dans `src/server/actions/` (décision 0017 § 3). Les route handlers restent nécessaires pour le webhook Stripe, le webhook simulé et le suivi de génération ; Better Auth n'expose aucune route (décision 0008).
- **Drizzle** : schéma en TypeScript, SQL lisible, politiques RLS exprimables dans le schéma ou en SQL, compatible avec l'adaptateur Better Auth et avec le monde Postgres des workflows (décision 0009), sans moteur binaire à déployer. Prisma ajoute un moteur et gère moins directement la RLS ; Kysely n'a pas d'outil de migration intégré.
- **Postgres en conteneur** : seules la vraie base et ses rôles permettent de tester la RLS (décision 0007). Aucun compte externe. PGlite ne garantit pas les rôles de connexion distincts dont les tests d'isolation ont besoin.

## Décision
| Outil | Version | Note |
|---|---|---|
| Next.js (route handlers et actions serveur) | 16.4.0 (décision 0003) | Environnement d'exécution `nodejs` uniquement, jamais `edge` côté données |
| Drizzle ORM | 0.45.4 | `drizzle-orm/node-postgres` ; types Drizzle confinés à `db/` et `src/server` |
| drizzle-kit | 0.31.11 | `drizzle-kit generate` produit des migrations SQL dans `db/migrations/`, relues en PR ; jamais `push` hors poste local |
| Pilote Postgres | `pg` 8.23.1 | Pilote attendu par Better Auth et par le monde Postgres des workflows |
| Postgres | 17 (image `postgres:17.11`) | Version proposée par Supabase et Neon ; PostGIS seulement quand une tâche en a besoin |
| Zod | 4.6.5 (déjà en place) | Validation des entrées et des sorties de chaque action et route |
| Paquet `server-only` | dernière stable au moment de B1 | Ajouté par B1 ; importé par `src/server` (hors `actions/`), `db/`, `src/tenancy`, `src/ai`, `src/research`, `src/grounding`, `src/workflows`. En phase 0, la décision 0020 ne l'ajoute pas et tient la frontière par la règle de lint de 0017 § 3.3, qui reste en place |
| `stripe`, SDK de modèles (`ai`, `@ai-sdk/*`) | fixées par B4 et B7 | Chaque tâche note la version retenue dans un amendement de cette décision |

Versions vérifiées sur le registre npm et Docker Hub le 2026-10-08 ; pour Drizzle ORM, `npm view drizzle-orm version` renvoie 0.45.4 (étiquette `latest`) et `npm view drizzle-orm@0.45.4 version` la confirme ; les versions 1.0 ne sont publiées qu'en préversion (`beta`, `rc`) et ne sont pas retenues. La tâche B1 les installe telles quelles ou, si une version plus récente est sortie, la note dans un amendement de cette décision (même règle que la décision 0003).

Conventions :
1. Tables et colonnes en `snake_case` ; contrats en `camelCase` ; la conversion se fait dans `src/server` (jamais dans l'interface).
2. Identifiants : UUID générés par la base (`gen_random_uuid()`, Postgres 17), exposés comme chaînes ; les identifiants d'étape du programme restent des chaînes stables entre versions (décision 0010).
3. Montants en centimes (entiers) avec la devise ; dates en `date`, instants en `timestamptz` UTC ; heures locales de la destination en `HH:MM`.
4. Variables d'environnement serveur sans préfixe `NEXT_PUBLIC_`, lues et validées une seule fois par un schéma Zod (`src/server/env.ts`) ; `.env.example` liste les noms sans valeur ; seules `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` et `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (Q3) sont publiques. `VADROUILLE_DATABASE_URL_MIGRATOR` n'existe que dans l'environnement des migrations : `src/server/env.ts` refuse de démarrer s'il la trouve (test `env: gardes de configuration`). Noms des variables de connexion : `VADROUILLE_DATABASE_URL` (`vadrouille_app`), `VADROUILLE_DATABASE_URL_AUTH` (`vadrouille_auth`), `VADROUILLE_DATABASE_URL_MIGRATOR` (`vadrouille_migrator`) ; l'application ne lit jamais `DATABASE_URL` ni les variables posées par l'intégration Neon (amendement par la décision 0036, B1-TL-3).
5. Chaque action serveur : commence par `"use server"`, vérifie la session, construit le contexte côté serveur, valide son entrée par `parseInput` et sa sortie avec un contrat de `src/contracts`, renvoie `Result` (`ok` ou `ApiError`, décision 0017 § 4).
6. Base de test : `docker compose up db` en local ; en CI, conteneur de service `postgres:17.11`. Les tests de base (`pnpm test:db`, ajouté par B1) ne sont jamais ignorés en silence : sans base, ils échouent avec un message explicite.

## Amendement de 0017 § 3.3 et 0020 § 11 : route handlers (revue Tech Lead de #114, point 3)
0017 § 3.3 et 0020 § 11 n'autorisent, hors de `src/server`, que les imports de `@/server/actions/*`, y compris depuis `src/app`. Les route handlers du webhook Stripe, du webhook simulé et du suivi de génération doivent pourtant appeler `src/server`. Amendement, appliqué par la première tâche qui crée un route handler (B4 ou B9) :
1. la logique de chaque route vit dans `src/server/routes/` (un module par route), avec `import "server-only"` et **jamais** la directive `"use server"` ;
2. `@/server/routes/*` n'est importable que depuis les fichiers `src/app/api/**/route.ts`, qui n'importent rien d'autre de `src/server` ; partout ailleurs dans `src/app`, `src/features`, `src/components` et `src/lib`, la règle de 0017 § 3.3 reste entière ;
3. **un webhook n'est jamais une action serveur** : toute fonction exportée d'un module `"use server"` est appelable depuis le navigateur par sa référence d'action, ce qui contournerait la vérification de signature du corps brut. Dans `src/server/actions/**` sont interdits `@/server/routes/*`, `@/server/env/payment`, les identifiants `constructEvent`, `STRIPE_WEBHOOK_SECRET` et `SIMULATED_WEBHOOK_SECRET`, et le paquet `stripe` hors de `src/server/actions/paiement.ts` (création de la session de paiement seulement) ;
4. tests dans `tests/unit/lint/` (cas du handover § 3).

## Amendement de 0017 § 11.0 : environnement serveur fermé par défaut (revue de #114, point 8 et S2 ; Q204)
~~**Statut particulier : provisoire** tant que le Tech Lead n'a pas approuvé la PR #114 (Q204, déléguée au Tech Lead). D'ici là, 0017 § 11.0 reste seule en vigueur ; rien n'est codé avant B3.~~ **Mention « provisoire » levée par la décision 0050, P2, point 7 (2026-10-14)** : approuvé par la revue de #114 (Q204) ; en vigueur, à coder par B3a dans `src/server/env/resolve.ts` (et non dans le module validé par Zod, `src/server/env/index.ts`, qui remplace `src/server/env.ts` d'après 0050 : `resolveServerEnvironment` est pure, sans `server-only`, réutilisée par `db/connection.ts`). `isProductionDeployment` (0017 § 11.0, `src/dev/flags.ts`) ne change pas et reste utilisée par l'interface. Côté serveur, ~~`src/server/env.ts` ajoute~~ `src/server/env/resolve.ts` porte (correction 1 de #280) `resolveServerEnvironment(env)`, fonction pure, qui lit `VADROUILLE_ENV` et `VERCEL_ENV` après `trim().toLowerCase()` :
1. si `isProductionDeployment(env)` est vraie (l'une des deux vaut `production`) : `production`, quelle que soit l'autre ;
2. si l'une des deux a une valeur hors de `local`, `ci`, `staging`, `preview`, `development`, `production` : `production` ;
3. si les deux sont déclarées et divergent : la plus restrictive (`production` > `staging` = `preview` > `ci` > `local` = `development`) ;
4. si une seule est déclarée : elle (`preview` → `staging`, `development` → `local`) ;
5. si aucune n'est déclarée : **refus de démarrer**.
En `production`, toutes les gardes d'ouverture sont fermées (webhook simulé, pages de développement, connexion simulée) ; les clés Stripe de production sont refusées dans tous les environnements (handover § 2). Test `env: gardes de configuration`, avec au moins : aucune variable (refus), `VADROUILLE_ENV=prod` (production), `VADROUILLE_ENV=ci` et `VERCEL_ENV=production` (production), `VERCEL_ENV=preview` seule (staging), `VADROUILLE_ENV=local` et `VERCEL_ENV=preview` (staging).

## Modules d'environnement par dossier (revue de #114, point 12)
`src/server/env.ts` valide toutes les variables au démarrage mais **n'exporte aucune clé de fournisseur**. Les clés sont exposées par des modules étroits : `src/server/env/ai.ts` (clés des fournisseurs de modèles, importable par `src/ai` seulement), `src/server/env/grounding.ts` (`GOOGLE_MAPS_SERVER_KEY`, importable par `src/grounding` seulement), `src/server/env/payment.ts` (secrets Stripe et du webhook simulé, importable par `src/server/routes` et `src/server/payment` seulement). Règles ESLint et tests au handover § 3.

## Amendement B1 : versions installées (ticket #184, 2026-10-12)
Constat, sans nouveau choix : B1 installe les versions du tableau, toujours les dernières stables au registre npm le 2026-10-12 : `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `pg` 8.23.1, `server-only` 0.0.1 (seule version publiée), et ajoute les types `@types/pg` 8.23.1 en dépendance de développement. Image de CI et de `docker-compose.yml` : `postgres:17.11`. Les noms des variables de connexion (B1-TL-3) et l'appel de `pnpm test:db` par `pnpm verify` (B1-TL-1) suivent la décision 0036 (B1-TL-3 et B1-TL-1), qui retient les propositions de la spécification B1.

Audit des dépendances (`pnpm audit`, 2026-10-12, revue de sécurité de #188, point 13) : `drizzle-kit` 0.31.11 ajoute une alerte **modérée**, GHSA-67mh-4wv8-2f99 (`esbuild` 0.18.20, par `@esbuild-kit/esm-loader` ; corrigée à partir d'`esbuild` 0.25.0). Elle vise le serveur de développement d'`esbuild`, qui permet à un site de lire ses réponses. Exposition : aucune. `drizzle-kit` est une dépendance de développement (`pnpm db:generate`), absente de l'image et du déploiement, et le projet ne lance jamais ce serveur. Aucune version de `drizzle-kit` sans cette dépendance n'est publiée à cette date. À revoir à chaque montée de `drizzle-kit`. L'autre alerte du rapport (`braces`, élevée, par `eslint-config-next`) existait déjà avant B1.

Exception de `server-only` (fusion de `main` dans B1, revue du 2026-10-13, #188) :

- **Liste fermée** : 20 modules de phase 0 de `src/ai`, `src/research` et `src/grounding`, nommés un par un dans `eslint.config.mjs`, n'importent pas `server-only`, parce que `pnpm p0` les charge hors Next.js, où ce paquet lève une erreur. Tout autre fichier de ces dossiers reste soumis à la règle (test `tests/unit/lint/p0-server-modules-lint.test.ts`).
- **Garde de remplacement** : la règle `ligne/no-p0-server-modules` (corrections 3 et 4 de #188) interdit ces trois dossiers dans tout fichier hors de `src/server`, `src/tenancy`, `src/ai`, `src/research`, `src/grounding`, `src/workflows`, `db/`, `scripts/` et des tests, sous toutes les formes de chargement (import statique ou de type, réexport, `import()`, `next/dynamic`, `require()`, `import x = require()`, `typeof import()`). La règle de 0020 § 11 = 0017 § 3.3 ne vise que `src/server`.
- **Règle exacte du test d'une source** :
  - source alias (`@/…`) : la partie après `@/`, débarrassée de ses `/` de tête, est normalisée par `path.posix.normalize` (segments `.`, `..` et `//` résolus), puis `@/` + ce reste est testé : refus si le premier segment est `ai`, `research` ou `grounding`, ou si le reste remonte par `../` vers un chemin dont un segment est l'un d'eux. Exemples refusés : `@/ai/client`, `@/lib/../ai/client`, `@//ai/client`, `@/lib/x/../../research/a`, `@/./ai`, `@/../src/ai` ; acceptés : `@/lib/ai-utils`, `@/airline`, `@/contracts/x`. La chaîne entière n'est jamais normalisée (`path.posix.normalize("@/../src/ai")` donnerait `src/ai` et rouvrirait ce contournement) ;
  - chemin relatif (`./`, `../`) : refus si un segment quelconque du chemin est `ai`, `research` ou `grounding`, sans normalisation ;
  - toute autre source (paquet, chemin sans alias) : non visée.
- **Faux positifs et négatifs connus** :
  - côté sûr : un chemin relatif vers un dossier nommé `ai`, `research` ou `grounding` hors de `src/` est refusé aussi ;
  - non visés, sans effet ici : `@/AI/x` (la casse n'est pas repliée ; la construction sous Linux est sensible à la casse et ne résout pas ce chemin), `@/ai.ts` (désigne un fichier `src/ai.ts`, pas le dossier) ; un alias dont le dossier `ai`, `research` ou `grounding` n'est pas le premier segment après normalisation (`@/components/ai/x`) n'est pas refusé, car il ne désigne pas ces dossiers.
- **Limites (non couvertes par la règle ni par un test)** :
  - un `import()` ou un `require()` dont la source n'est pas une chaîne fixe (ou un gabarit dont le début est fixe) n'est pas lu, y compris une concaténation (`"@/" + "ai"`) ;
  - `eval`, `new Function`, `new Worker(new URL("../ai/x", import.meta.url))`, `require.resolve`, `module.require` ne sont pas lus ;
  - un chemin sans alias ni `./` (`src/ai/x`, `/src/ai/x`) n'est pas lu ;
  - une directive `/* eslint-disable ligne/no-p0-server-modules */` (ou `eslint-disable-next-line`) désactive la garde : `linterOptions.noInlineConfig` n'est pas posé ; la revue de chaque PR doit refuser une telle directive.
- **Condition de sortie** : retirer la liste dès que `pnpm p0` ne charge plus ces modules hors Next.js.

## Conséquences
- B1 ajoute `docker-compose.yml`, le script `test:db`, le conteneur de service dans `.github/workflows/ci.yml` et l'inclut dans `pnpm verify`.
- Si les sessions d'agents n'ont pas Docker, `pnpm verify` ne peut pas passer en local : Q40 (Samuel), la CI fait foi en attendant. **Amendé par la décision 0036 (B1-TL-1)** : sans base, une session hors CI pose explicitement `SKIP_DB_TESTS=1` (avertissement visible, refusée en CI) ; Q40 ne bloque plus `pnpm verify` en local, la CI fait foi pour les tests de base.
- Revoir cette décision si Drizzle 1.0 sort en version stable (montée de version à planifier) ou si la RLS devient trop coûteuse à maintenir avec drizzle-kit.
