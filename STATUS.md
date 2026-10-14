# État du studio — 2026-10-14 (55e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 55e cycle a été lancé par la routine à 02:08 CEST.

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 54e cycle (fil du projet et #studio). La carte du 2026-10-13 23:09 CEST (Q366) reste sans réponse.

## Fait
- Fusionnées : **spec B3** (#243, découpée en B3a et `specs/B3b-envoi-email.md`), **F8b** (#269, connexion simulée et entrée « Créer un voyage » sur l'accueil ; veto de 0047 jusqu'au 2026-10-16), statut du 54e cycle (#278), **documents de prévente C1** (#256, `docs/commercial/`).
- **Décision 0046** (#266) : troisième tentative bornée avec découpage (Q377) ; l'écriture des positions, le workflow des migrations et le déverrouillage du prototype passent à une future décision 0052 (Sécurité avec le Tech Lead) ; P0r2 est vérifiée sur la base de la CI seulement. La Sécurité approuve ; le Tech Lead garde un bloquant tardif (purge, tentative non comptée).
- **Décisions 0050 et 0051** (#280, ticket #279) : préalables du code de B3a. 0050 (Tech Lead) découpe B3 en B3a, B3b et B3c, amende 0017 et 0007 ; 0051 (Sécurité) pose deux refus (secret présent toujours validé ; limiteur arrêté à la première clé au-dessus du seuil). En revue.
- **B5c** (#276, correction 1) : seul bloquant restant, fusionner après 0048 (#274).
- Numéros réservés : 0050 et 0051 (#280), 0052 (déverrouillage du prototype).

## En cours
- Fils actifs : 0048 (#274, bloquant tardif sur la liste des tests, tentative non comptée), 0046 (#266, bloquant tardif sur la purge, tentative non comptée).
- En revue : #280 (0050 et 0051).
- En attente : #276 (B5c, après #274), #272 (P0r1, après #266).

## Bloqué
- **P0r2** (premiers vrais appels à l'IA et à Google) : fusion de #266 puis de #272. Les étapes sur la vraie base (rôles, réglages, migrations, écriture des coordonnées) attendent la décision 0052, Q366 et Q367.
- **B8, B9, B11** : fusion de #274 puis de B5c (#276).
- **Code de B3a** : fusion de #280, Q382 (Tech Lead) et levée du délai de veto (Q383) ou le 2026-10-16.
- **Code de B4** : Q351, Q352, Q364 ; B4a après B3b.

## Prochain cycle
1. Après la fusion de #274 : B5c (#276) est prête à fusionner.
2. Après la fusion de #266 : `needs-review` sur #272, ticket de la décision 0052, puis ticket P0r2 (rôle data avec ia-recherche).
3. Après la fusion de #280 et la levée du veto : ticket de code B3a (rôle backend).
4. Vérifier à chaque cycle qu'aucune PR approuvée sans bloquant n'attend `techlead-approved` (Q365).

## Décisions attendues de Samuel
- **Nouvelles** : Q383 (lever le délai de veto sur le découpage de B3, carte du 02:52 CEST, reco : lever), Q381 (information : secrets déjà posés sur Vercel ?), Q378 (durée et coût des modèles dans le rapport, reco : oui/non seulement).
- **Prévente** : Q357 et Q362 ; les documents sont fusionnés (#256), le lancement attend ces réponses.
- **Déjà posées** : Q366 (carte du 2026-10-13 23:09 CEST, reco : accepter), Q367, Q368, Q370, Q263, Q353, Q354, Q345, Q330, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et ses amendements (#211, 0045), 0037, 0040, 0048, 0049, décisions B1-PO-1 à 6 (#185).

## Questions ajoutées
- Q377 (CEO) : découpage de 0046 (tranchée) ; Q369 remplacée.
- Q378 (Samuel), Q379 (CEO), Q380 (Tech Lead) : décision 0046.
- Q381 (Samuel), Q382 et Q384 (Tech Lead), Q383 (Samuel) : décisions 0050 et 0051.
- Q385 (CEO) : workflows planifiés désactivés après 60 jours sans activité.
- Corrigées : heure de la carte Q366 (23:09 CEST) ; Q367 et Q368 bloquent désormais 0052 et P0r3. Q343 et Q204 renvoient à 0050.

## Part d'usage estimée
- 55e cycle : 5 sous-agents, 3 au plus en même temps :
  - comptés du 54e cycle : B5c correction 1 (0,25 M), 0046 correction 2 (0,2 M), prévente (0,1 M), 0048 (0,1 M) ;
  - 0046 troisième tentative (0,2 M), 0050 (0,2 M), 0051 (0,21 M) ;
  - 0048 et 0046, correctifs des bloquants tardifs, en cours (comptés au prochain cycle).
- S'y ajoute le travail du CEO (environ 0,1 M).
- Total : environ 1,4 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
