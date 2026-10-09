# État du studio — 2026-10-09 (13e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Messages de Samuel traités
- Aucun nouveau message dans #studio depuis le résumé du 12e cycle (09:48).

## Fait
- **D1 — Démo testable sur Vercel (#59) : fusionnée** (2bf9863). Ticket #56 fermé.
  - La page d'accueil du déploiement de `main` mène aux 4 parcours simulés.
  - La revue avait demandé la référence `accueil.png`, déjà poussée 2 s plus tard (bee4bd2). `needs-review` a été reposé sans nouveau commit (1re correction).
- **T3 (#58) et spec F8 (#49) : fusionnées** (6e1d7df, e46b985). Tickets #57 et #47 fermés, avec un renvoi.
- **U2 — Décisions UX/UI (#64) : fusionnée** (94e88f3, décision 0018).
  - Q74, Q87, Q97 et Q106 sont tranchées.
  - La fusion automatique est partie avant la fin de la revue UX/UI, qui demandait des corrections. Celles-ci sont dans #67 (voir Q117).

## En cours (toutes en `needs-review`)
- **F5b — Fiche étape, verrou, `ReasonBlock`, ajouts à `DayLine` (PR #66, ticket #61)** : 2e et dernière correction faite (84bfe8e), CI `verify` et `docker` verte.
  - Revue Tech Lead conforme.
  - Correction 2 : l'état enfoncé de « Verrouiller » est montré sur `/dev/composants` et dans la capture `sejour-fiche-tattoo-92.png`.
  - Inclut la conversion équirectangulaire de la carte simulée (Q96) et l'amendement F5b de la décision 0015.
  - JavaScript initial de la Journée : 200 344 octets gzip pour un budget de 200 000. C'est T4 qui le traite.
  - Questions : Q114 (Product Owner), Q115 (UX/UI), Q116 (Tech Lead).
- **T5 — Décisions Tech Lead pour F8 et suites de D1 (PR #65, ticket #62, `docs-only`)** : 2e et dernière correction faite (857af7e).
  - Décision 0017 : F8-TL-1 à F8-TL-10, Q99, Q100, Q102, Q107, Q109 ; actions serveur dans `src/server/actions` (amende 0016 § 3.1).
  - Sécurité : auth simulée et pages `/dev` refusées en production même avec les drapeaux (`VADROUILLE_ENV` ou `VERCEL_ENV`), garde fermée par défaut, minimisation de l'entrée envoyée au modèle.
  - Avis Sécurité sur Q79 rendu, favorable.
  - Question : Q112 (UX/UI).
- **U2 — Correction de la décision 0018 (PR #67, ticket #63, `docs-only`)** : 2e et dernière correction faite (a41064d).
  - Accessibilité des erreurs, aucun nom Google prérempli, boutons de retour distincts (« Retour à la fiche »).
  - Questions : Q108 (Samuel), Q110 (Product Owner), Q111 (Tech Lead).
- **Release v2026.10.09-09 (PR #68, routine release, `docs-only`)** : note de version ouverte, mais tag et release GitHub refusés (Q118).

Si une 3e correction est demandée sur #65, #66 ou #67, la tâche passe en bloqué (règle des 2 tentatives).

## Bloqué
- **B0 — Handover back-end (#27, ticket #22)** et **U1 — Décisions UX/UI (#26, ticket #23)** : 2 tentatives de correction épuisées ; en attente de Q43, sans changement.
- **Release** : tag et release GitHub impossibles depuis la routine (Q118).
- **F8a** : attend la fusion de #65 (décision 0017) et de #67.
- **F7a** : attend le code de F5c (Q93).
- **T4** : attend la fusion de F5b (#66).
- **T7** et **T6** (nouvelles, Q113) : attendent la fusion de #65 ; T6 attend aussi F5b.
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes (Q103).
- **Décisions déléguées non prises**, parce qu'elles touchent des fichiers en revue :
  - UX/UI : Q32, Q51, Q53, Q62 (décision 0012, #26) ;
  - Product Owner : Q41, Q42, Q50 (handover B0, #27).

## Constat sur la revue automatique (Q117, Tech Lead)
- #64 a été fusionnée avec `techlead-approved` pendant que la revue UX/UI était encore en cours.
- Sur #67, 5 revues ont été publiées sur le même head en 4 minutes. Elles étaient contradictoires, et `techlead-approved` et `changes-requested` ont été posés ensemble.
- Proposition : une seule revue par head, et `techlead-approved` seulement après toutes les revues spécialisées. Le sujet remonte à Samuel si la règle « CI verte + Tech Lead » doit changer.

## Décisions attendues de Samuel
- **Règles du studio** :
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Juridique, à la suite de Q5** : Q5, Q6, Q29, Q34, Q38, Q44, Q46, Q47, Q48, Q75.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE ;
  - Q84 : longueur maximale du récit ;
  - Q103 : compte Google Cloud et clé Places ;
  - **Q118 (nouvelle)** : tag et release GitHub de v2026.10.09-09, ou droits de la routine release.
- **Offre et cadrage** : Q57, Q63, Q67, Q76, Q78, Q88, Q89, Q90 (partie Google).
- **Durées et documents** : Q27, Q12 (maquettes), Q59 (Dossier UX).
- **Clés et environnement** :
  - Q31 : `*.vercel.app`, dont dépend la carte de la démonstration ;
  - Q40 : Docker ;
  - Q98 : le déploiement de `main` est une démonstration, pas une mise en production ;
  - Q101 : connexion simulée sur les prévisualisations Vercel. Précision de 0017 : la session y serait partagée entre visiteurs.
- **Ligne** :
  - Q37 ;
  - **Q108 (nouvelle)** : icônes « moins » et chevron, tokens de la mini-ligne et du champ de montant, coche `on-line`.
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
    - **Q113 (CEO, nouvelle)** : T7 dès la fusion de #65, puis T6 après F5b ;
  - si #65 est fusionnée : décision 0017 (Tech Lead), dans les 2 jours qui suivent.

## Prochain cycle
1. Suivre #65, #66 et #67 : les 2 corrections sont faites, la prochaine demande de changement les fait passer en bloqué.
2. Après la fusion de F5b : T4, puis F5c. Après la fusion de #65 : T7, puis F8a. T6 ensuite.
3. Product Owner : Q110 (specs F7 et F8 d'après 0018), Q104, Q114.
4. #26 et #27 : appliquer la réponse de Samuel à Q43.

## Part d'usage estimée
- 13e cycle (2026-10-09) : environ 1,2 M de jetons (estimation).

| Poste | Jetons |
|---|---|
| F5b, code et 2 corrections | ≈ 400 000 |
| U2, décision 0018 et 2 corrections | ≈ 340 000 |
| T5, décision 0017 et 2 corrections | ≈ 260 000 |
| Pilotage, état | ≈ 150 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 12e cycle (09:48) : aucun.
