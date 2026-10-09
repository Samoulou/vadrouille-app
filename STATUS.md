# État du studio — 2026-10-09 (14e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

Cette PR reprend #69 (état du 13e cycle, non fusionnée) et la remplace.

## Messages de Samuel traités
- Aucun nouveau message dans #studio depuis le résumé du 13e cycle (12:05 CEST).

## Fait
- Rien n'a été fusionné depuis le 13e cycle. La release v2026.10.09-09 (#68) est fusionnée (1366f09) ; le tag et la release GitHub attendent toujours Q118.

## En cours (toutes en `needs-review`, CI `verify` et `docker` verte)
- **Spec F9 — Débloquer et Programme ajusté (PR #73, ticket #70, `docs-only`)** : nouvelle, Product Owner.
  - Paiement simulé uniquement : page interne qui se dit simulée, sans champ ni marque de prestataire ; TWINT puis carte ; prix lu dans la configuration (29 CHF, Q2).
  - Rien n'est bloqué sans paiement ; le serveur fait foi et le déblocage simulé est idempotent.
  - F9-PO-1 à F9-PO-18 ; propositions F9-TL-1 à F9-TL-10 au Tech Lead (Q132) ; découpage F9a, puis F9b après F7a.
  - Questions : Q126 (UX/UI), Q127 à Q131, Q133, Q135 (Samuel), Q132 (Tech Lead), Q134 (CEO, tranchée), Q136 (Product Owner).
- **T8 — Décisions Tech Lead : `DayBadge`, marqueurs, revue (PR #72, ticket #71, `docs-only`)** : nouvelle, décision 0019.
  - Q111 : `DayBadge` passe en groupe radio (amende 0016 § 8).
  - Q116 : chevauchement du jour 5 accepté en phase 0 ; regroupement durable par la tâche T10.
  - Q117 : une seule revue consolidée par head, `techlead-approved` après tous les spécialistes, revue exhaustive dès la 1re passe. Deux failles relevées dans la porte : elle ignore `changes-requested`, et l'approbation survit à un nouveau push. Correction par la tâche T9.
  - Questions : Q120 à Q122 (Samuel), Q123 (Product Owner), Q124 (UX/UI), Q125 (CEO, tranchée) ; Q110 complétée.
- **U2 — Correction de la décision 0018 (PR #67, ticket #63, `docs-only`)** : 2e et dernière correction faite (a41064d) ; pas de nouvelle revue depuis 09:55 UTC.
- **État du 13e cycle (#69)** : remplacée par cette PR.
- Note : `pnpm verify` en session échoue sur `test:visual` (environ 3 % de pixels, rendu des polices), comme prévu par la décision 0004 ; la CI, qui fait référence, est verte.

## Bloqué
- **F5b — Fiche étape (PR #66, ticket #61)** : la revue de 10:09 UTC demande une 3e correction. Bloquant moyen : `openedFromPanel` n'est pas remis à zéro, donc « Fermer » fait `router.back()` après un retour du navigateur. Mineurs : toast sur « Retour » à 92 %, coche dans un bouton à libellé. 2 tentatives épuisées : **Q119**.
- **T5 — Décision 0017 (PR #65, ticket #62)** : la revue de 09:56 UTC demande une 3e correction. Bloquant : § 11.0 ajoute une commande `docker run` avec les drapeaux dans `.github/workflows/ci.yml`, alors que § 11.3 interdit ces drapeaux dans les workflows. 2 tentatives épuisées : **Q119**.
- En conséquence, toute la suite du code attend Q119 : T4, F5c, F7a, T6 (après F5b) ; T7, F8a (après #65).
- **B0 (#27, ticket #22)** et **U1 (#26, ticket #23)** : en attente de Q43, sans changement.
- **Release** : tag et release GitHub (Q118).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes (Q103).
- **Décisions déléguées non prises**, parce qu'elles touchent des fichiers en revue ou bloqués :
  - UX/UI : Q32, Q51, Q53, Q62 (#26), Q115 (#66), Q112 (#65) ;
  - Product Owner : Q41, Q42, Q50 (#27), Q110 et Q104 (spec F7, après #67 et #72), Q114 (#66).

## Décisions attendues de Samuel
- **Règles du studio** :
  - **Q119 (nouvelle, la plus urgente)** : 3e tentative pour #65 et #66, découpage, ou attente. Toute la suite du code en dépend ;
  - **Q120 à Q122 (nouvelles, décision 0019)** : règle de revue dans le prompt R2, libellés `ux-approved` et `secu-approved`, correction due à un bloquant signalé tard non comptée comme tentative ;
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Juridique, à la suite de Q5** : Q5, Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q48, Q75 ; **Q127 (nouvelle)** : mentions avant paiement.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE ;
  - Q84 : longueur maximale du récit ;
  - Q103 : compte Google Cloud et clé Places ;
  - **Q129 (nouvelle)** : remboursement d'un second paiement ;
  - Q118 : tag et release GitHub de v2026.10.09-09, ou droits de la routine release.
- **Offre et cadrage** : Q57, Q63, Q67, Q76, Q78, Q88, Q89, Q90 (partie Google) ; **nouvelles (spec F9)** : Q128 « Ce qui est inclus », Q133 autres entrées « Débloquer », Q135 « un aperçu actif à la fois ».
- **Durées et documents** : Q27, Q12 (maquettes), Q59 (Dossier UX).
- **Clés et environnement** :
  - Q31 : `*.vercel.app`, dont dépend la carte de la démonstration ;
  - Q40 : Docker ;
  - Q98 : le déploiement de `main` est une démonstration, pas une mise en production ;
  - **Q131 (nouvelle)** : paiement simulé sur la démonstration Vercel, état partagé entre visiteurs ;
  - Q101 : connexion simulée sur les prévisualisations Vercel. Précision de 0017 : la session y serait partagée entre visiteurs.
- **Ligne** :
  - Q37 ;
  - **Q130 (nouvelle)** : logos TWINT et cartes ;
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
  - si #72 et #73 sont fusionnées : décision 0019 (Tech Lead), F9-PO-1 à F9-PO-18, Q125 et Q134 (CEO).

## Prochain cycle
1. Appliquer la réponse de Samuel à Q119 (#65, #66) et à Q43 (#26, #27).
2. Suivre #67, #72 et #73. Après #72 : T9 (garde de revue) en tête. Après #73 : décisions F9-TL (Q132), puis F9a.
3. Product Owner, après #67 et #72 : une seule PR pour la spec F7 (Q110, Q104, 0019), plus Q136.

## Part d'usage estimée
- 14e cycle (2026-10-09) : environ 500 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| Spec F9 | ≈ 245 000 |
| T8, décision 0019 | ≈ 170 000 |
| Pilotage, état | ≈ 90 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 13e cycle (12:05 CEST) : aucun.
