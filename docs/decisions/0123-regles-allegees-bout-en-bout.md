# 0123 — Règles allégées pour livrer l'app de bout en bout

Statut : **acceptée**, décision de **Samuel** (modification des règles du studio, réservée à Samuel : « Qui décide quoi » de `docs/CONTEXT.md` l. 34), définitive dès sa fusion ; à lister dans la note de version suivante (rubrique « Décisions de Samuel »).

Date : 2026-10-22 · Décideur : Samuel · Rédacteur : CEO (fil « Routine cycle du studio » du projet Vadrouille) · Ticket : #687 (parcours de bout en bout) · PR : #688 · Décisions liées : 0019, 0020, 0023, 0035, 0092, 0093, 0121, 0122.

Source de l'autorité : carte de décision posée par le CEO dans le fil « Routine cycle du studio », message `cmsg_0174CRqum9q8GNfZHmNHcYvRRjpwasQiVFDU4nPRjDCqse`, question « Alléger les règles du studio pour livrer l'app de bout en bout plus vite ? » ; Samuel (compte `user_017VkTG4EynZVdjnt8RL7MHD`) a choisi l'option « Oui, alléger » le 2026-10-22 à 13:08:21 UTC depuis son propre client (tap vérifié par la plateforme). Texte de l'option : « Spécification puis code directement ; chaque PR livre un écran qui marche ; avis Tech Lead et Sécurité dans la relecture du code. »

Numérotation : `main` portait 0001 à 0117 et 0119 à 0122 à l'ouverture de cette PR ; 0118 est réservée par 0116. La présente décision prend le numéro libre suivant, 0123 ; 0124 (lot 1 du parcours, PR #696) a été écrite après la réservation de ce numéro et est fusionnée.

## Contexte
Messages de Samuel dans le même fil, tels quels :
- 2026-10-22 12:57 UTC (`cmsg_0174CRqum9q8GNfZHmNHcYvRC9UQRbUR7FD75Rwya5mU1j`) : « après les site web il va falloire qu'on se concentre vreaiment sur l'objectif, brancher de bout en bout l'app, je trouve que ça n'avance pas et j'ai vraiment besoin de tester l'app de bout en bout du brief de mon voyage au résultat final » ;
- 13:06 UTC (`cmsg_0174CRqum9q8GNfZHmNHcYvRTcyB1sM4cERFWgwLSvz1aU`) : « vadrouille doit devenir 1 seul app qui part "CRéer un voyage" ensuite on brief de la personne l'écran 1 […] et on avance tout doit se connecter » ;
- 13:07 UTC (`cmsg_0174CRqum9q8GNfZHmNHcYvRNytXFLihKJE17nd8YeQ6Ku`) : « j'ai vraiment l'impression qu'on tourne en rond depuis longtemps concernant la mise en place bout en bout ».

