# 0106 — Écarts produit de B9c (PR #563) : « Surprends-moi », événements sans heure, villes de l'aperçu, repas avec options, réutilisation des candidats

Statut : **décision déléguée** (détails fonctionnels dans le cadrage : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion (décision 0093) ; Samuel peut la remettre en cause à tout moment. Elle ne change ni la cible, ni l'offre, ni les prix, ni les phases ; elle n'engage ni argent, ni compte externe, ni donnée hors UE.

Date : 2026-10-20 · Décideur : Product Owner · Ticket : #522 · Spécification : `specs/B9-generation.md` (B9-PO-5, B9-PO-6, B9c point 1, B9d point 2) · Revue consolidée de la PR #563 (head `065634d`), bloquants 5 et 6 · Décisions liées : 0081 (B9-TL-6 (g), B9-TL-13), 0086 (sélection de l'idée par la génération), 0010 (PO-6), 0093

**Hors de cette décision, volontairement** : `organizationId` dans l'état sérialisé (Q-B9c-1) et les deux choix de la question Q-B9c-6 (créneaux `noOption` de repli, arrêt sans raison) relèvent du Tech Lead (décision 0105, en parallèle) ; la question 57 (options de repas) et la question 63 (jours vides) restent à Samuel ; le build Docker, les tests vides ou absents (bloquants 1 à 4, et 7a/7b dans leur partie « test ») sont du code de B9c, pas un choix produit.

## Synthèse

| Écart | Décision | Où |
|---|---|---|
| « Surprends-moi » (`idees: []`) | **Implémenter** | B9c (cette PR) |
| Événements sans heure | **Conforme, rien à implémenter** ; amélioration reportée | B9e (relevé), puis tâche nommée B9f si l'essai de Samuel le justifie |
| Villes limitées aux jours 1 et 2 | **Conforme, rien à implémenter** ; le reste est B9d | B9d |
| Repas avec options (B9-PO-5) | **Amender B9-PO-5** : une case par repas ; options reportées | B10 (présentation) après la question 57 de Samuel |
| Réutilisation des candidats entre exécutions | **Reporter** | B9d |

## 1. « Surprends-moi » : implémenter dans B9c

Le texte est sans ambiguïté : B9-PO-6 met l'idée « Surprends-moi » dans les jours 1 et 2 planifiés « en entier », et 0086 (qui corrige 0015 § 3) en confie le choix à la génération (`ideeDuJour`, déjà écrit et testé en B5b). Un aperçu sans idée est donc un aperçu incomplet par rapport à la spec, et c'est le seul endroit où la personne voit la réserve de lieux qu'on lui a trouvés. Le reporter n'apporterait pas de gain de vitesse : le moteur, le champ `Day.surprise`, la raison et la lecture B6 existent.

Règle (détail fonctionnel, dans le cadre de B5-PO-16) :
1. **Candidats d'idée** : les candidats `place` du jour planifié, ancrés (`placeId` présent), notés, **non retenus** dans le programme, avec une raison écrite par la même rédaction que les étapes (une raison maison, jamais un texte de fournisseur). Aucun appel de modèle de plus que ceux de l'étape e prévus au forfait ; si la raison manque, le candidat n'est pas une idée.
2. **Au plus une idée par jour planifié** (jours 1 et 2), choisie par `ideeDuJour`. Pas d'idée admissible : le jour n'a pas d'idée (`Day.surprise` absent), **jamais une erreur ni une raison d'échec** (même esprit que B9-PO-9).
3. **Hors des 8 cases** : l'idée n'est pas une case de l'aperçu (B9-PO-5 ne compte que `activity` et `meal`).
4. Les jours 3 et suivants n'ont pas d'idée (B9-PO-6).

Critère à ajouter à B9c : `aperçu: une idée par jour planifié` (base jetable, doubles) : avec des candidats ancrés non retenus, les jours 1 et 2 ont chacun une idée dont le `placeId` n'est pas celui d'une étape du jour ; sans candidat disponible, `surprise` est absent et l'exécution finit `ready` ou `incomplete` selon les cases, pas `failed` ; les jours 3 et suivants n'en ont pas. Cela clôt la partie « Surprends-moi » du bloquant 5.

*Ce que Samuel voit* : un bloc « Surprends-moi » sur les journées 1 et 2 de l'aperçu, quand un lieu de réserve existe.

## 2. Événements sans heure : conforme, rien à implémenter en B9c

La règle est déjà écrite et fusionnée : « un événement sans heure lue n'a pas d'occurrence » (0081 B9-TL-6 (g), B7-PO-10, question 13 (b) de B7). Le moteur ne place un événement qu'à une date et une heure lues ; en placer un sans heure serait inventer un horaire, ce que le studio s'interdit (jamais une donnée inventée). L'écart signalé par B9c n'en est donc pas un par rapport à la spec : c'est la règle, vue du code.

Report de l'amélioration éventuelle (montrer un événement « sans heure précise » dans la liste, hors programme) : **B9e relève**, sur l'essai réel de Samuel, combien d'événements trouvés sont écartés faute d'heure (compteur déjà demandé par B9-PO-11 pour la durée ; le relevé s'ajoute à la même note). Si le nombre le justifie, le PO rédige alors une tâche nommée **B9f — événements sans heure**, qui demandera une décision de contrat (donc du Tech Lead) ; sinon rien.

*Ce que Samuel voit en attendant* : seuls les événements dont l'heure est lue apparaissent dans les journées ; les autres sont silencieusement absents (jamais d'heure inventée).

## 3. Villes limitées aux jours 1 et 2 : conforme

B9-PO-6 : l'aperçu planifie les jours 1 et 2 ; le coût de l'aperçu (cadrage § 4, environ 0,3 à 1 USD) « ne couvre pas la planification de tout le voyage ». B9c point 1 : « une recherche par ville » **de l'aperçu**, c'est-à-dire des villes que les jours 1 et 2 traversent. Chercher les autres villes dans l'aperçu irait contre ce coût, sans qu'aucune case ou journée de l'aperçu ne l'utilise. Les villes qui n'apparaissent qu'à partir du jour 3 sont recherchées par B9d (point 2 : recherche de profil `complet`, `dejaTrouves`).

Précision (détail fonctionnel) : un voyage de deux jours ou moins, ou dont J1 et J2 sont dans deux villes, cherche une fois chaque ville concernée ; la fin de séjour des autres villes est dans la version 1 sous la forme de B9-PO-6 (termini seuls).

*Ce que Samuel voit en attendant* : sur un voyage à plusieurs villes, l'aperçu ne propose que des lieux de la ou des villes des deux premières journées ; les autres villes se remplissent au déblocage du programme (B9d).

## 4. Repas avec options (B9-PO-5) : amender, une case par repas

B9-PO-5 écrit « un repas avec options compte une case par option, comme le jeu simulé de F6, en attendant Q57 ». Cela ne s'implémente pas, pour deux raisons que B9c a vues justement :
- `PreviewSlotsSchema` (`src/contracts/preview.ts`) **interdit** deux cases au même créneau (jour, heure) : plusieurs options d'un même repas sont, par construction, au même créneau ; le contrat et sa règle sont fixés par l'évolution E5 (0010 PO-6), et `src/contracts` ne se modifie que par une PR de contrat décidée par le Tech Lead (hors-périmètre de la spécification B9) ;
- le moteur de B5 rend **un** repas par créneau (la meilleure option) ; les « options » n'existent que dans le jeu simulé de F6, qui est de la présentation, pas de la génération.

Décision : **amendement de B9-PO-5** : l'aperçu compte **une case par repas** (l'option que le moteur retient), pas une case par option. Le reste de B9-PO-5 est inchangé (étapes `activity` et `meal`, ordre chronologique en commençant au jour 1, moins de 8 étapes ancrées : cases `noOption` à la suite, jamais un lieu non ancré). Le critère `aperçu: huit cases, jamais un lieu non ancré` (5 `proposal`, 3 `noOption`, `ready` = 5, `expected` = 8, ordre de B9-PO-5) est inchangé et sert de test.

