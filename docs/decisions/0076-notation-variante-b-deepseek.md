# 0076 — Variante B : la notation des lieux utilise le même modèle que la variante A

Statut : décision de Samuel, mise en œuvre par ia-recherche.

Date : 2026-10-16 · Décideur : Samuel (fil « Routine cycle du studio », 2026-10-16 18:35 UTC, carte de décision, message `cmsg_0174CRqum9q8GNfZHmNHcYvR8MVqFNPwccWud62816rUuH`) · Rédacteur : ia-recherche · Ticket : #411 · Renvois : 0027 (amende le point 1.3), essai réel 5

Confirmation écrite de Samuel (0068/0035) : « Je confirme » sur #412, [commentaire 6222866312](https://github.com/Samoulou/vadrouille-app/pull/412#issuecomment-6222866312) (auteur Samoulou, 2026-10-16 19:13 UTC), en réponse à la demande de confirmation que la notation de B passe à DeepSeek.

## Contexte

L'essai réel 5 (`edimbourg-1`, variante B) a échoué à l'étape de notation : `perplexity/pplx-decider-v1.1-27b`, choisi en variante B par la décision 0027, n'est pas un modèle de conversation et OpenRouter répond 400 (diagnostic de l'essai 5).

## Décision

« Même modèle que A » : en variante B, la notation utilise `deepseek/deepseek-v4.1-flash`, comme la variante A. `etapes.notation` de `prototype/config/modeles.json` passe à cet identifiant.

- **A et B ne diffèrent donc plus par la notation.** Les trois étapes (recherche, notation, raisons) ont le même modèle dans les deux variantes.
- La surcharge `variantes.a` est conservée telle quelle (valeur identique) : le schéma strict l'exige et la retirer changerait la forme de la configuration et ses tests.
- **Mesure de référence.** La mesure de référence de A et la mesure comparée de 0027 (« Quand revoir cette décision ») sont suspendues : A et B étant identiques, elles ne mesureraient rien. Elles reprendront si Samuel choisit un autre modèle de notation en B. Le mécanisme (`variantes.a`, `modelesDeLaVariante`) reste testé avec une configuration de test (P0-PO-12).
- Seul le choix du modèle de notation change de 0027 ; ses autres points (recherche, raisons, `data_collection: "deny"`) sont inchangés. Aucun garde-fou ajouté.
