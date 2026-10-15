# 0068 — Délai de veto de Samuel ramené à 6 heures

Statut : décidée par Samuel (réservée à Samuel : elle règle sa propre garde, « Qui décide quoi » de `docs/CONTEXT.md`) ; définitive dès sa fusion.

Date : 2026-10-15 · Décideur : Samuel · Rédacteur : CEO · Source : fil « Routine cycle du studio » du projet Vadrouille (deux messages de Samuel, ci-dessous) · Revue : #378 (revue consolidée du head `ede3636`, bloquants 1 à 5, mineurs 6 à 9)

## Contexte

Jusqu'ici, une décision déléguée devenait définitive sans veto de Samuel « sous 2 jours ». Le 2026-10-15, l'attente de 0057 (relevé `db-releve`) repoussait au lendemain un contrôle nécessaire au premier essai réel, alors que le studio travaille par cycles de 3 heures (`docs/CONTEXT.md`).

Messages de Samuel, copiés tels quels :
- 2026-10-15 13:38 UTC : « On va changer cette règle, on va laisser le temps de 2 cycles donc 6h et plus 2 jours pour tes décisions ».
- 2026-10-15 13:47 UTC, carte de décision « Appliquer le délai de 6 heures aussi aux décisions déjà en attente ? » : réponse « Oui, partout » (option « 6 heures remplacent 2 jours, y compris pour les décisions déjà en attente »).

La carte lève l'ambiguïté du premier message (« et plus 2 jours » se lit « et non plus 2 jours ») et tranche la portée rétroactive : les deux points sont de Samuel, pas du CEO.

## Décision

1. Une décision déléguée (Tech Lead, Sécurité, Product Owner, UX/UI, commercial, CEO) devient définitive sans veto de Samuel **6 heures après sa fusion** sur `main`, au lieu de 2 jours. Pour une décision écrite dans une spécification, le point de départ est aussi la fusion de la PR qui l'écrit (et non la publication de la note de version).
2. **Rétroactivité** (choix de Samuel, carte du 13:47 UTC) : la règle vaut pour toutes les décisions encore dans leur délai. Celles fusionnées depuis plus de 6 heures sont définitives à la fusion de 0068 ; les autres le deviennent 6 heures après leur propre fusion.
3. **Ce qui ne change pas** :
   - ce qui est réservé à Samuel, et toute proposition qui attend sa réponse écrite, jamais acquise par son silence (exemple : 0057, lignes 7 et 13, questions ouvertes 1 à 3 : environnement `db-releve` et ses secrets, relevé des environnements, relevés faits par Samuel dans la console Neon) ;
   - les passages marqués **(TL)** non signés tant que le Tech Lead n'a pas approuvé : le délai de veto ne vaut toujours pas signature du Tech Lead ;
   - `owner-approved` (décision 0035) pour les PR de workflow.
4. Samuel peut opposer son veto à tout moment par un message ; après le délai, il passe par une nouvelle décision.

## Conséquences

- **0057** (fusionnée le 2026-10-14) est définitive pour sa partie Sécurité. Sa partie amendée par 0067 (§ 3, contrôle de chiffrement ; #376 fusionnée le 2026-10-15 13:37 UTC) l'est à 19:37 UTC le même jour. Ses dépendances 0052 et 0056 sont fusionnées depuis plus de 6 heures : définitives. Ses passages (TL) restent régis par sa ligne 3 : le délai de veto ne vaut pas signature du Tech Lead (inchangé).
- **Échéances écrites ailleurs** : les rubriques « Décisions (… sous 2 jours) » et les échéances datées des spécifications et handovers (dont `specs/F4-carte.md`, `D1-demo.md`, `F5` à `F13`, `B0`, `B2` à `B8`, `P0-prototype-recherche.md`, `P0-suite-2.md`, `P0c-suite-ia.md`, `P0c-suite-release.md`, `T18-owner-approved-workflows.md`, et `docs/handovers/backend.md` l. 717 et 726) ne sont pas réécrites : **0068 prévaut sur elles**, et chaque échéance se lit « fusion + 6 heures ». Une PR qui touche ces fichiers pour une autre raison peut corriger la phrase.
- Le rôle Sécurité n'a pas de phrase sur le délai dans `.claude/agents/securite.md` ; il suit `docs/CONTEXT.md`.
- Les routines de release recopient `docs/templates/release-note.md`, mis à jour.

## Fichiers mis à jour

`docs/CONTEXT.md`, `docs/studio/mise-en-place.md`, `docs/templates/release-note.md`, `.claude/agents/ceo.md`, `.claude/agents/product-owner.md`, `.claude/agents/tech-lead.md`, `.claude/agents/ux-ui.md`.

## Quand revoir

Si une décision devenue définitive par ce délai court doit être défaite, ou à la mise en public (passe de sécurité avant ouverture).
