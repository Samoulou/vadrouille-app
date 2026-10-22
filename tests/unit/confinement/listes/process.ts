/**
 * Lignes de `process` et de `process.env` (spécification P0c, section 5). Propriété du Tech Lead, verdict Sécurité
 * exigé pour toute modification. `NODE_ENV` est admis dans tout fichier sans ligne ; `process.cwd()` dans tout fichier
 * de test (section 4, forme 5). Chaque couple (fichier, propriété), (fichier, nom) et (fichier, forme) est une ligne
 * au sens de « ligne inutile ».
 */

import { readFileSync } from "node:fs";

export type LigneProcess = { readonly fichier: string; readonly propriete: string };
/** `constante` : lecture `process.env[X]` à clé constante importée (section 5, forme 4). */
/** `motif` : justification et verdict, pour les lignes de noms secrets lues dans les données du régime. */
export type LigneLectureEnv = { readonly fichier: string; readonly noms: readonly string[]; readonly constante?: boolean; readonly motif?: string };
/** Formes : `defaut:<fonction>`, `argument:<fonction>`, `propriete-env:<fonction>`, `etalement`. */
export type LigneEnvEntier = { readonly fichier: string; readonly formes: readonly string[] };
/** Paramètre qui reçoit `process.env` entier sans valeur par défaut, suivi comme un paramètre à défaut `process.env`. */
export type ParametreEnv = { readonly fichier: string; readonly fonction: string; readonly parametre: string };

export const PROPRIETES_PROCESS = [
  { fichier: "scripts/ci/release-note.mjs", propriete: "argv" },
  { fichier: "scripts/ci/release-note.mjs", propriete: "stdout" },
  { fichier: "scripts/ci/release-note.mjs", propriete: "stderr" },
  { fichier: "scripts/ci/release-note.mjs", propriete: "exitCode" },
  { fichier: "scripts/ci/techlead-gate.mjs", propriete: "argv" },
  { fichier: "scripts/ci/techlead-gate.mjs", propriete: "stdout" },
  // Relevé de `f57153c` (T18) : `workflowsTreeId` reçoit `process.cwd()`.
  { fichier: "scripts/ci/techlead-gate.mjs", propriete: "cwd" },
  // Relevé de la base de P0c1 : `scripts/ci/post-merge-cleanup.mjs` (après `40b6738`).
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "argv" },
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "stdout" },
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "stderr" },
  { fichier: "scripts/ci/post-merge-cleanup.mjs", propriete: "exitCode" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "cwd" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "stdout" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "stderr" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "exit" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "execPath" },
  { fichier: "scripts/serve-standalone.mjs", propriete: "on" },
  { fichier: "src/server/actions/creation.test.ts", propriete: "stdout" },
  { fichier: "src/server/actions/creation.test.ts", propriete: "stderr" },
  // F8b (spécification F8, « Données personnelles ») : espion du test « ni adresse ni code journalisés ». Verdict Sécurité : à venir (PR F8b, ticket 259).
  { fichier: "src/server/actions/compte.test.ts", propriete: "stdout" },
  { fichier: "src/server/actions/compte.test.ts", propriete: "stderr" },
  // F10c (décision 0039, F10-TL-7) : espion du test « jeton jamais journalisé » (C35). Verdict Sécurité : approuvé (PR #236, a1463f6).
  { fichier: "src/server/actions/partage.test.ts", propriete: "stdout" },
  { fichier: "src/server/actions/partage.test.ts", propriete: "stderr" },
  // Section 9 (P0a1) : `scripts/p0/main.ts`.
  { fichier: "scripts/p0/main.ts", propriete: "argv" },
  { fichier: "scripts/p0/main.ts", propriete: "exitCode" },
  { fichier: "scripts/p0/main.ts", propriete: "stdout" },
  { fichier: "scripts/p0/main.ts", propriete: "stderr" },
  // P0r2 (ticket 284 ; décision 0046, S5) : vérificateur SCRAM lu sur l'entrée standard, écrit seul sur la sortie
  // standard ; le mot de passe n'est jamais pris en argument. Verdict Sécurité à rendre.
  { fichier: "scripts/db/scram-verifier.ts", propriete: "stdin" },
  { fichier: "scripts/db/scram-verifier.ts", propriete: "stdout" },
  { fichier: "scripts/db/scram-verifier.ts", propriete: "stderr" },
  { fichier: "scripts/db/scram-verifier.ts", propriete: "exitCode" },
  // B1 (PR 188, après P0c1 ; spécification P0c, section 9) : `pnpm db:migrate` et `pnpm test:db`. Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { fichier: "db/migrate.ts", propriete: "argv" },
  { fichier: "db/migrate.ts", propriete: "exitCode" },
  { fichier: "scripts/test-db.mjs", propriete: "argv" },
  { fichier: "scripts/test-db.mjs", propriete: "exit" },
  // B9d (ticket 599 ; décision 0087 § 1.6) : commande de reprise du studio `pnpm reprise-studio`, arguments lus (deux
  // identifiants internes) et code de sortie ; aucune lecture d'environnement. Verdict Sécurité : approuvé (revue consolidée
  // de la PR 600, head `5654525`, 0087 § 1.6 point 4).
  { fichier: "scripts/reprise-studio.ts", propriete: "argv" },
  { fichier: "scripts/reprise-studio.ts", propriete: "exitCode" },
  // P0r1 (ticket 267 ; spécification P0c, section 9) : options de Node lues par la barrière de sortie. Verdict Sécurité à rendre.
  { fichier: "src/server/env/egress.ts", propriete: "execArgv" },
  // Décision 0062, condition 1.7 (ticket 341 ; bloquant 1 de la revue du head `b0c1c45`) : `process.config`, valeur par
  // défaut du cinquième paramètre de `verifierSortie`, dont seuls les `defines` `NODE_OPENSSL_CONF_NAME=` sont comparés ;
  // rien n'en sort. Verdict Sécurité à rendre.
  { fichier: "src/server/env/egress.ts", propriete: "config" },
  // B3a (ticket 293 ; décision 0050, « Lignes du régime de confinement ») : arrêt du démarrage sur une configuration
  // refusée (`register()`). Verdict Sécurité : plafond accepté par 0051 point 6.7, lignes réelles à revoir au head de fusion.
  { fichier: "src/instrumentation.ts", propriete: "exit" },
  // PR du workflow des migrations (décisions 0056 et 0057 ; Q412, Q419, Q422) ; verdict Sécurité à rendre : arrêt du groupe de
  // processus de l'exécuteur joué par le test « job arrêté » (0056, « Tests imposés »), comme le runner le ferait.
  { fichier: "tests/db/workflows-harnais.ts", propriete: "kill" },
  // B3b (ticket 444 ; spécification B3, critère B13 ; décision 0008) : sortie standard et sortie d'erreur espionnées
  // (`vi.spyOn(…, "write")`) pendant le parcours de connexion, pour prouver qu'aucune adresse ni aucun code n'y est écrit ;
  // rien n'y est écrit par le test. Verdict Sécurité : approuvé sur le head `ed79edb` (revue consolidée, PR 446).
  { fichier: "tests/db/auth.test.ts", propriete: "stdout" },
  { fichier: "tests/db/auth.test.ts", propriete: "stderr" },
] as const satisfies readonly LigneProcess[];

