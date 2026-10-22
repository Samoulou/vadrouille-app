import "server-only";

import { CODE_CLE_ABSENTE } from "@/ai/erreurs";
import { API_ERROR_CODES } from "@/contracts/values";
import { CODES_ARRET_JOURNAL_SANS_CLE } from "@/server/log-codes-arret";

/**
 * Journal structuré du serveur (spécification B3, B3a point 7 ; décision 0050, B3-TL-7 ; 0051 point 6.1). Seul point
 * d'écriture des journaux de B3 : une ligne JSON par événement, par `console.log` (`info`, `warn`) ou `console.error`
 * (`error`), sans dépendance ni niveau `debug`.
 *
 * Liste blanche par construction : le nom d'événement est pris dans une union fermée, contrôlée aussi à l'exécution
 * (un nom inconnu est remplacé par `log.unknown_event`, sans le nom reçu) ; seuls les champs ci-dessous sont admis, et
 * une valeur qui ne suit pas le motif de son champ est **retirée** (jamais tronquée ni remplacée) ; le nombre de champs
 * retirés est écrit dans `dropped`. Aucun message ni pile d'erreur n'est jamais écrit : d'une erreur, seul `error.name`
 * peut l'être (`errorName`).
 */

export const LOG_EVENTS = [
  "config_missing",
  "config_invalid",
  "rate_limit.no_trusted_ip",
  "rate_limit.purge_failed",
  "rate_limit.rows_high",
  "rate_limit.failed",
  // P0r3b (décision 0055, section 1 points 2 et 3) : garde du mode réel fermée ; champ `guard` (code fermé), depuis
  // 0058 `cause` et `exception`, depuis 0062 `openssl_conf_zone` et `openssl_conf_verdict`, depuis 0065
  // `openssl_conf_directives` (listes fermées, jamais une valeur).
  "p0.guard_closed",
  // Ticket 400 : fin de l'étape de recherche de `p0Run`, compteurs de l'agent seulement (des nombres : ni texte du
  // modèle, ni requête, ni URL, ni donnée Google) ; niveau `warn` si aucun candidat n'est retenu. Depuis le ticket 407,
  // écrite aussi quand la recherche lève (`errorName`, `warn`), avec `deadlineStop` (fin sur l'échéance de l'étape).
  "p0.research_done",
  // Décision 0116 § 4.4 et verdict 0117 § 4 : fin de l'étape `etapeProgramme` de `p0Run`, compteurs **maison** seulement
  // (`days`, `slots`, `placesToVerify`, `daysRemoved`, `slotsRemoved`, `fieldsRemoved`, `textsCut`, `modelCalls`,
  // `unverifiedForCap`), des nombres ; jamais un compteur de verdict de vérification (vérifiés, introuvables, fermés,
  // hors zone), ni nom, ni texte, ni donnée Google. Écrite aussi quand l'étape lève (`errorName`, `warn`). Lot 2a
  // (décision 0121 § 2.3, verdict 0122 § 2.1) : `sitesProposed`, `sitesChecked`, `sitesRemoved`, `sitesUnchecked`,
  // nombres de nos propres vérifications des sites proposés par l'IA ; ni adresse, ni nom d'hôte, ni motif, ni statut.
  "p0.programme_written",
  // Décision 0074 : branchement de la lecture des programmes réels impossible au démarrage ; `errorName` seulement.
  "p0.read_unavailable",
  // B3b (spécification B3, B3b point 2) : adresse refusée par le contrôle refait avant l'envoi, envoi refusé par
  // l'implémentation désactivée du port, journal de Better Auth (niveau seulement, jamais le message ni ses
  // arguments), échec d'une opération de la liste blanche et de la purge technique (`action` et `errorName`
  // seulement). Aucune valeur : ni adresse, ni code, ni jeton, ni adresse IP.
  "email.address_refused",
  "email.transport_disabled",
  // B3b-envoi (critères E5 et E6) : enveloppe refusée par `checkEnvelope` avant tout appel du transport ; aucune valeur.
  "email.envelope_refused",
  "auth.library_log",
  "auth.operation_failed",
  "auth.purge_failed",
  // B6a (spécification B6, B6a point 10 ; décision 0086 § 4 point 2, verdict Sécurité attendu) : lecture d'un voyage
  // en échec (donnée incohérente ou sortie invalide), refus du port de relectures (une fois par lecture, par le cas
  // d'usage seul). Champs : `reason` (liste fermée), `tripId`, `version`, `dayIndex` ; aucun nom, instantané,
  // `placeId`, coordonnée, durée ni message de base.
  "voyages.read_failed",
  "voyages.relecture_refused",
  // B8b (décision 0100 § 4.4, verdict Sécurité attendu § 7 point 3) : une lecture dont les fiches (horaires, positions) ont
  // échoué, une fois par lecture, par la source de relectures seule. Champs : `reason` (`LOG_FICHES_REASONS`, liste
  // fermée) et `tripId` ; aucun identifiant de lieu, aucune donnée Google.
  "voyages.fiches_non_relues",
  // B8b (correction 1 de la PR #554, revue du head 244b81a, bloquant 2 ; décision 0060 § 1.3 : « seul le code est journalisé » ;
  // verdict Sécurité attendu, 0100 § 7 point 3) : l'écriture au cache des positions a échoué et a été abandonnée (la lecture
  // est servie), une fois par lecture, par la source de relectures seule. Champ unique : `reason`
  // (`LOG_POSITIONS_REASONS`, liste fermée) ; ni identifiant (voyage, lieu, organisation), ni coordonnée, ni message.
  "voyages.positions_non_ecrites",
  // B6b (spécification B6, B6b point 2 ; décision 0086 § 2.2, verdict Sécurité attendu § 4 point 4) : action sur un
  // voyage terminée par `internal` (erreur inattendue convertie), ou échec du branchement de l'adaptateur `api` au
  // démarrage (`action` : `branchement`, `src/instrumentation.ts`). Champs : `action` (nom fixe de l'action), `errorName`
  // et `tripId` ; aucun message de base, aucune entrée.
  "voyages.action_failed",
  // Ticket 493, décision 0090 (verdict Sécurité S4 : favorable) : arrêt d'une étape de `p0Run`, cause fermée seulement.
  // Champs : `phase` (`LOG_STEP_PHASES`), `errorName` (nom de classe de l'erreur, filtré par `NOM_ERREUR` : lettres
  // seulement, 40 au plus ; absent sinon) et `failureCode` (`LOG_STEP_FAILURE_CODES`, `autre` sinon) ; aucun message,
  // aucune donnée Google, aucun identifiant de lieu ni d'exécution. Niveau `warn` pour un arrêt attendu par plafond,
  // `error` sinon (`src/server/p0/journal-etape.ts`).
  "p0.step_failed",
  // B4a (spécification B4, B4-PO-12 ; décision 0097 B4-TL-13 et B4-TL-11 point 1.1) : alerte de paiement (niveau `error`,
  // champs `eventId`, `eventType`, `alertCode`, `checkoutId` seulement), échec de la suite après un droit validé (`warn`,
  // `errorName` seulement), configuration invalide sur le webhook simulé (`warn`, `rule` et `variable` seulement). Ni
  // e-mail, ni nom, ni adresse IP, ni corps d'événement, ni en-tête de signature, ni secret.
  "payment.alert",
  "payment.followup_failed",
  "payment.webhook_config_invalid",
  // B9d (spécification B9, B9-PO-17 points 3 et 4 ; décision 0087 § 1.4) : un voyage complet entre en état bloqué (reprise par
  // le studio), une fois par passage, par l'écrivain dont l'écriture a passé la ligne en `failed`. Niveau `warn` ; champs
  // `tripId`, `organizationId`, `generationRunId` (identifiants internes) et `stopReason` (code fermé) ; aucune donnée de lieu.
  "generation.full_stuck",
  // B10b (spécification B10 ; décision 0119 § 1.3 points 4 et 5 ; verdict Sécurité 0120 S1 point 1 et S7) : recalcul d'un tri
  // (workflow 5). `recalcul.not_created` : ligne `batch` attendue absente après `ON CONFLICT DO NOTHING` (collision sur l'index
  // des `request_id`, ou sur l'index « une exécution en cours par voyage »), ou lecture illisible dans `completeDeck` (la
  // clôture est gardée), aucun démarrage ; `recalcul.start_failed` : démarrage du SDK échoué, ligne close aussitôt en `failed` ;
  // `recalcul.unlock_failed` : second travail de la suite du déblocage en échec, attrapé (le voyage complet n'est pas touché).
  // Niveau `warn` ; champs `organizationId`, `tripId`, `generationRunId` (identifiants internes), `errorName` et `days` (nombre
  // de jours touchés, fonction des seuls signaux du tri et de la version de base) ; aucun nom, `placeId`, catégorie, raison,
  // texte de question, durée ni compteur qui dépende de Google.
  "recalcul.not_created",
  "recalcul.start_failed",
  "recalcul.unlock_failed",
  "log.unknown_event",
] as const;
export type LogEvent = (typeof LOG_EVENTS)[number];

