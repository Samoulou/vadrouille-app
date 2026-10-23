# 0126 — Bout en bout, lot 4 : « Pas pour moi » change le programme (révision = nouvelle exécution liée, entrée sans donnée Google)

Statut : **proposée** par le rôle IA (ticket #713), décision déléguée du **Tech Lead** (architecture, tests : « Qui décide quoi » de `docs/CONTEXT.md`), **à valider en revue** ; définitive à sa fusion, sans délai de veto (décision 0093). Verdict **Sécurité** demandé sur l'entrée de la requête `revision` (§ 3) et sur les deux nouveaux modules `server-only` de `src/ai` (confinement). Elle n'engage aucune dépense nouvelle : la révision reste sous le fusible de 2 USD par voyage (réponse de Samuel à Q601). Aucune migration. Elle ne supprime ni ne désactive aucun test.

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
| Premier programme d'un voyage de l'app | 2 − 2 × 0,25 = **1,50 USD** |
| Chaque révision (`PART_REVISION_MICROS`) | **0,25 USD**, plus de dix fois le coût estimé d'une requête `programme` |
| Voyage d'un brief commité (inchangé) | 2 USD |

Une étape lit son forfait réservé (`forfaits.models_cost_micros`, `ExecutionEnCours.forfaitModelesMicros`) et prend le minimum avec le fusible du mode.

**Nombre** : au plus `REVISIONS_PAR_VOYAGE = 2` révisions par voyage. La k-ième révision a toujours la même clé `request_id`, une empreinte SHA-256 de `vadrouille:revision:<tripId>:<k>` mise en forme d'UUID v8 (`clesRevision`). L'unicité de `request_id` borne donc le nombre de révisions sans table nouvelle :
- une clé en cours rend `en_cours` ;
- deux clés écrites rendent `epuisees` ;
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
| `exhausted` | Message : programme déjà réécrit deux fois |
| `capReached` | Message : plafond des essais atteint |
| Échec | Bouton « Réessayer » |
| `accessExpired` | Saisie du code d'accès en place |

Les textes sont dans `presentation.json` (`fin.revision`), à relire par l'UX.

## Limites connues

- Une révision arrêtée consomme l'un des deux rangs.
- « Passer » et le déblocage avant la fin du paquet ne déclenchent pas de révision.
- La nouvelle version réutilise des identifiants d'étapes `j<jour>-<rang>`. L'aperçu enregistré au déblocage (cookie de 0124) peut donc désigner d'autres étapes qu'avant la révision.
- L'écran ne suit pas la fin de la révision : la personne recharge le voyage pour voir la nouvelle version.

## Questions ouvertes

- **Samuel** : confirmer le partage 1,50 / 2 × 0,25 USD, et le nombre de deux révisions par voyage.
- **Sécurité** : verdict sur l'entrée `revision` (§ 3) et sur l'écart « identifiants maison dans l'entrée du workflow » (§ 1).
- **UX** : textes de `fin.revision`, et suivi de la nouvelle version (rechargement manuel ou suivi automatique).
