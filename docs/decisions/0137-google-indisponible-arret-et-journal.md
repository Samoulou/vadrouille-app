# 0137 — Google indisponible : 429 écrit comme arrêt externe, code Google dans `p0.read_unavailable`

Statut : **acceptée à sa fusion** (0093 : sans délai de veto) · Date : 2026-10-28 · Décideur : Tech Lead (table des codes d'arrêt de 0046 D24 et contenu du journal : architecture, « Qui décide quoi » de `docs/CONTEXT.md`), sur le **verdict favorable de la Sécurité du 2026-10-28** (revue consolidée de la PR #828, head `56673c5` : S4 et champ du journal) · Rédaction : backend · Ticket : #826 · PR : #828. À lister dans la prochaine note de version (« Décisions prises par le studio »).

**Amende, à la date du 2026-10-28** :
- **0046 D24**, liste « `stop_code` », puce « correspondance avec `scripts/p0/journal.ts` » : ajout de l'alias `upstream_rate_limited` → `upstream_unavailable` (§ 1) ;
- **0079 § 6** (journal de la relecture) : `p0.read_unavailable` porte aussi `failureCode` pour une erreur d'un client Google (§ 2) ;
- **0092 § 4** (relecture refusée : page servie sans les temps manquants) : précisé pour un refus de Google (§ 5), sans changer la règle. Ce § 5 est seulement descriptif : le verdict Sécurité cité porte sur les § 1 et § 2, pas sur lui.

## Contexte
Incident du 2026-10-28 sur le site d'essai : à partir de 19:13 UTC, Google répond 429 à tous les appels. Un lancement arrêté par ce 429 s'affichait « échec du traitement », comme une panne interne, et le journal de la relecture ne disait pas quelle erreur Google était survenue.

## Décision
1. **Alias (0046 D24).** `upstream_rate_limited` (429 de Google, `src/grounding/enveloppe-google.ts`) est écrit `upstream_unavailable` dans `prototype.runs.stop_code` (`ALIAS` de `src/prototype/arret.ts`), avant comme après le premier appel payant.
   - Aucune migration : `upstream_unavailable` est déjà dans le `CHECK`.
   - S4 tient (verdict Sécurité) : le code ne dit ni l'étape ni le fournisseur et ne dépend pas du nombre de candidats ancrés.
   - Libellé (`src/i18n/fr/prototype.json`, cause de l'arrêt) : « service externe indisponible ou limite de débit du service ». C'est un fragment en minuscules sans point, comme les autres causes. On écrit « limite de débit du service » et non « limite atteinte » pour ne pas confondre avec nos propres plafonds (`cap_reached`, `envelope_reached`, affichés autrement).
2. **`failureCode` sur `p0.read_unavailable` (0079 § 6).** Quand une relecture Routes échoue sur une `ErreurClientGoogle`, la ligne `warn` porte `errorName` et le code fermé de l'erreur dans `failureCode` (`LOG_STEP_FAILURE_CODES`, qui contient tous les codes Google). Aucun statut HTTP, message ni identifiant de lieu.
   - Seulement pour une `ErreurClientGoogle`. Une autre erreur, même porteuse d'un `code`, n'en a pas.
   - `src/server/p0/relecture.ts` reconnaît l'erreur par son **nom** (`NOM_ERREUR_GOOGLE = "ErreurClientGoogle"`, une chaîne copiée) et non par `instanceof` : le module ne charge pas le client Google, qui reste chargé à la demande avec la composition. Il lit le code par sa forme, comme `codeDe` de `src/server/p0/photos.ts`. Admis parce que `logEvent` filtre de toute façon `failureCode` par liste fermée : une erreur qui imiterait ce nom ne peut écrire qu'un code de la liste.
   - Le journal (`src/server/log.ts`, `CHAMPS_PAR_EVENEMENT`) n'admet plus `failureCode` que sur `p0.step_failed` (ticket 493) et `p0.read_unavailable`. Il est retiré de tout autre événement (`dropped`). Avant, il était admis partout, sans qu'aucun autre événement l'écrive.
3. **Effet sur le suivi et la relance (P0S2-PO-13).** Écrire `upstream_unavailable` au lieu de `pipeline_failed` **ne change aucun décompte et ne déclenche aucune relance** :
   - depuis 0093 point 2 (confirmée par Samuel le 2026-10-19), une exécution `arretee` ne compte jamais et n'est jamais une relance, quel que soit son code. `decompte()` rend toujours `relances: 0`, et `CODES_EXTERNES_SUIVI` (`src/server/p0/decompte.ts`) ne sert plus qu'au test d'égalité avec `CODES_EXTERNES` ;
   - **aucune relance automatique n'existe**, ni du lancement ni de `p0Run`. Seule une personne relance, à la main : « Réessayer » de l'écran 5 (`relancerBriefSaisi`) ou un nouveau lancement depuis `/prototype/executions`. C'est vrai pour toute exécution arrêtée, quel que soit son code ;
   - une relance manuelle passe par la même garde qu'un lancement : cookie d'accès, verrou S8, réservation du forfait du mode (`reserverExecution`) et clé d'idempotence. **Aucun délai** ne la sépare de l'arrêt précédent, et aucun plafond propre aux relances n'existe (le décompte est informatif depuis 0071).
   - **Rien n'aggrave donc la limite de débit de Google du fait de cet alias** : pas de relance automatique, et le libellé ne pousse pas à relancer. Le plus simple qui l'évite est ce qui existe : relance manuelle seulement. Rien n'est ajouté.
4. **`upstream_timeout` et `upstream_error` restent `pipeline_failed`.** L'asymétrie est voulue, et on reste au plus petit changement :
   - `upstream_rate_limited` (429) et `upstream_unavailable` (5xx ou connexion impossible) sont des réponses de Google qui disent que la cause est chez lui ;
   - `upstream_timeout` est levé quand **notre** signal d'arrêt expire (`signal.aborted`, délai fixé par nos clients). Il ne se distingue pas d'un délai d'étape trop court, que D24 range dans `pipeline_failed` (`timeout`) ;
   - `upstream_error` couvre tout autre statut (4xx : requête refusée, clé restreinte) et les erreurs inattendues : plus probablement une faute de notre côté ;
   - `retryable` (`REESSAYABLES` de `enveloppe-google.ts`) dit seulement si un client peut réessayer l'appel tout de suite. Il ne dit pas d'où vient la panne et ne fixe pas le code persisté.
   - Ranger `upstream_timeout` parmi les arrêts externes resterait possible. Il faudrait une nouvelle décision du Tech Lead avec un verdict Sécurité sur S4. Cette question est posée dans la PR #828.
5. **Lecture d'un voyage existant quand Google refuse (0092 § 4, précisé).** Un refus de Routes à la relecture (429, 5xx, délai) donne `{ ok: false, raison: "unavailable" }`. Ce n'est jamais une page d'erreur : la page est servie avec ce qui est en base.
   - Positions lues dans `place_coordinates`, aucun appel Google pour elles. Temps conservés gardés.
   - Les durées manquantes s'affichent « à confirmer » (0095). Rien n'est écrit (0109).
   - Chaque journée dont des paires manquent fait sa propre relecture. Elle écrit une ligne `p0.read_unavailable` à chaque affichage : il y a donc plusieurs lignes par page.

## Hors décision
- Suspendre les relectures Routes d'un processus pendant un délai après un 429, pour ne plus appeler Google à chaque affichage pendant une limite de débit. Cela amenderait 0079 (« à chaque relecture »). La question est posée au Tech Lead et à la Sécurité dans la PR #828.
- Un `stop_code` propre à la limite Google (migration du `CHECK`, approbation de Samuel) : question de la PR #828.

## Tests
- `tests/unit/prototype-lancement.test.tsx` : causes d'arrêt en fragments minuscules sans point final, libellé de `upstream_unavailable` épinglé.
- `tests/unit/p0/arret.test.ts` : `codePersiste("upstream_rate_limited", false | true) === "upstream_unavailable"`.
- `tests/unit/p0/relecture.test.ts` :
  - appel exact et unique de `p0.read_unavailable` avec `failureCode` pour trois codes Google ;
  - aucun code pour une autre erreur ;
  - `failureCode` retiré sur un événement qui n'en veut pas ;
  - voyage existant servi quand Google refuse, avec les textes « à confirmer » vus par la personne.
