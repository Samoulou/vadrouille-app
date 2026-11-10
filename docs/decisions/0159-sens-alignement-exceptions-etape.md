# 0159 — Exceptions d'une étape : le contrat s'aligne sur la base (`toConfirm` dérivée à la lecture), sans migration

Statut : **proposée par l'agent `data`, à confirmer par la revue (Tech Lead avec le Product Owner)**. Elle ne devient une décision qu'à l'approbation de la PR par le Tech Lead, avec l'accord écrit du Product Owner dans la PR. D'ici là, rien de ce texte n'engage.

Date : 2026-11-01 · Décideurs : Tech Lead, avec le Product Owner · Ticket : 1019 (question 4 de la PR M6a, mineur 11 de sa revue) · `main` relu : `0c43fdf`

Numérotation : `main` va jusqu'à 0158 ; aucune PR ouverte n'ajoute 0159.

## Contexte

Le contrat (`src/contracts/trip.ts`, `ExceptionSchema`) connaît trois exceptions d'une étape : `toReserve` (« À réserver »), `toConfirm` (« À confirmer ») et `unconfirmed` (« Non confirmé »). La vue partagée en admet deux, `toConfirm` et `unconfirmed` (`SHARED_EXCEPTIONS`, décision 0039, F10-TL-1).

L'instantané stocké (`trip_versions.snapshot`) n'en garde que deux, `toReserve` et `unconfirmed` :
- à l'écriture, `refineSnapshotExceptions` (via `TripSnapshotSchema`) refuse `toConfirm`, sur la liste `SNAPSHOT_STOP_EXCEPTIONS` de `db/jsonb-keys.ts` ;
- en base, la seule contrainte de la colonne est « est un objet » (`0000_socle`) ;
- seule la fonction `public.shared_exceptions` (`0001_securite`) filtre en SQL, pour les vues partagées.

La question 4 de la PR M6a y voyait un défaut de la base, qui empêcherait « À confirmer » d'atteindre les écrans sur `api`.

L'écart est voulu. `toConfirm` est tirée des horaires Google : décision 0011, point 5. Elle est recalculée à chaque lecture (`aConfirmer`, `src/domain/calculs.ts` ; `src/domain/recomposition.ts`) et n'est jamais écrite. Les écrans de la personne la reçoivent donc sur `api`. La vue partagée d'`api`, elle, lit l'instantané stocké sans relecture pour le visiteur : elle ne porte que `unconfirmed`, comme elle porte une durée de trajet `null`.

## Décision proposée

1. **Le contrat s'aligne sur la base, et non l'inverse.** `toConfirm` reste une valeur **dérivée à la lecture** des horaires Google. Elle n'est jamais stockée, ni dans l'instantané, ni dans une colonne, ni dans une vue.
2. **Aucune migration.** Admettre `toConfirm` dans l'instantané stockerait une donnée dérivée de Google : c'est interdit par `CLAUDE.md` (« stocker autre chose que l'identifiant d'un lieu Google ») et par la décision 0011, point 5, que seul Samuel peut changer. Une valeur stockée serait aussi périmée dès que les horaires changent. `toReserve` n'est pas renommée : « À réserver » est une action de la personne, « À confirmer » une incertitude sur les horaires.
3. **Contrat** : aucune valeur ni aucun schéma ne change. `SHARED_EXCEPTIONS` liste des valeurs **admises, pas garanties** : `toConfirm` y vient d'une lecture qui la recalcule, ou d'une donnée de démonstration (adaptateur simulé). Le commentaire de `src/contracts/values.ts` le dit.
4. **Tests qui figent l'alignement** :
   - une étape « À confirmer » créée sur `api` est stockée sans `toConfirm` et ressort avec à chaque lecture ;
   - la vue partagée du voyage créé (`shared_trip_version`) n'en porte jamais ;
   - la projection de la vue partagée garde `toConfirm` et `unconfirmed`, et retire `toReserve`.

## Ce que cette décision ne tranche pas

**« À confirmer » dans la vue partagée d'`api`** : la montrer au visiteur demanderait une relecture des horaires (Places) à chaque vue anonyme, avec son coût, son limiteur et un verdict de la Sécurité. C'est la **question 1 de la PR du ticket 1019**, adressée au Product Owner avec le Tech Lead, et à Samuel pour le coût Google. Elle reste **ouverte** jusqu'à l'accord du Product Owner ; ce texte ne la tranche pas. D'ici là, la vue partagée d'`api` montre « Non confirmé » seulement.

## Conséquences

- Aucune donnée, aucune base et aucun écran ne changent.
- La question 4 de la PR M6a se clôt sur le constat ci-dessus : l'écart ne touche que la vue partagée d'`api`.
- Un futur changement de `ExceptionSchema`, de `SNAPSHOT_STOP_EXCEPTIONS` ou de `SHARED_EXCEPTIONS` fait échouer `tests/unit/contracts/exceptions-etape.test.ts` et repasse par une décision.

## Quand revoir

À la réponse à la question 1 (relecture des horaires pour le visiteur), ou si Samuel change la règle de stockage des données Google (décision 0011, point 5).
