# 0121 — Lot 2a (site web de l'activité) : place de la vérification et compteurs (T9), client réseau en mode « statut seulement » (T10), prompt `programme` v2 et jeu d'évaluation (T11) ; consignation de Q585 (restriction de l'`UPDATE` de `generation_runs`)

Statut : **acceptée**, décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle n'engage ni argent (aucune API payante : les requêtes vers les sites ne sont pas facturées ; `prototype/config/mode-reel.json`, `PLAFONDS_RELECTURE` et les parts du forfait inchangés), ni compte externe, ni donnée personnelle (l'adresse vient du modèle ; la requête ne porte rien du brief). Elle ne supprime ni ne désactive aucun test (§ 4.4 et § 5). Elle **ne tranche rien de la Sécurité** : S6 (contrôles contre la SSRF, confinement, plafonds, hôtes Google refusés, `User-Agent`, écarts du mode « statut seulement », libellé IDN) et S7 (compteurs du journal, amendement de 0117 § 1 point 5, ligne du texte copié) sont rendus par la **décision 0122**, écrite en parallèle par la Sécurité ; ce qui suit est l'architecture que la Sécurité juge, et **cède à 0122** sur tout point où elle la durcit (§ 6). Rien n'est réservé à Samuel dans ce lot (`specs/P0-programme-par-ia.md` § 11.9, « Samuel : aucune »).

Date : 2026-10-22 · Décideur : Tech Lead · Ticket : #678 · Spécification : `specs/P0-programme-par-ia.md` § 11 (amendement 2, lot 2a ; #674 fusionnée en `99cd384`, tête de branche `6a7539f` après la correction 1 : compteurs redéfinis, § 11.4 corrigé, A13 à A24), § 11.9 T9 à T11, PPI-PO-6 à PPI-PO-10 · Décisions liées : 0011, 0032 (A3.1, A7), 0035, 0056 § 3, 0072 § 5, 0093, 0096 § 1, 0111 § 5 et § 6, 0115, 0116 (§ 1 point 5, § 3, § 4.4, § 5, § 8), 0117 (§ 1 point 5, § 4), 0119, 0120 (S8, question 1), 0122 (à venir, Sécurité)

Faits relus pour cette décision : `main` `99cd384` (2026-10-22 10:20 UTC) ; #674 fusionnée (spécification du lot 2a, revue consolidée du head `a6d7a34`, correction 1 en `6a7539f`) ; #675 fusionnée en `03a3636` (migration 0016, revue consolidée du head `46b5781`, 2026-10-22 08:44 UTC).

Numérotation (relue le 2026-10-22 sur `main` `99cd384`) : `main` porte 0001 à 0117, 0119 et 0120 ; 0118 est réservée par 0116 ; aucune PR ouverte ; 0121 est attribuée par le ticket #678, 0122 à la Sécurité pour S6 et S7.

Numéros de la spécification : le ticket #678 résume T9 à T11 dans un autre découpage ; cette décision suit celui du § 11.9 de la spécification fusionnée : **T9** = place dans `p0Run`, transit des adresses, événement des compteurs **et** `GET` ou `HEAD` ; **T10** = client réseau et emplacement du module ; **T11** = prompt v2, jeu d'évaluation, tests du lot 1.

**N'amende pas** : 0011 (aucune donnée Google dans un prompt, un journal ou un état ; jamais `websiteUri` ni masque de champ élargi) ; 0116 (§ 3 : `etapeProgramme` reste l'étape unique de travail ; § 5 : texte copié du rapport) ; 0117 (§ 1 point 5 et § 4 : leur amendement éventuel est S7, donc 0122) ; 0120 (S8 : la restriction est appliquée, § 1 ci-dessous la consigne).

## Contexte

Le lot 1 a retiré l'agent de recherche web qui remplissait `Stop.source` ; Samuel veut de nouveau un lien vers le site officiel du lieu (spécification § 11.1). Le lot 2a fait proposer une adresse `site` par l'IA (prompt `programme` v2), la contrôle, l'envoie dans une requête bornée et n'écrit `Stop.source` que si la réponse finale est 2xx (§ 11.2 et § 11.3). La spécification pose trois questions au Tech Lead (§ 11.9) et une à la Sécurité pour chaque risque réseau ou journal (S6, S7).

Par ailleurs, la relecture de #675 (migration 0016) a répondu **oui** à Q585 (question 1 de 0120) et demandé de consigner la réponse dans `docs/decisions/` (revue consolidée de #675, « Réponses aux questions de la PR »).

