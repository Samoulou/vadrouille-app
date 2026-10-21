# P0-programme-par-ia — Le programme complet écrit par l'IA, vérifié par le code (prototype `p0Run`, premier lot)

Rôle d'exécution : **ia-recherche** (prompts, sortie du modèle, étapes de `p0Run` ; commits `[ia]`), avec le **backend** pour l'écriture du programme si le découpage du § 9 le demande · Revue : Tech Lead **et** Sécurité · Rédaction : Product Owner · Date : 2026-10-21 · Ticket : #622 · Décision : 0115 (décision de Samuel du 2026-10-21, « on va inverser ») · Référence de qualité : les plans de Samuel (`/mnt/project-files/essai-reel/exemples/rome-samuel.pdf`, `edimbourg-samuel.pdf`) et le plan « façon chat » (`rome-plan-chat-claude.md`) · Briefs d'essai : `prototype/briefs/rome-1.json`, `edimbourg-1.json`

**Où ça se joue** : la page d'essai de Samuel sur `p0-reel` (`/prototype/executions`, puis « Mes voyages », « Journée », « Présentation »). C'est là qu'il juge. Tout ce qui n'est pas visible là n'est pas dans ce lot.

**Ce que cette spécification ne tranche pas** : le format exact de la sortie, le nombre d'appels, les étapes du workflow, le sort d'un lieu introuvable au-delà du badge, l'emplacement des infos pratiques dans les contrats (Tech Lead, § 7) ; les contrôles de la sortie (Sécurité, § 8) ; rien de nouveau pour Samuel (§ 8, une seule question facultative).

## Prérequis
- Décision 0115 fusionnée (même PR que cette spécification).
- Décisions du Tech Lead sur T1 à T6 (§ 7) et verdict de la Sécurité sur S1 à S3 (§ 8), écrits dans `docs/decisions/` (prochain numéro libre) **avant l'ouverture de la PR de code**, ou donnés dans la revue de la PR de cette spécification et consignés dans la même décision.
- `main` amené sur `p0-reel` avant l'essai réel (fusion habituelle, hors de cette tâche).

## Objectif
Qu'un essai réel de `p0Run` sur `rome-1` donne un programme que Samuel reconnaisse comme un vrai plan de voyage : cinq journées pleines du midi de l'arrivée au départ, panini à midi, apéro puis carbonara le soir, Colisée, Forum, Panthéon, Trevi, Vatican, chaque lieu expliqué et conseillé, un ou deux quartiers par jour, chaque lieu vérifié sur Google ou marqué « à confirmer », les temps de trajet affichés. Et la même chose sur `edimbourg-1` (distillerie en train, pubs, haggis, Arthur's Seat).

## La chaîne (décision 0115 § 3)
1. **Rédaction** : un prompt versionné `programme` (v1, `src/ai/prompts/`) reçoit le brief (jamais une donnée Google) et rend le programme complet en JSON (§ 3).
2. **Vérification** : pour chaque lieu du programme, Text Search par le nom écrit par l'IA et la ville → identifiant ; une fiche par lieu trouvé (statut, horaires d'ouverture aux dates du créneau, position) ; verdict par lieu : `verifie`, `introuvable`, `ferme`, `hors_zone`. Ancrage existant (`src/grounding`), positions dans `place_coordinates` (0027), horaires lus en mémoire seulement.
3. **Trajets** : matrices Routes entre lieux vérifiés consécutifs de chaque jour, mode du brief, temps conservés avec le programme (0092).
4. **Écriture et affichage** : programme réduit dans `prototype.programmes`, lecture et écrans existants ; lieu non vérifié gardé avec le badge `toConfirm`, sans position ni trajet.

Rien d'autre ne change dans `p0Run` : garde, réservation, forfait, plafonds de `mode-reel.json`, journal (`p0.step_failed`, codes fermés), purge, « Mes voyages ».

