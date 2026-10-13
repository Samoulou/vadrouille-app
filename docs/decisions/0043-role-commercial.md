# 0043 — Décision de Samuel : création du rôle commercial

Statut : décision de Samuel (création de rôle, « Qui décide quoi » de `docs/CONTEXT.md`) · Date : 2026-10-13 · Décideur : Samuel · Ticket #250

Numérotation (vérifiée le 2026-10-13) : `main` va de 0001 à 0042 ; aucune branche `claude/…` n'ajoute de fichier `0043`.

## Contexte
La condition G0 (`docs/roadmap.md`) est d'abord commerciale : 30 prospects contactés, 10 échanges, 5 achats ou préventes dont 3 hors cercle proche. Depuis la décision 0029, le studio construit toute la chaîne du MVP, mais aucun rôle ne prépare la vente. Le cadrage v5 contient déjà le modèle (aperçu offert puis paiement unique), le prix (29 CHF, Q2), le pilote assisté (49 puis 79 CHF), la piste agences, le budget (dont 100 CHF de tests d'acquisition et de contenus) et les canaux de départ (§ 5). Les voyages de printemps se préparent de janvier à mars (§ 5) : les préventes ont intérêt à être proposées dès maintenant.

Le 2026-10-13 à 16:59 UTC, dans le fil de projet « Commercialisation en parallèle du développement », Samuel a répondu « Oui, lancer » à la question « Créer un rôle commercial pour préparer la prévente et le marketing ? ».

## Décision
1. Le rôle `commercial` est créé (`.claude/agents/commercial.md`). Il prépare la vente, le marketing et les réseaux sociaux sous forme de documents dans `docs/commercial/`.
2. Il ne décide rien de ce qui est réservé à Samuel : cible, offre, prix, phases, dépenses, comptes externes, juridique. Il ne contacte, ne publie et ne dépense jamais au nom de Samuel : il prépare, Samuel valide et envoie.
3. Ses tâches suivent les règles communes (ticket, spécification `specs/C<n>-…`, branche, PR, `pnpm verify`, `needs-review`). Elles ne touchent pas au code de l'application ; elles comptent dans la limite de 3 fils en parallèle du CEO, mais n'entrent jamais en conflit de fichiers avec les tâches de développement.
4. Première tâche : `specs/C1-prevente.md`.

## Conséquences
- Le CEO ajoute le rôle `commercial` à ses cycles et reporte ses questions dans `QUESTIONS.md`.
- Le tableau de suivi hebdomadaire du cadrage § 13 (prospects, offres, achats, provenance) devient un livrable du rôle.
