# 0130 — Requête `programme` : raisonnement borné et raison de fin journalisée

Statut : **proposée** par le rôle IA avec le Tech Lead (PR #745, branche `claude/programme-illisible-raisonnement`). C'est une décision déléguée du **Tech Lead** (réglages des modèles et outillage du prototype, comme 0116 § 2 ; « Qui décide quoi » de `docs/CONTEXT.md`). Elle est acceptée quand le Tech Lead approuve la PR #745. Les champs du journal (§ 2) ont reçu le verdict de la **Sécurité**, rendu dans la revue consolidée du head `de3db87` : approuvé, sans bloquant. La décision devient **définitive à sa fusion**, sans délai de veto (décision 0093). Elle sera listée dans la note de version suivante (rubrique « Décisions prises par le studio »).

Elle n'engage pas d'argent : plafond de jetons, réservation et fusible de 3 USD par exécution sont inchangés (§ 1.3). Elle n'engage aucun compte externe et aucune nouvelle donnée envoyée au fournisseur (un réglage de génération s'ajoute, sans donnée). Elle ne supprime ni ne désactive aucun test.

Date : 2026-10-24 · Décideur : Tech Lead (proposée par IA) · PR : #745 · **Amende** : 0116 § 2 (requête `programme`, révision comprise), 0116 § 4.4 et 0117 § 4 (liste fermée de `p0.programme_written`) · Décisions liées : 0096 § 2 point 6 (jetons lus dans `usage`), 0115, 0126 § 4 (révision)

Numérotation : `main` porte 0001 à 0129 ; 0130 a été réservée à cette PR par le CEO.

## Contexte

Le 2026-10-24, deux lancements réels depuis le formulaire du site d'essai ont échoué de la même façon dans `etapeProgramme` (`ecrireVersion`). Ils ont eu lieu à 11:05:56 et 11:08:17 UTC, sur la branche `p0-reel` au head `d6be442`, avec le même code IA que `main`.

Le journal montre `p0.programme_written` avec `days: 0`, tous les compteurs à 0, `modelCalls: 1` et `errorName: "ArretEtape"`. Il est suivi de `p0.step_failed`, phase `recherche`, code `pipeline_failed`, après environ 2 minutes par étape. Le modèle a donc répondu, mais `lireProgramme` n'a trouvé aucun objet JSON (`model_output_invalid`, 0116 § 3.4).

Le texte de la réponse n'est jamais journalisé, à dessein. La cause n'est donc **pas établie**. Elle est **déduite** :
- la requête `programme` part avec `max_tokens: 32000` (`JETONS_SORTIE_MAX_PROGRAMME`) et sans réglage de raisonnement ;
- `deepseek/deepseek-v4.1-flash` raisonne ;
- la documentation d'OpenRouter (« Reasoning tokens », lue le 2026-10-24) dit que `max_tokens` couvre, chez la plupart des fournisseurs, le raisonnement et la réponse ensemble. Si le raisonnement épuise ce budget, la réponse revient avec `finish_reason: "length"` et un contenu vide, et le raisonnement est facturé quand même.

C'est le profil observé : un appel, aucun JSON, aucun champ retiré. La release du matin (#731, #732) ne touchait ni `src/ai` ni la configuration des modèles.

## 1. Raisonnement borné pour la requête `programme` (amende 0116 § 2)

1. **Réglage** : la requête de nature `programme` porte `reasoning: { max_tokens: 8000 }` (`JETONS_RAISONNEMENT_MAX_PROGRAMME`, constante du code de `src/ai/openrouter-client.ts`). Elle garde `max_tokens: 32000`. Cela vaut pour la rédaction (`redigerProgramme`) **et** pour la révision (`redigerRevision`, 0126 § 4), qui est la même nature de requête (`etape: "programme"`, prompt `revision`).
   - Aucune autre requête n'en porte : recherche, notation, raisons, recherche web, couche du MVP.
   - Le routage ne change pas : `data_collection: "deny"` et `zdr: true`, échec fermé (0117 § 5).
   - L'enveloppe du client n'est pas modifiée.
   - `@openrouter/ai-sdk-provider` 3.1.0 (version installée) accepte ce réglage (`OpenRouterProviderOptions.reasoning`, `max_tokens` ou `effort`) et le transmet tel quel dans le corps.
2. **Posé par hypothèse** : la répartition 8 000 jetons pour le raisonnement et 24 000 pour la réponse est **ce que l'on demande**, pas ce que le fournisseur garantit. Rien ne vérifie, sans appel réel, que `deepseek/deepseek-v4.1-flash` routé en `zdr` accepte `reasoning.max_tokens`, ni qu'il compte le raisonnement dans `max_tokens`. Le code ne promet donc aucun nombre de jetons pour la réponse.
3. **Coût** : `COUT_ESTIME_PROGRAMME_MICROS` reste 90 000. Le plafond total `max_tokens` ne change pas, et les jetons de raisonnement sont facturés comme des jetons de sortie. Le pire cas reste donc celui de 0116 : 32 000 jetons de sortie et 10 000 d'entrée au tarif ZDR le plus cher relevé le 2026-10-21, soit 0,083 USD. C'est sous 0,09 USD, très en deçà du fusible de 3 USD.
4. **Modèles qui n'acceptent qu'un niveau d'effort, ou aucun raisonnement** (mineur 4 de la revue) :
   - Selon la documentation d'OpenRouter, pour un modèle qui n'accepte que `reasoning.effort`, « la valeur de `max_tokens` est utilisée pour déterminer le niveau d'effort ». 8 000 sur 32 000 correspond à environ un quart, entre `low` (20 %) et `medium` (50 %).
   - La documentation **ne dit pas** ce qu'il advient de `reasoning` envoyé à un modèle qui ne raisonne pas, ou qui n'a qu'un interrupteur marche/arrêt : paramètre ignoré ou refus 400. Elle ne cite pas DeepSeek.
   - **Règle** : le réglage n'est donc admis que pour le modèle que cette décision nomme. Un test lit `prototype/config/modeles.json` et échoue si `etapes.programme` n'est plus `deepseek/deepseek-v4.1-flash`. Changer de modèle pour la rédaction demande de revoir cette décision : garder, adapter ou retirer `reasoning`. Un refus 400 sortirait déjà en code fermé `upstream_error`, sans second appel (0117 § 5).
