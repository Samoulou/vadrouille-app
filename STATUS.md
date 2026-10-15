# État du studio — 2026-10-15 (70e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle.

## Messages de Samuel traités (projet)
- #studio et fil du cycle : aucun nouveau message depuis le 69e cycle (dernier : 2026-10-14, 23:52 CEST).

## Fait
- Fusionnés depuis le 69e cycle : **P0r3c-3** (#326), **code de 0062** (#343), **décision 0060** (#336, troisième tentative), statut du 69e cycle (#346), puis **P0r3c-4** (#348 : `workflow` 5.1.0, `p0Run` branché pour la recherche et l'ancrage, décision 0063).
- P0r3c-4 : construction de l'image corrigée (`.dockerignore` ré-inclut les 8 fichiers JSON lus par `p0-run.ts`) ; correction 1 de la revue (pont fermé vers `src/domain`, écriture du coût en mode fermé, `devalue` 5.9.4 et `nanoid` 5.1.16 par substitutions en liste fermée).
- **Découpage de P0r3c-4** accepté par le CEO (Q449) : l'étape finale passe en P0r3c-5 ; d'ici là, `startWorkflow` refuse tout démarrage.
- **P0r3c-5a** (#350, ticket #349) : `assemblage` et `vers-moteur` sortent de `scripts/p0` vers `src/server/p0` ; approuvée par le Tech Lead, fusion automatique en attente de la CI.
- Mise à jour de `p0-reel` depuis `main` (#347) ouverte, en attente du clic de Samuel.

## En cours
- En revue : #350 (P0r3c-5a).

## Bloqué
- **Premier essai réel** : P0r3c-5 (étape finale, notation, build montrant `p0Run`) après #350 ; mise à jour de `p0-reel` par Samuel (#347) puis relevé de la section 8 de 0062 ; ouverture de la base d'essai (0052) ; P0r3d (dont l'e2e de la route du workflow, bloquant pour le premier lancement).
- **Purge `p0-purge`** : en échec toutes les 6 heures (cause non relevée ; secrets vides probables, Q387).
- **B8c** : cycles séparés (Q445), après le premier essai. **B6a** : B3b. **B8a** : B7a, B7c. **B3c** : Q401. **Code de B4** : Q351, Q352, Q364.

## Prochain cycle
1. Seulement le chemin de l'essai réel (engagement du 69e cycle).
2. Après #350 : P0r3c-5 (ticket #316).
3. Après le clic de Samuel sur #347 : relevé de la section 8 de 0062 sur la préversion de `p0-reel`.

## Décisions attendues de Samuel
- **Clic demandé** : fusionner #347 (mise à jour de `p0-reel` depuis `main`), demandé dans le fil du cycle.
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307) ; Q387 (a) et (b).
- **Déjà posées** : Q409, Q410, Q401, Q397, Q394, Q378, Q367, Q368, Q263, Q353, Q354, Q345, Q332, Q323, Q325, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q449 (CEO : découpage de P0r3c-4, tranchée), Q450 (Tech Lead et Sécurité : garder la ré-inclusion des JSON de `prototype/` dans l'image ou les déplacer).

## Part d'usage estimée
- 70e cycle (routine) : sous-agents terminés depuis le 69e : P0r3c-4 (code, construction de l'image, correction 1), P0r3c-5a ; 1 au plus en même temps.
