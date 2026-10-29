# M4 — Plusieurs villes dans un même voyage (chaîne inversée, vraie app, même décalage horaire)

Rédaction : Product Owner · Date : 2026-10-29 · `main` relu : `e428115` (0141 fusionnée en `9abf68e`) · Ticket : #872 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 4, ligne M4-spec · Rôles des tâches qui suivent : tech-lead (M4-TL), ia-recherche (M4a), backend (M4b), frontend avec UX/UI (M4c) · Revue : Tech Lead, Sécurité, UX/UI.

**Correction 1** (revue consolidée du head `320366f`, Tech Lead) :
- bloquant 1 : renvois à 0141 revérifiés après sa fusion (§ 4.2, § 10) ;
- bloquant 2 : règle du billet de trajet (§ 3.3, M4-PO-7), et heure de fin absente du brief (T9) ;
- bloquant 3 : propriétaire des règles du changement de ville posé à M4-TL (T11) ;
- bloquant 4 : l'ancienne M4-PO-10 devient la question Samuel 4 ;
- bloquant 5 : une seule règle de prérequis ;
- mineurs 6 à 16.

**Correction 2** (revue consolidée du head `618250e`, Tech Lead et UX/UI ; arbitrages du CEO) :
- bloquant 1 : carte d'ensemble à plusieurs villes (§ 7.4, critère 15) ;
- bloquant 2 : présentation, écran 6 (§ 7.3, M4-PO-9 amendée, critère 14) ;
- bloquant 3 : un mot par sens (« Vers {ville} » pour le changement de ville, « temps de trajet » réservé à `Day.travelMinutes`), ordre et `kind` des bandeaux (§ 7.6, § 8) ;
- mineurs 4 à 15 :
  - textes et aide (§ 8) ;
  - bandeau en `conflict` (§ 7.6) ;
  - accessibilité (critère 22) ;
  - noms accessibles et 390 px (§ 7.7) ;
  - titres de l'écran 11 (§ 7.5) ;
  - train de nuit (§ 3.3) ;
  - marge courte (§ 3.4) ;
  - critère 21 et question Samuel 4 ;
  - départ « vers 10:00 (estimation) » (§ 3.3) ;
  - ville d'une étape le jour du changement (§ 5.3) ;
  - critères 7, 8, 11, 12 et 18 ;
  - 0141 § 6.4 et préfixe S-M4.

**Correction 3** (revue consolidée du head `129de42`, UX/UI et Tech Lead ; tentative bornée, Q690) :
- bloquant 1 : Séjour à une seule ville inchangé (§ 7.4, § 7.5, M4-PO-10, critère 25) ;
- bloquant 2 : sur l'écran 5 et les cartes de l'écran 6, la journée du changement de ville est toujours nommée « De {ville} à {ville} » (§ 3.1 point 3, § 5.3, § 7.3, critère 14) ;
- mineurs 3 à 15, par numéro de la revue :
  - 3 et 4 : carte d'ensemble et carte de la Journée (§ 7.4, depuis renvoyées à M4-suite par la correction 4) ;
  - 5 : résumé de Séjour sur deux lignes (§ 7.5) ;
  - 6 : `{heure}` du départ estimé (§ 8) ;
  - 7 : `{n}` des annonces et aide existante (§ 7.1, § 8) ;
  - 8 : nom accessible de `DayBadge` (§ 7.7) ;
  - 9 : focus après un retrait (§ 7.1) ;
  - 10 : critère 22 ;
  - 11 : `context` et `detour` après l'arrivée (§ 7.3) ;
  - 12 : citation de 0141 (§ 4.2) ;
  - 13 : chevauchement défini et arrivée proche (§ 3.4, depuis renvoyés à M4-suite par la correction 4) ;
  - 14 : critère 18 ;
  - 15 : critère 8, « après le critère 1 ».

