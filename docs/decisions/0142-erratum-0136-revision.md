# 0142 — Erratum à 0136 : « Pas pour moi » change le programme sur `api` (M1b)

Statut : **acceptée**, décision déléguée du **Tech Lead** (architecture, tests : « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion, sans délai de veto (0093). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-10-29 · Décideur : Tech Lead (réponses de la revue consolidée de la PR #875, head `68f7e08`) · Ticket : #868 · Plan : `docs/plans/mvp-etapes-1-9.md`, ligne M1b · Décisions lues : 0019 § 3.2, 0081 B9-TL-3, 0093, 0117, 0119 § 4, 0126, 0136 § 4.4 et § 6, 0139 § 3.

**Ce que cette décision n'engage pas.** Aucun argent : `PLAFONDS_USAGE` reste `null`, la barrière B9-TL-8 reste fermée, seules des valeurs de test sont fixées (§ 2). Aucune migration. Aucun test supprimé ni désactivé. Aucun événement de journal nouveau.

## 1. Mise à jour de 0136 § 4.4

La lettre « le programme ne change pas jusqu'à M1b » est remplacée, pour `batchRecompute` sous la chaîne inversée, par : l'étape `a` clôt la ligne `batch` en `ready` sur sa version de base, sans forfait ni appel, **quand il n'y a rien à réviser** (aucun « Pas pour moi » actif sur une case du tri clos, révision déjà consommée, ou version courante différente de la version de base) ; sinon elle réserve le forfait `revision` (§ 2), et l'étape `e` porte la révision de 0126 (une requête `revision` sans donnée Google, filet du code, vérification de toute la version, aucun appel Routes) et publie une nouvelle version par le module commun `publier` (`src/server/generation/publication.ts`, même rejeu borné, confirmation perdue comprise). Le pont `src/workflows/recalcul.ts`, ses deux étapes et l'état sérialisé sont inchangés. La règle de `generateFullTrip` (0136 § 4.4, M1c) est inchangée.

## 2. Profil de forfait `revision`

Un profil propre (0136 § 6.5, 0126 § 2) : réutiliser `programme` réserverait un second forfait entier par révision. `PROFILS_FORFAIT`, `PlafondsUsageSchema.generations`, `PLAFONDS_VARIANTE_SIMULEE` et les valeurs des bancs portent `revision` ; valeurs de test : 700 000 micro-USD de modèles, 90 Text Search, 90 fiches, 0 requête et 0 élément Routes. Réservé par `a` sous l'identifiant de l'exécution `batch` (idempotent), entier à `e`. Les valeurs réelles restent à Samuel (M1h, partage des 2 USD de la question 6 de #829 entre `programme` et `revision`).

## 3. Une seule révision par voyage (Q613), sans migration

La révision est consommée dès qu'une **autre** ligne `batch` du voyage a atteint l'étape `e` (`step_seq >= RANG_LOT.e`), qu'elle ait écrit une version, se soit arrêtée ou ait expiré. Consommée en `e`, pas en `a`. Les tris suivants clôturent leur ligne en `ready` sans version ni appel.

## 4. Ce que la révision ne réécrit pas

Les cases de l'aperçu (`proposals`), les lignes « À faire » (`checklist_items`, la personne a pu en cocher) et `stays.place_id`. Le récit n'est jamais lu ni envoyé (`RECIT_API_AUTORISE` reste `false`). Aucun événement : l'arrêt est connu par `generation_runs.stop_reason`, et `generation.programme_written` n'est pas étendu (0139 § 3 point 5). Programme modifié par la personne pendant la révision : relu sous le verrou des versions, rien n'est écrit, la ligne finit `ready` sans `last_version`.

## 5. Limites connues

1. **Identifiants réutilisés** : les étapes de la nouvelle version reprennent la forme `j<jour>-<rang>` ; un même identifiant peut désigner une autre étape avant et après la révision. M1c et B10c ne doivent pas rapprocher des signaux antérieurs à la révision d'identifiants de la version révisée (rapprocher par version de base).
2. **Lignes « À faire »** : non réécrites, elles peuvent devenir sans objet (lieu écarté).
3. **Retrait par nom normalisé** : le filet retire tous les créneaux du même nom, y compris un homonyme gardé ou aimé sur un autre jour.
4. **Lieu écarté sous un autre nom** : il n'est pas retiré par le filet (B10b critère 1 dit « plus ce `placeId` ») ; limite documentée par un test nommé (`tests/unit/programme/revision.test.ts`). Un contrôle par `placeId` reste possible plus tard.
5. **Lecture de la règle « une révision » sans verrou** : deux lignes `batch` concurrentes du même voyage peuvent chacune appeler le modèle ; l'écriture reste sûre (version de base relue sous le verrou), le coût est une requête perdue. Verrou à poser par M1h.
6. **Retrait de l'ancienne chaîne (M1-R, 0136 § 7)** : `etapes-lot.ts` aiguille vers la révision ; M1-R devra l'éditer, pas le supprimer.

## 6. Verdict de la Sécurité (revue de la PR #875)

Approuvé. La requête `revision` depuis la vraie app est admissible (extension du verdict #717 : règles de `programme`, 0117 S5, 0139) : `zdr` et `data_collection: "deny"` imposés, barrière B9-TL-8 évaluée à chaque étape, aucun secret, aucune migration. Garder le test à sentinelles si un champ comme `source` ou `exceptions` entre un jour dans `EntreeRevisionSchema`.

## Conséquences

Pour le Product Owner : écart assumé à B10b critère 2 (une catégorie arrêtée ne change pas le programme), conséquence de 0136 § 11 question 2 ; à confirmer par le PO.
