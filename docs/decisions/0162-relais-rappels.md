# 0162 — Relais des rappels : réclamation en base par une table insert-only `reminder_relays` (Q821)

Statut : **proposée par l'agent tech-lead, définitive à la fusion (0093)**. Décision déléguée du **Tech Lead** (architecture, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`). Les points marqués **« question à la Sécurité »** (§ 4) ne sont **pas tranchés** ici : ce sont des propositions du Tech Lead, que la Sécurité confirme ou amende par sa revue de la PR `data` (§ 6.1), forme de 0157 (en-tête, l. 5). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision. Rien de ce qui revient à Samuel n'est tranché (envoi réel, Q25 ; conservation, Q27).

Date : 2026-11-01 · Décideur : Tech Lead · Ticket : #1037 (Q821, `QUESTIONS.md` l. 812) · `main` relu : `6b516bc` · Origine : revue consolidée de la PR #1024 (M6c), commentaire du 2026-11-01 05:22 UTC, section « Question ouverte "relais / `relayed_at`" — réponse du Tech Lead » (l. 32-33 du commentaire), et revue consolidée du head `759a09a` (mineur 7, l. 22 : « ouvrir la tâche `reminder_relays` (rôle `data`) »).

Numérotation : `main` va jusqu'à 0159 ; 0160 est dans la PR #1035 (`docs/decisions/0160-m8-apres-le-voyage.md`) ; 0161 n'est ajoutée par aucune PR ouverte ni aucune branche `claude/` distante au moment de la rédaction (vérifié ; la PR #1032 ne touche que `next.config.ts`, `src/server/partage/limite-vue.ts` et son test), le numéro reste réservé par le CEO. 0162 est libre.

**Ce que cette décision n'engage pas.** Aucun code, aucun test, aucune migration dans cette PR. Aucune dépense, aucun compte externe, aucune variable d'environnement. Aucune donnée Google lue, stockée ou envoyée ; aucune adresse ni texte dans la table proposée.

## Contexte

1. **Relais aujourd'hui.** Une exécution de `rappelsVeille` reprend sur le code du déploiement qui l'a démarrée (`src/server/config/rappels.ts` l. 48-53 ; documentation du Workflow SDK 5.1.0, `node_modules/workflow/docs/foundations/versioning.mdx` l. 67). Après `RELAIS_JOURS` (7) jours de sommeil cumulé, l'étape `etapeRelais` démarre une exécution qui lui succède, avec le **même état** (`start(rappelsVeille, [entree], { region: REGION_WORKFLOWS, deploymentId: "latest" })`, `src/workflows/rappels.ts` l. 45-56), et l'exécution ne se termine que si ce démarrage a réussi (l. 79-87). En échec : `rappels.relay_failed` (nom seul, l. 52), nouvel essai avant chaque sommeil, au plus `RELAIS_ESSAIS_MAX` (24, `src/server/config/rappels.ts` l. 78), puis `rappels.abandoned` (`src/workflows/rappels.ts` l. 59-63, 83-86). Tests : `src/workflows/rappels.test.ts` l. 85-135.
2. **Ce que 0157 demandait.** 0157 § 1.7 point 8 (l. 129) : « la succession est réclamée en base (écriture conditionnelle sur la ligne d'accord) pour qu'une seule exécution succède ». Ce n'est pas fait : `vadrouille_app` n'a sur `reminder_consents` que `UPDATE (withdrawn_at)` (`db/migrations/0024_rappels.sql` l. 131), et le déclencheur `reminder_consents_withdraw_once` refuse toute mise à jour d'un accord retiré et toute mise à jour qui laisse `withdrawn_at` nul (l. 141-158) : une « écriture conditionnelle sur la ligne d'accord » est impossible sans défaire ce que la Sécurité a fermé. L'écart est écrit en tête du workflow (`src/workflows/rappels.ts` l. 32-34) et dans le handover (`docs/handovers/backend.md` l. 879), et accepté par le Tech Lead « tant que `RAPPELS_ENVOI_REEL` reste faux » (Q821).
3. **Ce qui protège déjà la personne.** Aucune journée ne part deux fois, quel que soit le nombre d'exécutions pour un même accord : la réclamation par journée est l'insertion dans `reminder_sends`, clé primaire `(organization_id, trip_id, user_id, day_index)` (`db/migrations/0024_rappels.sql` l. 76-84 ; `src/server/rappels/envoi.ts` l. 85-86, l. 136), validée **avant** le transport (l. 198-214) ; spécification M6 § 5.3 point 4 (`specs/M6-pendant-le-voyage-api.md` l. 149) ; 0157 § 1.7 point 4 (l. 125).
4. **Ce qui ne l'est pas.** Le nombre d'**exécutions** par accord. Sans réclamation, une exécution en double relaie à son tour : chaque doublon engendre son propre successeur, chaque semaine, jusqu'à la veille du dernier jour, et la durée de vie d'une chaîne n'est pas bornée (aucune borne haute sur la date de départ d'un voyage, 0157 § 1.7 point 8, l. 129). Un doublon naît de trois façons, toutes permises par la documentation du SDK, qui ne promet pas l'exécution unique d'une étape : (a) `start` échoue côté appelant alors que l'exécution a été créée (délai dépassé, réponse perdue) : `etapeRelais` rend `false` et l'essai suivant démarre une seconde exécution ; (b) l'invocation d'une étape tombe avant d'avoir rapporté son résultat et l'étape est rejouée (`node_modules/workflow/docs/errors/step-executed-multiple-times.mdx` l. 13 ; « workflow and step handlers must tolerate at-least-once execution », `node_modules/workflow/docs/worlds/postgres.mdx` l. 339) ; (c) une ancienne exécution doublée par (a) ou (b) relaie à son tour. Coût : une étape de lecture par jour et par exécution (0157 § 1.7 point 2, l. 123), des exécutions endormies facturées par le monde Vercel, aucun envoi de plus.
5. **Aujourd'hui, l'écart n'a pas d'effet hors `local` et `ci`.** Tant que `RAPPELS_ENVOI_REEL` est faux (`src/server/config/rappels.ts` l. 64), la composition rend le port désactivé dès que le transport est Resend : l'interrupteur n'apparaît pas et **aucune exécution ne démarre** (`docs/handovers/backend.md` l. 877) ; une exécution qui trouverait ce port désactivé se termine à son premier réveil (`src/server/rappels/envoi.ts` l. 182-187). En `local` et `ci` (Mailpit), le test accéléré ne dort pas 7 jours cumulés (`RAPPELS_ACCELERATION`, `docs/handovers/backend.md` l. 874) : aucun relais n'y a lieu en pratique.
6. **Colonne `relayed_at` refusée** (revue de #1024, l. 33 du commentaire) : déclencheur ci-dessus, et un accord relaie toutes les 7 jours (il faudrait un compteur, donc des mises à jour répétées d'une ligne que la Sécurité a voulue figée).

## Décision

### 1. Réponse à Q821 : la table est retenue ; l'écart reste acceptable jusqu'à elle, à une condition

1. **Retenu : une réclamation du relais en base**, par une table **insert-only** `reminder_relays` (§ 2), utilisée par le workflow **avant** `start` (§ 3). Elle remplace l'« écriture conditionnelle sur la ligne d'accord » de 0157 § 1.7 point 8 (voir « Textes amendés »).
2. **Ce qu'elle garantit, et ce qu'elle ne garantit pas.** Elle garantit qu'**une seule exécution par génération** (même accord, même numéro de relais) démarre le successeur ; les doublons d'une génération se terminent à leur relais, au lieu de se reproduire. Elle **ne** garantit **pas** qu'une seule exécution vit à un instant donné : le cas (a) du contexte point 4 (démarrage réussi mais rapporté en échec, puis nouvel essai) peut encore laisser deux successeurs d'une même génération pendant au plus 7 jours ; ils se réduisent à un au relais suivant (§ 5). **« Jamais deux fois la même journée » ne dépend pas de cette table** : il reste garanti par `reminder_sends` (contexte point 3). `reminder_relays` borne la charge et le coût, pas les envois.
3. **Condition de l'écart.** L'écart actuel (relais non réclamé) reste accepté **tant que `RAPPELS_ENVOI_REEL` est faux**. La PR qui passera cette constante à `true` (déjà conditionnée par 0157 § 1.7 point 10, l. 131, et `src/server/config/rappels.ts` l. 58-63) devra **en plus** citer : la fusion de la tâche R-B (§ 6.2) et l'application de la migration de R-D (§ 6.1) sur la base visée (sa ligne dans `MIGRATIONS_APPROUVEES`, `owner-approved` de Samuel, `db/migrations/0024_rappels.sql` l. 5-7). Le Tech Lead refuse en revue une PR qui passe la constante à `true` sans ces deux références. R-B ajoute cette condition au commentaire de la constante (§ 6.2).
4. **Pourquoi pas l'écart définitif.** 0157 § 1.7 point 8 exigeait la réclamation ; la croissance des doublons n'est bornée que par la fin du voyage (contexte point 4) ; et, une fois l'envoi réel ouvert, chaque exécution en trop a un coût récurrent dans un compte de Samuel. Le prix de la table est faible : une ligne par accord et par semaine, trois identifiants, un numéro et un instant.
5. **Alternatives écartées.**
   - **Colonne sur `reminder_consents`** (`relayed_at` ou compteur) : contexte point 6.
   - **Jeton de hook du SDK comme clé d'idempotence** (`node_modules/workflow/docs/foundations/idempotency.mdx` l. 56-99) : la garantie vivrait dans le monde du moteur et non dans Postgres, où 0157 § 1.7 point 7 (l. 128) et la spécification M6 § 5.3 point 7 (l. 152) placent l'état métier ; elle ne serait pas éprouvée par `tests/db` ; la documentation signale elle-même une course entre `start` et l'enregistrement du hook, en attendant une interface native (l. 148-149). À revoir quand cette interface existera (« Quand revoir »).
   - **Verrou ou bail avec mise à jour** (colonne `owner_run_id` modifiable, expiration) : demanderait un `UPDATE` à `vadrouille_app`, contraire à l'insertion seule voulue pour les réclamations (`reminder_sends`, `db/migrations/0024_rappels.sql` l. 126-128).

### 2. Forme de `reminder_relays` (migration de la tâche R-D)

Noms en anglais, comme les autres tables. Générée par `pnpm db:generate` depuis `db/schema/business.ts` (table, clés, `CHECK`), complétée à la main (RLS, politiques, droits, purge), sur le modèle de `db/migrations/0024_rappels.sql` (l. 1-46 pour l'en-tête et le plan).

```sql
-- 0. Cible de la clé étrangère composée (organisation cohérente, modèle de reminder_consents_trip_fk, 0024 l. 66).
ALTER TABLE "reminder_consents" ADD CONSTRAINT "reminder_consents_organization_id_id_key" UNIQUE ("organization_id", "id");

-- 1. Réclamation d'un relais : l'insertion est la réclamation.
CREATE TABLE "reminder_relays" (
  "organization_id" uuid NOT NULL,
  "consent_id" uuid NOT NULL,
  "relay_n" smallint NOT NULL,
  "claimed_run_id" text NOT NULL,
  "claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "reminder_relays_pkey" PRIMARY KEY ("organization_id", "consent_id", "relay_n"),
  CONSTRAINT "reminder_relays_relay_n_check" CHECK ("reminder_relays"."relay_n" >= 1),
  CONSTRAINT "reminder_relays_claimed_run_id_check" CHECK ("reminder_relays"."claimed_run_id" ~ '^wrun_[0-9A-HJKMNP-TV-Z]{26}$')
);
ALTER TABLE "reminder_relays" ADD CONSTRAINT "reminder_relays_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "reminder_relays" ADD CONSTRAINT "reminder_relays_consent_fk"
  FOREIGN KEY ("organization_id", "consent_id") REFERENCES "public"."reminder_consents"("organization_id", "id") ON DELETE no action ON UPDATE no action;
```

1. **Clé** : `(organization_id, consent_id, relay_n)`, celle de la revue de #1024 (l. 33 du commentaire). `relay_n` est le numéro de **génération du successeur** : l'exécution démarrée par `setTripReminders` est la génération 0 (pas de ligne) ; son successeur est la génération 1, réclamée par la ligne `relay_n = 1`, et ainsi de suite. `smallint` : 32 767 générations de 7 jours, plus de 600 ans.
2. **`claimed_run_id`** : identifiant de l'exécution qui a réclamé (`getWorkflowMetadata().workflowRunId`, `node_modules/workflow/docs/api-reference/workflow/get-workflow-metadata.mdx` l. 28-29), format `wrun_` suivi d'un ULID de 26 caractères (`node_modules/workflow/docs/how-it-works/event-sourcing.mdx` l. 352-356). Il sert **seulement** à reconnaître une étape rejouée de la même exécution (§ 3 point 3, § 5 cas 1) : sans lui, une étape de réclamation rejouée après son `COMMIT` se prendrait pour un doublon et terminerait la chaîne sans successeur, ce qui est pire qu'un doublon. R-D vérifie le format sur le monde local (une exécution réelle de `tests/e2e/rappels-api.api.spec.ts`, ou le code du SDK) et le note dans sa PR ; s'il diffère, R-D ajuste le seul `CHECK` et le signale au Tech Lead, sans relâcher la borne de longueur (au plus 64 caractères dans tous les cas). Ce n'est ni une adresse, ni un texte libre, ni une donnée Google ; l'ULID porte son instant de création (event-sourcing.mdx l. 367), redondant avec `claimed_at`.
3. **`claimed_at`** : posé par la base (`DEFAULT now()`), jamais fourni par l'application (droits par colonnes, point 5).
4. **Clés étrangères**, toutes `ON DELETE NO ACTION`, comme 0024 (l. 23-24) : organisation ; `(organization_id, consent_id)` vers `reminder_consents (organization_id, id)`, qui demande la contrainte unique du point 0 (additive : `id` est déjà unique, la paire l'est donc aussi ; aucune ligne modifiée). Conséquence : un accord qui a un relais ne se supprime pas hors de la purge (`23503`), ce qui ne change rien aujourd'hui (aucun droit `DELETE` sur les accords, 0024 l. 129-135) ; la note de 0024 sur la suppression d'un voyage (l. 45-46) s'étend aux relais.
5. **Droits** (proposition, question S-R1 du § 4) : `vadrouille_app` : `SELECT`, `INSERT (organization_id, consent_id, relay_n, claimed_run_id)` ; ni `UPDATE`, ni `DELETE`, ni `TRUNCATE`. `vadrouille_fn_purge` : `SELECT (organization_id)`, `DELETE`. Aucun autre rôle.
6. **RLS** activée et forcée (0024 l. 96-100). Politiques proposées (question S-R2) :
   - `reminder_relays_app_select` `FOR SELECT TO vadrouille_app USING (organization_id = public.app_current_org() AND EXISTS (SELECT 1 FROM public.reminder_consents AS c WHERE c.organization_id = reminder_relays.organization_id AND c.id = reminder_relays.consent_id AND c.user_id = public.app_current_user()))` ;
   - `reminder_relays_app_insert` `FOR INSERT TO vadrouille_app WITH CHECK` : la même condition, **plus** `c.withdrawn_at IS NULL` (on ne réclame pas le relais d'un accord retiré) ;
   - `reminder_relays_fn_purge` `FOR ALL TO vadrouille_fn_purge`, organisation de la transaction (modèle de 0024 l. 112-113, l. 122-123).
   Par **personne** dès la création, et non par organisation comme `reminder_sends_app` (0024 l. 119-120) : la limite « organisation à un membre » notée au handover (`docs/handovers/backend.md` l. 878) n'est pas reconduite pour une table neuve. Le réveil ouvre déjà sa transaction avec l'organisation **et** la personne de l'état (`src/server/rappels/envoi.ts` l. 105) : la politique ne demande rien de plus au code.
7. **Aucun déclencheur** : sans droit `UPDATE` pour aucun rôle applicatif, la ligne ne change pas (même régime que `reminder_sends`, 0024 l. 126-128) ; la connexion d'administration pourrait la modifier (question S-R3).
8. **Purge** : `purge_organization_data` recréée sous `vadrouille_fn_purge`, même forme et même séquence de rôles que 0024 (l. 161-171, l. 223-231), corps identique à 0024 (l. 172-221) avec **une** ligne de plus, **avant** les accords (clé `NO ACTION`) :
   `DELETE FROM public.reminder_relays AS x WHERE x.organization_id = v_org;` placée avant `DELETE FROM public.reminder_consents` (0024 l. 199).
9. **Conservation** : celle de l'accord auquel la ligne se rattache, c'est-à-dire jusqu'à la purge du compte (0157 § 1.8, l. 143 ; Q27 de Samuel). Une durée plus courte (suppression à la fin du voyage) demanderait un droit `DELETE` ou une tâche de nettoyage : question S-R4, non tranchée.
10. **`.down.sql`** (règle du rôle `data` : aucune suppression de données, `.claude/agents/data.md`) : retire **seulement** les droits de `vadrouille_app` sur `reminder_relays` (`SELECT`, `INSERT (…)`). **Restent** : la table, ses lignes, ses clés, `CHECK`, RLS, politiques, droits de la purge, la contrainte unique de `reminder_consents` (une clé étrangère s'y appuie) et la purge de la migration (la purge de 0024 échouerait sur la clé `NO ACTION` dès qu'un relais existe), modèle de `db/migrations/0024_rappels.down.sql` l. 1-13. La migration ne se rejoue pas après sa descente (`CREATE TABLE` échouerait) : un retour passe par une migration corrective vers l'avant. **Ordre d'une descente** : le code de R-B d'abord retiré du déploiement (sinon chaque réclamation échoue en `42501`, est comptée comme un essai de relais, et la chaîne se termine au 24e : § 3 point 4), puis la descente.
11. **Aucune adresse, aucun texte, aucune donnée Google** ; `schéma: RLS activée et forcée partout` et `schéma: aucune colonne de contenu Google` restent verts sans exception nouvelle (0157 § 1.8, l. 144).
12. **Numéro** : `0025_rappels_relais` si 0025 est libre à l'ouverture de la PR (aucune PR ouverte n'ajoute de migration au 2026-11-01 ; #866 ne touche pas `db/migrations/*.sql`), sinon le prochain libre.

### 3. Usage dans le workflow (tâche R-B)

1. **État** (`src/server/rappels/etat.ts` l. 14-19) : `EtatRappelSchema` gagne `relayN: z.number().int().min(1).max(32767).optional()` ; **absent = génération 0**. Objet toujours strict. Champ **facultatif** pour deux raisons : `setTripReminders` démarre sans lui (`src/server/rappels/demarrage.ts` l. 13-16, inchangé), et une exécution démarrée par le code d'avant R-B relaie vers le dernier déploiement avec l'état à quatre clés, que le nouveau code doit accepter (la documentation demande des arguments compatibles entre les déploiements reliés : `node_modules/workflow/docs/foundations/versioning.mdx` l. 119). Un compteur est admis dans l'état sérialisé (`docs/handovers/backend.md` l. 885 ; spécification M6 § 5.3 point 6, l. 151).
2. **Cœur** : nouveau module `src/server/rappels/relais.ts` (logique, sans directive), sur le modèle d'`envoi.ts` (`withOrg` injectable, ne lève jamais) : `reclamerRelais(entree, { relayN, runId }, deps) → "acquise" | "doublon" | "fin" | "panne"`. Dans **une** transaction de `withOrg` (organisation et personne de l'état) :
   1. accord de l'exécution actif (`SQL_ACCORD` d'`envoi.ts` l. 67-68, réutilisé) ; absent ou retiré → `fin` ;
   2. `INSERT INTO public.reminder_relays (organization_id, consent_id, relay_n, claimed_run_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING relay_n` ; une ligne → `acquise` ;
   3. zéro ligne : `SELECT claimed_run_id … WHERE organization_id = $1 AND consent_id = $2 AND relay_n = $3` ; égal à `runId` → `acquise` (étape rejouée de la même exécution), sinon → `doublon` ;
   4. toute erreur (base, RLS `42501` si l'accord est retiré entre la lecture et l'insertion) → `panne`, journal `rappels.relay_failed` (nom seul, comme `src/workflows/rappels.ts` l. 52).
   Entrée hors de `EtatRappelSchema` → `fin`.
3. **Pont** (`src/workflows/rappels.ts`) : une étape de plus, `etapeReclamationRelais(entree, relayN, runId)` (`"use step"`, `maxRetries = 0`) qui appelle `reclamerRelais`. Dans `rappelsVeille` : `runId` lu une fois par `getWorkflowMetadata()` dans le corps du workflow ; `generation = entree.relayN ?? 0` ; un drapeau `reclame` (faux au départ). Quand le relais est dû (l. 79) :
   - si `reclame` est faux : réclamation de `generation + 1` ; `fin` → fin de l'exécution ; `doublon` → `rappels.relay_duplicate` (nom seul, niveau `info`, ajouté à la liste de `src/server/log.ts` près de l. 83) puis fin ; `panne` → compté comme un essai de relais en échec (`relaisEchoues`, borne `RELAIS_ESSAIS_MAX` inchangée) et la boucle continue ; `acquise` → `reclame = true` ;
   - si `reclame` est vrai : `etapeRelais({ ...entree, relayN: generation + 1 })` ; succès → fin ; échec → comportement actuel (l. 81-86). **La réclamation n'est jamais refaite** par la même exécution : les essais suivants de `start` portent sur la génération déjà réclamée.
   **Réclamation avant `start`**, toujours. L'exécution qui a réclamé ne se termine qu'après le démarrage réussi de son successeur, ou après `RELAIS_ESSAIS_MAX` essais (`rappels.abandoned`) : un doublon peut donc se terminer sans risque, la génération est tenue.
4. **Ce qui ne change pas** : `etapeReveil`, `reveillerRappel`, la réclamation par journée, l'ordre « réclamer puis envoyer », la borne des pannes de réveil, la région, `deploymentId: "latest"`, `demarrerRappels` (`src/workflows/index.ts` l. 190-193).

### 4. Questions à la Sécurité (posées, non tranchées ; verdict sur la PR de R-D)

- **S-R1 — Droits** : `vadrouille_app` `SELECT` et `INSERT` par colonnes, sans `claimed_at` (§ 2 point 5) ; suffisant et minimal ? `SELECT` est-il nécessaire sur toutes les colonnes, ou `SELECT (organization_id, consent_id, relay_n, claimed_run_id)` ?
- **S-R2 — Politiques par personne** (§ 2 point 6) : la condition `EXISTS` sur `reminder_consents` (lue sous la RLS de `vadrouille_app`) convient-elle, ou préférez-vous une colonne `user_id` dans `reminder_relays` avec clé étrangère vers `memberships` (modèle de 0024 l. 92-93) ? La condition `withdrawn_at IS NULL` à l'insertion est-elle voulue (elle fait échouer en `42501` une réclamation qui croise un retrait ; le code le traite comme une panne) ?
- **S-R3 — Immuabilité** : faut-il un déclencheur `BEFORE UPDATE` qui refuse toute modification, connexion d'administration comprise (modèle de `reminder_consents_withdraw_once`, 0024 l. 141-158), ou l'absence de droit `UPDATE` suffit-elle, comme pour `reminder_sends` ?
- **S-R4 — Conservation** : durée de vie des lignes égale à celle de l'accord (purge du compte), ou suppression plus tôt (fin du voyage) ; la seconde demanderait un droit `DELETE` ou une tâche de nettoyage, et la durée relève de Q27 (Samuel).
- **S-R5 — `claimed_run_id`** : stocker l'identifiant d'exécution du moteur en base est-il acceptable (pas une donnée personnelle en soi, mais il relie un accord à une exécution du monde Vercel et porte son instant de création) ? Le `CHECK` de format proposé suffit-il ?
- **S-R6 — Purge** : ordre `reminder_relays` → `reminder_sends` → `reminder_consents` (§ 2 point 8) ; rien d'autre à couvrir ?

Un refus ou une confirmation sous conditions de la Sécurité amende le seul point concerné, dans la PR de R-D (forme de 0157, en-tête l. 5).

### 5. Comportement au rejeu (deux exécutions pour un même accord, jamais deux fois la même journée)

| Cas | Ce qui se passe | Effet |
|---|---|---|
| 1. Étape de réclamation rejouée après son `COMMIT` (contexte point 4 b) | La ligne existe, `claimed_run_id` est celui de l'exécution → `acquise` | Le relais continue normalement ; aucun faux doublon |
| 2. `start` réussi côté moteur mais rapporté en échec (cas a) | La réclamation est tenue ; l'essai suivant démarre un second successeur de la même génération | Deux exécutions au plus 7 jours ; au relais suivant, l'une réclame `relay_n + 1`, l'autre trouve un autre `claimed_run_id` → `doublon`, fin |
| 3. Étape `etapeRelais` rejouée (cas b) | Comme le cas 2 | Comme le cas 2 |
| 4. Deux exécutions de la même génération atteignent le relais | La clé primaire départage : une `acquise`, l'autre `doublon` | Plus de reproduction des doublons d'une génération à l'autre (au plus 1 + le nombre d'essais de `start` ambigus de la génération courante) |
| 5. Les deux exécutions d'une même génération se réveillent pour la même journée | Une seule insertion dans `reminder_sends` réussit (`src/server/rappels/envoi.ts` l. 136 ; 0024 l. 82) | **Un seul e-mail** ; l'autre réveil ne réclame rien et n'envoie rien |
| 6. Exécution démarrée par le code d'avant R-B (état sans `relayN`) | Traitée comme la génération 0 ; réclame `relay_n = 1` | Aucune collision avec une chaîne plus ancienne (le code d'avant R-B n'écrit pas dans la table) |
| 7. Accord retiré | `fin` au réveil (`envoi.ts` l. 107-109) ou à la réclamation (§ 3 point 2.1) | Fin, rien d'envoyé, rien de réclamé |
| 8. Nouvel accord (réactivation) | Nouvel `consent_id`, donc nouvelle suite de clés ; l'ancienne chaîne se termine à son réveil (0157 § 1.7 point 4, l. 125) | Aucune interaction entre chaînes |
| 9. Retour du dernier déploiement vers un code d'avant R-B (retour arrière de l'hébergeur) | Un successeur porteur de `relayN` est refusé par l'ancien schéma strict → `fin` (`envoi.ts` l. 171-172) | Chaîne terminée sans bruit : risque du § 7, sans effet tant que l'envoi réel est fermé |

L'invariant « jamais deux fois la même journée » reste porté par `reminder_sends` seule ; aucun cas ci-dessus ne le touche.

### 6. Tâches qui en découlent

Une seule tâche `db/migrations` par cycle (règle rappelée par 0144 § 7, `docs/decisions/0144-recu-paiement.md` l. 126 et l. 133) ; R-D d'abord, R-B après la **fusion** de R-D. L'ordre dans les cycles revient au CEO.

#### 6.1 R-D — migration `reminder_relays` (rôle `data`, revue `data` et Sécurité)

Fichiers : `db/migrations/0025_rappels_relais.sql` et `.down.sql` (ou le prochain numéro libre), `db/migrations/meta/*` (générés), `db/schema/business.ts` (table `reminderRelays` près de `reminderSends`, l. 821, et contrainte unique de `reminderConsents`, l. 789), `db/README.md` (ligne du tableau, modèle de l. 118), `tests/db/helpers.ts` (`REMINDER_TABLES`, l. 149), `tests/db/roles.test.ts` (droits attendus, près de l. 83-84 et l. 164-165), nouveau `tests/db/rappels-relais.test.ts`.

Critères et tests (`tests/db/rappels-relais.test.ts`, sur le modèle de `tests/db/rappels.test.ts`) :
1. colonnes exactes (cinq), aucune colonne de texte libre ni JSON ; clé primaire ; `CHECK (relay_n >= 1)` ; `CHECK` du format de `claimed_run_id` (valeur valide acceptée, `wrun_x` et une chaîne de 65 caractères refusées) ;
2. clés étrangères toutes `NO ACTION` ; contrainte unique `(organization_id, id)` de `reminder_consents` présente ; un relais vers l'accord d'une autre organisation refusé (`23503` ou RLS) ;
3. RLS activée et forcée ; politiques de `vadrouille_app` bornées à l'organisation **et** à la personne (selon le verdict S-R2) ; politique de purge ;
4. droits : `INSERT` des quatre colonnes seulement ; `INSERT` avec `claimed_at` explicite refusé (`42501`) ; aucun `UPDATE`, `DELETE`, `TRUNCATE` pour `vadrouille_app` ;
5. isolation entre deux organisations (lecture, insertion, avec ou sans contexte) ; une personne ne réclame ni ne lit le relais de l'accord d'une autre ;
6. réclamation : seconde insertion de la même clé → `ON CONFLICT DO NOTHING` rend zéro ligne (et `23505` sans `ON CONFLICT`) ; autre `relay_n` ou autre accord passe ; accord retiré → insertion refusée (si S-R2 la confirme) ;
7. purge : vide relais, réclamations, accords, puis le voyage, sans toucher une autre organisation ; un voyage qui a un accord relayé ne se supprime toujours pas hors de la purge ;
8. descente sur base jetable (modèle de `tests/db/rappels.test.ts` l. 364-365) : droits de `vadrouille_app` retirés ; table, lignes, contrainte, politiques et purge restent ;
9. `schéma: RLS activée et forcée partout` et `schéma: aucune colonne de contenu Google` verts sans exception.
La PR note le format vérifié de l'identifiant d'exécution (§ 2 point 2) et pose les questions S-R1 à S-R6. La ligne de `MIGRATIONS_APPROUVEES` vient d'une PR de workflow à part (`owner-approved` de Samuel).

#### 6.2 R-B — réclamation du relais dans le workflow (rôle `backend`)

Prérequis : R-D fusionnée. Fichiers : nouveaux `src/server/rappels/relais.ts` et `src/server/rappels/relais.test.ts` ; `src/server/rappels/etat.ts` ; `src/workflows/rappels.ts` et `src/workflows/rappels.test.ts` ; `src/server/log.ts` (événement `rappels.relay_duplicate`) ; `src/server/config/rappels.ts` (commentaires l. 48-53 et l. 73-78 ; condition du § 1 point 3 ajoutée au commentaire de `RAPPELS_ENVOI_REEL`, l. 58-63) ; nouveau `tests/db/rappels-relais-reclamation.test.ts` ; `docs/handovers/backend.md` § 8.7 (ligne « Relais » du tableau, l. 871 ; paragraphe « Écart accepté provisoirement », l. 879, remplacé par la référence à 0162) ; listes de confinement de `tests/unit/confinement/listes/` si l'analyseur relève le nouveau module.

Critères et tests :
1. `relais.test.ts` (base simulée par `withOrg` injecté, comme `envoi.test.ts`) : `acquise` sur insertion ; `acquise` quand la ligne existe avec le même `runId` ; `doublon` avec un autre `runId` ; `fin` pour un accord absent, retiré, d'un autre voyage ou d'une autre personne ; `panne` sur erreur de base, journal `rappels.relay_failed` sans le message ; entrée invalide → `fin` sans lecture ;
2. `src/workflows/rappels.test.ts` : directives mises à jour (quatre `"use step"` au lieu de trois, l. 51 ; import `@/server/rappels/relais` ajouté à la liste, l. 53-62 ; `maxRetries` 0 pour la nouvelle étape) — ce n'est pas un affaiblissement, le test suit le nombre d'étapes ; la réclamation précède `start` ; `start` reçoit `{ ...ENTREE, relayN: 1 }` (et `relayN + 1` pour un état qui en porte un) ; `doublon` → aucun `start`, `rappels.relay_duplicate`, fin ; `fin` → aucun `start` ; `panne` comptée dans `RELAIS_ESSAIS_MAX` ; après une réclamation acquise et des `start` en échec, aucune seconde réclamation ; les tests actuels des l. 85-135 restent verts (adaptés au seul nouvel argument de `start`) ;
3. état : `EtatRappelSchema` accepte l'état à quatre clés (compatibilité) et `relayN` entier de 1 à 32 767 ; refuse `relayN` 0, négatif, décimal, ou une clé de plus ; le test `workflows: aucune donnée Google dans l'état sérialisé` couvre `relayN` comme compteur ;
4. `tests/db/rappels-relais-reclamation.test.ts` (vraie migration) : deux `reclamerRelais` concurrents pour la même génération → un `acquise`, un `doublon` ; rejeu de la même exécution → `acquise` ; deux réveils concurrents de deux exécutions pour la même journée → **un seul** message dans Mailpit simulé et une seule ligne `reminder_sends` (§ 5 cas 5) ;
5. aucun changement de `src/server/rappels/envoi.ts` ni de `tests/e2e/rappels-api.api.spec.ts` (le test accéléré n'atteint pas 7 jours de sommeil cumulé).

### 7. Risques (à lister dans la note de version)

1. Deux successeurs d'une même génération peuvent vivre jusqu'à 7 jours (§ 5 cas 2) : charge doublée pendant ce temps, aucun envoi de plus.
2. Retour arrière de l'hébergeur vers un code d'avant R-B : les successeurs porteurs de `relayN` se terminent sans bruit (§ 5 cas 9). Sans effet tant que `RAPPELS_ENVOI_REEL` est faux ; R-B sera déployée bien avant l'ouverture de l'envoi réel.
3. Code de R-B déployé sur une base où la migration de R-D n'est pas appliquée : chaque réclamation échoue, la chaîne se termine au 24e essai (`rappels.abandoned`). Couvert par la condition du § 1 point 3.
4. Le `CHECK` de format de `claimed_run_id` dépend du format des identifiants du SDK ; un changement de format à une mise à jour du SDK ferait échouer les réclamations (même effet que le risque 3). La mise à jour du SDK doit relancer `tests/db/rappels-relais-reclamation.test.ts` avec un identifiant réel.

## Textes amendés

- **0157 § 1.7 point 8** (l. 129) : « la succession est réclamée en base (écriture conditionnelle sur la ligne d'accord) » est remplacé par « la succession est réclamée en base par l'insertion d'une ligne `reminder_relays` (décision 0162) ». Le reste du point est inchangé.
- **Handover backend § 8.7** (l. 871, l. 879) et en-tête de `src/workflows/rappels.ts` (l. 32-34) : mis à jour par R-B, pas par cette PR (la PR reste `docs-only` sur la seule décision).

## Conséquences

- Q821 reçoit sa réponse : table retenue, deux tâches (R-D puis R-B), écart accepté jusqu'à elles tant que `RAPPELS_ENVOI_REEL` est faux, et condition supplémentaire pour la PR qui l'ouvrira (§ 1 point 3).
- Aucun test retiré ni affaibli ; le test des directives du workflow suit le nombre d'étapes (§ 6.2 point 2).
- Aucune donnée personnelle nouvelle hors identifiants ; aucune donnée Google.

## Questions (à reporter par le CEO dans `QUESTIONS.md`)

- **Sécurité** : S-R1 à S-R6 (§ 4), verdict sur la PR de R-D.
- **CEO** : ouvrir R-D (rôle `data`) puis R-B (rôle `backend`) et les placer dans les cycles ; R-D doit-elle attendre la fusion de #866 (M1i), comme B4e (0144 § 7) ?
- **Samuel** : rien de nouveau. La durée de conservation des relais suit Q27 (S-R4).

## Quand revoir

- Si le Workflow SDK publie une interface native « démarrer et réserver un jeton » (idempotency.mdx l. 148-149) : comparer avec la table.
- Si la Sécurité refuse `claimed_run_id` (S-R5) : revoir la reconnaissance d'une étape rejouée (§ 3 point 2.3).
- Si le relais passe à une durée plus courte que 7 jours (0157 § 1.7 point 8) : le volume de lignes suit.
