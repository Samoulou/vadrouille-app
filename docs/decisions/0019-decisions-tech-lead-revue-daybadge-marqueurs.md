# 0019 — Décisions du Tech Lead : sémantique de `DayBadge` (Q111), marqueurs proches (Q116), règle de revue (Q117)

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-09 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #71

Numérotation : 0006 à 0012 sont réservés par #26 et #27, 0017 par #65.

## Contexte
Trois questions déléguées au Tech Lead sont ouvertes :
- **Q111** (U2-Q4, décision 0018 § 10, correction en revue dans #67) : `DayBadge` en mode bouton, prévu avec `aria-pressed` par la décision 0016 § 8, doit-il passer en sémantique radio, comme UX/UI le préconise pour un choix exclusif ? À trancher avant F7b.
- **Q116** (F5b, #66) : sur la carte simulée du jour 5, des marqueurs se chevauchent. C'est la suite de F4-Q3 (`specs/F4-carte.md`, « zone active de 44 px autour d'un marqueur de 26 px quand deux étapes sont proches »).
- **Q117** (outillage de revue) : constats du CEO au 14e cycle :
  - #64 a été fusionnée sur `techlead-approved` alors que la revue UX/UI, encore en cours, demandait des corrections (reprises dans #67) ;
  - sur #67, 5 revues contradictoires ont été publiées sur le même head en 4 minutes, avec `techlead-approved` et `changes-requested` posés ensemble ;
  - sur #65 et #66, chaque correction a fait apparaître de nouveaux bloquants qui n'avaient pas été signalés à la revue précédente. Les deux PR ont épuisé leurs 2 tentatives de correction.

Hors de cette décision, parce qu'elles sont réservées à Samuel (`docs/CONTEXT.md`, « Qui décide quoi » ; `CLAUDE.md`) :
- le prompt des routines (R2 Revue en particulier, `docs/studio/mise-en-place.md`, annexe B) ;
- la règle de fusion « CI verte + validation du Tech Lead » ;
- la règle des 2 tentatives de correction (prompt R1, étape 5).

Ce que Q117 demanderait de changer dans ces règles est écrit plus bas comme **propositions à Samuel** (§ 3.4), pas comme décisions.

Cette PR ne contient ni code ni workflow. Les changements décidés sont décrits comme tâches à venir. Aucune décision n'engage d'argent, de compte externe ni de donnée personnelle. Il n'y a ni dépendance ni version nouvelle, et la décision 0003 ne change pas.

## 1. Q111 (U2-Q4) — `DayBadge` pour choisir un jour : sémantique radio
**Décision : choisir un jour (« Vers quel jour ? » dans F7b, « Quel jour ? » dans F7c) est un groupe radio. `aria-pressed` n'est plus utilisé pour ce choix. La décision 0016 § 8 est amendée en ce sens.**

### 1.1 Raisons
- **C'est un choix exclusif.** Un seul jour est choisi à la fois. `aria-pressed` décrit des bascules indépendantes. Avec `aria-pressed`, un lecteur d'écran annonce six boutons « enfoncé / non enfoncé » sans dire qu'ils s'excluent, ni combien il y en a (« 4 sur 6 »). Il n'annonce pas non plus qu'enfoncer J4 relâche J2. C'est le cas d'usage de `radiogroup` dans la pratique WAI-ARIA.
- **Cohérence avec le reste du studio.** La règle commune de la décision 0018 (« Choix exclusif et action ») réserve `aria-pressed` aux bascules indépendantes (`Chip`, case de la liste, « Verrouiller » de F5b). La raison et le moment de F7 sont déjà des groupes radio (`SegmentedControl`, 0016 § 8). Si le jour était le seul choix exclusif en `aria-pressed`, deux sémantiques différentes cohabiteraient sur le même écran (« Ajouter un lieu » : jour, puis moment).
- **Coût faible maintenant, élevé plus tard.** F7b n'est pas codée. Changer la forme avant le code ne coûte qu'un amendement. Après, il faudrait réécrire le composant, ses tests et C21.

### 1.2 Forme technique (amende 0016 § 8, « `DayBadge` en mode bouton »)
- **Une seule logique clavier de groupe radio, sans seconde copie.** La logique de `SegmentedControl` est extraite dans un crochet `useRadioGroup` (`src/components/ligne/useRadioGroup.ts`). Il gère l'arrêt de tabulation unique, les flèches dans les deux axes, Début et Fin, le bouclage, et le déplacement du focus avec le choix. `SegmentedControl` l'utilise, et ses tests existants (F2, puis ceux de F7a pour `value: null` et `orientation`) restent inchangés : ils prouvent que l'extraction n'a rien changé. Il n'y a pas d'autre implémentation de groupe radio dans `src/components` ni dans `src/features`. C'est un point de revue.
- **Nouveau composant `DayBadgeGroup`** (`src/components/ligne/DayBadgeGroup.tsx`). Ses props :
  - `days` : liste de `{ day, weekday?, disabled? }` ;
  - `value: number | null` : sans présélection possible (F7, « Présélection … sinon aucun ») ;
  - `onChange(day)` ;
  - `labelledBy` : l'identifiant du titre de niveau 3 (« Vers quel jour ? », « Quel jour ? », 0018 § 10).

  Il rend :
  - un conteneur `role="radiogroup"`, nommé par `aria-labelledby` ;
  - pour chaque jour, une `DayBadge` en rendu radio : `<button type="button" role="radio" aria-checked>`, avec le nom accessible de F3 (`dayBadgeName` : « Jour 4 », « Jour 3, complet »).
- **`DayBadge`** perd les props `onSelect` et `pressed` prévues par 0016 § 8, et gagne un rendu radio. Ce rendu n'est utilisable que par `DayBadgeGroup` : il n'est pas exporté seul par `src/components/ligne/index.ts`, ou son type l'interdit hors du groupe. F7b choisit la forme exacte. Le mode lien (`DayTabs`, `aria-current`) et l'état désactivé du mode lien (F3) ne changent pas. Le rendu radio ne porte jamais `aria-current` ni `aria-pressed`.
- **Jour « complet »** :
  - `aria-disabled="true"`, et non l'attribut natif `disabled`. Il garde son nom « Jour {n}, complet » et la mention visible « complet » (0018 § 10) ;
  - les flèches **y posent le focus**, pour qu'il reste atteignable et annoncé (0016 § 8, 0018 § 10), **mais ne le cochent pas** : la valeur reste celle d'avant. Un clic, Espace ou Entrée dessus n'a aucun effet ;
  - `useRadioGroup` gère ce cas par une option `isDisabled(index)`. `SegmentedControl` ne s'en sert pas aujourd'hui.
- **Arrêt de tabulation** : le jour coché. Sans jour coché, le premier jour qui n'est pas complet. Si tous sont complets, le premier jour.
- **La sélection suit le focus, et c'est permis à une condition** : cocher un jour ne déclenche aucune demande ni aucun aperçu. Il ne fait qu'afficher ce qui est déjà chargé : les points d'insertion de `MoveOptions` (F7b, `getMoveOptions` appelé une fois à l'ouverture), ou les moments du résultat (F7c). L'aperçu ne part que de « Placer ici, vers {heure} » (F7b) ou de « Voir l'effet » (F7c). Si une PR a besoin d'une demande au changement de jour, il faut un amendement de cette décision.
- **Erreur de choix** (aucun jour choisi alors qu'un choix est exigé) : le focus va sur le groupe, selon la règle des erreurs de 0018 (« Message d'erreur et annonces »).
- **Rendu** : celui de 0018 § 10, inchangé. Le jour coché a le rendu de la pastille active de F3 (plein `line`, texte `on-line`), les pastilles passent à la ligne, et le jour complet a l'état désactivé de F3.

### 1.3 Conséquences sur F7 et sur les tests
- **C21** (`specs/F7-remplacer-ajouter-deplacer.md`) se lit désormais ainsi : « J4 choisie (`role="radio"`, `aria-checked="true"`, dans le groupe « Vers quel jour ? ») : … ; tout le parcours se fait au clavier ». Le test `déplacer: sans glisser` garde son nom et vérifie :
  - le groupe `radiogroup` nommé « Vers quel jour ? » ;
  - `aria-checked="true"` sur J4, et aucun `aria-pressed` dans le groupe ;
  - un parcours **au clavier seulement** : Tab jusqu'au groupe, flèches jusqu'à J4, Tab jusqu'à « Placer ici, vers 15:45 », Entrée. On vérifie ensuite l'aperçu du critère : « [Jardin botanique royal] : J2 13:25 → J4 15:45 », « J2 13:25 » barré, « avant : » lu.

  Aucun test existant n'est désactivé ni supprimé : F7b n'est pas codée.
- **Autres lignes de la spécification F7 à mettre à jour** par le Product Owner : l. 127 (« en mode bouton (`aria-pressed`, F7-TL-5) »), l. 139, l. 231 (F7-TL-5) et C10 (« `DayBadge` en mode bouton »), qui deviennent « groupe radio `DayBadgeGroup` ». D'ici là, **cette décision prime**, et les PR F7b et F7c la citent (nouvelle question au Product Owner, à joindre à Q110 / U2-Q3).
- **Tests à écrire par F7b**, en plus de C21 :
  - unitaires de `useRadioGroup` : arrêt de tabulation (coché, aucun, tous désactivés), flèches dans les deux axes, Début et Fin, bouclage, focus sans coche sur une option désactivée ;
  - unitaires de `DayBadgeGroup` :
    - rôle et nom du groupe ;
    - `aria-checked` ;
    - un jour complet est `aria-disabled="true"`, nommé « Jour 3, complet », et ne déclenche pas `onChange` au clic, à Espace ni aux flèches ;
    - absence d'`aria-pressed` et d'`aria-current` ;
  - tests de `SegmentedControl` **inchangés** et verts après l'extraction ;
  - axe (mêmes étiquettes WCAG 2.2 AA que les autres tests a11y) sur la feuille « Déplacer » ouverte, avec un jour complet ;
  - visuel : `/dev/composants` montre le groupe avec un jour coché, un jour non coché, un jour complet, et le focus sur un jour complet (C10 ; références par la CI, décision 0004).
- **F7c** réutilise `DayBadgeGroup` pour « Quel jour ? », sans le modifier, et ajoute ses propres tests de parcours.
- **Décision 0018** : la correction en revue dans #67 prévoit, au § 10 et dans « Gravité », une exception pour `aria-pressed` « tant que U2-Q4 est ouverte ». Elle cesse de s'appliquer quand cette décision devient définitive. Une PR F7b qui utiliserait `aria-pressed` pour le jour serait alors un écart, de gravité 3 (accessibilité) selon l'échelle de 0018. Rien n'est à modifier dans #67 : l'exception tombe d'elle-même. UX/UI pourra la retirer à sa prochaine révision de 0018.
- PR : **F7b** (`useRadioGroup`, `DayBadgeGroup`, rendu radio de `DayBadge`, C21) ; **F7c** (réutilisation).

## 2. Q116 — Marqueurs qui se chevauchent sur la carte du jour 5
### 2.1 Constat
Sur la carte du jour 5 (`src/mocks/edimbourg-carte.ts`), les étapes et le logement sont placés ainsi :
- le logement (55,949 ; −3,186), le musée national (55,947 ; −3,190) et le déjeuner de Chambers Street (55,947 ; −3,193) sont à 200 à 300 m les uns des autres ;
- la distillerie d'East Lothian est à environ 19 km à l'est, et le dîner à Leith.

Le cadrage du jour doit faire tenir la distillerie : il prend un zoom entier bas, de l'ordre de 10 à 390 px de large, où un degré vaut environ 730 px. À ce zoom :
- le musée et le déjeuner sont à environ 2 px l'un de l'autre ;
- le logement est à environ 3 px du musée.

Les pastilles de 26 px et leurs zones actives de 44 px se recouvrent presque entièrement.

Ce n'est **pas un effet de la conversion équirectangulaire** de Q96 (0016 § 2, livrée par F5b, #66). Le musée et le déjeuner ne diffèrent qu'en longitude, et la longitude a la même échelle en équirectangulaire et en Web Mercator. Google, avec son cadrage `fitBounds` au même zoom entier, montrerait le même chevauchement.

### 2.2 Décision pour la phase 0 : chevauchement accepté, sans décalage ni regroupement sur la carte simulée
- **Pas de décalage des marqueurs** (« éventail », déplacement de quelques pixels) :
  - il afficherait une étape là où elle n'est pas (principe produit 2, fiabilité) ;
  - il éloignerait la carte simulée du rendu Google, qu'elle doit refléter pour que les tests valent (0013 § 1.4).
- **Pas de regroupement propre à la carte simulée** : même raison. Le regroupement, s'il vient, est commun aux deux rendus (§ 2.4).
- **Conformité** :
  - la carte n'est jamais la seule source d'information, et la liste contient tout (handover § 11) ;
  - toucher un marqueur ne fait que faire défiler la liste jusqu'à l'étape (F4-PO-4), et chaque étape de la liste est une cible d'au moins 44 × 44 px. La fonction du marqueur est donc disponible par une autre commande de la même page, ce qui est l'exception « équivalent » du critère 2.5.8 ;
  - au clavier et au lecteur d'écran, chaque marqueur reste un bouton distinct, nommé « Étape {numéro} : {nom} », dans l'ordre des étapes. Le chevauchement ne touche que le pointeur.
- **Ordre de superposition, désormais une règle** (il complète F4, qui ne promettait rien) :
  - le marqueur sélectionné passe au-dessus de tous les autres ;
  - les étapes passent au-dessus du terminus ;
  - entre deux étapes non sélectionnées, c'est l'ordre du document qui joue : la plus tardive est au-dessus.

  Le rendu Google le fait déjà (`zIndex` 0, 1 et 2, `GoogleMapRenderer.tsx`), et la carte simulée met la sélection en `z-10`. La tâche du § 2.4 vérifie le terminus de la carte simulée et ajoute le test de cette règle.
- **Tests** :
  - aucun test n'est désactivé, assoupli ni exclu ; les tests axe gardent toutes leurs étiquettes, `wcag22aa` compris (règle `target-size`) ;
  - si axe signale un jour un chevauchement sur le jour 5, la règle n'est pas exclue : la tâche du § 2.4 est avancée ;
  - le test de F5b « cibles d'au moins 44 × 44 px » mesure la taille des cibles, pas leur recouvrement : il reste tel quel.
- **Aucun bloquant pour F5b (#66)** : la question est close sans changement de code dans #66.

### 2.3 Position de F4-Q3
Le rendu d'un groupe de marqueurs et la texture des trajets à pied restent à UX/UI (F4-Q3). Le comportement au toucher d'un groupe relève du Product Owner. La présente décision fixe seulement le mécanisme technique (§ 2.4).

### 2.4 Solution durable : regroupement à l'écran, commun aux deux rendus, dans une tâche à créer
- **Mécanisme** :
  - une fonction pure `groupMarkers(points, minDistancePx)` dans `src/components/carte/route.ts` (ou un module voisin `markers.ts`). Elle reçoit les positions des marqueurs d'étape **déjà projetées en pixels** et regroupe, de façon transitive et déterministe, ceux dont les centres sont à moins de 44 px (`--touch-target`) ;
  - chaque rendu projette dans **sa** projection, comme pour Q96 : `project` pour la carte simulée, la projection de la carte pour Google. Il n'y a qu'un algorithme de regroupement ;
  - le regroupement est recalculé à chaque changement de zoom ;
  - le terminus n'est pas regroupé (il n'est pas interactif) ;
  - le marqueur sélectionné n'est jamais caché dans un groupe : il est sorti du groupe et rendu au-dessus.
- **Bibliothèque `@googlemaps/markerclusterer` non retenue** :
  - elle est faite pour des centaines de marqueurs, alors qu'une journée en a au plus une dizaine ;
  - son algorithme ne s'appliquerait qu'au rendu Google et ferait diverger la carte simulée ;
  - ce serait une dépendance de plus.
- **Prérequis** :
  - F5b (#66) fusionnée (`offsetCamera`) ;
  - T4 fusionnée (elle modifie les imports de `route.ts`) ;
  - le rendu du marqueur de groupe et son nom accessible (UX/UI, F4-Q3) ;
  - le comportement au toucher (Product Owner ; par exemple, cadrer la carte sur le groupe).
- **Tests de cette tâche** :
  - unitaires de `groupMarkers` : seuil, groupes transitifs, ordre et clés stables, sélection sortie du groupe ;
  - e2e sur le jour 5 de la carte simulée : aucune paire de marqueurs interactifs dont les zones de 44 px se recouvrent ;
  - unitaires du rendu Google avec le chargeur simulé ;
  - test de l'ordre de superposition (§ 2.2) ;
  - axe inchangé.
- **Tâche** : nouvelle tâche frontend, « Marqueurs proches sur la carte (Q116, F4-Q3) », à créer et à placer par le CEO. Elle n'est jamais dans le même cycle qu'une tâche qui touche `src/components/carte`. Priorité basse : rien n'est bloqué en phase 0.

## 3. Q117 — Règle de revue et garde de fusion
### 3.1 Causes relevées dans l'outillage actuel
- `techlead-gate.yml` passe dès que `techlead-approved` est présent. Il **ignore `changes-requested`** : quand les deux libellés coexistent, la PR fusionne (cas de #67, et de #64 si l'UX/UI avait posé son libellé à temps).
- `techlead-approved` **survit à un nouveau push** (`synchronize`). L'événement relance la porte, qui lit encore le libellé et passe. Un head jamais relu peut donc fusionner.
- `auto-merge.yml` active la fusion automatique dès `needs-review`. GitHub fusionne dès que les vérifications obligatoires sont vertes. Rien n'attend la fin des revues spécialisées (cas de #64).
- R2 se déclenche à chaque ajout de `needs-review`. Plusieurs déclenchements sur le même head donnent plusieurs revues indépendantes, et chaque revue partielle publiée devient un verdict (cas de #67).
- Les revues ne suivent pas de liste commune. Chaque passe relit tout le texte et découvre de nouveaux points (cas de #65 et #66).

### 3.2 Décision A — Conduite de la revue (règle du Tech Lead, en vigueur dès maintenant)
Ces règles décrivent la manière dont le Tech Lead fait et conclut une revue, ce qui relève de son domaine (outillage, tests). Elles s'appliquent à toute revue qu'il conduit ou consolide, avec les sous-agents UX/UI et Sécurité quand R2 les appelle.

1. **Une seule revue consolidée par head.**
   - Elle est publiée en un seul commentaire, titré « Revue consolidée — head `<sha court>` ».
   - Elle donne le verdict de chaque rôle consulté (Tech Lead ; UX/UI si l'interface est touchée ; Sécurité si un chemin sensible l'est), puis la liste unique des points.
   - Les sous-agents ne publient rien eux-mêmes.
   - **Idempotence** : avant de publier, la revue vérifie s'il existe déjà une revue consolidée pour ce head. Si oui, elle ne publie rien et ne touche à aucun libellé.
   - Si le head a changé pendant la revue, elle ne publie pas de verdict pour l'ancien head : elle s'arrête, et le nouveau head sera relu au prochain déclenchement.
2. **Sens de `techlead-approved`.**
   - Il n'est posé que si **tous** les rôles consultés ont rendu leur verdict sur ce head, et si aucun n'a de bloquant.
   - Une revue UX/UI ou Sécurité en cours, ou absente alors qu'elle est requise, interdit le libellé.
   - Un verdict est soit `techlead-approved`, soit `changes-requested`, jamais les deux. En posant l'un, la revue retire l'autre.
3. **Gravité.**
   - **Bloquant** (`changes-requested`) : écart à un contrat, à une décision, à la spécification, ou à une règle « Jamais » de `CLAUDE.md` ; test manquant pour un critère ; CI rouge ; écart de gravité 2 ou 3 sur l'échelle de 0018.
   - **Mineur** (gravité 1, cosmétique, suggestion) : listé, il n'empêche pas l'approbation et ne demande pas de nouvelle passe. Il est traité dans la PR si l'auteur le souhaite, ou dans une tâche ultérieure.
4. **Exhaustivité dès la première passe.** La première revue d'une PR relit tout le diff et signale **tous** les bloquants visibles, en une liste numérotée qui pointe chaque fichier et chaque ligne. Une revue qui s'arrête au premier bloquant trouvé n'est pas conforme.
5. **Passes suivantes.** Une nouvelle revue relit :
   - le diff entre le dernier head relu et le nouveau ;
   - la correction de chaque bloquant de la revue précédente.

   Ce qu'elle trouve **sur du texte inchangé** depuis le head déjà relu est un **mineur**, avec la mention « relevé tardif ». Seule exception : une violation d'une règle « Jamais » de `CLAUDE.md` (données Google, secret, clé de production, fusion, production), une faille de sécurité ou un point juridique. Elle reste bloquante, avec la mention « bloquant tardif, omis à la revue du head `<sha>` », pour que le CEO la distingue dans `STATUS.md`.
6. **Libellés** : la revue n'utilise que `techlead-approved` et `changes-requested`, et laisse `needs-review` et `docs-only` en place.

### 3.3 Décision B — Garde dans `techlead-gate` (outillage, tâche à venir)
Le workflow est modifié par une tâche à venir. Il n'est pas modifié dans cette PR.

1. **Libellés contradictoires.** Si `techlead-approved` et `changes-requested` sont présents ensemble, la porte **échoue** avec le message « Libellés contradictoires : techlead-approved et changes-requested. Une revue consolidée est nécessaire. ». Une étape du même workflow retire alors `techlead-approved` (le verdict le plus prudent l'emporte) et le dit dans un commentaire. La fusion automatique reste activée, mais ne part pas tant que la porte est rouge.
2. **Approbation périmée.** Sur `synchronize` (nouveau head), la porte **échoue** pour une PR de code, même si le libellé est encore présent. Une étape retire `techlead-approved`. L'approbation vaut pour le head relu, pas pour les suivants. La porte repasse au vert quand une revue du nouveau head pose le libellé (événement `labeled`).
3. **Inchangé** :
   - les PR qui ne touchent que `STATUS.md`, `QUESTIONS.md` ou `docs/releases/` restent exemptées, comme aujourd'hui ;
   - `auto-merge.yml` et `ci.yml` ne changent pas.
4. **Tests.**
   - La décision de la porte est une fonction pure, sur l'action de l'événement, les libellés et le caractère code ou documentation. Elle est placée dans `scripts/ci/techlead-gate.mjs` et appelée par le workflow avec `node`, sans installation.
   - Elle est testée par Vitest dans `tests/unit/ci/` : toutes les combinaisons d'action (`opened`, `synchronize`, `labeled`, `unlabeled`) et de libellés, et l'exemption de documentation.
5. **Droits.**
   - Le job a besoin de `pull-requests: write` et `issues: write` pour retirer un libellé et commenter.
   - Si le jeton de la routine ne peut pas pousser un fichier de `.github/workflows/` (droit `workflows` de l'application GitHub), la tâche le signale et la question remonte à Samuel (compte externe).
6. **Documentation** : la tâche met à jour la copie de `techlead-gate.yml` dans `docs/studio/mise-en-place.md`, annexe D, et **seulement elle**. Les prompts de l'annexe B ne sont pas touchés.
7. **Tâche** : « Garde de revue dans `techlead-gate` (Q117) », rôle back-end (outillage CI), à créer et à placer par le CEO. Elle n'est jamais dans le même cycle qu'une autre tâche qui touche `.github/workflows/`. Elle est prioritaire sur les tâches de code : elle ferme un risque de fusion d'un head non relu.

**Pourquoi B ne change pas la règle de fusion.** La règle reste « CI verte + validation du Tech Lead ». B fait seulement que le libellé reflète une validation du head courant, que rien ne contredit. Un libellé périmé ou contredit n'est pas une validation. Si Samuel lit B autrement, son veto s'applique comme pour toute décision déléguée.

### 3.4 Propositions à Samuel (règles réservées, non appliquées ici)
- **P1 — Prompt R2.** Ajouter au prompt R2 :
  > Applique la règle de revue de docs/decisions/0019 § 3.2 : une seule revue consolidée par head, publiée par toi seul après les verdicts de tous les sous-agents appelés ; si une revue consolidée existe déjà pour ce head, ou si le head a changé pendant la revue, ne publie rien ; techlead-approved seulement sans aucun bloquant, et retire le libellé opposé.

  Sans P1, la décision A n'engage que le sous-agent Tech Lead : rien n'empêche l'orchestrateur R2 de publier plusieurs verdicts. La décision B empêche quand même une fusion sur des libellés contradictoires ou périmés.
- **P2 — Validation des spécialistes rendue obligatoire par la porte (facultatif).**
  - Libellés `ux-approved` et `secu-approved`, exigés par `techlead-gate` quand la PR touche l'interface ou un chemin sensible.
  - Cela change la règle de fusion (« CI verte + Tech Lead + spécialistes »).
  - **Recommandation du Tech Lead : ne pas l'adopter pour l'instant.** Le § 3.2 (point 2) avec P1 et la décision B suffisent si l'orchestrateur ne publie qu'un verdict. À reconsidérer si une PR fusionne encore avant la fin d'une revue spécialisée.
- **P3 — Décompte des 2 tentatives.**
  - Une correction demandée **seulement** par des bloquants tardifs (§ 3.2, point 5) ne compterait pas comme tentative.
  - Pour #65 et #66, qui ont épuisé leurs tentatives en partie à cause de bloquants signalés tard, Samuel pourrait accorder une tentative de plus, relue selon le § 3.2.

## Conséquences
- **F7b** : `useRadioGroup` (extrait de `SegmentedControl`), `DayBadgeGroup`, rendu radio de `DayBadge`, C21 lu comme au § 1.3, et les tests du § 1.3. **F7c** : réutilisation de `DayBadgeGroup`.
- **Décision 0016 § 8** : le mode bouton à `aria-pressed` est remplacé par le groupe radio du § 1.2. Le reste du § 8 (`ChangeSet`, `SegmentedControl`) ne change pas.
- **Décision 0018** (correction #67) : l'exception d'`aria-pressed` pour F7b tombe quand cette décision devient définitive.
- **F5b (#66)** : aucun changement demandé au titre de Q116.
- **Nouvelle tâche frontend** « Marqueurs proches sur la carte » (§ 2.4), après F5b, T4, F4-Q3 (UX/UI) et le comportement fixé par le Product Owner. Le CEO la crée et la place.
- **Nouvelle tâche back-end** « Garde de revue dans `techlead-gate` » (§ 3.3), prioritaire. Le CEO la crée et la place.
- **Revues du Tech Lead** : le § 3.2 s'applique dès la fusion de cette PR, y compris aux nouvelles passes de #26, #27, #65, #66 et #67.
- La note de version suivante liste cette décision dans « Décisions prises par le studio ».

## Nouvelles questions
- **Samuel** (règles du studio) :
  - P1, modification du prompt R2 (§ 3.4). Bloque : l'application de la règle de revue par l'orchestrateur R2 ; ne bloque pas la tâche du § 3.3 ;
  - P2, validations spécialisées exigées par la porte (§ 3.4). Le Tech Lead recommande de ne pas l'adopter pour l'instant. Bloque : rien ;
  - P3, décompte des 2 tentatives quand une correction n'est due qu'à des bloquants tardifs, et tentative supplémentaire pour #65 et #66 (§ 3.4). Bloque : la reprise de #65 et #66.
- **Product Owner** : mettre `specs/F7-remplacer-ajouter-deplacer.md` en accord avec le § 1 (l. 127, 139, 231, C10 et C21 : groupe radio `DayBadgeGroup` au lieu d'`aria-pressed`). À joindre à Q110 / U2-Q3. Bloque : rien, la décision prime d'ici là.
- **Product Owner** : comportement au toucher d'un groupe de marqueurs (§ 2.3). Bloque : la tâche « Marqueurs proches sur la carte ».
- **UX/UI** (complète F4-Q3) : rendu et nom accessible du marqueur de groupe (§ 2.3). Bloque : la même tâche.
- **CEO** : créer et placer les tâches « Garde de revue dans `techlead-gate` » (prioritaire) et « Marqueurs proches sur la carte » (priorité basse). Bloque : leurs tickets.

## Questions liées
- **Q110 / U2-Q3** (Product Owner) : mise à jour des spécifications F7 et F8 d'après 0018. La première question au Product Owner ci-dessus s'y ajoute.
- **F4-Q3** (UX/UI) : texture des trajets à pied et marqueurs proches. Elle reste ouverte pour le rendu.
- **Q43** (Samuel) : 3e tentative pour #26 et #27. P3 en propose une règle générale.