export type LogLevel = "info" | "warn" | "error";

/** Champs admis. `variable` : nom de la liste fermée de `src/server/env/index.ts` ; `rule` : code de règle de B3-TL-1. */
export type LogFields = {
  readonly code?: string;
  readonly action?: string;
  readonly variable?: string;
  readonly rule?: string;
  readonly durationMs?: number;
  readonly rows?: number;
  readonly environment?: string;
  readonly errorName?: string;
  /** Code fermé de la garde du mode réel (`src/server/p0/garde.ts`), jamais une valeur. */
  readonly guard?: string;
  /** Nom de la variable ou de l'option de proxy ou de TLS en cause (décision 0058), jamais une valeur. */
  readonly cause?: string;
  /** Marque de l'exception de la barrière de sortie (décision 0062) : `vercel_runtime_openssl_conf` seulement. */
  readonly exception?: string;
  /** Classe de racine du chemin d'`OPENSSL_CONF` (décision 0062 § 5.1, liste fermée de 7 valeurs), jamais le chemin. */
  readonly openssl_conf_zone?: string;
  /** Verdict fermé de l'examen d'`OPENSSL_CONF` (décision 0062 § 5.1). */
  readonly openssl_conf_verdict?: string;
  /**
   * Directives d'un fichier `section_nodejs` (décision 0065 § 4 point 3) : jetons de `LOG_OPENSSL_CONF_DIRECTIVES`,
   * sans doublon, séparés par `,` ; jamais une valeur, un nom de section ni un nom de groupe.
   */
  readonly openssl_conf_directives?: string;
  /** Compteurs de l'agent de recherche (`p0.research_done`, ticket 400) : entiers positifs ou nuls, jamais un texte. */
  readonly turns?: number;
  readonly searches?: number;
  readonly pagesRead?: number;
  /** Tous les candidats retenus, événements compris. */
  readonly candidates?: number;
  /** Candidats retenus hors événements (lieux) : 0 donne le niveau `warn` et l'arrêt `research_empty` (mineur 2). */
  readonly places?: number;
  readonly candidatesRefused?: number;
  readonly planRefused?: number;
  readonly planUnreadable?: number;
  readonly turnRefused?: number;
  readonly turnUnreadable?: number;
  readonly finishIgnored?: number;
  readonly finishAbnormal?: number;
  /** Fins de la recherche sur l'échéance de l'étape, candidats admis gardés (ticket 407) : 0 ou 1. */
  readonly deadlineStop?: number;
  /**
   * Compteurs de l'amendement 3 de `specs/P0-suite-2.md` (P0S2-PO-25), sortie de l'agent avant tout ancrage : secteurs
   * et incontournables du plan, incontournables sans candidat, candidats regroupés, secteurs inconnus. Des nombres,
   * jamais un nom ; aucun ne dépend d'une position, d'une fiche ni d'un résultat Google.
   */
  readonly sectors?: number;
  readonly mustSees?: number;
  readonly mustSeesWithoutCandidate?: number;
  readonly candidatesGrouped?: number;
  readonly sectorUnknown?: number;
  /**
   * Champs facultatifs d'enrichissement retirés des candidats gardés de l'agent (ticket 595, décision 0111) : un nombre,
   * jamais le nom du champ ni son texte.
   */
  readonly fieldsRemoved?: number;
  /** Textes trop longs coupés dans les candidats gardés de l'agent (décision 0111) : un nombre, jamais le texte. */
  readonly textsCut?: number;
  /**
   * Compteurs maison de `p0.programme_written` (décision 0116 § 4.4, verdict 0117 § 4) : journées et créneaux lus, lieux
   * distincts à vérifier, journées et créneaux retirés à la lecture, requêtes de modèle, lieux laissés sans vérification
   * faute de part ou de temps. Entiers positifs ou nuls ; aucun ne dit l'issue d'une vérification.
   */
  readonly days?: number;
  readonly slots?: number;
  readonly placesToVerify?: number;
  readonly daysRemoved?: number;
  readonly slotsRemoved?: number;
  readonly modelCalls?: number;
  readonly unverifiedForCap?: number;
  /**
   * Sites proposés par l'IA (lot 2a, § 11.5 ; 0122 § 2.1) : adresses distinctes de forme valide, soumises, refusées,
   * jamais soumises. Entiers positifs ou nuls ; aucun compteur par motif, aucune adresse.
   */
  readonly sitesProposed?: number;
  readonly sitesChecked?: number;
  readonly sitesRemoved?: number;
  readonly sitesUnchecked?: number;
  /** Raison fermée d'une lecture de voyage en échec (B6a point 10) : `LOG_READ_REASONS`. Jamais une valeur. */
  readonly reason?: string;
  /** Identifiant interne d'un voyage (`uuid`), jamais un nom ni une destination (B6a point 10). */
  readonly tripId?: string;
  /** Numéro de version d'un voyage (entier ≥ 1). */
  readonly version?: number;
  /** Numéro de jour (1 = J1). */
  readonly dayIndex?: number;
  /** Phase d'une étape de `p0Run` arrêtée (`p0.step_failed`, ticket 493) : `LOG_STEP_PHASES`. */
  readonly phase?: string;
  /** Code fermé de la cause d'arrêt d'une étape (`p0.step_failed`) : `LOG_STEP_FAILURE_CODES`, jamais un message. */
  readonly failureCode?: string;
  /** Identifiant d'un événement de paiement (`payment.alert`, B4-TL-13) : forme simulée ou `evt_…` de Stripe. */
  readonly eventId?: string;
  /** Type normalisé d'un événement de paiement (`PaymentEvent.type`, liste fermée). */
  readonly eventType?: string;
  /** Code d'une alerte de paiement : `LOG_ALERT_CODES`. Jamais le champ `code`, réservé à `API_ERROR_CODES`. */
  readonly alertCode?: string;
  /** Identifiant interne d'un paiement (`uuid` de `checkouts.id`), jamais l'identifiant public ni celui du prestataire. */
  readonly checkoutId?: string;
  /** Identifiant interne d'une organisation (`uuid`) : argument de la commande de reprise du studio (B9d, 0087 § 1.6). */
  readonly organizationId?: string;
  /** Identifiant interne d'une exécution de génération (`uuid` de `generation_runs.id`, B9d, 0087 § 1.4 point 3). */
  readonly generationRunId?: string;
  /** Code fermé d'arrêt d'une génération (`generation_runs.stop_reason`, liste fermée de la décision 0114), jamais un message. */
  readonly stopReason?: string;
};

