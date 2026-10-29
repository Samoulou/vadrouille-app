# M4 — Plusieurs villes dans un même voyage (chaîne inversée, vraie app, même décalage horaire)

Rédaction : Product Owner · Date : 2026-10-29 · `main` relu : `56a560f` (après la fusion de 0141, `9abf68e`) · Ticket : #872 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 4, ligne M4-spec · Rôles des tâches qui suivent : tech-lead (M4-TL), ia-recherche (M4a), backend (M4b), frontend avec UX/UI (M4c) · Revue : Tech Lead, Sécurité, UX/UI.

**Correction 1** (revue consolidée du head `320366f`, Tech Lead) :
- bloquant 1 : renvois à 0141 revérifiés après sa fusion (§ 4.2, § 10 S3) ;
- bloquant 2 : règle du billet de trajet (§ 3.3, M4-PO-7) et fin d'engagement absente du brief (T9) ;
- bloquant 3 : propriétaire des règles de la journée de trajet posé à M4-TL (T11, § 3.2) ;
- bloquant 4 : l'ancienne M4-PO-10 devient la question Samuel 4 (§ 6, § 14) ;
- bloquant 5 : une seule règle de prérequis (ci-dessous) ;
- mineurs 6 à 16 : délai de veto retiré (§ 12), critère 9, exemple du critère 7, résumé de Séjour, T2 (b), modes, engagements sans fin, train de nuit, même ville de suite (T4), Q660, `MAX_CITIES`.

## Prérequis

Une seule règle, tâche par tâche :

| Tâche | Attend |
|---|---|
| M4-TL (décision du Tech Lead, cycle 221 du plan) | la fusion de cette spécification |
| M4a (prompt `programme` v5, jeu d'évaluation, cycle 222) | M4-TL. Elle attend aussi l'avis de la Sécurité sur **S2**, mais seulement si M4-TL retient l'option (a) de T2 (durée écrite par l'IA) |
| M4b (vérification et assemblage par séjour, cycle 223) | M4-TL, M4a, et l'avis de la Sécurité sur **S1** et **S4** (et sur **S2** si elle est déclenchée) |
| M4c (écrans, cycle 224) | M4b. L'ouverture de la recherche de ville pour les autres villes attend aussi l'avis de la Sécurité sur **S3**. Le reste de M4c ne l'attend pas |

Aucun code ne commence avant la fusion de M4-TL. Si M4-TL change un point de cette spécification, sa décision prime pour ce point. La Sécurité répond dans la revue de M4-TL ou par une décision à part.

**Écarts relevés dans le ticket**, sans effet sur le fond :
- le refus de `draft.otherCities` n'est pas dans `src/server/validation/depuis-formulaire.ts`, qui n'existe pas. Il est dans `briefDepuisFormulaire` (`src/server/programme/brief.ts`, l. 112), déplacé par M1a-1 (0136 § 1.1) et réexporté par `src/server/p0/depuis-formulaire.ts` ;
- les plafonds de la chaîne inversée sont l'objet de **Q639** (question 6 de la PR #829). **Q636** porte sur le récit et le logement envoyés au fournisseur de modèles. Les deux sont citées au § 6.

## 1. Contexte

- **Ce qui existe.**
  - Le contrat et la base gèrent déjà plusieurs villes : `TripDraft.otherCities` (`src/contracts/creation.ts`, borné par `MAX_CITIES = 4` de `src/contracts/values.ts`, l. 280, donc 3 autres villes au plus) et une ligne `stays` par ville, écrite par `createTrip` (`src/server/creation/creer-voyage.ts`).
  - L'écran 1 demande un logement par ville (F8-PO-3). Les villes se suivent sans trou ni chevauchement : chaque ville se termine le jour d'arrivée dans la suivante, avec au moins une nuit par ville (F8-PO-3, `checkCities`).
  - Le brief de la chaîne inversée a déjà une liste de logements avec leurs nuits (`BriefEssai.logements`, 1 à 5, `src/server/programme/forme.ts`).
  - Le contrôle des villes de `api` (`controlerVilles`, `src/lib/fuseaux/index.ts`) exige que chaque ville soit l'une des 62 de `villes-mvp.json`. Il exige aussi **le même décalage horaire** que la destination pendant les dates du voyage (B9-PO-18, assoupli par 0087 § 5).
- **Ce qui manque.**
  - La chaîne inversée refuse toute autre ville : `briefDepuisFormulaire` rend `draft.otherCities`, et `createTrip` refuse le brouillon avant toute écriture (M1a-PO-3, 0136 § 3.8).
  - Le prompt `programme` v4 n'écrit qu'une ville. `squelette()` (`src/domain/squelette.ts`) suppose un seul séjour.
  - Aucune règle ne dit ce que contient une journée où l'on change de ville.
  - La décision 0092 (temps de trajet conservés) ne vaut que pour le prototype, et Q637 (temps de trajet du MVP) est ouverte.
- **But de M4.** Dans la vraie app (`DATA_ADAPTER=api`, `CHAINE_APERCU = "inversee"`), il s'agit :
  - d'accepter un voyage de 2 ou 3 villes du même décalage horaire ;
  - d'écrire un programme qui passe d'une ville à l'autre par une **journée de trajet** ;
  - de le montrer à l'écran 1, à l'écran 5, dans la présentation, dans Séjour et dans Journée.

  Tout se développe et se teste en composition **simulée**, sans appel payant (barrière B9-TL-8 fermée).

## 2. Parcours

1. **Saisie** (écran 1, `/voyages/nouveau`). La personne saisit sa destination, ses dates et son logement, comme aujourd'hui. Sous « Autres villes », « Ajouter une ville » ajoute une ville. Chaque ville a un nom, une date d'arrivée et sa propre question « As-tu déjà un logement ? ». Il y a **3 villes au plus en tout**, destination comprise (M4-PO-2). Au plafond, « Ajouter une ville » est indisponible (`aria-disabled`, règle actuelle de `ADD_BUTTON_CLASS`).
2. **Ordre.** C'est l'ordre de saisie :
   - la destination est la ville 1 et commence à l'arrivée du voyage ;
   - chaque ville ajoutée commence à sa date d'arrivée, au moins une nuit après celle de la ville précédente ;
   - ce lot ne propose pas de réordonnancement : pour changer l'ordre, la personne retire une ville et la rajoute (« Retirer », vocabulaire actuel).
