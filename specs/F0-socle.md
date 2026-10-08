# F0 — Socle front

Rôle : frontend · Prérequis : aucun · Référence : `docs/handovers/frontend.md` (§ 2, 3, 4, 14, 15, annexe A)

## Objectif
Poser le socle sur lequel toutes les tâches front s'appuieront, sans aucun écran métier.

## À livrer
- Next.js (App Router), TypeScript strict, gestionnaire `pnpm`.
- Tailwind CSS v4 avec le bloc `@theme` et les variables du handover § 4.1 dans `src/styles/globals.css`.
- Police Hanken Grotesk 400, 600, 700, 800 via `next/font/google`.
- shadcn/ui initialisé avec la correspondance de variables du handover § 4.1.
- ESLint avec une règle qui refuse les couleurs en dur et les valeurs Tailwind arbitraires de couleur.
- Vitest, Testing Library, Playwright (viewport 390 × 844), axe.
- Scripts : `typecheck`, `lint`, `test`, `test:a11y`, `test:e2e`, `test:visual`, `verify`.
- Page `/dev/tokens` (désactivée en production) qui affiche couleurs, styles de texte et rayons.
- Structure de dossiers du handover § 3, avec un `README` d'une ligne par dossier.
- `src/i18n/fr.json` initialisé.
- `next.config` en `output: "standalone"` et un `Dockerfile` multi-étapes qui produit une image exécutable (décision 0002).

## Critères d'acceptation
- [ ] `pnpm verify` passe sur une installation propre.
- [ ] `/dev/tokens` affiche toutes les couleurs et tous les styles de texte du handover § 4.1.
- [ ] Une couleur en dur ajoutée dans un composant fait échouer `pnpm lint` (test prévu).
- [ ] Un test axe tourne sur `/dev/tokens` sans violation.
- [ ] Un test Playwright ouvre `/dev/tokens` en 390 × 844 et compare une capture de référence.
- [ ] `docker build .` réussit et l'image démarre l'application sur le port 3000 (test dans la CI).
- [ ] Aucune dépendance à un stockage propre à Vercel (KV, Edge Config).
- [ ] Les versions retenues sont notées dans `docs/decisions/0003-versions.md`.

## Hors périmètre
Écrans, composants Ligne, données, carte.

## Questions ouvertes
Aucune.