## 0. Premier lot (prototype `p0Run`) — texte du ticket de code pour le rôle ia
Feu vert de Samuel : 2026-10-21 05:52 UTC, « Ok go tu peux lancer le plan ». Samuel a confirmé que **l'IA reçoit toutes les saisies du questionnaire** : dates et heures d'arrivée et de départ, voyageurs, logement (texte saisi et nuits), rythme, envies, déplacements, budget repas, texte libre (récit) ; **jamais une donnée Google**. Pour le prototype, c'est tout le brief (`BriefSchema`, `src/prototype/brief.ts`), y compris le récit et le logement que `ComplementP0` tenait aujourd'hui à l'écart de l'entrée des modèles (B7-PO-1) : le prompt `programme` les reçoit, entre les bornes de données.

**Critère de réussite du lot** : Samuel relance `rome-1` sur la page d'essai de `p0-reel` et obtient, dans « Mes voyages », des **journées complètes** (déjeuner, apéro, dîner, incontournables de Rome), chaque lieu vérifié ou « à confirmer », les temps de trajet affichés entre lieux vérifiés. Les critères A1 à A12 (§ 5) sont la version mesurable de ce constat.

**Périmètre exact**
1. Nouveau prompt `programme` v1 : `src/ai/prompts/programme.ts` ; entrée : le brief entier en vue du modèle (nouveau type d'entrée dans `src/ai/entrees.ts` ou extension de `ComplementP0`, au choix du Tech Lead ; schéma strict en entrée, sans champ pour une donnée Google) ; conversion dans `src/server/p0/vers-couche-ia.ts` (seul adaptateur admis).
2. Sortie : `ProgrammeIaSchema` dans `src/ai/sorties.ts`, tolérant (§ 3, § 8 S1, modèle 0111) ; constructeur de requête dans `src/ai/requetes.ts` ; appel dans `src/ai/couche.ts` (une nature de requête `programme`, coût estimé `requeteModele`).
3. `src/workflows/p0-run.ts` : les étapes `etapeRecherche`, `etapeAncrage`, `etapeFinale` sont remplacées par `etapeRedaction`, `etapeVerification`, `etapeFinale` (T3) ; même squelette `etape()` (garde, journal `p0.step_failed`, codes fermés, `maxRetries = 0`), même composition `src/server/composition/p0-reel.ts`, mêmes clients.
4. Vérification : `src/grounding` existant (Text Search restreint à la zone, masque `id`, puis fiche), appelé lieu par lieu dans l'ordre des jours ; identifiants dans `prototype.work`, positions dans `place_coordinates` ; verdicts en mémoire et comptés.
5. Trajets et écriture : `src/server/p0/moteur-final.ts`, `vers-moteur.ts`, `assemblage.ts` réduits à **trajets + assemblage** (plus de squelette, de classement ni de planification) ; `src/prototype/programme-reduit.ts` écrit le programme de l'IA (étapes, horaires de l'IA, badges `toConfirm` et `toReserve`, raisons = `pourquoi`) ; temps conservés (0092, inchangé).
6. Rapport : `src/server/p0/rapport.ts` et `src/server/log.ts` (compteurs du § 6, liste fermée, S4).
7. Jeu d'évaluation : `evals/` (sorties simulées rome-1 et edimbourg-1, critères A1 à A6, A11) ; modèle simulé `src/ai/modeles.simule.ts` ; mode simulé `pnpm p0` (`scripts/p0/pipeline.ts`) passe par la nouvelle chaîne.
8. Tests nommés au § 5 ; tests de l'ancienne chaîne **conservés** tant que leurs modules restent (T7) ; aucun test supprimé ni désactivé sans décision écrite.

