# 0006 — Stack serveur : actions serveur, Drizzle, Postgres local

Statut : proposé · Date : 2026-10-08 · Décideur : Tech Lead (architecture, bibliothèques, outillage et tests, délégation « Qui décide quoi ») · Définitif sans veto de Samuel avant le 2026-10-10

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
- **Actions serveur** : elles s'exécutent côté serveur, si bien que l'adaptateur (`mock` ou `api`) et le contexte d'organisation restent côté serveur ; une seule couche de services (`src/server`) sert les actions et les quelques route handlers, sans API REST en double. Les route handlers restent nécessaires pour Better Auth, le webhook Stripe, le webhook simulé et le suivi de génération.
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
| Paquet `server-only` | dernière stable au moment de B1 | Importé par `src/server`, `db/`, `src/ai`, `src/research`, `src/grounding`, `src/workflows` |

Versions vérifiées sur le registre npm et Docker Hub le 2026-10-08. La tâche B1 les installe telles quelles ou, si une version plus récente est sortie, la note dans un amendement de cette décision (même règle que la décision 0003).

Conventions :
1. Tables et colonnes en `snake_case` ; contrats en `camelCase` ; la conversion se fait dans `src/server` (jamais dans l'interface).
2. Identifiants : UUID générés par la base (`gen_random_uuid()`, Postgres 17), exposés comme chaînes ; les identifiants d'étape du programme restent des chaînes stables entre versions (décision 0010).
3. Montants en centimes (entiers) avec la devise ; dates en `date`, instants en `timestamptz` UTC ; heures locales de la destination en `HH:MM`.
4. Variables d'environnement serveur sans préfixe `NEXT_PUBLIC_`, lues et validées une seule fois par un schéma Zod (`src/server/env.ts`) ; `.env.example` liste les noms sans valeur ; seules `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` et `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (Q3) sont publiques.
5. Chaque action serveur : vérifie la session, construit le contexte côté serveur, valide son entrée et sa sortie avec un contrat de `src/contracts`, renvoie un résultat typé (`ok` ou erreur commune).
6. Base de test : `docker compose up db` en local ; en CI, conteneur de service `postgres:17.11`. Les tests de base (`pnpm test:db`, ajouté par B1) ne sont jamais ignorés en silence : sans base, ils échouent avec un message explicite.

## Conséquences
- B1 ajoute `docker-compose.yml`, le script `test:db`, le conteneur de service dans `.github/workflows/ci.yml` et l'inclut dans `pnpm verify`.
- Si les sessions d'agents n'ont pas Docker, `pnpm verify` ne peut pas passer en local : question posée dans le handover (§ 17), la CI fait foi en attendant.
- Revoir cette décision si Drizzle 1.0 sort en version stable (montée de version à planifier) ou si la RLS devient trop coûteuse à maintenir avec drizzle-kit.