Faits relus dans le code, qui fondent les choix :
- **`p0Run` n'a qu'une étape de travail** : `etapeProgramme` (`src/workflows/p0-run.ts`, l. 612 à 724, `"use step"` l. 613), puis `etapeClore` en cas d'arrêt (l. 731, l. 749 à 759). Dans l'étape, tout reste **en mémoire** jusqu'à l'écriture : rédaction et lecture tolérante (l. 641), ordre écrit (l. 647), phase `ancrage` (l. 652), logements, réserve de trajets (l. 667), vérification des lieux par `verifierLieuxDuProgramme`, boucle **séquentielle** contrôlée avant chaque appel (l. 678 ; `src/grounding/ancrage-zone.ts`, l. 119 à 141), trajets (l. 681 et suivantes), assemblage (l. 702), écriture (l. 716). L'état sérialisé est `{ runId }` seul (l. 104 ; règle 4 de l'en-tête, l. 83 à 86).
- **`p0.programme_written` n'est pas écrit « en fin de rédaction »** comme le dit le § 11.9 (T9) : il est écrit **une fois, en fin d'étape**, après l'écriture du programme (`journaliserProgramme(compteurs)`, l. 722), ou dans le `catch` si l'étape lève (l. 719, `warn` et `errorName`). Ses compteurs sont le type `CompteursProgramme` (l. 564 à 574) et la liste fermée de `src/server/log.ts` (événement l. 38, champs l. 166 à 177) ; le test `la liste des événements est fermée` (`tests/unit/server/limiteur.test.ts`, l. 381 et suivantes) fixe les événements, et l'`it.each` des l. 348 à 358 fixe les champs.
- **`src/research/fetch-page.ts`** est le seul module de lecture des pages : `analyserUrl` (l. 126 à 147 : `https`, port 443, sans identifiants, ni IP littérale ni hôte entre crochets, `%` refusé dans l'autorité, nom d'hôte normalisé par `URL`, fragment retiré), boucle de résolution, contrôle de **toutes** les adresses (`adresseAutorisee`, l. 255), connexion à l'adresse vérifiée, redirections à la main, 3 au plus (l. 246 à 282), délai total `DELAI_MAX_MS` = 10 s (l. 24, l. 242), en-têtes fixes `user-agent`, `accept`, `accept-encoding` (l. 117 à 121). Il exige `urlsAutorisees` (l. 245), n'admet que le statut **200** (l. 283), filtre `TYPES_CONTENU_ADMIS` (l. 36, l. 285) et refuse au-delà de 2 Mio (`too_large`, l. 23, l. 188).
- **`src/research/undici-transport.ts`** : `GET` écrit en dur (l. 97), en-têtes filtrés sur trois noms (l. 26, l. 92 à 93), un `Agent` épinglé par saut, fermé par `fermer` (l. 87 à 90) ; la barrière de sortie (`verifierSortie`, l. 72 à 84) renvoie `refus` **sans résolution ni connexion**. Il est construit par la seule composition (`src/server/composition/p0-reel.ts`, l. 17 et l. 158, famille `agent()`) ; la famille `programme()` (l. 176 à 187) ne l'utilise pas encore.
- **`src/research/ip-guard.ts`** : « importé seulement par `fetch-page.ts` (et son test) » (l. 4 à 5) ; seul module admis pour `node:net` (`eslint-rules/ia-recherche-imports.mjs`, `CAPACITES` ; ligne de `tests/unit/confinement/listes/capacites.ts`, l. 121).
- **Imports** : sous `src/research`, les fichiers de `src/ai` et de `src/research` sont admis ; `src/ai` n'importe pas `src/research` (`eslint-rules/ia-recherche-imports.mjs`, en-tête). `src/ai/sorties.ts`, `src/research/fetch-page.ts` et `src/server/p0/assemblage.ts` sont chargés par `pnpm p0` sous Node nu (exceptions nominatives de `ligne/require-server-only`, `eslint.config.mjs`, l. 596 à 655 ; liste fermée vérifiée par `tests/unit/lint/p0-server-modules-lint.test.ts`).
- **Prompt** : `PROMPT_PROGRAMME` est en `version: 1` (`src/ai/prompts/programme.ts`, l. 16) et dit « Aucune URL, aucun nom de site web, aucune balise dans les textes. » (l. 24). Il **n'a pas de ligne** dans la table d'empreintes de `tests/unit/ia/prompts-versionnes.test.ts` (`EMPREINTES`, l. 19 à 36 ; `PROMPTS`, l. 39), alors que le titre du test l. 49 dit « chaque prompt de src/ai/prompts a sa ligne » : écart du lot 1, corrigé par addition au § 4.3. Empreinte SHA-256 du texte v1 sur `main` `99cd384` : `7f3ac2bcbebf9331d2038fd558d4b8b2b5649fb978b5ca27c82e8b2fd0feea76`.
- **Jeu d'évaluation** : `evals/programme/rome-1.json`, `edimbourg-1.json` (sorties simulées du prompt v1) et `config.json` (seuils), lus par `tests/unit/evals/programme.test.ts` ; `charger` exige `champsRetires: 0` (l. 48 à 50) ; le test des l. 171 à 181 vérifie que seuils et incontournables ne sont ni dans le prompt ni dans le code de production.
- **Clé `url` proposée par l'IA** : ignorée et comptée (`tests/unit/p0/programme-ia.test.ts`, l. 81 à 87, `champsRetires` = 3).
- **Assemblage** : `assemblerProgrammeIa` (`src/server/p0/assemblage.ts`, l. 387) construit chaque `Stop` sans `source` (l. 432 à 452) ; la fonction `domaine` (l. 69 à 71) sert déjà l'ancienne chaîne ; `SourceReduiteSchema` (`src/prototype/programme-reduit.ts`, l. 69 à 72) admet `{ label, url }` sans `verifiedAt`.

## 1. Q585 — Restriction de l'`UPDATE` de `vadrouille_app` sur `generation_runs` : **oui, étendue** (consignation)