/**
 * Noms de variables admis dans le champ `variable` : même liste fermée que `SERVER_ENV_VARIABLES`
 * (`src/server/env/index.ts`, que ce module n'importe pas : `ligne/server-env-imports`) ; l'égalité des deux listes est
 * vérifiée par le test du module de journal. Écrits en clés d'objet : un nom de variable n'est jamais un texte du
 * journal (spécification P0c, section 5, « Noms secrets »).
 */
const VARIABLES_ADMISES: ReadonlySet<string> = new Set(
  Object.keys({
    VADROUILLE_ENV: 0,
    VERCEL_ENV: 0,
    VERCEL: 0,
    HOSTNAME: 0,
    AUTH_ADAPTER: 0,
    TRUSTED_IP_HEADER: 0,
    RATE_LIMIT_HMAC_SECRET: 0,
    BETTER_AUTH_SECRET: 0,
    BETTER_AUTH_URL: 0,
    APP_URL: 0,
    VADROUILLE_DATABASE_URL_AUTH: 0,
    EMAIL_TRANSPORT: 0,
    SMTP_URL: 0,
    BETTER_AUTH_TRUSTED_ORIGINS: 0,
    BETTER_AUTH_TELEMETRY: 0,
    BETTER_AUTH_TELEMETRY_ENDPOINT: 0,
    BETTER_AUTH_TELEMETRY_ID: 0,
    BETTER_AUTH_TELEMETRY_DEBUG: 0,
    BETTER_AUTH_SECRETS: 0,
    AUTH_SECRET: 0,
    SIMULATED_WEBHOOK_SECRET: 0,
    SIMULATED_WEBHOOK_ENABLED: 0,
    PAYMENT_ADAPTER: 0,
    DATA_ADAPTER: 0,
    VADROUILLE_DATABASE_URL_MIGRATOR: 0,
    VADROUILLE_DB_ADMIN_URL: 0,
    STRIPE_SECRET_KEY: 0,
    STRIPE_PUBLISHABLE_KEY: 0,
    "STRIPE_*": 0,
    P0_REAL_RUNS: 0,
    P0_RUN_TOKEN: 0,
    "P0_*": 0,
  }),
);

