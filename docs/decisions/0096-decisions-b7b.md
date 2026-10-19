# 0096 — Préalables de B7b : lecteur de pages (B7-TL-5), port de traces (B7-TL-7), configuration de production (B7-TL-8) et renvois de 0080 § 7

Statut : décision déléguée (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio ». Samuel peut la remettre en cause à tout moment par une nouvelle décision. **Exception, § 4.1** (`Routage.zdr` de l'étape `structuration`) : proposition du Tech Lead, à trancher **avec le Product Owner** (0080 § 7) ; elle ne devient définitive qu'avec l'accord écrit du Product Owner (question 1).

Date : 2026-10-19 · Décideur : Tech Lead (§ 4.1 : Tech Lead avec le Product Owner) · Ticket : #524 (B7b) · Spécification : `specs/B7-couche-ia-recherche.md` (#288, fusionnée), propositions B7-TL-5, TL-7 et TL-8, section « B7b » et critères « B7b » · Découpage : 0054 § 2 (prérequis de B7b : B7a, B7-TL-4, TL-5, TL-7, TL-8) · Décisions liées : 0053 et son amendement 1, 0055 § 7 et A1, 0077, 0080, 0083, 0094 (PR #516, ouverte)

Numérotation (relue le 2026-10-19 sur `main` `71ed66e`) : `main` porte 0001 à 0093 et 0095 ; 0094 est portée par la PR ouverte #516. 0096 est le premier numéro libre.

**Amende** le **handover back-end § 12**, puce « Lecture de pages » (§ 1 ci-dessous) ; la phrase est corrigée dans cette PR. Aucune autre décision n'est amendée : le port de traces est la dépendance facultative `traces?` déjà prévue par 0077 § 2 point 2, sans changer de signature de B7a.

Cette PR ne touche que des documents. Rien ici n'engage d'argent, de compte externe ni de donnée personnelle hors UE : aucun montant, aucun modèle plus cher, aucun nouveau fournisseur, aucun nouveau flux de données. Les montants et plafonds restent ceux de Samuel (0053 et son amendement 1, Q39, Q45, Q465) ; les choix de Samuel de 0053 sont repris tels qu'ils sont écrits (§ 3 point 6).

## Contexte

Le ticket de B7b (#524) est ouvert. 0054 § 2 et la spécification exigent les décisions du Tech Lead sur B7-TL-4, TL-5, TL-7 et TL-8 « avant le code de la sous-tâche concernée ». 0080 § 7 confie de plus à B7b trois points de la revue de B7a (#424).

Recherche faite avant d'écrire (`docs/decisions/`, spécification B7, revue consolidée de #424, code de `main`) :

| Point | Déjà tranché ? | Référence |
|---|---|---|
| B7-TL-4 (client réel de recherche web) | **Oui**. P0r3 l'a écrit, B7b le reprend tel quel. | 0055 § 7, amendé par 0077 § 1 point 4 ; flux vers Exa : 0055 A1 (Q427, Samuel) ; code : `rechercherWeb` de `src/ai/openrouter-client.ts`, `src/ai/recherche-web-reelle.ts` |
| B7-TL-5, TL-7, TL-8 | **Non**. Propositions de la spécification (l. 253, 255, 256) ; aucune décision ne les nomme hors 0054 (prérequis), 0077 § 2 point 2 (`traces?`) et le commentaire de `src/server/config/usage.ts` (module distinct de `ia.ts`). | Tranchées ici, § 1 à § 3 |
| `Routage.zdr` pour `structuration` | **Non**. Renvoyé à B7b, « Tech Lead et PO ». | 0080 § 7 ; mineur 5 de la revue consolidée de #424 ; tranché ici, § 4.1 |
| Schéma de lieu aligné sur le contrat | **Non**. Renvoyé à B7b ou B9. | 0080 § 7 ; mineur 11 de la revue de #424 ; tranché ici, § 4.2 |
| `SourceWebFournisseur` | **Non**. Renvoyé à B7b. | 0080 § 7 ; mineur 13 de la revue de #424 ; tranché ici, § 4.3 |

État de `main` relu pour B7b (`71ed66e`) :
- **Lecteur de pages** (`src/research/fetch-page.ts`) : `https` et port 443 seulement (`PORT_HTTPS`, refus `scheme` et `port`) ; types admis `text/html` et `text/plain` (l. 269), en-tête `accept: "text/html, text/plain"` (l. 103) ; le texte HTML passe par `extraireTexte` (`parse5`, seule admission de 0080 point 5). Le handover § 12 admet aussi `http`, le port 80 et `application/xhtml+xml`, et dit « d'abord l'outil du fournisseur de modèle ».
- **Recherche web du fournisseur** : `rechercherWeb` n'utilise que les citations de la réponse (`resultat.sources` : adresse, titre, `providerMetadata.openrouter.content`) et ignore le texte du modèle ; `recherche-web-reelle.ts` garde les adresses `https:` seulement, bornées par `LONGUEURS_RESULTAT` ; `MAX_RESULTATS_WEB` = 10 (`src/ai/client.ts` l. 59), seule valeur passée par `p0Run`.
- **Traces** : aucune. La télémétrie de l'AI SDK est coupée (`experimental_telemetry: { isEnabled: false }`, test de P0r1 `openrouter-client.test.ts` l. 320). `ReponseModele` porte `texte`, `coutUsd` et `fin`, pas de tokens. Aucune dépendance OpenTelemetry.
- **Configuration** : `src/server/config/ia.ts` n'existe pas. `src/ai/couche.ts` déclare `ReglagesIa` (`structuration`, `quartier`, `plan`, `notation`, `raisons` ; `ReglageEtape = { modele, routage }`) ; `src/research/bornes.ts` déclare `BornesRechercheSchema` (cibles à 0 admises, au moins une non nulle, somme au plus le total, `delaiMs` facultatif) sans valeur de profil ; les plafonds sont dans `src/server/config/usage.ts` (B7c, 0083 ; `PLAFONDS_USAGE` = `null` tant que Samuel n'a pas fixé les montants). P0 lit `prototype/config/modeles.json` (variante B : `deepseek/deepseek-v4.1-flash` pour `recherche`, `notation` et `raisons` ; variante A : notation seulement ; `routage.data_collection: "deny"` ; moteur `exa`) et `prototype/config/recherche.json` (cibles 18, 14, 4 ; total 40 ; lot de notation 10 ; 6 tours ; sources de 1 095 jours au plus), par `scripts/p0` et par `src/workflows/p0-run.ts`.
- **Routage** : `Routage = { data_collection: "deny"; zdr?: boolean }` (`src/ai/reglages.ts`) ; `zdr` n'est transmis à OpenRouter que s'il est posé (`openrouter-client.ts` l. 227, test l. 165). Aucune étape ne le pose aujourd'hui.
- **Entrées** : `src/ai/entrees.ts` valide `destination`, `pays` et `ville` par `texteMaison` (refus de toute catégorie Unicode C, de `<`, `>` et des formes d'URL ou de domaine) ; le contrat (`src/contracts/creation.ts` l. 38) n'exige que `z.string().trim()` borné par `DESTINATION_LENGTH` ou `CITY_NAME_LENGTH` (2 à 80). `encadrer` (`src/ai/requetes.ts` l. 33) sérialise les données en JSON et échappe `<` et `>`.
- **`SourceWebFournisseur`** (`src/ai/client.ts`) : même forme que `ResultatWeb` (`src/ai/recherche-web.ts`), égalité verrouillée par `recherche-web-reelle.test.ts` l. 99.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie ».** Respecté : rien ici ne donne de client Google à `src/ai` ou `src/research`, ni de client de modèle à `src/grounding` ou `src/domain`. Le lecteur de pages reste la seule lecture du web par notre code (§ 1) ; la configuration n'est lue que par la composition (§ 3) ; les traces ne portent aucune donnée, Google ou autre (§ 2).

## Décision

### 1. B7-TL-5 — Lecteur de pages : écarts avec le handover § 12

Les trois propositions de la spécification sont **retenues** :

1. **Aucune lecture de page par un outil du fournisseur de modèle.** Seul le lecteur de `src/research` (`fetch-page.ts`, transport `undici-transport.ts`) lit une page. Raisons : garder le contrôle « URL présente dans les résultats de l'exécution » (`not_in_search_results`), la relecture de la date d'un événement par notre code (`dateMentionnee`, R2, B7-PO-7) et le cadre de données sur un texte que nous avons borné nous-mêmes.
   - De la recherche web du fournisseur (`rechercherWeb`, greffon `web`), seules les **citations** sont lues : adresse, titre et extrait, bornés (`LONGUEURS_RESULTAT`), comme données. Le texte du modèle reste ignoré (B7-TL-4, inchangé).
   - Un extrait de résultat n'est **jamais** une lecture de page : `dateConfirmee` ne vient que du texte relu par notre lecteur, et une durée ou un prix « lus sur la source » (B7-PO-11) viennent de la page relue, pas de l'extrait.
   - Aucune requête au fournisseur ne porte d'outil (`tools`) ni d'autre greffon que `web` : l'enveloppe de `openrouter-client.ts` les refuse déjà (`invalid_request`), sans changement.
2. **`https` et port 443 seulement** (plus strict que « `http` et `https`, ports 80 et 443 ») : garde de P0, inchangée. `http:` est refusé (`scheme`), y compris à une redirection ; tout port explicite autre que 443, 80 compris, est refusé (`port`). Les sources d'un candidat sont déjà en `https:` seulement (contrat, `CHECK` en base) : une page `http:` ne pourrait pas servir de source.
3. **`application/xhtml+xml` ajouté aux types admis, lu comme `text/html`** (par `extraireTexte`). La liste reste une **constante** du module (`text/html`, `application/xhtml+xml`, `text/plain`), jamais une valeur de configuration (A3.1 de 0032 : une garde ne s'assouplit pas par configuration). L'en-tête `accept` devient `text/html, application/xhtml+xml, text/plain`. Tout autre type reste refusé (`content_type`), en particulier `application/xml`, `text/xml`, `image/svg+xml` et `application/json`. Le type est lu comme aujourd'hui : avant le premier `;`, sans espaces, en minuscules.

**Tests** (B7b, sous les deux noms du handover § 12 et du critère « B7b ») :
- `recherche: le lecteur de pages refuse les formes d'adresse alternatives, les ports non standard et les réponses trop grosses après décompression` : `http://` refusé (`scheme`) ; `https://hote:80/`, `https://hote:8443/` refusés (`port`) ; redirection vers `http://` ou vers le port 80 refusée ; `application/xhtml+xml` (avec et sans `; charset=utf-8`, en majuscules comprises) admis et lu comme du HTML (balises retirées, texte identique à celui de la même page servie en `text/html`) ; `application/xml`, `text/xml`, `image/svg+xml`, `application/json` refusés ; en-tête `accept` envoyé égal à la constante.
- `recherche: le lecteur de pages refuse les adresses internes` : inchangé.
- Les tests existants de `fetch-page.test.ts` et `ip-guard.test.ts` sont **regroupés** sous ces deux noms, sans en retirer aucun cas.

**Amendement du handover back-end § 12** (fait dans cette PR) : la puce « Lecture de pages » dit désormais « seulement le lecteur de `src/research` », « `https` seulement, port 443 seulement » et « `application/xhtml+xml` (lu comme `text/html`) ».

**Sécurité** : `fetch-page.ts` n'est pas un module de capacité (`undici-transport.ts` l'est, et ne change pas). L'ajout d'un type de contenu est un assouplissement limité : il est relu par la Sécurité dans la PR de B7b, qui a la Sécurité en revue (spécification, tableau « Découpage »).

### 2. B7-TL-7 — Port de traces sans OpenTelemetry

Proposition de la spécification **retenue**, avec la liste fermée suivante.

1. **Module** : `src/ai/traces.ts`, `import "server-only"`, ou l'exception nominative de `ligne/require-server-only` si `pnpm p0` en charge une valeur (règle de B7a, point 6). Il n'importe que `@/ai/*` et `zod`. Aucune dépendance nouvelle ; aucune dépendance OpenTelemetry dans B7.
2. **Port** :
   ```ts
   export interface TracesIa {
     debutEtape(debut: DebutEtape): JetonEtape;
     finEtape(jeton: JetonEtape, fin: FinEtape): void;
   }
   ```
   `JetonEtape` est un objet opaque rendu par le port. Les deux méthodes sont synchrones et ne rendent rien d'autre.
3. **Liste fermée des attributs** (`ATTRIBUTS_TRACE`, constante `as const` ; aucun autre attribut ne peut être exporté) :

   | Attribut | Valeur admise | Posé par |
   |---|---|---|
   | `executionId` | identifiant interne opaque (`generationRunId`, `^[A-Za-z0-9_-]{1,64}$`) ; jamais un identifiant d'organisation, de voyage, de personne ni de lieu | l'adaptateur de B9, qui connaît l'exécution ; jamais `src/ai` ni `src/research` |
   | `etape` | `ETAPES_TRACE` = `ETAPES_REQUETE` (`plan`, `recherche`, `notation`, `raisons`, `structuration`, `quartier`) et `recherche_web` | décorateur |
   | `modele` | identifiant OpenRouter conforme à `MODELE_ID_PATTERN`, 100 caractères au plus | décorateur, depuis la requête |
   | `promptId`, `promptVersion` | identifiant de la liste fermée des prompts de `src/ai/prompts/` ; entier de 1 à 999 | décorateur, depuis la requête |
   | `dureeMs` | entier de 0 à 1 800 000, mesuré par l'horloge injectée | décorateur |
   | `tokensEntree`, `tokensSortie` | entiers de 0 à 10 000 000, **facultatifs** | décorateur, depuis la réponse (point 6) |
   | `coutMicros` | entier de 0 à 1 000 000 000 (coût rendu par le fournisseur, ou estimé à défaut) | décorateur, depuis la réponse |
   | `statut` | `ok`, un code de `CODES_ERREUR_IA`, ou `erreur_inattendue` | décorateur |

   **Jamais** : un texte de prompt, de message, de réponse, de requête web ou de page ; une adresse, un nom d'hôte, un titre ou un extrait ; un nom de lieu, une destination, une date du voyage ; un compte de candidats trouvés, refusés, ancrés ou notés ; un nombre de requêtes Google par étape (même réserve que B7-TL-9, S4) ; un compte de pages lues (il va dans `BilanRecherche.pagesRead`, écrit par B9 dans `research_runs`). Aucun attribut n'est une chaîne libre : chaque chaîne vient d'une liste fermée ou d'un motif, chaque nombre est un entier borné.
4. **Décorateurs, une seule voie** : `tracerModeles(client: ClientModeles, traces: TracesIa, horloge)` et `tracerRechercheWeb(client: ClientRechercheWeb, traces, reglage, horloge)`, dans `src/ai/traces.ts`. Le premier lit `etape`, `modele` et `prompt` de la `RequeteModele`, jamais `messages` ; le second ne lit de la requête que sa présence (la requête web n'est jamais tracée) et prend `modele` du réglage. `creerCoucheIa({ modeles, reglages, traces? })` (0077 § 2 point 2) et `creerRecherche({ …, traces? })` appliquent ces décorateurs à leurs clients quand `traces` est fourni ; sans `traces`, aucun décorateur, et le comportement est celui de B7a (`pnpm p0` inchangé). Une étape tracée = un appel de modèle ou un appel de recherche web ; la lecture de pages n'est pas tracée.
5. **Les traces ne cassent jamais une étape.** Les attributs sont validés par un `z.strictObject` avant l'appel au port ; un attribut invalide fait **abandonner la trace**, jamais l'étape. Toute exception du port (`debutEtape`, `finEtape`) est absorbée par le décorateur, sans changer le résultat, le coût ni le code rendu. `finEtape` est appelé dans un `finally` ; une exception inattendue du client est tracée `erreur_inattendue` puis **propagée** (0077 § 2 point 1). Le code d'erreur fermé passe ; jamais le message ni la pile.
6. **Tokens** : B7b ajoute à `ReponseModele` un champ facultatif `tokens?: { entree: number; sortie: number }`, lu dans `resultat.usage` de l'AI SDK (`inputTokens`, `outputTokens`, entiers seulement, absents s'ils ne sont pas des entiers positifs ou nuls). C'est un **changement du module de capacité** `openrouter-client.ts`. B7b le liste comme écart, rejoue les tests de P0r1 sur ce module, et le soumet au verdict de la Sécurité dans sa PR (0055 § 7 point 2). Le double sur fixtures n'en rend pas ; les attributs de tokens sont alors absents. Si la Sécurité refuse ce changement, les tokens restent absents, sans autre effet.
7. **Implémentation par défaut** : aucune exportation (absence de `traces`). Pour les tests, un exportateur simulé (`tests/support/`, ou dans le fichier de test) garde les attributs reçus en mémoire.
8. **Branchement** : B9 écrit, **hors de `src/ai`** (sous `src/server`), l'adaptateur `TracesIa` vers l'API OpenTelemetry quand le Workflow SDK l'apporte ; il pose `executionId` ; l'exportateur reste désactivé tant que Samuel n'a pas retenu de service en région UE (Q28, handover § 13). L'adaptateur ne peut ajouter que les attributs de la liste du point 3, plus les identifiants techniques propres à OpenTelemetry (identifiants de trace et d'intervalle, nom de l'intervalle = `etape`).
9. **Test** `traces: aucun prompt ni brief dans les attributs exportés` (handover § 13, critère « B7b ») : avec l'exportateur simulé, une exécution de chacune des six étapes et d'une recherche web, avec un récit, un brief, des requêtes et des pages à valeurs sentinelles, n'exporte que des clés de `ATTRIBUTS_TRACE` ; aucune sentinelle ni texte de prompt dans les valeurs exportées (parcours de toutes les valeurs, pas seulement des clés) ; un port qui lève à chaque appel ne change ni le résultat ni le coût d'une étape ; un attribut hors liste (forcé par un double) abandonne la trace sans faire échouer l'étape ; le test de P0r1 sur la télémétrie coupée de l'AI SDK reste vert. Plus un test de type : les clés de `DebutEtape` et `FinEtape` réunies sont exactement `ATTRIBUTS_TRACE` sans `executionId` (`expectTypeOf`).
10. **Sécurité** : verdict sur la liste du point 3 et sur le point 6 (question 9 de la spécification, pour B7-TL-7) demandé dans la revue de cette PR ; à défaut, dans la PR de B7b, dont il bloque la fusion (question 2).

### 3. B7-TL-8 — Configuration de production

Proposition de la spécification **retenue**, sur le modèle de `moteur.ts` et de B5-TL-4 (0045 § 4) : une seule source par valeur, à tout moment.

1. **Fichiers** :
   - `src/server/config/ia.json` : les **seules** valeurs propres à la production (point 3) ;
   - `src/server/config/ia.ts` (`import "server-only"`) : schéma strict, chargement et validation au chargement du module, export de `CONFIGURATION_IA` et d'une fonction pure `chargerConfigurationIa(production, modeles, recherche)` pour les tests. Une valeur absente, inconnue ou hors bornes fait échouer le chargement. `src/ai` et `src/research` ne l'importent jamais ; seule la composition le lit (B9c, `src/server/composition/`) et passe les valeurs à `creerCoucheIa` et `creerRecherche`. B7b n'ajoute aucun importateur (aucun point d'entrée).
   - **`ia.ts` n'importe que `zod` et ses fichiers JSON** : ni `@/ai`, ni `@/research`, pas même en type. Raison : 0081 B9-TL-1 point 2 n'admet un chemin de l'application vers `src/ai/` ou `src/research/` que par `src/server/composition/generation.ts` (cas refusé : `src/server/x.ts` → `@/research/agent`), et les arêtes `import type` comptent (0077 § 3 point 1). Son schéma ne contrôle donc que la **forme** : clés exactes (`z.strictObject`), entiers positifs ou nuls bornés, chaînes bornées, `routage.data_collection` égal au littéral `"deny"` (refus de toute autre valeur, critère « Configuration »), `variante` parmi `a`, `b`.
   - **Règles de fond, une seule définition** : les bornes des profils restent celles de `BornesRechercheSchema` (`src/research/bornes.ts` : au moins une cible non nulle, somme au plus le total…), l'identifiant de modèle celui de `MODELE_ID_PATTERN` et le moteur celui de `MOTEURS_RECHERCHE_WEB` (`src/ai/reglages.ts`). Aucune n'est recopiée dans `ia.ts`. Elles sont appliquées à `CONFIGURATION_IA` par la composition de B9c (`generation.ts`, au chargement du module, échec au démarrage) et, dès B7b, par les tests de la configuration (sous `tests/unit/`, qui peuvent importer les deux côtés : point 9). La concordance des types est vérifiée par `expectTypeOf` dans ces tests : `reglages` de `CONFIGURATION_IA` assignable à `ReglagesIa`, profils `apercu` et `complet` à `BornesRecherche`, `rechercheWeb` à `ReglageRechercheWeb`.
   - **Place** : 0081 B9-TL-1 point 1 range « plafonds et profils » dans `src/server/config/generation.ts`. Les plafonds de forfait des profils sont dans `usage.ts` (0083) ; les **bornes de recherche** des profils vont dans `ia.ts`, et pas dans `generation.ts` (aucune seconde place).
2. **Valeurs dérivées des fichiers de P0, tant que P0 tourne.** `ia.ts` importe `prototype/config/modeles.json` et `prototype/config/recherche.json` comme données JSON (pas un module de `src/prototype`, qui reste interdit à l'application, 0048 § 1) et en tire :

   | Valeur de production | Source unique |
   |---|---|
   | modèle de `plan`, `recherche`, `structuration`, `quartier` et de la recherche web | `modeles.json`, `etapes.recherche` (B7-TL-8 : `structuration` et `quartier` sur le modèle de recherche ; P0 : le plan utilise le modèle `recherche`) |
   | modèle de `raisons` | `modeles.json`, `etapes.raisons` |
   | modèle de `notation`, variante B ; variante A | `modeles.json`, `etapes.notation` ; `variantes.a.notation` |
   | `routage.data_collection` de toutes les étapes | `modeles.json`, `routage` |
   | moteur du greffon `web` | `modeles.json`, `rechercheWeb.moteur` |
   | nombre de résultats par recherche web | `MAX_RESULTATS_WEB` (`src/ai/client.ts`), comme `p0Run` ; aucune valeur dans `ia.json` |
   | profil `complet` : `ciblesParCreneau`, `totalCandidats`, `toursMax` | `recherche.json` (B7-PO-5 : « valeurs de P0 ») |
   | `ageSourceMaxJours` des trois profils | `recherche.json` (une valeur, posée dans chaque profil par le chargement, jamais recopiée dans `ia.json`) |
   | taille d'un lot de notation (lue par B9) | `recherche.json`, `tailleLotNotation` |

   Les fichiers du profil d'essai de P0 (`recherche-essai.json`, `essai.json`, `mode-reel.json`, `plafonds.json`) ne sont **pas** lus par la production.
3. **Valeurs propres à la production** (`ia.json`, `schema: 1`) :
   - `variante` : `"b"` (B7-PO-4 : variante B par défaut ; A par configuration) ;
   - `zdr` : réglage `zdr` par étape, clés facultatives parmi `ETAPES_REQUETE` ; valeur de départ `{ "structuration": true }` (§ 4.1). Une étape absente n'envoie pas `zdr` (comportement actuel) ;
   - `profils.apercu` : `ciblesParCreneau` `{ activity: 8, meal: 8, evening: 2 }`, `totalCandidats` 18, `toursMax` 3, `delaiMs` 30 000 (B7-PO-5, valeurs de départ du Product Owner) ;
   - `profils.complet` : `delaiMs` 300 000 (5 min), les autres valeurs venant du point 2 ;
   - `profils.mini` : `cible` 6 (sur le type de créneau demandé, 0 sur les deux autres), `totalCandidats` 6, `toursMax` 2, `delaiMs` 20 000 ; `logements` : `cible` 3, `recherchesWeb` 2 (recherche de logements de `suggererQuartier`, « tours » lus « recherches web posées par le code »).
4. **`src/research/bornes.ts`** reste un module de types et de schéma, **sans valeur** : B7b y ajoute `PROFILS_RECHERCHE = ["apercu", "complet", "mini"]` et une fonction pure `bornesMini(profil, creneau)` qui rend les `BornesRecherche` du profil `mini` pour un type de créneau (6 sur ce créneau, 0 sur les autres). Le profil `apercu` y entre donc par la configuration : `{ ciblesParCreneau: { activity: 8, meal: 8, evening: 2 }, totalCandidats: 18, toursMax: 3, ageSourceMaxJours: 1095, delaiMs: 30000 }` une fois chargé, qui passe `BornesRechercheSchema` (somme des cibles égale au total).
5. **Sortie du chargement** (`CONFIGURATION_IA`, type inféré du schéma de `ia.ts`) : `variante` ; `reglages` (forme de `ReglagesIa` de `src/ai/couche.ts` : modèle et routage de `structuration`, `quartier`, `plan`, `notation` selon la variante, `raisons`) ; `recherche` (modèle et routage de l'étape `recherche` de l'agent) ; `rechercheWeb` (forme de `ReglageRechercheWeb` de `src/ai/recherche-web-reelle.ts`, `maxResultats` posé par la composition à `MAX_RESULTATS_WEB`) ; `profils` (`apercu` et `complet` sous la forme de `BornesRecherche`, `mini` sous sa forme du point 3) ; `tailleLotNotation`. Aucun plafond, aucun montant, aucune estimation de coût par requête.
6. **Décisions de Samuel reprises sans rien trancher de plus** (0053 et son amendement 1, B7-PO-5 (a) à (c)) :
   - **profil d'IA léger** pour les essais réels du prototype (P0r3) : il reste dans les fichiers de P0 ; la production le reprend seulement par les valeurs dérivées du point 2 (même modèle moins cher pour le tri et la notation, `deepseek/deepseek-v4.1-flash`, choix d'ia-recherche dans les plafonds) ; le schéma admet un modèle par étape et des bornes plus basses que celles de B7-PO-5 ; B7 n'en fixe aucune valeur et Samuel valide à la fin de ses essais ;
   - **fiches Places Details des seuls lieux de la première série** et **premier tri à vol d'oiseau avant Routes** : hors de la configuration de B7 (B8, B9) ; aucun modèle n'estime de distance ni de durée ;
   - **montants** (840 éléments Routes par voyage, 0088 ; plafond de coût des modèles ; plafonds de B7c) : inchangés, hors de `ia.ts`.
7. **Plafonds** : hors de `ia.ts`. Ils restent dans `src/server/config/usage.ts` (B7c, 0083), et `PLAFONDS_USAGE` reste `null` tant que Samuel n'a pas fixé les montants (Q39, Q45, Q465). Les estimations de coût par requête que réserve le registre (`coutsEstimesMicros` de P0) ne sont pas tranchées ici : la composition de B9c les fixe, sous une seule source.
8. **Une divergence future** : si une valeur de production doit différer de P0, la PR qui le fait **retire** sa dérivation et l'écrit dans `ia.json` (une seule source, toujours) ; à la fin de P0 (décision de fin des copies, 0077 § 1 point 9), les valeurs dérivées passent dans `ia.json`, comme la formule de classement de 0045 § 4 point 4.
9. **Tests** (B7b, noms fixés) :
   - `configuration ia: valeur absente, inconnue ou hors bornes refusée` (sous `tests/unit/`) : chaque clé obligatoire de `ia.json` absente, une clé inconnue, une borne de profil refusée par `BornesRechercheSchema` (somme des cibles au-dessus du total, toutes les cibles à 0), une cible `mini` à 0, un identifiant de modèle hors de `MODELE_ID_PATTERN`, un `schema` différent, une variante inconnue, un `zdr` sur une étape inconnue sont refusés ; `routage.data_collection` autre que `"deny"` dans un `modeles.json` de test est refusé ; les fichiers commités passent.
   - `configuration ia: une seule source par valeur` : `ia.json` ne peut porter aucune clé du tableau du point 2 (schéma strict, cas de test) ; les valeurs chargées sont égales à celles des fichiers de P0 pour chaque ligne du tableau ; aucun fichier de `src/` hors de `ia.ts`, `ia.json`, des lecteurs de configuration de P0 et des tests ne déclare `toursMax`, `ageSourceMaxJours`, `ciblesParCreneau`, `totalCandidats` ou `delaiMs` suivi d'une valeur numérique littérale (recherche dans le texte des sources) ;
   - `configuration ia: valeurs de départ` : un instantané de `CONFIGURATION_IA` (modèles par étape, variante, `zdr`, trois profils). Un changement d'un fichier de P0 qui change la production fait donc échouer ce test : la PR qui le fait le dit, et choisit entre suivre P0 ou passer la valeur dans `ia.json` (point 8).
   - `pnpm p0` et `p0Run` inchangés : aucun fichier de P0 n'est modifié.

### 4. Renvois de 0080 § 7

#### 4.1 `Routage.zdr` pour l'étape `structuration` (proposition du Tech Lead, accord du Product Owner demandé)

1. **Proposé : `zdr: true` pour `structuration`, et pour elle seule.** C'est la seule étape qui reçoit le récit libre (B7-PO-1), qui peut contenir des noms ou des détails personnels (handover § 12). `zdr: true` restreint OpenRouter aux points d'accès sans conservation des données ; il s'ajoute à `data_collection: "deny"` et ne le remplace pas. Les autres étapes ne reçoivent ni récit, ni email, ni nom de personne (B7-PO-1) : sans `zdr`, pour ne pas restreindre le routage sans raison.
2. **Échec fermé** : si aucun point d'accès sans conservation n'existe pour le modèle configuré, la requête échoue (code fermé du fournisseur, `provider_error` pour `structureBrief`). **Jamais de repli sans `zdr`.** B7b n'en dépend pas (aucun appel réel) ; la disponibilité est vérifiée au premier branchement réel (B9a). Si le modèle de départ n'en a pas, le choix d'un autre modèle pour `structuration` revient au rôle ia-recherche dans les plafonds ; un modèle plus cher au-delà des plafonds remonte à Samuel (argent).
3. **Portée** : ce réglage ne change pas Q46 (engagement des fournisseurs de modèles, Samuel), ni l'acceptation des essais avec briefs de test (P0-Q5, Q260) : il réduit l'exposition, il n'ouvre aucun flux nouveau. Il ne vise pas le moteur de recherche web (Exa, 0055 A1), que `structuration` n'appelle pas.
4. **Mise en œuvre** : par `ia.json` (§ 3 point 3), test `configuration ia: valeurs de départ`, et un cas dans le test de la couche : la requête `structuration` porte `zdr: true` dans le corps (`provider`), les cinq autres étapes ne portent pas `zdr`. Si le Product Owner refuse, la valeur passe à `false` ou disparaît de `ia.json`, sans autre changement de code.

#### 4.2 Schéma de lieu aligné sur le contrat

1. **Décidé** : dans `src/ai/entrees.ts`, `destination` et `ville` (`EntreeModeles`, `EntreeQuartier`) suivent **exactement** la règle du contrat : `z.string().trim()` borné par `DESTINATION_LENGTH` ou `CITY_NAME_LENGTH` de `@/contracts` (aucune seconde copie des bornes). Une valeur que le contrat accepte n'est plus refusée par la couche IA (`invalid_input`), et la valeur passée au modèle est la valeur rognée, comme dans le contrat. `pays` (P0 seulement, 0080 point 6 Q11) suit la même règle avec sa borne de 60.
2. **Raison** : ces champs sont une **saisie** de la personne, pas un texte produit par un modèle. `texteMaison` reste la règle des **sorties** des modèles (B7-PO-8), où qu'il vive (0094 § 7, PR #516, le déplace dans `src/contracts/texte.ts` ; cette décision n'en dépend pas). La protection d'une saisie vient de sa **mise en forme**, pas d'un refus : dans un prompt, `encadrer` sérialise en JSON (caractères de contrôle échappés) et échappe `<` et `>` ; dans une requête web posée par le code (`suggererQuartier`), `nettoyerRequeteWeb` retire contrôles, caractères de format, `<` et `>`. Le récit, lui, ne part qu'à la structuration (B7-PO-1).
3. **Test** `ia: lieu de l'entrée aligné sur le contrat` (dans `src/ai`, qui peut importer `@/contracts`) : sur une table de valeurs (U+200C et U+200D dans un nom, marque de direction, `<b>`, `<<<FIN>>>`, « booking.com », « St. Gallen », « Zürich », un emoji, un caractère de contrôle, des espaces de bord, 1, 2, 80 et 81 caractères), le verdict et la valeur rendue de `EntreeModelesSchema.destination` et de `EntreeQuartierSchema.ville` sont ceux du schéma du contrat ; une destination qui contient `<<<FIN>>>` et `</data>` laisse le cadre intact dans la requête du journal de prompts (un seul `<<<FIN>>>`, en fin de message).

#### 4.3 `SourceWebFournisseur` réexaminé

1. **Décidé : le type reste, distinct et inchangé, dans `src/ai/client.ts`.** La raison d'origine (`src/ai` ne pouvait pas importer `@/research`) a disparu avec le déplacement de 0077 § 1 point 4, mais deux autres la remplacent :
   - **sens** : une source rendue par le fournisseur est une donnée **non contrôlée** (adresse non vérifiée, longueurs non bornées) ; un `ResultatWeb` est un résultat **admis** par `recherche-web-reelle.ts` (`https:` seulement, sans identifiants, borné, dédoublonné). Deux noms rendent ce passage visible dans le code ;
   - **dépendances** : le contrat du module de capacité (`RequeteRechercheWebFournisseur`, `ReponseRechercheWebFournisseur`, `PointEntreeRechercheWeb`) vit dans `client.ts`, et `openrouter-client.ts` n'importe rien de `recherche-web.ts`. Le remplacer par `ResultatWeb` ajouterait un import au module de capacité, donc une revue de la Sécurité, sans gain.
2. Le test d'égalité de forme (`recherche-web-reelle.test.ts` l. 99) **reste** : il documente que la conversion est un passage champ à champ. Si les deux formes doivent diverger, la PR qui le fait remplace ce test par un test de la conversion, sur décision du Tech Lead.
3. B7b corrige le commentaire de `SourceWebFournisseur` (raisons du point 1) et ne l'utilise nulle part ailleurs que dans `client.ts`, `openrouter-client.ts`, `recherche-web-reelle.ts` et leurs tests.

### 5. Rappels pour B7b (aucune décision nouvelle)
- 0080 point 6 (Q6) : B7b ajoute un test ou une règle qui interdit de passer `complement` hors des appelants de P0 nommés en 0077 § 1 point 5.
- Spécification, question 7 : B7b mesure la durée du profil `apercu` sur Édimbourg (mode simulé, horloge injectée) et la note dans sa PR.
- Mineur 4 de la revue de #424 : le critère `recherche: quartier conseillé` exige déjà d'écarter un logement dont l'URL n'est pas dans les résultats.
- B7b liste dans sa PR, comme écarts justifiés : le changement de `openrouter-client.ts` du § 2 point 6, celui de `fetch-page.ts` du § 1 point 3, et celui de `entrees.ts` du § 4.2.

## Conséquences
- **B7b** peut commencer dès la fusion de cette décision : B7a est fusionnée (#424), B7-TL-4 l'est (0055 § 7), TL-5, TL-7 et TL-8 le sont ici. Fichiers en plus de la spécification : `src/ai/traces.ts`, `src/server/config/ia.ts` et `ia.json`, `src/ai/entrees.ts` (§ 4.2), `src/ai/client.ts` (commentaire et `tokens?`), `src/ai/openrouter-client.ts` (§ 2 point 6), `src/research/bornes.ts` (§ 3 point 4).
- **Fusion de B7b** : verdict de la Sécurité sur le § 2 (question 2) et sur les écarts du § 5 ; l'accord du Product Owner sur le § 4.1 ne bloque pas le code (valeur de configuration).
- **Fichiers communs**, pour le CEO à l'assignation : `src/research/agent.ts`, `src/ai/sorties.ts`, `src/research/candidat.ts` et `src/server/p0/vers-couche-ia.ts` sont aussi dans le ticket Q-L2a proposé par 0094 (PR #516) ; `src/ai/candidat.ts` dans Q-L2a et Q-L4a. Question 3.
- **B9c** : lit `CONFIGURATION_IA` dans sa composition (`generation.ts`) et lui applique, au chargement, `BornesRechercheSchema`, `MODELE_ID_PATTERN` et `MOTEURS_RECHERCHE_WEB` (§ 3 point 1) ; écrit l'adaptateur OpenTelemetry de `TracesIa` (exportateur désactivé, Q28).
- **Handover back-end § 12** : puce « Lecture de pages » corrigée dans cette PR.
- Aucun test supprimé ni désactivé ; aucune dépendance ajoutée.

## Questions ouvertes
Nouvelles questions (le CEO les reporte dans `QUESTIONS.md`) :
1. **Product Owner** : accord sur `zdr: true` pour la seule étape `structuration` (§ 4.1), échec fermé sans repli. Ne bloque pas le code de B7b (valeur de configuration, `true` par défaut) ; bloque le caractère définitif du § 4.1.
2. **Sécurité** : verdict sur B7-TL-7 (question 9 de la spécification) : liste fermée des attributs (§ 2 point 3), règle « les traces ne cassent jamais une étape » (§ 2 point 5) et lecture des tokens dans le module de capacité (§ 2 point 6). Demandé dans la revue de cette PR ; à défaut, dans la PR de B7b. Bloque la fusion de B7b.
3. **CEO** (ordre des tâches) : B7b et le ticket Q-L2a de 0094 (PR #516) touchent `src/research/agent.ts`, `src/ai/sorties.ts`, `src/research/candidat.ts` et `src/server/p0/vers-couche-ia.ts`. Lequel passe d'abord, ou dans quel cycle ? Bloque l'assignation simultanée des deux tickets, pas B7b seul.

Questions existantes touchées, sans rien trancher :
- **Q39, Q45, Q465** (Samuel, argent) : plafonds de production ; `PLAFONDS_USAGE` reste `null` (§ 3 point 7).
- **Q28** (Tech Lead, puis Samuel) : aucun exportateur de traces n'est branché (§ 2 point 8).
- **Q46** (Samuel) : engagement des fournisseurs de modèles et du moteur de recherche web tiers ; inchangée par le § 4.1.
- **Q427** (Samuel) : flux de la recherche web vers Exa, accepté pour ses essais, à revoir avant la mise en public (0055 A1) ; la configuration de production le reprend par `modeles.json` et ne l'élargit pas.

## Quand revoir cette décision
Si la Sécurité refuse un point du § 2 ; si le Product Owner refuse le § 4.1 ; si le modèle de `structuration` n'a aucun point d'accès sans conservation au branchement réel (B9a) ; si une valeur de production doit diverger de P0 (§ 3 point 8) ; à la fin de P0 (fin des copies, 0077 § 1 point 9) ; si Samuel retient un service de traces (Q28) ; si un type de contenu de plus est demandé pour le lecteur de pages.
