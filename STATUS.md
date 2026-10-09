# État du studio — 2026-10-09 (16e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

Cette PR reprend #77 (état du 15e cycle, non fusionnée) et la remplace.

## Messages de Samuel traités
- Aucun nouveau message dans #studio depuis le résumé du 15e cycle (17:28 CEST).

## Fait
- **Spec F9 — Débloquer et Programme ajusté (#73) : fusionnée** (1352222). Le ticket #70 reste à fermer avec un renvoi.

## En cours (toutes en `needs-review`, `docs-only`)
- **Spec F10 — Pendant le voyage, hors-ligne, vue partagée (PR #76, ticket #75)** : 1re correction faite (f7d6887, après fusion de `main`), à la suite des deux revues Tech Lead de 15:29 UTC.
  - Service worker : il intercepte les navigations de l'origine, `/p/` compris, seulement pour servir la coquille `R-repli` en cas d'échec réseau, sans rien écrire (C39). Les requêtes RSC et les actions serveur ne sont jamais interceptées.
  - R15 hors ligne : coquille statique sans donnée, précachée ; le document de R15 n'est jamais enregistré (C17, C18, C20 alignés).
  - Schémas dérivés (`pick`/`omit`) ; `zod/mini` seulement pour la lecture de la copie, avec un test de parité.
  - `DayLine` à types étroits (F10-TL-12), nouveau composant `ActionBanner` au lieu d'un bandeau `quai`, partage simulé refusé en production sans drapeau (C42), critères C35 à C42 ajoutés.
  - Nouvelle question : Q146 (Tech Lead).
- **T11 — Décisions Tech Lead pour F9 (PR #80, ticket #78)** : nouvelle, décision 0020 (F9-TL-1 à F9-TL-11, Q132).
  - Contrats `billing`, `checkoutId` de 128 bits, garde `paymentDemoAllowed` fermée par défaut et toujours fausse en production, décorateur `getTripReader()`, prix dans `src/server/config/offer.ts`.
  - Toutes les actions serveur (F8 et F9) vont dans `src/server/actions/` : amende 0016 § 3.1 règle 4. La première PR qui crée `src/server/` livre la règle de lint et `parse-input.ts`.
  - Rien de réservé à Samuel n'est tranché (Q127 à Q131 restent ouvertes). Questions : Q147 (Product Owner), Q148 (Sécurité).
- **Spec F11 — Mes voyages, Après le voyage, états transverses (PR #81, ticket #79)** : nouvelle, Product Owner.
  - F11a Mes voyages (4 sections, voyages simulés Lisbonne et Porto) ; F11b Après le voyage (avis en 3 choix, lieux découverts, « Retenir mes goûts » sur consentement explicite, mémoire dans l'onglet en phase 0) ; F11c pages 404 et erreur en Ligne, catalogue `/dev/etats`.
  - F11-PO-1 à F11-PO-20, F11-TL-1 à F11-TL-11.
  - Questions : Q149 à Q152 et Q157 (Samuel), Q153 et Q156 (CEO, tranchées), Q154 (UX/UI), Q155 (Tech Lead). Numéros provisoires Q160 à Q168 de la PR renumérotés ici en Q149 à Q157 ; ceux de T11 (Q150, Q151) en Q147, Q148.
- **T8 — Décision 0019 (PR #72, ticket #71)** : 1re correction faite (ffa013e), toujours en attente de revue.
- **U2 — Correction de la décision 0018 (PR #67, ticket #63)** : 2e et dernière correction faite ; aucune nouvelle revue depuis 09:55 UTC.
- **État du 15e cycle (#77)** : remplacée par cette PR.
- Note : `pnpm verify` en session échoue sur `test:visual` (17 captures sur 20, rendu des polices), comme prévu par la décision 0004 ; tout le reste passe (774 tests, 25 a11y, 74 e2e) sur #76, #80 et #81.

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
  - si #80 est fusionnée : décision 0020 (Tech Lead) ;
  - si #81 est fusionnée : F11-PO-1 à F11-PO-20, Q153 et Q156 (CEO).

## Prochain cycle
1. Appliquer la réponse de Samuel à Q119 (#65, #66) et à Q43 (#26, #27).
2. Suivre #67, #72, #76, #80 et #81. Après #72 : T9 (garde de revue) en tête. Après #80 : F9a. Après #76 : décisions F10-TL (Q144, Q146). Après #81 : décisions F11-TL (Q155), puis F11c.
3. Product Owner, après #67 et #72 : une seule PR pour la spec F7 (Q110, Q104, 0019), plus Q136 et Q147.
4. Fermer le ticket #70 (spec F9 fusionnée) avec un renvoi vers #73.
5. S'il reste de la place : spec F12 (accessibilité, performance, grand écran).

## Part d'usage estimée
- 16e cycle (2026-10-09) : environ 700 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| Spec F11 | ≈ 265 000 |
| T11, décision 0020 | ≈ 200 000 |
| Correction 1 de la spec F10 | ≈ 170 000 |
| Pilotage, état | ≈ 65 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 15e cycle (17:28 CEST) : aucun.
