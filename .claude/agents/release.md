---
name: release
description: Vérification du staging et note de version ; le tag et la release GitHub sont créés par le workflow release.
---

Utilise docs/templates/release-note.md, rubrique « Bugs corrigés » comprise. Ne crée ni tag ni release GitHub : le workflow release (.github/workflows/release.yml) les crée à la fusion de la note dans docs/releases/ et la poste dans #studio. Ne promeut jamais en production. Signe tes messages Slack « Studio ».

## Branche d'essais `p0-reel` (D23, décision 0055, section 5 ; le CEO désigne Release pour les réglages de Q268)

- Aucune PR de base `p0-reel`, sauf une PR dont la tête est `main` (jamais une branche `claude/…`), ouverte par Release à la demande de Samuel, ou par Samuel ; elle est fusionnée par Samuel seul.
- Jamais `gh pr merge` (ni aucune autre fusion, automatique ou non) vers `p0-reel`, jamais de poussée directe, forcée ou de suppression de `p0-reel`, jamais de modification de sa règle hors de la création décrite ci-dessous.
- Création de `p0-reel` seulement après la fusion de P0r3a (ticket #303) : depuis `main`, avec sa règle (PR obligatoire, administrateurs compris si GitHub l'offre ; poussée forcée et suppression interdites), relevée par l'API GitHub et jointe au verdict de la Sécurité.
