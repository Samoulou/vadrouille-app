# 0068 — Délai de veto de Samuel ramené à 6 heures

Statut : décidée par Samuel (réservée à Samuel : elle règle sa propre garde, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion.

Date : 2026-10-15 · Décideur : Samuel · Rédacteur : CEO · Source : fil « Routine cycle du studio » du projet Vadrouille (deux messages de Samuel, ci-dessous) · PR #378 · Confirmation écrite de Samuel : commentaire sur #378 (à venir, condition de fusion)

## Contexte

Jusqu'ici, une décision déléguée devenait définitive sans veto de Samuel « sous 2 jours ». Le 2026-10-15, l'attente de 0057 (relevé `db-releve`) repoussait au lendemain un contrôle nécessaire au premier essai réel, alors que le studio travaille par cycles de 3 heures (`docs/CONTEXT.md`).

Messages de Samuel, copiés tels quels (projet Vadrouille, fil « Routine cycle du studio ») :
- 2026-10-15 13:38:44 UTC, message `cmsg_0174CRqum9q8GNfZHmNHcYvR6FPuzEkPKCa42Hb7or92Tu` : « On va changer cette règle, on va laisser le temps de 2 cylcles donc 6h et plus 2 jours pour tes décisions ».
- Carte de décision `cmsg_0174CRqum9q8GNfZHmNHcYvRXnYSgJA1TRyNSGn4RPkfHT`, posée à 13:45:14 UTC : « Appliquer le délai de 6 heures aussi aux décisions déjà en attente ? ». Son texte rappelait la lecture du CEO (« 6 heures remplacent 2 jours ») et demandait la confirmation de Samuel. Samuel a choisi à 13:47:33 UTC l'option « Oui, partout » : « 6 heures remplacent 2 jours, y compris pour les décisions déjà en attente ». (`STATUS.md` du cycle 77, écrit avant sa réponse, la note « Réponse demandée ».)

La carte lève l'ambiguïté du premier message (« et plus 2 jours » se lit « et non plus 2 jours ») et tranche la portée rétroactive. Comme tous les agents écrivent sous le compte de Samuel (décision 0035), Samuel confirme en plus par un commentaire de sa main sur #378 ; la PR n'est pas fusionnée sans lui.

## Décision

1. Une décision déléguée (Tech Lead, Sécurité, Product Owner, UX/UI, CEO) devient définitive sans veto de Samuel **6 heures après sa fusion** sur `main`, au lieu de 2 jours. Pour une décision écrite dans une spécification, le point de départ est aussi la fusion de la PR qui l'écrit (et non la publication de la note de version).
2. **Rétroactivité** (choix de Samuel, carte du 13:47 UTC) : la règle vaut pour toutes les décisions encore dans leur délai. Celles fusionnées depuis plus de 6 heures sont définitives à la fusion de 0068 ; les autres le deviennent 6 heures après leur propre fusion. **Un amendement se compte à part** : la partie qu'il modifie ou complète devient définitive 6 heures après la fusion de la PR qui l'apporte ; le reste de la décision amendée suit sa propre date.
3. **Ce qui ne change pas** :
   - ce qui est réservé à Samuel, et toute proposition qui attend sa réponse écrite, jamais acquise par son silence (exemple : 0057, paragraphe « Propositions à Samuel, hors du régime “sans veto” », questions ouvertes 1 à 3 : environnement `db-releve` et ses secrets, relevé des environnements, relevés faits par Samuel dans la console Neon) ;
   - les passages marqués **(TL)** non signés tant que le Tech Lead n'a pas approuvé : le délai de veto ne vaut toujours pas signature du Tech Lead ;
   - `owner-approved` (décision 0035) pour les PR de workflow.
4. Samuel peut opposer son veto à tout moment par un message ; après le délai, il passe par une nouvelle décision.

## Conséquences

- **0052** (fusionnée le 2026-10-14 06:30 UTC) : définitive, sauf son § 1.10 tel que complété par 0066 (#365, fusionnée le 2026-10-15 10:24 UTC), définitif à 16:24 UTC.
- **0056** (fusionnée le 2026-10-14 12:20 UTC, amendée par 0061 le 2026-10-14 19:22 UTC) : définitive, sauf son § 4.6 complété par 0066 (définitif à 16:24 UTC) et son § 2.6.2 amendé par 0067 (#376, fusionnée le 2026-10-15 13:37 UTC ; définitif à 19:37 UTC).
- **0057** (fusionnée le 2026-10-14 17:14 UTC) : définitive pour la partie Sécurité, sauf son § 4 (R8) complété par 0066 (définitif à 16:24 UTC) et son § 3 amendé par 0067 (définitif à 19:37 UTC). Ses passages (TL) restent régis par son « Statut » : le délai de veto ne vaut pas signature du Tech Lead (inchangé). Sa dépendance à 0052 et 0056 suit les deux points précédents.
- **Échéances écrites ailleurs** : les rubriques « Décisions (… sous 2 jours) » et les échéances datées des spécifications et handovers (dont `specs/F4-carte.md`, `D1-demo.md`, `F5` à `F13`, `B0`, `B2` à `B8`, `P0-prototype-recherche.md`, `P0-suite-2.md`, `P0c-suite-ia.md`, `P0c-suite-release.md`, `T18-owner-approved-workflows.md`, et `docs/handovers/backend.md` l. 717 et 726) ne sont pas réécrites : **0068 prévaut sur elles**, selon le point 2 de la décision. Une PR qui touche ces fichiers pour une autre raison peut corriger la phrase. `STATUS.md` et `QUESTIONS.md` sont corrigés par la PR « chore: status » suivante.
- Le rôle Sécurité n'a pas de phrase sur le délai dans `.claude/agents/securite.md` ; il suit `docs/CONTEXT.md`.
- Les routines de release recopient `docs/templates/release-note.md`, mis à jour.

## Fichiers mis à jour

`docs/CONTEXT.md`, `docs/studio/mise-en-place.md`, `docs/templates/release-note.md`, `.claude/agents/ceo.md`, `.claude/agents/product-owner.md`, `.claude/agents/tech-lead.md`, `.claude/agents/ux-ui.md`.

## Quand revoir

Si une décision devenue définitive par ce délai court doit être défaite, ou à la mise en public (passe de sécurité avant ouverture).
