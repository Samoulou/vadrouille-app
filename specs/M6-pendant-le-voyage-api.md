# M6 — Pendant le voyage sur la vraie app : lien privé, calendrier, rappels

Rédaction : Product Owner · Date : 2026-10-31 · `main` relu : `0b75e26` · Ticket : #982 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 6, ligne M6-spec · Rôles des tâches qui suivent : tech-lead et sécurité (M6-TL), backend (M6a, M6c), backend avec frontend (M6b), data pour la migration de M6c, UX/UI (rendus et textes) · Revue : Tech Lead, Sécurité, UX/UI.

Références : `specs/F10-pendant-le-voyage.md` (F10-PO-13 à F10-PO-21, « Exigences reportées à B12 »), décisions 0039 (F10-TL-7, F10-TL-8, F10-TL-14), 0135 (lien signé sans stockage, PR #827 fusionnée), 0002 (hébergement Vercel : ni KV ni Edge Config), 0009 (Workflow SDK), 0010 § 1 (`Stop.name` n'est jamais le `displayName` de Google), 0011 et 0027 (`place_coordinates`), 0138 (envoi réel par Resend, plafond `email_daily_counts`), 0147 § 14 (façon de découper), `docs/handovers/backend.md` (table `share_links`, fonction `resolve_share_link`, vues `shared_*`, § 8, § 12 « Vue partagée », ligne B12 du § 10), `docs/handovers/frontend.md` (§ 0, § 10 vocabulaire, § 11, § 13), `db/migrations/0001_securite.sql` (§ 5.3, § 6.1, vues partagées), `src/server/mail/apercu-pret.ts` (M7a), `src/server/config/email.ts`.

**Prérequis, dans cet ordre** :
1. cette spécification fusionnée ;
2. **décision du Tech Lead M6-TL**, qui répond aux questions T1 à T9 du § 10 (dont : lequel du lien signé de 0135 ou de `share_links` reste sur `api`) ;
3. **avis de la Sécurité** sur S1 à S6 du § 10, dans la revue de M6-TL ou par une décision à part ;
4. M6a, M6b et M6c, chacune avec ses prérequis du § 6.

M6b ne dépend que de T6 : si le Tech Lead y répond à part, M6b peut partir avant le reste. Si la décision M6-TL change un point de cette spécification, elle prime pour ce point.

**Exception à « une tâche = une spécification »** (`CLAUDE.md`) : M6a, M6b et M6c partagent cette spécification, chacune sur sa branche et dans sa PR, comme M1a (0136 § 12) et M5 (0147 § 14). Le CEO l'accorde ou la refuse (question C1 du § 10).

**Écarts relevés dans les documents**, sans effet sur le fond, tous soumis au Tech Lead (§ 10) :
- **Date de fin stockée ou calculée.** F10 (« Exigences reportées à B12 ») dit que la date de fin du lien « n'est pas stockée : elle se calcule à la lecture ». La table `share_links` de B1 a une colonne `expires_at` (`timestamptz NOT NULL`), et les vues partagées et `resolve_share_link` la comparent à `now()`. La règle de F10-TL-7 (comparaison de dates à l'heure de la destination) et celle de la base (instant) doivent donner le même résultat : § 3.2, T3.
- **Vue `shared_checklist`.** B1 a créé une vue partagée de la liste « À faire avant de partir » (libellés, liens de réservation). F10-PO-14 interdit toute liste à réserver dans la vue partagée. M6a ne la lit pas ; son sort (garder sans usage, ou retirer par une migration) est la question T5.
- **Positions de la carte partagée.** Le handover (§ 12, « Vue partagée ») dit qu'aucune lecture de la vue partagée ne lit `place_coordinates` (test `partage: la vue partagée n'expose jamais place_coordinates`). Or la vue partagée de F10c a une carte Google des étapes (F10-TL-14), et 0135 § 8 lit ces positions dans `place_coordinates`, dans l'organisation du jeton. Les deux textes ne tiennent pas ensemble sur `api` : T4.
- **Droit `UPDATE` de `vadrouille_app` sur `share_links`.** Il porte sur toutes les colonnes (`0001_securite.sql`, § 4.1), y compris `token_hash` et `expires_at`. M6a n'a besoin que de `revoked_at` : T9 et S4.
- **Secret de 0135 § 3.** 0135 nomme `VADROUILLE_SHARE_SECRET` « pour B12 et l'adaptateur `api` ». Avec un jeton aléatoire de 32 octets et son empreinte SHA-256 (handover, F10-TL-7), aucun secret n'est nécessaire. Si le Tech Lead garde un jeton aléatoire, la variable n'est pas créée : T1 et S3.
- **Plan, § 6 (a).** Il dit la PR #827 « en revue » : elle est fusionnée (2026-10-28 21:18 UTC, `STATUS.md`). Le plan n'est pas modifié ici.
- **Calendrier.** F10-PO-1 l'avait laissé hors de F10 (place à fixer par le CEO, F10-Q7 = Q143). Le plan § 6 l'attribue à M6b : cette spécification le prend en charge.

---

## 1. Contexte

Ce qui existe, relevé sur `0b75e26` :

| Sujet | Contrat et base | Écrans | Site d'essai (`prototype`) | Vraie app (`api`) |
|---|---|---|---|---|
| Lien privé | `ShareAdapter` (`src/adapters/types.ts`, l. 309) ; contrats `src/contracts/share.ts` ; table `share_links` (empreinte de 32 octets, un lien actif par voyage par index unique partiel), `resolve_share_link`, vues `shared_trip`, `shared_trip_version`, `shared_checklist` sous `vadrouille_share` (B1) | Bouton « Partager », feuille « Partager ton voyage », pages `RP` (`/p/[token]`) et `RPJ` (`/p/[token]/jour/[n]`) (F10c) | **Lien signé sans stockage** (0135) : jeton stable par voyage, non révocable un par un ; garde `realShareAvailable` | **Fermé** : `shareAvailable()` est faux avec `DATA_ADAPTER=api` (`src/adapters/share-guard.ts`) ; aucun code ne lit ni n'écrit `share_links` |
| Calendrier | Rien | Rien | Rien | Rien |
| Rappels | `ChecklistItem.stopId` ; table `email_daily_counts` (usage `notification`, seuil 80 par jour, Q641) ; port `NotificationMailer` (M7a) | Bandeau `quai` « À réserver » de l'écran 15 (aujourd'hui et demain) et bloc « Demain » (F10a) | Bandeau de l'écran 15 | Bandeau de l'écran 15 (l'écran lit les jours par n'importe quel `TripAdapter`) ; aucun e-mail de rappel |

Deux faits pèsent sur la suite :
1. **Le rappel dans l'app existe déjà.** L'écran 15 « Aujourd'hui » montre les étapes « À réserver » d'aujourd'hui et de demain, et le bloc « Demain ». Si les e-mails de rappel ne sont pas retenus, l'étape 6 n'a rien de plus à livrer pour les rappels (§ 5.1).
2. **L'e-mail réel attend Samuel.** Le transport Resend (M2a) ne part qu'après l'action S1 du plan. Le studio code et teste les rappels sur Mailpit en `local` et en `ci`, sans aucun envoi réel (0138, « Conséquences »).

## 2. Ce que la personne voit, tâche par tâche

| Tâche | Ce que Samuel voit sur la vraie app (adaptateur `api`) |
|---|---|
| **M6a — Lien privé** | Sur un voyage débloqué, il ouvre « Partager », « Créer un lien », copie l'adresse. Son amie l'ouvre sans compte : elle voit le programme et la carte, sans logement, sans liste à réserver, sans budget. Il rouvre la feuille : « Un lien est actif depuis le … ». Il choisit « Désactiver le lien » : l'adresse ne mène plus qu'à « Ce lien de partage n'est pas valide. » |
| **M6b — Ajouter au calendrier** | Dans le Séjour, « Ajouter au calendrier » télécharge un fichier. Il l'ouvre : son agenda reçoit une entrée par étape, à la bonne heure, avec le nom de l'étape. |
| **M6c — Rappels** | Dans le Séjour, il active « Rappel par e-mail la veille ». La veille de chaque journée, vers 18:00 heure de la destination, il reçoit un e-mail avec le lien de sa journée du lendemain. Il désactive : plus aucun e-mail. Sans e-mail activé, l'écran « Aujourd'hui » garde ses rappels « À réserver ». |

---

## 3. Lien privé sur `api` (M6a)

### 3.1 Lien signé de 0135 et `share_links` : la question posée au Tech Lead

Deux formes de lien existent dans les documents :

| | Lien signé (0135, fusionné) | `share_links` (B1, handover, F10-TL-7) |
|---|---|---|
| Jeton | `v1.<charge>.<mac>`, HMAC d'une clé dérivée de `P0_RUN_TOKEN` ; identifiants du voyage et de l'organisation lisibles dans la charge | 32 octets aléatoires (`SHARE_TOKEN_PATTERN`, 43 caractères) ; seule l'empreinte SHA-256 est stockée |
| Révocation | Aucune, sauf rotation du code d'accès (tous les liens) ou purge | Un lien à la fois, effective à la requête suivante |
| « Créer un nouveau lien » | Redonne le même lien | Désactive l'ancien, en crée un autre (F10-PO-13) |
| État connu du serveur | Aucun (`getStatus` rend toujours `{ active: false }`) | « Actif depuis le … », « Valable jusqu'au … » |
| Base | Aucune écriture | Tables et vues de B1, sous la RLS |

Options pour l'adaptateur `api` (le Tech Lead tranche, question T1) :
- **(A) Les deux coexistent, chacune sur son adaptateur.** Le lien signé reste au site d'essai (`prototype`) tant qu'il vit ; `api` utilise `share_links` avec un jeton aléatoire. `parseShareToken` accepte déjà les deux formes ; sur `api`, un jeton signé répond 404 sans lecture. Quand le CEO retire le site d'essai (plan § 0.2 point 3), le lien signé part avec lui.
- **(B) `share_links` partout.** Le site d'essai passe aussi à la table. Cela demande une migration dans le schéma `prototype` ou l'accès du site d'essai au schéma principal, ce que le plan exclut (§ 0.2 point 2).
- **(C) Jeton signé puis empreinte** (piste de 0135 § 7) : le jeton reste signé, et la base garde son empreinte pour la révocation. Deux secrets à gérer (clé de signature et base), et une charge lisible par qui a le lien.

**Recommandation du Product Owner : (A).** Raisons : la révocation un par un est une exigence du cadrage (« liens de partage non devinables, hachés en base et révocables », § 9) et de F10-PO-13 ; le site d'essai n'a pas à changer ; aucune variable nouvelle. Le reste de ce § 3 est écrit pour (A). Si le Tech Lead retient (B) ou (C), sa décision prime et M6a suit sa forme.

### 3.2 Règles du lien sur `api`

1. **Garde.** Le partage s'ouvre sur `api` par une garde nouvelle (forme : Tech Lead, T2), fonction pure de l'environnement, sur le modèle de `realShareAvailable` : jamais sur un déploiement de production (Q101 inchangée), seulement avec `DATA_ADAPTER=api` **et** `AUTH_ADAPTER=better-auth`. La démonstration simulée (`VADROUILLE_DEMO_SHARE`, adaptateur `mock`) et le lien signé (`prototype`) ne changent pas.
2. **Session et personne propriétaire.** Créer, remplacer, désactiver un lien et lire son état demandent une session `better-auth` vérifiée (sinon `unauthenticated`, sans appel à l'adaptateur) et sont réservés à **la personne propriétaire du voyage** (`trips.created_by`), pas à tout membre de l'organisation (F10, « Niveau d'autorisation ») : un autre membre reçoit `not_found`, sans rien créer ni désactiver.
3. **Voyage débloqué.** Comme F10c : le bouton « Partager » n'apparaît que pour un voyage débloqué (`Trip.unlocked`, lu par `getTripReader()`) dont le partage n'a pas pris fin. La création est refusée par `not_found` pour un voyage inconnu, d'une autre organisation, non débloqué, ou dont la fin du partage est passée ; la désactivation et la lecture de l'état restent possibles.
4. **Jeton.** 32 octets aléatoires du générateur cryptographique de Node, encodés en `base64url` (43 caractères, `SHARE_TOKEN_PATTERN`). Seule l'empreinte SHA-256 (32 octets, contrainte `share_links_token_hash_check`) est écrite. Le jeton en clair n'existe que dans la réponse de `createShareLink` ; il n'est jamais renvoyé par `getShareStatus`, écrit en base, journalisé, mesuré ni placé dans une autre adresse que `RP` et `RPJ` (F10-PO-17).
5. **Création et remplacement en une transaction**, sous `vadrouille_app` et la RLS de l'organisation de la session : verrou de la ligne du voyage, désactivation du lien actif éventuel (`revoked_at = now()`), insertion du nouveau. L'index unique partiel `share_links_one_active_idx` garantit un seul lien actif, même sous la concurrence. Désactivation : une transaction, idempotente (sans lien actif, elle rend `{ active: false }` sans erreur).
6. **Fin du partage (F10-PO-21).** `expiresOn = accessUntil(trip.end, accessDaysAfterReturn)` (`src/lib/dates.ts`, `src/server/config/offer.ts`). La colonne `expires_at` reçoit **le premier instant du jour qui suit `expiresOn`, à l'heure de la destination** (`trip.timeZone`). Exemple : voyage d'Édimbourg du 2026-08-29 au 2026-09-03, `expiresOn` = 2026-10-03, `expires_at` = 2026-10-04T00:00 heure de Londres = `2026-10-03T23:00:00Z`. À la lecture, la base refuse un lien dont `expires_at <= now()`, et l'adaptateur applique en plus la règle de F10-TL-7 (`localDateAt(now, trip.timeZone) <= expiresOn`) sur le voyage tel qu'il est lu : la plus proche des deux dates l'emporte, comme 0135 § 6. Tout lien du voyage expire à cette date, même créé la veille. Forme exacte (colonne, calcul, cas d'un voyage dont les dates changeraient) : T3.
7. **Contrats inchangés.** `ShareStatus`, `CreatedShareLink`, `SharedTripView`, `SharedDayView` et les actions de `src/server/actions/partage.ts` ne changent pas. Aucun code d'erreur nouveau, sauf `rate_limited` s'il n'est pas déjà admis par ces actions (code existant).
8. **Feuille « Partager ».** Celle de F10c, sans changement de structure. Sur `api`, le texte « Copie-le maintenant : il ne pourra plus s'afficher. » vaut (jeton aléatoire) ; le texte du lien stable de 0135 § 7 ne s'affiche pas. Un refus pour limite atteinte affiche le texte du § 7.

### 3.3 Vue partagée sur `api`

1. **Ordre des contrôles** (F10-PO-15, inchangé) : garde ; forme du jeton (sinon 404 sans lecture) ; limite par adresse IP (§ 3.4) ; puis lecture.
2. **Lecture**, dans une transaction : `resolve_share_link(empreinte)` (rôle `vadrouille_app`), qui pose l'empreinte dans la transaction et rend l'état ; si l'état n'est pas `valid`, 404. Puis `SET LOCAL ROLE vadrouille_share` et lecture des seules vues `shared_trip` et `shared_trip_version`. **`shared_checklist` n'est jamais lue** (F10-PO-14). Aucune lecture directe d'une table.
3. **Projection** par l'implémentation commune `src/adapters/share-views.ts` (celle de `mock` et de `prototype`), champ par champ, validée par `SharedTripViewSchema` et `SharedDayViewSchema` stricts : un champ en trop fait échouer la validation (page d'erreur, 500), jamais une donnée en trop à l'écran.
4. **Jamais transmis au navigateur** (F10-PO-14) : logement et libellés de terminus, liste « À faire », budgets, `id` d'étape, `reason`, `source`, `verifiedAt`, `locked`, `addedBy`, `placeId`, `travelMinutes`, propositions, organisation, identifiant interne du voyage. Voyageurs : composition seulement.
5. **Carte.** Google seulement (`DayMap`, F10-TL-14) : étapes seulement, aucun terminus, marqueurs non interactifs. D'où viennent les positions sur `api` : question T4 (le handover l'interdit par `place_coordinates`, 0135 l'y lit). Sans réponse, la vue s'affiche sans carte (`MapFallback`), jamais une autre carte. Aucune relecture Places ni Routes pour un visiteur (aucun appel payant), aucun `getPlaceDetails` depuis la vue partagée (pas de Fiche dans la vue, F10-PO-14).
6. **Mention « Données de lieux : Google »** : `RP` et `RPJ` suivent la valeur de `placesFromGoogle` du Séjour sur `api` (F10-PO-20).
7. **Réponses** (F10-PO-15) : même 404, même page, pour un jeton inconnu, désactivé, expiré ou mal formé ; erreur de base ou de serveur en 500, jamais en 404 ; en-têtes de `/p/` inchangés (`private, no-store`, `Referrer-Policy: strict-origin`, `X-Robots-Tag: noindex, nofollow`, F10-TL-8).
8. **Préversion `mvp-essai`.** Comme pour le site d'essai (0135 § 9), la protection des déploiements de Vercel empêche un visiteur sans compte Vercel d'ouvrir le lien. Le contournement est un réglage de Samuel (question S4), hors du code.

### 3.4 Limites (valeurs à fixer par la Sécurité, F10-Q6 point 3)

Propositions, dans `RATE_LIMITS` (`src/server/config/limites.ts`), limiteur existant (`action_rate_limits`), aucune table nouvelle :
- `partage-lien` (création, remplacement, désactivation) : 20 par heure et par adresse IP, et 10 par voyage et par 24 heures (espèce `trip`) ;
- `partage-vue` (`RP` et `RPJ`) : 60 par minute et par adresse IP. Au-delà : réponse 429 avec la page d'erreur commune, sans dire si le jeton est valide.

### 3.5 Journal

Aucun jeton, aucune empreinte, aucune adresse `/p/…` dans le journal, les traces ou les erreurs : le chemin est réécrit en `/p/[token]` avant tout export (handover § 12, test `traces: le jeton de /p/[token] n'apparaît dans aucun attribut exporté`). Proposition : deux événements fermés, `partage.lien_cree` et `partage.lien_desactive`, sans champ (ni voyage, ni organisation). Noms et utilité : Tech Lead.

