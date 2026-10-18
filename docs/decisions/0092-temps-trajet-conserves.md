# 0092 — Temps de trajet des programmes du prototype conservés (exception à 0011 et 0027 point 4)

Statut :
- **Règle** (§ 1, risque accepté, texte de `CLAUDE.md` du § 7) : **décision de Samuel**, acceptée et définitive (juridique et modification des règles du studio, réservées à Samuel par « Qui décide quoi » de `docs/CONTEXT.md`).
- **Mécanisme** (§ 3 à § 6 : architecture, contrats, tests) : **décision déléguée du Tech Lead**, à lister dans la note de version suivante (rubrique « Décisions prises par le studio »), **définitive sans veto de Samuel 6 heures après sa fusion** (décision 0068).
- **Défaut du § 2** (exception limitée au prototype) : choix du studio, signalé comme tel, que Samuel peut changer à tout moment.

Date : 2026-10-18 · Décideur : Samuel (règle) ; Tech Lead (mécanisme) · Décisions liées : 0011, 0027, 0046, 0052, 0055, 0056, 0079, 0090

**Amende, sans les réécrire :**
- **0027 point 4** (« seul l'identifiant de lieu stocké, coordonnées gardées 30 jours au plus ») : une seconde exception, bornée au § 1 ;
- **0011 § 1** (« jamais stocké : […] durée ou distance de Routes ») et **0011 § 5**, ligne `Segment.minutes` (« sans cache partagé ni stockage ») et paragraphe « Relecture » : pour les programmes de `p0Run` seulement (§ 1, § 4) ;
- **P0-PO-9** (`specs/P0-prototype-recherche.md`, « Durées relues à l'affichage, jamais écrites ni mises en cache […] ; quota atteint ou relecture en échec : état d'erreur ») : les durées des programmes de `p0Run` sont écrites (§ 1, § 3) et une relecture en échec ne donne plus l'état d'erreur mais un affichage sans les temps manquants (§ 4 point 3) ; « positions lues dans le programme » et la suite de P0-PO-9 sont inchangées ;
- `specs/P0-suite-2.md`, « Relecture Routes » (« relues à chaque affichage […], jamais stockées » ; refus : « la Journée affiche l'état d'erreur existant ») : la relecture lit d'abord les temps conservés, ne relit que les paires manquantes et, en cas de refus, affiche la journée sans ces temps (§ 4) ; la réservation, les plafonds et la cadence de chaque relecture restent ceux du texte ;
- **0079** : « Durées de trajet […] relues à l'affichage » (prérequis 3) et « Un refus rend l'état d'erreur existant de la Journée (`RelectureError`), jamais une durée inventée ni conservée » : mêmes amendements (§ 4) ; « jamais une durée inventée » reste vrai ; l'état d'erreur reste celui des positions manquantes (`PositionsManquantes`), inchangé ;
- **0090 § 1**, conséquence « la **relecture** (`src/server/p0/relecture.ts`) est inchangée : une durée `null` y fait échouer la journée relue (« Réessayer ») » : pour le prototype, une durée `null` ou un refus à la relecture donne un affichage sans ce temps (§ 4 point 3), plus l'état d'erreur ; et l'en-tête de 0090 « N'amende pas 0011 (aucune durée […] stockée […]) », qui ne reste vrai que pour le MVP (les durées du prototype sont stockées selon le § 1) ;
- formulations « durées de trajet relues à l'affichage » de `specs/P0-suite-executions-reelles.md` (cadre, « Positions Google gardées […] ; durées de trajet relues à l'affichage ») et de **0028** (P0-Q8 b, « seules les durées de trajet relues à l'affichage ») : vraies pour le MVP ; pour le prototype, elles **se lisent avec 0092** (temps conservés d'abord, relecture des seules paires manquantes) ;
- la ligne « Jamais » de `CLAUDE.md` sur le stockage des données Google : texte du § 7, modifié dans la même PR.

Tous ces amendements ne valent que pour le prototype (§ 2).

