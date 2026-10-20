# État du studio — 2026-10-20 (111e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 9 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message nouveau depuis le 110e cycle (projet et #studio).

## Fait
- Fusionnées : **0093 tâche A** (#539, un essai sans programme n'est jamais compté, fusible unique de 2 USD d'IA pour l'essai), **0100** (#545, préalables de B8b), **règle de lint de B9-TL-1** (#551, `ligne/creation-imports`), statut du 110e cycle (#546).
- PR ouvertes au 110e cycle : **B7b** (#550, recherche réelle bornée et traces), **suite de B3b** (#548, envoi du code par e-mail vers Mailpit), **0101** (#549, décisions de la revue de B9b). Corrections 1 poussées sur 0097 (#540) et 0099 (#542).
- Ticket ouvert : **0093 tâche A2** (#547, retrait des autres fusibles dans le code, après une décision du Tech Lead et un verdict Sécurité, Q521).

## En cours
- ia-recherche : **B7b** (#550), correction 1 ; **B8b** (recomposition à la lecture et carte, selon 0100).
- backend : **suite de B3b** (#548), correction 1.
- tech-lead : **0097** (#540), correction 2, la **dernière**.

## Bloqué
- **Chaîne de l'aperçu** : B7b (#550) → B9c (#522) → B9d, B9e ; B9a attend aussi B7b.
- **B6b** (#532) : après la suite de B3b (#548) ; jamais dans le même cycle que B8b (0100).
- **B4a** (#531) : après 0097 (#540).
- **Affichage des voyages sur `p0-reel`** : #536 avec `owner-approved`, puis `db-migrate` lancé par Samuel → report `main` → `p0-reel`.
- **0093** : tâche C après 0099 (#542, correction 2 au prochain cycle) ; tâche A2 (#547) après décision Tech Lead et verdict Sécurité.
- **0101** (#549) : correction 1 au prochain cycle, faute de fil libre.
- **Lots 2 à 4 de l'amendement 3** : Q-L2a après la fusion de B7b (Q516) ; verdicts Sécurité (Q508).
- **Purge du MVP et `coords-purge`** (#527) : Q438.

## Prochain cycle
1. B7b, puis B9c ; suite de B3b, puis B6b (pas dans le cycle de B8b).
2. B4a dès la fusion de 0097 ; corrections de #542 (dernière) et #549.
3. Samuel : `owner-approved` sur #536 puis `db-migrate` ; `owner-approved` sur #548 après sa revue (elle touche `ci.yml`) ; Q506, Q518 à Q520.

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
- Aucune ; Q521 a son ticket (#547).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
