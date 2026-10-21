# P0-programme-par-ia — Le programme complet écrit par l'IA, vérifié par le code (prototype `p0Run`, premier lot)

**Ordre de fusion** : #623 (cette spécification et 0115), puis #628 (`docs/decisions/0116-reponses-tl-programme-par-ia-lot-1.md`, Tech Lead), puis #627 (`docs/decisions/0117-verdict-securite-programme-par-ia.md`, Sécurité). Les renvois à 0116 et 0117 désignent ces chemins sur `main`.

Rôle d'exécution : **proposé** ia-recherche (prompts, sortie du modèle, étapes de `p0Run` ; commits `[ia]`), avec le backend pour l'écriture du programme si le découpage du § 9 le demande ; le choix revient au CEO · Revue : Tech Lead **et** Sécurité · Rédaction : Product Owner · Date : 2026-10-21 · Ticket : #622 · Décision : 0115 (décision de Samuel du 2026-10-21, « on va inverser ») · Référence de qualité : les plans de Samuel (`/mnt/project-files/essai-reel/exemples/rome-samuel.pdf`, `edimbourg-samuel.pdf`) et le plan « façon chat » (`rome-plan-chat-claude.md`) · Briefs d'essai : `prototype/briefs/rome-1.json`, `edimbourg-1.json`

**Où ça se joue** : la page d'essai de Samuel sur `p0-reel` (`/prototype/executions`, puis « Mes voyages », « Journée », « Présentation »). C'est là qu'il juge. Tout ce qui n'est pas visible là n'est pas dans ce lot.

**Ce que cette spécification ne tranche pas** : le format exact de la sortie, le nombre d'appels, les étapes du workflow, les modules et fichiers touchés, les noms et l'emplacement des tests, l'emplacement des infos pratiques dans les contrats (Tech Lead, § 7, tranchés par 0116) ; les contrôles de la sortie (Sécurité, § 8, tranchés par 0117) ; quand elle cite un nom de module ou de test, c'est une proposition, et 0116 prévaut ; rien de nouveau pour Samuel (§ 8, une seule question facultative).

## Prérequis
- Décision 0115 fusionnée (même PR que cette spécification).
- Décisions du Tech Lead sur T1 à T7 (§ 7) : 0116 ; verdict de la Sécurité sur S1 à S5 (§ 8) : 0117. Toutes deux fusionnées après cette spécification (ordre en tête) et **avant l'ouverture de la PR de code**.
- `main` amené sur `p0-reel` avant l'essai réel (fusion habituelle, hors de cette tâche).

## Objectif
Qu'un essai réel de `p0Run` sur `rome-1` donne un programme que Samuel reconnaisse comme un vrai plan de voyage : cinq journées pleines du midi de l'arrivée au départ, panini à midi, apéro puis carbonara le soir, Colisée, Forum, Panthéon, Trevi, Vatican, chaque lieu expliqué et conseillé, un ou deux quartiers par jour, chaque lieu vérifié sur Google ou marqué « à confirmer », les temps de trajet affichés. Et la même chose sur `edimbourg-1` (distillerie en train, pubs, haggis, Arthur's Seat).

## La chaîne (décision 0115 § 3)
1. **Rédaction** : un prompt versionné `programme` (v1, `src/ai/prompts/`) reçoit le brief (jamais une donnée Google) et rend le programme complet en JSON (§ 3).
2. **Vérification** : pour chaque lieu du programme, Text Search par le nom écrit par l'IA et la ville → identifiant ; une fiche par lieu trouvé (statut, horaires d'ouverture aux dates du créneau, position) ; verdict par lieu (`verifie`, `introuvable`, `ferme`, `hors_zone`) **en mémoire seulement, jamais écrit ni compté** (0011 § 2). Ancrage existant (`src/grounding`), positions dans `place_coordinates` (0027), horaires lus en mémoire seulement.
3. **Trajets** : matrices Routes entre étapes consécutives avec `placeId` de chaque jour, mode du brief, temps conservés avec le programme (0092).
4. **Écriture et affichage** : programme réduit dans `prototype.programmes`, lecture et écrans existants ; lieu introuvable, hors zone ou fermé définitivement écrit **sans `placeId`**, sans position ni trajet ; lieu fermé le jour de son créneau écrit avec son `placeId` ; badge « à confirmer » **jamais écrit**, calculé à la lecture (0011 § 5, § 4).

Rien d'autre ne change dans `p0Run` : garde, réservation, forfait, plafonds de `mode-reel.json`, journal (`p0.step_failed`, codes fermés), purge, « Mes voyages ».