export const LECTURES_ENV = [
  { fichier: "playwright.config.ts", noms: ["CI", "E2E_SKIP_BUILD"] },
  // B3c (ticket 447 ; spécification B3, B3c point 7 ; décision 0077 § 5.4) : variable d'outillage posée par le seul job
  // `db`, comparée à « 1 », jamais rendue ; démarre le serveur et le projet `auth`. Verdict Sécurité à rendre.
  { fichier: "playwright.config.ts", noms: ["E2E_AUTH_SERVER"] },
  { fichier: "scripts/e2e-port.mjs", noms: ["E2E_PORT", "CI"] },
  { fichier: "scripts/serve-standalone.mjs", noms: ["E2E_SERVER_LOG"], constante: true },
  { fichier: "src/adapters/context.ts", noms: ["DATA_ADAPTER"] },
  { fichier: "src/adapters/index.ts", noms: ["DATA_ADAPTER", "PAYMENT_ADAPTER"] },
  { fichier: "src/adapters/payment-guard.ts", noms: ["VADROUILLE_DEMO_PAYMENT", "PAYMENT_ADAPTER", "DATA_ADAPTER"] },
  // F10c (décision 0039, F10-TL-7) : garde du partage simulé, alignée sur `payment-guard.ts`. Verdict Sécurité : approuvé (PR #236, a1463f6).
  { fichier: "src/adapters/share-guard.ts", noms: ["VADROUILLE_DEMO_SHARE", "DATA_ADAPTER"] },
  // F8b (décision 0017 § 11.2, F8-TL-10) : garde de la connexion simulée, même forme que `share-guard.ts`. Verdict Sécurité : à venir (PR F8b, ticket 259).
  { fichier: "src/adapters/auth-guard.ts", noms: ["AUTH_ADAPTER", "VADROUILLE_DEMO_AUTH"] },
  // B3c (ticket 447 ; décision 0077 § 5.1, B3-TL-2) : environnement déclaré, comparé à une liste fermée (`local`,
  // `development`, `ci`) par `betterAuthAllowed`, valeur jamais rendue ; mêmes règles que `resolveServerEnvironment`
  // (test d'équivalence dans `tests/unit/server/env.test.ts`). Verdict Sécurité à rendre.
  { fichier: "src/adapters/auth-guard.ts", noms: ["VADROUILLE_ENV", "VERCEL_ENV"] },
  // Relevé de la base de P0c1 (P0b1) : `VADROUILLE_PROTOTYPE`, `CI` dans `flags.ts`, `prototype-instance.ts`.
  { fichier: "src/dev/flags.ts", noms: ["VADROUILLE_DEV_PAGES", "VADROUILLE_ENV", "VERCEL_ENV", "VADROUILLE_PROTOTYPE", "CI"] },
  { fichier: "src/adapters/prototype-instance.ts", noms: ["VADROUILLE_PROTOTYPE_DIR"] },
  // B1 (PR 188, après P0c1 ; spécification P0c, sections 5 et 9 ; décision 0036). Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  // Noms secrets de la base : `LECTURES_ENV_SECRETES` ci-dessous (module de connexion et outil de migration seulement).
  { fichier: "db/connection.ts", noms: ["VERCEL_ENV", "VADROUILLE_ENV"] },
  // P0r2 (ticket 284 ; décision 0046, D21) : le vrai `process.env` est lu en plus de l'env injecté ; `VERCEL_TARGET_ENV`
  // pour la liste d'autorisation de `vadrouille_prototype`. Verdict Sécurité à rendre.
  { fichier: "db/connection.ts", noms: ["VERCEL_TARGET_ENV"] },
  { fichier: "scripts/test-db.mjs", noms: ["SKIP_DB_TESTS", "CI", "GITHUB_ACTIONS"] },
  { fichier: "tests/db/env.ts", noms: ["VADROUILLE_DB_ADMIN_URL", "VADROUILLE_DB_BOOTSTRAP_ROLE"] },
  // P0r2 (ticket 284 ; décision 0046) : connexions de test de `vadrouille_prototype` et `vadrouille_prototype_purge`,
  // mots de passe jetables de la CI (`scripts/ci/db-setup.sh`). Verdict Sécurité à rendre.
  { fichier: "tests/db/env.ts", noms: ["VADROUILLE_DB_PROTOTYPE_URL", "VADROUILLE_DB_PROTOTYPE_PURGE_URL"] },
  // B8c (ticket 438 ; décision 0060 § 4) : connexion de test de `vadrouille_coords_purge`, mot de passe jetable de la CI
  // (`scripts/ci/db-setup.sh`). Verdict Sécurité à rendre (question 2 de 0060).
  { fichier: "tests/db/env.ts", noms: ["VADROUILLE_DB_COORDS_PURGE_URL"] },
  { fichier: "tests/unit/db/test-db-sans-base.test.ts", noms: ["PATH", "HOME"] },
  { fichier: "src/components/carte/config.tsx", noms: ["NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID"] },
  // Relevé de la base de P0c1 (P0a1, PR 180) : environnement minimal du sous-processus `pnpm p0`, six lectures par
  // propriété littérale (décision 0042, P0cS-TL-5 ; ticket 221).
  { fichier: "tests/unit/p0/cli.test.ts", noms: ["PATH", "HOME", "SystemRoot", "TMPDIR", "TEMP", "TMP"] },
  // Relevé de `f57153c` (T18) : `PATH` d'un sous-processus de test.
  { fichier: "tests/unit/ci/techlead-gate-workflow.test.ts", noms: ["PATH"] },
  // PR du workflow des migrations (décisions 0056 et 0057 ; Q412, Q419, Q422) ; verdict Sécurité à rendre : `PATH` des scripts bash des
  // workflows de la base, joués avec un environnement construit (aucune autre variable héritée) ; `GITHUB_EVENT_NAME`
  // choisit la référence de « liste approuvée en ajout seulement » (premier parent sur un `push` vers `main`).
  { fichier: "tests/db/workflows-harnais.ts", noms: ["PATH"] },
  { fichier: "tests/unit/ci/db-releve.test.ts", noms: ["PATH"] },
  { fichier: "tests/unit/ci/db-migrate.test.ts", noms: ["GITHUB_EVENT_NAME"] },
  // Contrôle de chiffrement côté client (décision 0067, PR 376) : la ligne du workflow est jouée sous bash avec le seul `PATH`
  // hérité et des valeurs littérales (aucune autre variable). Verdict Sécurité : approuvé (lecture d'un nom non secret,
  // passé à un sous-processus local sans réseau ; tests posés par Samuel, commit 426b08f).
  { fichier: "tests/unit/ci/db-migrate.test.ts", noms: ["PATH"] },
  // Workflow db-reverrouillage (ticket 363 ; décision 0056 § 4.6) ; verdict Sécurité à rendre : `PATH` du `psql` espion placé
  // en tête du chemin pour prouver un refus sans connexion (environnement du script construit par le harnais).
  { fichier: "tests/db/db-reverrouillage.test.ts", noms: ["PATH"] },
  // 0040 D2, A8 : environnement de `git` construit (P0c-suite-release, #222).
  { fichier: "scripts/ci/techlead-gate.mjs", noms: ["PATH", "HOME"] },
  // P0r1 (ticket 267 ; décision 0031 § 6 ; spécification P0c, section 9) : variables de déploiement, de proxy et de TLS de
  // la barrière de sortie, lues par propriété littérale, valeur jamais rendue. Verdict Sécurité à rendre.
  {
    fichier: "src/server/env/egress.ts",
    noms: [
      "VERCEL_ENV",
      "VERCEL_TARGET_ENV",
      "VADROUILLE_ENV",
      // Décision 0062 (ticket 341 ; remplace l'exception de 0058 § 4) : condition 1.1 de l'exception d'`OPENSSL_CONF`,
      // comparée à `1`. `OPENSSL_CONF` (plus bas) est aussi lue dans le vrai `process.env` (condition 1.2).
      "VERCEL",
      "HTTP_PROXY",
      "http_proxy",
      "HTTPS_PROXY",
      "https_proxy",
      "ALL_PROXY",
      "all_proxy",
      "NODE_USE_ENV_PROXY",
      "node_use_env_proxy",
      "NODE_TLS_REJECT_UNAUTHORIZED",
      "NODE_EXTRA_CA_CERTS",
      "SSL_CERT_FILE",
      "SSL_CERT_DIR",
      "OPENSSL_CONF",
      "SSLKEYLOGFILE",
      "NODE_OPTIONS",
    ],
  },
  // B3a (ticket 293 ; décision 0050, « Lignes du régime de confinement » ; 0051 points 6.7.2 et 6.7.3) : environnement
  // du serveur, lu par propriété littérale, valeur jamais rendue. `VADROUILLE_DB_ADMIN_URL` : présence seulement.
  // Verdict Sécurité : plafond accepté par 0051 point 6.7, lignes réelles à revoir au head de fusion. `VERCEL_ENV` dans
  // `index.ts` (garde « hors Vercel » de `TRUSTED_IP_HEADER`, 0051 point 2.2) : ligne au-delà du plafond, verdict
  // Sécurité demandé dans la PR de B3a (0051 point 6.7.7).
  { fichier: "src/instrumentation.ts", noms: ["NEXT_RUNTIME"] },
  { fichier: "src/server/env/resolve.ts", noms: ["VADROUILLE_ENV", "VERCEL_ENV"] },
  {
    fichier: "src/server/env/index.ts",
    noms: ["VERCEL", "HOSTNAME", "TRUSTED_IP_HEADER", "AUTH_ADAPTER", "SIMULATED_WEBHOOK_ENABLED", "VADROUILLE_DB_ADMIN_URL", "VERCEL_ENV"],
  },
  // P0r3b (ticket 311 ; décision 0055, section 1 point 2) : réglage du mode réel validé au démarrage (`enabled`
  // seulement, comparaison exacte), puis conditions (3) à (5) du module étroit `p0.ts` (`CI`, branche, réglage), lues
  // par propriété littérale, à l'appel, valeur jamais rendue. Verdict Sécurité à rendre.
  { fichier: "src/server/env/index.ts", noms: ["P0_REAL_RUNS"] },
  // B3b (ticket 444 ; spécification B3, B3b ; décision 0077 § 5.1) : adresses de la connexion réelle (contrôlées par
  // `origineHttp`, origine seule rendue) ; `EMAIL_TRANSPORT` et `SMTP_URL` : règles de B3b-envoi (décision 0098 § 4 et § 6 :
  // présence, `staging`, `production` et Vercel refusés, valeur `smtp` exacte, forme stricte de l'URL, liste fermée
  // d'hôtes ; valeur jamais rendue). Lues par propriété littérale, dans ce fichier seulement. Verdict Sécurité : approuvé sur le head `ed79edb` (revue consolidée, PR 446).
  { fichier: "src/server/env/index.ts", noms: ["BETTER_AUTH_URL", "APP_URL", "EMAIL_TRANSPORT", "SMTP_URL"] },
  // B3b, correction 1 (revue consolidée du head `f0b8c5a`, bloquant 1 ; décision 0082) : variables que Better Auth 1.7.7
  // lit d'elle-même, refusées au démarrage par leur seule présence (`!== undefined`), valeur jamais lue ; le secret de
  // repli `AUTH_*` est dans `donnees/lectures-env-secretes.json`. Verdict Sécurité : approuvé sur le head `ed79edb` (revue consolidée, PR 446).
  {
    fichier: "src/server/env/index.ts",
    noms: [
      "BETTER_AUTH_TRUSTED_ORIGINS",
      "BETTER_AUTH_TELEMETRY",
      "BETTER_AUTH_TELEMETRY_ENDPOINT",
      "BETTER_AUTH_TELEMETRY_ID",
      "BETTER_AUTH_TELEMETRY_DEBUG",
      "BETTER_AUTH_SECRETS",
    ],
  },
  { fichier: "src/server/env/p0.ts", noms: ["CI", "VERCEL_GIT_COMMIT_REF", "P0_REAL_RUNS"] },
  // B8b (décision 0100 § 3.2 point 4 et § 5.3) : `RELECTURES_SOURCE` (`google` seulement, comparaison exacte) et
  // `POSITIONS_ECRITURE_SUSPENDUE` (`1` seulement, 0060 § 1.3), lues par propriété littérale, à l'appel, valeur jamais
  // rendue ni journalisée. Verdict Sécurité : attendu (0100 § 7 point 4).
  { fichier: "src/server/env/relectures.ts", noms: ["RELECTURES_SOURCE", "POSITIONS_ECRITURE_SUSPENDUE"] },
  // B9e (spécification B9, B9e point 3) : déclarations de déploiement de la source simulée des voyages générés, lues par
  // propriété littérale, à l'appel, rendues au seul chargeur de fixtures (0105 § 2 point 2) et seulement en `local` ou `ci`
  // (décision 0110 § 1). Verdict Sécurité : approuvé (revue consolidée de la PR #588).
  { fichier: "src/server/env/relectures.ts", noms: ["VADROUILLE_ENV", "VERCEL_ENV"] },
  // B9c (décision 0081 B9-TL-8) : déclarations de déploiement et drapeau d'activation de la barrière des appels réels, lues
  // par propriété littérale, à l'appel, valeurs jamais journalisées. Verdict Sécurité : attendu.
  { fichier: "src/server/env/generation.ts", noms: ["VADROUILLE_ENV", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "GENERATION_APPELS_REELS"] },
  // P0r3d (ticket 354 ; 0046, D24) : commit du déploiement (identifiant public posé par Vercel), consigné avec
  // l'exécution réservée ; lu à l'appel par `commitDuDeploiement`, forme contrôlée. Verdict Sécurité : approuvé (revue consolidée du head `193603d`, PR 357).
  { fichier: "src/server/env/p0.ts", noms: ["VERCEL_GIT_COMMIT_SHA"] },
  // P0r3d (ticket 354 ; décision 0063 point 8) : relevé humain de la route de flux sur la préversion de `p0-reel`,
  // adresse et jeton de contournement de la protection Vercel posés par la personne qui le lance ; absents, le bloc est
  // ignoré. Jeton envoyé seulement à l'adresse donnée, jamais écrit. Verdict Sécurité : approuvé (revue consolidée du head `193603d`, PR 357).
  { fichier: "tests/e2e/p0-flux.e2e.spec.ts", noms: ["E2E_P0_REEL_URL", "E2E_P0_REEL_BYPASS"] },
  // B4a (ticket 531 ; spécification B4, B4a point 6 ; décision 0097 B4-TL-3) : choix des adaptateurs de paiement et de
  // données, lus par propriété littérale, valeur contrôlée contre une liste fermée et jamais journalisée. Verdict Sécurité : approuvé, revue du head d50acfa (PR 582).
  { fichier: "src/server/env/index.ts", noms: ["PAYMENT_ADAPTER", "DATA_ADAPTER"] },
] as const satisfies readonly LigneLectureEnv[];

