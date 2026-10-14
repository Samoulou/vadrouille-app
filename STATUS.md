# État du studio — 2026-10-14 (61e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 12:23 CEST : `owner-approved` sur P0r3a (#305), fusionnée.
- 2026-10-14, 12:36 CEST (fil du projet) : « go faire tourner un cycle » ; 61e cycle lancé à la demande.
- #studio : aucun nouveau message depuis le 60e cycle.

## Fait
- Fusionnées depuis le 60e cycle : **P0r3a** (fusion automatique limitée à `main`, #305), statut du 60e cycle (#309).
- **P0r3b** (#312, ticket #311) : garde du mode réel, code d'accès et page `/prototype/executions` (404 hors `p0-reel`), codés ; le relevé de 0055 § 1 point 3 se fait après la fusion, par la Sécurité, une fois `p0-reel` créée.
- **Décision 0056** (#300) : troisième tentative bornée poussée (Q418 ; motif de sortie de `db-releve` corrigé).
- **Spec B8** (#301) : correction 2, la dernière, poussée (fiche relue `chargee` ou `introuvable`, échec d'appel sans `toConfirm`).
- **Spec B6** (#308) : correction 1 poussée (règle de 0011 sur `toConfirm` appliquée, cartes sans relecture).
- **Tableau de bord** (#307) : correction 1 poussée (ordre 7, 7 bis, 8 ; repli si l'Artifact est introuvable).

## En cours
- Aucun fil actif.
- En revue : P0r3b (#312), 0056 (#300, troisième tentative), spec B8 (#301, dernière correction), spec B6 (#308), tableau de bord (#307).

## Bloqué
- **P0r3c** : P0r3b, et fin du délai de veto de Samuel sur 0055 (2026-10-16) ou sa réponse à Q407.
- **Pose du code d'accès et des variables de P0r3b** : fusion de #312, création de `p0-reel` (rôle Release, Q414), Q402.
- **Premier essai réel** : P0r3b à P0r3d ; Q330 ; sur la base réelle, la fusion de 0056 et Q408.
- **PR du workflow des migrations** : fusion de 0056 et Q419 (Tech Lead).
- **Code de B7** : P0r3 fusionnée. **B8** : fusion de la spec, décision de découpage, puis B7a et B7c. **B6a** : B3b.
- **B3c** : Q401 (variables du limiteur dans Vercel).
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après la fusion de P0r3b : relevé de la Sécurité et création de `p0-reel` (Release) ; ticket P0r3c dès l'échéance du veto (2026-10-16) ou la réponse de Samuel à Q407.
2. Après la fusion des specs B8 et B6 : décisions de découpage du CEO (Q415, Q416).
3. Si 0056 reste bloquée : `db-releve` sort vers une décision à part (Q418), sans quatrième tentative.
4. Si la spec B8 reste bloquée après sa dernière correction : troisième tentative ou découpage avec le Tech Lead.

## Décisions attendues de Samuel
- **Maintenant** : Q330 (unité du quota Routes dans la console Google) ; Q402 (source du jeton Vercel, rappelée par P0r3b #312, bloque la pose du code d'accès).
- **Nouvelles** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307) ; Q417 (préversion qui lit la base avant G0 ; reco : non).
- **Déjà posées** : Q407, Q408, Q409, Q410, Q401, Q402, Q397, Q394, Q387, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ; décisions B7-PO de la spec B7 (#288) ; décision 0055 (#294, dont l'amendement de 0011 § 2 pour `p0Run` et Q407) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q418 (CEO, tranchée) : décision 0056.
- Q419 (Tech Lead) : décision 0056.
- Q420 (Samuel) : tableau de bord.

## Part d'usage estimée
- 61e cycle (comptés depuis le 60e) : 5 sous-agents terminés, 3 au plus en même temps :
  - P0r3b (0,37 M) ; 0056 troisième tentative (0,16 M) ; spec B8 correction 2 (0,12 M) ; spec B6 correction 1 (0,18 M) ; tableau de bord correction 1 (0,09 M).
