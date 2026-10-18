# 0093 — Essais libres : plus de délai de veto, zéro appel à l'affichage, un seul fusible par essai

Statut : **décidée par Samuel** (argent, phases G0, règles du studio : réservés à Samuel, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion, sans délai de veto (c'est la décision de Samuel lui-même). Les mises en œuvre (§ « Mise en œuvre ») sont des choix d'outillage des rôles nommés, sans délai elles aussi (point 1).

Date : 2026-10-18 · Décideur : Samuel · Rédacteur : Tech Lead (pour le CEO) · Source : fil « Coûts et liberté de tester », projet Vadrouille · Ticket : #511 · Décisions liées : 0011, 0027, 0035, 0053, 0068, 0071, 0073, 0088, 0089, 0091, 0092

## Contexte

Message de Samuel, 2026-10-18 21:20 UTC, copié tel quel :

> « Il faut qu'on règle les problèmes de coût et de requête. Pour moi pas de souci d'avoir des requêtes et un coût a l'analyse, une fois l'analyse fait le rendu final fourni, plus de requête et de coût, Google ou ai […] Réglons d'abord nos problème de requête et du fais que je peux pas tester librement, ça m'énerve, les vétos de décision, les temps avant mise en application des règles. »

Le studio lui a posé sept questions (21:25 UTC). Ses réponses, 21:27 UTC, copiées telles quelles :

> « 1. Plus de délais
> 2. Les essais je gère moi les couts ok garde juste ma règle qui dit que je suis le seul a tester sur les quotas
> 3. On fait les appel et les analyses et après plus d'appel, on stock le résultat. Garde en tête re revoir peut-être ça avant la mise en prod
> 4. Pour moi ça fais partie des optimisations, 840 trajets pourquoi? On peut pas faire mieux, trouver un algo? Je suis conscient que c'est un problème complexe. Pour moi 2 choses différentes. On garde 3000 par jour et je gère moi mais surtout on doit bosser l'optimisation.
> 5. Pour l'essai on garde juste les dépassements de 2 USD effectif dans Google, c'est tout
> 6. Automatique
> 7. On supprime de la base d'essaie »

État relevé avant cette décision : les limites du studio sur le nombre d'essais sont déjà levées (0071) ; restaient le délai de veto de 6 heures (0068), le décompte G0 des essais ratés (une décision de Samuel par essai : 0070, 0089, 0091), la relecture Routes à chaque affichage (corrigée par 0092, en cours), plusieurs fusibles par essai (`essai.json`, `mode-reel.json`), la mise à jour manuelle de `p0-reel` et l'`owner-approved` de Samuel sur chaque migration.

## Décision

1. **Plus de délai de veto.** Toute décision déléguée (Tech Lead, Product Owner, UX/UI, CEO, autres rôles) est **définitive dès sa fusion**. Elle reste listée dans la note de version ; Samuel peut la remettre en cause **à tout moment**, par une nouvelle décision. Remplace le délai de 6 heures de **0068**. Aucune tâche n'attend plus la fin d'un délai : les délais encore ouverts à la fusion de cette décision sont **clos**. Ce point ne change pas ce qui est réservé à Samuel (« Qui décide quoi ») ni les revues (Tech Lead, Sécurité, CI).

2. **Essais.**
   - **Seul Samuel lance les essais payants** (règle inchangée) ; le studio ne lance `pnpm p0` qu'en mode simulé.
   - Samuel gère ses coûts lui-même, par ses tableaux de bord et ses limites chez les fournisseurs (comme 0071).
   - **Règle générale : une exécution qui n'écrit aucun programme ne compte jamais** pour G0 (P0a2, P0S2-PO-13), quelle que soit la cause (défaut du code, panne, limite Google, fusible). Elle n'est ni une exécution comptée ni une relance. Plus aucune décision au cas par cas : **amende P0S2-PO-13** et rend la liste fermée `EXECUTIONS_EXCLUES` de 0070, 0089 et 0091 inutile pour l'avenir (ses entrées restent valables). Répond à **Q500** (et à Q502 si cette exécution n'a écrit aucun programme).

3. **Calculs pendant l'analyse, puis plus aucun appel.** Les appels Google et IA ont lieu **pendant la génération seulement**. Le résultat est **conservé** ; afficher un voyage (essai ou application finale) ne fait **plus aucun appel Google ni IA**. Pour le prototype, 0092 met cela en œuvre (temps de trajet conservés). **Le principe vaut aussi pour l'application (MVP)** : extension de 0092 au MVP (Q501). Exception connue : la carte Google se charge à l'affichage (chargement de carte, sans IA ; part gratuite). **À revoir avant la mise en production** (demande de Samuel) : durée de conservation et conditions Google des données gardées.

4. **Limite Google et optimisation : deux sujets.**
   - **Limite** : Samuel règle lui-même sa console Google à **3000 éléments Routes par jour** et la gère. Le studio ne la commente plus comme un frein.
   - **Optimisation** : le studio doit **réduire fortement le nombre de trajets demandés** par voyage. Pourquoi 840 aujourd'hui : pour chaque jour, le moteur demande à Google le temps entre **toutes les paires** de lieux envisagés (règle `n² + 2n ≤ part du jour`, 0055 § 6 point 1, 0088 § 13), pour choisir l'ordre lui-même. Avec 12 lieux par jour, c'est 168 trajets par jour, 840 pour 5 jours. Piste à étudier : **regrouper et ordonner par quartier avec nos propres distances à vol d'oiseau** (gratuites), puis ne demander à Google que les trajets **entre étapes qui se suivent** (une dizaine par jour, de l'ordre de 50 par voyage). Cette piste rejoint le retour de Samuel sur Rome (une journée par quartier). Tâche à part (§ « Mise en œuvre »), la limite de 840 reste en vigueur jusqu'à elle.
   - **OpenStreetMap** : Samuel a demandé (21:31 UTC) s'il fallait passer sur OpenStreetMap pour les essais ; réponse de Samuel, 21:32 UTC : « Ok optimisations d'abord ». Un calcul de trajets maison sur OpenStreetMap (marche d'abord) reste la piste suivante si l'optimisation ne suffit pas. Une carte OpenStreetMap reste exclue tant que les lieux viennent de Google (CLAUDE.md, « Jamais »).

5. **Un seul fusible par essai : 2 USD.** Les autres fusibles par exécution (`recherchesWeb`, `pagesLues`, `candidatsTrouves`, `placesTextSearch`, `placesDetails`, `routesRequetes`, `routesElements`, `dureeMs`) **ne servent plus de fusibles** pour les modes `reel` et `essai`. Carte de décision du fil (question « Garder quel fusible de 2 USD par essai ? »), choix de Samuel de sa main, 2026-10-18 21:32 UTC : **« IA 2 USD »** : le seul fusible est **2 USD de dépense IA par exécution** (`coutUsd` à 2 dans `essai.json` et `mode-reel.json`) ; Google n'est borné que par la console de Samuel. La limite de 840 éléments du point 4 reste celle du plan Routes (taille des matrices), pas un fusible d'arrêt, jusqu'à l'optimisation. Garde-fous techniques gardés : ceux qui protègent les clés, la production (0034, D21) et la plateforme (durée maximale d'une étape Vercel).

6. **Page d'essai à jour automatiquement.** Après chaque fusion sur `main`, `p0-reel` est mis à jour **automatiquement** depuis `main`, sans geste de Samuel. Remplace, dans `.claude/agents/release.md`, la règle « PR de base `p0-reel` fusionnée par Samuel seul » (0055 § 5, D23) pour les mises à jour depuis `main` ; poussée forcée, suppression de `p0-reel` et fusion d'une branche autre que `main` restent interdites. Les relevés de la Sécurité (0069) se font après la mise à jour, sans la retarder.

7. **Plus d'`owner-approved` de Samuel pour les migrations de la base d'essai.** Jusqu'à l'ouverture à un public (G1), une migration fusionnée sur `main` (revue Tech Lead, Sécurité si `db/`, CI au vert) est appliquée à la base Neon d'essai **sans** l'`owner-approved` de Samuel. Amende **0035** et **0056 § 3** pour ces migrations seulement. L'`owner-approved` reste exigé pour tout le reste (fichiers de `.github/workflows/` autres que l'ajout d'une migration, production, clés), et redevient exigé pour les migrations avant toute ouverture au public. Le changement de workflow qui met ce point en œuvre demande **une dernière fois** l'`owner-approved` de Samuel.

## Mise en œuvre

Le CEO place ces tâches (au plus 3 fils, jamais deux sur les mêmes fichiers, après #504, #509 et #507 pour ce qui touche les mêmes fichiers) :

- **Cette PR (docs seulement)** : la présente décision ; `docs/CONTEXT.md`, `docs/studio/mise-en-place.md`, `docs/templates/release-note.md` et les rôles `ceo`, `tech-lead`, `product-owner`, `ux-ui` citent 0093 au lieu du délai de 6 heures. `CLAUDE.md` n'est pas modifié ici (#504 le modifie) : l'extension au MVP du point 3 y est reportée par la tâche porteuse après la fusion de #504.
- **Tâche A — décompte et fusible** (ia-recherche, avec Tech Lead) : `src/server/p0/decompte.ts` (une exécution sans programme écrit ne compte jamais, tests) ; `coutUsd` à 2 et retrait des autres fusibles pour `reel` et `essai` (`prototype/config/essai.json`, `mode-reel.json`, `src/server/usage/forfait.ts` et ses tests) ; `specs/P0-suite-2.md` (P0S2-PO-13 amendée).
- **Tâche B — optimisation des trajets** (ia-recherche, avec Tech Lead, après #507) : étude puis code de la piste du point 4, avec la qualité du programme (regroupement par quartier, retour Rome) mesurée sur les essais simulés.
- **Tâche C — workflows** (Release et Sécurité) : mise à jour automatique de `p0-reel` depuis `main` (point 6) et application des migrations sans `owner-approved` (point 7), dont `.claude/agents/release.md` ; `owner-approved` de Samuel une dernière fois.
- **`QUESTIONS.md` et `STATUS.md`** (PR « chore: status » du CEO) : Q500 et Q501 répondues ; délais de veto ouverts clos.

## Quand revoir

Avant la mise en production ou toute ouverture à un public (G1) : points 3 (données conservées), 5 (fusibles), 6 et 7 (gestes de Samuel) sont revus par une nouvelle décision. À la demande de Samuel, à tout moment.
