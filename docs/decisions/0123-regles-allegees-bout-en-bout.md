# 0123 — Règles allégées pour livrer l'app de bout en bout

Statut : **acceptée**, décision de **Samuel** (modification des règles du studio, « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion.

Date : 2026-10-22 · Décideur : Samuel (carte de décision du fil « Routine cycle du studio », 13:08 UTC, option « Oui, alléger ») · Rédaction : CEO.

## Contexte
Samuel, 2026-10-22, fil « Routine cycle du studio » :
- 12:57 UTC : « après les site web il va falloir qu'on se concentre vraiment sur l'objectif, brancher de bout en bout l'app, je trouve que ça n'avance pas et j'ai vraiment besoin de tester l'app de bout en bout du brief de mon voyage au résultat final » ;
- 13:06 UTC : « vadrouille doit devenir 1 seul app qui part "Créer un voyage" ensuite on brief de la personne l'écran 1 […] et on avance tout doit se connecter » ;
- 13:07 UTC : « j'ai vraiment l'impression qu'on tourne en rond depuis longtemps ».

Constat du CEO : le lot 2a (site web de l'activité) a demandé quatre PR de documents (spécification #674, décisions 0121 #683 et 0122 #682, amendement #686) et aucune ligne de code. Le formulaire « Créer un voyage » n'a jamais produit un vrai voyage.

## Décision
Pour le **parcours de bout en bout** (ticket #687 et ses lots de code) et pour le **code du lot 2a** :
1. **Une seule spécification courte**, puis directement le code. Pas de décision séparée du Tech Lead ni de la Sécurité avant le code.
2. **Le Tech Lead et la Sécurité rendent leurs verdicts dans la relecture de la PR de code** (revue consolidée), sur le code réel. Un choix d'architecture ou un verdict de sécurité y est consigné en quelques lignes dans la description de la PR ; une décision écrite dans `docs/decisions/` n'est rédigée que si la relecture l'exige pour une règle durable.
3. **Chaque PR de code change quelque chose que Samuel peut cliquer** sur le site d'essai, et sa description dit quoi tester en une phrase.
4. **Les PR de documents** de ce parcours ont **une seule correction** au plus ; au-delà, le CEO tranche et fusionne le texte par la porte normale (jamais lui-même).
5. Les PR de documents déjà ouvertes du lot 2a (#682, #686) ne bloquent plus son code : elles se fusionnent si elles sont approuvées ; leurs points ouverts se règlent dans la relecture du code.

## Ce qui ne change pas
- Toutes les règles « Jamais » de `CLAUDE.md` : aucune donnée Google dans un prompt, rien de Google stocké hors identifiant (exceptions 0011, 0027, 0092), aucune donnée Google sur une carte non Google, aucune clé de production, aucun secret commité, rien en production, aucune fusion d'une PR de code par un agent, aucun test désactivé sans décision écrite.
- Le studio ne lance jamais d'appel payant ; Samuel seul lance les essais (0093, fusible de 2 USD d'IA).
- `pnpm verify` vert, relecture consolidée et `techlead-approved` avant fusion ; `owner-approved` pour `.github/workflows/` (0035).
- Les décisions réservées à Samuel restent les siennes.

## Quand revoir
À la fin du parcours de bout en bout (Samuel teste du brief au rendu jour par jour), ou plus tôt si une relecture de code révèle un risque qu'une décision séparée aurait évité.
