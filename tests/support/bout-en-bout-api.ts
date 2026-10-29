/**
 * Identités des scénarios de bout en bout de l'adaptateur `api` (spécification B6, B6b point 5 ; décision 0086 § 2.3,
 * B6-TL-10), partagées par l'écriture des données (`tests/db/donnees-bout-en-bout.test.ts`, `pnpm test:db`, qui précède
 * le projet Playwright `auth` dans le job `db`) et par les scénarios (`tests/e2e/lecture-api.api.spec.ts`).
 *
 * - **A** : quatre voyages du jeu simulé, convertis par `tests/support/voyages-en-base.ts` (écrans 11, 12 et 17) ;
 * - **B** : les mêmes quatre voyages dans une autre organisation, dont les identifiants donnent « introuvable » à A ;
 * - **déblocage** et **déblocage après refus** (B4b, `tests/e2e/debloquer-api.api.spec.ts`) : les mêmes quatre voyages,
 *   chacun dans sa propre organisation, dont le scénario débloque le seul voyage non débloqué (pendant d'Édimbourg) par
 *   le paiement simulé en base, sans toucher aux organisations A et B que les scénarios de lecture comparent à `mock` ;
 * - **remplacement** (M1g, `tests/e2e/remplacer-api.api.spec.ts`) : les mêmes quatre voyages dans leur propre
 *   organisation, dont le scénario remplace puis rétablit le dîner du J1 d'Édimbourg (versions 2 et 3 en base), puis remplace
 *   Dean Village au J2 ;
 * - **photos** (M1e, PR 879, `tests/e2e/photos-api.api.spec.ts`) : les mêmes quatre voyages dans leur propre
 *   organisation, dont le scénario ouvre le tri du voyage non débloqué sans rien y décider (lecture seule).
 *
 * Adresses fixes en `exemple.test` (aucun domaine réel) : la personne et son organisation personnelle sont créées par
 * le chemin de B3b (`createOrg`, `vadrouille_auth`) avant toute session ; la session est ensuite ouverte par le code lu
 * dans Mailpit (aucune session forgée). Écriture idempotente : un voyage n'est écrit que si l'organisation n'en a aucun
 * (un voyage débloqué par un scénario le reste : rejouer le déblocage sur un poste demande une base neuve).
 * Limite d'envoi du code : 5 par heure et par adresse (`src/server/config/limites.ts`) ; sur un poste, rejouer plus
 * souvent demande une base neuve.
 */
export const ADRESSE_A = "b6b-api-a@exemple.test";
export const ADRESSE_B = "b6b-api-b@exemple.test";
export const ADRESSE_DEBLOQUER = "b4b-debloquer@exemple.test";
export const ADRESSE_DEBLOQUER_REFUS = "b4b-debloquer-refus@exemple.test";
export const ADRESSE_REMPLACER = "m1g-remplacer@exemple.test";
export const ADRESSE_PHOTOS = "m1e-photos@exemple.test";
