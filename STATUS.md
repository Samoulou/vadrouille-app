# État du studio — 2026-10-14 (62e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- 2026-10-14, 13:44 à 13:57 CEST (fil du projet) : réponses à Q330 (quota Routes en éléments, sans plafond par jour), Q407 (reco suivie) avec **levée du veto sur 0055**, puis Q402, Q408 et Q417 (« je suis tes recos pour les 3 ») ; reportées dans `QUESTIONS.md`.
- 2026-10-14, 13:57 CEST (fil du projet) : « ok go lance un cycle » ; 62e cycle lancé à la demande. Le déclenchement de la routine à 14:18 CEST a été versé dans ce cycle, sans cycle en double.
- #studio : aucun nouveau message depuis le 61e cycle.

## Fait
- Fusionnées depuis le 61e cycle : **P0r3b** (garde et code d'accès, #312), **décision 0056** (workflow des migrations et déverrouillage, #300, après le découpage de Q418), **tableau de bord** (#307), statut du 61e cycle (#313).
- **Décision 0057** (#315, ticket #314) : relevé `db-releve`, sorti de 0056 (Q418), rédigée.
- **Spec B8** (#301) : troisième tentative bornée poussée (Q421 ; filtrage des fiches chez `ficherSerie`).
- **Spec B6** (#308) : correction 2, la dernière, poussée.
- **P0r3c** : ticket #316 ouvert dès la fusion de P0r3b (veto levé).

## En cours
- **P0r3c** (#316, ia-recherche) : workflow `p0Run`, composition, migration de remplacement (base de la CI seulement), proposition des plafonds de l'essai au PO.
- **Spec B8** (#301) : correction du bloquant tardif de la revue du head `0e7df16` (plafond atteint pendant la relecture ; non compté).
- **Réglages de `p0-reel`** (Release, Q414) : création de la branche et de sa règle, pose de `P0_REAL_RUNS` et `P0_RUN_TOKEN` par le connecteur Vercel (D22, Q402), relevé sans valeur.
- En revue : spec B6 (#308, dernière correction), décision 0057 (#315).

## Bloqué
- **Relevé de 0055 § 1 point 3** (Sécurité) : un déploiement de `p0-reel` avec les variables posées.
- **Premier essai réel** : P0r3c puis P0r3d ; P0r4 ; sur la base réelle, la PR du workflow des migrations et l'`owner-approved` de Samuel par lot (Q408).
- **PR du workflow des migrations** (`db-migrate.yml` et `db-releve.yml`, Q422) : Q419 (Tech Lead), fusion de 0057, `owner-approved` de Samuel.
- **Code de B7** : P0r3 fusionnée. **B8** : fusion de la spec, décision de découpage, puis B7a et B7c. **B6a** : B3b.
- **B3c** : Q401 (variables du limiteur dans Vercel).
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après les réglages de `p0-reel` : relevé de la Sécurité (0055 § 1 point 3) et des fusions vers `p0-reel` (D23 point 5).
2. Revue de P0r3c (#316) ; P0r3d après sa fusion.
3. Si la spec B8 garde un bloquant compté : la lecture et relecture des fiches sort vers une spec à part (Q421).
4. Si la spec B6 reste bloquée après sa dernière correction : troisième tentative ou découpage avec le Tech Lead.
5. Après la fusion des specs B8 et B6 : décisions de découpage du CEO (Q415, Q416).

## Décisions attendues de Samuel
- **Nouvelles (0057, #315)** : Q387 (b) (qui crée l'environnement et les secrets `RELEVE_PG*`, et la copie du mot de passe de la purge) ; Q394 reformulée (noms seulement).
- **Rappel** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q409, Q410, Q401, Q397, Q394, Q387, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0046, 0048, 0049, 0050, 0051, 0054, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q421 (CEO, tranchée) : spec B8.
- Q422 (CEO, tranchée) : décision 0057.
- Tranchées par Samuel : Q330, Q402, Q407 (veto sur 0055 levé), Q408, Q417.

## Part d'usage estimée
- 62e cycle (comptés depuis le 61e) : 5 sous-agents terminés, 3 au plus en même temps :
  - P0r3b correction 1 (0,28 M) ; découpage de 0056 (0,16 M) ; spec B8 troisième tentative (0,14 M) ; spec B6 correction 2 (0,19 M) ; décision 0057 (0,17 M).
- En cours, comptés au 63e cycle : P0r3c, spec B8 (bloquant tardif), réglages de `p0-reel`.
