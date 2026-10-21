# 0115 — Inversion de la chaîne : l'IA écrit le programme complet, le code vérifie sur Google (décision de Samuel du 2026-10-21)

**Ordre de fusion** : #623 (cette décision et `specs/P0-programme-par-ia.md`), puis #628 (`docs/decisions/0116-reponses-tl-programme-par-ia-lot-1.md`, Tech Lead), puis #627 (`docs/decisions/0117-verdict-securite-programme-par-ia.md`, Sécurité). Les renvois à 0116 et 0117 désignent ces chemins sur `main`.

Statut : **acceptée**, définitive dès sa fusion. Trois niveaux, séparés :
- **Décidé par Samuel** (stratégie produit et direction du studio, « Qui décide quoi » de `docs/CONTEXT.md`) : l'inversion de la chaîne du prototype et sa portée (§ 2).
- **Décidé par le Product Owner** (détails fonctionnels délégués, § 4 et § 6) : listés dans la note de version suivante, rubrique « Décisions prises par le studio », définitifs dès leur fusion sans délai de veto (décision 0093).
- **Proposé ici, tranché ailleurs** : l'architecture, le format, l'outillage et les tests (Tech Lead, 0116) ; les contrôles de la sortie de l'IA (Sécurité, 0117) ; les propositions sont dans `specs/P0-programme-par-ia.md`.

Ce que la décision n'engage pas : ni la cible, ni l'offre, ni les prix, ni les phases G0 à G3 ; ni argent (aucun plafond relevé), ni compte externe ; elle ne supprime ni ne désactive aucun test (la réécriture des tests de `p0Run` relève de 0116).

**Données personnelles hors UE** : le récit libre et le logement saisis **partent au fournisseur de modèles** (hors UE) dans le prompt `programme`. C'est la demande explicite de Samuel du 2026-10-21 05:51 UTC (§ 2) ; l'incidence (fournisseur hors UE ; 0026, 0081, 0096 § 4.1), que le CEO lui a exposée le 2026-10-21 06:20 UTC, est **confirmée par Samuel le 2026-10-21 06:49 UTC (Q557)**, avec `zdr: true` et `data_collection: "deny"` pour la requête `programme` et échec fermé comme 0096 § 4.1 (verdict de la Sécurité, 0117 § 5, S5). Pour le prototype, seuls les briefs commités sont envoyés **par construction** : `p0Run` n'accepte que les fichiers de `prototype/briefs/` (`NOMS_BRIEFS`, textes de test publics).

Date : 2026-10-21 · Décideur : Samuel (direction, § 2) ; Product Owner (détails fonctionnels, § 4 et § 6) · Ticket : #622 · Spécification de la première tâche de code : `specs/P0-programme-par-ia.md` · Décisions liées : 0011, 0027, 0088, 0092, 0111, 0114 ; 0116 (Tech Lead) et 0117 (Sécurité), fusionnées après celle-ci ; 0087, 0105, 0106, 0113 (touchées, § 5)

Numérotation (relue le 2026-10-21 sur `main` `441f7a7`) : `main` porte 0001 à 0114 ; la PR #613, ouverte, amende 0113 en place ; aucune PR ouverte ne porte un 0115 ; 0116 et 0117 sont portées par #628 et #627. À revérifier avant fusion.

**Amende, sans les réécrire** (pour le prototype `p0Run` seulement, § 5 ; la chaîne du MVP, B5 à B9, n'est pas amendée par cette décision, § 5.5) :
- `specs/P0-suite-2.md`, amendement 3 (P0S2-PO-19 à P0S2-PO-28) : gelé ou abandonné règle par règle, § 5.1 ;
- `specs/P0-prototype-recherche.md`, étapes 2 à 8 (plan de recherche, recherche, ancrage, notation, classement, planification, raisons) et `docs/CONTEXT.md`, principe technique 1 (« L'agent cherche, l'ancrage vérifie, le moteur planifie ») : pour le prototype, le principe se lit désormais « **l'IA écrit le programme, l'ancrage vérifie, le code ajoute les trajets et affiche** » (§ 3) ; le texte de `docs/CONTEXT.md` n'est pas modifié ici (il reste vrai pour le MVP tant que Samuel n'a pas jugé le prototype inversé, § 7).

