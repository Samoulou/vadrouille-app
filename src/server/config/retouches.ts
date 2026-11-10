import "server-only";

/**
 * Configuration des retouches de la personne sur `api` (spécification `specs/M5-retouches.md` ; décision 0147 § 5.3
 * point 7 et § 6.4 point 5), lue côté serveur seulement : jamais écrite dans une action.
 *
 * `VERSIONS_MAX_PAR_VOYAGE` (proposition du Tech Lead, mineur 11 de la revue de 0147, arbitrage du CEO) : au-delà de ce
 * nombre de versions d'un voyage (compté par `max(version)` sous le verrou des versions), toute retouche de la personne
 * (`lock`, `unlock`, ajout, retour ; plus tard remplacement et déplacement) est refusée sans écriture par
 * `validation_failed` (`field: "baseVersion"`), non réessayable. Les versions des workflows (génération, révision, voyage
 * complet) ne sont jamais refusées par cette borne. Écart à M5-PO-6 (« aucun nombre maximal de versions ») signalé au
 * Product Owner (0147 § 15).
 */
export const VERSIONS_MAX_PAR_VOYAGE = 200;