---

## 4. Ajouter au calendrier (M6b)

1. **Ce que c'est.** Un fichier `.ics` (iCalendar, RFC 5545) téléchargé depuis le Séjour, que la personne ouvre avec son agenda. Aucun compte externe, aucun abonnement, aucune adresse publique (pas de `webcal://`) : c'est un instantané du programme au moment du téléchargement.
2. **Accès.** Bouton « Ajouter au calendrier » dans le Séjour d'un voyage **débloqué** (le calendrier fait partie du voyage complet, cadrage § 4). Sinon, pas de bouton. Le fichier est servi par une adresse de l'application sous `/voyages/[id]/` (forme : T6), avec la même session et le même contrôle d'organisation que le Séjour ; voyage inconnu, d'une autre organisation ou non débloqué : 404, sans contenu. Fonctionne avec les adaptateurs `mock` et `api` (lecture par `getTripReader()`) ; le site d'essai (`prototype`) n'est pas concerné (plan § 10 : aucune tâche nouvelle sur le prototype).
3. **Une entrée par étape.** Un `VEVENT` par élément de `Day.items` de type `stop`, pour chaque journée qui n'est pas en préparation. **Ne sont pas des entrées** : les terminus (logement), les temps libres, les repas pas encore choisis (`openMeal`), l'idée « Surprends-moi », les événements de « Pendant ton séjour » et les engagements saisis (billets, réservations : la personne les a déjà). Une journée en préparation (`generating: true`) n'a aucune entrée.
4. **Contenu de chaque entrée, et rien d'autre** :
   - `SUMMARY` : `Stop.name`, le **nom maison** (0010 § 1 : jamais le `displayName` de Google) ;
   - `DTSTART` : date de la journée et `Stop.start`, converties en UTC (`…Z`) depuis le fuseau du voyage ; `DTEND` : `Stop.end` s'il existe, sinon absent ;
   - `DESCRIPTION` : « À réserver. » si l'étape porte l'exception `toReserve`, puis l'adresse de la Journée dans l'application ;
   - `URL` : l'adresse de la Journée dans l'application (`/voyages/[id]/jour/[n]`, origine de `APP_URL`) ;
   - `UID` stable par voyage et par étape (forme : T6), `DTSTAMP` (instant du téléchargement), `SEQUENCE` = version courante du programme, pour qu'un nouveau téléchargement remplace les entrées dans les agendas qui le gèrent.
   - En-tête : `VERSION:2.0`, `PRODID`, `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME` = « {destination} · Programme ».