export const ENV_ENTIER = [
  { fichier: "playwright.config.ts", formes: ["propriete-env:e2ePort"] },
  // Ticket 691 (spécification E2E-essai, lot 1) : `paymentAvailable` passe aussi son `env` à `prototypeAdapterAllowed`
  // (paiement simulé d'un voyage d'essai, liste blanche de `prototype`, jamais en production). Verdict Sécurité : demandé
  // dans la relecture de la PR du lot 1.
  {
    fichier: "src/adapters/payment-guard.ts",
    formes: [
      "defaut:paymentDemoAllowed",
      "defaut:paymentAvailable",
      "argument:isProductionDeployment",
      "argument:paymentDemoAllowed",
      "argument:prototypeAdapterAllowed",
    ],
  },
  // F10c (décision 0039, F10-TL-7) : même forme que `payment-guard.ts`. Verdict Sécurité : approuvé (PR #236, a1463f6).
  {
    fichier: "src/adapters/share-guard.ts",
    formes: ["defaut:shareDemoAvailable", "defaut:shareAvailable", "argument:isProductionDeployment", "argument:shareDemoAvailable"],
  },
  // F8b (décision 0017 § 11.2, F8-TL-10) : même forme que `share-guard.ts`. Verdict Sécurité : à venir (PR F8b, ticket 259).
  {
    fichier: "src/adapters/auth-guard.ts",
    formes: [
      "defaut:authAdapterChoice",
      "defaut:mockAuthAllowed",
      "defaut:assertAuthAdapter",
      "argument:isProductionDeployment",
      "argument:authAdapterChoice",
      "argument:mockAuthAllowed",
    ],
  },
  // B3c (ticket 447 ; spécification B3, B3c point 4 ; décision 0077 § 5.1, B3-TL-2) : `betterAuthAllowed` (local et ci
  // seulement) ; même forme que les gardes ci-dessus, environnement entier en valeur par défaut, jamais rendu. Verdict
  // Sécurité à rendre.
  {
    fichier: "src/adapters/auth-guard.ts",
    formes: ["defaut:betterAuthAllowed", "argument:betterAuthAllowed"],
  },
  { fichier: "src/adapters/simulation.ts", formes: ["defaut:simulationEnabled", "argument:devPagesEnabled", "argument:isProductionDeployment"] },
  { fichier: "src/dev/flags.ts", formes: ["defaut:devPagesEnabled", "defaut:isProductionDeployment", "defaut:prototypeAdapterAllowed", "argument:isProductionDeployment"] },
  { fichier: "tests/unit/ci/visual-update.test.ts", formes: ["etalement"] },
  // Relevé de la base de P0c1 (P0b1, après `40b6738`).
  { fichier: "src/adapters/context.ts", formes: ["defaut:getRequestContext", "argument:assertPrototypeAllowed"] },
  // B3c (ticket 447 ; B3-TL-4, décision 0077 § 5.3) : contexte asynchrone ; `getOptionalRequestContext` reçoit
  // l'environnement entier en valeur par défaut et le passe aux gardes `authAdapterChoice` et `assertAuthAdapter`, jamais
  // rendu. Verdict Sécurité à rendre.
  {
    fichier: "src/adapters/context.ts",
    formes: ["defaut:getOptionalRequestContext", "argument:authAdapterChoice", "argument:assertAuthAdapter", "argument:getOptionalRequestContext"],
  },
  { fichier: "src/adapters/index.ts", formes: ["defaut:getTripAdapter", "argument:prototypeTripAdapter"] },
  {
    fichier: "src/adapters/prototype-instance.ts",
    formes: ["defaut:prototypeTripAdapter", "defaut:prototypeRelectures", "argument:assertPrototypeAllowed", "argument:prototypeAdapterAllowed"],
  },
  { fichier: "tests/e2e/prototype-helpers.ts", formes: ["propriete-env:e2ePort"] },
  // Ticket 691 (spécification E2E-essai, lot 1) : port du serveur d'essai, même forme que `prototype-helpers.ts`.
  { fichier: "tests/e2e/essai-helpers.ts", formes: ["propriete-env:e2ePort"] },
  // Relevé de `f57153c` (T18) : environnement des sous-processus de test.
  { fichier: "tests/unit/ci/techlead-gate-workflow.test.ts", formes: ["etalement"] },
  // B1 (PR 188, après P0c1 ; spécification P0c, section 9). Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { fichier: "db/index.ts", formes: ["defaut:createDatabase", "argument:createGuardedPool"] },
  { fichier: "db/connection.ts", formes: ["argument:connectionStringFor", "argument:assertDatabaseAllowed", "argument:isProductionForDatabase"] },
  // P0r2 (ticket 284 ; décision 0046, D21) : liste d'autorisation de `vadrouille_prototype`, appliquée à l'env injecté
  // (passé par `connectionStringFor`) et au vrai `process.env`. Verdict Sécurité à rendre.
  { fichier: "db/connection.ts", formes: ["argument:prototypeDatabaseAllowed"] },
  { fichier: "db/migrate.ts", formes: ["argument:runMigrations", "argument:migratorConnectionString", "argument:assertDatabaseAllowed"] },
  // `argument:isProductionForDatabase` : ajoutée par la correction 1 de la PR 244 (mineur 5 de la revue du head
  // a89d9a5 : garde de production distinguée des variables absentes) ; verdict Sécurité à renouveler sur ce head.
  { fichier: "tests/db/env.ts", formes: ["argument:connectionStringFor", "argument:migratorConnectionString", "argument:isProductionForDatabase"] },
  // P0r1 (ticket 267 ; décision 0031 § 6 ; spécification P0c, section 9) : modules étroits, environnement lu à l'appel
  // (jamais à l'import), passé entier à la seule barrière de sortie. Verdict Sécurité à rendre.
  { fichier: "src/server/env/egress.ts", formes: ["defaut:verifierSortie"] },
  { fichier: "src/server/env/ai.ts", formes: ["defaut:lireCleOpenRouter", "argument:verifierSortie"] },
  { fichier: "src/server/env/grounding.ts", formes: ["defaut:lireCleGoogle", "argument:verifierSortie"] },
  { fichier: "src/server/env/garde-cles.ts", formes: ["defaut:clesDeServicePosees"] },
  // P0r3b (ticket 311 ; décision 0055, section 1 point 2) : module étroit du mode réel, environnement lu à l'appel,
  // passé entier à la barrière de sortie et au seul calcul de l'environnement (B3a). Verdict Sécurité à rendre.
  { fichier: "src/server/env/p0.ts", formes: ["defaut:lireEnvP0", "argument:verifierSortie", "argument:resolveServerEnvironment"] },
  // B8b (décision 0100 § 5.3) : même forme pour le module étroit de la lecture ; l'environnement entier va au seul calcul de
  // l'environnement (B3a). Verdict Sécurité : attendu.
  { fichier: "src/server/env/relectures.ts", formes: ["defaut:ecriturePositionsSuspendue", "defaut:sourceReelleChoisie", "argument:resolveServerEnvironment"] },
  // B9e : même forme pour les déclarations de la source simulée des voyages générés. Verdict Sécurité : approuvé (#588).
  { fichier: "src/server/env/relectures.ts", formes: ["defaut:declarationsLectureSimulee"] },
  // B9c : même forme pour la barrière des appels réels (l'environnement lu rend quatre déclarations, jamais une clé).
  { fichier: "src/server/env/generation.ts", formes: ["defaut:lireEnvGeneration"] },
  // P0r3d (ticket 354) : même forme pour le commit du déploiement, lu par propriété littérale. Verdict Sécurité : approuvé (revue consolidée du head `193603d`, PR 357).
  { fichier: "src/server/env/p0.ts", formes: ["defaut:commitDuDeploiement"] },
  // B3a (ticket 293 ; décision 0050, « Lignes du régime de confinement » ; 0051 point 6.7.3) : `process.env` entier
  // passé à la validation (`register()`, `serverEnv()`) et à la résolution de l'environnement (garde de connexion).
  // Verdict Sécurité : plafond accepté par 0051 point 6.7, lignes réelles à revoir au head de fusion.
  { fichier: "src/instrumentation.ts", formes: ["argument:parseServerEnv", "argument:assertServerProcessEnv"] },
  { fichier: "src/server/env/index.ts", formes: ["argument:parseServerEnv", "argument:resolveServerEnvironment"] },
  { fichier: "db/connection.ts", formes: ["argument:resolveServerEnvironment"] },
  // B3a (ticket 293 ; spécification B3, B3a point 3) : copie de l'environnement du lanceur, dont sont retirées
  // `VADROUILLE_DATABASE_URL_MIGRATOR` et `VADROUILLE_DB_ADMIN_URL`, passée au serveur autonome. Ligne au-delà du plafond
  // de 0050 (la section 5, forme 3, ne prévoit l'étalement que dans des tests) : verdict Sécurité écrit exigé dans la
  // PR de B3a (0051 point 6.7.7), à rendre.
  { fichier: "scripts/serve-standalone.mjs", formes: ["etalement"] },
  // B3a (ticket 293 ; 0050, « Acceptation par le Tech Lead de 0051 », point 4 ; 0051 point 6.4.4) : environnement du
  // processus Vitest de `pnpm test:db`, plus le secret du limiteur tiré à l'exécution (clé de l'objet seulement).
  // Relevée par l'analyseur : verdict Sécurité écrit exigé dans la PR de B3a (0051 point 6.7.7), à rendre.
  { fichier: "scripts/test-db.mjs", formes: ["etalement"] },
] as const satisfies readonly LigneEnvEntier[];

