# 0177 — Envoi du questionnaire de la prévente (C2c) : seuil à part du compartiment commun du limiteur (T7), forme de l'action, du schéma, des codes et de la lecture du verdict

Statut : **proposée par l'agent tech-lead, définitive à la fusion (0093)**. Décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Elle répond à la question **T7** de `specs/C2-prevente-mesure.md` (§ 3.4 point 2, rubrique « Au Tech Lead ») et fixe les formes que le rôle `backend` rencontre pour C2c. Elle ne tranche rien de ce qui revient à la **Sécurité** (S2 : § 9) ni à **Samuel**, au **Product Owner** ou à l'**UX/UI** (§ 10). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment, par une nouvelle décision.

Date : 2026-11-10 · Décideur : Tech Lead · Ticket : #1137 · Branche : `claude/1137-c2c-questionnaire-envoi` (la PR est ouverte par le rôle `backend`) · `main` relu : `3b11369` (après #1133, C2b)

Numérotation : `main` va jusqu'à 0175. 0173, 0174 et 0176 sont pris par la PR #1126 (branche `claude/project-thread-rg2usb`, seule PR ouverte) ; aucune branche distante ne porte de fichier `0177-*` (vérifié le 2026-11-10).

Décisions liées : 0007, 0034, 0050 (B3-TL-6), 0051 (points 2 et 6), 0093, 0157 (§ 2.1), 0172 (§ 1 points 2, 3, 4 et 7 ; § 6), 0175 (§ 4).

## Contexte

