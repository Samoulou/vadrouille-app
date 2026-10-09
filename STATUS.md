# État du studio — 2026-10-09 (15e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

Cette PR reprend #74 (état du 14e cycle, non fusionnée) et la remplace.

## Messages de Samuel traités
- Aucun nouveau message dans #studio depuis le résumé du 14e cycle (14:35 CEST).

## Fait
- Rien n'a été fusionné depuis le 13e cycle. La porte de fusion attend toujours le Tech Lead pour les PR en revue.

## En cours (toutes en `needs-review`)
- **Spec F9 — Débloquer et Programme ajusté (PR #73, ticket #70, `docs-only`)** : 1re correction faite (b21a738), à la suite des deux revues Tech Lead de 12:35 UTC.
  - Découpage : F9a mène à `R11`, F9b à `R10` ; chaque critère est étiqueté [a] ou [b] ; le fournisseur d'onglet et le layout passent dans F9a.
  - Garde de production : 404 (jamais 500) sans adaptateur de paiement autorisé, `not_found` pour les actions, `curl` de `R9`, `R9-sim` et `R9-retour` dans le job `docker` (F9-PO-19).
  - Variantes de prix en liste fermée dans `@/contracts/values` ; F9-PO-3 ramenée à la structure de l'écran (liste des inclusions en attente de Samuel, Q128) ; démonstration du paiement fiable seulement en local, en CI et en docker tant que Q131 est ouverte.
  - Nouvelles F9-PO-19, F9-PO-20 et F9-TL-11 ; aucune nouvelle question pour Samuel. Observation au Tech Lead : les actions serveur de F8 sont prévues dans `src/features/**`, où la règle 4 de 0016 § 3.1 interdit `zod`.
- **T8 — Décision 0019 (PR #72, ticket #71, `docs-only`)** : 1re correction faite (ffa013e).
  - Bloquant traité : « bloquant tardif » pour tout écart de fond relevé tard ; « mineur, relevé tardif » réservé à la forme et à la gravité 1 ; le décompte des 2 tentatives ne change pas tant que Samuel n'a pas tranché Q122.
  - 13 mineurs des deux revues traités. Nouvelle question : Q145 (UX/UI).
- **Spec F10 — Pendant le voyage, hors-ligne, vue partagée (PR #76, ticket #75, `docs-only`)** : nouvelle, Product Owner, CI en cours.
  - F10-PO-1 à F10-PO-19, F10-TL-1 à F10-TL-11, 34 critères étiquetés [a] écran 15, [b] hors-ligne, [c] partage, [t] transverse.
  - Aucune donnée Google en cache ; Q50 proposée (aucune information de logement dans la vue partagée).
  - Contradiction relevée : le cadrage § 3.5 range le hors-ligne après le MVP, le handover l'inclut (Q137, Samuel).
  - Questions : Q137 à Q140 (Samuel), Q141 (UX/UI), Q142 (Tech Lead, Sécurité), Q143 (CEO, tranchée), Q144 (Tech Lead).
- **U2 — Correction de la décision 0018 (PR #67, ticket #63, `docs-only`)** : 2e et dernière correction faite (a41064d) ; toujours aucune nouvelle revue depuis 09:55 UTC.
- **État du 14e cycle (#74)** : remplacée par cette PR.
- Note : `pnpm verify` en session échoue sur `test:visual` (17 captures sur 20, rendu des polices), comme prévu par la décision 0004 ; tout le reste passe (774 tests, 25 a11y, 74 e2e).

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
- **Phases** : **Q137 (nouvelle)** : le hors-ligne fait-il partie du MVP mis en service ? Le cadrage le range après le MVP, le handover l'inclut.
- **Juridique, à la suite de Q5** : Q5, Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q48, Q75, Q127 ; **Q139 (nouvelle)** : durées de trajet et « À confirmer » dans la copie hors ligne.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE ;
  - Q84 : longueur maximale du récit ;
  - Q103 : compte Google Cloud et clé Places ;
  - **Q129 (nouvelle)** : remboursement d'un second paiement ;
  - **Q140 (nouvelle)** : carte Google facturée à chaque visite de la vue partagée ;
  - Q118 : tag et release GitHub de v2026.10.09-09, ou droits de la routine release.
- **Offre et cadrage** : Q57, Q63, Q67, Q76, Q78, Q88, Q89, Q90 (partie Google) ; **nouvelles (spec F9)** : Q128 « Ce qui est inclus », Q133 autres entrées « Débloquer », Q135 « un aperçu actif à la fois » ; **Q138 (nouvelle, spec F10)** : partage et écran 15 réservés au voyage débloqué, durée des liens.
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
  - si #72 et #73 sont fusionnées : décision 0019 (Tech Lead), F9-PO-1 à F9-PO-20, Q125 et Q134 (CEO) ;
  - si #76 est fusionnée : F10-PO-1 à F10-PO-19 (dont Q50) et Q143 (CEO).

## Prochain cycle
1. Appliquer la réponse de Samuel à Q119 (#65, #66) et à Q43 (#26, #27).
2. Suivre #67, #72, #73 et #76. Après #72 : T9 (garde de revue) en tête. Après #73 : décisions F9-TL (Q132), puis F9a. Après #76 : décisions F10-TL (Q144).
3. Product Owner, après #67 et #72 : une seule PR pour la spec F7 (Q110, Q104, 0019), plus Q136.
4. S'il reste de la place : spec F11 (Mes voyages, Après le voyage, états transverses).

## Part d'usage estimée
- 15e cycle (2026-10-09) : environ 640 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| Spec F10 | ≈ 310 000 |
| Correction 1 de la spec F9 | ≈ 155 000 |
| Correction 1 de T8 | ≈ 90 000 |
| Pilotage, état | ≈ 85 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 14e cycle (14:35 CEST) : aucun.