**Réponse** (donnée à la relecture de #675, le 2026-10-22, consignée ici) : **oui**. L'exclusion de l'`UPDATE` exigée par 0120 S8 (`base_version`, `deck_closure_id`) est **étendue** à `kind`, `organization_id`, `trip_id`, `request_id`, `started_at` et `id`.

Motifs : aucune requête `UPDATE public.generation_runs` de `src/` n'écrit ces colonnes (relevé de #675 : 26 requêtes, dix colonnes) ; ce sont des colonnes d'identité (`id`), de portée de la RLS et des clés étrangères composées (`organization_id`, `trip_id`), d'idempotence (`request_id`, index unique partiel de `db/migrations/0012_creation_voyage.sql`, l. 133), de nature de l'exécution (`kind`, lu par la purge) et d'horodatage d'origine (`started_at`) ; les figer ne coûte rien et ferme une voie de changement de portée d'une ligne.

**Appliquée** par la migration `db/migrations/0016_restriction_update_generation_runs.sql` (#675, fusionnée en `03a3636` le 2026-10-22 08:56 UTC) : `REVOKE UPDATE` de table (l. 28), puis `GRANT UPDATE` sur exactement dix colonnes : `workflow_run_id`, `phase`, `stop_reason`, `last_version`, `updated_at`, `finished_at`, `step`, `step_seq`, `person_retry_request_ids`, `studio_retries` (l. 30) ; colonnes exclues listées l. 17 à 19. Le commentaire « appliquée par défaut, au Tech Lead à la relecture » (l. 18 à 19) est désormais tranché par cette décision ; la migration est figée par empreinte et ne se corrige pas.

**Garde-fou, règle pour toute PR future** :
1. `tests/support/releve-generation-runs.ts` relève dans `src/` chaque `UPDATE public.generation_runs SET … WHERE` (gabarit littéral) et **échoue** sur toute autre forme (alias, Drizzle `.update(generationRuns)`, `INSERT … DO UPDATE`). Il est partagé par `tests/unit/db/migration-restriction-update.test.ts` (`pnpm test` : chaque colonne écrite est accordée, aucune colonne figée n'est accordée) et par `tests/db/restriction-update-generation-runs.test.ts` (job `db` de la CI : chaque `UPDATE` relevé est rejoué sous `vadrouille_app`, une écriture de colonne exclue est refusée en `42501`). Les deux restent exigés ; le second couvre le SQL que le relevé ne voit pas (mineur 2 de la revue de #675).
2. **Toute nouvelle colonne écrite par un `UPDATE` de `src/`** (colonne existante non accordée, ou colonne nouvelle d'une migration) **exige une migration de droits** du rôle data, dans le même cycle que la PR qui l'écrit ou avant elle : `GRANT UPDATE (<colonne>)` à `vadrouille_app`, mise à jour de la liste attendue du test de forme, passage par `MIGRATIONS_APPROUVEES` de `db-migrate` avec l'`owner-approved` de Samuel seul (0035, 0056 § 3). Une PR de code qui ajoute une telle écriture sans cette migration est en échec à `pnpm test` : c'est voulu, on ne contourne ni n'assouplit le relevé.
3. **Rouvrir une colonne exclue** (par exemple `base_version` pour une reprise d'un recalcul échoué, 0120 « Quand revoir ») demande en plus une décision écrite et un nouveau verdict de la Sécurité.
4. Une ligne de `db/README.md` rappelant la règle du point 2 est souhaitable (mineur 2 de #675) : à faire par la prochaine PR data qui touche ce fichier, sans ticket propre.

Reste à faire, hors de cette décision : la ligne de `0016_restriction_update_generation_runs` dans `MIGRATIONS_APPROUVEES` (`.github/workflows/db-migrate.yml` ne porte que 0015, l. 111) : PR de workflow à part, revue par la Sécurité contre G1 à G6, `owner-approved` de Samuel (0120 S8 point 4 ; mineur 4 de #675). Échéance de la Sécurité inchangée : appliquée avant toute PR qui rend un recalcul réel possible.

## 2. T9 — Place de la vérification dans `p0Run`, transit des adresses, événement des compteurs, `GET` seul

### 2.1 Dans `etapeProgramme`, phase `ancrage`, en parallèle de la vérification des lieux

Retenu : la proposition de la spécification. La vérification des sites a lieu **dans l'étape unique `etapeProgramme`**, pendant la phase `ancrage`, **en parallèle** de `verifierLieuxDuProgramme` :
1. après `ordreEcrit` (l. 647), une fonction pure tire du programme la **liste des adresses distinctes réduites, dans l'ordre écrit** (jours, puis créneaux), et le nombre de sites de forme invalide (§ 3.3) ; l'ordre écrit fixe, de façon déterministe, quelles adresses sont soumises sous le plafond de 80 (les 80 premières) ;
2. après le calcul de la réserve de trajets (l. 667), juste avant l'appel de la l. 678, l'étape lance `verifierSites(…)` sans l'attendre, puis attend les deux : `const [issue, sites] = await Promise.all([verifierLieuxDuProgramme(…), verifierSites(…)])` ; les deux n'ont aucune donnée en commun (PPI-PO-10, A20) ;
3. au moment de construire `jours` (l. 683), chaque créneau perd toujours le `site` lu et ne reçoit que l'adresse réduite **gardée** (`sites.gardees.has(adresse)`) ; l'assemblage écrit alors `Stop.source` (§ 3.5) ;
4. si `verifierLieuxDuProgramme` lève, l'étape **abandonne** les vérifications de sites en cours (signal d'abandon, § 3.4) et attend leur fin avant de journaliser ; `verifierSites` ne rejette jamais (toute erreur d'une adresse est un refus de cette adresse).

Écartés : une étape propre (une frontière sérialisée de plus ; les adresses devraient passer par la base, § 2.2 ; une étape rejouée n'a pas de relance, `maxRetries = 0`) ; `etapeFinale`, qui n'existe plus dans `p0Run` depuis 0116 § 3 ; après les trajets, juste avant l'écriture (même résultat, mais jusqu'à 60 s ajoutées à la durée de l'étape au lieu d'un recouvrement avec les Text Search séquentielles).

**Temps** : la vérification ne doit jamais prendre la place des trajets ni de l'écriture. Sa borne est `limiteSites = min(début + 60 s, contexte.echeance − reserveTrajetsMs)`, calculée une fois au lancement ; une adresse n'est soumise que si `maintenant + 5 s + MARGE_VERIFICATION_AGENT_MS` (l. 143) tient avant `limiteSites` ; sinon elle reste non soumise (`sitesUnchecked`, § 11.3 point 5). Ce n'est **pas** un arrêt (PPI-PO-9).

### 2.2 Transit : en mémoire seulement

Les adresses restent **en mémoire de l'étape**, comme le programme, les identifiants et les fiches (en-tête de `etapeProgramme`, l. 593 à 596) : jamais dans l'état sérialisé (`{ runId }`), jamais dans `prototype.work` (table de travail inutile ici, puisqu'aucune frontière d'étape n'est franchie), jamais dans un journal, une trace ou un prompt. Seule l'adresse réduite **gardée** atteint la base, dans `Stop.source` du programme stocké, purgé avec lui (§ 11.3, « Ce qui est écrit »). Rien de la réponse n'est gardé, même en mémoire, au-delà du verdict de l'adresse.

### 2.3 Compteurs sur `p0.programme_written`, aucun événement nouveau

Les quatre compteurs `sitesProposed`, `sitesChecked`, `sitesRemoved`, `sitesUnchecked` (§ 11.5) s'ajoutent à **`p0.programme_written`** : c'est déjà l'événement de **fin** de l'étape où la vérification a lieu (l. 722), écrit aussi en échec (l. 719). Aucun événement nouveau n'entre dans `LOG_EVENTS` (le test de liste fermée reste inchangé). Concrètement :
- `CompteursProgramme` (`src/workflows/p0-run.ts`, l. 564 à 574) et la liste des champs de `src/server/log.ts` (l. 166 à 177) gagnent les quatre noms, entiers positifs ou nuls ; le commentaire de l'événement (l. 34 à 37) les cite ; **sous réserve de S7 (a)**, que 0122 rend ;
- l'`it.each` de `tests/unit/server/limiteur.test.ts` (l. 348) gagne les quatre noms (addition) ; le test « aucun compteur de verdict » (l. 360 à 366) reste et ne change pas : les `sites*` comptent nos propres requêtes, jamais un verdict Google ;
- en échec, les compteurs écrits sont ceux connus au moment de l'erreur ; une vérification abandonnée par l'erreur suit la règle des vérifications en cours (§ 11.3 point 4 : `sitesChecked` et `sitesRemoved`), si bien que les relations du § 11.5 restent vraies dans la ligne de journal ;
- **barrière de sortie fermée** (production, hors mode réel, proxy ; `refus` du transport) : **aucune adresse n'est soumise**, aucune résolution ni connexion ; toutes sont vidées et comptées `sitesUnchecked`. Une soumission suppose que la vérification de l'adresse a pu commencer ; la barrière est une propriété de l'environnement, pas de l'adresse. Les relations du § 11.5 restent vraies (`sitesChecked` = 0). Point d'interprétation du § 11.3 point 4, signalé au Product Owner (questions) et à la Sécurité (S7).

Le texte du § 11.9 qui place `p0.programme_written` « en fin de rédaction, avant la vérification » est inexact (fait relu ci-dessus) ; il ne change pas la réponse. Le Product Owner peut le corriger à la prochaine retouche de la spécification.

### 2.4 `GET` seul, jamais `HEAD`

Retenu : **une requête `GET`** par saut, sans `HEAD` préalable. Motifs :
- beaucoup de serveurs répondent mal à `HEAD` (405, 404, 403, ou un statut différent du `GET`) : un `HEAD` refusé ferait vider des sites valides, ou exigerait un second envoi, donc deux requêtes par adresse et une logique de repli ;
- le corps n'est **pas lu** (§ 3.2 point 4) : le coût d'un `GET` est celui des en-têtes de réponse, la connexion est fermée dès le statut reçu ;
- le transport n'émet que `GET` (`undici-transport.ts`, l. 97) : `HEAD` demanderait un paramètre de méthode dans un module de capacité réseau, donc une surface nouvelle à juger par la Sécurité, pour aucun gain.

## 3. T10 — Client réseau : `fetch-page.ts` réutilisé, point d'entrée « statut seulement » ; orchestration dans `src/server/p0/sites.ts`

### 3.1 Retenu : une seule garde, dans `src/research/fetch-page.ts`

Le contrôle d'une adresse et de ses redirections vit dans **`src/research/fetch-page.ts`**, qui reste le **seul** module à appeler une `CoucheHttp`. Écarté : un client minimal sur `ip-guard.ts`, qui recopierait la normalisation (`analyserUrl`), l'épinglage, la boucle de redirections et la course au délai, et ouvrirait un second importateur de `ip-guard.ts` (contraire à son en-tête, l. 4 à 5, et à la ligne de confinement de 0040).

`fetch-page.ts` reçoit :
1. **une boucle privée de saut et de redirections** (`suivre`), extraite de `lire` sans en changer le comportement : `analyserUrl`, résolution, `adresseAutorisee` sur **toutes** les adresses, connexion à l'adresse vérifiée, `REDIRECTIONS` et `REDIRECTIONS_MAX`, `fermer` à chaque saut ; un paramètre de contrôle supplémentaire par saut (le refus des hôtes Google, utilisé par le seul mode « statut seulement ») ;
2. **un point d'entrée dédié**, `creerVerificateurStatut(dependances: DependancesLecteur)`, qui rend `verifier(adresse, signal?) → { ok: true } | { ok: false; raison }` ; la raison est de la liste fermée `RAISONS_REFUS_PAGE`, pour les tests du module seulement : l'appelant (§ 3.4) la **jette** sans l'écrire ni la journaliser (§ 11.3 point 4) ; un motif nouveau, s'il en faut un, est soumis à 0122 ;
3. **une fonction de forme**, `reduireSite(brut) → string | undefined`, fondée sur `analyserUrl` (même garde que les sauts), plus : paramètres (`search`) et fragment retirés, 300 caractères au plus après réduction, hôte Google refusé ; elle rend l'adresse réduite ou `undefined` ;
4. **la liste fermée des hôtes Google refusés** et sa fonction `estHoteGoogle(hote)` (`google.<tld>` et ses sous-domaines, `goo.gl`, `g.page`, `g.co`, selon le § 11.3 point 1) : constante du module, **contenu tenu par la Sécurité** (0122 la fixe ou la confirme) ; elle sert à la forme de l'adresse de l'IA **et** à chaque redirection ;
5. des **constantes propres au mode**, à côté de celles de la lecture (A3.1 de 0032 : une garde ne s'assouplit pas par configuration) : `DELAI_STATUT_MS = 5_000` (redirections comprises), statut final admis `200` à `299`.

`lire` (lecture de pages de la recherche) **ne change pas** : `urlsAutorisees`, statut 200, `TYPES_CONTENU_ADMIS`, 2 Mio, 10 s, et ses tests (`src/research/fetch-page.test.ts`) passent sans modification (A23).

### 3.2 Les quatre écarts du mode « statut seulement » (A23), et le reste à l'identique

1. **pas d'`urlsAutorisees`** : l'adresse vient de la sortie de l'IA, contrôlée par `reduireSite` avant la soumission ;
2. **type de contenu ignoré** : `content-type` et `content-encoding` ne sont pas lus ;
3. **5 s** au plus par adresse, redirections comprises, au lieu de 10 s ; un signal externe (fin des 60 s, abandon de l'étape) coupe aussi la vérification (`AbortSignal.any`) ;
4. **corps jamais lu** : la garde appelle `fermer()` dès le statut reçu, aussi pour un 2xx ; zéro octet du corps n'est consommé, donc a fortiori 64 Kio au plus (le § 11.3 admet « ou pas du tout ») ; il n'existe ni décompression ni `too_large` dans ce mode.

En-têtes envoyés : `user-agent`, `accept`, `accept-encoding`, et rien d'autre (le transport filtre déjà sur ces trois noms, l. 26). Valeurs : `accept: */*` (le type est ignoré), `accept-encoding: identity` (le corps n'est pas lu) ; `user-agent` : la constante `USER_AGENT` de `fetch-page.ts` (`PrototypeRecherche/1.0`) **par défaut**, la valeur finale étant S6, donc 0122. Statut de redirection (`301`, `302`, `303`, `307`, `308`) sans `location`, ou toute autre réponse hors 2xx en fin de chaîne : refus. Un `3xx` final après la troisième redirection : refus (`too_many_redirects`).

### 3.3 Lecture tolérante : `site` lu brut par `lireProgramme`, forme contrôlée par `reduireSite`

`src/ai` n'importe pas `src/research` (fait relu). Pour ne tenir **qu'une** analyse d'adresse :
- `lireProgramme` (`src/ai/sorties.ts`, l. 688) lit `site` comme une **chaîne** de 2 048 caractères au plus, sur un créneau **avec `lieu`** seulement ; sinon (pas une chaîne, trop longue, créneau sans lieu) : champ retiré, `champsRetires` + 1, comme tout champ facultatif invalide ; `CreneauIa` gagne `site?: string` (adresse brute de l'IA, jamais écrite telle quelle) ; aucune autre règle de `sorties.ts` ne change (`contientUrl` reste entier pour tous les autres champs, A15) ;
- la fonction pure qui tire les adresses du programme (`src/server/p0/sites.ts`, § 3.4) applique `reduireSite` à chaque `site` lu ; un échec ajoute 1 à `fieldsRemoved` (compteur existant, § 11.3 point 1, A14) et le champ est retiré ; le compteur `fieldsRemoved` du journal est donc la somme des retraits de `lireProgramme` et des formes de site refusées.

### 3.4 Orchestration : `src/server/p0/sites.ts`

Nouveau module **`src/server/p0/sites.ts`** (`import "server-only"`, règle de son dossier ; **pas** chargé par `pnpm p0`, § 3.6), sans entrée-sortie propre : il reçoit le vérificateur et l'horloge.
- `sitesDuProgramme(programme)` → `{ adresses: readonly string[]; formesRefusees: number }` : adresses distinctes réduites, ordre écrit, dédoublonnées (Roscioli à midi et le soir : une seule) ;
- `verifierSites(adresses, verifier, { limite, maintenant, refusGlobal })` → `{ gardees: ReadonlySet<string>; compteurs: { sitesProposed; sitesChecked; sitesRemoved; sitesUnchecked } }` ; constantes du module : `SITES_MAX = 80`, `SITES_SIMULTANES = 8`, `SITES_DUREE_MAX_MS = 60_000` (constantes, sauf avis contraire de 0122 ; aucune variable d'environnement, aucune valeur de `mode-reel.json`) ;
- règles : au plus 8 vérifications en cours ; au plus 80 adresses soumises ; une adresse n'est soumise que si son délai entier tient avant la limite (§ 2.1) ; à la limite, les vérifications en cours sont **abandonnées** et comptées `sitesChecked` et `sitesRemoved` ; les non soumises sont `sitesUnchecked` ; `refusGlobal` (barrière fermée) : rien n'est soumis (§ 2.3) ; relations du § 11.5 vraies par construction et vérifiées par les tests (A19, A20) ;
- aucune adresse, aucun nom d'hôte, aucune raison ne sort du module, hors de l'ensemble `gardees` en mémoire.

**Câblage** : la famille `programme()` de `src/server/composition/p0-reel.ts` (l. 176 à 187) gagne `verifierSite`, construit par `creerVerificateurStatut(createUndiciTransport())` ; `CapacitesProgramme` (l. 104 à 110) gagne ce champ. `undici-transport.ts` n'a **aucun importateur nouveau** (la composition l'importe déjà, l. 17) ; aucun paquet nouveau ; `ip-guard.ts` reste importé par `fetch-page.ts` seul. `p0-run.ts` ne fait que câbler (règle de son en-tête, l. 66 à 74).

### 3.5 Écriture de `Stop.source`

`assemblerProgrammeIa` (`src/server/p0/assemblage.ts`) écrit, pour un créneau qui porte une adresse gardée, `source: { label, url }` : `url` = l'adresse réduite **de l'IA** (jamais l'adresse finale d'une redirection, PPI-PO-7) ; `label` = `new URL(url).hostname` sans le préfixe `www.`, coupé à `LONGUEURS.libelle` (120), forme ASCII rendue par `URL` (punycode pour un IDN, jamais reconverti ; S6 le juge). La fonction `domaine` (l. 69 à 71) peut porter ce calcul. Aucune modification de `src/contracts`, de `ReasonBlock`, de `StopSheet` ni de `ProposalDetailSheet` (§ 11.4).

### 3.6 `pnpm p0` (mode simulé hors workflow) : aucune vérification

`scripts/p0/pipeline.ts` (`executerProgramme`, l. 422) lit le même prompt et la même lecture, mais **ne vérifie aucun site** : il n'importe ni `src/server/p0/sites.ts` ni le point d'entrée « statut seulement », aucun `site` n'atteint son assemblage, aucun `source` n'est écrit, et ses compteurs `sites*` ne sont pas écrits. Motifs : aucune requête réelle possible par construction dans `pnpm p0` (A22) ; pas de nouvelle exception nominative à `ligne/require-server-only` ; les critères A16 à A24 visent `p0Run` et sont prouvés par ses tests avec un vérificateur simulé (§ 5). Écarté : des fixtures de statut simulé pour le CLI (`src/research/pages.simule.ts`), sans gain de mesure pour l'essai de Samuel, qui se fait sur `p0-reel`.

### 3.7 Confinement

- **Aucune capacité nouvelle** : aucun import nouveau de `node:net`, `node:dns/promises`, `undici` ni `@/server/env/egress` ; `src/server/p0/sites.ts` n'importe que des types et des fonctions pures ; aucune ligne nouvelle dans `tests/unit/confinement/listes/capacites.ts` ni `paquets.ts`.
- **Textes à mettre à jour, sans changement de règle** : l'usage de la ligne `src/research/undici-transport.ts` (`capacites.ts`, l. 432 et suivantes) et l'en-tête de `undici-transport.ts` et de `fetch-page.ts` (« seul module de lecture des pages ») mentionnent la vérification de statut des sites de `p0Run` ; l'en-tête de `p0-reel.ts` (l. 40 à 42) cite `verifierSite` dans la famille `programme()`.
- **Un seul émetteur** : `fetch-page.ts` reste le seul module qui appelle une `CoucheHttp` ; un test du lot le vérifie (aucun autre fichier de `src/` n'importe le type `CoucheHttp` hors des transports, des doubles simulés et de la composition). Faut-il une règle de lint en plus : S6, donc 0122.

## 4. T11 — Prompt `programme` v2, jeu d'évaluation, tests du lot 1 adaptés sans suppression

### 4.1 Prompt v2

`PROMPT_PROGRAMME` passe en **`version: 2`** (`src/ai/prompts/programme.ts`). Changements, et seulement ceux-là :
- la consigne « Aucune URL, aucun nom de site web, aucune balise dans les textes. » (l. 24) devient : aucune URL, aucun nom de site web ni aucune balise **dans les textes**, la **seule** adresse admise étant le champ `site` ;
- une consigne sur `site`, reprise du § 11.2 : seulement pour un créneau avec `lieu`, seulement si l'IA connaît l'adresse du site **officiel** du lieu (le sien, ou celui de l'institution qui le gère), sinon omettre le champ ; jamais un moteur de recherche, une carte, un réseau social, un site d'avis ou de réservation tiers ; adresse `https` complète, sans paramètres ;
- la description du créneau (l. 26) gagne `"site" (facultatif)` ; la ligne des longueurs (l. 27) gagne « site 300 ».
L'**entrée** du prompt ne change pas (`entreeProgrammeDepuisBrief`) : aucune donnée Google (A9, A13). Aucun nom d'incontournable ni aucune adresse d'exemple réelle n'entre dans le texte (P0S2-PO-19 ; test des l. 171 à 181 de `tests/unit/evals/programme.test.ts`) : la forme se dit en mots, pas par `https://colosseo.it/`. Le texte exact est écrit par le rôle ia dans la PR de code et relu par le Tech Lead.

### 4.2 Jeu d'évaluation hors réseau (`evals/programme/`)

- `rome-1.json` et `edimbourg-1.json` : leur champ `cas` dit « prompt `programme` v2 » ; des créneaux avec `lieu` reçoivent `site` : adresses officielles plausibles écrites à la main, **et** des cas refusés à la forme (au moins : `http:`, hôte Google, IP littérale, port autre que 443, et une adresse avec `?…` et `#…` qui doit être **gardée réduite**) ; un même site cité par deux créneaux (dédoublonnage) dans au moins un des deux fichiers ;
- chaque fichier gagne un bloc `attendu` : `{ "sitesProposes": n, "sitesFormeInvalide": m }` (valeurs écrites à la main) ;
- `tests/unit/evals/programme.test.ts` : `charger` garde son assertion `champsRetires: 0` (elle reste vraie, `site` étant lu brut par `lireProgramme`, § 3.3) ; un `it` **ajouté** (`evals: sites proposés lus et réduits, aucune donnée Google`) applique `sitesDuProgramme` à la sortie lue et compare au bloc `attendu`, et vérifie que chaque adresse gardée est sans `?` ni `#` ;
- le jeu prouve le schéma et la mesure, pas la qualité ; il ne fait **aucune** requête (les statuts relèvent des tests de `sites` avec couche HTTP simulée) ; `config.json` ne change pas (aucun seuil de part de sites : § 11.6, dernier paragraphe).

### 4.3 Tests du lot 1 : adaptés par addition, aucun supprimé ni désactivé

- `tests/unit/ia/prompts-versionnes.test.ts` : `PROMPT_PROGRAMME` **entre** dans `PROMPTS` et dans `EMPREINTES` avec ses **deux** lignes : `1: "7f3ac2bcbebf9331d2038fd558d4b8b2b5649fb978b5ca27c82e8b2fd0feea76"` (texte v1, historique des mesures du lot 1) et `2: "<empreinte du texte v2>"`. Le test « chaque prompt de src/ai/prompts a sa ligne » devient vrai pour `programme`.
- `tests/unit/p0/programme-ia.test.ts`, l. 81 à 87 (`url`, `placeId`, `lat` ignorés, `champsRetires` = 3) : **inchangé et passant** (A15 : `url` n'est pas `site`). Ajouts : `site` sur un créneau sans lieu retiré et compté ; `site` non chaîne ou trop long retiré et compté ; URL dans `pourquoi`, `conseil`, `prix`, `horaires`, `bonsPlans` ou `lieu` toujours refusée (cas A11 existants repris).
- `tests/unit/server/limiteur.test.ts` : quatre noms ajoutés à l'`it.each` des l. 348 à 358 (§ 2.3).
- `tests/unit/workflows/p0-run-finale.test.ts`, test `journal: compteurs indépendants de l'ancrage` (l. 762) : **étendu** (A20) : même double de vérificateur dans les deux exécutions, mêmes requêtes de sites, mêmes `source` écrites, mêmes `sites*`, relations du § 11.5 vérifiées ; la comparaison champ par champ existante reste.
- Les doubles de `composerP0Reel` des tests de `p0Run` (`tests/unit/workflows/p0-run.test.ts`, `p0-run-finale.test.ts`) gagnent un `verifierSite` simulé ; un test qui ne s'intéresse pas aux sites reçoit un double qui refuse tout **sans appel** : ses assertions existantes ne changent pas, sauf l'ajout des quatre compteurs dans une ligne de journal attendue en égalité stricte, le cas échéant.
- `src/research/fetch-page.test.ts` : **inchangé et passant** (A23, `lire` intact) ; les tests du mode « statut seulement » vont dans un fichier à part (§ 5), pour ne pas toucher aux exceptions d'imports de ce test (`EXCEPTIONS_TESTS` de `eslint-rules/ia-recherche-imports.mjs`).

## 5. Tests du lot 2a : emplacement et noms

Noms indicatifs de la spécification gardés ; emplacements :

| Critère | Fichier | Contenu |
|---|---|---|
| A13 | `tests/unit/ia/prompts-versionnes.test.ts` ; `tests/unit/ia/prompts-sentinelles.test.ts` | empreinte v2 ; `journalDePrompts` de la requête `programme` sans identifiant, nom, position ni adresse Google |
| A14, A15 | `tests/unit/p0/programme-ia.test.ts` (lecture) ; `src/research/statut-site.test.ts` (`reduireSite`) | formes refusées, réduction, `fieldsRemoved` ; URL hors `site` refusée |
| A16, A17, A18, A23 | `src/research/statut-site.test.ts` | `creerVerificateurStatut` avec résolveur et couche HTTP simulés (`pages.simule.ts`), horloge simulée : hôte privé sans appel HTTP ; redirections ; 2xx seulement, `application/pdf` et `image/png` gardés ; 6 s : vidé ; corps de 3 Mio non lu ; trois en-têtes seulement |
| A19 | `tests/unit/p0/sites.test.ts` | `verifierSites` : 100 adresses, 80 soumises, 20 `sitesUnchecked` ; doublon : une requête ; jamais plus de 8 en cours ; épuisement des 60 s avec vérifications en cours ; barrière fermée : tout `sitesUnchecked` ; relations du § 11.5 |
| A20 | `tests/unit/workflows/p0-run-finale.test.ts` | extension du test de la l. 762 (§ 4.3) |
| A21 | `tests/db/prototype.test.ts` (base jetable) ; tests de composant de `StopSheet` et `ProposalDetailSheet` | `Stop.source` écrit depuis le site gardé, sans `verifiedAt` ; lien, `target="_blank"`, `rel="noopener noreferrer"`, aucune date |
| A22 | `tests/unit/p0/sites.test.ts` ; `tests/unit/workflows/p0-run-finale.test.ts` ; test existant du masque de champ Places | ni statut, ni en-tête, ni adresse de redirection dans le programme écrit, l'état ou le journal (sentinelles) ; barrière fermée : zéro résolution, zéro connexion |
| A24 | `tests/unit/p0/rapport.test.ts` (module `src/server/p0/rapport.ts`) | étapes avec `source` à la lecture ; texte copié inchangé tant que 0122 n'admet pas la ligne oui ou non |

Le nom `src/research/statut-site.test.ts` est celui d'un test du module `fetch-page.ts` ; s'il doit relire la source ou compresser une réponse, il demande sa propre exception nominative (aucune n'est prévue : il n'en a pas besoin).

## 6. Ce que cette décision attend de la Sécurité (décision 0122), sans le trancher

Cette décision fixe l'architecture que 0122 juge ; sur chaque point ci-dessous, **0122 prévaut** et la PR de code applique sa version :
1. **S6, contrôles** : suffisance de `analyserUrl` + `adresseAutorisee` sur toutes les adresses + épinglage + redirections contrôlées contre la SSRF et le rebinding DNS ; port, schémas, IP littérales, `%` dans l'autorité.
2. **S6, confinement** : `fetch-page.ts` seul émetteur (§ 3.7) suffit-il, ou faut-il une règle de lint ou de dépendances de plus ?
3. **S6, plafonds** : 80 adresses, 8 simultanées, 5 s, 60 s, corps non lu (au lieu de 64 Kio) ; constantes (§ 3.1 point 5, § 3.4).
4. **S6, hôtes Google** : contenu de la liste fermée (§ 3.1 point 4) et son application aux redirections.
5. **S6, adresse et en-têtes** : réduction (paramètres et fragment) suffisante contre une fuite par l'adresse ; `user-agent` (`PrototypeRecherche/1.0` par défaut, ou une valeur propre) ; `accept: */*` et `accept-encoding: identity`.
6. **S6, libellé IDN** en punycode.
7. **S7 (a)** : les quatre compteurs sur `p0.programme_written` (§ 2.3), et le compte de la barrière fermée en `sitesUnchecked`.
8. **S7 (b)** : amendement de 0117 § 1 point 5 (`site`, seule voie d'une adresse de l'IA vers `Stop.source`).
9. **S7 (c)** : ligne oui ou non « liens vers les sites affichés » du texte copié (A24).

**La PR de code du lot 2a ne fusionne pas avant 0122.**

## Ce que cette décision ne tranche pas

- Les verdicts S6 et S7 (§ 6, décision 0122, Sécurité).
- Les règles de produit du lot 2a (Product Owner, PPI-PO-6 à PPI-PO-10) et l'interprétation du § 11.3 point 4 pour la barrière fermée, retenue ici pour le code et soumise au Product Owner (question 2).
- L'ordre des tâches (CEO) : ticket de code du lot 2a, PR de workflow de la ligne 0016 dans `MIGRATIONS_APPROUVEES`.
- Ce qui est réservé à Samuel : l'`owner-approved` de la ligne 0016 de `MIGRATIONS_APPROUVEES` ; l'essai réel de `rome-1` sur `p0-reel` (critère de réussite du § 11.1).

## Conséquences

- Le ticket de code du lot 2a (rôle ia-recherche, commits `[ia]`) suit les § 2 à § 5 ; la PR liste, dans sa description, chaque écart à cette décision et chaque point où elle applique 0122.
- Fichiers que la PR touchera (prévision) : `src/ai/prompts/programme.ts`, `src/ai/sorties.ts`, `src/research/fetch-page.ts`, `src/server/p0/sites.ts` (nouveau), `src/server/p0/assemblage.ts`, `src/server/p0/rapport.ts`, `src/server/composition/p0-reel.ts`, `src/workflows/p0-run.ts`, `src/server/log.ts`, `evals/programme/*.json`, tests listés au § 4.3 et au § 5, textes d'usage de `tests/unit/confinement/listes/capacites.ts`. Ni `db/`, ni `src/contracts`, ni l'interface, ni `prototype/config/`.
- Q585 est répondue et consignée (§ 1) ; toute PR future qui écrit une colonne de `generation_runs` non accordée applique le § 1 points 2 et 3.

## Questions ouvertes (à reporter par le CEO dans `QUESTIONS.md`)

1. **Sécurité** (bloque la fusion de la PR de code du lot 2a, pas celle-ci) : les neuf points du § 6, rendus par la décision 0122.
2. **Product Owner** (ne bloque pas ; défaut appliqué par le code) : barrière de sortie fermée (production, hors mode réel, proxy) : aucune adresse n'est soumise, toutes sont comptées `sitesUnchecked` (§ 2.3), alors que le § 11.3 point 4 compte `sitesChecked` les refus « avant toute connexion » d'une adresse (DNS, adresse interdite, redirection). Confirmes-tu cette lecture ? Si non, une ligne de la spécification le dit et la PR de code suit.
3. **Product Owner** (ne bloque pas) : le § 11.9 (T9) dit `p0.programme_written` « écrit en fin de rédaction, avant la vérification » ; il est écrit en fin d'étape, après l'écriture (`src/workflows/p0-run.ts`, l. 719 et 722). Correction de texte à faire à la prochaine retouche de la spécification.
4. **CEO** (ordre des tâches ; ne bloque pas le lot 2a) : ouvrir la PR de workflow qui ajoute `0016_restriction_update_generation_runs` à `MIGRATIONS_APPROUVEES` (0120 S8 point 4, mineur 4 de #675), revue Sécurité G1 à G6, `owner-approved` de Samuel ; échéance de la Sécurité : avant toute PR qui rend un recalcul réel possible.
5. **Samuel** (via la PR de la question 4, `owner-approved`) : approbation de l'application de 0016 à la base de préversion. Aucune autre question à Samuel.

## Quand revoir

- À la fusion de **0122** : si la Sécurité durcit un point du § 6 (plafonds, liste Google, `user-agent`, confinement, compteurs, ligne du texte copié), la PR de code suit 0122 ; si elle change l'architecture (par exemple un module d'émission à part, ou la lecture de 64 Kio exigée), cette décision est amendée.
- À la revue de la PR de code du lot 2a, pour tout écart aux § 2 à § 5.
- Si un lot ultérieur **lit le contenu** des pages (reste de Q-S1 : prix, horaires, conseils sourcés) : le mode « statut seulement » ne suffit plus ; la lecture repasse par `lire` et ses règles (0096 § 1), et la question d'un agent à tours ou d'un ancrage par la page se rouvre.
- Si `p0Run` retrouve **plusieurs étapes de travail**, ou si la vérification des lieux devient parallèle : la place du § 2.1 et le transit en mémoire du § 2.2 sont à revoir (une frontière sérialisée exigerait `prototype.work` et un nouveau regard de 0011 § 3).
- Si la part réelle de sites gardés lue sur le rapport de Samuel est trop basse à cause des refus de `GET` par des serveurs (403, défis anti-robots) : revoir la méthode (§ 2.4) ou le `user-agent`, avec la Sécurité.
- Si la chaîne du MVP (B9) reprend le champ `site` : la vérification quitte `src/server/p0/` et demande son propre verdict.
- Q585 : à toute PR qui veut écrire une colonne exclue de `generation_runs` (§ 1 point 3), notamment une reprise de recalcul échoué (0120 « Quand revoir ») ; à toute migration qui ajoute une colonne à `generation_runs` écrite par le code (§ 1 point 2).
