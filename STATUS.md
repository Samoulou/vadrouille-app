# État du studio — 2026-10-14 (68e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 67e cycle (fini à 22:51 CEST), ni dans le projet ni dans #studio. Le clic `owner-approved` sur #332 reste attendu.

## Fait
- Fusionnée : statut du 67e cycle (#342).
- **Décision 0060** (#336) : le Tech Lead approuve ; la Sécurité garde un bloquant (la purge manuelle de repli, sous le propriétaire de l'intégration, échouerait faute de droit d'exécution). Correction comptée : **correction 2, la dernière**, lancée (Tech Lead).
- **P0r3c-3** (#326) : la revue de la troisième tentative n'avait jamais démarré (libellé `needs-review` resté du push précédent, pas reposé après f06449c). Libellé basculé à 23:10 CEST ; revue relancée.

## En cours
- **Code de 0062** (#341, back).
- **Décision 0060** (#336) : correction 2, dernière (Tech Lead). Si elle reste bloquée : le CEO et le Tech Lead choisissent une troisième tentative ou un découpage.
- En revue : #326 (P0r3c-3, troisième tentative bornée), #332 (approuvé par le Tech Lead, attend `owner-approved`).

## Bloqué
- **Premier essai réel** : P0r3c-3 (#326), puis P0r3c-4 ; code de 0062 et avis de la Sécurité (Q444), nouvelle mise à jour de `p0-reel` par Samuel et nouveau relevé ; P0r3d.
- **Workflow des migrations** : `owner-approved` de Samuel ; Q387 (a) et (b).
- **Purge `p0-purge`** : en échec toutes les 6 heures (cause non relevée ; secrets vides probables, Q387).
- **B8c** : fusion de 0060 ; cycles séparés (Q445). **B6a** : B3b. **B8a** : B7a, B7c, P0r3c-3. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Après #341 : lien à Samuel pour remettre `p0-reel` à jour, puis relevé de la section 8 de 0062.
2. Après #326 : P0r3c-4 (avec l'amendement de 0055 § 7 pour le flux Exa accepté) ; si #326 est encore bloquée : découpage.
3. Après 0060 : ticket de B8c (data), seul de son lot (Q445) ; mise à jour de `docs/roadmap.md` (Q431).

## Décisions attendues de Samuel
- **Clic demandé** : libellé `owner-approved` sur #332 (workflow des migrations), demandé dans le fil du cycle à 22:25 CEST.
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
- Aucune.

## Part d'usage estimée
- 68e cycle (routine) : sous-agents terminés : aucun ; lancé : correction 2 de 0060 ; 2 en même temps.
- En cours, comptés au 69e cycle : code de 0062 (#341), correction 2 de 0060.
