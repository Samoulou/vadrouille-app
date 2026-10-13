# État du studio — 2026-10-13 (52e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle. Le 52e cycle a été lancé à la demande de Samuel (19:11 CEST).

## Messages de Samuel traités (projet)
- Fil du projet, 19:11 CEST : « On a encore de la marge, lance le cycle suivant » → 52e cycle lancé.
- Fil « Topo produit des fonctionnalités », 19:36 CEST : « Le découpage me va, je lève le délai et go » → découpage de B5 (décision 0041) accepté, fenêtre de veto levée ; B5a n'attend plus que les décisions du Tech Lead (0045, #257).
- #studio : aucun nouveau message depuis le 51e cycle.

## Fait
- Fusionnées : statut du 51e cycle (#249), correctif de `main` après B1 (#244, `main` de nouveau verte), rôle commercial et spec C1 (#251, décision 0043), seuils commerciaux de G0 (#253, décision 0044 : 300 visites, 10 réponses au questionnaire, 5 préventes dont 3 hors proches).
- **Spec B3 (#243)** : correction 2, la dernière autorisée, poussée (ea23104) : garde `SMTP_URL` fermée (ni requête, ni fragment, ni chemin, ni identifiant ; transport par options explicites, vérifié sur `nodemailer` 10.0.16) ; validation de l'e-mail par liste blanche et forme canonique unique, enveloppe explicite (A15, C5) ; 15 mineurs.
- **Spec B4 (#248)** : correction 1 poussée (e90c562) : périmètre de B4a unique (`requestId`), tests ajoutés (A23 à A26, B7, B8, C7), test de 0020 § 2.3 corrigé (`debloquer-regles.test.ts`), `paymentDemoAllowed` appliqué à `simulated` ; propositions B4-TL-10 à 14 au Tech Lead.
- **Prévente (C1, ticket #254, PR #256)** : 7 documents dans `docs/commercial/` (offre, textes de la page, questionnaire de 5 questions, diffusion, démonstration avant/après, réseaux sociaux, suivi G0) ; questions à Samuel avec recommandations (Q357).
- **Décisions Tech Lead de B5 (ticket #255, PR #257)** : décision 0045 (amende 0032) : moteur unique dans `src/domain` avec adaptateur pour P0, interfaces synchrones pour les données Google, règle d'import, configuration unique `moteur.json`, huit codes de refus, R3 défini une seule fois ; réponses à Q333, Q337, Q338.

## En cours
- En revue : #243 (spec B3, correction 2), #248 (spec B4, correction 1), #256 (C1), #257 (0045), #245 (F7b), #238 (code de #222).

## Bloqué
- **PR de code de #221** : après la fusion de #238.
- **B5a** : fusion de #257 (0045) ; puis tickets B5a, B5b, B5c.
- **Code de B3** : fusion de #243 et décision de découpage (Q343) ; préalables du Tech Lead (amendements de 0017 et 0007) ; B3c attend F8b.
- **Code de B4** : fusion de #248, décision de découpage (Q351), Q352 ; B4a après B3b.
- **Page de prévente dans l'application** : réponses de Samuel à Q357.
- **Exécutions réelles de P0 (P0r2)** : code de #221 et #222 ; Q330.

## Prochain cycle
1. Corrections éventuelles de #243 (si la revue bloque encore : troisième tentative ou découpage, avec le Tech Lead), #248, #256, #257, #245, #238.
2. Après la fusion de #257 : tickets B5a, B5b, B5c (séquentiels, mêmes fichiers de `src/domain`).
3. Après la fusion de #238 : code de #221 (rôle `ia`).
4. Après la fusion de #243 et #248 : décisions écrites de découpage (Q343, Q351), tickets B3a et F8b (jamais dans le même cycle), puis B4a après B3b.

## Décisions attendues de Samuel
- **Nouvelle** : **Q357** (prévente, recommandations dans #256) : encaisser par un lien de paiement Stripe (TWINT et carte) ouvert par Samuel ; acheter le domaine avant la mise en ligne de la page ; un compte Instagram tenu par Samuel, sans publicité avant le bilan à 4 semaines ; date d'ouverture fixe avant Pâques avec remboursement intégral ; garder 29 CHF.
- **Action** : plafond de quota de Maps JavaScript API (Q263).
- **Déjà posées** : Q353, Q354, Q345, Q330, Q332, Q319, Q321, Q322, Q323, Q325, Q317, Q296, Q297, Q294, Q288, P0c-Q2.
- **Pour confirmation** : **Q285**. Recommandation : laisser la production telle quelle jusqu'à la mise en public ; aucun réglage Vercel à faire.
- **Toujours ouvertes** :
  - juridique : Q5 (validation formelle), Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q75, Q127, Q150 ;
  - argent et comptes : Q25, Q26, Q39, Q45, Q56, Q84 ;
  - offre : Q57, Q63, Q67, Q76, Q78, Q88 à Q90, Q128, Q133, Q135, Q149 ;
  - documents et environnement : Q12, Q59, Q40, Q101 ;
  - Ligne : Q19 (avec Q226), Q37, Q108, Q130 ;
  - règles : Q23, Q274.
- **Veto possible** :
  - avant le 2026-10-15 : décisions B3-PO de la spec B3 (#243) et B4-PO de la spec B4 (#248), une fois fusionnées ; décisions B5-PO-1 à 16 de la spec B5 (#229) ; décisions B2-PO de la spec B2 (#198) ; la fenêtre de 0041 est levée par Samuel ;
  - 2 jours après leur publication dans la note de version : 0011 (sauf S4 et S5), 0031, 0032 et son amendement (#211), 0037, 0040, décisions B1-PO-1 à 6 (#185) ;
  - avant le 2026-10-14 : décision 0025.

## Questions ajoutées
- Q356 (CEO) : préfixe de commit du rôle commercial.
- Q357 (Samuel) : prévente.
- Q358 (Product owner), Q359 (UX/UI), Q360 (Tech Lead) : suites de 0045.
- Mises à jour : Q333, Q337, Q338 (réponses proposées dans 0045, #257).

## Part d'usage estimée
- 52e cycle : 4 sous-agents, 3 au plus en même temps :
  - correction 2 de la spec B3 (0,18 M de jetons) ;
  - correction 1 de la spec B4 (0,20 M) ;
  - préparation de la prévente C1 (0,15 M) ;
  - décision 0045 du Tech Lead (0,18 M).
- S'y ajoute le travail du CEO (environ 0,1 M).
- Total : environ 0,8 M de jetons (estimation).
- Part de l'abonnement : impossible à mesurer depuis la routine.
