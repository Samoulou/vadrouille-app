# État du studio — 2026-10-09 (10e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Fait
- **Spec F5 — Séjour, Journée, Fiche (#40) : fusionnée** (f7bd91f). Ticket #37 fermé avec un renvoi.
- **Roadmap (#43) : fusionnée** (7fd1d57).

## En cours
- **F6 — Présentation « J'aime / Pas pour moi » (PR #44, ticket #42)** : 1re correction faite après la revue Tech Lead + UX/UI du 2026-10-09 00:44Z.
  - Code (ba73950) :
    - région de toast persistante (`UndoToastRegion`) ;
    - mouvement réduit sur le retour de la carte ;
    - garde contre le double appui ;
    - valeurs hors tokens déplacées dans `provisoire.css` ;
    - « Passer » souligné ;
    - libellé `restaurant` ;
    - date « 15 août 2026 ».
  - Les références visuelles sont reprises de la CI : l'artefact se télécharge désormais, sans 403.
  - CI `verify` et `docker` verte ; `gate` attend `techlead-approved`.
  - Rendus non maquettés : décision UX/UI 0014 sur la même branche (__UX0014__).
  - « 4 sur 8 » visible non ajouté : la spec (F6-PO-16) l'exclut, le handover § 5 le demande (Q72).
  - `changes-requested` est retiré et `needs-review` reposé ; la revue R2 est relancée.
- **T2 — Décisions Tech Lead pour F5 (PR #48, ticket #46)** : `needs-review`. Décision 0015 :
  - Q65 : F5-TL-1 à F5-TL-8 retenues, dont 5 amendées ;
  - Q64 : champ `Stop.commitment` distinct de `locked` ;
  - `getIdeasHref` remplace `ideasHref`, ce qui amende 0013 § 2.
  - Pas `docs-only` : la porte Tech Lead ne dispense pas `docs/decisions/`.
- **Spec F8 — Création et compte (PR #49, ticket #47)** : `needs-review`.
  - F8-PO-1 à F8-PO-16, dont Q35 (toucher une `Chip` déduite).
  - Propositions F8-TL-1 à F8-TL-8 (Q80).
  - Questions F8-Q1 à F8-Q8 (Q74 à Q81).
  - Découpage F8a, F8b, F8c.

## Bloqué
- **B0 — Handover back-end (#27, ticket #22)** et **U1 — Décisions UX/UI (#26, ticket #23)** : 2 tentatives de correction épuisées ; en attente de Q43, sans changement.
- **F5a (code)** : attend la fusion du code de F6 (#44) et de la décision 0015 (#48).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes.
- **Décisions déléguées non prises ce cycle**, parce qu'elles touchent des fichiers en revue :
  - UX/UI : Q32, Q51, Q53, Q62 (décision 0012, #26) ;
  - Product Owner : Q41, Q42, Q49, Q50 (handover B0, #27).

## Décisions attendues de Samuel
- **Règles du studio** :
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Juridique, à la suite de Q5** :
  - Q5 et Q6 ;
  - Q29, Q34, Q38, Q44 ;
  - Q46, Q47, Q48 ;
  - **Q75 (nouvelle)** : mentions légales et acceptation à la création du compte.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE.
- **Offre et cadrage** :
  - Q57 : ce que comptent les 8 propositions offertes ;
  - Q63 : ce que montre un voyage non débloqué au-delà de l'aperçu ;
  - Q67 : que fait « Garder » sur la Fiche étape ?
  - **Q76 (nouvelle)** : durée maximale d'un voyage et nombre de villes ;
  - **Q78 (nouvelle)** : prix et lien de réservation (affiliation) à l'écran « Où loger ».
- **Durées et documents** :
  - Q27 : durées de conservation ;
  - Q12 : maquettes ;
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
  - avant le 2026-10-11, si les PR sont fusionnées :
    - décision 0015 (Tech Lead, #48) ;
    - F8-PO-1 à F8-PO-16 (#49) ;
    - décision 0014 (UX/UI, #44) ;
    - Q81 (ordre F5 puis F8, CEO).

## Prochain cycle
1. Suivre F6 (#44, 1 correction faite sur 2), T2 (#48) et la spec F8 (#49).
2. Code de F5a dès que #44 et #48 sont fusionnées (ticket à ouvrir).
3. Décisions Tech Lead sur F8-TL (Q80) après la fusion de #49.
4. #26 et #27 : appliquer la réponse de Samuel à Q43.

## Part d'usage estimée
- 10e cycle (2026-10-09) : environ __USAGE__ jetons (estimation).

| Poste | Jetons |
|---|---|
| Correction de F6 (code) | ≈ 190 000 |
| Décision UX/UI 0014 (F6) | ≈ __UXTOK__ |
| T2, décisions Tech Lead F5 | ≈ 150 000 |
| Spec F8 | ≈ 220 000 |
| Pilotage, état | ≈ 80 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 9e cycle (2026-10-09 03:08 CEST) : aucun.