C2c reçoit l'envoi du questionnaire : validation, limiteur, appel de `public.prevente_enregistrer_reponse` (migration 0029), lecture de son verdict. La spécification demande au compartiment commun `no-trusted-ip` un seuil réglé à part (30 par heure contre 5 par adresse), ce que le limiteur ne sait pas faire : il applique au compartiment commun le seuil d'une adresse (`src/server/config/limites.ts`, en-tête ; `src/server/rate-limit.ts`, boucle d'incrément).

Vérifié sur le code de `3b11369`, pas exécuté : le compartiment commun est atteint dès que `trustedIpKey` rend `null`, c'est-à-dire quand `TRUSTED_IP_HEADER` n'est pas posée (admis en `local` et en `ci` seulement : `rateLimitSettings` refuse ailleurs), **et aussi** quand elle est posée mais que la valeur de l'en-tête est absente ou non analysable. Ce second cas existe donc sur un déploiement.

## 1. T7 : un champ facultatif sur la règle `ip`, lu par le limiteur

1. **Forme retenue.** `RateLimitRule` gagne un champ facultatif :

   ```ts
   export type RateLimitRule = {
     readonly kind: RateLimitKind;
     readonly windowSeconds: number;
     readonly threshold: number;
     /** Seuil du compartiment commun `no-trusted-ip`, à la place de `threshold`. Lu pour l'espèce `ip` seulement. */
     readonly noTrustedIpThreshold?: number;
   };
   ```

2. **Règle du limiteur** (`src/server/rate-limit.ts`, fonction `verdict`) : le seuil appliqué à une clé est `regle.noTrustedIpThreshold` si `regle.kind === "ip"`, que la clé d'adresse est `null` et que le champ est défini ; `regle.threshold` dans tous les autres cas. Le seuil est calculé là où la clé l'est (le tableau `cles` porte `{ cle, regle, seuil }`) et la comparaison devient `compte > seuil`.
3. **Ce qui ne change pas** : le message et la clé (`rl/v1/<action>/<fenêtre>s/no-trusted-ip`), la fenêtre, l'ordre des espèces, l'arrêt à la première clé au-dessus de son seuil, l'événement `rate_limit.no_trusted_ip`, le verdict (`kind: "ip"` pour un refus du compartiment commun), `RateLimitRequest`, `check`, `verdict`, `oublier`, la table `action_rate_limits`, le rôle `vadrouille_limiter`. **Aucune migration.** Une règle sans le champ se comporte exactement comme aujourd'hui : aucune action existante ne change de seuil.
4. **Une clé, un seuil.** Le seuil à part vaut chaque fois que la clé est celle du compartiment commun, variable absente ou valeur illisible : un même compteur n'est jamais comparé à deux seuils. Conséquence sur un déploiement : une requête sans adresse lisible tombe dans un compartiment à 30 par heure, pas à 5. Lecture demandée à la Sécurité (§ 9 point 3).
5. **Garde à l'exécution, échec fermé.** Avant tout incrément, si le seuil effectif d'une règle n'est pas un entier sûr supérieur ou égal à 1 : refus fermé, `rate_limit.failed` avec `errorName: "InvalidRule"`, aucune écriture. Sans cette garde, un seuil `NaN` ne refuserait jamais (`compte > NaN` est faux). Les règles de `main` sont toutes valides : rien ne change pour elles.
6. **Contrôle de la configuration, par test.** Pour toute règle de `RATE_LIMITS` : `noTrustedIpThreshold` n'est présent que sur une règle `ip`, c'est un entier sûr, et il est supérieur ou égal à `threshold` (un compartiment partagé plus étroit qu'une seule adresse n'a pas de sens). Le type reste un seul objet, sans union discriminée : les tests et les appelants qui construisent une règle ne changent pas.
7. **Écarté.**
   - Une seconde action (`questionnaire-prevente-commun`) choisie par l'appelant : l'action serveur devrait lire elle-même l'en-tête de confiance, donc dupliquer `trustedIpKey` et l'environnement hors du limiteur.
   - Une nouvelle espèce de règle : elle changerait l'ordre d'évaluation de 0147 § 6.4 et les clés.
   - Un refus fermé sans adresse lisible, hors `local` et `ci` (modèle de `partage-vue`, 0157 § 2.1) : c'est un choix de sécurité, laissé à la Sécurité (§ 9 point 3). S'il est retenu, il se code dans le cas d'usage du § 3, pas dans le limiteur.
8. **Commentaire d'en-tête de `limites.ts`** : la phrase « Compartiment commun (`no-trusted-ip`) : seuils d'une seule adresse IP de l'action » devient « …, sauf `noTrustedIpThreshold` (décision 0177 § 1) ».

## 2. Règle `questionnaire-prevente`

```ts
// C2c (ticket 1137 ; spécification C2 § 3.4 ; décision 0177 § 1 ; S2, proposition à confirmer par la Sécurité) : …
"questionnaire-prevente": [{ kind: "ip", windowSeconds: 3600, threshold: 5, noTrustedIpThreshold: 30 }],
```

Les valeurs 5 et 30 sont la **proposition de la spécification, en attente de lecture de la Sécurité à la revue de la PR** (§ 9). Elles ne vivent que dans `limites.ts`. Le nom de l'action est exporté par le cas d'usage (`ACTION_LIMITEUR_QUESTIONNAIRE`, modèle d'`ACTION_LIMITEUR_EXPORT`).

## 3. Où vit quoi

| Fichier | Contenu |
|---|---|
| `src/server/actions/prevente-questionnaire.ts` | `"use server"`, **une seule** exportation : `envoyerQuestionnairePrevente(_precedent: PreventeEtatEnvoi, donnees: FormData): Promise<PreventeEtatEnvoi>` (modèle de `saisirCodeAccesP0`). Elle lit `headers()`, appelle le cas d'usage et, sur un envoi accepté, appelle `redirect()` **hors de tout `try`**. Aucune logique. |
| `src/server/prevente/questionnaire.ts` | Cas d'usage `envoyerQuestionnaire(donnees, entetes, dependances?)` : lecture du formulaire, ordre du § 6, dépendances injectables (ouverture, limiteur, écriture, journal) pour les tests. Rend « envoyée » ou un `PreventeEtatEnvoi` de refus. |
| `src/server/prevente/reponses.ts` | Écriture Postgres et lecture du verdict (§ 7), sur le modèle de `visites.ts`. |
| `src/server/prevente/pool.ts` | Le pool propre de la mesure (2 connexions, 2 s), **partagé** par `visites.ts` et `reponses.ts`. Pas de troisième pool (0175 § 4 point 4). `visites.ts` y prend son pool par défaut ; ses tests ne changent pas d'assertion. |
| `src/contracts/prevente-mesure.ts` | Schéma d'envoi, nettoyage de la question 1, prédicat « réponse vide », statuts et types de l'état (§ 4, § 5). |
| `src/config/prevente.ts` | `CHEMIN_QUESTIONNAIRE_PREVENTE = "/precommande/questionnaire"` et `CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI = "/precommande/questionnaire/merci"`. Module neutre, lu par l'action et, en C2d, par `src/features/accueil/routes.ts`. |
| `src/server/config/limites.ts`, `src/server/rate-limit.ts` | § 1 et § 2. |
| `src/server/log.ts`, `src/server/prevente/journal.ts` | § 8. |

1. **Le port `MesurePrevente` ne change pas** et `src/adapters` ne reçoit aucune écriture de réponse. L'action est du code serveur : elle appelle le cas d'usage directement, comme les autres fichiers de `src/server/actions/`. Les disponibilités se lisent par `@/adapters` (`getPrevente`, `questionnairePreventeDisponible`), sans les recopier.
2. **État « Merci » : une adresse à part**, `/precommande/questionnaire/merci`, sans aucun paramètre. Elle hérite des en-têtes de `/precommande/:path*` ; la recharger est un `GET` qui n'écrit rien (critère C9). La page est livrée par C2d ; d'ici là l'adresse répond 404, sans conséquence : aucun lien ne mène au questionnaire avant C2d.
3. **Régime de confinement** (`tests/unit/p0/imports.test.ts`) : si le nouveau fichier d'action demande une ligne, elle est nommée dans la description de la PR, avec sa raison.

## 4. Schéma strict et lecture du formulaire

1. **Champs du formulaire** (noms figés, C2d les pose) : `src`, `parcours`, `destination`, `periode`, `preparation` (répété), `motifs` (répété), `decouverte`.
2. **Du `FormData` à un objet**, dans le cas d'usage, avant le schéma :
   - une clé dont le nom commence par `$ACTION_` est ignorée : ce sont les champs que React ajoute à un formulaire envoyé sans JavaScript. **Lu, non exécuté ici** : un test de C2c envoie une telle clé, et le parcours sans JavaScript de C2f (critère D4) le constate sur l'application construite ;
   - toute autre clé hors de la liste du point 1 : `validation_failed` ;
   - une valeur qui n'est pas une chaîne (fichier) : `validation_failed` ;
   - `src`, `parcours`, `destination`, `periode`, `decouverte` présents plus d'une fois : `validation_failed` ;
   - `src` ou `parcours` absent : `validation_failed` ;
   - `periode` ou `decouverte` absent ou vide : `null` ; `preparation` et `motifs` absents : liste vide ; `destination` absente : `null`.
3. **Question 1**, par `nettoyerDestinationPrevente(brut: string): string | null` (fonction pure de `src/contracts/prevente-mesure.ts`, seule mise en œuvre du § 3.3 point 3) :
   - plus de 1 000 caractères avant nettoyage : `validation_failed`, sans nettoyer (borne de travail) ;
   - les blancs de contrôle (tabulation, sauts de ligne, `U+0085`, `U+2028`, `U+2029`) deviennent une espace ; les autres caractères de contrôle et de mise en forme (`U+0000` à `U+001F`, `U+007F` à `U+009F`, `U+200B` à `U+200F`, `U+202A` à `U+202E`, `U+2060` à `U+2064`, `U+2066` à `U+2069`, `U+FEFF`) sont retirés ; les suites de blancs sont réduites à une espace ; début et fin rognés ; vide : `null` ;
   - la longueur se mesure **après** nettoyage, par `String.length` (unités UTF-16, comme `maxlength`) : plus de 80, `validation_failed`. C'est plus strict que le `char_length` de la base pour les caractères hors du plan de base : jamais l'inverse.
   - Un test prouve que toute valeur rendue passe l'expression du `CHECK` `prevente_reponses_destination_check` (lue dans `db/schema/prevente.ts` par le test, sans la recopier dans le code).
4. **`PreventeEnvoiSchema`** : même union discriminée stricte que `PreventeReponseSchema` (motifs du parcours, listes sans doublon, clé inconnue refusée), avec `src` validé par `PreventeProvenanceDeclareeSchema` (`interne` admis) et **sans** la règle « réponse vide ». Les deux schémas sont construits par une même fabrique du fichier : les champs communs ne sont pas écrits deux fois. `PreventeReponseSchema` garde son comportement.
5. **Réponse vide** : prédicat exporté `preventeReponseVide(reponse)`, seule définition, utilisé par la règle de `PreventeReponseSchema` et par le cas d'usage, qui rend alors `reponse_vide` (distinct de `validation_failed`, pour le message de C2-PO-10). Il vaut aussi pour `src=interne` (même parcours visible).
6. `parseInput` n'est pas utilisé : l'action ne rend pas un `Result` et ne rend aucun `field`.

## 5. État rendu et codes

```ts
export const PREVENTE_STATUTS_ENVOI = ["attente", "validation_failed", "reponse_vide", "rate_limited", "provider_error", "indisponible"] as const;
export type PreventeSaisie = { destination: string | null; periode: … | null; preparation: …[]; motifs: string[]; decouverte: … | null };
export type PreventeEtatEnvoi = { readonly statut: (typeof PREVENTE_STATUTS_ENVOI)[number]; readonly saisie: PreventeSaisie | null };
```

| Statut | Quand | `saisie` | Texte (C2d) |
|---|---|---|---|
| `attente` | état initial du formulaire | `null` | aucun |
| `validation_failed` | § 4 points 2 à 4 | `null` | à fixer : § 10 point 3 |
| `reponse_vide` | § 4 point 5 | `null` | « Réponds à au moins une question. » |
| `rate_limited` | refus du limiteur, limiteur indisponible, verdict `plafond_atteint` | réponses validées | « Trop d'envois pour le moment. Réessaie plus tard. » |
| `provider_error` | l'écriture lève, ou verdict illisible | réponses validées | « Tes réponses n'ont pas pu être enregistrées. Réessaie dans un instant. » |
| `indisponible` | précommande fermée ou questionnaire indisponible à l'envoi | `null` | « Le questionnaire n'est pas encore ouvert. » |

1. **Aucun code n'est ajouté à `API_ERROR_CODES`** : la liste des statuts est propre à ce formulaire, comme `EtatSaisieCodeP0`. `validation_failed`, `rate_limited` et `provider_error` reprennent les noms existants ; les critères C2, C6, C7 et C11 se lisent sur `statut`.
2. **`saisie`** ne porte que les réponses (destination nettoyée comprise), jamais `src` ni `parcours` : la page les relit dans son adresse et repose les champs cachés (§ 3.2 point 6 de la spécification). Elle n'est rendue qu'à la personne qui vient d'envoyer, n'est jamais journalisée, et n'existe que pour des valeurs déjà validées.
3. **Envoi accepté** (verdict `admise`, ou `src=interne`) : l'action ne rend pas d'état, elle appelle `redirect(CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI)`. Next.js répond 303 à une redirection lancée par une action serveur : **non exécuté ici** ; le test de C2c prouve l'appel et sa cible, C2f relève le code 303 sur l'application construite (C9).
4. L'état ne dit jamais lequel du limiteur ou du plafond a refusé, ni pourquoi l'écriture a échoué.

## 6. Ordre du cas d'usage

1. `getPrevente() === null` ou `questionnairePreventeDisponible()` faux : `indisponible`. Rien n'est lu, compté ni journalisé.
2. Lecture du formulaire et schéma (§ 4) : `validation_failed` ou `reponse_vide`. Le limiteur n'est pas appelé : un envoi refusé ici ne consomme rien.
3. Limiteur : `checkRateLimit({ action: ACTION_LIMITEUR_QUESTIONNAIRE, headers })`. Refus ou indisponibilité : `rate_limited`.
4. `src=interne` : accepté, **sans** appel de l'écriture (il a consommé le limiteur, pas le plafond).
5. Écriture (§ 7) : `admise`, accepté ; `plafond_atteint`, `rate_limited` ; toute erreur, `provider_error`.

Aucune erreur ne remonte de l'action, hors la redirection : aucune réponse 500 (C8). L'adresse IP n'est lue que par le limiteur ; le cas d'usage n'importe pas `src/server/ip.ts`.

## 7. Écriture et lecture du verdict

1. **Une seule requête, texte constant**, exportée pour le test : `SELECT public.prevente_enregistrer_reponse($1::text, $2::text, $3::text, $4::text, $5::text[], $6::text[], $7::text) AS verdict`. **Sept arguments, jamais `p_plafond`** (0172 § 1 point 3). Aucune requête du code ne nomme `prevente_reponses` ni `prevente_reponses_jour` ; l'application ne compte jamais les réponses du jour (C7).
2. La réponse est revalidée par `PreventeReponseSchema` avant l'appel (jamais `interne`, jamais vide), comme `visites.ts` revalide la provenance.
3. **Verdict** : la colonne `verdict` de la première ligne, validée par `PreventeVerdictReponseSchema`. Ligne absente ou autre valeur : une erreur sans valeur (`VerdictPreventeIllisibleError`), donc `provider_error`.
4. **Toute erreur de la base** donne `provider_error`, y compris `42883` (migration absente, 0175 § 4 point 6) et une violation de contrainte (`23514`, `23502`) : après le schéma, c'est un écart entre le contrat et la base, pas une faute de la personne.
5. **Limite acceptée** : le délai de 2 s coupe l'attente, pas la transaction. Une réponse peut être écrite alors que la personne lit « n'ont pas pu être enregistrées » ; si elle renvoie, deux lignes existent. Pas de dédoublonnage (spécification § 3.3 point 8).

## 8. Journal

Deux événements ajoutés à la liste fermée de `src/server/log.ts`, écrits par `src/server/prevente/journal.ts` :
- `prevente.reponse_perdue` (`warn`) : l'écriture a levé ; champ `errorName` seul ;
- `prevente.plafond_atteint` (`warn`) : aucun champ.

Jamais : le message ou le détail d'une erreur de la fonction d'écriture (0172 § 6), la provenance, le parcours, une réponse, le texte de la question 1, une adresse IP, un en-tête (C10). `validation_failed`, `reponse_vide` et `indisponible` n'écrivent rien.

## 9. Sécurité : ce qui est proposé, ce qui reste posé

Rien ici n'est un verdict du Tech Lead sur la sécurité. La Sécurité n'a pas été consultée pour écrire cette décision. **S2 est en attente de sa lecture, à la revue de la PR de C2c** ; le rôle `backend` code les propositions, et un seuil changé par la Sécurité se corrige dans `limites.ts` seul.

1. **Seuils proposés par la spécification, non tranchés** : 5 envois par heure et par adresse ; 30 par heure pour le compartiment commun ; 200 réponses par jour UTC, tenu par la base (l'application ne passe pas `p_plafond` ; le baisser se fait depuis `limites.ts`, le monter demande une migration : 0172 § 1 point 3).
2. **Champ piège ou contrôle d'origine** : non codés par C2c tant que la Sécurité ne les demande pas. Fait à connaître : Next.js compare `Origin` à l'hôte pour toute action serveur (`serverActions.allowedOrigins`, non réglé dans `next.config.ts`) ; **lu dans la documentation, non exécuté ici**. Si un champ piège est demandé, sa forme est : une clé de plus dans la liste du § 4 point 1, admise vide seulement ; remplie, l'envoi suit le chemin de `interne` (limiteur, « Merci », aucune écriture, aucun journal qui le distingue). Son nom et son rendu accessible reviennent à C2d et à l'UX/UI.
3. **Compartiment commun sur un déploiement** (§ 1 point 4) : garder 30 par heure pour une requête sans adresse lisible, ou refuser fermé hors `local` et `ci` comme `partage-vue`. Derrière Vercel l'en-tête est posé par la plateforme : le cas ne se présente pas pour une personne.
4. **`saisie` rendue au navigateur** (§ 5 point 2) et **redirection sans paramètre** (§ 3 point 2) : à lire.

## 10. Ce qui revient à d'autres (non tranché ici)

1. **Samuel** : durée de conservation des réponses et texte d'information (question 3 de la spécification, Q27, Q127) ; base en production (question 1). Inchangées. Elles ne bloquent pas le code de C2c, qui fusionne éteint ; elles bloquent l'ouverture du questionnaire.
2. **Product Owner** : la décision du § 4 point 3 mesure les 80 caractères après nettoyage ; C2-PO-9 ne le précisait pas. À confirmer ou à corriger à la revue ; ne bloque pas.
3. **UX/UI (U1), pour C2d** : aucun texte n'existe pour `validation_failed` (formulaire modifié à la main, ou texte trop long sans `maxlength`). C2c rend le statut ; le texte est à fixer avant C2d. Ne bloque pas C2c.
4. **Tech Lead, avant C2d et C2f** : comment obtenir sur l'application construite les états « refus du limiteur » et « échec de l'écriture » pour axe et les captures (D7, D10), la mise en œuvre en mémoire n'étant branchée que par un test (0175 § 4 point 5). À décider avec la tâche C2d ; ne bloque pas C2c.

## 11. Tests attendus

Aucun test n'est désactivé ni supprimé.

**Limiteur**
- `tests/unit/server/limiteur.test.ts`, règle d'essai `{ kind: "ip", windowSeconds: 600, threshold: 2, noTrustedIpThreshold: 4 }` : sans en-tête de confiance, quatre appels admis et le cinquième refusé, verdict `{ ok: false, kind: "ip" }`, une seule clé écrite, celle de `no-trusted-ip` ; en-tête configuré et valeur non analysable : même seuil de 4 ; adresse lisible : troisième appel refusé, le champ n'est pas lu ; champ posé sur une règle `email` : ignoré ; seuil effectif `NaN`, `0` ou non entier : refus fermé `InvalidRule`, aucun incrément.
- Bloc « limiteur: configuration » : `questionnaire-prevente` vaut exactement la règle du § 2 ; contrôle du § 1 point 6 sur tout `RATE_LIMITS`.
- `tests/db/limiteur.test.ts` : sur la base, 10 appels concurrents du compartiment commun avec un seuil à part de 4 admettent 4 appels, jamais plus.

**Contrats** (`src/contracts`) : table de cas de `nettoyerDestinationPrevente` (`"  Lisbonne \n"` donne `Lisbonne` ; blancs seuls donnent `null` ; saut de ligne interne devient une espace ; 80 admis, 81 refusé ; test du `CHECK`, § 4 point 3) ; `PreventeEnvoiSchema` (code hors liste, clé inconnue, motifs de l'autre parcours, doublon, `interne` admis) ; `preventeReponseVide`.

**Cas d'usage et action** (dépendances injectées, base absente), un test nommé par critère :
- C1, C11 : envoi valide, l'écriture reçoit provenance, parcours et codes des champs cachés, sans `Referer` ni paramètre d'adresse lus ;
- C2, C11 : chaque refus du § 4 donne `validation_failed`, l'écriture **et le limiteur** ne sont pas appelés ; clé `$ACTION_ID_x` ignorée ;
- C3 : la valeur passée à l'écriture ; C4 : `reponse_vide`, rien d'appelé ;
- C5 : `interne`, limiteur appelé, écriture non appelée, redirection ;
- C6 : limiteur qui refuse, puis limiteur qui échoue fermé : `rate_limited`, `saisie` rendue, écriture non appelée. La partie « sixième admis, trente et unième refusé sans en-tête de confiance » est portée par le limiteur réel sur la base de test (`tests/db/`), avec la règle de `RATE_LIMITS` ;
- C7 : verdict `plafond_atteint`, `rate_limited` ; test de forme : le module d'écriture ne contient que la requête du § 7 point 1 ;
- C8 : écriture qui lève (erreur quelconque, `42883`, `23514`, verdict illisible) : `provider_error`, `saisie` rendue, rien ne remonte ;
- C9 : `redirect` appelé avec `CHEMIN_QUESTIONNAIRE_PREVENTE_MERCI`, hors de tout `try` (une redirection avalée ferait échouer le test) ;
- C10 : journal capturé sur tous les cas ci-dessus : ni le texte de la question 1, ni l'adresse, ni un en-tête ;
- ordre du § 6 : précommande fermée ou questionnaire indisponible, rien d'appelé.

**Base** (`tests/db/`) : avec le rôle `vadrouille_app`, un envoi valide par le module d'écriture donne une ligne aux codes attendus (C1) ; verdict `plafond_atteint` lu sur la vraie fonction (plafond de test passé **par le test**, jamais par le code).

**Journal** : les deux événements dans le test « la liste des événements est fermée » et leurs champs admis.

## Conséquences

- **Dans la PR de C2c** : la présente décision ; le code des § 1 à § 8 ; les tests du § 11 ; la mention « à confirmer par la Sécurité (S2) » sur la règle de `limites.ts`, remplacée par le verdict une fois rendu.
- La spécification n'est pas amendée : rien ici ne contredit ses critères. Le § 4 point 3 précise C2-PO-9 (§ 10 point 2).
- **Tâches suivantes** : C2d (champs du § 4 point 1, statuts du § 5, adresse « Merci », texte de `validation_failed`) ; C2f (303 réel, envoi sans JavaScript, § 10 point 4).
- **Non tranché ici** : T6 (production).

## Quand revoir

Au verdict de la Sécurité sur S2 ; si C2f constate que React n'ajoute pas les champs `$ACTION_` ou que la redirection n'est pas un 303 ; à toute montée de version de Next.js ou de React qui change les actions serveur ; si une seconde action demande un seuil à part pour le compartiment commun (la forme du § 1 la sert sans changement) ; avant toute base en production (T6, 0034).