**Ce qui est retiré de `p0Run`** (le remplissage maison, 0115 § 3) : plan de recherche par secteurs (prompt `plan`), agent de recherche web à tours (prompt `recherche`, `src/research`), notation (`noter-candidats`, prompt `notation`), classement (`classement.json`), squelette et planification par capacité et par durée (`squelette`, `planifier`, P0S2-PO-26 et PO-27), créneaux de repli, rédaction séparée des raisons (prompt `raisons`), quartier conseillé (prompt `quartier`). Ces modules ne sont **plus appelés** par `p0Run` ; leur code reste au lot 1 (T7).

**Ce qui ne change pas** : garde du mode réel, réservation et forfait, plafonds de `prototype/config/mode-reel.json` (aucune valeur relevée), purge, positions et temps conservés, lecture des programmes, page d'essai, écrans. Aucune donnée Google dans un prompt, un journal, un état ou le dépôt.

**Contrôles minimaux sur la sortie de l'IA** (S1, « on restreindra au besoin ») : schéma tolérant (champ facultatif invalide retiré, créneau gardé ; clé inconnue ignorée ; texte trop long coupé à sa borne, sur un graphème, après contrôle du texte entier), URL et domaines refusés, balises et caractères hors jeu refusés (`texteMaison`, `contientUrl`), `lieu` et `pourquoi` obligatoires par créneau (sinon créneau retiré et compté `creneauxRetires`), heure invalide : créneau retiré ; journée jamais retirée pour un créneau ; programme refusé (`model_output_invalid`, arrêt fermé) seulement sans aucune journée lisible. **Aucun** contrôle de nombre de lieux, de durée, de distance ni de cohérence des horaires.

**Branche** : `claude/<ticket>-programme-par-ia` ; commits `[ia]` ; PR « Closes #<ticket> » avec les décisions T1 à T4, T7 et verdicts S1, S2, S4 cités ; `pnpm verify` au vert ; aucun essai réel par le studio.