/** Noms de variables du champ `variable`, pour le test d'égalité avec `src/server/env/index.ts`. */
export const LOG_VARIABLES: readonly string[] = [...VARIABLES_ADMISES];

const REGLES = new Set([
  "missing",
  "forbidden",
  "invalid_value",
  "production_prefix",
  "secret_too_short",
  "secret_encoding",
  "secret_trivial",
  "secret_duplicate",
  "untrusted_header",
  "header_outside_vercel",
]);
/**
 * Codes de la garde fermée du mode réel (décision 0055, section 1 point 2) : ceux de `lireEnvP0`
 * (`src/server/env/p0.ts`, que ce module n'importe pas : `ligne/server-env-imports`) et ceux de la garde
 * (`src/server/p0/garde.ts`) ; l'égalité des listes est vérifiée par le test de la garde.
 */
export const LOG_GUARD_CODES: readonly string[] = [
  "production_refused",
  "proxy_env_refused",
  "tls_env_refused",
  "environment_refused",
  "ci_refused",
  "branch_refused",
  "real_runs_disabled",
  "database_missing",
  "access_code_missing",
  "access_code_invalid",
  "production_deployment",
];
const GARDES: ReadonlySet<string> = new Set(LOG_GUARD_CODES);
/**
 * Causes admises dans le champ `cause` (décision 0058, ticket 319) : noms de la liste fermée `CAUSES_SORTIE` de la
 * barrière de sortie (`src/server/env/egress.ts`, que ce module n'importe pas : `ligne/server-env-imports`) ; l'égalité
 * des deux listes est vérifiée par le test de la barrière. Des noms, jamais des valeurs.
 */
