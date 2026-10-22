# 0123 — Règles allégées pour livrer l'app de bout en bout

Statut : **acceptée**, décision de **Samuel** (modification des règles du studio, réservée à Samuel : « Qui décide quoi » de `docs/CONTEXT.md` l. 34), définitive dès sa fusion ; à lister dans la note de version suivante (rubrique « Décisions de Samuel »).

Date : 2026-10-22 · Décideur : Samuel · Rédacteur : CEO (fil « Routine cycle du studio » du projet Vadrouille) · Ticket : #687 (parcours de bout en bout) · PR : #688 · Décisions liées : 0011, 0019, 0020, 0023, 0027, 0035, 0092, 0093, 0121, 0122 (PR #682).

Source de l'autorité : carte de décision posée par le CEO dans le fil « Routine cycle du studio », message `cmsg_0174CRqum9q8GNfZHmNHcYvRRjpwasQiVFDU4nPRjDCqse`, question « Alléger les règles du studio pour livrer l'app de bout en bout plus vite ? » ; Samuel (compte `user_017VkTG4EynZVdjnt8RL7MHD`) a choisi l'option « Oui, alléger » le 2026-10-22 à 13:08:21 UTC depuis son propre client (tap vérifié par la plateforme). Texte de l'option : « Spécification puis code directement ; chaque PR livre un écran qui marche ; avis Tech Lead et Sécurité dans la relecture du code. »

Numérotation : `main` porte 0001 à 0117, 0119 à 0121 ; 0118 est réservée par 0116 ; 0122 est portée par la Sécurité (#682, ouverte). La présente décision prend le numéro libre suivant, 0123.

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
2. **Verdicts dans la relecture du code.** Le Tech Lead, la Sécurité et l'UX/UI rendent leurs verdicts dans la revue consolidée de la PR de code, sur le code réel. L'auteur de la PR consigne dans sa description, rubrique « Décisions prises dans cette PR », chaque choix d'architecture ou verdict qui en résulte ; la note de version les reprend dans « Décisions prises par le studio ». Une décision écrite dans `docs/decisions/` reste obligatoire dans les cas de 0019 § 3.4 (changement de contrat dans `src/contracts/`, nouvelle dépendance, nouvelle destination réseau) quand la relecture le demande.
3. **La Sécurité est toujours consultée** sur une PR de code qui touche une destination réseau, `src/ai/`, `src/research/`, `db/`, l'authentification ou les secrets.
4. **Chaque PR de code change quelque chose que Samuel peut cliquer** sur le site d'essai, et la rubrique « After » de sa description dit quoi tester en une phrase. Exceptions : migrations, durcissement de sécurité et tests seuls, qui disent ce qu'ils rendent possible.
5. **Une seule correction comptée pour une PR de documents** de ce champ. Après cette correction, le Tech Lead relit la PR ; un point restant qui ne touche ni la sécurité ni une règle « Jamais » devient un critère d'acceptation de la PR de code suivante, écrit dans sa revue consolidée, et le Tech Lead peut poser `techlead-approved`. Le CEO ne tranche aucun désaccord technique à la place du Tech Lead.
6. **Lot 2a.** Les 14 conditions du verdict S6 et le verdict S7 de 0122 (#682, tête courante), et les points de l'amendement 3 (#686, tête courante), sont des **critères d'acceptation** de la PR de code #694, vérifiés par la Sécurité et le Tech Lead dans sa relecture, que #682 et #686 soient fusionnées ou non.

## Textes amendés (dans le champ ci-dessus seulement)
- `docs/CONTEXT.md` l. 43 (décision déléguée écrite dans `docs/decisions/` ou la spécification) : complétée par le point 2 (décision consignée dans la description de la PR de code, puis dans la note de version).
- `specs/P0-programme-par-ia.md` § 8 et § 11.9 (verdict de la Sécurité « avant la PR de code », l. 255) et 0121 § 6 (« cède à 0122 ») : remplacés par les points 2, 3 et 6.
- Règle des deux tentatives (`docs/studio/mise-en-place.md` l. 242, routine R1 étape 4 ; 0023 § 3) : ramenée à une pour les PR de documents du champ (point 5) ; inchangée pour les PR de code.

## Ce qui ne change pas
- Toutes les règles « Jamais » de `CLAUDE.md`.
- 0093 point 3 : le studio ne lance `pnpm p0` qu'en mode simulé et ne lance aucun appel payant ; Samuel seul lance les essais (fusible de 2 USD d'IA).
- `pnpm verify` vert, revue consolidée et `techlead-approved` avant fusion (porte `techlead-gate`, 0023 § 4) ; `owner-approved` de Samuel pour `.github/workflows/` (0035).
- Les décisions réservées à Samuel restent les siennes.

## Quand revoir
Quand Samuel a testé le parcours du brief au rendu jour par jour, ou au plus tard le 2026-11-05 ; plus tôt si une relecture de code révèle un risque qu'une décision séparée aurait évité.
