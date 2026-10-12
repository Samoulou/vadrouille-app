# 0025 — Décisions du Tech Lead : choix de F5c (TL-1 à TL-4) et marge du dépassement connu de R6

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-14) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-12 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #133

Numérotation : 0024 est la dernière décision de `main` (`c03bd85`) ; 0011 reste réservé par #27. 0025 est le prochain numéro libre.

## Contexte
F5c (#128, branche `claude/127-f5c-sejour`, fusionnée dans `main` le 2026-10-11 à 22:53 UTC, head `12edfd3`) a soumis quatre choix au Tech Lead (F5c-Q1, TL-1 à TL-4). La revue du 2026-10-11 à 21:55 UTC les a confirmés, avec deux corrections (M1 pour TL-2, M2 pour TL-3), faites ensuite. La revue du 22:53 UTC a constaté ces corrections et approuvé la PR. Les deux revues demandent de consigner ces choix dans `docs/decisions/` par une PR de documentation séparée (**Q223**). Cette décision les écrit.

Elle tranche aussi **Q224** (F5c-Q3) : la règle de 0024 § 1, « le dépassement de R6 ne doit pas augmenter », s'oppose à toute PR qui ajoute du texte à `src/i18n/fr.json`.

Le code décrit est celui de `main` à `c03bd85`. Cette décision ne modifie aucun code.

**Argent, comptes, données** : rien. Aucun service, aucun compte, aucune donnée personnelle. `checklist_item_done` n'a aucune propriété (0015 § 6).

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : non concerné. Il s'agit du découpage du JavaScript client, d'un état d'interface en mémoire et de l'outillage de mesure.

**Règles Google** : inchangées. Aucune donnée Google n'est lue, stockée ou affichée par ces choix.

## Décisions — F5c (Q223)

### 1. TL-1 — Un module importé par une mise en page n'importe le contenu d'aucun écran
**Confirmé.** `src/features/sejour/screens.tsx` (importé par `voyages/[id]/(programme)/layout.tsx` et sa page de développement) ne garde que la mise en page partagée (`TripLayout`) et les métadonnées. Chaque page importe le contenu de son écran : `screen-sejour.tsx` pour le Séjour, `screen-journee.tsx` pour la Journée.

- **Règle générale** : un module importé par un `layout.tsx` n'importe le contenu d'aucun écran, directement ou par un module intermédiaire. Sinon le JavaScript d'un écran est chargé par toutes les pages de la mise en page : celui du Séjour (mesure comprise) par la Journée, et l'inverse (handover § 14, 0016 § 3, 0022 § 4).
- **Point de revue** : toute PR qui ajoute un import à un module de mise en page (`screens.tsx` ou un équivalent d'une autre fonctionnalité) vérifie qu'il ne tire pas le contenu d'un écran.
- **Pas de règle de lint** pour l'instant : la frontière entre « mise en page » et « écran » n'est pas encore un motif de chemin stable. Le budget de JavaScript par route (0022 § 4, 0024) détecte la violation.

### 2. TL-2 — Mesure chargée au premier événement (`createLazyTrack`)
**Confirmé, avec la correction M1 (faite à `a6d67cd`).** `src/analytics/lazy.ts` exporte `createLazyTrack` : le module `track` (validation en `zod/mini`, 0013 § 3.3, 0016 § 3.1 règle 3) n'est importé qu'au premier événement, puis réutilisé. Le Séjour l'utilise pour `checklist_item_done`. Sans cela, R11 mesurait 207 319 octets, au-dessus du seuil.

- **Même contrat que `createTracker`** : même schéma strict, même enregistreur, mêmes erreurs hors production. Un événement invalide reste refusé ; seul le moment du chargement change.
- **Échec du chargement (M1)** : la promesse de l'appel est rejetée et la mémoire du chargement est vidée ; l'appel suivant retente l'import. L'appelant traite le rejet par un `.catch` explicite et commenté (`SejourPanel.tsx`). Un test injecte le chargeur (`TrackModuleLoader`) et vérifie la reprise.
- **Quand l'utiliser** : pour un événement qui suit une action de la personne et n'est pas émis au premier rendu, sur un écran dont le budget de JavaScript initial le demande. `createTracker` reste le choix par défaut. Un événement émis à l'affichage n'y gagne rien.
- **Pas de doublon** : tout chargement différé de la mesure passe par `createLazyTrack`. Un second mécanisme demande un amendement.

### 3. TL-3 — `ChecklistRow` sans directive `"use client"`
**Confirmé, avec la condition M2 (faite à `a6d67cd`).** `src/components/ligne/ChecklistRow.tsx` n'a ni état ni effet. Il est exporté par l'index de `components/ligne`, que `src/app/not-found.tsx` (composant serveur) importe. Avec la directive, il deviendrait une référence client de toutes les pages qui passent par cet index : +4,9 Ko gzip mesurés sur l'accueil.

- **Condition M2** : l'absence de directive est documentée dans le commentaire du composant (fait). Il reste rendu côté client par les écrans qui l'importent et lui passent `onToggle` ; il ne s'utilise pas depuis un composant serveur.
- **Règle pour les composants de Ligne** : un composant sans état ni effet, exporté par l'index et rendu seulement par des composants clients, ne porte pas la directive. Son commentaire le dit et en donne la raison.
- **Imports depuis le serveur** : l'import par l'index de `components/ligne` n'est pas interdit pour l'instant. Dans `src/app/**` et les modules serveur, le code **nouveau** importe le composant précis (`@/components/ligne/Nom`) et non l'index. C'est un point de revue. Si une autre directive ajoutée à un composant de l'index refait grossir l'accueil, le Tech Lead en fera une règle de lint.

### 4. TL-4 — `SejourOrigin` : retour du focus sur la ligne d'origine
**Confirmé.** `src/features/sejour/SejourOrigin.tsx` donne F5-PO-8 : après « Pendant ton séjour » → fiche → retour du navigateur, le focus revient sur la ligne d'origine.

- **Forme** : un contexte React monté par `TripLayout`, donc conservé entre les pages du voyage. La mémoire est un `ref`, **en mémoire seulement** : ni `sessionStorage`, ni adresse, ni serveur. La ligne n'est rendue qu'après un retour par l'historique (`popstate`) ; revenir par l'onglet « Séjour » ne déplace pas le focus. `take()` vide la mémoire dans tous les cas.
- **Limite connue (M3, acceptée)** : après une navigation ailleurs puis un retour par l'historique, l'origine retenue peut être périmée. Au pire, le focus va sur une ligne qui existe encore dans le Séjour. C'est inoffensif ; aucune correction n'est demandée.
- **Pas de doublon** : un futur besoin de même nature (retour du focus après une navigation dans le voyage) étend ce contexte ou le généralise. Il n'en crée pas un second.

## Décision — marge du dépassement connu (Q224)

### 5. Le plafond de `knownExceedance` porte une marge de 2 % sur la mesure de référence — amende 0024 § 1
**Constat.** `src/i18n/fr.json` est chargé en entier par le client (0016 § 3.1 règle 6) : environ 20 Ko, soit environ 6 Ko gzip à `c03bd85`. Chaque texte ajouté par une PR, même pour un autre écran, grossit le JavaScript initial de toutes les routes, R6 comprise. 0024 § 1 permet d'abaisser le plafond de R6 « à sa nouvelle mesure ». Un plafond posé exactement sur une mesure fait donc échouer la PR suivante qui ajoute quelques mots, sans que R6 ait changé. Aujourd'hui, R6 mesure 210 954 octets (CI de #128, run 38181670888) pour un plafond de 219 305 octets : l'écart d'environ 8 Ko vient de F12a et n'est pas une marge voulue.

**Décision : une marge de 2 %, inscrite dans la valeur, sans découper `fr.json`.**
- **Calcul.** Quand une PR fixe ou abaisse `knownExceedance.javascriptBytes`, elle écrit `min(plafond actuel, ⌈mesure × 1,02⌉)`, la mesure étant celle de la CI de cette PR. Elle n'écrit jamais la mesure seule.
- **Pourquoi 2 %.** Sur environ 210 000 octets, 2 % font environ 4 200 octets gzip, soit à peu près deux tiers de `fr.json` compressé. C'est assez pour plusieurs écrans de texte et pour les petites variations de la construction. C'est peu face aux 10 000 octets qui séparent R6 du seuil : la marge ne peut pas masquer une régression de code.
- **Test inchangé.** `tests/e2e/budget.e2e.spec.ts` compare toujours la mesure à `javascriptBytes` (`≤`). La marge est dans la donnée de `tests/e2e/routes.ts`, qui reste lisible et vérifiable. Aucune constante de marge n'entre dans le code.
- **Plafond toujours non croissant.** 219 305 octets reste le maximum. La marge ne sert jamais à relever le plafond : relever demande une décision écrite (0024 § 1). Abaisser reste permis, pas obligatoire.
- **Le seuil ne bouge pas.** 200 000 octets, strict. La marge ne vaut que pour le plafond d'un dépassement connu. R11 et R12, qui n'ont pas de `knownExceedance`, n'ont aucune marge : leur écart au seuil (environ 13 Ko à F5c) en tient lieu.
- **Durée.** La règle ne vaut que tant qu'une entrée de `ROUTES` porte `knownExceedance`. Quand T14 retire celui de R6, elle n'a plus d'objet. Si un amendement accorde un jour un dépassement connu à une autre entrée, son plafond suit ce même calcul.
- **Texte de `reason`.** Il donne la mesure de référence et renvoie à 0024 § 1 et à ce § 5. Exemple : « Mesure de référence : 210 954 o gzip (CI de #128) ; plafond avec marge de 2 % (0024 § 1, 0025 § 5). »
- **Découpage de `fr.json` : écarté pour Q224.** Il traiterait la croissance du texte pour toutes les routes, mais c'est un changement d'architecture des messages (0016 § 3.1 règle 6) hors de proportion avec un plafond transitoire. Si la croissance de `fr.json` menace un jour R11 ou R12, le Tech Lead le rouvrira par une décision.

**Cohérence avec T14 (#132, en cours en parallèle).**
- **T14 réussit** (R6 < 200 000 octets) : elle retire `knownExceedance` comme prévu par 0024 § 1. Ce § 5 ne s'applique pas.
- **T14 échoue** : elle écrit le plafond selon le calcul ci-dessus, remplace la `reason` (renvoi à 0024 § 1 et à ce § 5), et donne la mesure par script, comme 0024 § 1 le demande. Le Tech Lead tranche alors par un amendement. F12d ne fusionne pas sans lui (inchangé).
- **D'ici la fusion de T14**, le plafond de 219 305 octets reste en place. Aucune PR n'a besoin de le changer.

## Conséquences
- **0024 § 1** est amendé par le § 5 : « abaisser à sa nouvelle mesure » devient « abaisser à `min(plafond actuel, ⌈mesure × 1,02⌉)` ». Le reste de 0024 § 1 est inchangé : seuil de 200 000 octets, plafond non croissant, sortie obligatoire sous le seuil, champ réservé, T14 avant F12d.
- **0016 § 3.1 règle 6** (`fr.json` non découpé) est confirmée.
- **#128** n'a rien à changer : elle était conforme aux § 1 à § 4 à sa fusion.
- **T14** (#132) : applique le § 5 seulement si `knownExceedance` reste à sa fusion.
- **Revue** : le Tech Lead vérifie le § 1 sur toute PR qui touche un module de mise en page, le § 3 sur les imports serveur des composants de Ligne, et le § 5 sur toute PR qui modifie `knownExceedance`.

## Questions liées
- **Q223** (Tech Lead) : **tranchée** par les § 1 à § 4.
- **Q224** (Tech Lead) : **tranchée** par le § 5.

**Nouvelles questions** : aucune.
