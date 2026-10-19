# 0093 — Essais libres : plus de délai de veto, essai sans programme jamais compté, un seul fusible par essai

Statut : **décidée par Samuel** (règles du studio, argent, phases G0, sécurité des comptes : réservés à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion, sans délai de veto (c'est la décision de Samuel lui-même). Samuel décide, les rôles nommés au § « Mise en œuvre » appliquent. Ces parties ne sont **pas** des règles définitives à la fusion : le **point 2** (lecture de la réponse 2, acquise seulement par la confirmation écrite de Samuel sur #512) ; l'extension du point 5 à l'exécution comptée, **refusée** par Samuel (amendement 1) ; l'orientation pour le MVP du point 3 (à décider avant la production), la **piste** d'optimisation du point 4 (recommandation du studio, non mesurée, à étudier par la tâche B) et les **points 6 et 7** (acquis par la même confirmation écrite ; leur mécanisme est choisi par la tâche C, sous verdict de la Sécurité). Le reste est définitif dès la fusion.

Date : 2026-10-18 · Décideur : Samuel · Rédacteur : CEO (fil « Coûts et liberté de tester » du projet Vadrouille) · Ticket : #511 · Confirmation écrite de Samuel sur #512 : demandée pour les points 2, 6 et 7, à poster par Samuel : « Je confirme 0093 » (non reçue à la rédaction) · Décisions liées : 0011, 0027, 0034, 0035, 0053, 0055, 0056, 0068, 0069, 0070, 0071, 0073, 0088, 0089, 0090, 0091, 0092

**Remplace** 0068 (délai de veto de 6 heures), sauf son § 3, repris au point 1.

**Amende, sans les réécrire :**
- **P0S2-PO-13** (`specs/P0-suite-2.md`, décompte des exécutions comptées et des relances) et le principe « au cas par cas » de **0070**, **0089** et **0091** (§ « Limites » et « Quand revoir ») : point 2 ;
- **0071**, § « Ce qui reste », ligne « Plafonds par exécution » (« Inchangés »), et **0073** point 1 (fusibles de l'essai alignés sur l'exécution comptée) : point 5, à la fusion de la tâche A ;
- **0055 § 5** (D23) et `.claude/agents/release.md` l. 10-11 (PR vers `p0-reel` fusionnée par Samuel seul) : point 6, à la fusion de la tâche C ;
- **0035** et **0056 § 3** (`owner-approved` de Samuel sur chaque ligne de `MIGRATIONS_APPROUVEES`) : point 7, pour les migrations de la base d'essai seulement, à la fusion de la tâche C et après le verdict de la Sécurité.

**N'amende pas** : 0011, 0027 point 4 et la ligne « Jamais » de `CLAUDE.md` (données Google) : le prototype relève de 0092, le MVP reste sous ces règles (point 3) ; 0053 et 0088 § 13 (840 éléments Routes par voyage, inchangés jusqu'à la tâche B, point 4) ; 0034 et D21 (refus en production) ; le verrou de #172 (`specs/P0-suite-2.md` l. 367) et toute proposition qui attend une réponse écrite de Samuel.

## Contexte

Message de Samuel, 2026-10-18 21:20:37 UTC (message `cmsg_0174CRqum9q8GNfZHmNHcYvRD9eh1qMt4sVzFmJcsJwnyL`), copié tel quel :

> « Il faut qu'on règle les problèmes de coût et de requête.
>
> Pour moi pas de souci d'avoir des requêtes et un coût a l'analyse, une fois l'analyse fait le rendu final fourni, plus de requête et de coût, Google ou ai
>
> Le rendu c'est améliorer sur la dernière génération de Rome. Par contre on avait dit par quartier mais pour certaine raison tu fais aller retour la même journée entre le Vatican et trestavere.
>
> Réglons d'abord nos problème de requête et du fais que je peux pas tester librement, ça m'énerve, les vétos de décision, les temps avant mise en application des règles.
>
> Pose moi tes questions pour régler ces histoires »

Questions posées par le studio dans le même fil, 2026-10-18 21:25 UTC (message `cmsg_0174CRqum9q8GNfZHmNHcYvRAnUZE7brWrDeKdnxu1rrRN`), copiées telles quelles, recommandation marquée :

> 1. **Délai de veto.** Les décisions du studio s'appliquent dès qu'elles sont acceptées, et tu peux toujours revenir dessus après ? Oui, plus de délai (recommandé) / Non, garder les 6 h
> 2. **Essais ratés.** Un essai qui ne produit aucun voyage (bug, panne, limite Google) ne compte jamais, sans te demander à chaque fois ? Jamais compté (recommandé) / Au cas par cas
> 3. **Zéro appel après l'analyse.** On garde déjà les temps de trajet pour tes essais. On applique la même règle à l'application finale : tout est calculé une fois, puis plus aucun appel Google ni IA pour afficher un voyage ? Oui, partout (recommandé) / Essais seulement
> 4. **Limite Google de ta console.** Un voyage de Rome utilise environ 840 trajets, ta limite est 1000 par jour : un seul essai par jour. Tu la montes à 3000 (environ 3 essais par jour, au-delà de la part gratuite du mois c'est de l'ordre de 5 à 10 USD par 1000 trajets, chiffre à vérifier dans ta console) ? 3000 (recommandé) / Garder 1000
> 5. **Fusibles par essai.** Un essai s'arrête seul s'il dépasse 2 USD d'IA, 840 trajets ou 15 minutes. On les garde comme garde-fou contre un essai qui s'emballe ? Garder (recommandé) / Enlever
> 6. **Ta page d'essai à jour.** Aujourd'hui, une correction acceptée attend qu'on recopie le code sur ta page d'essai. On le fait automatiquement après chaque correction acceptée ? Automatique (recommandé) / À la main
> 7. **Ton étiquette sur les changements de la base d'essai.** Chaque changement de la base d'essai attend que tu poses l'étiquette « owner-approved ». On la supprime pour la base d'essai seulement, en la gardant pour tout le reste et avant toute ouverture au public ? Supprimer pour les essais (recommandé) / Garder

Réponses de Samuel, 2026-10-18 21:27:55 UTC (message `cmsg_0174CRqum9q8GNfZHmNHcYvRTpt5cds38dyTNdPgmUznjR`), copiées telles quelles :

> « 1. Plus de délais
> 2. Les essais je gère moi les couts ok garde juste ma règle qui dit que je suis le seul a tester sur les quotas
> 3. On fait les appel et les analyses et après plus d'appel, on stock le résultat. Garde en tête re revoir peut-être ça avant la mise en prod
> 4. Pour moi ça fais partie des optimisations, 840 trajets pourquoi? On peut pas faire mieux, trouver un algo? Je suis conscient que c'est un problème complexe. Pour moi 2 choses différentes. On garde 3000 par jour et je gère moi mais surtout on doit bosser l'optimisation.
> 5. Pour l'essai on garde juste les dépassements de 2 USD effectif dans Google, c'est tout
> 6. Automatique
> 7. On supprime de la base d'essaie »

Lues avec les questions, les réponses 6 et 7 choisissent les options « Automatique » et « Supprimer pour les essais » : la réponse 7 lève l'étiquette `owner-approved` pour la base d'essai ; elle ne supprime aucune donnée.

Précision de la réponse 5 : la réponse parle de « 2 USD effectif dans Google », alors que le seul fusible à 2 USD existant porte sur l'IA. Le studio a donc posé une carte de décision (2026-10-18 21:31 UTC, message `cmsg_0174CRqum9q8GNfZHmNHcYvRSL9EJs9NbmjP6TmHFLnmCL`), question « Garder quel fusible de 2 USD par essai ? », contexte : « Le code ne voit pas ta facture Google réelle (part gratuite incluse) : il compte au prix catalogue. Un Rome à 840 trajets vaut environ 4,20 USD au prix catalogue côté Google. » Options : « IA 2 USD » (seul fusible : 2 USD d'IA par essai ; Google borné par la console de Samuel), « Google 2 USD », « IA + Google 2 USD ». Choix de Samuel, de sa main sur la carte, 2026-10-18 21:32:23 UTC : **« IA 2 USD »**.

