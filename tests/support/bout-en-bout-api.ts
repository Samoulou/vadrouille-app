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

/**
 * Lien privé sur `api` (ticket 1013, M6a ; décision 0158 § 4.2, `tests/e2e/partage-api.api.spec.ts`) : une organisation
 * propre, deux voyages à venir écrits par `tests/db/donnees-bout-en-bout.test.ts`, chacun avec un lien actif dont seule
 * l'empreinte SHA-256 du jeton est en base. Le voyage de `JETON_PARTAGE_VALIDE` est débloqué ; celui de
 * `JETON_PARTAGE_REVERROUILLE` a été débloqué puis reverrouillé (droit `tripUnlocked` retiré par l'administration des
 * tests, lien toujours `valid`). Jetons fixes de test, de la forme aléatoire (43 caractères base64url), sans valeur
 * hors de la base de test.
 */
export const ADRESSE_PARTAGE = "m6a-partage@exemple.test";
export const JETON_PARTAGE_VALIDE = "m6aPartageApiValide".padEnd(43, "A");
export const JETON_PARTAGE_REVERROUILLE = "m6aPartageApiReverrouille".padEnd(43, "B");

/**
 * Création d'un lien sur `api` depuis la feuille (revue du ticket 1013, point 7 ; `tests/e2e/partage-api.api.spec.ts`,
 * scénario « créer, ouvrir sans session, désactiver, 404 ») : une organisation propre, un seul voyage débloqué **sans
 * lien**, le voyage débloqué d'Édimbourg du jeu simulé, décalé pour commencer 20 jours après l'écriture.
 */
export const ADRESSE_PARTAGE_CREATION = "m6a-partage-creation@exemple.test";

/**
 * Rappels par e-mail sur `api` (M6c, ticket 1021 ; revue de la PR 1024, bloquant 2 du Tech Lead ;
 * `tests/e2e/rappels-api.api.spec.ts`) : une organisation propre, un seul voyage débloqué (Édimbourg du jeu simulé, décalé
 * pour commencer 20 jours après l'écriture), sans accord. Le scénario donne l'accord, reçoit les rappels dans Mailpit sur
 * le monde local du Workflow SDK (durées accélérées, `RAPPELS_ACCELERATION`), puis le retire.
 */
export const ADRESSE_RAPPELS = "m6c-rappels@exemple.test";
