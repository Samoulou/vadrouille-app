# État du studio — 2026-10-18 (99e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 15 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 09:47 à 09:58 UTC (essai Rome) : un quartier par jour, incontournables de la destination d'abord (monuments à Rome, autre chose ailleurs) avec explication, fiche pratique par étape (prix, horaires, astuce), nombre d'activités selon la durée des visites (matin 8-12 h : 2 × 2 h ou 3-4 × 1 h, puis repas ; idem après-midi et soir) ; PDF d'exemple (`/mnt/project-files/essai-reel/exemples/rome-samuel.pdf`) ; ticket #487 (amendement 3, PR #489) et correction #483 (PR #490).
- 11:42 UTC : carte de décision, **« Monter à 840 »** éléments Routes par voyage (Q494) ; appliqué dans 0088 (#490). Réserve Google d'une exécution : 4,30 → 6,00 USD (environ 3 exécutions par mois dans le plafond de 20 USD), dit à Samuel.
- #studio : aucun message nouveau.

## Fait
- Fusionnées : statut du 98e cycle (#485), **B6a** (#473, lecture serveur et adaptateur `api`), note de version v2026.10.18-09 (#488).
- #490 (remplissage du séjour) : décision 0088 du Tech Lead (cibles depuis la demande, regroupement par quartier sur tous les jours, Routes à 840), puis correction 1 bis 73c8e02 (retrait de `typesPrioritaires`, test de borne `demandeDuJour`, `routesElements` 840 dans `essai.json`, `mode-reel.json` et les bornes du schéma) ; `pnpm verify` vert hors 74 écarts visuels connus ; revue relancée.

## En cours
- Revue : **#490** (correction 2, la dernière : la revue de `acbc0b9` est comptée).
- product-owner : **#489** (amendement 3, qualité du programme), correction 2, la dernière (repas du soir et secteur du jour ; 7 activités au plus par jour plein, 715 éléments, 840 retenu par Samuel).
- #481 (PR #486) et #482 (PR #484) : `needs-review` après 15:23 UTC (fin du délai de 0087).

## Bloqué
- **B9b** : B6a fusionnée ; attend la fusion de la PR de contrat de B9d (#484, mêmes fichiers d'adaptateur de création) ; noms de colonnes posés par le rôle data dans sa migration (0087 § 1.2, Q492).
- **B4a** et **B8b** : après B6a, jamais dans le même cycle que B9b (0078) ; à placer.
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9c** après #481 ; B9d : verdict Sécurité (Q492) ; B9c réel : Q468 ; B9e : Q467.
- **Purge du MVP** : activation Q438 (Samuel).
- **Compteurs de fin d'essai** (`p0.final_counts`, Q493) : B6a fusionnée, ticket à ouvrir.

## Prochain cycle
1. Après la fusion de #490 : report `main` → `p0-reel` ; Samuel relance Rome en « Exécution comptée » (les nouvelles cibles ; « Essai d'intégration » garde le profil fixe, 0073 point 4).
2. Après 15:23 UTC : `needs-review` sur #484 et #486.
3. Après #484 : B9b (backend avec data pour la migration) ; B4a dans un autre cycle ; ticket Q493.
4. Code de l'amendement 3 (#489) après sa fusion et celle de #490.
5. Tickets à placer : police servie localement (Q484), mineurs de B8a, page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, PR de décision sur 0007.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q39, Q45, Q465 et Q491 répondues le 2026-10-18).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060) ; B8c est fusionnée, la purge attend cette réponse pour être activée.
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q345, Q332, Q323, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q493.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
