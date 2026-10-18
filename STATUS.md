# État du studio — 2026-10-18 (100e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 16 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 13:13 UTC : report `main` → `p0-reel` (#492) **fusionné par Samuel** (remplissage du séjour, Routes 840).
- 13:21 et 13:30 UTC : deux exécutions comptées rome-1/B arrêtées en `pipeline_failed` dans l'étape finale (la première partie sur l'ancien déploiement avant la fin du report, la seconde sur `efc0994`) ; diagnostic `/mnt/project-files/essai-reel/diagnostic-rome-2.md` (lecture de la matrice Routes trop stricte, cause probable) ; ticket #493.
- 13:50 UTC : carte de décision, **« Ne pas compter »** ces deux exécutions (Q495) : décision 0089 (#494) **fusionnée**.
- 14:18 UTC : « Pourquoi Google ne donne pas de trajet » : répondu (paires sans trajet en transports en commun, réponse rejetée en entier par notre lecture).
- #studio : aucun message nouveau.

## Fait
- Fusionnées : **remplissage du séjour** (#490, décision 0088 ; Routes 840), statut du 99e cycle (#491), **décision 0089** (#494), report `main` → `p0-reel` (#492, par Samuel).
- #489 (amendement 3, qualité du programme) : correction 2 et correction de fait nouveau (#490 fusionnée) poussées ; revue : un seul bloquant tardif (500 → 840, l. 196).

## En cours
- tech-lead : **décision 0090** (lecture de la matrice Routes paire par paire, bloquant 2 de la revue de #495) ; puis ia-recherche : description de #495 réécrite (écrasée par erreur par celle de #494) et mineurs. Verdict Sécurité S4 sur `p0.step_failed` : favorable.
- product-owner : #489, bloquant tardif (non compté).
- #484 et #486 : `needs-review` après 15:23 UTC (fin du délai de 0087).

## Bloqué
- **Relance de Rome par Samuel** : après la fusion de #495, report `main` → `p0-reel`, annonce « p0-reel prêt, commit … » ; relance en « Essai d'intégration » (ne compte pas).
- **B9b** : après #484 (mêmes fichiers d'adaptateur de création) ; noms de colonnes posés par le rôle data dans sa migration (0087 § 1.2, Q492).
- **B4a** et **B8b** : jamais dans le même cycle que B9b (0078) ; à placer.
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9c** après #481 ; B9d : verdict Sécurité (Q492) ; B9c réel : Q468 ; B9e : Q467.
- **Purge du MVP** : activation Q438 (Samuel).
- **`coords-purge`** : en échec à ses trois premiers runs (note de version v2026.10.18-09) ; cause à analyser avant que des positions atteignent 30 jours (0027) : ticket à ouvrir.

## Prochain cycle
1. Après #495 : report `main` → `p0-reel` ; Samuel relance rome-1 en « Essai d'intégration » seulement après l'annonce du commit prêt.
2. `needs-review` sur #484 et #486.
3. Après #484 : B9b (backend avec data) ; B4a dans un autre cycle ; ticket Q493 (compteurs de fin d'essai).
4. Code de l'amendement 3 (#489) après sa fusion.
5. Tickets à placer : `coords-purge` en échec, relecture des trajets en rafales (429 Google, voir le diagnostic Rome 2), commit affiché sur la page d'essai, police servie localement (Q484), mineurs de B8a, page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, PR de décision sur 0007.

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