export const LOG_EXIT_CAUSES: readonly string[] = [
  "HTTP_PROXY",
  "http_proxy",
  "HTTPS_PROXY",
  "https_proxy",
  "ALL_PROXY",
  "all_proxy",
  "NODE_USE_ENV_PROXY",
  "node_use_env_proxy",
  "--use-env-proxy",
  "NODE_TLS_REJECT_UNAUTHORIZED",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "OPENSSL_CONF",
  "SSLKEYLOGFILE",
  "--use-openssl-ca",
  "--use-system-ca",
  "--openssl-config",
  "--openssl-legacy-provider",
  "--openssl-shared-config",
  "--tls-keylog",
  "--tls-min-v1.0",
  "--tls-min-v1.1",
  "--tls-cipher-list",
  "--insecure-http-parser",
];
const CAUSES: ReadonlySet<string> = new Set(LOG_EXIT_CAUSES);
/**
 * Marques d'exception (`exception`), classes de racine (`openssl_conf_zone`) et verdicts (`openssl_conf_verdict`) de la
 * barrière de sortie (décision 0062 § 5) : copies des listes fermées d'`egress.ts` (que ce module n'importe pas :
 * `ligne/server-env-imports`) ; l'égalité est vérifiée par le test de la garde.
 */
export const LOG_EXIT_EXCEPTIONS: readonly string[] = ["vercel_runtime_openssl_conf"];
export const LOG_OPENSSL_CONF_ZONES: readonly string[] = ["dev_null", "etc", "usr", "var_runtime", "var_lang", "opt", "autre"];
export const LOG_OPENSSL_CONF_VERDICTS: readonly string[] = [
  "hors_preview",
  "env_differente",
  "nom_section_refuse",
  "chemin_refuse",
  "fichier_refuse",
  "inclusion_refusee",
  "section_nodejs",
  "contenu_audite",
  "admis",
];
/**
 * Jetons admis dans `openssl_conf_directives` (décision 0065 § 4 point 3 et § 5 point 4) : copie de
 * `DIRECTIVES_OPENSSL_CONF` (`src/server/env/openssl-conf.ts`) ; l'égalité est vérifiée par le test de la garde.
 */
export const LOG_OPENSSL_CONF_DIRECTIVES: readonly string[] = [
  "nodejs_conf",
  "openssl_conf",
  "ssl_conf",
  "system_default",
  "providers",
  "alg_section",
  "default_properties",
  "engines",
  "random",
  "activate",
  "module",
  "minprotocol",
  "maxprotocol",
  "protocol",
  "cipherstring",
  "ciphersuites",
  "options",
  "verifymode",
  "verifycafile",
  "verifycapath",
  "verifycastore",
  "chaincafile",
  "chaincapath",
  "chaincastore",
  "requestcafile",
  "signaturealgorithms",
  "clientsignaturealgorithms",
  "groups_admis",
  "groups_autres",
  "include",
  "pragma",
  "autre",
];
/**
 * Raisons admises dans le champ `reason` (B6a point 10 ; 0086 § 4 point 2 (a)) : copie de `RAISONS_LECTURE`
 * (`src/server/voyages/erreurs.ts`) ; l'égalité des deux listes est vérifiée par le test de la lecture des voyages.
 */
export const LOG_READ_REASONS: readonly string[] = [
  "time_zone_missing",
  "snapshot_invalid",
  "checklist_orphan",
  "proposal_invalid",
  "proposal_day_missing",
  "stay_missing",
  "mobility_invalid",
  "travel_unknown",
  "output_invalid",
  "quota_reached",
  "unavailable",
];
const RAISONS_LECTURE: ReadonlySet<string> = new Set(LOG_READ_REASONS);
/**
 * Raisons de `voyages.fiches_non_relues` (B8b, 0100 § 4.4) : plafond atteint avant l'appel, quota, tout le reste.
 * `LOG_READ_REASONS` (égale à `RAISONS_LECTURE` de la lecture) ne change pas.
 */