**Correction 4 : découpage** (revue consolidée du head `4d771bb`, Tech Lead et UX/UI ; décision du CEO **Q697** : découper plutôt que corriger une quatrième fois) :
- renvoyés à une spécification suivante, **M4-suite**, que le Product Owner écrira après la décision M4-TL (§ 15) :
  - les règles de planification de la journée du changement de ville (ancien § 3.4, marges et départ estimé de l'ancien § 3.2), d'où les bloquants 3, 4 et 5 et le mineur 9. Le départ estimé et le créneau sans durée ont depuis été repris par la correction 5, avec des valeurs provisoires (§ 3.4) ;
  - la numérotation, les repères et les étiquettes de la carte d'ensemble à plusieurs villes, et la carte de la Journée d'un changement de ville (§ 7.4), d'où le bloquant 1 et le mineur 10 ;
- bloquant 2 : ville de l'écran 5 seulement « dès que le voyage a plus d'une ville » (§ 7.2, M4-PO-9, critère 13) ;
- mineurs 6 et 7 : nom accessible de `DayBadge` et de la mini-ligne (§ 7.7, § 8, critère 17) ;
- mineur 8 : citation exacte de 0141 § 4 point 5 (§ 4.2) ;
- mineur 9 : le seuil de 30 minutes part avec l'ancien § 3.4 ;
- mineur 10 : carte d'ensemble inchangée, forme renvoyée à UX/UI dans M4-suite ; `ink-2` est le token existant (§ 7.5) ;
- mineur 11 : traçabilité de la correction 3 ci-dessus.

**Correction 5** (revue consolidée du head `042c5d6`, Tech Lead et UX/UI ; correction bornée, la dernière, décision du CEO avec le Tech Lead) :
- bloquant 1 : heure du départ estimé et créneau sans durée, valeurs provisoires du Product Owner (§ 3.3, § 3.4, § 15, critère 8) ; M4-TL ne fixe que la couche ;
- bloquant 2 : ville de la rangée de jour de l'écran 5 portée par la pastille `DayBadge size="sm"`, et légende visible `aria-hidden` (§ 7.2, § 7.7, § 8, critères 13 et 17) ;
- mineurs 3 à 7 (correction 5) : `end` facultatif et durée estimée dans T1 ; contexte propre du critère 7 ; renvois à M4-suite par le § 3.4 et le § 15 seulement ; déjeuner de `context` marqué provisoire (§ 7.3, critère 14, M4-PO-9) ; rendu intermédiaire de la carte noté au § 15, et « rangée de jour de l'écran 5 » (§ 7.7, § 8).

**Report du CEO, Q703** (revue du head `baa6610` ; modification non comptée) : la spécification est fusionnée avec ses points ouverts reportés à M4-TL :
- bloquant 1 : le créneau provisoire de 3 heures ne vaut que pour un départ estimé sans billet ni vol ; il est retiré du critère 7. L'intervalle d'un billet sans heure de fin reste renvoyé à M4-suite (§ 15) ;
- bloquant 2 : le départ estimé est borné (ville quittée, avant 18:00, sinon 09:00), et M4-TL peut remplacer ces bornes (§ 3.4, T11, critère 8) ;
- mineurs 3 à 9 : T9 en « comment », renvois par le § 3.4, historique de la correction 4, extension de `DayBadge`, texte masqué lu par le lecteur d'écran, disposition et style de la rangée de jour (§ 7.2, § 7.6, § 7.7, T9, T11, critères 13 et 17).

**Vocabulaire.** Dans cette spécification et dans l'interface :
- le **changement de ville** est le passage d'une ville à la suivante, et la **journée du changement de ville** est le jour où il a lieu. À l'écran, il s'appelle « Vers {ville} » ;
- le mot « trajet » ne nomme à l'écran que les temps de trajet entre étapes (`Day.travelMinutes`, `Segment`).

Dans les noms de code proposés (`transfer`) et dans la règle « du billet de trajet », « trajet » garde son sens courant.

## Prérequis

Une seule règle, tâche par tâche :

| Tâche | Attend |
|---|---|
| M4-TL (décision du Tech Lead, cycle 221 du plan) | la fusion de cette spécification |
| M4a (prompt `programme` v5, jeu d'évaluation, cycle 222) | M4-TL. Elle attend aussi l'avis de la Sécurité sur **S-M4-2**, mais seulement si M4-TL retient l'option (a) de T2 (durée écrite par l'IA) |
| M4b (vérification et assemblage par séjour, cycle 223) | M4-TL, M4a, et l'avis de la Sécurité sur **S-M4-1** et **S-M4-4** (et sur **S-M4-2** si elle est déclenchée) |
| M4c (écrans, cycle 224) | M4b. L'ouverture de la recherche de ville pour les autres villes attend aussi l'avis de la Sécurité sur **S-M4-3**. Le reste de M4c ne l'attend pas |

Aucun code ne commence avant la fusion de M4-TL. Si M4-TL change un point de cette spécification, sa décision prime pour ce point. La Sécurité répond dans la revue de M4-TL ou par une décision à part. Les questions S-M4-1 à S-M4-4 n'ont rien à voir avec les actions S1 à S7 de Samuel du plan (§ 11).

**Écarts relevés dans le ticket**, sans effet sur le fond :
- le refus de `draft.otherCities` n'est pas dans `src/server/validation/depuis-formulaire.ts`, qui n'existe pas. Il est dans `briefDepuisFormulaire` (`src/server/programme/brief.ts`, l. 112), déplacé par M1a-1 (0136 § 1.1) et réexporté par `src/server/p0/depuis-formulaire.ts` ;
- les plafonds de la chaîne inversée sont l'objet de **Q639** (question 6 de la PR #829). **Q636** porte sur le récit et le logement envoyés au fournisseur de modèles. Les deux sont citées au § 6.

## 1. Contexte

- **Ce qui existe.**
  - Le contrat et la base gèrent déjà plusieurs villes :
    - `TripDraft.otherCities` (`src/contracts/creation.ts`), borné par `MAX_CITIES = 4` de `src/contracts/values.ts`, l. 280, donc 3 autres villes au plus ;
    - une ligne `stays` par ville, écrite par `createTrip` (`src/server/creation/creer-voyage.ts`).
  - L'écran 1 demande un logement par ville (F8-PO-3). Les villes se suivent sans trou ni chevauchement : chaque ville se termine le jour d'arrivée dans la suivante, avec au moins une nuit par ville (F8-PO-3, `checkCities`).
  - Le brief de la chaîne inversée a déjà une liste de logements avec leurs nuits (`BriefEssai.logements`, 1 à 5, `src/server/programme/forme.ts`).
  - Le contrôle des villes de `api` (`controlerVilles`, `src/lib/fuseaux/index.ts`) exige deux choses :
    - chaque ville est l'une des 62 de `villes-mvp.json` ;
    - elle a **le même décalage horaire** que la destination pendant les dates du voyage (B9-PO-18, assoupli par 0087 § 5).
- **Ce qui manque.**
  - La chaîne inversée refuse toute autre ville : `briefDepuisFormulaire` rend `draft.otherCities`, et `createTrip` refuse le brouillon avant toute écriture (M1a-PO-3, 0136 § 3.8).
  - Le prompt `programme` v4 n'écrit qu'une ville. `squelette()` (`src/domain/squelette.ts`) suppose un seul séjour.
  - Aucune règle ne dit ce que contient la journée d'un changement de ville.
  - La décision 0092 (temps de trajet conservés) ne vaut que pour le prototype, et Q637 (temps de trajet du MVP) est ouverte.
- **But de M4.** Dans la vraie app (`DATA_ADAPTER=api`, `CHAINE_APERCU = "inversee"`), il s'agit de :
  - accepter un voyage de 2 ou 3 villes du même décalage horaire ;
  - écrire un programme qui passe d'une ville à l'autre par une **journée du changement de ville** ;
  - le montrer à l'écran 1, à l'écran 5, dans la présentation, dans Séjour et dans Journée.

  Tout se développe et se teste en composition **simulée**, sans appel payant (barrière B9-TL-8 fermée).

## 2. Parcours

1. **Saisie** (écran 1, `/voyages/nouveau`).
   - La personne saisit sa destination, ses dates et son logement, comme aujourd'hui.
   - Sous « Autres villes », « Ajouter une ville » ajoute une ville. Chaque ville a un nom, une date d'arrivée et sa propre question « As-tu déjà un logement ? ».
   - Il y a **3 villes au plus en tout**, destination comprise (M4-PO-2). Au plafond, « Ajouter une ville » est indisponible (`aria-disabled`, règle actuelle de `ADD_BUTTON_CLASS`).
2. **Ordre.** C'est l'ordre de saisie :
   - la destination est la ville 1 et commence à l'arrivée du voyage ;
   - chaque ville ajoutée commence à sa date d'arrivée, au moins une nuit après celle de la ville précédente ;
   - ce lot ne propose pas de réordonnancement : pour changer l'ordre, la personne retire une ville et la rajoute (« Retirer », vocabulaire actuel).
3. **Nuits par ville.**
   - Elles se déduisent des dates : de l'arrivée dans la ville jusqu'à l'arrivée dans la suivante, ou jusqu'au départ du voyage pour la dernière.
   - Il faut **au moins une nuit par ville** (F8-PO-3, inchangé).
   - Le récapitulatif « Tes villes » affiche les plages (texte actuel `villes.plage`).
   - La durée totale reste bornée à 15 jours (`PROTOTYPE_STAY_DAYS_MAX`, 0136 § 3.8 ; M4-PO-3), sous réserve de la question Samuel 4.
4. **Logement par ville.**
   - Chaque ville a sa réponse (« Oui », « Un quartier », « Pas encore »), avec les mêmes règles que la destination.
   - Sous la chaîne inversée, chaque logement devient une entrée de `logements` du brief : le texte de `texteDuLogement`, avec le nom de **sa** ville, et le nombre de nuits de cette ville.
   - Il est vérifié sur Google comme le logement unique d'aujourd'hui (0136 § 3.2 : `stays.place_id` pour `known` et `suggestedLodging` seulement).
5. **Billets entre villes.** Une aide nouvelle explique la règle du billet de trajet (§ 3.3 ; texte et moment d'affichage au § 7.1 et au § 8). Aucun champ nouveau n'est ajouté à l'écran 1 (M4-PO-7).
6. **Lancement.**
   - `createTrip` revérifie les villes : nombre, ordre, nuits, table des 62, décalage horaire, même ville deux fois de suite.
   - La chaîne inversée démarre ensuite comme pour une seule ville (0136 § 2).
7. **Écran 5, présentation et déblocage** : comme pour une seule ville, avec les ajustements du § 7.2 et du § 7.3 (M4-PO-9).
8. **Séjour et Journée** : le jour par jour est groupé par ville, et la journée du changement de ville montre le passage d'une ville à l'autre (§ 7).

## 3. Journée du changement de ville

**Qui tient ces règles.** Le § 3 fixe des **règles de produit**, c'est-à-dire ce que la personne doit voir. Il ne dit pas quelle couche les garantit. Ce peut être :
- le prompt `programme` v5 ;
- le moteur (`squelette.ts`, `moteur.json`) ;
- un contrôle de la sortie de l'IA ;
- ou une combinaison des trois.

C'est la question **T11** à M4-TL, et **la réponse de M4-TL fait foi**. Les critères 6 à 12 se testent dans la couche qu'elle désigne. Les mentions « par le code » ci-dessous sont des propositions du Product Owner, pas des décisions.

**Ce que cette spécification ne fixe pas** : voir le § 3.4.

### 3.1 Définition (M4-PO-6)
1. Il y a **un changement de ville par ville ajoutée**, à la date d'arrivée de la ville 2, puis de la ville 3. Un voyage de 3 villes en a donc deux.
2. La journée du changement de ville **appartient aux deux villes**. Elle commence au logement de la ville quittée (terminus `start`, libellé de ce logement) et se termine au logement de la ville d'arrivée (terminus `end`, libellé du nouveau logement). C'est la seule journée dont les deux terminus diffèrent.
3. **Rangement et nom.** Trois règles, une par usage, qui ne se contredisent pas :
   - **Séjour, jour par jour** : la journée est rangée sous la ville **où l'on dort** ce soir-là, donc la ville d'arrivée, comme la ligne `stays` qui commence ce jour-là (§ 7.5) ;
   - **nom affiché** : sur l'écran 5, sur toutes les cartes de l'écran 6 et sur la pastille du jour, la journée s'appelle toujours « De {ville quittée} à {ville d'arrivée} », quelle que soit l'heure de l'étape (§ 7.2, § 7.3) ;
   - **vérification des lieux** : la ville d'une étape de ce jour est celle du § 5.3. Cette règle ne sert qu'à la vérification et ne s'affiche jamais.
4. Le premier et le dernier jour du voyage ne sont jamais des journées de changement de ville :
   - la ville 2 arrive au plus tôt le lendemain de l'arrivée du voyage ;
   - la dernière ville a au moins une nuit.

### 3.2 Ce qu'elle contient (M4-PO-6)
Dans l'ordre de la ligne du jour :
1. **Avant le départ, dans la ville quittée.** La ligne part du logement, puis montre les étapes de la ville quittée, ou une ligne « Temps libre » (`free`) jusqu'au départ : il n'y a jamais de trou.
2. **La ligne « Vers {ville} »**, avec le mode, l'heure et la durée (§ 3.3).
   - Ce n'est **pas une étape** : elle n'a pas de fiche, pas de numéro sur la carte, et ni « Remplacer », ni « Déplacer », ni « Verrouiller ».
   - Elle occupe son créneau : il n'y a pas de trou dans le programme (principe produit 4).
3. **Après l'arrivée, dans la ville d'arrivée.** Les étapes de la ville d'arrivée, puis le retour au nouveau logement.

**Règles de remplissage.** Elles sont provisoires et révisables après le premier essai de Samuel. Si M4-TL les met dans le moteur, le Product Owner propose de les placer dans `moteur.json`, à côté de `activitesParRythme` (T11).
- **Activités.**
  - **Au plus** la moitié des activités d'un jour plein du rythme, arrondie au-dessus : 1 pour « tranquille », 2 pour « équilibré », 2 pour « intense » (`activitesParRythme` : 2, 3, 4).
  - Elles sont choisies près du logement du moment.
  - Jamais une étape à réserver (`toReserve`), sauf si c'est un engagement saisi.
- **Titre du jour** (`Day.theme`) : « De {ville quittée} à {ville d'arrivée} ». *Proposition* : il est écrit par le code, pas par l'IA (T11).
- **Le reste** : voir le § 3.4.

### 3.3 Heure, mode et durée (M4-PO-7)

**Règle du billet de trajet.**
- Le type « Billet » de l'écran 1 couvre aujourd'hui aussi les billets d'entrée (F8, exemple « [Tattoo] »).
- **Le jour d'un changement de ville**, un « Billet » est lu comme le **titre de transport entre les deux villes**, jamais comme un billet d'entrée.
- Ce sens ne vaut que pour cette journée. Les autres jours, « Billet » garde son sens actuel.
- Pour un concert ou une visite ce jour-là, la personne choisit « Sortie », comme le dit l'aide de l'écran 1 (§ 8).
- Le type « Vol » de ce jour est toujours le changement de ville.

Il y a deux cas, dans cet ordre de priorité.

1. **Départ saisi.** Le « Billet » ou le « Vol » daté du jour du changement de ville est **le changement de ville**.
   - Son heure de début est le départ. Son heure de fin, si elle est saisie, est l'arrivée.
   - Son libellé devient le mode affiché (« Train Rome–Florence »).
   - S'il y en a plusieurs ce jour-là, le premier qui commence compte. Les autres restent des engagements ordinaires.
   - Sans heure de fin, le départ est celui du billet, et l'arrivée est « à confirmer » (§ 3.4).
   - **Fin de l'engagement** : `BriefEssai.engagements` ne porte aujourd'hui que l'heure de début (`brief.ts`, l. 76-81). L'heure d'arrivée doit atteindre la couche qui planifie la journée (T9).
2. **Départ estimé.** Sans billet ni vol ce jour-là :
   - l'heure de départ et la durée sont toujours affichées comme des estimations (« départ vers {heure} (estimation) », « environ 1 h 30 (estimation) »), jamais comme l'horaire d'un train ; l'heure seule, sans « vers » ni « (estimation) », n'est jamais affichée ;
   - l'heure et le créneau réservé quand aucune durée n'existe sont les valeurs provisoires du § 3.4 ;
   - la durée vient de la méthode que choisira M4-TL (T2). Sans estimation, la ligne affiche « durée à confirmer ». Jamais une durée inventée n'est présentée comme sûre ;
   - l'arrivée est « à confirmer » (§ 3.4) ;
   - le mode affiché vient des déplacements du brief (choix de produit provisoire) :
     - « En voiture » si `car` est coché, même avec `transit` ;
     - « En train ou en bus » si `transit` est coché sans `car` ;
     - aucun mode si seul `walk` est coché : la ligne montre seulement la ville, l'heure et la durée.

**Trains de nuit : non gérés dans ce lot**, et l'aide de l'écran 1 le dit (§ 8). Le contrat refuse déjà un engagement dont la fin précède le début (`TripDraftSchema.superRefine`, `src/contracts/creation.ts`, l. 144-145, « fin avant le début »). Un billet daté de la veille est un engagement ordinaire de la veille, pas le changement de ville. Le changement de ville du lendemain est alors estimé. La prise en charge des trains de nuit reviendra avec un lot ultérieur (M4d ou après).

**Données Google** : aucune durée Google n'est écrite, nulle part (0011 ; 0092 ne vaut que pour le prototype ; Q637 ouverte). La source de la durée estimée revient à **M4-TL** (T2). Une durée saisie par la personne est une donnée de la personne, pas une donnée Google.

### 3.4 Planification de la journée (M4-PO-8)
- La journée du changement de ville montre la ligne « Vers {ville} » entre les étapes de la ville quittée et celles de la ville d'arrivée.
- L'arrivée est l'heure de fin du billet ou du vol, sinon elle est « à confirmer ».
- **Départ estimé** (sans billet ni vol seulement), valeurs du Product Owner, **provisoires** :
  - le départ estimé est la fin du dernier engagement **de la ville quittée** le jour du départ (son heure de début s'il n'a pas d'heure de fin), **s'il finit avant 18:00** ; sinon, et sans engagement, il est à 09:00. Un engagement de la ville d'arrivée, par exemple un dîner à 20:00, ne compte jamais ;
  - sans durée connue, le créneau réservé à la ligne « Vers {ville} » d'un départ estimé est de 3 heures. Ce créneau ne vaut pas pour un billet ou un vol saisi sans heure de fin, dont l'intervalle est renvoyé à M4-suite (§ 15).

  **Précédence** (report du CEO, Q703) : M4-TL peut remplacer ces bornes et ces valeurs par un défaut technique (T11 : couche et valeur par défaut), puis M4-suite les révise. Ordre : M4-TL, puis M4-suite, puis cette spécification.
- **Toute autre règle de cette journée** (chevauchements, marges, repas, long changement de ville, intervalle d'un billet sans heure de fin, engagements autour du départ et de l'arrivée, signalement d'horaires serrés) est renvoyée à **M4-suite** (§ 15), dans la couche que désigne M4-TL (T9, T11). Les autres sections renvoient ici.

**Vol de ce jour** (constat, pour T9) : le « Vol » d'une journée de changement de ville n'est **pas** un vol d'arrivée ou de départ du voyage. `heuresDeVol` (`src/domain/squelette.ts`) ne lit que les vols du premier et du dernier jour, et `engagementsDuBrief` écarte aujourd'hui tout vol.

## 4. Villes et décalage horaire (premier lot)

1. **Même décalage horaire** (M4-PO-5).
   - Toutes les villes ont le même décalage UTC que la destination pendant les dates du voyage. C'est la règle actuelle de `controlerVilles` (B9-PO-18, 0087 § 5).
   - Exemples : Paris puis Berlin est accepté ; Lisbonne puis Madrid, ou Édimbourg puis Paris, sont refusés.
   - Le contrat garde un fuseau par voyage (`Trip.timeZone`).
   - Les voyages à plusieurs fuseaux sont un lot à part (M4d, `Stay.timeZone`, après le premier essai de Samuel).
2. **Quelles villes.** Chaque autre ville se choisit **comme la destination** : par la recherche de ville de **0141** quand elle est ouverte sur l'écran 1 de `api`, sinon par le champ des 62 villes.
   - **Ouverture** (0141 § 2.3 et § 6.2) : la recherche de `api` ne s'ouvre que si deux conditions sont réunies :
     - `SEUILS_AUTOCOMPLETION_VALIDES` vaut `true`, après la validation des seuils par Samuel ;
     - la barrière B9-TL-8 rend `reelle` avec le crochet `accesReelApi`, dont M1h définit le corps.

     Les modules que nomme 0141 (`src/server/composition/villes-api.ts`, `src/server/villes/recherche.ts`, `src/server/config/villes.ts`, `src/server/generation/acces-reel.ts`) viendront avec la tâche de code M1f : ils ne sont pas encore dans `main`.
   - **Bornes** : la ville est bornée aux 62 de `villes-mvp.json` tant que Q626 est ouverte (0141 § 8 points 1 et 2, `villeMvpDuPays`).
   - **Ce qui est envoyé** : seul le **nom maison**. `OtherCity` n'a pas de `destinationRegion`, et `createTrip` de `api` contrôle par le nom (`controlerVilles`, 0141 § 6.3 point 3). Le `placeId` d'une ville n'est ni conservé ni envoyé.
   - **Autres villes** : 0141 § 6.4 monte la recherche sur l'écran 1 existant et ne dit rien des autres villes. Son § 4 point 5 dit : « À revoir si la recherche de ville sert un jour après la connexion (par exemple « Ajouter une ville » de l'étape 4, plusieurs villes) ». Étendre la recherche aux autres villes fait partie de M4c. Les autres villes se saisissent sur le même écran 1 anonyme, avant la connexion. Le motif de revoir le plafond que donne 0141 § 4 point 5 (une recherche qui servirait **après** la connexion) ne s'applique donc pas. Le risque reste celui de S-M4-3.
3. **Même ville deux fois de suite** : refusée, avec le texte du § 8. Une ville qui revient plus tard est acceptée (Rome, Florence, puis Rome). Cette règle est nouvelle : ni `controlerVilles` ni `checkCities` ne la portent. Sa place revient à M4-TL (T4).
4. **Site d'essai** : il ne change pas (M4-PO-1). Il garde une seule ville et le texte `uneSeuleVille`.

## 5. Ce que la chaîne inversée doit produire (pour M4a et M4b)

1. **Brief vers l'IA.** Il contient :
   - la liste ordonnée des villes, avec pour chacune son nom maison, sa date d'arrivée, son nombre de nuits et le texte de son logement ;
   - les changements de ville et leur forme (saisie ou estimée, heures connues) ;
   - les engagements de chaque jour.

   Rien d'autre n'y entre, et jamais une donnée Google (0011 § 4). La forme exacte (prompt `programme` v5) revient à ia-recherche dans M4a, sous la décision M4-TL.
2. **Secteurs par ville.** Les jours pleins d'une ville ne contiennent que des lieux de cette ville ou de ses environs, excursion d'un jour comprise (cadrage § 3.7 : la distance est un coût). Les incontournables de chaque ville sont répartis sur ses propres jours.
3. **Vérification par ville.**
   - Chaque lieu est vérifié dans **la ville de son étape** :
     - un jour ordinaire, la ville du jour ;
     - le jour d'un changement de ville, la ville quittée pour une étape placée **avant** la ligne « Vers {ville} », et la ville d'arrivée pour une étape placée **après** elle.
   - Un lieu trouvé dans une autre ville du voyage, ou loin de la ville de son étape, est traité comme introuvable (0116, badge « à confirmer »).
   - Cette « ville de l'étape » ne sert qu'à la vérification. À l'écran, la journée du changement de ville est toujours nommée « De {ville} à {ville} » (§ 3.1 point 3).
   - La règle de distance revient à M4-TL (T5).
4. **Assemblage par séjour.** Chaque jour part du logement de sa ville et y revient, sauf la journée du changement de ville (§ 3.1). Les cases de l'aperçu suivent le § 7.3 (M4-PO-9).
5. **Écriture.** Une version 1 complète, comme 0136 § 3 :
   - une ligne `stays` par ville ;
   - le `place_id` de chaque logement vérifié ;
   - aucun temps de trajet Google (critère 9 de M1a, rejoué).

## 6. Coût

**Constat.** Le coût d'un programme dépend surtout du **nombre de jours**, pas du nombre de villes.

Le programme de Rome (5 jours) compte 30 lieux distincts et un logement. Le profil `programme` simulé réserve 90 Text Search et 90 fiches (0136 § 6.4).

Une ville de plus ajoute :
- **un logement à vérifier** : une recherche Text Search « IDs only », gratuite (`places_text_search_essentials_ids_only`), et une fiche Enterprise, à 0,02 USD au prix plein avant la tranche gratuite (`prototype/config/prix-google.json`) ;
- **une journée de changement de ville**, qui a moins d'activités qu'un jour plein, donc moins de lieux ;
- **un prompt un peu plus long** : une ville, un logement et un changement de ville de plus, pour une sortie de même taille à nombre de jours égal.

Ordre de grandeur : quelques centimes de Google par ville en plus, et une part faible du coût de modèle. Un voyage de 15 jours en 3 villes compte toutefois environ 90 lieux et 3 logements, au-delà des 90 fiches du profil simulé. C'est la durée, pas les villes, qui pousse le forfait. Ces chiffres sont des estimations du Product Owner, à confirmer par M4-TL (T3) et par le premier essai réel.

**Qui tranche quoi** :
- la **forme technique du forfait** revient au **Tech Lead** (M4-TL, T3) : profil `programme` unique agrandi, part par ville ou part par jour, et valeurs de test de la variante simulée ;
- les **plafonds réels**, le **prix** et toute **borne de durée liée au coût** reviennent à **Samuel** :
  - pour les plafonds, voir Q639 (recommandation : 2 USD d'IA par voyage, 10 USD par organisation et par jour, 5 USD par jour sans compte) ;
  - questions Samuel 1, 2 et 4 du § 14. La question 4 touche à l'argent : elle n'est pas une décision du Product Owner, et le CEO la relaie à Samuel avec la réponse de M4-TL à T3 ;
- l'envoi du texte du logement de **chaque** ville au fournisseur de modèles relève de **Q636**, qui couvre déjà « le logement ». La question Samuel 3 du § 14 demande seulement de le confirmer.

## 7. Écrans touchés

### 7.1 Écran 1 — Créer le voyage (`/voyages/nouveau`, adaptateur `api`)
- « Au plus 3 villes en tout, destination comprise. » (clé existante `villes.maximum`, `{max}` = 3).
- **Aide du billet de trajet** (§ 8) :
  - elle s'affiche sous « Autres villes » dès qu'une autre ville est ajoutée ;
  - elle est reliée par `aria-describedby` au sélecteur « Type de réservation » de chaque engagement, tant qu'il y a plus d'une ville ;
  - elle disparaît, avec son lien `aria-describedby`, quand la dernière autre ville est retirée ;
  - l'aide actuelle de « Déjà réservé » (`engagements.aide`, « Un vol, une sortie, un billet : on les garde tels quels dans ton programme. ») ne change pas. Elle reste vraie : un billet de changement de ville garde ses heures. Sa voix « on » est un texte existant, que M4 ne modifie pas.
- **Erreurs** sous le champ de la ville concernée, lues par le lecteur d'écran comme les autres erreurs de l'écran 1 : ville identique à la précédente, autre décalage horaire, ville inconnue (§ 8). Elles s'ajoutent à `villeNom`, `villeOrdre` et `villeAvantDepart`, qui ne changent pas.
- **Annonces** : l'ajout et le retrait d'une ville sont annoncés dans une région `role="status"` (§ 8).
- **Focus** :
  - après « Ajouter une ville », il va au nom de la ville ajoutée ;
  - après « Retirer », il va à « Ajouter une ville », qui est toujours disponible après un retrait, puisque le retrait libère une place.
- La recherche de ville sert à chaque ville ajoutée, comme à la destination, quand elle est ouverte (§ 4.2).

### 7.2 Écran 5 — Propositions prêtes (`/voyages/[id]/preparation`)
- **Dès que le voyage a plus d'une ville**, chaque rangée de jour nomme sa ville :
  - **texte lu par le lecteur d'écran** : la pastille `DayBadge size="sm"` de la rangée est un `<span>` sans nom ARIA ; seul son texte masqué (`sr-only`, `dayBadgeName`) est lu aujourd'hui. Ce texte masqué est suivi de « , {ville} » pour un jour ordinaire, ou de « , de {ville} à {ville} » pour la journée du changement de ville (§ 7.7) ;
  - **rendu visible** : une légende en `corps-s`, couleur `ink-2`, au-dessus de la mini-ligne, qui affiche « {ville} » ou « De {ville} à {ville} ». Elle est `aria-hidden`, puisque le texte masqué de la pastille porte déjà la ville, et passe à la ligne sans troncature ;
  - **disposition** : la rangée garde sa sous-grille à 3 colonnes (`items-center`, `PreparationView.tsx`). La légende et la mini-ligne sont empilées dans la colonne centrale. La pastille et l'état du jour restent alignés sur la mini-ligne ;
  - la mini-ligne reste `aria-hidden`, comme aujourd'hui (`PreparationView.tsx`).
- **Avec une seule ville**, les rangées de jour ne changent pas (critère 25).
- Les cases suivent le § 7.3. Le changement de ville n'est jamais une case.
- Dans l'interface, on écrit « Tes premières propositions », jamais « Aperçu » (handover front-end § 10).

### 7.3 Écran 6 — Présentation (`/voyages/[id]/presentation`), et 6b
**Choix des 8 propositions** (amende M1a-PO-2 et la règle « J1 puis J2 » de 0136 § 3.4 pour les voyages à plusieurs villes) :
- elles viennent des **deux premiers jours qui ne sont pas des journées de changement de ville**, dans l'ordre du voyage. J1 compte toujours, puisqu'il n'est jamais un changement de ville (§ 3.1 point 4) ;
- exemples :
  - Rome du 05-04, puis Florence à partir du 05-06 : J1 et J2 ;
  - Rome une nuit, puis Florence à partir du 05-05 : J1 et J3, car J2 est le changement de ville ;
- moins de 8 étapes retenues : moins de cases, et l'exécution se termine `incomplete`, comme 0136 § 3.4 ;
- **avant le déblocage**, les journées servies sont J1 et les journées des cases (0136 § 3.5). Une journée de changement de ville qui n'a pas de case reste « À débloquer » ;
- forme technique, sur `selectionApercu` et `servisAvantDeblocage`, partagés avec le site d'essai qui ne change pas : T12.

**Cartes** (écran 6, et 6b après le déblocage, où une carte peut tomber le jour d'un changement de ville) :
- **ville nommée** : dès que le voyage a plus d'une ville, chaque carte nomme sa ville à côté de son jour (« Jour {n} · {ville} », § 8). **Le jour d'un changement de ville, toutes les cartes de ce jour**, du matin comme de l'après-midi, affichent « Jour {n} · De {ville} à {ville} » (§ 3.1 point 3). Avec une seule ville, rien ne change ;
- **première carte après l'arrivée** : la première carte qui suit la ligne « Vers {ville} » le jour d'un changement de ville n'affiche ni `travelFromPrevious` ni la ligne `detour` qui l'accompagne. La durée depuis l'étape d'avant le départ n'a pas de sens ;
- **contexte** : les repas de ce jour sont renvoyés à M4-suite (§ 3.4). D'ici là, règle provisoire : `context` (`formatContexte`) ne cite jamais un déjeuner le jour d'un changement de ville. Si un voisin est la ligne « Vers {ville} », il compte comme un voisin absent. Sans aucun voisin, la carte n'a pas de ligne de contexte : c'est le comportement actuel de `formatContexte` (`null`), sans texte de repli. Aucun texte nouveau n'est ajouté.

### 7.4 Écran 11 — Séjour, carte d'ensemble
**La carte d'ensemble reste celle d'aujourd'hui**, pour une ville comme pour plusieurs : des anneaux `StopMarker kind="overview"` sans numéro, selon la règle de Ligne (`docs/design-system/carte.md` : « Vue d'ensemble du séjour : arrêts en petits anneaux de 12 px, sans numéro » ; `StopMarker.test.tsx`).

- **Seul changement, à partir de 2 villes** : à l'ouverture, la carte cadre **toutes les villes** du voyage, c'est-à-dire toutes les étapes servies et tous les logements.
- Aucun tracé ne relie les villes. Aucune couleur `quai` n'est ajoutée (handover § 0, règle 6, et § 4).
- La liste du jour par jour, groupée par ville (§ 7.5), reste la source complète. La carte n'en est que le reflet (handover § 11).
- **Carte de la Journée d'un changement de ville** (écran 12) : rendu actuel de la Journée, inchangé. Aucun segment n'est tracé entre la dernière étape avant la ligne « Vers {ville} » et la première après elle, puisque cette ligne n'est pas un `Segment` de marche (T1).
- **Renvoyé à M4-suite**, avec une décision UX/UI dans `docs/decisions/` : numérotation de la carte d'ensemble, repères par ville (terminus, étiquettes, groupes), zoom minimal pour des villes éloignées, et forme propre de la carte de la Journée d'un changement de ville. Toute modification du rendu `overview` passe par cette décision et par le test de `StopMarker` qu'elle modifierait.

### 7.5 Écran 11 — Séjour, liste
**Voyage à une seule ville : écran inchangé.** Il n'y a ni liste de villes sous la plaque, ni titre de ville, et le jour par jour reste une seule liste, comme aujourd'hui (maquettes, `SejourPanel.test.tsx`). Les règles ci-dessous ne valent que pour 2 ou 3 villes.

- **Plaque** : la plaque garde la destination (ville 1) et son `meta` actuel.
- **Liste des villes** sous la plaque, en dehors d'elle, dans l'ordre : « Rome · Florence · Venise ».
  - Elle utilise le token existant `ink-2` sur le fond de la page, et son contraste est vérifié par test.
  - Avec des noms longs, elle passe à la ligne et n'est jamais tronquée.
- **Jour par jour**, groupé par ville, sous le titre de niveau 2 actuel « Jour par jour » :
  - un **titre de niveau 3** par ville : « {ville} · {n} nuits », « {ville} · 1 nuit » au singulier. C'est un titre simple : il n'est pas focalisable et se parcourt par la navigation entre titres ;
  - chaque jour est rangé sous la ville où l'on dort (§ 3.1 point 3), et le dernier jour du voyage sous la dernière ville ;
  - le résumé de la journée du changement de ville est sur **deux lignes**, pour ne pas rapprocher les deux sens de « trajet » :
    - ligne 1 : « Vers {ville} » ;
    - ligne 2 : le résumé actuel du jour (`resume` ou `resumeTrajetAConfirmer`). Ses temps de trajet viennent du relecteur, comme pour toute journée de `api` (critère 9 de M1a), et ne comptent pas la ligne « Vers {ville} ».
- « À faire avant de partir » et « Pendant ton séjour » : inchangés.

### 7.6 Écran 12 — Journée, journée du changement de ville seulement
- **Ligne du jour** : elle suit le § 3.2 et le § 3.4.
- **Ligne « Vers {ville} »** :
  - elle a le gabarit d'une ligne `DayLine.Segment` : un élément de la liste ordonnée, le texte « Vers {ville} » et le détail du § 8 ;
  - elle n'a pas de lien et n'est pas focalisable ;
  - son nom accessible est « Vers {ville}, {détail} » ;
  - sa forme de données revient à T1.
- **Bandeaux** : le **bandeau du budget de trajet** existant (`sejour.journee.bandeauTrajet`, `StatusBanner kind="travel"`, `role="status"`) est inchangé et porte sur `Day.travelMinutes` seul. Ce lot n'ajoute aucun bandeau : un éventuel signalement d'horaires serrés est renvoyé à M4-suite (§ 3.4).
- **Autres journées** : elles ne changent pas.

### 7.7 Noms accessibles et petits écrans (390 px)
- **Pastille `DayBadge`** d'une journée de changement de ville : son nom accessible est le nom actuel (`dayBadgeName` : « Jour {n} », puis « , {jour abrégé} »), suivi de « , de {ville} à {ville} », puis de « , complet » s'il y a lieu. Exemple : « Jour 3, lun., de Rome à Florence, complet ». L'état actif reste porté par l'attribut `aria-current`, pas par le texte du nom.
- **Rangée de jour de l'écran 5**, dès que le voyage a plus d'une ville : le texte masqué lu par le lecteur d'écran est celui de sa pastille `DayBadge size="sm"`, suivi de « , {ville} » pour un jour ordinaire (« Jour 1, Rome »), ou de « , de {ville} à {ville} » pour une journée de changement de ville (« Jour 3, de Rome à Florence »). La mini-ligne et la légende restent `aria-hidden`. Avec une seule ville, rien ne change.
- **Extension de `DayBadge`** (pour M4c) : le composant reçoit la ville par une **prop facultative**, sans effet quand elle est absente ; les tests existants de `DayBadge`, dont ceux de `size="sm"`, passent sans modification. Ordre du texte, pour les deux tailles : jour (« Jour {n} »), jour abrégé s'il est donné, ville (« {ville} » ou « de {ville} à {ville} »), puis « , complet » s'il y a lieu.
- Le titre et le thème de la Journée, la légende de la rangée de jour de l'écran 5 et l'en-tête des cartes de l'écran 6 passent à la ligne quand les noms de villes sont longs. Ils ne sont jamais tronqués ni ne débordent horizontalement à 390 px.

### 7.8 Hors de ces écrans
« Mes voyages », la vue partagée, « Pendant le voyage » (écran 15) et « Après le voyage » ne changent pas dans ce lot. Ils affichent la destination (ville 1), comme aujourd'hui.

## 8. Textes (français, provisoires, à valider par UX/UI)

Les textes suivent le § 10 du handover front-end :
- tutoiement et phrases courtes ;
- aucun point d'exclamation ;
- aucune voix « nous » nouvelle ;
- aucun mot technique (« fuseau horaire », « IANA », « UTC ») ;
- « à confirmer » pour l'incertitude.

Ils vivent dans `src/i18n/fr/creation.json`, `src/i18n/fr/sejour.json` et `src/i18n/fr/presentation.json`, sous des clés au choix de M4c. Le mot « trajet » n'y nomme que les temps de trajet entre étapes.

| Où | Texte |
|---|---|
| Écran 1, aide du billet de trajet (nouveau) | « Pour changer de ville, ajoute ton billet ou ton vol dans Déjà réservé, avec ses heures. Ce jour-là, un billet compte comme ton transport : pour un concert ou une visite, choisis Sortie. Les trains de nuit ne sont pas encore pris en compte. » |
| Écran 1, maximum (existant) | « Au plus 3 villes en tout, destination comprise. » |
| Écran 1, même ville que la précédente | « Choisis une autre ville que la précédente. » |
| Écran 1, autre décalage horaire | « {ville} n'a pas la même heure que {destination}. Choisis une ville à la même heure. » |
| Écran 1, ville inconnue | « Cette ville n'est pas encore proposée. Choisis une autre ville. » |
| Écran 1, annonces ({n} = rang de la ville dans le voyage, destination comprise : 2 ou 3, comme le libellé actuel `villes.ville`) | « Ville {n} ajoutée. » ; « {ville} retirée. » (« Ville {n} retirée. » sans nom) |
| Cartes de l'écran 6, jour d'une ville | « Jour {n} · {ville} » |
| Cartes de l'écran 6, jour d'un changement de ville ; thème | « Jour {n} · De {ville} à {ville} » ; thème : « De {ville} à {ville} » |
| Écran 5, légende de la rangée de jour (`corps-s`, `ink-2`, `aria-hidden`, plus d'une ville) | « {ville} » ; changement de ville : « De {ville} à {ville} » |
| Pastille du jour, nom accessible | « {nom actuel}, de {ville} à {ville} », puis « , complet » s'il y a lieu (§ 7.7) |
| Rangée de jour de l'écran 5, fin du texte masqué de sa pastille (plus d'une ville) | jour ordinaire : « , {ville} » ; changement de ville : « , de {ville} à {ville} » (§ 7.7) |
| Séjour, villes sous la plaque | « {ville 1} · {ville 2} · {ville 3} » |
| Séjour, titre de ville | « {ville} · {n} nuits » ; « {ville} · 1 nuit » |
| Séjour, résumé du changement de ville | ligne 1 : « Vers {ville} » ; ligne 2 : le résumé actuel |
| Journée, ligne du changement de ville | « Vers {ville} » |
| Journée, détail, départ saisi | « {libellé}, {heure de départ} – {heure d'arrivée} » ; sans heure d'arrivée : « {libellé}, départ à {heure}, arrivée à confirmer » |
| Journée, détail, départ estimé ({heure} donnée par le code, valeur provisoire du § 3.4) | « {mode}, départ vers {heure} (estimation), environ {durée} (estimation) » ; sans estimation de durée : « {mode}, départ vers {heure} (estimation), durée à confirmer » ; avec `walk` seul, sans « {mode}, » |
| Modes estimés (provisoires) | « En train ou en bus » ; « En voiture » |

Formats : « 10:12 », « 10:12 – 11:47 », « 45 min », « 1 h 30 ».

## 9. Questions au Tech Lead (décision M4-TL, avant le code)

- **T1 — Forme du changement de ville dans le contrat.** Trois formes possibles :
  - un nouvel élément de ligne du jour (par exemple `{ type: "transfer", from, to, mode, start, end?, dureeEstimee?, source: "saisi" | "estime" }`, où `end` est absent quand l'arrivée est « à confirmer », et `dureeEstimee` absente quand la durée est « à confirmer » (§ 3.3, § 3.4)) ;
  - un `Segment` étendu (son `mode` n'admet que `walk`, `transit` et `car`) ;
  - un champ de `Day`.

  *Proposition* : un élément `transfer` dans `DayLineItemSchema` et dans l'instantané, sans `placeId` ni donnée Google, avec une PR de contrat avant M4b. Il est rendu avec le gabarit de `DayLine.Segment` (§ 7.6).
- **T2 — Source de la durée estimée.** La règle « jamais une donnée Google stockée » est imposée. Options :
  - (a) une estimation de l'IA dans la sortie du prompt v5, texte maison marqué « estimation ». Cette option déclenche S-M4-2 ;
  - (b) une table maison des durées, écrite par le studio d'après une source non Google, par exemple les temps publiés par les exploitants ferroviaires, avec la date du relevé :
    - elle est limitée aux paires des 62 villes qui ont **le même décalage horaire**, seules admises (§ 4.1), et dans un rayon raisonnable ;
    - son coût d'entretien (nombre de paires, relevé, mise à jour) est à chiffrer par M4-TL ;
  - (c) Routes relu à l'affichage, jamais écrit (relecteur de B8b) ;
  - (d) Routes à la génération, écrit seulement si Samuel répond oui à Q637 et si une décision étend 0092 au MVP.

  *Recommandation du PO* : (b) si son entretien reste raisonnable, sinon (a). Dans les deux cas, la durée est toujours affichée comme estimation. (c) en dernier recours.
- **T3 — Forfait.** Forme du forfait d'un voyage à plusieurs villes : profil `programme` unique agrandi, part par ville ou part par jour, avec les valeurs de test de la variante simulée. M4-TL donne le coût estimé, au prix plein, de deux voyages de référence : 3 villes et 10 jours, puis 3 villes et 15 jours. C'est la base de la question Samuel 4.
- **T4 — Trois villes au plus, et même ville de suite.**
  - Pour le plafond, deux options :
    - baisser `MAX_CITIES` à 3 dans `src/contracts/values.ts`, ce qui touche `mock`, l'ancienne chaîne et les tests de B9 et F8 (« brouillon à trois villes » reste valide) ;
    - refuser la 4e ville sous la chaîne inversée seulement, sur un champ à fixer (proposition : `draft.otherCities.2.name`).

    *Proposition* : baisser `MAX_CITIES` à 3, puisque F8-PO-3 dit « 4, provisoire ».
  - Pour la même ville deux fois de suite (§ 4.3) : où vit le refus (`checkCities` du contrat, `controlerVilles`, ou la conversion de la chaîne inversée), et sur quel champ (proposition : le nom de la seconde ville) ?
- **T5 — Vérification par ville.** Deux points :
  - le biais de position de Text Search par ville de l'étape (§ 5.3) ;
  - la règle « loin de la ville de son étape » : distance au centre de la ville de la table maison, et seuil.
- **T6 — Ville de chaque jour et de chaque étape.** Séjour, l'écran 5, l'écran 6 et Journée doivent savoir à quelle ville appartient chaque jour, et le jour d'un changement de ville, chaque étape. Le contrat `Trip` n'a aujourd'hui que `destination`. Options :
  - `Day.city` (texte maison) ;
  - `Trip.cities` (nom, première et dernière date) ;
  - une recomposition à la lecture depuis `stays` (`logementsDuJour`) et la position de la ligne « Vers {ville} ».
- **T7 — Carte.** Mise en œuvre du § 7.4 : cadrage de la carte d'ensemble sur toutes les villes, et absence de segment entre les deux villes sur la carte de la Journée. La numérotation et les repères par ville sont renvoyés à M4-suite.
- **T8 — Module partagé.** `briefDepuisFormulaire` sert `p0Run` et `api`. Comment lever le refus de `draft.otherCities` pour `api` seulement, en gardant celui du site d'essai (M4-PO-1) : un paramètre de la conversion, ou deux fonctions ?
- **T9 — Engagements et changement de ville.**
  - Où se fait la détection du départ saisi (règle du billet de trajet, § 3.3) ? *Proposition* : dans le code, de façon déterministe, avant le prompt.
  - Les règles des engagements autour du changement de ville sont renvoyées à M4-suite (§ 3.4) ; M4-TL dit seulement dans quelle couche elles vivront.
  - L'**heure de fin** des engagements doit atteindre la couche qui planifie. `BriefEssai.engagements` n'a que `heure` : comment la faire passer, par un champ `fin` (évolution du brief et du prompt) ou hors du brief ?
  - Le « Vol » d'une journée de changement de ville ne doit pas être écarté par `engagementsDuBrief`, ni lu par `heuresDeVol`.
- **T10 — Tests.** Le critère 13 de M1a (`chaine-inversee: une seule ville`) et le test qui le porte changent d'attente pour `api` : 1 à 3 villes y sont acceptées. M4-TL écrit ce changement dans sa décision, avec la liste fermée des attentes modifiées, comme 0136 § 9. Aucun test n'est supprimé ni désactivé sans décision écrite (CLAUDE.md).
- **T11 — Qui tient les règles du changement de ville (§ 3.2 à § 3.4).** Les règles visées sont le nombre d'activités et le thème (§ 3.2), et les valeurs provisoires du départ estimé, que M4-TL peut remplacer par un défaut technique (§ 3.4). Les marges, les repas, le long changement de ville et le placement des engagements vont à M4-suite (§ 3.4). Elles peuvent vivre :
  - dans le **prompt `programme` v5**, où l'IA les applique ;
  - dans le **moteur** (`squelette.ts`, qui suppose aujourd'hui un seul séjour, et `moteur.json`) ;
  - dans un **contrôle de la sortie** de l'IA, qui refuse ou corrige ;
  - ou dans une combinaison des trois.

  La réponse de M4-TL fait foi. Elle dit aussi dans quelle tâche (M4a ou M4b) se testent les critères 6 à 12, et si les valeurs vont dans `moteur.json` (proposition du PO).
- **T12 — Cases de l'aperçu.** La règle du § 7.3 (deux premiers jours qui ne sont pas des changements de ville) change `selectionApercu` et `servisAvantDeblocage` (0136 § 1.7), partagés avec le site d'essai, qui ne change pas. Il faut aussi `travelFromPrevious` et `context` de la première carte après l'arrivée. Forme au choix : paramètre, ou filtre des jours avant l'appel.

## 10. Questions à la Sécurité

- **S-M4-1** (bloque M4b) — Les textes des logements de 2 ou 3 villes partent au fournisseur de modèles et à Text Search, comme le logement unique aujourd'hui. Les libellés des engagements lus comme changement de ville partent au fournisseur de modèles. Le verdict 0139 couvre-t-il ce cas tel quel, avec Q636 et Q645, et avec le second point de Q660 (libellés d'engagements dans `requeteProgramme`) ?
- **S-M4-2** (déclenchée seulement si M4-TL retient l'option (a) de T2 ; bloque alors M4a et M4b) — Une durée écrite par l'IA est un texte maison du modèle. Faut-il des contrôles de sortie en plus de ceux de 0117 (bornes, format) ?
- **S-M4-3** (bloque seulement l'ouverture de la recherche pour les autres villes, dans M4c) — La recherche de ville de 0141 servirait jusqu'à 3 fois par voyage, sur l'écran 1 anonyme. Elle reste sous un plafond commun de 150 suggestions et 40 choix par jour (0141 § 2.3, valeurs proposées et non validées) et sous le débit par adresse du limiteur (0141 § 4 point 1). Le risque d'épuisement accepté pour `mvp-essai` (0141 § 4 point 6) change-t-il ?
- **S-M4-4** (bloque M4b) — Le nouvel élément « changement de ville » de l'instantané (T1) doit rester hors de la vue partagée tant que B12 ne l'a pas listé (liste blanche, 0103). Confirmation demandée.

## 11. Critères d'acceptation

Chaque critère est vérifié par un test nommé dans la PR de la tâche qui le porte : M4a, M4b ou M4c. Pour les critères 6 à 12, c'est la tâche que désigne M4-TL (T11).

Les tests de base de données tournent en CI (`pnpm test:db`), en composition simulée, barrière fermée.

1. `plusieurs-villes: createTrip accepte deux villes`.
   - Contexte : en `ci`, avec `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth` et `CHAINE_APERCU = "inversee"`. Voyage à Rome du 2027-05-04 au 2027-05-08, puis à Florence à partir du 2027-05-06.
   - L'exécution passe à `ready` ou `incomplete`.
   - Il y a deux lignes `stays` : Rome du 05-04 au 05-06, et Florence du 05-06 au 05-08 (fin exclusive).
   - La version 1 a un instantané qui passe `TripSnapshotSchema` et compte 5 jours.
2. `plusieurs-villes: trois villes acceptées, une quatrième refusée`.
   - Rome, Florence et Venise sont acceptés.
   - Une 4e ville est refusée (`validation_failed`, sur le champ de T4), sans aucune écriture.
   - À l'écran 1, avec 3 villes, « Ajouter une ville » est indisponible, et le texte « Au plus 3 villes en tout, destination comprise. » s'affiche.
3. `plusieurs-villes: même décalage horaire`.
   - Paris puis Berlin est accepté.
   - Lisbonne puis Madrid, et Édimbourg puis Paris, sont refusés sur `draft.otherCities.0.name`.
   - Une ville hors des 62 est refusée sur son champ.
   - Aucune écriture.
   - À l'écran 1, les textes « {ville} n'a pas la même heure que {destination}. Choisis une ville à la même heure. » et « Cette ville n'est pas encore proposée. Choisis une autre ville. » s'affichent sous le champ concerné.
4. `plusieurs-villes: même ville deux fois de suite refusée`.
   - Rome puis Rome est refusé, sur le champ de T4, sans écriture. À l'écran 1, « Choisis une autre ville que la précédente. » s'affiche sous ce champ.
   - Rome, Florence, puis Rome est accepté.
5. `plusieurs-villes: brief vers l'IA`.
   - L'entrée du modèle contient les villes dans l'ordre, et pour chacune son nom maison, ses dates, ses nuits et le texte de son logement.
   - La somme des nuits égale celle du voyage.
   - Les tests à valeurs sentinelles (`tests/unit/p0/sentinelles-google.test.ts`, `tests/unit/ia/prompts-sentinelles.test.ts`) sont rejoués : aucun `placeId`, aucun texte ni aucune durée Google.
6. `changement de ville: un par ville ajoutée`.
   - Pour 3 villes, il y a exactement deux journées de changement de ville, aux dates d'arrivée des villes 2 et 3.
   - Chacune commence au terminus du logement de la ville quittée et finit à celui de la ville d'arrivée. Son thème est « De {ville} à {ville} ».
   - Les autres jours commencent et finissent au logement de leur ville.
7. `changement de ville: billet saisi`.
   - Contexte : un engagement « Billet » « Train Rome–Florence » le 2027-05-06, de 15:05 à 16:40.
   - La ligne « Vers Florence » va de 15:05 à 16:40 et porte ce libellé, sans « (estimation) ».
   - Variante : le même « Billet » saisi de 15:05 sans heure de fin. Le détail est « Train Rome–Florence, départ à 15:05, arrivée à confirmer ». Aucun créneau n'est fixé ici : l'intervalle est renvoyé à M4-suite (§ 3.4).
8. `changement de ville: départ estimé`.
   - Contexte : sans billet, sans vol, et sans engagement le 2027-05-06. La ligne affiche « départ vers 09:00 (estimation) ».
   - Variante : une « Sortie » à Rome le 2027-05-06 de 10:00 à 11:30. La ligne affiche « départ vers 11:30 (estimation) ».
   - Variante : une « Sortie » à Rome le 2027-05-06 de 17:00 à 19:00. Elle finit après 18:00 : la ligne affiche « départ vers 09:00 (estimation) ».
   - Variante : un dîner réservé (« Sortie ») à Florence le 2027-05-06 à 20:00. Il est de la ville d'arrivée et ne compte pas : la ligne affiche « départ vers 09:00 (estimation) ».
   - Sans durée estimée, la ligne affiche « durée à confirmer » et occupe un créneau de 3 heures.
   - Si M4-TL remplace ces valeurs (§ 3.4), ce critère suit sa décision.
   - Dans tous les cas, la ligne affiche « départ vers {heure} (estimation) », puis « environ {durée} (estimation) », ou « durée à confirmer » sans estimation. Aucune heure de départ n'est affichée sans « vers » et « (estimation) ».
   - Après le critère 1, ni `trip_versions.snapshot` ni aucune autre table du schéma principal ne contient de durée Google (critère 9 de M1a, rejoué).
9. `changement de ville: rythme`.
   - Il y a **au plus** 1, 2 et 2 activités pour les rythmes « tranquille », « équilibré » et « intense » (§ 3.2), et aucune étape à réserver qui ne soit pas un engagement saisi.
10. `changement de ville: place de la ligne`.
    - La ligne « Vers {ville} » est affichée au bon endroit : après toutes les étapes de la ville quittée, et avant toutes celles de la ville d'arrivée (§ 3.4).
11. `changement de ville: vol, billet et mode`.
    - Un « Vol » daté d'un changement de ville devient le changement de ville. Il ne change ni l'heure d'arrivée du premier jour ni celle de départ du dernier.
    - Un « Billet » de ce jour devient le changement de ville. Un « Billet » d'un autre jour, ou daté de la veille, reste un engagement ordinaire. Une « Sortie » de ce jour n'est jamais le changement de ville.
    - Le mode d'un départ estimé affiche :
      - « En voiture » avec `car`, même avec `transit` ;
      - « En train ou en bus » avec `transit` seul ;
      - aucun mode avec `walk` seul.
12. `plusieurs-villes: vérification par ville`. En simulé :
    - un lieu placé un jour de Florence et trouvé à Rome n'a pas de `placeId`, et reçoit le traitement de 0116 (badge « à confirmer ») ;
    - le jour d'un changement de ville, une étape du matin trouvée dans la ville quittée **garde** son `placeId`, et une étape d'après l'arrivée trouvée dans la ville quittée le perd.
13. `Écran 5: ville de chaque jour`.
    - Pour Rome puis Florence, le texte masqué (`sr-only`) des pastilles `DayBadge size="sm"` est « Jour 1, Rome » et « Jour 3, de Rome à Florence ». Le test porte sur ce texte, pas sur `getByRole(..., { name })`, puisque la pastille `sm` est un `<span>` sans rôle.
    - Les légendes visibles « Rome » et « De Rome à Florence » sont en `corps-s`, `ink-2`, au-dessus de la mini-ligne dans la colonne centrale, `aria-hidden`, et la mini-ligne reste `aria-hidden`.
    - Pour Édimbourg seul, aucune rangée ne nomme de ville, et les tests existants de l'écran 5 passent sans modification.
    - Le mot « Aperçu » n'apparaît dans aucun texte d'interface ajouté.
14. `Présentation: plusieurs villes`.
    - Pour Rome une nuit, puis Florence à partir du 05-05, les cases viennent de J1 et J3, jamais de J2.
    - Avant le déblocage, J2 est « À débloquer ».
    - Chaque carte affiche « Jour {n} · {ville} ». Avec une seule ville, aucune carte ne change (rejeu des tests de l'écran 6).
    - En 6b, pour Rome puis Florence avec un billet de 15:05 à 16:40 le 05-06, une carte du matin (Rome) et une carte de l'après-midi (Florence) de ce jour affichent toutes deux « Jour 3 · De Rome à Florence ».
    - En 6b, la première carte après la ligne « Vers {ville} » n'a ni ligne `travelFromPrevious` ni ligne `detour`. Aucun `context` d'un jour de changement de ville ne cite un déjeuner (règle provisoire, § 7.3).
    - `listPreviewSlots` rend au plus 8 cases et aucune n'est un changement de ville.
15. `Séjour: carte d'ensemble à plusieurs villes`. Pour Rome puis Florence :
    - le cadrage initial contient toutes les étapes servies et les deux logements ;
    - les marqueurs `overview` restent des anneaux sans numéro (`StopMarker.test.tsx` inchangé) ;
    - aucun tracé ne relie les deux villes, sur la carte d'ensemble comme sur la carte de la Journée du changement de ville ;
    - aucun marqueur n'utilise la couleur `quai`.
16. `Séjour: jour par jour groupé par ville`. Pour Rome puis Florence :
    - sous le titre de niveau 2 « Jour par jour », les titres de niveau 3 « Rome · 2 nuits » et « Florence · 2 nuits » s'affichent ;
    - la journée du 05-06 est rangée sous Florence. La première ligne de son résumé est « Vers Florence », et la seconde est le résumé actuel ;
    - sous la plaque s'affiche « Rome · Florence ».
17. `Journée: ligne « Vers {ville} »`.
    - La ligne n'a ni fiche, ni numéro sur la carte, ni action « Remplacer », « Déplacer » ou « Verrouiller ». Elle n'est pas focalisable.
    - Son nom accessible est « Vers Florence, {détail} ».
    - Le nom accessible de la pastille du jour de la Journée est « Jour 3, lun., de Rome à Florence », puis « , complet » s'il y a lieu. L'état actif reste `aria-current`.
    - Sur l'écran 5, le texte masqué de la pastille `sm` du même jour est « Jour 3, de Rome à Florence » (critère 13).
18. `Écran 1: aide du billet de trajet`.
    - L'aide du § 8 s'affiche dès qu'une autre ville est ajoutée, et pas avant.
    - Tant qu'il y a plus d'une ville, elle est reliée par `aria-describedby` au sélecteur « Type de réservation » de chaque engagement.
    - Quand la dernière autre ville est retirée, l'aide et ce lien disparaissent.
19. `plusieurs-villes: site d'essai inchangé`. Sur l'adaptateur `prototype`, une autre ville est toujours refusée avec le texte `uneSeuleVille`, et `p0Run` est inchangé.
20. `ancienne chaîne: inchangée`. Avec `CHAINE_APERCU = "ancienne"`, les tests existants de B9b à B9e et de B10 passent sans modification. Seule exception possible : la valeur de `MAX_CITIES`, si M4-TL la change (T4), changement écrit dans sa décision.
21. `plusieurs-villes: forfait simulé`.
    - Un voyage de 3 villes, et de la durée maximale que retiendra Samuel (question 4), tient dans le forfait simulé que fixe M4-TL : aucun refus `cap_reached`. Ce critère est **sous réserve de la réponse de Samuel à la question 4** : la borne de durée revient à Samuel, le test à M4-TL.
    - Avec `PLAFONDS_USAGE = null`, aucun client réel n'est construit (rejeu de `src/server/generation/barriere-fermee.test.ts`).
22. **Accessibilité** (`pnpm test:a11y` et tests de composants).
    - Axe passe sans violation sur :
      - l'écran 1 avec 3 villes et une erreur de ville ;
      - Séjour à 2 villes ;
      - une journée de changement de ville ;
      - l'écran 5 d'un voyage avec un changement de ville ;
      - l'écran 6 d'un voyage à 2 villes.
    - La liste des villes sous la plaque a un contraste d'au moins 4,5:1 sur le fond de la page (test de contraste).
    - Les cibles mesurent au moins 44 × 44 px : « Ajouter une ville », y compris à l'état `aria-disabled`, chaque « Retirer », les champs de ville et de date.
    - Après un ajout, le focus va au nom de la ville ajoutée ; après un retrait, à « Ajouter une ville » (§ 7.1). L'ajout et le retrait sont annoncés en `role="status"`.
    - Chaque erreur de ville est reliée à son champ (`aria-describedby`).
    - Les titres de ville sont de niveau 3 sous le niveau 2 « Jour par jour ». Ils ne sont pas focalisables.
    - Le focus visible des éléments focalisables est inchangé.
    - À 390 px, aucun texte du § 8 ne déborde horizontalement avec « Saint-Jacques-de-Compostelle » comme nom de ville. C'est un nom de test : il n'est pas des 62, et le test ne passe donc pas par `createTrip`.
23. **Bout en bout** (`tests/e2e/generation-api.api.spec.ts`, étendu).
    - Connexion par un code lu dans Mailpit, puis création de Rome puis Florence.
    - Écran 5 jusqu'à « prêt ».
    - Séjour, avec ses deux titres de ville, puis la journée du changement de ville.
24. `pnpm verify` vert (variante du studio : `env -u GOOGLE_MAPS_SERVER_KEY SKIP_DB_TESTS=1 pnpm verify`, les tests de base de données en CI).
25. `Séjour: une seule ville inchangée`. Pour un voyage à Édimbourg seul :
    - Séjour n'a ni liste de villes sous la plaque, ni titre de ville de niveau 3 ;
    - la carte d'ensemble est celle d'aujourd'hui ;
    - les cartes de l'écran 6 et les rangées de jour de l'écran 5 ne nomment pas de ville ;
    - les tests existants de Séjour (`SejourPanel.test.tsx`), de l'écran 5 et de l'écran 6 passent sans modification.

## 12. Décisions du Product Owner

Ce sont des décisions de détail fonctionnel :
- elles sont **définitives dès la fusion de cette spécification**, sans délai de veto (décision 0093) ;
- Samuel peut les remettre en cause à tout moment par une nouvelle décision ;
- elles seront listées dans la note de version suivante (rubrique « Décisions prises par le studio »).

Elles restent dans le cadre du cadrage (§ 3.5 « plusieurs villes », tableau du § 6 « Préparer »). Elles ne touchent ni au prix, ni à l'argent, ni à l'architecture. Les plafonds, le prix et toute borne de durée liée au coût sont posés à Samuel (§ 14, questions 1, 2 et 4), et la forme technique au Tech Lead (T1 à T12).

- **M4-PO-1 — Périmètre du premier lot.** Seule la vraie app sous la chaîne inversée accepte plusieurs villes. Le site d'essai reste à une ville, et l'ancienne chaîne reste telle quelle.
- **M4-PO-2 — Trois villes au plus**, destination comprise, dans la vraie app.
  - Cela remplace « jusqu'à 4 villes (provisoire) » de F8-PO-3 pour ce chemin.
  - Raison : sur un voyage de 5 à 10 jours (cible du cadrage), une 4e ville laisse moins de deux jours pleins par ville et ajoute un changement de ville.
  - La forme technique revient à M4-TL (T4).
- **M4-PO-3 — Nuits et ordre.**
  - L'ordre est celui de la saisie, sans réordonnancement dans ce lot.
  - Il faut au moins une nuit par ville (F8-PO-3, inchangé).
  - La durée totale reste de 15 jours au plus (0136 § 3.8), sous réserve de la question Samuel 4.
- **M4-PO-4 — Logement par ville.** Chaque ville a sa propre question de logement. Son logement entre dans le brief avec ses nuits et est vérifié comme le logement unique d'aujourd'hui.
- **M4-PO-5 — Villes admises.**
  - Les 62 villes du MVP, tant que Q626 est ouverte.
  - Choisies par la recherche de 0141 quand elle est ouverte (§ 4.2), sinon par le champ actuel.
  - Même décalage horaire que la destination pendant les dates du voyage.
  - La même ville ne peut pas venir deux fois de suite, mais elle peut revenir plus tard.
- **M4-PO-6 — Journée du changement de ville.**
  - Une par ville ajoutée, à la date d'arrivée dans la ville suivante, du logement quitté au nouveau logement.
  - Elle contient le matin dans la ville quittée (étapes ou « Temps libre »), puis la ligne « Vers {ville} », qui n'est pas une étape, puis la ville d'arrivée.
  - Le § 3.2 en fixe le nombre d'activités (au plus la moitié d'un jour plein) et le thème « De {ville} à {ville} », valeurs provisoires et révisables après le premier essai de Samuel.
  - Le choix de la couche qui les tient revient à M4-TL (T11).
- **M4-PO-7 — Règle du billet de trajet.**
  - Le jour d'un changement de ville, un « Billet » est le titre de transport entre les deux villes, jamais un billet d'entrée. Un « Vol » de ce jour est aussi le changement de ville, et le premier qui commence compte.
  - Les autres jours, « Billet » garde son sens.
  - Sans billet ni vol, le départ et la durée sont des estimations, toujours affichées comme telles (valeurs provisoires du § 3.4). L'arrivée est l'heure de fin du billet ou du vol, sinon « à confirmer ».
  - Les trains de nuit ne sont pas gérés dans ce lot.
  - Aucun champ nouveau à l'écran 1 : une aide explique la règle.
  - La source de l'estimation revient à M4-TL (T2).
- **M4-PO-8 — Planification de la journée, découpée** (correction 4, décision du CEO Q697).
  - La ligne « Vers {ville} » est entre les étapes de la ville quittée et celles de la ville d'arrivée.
  - Départ estimé sans billet ni vol : fin du dernier engagement de la ville quittée s'il finit avant 18:00, sinon 09:00 ; créneau de 3 heures sans durée connue. Valeurs provisoires, que M4-TL peut remplacer, puis M4-suite (§ 3.4).
  - Les autres règles sont renvoyées à M4-suite (§ 3.4). Cette spécification n'ajoute aucun bandeau.
- **M4-PO-9 — Aperçu et présentation** (amendée par les corrections 2 et 4).
  - Les 8 propositions viennent des deux premiers jours qui ne sont pas des changements de ville, J1 compris. Cela amende M1a-PO-2 (« J1 puis J2 ») pour les voyages à plusieurs villes ; il ne change rien pour une seule ville.
  - Avant le déblocage, les journées servies sont J1 et les journées des cases.
  - Chaque carte nomme sa ville dès qu'il y a plus d'une ville. Le jour d'un changement de ville, toutes les cartes de ce jour affichent « De {ville} à {ville} ».
  - La première carte après l'arrivée n'affiche ni `travelFromPrevious` ni `detour`.
  - `context` ne cite jamais un déjeuner le jour d'un changement de ville (provisoire, en attendant les repas de M4-suite).
  - Dès que le voyage a plus d'une ville, l'écran 5 nomme la ville de chaque jour, par le texte masqué de la pastille et une légende visible `aria-hidden`. Avec une seule ville, il ne change pas.
  - Le déblocage est inchangé.
- **M4-PO-10 — Séjour groupé par ville**, à partir de 2 villes seulement.
  - **Une seule ville** : Séjour ne change pas. Il n'a ni liste de villes ni titre de ville, et sa carte ne change pas non plus (critère 25).
  - Un titre de niveau 3 par ville, avec ses nuits, et chaque jour sous la ville où l'on dort.
  - Sous la plaque, la liste des villes.
  - La journée du changement de ville a un résumé sur deux lignes : « Vers {ville} », puis le résumé actuel.
  - La carte d'ensemble reste celle d'aujourd'hui (anneaux sans numéro, `docs/design-system/carte.md`), cadrée sur toutes les villes (§ 7.4).
  - Numérotation, repères par ville et carte propre de la Journée d'un changement de ville : renvoyés à M4-suite, avec une décision UX/UI.
- **M4-PO-11 — Deux mots, deux sens.**
  - « Vers {ville} » nomme le changement de ville. « Temps de trajet » est réservé à `Day.travelMinutes`.
  - Le bandeau du budget de trajet (`travel`) est inchangé.
- **M4-PO-12 — Textes.** Les textes du § 8 sont provisoires. UX/UI les valide ou les reformule sans changer la règle, et reste maître du rendu des écrans non maquettés, dans les règles du § 7.

## 13. Hors périmètre

- Les voyages à plusieurs fuseaux (M4d : contrat `Stay.timeZone`, amendement de B9-PO-18), après le premier essai de Samuel.
- Les villes hors des 62 (Q626).
- Un champ de saisie du changement de ville à l'écran 1 (mode, heure, durée) autre que les engagements existants, et un nouveau type d'engagement.
- Les trains de nuit et tout changement de ville qui arrive le lendemain (§ 3.3).
- Ce que reprend M4-suite (§ 15).
- La réservation de billets, les horaires réels de train et tout prix de transport.
- Le réordonnancement des villes par glisser-déposer.
- Le site d'essai, `p0Run`, le schéma `prototype` et la garde du mode réel.
- « Mes voyages », la vue partagée, « Pendant le voyage » et « Après le voyage » (§ 7.8).
- Tout appel réel, toute préversion, toute variable Vercel (M1h).
- La conservation de temps de trajet dans le schéma principal (Q637, Samuel).

## 14. Questions ouvertes, par destinataire

**Samuel** (questions réservées : argent, prix), avec recommandation. Le CEO relaie la question 4 avec la réponse de M4-TL à T3.
1. **Plafonds d'un voyage à plusieurs villes.** Les plafonds par voyage de Q639 (recommandation : 2 USD d'IA par voyage) valent-ils tels quels pour 2 ou 3 villes, sans supplément par ville ?
   - *Recommandation : oui.* Le coût suit surtout les jours. Une ville de plus ajoute surtout un logement à vérifier, de l'ordre de quelques centimes de Google (§ 6).
   - Bloque : les plafonds réels à M1h pour ces voyages. Ne bloque pas M4a à M4c, qui restent en simulé.
2. **Prix.** Un voyage à 2 ou 3 villes garde-t-il le même paiement unique qu'un voyage à une ville ?
   - *Recommandation : oui*, pour une offre simple et un coût presque égal.
   - Bloque : l'écran 9 d'un voyage à plusieurs villes, seulement si la réponse est non.
3. **Q636, précision.** La réponse à Q636 (logement envoyé au fournisseur de modèles) couvre-t-elle le logement de **chaque** ville du voyage ?
   - *Recommandation : oui*, aux mêmes conditions : `zdr`, `data_collection: "deny"`, mention sur l'écran 2.
   - Bloque : M1h pour ces voyages.
4. **Un voyage, un forfait, et la durée maximale** (ancienne M4-PO-10, retirée des décisions du PO parce qu'elle touche à l'argent).
   - Question : les plafonds réels doivent-ils être assez hauts pour qu'un voyage valide, de 3 villes au plus et de la durée maximale, ne soit jamais refusé pour son nombre de villes ni pour sa durée ? Et quelle durée maximale retenir sous la chaîne inversée : 15 jours, ou moins ?
   - *Recommandation : oui pour le nombre de villes* : le forfait d'un voyage ne dépend pas du nombre de villes.
   - Pour la durée : garder 15 jours si le coût que M4-TL donnera (T3) pour 3 villes et 15 jours (environ 90 lieux et 3 logements) tient dans les plafonds retenus. Sinon, Samuel fixe une borne plus courte, et le studio l'applique.
   - Bloque : les plafonds réels à M1h pour les longs voyages, et le critère 21 (borne de durée). Ne bloque pas M4a à M4c.

**Tech Lead** (décision M4-TL, bloque M4a, M4b et M4c) : T1 à T12 du § 9, en particulier :
- T1, forme du changement de ville ;
- T2, source de la durée, jamais une donnée Google stockée ;
- T3, forfait et coût de référence ;
- T4, trois villes au plus et même ville de suite ;
- T7, carte ;
- T9, heure de fin des engagements ;
- T11, couche qui tient les règles du changement de ville ;
- T12, cases de l'aperçu.

**Sécurité** : S-M4-1 à S-M4-4 du § 10, avec les blocages du tableau des prérequis.

**UX/UI** : validation des textes du § 8. La forme de la carte d'ensemble à plusieurs villes et de la carte de la Journée d'un changement de ville est renvoyée à M4-suite, avec une décision UX/UI (§ 7.4). Ne bloque pas M4c.

**ia-recherche** : forme du prompt `programme` v5 (§ 5), selon T11, et jeu d'évaluation de M4a, avec au moins :
- Rome puis Florence, avec un billet saisi ;
- Lisbonne puis Porto, avec un départ estimé ;
- Paris, Lyon, puis Marseille : 3 villes au rythme « intense ».

Sorties simulées seulement. Bloque M4a.

**CEO** :
- l'ordre des tâches : M4-TL au cycle 221, puis M4a à M4c aux cycles 222 à 224 du plan ;
- **ouvrir le ticket M4-suite après la fusion de M4-TL** (§ 15), pour le Product Owner, avec revue du Tech Lead et d'UX/UI. Recommandation : oui. Bloque : les règles de planification de la journée du changement de ville et la forme de la carte à plusieurs villes, pas M4a à M4c ;
- le report dans `QUESTIONS.md` des questions ci-dessus ;
- le relais de la question Samuel 4 avec M4-TL ;
- la mention, dans `specs/F8-creation-compte.md`, de M4-PO-2 (3 villes) et de M4-PO-7 (sens de « Billet » le jour d'un changement de ville) à côté de F8-PO-3, lors de l'amendement de F8 que demande déjà Q666 (non bloquant).

## 15. Découpage : ce que reprend M4-suite

Décision du CEO **Q697** (revue du head `4d771bb`) : plutôt qu'une quatrième correction, deux sujets sortent de cette spécification. Ils dépendent de réponses que M4-TL doit donner d'abord (T9, T11, T12), ou d'une décision UX/UI sur une règle de Ligne. Le Product Owner écrira **M4-suite** après la fusion de M4-TL.

1. **Règles de planification de la journée du changement de ville** (ancien § 3.4, et marges, repas et départ estimé de l'ancien § 3.2) :
   - révision du départ estimé et du créneau sans durée (valeurs provisoires du § 3.4) ;
   - intervalle du changement de ville quand l'arrivée est « à confirmer » ;
   - chevauchement d'un engagement avec un départ estimé ou saisi ;
   - marges avant le départ et après l'arrivée (anciennes valeurs provisoires 45 et 30 minutes), et engagement qui commence pendant le changement de ville ou peu après l'arrivée ;
   - repas et long changement de ville ;
   - bandeaux éventuels (chevauchement, marge courte, arrivée proche), leur `kind` et leurs textes.

   Raison : les revues ont trouvé à chaque tour une règle contradictoire ou incomplète, et la couche qui les tient (T11) comme l'heure de fin des engagements (T9) ne sont pas encore décidées.
2. **Carte d'ensemble à plusieurs villes** : numérotation, terminus, étiquettes et groupes par ville, zoom minimal, et carte propre de la Journée d'un changement de ville.

   Raison : la numérotation contredit la règle de Ligne (`docs/design-system/carte.md`, `StopMarker.test.tsx`) ; elle demande une décision UX/UI dans `docs/decisions/`.

Jusqu'à M4-suite, M4a à M4c livrent ce que fixe cette spécification :
- la ligne « Vers {ville} » à sa place ;
- l'arrivée « à confirmer » sans heure de fin ;
- le départ estimé provisoire (fin du dernier engagement de la ville quittée s'il finit avant 18:00, sinon 09:00) et son créneau provisoire de 3 heures sans durée connue, sauf remplacement par M4-TL (§ 3.4) ;
- aucun bandeau nouveau ;
- la carte d'ensemble d'aujourd'hui cadrée sur toutes les villes. C'est un **rendu intermédiaire provisoire**, avec des anneaux sans repère par ville : M4c n'est pas jugée sur sa forme, que fixera la décision UX/UI de M4-suite.
