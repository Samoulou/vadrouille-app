# État du studio — 2026-10-22 (138e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 2 heures (routine « Vadrouille - Cycle (projet) », 7 */2 * * * UTC), au plus 4 fils en parallèle (Samuel, 2026-10-19 21:40 UTC) · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (feuille des 20 cycles terminée au 122e cycle ; on poursuit sa priorité, le parcours de bout en bout) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Fil « Routine cycle du studio », 2026-10-22 : 07:29 UTC « j'ai tout fait il manque que la migration non ? » (il a fusionné #648 à 07:28 et #666 à 07:29 ; réponse : oui, `db-migrate` avec `sha_attendu` = `507d36a…`) ; 07:40 « c'est fait » (run 39741509189 vérifié : `Appliquée : 0015_recalcul_lot`, les quatorze autres déjà présentes) ; 07:49 demande du lien « Mes voyages » (donné) ; 07:51 « c'est beaucoup mieux, combien d'activités pour 5 jours ? quel niveau d'intensité ? » (réponse : 43 créneaux sur 5 jours, repas compris ; brief `rome-1` au rythme `equilibre` ; aucun nombre imposé) ; 07:59 « il va falloir gérer la quantité, chargé pour certaines personnes, je vais analyser » et « avant on avait le site web de l'activité dans le détail » → Q558 (recherche web) répondue de fait : oui pour le lien ; ticket #671 ouvert.

## Fait
- **Premier essai réel de la chaîne inversée** : Rome relancée par Samuel à 07:48 UTC sur `p0-reel` (`eaced27`, report #648 fusionné par lui) : `p0.programme_written` jours 5, créneaux 43, lieux à vérifier 37, rien retiré, un seul appel modèle ; aucune erreur ni avertissement dans les journaux Vercel (06:40 à 08:10 UTC). Jugement de Samuel : « beaucoup mieux ». Deux retours : densité à régler (il analyse d'abord), site web de l'activité disparu (perte de `Stop.source` avec le retrait de la recherche web au lot 1).
- **Migration 0015 appliquée sur la base d'essai** par Samuel (run `db-migrate` 39741509189, 07:35 UTC, succès) après la fusion de #666 (`main` = `507d36a`). B10b est complète code et base ; activation réelle toujours fermée (0120 S8).
- Statut du 137e cycle (#670) fusionné.

## En cours
- **#671 `[po]` Lot 2a — site web de l'activité** : amendement de `specs/P0-programme-par-ia.md` (fil product-owner, branche `claude/671-site-web-activite`). Recommandation CEO : l'IA propose le site officiel (`https`), le code vérifie que l'adresse répond avant affichage, `Stop.source` inchangé côté interface, aucune donnée Google. Code `[ia]` dans un ticket séparé après fusion.
- **#672 `[data]` Migration 0016** — restriction de l'`UPDATE` de `vadrouille_app` sur `generation_runs` (0120 S8, Q585, Q586 ; fil data, branche `claude/672-migration-0016-restriction-update`). La ligne `MIGRATIONS_APPROUVEES` viendra dans une PR de workflow à part (`owner-approved`), jamais le même cycle qu'une autre migration.
- Samuel : analyse de la densité du programme (Q595) ; le studio ne lance aucun essai.
- Toujours en attente : #527 (Q438), #583 (Q538), #500 gelée, #534/#547 (Q518-Q519, décision UX/UI), #664 et B10c/B10d (premier essai du tri réel).

## Bloqué
- **Badge « fermé ce jour-là »** (T8, future 0118) : Q564 à Samuel ; recommandation : juger d'abord le premier essai.
- **Essai réel sur préversion** (B9e) : Q538.
- **0093** : tâche C après Q518 et Q519 ; A2-b après la décision UX/UI ; A2-c seulement si Samuel le décide (Q525).
- **Purge du MVP et `coords-purge`** (#527) : Q438 ; `coords-purge` toujours en échec.
- Incohérence connue : 0117 dit Q557 « en attente » ; la Sécurité la reprend avec 0118.

## Prochain cycle
1. Relire #671 et #672 (corrections si `changes-requested`). Après la fusion de #672 : ticket de la ligne `MIGRATIONS_APPROUVEES` 0016 (`owner-approved` de Samuel), au cycle suivant. Après la fusion de #671 : ticket `[ia]` du code du lot 2a (site web), hors du cycle d'une autre PR touchant `src/ai/prompts/programme.ts` ou `src/server/p0/`.
2. Densité du programme : attendre l'analyse de Samuel (Q595) ; préparer, si demandé, un réglage par le rythme du brief ou la consigne du prompt `programme`.
3. Note de version : la routine « Release » du 22 octobre 07:54 UTC s'est terminée sans nouvelle étiquette ; vérifier au cycle suivant qu'une note couvre #667 et #666.
4. Samuel : Q595 (densité, à son rythme) ; Q564 (facultative) ; Q538, Q542, Q551, Q556 ; Q506, Q518 à Q520, Q525, Q527 (3), Q529 ; facultatives Q558 (reste prix/horaires) à Q561.

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
- Q595 (densité du programme, Samuel). Répondues : Q586 (ticket #672 ouvert), Q594 (réglée par les faits : migration appliquée à 07:35, essai relancé après), Q558 (oui pour le site web ; prix/horaires restent ouverts).

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
