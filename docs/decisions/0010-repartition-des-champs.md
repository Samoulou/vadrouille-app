# 0010 — Répartition des champs des contrats : stockés, chargés à la demande, calculés (Q14)

Statut : proposé · Date : 2026-10-08 (révisée le 2026-10-08 après la revue Tech Lead et Sécurité de la PR #27) · Décideur : Tech Lead (architecture des contrats, Q14 déléguée ; la partie juridique suit Q5 et Q29, Samuel) · Définitif sans veto de Samuel avant le 2026-10-10 pour sa partie technique. **L'accord tacite sous veto ne couvre pas les aspects juridiques** de cette décision (statut des données dérivées de Google, Q5 et Q29 ; photos, Q6) : ce document applique un défaut prudent et ne tranche aucune de ces questions ; seule une réponse écrite de Samuel peut lever ce défaut.

## Contexte
Q14 : certains champs de `src/contracts` peuvent venir de Google (`Stop.name`, `Stop.meta`, `Stop.verifiedAt`) alors que seul l'identifiant de lieu est stockable (cadrage § 6.5) ; d'autres sont des textes d'interface (`Day.title`, `Proposal.context`) alors qu'aucun texte d'interface n'est stocké (handover front § 9). PO-2 et PO-6 demandent au Tech Lead la forme de deux contrats.

## Décision
**Catégories** (une seule par champ ; tableau complet au § 5 du handover back-end) :
- *stocké* : contenu maison (nom et résumé issus de notre recherche web, résultat daté de nos contrôles, choix de l'utilisateur, sortie du moteur conservée dans la version) ou identifiant de lieu ;
- *chargé à la demande* : contenu Google obtenu côté serveur à l'affichage, jamais persisté, affiché avec la carte Google ou la mention « Données de lieux : Google » ;
- *calculé* : à la lecture, par le moteur (`src/domain`, appelé par le serveur) ou par l'interface (formatage) ; jamais persisté.

**Défaut prudent pour les données dérivées de Google.** Tant que Samuel n'a pas répondu par écrit à Q5 et Q29, toute donnée **dérivée** d'une réponse Google (verdict, date de contrôle d'un lieu, durée de trajet) est *calculée, non stockée* : ni colonne en base, ni champ dans l'instantané d'une version. Ce défaut est un choix technique de prudence, pas une interprétation juridique. Si Samuel autorise la conservation, une tâche dédiée ajoute les colonnes ou champs concernés et amende cette décision ; s'il l'interdit, rien ne change.

**Principes**
1. `Stop.name` est le nom trouvé par notre recherche web (source citée) ou saisi par la personne : stocké. **Il n'est jamais écrit depuis le `displayName` de Google**, y compris pour un lieu ajouté par la recherche (`PlaceSearchResult`, `applyPatch`) : le nom Google y est seulement *chargé à la demande* et affiché avec l'attribution ; l'opération `add` de `TripPatch` porte `placeId` et un nom saisi par la personne, jamais un nom recopié par le serveur depuis Google. Test de B11 : `révision: aucun nom Google écrit dans Stop.name`.
2. `Stop.meta` devient un champ calculé par l'interface à partir de faits structurés (`StopFacts` : durée, coût estimé, secteur) ; `Day.title`, `Day.weekday` et `Proposal.weekday` sont calculés par l'interface à partir de `date` ; `Proposal.context` est calculé par l'interface à partir de `ProposalNeighbours`.
3. **Durées de trajet** (`Segment.minutes`) : *calculées, non stockées* (défaut prudent). Le serveur les recalcule à la lecture par Routes API, à l'intérieur de `src/grounding`, arrondies à 5 minutes ; le coût est compté dans `usage_ledger` et soumis aux plafonds. Si Routes est indisponible, la durée est estimée par le moteur à partir du cache de coordonnées (`estimated = true`). `Day.travelMinutes`, `Proposal.travelFromPrevious.minutes` et `Change[segment].*` suivent. Le moteur utilise les durées à l'intérieur de ses étapes sans les écrire. La matrice brute n'est jamais conservée. Hors ligne, l'interface n'affiche pas de durée qu'elle n'a pas reçue (aucun stockage côté navigateur de durées Google).
4. **Date de contrôle** (`Stop.verifiedAt`) : *calculée, non stockée* : à la lecture, le serveur renvoie la date de création (`trip_versions.created_at`, donnée maison) de la version la plus récente dont le rapport de validation couvre le jour de l'étape. Aucune colonne `verified_at`.
5. **Verdicts d'ancrage** : *non stockés en base* (décision 0011) ; pas de colonnes `grounding_verdict` ni `grounding_checked_at` dans `candidates`. Ils ne vivent que dans l'état des workflows, comme la spécification B0 le prévoit, à titre provisoire (Q29).
6. Coordonnées : jamais dans un contrat ni dans une version ; cache serveur `place_coordinates` de 30 jours au plus, avec date d'expiration contrôlée par la base (cadrage § 6.5).
7. `Proposal.photoUrl` : chargé à la demande, **provisoire, suit Q6**.
8. **Instantané d'une version** : `TripSnapshotSchema` est dérivé de `TripSchema` par omission des champs calculés et chargés à la demande (`.omit()` de Zod sur `TripSchema` et sur les schémas imbriqués dérivés `StopSnapshot` et `SegmentSnapshot`, aucune copie de champ). À la lecture, le serveur recompose le `Trip` complet et le valide avec `TripSchema`. Écart signalé avec la spécification B0 (« instantané validé par `TripSchema` ») : la version stockée est validée par le schéma dérivé, la réponse par `TripSchema`.
9. **Codes de nos contrôles fondés sur des horaires Google** (`Stop.exceptions` `toConfirm` issu de R4, codes R4 du `validation_report`) : ce sont nos conclusions, sous forme de codes neutres sans valeur Google (ni horaire, ni jour) ; ils restent stockés à titre **provisoire, suit Q5**, et sont soumis à Samuel avec les autres données dérivées (handover § 17). Ils n'atteignent jamais un prompt (décision 0011).

**PO-2 — moment d'un élément de la liste** : `ChecklistItem.when` devient un objet `ChecklistMoment`, union discriminée par `type` :
- `{ type: "deadline", date: IsoDate }` (date limite) ;
- `{ type: "beforeDeparture" }` ;
- `{ type: "tripDay", day: number }` (1 = J1 ; l'interface affiche « à l'arrivée » pour le J1).
Aucun libellé dans les données.

**PO-6 — aperçu incomplet** : nouveau contrat `PreviewSlot`, union discriminée par `type` :
- `{ type: "proposal", proposal: Proposal }` ;
- `{ type: "noOption", day: number, time: Time, kind: "activity" | "meal" }`.
L'aperçu est une liste ordonnée de `PreviewSlot` (8 au plus) lue par `TripAdapter.listPreviewSlots` ; `GenerationStatus` porte les compteurs `expected` et `ready`. Aucun texte d'interface ; l'état « aucune option compatible » est affiché par l'interface (`StatusBanner noOption`).

## Conséquences
- Les évolutions de contrats (§ 4 du handover) sont appliquées par la tâche B2 avec la mise à jour de `src/mocks/edimbourg.ts` et des composants concernés.
- Test de B2 : `contrats: chaque champ a une seule catégorie` (le script du critère § 5 de B0, rejoué sur les contrats modifiés) ; `contrats: ChecklistMoment et PreviewSlot sans texte d'interface`.
- Tests de B1 et B2 : `schéma: aucune colonne dérivée de Google tant que Q5 et Q29 sont ouvertes` (aucune colonne `grounding_verdict`, `grounding_checked_at`, `verified_at`, `travel_minutes` ni équivalent) et `versions: l'instantané ne contient ni durée de trajet ni date de contrôle` (validation de `TripSnapshotSchema` stricte sur un instantané réel).
- Les champs stockés à titre provisoire (point 9) sont recensés par le test `schéma: colonnes dérivées de Google recensées (provisoire, suit Q5)` pour permettre une purge ciblée si Samuel en décide ainsi.