export const PARAMETRES_ENV = [
  { fichier: "scripts/e2e-port.mjs", fonction: "e2ePort", parametre: "env" },
  // Relevé de la base de P0c1 (P0b1) : reçoit `process.env` de `getRequestContext` et de `prototypeTripAdapter`.
  { fichier: "src/adapters/prototype-instance.ts", fonction: "assertPrototypeAllowed", parametre: "env" },
  // B1 (PR 188, après P0c1) : chaîne de la garde de connexion et des migrations, lue par propriété littérale. Verdict Sécurité : approuvé sur le head a89d9a5 (PR 244, ticket 242).
  { fichier: "db/connection.ts", fonction: "createGuardedPool", parametre: "env" },
  { fichier: "db/connection.ts", fonction: "connectionStringFor", parametre: "env" },
  { fichier: "db/connection.ts", fonction: "assertDatabaseAllowed", parametre: "env" },
  { fichier: "db/connection.ts", fonction: "isProductionForDatabase", parametre: "env" },
  // P0r2 (ticket 284 ; décision 0046, D21). Verdict Sécurité à rendre.
  { fichier: "db/connection.ts", fonction: "prototypeDatabaseAllowed", parametre: "env" },
  { fichier: "db/migrate.ts", fonction: "runMigrations", parametre: "env" },
  { fichier: "db/migrate.ts", fonction: "migratorConnectionString", parametre: "env" },
  // B3a (ticket 293 ; décision 0050, « Lignes du régime de confinement »). Verdict Sécurité : plafond accepté par 0051
  // point 6.7, lignes réelles à revoir au head de fusion.
  { fichier: "src/server/env/index.ts", fonction: "parseServerEnv", parametre: "env" },
  { fichier: "src/server/env/index.ts", fonction: "assertServerProcessEnv", parametre: "env" },
  { fichier: "src/server/env/resolve.ts", fonction: "resolveServerEnvironment", parametre: "env" },
] as const satisfies readonly ParametreEnv[];

