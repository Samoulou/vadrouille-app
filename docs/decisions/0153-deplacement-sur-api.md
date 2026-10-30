# 0153 — « Déplacer une étape » sur `api` : par le moteur (`appliquerPatch`) et la relecture, comme « Remplacer » et l'ajout

Statut : **proposée, à confirmer par la revue**. Décision déléguée du **Tech Lead** (architecture, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Définitive dès sa fusion, **sans délai de veto** (décision 0093). À lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-10-30 · Décideur : Tech Lead · Ticket : #957 · Source : revue consolidée du Tech Lead sur la PR #953 (« Déplacer une étape » sur `api`, ticket #947, head `0baceb0` : bloquants 1 à 4, réponses aux questions 1 à 4) · Complète : 0147 (§ 4, § 6.4 point 4, § 11), 0037 B2-TL-3, 0152 (§ 4 et § 5) · Relu : `main` `b8cfc96`, `origin/claude/947-deplacer-api` `0baceb0`.

Numérotation (vérifiée le 2026-10-30) : `main` va jusqu'à 0152 ; aucune branche `claude/…` n'ajoute 0153.

**Ce que cette décision n'engage pas.** Aucun argent : la relecture est celle que la lecture d'une journée fait déjà, sous le même forfait et la même barrière, fermée (0147 § 4 point 2) ; son ouverture réelle reste à Samuel (M1h). Aucun compte externe, aucune migration, aucune variable d'environnement, aucune donnée Google autre que le `placeId`, aucun temps de trajet écrit. Aucun test supprimé ni désactivé. Aucun texte, aucun rendu.

## Contexte

Le ticket #947 demande « Déplacer » sur `api` « sans appel payant (pas de Routes ni de Places : les trajets ne sont pas recalculés) ». La PR #953 l'a fait par un calcul parallèle, `src/domain/deplacement.ts` (`pointsDeDeplacement`, `deplacerSansRelecture`, environ 400 lignes), sans le moteur ni le port de relectures. La revue du Tech Lead (head `0baceb0`) l'a refusé :

1. **Second planificateur à côté du moteur.** `appliquerPatch` (`src/domain/patch.ts`, l. 565 ; cas `move`, l. 715-741 sur `main` `b8cfc96`) déplace déjà une étape : il la pose, fixe, à l'heure demandée dans le jour de destination, retire au besoin le repas pas encore choisi (`retirerRepasOuvert`) et replanifie les deux jours touchés. La PR réécrit à côté la recherche des points, la réécriture des jours (`regionSansEtape`, `creneauAvecEtape`) et « Ce qui change » (`changementsDuDeplacement`, qui reprend `changements()`, l. 441). C'est contraire à « le moteur planifie » et à l'absence de duplication.
2. **Aucune validation R1 à R9 à l'écriture** (`rapport: []`, seule R3 rejouée). `appliquerPatch` valide les jours touchés (R1 à R9, R3 contre la base, l. 796-822) et refuse en `no_option` toute entrée bloquante nouvelle. Sans lui, un déplacement peut écrire un jour que le moteur aurait refusé (trajet trop long, R5 ; budget, R9) ; la PR l'admet (« la journée peut être plus serrée qu'affiché, sans que rien ne le signale »).
3. **Patch `[move]` non rejouable par le moteur.** Rejoué par `appliquerPatch` (0037 B2-TL-3 ; 0147 § 11), le patch `{ op: "move", stopId, day, time }` écrit donnerait un autre instantané que celui de `deplacerSansRelecture` ; le rejeu de la PR ne tient que parce qu'il repasse par le même module parallèle.
4. **Pourquoi le moteur exige une relecture.** Sa replanification refuse un jour dès qu'un trajet vers une étape non fixe à `placeId` est inconnu (`replanifierHoraires`, `src/domain/patch.ts`, l. 318). Les instantanés ne portent aucune durée (`TripSnapshotSchema`) : sans relecture, presque tout déplacement serait `no_option`. C'est le motif de 0147 § 4 point 1 pour l'ajout, et la forme de M1g pour le remplacement (0145).

## Décision

1. **Le déplacement passe par le moteur.** Aperçu et application calculent la nouvelle version par `appliquerPatch`, avec le patch `[move]` (`{ op: "move", stopId, day, time }`, forme admise de `FORMES_PATCH_PERSONNE`, `src/server/versions/retouches.ts`, l. 59), comme « Remplacer » (M1g) et l'ajout d'un lieu à soi (M5d-1). Aucun autre module ne réécrit une journée.
2. **Avec une relecture par le port de la lecture.** Comme `src/server/versions/remplacement.ts` (modèle) et `src/server/lieux/ajout.ts` : `lireBaseDeRevision` (transaction en lecture seule), puis **un** appel `relireRevision` hors transaction et sans verrou tenu, couvrant le jour d'origine et le jour d'arrivée, puis `appliquerPatch`, puis `recomposerJourDeRevision` pour les jours touchés de la réponse (`src/server/voyages/lecture.ts`, l. 726, 745, 774). Profil `relecture`, rien n'est stocké (0147 § 4 point 2).
3. **Échec de la relecture** : `provider_error`, ou `cost_cap_reached` si le forfait est atteint (`quota_reached`, comme `ajout.ts`, l. 194-215) ; rien n'est écrit. Refus du moteur : `no_option` (état `noOption` existant de `MoveSheet`).
4. **La règle « aucun appel » du ticket #947 est écartée**, pour le motif du Contexte point 4 : elle ne peut pas l'emporter sur la validation par le moteur. Ce n'est pas une dépense de plus par nature (0147 § 4 point 2).
5. **Validation R1 à R9 à l'écriture** : celle d'`appliquerPatch` (étape 4), sans complément ; R3 est tenue par le moteur (une étape verrouillée n'est ni déplacée, `locked_stop`, ni décalée), en plus du contrôle de l'étape avant le moteur.
6. **Patch écrit = patch appliqué** (0037 B2-TL-3) : `ecrireVersion` écrit le `[move]` passé au moteur, tel quel, avec `instantanePrecedent` (la liste « À faire » suit, 0147 § 7.2). Rejoué par `appliquerPatch` avec les mêmes durées, il redonne le même instantané, comme un `replace` ou un `[add, lock]`.
7. **« Ce qui change »** : les changements du moteur (`resultat.changes`, calculés par `changements()` de `patch.ts` : `moved`, trajets, budget), suivis des lignes `checklist` de `lignesApresVersion`, comme `remplacement.ts` (l. 304). Aucune fonction de changements propre au déplacement.
8. **Points d'insertion (`getMoveOptions`)** : lecture seule, **sans relecture ni appel du moteur** : une fonction pure qui lit les temps libres de la version courante et rend des points candidats (jour, heure), sans réécrire aucun jour. Le moteur tranche à l'aperçu : un point refusé y donne `no_option`. Cette fonction peut réutiliser `tempsLibreAvant` (`src/domain/journee.ts`) ; elle ne reprend rien de `deplacerSansRelecture`. Sa règle (quel temps libre, quelle heure) est dite dans la description de la PR, avec ses tests.
9. **Limiteur `retouche`** : la ligne « déplacement » de 0147 § 6.4 point 4 **reste valable** : `getMoveOptions`, `previewMove` et `applyMove` sont soumis à la règle `retouche` (`src/server/config/limites.ts`, l. 58), après le contrôle du voyage dans l'organisation et du déblocage, **avant toute relecture ou écriture**.
10. **Ordre des contrôles** : celui de M5a et de l'ajout (`ajout.ts`, l. 47-56), la relecture hors transaction s'insérant entre la lecture et l'écriture ; sous les verrous du tri puis des versions : rejeu par `requestId`, `generation_in_progress`, `VERSIONS_MAX_PAR_VOYAGE`, version de base inchangée depuis la lecture, moteur, écriture.

## Conséquences pour la PR #953 (correction 1, qui cite cette décision)

**Disparaissent** :
- `src/domain/deplacement.ts` tel qu'écrit (`deplacerSansRelecture`, `regionSansEtape`, `creneauAvecEtape`, `changementsDuDeplacement`, rejeu de R3) et `tests/unit/programme/deplacement.test.ts` qui le teste (la fonction des points du point 8, si elle reste dans un module de `src/domain`, garde ses propres tests) ;
- l'option `sansDurees` de `recomposerJour` (`src/domain/recomposition.ts`) et son test ajouté dans `recomposition.test.ts` ;
- le `minutes: null` des trajets de l'aperçu (les durées viennent de la relecture) ;
- la modification du commentaire de `SegmentSchema.minutes` (`src/contracts/trip.ts`, l. 149) ;
- l'extension de `src/mocks/relectures-voyages.ts` (réserve du déplacement) : les durées dont les tests ont besoin passent par le port injecté dans le cas d'usage (modèle `tests/db/lieu-a-soi.test.ts`, l. 125). Si la lecture `api` du jeu de révision en a besoin après une écriture réelle, l'extension revient avec ce motif dans la description.

**Restent** : les trois actions et leurs entrées, `RevisionAdapter`, `revision-deplacement.ts` chargé à la demande, « Annuler » par `applyRevert`, `MoveSheet` inchangé, le jeu simulé et l'implémentation en mémoire de `mock`.

**À ajouter** : le test `generation_in_progress` dans `tests/db/deplacement.test.ts` (bloquant 4 ; 0019 § 3.2 point 3 ; modèle `tests/db/lieu-a-soi.test.ts`, l. 277) ; les tests `provider_error` et `cost_cap_reached` sans écriture ; un test de rejeu qui applique le `[move]` stocké par `appliquerPatch` et retrouve l'instantané écrit. Les mineurs de la revue (changements `checklist` du rejeu alignés sur M5a ; `rate_limited` si M5a le teste ; refus de `getMoveOptions` distingué d'un jour « complet ») restent à traiter ou à justifier dans la PR.

**Question 3 de la PR** (phrase sur les trajets non relus) : sans objet, les trajets sont relus. Une durée relue estimée (`Segment.estimated`) garde le rendu existant ; toute phrase nouvelle de l'aperçu reviendrait au Product Owner et à UX/UI, et n'est pas ajoutée par #953.

## Ce qui revient au Product Owner

**Déplacer un repas** (question 2 de la PR) : faut-il proposer, pour un repas, les « repas pas encore choisis » du même créneau des autres jours ? Le Tech Lead ne le tranche pas. Constat technique seulement : le cas `move` du moteur retire déjà le repas pas encore choisi du jour d'arrivée (`retirerRepasOuvert`) ; une réponse « oui » ne demande donc qu'une règle de points (point 8), pas une forme nouvelle de patch. En attendant la réponse, #953 garde ce qu'elle fait : un repas n'a aucun point (tous les jours « complets »).

## Budget du JavaScript initial (question 4 de la PR)

1. Le seuil de 200 000 octets gzip (0016 § 3.1) ne change pas ; le test e2e « budget » en CI fait foi.
2. **Règle pour la suite** (0152 § 4) : toute PR qui ajoute du code client à la Journée le charge à la demande (`import()` au premier geste, ou `React.lazy` sous `Suspense`), ou charge d'abord à la demande une autre feuille, et donne les chiffres R11 et R12 avant et après dans sa description (0152 § 5).
3. **La tâche d'allègement demandée par la revue est faite** par #956 (décision 0152) : R11 **188 207** octets, R12 **188 507** (mesures de 0152, `main` après #956), soit environ 11 500 octets de marge. Aucune tâche d'allègement de plus n'est à ouvrir pour #953 ; ses chiffres sont à remesurer après la fusion de `main` dans sa branche.

## Conséquences

- Toutes les retouches qui déplacent une étape sur `api` (remplacement, ajout, déplacement) passent par le même moteur, la même relecture et le même rejeu ; aucun planificateur parallèle.
- Un déplacement coûte une relecture de deux journées, sous le forfait de la lecture, comme un remplacement ou un ajout ; les options ne coûtent rien.
- Un déplacement qui rendrait un jour invalide est refusé (`no_option`) au lieu d'être écrit.

## Questions nouvelles, par destinataire (à reporter par le CEO dans `QUESTIONS.md`)

**Product Owner** :
1. Déplacer un repas vers un « repas pas encore choisi » d'un autre jour (question 2 de #953) ? Bloque : le déplacement des repas sur `api`, pas le reste de #953.

**CEO** :
1. Ne pas ouvrir de tâche d'allègement du budget JS pour #953 : faite par #956.
2. Ordre : cette décision avant la fusion de #953 ; la correction 1 de #953 peut avancer en parallèle en citant 0153.
