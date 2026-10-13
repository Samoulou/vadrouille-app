# État du studio — 2026-10-13 (51e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 51e cycle a été lancé à la demande de Samuel (18:39 CEST), juste après le 50e.

## Messages de Samuel traités (projet)
- Fil du projet, 18:39 CEST : « Aller lance encore un cycle » → 51e cycle lancé.
- #studio : aucun nouveau message depuis le 50e cycle.

## Fait
- Fusionnée : statut du 50e cycle (#246).
- **Correctif de `main` (#244)** : changements demandés par le Tech Lead (1 bloquant : aucun test pour l'admission élargie de `lectureSecreteAdmise`) ; correction 1 poussée (23d4ac6) : 18 cas de test ajoutés, 8 mineurs traités, 522 tests de confinement au vert. Verdict de la Sécurité à renouveler sur ce head.
- **Spec B3 (#243)** : changements demandés (7 bloquants du Tech Lead, 6 de la Sécurité) ; correction 1 poussée (23e91e6) : variables requises par environnement, `ci.yml` déclaré pour B3a, amendement de 0017 en préalable, e2e déterministe, gardes Stripe, purge du limiteur, listes fermées pour `SMTP_URL` et `TRUSTED_IP_HEADER`.
- **Spec B4 (#248, ticket #247)** : paiement simulé en base, droit accordé seulement par un événement signé reçu par le webhook ; découpage proposé B4a, B4b, B4c (Q351).

## En cours
- En revue : #244 (correctif de `main`, prioritaire), #243 (spec B3, correction 1), #248 (spec B4), #245 (F7b), #238 (code de #222).

## Bloqué
- **Toutes les PR de code** : CI rouge tant que #244 n'est pas fusionnée.
- **#245 (F7b)** : captures régénérées par le robot (c508ea3) ; la CI repart avec la fusion de `main` dans la branche, après #244.
- **#238** : après #244 (mêmes listes du régime), puis Q341.
- **PR de code de #221** : après la fusion de #238.
- **B5a** : fin de la fenêtre de veto de 0041 (2026-10-15), Q333 et Q337.
- **Code de B3** : fusion de #243 et décision de découpage (Q343) ; préalables du Tech Lead (amendements de 0017 et 0007) ; B3c attend F8b.
- **Code de B4** : fusion de #248, décision de découpage (Q351), Q352 ; B4a après B3b.
- **Exécutions réelles de P0 (P0r2)** : code de #221 et #222 ; Q330.

## Prochain cycle
1. Faire fusionner #244 ; puis fusionner `main` dans #245 et #238 pour relancer leur CI.
2. Corrections éventuelles de #243, #248, #245, #238.
3. Après la fusion de #238 : code de #221 (rôle `ia`).
4. Après la fusion de #243 et #248 : décisions écrites de découpage (Q343, Q351), tickets B3a et F8b (jamais dans le même cycle), puis B4a après B3b.
5. Après le 2026-10-15 et Q333 : tickets B5a, B5b, B5c.

## Décisions attendues de Samuel
- **Action** : plafond de quota de Maps JavaScript API (Q263).
- **Nouvelles** : Q353 (essai Stripe en mode test : où et qui pose quoi ; ne bloque que l'essai final de B4), Q354 (plafond global d'envois d'e-mails, avant de lever Q25), Q345 (avec le Tech Lead).
- **Déjà posées** (recommandations dans les questions) : Q330, Q332, Q319, Q321, Q322, Q323, Q325, Q317, Q296, Q297, Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO-1 à 16 de la spec B4 (#248), une fois fusionnées ; décision 0041 (découpage de B5, dérogation limitée à « une tâche = une PR ») ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et son amendement (#211), 0037, 0040, décisions B1-PO-1 à 6 (#185), B1 désormais fusionnée ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q351 (CEO), Q352 (Tech Lead et Sécurité), Q353 (Samuel), Q355 (CEO) : spec B4.
- Q354 (Samuel) : spec B3.
- Mise à jour : Q343 (B3a et F8b jamais dans le même cycle).

## Part d'usage estimée
- 51e cycle : 3 sous-agents, 2 au plus en même temps :
  - correction 1 de la spec B3 (0,19 M de jetons) ;
  - spec B4 (0,24 M) ;
  - correction 1 du correctif de `main` (0,07 M).
- S'y ajoute le travail du CEO (environ 0,1 M).
- Total : environ 0,6 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
