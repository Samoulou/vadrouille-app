# 0148 — Plusieurs villes sur la chaîne inversée (M4-TL) : forme `transfer`, durée estimée, couche des règles du changement de ville, ville d'un engagement, forfait ; réponses T1 à T12

Statut : **proposée, à confirmer par la revue** (forme de 0114 et 0147). Décision déléguée du **Tech Lead** (architecture, contrats, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Définitive dès sa fusion, **sans délai de veto** (décision 0093). À lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision. Les questions S-M4-1 à S-M4-4 sont posées à la Sécurité (§ 13) : elle répond dans la revue de cette PR ou par une décision à part (spécification, « Prérequis ») ; un refus ultérieur d'un point du § 13 ne rouvre pas la décision d'office, il l'amende par une décision de la Sécurité qui remplace ce seul point.

Date : 2026-10-29 · Décideur : Tech Lead · Ticket : #905 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 4, ligne M4-TL (l. 146), cycle 221 · Spécification : `specs/M4-plusieurs-villes.md` (fusionnée par #876 ; § 3.4, § 5, § 9 T1 à T12, § 10, § 12, § 15), avec le « Report du CEO (Q703) » de la description de #876 et les questions Q703, Q712 et Q718 de `QUESTIONS.md` · Revue de reprise : mineurs 1 à 5 de la dernière revue de #876, « à reporter à M4-TL ou M4-suite » (§ 11) · `main` relu : `c96f3cd` · Décisions lues : 0011, 0027 § 2, 0045 § 2.2, 0092, 0093, 0103, 0113 § 3 bis, 0114 (forme), 0115, 0116 (§ 1.6 à § 1.8, § 4, § 5.1), 0117, 0129 § 4 et § 8, 0136 (§ 1 à § 6, § 9, § 12), 0139, 0141 (§ 2.3, § 4, § 6), 0147 (forme).

Numérotation (relue le 2026-10-29) : `main` porte 0001 à 0147 ; 0148 est réservée par le CEO pour cette décision (#905).

**Précédence** (report du CEO, Q703 ; spécification § 3.4 et « Prérequis ») : sur un point que cette décision tranche, **elle prime sur la spécification** ; M4-suite pourra ensuite réviser les valeurs provisoires du changement de ville (§ 3.4 de la spécification et § 5 ci-dessous). Ordre : **M4-TL, puis M4-suite, puis la spécification**.

**Ce que cette décision n'engage pas.** Aucun argent : aucune barrière ouverte, aucun plafond réel (`PLAFONDS_USAGE` reste `null`) ; les valeurs du § 9 sont des valeurs de test de la variante simulée et une estimation de coût pour la question Samuel 4. Aucun compte externe, aucune variable d'environnement. Aucune migration. Aucun test supprimé ni désactivé (liste fermée des attentes modifiées au § 10). Aucune règle de produit n'est créée : là où le Product Owner a posé une valeur provisoire, cette décision la remplace par un **défaut technique** que M4-suite révise (§ 5), comme le report du CEO l'y autorise.

## Contexte : ce que le code permet déjà, et ce qui manque

Relevé sur `c96f3cd` :

1. **La chaîne inversée n'utilise pas le squelette.** L'IA écrit le programme, le code le vérifie et l'assemble **sans replanifier ni retirer** (`assemblerProgrammeIa`, `src/server/programme/assemblage.ts`, l. 199 ; 0115, 0116 § 1.6). `squelette()` (`src/domain/squelette.ts`, l. 86) ne sert que l'ancienne chaîne ; le « moteur » de la spécification (T11) n'est donc, pour la chaîne inversée, ni `squelette.ts` ni le planificateur, mais le code déterministe qui encadre la rédaction et contrôle sa sortie.
2. **Les nuits par logement sont déjà gérées.** `logementsDeLaJournee` (l. 177) applique `logementsDuJour` (`src/domain/relectures.ts`, 0045 § 2.2) aux nuits du brief : avec deux logements, le jour d'arrivée dans la ville 2 part déjà du logement 1 et finit au logement 2. Les terminus du § 3.1 point 2 de la spécification sont acquis.
3. **Les engagements sont des événements.** Sur la chaîne inversée, un engagement du brief devient un élément de `Day.events` (l. 275), affiché dans sa propre région « Événements du jour » de Journée (`JourneePanel.tsx`, `EventLines.tsx`), **jamais dans la ligne du jour**. `BriefEssai.engagements` (`src/server/programme/forme.ts`) n'a que `heure` ; `engagementsDuBrief` (`brief.ts`, l. 76) écarte tout vol ; `briefDepuisFormulaire` refuse `draft.otherCities` (l. 112).
4. **Vérification.** Les logements sont ancrés sur `brief.destination` et la zone de vérification est **un seul** rectangle couvrant les cercles de 30 km (`RAYON_BIAIS_METRES`, `src/grounding/ancrage.ts`, l. 15) autour de tous les logements (`ancrerLogementsDuSejour`, `src/grounding/ancrage-zone.ts`, l. 56). Chaque lieu est cherché par `« {lieu}, {ville ?? destination} »` dans cette zone (`verifierLieuxDuProgramme`, l. 119) ; `LieuProgramme` a déjà un champ `ville` facultatif.
5. **Contrats.** `DayLineItemSchema` (`src/contracts/trip.ts`, l. 171) a cinq variantes ; `DayLineItemSnapshotSchema` (`snapshot.ts`, l. 52) les reprend par référence. `Trip` n'a que `destination`. `MAX_CITIES = 4` (`values.ts`, l. 333). La vue partagée projette la ligne du jour par **liste blanche SQL** : `public.shared_line_item` (`db/migrations/0001_securite.sql`, l. 487) rend `NULL` pour tout type qu'elle ne nomme pas, et `shared_day` filtre les `NULL`.
6. **Aperçu.** `selectionApercu` et `servisAvantDeblocage` (`src/domain/apercu.ts`, l. 59 et 151) sont partagés avec le site d'essai ; `etapeEnCase` (l. 124) ne pose `segmentAvant` que si l'élément précédent est un `segment` ; `DeckCard.tsx` n'affiche la ligne `detour` qu'à l'intérieur du bloc du trajet (l. 403-409).
7. **Forfait.** Profil `programme` simulé : 600 000 micro-USD, 90 Text Search, 90 fiches, aucune requête Routes (`src/server/config/usage.ts`, l. 168 ; 0136 § 6.4). La réserve d'une requête de modèle est estimée à 20 000 micro-USD (`COUTS_ESTIMES_MICROS`, `src/server/config/generation.ts`, l. 98).

## 1. T1 — Forme du changement de ville : un élément `transfer` de la ligne du jour, par une PR de contrat M4-C

La proposition du Product Owner est retenue, avec des noms anglais comme le reste des contrats (handover back-end) : `dureeEstimee` devient `estimatedMinutes`, `source: "saisi" | "estime"` devient `"entered" | "estimated"`.

1. **Schéma** `TransferItemSchema`, dans `src/contracts/trip.ts`, ajouté à `DayLineItemSchema` et repris **par référence** dans `DayLineItemSnapshotSchema` (aucune copie) :

   ```ts
   z.strictObject({
     type: z.literal("transfer"),
     from: TextSchema,              // nom maison de la ville quittée (celui de Trip.cities)
     to: TextSchema,                // nom maison de la ville d'arrivée
     source: z.enum(["entered", "estimated"]),
     start: TimeSchema,             // départ : heure du billet ou du vol, sinon départ estimé (§ 5)
     end: TimeSchema.optional(),    // arrivée : seulement l'heure de fin saisie ; absent = « à confirmer »
     estimatedMinutes: MinutesSchema.optional(), // durée estimée (§ 2) ; absente = « durée à confirmer »
     label: TextSchema.optional(),  // libellé saisi par la personne (« Train Rome–Florence »)
     mode: z.enum(["car", "transit"]).optional(), // mode d'un départ estimé (§ 3.3 de la spécification) ; absent avec `walk` seul
   })
   ```

   Raffinement (`superRefine`) : `source: "entered"` exige `label` et interdit `estimatedMinutes` et `mode` ; `source: "estimated"` interdit `end` et `label` ; `end`, s'il est présent, est postérieur à `start`. **Aucun `placeId`, aucune donnée Google** (§ 2).
2. **Ce n'est pas une étape** : ni `Stop`, ni `Segment` (le `mode` d'un `Segment` reste `walk`, `transit`, `car`, et `Day.travelMinutes` ne le compte pas, M4-PO-11), ni un champ de `Day` (il a une place dans la ligne, § 3.2 de la spécification). Il n'a pas d'identifiant : aucun patch ne le vise (`Remplacer`, `Déplacer`, `Verrouiller` ne s'y appliquent pas).
3. **Toutes les fonctions qui parcourent `Day.items` le traitent explicitement** (le `switch` exhaustif le rend obligatoire à la compilation) : `voisinDe` et `voisins` (`src/domain/calculs.ts`, l. 83 : le `transfer` **arrête** la recherche du voisin de ce côté, qui est absent, § 7.3 de la spécification) ; `pointsDuJour` (l. 131) et le relecteur (§ 7 ci-dessous) ; `appliquerPatch` et `changements` (`src/domain/patch.ts`) le recopient tel quel ; le rendu de `DayLine` (M4c). La PR M4-C fait les cas « recopié tel quel » ; M4b et M4c font le reste.
4. **Vue partagée (S-M4-4)** : `transfer` n'est pas ajouté à `SharedDayItemSchema` (`src/contracts/share.ts`), et `public.shared_line_item` ne le nomme pas : il est **retiré par la liste blanche existante**, sans migration. Un test de M4b le vérifie (§ 10).
5. **`Trip.cities`** (T6, § 6) est ajouté par la même PR M4-C.

## 2. T2 — Source de la durée estimée : option (a), l'IA, sous contrôle ; jamais une donnée Google

1. **Retenu : (a)**, une estimation écrite par l'IA dans la sortie du prompt `programme` v5, **un nombre entier de minutes par changement de ville estimé** (pas un texte). Elle est stockée dans l'instantané en `transfer.estimatedMinutes` : c'est une donnée du modèle, comme les heures et les durées de ses étapes, **pas une donnée Google** (0011 ; l'IA ne reçoit jamais de donnée Google, 0011 § 4, spécification § 5.1). Elle est toujours affichée comme estimation (« environ {durée} (estimation) »).
2. **Contrôles de sortie** (en plus de ceux de 0117, et soumis à S-M4-2, § 13) : entier ; borné à **20 à 600 minutes** (`changementDeVille.dureeEstimeeMinutes` de `moteur.json`, § 5.5) ; arrondi aux 5 minutes ; hors bornes, illisible ou absent : **retiré**, et la ligne affiche « durée à confirmer » (spécification § 3.3). Aucune durée n'est inventée par le code. Pour un départ saisi, l'IA n'écrit pas de durée : celle d'un billet avec fin est `end − start`, donnée de la personne ; sans fin, l'arrivée reste « à confirmer » et aucune durée n'est affichée (§ 8 de la spécification).
3. **Écartées.**
   - **(b) Table maison** : sur les 62 villes, les groupes de même décalage comptent environ 41 villes (UTC+1), 12 (UTC+2) et 7 (UTC+0), soit de l'ordre de **900 paires** avant tout filtre de distance. La table des villes ne porte aucune position (`villes-mvp.json` : nom et fuseau seulement), le rayon ne peut donc pas être calculé sans nouvelle source ; et relever puis tenir à jour les temps publiés par les exploitants pose une question de conditions d'utilisation (juridique, réservé à Samuel). Coût d'entretien jugé déraisonnable pour ce lot. À revoir si les estimations de l'IA se montrent mauvaises au premier essai (« Quand revoir »).
   - **(c) Routes relu à l'affichage** : un appel payant par lecture de la journée, pour des trajets longs en transport public que Routes rend mal ; gardé en dernier recours.
   - **(d)** : exclue tant que Q637 est ouverte et que 0092 ne vaut que pour le prototype.
4. **Conséquence** : S-M4-2 est **déclenchée** ; M4a et M4b attendent la réponse de la Sécurité (§ 13, § 12).

## 3. T3 — Forfait : un voyage, un forfait ; profil `programme` unique agrandi ; aucune part par ville

1. **Forme retenue** : le profil `programme` reste **unique** et réservé **entier** à l'étape `e` (0136 § 6). Il n'y a **ni part par ville, ni part par jour**.
   - Une part par ville ne suit pas le coût, qui dépend des jours (spécification § 6) : un voyage de 2 villes et 15 jours serait sous-doté.
   - Une part par jour suivrait le coût, mais changerait la forme de `PlafondsUsageSchema` (profils fixes, `forfaitEntierReserve`) que la PR des plafonds réels (M1h) remplira avec les montants de Samuel. Elle est reportée (« Quand revoir »).
   - Le prix d'un forfait unique : un voyage court réserve plus qu'il ne consomme, comme aujourd'hui pour une ville.
2. **Valeurs de test de la variante simulée** (`PLAFONDS_VARIANTE_SIMULEE`, `src/server/config/usage.ts`, et `tests/support/plafonds-usage.ts`, alignés par `usage.test.ts`) : `programme` passe à **100 Text Search et 100 fiches** (au lieu de 90), `coutModelesMicros` inchangé (600 000), Routes à 0 ; `revision` passe aussi à **100 et 100** (toute la version est revérifiée, 0142). Base : environ 6 lieux distincts par jour (Rome, 30 lieux pour 5 jours), au plus 4 lieux un jour de changement de ville, 3 logements ; 15 jours et 3 villes : 13 × 6 + 2 × 4 + 3 = **89**, arrondi avec marge. Ce ne sont pas des montants : la barrière ne les lit jamais.
3. **Coût estimé au prix plein** (`prototype/config/prix-google.json`, relevé du 2026-10-23 ; avant les 1 000 fiches Enterprise gratuites du mois), pour la question Samuel 4 :

   | Voyage de référence | Lieux (estimés) | Logements | Text Search « IDs only » | Fiches Enterprise (0,02 USD) | Google | Modèle |
   |---|---|---|---|---|---|---|
   | 3 villes, 10 jours | 8 × 6 + 2 × 4 = 56 | 3 | 59 × 0 USD | 59 × 0,02 = **1,18 USD** | **≈ 1,2 USD** | 1 requête ; réserve estimée 0,02 USD (`COUTS_ESTIMES_MICROS`), coût réel à mesurer au premier essai |
   | 3 villes, 15 jours | 13 × 6 + 2 × 4 = 86 | 3 | 89 × 0 USD | 89 × 0,02 = **1,78 USD** | **≈ 1,8 USD** | idem, sortie environ 1,5 fois plus longue qu'à 10 jours |

   La vérification des sites ne consomme aucune part Google (0136 § 6.3), et les relectures de l'affichage restent sous les profils `relecture` (0100 § 1.3). **Point pour Samuel** : au prix plein, le plafond Google de **20 USD par mois** (0027 § 2) couvre environ **11 voyages de 15 jours** au-delà de la tranche gratuite. La décision des plafonds et de la durée maximale lui revient (question Samuel 4, § 14).
4. **Critère 21** : un voyage de 3 villes et de 15 jours (borne actuelle, sous réserve de la question 4) tient dans le forfait simulé (§ 10, test de M4b).

## 4. T4 — Trois villes au plus ; même ville deux fois de suite

1. **`MAX_CITIES` passe à 3** dans `src/contracts/values.ts` (PR M4-C), comme proposé : F8-PO-3 disait « 4, provisoire », et M4-PO-2 fixe 3. Un seul plafond pour `mock`, l'ancienne chaîne et la chaîne inversée ; le site d'essai refuse déjà toute autre ville. Une 4e ville est refusée par `TripDraftSchema` (`.max(MAX_CITIES - 1)`) sur le champ **`draft.otherCities`** (chemin rendu par `parseInput`), sans écriture (critère 2). Les tests de B9 et F8 citent `MAX_CITIES` par son nom et passent tels quels (relevé : `src/contracts/creation.test.ts`, l. 105 ; `src/features/creation/draft.test.ts`, l. 41 ; les brouillons « à trois villes » de `tests/db/creation.test.ts`, `generation-modules.test.ts` et `voyage-complet.test.ts` restent valides). C'est l'exception prévue par le critère 20.
2. **Même ville deux fois de suite** : une fonction pure unique `memeVilleQueLaPrecedente(villes)` dans `src/lib/fuseaux/index.ts`, qui compare les **clés** (`cleVille`, l. 59 : accents, casse et tirets ignorés), rend l'indice de la seconde ville. Deux appelants :
   - `controlerVilles` (l. 209), pour `createTrip` de `api` (les deux chaînes), avec une raison nouvelle `"repetee"`, testée après `"inconnue"` et avant `"decalage"` ; refus **`draft.otherCities.{i}.name`** (`champVille`), sans écriture (critère 4) ;
   - `src/features/creation/validation.ts`, pour l'erreur sous le champ de l'écran 1 (§ 8 de la spécification).

   Pas dans `checkCities` du contrat : `src/contracts` n'importe pas `src/lib/fuseaux`, et une seconde normalisation serait une copie de `cleVille`.

## 5. T11 — Qui tient les règles du changement de ville : le code (domaine et contrôle de sortie), le prompt informé ; défaut technique du départ estimé

### 5.1 Couche

Combinaison des trois, avec **une seule source de vérité, le code** (principe « l'agent cherche, l'ancrage vérifie, le moteur planifie ») :

1. **Domaine** : un module pur nouveau, **`src/domain/changement-de-ville.ts`** (aucune entrée-sortie, comme `src/domain/apercu.ts`), qui calcule de façon déterministe, depuis les villes et les engagements du brouillon (`TripCommitment`, qui portent `end`) et la configuration :
   - la liste des changements de ville (date, ville quittée, ville d'arrivée) ;
   - pour chacun, le départ saisi (règle du billet de trajet, § 6 ci-dessous) ou estimé (§ 5.2), l'arrivée saisie, le mode estimé ;
   - le **créneau occupé** par le changement de ville, pour la planification (§ 5.3) ;
   - le nombre maximal d'activités (§ 5.4) et le thème « De {ville} à {ville} ».
   `squelette.ts` n'est **pas** modifié : il ne sert que l'ancienne chaîne (Contexte, point 1).
2. **Avant le prompt** : la conversion de `api` (§ 8, T8) met ces valeurs dans l'entrée du prompt `programme` v5 (cadre de chaque journée de changement de ville : heure de départ, arrivée si connue, créneau, nombre maximal d'activités, ville de chaque moitié). L'IA les applique ; elle **n'écrit pas** la ligne « Vers {ville} » ni le thème de ce jour.
3. **Contrôle de la sortie, à l'assemblage** (`assemblerProgrammeIa`, M4b), qui **garantit** le résultat quelle que soit la sortie de l'IA :
   - il insère l'élément `transfer` (§ 1) entre les deux groupes ;
   - il range chaque créneau de l'IA par son heure de début `d` : `d` < départ → avant la ligne (ville quittée) ; `d` ≥ fin du créneau occupé → après (ville d'arrivée) ; entre les deux → **retiré** (compté dans `slotsRemoved`) ;
   - il garde, dans l'ordre écrit, au plus le nombre maximal d'activités (étapes `activity` qui ne sont pas des engagements ; les repas et les lignes `free` ne comptent pas) et retire les suivantes ;
   - il ne pose jamais le badge `toReserve` ce jour-là (spécification § 3.2) ;
   - il écrit `Day.theme` « De {ville quittée} à {ville d'arrivée} » (`texteMaison`, coupé à `LONGUEURS_CONTRAT.theme` ; trop long : absent, l'écran nomme la journée depuis `Trip.cities`, § 6) ;
   - il ajoute une ligne `free` entre la dernière ligne avant le départ et le départ quand l'écart atteint `seuilTempsLibreMinutes` (30, `moteur.json`) : pas de trou (§ 3.2 point 1 de la spécification) ; un écart plus court est une marge, renvoyée à M4-suite ;
   - il ne pose aucun `segment` entre la dernière étape avant la ligne et la première après : la première étape après l'arrivée n'a pas de segment avant elle (`travelFromPrevious` absent, § 7.3 de la spécification).

   Ces retraits **amendent 0116 § 1.6** (« sans retirer ») **pour la seule journée du changement de ville** ; les autres journées ne changent pas.
