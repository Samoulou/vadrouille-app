# État du studio — 2026-10-22 (137e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun message de Samuel depuis le 135e cycle (dernier message : 2026-10-21 16:31 UTC). Deux gestes l'attendent, dans l'ordre recommandé : le libellé `owner-approved` sur #666 (après vérification de l'absence de ligne `kind = 'batch'` sur la base d'essai), puis un run `db-migrate` (`sha_attendu` = tête de `main`) ; ensuite la fusion de #648 (« Create a merge commit », puis relancer Rome). Correction du 136e cycle : #667 n'avait pas besoin d'`owner-approved` (0035 ne vise que `.github/workflows/`, pas `src/workflows/` ; Q592 close).

## Fait
- **B10b-serveur** (#667) **fusionnée** à 04:20 UTC par la fusion automatique (Tech Lead et Sécurité approuvés, CI verte après une relance unique : `docker` et `db` avaient échoué sur le téléchargement des polices Google pendant `next build`, service externe hors du diff ; commentaire sur la PR). `main` = `d402de2`. **B10b est entièrement fusionnée** (migration, moteur, serveur) ; son activation réelle reste fermée (`RECALCUL_FIN_APERCU = false`, forfait `lot` nul) tant que la migration de restriction de l'`UPDATE` (0120 S8) n'est pas faite.
- Statut du 136e cycle (#669) fusionné.
- Vérifié pour le report #648, qui embarque maintenant le serveur B10b : aucune lecture des colonnes de 0015 sur le chemin de l'aperçu, du tri et du voyage complet ; une seule écriture les nomme, la création de la ligne `batch` à la clôture du tri d'un voyage **débloqué** (`src/server/presentation/tri.ts`, `ouvrirLotApresCloture`), qui échouerait sur la base d'essai tant que 0015 n'est pas appliquée. D'où l'ordre recommandé ci-dessus : 0015 d'abord, report ensuite (ou report d'abord sans utiliser « Débloquer » avant la migration). Corps de #648 mis à jour.

## En cours
- Samuel : `owner-approved` sur #666, `db-migrate`, fusion de #648 puis essai de Rome ; le studio ne lance aucun essai.
- Aucun fil de code en cours. Aucune autre tâche prête : #527 attend Q438, #583 attend Q538, #500 gelée, #534/#547 attendent Q518-Q519 et la décision UX/UI ; la migration de restriction de l'`UPDATE` (0120 S8, Q586) attend la fusion de #666 (jamais deux PR de migration dans le même cycle) ; #664 attend le premier essai réel ; B10c/B10d attendent le premier essai du tri réel.

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Si #666 est fusionnée : dire à Samuel de lancer `db-migrate` une fois (`sha_attendu` = tête de `main`) ; au cycle suivant, ticket `[data]` de la migration de restriction de l'`UPDATE` (0120 S8, Q585, Q586).
2. Si #648 est fusionnée : lire le résultat de l'essai de Rome (journal de l'exécution, rapport) ; corriger ce qu'il révèle en priorité.
3. Note de version : la routine « Release » de 09:52 UTC couvre #667 (B10b-serveur) ; vérifier qu'elle mentionne 0120 et l'interrupteur fermé.
4. Samuel : #666 puis `db-migrate`, puis #648 ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 à Q561.

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
- Q594 (ordre migration 0015 / report #648, Samuel). Q592 close : sans objet.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