**N'amende pas** : 0011 § 2 à § 4 et § 7 (aucune donnée Google dans un prompt, un journal, une trace ou un état de workflow), 0011 § 6 et 0060 (positions), 0052 S10 (écriture des positions), 0090 § 1 (règles de lecture de la matrice, tableau des cas et résidu accepté), § 2 et § 3 (seules la conséquence sur la relecture et la formule « N'amende pas 0011 » de son en-tête sont amendées, ci-dessus), les plafonds et la cadence de 0053, 0088 et Q330, et tout le MVP (§ 2).

## Contexte

Sur `p0-reel`, chaque affichage d'une page du voyage (`/voyages/[id]`, `/jour/[n]`, `/presentation`) relit les temps de trajet par des matrices Routes (`src/server/p0/relecture.ts`, 0079), parce que 0011 interdit de garder une durée Google. Le 2026-10-18, ces relectures ont épuisé le quota journalier Routes que Samuel a fixé dans sa console Google (1 000 éléments par jour) : les pages du voyage échouent (`RelectureError` `unavailable`, journal `p0.read_unavailable` avec `ErreurClientGoogle`) et des exécutions se sont arrêtées en `upstream_rate_limited` (décision 0091, PR #498).

## Décision de Samuel

Carte de décision du projet (id `cmsg_0174CRqum9q8GNfZHmNHcYvRHyK98FWXxmjkN1fJAUceZh`), question : « Garder les temps de trajet Google pour ne plus les redemander à l'ouverture ? ». Option choisie par Samuel, de sa main, le **2026-10-18 à 17:59 UTC** : **« Garder les temps »**, dont la conséquence affichée était : « Plus aucun appel Google à l'ouverture, mais c'est contraire au contrat Google : risque que Google coupe ta clé. J'écris ton choix dans nos règles. »

Juste avant, à 17:57 UTC, Samuel a écrit : « mais on sauvegarde les temps et tant pis, on comsomme pour rien là, juste pour voir les voyages et l'afficher ».

### Risque accepté par Samuel

Il lui a été dit explicitement, avant son choix, que conserver les temps de trajet est **contraire aux conditions d'utilisation de Google Maps Platform** et que **Google peut suspendre sa clé**. Samuel accepte ce risque. Conséquence d'une suspension, à connaître : la clé serveur sert aussi Places (ancrage, fiches, positions) ; une clé coupée arrête toutes les exécutions réelles et toutes les relectures, qui échouent fermées par les chemins existants (aucune valeur inventée). Cette décision ne règle pas Q5 : la validation juridique formelle reste ouverte avant le lancement (0027 point 4).

## Décision

### 1. L'exception (règle de Samuel, bornée par le Tech Lead)

Sont **conservés** : les temps de trajet, en **minutes entières** (la valeur que le moteur a utilisée pour planifier, `Math.ceil(secondes / 60)`, 0090 § 2), entre deux lieux consécutifs d'un programme écrit par `p0Run`, calculés par Routes **pendant cette exécution**. Pour chacun : le programme, le mode, l'identifiant de lieu de départ, celui d'arrivée, les minutes. Rien d'autre.