/**
 * Lectures littérales de **noms secrets** (section 5, « Noms secrets » : seulement pour un module de `src/server/env/`
 * ou le module de connexion de B1, avec verdict Sécurité). Même forme que `LECTURES_ENV`, mais lues dans
 * `donnees/lectures-env-secretes.json`, extension non analysée : les fichiers `.ts` du régime ne contiennent aucun nom
 * secret (section 1, « Données du régime »). Chaque nom est une ligne au sens de « ligne inutile » ; un fichier qui
 * n'est pas admis par `lectureSecreteAdmise` fait échouer le test des noms secrets des listes.
 */
export const LECTURES_ENV_SECRETES: readonly LigneLectureEnv[] = (
  JSON.parse(readFileSync(new URL("../donnees/lectures-env-secretes.json", import.meta.url), "utf8")) as { lignes: readonly LigneLectureEnv[] }
).lignes;

/**
 * Toutes les lectures littérales de `process.env` admises : lignes `.ts` et lignes de noms secrets des données du
 * régime. Liste unique pour l'analyse et le test du dépôt (revue du head `a89d9a5`, PR 244, mineur 3).
 */
export const LECTURES_ENV_TOUTES: readonly LigneLectureEnv[] = [...LECTURES_ENV, ...LECTURES_ENV_SECRETES];