5. **Aucune donnée Google** (`CLAUDE.md`) : ni `LOCATION`, ni `GEO`, ni adresse, ni coordonnées, ni horaires d'ouverture, ni note de prix ou d'horaires, ni `placeId`, ni lien vers Google Maps. Le nom de l'étape est le seul texte de lieu, et il est maison.
6. **Format.** `Content-Type: text/calendar; charset=utf-8` ; `Content-Disposition: attachment; filename="programme.ics"` ; `Cache-Control: private, no-store`. Lignes en CRLF, pliées à 75 octets, caractères `\`, `;`, `,` et retours à la ligne échappés (RFC 5545 § 3.1 et § 3.3.11).
7. **Hors ligne** : bouton en `aria-disabled="true"` et explication (handover § 13). **Sans étape** à ajouter (toutes les journées en préparation) : pas de téléchargement, texte du § 7.
8. **Après une retouche**, le fichier déjà importé ne change pas : le texte sous le bouton le dit (§ 7).
9. Aucun appel externe, aucun modèle, aucun événement de mesure nouveau.

---

## 5. Rappels (M6c)

### 5.1 Canal proposé (à confirmer par Samuel, question 1)

- **Base, déjà livrée** : le rappel dans l'app (écran 15 : bandeau « À réserver » d'aujourd'hui et de demain, bloc « Demain »). Il reste le seul rappel tant que Samuel n'a pas répondu, et le seul pour qui n'active pas l'e-mail.
- **Proposition** : un **e-mail la veille de chaque journée**, **sur accord explicite** de la personne, révocable à tout moment, **seulement après l'étape 2** (transport Resend, action S1). Avant S1, le code ne part que vers Mailpit en `local` et en `ci`.
- Pas de notification push (handover § 16), pas de SMS, pas d'agenda partagé.

Raison : l'e-mail touche la personne qui n'ouvre pas l'application le soir ; l'accord protège la boîte de qui ne le veut pas ; le rappel dans l'app couvre le reste sans aucun envoi. Ce choix fait sortir des adresses vers un sous-traitant (Resend, données du compte aux États-Unis, Q644, Q646) : il revient à Samuel.

### 5.2 Accord

1. Interrupteur « Rappel par e-mail la veille » dans le Séjour d'un voyage débloqué, éteint par défaut. L'activer est l'accord ; l'éteindre le retire. Pas de case cochée d'office, pas d'accord donné par la création du compte.
2. L'accord est **par voyage et par personne** (la personne propriétaire, seule dans son organisation au MVP). Il est enregistré avec son instant ; son retrait aussi. Aucune adresse n'est copiée : l'adresse est lue sur le compte (`users.email`) au moment de chaque envoi, comme M7a.
3. Accord donné pendant le voyage : le premier e-mail est celui de la prochaine veille encore à venir ; aucun rattrapage.
4. Garde : l'interrupteur n'apparaît que si le port des notifications est branché (`NotificationMailer` différent de `disabledNotificationMailer`) ; sinon, pas d'interrupteur, sans texte de remplacement.

### 5.3 Envoi : workflow durable avec `sleep`

1. **Un workflow par accord** (Workflow SDK, `src/workflows/`, décision 0009), démarré à l'activation. Il calcule l'instant du prochain envoi, attend avec `sleep` jusqu'à lui, puis envoie, et recommence jusqu'à la veille de la dernière journée.
2. **Heure d'envoi** : 18:00 à l'heure de la destination (`trip.timeZone`), la veille de chaque journée J1 à Jn ; la veille de J1 comprise ; aucun envoi le dernier jour ni après. Exemple d'Édimbourg (J1 = 2026-08-29) : six e-mails, du 2026-08-28 au 2026-09-02, chacun à 18:00 heure de Londres (`17:00Z`).
3. **À chaque réveil**, le workflow relit tout avant d'envoyer, et n'envoie rien (fin du workflow, ou passage au jour suivant) si : l'accord est retiré ; le voyage n'existe plus, n'est plus débloqué ou n'appartient plus à l'organisation ; la journée du lendemain n'existe pas ou est en préparation (ce jour-là seulement) ; le compte n'a plus d'adresse valide.
4. **Une fois par journée** : avant l'envoi, une réclamation en base `(voyage, journée)` unique, validée avant l'appel du transport (même principe que la réclamation de M7a) ; une reprise du workflow, un double démarrage ou un nouvel accord ne renvoient jamais l'e-mail d'une journée déjà réclamée. Aucune nouvelle tentative après un échec (0138 C4).
5. **Plafond** : chaque envoi réserve l'usage `notification` dans `email_daily_counts` (`reserveEmail`, `src/server/mail/plafond.ts`), avant le transport. Plafond atteint : rien n'est envoyé ce jour-là, `email.cap_reached`, et le workflow passe à la journée suivante. Plafond propre aux rappels : question 2 à Samuel.
6. **État sérialisé du workflow** : identifiants seulement (organisation, voyage, personne, prochaine journée). Ni adresse, ni nom d'étape, ni destination, ni donnée Google (handover § 8).
7. **Jamais un service propre à Vercel** (0002) : ni KV, ni Edge Config, ni tâche planifiée de la plateforme. Le monde du Workflow SDK reste un choix de configuration (local, Vercel, Postgres) ; l'état métier (accord, réclamations) vit dans Postgres.
8. **Sans transport branché** (`EMAIL_TRANSPORT` absent) : le workflow ne démarre pas, l'interrupteur n'apparaît pas (§ 5.2 point 4).

### 5.4 Contenu de l'e-mail

Comme M7a : le lien de la Journée du lendemain (`/voyages/[id]/jour/[n]`), et c'est tout. Ni destination, ni date, ni nom d'étape, ni heure, ni contenu du programme, ni donnée Google. Raison : minimiser ce qui part chez le sous-traitant (Q646). Ajouter les noms des étapes du lendemain serait plus utile, mais c'est un choix de Samuel (question 1, point c). Textes : § 7.

### 5.5 Données

Une migration (forme : Tech Lead, T8) : l'accord (organisation, voyage, personne, instant d'accord, instant de retrait) et les réclamations (organisation, voyage, numéro de journée, instant), RLS par organisation, aucune adresse, aucun texte. `purge_organization_data` les supprime avec le reste. Durée : celle du voyage (Q27).

---

## 6. Découpage des tâches, fichiers, critères, tests

Composition simulée partout, barrière fermée, aucun appel payant, tests de base de données en CI. Les noms de fichiers sont des propositions : la décision M6-TL et l'analyseur de confinement font foi.

| ID | Tâche | Rôle | Prérequis | Interdit dans le même cycle |
|---|---|---|---|---|
| **M6a** | Lien privé sur `api` (§ 3) | backend | cette spécification, M6-TL (T1 à T5, T9), avis Sécurité (S1 à S4) | M6c si M6a demande une migration (T5, T9) ; toute autre tâche qui touche `src/adapters/index.ts` ou `src/server/actions/partage.ts` |
| **M6b** | Ajouter au calendrier (§ 4) | backend avec frontend (UX/UI pour le rendu) | cette spécification, T6 | M6c (même panneau du Séjour) ; une tâche qui modifie `SejourPanel.tsx` |
| **M6c** | Rappels par e-mail (§ 5) | backend (migration relue par data ; interrupteur relu par UX/UI) | cette spécification, M6-TL (T7, T8), avis Sécurité (S5, S6), M2a (fusionnée, #850) ; **réponse de Samuel aux questions 1 et 2** pour l'ouverture réelle, pas pour le code | M6b ; toute autre tâche `db/migrations` (plan § 10) ; une tâche qui modifie `src/workflows/index.ts` |

Ordre proposé : M6a et M6b en parallèle (fichiers distincts), puis M6c.

### 6.1 M6a — Lien privé sur `api`

**Fichiers** : `src/adapters/share-guard.ts` et son test (garde `api`) ; `src/adapters/api-share.ts` (nouveau, adaptateur `share_links`) et son test ; `src/adapters/index.ts` (`getShareAdapter`, `shareButtonVisible`) ; `src/server/partage/liens.ts` (nouveau : création, remplacement, désactivation, état) ; `src/server/partage/vue.ts` (nouveau : `resolve_share_link` puis vues sous `vadrouille_share`) ; `src/server/actions/partage.ts` (session, personne propriétaire, limite) ; `src/server/config/limites.ts` (`partage-lien`, `partage-vue`) ; `src/app/p/[token]/page.tsx`, `src/app/p/[token]/jour/[n]/page.tsx` (limite par adresse, `placesFromGoogle`) ; `src/server/log.ts` (événements du § 3.5, si retenus) ; `tests/db/partage-api.test.ts` ; `tests/e2e/partage-api.api.spec.ts` ; lignes de `tests/unit/confinement/` ; `docs/handovers/backend.md` (ligne B12 du § 10 : partage fait). Aucune migration, sauf si T5 ou T9 en demandent une (alors tâche `data` à part, M6a-D, avant M6a).

**Critères d'acceptation** (voyage d'Édimbourg débloqué, du 2026-08-29 au 2026-09-03, `Europe/London`, horloge de la portée) :
1. Garde : `shareAvailable` vrai avec `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth`, `NODE_ENV=test` ; faux en production (`VADROUILLE_ENV` ou `VERCEL_ENV` à `production`), faux sans `better-auth`. Les lignes existantes de `share-guard.test.ts` restent, aucune n'est retirée.
2. Sans session : les trois actions rendent `unauthenticated` sans appel à l'adaptateur.
3. Membre de l'organisation non propriétaire : `not_found`, aucun lien créé ni désactivé (test `partage: membre non propriétaire`).
4. Voyage non débloqué, d'une autre organisation ou inconnu : création `not_found`, aucune ligne écrite.
5. Création : une ligne `share_links` dont `token_hash` est le SHA-256 du jeton rendu ; le jeton (43 caractères) n'est dans aucune colonne ; `created_by` = la personne ; `expires_at` = `2026-10-03T23:00:00Z`.
6. « Créer un nouveau lien » : l'ancien a `revoked_at` posé, le nouveau est le seul actif ; l'ancien jeton répond 404 à la requête suivante.
7. Deux créations simultanées pour le même voyage : un seul lien actif à la fin, aucune erreur 500 montrée.
8. Désactivation : `revoked_at` posé ; `RP` et `RPJ` du jeton répondent 404, même page que pour un jeton inconnu ; désactiver sans lien actif rend `{ active: false }`.
9. État : « actif depuis » = `created_at`, « valable jusqu'au » = 2026-10-03 ; le jeton n'est jamais dans la réponse.
10. Expiration : le 2026-10-03 à 23:59 heure de Londres, `RP` répond 200 ; le 2026-10-04 à 00:00, 404 ; création refusée (`not_found`) le 2026-10-04 ; bouton « Partager » absent.
11. Vue partagée : seules `shared_trip` et `shared_trip_version` sont lues ; un voyage dont la liste « À faire » a une ligne sentinelle ne la montre nulle part dans `RP` ni `RPJ` (HTML et données transmises).
12. Projection stricte : un instantané de test avec une clé en trop, une étiquette de logement, un `placeId`, un `reason` et `addedBy` sentinelles ne transmet aucune de ces valeurs au navigateur (`partage: SharedTrip n'expose pas organizationId`, `vues partagées: l'instantané partagé ne contient que les clés de la liste blanche`).
13. Jeton de l'autre forme (lien signé de 0135) sur `api` : 404 sans lecture de la base (option (A)).
14. Limites : au-delà de `partage-lien`, `rate_limited` sans écriture ; au-delà de `partage-vue`, 429, sans lecture de `share_links`.
15. En-têtes sur 200, 404, 429 et 500 de `/p/` : ceux de F10-TL-8 (`partage: en-têtes de confidentialité et limite par adresse`).
16. Journal et traces : le jeton, son empreinte et l'adresse `/p/…` n'apparaissent dans aucun événement ni attribut exporté (`traces: le jeton de /p/[token] n'apparaît dans aucun attribut exporté`).
17. Carte : selon T4 ; sans réponse, état de remplacement, aucune autre carte, aucun appel Places ni Routes (doubles de `src/grounding` sans appel).