export const LOG_FICHES_REASONS: readonly string[] = ["cap_reached", "quota_reached", "unavailable"];
const RAISONS_FICHES: ReadonlySet<string> = new Set(LOG_FICHES_REASONS);
/**
 * Raisons de `voyages.positions_non_ecrites` : `perimees` et `base` sont les codes fermés du port des positions
 * (`CodeEchecPositions`, `src/grounding/port-positions.ts`) ; `exception` : tout autre échec de la transaction (y compris
 * `entree_invalide`). Jamais un message, un code de base ni une valeur.
 */
export const LOG_POSITIONS_REASONS: readonly string[] = ["perimees", "base", "exception"];
const RAISONS_POSITIONS: ReadonlySet<string> = new Set(LOG_POSITIONS_REASONS);
/**
 * Liste de `reason` admise **par événement** (mineur 3 de la revue du head 244b81a) : une raison d'un autre événement est
 * retirée. Un événement absent de la table n'admet aucune `reason`.
 */
const RAISONS_PAR_EVENEMENT: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["voyages.read_failed", RAISONS_LECTURE],
  ["voyages.relecture_refused", RAISONS_LECTURE],
  ["voyages.fiches_non_relues", RAISONS_FICHES],
  ["voyages.positions_non_ecrites", RAISONS_POSITIONS],
]);
/**
 * Phases admises dans `phase` (`p0.step_failed`, ticket 493, décision 0090 § 3 point 4) : celles de
 * `prototype.runs.phase` (`PHASES`, `src/prototype/arret.ts`), plus trois repères de l'étape finale sans écriture en
 * base : `fiches` (Place Details de la première série), `routes` (regroupement par jour et matrices du séjour) et
 * `moteur` (planification des jours). **Liste unique** : le type `PhaseJournal` (`src/server/p0/journal-etape.ts`) en
 * est dérivé ; égalité avec `PHASES` plus les trois repères vérifiée par le test du journal des étapes.
 */
export const LOG_STEP_PHASES = [
  "recherche",
  "ancrage",
  "notation",
  "planification",
  "fiches",
  "routes",
  "moteur",
  "raisons",
  "validation",
  "ecriture",
] as const;
/**
 * Codes admis dans `failureCode` (`p0.step_failed`, ticket 493) : union des listes fermées des erreurs qu'une étape
 * peut recevoir (`CODES_ERREUR_GOOGLE`, `CODES_ERREUR_ANCRAGE`, `CODES_ERREUR_IA`, `CODES_ARRET`,
 * `CODES_ECHEC_TRAVAIL`, `CODES_ECHEC_ECRITURE`, `reduction_refused`), et `autre` pour toute erreur sans code fermé.
 * **Copie** écrite ici, écart accepté par 0090 § 3 point 4 : `log.ts` n'importe pas les modules qui définissent ces
 * listes (frontières d'imports, 0055 § 3 et 0077 § 3) ; seul le code de clé absente est importé de sa définition unique,
 * `@/ai/erreurs` (exemption exacte de 0077 § 3 point 1). L'égalité avec l'union est vérifiée par le test du journal des
 * étapes (`tests/unit/p0/journal-etape.test.ts`) : la copie ne peut pas dériver sans le faire échouer.
 */
export const LOG_STEP_FAILURE_CODES: readonly string[] = [
  // Clients Google (`CODES_ERREUR_GOOGLE`).
  "production_refused",
  "proxy_env_refused",
  "tls_env_refused",
  CODE_CLE_ABSENTE,
  "cap_reached",
  "envelope_reached",
  "daily_quota_insufficient",
  "usage_unavailable",
  "invalid_request",
  "upstream_redirect",
  "upstream_unavailable",
  "upstream_timeout",
  "upstream_rate_limited",
  "upstream_error",
  "invalid_response",
  "upstream_not_found",
  // Ancrage (`CODES_ERREUR_ANCRAGE`).
  "place_not_found",
  "routes_unavailable",
  "lodging_unresolved",
  // Couche IA (`CODES_ERREUR_IA`, hors doublons).
  "data_collection_missing",
  "model_id_invalid",
  "model_unavailable",
  "model_error",
  "invalid_input",
  "model_output_invalid",
  "no_option",
  // Codes d'arrêt persistés (`CODES_ARRET`, hors doublons).
  "real_mode_unavailable",
  "brief_invalid",
  "config_invalid",
  "pipeline_failed",
  // Table de travail et écriture du programme (`CODES_ECHEC_TRAVAIL`, `CODES_ECHEC_ECRITURE`, hors doublons).
  "execution_absente",
  "entree_refusee",
  "base",
  "phase_deja_passee",
  "execution_close",
  // Réduction du programme refusée.
  "reduction_refused",
  // Toute autre erreur (erreur de programmation, code inconnu).
  "autre",
];
/**
 * Codes du champ `alertCode` (décision 0097 B4-TL-13 point 2) : ceux des contrôles de `handlePaymentEvent`
 * (`src/server/payment/webhook.ts`, égalité vérifiée par son test), aussi écrits dans `billing.outcome_code`, et ceux
 * des situations à examiner (second paiement, paiement après un échec, remboursement, litige).
 */
