# État du studio — 2026-10-18 (98e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 14 sur 20) · Tableau de bord produit : https://claude.ai/artifact/91yQ94uq5Zm8Heovkvc36v (republié à chaque fin de cycle).

## Messages de Samuel traités (projet)
- 08:39 UTC : essai à Rome avec sa description (ticket #478) ; brief `rome-1` fusionné (#479), report sur le site d'essai (#480) **fusionné par Samuel** à 09:25 UTC ; essai réel lancé par Samuel, programme écrit et listé.
- 09:40 UTC : « les trois derniers jours les activités s'arrêtent à 13 h » : diagnostic ia-recherche (23 candidats pour environ 34 lieux demandés, jours remplis dans l'ordre) ; correction lancée (ticket #483).
- #studio : aucun message nouveau.

## Fait
- Fusionnées : statut du 97e cycle (#477), **brief d'essai Rome** (#479), **décision 0087** (#476, préalables de B9b et B9c ; définitive à 15:23 UTC, 0068), report `main` → `p0-reel` (#480, par Samuel).
- B6a (#473) : CI réparée (3c8c907 : `lecture.test.ts` sans import direct de drizzle, aucune ligne de confinement ajoutée) ; revue relancée.
- 0087 : bloquant tardif corrigé (`request_id` des versions d'une exécution `full`, UUID v5 dérivé) avant fusion.

## En cours
- ia-recherche : **remplissage du séjour** (#483 : cibles de recherche tirées du brief, répartition des lieux sur tous les jours, demande bornée par la fenêtre du jour, soirée comptée sur `slotFit`).
- ia-recherche : **B8-PO-13, B8-PO-15 et remplacement de `ancrerLogement`** (#481) ; `needs-review` après 15:23 UTC (fin du délai de 0087).
- backend : **PR de contrat de B9d** (#482 : `kind` de la reprise, `getFullTripStatus`) ; `needs-review` après 15:23 UTC.
- Revue : B6a (#473).

## Bloqué
- **B4a** et **B8b** : après B6a (B4a jamais dans le même cycle, 0078).
- **B3b-envoi, suite** (#435) : P5 de la Sécurité pour `SMTP_URL`.
- **B9** : B9b après B6a et les noms de colonnes (data, Q492) ; B9c après #481 ; B9d : verdict Sécurité (Q492) ; B9c réel : Q468 ; B9e : Q467.
- **Purge du MVP** : activation Q438 (Samuel).
- **Compteurs de fin d'essai** (`p0.final_counts`, correction 4 du diagnostic Rome) : touche `src/server/log.ts`, interdit dans le cycle de B6a ; après B6a (Q493).

## Prochain cycle
1. Après la fusion de #483 : report `main` → `p0-reel` pour que Samuel relance Rome.
2. Après 15:23 UTC : `needs-review` sur #481 et #482.
3. Après la fusion de B6a : B9b (backend), puis B4a dans un autre cycle ; ticket des compteurs de fin d'essai (Q493).
4. Tickets à placer : police servie localement (Q484), mineurs de B8a, page de jugement de P0r4, refus de lancement si la purge a plus de 24 h, appels Google dans le rapport d'essai, adaptateur Resend, message « accès expiré », mineurs de B8c et erratum de 0060 (Q477), purge de rétention de `verifications.identifier`, PR de décision sur 0007.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q39, Q45, Q465 et Q491 répondues le 2026-10-18).
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
- Q493.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
