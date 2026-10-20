# 0106 — Écarts produit de B9c (PR #563) : « Surprends-moi », événements sans heure, villes de l'aperçu, repas avec options, réutilisation des candidats

Statut : **décision déléguée** (détails fonctionnels dans le cadrage : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion (décision 0093) **pour ce qui relève du Product Owner seul** ; Samuel peut la remettre en cause à tout moment. Deux parties ne sont pas définitives à la seule fusion : (1) le § 5 (réutilisation des candidats) amende B9-PO-8 et dépend de l'accord du Tech Lead sur 0081 B9-TL-3 point 2 (0105 § 6) ; (2) le § 4 (repas) est **provisoire jusqu'à la réponse de Samuel à la question 57**. Elle ne change ni la cible, ni l'offre, ni les prix, ni les phases ; elle n'engage ni argent, ni compte externe, ni donnée hors UE.

**Numérotation et dépendance.** La décision 0105 est écrite par le Tech Lead dans la PR #570 (branche `claude/522-decisions-b9c-tl`) et n'est pas encore sur `main` : le fichier saute de 0104 à 0106 en attendant, comme 0019 l. 5 pour un cas semblable. Cette décision 0106 dépend de 0105 sur trois points (§ 1 règle de l'idée à l'étape e, § 4 amendement sans contrat touché, § 5 accord sur 0081) ; **les renvois à 0105 sont à revérifier à sa fusion**, et si 0105 change sur l'un d'eux, 0106 est corrigée avant fusion.

**Précédence.** Jusqu'à la PR qui amende `specs/B9-generation.md`, le présent texte **prévaut sur B9-PO-5** (une case par repas, § 4 ; créneaux de repli, § 6), **complète les critères de B9c** (§ 1, § 3, § 6) et, sous réserve de l'accord du Tech Lead, amende B9-PO-8 (§ 5). L'implémentation suit le présent texte, pas la formule ancienne de la spécification.

Date : 2026-10-20 · Décideur : Product Owner · Ticket : #522 · Spécification : `specs/B9-generation.md` (B9-PO-5, B9-PO-6, B9c point 1, B9d point 2) · Revue consolidée de la PR #563 (head `065634d`), bloquants 5 et 6 · Décisions liées : 0081 (B9-TL-6 (g), B9-TL-13), 0086 (sélection de l'idée par la génération), 0010 (PO-6), 0093

**Hors de cette décision, volontairement** : `organizationId` dans l'état sérialisé (Q-B9c-1) et la manière technique des créneaux de repli et de l'arrêt sans raison (Q-B9c-6) relèvent du Tech Lead (décision 0105, PR #570) ; le **comportement visible** de ces deux derniers est décidé ici (§ 6) ; la question 57 (options de repas) et la question 63 (jours vides) restent à Samuel ; le build Docker, les tests vides ou absents (bloquants 1 à 4, et 7a/7b dans leur partie « test ») sont du code de B9c, pas un choix produit.

## Synthèse

| Écart | Décision | Où |
|---|---|---|
| « Surprends-moi » (`idees: []`) | **Implémenter** | B9c (cette PR) |
| Événements sans heure | **Conforme, rien à implémenter** ; amélioration reportée | B9e (relevé), puis tâche nommée B9f si l'essai de Samuel le justifie |
| Villes limitées aux jours 1 et 2 | **Conforme, rien à implémenter** ; le reste est B9d | B9d |
| Repas avec options (B9-PO-5) | **Provisoire** : une case par repas, jusqu'à la réponse de Samuel à Q57 ; ne la préjuge pas | B9c ; options à revoir après Q57 |
| Réutilisation des candidats entre exécutions | **Amender B9-PO-8** ; critère dans une sous-tâche de suite nommée **B9c-suite** (pas B9d), sous réserve de l'accord du Tech Lead | B9c-suite |
| Créneaux de repli et arrêt sans raison (comportement visible) | **Décidé** (§ 6) | B9c |

## 1. « Surprends-moi » : implémenter dans B9c

Le texte est sans ambiguïté : B9-PO-6 met l'idée « Surprends-moi » dans les jours 1 et 2 planifiés « en entier », et 0086 (qui corrige 0015 § 3) en confie le choix à la génération (`ideeDuJour`, déjà écrit et testé en B5b). Un aperçu sans idée est donc un aperçu incomplet par rapport à la spec, et c'est le seul endroit où la personne voit la réserve de lieux qu'on lui a trouvés. Le reporter n'apporterait pas de gain de vitesse : le moteur, le champ `Day.surprise`, la raison et la lecture B6 existent.

Règle (détail fonctionnel, dans le cadre de B5-PO-16) :
1. **Admissibilité complète d'une idée** (celle de `ideeDuJour` et de B5-PO-16, rien de moins) : candidat `place` du jour planifié, ancré (`placeId` présent) et **valide à la relecture** (`lieuValide`), noté, **non retenu** dans le programme, avec une source `https:`, avec une raison écrite par la même rédaction que les étapes (une raison maison, jamais un texte de fournisseur), et **dont le lieu n'est utilisé nulle part ailleurs dans le voyage** : l'idée du jour 2 ne reprend ni l'idée du jour 1 ni une étape d'un autre jour. Si l'une de ces conditions manque, le candidat n'est pas une idée.
   **Coûts** : aucun appel de modèle de plus que ceux de l'étape e prévus au forfait (l'étape e produit aussi les raisons des candidats non retenus, dans le même lot) ; les appels Places (relecture) et Routes pour des lieux **non retenus** consomment le forfait et les plafonds de B9-PO-8 comme les autres, sans les relever (le lot de rédaction grossit de 6 lieux au plus par aperçu, 0105 § 5).
   Cette règle est **sous réserve de la confirmation du Tech Lead** (0105 § 5.1 la confirme dans la version de la PR #570 ; à revérifier à sa fusion).
2. **Au plus une idée par jour planifié** (jours 1 et 2), choisie par `ideeDuJour`. Pas d'idée admissible : le jour n'a pas d'idée (`Day.surprise` absent), **jamais une erreur ni une raison d'échec** (même esprit que B9-PO-9).
3. **Hors des 8 cases** : l'idée n'est pas une case de l'aperçu (B9-PO-5 ne compte que `activity` et `meal`).
4. Les jours 3 et suivants n'ont pas d'idée (B9-PO-6).

Critère à ajouter à B9c : `aperçu: une idée par jour planifié` (base jetable, doubles) : avec des candidats ancrés non retenus, les jours 1 et 2 ont chacun une idée dont le `placeId` n'est celui d'aucune étape du voyage ni de l'idée de l'autre jour, avec source `https:` et lieu valide à la relecture ; sans candidat disponible, `surprise` est absent et l'exécution finit `ready` ou `incomplete` selon les cases, pas `failed` ; les jours 3 et suivants n'en ont pas. Cela clôt la partie « Surprends-moi » du bloquant 5.

*Ce que Samuel voit* : un bloc « Surprends-moi » sur les journées 1 et 2 de l'aperçu, quand un lieu de réserve existe.

## 2. Événements sans heure : conforme, rien à implémenter en B9c

La règle est déjà écrite et fusionnée : « un événement sans heure lue n'a pas d'occurrence » (0081 B9-TL-6 (g), B7-PO-10, question 13 (b) de B7). Le moteur ne place un événement qu'à une date et une heure lues ; en placer un sans heure serait inventer un horaire, ce que le studio s'interdit (jamais une donnée inventée). L'écart signalé par B9c n'en est donc pas un par rapport à la spec : c'est la règle, vue du code.

Report de l'amélioration éventuelle (montrer un événement « sans heure précise » dans la liste, hors programme) : **B9e relève**, sur l'essai réel de Samuel, combien d'événements trouvés sont écartés faute d'heure (B9-PO-11 ne demande qu'une durée : le compteur est **nouveau**. Il se tire du journal de l'exécution, par un champ de `LogFields` posé au tri des événements, et il est un chiffre de **journal**, pas un affichage : il est donc compatible avec le critère de B7 « le bilan n'a aucun compteur de candidats », qui vise l'interface. Si le Tech Lead juge ce champ hors de ses règles de journal, Samuel constate le nombre à l'essai et B9e le note à la main). Si le nombre le justifie, le PO rédige alors une tâche nommée **B9f — événements sans heure**, qui demandera une décision de contrat (donc du Tech Lead) ; sinon rien.

*Ce que Samuel voit en attendant* : seuls les événements dont l'heure est lue apparaissent dans les journées ; les autres sont silencieusement absents (jamais d'heure inventée).

## 3. Villes limitées aux jours 1 et 2 : conforme

B9-PO-6 : l'aperçu planifie les jours 1 et 2 ; le coût de l'aperçu (cadrage § 4, environ 0,3 à 1 USD) « ne couvre pas la planification de tout le voyage ». B9c point 1 : « une recherche par ville » **de l'aperçu**, c'est-à-dire des villes que les jours 1 et 2 traversent. Chercher les autres villes dans l'aperçu irait contre ce coût, sans qu'aucune case ou journée de l'aperçu ne l'utilise. Les villes qui n'apparaissent qu'à partir du jour 3 sont recherchées par B9d (point 2 : recherche de profil `complet`, `dejaTrouves`).

Précision (détail fonctionnel) : un voyage de deux jours ou moins, ou dont J1 et J2 sont dans deux villes, cherche une fois chaque ville concernée ; la fin de séjour des autres villes est dans la version 1 sous la forme de B9-PO-6 (termini seuls).

Critère à ajouter à B9c : `aperçu: villes des jours 1 et 2 seulement` (doubles) : sur un voyage de six jours dans quatre villes, les doubles de recherche ne sont appelés que pour les villes des jours 1 et 2 ; aucun appel pour une ville qui n'apparaît qu'à partir du jour 3.

*Ce que Samuel voit en attendant* : sur un voyage à plusieurs villes, l'aperçu ne propose que des lieux de la ou des villes des deux premières journées ; les autres villes se remplissent au déblocage du programme (B9d).

## 4. Repas avec options (B9-PO-5) : provisoire, une case par repas, jusqu'à la réponse de Samuel à Q57

B9-PO-5 écrit « un repas avec options compte une case par option, comme le jeu simulé de F6, en attendant Q57 ». La question 57 (« les 8 propositions comptent-elles chaque option de repas ? ») est **réservée à Samuel** (offre) et reste ouverte. Cette décision **ne la tranche pas et ne préjuge pas de sa réponse** : elle fixe seulement ce que B9c fait **en attendant**, parce que la forme « une case par option » ne s'implémente pas aujourd'hui, sans PR de contrat :
- `PreviewSlotsSchema` (`src/contracts/preview.ts`) **interdit** deux cases au même créneau (jour, heure) ; les options d'un même repas sont, par construction, au même créneau. Le contrat est fixé par l'évolution E5 (0010 PO-6) et `src/contracts` ne se modifie que par une PR de contrat décidée par le Tech Lead (hors du périmètre de B9) ;
- `Proposal.option` (index, total au plus 3) **existe** dans les contrats et dans le moteur de B5b : le modèle sait représenter des options. Seul le **contrat de créneau unique** empêche de les compter une par une dans l'aperçu ; le moteur de B5 rend aujourd'hui, par créneau, l'option qu'il retient.

**Provisoire** : B9c compte **une case par repas** (l'option que le moteur retient). Le reste de B9-PO-5 est inchangé (étapes `activity` et `meal`, ordre chronologique en commençant par le jour 1 ; moins de 8 étapes ancrées : cases `noOption` à la suite, jamais un lieu non ancré). Le critère `aperçu: huit cases, jamais un lieu non ancré` (5 `proposal`, 3 `noOption`, `ready` = 5, `expected` = 8, ordre de B9-PO-5) est inchangé et sert de test. Aucune autre décision n'est prise sur les options : pas de report à B10 présenté comme acquis.

**Réponse de Samuel** : si « une case par option », il faut une PR de contrat décidée par le Tech Lead (créneau partagé pour des options d'un même repas), puis le moteur et B9c ; si « un créneau pour une seule option », le provisoire devient la règle. Rien n'est préparé avant.

**Visible pour Samuel** : cet écart par rapport au texte de B9-PO-5 (et à la recommandation « une case par option » du bloc Q57 de la spécification) est listé dans la **note de version** suivante, rubrique « Décisions prises par le studio », avec la mention « provisoire, dans l'attente de Q57 ».

**Conséquence pour F9 et pour « Ce qui est inclus » (Q128)** : le texte exact de l'écran 9, lié à Q57 (Q128, F9-Q3), **ne doit pas promettre** « plusieurs options par repas » ni « huit propositions comptant chaque option » tant que Q57 est ouverte ; il parle de « propositions » sans préciser le nombre d'options par repas. F9 n'est pas modifiée par cette décision (la ligne est à Samuel) ; la présente note le signale pour la rédaction de Q128.

*Ce que Samuel voit en attendant* : huit cartes, au plus un repas par créneau, une seule adresse par repas (pas de choix entre deux restaurants au même repas dans l'aperçu).

## 5. Réutilisation des candidats entre exécutions : amender B9-PO-8, sous-tâche B9c-suite

**Ce que disent les textes.** B9-PO-8 garde `research_runs`, `candidates` et les notes « pour être réutilisés par une nouvelle exécution (candidats ré-ancrés) » ; 0081 B9-TL-3 point 2 (décision du Tech Lead) écrit qu'une nouvelle ligne `preview` réutilise `candidates` et `research_runs`. B9d point 2 ne concerne **pas** cela : il porte sur les jours 3 et suivants du voyage complet. Le « Réessayer » d'un aperçu relève de `retryGeneration` (B9b/B9c). La version précédente de cette décision se trompait en renvoyant à B9d ; ce renvoi est retiré.

**Choix (b), préférence du CEO pour que l'application marche vite de bout en bout, plutôt que (a)** (garder la réutilisation dans B9c) : (a) serait plus fidèle au texte, mais ajoute à B9c, déjà chargée, un critère de plus (relecture des candidats d'une ligne précédente, ré-ancrage, règles de reprise) alors que le résultat visible de « Réessayer » est le même sans lui. Le coût d'une recherche de plus après un échec reste sous le forfait et les plafonds de B9-PO-8.

**Amendement explicite de B9-PO-8** : la phrase « pour être réutilisés par une nouvelle exécution » reste vraie pour **la conservation** des lignes (`research_runs`, `candidates`, notes : elles sont toujours gardées, rien n'est supprimé), mais **la réutilisation par un « Réessayer »** n'est pas exigée de B9c ; elle est portée par une sous-tâche de suite nommée **B9c-suite : réutilisation des candidats par « Réessayer » (`retryGeneration`)**, à ouvrir après la fusion de B9c et avant B9d, avec son critère propre : un « Réessayer » après un échec ne refait pas la recherche des villes déjà cherchées et ne rappelle aucun modèle de recherche pour elles (mesurable par `journalDePrompts`), et les candidats repris sont ré-ancrés (double appelé, `place_id` retiré si non résolu).

**Dépendance** : cette partie (le report et l'amendement de B9-PO-8) **dépend de l'accord du Tech Lead sur 0081 B9-TL-3 point 2** (0105 § 6, en cours de rédaction dans la PR #570). Tant que cet accord n'est pas écrit, le report n'est pas définitif ; sans accord, on revient à (a) : la réutilisation et son critère restent dans B9c, et la présente section est retirée avant fusion.

**Reste dans B9c, non couvert par le report** (bloquant 6 de la PR #563) : le test « réparation : aucun appel de modèle » (mesurable par `journalDePrompts`) ; le test « candidat réutilisé ré-ancré » **dans la même exécution** (étape `c` avec `candidates.place_id` posé avant : double appelé, `place_id` retiré si non résolu, aucune case). Aucune suppression ou désactivation de test n'est décidée ici : un amendement de spécification n'est pas une décision de retrait de test, et aucun test existant n'est touché.

*Ce que Samuel voit en attendant* : un « Réessayer » après un échec refait la recherche complète de l'aperçu, sous son propre forfait et les mêmes plafonds (aucun coût hors plafond, B9-PO-8) ; le résultat est le même, un peu plus lent et plus coûteux dans le plafond qu'une reprise.

## 6. Créneaux de repli et arrêt sans raison : le comportement visible

La manière technique est au Tech Lead (0105 § 4) ; le PO décide ce que la personne voit.

**6.1 Créneaux `noOption` de repli.** Les cases `noOption` à la suite de B9-PO-5 prennent leurs jours et heures dans le squelette (demi-heures de la fenêtre de chaque jour planifié, 0105 § 4.1), d'abord les créneaux manquants, puis les créneaux de repli. Décision : **un créneau de repli ne chevauche jamais une vraie étape** : il est écarté s'il tombe dans l'intervalle (début à fin) d'une étape, d'un événement, d'un engagement ou d'un repas du jour. Une case « aucune option » posée sur une heure déjà occupée serait une fausse promesse de créneau libre. Si les demi-heures libres ne suffisent pas à compléter huit cases, l'aperçu affiche **moins de huit cases**, jamais une case en chevauchement : `expected` reste 8, l'état est `incomplete`, et le décompte « n sur 8 » dit la vérité. Critère à ajouter à B9c : `aperçu: aucun créneau de repli ne chevauche une étape` (doubles : étapes longues sur les demi-heures de repli ; aucune case `noOption` dans un intervalle d'étape ; moins de 8 cases, `incomplete`). Si le contrat de l'aperçu exige exactement huit cases, la PR le signale au Tech Lead (question, pas de contournement).

**6.2 Arrêt publié sans `reason`** (contre B9-PO-6, qui promet des raisons). Décision : **la raison manquante n'est jamais inventée ni masquée par un texte de remplissage**. L'arrêt reste dans le jour (0105 § 4.2) mais **n'est pas une proposition** : pas de carte à trier, donc aucune case `proposal` pour lui ; l'interface n'affiche pas de bloc « Pourquoi » vide (rien à la place de la raison). L'exécution finit `incomplete`, jamais `failed`. B9-PO-6 est amendé en conséquence : « raisons » vaut pour toute proposition ; un arrêt sans raison est un lieu du programme, pas une proposition.

## Décisions

1. **« Surprends-moi »** : implémenté en B9c, au plus une idée par jour planifié, hors des 8 cases, admissibilité complète (source `https:`, `lieuValide`, aucun lieu déjà utilisé dans le voyage, coûts Places/Routes sous le forfait), absente sans erreur si aucun candidat n'est admissible ; critère `aperçu: une idée par jour planifié` ajouté à B9c ; sous réserve de la confirmation du Tech Lead (0105 § 5.1).
2. **Événements sans heure** : conforme à 0081 B9-TL-6 (g) ; aucun changement ; relevé (compteur nouveau, de journal) par B9e, tâche nommée B9f si l'essai le justifie.
3. **Villes** : l'aperçu ne cherche que les villes des jours 1 et 2 (B9-PO-6) ; les autres sont cherchées par B9d ; critère `aperçu: villes des jours 1 et 2 seulement` ajouté à B9c.
4. **Repas avec options** : **provisoire** (une case par repas) jusqu'à la réponse de Samuel à Q57, sans la préjuger ; écart listé dans la note de version ; Q128 / F9 ne promettent pas d'options par repas.
5. **Réutilisation des candidats** : B9-PO-8 amendé ; réutilisation par « Réessayer » dans la sous-tâche de suite **B9c-suite** (pas B9d) ; dépend de l'accord du Tech Lead sur 0081 B9-TL-3 point 2 (0105 § 6) ; la réutilisation dans la même exécution et le test de réparation restent dans B9c.
6. **Créneaux de repli** : jamais de chevauchement d'une étape ; moins de huit cases plutôt qu'une fausse case libre. **Arrêt sans raison** : lieu du programme, pas une proposition, aucun bloc de raison vide, `incomplete`.

## Questions nouvelles

Aucune réservée à Samuel (la question 57 est déjà ouverte ; sa réponse n'est pas préjugée). Pour le Tech Lead : (1) accord sur 0081 B9-TL-3 point 2 (0105 § 6) pour l'amendement du § 5, sans lequel la réutilisation revient dans B9c ; (2) confirmer que l'idée « Surprends-moi » peut être construite à l'étape e sans nouvelle colonne (0105 § 5.1 le confirme) ; (3) champ de `LogFields` pour le compteur d'événements écartés (§ 2) ; (4) un aperçu à moins de huit cases est-il admis par le contrat (§ 6.1) ?