export const LOG_ALERT_CODES: readonly string[] = [
  "unknown_checkout",
  "livemode",
  "payment_status",
  "amount_mismatch",
  "currency_mismatch",
  "session_mismatch",
  "checkout_mismatch",
  "trip_mismatch",
  "provider_mismatch",
  "duplicate_payment",
  "paid_after_failure",
  "refund",
  "dispute",
];
const CODES_ALERTE: ReadonlySet<string> = new Set(LOG_ALERT_CODES);
/** Types de `PaymentEvent` (copie de `PAYMENT_EVENT_TYPES`, égalité vérifiée par le test du journal). */
export const LOG_PAYMENT_EVENT_TYPES: readonly string[] = [
  "checkoutCompleted",
  "asyncPaymentSucceeded",
  "asyncPaymentFailed",
  "checkoutExpired",
  "refund",
  "dispute",
  "other",
];
const TYPES_EVENEMENT_PAIEMENT: ReadonlySet<string> = new Set(LOG_PAYMENT_EVENT_TYPES);
/**
 * Codes admis dans `stopReason` (B9d ; décision 0114) : liste fermée, celle de `CODES_ARRET` (`CHECK` de la migration 0012),
 * lue dans le module feuille `src/server/log-codes-arret.ts` (ce module n'importe pas `src/server/generation/` : `ligne/creation-imports`)
 * plus `CODE_CLE_ABSENTE`, pris de sa définition unique (exemption de 0077 § 3 point 1). Une valeur hors liste (ligne antérieure
 * au `CHECK` `NOT VALID`, nom de lieu, texte libre) est retirée et comptée dans `dropped`, jamais écrite.
 */
const CODES_ARRET_GENERATION: ReadonlySet<string> = new Set<string>([...CODES_ARRET_JOURNAL_SANS_CLE, CODE_CLE_ABSENTE]);
/** Identifiant d'événement : forme simulée (B4-TL-10) ou forme de Stripe. */
const ID_EVENEMENT_PAIEMENT = /^(evt_sim_[0-9a-f]{32}|evt_[A-Za-z0-9]{1,255})$/;
const PHASES_ETAPE: ReadonlySet<string> = new Set<string>(LOG_STEP_PHASES);
const CODES_ETAPE: ReadonlySet<string> = new Set(LOG_STEP_FAILURE_CODES);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXCEPTIONS: ReadonlySet<string> = new Set(LOG_EXIT_EXCEPTIONS);
const ZONES_OPENSSL: ReadonlySet<string> = new Set(LOG_OPENSSL_CONF_ZONES);
const VERDICTS_OPENSSL: ReadonlySet<string> = new Set(LOG_OPENSSL_CONF_VERDICTS);
const DIRECTIVES_OPENSSL: ReadonlySet<string> = new Set(LOG_OPENSSL_CONF_DIRECTIVES);
const ENVIRONNEMENTS = new Set(["local", "ci", "staging", "production"]);
const CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);
const ACTION = /^[a-z][a-z0-9-]{0,47}$/;
const NOM_ERREUR = /^[A-Za-z]{1,40}$/;

const entierPositif = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isSafeInteger(valeur) && valeur >= 0;
const entierStrict = (valeur: unknown): valeur is number => entierPositif(valeur) && valeur >= 1;
const chaine = (valeur: unknown): valeur is string => typeof valeur === "string";

/**
 * `openssl_conf_directives` (0065 § 5 point 4) : forme `jeton(,jeton)*`, chaque jeton dans la liste fermée, sans
 * doublon. Toute autre valeur (chaîne vide comprise) est retirée.
 */
function directivesAdmises(valeur: unknown): boolean {
  if (!chaine(valeur) || !/^[a-z_]+(?:,[a-z_]+)*$/.test(valeur)) return false;
  const jetons = valeur.split(",");
  return new Set(jetons).size === jetons.length && jetons.every((jeton) => DIRECTIVES_OPENSSL.has(jeton));
}

