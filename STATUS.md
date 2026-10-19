# État du studio — 2026-10-18 (103e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 1 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 21:20 UTC (fil « Coûts, requêtes et liberté de tester ») : régler coûts et requêtes ; plus aucun appel Google ni IA une fois l'analyse faite ; le rendu Rome s'améliore, mais Vatican et Trastevere le même jour ; fin des délais de veto et des attentes.
- 21:27 UTC : réponses aux 7 questions : 1 « Plus de délais » ; 2 « Les essais je gère moi les couts ok garde juste ma règle qui dit que je suis le seul a tester sur les quotas » ; 3 on stocke le résultat, « revoir peut-être ça avant la mise en prod » ; 4 3000 trajets par jour dans sa console, et surtout optimiser ; 5 seul fusible 2 USD ; 6 « Automatique » ; 7 « On supprime de la base d'essaie ». Décision 0093 (#512, en correction).
- 21:32 UTC : carte « IA 2 USD » (seul fusible : 2 USD d'IA par essai) ; « Ok optimisations d'abord » (pas d'OpenStreetMap pour l'instant).
- 21:35 UTC : priorités des 20 prochains cycles : (1) l'app branchée de bout en bout, (2) ses tests fonctionnels et l'itération sur les règles, (3) l'optimisation (requêtes, temps d'analyse). Feuille de route refaite (`/mnt/project-files/plans/roadmap-20-cycles.md`, cycles 103 à 122).
- #studio : aucun message nouveau de Samuel.

## Fait
- Fusionnées : statut du 102e cycle (#510), note de version v2026.10.18-21 (#513).

## En cours
- tech-lead : **0092** (#504), correction des bloquants tardifs (non comptée) : 0032 l.33 et `specs/P0-prototype-recherche.md` l.78 dans la liste « Amende », deux mineures.
- **0093** (#512, fil « Coûts, requêtes et liberté de tester ») : changements demandés (citer les 7 questions, confirmation écrite de Samuel pour les points 6 et 7, verdict Sécurité sur le point 7, lien avec 0092 pour le point 3) ; corrigée par ce fil.
- backend : **B9b** (#514), création du voyage et état de génération (priorité 1 de Samuel).
- tech-lead : décision des lots 2 à 4 de l'amendement 3 (`CandidatSchema`, découpage, retour Vatican et Trastevere).
- #509 (contrat des durées nullables) et #507 (code de 0092) : `needs-review` après la fusion de #504, dans cet ordre.

## Bloqué
- **Affichage des voyages sur `p0-reel`** : #504 → #509 → #507 → migration 0011 (`owner-approved` de Samuel, sauf si 0093 point 7 est fusionné avant) → report `main` → `p0-reel`.
- **Tâches A, B et C de 0093** (fusible unique et décompte ; optimisation des trajets après #507 ; `p0-reel` automatique et migrations d'essai) : après la fusion de #512.
- **B4a**, **B8b** et **B9a** : jamais dans le même cycle que B9b (0078, spécification B9).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9c réel** : Q468 ; B9d : verdict Sécurité (Q492) ; B9e : Q467.
- **Purge du MVP** : activation Q438 (Samuel).
- **`coords-purge`** en échec : ticket à ouvrir.

## Prochain cycle
1. Fusion de #504 puis #509 puis #507 ; fusion de #512 puis tâches A et C de 0093.
2. Suite de B9b, puis B9c (aperçu).
3. Tickets des lots 2 à 4 de l'amendement 3 après la décision du Tech Lead.
4. Samuel peut ouvrir son voyage Rome une seule fois après ~07:00 UTC.
5. Tickets à placer : `coords-purge`, tests instables sous charge, commit affiché sur la page d'essai, police locale (Q484), compteurs de fin d'essai (Q493).

## Décisions attendues de Samuel
- **Réponses demandées** : confirmation écrite sur #512 des points 6 et 7 de 0093 (demandée par la revue) ; Q502 (exécution de 16:57 UTC) et Q497 (exécution du matin), sans effet si 0093 est fusionnée.
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
- Aucune ; Q500 et Q501 répondues.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
