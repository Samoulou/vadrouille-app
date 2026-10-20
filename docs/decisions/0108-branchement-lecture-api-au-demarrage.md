# 0108 — Branchement de l'adaptateur `api` au démarrage par `src/instrumentation.ts` (amende 0100 § 5.2 et § 5.4)

Statut : **décision déléguée** (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), validée sur le fond par le Tech Lead dans la revue consolidée de la PR #576 (head `d804fe2`, bloquant 1, réponse à la question 2 de la PR) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion (décision 0093) ; Samuel peut la remettre en cause à tout moment. Elle n'affaiblit ni ne supprime aucun test, ne change ni droits, ni RLS, ni migration, ne lève aucune garde (0086 § 2.1, 0100 § 5.3), n'engage ni argent, ni compte externe, ni donnée personnelle hors UE, et ne touche aucun plafond.

Date : 2026-10-20 · Décideur : Tech Lead (rédaction : backend) · Ticket : #532 · PR : #576 · Spécification : `specs/B6-api-lecture.md`, B6b point 1 · Décisions liées : 0086 § 2.1, 0100 § 5.2 et § 5.4, 0050 (B3-TL-1 point 2), 0074, 0079 point 5, 0085 § 1.8

Numérotation (relue le 2026-10-20 sur `main` `60eed8d`) : `main` porte 0001 à 0107 ; aucune PR ouverte ne porte un 0108.

## Contexte

0100 § 5.2 prévoit que `@/server/composition/lecture` soit importé **statiquement** par `src/adapters/index.ts` (comme `@/server/config/offer`, 0086 constat 7), et § 5.4 que la PR fusionnée en second (B6b) fasse le branchement « dans `getTripAdapter("api")` ». Les cas fabriqués de `tests/unit/p0/imports.test.ts` décrivaient l'arête `src/adapters/index.ts` → `composition/lecture`.

Cet import ne passe pas les gardes en place :
- « p0: clé côté serveur seulement » : `src/features/…` → `src/adapters/index.ts` atteindrait `src/server/composition/` et, par `src/adapters/api.ts` → `withOrg` → `db/connection.ts`, `src/server/env/resolve.ts`, même par un `import()` ;
- fermeture transitive du confinement : les doubles de `@/adapters` (19) chargeraient un module à capacité.

Élargir ces gardes affaiblirait deux protections ; la PR #576 a suivi le modèle déjà en place pour `better-auth` (B3c) et `prototype-instance` (0074, 0079).

## Décision

1. **Branchement au démarrage** (amende 0100 § 5.4, « dans `getTripAdapter("api")` ») : `src/instrumentation.ts`, dans `register()` (runtime `nodejs`, après la validation de l'environnement), quand `DATA_ADAPTER` vaut `api`, importe dynamiquement `@/adapters/api-instance`, `@/adapters/api` et `@/server/composition/lecture`, et branche la fabrique `(double) => createApiTripAdapter({ relectures: choisirSourceRelectures(double) })` par `brancherLectureVoyages`. `getTripAdapter("api")` appelle `apiTripAdapter()` (`src/adapters/api-instance.ts`) : garde `assertApiAdapter` à chaque appel (0086 § 2.1, inchangée), puis la fabrique branchée sur un double de relectures neuf.
2. **Importateurs de `@/server/composition/lecture`** (amende 0100 § 5.2) : hors des tests, **`src/instrumentation.ts` seul** l'importe. `src/adapters/index.ts` ne l'importe pas et sort de la liste de la règle `ligne/relecture-imports` (`eslint-rules/grounding-imports.mjs`, `IMPORTATEURS_COMPOSITION_LECTURE`) : son import y est désormais signalé (`tests/unit/lint/grounding-lint.test.ts`). `src/adapters/api-instance.ts` n'importe ni `./api.ts` ni `@/server/composition/lecture`.
3. **Échec fermé** : non branché (tests, `next build`, autre runtime), `getTripAdapter("api")` passe la garde puis rend un adaptateur dont chaque méthode rejette, sans rien lire et sans repli vers `mock`. C'est un écart toléré à la lettre de 0086 § 2.1 (la levée a lieu à l'appel d'une méthode, non à `getTripAdapter`), testé. Un second branchement lève `LectureDejaBrancheeError` ; hors de `tests/`, seuls `api-instance.ts` et `src/instrumentation.ts` nomment `brancherLectureVoyages` (`tests/unit/auth/points-injection.test.ts`). Un échec du branchement est journalisé (`voyages.action_failed`, action `branchement`) sans arrêter le serveur.
4. **Frontière** (cas fabriqués de 0100 § 5.2, remplacés) : admis `src/instrumentation.ts` → `composition/lecture` → `composition/clients-google` → `@/grounding/*` (le parcours s'arrête à la fabrique) ; les refus de 0100 § 5.2 sont inchangés.

## Conséquences testables

- `tests/unit/p0/imports.test.ts` : commentaire de `PONTS_LECTURE` et cas fabriqué « admis : `src/instrumentation.ts` → `composition/lecture` → fabrique → modules de capacité ».
- `tests/unit/p0/composition.test.ts` : les importateurs réels de `src/server/composition/lecture.ts`, hors des tests, sont exactement `src/instrumentation.ts`.
- `tests/unit/lint/grounding-lint.test.ts` : `src/instrumentation.ts` admis par la règle ; `src/adapters/index.ts` signalé.
- `tests/unit/adapters/api-garde.test.ts`, `tests/unit/server/instrumentation.test.ts`, `src/adapters/index.test.ts` : branchement, second branchement refusé (`LectureDejaBrancheeError`), adaptateur non branché qui rejette, garde.

## Quand revoir

Si une page, une action ou un composant doit atteindre la composition de la lecture autrement que par le démarrage ; si Next.js cesse d'appeler `register()` avant la première requête ; si un autre module que `src/instrumentation.ts` doit brancher ou importer la composition de la lecture (nouvelle décision écrite, et la règle le nomme).
