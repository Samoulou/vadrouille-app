# État du studio — 2026-10-09 (17e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

Cette PR reprend #82 (état du 16e cycle, non fusionnée) et la remplace.

## Messages de Samuel traités
- Aucun nouveau message dans #studio depuis le résumé du 16e cycle (20:26 CEST).

## Fait
- **Spec F11 — Mes voyages, Après le voyage, états transverses (#81) : fusionnée** (c303ee7). Ticket #79 fermé avec un renvoi.
- **T11 — Décisions Tech Lead pour F9 (#80) : fusionnée** (15f39f5, décision 0020). Ticket #78 fermé avec un renvoi.

## En cours (toutes en `needs-review`)
- **F9a — Débloquer, paiement simulé, confirmation, état débloqué (PR #86, ticket #83)** : nouvelle, frontend. CI `verify` et `docker` verte sur d7df9a3 ; références visuelles prises sur la CI (décision 0004).
  - Cible de réussite `R11` (F9-PO-18). Garde `paymentDemoAllowed` fermée par défaut et fausse en production ; actions serveur dans `src/server/actions/`, avec `parse-input.ts` et la règle de lint.
  - Prérequis absents de `main` créés selon la spec (l. 285) et 0020 : `values.ts`, `errors.ts`, portée de simulation (`R-sim`), `DestinationPlate`.
  - Budget JavaScript de la Journée : 194 633 o → 196 742 o, sous 200 000 o (mesure hors dépôt, T4 n'étant pas fusionnée).
  - 5e entrée « Débloquer » sur l'accueil de démonstration ; tests de D1 adaptés, aucun test désactivé.
  - Questions : Q160, Q161 (Tech Lead), Q162 (UX/UI) ; avis Sécurité Q148 attendu à la revue.
- **T12 — Décisions Tech Lead pour F11 (PR #85, ticket #84)** : nouvelle, `docs-only`, décision 0021.
  - F11-TL-1 à F11-TL-11 retenues, TL-1 et TL-3 amendées (Q155).
  - Amende 0020 : § 3 (le décorateur fournit aussi `listTrips`), § 7 (`RetainedPreference` dans `src/contracts/preference.ts`), § 8 (`TripSessionProvider` monté dans `src/app/voyages/layout.tsx` ; F11a supprime le layout `[id]` de F9a).
  - Rien de réservé à Samuel n'est tranché. Questions : Q158, Q159 (Product Owner).
- **Spec F10 (PR #76, ticket #75)** : 2e et dernière correction faite (1edace2, après fusion de `main`), à la suite de la revue Tech Lead de 18:27 UTC.
  - `SharedDay` sans `events` complets ; C37 limité au balisage rendu avant hydratation ; F10-Q3 (Q139) étendue à `name` et `meta` (dépendance à Q14) ; attribution Google F10-PO-20 et C43 ; non bloquants N1 à N9 traités.
  - `changes-requested` retiré, `needs-review` reposé. Si une 3e correction est demandée, la tâche passe en bloqué (règle des 2 tentatives).
- **T8 — Décision 0019 (PR #72, ticket #71)** et **U2 — Correction de la décision 0018 (PR #67, ticket #63)** : toujours en attente de revue, sans changement.
- **État du 16e cycle (#82)** : remplacée par cette PR.
- Note : `pnpm verify` en session échoue sur `test:visual` (rendu des polices), comme prévu par la décision 0004 ; tout le reste passe sur #76, #85 et #86.
- Incident : pendant F9a, un `pkill -f serve-standalone.mjs` a pu couper un serveur Playwright d'un autre worktree. Aucun effet constaté sur les livrables.

## Bloqué
- **F5b — Fiche étape (PR #66, ticket #61)** : la revue de 10:09 UTC demande une 3e correction. Bloquant moyen : `openedFromPanel` n'est pas remis à zéro, donc « Fermer » fait `router.back()` après un retour du navigateur. Mineurs : toast sur « Retour » à 92 %, coche dans un bouton à libellé. 2 tentatives épuisées : **Q119**.
- **T5 — Décision 0017 (PR #65, ticket #62)** : la revue de 09:56 UTC demande une 3e correction. Bloquant : § 11.0 ajoute une commande `docker run` avec les drapeaux dans `.github/workflows/ci.yml`, alors que § 11.3 interdit ces drapeaux dans les workflows. 2 tentatives épuisées : **Q119**.
- En conséquence, la suite du code attend Q119 : T4, F5c, F7a, T6 (après F5b) ; T7, F8a (après #65). F9a, indépendante, a pu avancer.
- **B0 (#27, ticket #22)** et **U1 (#26, ticket #23)** : en attente de Q43, sans changement.
- **Release** : tag et release GitHub (Q118).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes (Q103).
- **Décisions déléguées non prises**, parce qu'elles touchent des fichiers en revue ou bloqués :
  - UX/UI : Q32, Q51, Q53, Q62 (#26), Q115 (#66), Q112 (#65) ;
  - Product Owner : Q41, Q42, Q50 (#27), Q110 et Q104 (spec F7, après #67 et #72), Q114 (#66).

## Décisions attendues de Samuel
- **Règles du studio** :
  - **Q119 (la plus urgente)** : 3e tentative pour #65 et #66, découpage, ou attente. Toute la suite du code en dépend ;
  - Q120 à Q122 (décision 0019) : règle de revue dans le prompt R2, libellés `ux-approved` et `secu-approved`, correction due à un bloquant signalé tard non comptée comme tentative ;
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Phases** : **Q152 (nouvelle)** : souvenir partageable exclu de F11 ; Q137 : le hors-ligne fait-il partie du MVP mis en service ? Le cadrage le range après le MVP, le handover l'inclut.
- **Juridique, à la suite de Q5** : Q5, Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q48, Q75, Q127 ; Q139 ; **Q150 (nouvelle)** : consentement de « Retenir mes goûts », durées de conservation, effacement.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE ;
  - Q84 : longueur maximale du récit ;
  - Q103 : compte Google Cloud et clé Places ;
  - Q129 : remboursement d'un second paiement ;
  - Q140 : carte Google facturée à chaque visite de la vue partagée ;
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
  - **Q157 (nouvelle)** : une plaque par écran contre les « cartes de voyage » du handover ;
  - Q108 : icônes « moins » et chevron, tokens de la mini-ligne et du champ de montant, coche `on-line`.
- Configuration de la routine R1 sur 3 h (à faire par Samuel).
- **Veto possible** :
  - avant le 2026-10-10 : ADR 0005, PO-1 à PO-7 (B0), ADR 0001 « Évolution », F4-PO, F6-PO-1 à F6-PO-16, ADR 0013, Q66, F5-PO-1 à F5-PO-18 sauf F5-PO-10 ;
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
  - avant le 2026-10-11 : décision 0020 (Tech Lead, #80 fusionnée) ; F11-PO-1 à F11-PO-20, Q153 et Q156 (CEO, #81 fusionnée) ;
  - si #85 est fusionnée : décision 0021 (Tech Lead) ;
  - si #86 est fusionnée : écarts de F9a listés dans la PR (Product Owner et frontend).

## Prochain cycle
1. Appliquer la réponse de Samuel à Q119 (#65, #66) et à Q43 (#26, #27).
2. Suivre #86 (F9a), #85 (T12), #76 (spec F10, dernière correction), #72 et #67. Après #72 : T9 en tête. Après #85 : F11c. Après #76 : décisions F10-TL (Q144, Q146).
3. Product Owner, après #67 et #72 : une seule PR pour la spec F7 (Q110, Q104, 0019), plus Q136, Q147, Q158 et Q159.
4. S'il reste de la place : spec F12 (accessibilité, performance, grand écran).

## Part d'usage estimée
- 17e cycle (2026-10-09) : environ 870 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| F9a, code et tests | ≈ 485 000 |
| T12, décision 0021 | ≈ 195 000 |
| Correction 2 de la spec F10 | ≈ 135 000 |
| Pilotage, état | ≈ 55 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 16e cycle (20:26 CEST) : aucun.