**Tests** : unitaires (garde, adaptateur avec base simulée, projection) ; base (`tests/db/partage-api.test.ts` : critères 3 à 11, 13, 14) ; bout en bout `api` (`tests/e2e/partage-api.api.spec.ts` : créer, ouvrir sans session dans un autre contexte de navigateur, désactiver, 404) ; a11y de la feuille et de `RP` inchangés. Aucun test existant retiré ni affaibli.

### 6.2 M6b — Ajouter au calendrier

**Fichiers** : `src/domain/calendrier.ts` (nouveau, fonction pure : programme → texte iCalendar) et son test ; adresse du fichier, par exemple `src/app/voyages/[id]/calendrier/route.ts` (forme : T6) ; `src/features/sejour/SejourPanel.tsx` et un composant `AjouterAuCalendrier.tsx` (nouveau) ; `src/i18n/fr/sejour.json` ; `tests/e2e/calendrier.e2e.spec.ts` (`mock`) et `tests/e2e/calendrier-api.api.spec.ts` ; `tests/e2e/routes.ts` (inventaire des routes) ; `tests/e2e/voyage.a11y.spec.ts` ou fichier a11y du Séjour.

**Critères d'acceptation** :
1. Voyage débloqué : bouton « Ajouter au calendrier » dans le Séjour ; non débloqué : pas de bouton, et l'adresse du fichier répond 404.
2. Sans session (`api`) : pas de fichier (même réponse que le Séjour sans session) ; autre organisation : 404.
3. Le fichier a les en-têtes du § 4 point 6 et commence par `BEGIN:VCALENDAR`, `VERSION:2.0`.
4. Une entrée par étape, et seulement par étape : le nombre de `VEVENT` est égal au nombre d'items `stop` des journées qui ne sont pas en préparation ; aucun terminus, temps libre, `openMeal`, « Surprends-moi », événement ni engagement.
5. Heures : l'étape « [Bonne table de New Town] » du 2026-08-30 à 19:00 a `DTSTART:20260830T180000Z` ; « [Petite adresse du Grassmarket] » du 2026-08-29 à 12:45 a `DTSTART:20260829T114500Z` ; une étape sans fin n'a pas de `DTEND`.
6. `SUMMARY` est `Stop.name` ; un nom avec `;`, `,`, `\` et un retour à la ligne est échappé ; un nom long est plié à 75 octets sans couper un caractère UTF-8 ; le fichier se relit par un analyseur iCalendar de test (ou une relecture maison) en donnant le même nom.
7. **Aucune donnée Google** : avec un voyage dont les étapes portent des valeurs sentinelles dans `placeId`, `facts` (horaires, prix), `source`, et des positions sentinelles, aucune de ces valeurs n'est dans le fichier ; aucune ligne `LOCATION` ni `GEO` ; aucun hôte `google.` (test `calendrier: aucune donnée Google hors du nom maison`).
8. `DESCRIPTION` contient « À réserver. » pour une étape `toReserve`, et seulement pour elle ; `URL` est l'adresse de la Journée de l'étape.
9. `UID` identique pour la même étape entre deux téléchargements ; `SEQUENCE` = version courante.
10. Une journée en préparation n'a aucune entrée ; toutes en préparation : texte « Aucune étape à ajouter pour l'instant. » et pas de téléchargement.
11. Hors ligne : bouton `aria-disabled="true"` et texte du § 7 ; cible ≥ 44 px ; axe sans violation.

**Tests** : unitaires de `src/domain/calendrier.ts` (critères 4 à 10, fuseaux : Londres en été, Lisbonne, passage à l'heure d'hiver le 2026-10-25) ; route (critères 1 à 3) ; bout en bout `mock` et `api` (téléchargement, contenu) ; a11y.

### 6.3 M6c — Rappels par e-mail

**Fichiers** : `db/schema/business.ts` ; `db/migrations/<n>_rappels.sql` et `.down.sql` (numéro libre au moment de la PR) ; `tests/db/rappels.test.ts` ; `tests/db/roles.test.ts` (droits) ; `src/workflows/rappels.ts` (nouveau) et `src/workflows/index.ts` (démarrage) ; `src/server/rappels/accord.ts`, `src/server/rappels/envoi.ts` (nouveaux) ; `src/server/mail/rappel.ts` (message, sur le modèle d'`apercu-pret.ts`) ; `src/server/actions/rappels.ts` (nouveau : `setTripReminders`) ; `src/server/config/rappels.ts` (heure d'envoi, plafond éventuel) ; `src/features/sejour/` (interrupteur) ; `src/i18n/fr/emailRappel.json`, `src/i18n/fr/sejour.json` ; `src/server/log.ts` ; `docs/handovers/backend.md` (§ 8, « Workflow 7 — rappels ») ; lignes de confinement.

**Critères d'acceptation** (horloge injectée, Mailpit en `local` et `ci`, aucun envoi réel) :
1. Interrupteur éteint par défaut ; absent si le voyage n'est pas débloqué ou si le port des notifications n'est pas branché.
2. Activer : une ligne d'accord avec son instant, un workflow démarré ; éteindre : instant de retrait posé ; aucune adresse dans ces lignes (test `rappels: aucune adresse ni texte en base`).
3. Sans session : `unauthenticated` ; autre organisation ou membre non propriétaire : `not_found`, rien écrit.
4. Voyage d'Édimbourg, accord le 2026-08-20 : six e-mails dans Mailpit, du 2026-08-28 au 2026-09-02, chacun à `17:00Z` ; aucun le 2026-09-03 ni après.
5. Accord le 2026-08-30 à 20:00 heure de Londres : premier e-mail le 2026-08-31 à 18:00 (veille de J4) ; aucun rattrapage.
6. Retrait le 2026-08-30 à 12:00 : plus aucun e-mail.
7. Journée du lendemain en préparation : pas d'e-mail ce soir-là, envoi repris le soir suivant.
8. Reprise du workflow après l'envoi, double démarrage, accord retiré puis redonné le même jour : un seul e-mail par journée (test `rappels: une relance ne double aucun envoi`).
9. Plafond `notification` atteint : aucun envoi, `email.cap_reached` avec `usage: "notification"`, e-mail du lendemain envoyé si le plafond le permet.
10. Contenu : l'objet et le corps du § 7, le lien de la Journée du lendemain ; ni destination, ni date, ni nom d'étape, ni hôte `google.` (valeurs sentinelles dans le voyage, absentes du message).
11. État sérialisé du workflow : identifiants seulement (test `workflows: aucune donnée Google dans l'état sérialisé` étendu au workflow des rappels ; aucune adresse).
12. Journal : `email.sent`, `email.cap_reached`, `email.notification_failed` sans valeur (ni adresse, ni lien, ni identifiant).
13. Migration : RLS activée et forcée, test d'isolation entre deux organisations, `.down.sql`, `purge_organization_data` supprime les lignes.