3. **Nuits par ville.** Elles se déduisent des dates : de l'arrivée dans la ville jusqu'à l'arrivée dans la suivante, ou jusqu'au départ du voyage pour la dernière. Il faut **au moins une nuit par ville** (F8-PO-3, inchangé). Le récapitulatif « Tes villes » affiche les plages (texte actuel `villes.plage`). La durée totale reste bornée à 15 jours (`PROTOTYPE_STAY_DAYS_MAX`, 0136 § 3.8 ; M4-PO-3).
4. **Logement par ville.** Chaque ville a sa réponse (« Oui », « Un quartier », « Pas encore »), avec les mêmes règles que la destination. Sous la chaîne inversée, chaque logement devient une entrée de `logements` du brief : le texte de `texteDuLogement` avec le nom de **sa** ville, et le nombre de nuits de cette ville. Il est vérifié sur Google comme le logement unique d'aujourd'hui (0136 § 3.2 : `stays.place_id` pour `known` et `suggestedLodging` seulement).
5. **Billets entre villes.** Une aide nouvelle sous « Autres villes » explique la règle du billet de trajet (§ 3.3, texte au § 8). Aucun champ nouveau n'est ajouté à l'écran 1 (M4-PO-7).
6. **Lancement.** `createTrip` revérifie les villes (nombre, ordre, nuits, table des 62, décalage horaire, même ville deux fois de suite). La chaîne inversée démarre ensuite comme pour une seule ville (0136 § 2).
7. **Écran 5, présentation et déblocage** : comme pour une seule ville (M4-PO-9). L'écran 5 nomme la ville de chaque jour (§ 7).
8. **Séjour et Journée** : le jour par jour est groupé par ville. La journée de trajet montre le passage d'une ville à l'autre (§ 7).

## 3. Journée de trajet

**Qui tient ces règles.** Le § 3 fixe des **règles de produit** : ce que la personne doit voir. Il ne dit pas quelle couche les garantit. Ce peut être le prompt `programme` v5, le moteur (`squelette.ts`, `moteur.json`), un contrôle de la sortie de l'IA, ou une combinaison des trois. C'est la question **T11** à M4-TL, et **la réponse de M4-TL fait foi**. Les critères 6 à 11 se testent dans la couche qu'elle désigne. Les mentions « par le code » ci-dessous sont des propositions du Product Owner, pas des décisions.

### 3.1 Définition (M4-PO-6)
1. Il y a **une journée de trajet par changement de ville**, à la date d'arrivée de la ville 2, puis de la ville 3. Un voyage de 3 villes en a donc deux.
2. Elle **appartient aux deux villes**. Elle commence au logement de la ville quittée (terminus `start`, libellé de ce logement) et se termine au logement de la ville d'arrivée (terminus `end`, libellé du nouveau logement). C'est la seule journée dont les deux terminus diffèrent.
3. Dans Séjour, elle est rangée sous la ville **où l'on dort** ce soir-là, donc la ville d'arrivée, comme la ligne `stays` qui commence ce jour-là (§ 7.3).
4. Le premier et le dernier jour du voyage ne sont jamais des journées de trajet entre villes. La ville 2 arrive au plus tôt le lendemain de l'arrivée du voyage, et la dernière ville a au moins une nuit.

### 3.2 Ce qu'elle contient (M4-PO-6)
Dans l'ordre de la ligne du jour :
1. **Le matin, dans la ville quittée** : départ du logement, puis des étapes près de ce logement s'il reste du temps avant le trajet.
2. **Le trajet** : une ligne « Trajet vers {ville} », avec le mode et la durée (§ 3.3). Ce n'est **pas une étape** : la ligne n'a pas de fiche, pas de numéro sur la carte, ni « Remplacer », « Déplacer » ou « Verrouiller ». Elle occupe son créneau, il n'y a donc pas de trou dans le programme (principe produit 4).
3. **Après l'arrivée, dans la ville d'arrivée** : des étapes près du nouveau logement s'il reste du temps, puis le repas du soir, puis le retour au logement.

