# État du studio — 2026-10-09 (9e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Fait
- **F4 — Carte Google Maps (#35) : fusionnée** (7f8df4f). Ticket #34 fermé avec un renvoi.
- **Ticket #38 (T1)** : fermé avec un renvoi vers #39, fusionnée au 8e cycle.

## En cours
- **F6 — Présentation « J'aime / Pas pour moi » (PR #44, ticket #42)** : ouverte, `needs-review`. Sur b0bf805, `verify` et `docker` sont verts ; `gate` attend la revue Tech Lead.
  - Contenu :
    - `category` obligatoire et `src/contracts/deck.ts` ;
    - `DeckCard`, `DeckProgress`, `UndoToast` ;
    - feuille modale sur `@radix-ui/react-dialog` 1.2.0 ;
    - réducteur pur et `DeckActions` ;
    - `src/analytics` sans envoi réseau ;
    - `getRequestContext()` ;
    - voyage simulé débloqué `mock_trip_edimbourg_debloque` ;
    - route `/voyages/[id]/presentation`.
  - Tests : 17 scénarios e2e, 8 cas a11y, 6 captures visuelles. Les références sont prises sur la CI (ADR 0004).
  - Écarts listés dans la PR : format de la ligne de trajet (libellés `ligne.*` de F3), photo réduite jusqu'à 72 px, place du toast, contour de focus du toast à environ 2,7:1, `aria-modal` explicite, `DeckActions` créées côté client.
  - Le libellé `in-progress` est retiré du ticket #42.
- **Spec F5 — Séjour, Journée, Fiche (PR #40, ticket #37)** : 1re correction poussée (179d230, avec une fusion de `main`). `changes-requested` est retiré et `needs-review` reposé ; la revue R2 est relancée.
  - « Garder » : la décision F5-PO-10 et son critère sont retirés, et la question est posée à Samuel (Q67).
  - Exception de focus à la fermeture par un marqueur (F5-PO-7, F5-PO-8).
  - Liste des fichiers complétée (ci.yml, ESLint, `src/analytics`, `UndoToast`, `StatusBanner`, `getRequestContext()`, `DayMap`).
  - Fiche ouverte depuis le Séjour, titre de niveau 1, critère de persistance reformulé, réserve sur Q63.
- **Roadmap (PR #43)** : `needs-review`. Contenu :
  - F3, F4 et T1 sont marquées « Fait » ;
  - F6 passe avant F5a, F5b, F5c (Q66) ;
  - « Signaler une erreur » vient après B11.

## Bloqué
- **B0 — Handover back-end (#27, ticket #22)** et **U1 — Décisions UX/UI (#26, ticket #23)** : 2 tentatives de correction épuisées. En attente de Q43, sans changement.
- **F5 (code)** : attend la fusion de la spec (#40) et du code de F6 (#44).
- **P0** : attend Q9 (clé Gemini) et la clé serveur Places/Routes.
- **Décisions déléguées non prises ce cycle**, parce qu'elles touchent des fichiers en revue :
  - Tech Lead : Q64 et Q65 (spec F5, #40) ;
  - UX/UI : Q32, Q51, Q53 à Q55, Q62, Q68, Q69 (décision 0012, #26) ;
  - Product Owner : Q41, Q42, Q49, Q50 (handover B0, #27).

## Décisions attendues de Samuel
- **Règles du studio** :
  - Q43 : 3e tentative de correction pour #26 et #27, découpage, ou attente ;
  - Q23 : moment du retrait de `in-progress`.
- **Juridique, à la suite de Q5** :
  - Q5 et Q6 ;
  - Q29, Q34, Q38, Q44 ;
  - Q46, Q47, Q48.
- **Argent et comptes** :
  - Q9 : clé Gemini ;
  - Q24 à Q26 ;
  - Q39 et Q45 : plafonds ;
  - Q56 : PostHog UE.
- **Offre et cadrage** :
  - Q57 : ce que comptent les 8 propositions offertes ;
  - Q63 : ce que montre un voyage non débloqué au-delà de l'aperçu ;
  - **Q67 (nouvelle)** : que fait « Garder » sur la Fiche étape ?
- **Durées et documents** :
  - Q27 : durées de conservation ;
  - Q12 : maquettes ;
  - Q59 : Dossier UX absent.
- **Clés et environnement** :
  - Q31 : `*.vercel.app` ;
  - Q40 : Docker.
- **Ligne** : Q37, dont le soulignement du lien « Idées » déjà appliqué par F3.
- Configuration de la routine R1 sur 3 h (à faire par Samuel).
- **Veto possible avant le 2026-10-10** :
  - ADR 0005 ;
  - PO-1 à PO-7 (B0) ;
  - ADR 0001 « Évolution » ;
  - F4-PO ;
  - F6-PO-1 à F6-PO-16 ;
  - ADR 0013 (Q33, Q36, Q52, Q58, Q60) ;
  - Q66 (ordre F6 puis F5, CEO) ;
  - F5-PO-1 à F5-PO-18, sauf F5-PO-10 « Garder » qui est retirée, si #40 est fusionnée.

## Prochain cycle
1. Suivre F6 (#44), la spec F5 (#40, 1 correction faite sur 2) et la roadmap (#43).
2. Code de F5a dès que #40 et #44 sont fusionnées (ticket à ouvrir).
3. Décisions Tech Lead Q64 et Q65 après la fusion de #40.
4. #26 et #27 : appliquer la réponse de Samuel à Q43.

## Part d'usage estimée
- 9e cycle (2026-10-09) : environ 610 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| Code de F6 | ≈ 410 000 |
| Spec F5, 1re correction | ≈ 100 000 |
| Pilotage, roadmap, état | ≈ 100 000 |

- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 8e cycle (2026-10-08 23:36 CEST) : aucun.
