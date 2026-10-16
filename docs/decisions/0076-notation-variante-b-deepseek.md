# 0076 — Variante B : la notation des lieux utilise le même modèle que la variante A

Statut : décision de Samuel, mise en œuvre par ia-recherche.

Date : 2026-10-16 · Décideur : Samuel (fil « Routine cycle du studio », 2026-10-16 18:35 UTC, carte de décision, message `cmsg_0174CRqum9q8GNfZHmNHcYvR8MVqFNPwccWud62816rUuH`) · Rédacteur : ia-recherche · Ticket : #411 · Renvois : 0027, essai réel 5

## Contexte

L'essai réel 5 (`edimbourg-1`, variante B) a échoué à l'étape de notation : `perplexity/pplx-decider-v1.1-27b`, choisi en variante B par la décision 0027, n'est pas un modèle de conversation et OpenRouter répond 400 (diagnostic de l'essai 5).

## Décision

« Même modèle que A » : en variante B, la notation utilise `deepseek/deepseek-v4.1-flash`, comme la variante A. `etapes.notation` de `prototype/config/modeles.json` passe à cet identifiant.

- **A et B ne diffèrent donc plus par la notation.** Les trois étapes (recherche, notation, raisons) ont le même modèle dans les deux variantes.
- La surcharge `variantes.a` est conservée telle quelle (valeur identique) : le schéma strict l'exige et la retirer changerait la forme de la configuration et ses tests.
- Seul le choix du modèle de notation change de 0027 ; ses autres points (recherche, raisons, `data_collection: "deny"`) sont inchangés. Aucun garde-fou ajouté.