Sur OpenStreetMap : Samuel a demandé à 21:31:37 UTC « Sinon, on passe sur OpenStreetMap pour les tests? » ; après la réponse du studio (optimisation d'abord, recommandée), il a écrit à 21:32:25 UTC : « Ok optimisations d'abord ».

État relevé avant cette décision : les limites du studio sur le nombre d'essais sont déjà levées (0071) ; restaient le délai de 6 heures (0068), le décompte G0 des essais ratés (une décision de Samuel par essai : 0070, 0089, 0091), la relecture Routes à chaque affichage (corrigée pour le prototype par 0092, en revue), plusieurs fusibles par essai (`essai.json`, `mode-reel.json`), la mise à jour de `p0-reel` fusionnée par Samuel et son `owner-approved` sur chaque migration.

## Décision

1. **Plus de délai de veto** (réponse 1). Une décision déléguée (Tech Lead, Sécurité, Product Owner, UX/UI, CEO, autres rôles) est **définitive dès sa fusion** sur `main`. Elle reste listée dans la note de version ; Samuel peut la remettre en cause **à tout moment**, par un message puis une nouvelle décision.
   - **Délais en cours** : toute décision déléguée encore dans son délai de 6 heures à la fusion de 0093 est définitive à cette fusion.
   - **Ce qui ne change pas** (repris de 0068 § 3) : ce qui est réservé à Samuel, et toute proposition qui attend sa réponse écrite, jamais acquise par son silence ; les passages marqués **(TL)** non signés tant que le Tech Lead n'a pas approuvé (fusionner ne vaut pas signature du Tech Lead) ; `owner-approved` (0035) pour les PR de workflow, sauf le point 7 une fois appliqué ; le verrou de #172 (`specs/P0-suite-2.md` l. 367), qui attend la confirmation écrite de Samuel.
   - Les revues (Tech Lead, Sécurité, CI) ne changent pas.

2. **Essais** (réponse 2).
   - **Seul Samuel lance les essais payants** (règle maintenue à sa demande) ; le studio ne lance `pnpm p0` qu'en mode simulé.
   - Samuel gère ses coûts lui-même, par ses tableaux de bord et ses limites chez les fournisseurs (comme 0071).
   - **Règle générale : une exécution qui n'écrit aucun programme ne compte jamais** pour G0 (P0a2, P0S2-PO-13), quelle que soit la cause (défaut du code, panne, limite Google, fusible). Elle n'est ni une exécution comptée ni une relance. Plus de décision au cas par cas. C'est une **lecture** de la réponse 2 (« Les essais je gère moi les couts ok »), qui ne choisit pas en toutes lettres entre les deux options de la question 2 : elle est acquise par la confirmation écrite de Samuel sur #512 (« Je confirme 0093 »), et la tâche A ne commence qu'après. En attendant, les règles de 0070, 0089 et 0091 restent appliquées ; les entrées de `EXECUTIONS_EXCLUES` (0070, 0089, 0091) restent valables. Répond à **Q500**, et à **Q502** si cette exécution n'a écrit aucun programme, une fois la confirmation écrite.

3. **Calculs pendant l'analyse, puis plus aucun appel** (réponse 3).
   - **Prototype** : la règle est celle de **0092** (temps de trajet conservés, exception à 0011 et 0027 point 4), que 0093 n'amende pas ; elle s'applique à la fusion de 0092 et de son code (#504, #509, #507). L'affichage d'un voyage n'appelle alors plus l'IA, ni Google sauf le chargement de la carte Google (part gratuite) et la relecture des seules paires manquantes (0092 § 4).
   - **Application (MVP)** : **orientation** de Samuel (« on stock le résultat »), pas encore une règle. Elle répond à **Q501** dans son principe. Le MVP reste sous 0011, 0027 point 4 et la ligne « Jamais » de `CLAUDE.md` tant qu'une **nouvelle décision**, prise avant la mise en production (« Garde en tête re revoir peut-être ça avant la mise en prod »), ne les amende pas. Cette décision devra dire quelles données Google sont gardées (temps de trajet, coordonnées), combien de temps, et reprendre le risque contractuel noté par Q501 (conservation contraire au contrat Google) et la validation juridique ouverte de **Q5**.

4. **Limite Google et optimisation : deux sujets** (réponse 4).
   - **Limite** : Samuel règle sa console Google à **3000 éléments Routes par jour** et la gère lui-même.
   - **Optimisation** : le studio doit **réduire le nombre de trajets demandés à Google** par voyage, à qualité égale. Pourquoi 840 aujourd'hui : pour chaque jour, le moteur demande les temps entre **toutes les paires** de lieux envisagés (règle `n² + 2n ≤ part du jour`, 0055 § 6 point 1, 0088 § 13) pour choisir l'ordre lui-même ; avec 12 lieux par jour, c'est 168 trajets par jour, 840 pour 5 jours.
   - **Piste (recommandation du studio, non mesurée)** : regrouper et ordonner par quartier avec nos propres distances à vol d'oiseau (gratuites), puis ne demander à Google que les trajets entre étapes qui se suivent ; l'ordre de grandeur attendu (une cinquantaine de trajets par voyage) est à vérifier par la tâche B. Elle rejoint le retour de Samuel sur Rome (une journée par quartier).
   - **OpenStreetMap** : un calcul de trajets maison sur OpenStreetMap (marche d'abord) reste la piste suivante si l'optimisation ne suffit pas (« Ok optimisations d'abord »). Une carte OpenStreetMap reste exclue tant que les lieux viennent de Google (`CLAUDE.md`, « Jamais »).
   - La limite de **840 éléments par voyage** (0053, 0088 § 13) reste en vigueur jusqu'à la tâche B, inchangée.

5. **Un seul fusible d'arrêt par essai : 2 USD d'IA** (réponse 5 ; carte de 21:31 UTC, choix de Samuel de 21:32 UTC). Pour les modes `reel` et `essai`, seul le coût des modèles (`coutUsd`) arrête une exécution. **Valeurs** : `essai.json` passe de 3 à **2 USD** (réponse 5 : « Pour l'essai ») ; `mode-reel.json` (exécutions comptées) **reste à 3 USD** (P0S2-PO-16 : le critère A7 de la grille G0 est « ≤ 3 USD », un arrêt à 2 USD ferait échouer une exécution qui le franchit) tant que Samuel ne l'étend pas : question posée par une carte de décision le 2026-10-19 vers 00:24 UTC (message `cmsg_0174CRqum9q8GNfZHmNHcYvRU3yjDD6dz2sdUK9ZVW2tez`, « Mettre aussi les essais comptés à 2 USD d'IA ? », options « Essai seulement » et « Les deux »), recommandation « Essai seulement ». **Amendement 1** : choix de Samuel, de sa main sur la carte, 2026-10-19 16:46:52 UTC : **« Essai seulement »** (« Essais d'intégration à 2 USD, essais comptés gardés à 3 USD. ») : `mode-reel.json` reste à 3 USD, P0S2-PO-16 inchangé. A7 reste évalué sur le coût total de l'exécution. Le contexte de la question 5 et celui de la carte de 21:31 UTC donnaient à tort 2 USD comme valeur actuelle de l'exécution comptée : les deux fichiers valent 3 USD sur `main`. Ne sont plus des fusibles : `recherchesWeb`, `pagesLues`, `candidatsTrouves`, `placesTextSearch`, `placesDetails`, `dureeMs`. **Exception, Routes** : `routesRequetes` et `routesElements` (840) restent jusqu'à la tâche B, avec leur comportement actuel, parce qu'ils dimensionnent le plan Routes (taille des matrices de chaque jour) : le registre refuse tout appel Routes au-delà, **avant l'appel**, comme aujourd'hui. Google n'est borné par ailleurs que par la console de Samuel. Restent aussi : protections des clés et des secrets, refus en production (0034, D21), durée maximale d'une étape imposée par la plateforme. S'applique à la fusion de la tâche A ; jusque-là, les fusibles actuels restent.

6. **Page d'essai à jour automatiquement** (question 6, réponse « Automatique »). Après chaque fusion sur `main`, `p0-reel` est mis à jour depuis `main` **sans geste de Samuel**. Restent interdites : la poussée forcée, la suppression de `p0-reel` et la mise à jour depuis une autre branche que `main`. Les relevés de la Sécurité (0069) se font après la mise à jour, sans la retarder. **Conditions** : le mécanisme est proposé par la tâche C et reçoit le **verdict de la Sécurité** (0055 § 5 et S-5, D23 : fusion automatique exclue de `p0-reel`) avant sa fusion ; il dit aussi ce que deviennent les points 3 à 5 de 0055 § 5 (règle de branche, vérification « arbre égal à `main` », suspension des exécutions sur une fusion que Samuel ne confirme pas), pour qu'une mise à jour automatique ne suspende pas chaque exécution, et la spécification suit ; le changement de workflow demande une dernière fois l'`owner-approved` de Samuel. Jusque-là, 0055 § 5 et `.claude/agents/release.md` restent appliqués.

7. **Plus d'`owner-approved` pour les migrations de la base d'essai** (question 7, réponse « On supprime de la base d'essaie »). Jusqu'à l'ouverture à un public (G1), une migration de la base Neon d'essai fusionnée sur `main` (revue Tech Lead, verdict de la Sécurité pour `db/`, CI au vert) est appliquée **sans** l'`owner-approved` de Samuel. Aucune donnée n'est supprimée par ce point. L'`owner-approved` reste exigé pour tout le reste (autres fichiers de `.github/workflows/`, production, clés) et redevient exigé pour les migrations avant toute ouverture au public. **Conditions** : le mécanisme est proposé par la tâche C et reçoit le **verdict de la Sécurité** (S9 de 0056) avant sa fusion ; le changement de workflow demande une dernière fois l'`owner-approved` de Samuel. Jusque-là, 0035 et 0056 § 3 restent appliqués.

## Prévalence

0093 prévaut sur tout texte qui la contredit, jusqu'à sa correction : échéances « sans veto … 6 heures » ou « sous 2 jours » des spécifications et handovers (dont `specs/B9-generation.md`, `specs/P0-suite-2.md`, `specs/B8-ancrage.md`, `specs/F4-carte.md`, `docs/handovers/backend.md`) et des décisions (dont 0071, 0090, 0092 en revue) ; règle de relance de `specs/P0-suite-2.md` (P0S2-PO-13) jusqu'à la tâche A. Une PR qui touche ces fichiers pour une autre raison peut corriger la phrase. Les textes historiques datés (notes de version, revues hebdomadaires) ne sont pas réécrits.

## Mise en œuvre

Le CEO place ces tâches (au plus 3 fils, jamais deux sur les mêmes fichiers) :

- **Cette PR (docs seulement)** : la présente décision ; renvois en tête de 0068, 0035, 0056, 0053, 0055, 0070, 0071, 0073, 0088, 0089 et 0091 ; `docs/CONTEXT.md`, `docs/studio/mise-en-place.md`, `docs/templates/release-note.md` et les rôles `ceo`, `tech-lead`, `product-owner`, `ux-ui` citent 0093 au lieu du délai de 6 heures. `CLAUDE.md` n'est pas modifié (0093 ne change pas ses règles ; #504 le modifie pour 0092).
- **Tâche A — décompte et fusible** (ia-recherche, avec Tech Lead) : `src/server/p0/decompte.ts` (une exécution sans programme écrit ne compte jamais, tests) ; `coutUsd` à 2 dans `essai.json` (`mode-reel.json` reste à 3 USD, amendement 1 du point 5) et retrait des fusibles du point 5 (`prototype/config/essai.json`, `mode-reel.json`, `src/server/usage/forfait.ts` et tests) ; `specs/P0-suite-2.md` (P0S2-PO-13 et l. 208, 295 ; P0S2-PO-16 l. 488, « durée 15 min » retirée des fusibles dans tous les cas, l. 333 et le « 3 USD » de l. 488 inchangés). Elle commence après la confirmation écrite de Samuel (point 2).
- **Tâche B — optimisation des trajets** (ia-recherche, avec Tech Lead, après #507) : étude chiffrée de la piste du point 4, puis code, avec la qualité du programme (regroupement par quartier, retour Rome) mesurée sur les essais simulés ; nouvelle décision qui amende 0053, 0055 § 6 et 0088 § 13.
- **Tâche C — workflows** (Release et Sécurité) : mise à jour automatique de `p0-reel` (point 6), application des migrations de la base d'essai sans `owner-approved` (point 7), `.claude/agents/release.md` ; verdict de la Sécurité ; `owner-approved` de Samuel une dernière fois.
- **`QUESTIONS.md` et `STATUS.md`** (PR « chore: status » du CEO) : Q500 répondue, Q501 répondue dans son principe (orientation, point 3), Q502 couverte si sans programme ; Q455, Q485 et Q503 sans objet.

## Quand revoir

Avant la mise en production ou toute ouverture à un public (G1) : point 3 (décision MVP sur les données conservées), point 5 (fusibles), points 6 et 7 (gestes de Samuel rétablis pour les migrations). À la demande de Samuel, à tout moment.
