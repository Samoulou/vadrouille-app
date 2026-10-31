# 0157 — M6 sur `api` : lien privé par `share_links`, calendrier `.ics`, rappels par workflow (M6-TL, T1 à T9) ; avis de la Sécurité (S1 à S6)

Statut : **acceptée**. Décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`) pour T1 à T9, avec l'**avis de la Sécurité** (relecture des chemins sensibles : `db/`, partage, secrets, e-mail, règles Google) pour S1 à S6. Définitive dès sa fusion, sans délai de veto (décision 0093). À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »), avec les risques du § 5. Samuel peut la remettre en cause à tout moment par une nouvelle décision. Rien n'est tranché ici de ce qui revient à Samuel (canal et contenu des rappels, sous-traitant hors UE, plafond, protection Vercel, production), au Product Owner, à l'UX/UI (U1 à U4) ni au CEO (C1, ordre des cycles) : ces points sont au § 4 et dans « Questions ».

Date : 2026-10-31 · Décideur : Tech Lead (T1 à T9) ; Sécurité (S1 à S6, avis rendu dans cette décision) · Ticket : #986 · Spécification : `specs/M6-pendant-le-voyage-api.md` (PR #985, fusionnée ; « Prérequis » points 2 et 3, § 10) · `main` relu : `27a2262` · Références : `specs/F10-pendant-le-voyage.md` (F10-PO-13 à F10-PO-21, « Niveau d'autorisation », « Exigences reportées à B12 »), 0039 (F10-TL-7, F10-TL-8, F10-TL-14), 0135 (§ 3, § 7, § 8, § 9), 0138 (§ 1 C1 à C5, § 3, § 9), 0002, 0007, 0009, 0011 § 6, 0048 § 1, 0060 § 1.4, 0147 § 6.4, `docs/handovers/backend.md` (§ 6 table `share_links`, § 8, § 12 « Vue partagée », § 10 ligne B12), `docs/handovers/frontend.md` (§ 10, § 13) · Code relu : `db/migrations/0000_socle.sql` (table `share_links`, index `share_links_one_active_idx`), `db/migrations/0001_securite.sql` (§ 4.1, § 4.6, § 5.1, § 5.3, § 6.1 `resolve_share_link`, § 6.5 vues partagées), `db/migrations/0002_place_coordinates.sql`, `src/adapters/share-guard.ts` et son test, `src/adapters/api-guard.ts`, `src/adapters/auth-guard.ts`, `src/adapters/index.ts` (`getShareAdapter`, `shareButtonVisible`), `src/adapters/share-views.ts`, `src/contracts/share.ts`, `src/server/actions/partage.ts`, `src/server/positions/lecture.ts`, `src/server/config/limites.ts`, `src/server/mail/{port,resend,apercu-pret}.ts`, `src/server/auth/index.ts` (composition des notifications), `src/lib/dates.ts` (`accessUntil`), `eslint.config.mjs` (`SERVER_PATTERN`, `SERVER_ROUTE_PATTERN`), `eslint-rules/route-handlers.mjs`, `tests/db/{partage,schema,roles}.test.ts`.

Numérotation : `main` va jusqu'à 0156 ; aucune PR ouverte n'ajoute 0157 (numéro réservé par le CEO, ticket #986).

**Ce que cette décision n'engage pas.** Aucun code, aucun test, aucune migration dans cette PR. Aucune dépense, aucun compte externe, aucune variable d'environnement créée (une variable prévue par 0135 § 3 est au contraire abandonnée : T1). Aucun appel Google nouveau ; aucune donnée Google stockée, envoyée ou mise dans un prompt en plus. Elle prévoit deux migrations (M6a-D, M6c-D) et des modifications de tests de base ; elles seront faites par leurs tâches, sous cette décision écrite, sans retrait ni affaiblissement d'un test (§ 3).

## Contexte

1. **Deux formes de lien.** Le site d'essai (`prototype`) partage par **lien signé sans stockage** (0135, PR #827 fusionnée le 2026-10-28) : jeton déterministe, non révocable un par un, clé dérivée de `P0_RUN_TOKEN`. La vraie app (`api`) a, depuis B1, la table `share_links` (empreinte SHA-256 de 32 octets, `expires_at`, `revoked_at`, un lien actif par voyage par index unique partiel), la fonction `resolve_share_link` et trois vues sous `vadrouille_share`, mais **aucun code** ne les lit ni ne les écrit, et `shareAvailable()` est faux avec `DATA_ADAPTER=api`.
2. **Écarts relevés par la spécification** (en tête, et § 10) : `expires_at` stocké alors que F10 (l. 454) dit la fin « calculée à la lecture » ; vue `shared_checklist` contraire à F10-PO-14 ; positions de la carte partagée (0011 § 6 et le handover § 12 interdisent toute lecture de `place_coordinates` depuis la vue partagée, 0135 § 8 les y lit pour le site d'essai) ; droit `UPDATE` de `vadrouille_app` sur toutes les colonnes de `share_links` (`0001_securite.sql` § 4.1) ; `VADROUILLE_SHARE_SECRET` de 0135 § 3, inutile avec un jeton aléatoire.
3. **Faits relevés pour cette décision**, en plus de la spécification :
   - `betterAuthAllowed` (`src/adapters/auth-guard.ts`) n'est vrai qu'en `local` et en `ci`, et **exige** `VADROUILLE_ENV` ou `VERCEL_ENV` déclaré : `NODE_ENV=test` seul ne suffit pas. M1h l'ouvrira pour la seule préversion `mvp-essai`.
   - Hors de `src/server`, une route de `src/app/**` n'importe de `src/server` que les actions (`SERVER_PATTERN`, 0020 § 11) ; un `route.ts` de `src/app/api/` n'importe que `@/server/routes/*` (`SERVER_ROUTE_PATTERN`, `ligne/route-handlers`, B4a). `src/domain` n'est atteint que par `src/server` (0048 § 1).
   - `src/server/positions/lecture.ts` est la seule lecture de `place_coordinates` ; ses importateurs admis sont `cache-positions.ts`, `src/server/voyages/**` et les tests (0060 § 1.4). Les positions du MVP expirent à 29 jours (0060 § 2).
   - Une page de l'App Router ne sait rendre que 200, 404 (`notFound()`) ou 500 : elle ne peut pas répondre 429. Aucun `proxy.ts` (ex-`middleware.ts`) n'existe dans le dépôt.
   - L'index `share_links_one_active_idx` porte sur `revoked_at IS NULL` seulement : un lien expiré mais non désactivé reste « actif » pour l'index.
   - L'e-mail de M7a passe déjà par le port `NotificationMailer`, composé par `src/server/auth/index.ts`, seul importateur de `src/server/mail/resend.ts` (ligne 7b de 0138 § 9 tenue). Q678 (Sécurité) demande d'écrire l'amendement de 0138 § 9 pour cet usage.
   - Aucune fonction du dépôt ne convertit une heure locale d'un fuseau en instant UTC (`src/lib/dates.ts` calcule en UTC sans fuseau ; `localDateAt` va dans l'autre sens).

## Décision

### 1. Tech Lead (T1 à T9)

#### 1.1 T1 — Option (A) : `share_links` sur `api`, lien signé au seul site d'essai

**Retenu : (A)**, la recommandation du Product Owner.
- Sur `api`, le lien est un **jeton aléatoire** de 32 octets (`crypto.randomBytes` de Node, `base64url`, 43 caractères, `SHARE_TOKEN_PATTERN`), dont seule l'empreinte SHA-256 est écrite dans `share_links`. Un jeton de la forme signée (`SIGNED_SHARE_TOKEN_PATTERN`) reçu sur `api` répond 404 **sans aucune lecture de la base** (critère 13 de M6a).
- Sur `prototype`, le lien signé de 0135 reste tel quel, sans révocation un par un. Aucun code de `prototype` ne change dans M6.
- **(B) rejetée** : elle ferait écrire le site d'essai dans le schéma principal ou ajouterait une table au schéma `prototype`, contre le plan § 0.2 point 2 et § 10 (aucune tâche nouvelle sur le prototype).
- **(C) rejetée** : deux mécanismes pour un même lien (signature puis empreinte), une clé à poser et à faire tourner, une charge lisible par qui a le lien, pour aucun gain : l'empreinte suffit à retrouver le lien et à le révoquer.
- **Sort du lien signé** : il disparaît **avec** le site d'essai (plan § 0.2 point 3, retrait décidé par le CEO après le jugement de Samuel), dans la PR qui retire l'adaptateur `prototype` : `src/adapters/signed-share.ts`, `share-signed-token.ts`, `src/server/essai/partage.ts`, `SIGNED_SHARE_TOKEN_PATTERN` et l'alternative de `CreatedShareLinkSchema` et de `parseShareToken`. Leurs tests partent avec eux, sous la décision écrite de ce retrait (`CLAUDE.md`), pas avant.
- **`VADROUILLE_SHARE_SECRET` n'est pas créée.** 0135 § 3 la nommait « pour B12 et l'adaptateur `api` » : cette destination tombe (S3 : un jeton aléatoire n'a besoin d'aucun secret). Elle ne reste envisageable que pour le site d'essai, si la Sécurité l'exigeait un jour (0135 § 3, dernier tiret) ; rien ne l'exige. 0135 § 7 (« adaptateur réel qui vérifie la signature **puis** l'empreinte ») et le risque « rotation future vers `VADROUILLE_SHARE_SECRET` » de 0135 § 11 sont sans objet. Amendement de 0135 : § 3 « Textes amendés ».

#### 1.2 T2 — Garde `apiShareAvailable`

Nouvelle fonction **pure** de `src/adapters/share-guard.ts`, lue sur l'objet d'environnement reçu (valeur par défaut `process.env`), sur le modèle de `realShareAvailable` :

```
apiShareAvailable(env) =
  !isProductionTarget(env)
  && adapterChoice(env.DATA_ADAPTER) === "api"
  && authAdapterChoice(env) === "better-auth"
  && betterAuthAllowed(env)
```

- `isProductionTarget` (et non `isProductionDeployment`) : il ne fait que fermer, et couvre en plus `VERCEL_TARGET_ENV=production` (0140 § 3 point 6).
- `betterAuthAllowed(env)` rend la garde **identique au domaine de `assertApiAdapter`** : aujourd'hui `local` et `ci` ; demain, la seule préversion `mvp-essai` si M1h amende `betterAuthAllowed`, sans autre changement ici. Aucune ouverture propre au partage n'est créée sur un déploiement.
- `shareAvailable(env)` devient : production → faux ; sinon `(shareDemoAvailable(env) && DATA_ADAPTER=mock) || realShareAvailable(env) || apiShareAvailable(env)`. Les trois branches sont exclusives (adaptateurs différents).
- `getShareAdapter` : branche `api` derrière `apiShareAvailable()` **et** `assertApiAdapter()` (filet de sécurité qui lève, comme aujourd'hui pour les autres lectures `api`) ; aucun repli vers `mock`.
- `shareButtonVisible` sur `api` : `Trip.unlocked` et fin du partage non passée (règle du § 1.3), sans contrôle de session dans la garde (la session est exigée par les actions, F10 « Niveau d'autorisation »).
- **Test amendé par écrit** : `src/adapters/share-guard.test.ts` garde **toutes** ses lignes, sans changement de résultat (les trois lignes `DATA_ADAPTER: "api"` actuelles, sans `better-auth` ni environnement déclaré, restent fausses). Lignes ajoutées : vrai avec `{ DATA_ADAPTER: "api", AUTH_ADAPTER: "better-auth", VADROUILLE_ENV: "ci" }` et avec `VADROUILLE_ENV: "local"` ; faux sans `AUTH_ADAPTER`, avec `AUTH_ADAPTER=mock`, sans environnement déclaré, avec `VADROUILLE_ENV=staging`, `production`, `VERCEL_ENV=production`, `VERCEL_TARGET_ENV=production`, et avec `VADROUILLE_DEMO_SHARE=1` seul. Un test vérifie que `apiShareAvailable(env)` vrai implique que `assertApiAdapter` ne lève pas sur le même environnement.
- **Correction du critère 1 de M6a** (la décision prime sur la spécification) : « vrai avec `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth` et `VADROUILLE_ENV=ci` (ou `local`) » ; `NODE_ENV=test` seul ne l'ouvre pas.
- Ordre dans les trois actions de `src/server/actions/partage.ts` sur `api` : garde → session (`unauthenticated`) → entrée → voyage dans l'organisation, débloqué, **personne propriétaire** (`trips.created_by = ctx.userId`, sinon `not_found`) → limite `partage-lien` (§ 2.1 ; espèce `trip` après le contrôle du voyage, 0147 § 6.4 point 1) → écriture. `getShareStatus` n'est pas limité.
- **Événements de journal `partage.lien_cree` et `partage.lien_desactive` : non retenus.** Les événements du limiteur suffisent à voir un abus ; un événement sans champ n'apprend rien d'autre. Un ajout ultérieur demande une décision.

#### 1.3 T3 — `expires_at` : borne stockée **et** règle de F10-TL-7 à la lecture

1. **Valeur écrite à la création** : `expiresOn = accessUntil(trip.end, OFFER_CONFIG.accessDaysAfterReturn)` est calculé **en TypeScript, par la seule implémentation** (`src/lib/dates.ts`, F10-TL-7 point 1), sur le voyage relu **dans la transaction de création** ; la base reçoit cette date en paramètre et pose `expires_at = (($1::date + 1)::timestamp AT TIME ZONE t.time_zone)`, lu sur la ligne `trips` verrouillée. C'est le **premier instant du jour qui suit `expiresOn` à l'heure de la destination**, calculé par les règles de fuseau de Postgres (un minuit absent pour un changement d'heure est décalé par Postgres vers l'instant valide suivant). Exemple d'Édimbourg : `expiresOn` = 2026-10-03, `expires_at` = `2026-10-03T23:00:00Z` (critère 5 de M6a, inchangé). Aucun calcul de date dans le SQL au-delà de `+ 1` jour : la durée de 30 jours n'existe qu'en un endroit.
2. **Lecture : les deux règles, la plus proche l'emporte**, comme 0135 § 6. La base refuse un lien dont `expires_at <= now()` (`resolve_share_link`, vues, politiques : inchangés) ; l'adaptateur refuse en plus, sur le voyage **tel qu'il est lu** par la vue (`shared_trip`), si `localDateAt(now, trip.timeZone) > accessUntil(trip.end, …)`, `now` étant l'horloge de la portée. Les deux règles disent la même chose tant que les dates du voyage n'ont pas changé ; le test de M6a (critère 10) les vérifie ensemble.
3. **Dates du voyage modifiées après la création (M4)** : `expires_at` **n'est jamais réécrit** (T9 retire le droit). Fin avancée : la règle de lecture coupe plus tôt. Fin repoussée : le lien expire à sa borne stockée ; la personne peut créer un nouveau lien, qui reçoit la nouvelle borne. Aucun code de M4 ne touche `share_links`.
4. **État** (`getShareStatus`) : `active` seulement si `revoked_at IS NULL` **et** les deux règles tiennent ; « valable jusqu'au » = la plus proche des deux dates (`expiresOn` recalculé, et la date locale de `expires_at − 1 µs` dans le fuseau du voyage). Un lien expiré non désactivé se lit `{ active: false }`.
5. **Création après un lien expiré** : l'index `share_links_one_active_idx` compte un lien expiré non désactivé comme actif ; la création désactive donc toujours le lien de l'index (`revoked_at`) avant d'insérer, qu'il soit valide ou expiré (§ 1.9).
6. **Concurrence** : la transaction de création verrouille d'abord la ligne du voyage (`SELECT … FROM trips … FOR UPDATE`, droit `UPDATE` de `vadrouille_app` sur `trips` déjà accordé), puis désactive, puis insère. Deux créations simultanées s'exécutent l'une après l'autre ; l'index reste le dernier verrou. Une violation `23505` malgré tout est rejouée **une fois** ; au second échec, l'action rend `internal` (code existant), jamais une page 500 (critère 7).
7. **Amendement de F10** (consigne pour **M6a**, qui le porte dans sa PR, sans autre changement du texte) : `specs/F10-pendant-le-voyage.md` l. 454, « la date de fin n'est pas stockée : elle se calcule à la lecture (`accessUntil`, F10-PO-21) » se lit : « la date de fin est stockée comme borne (`expires_at`, premier instant du jour qui suit `accessUntil(trip.end, accessDaysAfterReturn)` à l'heure de la destination, écrite à la création, jamais modifiée) et recalculée à la lecture sur le voyage tel qu'il est lu ; la plus proche des deux l'emporte (décision 0157 § 1.3) ». F10-PO-21 ne change pas.

#### 1.4 T4 — Carte de la vue partagée : positions lues dans le cache, organisation du lien

**Retenu : la vue partagée de `api` a la carte Google** (F10-PO-14, Q140, F10-TL-14), avec des positions lues dans `place_coordinates`, aux conditions suivantes :
1. **Aucun droit nouveau en base.** Aucune vue partagée sur `place_coordinates`, aucun droit pour `vadrouille_share` ni `vadrouille_fn_share_views` : le test `partage: la vue partagée n'expose jamais place_coordinates` (`tests/db/schema.test.ts`) reste **tel quel**.
2. **Qui lit** : la lecture est faite par `vadrouille_app`, par le seul module `src/server/positions/lecture.ts` (`lirePositions`), appelé depuis une fonction de `src/server/voyages/` (importateur déjà admis par 0060 § 1.4 ; nom proposé `src/server/voyages/carte-partagee.ts`), elle-même appelée par la lecture de la vue partagée (`src/server/partage/vue.ts`). **0060 § 1.4 ne change pas.**
3. **Dans l'organisation du lien, et seulement après un lien valide** : `app.organization_id` est posé, par paramètre lié et pour la seule transaction, à l'`organization_id` rendu par `resolve_share_link` **avec l'état `valid`**, jamais à une valeur tirée de la requête du visiteur ; aucun `app.user_id` n'est posé (aucune personne). La lecture a lieu dans la même transaction que `resolve_share_link` et les vues (après `RESET ROLE` qui ramène de `vadrouille_share` à `vadrouille_app`), ou dans une seconde transaction qui rappelle d'abord `resolve_share_link` ; au choix du backend, à condition qu'aucune position ne soit lue pour un lien qui n'est pas `valid` dans la transaction qui la lit.
4. **Quels identifiants** : seulement les `placeId` des items `stop` des journées de l'instantané projeté par `shared_trip_version` (version courante du voyage du lien). Ni événements, ni idée « Surprends-moi », ni terminus (aucun point de logement, F10-PO-14), ni identifiant reçu du visiteur.
5. **Ce qui sort** : les positions ne quittent le serveur que dans `SharedDayMap` / `SharedMapPoint` (`lat`, `lng`, clé locale `key`, jamais `placeId`), pour la carte Google seulement (`DayMap`), réponses `private, no-store` (F10-TL-8). Jamais dans un journal, une trace, un événement ni un état de workflow.
6. **Aucun appel payant pour un visiteur** : une position absente ou expirée du cache (29 jours, 0060 § 2) n'est **pas** relue chez Google ; le point est omis, et sans aucun point la vue montre l'état de remplacement (`MapFallback`), jamais une autre carte. Conséquence assumée : un voyage dont les positions n'ont pas été relues depuis plus de 29 jours (par la personne elle-même) se partage sans carte.
7. **Amendements** (consigne pour **M6a**, qui porte les deux textes dans sa PR) :
   - 0011 § 6, dernier tiret, « ni `getSharedTrip` ni `getPlaceDetails` appelé depuis la vue partagée n'en lisent quoi que ce soit » se lit : « `getPlaceDetails` n'est pas appelé depuis la vue partagée ; `getSharedTrip` et `getSharedDay` ne lisent `place_coordinates` que selon 0157 § 1.4 (rôle `vadrouille_app`, organisation du lien valide, `placeId` des étapes de la version partagée, aucune relecture) ». Le reste du tiret (aucune vue, aucun droit pour les rôles du partage) est inchangé. Une ligne de renvoi est ajoutée en tête de 0011.
   - `docs/handovers/backend.md` § 12, « Vue partagée », phrase « **aucune coordonnée** : ni `getSharedTrip` ni `getPlaceDetails` appelé depuis la vue partagée ne lisent ou n'exposent `place_coordinates` » : même nouvelle lecture, avec renvoi à 0157 § 1.4 ; et ligne du tableau des tests « La vue partagée n'expose jamais `place_coordinates` » : intitulé inchangé, portée précisée (« aucune vue, aucun droit des rôles du partage »).
8. **Tests exigés de M6a** (en plus du critère 17) : (a) positions lues seulement pour les `placeId` d'étapes de la version partagée : une position sentinelle d'un autre voyage de la même organisation n'est pas transmise ; (b) un lien de l'organisation A ne transmet jamais une position de l'organisation B, même pour un même `placeId` ; (c) lien désactivé ou expiré : aucune requête vers `place_coordinates` (client simulé) ; (d) position absente : aucun appel au double de `src/grounding`, point omis ; aucune position : état de remplacement ; (e) aucun `placeId` dans le HTML ni dans les données transmises.

#### 1.5 T5 — `shared_checklist` retirée (migration M6a-D)

**Retenu : retrait**, avec l'avis de la Sécurité (S4).
- Une vue sans lecteur reste une surface : avec un jeton valide, sous `vadrouille_share`, elle rend libellés et liens de réservation, ce que F10-PO-14 interdit de montrer. Aucune tâche ne la lira (M6a lit `shared_trip` et `shared_trip_version` seulement).
- La migration **M6a-D** (§ 3) supprime la vue, la politique `checklist_items_fn_share_views` et le droit `SELECT (…) ON checklist_items TO vadrouille_fn_share_views`, qui ne servent qu'à elle.
- **Tests modifiés sous cette décision**, sans affaiblissement : `tests/db/roles.test.ts` (`SHARED_VIEWS` passe à `["shared_trip", "shared_trip_version"]` ; ajout : `vadrouille_fn_share_views` n'a plus aucun droit sur `checklist_items`), `tests/db/schema.test.ts` (liste des vues du test `partage: la vue partagée n'expose jamais place_coordinates`), `tests/db/partage.test.ts` (l. 170 et l. 191 : la lecture de `shared_checklist` est retirée ; ajout : `to_regclass('public.shared_checklist')` est nul, et sous `vadrouille_share` avec un jeton valide, `SELECT` sur `checklist_items` est refusé). Aucun autre test n'est touché.
- Textes à mettre à jour par M6a-D : `docs/handovers/backend.md` § 6 (ligne `checklist_items`, « lecture partagée par la vue `shared_checklist` » retirée) ; 0007, paragraphe « Lien privé » (« lit les vues `shared_trip`, `shared_trip_version` et `shared_checklist` » se lit sans la troisième, renvoi à 0157 § 1.5).

#### 1.6 T6 — Calendrier : route `GET` de `src/app/api/`, fonction pure dans `src/server`

1. **Adresse** : `GET /api/v1/voyages/[id]/calendrier`, fichier `src/app/api/v1/voyages/[id]/calendrier/route.ts`, qui n'importe que `@/server/routes/calendrier` (`SERVER_ROUTE_PATTERN` et `ligne/route-handlers` de B4a : **aucune exception nouvelle**). La spécification proposait `/voyages/[id]/calendrier` : une route sous `src/app/voyages/` ne peut importer de `src/server` que les actions (`SERVER_PATTERN`), d'où ce chemin.
   - Rejeté : une **action serveur** qui rend le texte, téléchargé par un `Blob` côté navigateur. Sur un téléphone, une adresse servie en `text/calendar` ouvre directement l'ajout à l'agenda ; un `Blob` téléchargé passe par les fichiers. Le bouton est un lien (`<a href>`) vers la route.
   - Méthodes : `GET` seulement (Next.js répond 405 aux autres).
2. **Gestionnaire** `src/server/routes/calendrier.ts` : même contexte de session que le Séjour, lecture par `getTripReader()` (adaptateurs `mock` et `api`), voyage inconnu, d'une autre organisation ou non débloqué → **404 sans contenu** ; sans session sur `api` → même réponse que le Séjour sans session. `prototype` : 404 (plan § 10).
3. **Fonction pure** `src/server/calendrier/ics.ts` (`import "server-only"`, comme tout `src/server`) : `(programme, origine, maintenant) → texte iCalendar`. Ni `src/domain` (le moteur, 0048 § 1 : rien à y gagner, et son graphe est fermé), ni `src/lib` (le code n'a aucun usage dans le navigateur). Elle n'importe que des types de `@/contracts`, `node:crypto` (UID) et la conversion d'heure du point 5.
4. **Heures en UTC** (`DTSTART:…Z`, `DTEND:…Z`), **sans `TZID` ni `VTIMEZONE`** : un `VTIMEZONE` correct demande les règles du fuseau écrites à la main ; l'UTC est lu par tous les agendas. `DTEND` absent si `Stop.end` l'est.
5. **Conversion heure locale → instant** : une seule fonction, `instantLocal(date, heure, timeZone)`, **ajoutée à `src/lib/dates.ts` par M6b** (pure, `Intl` seulement, admise par T4), réutilisée par M6c (§ 1.7). Heure inexistante (passage à l'heure d'été) : décalée de la durée du saut ; heure ambiguë (retour à l'heure d'hiver) : la première occurrence (règle « compatible » de `Temporal`). Tests : Londres en été, Lisbonne, passage à l'heure d'hiver du 2026-10-25 (spécification § 6.2), et un saut d'heure d'été.
6. **`UID`** : `base64url(SHA-256("vadrouille/calendrier/v1|" + tripId + "|" + stopId))`, 22 premiers caractères, suivi de `@vadrouille.invalid`. Stable par voyage et par étape, sans identifiant interne en clair, et sous le domaine réservé `.invalid` (RFC 2606) : aucun domaine n'est revendiqué (Q640 ouverte). `SEQUENCE` = version courante, `DTSTAMP` = instant du téléchargement, `METHOD:PUBLISH`.
7. **Limite connue**, assumée par le texte du § 7 de la spécification (« ajoute-le à nouveau ») : une étape remplacée change d'identifiant, donc d'`UID` ; l'ancienne entrée reste dans l'agenda (aucun `CANCEL`, aucun état gardé).
8. **Échappement** (RFC 5545 § 3.3.11) de `\`, `;`, `,` et des retours à la ligne ; **tout autre caractère de contrôle (U+0000 à U+001F sauf la tabulation, U+007F) est retiré** ; pliage à 75 octets sans couper un caractère UTF-8 ; lignes en CRLF. Le nom d'une étape vient de l'IA ou de la personne (lieu à soi) : sans ce contrôle, un retour à la ligne injecterait une propriété (`ATTACH`, `VALARM`) dans le fichier (S5).
9. **Sans `APP_URL`** (origine nulle) : ni `URL` ni lien dans `DESCRIPTION` ; le reste du fichier est servi.
10. **Inventaire** : la route entre dans `tests/e2e/routes.ts` et dans les contrôles de `next.config.ts` si l'inventaire l'exige ; en-têtes du point 6 de la spécification § 4 et de S5.

#### 1.7 T7 — Rappels : un workflow par accord, réveils bornés, rien de métier dans l'état

1. **Principe retenu** (Workflow SDK, 0009) : un workflow `rappels` par **accord**, démarré par l'action après l'écriture de l'accord, entrée `{ organizationId, tripId, userId, consentId }` et rien d'autre (0009 point 3 ; handover § 8). Le corps du workflow est mince ; la logique vit dans `src/server/rappels/` (étapes testables avec une horloge injectée).
2. **Réveils bornés** : le workflow dort jusqu'au **plus proche** de l'instant du prochain envoi et de **24 heures** (`REVEIL_MAX_HEURES = 24`, `src/server/config/rappels.ts`). À chaque réveil, une étape relit tout en base (accord, voyage, journées, adresse, spécification § 5.3 point 3) et recalcule le prochain envoi. Raisons : un voyage dont les dates changent (M4) est rattrapé dans les 24 heures ; un accord retiré ou un voyage supprimé termine l'exécution au plus tard 24 heures après ; aucune exécution ne dort des mois sur un calcul périmé. Coût : au plus une étape de lecture par jour et par accord actif.
3. **Arrêt sur retrait : fin au réveil.** Aucune annulation d'exécution (l'interface stable de 0009 point 2 reste `startWorkflow` et `getRun`) ; la relecture précède toujours la réclamation, donc un retrait n'envoie plus rien, même avant la fin de l'exécution.
4. **Un seul workflow « valide » par voyage et par personne**, garanti en base, pas par le moteur de workflows : l'exécution porte l'identifiant de **son** accord (`consentId`) ; à chaque réveil, si cet accord n'est plus l'accord actif (retiré, ou remplacé par un nouvel accord), l'exécution se termine sans rien envoyer. Un double démarrage pour le même accord ne double rien : la **réclamation par journée** (§ 1.8, clé primaire) est validée avant l'appel du transport (même principe que M7a), et aucune nouvelle tentative n'est faite après un échec (0138 C4).
5. **Échec du démarrage** : si `startWorkflow` échoue après l'écriture de l'accord, l'action pose `withdrawn_at` sur cet accord (seconde transaction) et rend une erreur (texte « Impossible de modifier les rappels pour le moment. ») : jamais un accord affiché actif sans exécution.
6. **Mondes** : local et CI avec le monde local ; `staging` (`mvp-essai`) avec le monde Vercel ou le monde Postgres (0009 point 4) ; l'état métier (accords, réclamations) vit dans Postgres, jamais dans un service propre à Vercel (0002 : ni KV, ni Edge Config, ni cron de la plateforme).
7. **À vérifier par M6c, résultat noté dans sa PR** (documentation du Workflow SDK 5.1.0 et du monde Vercel ; aucune hypothèse) : durée maximale d'un `sleep` et d'une exécution dans chaque monde ; code qui reprend une exécution endormie après un nouveau déploiement (celui du déploiement de départ, ou le dernier) ; coût d'une exécution endormie. **Si** une limite est inférieure à 400 jours, **ou si** une exécution endormie reprend sur le code de son déploiement de départ, M6c ajoute un **relais** : après 7 réveils, l'exécution démarre une exécution qui lui succède pour le même accord et se termine ; la succession est réclamée en base (écriture conditionnelle sur la ligne d'accord) pour qu'une seule exécution succède. Sinon, le relais n'est pas exigé.
8. **Tests** : critères 4 à 9 et 11 de la spécification par les étapes de `src/server/rappels/` avec horloge et `sleep` injectés ; **un** test sur le monde local avec des durées de quelques secondes prouve le câblage (démarrage, réveil, envoi vers Mailpit, fin). L'état sérialisé est couvert par `workflows: aucune donnée Google dans l'état sérialisé`, étendu (aucune adresse, aucun texte).

#### 1.8 T8 — Migration des rappels : tâche `data` à part, **M6c-D**

**Retenu : tâche `data` séparée, M6c-D, avant M6c**, comme M5-D (0147) : la migration a son propre circuit (revue `data` et Sécurité, ligne de `MIGRATIONS_APPROUVEES` par une PR de workflow, application par Samuel sur Neon, plan § 0.2 point 6), et M6c reste une tâche de serveur, de workflow et d'interface.

Forme (noms en anglais, comme les autres tables) :
- **`reminder_consents`** : `id` (`uuid`, clé), `organization_id`, `trip_id`, `user_id`, `consented_at` (`timestamptz NOT NULL DEFAULT now()`), `withdrawn_at` (`timestamptz`, nul tant que l'accord vaut) ; clé étrangère `(organization_id, trip_id)` vers `trips` et `user_id` vers `users` ; `CHECK (withdrawn_at IS NULL OR withdrawn_at >= consented_at)` ; index unique partiel `(organization_id, trip_id, user_id) WHERE withdrawn_at IS NULL` (un accord actif par voyage et par personne). **Une ligne par accord** : réactiver crée une ligne (l'historique des accords et retraits reste, avec leurs instants) et le nouvel `id` est le `consentId` de la nouvelle exécution. Déclencheur `BEFORE UPDATE` : une fois `withdrawn_at` posé, aucune modification de la ligne.
- **`reminder_sends`** : `organization_id`, `trip_id`, `user_id`, `day_index` (`smallint`, `CHECK (day_index >= 1)`), `claimed_at` (`timestamptz NOT NULL DEFAULT now()`) ; **clé primaire `(organization_id, trip_id, user_id, day_index)`** : la réclamation est l'insertion ; une seconde insertion échoue, rien n'est envoyé. La personne est dans la clé pour qu'un second voyageur, plus tard, ne soit pas privé de son rappel ; au MVP, cela revient à « une fois par voyage et par journée ».
- **Aucune adresse, aucun texte, aucune donnée Google** ; aucune colonne d'horaire d'envoi (recalculé à chaque réveil).
- **Droits de `vadrouille_app`** : `reminder_consents` : `SELECT`, `INSERT`, `UPDATE (withdrawn_at)` ; `reminder_sends` : `SELECT`, `INSERT` ; ni `DELETE` ni `TRUNCATE`. RLS activée et forcée, politique type de `vadrouille_app` (organisation de la transaction) ; `vadrouille_fn_purge` : `SELECT (organization_id)`, `DELETE`, politique de purge, et `purge_organization_data` supprime les deux tables (avant `trips`). `.down.sql` fourni.
- **Tests** : `tests/db/rappels.test.ts` (isolation entre deux organisations, unicité de l'accord actif, unicité de la réclamation, déclencheur, purge, `CHECK`) ; `tests/db/roles.test.ts` (droits attendus ajoutés) ; `schéma: RLS activée et forcée partout` et `schéma: aucune colonne de contenu Google` restent verts sans exception nouvelle.
- `db/schema/business.ts` décrit les deux tables. Le numéro de migration est le prochain libre au moment de la PR.

#### 1.9 T9 — `UPDATE` de `vadrouille_app` sur `share_links` réduit à `revoked_at` (migration M6a-D)

**Retenu, avant M6a**, avec l'avis de la Sécurité (S4) :
- `REVOKE UPDATE ON public.share_links FROM vadrouille_app; GRANT UPDATE (revoked_at) ON public.share_links TO vadrouille_app;`. `token_hash`, `expires_at`, `trip_id`, `organization_id`, `created_by` et `created_at` ne sont plus modifiables par l'application. Le verrou de ligne `FOR UPDATE` reste possible (droit `UPDATE` sur une colonne).
- **Désactivation définitive** : déclencheur `BEFORE UPDATE` sur `share_links` (fonction ordinaire, propriétaire `vadrouille_owner`, `search_path` fixé) qui refuse toute mise à jour d'une ligne dont `revoked_at` n'est pas nul, refuse `revoked_at` nul dans la nouvelle ligne, et pose `revoked_at = now()` (l'instant vient de la base, jamais de l'appelant). Une erreur de code ne peut donc pas réactiver un lien.
- Tests de M6a-D : `tests/db/roles.test.ts` (droit `UPDATE` de `vadrouille_app` sur `share_links` limité à `revoked_at`, sur le modèle du test de `checkouts`) ; `tests/db/partage.test.ts` (réactivation refusée ; `expires_at` et `token_hash` non modifiables ; `revoked_at` posé par la base).
- Le tableau des droits du handover (§ 6, table `share_links`) et 0007 (tableau « Droits de `vadrouille_app` par table ») sont mis à jour par M6a-D, avec renvoi à 0157 § 1.9.

### 2. Sécurité (S1 à S6)

#### 2.1 S1 — Limites : **approuvées**, avec la réponse 429 par le proxy de Next.js
- `partage-lien` (création, remplacement, désactivation) : `{ kind: "ip", windowSeconds: 3600, threshold: 20 }` puis `{ kind: "trip", windowSeconds: 86400, threshold: 10 }`, dans `RATE_LIMITS`. Au-delà : `rate_limited` (code existant), **rien n'est écrit**. L'espèce `trip` n'est évaluée qu'après le contrôle du voyage dans l'organisation et de la personne propriétaire (0147 § 6.4 point 1).
- `partage-vue` (`RP` et `RPJ`) : `{ kind: "ip", windowSeconds: 60, threshold: 60 }`. Ordre de F10-PO-15 : garde ; forme du jeton (sinon 404 **sans compter ni lire**) ; limite ; puis lecture.
- **Réponse 429** : une page ne peut pas la rendre (Contexte, point 3). Forme retenue : **`src/proxy.ts`** de Next.js (fichier standard, pas une API de Vercel, 0002), `matcher` limité à `/p/:path*`, qui, seulement si `apiShareAvailable()` et si le jeton a la forme aléatoire, appelle le limiteur existant (`action_rate_limits`, aucune table nouvelle) par un module de `src/server/partage/` et, au-delà de la limite, répond **429** avec la page d'erreur commune, **sans lire `share_links`**, et pose lui-même les en-têtes de F10-TL-8 (`private, no-store`, `Referrer-Policy: strict-origin`, `X-Robots-Tag: noindex, nofollow`) et `Retry-After`. M6a vérifie que Next.js 16.4.1 exécute ce proxy dans le runtime Node.js (accès à la base) et le note dans sa PR. **Si ce n'est pas le cas, M6a ne contourne pas** : elle le signale et le Tech Lead tranche à la revue, avec un nouvel avis de la Sécurité.
- Le corps 429 ne dit jamais si le jeton est valide. Texte et rendu de la page : UX/UI (U4) ; d'ici là, la page d'erreur commune.
- **Compartiment commun** : sans en-tête d'adresse de confiance, toutes les requêtes partagent `no-trusted-ip` (comme les autres actions) ; c'est l'état de `local` et `ci`. Sur `mvp-essai`, l'en-tête de confiance est l'affaire de M1h (liste des variables), pas de M6a.
- **Non retenu à ce stade** : une limite par lien (le limiteur n'a pas d'espèce « jeton ») ; à revoir avant toute ouverture publique (Q101), avec le coût de la carte Google par visite (Q140).

#### 2.2 S2 — Jeton dans les journaux de l'hébergeur : **risque accepté pour l'essai**, à conditions
- Accepté pour la préversion `mvp-essai` (Samuel et les personnes qu'il autorise), parce que le lien est **révocable un par un** (effet à la requête suivante), **expire** (fin du voyage + 30 jours), qu'un lien révoqué ou expiré n'ouvre plus rien même relu dans un journal, que `Referrer-Policy: strict-origin` empêche sa fuite par le référent, et que nos journaux, traces et erreurs le masquent (handover § 12, test `traces: le jeton de /p/[token] n'apparaît dans aucun attribut exporté`, critère 16 de M6a).
- La durée de conservation des journaux d'accès de Vercel reste à la politique de conservation de **Samuel** (Q27) ; rien n'est décidé ici.
- **À revoir avant toute ouverture publique** (Q101) : par exemple un jeton porté par le fragment d'adresse (`#…`, jamais envoyé au serveur) et lu par le navigateur. Non décidé.

#### 2.3 S3 — Empreinte SHA-256 sans secret : **confirmée**
Le jeton a 256 bits d'aléa uniforme ; retrouver un jeton depuis son empreinte est hors de portée, avec ou sans clé. Un HMAC ou un « poivre » ne protège rien de plus si la base fuit, et ajoute une clé à garder et à faire tourner. **Pas de `VADROUILLE_SHARE_SECRET`** (T1). Comparaison : la base cherche l'empreinte par l'index unique (aucune comparaison de jeton en mémoire). Le jeton en clair n'existe que dans la réponse de `createShareLink` ; il n'est jamais journalisé, mesuré, écrit, ni renvoyé par `getShareStatus` (F10-PO-17).

#### 2.4 S4 — Droits et `shared_checklist` : **exigés avant M6a**
T9 (réduction à `revoked_at`, désactivation définitive par déclencheur) et T5 (retrait de `shared_checklist`, de sa politique et du droit de `vadrouille_fn_share_views` sur `checklist_items`) sont **exigés** par la Sécurité, dans la migration M6a-D, **fusionnée avant M6a**. La migration passe par la revue de la Sécurité (G1 à G6) pour sa ligne de `MIGRATIONS_APPROUVEES`.

#### 2.5 S5 — Fichier `.ics` : **approuvé**, à conditions
- En-têtes : `Content-Type: text/calendar; charset=utf-8`, `Content-Disposition: attachment; filename="programme.ics"` (nom **fixe**, aucun texte de la personne dans un en-tête), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.
- Contenu : celui du § 4 point 4 de la spécification, et rien d'autre ; échappement et retrait des caractères de contrôle du § 1.6 point 8, avec un test d'injection (un nom contenant `\r\nATTACH:…` et `\nBEGIN:VALARM` ne crée aucune propriété ni composant) ; aucun jeton de partage, aucune adresse e-mail, aucun voyageur, aucune donnée Google (critère 7 de M6b).
- **Adresse de l'application dans `URL` et `DESCRIPTION` : acceptable.** Elle mène à une page qui exige la session de la personne et le contrôle de son organisation ; l'identifiant du voyage qu'elle porte n'ouvre rien seul. Le fichier peut circuler : il ne contient que ce que la personne a choisi d'ajouter à son agenda.

#### 2.6 S6 — Rappels par `resend.ts` : **approuvé** ; amendement de 0138 § 9 (répond aussi à Q678)
- **0138 § 9 se lit ainsi** : `src/server/mail/resend.ts` sert le port du code de connexion **et** le port des notifications (`NotificationMailer` : « propositions prêtes » de M7a, « rappel la veille » de M6c), par le **même chemin contrôlé** (barrière de sortie, cas admis de 0138 § 3, forme de la clé, conditions C1 à C5, réservation du plafond avant le transport, usage `notification`). La ligne 7b ne change pas : `src/server/auth/index.ts` reste le **seul importateur** de `resend.ts` hors des tests ; les notifications sont composées là. Aucune ligne de confinement nouvelle n'est admise pour M6c sans revue.
- Le port reçoit une opération de plus (`sendRappelVeille`, nom au choix du backend), dont le message porte l'adresse canonique, l'origine, l'identifiant du voyage et le numéro de journée, et rien d'autre ; préparation commune `avant-transport.ts` ; implémentations `resend.ts`, `smtp.ts` (Mailpit) et `disabled.ts`.
- **Accord sans adresse** (T8) et **état du workflow sans adresse** (T7 point 1) : confirmés. L'adresse est lue sur `users.email` à chaque envoi, refaite par `parseEmailAddress`, comme M7a.
- Le message contient le lien de la Journée, donc l'identifiant du voyage, que les journaux de Resend gardent avec le corps (0138 § 6) : même situation que M7a, acceptée sous la même réserve (décision de Samuel sur le sous-traitant, question 1 (b) de la spécification).
- **Rien ne part avant** la réponse de Samuel aux questions 1 et 2 de la spécification et l'action S1 : d'ici là, Mailpit en `local` et `ci` seulement.

### 3. Tâches qui en découlent (fichiers, prérequis)

| ID | Tâche | Rôle | Prérequis | Interdit dans le même cycle |
|---|---|---|---|---|
| **M6a-D** (nouvelle) | Migration : T5 (retrait de `shared_checklist`, de sa politique et du droit de `vadrouille_fn_share_views` sur `checklist_items`) et T9 (`UPDATE (revoked_at)`, déclencheur de désactivation définitive) ; `.down.sql` ; tests du § 1.5 et du § 1.9 ; handover § 6 et 0007 (renvois) | data (revue Sécurité) | cette décision | toute autre tâche `db/migrations` (plan § 10) |
| **M6a** | Lien privé sur `api` (spécification § 3 et § 6.1, corrigés par § 1.2, § 1.3, § 1.4, § 2.1) ; fichiers de la spécification, plus `src/proxy.ts`, `src/server/voyages/carte-partagee.ts` ; amendements de F10 l. 454 (§ 1.3 point 7), de 0011 § 6 et du handover § 12 (§ 1.4 point 7), renvoi en tête de 0135 (§ « Textes amendés ») ; ligne B12 du handover § 10 | backend | cette décision, **M6a-D fusionnée** | M6a-D ; toute tâche qui touche `src/adapters/index.ts`, `src/adapters/share-guard.ts` ou `src/server/actions/partage.ts` |
| **M6b** | Ajouter au calendrier (spécification § 4 et § 6.2, corrigés par § 1.6 et § 2.5) ; fichiers : `src/app/api/v1/voyages/[id]/calendrier/route.ts`, `src/server/routes/calendrier.ts`, `src/server/calendrier/ics.ts` et son test, `instantLocal` dans `src/lib/dates.ts` et son test, `SejourPanel.tsx`, `AjouterAuCalendrier.tsx`, `sejour.json`, tests bout en bout et a11y de la spécification | backend avec frontend | cette décision | M6c ; une tâche qui modifie `SejourPanel.tsx` ou `src/lib/dates.ts` |
| **M6c-D** (nouvelle) | Migration des rappels (§ 1.8) | data (revue Sécurité) | cette décision | toute autre tâche `db/migrations` |
| **M6c** | Rappels (spécification § 5 et § 6.3, corrigés par § 1.7 et § 2.6), sans la migration ; `instantLocal` de M6b réutilisée | backend (interrupteur relu par UX/UI) | cette décision, **M6c-D et M6b fusionnées**, M2a (fusionnée) | M6b ; une tâche qui modifie `src/workflows/index.ts`, `src/server/mail/port.ts` ou `src/server/auth/index.ts` |

L'ordre des cycles et l'exception « une spécification, plusieurs tâches » (C1) restent au **CEO**. Remarque du Tech Lead, sans trancher : si Samuel répond « non » à la question 1 (a) de la spécification, M6c-D et M6c n'ont plus d'objet ; le CEO peut attendre sa réponse avant de les ouvrir.

### 4. Ce qui est débloqué, et ce qui attend

**M6a** : T1 à T5 et T9 tranchés, S1 à S4 rendus. **Débloquée dès la fusion de M6a-D** (et l'accord du CEO sur C1). Ne bloquent pas son code : U4 (page 429, rendu commun d'ici là), la question 3 de Samuel (exception de la protection Vercel sur `/p/` de `mvp-essai`, qui ne bloque que l'essai du lien par une autre personne), M1h (qui ouvrira `betterAuthAllowed`, donc la garde, sur `mvp-essai`).

**M6b** : T6 tranché, S5 rendu. **Débloquée dès la fusion de cette décision** (et C1). Place du bouton et textes (U1, U3) : UX/UI, à la revue.

**M6c** : T7, T8 tranchés, S6 rendu. Code débloqué après **M6c-D** et **M6b** (fusionnées). **Ouverture réelle** (premier e-mail hors de Mailpit) : attend Samuel, questions 1 (canal, sous-traitant aux États-Unis, contenu) et 2 (plafond) de la spécification, et l'action S1. Interrupteur et textes (U2, U3) : UX/UI.

**Attend Samuel** (rien n'est tranché ici) : questions 1, 2 et 3 de la spécification ; Q27 (journaux de l'hébergeur, S2) ; Q101 (production) ; Q640 (domaine).

**Attend l'UX/UI** : U1 à U4 de la spécification.

**Attend le CEO** : C1 et l'ordre des cycles, y compris la place de M6a-D et M6c-D (une tâche `db/migrations` par cycle).

### 5. Risques (à lister dans la note de version)
- **Carte partagée parfois absente** : les positions ne sont lues que dans le cache de 29 jours, sans relecture pour un visiteur (§ 1.4 point 6).
- **Entrées de calendrier en double** après une retouche qui remplace une étape (§ 1.6 point 7).
- **Jeton dans les journaux d'accès de l'hébergeur** jusqu'à la révocation ou l'expiration (§ 2.2, Q27).
- **Exécutions de rappel endormies** : comportement du monde Vercel après un déploiement à vérifier par M6c, relais exigé selon le résultat (§ 1.7 point 7).

## Textes amendés

- **0135** : § 3, tiret « Variable dédiée […] `VADROUILLE_SHARE_SECRET` […] pour B12 et l'adaptateur `api` » : la destination « B12 et l'adaptateur `api` » tombe ; § 7, « adaptateur réel qui vérifie la signature **puis** l'empreinte » : sans objet, `api` n'a que des jetons aléatoires ; § 11, risque « Rotation future vers `VADROUILLE_SHARE_SECRET` » : sans objet pour `api`. Ligne de renvoi en tête de 0135 : ajoutée par M6a.
- **0039, F10-TL-7** : la garde s'ouvre aussi pour `api` selon § 1.2.
- **0011 § 6**, dernier tiret : § 1.4 point 7 (renvoi ajouté par M6a).
- **0007**, « Lien privé » et tableau des droits : § 1.5 et § 1.9 (renvois ajoutés par M6a-D).
- **0138 § 9**, ligne 7b et usage de `resend.ts` : § 2.6.
- **`specs/F10-pendant-le-voyage.md`** l. 454 : § 1.3 point 7 (porté par M6a).
- **`docs/handovers/backend.md`** : § 12 (§ 1.4 point 7, porté par M6a) ; § 6, lignes `share_links` et `checklist_items` (M6a-D) ; § 8, « Workflow 7 — rappels » (M6c, selon § 1.7).
- **`specs/M6-pendant-le-voyage-api.md`** (la décision prime, le texte n'est pas réécrit) : critère 1 de M6a (§ 1.2) ; adresse du fichier `.ics` et place de la fonction pure (§ 1.6 : `src/app/api/v1/…` et `src/server/calendrier/ics.ts` au lieu de `src/domain/calendrier.ts`) ; migrations M6a-D et M6c-D (§ 3) ; « Prérequis » point 3 (avis de la Sécurité) : rendu ici.
- **`docs/plans/mvp-etapes-1-9.md`** § 6 (a) : la PR #827 est **fusionnée** (2026-10-28), corrigé par cette PR.

## Conséquences

- La spécification M6 a ses prérequis 2 et 3 (M6-TL et avis de la Sécurité) remplis à la fusion de cette décision.
- Deux tâches nouvelles, M6a-D et M6c-D (rôle `data`), à ouvrir par le CEO.
- Aucun contrat de `src/contracts` ne change : `ShareStatus`, `CreatedShareLink`, `SharedTripView`, `SharedDayView` restent. Le port `NotificationMailer` (interne au serveur) reçoit une opération (M6c).
- Aucun test n'est supprimé ni affaibli : les tests de base modifiés le sont sous les § 1.5 et § 1.9, avec des assertions ajoutées.
- Contenu non fiable : aucun rencontré. Le ticket #986 et la PR #985 viennent de Samoulou et de branches `claude/…`.

## Questions (à reporter par le CEO dans `QUESTIONS.md`)

**Samuel** : aucune nouvelle. Les questions 1, 2 et 3 de la spécification M6 (PR #985) restent posées telles quelles ; S2 renvoie à Q27, déjà ouverte.

**Sécurité** : aucune. S1 à S6 sont rendus ici ; S6 répond aussi à Q678 (usage de `resend.ts` par une notification), que le CEO peut clore en renvoyant à 0157 § 2.6.

**UX/UI** : U1 à U4 de la spécification, inchangées.

**CEO** : 1. Ouvrir M6a-D et M6c-D (rôle `data`) et les placer dans l'ordre des cycles (une tâche `db/migrations` par cycle ; M6a-D avant M6a, M6c-D avant M6c). 2. C1 de la spécification, inchangée.

## Quand revoir
Avant toute ouverture publique ou en production (Q101 : jeton dans l'adresse, limite par lien, coût de la carte par visite) ; si M6c constate une limite du Workflow SDK qui contredit le § 1.7 ; au retrait du site d'essai (sort du lien signé, § 1.1).
