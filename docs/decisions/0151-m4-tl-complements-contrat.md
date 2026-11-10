# 0151 — Compléments du Tech Lead au contrat « plusieurs villes » (M4-TL-2) : borne de `estimatedMinutes`, listes fermées des attentes, paramètre de `voisins` levé, parcours de `Day.items`, règle provisoire `no_option`, condition T-M4S-2

Statut : **proposée, à confirmer par la revue** (forme de 0148). Décision déléguée du **Tech Lead** (architecture, contrats, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Définitive dès sa fusion, **sans délai de veto** (décision 0093). À lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-10-30 · Décideur : Tech Lead · Ticket : #922 · Complète : 0148 (§ 1 point 3, § 2, § 10.1 point 3, § 10.2) · Sources : revue consolidée de la PR #918 (M4-C, head `197d6c6` : bloquant 2, mineurs 3 et 4, réponses du Tech Lead) ; revue consolidée de la PR #916 (M4-suite, head `b0e258a` : bloquant 1, mineurs 3 et 7) ; 0149 § 2, § 4 point 2 et question nouvelle 3 ; `specs/M4-suite-changement-de-ville.md` (PR #916, head `5229af0`, correction 2) · Relu : `main` `73e1ccf`, `origin/claude/912-m4-c-contrat` `197d6c6`, `origin/claude/913-m4-suite-spec` `5229af0`.

Numérotation : 0151 est réservé par le CEO pour cette décision (#922) ; 0150 est réservé à la décision UX/UI de la carte (M4-suite-UX).

**Précédence.** Cette décision complète 0148 ; sur les six points ci-dessous, **elle prime sur 0148**. Tout le reste de 0148 et de 0149 est inchangé.

**Ce que cette décision n'engage pas.** Aucun argent, aucun compte externe, aucune variable d'environnement, aucune migration, aucune donnée Google. Aucun test supprimé ni désactivé : les attentes qui changent sont listées aux § 2 et § 3 (listes fermées).

## 1. Borne haute de `TransferItemSchema.estimatedMinutes` (bloquant 2 de #918 ; 0149 question nouvelle 3 (b))

1. **Constante** `TRANSFER_ESTIMATED_MINUTES_MAX = 600` dans `src/contracts/values.ts` (à côté de `MAX_CITIES`, l. 336 de la branche M4-C), commentaire renvoyant à 0148 § 2 et 0149 § 2.
2. **Schéma** : `estimatedMinutes: MinutesSchema.max(TRANSFER_ESTIMATED_MINUTES_MAX).optional()` dans `TransferItemSchema` (`src/contracts/trip.ts`, l. 194 de la branche M4-C). `MinutesSchema` (l. 48) reste sans borne pour ses autres usages.
3. **Pas de borne basse dans le contrat** : le minimum de 20 minutes reste une valeur réglable de `changementDeVille.dureeEstimeeMinutes` dans `moteur.json` (0148 § 2 point 2, M4b), que M4-suite peut réviser.
4. **Tests (M4-C)** : 600 accepté, 601 refusé, dans `DayLineItemSchema` et dans `DayLineItemSnapshotSchema` (`src/contracts/trip.test.ts`, `snapshot.test.ts`).
5. **Obligation de M4b** : un test affirme `changementDeVille.dureeEstimeeMinutes.max ≤ TRANSFER_ESTIMATED_MINUTES_MAX`. Raison : le schéma final est `TripSnapshotSchema` (0117 § 1 point 6, 0149 § 2 point 3) ; une borne de configuration plus haute que celle du contrat ferait refuser l'instantané entier au lieu de retirer la seule durée.
6. Le code est porté par la PR #918 (correction 1).

## 2. Liste fermée de 0148 § 10.2, complétée (écarts 3 et 4 de #918 et bloquant 1 de #918)

Ajouts au § 10.2 point 3 de 0148, **par M4-C** :

1. `tests/e2e/creation.e2e.spec.ts` (l. 136-143 de la branche M4-C) : la boucle passe de **3 à 2 clics** sur « Ajouter une ville ». Playwright refuse de cliquer un bouton `aria-disabled` ; le « un de plus » passe par le focus et Entrée, et le test vérifie ensuite qu'il n'ajoute rien. Ceci **remplace** la phrase de 0148 « la boucle de trois clics peut rester », qui était inexacte.
2. `tests/unit/contracts/derived-storage.test.ts` (l. 49-50 de la branche M4-C) : `"cities"` ajouté à `TripSnapshot.omitted` (0148 § 6 point 2 : `Trip.cities` est lu depuis `stays`, jamais depuis l'instantané). L'attente « `transfer` repris par référence » (l. 87-88) est une extension, déjà permise.
3. `src/prototype/programme-reduit.ts` (`VoyageReduitSchema`, l. 140-146 de `main`) : `cities: true` ajouté à l'`omit`. `TripBaseSchema` étant strict (`src/contracts/trip.ts`, l. 292), un programme réduit qui porte `cities` est alors **refusé** (le site d'essai n'a qu'une ville, 0148 § 4). Un test nouveau le prouve (nom suggéré : `programme réduit: cities refusé`).

## 3. Paramètre « jour de changement de ville » de `voisins` levé ; liste fermée du § 9.1 de M4-suite validée (bloquant 1 et mineur 3 de #916)

1. **Levé.** Le paramètre prévu par 0148 § 10.1 point 3 n'est ajouté **ni par M4b, ni par M4c** ; `voisins` (`src/domain/calculs.ts`) garde sa signature. La règle de produit qui le justifiait (spécification M4 § 7.3, l. 324 : « `context` ne cite jamais un déjeuner le jour d'un changement de ville ») est levée par M4-suite § 3.6 point 4 (Product Owner).
2. **Raison technique.** Le `transfer` arrête déjà la recherche du voisin de son côté (`voisins`, branche M4-C, l. 92-118). `free` reste un voisin comme un autre jour (`voisinDe`, `src/domain/calculs.ts`, l. 61 de `main`), et « Temps libre » est posé de chaque côté du `transfer` dès que l'heure est connue (M4-suite § 3.4, option (a) des marges). Un déjeuner n'est donc cité que s'il est le voisin direct de la carte, comme un autre jour.
3. **Attentes.** M4b n'écrit pas l'attente « aucun `context` ne cite un déjeuner » du critère 14 de la spécification M4 (l. 530) ; le reste du critère 14 (ni `travelFromPrevious` ni `detour` sur la première carte après l'arrivée) est inchangé. Le critère 10 de M4-suite (`M4-suite: contexte avec déjeuner`) est écrit par M4-suite-back. Le commentaire de `voisins` qui renvoie ce point à M4b (branche M4-C, `calculs.ts` l. 89-90) est corrigé par la correction en cours de #918, sinon par M4b.
4. **Validation.** La liste fermée du § 9.1 de `specs/M4-suite-changement-de-ville.md` (head `5229af0`, l. 470-485, points 1 à 6) est **validée telle quelle** : c'est la décision écrite qu'exige `CLAUDE.md` pour ces attentes. Toute autre attente modifiée par les tâches de M4-suite reste un écart à justifier dans sa PR.

## 4. Liste de 0148 § 1 point 3, complétée (mineur 3 de #918 ; 0149 question nouvelle 3 (c))

Le « `switch` exhaustif » ne couvre pas tout : des parcours de `Day.items` à `if` ou à branche `default` traitent le `transfer` en silence. À traiter **explicitement**, avec un test chacun :

| Fichier (`main` `73e1ccf`) | Ce qui manque | Tâche |
|---|---|---|
| `src/adapters/share-projection.ts` | `transfer` retiré par un filtre explicite (0149 § 4 point 2) | **M4-C, fait** (`estPartageable`, l. 83 et 111 de la branche) |
| `src/domain/validation.ts`, l. 198-215 (boucle « aucun trou » de R8) | `precedent` remis à `undefined` au `transfer`, sinon un trajet est calculé d'une ville à l'autre | M4b |
| `src/domain/generation.ts`, l. 553-567 (`replanifierJour` : `gardee`, blocs fixes) | le `transfer` devient un bloc fixe recopié tel quel, sinon il est perdu au recalcul | M4b |
| `src/domain/programme.ts`, l. 18-31 (`debutDeLigne`) | cas `segment` et `transfer` explicites (plus de `default`) ; `transfer` rend son `start` | M4b |
| `src/adapters/prototype-parcours.ts`, l. 26-39 (`voisin`) | inoffensif (le prototype n'a pas de `transfer`) ; rendre le cas explicite | M4b |
| `src/components/carte/route.ts`, `buildDayRoute` (l. 94-139 de la branche M4-C ; tracé l. 119-131) | le tracé relie les étapes à travers le `transfer` ; le couper | **M4c** ; le commentaire de la branche M4-C (l. 26 : « ni marqueur ni tronçon ») est corrigé par #918 en « tronçon à couper par M4c » |

Cette liste reprend la revue de #918 ; elle n'est pas un relevé exhaustif. Toute autre fonction qui lit un `transfer` en silence, trouvée par M4b ou M4c, est traitée dans sa PR et signalée dans sa description.

## 5. Règle provisoire `no_option` sur un jour qui porte un `transfer`

1. **Confirmée jusqu'à M4b** : sur la branche M4-C, `replanifierHoraires` (`src/domain/patch.ts`, l. 160) rend `undefined` pour un jour touché qui porte un `transfer`, donc `appliquerPatch` refuse en `no_option` (l. 693), sans écriture. Aucun producteur de `transfer` n'existe avant M4b (le jeu `src/mocks/rome-florence.ts` n'est pas branché dans `mock`) : le cas est inatteignable.
2. **Remplacée par M4b** par la règle de `src/domain/changement-de-ville.ts` (créneau occupé de 0148 § 5.3, marges de M4-suite § 3.3 quand elles existent), **avant toute écriture réelle d'un `transfer`**, avec le test `plusieurs-villes: patch sur un jour de changement de ville`.
3. **`lock` et `unlock`** : un patch fait **seulement** d'opérations `lock`/`unlock` ne déplace rien ; sur un jour qui porte un `transfer`, il **ne rend pas `no_option`** : le jour est recopié avec le seul verrou changé, `transfer` compris, sans replanification des heures. Obligation de M4b au plus tard, avec le test `plusieurs-villes: verrouiller une étape un jour de changement de ville` ; M4-C peut le faire dès sa correction en cours, sans y être tenue.
4. Les autres retouches M5 d'un jour de changement de ville suivent T-M4S-3 (non bloquant, à reprendre avec M5).

## 6. Condition T-M4S-2, obligation de M4b (mineur 7 de #916)

La fonction de détection du départ saisi de `src/domain/changement-de-ville.ts` est **exportée**, **ne lit aucune configuration** (les valeurs utiles lui sont passées en argument) et **n'importe rien de `src/server`**, pour que l'aide de l'écran 1 (M4-suite § 4.2) l'appelle côté client. Elle ne lit que le type, la date, l'heure et l'ordre de saisie des engagements. L'interdiction d'importer `src/server` est déjà tenue pour tout `src/domain` par `lint: src/domain sans entrée-sortie` (`tests/unit/lint/domain-lint.test.ts`, l. 20-28) ; M4b ajoute un test unitaire qui appelle la fonction sans `ConfigurationMoteur` (sa signature n'en prend pas).

## 7. Ce que fait chaque tâche

- **M4-C (#918, correction en cours)** : § 1 points 1, 2 et 4 ; § 2 points 1 à 3 ; commentaires de `route.ts` (§ 4) et de `voisins` (§ 3 point 3) ; citer 0151 dans la description. À fusionner **après** cette décision.
- **M4b** : test de borne du § 1 point 5 ; pas de paramètre de `voisins` ni d'attente « déjeuner » (§ 3) ; lignes M4b du tableau du § 4 ; règle du `transfer` dans `appliquerPatch` et cas `lock`/`unlock` (§ 5) ; condition T-M4S-2 (§ 6).
- **M4c** : tronçon de `buildDayRoute` coupé au `transfer` (§ 4) ; rien d'autre de nouveau.
- **M4-suite-back** : attentes du § 9.1 de M4-suite points 1 à 3, validées (§ 3 point 4) ; test du critère 10 de M4-suite.
- **M4-suite-front** : attente du § 9.1 point 6, validée.

## Questions nouvelles, par destinataire (à reporter par le CEO dans `QUESTIONS.md`)

**CEO** :
1. Reporter dans le ticket M4b les obligations du § 7 (borne, `voisins`, parcours de `Day.items`, `no_option` et `lock`/`unlock`, T-M4S-2), en citant 0151.
2. Ordre : cette PR avant #918.

**Product Owner** (non bloquant) : dans `specs/M4-suite-changement-de-ville.md`, remplacer « décision **0151**, PR `[tl]`, en cours » (l. 13, 219, 472, 481, 510, 561, 577) par un renvoi à cette décision une fois fusionnée ; le fond ne change pas.

**Sécurité** : pour information, 0149 question nouvelle 3 (b) et (c) sont répondues par les § 1 et § 4 ; (a) (`cadrage.ts` et `pnpm p0`) reste à dire dans la PR de M4b.

**Samuel** : aucune.

## Conséquences

- Le contrat borne `transfer.estimatedMinutes` à 600 ; la configuration ne peut pas aller au-delà sans changer la constante (test de M4b).
- 0148 § 10.2 compte trois attentes de plus, toutes de M4-C ; la liste du § 9.1 de M4-suite est la liste fermée de ses tâches.
- `voisins` ne reçoit aucun paramètre ; le jour d'un changement de ville suit la règle de tous les jours, avec le `transfer` comme butée.
- M4b porte, en plus de 0148 § 12, le tableau du § 4, la règle du § 5 et la condition du § 6.

## Quand revoir

- Si M4-suite fait descendre une marge sous `seuilTempsLibreMinutes` (M4-suite § 3.4) : « Temps libre » n'est plus toujours posé de chaque côté du `transfer`, et la levée du § 3 est à relire.
- Si une durée estimée de plus de 600 minutes devient utile (trains de nuit, lot ultérieur) : changer la constante et `moteur.json` ensemble.
- À M4b : si la règle de `changement-de-ville.ts` ne couvre pas un patch admis aujourd'hui, revoir le § 5.
