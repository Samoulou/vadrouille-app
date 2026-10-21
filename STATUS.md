# État du studio — 2026-10-21 (126e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-21 06:49 UTC (fil « Routine cycle du studio ») : « Oui » à Q557 : le texte libre et le logement saisis partent au fournisseur de modèles (hors UE, requête `programme` en `zdr` et `data_collection: "deny"`, 0117 S5). Q557 répondue ; 0115 § 2 le cite.

## Fait
- Fusionnées : **0115** et la spécification `specs/P0-programme-par-ia.md` (#623, après deux corrections) ; **0117** verdicts de la Sécurité S1 à S5 (#627) ; **0113 § 3 bis** part Text Search de l'étape `e` (#613) ; #611 aperçu à deux villes sans logement.
- **0116** (#628) : trois revues bloquantes, toutes sur T8 (relecture des horaires à l'affichage) → découpage décidé par le CEO et le Tech Lead : T8 sort du lot 1 et ira dans la **décision 0118** (Tech Lead et Sécurité, après la question de coût à Samuel, Q564) ; troisième tentative de #628 en revue.
- **Premier lot de la chaîne inversée** livré : PR #632 (ia-recherche, Closes #624 ; `needs-review` posée dès que 0116 est fusionnée). **Lot 1 bis** livré : PR #631 (frontend, `tip`, `priceNote`, `hoursNote`, `Day.theme`, composant d'infos pratiques), en correction 1.
- Vérification faite par le CEO : le modèle `deepseek/deepseek-v4.1-flash` dispose de fournisseurs ZDR sur OpenRouter (33 points de terminaison, liste publique) ; aucune question à Samuel.
- Statut du 125e cycle (#630).

## En cours
- tech-lead : #628 0116, troisième tentative (découpage T8 → 0118) en revue ; si encore bloquée, nouveau découpage ou remontée à Samuel.
- frontend : #631 lot 1 bis, correction 1 (formes d'URL, `texte.test.ts`, restriction de `SharedStopSchema.facts`, mention UX).
- backend : B10a #621, correction 2 (dernière : garder la feuille ouverte au refus) ; #609 (jour vide du voyage complet sans signal → `cap_reached`, fiches de `e` par ville positionnée), code.
- Après la fusion de #628, #632 et #631 : petite PR ia pour remplir `tip`, `priceNote`, `hoursNote`, `theme` ; puis **report `main` → `p0-reel`** pour que Samuel relance Rome sur la chaîne inversée.

## Bloqué
- **Migrations 0013 et 0014 sur la base d'essai** : #593 puis #620 (approuvées par le Tech Lead) attendent l'`owner-approved` de Samuel ; puis un seul `db-migrate` par Samuel (fusions gelées pendant le lancement).
- **Badge « fermé ce jour-là » à l'affichage** (T8, future 0118) : Q564 à Samuel (coût d'une fiche par lieu et par journée affichée) ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. Fusionner 0116 (#628), puis #632 et #631 ; PR ia de remplissage des infos pratiques ; report `main` → `p0-reel` ; prévenir Samuel pour relancer Rome.
2. Finir B10a #621 et #609 ; chore CEO : préfixe `[po]` dans `CLAUDE.md` et renvoi vers 0115 dans `docs/CONTEXT.md`.
3. Samuel : `owner-approved` sur #593 puis #620 ; Q564 (facultative avant l'essai) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 à Q561.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (fait : 0011 et 0012 appliquées le 2026-10-20), fusion de #580 (`main` → `p0-reel`), Q525 (réserve Google et plafonds Places de la tâche A2), Q527 (barrière des appels réels de l'aperçu), Q529 (option (a) de la question 4 de 0102, refusée par la Sécurité sans amendement de S4), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060) ; B8c est fusionnée, la purge attend cette réponse pour être activée.
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q345, Q332, Q323, Q317, Q296, Q297, Q288, P0c-Q2.
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256).
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO de la spec B4 (#248) ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ; décisions B7-PO de la spec B7 (#288) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, 0057, 0058, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q564 à Q570. Q557 répondue par Samuel (« Oui », 06:49 UTC) ; Q562 répondue par la Sécurité (oui, 0117 correction 1).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
