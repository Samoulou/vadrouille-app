# État du studio — 2026-10-15 (78e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- Fil du cycle, 2026-10-15 : 13:47 UTC, carte « Oui, partout » (délai de 6 heures aussi pour les décisions en attente) → décision 0068 ; 13:57 UTC, commentaire « Je confirme 00068 » sur #378 → fusion de 0068. 14:32 UTC, « Ça avance ? » → état et lien du lot 2. 14:33 UTC, `owner-approved` sur #380 (« Done ») → fusion, lot 2 appliqué.
- #studio : aucun nouveau message.

## Fait
- Fusionnés depuis le 77e cycle : #378 (décision 0068, délai de veto de 6 heures ; un amendement se compte à part), #380 (lot 2 approuvé), #379 (état du 77e cycle).
- **Lot 2 appliqué à la vraie base** : `db-migrate` (run 38752814907, 14:40 UTC) applique `0005_prototype_coordinates_run` ; 0000 à 0004 ignorées (déjà appliquées).
- **A16 fait, favorable** : `db-releve` (run 38753837888) ; R8 `f` (verrou S8 tenu), R6 conforme, `plpgsql` seule extension, aucun rôle `vadrouille_*` super-utilisateur ; consigné sur #374. Condition 4 de 0056 § 4.1 déclarée à 19:37 UTC sans veto (0057 § 7.1).
- **A11 fait** : relevé de 0065 § 7 sur `p0-reel` : barrière TLS et garde ouvertes, fonction en `fra1`, règle de `p0-reel` conforme (consigné sur #369). Q426 close.
- Liste de contrôle de l'essai remise à jour par la Sécurité (`/mnt/project-files/essai-reel/checklist-essai.md`, 15:10 UTC).

## En cours
- data : A17, PR de déverrouillage #381 en **brouillon** (migration 0006, retour arrière identique au texte figé). Les changements de `tests/db/` exigés par 0056 § 4.5 sont refusés aux agents par le filtre de sécurité : Samuel les applique lui-même (Q457).
- Sécurité : e2e de la préversion par le lien de partage du connecteur (option iii, décidée par le CEO, Q458) : amendement de 0063 point 8, puis relevé avant le déverrouillage.
- Product Owner : A5, P0r4 avant ou après l'essai d'intégration.

## Bloqué
- **Premier essai réel** (lancé par Samuel seul) : relevé S7 dans la console Neon (Q456), tests de `tests/db/` (Q457), conditions 1 et 4 à 19:37 UTC (ou Q455), revue de #381 puis `owner-approved`, application (A18) et relevé (A19) ; P0r4 (A5) ; limites de dépense (Q325) ; accord écrit de Samuel (0055).
- **B8c** : Q445. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel.
2. Consigner le relevé S7 dès la réponse de Samuel ; #381 en revue dès les tests posés ; e2e de préversion ; P0r4.
3. Surveiller `p0-purge` planifié (18:17 UTC) : condition 5 (succès de moins de 12 h).

## Décisions attendues de Samuel
- **Réponses demandées** : Q455 (carte, lever le délai sur les parties de 0057 amendées par 0066 et 0067), Q456 (relevé S7 dans la console Neon), Q457 (tests de `tests/db/` pour #381). Bientôt : Q325 (limites de dépense).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q455 à Q458.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
