# 0104 — Réponses du Product Owner à 0094 : secteur du logement (question 6), plan absent (question 8), exclusion des secteurs sans jour (question 10), mots distinctifs (choix 2 de #505) et incontournable revendiqué (mineur 14)

Statut : **décision déléguée** (détails fonctionnels dans le cadrage : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion (décision 0093) ; Samuel peut la remettre en cause à tout moment. Elle ne change ni la cible, ni l'offre, ni les prix, ni les phases, ne touche aucun plafond d'argent ou de requêtes, n'ouvre aucun compte et n'envoie aucune donnée hors UE.

Date : 2026-10-20 · Décideur : Product Owner · Ticket : #508 · Décision répondue : 0094 (Tech Lead, ticket #500), questions 6, 8 et 10 et « Rappels » · Spécification : `specs/P0-suite-2.md`, amendement 3 (P0S2-PO-19, PO-20, PO-22) · Lot 1 : PR #505 (fusionnée, `9492c3c`) · Décisions liées : 0011, 0072 § 3, 0055 § 6 point 3, 0103 (Sécurité, fusionnée : #560)

**Hors de cette décision, volontairement** : la **question 7** de 0094 (un secteur ou deux voisins par jour) est réservée à Samuel (le CEO la lui pose) ; les **questions 1 à 5** de 0094 sont tranchées par la Sécurité dans la décision 0103 (fusionnée), que cette décision ne modifie pas ; la question 2 de l'amendement 3 (présentation des infos pratiques) est à l'UX/UI. Rien ici ne les tranche.

## 1. Question 6 : secteur du logement avant toute fiche (choix : option (c))

**Choix produit : (c)**, la comparaison faite par notre code, en mémoire, sans modèle ni appel. Raisons produit :
- le plan (modèle) ne voit pas le logement (correction 2 de la PR 326) ; (a) l'enverrait à un modèle, soit une donnée du brief vers un modèle, ce que le studio évite tant que rien ne l'exige ; la Sécurité l'a jugée défavorable (0103, question 6) et elle remonterait à Samuel avant tout code ;
- (d) (avis de la Sécurité : neutre sous conditions) fiche les jours pleins avant les jours d'arrivée et de départ : cela réécrit P0S2-PO-22 point 1 (affectation « avant toute fiche »), rend l'affectation incalculable avant les fiches et fermerait la porte à la question 10 ; coût produit sans gain visible ;
- (c) garde P0S2-PO-22 tel quel, n'ajoute aucune requête (priorité 3 de Samuel) et reprend la règle déjà acceptée pour « mots distinctifs » ; c'est le seul choix que la Sécurité juge favorable (0103).

**Règle fonctionnelle** (elle précise le point 1 de P0S2-PO-22 ; le texte exact de comparaison est au Tech Lead) :
1. Le texte du logement du brief est comparé à des **noms du plan**, par `cleDeNom`, **en mots entiers** (la clé du nom doit figurer dans la clé du logement avec une espace ou une limite de chaîne de chaque côté). **Écritures sans espaces** (chinois, japonais, thaï, lao, khmer, birman : `ECRITURE_SANS_ESPACES` dans `src/research/agent.ts`) : la clé du nom, si elle en contient, est cherchée **telle quelle** dans la clé du logement, sans exiger d'espaces autour, comme le fait `incontournablesCites` ; la règle des **mots distinctifs ne s'y applique pas** (aucun découpage en mots fiable). La limite du § 4 vaut donc ici.
2. **Noms de secteurs d'abord**, dans l'ordre du plan. Un secteur correspond si la clé de son nom figure dans le texte du logement (règle 1), ou si l'un de ses mots **distinctifs** y figure. Un mot distinctif d'un secteur est un mot de **4 lettres ou plus** (le seuil de `MOT_INCONTOURNABLE_MIN` ; le Tech Lead dit s'il le partage), **absent du nom de la destination et des noms des autres secteurs du plan** (relativement aux autres secteurs, comme `incontournablesCites` l'est relativement aux autres incontournables). Le sens de la recherche est **inversé** par rapport à `incontournablesCites` : ici les mots du secteur sont cherchés dans le logement, là les mots d'un incontournable sont cherchés dans le nom d'un candidat. Plusieurs secteurs correspondent : celui dont le mot apparaît le **premier dans le texte du logement** ; à égalité, le premier du plan. Ce départage est une **heuristique** (« près du Vatican, Trastevere » donne « Vatican » si le plan a les deux secteurs, alors que le logement est à Trastevere) : c'est une **limite acceptée** (ci-dessous et « Quand revoir »).
3. **Seulement si aucun secteur ne correspond**, noms d'incontournables : le secteur de l'incontournable correspondant (mêmes règles 1 et départage ; mots distinctifs au sens de `incontournablesCites`).
4. **Pourquoi les secteurs d'abord** : pour « Rione Monti (près du Colisée), Rome », « Monti » est le quartier où l'on dort, « près du Colisée » est un repère de proximité ; si le plan nomme un secteur « Monti » et range le Colisée dans « Rome antique », le logement est à Monti.
5. **À défaut de correspondance** : le premier secteur du plan, comme le propose 0094. Ce n'est pas silencieux **en mode simulé** : le rapport de `scripts/p0/rapport.ts` porte un **booléen** (ou un compteur) « secteur du logement par repli », **mode simulé seulement**, jamais le nom du secteur. Cela ajoute un champ au schéma fermé de ce rapport (0032, A3.1) : Q-L2d l'ajoute avec le Tech Lead. Aucun champ nouveau n'est créé ni dans le journal `p0.research_done` (liste fermée de 0072 § 5, tranchée par 0103), ni dans le rapport de l'exécution réelle (`src/server/p0/rapport.ts`) : un repli en exécution réelle n'est donc pas signalé, il n'est visible qu'aux essais simulés.
6. **Clé vide** : une clé de nom de secteur ou d'incontournable du plan n'est jamais vide (`reglePlanManquee` refuse un nom sans lettre ni chiffre : `secteur_en_double`, `incontournable_en_double`). Seul le **texte du logement** peut donner une clé vide (texte fait seulement de symboles) ; il ne correspond à rien et donne le repli de la règle 5.
7. Le texte du logement n'est lu **que par notre code**, le temps de l'étape, et le **résultat** (un nom de secteur du plan) n'est écrit nulle part : ni `run_secteurs`, ni journal, ni rapport de `p0Run`, ni requête, ni prompt (conditions de 0103, question 6).

**Limites acceptées** : départage « premier dans le texte du logement » (règle 2) ; écritures sans espaces : correspondance par la clé entière seulement ; un logement qui ne cite ni secteur ni incontournable retombe sur le premier secteur.

**Avis de la Sécurité (0103, fusionnée, question 6).** (c) **favorable** ; (d) **neutre sous conditions** (plafonds de fiches et d'éléments Routes de P0S2-PO-26 intacts, test `qualite: dimensionnement sous les plafonds` vert, aucun compteur ajouté au journal ni au rapport) ; (a) **défavorable** (une donnée du brief irait à un modèle ; si je la retenais un jour, elle remonterait à Samuel avant tout code). Mon choix (c) s'aligne sur cet avis et reprend ses conditions : le secteur trouvé est un nom du plan, n'est ni journalisé, ni écrit dans `run_secteurs`, ni mis dans une requête, un prompt ou le rapport, et le test `p0: secteur du logement absent du journal, de la table du plan et des prompts` (sentinelle dans le texte du logement) est exigé. Aucune donnée du brief ne part vers un modèle sur la foi de cette décision. Si l'essai montrait (c) insuffisant, le choix d'une autre option serait une **décision de suite**, non fixée ici.

**Tests attendus** (critères pour Q-L2d, noms au Tech Lead) :
- « Rione Monti (près du Colisée), Rome » donne le secteur « Monti » quand le plan en a un, sinon le secteur du Colisée ;
- correspondance par mot distinctif seul (relatif aux autres secteurs) ;
- texte sans correspondance donne le premier secteur et le signale au rapport simulé ;
- **texte de logement fait seulement de symboles** (clé vide) : ne correspond à rien, donne le premier secteur (repli) ;
- **nom de secteur non latin sans espaces** (par exemple en chinois) : sa clé, non vide, est trouvée telle quelle dans un logement qui la contient, sans espaces autour ; un logement non latin sans espaces ne déclenche pas la règle des mots distinctifs ;
- départage : deux secteurs correspondent, celui qui apparaît le premier dans le texte l'emporte ; à égalité, le premier du plan.

Bloque Q-L2d, pas Q-L2c.

## 2. Question 8 : plan refusé, illisible ou absent

**Choix produit : pas de programme sans secteurs.** Pour une exécution **réelle** (`p0Run`) dont le plan **retombe sur `PLAN_VIDE`**, l'exécution **s'arrête** avec un code interne dédié, **persisté `pipeline_failed`** comme `research_empty` (0072 § 3, aucune valeur nouvelle en base), **sans programme** et sans écrire de programme partiel. **Décompte inchangé, selon 0093** (point 2) : une exécution sans programme n'est jamais comptée et n'est pas une relance. Raisons produit :
- « plan refusé ou absent » désigne tout plan que `lirePlan` rend en `PLAN_VIDE` avec `illisible: true` (`src/ai/sorties.ts`) : sortie refusée par le schéma, refusée par une règle de forme (`reglePlanManquee`), illisible, ou sans réponse (`undefined`) ; un plan lu valide, même avec peu de secteurs, n'est pas concerné ;
- sans secteurs, l'étape finale ne sait plus faire « un quartier par jour » : on retrouverait le défaut que Samuel a vu (Vatican et Trastevere le même jour) ; un programme faux coûte plus à la confiance qu'un échec clair ;
- aucun payeur inutile : ni ancrage ni étape finale ne sont payés (priorité 3).

**Où arrêter** : au plus tard **avant l'ancrage**, comme le propose 0094. Mon souhait produit est **plus tôt** : dès que le plan est refusé, **avant** la recherche web (qui, aujourd'hui, continue sans plan, choix 3 de #505) ; c'est l'économie la plus grande. C'est un changement de comportement de l'agent que #505 a accepté pour un lot, donc **le Tech Lead dit** si l'arrêt avant la recherche est faisable proprement (par exemple après une seconde tentative du plan si le coût le justifie : je ne la demande pas, elle engage des appels modèle). Quel que soit son avis, l'arrêt avant l'ancrage est acquis.

**Périmètre précisé** :
- **Mode simulé** (`pnpm p0`, tests) : un plan refusé donne le **rapport seul** (étape 11 de P0), sans programme, avec la cause dans le rapport ; les tests existants qui passent un plan refusé pour vérifier « la recherche part sans plan » sont réécrits par Q-L2d, avec le Tech Lead.
- **MVP** : inchangé (aucune règle de secteur n'y est portée, 0094 « Conséquences »).
- **Libellé écran** : aucun nouveau texte ; l'échec `pipeline_failed` utilise celui qui existe. Un message propre à ce cas est une question UX/UI, non posée tant que le prototype n'a pas d'écran d'échec distinct.
- **Un plan valide dont aucun candidat ne reçoit de secteur** retombe sur `research_empty` (tous écartés, compteur `qualite.secteurInconnu`), déjà couvert.
- **Table du plan** (question 1 de 0094) : la Sécurité l'admet sous conditions (0103, question 1) ; une ligne absente ou invalide de `run_secteurs` est une erreur fermée, jamais un plan par défaut inventé (0103, condition 8) : son code d'arrêt est celui de ce paragraphe, à confirmer par le Tech Lead.

Le nom du code, son rang dans la liste des arrêts et la forme du test restent au Tech Lead. Bloque Q-L2d.

## 3. Question 10 : exclure de l'ancrage les secteurs sans jour

**Choix produit : non pour l'instant**, comme la recommandation de 0094. Raisons : le gain n'est que du quota Text Search (« IDs only » sans coût, 0055 § 6 point 3) ; ces lieux servent de voisin de repli et de remplacement (P0S2-PO-22 points 2 a et 3) ; et exclure fait perdre de la qualité pour une économie que Samuel n'a pas demandée avant son essai.

**À revoir** quand l'essai rome-1 de la vague 2 ou la tâche B de 0093 montre que le nombre de Text Search pèse dans le coût ou le quota. Si je l'adopte alors : seuls sont exclus les candidats d'un secteur **sans jour ET voisin déclaré d'aucun secteur affecté**, calculé **après** l'affectation des secteurs (labels seulement). **Le choix (c) du § 1 garde cette porte ouverte** : l'affectation reste calculable avant les fiches, ce que (d) aurait empêché. Ne bloque rien.

## 4. Choix 2 de #505 : mots distinctifs (confirmé)

**Confirmé tel que construit** (`incontournablesCites`, `src/research/agent.ts` sur `main`) : un incontournable est cité si la clé de son nom figure en mots entiers dans le nom du candidat, ou si l'un de ses mots **distinctifs** y figure (4 lettres ou plus, absent du nom de la destination et des autres incontournables du plan). Un candidat qui en cite **deux ou plus** est écarté (compteur `qualite.candidatRegroupe`).

Raisons produit : sans cette règle, « Balade Panthéon, Trevi et Navone » passe, alors que Samuel a reproché qu'« aucun monument [n'est] précisément expliqué » ; un faux positif ne coûte qu'un candidat écarté (le suivant de la liste le remplace) ; **le risque de faux « regroupés » sur des noms de restaurants** relevé par le Tech Lead exige que le nom cite **deux** incontournables par leurs mots distinctifs, ce qui est rare ; le contrôle ne lit que le nom, jamais le prix ni le conseil (un billet combiné ne regroupe rien, PO-20).

**Limites acceptées, à écrire dans la spécification** : « Vue du Palatin sur le Forum romain » est écartée aussi (effet de bord déjà accepté dans #505) ; pour les écritures sans espaces (`ECRITURE_SANS_ESPACES`), la règle des mots distinctifs ne s'applique pas : la clé de l'incontournable est cherchée telle quelle (limite déjà documentée dans le code ; elle vaut aussi pour la comparaison du logement, § 1 règle 1). **Aucun changement de code demandé.** Le texte de P0S2-PO-20 sera amendé en ce sens par ma prochaine PR de spécification (cette PR ne touche que cette décision).

## 5. Mineur 14 de la première revue de #505 : incontournable revendiqué par un candidat

Constat vérifié dans le code : quand deux candidats désignent le même incontournable, **le premier admis est gardé** et le suivant est refusé `duplicate` (`memeIncontournable`, `src/research/agent.ts`). Un candidat dont la source dit « Colisée » pour un autre lieu peut donc évincer le vrai.

**Choix produit : accepté, à noter dans la spécification.** Le levier est limité à la qualité (aucun argent, aucune donnée, aucun plafond). Le champ `incontournable` vient de la sortie de notre agent, jamais d'un tiers directement ; mais l'agent **lit des pages non fiables** : une page piégée peut lui faire revendiquer un incontournable pour un candidat qui n'en est pas un (risque limité à la qualité, à nommer). `evals/qualite/` mesure `couvertureIncontournables` (un ratio, `src/research/evaluation.ts`) et l'agent compte `qualite.incontournableSansCandidat`, mais **aucun cas nommé** ne couvre l'éviction par revendication : je n'en demande pas pour l'instant. **Pas de règle plus fine pour l'instant** (par exemple garder le candidat dont le nom correspond le mieux). **À revoir** si un essai montre un incontournable perdu au profit d'un candidat qui n'en est pas un : j'écrirais alors le critère « le candidat dont le nom contient l'incontournable l'emporte sur le premier admis », que le Tech Lead chiffrerait.

## Questions restantes

1. **Samuel** (par une carte du CEO) : question 7 de 0094 (un ou deux secteurs voisins par jour), non touchée ici.
2. **Tech Lead** : l'arrêt sur plan refusé peut-il avoir lieu **avant la recherche** (§ 2) ? Nom du code d'arrêt (le même pour une ligne `run_secteurs` absente ou invalide) ; texte exact de la comparaison du logement (§ 1) ; seuil des mots distinctifs d'un secteur ; forme du booléen de repli au schéma fermé de `scripts/p0/rapport.ts`.
3. **UX/UI** : message d'échec propre au plan refusé, seulement si le prototype gagne un écran d'échec distinct (§ 2).
4. **CEO** : lister cette décision dans la note de version suivante ; aligner la question 6 de 0094 dans `QUESTIONS.md` sur l'avis de 0103 ((c) favorable, (a) défavorable, (d) neutre sous conditions) et sur le choix (c) de cette décision ; mettre à jour les rappels (#505).

## Conséquences

- Q-L2d est débloquée côté Product Owner (questions 6 et 8) et côté Sécurité (0103 est fusionnée) ; elle reste à préciser avec le Tech Lead (questions restantes, point 2).
- Aucune ligne de code ni de configuration n'est modifiée par cette décision ; la spécification `specs/P0-suite-2.md` (PO-20, PO-22) est amendée par une PR de spécification séparée.

## Quand revoir cette décision

- Si la Sécurité révise son avis de 0103 sur la question 6.
- Après l'essai rome-1 de la vague 2 : repli du secteur du logement trop fréquent (§ 1 règle 5), logement attribué au mauvais secteur par le départage « premier dans le texte » (§ 1 règle 2), arrêt sur plan refusé trop fréquent (§ 2), incontournable perdu par revendication (§ 5).
