# État du studio — 2026-10-17 (88e cycle)

Phase : 0 — Valider, avec la construction de toute la chaîne MVP ouverte (décision 0029, fusionnée) · Régime : cycle toutes les 3 heures (routine « Vadrouille - Cycle (projet) », 7 */3 * * * UTC), au plus 3 fils en parallèle · Feuille de route : `/mnt/project-files/plans/roadmap-20-cycles.md` (cycle 4 sur 20).

## Messages de Samuel traités (projet)
- Aucun nouveau message depuis le 87e cycle (fil du cycle ni #studio).

## Fait
- Fusionnées : statut du 87e cycle (#431), **spécification B9** (#429, après un bloquant tardif non compté), **B7a** (#424, couche IA de production, fusionnée à 06:23 UTC après la fin du veto de 0080).
- **F8c** (#432) : corrections 1 et 2 faites (`activeTripId` dans `ApiError`, références visuelles, textes provisoires consignés dans la spec F8) ; il restait un bloquant de rédaction : troisième tentative bornée (Q470), documentation seulement, poussée.

## En cours
- tech-lead : **décision 0081** (#434, ticket #433, B9-TL-1 à B9-TL-14) ; correction 1 (comptée) poussée, en revue.
- backend : **B3b** (ticket #435), envoi du code de connexion par e-mail vers Mailpit seulement.
- frontend : F8c (#432), revue de la troisième tentative bornée après CI verte.
- En attente de Samuel : release `main` → `p0-reel` (#422, carte et temps de trajet) après son accord écrit sur #419.

## Bloqué
- **B8c** : pas dans le même cycle que B3b. **B7c** : B9-TL-4 (#434) puis 6 h de veto. **B8a** : B7c. **B4a** : B3b, Q352, Sécurité sur B4-TL-3 et B4-TL-6. **B6a** : B3b. **B3c** : B3b.
- **B9** : B9b après 0081 (et sa PR de contrat) ; PR de moteur de B9-TL-13 avant B9c ; B9e : Q465 (plafonds), Q467 ; B9c réel : Q468.

## Prochain cycle
1. Suivre F8c, 0081 et B3b jusqu'à la fusion ; après 0081 : ticket B7c, ticket de la PR de moteur (B9-TL-13), puis B9b.
2. B8c au cycle suivant celui de B3b.
3. Tickets : page de jugement de P0r4 et son e2e ; refus de lancement si la purge a plus de 24 h ; nombre d'appels Google dans le rapport d'essai ; adaptateur Resend. Cartes à Samuel : Q354, puis Q39/Q465.

## Décisions attendues de Samuel
- **Réponses demandées** : aucune pour l'instant (Q325, Q456 et Q457 closes).
- **Rappel** : Q438 (extension de Q321 et Q322 à la purge du MVP, avec les actions à 18 h ajoutées par la correction 1 de 0060).
- **Rappel aussi** : Q420 (coller les étapes 7, 7 bis et 8 dans la routine R1, #307).
- **Déjà posées** : Q410, Q401, Q397, Q394, Q378, Q263, Q353, Q354, Q345, Q332, Q323, Q317, Q296, Q297, Q288, P0c-Q2.
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
- Q470, Q471.

## Part d'usage estimée
- 74e cycle : sous-agents terminés depuis le 73e : bloquant tardif de #357, correction 1 de #364, décision 0066, correction 1 de #365, correction de `main` (#368), `P0RUN_COMPLET` (#367) ; 1 en cours (#370).
