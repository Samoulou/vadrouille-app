# État du studio — 2026-10-14 (58e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 07:10 CEST, fil du projet : « pour 2 on lève le découpage du copmte et 3 je suis ta reco ». **Q383** : délai de veto sur le découpage de B3 levé ; **Q366** : acceptée (préversions et données du prototype dans la base actuelle).
- 07:09 CEST : `owner-approved` sur P0r2 (#287), fusionnée.
- #studio : aucun nouveau message.

## Fait
- Fusionnées depuis le 57e cycle : statut du 57e cycle (#291), **P0r2** (#287, base du prototype).
- **B3a** (#295, environnement du serveur et limiteur) : codée par le backend (ticket #293), en revue. Porte Q381 levée par le CEO : aucun secret de B3 ni aucune variable refusée n'est posé sur Vercel (relevé des seuls noms).
- **Décision 0055** (#294, préalables de P0r3) : écrite par le Tech Lead avec l'avis de la Sécurité ; découpage de P0r3 en quatre PR accepté par le CEO (Q399).
- **Décision 0052** (#283) : troisième tentative avec découpage (Q398), puis réduction à l'écriture des positions (Q400) ; le workflow des migrations et le déverrouillage partent dans la future décision 0056.

## En cours
- Fils actifs : 0052 réduite (#283, Sécurité) ; 0055 correction 1 (#294, Tech Lead) ; spec B7 correction 2, la dernière (#288, product owner).
- En revue : B3a (#295).
- En attente d'un fil libre : amendement 1 de 0053, correction 1 (#290, Q404).

## Bloqué
- **Premier essai réel (P0r3)** : fusion de 0055, puis P0r3a à P0r3d ; Q330 (unité du quota Routes) pour démarrer un essai ; sur la base réelle, la décision 0056 (migrations).
- **Code de B7** : fusion de la spec (#288), décision 0054 (découpage), puis P0r3.
- **B3a** : verdict Sécurité sur cinq lignes du régime de confinement ; `owner-approved` de Samuel (`ci.yml`).
- **B3c** : Q401 (variables du limiteur dans Vercel).
- **B8** : spec à écrire après la spec B7.
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après la fusion de 0055 : ticket P0r3a (fusion automatique limitée à `main`, `owner-approved`).
2. Après la fusion de B3a : P0r3b (garde et accès), puis P0r3c et P0r3d, avant B3b.
3. Après la fusion de la spec B7 : décision 0054 et spec B8. Si la spec B7 reste bloquée : découpage avec le Tech Lead.
4. Correction 1 de l'amendement 1 de 0053 (#290) au premier fil libre ; décision 0056 (Sécurité avec le Tech Lead) après la fusion de 0052.

## Décisions attendues de Samuel
- **Maintenant** : `owner-approved` sur B3a (#295) quand la revue est au vert ; Q330 (unité du quota Routes dans la console Google).
- **Nouvelles** : Q401 (variables du limiteur dans Vercel, bloque B3c), Q402 (code d'accès de P0r3 et jeton d'API Vercel).
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256).
- **Déjà posées** : Q397, Q394, Q387, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - avant le 2026-10-16 : décision 0047 (découpage de `fr.json`, #269) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q398 et Q400 (CEO, tranchées) : décision 0052.
- Q399 (CEO, tranchée), Q402 (Samuel) : décision 0055.
- Q401 (Samuel), Q403 (Tech Lead) : B3a.
- Q404 (CEO) : amendement 1 de 0053.
- Mises à jour : Q366 et Q383 (tranchées par Samuel), Q381 (relevé fait), Q320, Q389 et Q391 (propositions de 0055).

## Part d'usage estimée
- 58e cycle (comptés depuis le 57e) : 5 sous-agents terminés, 3 au plus en même temps :
  - spec B7 correction 1 (0,2 M) ; 0052 bloquant tardif (0,15 M) ; 0052 troisième tentative (0,19 M) ;
  - 0055 (0,28 M) ; B3a (0,31 M) ;
  - 0052 réduction, 0055 correction 1 et spec B7 correction 2 en cours (comptés au prochain cycle).
