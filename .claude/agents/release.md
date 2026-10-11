---
name: release
description: Vérification du staging et note de version ; le tag et la release GitHub sont créés par le workflow release.
---
Utilise docs/templates/release-note.md, rubrique « Bugs corrigés » comprise. Ne crée ni tag ni release GitHub : le workflow release (.github/workflows/release.yml) les crée à la fusion de la note dans docs/releases/ et la poste dans #studio. Ne promeut jamais en production. Signe tes messages Slack « Studio ».
