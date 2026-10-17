# 0084 — Espaces autour de l'adresse e-mail : le contrat les tolère, `parseEmailAddress` les retire (B3 C3/C5)

Statut : décision déléguée (architecture et tests : « Qui décide quoi » de `docs/CONTEXT.md`), régime de la décision 0068 ; définitive sans veto de Samuel 6 heures après sa fusion.

Date : 2026-10-17 · Décideur : Tech Lead · Ticket : #241 · PR concernée : #452 (B3c, head `2b80bd7`) · Source : bloquant 1 de la dernière « Revue consolidée » de la PR #452, option (a), retenue par le CEO.

## Contexte

Les critères C3 et C5 de `specs/B3-compte-connexion.md` exigent que ` a@exemple.test ` et ` A@Exemple.test ` (espaces autour) soient acceptés par l'action `requestCode`, puis comptés par le limiteur et transmis à Better Auth et au port d'envoi sous la forme canonique `a@exemple.test` ; A15 exige ` A@Exemple.TEST ` → `a@exemple.test` sur `parseEmailAddress`. `parseEmailAddress` (`src/server/email.ts`) retire déjà les espaces U+0020 aux extrémités. Mais `EmailSchema` (`src/contracts/auth.ts`), commun à `CodeRequestSchema` et `CodeVerificationSchema`, refuse toute adresse contenant un espace (`isEmailShape`, `src/contracts/values.ts`) avant l'adaptateur : C3 et C5 ne passent pas tels quels, et les tests de la PR #452 les contournent (`tests/db/auth-contrat.test.ts`, lignes 203-206 et 268 au head `2b80bd7`).

## Décision

Amendement de `src/contracts` autorisé **pour ce seul point**.

1. **Où a lieu le retrait.** Les espaces U+0020 aux extrémités, et eux seuls (ni tabulation, ni retour à la ligne, ni autre espace Unicode tel que U+00A0), sont tolérés par le contrat et retirés par **une seule fonction** : `stripEdgeSpaces(value: string): string`, exportée de `src/contracts/values.ts`, écrite comme un parcours caractère par caractère (sans expression régulière, 0051 point 4.3). `sansEspacesAuxBords` de `src/server/email.ts` est supprimée et `parseEmailAddress` appelle `stripEdgeSpaces` : aucune seconde implémentation.
2. **Contrat.** `EmailSchema` devient `z.string().max(320).refine((v) => isEmailShape(stripEdgeSpaces(v)), …)`. 320 est la borne d'entrée brute de `parseEmailAddress` (`LONGUEUR_ENTREE_MAX`), déplacée dans `values.ts` sous le nom `EMAIL_INPUT_MAX_LENGTH` et importée par `src/server/email.ts`. Le schéma **ne transforme pas** la valeur (pas de `.transform`, pas de `.trim()` de Zod, qui retirerait aussi tabulations et retours à la ligne) : le type `CodeRequest` reste `{ email: string }` et la valeur reçue arrive intacte à l'adaptateur. `isEmailShape` est inchangée et continue de refuser tout espace (le formulaire l'applique après son propre retrait).
3. **Forme canonique transmise.** Dans l'adaptateur `better-auth`, `parseEmailAddress` reste le premier contrôle et le seul point qui fabrique `CanonicalEmail` (0050, B3-TL-6 point 6 ; 0051 point 4). C'est cette forme canonique, et elle seule, qui est passée au limiteur (avant HMAC), à Better Auth (`users.email`, `verifications.identifier`) et au port d'envoi (`to`). Aucune valeur brute (avec espaces) ne dépasse `parseEmailAddress`. Le contrôle refait dans `src/server/auth/envoi.ts` reste inchangé.
4. **Hors du champ de cette décision.** L'adaptateur simulé (`mock-auth`, qui normalise déjà par retrait des blancs), le formulaire `SignInForm` (`email.trim()` puis `isEmailShape`, inchangé), les règles de la forme canonique (B3-PO-2) et les critères C3, C5 et A15, qui restent tels qu'écrits.

## Tests attendus (sur la PR #452)

- **Contrat** (`pnpm test`, `src/contracts`) : `CodeRequestSchema` et `CodeVerificationSchema` acceptent ` a@exemple.test `, `  A@Exemple.test  ` et `a@exemple.test`, et rendent la valeur **inchangée** ; ils refusent `\ta@exemple.test`, `a@exemple.test\n`, ` a@exemple.test`, `a @exemple.test`, une chaîne faite d'espaces seulement, une adresse de 255 caractères sans espace, et une entrée brute de 321 caractères. `stripEdgeSpaces` : cas vides, espaces seuls, espaces intérieurs conservés, tabulation conservée. Les tests existants d'`isEmailShape` restent inchangés.
- **C3** (`pnpm test:db`) : le contournement est retiré ; ` a@exemple.test ` (préfixé par la valeur propre au test) passe par l'action, compte parmi les variantes de la même adresse, et le 6e envoi dans l'heure est refusé (`rate_limited`).
- **C5** (`pnpm test:db`) : ` A@Exemple.test ` passe **par l'action** `requestCode` (et non plus seulement par l'adaptateur) ; les espions montrent `a@exemple.test` au limiteur, à Better Auth, dans `verifications.identifier` et dans `to` du double de capture. Les entrées invalides de C5 restent `validation_failed` sans écriture du limiteur ni appel à Better Auth ou au port.
- **A15** (`pnpm test`) : inchangé ; ` A@Exemple.TEST ` → `a@exemple.test` reste vert après le passage à `stripEdgeSpaces`.

## Conséquences

- L'agent backend applique cette décision sur la PR #452 en la citant ; le Tech Lead lève le bloquant 1 de la revue quand C3 et C5 passent sans contournement.
- Le commentaire d'`EmailSchema` (`src/contracts/auth.ts`) et celui d'`isEmailShape` citent 0084 : le contrat tolère les espaces U+0020 aux extrémités, l'interface et le serveur acceptent les mêmes adresses une fois ces espaces retirés.
- À lister dans la prochaine note de version.