Bornes, toutes obligatoires :
1. **Côté serveur seulement**, dans la base Neon, schéma `prototype`, table dédiée (§ 3) ; jamais dans le contenu du programme (`prototype.programmes.contenu` reste sans durée : la forme réduite de P0-PO-9 et le `CHECK` de la table sont inchangés), un cache, un fichier, le navigateur, un journal, une trace ou un état de workflow.
2. **Liés au programme** : expiration copiée du programme (début de l'exécution + 29 jours, donc moins de 30 jours après leur obtention), **supprimés par la purge existante** du prototype (`prototype.purge_expired()`, workflow `p0-purge.yml`), sans nouveau chemin de purge.
3. **Jamais dans un prompt** (0011 § 4 inchangé), jamais affichés sur une carte autre que Google (ils ne sont affichés que dans la ligne du jour, comme aujourd'hui).
4. **Pas de distance** : Routes ne la rend pas (masque `originIndex,destinationIndex,duration,condition`, 0090 § 3 point 5, inchangé) et rien ne la demande. Ajouter un champ au masque change le SKU facturé et relève de Samuel.
5. **Un seul mode, celui de l'exécution** : `p0Run` calcule toutes ses matrices dans le mode unique `modeDeTrajet(brief)` (`src/server/p0/vers-moteur.ts`), et la fonction `Trajets` (`src/prototype/ancrage.ts`) ne porte pas de mode. La colonne `mode` enregistre ce mode ; une paire du programme dont le mode diffère de celui de l'exécution **n'est pas écrite** (elle sera relue). Jamais des minutes d'un mode servies sous l'étiquette d'un autre.
6. **Paires du programme seulement** : uniquement les paires que la relecture du programme demandera (lignes de trajet des journées, trajet des propositions depuis l'étape précédente ou le logement), pas toute la matrice de l'étape finale.
7. **Un seul écrivain** : l'étape finale de `p0Run`. La relecture n'écrit jamais (§ 4).

### 2. Portée : le prototype seulement (défaut choisi par le studio)

L'exception vaut pour le **prototype** (`p0Run`, schéma `prototype`, préversion de `p0-reel`) **seulement**. Pour le MVP, 0011 s'applique sans changement (`Segment.minutes` non stocké, recalculé à la lecture). **Ce défaut est un choix du studio, pas de Samuel** : sa demande vise les voyages du prototype qu'il ouvre aujourd'hui, et étendre une entorse au contrat Google à des données d'utilisateurs n'est pas à trancher par le studio. Il tient **jusqu'à ce que Samuel en décide autrement pour le MVP** (question 1 de la PR).

### 3. Stockage (Tech Lead ; verdict Sécurité requis)

Migration écrite à la main dans `db/migrations/` (numéro suivant, `0011_…`), sur le modèle de `prototype.jugements` (`0003_prototype.sql`, § 4.4) :

- table **`prototype.trajets`** (nom sans `plan`, `work` ni `scratch`) : `id`, `organization_id` (défaut et déclencheur : `org_prototype`), `programme_id`, `mode` (`CHECK` : `walk`, `transit`, `car`), `origine` et `destination` (`CHECK` de la forme d'un `placeId`, comme `run_candidates_place_id_check`), `minutes` (`integer`, `CHECK` entre 0 et 1 440 ; une valeur hors de ces bornes est **écartée avant la transaction**, § 4 « Écriture », jamais envoyée à la base), `expires_at` ; `UNIQUE (programme_id, mode, origine, destination)` ; clé étrangère composite `(programme_id, expires_at)` vers `prototype.programmes (id, expires_at)`, sans `ON DELETE CASCADE` ; index sur `expires_at` ;
- déclencheur `BEFORE INSERT` (`SET search_path = pg_catalog, pg_temp`) qui pose `id`, `organization_id` et `expires_at` (copiée du programme non expiré ; sinon refus `foreign_key_violation`), jamais fournis par l'appelant ;
- RLS activée et forcée. `vadrouille_prototype` : `INSERT (programme_id, mode, origine, destination, minutes)` et `SELECT` avec politique `org_prototype` **et** `expires_at > now()` ; **ni `UPDATE` ni `DELETE`**. `vadrouille_fn_prototype_purge` : `SELECT (expires_at)` et `DELETE` avec les politiques `expires_at <= now()`, comme les quatre tables actuelles. Aucun droit pour `vadrouille_app`, `vadrouille_share` ni aucun autre rôle ; rien pour `PUBLIC` ;
- **remplacement de `prototype.purge_expired()`** (`CREATE OR REPLACE`, même signature, même propriétaire, mêmes droits) qui supprime `prototype.trajets` expirés **avant** les programmes ; le reste de la fonction à l'identique ;
- fichier `.down.sql` de retour arrière, mise à jour de `db/README.md` et, si la Sécurité le demande, des scripts de `db/reverrouillage/` ;
- **atteinte de la base réelle** : seulement par la liste d'approbation de `db-migrate.yml` (0056 S9), donc par une PR de workflow qui attend `owner-approved` posé par Samuel (0035). Tant que la migration n'est pas appliquée, le code doit fonctionner comme aujourd'hui (§ 5 point 6).

### 4. Écriture et lecture (Tech Lead)

**Paires d'un programme : une seule fonction.** `pairesDuProgramme(programme)` (dans `src/prototype/programme-reduit.ts`, que l'application et `p0Run` atteignent déjà) rend les paires `{ origine, destination, mode }` que la relecture demande ; `recomposerJour` et `recomposerPropositions` de `src/adapters/prototype.ts` l'utilisent au lieu de leur calcul actuel (`lieuAvant`, `lieuApres`, `origineProposition` y déménagent). Aucune seconde liste. **La fonction est pure et ne lève rien** : un lieu manquant (étape sans `placeId`, jour sans terminus) donne `null` à la place de la paire, jamais une paire devinée ; c'est **l'adaptateur** qui garde son erreur actuelle (`RelectureError("missing_place")`, état d'erreur existant : un programme hors forme n'est pas un refus de Google), et l'écriture n'écrit simplement pas ces positions de paire.

**Clé d'une paire : une seule fonction.** `cleTrajet(paire)` (même module) rend `` `${mode}:${origine}:${destination}` `` ; le séparateur `:` ne peut figurer ni dans un mode (`walk`, `transit`, `car`) ni dans un `placeId` (`PLACE_ID_PATTERN`, `^[A-Za-z0-9_-]+$`). Écriture, lecture et tests construisent la clé par cette seule fonction, jamais à la main.

**Écriture** : dans la transaction unique d'`ecrireProgramme` (`src/adapters/prototype-ecriture.ts`), après l'`INSERT` du programme (qui rend son `id`) et avant le passage à `programme_ecrit`, un `INSERT` par paire, valeurs en paramètres liés. Le contrat `EcritureProgrammePrototype` (`src/contracts/prototype-ecriture.ts`) gagne `mode` (le mode unique de l'exécution, `modeDeTrajet(brief)`) et `trajets: ReadonlyMap<cle, minutes>` (clé : mode, origine, destination) ; l'étape finale de `p0Run` le remplit avec la fonction `trajets` qu'elle a déjà (`src/workflows/p0-run.ts`, celle qui a servi au moteur) appliquée à `pairesDuProgramme`, avec le mode de l'exécution (§ 1 point 5). **Avant la transaction**, `ecrireProgramme` écarte (n'écrit pas) toute paire sans durée connue (0090 : le moteur ne planifie pas sur un trajet inconnu), d'un autre mode que celui de l'exécution, ou dont les minutes ne sont pas un entier entre 0 et 1 440 : une paire écartée est relue à l'affichage, et ne fait jamais perdre le programme. Le contrôle d'entrée existant (`entree_refusee`) ne s'applique pas à ces paires. Ensuite, toute erreur de la base annule tout : **aucun temps sans son programme, aucun programme sans les temps retenus**. Aucune nouvelle requête Routes, aucun changement de masque ni de SKU.

**Lecture** : les temps sont lus **avec le programme**, par la même source (`src/adapters/prototype-lecture.ts`, même transaction `READ ONLY`, une requête par lot de programmes, comme les positions) et servis à l'adaptateur dans `ProgrammeServi`. La requête des temps **suit le test de présence de la table** (§ 5 point 6 : `to_regclass('prototype.trajets')`, lu dans la même transaction, avant toute requête qui nomme la table) : table absente, aucune requête, aucun temps lu, tout est relu comme aujourd'hui ; la lecture n'échoue jamais avant la migration. Choix du Tech Lead, plutôt qu'une lecture dans `relecture.ts` : même barrière d'accès, même pool, une seule transaction, aucune connexion de plus par page, et `relecture.ts` reste le seul client Routes de la lecture.

**Relecture** (`src/adapters/prototype.ts` et `src/server/p0/relecture.ts`) :
1. chaque paire trouvée dans les temps conservés prend sa valeur (`estimated: false`) ;
2. le relecteur (`RelecteurTrajets.relireJournee`) n'est appelé **que pour les paires manquantes** (programme écrit avant la migration, ou paire absente). Toutes présentes : **aucun appel**, ni réservation, ni cadence, ni connexion du relecteur (`relecture.ts` rend déjà `{ ok: true, minutes: [] }` pour une liste vide, sans rien ouvrir) ;
3. si Google refuse ou échoue (`quota_reached`, `unavailable`, `route_absente`) : **la page s'affiche sans ces temps**, jamais l'état d'erreur ni une durée inventée. Les temps conservés restent affichés ; un trajet manquant s'affiche sans durée ; le total de la journée n'est pas affiché s'il lui manque un trajet ; une proposition sans trajet relu perd `travelFromPrevious` et `detour` (comportement actuel de `recomposerPropositions`). Le journal `p0.read_unavailable` reste écrit comme aujourd'hui ;
4. la relecture **n'écrit jamais** les temps qu'elle obtient (§ 1 point 7) : un programme ancien reste relu à chaque affichage jusqu'à son expiration (29 jours au plus) ou sa régénération. Écart accepté : il évite un second écrivain hors de l'étape finale.

**Contrat** (`src/contracts/trip.ts`, Tech Lead), livré par une **PR de contrat distincte**, avant le reste (précédent : #484, PR de contrat de B9d), parce que `null` touche tous les consommateurs, MVP compris : `Segment.minutes` et `Day.travelMinutes` deviennent `number | null` (`null` : temps indisponible). `SegmentSnapshotSchema` omet déjà `minutes` et `DaySnapshotSchema` omet `travelMinutes` : rien n'est stocké de plus côté MVP. Le MVP ne produit jamais `null` (0011 « Relecture » inchangé pour lui). Libellé et accessibilité du trajet sans durée et de la journée sans total : **rôle UX**, dans le vocabulaire de `docs/handovers/frontend.md` ; affichage : rôle front (`DayLine`, `DeckCard` et tout consommateur que le compilateur signale).

### 5. Ce que le rôle qui code doit livrer

Une PR (rôle `[data]` pour la migration avec le back-end pour l'adaptateur, selon le découpage du CEO), en plus de la PR de workflow d'approbation de la migration (§ 3) :

1. migration du § 3, son `.down.sql`, `db/README.md` ;
2. `pairesDuProgramme` et son adoption par l'adaptateur (aucune duplication) ;
3. écriture dans `ecrireProgramme` et contrat `EcritureProgrammePrototype` étendu ; remplissage par l'étape finale de `p0Run`, à côté de l'écriture des positions (0052 S10) ;
4. lecture dans `prototype-lecture.ts`, `ProgrammeServi` étendu, relecture des seules paires manquantes ;
5. contrat `Segment.minutes` / `Day.travelMinutes` nullable, dans sa PR de contrat distincte (§ 4), puis affichage sans durée (avec le libellé de l'UX) ;
6. **compatibilité** : si la table n'existe pas encore sur la base (migration non appliquée), la lecture ne casse pas (aucune ligne lue, tout est relu comme aujourd'hui) et l'écriture n'est pas tentée ; le mécanisme (test de présence par `to_regclass`, ou ordre de livraison) est au choix du rôle, justifié dans sa PR.

Tests obligatoires :
- **base** (`tests/db/`) : `prototype: trajets purgés avec leur programme` (une ligne dont le programme a expiré est supprimée par `prototype.purge_expired()`, avant le programme, sans erreur de clé étrangère ; une ligne valide n'est pas touchée ; une ligne expirée n'est plus lisible avant la purge) ; `prototype: trajets, droits` (`vadrouille_prototype` sans `UPDATE` ni `DELETE`, `expires_at`, `id` et `organization_id` posés par le déclencheur, jamais par l'appelant ; aucun droit pour `vadrouille_app`, `vadrouille_share`, `PUBLIC`) ; colonnes de `prototype.trajets` égales à la liste du § 3 (test d'égalité, seule table du schéma `prototype` qui porte une donnée dérivée de Routes, nommée dans le test) ;
- **écriture** : programme et temps écrits ensemble ; une erreur sur un temps n'écrit ni programme ni position ; seules les paires de `pairesDuProgramme` sont écrites ; aucune valeur dans le texte des requêtes ;
- **couverture des paires par `p0Run`** : sur un programme produit par l'étape finale (tests de `p0Run`, client Routes simulé), toute paire de `pairesDuProgramme` a une durée dans les matrices du moteur, y compris les trajets depuis et vers les logements (terminus) et le trajet des propositions (`origineProposition`) ; sinon les paires non couvertes sont **énumérées** par le test (liste fermée, justifiée dans la PR) et relues à l'affichage. La conséquence « aucun élément Routes à l'ouverture » ne vaut que pour les paires couvertes ;
- **aucun appel Google quand tout est conservé** : relecteur simulé qui échoue s'il est appelé ; pages du jour, de la présentation et des propositions rendues avec les temps conservés ;
- **paires manquantes seules relues** : le relecteur reçoit exactement les paires absentes ;
- **dégradation** : relecteur qui refuse (`quota_reached`, `unavailable`) ou lève : la journée est rendue sans les temps manquants, sans total, sans erreur ; aucune durée inventée ;
- **matrice des privilèges** : `tests/db/roles.test.ts` étendu à `prototype.trajets` (droits de `vadrouille_prototype` et de `vadrouille_fn_prototype_purge` seulement) ;
- **frontières d'imports** : `pairesDuProgramme` reste **pure** : le test `le graphe de programme-reduit.ts ne contient que lui-même, src/contracts et zod` (`tests/unit/p0/imports.test.ts`) reste vert sans exception ; `tests/unit/confinement/listes/specificateurs.ts` ne reçoit une ligne pour l'import d'une valeur de `@/prototype/programme-reduit` par `src/adapters/prototype.ts` **que si l'analyseur l'exige** : si cet import est déjà admis par les règles générales, aucune ligne n'est ajoutée (le test `confinement: aucune ligne inutile` fait foi) ;
- **confinement** : `prototype.trajets` nommée seulement par `db/`, `tests/db/`, `prototype-ecriture.ts` et `prototype-lecture.ts` (test d'imports, sur le modèle de `store_prototype_coordinates nommée par un seul module`) ; test canari : aucune valeur de minutes conservée dans un prompt, un journal ou une trace de l'étape finale (sentinelles, comme 0052 S10 point 4).

### 6. Revues

- **Sécurité : verdict obligatoire** sur la migration (`db/`), les droits et politiques, le remplacement de la purge, le confinement (imports, journaux, prompts) et la PR de workflow d'approbation ;
- **Tech Lead** : revue de conformité à cette décision, aux contrats et au principe « l'agent cherche, l'ancrage vérifie, le moteur planifie » (les temps conservés sont ceux sur lesquels le moteur a planifié ; personne n'en invente) ;
- **UX** : libellé du trajet sans durée et de la journée sans total ;
- **Samuel** : `owner-approved` sur la PR de workflow qui approuve la migration (0035, 0056 S9).

### 7. Texte de `CLAUDE.md` (modifié dans la même PR)

Avant :

> - Mettre une donnée Google dans un prompt, stocker autre chose que l'identifiant d'un lieu Google (seule exception : ses coordonnées, 30 jours au plus, dans le cache serveur `place_coordinates` ; décisions 0027 et 0011), afficher des données Google sur une carte non Google.

Après :

> - Mettre une donnée Google dans un prompt, stocker autre chose que l'identifiant d'un lieu Google (exceptions : ses coordonnées, 30 jours au plus, dans le cache serveur `place_coordinates`, décisions 0027 et 0011 ; pour le prototype seulement, les temps de trajet Routes d'un programme de `p0Run`, côté serveur dans le schéma `prototype`, supprimés avec le programme, décision 0092), afficher des données Google sur une carte non Google.

## Conséquences

- Ouvrir un voyage du prototype dont toutes les paires sont conservées ne consomme aucun élément Routes ; seules les paires non couvertes par les matrices de l'exécution (énumérées par le test du § 5) et les programmes anciens consomment encore, à l'ouverture, une part du quota journalier de Samuel.
- Les programmes écrits avant la migration restent relus à chaque affichage, et s'affichent sans temps si Google refuse.
- Le studio enfreint sciemment, sur décision de Samuel, les conditions de Google Maps Platform pour le prototype ; la suspension de la clé est un risque accepté (ci-dessus).
- La note de version suivante liste cette décision (règle de Samuel, mécanisme du Tech Lead, défaut du § 2).

## Quand revoir cette décision

- Samuel décide du sort des temps de trajet pour le MVP (question 1), ou la validation juridique de Q5 tombe ;
- Google suspend ou menace de suspendre la clé ;
- la relecture n'est plus nécessaire à l'affichage (fin de la phase 0, ou fin du prototype : la table est supprimée avec le schéma `prototype`).
