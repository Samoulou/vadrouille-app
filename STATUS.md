# État du studio — 2026-10-16 (84e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-16 : 06:58 UTC « prêt à tout faire aujourd'hui » ; 07:09–07:12 UTC relevé S7 dans la console Neon (captures, fenêtre de restauration 6 h) → Q456 close ; 07:25 UTC « test fait » (commit `2eb88f7` sur #381, posé par sa session Claude) → Q457 close ; 08:45 UTC limites de dépense posées → Q325 close ; 08:49 UTC `owner-approved` sur #381 ; 08:58 UTC accord écrit « j'autorise le premier essaie réel » (0055:146) ; 09:02 UTC rapport du premier essai réel (Q460).

## Fait
- Condition 3 de 0056 § 4.1 remplie (Sécurité, #374 c6210191396).
- #381 (A17, migration 0006) : CI verte, revue Tech Lead et Sécurité approuvée sans bloquant, signalement dans #studio, `owner-approved`, **fusionnée** (08:50 UTC).
- A18 : `db-migrate` run 38876502011 (08:51 UTC), 0006 appliquée, empreinte conforme ; `p0-purge` non relancé (dernier succès 04:32 UTC, moins de 12 h).
- A19 : `db-releve` run 38876787144 (08:54 UTC), verdict favorable (#374 c6211870156) : `EXECUTE` à `vadrouille_prototype` seul.
- A20 : liste « tout est vert » envoyée ; accord écrit de Samuel reçu (08:58 UTC).
- **Premier essai réel lancé par Samuel** (~09:00 UTC, `p0-reel` `d61e9fa`) : arrêté, `pipeline_failed`, A1 à A6 non, modèle appelé, aucun appel Google (Q460).

## En cours
- ia-recherche : diagnostic en lecture seule de l'arrêt du premier essai (`/mnt/project-files/essai-reel/diagnostic-essai-1.md`) ; aucun nouvel essai avant correctif.

## Bloqué
- **Deuxième essai réel** : cause de `pipeline_failed` (Q460), correctif, puis mise à jour de `p0-reel` si le code change.
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel : correctif de la cause de `pipeline_failed`, puis relance par Samuel seul.
2. Purge : la surveiller (seuil de 18 h entre deux succès, sinon reverrouillage § 4.6).
3. Ticket P0r4 à ouvrir avant P0a2 ; mineurs 12 et 13 de #384, mineurs de #383 et #381 (ligne « Brouillon » de la description, test D15 point 6) dans un chore.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q325, Q456 et Q457 closes).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q460.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
