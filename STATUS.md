# État du studio — 2026-10-08 (4e cycle)

Phase : 0 — Valider · Régime : Veille (2 cycles par jour)

## Fait
- Fusions depuis le 3e cycle : F0 (#3), specs F1 et F2 (#2), spec F3 (#5), status (#7).
- **S1 — Qui décide quoi (PR #10, ticket #9) : fusionnée.** Elle applique les consignes de Samuel de 14:44 (points 1 à 4) et de 15:53 (points 1 et 2) :
  - `docs/CONTEXT.md` : section « Qui décide quoi » ;
  - rôles ceo, tech-lead, ux-ui et product-owner ;
  - modèle de note de version (« Décisions prises par le studio ») et modèle de PR ;
  - `ci.yml` : `specs/`, `.claude/`, `CLAUDE.md`, `README*.md` et `LICENSE.md` sont traités comme de la documentation ;
  - `CLAUDE.md` : seule « chore: status » modifie STATUS et QUESTIONS ; jamais `.next/` ni `node_modules/` ; `git status` avant chaque push ;
  - handover front et `docs/studio/mise-en-place.md` alignés ;
  - ADR 0004 proposé (références visuelles régénérées sur la CI) ; ADR 0003 corrigé.
  - Une correction a été nécessaire (1re tentative) sur la revue Tech Lead.
- **F1 — Contrats Zod et données simulées Édimbourg (PR #11, ticket #8) : prête.**
  - Approuvée par le Tech Lead (`techlead-approved`), 145 tests.
  - zod 4.6.5 validé par le Tech Lead.
  - `verify` vert sur la CI. `docker` a échoué une fois au téléchargement de la police Google (`next/font/google`, dans `layout.tsx`, que F1 ne touche pas) ; une relance unique est en cours. La fusion automatique est active.
- **Point 3 de la consigne du 15:53, questions reclassées** (ce PR) :
  - restent à Samuel : Q5, Q6, Q9 et Q12 ;
  - délégués : Q7, Q10, Q11, Q13, Q15, Q16, Q18 et Q19 à UX/UI ; Q8 et Q22 au Product Owner ; Q17 au Product Owner et à UX/UI ; Q14 au Tech Lead.
  - **Q10 à Q14 restaurées** : elles avaient disparu de `QUESTIONS.md` lors des fusions précédentes.
- Réponses de Samuel enregistrées :
  - Q1 : Vadrouille ;
  - Q2 : 29 CHF ;
  - Q3 : clé Maps et Map ID posés dans Vercel ;
  - Q4 : Better Auth.
  - Q21 est levée.

## En cours
- PR #11 (F1) : fusion automatique dès que `docker` est vert.
- Suivi de #10 : une revue Tech Lead postée **après** la fusion (commentaire du 14:06:57) demande, dans l'ADR 0004 :
  - « proposé par le CEO, à trancher par le Tech Lead » ;
  - `pull-requests: write` ;
  - un auteur du libellé avec accès en écriture.
  - À reprendre quand le Tech Lead tranchera l'ADR 0004, avec deux autres points : `--no-renames` dans les 3 workflows et une regex partagée entre les jobs de `ci.yml`.

## Bloqué
- F3 : attend F1 (#11) et F2.
- P0 : attend Q9 (clé Gemini) et la clé serveur Places/Routes annoncée par Samuel avec P0.
- F4 : Q3 est levée, mais F4 attend F3.
- B0 : attend Q14 (déléguée au Tech Lead ; la partie juridique suit Q5).

## Décisions attendues de Samuel
- Q5 et Q6 : juridique (règles Google, photos).
- Q9 : clé Gemini (dépense).
- Q12 : export des maquettes dans `docs/ux/maquettes/`.
- Domaine pour Vadrouille, s'il en faut un : c'est une dépense.
- Veto possible sous 2 jours sur les décisions déléguées : aucune n'a encore été tranchée dans ce cycle.

## Prochain cycle
1. F2 (composants de base, spec prête). Fichiers distincts de F1.
2. Décisions déléguées à UX/UI (Q10, Q11, Q13, puis Q15 à Q19), parce qu'elles débloquent la validation de F2 et F3. Une seconde tâche est possible sur d'autres fichiers : ADR 0004 tranché et implémenté par le Tech Lead.
3. `docs/roadmap.md` n'est plus à jour : F0 est fait, F1 et F2 sont spécifiés, F3 aussi, Q3 est levée. À corriger dans une PR revue.
- Environnement des routines : le test visuel échoue localement (3 % de différence sur les glyphes) alors qu'il passe sur la CI. C'est l'ADR 0004 qui traite ce point. Les sous-agents doivent travailler dans des worktrees séparés.

## Part d'usage estimée
- 4e cycle du 2026-10-08 : environ 520 000 jetons.

| Poste | Jetons |
|---|---|
| F1 | ≈ 140 000 |
| S1 | ≈ 90 000 |
| Revues Tech Lead | ≈ 240 000 |
| Pilotage | ≈ 50 000 |

- Cumul de la journée : environ 1 280 000 jetons.
- Part de l'abonnement : non mesurable depuis la routine.