## 0. Premier lot (prototype `p0Run`) — texte du ticket de code pour le rôle ia
Feu vert de Samuel : 2026-10-21 05:52 UTC, « Ok go tu peux lancer le plan ». Le 2026-10-21 à 05:51 UTC (fil « Routine cycle du studio »), Samuel a **demandé explicitement** que **l'IA reçoive toutes les saisies du questionnaire** : dates et heures d'arrivée et de départ, voyageurs, logement (texte saisi et nuits), rythme, envies, déplacements, budget repas, texte libre (récit) ; **jamais une donnée Google**. Pour le prototype, c'est tout le brief (`BriefSchema`, `src/prototype/brief.ts`), y compris le récit et le logement que `ComplementP0` tenait aujourd'hui à l'écart de l'entrée des modèles (B7-PO-1) : le prompt `programme` les reçoit, entre les bornes de données.

**Données personnelles hors UE** : le récit et le logement partent au fournisseur de modèles (hors UE). La confirmation de cette incidence a été demandée à Samuel par le CEO le 2026-10-21 06:20 UTC et est **en attente** (`QUESTIONS.md`, CEO). D'ici là, la PR de code, ses tests et le mode simulé n'envoient que les briefs commités du prototype (`prototype/briefs/*.json`, textes de test publics). `zdr: true` et `data_collection: "deny"` pour la requête `programme`, avec échec fermé comme 0096 § 4.1 : verdict de la Sécurité (0117, S5, § 8).

**Critère de réussite du lot** : Samuel relance `rome-1` sur la page d'essai de `p0-reel` et obtient, dans « Mes voyages », des **journées complètes** (déjeuner, apéro, dîner, incontournables de Rome), chaque lieu vérifié ou « à confirmer », les temps de trajet affichés entre lieux vérifiés. Les critères A1 à A12 (§ 5) sont la version mesurable de ce constat.