**Tests** : unitaires (calcul des instants d'envoi, fuseaux, changement d'heure, cas du § 5.3 point 3) ; base (`tests/db/rappels.test.ts` : critères 2, 3, 8, 13) ; workflow sur le monde local avec horloge injectée (critères 4 à 9, 11) ; Mailpit (critère 10, comme `tests/db/apercu-pret.test.ts`) ; a11y de l'interrupteur.

---

## 7. Textes proposés (français, **à valider par l'UX/UI**)

Tutoiement, phrases courtes, sans point d'exclamation (handover § 10). Vocabulaire : « Séjour », « Journée », « étape », « programme », « À réserver », « Désactiver » (jamais « révoquer » à l'écran).

**Lien privé (M6a)** — textes de F10c inchangés, plus :
- Limite de création atteinte : « Tu as créé beaucoup de liens pour ce voyage. Réessaie demain. »
- Trop de consultations (page 429 de la vue partagée) : « Trop de visites sur ce lien pour le moment. Réessaie dans une minute. »

**Ajouter au calendrier (M6b)** :
- Bouton : « Ajouter au calendrier »
- Sous le bouton : « Un fichier pour ton agenda, avec une entrée par étape. Si ton programme change, ajoute-le à nouveau. »
- Journées en préparation : « Les journées encore en préparation n'y sont pas. »
- Aucune étape : « Aucune étape à ajouter pour l'instant. »
- Hors ligne : « Tu es hors ligne. Ajouter au calendrier demande une connexion. »
- Nom du calendrier : « {destination} · Programme » ; description d'une étape à réserver : « À réserver. »
- **Décision UX/UI (U1, U3), revue consolidée du head `518f9bc` de la PR 1007 (M6b)** : bouton secondaire de Ligne (52 px), dans le Séjour sous « Jour par jour » et avant « Versions du programme », Séjour seulement (pas l'écran 15) ; textes ci-dessus validés tels quels. Définitive à la fusion de M6b (décision 0093).

**Rappels (M6c)** :
- Interrupteur : « Rappel par e-mail la veille »
- Sous l'interrupteur : « Chaque soir vers 18:00, heure de ta destination, un e-mail avec le lien de ta journée du lendemain. Tu peux l'arrêter à tout moment. »
- Annonces (`role="status"`) : « Rappels activés. » ; « Rappels arrêtés. »
- Erreur : « Impossible de modifier les rappels pour le moment. » avec « Réessayer ».
- Hors ligne : « Tu es hors ligne. Modifier les rappels demande une connexion. »
- E-mail, objet : « Ta journée de demain »
- E-mail, corps : « Ta journée de demain est prête.\n\nPour la voir : {lien}\n\nTu reçois ce message parce que tu as demandé un rappel la veille de chaque journée sur {produit}. Pour l'arrêter, ouvre ton Séjour : {lienSejour} »
- **Décision UX/UI (U2, U3) : à confirmer par la revue** (PR 1024, M6c) : interrupteur dans le Séjour seulement (pas l'écran 15), sous « Ajouter au calendrier » ; piste en tokens de Ligne (allumé : aplat `line`) ; enregistrement visible (interrupteur atténué) ; hors ligne : interrupteur et « Réessayer » inactifs (`aria-disabled`), décrits par le bandeau hors ligne ; erreur : bandeau effacé à chaque nouvel essai ; textes ci-dessus tels quels.

---

## 8. Décisions du Product Owner

Définitives dès la fusion, sans délai de veto (0093) ; à lister dans la prochaine note de version. Elles ne tranchent rien de réservé à Samuel, au Tech Lead, à la Sécurité ni à l'UX/UI.

- **M6-PO-1 — Découpage.** M6a (lien privé, backend), M6b (calendrier, backend avec frontend), M6c (rappels, backend avec migration et interrupteur) ; une spécification pour les trois, sous réserve du CEO (C1).
- **M6-PO-2 — Lien privé sur `api` = règles de F10c.** Personne propriétaire seule, voyage débloqué, un lien actif, remplacement et désactivation confirmés, fin = `accessUntil(trip.end, 30)`, même 404 pour les quatre cas, vue sans logement ni liste ni budget. Aucune règle fonctionnelle nouvelle, sauf les limites (valeurs : Sécurité).
- **M6-PO-3 — Calendrier : fichier, pas abonnement.** Un fichier téléchargé, instantané du programme. Raison : une adresse d'abonnement serait un second lien public à protéger et à révoquer.
- **M6-PO-4 — Calendrier : étapes seulement.** Ni terminus (logement), ni temps libres, ni repas à choisir, ni événements, ni engagements. Raison : « une entrée par étape » (plan § 6) ; les engagements viennent de la personne, qui les a déjà.
- **M6-PO-5 — Calendrier : nom maison seul.** Aucun champ de lieu Google, aucune adresse, aucune position ; le lien vers l'application remplace l'adresse.
- **M6-PO-6 — Calendrier : voyage débloqué seulement**, comme le partage (cadrage § 4, « Voyage complet »).
- **M6-PO-7 — Rappels : le rappel dans l'app reste la base** ; l'e-mail s'ajoute sur accord, si Samuel l'accepte (question 1).
- **M6-PO-8 — Rappels : la veille à 18:00, heure de la destination**, de la veille de J1 à la veille du dernier jour ; aucun rattrapage après un accord tardif ; aucun envoi pour une journée en préparation.
- **M6-PO-9 — Rappels : e-mail minimal**, le lien seul, comme M7a ; plus de contenu seulement sur décision de Samuel (question 1, point c).

## 9. Hors périmètre

- Notifications push, SMS, rappels à J-7, « Ce soir », « Deux heures libres », « S'il pleut » (cadrage § 3.5, après le MVP).
- Abonnement de calendrier (`webcal://`), synchronisation avec Google Agenda ou un autre compte externe.
- Plusieurs liens par voyage, liens nominatifs ou protégés par code, durée de partage choisie (F10, « Hors périmètre »).
- Ouverture en production (Q101) ; information du visiteur sur la carte Google (F10-Q10, Samuel).
- Rappels pour d'autres personnes que la personne propriétaire ; rappels des engagements.
- Retrait du lien signé du site d'essai : avec le retrait du site d'essai (CEO, après le jugement de Samuel).
- Écran 15 sur `api` : il lit déjà les jours par `getTripReader()` ; rien à livrer ici.

---

## 10. Questions, par destinataire

Rien n'est tranché ici à la place de leur destinataire. Le CEO les reporte dans `QUESTIONS.md`.

**Samuel** (réservées : comptes externes, envoi réel d'e-mails, données personnelles hors UE, argent) :
1. **Rappels par e-mail.** (a) Accepter le canal du § 5.1 : e-mail la veille de chaque journée, sur accord, après l'étape 2 ; sinon, rappel dans l'app seulement ? (b) Les adresses partent chez Resend, qui garde les données du compte aux États-Unis (Q644, Q646) : acceptable pour ce cas aussi ? (c) Contenu : le lien seul (recommandation), ou aussi les noms des étapes du lendemain ? Recommandation du Product Owner : oui à (a), avec le lien seul. Bloque : l'ouverture réelle de M6c, pas son code.
2. **Plafond des e-mails de rappel** (complète Q641). Proposition : au plus un e-mail par voyage et par jour, donc au plus un par journée du voyage ; tous comptés dans l'usage `notification` (arrêt à 80 par jour, total commun de 100) ; aucun plafond propre aux rappels tant que Samuel est le seul testeur. Faut-il un plafond plus bas pour les rappels (par exemple 20 par jour), pour garder de la place aux codes de connexion ? Bloque : l'ouverture réelle de M6c.
3. **Protection des déploiements sur `mvp-essai`.** Comme pour le site d'essai (0135 § 9), un visiteur sans compte Vercel ne peut pas ouvrir un lien `/p/…` sans contournement. Poser une exception ciblée sur `/p/` de la préversion `mvp-essai`, au moment de son essai ? Bloque : l'essai du lien privé par une autre personne, pas le code.

**Tech Lead** (décision M6-TL) :
1. **T1 — Lequel reste sur `api` : le lien signé de 0135 ou `share_links` ?** Options (A), (B), (C) du § 3.1 ; recommandation du Product Owner : (A). Préciser le sort du lien signé au retrait du site d'essai, et de `VADROUILLE_SHARE_SECRET` (0135 § 3).
2. **T2 — Garde `api`** : forme et nom (§ 3.2 point 1), lien avec `assertApiAdapter` et `betterAuthAllowed`, test amendé par écrit.
3. **T3 — `expires_at`** : instant stocké (§ 3.2 point 6) et double contrôle à la lecture ; que faire si les dates d'un voyage changent après la création d'un lien (M4) ; amendement de F10 (« la date de fin n'est pas stockée »).
4. **T4 — Positions de la carte partagée sur `api`** : lire `place_coordinates` dans l'organisation du lien (comme 0135 § 8) et amender le handover, ou garder l'interdiction et une vue sans carte.
5. **T5 — Vue `shared_checklist`** : la laisser sans lecteur, ou la retirer par une migration (avec la Sécurité).
6. **T6 — Calendrier** : adresse et forme (route `GET` sous `/voyages/[id]/` ou action serveur), heures en UTC ou `TZID` avec `VTIMEZONE`, forme de l'`UID` (aucun domaine vérifié, Q640), place de la fonction pure (`src/domain`).
7. **T7 — Workflow des rappels** : un workflow par accord avec des `sleep` de plusieurs semaines est-il tenable dans le monde Vercel et le monde Postgres (durée maximale, coût, version du code d'un workflow endormi après un déploiement) ? Arrêt sur retrait : fin au réveil, ou annulation de l'exécution ? Un seul workflow actif par voyage : comment le garantir ?
8. **T8 — Migration des rappels** : forme des deux tables (§ 5.5), droits, et tâche à part (`data`, M6c-D) ou dans M6c.
9. **T9 — Droit `UPDATE` de `vadrouille_app` sur `share_links`** : le réduire à `revoked_at` (migration) avant M6a, ou plus tard ?

**Sécurité** :
1. **S1 — Limites** du § 3.4 (`partage-lien`, `partage-vue`) : valeurs, espèces, réponse 429 de la vue partagée (F10-Q6 point 3, Q142).
2. **S2 — Jeton dans les journaux de l'hébergeur** (Q142, point 2) : le chemin `/p/<jeton>` reste dans les journaux d'accès de Vercel ; suffit-il que le lien soit révocable et expire, en attendant la politique de conservation (Q27) ?
3. **S3 — Empreinte sans secret** : SHA-256 d'un jeton aléatoire de 32 octets, sans HMAC ni `VADROUILLE_SHARE_SECRET` ; à confirmer.
4. **S4 — Droit `UPDATE` sur `share_links`** (avec T9) et vue `shared_checklist` (avec T5).
5. **S5 — Fichier `.ics`** : en-têtes (`attachment`, `private, no-store`), contenu limité au § 4 point 4 ; l'adresse de l'application dans `URL` et `DESCRIPTION` est-elle acceptable dans un fichier qui peut circuler ?
6. **S6 — E-mail de rappel** : usage de `resend.ts` par une notification de plus (comme Q678 pour M7a, amendement de 0138 § 9) ; accord enregistré sans adresse ; état du workflow sans adresse.

**UX/UI** :
1. **U1 — Place de « Ajouter au calendrier »** dans le Séjour (et sur l'écran 15 ou non), style du bouton.
2. **U2 — Place et rendu de l'interrupteur** « Rappel par e-mail la veille » (Séjour ou écran 15), états hors ligne et erreur.
3. **U3 — Textes du § 7**, dont l'e-mail de rappel et les pages de limite.
4. **U4 — Page 429 de la vue partagée** : page d'erreur commune ou page propre.

**CEO** :
1. **C1 — Exception « une spécification, plusieurs tâches »** pour M6a, M6b et M6c (comme 0136 § 12 et 0147 § 14) ; ordre des cycles (M6a et M6b en parallèle, puis M6c, une seule tâche `db/migrations` par cycle).
