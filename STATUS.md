# État du studio — 2026-10-18 (102e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 18 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 18:49 UTC : carte **« Lever le délai »** de 6 h sur la décision 0092 (garder les temps de trajet), pour la programmer dès cette nuit (Q503).
- #studio : aucun message nouveau de Samuel (seule la revue hebdomadaire du studio, #502).

## Fait
- Fusionnées : décision 0091 (#498, l'exécution Rome de 16:49 UTC ne compte pas), amendement 3 lot 1 (#505 : plan par secteurs, un incontournable = un candidat, infos pratiques), revue hebdomadaire semaine 42 (#502), statut du 101e cycle (#499).
- Fermée sans fusion : #503 (code d'arrêt « limite Google atteinte », ticket #501 fermé) : elle dépendait de l'ancrage (S4 (ii)) ; les arrêts restent `pipeline_failed` en attendant Q500.

## En cours
- tech-lead : **décision 0092** (#504), correction des bloquants tardifs (non comptée) : ajouter la condition 2 (l. 92) et la l. 237 de `specs/P0-prototype-recherche.md` à la liste « Amende » (prototype seulement) et trois mineures.
- Contrat (#509) : `Segment.minutes` et `Day.travelMinutes` acceptent l'absence de durée (« {mode}, durée indisponible ») ; `needs-review` après la fusion de #504.
- backend (#507) : code de 0092 (table `prototype.trajets`, migration 0011, purge 30 jours, relecture sans appel Google si tout est conservé) ; `needs-review` après #509 ; la migration 0011 attend ensuite la PR de workflow `MIGRATIONS_APPROUVEES` avec `owner-approved` de Samuel.

## Bloqué
- **Affichage des voyages sur `p0-reel`** : chaîne #504 → #509 → #507 → migration 0011 (`owner-approved` de Samuel) → report `main` → `p0-reel`.
- **Amendement 3, lots 2 à 4** (#500) : décision du Tech Lead sur l'extension de `CandidatSchema` avant le lot 2 ; questions Q504 et Q505.
- **B9b** : place libre dès qu'un fil se libère.
- **B4a** et **B8b** : jamais dans le même cycle que B9b (0078).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9c réel** : Q468 ; B9d : verdict Sécurité (Q492) ; B9e : Q467.
- **Purge du MVP** : activation Q438 (Samuel).
- **`coords-purge`** en échec (3 runs) : ticket à ouvrir.

## Prochain cycle
1. Fusion de 0092 (#504), puis revue de #509 et #507, puis PR de workflow de la migration 0011, puis report `main` → `p0-reel`.
2. B9b (backend avec data).
3. Samuel ouvre son voyage Rome une seule fois après ~07:00 UTC le 2026-10-19.
4. Tickets à placer : `coords-purge`, tests instables sous charge (e2e « hors des dates », a11y « débloquer écran 9 »), commit affiché sur la page d'essai, police servie localement (Q484), compteurs de fin d'essai (Q493), et la liste du 100e cycle.

## Décisions attendues de Samuel
- **Réponses demandées** : Q500 (un arrêt par la limite Google compte-t-il ?), Q502 (exécution de 16:57 UTC), Q497 (exécution du matin) ; extension au MVP de Q501.
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
- Q503 à Q505.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
