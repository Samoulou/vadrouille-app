# État du studio — 2026-10-08 (5e cycle)

Phase : 0 — Valider · Régime : cycle toutes les 3 heures, jusqu'à 3 tâches par cycle (consigne de Samuel du 2026-10-08 16:31, appliquée par #16)

## Fait
- **Consignes de Samuel du 16:31 et du 16:33 (S2, PR #16, ticket #13) : fusionnée.**
  - `docs/CONTEXT.md` : cycle de 3 h, 3 tâches, verrou `in-progress`, périmètre de phase 0 élargi (F1 à F12 sur données simulées, handover back-end) ; restent interdits avant G0 les comptes et services payants, les clés de production et la mise en production.
  - `docs/roadmap.md` : statuts et périmètre à jour.
  - `.github/pull_request_template.md` : `Closes #<numéro>` en tête (« Refs # » si la PR ne termine pas la tâche : ajout du CEO).
  - `docs/studio/mise-en-place.md` et ADR 0001 (section « Évolution ») alignés.
  - Deux corrections sur les revues Tech Lead. Source de la clause « in-progress retiré à l'ouverture de la PR », que la revue jugeait non vérifiable : le prompt de la routine du CEO enregistré par Samuel, étape 3, texte exact : « Pose in-progress sur leur ticket dès que tu les prends. […] Retire in-progress quand la PR est ouverte. » Voir Q23.
- **Tickets #8 (F1) et #9 (S1)** : déjà fermés ; commentaire de renvoi vers #11 et #10 ajouté (consigne du 16:33).
- **Spec B0 — handover back-end (ticket #15)** : `specs/B0-handover-backend.md` fusionnée (#17), puis une première suite de revue (#18).
  - Décisions du Product Owner : PO-1 (budget de trajet, Q8) à PO-7, dont PO-2 (Q22). Définitives sans veto de Samuel avant le 2026-10-10.
  - Questions nouvelles Q24 à Q29.

## En cours
- **F2 — Composants de base (PR #19, ticket #14).**
  - Les 8 composants, `/dev/composants`, les tests unitaires, a11y, e2e et de contraste sont livrés ; `docker` est vert depuis la 1re correction (`tsconfig.build.json`).
  - Décisions du Tech Lead (ADR 0005) : `@radix-ui/react-slot` 1.4.0, `axe-core` 4.13.0, tokens Ligne dans `cn()`, `tsconfig.build.json`.
  - Reste : la référence visuelle `dev-composants.png` doit venir du rendu de la CI (voir « Bloqué »).
- **Spec B0, 2e suite de revue (PR #20, Refs #15)** : deux revues R2 postées après la fusion de #18. Corrections : ordre de priorité, verdicts d'ancrage limités à une énumération, coordonnées interdites dans l'état des workflows, PO-6 renvoyé au Tech Lead pour la forme, plancher PO-1 retiré. 2e et dernière tentative de correction : si R2 demande encore des changements, B0 passe en « Bloqué ».

## Bloqué
- F3 : attend F2 (#19).
- P0 : attend Q9 (clé Gemini) et la clé serveur Places/Routes.
- F4 : attend F3.
- Handover B0 (rédaction) : attend la fusion de #20.
- Références visuelles produites hors CI : tant que l'ADR 0004 n'est pas implémenté, une nouvelle capture doit être téléchargée depuis l'artefact `test-results` de la CI. Le proxy de l'environnement a déjà refusé ce téléchargement (403, Q21).

## Décisions attendues de Samuel
- Q5 et Q6 : juridique (règles Google, photos). Q29 (verdicts d'ancrage dérivés de Google) suit Q5.
- Q9 : clé Gemini (dépense).
- Q12 : export des maquettes.
- Q23 : moment du retrait du verrou `in-progress`.
- Q24 à Q27 : Postgres UE, envoi des codes, Stripe test avec TWINT, durées de conservation.
- Configuration de la routine R1 sur claude.ai : intervalle de 3 h et prompt de l'annexe B de `docs/studio/mise-en-place.md` (à faire par Samuel).
- Veto possible avant le 2026-10-10 sur les décisions déléguées :
  - CEO : ticket référencé par une PR ouverte = en revue, non repris (ADR 0001, « Évolution ») ;
  - Product Owner : PO-1 à PO-7 de la spec B0 ;
  - Tech Lead : ADR 0005 (dépendances F2, typage du build), si #19 est fusionnée.

## Constat sur le processus
- La routine R2 (revue) se déclenche à chaque pose de `needs-review`. Ce cycle, le CEO a aussi lancé des revues Tech Lead dans sa session. Résultat : la fusion automatique part dès la première approbation et R2 publie ensuite des demandes de changements sur des PR déjà fusionnées (#17, #18). Désormais, le CEO laisse la revue à R2 seule.

## Prochain cycle
1. F2 (#19) : référence visuelle depuis la CI, puis revue R2.
2. Suite de B0 selon la revue de #20, puis rédaction du handover (`docs/handovers/backend.md`).
3. Décisions déléguées à UX/UI (Q10, Q11, Q13, Q15 à Q19, Q30), qui débloquent la validation de F2 et F3 ; ADR 0004 tranché et implémenté par le Tech Lead.
4. Roadmap : prérequis de B0 « — » à remplacer par « F1 » (écart signalé dans #18 et #20).

## Part d'usage estimée
- 5e cycle du 2026-10-08 : environ 1 400 000 jetons.

| Poste | Jetons |
|---|---|
| F2 et sa correction | ≈ 260 000 |
| Spec B0 et 2 suites | ≈ 270 000 |
| S2 et 2 corrections | ≈ 170 000 |
| Revues Tech Lead (session) | ≈ 410 000 |
| Pilotage | ≈ 250 000 |

- Cumul de la journée : environ 2 700 000 jetons.
- Part de l'abonnement : non mesurable depuis la routine.