**Périmètre exact** (le découpage en étapes, les modules, les fichiers et les tests sont **ceux de 0116** ; ce qui suit dit le résultat attendu)
1. Nouveau prompt `programme` v1 (`src/ai/prompts/`) ; entrée : le brief entier en vue du modèle, schéma strict sans champ pour une donnée Google ; type d'entrée, adaptateur et nature de requête selon 0116 (§ 1 et § 2).
2. Sortie tolérante (§ 3, modèle 0111) : schéma, lecture et bornes selon 0116 § 1 ; contrôles selon 0117 § 1.
3. `p0Run` : étapes selon 0116 § 3 (forme, déroulé, codes d'arrêt) ; garde, journal à codes fermés, `maxRetries = 0`, composition `src/server/composition/p0-reel.ts` et clients inchangés.
4. Vérification selon 0116 § 4 (`src/grounding` existant, Text Search restreint à la zone, masque `id`, puis fiche) ; `placeId` écrit seulement pour un lieu trouvé dans la zone et non fermé définitivement (§ 4) ; verdicts en mémoire, **jamais écrits ni comptés**.
5. Trajets et écriture : trajets entre étapes consécutives avec `placeId`, temps conservés (0092, inchangé) ; programme réduit écrit avec le programme de l'IA (horaires de l'IA, badge `toReserve`, raisons = `pourquoi`), **jamais `toConfirm`** (calculé à la lecture, 0011 § 5) ; modules touchés selon 0116.
6. Rapport et journal : compteurs maison du § 6 (liste fermée, 0117 § 4) ; étapes avec et sans `placeId` calculées à la lecture du programme stocké ; aucun compteur de verdict.
7. Jeu d'évaluation `evals/` (sorties simulées rome-1 et edimbourg-1, critères A1 à A6, A11) ; modèle simulé ; mode simulé `pnpm p0` par la nouvelle chaîne (0116 § 7.2).
8. Tests : ceux du § 5 et de 0116 § 8, placés et nommés par le Tech Lead. Les tests de `p0Run` qui importent les étapes remplacées (`tests/unit/workflows/p0-run.test.ts`, `p0-run-finale.test.ts`, `p0-run-hors-vercel.test.ts`, `tests/support/banc-apercu.ts`, `src/workflows/apercu.test.ts`, d'après la revue de #623) sont **réécrits selon 0116 (T7, § 7 et § 8)**, qui les liste et constitue la décision écrite exigée par `CLAUDE.md` ; la PR de code liste chaque test réécrit (ancien et nouveau nom). Aucun test supprimé ni désactivé.

**Ce qui est retiré de `p0Run`** (le remplissage maison, 0115 § 3) : plan de recherche par secteurs (prompt `plan`), agent de recherche web à tours (prompt `recherche`, `src/research`), notation (`noter-candidats`, prompt `notation`), classement (`classement.json`), squelette et planification par capacité et par durée (`squelette`, `planifier`, P0S2-PO-26 et PO-27), créneaux de repli, rédaction séparée des raisons (prompt `raisons`), quartier conseillé (prompt `quartier`). Ces modules ne sont **plus appelés** par `p0Run` ; leur code reste au lot 1 (0116 § 7).

**Ce qui ne change pas** : garde du mode réel, réservation et forfait, plafonds de `prototype/config/mode-reel.json` (aucune valeur relevée), purge, positions et temps conservés, lecture des programmes, page d'essai, écrans. Aucune donnée Google dans un prompt, un journal, un état ou le dépôt.

**Contrôles minimaux sur la sortie de l'IA** (S1, « on restreindra au besoin ») : schéma tolérant (champ facultatif invalide retiré, créneau gardé ; clé inconnue ignorée ; texte trop long coupé à sa borne, sur un graphème, après contrôle du texte entier), URL et domaines refusés, balises et caractères hors jeu refusés (`texteMaison`, `contientUrl`), `lieu` obligatoire sauf pour `arrivee`, `depart` et `pause` (0116 T1), `pourquoi` obligatoire dès qu'il y a un lieu (sinon créneau retiré et compté `creneauxRetires`) ; heure ou nature invalide : créneau retiré ; détail selon 0117 § 1 ; journée jamais retirée pour un créneau ; programme refusé (`model_output_invalid`, arrêt fermé) seulement sans aucune journée lisible. **Aucun** contrôle de nombre de lieux, de durée, de distance ni de cohérence des horaires.

**Branche** : `claude/<ticket>-programme-par-ia` ; commits `[ia]` ; PR « Closes #<ticket> » qui cite 0116 et 0117 ; `pnpm verify` au vert ; aucun essai réel par le studio.

## 1. À livrer (premier lot, détail)
1. **Prompt `programme` v1** (`src/ai/prompts/programme.ts`), dans les règles des prompts existants (données entre bornes, aucune URL dans les textes, JSON seul). Il dit à l'IA d'écrire le programme **comme elle le ferait dans un chat** : jour par jour, heures, repas de midi et du soir, apéro et soirée si le brief les évoque, incontournables de la destination qui correspondent aux envies, une ligne de « pourquoi » et un conseil par lieu, un titre de jour par quartier(s), les bons plans du séjour. Il ne lui impose **ni** nombre de lieux, **ni** durée, **ni** distance (0115 § 2 point 5).
2. **Schéma de sortie tolérant** (`src/ai/sorties.ts`, modèle 0111) : § 3 et § 8.
3. **Étapes de `p0Run`** remplacées : rédaction, vérification, trajets et écriture, dans la forme de 0116 § 3. Les étapes actuelles (recherche, ancrage, notation, classement, planification, raisons) **ne sont plus appelées** par `p0Run` ; leur code reste au lot 1 (0116 § 7) et les tests qui les importent sont réécrits selon 0116 § 8 (§ 0 point 8).
4. **Programme réduit** : un créneau de l'IA devient une ligne du programme dans la forme de 0116 § 6 (`kind`, lignes `terminus` et `free`), avec le nom de l'IA comme nom, son « pourquoi » comme raison, `toReserve` si l'IA dit « à réserver », **sans `placeId`** si le lieu est introuvable, hors zone ou fermé définitivement ; **jamais `toConfirm`** écrit (badge calculé à la lecture, § 4). Horaires : ceux de l'IA (début, fin). Infos pratiques : selon T6.
5. **Rapport** : compteurs du § 6, sans nom de lieu, sans motif ni donnée Google ; aucun compteur de verdict stocké ni journalisé.
6. **Jeu d'évaluation hors réseau** (`evals/`) : sorties enregistrées du prompt `programme` pour rome-1 et edimbourg-1 (modèle simulé de `src/ai/modeles.simule.ts`), évaluées sur les critères du § 5.
7. **Mode simulé** de `pnpm p0` et banc de base : passent par la nouvelle chaîne avec une sortie simulée, pour que la CI prouve l'écriture et l'affichage sans appel.

## 2. Ce que la tâche ne fait pas
- Aucun changement de la chaîne du MVP (`src/server/generation`, B7 à B9), de ses prompts ni de ses tests (0115 § 5.5).
- Aucun remplacement automatique d'un lieu introuvable (§ 7 T5, lot 2).
- Aucune nouvelle recherche web : le lot 1 n'appelle pas l'agent de recherche (`src/research`) ; les infos pratiques viennent des connaissances du modèle et sont affichées « à confirmer » (§ 4).
- Aucun relèvement de plafond, aucune nouvelle variable d'environnement, aucun essai réel par le studio (l'essai est celui de Samuel).
- Aucune donnée Google dans le prompt, le journal, l'état du workflow, le rapport ou le dépôt (0011) ; aucun nom Google affiché hors de la carte (0115 § 4.3).
- Aucune modification de `src/contracts` sans PR de contrat décidée par le Tech Lead (T6).

