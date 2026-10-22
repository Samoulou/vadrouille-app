# État du studio — 2026-10-22 (140e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 2026-10-22 11:42 UTC (fil) : « done » : `owner-approved` posé sur #681, fusionnée à 11:41 UTC.
- 2026-10-22 11:51 UTC (fil) : « migration done » : run `db-migrate` 39773388536 (11:48 UTC, `sha_attendu` = `ce414b2`) vert, « Appliquée : 0016_restriction_update_generation_runs », 0000 à 0015 déjà appliquées. Rien d'autre ne lui est demandé. Son analyse de la densité (Q595) reste attendue sans urgence.

## Fait
- **Spécification du lot 2a** (site web de l'activité, #674) **fusionnée** à 10:20 UTC après la correction 1 (§ 11, amendement 2 : champ `site` du prompt `programme` v2, vérification bornée, compteurs `sites*`, critères A13 à A24).
- **Approbation de la migration 0016** dans `db-migrate` (#681, ticket #677) : Tech Lead approuvé sans bloquant, `owner-approved` de Samuel, fusionnée à 11:41 UTC ; **migration 0016 appliquée sur la base** à 11:48 UTC par Samuel. La restriction de l'`UPDATE` de `vadrouille_app` sur `generation_runs` (0120 S8, Q585) est en vigueur. Le recalcul réel (`RECALCUL_FIN_APERCU`, forfait du lot) reste fermé : son ouverture est une décision à part.
- **Décision 0121** (Tech Lead, #683, ticket #678) ouverte : Q585 consignée, T9 (vérification des adresses dans `etapeProgramme`, phase ancrage, en mémoire seulement, compteurs sur `p0.programme_written`, `GET` seul), T10 (garde unique dans `fetch-page.ts`, module `src/server/p0/sites.ts`), T11 (prompt `programme` v2, jeu d'évaluation, `prompts-versionnes.test.ts`). Première relecture : 1 bloquant (source du signal « barrière de sortie fermée »), 5 mineurs ; correction 1 lancée avec la décision du CEO : `creerVerificateurStatut` expose l'état « barrière fermée », `src/research` reste le seul importateur d'`egress`, aucune règle d'import ne change.
- **Décision 0122** (Sécurité, #682, ticket #679) ouverte : S6 approuvé sous 14 conditions (forme de l'adresse, hôtes Google refusés à chaque saut, requête constante sans cookie, corps jamais décodé, 3 redirections, plafonds 80/8/5 s/60 s en constantes, origine `programme()` seulement, aucune adresse dans le journal) ; S7 : compteurs `sites*` en liste fermée, seul le champ `site` est une voie d'adresse de l'IA, ligne oui/non du texte copié admise (Q597). Première relecture : 4 bloquants (prémisses périmées, `HEAD`, critère A2, formulation 2.2.1), 7 mineurs ; correction 1 lancée avec les décisions du CEO : `GET` seul ; A2 à séparer par le Product Owner avant le code (`placeId` seul ; ligne « sites » seule).
- Statut du 139e cycle (#680) fusionné. Purge `p0-purge` : dernier run vert (11:53 UTC).

## En cours
- **#683 `[tl]` décision 0121** : correction 1 (comptée) en cours.
- **#682 `[secu]` décision 0122** : correction 1 (comptée) en cours ; fusion avec ou après 0121.
- **#684 `[po]` amendement 3 du § 11** (branche `claude/684-amendement-3`) : A2 séparé et définition de la ligne « sites », § 11.9 (moment d'écriture de `p0.programme_written`), barrière fermée = `sitesUnchecked`, A18/A23 (zéro octet admis), requête et fragment retirés, renvoi § 11.4, `GET` seul ; fusion après 0121 et 0122.
- Trois fils en parallèle. Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519, UX/UI), #664 et B10c/B10d (premier essai du tri réel), densité (Q595).

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Relire #683 (corr. 1), #682 (corr. 1), #684 ; corrections si demandées (max deux par tâche ; au-delà, CEO + Tech Lead : troisième tentative ou découpage).
2. Quand 0121, 0122 et l'amendement 3 sont fusionnés : ticket `[ia]` du code du lot 2a (prompt `programme` v2, `fetch-page.ts` statut seulement, `src/server/p0/sites.ts`, `Stop.source`), hors du cycle d'une autre PR touchant `src/ai/prompts/programme.ts` ou `src/server/p0/`.
3. Densité du programme : attendre l'analyse de Samuel (Q595).
4. Samuel : rien d'attendu pour le lot 2a ; Q595 (densité, à son rythme) ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 (reste prix/horaires) à Q561.

## Décisions attendues de Samuel
- **Réponses demandées** : Q509 (fait : 0011 et 0012 appliquées le 2026-10-20), fusion de #580 (`main` → `p0-reel`), Q525 (réserve Google et plafonds Places de la tâche A2), Q527 (barrière des appels réels de l'aperçu), Q529 (option (a) de la question 4 de 0102, refusée par la Sécurité sans amendement de S4), Q506 (fusible de 2 USD aussi en mode réel ?), Q518 et Q519 (tâche C de 0093), Q520 (plafonds de relecture de B8b).
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
- Q598 (Product Owner, amendement 3 : critère A2 séparé et définition de la ligne « sites », ticket #684), Q599 (Product Owner, écart A18/A23 : lecture de zéro octet admise ?), Q600 (Tech Lead et Sécurité, information : signal « barrière de sortie fermée » exposé par `creerVerificateurStatut`, décision du CEO à consigner dans 0121 et 0122). Répondues : Q596 (oui, 0121 § 1), Q597 (oui, 0122 S7 c : ligne oui/non sans nombre). Réglée : la suite de Q594 (0016 appliquée, 11:48 UTC).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
