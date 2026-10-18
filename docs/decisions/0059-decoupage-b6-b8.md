# 0059 — Découpage de B6 (API de lecture) et de B8 (ancrage)

Statut : décision déléguée (ordre et découpage des tâches, « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-14 · Décideur : CEO, avec l'avis du Tech Lead (section « Avis du Tech Lead », avis recueilli à la revue de la PR #328) · Spécifications `specs/B6-api-lecture.md` (#308, fusionnée, ticket #304) et `specs/B8-ancrage.md` (#301, fusionnée, ticket #299) · Questions : Q415 (B6) et Q416 (B8), acceptées sur le principe par le CEO au 60e cycle · Ticket de cette décision : #327

Numérotation (vérifiée le 2026-10-14) : `main` va de 0001 à 0058 ; aucune PR ouverte n'ajoute un 0059.

**§ 4 précisé par 0060** (ticket #333, fichier commun `eslint.config.mjs`) : B8c n'est dans le même cycle ni que B8a, ni que B3c, ni que B6a, ni qu'une PR qui modifie `eslint.config.mjs` ou ses tests de confinement ; la phrase « [B8a] peut être dans le même cycle que B8c » ne vaut plus.

**§ 1 précisé par 0086** (§ 1.5, ticket #466), colonne « Fichiers » de B6a : la suite de contrat commune vit sous `tests/support/` (sur le modèle de `tests/support/auth-contrat.ts`) et non dans `src/adapters/contract.suite.ts` ; ses deux fichiers d'exécution sont sous `tests/unit/adapters/` et `tests/db/`.

## Contexte
Les deux spécifications proposent un découpage qui déroge à la règle « une tâche = une spécification = une branche = une PR » (`CLAUDE.md`) et renvoient son écriture à une décision du CEO avant le premier ticket de code (B6 : section « Découpage » et question 1 au CEO ; B8 : section « Découpage proposé » et question 1). Le CEO a accepté les deux découpages sur le principe (Q415, Q416) ; restait à les écrire et à fixer l'ordre de B8c par rapport à B7a et B7c, que la décision 0054 § 3 place avant tout B8.

## Décision

### 1. B6 se découpe en deux PR séquentielles (Q415)
Chacune a son ticket et sa branche `claude/<id>-<slug>`. Rôle : backend (en-tête de la spécification).

| Sous-tâche | Périmètre | Fichiers | Prérequis | Revue | Critères |
|---|---|---|---|---|---|
| **B6a — Lecture serveur et adaptateur `api`** | Les sept cas d'usage de lecture en transaction `withOrg` en lecture seule ; recomposition des champs calculés par des fonctions pures de `src/domain` ; port `SourceRelectures` et son double simulé ; positions depuis `place_coordinates` ; fabrique `createApiTripAdapter`, **non branchée** ; suite de contrat commune `mock` et `api` ; données de test en base ; règle d'import de `@/server/voyages/*` ; journal ; lignes `TripSummary.*` du handover § 5 (B6a, points 1 à 10) | Crée `src/adapters/api.ts`, `src/adapters/contract.suite.ts` et ses deux fichiers d'exécution, des modules de `src/server/voyages/` et de `src/domain`, `src/mocks/relectures-voyages.ts`, des tests sous `tests/db/` et `tests/support/` ; modifie `src/server/log.ts`, `eslint.config.mjs`, les listes du confinement nécessaires, `docs/handovers/backend.md`, `tests/unit/contracts/exclusions.ts` ; `src/contracts/map.ts` seulement si B6-TL-11 (a) est retenue. Ne touche ni `src/adapters/index.ts`, ni `src/adapters/context.ts`, ni `src/app`, ni `playwright.config.ts`, ni `.github/workflows/` | Prérequis généraux de l'en-tête de la spécification (B1, B2, B5a à B5c et F8b fusionnées ; aucun compte externe, aucune clé) ; B3b fusionnée ; cette décision ; B6-TL-1 à B6-TL-6, B6-TL-9 et B6-TL-11 ; réponses de data (questions 3 à 6 à data) ; verdict Sécurité sur les positions et le journal (questions 2 et 4 à la Sécurité), qui bloque la fusion | Tech Lead, data, Sécurité (positions, journal) | « Critères communs aux deux sous-tâches », « B6a » et « Vérifications d'ensemble » |
| **B6b — Branchement, actions de base et bout en bout** | `getTripAdapter("api")` et sa garde fermée par défaut ; cadre des actions authentifiées ; `toggleChecklistItem` et le contrat `ChecklistUpdate`, avec le code `internal` ; isolation rejouée par l'action ; écrans 11, 12 et 17 avec `DATA_ADAPTER=api` ; scénarios Playwright, dont `not_found` (B6b, points 1 à 6) | `src/adapters/index.ts`, `src/contracts` (`ChecklistUpdate`, `internal` seulement), `src/server/actions/`, `playwright.config.ts`, tests ; `src/app` seulement si B3c ne l'a pas déjà fait ; listes du confinement si besoin | B6a, B3c et B3b-envoi fusionnées ; B6-TL-7, TL-8 et TL-10 ; verdict Sécurité (questions 1 et 3 à la Sécurité), qui bloque la fusion ; `owner-approved` (0035) si `.github/workflows/` change | Tech Lead, Sécurité | « Critères communs aux deux sous-tâches », « B6b » et « Vérifications d'ensemble » |

Le contenu détaillé et les critères sont ceux des sections nommées de la spécification ; cette décision n'y ajoute rien.

### 2. Ordre de B6 (question 2 au CEO de la spécification)
- **B6a** commence après la fusion de B3b. Elle peut être dans le même cycle que B3c et B4a, sous les réserves que la spécification confie au CEO au moment de l'assignation : B3c ne modifie pas `eslint.config.mjs` ; aucune sous-tâche de B3 ne modifie `src/server/log.ts` dans le même cycle ; les listes du confinement ne sont pas touchées par deux PR du même cycle.
- **B6b** commence après la fusion de B6a, B3c et B3b-envoi. Elle n'est jamais dans le même cycle que B4b, B9 ou une tâche qui touche `src/adapters/index.ts`, `src/contracts`, `src/server/actions/` ou `playwright.config.ts`.
- **Suite** : B4b, B9, B11 et B12 attendent B6b (spécification B6, en-tête « Suite » et « Ce que B6 expose aux tâches suivantes ») ; B8b attend B6a (§ 4 et § 5).

### 3. B8 se découpe en trois PR (Q416)
Chacune a son ticket et sa branche `claude/<id>-<slug>`. Rôles : ia-recherche pour B8a et B8b ; data pour B8c (migration et purge, en-tête de la spécification).

| Sous-tâche | Périmètre | Fichiers | Prérequis | Revue | Critères |
|---|---|---|---|---|---|
| **B8a — Ancrage, fiches et trajets en mémoire** | Types de production de `src/grounding` ; ancrage des candidats et des logements ; `chargerFiches` et `ficherSerie` ; trajets et estimation sans itinéraire ; `versRelectures` ; `rafraichirPlaceId` ; règle ESLint en liste blanche de `src/grounding` ; doubles étendus ; test de la clé serveur (B8a, points 1 à 7) | `src/grounding`, `src/server/relecture/relectures.ts`, `eslint.config.mjs`, tests (`tests/unit/lint/` compris) ; `ancrage.ts` de P0 inchangé | B7a et B7c fusionnées (0054 § 3) ; P0r3c fusionnée en entier (P0r3c-1 #318 et P0r3c-2 #323 le sont, P0r3c-3 #326 est ouverte), pour les fonctions partagées d'ancrage et de fiches ; cette décision ; B8-TL-1, TL-5, TL-6 et TL-7 ; question 10 (a) au Tech Lead ; verdict Sécurité sur les masques (B8-TL-5), qui bloque la fusion | Tech Lead, Sécurité (masques) | « Critères communs aux trois sous-tâches », « B8a » et « Vérifications d'ensemble » |
| **B8b — Recomposition à la lecture et carte** | `recomposerJour`, `recomposerProposition`, `Change[segment]` ; `positionsDuJour` et `positionsSansCache` ; forfait de relecture étendu aux fiches (B8b, points 1 à 4) | `src/server/relecture/recomposer.ts`, `src/server/usage/forfait.ts`, `src/grounding`, tests | B8a et B8c fusionnées ; **B6a fusionnée** (§ 5, avis du Tech Lead) ; B8-TL-4, TL-8 et TL-9 ; question 10 (b) au Tech Lead | Tech Lead | « Critères communs aux trois sous-tâches », « B8b » et « Vérifications d'ensemble » |
| **B8c — Cache de positions et purge** | Implémentation du port du cache (`lire`, `ecrire`) ; migration éventuelle de l'expiration ; workflow planifié de purge propre au MVP et son rôle ; tests `coordonnées:` et `purge:` (B8c, points 1 à 3) | `db/`, un module de `src/server` (nom libre, B8-TL-2), `.github/workflows/`, tests ; le type du port dans `src/grounding`, selon § 5 | Cette décision ; B8-TL-2 et TL-3 ; verdict Sécurité, qui bloque la fusion ; réponse du rôle data (question 8) ; `owner-approved` (0035) pour le workflow ; secrets posés par Samuel (question 4) pour l'**activation** de la purge, pas pour la fusion | Tech Lead, Sécurité, data | « Critères communs aux trois sous-tâches », « B8c » et « Vérifications d'ensemble » |

### 4. Ordre de B8 (question 1 de la spécification)
- **B8c n'attend ni B7a ni B7c.** Son ticket s'ouvre dès la fusion de cette décision et les décisions du Tech Lead sur B8-TL-2 et B8-TL-3. Cela amende la décision 0054 § 3 (« B8 attend B7a et B7c ») pour B8c seulement ; B8a et B8b restent soumis à 0054 § 3.
  Raisons :
  1. B8c ne consomme rien de B7 : ni types de `src/ai` ou `src/research`, ni réservation de `usage_ledger` (aucun appel Google dans B8c). La spécification le note (« il peut avancer en parallèle de B8a, et même avant B7 »).
  2. B8b attend B8c (port du cache) : fusionner B8c tôt raccourcit le chemin de B8.
  3. La purge du MVP doit être en place avant la fin de la phase 0, quand `p0-purge.yml` disparaîtra. L'activation dépend de Samuel (environnement, rôle, secrets, `owner-approved`) : plus la PR arrive tôt, plus ce délai est absorbé.
  4. Les revues de B8c (data, Sécurité) ne chargent pas le rôle ia-recherche, occupé par P0r3c-3, P0r3d puis B7.
- **Fichiers communs** : B8c et B7c ajoutent chacun une migration possible sous `db/migrations/` (B7c : `usage_ledger`, éventuelle). Si les deux en ajoutent une, B8c et B7c ne sont pas dans le même cycle (numérotation du journal) ; de même entre B8c et toute PR ouverte qui ajoute une migration. Le CEO le vérifie à l'assignation. Une migration de B8c n'est appliquée à la vraie base que par un lot approuvé selon 0056 § 3.
- **B8a** commence après la fusion de B7a, B7c et de P0r3c-3 (0054 § 3, 0055 § 6 point 3). Elle peut être dans le même cycle que B8c (fichiers distincts, hormis la réserve du type du port au § 5).
- **B8b** vient en dernier : après B8a, B8c et B6a.
- **Suite** : B9 attend B7, B8 (interfaces qu'il compose : spécification B8, « Ce que B8 expose ») et B6b (spécification B6, en-tête « Suite », et § 2 ci-dessus) ; cette décision ne change pas sa place.
- **Questions 2 et 3 à Samuel de la spécification B8** (fiches de la première série et marge de 4 ; coût des relectures à l'affichage) : toujours ouvertes. Elles ne bloquent pas le code de B8 ; aucune valeur qui en dépend (marge de fiches, plafonds du forfait de relecture de B8-TL-4) n'est configurée hors tests et développement sans la réponse de Samuel.

### 5. Avis du Tech Lead
Le Tech Lead accepte les deux découpages et l'ordre ci-dessus, avec quatre points (avis recueilli à la revue de la PR #328). Le CEO les retient.
1. **Type du port du cache de positions.** B8-TL-2 place le contrat `PortPositions` dans `src/grounding`, mais B8c ne touche pas `src/grounding` et peut précéder B8a. Avis : si B8-TL-2 garde le contrat dans `src/grounding`, B8c l'y crée dans **un seul fichier nouveau**, déclaration de type seule, sans import hors de `@/contracts` ; B8a le reprend tel quel et sa règle en liste blanche le couvre. Aucun autre fichier de `src/grounding` n'est touché par B8c.
2. **Une seule recomposition.** La spécification B6 (fusionnée après celle de B8) met l'assemblage d'un `Day` et d'une `Proposal` dans `src/domain` et un port `SourceRelectures` que B8 implémente. La spécification B8 prévoit `recomposerJour` et `recomposerProposition` dans `src/server/relecture/recomposer.ts`. Pour ne rien dupliquer (« l'agent cherche, l'ancrage vérifie, le moteur planifie » : le moteur assemble, l'ancrage relit), B8b **réutilise** les fonctions d'assemblage de B6a et fournit les relectures réelles par `chargerFiches`, `chargerTrajets` et `versRelectures`. D'où B6a avant B8b. La forme exacte de `recomposer.ts` est fixée par le Tech Lead sous B8-TL-1 avant le code de B8b ; la question 9 au Tech Lead de la spécification B6 (affichage d'une durée estimée) est tranchée au même moment.
3. **Une seule lecture de `place_coordinates`.** B6a lit les positions vivantes de l'organisation (B6-TL-3) et B8c écrit `lire` dans son port. La seconde des deux PR fusionnées reprend la lecture de la première au lieu d'en écrire une autre ; le Tech Lead le vérifie à la revue. Cette lecture reste celle de la voie serveur, sans relecture Google (B6-PO-18 : les cartes ne relisent rien) ; le choix de la voie branchée pour B6 et B12, serveur ou navigateur, est celui du Tech Lead sous B8-TL-9.
4. **B6b sans B3b-envoi** (question 5 au Tech Lead de la spécification B6) : B6b attend B3b-envoi. Aucune session forgée, aucune fusion sans les scénarios de bout en bout.

### 6. Limite de corrections
La règle du studio (au plus deux corrections par tâche, puis troisième tentative ou découpage avec le Tech Lead) s'applique à chaque sous-tâche séparément.

## Conséquences
- **Tickets** : le CEO ouvre le ticket de B6a quand B3b est fusionnée, celui de B6b quand B6a, B3c et B3b-envoi le sont ; celui de B8c dès la fusion de cette décision et de B8-TL-2 et TL-3 ; celui de B8a quand B7a, B7c et P0r3c-3 sont fusionnées ; celui de B8b quand B8a, B8c et B6a le sont. Les tickets #304 (B6) et #299 (B8) restent ouverts jusqu'à la fusion de B6b et de B8b.
- **Feuille de route** (`docs/roadmap.md`, ligne 14, à la prochaine mise à jour par le CEO) : B6 se lit « B6a puis B6b », B8 « B8c en avance, puis B8a, puis B8b ». Le chemin vers B9 passe par B7a, puis B7b et B7c, puis B8a et B8b, et par B6a puis B6b. B4b, B9, B11 et B12 suivent B6b.
- **Décision 0054** : § 3 amendé pour B8c seulement (§ 4 ci-dessus). Rien d'autre ne change pour B7.
- **Handover** : aucun amendement par cette décision ; ceux des spécifications restent portés par les PR qu'elles nomment.
- Aucune charge nouvelle pour Samuel : l'activation de la purge (question 4 de la spécification B8), l'`owner-approved` des workflows et les questions 2 et 3 de la spécification B8 (§ 4) étaient déjà prévus.

## Quand revoir cette décision
Si B3b, B3c ou B3b-envoi sont découpées autrement ou retardées au point de bloquer B4b, B11 ou B12 ; si B8-TL-2 place le port hors de `src/grounding` (le point 1 du § 5 tombe) ; si B8-TL-1 garde une recomposition propre à B8 (le prérequis B6a de B8b est revu avec le Tech Lead) ; ou si une sous-tâche dépasse deux corrections.
