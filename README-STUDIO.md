# Kit de démarrage du studio

À copier à la racine du dépôt GitHub du planificateur de voyages IA. (test CI)

## Ce que contient le kit
- `CLAUDE.md` : règles communes à tous les agents.
- `docs/CONTEXT.md` : le contexte que le CEO lit à chaque cycle (2 pages).
- `docs/roadmap.md` : phases, conditions de passage, backlog ordonné du studio.
- `docs/produit/cadrage-v5.md`, `docs/handovers/frontend.md`, `docs/design-system/` : sources produit, front et design.
- `docs/studio/` : mise en place détaillée et prompts des 4 routines.
- `docs/decisions/` : décisions d'architecture (0001 studio sur Routines, 0002 hébergement Vercel et portabilité).
- `docs/templates/release-note.md` : modèle de note de version.
- `specs/F0-socle.md` : première spécification, prête pour le premier cycle.
- `.claude/agents/` : les 11 rôles.
- `.github/` : CI, porte Tech Lead, modèle de PR.
- `STATUS.md`, `QUESTIONS.md` : état initial et questions ouvertes.

## Ce que tu ajoutes avant le premier commit
1. `docs/ux/maquettes/` : exporte en PNG les écrans de la page « Direction Ligne » du canevas (nommage `L01-creer-voyage.png`, etc.) et ceux de la page « Wireframes » (Mes voyages, Après le voyage, États).
2. `docs/ux/dossier-ux.md` : exporte le Dossier UX/UI en Markdown depuis le document.

Ensuite : suis `docs/studio/mise-en-place.md`.
