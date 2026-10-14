# État du studio — 2026-10-14 (69e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 23:33 CEST : libellé `owner-approved` posé sur #332 ; le workflow des migrations est fusionné.
- 2026-10-14, 23:33 CEST (projet) : « RELANCE UN CYCLE STP » ; 69e cycle lancé à la demande.
- 2026-10-14, 23:49 CEST (fil du cycle) : l'IA et Google restent bloqués, il ne comprend pas pourquoi. Réponse : la cause est la boucle de relecture (un défaut rare trouvé à chaque passage, une heure par aller-retour, pièces en série). Engagement du CEO : les trois places vont uniquement aux pièces de l'essai réel, aucune règle annexe nouvelle avant le premier essai.
- 2026-10-14, 23:51 CEST (carte de décision) : **« Garder strict »** (Q448). Toute remarque de relecture reste bloquante pendant la phase privée.
- 2026-10-14, 23:51 et 23:52 CEST : « combien de cycles avant l'essai de bout en bout ? », puis « comment avance ce cycle ? ». Estimation donnée : 6 à 10 cycles pour le premier vrai essai, 25 à 40 pour l'app complète avec IA et Google.
- #studio : aucun nouveau message.

## Fait
- Fusionnés : **workflow des migrations** (#332), statut du 68e cycle (#344).
- **P0r3c-3** (#326) : bloquant tardif de la Sécurité (non compté) corrigé dans le code (59878f0) ; les mots du récit sont comparés après remplacement des suites sans espace ; hangul, javanais et balinais rejoignent la fenêtre par caractères. La limite de Q427 reste vraie.
- **Code de 0062** (#343) : correction 1 (757ed85) ; condition 1.7 (nom de section `nodejs_conf` vérifié par `process.config`), précisions du Tech Lead consignées dans 0062.
- **Décision 0060** (#336) : la correction 2 a laissé un bloquant du Tech Lead (requête de contrôle filtrée sur le membre). Choix du CEO avec le Tech Lead : **troisième tentative bornée** (Q447), poussée (97f59c3).

## En cours
- En revue : #326, #336, #343.

## Bloqué
- **Premier essai réel** : P0r3c-3 (#326), puis P0r3c-4 ; code de 0062 (#343) et avis de la Sécurité (Q444), nouvelle mise à jour de `p0-reel` par Samuel et nouveau relevé ; ouverture de la base d'essai (0052) ; P0r3d.
- **Purge `p0-purge`** : en échec toutes les 6 heures (cause non relevée ; secrets vides probables, Q387).
- **B8c** : fusion de 0060 ; cycles séparés (Q445). **B6a** : B3b. **B8a** : B7a, B7c, P0r3c-3. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel (engagement du 69e cycle).
2. Après #343 : lien à Samuel pour remettre `p0-reel` à jour, puis relevé de la section 8 de 0062.
3. Après #326 : P0r3c-4. Si #326 est encore bloquée : découpage.
4. Si #336 est encore bloquée : découpage (pas de quatrième tentative).

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
- Q447 (CEO et Tech Lead : 0060, troisième tentative bornée), Q448 (Samuel : niveau de relecture pendant la phase privée, tranchée « Garder strict »).

## Part d'usage estimée
- 69e cycle (à la demande) : sous-agents terminés : correction 2 de 0060 (lancée au 68e), code de 0062 (lancé au 67e), bloquant tardif de P0r3c-3, correction 1 du code de 0062, troisième tentative de 0060 ; 3 au plus en même temps.
