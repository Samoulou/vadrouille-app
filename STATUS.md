# État du studio — 2026-10-20 (110e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 8 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message nouveau depuis le 109e cycle (projet et #studio).

## Fait
- Fusionnées : **0096** (#525, préalables de B7b), **amendement 1 de 0093** (#530, fusible de 2 USD pour l'essai seulement), **0098** (#543, règles Sécurité de `SMTP_URL` et du transport SMTP), statut du 109e cycle (#537).
- PR ouvertes au 109e cycle : **0093 tâche A** (#539), **0097** (#540, préalables de B4a), **0099** (#542, verdict Sécurité sur la tâche C de 0093), **0100** (#545, préalables de B8b).
- Corrections du 109e cycle : la suite de B3b (#435) n'a pas été codée, elle attendait 0098 (fusionnée depuis) ; B8b attendait les décisions B8-TL-4, TL-8 et TL-9 (0100, en revue).

## En cours
- ia-recherche : **B7b** (#524, recherche réelle bornée et traces), premier maillon de l'aperçu.
- backend : **suite de B3b** (#435 : transport SMTP selon 0098, Mailpit dans la CI ; `owner-approved` et verdict Sécurité à la revue).
- tech-lead : **0097** (#540), correction 1 ; **0100** (#545), correction 1.

## Bloqué
- **Chaîne de l'aperçu** : B7b (#524) → B9c (#522) → B9d, B9e ; B9a attend aussi B7b.
- **B6b** (#532) : après la suite de B3b (#435) ; jamais dans le même cycle que B8b (0100).
- **B4a** (#531) : après 0097 (#540).
- **B8b** : après 0100 (#545) ; verdicts Sécurité avant sa fusion.
- **Affichage des voyages sur `p0-reel`** : #536 avec `owner-approved`, puis `db-migrate` lancé par Samuel → report `main` → `p0-reel`.
- **0093** : tâche A (#539) et verdict de la tâche C (#542) en attente de leur correction 1 (prochain cycle, faute de fil libre).
- **Lots 2 à 4 de l'amendement 3** : Q-L2a après la fusion de B7b (Q516) ; verdicts Sécurité (Q508).
- **#519** (règles de lint de B9-TL-1) : pas dans le même cycle qu'une sous-tâche de B9, ni que B8b (`eslint.config.mjs`).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. B7b, puis B9c ; suite de B3b, puis B6b.
2. Corrections 1 de #539 et #542 ; B4a dès la fusion de 0097 ; ticket de B8b dès la fusion de 0100.
3. #519.
4. Samuel : `owner-approved` sur #536, puis lancer `db-migrate` ; carte du fusible en mode réel (Q506) ; plafonds de relecture (Q520).

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (libellé `owner-approved` sur #536, puis `db-migrate`), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q518 à Q522 (tâche A et tâche C de 0093, B8b, B4a).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
