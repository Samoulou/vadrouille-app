# État du studio — 2026-10-19 (106e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 4 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 105e cycle ; #studio : aucun message nouveau. Q511 (carte) et Q507 (« Je confirme 0093 ») toujours sans réponse.

## Fait
- Fusionnées : **décision 0095** (#521, trajet sans durée et journée sans total : « durée à confirmer », « Temps de trajet à confirmer ») ; **contrat des durées nullables** (#509, correction 1) ; statut du 105e cycle (#520).
- #507 (code de 0092) : `main` fusionnée avec B9b (journal 0011 puis 0012, parent de l'instantané 0012 corrigé, base neuve vérifiée en local).
- Ticket #522 ouvert : **B9c** (aperçu, workflows 1, 2 et 3).

## En cours
- backend : **B9c** (#522), priorité 1 de Samuel ; vérifie d'abord ses préalables, doubles seulement, aucun appel réel.
- tech-lead : **0094** (#516), bloquant tardif non compté (table `prototype.run_plans` renommée sans « plan », garde de `schema.test.ts`) et mineurs.
- backend : #507 remise à jour après #509, puis `needs-review`.

## Bloqué
- **Affichage des voyages sur `p0-reel`** : #507 → migration 0011 → report `main` → `p0-reel`.
- **0093, tâches A et C** : « Je confirme 0093 » de Samuel sur #512 (Q507) ; C aussi après un verdict Sécurité.
- **#519** (règles de lint de B9-TL-1) : pas dans le même cycle que B9c.
- **Lots 2 à 4 de l'amendement 3** : fusion de 0094 ; verdicts Sécurité (Q508).
- **B4a**, **B8b**, **B9a** : jamais dans le même cycle qu'une autre sous-tâche de B9 qui partage leurs fichiers (0078, spécification B9).
- **Purge du MVP** : Q438. **`coords-purge`** en échec : ticket à ouvrir.

## Prochain cycle
1. Suite de B9c ; `needs-review` et revue de #507.
2. Vague 1 des lots 2 à 4 dès la fusion de 0094.
3. Après B9c : #519, puis B10 (« J'aime / J'aime pas »).
4. Samuel : « Je confirme 0093 » sur #512 ; carte « un ou deux quartiers » ; carte du fusible en mode réel (Q506) ; ouvrir le voyage Rome une seule fois.

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
- Q512, Q513.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
