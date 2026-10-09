# État du studio — 2026-10-09 (12e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités (#studio, 09:20 à 09:22)
- 09:20 « rien n'est dispo pour test fonctionnel sur Vercel » : réponse immédiate dans #studio avec les adresses du déploiement de `main` (connexion Vercel requise) ; tâche **D1** ouverte et livrée (#59).
  - `vadrouille-app.vercel.app` n'appartient pas au projet : c'est une autre application.
- 09:21 « résumé des fonctionnalités prêtes » : envoyé dans #studio (F0 à F4, F6, F5a fusionnées ; specs F5 et F7 fusionnées).
- 09:22 « PR qui attendent le Tech Lead » : aucune n'attendait. #49 avait reçu sa revue (Sécurité, 3 bloquants) et la 2e correction est faite ; #26 et #27 attendent Q43.

## Fait
- **F5a — Sheet, mise en page commune et Journée (#54) : fusionnée** (6a21770). Ticket #51 fermé avec un renvoi.
- **Spec F7 (#53) : fusionnée** (6e33fcd). Ticket #52 fermé avec un renvoi.

## En cours
- **D1 — Démo testable sur Vercel (PR #59, ticket #56)** : `needs-review`.
  - Spécification `specs/D1-demo.md` (Product Owner, D1-PO-1 à D1-PO-6) et code dans la même PR.
  - La page d'accueil `/` mène, avec la mention « données simulées », à 4 parcours : présentation, suite du tri, Séjour, Jour 1. Elle ne s'affiche qu'avec l'adaptateur simulé, sans page `/dev` ni `VADROUILLE_DEV_PAGES`.
  - CI `verify` et `docker` verte sur bee4bd2 ; référence visuelle prise sur la CI (décision 0004).
  - Questions : Q98 (Samuel), Q99, Q100, Q107 (Tech Lead), Q106 (UX/UI).
- **T3 — Décisions Tech Lead pour F7 et suites de F5a (PR #58, ticket #57)** : `needs-review`, `docs-only`.
  - Décision 0016 : F7-TL-1 à F7-TL-9 (Q92), Q91, partie Tech Lead de Q90, Q94 (écarts de F5a acceptés), Q95 (dépassement refusé, remédiation par T4), Q96 (conversion propre à la carte simulée, dans F5b).
  - Nouvelle tâche **T4** dans la roadmap : remédiation du budget JavaScript, après F5b et avant F5c (Q105, CEO).
- **Spec F8 — Création et compte (PR #49, ticket #47)** : 2e et dernière correction faite (b0ca8f9).
  - Tech Lead : layout du brouillon, page R-lancer, libellé visible d'`OtpInput`, `page.clock`.
  - Sécurité : liste blanche du paramètre `suite`, `verifyCode` identique pour une adresse inconnue, revalidation serveur (F8-PO-17), mineurs intégrés, proposition F8-TL-10.
  - Questions : Q101 (Samuel), Q102 (Tech Lead) ; Q86 complétée.
  - `changes-requested` retiré et `needs-review` reposé. Si une 3e correction est demandée, la tâche passe en bloqué (règle des 2 tentatives).

## Bloqué
- **B0 — Handover back-end (#27, ticket #22)** et **U1 — Décisions UX/UI (#26, ticket #23)** : 2 tentatives de correction épuisées ; en attente de Q43, sans changement.
- **F5b** : prête (F5a fusionnée), mais touche les mêmes fichiers que D1 (`src/i18n/fr.json`, `src/adapters`) ; reportée au prochain cycle.
- **F8a** : attend la fusion de la spec (#49) et les décisions Tech Lead sur F8-TL (Q80, Q85, Q102).
- **F7a** : attend la fusion de #58 et le code de F5c (Q93).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes (Q103).
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
  - Q84 : longueur maximale du récit envoyé à `structureBrief` ;
  - **Q103 (nouvelle)** : compte Google Cloud et clé serveur Places API (New), budget et plafond de recherches (T3, #58).
- **Offre et cadrage** :
  - Q57 : ce que comptent les 8 propositions offertes ;
  - Q63 : ce que montre un voyage non débloqué au-delà de l'aperçu ;
  - Q67 : que fait « Garder » sur la Fiche étape ?
  - Q76 : durée maximale d'un voyage et nombre de villes ;
  - Q78 : prix et lien de réservation (affiliation) à l'écran « Où loger » ;
  - Q88 : nombre de remplacements, plafond, modification d'un voyage non débloqué ;
  - Q89 : les raisons de remplacement comptent-elles dans la règle des deux refus ?
  - Q90 (partie Google, après le Tech Lead) : affichage du nom Google d'un lieu recherché.
- **Durées et documents** :
  - Q27 : durées de conservation ;
  - Q12 : maquettes (rappelée par F5a : aucune maquette à comparer) ;
  - Q59 : Dossier UX absent.
- **Clés et environnement** :
  - Q31 : `*.vercel.app` (la carte de la démonstration en dépend) ;
  - Q40 : Docker ;
  - **Q98 (nouvelle)** : le déploiement de `main` sur Vercel sert de démonstration, ce n'est pas une mise en production ;
  - **Q101 (nouvelle)** : connexion simulée sur les prévisualisations Vercel, contrôle de `VADROUILLE_DEV_PAGES` chez l'hébergeur.
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
  - avant le 2026-10-11 :
    - F7-PO-1 à F7-PO-19 (#53, fusionnée) ;
    - Q93 (découpage et ordre de F7, CEO) ;
  - avant le 2026-10-11, si les PR sont fusionnées :
    - décision 0016 (Tech Lead, #58) ;
    - D1-PO-1 à D1-PO-6 (#59) ;
    - F8-PO-17 (#49) ;
    - Q105 (place de T4, CEO).

## Prochain cycle
1. Suivre D1 (#59), T3 (#58) et la spec F8 (#49, dernière correction faite).
2. F5b dès que D1 est fusionnée (ticket à ouvrir), puis T4, puis F5c.
3. Décisions Tech Lead : F8-TL (Q80, Q85, Q102) après la fusion de #49 ; Q99, Q100, Q107.
4. #26 et #27 : appliquer la réponse de Samuel à Q43.

## Part d'usage estimée
- 12e cycle (2026-10-09) : environ 620 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| D1, spec et code | ≈ 250 000 |
| T3, décision 0016 | ≈ 190 000 |
| Correction 2 de la spec F8 | ≈ 130 000 |
| Pilotage, état | ≈ 50 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 11e cycle (09:04) : 3 (09:20, 09:21, 09:22), traités ci-dessus.
