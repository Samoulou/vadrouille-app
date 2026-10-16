# État du studio — 2026-10-16 (81e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- GitHub, 2026-10-15 : 21:27 UTC, commentaire sur #374 « Je lève le délais 6h 0066-0067 » (Q455) ; 21:28 UTC, commentaire sur #383 « Je confirme l'amendement du verrou p0r4 » (Q459).
- Fil du cycle : 21:30 UTC, « J'ai fait mes tâches » → vérifié : les deux phrases sont là ; ni relevé Neon ni tests sur #381 encore. 22:04 UTC, « je fais demain, j'avais pas d'ordi » → relevé S7 (Q456) et tests de `tests/db/` (Q457) attendus le 2026-10-16.
- #studio : aucun nouveau message.

## Fait
- **Conditions 1 et 4 de 0056 § 4.1 déclarées remplies** par la Sécurité sur #374 (commentaire 6202733687, 21:32 UTC), sur la base du commentaire de Samuel et du relevé A16. Liste de contrôle de l'essai mise à jour : l'essai d'intégration n'attend plus P0r4 (Q459) ; P0r4 reste exigée avant P0a2.
- `p0-purge` réussi à 21:23 UTC (condition 5 tenue jusqu'à 09:23 UTC le 2026-10-16).
- Fusionnés depuis le 80e cycle : #386 (état du 80e cycle), #387 (note de version v2026.10.15-21).

## En cours
- Aucun agent. data : A17, #381 en brouillon, attend les tests de `tests/db/` posés par Samuel (Q457).

## Bloqué
- **Premier essai réel** (lancé par Samuel seul) : relevé S7 dans la console Neon (Q456, condition 3), tests de `tests/db/` (Q457), revue de #381 puis `owner-approved`, `p0-purge` de moins de 12 heures puis application (A18) et relevé (A19) ; limites de dépense (Q325) ; accord écrit de Samuel (0055).
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel.
2. Dès le relevé Neon : la Sécurité le consigne (condition 3). Dès les tests sur #381 : CI, sortie du brouillon, revue.
3. Avant A18 : relancer `p0-purge` si le dernier succès a plus de 12 heures.
4. Ticket P0r4 à ouvrir avant P0a2 ; mineurs 12 et 13 de #384 et mineurs de #383 dans un chore.

## Décisions attendues de Samuel
- **Réponses demandées** : Q456 (relevé S7 dans la console Neon), Q457 (tests de `tests/db/` pour #381). Bientôt : Q325 (limites de dépense).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Aucune.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
