# État du studio — 2026-10-21 (125e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-21 05:26 à 05:52 UTC (fil « Routine cycle du studio ») : Samuel, déçu du dernier essai de Rome (pas de repas, journées finies à 15 h, pas de Trevi), **décide d'inverser la génération du prototype** : « Oui on va inverser, qui peut le plus qui peut le moins on laisse la liberté et on restreindra au besoin » (05:47), confirme que l'IA reçoit toutes les saisies du questionnaire (05:51), donne le feu vert au plan (05:52 : « Ok go tu peux lancer le plan »). Décision 0115 (#623). Son plan Édimbourg (PDF) rejoint `/mnt/project-files/essai-reel/exemples/`.

## Fait
- Décision de Samuel écrite : **0115** (l'IA écrit le programme complet, le code vérifie chaque lieu sur Google) et spécification `specs/P0-programme-par-ia.md` (#623, en correction 1) ; **0116** réponses du Tech Lead T1 à T7 (#628, en correction 1) ; **0117** verdicts de la Sécurité S1 à S4 (#627, correction 1 à venir). Ordre de fusion : #623, #628, #627.
- Gelée : #500 (amendement 3 de P0-suite-2) ; les questions 3 à 5 de cet amendement sont sans objet pour le prototype.
- Statut du 124e cycle (#617).

## En cours
- ia-recherche : **premier lot de la chaîne inversée** (prototype `p0Run` : prompt `programme`, vérification Google lieu par lieu, trajets, écriture), code.
- frontend : **lot 1 bis** : `tip`, `priceNote`, `hoursNote` et `Day.theme` dans les contrats et à l'écran.
- product-owner : #623 correction 1 ; tech-lead : #628 correction 1 ; puis sécurité : #627 correction 1.
- En attente d'un fil libre (au plus 4) : B10a #621 correction 1 (Tech Lead et UX/UI), #611 correction 2 (dernière), #613 correction 2 (dernière).

## Bloqué
- **Confirmation de Samuel (Q557)** : texte libre et logement envoyés au fournisseur de modèles hors UE pour écrire le programme (sa demande du 05:51 UTC ; d'ici là, briefs d'essai commités seulement).
- **Migrations 0013 et 0014 sur la base d'essai** : #593 puis #620 (approuvées par le Tech Lead) attendent l'`owner-approved` de Samuel ; puis un seul `db-migrate` par Samuel (fusions gelées pendant le lancement).
- **Longs voyages aux jours vides** (#609) : après #611 ; mécanisme à revoir si le MVP est inversé à son tour.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. Fusionner 0115, 0116, 0117 ; premier lot et lot 1 bis jusqu'à la revue ; puis report `main` → `p0-reel` pour que Samuel relance Rome sur la chaîne inversée.
2. Reprendre B10a #621, #611 et #613 dès qu'un fil se libère.
3. Samuel : Q557 (oui/non) ; `owner-approved` sur #593 puis #620 ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529.

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
- Q557 à Q563.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