Constat du CEO : le lot 2a (site web de l'activité) a demandé quatre PR de documents (spécification #674, décisions 0121 #683 et 0122 #682, amendement #686) avant toute ligne du code du site web. Le formulaire « Créer un voyage » n'a jamais produit un vrai voyage.

## Champ
Le **parcours de bout en bout** (ticket #687, spécification `specs/E2E-essai-bout-en-bout.md`, PR #690, et ses lots de code) et le **code du lot 2a** (#689, PR #694). Les autres travaux suivent les règles habituelles.

## Décision
1. **Une seule spécification courte, puis directement le code.** Aucune décision séparée du Tech Lead ni de la Sécurité n'est exigée avant la PR de code.
2. **Verdicts dans la relecture du code.** Le Tech Lead, la Sécurité et l'UX/UI rendent leurs verdicts dans la revue consolidée de la PR de code, sur le code réel. L'auteur de la PR consigne dans sa description, rubrique « Décisions prises (rôle délégué) » du modèle `.github/pull_request_template.md`, chaque choix d'architecture ou verdict qui en résulte ; la note de version les reprend dans « Décisions prises par le studio ». Règle propre à la présente décision : une décision écrite dans `docs/decisions/` reste obligatoire pour un changement de contrat dans `src/contracts/`, une nouvelle dépendance ou une nouvelle destination réseau, et chaque fois que la revue consolidée la demande.
3. **La Sécurité est toujours consultée** sur une PR de code qui touche une destination réseau, `src/ai/`, `src/research/`, `db/`, l'authentification ou les secrets.
4. **Chaque PR de code change quelque chose que Samuel peut cliquer** sur le site d'essai, et la rubrique « Ce qui est fait » de sa description dit quoi tester en une phrase (« À tester par Samuel : … »). Exceptions : migrations, durcissement de sécurité et tests seuls, qui disent ce qu'ils rendent possible.
5. **Une seule correction comptée pour une PR de documents** de ce champ. Après cette correction, le Tech Lead relit la PR. C'est lui qui qualifie, dans la revue consolidée, chaque point restant : s'il ne touche ni la sécurité ni une règle « Jamais » de `CLAUDE.md`, il le requalifie en mineur et en fait un critère d'acceptation de la PR de code suivante, écrit dans la revue consolidée de la PR de documents. Aucun bloquant ne restant, `techlead-approved` se pose selon la règle habituelle. Un point qui touche la sécurité ou une règle « Jamais » reste bloquant. Le CEO ne tranche aucun désaccord technique à la place du Tech Lead.
6. **Lot 2a.** Les 14 conditions du verdict S6 et le verdict S7 de 0122 telle que fusionnée (`879793c`), et les points de l'amendement 3 de `specs/P0-programme-par-ia.md` tel qu'il sera fusionné (PR #686), sont des **critères d'acceptation** de la PR de code #694, vérifiés par la Sécurité et le Tech Lead dans sa relecture. La phrase de 0121 § 6 « La PR de code du lot 2a ne fusionne pas avant 0122 » est sans objet, 0122 étant fusionnée.

## Textes amendés (dans le champ ci-dessus seulement)
- `docs/CONTEXT.md` l. 43 (décision déléguée écrite dans `docs/decisions/` ou la spécification) : complétée par le point 2 (décision consignée dans la description de la PR de code, puis dans la note de version) ; le texte du point 2 fait foi, sans phrase ajoutée à `CONTEXT.md`.
- `specs/P0-programme-par-ia.md` § 8 et § 11.9 (verdict de la Sécurité « avant la PR de code », l. 255) et 0121 § 6 (« cède à 0122 ») : remplacés par les points 2, 3 et 6.
- Règle des deux tentatives (`docs/studio/mise-en-place.md` l. 242, routine R1 étape 5 ; 0023 § 3 et son décompte ; 0019 § 3.2 point 5) : ramenée à une pour les PR de documents du champ (point 5) ; inchangée pour les PR de code.
- 0019 § 3.2 point 3 (gravité : un écart à la spécification ou à une décision est bloquant) : pour les PR de documents du champ, après leur correction comptée, le Tech Lead requalifie en mineur un point restant qui ne touche ni la sécurité ni une règle « Jamais » (point 5). 0019 § 3.2 point 2 (`techlead-approved` seulement sans bloquant) ne change pas.
- Le prompt de la routine R2 (0023 § 1, et sa copie de l'annexe B de `docs/studio/mise-en-place.md`) ne change pas et n'a pas à être recollé : son étape 2 applique 0019 § 3.2, tel qu'amendé ci-dessus, et son étape 6 (« `techlead-approved` seulement si aucun rôle consulté n'a de bloquant ») s'applique telle quelle, puisque les points requalifiés sont des mineurs.

## Ce qui ne change pas
- Toutes les règles « Jamais » de `CLAUDE.md`.
- 0093 point 2 (première puce) : le studio ne lance `pnpm p0` qu'en mode simulé et ne lance aucun appel payant ; Samuel seul lance les essais (fusible de 2 USD d'IA).
- `pnpm verify` vert, revue consolidée et `techlead-approved` avant fusion (porte `techlead-gate`, 0023 § 4) ; `owner-approved` de Samuel pour `.github/workflows/` (0035).
- Les décisions réservées à Samuel restent les siennes.

## Quand revoir
Quand Samuel a testé le parcours du brief au rendu jour par jour, ou au plus tard le 2026-11-05 ; plus tôt si une relecture de code révèle un risque qu'une décision séparée aurait évité.
