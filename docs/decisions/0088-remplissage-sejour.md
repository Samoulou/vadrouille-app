# 0088 — Remplissage du séjour (ticket #483, PR #490) : cibles depuis la demande, regroupement par quartier sur tous les jours, limite Routes de 840 éléments

Statut : **deux régimes**.
- **§ 1 à § 12 : décision déléguée** (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; **définitive sans veto de Samuel 6 heures après sa fusion** (décision 0068). Les valeurs de profil de recherche citées (marge de 30 %) sont celles d'ia-recherche, dans les plafonds (0055 § 6 point 5) ; le Tech Lead les valide sur l'architecture, il ne touche à aucun montant.
- **§ 13 : décision de Samuel** (argent, plafond de dépense Routes), reportée ici à la demande du CEO ; **pas de délai de veto** : elle vaut dès sa fusion. Le Tech Lead n'a pas vu la carte de décision lui-même ; la source est celle que le CEO transmet (ci-dessous) et qu'il reporte dans `QUESTIONS.md`.

Date : 2026-10-18 · Décideur : **Tech Lead** (§ 1 à § 12) ; **Samuel** (§ 13, transmis par le CEO) · Ticket : #483 · PR : #490 (head relu : `4b0b78f`) · Demandes de Samuel citées : 2026-10-18 09:40 UTC (« pourquoi les trois derniers jours les activités s'arrêtent à 13h »), 09:47 UTC (« répartis de manière cohérente, par exemple par quartier… pour pas tout traverser la ville 10 fois ») · Spécification liée (en revue, non fusionnée) : PR #489, `specs/P0-suite-2.md` amendement 3 (P0S2-PO-20, PO-22, PO-26, PO-27, question 6)

**Amende, sans les réécrire** (le texte amendé reste en place ; cette décision prévaut sur les points nommés ; renvoi ajouté en tête de 0053, 0055 et 0073) :
- **0055 § 6 point 4**, second temps (« après les fiches : regroupement par jour et ordre provisoire ») : l'algorithme du regroupement (§ 6 ci-dessous) ; le cadre de 0055 est **gardé** : en mémoire, par le code, sans appel de modèle ni écriture, sur les positions des fiches de l'étape finale, avant Routes qui ne sert qu'à l'ordre final ;
- **0053 amendement 1 point 4** (tri à vol d'oiseau avant Routes) : **précisé, non changé**. Le choix de Samuel (tri calculé par notre code, sans modèle, deux temps, la position du cache seulement au premier) reste entier ; seul l'algorithme du second temps, qui n'était écrit que dans le code (`src/grounding/zone.ts` sur `main` : « le premier lieu ouvre le jour, puis le plus proche »), est remplacé ;
- **0053 « Décision » et « Conséquences »** (500 éléments Routes par voyage, réserve de 4,30 USD) et **0073 point 1** (`routesElements` 500 de l'essai, égal au mode réel) : par Samuel, § 13 ;
- **0055 § 6 point 5** (profil de recherche du mode réel) : en exécution comptée, cibles calculées depuis la demande (§ 1 à § 3).

## Contexte
L'essai réel rome-1 du 2026-10-18 a trouvé 23 candidats pour environ 34 lieux demandés ; `regrouperParJour` remplissait les jours dans l'ordre et laissait les derniers presque vides (arrêt à 13 h) ; la demande du jour comptait des créneaux hors de la fenêtre d'arrivée et de départ ; l'agent comptait les événements en soirée alors que la planification n'y en met jamais. La PR #490 corrige ces quatre points. La revue consolidée du head `b7d0c32` a bloqué faute de décision écrite (bloquant 1). Ce document juge chaque choix sur le code du head `4b0b78f`.

Principe appliqué : **l'agent cherche, l'ancrage vérifie, le moteur planifie** ; aucune règle écrite deux fois ; aucune donnée Google dans un prompt ni stockée (0011, 0027) ; aucun plafond de dépense changé par le studio.

## Décision

### 1. Marge des cibles : 30 % — **retenu**
`MARGE_CIBLES_POURCENT = 30` (`src/server/p0/vers-couche-ia.ts:134`), appliquée par `bornesDepuisDemande` (`:147`) : par créneau, la plus grande de la cible de `recherche.json` et de la demande de la première série plus 30 % (arrondi au-dessus, en entiers) ; total : la plus grande de `totalCandidats` et de la somme des cibles. Valeur d'ia-recherche (0055 § 6 point 5), qui couvre les pertes à l'ancrage, à la notation et aux fiches. Elle ne change aucun plafond : les cibles restent sous le plafond du § 2, et le coût des modèles reste borné à chaque appel par `coutUsd` (3 USD) ; le surcoût estimé (un lot de notation de plus, `slotFit` : environ 0,02 USD sur rome-1) est dans la marge. Une seule constante, un seul calcul.

### 2. Plafond de la recherche — **retenu**
- `p0Run` : `min(candidatsTrouves, placesTextSearch − 2 × logements)` (`src/workflows/p0-run.ts:337`) : une requête Text Search par logement à l'ancrage et une à l'étape finale (0055, amendement A3), le reste pour les candidats.
- `pnpm p0` : `placesTextSearch − logements` (`scripts/p0/pipeline.ts:160`) : la CLI ne fait qu'une requête par logement ; `candidatsTrouves` y reste un fusible qui arrête l'exécution (`cost_cap_reached`), pas une cible. Les deux formules diffèrent parce que les deux pipelines consomment différemment ; chacune est écrite une fois, au point d'appel, et passe par la même fonction.
- Plafond inférieur à 1 : `bornesDepuisDemande` rend `null` ; `briefTientDansLeMode` refuse le brief au lancement, `etapeRecherche` s'arrête en `pipeline_failed` avant toute composition et tout appel, `pnpm p0` en `quota_reached`. Jamais un plafond ramené à 1. Inatteignable avec les configurations commitées ; testé.

### 3. Exécution comptée seulement — **retenu**
Les cibles calculées ne valent qu'en mode réel (`bornesDeLaRecherche`, `mode === "reel"`). L'essai garde le profil fixe de `recherche-essai.json` : 0073 point 4 est une décision de Samuel, que le studio ne change pas.

### 4. Un seul chemin de calcul de la demande — **retenu**
`demandesDuSejour` (`src/server/p0/vers-moteur.ts:153`) est la seule fonction qui calcule la demande de la première série ; `p0Run` (`dimensionsDuSejour`) et `pnpm p0` l'appellent, puis `bornesDepuisDemande`. `demandeDuJour`, `demandeBornee` et `TYPES_SERIE` quittent `moteur-final.ts` (`server-only`) pour `vers-moteur.ts`, chargé par `pnpm p0`, sans changement de comportement. `bornesRechercheDuBriefPourTests` est marqué « Réservé aux tests » : accepté.

### 5. Demande du jour bornée par sa fenêtre réelle — **retenu, avec un test de plus**
`demandeDuJour` (`vers-moteur.ts:110`) parcourt les créneaux du squelette de l'heure d'arrivée à l'heure de départ, avec les durées par défaut et sans trajet. C'est une **borne haute** de ce que planifie le moteur, pas une planification : le moteur reste seul à planifier (`planifierJour`). Le nombre de créneaux reste celui du squelette (rythme) ; le remplissage selon la durée des visites est l'objet de P0S2-PO-27 (#489).

**Condition** : la borne n'est vraie que tant que `demandeDuJour` suit les règles de `planifierJour`, qu'elle reproduit. La PR ajoute un test qui la garde : pour chaque brief de `prototype/briefs/` en mode simulé (fixtures existantes) et pour le cas rome-1 du test de `moteur-final`, le nombre de lieux planifiés de chaque type dans chaque jour est **au plus** `demandeDuJour` de ce jour. Une évolution de `planifierJour` qui casse ce test oblige à changer `demandeDuJour` dans la même PR.

### 6. Nouvel algorithme de `regrouperParJour` — **retenu** (amende 0055 § 6 point 4)
`src/grounding/zone.ts:261`, module pur et déterministe, sur les positions des fiches de l'étape finale :
1. **parts** proportionnelles à la demande de chaque jour (`partsDesJours`, `:117`) : une pénurie touche tous les jours, un lieu d'écart au plus entre deux jours qui demandent autant ;
2. **lieux retenus** : de chaque type, les premiers dans l'ordre du classement, autant que la somme des parts (`:271`) ; la distance range les lieux entre les jours, elle n'en écarte aucun et n'en fait entrer aucun moins bien classé (cadrage § 3.7) ;
3. **centres** « farthest-first » (`:292`) : le premier lieu retenu centre le jour 1, chaque jour suivant le lieu le plus éloigné des centres posés, pris parmi les lieux ouverts ce jour-là s'il y en a : un quartier par jour (demande de Samuel, 09:47 UTC) ;
4. **affectation** sous les parts (`affecter`, `:163`), paires triées par rang de contrainte (`:184` : d'abord un lieu qui a un jour de fermeture, sur un jour où il est ouvert ; puis les autres paires ouvertes ; en dernier recours un lieu fermé ce jour-là), puis par distance au centre ;
5. **affinage** : centres recalculés (lieu le plus central de son groupe) et réaffectation, 10 passes au plus (`PASSES_REGROUPEMENT`, `:197`), arrêt à stabilité ; le **meilleur** état rencontré est rendu (`:221`, `:326` : moins de lieux un jour de fermeture, puis la plus petite dispersion).

Garanties exigées et testées (`src/grounding/budget-routes.test.ts`) : aucun lieu dans deux jours ; aucune part ni capacité de matrice dépassée (test de non-régression sur capacités 0 à 20, sept jours, 5 à 40 lieux) ; pénurie répartie (cas Rome, 23 lieux sur 5 jours) ; un jour ne mélange pas deux zones éloignées ; déterminisme. Coût en calcul négligeable (jours × lieux retenus × 10 passes). Le regroupement reste **un pré-tri du budget Routes** (pourquoi il est dans `src/grounding`) ; il ne décide ni des horaires ni de l'ordre, que le moteur fixe.

Lien avec #489 : si cette PR fusionne d'abord, l'affectation des secteurs aux jours (P0S2-PO-22) **remplace** ce regroupement par lieux et garde sa garantie « une pénurie touche tous les jours » ; c'est déjà écrit dans la spécification en revue. Limite connue, acceptée : le regroupement ignore la position du logement (les cinq briefs n'en ont qu'un).

### 7. Jours de fermeture dans le regroupement — **retenu**
`joursDeFermeture` (`vers-moteur.ts:257`) rend les rangs des jours dont aucune plage d'ouverture de la fiche ne recouvre la fenêtre du jour ; horaires inconnus : aucun jour (B5-PO-5). `p0-run.ts:834` passe ces rangs (`fermeLes`) au regroupement. Les horaires viennent des fiches de l'étape finale, sont lus **en mémoire, côté serveur**, et n'entrent dans **aucun prompt**, aucun état ni aucune écriture ; `zone.ts` ne reçoit que des rangs de jours, jamais un horaire. Usage déjà admis des horaires par le moteur (R4) ; aucun nouveau masque ni SKU. C'est la cause, démontrée par la correction 1, de la perte d'une étape dans `p0-run-finale` (edimbourg-2, lundi : `c_011` et `c_012` fermés regroupés au jour 1) : l'assertion d'origine est rétablie (§ 12).

### 8. `typesPrioritaires` — **refusé** ; ordre de service de la capacité : `demandeBornee` seule
Constat sur `4b0b78f` : `p0Run` passe à `regrouperParJour` des demandes **déjà bornées** par `demandeBornee` (`vers-moteur.ts:137`, via `demandesDuSejour` avec `capacites`), dont la somme ne dépasse jamais la capacité du jour. Dans `partsDesJours`, la capacité ne peut donc jamais lier avant les demandes par type, et l'option `typesPrioritaires: ["meal", "evening"]` (`p0-run.ts:837`) **n'a aucun effet** ; son commentaire (« repas d'abord ») contredit l'ordre réellement appliqué en amont (activité, repas, soirée). Deux endroits qui disent l'ordre de service de la capacité, dont un mort : refusé (duplication).

À appliquer dans #490 :
- supprimer l'option `typesPrioritaires` (`OptionsRegroupement`, paramètre `options` de `regrouperParJour`, argument de `p0-run.ts:837` et son commentaire) ; `partsDesJours` sert les types dans l'ordre des clés et garde son contrôle de capacité comme filet ; son commentaire dit que la demande reçue est déjà bornée par la capacité (`demandeBornee`) ;
- le test qui exerce l'option (`budget-routes.test.ts`, « capacité inférieure à la demande », l. 321-322, et la variante `options` de la boucle de non-régression, l. 333) est retiré ou réécrit sans l'option : **cette décision autorise ce retrait** (CLAUDE.md, aucun test supprimé sans décision écrite) ; la boucle de non-régression reste, sans l'option.

**Ce qui s'applique** : l'ordre de service de la capacité d'un jour est écrit **une seule fois**, dans `demandeBornee` (`TYPES_SERIE`). C'est un détail fonctionnel du Product Owner. Tant que P0S2-PO-26 (#489, en revue) n'est pas définitif, l'ordre en vigueur sur `main` reste : **activité, repas, soirée**. Quand PO-26 sera définitif, sa tâche porteuse passe l'ordre à **repas, soirée, activités, puis l'idée**, dans `demandeBornee` seulement. Avec la limite de 840 éléments (§ 13), la capacité d'un jour (11 lieux pour 5 jours) dépasse la demande actuelle du squelette (7 au plus) : l'ordre ne joue qu'à partir de P0S2-PO-27.

### 9. `slotFit` facultatif dans la sortie de recherche — **retenu**
`CandidatExtraitSchema.slotFit` (`src/ai/sorties.ts:163`) : facultatif, mal formé ignoré (`.catch(undefined)`) sans écarter le lieu ; il sert **seulement** à compter les cibles de l'agent (`creneauCompte`) et n'entre pas dans le candidat (`CandidatRechercheSchema` ne le reçoit pas, `src/research/agent.ts`) : la notation reste seule juge des créneaux. Aucun contrat de `src/contracts` touché. Donnée du modèle de recherche, pas de Google.

### 10. Un événement ne compte dans aucun créneau — **retenu**
`creneauCompte` (`src/research/agent.ts:117`) et `ciblesAtteintes` (`:135`) : un événement ne sert jamais la soirée (la planification le range dans les événements du jour). Une recherche qui ne trouve que des événements continue jusqu'à `toursMax` ou `totalCandidats`, ses deux fusibles de coût : voulu. `creneauDe` reste pour les mesures de `evals/`.

### 11. Prompt `recherche` v3 — **tranché : v3 pour #490**
`src/ai/prompts/recherche.ts:7` passe en version 3 (empreinte mise à jour, `evals/resultats/simule.json` régénéré). Règle : **la première PR de code fusionnée prend la version suivante** ; une spécification ne réserve pas de numéro. La spécification de #489 le dit déjà (« v3, ou v4 si #490 est fusionnée ») : si #490 fusionne d'abord, la tâche porteuse de P0S2-PO-20 prend v4, sans autre amendement.

### 12. Assertion de `p0-run-finale` rétablie — **rien à couvrir**
`expect(positions.size).toBe(reference.lieux)` est revenue à l'identique de `main` ; aucun test n'est assoupli par cette PR. La cause de l'écart observé au head `b7d0c32` est au § 7.

### 13. Limite Routes : 840 éléments par voyage (décision de Samuel)
- **Source** (transmise par le CEO) : carte de décision, 2026-10-18 11:42 UTC, option « Monter à 840 », réponse à la question 6 de la spécification en revue dans #489 (P0S2-PO-26) : relever la limite Routes de 500 à **840 éléments par voyage**, pour remplir des journées complètes. Décision réservée à Samuel (argent) : **pas de délai de veto**.
- **Amende 0053** (500 éléments par voyage) : la limite devient 840 ; la part d'un jour reste `floor(limite / nombre de jours)` (0055 § 6 point 1), sans emprunt entre jours, et la règle de matrice (`n² + 2n ≤ part`) ne change pas. **Amende 0073 point 1** : l'essai reste aligné sur le mode réel, à 840.
- **Fichiers** : `prototype/config/mode-reel.json` et `prototype/config/essai.json`, `routesElements` : 500 → **840**. `prototype/config/plafonds.json` (mode simulé, 4 000) ne change pas, ni `routesRequetes` (30). Le Tech Lead ne modifie pas ces fichiers : l'agent de code de #490 les change dans cette PR, avec les tests qui citent 500 ou la réserve de 4,30 USD (notamment l'égalité de `essai.json` et `mode-reel.json`, les plans Routes de `budget-routes.test.ts`, `p0-run-lancement`).
- **Vérification (Tech Lead)** avec `BLOC_MATRICE` = 10 et `routesRequetes` = 30 : tous les séjours de 1 à 10 jours tiennent (`planRoutes.tient`) ; par exemple 1 jour : `n` = 28, 784 éléments, 9 requêtes ; 4 jours : `n` = 13, 676 éléments, 16 requêtes, 3 reprises admises ; 5 jours : `n` = 12, 720 éléments, 20 requêtes, **2 reprises admises** (au lieu d'une par jour) ; 7 jours : `n` = 10 ; 10 jours : `n` = 8. Le budget de fiches (`placesDetails` 90) reste le contrôle qui lie : `briefTientDansLeMode` continue de le vérifier.
- **Conséquence d'argent, à dire à Samuel par le CEO** (aucune valeur changée ici) : la réserve Google d'une exécution, au prix plein (Q329) et au tarif de 0053 (5 USD les 1 000 éléments), passe de 4,30 à **6,00 USD** (840 × 0,005 + 90 × 0,020) : **3 exécutions par mois** dans le plafond Google de 20 USD (au lieu de 4) et 6 jusqu'à G0 dans l'enveloppe de 40 USD (au lieu de 9). La dépense réelle ne monte que si les jours se remplissent davantage : avec le squelette actuel (rythme), la demande d'un jour reste de 7 lieux au plus, et le gain attendu vient avec P0S2-PO-27.

## Conséquences
- À appliquer par l'agent de code dans #490 : § 5 (test de borne), § 8 (retrait de `typesPrioritaires` et de son test), § 13 (configuration à 840 et tests touchés). Les § 1 à 4, 6, 7, 9 à 12 sont acceptés tels quels.
- Note de version suivante : § 1 à § 12 sous « Décisions prises par le studio » (veto de 6 heures) ; § 13 sous les décisions de Samuel.
- `QUESTIONS.md` (par le CEO) : question 6 de #489 répondue (840) ; numérotation des prompts (§ 11) close.

## Quand revoir cette décision
À la fusion de la tâche porteuse de l'amendement 3 de P0 (#489) : le regroupement par lieux (§ 6) est remplacé par l'affectation des secteurs, et l'ordre de `demandeBornee` (§ 8) suit P0S2-PO-26. La limite de 840 éléments est revue par Samuel à la fin de ses essais, comme 0053.