**Report** : proposer plusieurs options pour un repas relève de la présentation et du tri de l'aperçu (**B10**), et suppose la réponse de Samuel à la **question 57** (« les 8 propositions comptent-elles chaque option de repas ? »), qui reste ouverte et à Samuel. Si Samuel répond « une case par option », il faudra une PR de contrat décidée par le Tech Lead (créneau partagé pour des options d'un même repas) puis le moteur ; ce n'est pas prévu avant sa réponse. L'écart est donc écrit en B9c par cette décision, et non plus signalé comme oubli.

*Ce que Samuel voit en attendant* : huit cartes, au plus un repas par créneau, une seule adresse par repas (pas de choix entre deux restaurants au même repas dans l'aperçu).

## 5. Réutilisation des candidats entre exécutions : reporter à B9d

C'est la seule partie du point 7b que la revue accepte de voir en B9d. Elle y est déjà : B9d point 2 (« à partir des candidats existants **ré-ancrés** ») et la spec la fait porter par le workflow du voyage complet. Dans B9c, l'aperçu part toujours d'une recherche neuve de l'exécution ; ce qui reste de **B9c** (bloquant 6) et n'est pas couvert par ce report :
- le test « réparation : aucun appel de modèle » (mesurable par `journalDePrompts`) ;
- le test « candidat réutilisé ré-ancré » **dans la même exécution** (étape `c` avec `candidates.place_id` posé avant : double appelé, `place_id` retiré si non résolu, aucune case).

Seule la **réutilisation d'une exécution à la suivante** (un « Réessayer » qui reprend les candidats déjà trouvés au lieu de chercher à nouveau) est reportée à **B9d**, avec son critère propre (« Réessayer » ne refait pas la recherche des villes déjà cherchées). Cette décision tient lieu de décision écrite pour cette partie seulement ; elle ne couvre rien d'autre dans 7a ou 7b.

*Ce que Samuel voit en attendant* : un « Réessayer » après un échec refait la recherche complète de l'aperçu, sous son propre forfait et les mêmes plafonds (aucun coût hors plafond, B9-PO-8) ; le résultat est le même, un peu plus lent et plus coûteux dans le plafond qu'une reprise. Le Tech Lead et le CEO jugent si cette répétition justifie d'avancer B9d.

## Décisions

1. **« Surprends-moi »** : implémenté en B9c, au plus une idée par jour planifié, hors des 8 cases, absente sans erreur si aucun candidat n'est admissible ; critère `aperçu: une idée par jour planifié` ajouté à B9c.
2. **Événements sans heure** : conforme à 0081 B9-TL-6 (g) ; aucun changement ; relevé par B9e, tâche nommée B9f si l'essai le justifie.
3. **Villes** : l'aperçu ne cherche que les villes des jours 1 et 2 (B9-PO-6) ; les autres villes sont cherchées par B9d.
4. **Repas avec options** : B9-PO-5 amendé, une case par repas ; options reportées à B10, après la question 57 de Samuel.
5. **Réutilisation des candidats entre exécutions** : reportée à B9d ; la réutilisation dans la même exécution et le test de réparation restent à faire dans B9c.

## Questions nouvelles

Aucune réservée à Samuel (la question 57 est déjà ouverte). Pour le Tech Lead : confirmer que l'idée « Surprends-moi » peut être construite à l'étape e à partir des candidats ancrés non retenus, sans nouvelle colonne (sinon, question à data).