**N'amende pas** : 0011 (aucune donnée Google dans un prompt, un journal, une trace ni un état de workflow ; identifiants seuls stockés ; `toConfirm` jamais stocké, calculé à la lecture, § 5 ; aucun verdict ni compteur d'ancrage stocké ou journalisé, § 2 et § 3 ; voir § 4.2 et § 6), 0027 et 0092 (exceptions existantes : coordonnées 30 jours, temps de trajet du prototype), 0088 (plafonds de l'essai réel, Routes à 840 éléments), 0111 (champs tolérants et textes coupés : elle devient le **modèle** des contrôles de la nouvelle sortie, § 4.4), 0114, le régime de confinement (P0c), la garde du mode réel, la réservation et le forfait de `p0Run`, la page d'essai et « Mes voyages » sur `p0-reel`.

## 1. Contexte

Le dernier essai réel de Rome (`prototype/briefs/rome-1.json`, 2026-10-20 21:04 UTC, diagnostic dans `/mnt/project-files/essai-reel/diagnostic-rome-2026-10-20.md`) est allé au bout, mais le programme est pauvre : 4 lieux trouvés pour 20 recherches, 6 incontournables sur 10 sans candidat. Retour de Samuel le 2026-10-21 : **ni repas ni apéro, chaque journée finit à 15 h, pas de fontaine de Trevi**, alors que le récit du brief demande « l'apéro en fin d'après-midi avant d'aller au resto » et « découvrir les carbonara romaines ».

Samuel a comparé ce résultat avec :
- le plan qu'un chat Claude écrit pour le même brief, sans aucune donnée Google ni appel (`/mnt/project-files/essai-reel/exemples/rome-plan-chat-claude.md`, écrit par le CEO) : cinq journées pleines du matin au dîner, horaires, panini à midi, apéro à 18 h 30, carbonara le soir, Colisée, Forum, Panthéon, Trevi, Vatican, Trastevere, un ou deux quartiers par jour, et des « bons plans » (réserver maintenant, billet BIT, Trevi tôt le matin) ;
- ses propres plans, la **référence de qualité** : `rome-samuel.pdf` (lieux par quartier, chaque monument expliqué en une ligne, prix, horaires, conseil : « acheter le billet Colisée/Palatin/Forum à l'avance », « Trevi mieux tôt le matin vers 6 h » ; restaurants, bars, cafés et « sorties » par quartier) et `edimbourg-samuel.pdf` (journée par journée : « 12h00 atterrissage → tram », « Midi haggis au Whiski Bar », « Apéro whisky au Bow Bar », « Soir dernier grand dîner », pubs, restos, lieux, bons plans, « réservations à faire maintenant »).

Diagnostic du CEO, accepté par Samuel : **aujourd'hui l'IA ne fournit qu'une liste de lieux candidats** (agent de recherche borné, plan par secteurs, un candidat par incontournable) **et notre code compose les journées** (ancrage, notation, classement, squelette, planification par capacité et par durée, créneaux de repli). Dans un chat, l'IA écrit le programme entier avec sa logique : elle sait qu'à Rome on dîne tard, qu'un apéro précède le dîner, que Trevi se voit tôt, que le Vatican et Trastevere se font le même jour. Notre chaîne jette cette logique et la remplace par des règles maison qui, à chaque essai, laissent des trous.

## 2. Décision de Samuel

Fil du projet, 2026-10-21 05:47 UTC, mots exacts : **« Oui on va inverser, qui peut le plus peut le moins on laisse la liberté et on restreindra au besoin »**.

Feu vert d'exécution, 05:52 UTC, mots exacts : **« Ok go tu peux lancer le plan »**. Une minute plus tôt (05:51 UTC, fil « Routine cycle du studio »), Samuel avait **demandé explicitement** que **l'IA reçoive toutes les saisies du questionnaire** (dates et heures, voyageurs, logement, rythme, envies, déplacements, budget repas, texte libre) et **jamais une donnée Google**. Pour le prototype, le récit et le logement du brief, que B7-PO-1 tenait hors de l'entrée des modèles (`ComplementP0`), entrent donc dans le prompt `programme` (détail dans la spécification, § 0). Incidence (fournisseur hors UE) : confirmée par Samuel le 2026-10-21 06:49 UTC (Q557), voir l'en-tête.

Portée, telle que le CEO l'a proposée et que Samuel l'a acceptée :
1. **Inverser.** L'IA écrit d'abord le **programme complet**, comme dans un chat, en toute liberté : jour par jour, créneaux horaires, repas de midi et du soir, apéro et soirée, incontournables de la destination, justification de chaque lieu, conseils et bons plans.
2. **Ensuite seulement, le code vérifie** chaque lieu sur Google (Text Search par nom → identifiant, puis fiche), **remplace ou signale** ceux qui n'existent pas ou sont fermés, et **ajoute les temps de trajet**.
3. **Les quatre garde-fous sont gardés** : lieux réels vérifiés sur Google ; conditions Google (jamais de donnée Google dans un prompt, seuls les identifiants stockés, exceptions existantes 0027 et 0092) ; plafonds de coût ; affichage sûr (pas d'URL ni de texte piégé).
4. **On jette le remplissage maison** là où il contredit le programme de l'IA.
5. **« On restreindra au besoin »** : les contrôles sur la sortie de l'IA sont **minimaux au départ** ; une restriction nouvelle se justifie par un essai réel qui l'exige, jamais par précaution.

## 3. La nouvelle chaîne

Pour le prototype `p0Run` (première tâche, `specs/P0-programme-par-ia.md`), dans l'ordre :

| Étape | Qui | Entrée | Sortie | Appels |
|---|---|---|---|---|
| 1. Rédaction du programme | IA (modèle, prompt versionné) | le brief (texte du voyageur, dates, heures d'arrivée et de départ, logement, envies, rythme, déplacements, budget repas) | le programme complet : jours, créneaux avec heures, lieux nommés par l'IA, nature de chaque créneau (visite, repas de midi, repas du soir, apéro, soirée, arrivée, départ), pourquoi, conseil, prix et horaires d'après ses connaissances, « à réserver », incontournable ou non, titre du jour (un ou deux quartiers), bons plans du séjour | modèles seulement ; **aucune donnée Google** en entrée (0011 § 4) |
| 2. Vérification Google | code (ancrage existant, `src/grounding`) | chaque lieu du programme : son nom écrit par l'IA et la ville | identifiant de lieu, position (cache `place_coordinates`, 0027), statut et horaires d'ouverture aux dates du créneau lus **en mémoire** ; verdict par lieu (vérifié, introuvable, fermé ce jour-là, hors zone) **en mémoire seulement, jamais écrit ni compté** (0011 § 2) ; l'identifiant est gardé sauf pour un lieu introuvable, hors zone ou fermé définitivement (§ 4.2) | Text Search **un par lieu**, fiche **une par lieu vérifié**, dans les plafonds par exécution de `mode-reel.json`, réserve des logements déduite (0088) |
| 3. Trajets | code (`Routes`, 0090, 0092) | les lieux consécutifs avec identifiant de chaque jour, dans l'ordre écrit (0116) | temps de trajet entre lieux consécutifs, dans le mode du brief ; conservés avec le programme (0092) | matrices Routes, dans les plafonds (840 éléments, 30 requêtes) |
| 4. Écriture et affichage | code (programme réduit, `prototype.programmes`, lecture existante) | le programme de l'IA, les identifiants gardés, les trajets | le programme affiché dans « Mes voyages », « Journée » et « Présentation » ; un lieu sans identifiant reste dans le programme sans position (donc absent de la carte) ; le badge **« à confirmer »** n'est **jamais écrit** : il est calculé à la lecture (0011 § 5, § 4.2) ; les textes affichés sont ceux de l'IA (textes maison), après les contrôles du § 4.4 | aucun |

Ce qui **disparaît** de la chaîne du prototype : le plan de recherche par secteurs, l'agent de recherche web à tours, la notation des candidats, le classement, le squelette et la planification par capacité et par durée, les créneaux de repli, la rédaction séparée des raisons. Ce qui **reste** : la garde du mode réel, la réservation et le forfait, les plafonds, le journal fermé, la purge, les positions et temps conservés, la lecture des programmes, la page d'essai.

Le **moteur ne replanifie pas** le programme de l'IA : il ne déplace ni ne retire un lieu pour une question de distance ou de durée. Un trajet long est **affiché** (temps de trajet), pas corrigé (« la distance est un coût, pas un filtre », cadrage § 3.7). La seule intervention du code sur le contenu est d'écrire ou non l'identifiant selon la vérification (§ 3 étape 2) ; le badge « à confirmer » est calculé à la lecture (§ 4.2).

## 4. Détails fonctionnels (Product Owner, délégués)

### 4.1 Ce que « programme complet » veut dire (critères de sortie, mesurés sur les plans de Samuel)
1. **Toutes les journées remplies jusqu'au soir** : le premier jour depuis l'heure d'arrivée, le dernier jusqu'à l'heure de départ, les autres du matin au dîner ou à la soirée. Aucune journée ne finit à 15 h.
2. **Repas de midi et du soir chaque jour** où le voyageur est sur place à ces heures, **apéro quand le brief le demande** (récit ou envie `tasting`) ; le déjeuner suit le récit (« panini à l'emporter » donne un lieu à emporter, pas un restaurant assis).
3. **Les incontournables de la destination sont présents** quand ils correspondent aux envies : pour rome-1 (`heritage`, `museum`, « Rome antique »), Colisée, Forum, Panthéon, fontaine de Trevi, Vatican au moins, **tous les cinq** (critère A4 de la spécification, sans tolérance : l'absence de Trevi est le retour de Samuel). Ils sont **expliqués** : une ligne de « pourquoi » par lieu, comme dans les plans de Samuel.
4. **Un ou deux quartiers par jour**, dans le titre du jour (« Mercredi — Rome antique », « Vendredi — Vatican le matin, Trastevere le soir »).
5. **Conseils et bons plans** : par lieu (réserver, venir tôt, tenue) et pour le séjour (billets à prendre maintenant, transports, météo).
6. **Chaque lieu est vérifié ou affiché « à confirmer »** (badge calculé à la lecture, § 4.2) ; aucun lieu n'est affiché comme vérifié sans identifiant Google.

### 4.2 Lieu introuvable ou fermé
- **Premier lot** : le lieu reste dans le programme, et rien de dérivé de Google n'est écrit (0011 inchangée) :
  - **introuvable, hors zone ou fermé définitivement** (statut de la fiche) : **aucun identifiant écrit** (ce que 0011 § 2 admet : l'absence d'identifiant ne dit pas le motif), ni position, ni temps de trajet vers lui et depuis lui ; le trajet relie le lieu avec identifiant précédent au suivant, ce qui modifie la source unique des paires (`src/prototype/programme-reduit.ts`, 0116 § 5.1) ;
  - **fermé le jour de son créneau** (horaires de la fiche) : **identifiant écrit**, comme un lieu ouvert ; le badge vient de la relecture des horaires à l'affichage ;
  - le badge **« à confirmer » (`toConfirm`) n'est jamais écrit** dans le programme ni ailleurs : il est ajouté **à la lecture** (0011 § 5), d'office pour une étape sans identifiant, et par la relecture des horaires pour un lieu fermé le jour de son créneau ; une relecture en échec n'ajoute rien et n'invente rien (0011 § 5).
  Aucune valeur inventée ; aucun motif écrit.
- **Remplacement** : pas dans le premier lot. Deux voies sont proposées au Tech Lead et à la Sécurité dans la spécification (une alternative nommée par l'IA dans la même sortie, vérifiée seulement si le lieu principal échoue ; ou un second appel de rédaction ciblé, dont l'entrée pose une question de données dérivées de Google). Le Product Owner n'en retient aucune ici.

### 4.3 Nom affiché
Le nom affiché est **celui de l'IA** (texte maison), même pour un lieu vérifié : le nom Google n'est ni stocké ni affiché hors de la carte Google (0011). Le lieu vérifié reçoit l'identifiant Google ; la fiche Google reste accessible comme aujourd'hui par cet identifiant (attribution).

### 4.4 Contrôles minimaux de la sortie de l'IA (« on restreindra au besoin »)
Le modèle est la décision 0111 : **un champ facultatif invalide est retiré, le lieu est gardé ; un texte trop long est coupé ; une clé inconnue est ignorée**. Restent refusés, parce qu'ils touchent l'affichage sûr : les URL et noms de domaine, les balises, les caractères hors du jeu admis (`texteMaison`, `contientUrl`, inchangés). Un **créneau** dont l'heure ou la nature est invalide, dont le lieu manque ou est refusé alors qu'il est obligatoire (tout créneau sauf arrivée, départ et pause, 0116 T1), ou dont le « pourquoi » manque ou est refusé alors qu'il a un lieu, est retiré et compté ; **une journée** n'est jamais retirée pour un créneau invalide ; **le programme** n'est refusé que s'il n'a aucune journée lisible. Aucune règle de forme (nombre de lieux par jour, durée, distance) ne refuse une sortie. Le verdict de la Sécurité sur ces contrôles est demandé dans la spécification ; il peut les resserrer.

## 5. Ce qui est abandonné, gelé ou conservé

### 5.1 `specs/P0-suite-2.md`, amendement 3 (qualité du programme, P0S2-PO-19 à PO-28) et sa tâche porteuse #500
| Règle | Sort pour le prototype | Pourquoi |
|---|---|---|
| PO-19 plan de recherche par secteurs (prompt `plan` v2) | **Abandonnée** | il n'y a plus de plan de recherche : l'IA organise elle-même les quartiers dans le programme |
| PO-20 recherche par secteur, un incontournable = un candidat (prompt `recherche` v4) | **Gelée** | l'agent de recherche web n'est plus dans la chaîne du premier lot ; il pourra revenir comme **source** des infos pratiques si Samuel le demande après un essai (question à Samuel, spécification) |
| PO-21 infos pratiques par étape (prix, horaires, conseil) | **Conservée dans son intention**, forme reprise | les trois champs sont écrits par l'IA dans le programme, d'après ses connaissances, affichés « à confirmer » ; la question 1 de l'amendement (où les porter dans `StopFacts`) reste ouverte et devient une question de la nouvelle spécification |
| PO-22 une journée = un ou deux secteurs voisins (moteur, en mémoire) | **Abandonnée comme règle du moteur**, **conservée comme critère de sortie** (§ 4.1 point 4) | le code ne regroupe plus ; l'IA le fait ; le rapport le mesure |
| PO-23 nom des secteurs du jour | **Conservée** | le titre du jour vient de l'IA |
| PO-24 règles Google inchangées | **Conservée** | garde-fou 2 |
| PO-25 compteurs du rapport sans nom de lieu | **Conservée, adaptée** | compteurs **maison** au journal (jours, créneaux, textes coupés, champs retirés, appels de modèle, lieux non vérifiés faute de part : liste fermée de 0117 § 4) ; **aucun compteur de verdict** (vérifiés, introuvables, fermés, hors zone) dans la base, l'état du workflow ni le journal (0011 § 2 et § 3) ; le rapport affiche le nombre d'étapes avec et sans identifiant, **calculé à la lecture** du programme stocké (source unique), sans aucun compteur du journal à côté ni dans le texte copié (0117 § 4) ; toujours des nombres, jamais un nom, un motif ni une donnée Google |
| PO-26 dimensionnement par capacité du jour | **Abandonnée** | le nombre de lieux d'un jour est celui du programme de l'IA ; les **plafonds par exécution restent** (0088) et s'appliquent à la vérification : la spécification fixe ce qui se passe quand le programme a plus de lieux que le plafond de Text Search |
| PO-27 remplissage de chaque créneau selon la durée des visites (règle de Samuel du 2026-10-18) | **Abandonnée pour le prototype, remplacée par la présente décision** | Samuel a décidé le 2026-10-21 de laisser l'IA remplir ; sa règle du 2026-10-18 visait le remplissage maison qui disparaît ; la question 5 de l'amendement 3 (mode paramétré du squelette) est **sans objet** pour le prototype |
| PO-28 jeu d'évaluation hors réseau | **Conservée dans son principe**, à réécrire | le jeu évalue désormais le programme complet (critères du § 4.1), pas la liste de candidats |
| Ticket #500 (tâche porteuse, `ready`) | **À geler par le CEO** | sa définition (prompts `plan` v2, `recherche` v4, règles de l'agent) ne correspond plus à la chaîne ; le Product Owner ne ferme pas un ticket |

### 5.2 Décision 0087 (préalables de B9b et B9c)
**Non touchée** : elle règle la chaîne du MVP (reprise du voyage complet, contrôle du logement par l'étape `l`, départ d'un quartier conseillé). Le premier lot ne touche que le prototype. Quand la chaîne du MVP sera inversée (§ 7), l'étape `l` (contrôle du logement, 0087 § 2) et le départ d'un quartier conseillé (0087 § 3, « Question 11 de B8 ») **restent valables** : ils vérifient des lieux, ce que la nouvelle chaîne fait aussi.

### 5.3 Décisions 0105 et 0106 (B9c : créneaux de repli, arrêt sans raison, « Surprends-moi », une case par repas)
**Non touchées pour le MVP** ; **signalées comme contradictoires** avec la nouvelle direction sur deux points, à reprendre quand le MVP sera inversé : les **créneaux de repli** `noOption` (0105 § 4.1, 0106 § 6.1) comblent des trous que le remplissage maison laisse ; dans la chaîne inversée, une journée sans trou est exigée de l'IA (§ 4.1 point 1) et un trou est un défaut mesuré, pas un créneau à afficher. « **Surprends-moi** » depuis les candidats non retenus (0105 § 5, 0106 § 1) suppose une réserve de candidats que la nouvelle chaîne n'a plus ; dans la chaîne inversée, l'idée du jour sera **demandée à l'IA** dans le programme (hors du premier lot). Rien n'est décidé ici pour le MVP.

### 5.4 Décision 0113 (forfait par passage du voyage complet)
**Non touchée pour le MVP.** Pour le prototype, les parts par étape (`a`, `l`, `b` à `e`) ne s'appliquent pas : `p0Run` garde ses **plafonds par exécution** (`mode-reel.json` : 3 USD de modèles, 90 Text Search, 90 fiches, 30 requêtes et 840 éléments Routes). La nouvelle chaîne consomme autrement : **beaucoup moins de modèles** (une rédaction, ou une par jour, au lieu de tours de recherche, notation et raisons) et **un Text Search par lieu** au lieu d'un par candidat. La recommandation du § 3 point 4 de 0113 (profil par jour et par ville) **reste pertinente** pour le MVP inversé et n'est pas tranchée (Samuel).

### 5.5 La chaîne du MVP (B5 moteur, B7 couche IA, B8 ancrage, B9 génération)
**Gelée dans son état, non amendée** par cette décision : Samuel juge d'abord le prototype inversé sur sa page d'essai. Le report de l'inversion dans B7 à B9 est une décision d'ordre du CEO, après ce jugement (§ 7). Jusque-là, les PR du MVP en cours (B9d, B9e, B10a) continuent sur la spécification actuelle ; le Product Owner **recommande** au CEO, qui décide de l'ordre des tâches, de n'ouvrir aucune nouvelle tâche de qualité du programme sur l'ancienne chaîne. Le principe « l'agent cherche, l'ancrage vérifie, le moteur planifie » reste écrit pour le MVP ; il est **remplacé pour le prototype** (en tête de cette décision).

### 5.6 Conservé tel quel
0011 et le régime de confinement (P0c) ; 0027 (coordonnées 30 jours) ; 0092 (temps de trajet du prototype) ; 0088 (plafonds de l'essai réel) ; 0111 (modèle des contrôles) ; 0114 (journal fermé) ; la garde, la réservation, le forfait, la purge, la page d'essai, « Mes voyages » sur `p0-reel` ; la grille G0 (copie conforme, Q236).

## 6. Mesure (Product Owner)
Le rapport d'exécution (affichage à la lecture, D24, jamais écrit) gagne les mesures du § 5.1 ligne PO-25 : compteurs maison du journal, et nombre d'étapes avec et sans identifiant **calculé à la lecture** du programme stocké ; aucun compteur de verdict n'est stocké ni journalisé (0011 § 2 et § 3, 0117 § 4). Les critères du § 4.1 se mesurent **sans réseau** sur la sortie de l'IA (jeu d'évaluation) et **sur le programme écrit** (tests du prototype) ; la spécification propose les critères, les tests sont placés et nommés selon 0116. Le jeu d'évaluation sur sorties simulées prouve le schéma et la mesure, **pas la qualité**. Le jugement de Samuel reste la mesure finale : il compare le programme affiché avec ses plans.

## 7. Conséquences et suite
- **Première tâche de code** : `specs/P0-programme-par-ia.md` (prototype `p0Run`, premier lot ; découpage proposé pour la suite). Rien d'autre ne change tant que Samuel n'a pas jugé un essai réel de la chaîne inversée.
- **Décisions attendues** avant le code : Tech Lead (format de sortie, un appel ou plusieurs, étapes du workflow, Text Search par nom, lieu introuvable, où porter les infos pratiques) : 0116 ; Sécurité (contrôles minimaux du § 4.4, données dérivées dans un éventuel second appel, compteurs, `zdr` et `data_collection` de la requête `programme`) : 0117. Ordre de fusion en tête.
- **CEO** : geler #500 ; reporter dans `QUESTIONS.md` les questions de la spécification ; ordonner le report dans la chaîne du MVP après le jugement de Samuel ; ajouter à `docs/CONTEXT.md`, principe technique 1, un renvoi à 0115 pour le prototype (suivi CEO, hors de cette PR).
- **Quand revoir** : après le premier essai réel de la chaîne inversée sur rome-1 et edimbourg-1. Si Samuel juge le programme meilleur que celui de la chaîne actuelle, le report dans B7 à B9 est spécifié ; sinon, les restrictions ajoutées le sont une à une, chacune justifiée par un constat (« on restreindra au besoin »).
