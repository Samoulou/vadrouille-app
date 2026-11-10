# 0145 — Remplacer une étape sur `api` (M1g) : `candidateId`, invariant des engagements de l'aperçu, candidats, découpage de la lecture, valeurs par défaut du moteur

Statut : **acceptée**. Décision du **Tech Lead** (architecture, contrats, tests : « Qui décide quoi » de `docs/CONTEXT.md`), **validée par le CEO** (arbitrages de la correction 2 de la PR #877). Définitive dès sa fusion, **sans fenêtre de veto**. À lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-10-29 · Décideur : Tech Lead · Validation : CEO · Ticket : #869 · PR : #877 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 1, ligne M1g · Décisions lues : 0015 § 9, 0016 § 4.2 et § 9, 0037 B2-TL-3, 0119 § 1.6.

Numérotation : 0145 est réservé par le CEO pour cette décision. La revue citait 0142, déjà pris par M1b (`0142-erratum-0136-revision.md`).

**Ce que cette décision n'engage pas.** Aucune migration, aucun appel Google ni Routes nouveau, aucune durée stockée, aucun compte externe, aucun test supprimé ni désactivé.

**Réservé, non tranché ici** (Product Owner, reporté par le CEO) : des propositions hors programme pour les voyages de la chaîne inversée ; l'effet de la raison et du souhait sur le choix ; une étape liée à une ligne « À faire » (aujourd'hui « Aucune option compatible »).

## 1. `TripPatchOperation[replace].candidateId` désigne `candidates.id`

Le `candidateId` du patch `replace` est l'identifiant de la ligne `candidates` du candidat retenu, comme le dit déjà `src/contracts/patch.ts`. Il n'est jamais `proposals.id`. Ce point **remplace la réponse 1 du Tech Lead à la première revue de la PR #877**, qui gardait « le candidat du moteur ». L'aperçu (`ReplacementOffer[offer].candidateId`) rend ce même identifiant, et l'application le revérifie.

## 2. Invariant des engagements d'un aperçu de révision (précisé, pas assoupli)

`RevisionPreviewSchema`, et les brouillons du jeu simulé, refusent un engagement (`Stop.commitment`) **sur l'étape visée (`targetStopId`) et sur les étapes changées (`changedStopIds`)**. Une étape intacte du jour touché **garde** le sien. La règle est celle de 0015 § 9 et 0016 § 4.2 : une révision ne crée ni ne touche aucun engagement. Elle n'interdit pas qu'un jour touché en contienne un.

Conséquences :
- `refineDraft` (`src/contracts/revision.ts`) applique cette règle ;
- `jourDApercu` (`src/features/sejour/revision-serveur.ts`), qui retirait `commitment` des jours de l'aperçu, est supprimée ;
- `ReplacementOffer[offer].draft` est validé par le schéma raffiné ;
- test de contrat `src/contracts/revision.test.ts` : refusé sur la cible, refusé sur une étape changée, accepté sur une étape intacte.

## 3. Candidats et découpage de la lecture

- `candidates` n'est écrit que par la génération. Le remplacement le lit, jamais il ne l'écrit. Une proposition sans candidat (`proposals.candidate_id` nul, cas de la chaîne inversée) n'est pas une option : la réponse est `noOption`.
- `src/server/voyages/lecture.ts` exporte `lireBaseDeRevision`, `relireRevision` et `recomposerJourDeRevision`. Le remplacement relit et recompose ainsi les jours **comme la lecture** (même port de relectures, appelé hors transaction et hors verrou). Ce découpage est admis : pas de module partagé de plus.

## 4. Fenêtre d'annulation

Le serveur n'impose pas la fenêtre de 5 s. L'annulation est acceptée tant que la version courante est celle du remplacement, écrite par une personne, avec une seule opération `replace`. Le toast tient le délai.

## 5. Valeurs passées au moteur

`appliquerPatch` ne lit ni le classement ni les notes. Le remplacement lui passe :
- l'allure du dernier brief, ou `balanced` sans brief ;
- les notes de la ligne `candidates` ;
- le classement de la génération : `CONFIGURATION_CLASSEMENT` et l'âge maximal des sources du profil `apercu`.

Ces valeurs sont acceptées.

## 6. Écart admis : carte écartée entre l'aperçu et l'application

Entre la lecture (étape 1) et l'écriture (étape 3), une carte écartée au tri (« Pas pour moi ») n'est pas revue : elle ne change pas la version. Le candidat de l'aperçu reste applicable. Une ligne « À faire » posée entre-temps est, elle, revue.

## 7. Contrats au § 5 du handover back-end

Les champs de `ReplacementOffer` et `ReplacementWrite` ont leur ligne au § 5 de `docs/handovers/backend.md` : discriminants « calculé », versions « stocké » (`trip_versions.version`), `candidateId` « stocké » (`candidates.id`), brouillon « calculé » (moteur, jamais persisté).

## 8. Données de test du remplacement

Le double de relectures (`src/mocks/relectures-voyages.ts`) sert, à la proposition d'un brouillon simulé de remplacement (`src/mocks/edimbourg-revision.ts`), les durées de ce brouillon vers ses voisins. `avecReserveDeRevision` (`tests/support/voyages-en-base.ts`) écrit cette proposition comme une proposition déjà vérifiée. Elle donne aussi un coût de test aux repas et à l'événement de son jour, qui n'en ont pas dans `mock`. Somme : 95, le budget du jour de `mock`. Le moteur ne rend une ligne de budget que si chaque ligne du jour a son coût. Ces valeurs ne servent qu'aux tests et au scénario de bout en bout du remplacement.
