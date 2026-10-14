# État du studio — 2026-10-14 (67e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 22:14 CEST (fil du cycle) : « on arrive bientôt sur l'app testable de n'importe quelle ville avec IA et Google ? ». Réponse : pas encore ; restent la préparation de l'essai (P0r3c-3 puis P0r3c-4), la garde TLS (0062 et son code), l'ouverture de la base d'essai (workflow des migrations, 0052), une vérification finale, et quelques clics de Samuel. Le premier message en annonçait moins ; il a été corrigé.
- 2026-10-14, 22:21 CEST (projet) : « lance un cycle go » ; 67e cycle lancé à la demande.
- #studio : aucun nouveau message de Samuel.

## Fait
- Fusionnées : **décision 0061** (#339), **décision 0062** (#338, après sa correction 1 : la section 6 devient une analyse du Tech Lead, l'exception n'est effective qu'après l'avis de la Sécurité, lignes de confinement `node:fs` et `node:path`), statut du 66e cycle (#340).
- **Décision 0060** (#336) : correction 1 poussée (dabc70f) ; cycles séparés pour B8c, écart entre purges strictement inférieur à 22 h, actions de Samuel à 18 h, test de moindre privilège exécutable. En revue.
- **Code de 0062** : ticket #341 ouvert et lancé (back).
- Libellé `owner-approved` demandé à Samuel sur #332.

## En cours
- **Code de 0062** (#341, back).
- En revue : #326 (P0r3c-3, troisième tentative bornée), #336 (0060), #332 (approuvé par le Tech Lead, attend `owner-approved`).

## Bloqué
- **Premier essai réel** : P0r3c-3 (#326), puis P0r3c-4 ; code de 0062 et avis de la Sécurité (Q444), nouvelle mise à jour de `p0-reel` par Samuel et nouveau relevé ; P0r3d.
- **Workflow des migrations** : `owner-approved` de Samuel ; Q387 (a) et (b).
- **Purge `p0-purge`** : en échec toutes les 6 heures tant que ses secrets sont vides (attendu, Q387).
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
- Q427 : limite exacte réécrite (3 mots consécutifs, ou 7 caractères consécutifs en écriture sans espace).
- Q438 complétée (actions de Samuel à 18 h). Q444 (Sécurité, avis sur 0062), Q445 (CEO, cycles de B8c), Q446 (CEO et release, 0062 dans la note de version).

## Part d'usage estimée
- 67e cycle (à la demande) : sous-agents terminés : correction 1 de 0062, correction 1 de 0060 ; 3 au plus en même temps.
- En cours, comptés au 68e cycle : code de 0062 (#341).
