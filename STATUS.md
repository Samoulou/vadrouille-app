# État du studio — 2026-10-10 (19e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

Cette PR reprend #93 (état du 18e cycle, non fusionnée) et la remplace.

## Messages de Samuel traités
- Aucun nouveau message dans #studio depuis le résumé du 18e cycle (2026-10-10 02:43 CEST).

## Fait
- **F11c — Page introuvable, page d'erreur, catalogue des états (#92) : fusionnée** (b687caf). Ticket #89 fermé avec un renvoi.
- **Ticket #90 (spec F12)** fermé avec un renvoi vers #91, fusionnée au 18e cycle.

## En cours (toutes en `needs-review`)
- **T13 — Décisions du Tech Lead pour F12 (PR #95, ticket #94)** : nouvelle, `docs-only`. Décision 0022, sans code.
  - F12-TL-4 retenue ; les 7 autres retenues avec modification ou précisions.
  - Lighthouse en Node sur le Chromium de Playwright, sans `@lhci/cli` ni stockage public ; rapport d'erreurs désactivé ; médiane de 3 passages sur R11 et R12.
  - Mesure dans une étape du job `verify` (projet Playwright `perf`, hors `pnpm verify`) plutôt qu'un job séparé : un nouveau job demanderait de changer les vérifications requises du dépôt.
  - Pas de projet Playwright « grand écran » : les specs `grand-ecran-*` se placent à 1280 × 800 ; seule F12a touche `playwright.config.ts`.
  - Amende 0016 § 1.3 : `TripShell` mesure son conteneur au lieu de la fenêtre.
  - Questions : Q178 et Q180 (Product Owner), Q179 (CEO, tranchée : T4 reste avant F12a et F5c, et attend Q119).
  - `pnpm verify` en local : tout passe sauf `test:visual` (18 captures sur 23 à 2 ou 3 % d'écart, rendu du texte de la session ; la PR ne touche que `docs/`, la CI ne lance pas les tests pour une PR de documentation seule, cas décrit par 0004).
- **F9a — Débloquer, paiement simulé (PR #86, ticket #83)** : 2e et dernière correction faite (145f3d9), CI verte ; aucune nouvelle revue depuis. Si une 3e correction est demandée, la tâche passe en bloqué.
- **T8 — Décision 0019 (PR #72, ticket #71)** et **U2 — Correction de la décision 0018 (PR #67, ticket #63)** : toujours en attente de revue, sans changement.
- **État du 18e cycle (#93)** : remplacée par cette PR.

## Bloqué
- **Spec F10 (PR #76, ticket #75)** : 2 tentatives épuisées, 3e correction demandée : **Q163**. Sans changement. Les 5 bloquants restants sont un alignement sur la décision 0020, fusionnée après la rédaction de la spec (relève de Q122).
- **F5b — Fiche étape (PR #66, ticket #61)** et **T5 — Décision 0017 (PR #65, ticket #62)** : 2 tentatives épuisées : **Q119**. Sans changement.
- En conséquence, la suite du code attend Q119 : T4, F5c, F7a, T6 (après F5b) ; T7, F8a (après #65) ; F11a (après T4) ; F12a (après T4, Q179).
- **B0 (#27, ticket #22)** et **U1 (#26, ticket #23)** : en attente de Q43, sans changement.
- **Release** : tag et release GitHub (Q118).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes (Q103).
- **Aucune autre tâche prête ce cycle** : la spec F7 révisée attend #67 et #72 ; F11a et F12a attendent T4 ; F12b attend F5c ; F12c attend F12a.
- **Décisions déléguées non prises**, parce qu'elles touchent des fichiers en revue ou bloqués :
  - UX/UI : Q32, Q51, Q53, Q62 (#26), Q115 (#66), Q112 (#65) ;
  - Product Owner : Q41, Q42, Q50 (#27), Q110 et Q104 (spec F7, après #67 et #72), Q114 (#66).

## Décisions attendues de Samuel
- **Règles du studio** :
  - Q163 : 3e tentative pour la spec F10 (#76), dont les 5 bloquants restants sont un alignement sur 0020, fusionnée après sa rédaction ; ou attente de Q122 ;
  - **Q119 (la plus urgente)** : 3e tentative pour #65 et #66, découpage, ou attente. Toute la suite du code en dépend ;
  - Q120 à Q122 (décision 0019) : règle de revue dans le prompt R2, libellés `ux-approved` et `secu-approved`, correction due à un bloquant signalé tard non comptée comme tentative ;
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Phases** : Q152 : souvenir partageable exclu de F11 ; **Q176 (nouvelle, spec F12)** : adaptation grand écran du parcours mobile suffisante pour le MVP, vues bureau des agences hors MVP ? Q137 : le hors-ligne fait-il partie du MVP mis en service ? Le cadrage le range après le MVP, le handover l'inclut.
- **Juridique, à la suite de Q5** : Q5, Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q48, Q75, Q127 ; Q139 ; **Q170 (nouvelle, spec F12)** : déclaration d'accessibilité et Acte européen sur l'accessibilité ; Q150 : consentement de « Retenir mes goûts », durées de conservation, effacement.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE ;
  - Q84 : longueur maximale du récit ;
  - Q103 : compte Google Cloud et clé Places ;
  - Q129 : remboursement d'un second paiement ;
  - Q140 : carte Google facturée à chaque visite de la vue partagée ;
  - **Q171 (nouvelle, spec F12)** : audit humain avec lecteurs d'écran, interne ou payant ;
  - **Q172 (nouvelle, spec F12)** : clé Maps de test pour mesurer la performance avec la vraie carte (liée à Q103) ;
  - Q118 : tag et release GitHub de v2026.10.09-09, ou droits de la routine release.
- **Offre et cadrage** : Q57, Q63, Q67, Q76, Q78, Q88, Q89, Q90 (partie Google) ; Q128 « Ce qui est inclus », Q133 autres entrées « Débloquer », Q135 « un aperçu actif à la fois » ; Q138 ; **nouvelles (spec F11)** : Q149 accès à un voyage 30 jours après le retour, Q151 usage des avis et lieux découverts.
- **Durées et documents** : Q27, Q12 (maquettes), Q59 (Dossier UX).
- **Clés et environnement** :
  - Q31 : `*.vercel.app`, dont dépend la carte de la démonstration ;
  - Q40 : Docker ;
  - Q98 : le déploiement de `main` est une démonstration, pas une mise en production ;
  - Q131 : paiement simulé sur la démonstration Vercel, état partagé entre visiteurs ;
  - Q101 : connexion simulée sur les prévisualisations Vercel. Précision de 0017 : la session y serait partagée entre visiteurs.
- **Ligne** :
  - Q37 ;
  - Q130 : logos TWINT et cartes ;
  - **Q177 (nouvelle, spec F12)** : largeurs grand écran et survol dans Ligne ;
  - Q157 : une plaque par écran contre les « cartes de voyage » du handover ;
  - Q108 : icônes « moins » et chevron, tokens de la mini-ligne et du champ de montant, coche `on-line`.
- Configuration de la routine R1 sur 3 h (à faire par Samuel).
- **Veto possible** :
  - échues le 2026-10-10 sans veto lu dans #studio, donc définitives : ADR 0005, PO-1 à PO-7 (B0), ADR 0001 « Évolution », F4-PO, F6-PO-1 à F6-PO-16, ADR 0013, Q66, F5-PO-1 à F5-PO-18 sauf F5-PO-10 ;
  - avant le 2026-10-11 :
  - décisions 0014, 0015 et 0016 ;
  - F7-PO-1 à F7-PO-19 ;
  - F8-PO-1 à F8-PO-17 ;
  - D1-PO-1 à D1-PO-6 ;
  - décision 0018 (UX/UI, #64 et #67) ;
  - Q81, Q93, Q105 ;
  - Q113 (CEO) : T7 dès la fusion de #65, puis T6 après F5b ;
  - si #65 est fusionnée : décision 0017 (Tech Lead), dans les 2 jours qui suivent ;
  - si #72 et #73 sont fusionnées : décision 0019 (Tech Lead), F9-PO-1 à F9-PO-20, Q125 et Q134 (CEO) ;
  - si #76 est fusionnée : F10-PO-1 à F10-PO-19 (dont Q50) et Q143 (CEO) ;
  - avant le 2026-10-11 : décision 0020 (Tech Lead, #80 fusionnée) ; F11-PO-1 à F11-PO-20, Q153 et Q156 (CEO, #81 fusionnée) ; décision 0021 (Tech Lead, #85 fusionnée) ;
  - si #86 est fusionnée : écarts de F9a listés dans la PR (Product Owner et frontend).
  - avant le 2026-10-12 : F12-PO-1 à F12-PO-21 (#91, fusionnée ; F12-PO-2 et F12-PO-4 étendent les budgets du handover § 14) ; Q175 (CEO) ; réponses du Tech Lead Q160, Q161, Q164 (revue de #86) ;
  - rendus provisoires de F11c (Q154, #92 fusionnée) : avant le 2026-10-12 ;
  - si #95 est fusionnée : décision 0022 (Tech Lead, F12-TL-1 à F12-TL-8, amende 0016 § 1.3) ; Q179 (CEO) : avant le 2026-10-12.

## Prochain cycle
1. Appliquer les réponses de Samuel à Q119 (#65, #66), Q163 (#76) et Q43 (#26, #27). Dès Q119 : T4, puis F5c, F11a et F12a.
2. Suivre #95 (T13), #86 (F9a, dernière correction faite), #72 et #67. Après #72 : T9 en tête.
3. Product Owner, après #67 et #72 : une seule PR pour la spec F7 (Q110, Q104, 0019), plus Q136, Q147, Q158 et Q159 ; Q178 et Q180 à la prochaine mise à jour de la spec F12.

## Part d'usage estimée
- 19e cycle (2026-10-10) : environ 260 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| T13, décision 0022 | ≈ 170 000 |
| Pilotage, état | ≈ 90 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 18e cycle (02:43 CEST) : aucun.