## 1. À livrer (premier lot, détail)
1. **Prompt `programme` v1** (`src/ai/prompts/programme.ts`), dans les règles des prompts existants (données entre bornes, aucune URL dans les textes, JSON seul). Il dit à l'IA d'écrire le programme **comme elle le ferait dans un chat** : jour par jour, heures, repas de midi et du soir, apéro et soirée si le brief les évoque, incontournables de la destination qui correspondent aux envies, une ligne de « pourquoi » et un conseil par lieu, un titre de jour par quartier(s), les bons plans du séjour. Il ne lui impose **ni** nombre de lieux, **ni** durée, **ni** distance (0115 § 2 point 5).
2. **Schéma de sortie tolérant** (`src/ai/sorties.ts`, modèle 0111) : § 3 et § 8.
3. **Étapes de `p0Run`** remplacées : rédaction, vérification, trajets et écriture (forme : T2, T3). Les étapes actuelles (recherche, ancrage, notation, classement, planification, raisons) **ne sont plus appelées** par `p0Run` ; leur code reste tant que le mode simulé de `pnpm p0` ou les tests en dépendent (le découpage du § 9 dit quand il part).
4. **Programme réduit** : un créneau de l'IA devient une étape du programme (`kind` : `meal` pour midi, soir et apéro ; `activity` pour visite, soirée, pause ; `event` pour un événement daté), avec le nom de l'IA comme `label`, son « pourquoi » comme raison, le badge `toConfirm` si non vérifié, `toReserve` si l'IA dit « à réserver ». Horaires : ceux de l'IA (début, fin). Infos pratiques : selon T6.
5. **Rapport** : compteurs du § 6, sans nom de lieu ni donnée Google.
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
      "lieu": texte,                    // nom usuel, tel qu'on le chercherait : « Fontaine de Trevi », « Da Enzo al 29 »
      "ville": texte (facultatif),      // si différente de la destination (excursion)
      "quartier": texte (facultatif),
      "pourquoi": texte,                // une ou deux phrases
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
Tout texte est **maison** (écrit par l'IA, sans URL ni balise) ; longueurs de coupe dans `LONGUEURS_TEXTE`, à étendre pour `pourquoi` et `bonsPlans` (proposition : 300 et 200 caractères). Les créneaux `arrivee` et `depart` n'ont pas de lieu à vérifier (ou le logement, T4). Un créneau `pause` (café, glace, coucher de soleil) a un lieu s'il en nomme un.

## 4. Infos pratiques et sources
Le lot 1 n'a plus de page web lue : prix, horaires et conseil viennent des connaissances du modèle. Ils sont **affichés comme « à confirmer »** (mention fixe, UX à confirmer : « d'après l'IA, à vérifier sur place »), jamais présentés comme relevés d'une source datée (principe produit 2 : l'incertitude est visible). Le seul fait **vérifié** est l'existence du lieu et son ouverture aux dates du créneau (Google, en mémoire) : un lieu fermé ce jour-là reçoit `toConfirm` et le rapport le compte `ferme`. Remettre la recherche web comme source datée est une question à Samuel (§ 8, Q-S1), pas une exigence du lot 1.

## 5. Critères d'acceptation (mesurables ; tirés des plans de Samuel)
Mesurés sur la sortie du modèle (jeu d'évaluation hors réseau, sorties simulées de rome-1 et edimbourg-1) et sur le programme écrit (tests du prototype, base jetable). Chaque critère nomme son test.

| # | Critère | Mesure | Test |
|---|---|---|---|
| A1 | **Toutes les journées remplies jusqu'au soir** : J1 depuis l'heure d'arrivée (+ 90 min de délai), dernier jour jusqu'à l'heure de départ (− 120 min), les autres du matin (au plus tard 10:00) jusqu'à 20:30 au moins | dernier créneau de chaque jour ≥ 20:30 (sauf J1 si arrivée après 18:00, et dernier jour) ; aucun écart de plus de 3 h entre deux créneaux consécutifs entre 09:00 et 20:00 | `programme: journées pleines du matin au soir` |
| A2 | **Repas de midi et du soir** chaque jour où le voyageur est là entre 12:00 et 14:30, et entre 18:30 et 21:30 | un créneau `repas_midi` et un `repas_soir` par jour concerné | `programme: repas de midi et du soir chaque jour` |
| A3 | **Apéro quand le brief le demande** (récit contenant apéro, apéritif, spritz, verre, pub, whisky, ou envie `tasting`) | au moins un créneau `apero` sur 2 jours sur 3 ; pour rome-1, chaque jour entier | `programme: apéro quand le brief le demande` |
| A4 | **Incontournables présents** : pour rome-1, au moins 5 des 6 : Colisée, Forum romain, Panthéon, fontaine de Trevi, musées du Vatican ou Saint-Pierre, Trastevere ; pour edimbourg-1, au moins 4 des 5 : château d'Édimbourg, Royal Mile, Arthur's Seat, une distillerie accessible en train, un pub à musique | correspondance par nom normalisé (sans accents ni casse, tolérance d'orthographe sur le nom usuel) ; liste **du jeu d'évaluation**, jamais du prompt ni du code de production (P0S2-PO-19 : aucun incontournable codé en dur dans la chaîne) | `evals: incontournables de rome-1 et edimbourg-1` |
| A5 | **Chaque lieu expliqué** | `pourquoi` non vide sur 100 % des créneaux avec lieu ; `conseil` sur au moins 50 % | `programme: pourquoi sur chaque lieu` |
| A6 | **Un ou deux quartiers par jour** | titre du jour non vide ; `quartier` des créneaux d'un jour : au plus 2 valeurs distinctes (hors `arrivee`, `depart`, excursion) | `programme: au plus deux quartiers par jour` |
| A7 | **Chaque lieu vérifié ou « à confirmer »** | dans le programme écrit, toute étape porte un identifiant Google **ou** le badge `toConfirm` ; jamais aucun des deux, jamais les deux ; aucune position pour une étape `toConfirm` | `p0: toute étape vérifiée ou à confirmer` |
| A8 | **Les trajets sont affichés** entre lieux vérifiés consécutifs, et seulement eux | `travelFromPrevious` présent entre deux étapes vérifiées consécutives ; `null` si l'une est `toConfirm` ; aucune durée inventée (0092 § 5) | `p0: trajets entre lieux vérifiés seulement` |
| A9 | **Aucune donnée Google en entrée** du prompt `programme` ni dans l'état du workflow | `journalDePrompts` : le prompt ne contient ni identifiant, ni nom Google, ni position, ni durée ; test d'état sérialisé existant étendu aux nouvelles étapes | `workflows: aucune donnée Google dans l'état sérialisé` (étendu) ; `programme: prompt sans donnée Google` |
| A10 | **Plafonds tenus** : Text Search ≤ 1 par lieu, fiches ≤ 1 par lieu vérifié (+ logement), dans `mode-reel.json` ; au-delà, arrêt `cap_reached` **après** l'écriture d'un programme partiel ? **non** : le lot 1 vérifie les lieux **dans l'ordre des jours** et marque `toConfirm` les lieux restants quand la part Text Search est épuisée (programme entier écrit, rapport `plafond_verification_atteint` = nombre de lieux non vérifiés faute de part) | compteurs de `prototype.run_calls` | `p0: vérification bornée par les plafonds, programme entier écrit` |
| A11 | **Contrôles minimaux** (0111, § 8) : un champ facultatif invalide retiré, le créneau gardé ; un texte trop long coupé ; une URL dans un texte libre : champ retiré (ou créneau retiré si c'est `lieu` ou `pourquoi`) ; une journée n'est jamais retirée pour un créneau ; le programme n'est refusé (`model_output_invalid`) que sans aucune journée lisible | cas du jeu de tests | `programme: sortie tolérante, créneau gardé` |
| A12 | **Rapport** sans nom de lieu : compteurs du § 6 seulement | relecture des colonnes | `p0: rapport sans donnée Google` (existant, étendu) |

Les seuils (20:30, 3 h, 2 sur 3, 5 sur 6) sont ceux du Product Owner, lus sur les plans de Samuel ; le Tech Lead peut les porter dans une configuration de test. Ils **ne sont pas** des règles imposées à l'IA dans le prompt (0115 § 2 point 5) : ce sont des mesures de la sortie.

## 6. Compteurs du rapport (P0S2-PO-25 adaptée)
Nombres seulement : `jours`, `creneaux`, `lieuxAVerifier`, `verifies`, `introuvables`, `fermes`, `horsZone`, `nonVerifiesFautePart`, `champsRetires`, `textesCoupes`, `creneauxRetires`, `appelsModele`, `coutModelesMicros`, plus les compteurs d'appels Google déjà tenus par `run_calls`. Jamais un nom, une position, une durée, un identifiant.

## 7. Questions au Tech Lead (propositions ; la décision est la sienne)
- **T1 — Format de sortie.** Le JSON du § 3 : un objet unique ? Proposition : oui, avec le schéma tolérant du § 8 ; `nature` en liste fermée ; heures `HH:MM` ; un créneau sans `lieu` admis pour `arrivee`, `depart`, `pause`. Bloque le prompt et le schéma.
- **T2 — Un appel ou plusieurs.** (a) un seul appel pour tout le séjour (5 à 10 jours : réponse longue, 20 à 60 créneaux) ; (b) un appel pour la trame (jours, quartiers, incontournables) puis un par jour pour les créneaux, la trame en entrée ; (c) un par jour sans trame. Proposition : **(a)** au lot 1, le plus proche du chat et le moins cher (une requête de modèle, ~20 000 micro-USD estimés) ; passage à (b) si la sortie est coupée ou incohérente entre jours (constat d'essai). Bloque l'étape de rédaction et `LONGUEUR_REPONSE_MAX`.
- **T3 — Étapes du workflow.** Proposition : `etapeRedaction` (modèle ; écrit le programme brut dans `prototype.work` par l'identifiant d'exécution, jamais dans l'état, 0011 § 3), `etapeVerification` (Text Search + fiches ; identifiants dans `prototype.work`, positions dans `place_coordinates`), `etapeFinale` (Routes + programme réduit + écriture, une seule étape comme aujourd'hui, 0011 § 7). Codes d'arrêt : liste fermée existante, plus `programme_vide` si aucune journée lisible (ou réutilisation de `research_empty`, renommé). Bloque le code de `p0Run`.
- **T4 — Text Search par nom et plafond ~1 par lieu.** Requête `« <lieu>, <ville> »`, restreinte à la zone du séjour comme aujourd'hui (`ancrage-zone`), masque `id` seul, puis une fiche. Les créneaux `arrivee` et `depart` : le logement (déjà vérifié, une fiche) ou aucun lieu. Un même lieu cité deux fois (Roscioli à midi et le soir) : **une** vérification. Ordre : jours dans l'ordre, créneaux dans l'ordre ; part Text Search épuisée : `toConfirm` pour le reste (A10). Bloque l'étape de vérification.
- **T5 — Lieu introuvable.** Lot 1 : `toConfirm`, pas de remplacement. Lot 2, deux voies : (i) `alternative` nommée par l'IA dans la même sortie, vérifiée seulement si le lieu principal échoue (coût : un Text Search de plus par échec ; aucune donnée Google vers l'IA) ; (ii) second appel ciblé « remplace ces lieux » dont l'entrée est une liste de noms écrits par l'IA elle-même et un verdict (question S3 à la Sécurité : un verdict d'ancrage est-il une donnée dérivée interdite dans un prompt ?). Proposition : **(i)**. Ne bloque pas le lot 1.
- **T6 — Où porter `pourquoi`, `conseil`, `prix`, `horaires`, `bonsPlans`.** `StopFactsSchema` est strict et n'a ni prix ni conseil ; `Day` n'a pas de titre libre de quartier ; `Trip` n'a pas de bons plans. Même question que la question 1 de l'amendement 3 de `specs/P0-suite-2.md`, élargie. Proposition : **PR de contrat** (`StopFacts.tip`, `priceNote`, `hoursNote`, `Day.title`, `Trip.tips[]`, tous facultatifs, longueurs de coupe), comme celles de B2, avec forme réduite et instantanés ; à défaut, extension propre au prototype dans `programme-reduit.ts`. `pourquoi` va dans la raison existante de l'étape. Bloque l'affichage des infos pratiques et des bons plans, pas le programme.
- **T7 — Sort des modules de l'ancienne chaîne** (`src/research`, notation, classement, planification de `src/server/p0`, prompts `plan`, `recherche`, `notation`, `raisons`, `quartier`) : garder (mode simulé, MVP) ou retirer du prototype. Proposition : **garder** au lot 1, retrait au lot 3 (§ 9), et aucun test supprimé sans décision écrite.

## 8. Questions à la Sécurité et à Samuel
**Sécurité** (verdict demandé ; « on restreindra au besoin ») :
- **S1 — Contrôles minimaux de la sortie `programme`** : schéma tolérant (0111 § 2 à § 4), URL et domaines refusés (`contientUrl` linéaire, 0111 § 6), jeu de caractères et balises (`texteMaison`), longueurs coupées ; `lieu` et `pourquoi` obligatoires par créneau (sinon créneau retiré et compté) ; aucune autre règle de refus. Suffisant pour l'affichage sûr ? Bloque le schéma.
- **S2 — Texte de l'IA envoyé à Google** : le nom du lieu écrit par l'IA part dans une requête Text Search (comme le nom maison des candidats aujourd'hui). Même régime (`requeteSansDonneeDuBrief` ne s'applique pas : le nom vient du modèle, pas du brief) ? Ne bloque pas si le régime actuel s'applique.
- **S3 — Second appel de remplacement (lot 2, T5 (ii))** : un prompt qui reçoit « ces lieux n'ont pas été trouvés » (noms écrits par l'IA, verdict binaire) contient-il une donnée dérivée de Google au sens de 0011 § 2 et § 4 ? Ne bloque pas le lot 1.
- **S4 — Nouveaux compteurs du journal et du rapport** (§ 6) : à ajouter à la liste fermée (0072 § 5, 0111 § 5). Bloque le rapport.

**Samuel** (par le CEO ; **rien ne bloque le lot 1**) :
- **Q-S1 (facultative)** — Les prix, horaires et conseils du lot 1 viennent des connaissances de l'IA, affichés « à confirmer ». Veux-tu, dans un lot suivant, qu'on remette la recherche web pour les sourcer et les dater (coût et temps en plus) ? Recommandation : décider après ton premier essai de la chaîne inversée.

## 9. Découpage proposé (si trop gros pour une PR)
| Lot | Contenu | Branche | Préalable |
|---|---|---|---|
| **1 — Prototype, programme par l'IA** | prompt `programme` v1, schéma tolérant, étapes de `p0Run` (rédaction, vérification, finale), programme réduit avec `toConfirm`, compteurs, jeu d'évaluation, mode simulé | `claude/<ticket>-programme-par-ia` | décisions T1 à T4, T7 ; verdicts S1, S2, S4 |
| 1 bis — Contrat des infos pratiques | PR de contrat de T6 (`StopFacts`, `Day.title`, `Trip.tips`), instantanés | `claude/<ticket>-contrat-infos-pratiques` | T6 ; peut précéder ou suivre le lot 1 (sans elle, infos pratiques en mémoire seulement) |
| 2 — Remplacement d'un lieu introuvable | voie (i) ou (ii) de T5, mesure `remplaces` | après l'essai réel du lot 1 | T5, S3 |
| 3 — Retrait de l'ancienne chaîne du prototype | modules et prompts de T7, tests réécrits avec décision écrite | après le jugement de Samuel | T7, décision 0115 § 7 |
| MVP | report dans B7 à B9 : spécification distincte, ordonnée par le CEO | — | jugement de Samuel |

**Premier lot = prototype.** Le lot 1 seul doit suffire à l'essai de Samuel sur `rome-1`.

## 10. Hors périmètre
Production, clés, plafonds réels, comptes payants ; chaîne du MVP ; agent de recherche web ; « Surprends-moi » dans le prototype ; conversion de devises ; écran UX des infos pratiques (question 2 de l'amendement 3, toujours ouverte, UX/UI) ; grille G0 (copie conforme).

## Décisions (Product Owner, définitives dès la fusion, 0093)
- PPI-PO-1 — Le lot 1 marque `toConfirm` et ne remplace pas (0115 § 4.2).
- PPI-PO-2 — Le nom affiché est celui de l'IA ; le badge `toReserve` suit `aReserver` ; `apero` est une étape `meal` (vocabulaire : « Apéro » dans le libellé, pas un nouveau `kind`), jusqu'à une PR de contrat décidée par le Tech Lead.
- PPI-PO-3 — Les seuils du § 5 mesurent la sortie et ne sont pas écrits dans le prompt.
- PPI-PO-4 — Part Text Search épuisée : programme entier écrit, lieux restants `toConfirm`, compteur `nonVerifiesFautePart` ; jamais un arrêt sans programme pour cette cause (A10).
- PPI-PO-5 — Les infos pratiques du lot 1 sont affichées comme venant de l'IA, « à confirmer » ; jamais comme une source datée.

## Questions ouvertes
Celles des § 7 et § 8, avec leurs destinataires et ce qu'elles bloquent ; reportées dans `QUESTIONS.md` par le CEO depuis la description de la PR.
