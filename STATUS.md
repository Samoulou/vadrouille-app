# État du studio — 2026-10-08 (6e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31)

## Fait
- **F2 — Composants de base (#19) : fusionnée** après la revue R2. Ticket #14 fermé avec un renvoi vers la PR. L'ADR 0005 (Tech Lead) est donc en vigueur, sauf veto de Samuel avant le 2026-10-10.
- **Status du 5e cycle (#21) : fusionnée.**
- Tickets fermés avec un renvoi vers leur PR (consigne du 16:33) :
  - #13 (S2, #16) ;
  - #15 (spec B0, #17, #18 et #20).
  - La rédaction du handover B0 est suivie dans le nouveau ticket #22.
- Roadmap mise à jour (ce PR) : F2 faite, F3 prête, prérequis de B0 = F1 (écart signalé dans #18 et #20), F4 spécifiée et en revue.

## En cours (3 tâches prises ce cycle, sur des fichiers distincts)
- **B0 — Handover back-end (PR #27, ticket #22)** :
  - livrables : `docs/handovers/backend.md` (§ 0 à § 17) et les décisions du Tech Lead 0006 à 0011 :
    - 0006 : stack serveur, Drizzle, Postgres 17 en conteneur ;
    - 0007 : RLS forcée ;
    - 0008 : Better Auth ;
    - 0009 : exécution durable ;
    - 0010 : répartition des champs (Q14) ;
    - 0011 : verdicts d'ancrage.
  - **1re correction faite** sur la revue R2 :
    - 0003 classée parmi les décisions déléguées ;
    - `billing.processed_at` retiré ;
    - `usage_ledger` protégé en ajout seulement dans 0007 (droits, déclencheur, test) ;
    - drizzle-orm 0.45.4 confirmée sur npm.
  - `needs-review` est reposé.
- **U1 — Décisions UX/UI déléguées (PR #26, ticket #23)** :
  - décision `docs/decisions/0012-decisions-ux-ui-f2-f3.md` : Q10, Q11, Q13, Q15 à Q19 (partie UX/UI de Q17), Q30 ;
  - **1re correction faite** sur la revue R2 :
    - les conventions de code deviennent des propositions au Tech Lead ;
    - les changements de règles de Ligne sont retirés du design system et soumis à Samuel (Q37) ;
    - le nom accessible de `DayBadge` commence par le libellé visible ;
    - la décision est renumérotée de 0010 en 0012, à cause d'une collision avec #27.
  - `needs-review` est reposé.
- **Spec F4 — Carte (PR #25, ticket #24)** :
  - 11 décisions fonctionnelles, dont F4-PO-1 et F4-PO-11, devenues des propositions au Tech Lead (F4-TL-1 à F4-TL-3) ;
  - **1re correction faite** : terminus non focusable, numérotation au rang dans `day.items`, carte simulée déterministe, configuration injectable, test anti-Places en liste blanche ;
  - `needs-review` est reposé.

## Bloqué
- P0 : attend Q9 (clé Gemini) et la clé serveur Places/Routes.
- F4 (code) : attend F3 et la fusion de sa spec (#25).
- Références visuelles : l'ADR 0004 n'est pas encore implémenté. Localement, `dev-tokens.visual` échoue toujours (glyphes, 3 %) : seule la CI fait foi.

## Décisions attendues de Samuel
- Juridique, suit Q5 :
  - Q5 et Q6 ;
  - Q29 : verdicts d'ancrage ;
  - Q34 : cache de 30 jours des coordonnées contre la règle de `CLAUDE.md` ;
  - Q38 : `Segment.minutes` dans les versions.
- Argent et comptes :
  - Q9 : clé Gemini ;
  - Q24 à Q26 : Postgres UE, envoi des codes, Stripe test avec TWINT ;
  - Q39 : plafonds de coût.
- Q27 : durées de conservation.
- Q12 : export des maquettes.
- Q23 : moment du retrait de `in-progress`.
- Q31 : la clé Maps accepte-t-elle les aperçus `*.vercel.app` ?
- Q37 : modifications de Ligne proposées par UX/UI (S-0 à S-7).
- Q40 : Docker dans les sessions des agents.
- Configuration de la routine R1 sur 3 h (à faire par Samuel).
- Veto possible avant le 2026-10-10 sur les décisions déléguées :
  - ADR 0005 (Tech Lead, F2) ;
  - PO-1 à PO-7 (spec B0) ;
  - ADR 0001, section « Évolution » (CEO) ;
  - si leurs PR sont fusionnées : ADR 0006 à 0011 (#27), décision 0012 (#26), F4-PO (#25).

## Prochain cycle
1. Suivre #25, #26 et #27 en revue R2 (2e et dernière tentative de correction si besoin).
2. F3 (spec prête, F1 et F2 fusionnées) : créer le ticket et le confier à frontend, en appliquant les choix provisoires de la décision 0012.
3. Décisions déléguées restantes :
  - Q32, Q35 et Q41 : UX/UI et Product Owner ;
  - Q33 et Q36 : Tech Lead ;
  - Q42 : Product Owner ;
  - partie Product Owner de Q17.
4. ADR 0004 tranché et implémenté par le Tech Lead.

## Part d'usage estimée
- 6e cycle du 2026-10-08 : environ 1 050 000 jetons (estimation).

| Poste | Jetons |
|---|---|
| B0 handover et correction | ≈ 400 000 |
| U1 décisions UX/UI et correction | ≈ 330 000 |
| Spec F4 et correction | ≈ 290 000 |
| Pilotage | ≈ 60 000 |

- Cumul de la journée : environ 3 750 000 jetons.
- Part de l'abonnement : non mesurable depuis la routine.
- Messages de Samuel dans #studio depuis le 5e cycle (17:08) : aucun.
