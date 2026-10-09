# État du studio — 2026-10-09 (11e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Fait
- **F6 — Présentation « J'aime / Pas pour moi » (#44) : fusionnée** (eafcecd), avec la décision UX/UI 0014. Ticket #42 fermé avec un renvoi.
- **T2 — Décisions Tech Lead pour F5 (#48) : fusionnée** (0fbc3f8), décision 0015 (Q64, Q65). Ticket #46 fermé avec un renvoi.

## En cours
- **F5a — Sheet, mise en page commune et Journée (PR #54, ticket #51)** : `needs-review`.
  - CI `verify` et `docker` verte sur 17f9732 ; références visuelles prises sur la CI (décision 0004).
  - Tous les critères [a] et les transverses applicables sont couverts, sauf l'ouverture de la fiche au toucher d'un marqueur, reportée à F5b (la fiche n'existe pas encore).
  - `ReasonBlock` livré dès F5a, car « Surprends-moi » [a] l'affiche ; contrat `Day.surprise` ajouté ; carte de F4 complétée (`visibleInsets`, `offsetCenter`).
  - Écarts à la décision 0015 soumis au Tech Lead (Q94) ; budget JavaScript dépassé, 228 Ko contre 200 Ko (Q95).
- **Spec F8 — Création et compte (PR #49, ticket #47)** : 1re correction faite (c9864b1) après la revue Tech Lead.
  - B1 : retour depuis l'écran 4 et garde de l'étape de lancement ;
  - B2 : horloge serveur et état simulé isolé par test, proposition F8-TL-9 (Q85) ;
  - B3 : routes de référence, critères « sous réserve de F8-TL-x » ;
  - B4 : seuils des demandes de code dans la configuration de l'adaptateur ;
  - M1 à M6 traités.
  - `changes-requested` retiré et `needs-review` reposé.
- **Spec F7 — Remplacer, Ajouter un lieu, Déplacer (PR #53, ticket #52)** : `needs-review`, `docs-only`.
  - F7-PO-1 à F7-PO-19, dont F7-PO-10 (partie Product Owner de Q49) ;
  - propositions F7-TL-1 à F7-TL-9 (Q92) ;
  - questions F7-Q1 à F7-Q7 (Q87 à Q93) ;
  - découpage F7a, F7b, F7c, après F5c (Q93, tranchée par le CEO).

## Bloqué
- **B0 — Handover back-end (#27, ticket #22)** et **U1 — Décisions UX/UI (#26, ticket #23)** : 2 tentatives de correction épuisées ; en attente de Q43, sans changement.
- **F5b** : attend la fusion de F5a (#54), mêmes fichiers.
- **F8a** : attend la fusion de la spec (#49) et les décisions Tech Lead sur F8-TL (Q80, Q85).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes.
- **Décisions déléguées non prises ce cycle**, parce qu'elles touchent des fichiers en revue :
  - UX/UI : Q32, Q51, Q53, Q62 (décision 0012, #26) ;
  - Product Owner : Q41, Q42, Q50 (handover B0, #27).

## Décisions attendues de Samuel
- **Règles du studio** :
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Juridique, à la suite de Q5** :
  - Q5 et Q6 ;
  - Q29, Q34, Q38, Q44 ;
  - Q46, Q47, Q48 ;
  - Q75 : mentions légales et acceptation à la création du compte.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE ;
  - **Q84 (nouvelle)** : longueur maximale du récit envoyé à `structureBrief`.
- **Offre et cadrage** :
  - Q57 : ce que comptent les 8 propositions offertes ;
  - Q63 : ce que montre un voyage non débloqué au-delà de l'aperçu ;
  - Q67 : que fait « Garder » sur la Fiche étape ?
  - Q76 : durée maximale d'un voyage et nombre de villes ;
  - Q78 : prix et lien de réservation (affiliation) à l'écran « Où loger » ;
  - **Q88 (nouvelle)** : nombre de remplacements, plafond, modification d'un voyage non débloqué ;
  - **Q89 (nouvelle)** : les raisons de remplacement comptent-elles dans la règle des deux refus ?
  - Q90 (partie Google, après le Tech Lead) : affichage du nom Google d'un lieu recherché.
- **Durées et documents** :
  - Q27 : durées de conservation ;
  - Q12 : maquettes (rappelée par F5a : aucune maquette à comparer) ;
  - Q59 : Dossier UX absent.
- **Clés et environnement** :
  - Q31 : `*.vercel.app` ;
  - Q40 : Docker.
- **Ligne** : Q37.
- Configuration de la routine R1 sur 3 h (à faire par Samuel).
- **Veto possible** :
  - avant le 2026-10-10 :
    - ADR 0005 ;
    - PO-1 à PO-7 (B0) ;
    - ADR 0001 « Évolution » ;
    - F4-PO ;
    - F6-PO-1 à F6-PO-16 ;
    - ADR 0013 ;
    - Q66 ;
    - F5-PO-1 à F5-PO-18 sauf F5-PO-10 ;
  - avant le 2026-10-11 :
    - décision 0015 (Tech Lead, fusionnée) ;
    - décision 0014 (UX/UI, fusionnée) ;
    - F8-PO-1 à F8-PO-16, si #49 est fusionnée ;
    - Q81 (ordre F5 puis F8, CEO) ;
  - avant le 2026-10-11, si les PR sont fusionnées :
    - F7-PO-1 à F7-PO-19 (#53) ;
    - Q93 (découpage et ordre de F7, CEO).

## Prochain cycle
1. Suivre F5a (#54), la spec F8 (#49, 1 correction faite sur 2) et la spec F7 (#53).
2. F5b dès que F5a est fusionnée (ticket à ouvrir).
3. Décisions Tech Lead : F8-TL (Q80, Q85) après la fusion de #49 ; F7-TL (Q92) après la fusion de #53 ; Q94 à Q96.
4. #26 et #27 : appliquer la réponse de Samuel à Q43.

## Part d'usage estimée
- 11e cycle (2026-10-09) : environ 920 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| Code de F5a | ≈ 470 000 |
| Spec F7 | ≈ 230 000 |
| Correction 1 de la spec F8 | ≈ 145 000 |
| Pilotage, état | ≈ 75 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 10e cycle (2026-10-09 05:52 CEST) : aucun.