5. **Mesure si l'hypothèse tient** : sans ce réglage, une réponse de 32 000 jetons de sortie et de texte vide. Avec lui, une réponse lisible, ou un `length` après un JSON coupé qui se lit dans `outputTokens` (§ 2). Le passage à l'option (b) de 0116 § 2.4 (un appel par jour) reste réservé à un constat d'essai réel, par une nouvelle décision.

## 2. Raison de fin et jetons sur `p0.programme_written` (amende 0116 § 4.4 et 0117 § 4)

1. **Champs ajoutés** à la liste fermée de `p0.programme_written`, sur la requête de rédaction (ou de révision) de l'étape :
   - `finishReason` : liste fermée `LOG_FINISH_REASONS` de `src/server/log.ts`, copie de `FINS_MODELE` (`src/ai/client.ts`) dont l'égalité est vérifiée par le test du journal. Les valeurs sont `stop`, `length`, `content-filter`, `tool-calls`, `error` et `other`. La raison brute du fournisseur n'est jamais écrite (le client la réduit déjà à `other`). Toute autre valeur est retirée et comptée dans `dropped`.
   - `inputTokens`, `outputTokens` : entiers de 0 à 10 000 000 (`MAX_TOKENS` de `src/ai/client.ts`, recopié dans le journal). Ce sont les seuls jetons que le client lit dans `usage` (0096 § 2 point 6). Les jetons de raisonnement ne sont pas lus : 0096 § 2 point 6 l'interdit, et les lire demanderait une décision et un verdict de la Sécurité.
2. **Présence** : les champs ne sont écrits que si le client réel les rend (absents du double sur fixtures, ou si `usage` est hors forme). Ils sont posés dès la réponse du modèle, **avant** la lecture, et figurent donc sur la ligne `warn` d'un programme illisible.
3. **Condition de 0117 § 4** tenue : ce sont des fonctions de la **réponse du modèle** seule, sans lien avec l'ancrage ni avec une réponse de Google. Jamais le texte du modèle, un nom ou une donnée Google.

## 3. Tests (doubles seulement, aucun appel réel ni payant)

- `src/ai/openrouter-client.test.ts` : corps de la requête `programme` (prompt `programme` et prompt `revision`) avec `reasoning` et routage inchangé ; requête ordinaire sans `reasoning` ; réponse à texte vide, `length`, 32 000 jetons, rendue telle quelle.
- `tests/unit/p0/composition.test.ts` : à travers `composerP0Reel` et le client réel sur un `fetch` double, `redigerProgramme` **et `redigerRevision`** (la capacité que `etapeRevision` appelle, 0126 § 4) envoient `reasoning` ; garde du modèle nommé (§ 1.4).
- `tests/unit/workflows/p0-run-finale.test.ts` (existant) : la requête que `etapeRevision` envoie à travers la composition est de nature `programme`, prompt `revision`.
- `tests/unit/workflows/p0-run.test.ts` : programme illisible, avec `finishReason: "length"` et les jetons sur la ligne `warn`, sans le texte ; code persisté `codePersiste(CODE_PROGRAMME_ILLISIBLE, true)`.
- `tests/unit/server/limiteur.test.ts` : `finishReason` fermé et égal à `FINS_MODELE` ; jetons entiers bornés.

## Quand revoir

- **Au prochain lancement réel de Samuel** (essai sur `p0-reel` après la fusion), lire sur `p0.programme_written` :
  - `finishReason: "stop"` et `outputTokens` sous 24 000, programme lisible : l'hypothèse tient ; rien à changer.
  - `finishReason: "length"` et `outputTokens` proche de 32 000, `days: 0` : le budget est encore épuisé. Soit le fournisseur ignore `reasoning.max_tokens` pour ce modèle, soit la réponse elle-même dépasse 24 000 jetons. Nouvelle décision : `effort` plus bas, raisonnement coupé (`effort: "none"`), ou `max_tokens` relevé avec la réservation recalculée (par exemple 40 000 jetons : 0,102 USD, réservé à 110 000 micro-USD, sous le fusible de 3 USD, sous réserve du plafond de sortie du fournisseur).
  - `finishReason: "stop"`, `days: 0` : la réponse est terminée mais n'est pas du JSON lisible. La cause est ailleurs (prompt ou lecture tolérante), et ce réglage n'est pas en cause.
  - Refus 400 (`upstream_error`) dès l'appel : le modèle refuse `reasoning`. Retirer le réglage par une nouvelle décision.
- Changement du modèle `etapes.programme` dans `prototype/config/modeles.json` (§ 1.4).
