# 0156 — Second ajout sur `mock` (pose partagée dans `src/lib`), amendement de 0155 § 2.2 et § 2.3, cause d'un refus en portée `complete`

Statut : **acceptée**. Décision du **Tech Lead** (architecture, contrats, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Définitive dès sa fusion, sans délai de veto (décision 0093). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision. Rien n'est tranché ici de ce qui revient à Samuel (Q332 : portée de R1 pour un lieu ajouté) ni au Product Owner ou à l'UX/UI (source d'un lieu à soi, textes) : ces points vont dans « Questions ».

Date : 2026-10-31 · Décideur : Tech Lead · Ticket : #981 · `main` relu : `0b75e26` · Répond à : revue de M5d-3 (PR #973, head `8ba7a3c`, branche `claude/969-m5d-3-entrees-ajout` : « moyen du second ajout sur `mock` admis en principe, décision 0156 à écrire ») ; revue consolidée de M5d-4 (PR #980, head `8f48cb1`, bloquants 1 et 2, mineur 1 ; questions 1 et 2 de la PR) ; question au Tech Lead de la PR #979 (M5d-5a, fusionnée) · **Amende 0155 § 2.2 et § 2.3** (point 2), sans les réécrire · Références : 0154 § 3 (Q762, seconde partie), 0155 § 1 et § 2, 0048 § 1 (frontière « `src/domain` n'est atteint que par `src/server` »), 0016 § 3.1 règle 4 (T4), addendum 0147 (A.7), B5-PO-6, Q332 · Code relu : `src/lib/pose-ajout.ts`, `src/lib/README.md`, `src/adapters/{mock,mock-lieux}.ts`, `src/features/sejour/{ajouter-lieu.ts,AjouterLieu.tsx}` (branche de #973) ; `src/server/generation/etapes-revision.ts` (branche de #980 : `intervalle`, `finOccupee`, `avecTempsLibre`, `ligneDuJourCoherente`, `reinjecterLieuxASoi`) ; `src/server/programme/assemblage.ts` ; `src/domain/{validation,patch,generation,temps}.ts` ; `src/contracts/retouches.ts` ; `eslint.config.mjs` ; `tests/unit/p0/imports.test.ts`.

Numérotation : `main` va jusqu'à 0155 ; aucune branche `claude/…` n'ajoute 0156 (numéro réservé par le CEO, ticket #981).

**Ce que cette décision n'engage pas.** Aucun code, aucun test touché par cette PR ; 0155 ne reçoit qu'une ligne de renvoi. Aucune dépense, aucun appel nouveau (ni Places, ni Routes), aucun compte externe, aucune migration, aucune variable d'environnement, aucune donnée Google stockée ou envoyée en plus. Aucun test supprimé ni désactivé.

## Contexte

1. **Second ajout sur `mock` (0154 § 3).** Le jeu simulé ne garde aucun ajout : l'aperçu de l'adaptateur `mock` part du jour simulé et n'affiche que le dernier lieu ajouté. 0154 § 3 exige qu'un second ajout du même jour s'ajoute au premier, que rien ne disparaisse avant un rechargement, que recharger rétablisse le jeu simulé, et que le moyen ne fasse pas de `mock` un modèle d'`api` (A.7). Elle citait, comme exemple, une mémoire dans l'adaptateur `mock`. La PR #973 a retenu une autre voie : les ajouts restent **en mémoire de la page** (réducteur `programme` du `TripShell`), et l'étape de l'aperçu `mock` est reportée sur le **jour affiché** par `apercuSurJourAffiche` (`src/features/sejour/ajouter-lieu.ts`), appelée seulement quand `versionSimulee !== null` (`AjouterLieu.tsx`). La revue a demandé une seule pose pour l'adaptateur et l'écran : la correction 1 l'a extraite dans `src/lib/pose-ajout.ts` (`poserEtapeDansJour`, avec `versMinutes` et `versHeure`), appelée par `poserAjoutSimule` (`src/adapters/mock-lieux.ts`) et par `apercuSurJourAffiche`. Un test compare, sur cinq cas, le jour rendu par l'adaptateur et par l'écran.
2. **Ce que fait la pose.** `poserEtapeDansJour(day, stop)` est pure. Elle ne calcule aucune durée (l'adaptateur `mock` fixe `end`) ni aucun trajet, et ne joue aucune règle du moteur. Un repas prend la place du repas pas encore choisi de la même heure. Sinon, l'étape est posée dans le temps libre qui la contient, coupé autour d'elle. Sans place, elle rend `null`. Elle n'importe que des **types** de `@/contracts`.
3. **Frontière.** Hors de `src/server`, `src/domain` n'est atteint que par des arêtes décidées (0048 § 1, test du graphe de `tests/unit/p0/imports.test.ts`, cas « refusé : `src/lib` → `src/lib` → `@/domain/generation` »). `src/lib` relève du bloc T4 d'`eslint.config.mjs` (ni `zod`, ni valeur de `@/contracts`, ni `src/mocks`, ni `src/server` hors actions). `src/domain/temps.ts` a son propre `versMinutes`, que l'interface ne peut pas importer.
4. **Revue de M5d-4 (#980).** Elle relève deux effets de la lecture littérale de 0155 § 2.2 et § 2.3 :
   - Un « Temps libre » est écrit sur **tout** le jour réinjecté dès que l'écart brut (début − fin occupée) atteint le seuil, y compris entre deux étapes de l'IA que le lieu ne touche pas. Or l'assemblage n'écrit de « Temps libre » qu'autour d'une ligne « Vers {ville} » et pour les pauses de l'IA. Il n'en écrit pas entre deux étapes reliées par un segment, et R8 retire trajet et marge avant de parler de trou. Un jour valide de l'IA a donc couramment des écarts bruts au-dessus du seuil qui ne sont pas des trous.
   - Le contrôle d'ordre et de chevauchement porte sur tout le jour. Un chevauchement entre deux créneaux de l'IA, sans rapport avec le lieu à soi, fait alors refuser la révision entière. La chaîne inversée ne joue pourtant pas R2. Le jeu Trevi a dû être modifié pour passer.
   La PR demandait aussi (question 2) une règle pour la fin occupée d'une étape sans heure de fin.
   Dans le code de #980, deux définitions coexistent :
   - `intervalle` : une étape sans `end` occupe son seul début. Elle sert au retrait des lignes qui chevauchent et au contrôle de chevauchement.
   - `finOccupee` : `facts.durationMinutes`, sinon la plus longue durée par défaut de sa sorte. Elle sert au « Temps libre » et au contrôle « aucun trou ».
5. **Portée `complete` de R1 (#979).** En portée `complete`, R1 exige en plus une source valide pour une étape ajoutée (`src/domain/validation.ts`, l. 131-132). Or **aucune étape ajoutée par la personne n'a de source** : `AddPlaceRequestSchema` n'en porte pas (`src/contracts/retouches.ts`, l. 182-190), et l'opération `add` d'`appliquerPatch` n'en pose pas (`src/domain/patch.ts`, l. 695-707 ; seul le remplacement pose `sourceDe(candidat)`). En portée `complete`, **tout** ajout serait donc refusé par R1 après une fiche `valide`, et le cas d'usage poserait `cause: "no_room"` (0155 § 1.2), une cause fausse. La portée par défaut est `lieu` (`PORTEE_R1_PAR_DEFAUT`, provisoire, Q332) ; `complete` n'est utilisée par aucun appelant de production.

## Décision

### 1. Second ajout sur `mock` : pose partagée dans `src/lib`, mémoire de la page (revue de #973)

**1.1 Tranché : le moyen de #973 est retenu.**
- Les ajouts sur `mock` vivent **en mémoire de la page** (réducteur du `TripShell`). Rien dans l'adaptateur `mock` ou le serveur simulé, rien dans le stockage du navigateur.
- La pose d'un lieu déjà construit a **une seule écriture** : `poserEtapeDansJour` de `src/lib/pose-ajout.ts`.
- Elle a **exactement deux appelants** : `poserAjoutSimule` (`src/adapters/mock-lieux.ts`) et `apercuSurJourAffiche` (`src/features/sejour/ajouter-lieu.ts`).
- La mémoire dans l'adaptateur, citée en exemple par 0154 § 3, est **écartée**. Elle survivrait au rechargement de la page dans le serveur simulé, ce qui contredit 0154 § 3 (« Recharger rétablit le jeu simulé »). Un nouvel ajout serait aussi posé autour d'ajouts devenus invisibles.

**1.2 Emplacement : `src/lib`, pas `src/domain`. Aucune arête nouvelle vers `src/domain` n'est décidée.**
- La pose n'est pas une règle du moteur. Elle ne fixe ni durée, ni trajet, ni rang, et n'applique aucune règle R1 à R9. La loger dans `src/domain` demanderait d'ouvrir 0048 § 1 pour `src/adapters` et `src/features`, alors que la règle de la frontière vise à garder le moteur hors du navigateur.
- Le module tient les règles de T4 : `import type` seulement depuis `@/contracts`, aucune autre dépendance, fonction pure. Il reste ainsi admis partout dans l'interface. Toute importation de valeur (Zod, constante de `@/contracts`, `@/adapters`, `@/features`, `@/server`) dans `src/lib/pose-ajout.ts` est refusée à la revue.
- `versMinutes` et `versHeure` ont désormais deux écritures : `src/domain/temps.ts` côté moteur et serveur, `src/lib/pose-ajout.ts` côté interface. Ce doublon, conséquence de la frontière, est **admis**. Une troisième écriture hors de `src/server` et de `src/domain` est refusée : le code de l'interface importe celle de `src/lib`. Les copies locales de `src/server` (`minutes` d'`etapes-revision.ts`, `minutesDe` d'`assemblage.ts`) ne sont pas traitées ici. Aucune tâche n'est ouverte pour elles.

**1.3 Ce qui vaut pour `mock` seulement, et ce qui reste à `api`.**

| | `mock` | `api` |
|---|---|---|
| Qui pose l'étape | `poserAjoutSimule` → `poserEtapeDansJour` | le moteur (`appliquerPatch`, opération `add`), après relecture et R1 (0155 § 1.2) |
| Aperçu montré | celui de l'adaptateur, reporté sur le jour affiché par `apercuSurJourAffiche` | celui du serveur, **tel quel** : il fait foi (le moteur peut replanifier d'autres étapes) |
| Mémoire des ajouts | la page (perdue au rechargement) | la version écrite, puis la lecture (B8b) |
| Annulation | `actions.undo()` de la mémoire de la page (Q762) | `applyRevert` aujourd'hui, `undoAddPlace` à M5d-6 (0155 § 4.1) |

Règles :
1. `apercuSurJourAffiche` n'est appelée que si `versionSimulee !== null`. Sur `api`, aucune transformation de l'aperçu par l'écran.
2. **Aucun module de `src/server/**` n'importe `@/lib/pose-ajout`.** `src/domain` ne le peut pas : son graphe est fermé à `@/contracts`, `zod` et `src/domain`. Le moteur reste la seule pose d'`api`. Il n'y a pas de règle ESLint nouvelle : un seul module et deux appelants nommés ne la justifient pas. La règle est vérifiée à la revue. Un troisième appelant, ou un appelant sous `src/server`, demande une décision du Tech Lead.
3. `poserEtapeDansJour` n'est pas un modèle d'`api` (A.7). Un écart entre la pose de `mock` et celle du moteur n'est pas un défaut de `mock`, et aucun test ne les compare.

**1.4 Pose impossible sur le jour affiché.** Quand `poserEtapeDansJour` rend `null` sur le jour affiché, `apercuSurJourAffiche` rend l'aperçu de l'adaptateur tel quel. Cet aperçu part du jour simulé, sans les ajouts précédents. D'après #973, les moments proposés, tirés du jour affiché (`momentsDuJour(day)`), écartent ce cas. Ce repli est **admis** tant que le cas reste inatteignable depuis l'écran. S'il devient atteignable, la réponse admise est le refus du manque de place (`no_option`, `cause: "no_room"`), jamais un aperçu qui fait disparaître un ajout précédent (0154 § 3).

**1.5 Ce que #973 doit changer (liste fermée).** Le commentaire d'`apercuSurJourAffiche` cite `src/domain/pose-ajout.ts` : il doit citer `src/lib/pose-ajout.ts`. Rien d'autre n'est demandé par cette décision. La ligne de `src/lib/README.md` est conforme.

### 2. Amendement de 0155 § 2.2 et § 2.3 (revue de #980, bloquants 1 et 2, mineur 1 ; questions 1 et 2 de #980)

**2.1 0155 § 2.2 (Temps libre réécrit) : portée limitée à la zone du lieu.** La première phrase de 0155 § 2.2 se lit désormais ainsi.

> Après le retrait des lignes qui chevauchent et la pose du lieu, un intervalle vide entre la fin **occupée** d'une ligne datée et le début de la ligne datée suivante reçoit un « Temps libre » s'il atteint `seuilTempsLibreMinutes`, **seulement si l'une de ses bornes est un lieu réinjecté, ou s'il recouvre, en tout ou en partie, la plage d'une ligne datée retirée par la réinjection** (étape de l'IA ou « Temps libre » de l'IA).

- Partout ailleurs, la ligne de l'IA est gardée telle quelle : aucun « Temps libre » nouveau, aucun prolongé, entre deux lignes que la réinjection ne touche pas.
- Le reste de 0155 § 2.2 ne change pas : règle extraite de l'assemblage (`tempsLibreEntre`), deux parts d'un temps libre coupé, écart sous le seuil.
- Aucune déduction de trajet n'est faite dans la zone du lieu : la réinjection n'a aucune durée de trajet (aucun appel Routes, 0155 § 2). Un « Temps libre » voisin du lieu peut donc inclure le trajet vers le point suivant, comme le « Temps libre » qui précède une ligne « Vers {ville} » dans l'assemblage. L'ordre des lignes livré par #980 ne change pas : le segment est juste avant le point le plus tardif du couple.

**2.2 0155 § 2.3 (cohérence de la ligne du jour) : deux familles de contrôles.**
- **Contrôles de structure, sur tout le jour réinjecté** (inchangés) :
  - terminus de début et de fin à leur place ;
  - au plus un segment entre deux points ;
  - aucun segment à travers un `transfer`.
- **Ordre et chevauchement, limités aux paires qui contiennent un lieu réinjecté.** Pour chaque lieu réinjecté L et chaque autre ligne datée X du même jour :
  - X placée avant L dans la ligne commence au plus tard au début de L, et X placée après L commence au plus tôt au début de L ;
  - L et X ne se chevauchent pas, sauf si ce sont deux étapes verrouillées dans la base (B5-PO-6, inchangé).
  Une paire de deux lignes de l'IA n'est pas contrôlée : la chaîne inversée ne joue pas R2 (0155 Contexte, point 5).
- **« Aucun trou »** : limité aux intervalles du point 2.1. Dans ces intervalles, la règle du « Temps libre » ne doit rien ajouter ni prolonger.
- `ligneDuJourCoherente` reçoit les identifiants des lieux réinjectés du jour, ou `reinjecterLieuxASoi` calcule la cohérence avec eux. Le choix revient au backend. Un jour qui ne tient pas la cohérence n'est toujours **pas** écrit : la version entière ne l'est pas (`ecrireSi` faux).
- Le jeu Trevi peut reprendre Panthéon à 10:00 – 11:00 si le cas l'exige. Ce n'est pas exigé.

**2.3 Fin d'une étape sans heure de fin (question 2 de #980) : deux usages, deux règles.**
- **Pour le « Temps libre » et le contrôle « aucun trou »** : la fin occupée d'une étape sans `end` vaut `facts.durationMinutes`, sinon **la plus longue durée par défaut de sa sorte** : `max(lunch, dinner)` pour un repas, `max(activity, evening)` pour une activité. **Admis.** L'instantané ne garde pas la nature du créneau. Cette règle ne peut que raccourcir un « Temps libre », jamais en poser un sur une occupation.
- **Pour le retrait des lignes qui chevauchent et le contrôle de chevauchement** : une étape sans `end` occupe **son seul début** (`intervalle` de #980, inchangé). Une durée supposée ne doit ni retirer une étape de l'IA ni faire refuser une révision. Rien n'est affiché de faux : l'étape n'a pas d'heure de fin à l'écran.

**2.4 Tests exigés par cet amendement** (correction de #980, `tests/unit/programme/revision.test.ts`), en plus de ceux de 0155 § 2.5, qui restent :
1. Deux étapes de l'IA voisines, écart brut de 40 min avec un segment entre elles, lieu à soi ailleurs dans le jour : aucune ligne `free` nouvelle entre elles. Le jour est cohérent.
2. Étape de l'IA retirée par le lieu : l'intervalle libéré hors du lieu est réécrit s'il atteint le seuil (test 2 de 0155 § 2.5, gardé).
3. Cohérence :
   - chevauchement entre deux étapes de l'IA sans rapport avec le lieu → `coherente` vrai, version écrite ;
   - chevauchement entre le lieu réinjecté et une étape non verrouillée dans la base → faux, rien n'est écrit ;
   - deux étapes verrouillées dans la base qui se chevauchent → vrai (inchangé).
4. Contrôles de structure sur tout le jour, testés loin du lieu : un terminus déplacé, deux segments voisins ou un segment à travers un `transfer` → faux, même loin du lieu.
5. Fin occupée sans `end` (mineur 1 de la revue) : repas et activité, avec et sans `facts.durationMinutes`, pour le « Temps libre » ; et, pour le chevauchement, une étape de l'IA sans `end` qui commence avant le lieu n'est ni retirée ni comptée comme chevauchante du seul fait de sa durée par défaut.

**2.5 Ce qui ne change pas dans 0155 § 2.** § 2.1 (segments), § 2.4 (journal `recalcul.lieux_a_soi`), § 2.5 (fichiers, prérequis, tests 1 à 8), R3, l'absence d'appel et le refus de rejouer R1, R2 et R4 à R9. Les mineurs 2 à 7 de la revue de #980 restent à la revue et ne sont pas tranchés ici.

### 3. Portée `complete` de R1 : cause du refus (question de #979)

**3.1 Tranché : aucune cause nouvelle aujourd'hui.** `NO_OPTION_CAUSES` reste `["no_room", "place_not_found", "place_closed"]`. Aucune valeur de contrat n'est ajoutée pour une portée qu'aucun appelant n'utilise. Une valeur sans producteur élargirait l'énumération partagée (M5-C) pour rien, et son nom dépendrait d'une règle que Samuel n'a pas fixée.

**3.2 Règle du Tech Lead, conditionnelle à Q332.** Si Samuel retient `complete` pour les lieux ajoutés :
1. Un refus dû à la source ne rend **jamais** `no_room`. Le texte du manque de place serait faux.
2. Une cause dédiée est ajoutée à `NO_OPTION_CAUSES` dans la même PR que le changement de portée. Son nom sera fixé à ce moment-là, sur la forme de 0155 § 1.1 (par exemple `source_missing`).
3. Elle est calculée par la même fonction que R1. `etatDuLieuAjoute`, ou une fonction voisine de `src/domain/validation.ts` que R1 utilise aussi, porte le contrôle de la source, pour que la règle reste écrite une seule fois (0155 § 1.2).
4. Ses textes reviennent au Product Owner et à l'UX/UI.

**3.3 Ce qui n'est pas tranché, et pourquoi : Q332 d'abord.** Le Contexte (point 5) montre que la question n'est pas seulement celle d'une cause. Avec le contrat d'aujourd'hui, `complete` refuserait **tout** ajout, puisque la personne ne peut donner aucune source. Retenir `complete` suppose donc de dire d'où viendrait la source d'un lieu à soi : une donnée demandée à la personne, ou une source tirée d'ailleurs. C'est une question de produit (Samuel pour Q332, le Product Owner pour le détail), pas d'architecture. Elle est renvoyée explicitement à Q332, sans la trancher.

## Conséquences

- **#973 (M5d-3)** : le moyen du second ajout est décidé (point 1). Une seule correction est demandée : le chemin dans le commentaire d'`apercuSurJourAffiche` (point 1.5). La question 2 de #973 est close.
- **#980 (M5d-4)** : les bloquants 1 et 2 de la revue ont leur règle écrite (points 2.1 et 2.2), ainsi que les questions 1 et 2 (points 2.2 et 2.3). La correction 1 suit le point 2 et ajoute les tests du point 2.4. La consignation de l'amendement demandée par la revue est faite ici, pas dans la PR.
- **0155** : § 2.2 et § 2.3 amendés par le point 2. Une ligne de renvoi est ajoutée dans 0155, sans autre changement.
- **#979 (M5d-5a)** : la question au Tech Lead est répondue (point 3). Rien à changer dans le code fusionné.
- Aucun contrat ne change, aucune tâche nouvelle n'est ouverte, aucun prérequis de M1h ne change.
- Contenu non fiable : aucun rencontré. Les PR #973, #979 et #980 et le ticket #981 viennent de Samoulou ou de branches `claude/…`.

## Questions (à reporter par le CEO dans `QUESTIONS.md`)

**Samuel** (réservée) :
1. **Q332** (rappel, complétée par le point 3) : portée de R1 pour un lieu ajouté par la personne. Fait nouveau : avec le contrat d'aujourd'hui, la portée `complete` refuserait **tout** ajout, car un lieu à soi n'a jamais de source (`AddPlaceRequest` n'en porte pas, l'opération `add` du moteur n'en pose pas). Si `complete` est retenue, la cause du refus suivra le point 3.2. Bloque : la valeur finale de la portée ; rien aujourd'hui (`lieu` par défaut).

**Product Owner** (seulement si Samuel retient `complete`) :
1. **Source d'un lieu à soi** : d'où viendrait-elle (demandée à la personne, ou autre) ? Avec l'UX/UI, quels textes pour la cause dédiée du point 3.2 ? Bloque : rien tant que Q332 n'a pas retenu `complete`.

**CEO** :
1. Transmettre le point 1.5 à #973 et le point 2 (tests du point 2.4 compris) à la correction de #980. Aucune tâche nouvelle.
