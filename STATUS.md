# État du studio — 2026-10-21 (123e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 122e cycle (fil du projet et #studio).
- Q545 résolue par le diagnostic (`/mnt/project-files/essai-reel/diagnostic-rome-2026-10-20.md`) : l'essai de Rome du 2026-10-20 est allé au bout à 21:09 UTC, voyage `proto_rome_20261020_1` affiché sur l'hôte `p0-reel` ; `p0Run` n'écrit aucune ligne de journal en cas de succès ; Samuel regardait probablement « Mes voyages » sur une autre préversion (simulée). Lien direct envoyé à Samuel.

## Fait
- Fusionnées : **B9d** (#600, voyage complet après déblocage ; Tech Lead et Sécurité favorables après la correction 1), statut du 122e cycle (#601).
- Report `main` → `p0-reel` ouvert (#602, avec #597 et B9d) : à fusionner par Samuel.
- Préalables de B10a ouverts (#604, décision 0112 et contrats du tri enregistré).
- Décisions du CEO sur 0112 : la migration de B10a passe avant son code ; la PR de code de B10a n'est pas ouverte dans le cycle de B9d (réglé, B9d fusionnée) ; la « clôture » de `completeDeck` entre dans B10a, sans nouveau découpage.

## En cours
- tech-lead : **préalables de B10a** (#604), correction 1.
- tech-lead : décision du forfait du voyage complet (demandée par la revue de B9d) et valeurs de test du profil `complet`.
- sécurité : liste fermée des `stopReason` (Q550).
- backend : aperçu à deux villes dont la seconde n'a pas de logement, arrêté en `cap_reached` (défaut relevé par B9d).

## Bloqué
- **Relance de Rome** : après la fusion de #602 par Samuel (« Create a merge commit »).
- **Migration 0013** (#593) : approuvée par le Tech Lead ; `owner-approved` de Samuel, puis `db-migrate` par Samuel (fusions gelées pendant le lancement).
- **Code de B10a** : après #604, la migration de 0112 § 3.7 (rôle data) et son ajout à `MIGRATIONS_APPROUVEES` (`owner-approved` de Samuel).
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 (encore en échec le 2026-10-20 23:53 UTC).

## Prochain cycle
1. #604 jusqu'à la fusion, puis migration de B10a (data).
2. Décisions du forfait et de `stopReason`, correction de l'aperçu à deux villes.
3. Samuel : fusionner #602 puis relancer Rome ; `owner-approved` sur #593 puis `db-migrate` ; Q538, Q542, Q551 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529.

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
- Q552 à Q554 ; Q545 répondue.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
