# État du studio — 2026-10-14 (56e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 56e cycle a été lancé par la routine à 05:07 CEST.

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 54e cycle (fil du projet et #studio). Les cartes Q366 (2026-10-13 23:09 CEST) et Q383 (2026-10-14 02:52 CEST) restent sans réponse.

## Fait
- Fusionnées depuis le 55e cycle : statut du 55e cycle (#281), **décision 0048** (#274), **décision 0046** (#266, préalables de P0r2), **P0r1** (#272, clients réels de l'IA et de Google sans point d'entrée, barrière de sortie, port de consommation ; test « clé côté serveur seulement » et tests à sentinelles Google ajoutés en correction 1).
- **P0r2** (#284, base du prototype) : ticket ouvert, code en cours (rôle data). Vérifiée sur la base de la CI seulement ; aucune action sur la base réelle avant 0052.
- **Décision 0052** (#283, déverrouillage du prototype : écriture des positions, workflow des migrations, verrou technique) : écrite par la Sécurité, correction 1 poussée (exécuteur de migrations minimal sans `pnpm install`, verrou S11 technique, module dans `src/adapters`).
- **Décisions 0050 et 0051** (#280) : corrections 1 et 2 poussées ; le Tech Lead accepte les refus de la Sécurité (Q382) ; mode de démarrage tolérant en préversion retiré ; porte de fusion du code de B3a (relevé des noms des variables Vercel, Q381).
- **B5c** (#276) : branche mise à jour depuis `main` pour relancer la revue (Q365).

## En cours
- Fils actifs : P0r2 (#284, code), 0050 et 0051 troisième tentative bornée (#280, Q386), 0052 correction 2, la dernière (#283).
- En revue : B5c (#276).

## Bloqué
- **Vrais appels du prototype (P0r3, puis essai d'intégration)** : fusion de P0r2 (`owner-approved` de Samuel : la PR touche `.github/workflows/`), puis de 0052 ; sur la base réelle, Q366, Q367 et Q387.
- **B8, B9, B11** : fusion de B5c (#276).
- **Code de B3a** : fusion de #280 et levée du délai de veto (Q383) ou le 2026-10-16 ; porte de fusion Q381.
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après la fusion de B5c : ticket B8 (ou B9, B11) selon `docs/roadmap.md`.
2. PR de P0r2 : demander `owner-approved` à Samuel dès qu'elle est approuvée.
3. Si #280 ou #283 restent bloquées : découpage (Q386 ; pour 0052, décision avec le Tech Lead).
4. Vérifier à chaque cycle qu'aucune PR approuvée sans bloquant n'attend `techlead-approved`, et que les PR en `needs-review` ont bien été relues (Q365).

## Décisions attendues de Samuel
- **Nouvelles** : Q387 (qui crée l'environnement et les secrets des migrations).
- **Cartes en attente** : Q383 (lever le délai de veto sur le découpage de B3, reco : lever), Q366 (préversions et données du prototype, reco : accepter).
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256).
- **Déjà posées** : Q381, Q378, Q367, Q368, Q370, Q263, Q353, Q354, Q345, Q330, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q386 (CEO, avec le Tech Lead) : troisième tentative bornée de #280 (tranchée).
- Q387 (Samuel), Q388 (Tech Lead), Q389 (Product owner) : décision 0052.
- Tranchées ou closes : Q382 (Tech Lead), Q375 (#272 fusionnée). Q381 et Q365 complétées.

## Part d'usage estimée
- 56e cycle (comptés depuis le 55e) : 9 sous-agents, 3 au plus en même temps :
  - correctifs tardifs de 0048 (0,09 M) et 0046 (0,13 M) ;
  - 0052 : écriture (0,28 M) et correction 1 (0,24 M) ;
  - 0050 et 0051 : corrections 1 (0,24 M) et 2 (0,2 M) ;
  - P0r1 correction 1 (0,3 M) ;
  - P0r2, 0050 et 0051 troisième tentative, 0052 correction 2 en cours (comptés au prochain cycle).
- S'y ajoute le travail du CEO (environ 0,1 M).
- Total : environ 1,6 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
