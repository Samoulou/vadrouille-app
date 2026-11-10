# M9 — Exporter ou supprimer mes données sur la vraie app

Rédaction : Product Owner · Date : 2026-11-09 · `main` relu : `ea950a5` (correction 1 le même jour : revue consolidée du head `c63b632`, bloquants 1 à 4, mineurs 5 à 12 ; correction 2 : revue consolidée du head `06e9026`, bloquant 1, mineurs 2 à 4, et alignement sur la décision 0167) · Ticket : #1079 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 9, ligne M9-spec (§ 9 (c)) et § 0 (sens de « brancher sur la vraie app ») · Rôles des tâches qui suivent : backend (M9a), backend avec data (M9b), frontend (M9c), UX/UI (rendus et textes) · Revue : Tech Lead, Sécurité, UX/UI.

Références : `docs/handovers/backend.md` (§ 4 ligne « Compte : export et suppression », § 5 contrat `AccountExport`, § 6 « Règles communes » et lignes `organizations`, `memberships`, `billing`, `usage_ledger`, § 12 « Export et suppression des données » : étapes 1 à 5 de `deleteAccount`, réauthentification récente ; § 17 Q48), décisions 0007 (rôles, `purge_organization_data`, « Ajout seulement »), 0008 (Better Auth), 0011 et 0027 (règles Google, règle provisoire de Q5), 0093 (décisions déléguées définitives à la fusion), 0157 § 1.8 (accords aux rappels), 0160 (avis et goûts, § 1.1 et § 1.3), 0162 (relais des rappels), 0167 (purge de `place_coordinates` avec le compte, réponse à T4), `db/migrations/0027_rappels_relais.sql` (l. 107-158 : dernière version de `purge_organization_data`), `src/server/auth/reprise.ts` (point d'appel de la reprise, vide), `src/tenancy/options.ts` (code : 6 chiffres, 10 minutes, 3 essais ; session : 7 jours), `src/server/routes/calendrier.ts` (modèle d'un téléchargement), `specs/F11-mes-voyages-apres-etats.md` (F11-PO-19), `specs/M8-apres-le-voyage-api.md` (modèle de forme), `docs/handovers/frontend.md` (§ 6, § 10 vocabulaire, § 11 accessibilité, § 13 hors ligne), `QUESTIONS.md` (Q5, Q27, Q48, Q56, Q150, Q153, Q215, Q438, Q610).

