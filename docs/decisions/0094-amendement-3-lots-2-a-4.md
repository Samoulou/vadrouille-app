# 0094 — Amendement 3, lots 2 à 4 : candidat enrichi, place des règles de secteur, tickets et tests (ticket #500)

Statut : **décision déléguée** (architecture, bibliothèques, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion selon la règle en vigueur sur `main` (`docs/CONTEXT.md`, décision 0093) ; Samuel peut la remettre en cause à tout moment. Elle n'engage ni argent, ni compte externe, ni donnée personnelle hors UE : aucun plafond, aucun masque de champs Google et aucun fournisseur ne changent. Ce qui relève de la Sécurité, du Product Owner, du CEO ou de Samuel est écrit en **questions**, avec une recommandation, à la fin ; rien de cela n'est tranché ici.

Date : 2026-10-19 · Décideur : Tech Lead · Ticket : #500 · Spécification : `specs/P0-suite-2.md`, amendement 3 (P0S2-PO-19 à PO-28, PR #489) · Lot 1 : PR #505, fusionnée (`9492c3c`), revues consolidées des heads `ecacb65`, `d9d7702` et `438a027` · Décisions liées : 0011, 0016 § 4.3, 0045 § 3, 0055 § 6, 0072 § 5, 0077 § 1 point 3, 0088, 0093 (tâches A et B)

**Répond** aux deux questions de l'amendement 3 adressées au Tech Lead : la **question 1** (où porter `prix`, `horaires` et `conseil` dans le programme : § 7) et la **question 5** (où porter les valeurs propres au prototype de P0S2-PO-27 : § 6). Répond aussi à la **question 3 de la PR #505** (où porter secteur, incontournable et infos pratiques dans le candidat stocké : § 1).

**Amende, sans les réécrire** :
- **0088 § 6 et § 7** (`regrouperParJour` et ses jours de fermeture) : la fonction est **retirée** quand l'étape finale passe aux secteurs (ticket Q-L2d, § 11) ; ses garanties sont reprises par les tests nommés du § 10, qui autorise ce retrait (CLAUDE.md : aucun test supprimé sans décision écrite) ;
- **0088 § 8** (ordre de service de la capacité dans `demandeBornee`) : l'ordre devient repas, soirée, activités, idée (P0S2-PO-26, décision du Product Owner) ; `demandeBornee` **reste le seul endroit** qui le dit ;
- **avis du Tech Lead sur la question 1 de la PR #505** (revue de `ecacb65` : option (b), « secteur du logement par le centre le plus proche ») : **retiré**, voir § 2 point 3 et la question 6.

**N'amende pas** : 0011 et P0S2-PO-24 (aucune donnée Google dans un prompt, une requête web, un journal ou un fichier ; seuls `placeId` et `place_coordinates` stockés) ; 0053 et 0088 § 13 (plafonds, 840 éléments Routes) ; 0077 § 1 point 3 (la liste fermée des copies ne change pas : les copies existantes gagnent des champs et restent égales) ; B5-PO-1 (le MVP garde `activitesParRythme` et 09:00).

## Contexte

Le lot 1 (PR #505) a livré la partie recherche : plan par secteurs, `secteur` et `incontournable` par candidat, infos pratiques, compteurs de l'agent. Ces données vivent **à côté** du candidat (`ResultatAgent.infos`, en mémoire), parce que `CandidatSchema` est tenu égal à la contrainte `run_candidates_candidat_check` et à sa copie `src/research/candidat.ts`. Conséquence : l'étape finale de `p0Run`, qui relit les candidats en base, ne connaît ni secteur ni incontournable, et le plan n'est gardé nulle part (la table de travail n'admet « jamais de plan », `0003_prototype.sql`).

Points laissés ouverts par #505 : extension de `CandidatSchema` avant le lot 2 ; ligne de 0072 § 5 pour les cinq champs ajoutés à `p0.research_done` (mineur 12) ; `prix`, `horaires` et `conseil` à traiter comme non fiables à l'affichage (mineur 13) ; filtre `requeteSansDonneeDuBrief`, qui refuse toute requête contenant un mot du logement du brief (pour `rome-1` : « Colisée », « Monti »).

**Retour de Samuel sur Rome** (2026-10-18 21:20 UTC, cité par 0093 : « on avait dit par quartier mais pour certaine raison tu fais aller retour la même journée entre le Vatican et trestavere ») : le Vatican et le Trastevere se sont retrouvés le même jour, alors que la règle attendue est « un quartier par jour ». Sur `main`, l'étape finale regroupe encore les lieux **à la position** (`regrouperParJour`, 0088 § 6) ; aucune règle de secteur n'est appliquée. C'est exactement ce que le lot 2 remplace.

**Priorités de Samuel (2026-10-18)**, dans l'ordre : (1) l'app de bout en bout ; (2) ses tests fonctionnels, puis itérer les règles ; (3) moins de requêtes pour la même qualité. Elles guident trois choix ci-dessous : aucun ticket ne touche la chaîne B9b (§ 11) ; les valeurs des règles sont de la configuration, pour itérer sans code après ses essais (§ 4) ; un candidat d'un secteur sans jour n'est plus ancré (§ 5).

## Décision

### 1. Candidat enrichi : forme et emplacement (réponse à la question 3 de #505)

1. **Cinq champs facultatifs dans `CandidatSchema`** (`src/prototype/candidat.ts`, l'original), mêmes noms que le lot 1 : `secteur`, `incontournable`, `prix`, `horaires`, `conseil`, chacun `texteMaison(n)` (une ligne, Unicode imprimable, sans balise ni URL). Règle de schéma ajoutée : `incontournable` présent exige `secteur` présent. Aucun autre champ.
2. **Longueurs écrites une fois par côté de copie** : `LONGUEURS_TEXTE` gagne `secteur: 60`, `incontournable: 80`, `prix: 60`, `horaires: 120`, `conseil: 160` dans l'original et dans sa copie `src/ai/candidat.ts` (test d'égalité existant de `tests/unit/p0/copies.test.ts`). `LONGUEURS_PLAN` (`secteur`, `incontournable`) et `LONGUEURS_INFOS` de `src/ai/sorties.ts` sont **dérivées** de `LONGUEURS_TEXTE` de `@/ai/candidat` : plus aucun littéral 60, 80, 120 ou 160 pour ces champs dans `src/ai`. `raisonSecteur` (160) reste propre au plan.
3. **Copie `CandidatRechercheSchema`** (`src/research/candidat.ts`) étendue à l'identique ; la table de valeurs de `copies.test.ts` reçoit, pour chaque champ, une valeur admise, une trop longue, une avec URL, une avec balise, et le cas `incontournable` sans `secteur`.
4. **`InfosCandidat` et `ResultatAgent.infos` disparaissent** : l'agent écrit les champs dans le candidat lui-même. Deux porteurs de la même donnée seraient une duplication.
5. **Base** : une migration du rôle data remplace `run_candidates_candidat_check` par la liste des quinze clés (test existant « clés de run_candidates égales à CandidatSchema », `tests/db/prototype.test.ts`). Numéro : le suivant de `db/migrations/meta/_journal.json` **après la fusion de #507** (qui ajoute 0011), donc 0012 si rien d'autre n'est fusionné entre-temps.
6. **Ce que voient les modèles ne change pas** : `vuePourModele` (notation) garde ses clés (test : clés égales avant et après) ; `raisons` v2 reçoit le secteur et `incontournable: true` par `LieuRetenu`, comme au lot 1, lus désormais dans le candidat ; jamais `prix`, `horaires` ni `conseil`.
7. **MVP non touché** : la table `candidates` du MVP et les prompts de production (B7) ne changent pas (report au MVP hors périmètre de l'amendement).

### 2. Plan de secteurs entre les étapes, secteur du logement

1. **Proposition, soumise au verdict Sécurité (question 1)** : une table de travail `prototype.run_plans`, une ligne par exécution, même organisation, mêmes droits, même expiration et même purge que `run_candidates` (listes de purge de la migration). Contenu réduit au strict besoin du moteur : `{ "secteurs": [{ "nom", "voisins": [nom], "incontournables": [nom] }] }`, 9 secteurs au plus ; **ni `raison`, ni `requetes`** (les requêtes reprennent des envies du brief et partent chez le moteur de recherche ; le moteur n'en a pas besoin). Contrainte `CHECK` sur les clés, comme `run_candidates_candidat_check`. Relecture validée par le schéma du plan de `src/ai/sorties.ts` restreint à ces clés (pas de second schéma). Écrite par l'étape de recherche ; lue par l'ancrage (§ 5) et par l'étape finale.
2. **Si la Sécurité refuse** : aucune table ; le ticket Q-L2a ne livre que le candidat enrichi, et le lot 2 ne s'applique qu'en mode simulé (`pnpm p0`, tests), où le plan reste en mémoire. Aucun repli qui recopierait le plan dans chaque candidat (ce serait le même plan stocké, en plus diffus).
3. **Secteur du logement** : l'option (b) de la PR #505 (centre de secteur le plus proche de la fiche du logement) est **incompatible** avec P0S2-PO-22 point 1, qui affecte les secteurs aux jours **avant toute fiche** : un centre n'existe qu'après trois fiches du secteur. Mon avis de la revue de `ecacb65` est retiré. Le moteur reçoit donc le secteur du logement **en entrée** (`secteurDuLogement`), et la façon de le déterminer est la question 6 (Product Owner et Sécurité). La règle d'affectation (Q-L2c) n'en dépend pas ; son câblage (Q-L2d) en dépend.

### 3. Où vit chaque règle (« l'agent cherche, l'ancrage vérifie, le moteur planifie »)

| Règle | Module | Raison |
|---|---|---|
| Secteur et incontournable d'un candidat, infos pratiques | `src/research/agent.ts` (lot 1, inchangé sauf § 1 point 4) | L'agent cherche. |
| Affectation des secteurs aux jours, choix du secteur de chaque type (activités d'abord, repas et soirée sans repli), règle du jour (au plus N labels, un changement au plus, dîner et soirée dans le dernier, arrivée et départ à un label, incontournables d'abord), compteurs des jours | **nouveau `src/domain/secteurs.ts`**, pur, sur des **labels seulement** (aucune position) | Le moteur planifie. `src/domain` est sans entrée-sortie (0045 § 3) et chargé par `pnpm p0` comme par `p0Run` : une seule écriture des règles pour les deux chemins, réutilisable par le MVP sans copie quand le CEO ordonnera le report. |
| Centre d'un secteur (médiane des trois premières positions gardées, calculé une fois), appartenance (`rayonSecteurMetres`), voisinage vérifié (`voisinsMetres`) | **`src/grounding/zone.ts`** (ajout), avec `distanceVolOiseauMetres` existante | L'ancrage vérifie, sur des positions Google en mémoire ; `zone.ts` est déjà le module des positions de `p0Run`, `server-only`. Aucune position ne sort de `src/grounding` et du moteur. |
| Ordre du jour : étapes du premier secteur avant celles du second, charnière du déjeuner | **`src/domain/planification.ts`** et type `Creneau` de **`src/domain/squelette.ts`** : un champ facultatif `rangSecteur?: 0 \| 1` sur les créneaux d'activité et de repas ; un candidat ne remplit un créneau étiqueté que s'il porte le même rang. Créneau sans étiquette : comportement actuel, à l'identique. | Le moteur planifie. L'adaptateur étiquette les créneaux (la charnière se déduit du rang du déjeuner) ; le planificateur ne connaît ni secteur ni nom. Le MVP n'étiquette rien : ses tests (B5) restent inchangés et verts, c'est la preuve demandée. |
| Ordre de service de la capacité | `demandeBornee`, `src/server/p0/vers-moteur.ts` | Seul endroit (0088 § 8). |
| Valeurs | **nouveau `prototype/config/secteurs.json`**, schéma strict `ConfigSecteursSchema` dans `src/prototype/config.ts` ; `vers-moteur.ts` ne lit pas la configuration (test de frontière existant) : l'appelant la lui passe | Fichier à part plutôt qu'un bloc de `recherche.json` : `recherche.json` et `recherche-essai.json` portent le profil de recherche et restent inchangés ; les règles de secteur ne dépendent pas du mode. |

**Une seule sélection de la première série pour les deux chemins** : aujourd'hui, `scripts/p0/pipeline.ts` (mode simulé) et l'étape finale de `src/workflows/p0-run.ts` ont chacun leur boucle de sélection. La sélection par secteur est écrite **une fois** : le choix dans `src/domain/secteurs.ts` (Q-L2c, pur, la lecture des fiches passée en paramètre), la conversion des types dans `src/server/p0/vers-moteur.ts` ; Q-L2d remplace les deux boucles par cet appel. Pas de seconde copie de la règle.

Aucun ticket de cette décision ne modifie `src/server/env/index.ts`, `eslint.config.mjs` ni les listes du confinement (`tests/unit/confinement/listes/`, `tests/unit/p0/imports.test.ts`) ; c'est la règle de cycle de B9b (#514). Un ticket qui découvre qu'il doit le faire s'arrête, le dit dans sa PR, et n'est pas pris dans le même cycle que B9b.

### 4. Les valeurs des règles sont de la configuration

`prototype/config/secteurs.json` (schéma 1) porte : `rayonSecteurMetres` et `voisinsMetres` sans et avec `car` (valeurs de P0S2-PO-22 : 1 200 et 2 000 ; 6 000 et 15 000), le nombre de positions qui fixe un centre (3) et **`secteursParJourMax`** (1 ou 2). La spécification en vigueur dit « un ou deux secteurs voisins » : la valeur est **2** tant que la question 7 n'a pas de réponse écrite. Le retour de Samuel (« un quartier par jour ») se traduit, si le Product Owner ou Samuel le confirment, par **une ligne de configuration**, sans code : avec 1, l'étape « voisin qui devient second secteur » de P0S2-PO-22 point 2 a est sautée (temps libre) et la règle du jour contrôle un seul label. Le moteur et les tests couvrent les deux valeurs. C'est ce qui permet la priorité 2 de Samuel : après ses tests, on change une valeur, pas un module.

### 5. Aucun ancrage pour un secteur sans jour (moins de requêtes, même qualité)

L'affectation des secteurs aux jours (P0S2-PO-22 point 1) ne lit que le plan et les jours du brief : elle est calculable **dès l'étape d'ancrage**. L'étape d'ancrage la calcule (même fonction pure que l'étape finale, mêmes entrées, même résultat ; rien de stocké) et **n'envoie à Text Search aucun candidat d'un secteur sans jour** (`secteur_sans_jour`) : ces candidats ne pourraient jamais être planifiés. Les événements et les candidats sans secteur (plan absent, s'il est admis : question 8) sont ancrés comme aujourd'hui. Effet : de 0 à quelques requêtes Text Search en moins par exécution (Rome : 6 secteurs au plus pour 5 jours), sans changer le programme. Test exigé au § 10.

### 6. Remplissage par la durée (réponse à la question 5 de l'amendement 3)

**Mode paramétré du squelette partagé**, sans copie, comme le propose le Product Owner :
1. `EntreeSquelette` (`src/domain/squelette.ts`) gagne un champ facultatif `remplissage` ; absent, `squelette` fait exactement ce qu'il fait (MVP : `activitesParRythme`, 09:00). Présent, il porte le début du matin, la tolérance de demi-journée et, par jour, le nombre d'activités estimé du matin et de l'après-midi ; `squelette` ne lit alors pas `activitesParRythme` et pose sur chaque créneau d'activité une borne `finAuPlusTard` (fin cible de sa demi-journée).
2. `planifier` (`src/domain/planification.ts`) respecte `finAuPlusTard` quand elle est présente (règle d'arrêt de P0S2-PO-27 : la visite, trajet et marge compris, finit au plus tard à la fin cible ; sinon le créneau devient du temps libre). Absente : inchangé.
3. Les **valeurs du prototype** (début 08:00, `toleranceDemiJourneeMinutes` 30, durées par catégorie, `trajetEstimeMinutes` 10 et 20) vivent dans **`prototype/config/remplissage.json`** (schéma strict dans `src/prototype/config.ts`), jamais dans `src/server/config/moteur.json`, que le MVP lit.
4. L'**estimation** de la demande d'activités d'un jour avant les fiches est faite dans `demandeDuJour` (`src/server/p0/vers-moteur.ts`, seul calcul de la demande, 0088 § 4), avec les durées maison (`dureeMinutes` du candidat, sinon la durée de sa catégorie) et le trajet estimé, puis bornée par la capacité (`demandeBornee`).

### 7. Infos pratiques dans le programme (réponse à la question 1 de l'amendement 3)

**Trois champs facultatifs de `StopFactsSchema`** (`src/contracts/trip.ts`), noms proposés par le Product Owner : `priceNote` (60), `hoursNote` (120), `tip` (160). Contenu maison issu de notre recherche web (comme `area`, 0016 § 4.3), jamais une donnée Google. Dans le contrat, même règle de texte que les textes maison : une ligne, sans caractère de contrôle ni invisible, sans `<` ni `>`, sans URL. Pour ne pas l'écrire deux fois, la règle (caractères interdits, formes d'URL, `contientUrl`) **passe dans un nouveau `src/contracts/texte.ts`**, seule écriture ; `src/prototype/candidat.ts` et sa copie `src/ai/candidat.ts` l'importent au lieu de la recopier (`@/contracts` est déjà importé par `src/prototype/candidat.ts` et par `src/ai/sorties.ts` ; si une règle d'import de `src/ai` refusait `src/ai/candidat.ts` → `@/contracts`, le ticket garde la copie et son test de verdict, et le signale) et gardent `texteMaison`. Le cas « contientUrl et texteMaison : même verdict (table) » de `tests/unit/p0/copies.test.ts` est **déplacé**, avec sa table entière, vers le test du module de contrat, et `copies.test.ts` vérifie que les deux `texteMaison` donnent le même verdict sur cette table : aucun cas n'est perdu. La provenance s'affiche depuis `Stop.source` (domaine et date), déjà au contrat ; aucun champ de plus. La forme réduite du prototype (`src/prototype/programme-reduit.ts`) reprend `StopSchema` : elle les porte sans modification.

Pourquoi le contrat et non une extension propre au prototype : l'écran 13 (fiche étape) est celui du MVP ; une extension du prototype ferait deux formes d'étape et deux chemins d'affichage. Champs facultatifs : aucun mock ni aucune donnée existante ne change.

Le ticket de contrat (Q-L4a) attend la fusion de **#507 et #509**, qui modifient `src/contracts/trip.ts`, et celle de Q-L2a, qui modifie les deux fichiers de candidat.

### 8. Infos pratiques : non fiables jusqu'à l'écran (mineur 13 de #505)

Exigences du Tech Lead, quel que soit le verdict de la question 5 : l'écran affiche `priceNote`, `hoursNote` et `tip` **en texte brut** (nœud texte React), jamais par `dangerouslySetInnerHTML`, jamais transformés en lien, jamais interprétés comme Markdown ; test de rendu avec une valeur `<b>x</b>` (affichée telle quelle) et une valeur « www.exemple.ch » refusée en amont par le schéma. Le contrôle des chiffres contre la page lue (question 5) est une exigence de la Sécurité, s'il est retenu.

### 9. Journal `p0.research_done` (mineur 12 de #505)

Liste technique, telle que fusionnée par #505 et testée (`tests/unit/server/limiteur.test.ts`) : `sectors`, `mustSees`, `mustSeesWithoutCandidate`, `candidatesGrouped`, `sectorUnknown`, entiers ≥ 0, aucun nom. Elle **complète** la liste de 0072 § 5 **sous réserve du verdict Sécurité** (question 2) ; la note de version suivante la cite. Le lot 2 **n'ajoute aucun champ de journal** : les compteurs des jours (P0S2-PO-25) vont au rapport du mode simulé (`scripts/p0/rapport.ts`) et, pour `p0Run`, au rapport calculé à l'affichage depuis les labels du programme stocké, si la Sécurité l'admet (question 3).

### 10. Tests

**Tests autorisés au retrait** (avec `regrouperParJour`, par Q-L2d seulement) : le bloc « p0: regroupement par jour à vol d'oiseau, après les fiches » de `src/grounding/budget-routes.test.ts` (11 cas). Chaque garantie est reprise **avant** le retrait, dans le même ticket ou un ticket antérieur :

| Cas retiré | Repris par |
|---|---|
| « un quartier par jour », « cohérence géographique » | `qualite: une journée, un ou deux secteurs voisins` ; `qualite: Vatican et Trastevere jamais le même jour` |
| « capacité de la matrice du jour », « capacités serrées », « capacité inférieure à la demande » | `qualite: capacité servie aux repas d'abord` ; `qualite: dimensionnement sous les plafonds` |
| « demande par type respectée » | tests de `src/domain/secteurs.test.ts` sur la première série par jour |
| « pénurie : répartie sur tous les jours » | `qualite: pénurie répartie sur tous les jours` |
| « jours de fermeture » | `qualite: jours de fermeture` |
| « plus de lieux que les parts », « égalité de distance » | tests de classement par secteur de `src/domain/secteurs.test.ts` (mieux classés d'abord ; égalité : ordre d'entrée) |
| « déterministe » | même cas sur la sélection par secteur |

La PR de Q-L2d liste chaque cas retiré et le test qui le reprend.

**Tests ajoutés** (noms de la spécification quand elle en donne ; « nouveau » sinon) :
- Q-L2a : table de `copies.test.ts` (§ 1 point 3) ; clés de `run_candidates` (test existant) ; `p0: plan de secteurs, clés fermées et purge` (si la table est admise : `raison` ou `requetes` refusés par la contrainte, ligne supprimée avec l'exécution) ; écriture et relecture du plan dans `tests/unit/adapters/prototype-travail.test.ts` ; `qualite: champs du candidat portés par le candidat` (nouveau : plus de `infos` à côté ; mêmes valeurs qu'au lot 1 sur les deux cas d'évaluation) ; `vuePourModele` inchangée.
- Q-L2b : `moteur: créneau étiqueté par secteur` (nouveau : jamais un candidat d'un autre rang dans un créneau étiqueté ; charnière du déjeuner ; activité sans place : temps libre) ; tests B5 existants inchangés.
- Q-L2c : `src/domain/secteurs.test.ts` (affectation, avec `secteurDuLogement` en entrée ; deux jours au plus par secteur ; `secteur_sans_jour` ; activités d'abord ; repas et soirée sans repli ; `secteursParJourMax` à 1 et à 2 ; règle du jour) ; centre, appartenance et voisinage dans `src/grounding` (centre calculé une fois sur trois positions ; moins de trois : pas de contrôle sauf le secteur du logement) ; `qualite: capacité servie aux repas d'abord` ; `src/prototype/config.test.ts` pour `secteurs.json` (schéma strict, clé inconnue refusée).
- Q-L2d : les critères « sans dépendance » et « repris de #490 » de P0S2-PO-28 qui portent sur le moteur ou le rapport (`un incontournable = une étape`, `incontournables d'abord, sans catégorie codée`, `une journée, un ou deux secteurs voisins`, `pas d'aller-retour dans la journée`, `repas et soirée dans le secteur du jour`, `pas de repli des repas sur un autre secteur`, `appartenance exécutable dans l'étape finale`, `marge épuisée sans plafond atteint`, `plafond atteint sans programme partiel`, `jour rempli sans traverser la ville`, `dimensionnement sous les plafonds`, `aucune donnée Google dans les infos pratiques, le secteur ni les prompts` étendu à `facts.area`, `compteurs du rapport`, `pénurie répartie sur tous les jours`, `jours de fermeture`), sur les fixtures `prototype/fixtures/qualite/` et en **deux chemins** (`pnpm p0` simulé et étape finale de `p0Run` par son harnais) ; plus trois nouveaux : `qualite: Vatican et Trastevere jamais le même jour` (positions fabriquées à environ 2,3 km, voisins déclarés par le plan : séparés par le voisinage vérifié avec `secteursParJourMax` = 2, et toujours avec 1) ; `qualite: aucun ancrage hors des secteurs du séjour` (§ 5 : nombre d'appels Text Search du double égal au nombre de candidats des secteurs affectés, plus les événements) ; `p0: plan de secteurs relu par l'étape finale` (si la table est admise).
- Q-L3a : `qualite: un matin rempli selon la durée des visites` (fixture de durées, P0S2-PO-28 point 3, horaires à la minute) ; `qualite: le prototype ne lit pas activitesParRythme` ; tests B5 inchangés.
- Q-L3b : `qualite: capacité de Rome` ; `qualite: durées maison seulement` ; estimation de `demandeDuJour` avec et sans `remplissage`.
- Q-L4a : `StopFactsSchema` admet les trois champs absents ou bornés, refuse URL, balise, caractère de contrôle et dépassement ; table de `contientUrl` déplacée vers `src/contracts/texte.test.ts` (§ 7) ; même verdict des deux `texteMaison` (`copies.test.ts`).
- Q-L4b : `qualite: infos pratiques dans l'étape` ; compteur « étapes avec infos complètes et incomplètes » au rapport simulé ; contrôle des chiffres si la question 5 le retient.
- Q-L4c : rendu en texte brut (§ 8), champ absent, provenance, accessibilité (`pnpm test:a11y`), libellés selon la réponse UX.

Partout : aucun appel réel, doubles qui échouent hors fixture ; `mode-reel.json`, `essai.json`, `plafonds.json`, `recherche.json` et `recherche-essai.json` inchangés (test d'empreinte de P0S2-PO-28) ; prompts versionnés inchangés par le lot 2 (aucun prompt n'y change) ; `pnpm verify` vert.

### 11. Tickets

Règle : **dans une même vague, aucun fichier n'est partagé entre deux tickets** ; une vague ne commence qu'après la fusion de toute la vague précédente (sauf mention). Les fichiers listés sont ceux que le ticket peut modifier ; un fichier hors liste demande l'accord du Tech Lead dans la PR. Aucun ticket ne touche les fichiers des PR ouvertes #504, #507, #509 et #512, ni `src/server/creation/`, ni la génération du MVP (B9b, #514).

**Vague 1** (trois tickets parallèles)

| Ticket | Rôle | Fichiers | Préalables |
|---|---|---|---|
| **Q-L2a — Candidat enrichi et plan gardé** | data, avec ia-recherche pour l'agent | `src/prototype/candidat.ts`, `src/ai/candidat.ts`, `src/research/candidat.ts`, `tests/unit/p0/copies.test.ts`, `src/ai/sorties.ts`, `src/research/agent.ts`, `src/server/p0/vers-couche-ia.ts`, `src/ai/entrees.ts`, `scripts/p0/pipeline.ts` (lecture de `infos` seulement), `tests/unit/evals/qualite.test.ts`, `tests/unit/p0/vers-couche-ia.test.ts`, migration suivante de `db/migrations/` (et `.down.sql`, `meta/`), `db/README.md`, `tests/db/prototype.test.ts`, `src/contracts/prototype-travail.ts`, `src/adapters/prototype-travail.ts`, `tests/unit/adapters/prototype-travail.test.ts` | #507 fusionnée (numéro de migration, `_journal.json`, `db/README.md`) ; question 1 (partie table) |
| **Q-L2b — Créneau étiqueté par secteur** | backend (moteur) | `src/domain/squelette.ts` (type `Creneau` seulement), `src/domain/planification.ts`, nouveau `src/domain/planification-secteurs.test.ts` | aucun |
| **Q-L2c — Règles des secteurs** | ia-recherche, revue backend sur `src/domain` | nouveaux `src/domain/secteurs.ts` et `src/domain/secteurs.test.ts`, `src/grounding/zone.ts` (ajouts seulement, `regrouperParJour` intact), nouveau `src/grounding/secteurs-zone.test.ts`, `src/server/p0/vers-moteur.ts` (`demandeBornee`), `tests/unit/p0/vers-moteur.test.ts`, `tests/unit/p0/borne-demande-du-jour.test.ts`, `src/prototype/config.ts`, `src/prototype/config.test.ts`, nouveau `prototype/config/secteurs.json` | aucun (question 7 : valeur seulement) |

**Vague 2** (après Q-L2a, Q-L2b et Q-L2c ; deux tickets parallèles, fichiers distincts)

| Ticket | Rôle | Fichiers | Préalables |
|---|---|---|---|
| **Q-L4a — Contrat : infos pratiques de l'étape** | backend (contrats) | `src/contracts/trip.ts`, `src/contracts/trip.test.ts`, nouveaux `src/contracts/texte.ts` et `src/contracts/texte.test.ts`, `src/contracts/index.ts`, `src/contracts/README.md`, `src/prototype/candidat.ts`, `src/ai/candidat.ts`, `tests/unit/p0/copies.test.ts` | #507, #509 et Q-L2a fusionnées |
| **Q-L2d — Étape finale par secteurs** | ia-recherche | `src/workflows/p0-run.ts`, `tests/unit/workflows/p0-run.test.ts`, `tests/unit/workflows/p0-run-finale.test.ts`, `scripts/p0/pipeline.ts`, `scripts/p0/fichiers.ts`, `scripts/p0/rapport.ts`, `tests/unit/p0/pipeline.test.ts`, `src/server/p0/assemblage.ts` (`facts.area` = label maison du secteur), `src/server/p0/moteur-final.ts`, `src/server/p0/vers-moteur.ts` (conversion de la sélection), `src/grounding/zone.ts` (retrait de `regrouperParJour`), `src/grounding/budget-routes.test.ts`, nouveau dossier `prototype/fixtures/qualite/`, nouveau `tests/unit/p0/qualite-moteur.test.ts`, `evals/resultats/simule.json` | questions 6 et 8 ; question 3 pour la partie `p0Run` du rapport (sinon rapport simulé seul) |

Puis **essai rome-1** (test fonctionnel de Samuel ; le CEO l'ordonne), avant la vague 3.

**Vague 3** (parallèle)

| Ticket | Rôle | Fichiers | Préalables |
|---|---|---|---|
| **Q-L3a — Remplissage par la durée dans le moteur partagé** | backend (moteur) | `src/domain/squelette.ts`, `src/domain/planification.ts`, nouveau `src/domain/remplissage.test.ts` | Q-L2d fusionnée |
| **Q-L4b — Infos pratiques écrites dans l'étape** | ia-recherche | `src/server/p0/assemblage.ts`, `scripts/p0/rapport.ts`, nouveau `tests/unit/p0/infos-pratiques.test.ts` ; `src/research/agent.ts` et `tests/unit/evals/qualite.test.ts` si la question 5 retient le contrôle des chiffres | Q-L4a et Q-L2d fusionnées |
| **Q-L4c — Infos pratiques dans la fiche étape** | front | `src/features/sejour/StopSheet.tsx`, `src/features/sejour/StopSheet.test.tsx`, `src/features/sejour/fiche.ts`, `src/i18n/fr/sejour.json` | Q-L4a fusionnée ; spécification UX (question 2 de l'amendement 3) |

**Vague 4**

| Ticket | Rôle | Fichiers | Préalables |
|---|---|---|---|
| **Q-L3b — Durées du prototype** | ia-recherche | nouveau `prototype/config/remplissage.json`, `src/prototype/config.ts`, `src/prototype/config.test.ts`, `src/server/p0/vers-moteur.ts` (`demandeDuJour`), `tests/unit/p0/vers-moteur.test.ts`, `src/server/p0/moteur-final.ts`, `src/workflows/p0-run.ts`, `scripts/p0/pipeline.ts`, `tests/unit/p0/pipeline.test.ts`, nouveau `prototype/fixtures/qualite/durees/`, nouveau `tests/unit/p0/qualite-durees.test.ts` | Q-L3a fusionnée ; Q-L4b n'a aucun fichier commun |

Le **filtre `requeteSansDonneeDuBrief`** (question 4) n'a pas de ticket tant que la Sécurité n'a pas répondu : si le verdict arrive avant la prise de Q-L2a, il y entre (`src/research/agent.ts` est à Q-L2a) ; sinon il entre dans Q-L2d, qui reçoit alors `src/research/agent.ts` et `tests/unit/p0/composition.test.ts` (aucun autre ticket de la vague 2 n'y touche), pour que l'essai rome-1 en profite.

### 12. Coordination avec 0093 (tâches A et B)

- **Tâche A** (décompte et fusibles : `src/server/p0/decompte.ts`, `prototype/config/essai.json`, `mode-reel.json`, `src/server/usage/forfait.ts`, `specs/P0-suite-2.md`) : aucun ticket ci-dessus n'a ces fichiers. Après elle, `placesTextSearch` et `placesDetails` ne sont plus des fusibles : le critère `qualite: dimensionnement sous les plafonds` (Q-L2d) vérifie alors les bornes de P0S2-PO-26 comme des **bornes du dimensionnement** (première série, fiches, éléments et requêtes Routes), sans attendre un arrêt `cap_reached` qui n'existera plus que pour Routes et le coût des modèles. Le critère « fichiers de plafonds non modifiés par la tâche porteuse » reste vrai pour les tickets de 0094 : seule la tâche A les modifie.
- **Tâche B** (optimisation des trajets, « regrouper et ordonner par quartier avec nos propres distances, puis ne demander à Google que les trajets entre étapes qui se suivent ») recouvre le lot 2 : le regroupement par quartier **est** l'affectation par secteurs de Q-L2c et Q-L2d, et les deux touchent l'étape finale de `src/workflows/p0-run.ts`. Recommandation au CEO (question 9) : la tâche B **après** Q-L2d, sur le regroupement par secteurs livré, et limitée à la demande Routes (paires consécutives au lieu de matrices) ; jamais en même temps que Q-L2d ni que Q-L3b (même fichier).

### 13. Ordre recommandé au CEO (l'ordre des tâches est au CEO)

1. La chaîne B9b et la priorité 1 de Samuel passent d'abord ; aucun ticket ci-dessus ne touche ses fichiers ni les listes de sa règle de cycle.
2. Vague 1 dès que des places de cycle restent, puis vague 2 : elle corrige le défaut que Samuel a vu (Vatican et Trastevere le même jour) et lui rend un essai à tester (priorité 2).
3. Vagues 3 et 4 **après** son essai. Le lot 3 rapproche la première série de la capacité : à Rome, de 3 activités par jour plein (squelette actuel, `balanced`) à 7, soit jusqu'à 78 fiches Place Details par exécution (tableau à 840 éléments de P0S2-PO-26), sous les plafonds mais contre la priorité 3. L'essai de la vague 2 dira si la qualité le justifie ; la décision d'ordre reste au CEO.

## Questions (aucune n'est tranchée ici)

1. **Sécurité** — Le plan de secteurs peut-il être gardé entre les étapes de `p0Run` dans `prototype.run_plans`, forme réduite (noms, voisins, incontournables ; ni raison, ni requêtes), même expiration et même purge que `run_candidates` (§ 2) ? Recommandation : oui. Bloque la partie table de Q-L2a et le lot 2 en mode réel (pas le mode simulé).
2. **Sécurité, puis CEO** — Les cinq champs entiers de `p0.research_done` ajoutés par #505 complètent-ils 0072 § 5 (§ 9) ? Recommandation : oui, comme l'ont vérifié les relecteurs (« journaux en entiers ») ; le CEO les cite dans la note de version suivante. Ne bloque rien (déjà fusionné, régularisation).
3. **Sécurité** — Le rapport d'exécution de `p0Run` (`src/server/p0/rapport.ts`, contenu fermé par le verdict P0-Q32) peut-il porter les compteurs des jours de P0S2-PO-25 (jours à un, deux, plus de deux labels ; jours à plus d'un changement), calculés à l'affichage sur les labels maison du programme stocké, sans position ni nom ? Recommandation : oui. Bloque la partie `p0Run` du critère `qualite: compteurs du rapport` (Q-L2d livre sinon le rapport simulé seul).
4. **Sécurité, avec le CEO** — Filtre `requeteSansDonneeDuBrief` : un mot du logement du brief qui figure aussi dans un nom du plan validé (secteur ou incontournable) peut-il cesser d'être protégé **seul**, les fragments de plusieurs mots restant protégés ? Le modèle du plan ne voit pas le logement (correction 2 de la PR 326) ; sans cela, pour `rome-1`, « Colisée » et « Monti » ne peuvent pas être cherchés, et raccourcir le texte du logement ne suffit pas (« Monti » reste). Recommandation : oui. Bloque la qualité du prochain essai rome-1, pas le code des lots 2 à 4.
5. **Sécurité** — Infos pratiques venues d'une page non fiable : faut-il, en plus du rendu en texte brut (§ 8, exigé), retirer dans l'agent un `prix` ou des `horaires` dont un nombre n'apparaît pas dans le texte lu de la page source (contrôle en mémoire, aucune lecture de plus) ? Recommandation : oui. Bloque seulement la partie agent de Q-L4b.
6. **Product Owner et Sécurité** — Comment déterminer le secteur du logement avant toute fiche (§ 2 point 3) ? Options : (a) donner au plan le seul quartier du logement (une donnée du brief vers un modèle) ; (c) comparer, dans le code et en mémoire, les noms du plan (secteurs, puis incontournables) au texte du logement par `cleDeNom` (« Rione Monti (près du Colisée) » donne « Monti »), sans modèle ni appel ; à défaut de correspondance, le premier secteur du plan ; (d) réordonner P0S2-PO-22 pour ficher les jours pleins avant ceux d'arrivée et de départ. Recommandation : (c). Bloque Q-L2d, pas Q-L2c.
7. **Samuel (par le CEO), puis Product Owner** — Une journée pleine : **un seul** secteur (ton retour sur Rome) ou **un ou deux secteurs voisins** (cadrage § 3.7, P0S2-PO-22) ? Recommandation : un seul pour ton prochain essai ; le moteur garde les deux (`secteursParJourMax`, § 4), et revenir à deux est une ligne de configuration. Ne bloque que la valeur ; elle reste 2 tant que la réponse n'est pas écrite.
8. **Product Owner** — Plan refusé ou absent (choix 3 de #505 : recherche sans plan) : que fait l'exécution ? Recommandation : arrêt avant l'ancrage, code interne dédié persisté `pipeline_failed`, comme `research_empty` (0072 § 3) : aucun programme sans secteurs, et ni l'ancrage ni l'étape finale ne sont payés pour rien (priorité 3). Bloque Q-L2d.
9. **CEO** — Ordre du § 13, en particulier le lot 3 après l'essai de Samuel, et la tâche B de 0093 après Q-L2d (§ 12). Ne bloque rien.

Rappels, non nouveaux : question 2 de l'amendement 3 (UX/UI, présentation des infos pratiques) ; choix 2 de #505 (mots distinctifs) et mineur 14 de sa première revue (éviction par revendication du même incontournable), au Product Owner.

## Conséquences

- Le lot 2 suit le principe : l'agent pose les labels, l'ancrage vérifie les positions (`zone.ts`), le moteur choisit et ordonne (`src/domain`). Les règles du jour sont écrites une fois, pour `pnpm p0` et `p0Run`.
- `regrouperParJour` disparaît avec Q-L2d ; ses garanties sont reprises par des tests nommés.
- Le MVP ne change pas de comportement : tous les ajouts à `src/domain` sont des champs facultatifs, et le MVP n'en passe aucun.
- Les valeurs des règles (rayons, voisinage, secteurs par jour, durées) se changent sans code.
- Une exécution n'ancre plus les candidats d'un secteur sans jour.

## Quand revoir cette décision

- Après l'essai rome-1 de la vague 2 : valeurs de `secteurs.json`, utilité du lot 3 au regard du nombre de fiches.
- Si la Sécurité refuse la table du plan (question 1) : le lot 2 en mode réel demande alors une autre architecture, à décider.
- Quand le CEO ordonnera le report de ces règles dans la chaîne du MVP (B5, B7, B9) : `src/domain/secteurs.ts` est le point d'entrée prévu.
