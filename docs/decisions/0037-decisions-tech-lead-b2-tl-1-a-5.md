# 0037 — Décisions du Tech Lead pour B2 (évolutions des contrats) : B2-TL-1 à B2-TL-5

Statut : décision déléguée, à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive sans veto de Samuel dans les 2 jours qui suivent cette publication · Date : 2026-10-13 · Décideur : Tech Lead (architecture des contrats et des tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #196

Numérotation : 0035 est réservé par la PR #199 (`0035-owner-approved-workflows.md`). Aucune autre PR ouverte n'ajoute de fichier `0037` ni ne cite ce numéro (vérifié le 2026-10-13). 0037 est le prochain numéro libre.

## Contexte
La spécification B2 (`specs/B2-evolutions-contrats.md`, PR #198, en revue) soumet au Tech Lead cinq propositions d'architecture des contrats et des tests (section « Propositions au Tech Lead », B2-TL-1 à B2-TL-5). Le code de B2 attend ces réponses ; B5 (moteur) attend B2.

Cette décision retient les options recommandées par la spécification, avec des précisions (signalées « **Précision** ») là où l'option laissait une ambiguïté que le code ou les tests de B2 trancheraient sinon seuls. Elle amende la décision 0010, principes 6 et 7 (texte de 0010 modifié dans la même PR). Elle ne modifie aucun code.

**Argent, comptes, données hors UE** : rien. Aucune dépendance, aucun compte, aucun service.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : respecté. Les voisins d'une proposition (B2-TL-1) et l'application d'un patch (B2-TL-3) sont des calculs déterministes du moteur, sans appel de modèle. Un remplacement ne désigne qu'un candidat de la réserve, donc déjà ancré. Aucun contrat de cette décision ne porte de donnée Google autre que `placeId`.

## B2-TL-1 — Où vit `Proposal.neighbours`
**Retenu : option A.** `Proposal.neighbours` est **calculé** à la lecture, jamais stocké, absent de `ProposalRecord` (et de `proposals.content` : `PROPOSAL_RECORD_KEYS` de B1 ne le contient pas).

Motif : un voisin stocké est faux dès la première révision du jour (remplacement, déplacement, ajout) ; le recalculer depuis la version courante donne toujours le contexte réel. C'est la règle de 0010 pour tout champ calculé.

Conséquences :
1. Tableau du handover § 5 : `Proposal.neighbours`, `ProposalNeighbours.*` et `ProposalNeighbour[*].*` sont « calculé » (« Serveur, à la lecture, depuis le jour de la version courante »).
2. **Précision** : le calcul est une **fonction pure du moteur** (`src/domain`, B5), appelée par le serveur à la recomposition de `listPreviewSlots` et `listProposals` (B6). Une seule implémentation, sans copie côté adaptateur ni côté interface. Entrée : le jour `proposal.day` de la version courante et `proposal.time`. Sortie : l'élément de la ligne du jour qui précède le créneau et celui qui le suit, en ignorant les trajets (`segment`) et l'étape dont l'`id` est `proposal.stop.id` si elle y figure. Jour en préparation (`generating`) ou sans élément de part et d'autre : clé absente (`{}` si aucune).
3. B2 ne calcule rien : les données simulées portent des voisins fixes, vérifiés par `données simulées: voisins et liens cohérents`.
4. Option B (stockage à la génération) écartée : elle oblige à réécrire `proposals`, table jamais modifiée après écriture (handover § 6).

## B2-TL-2 — Contenu de `TripSnapshot` ; amendement de 0010 § 6
**Retenu : option A.** `TripSnapshotSchema` = `{ days: DaySnapshot[] }`, seul contenu de `trip_versions.snapshot`.

Motif : une version ne porte que ce qu'une révision change. Les autres champs stockés de `Trip` ont déjà leur place et une seule (`trips` : identifiant, organisation, destination, dates, voyageurs, fuseau ; `checklist_items` : la liste) ; les recopier dans chaque version créerait deux sources qui divergent. `Trip.unlocked` et `Trip.destinationColor` sont calculés. C'est aussi la forme que lit `shared_trip_version` de B1 (`SHARED_SNAPSHOT_KEYS.day`, #188).

Conséquences :
1. **Précision (dérivation)** : `TripSnapshotSchema = TripBaseSchema.pick({ days: true }).extend({ days: z.array(DaySnapshotSchema) })`, conforme à la méthode du § 1 de la spécification (seul `.extend()` admis : remplacer un champ tableau par sa version de stockage dérivée). Pas de `z.strictObject({ days: … })` écrit à la main. Le test `contrats: les schémas de stockage sont dérivés sans copie` vérifie que la seule clé est `days`.
2. Les raffinements du voyage entier (`refineChecklistDays`, `refineChecklistStops`) ne s'appliquent pas à l'instantané, qui n'a pas de liste. La cohérence entre `checklist_items.stop_id` et les étapes de la version courante est contrôlée à la recomposition par `TripSchema` (B6).
3. À la lecture, le serveur recompose le `Trip` depuis `trips`, `checklist_items`, `entitlements`, l'instantané de la version courante et les champs calculés, puis le valide par `TripSchema` (inchangé).
4. **Amendement de la décision 0010, principe 6**, première phrase : « `TripSnapshotSchema` est dérivé de `TripSchema` par omission des champs calculés et chargés à la demande » devient « `TripSnapshotSchema` est dérivé des **jours** de `TripSchema` (`{ days: DaySnapshot[] }`, `DaySnapshotSchema` dérivé de `DaySchema` par omission des champs calculés et chargés à la demande) ; les autres champs stockés de `Trip` vivent dans `trips` et `checklist_items` (0037, B2-TL-2) ». Le reste du principe 6 (omission une seule fois sur le schéma imbriqué, validation de la réponse par `TripSchema`) est inchangé.
5. **Amendement de la décision 0010, principe 7** (suite de B2-TL-1 et de l'évolution E1) : la liste des champs omis de `ProposalRecordSchema` devient « calculés : `neighbours`, `option` ; chargé à la demande : `photoUrl` ; en attente de Q5 : les sous-clés du principe 6 », `weekday` et `context` étant retirés de `ProposalSchema` par B2.
6. Le texte de 0010 est modifié dans cette PR (principes 6 et 7, et sa ligne « Statut » renvoie à cette décision, qui prévaut en cas d'écart). La PR de code de B2 aligne le handover back-end (§ 4, ligne `TripSnapshot` du tableau « Contrats à créer » ; § 5, paragraphe « Où vit l'aperçu » ; § 6, ligne `trip_versions`).
7. Option B (lettre de 0010 : `Trip` entier moins les champs calculés) écartée : doublons de `trips` et `checklist_items` dans chaque version, et une liste cochée qui changerait de version sans révision du programme.

## B2-TL-3 — Forme de `TripPatch`
**Retenu : option A**, précisée.

Motif : un patch stocké doit pouvoir être rejoué tel quel sur une autre version (R10, rejeu après `version_conflict`). Il désigne donc les étapes par identifiant et porte, une fois écrit, tout ce qu'il faut pour être appliqué de façon déterministe. Option B (point d'insertion opaque, 0016 § 4.1) écartée : le point est lié à une version. Option C (instantané du jour) écartée : lourde et sans trace de l'intention.

Forme retenue (`src/contracts/patch.ts`, objets stricts) : `{ requestId, baseVersion, operations }`, comme le § 1 de la spécification, avec ces précisions :
1. **Précision — contrat interne du serveur.** `TripPatch` n'est jamais reçu du client. Le serveur le construit à partir des demandes de révision (`ReplacementRequest`, `MoveRequest`, `AddRequest` de 0016 § 4.1, verrouillage, annulation), le valide par `TripPatchSchema`, puis l'écrit. Les identifiants qu'il attribue le sont **avant l'écriture du patch**.
2. **Précision — `replace` porte `newStopId`** : `{ op: "replace", stopId, candidateId, newStopId }`. `newStopId` (type de `Stop.id`, attribué par le serveur, différent de `stopId`) est l'identifiant de l'étape créée ; c'est le `targetStopId` de l'aperçu (`RevisionPreview`, 0016 § 4.2 : `targetStopId === proposal.id`). Motifs : même règle que `add` (un patch rejoué produit les mêmes identifiants) ; une étape remplacée n'est pas la même étape (une ligne de la liste à réserver liée à l'ancienne par `stopId` ne doit pas désigner la nouvelle en silence ; `Stop.verifiedAt` suit l'identifiant, 0011 point 5).
3. **Précision — `add.kind` vaut `activity` ou `meal`.** Un ajout par la personne ne crée jamais d'événement : les événements de `Day.events` viennent de la recherche et de la relecture de leur page (R2), et les moments d'ajout de 0016 § 4.3 sont `free` et `openMeal`. Une extension à `event` passera par une nouvelle décision.
4. `move` porte `stopId`, `day`, `time` ; le serveur traduit le point d'insertion de `MoveRequest` en jour et heure avant d'écrire le patch.
5. `lock`, `unlock` : `stopId`. `revert` : `toVersion`, seul dans `operations`, `1 ≤ toVersion < baseVersion`.
6. **Précision — ordre** : les opérations s'appliquent dans l'ordre du tableau. Un `stopId` attribué (`add.stopId`, `replace.newStopId`) n'apparaît qu'une fois comme identifiant attribué dans un patch (raffinement du schéma).
7. Aucun champ pour un nom Google, une adresse, une coordonnée, un horaire, une note ou une durée (schéma strict). `add.name` est le nom saisi par la personne (0010 principe 1).

Conséquences pour B2 : le test `contrats: TripPatch désigne les étapes par identifiant` ajoute les refus de `replace` sans `newStopId` ou avec `newStopId === stopId`, de `add` avec `kind: "event"`, et de deux identifiants attribués égaux. Le handover (§ 4, ligne `TripPatch`) et la spécification B2 (§ 1, tableau des opérations) sont alignés par la PR de code, comme le prévoit la spécification quand le Tech Lead précise une option.

## B2-TL-4 — Forme de `PatchResult`
**Retenu : option A.** `{ version, touchedDays, changes }` : `version` entier ≥ 2, `touchedDays` entiers ≥ 1 distincts, `changes: Change[]` avec `ChangeSchema` tel qu'il est dans `main` à la fusion de B2 (les formes de 0016 § 4.5 arrivent avec F7a, qui les applique aussi dans `PatchResult` sans changer sa forme).

Motif : la réponse d'une révision dit ce qui a changé ; le programme recomposé est servi par la lecture (B6). Option B (renvoyer le `Trip`) écartée : réponse qui grossit à chaque révision et seconde voie de lecture à tenir cohérente avec la première.

Conséquences :
1. `PatchResult` n'est jamais stocké (aucune colonne) ; ses `Change[segment]` sont calculés à la réponse (0011 point 5).
2. L'adaptateur `api` (B11) convertit `PatchResult` en `ApplyResult` (0016 § 4.4) en une seule fonction ; `ApplyResult` n'est pas modifié par B2.
3. Producteur (B5) : `touchedDays` en ordre croissant. Ce n'est pas un raffinement du schéma.

## B2-TL-5 — Test permanent de catégories
**Retenu : option A**, test Vitest permanent `contrats: chaque champ a une seule catégorie` (`tests/unit/contracts/categories.test.ts`), selon la définition du § 5 de la spécification, avec ces précisions :
1. **Précision — arrêt du parcours** : le parcours d'un schéma s'arrête sur un sous-schéma qui est lui-même un contrat exporté par `src/contracts/index.ts` (comparaison par identité d'objet, après retrait des enveloppes `optional`, `nullable`, `array` et des raffinements). `Trip.days` est une clé ; les champs du jour sont les clés `Day.*`. Les schémas exportés qui ne sont ni objet ni union discriminée (énumérations, `TimeSchema`) ne produisent aucune clé.
2. **Précision — deux listes distinctes** :
   - `EXCLUDED_CONTRACTS` : exclusions **temporaires** ; chaque entrée `{ contract, task, reason }` nomme une tâche autre que B2 (ligne « Contrats à créer » du handover). Une entrée sans tâche, avec `task: "B2"`, ou qui nomme un contrat absent des exports fait échouer le test (pas d'exclusion périmée) ;
   - `DERIVED_STORAGE_SCHEMAS` : exclusions **permanentes** des schémas de stockage dérivés (§ 1 de la spécification), chaque entrée `{ contract, source }` nommant son schéma source ; leur contrôle est celui du test `contrats: les schémas de stockage sont dérivés sans copie`.
   Les clés dont le préfixe est un contrat de l'une ou l'autre liste sont retirées des deux ensembles A et B avant comparaison.
3. La lecture du markdown (handover § 5 et tableau du point 5 de 0011) se fait par `node:fs` dans le test, sans dépendance nouvelle.
4. Option B (script ponctuel) écartée : un tableau vérifié une fois dérive dès la PR suivante. Option C (catégorie en métadonnée Zod, tableau généré) **reportée** : elle change la source de vérité du handover ; à reconsidérer si le tableau dépasse 250 clés ou si le test échoue plus d'une fois par mois pour une ligne oubliée.

## Conséquences pour le code de B2 (récapitulatif)
- Contrats : `Proposal.neighbours` hors de `ProposalRecordSchema` ; `TripSnapshotSchema` par `pick` + `extend` ; `TripPatch` avec `replace.newStopId` et `add.kind ∈ {activity, meal}` ; `PatchResult` selon la spécification.
- Tests : ajouts de B2-TL-3 au test `TripPatch` ; `DERIVED_STORAGE_SCHEMAS` et règle d'arrêt dans `categories.test.ts`.
- Documents alignés par la PR de code : spécification B2 (§ 1 `TripPatch`, § 5 exclusions), handover back-end (§ 4, § 5, § 6). Le texte de 0010 est aligné par cette PR.
- Ordre inchangé : le code de B2 démarre après la fusion de F10a (#186), selon l'ordre fixé par le CEO.

## Hors de cette décision
- Algorithme d'application d'un patch, détection de conflit, attribution concrète des identifiants (format) : B5.
- Formes de `Change` de 0016 § 4.5 (F7a) et variante `checklist` (F7d).
- Recomposition des 7 clés de la « Partie Q5 » (B6, B8) ; `verifiedAt` attend S5 (Samuel).
