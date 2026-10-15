# État du studio — 2026-10-15 (71e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- #studio et fil du cycle : aucun nouveau message depuis le 70e cycle (dernier : 2026-10-14, 23:52 CEST).

## Fait
- Fusionnés depuis le 70e cycle : **P0r3c-5a** (#350), statut du 70e cycle (#351), **P0r3c-5** (#353 : étape finale de `p0Run`, notation, garde d'idempotence et échéance par étape).
- Ouvertes et relues : **brief d'essai court** (#356, ticket #355 : Édimbourg, 2 jours ; fiches 14, candidats 12, Text Search 17) et **P0r3d** (#357, ticket #354 : page de lancement et rapport de l'essai). CI verte sur les deux (`verify`, `db`, `docker`).
- Revues consolidées : changements demandés sur les deux (correction 1, comptée). #356 : un bloquant documentaire (réserve Google de l'essai 0,88 USD, et non 0,82). #357 : Sécurité approuve ; Tech Lead (critères A7 et A8, amendement « P0r3d » de 0063) et UX/UI (libellés lisibles, annonces d'accessibilité, boutons de choix) demandent des corrections.

## En cours
- Correction 1 de #356 et de #357 (deux fils).

## Bloqué
- **Premier essai réel** : fusion de #356 et #357, puis une petite PR qui passe `P0RUN_COMPLET` à vrai ; mise à jour de `p0-reel` par Samuel (#347), puis relevé de la section 8 de 0062 et contrôle humain de 0063 § 8 sur sa préversion ; déverrouillage S8 et ouverture de la base d'essai (0052, 0056) ; Q268, Q325, Q368 ; accord écrit de Samuel (0055).
- **Purge `p0-purge`** : en échec toutes les 6 heures (cause non relevée ; secrets vides probables, Q387).
- **B8c** : cycles séparés (Q445), après le premier essai. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel (engagement du 69e cycle).
2. Après la correction 1 : nouvelle revue de #356 puis de #357 ; #356 d'abord (conflit attendu, trivial, dans `p0-run.ts`).
3. Après les deux fusions : PR « `P0RUN_COMPLET` à vrai ». Après le clic de Samuel sur #347 : relevé de la section 8 de 0062.

## Décisions attendues de Samuel
- **Clic demandé** : fusionner #347 (mise à jour de `p0-reel` depuis `main`), demandé dans le fil du cycle.
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307) ; Q387 (a) et (b).
- **Déjà posées** : Q409, Q410, Q401, Q397, Q394, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q451 (Tech Lead et Sécurité : validations demandées par P0r3d, #357), répondue par la revue du 2026-10-15 02:39 UTC, sauf A7 et A8 (règle corrigée) et l'échec de démarrage (à consigner dans l'amendement).

## Part d'usage estimée
- 71e cycle (routine) : sous-agents terminés depuis le 70e : P0r3c-5, brief d'essai court, P0r3d ; 2 en cours (corrections 1 de #356 et #357).