/** Contrôle de chaque champ admis ; tout autre champ est retiré. */
const CONTROLES: ReadonlyMap<string, (valeur: unknown) => boolean> = new Map<keyof LogFields, (valeur: unknown) => boolean>([
  ["code", (v) => chaine(v) && CODES.has(v)],
  ["action", (v) => chaine(v) && ACTION.test(v)],
  ["variable", (v) => chaine(v) && VARIABLES_ADMISES.has(v)],
  ["rule", (v) => chaine(v) && REGLES.has(v)],
  ["durationMs", entierPositif],
  ["rows", entierPositif],
  ["environment", (v) => chaine(v) && ENVIRONNEMENTS.has(v)],
  ["errorName", (v) => chaine(v) && NOM_ERREUR.test(v)],
  ["guard", (v) => chaine(v) && GARDES.has(v)],
  ["cause", (v) => chaine(v) && CAUSES.has(v)],
  ["exception", (v) => chaine(v) && EXCEPTIONS.has(v)],
  ["openssl_conf_zone", (v) => chaine(v) && ZONES_OPENSSL.has(v)],
  ["openssl_conf_verdict", (v) => chaine(v) && VERDICTS_OPENSSL.has(v)],
  ["openssl_conf_directives", directivesAdmises],
  ["turns", entierPositif],
  ["searches", entierPositif],
  ["pagesRead", entierPositif],
  ["candidates", entierPositif],
  ["places", entierPositif],
  ["candidatesRefused", entierPositif],
  ["planRefused", entierPositif],
  ["planUnreadable", entierPositif],
  ["turnRefused", entierPositif],
  ["turnUnreadable", entierPositif],
  ["finishIgnored", entierPositif],
  ["finishAbnormal", entierPositif],
  ["deadlineStop", entierPositif],
  ["sectors", entierPositif],
  ["mustSees", entierPositif],
  ["mustSeesWithoutCandidate", entierPositif],
  ["candidatesGrouped", entierPositif],
  ["sectorUnknown", entierPositif],
  ["fieldsRemoved", entierPositif],
  ["textsCut", entierPositif],
  ["days", entierPositif],
  ["slots", entierPositif],
  ["placesToVerify", entierPositif],
  ["daysRemoved", entierPositif],
  ["slotsRemoved", entierPositif],
  ["modelCalls", entierPositif],
  ["unverifiedForCap", entierPositif],
  ["sitesProposed", entierPositif],
  ["sitesChecked", entierPositif],
  ["sitesRemoved", entierPositif],
  ["sitesUnchecked", entierPositif],
  ["tripId", (v) => chaine(v) && UUID.test(v)],
  ["version", entierStrict],
  ["dayIndex", entierStrict],
  ["phase", (v) => chaine(v) && PHASES_ETAPE.has(v)],
  ["failureCode", (v) => chaine(v) && CODES_ETAPE.has(v)],
  ["eventId", (v) => chaine(v) && ID_EVENEMENT_PAIEMENT.test(v)],
  ["eventType", (v) => chaine(v) && TYPES_EVENEMENT_PAIEMENT.has(v)],
  ["alertCode", (v) => chaine(v) && CODES_ALERTE.has(v)],
  ["checkoutId", (v) => chaine(v) && UUID.test(v)],
  ["organizationId", (v) => chaine(v) && UUID.test(v)],
  ["generationRunId", (v) => chaine(v) && UUID.test(v)],
  ["stopReason", (v) => chaine(v) && CODES_ARRET_GENERATION.has(v)],
]);

const EVENEMENTS: ReadonlySet<string> = new Set(LOG_EVENTS);

/** Nom d'une erreur (`error.name` seulement, jamais `message`, `code` ni `cause`), ou `undefined`. */
export function errorNameOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const name = (error as { name?: unknown }).name;
    return typeof name === "string" && NOM_ERREUR.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Ligne écrite pour un événement : champs filtrés, `dropped` si des champs ont été retirés. */
export function formatLogLine(event: string, fields: object = {}, level: LogLevel = "info"): string {
  const ligne: Record<string, unknown> = { level, event: EVENEMENTS.has(event) ? event : "log.unknown_event" };
  let retires = 0;
  for (const [cle, valeur] of Object.entries(fields)) {
    const controle = cle === "reason" ? (v: unknown) => chaine(v) && (RAISONS_PAR_EVENEMENT.get(event)?.has(v) ?? false) : CONTROLES.get(cle);
    if (controle !== undefined && controle(valeur)) ligne[cle] = valeur;
    else retires += 1;
  }
  if (retires > 0) ligne.dropped = retires;
  return JSON.stringify(ligne);
}

/** Écrit un événement. Ne lève jamais : une entrée inattendue est retirée, pas écrite. */
export function logEvent(event: LogEvent, fields: LogFields = {}, level: LogLevel = "info"): void {
  let ligne: string;
  try {
    ligne = formatLogLine(event, fields, level);
  } catch {
    ligne = JSON.stringify({ level, event: "log.unknown_event", dropped: 1 });
  }
  if (level === "error") console.error(ligne);
  else console.log(ligne);
}