## 3. Format de sortie demandé à l'IA (proposition, T1)
Tranché par 0116 § 1, qui prévaut (notamment : `alternative` et `aEmporter` retirés en v1, longueurs de coupe). Proposition d'origine, gardée pour la trace :
Un objet JSON, une seule réponse :
```
{
  "titre": texte,                       // « Rome, 4 jours : antique, baroque, Vatican »
  "jours": [{
    "date": "AAAA-MM-JJ",
    "titre": texte,                     // un ou deux quartiers : « Rome antique », « Vatican le matin, Trastevere le soir »
    "creneaux": [{
      "debut": "HH:MM", "fin": "HH:MM" (facultatif),
      "nature": "arrivee" | "visite" | "repas_midi" | "repas_soir" | "apero" | "soiree" | "pause" | "depart",
      "lieu": texte,                    // obligatoire sauf arrivee, depart, pause ; nom usuel, tel qu'on le chercherait : « Fontaine de Trevi », « Da Enzo al 29 »
      "ville": texte (facultatif),      // si différente de la destination (excursion)
      "quartier": texte (facultatif),
      "pourquoi": texte,                // obligatoire dès qu'il y a un lieu ; une ou deux phrases
      "conseil": texte (facultatif),
      "prix": texte (facultatif), "horaires": texte (facultatif),
      "aReserver": booléen,
      "incontournable": booléen,
      "alternative": texte (facultatif) // un autre nom si le premier n'existe plus (lot 2, T5)
    }]
  }],
  "bonsPlans": [texte],                 // « Réserver maintenant : Colisée, Vatican, dîners de mercredi et jeudi »
  "aEmporter": [texte] (facultatif)     // « imperméable », « polo pour l'oncle »
}
```
Tout texte est **maison** (écrit par l'IA, sans URL ni balise) ; longueurs de coupe dans `LONGUEURS_TEXTE` (`src/ai/candidat.ts`) : `pourquoi` réutilise la borne existante `raison` (280) plutôt qu'une nouvelle borne à 300, `conseil`, `prix` et `horaires` réutilisent les leurs, `bonsPlans` 200 (0116 § 1 point 2). `lieu` est obligatoire sauf pour `arrivee`, `depart` et `pause` ; `pourquoi` est obligatoire dès qu'il y a un lieu (0116 T1). `arrivee` et `depart` ne sont pas vérifiés (0116 § 4.1) ; une `pause` (café, glace, coucher de soleil) a un lieu s'il en nomme un, et une `pause` sans lieu suit 0116 § 6.

## 4. Infos pratiques et sources
Le lot 1 n'a plus de page web lue : prix, horaires et conseil viennent des connaissances du modèle. Ils sont **affichés comme « à confirmer »** (mention fixe, UX à confirmer : « d'après l'IA, à vérifier sur place »), jamais présentés comme relevés d'une source datée (principe produit 2 : l'incertitude est visible). Le seul fait **vérifié** est l'existence du lieu et son ouverture aux dates du créneau (Google, en mémoire), et rien de ce verdict n'est écrit (0011, inchangée) :
- lieu **introuvable, hors zone ou fermé définitivement** : écrit **sans `placeId`** (0011 § 2 l'admet), sans position ni trajet ;
- lieu **fermé le jour de son créneau** : écrit **avec son `placeId`** ; le badge vient de la **relecture des horaires à l'affichage** ;
- le badge « à confirmer » (`toConfirm`) n'est **jamais stocké** : il est calculé à la lecture (0011 § 5), d'office pour une étape sans `placeId`, par la relecture des horaires pour une étape avec `placeId` ; une relecture en échec n'ajoute rien et n'invente rien. Aucun motif écrit ni compté.
La lecture du prototype ne relit aujourd'hui que les trajets (0092) ; la relecture des horaires pour ce badge est une question au Tech Lead (T8, § 7). Remettre la recherche web comme source datée est une question à Samuel (§ 8, Q-S1), pas une exigence du lot 1.

## 5. Critères d'acceptation (mesurables ; tirés des plans de Samuel)
Mesurés sur la sortie du modèle (jeu d'évaluation hors réseau, sorties simulées de rome-1 et edimbourg-1) et sur le programme écrit (tests du prototype, base jetable). La colonne « Test » donne un **nom indicatif** ; le Tech Lead place et nomme les tests (0116 § 8). Le jeu d'évaluation sur sorties simulées prouve le schéma et la mesure, **pas la qualité** : la qualité se juge sur l'essai réel de Samuel.

| # | Critère | Mesure | Test (nom indicatif, selon 0116) |
|---|---|---|---|
| A1 | **Toutes les journées remplies jusqu'au soir** : J1 depuis l'heure d'arrivée (+ 90 min de délai), dernier jour jusqu'à l'heure de départ (− 120 min), les autres du matin (au plus tard 10:00) jusqu'à 20:30 au moins | dernier créneau de chaque jour ≥ 20:30 (sauf J1 si arrivée après 18:00, et dernier jour) ; aucun écart de plus de 3 h entre deux créneaux consécutifs entre 09:00 et 20:00 | `programme: journées pleines du matin au soir` |
| A2 | **Repas de midi et du soir** chaque jour où le voyageur est là entre 12:00 et 14:30, et entre 18:30 et 21:30 | un créneau `repas_midi` et un `repas_soir` par jour concerné | `programme: repas de midi et du soir chaque jour` |
| A3 | **Apéro quand le brief le demande** (récit contenant apéro, apéritif, spritz, verre, pub, whisky, ou envie `tasting`) | au moins un créneau `apero` sur 2 jours sur 3 ; pour rome-1, chaque jour entier ; liste de mots et seuil **réglables** dans la configuration du jeu d'évaluation (la liste est ambiguë pour edimbourg-1, où « pub » et « whisky » sont aussi des visites) | `programme: apéro quand le brief le demande` |
| A4 | **Incontournables présents** : pour rome-1, **les 5** de 0115 § 4.1 point 3 : Colisée, Forum romain, Panthéon, fontaine de Trevi, musées du Vatican ou Saint-Pierre (aucune tolérance : l'absence de Trevi est le retour de Samuel) ; Trastevere attendu, mesuré à part, non bloquant ; pour edimbourg-1, au moins 4 des 5 : château d'Édimbourg, Royal Mile, Arthur's Seat, une distillerie accessible en train, un pub à musique (liste du Product Owner tirée du plan de Samuel, que 0115 ne fixe pas ; tolérance d'un manquant, réglable) | correspondance par nom normalisé (sans accents ni casse, tolérance d'orthographe sur le nom usuel) ; liste **du jeu d'évaluation**, jamais du prompt ni du code de production (P0S2-PO-19 : aucun incontournable codé en dur dans la chaîne) | `evals: incontournables de rome-1 et edimbourg-1` |
| A5 | **Chaque lieu expliqué** | `pourquoi` non vide sur 100 % des créneaux avec lieu ; `conseil` sur au moins 50 % | `programme: pourquoi sur chaque lieu` |
| A6 | **Un ou deux quartiers par jour** | titre du jour non vide ; `quartier` des créneaux d'un jour : au plus 2 valeurs distinctes (hors `arrivee`, `depart`, excursion) | `programme: au plus deux quartiers par jour` |
| A7 | **Chaque lieu vérifié ou « à confirmer »**, sans rien stocker de dérivé de Google | dans le programme **stocké** : aucune étape ne porte `toConfirm` ; une étape sans `placeId` n'a ni position ni trajet. **À la lecture** : une étape avec lieu sans `placeId` reçoit `toConfirm` ; une étape avec `placeId` le reçoit seulement si la relecture des horaires la dit fermée le jour de son créneau ; relecture en échec : aucun badge ajouté, aucune erreur (0011 § 5) | `p0: toConfirm jamais stocké, calculé à la lecture` |
| A8 | **Les trajets sont affichés** entre étapes consécutives avec `placeId`, et seulement elles | `travelFromPrevious` présent entre deux étapes consécutives avec `placeId` ; absent ou `null` vers et depuis une étape sans `placeId` (le trajet relie l'étape avec `placeId` précédente à la suivante, 0116) ; aucune durée inventée (0092 § 5) | `p0: trajets entre lieux vérifiés seulement` |
| A9 | **Aucune donnée Google en entrée** du prompt `programme` ni dans l'état du workflow | `journalDePrompts` : le prompt ne contient ni identifiant, ni nom Google, ni position, ni durée ; test d'état sérialisé existant étendu aux nouvelles étapes | `workflows: aucune donnée Google dans l'état sérialisé` (étendu) ; `programme: prompt sans donnée Google` |
| A10 | **Plafonds tenus** : au plus une recherche Text Search par lieu distinct et une fiche par identifiant distinct, dans la **part réellement disponible pour les lieux de l'IA** : le plafond de `mode-reel.json` moins la réserve des logements (0088 ; aujourd'hui `placesTextSearch − 2 × logements` pour `p0Run`, 0055 A3, parce que l'ancien `p0Run` cherche chaque logement deux fois ; avec l'étape unique de 0116 § 4.1, une recherche et une fiche par logement ; formule écrite une seule fois par le Tech Lead), et de même pour les fiches (`placesDetails` moins les fiches des logements et la marge `fiches`). Dimensionnement : 10 jours × 8 lieux = 80 lieux, sous 90 moins un logement ; Routes : une matrice par jour, 10 requêtes au plus (≤ 30) ; 9 points par jour (8 lieux et le logement) donnent 81 éléments, 810 pour 10 jours (≤ 840) ; un séjour plus dense dépasse. **Au-delà** (part ou temps épuisé, 0116 § 3.5) : lieux restants écrits **sans `placeId`** (affichés « à confirmer » à la lecture), trajets restants sans durée (`null`, 0092 § 4), jamais inventés ; programme entier écrit ; compteur maison `nonVerifiesFautePart` ; jamais un arrêt sans programme pour cette cause (PPI-PO-4) | compteurs de `prototype.run_calls` ; cas d'un séjour dont les lieux dépassent la part, et d'un séjour dont les matrices dépassent 840 éléments | `p0: vérification bornée par les plafonds, programme entier écrit` |
| A11 | **Contrôles minimaux** (0111, § 8) : un champ facultatif invalide retiré, le créneau gardé ; un texte trop long coupé ; une URL dans un texte libre : champ retiré (ou créneau retiré si c'est un `lieu` obligatoire ou le `pourquoi` d'un créneau avec lieu) ; une arrivée, un départ ou une pause sans lieu : créneau gardé ; une journée n'est jamais retirée pour un créneau ; le programme n'est refusé (`model_output_invalid`) que sans aucune journée lisible | cas du jeu de tests | `programme: sortie tolérante, créneau gardé` |
| A12 | **Rapport** sans nom de lieu ni motif | journal : compteurs maison du § 6 seulement (liste fermée) ; aucun compteur de verdict dans la base, l'état ni le journal ; rapport : étapes avec et sans `placeId` calculées à la lecture du programme stocké | `p0: rapport sans donnée Google` (**nouveau** : aucun test existant n'a ce nom) ; `journal: aucun compteur de verdict` (0117) |

Les seuils (20:30, 3 h, 2 sur 3, 5 sur 5 pour rome-1, 4 sur 5 pour edimbourg-1) sont ceux du Product Owner, lus sur les plans de Samuel ; ils vont dans la configuration du jeu d'évaluation (0116 § 8.4). Ils **ne sont pas** des règles imposées à l'IA dans le prompt (0115 § 2 point 5) : ce sont des mesures de la sortie.

## 6. Compteurs du rapport (P0S2-PO-25 adaptée)
Nombres seulement, jamais un nom, une position, une durée, un identifiant ni un motif.
- **Journal** (événement de fin d'étape, liste fermée ; noms anglais et événement selon 0116 § 4.4 et 0117 § 4) : `jours`, `creneaux`, `lieuxAVerifier`, `joursRetires`, `creneauxRetires`, `champsRetires`, `textesCoupes`, `appelsModele`, `nonVerifiesFautePart`, plus les compteurs d'appels Google déjà tenus par `run_calls`. Ce sont des compteurs **maison** (sortie de l'IA, nos plafonds).
- **Aucun compteur de verdict** (`verifies`, `introuvables`, `fermes`, `horsZone`, ni une différence qui les redonne) dans la base, l'état du workflow ni le journal (0011 § 2 et § 3, 0117 § 4) : ils ne vivent qu'en mémoire, dans l'étape. Aucune exception à 0011 n'est demandée.
- **Rapport** (`src/server/p0/rapport.ts`, calculé à l'affichage, jamais écrit) : les compteurs maison, et le nombre d'étapes **avec `placeId`** et **sans `placeId`**, calculé à la lecture du programme stocké, source unique. Le coût des modèles reste hors du rapport (Q368).

## 7. Questions au Tech Lead (propositions ; la décision est la sienne)
T1 à T7 sont **répondues par 0116**, qui prévaut ; le texte ci-dessous est gardé pour la trace, corrigé seulement là où il contredisait 0011.
- **T8 — Relecture des horaires à l'affichage** (nouvelle). Le badge `toConfirm` d'une étape avec `placeId` fermée le jour de son créneau vient d'une relecture des horaires à la lecture (0011 § 5), qui n'existe pas aujourd'hui dans la lecture du prototype (elle ne relit que les trajets, 0092). Où la placer, dans quels plafonds, et si elle entre au lot 1 ou après ? Sans elle, un tel lieu s'affiche sans badge (0011 § 5 : absence de badge faute de relecture n'est pas une erreur). Ne bloque pas le lot 1.
- **T1 — Format de sortie.** Le JSON du § 3 : un objet unique ? Proposition : oui, avec le schéma tolérant du § 8 ; `nature` en liste fermée ; heures `HH:MM` ; un créneau sans `lieu` admis pour `arrivee`, `depart`, `pause`. Bloque le prompt et le schéma.
- **T2 — Un appel ou plusieurs.** (a) un seul appel pour tout le séjour (5 à 10 jours : réponse longue, 20 à 60 créneaux) ; (b) un appel pour la trame (jours, quartiers, incontournables) puis un par jour pour les créneaux, la trame en entrée ; (c) un par jour sans trame. Proposition : **(a)** au lot 1, le plus proche du chat et le moins cher (une requête de modèle, ~20 000 micro-USD estimés) ; passage à (b) si la sortie est coupée ou incohérente entre jours (constat d'essai). Bloque l'étape de rédaction et `LONGUEUR_REPONSE_MAX`.
- **T3 — Étapes du workflow.** Proposition : `etapeRedaction` (modèle ; écrit le programme brut dans `prototype.work` par l'identifiant d'exécution, jamais dans l'état, 0011 § 3), `etapeVerification` (Text Search + fiches ; identifiants dans `prototype.work`, positions dans `place_coordinates`), `etapeFinale` (Routes + programme réduit + écriture, une seule étape comme aujourd'hui, 0011 § 7). Codes d'arrêt : liste fermée existante, plus `programme_vide` si aucune journée lisible (ou réutilisation de `research_empty`, renommé) ; un code nouveau touche les listes fermées (0072, 0111, 0114) et demande aussi la Sécurité. Réponse de 0116 § 3.4 : aucun code nouveau, `model_output_invalid`. Bloque le code de `p0Run`.
- **T4 — Text Search par nom et plafond ~1 par lieu.** Requête `« <lieu>, <ville> »`, restreinte à la zone du séjour comme aujourd'hui (`ancrage-zone`), masque `id` seul, puis une fiche. Les créneaux `arrivee` et `depart` : le logement (déjà vérifié, une fiche) ou aucun lieu. Un même lieu cité deux fois (Roscioli à midi et le soir) : **une** vérification. Ordre : jours dans l'ordre, créneaux dans l'ordre ; part Text Search épuisée : le reste écrit sans `placeId`, badge à la lecture (A10). Bloque l'étape de vérification.
- **T5 — Lieu introuvable.** Lot 1 : écrit sans `placeId`, « à confirmer » à la lecture, pas de remplacement. Lot 2, deux voies : (i) `alternative` nommée par l'IA dans la même sortie, vérifiée seulement si le lieu principal échoue (coût : un Text Search de plus par échec ; aucune donnée Google vers l'IA) ; (ii) second appel ciblé « remplace ces lieux » dont l'entrée est une liste de noms écrits par l'IA elle-même et un verdict (question S3 à la Sécurité : un verdict d'ancrage est-il une donnée dérivée interdite dans un prompt ?). Proposition : **(i)**. Ne bloque pas le lot 1.
- **T6 — Où porter `pourquoi`, `conseil`, `prix`, `horaires`, `bonsPlans`.** `StopFactsSchema` est strict et n'a ni prix ni conseil ; `Day` n'a pas de titre libre de quartier ; `Trip` n'a pas de bons plans. Même question que la question 1 de l'amendement 3 de `specs/P0-suite-2.md`, élargie. Proposition : **PR de contrat** (`StopFacts.tip`, `priceNote`, `hoursNote`, `Day.title`, `Trip.tips[]`, tous facultatifs, longueurs de coupe), comme celles de B2, avec forme réduite et instantanés ; à défaut, extension propre au prototype dans `programme-reduit.ts`. `pourquoi` va dans la raison existante de l'étape. Bloque l'affichage des infos pratiques et des bons plans, pas le programme.
- **T7 — Sort des modules de l'ancienne chaîne** (`src/research`, notation, classement, planification de `src/server/p0`, prompts `plan`, `recherche`, `notation`, `raisons`, `quartier`) : garder (mode simulé, MVP) ou retirer du prototype. Proposition : **garder** au lot 1, retrait au lot 3 (§ 9), et aucun test supprimé sans décision écrite.

## 8. Questions à la Sécurité et à Samuel
**Sécurité** (verdict demandé ; « on restreindra au besoin ») : S1 à S4 répondues par 0117 ; S5 nouvelle.
- **S1 — Contrôles minimaux de la sortie `programme`** : schéma tolérant (0111 § 2 à § 4), URL et domaines refusés (`contientUrl` linéaire, 0111 § 6), jeu de caractères et balises (`texteMaison`), longueurs coupées ; `lieu` obligatoire sauf `arrivee`, `depart` et `pause`, `pourquoi` obligatoire avec un lieu (sinon créneau retiré et compté) ; aucune autre règle de refus. Suffisant pour l'affichage sûr ? Bloque le schéma.
- **S2 — Texte de l'IA envoyé à Google** : le nom du lieu écrit par l'IA part dans une requête Text Search (comme le nom maison des candidats aujourd'hui). Même régime (`requeteSansDonneeDuBrief` ne s'applique pas : le nom vient du modèle, pas du brief) ? Ne bloque pas si le régime actuel s'applique.
- **S3 — Second appel de remplacement (lot 2, T5 (ii))** : un prompt qui reçoit « ces lieux n'ont pas été trouvés » (noms écrits par l'IA, verdict binaire) contient-il une donnée dérivée de Google au sens de 0011 § 2 et § 4 ? Ne bloque pas le lot 1.
- **S4 — Nouveaux compteurs du journal et du rapport** (§ 6) : à ajouter à la liste fermée (0072 § 5, 0111 § 5) ; compteurs maison seulement, aucun compteur de verdict. Bloque le rapport.
- **S5 — Routage de la requête `programme`** (nouvelle) : le récit et le logement y partent (§ 0). `zdr: true` et `data_collection: "deny"`, avec échec fermé comme 0096 § 4.1 (aujourd'hui `zdr` n'est demandé que pour `structuration`) ? Bloque l'envoi au modèle d'un brief autre que les briefs commités du prototype.
- **Lecture de 0117 § 1 et Conséquences** : « aucune étape avec `placeId` et `toConfirm` à la fois » se lit **dans le programme stocké** (où `toConfirm` n'est jamais écrit) ; à la lecture, une étape avec `placeId` fermée le jour de son créneau reçoit `toConfirm` (0011 § 5). À confirmer par la Sécurité.

**Samuel** (par le CEO) :
- **Q-S0 (posée par le CEO le 2026-10-21 06:20 UTC, en attente)** — Confirmation de l'incidence de ta demande du 05:51 UTC : le récit et le logement partent au fournisseur de modèles, hors UE. Bloque l'envoi au modèle d'un brief autre que les briefs commités du prototype ; ne bloque pas le code du lot 1.
- **Q-S1 (facultative)** — Les prix, horaires et conseils du lot 1 viennent des connaissances de l'IA, affichés « à confirmer ». Veux-tu, dans un lot suivant, qu'on remette la recherche web pour les sourcer et les dater (coût et temps en plus) ? Recommandation : décider après ton premier essai de la chaîne inversée.

## 9. Découpage proposé (si trop gros pour une PR)
| Lot | Contenu | Branche | Préalable |
|---|---|---|---|
| **1 — Prototype, programme par l'IA** | prompt `programme` v1, schéma tolérant, étapes de `p0Run` selon 0116, programme réduit sans `toConfirm` stocké, compteurs maison, jeu d'évaluation, mode simulé | `claude/<ticket>-programme-par-ia` | 0116 ; 0117 (S1, S2, S4, S5) |
| 1 bis — Contrat des infos pratiques | PR de contrat de T6 (`StopFacts`, `Day.title`, `Trip.tips`), instantanés | `claude/<ticket>-contrat-infos-pratiques` | T6 ; peut précéder ou suivre le lot 1 (sans elle, infos pratiques en mémoire seulement) |
| 2 — Remplacement d'un lieu introuvable | voie (i) ou (ii) de T5, mesure `remplaces` | après l'essai réel du lot 1 | T5, S3 |
| 3 — Retrait de l'ancienne chaîne du prototype | modules et prompts de T7, tests réécrits avec décision écrite | après le jugement de Samuel | T7, décision 0115 § 7 |
| MVP | report dans B7 à B9 : spécification distincte, ordonnée par le CEO | — | jugement de Samuel |

**Premier lot = prototype.** Le lot 1 seul doit suffire à l'essai de Samuel sur `rome-1`.

## 10. Hors périmètre
Production, clés, plafonds réels, comptes payants ; chaîne du MVP ; agent de recherche web ; « Surprends-moi » dans le prototype ; conversion de devises ; écran UX des infos pratiques (question 2 de l'amendement 3, toujours ouverte, UX/UI) ; grille G0 (copie conforme).

## Décisions (Product Owner, définitives dès la fusion, 0093)
- PPI-PO-1 — Le lot 1 ne remplace pas un lieu introuvable ; il n'écrit jamais `toConfirm` : un lieu introuvable, hors zone ou fermé définitivement est écrit sans `placeId`, un lieu fermé le jour de son créneau avec son `placeId`, et le badge « à confirmer » est calculé à la lecture (0115 § 4.2, 0011 § 5).
- PPI-PO-2 — Le nom affiché est celui de l'IA ; le badge `toReserve` suit `aReserver` ; un apéro s'affiche avec le libellé « Apéro » (vocabulaire) ; sa forme dans le programme (`kind`) est celle de 0116 § 6.
- PPI-PO-3 — Les seuils du § 5 mesurent la sortie et ne sont pas écrits dans le prompt.
- PPI-PO-4 — Part Text Search épuisée : programme entier écrit, lieux restants sans `placeId` (« à confirmer » à la lecture), compteur maison `nonVerifiesFautePart` ; jamais un arrêt sans programme pour cette cause (A10).
- PPI-PO-5 — Les infos pratiques du lot 1 sont affichées comme venant de l'IA, « à confirmer » ; jamais comme une source datée.

## Questions ouvertes
Celles des § 7 et § 8, avec leurs destinataires et ce qu'elles bloquent ; reportées dans `QUESTIONS.md` par le CEO depuis la description de la PR.
