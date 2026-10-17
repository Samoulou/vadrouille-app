# État du studio — 2026-10-17 (92e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 8 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Fil du cycle, 17:23 UTC : « Comment? » ; lu comme une gêne devant la liste d'avancement en anglais : elle est désormais écrite en français simple.
- Fil du cycle, 18:15 UTC : « Done » ; `owner-approved` posé sur #452 (B3c), vérifié.
- #studio : aucun nouveau message depuis le 91e cycle.

## Fait
- Fusionnées depuis le 91e cycle : statut (#450), **PR de moteur B9-TL-13** (#451 : entrée `jours`, `replanifierJour`, amendement 1 de la spécification B5), **PR de contrat de B9b** (#455 : `suggestedLodging`, `suggestedArea`, `RetryGenerationRequestSchema` ; couvre Q476 13 (b)), décision **0084** (#456 : espaces autour de l'adresse e-mail), **B7c** (#454 : décision 0083, migration 0010, `usage_ledger`, plafonds nuls en production, `evals/` simulé).
- B3c (#452) : conflit avec `main` résolu par fusion (71d76fe), `owner-approved` de Samuel posé ; fusion automatique attendue après la CI et le Tech Lead.

## En cours
- tech-lead : **décision 0085** (#459, ticket #457 : B8-TL-1, B8-TL-5, B8-TL-6, B8-TL-7 et question 10 (a), préalables de B8a), en revue.
- data : **migrations 0008 à 0010 dans `MIGRATIONS_APPROUVEES`** (#460, ticket #458), en revue ; verdict Sécurité G1 à G6 (0056 § 3.2-3.3) et `owner-approved` de Samuel requis.

## Bloqué
- **B8a** : fusion de 0085 (#459) ; jamais dans le même cycle que B3c (#452), B6a ou une PR qui touche `eslint.config.mjs` ou les tests de confinement (0060). Verdict Sécurité sur les masques (0085 § 2, a à e) : bloque la fusion, pas le début.
- **B6a**, **B4a** : B3c (#452). **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`. **B8b** : B8a, B6a.
- **B9** : B9b après B6a et la forme de la reprise (Q476 14) ; B9c réel : Q468 ; B9e : Q465, Q467.
- **Activation de la purge du MVP** (`coords-purge`) : Q438 (Samuel).
- **Migrations 0008 à 0010 sur la vraie base** : #460, puis `roles.sql` rejoué par Samuel avant le lot (Q479).

## Prochain cycle
1. Suivre B3c (#452) jusqu'à la fusion, puis ouvrir le ticket de **B6a** (jamais dans le même cycle que B8a).
2. Après la fusion de 0085 (#459) et de B3c : ticket de **B8a** (ia-recherche), dans un cycle sans B6a.
3. Suivre #460 (verdict Sécurité, `owner-approved`).
4. Tickets à placer : page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, note de version listant 0082 à 0085. Carte à Samuel : Q39/Q465.

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
- Q478 à Q483.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
