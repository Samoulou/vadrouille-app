import "server-only";

/**
 * Configuration des rappels par e-mail (M6c, ticket 1021 ; spécification M6 § 5 ; décision 0157 § 1.7), lue côté serveur
 * seulement, sur le modèle de `email.ts`. Aucune valeur n'est codée dans le workflow, l'action ou l'étape.
 */

/** Heure locale de l'envoi, la veille de chaque journée, dans le fuseau du voyage (M6-PO-8, spécification M6 § 5.3 point 2). */
export const HEURE_ENVOI_RAPPEL = "18:00";

/**
 * Réveil borné (0157 § 1.7 point 2) : l'exécution dort jusqu'au plus proche de l'instant du prochain envoi et de 24 heures,
 * pour rattraper un changement de dates (M4) et finir au plus tard 24 heures après un retrait.
 */
export const REVEIL_MAX_HEURES = 24;

/**
 * Relais (0157 § 1.7 point 8) : une exécution reprend sur le code du déploiement qui l'a démarrée (documentation du Workflow
 * SDK 5.1.0, « Versioning » : « Workflow runs are pinned to the deployment that starts them ») ; après 7 jours de sommeil
 * cumulé, elle réclame en base la génération suivante (insertion d'une ligne `reminder_relays`, décision 0162 § 3 ;
 * `src/server/rappels/relais.ts`), puis démarre l'exécution qui lui succède pour le même accord (dernier déploiement) et se
 * termine. Une autre exécution tient déjà la génération (doublon) : fin sans relais (`rappels.relay_duplicate`).
 */
export const RELAIS_JOURS = 7;

/** Attente minimale entre deux réveils (une seconde) : jamais un `sleep` nul ou négatif. */
export const ATTENTE_MIN_MS = 1_000;

/**
 * Garde technique de l'envoi réel (0157 § 1.7 point 10, S6) : tant qu'elle est fausse, la composition des rappels donne le
 * port des notifications **désactivé** dès que le transport est Resend ; Mailpit (`EMAIL_TRANSPORT=smtp`, `local` et `ci`)
 * reste branché. Ne passe à `true` que par une PR qui cite les réponses de Samuel aux questions 1 et 2 de la spécification
 * M6 et l'action « S1 » du plan (compte Resend), **et en plus** (décision 0162 § 1 point 3) : la fusion de la tâche R-B
 * (réclamation du relais dans le workflow, ticket 1075) et l'application de la migration `0027_rappels_relais` (R-D) sur la
 * base visée, par sa ligne dans `MIGRATIONS_APPROUVEES` (`.github/workflows/db-migrate.yml`, `owner-approved` de Samuel),
 * après celles de 0022 à 0026. Le Tech Lead refuse en revue une PR qui passe la constante à `true` sans ces deux références.
 */
export const RAPPELS_ENVOI_REEL = false;

/**
 * Après une panne d'un réveil (base, composition) : nouvel essai dans une heure (la fenêtre d'un envoi court jusqu'à minuit
 * de la destination), au plus `ECHECS_CONSECUTIFS_MAX` fois de suite (une journée), puis fin de l'exécution.
 */
export const ATTENTE_APRES_ECHEC_MS = 3_600_000;
export const ECHECS_CONSECUTIFS_MAX = 24;

/**
 * Relais en échec (revue de la PR 1024, bloquant 1 du Tech Lead) : l'exécution ne se termine que si son successeur a
 * démarré ; sinon elle continue (réveils et envois inchangés) et réessaie le relais avant chaque sommeil, au plus
 * `RELAIS_ESSAIS_MAX` fois au total, puis se termine en journalisant `rappels.abandoned`. Un essai est une réclamation en
 * panne (`reminder_relays`, décision 0162 § 3 point 3) ou, après une réclamation acquise, un démarrage en échec ; la
 * réclamation n'est jamais refaite par la même exécution.
 */
export const RELAIS_ESSAIS_MAX = 24;

