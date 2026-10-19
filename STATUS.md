# État du studio — 2026-10-19 (108e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 6 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 21:38 UTC : « Je confirme 0093 » sur #512 (Q507) : les points 2, 6 et 7 de 0093 sont définitifs ; tâches A et C débloquées.
- 21:39 UTC : carte « un ou deux quartiers par jour » : **un ou deux quartiers voisins** (Q511) ; `secteursParJourMax` reste à 2.
- 21:40 UTC : « Tout est aligné, passe à 4 fils toutes les deux heures, je veux que l'app marche de bout en bout rapidement pour que je teste » : cycle toutes les 2 heures, 4 fils, priorité au parcours complet testable.
- #studio : aucun message nouveau.

## Fait
- Fusionnées : **code de 0092** (#507, temps de trajet conservés) ; **amendement 1 de 0092** (#529, suppression de `prototype.trajets` au retour arrière acceptée) ; statut du 107e cycle (#528).
- `coords-purge` (#527) : cause trouvée, ce n'est pas le code. L'environnement `coords-purge` n'a pas ses quatre secrets (`COORDS_PURGE_PG*` vides), le rôle `vadrouille_coords_purge` est à créer (`db/README.md` § 4) ; attend Samuel (Q438).
- Les sous-agents Opus ont atteint leur limite de la semaine (jusqu'au 2026-10-22 00:00 UTC) ; les fils tournent sur Sonnet d'ici là. Le 108e cycle de 15 h 13 et celui de 18 h 08 n'ont rien lancé de neuf pour cette raison.

## En cours
- tech-lead : **0096** (#525), correction 2, la **dernière** (normalisation des noms de lieux, trois bloquants Sécurité).
- backend : **B4a** (#531, paiement simulé en base et déblocage).
- backend : **B6b** (#532, lecture réelle des séjours et journées).
- data : PR de workflow pour ajouter 0011 et 0012 à `MIGRATIONS_APPROUVEES` (Q509), puis `owner-approved` de Samuel.

## Bloqué
- **Chaîne de l'aperçu** : 0096 → B7b (#524) → B9c (#522) → B9d, B9e ; B9a attend aussi B7b.
- **Affichage des voyages sur `p0-reel`** : migrations 0011 et 0012 approuvées puis appliquées par Samuel → report `main` → `p0-reel`.
- **0093, tâche C** : verdict Sécurité ; tâche A prête (après un fil libre).
- **Lots 2 à 4 de l'amendement 3** : Q-L2a après la fusion de B7b (Q516) ; verdicts Sécurité (Q508).
- **#519** (règles de lint de B9-TL-1) : pas dans le même cycle qu'une sous-tâche de B9.
- **Purge du MVP et `coords-purge`** : Q438.

## Prochain cycle
1. Fusion de 0096, puis B7b (#524), puis B9c.
2. B4a et B6b : revue et corrections.
3. 0093 tâche A ; #519 ; B8b.
4. Samuel : `owner-approved` sur la PR des migrations, puis lancer `db-migrate` ; carte du fusible en mode réel (Q506) ; ouvrir le voyage Rome une seule fois.

## Décisions attendues de Samuel
- **Réponses demandées** : Q511 (un seul quartier par jour, ou un ou deux voisins ; carte de décision), Q507 (« Je confirme 0093 » sur #512), Q506 (fusible de 2 USD aussi en mode réel ?), Q509 (0012 dans `MIGRATIONS_APPROUVEES`) ; Q502 et Q497 n'ont plus d'effet une fois Q507 donnée (0093 point 2).
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
- Aucune ; Q507 et Q511 répondues.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
