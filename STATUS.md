# État du studio — 2026-10-18 (104e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 2 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 103e cycle (Samuel dort) ; #studio : aucun message nouveau.

## Fait
- Fusionnées : **décision 0093** (#512, plus de délai de veto, essai sans programme jamais compté, un seul fusible de 2 USD d'IA par essai) ; statut du 103e cycle (#515).
- Ouvertes et en revue : **B9b** (#517, création du voyage et état de génération : Tech Lead approuvé, un bloquant documentaire de la Sécurité) ; **décision 0094** (#516, lots 2 à 4 de l'amendement 3, vagues de tickets).
- #507 (code de 0092) : `main` fusionnée, le test « aucune donnée dérivée de Google en base » admet `prototype.trajets` et rien d'autre.

## En cours
- tech-lead : **0092** (#504), correction des bloquants tardifs (non comptée) sur l'état d'erreur d'une relecture, avec relevé exhaustif.
- tech-lead : **0094** (#516), correction 1 (comptée) : 6 bloquants.
- backend : **B9b** (#517), correction 1 (comptée) : exception des colonnes `stays.area_center_lat`/`lng` inscrite dans le handover, mineures 1, 2 et 6.

## Bloqué
- **Affichage des voyages sur `p0-reel`** : #504 → #509 → #507 → migration 0011 → report `main` → `p0-reel`.
- **Ordre de fusion** : #507 avant #517 (conflits sur `db/migrations/meta/_journal.json`, `db/README.md`, `tests/db/roles.test.ts`, `tests/db/schema.test.ts`, instantané 0012).
- **0093, tâches A et C** : confirmation écrite de Samuel « Je confirme 0093 » sur #512 (Q507) ; C aussi après un verdict Sécurité sur son mécanisme. **Tâche B** : après #507 et Q-L2d (réponse du CEO à la question 9 de 0094).
- **Lots 2 à 4 de l'amendement 3** : fusion de 0094, puis vague 1 (Q-L2a après #507, Q-L2b, Q-L2c) ; verdicts Sécurité (questions 1 à 5 de 0094).
- **B4a**, **B8b** et **B9a** : jamais dans le même cycle que B9b.
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **Purge du MVP** : Q438 (Samuel). **`coords-purge`** en échec : ticket à ouvrir.

## Prochain cycle
1. Fusion de #504, puis `needs-review` sur #509 puis #507 ; ensuite #517.
2. Ticket des décisions du Tech Lead sur B9b à consigner (import de `api-creation.ts`, pas d'expiration dans `createTrip`, amendement de `imports.test.ts`) et PR des règles de lint de B9-TL-1.
3. Après #517 : B9c (aperçu) ; vague 1 des lots 2 à 4 dès la fusion de 0094.
4. Samuel : « Je confirme 0093 » sur #512 ; carte du fusible en mode réel ; ouvrir le voyage Rome une seule fois après ~07:00 UTC.

## Décisions attendues de Samuel
- **Réponses demandées** : Q507 (« Je confirme 0093 » sur #512), Q506 (fusible de 2 USD aussi en mode réel ?), Q509 (0012 dans `MIGRATIONS_APPROUVEES`) ; Q502 et Q497 n'ont plus d'effet une fois Q507 donnée (0093 point 2).
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
- Q506 à Q510 ; Q455, Q485 et Q503 sans objet (0093).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