Règles de remplissage. Les valeurs sont provisoires et révisables après le premier essai de Samuel. Si M4-TL les met dans le moteur, le Product Owner propose de les placer dans `moteur.json`, à côté de `activitesParRythme` (T11).
- **Marges.** Il y a au moins **45 minutes** entre la fin de la dernière étape du matin et le départ du trajet (aller à la gare, reprendre les bagages). Il y a au moins **30 minutes** entre l'arrivée et la première étape qui suit (déposer les bagages).
- **Activités.** Il y a **au plus** la moitié des activités d'un jour plein du rythme, arrondie au-dessus : 1 pour « tranquille », 2 pour « équilibré », 2 pour « intense » (`activitesParRythme` : 2, 3, 4). Elles sont choisies près du logement du moment. Ce n'est jamais une étape à réserver (`toReserve`), sauf si c'est un engagement saisi.
- **Déjeuner.** Il a lieu dans la ville où la personne se trouve à 12:30, si les marges le permettent. Si elle est en trajet à 12:30, ou si le déjeuner ne laisse pas la marge de 45 minutes avant le départ, il n'y a pas de déjeuner : la ligne du trajet ou le temps libre couvre ce créneau.
- **Dîner.** Il a lieu dans la ville d'arrivée, près du nouveau logement, si l'arrivée a lieu avant 20:00. Sinon, il n'y a pas de dîner et la ligne se termine au logement.
- **Long trajet.** Au-delà de 4 heures de trajet, la journée ne contient que les repas et le trajet, sans activité.
- **Titre du jour** (`Day.theme`) : « De {ville quittée} à {ville d'arrivée} ». *Proposition* : il est écrit par le code, pas par l'IA (T11).

**Effet voulu du départ estimé à 10:00.** La journée commence à 09:00 (`fenetreJour.debut`). Avec 45 minutes de marge, un trajet **estimé** ne laisse aucune étape le matin : la ligne va du départ du logement au trajet. C'est voulu. Sans billet, le studio ne connaît pas l'heure du train, et il vaut mieux ne rien promettre le matin. Un trajet **saisi** plus tard dans la journée laisse des étapes le matin (critère 7).

### 3.3 Heure, mode et durée du trajet (M4-PO-7)

**Règle du billet de trajet.** Le type « Billet » de l'écran 1 couvre aujourd'hui aussi les billets d'entrée (F8, exemple « [Tattoo] »). **Le jour d'un changement de ville**, un « Billet » est lu comme le **titre de transport entre les deux villes**, jamais comme un billet d'entrée. Ce sens ne vaut que pour la journée de trajet : les autres jours, « Billet » garde son sens actuel. Pour un concert ou un musée le jour du trajet, la personne choisit « Sortie ». L'aide de l'écran 1 le dit (§ 8). Le type « Vol » d'une journée de trajet est toujours le trajet.

Il y a deux cas, dans cet ordre de priorité :
1. **Trajet saisi.** Le « Billet » ou le « Vol » daté de la journée de trajet est **le trajet**.
   - Son heure de début est le départ. Son heure de fin, si elle est saisie, est l'arrivée.
   - Son libellé devient le mode affiché (« Train Rome–Florence »).
   - S'il y en a plusieurs ce jour-là, le premier qui commence est le trajet. Les autres restent des engagements ordinaires.
   - Sans heure de fin, le départ est celui du billet et la durée est estimée (cas 2).
   - **Fin de l'engagement** : `BriefEssai.engagements` ne porte aujourd'hui que l'heure de début (`brief.ts`, l. 76-81). L'heure d'arrivée doit atteindre la couche qui planifie la journée (T9).
2. **Trajet estimé.** Sans billet ni vol ce jour-là :
   - le départ est fixé à **10:00** ;
   - la durée vient de la méthode que choisira M4-TL (T2). Elle est **toujours affichée comme une estimation** (« environ 1 h 30 (estimation) »), jamais présentée comme l'horaire d'un train ;
   - le mode affiché vient des déplacements du brief (choix de produit provisoire) : « En voiture » si `car` est coché, même avec `transit`, sinon « En train ou en bus », y compris quand seul `walk` est coché ;
   - si aucune estimation n'existe, la ligne affiche « durée à confirmer », et le créneau réservé dans ce cas est fixé par M4-TL. Jamais une durée inventée n'est présentée comme sûre.

**Trajet de nuit** : hors de ce lot. Le contrat refuse déjà un engagement dont la fin précède le début (`TripCommitmentSchema`, « fin avant le début »). Un train de nuit se saisit donc sans heure de fin, et il est traité comme un départ saisi avec une durée estimée.

**Données Google** : aucune durée Google n'est écrite, nulle part (0011 ; 0092 ne vaut que pour le prototype ; Q637 ouverte). La source de la durée estimée revient à **M4-TL** (T2). Une durée saisie par la personne est une donnée de la personne, pas une donnée Google.

### 3.4 Engagements de la journée de trajet (M4-PO-8)
- Un engagement garde toujours son heure. Le programme ne le déplace jamais : c'est une étape verrouillée (cadrage § 3.2, F8-PO-3).
- Un engagement qui finit avant le départ du trajet a lieu dans la ville quittée. Un engagement qui commence après l'arrivée a lieu dans la ville d'arrivée.
- **Engagement sans heure de fin** : pour ces règles, il dure **1 heure** (valeur provisoire).
- Un engagement qui chevauche un **trajet estimé** fait partir le trajet après la fin de l'engagement, avec la marge de 45 minutes.
- Un engagement qui chevauche un **trajet saisi**, ou qui finit moins de 45 minutes avant son départ, reste en place. La journée affiche alors le bandeau du § 8 (« Ton trajet vers {ville} chevauche… »). Les deux sont des saisies de la personne : le studio ne choisit pas à sa place.
- Le « Vol » d'une journée de trajet n'est **pas** un vol d'arrivée ou de départ du voyage. `heuresDeVol` (`src/domain/squelette.ts`) ne lit que les vols du premier et du dernier jour, et `engagementsDuBrief` écarte aujourd'hui tout vol (T9).

## 4. Villes et décalage horaire (premier lot)

1. **Même décalage horaire** (M4-PO-5) : toutes les villes ont le même décalage UTC que la destination pendant les dates du voyage. C'est la règle actuelle de `controlerVilles` (B9-PO-18, 0087 § 5).
   - Exemples : Paris puis Berlin est accepté ; Lisbonne puis Madrid, ou Édimbourg puis Paris, sont refusés.
   - Le contrat garde un fuseau par voyage (`Trip.timeZone`).
   - Les voyages à plusieurs fuseaux sont un lot à part (M4d, `Stay.timeZone`, après le premier essai de Samuel).
2. **Quelles villes.** Chaque autre ville se choisit **comme la destination** : par la recherche de ville de **0141** (fusionnée, `9abf68e`) quand elle est ouverte sur l'écran 1 de `api`, sinon par le champ des 62 villes.
   - **Ouverture** : selon 0141 § 2.3 et § 6.2, la recherche de `api` ne s'ouvre que si `SEUILS_AUTOCOMPLETION_VALIDES` vaut `true` (après la validation des seuils par Samuel) **et** si la barrière B9-TL-8 rend `reelle` avec le crochet `accesReelApi` (corps défini par M1h). Les modules que nomme 0141 (`src/server/composition/villes-api.ts`, `src/server/villes/recherche.ts`, `src/server/config/villes.ts`, `src/server/generation/acces-reel.ts`) viendront avec la tâche de code M1f : ils ne sont pas encore dans `main`.
   - **Bornes** : la ville est bornée aux 62 de `villes-mvp.json` tant que Q626 est ouverte (0141 § 8 points 1 et 2, `villeMvpDuPays`).
   - **Ce qui est envoyé** : seul le **nom maison**. `OtherCity` n'a pas de `destinationRegion`, et `createTrip` de `api` contrôle par le nom (`controlerVilles`, 0141 § 6.3 point 3). Le `placeId` d'une ville n'est ni conservé ni envoyé.
   - **Montage** : 0141 § 6.4 ne monte la recherche que pour la destination. L'étendre aux autres villes fait partie de M4c. 0141 § 4 point 5 demande de revoir le plafond si la recherche sert après la connexion : ici, elle sert toujours avant (écran 1), donc ce point ne change pas.
3. **Même ville deux fois de suite** : refusée, avec le texte du § 8. Une ville qui revient plus tard est acceptée (Rome, Florence, puis Rome). Cette règle est nouvelle : ni `controlerVilles` ni `checkCities` ne la portent. Sa place revient à M4-TL (T4).
4. **Site d'essai** : il ne change pas (M4-PO-1). Il garde une seule ville et le texte `uneSeuleVille`.

## 5. Ce que la chaîne inversée doit produire (pour M4a et M4b)

1. **Brief vers l'IA.** Il contient :
   - la liste ordonnée des villes, avec pour chacune son nom maison, sa date d'arrivée, son nombre de nuits et le texte de son logement ;
   - les journées de trajet et leur forme (saisie ou estimée, heures) ;
   - les engagements de chaque jour.

   Rien d'autre n'y entre, et jamais une donnée Google (0011 § 4). La forme exacte (prompt `programme` v5) revient à ia-recherche dans M4a, sous la décision M4-TL.
2. **Secteurs par ville.** Les jours pleins d'une ville ne contiennent que des lieux de cette ville ou de ses environs, excursion d'un jour comprise (cadrage § 3.7 : la distance est un coût). Les incontournables de chaque ville sont répartis sur ses propres jours.
3. **Vérification par ville.** Chaque lieu est vérifié dans la ville du jour où il est placé. Un lieu trouvé dans une autre ville du voyage, ou loin de la ville de son jour, est traité comme introuvable (0116, badge « à confirmer »). La règle de distance revient à M4-TL (T5).
4. **Assemblage par séjour.** Chaque jour part du logement de sa ville et y revient, sauf la journée de trajet (§ 3.1). Les cases de l'aperçu suivent la règle actuelle (M4-PO-9).
5. **Écriture.** Une version 1 complète, comme 0136 § 3, avec une ligne `stays` par ville et le `place_id` de chaque logement vérifié. Aucun temps de trajet Google n'est écrit (critère 9 de M1a, rejoué).

## 6. Coût

**Constat.** Le coût d'un programme dépend surtout du **nombre de jours**, pas du nombre de villes. Le programme de Rome (5 jours) compte 30 lieux distincts et un logement. Le profil `programme` simulé réserve 90 Text Search et 90 fiches (0136 § 6.4). Une ville de plus ajoute :
- **un logement à vérifier** : une recherche Text Search « IDs only », gratuite (`places_text_search_essentials_ids_only`), et une fiche Enterprise à 0,02 USD au prix plein, avant la tranche gratuite (`prototype/config/prix-google.json`) ;
- **une journée de trajet**, qui a moins d'activités qu'un jour plein, donc moins de lieux ;
- **un prompt un peu plus long** (une ville, un logement et un trajet de plus), pour une sortie de même taille à nombre de jours égal.

Ordre de grandeur : quelques centimes de Google par ville en plus, et une part faible du coût de modèle. **Mais** un voyage de 15 jours en 3 villes compte environ 90 lieux et 3 logements, au-delà des 90 fiches du profil simulé : c'est la durée, pas les villes, qui pousse le forfait. Ces chiffres sont des estimations du Product Owner, à confirmer par M4-TL (T3) et par le premier essai réel.

**Qui tranche quoi** :
- la **forme technique du forfait** revient au **Tech Lead** (M4-TL, T3) : profil `programme` unique agrandi, part par ville ou part par jour, et valeurs de test de la variante simulée ;
- les **plafonds réels** et le **prix** reviennent à **Samuel**. Pour les plafonds, voir Q639 (recommandation : 2 USD d'IA par voyage, 10 USD par organisation et par jour, 5 USD par jour sans compte). Le studio pose les questions Samuel 1, 2 et 4 du § 14. La question 4 porte sur l'exigence « un voyage valide tient dans le forfait d'un voyage » : elle touche à l'argent, et elle n'est donc pas une décision du Product Owner. Le CEO la relaie à Samuel avec la réponse de M4-TL à T3 ;
- l'envoi du texte du logement de **chaque** ville au fournisseur de modèles relève de **Q636**, qui couvre déjà « le logement ». La question Samuel 3 du § 14 demande seulement de le confirmer.

## 7. Écrans touchés

### 7.1 Écran 1 — Créer le voyage (`/voyages/nouveau`, adaptateur `api`)
- « Au plus 3 villes en tout, destination comprise. » (clé existante `villes.maximum`, `{max}` = 3).
- Aide nouvelle : la règle du billet de trajet (§ 8).
- Erreurs sous le champ de la ville concernée, lues par le lecteur d'écran comme les autres erreurs de l'écran 1 : ville identique à la précédente, autre décalage horaire, ville inconnue (§ 8). Elles s'ajoutent à `villeNom`, `villeOrdre` et `villeAvantDepart`, qui ne changent pas.
- La recherche de ville sert à chaque ville ajoutée, comme à la destination, quand elle est ouverte (§ 4.2).

### 7.2 Écran 5 — Propositions prêtes (`/voyages/[id]/preparation`)
- Chaque mini-ligne de jour nomme sa ville : « Jour {n} · {ville} ». La journée de trajet est nommée « Jour {n} · De {ville} à {ville} ».
- Les 8 propositions restent celles de J1 puis J2 (M1a-PO-2, `selectionApercu`). Le trajet n'est jamais une case.
- Dans l'interface, on écrit « Tes premières propositions », jamais « Aperçu » (handover front-end § 10).

### 7.3 Écran 11 — Séjour (`/voyages/[id]`)
- **Plaque et titre** : la plaque garde la destination (ville 1). Sous la plaque, une ligne liste les villes dans l'ordre : « Rome · Florence · Venise ».
- **Jour par jour**, groupé par ville :
  - un intertitre de niveau 3 par ville : « {ville} · {n} nuits » (« 1 nuit » au singulier) ;
  - chaque jour est rangé sous la ville où l'on dort (§ 3.1 point 3), et le dernier jour du voyage sous la dernière ville ;
  - le résumé d'une journée de trajet commence par « Trajet vers {ville} · », suivi du résumé actuel du jour. Ses temps de trajet viennent du relecteur, comme pour toute journée de `api` (critère 9 de M1a). À défaut, il affiche « temps de trajet à confirmer » (`resumeTrajetAConfirmer`). La ligne du trajet entre villes n'entre pas dans ce total.
- **Carte d'ensemble** : elle montre les étapes de toutes les villes. Le trajet entre villes n'y est pas tracé comme un trajet à pied (rendu : UX/UI et M4-TL, T7).
- « À faire avant de partir » et « Pendant ton séjour » : inchangés.

### 7.4 Écran 12 — Journée (`/voyages/[id]/jour/[n]`), journée de trajet seulement
- La ligne du jour suit le § 3.2. La ligne du trajet a son propre rendu (écran non maquetté : UX/UI). Elle est lue « Trajet vers {ville}, {détail} ».
- Le bandeau du § 3.4 s'affiche en tête de la journée, en `StatusBanner`, dans la variante choisie par UX/UI.
- Les autres journées ne changent pas.

### 7.5 Hors de ces écrans
« Mes voyages », la vue partagée, « Pendant le voyage » (écran 15) et « Après le voyage » ne changent pas dans ce lot. Ils affichent la destination (ville 1), comme aujourd'hui.

## 8. Textes (français, provisoires, à valider par UX/UI)

Les textes suivent le § 10 du handover front-end : tutoiement, phrases courtes, aucun point d'exclamation, aucun mot technique (« fuseau horaire », « IANA », « UTC »). Ils vivent dans `src/i18n/fr/creation.json` et `src/i18n/fr/sejour.json`, sous des clés au choix de M4c.

| Où | Texte |
|---|---|
| Écran 1, aide des autres villes (nouveau) | « Tu as déjà un billet de train, de bus ou un vol pour aller d'une ville à l'autre ? Ajoute-le dans « Déjà réservé », avec ses heures de départ et d'arrivée : ton programme suivra ses horaires. Le jour où tu changes de ville, un « Billet » est compris comme ton billet de transport. Pour un concert ou une visite ce jour-là, choisis « Sortie ». » |
| Écran 1, maximum (existant) | « Au plus 3 villes en tout, destination comprise. » |
| Écran 1, même ville que la précédente | « Choisis une autre ville que la précédente. » |
| Écran 1, autre décalage horaire (B9-PO-18, forme de la question 14 (c) de B9, retenue par 0087 § 5) | « {ville} n'a pas la même heure que {destination}. Pour l'instant, toutes les villes d'un voyage doivent avoir la même heure. » |
| Écran 1, ville inconnue (B9-PO-18) | « Nous ne savons pas encore préparer un voyage à {ville}. » |
| Écran 5, jour d'une ville | « Jour {n} · {ville} » |
| Écran 5 et titre de la journée de trajet | « Jour {n} · De {ville} à {ville} » ; thème : « De {ville} à {ville} » |
| Séjour, villes sous la plaque | « {ville 1} · {ville 2} · {ville 3} » |
| Séjour, intertitre | « {ville} · {n} nuits » ; « {ville} · 1 nuit » |
| Séjour, début du résumé de la journée de trajet | « Trajet vers {ville} · », suivi du résumé actuel (`resume` ou `resumeTrajetAConfirmer`) |
| Journée, ligne du trajet | « Trajet vers {ville} » |
| Journée, détail, trajet saisi | « {libellé}, {heure de départ} – {heure d'arrivée} » ; sans heure d'arrivée : « {libellé}, départ à {heure}, environ {durée} (estimation) » |
| Journée, détail, trajet estimé | « {mode}, environ {durée} (estimation) » ; sans estimation : « {mode}, durée à confirmer » |
| Modes estimés (provisoires) | « En train ou en bus » ; « En voiture » |
| Journée, bandeau de chevauchement | « Ton trajet vers {ville} chevauche « {libellé} ». Vérifie tes horaires. » |

Formats : « 10:12 », « 10:12 – 11:47 », « 45 min », « 1 h 30 ».

## 9. Questions au Tech Lead (décision M4-TL, avant le code)

- **T1 — Forme du trajet dans le contrat.** Trois formes possibles :
  - un nouvel élément de ligne du jour (par exemple `{ type: "transfer", from, to, mode, start, end, source: "saisi" | "estime" }`) ;
  - un `Segment` étendu (son `mode` n'admet que `walk`, `transit` et `car`) ;
  - un champ de `Day`.

  *Proposition* : un élément `transfer` dans `DayLineItemSchema` et dans l'instantané, sans `placeId` ni donnée Google, avec une PR de contrat avant M4b.
- **T2 — Source de la durée estimée.** La règle « jamais une donnée Google stockée » est imposée. Options :
  - (a) une estimation de l'IA dans la sortie du prompt v5, texte maison marqué « estimation » (déclenche S2) ;
  - (b) une table maison des durées, écrite par le studio d'après une source non Google (par exemple les temps publiés par les exploitants ferroviaires, avec la date du relevé). Elle serait limitée aux paires de villes des 62 qui ont **le même décalage horaire**, seules admises dans un voyage (§ 4.1), et dans un rayon raisonnable. Son coût d'entretien (nombre de paires, relevé, mise à jour) est à chiffrer par M4-TL ;
  - (c) Routes relu à l'affichage, jamais écrit (relecteur de B8b) ;
  - (d) Routes à la génération, écrit seulement si Samuel répond oui à Q637 et si une décision étend 0092 au MVP.

  *Recommandation du PO* : (b) si son entretien reste raisonnable, sinon (a), toujours affichée comme estimation ; (c) en dernier recours.
- **T3 — Forfait.** Forme du forfait d'un voyage à plusieurs villes : profil `programme` unique agrandi, part par ville ou part par jour, avec les valeurs de test de la variante simulée. M4-TL donne le coût estimé, au prix plein, d'un voyage de référence de 3 villes et 10 jours, et d'un voyage de 3 villes et 15 jours. C'est la base de la question Samuel 4.
- **T4 — Trois villes au plus, et même ville de suite.** Deux choix pour le plafond :
  - baisser `MAX_CITIES` à 3 dans `src/contracts/values.ts`. Cela touche `mock`, l'ancienne chaîne et les tests de B9 et F8 (« brouillon à trois villes » reste valide) ;
  - refuser la 4e ville sous la chaîne inversée seulement. Il faut alors un champ (proposition : `draft.otherCities.2.name`).

  *Proposition* : baisser `MAX_CITIES` à 3, puisque F8-PO-3 dit « 4, provisoire ». Reste à dire où vit le refus de la même ville deux fois de suite (§ 4.3) : `checkCities` du contrat, `controlerVilles`, ou la conversion de la chaîne inversée. Il faut aussi son champ (proposition : le nom de la seconde ville).
- **T5 — Vérification par ville.** Biais de position de Text Search par ville (la ville du jour), et règle « loin de la ville du jour » (§ 5.3) : distance au centre de la ville de la table maison, et seuil.
- **T6 — Ville de chaque jour.** Séjour, l'écran 5 et Journée doivent savoir à quelle ville appartient chaque jour. Le contrat `Trip` n'a aujourd'hui que `destination`. Options : `Day.city` (texte maison), `Trip.cities` (nom, première et dernière date), ou une recomposition à la lecture depuis `stays` (`logementsDuJour`).
- **T7 — Carte.** Rendu de la journée de trajet sur la carte du jour et sur la carte d'ensemble : les étapes des deux villes sans tracé entre elles, ou deux vues. À voir avec UX/UI.
- **T8 — Module partagé.** `briefDepuisFormulaire` sert `p0Run` et `api`. Comment lever le refus de `draft.otherCities` pour `api` seulement, en gardant celui du site d'essai (M4-PO-1) : un paramètre de la conversion, ou deux fonctions ?
- **T9 — Engagements et trajet.** Trois points :
  - où se fait la détection du trajet saisi (règle du billet de trajet, § 3.3) et le placement des engagements (§ 3.4) ? *Proposition* : dans le code, de façon déterministe, avant le prompt ;
  - l'**heure de fin** des engagements doit atteindre la couche qui planifie. `BriefEssai.engagements` n'a que `heure` : faut-il un champ `fin` (évolution du brief et du prompt), ou un passage hors du brief ?
  - le « Vol » d'une journée de trajet ne doit pas être écarté par `engagementsDuBrief`, ni lu par `heuresDeVol`.
- **T10 — Tests.** Le critère 13 de M1a (`chaine-inversee: une seule ville`) et le test qui le porte changent d'attente pour `api` (1 à 3 villes acceptées). M4-TL écrit ce changement dans sa décision, avec la liste fermée des attentes modifiées, comme 0136 § 9. Aucun test n'est supprimé ni désactivé sans décision écrite (CLAUDE.md).
- **T11 — Qui tient les règles de la journée de trajet (§ 3.2 à § 3.4).** Les marges, le nombre d'activités, le départ à 10:00, les repas, le long trajet, le thème et le placement des engagements peuvent vivre à trois endroits :
  - dans le **prompt `programme` v5**, l'IA les appliquant ;
  - dans le **moteur** (`squelette.ts`, qui suppose aujourd'hui un seul séjour, et `moteur.json`) ;
  - dans un **contrôle de la sortie** de l'IA, qui refuse ou corrige ;
  - ou dans une combinaison des trois.

  La réponse de M4-TL fait foi. Elle dit aussi dans quelle tâche (M4a ou M4b) se testent les critères 6 à 11, et si les valeurs vont dans `moteur.json` (proposition du PO).

## 10. Questions à la Sécurité

- **S1** (bloque M4b) — Les textes des logements de 2 ou 3 villes partent au fournisseur de modèles et à Text Search, comme le logement unique aujourd'hui. Les libellés des engagements lus comme trajets partent au fournisseur de modèles. Le verdict 0139 couvre-t-il ce cas tel quel, avec Q636 et Q645, et avec le second point de Q660 (libellés d'engagements dans `requeteProgramme`) ?
- **S2** (déclenchée seulement si M4-TL retient l'option (a) de T2 ; bloque alors M4a et M4b) — Une durée écrite par l'IA est un texte maison du modèle. Faut-il, en plus de ceux de 0117, des contrôles de sortie (bornes, format) ?
- **S3** (bloque seulement l'ouverture de la recherche pour les autres villes, dans M4c) — La recherche de ville de 0141 servirait jusqu'à 3 fois par voyage, sur un écran anonyme, sous un plafond commun de 150 suggestions et 40 choix par jour (0141 § 2.3, valeurs proposées et non validées). Elle a aussi le débit par adresse du limiteur (0141 § 4 point 1). Le risque d'épuisement accepté pour `mvp-essai` (0141 § 4 point 6) change-t-il ?
- **S4** (bloque M4b) — Le nouvel élément « trajet » de l'instantané (T1) doit rester hors de la vue partagée tant que B12 ne l'a pas listé (liste blanche, 0103). Confirmation demandée.

## 11. Critères d'acceptation

Chaque critère est vérifié par un test nommé dans la PR de la tâche qui le porte : M4a, M4b ou M4c. Pour les critères 6 à 11, c'est la tâche que désigne M4-TL (T11). Les tests de base de données tournent en CI (`pnpm test:db`). Composition simulée, barrière fermée.

1. `plusieurs-villes: createTrip accepte deux villes` :
   - contexte : en `ci`, `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth`, `CHAINE_APERCU = "inversee"` ; voyage à Rome du 2027-05-04 au 2027-05-08, puis Florence à partir du 2027-05-06 ;
   - l'exécution passe à `ready` ou `incomplete` ;
   - il y a deux lignes `stays` : Rome du 05-04 au 05-06, Florence du 05-06 au 05-08 (fin exclusive) ;
   - la version 1 a un instantané qui passe `TripSnapshotSchema` et compte 5 jours.
2. `plusieurs-villes: trois villes acceptées, une quatrième refusée` :
   - Rome, Florence et Venise sont acceptés ;
   - une 4e ville est refusée (`validation_failed`, sur le champ de T4), sans aucune écriture ;
   - à l'écran 1, avec 3 villes, « Ajouter une ville » est indisponible et le texte « Au plus 3 villes en tout, destination comprise. » s'affiche.
3. `plusieurs-villes: même décalage horaire` :
   - Paris puis Berlin est accepté ;
   - Lisbonne puis Madrid, et Édimbourg puis Paris, sont refusés sur `draft.otherCities.0.name` ;
   - une ville hors des 62 est refusée sur son champ ;
   - aucune écriture.
4. `plusieurs-villes: même ville deux fois de suite refusée` : Rome puis Rome est refusé, sur le champ de T4, sans écriture. Rome, Florence, puis Rome est accepté.
5. `plusieurs-villes: brief vers l'IA` :
   - l'entrée du modèle contient les villes dans l'ordre, et pour chacune son nom maison, ses dates, ses nuits et le texte de son logement ;
   - la somme des nuits égale celle du voyage ;
   - les tests à valeurs sentinelles (`tests/unit/p0/sentinelles-google.test.ts`, `tests/unit/ia/prompts-sentinelles.test.ts`) sont rejoués : aucun `placeId`, aucun texte ni aucune durée Google.
6. `journée de trajet: une par changement de ville` :
   - pour 3 villes, il y a exactement deux journées de trajet, aux dates d'arrivée des villes 2 et 3 ;
   - chacune commence au terminus du logement de la ville quittée, finit à celui de la ville d'arrivée, et a pour thème « De {ville} à {ville} » ;
   - les autres jours commencent et finissent au logement de leur ville.
7. `journée de trajet: billet saisi` :
   - contexte : un engagement « Billet » « Train Rome–Florence » le 2027-05-06, de 15:05 à 16:40 ;
   - la ligne du trajet va de 15:05 à 16:40 et porte ce libellé, sans « (estimation) » ;
   - la dernière étape du matin à Rome se termine au plus tard à 14:20, et la première étape de Florence commence au plus tôt à 17:10 ;
   - le déjeuner a lieu à Rome et le dîner à Florence.
8. `journée de trajet: trajet estimé` :
   - sans billet ni vol, le trajet part à 10:00 et porte « (estimation) », ou « durée à confirmer » sans estimation ;
   - la journée n'a aucune étape avant le trajet ;
   - après le test 1, ni `trip_versions.snapshot` ni aucune autre table du schéma principal ne contient de durée Google (critère 9 de M1a, rejoué).
9. `journée de trajet: rythme et repas` :
   - il y a **au plus** 1, 2 et 2 activités pour « tranquille », « équilibré » et « intense » (§ 3.2) ;
   - le déjeuner a lieu dans la ville où la personne se trouve à 12:30, et il n'y en a pas si elle est en trajet ou si la marge de 45 minutes ne tient pas ;
   - le dîner a lieu dans la ville d'arrivée si l'arrivée est avant 20:00 ;
   - un trajet de plus de 4 heures ne laisse aucune activité.
10. `journée de trajet: engagements` :
    - un engagement garde son heure : avant le départ, il a lieu dans la ville quittée, après l'arrivée, dans la ville d'arrivée ;
    - un engagement sans heure de fin compte pour 1 heure ;
    - s'il chevauche un trajet estimé, le départ suit sa fin d'au moins 45 minutes ;
    - s'il chevauche un trajet saisi, ou s'il finit moins de 45 minutes avant son départ, le bandeau « Ton trajet vers {ville} chevauche… » s'affiche.
11. `journée de trajet: vol et billet d'un changement de ville` :
    - un « Vol » daté d'une journée de trajet devient le trajet, sans changer l'heure d'arrivée du premier jour ni celle de départ du dernier ;
    - un « Billet » de ce jour devient le trajet ;
    - un « Billet » d'un autre jour reste un engagement ordinaire ;
    - une « Sortie » de la journée de trajet n'est jamais le trajet.
12. `plusieurs-villes: vérification par ville` : en simulé, un lieu placé un jour de Florence et trouvé à Rome n'a pas de `placeId` et reçoit le traitement de 0116 (badge « à confirmer »).
13. `plusieurs-villes: aperçu inchangé` :
    - `listPreviewSlots` rend au plus 8 cases, prises dans J1 puis J2 (règle de 0136 § 3.4) ;
    - aucune case n'est un trajet ;
    - avant le déblocage, seules les journées de l'aperçu sont servies (0136 § 3.5, rejoué sur un voyage à 2 villes).
14. `Séjour: jour par jour groupé par ville` :
    - pour Rome puis Florence, le jour par jour montre les intertitres de niveau 3 « Rome · 2 nuits » et « Florence · 2 nuits » ;
    - la journée du 05-06 est rangée sous Florence, et son résumé commence par « Trajet vers Florence · » ;
    - sous la plaque s'affiche « Rome · Florence ».
15. `Journée: ligne du trajet` : la ligne du trajet n'a ni fiche, ni numéro sur la carte, ni action « Remplacer », « Déplacer » ou « Verrouiller ». Son nom accessible est « Trajet vers Florence, {détail} ».
16. `Écran 5: ville de chaque jour` : les mini-lignes affichent « Jour 1 · Rome » et « Jour 3 · De Rome à Florence ». Le mot « Aperçu » n'apparaît dans aucun texte d'interface ajouté.
17. `plusieurs-villes: site d'essai inchangé` : sur l'adaptateur `prototype`, une autre ville est toujours refusée avec le texte `uneSeuleVille`, et `p0Run` est inchangé.
18. `ancienne chaîne: inchangée` : avec `CHAINE_APERCU = "ancienne"`, les tests existants de B9b à B9e et de B10 passent sans modification. Seule exception : la valeur de `MAX_CITIES`, si M4-TL la change (T4), changement écrit dans sa décision.
19. `plusieurs-villes: forfait simulé` : un voyage de 3 villes et 15 jours tient dans le forfait simulé que fixe M4-TL (aucun refus `cap_reached`). Avec `PLAFONDS_USAGE = null`, aucun client réel n'est construit (rejeu de `src/server/generation/barriere-fermee.test.ts`).
20. **Accessibilité** : les contrôles axe (`pnpm test:a11y`) passent sur l'écran 1 avec 3 villes et une erreur de ville, sur Séjour à 2 villes et sur une journée de trajet. Chaque erreur de ville est reliée à son champ (`aria-describedby`).
21. **Bout en bout** (`tests/e2e/generation-api.api.spec.ts`, étendu) : connexion par un code lu dans Mailpit, création de Rome puis Florence, écran 5 jusqu'à « prêt », puis Séjour (deux intertitres), puis la journée de trajet.
22. `pnpm verify` vert (variante du studio : `env -u GOOGLE_MAPS_SERVER_KEY SKIP_DB_TESTS=1 pnpm verify`, les tests de base de données en CI).

## 12. Décisions du Product Owner

Décisions de détail fonctionnel. Elles sont **définitives dès la fusion de cette spécification**, sans délai de veto (décision 0093). Samuel peut les remettre en cause à tout moment par une nouvelle décision. Elles seront listées dans la note de version suivante (rubrique « Décisions prises par le studio »).

Elles restent dans le cadre du cadrage (§ 3.5 « plusieurs villes », tableau du § 6 « Préparer »). Elles ne touchent ni au prix, ni à l'argent, ni à l'architecture : les plafonds et le prix sont posés à Samuel (§ 14, questions 1, 2 et 4), et la forme technique au Tech Lead (T1 à T11).

- **M4-PO-1 — Périmètre du premier lot.** Seule la vraie app sous la chaîne inversée accepte plusieurs villes. Le site d'essai reste à une ville. L'ancienne chaîne reste telle quelle.
- **M4-PO-2 — Trois villes au plus**, destination comprise, dans la vraie app. Cela remplace « jusqu'à 4 villes (provisoire) » de F8-PO-3 pour ce chemin. Raison : sur un voyage de 5 à 10 jours (cible du cadrage), une 4e ville laisse moins de deux jours pleins par ville et ajoute une journée de trajet. La forme technique revient à M4-TL (T4).
- **M4-PO-3 — Nuits et ordre.** L'ordre est celui de la saisie, sans réordonnancement dans ce lot. Il faut au moins une nuit par ville (F8-PO-3, inchangé). La durée totale reste de 15 jours au plus (0136 § 3.8).
- **M4-PO-4 — Logement par ville.** Chaque ville a sa propre question de logement. Son logement entre dans le brief avec ses nuits et il est vérifié comme le logement unique d'aujourd'hui.
- **M4-PO-5 — Villes admises.**
  - Les 62 villes du MVP, tant que Q626 est ouverte.
  - Choisies par la recherche de 0141 quand elle est ouverte (§ 4.2), sinon par le champ actuel.
  - Même décalage horaire que la destination pendant les dates du voyage.
  - La même ville ne peut pas venir deux fois de suite. Elle peut revenir plus tard.
- **M4-PO-6 — Journée de trajet.** Une par changement de ville, à la date d'arrivée dans la ville suivante, du logement quitté au nouveau logement. Elle contient le matin dans la ville quittée, la ligne du trajet (qui n'est pas une étape), puis la ville d'arrivée. Les règles de produit du § 3.2 en fixent le remplissage : marges de 45 et 30 minutes, au plus la moitié des activités, repas, aucune activité au-delà de 4 heures de trajet, thème « De {ville} à {ville} », matin vide d'un trajet estimé. Elles sont provisoires et révisables après le premier essai de Samuel. Le choix de la couche qui les tient revient à M4-TL (T11).
- **M4-PO-7 — Règle du billet de trajet.** Le jour d'un changement de ville, un « Billet » est le titre de transport entre les deux villes, jamais un billet d'entrée. Un « Vol » de ce jour est aussi le trajet. Le premier qui commence compte. Les autres jours, « Billet » garde son sens. Sans billet ni vol, le départ est fixé à 10:00 et la durée est une estimation, toujours affichée comme telle. Aucun champ nouveau à l'écran 1 : une aide explique la règle et renvoie à « Sortie » pour un concert ou une visite. La source de l'estimation revient à M4-TL (T2).
- **M4-PO-8 — Engagements de la journée de trajet.** Ils gardent leur heure et sont placés dans la ville quittée ou dans la ville d'arrivée selon le trajet. Sans heure de fin, ils comptent pour 1 heure. Un chevauchement avec un trajet estimé décale le trajet. Un chevauchement avec un trajet saisi, ou une marge de moins de 45 minutes, est signalé, et la personne tranche.
- **M4-PO-9 — Aperçu, présentation et déblocage inchangés.** On garde les 8 propositions de J1 puis J2, et les journées servies avant le déblocage (M1a-PO-2, 0136 § 3.4 et § 3.5). Seul l'écran 5 nomme la ville de chaque jour.
- **M4-PO-10 — Séjour groupé par ville.** Un intertitre par ville, avec ses nuits. Chaque jour est rangé sous la ville où l'on dort. La plaque garde la destination, suivie de la liste des villes. La journée de trajet a son résumé « Trajet vers {ville} ».
- **M4-PO-11 — Textes.** Les textes du § 8 sont provisoires. UX/UI les valide ou les reformule sans changer la règle, et reste maître du rendu des écrans non maquettés (ligne du trajet, intertitres, bandeau).

## 13. Hors périmètre

- Les voyages à plusieurs fuseaux (M4d : contrat `Stay.timeZone`, amendement de B9-PO-18), après le premier essai de Samuel.
- Les villes hors des 62 (Q626).
- Un champ de saisie du trajet à l'écran 1 (mode, heure, durée) autre que les engagements existants, et un nouveau type d'engagement.
- Les trajets de nuit qui arrivent le lendemain (§ 3.3).
- La réservation de billets, les horaires réels de train et tout prix de transport.
- Le réordonnancement des villes par glisser-déposer.
- Le site d'essai, `p0Run`, le schéma `prototype` et la garde du mode réel.
- « Mes voyages », la vue partagée, « Pendant le voyage » et « Après le voyage » (§ 7.5).
- Tout appel réel, toute préversion, toute variable Vercel (M1h).
- La conservation de temps de trajet dans le schéma principal (Q637, Samuel).

## 14. Questions ouvertes, par destinataire

**Samuel** (réservées : argent, prix), avec recommandation. Le CEO relaie la question 4 avec la réponse de M4-TL à T3.
1. **Plafonds d'un voyage à plusieurs villes.** Les plafonds par voyage de Q639 (recommandation : 2 USD d'IA par voyage) valent-ils tels quels pour 2 ou 3 villes, sans supplément par ville ?
   - *Recommandation : oui.* Le coût suit surtout les jours ; une ville de plus ajoute surtout un logement à vérifier, de l'ordre de quelques centimes de Google (§ 6).
   - Bloque : les plafonds réels à M1h pour ces voyages. Ne bloque pas M4a à M4c, qui restent en simulé.
2. **Prix.** Un voyage à 2 ou 3 villes garde-t-il le même paiement unique qu'un voyage à une ville ?
   - *Recommandation : oui*, pour une offre simple et un coût presque égal.
   - Bloque : l'écran 9 d'un voyage à plusieurs villes, seulement si la réponse est non.
3. **Q636, précision.** La réponse à Q636 (logement envoyé au fournisseur de modèles) couvre-t-elle le logement de **chaque** ville du voyage ?
   - *Recommandation : oui*, aux mêmes conditions (`zdr`, `data_collection: "deny"`, mention sur l'écran 2).
   - Bloque : M1h pour ces voyages.
4. **Un voyage, un forfait** (ancienne M4-PO-10, retirée des décisions du PO parce qu'elle touche à l'argent). Les plafonds réels doivent-ils être assez hauts pour qu'un voyage valide, jusqu'à 3 villes et 15 jours, ne soit jamais refusé pour son nombre de villes ni pour sa durée ?
   - *Recommandation : oui pour le nombre de villes* : le forfait d'un voyage ne doit pas dépendre du nombre de villes.
   - *Pour la durée* : fixer les plafonds au vu du coût que M4-TL donnera (T3) pour 3 villes et 15 jours (environ 90 lieux et 3 logements). Sinon, ramener la durée maximale sous la chaîne inversée à ce que les plafonds couvrent (une borne que le PO fixerait alors).
   - Bloque : les plafonds réels à M1h pour les longs voyages. Ne bloque pas M4a à M4c.

**Tech Lead** (décision M4-TL, bloque M4a, M4b et M4c) : T1 à T11 du § 9, en particulier :
- T1, forme du trajet ;
- T2, source de la durée, jamais une donnée Google stockée ;
- T3, forfait et coût de référence ;
- T4, trois villes au plus et même ville de suite ;
- T9, heure de fin des engagements ;
- T11, couche qui tient les règles de la journée de trajet.

**Sécurité** : S1 à S4 du § 10, avec les blocages dits en tête (tableau des prérequis).

**UX/UI** : rendu des écrans non maquettés (ligne du trajet, intertitres de Séjour, ligne des villes sous la plaque, bandeau de chevauchement) et textes du § 8. Ne bloque pas le code (clés de `src/i18n`), mais bloque la fusion de M4c.

**ia-recherche** : forme du prompt `programme` v5 (§ 5), selon T11. Jeu d'évaluation de M4a, avec au moins :
- Rome puis Florence, avec un billet saisi ;
- Lisbonne puis Porto, avec un trajet estimé ;
- Paris, Lyon, puis Marseille, 3 villes au rythme « intense ».

Sorties simulées seulement. Bloque M4a.

**CEO** :
- ordre des tâches (M4-TL au cycle 221, puis M4a à M4c aux cycles 222 à 224 du plan) ;
- report dans `QUESTIONS.md` des questions ci-dessus ;
- relais de la question Samuel 4 avec M4-TL ;
- mention de M4-PO-2 (3 villes) et de M4-PO-7 (sens de « Billet » le jour d'un changement de ville) à côté de F8-PO-3 dans `specs/F8-creation-compte.md`, lors de l'amendement de F8 que demande déjà Q666 (non bloquant).
