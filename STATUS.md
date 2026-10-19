# État du studio — 2026-10-18 (105e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 3 sur 20 de la nouvelle feuille, cycles 103 à 122) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 104e cycle ; #studio : aucun message nouveau.
- 06:15 UTC : carte de décision posée à Samuel (Q511) : un seul quartier par jour, ou un ou deux quartiers voisins.

## Fait
- Fusionnées : **décision 0092** (#504, temps de trajet du prototype conservés) ; **B9b** (#517, création du voyage et état de génération, migration 0012) ; statut du 104e cycle (#518).
- Ticket #519 ouvert : consigner les décisions du Tech Lead sur B9b, puis les règles de lint de B9-TL-1 (jamais dans le même cycle qu'une sous-tâche de B9).

## En cours
- tech-lead : **0094** (#516), correction 2, la **dernière** : valeur par défaut `secteursParJourMax` remise à 2 (la règle d'un ou deux secteurs voisins reste en vigueur jusqu'à la réponse de Samuel, Q511), migration 0013 après 0011 et 0012, tests qui énumèrent les tables du schéma `prototype`.
- ux-ui : décision écrite sur l'affichage d'un trajet sans durée (libellés, journée sans total, carte sans trajet, accessibilité) ; préalable de la correction de #509.
- backend : #507 (code de 0092) remis à jour avec `main`, conflits avec B9b (journal des migrations, instantané 0012, tests de base).

## Bloqué
- **#509** (contrat des durées nullables) : changements demandés, correction 1 comptée (tests du contrat, durée inventée dans l'analytique, libellés sans décision UX) ; reprise après la décision UX.
- **Affichage des voyages sur `p0-reel`** : #509 → #507 → migration 0011 → report `main` → `p0-reel`.
- **0093, tâches A et C** : « Je confirme 0093 » de Samuel sur #512 (Q507), pas encore écrit ; C aussi après un verdict Sécurité.
- **B9c** (aperçu) : B9b fusionnée ; pas dans le même cycle qu'une PR qui modifie `src/server/env/index.ts`, `eslint.config.mjs` ou les listes du confinement (donc pas avec #519).
- **Lots 2 à 4 de l'amendement 3** : fusion de 0094 ; verdicts Sécurité (Q508).
- **B4a**, **B8b**, **B9a** : jamais dans le même cycle qu'une autre sous-tâche de B9 qui partage leurs fichiers (0078, spécification B9).
- **Purge du MVP** : Q438. **`coords-purge`** en échec : ticket à ouvrir.

## Prochain cycle
1. Correction de #509 après la décision UX, puis `needs-review` sur #507.
2. B9c (aperçu), priorité 1 de Samuel.
3. Vague 1 des lots 2 à 4 dès la fusion de 0094.
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
- Q511.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
