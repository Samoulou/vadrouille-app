# 0101 — Décisions du Tech Lead sur B9b (revue de #517) : import de l'adaptateur `api`, expiration hors de `createTrip`, amendement du test du graphe ; liste des importateurs des règles de lint de B9-TL-1 point 3

Statut : décision déléguée (architecture, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio ». Samuel peut la remettre en cause à tout moment par une nouvelle décision. Rien ici n'engage d'argent, de compte externe ni de donnée personnelle hors UE.

Date : 2026-10-20 · Décideur : Tech Lead · Ticket : #519 · Spécification : `specs/B9-generation.md` (B9b, « Ordre ») · Revue consolidée de #517 (head `bb01210`, 2026-10-19 01:14 UTC), section « Décisions du Tech Lead sur les questions de la PR » · Décisions liées : 0081 B9-TL-1, 0087 § 1.6, 0100 § 5.2

Numérotation (relue le 2026-10-20 sur `main` `53f536b`) : `main` porte 0001 à 0096, 0098 et 0100 ; 0097 (#540) et 0099 (#542) sont portées par des PR ouvertes ; aucune autre PR ouverte n'ajoute un fichier sous `docs/decisions/` ; 0101 est le premier numéro libre.

**Amende, sans les réécrire** (renvoi ajouté en tête de 0081) : **0081 B9-TL-1 point 1** (ligne `src/adapters/api-creation.ts`, « n'importe que `@/server/actions/*` ») et **B9-TL-1 point 3** (règles de lint des imports : importateurs de `@/server/creation/*`).

## Contexte
La revue de #517 (B9b, fusionnée en `a95d92b`) a tranché trois points et demandé qu'ils soient consignés « hors de cette PR ». Cette décision les consigne, puis fixe la liste exacte des importateurs que la PR de lint suivante (même ticket) encode, pour que la règle n'ait pas à être redécidée en code.

## Décision

### 1. Import de l'adaptateur `api` : dérogation à 0081 B9-TL-1 point 1
`src/adapters/api-creation.ts` importe `@/server/creation` (`creerCasCreation`, `DependancesCreation`). 0081 B9-TL-1 point 1 le disait importateur de `@/server/actions/*` seulement (0017 § 3.3), mais l'adaptateur `api` de la lecture (`src/adapters/api.ts`, B6a, 0086 § 1.1 point 2) appelle déjà directement le module serveur dans le même processus, et passer par une action ajouterait une frontière sérialisée sans protéger rien : l'adaptateur n'est chargé que côté serveur (aucun appel HTTP vers soi-même, handover § 11). **Retenu** : dérogation limitée à ce **seul fichier** et à `@/server/creation` ; aucun autre fichier de `src/adapters/` n'importe `@/server/creation/*` ni `@/server/generation/*`. Rejeté : élargir à `src/adapters/**` (la règle doit nommer un fichier, comme `ligne/voyages-imports` nomme `src/adapters/api.ts`).

### 2. Pas d'expiration dans `createTrip`
`createTrip` n'appelle pas `expirerExecutions` (`src/server/generation/expiration.ts`) : il ne lit ni ne modifie d'exécution précédente du voyage, qui est neuf. L'expiration des exécutions figées (0081 B9-TL-3 point 5) reste faite par la lecture de l'état de génération (`etat-generation.ts`). L'écran 5 suit `activeTripId` ; **le traitement de ce suivi (expiration d'une exécution figée au moment de la création) est confié à B9c**. Aucune autre tâche ne l'ajoute avant.

### 3. Amendement de `tests/unit/p0/imports.test.ts` accepté
L'ajout de B9b (arête `src/ai/natures.ts` admise depuis `src/server/generation/**` et `src/server/creation/**`, six cas fabriqués, titre qui cite 0081 B9-TL-1 point 2) est accepté. 0081 B9-TL-1 point 4 réserve la réécriture complète du test à B9c : elle reste à faire ; l'ajout de B9b n'en tient pas lieu.

### 4. Règles de lint de B9-TL-1 point 3 : importateurs admis
Règle `ligne/creation-imports` (plugin `ligne`, fichier `eslint-rules/creation-imports.mjs`, test sous `tests/unit/lint/`), posée sur tout fichier par un seul bloc d'`eslint.config.mjs`. Les fichiers de test (`*.test.*` et `tests/`) sont admis partout (comme `ligne/relecture-imports`). Sources lues sous toutes leurs formes (import, réexport, `import()`, `require()`, `import type`, `vi.importActual`…), alias et chemins relatifs résolus.

| Module chargé | Importateurs admis (hors tests) |
|---|---|
| `@/server/composition/generation` | `src/server/creation/**`, `src/server/generation/**` |
| `@/server/generation/*` | `src/server/generation/**`, `src/server/creation/**`, `src/server/payment/**` (suite de B4a), `src/workflows/apercu.ts`, `src/workflows/voyage-complet.ts`, `src/workflows/index.ts` ; `@/server/generation/reprise` seul : aussi `scripts/reprise-studio.ts` (0087 § 1.6 point 3) |
| `@/server/creation/*` | `src/server/creation/**`, `src/server/actions/creation.ts`, `src/adapters/api-creation.ts` (§ 1) |
| `@/server/with-system-org` | `src/server/payment/**`, `src/server/generation/**`, `scripts/reprise-studio.ts` (0087 § 1.6 points 1 et 3) |

Précisions :
- Les noms `src/server/payment/**`, `scripts/reprise-studio.ts`, `@/server/generation/reprise` et `@/server/with-system-org` sont ceux de 0087 (« nom libre ») ; **la tâche qui crée l'un d'eux sous un autre nom amende la liste** dans sa PR (c'est un fichier de configuration du confinement : PR séparée, jamais dans le cycle d'une sous-tâche de B9 qui modifie `eslint.config.mjs`, spécification B9 « Ordre »). B10 et B11 ajouteront leurs importateurs de `@/server/generation/*` de la même façon (0081 B9-TL-1 point 3).
- Les compositions de la lecture (`src/server/composition/lecture.ts` et `clients-google.ts`, 0100 § 5.2) ont leur règle (`ligne/relecture-imports`, étendue par B8b) ; `ligne/creation-imports` ne les vise pas. La fabrique commune des clients Google sera reprise par `generation.ts` (B9c) sans changer cette liste.
- `import "server-only"` dans tous ces modules : déjà imposé sous `src/server/` par `ligne/require-server-only`.
- La frontière du graphe (0081 B9-TL-1 point 2) reste portée par `tests/unit/p0/imports.test.ts`, pas par cette règle.

## Conséquences testables
- Lint : `tests/unit/lint/creation-imports-lint.test.ts` (importateurs admis et refusés de chaque ligne du tableau, dont `src/adapters/api-creation.ts` admis et un autre fichier de `src/adapters/` refusé), sur la configuration réelle ; le lint complet de `main` reste vert.
- Aucune autre conséquence de code dans cette PR (documents seulement).

## Quand revoir
À la fusion de B9c (nouveaux importateurs, réécriture du test du graphe), de B4a (nom de `src/server/payment/`) et de B9d (nom de la commande de reprise).
