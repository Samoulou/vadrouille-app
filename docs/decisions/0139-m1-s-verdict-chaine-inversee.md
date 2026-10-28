# 0139 — Verdict de la Sécurité sur la chaîne inversée dans la vraie app (M1-S) : requête `programme` et récit dans `briefs.story`, événement `generation.programme_written`, rôle de la publication, `Stop.source` conservée sans purge, noms de l'IA vers Text Search

Statut : **proposée**, définitive dès sa fusion (décision 0093) · **décision de la Sécurité** (verdict M1-S demandé par `specs/M1a-chaine-inversee-api.md` § 5, questions S1 à S5, et par la décision 0136 § 10 ; contrôles d'une sortie de modèle, données personnelles stockées, journal en liste fermée, droits en base, requête serveur vers une destination non fiable, règles Google appliquées aux requêtes), sans délai de veto ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). **Ordre** (0136 § 12) : cette décision est fusionnée avant M1a-2.

Date : 2026-10-28 · Décideur : Sécurité · Ticket : #841 · Spécification : `specs/M1a-chaine-inversee-api.md` § 5 · Décision de référence : 0136 (#835, fusionnée) · Décisions liées : 0011, 0027, 0046 S4, 0081 (B9-TL-3, B9-TL-8, B9-TL-9, B9-TL-12 point 3), 0092, 0111, 0114, 0116, 0117, 0120 (forme), 0122, 0125 § 5, 0126, 0130 § 2 · Questions : Q557, Q604, Q606, Q636 (`QUESTIONS.md`)

Numérotation : 0139 est réservé par le CEO pour cette décision. `main` (`033c94d`) porte 0001 à 0137 ; 0138 est portée par la PR #840 (ouverte) ; aucune autre PR ouverte ni branche `claude/…` ne porte 0139.

**Ce que cette décision n'engage pas.** Aucun argent, aucun compte externe, aucun plafond relevé, aucune garde levée, aucun test supprimé ni désactivé, aucune migration. M1a reste en composition simulée : rien ne part vers un fournisseur.

**Réservé à Samuel, non tranché ici** : la question 3 de la PR #829 (Q636 : récit et logement de vrais comptes vers le fournisseur de modèles, hors UE). Le récit n'est écrit dans `briefs.story` qu'après sa réponse (0136 § 3 « Récit ») : ce verdict lève la condition de la Sécurité, pas celle de Samuel. Les flux dérivés que ce verdict relève (libellés des engagements vers le modèle ; textes du brief qui peuvent atteindre Google Text Search ou un site tiers) sont **posés comme question** (« Questions nouvelles »), pas décidés.

**Amende** (pour le chemin `api` seulement ; le site d'essai garde les textes tels quels) :
- **0122 § 1 condition 11** : la vérification des sites part aussi de l'étape `e` de `generateProgramme`, par la famille `programme()` de `src/server/composition/generation.ts`, derrière la barrière B9-TL-8 et `verifierSortie` (§ 4.2) ;
- **0122 § 1 condition 12**, dernière phrase (« purgée avec le programme ») : sur `api`, l'adresse réduite est conservée avec la version du voyage et supprimée avec le compte (§ 4.4) ;
- **0122 § 2.2 condition 4** (contrôle final) : sur `api`, le schéma final est `TripSnapshotSchema`, plus large que `SourceReduiteSchema` ; une condition le complète (§ 4.3).

Ce verdict est aussi **le nouveau verdict pour le MVP** qu'annonçaient 0117 § 2 (« Pour le MVP », noms de l'IA vers Google : § 5) et 0122 § 1 (« Limites assumées », adresse proposée par l'IA : § 4.5).

**N'amende pas** : 0011 (seul le `placeId` est stocké de Google ; aucune donnée Google dans un prompt, un journal, une trace ou un état), 0027 et 0092 (exceptions existantes), 0046 S4, 0114 (journal en liste fermée), 0117 § 1 à § 5 (appliqués tels quels, § 1 et § 5 ci-dessous), 0136 (architecture prise telle quelle).

## Faits vérifiés sur `origin/main` `033c94d`

- **Requête `programme`** : `creerRedigerProgramme` (`src/ai/rediger-programme.ts`, l. 19-27) valide l'entrée par `EntreeProgrammeSchema` (l. 21-22) et impose `data_collection: "deny"` et `zdr: true` **quel que soit le réglage reçu** (l. 25). `requeteProgramme` (`src/ai/requetes.ts`, l. 253-255) envoie le brief en projection champ par champ (l. 258-275), **récit, `logements[].texte` et `engagements[].libelle` compris** ; aucun outil (`plugins` n'est posé que pour le greffon web, `src/ai/openrouter-client.ts`, l. 278 ; `provider` l. 275). `ETAPES_ZDR` contient déjà `programme` (`src/server/config/ia.ts`, l. 42) ; `ia.json` ne pose `zdr` que pour `structuration` (l. 4-6). Lecture tolérante : `lireProgramme` (`src/ai/sorties.ts`, l. 704), `LONGUEUR_REPONSE_MAX` (l. 45), `ordreEcrit` (l. 806), `lieuxDuProgramme` (l. 830, arrivée et départ exclus, seuls `lieu` et `ville` rendus). Traces : attributs en liste fermée, jamais un texte de prompt ni de réponse (`src/ai/traces.ts`, l. 19-35). Canari du prompt : `tests/unit/workflows/p0-run-finale.test.ts`, l. 432.
- **Récit** : `createTrip` écrit `story` à `NULL` (`src/server/creation/creer-voyage.ts`, l. 41-43 ; commentaire de `src/server/creation/brouillon.ts`, l. 12) ; `TripRequest.story` est borné par `text(STORY_LENGTH)` (`src/contracts/creation.ts`, l. 303) ; colonne `briefs.story` `text` (`db/migrations/0000_socle.sql`, l. 118). `vadrouille_app` a `SELECT, INSERT, UPDATE` sur `briefs` et `trips`, **pas `DELETE`** (`db/migrations/0001_securite.sql`, l. 159) ; aucune vue partagée sur `briefs` (l. 553-556) ; la dernière version de `purge_organization_data` supprime `trip_versions` et `briefs` (`db/migrations/0015_recalcul_lot.sql`, l. 114-115). Handover back-end : `TripRequest.story` l. 562, table `briefs` l. 681 (`docs/handovers/backend.md`).
- **Journal** : `p0.programme_written` dans `LOG_EVENTS` (`src/server/log.ts`, l. 34-42), compteurs `entierPositif` (l. 685-700), filtrage (`formatLogLine`, l. 739-755) ; ligne écrite par `journaliserProgramme` (`src/workflows/p0-run.ts`, l. 714-738), **sans aucun identifiant** ; `unverifiedForCap` = `lieuxHorsPartTextSearch` (l. 869-870 ; `src/grounding/ancrage.ts`, l. 147). Sur `api`, `src/server/generation` n'écrit que `generation.full_stuck` (`blocage.ts`) et `recalcul.*` (`lot.ts`, l. 107-108, 144) ; aucun événement pour l'aperçu. Liste des événements fixée par `tests/unit/server/limiteur.test.ts`, l. 428-479.
- **Publication** : `publier` (`src/server/generation/publication.ts`, l. 56-104) écrit version, cases et fin dans `dependances.transaction`, par défaut `withSystemOrg` (`src/server/generation/dependances.ts`, l. 95) : pool `vadrouille_app`, `app.organization_id` seul, `uuid` validé (`src/server/with-system-org.ts`, l. 30-45). `SQL_FIN` (l. 49-50) ne touche que des colonnes admises par la migration 0016 (`REVOKE UPDATE`, puis `GRANT UPDATE (…)`, l. 28-30). `SQL_PLACE_SEJOUR` (`src/server/generation/etapes.ts`, l. 276-277). Droits de `vadrouille_app` (migration 0001) : `SELECT, INSERT, UPDATE, DELETE` sur `checklist_items`, `stays` (l. 157) ; `SELECT, INSERT` sur `trip_versions`, `proposals`, `usage_ledger` (l. 166) ; politiques `FOR ALL` sur `organization_id = app_current_org()` (l. 235-242). `checklist_items.id` : `uuid` (`0000_socle.sql`, l. 157).
- **Sites** : `reduireSite`, `creerVerificateurStatut`, `estHoteGoogle`, `USER_AGENT` (`src/research/fetch-page.ts`, l. 443, 475, 415, 37) ; `sourceDuSite` (`src/server/p0/assemblage.ts`, l. 341-351 : libellé = nom d'hôte, `www.` retiré, 120 au plus). Contrôle final du prototype : `urlSourceValide` et `SourceReduiteSchema` (`src/prototype/programme-reduit.ts`, l. 58-72 : `https`, sans identifiants, 2 048 au plus, libellé 120 au plus). Contrôle final de `api` : `StopSnapshotSchema` (`src/contracts/snapshot.ts`, l. 39) → `SourceSchema` (`src/contracts/trip.ts`, l. 69-72), `TextSchema` = `z.string().min(1)` **sans borne** (l. 49), `HttpsUrlSchema` (l. 67) **sans refus des identifiants ni borne de longueur**. Vue partagée : `shared_source` (`0001_securite.sql`, l. 418-428) rend `label` et une `url` commençant par `https://`. `src/server/composition/generation.ts` importe déjà `fetch-page` et `undici-transport` (l. 21, 25) et est un importateur de capacités admis (`tests/unit/p0/composition.test.ts`, l. 181 et 212).
- **Text Search** : `MASQUE_TEXT_SEARCH = "places.id"` (`src/grounding/places-client.ts`, l. 59), `pageSize: 5` (l. 294), `locationRestriction` sans biais, refusée avec un biais (l. 295-301) ; `ancrerLogementsDuSejour`, `ancrerCandidatsDansZone`, `verifierLieuxDuProgramme` (`src/grounding/ancrage-zone.ts`, l. 56, 73, 119) ; `RAYON_BIAIS_METRES` 30 km (`ancrage.ts`, l. 15). `requeteSansDonneeDuBrief` (`src/research/agent.ts`, l. 485-523 : mots des logements et des engagements, fenêtre de mots consécutifs du récit).

## Décision

### 1. S1 — Requête `programme` de la vraie app et récit dans `briefs.story` : **0117 appliquée telle quelle ; récit admis, avec sept conditions**

#### 1.1 Requête `programme` : 0117 § 1 et § 5 valent tels quels

1. **Une seule voie** : la famille `programme()` de `src/server/composition/generation.ts` construit la rédaction par `creerRedigerProgramme`, **réutilisée, jamais recopiée**. `zdr: true` et `data_collection: "deny"` sont donc imposés par `src/ai/rediger-programme.ts` (l. 25), quel que soit le réglage ; le réglage `programme` de `ia.json` (`zdr.programme: true`, 0136 § 6.6) est une **seconde** garde, contrôlée par un test de configuration, jamais la seule.
2. **Échec fermé** (0117 § 5 point 2) : un refus du fournisseur rend son code fermé, **sans second appel sans `zdr`**, sans message. Test sur le chemin `api` : `chaine-inversee: programme zdr posé, refus sans second appel` (modèle : `tests/unit/ia/zdr.test.ts`, l. 65).
3. **Contrôles de la sortie** : `lireProgramme`, `LONGUEUR_REPONSE_MAX` et `ordreEcrit` réutilisés ; les sept précisions de 0117 § 1 valent sans changement. Sur `api`, le « schéma strict du programme écrit » de 0117 § 1 point 6 est `TripSnapshotSchema` (plus `ProposalRecordSchema` et `ChecklistItemSchema` pour les cases et les lignes « À faire ») : les contrôles tolérants s'appliquent **avant**. La réponse brute n'est jamais écrite : ni en base, ni dans `generation_runs`, ni dans un journal, une trace ou l'état sérialisé (0136 § 2.6).
4. **Bons plans** : 0117 § 1 point 7 vaut (`booking_url` absent, `sponsored = false`, `label` contrôlé) ; 0136 § 3.3 le tient.
5. **Aucun outil, aucune donnée Google** : `requeteProgramme` sans `plugins` ; l'entrée n'a aucun champ pour une donnée Google, et le logement n'y entre que par son texte, jamais par son `placeId` (0136, amendement de 0011 § 7). Test canari repris sur le chemin `api` : `chaine-inversee: prompt programme sans donnée Google` (modèle : `p0-run-finale.test.ts`, l. 432).
6. **Traces** : seulement les attributs de `ATTRIBUTS_TRACE` ; ni récit, ni logement, ni nom.

#### 1.2 Récit de vrais comptes dans `briefs.story` : **admis par la Sécurité, avec sept conditions**

1. **Une seule écriture** : `createTrip`, dans l'`INSERT` de la ligne `briefs` (`creer-voyage.ts`, l. 41-43, où `NULL` devient le récit), sous `withOrg` de la session, valeur validée par `TripRequest.story` (`text(STORY_LENGTH)`). Aucun `UPDATE` de `story`, aucune autre écriture, aucune copie dans une autre table (ni `generation_runs`, ni `trip_versions`, ni `prototype.*`).
2. **Lectures** : seulement par les étapes de `generateProgramme` qui convertissent le brief (`briefDepuisFormulaire`), sous `withSystemOrg` de l'exécution ; jamais dans l'état sérialisé, un journal, une trace, un `errorName` ni un message d'erreur. Toute autre requête de modèle qui recevrait le récit (la révision de M1b comprise) le dit dans sa PR, et la Sécurité le juge à sa revue.
3. **Jamais servi** : aucun lecteur de `src/server/voyages` ne lit `briefs.story` ; il n'entre ni dans l'instantané, ni dans une case, ni dans une ligne « À faire » ; aucune vue partagée ne porte sur `briefs` (0001, l. 553-556), et B12 n'en ajoute pas sans verdict.
4. **Durée de conservation : celle du voyage, jusqu'à la suppression du compte.** `purge_organization_data` supprime la ligne (0015, l. 115). Motifs : `retryGeneration` relit le brief pour un nouvel essai, et la révision de M1b repart du brief ; le texte du logement (`stays.label`) et les libellés des engagements (`trip_commitments`) de vrais comptes sont déjà conservés de même. `vadrouille_app` n'a pas `DELETE` sur `briefs` ni sur `trips` (0001, l. 159) : il n'existe aujourd'hui aucune suppression d'un voyage seul. **Si une telle action est créée**, sa PR supprime aussi la ligne `briefs` du voyage, avec un test.
5. **Isolation** : sous la RLS de `briefs` (`organization_id = app_current_org()`) ; test `chaine-inversee: récit écrit dans l'organisation de la session, illisible d'une autre`.
6. **Ordre** (0136 § 3 « Récit ») : la condition de la Sécurité est remplie par la fusion de ce verdict ; celle de Samuel (Q636) reste. Tant qu'il n'a pas répondu oui, M1a-2 n'écrit pas le récit (`recit: undefined`) et M1a-3 ne l'envoie pas. Ce verdict ne tranche pas Q636.
7. **Mention de l'écran 2** (recommandation à UX/UI, texte sous `docs/handovers/frontend.md`) : elle dit que le récit part au fournisseur de modèles **et qu'il est gardé avec le voyage, puis effacé avec le compte**.

#### 1.3 Ligne du tableau des champs du handover back-end

Réécrite par la PR qui écrit le récit sur `api` (M1a-2, sous les deux conditions), **pas avant** : tant que le récit n'est pas écrit, la ligne actuelle reste vraie.
- `docs/handovers/backend.md`, l. 562 (`TripRequest.story`, catégorie `stocké`), nouveau texte : « Facultatif (décision 0125 § 1). Adaptateur `prototype` : dans le brief saisi de `prototype.run_briefs` (`recit`), purgé avec le programme (29 jours). Adaptateur `api`, sous la chaîne inversée, après la réponse de Samuel à Q636 (décisions 0136 § 3 « Récit », 0139 § 1.2) : dans `briefs.story`, écrit par `createTrip` seul, conservé avec le voyage jusqu'à la suppression du compte (`purge_organization_data`) ; jamais servi, journalisé ni écrit dans un état de workflow. Envoyé tel quel au fournisseur de modèles dans la seule requête `programme`, avec `zdr` et `data_collection: "deny"` (Q557, Q636). Ignoré par `mock`, et par `api` sous l'ancienne chaîne. »
- l. 681 (table `briefs`), parenthèse de `story`, nouveau texte : « (récit libre ; sur `api`, écrit par `createTrip` sous la chaîne inversée seulement, après Q636, conservé avec le voyage jusqu'à la purge du compte, décision 0139 § 1.2 ; sur le site d'essai, `prototype.run_briefs` (`recit`), décision 0125 § 1 et § 5) ».

#### 1.4 Ce que Q636 ne nomme pas

`requeteProgramme` envoie aussi les **libellés des engagements** (`engagements[].libelle`, `requetes.ts`, l. 273-275), textes libres saisis par la personne (« Dîner chez … »). Q636 ne nomme que le récit et le logement. La barrière restant fermée jusqu'à M1h, rien ne part ; la PR qui l'ouvrira exige que la réponse de Samuel couvre aussi ces libellés (question nouvelle 1).

### 2. S2 — Journal sur le chemin `api` : **un événement nouveau, `generation.programme_written`, en liste fermée ; aucun `p0.*`**

1. **Nom fixé** : `generation.programme_written`, ajouté à `LOG_EVENTS` (`src/server/log.ts`) après `generation.full_stuck`, avec un commentaire qui cite 0136 et ce verdict. Écrit une fois par passage de l'étape `e` de `generateProgramme`, par l'étape seule (les modules de `src/server/programme/` n'écrivent aucun journal) ; niveau `info`, `warn` si l'étape lève.
2. **Champs admis, liste fermée** (forme exacte ; tous des entiers positifs ou nuls par `entierPositif`, sauf mention) :
   - sortie de l'IA (0117 § 4) : `days`, `slots`, `placesToVerify`, `daysRemoved`, `slotsRemoved`, `fieldsRemoved`, `textsCut`, `modelCalls` ;
   - plafonds (0117 § 4, définition stricte) : `unverifiedForCap` = `lieuxHorsPartTextSearch(lieux, part Text Search, logements)`, calculé **avant** la boucle de vérification, des seuls nombres ;
   - requête de rédaction (0130 § 2) : `finishReason` (`LOG_FINISH_REASONS`), `inputTokens`, `outputTokens` (0 à `MAX_JETONS_JOURNAL`), présents seulement si le client réel les rend ;
   - sites (0122 § 2.1) : `sitesProposed`, `sitesChecked`, `sitesRemoved`, `sitesUnchecked` ;
   - sur la ligne `warn` seulement : `errorName` (`NOM_ERREUR`).
   Ce sont exactement les champs de `p0.programme_written` (`CompteursProgramme`, `p0-run.ts`, l. 714-728). **Rien d'autre** : ni `stopReason` (il est dans `generation_runs`), ni `phase`, ni `failureCode`.
3. **Aucun identifiant** : ni `tripId`, ni `organizationId`, ni `generationRunId`, comme `p0.programme_written`. Motif : rapprochés du voyage stocké (étapes sans `placeId`), `placesToVerify` et `unverifiedForCap` redonneraient le nombre de lieux introuvables d'un voyage précis (0117 § 4 point 5, 0046 S4).
4. **Jamais** : un compteur de verdict (`verifies`, `introuvables`, `fermes`, `horsZone`) ou ce qui les redonne ; un nom (de l'IA ou de Google), un texte de la sortie, le récit, un logement, une adresse, un nom d'hôte, un `placeId`, une position, une durée, un statut HTTP.
5. **Aucun événement `p0.*`** sur le chemin `api` : ni `p0.programme_written`, ni `p0.step_failed`, ni `p0.research_done`, ni `p0.read_unavailable`. L'arrêt d'une exécution est connu par `generation_runs.stop_reason` (liste fermée, 0114) ; `generation.full_stuck` et `recalcul.*` restent inchangés.
6. **Compteurs de cases** : `ready` et `expected` restent ceux de `getGenerationStatus` (B9), hors du journal.
7. **Tests** (noms indicatifs) : `journal: generation.programme_written, compteurs indépendants de l'ancrage` (même sortie de l'IA, tous les lieux trouvés puis aucun, horloge et doubles fixes : ligne identique champ par champ ; `verifies` et un identifiant passés à la ligne : retirés et comptés dans `dropped`) ; `chaine-inversee: aucun événement p0.* sur api` (console espionnée sur une exécution simulée complète, `lodging_unresolved` et `model_output_invalid` compris) ; et la liste fermée de `tests/unit/server/limiteur.test.ts` (l. 428-479) **étendue** de cet événement (attente étendue, non affaiblie : question nouvelle 2 au Tech Lead, la liste des attentes modifiées de 0136 § 9 étant fermée).

### 3. S3 — Rôle et transaction de la publication : **confirmés, sans droit nouveau, avec cinq conditions**

Le rôle est `vadrouille_app` sous le contexte système de l'organisation de l'exécution (`withSystemOrg`, `app.organization_id` seul, défaut de `dependances.transaction`), dans la transaction unique de `publier` sous la garde `step_seq`. Les droits réels de la migration 0001 (et de 0016) couvrent toute l'écriture de 0136 § 3 :

| Écriture | Droit de `vadrouille_app` | Source |
|---|---|---|
| `trip_versions` (version 1) | `INSERT` | 0001, l. 166 |
| `trips.current_version` | `UPDATE` | 0001, l. 159 |
| `proposals` (cases `preview`) | `INSERT` | 0001, l. 166 |
| `stays.place_id` (`SQL_PLACE_SEJOUR`) | `UPDATE` | 0001, l. 157 |
| `checklist_items` (bons plans) | `INSERT` | 0001, l. 157 |
| `generation_runs` (garde, fin) | `UPDATE` des colonnes listées | 0016, l. 28-30 |
| `usage_ledger` (forfait, étape `a`) | `INSERT` | 0001, l. 166 |
| `briefs` (lecture du récit, étape `e`) | `SELECT` | 0001, l. 159 |
| `briefs.story` (écriture par `createTrip`, session) | `INSERT` | 0001, l. 159 |

Conditions :
1. **Une transaction, ensemble ou pas du tout** : version, cases, `stays.place_id`, lignes « À faire » et fin de l'exécution écrites dans le même appel de `dependances.transaction`, avant `SQL_FIN`, sous la garde ; rejeu borné sans nouvel appel externe (0081 B9-TL-3 point 4).
2. **Organisation explicite** : chaque requête porte `organization_id = $1` (défense en profondeur derrière la RLS), à paramètres liés ; `assemblerProgrammeIa` reçoit l'organisation de l'exécution, jamais `PROTOTYPE_ORG_ID` (0136 § 1.2). Test : `chaine-inversee: aucune écriture hors de l'organisation de l'exécution`.
3. **Aucun autre rôle** : ni `vadrouille_fn_*`, ni `vadrouille_auth`, ni `vadrouille_webhook`, ni fonction `SECURITY DEFINER` nouvelle ; aucune écriture dans le schéma `prototype` depuis le chemin `api` (garanti par le cas nominatif de 0136 § 9, critère 6).
4. **Identifiants des lignes « À faire »** dérivés de l'exécution et du rang (0136 § 3.3) : `uuid` déterministe, jamais tiré d'un texte de l'IA ; un rejeu après une confirmation perdue trouve l'exécution finie et n'écrit rien (garde de `publier`).
5. **Positions** : mécanisme de B9c inchangé (`ecrirePositions`, `ECRITURE_POSITIONS_AUTORISEE`, 0081 B9-TL-9) ; en simulé, aucune écriture.

### 4. S4 — Adresse réduite du site officiel dans `Stop.source` d'une version conservée sans purge : **les conditions de 0122 valent pour cette durée, avec quatre conditions de plus**

#### 4.1 Ce qui change par rapport au site d'essai

La durée (29 jours → jusqu'à la suppression du compte), les lecteurs (Samuel seul → les membres de l'organisation, puis des tiers par le partage de B12), et surtout le **brief** : celui d'une vraie personne, alors que 0122 jugeait des briefs publics ou saisis par Samuel.

#### 4.2 0122 § 1 (quatorze conditions) : **valent sans changement**, point d'appel ajouté

Garde unique (`analyserUrl`, `ip-guard`, transport épinglé), point d'entrée « statut seulement » de `fetch-page.ts`, réduction, hôtes Google refusés à chaque saut, `GET` seul, corps jamais décodé, redirections recontrôlées, 2xx seul, plafonds constants (80, 8, 5 s, 60 s, 64 Kio), rien de la réponse ni de l'adresse dans le journal ou l'état, libellé en punycode. **Condition 11 amendée** : la vérification part aussi de l'étape `e` de `generateProgramme`, par la famille `programme()` de `src/server/composition/generation.ts` (la seule sur le chemin `api` ; aucune action, aucune route, aucune autre famille), derrière la barrière B9-TL-8 et `verifierSortie` ; en composition simulée, **zéro résolution et zéro connexion** (doubles seulement). La composition de génération importe déjà ces modules (l. 21, 25) : aucun importateur de capacité nouveau (§ 6).

#### 4.3 0122 § 2.2 (six conditions) : **valent**, et le contrôle final est complété

- **Condition S4-1** : sur `api`, le contrôle final est `TripSnapshotSchema`, dont `SourceSchema` ne borne ni la longueur du libellé ni celle de l'adresse et n'en refuse pas les identifiants (`trip.ts`, l. 49, 67, 69-72). L'instantané (`src/server/programme/instantane.ts`, M1a-2) ne garde une `source` que si son `url` passe **la même règle que `urlSourceValide`** (`https`, sans identifiants, nom d'hôte non vide, 2 048 au plus) et a au plus 300 caractères (adresse réduite, 0122 § 1 condition 3), et si son `label` a au plus 120 caractères ; sinon la `source` est retirée et l'étape gardée. La règle est écrite **une fois** : déplacée dans un module pur que les deux chemins atteignent, ou tenue égale par un test (choix du Tech Lead, question nouvelle 2). Test : `instantane: source hors règle retirée (identifiants, http, plus de 300 caractères, libellé de plus de 120)`.
- Affichage : les mêmes composants (`ReasonBlock`, `ProposalDetailSheet`, `StopSheet`), `target="_blank"`, `rel="noopener noreferrer"`, sans `dangerouslySetInnerHTML` (condition 5 de 0122 § 2.2, inchangée).

#### 4.4 Durée : **admise**

L'adresse n'est pas une donnée Google (0011 ne la vise pas ; `websiteUri` reste exclu) et n'est pas, en principe, une donnée personnelle : c'est l'adresse publique d'une activité, construite et réduite par le code (ni requête, ni fragment). Elle vit sous la RLS dans `trip_versions`, est servie à l'organisation seule, et la purge du compte la supprime (0015, l. 114). La purge à 29 jours du site d'essai était une propriété du schéma `prototype`, pas une condition de 0122 : la durée de la version ne change pas le risque de l'adresse stockée. Le risque nouveau tient à la **requête** et à son contenu possible (§ 4.5), pas au stockage.

#### 4.5 Le nouveau verdict pour le MVP (limites (a) et (b) de 0122 § 1)

**(a) Exfiltration par l'adresse ou par le DNS** : le prompt `programme` ne reçoit que le brief de la personne elle-même, sans outil ni recherche web ni contenu d'un tiers (§ 1.1 point 5). Seul le modèle pourrait donc recopier un texte du brief dans un nom d'hôte ou un chemin, et la seule personne capable de l'y pousser est l'auteur du brief, sur ses propres données. Le risque est admis, à deux conditions :
- **Condition S4-2** (au plus tard dans la PR qui ouvre la barrière, M1h ; M1a-2 peut la poser) : une adresse dont le nom d'hôte ou le chemin, mis en mots (séparateurs non alphanumériques remplacés par des espaces, même normalisation que `cleRequete`), ne passe pas **la règle de `requeteSansDonneeDuBrief`** (`src/research/agent.ts`, l. 485 : mots des logements et des engagements, fenêtre de mots consécutifs du récit) est refusée **avant toute résolution**, comme un échec de forme (`fieldsRemoved`, 0122 § 1 condition 4). La fonction est réutilisée, non recopiée, et passée par la composition (`src/server/programme/` n'atteint pas `src/research`, 0136 § 1.2). Un faux positif ne coûte que le lien. Test : `sites: adresse reprenant un texte du brief refusée sans résolution`.
- **Condition S4-3** : si le prompt `programme` reçoit un jour un contenu tiers (pages, recherche web, texte d'une autre personne), la vérification des sites est rejugée **avant** cette PR.

**(b) Réputation et vieillissement du domaine** : aucun contrôle de réputation (ce serait un flux nouveau vers un tiers, peut-être payant : décision de Samuel). Admis pour le MVP : le libellé est le nom d'hôte en punycode (0122 § 1 condition 14), donc la personne voit le domaine. Limite assumée : un domaine vérifié à la génération peut changer de propriétaire pendant la vie du voyage. Aucune revérification à la lecture (le serveur contacterait un hôte choisi par le modèle à chaque affichage).

**(c) Partage (B12)** : `shared_source` (0001, l. 418-428) servirait ces liens aux tiers qui détiennent un lien de partage. Le partage est fermé sur `api` jusqu'à B12 (0136 § 3.5) ; la PR de B12 dit si les sources de l'IA sont partagées, et la Sécurité le juge à sa revue.

**(d) Hors UE** : la requête de vérification et la résolution DNS atteignent des hôtes du monde entier. Si l'adresse portait, malgré S4-2, une donnée personnelle, celle-ci partirait vers un tiers : le flux est posé à Samuel (question nouvelle 1).

### 5. S5 — Noms de lieux de l'IA envoyés à Text Search : **Q606 répondue (« acceptable ») ; même verdict pour la vraie app, avec quatre conditions**

#### 5.1 Q606 (site d'essai, lot 3) : **acceptable**

Les cinq conditions de 0117 § 2 sont tenues par le code : requête construite des seuls `lieu` et `ville` contrôlés (`lieuxDuProgramme`, arrivée et départ exclus), zone restreinte sans biais (`places-client.ts`, l. 295-301), masque `places.id` (l. 59) et `pageSize: 5` (l. 294), seul le `placeId` écrit, Text Search réservé sur la part du forfait. Le récit n'entre jamais dans une requête Google. Ce verdict répond à Q606 ; le CEO la reporte comme répondue.

#### 5.2 Vraie app : **même verdict**, les cinq conditions de 0117 § 2 et :

1. **Une voie** : `verifierLieuxDuProgramme` et `ancrerCandidatsDansZone` (et `ancrerLogementsDuSejour` pour les logements) réutilisées, appelées par la seule famille `programme()` de la composition de génération, depuis l'étape `e`, derrière la barrière et sous la réservation du profil `programme` (0136 § 6) ; en simulé, aucun appel.
2. **Zone** : celle des logements du séjour, jamais déduite d'un texte de l'IA ni élargie (0117 § 2 point 2).
3. **Rien du nom ailleurs** : ni dans le journal (§ 2), ni dans `generation_runs`, ni dans une trace, ni dans l'état sérialisé ; seul le `placeId` retenu est écrit, dans la transaction de fin (§ 3).
4. **`requeteSansDonneeDuBrief` n'est pas appliqué aux noms** : il refuserait les lieux que la personne cite elle-même dans son récit (« manger chez … »), donc la vérification de ses propres souhaits (motif de 0117 § 2, qui vaut davantage pour un vrai voyageur). La différence avec S4-2 est voulue : pour un site, un faux positif ne coûte qu'un lien. **Risque résiduel admis** : l'IA peut recopier dans `lieu` (80 caractères au plus) un texte du brief, envoyé à Google avec la ville. Il est borné (80 + 2 + 60 caractères, réponse limitée aux identifiants), et le texte du logement part déjà à Text Search pour placer le séjour (Q604 pour le site d'essai ; étape `l` de l'ancienne chaîne sur `api`). Envoyer à Google, hors UE, des textes tirés du brief d'un vrai compte relève de Samuel : question nouvelle 1, qui ne bloque pas M1a (simulée).

### 6. Lignes de confinement attendues de M1a-2

- **Aucune ligne nouvelle** dans `tests/unit/confinement/listes/capacites.ts`, `paquets.ts`, `process.ts`, `specificateurs.ts`, `formes-tests.ts`, ni dans `donnees/lignes-textes.json`, `lectures-env-secretes.json` ou `refus.json` (`modulesCapaciteP0r1` inchangé) ; la ligne d'`undici-transport.ts` reste à `nombre: 1`.
- `src/server/composition/generation.ts` reste le seul importateur de capacités du chemin `api` (déjà admis, `composition.test.ts`, l. 181 et 212) ; aucun importateur nouveau d'un module de capacité, et `src/workflows/programme.ts` n'en importe aucun.
- `ARETES_ADMISES` sans ligne nouvelle ; les listes de P0 ne changent que comme le dit 0136 § 1.5 (M1a-1) ; `eslint-rules/creation-imports.mjs` reçoit le seul importateur `src/workflows/programme.ts` (0136 § 2.1).
- `src/server/log.ts` : un événement de plus (§ 2), aucun champ nouveau.
- Toute autre capacité, arête ou ligne : la PR la dit, avec ses cas fabriqués (modèle de 0081 B9-TL-1 points 3 et 4), et la Sécurité la juge à sa revue.

## Conditions récapitulatives (vérifiées à la revue Sécurité)

| PR | Conditions |
|---|---|
| M1a-2 | § 1.1 (voie unique `creerRedigerProgramme`, `zdr` imposé et configuré, échec fermé testé, contrôles réutilisés, canari sur `api`, traces fermées) ; § 1.2 (récit écrit seulement après Q636, par `createTrip` seul, jamais servi ni journalisé, isolation testée) ; § 1.3 (handover, si le récit est écrit) ; § 2 (événement, champs, aucun identifiant, aucun `p0.*`, tests) ; § 3 (transaction unique, organisation explicite, aucun autre rôle, identifiants dérivés) ; § 4.2 et § 4.3 (point d'appel, S4-1) ; § 5.2 points 1 à 3 ; § 6 |
| M1a-3 | § 1.2 points 3, 6 et 7 (écran 2, mention, sous Q636) ; § 4.3 (affichage) ; aucun lecteur ne sert `briefs.story` |
| M1h (barrière) | réponse de Samuel à Q636 et à la question nouvelle 1 ; S4-2 posée ; S4-3 vérifiée |
| B12 | § 4.5 (c) ; aucune vue sur `briefs` |

## Conséquences

- M1a-2 peut commencer dès la fusion de cette décision ; le récit n'y est écrit qu'après la réponse de Samuel à Q636.
- Le chemin `api` a un événement de journal propre (`generation.programme_written`), aux mêmes champs que celui du site d'essai, sans identifiant ; aucun `p0.*` n'y est écrit.
- La publication de la chaîne inversée n'exige aucun droit, aucune migration, aucun rôle nouveau.
- `Stop.source` est conservée avec la version, sous un contrôle final égal à celui du prototype (S4-1) ; la vérification des sites reçoit un filtre des textes du brief avant l'ouverture de la barrière (S4-2).
- Q606 est répondue. Les flux dérivés du brief vers des tiers (libellés des engagements vers le modèle, textes du brief vers Google et vers un site) attendent Samuel pour l'usage réel, sans bloquer M1a.

## Ce que cette décision ne tranche pas

- Q636 et la question nouvelle 1 (Samuel) ; la mention de l'écran 2 (texte : UX/UI, sous la réponse de Samuel).
- L'architecture de 0136 (Tech Lead), dont l'emplacement de la règle de S4-1 et la place du filtre S4-2.
- Le partage des sources de l'IA par B12 ; une action « supprimer ce voyage ».

## Questions nouvelles (pour la description de la PR, reportées par le CEO)

1. **Samuel** (à joindre à Q636 ; ne bloque pas M1a, simulée ; bloque l'ouverture de la barrière, M1h) : Q636 parle du récit et du logement envoyés au fournisseur de modèles. Pour de vrais comptes, ton oui couvre-t-il aussi : (a) les **libellés des engagements** (« Dîner chez … ») envoyés au même fournisseur ; (b) le texte du logement et les **noms de lieux écrits par l'IA**, qui peuvent reprendre un mot de ton récit, envoyés à **Google Text Search** (comme Q604 pour le site d'essai) ; (c) la **requête du serveur vers le site proposé par l'IA** (le site et son DNS voient l'adresse, filtrée par S4-2) ? Recommandation de la Sécurité : oui, aux conditions de 0139.
2. **Tech Lead** (ne bloque pas M1a-2 ; réponse à la revue de M1a-2) : (a) ajouter à la liste fermée des attentes modifiées de 0136 § 9 l'extension de `tests/unit/server/limiteur.test.ts` (l. 428-479, « la liste des événements est fermée ») par `generation.programme_written` ; (b) choisir où vit la règle de `urlSourceValide` pour S4-1 (module pur partagé, ou test d'égalité).
3. **UX/UI** (ne bloque rien ; au moment de M1a-3) : la mention de l'écran 2 dit que le récit est gardé avec le voyage et effacé avec le compte (§ 1.2 point 7).
4. **CEO** : reporter Q606 comme répondue par 0139 § 5.1.

## Décisions attendues de Samuel

- Q636 (question 3 de #829), avec son complément (question nouvelle 1 ci-dessus). Sans réponse : le récit n'est ni écrit ni envoyé sur `api`, et la barrière des appels réels reste fermée (0136 § 3 « Récit »).
- Rien d'autre : aucun montant, aucun compte, aucune exception à 0011 n'est demandé ici.

## Quand revoir

- À la réponse de Samuel à Q636 et à la question nouvelle 1.
- Avant toute requête de modèle nouvelle qui recevrait le récit (révision de M1b), et si le prompt `programme` reçoit un contenu tiers (S4-3).
- À l'ouverture du partage sur `api` (B12) et à la création d'une suppression d'un voyage seul.
- Après le premier essai réel sur `api` (M1h) : constat sur les sites refusés par S4-2, sur des domaines douteux affichés, ou sur des noms de lieux reprenant un texte personnel.
- Si la durée de conservation des voyages change (politique de conservation, G1 et suivantes).
