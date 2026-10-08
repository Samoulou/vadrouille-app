# 0010 — Répartition des champs des contrats : stockés, chargés à la demande, calculés (Q14)

Statut : proposé · Date : 2026-10-08 · Décideur : Tech Lead (architecture des contrats, Q14 déléguée ; la partie juridique suit Q5, Samuel) · Définitif sans veto de Samuel avant le 2026-10-10

## Contexte
Q14 : certains champs de `src/contracts` peuvent venir de Google (`Stop.name`, `Stop.meta`, `Stop.verifiedAt`) alors que seul l'identifiant de lieu est stockable (cadrage § 6.5) ; d'autres sont des textes d'interface (`Day.title`, `Proposal.context`) alors qu'aucun texte d'interface n'est stocké (handover front § 9). PO-2 et PO-6 demandent au Tech Lead la forme de deux contrats.

## Décision
**Catégories** (une seule par champ ; tableau complet au § 5 du handover back-end) :
- *stocké* : contenu maison (nom et résumé issus de notre recherche web, résultat daté de nos contrôles, choix de l'utilisateur, sortie du moteur conservée dans la version) ou identifiant de lieu ;
- *chargé à la demande* : contenu Google obtenu côté serveur à l'affichage, jamais persisté, affiché avec la carte Google ou la mention « Données de lieux : Google » ;
- *calculé* : à la lecture, par le moteur (`src/domain`, appelé par le serveur) ou par l'interface (formatage) ; jamais persisté.

**Principes**
1. `Stop.name` est le nom trouvé par notre recherche web (source citée), pas le nom Google : stocké.
2. `Stop.meta` devient un champ calculé par l'interface à partir de faits structurés (`StopFacts` : durée, coût estimé, secteur) ; `Day.title`, `Day.weekday` et `Proposal.weekday` sont calculés par l'interface à partir de `date` ; `Proposal.context` est calculé par l'interface à partir de `ProposalNeighbours`.
3. Les durées de trajet (`Segment.minutes`) sont la sortie de notre moteur, arrondie à 5 minutes, calculée à partir de Routes API au moment de la planification ; la matrice brute de Routes n'est jamais conservée. Le stockage de cette sortie dans la version est **provisoire, suit Q5** ; si Q5 l'interdit, `Segment.minutes` passe en *calculé* (recalcul côté serveur à la lecture) par une tâche dédiée.
4. Coordonnées : jamais dans un contrat ni dans une version ; cache serveur `place_coordinates` de 30 jours au plus, avec date d'expiration contrôlée par la base (cadrage § 6.5).
5. `Proposal.photoUrl` : chargé à la demande, **provisoire, suit Q6**.
6. **Instantané d'une version** : `TripSnapshotSchema` est dérivé de `TripSchema` par omission des champs calculés et chargés à la demande (`.omit()` de Zod, aucune copie). À la lecture, le serveur recompose le `Trip` complet et le valide avec `TripSchema`. Écart signalé avec la spécification B0 (« instantané validé par `TripSchema` ») : la version stockée est validée par le schéma dérivé, la réponse par `TripSchema`.

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
- Les lignes marquées « provisoire, suit Q5 » ou « suit Q6 » sont recensées par le test `schéma: colonnes dérivées de Google recensées (provisoire, suit Q5)` pour permettre une purge ciblée si Samuel en décide ainsi.
