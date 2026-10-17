# État du studio — 2026-10-17 (91e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 7 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié au 90e cycle, de nouveau à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Fil du cycle, 14:46 UTC : « État ? Plus de dashboard après les cycles ? » ; le tableau de bord, arrêté au 84e cycle, est republié (cycle 90) et sera remis à jour à la fin de chaque cycle.
- #studio : aucun nouveau message depuis le 90e cycle.

## Fait
- Fusionnées : statut du 90e cycle (#445), **B3b de B3** (#446 : Better Auth 1.7.7, organisations, `withOrg`, contexte de requête ; décision 0082 du Tech Lead). Ticket #444 fermé.
- Veto de 0081 terminé (15:48 UTC) : les sous-tâches de B9 peuvent l'appliquer.

## En cours
- backend : **B3c de B3** (ticket #447 : adaptateur `better-auth` et branchement), branche `claude/447-b3c-branchement`.
- backend : **PR de moteur B9-TL-13** (ticket #448 : entrée `jours` de `generer`), branche `claude/448-moteur-jours`.
- ia-recherche (avec data) : **B7c** (ticket #449 : `usage_ledger`, plafonds en valeurs de test, organisation « actions sans compte », `evals/` simulé ; migration 0010, seule migration du cycle selon 0059 § 4), branche `claude/449-b7c-registre`.

## Bloqué
- **B6a**, **B4a** : B3c (#447). **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B8a** : B7c (#449). **B8b** : B8a.
- **B9** : B9b après sa PR de contrat (B9-TL-14) et B6a ; B9c après la PR de moteur (#448) ; B9e : Q465, Q467 ; B9c réel : Q468.
- **Activation de la purge du MVP** (`coords-purge`) : Q438 (Samuel).
- **Migrations 0008 et 0009 sur la vraie base** : `MIGRATIONS_APPROUVEES` de `db-migrate.yml` ne les liste pas ; une PR de workflow avec `owner-approved` de Samuel sera nécessaire.

## Prochain cycle
1. Suivre B3c (#447), la PR de moteur (#448) et B7c (#449) : CI, revue, `owner-approved` si `.github/` est touché.
2. PR de contrat de B9b (B9-TL-14) au premier fil libre ; puis B6a après B3c.
3. Tickets à placer : page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré » dans « Mes voyages », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier` avant de lever B3-TL-2, note de version listant 0082. Carte à Samuel : Q39/Q465.

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
- Q476 et Q477.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
