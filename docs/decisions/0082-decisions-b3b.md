# 0082 — Décisions du Tech Lead sur les questions de la PR de B3b (#446)

Statut : décision déléguée (architecture, bibliothèques et tests : « Qui décide quoi » de `docs/CONTEXT.md`), régime de la décision 0068 ; définitive sans veto de Samuel 6 heures après sa fusion.

Date : 2026-10-17 · Décideur : Tech Lead · Ticket : #444 · Source : revue consolidée du head `f0b8c5a` de la PR #446 (commentaire du 2026-10-17, 13:49 UTC), section « Décisions du Tech Lead sur les questions de la PR ». Cette décision consigne ces décisions telles que la revue les énonce ; elle n'en ajoute aucune.

## Décisions
- **B8 / B3-TL-9** : déjà tranchée par 0077 § 5.5 ; parade codée conforme. Critère B8 vert.
- **7.9** : option 2 (adaptateur enveloppant) **retenue**. À consigner dans 0008 : la création d'un `user` dans une transaction de la bibliothèque reste refusée (échec fermé) ; parade à revoir si un parcours futur (fournisseur social, champs additionnels) crée des utilisateurs.
- **7.12** : contrôle préalable sous verrou **retenu** à la place du compteur `action_rate_limits` (prérequis : bloquant 3 de la même revue).
- **`validateSchema: false`** : acceptable.

## Conséquences
- L'amendement de 0008 (section « Vérifications de Better Auth 1.7.7 (B3b) ») et la description de la PR #446 remplacent « proposée » par « retenue par le Tech Lead (décision 0082) ».
