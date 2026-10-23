# 0126 — Bout en bout, lot 4 : « Pas pour moi » change le programme (révision = nouvelle exécution liée, entrée sans donnée Google)

Statut : **proposée** par le rôle IA (ticket #713), décision déléguée du **Tech Lead** (architecture, tests : « Qui décide quoi » de `docs/CONTEXT.md`), **à valider en revue** ; définitive à sa fusion, sans délai de veto (décision 0093). Verdict **Sécurité** : approuvé (revue consolidée de la PR #717, head `a3a0866`). Dépense : la part **modèles** d'une révision reste sous le fusible de 2 USD par voyage (réponse de Samuel à Q601) ; la part **Google** d'une révision est un forfait nouveau, réduit au besoin de la version servie (§ 2.1), dont le coût maximal est écrit ci-dessous. **Une seule révision par voyage** : réponse de Samuel du 2026-10-23 (§ 2). Aucune migration. Elle ne supprime ni ne désactive aucun test.

Date : 2026-10-23 · Décideur : Tech Lead (proposée par IA) · Ticket : #713 · Spécification : `specs/E2E-essai-bout-en-bout.md`, lot 4 ; D4 et D5 · Décisions liées : 0009, 0011 (§ 1, § 3), 0046 (S4, D13), 0093, 0117 (§ 3, S5), 0123, 0124, 0125

## Contexte

À la fin du tri d'un voyage d'essai, chaque « Pas pour moi » doit retirer l'étape du programme et la remplacer. Aujourd'hui, le tri d'essai reste en mémoire et la fin affiche « tes choix ne changent pas encore ton programme » (0124). Il faut décider deux choses : soit la révision est une **nouvelle exécution liée**, soit c'est une **étape de l'exécution** d'origine. Il faut aussi décider de ce que le modèle reçoit en entrée.

## 1. Une nouvelle exécution liée, pas une étape de l'exécution d'origine

La révision est une nouvelle ligne `prototype.runs` (nature `essai`, variante `A`, `brief = 'saisi'`) :
- son brief est **recopié** dans `run_briefs`, depuis la version servie ;
- elle est démarrée par le workflow `p0Revision` (`etapeRevision`, puis `etapeClore` seulement en cas d'arrêt) ;
- elle écrit un nouveau programme sous le **même** `tripId`.

L'exécution d'origine reste un enregistrement clos (`programme_ecrit`), ce qui garde intacts S4 et le nettoyage. Nous écartons l'étape ajoutée à l'exécution d'origine, pour trois raisons :
- elle rouvrirait une exécution close ;
- elle mélangerait deux forfaits ;
- elle casserait l'invariant « un programme par exécution ».

Les deux workflows partagent un même corps, `ecrireVersion` : rédaction, lecture tolérante, vérification Google, trajets et écriture. Seules la requête et le filet du § 4 diffèrent.

**Version servie** : le lecteur sert la dernière version non expirée du voyage. Il joint `runs` et trie par `started_at DESC, id DESC` (`SQL_LISTE` en `DISTINCT ON`, `SQL_PROGRAMME`, `lireVersionCourante`). Cela demande **aucune migration**. Une révision arrêtée n'écrit rien, et la version précédente reste servie. Seuls les voyages lancés depuis l'app (`proto_<slug>_<32 hex>`, 0125 § 2) sont révisables. Les voyages d'un brief commité gardent la phrase « choix sans effet ».

**Entrée du workflow** : `{ runId, tripId, pasPourMoi, jAime }`. Elle ne porte que des **identifiants maison** (`j<jour>-<rang>`), validés par `choixRevisionValides` au démarrage puis dans l'étape. C'est un écart assumé à la règle « runId seul » de 0009 et 0011 § 3. Ces identifiants ne sont ni des données Google, ni des données personnelles, ni du texte libre. Le runtime des workflows garde cette entrée comme toute entrée. Les garder dans le schéma `prototype` aurait demandé une migration.

## 2. Garde, fusible et nombre de révisions

La révision suit **la même garde** que le lancement (`reviserVoyageSaisi`) :
1. cookie d'accès ;
2. `P0RUN_COMPLET` ;
3. choix bien formés ;
4. commit ;
5. verrou S8 ;
6. brief de la version servie (même slug de destination), `BriefSchema`, plafonds du mode ;
7. réservation.

**Fusible** (Q601 : la révision compte dans le même fusible de 2 USD). S4 interdit de garder le coût réel d'une exécution finie : le forfait réservé est donc la seule mesure durable. Le fusible est partagé à l'avance (`plafondModelesMicros`) :

| Exécution | Forfait de modèles |
| --- | --- |
| Premier programme d'un voyage de l'app (`PART_HORS_PREMIER_PROGRAMME_MICROS` = 0,50 USD tenus hors de lui) | 2 − 0,50 = **1,50 USD** |
| La révision (`PART_REVISION_MICROS`) | **0,25 USD**, plus de dix fois le coût estimé d'une requête `programme` |
| Voyage d'un brief commité (inchangé) | 2 USD |

Somme : 1,50 + 0,25 = 1,75 USD au plus par voyage de l'app, sous le fusible de 2 USD ; les 0,25 USD restants ne sont réservés par aucune exécution. Ce partage est celui que Samuel a gardé le 2026-10-23.

Une étape lit son forfait réservé (`forfaits.models_cost_micros`, `ExecutionEnCours.forfaitModelesMicros`) et prend le minimum avec le fusible du mode.

### 2.1 Plafonds Google d'une révision (décision du CEO sur le mineur 9 de la revue de la PR #717)

Une révision réécrit le programme **étape pour étape** : son besoin Google est celui de la version servie. À la réservation, `plafondsGoogleRevision` le calcule depuis la version servie (`lireVersionCourante`), puis `lancementDuMode(mode, "revision", plafonds)` réserve ces plafonds au prix plein, jamais au-delà du mode :
- Text Search et fiches : un appel par logement du brief et par lieu distinct de la version servie, plus la marge des fiches du mode (`fiches` : 4 au moins, 20 %) ;
- Routes : les blocs que demanderaient des journées de même forme (logement, étapes, logement), chaque étape comptée comme un lieu distinct (pire cas : toutes remplacées), plus la même marge.

L'étape relit ces plafonds réservés (`ExecutionEnCours.forfaitGoogle`, colonnes de `prototype.forfaits`, sans migration) et ne les dépasse jamais : parts Text Search et fiches, part Routes de `trajetsConsecutifs`. Au-delà, le comportement est celui du mode : lieux restants « à confirmer », trajets sans durée, jamais inventés.

**Toute la version est encore vérifiée**, les étapes gardées comprises. Ne vérifier que les étapes nouvelles demanderait de relire les positions et les temps de la version précédente et de les fusionner à l'écriture : ce n'est pas simple dans le code actuel, et c'est écarté ici.

**Coût maximal** (forfaits réservés au prix plein de `prix-google.json` ; le coût réel est plus bas, Text Search est à 0 USD) :

| Voyage de l'app | Google | Modèles | Total |
| --- | --- | --- | --- |
| Premier programme | 6,00 USD (plafonds du mode) | 1,50 USD | 7,50 USD |
| Une révision, au plus | 6,00 USD (plafonds du mode) | 0,25 USD | 6,25 USD |
| **Voyage avec sa révision, au plus** | 12,00 USD | 1,75 USD | **13,75 USD** |
| Exemple : Édimbourg, 6 jours (fixtures), une révision | 1,74 USD (39 Text Search, 39 fiches, 14 requêtes et 192 éléments Routes) | 0,25 USD | 1,99 USD |
| Exemple : Édimbourg, premier programme et sa révision | 6,00 + 1,74 = 7,74 USD | 1,75 USD | 9,49 USD |

**Nombre** : **une seule révision par voyage** (`REVISIONS_PAR_VOYAGE = 1`). Réponse de Samuel du 2026-10-23, 07:21 UTC, sur une carte du projet : « Une seule » révision par voyage après « Pas pour moi », au lieu des deux proposées ; il garde 1,50 USD + 0,25 USD pour la part modèles. La révision a toujours la même clé `request_id`, une empreinte SHA-256 de `vadrouille:revision:<tripId>:1` mise en forme d'UUID v8 (`clesRevision`, qui sait produire d'autres rangs si le nombre change). L'unicité de `request_id` borne donc le nombre de révisions sans table nouvelle :
- une clé en cours rend `en_cours`. Une clé `en_cours` plus vieille que `dureeMaxMs` plus la marge des orphelines (`MARGE_ORPHELINE_MS`), ou d'ancienneté illisible, est une **orpheline** (démarrage puis clôture échoués, workflow tué) : elle reste prise : avec une seule révision, le voyage rend alors `epuisees`, jamais `en_cours` sans fin. L'ancienneté est lue par l'horloge de la base (`SQL_CLES_REVISION`). Une clé d'un statut inattendu est prise, jamais libre ni « en cours » ;
- la clé écrite, et pas en cours (terminée, arrêtée, orpheline ou de statut inattendu), rend `epuisees` ;
- une demande simultanée retrouve l'exécution de la première (idempotence de la réservation).

## 3. Entrée de la requête `revision` : aucune donnée Google, aucun verdict

`EntreeRevision` (`src/ai/entree-revision.ts`) est un schéma **strict** : une clé en trop refuse l'entrée avant toute requête. Il contient :
- le brief, sous la même projection que `programme` ;
- les seuls **textes que l'IA a écrits** dans la version servie : date, titre du jour, heures, repas ou visite, nom du lieu, quartier, « pourquoi » ;
- les choix, en identifiants maison.

Il ne contient jamais :
- `placeId` ;
- position ;
- temps de trajet ;
- badge (`exceptions`) ;
- site vérifié (`source`) ;
- `locked` ;
- durée ;
- terminus ;
- propositions.

Les étapes vérifiées et « à confirmer » sont rendues de la même façon (0011 § 1, 0117 § 3). Le routage est `zdr: true` et `data_collection: "deny"` quel que soit le réglage reçu (S5). Le prompt `revision` v1 a la même forme de sortie que `programme` v3, la même règle « à éviter », et il est versionné.

Canari :
- `tests/unit/p0/revision.test.ts` : sentinelles dans tous les champs Google ou de verdict, absentes de l'entrée et de la requête ;
- `tests/unit/workflows/p0-run-finale.test.ts` : aucun identifiant ni nom Google dans la requête de bout en bout.

## 4. Filet du code

Le modèle peut redonner un lieu écarté. Après la lecture, `retirerEtapesEcartees` retire donc tout créneau dont le nom normalisé (minuscules, sans accents ni signes) est celui d'une étape écartée. Le décompte s'ajoute à `slotsRemoved`. Si le filet vide toutes les journées, l'exécution s'arrête comme une sortie illisible.

## 5. Interface

Le déclenchement a lieu à la fin du paquet, une fois l'annulation expirée, sans question ouverte, et seulement s'il y a au moins un « Pas pour moi ». L'écran appelle alors `reviserVoyageEssai`, puis affiche l'état :

| État | Ce que voit la personne |
| --- | --- |
| `started` | Message de confirmation |
| `inProgress` | Message : réécriture déjà en cours |
| `exhausted` | Message : programme déjà réécrit une fois |
| `capReached` | Message : plafond des essais atteint |
| Échec | Bouton « Réessayer » |
| `accessExpired` | Saisie du code d'accès en place |

Les textes sont dans `presentation.json` (`fin.revision`), à relire par l'UX. Ils disent où voir la nouvelle version (ouvrir ou recharger le programme), et le plafond atteint se termine par « Réessaie plus tard. ». La saisie du code a un titre de niveau 3, sous le titre de la fin ; une fois le code accepté, le focus revient au titre de la fin. Pendant l'envoi, seul un message s'affiche, sans indicateur de progression : l'envoi ne fait que réserver et démarrer.

**Jeu d'évaluation hors réseau** : `evals/revision/` et `tests/unit/evals/revision.test.ts`. Ils mesurent qu'aucune étape « Pas pour moi » ne revient, que les étapes aimées restent le même jour, que la règle « à éviter » tient, et que l'entrée ne porte aucune donnée Google. Un contrôle prouve que la mesure mord.

## Limites connues

- Une révision arrêtée, ou orpheline, consomme la seule révision du voyage.
- Tout détenteur du code d'accès peut réviser n'importe quel voyage de l'app : le prototype n'a pas de propriétaire de voyage (mineur 8 de la revue de la PR #717, accepté pour le prototype).
- « Passer » et le déblocage avant la fin du paquet ne déclenchent pas de révision. C'est un écart à la spécification (« à la fin du tri (ou au déblocage) ») : **à confirmer par le Product Owner**.
- La nouvelle version réutilise des identifiants d'étapes `j<jour>-<rang>`. L'aperçu enregistré au déblocage (cookie de 0124) peut donc désigner d'autres étapes qu'avant la révision.
- L'écran ne suit pas la fin de la révision : la personne recharge le voyage pour voir la nouvelle version.

## Questions ouvertes

- **Product Owner** : confirmer que ni le déblocage ni « Passer » ne déclenchent la révision.
- **UX** : textes de `fin.revision`, et suivi de la nouvelle version (rechargement manuel ou suivi automatique).
