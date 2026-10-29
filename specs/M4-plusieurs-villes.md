# M4 — Plusieurs villes dans un même voyage (chaîne inversée, vraie app, même décalage horaire)

Rédaction : Product Owner · Date : 2026-10-29 · `main` relu : `a936717` · Ticket : #872 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 4, ligne M4-spec · Rôles des tâches qui suivent : tech-lead (M4-TL), ia-recherche (M4a), backend (M4b), frontend avec UX/UI (M4c) · Revue : Tech Lead, Sécurité, UX/UI.

**Prérequis, dans cet ordre** :
1. cette spécification fusionnée ;
2. **décision du Tech Lead M4-TL**, qui répond aux questions T1 à T10 du § 9 (trajet entre villes, forfait, contrat) ;
3. **avis de la Sécurité** sur S1 à S4 du § 10, dans la revue de M4-TL ou par une décision à part ;
4. les tâches M4a (prompt `programme` v5 et jeu d'évaluation), M4b (vérification et assemblage par séjour) et M4c (écrans).

Le code ne commence pas avant le point 2. Si la décision M4-TL change un point de cette spécification, elle prime pour ce point.

**Écarts relevés dans le ticket**, sans effet sur le fond :
- le refus de `draft.otherCities` n'est pas dans `src/server/validation/depuis-formulaire.ts`, qui n'existe pas. Il est dans `briefDepuisFormulaire` (`src/server/programme/brief.ts`, l. 112), déplacé par M1a-1 (0136 § 1.1) et réexporté par `src/server/p0/depuis-formulaire.ts` ;
- les plafonds de la chaîne inversée sont l'objet de **Q639** (question 6 de la PR #829). **Q636** porte sur le récit et le logement envoyés au fournisseur de modèles. Les deux sont citées au § 6.

## 1. Contexte

- **Ce qui existe.** Le contrat et la base gèrent déjà plusieurs villes : `TripDraft.otherCities` (`src/contracts/creation.ts`, `MAX_CITIES = 4`, donc 3 autres villes au plus), une ligne `stays` par ville écrite par `createTrip` (`src/server/creation/creer-voyage.ts`), un logement saisi par ville à l'écran 1 (F8-PO-3). Les villes se suivent sans trou ni chevauchement : chaque ville se termine le jour d'arrivée dans la suivante, et il y a au moins une nuit par ville (F8-PO-3, `checkCities`). Le brief de la chaîne inversée a déjà une liste de logements avec leurs nuits (`BriefEssai.logements`, 1 à 5, `src/server/programme/forme.ts`). Le contrôle des villes de `api` (`controlerVilles`, `src/lib/fuseaux/index.ts`) exige que chaque ville soit l'une des 62 de `villes-mvp.json` et ait **le même décalage horaire** que la destination pendant les dates du voyage (B9-PO-18, assoupli par 0087 § 5).
- **Ce qui manque.** La chaîne inversée refuse toute autre ville : `briefDepuisFormulaire` rend `draft.otherCities`, et `createTrip` refuse le brouillon avant toute écriture (M1a-PO-3, 0136 § 3.8). Le prompt `programme` v4 n'écrit qu'une ville. Aucune règle ne dit ce que contient une journée où l'on change de ville. La décision 0092 (temps de trajet conservés) ne vaut que pour le prototype, et Q637 (temps de trajet du MVP) est ouverte.
- **But de M4.** Dans la vraie app (`DATA_ADAPTER=api`, `CHAINE_APERCU = "inversee"`), accepter un voyage de 2 ou 3 villes du même décalage horaire, écrire un programme qui passe d'une ville à l'autre par une **journée de trajet**, et le montrer à l'écran 1, à l'écran 5, dans la présentation, dans Séjour et dans Journée. Tout est développé et testé en composition **simulée**, sans appel payant (barrière B9-TL-8 fermée).

## 2. Parcours

1. **Saisie** (écran 1, `/voyages/nouveau`). La personne saisit sa destination, ses dates et son logement, comme aujourd'hui. Sous « Autres villes », « Ajouter une ville » ajoute une ville. Chaque ville a un nom, une date d'arrivée et sa propre question « As-tu déjà un logement ? ». Il y a **3 villes au plus en tout**, destination comprise (M4-PO-2). Au plafond, « Ajouter une ville » est indisponible (`aria-disabled`, règle actuelle de `ADD_BUTTON_CLASS`).
2. **Ordre.** L'ordre des villes est l'ordre de saisie. La destination est la ville 1, et elle commence à l'arrivée du voyage. Chaque ville ajoutée commence à sa date d'arrivée, qui doit suivre d'au moins une nuit celle de la ville précédente. Aucun réordonnancement n'est proposé dans ce lot : pour changer l'ordre, la personne retire une ville et la rajoute (« Retirer », vocabulaire actuel).
3. **Nuits par ville.** Elles se déduisent des dates : de l'arrivée dans la ville jusqu'à l'arrivée dans la suivante, ou jusqu'au départ du voyage pour la dernière. Il faut **au moins une nuit par ville** (F8-PO-3, inchangé). Le récapitulatif « Tes villes » affiche les plages (texte actuel `villes.plage`). La durée totale reste bornée à 15 jours (`PROTOTYPE_STAY_DAYS_MAX`, 0136 § 3.8, M4-PO-3).
4. **Logement par ville.** Chaque ville a sa réponse (« Oui », « Un quartier », « Pas encore »), avec les mêmes règles que la destination. Sous la chaîne inversée, chaque logement devient une entrée de `logements` du brief : le texte de `texteDuLogement`, avec le nom de **sa** ville, et le nombre de nuits de cette ville. Il est vérifié sur Google comme le logement unique d'aujourd'hui (0136 § 3.2 : `stays.place_id` pour `known` et `suggestedLodging` seulement).
5. **Billets entre villes.** Une aide nouvelle sous « Autres villes » invite à saisir un billet ou un vol entre deux villes dans « Déjà réservé », avec ses heures de départ et d'arrivée (texte au § 8). Aucun champ nouveau n'est ajouté à l'écran 1 (M4-PO-7).
6. **Lancement.** `createTrip` revérifie les villes (nombre, ordre, nuits, table des 62, décalage horaire), puis la chaîne inversée démarre comme pour une seule ville (0136 § 2).
7. **Écran 5, présentation et déblocage** : comme pour une seule ville (M4-PO-9). L'écran 5 nomme la ville de chaque jour (§ 7).
8. **Séjour et Journée** : le jour par jour est groupé par ville. La journée de trajet montre le passage d'une ville à l'autre (§ 7).

## 3. Journée de trajet

### 3.1 Définition (M4-PO-6)
1. Il y a **une journée de trajet par changement de ville** : c'est la date d'arrivée de la ville 2, puis celle de la ville 3. Un voyage de 3 villes en a donc deux.
2. Elle **appartient aux deux villes**. Elle commence au logement de la ville quittée (terminus `start`, libellé de ce logement) et se termine au logement de la ville d'arrivée (terminus `end`, libellé du nouveau logement). C'est la seule journée dont les deux terminus diffèrent.
3. Dans Séjour, elle est rangée sous la ville **où l'on dort** ce soir-là, donc la ville d'arrivée, comme la ligne `stays` qui commence ce jour-là (§ 7.3).
4. Le premier et le dernier jour du voyage ne sont jamais des journées de trajet entre villes : la ville 2 arrive au plus tôt le lendemain de l'arrivée du voyage, et la dernière ville a au moins une nuit.

### 3.2 Ce qu'elle contient (M4-PO-6)
Dans l'ordre de la ligne du jour :
1. **Le matin, dans la ville quittée** : départ du logement, puis des étapes près de ce logement s'il reste du temps avant le trajet.
2. **Le trajet** : une ligne « Trajet vers {ville} », avec le mode et la durée (§ 3.3). Ce n'est **pas une étape** : pas de fiche, pas de numéro sur la carte, pas de « Remplacer », « Déplacer » ni « Verrouiller ». Il occupe son créneau, donc il n'y a pas de trou dans le programme (principe produit 4).
3. **Après l'arrivée, dans la ville d'arrivée** : des étapes près du nouveau logement s'il reste du temps, puis le repas du soir, puis le retour au logement.

Règles de remplissage, valeurs provisoires et révisables après le premier essai de Samuel :
- **Marges.** Il y a au moins **45 minutes** entre la fin de la dernière étape du matin et le départ du trajet (aller à la gare, reprendre les bagages). Il y a au moins **30 minutes** entre l'arrivée et la première étape qui suit (déposer les bagages).
- **Activités.** Au plus la moitié des activités d'un jour plein du rythme, arrondie au-dessus : 1 pour « tranquille », 2 pour « équilibré », 2 pour « intense » (`activitesParRythme` : 2, 3, 4). Elles sont choisies près du logement du moment, et jamais une étape à réserver (`toReserve`), sauf si c'est un engagement saisi.
- **Déjeuner.** Il a lieu dans la ville où la personne se trouve à 12:30. Si elle est en trajet à 12:30, il n'y a pas de déjeuner : la ligne du trajet couvre ce créneau.
- **Dîner.** Il a lieu dans la ville d'arrivée, près du nouveau logement, si l'arrivée a lieu avant 20:00. Sinon, il n'y a pas de dîner, et la ligne se termine au logement.
- **Long trajet.** Si le trajet dure plus de 4 heures, la journée ne contient que les repas et le trajet, sans activité.
- **Titre du jour** (`Day.theme`) : « De {ville quittée} à {ville d'arrivée} », écrit par le code, pas par l'IA.

### 3.3 Heure, mode et durée du trajet (M4-PO-7)
Il y a deux cas, dans cet ordre de priorité :
1. **Trajet saisi.** Un engagement de type « Billet » ou « Vol », daté de la journée de trajet, est **le trajet**. Son heure de début est le départ. Son heure de fin, si elle est saisie, est l'arrivée. Son libellé devient le mode affiché (« Train Rome–Florence »). Si plusieurs engagements de ce type tombent ce jour-là, c'est celui qui commence le plus tôt qui compte. Les autres restent des engagements ordinaires. Sans heure de fin, le départ est saisi et la durée est estimée (cas 2).
2. **Trajet estimé.** Sans engagement, le départ est fixé à **10:00**. La durée vient de la méthode que choisira M4-TL. Elle est **toujours affichée comme une estimation** (« environ 1 h 30 (estimation) »), et jamais présentée comme l'horaire d'un train. Le mode affiché vient des déplacements du brief : « En voiture » si `car` est coché, sinon « En train ou en bus ». Si aucune estimation n'existe, la ligne affiche « durée à confirmer ». Le créneau réservé dans ce cas est fixé par M4-TL. Jamais une durée inventée n'est présentée comme sûre.

**Données Google** : aucune durée Google n'est écrite, nulle part (0011 ; 0092 ne vaut que pour le prototype ; Q637 ouverte). La source de la durée estimée est tranchée par **M4-TL** (question T2). Une durée saisie par la personne est une donnée de la personne, pas une donnée Google.

### 3.4 Engagements de la journée de trajet (M4-PO-8)
- Un engagement garde toujours son heure : le programme ne le déplace jamais (étape verrouillée, cadrage § 3.2, F8-PO-3).
- Un engagement qui finit avant le départ du trajet a lieu dans la ville quittée. Un engagement qui commence après l'arrivée a lieu dans la ville d'arrivée.
- Un engagement qui chevauche un **trajet estimé** fait partir le trajet après la fin de l'engagement, avec la marge de 45 minutes.
- Un engagement qui chevauche un **trajet saisi** reste en place, et la journée affiche le bandeau du § 8 (« Ton trajet vers {ville} chevauche… »). Les deux sont des saisies de la personne : le studio ne choisit pas à sa place.
- Le « Vol » d'une journée de trajet n'est **pas** un vol d'arrivée ou de départ du voyage : `heuresDeVol` (`src/domain/squelette.ts`) ne lit que les vols du premier et du dernier jour, et `engagementsDuBrief` écarte aujourd'hui tout vol (question T9).

## 4. Villes et décalage horaire (premier lot)

1. **Même décalage horaire** (M4-PO-5) : toutes les villes doivent avoir le même décalage UTC que la destination pendant les dates du voyage. C'est la règle actuelle de `controlerVilles` (B9-PO-18, 0087 § 5). Paris puis Berlin est accepté. Lisbonne puis Madrid, ou Édimbourg puis Paris, sont refusés. Le contrat garde un fuseau par voyage (`Trip.timeZone`). Les voyages à plusieurs fuseaux sont un lot à part (M4d, `Stay.timeZone`, après le premier essai de Samuel).
2. **Quelles villes.** Chaque autre ville se choisit **comme la destination** : par la recherche de ville de 0141 quand elle est ouverte sur l'écran 1 de `api`, sinon par le champ des 62 villes. Dans les deux cas, la ville est bornée aux 62 de `villes-mvp.json` tant que Q626 est ouverte (0141 § 8). Seul le **nom maison** est envoyé : `OtherCity` n'a pas de `destinationRegion`, et `createTrip` contrôle par le nom (0141 § 6.3 point 3). Le `placeId` d'une ville n'est ni conservé ni envoyé.
3. **Même ville deux fois de suite** : refusé, avec le texte du § 8. Une ville qui revient plus tard est acceptée (Rome, Florence, puis Rome).
4. **Site d'essai** : il ne change pas (M4-PO-1). Il garde une seule ville et le texte `uneSeuleVille`.

## 5. Ce que la chaîne inversée doit produire (pour M4a et M4b)

1. **Brief vers l'IA.** Il contient la liste ordonnée des villes, avec pour chacune : le nom maison, la date d'arrivée, le nombre de nuits et le texte de son logement. Il contient aussi les journées de trajet et leur forme (saisie ou estimée, heures), et les engagements de chaque jour. Rien d'autre n'y entre, et jamais une donnée Google (0011 § 4). La forme exacte (prompt `programme` v5) revient à ia-recherche dans M4a, sous la décision M4-TL.
2. **Secteurs par ville.** Les jours pleins d'une ville ne contiennent que des lieux de cette ville ou de ses environs (excursion d'un jour comprise, cadrage § 3.7 : la distance est un coût). Les incontournables de chaque ville sont répartis sur ses propres jours.
3. **Vérification par ville.** Chaque lieu est vérifié dans la ville du jour où il est placé. Un lieu trouvé dans une autre ville du voyage, ou loin de la ville de son jour, est traité comme introuvable (0116, badge « à confirmer »). La règle de distance revient à M4-TL (question T5).
4. **Assemblage par séjour.** Chaque jour part du logement de sa ville et y revient, sauf la journée de trajet (§ 3.1). Les cases de l'aperçu suivent la règle actuelle (M4-PO-9).
5. **Écriture.** Une version 1 complète, comme 0136 § 3, avec une ligne `stays` par ville et le `place_id` de chaque logement vérifié. Aucun temps de trajet n'est écrit (critère 9 de M1a, rejoué).

## 6. Coût

**Constat.** Le coût d'un programme dépend surtout du **nombre de jours**, pas du nombre de villes. Le programme de Rome (5 jours) compte 30 lieux distincts et un logement, et le profil `programme` simulé réserve 90 Text Search et 90 fiches (0136 § 6.4). Une ville de plus ajoute :
- **un logement à vérifier** : une recherche Text Search « IDs only », gratuite (`places_text_search_essentials_ids_only`), et une fiche Enterprise, à 0,02 USD au prix plein, avant la tranche gratuite (`prototype/config/prix-google.json`) ;
- **une journée de trajet**, qui a moins d'activités qu'un jour plein, donc moins de lieux ;
- **un prompt un peu plus long** (une ville, un logement et un trajet de plus) et une sortie de même taille pour un même nombre de jours.

Ordre de grandeur : quelques centimes de Google de plus par ville, et une part faible du coût de modèle. Ce sont des estimations du Product Owner, à confirmer par M4-TL et par le premier essai réel.

**Ce que le studio tranche, et ce qu'il ne tranche pas** :
- la **forme technique du forfait** (part par ville, par jour, ou profil `programme` agrandi, et les valeurs de test de la variante simulée) revient au **Tech Lead** (M4-TL, question T3) ;
- les **plafonds réels** (Q639 : 2 USD d'IA par voyage, 10 USD par organisation et par jour, 5 USD par jour sans compte, dans la recommandation) et le **prix** reviennent à **Samuel**. Ce sont les questions Samuel 1 et 2 du § 14 ;
- l'envoi du texte du logement de **chaque** ville au fournisseur de modèles relève de **Q636**, qui couvre déjà « le logement ». La question Samuel 3 du § 14 demande seulement de le confirmer.

**Exigence produit** (M4-PO-10) : un voyage valide de 3 villes et 15 jours doit tenir dans le forfait d'**un** voyage. Le forfait ne doit jamais refuser un voyage parce qu'il a plusieurs villes. Si M4-TL montre que ce n'est pas possible sous les plafonds proposés à Samuel, il le signale, et la question remonte à Samuel avant M4b.

## 7. Écrans touchés

### 7.1 Écran 1 — Créer le voyage (`/voyages/nouveau`, adaptateur `api`)
- « Au plus 3 villes en tout, destination comprise. » (clé existante `villes.maximum`, `{max}` = 3).
- Aide nouvelle sur les billets entre villes (§ 8).
- Erreurs sous le champ de la ville concernée, lues par le lecteur d'écran comme les autres erreurs de l'écran 1 : ville identique à la précédente, autre décalage horaire, ville inconnue (§ 8). Elles s'ajoutent à `villeNom`, `villeOrdre` et `villeAvantDepart`, qui ne changent pas.
- Recherche de ville pour chaque ville ajoutée, comme pour la destination (§ 4.2), quand elle est ouverte.

### 7.2 Écran 5 — Propositions prêtes (`/voyages/[id]/preparation`)
- Chaque mini-ligne de jour nomme sa ville : « Jour {n} · {ville} ». La journée de trajet est nommée « Jour {n} · De {ville} à {ville} ».
- Les 8 propositions restent celles de J1 puis J2 (M1a-PO-2, `selectionApercu`). Le trajet n'est jamais une case.
- Dans l'interface, on écrit « Tes premières propositions », jamais « Aperçu » (handover front-end § 10).

### 7.3 Écran 11 — Séjour (`/voyages/[id]`)
- **Plaque et titre** : la plaque garde la destination (ville 1). Sous la plaque, une ligne liste les villes dans l'ordre : « Rome · Florence · Venise ».
- **Jour par jour** : il est groupé par ville. Un intertitre par ville, de niveau 3 : « {ville} · {n} nuits » (« 1 nuit » au singulier). Chaque jour est rangé sous la ville où l'on dort (§ 3.1 point 3). Le dernier jour du voyage est rangé sous la dernière ville. Le résumé d'une journée de trajet commence par « Trajet vers {ville} · », puis le résumé actuel (`{etapes} · {duree} de trajet`).
- **Carte d'ensemble** : elle montre les étapes de toutes les villes. Le trajet entre villes n'y est pas tracé comme un trajet à pied (rendu : UX/UI et M4-TL, question T7).
- « À faire avant de partir » et « Pendant ton séjour » : inchangés.

### 7.4 Écran 12 — Journée (`/voyages/[id]/jour/[n]`), journée de trajet seulement
- La ligne du jour suit le § 3.2. La ligne du trajet a son propre rendu (écran non maquetté : UX/UI). Elle est lue « Trajet vers {ville}, {détail} ».
- Le bandeau de chevauchement du § 3.4 s'affiche en tête de la journée, en `StatusBanner`, avec la variante choisie par UX/UI.
- Les autres journées ne changent pas.

### 7.5 Hors de ces écrans
« Mes voyages », la vue partagée, « Pendant le voyage » (écran 15) et « Après le voyage » ne changent pas dans ce lot. Ils affichent la destination (ville 1), comme aujourd'hui.

## 8. Textes (français, provisoires, à valider par UX/UI)

Les textes suivent le § 10 du handover front-end : tutoiement, phrases courtes, aucun point d'exclamation, aucun mot technique (« fuseau horaire », « IANA », « UTC »). Ils vivent dans `src/i18n/fr/creation.json` et `src/i18n/fr/sejour.json`, sous des clés au choix de M4c.

| Où | Texte |
|---|---|
| Écran 1, aide des autres villes (nouveau) | « Tu as déjà un billet de train, de bus ou un vol entre deux villes ? Ajoute-le dans « Déjà réservé », avec ses heures de départ et d'arrivée : ton programme suivra ses horaires. » |
| Écran 1, maximum (existant) | « Au plus 3 villes en tout, destination comprise. » |
| Écran 1, même ville que la précédente | « Choisis une autre ville que la précédente. » |
| Écran 1, autre décalage horaire (B9-PO-18, forme de la question 14 (c) de B9, retenue par 0087 § 5) | « {ville} n'a pas la même heure que {destination}. Pour l'instant, toutes les villes d'un voyage doivent avoir la même heure. » |
| Écran 1, ville inconnue (B9-PO-18) | « Nous ne savons pas encore préparer un voyage à {ville}. » |
| Écran 5, jour d'une ville | « Jour {n} · {ville} » |
| Écran 5 et titre de la journée de trajet | « Jour {n} · De {ville} à {ville} » ; thème : « De {ville} à {ville} » |
| Séjour, villes sous la plaque | « {ville 1} · {ville 2} · {ville 3} » |
| Séjour, intertitre | « {ville} · {n} nuits » ; « {ville} · 1 nuit » |
| Séjour, résumé de la journée de trajet | « Trajet vers {ville} · {etapes} · {duree} de trajet » |
| Journée, ligne du trajet | « Trajet vers {ville} » |
| Journée, détail, trajet saisi | « {libellé}, {heure de départ} – {heure d'arrivée} » ; sans heure d'arrivée : « {libellé}, départ à {heure}, environ {durée} (estimation) » |
| Journée, détail, trajet estimé | « {mode}, environ {durée} (estimation) » ; sans estimation : « {mode}, durée à confirmer » |
| Modes estimés | « En train ou en bus » ; « En voiture » |
| Journée, bandeau de chevauchement | « Ton trajet vers {ville} chevauche « {libellé} ». Vérifie tes horaires. » |

Formats : « 10:12 », « 10:12 – 11:47 », « 45 min », « 1 h 30 ».

## 9. Propositions au Tech Lead (décision M4-TL, avant le code)

- **T1 — Forme du trajet dans le contrat.** Faut-il un nouvel élément de ligne du jour (par exemple `{ type: "transfer", from, to, mode, start, end, source: "saisi" | "estime" }`), ou bien un `Segment` étendu (son `mode` n'admet que `walk`, `transit` et `car`), ou un champ de `Day` ? *Proposition* : un élément `transfer` dans `DayLineItemSchema` et dans l'instantané, sans `placeId` ni donnée Google, avec une PR de contrat avant M4b.
- **T2 — Source de la durée estimée.** Options : (a) une estimation de l'IA dans la sortie du prompt v5, texte maison marqué « estimation » ; (b) une table maison des durées entre les 62 villes, écrite et sourcée par le studio ; (c) Routes relu à l'affichage, jamais écrit (relecteur de B8b) ; (d) Routes à la génération, écrit seulement si Samuel répond oui à Q637 et si une décision étend 0092 au MVP. La règle « jamais une donnée Google stockée » est imposée. *Recommandation du PO* : (b), puis (a) en repli, toujours affichée comme estimation ; (c) seulement si le Tech Lead juge la table trop coûteuse à tenir.
- **T3 — Forfait.** Forme du forfait d'un voyage à plusieurs villes : profil `programme` unique agrandi, part par ville ou part par jour, et valeurs de test de la variante simulée. Il faut tenir l'exigence M4-PO-10 (3 villes et 15 jours dans le forfait d'un voyage) et dire le coût estimé, au prix plein, d'un voyage de référence de 3 villes et 10 jours.
- **T4 — Trois villes au plus.** Faut-il baisser `MAX_CITIES` à 3 dans le contrat (effet sur `mock`, l'ancienne chaîne et les tests de B9 et F8 : « brouillon à trois villes » reste valide), ou refuser la 4e ville sous la chaîne inversée seulement, et sur quel champ (proposition : `draft.otherCities.2.name`) ? *Proposition* : baisser `MAX_CITIES` à 3, puisque F8-PO-3 dit « 4, provisoire ».
- **T5 — Vérification par ville.** Biais de position de Text Search par ville (la ville du jour), et règle « loin de la ville du jour » (§ 5.3) : distance au centre de la ville de la table maison, et seuil.
- **T6 — Ville de chaque jour.** Séjour, l'écran 5 et Journée doivent savoir à quelle ville appartient chaque jour. Faut-il `Day.city` (texte maison), `Trip.cities` (nom, première et dernière date), ou une recomposition à la lecture depuis `stays` (`logementsDuJour`) ? Le contrat `Trip` n'a aujourd'hui que `destination`.
- **T7 — Carte.** Rendu de la journée de trajet sur la carte du jour et sur la carte d'ensemble : les étapes des deux villes, sans tracé du trajet entre elles, ou deux vues. À voir avec UX/UI.
- **T8 — Module partagé.** `briefDepuisFormulaire` sert `p0Run` et `api`. Comment lever le refus de `draft.otherCities` pour `api` seulement, en gardant celui du site d'essai (M4-PO-1) : paramètre de la conversion, ou deux fonctions ?
- **T9 — Engagements et trajet.** La détection du trajet saisi (§ 3.3) et le placement des engagements (§ 3.4) sont faits par le **code**, de façon déterministe, avant le prompt. Le « Vol » d'une journée de trajet ne doit pas être écarté par `engagementsDuBrief`, ni lu par `heuresDeVol`.
- **T10 — Tests.** Le critère 13 de M1a (`chaine-inversee: une seule ville`) et le test qui le porte changent d'attente pour `api` (1 à 3 villes acceptées). M4-TL écrit ce changement dans sa décision, avec la liste fermée des attentes modifiées, comme 0136 § 9. Aucun test n'est supprimé ni désactivé sans décision écrite (CLAUDE.md).

## 10. Questions à la Sécurité (avant M4b)

- **S1** — Les textes des logements de 2 ou 3 villes, et les libellés des engagements lus comme trajets, partent au fournisseur de modèles et à Text Search, comme le logement unique aujourd'hui. Le verdict 0139 et les questions Q636, Q645 et Q660 couvrent-ils ce cas tel quel ?
- **S2** — Si M4-TL retient l'option (a) de T2 (durée écrite par l'IA), cette durée est un texte maison du modèle. Faut-il des contrôles de sortie de plus (bornes, format) en plus de ceux de 0117 ?
- **S3** — La recherche de ville de 0141 servirait jusqu'à 3 fois par voyage sur un écran anonyme, sous un plafond commun de 150 suggestions et 40 choix par jour (0141 § 2 et § 4.6). Le risque d'épuisement accepté pour `mvp-essai` change-t-il ?
- **S4** — Le nouvel élément « trajet » de l'instantané (T1) doit rester hors de la vue partagée tant que B12 ne l'a pas listé (liste blanche, 0103). Confirmation demandée.

## 11. Critères d'acceptation

Chaque critère est vérifié par un test nommé dans la PR de la tâche qui le porte (M4a, M4b ou M4c). Les tests de base de données tournent en CI (`pnpm test:db`). Composition simulée, barrière fermée.

1. `plusieurs-villes: createTrip accepte deux villes` : en `ci`, `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth`, `CHAINE_APERCU = "inversee"`, voyage Rome du 2027-05-04 au 2027-05-08, puis Florence à partir du 2027-05-06. L'exécution passe à `ready` ou `incomplete`. Il y a deux lignes `stays` (Rome du 05-04 au 05-06, Florence du 05-06 au 05-08, fin exclusive), une version 1 dont l'instantané passe `TripSnapshotSchema` et compte 5 jours.
2. `plusieurs-villes: trois villes acceptées, une quatrième refusée` : Rome, Florence et Venise sont acceptés. Une 4e ville est refusée (`validation_failed`, sur le champ de T4), sans aucune écriture. À l'écran 1, avec 3 villes, « Ajouter une ville » est indisponible et le texte « Au plus 3 villes en tout, destination comprise. » s'affiche.
3. `plusieurs-villes: même décalage horaire` : Paris puis Berlin est accepté. Lisbonne puis Madrid, et Édimbourg puis Paris, sont refusés sur `draft.otherCities.0.name`. Une ville hors des 62 est refusée sur son champ. Aucune écriture.
4. `plusieurs-villes: même ville deux fois de suite refusée` : Rome puis Rome est refusé sur `draft.otherCities.0.name`. Rome, Florence, puis Rome est accepté.
5. `plusieurs-villes: brief vers l'IA` : l'entrée du modèle contient les villes dans l'ordre, et pour chacune son nom maison, ses dates, ses nuits et le texte de son logement. La somme des nuits égale celle du voyage. Les tests à valeurs sentinelles (`tests/unit/p0/sentinelles-google.test.ts`, `tests/unit/ia/prompts-sentinelles.test.ts`) sont rejoués : aucun `placeId`, aucun texte ni aucune durée Google.
6. `journée de trajet: une par changement de ville` : pour 3 villes, il y a exactement deux journées de trajet, aux dates d'arrivée des villes 2 et 3. Chacune commence au terminus du logement de la ville quittée et se termine à celui de la ville d'arrivée. Son thème est « De {ville} à {ville} ». Les autres jours commencent et finissent au logement de leur ville.
7. `journée de trajet: billet saisi` : avec un engagement « Billet » « Train Rome–Florence » le 2027-05-06, de 10:12 à 11:47, la ligne du trajet va de 10:12 à 11:47 et porte ce libellé, sans « (estimation) ». La dernière étape du matin se termine au plus tard à 09:27, et la première étape de Florence commence au plus tôt à 12:17.
8. `journée de trajet: trajet estimé` : sans engagement, le trajet part à 10:00 et porte « (estimation) », ou « durée à confirmer » sans estimation. Après le test 1, ni `trip_versions.snapshot` ni aucune autre table du schéma principal ne contient de durée Google (critère 9 de M1a, rejoué).
9. `journée de trajet: rythme et repas` : le nombre d'activités respecte le § 3.2 (1, 2, 2). Le déjeuner a lieu dans la ville où la personne se trouve à 12:30, et il n'y en a pas si elle est en trajet. Le dîner a lieu dans la ville d'arrivée si l'arrivée est avant 20:00. Un trajet de plus de 4 heures ne laisse aucune activité.
10. `journée de trajet: engagements` : un engagement garde son heure. Avant le départ, il est dans la ville quittée ; après l'arrivée, dans la ville d'arrivée. S'il chevauche un trajet estimé, le départ suit sa fin de 45 minutes au moins. S'il chevauche un trajet saisi, le bandeau « Ton trajet vers {ville} chevauche… » s'affiche.
11. `journée de trajet: vol entre deux villes` : un « Vol » daté d'une journée de trajet devient le trajet. Il ne change ni l'heure d'arrivée du premier jour ni celle de départ du dernier.
12. `plusieurs-villes: vérification par ville` : en simulé, un lieu placé un jour de Florence et trouvé à Rome n'a pas de `placeId` et reçoit le traitement de 0116 (badge « à confirmer »).
13. `plusieurs-villes: aperçu inchangé` : `listPreviewSlots` rend au plus 8 cases, prises dans J1 puis J2 (règle de 0136 § 3.4). Aucune case n'est un trajet. Avant le déblocage, seules les journées de l'aperçu sont servies (0136 § 3.5, rejoué sur un voyage à 2 villes).
14. `Séjour: jour par jour groupé par ville` : pour Rome puis Florence, le jour par jour montre les intertitres de niveau 3 « Rome · 2 nuits » et « Florence · 2 nuits ». La journée du 05-06 est rangée sous Florence, et son résumé commence par « Trajet vers Florence · ». Sous la plaque s'affiche « Rome · Florence ».
15. `Journée: ligne du trajet` : la ligne du trajet n'a ni fiche, ni numéro sur la carte, ni action « Remplacer », « Déplacer » ou « Verrouiller ». Son nom accessible est « Trajet vers Florence, {détail} ».
16. `Écran 5: ville de chaque jour` : les mini-lignes affichent « Jour 1 · Rome » et « Jour 3 · De Rome à Florence ». Le mot « Aperçu » n'apparaît dans aucun texte d'interface ajouté.
17. `plusieurs-villes: site d'essai inchangé` : sur l'adaptateur `prototype`, une autre ville est toujours refusée avec le texte `uneSeuleVille`, et `p0Run` est inchangé.
18. `ancienne chaîne: inchangée` : avec `CHAINE_APERCU = "ancienne"`, les tests existants de B9b à B9e et de B10 passent sans modification, sauf la valeur de `MAX_CITIES` si M4-TL la change (T4), changement écrit dans sa décision.
19. `plusieurs-villes: forfait d'un voyage` : un voyage de 3 villes et 15 jours tient dans le forfait simulé de M4-TL (aucun refus `cap_reached`). Avec `PLAFONDS_USAGE = null`, aucun client réel n'est construit (rejeu de `src/server/generation/barriere-fermee.test.ts`).
20. **Accessibilité** : les contrôles axe (`pnpm test:a11y`) passent sur l'écran 1 avec 3 villes et une erreur de ville, sur Séjour à 2 villes et sur une journée de trajet. Chaque erreur de ville est reliée à son champ (`aria-describedby`).
21. **Bout en bout** (`tests/e2e/generation-api.api.spec.ts`, étendu) : connexion par un code lu dans Mailpit, création de Rome puis Florence, écran 5 jusqu'à « prêt », puis Séjour (deux intertitres), puis la journée de trajet.
22. `pnpm verify` vert (variante du studio : `env -u GOOGLE_MAPS_SERVER_KEY SKIP_DB_TESTS=1 pnpm verify`, les tests de base de données en CI).

## 12. Décisions du Product Owner

**Définitives sans veto de Samuel sous 2 jours après la fusion de cette spécification**, à la demande du ticket #872. C'est plus prudent que la règle générale de 0093 (définitives dès la fusion). Elles seront listées dans la note de version suivante (rubrique « Décisions prises par le studio »). Elles restent dans le cadre du cadrage (§ 3.5 « plusieurs villes », tableau du § 6 « Préparer ») et ne touchent ni au prix, ni à l'argent, ni à l'architecture.

- **M4-PO-1 — Périmètre du premier lot.** Seule la vraie app sous la chaîne inversée accepte plusieurs villes. Le site d'essai reste à une ville. L'ancienne chaîne reste telle quelle.
- **M4-PO-2 — Trois villes au plus**, destination comprise, dans la vraie app. Cela remplace « jusqu'à 4 villes (provisoire) » de F8-PO-3 pour ce chemin. Raison : sur un voyage de 5 à 10 jours (cible du cadrage), une 4e ville laisse moins de deux jours pleins par ville et ajoute une journée de trajet. La forme technique revient à M4-TL (T4).
- **M4-PO-3 — Nuits et ordre.** L'ordre est celui de la saisie, sans réordonnancement dans ce lot. Il faut au moins une nuit par ville (F8-PO-3, inchangé). La durée totale reste de 15 jours au plus (0136 § 3.8).
- **M4-PO-4 — Logement par ville.** Chaque ville a sa propre question de logement, et son logement entre dans le brief avec ses nuits. Il est vérifié comme le logement unique d'aujourd'hui.
- **M4-PO-5 — Villes admises.** Les 62 villes du MVP (tant que Q626 est ouverte), choisies par la recherche de 0141 si elle est ouverte, sinon par le champ actuel. Même décalage horaire que la destination pendant les dates du voyage. La même ville ne peut pas venir deux fois de suite ; elle peut revenir plus tard.
- **M4-PO-6 — Journée de trajet.** Une par changement de ville, à la date d'arrivée dans la ville suivante. Elle va du logement quitté au nouveau logement. Elle contient le matin dans la ville quittée, la ligne du trajet (qui n'est pas une étape), puis la ville d'arrivée. Ses règles de remplissage sont celles du § 3.2 (marges de 45 et 30 minutes, moitié des activités, repas, long trajet au-delà de 4 heures, thème), provisoires et révisables après le premier essai de Samuel.
- **M4-PO-7 — Trajet saisi d'abord, estimé sinon.** Un « Billet » ou un « Vol » de la journée de trajet est le trajet. Sinon, le départ est fixé à 10:00, et la durée est une estimation toujours affichée comme telle. Aucun champ nouveau à l'écran 1 : une aide renvoie à « Déjà réservé ». La source de l'estimation revient à M4-TL (T2).
- **M4-PO-8 — Engagements de la journée de trajet.** Ils gardent leur heure. Ils sont placés dans la ville quittée ou dans la ville d'arrivée selon le trajet. Un chevauchement avec un trajet estimé décale le trajet ; un chevauchement avec un trajet saisi est signalé et n'est pas tranché à la place de la personne.
- **M4-PO-9 — Aperçu, présentation et déblocage inchangés.** On garde les 8 propositions de J1 puis J2 et les journées servies avant le déblocage (M1a-PO-2, 0136 § 3.4 et § 3.5). Seul l'écran 5 nomme la ville de chaque jour.
- **M4-PO-10 — Un voyage, un forfait.** Un voyage valide de 3 villes et 15 jours doit tenir dans le forfait d'un voyage. Le nombre de villes ne doit jamais faire refuser un voyage. La forme du forfait revient au Tech Lead, les montants à Samuel.
- **M4-PO-11 — Séjour groupé par ville.** Un intertitre par ville, avec ses nuits. Chaque jour est rangé sous la ville où l'on dort. La plaque garde la destination, suivie de la liste des villes. La journée de trajet a son résumé « Trajet vers {ville} ».
- **M4-PO-12 — Textes.** Les textes du § 8, provisoires. UX/UI les valide ou les reformule sans changer la règle, et reste maître du rendu des écrans non maquettés (ligne du trajet, intertitres, bandeau).

## 13. Hors périmètre

- Les voyages à plusieurs fuseaux (M4d : contrat `Stay.timeZone`, amendement de B9-PO-18), après le premier essai de Samuel.
- Les villes hors des 62 (Q626).
- Un champ de saisie du trajet à l'écran 1 (mode, heure, durée) autre que les engagements existants.
- La réservation de billets, les horaires réels de train et tout prix de transport.
- Le réordonnancement des villes par glisser-déposer.
- Le site d'essai, `p0Run`, le schéma `prototype` et la garde du mode réel.
- « Mes voyages », la vue partagée, « Pendant le voyage » et « Après le voyage » (§ 7.5).
- Tout appel réel, toute préversion, toute variable Vercel (M1h).
- La conservation de temps de trajet dans le schéma principal (Q637, Samuel).

## 14. Questions ouvertes, par destinataire

**Samuel** (réservées : argent, prix), avec recommandation :
1. **Plafonds d'un voyage à plusieurs villes.** Les plafonds par voyage de Q639 (recommandation : 2 USD d'IA par voyage) valent-ils tels quels pour 2 ou 3 villes, sans supplément par ville ? *Recommandation : oui.* Le coût dépend surtout du nombre de jours. Une ville de plus ajoute surtout un logement à vérifier, de l'ordre de quelques centimes de Google (§ 6). Bloque : les plafonds réels à M1h pour les voyages à plusieurs villes. Ne bloque pas M4a à M4c, qui restent en simulé.
2. **Prix.** Un voyage à 2 ou 3 villes garde-t-il le même paiement unique qu'un voyage à une ville ? *Recommandation : oui*, pour une offre simple et un coût presque égal. Bloque : l'écran 9 d'un voyage à plusieurs villes, seulement si la réponse est non.
3. **Q636, précision.** La réponse à Q636 (logement envoyé au fournisseur de modèles) couvre-t-elle le logement de **chaque** ville du voyage ? *Recommandation : oui*, aux mêmes conditions (`zdr`, `data_collection: "deny"`, mention sur l'écran 2). Bloque : M1h pour les voyages à plusieurs villes.

**Tech Lead** (décision M4-TL) : T1 à T10 du § 9, en particulier T1 (forme du trajet), T2 (source de la durée, jamais une donnée Google stockée), T3 (forfait) et T4 (trois villes au plus). Elles bloquent M4a et M4b.

**Sécurité** : S1 à S4 du § 10. Elles bloquent M4b (S1, S2, S4) et l'ouverture de la recherche pour les autres villes (S3).

**UX/UI** : rendu de la ligne du trajet, des intertitres de Séjour, de la ligne des villes sous la plaque et du bandeau de chevauchement (écrans non maquettés), et textes du § 8. Ne bloque pas le code (clés de `src/i18n`), mais bloque la fusion de M4c.

**ia-recherche** : forme du prompt `programme` v5 (§ 5), jeu d'évaluation de M4a avec au moins Rome puis Florence (billet saisi), Lisbonne puis Porto (trajet estimé), et Paris, Lyon, puis Marseille (3 villes, rythme « intense »). Sorties simulées seulement. Bloque M4a.

**CEO** : ordre des tâches (M4-TL, puis M4a à M4c, cycles 221 à 224 du plan) ; report dans `QUESTIONS.md` des questions ci-dessus ; mention de M4-PO-2 à côté de F8-PO-3 dans `specs/F8-creation-compte.md` lors de l'amendement de F8 que demande déjà Q666 (non bloquant).
