# 0110 — Bout en bout simulé sur l'adaptateur `api` : lecture des voyages générés, forfaits simulés en mémoire, écran 5 pendant la génération (amende 0100 § 5.3)

Statut : **proposée**, **décision déléguée du Tech Lead** (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`) ; rédigée par le rôle backend à la demande de la revue consolidée de la PR #588 (head `ba4505b`, bloquant 1 : « Cela demande une décision dans `docs/decisions/` (statut, date, décideur) ») ; **acceptée par l'approbation du Tech Lead sur la PR #588**, définitive dès sa fusion (décision 0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment. Elle n'engage ni argent, ni compte externe, ni donnée personnelle ; elle ne lève aucune garde (0086 § 2.1, barrière de 0081 B9-TL-8), ne touche ni `PLAFONDS_USAGE` ni aucun montant réservé à Samuel, ne change ni droits, ni RLS, ni migration, et n'affaiblit ni ne supprime aucun test. Le § 4 touche un écran : **avis du Product Owner demandé** dans la PR.

Date : 2026-10-20 · Décideur : Tech Lead (rédaction : backend) · Ticket : #583 · PR : #588 · Spécification : `specs/B9-generation.md`, B9e point 3 et critère « Bout en bout simulé » · Décisions liées : 0100 § 5.3, 0105 § 2, 0108, 0081 B9-TL-2, B9-TL-8, 0083, B6-PO-2

Numérotation (relue le 2026-10-20 sur `main` `e043012`) : `main` porte 0001 à 0109 ; aucune PR ouverte ni aucune branche `claude/…` ne porte un 0110.

**Amende, sans la réécrire** : **0100 § 5.3** (« la source réelle n'est choisie que si l'environnement résolu est `local` et que `RELECTURES_SOURCE` vaut `google` ; sinon l'appelant garde le double ») : hors de la source réelle, en `local` et en `ci` seulement, le double est **complété** pour les voyages générés par la variante simulée (§ 1). La source réelle, sa condition et le repli seul partout ailleurs sont inchangés.

## Contexte

Le critère « Bout en bout simulé » de B9e demande, sur l'adaptateur `api` en CI : écrans 1 à 5, puis « Mes voyages » liste le voyage et **Séjour affiche ses jours**. Trois écarts l'empêchaient sans contournement :

1. La génération simulée écrit les `placeId` sentinelles des fixtures d'Édimbourg (`SENTINELLE_PLACE_ID_…`), que le double de relectures de B6 (`src/mocks/relectures-voyages.ts`, `mock_place_…` et `test_place_…`) ne connaît pas : Séjour rend `travel_unknown`.
2. Les forfaits de la variante simulée étaient réservés dans `usage_ledger`, avec les mêmes `provider` et `sku` que la variante réelle : sur une base partagée (préversion), ils s'ajoutaient aux sommes du mois, de l'enveloppe et de l'organisation lues par la variante réelle (revue de #588, bloquant 3).
3. L'écran 5 (`/voyages/<id>/preparation`) vérifiait le voyage par `getTrip`, qui rend `null` tant qu'aucune version n'est publiée (B6-PO-2) : sur `api`, « Page introuvable » pendant toute la génération (revue de #588, bloquant 2).

## Décision

### 1. Lecture des voyages générés par la variante simulée (amende 0100 § 5.3)

`choisirSourceRelectures` (`src/server/composition/lecture.ts`) :
- `local` avec `RELECTURES_SOURCE=google` : la source réelle, inchangée ;
- sinon, environnement résolu `local` ou `ci` (`declarationsLectureSimulee`, `src/server/env/relectures.ts`) : le double de B6, **complété** par `avecVoyagesGeneresSimules` ;
- partout ailleurs (préversion, préproduction, production, déclaration absente ou illisible) : le double seul, comme 0100 § 5.3.

Le test existant « composition: source réelle seulement en local » est adapté en conséquence (`ci` et `local` sans source réelle : une source distincte du repli, qui lui délègue ses voyages) ; aucun cas n'est retiré, les cas de préversion et d'environnement absent sont ajoutés.

### 2. Aiguillage et chargement des fixtures

- **Par préfixe** (`PREFIXE_LIEU_FIXTURES = "SENTINELLE_PLACE_ID"`) : une lecture dont **tous** les lieux (logements des nuits, lieux demandés, points des trajets) portent ce préfixe passe par la source de B8b (`creerSourceRelectures`) sur les doubles Places et Routes des fixtures ; une lecture mêlée, ou sans lieu, reste au double de B6. Ces valeurs sont fabriquées (aucune réponse réelle) ; aucun `placeId` Google réel ne porte ce préfixe.
- **Fixtures par `import()` dynamique** de `@/server/composition/fixtures-simulees` à l'appel (0105 § 2), dont le chargeur refuse de lire en production ou sous une déclaration inconnue : la lecture rend alors `unavailable`, jamais le repli ni un client réel.
- **Jamais réel** : aucun client réel construit ; aucune écriture de position (`positionsSuspendues` vrai).

### 3. Forfaits de la variante simulée en mémoire, aucune ligne dans `usage_ledger`

- **Génération** (`forfaitDeLEtape`) : barrière `simulee`, le forfait de l'aperçu est calculé par `forfaitDuProfil` (configuration seule) et borne les doubles par le registre en mémoire, **sans réservation** ; la variante réelle réserve toujours (0083, inchangée). Les bancs de la base qui éprouvent la séquence de réservation par la variante simulée le demandent explicitement (`reserverEnSimulee: true`, dépendance de test) ; la valeur par défaut est `false`.
- **Lecture** (§ 1) : la source de B8b reçoit `reservation: "memoire"` (registre du forfait, aucune transaction de réservation) ; la source réelle garde la réservation (valeur par défaut).
- Conséquence : un aperçu ou une lecture simulés ne changent pas les sommes lues par la variante réelle (`public.usage_forfait_totals()`), testé (`tests/db/apercu.test.ts`). Une reprise dont la variante change en cours de route ne rencontre plus de forfait « déjà réservé, différent » (question 12 de la PR) ; ce cas reste un échec fermé (`usage_unavailable`), épinglé par `src/server/usage/reservation.test.ts`.
- `PLAFONDS_VARIANTE_SIMULEE` (`src/server/config/usage.ts`) reste des **valeurs de test** sans lien avec les montants de Samuel, que la barrière ne lit jamais (B9-PO-10) ; leur alignement sur les valeurs des bancs (`PLAFONDS_LARGES`, `PLAFONDS_USAGE_TEST`) est testé (`src/server/config/usage.test.ts`).

### 4. Écran 5 pendant la génération

`src/app/voyages/[id]/preparation/page.tsx` ne lit plus le voyage par `getTrip` : après `exigerSession`, `getGenerationStatus` vérifie le voyage (inconnu ou d'une autre organisation : `not_found`, donc 404, la RLS forcée ne rendant que les lignes de l'organisation posée) et donne l'état initial. Le titre du document garde `getTrip` : pendant la génération sur `api`, c'est le titre par défaut. C'est le seul fichier de `src/app` modifié par B9e, hors de l'exception de la spécification (B9, « Vérifications d'ensemble », `src/instrumentation.ts`) : la revue de #588 demande la correction dans le code ; **avis du Product Owner** demandé sur le titre par défaut pendant la génération.

## Conséquences testables

- `composition: source réelle seulement en local` (adapté, § 1) et `composition: lecture des voyages générés par la variante simulée (B9e)` (§ 2 et § 3 : lieux des fixtures relus sans transaction ; lieux mêlés au repli ; déclaration de production refusée).
- `génération: forfait de la variante simulée en mémoire, aucune ligne dans usage_ledger (0110 § 3)` (unitaire) et « variante simulée par défaut : … sommes lues par la variante réelle inchangées » (base).
- Bout en bout simulé `tests/e2e/generation-api.api.spec.ts` : écran 5 affiché dès le lancement, sans rechargement.
