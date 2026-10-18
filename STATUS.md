# État du studio — 2026-10-18 (94e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 10 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau message de Samuel depuis le 93e cycle (fil du cycle et #studio).

## Fait
- Fusionnées : statut du 93e cycle (#463), note de version v2026.10.17-21 (#465), **B8a de B8** (#464 : ancrage, fiches et trajets en mémoire ; Tech Lead et Sécurité approuvés, verdict Sécurité sur 0085 § 2 a à e rendu). Ticket #462 à fermer.
- **Effet de B8a sur `p0Run` réel** (0085, Q483) : une fiche introuvable (404 de Place Details) est désormais écartée et remplacée au lieu d'arrêter l'exécution.
- **Écart de procédure** : la fusion automatique a fusionné #464 (≈ 22:15 UTC) avant la fin du délai de veto de 0085 (≈ 02:40 UTC, 0068), que la PR posait comme condition ; la porte ne vérifie pas ce délai (Q485). Samuel garde son veto sur 0085 : s'il l'exerce, retour arrière de B8a.
- #460 (migrations 0008 à 0010 approuvées) : Tech Lead approuvé, Sécurité G1 à G6 accordé ; attend `owner-approved` de Samuel.

## En cours
- tech-lead : **décision 0086** (ticket #466 : B6-TL-1 à B6-TL-11, préalables de B6a), branche `claude/466-decisions-b6a`.
- product-owner : **suites de B8a** (ticket #467 : zone nulle, logement suggéré sans `placeId`, départ des trajets d'un quartier, fiches par génération, plages après minuit ; Q481 (b) et (c)), branche `claude/467-suites-b8a`.

## Bloqué
- **B6a** : décision 0086 (#466) ; aucune décision sur B6-TL-1 à B6-TL-11 n'était écrite. **B4a** : après B6a, jamais dans le même cycle (0078).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`. **B8b** : B6a.
- **B9** : B9b après B6a et Q482 ; B9c : #467 (suites de B8a) ; B9c réel : Q468 ; B9e : Q465, Q467.
- **Purge du MVP** (`coords-purge`) : premier run planifié en échec (2026-10-17 17:52 UTC, cause non analysée ; activation Q438 non faite) ; à analyser par le data (Q486).
- **Migrations 0008 à 0010 sur la vraie base** : `owner-approved` sur #460, puis `roles.sql` rejoué par Samuel et `count(*) = 0` sur `usage_ledger` avant le lot (Q479).

## Prochain cycle
1. Après la fusion de 0086 : ticket de **B6a** (backend).
2. Suivre #460 (`owner-approved`), puis envoyer à Samuel les étapes exactes du lot de migrations.
3. Analyse de l'échec de `coords-purge` (data, Q486) ; mineurs de B8a (validation de la clé serveur par `src/server/env/index.ts` à confier à B3 ou B9, `jourDeLaSemaine` dupliqué, isolement de P0 par types).
4. Tickets à placer : police servie localement (Q484), page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, PR de décision sur 0007 (`vadrouille_fn_usage`, `vadrouille_coords_purge`). Carte à Samuel : Q39/Q465.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q325, Q456 et Q457 closes).
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
- Q485 et Q486.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
