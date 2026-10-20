/**
 * Identités des scénarios de bout en bout de l'adaptateur `api` (spécification B6, B6b point 5 ; décision 0086 § 2.3,
 * B6-TL-10), partagées par l'écriture des données (`tests/db/donnees-bout-en-bout.test.ts`, `pnpm test:db`, qui précède
 * le projet Playwright `auth` dans le job `db`) et par les scénarios (`tests/e2e/lecture-api.api.spec.ts`).
 *
 * - **A** : quatre voyages du jeu simulé, convertis par `tests/support/voyages-en-base.ts` (écrans 11, 12 et 17) ;
 * - **B** : les mêmes quatre voyages dans une autre organisation, dont les identifiants donnent « introuvable » à A.
 *
 * Adresses fixes en `exemple.test` (aucun domaine réel) : la personne et son organisation personnelle sont créées par
 * le chemin de B3b (`createOrg`, `vadrouille_auth`) avant toute session ; la session est ensuite ouverte par le code lu
 * dans Mailpit (aucune session forgée). Écriture idempotente : un voyage n'est écrit que si l'organisation n'en a aucun.
 * Limite d'envoi du code : 5 par heure et par adresse (`src/server/config/limites.ts`) ; sur un poste, rejouer plus
 * souvent demande une base neuve.
 */
export const ADRESSE_A = "b6b-api-a@exemple.test";
export const ADRESSE_B = "b6b-api-b@exemple.test";