**Prérequis, dans cet ordre** :
1. cette spécification fusionnée ;
2. réponses du **Tech Lead** aux questions T1 à T9 du § 8 (T4 tranchée par 0167), avec l'**avis de la Sécurité** sur S1 à S9 (dans leur revue ou par une décision à part, comme M8-TL) ;
3. M9a, puis M9b : M9a crée `src/server/account/reauthentification.ts`, le code `reauthentication_required` et `src/i18n/fr/compte.json`, que M9b reprend (ordre du plan, `docs/plans/mvp-etapes-1-9.md` l. 287-288 : M9a au cycle 228, M9b au cycle 229 ; propriété fixée à la correction 1, rubrique « Correction 1 » de la description de la PR #1083) ; avant M9b, le ticket `[data]` de la décision 0167 (migration `0028_purge_place_coordinates`) fusionné et appliqué ; une seule tâche par cycle sur `db/migrations` ;
4. M9c, après M9a et M9b ;
5. avant toute personne autre que Samuel : **action S6** du plan (§ 11), validation par Samuel des textes, des durées et du sort de `billing` et `usage_ledger` (Q48).

Si la réponse du Tech Lead ou de la Sécurité change un point de cette spécification, elle prime pour ce point.

**Une spécification, trois tâches** : règle du CEO pour une étape du plan (Q826, appliquée à M6 et M8). Chaque tâche a sa branche et sa PR. Le découpage est celui du plan (§ 9 (c)) ; ses prérequis s'en écartent (voir « Écarts », premier tiret).

**Écarts relevés dans les documents**, sans effet sur le fond, soumis au Tech Lead ou à la Sécurité (§ 8) :
- **Prérequis de M9b : plan aligné.** Le plan (`docs/plans/mvp-etapes-1-9.md`, § 9 (c), l. 255) donnait pour M9b « M9-spec ; Q48 ». Cette spécification donne « M9-spec ; M9a ; migration 0028 (0167) ; Q48 seulement pour l'option B » (§ 2, § 4.4) : M9b reprend le module et le code d'erreur créés par M9a, la purge de `place_coordinates` vient de la migration 0028 (0167), et l'option A ne demande ni migration ni décision. Le plan est aligné dans cette PR (l. 255), sur décision du CEO (C5).
- **Codes d'erreur nouveaux.** Ni `reauthentication_required` ni `forbidden` n'existent dans `API_ERROR_CODES` (`src/contracts/values.ts`, l. 313-343, qui finit par `not_unlocked`). Cette spécification ajoute les deux (§ 6.1) ; le handover (§ 4, ligne « Compte : export et suppression ») les cite, mais `not_found` est le code habituel de ce qui n'est pas à soi. Le Tech Lead tranche à la revue entre `forbidden` et `not_found` (T9) ; s'il retient `not_found`, les critères qui citent `forbidden` s'alignent.
- **Rien de B11 n'existe dans le code.** Aucune occurrence de `exportAccount`, `deleteAccount`, `AccountExport` ni `reauthentication_required` dans `src/` ; `src/server/account/` n'existe pas ; `reprendreSuppression` (`src/server/auth/reprise.ts`) est vide (« B11 le remplit »). Le handover range l'export et la suppression dans B11 ; le plan les reprend en M9a et M9b. M9 les crée.
- **Aucune page de compte, aucun bouton de déconnexion.** L'action `signOut` existe (`src/server/actions/compte.ts`, l. 78), mais aucun écran ne l'appelle (aucune occurrence dans `src/features`, `src/app`, `src/components`). Le handover front (§ 6) n'a pas de ligne « Compte » hors de `/connexion`. F11-PO-19 renvoyait la page à une tâche dédiée ; le CEO l'a ouverte (Q153). M9c la crée, déconnexion comprise.
- **`place_coordinates` n'est pas purgée avec le compte.** Le handover (§ 6, « Règles communes », tiret « Suppressions »), 0011 (« Conséquences » : « `purge_organization_data` étendue à cette table »), 0007 (l. 43 : `DELETE` « `place_coordinates` comprise (amendement 0011) ») et `db/migrations/0001_securite.sql` (l. 220 et l. 358 : « B8 l'étend à place_coordinates ») disent que la purge du compte couvre `place_coordinates`. La dernière version de la fonction (`0027_rappels_relais.sql`, l. 107-158) ne la supprime pas, et aucune migration n'accorde `DELETE` sur cette table à `vadrouille_fn_purge`. Les lignes expirent à 30 jours au plus, mais la purge des lignes expirées n'est pas activée (Q438, #527). Par ailleurs, la clé de `place_coordinates.organization_id` vers `organizations` n'a pas d'action à la suppression : elle bloquerait la suppression finale de l'organisation (option B de Q48). **T4 est tranchée** par la décision 0167 (option (a)) : la migration `0028_purge_place_coordinates` (ticket `[data]`, prérequis de M9b) ajoute `place_coordinates` à la purge ; la clé reste `NO ACTION`. M9b n'a plus de migration pour T4.
- **Q48 : deux lectures.** 0027 § 6 consigne « recommandations du studio validées » pour Q48 et Q27 ; `QUESTIONS.md` garde Q48 « Ouverte (juridique) », et le handover (§ 12) garde `billing` et `usage_ledger` « tant que Q48 est ouverte ». `QUESTIONS.md` (l. 52) écrit : « Ouverte (juridique, liée à Q27) — 38e cycle : recommandation du studio validée par Samuel (#studio, 2026-10-12 09:46 CEST, décision 0027) », sans dire quelle était cette recommandation. La seule position écrite du studio est celle du handover (§ 17, Q48 : « d'ici là, la suppression de compte les garde, avec la ligne `organizations` en état « suppression en cours » »), qui correspond à l'option A du § 4.4. Cette spécification suit `QUESTIONS.md` et le handover : Q48 est ouverte, la décision revient à Samuel (§ 4.4) ; l'écart est signalé à Samuel (question 1) et au CEO (C1).
- **Q215 est déléguée à l'UX/UI et au Product Owner** (parcours de réauthentification). Ce document fixe le parcours fonctionnel (§ 1.3, M9-PO-5) ; le rendu reste à l'UX/UI (U2).

---

## 1. Ce que la personne voit

### 1.1 Tâche par tâche

| Tâche | Ce que Samuel voit sur la vraie app (adaptateur `api`) |
|---|---|
| **M9a — Exporter mes données** | Depuis « Mes voyages », il ouvre « Ton compte » et touche « Exporter mes données ». Si sa connexion date de plus de 10 minutes, on lui envoie un code et il le saisit. Le téléchargement de `vadrouille-mes-donnees-2026-11-09.json` démarre. Le fichier, lisible dans un éditeur de texte, contient son adresse e-mail, ses voyages (dates, voyageurs, brief, logements, programme et ses versions, tri, liste « À faire »), ses avis, ses goûts retenus, ses accords aux rappels et ses paiements ; d'un lieu, seulement son identifiant Google (`placeId`), jamais une adresse, un horaire, une note ou une position. |
| **M9b — Supprimer mon compte** | Dans « Ton compte », il touche « Supprimer mon compte ». Un écran lui dit ce qui sera supprimé et ce qui sera gardé, et que rien ne pourra être rétabli. Il confirme, saisit un code si nécessaire, puis « Supprimer définitivement ». Il arrive sur l'accueil, déconnecté, avec « Ton compte est supprimé. ». Ses voyages, ses liens privés et ses rappels n'existent plus ; s'il se reconnecte avec la même adresse, il repart d'un compte vide. |
| **M9c — Écrans et textes** | Les écrans des deux lignes ci-dessus, plus « Se déconnecter » dans « Ton compte », sur `mock` et `api`, accessibles et utilisables hors ligne dans la mesure du § 6.4. |

### 1.2 Textes et durées : à valider par Samuel

Les textes du § 7 sont des propositions. Ce que la suppression garde (Q48), les durées de conservation (Q27, Q150) et l'information donnée à la personne sont **réservés à Samuel** (juridique). Le code se fait avec les textes proposés ; **aucune personne autre que Samuel** n'utilise l'export ni la suppression avant l'action S6 du plan (§ 11). Cette règle ne demande aucun code : la vraie app n'est ouverte à personne d'autre aujourd'hui (Q417, plan § 0.2 point 7).

### 1.3 Réauthentification par code (parcours fonctionnel, réponse à Q215)

1. L'export et la suppression exigent une **connexion récente** : une vérification de code réussie depuis **moins de 10 minutes** (handover § 12). Au-delà, le serveur répond `reauthentication_required`, sans rien lire ni supprimer.
2. L'écran « Confirme que c'est toi » montre l'adresse de la session (non modifiable), envoie un code par « Recevoir un code » (même envoi, mêmes limites, sauf avis contraire de la Sécurité (S1), et mêmes messages d'erreur que `/connexion` : `invalid_code`, `code_expired`, `too_many_attempts`, `rate_limited`, `email_cap_reached`), puis le fait saisir (`OtpInput`).
3. Après un code juste, la personne revient **à l'action qu'elle avait choisie** (le téléchargement démarre, ou l'écran de confirmation de la suppression s'affiche), sans la choisir de nouveau.
4. Une connexion de moins de 10 minutes passe directement à l'étape 3 : pas de code de plus juste après `/connexion`.
5. Si les 10 minutes expirent entre la confirmation et « Supprimer définitivement », la réponse `reauthentication_required` ramène à l'étape 2, sans rien supprimer.
6. Sur la préversion, cela suppose l'envoi réel des codes (étape 2 du plan, action S1). En `local` et en `ci`, Mailpit suffit (B3b-envoi, 0098).

Le mécanisme (nouvelle session, horodatage de réauthentification, ou autre) est au Tech Lead et à la Sécurité (T1, S1).

---

## 2. Tâches et prérequis

| ID | Tâche | Rôle | Prérequis | Migration |
|---|---|---|---|---|
| M9a | Exporter mes données : contrat `AccountExport`, construction depuis la base, téléchargement ; **propriétaire** de la réauthentification récente (`src/server/account/reauthentification.ts`), des codes `reauthentication_required` et `forbidden` (T9) et de `src/i18n/fr/compte.json` | backend | M9-spec ; T1 à T3, T9, S1 à S4 | Non, sauf si T1 retient un horodatage de réauthentification : M9a porte alors seule cette migration, au prochain numéro libre au moment de M9a (pas `0028`, prise par 0167) |
| M9b | Supprimer mon compte : `deleteAccount` (étapes 1 à 5 du handover § 12), reprise dans `verifyCode`, `place_coordinates`, `billing` et `usage_ledger` selon Q48 | backend, data | M9-spec ; **M9a** ; migration `0028_purge_place_coordinates` fusionnée et appliquée (0167, ticket `[data]`) ; T5, T6, S5 à S8 ; **Q48** pour l'option B seulement (§ 4.4 ; plan aligné, C5) | Non : la purge de `place_coordinates` est dans `0028` (0167), un horodatage de réauthentification éventuel est porté par M9a ; une migration seulement si Samuel retient l'option B de Q48 (tâche M9b-2) |
| M9c | Écrans et textes : « Ton compte », réauthentification, confirmation de la suppression, déconnexion | frontend | M9a, M9b ; T7, T8 ; U1 à U4 | Non |

M9a et M9b se codent et se testent en `local` et en `ci` sans aucun appel payant (plan § 0.3) : export et suppression ne touchent ni l'IA, ni Google, ni Stripe.

---

## 3. Export (M9a)

### 3.1 Qui, et quoi

1. **Qui** : la personne connectée sur `api`, **propriétaire** de son organisation personnelle (handover § 6 « Règles communes » : export et suppression réservés au propriétaire), avec une connexion récente (§ 1.3). Sinon : sans session, `unauthenticated` ; conseiller, `forbidden` ; connexion trop ancienne, `reauthentication_required`.
2. **Organisation partagée** (hors MVP : une autre adhésion que celle de la personne) : `forbidden`, rien n'est lu. Raison : l'export ne contient **aucune donnée d'une autre personne** (§ 3.4), et trier ce qui appartient à chacun dans une organisation partagée est une autre tâche (§ 10).
3. **Ce qui est exporté** : ce que la base garde de la personne et de ses voyages, **lu dans les tables**, jamais reconstruit à partir des écrans. Raison : un `Trip` lu pour l'affichage contient des données chargées à la demande (durées de trajet relues sur Google, jamais stockées : 0011, handover § 5, `Segment.minutes` et Q38 ; photos ; positions) qui ne doivent pas sortir (§ 3.3).

### 3.2 Contenu (proposition ; forme du contrat : T3)

Une liste blanche, comme la vue partagée (0007, `shared_trip_version`) : une clé n'entre dans l'export que si le contrat `AccountExportSchema` (strict) la prévoit. Les champs viennent des colonnes classées « stocké » au § 5 du handover backend.

| Bloc | Source | Champs exportés | Non exportés (raison) |
|---|---|---|---|
| `account` | `users` | `email`, `createdAt` | `id`, `email_verified` (techniques) |
| `trips[]` | `trips` | `id`, `destination`, `startDate`, `endDate`, `timeZone`, `travellers` (`adults`, `children`), `status`, `createdAt`, `unlocked` (calculé depuis `entitlements`) | `request_id`, `created_by` |
| `trips[].briefs[]` | `briefs`, toutes les versions | `version`, `story` (récit tel que saisi), `pace`, `mobilityModes`, `wishes`, `limitCategories`, `limits`, `mealBudget`, `inferredFields`, `createdAt` | `mobility` (ancienne colonne, plus écrite) |
| `trips[].stays[]` | `stays` | `kind`, `lodgingKind`, `label` (nom saisi ou maison), `city`, `fromDate`, `toDate`, `arrivalTime`, `departureTime`, `luggage`, `placeId` | `suggestion_id`, centre et rayon de zone (données de travail du moteur) |
| `trips[].commitments[]` | `trip_commitments` | `kind`, `label`, `date`, `startTime`, `endTime` | `rank` (ordre du tableau) |
| `trips[].versions[]` | `trip_versions`, **toutes les versions** | `version`, `parentVersion`, `authorKind`, `createdAt`, `days` (instantané `TripSnapshot` en liste blanche de clés, dont le nom maison, la catégorie, l'heure, le `placeId`, les sources web et les infos pratiques rédigées par l'outil d'une étape) | `patch`, `request_id`, `author_user_id` (techniques ; le contenu de chaque version suffit) |
| `trips[].currentVersion` | `trips.current_version` | numéro de la version courante | — |
| `trips[].deck` | `proposals` (phase `preview` et `deck`), `preference_signals`, `deck_closures` | propositions montrées (`day`, `time`, `kind`, nom maison, catégorie, `placeId`) ; gestes du tri (`signal`, `category`, `placeId`, `status`, `createdAt`, `cancelledAt`) ; fin du tri (`deck_closures` : `phase`, `through_position`, `created_at` ; forme dans le contrat : T3) | `candidates` non montrés, `research_runs`, `generation_runs`, `event_occurrences`, `preference_prompts`, `seq`, `request_id` (données de travail du moteur ; voir question 3 à Samuel) |
| `trips[].checklist[]` | `checklist_items` | libellé, `moment`, `done`, `bookingUrl` | `sponsored` (interne) |
| `trips[].reports[]` | `feedback` (signalements) | `stopId`, `placeId`, `reason`, `createdAt` | `text` (toujours nul) |
| `trips[].reviews[]` | `stop_reviews` de la personne | `stopId`, `placeId`, `opinion`, `updatedAt` | `request_id` |
| `trips[].reminders` | `reminder_consents` et `reminder_sends` de la personne | accords (`consentedAt`, `withdrawnAt`) ; rappels envoyés (`dayIndex`, `claimedAt`) | `reminder_relays` (réclamations techniques du workflow) |
| `trips[].shareLinks[]` | `share_links` | `createdAt`, `expiresAt`, `revokedAt` | `token_hash` (jamais, même haché) |
| `trips[].payments[]` | `checkouts`, `entitlements` | `method`, `amountCents`, `currency`, `status`, `createdAt` ; droits (`kind`, `grantedAt`) | `stripe_checkout_session_id`, `stripe_receipt_url` (S4), `price_variant` (interne) |
| `tastes[]` | `preferences` de la personne | `subjectKind`, `category`, `direction`, `origin`, `sourceTripId`, `consentedAt` | — |

Hors de l'export : `sessions`, `accounts`, `verifications`, entrées du limiteur, adhésions, `organizations` (données d'authentification et techniques ; S2), `billing` et `usage_ledger` (pièces comptables et registre des coûts du studio, non fournis par la personne ; question 3 à Samuel), `place_coordinates` (donnée Google, § 3.3).

### 3.3 Aucune donnée Google au-delà des identifiants de lieux (0011, 0027)

1. Le seul élément Google de l'export est le **`placeId`** (étapes, logements, propositions, gestes, signalements, avis), seul élément Google conservable (0027 § 4). Sa présence dans un fichier remis à la personne est soumise à la validation juridique de Q5 (question 4 à Samuel) ; d'ici là, il est exporté (recommandation : c'est l'identifiant des lieux qu'elle a choisis, sans contenu Google).
2. **Jamais** : nom ou adresse Google (`displayName`, `formattedAddress`), horaires, note, avis, photos ou leur adresse, positions (`place_coordinates`, `MapPoint`), durées ou distances de trajet (`Segment.minutes`, calculé à la lecture, Q38), réponse brute d'une API Google.
3. L'export est construit **sans aucun appel à Google** (ni Places, ni Routes) : aucune relecture, aucun coût.
4. Les noms d'étapes exportés sont ceux de la base : nom trouvé par notre recherche ou saisi par la personne, jamais écrit depuis le nom Google (handover § 5, `Stop.name`).

### 3.4 Aucune donnée d'une autre personne

1. Organisation partagée refusée (§ 3.1 point 2).
2. Tables par personne (`preferences`, `stop_reviews`, `reminder_consents`, `reminder_sends`) : seulement les lignes de la personne (`user_id` ou `created_by` = la personne de la session), même dans son organisation.
3. Aucune trace de qui a ouvert un lien privé (la base n'en garde aucune) ; aucun identifiant d'un autre utilisateur ; aucun identifiant de session.
4. Le récit du brief et les libellés saisis sont exportés **tels que la personne les a écrits**, même s'ils nomment quelqu'un : c'est son propre texte.

### 3.5 Format, nom du fichier, remise

1. **JSON** UTF-8, indenté de 2 espaces, clés dans l'ordre du contrat ; dates `AAAA-MM-JJ`, instants ISO 8601 en UTC ; codes fermés tels quels (`museum`, `liked`, `twint`). En tête : `format: "vadrouille-export"`, `version: 1`, `exportedAt`, et `notice`, un court texte français qui dit ce que contient le fichier et que les codes sont ceux de l'application (texte au § 7, depuis `src/i18n/fr/`). Raison : lisible dans un éditeur de texte, réutilisable par un autre service (portabilité), stable d'un export à l'autre.
2. **Nom** : `vadrouille-mes-donnees-AAAA-MM-JJ.json`, date du jour à Zurich (`Europe/Zurich`) ; aucun identifiant, aucune adresse e-mail dans le nom.
3. **Remise** : téléchargement direct dans le navigateur, réponse `Content-Disposition: attachment`, `Content-Type: application/json; charset=utf-8`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` (modèle du calendrier, `src/server/routes/calendrier.ts`, l. 42-43). **Aucune copie** sur le serveur, dans un stockage, dans un e-mail ni dans un journal ; aucun lien à durée de vie. Forme (route ou action) : T2.
4. **Synchrone**, en une lecture cohérente (une transaction en lecture). Au MVP, quelques voyages : taille et temps bornés par une limite que fixe le Tech Lead (T3) ; au-delà, l'export asynchrone est hors périmètre (§ 10).
5. Rejouer l'export ne change rien en base (aucune écriture, hors limiteur).

---

## 4. Suppression (M9b)

### 4.1 Qui

La personne connectée sur `api`, propriétaire de son organisation personnelle, avec une connexion récente (§ 1.3), après la confirmation de l'écran (§ 6.4). Organisation partagée (hors MVP) : seule son adhésion est retirée (handover § 12, dernier paragraphe), sans purge ; M9 ne fait que le tester en base, sans écran.

### 4.2 Étapes (handover § 12, repris sans changement)

1. **Marque et purge métier**, une transaction `withOrg` puis `SET LOCAL ROLE vadrouille_account_admin` : `purge_organization_data` pose `deletion_requested_at`, puis supprime les données métier (dernière version : `0027_rappels_relais.sql`, l. 107-158 : de `stop_reviews` à `trips`), sauf `billing` et `usage_ledger` (§ 4.4) ; à partir de la migration `0028` (0167), elle supprime aussi `place_coordinates`, en tête : M9b n'appelle rien de plus.
2. **Authentification**, depuis `src/server/account/delete.ts` seulement : `sessions` (toutes, sur tous les appareils), `accounts`, `verifications` de l'adresse, entrées du limiteur sous les clés HMAC de l'adresse, adhésions, puis `users`.
3. **Organisation** : la ligne reste en « suppression en cours », sans adhésion ni donnée personnelle, tant que `billing` ou `usage_ledger` la référencent (§ 4.4).
4. **Reprise** : `getRequestContext()` refuse toute session d'une organisation en suppression ; `verifyCode` reprend l'étape 2 au lieu d'ouvrir une session (`reprendreSuppression`, `src/server/auth/reprise.ts`) et répond `unauthenticated`.
5. **Journaux** : selon la durée fixée par Samuel (Q27).

### 4.3 Reprise et idempotence

1. `deleteAccount` rejoué après une panne entre deux étapes, ou entre deux suppressions de l'étape 2, termine sans erreur ni doublon ; rejoué après la fin, il ne trouve plus rien et ne lève pas d'erreur.
2. Deux onglets : le second appel, sans session, reçoit `unauthenticated` et l'écran mène à l'accueil.
3. Après la fin, une connexion avec la **même adresse** crée un compte neuf (nouvelle personne, nouvelle organisation) : rien de l'ancien compte n'y apparaît.
4. **Effets de bord** (forme : T5, T6) :
   - **rappels** : aucun rappel n'est envoyé après la suppression ; une chaîne de relais en cours s'arrête à sa prochaine réclamation (l'accord n'existe plus) sans erreur bloquante ni nouvel essai sans fin ;
   - **génération en cours** (aperçu, voyage complet, révision) : ses étapes suivantes échouent proprement (voyage absent), sans recréer de ligne métier ; une ligne de `usage_ledger` écrite après la purge pour un appel déjà fait reste admise (coût réel) ;
   - **paiement en attente** (`checkouts.status = 'pending'`, session Stripe non expirée) : la suppression risque de laisser un paiement sans voyage. Proposition : refuser la suppression tant qu'un paiement est en attente, avec le texte du § 7 ; le cas d'un webhook arrivé après la suppression est à traiter par le Tech Lead (T6) et touche à l'argent (question 6 à Samuel) ;
   - **liens privés et calendrier** : `/p/[token]` et le lien du calendrier répondent comme un lien inconnu.

### 4.4 `billing` et `usage_ledger` : décision de Samuel (Q48)

Faits : les deux tables sont en ajout seulement, `DELETE` refusé à tous, `vadrouille_fn_purge` compris (0007, « Ajout seulement ») ; leurs clés vers `organizations` sont `ON DELETE RESTRICT` (`db/schema/business.ts`, `usageLedger` et `billing`) ; `billing` porte l'événement Stripe (`stripe_event_id`), le montant, la devise et l'issue, sans adresse ni nom ; `usage_ledger` porte des coûts estimés par étape, sans donnée saisie par la personne. Les deux restent rattachés à l'organisation, donc à la personne tant que Stripe garde la session de paiement (pseudonymes, pas anonymes).

| | Option A — Garder | Option B — Supprimer avec le compte |
|---|---|---|
| Ce qui se passe | `billing` et `usage_ledger` restent, rattachés à une organisation sans adhésion ni donnée personnelle (état actuel du handover § 12) ; suppression des pièces à l'échéance d'une durée de conservation fixée par Samuel (tâche future, non planifiée) | La purge supprime aussi `billing` et `usage_ledger`, puis l'organisation elle-même (`place_coordinates` est déjà purgée par `0028`, 0167) |
| Code | Aucun changement de la base : M9b le code tel quel | Migration : déclencheur « ajout seulement » levé pour `vadrouille_fn_purge` sur `DELETE`, droits, purge, suppression de l'organisation ; verdict de la Sécurité ; `owner-approved` et `db-migrate` par Samuel (plan § 0.2 point 6) |
| Comptabilité | Pièces gardées chez nous et chez Stripe | Pièces gardées chez Stripe seulement ; notre trace des paiements disparaît |
| Plafonds | Les sommes globales du mois (`usage_forfait_totals`, 0083) restent justes | Les sommes du mois baissent à chaque suppression : un plafond mensuel peut être dépassé sans le voir (à traiter par le Tech Lead si B est retenue) |
| Ce que dit le texte | « Nous gardons la trace de tes paiements le temps exigé par la loi, sans ton adresse ni tes voyages. » | « Tout est supprimé. Stripe garde ses propres pièces de paiement. » |

**Recommandation du Product Owner** : option A pour `billing` (pièce comptable, durée à fixer par Samuel), et pour `usage_ledger` (aucune donnée saisie par la personne ; plafonds justes). Ce n'est pas une décision : **Samuel tranche Q48** (question 1). En attendant, M9b code l'option A, qui est le comportement déjà écrit au handover § 12 et ne demande ni migration ni décision ; si Samuel retient B, une tâche M9b-2 (data, puis backend) l'ajoute, et le plan sera mis à jour par le CEO.

---

## 5. Sécurité et RGPD : points posés à la Sécurité (non tranchés)

Le Product Owner ne tranche aucun de ces points ; ils sont repris en questions S1 à S9 (§ 8).

1. **Réauthentification** : fenêtre de 10 minutes, mesurée sur quoi (création de la session, horodatage dédié) ; sort de l'ancienne session après un nouveau code ; un code envoyé pour la réauthentification se distingue-t-il d'un code de connexion (limites, texte de l'e-mail) ?
2. **Contenu de l'export** : liste blanche du § 3.2, exclusions (`sessions`, adhésions, `token_hash`, identifiants Stripe) ; lien de reçu Stripe (`stripe_receipt_url`) : exporté ou non.
3. **Transport de l'export** : `GET` ou `POST` (demande intersite, préchargement), en-têtes, absence de copie et de journal, refus de tout paramètre d'organisation ou de personne dans la demande.
4. **Google** : liste blanche, test à sentinelles (§ 6.2), aucun appel Google ; `placeId` dans un fichier remis (avec Q5).
5. **Complétude de la suppression** : tables (dont `place_coordinates`, purgée depuis `0028`, 0167), sessions sur tous les appareils, `verifications`, limiteur, état durable des workflows (le workflow des rappels garde-t-il une adresse ou un identifiant de personne dans ses entrées ou ses résultats d'étape ?), événements de mesure (aucune donnée personnelle selon le handover front § 12 ; Q56).
6. **Ce qui reste hors de notre base** : sauvegardes de la base (historique de restauration du fournisseur), Stripe, l'envoi d'e-mails (Resend), journaux de l'hébergeur (Q27). Ce que le texte en dit est à Samuel ; la liste et les durées techniques sont à la Sécurité.
7. **Limites** : export (proposition : 5 par heure et par personne), suppression (proposition : 5 par heure et par personne ; la reprise par `verifyCode` n'est jamais refusée par cette limite).
8. **Paiement en attente** (§ 4.3 point 4) et webhook tardif.
9. **RGPD et nLPD** : l'export couvre-t-il le droit d'accès et la portabilité (contenu, format) ; délai de réponse ; la suppression couvre-t-elle l'effacement, avec l'exception des pièces comptables (Q48) ? Lecture juridique : Samuel (question 2) ; lecture technique : Sécurité.

---

## 6. Fichiers, critères et tests par tâche

Exemple commun : Samuel, organisation personnelle, voyage d'Édimbourg (2026-08-29 au 2026-09-03, `Europe/London`) débloqué, trois versions, tri avec gestes, deux avis, un goût retenu, un accord aux rappels retiré, un lien privé, un paiement `succeeded`, une ligne `billing`, des lignes `usage_ledger` et `place_coordinates` ; une seconde organisation (Léa) remplie de la même façon.

### 6.1 Commun

- Codes d'erreur `reauthentication_required` et `forbidden` ajoutés par **M9a**, **à la fin** de `API_ERROR_CODES` (`src/contracts/values.ts`), sans renommer ni réordonner ; ligne du handover § 5 au besoin. `forbidden` : sous réserve de T9 (le Tech Lead peut retenir `not_found` ; les critères s'alignent alors).
- `src/server/account/reauthentification.ts` (contrôle de la connexion récente) et `src/i18n/fr/compte.json` (nouveau, exporté par `src/i18n/messages.ts`) sont créés par **M9a** ; M9b et M9c les reprennent et les complètent.
- Les deux actions lisent le contexte par la session seule (`src/server/session.ts`) : aucun identifiant d'organisation ou de personne dans l'entrée.
- Aucune adresse e-mail, aucun code, aucun contenu de voyage dans les journaux (test `journaux: aucun email ni code dans les journaux`, étendu aux deux actions).

### 6.2 M9a — Exporter mes données

**Fichiers** : `src/contracts/account-export.ts` (nouveau, `AccountExportSchema` strict ; nom : T3) et son test ; `src/server/account/export.ts` (nouveau, construction depuis la base, une transaction en lecture) ; point d'entrée du téléchargement (route `src/app/api/v1/compte/export/route.ts` sur le modèle du calendrier, ou action : T2) ; `src/server/account/reauthentification.ts` (nouveau, contrôle de la connexion récente, repris par M9b ; forme : T1) ; `src/contracts/values.ts` (codes du § 6.1) ; `src/server/config/limites.ts` (limite `export`, S7) ; `src/i18n/fr/compte.json` (nouveau, texte `notice`) et `src/i18n/messages.ts` (export de l'espace de noms) ; `tests/db/export-compte.test.ts` (crée le test `compte: export et suppression exigent une réauthentification récente`, partie export) ; `tests/unit/account/export.test.ts`. **Migration, seulement si T1 retient un horodatage de réauthentification** : portée par M9a seule, au prochain numéro libre au moment de M9a (pas `0028`, prise par 0167), avec son `.down.sql` et son test de migration dans `tests/unit/db/` (modèle `migration-apres-voyage.test.ts`).

**Critères d'acceptation** :
1. Sans session : `unauthenticated` ; conseiller : `forbidden` ; organisation avec un second membre : `forbidden` ; aucune lecture dans ces trois cas.
2. `compte: export et suppression exigent une réauthentification récente` (créé ici, étendu par M9b) : connexion de plus de 10 minutes, `reauthentication_required`, rien lu ; juste après un code : export rendu (horloge injectée, bornes à 9 min 59 s et 10 min 00 s).
3. L'export valide `AccountExportSchema` (strict) ; il contient les blocs du § 3.2 pour l'exemple commun (trois versions, deux avis, un goût, un accord retiré avec `withdrawnAt`, un paiement).
4. **Aucune donnée de Léa** : aucune valeur sentinelle de son organisation (destination, récit, nom d'étape, `placeId`) n'apparaît ; aucun identifiant d'un autre utilisateur.
5. **Aucune donnée Google hors `placeId`** : avec des doubles Places et Routes qui renvoient des sentinelles (`SENTINELLE-NOM-GOOGLE-M9A`, `SENTINELLE-ADRESSE-M9A`, une durée de trajet de 4321 minutes, des coordonnées 12.3456/65.4321), et une ligne `place_coordinates` aux mêmes coordonnées, aucune sentinelle n'apparaît dans le fichier ; aucun appel aux doubles Places et Routes pendant l'export (compteurs à zéro).
6. Aucune des clés exclues du § 3.2 (`token_hash`, `stripe_checkout_session_id`, `request_id`, `patch`, `email_verified`, identifiants de session) n'apparaît, à aucun niveau (parcours récursif des clés).
7. Réponse : `Content-Disposition: attachment; filename="vadrouille-mes-donnees-2026-11-09.json"` (horloge au 2026-11-09 à 23:30 heure de Zurich : date du 09 ; à 00:30 le 10 : date du 10), `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Type: application/json; charset=utf-8`.
8. Rien n'est écrit en base (hors limiteur) ; deux exports successifs sont identiques hormis `exportedAt`.
9. Limite `export` atteinte : `rate_limited`, rien lu.

**Tests** : base (critères 1 à 6, 8) ; unitaires (contrat, nom du fichier et fuseau, parcours des clés) ; route ou action (critère 7, 9).

### 6.3 M9b — Supprimer mon compte

**Fichiers** : `src/server/account/delete.ts` (nouveau ; seul fichier hors de `db/` où figure `purge_organization_data`, règle ESLint de 0007) ; `src/server/actions/compte.ts` (action `deleteAccount`) ; `src/server/auth/reprise.ts` (rempli) ; `src/server/account/reauthentification.ts` (repris de M9a, sans changement de forme) ; `src/i18n/fr/compte.json` (complété) ; `src/tenancy/` au besoin (lecture des sessions, adhésions) ; **aucune migration** (la purge de `place_coordinates` est dans `0028`, 0167 ; un horodatage de réauthentification éventuel est porté par M9a) ; `src/server/config/limites.ts` (limite `suppression`, S7) ; `tests/db/suppression-compte.test.ts` ; `tests/unit/account/delete.test.ts`.

**Critères d'acceptation** (noms de tests du handover § 12 repris) :
1. `compte: export et suppression exigent une réauthentification récente` (test créé par M9a, étendu ici à la suppression) : connexion de plus de 10 minutes, `reauthentication_required`, rien supprimé, `deletion_requested_at` nul.
2. `compte: la suppression efface les données métier et d'authentification` : pour l'exemple commun, plus aucune ligne de Samuel dans les tables purgées, ni `sessions` (deux sessions sur deux appareils), `accounts`, `verifications` de son adresse, entrées du limiteur sous la clé de son adresse, `memberships`, `users` ; `billing` et `usage_ledger` intacts (option A) ; l'organisation reste avec `deletion_requested_at` posé, sans adhésion ; **Léa intacte**, ligne pour ligne.
3. `place_coordinates` de Samuel : supprimées (migration `0028`, 0167) ; celles de Léa intactes.
4. `compte: une suppression interrompue reprend sans erreur ni doublon` : panne injectée entre les étapes 1 et 2, puis entre deux suppressions de l'étape 2 ; la session restante est refusée entre-temps (`unauthenticated`) ; `verifyCode` pour l'adresse reprend l'étape 2, ne pose aucun cookie et répond `unauthenticated` ; une relance de `deleteAccount` termine.
5. Rejouer `deleteAccount` après la fin : aucune erreur, rien de plus.
6. Après la fin, `requestCode` et `verifyCode` avec la même adresse ouvrent un compte neuf, sans aucun voyage.
7. Rappels : un accord actif avant la suppression, relais simulé après : aucun e-mail dans Mailpit, le workflow s'arrête (T5).
8. Paiement en attente (proposition du § 4.3) : `deleteAccount` refuse (code : T6), rien supprimé ; paiement `succeeded` ou `expired` : suppression faite.
9. Organisation avec un second membre (base seulement) : seule l'adhésion de la personne disparaît ; aucune donnée métier supprimée.
10. Conseiller : `forbidden` ; sans session : `unauthenticated` ; limite atteinte : `rate_limited`, rien supprimé.
11. `/p/[token]` d'un lien de Samuel, après : réponse d'un lien inconnu.

**Tests** : base (critères 1 à 6, 8, 9, 11) ; unitaires (ordre des étapes, reprise, horloge) ; bout en bout `api` avec Mailpit (critère 7, et le parcours du § 6.4).

### 6.4 M9c — Écrans et textes

**Fichiers** : page « Ton compte » (adresse proposée `/compte` ; groupe et méthode de routes : T7) ; `src/features/compte/AccountScreen.tsx`, `ReauthStep.tsx`, `DeleteAccountScreen.tsx` (noms libres) ; lien « Ton compte » dans `src/features/compte/TripsScreen.tsx` ; `src/i18n/fr/compte.json` (créé par M9a, complété ici) ; `tests/e2e/routes.ts` ; `tests/e2e/compte.e2e.spec.ts` (`mock`), `tests/e2e/compte-api.api.spec.ts` ; `tests/e2e/compte.a11y.spec.ts`.

**Critères d'acceptation** :
1. « Mes voyages » a un lien « Ton compte » ; la page montre l'adresse de la session, « Exporter mes données », « Supprimer mon compte » et « Se déconnecter ». Sans session (`api`) : page de connexion, puis retour à la page.
2. « Se déconnecter » appelle `signOut` et mène à l'accueil ; recharger « Ton compte » mène à la connexion.
3. Export : connexion récente, le téléchargement démarre sans écran de plus ; connexion ancienne, l'écran « Confirme que c'est toi » (§ 1.3), puis le téléchargement après un code juste ; code faux, expiré, trop d'essais : messages de `/connexion`.
4. Suppression : écran d'explication (ce qui est supprimé, ce qui est gardé selon Q48, rien ne se rétablit) avec « Continuer » et « Garder mon compte » ; puis le code si nécessaire ; puis « Supprimer définitivement » ; à la fin, l'accueil avec l'annonce « Ton compte est supprimé. » (`role="status"`).
5. `reauthentication_required` reçu après la confirmation (horloge avancée) : retour à l'étape du code, rien supprimé.
6. Paiement en attente : texte du § 7, aucun bouton « Supprimer définitivement ».
7. Hors ligne : bandeau ; « Exporter mes données », « Supprimer mon compte », « Recevoir un code » en `aria-disabled="true"` ; « Garder mon compte » reste actif.
8. Accessibilité : cibles ≥ 44 px ; focus sur le titre de chaque étape ; axe sans violation ; le bouton de suppression a un nom accessible sans ambiguïté (« Supprimer définitivement mon compte »).
9. Vocabulaire (handover front § 10) : tutoiement, sans point d'exclamation ; aucun « OK », « Valider ».
10. `mock` : la page s'affiche ; l'export télécharge un fichier construit depuis le jeu simulé par le même schéma ; la suppression n'est pas proposée (mention « Disponible avec un vrai compte. ») ; forme : T8. Les tests existants de « Mes voyages » restent verts sans modification.
11. Aucun événement de mesure nouveau.

**Tests** : bout en bout `mock` (critères 1, 3, 10) et `api` (critères 1 à 7) ; a11y (critère 8) ; captures 390 × 844 de chaque écran jointes pour validation (UX/UI).

---

## 7. Textes proposés (français, **à valider par l'UX/UI**, puis par Samuel à l'action S6)

**« Ton compte »** :
- Titre : « Ton compte »
- Adresse : « Connecté avec {email} »
- « Exporter mes données » ; sous le bouton : « Un fichier avec tes voyages, tes avis, tes goûts retenus, tes accords aux rappels et tes paiements. »
- « Supprimer mon compte » ; sous le bouton : « Tes voyages et tes données sont supprimés. Rien ne pourra être rétabli. »
- « Se déconnecter »
- Lien depuis « Mes voyages » : « Ton compte »

**Réauthentification** :
- Titre : « Confirme que c'est toi »
- « Pour protéger tes données, on t'envoie un code à {email}. »
- Bouton : « Recevoir un code » ; ensuite : « Saisis le code reçu par e-mail. »
- Erreurs : celles de `/connexion`.

**Export** :
- Annonce : « Ton fichier est prêt. » ; erreur : « Impossible de préparer ton fichier pour le moment. » avec « Réessayer ».
- `notice` du fichier : « Ce fichier contient les données que Vadrouille garde sur toi et tes voyages, à la date indiquée. Les lieux y sont désignés par leur identifiant Google, sans autre information Google. Les codes (catégories, avis, statuts) sont ceux de l'application. »

**Suppression** :
- Titre : « Supprimer ton compte »
- « Seront supprimés : ton adresse e-mail, tes voyages et leurs programmes, tes briefs, ton tri, tes avis, tes goûts retenus, tes accords aux rappels et tes liens privés. »
- Ce qui est gardé, **selon la réponse de Samuel à Q48** : option A : « Nous gardons la trace de tes paiements le temps exigé par la loi, sans ton adresse ni tes voyages. » ; option B : « Stripe garde ses propres pièces de paiement. »
- « Rien ne pourra être rétabli. Pense à exporter tes données avant. »
- Boutons : « Continuer », « Garder mon compte », puis « Supprimer définitivement »
- Fin : « Ton compte est supprimé. »
- Paiement en attente : « Un paiement est en cours. Réessaie quand il sera terminé. »
- Erreur : « Impossible de supprimer ton compte pour le moment. » avec « Réessayer ».
- `mock` : « Disponible avec un vrai compte. »

---

## 8. Questions, par destinataire

Rien n'est tranché ici à la place de son destinataire. Le CEO les reporte dans `QUESTIONS.md`.

**Samuel** (réservées : juridique, données personnelles, argent) :
1. **Q48 — `billing` et `usage_ledger` à la suppression du compte** (`QUESTIONS.md` l. 52 note une « recommandation du studio validée » le 2026-10-12 sans la décrire ; la position écrite du handover § 17 est l'option A : la confirmes-tu ?) : option A (garder, avec une durée de conservation à fixer) ou option B (supprimer avec le compte, et l'organisation avec eux), § 4.4. Recommandation du Product Owner : A, avec une durée légale à confirmer. Bloque : rien pour le code de A (M9b) ; l'option B demanderait une tâche de plus. Bloque l'ouverture à d'autres personnes (S6).
2. **Textes, durées, information (S6 ; Q27, Q150)** : (a) les textes du § 7 conviennent-ils, et faut-il une mention de plus (droits nLPD et RGPD, délai de réponse) ? (b) délai dans lequel la suppression est effective, y compris dans les sauvegardes de la base et chez les sous-traitants (Stripe, envoi d'e-mails, hébergeur) : que dit-on à la personne ? (c) faut-il un e-mail qui confirme la suppression (recommandation : non, il faudrait garder l'adresse après la suppression) ? Bloque : l'ouverture à d'autres personnes, pas le code.
3. **Contenu de l'export (droit d'accès et portabilité)** : la liste des exclusions du § 3.2 (données de travail du moteur, propositions non montrées, `billing`, `usage_ledger`, données d'authentification) est-elle admissible, et l'historique complet des versions suffit-il ? Recommandation : oui, avec ces exclusions nommées dans la politique de confidentialité. Bloque : rien pour le code (les exclusions s'ajoutent sans changer la forme).
4. **Q5 — `placeId` dans un fichier remis à la personne** : seul élément Google de l'export (§ 3.3). Recommandation : l'exporter. Bloque : rien avant la production.
5. **Q610 (rappel)** : la suppression à la demande d'un brief du site d'essai n'est pas dans M9 (aucun compte sur le site d'essai, schéma `prototype`, § 10) ; la question reste ouverte pour toute mise en public du site d'essai.
6. **Paiement en attente (argent)** : refuser la suppression tant qu'un paiement est en attente (proposition, § 4.3 point 4), et que faire d'un paiement confirmé par Stripe après la suppression (remboursement manuel ?) ? Bloque : le critère 8 de M9b.

**Tech Lead** (avec la Sécurité pour T1, T2, T5, T6) :
1. **T1 — Réauthentification récente** : horodatage de création de la session (`sessions.created_at` ; à vérifier sur Better Auth 1.7.7 qu'il ne change pas à la prolongation de `SESSION.prolongationSecondes`, `src/tenancy/options.ts`) en créant une **nouvelle session** après le code (recommandation, sans migration), ou colonne `reauthenticated_at` (migration, `vadrouille_auth`) ; sort de l'ancienne session ; module partagé par M9a et M9b.
2. **T2 — Remise de l'export** : route `GET` ou `POST` sous `src/app/api/v1/` sur le modèle du calendrier (recommandation : le téléchargement par le navigateur s'y prête mieux qu'une action serveur), ou action serveur qui rend le contenu au client.
3. **T3 — Contrat `AccountExport`** : forme (blocs et clés du § 3.2, liste blanche de `TripSnapshot` partagée ou non avec celle de la vue partagée), version, borne de taille ; lecture depuis les tables, jamais depuis `TripAdapter.getTrip`.
4. **T4 — `place_coordinates` : tranchée** par la décision 0167 (option (a) : migration `0028_purge_place_coordinates`, ticket `[data]`, prérequis de M9b ; la clé vers `organizations` reste `NO ACTION`, y compris avec l'option B de Q48).
5. **T5 — Workflows en cours** : arrêt des relais de rappels et des générations après la purge, sans essais sans fin ni ligne recréée ; écritures tardives dans `usage_ledger`.
6. **T6 — Paiement en attente et webhook tardif** : code d'erreur du refus (`forbidden` avec une raison, ou code nouveau), seuil « en attente » (statut `pending` et session Stripe non expirée), traitement d'un `checkout.session.completed` dont le `checkouts` a été purgé.
7. **T7 — Adresse de « Ton compte »** : `/compte` (proposition) ; méthode de routes ; place dans la navigation (lien depuis « Mes voyages ») ; inscription à `tests/e2e/routes.ts`.
8. **T8 — `mock`** : export construit depuis le jeu simulé et suppression non proposée (proposition), ou suppression simulée.
9. **T9 — Codes `reauthentication_required` et `forbidden`** : ajoutés par M9a (propriété fixée à la correction 1, rubrique « Correction 1 » de la description de la PR #1083 ; ordre du plan l. 287-288) ; `forbidden` (conseiller, organisation partagée) ou `not_found` (code habituel de ce qui n'est pas à soi) : à trancher à la revue ; ligne du handover § 5 et cas de `verifyCode` pour la réauthentification (même action ou action dédiée).

**Sécurité** :
1. **S1 — Réauthentification** : fenêtre de 10 minutes et sa mesure, ancienne session, distinction éventuelle du code de réauthentification (§ 5 point 1, avec T1).
2. **S2 — Contenu de l'export** : liste blanche et exclusions du § 3.2 ; données d'authentification hors de l'export.
3. **S3 — Transport** : méthode, en-têtes, absence de copie et de journal, protection contre une demande intersite (§ 5 point 3, avec T2).
4. **S4 — Google et Stripe dans l'export** : test à sentinelles du critère M9a-5 suffisant ? `stripe_receipt_url` exporté ou non (recommandation : non, le reçu reste lisible dans l'application tant que le compte existe).
5. **S5 — Complétude de la suppression** : tables, sessions, `verifications`, limiteur, état durable des workflows (adresse ou identifiant de personne dans l'état du workflow des rappels ?), événements de mesure (§ 5 point 5).
6. **S6 — Hors de notre base** : sauvegardes, Stripe, envoi d'e-mails, journaux de l'hébergeur : liste et durées techniques pour la réponse de Samuel à la question 2 (b).
7. **S7 — Limites** : `export` et `suppression` (propositions du § 5 point 7) ; la reprise dans `verifyCode` jamais refusée.
8. **S8 — Paiement en attente** : avis sur la proposition du § 4.3 point 4 (avec T6).
9. **S9 — Lecture technique RGPD et nLPD** : l'export et la suppression couvrent-ils l'accès, la portabilité et l'effacement, sous réserve de Q48 (§ 5 point 9) ?

**UX/UI** :
1. **U1 — « Ton compte »** : rendu en Ligne (page non maquettée), place du lien dans « Mes voyages », bouton de suppression (style de danger ou non).
2. **U2 — Réauthentification** (Q215, rendu) : écran ou feuille, retour à l'action choisie, messages d'erreur repris de `/connexion`.
3. **U3 — Confirmation de la suppression** : trois étapes (explication, code, « Supprimer définitivement ») ou moins ; annonce de fin sur l'accueil.
4. **U4 — Textes du § 7**, dont le `notice` du fichier ; faut-il des libellés français à côté des codes dans l'export (recommandation : non, codes seuls et `notice`) ?

**CEO** :
1. **C1 — Écart de Q48** : 0027 § 6 et `QUESTIONS.md` (l. 52) disent « recommandation du studio validée par Samuel » sans dire laquelle, tout en gardant Q48 ouverte ; la seule position écrite (handover § 17 : garder `billing` et `usage_ledger`) correspond à l'option A. À clarifier avec Samuel et à reporter.
2. **C2 — Q215** : parcours fonctionnel fixé ici (M9-PO-5) ; rendu en attente de l'UX/UI (U2). À reporter dans `QUESTIONS.md`.
3. **C3 — Écart `place_coordinates`** (en tête) : réglé par 0167 ; ouvrir le ticket `[data]` de la migration `0028` avant M9b (0167 § 4.1).
4. **C4 — Tâche M9b-2** : à ajouter au plan seulement si Samuel retient l'option B de Q48.
5. **C5 — Plan mis à jour dans cette PR** (décision du CEO, correction 2) : § 9 (c), l. 255, prérequis de M9b « M9-spec ; M9a ; migration 0028 (0167) ; Q48 seulement pour l'option B ».

---

## 9. Décisions du Product Owner

**À confirmer par la revue** (Tech Lead, Sécurité, UX/UI) ; définitives dès la fusion de cette spécification, sans délai de veto (0093), et listées dans la note de version suivante. Samuel peut les remettre en cause à tout moment par une nouvelle décision. Elles ne tranchent rien de réservé à Samuel (Q48, textes, durées, juridique, paiement en attente), au Tech Lead (formes, T1 à T9), à la Sécurité (S1 à S9) ni à l'UX/UI (rendus, textes).

- **M9-PO-1 — Découpage.** M9a, M9b, M9c du plan, une spécification pour les trois (règle du CEO, Q826). M9b-2 seulement si l'option B de Q48 est retenue.
- **M9-PO-2 — Réservé au propriétaire d'une organisation personnelle à un seul membre**, pour l'export comme pour la suppression ; organisation partagée : export refusé, suppression limitée au retrait de l'adhésion (handover § 12).
- **M9-PO-3 — Contenu de l'export.** Liste blanche du § 3.2, lue dans les tables, toutes les versions du programme, données de la personne seulement ; exclusions nommées ; aucune donnée Google hors `placeId`, aucun appel à Google.
- **M9-PO-4 — Format.** JSON indenté, clés du contrat, codes fermés, en-tête `format`, `version`, `exportedAt`, `notice` ; nom `vadrouille-mes-donnees-AAAA-MM-JJ.json` (date de Zurich) ; téléchargement direct, aucune copie.
- **M9-PO-5 — Parcours de réauthentification (Q215, partie fonctionnelle).** Code demandé seulement au-delà de 10 minutes ; adresse de la session non modifiable ; retour à l'action choisie ; expiration en cours de route ramène au code sans rien supprimer.
- **M9-PO-6 — Confirmation de la suppression.** Écran d'explication (supprimé, gardé, irréversible, invitation à exporter), puis le code si nécessaire, puis « Supprimer définitivement » ; aucun « Annuler » après coup ; aucun e-mail de confirmation : **comportement par défaut révocable**, pas une décision, en attendant la question 2 (c) à Samuel.
- **M9-PO-7 — Après la suppression.** Accueil, déconnecté, annonce « Ton compte est supprimé. » ; la même adresse ouvre ensuite un compte neuf.
- **M9-PO-8 — Comportement par défaut pour Q48.** M9b code l'option A, déjà décrite au handover § 12 : **comportement par défaut révocable**, pas une décision (Q48 reste à Samuel) ; le texte affiché suit sa réponse.
- **M9-PO-9 — Page « Ton compte » avec déconnexion.** Elle répond à Q153 (export, suppression, déconnexion) ; lien depuis « Mes voyages ».
- **M9-PO-10 — Aucun événement de mesure nouveau** pour l'export et la suppression.

## 10. Hors périmètre

- Supprimer un seul voyage (sans supprimer le compte) ; supprimer un brief du site d'essai (Q610) ; tout le site d'essai (schéma `prototype`, plan § 10).
- Organisations à plusieurs membres (agences) : écrans, export par personne dans une organisation partagée.
- Export asynchrone (fichier préparé puis envoyé par e-mail ou par lien), export en PDF ou dans un autre format.
- Changer d'adresse e-mail ; gérer ses sessions appareil par appareil.
- Suppression des pièces comptables à l'échéance de leur durée de conservation (tâche future, après Q48).
- Suppression automatique d'un compte inactif (durées : Q27).
- Politique de confidentialité et conditions d'utilisation (Samuel).
