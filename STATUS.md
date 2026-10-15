# État du studio — 2026-10-15 (73e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-15 : 04:47 et 04:48 UTC (tester l'IA et Google depuis Vercel ; lancer un cycle ; les essais payants sont faits **par Samuel seul**) → 72e cycle à sa demande, liste de ses actions. 05:11 à 05:42 UTC : questions sur la fiche d'accès à la base (#362, ouverture de Neon depuis Vercel, environnements GitHub, hôte et base) → fiche corrigée ; « accès posés » (05:40), historique SQL effacé (05:42), étapes 8 et 10 faites (05:42). 05:43 : rappel des 5 PR `owner-approved` → aucune n'est prête, elles lui seront envoyées une à une. 05:45 : « je te suis pour les 5 recos » → Q367, Q368, Q387, Q409 répondues.
- #studio : aucun nouveau message.

## Fait
- Fusionnés depuis le 71e cycle : brief d'essai court (#356), mise à jour de `p0-reel` par Samuel (#347), décision **0065** (#360, fichier `OPENSSL_CONF` du runtime Vercel).
- Samuel a posé les accès à la vraie base (fiche #362) : rôles, mots de passe, environnements `db-migrate`, `p0-purge` et `db-releve` avec leurs secrets, règle « Restrict creations », `P0_DATABASE_URL` en préversion de `p0-reel`.
- Ouvertes : code de 0065 (#364, ticket #361) et workflow **`db-reverrouillage`** (#365, ticket #363 ; 0056 § 4.6).
- Revues : #357 (P0r3d) : Tech Lead et Sécurité conformes, un bloquant tardif UX (texte d'erreur du brief refusé ; non compté). #364 : correction 1 (comptée ; chaîne vide de diagnostic, avis Sécurité à consigner dans 0065 § 5). #365 : correction 1 (comptée ; admission S6 sans décision écrite, contrôle des mentions trop faible) ; Sécurité approuve.

## En cours
- Bloquant tardif de #357 (ia), correction 1 de #364 (back), décision du Tech Lead pour l'admission S6 de #365 (Q453) ; ensuite correction 1 de #365 (data).
- PR d'approbation du lot 1 des migrations (A12) : empreintes calculées, PR non ouverte ; un test suppose une liste vide (Q452, accord de Samuel demandé).

## Bloqué
- **Premier essai réel** (lancé par Samuel seul) : fusion de #357 puis PR « `P0RUN_COMPLET` à vrai » ; fusion de #364 et nouvelle mise à jour de `p0-reel` ; lot 1 (A12, Q452) puis lot 2 des migrations, pas avant que 0056 soit définitive (vers le 2026-10-16 12:20 UTC) sauf levée écrite du veto par Samuel ; #365 (déverrouillage, condition 7) ; relevés `db-releve` après 0057 définitive ; limites de dépense OpenRouter et Google (Q325) ; accord écrit de Samuel (0055).
- **Purge `p0-purge`** : secrets posés par Samuel le 2026-10-15 ; premier lancement manuel après les migrations du lot 1 (A15).
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel.
2. Après chaque correction poussée : relancer la revue (#357, #364, #365). Après la décision du Tech Lead, correction 1 de #365 par l'agent data.
3. Si Samuel répond « oui » à Q452 : reprise d'A12. Après la fusion de #357 : PR « `P0RUN_COMPLET` à vrai ».

## Décisions attendues de Samuel
- **Réponse demandée** : Q452 (« oui » pour corriger le test des migrations), dans le fil du cycle. Ensuite, `owner-approved` sur #357, #365 et la PR du lot 1, une à la fois, après leur revue.
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q452 (Samuel et Tech Lead : correction du test des migrations pour le lot 1), Q453 (Tech Lead : admission S6 de `db-reverrouillage`), Q454 (Sécurité : constat Q410, `ALTER ROLE` seul d'abord).

## Part d'usage estimée
- 72e cycle (à la demande de Samuel) et 73e cycle (routine) : sous-agents terminés : correction 2 de #357, code de 0065 (#364), `db-reverrouillage` (#365), A12 (arrêté sur Q452) ; 3 en cours (bloquant tardif de #357, correction 1 de #364, décision S6 du Tech Lead).