4. **Où se testent les critères 6 à 12** : dans **M4b** (tests unitaires de `changement-de-ville.ts` et de l'assemblage, puis base de données en composition simulée), sur des sorties simulées qui **violent** volontairement le cadre (activités en trop, étape dans le créneau, `aReserver` ce jour-là) pour prouver le contrôle. **M4a** mesure l'adhésion du prompt dans son jeu d'évaluation (§ 14 de la spécification), sans en faire un critère d'acceptation.
5. **Valeurs dans `moteur.json`** (proposition du Product Owner retenue) : une section nouvelle `changementDeVille`, validée par `src/domain/configuration.ts` :

   ```json
   "changementDeVille": {
     "activitesParRythme": { "relaxed": 1, "balanced": 2, "intense": 2 },
     "departEstime": { "heureParDefaut": "09:00", "limite": "18:00" },
     "creneauSansDureeMinutes": 180,
     "dureeEstimeeMinutes": { "min": 20, "max": 600 }
   }
   ```

   Test : `heureParDefaut` est dans `fenetreJour`, et `limite + creneauSansDureeMinutes` ne dépasse pas `fenetreJour.fin`.

### 5.2 Départ estimé : défaut technique (remplace la valeur provisoire du § 3.4 ; Q703, Q712)

Sans billet ni vol le jour du changement de ville, seuls des engagements « Sortie » (`booking`) peuvent rester ce jour-là. Pour chacun, sa **fin occupée** est `finOccupee` (`src/domain/squelette.ts`, l. 148) : son heure de fin, sinon la durée par défaut de sa nature (B5-PO-1 : 90 minutes pour une activité, 75 pour un déjeuner, 90 pour un dîner).

> **Départ estimé** = la plus tardive des fins occupées qui ne dépassent pas `limite` (18:00), sans descendre sous `heureParDefaut` (09:00) ; sans telle fin, `heureParDefaut`.

Écarts avec la valeur provisoire de la spécification, voulus :
- **« la fin du dernier engagement du jour s'il finit avant 18:00 »** devient **« la plus tardive des fins avant 18:00 »** : un engagement qui finit après 18:00 n'annule plus le départ tardif d'un engagement du matin (mineur 1, § 11) ;
- **sans heure de fin**, la fin occupée remplace l'heure de début : le départ n'est jamais placé au début d'une sortie en cours (une Sortie à 10:00 sans fin donne 11:30, et non 10:00).

Les variantes du critère 8 donnent les mêmes heures (aucun engagement : 09:00 ; Sortie de 10:00 à 11:30 : 11:30 ; Sortie de 17:00 à 19:00 : 09:00 ; dîner à 20:00 sans fin, fin occupée 21:30 : 09:00). Variantes ajoutées (§ 10) : Sortie de 10:00 à 11:30 **et** dîner à 20:00 → **11:30** ; Sortie à 10:00 sans fin → **11:30**.

### 5.3 Créneau occupé par la ligne « Vers {ville} » (Q703, bloquant 1)

- **Départ estimé** : de départ à départ + `estimatedMinutes` ; sans durée estimée, départ + **`creneauSansDureeMinutes` (180)**. Le créneau sert à la planification (cadre du prompt, rangement du § 5.1 point 3) ; il n'est pas affiché, et l'arrivée reste « à confirmer ».
- **Billet ou vol avec heure de fin** : de `start` à `end`.
- **Billet ou vol sans heure de fin** : **aucun créneau fixé** (spécification § 3.4 et critère 7, Q703) ; le créneau est réduit à l'heure de départ, et le rangement ne fait que l'ordre (avant ou après le départ). L'intervalle reste à M4-suite.

### 5.4 Activités et thème

Nombre maximal d'activités : `changementDeVille.activitesParRythme` (1, 2, 2 : la moitié, arrondie au-dessus, de `activitesParRythme` 2, 3, 4, spécification § 3.2), **valeurs écrites** dans `moteur.json` plutôt que calculées, pour que M4-suite les révise sans code. Thème : écrit par le code (§ 5.1 point 3).

## 6. T6 — Ville de chaque jour et de chaque étape : `Trip.cities`, lu depuis `stays`

1. **Contrat** (PR M4-C) : `Trip.cities` facultatif, `z.array(z.strictObject({ name: TextSchema, start: IsoDateSchema, end: IsoDateSchema })).min(2).max(MAX_CITIES).optional()` dans `TripBaseSchema` ; `end` exclusif (date d'arrivée dans la ville suivante, ou fin du voyage), comme les lignes `stays` (critère 1). **Absent pour un voyage à une seule ville** : tous les écrans à une ville ne changent pas par construction (critère 25), et les fixtures existantes restent valides.
2. **Source** : les lignes `stays` (une par ville, `stays.city`, déjà écrites par `createTrip`), lues par la lecture des voyages (`src/server/voyages/lecture.ts`, `sejoursParNuit`), jamais l'instantané. `SharedTripSchema` ne le reprend pas (`pick`), ni la vue SQL : la vue partagée ne change pas (§ 7.8 de la spécification).
3. **Ville d'un jour, ville d'une étape** : une fonction pure unique **`src/domain/villes-du-voyage.ts`**, appelée par le serveur et par les écrans (`src/features` importe déjà `@/domain`) : `villeDuJour(cities, date)` rend `{ ville }` pour un jour ordinaire, `{ de, vers }` pour une journée de changement de ville (date = `start` d'une ville autre que la première). Le jour d'un changement de ville, la ville **de vérification** d'une étape est la ville quittée si l'étape est avant le `transfer` de la ligne, la ville d'arrivée sinon (§ 5.3 de la spécification) ; le rangement de Séjour est la ville d'arrivée (§ 3.1 point 3).
4. Écartés : `Day.city` (redondant avec `stays`, et figé dans l'instantané) ; une recomposition sans contrat (chaque écran la referait).

## 7. T5 et T7 — Vérification par ville ; carte

### 7.1 T5 — Vérification par ville

1. **Logements** : chaque logement est ancré sur **sa** ville (`« {libellé}, {ville} »`), et non sur `brief.destination`.
2. **Zones** : une zone **par ville**, le cercle de `RAYON_BIAIS_METRES` (30 km, inchangé) autour du logement ancré de cette ville (position de fiche, en mémoire seulement, 0011) ; pour un logement `area` ou `none`, la position de la ville par le chemin existant (Text Search « IDs only » du nom de la ville et fiche, 0100 § 6.2 (c)). `ancrerLogementsDuSejour` rend les zones par ville au lieu d'un rectangle commun.
3. **Lieux** : chaque lieu est cherché par `« {lieu}, {ville de son étape} »` avec la **restriction** à la zone de cette ville, et sa fiche doit tomber dans cette zone (`dansZone`). La ville de l'étape est celle du code (§ 6 point 3), jamais une ville écrite par l'IA. **« Loin de la ville de son étape » = hors de sa zone** : la règle actuelle, appliquée ville par ville, **sans seuil nouveau**. Un lieu trouvé dans une autre ville du voyage, hors de la zone de son étape, perd son `placeId` (0116, badge « à confirmer », critère 12). Deux villes à moins de 60 km ont des zones qui se recouvrent : un lieu dans le recouvrement est gardé dans les deux ; risque accepté.
4. **Lieux distincts** : la clé d'un lieu distinct devient (nom, ville) : un même nom dans deux villes donne deux vérifications.
5. **Forfait** : inchangé dans sa forme ; `lieuxHorsPart` compte les logements de toutes les villes (`brief.logements.length`, déjà juste).

### 7.2 T7 — Carte

1. **Carte d'ensemble** : le cadrage initial est la boîte englobante de **toutes** les étapes servies et de **tous** les logements (positions de la relecture existante, jamais écrites), sans changer `StopMarker kind="overview"` ni son test ; aucun tracé entre villes, aucune couleur `quai` (critère 15). M4c.
2. **Carte de la Journée d'un changement de ville** : le tracé de la journée est coupé au `transfer` (deux suites de points) ; aucun segment entre la dernière étape avant la ligne et la première après. Même règle pour les paires de trajets du relecteur (`pointsDuJour` coupé au `transfer`) : `Day.travelMinutes` ne compte aucune paire à travers le changement de ville (§ 7.5 de la spécification).
3. Numérotation et repères par ville : M4-suite (UX/UI), inchangé.

## 8. T8 — Module partagé : deux fonctions de conversion

1. **`briefDepuisFormulaire` ne change pas** : il garde son refus de `draft.otherCities` pour le site d'essai et `p0Run` (M4-PO-1, critère 19) ; `BriefEssai` et `BriefSchema` ne changent pas, et l'égalité de types du pont `p0Run` reste vérifiée.
2. **Nouvelle fonction `briefProgrammeDepuisFormulaire(draft, brief, recit)`** dans `src/server/programme/brief.ts`, pour `api` seulement (`creer-voyage.ts`, `etapes-programme.ts`, et `voyageEtBriefSansRecit` de la révision M1b). Elle rend un **`BriefProgramme`**, déclaré dans `forme.ts` comme une **extension** de `BriefEssai` (assignable à `BriefEssai`, donc accepté par `assemblage.ts` et l'ancrage sans copie) :
   - `villes` : 1 à 3 entrées `{ nom, arrivee, nuits, logement }` (nom maison, texte du logement de `texteDuLogement` avec **sa** ville) ; `logements` reste rempli (texte et nuits dans l'ordre), pour les modules partagés ;
   - `changements` : la sortie du domaine (§ 5.1), sans libellé (§ 13, S-M4-1) ;
   - `engagements[].fin` facultatif, et **sans** les engagements qui sont devenus le changement de ville (ils ne sont ni des événements ni répétés au modèle).
   Les deux fonctions partagent les contrôles de destination, de durée et de pays (une fonction interne commune, aucune copie).
3. L'entrée du prompt v5 (`EntreeProgrammeV5`, `src/ai/entrees.ts`) est construite par une fonction de `entree.ts` à partir du `BriefProgramme` ; sa forme exacte revient à ia-recherche (M4a), sous les contraintes de cette décision : aucune donnée Google, aucun libellé de billet, durée de sortie en minutes entières.

## 9. T9 — Engagements et changement de ville

1. **Détection du départ saisi** : dans le code, de façon déterministe, **avant le prompt** (`changement-de-ville.ts`, appelé par `briefProgrammeDepuisFormulaire`). Le jour d'un changement de ville, le premier engagement `ticket` ou `flight` qui commence (ordre des heures, puis ordre de saisie) est le changement de ville ; les autres restent des engagements ordinaires (spécification § 3.3).
2. **Heure de fin** : elle atteint la couche qui planifie **hors du brief de l'essai** : le domaine lit les `TripCommitment` du brouillon, qui portent `end`. Elle entre aussi dans le `BriefProgramme` (`engagements[].fin`, § 8) pour informer le modèle. `BriefEssai` et le prompt v4 ne changent pas.
3. **Vols** : `heuresDeVol` ne change pas (il ne lit que le premier et le dernier jour, qui ne sont jamais des changements de ville, § 3.1 point 4 de la spécification). La nouvelle conversion ne retire pas le vol d'un jour de changement de ville : il devient le changement de ville. Les autres vols restent écartés comme aujourd'hui.
4. **L'engagement devenu changement de ville** n'est pas un événement de `Day.events` : il n'apparaît qu'une fois, comme élément `transfer` (`label`, `start`, `end`).
5. **Ville d'un engagement** (report du CEO, Q703, Q718) : **déduite par l'heure**, relativement au changement de ville, sans champ saisi (M4-PO-7 et § 13 de la spécification : aucun champ nouveau) ni vérification de lieu (un engagement n'a pas de lieu) : un engagement dont la fin occupée (§ 5.2) ne dépasse pas le départ appartient à la ville quittée ; tout autre engagement de ce jour, à la ville d'arrivée. Pour un départ estimé, cela revient à la règle du § 5.2 ; pour un départ saisi, le départ est l'heure du billet. Fonction `villeDeLEngagement` de `changement-de-ville.ts`. Elle n'est pas affichée (les événements n'ont pas de ville à l'écran) ; elle sert au départ estimé et aux règles de M4-suite.
6. **Couche des règles des engagements autour du changement de ville** (marges, engagement pendant le trajet, arrivée proche, chevauchement) : **la même**, le domaine (`changement-de-ville.ts`) et le contrôle de l'assemblage, valeurs dans `moteur.json` (`changementDeVille`). M4-suite en écrit les règles ; leur code suivra dans une tâche après M4-suite.
7. **Chevauchement toléré** (spécification § 3.4) : un engagement qui chevauche le créneau occupé garde son heure et reste un événement ; le contrôle de l'assemblage ne retire que des créneaux **de l'IA** (§ 5.1 point 3), jamais un engagement.

## 10. T10 et T12 — Tests ; cases de l'aperçu

### 10.1 T12 — Cases de l'aperçu

1. **Filtre des jours avant l'appel**, sans paramètre nouveau : `selectionApercu` et `servisAvantDeblocage` ne changent pas (le site d'essai non plus). Une fonction pure `joursHorsChangement(jours)` (`src/domain/apercu.ts`) retire les journées qui contiennent un `transfer` ; `cases-programme.ts` (écriture des cases, M4b) et `src/server/voyages/lecture.ts` (lecture avant le déblocage) l'appliquent avant `selectionApercu`. J1 n'est jamais un changement de ville ; une journée de changement de ville sans case reste « À débloquer » (critère 14). La règle de `retenirApercu` reste la même.
2. **Première carte après l'arrivée** : `etapeEnCase` ne pose `segmentAvant` que si l'élément précédent est un `segment` ; avec le `transfer` juste avant, il n'y en a pas : `travelFromPrevious` est absent, et `DeckCard.tsx` ne rend la ligne `detour` qu'avec le trajet (Contexte, point 6). Aucun code de plus ; un test de M4b le prouve.
3. **`context`** : le `transfer` arrête la recherche du voisin de ce côté (§ 1 point 3) ; le jour d'un changement de ville, un voisin repas de midi compte comme absent (règle provisoire de la spécification, § 7.3), dans `voisins` (`src/domain/calculs.ts`), par un paramètre « jour de changement de ville » ; rien ne change pour les autres jours.

### 10.2 T10 — Tests : liste fermée des attentes modifiées

Comme 0136 § 9, **aucun test n'est supprimé ni désactivé**. Seules ces attentes **changent** :

1. `tests/db/chaine-inversee.test.ts`, « chaine-inversee: une seule ville (otherCities refusé sur draft.otherCities sans écriture ; admis sous l'ancienne chaîne) » (l. 978) : sous `inversee`, Rome puis Florence est **accepté** (2 lignes `stays`, critère 1) ; la partie « admis sous l'ancienne chaîne » ne change pas. Le titre devient « chaine-inversee: deux villes acceptées (admis aussi sous l'ancienne chaîne) ». Le refus de `draft.otherCities` reste tenu par les tests du site d'essai (`tests/unit/p0/depuis-formulaire.test.ts`, inchangé). M4b.
2. `src/server/config/usage.test.ts` et `tests/support/plafonds-usage.ts` : profils `programme` et `revision` à 100 et 100 (§ 3 point 2), et le commentaire des montants de test de ce dernier fichier (l. 14-15 : 100 fiches, soit 2,60 et 2,70 USD). M4b.
3. `MAX_CITIES` à 3 (§ 4 point 1) : aucune attente écrite ne change (elles citent la constante) ; si M4-C en trouve une qui écrit « 4 » ou quatre villes en dur, elle la liste dans sa PR en citant ce point.

Sont **étendues** (ajouts seulement) : les listes de variantes de `DayLineItemSchema` et de l'instantané (`src/contracts/*.test.ts`), `share.test.ts` (un `transfer` n'apparaît pas), les tests de `voisins`, `pointsDuJour` et `appliquerPatch` (un `transfer` est ignoré ou recopié). Toute autre attente modifiée est un écart à justifier dans la PR qui la touche, revu par le Tech Lead.

**Tests nouveaux demandés** (noms de la spécification, critères 1 à 25), plus :
- `changement de ville: départ estimé, sortie du matin et dîner du soir` (11:30) et `… sortie sans fin` (11:30), § 5.2 ;
- `changement de ville: créneau de l'IA retiré` (étape de l'IA dans le créneau occupé), `… activités au-delà du rythme retirées`, `… aucun toReserve ce jour-là`, § 5.1 ;
- `changement de ville: durée estimée hors bornes → durée à confirmer`, § 2 ;
- `changement de ville: l'engagement devenu transfer n'est pas un événement`, § 9 point 4 ;
- `plusieurs-villes: transfer absent de la vue partagée` (base de données, `shared_day`), § 1 point 4 ;
- `plusieurs-villes: Trip.cities absent pour une ville`, § 6 point 1 ;
- `plusieurs-villes: révision d'un voyage à deux villes` (M1b relit le `BriefProgramme`, le `transfer` est recopié), § 8 point 2.

## 11. Mineurs de la dernière revue de #876

1. **Dernier engagement du jour, sans notion de ville** (Tech Lead) : **tranché** par le § 5.2 (plus tardive des fins avant 18:00, fin occupée) et le § 9 point 5. Le dîner à 20:00 n'efface plus la Sortie du matin : départ vers 11:30. Le changement de comportement est écrit ici ; la spécification n'est pas modifiée (précédence).
2. **Alignement non mesurable, critère 13** (Tech Lead et UX/UI) : **méthode de test tranchée** (les tests sont du Tech Lead). Le critère 13 se vérifie dans un **test navigateur** (Playwright, `tests/e2e/`, adaptateur `mock`, fixture à deux villes dont « Saint-Jacques-de-Compostelle », hors des 62, sans `createTrip`), à **390 px** de large : jsdom ne mesure pas la mise en page. Mesures : l'écart entre l'axe vertical (centre en y de la boîte) de la pastille, celui de l'état du jour et celui de la mini-ligne est **au plus 1 px** ; la légende n'a pas de troncature (`scrollWidth ≤ clientWidth`, aucun `text-overflow`) ni de débordement horizontal de la page. Le cas « deux lignes » se teste avec la légende « De Saint-Jacques-de-Compostelle à Florence » (hauteur de la légende ≥ 2 hauteurs de ligne) ; « Saint-Jacques-de-Compostelle » seul se teste « sans troncature ni débordement », sans exiger deux lignes. La **formulation** du critère dans la spécification est renvoyée à **M4-suite** (Product Owner avec UX/UI) ; d'ici là, cette méthode fait foi.
3. **Disposition ouverte** (UX/UI) : **non tranchée ici** : c'est un rendu d'écran, qui revient à l'UX/UI (M4-PO-12). Renvoyé à **M4-suite** ; si M4-suite n'est pas fusionnée avant M4c, l'UX/UI tranche dans la PR de M4c (rôle associé). Contraintes techniques seulement : la mesure du point 2 doit passer, et la rangée sans légende garde `items-center` (critère 25 : tests existants de l'écran 5 inchangés).
4. **Ordre d'affichage avec le chevauchement toléré** (Tech Lead et UX/UI) : **tranché** pour la partie technique : sur la chaîne inversée, un engagement est un événement de `Day.events`, rendu dans sa région « Événements du jour », **jamais dans la ligne du jour** (Contexte, point 3). La ligne du jour suit l'**ordre de position** (§ 3.2 de la spécification, ordre écrit de 0116 § 1.7), jamais un tri par heure ; la ligne « Vers {ville} » y est placée par le § 5.1. Un engagement à 17:00 et une ligne à 09:00 ne sont donc jamais à départager dans une même liste. Le test du critère 8 ne porte que sur l'heure du départ. Si M4-suite veut faire entrer les engagements dans la ligne du jour, ce sera sa règle (UX/UI pour le rendu).
5. **Harmonisation** (Tech Lead) : **tranché** : la source de la ville d'un engagement est une **donnée d'entrée** des règles autour du changement de ville, pas une de ces règles ; M4-TL la fixe (§ 9 point 5) et dit la couche (§ 9 point 6), M4-suite écrit les règles qui s'en servent. Les lignes 439 et 442 de la spécification ne se contredisent donc pas ; M4-suite peut le reformuler en une phrase.

## 12. Découpage confirmé, avec une PR de contrat M4-C

Une tâche = une branche `claude/<id>-<slug>` = une PR. Toutes citent `specs/M4-plusieurs-villes.md` **et** cette décision. **Exception à « une tâche = une spécification »** (`CLAUDE.md`) : M4-C, M4a, M4b et M4c partagent la spécification M4 et cette décision, comme M1a (0136 § 12) et M5 (0147 § 14) ; **à accorder par le CEO** (§ 14). Composition simulée partout, barrière fermée, tests de base de données en CI.

| ID | Tâche | Rôle | Prérequis | Fichiers principaux |
|---|---|---|---|---|
| **M4-C** (nouvelle) | **PR de contrat** : `TransferItemSchema` dans `DayLineItemSchema` et l'instantané (§ 1), `Trip.cities` (§ 6), `MAX_CITIES = 3` (§ 4), cas « recopié tel quel » des fonctions qui parcourent `Day.items` (`patch.ts`, `calculs.ts`), jeu `mock` à deux villes, lignes du handover. Aucun cas d'usage, aucun écran. | backend | cette décision | `src/contracts/{trip,snapshot,values}.ts`, `src/domain/{patch,calculs}.ts`, `src/mocks/`, `docs/handovers/backend.md` |
| **M4a** | Prompt `programme` v5 multi-villes (cadre des journées du § 5.1 point 2, durée estimée en minutes, § 2), lecture tolérante de sa sortie, jeu d'évaluation (Rome puis Florence avec billet ; Lisbonne puis Porto en départ estimé ; Paris, Lyon, Marseille au rythme « intense »), sorties simulées | ia-recherche | cette décision ; **réponse de la Sécurité à S-M4-2** | `src/ai/prompts/` (v5), `src/ai/entrees.ts`, `src/ai/sorties.ts`, jeu d'évaluation, `tests/unit/ia/prompts-sentinelles.test.ts` |
| **M4b** | Domaine `changement-de-ville.ts` et `villes-du-voyage.ts`, section `changementDeVille` de `moteur.json`, `briefProgrammeDepuisFormulaire`, `memeVilleQueLaPrecedente` et `controlerVilles`, vérification par ville (§ 7.1), assemblage et contrôle (§ 5.1), cases (§ 10.1), lecture (`Trip.cities`, relecteur coupé au `transfer`), révision M1b, profils simulés (§ 3), fixtures simulées à deux et trois villes, tests des critères 1 à 12, 19 à 21 et du § 10 | backend | M4-C, M4a ; **réponses de la Sécurité à S-M4-1, S-M4-2 et S-M4-4** | `src/domain/`, `src/server/config/moteur.json`, `src/server/programme/`, `src/lib/fuseaux/index.ts`, `src/server/creation/creer-voyage.ts`, `src/server/generation/{etapes-programme,etapes-revision,cases-programme}.ts`, `src/server/composition/generation.ts`, `src/grounding/ancrage-zone.ts`, `src/server/voyages/lecture.ts`, `src/server/config/usage.ts`, `tests/db/` |
| **M4c** | Écrans (§ 7 de la spécification) : écran 1 (villes, aide, erreurs, annonces), écran 5 (pastille et légende), écran 6 (cartes), Séjour (liste et carte cadrée), Journée (ligne « Vers {ville} », carte coupée), `DayBadge` (prop facultative), textes, tests des critères 13 à 18, 22, 23 et 25 | frontend avec UX/UI | M4b ; **réponse de la Sécurité à S-M4-3** pour la seule recherche de ville des autres villes | `src/features/{creation,preparation,presentation,sejour}/`, `src/components/ligne/`, `src/i18n/fr/{creation,sejour,presentation}.json`, `tests/e2e/` |

**Ordre** (le CEO le place dans les cycles) : M4-C et M4a en parallèle (fichiers distincts), puis M4b, puis M4c. M4-suite (Product Owner) peut s'écrire dès la fusion de cette décision ; elle ne bloque ni M4a, ni M4b, ni M4c. Aucune tâche `db/migrations`.

## 13. Questions à la Sécurité (§ 10 de la spécification)

- **S-M4-1** (bloque M4b) : textes des logements de 2 ou 3 villes envoyés au fournisseur de modèles (entrée v5) et à Text Search (`« {libellé}, {ville} »`), comme le logement unique aujourd'hui. **Réduction proposée** : le libellé de l'engagement devenu changement de ville **n'est pas envoyé** au modèle (seules ses heures et la source le sont, § 8 point 2) ; les autres libellés d'engagements le sont comme aujourd'hui (second point de Q660), avec `fin` en plus. Le verdict 0139 couvre-t-il ce cas tel quel, avec Q636 et Q645 ?
- **S-M4-2** (déclenchée par le § 2 ; bloque M4a et M4b) : la durée estimée est un **nombre** de la sortie du modèle, contrôlé (entier, 20 à 600 minutes, arrondi à 5, retiré sinon), stocké dans l'instantané et affiché toujours comme estimation. Ces contrôles suffisent-ils, en plus de ceux de 0117 ?
- **S-M4-3** (bloque seulement la recherche de ville des autres villes, dans M4c) : inchangée. Le Tech Lead ne propose **aucun** changement de plafond : 3 villes au plus, sous le plafond commun de 0141 § 2.3 et le débit par adresse de 0141 § 4 point 1. Le risque d'épuisement accepté (0141 § 4 point 6) change-t-il ?
- **S-M4-4** (bloque M4b) : le `transfer` est retiré de la vue partagée par la liste blanche existante (`shared_line_item` ne le nomme pas, § 1 point 4), sans migration, et `Trip.cities` n'y entre pas (§ 6 point 2). Confirmation demandée, avec le test du § 10.2.
- **Nouvelle, S-M4-5** (non bloquante) : les fins d'engagements (`fin`) rejoignent l'entrée du modèle (§ 8 point 2) ; ce sont des heures saisies par la personne. À confirmer dans la même réponse que S-M4-1.

## 14. Questions nouvelles, par destinataire (à reporter par le CEO dans `QUESTIONS.md`)

**Samuel** (réservées : argent, offre ; rien n'est tranché ici) :
1. **Question 4 de la spécification, avec la réponse à T3** : coût estimé au prix plein d'un voyage de 3 villes, ≈ 1,2 USD de Google pour 10 jours et ≈ 1,8 USD pour 15 jours, plus une requête de modèle (§ 3 point 3) ; au prix plein, le plafond Google de 20 USD par mois (0027 § 2) couvre environ 11 voyages de 15 jours au-delà de la tranche gratuite. Quelle durée maximale sous la chaîne inversée, et quels plafonds ? Bloque : les plafonds réels de M1h pour ces voyages et la borne du critère 21 ; ne bloque pas M4a à M4c.
2. Questions 1 à 3 de la spécification (plafonds, prix, Q636) : inchangées, rappelées.

**Product Owner, pour M4-suite** :
1. **Q710, complétée** : le défaut technique du départ estimé (§ 5.2 : plus tardive des fins occupées avant 18:00, sinon 09:00) et le créneau de 180 minutes sans durée (§ 5.3) remplacent les valeurs provisoires ; les confirmer ou les réviser.
2. Ville d'un engagement déduite par l'heure (§ 9 point 5) : à reprendre dans les règles d'engagements de M4-suite ?
3. Créneaux de l'IA placés dans le créneau occupé : retirés (§ 5.1 point 3) ; activités au-delà du maximum : les dernières de l'ordre écrit retirées. Accepté, ou une autre règle (déplacement, priorité aux incontournables) ?
4. Ligne « Temps libre » avant le départ seulement à partir de 30 minutes d'écart (`seuilTempsLibreMinutes`) ; un écart plus court est une marge : à fixer avec les marges.
5. Durée estimée par l'IA bornée à 20 à 600 minutes (§ 2) ; hors bornes, « durée à confirmer ». Accepté ?
6. Formulation du critère 13 (mineur 2, § 11) : « De Saint-Jacques-de-Compostelle à Florence » pour le cas sur deux lignes, et « sans troncature ni débordement » pour le nom seul.
7. Mineurs 3 et 4 de #876 (§ 11) : disposition de la rangée de l'écran 5 (UX/UI) ; entrée éventuelle des engagements dans la ligne du jour.

**UX/UI** : disposition de la rangée de jour de l'écran 5 (mineur 3, § 11), au plus tard dans la PR de M4c.

**Sécurité** : S-M4-1 à S-M4-5 (§ 13).

**CEO** : exception « une spécification, plusieurs tâches » pour M4-C, M4a, M4b et M4c (§ 12) ; **tâche nouvelle M4-C** à ouvrir et à placer avant M4b ; ticket M4-suite à ouvrir dès la fusion de cette décision (spécification § 14) ; Q703, Q712 et Q718 répondues par les § 5.2, § 5.3 et § 9 point 5.

## Conséquences

- Une PR de contrat (M4-C) avant le code ; aucune migration, aucune variable d'environnement, aucun argent engagé, aucune barrière ouverte.
- Les règles du changement de ville ont **une** source, le code (`src/domain/changement-de-ville.ts` et `moteur.json`) ; le prompt v5 en est informé, l'assemblage les garantit. M4-suite révisera des valeurs de configuration, pas une couche.
- Aucune donnée Google n'est écrite : la durée estimée vient du modèle, la durée saisie de la personne, et les positions des zones par ville restent en mémoire (0011).
- La vue partagée, le site d'essai, `p0Run` et le prompt v4 ne changent pas.
- `MAX_CITIES` vaut 3 partout, et la même ville deux fois de suite est refusée par `createTrip` sur les deux chaînes de `api`.

## Quand revoir

- À la réponse de la Sécurité (§ 13), de Samuel (question 4) et du Product Owner (M4-suite, § 14).
- Au premier essai réel de Samuel : si les durées estimées de l'IA se montrent fausses, revoir T2 (table maison, option (b), avec la question juridique à Samuel) ; si les lieux d'un jour de changement de ville sont souvent retirés, revoir le contrôle du § 5.1 avec M4-suite.
- Si Samuel fixe des plafonds par voyage serrés : revoir une part du forfait par jour (§ 3 point 1).
- À M4d (plusieurs fuseaux) : `Trip.cities` et `transfer` recevront leur fuseau, et le § 5 sera relu.
- Aux trains de nuit (lot ultérieur) : la règle du billet de trajet (§ 9 point 1) ne lit que le jour du changement de ville.
