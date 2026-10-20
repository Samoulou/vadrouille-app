# État du studio — 2026-10-20 (121e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 19 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-20 20:16 et 20:17 UTC : nettoyage de la base d'essai fait par Samuel dans l'éditeur Neon (premier passage annulé : la table `run_secteurs` n'existe pas encore ; second passage réussi, 5 voyages effacés ; historique des essais, compteur de dépenses et positions gardés).
- 2026-10-20 20:18 UTC : « 592 est merge » : page d'essai à jour (temps relus conservés).
- 2026-10-20 21:11 UTC : « J'ai lancé un Rome mais j'ai rien dans mes voyages ». Journal : recherche finie à 21:08 avec 4 lieux seulement (13 réponses de l'IA écartées par le contrôle de format), puis plus aucun journal ; état de l'essai demandé à Samuel. « L'app ne s'ouvre plus » : l'appli répond (accueil et « Mes voyages » vides après le nettoyage).
- 2026-10-20 21:33 UTC : « Je suis tes recos, en plus ok enlève les contraintes de taille trop longue ». Décision de Samuel : un texte trop long est coupé, un détail facultatif invalide est retiré, le lieu est gardé ; restent stricts les champs obligatoires, les listes, les dates, les URL et caractères interdits. Écrite dans 0111 (#597).

## Fait
- Fusionnées : **B9e** (#588, branchement du parcours sur préversion ; écran 5 sans « Page introuvable » ; décision 0110), **B9c-graphe** (#594), report `main` → `p0-reel` (#592), note de version (#596), statut du 120e cycle (#591).
- **Base d'essai vidée** par Samuel.

## En cours
- ia-recherche : **lieux gardés malgré un détail fautif** (#597, décision 0111), correction 1 (expressions régulières linéaires, 0111 complétée).
- product-owner : **spécification B10** (#586), correction 2 (dernière).
- backend : **B9d** (voyage complet après déblocage).

## Bloqué
- **Migration 0013** (#593) : approuvée par le Tech Lead ; `owner-approved` de Samuel, puis `db-migrate` par Samuel (fusions gelées pendant le lancement).
- **Relance de Rome** : après #597 et son report vers `p0-reel`.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. #597 jusqu'à la fusion, puis report vers `p0-reel` et relance de Rome par Samuel.
2. B9d ; spécification B10 puis B10a.
3. Samuel : `owner-approved` sur #593 puis `db-migrate` ; Q538, Q542 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529.

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
- Q544 à Q546.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
