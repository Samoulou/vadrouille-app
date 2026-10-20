# 0104 — Réponses du Product Owner à 0094 : secteur du logement (question 6), plan absent (question 8), exclusion des secteurs sans jour (question 10), mots distinctifs (choix 2 de #505) et incontournable revendiqué (mineur 14)

Statut : **décision déléguée** (détails fonctionnels dans le cadrage : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion (décision 0093), sauf la **condition de sécurité du § 1** ; Samuel peut la remettre en cause à tout moment. Elle ne change ni la cible, ni l'offre, ni les prix, ni les phases, ne touche aucun plafond d'argent ou de requêtes, n'ouvre aucun compte et n'envoie aucune donnée hors UE.

Date : 2026-10-20 · Décideur : Product Owner · Ticket : #508 · Décision répondue : 0094 (Tech Lead, ticket #500), questions 6, 8 et 10 et « Rappels » · Spécification : `specs/P0-suite-2.md`, amendement 3 (P0S2-PO-19, PO-20, PO-22) · Lot 1 : PR #505 (fusionnée, `9492c3c`) · Décisions liées : 0011, 0072 § 3, 0055 § 6 point 3

**Hors de cette décision, volontairement** : la **question 7** de 0094 (un secteur ou deux voisins par jour) est réservée à Samuel (le CEO la lui pose) ; les **questions 1 à 5** et le **verdict sur la question 6** sont à la Sécurité (décision 0103, en cours dans une autre PR) ; la question 2 de l'amendement 3 (présentation des infos pratiques) est à l'UX/UI. Rien ici ne les tranche.

Numérotation (relue le 2026-10-20 sur `main` `88e7875`) : `main` porte 0001 à 0101 ; 0102 est portée par la PR ouverte #557 (Tech Lead) ; 0103 est prise par la Sécurité (décision en cours, pas encore dans une PR ouverte au moment de la relecture) ; aucune autre PR ouverte ni branche n'a de 0104 : **0104 est libre**.

## 1. Question 6 : secteur du logement avant toute fiche (choix : option (c))

**Choix produit : (c)**, la comparaison faite par notre code, en mémoire, sans modèle ni appel. Raisons produit :
- le plan (modèle) ne voit pas le logement (correction 2 de la PR 326) ; (a) l'enverrait à un modèle, soit une donnée du brief vers un modèle, ce que le studio évite tant que rien ne l'exige, et qui relèverait de la Sécurité (et de Samuel si le fournisseur sortait de l'UE) ;
- (d) fiche les jours pleins avant les jours d'arrivée et de départ : cela réécrit P0S2-PO-22 point 1 (affectation « avant toute fiche »), rend l'affectation incalculable avant les fiches et fermerait la porte à la question 10 ; coût produit sans gain visible ;
- (c) garde P0S2-PO-22 tel quel, n'ajoute aucune requête (priorité 3 de Samuel) et reprend la règle déjà acceptée pour « mots distinctifs ».

**Règle fonctionnelle** (elle précise le point 1 de P0S2-PO-22 ; le texte exact de comparaison est au Tech Lead) :
1. Le texte du logement du brief est comparé à des **noms du plan**, par `cleDeNom`, en mots entiers.
2. **Noms de secteurs d'abord**, dans l'ordre du plan. Un secteur correspond si la clé de son nom, ou l'un de ses mots distinctifs (même règle que `incontournablesCites`, § 4), figure dans le texte du logement. Plusieurs secteurs correspondent : celui dont le mot apparaît le **premier dans le texte du logement** ; à égalité, le premier du plan.
3. **Seulement si aucun secteur ne correspond**, noms d'incontournables : le secteur de l'incontournable correspondant (même départage).
4. **Pourquoi les secteurs d'abord** : pour « Rione Monti (près du Colisée), Rome », « Monti » est le quartier où l'on dort, « près du Colisée » est un repère de proximité ; si le plan nomme un secteur « Monti » et range le Colisée dans « Rome antique », le logement est à Monti.
5. **À défaut de correspondance** : le premier secteur du plan, comme le propose 0094. Ce n'est pas silencieux : le rapport du mode simulé (`scripts/p0/rapport.ts`) indique que le secteur du logement est un repli. Aucun champ nouveau du journal `p0.research_done` n'est créé par cette décision (la liste fermée de 0072 § 5 est à la Sécurité).
6. Une clé vide (nom sans lettre ni chiffre) ne correspond jamais.
7. Le texte du logement n'est lu **que par notre code**, le temps de l'étape, et le **résultat** (un nom de secteur du plan) n'est écrit nulle part : ni `run_secteurs`, ni journal, ni rapport de `p0Run`.

**Condition de sécurité.** Mon choix tient **sous réserve de l'avis de la Sécurité (0103) sur la question 6**. Si 0103 admet (c) tel quel, rien à changer. Si elle l'admet avec une exigence supplémentaire, je m'y range sans nouvelle décision. Si elle le refuse, mon ordre de repli est (d), puis (a) seulement avec son verdict explicite, car (a) est le seul choix qui envoie une donnée du brief à un modèle ; je le dirais alors dans une décision de suite. Dans tous les cas, **aucune donnée du brief ne part vers un modèle sur la foi de cette décision seule**.

**Tests attendus** (critères pour Q-L2d, noms au Tech Lead) : « Rione Monti (près du Colisée), Rome » donne le secteur « Monti » quand le plan en a un, sinon le secteur du Colisée ; correspondance par mot distinctif seul ; texte sans correspondance donne le premier secteur et le signale au rapport simulé ; nom de secteur non latin à clé vide jamais apparié. Bloque Q-L2d, pas Q-L2c.

## 2. Question 8 : plan refusé ou absent

**Choix produit : pas de programme sans secteurs.** Pour une exécution **réelle** (`p0Run`) dont le plan est refusé (`reglePlanManquee`) ou absent, l'exécution **s'arrête** avec un code interne dédié, **persisté `pipeline_failed`** comme `research_empty` (0072 § 3, aucune valeur nouvelle en base), **sans programme** et sans écrire de programme partiel. Raisons produit :
- sans secteurs, l'étape finale ne sait plus faire « un quartier par jour » : on retrouverait le défaut que Samuel a vu (Vatican et Trastevere le même jour) ; un programme faux coûte plus à la confiance qu'un échec clair ;
- aucun payeur inutile : ni ancrage ni étape finale ne sont payés (priorité 3).

**Où arrêter** : au plus tard **avant l'ancrage**, comme le propose 0094. Mon souhait produit est **plus tôt** : dès que le plan est refusé, **avant** la recherche web (qui, aujourd'hui, continue sans plan, choix 3 de #505) ; c'est l'économie la plus grande. C'est un changement de comportement de l'agent que #505 a accepté pour un lot, donc **le Tech Lead dit** si l'arrêt avant la recherche est faisable proprement (par exemple après une seconde tentative du plan si le coût le justifie : je ne la demande pas, elle engage des appels modèle). Quel que soit son avis, l'arrêt avant l'ancrage est acquis.

**Périmètre précisé** :
- **Mode simulé** (`pnpm p0`, tests) : un plan refusé donne le **rapport seul** (étape 11 de P0), sans programme, avec la cause dans le rapport ; les tests existants qui passent un plan refusé pour vérifier « la recherche part sans plan » sont réécrits par Q-L2d, avec le Tech Lead.
- **MVP** : inchangé (aucune règle de secteur n'y est portée, 0094 « Conséquences »).
- **Libellé écran** : aucun nouveau texte ; l'échec `pipeline_failed` utilise celui qui existe. Un message propre à ce cas est une question UX/UI, non posée tant que le prototype n'a pas d'écran d'échec distinct.
- **Un plan valide dont aucun candidat ne reçoit de secteur** retombe sur `research_empty` (tous écartés `secteur_inconnu`), déjà couvert.
- **Table du plan refusée par la Sécurité** (question 1 de 0094) : sans objet ici ; 0094 § 2 point 2 la traite (lot 2 en mode simulé seulement).

Le nom du code, son rang dans la liste des arrêts et la forme du test restent au Tech Lead. Bloque Q-L2d.

## 3. Question 10 : exclure de l'ancrage les secteurs sans jour

**Choix produit : non pour l'instant**, comme la recommandation de 0094. Raisons : le gain n'est que du quota Text Search (« IDs only » sans coût, 0055 § 6 point 3) ; ces lieux servent de voisin de repli et de remplacement (P0S2-PO-22 points 2 a et 3) ; et exclure fait perdre de la qualité pour une économie que Samuel n'a pas demandée avant son essai.

**À revoir** quand l'essai rome-1 de la vague 2 ou la tâche B de 0093 montre que le nombre de Text Search pèse dans le coût ou le quota. Si je l'adopte alors : seuls sont exclus les candidats d'un secteur **sans jour ET voisin déclaré d'aucun secteur affecté**, calculé **après** l'affectation des secteurs (labels seulement). **Le choix (c) du § 1 garde cette porte ouverte** : l'affectation reste calculable avant les fiches, ce que (d) aurait empêché. Ne bloque rien.

## 4. Choix 2 de #505 : mots distinctifs (confirmé)

**Confirmé tel que construit** (`incontournablesCites`, `src/research/agent.ts` sur `main`) : un incontournable est cité si la clé de son nom figure en mots entiers dans le nom du candidat, ou si l'un de ses mots **distinctifs** y figure (4 lettres ou plus, absent du nom de la destination et des autres incontournables du plan). Un candidat qui en cite **deux ou plus** est écarté (`candidat_regroupe`).

Raisons produit : sans cette règle, « Balade Panthéon, Trevi et Navone » passe, alors que Samuel a reproché qu'« aucun monument [n'est] précisément expliqué » ; un faux positif ne coûte qu'un candidat écarté (le suivant de la liste le remplace) ; **le risque de faux « regroupés » sur des noms de restaurants** relevé par le Tech Lead exige que le nom cite **deux** incontournables par leurs mots distinctifs, ce qui est rare ; le contrôle ne lit que le nom, jamais le prix ni le conseil (un billet combiné ne regroupe rien, PO-20).

**Limites acceptées, à écrire dans la spécification** : « Vue du Palatin sur le Forum romain » est écartée aussi (effet de bord déjà accepté dans #505) ; pour les écritures sans espaces, la règle des mots distinctifs ne s'applique pas (limite déjà documentée dans le code). **Aucun changement de code demandé.** Le texte de P0S2-PO-20 sera amendé en ce sens par ma prochaine PR de spécification (cette PR ne touche que cette décision).

## 5. Mineur 14 de la première revue de #505 : incontournable revendiqué par un candidat

Constat vérifié dans le code : quand deux candidats désignent le même incontournable, **le premier admis est gardé** et le suivant est refusé `duplicate` (`memeIncontournable`, `src/research/agent.ts`). Un candidat dont la source dit « Colisée » pour un autre lieu peut donc évincer le vrai.

**Choix produit : accepté, à noter dans la spécification.** Le levier est limité à la qualité (aucun argent, aucune donnée, aucun plafond) et le champ `incontournable` ne vient que de notre agent, jamais d'un tiers directement ; le jeu d'évaluation `evals/qualite/` couvre le cas d'un incontournable sans candidat. **Pas de règle plus fine pour l'instant** (par exemple garder le candidat dont le nom correspond le mieux). **À revoir** si un essai montre un incontournable perdu au profit d'un candidat qui n'en est pas un : j'écrirais alors le critère « le candidat dont le nom contient l'incontournable l'emporte sur le premier admis », que le Tech Lead chiffrerait.

## Questions restantes

1. **Sécurité (0103)** : avis sur la question 6 (condition du § 1) ; verdicts des questions 1 à 5 de 0094, non touchés ici.
2. **Samuel** (par une carte du CEO) : question 7 de 0094 (un ou deux secteurs voisins par jour), non touchée ici.
3. **Tech Lead** : l'arrêt sur plan refusé peut-il avoir lieu **avant la recherche** (§ 2) ? Nom du code d'arrêt ; texte exact de la comparaison du logement (§ 1).
4. **UX/UI** : message d'échec propre au plan refusé, seulement si le prototype gagne un écran d'échec distinct (§ 2).
5. **CEO** : lister cette décision dans la note de version suivante ; mettre à jour la question 6 de 0094 et les rappels (#505) dans `QUESTIONS.md` selon la réponse de la Sécurité.

## Conséquences

- Q-L2d est débloquée côté Product Owner (questions 6 et 8) ; elle l'est côté Sécurité quand 0103 est fusionnée.
- Aucune ligne de code ni de configuration n'est modifiée par cette décision ; la spécification `specs/P0-suite-2.md` (PO-20, PO-22) est amendée par une PR de spécification séparée.

## Quand revoir cette décision

- À l'avis de la Sécurité sur la question 6, s'il contredit le § 1.
- Après l'essai rome-1 de la vague 2 : repli du secteur du logement trop fréquent (§ 1 point 5), arrêt sur plan refusé trop fréquent (§ 2), incontournable perdu par revendication (§ 5).
