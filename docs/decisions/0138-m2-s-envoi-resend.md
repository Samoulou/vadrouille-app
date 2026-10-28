# 0138 — Décision de la Sécurité sur l'envoi réel par Resend (M2-S) : conditions des transports, clé `RESEND_API_KEY`, cas admis, barrière de sortie, sous-traitant, lignes de confinement, erreurs de Resend, plafond ; amendement de 0098

Statut : acceptée à sa fusion, sans délai de veto (décision 0093) · **décision de la Sécurité** (prérequis M2-S de `specs/B3d-envoi-reel-resend.md`, questions M2-S-1 à M2-S-8) **et du Tech Lead pour le seul § 11** (T1 à T4) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle **amende 0098** (§ 1, § 3.3, § 4 points 2, 3 et 5, § 5, § 6 et § 7 ; § 10 ci-dessous, texte avant et après). Le § 11 (T1 à T4) a été **confirmé par le Tech Lead dans la revue consolidée de la PR #840 du 2026-10-28** (head `6ba7376`), T1 sous deux conditions reprises au § 11 ; il est enregistré **ici**, et la PR de M2a y renvoie (aucune décision séparée du Tech Lead n'est requise). Elle ne tranche rien de réservé à Samuel (Q640, Q641, Q644, action S1 : § 13), n'engage ni argent ni compte, ne pose aucune clé ni aucune variable, et ne supprime ni ne désactive aucun test. **Le code de M2a ne commence pas avant sa fusion** (spécification, « Prérequis »).

Date : 2026-10-28 · Décideur : Sécurité (§ 1 à § 10, § 12 et § 13) ; Tech Lead (§ 11, confirmé dans la revue de #840 du 2026-10-28) · Rédaction : Sécurité (commit `[secu]`) · Ticket : #838 · Spécification : `specs/B3d-envoi-reel-resend.md` (#830, fusionnée par #833) · Décisions liées : 0002, 0035, 0050, 0051, 0077 § 5.1 et § 5.6, 0093, 0098 (amendée), 0062, 0097 (forme de `transport-http.ts`), 0120 et 0122 (forme)

Numérotation : 0138 est réservé par le CEO pour cette décision. `main` (`fa1d730`) porte les décisions jusqu'à 0137 (sans 0136, portée par la PR #835, ouverte) ; aucune autre PR ouverte ne porte 0138.

Vérifié sur `origin/main` à `fa1d730` (les numéros de ligne ci-dessous sont ceux de ce head ; ceux de la spécification, relevés à `4be5bdd`, sont identiques pour tous les fichiers cités) :
- `src/server/env/index.ts` : `VARIABLES` l. 33-74 ; `presente` l. 183 ; `decodeSecret` l. 278-292 ; `surVercel` l. 338 (`VERCEL_ENV` présente et `VERCEL` exactement `1` après `trim()`) ; refus de présence d'`EMAIL_TRANSPORT` et `SMTP_URL` l. 379-383 ; `better-auth` refusé hors `local` et `ci` l. 403 ; `EMAIL_TRANSPORT` l. 405-416 ; parcours `for (const nom in env)` l. 438-446 ; résultat l. 519-530.
- `src/server/env/resolve.ts` : `declaree` l. 39-43 (`trim().toLowerCase()`, vide = absente) ; `resolveServerEnvironment` l. 50-60 (`preview` et `staging` donnent tous deux `staging`, l. 30-31).
- `src/server/env/egress.ts` : `verifierSortie` l. 257-310 ; liste d'autorisation `preview`, `development` en comparaison exacte l. 60 et l. 123-127 ; `VERCEL_TARGET_ENV` égale à `VERCEL_ENV` si présente l. 125 ; lecture du vrai `process.env` l. 134-140 et l. 289 ; proxy l. 290-295 ; TLS l. 296-308.
- `src/server/env/ai.ts` l. 17-23 (modèle : barrière, puis lecture de la clé) ; `src/server/env/garde-cles.ts` l. 14-21 ; `src/server/env/payment.ts` (modèle de module étroit).
- `src/server/payment/transport-http.ts` l. 17-25 (modèle : `fetch` avec `redirect: "error"`, `credentials: "omit"`, `cache: "no-store"`, `AbortSignal.timeout`).
- `src/server/auth/index.ts` : `POOL_VERROUS` l. 97, `DUREE_SOUS_VERROU_MS` l. 99, transaction de `requestCode` l. 220-235, pool `verrous` l. 359, choix du `mailer` l. 360.
- `src/server/mail/port.ts` l. 16-17 (seul `error.name` peut être journalisé) ; `src/server/config/email.ts` l. 8.
- `src/server/log.ts` : événements `email.*` l. 61-64 ; `VARIABLES_ADMISES` l. 257, `EMAIL_TRANSPORT` et `SMTP_URL` l. 270-271 ; `RAISONS_PAR_EVENEMENT` l. 498-504.
- `eslint.config.mjs` : `fetch` interdit par `no-restricted-globals` dans `src/domain` seulement (l. 219) ; bloc `no-console` de B3a l. 799-819, `src/server/mail/port.ts` et `disabled.ts` l. 812-813.
- `eslint-rules/server-env-imports.mjs` : `IMPORTATEURS_ADMIS` l. 34-70 (`egress` l. 37, `index` l. 46-56, `payment` l. 58).
- Régime de confinement : `tests/unit/confinement/donnees/refus.json` (`hotes` l. 3 : `openrouter.ai`, `googleapis.com`, `ai-gateway.vercel.sh` ; `fragmentsSecrets` l. 30) ; `analyse.ts` (`secretsDe` l. 476-491, insensible à la casse, suffixes `_KEY`, `_TOKEN`, `_SECRET`, `PASSWORD` ; `lectureSecreteAdmise` l. 505-506 ; clés d'objet non contrôlées l. 825 ; `vi.stubEnv` d'un nom secret refusé sans ligne possible l. 1277 ; capacité `hote:<hôte trouvé>` l. 818-819) ; `donnees/lectures-env-secretes.json` (ligne de `ai.ts` l. 27, de `garde-cles.ts` l. 41) ; `listes/capacites.ts` (ligne de `transport-http.ts` l. 474-482) ; `listes/process.ts` (`ENV_ENTIER`, lignes d'`egress.ts` l. 313 et d'`ai.ts` l. 314) ; `listes/specificateurs.ts` (ligne `nodemailer` l. 117) ; `depot.test.ts` l. 316-327 (modèle `payment.ts`, `cleWebhookSimule`).
- `docs/deploiement/variables-environnement.md` l. 93 (règle de calcul de l'environnement) et l. 97 (« L'image Docker pose `VADROUILLE_ENV=production` »).
- `db/migrations/0001_securite.sql` l. 195-196 et l. 286 (rôle `vadrouille_limiter`, droits et politique RLS d'`action_rate_limits`) ; `src/server/rate-limit.ts` l. 14-17 (pool de `vadrouille_app` et `SET LOCAL ROLE vadrouille_limiter`).

**Documentation publique de Resend**, lue le **2026-10-28** (WebFetch, `resend.com/docs` seulement ; aucun autre appel réseau, aucun compte) : `https://resend.com/docs/api-reference/errors`, `https://resend.com/docs/api-reference/introduction`, `https://resend.com/docs/api-reference/rate-limit`, `https://resend.com/docs/api-reference/emails/send-email`, `https://resend.com/docs/api-reference/api-keys/create-api-key`, `https://resend.com/docs/dashboard/api-keys/introduction`, `https://resend.com/docs/send-with-smtp`, `https://resend.com/docs/dashboard/domains/regions`, `https://resend.com/docs/dashboard/domains/tracking`, `https://resend.com/docs/dashboard/logs/introduction`, `https://resend.com/docs/security`, `https://resend.com/docs/knowledge-base/how-do-i-ensure-sensitive-data-isnt-stored-on-resend`. Ce que ces pages ne disent pas est écrit comme tel ; le contrat de traitement (`resend.com/legal/dpa`) et les tarifs n'ont pas été lus (hors du périmètre de lecture autorisé).

**Argent, comptes, données hors UE** : rien n'est décidé ici. Le fait nouveau qui touche Q644 (§ 5 : les données du compte Resend sont stockées aux États-Unis **quelle que soit la région d'envoi**) est remonté à Samuel (§ 13). **Google** : aucune donnée Google, aucun prompt, aucune carte. **RLS** : la table du compteur (T1) suit le régime de `action_rate_limits` (§ 11). **Données personnelles** : l'adresse saisie et le code partent chez Resend (§ 5, § 6) ; rien n'est stocké chez nous hors du compteur, qui ne porte aucune adresse.

## 0. Synthèse

| Question | Verdict |
|---|---|
| M2-S-1 Transports | **A (API HTTPS) admise à douze conditions ; B (SMTP) admise à dix conditions.** La Sécurité **recommande A** (§ 1.3) ; le choix est au Tech Lead (T3). |
| M2-S-2 Clé | Nom définitif **`RESEND_API_KEY`**. Forme contrôlée sans rendre la valeur : `re_` puis 16 à 125 caractères de `[A-Za-z0-9_-]`, sans `trim()`. Lue dans `src/server/env/**` seulement ; jamais un champ de `ServerEnv`. Présence refusée partout hors du cas admis. `NEXT_PUBLIC_` + `RESEND` (casse ignorée sur `RESEND`) refusé sur le nom seul. Ajoutée à la garde des tests (`garde-cles.ts`). |
| M2-S-3 Cas admis | **Confirmé**, avec **une condition de plus** (`VERCEL_TARGET_ENV` absente ou `preview`) et une précision (`VERCEL_ENV` doit valoir `preview`, pas seulement donner `staging`). Refus partout ailleurs. |
| M2-S-4 Barrière de sortie | **S'applique**, à chaque envoi, dans le module de la clé, **avant** la lecture de la clé et **avant** la réservation du plafond. |
| M2-S-5 Région, sous-traitant | Resend stocke les données du compte aux **États-Unis quelle que soit la région** ; la région d'envoi se choisit par domaine. Sans domaine : hors UE, sans alternative. Remonte à Samuel (Q644). |
| M2-S-6 Conservation | Les journaux d'API de Resend gardent **le corps JSON complet** de la requête (donc adresse et code) ; la durée n'est pas publiée dans la documentation. À dire à Samuel avec S1. |
| M2-S-7 Erreurs de Resend | Noms constatés (§ 7) ; correspondance par **statut et nom ensemble**. Quota quotidien en **jour civil UTC** : B3d-PO-1 confirmé. |
| M2-S-8 Épuisement du plafond | **Risque accepté pour l'essai de Samuel seul**, à trois conditions (§ 8), dont la protection des déploiements de Vercel et la portée de la clé limitée à la branche `mvp-essai`. |
| Lignes de confinement | Verdict ligne par ligne (§ 9) : seize entrées, dont trois ajoutées par la Sécurité (lignes 2, 5c et le dernier fichier de la ligne 8) et un test ajouté (ligne 7b) ; les entrées A et B ne valent que pour l'option retenue. |
| 0098 | Amendée § 1, § 3.3, § 4 points 2, 3, 5, § 5 (titre et point 1), § 6 et § 7 (§ 10) ; § 2 et § 3.1-3.2 inchangés avec l'option A (amendés seulement si B est retenue, § 10.6). |

## 1. M2-S-1 — Conditions des deux transports

Conditions communes aux deux options, qui s'ajoutent à celles de la spécification (« Ce qui ne dépend pas du choix ») :
- **C1** L'adresse de Resend (URL ou hôte) est une **constante littérale** de `src/server/mail/<resend>.ts`, jamais lue d'une variable d'environnement, jamais calculée à partir d'une entrée, jamais exportée vers un autre module que son test.
- **C2** Ordre dans `sendLoginCode` (amende l'ordre du point 1 de la spécification sur un point : la lecture de la clé est placée) : `parseEmailAddress` refait → construction des quatre champs → `checkEnvelope` → **`cleResend` (barrière de sortie, cas admis, forme de la clé : § 2 et § 4)** → réservation du plafond → appel unique du transport → traduction par le tableau du § 7. Un refus de `cleResend` ne réserve rien et n'appelle rien (le plafond ne compte que ce qui a pu partir, B3d-PO-2).
- **C3** La clé n'est jamais gardée dans une variable de module, un cache, une fermeture qui survit à l'appel, ni dans l'objet du transport au-delà de l'envoi ; elle est relue à chaque envoi.
- **C4** Aucune nouvelle tentative automatique ; aucune file ; aucun repli vers l'autre transport ni vers Mailpit (B3d-PO-4).
- **C5** Toute erreur levée par le module porte un `name` fixe et aucun texte reçu : ni adresse, ni code, ni clé, ni corps, ni en-tête, ni message de Resend ; jamais de `cause` (comme `SmtpEnvoiError` et `ServerEnvError`). `src/server/mail/port.ts` l. 16-17 n'autorise que `error.name` au journal.

### 1.1 Option A — API HTTPS : admise, à douze conditions

1. **URL** : `https://api.resend.com/emails`, constante (C1). Le schéma `https:` est porté par la constante ; Resend refuse HTTP (« The API does not support HTTP », page `introduction`).
2. **Appel** : `fetch(URL, { method: "POST", headers, body, redirect: "error", credentials: "omit", cache: "no-store", signal })`, et **aucune autre option** : ni `dispatcher`, ni `agent`, ni `keepalive`, ni `referrer`, ni `mode`. `redirect: "error"` : une redirection est un échec (`server_error`), jamais suivie, pour que la clé ne parte jamais vers une autre origine.
3. **En-têtes** : exactement `Authorization: Bearer <clé>` et `Content-Type: application/json`. Si Resend exige un `User-Agent` explicite (à constater par M2a sur le double et la documentation, sans appel réel), une constante sans numéro de version ni nom de machine. Pas d'`Idempotency-Key` (inutile sans nouvelle tentative, C4).
4. **Corps** : `JSON.stringify({ from, to: [to], subject, text })` construit **depuis la copie contrôlée** par `checkEnvelope`, tableau `to` d'un seul élément ; aucun autre champ (`html`, `cc`, `bcc`, `reply_to`, `headers`, `attachments`, `tags`, `scheduled_at`). L'API admet jusqu'à 50 destinataires (page `send-email`) : la limite d'un seul est la nôtre, vérifiée par R2 et R3.
5. **TLS** : validation de certificat par défaut de Node, jamais affaiblie dans le code (aucune option TLS, aucun `dispatcher`, aucune autorité ajoutée) ; les variables et options qui l'affaibliraient sont refusées par la barrière (§ 4).
6. **Proxy** : aucun ; les variables et l'option de proxy de Node sont refusées par la barrière (§ 4) ; aucun `dispatcher` ne peut en réintroduire un.
7. **Délai** : un seul `AbortSignal.timeout` de **10 s au plus**, qui couvre la connexion, la réponse **et** la lecture du corps d'erreur ; dépassé → `timeout`.
8. **Réponse 200** : succès sur le **statut seul** ; le corps est abandonné (`body?.cancel()`, comme `transport-http.ts` l. 26) sans être lu. **Amende** la ligne « Succès (option A : 200 avec un identifiant) » du point 5 de la spécification : l'identifiant de message n'est ni lu, ni journalisé, ni stocké, ce qui ferme aussi le risque de le voir fuir. Tout autre statut 2xx ou 3xx → `server_error`.
9. **Réponse d'erreur** : corps lu **au plus 4 096 octets** (lecture bornée par le flux, jamais `response.text()` sans borne), analysé par `JSON.parse` dans un `try`, et **seul** le champ `name`, s'il est une chaîne d'une liste fermée (§ 7), est retenu ; `message` n'est jamais lu. Les en-têtes de la réponse (`ratelimit-*`, `retry-after`, `x-resend-daily-quota`, `x-resend-monthly-quota`) ne sont ni lus ni journalisés.
10. **Injection** : `fetch` est un paramètre de la fabrique de `<resend>.ts`, de valeur par défaut le `fetch` global (forme `reference`, `nombre: 1`, § 9) ; la fonction de lecture de la clé est aussi un paramètre (valeur par défaut `cleResend`), pour que les tests n'importent pas le module de la clé.
11. **Création à l'envoi** : rien n'est construit à l'import ; `import "server-only"` en tête ; aucun import depuis `src/features`, `src/components`, `src/app`.
12. **Suivi** : aucun suivi d'ouverture ni de clic. La documentation dit le suivi « disabled by default for all domains » et réglé par domaine (page `tracking`) ; l'API d'envoi n'en porte aucun champ et le corps n'en contient aucun (point 4).

### 1.2 Option B — SMTP de Resend : admise, à dix conditions

1. **Hôte** : `smtp.resend.com`, constante (C1) ; jamais d'option `url`, jamais `service` ni la table `well-known` de `nodemailer` (0098 § 3.1 et § 6 point 2, inchangés).
2. **Port et TLS** : **465, TLS implicite, `secure: true`, seulement**. La documentation donne 25, 465, 587, 2465 et 2587, dont 25, 587 et 2587 en STARTTLS (« First connects via plaintext, then upgrades ») : ils sont **refusés**, pour qu'aucune connexion ne commence en clair et qu'aucun repli en clair ne soit possible ; 2465 (non standard) est refusé aussi. `ignoreTLS` et `opportunisticTLS` ne sont jamais passés.
3. **Certificat** : `tls: { rejectUnauthorized: true, servername: "smtp.resend.com", minVersion: "TLSv1.2" }`, et aucune autre clé de `tls` (ni `ca`, ni `ciphers`, ni `checkServerIdentity`).
4. **Authentification** : `auth: { user: "resend", pass: <clé> }` (page `send-with-smtp`), sans `authMethod` ; la clé ne passe **jamais** dans `SMTP_URL` (0098 § 4 point 7), qui reste refusée avec `resend`.
5. **Options de 0098 § 3.1 et § 3.2 reprises** : objet explicite, `logger: false`, `debug: false`, `disableFileAccess: true`, `disableUrlAccess: true`, `connectionTimeout`, `greetingTimeout`, `socketTimeout` de 10 s au plus ; ni `pool`, ni `proxy`, ni `sendmail`. Le test de création vérifie l'objet exact, **aucune autre clé**.
6. **Enveloppe** : identique à B3b-envoi (points 4.3 à 4.5), enveloppe explicite, un destinataire.
7. **Capacité** : la racine `nodemailer` dans le seul `<resend>.ts` en plus de `smtp.ts` (§ 9, ligne B), aucun autre sous-chemin.
8. **Ports sortants de Vercel** : non constatés par cette décision (lecture hors du périmètre autorisé). Si B est retenue, le Tech Lead constate sur la documentation publique de Vercel que le port 465 sortant est ouvert depuis une fonction, avant le code.
9. **Erreurs** : les codes SMTP ne distinguent pas le quota de Resend d'une panne ; le cas « quota de Resend » du point 5 de la spécification ne peut alors donner `email_cap_reached` que si une réponse le dit sans ambiguïté, ce qui n'est pas documenté. M2a traduit donc tout refus SMTP en `server_error`, `auth` (535) ou `recipient_refused` (550 sur `RCPT`), à constater par le Tech Lead.
10. **Barrière de sortie** : s'applique comme pour A (§ 4) ; elle ne lit que l'environnement et vaut aussi pour une socket.

### 1.3 Recommandation de la Sécurité

**Option A.** Raisons : la surface est un seul appel `fetch` à options fermées, déjà revu sous cette forme (`transport-http.ts`, 0097) ; TLS reste entièrement aux défauts de Node ; aucune deuxième zone pour la racine de `nodemailer` (qui charge aussi le transport `sendmail`, 0098 § 6 point 2) ; la correspondance des erreurs est exacte (§ 7), donc le cas « quota de Resend » est reconnu. La Sécurité ne trouve aucune raison de préférer le SDK `resend` à `fetch` (§ 11, T3).

## 2. M2-S-2 — Clé

1. **Nom définitif : `RESEND_API_KEY`.** Le suffixe `_KEY` en fait un nom secret pour le régime de confinement (`analyse.ts` l. 476-491) ; il n'est écrit qu'en **clé d'objet** (`VARIABLES` de `src/server/env/index.ts`, `VARIABLES_ADMISES` de `src/server/log.ts`, objets d'environnement des tests), jamais en texte, et nommé ailleurs par `V.RESEND_API_KEY`. Les titres de tests disent « clé Resend », pas le nom.
2. **Présence** : lue avec `!== undefined` (une valeur vide ou d'espaces est présente). Présente hors du cas admis avec `EMAIL_TRANSPORT=resend` → `forbidden`, **dans les quatre environnements**, `local` et `ci` compris. Absente dans le cas admis avec `EMAIL_TRANSPORT=resend` → `missing`.
3. **Forme**, contrôlée **sans `trim()`** et sans jamais copier, rendre, journaliser ni joindre la valeur : `^re_[A-Za-z0-9_-]{16,125}$` (19 à 128 caractères, ASCII imprimable sans espace). Constat : la documentation montre le préfixe `re_` (page `introduction`, `Authorization: Bearer re_xxxxxxxxx`) et un exemple de jeton de 36 caractères faits de lettres, chiffres et `_` (page `create-api-key`) ; elle ne publie pas de format. Une vraie clé qui sortirait de cette forme échoue **fermé** (`invalid_value` au démarrage) et se voit à l'action S1 : la forme se corrige alors par amendement, sans valeur réelle dans le dépôt. Pas de `decodeSecret` (la clé n'est pas un secret à nous, son entropie est celle de Resend) et pas de contrôle d'unicité.
4. **Lecture** : dans `src/server/env/**` seulement, par propriété littérale, à deux endroits (§ 9, lignes 4a et 4b) : `parseServerEnv` (présence et forme) et `cleResend`, dans **son propre module** (proposition `src/server/env/cle-resend.ts`), qui refait barrière, cas admis et forme à chaque envoi et rend la clé au seul `<resend>.ts`. **Jamais** un champ de `ServerEnv`, jamais dans `index.ts` hors du contrôle.
5. **`NEXT_PUBLIC_*RESEND*`** : toute variable dont le nom commence par `NEXT_PUBLIC_` (préfixe exact : c'est celui que Next.js expose) et contient `RESEND` **sans tenir compte de la casse** (`nom.slice(12).toUpperCase().includes("RESEND")`, forme : Tech Lead) → `forbidden` au démarrage, partout, sous un **libellé fixe** (proposition `NEXT_PUBLIC_*RESEND*`, clé d'objet de `VARIABLES` et de `VARIABLES_ADMISES`), jamais le nom exact ; dans le parcours existant de la l. 438, sur le **nom seul**, sans lire la valeur et sans second parcours. Portée réelle de ce contrôle : Next.js n'insère dans le code du navigateur que les `process.env.NEXT_PUBLIC_…` que le code référence ; la protection première est donc qu'aucun code ne référence un tel nom (le régime refuse ce texte, suffixe `_KEY`, hors des lignes) ; la garde du démarrage est une défense en profondeur qui arrête un déploiement mal configuré.
6. **Garde des tests** : `RESEND_API_KEY` posée (non vide) fait échouer la mise en place de Vitest et de Playwright, comme les quatre clés de service (`src/server/env/garde-cles.ts` l. 14-21 ; libellé fermé proposé `envoi`). Aucun test ne pose la clé dans `process.env` (`vi.stubEnv` est refusé sans ligne possible, `analyse.ts` l. 1277) : les tests passent des objets d'environnement. Les valeurs de test sont des sentinelles manifestement fausses (par exemple `re_SENTINELLE_exemple_0000000000`), jamais une forme copiée d'une vraie clé.
7. **Permission** (recommandation transmise à Samuel avec S1, § 13) : clé « Sending access » (`sending_access`, « Can only send emails », page `create-api-key`), jamais « Full access » ; restreinte au domaine dès qu'il existe (étape 10). Variable posée dans Vercel en **Preview, pour la seule branche `mvp-essai`**, jamais en Production ni pour toutes les préversions, marquée « sensible ».

## 3. M2-S-3 — Cas admis

**Confirmé**, avec une condition de plus et une précision. Le prédicat (proposition `resendAdmis(env)`, nom : Tech Lead, T2) est **vrai si et seulement si toutes** ces conditions tiennent sur l'objet reçu :
1. `VERCEL` vaut exactement `1` après `trim()` et `VERCEL_ENV` est présente (`surVercel`, l. 338) ;
2. `VERCEL_ENV` vaut `preview` après `trim().toLowerCase()` (fonction `declaree` de `resolve.ts`). **Précision** : il ne suffit pas que l'environnement résolu soit `staging` : `VERCEL_ENV=staging` donne aussi `staging` (`resolve.ts` l. 30-31) et doit être refusé ;
3. `VADROUILLE_ENV` absente, vide ou faite d'espaces (`declaree` rend `undefined`) ; toute valeur posée refuse, `staging` compris ;
4. **condition ajoutée** : `VERCEL_TARGET_ENV` absente, ou valant **exactement** `preview` (comparaison sans `trim()` ni changement de casse, comme la barrière, `egress.ts` l. 125 ; une valeur vide ou d'espaces, ou ` Preview `, est **refusée** au démarrage, pour que démarrage et envoi jugent de la même façon). Raison : un environnement personnalisé de Vercel garde `VERCEL_ENV=preview` et porte son nom dans `VERCEL_TARGET_ENV` ; la barrière de sortie le refuse déjà à l'envoi (`egress.ts` l. 125) ; le refuser aussi au démarrage évite un serveur qui démarre sans jamais pouvoir envoyer. Conséquence pour M1h : `mvp-essai` est une branche de l'environnement Preview standard, pas un environnement personnalisé. `VERCEL_TARGET_ENV` entre dans `VARIABLES` (lue par propriété littérale, nom non secret) ;
5. en conséquence, l'environnement résolu vaut `staging` (assertion de cohérence dans le prédicat).

`AUTH_ADAPTER=better-auth` reste exigé (l. 403 inchangée par M2a : refusé en `staging` jusqu'à M1h). La condition de branche est posée par M1h, pas par M2a. Le prédicat est une fonction pure de `src/server/env/`, appelée par `parseServerEnv` **et** par `cleResend` (C2).

**Refusé** : `local`, `ci`, `staging` hors Vercel, `production` (dont `VERCEL_ENV=production`), `VERCEL_ENV=development` (`vercel dev`), `VERCEL_ENV=preview` sans `VERCEL=1`, toute déclaration de `VADROUILLE_ENV`. `VERCEL_ENV=development` est refusé par la condition 2 du cas admis, non par la barrière (qui l'admet, `ENVIRONNEMENTS_ADMIS`, `egress.ts` l. 60). La barrière compare `VERCEL_ENV` **sans** `trim()` ni changement de casse (l. 124) : un ` Preview ` admis au démarrage par la condition 2 (normalisée, comme R1 de la spécification) est refusé à l'envoi (`production_refused`) ; c'est un échec fermé, assumé : Vercel pose la valeur exacte `preview`.

**Correction de fait** : la spécification (point 2) écrit « `VADROUILLE_ENV=staging` hors Vercel, comme dans l'image Docker » ; l'image Docker pose `VADROUILLE_ENV=production` (`docs/deploiement/variables-environnement.md` l. 97, `Dockerfile` l. 27). La règle n'en change pas : les deux cas sont refusés.

## 4. M2-S-4 — Barrière de sortie

**Elle s'applique.** Raisons : `fetch` de Node suit les variables de proxy quand `NODE_USE_ENV_PROXY` ou `--use-env-proxy` sont posés, et `NODE_TLS_REJECT_UNAUTHORIZED`, `NODE_EXTRA_CA_CERTS`, `SSLKEYLOGFILE` affaibliraient TLS ou exposeraient les clés de session : la clé et l'adresse partiraient alors vers un tiers. La barrière refuse aussi la production en lisant le **vrai** `process.env` (l. 134-140, l. 289), indépendamment de l'objet reçu.

Conditions :
1. `cleResend(env = process.env, execArgv?)` appelle `verifierSortie(env, execArgv)` **en premier**, comme `lireCleOpenRouter` (`ai.ts` l. 17-23), puis `resendAdmis(env)`, puis lit et contrôle la clé. Le module est dans `src/server/env/`, qui peut importer `egress` (`server-env-imports.mjs` l. 85) : **aucun importateur nouveau d'`egress`**.
2. Refus (barrière, cas admis ou forme) : `cleResend` rend un résultat fermé (`{ ok: false, code }`), jamais une exception portant une valeur ; `<resend>.ts` ne réserve rien, n'appelle rien et rend une erreur d'envoi sans valeur (`provider_error`). Journal : un événement distinct d'`email.provider_refused` (Resend n'a pas été contacté), proposition `email.transport_refused`, avec le seul champ `reason` dans la liste fermée `"egress_refused" | "not_admitted" | "key_invalid"` (noms : Tech Lead), ajoutée à `RAISONS_PAR_EVENEMENT` ; aucun diagnostic de la barrière n'est demandé (le rappel `diagnostic` n'est pas passé).
3. L'exception d'`OPENSSL_CONF` (0062, 0065) s'applique telle quelle : elle n'est admise qu'en préversion de Vercel, ce qui est le cas admis.
4. La barrière s'applique de la même façon à l'option B (§ 1.2 point 10).

## 5. M2-S-5 — Région de traitement et sous-traitant (Q25, Q644)

Constats (documentation du 2026-10-28) :
- Régions d'**envoi** : `us-east-1` (Virginie du Nord), `eu-west-1` (Irlande), `sa-east-1` (São Paulo), `ap-northeast-1` (Tokyo) ; la région se choisit **par domaine**, à l'ajout du domaine (page `regions`). La documentation ne dit pas quelle région sert `onboarding@resend.dev` ni le compte sans domaine.
- **Stockage** : « Account data, including email metadata, logs, and API records, is stored in the United States regardless of the sending region you select » (page `regions`). La région ne règle que l'acheminement et l'envoi.
- Resend se dit conforme au RGPD et publie un contrat de traitement à `resend.com/legal/dpa` (page `security`), **non lu** ici.

Ce qui en découle :
1. Pendant l'essai, toute adresse saisie sur l'écran 4 de la préversion, avec le code, part chez un sous-traitant américain et **est stockée aux États-Unis** ; c'est vrai même si Resend refuse l'envoi (403, testing), puisque les journaux d'API gardent la requête (§ 6).
2. **Choisir la région UE à l'étape 10 ne ramène pas ce stockage dans l'UE** : la recommandation du Product Owner sur Q644 (« choisir la région UE de Resend avec le domaine ») réduit l'acheminement hors UE, pas la conservation. Fait à porter à Samuel (§ 13) : c'est un transfert hors UE durable tant que Resend est le fournisseur, pas une situation d'essai.
3. Pour l'essai d'une seule personne (Samuel, adresse du compte Resend) avec la protection des déploiements (§ 8), l'exposition de tiers est faible ; elle n'est pas nulle (une personne autorisée sur le projet Vercel qui saisit une autre adresse la transmet). La Sécurité ne peut ni accepter ni refuser ce transfert : **Samuel** (Q644, `docs/CONTEXT.md` : « données personnelles hors UE »).
4. Rien dans le code de M2a ne dépend de la réponse : si Samuel refuse, S1 n'a pas lieu et `EMAIL_TRANSPORT=resend` n'est posée nulle part (B3d-PO-6).

## 6. M2-S-6 — Conservation chez Resend

Constats : la page `logs` dit que les journaux d'API gardent « The full JSON payload sent to the API » et « The complete API response » ; donc **l'adresse et le code** du corps. Aucune durée de conservation des journaux ni des e-mails n'est publiée dans la documentation lue. Les sauvegardes sont gardées 7 jours (page `security`). La suppression du stockage du contenu n'existe que sur demande, pour les offres Pro ou Scale d'au moins un mois, avec un domaine actif, plus de 3 000 e-mails envoyés, et un supplément de 50 $ par mois (page `how-do-i-ensure-sensitive-data-isnt-stored-on-resend`) : hors de portée de l'essai.

Verdict : acceptable **pour le code** (il expire en 10 minutes et ne sert qu'une fois : sa conservation n'ouvre aucune session après ce délai) ; l'**adresse** est une donnée personnelle conservée aux États-Unis pour une durée inconnue. **Oui, il faut le dire à Samuel avec l'action S1** (§ 13), avec la demande de lire la durée sur son tableau de bord ou ses conditions avant de poser la clé. Le studio ne lit jamais ces journaux (aucun accès au compte).

## 7. M2-S-7 — Noms des erreurs de Resend et tableau de correspondance

Constats (page `errors`, 2026-10-28). Plusieurs noms servent sous plusieurs statuts (`validation_error` en 400, 401 et 403 ; `restricted_api_key` en 401 et 403) : la correspondance se fait sur **le statut et le nom ensemble**, et le `message` n'est jamais lu (§ 1.1 point 9). Quota quotidien : « resets at midnight UTC — not a rolling 24-hour window » (page `rate-limit`) : **B3d-PO-1 confirmé**. Les e-mails reçus comptent aussi dans le quota de Resend (aucun e-mail reçu sans domaine). Limite de débit : 10 requêtes par seconde par équipe (pages `introduction` et `rate-limit`).

Tableau du point 5 de la spécification, complété (les lignes de comportement de la spécification ne changent pas ; seule la ligne de succès est amendée par § 1.1 point 8) :

| Statut | `name` de Resend (liste fermée) | `reason` | Résultat |
|---|---|---|---|
| 200 | (corps non lu) | — | succès, `email.sent` |
| 429 | `daily_quota_exceeded`, `monthly_quota_exceeded` | `quota` | `email_cap_reached` |
| 429 | `rate_limit_exceeded`, ou tout autre nom, ou corps illisible | `rate_limited` | `provider_error` |
| 401 | `missing_api_key`, `restricted_api_key`, `validation_error`, ou autre | `auth` | `provider_error` |
| 403 | `restricted_api_key`, `suspended_api_key`, `invalid_permission` | `auth` | `provider_error` |
| 403 | `validation_error` (adresse de test, domaine non vérifié : messages non distingués) | `recipient_refused` | `provider_error` |
| 403 | autre nom ou corps illisible | `auth` | `provider_error` |
| 400, 404, 405, 409, 422 | tout nom (`validation_error`, `invalid_idempotency_key`, `not_found`, `method_not_allowed`, `concurrent_idempotent_requests`, `invalid_idempotent_request`, `resource_locked`, `invalid_attachment`, `invalid_parameter`, `missing_required_field`, `missing_required_parameter`) | `invalid_request` | `provider_error` |
| 500, 503, tout autre statut, 2xx autre que 200, 3xx (refus de redirection) | `application_error`, `service_unavailable`, autre | `server_error` | `provider_error` |
| délai dépassé | — | `timeout` | `provider_error` |
| échec réseau, TLS | — | `network` | `provider_error` |

Notes : le 403 `validation_error` couvre à la fois « testing emails to your own address » et « domain is not verified » ; sans lire le message, les deux donnent `recipient_refused`, ce qui suffit (même résultat pour l'utilisateur, B3d-PO-6). Le 400 `validation_error` « API key is invalid » (en-tête mal formé) donne `invalid_request` : la forme de la clé est contrôlée avant (§ 2.3), le cas reste résiduel. `email_above_quota` (403) concerne la lecture d'e-mails reçus et n'est pas attendu ; il tombe dans « autre nom » → `auth`, sans conséquence. Le tableau vit dans `src/server/mail/` (nom : Tech Lead) ; la liste des noms y est une constante littérale. Les noms reposent sur la documentation lue le 2026-10-28, non revérifiée depuis ; le repli (« autre nom » → `auth`, `rate_limited` ou `server_error`, jamais `quota`) garde le tableau sûr si Resend renomme une erreur : au pire, un quota de Resend s'affiche comme une panne (« Quand revoir »).

## 8. M2-S-8 — Épuisement du plafond par des demandes anonymes

**Risque accepté pour l'essai de Samuel seul**, sur les trois raisons du Product Owner, **aux conditions suivantes** :
1. **Protection des déploiements de Vercel active sur la préversion `mvp-essai`** au moment de l'action S1, pour que seules les personnes que Samuel autorise atteignent l'écran 4 ; et **clé portée par la seule branche `mvp-essai`** (§ 2.7). C'est un réglage de Samuel (hors dépôt) : la Sécurité en fait la **condition de son acceptation**. Si Samuel choisit de ne pas protéger la préversion, cette acceptation tombe et le risque revient à la Sécurité avant S1 (plafond par adresse ou autre mesure, spécification nouvelle). La décision de S1 reste à Samuel.
2. Le limiteur par adresse IP et par adresse e-mail (0050, 0051) reste **devant** la réservation (aucune réservation pour une demande qu'il refuse, B3d-PO-2).
3. **À revoir avant tout autre testeur** (étape 10, domaine, Q640) : un plafond global anonyme ne tient pas avec plusieurs personnes.

Le comptage des refus 401 et 403 (B3d-PO-2) est accepté : il ne peut qu'arrêter les envois plus tôt. L'état « plafond atteint » ne révèle rien d'une adresse.

## 9. Lignes de confinement : formes exactes et verdict

`<resend>.ts` désigne le fichier de l'implémentation (nom : Tech Lead) ; `cle-resend.ts` le module de `cleResend` (nom proposé). Les formes ci-dessous sont celles que M2a recopie, noms de fichiers remplacés.

| # | Fichier du régime | Forme exacte | Verdict |
|---|---|---|---|
| 1 | `donnees/refus.json`, `hotes` | ajouter `"resend.com"` (couvre `api.resend.com` et `smtp.resend.com`) ; **pas** de fragment `resend` dans `fragments` (la valeur `resend` d'`EMAIL_TRANSPORT` est un texte légitime d'`index.ts`) ; `resend.dev` n'est pas ajouté (adresse d'expédition, jamais un hôte contacté) | **Approuvé** |
| 2 | `donnees/refus.json` | **ajouté par la Sécurité** : `"RESEND_API_KEY"` dans `nomsSecrets` et `"RESEND_API"` dans `fragmentsSecrets` (même famille que `OPENROUTER_API_KEY` et `OPENROUTER_API`, l. 30) | **Exigé** |
| 3A | `donnees/lignes-textes.json` (option A) | `{ "fichier": "src/server/mail/<resend>.ts", "portee": "application", "usage": "adresse figée de l'API d'envoi de Resend (B3d, M2a), seule origine du transport ; aucune variable d'environnement", "capacites": [{ "capacite": "hote:api.resend.com", "formes": ["https://api.resend.com/emails"], "nombre": 1 }], "ecart": "module d'envoi réel de B3d (décision 0138 § 1.1) : verdict Sécurité : approuvé par 0138, à confirmer au head de la PR de M2a" }` ; le test **importe** la constante et n'écrit pas l'hôte (aucune ligne de test) ; s'il l'écrit, une ligne `portee: "test"`, même capacité, `nombre: 1`, motif et verdict | **Approuvé** |
| 3B | `donnees/lignes-textes.json` (option B) | même forme, `"capacite": "hote:smtp.resend.com"`, `"formes": ["smtp.resend.com"]`, `"nombre": 1` | **Approuvé** si B |
| — | `donnees/lignes-textes.json`, formes `secret:` | **aucune** : `RESEND_API_KEY` et le libellé `NEXT_PUBLIC_*RESEND*` ne sont écrits qu'en clés d'objet (`analyse.ts` l. 825) ; `"NEXT_PUBLIC_"` et `"RESEND"` ne sont pas des noms secrets (`secretsDe`) ; tout texte qui contiendrait `RESEND_API_KEY` ou `RESEND_API` demande une ligne `secret:` avec verdict à la revue | **Approuvé** (aucune ligne) |
| 4A | `listes/capacites.ts` (option A) | `{ fichier: "src/server/mail/<resend>.ts", portee: "application", usage: "transport réel de l'envoi du code de connexion (B3d, M2a) : `POST` vers la constante d'API de Resend, `redirect: \"error\"`, `credentials: \"omit\"`, `cache: \"no-store\"`, délai de 10 s au plus, `fetch` global seulement comme valeur par défaut du paramètre injecté ; corps construit depuis la copie contrôlée par `checkEnvelope`. Justification côté serveur : module `server-only`, importé hors des tests par `src/server/auth/index.ts` seulement (test du dépôt, ligne 7b)", capacites: [{ capacite: "identifiant:fetch", formes: ["reference"], nombre: 1 }], ecart: "module de capacité réseau de B3d (décision 0138 § 1.1), cas admis de 0138 § 3 seulement : verdict Sécurité : approuvé par 0138, à confirmer au head de la PR de M2a" }` | **Approuvé** |
| 4B | `listes/specificateurs.ts` l. 117 (option B) | `{ specificateur: "nodemailer", zones: ["src/server/mail/smtp.ts", "src/server/mail/<resend>.ts"], sousChemins: "exacts" }` ; aucun autre sous-chemin ; SDK `resend` (si T3 le retenait) : lignes de `paquets.ts` et `specificateurs.ts` soumises à une nouvelle revue de la Sécurité | **Approuvé** si B |
| 5a | `donnees/lectures-env-secretes.json` | `{ "fichier": "src/server/env/index.ts", "noms": ["RESEND_API_KEY"], "motif": "B3d (M2a), décision 0138 § 2 : présence et forme de la clé de Resend dans parseServerEnv, valeur jamais rendue, copiée, journalisée ni jointe à une erreur ; jamais un champ de ServerEnv ; verdict Sécurité : approuvé par 0138, à confirmer au head de la PR de M2a" }` | **Approuvé** |
| 5b | `donnees/lectures-env-secretes.json` | `{ "fichier": "src/server/env/cle-resend.ts", "noms": ["RESEND_API_KEY"], "motif": "B3d (M2a), décision 0138 § 2 et § 4 : lecture à l'envoi par cleResend, après la barrière de sortie et le cas admis, forme refaite, clé rendue au seul src/server/mail/<resend>.ts ; verdict Sécurité : approuvé par 0138, à confirmer au head de la PR de M2a" }` | **Approuvé** |
| 5c | `donnees/lectures-env-secretes.json`, ligne existante de `src/server/env/garde-cles.ts` (l. 41) | **ajoutée par la Sécurité** : `"RESEND_API_KEY"` ajouté à `noms`, motif complété (« B3d (M2a), 0138 § 2.6 : présence seulement ») | **Exigé** |
| 6 | `listes/process.ts`, `ENV_ENTIER` | `{ fichier: "src/server/env/cle-resend.ts", formes: ["defaut:cleResend", "argument:verifierSortie", "argument:resendAdmis"] }` (la dernière forme seulement si `cleResend` passe l'objet entier au prédicat ; nom du prédicat : Tech Lead), avec le commentaire « B3d (M2a), décision 0138 § 4 : environnement lu à l'appel, passé entier à la barrière de sortie et au prédicat du cas admis. Verdict Sécurité : approuvé par 0138 » | **Approuvé** |
| 7 | `eslint-rules/server-env-imports.mjs`, `IMPORTATEURS_ADMIS` | `["cle-resend", ["src/server/mail/<resend>.ts"]]`, avec commentaire de motif ; aucun test hors de `src/server/env/` ne l'importe (le test de `<resend>.ts` injecte la fonction, § 1.1 point 10) ; test de la règle dans `tests/unit/lint/server-env-imports-lint.test.ts` ; deux tests de `depot.test.ts` sur le modèle des l. 316-327 : seul importateur hors tests `<resend>.ts`, seul appelant de `cleResend(` hors tests `<resend>.ts` (et sa définition) | **Approuvé** |
| 7b | `tests/unit/confinement/depot.test.ts` | **test ajouté par la Sécurité**, sur le modèle des l. 316-319 : hors des tests, `src/server/mail/<resend>.ts` n'a qu'un importateur, `src/server/auth/index.ts` (composition de la connexion) ; aucun test hors de `src/server/mail/` ne l'importe sauf les tests de la connexion qui en ont besoin, listés nommément | **Exigé** |
| 8 | `eslint.config.mjs`, bloc `no-console` l. 799-819 | `src/server/mail/<resend>.ts`, le module du plafond, le module du tableau du § 7 et `src/server/env/cle-resend.ts` ajoutés à `files` | **Approuvé** (le dernier ajouté par la Sécurité) |
| 9 | `parseServerEnv` l. 438, contrôle `NEXT_PUBLIC_*RESEND*` | dans le parcours existant, sur le nom seul ; aucun second parcours ni accès calculé ; aucune ligne nouvelle | **Approuvé** |
| 10 | Non-régression (`donnees/cas-hotes.json` ou `depot.test.ts`) | un autre fichier de `src/server/mail/` qui contient `api.resend.com` ou appelle `fetch` est refusé ; la même source à la place de `<resend>.ts` est admise | **Approuvé** |

Toute autre ligne que `pnpm test` relèverait est ajoutée avec son motif, signalée dans la description de la PR de M2a et jugée à sa revue (0098 § 6 point 3, inchangé). `src/server/env/index.ts` garde ses six importateurs (l. 46-56).

## 10. Amendement de 0098

Portée : 0098 décrivait **un seul** transport, SMTP vers Mailpit. Les énoncés de 0098 qui parlaient de « tout envoi » se lisent désormais comme portant sur **le transport SMTP vers Mailpit** ; le transport Resend suit la présente décision. Sont **inchangés** : § 2 (liste fermée de `SMTP_URL`), § 3.1 et § 3.2 (options de `smtp.ts`), § 4 points 1, 4, 6 et 7, § 5 points 2 à 7 ; avec l'option A, rien de § 2 et § 3 n'est touché. Les textes avant et après suivent (§ 10.1 à § 10.7).

### 10.1 § 1 (Synthèse), lignes « Mailpit, jamais d'envoi réel » et « Fournisseur réel »

**Avant :**
> | Mailpit, jamais d'envoi réel | **Conditions de configuration** du service (relais interdit, boucle locale, digest) et verdict sur la CI (section 5). |
> | Fournisseur réel | **Hors de cette décision** : tout hôte hors de la liste demande une décision nouvelle, un compte (Samuel, Q25) et le plafond Q354 (section 7). |

**Après :**
> | Mailpit : le transport SMTP n'envoie jamais rien hors de la machine | **Conditions de configuration** du service (relais interdit, boucle locale, digest) et verdict sur la CI (section 5). Ne vaut que pour `EMAIL_TRANSPORT=smtp`. |
> | Fournisseur réel | **Hors de cette décision** ; pour Resend, les **conditions de sécurité** sont posées par 0138 ; le compte, le sous-traitant, la région, le domaine et le transfert hors UE restent à **Samuel** (Q25, Q640, Q644). |

### 10.2 § 3.3 (TLS et authentification)

**Avant :**
> `secure: false` sans `requireTLS` ni `ignoreTLS` est le réglage d'un SMTP en clair sur la boucle locale ; il n'a de sens que parce que l'hôte est un hôte local. **Aucun hôte distant ne peut lui être raccordé** : un fournisseur réel demandera `requireTLS`, une authentification et une validation de certificat, donc une décision nouvelle (section 7). Cette décision n'en pré-décide rien.

**Après :**
> Inchangé pour le transport SMTP vers Mailpit (`smtp.ts`) : **aucun hôte distant ne peut lui être raccordé**. Le transport Resend est un autre module (`<resend>.ts`) : TLS, authentification et certificat y suivent 0138 § 1.1 (option A) ou § 1.2 (option B).

### 10.3 § 4 point 2

**Avant :**
> **`staging` et `production`** : la présence de l'une ou de l'autre, quelle que soit la valeur, est un refus `forbidden`. L'URL n'est alors ni analysée ni examinée. Il en va de même sur **Vercel** (`surVercel`, la fonction de 0051 point 2.2) **quel que soit `VADROUILLE_ENV`** : […]

**Après :**
> **`staging`, `production` et Vercel** (`surVercel`, quel que soit `VADROUILLE_ENV`) : la présence de `SMTP_URL`, quelle que soit sa valeur, est un refus `forbidden` ; elle n'est ni analysée ni examinée. La présence d'`EMAIL_TRANSPORT` est un refus `forbidden`, **sauf** si le cas admis de 0138 § 3 est vrai **et** que la valeur, après `trim()`, est exactement `resend` ; c'est la seule comparaison faite sur sa valeur dans ces environnements (comparaison à une constante, valeur jamais copiée). Ainsi `EMAIL_TRANSPORT=Resend` ou `smtp` dans le cas admis, et toute valeur hors du cas admis, sont `forbidden`. La raison de 0098 (une déclaration de l'opérateur ne suffit pas) est tenue : le cas admis exige les variables posées par Vercel et l'absence de `VADROUILLE_ENV`.

### 10.4 § 4 points 3 et 5

**§ 4 point 3 — avant :**
> **`EMAIL_TRANSPORT`** : absente → port désactivé de B3 (B3b-envoi-PO-2, inchangé) ; présente et, après `trim()`, **exactement** `smtp` (en minuscules : `SMTP`, `ses`, `resend`, valeur vide : refus `invalid_value`) → implémentation SMTP, **seulement** si `AUTH_ADAPTER=better-auth` (sinon `forbidden`) et `VADROUILLE_ENV` vaut `local` ou `ci`.

**§ 4 point 3 — après :**
> **`EMAIL_TRANSPORT`** : absente → port désactivé (inchangé). Présente, après `trim()` : **`smtp`** → implémentation SMTP vers Mailpit, seulement avec `AUTH_ADAPTER=better-auth` en `local` ou `ci` (inchangé) ; **`resend`** → implémentation Resend, seulement dans le cas admis de 0138 § 3 avec `AUTH_ADAPTER=better-auth`, et `forbidden` en `local` et en `ci` ; toute autre valeur, casse comprise (`SMTP`, `Resend`, `RESEND`, `ses`, vide), est `invalid_value` là où le point 2 ne l'a pas déjà refusée. **`RESEND_API_KEY`** : requise (`missing`) avec `resend` admis ; présente sinon → `forbidden`, partout ; forme de 0138 § 2.3 (`invalid_value`). Toute variable `NEXT_PUBLIC_` dont le nom contient `RESEND` (casse ignorée) → `forbidden`, partout, sous un libellé fixe (0138 § 2.5). `SMTP_URL` présente avec `resend` → `forbidden`.

**§ 4 point 5 — avant :**
> **Résultat** de `parseServerEnv` : `smtp: { host, port } | null`, où `host` est la constante de la liste et `port` un entier. `null` ⇔ `EMAIL_TRANSPORT` absente. Aucun autre champ ; aucun champ ne porte la chaîne brute.

**§ 4 point 5 — après :**
> **Résultat** de `parseServerEnv` : `smtp: { host, port } | null` (`null` avec `EMAIL_TRANSPORT` absente **ou** `resend`), et un champ qui dit le transport retenu sans rien porter d'autre (proposition `emailTransport: "disabled" | "smtp" | "resend"`, nom : Tech Lead). **Aucun champ ne porte la clé de Resend ni la chaîne brute de `SMTP_URL`** ; la clé n'est lue à l'envoi que par `cleResend` (0138 § 2.4).

### 10.5 § 5 (titre et point 1) et § 7

**§ 5, titre et point 1 — avant :**
> ## 5. Mailpit seulement ; jamais d'envoi réel
> 1. **Aucun envoi hors de la machine, par construction** : la liste fermée ne contient que des noms qui désignent la boucle locale ou, en `ci`, un service du réseau du job. Il n'y a aucun chemin de configuration par lequel un hôte réel entre.

**§ 5, titre et point 1 — après :**
> ## 5. Transport SMTP : Mailpit seulement ; jamais d'envoi réel par ce transport
> 1. **Aucun envoi hors de la machine par le transport SMTP, par construction** : la liste fermée ne contient que des noms qui désignent la boucle locale ou, en `ci`, un service du réseau du job ; aucun chemin de configuration ne fait entrer un hôte réel dans `SMTP_URL`. L'envoi réel passe par le seul transport Resend, dans le seul cas admis de 0138 § 3 ; en `local` et en `ci`, aucun transport n'envoie hors de la machine (Resend y est refusé et testé sur un double).

**§ 7, premier point — avant :**
> **Fournisseur d'envoi réel** (domaine, SPF, DKIM, TLS exigé, authentification, sous-traitant qui reçoit des adresses e-mail, région de traitement) : Samuel (Q25), après la spécification de l'adaptateur Resend revue par la Sécurité et les données personnelles (0077 § 5.1). `better-auth` reste refusé en `staging` et `production` (B3-TL-2).

**§ 7, premier point — après :**
> **Fournisseur d'envoi réel** : les **conditions de sécurité** du fournisseur Resend (TLS exigé, authentification, certificat, clé, cas admis, barrière de sortie, confinement) sont posées par 0138. Restent à **Samuel** : le compte et la clé (action S1), le domaine, SPF et DKIM (Q640), le sous-traitant qui reçoit des adresses e-mail, sa région de traitement et le transfert hors UE (Q25, Q644). `better-auth` reste refusé en `staging` et `production` (B3-TL-2) jusqu'à M1h.

### 10.6 § 2 et § 3.1-3.2, seulement si l'option B est retenue

Avec l'option A, ils ne changent pas. Avec l'option B, ils ne sont **pas** amendés par la présente décision : la liste fermée de § 2.3 et les options de § 3.1-3.2 restent celles de `smtp.ts` et de `SMTP_URL` ; le transport SMTP de Resend est un module distinct, dont l'hôte est une constante (0138 § 1.2 point 1) et non une entrée de la liste fermée, et dont les options sont celles de 0138 § 1.2. Toute autre extension (un hôte de plus dans la liste de § 2.3, une option de plus pour `smtp.ts`) demanderait un amendement distinct de 0098.

### 10.7 § 6

**§ 6 — avant (introduction et point 1) :**
> Verdict exigé par P0c (section 5) et par 0051 point 6.7 point 7 sur les lignes que B3b-envoi ajoutera ; accepté **comme plafond**, aux conditions suivantes :
> 1. **`src/server/env/index.ts`** : lecture par propriété littérale de `EMAIL_TRANSPORT` et de `SMTP_URL`, **dans ce fichier seulement**. […]

**§ 6 — après :**
> Verdict exigé par P0c (section 5) et par 0051 point 6.7 point 7 sur les lignes de B3b-envoi **et de B3d (M2a)** ; accepté **comme plafond**, aux conditions suivantes :
> 1. **`src/server/env/index.ts`** : lecture par propriété littérale de `EMAIL_TRANSPORT`, `SMTP_URL`, `RESEND_API_KEY` (présence et forme) et `VERCEL_TARGET_ENV`, dans ce fichier ; `RESEND_API_KEY` est lue aussi par le seul module de `cleResend` (`src/server/env/`, 0138 § 9 lignes 5b et 6). Le reste du point 1 est inchangé.
>
> Le point 2 (`smtp.ts`, seul importateur de la racine `nodemailer`) est inchangé avec l'option A ; avec l'option B, sa zone s'étend au seul module Resend (0138 § 9 ligne 4B), aux options de 0138 § 1.2. Un point 5 s'ajoute :
> 5. **Module Resend** (`src/server/mail/<resend>.ts`, nom : Tech Lead) : seul fichier de `src/server/mail/**` qui contient l'hôte de Resend ou, avec l'option A, la capacité `fetch` (forme `reference`, `nombre: 1`), aux conditions de 0138 § 1 ; lignes exactes de 0138 § 9.

## 11. Décisions du Tech Lead (T1 à T4) — **confirmées par le Tech Lead dans la revue consolidée de #840 du 2026-10-28**

Proposées par la Sécurité, **confirmées par le Tech Lead** dans la revue consolidée de la PR #840 (head `6ba7376`, 2026-10-28) : T2, T3 et T4 sans réserve, T1 sous les deux conditions écrites ci-dessous. Elles sont enregistrées dans cette décision (décideur du § 11 : Tech Lead) ; la PR de M2a y renvoie et n'a pas à les reprendre dans une autre décision. La Sécurité n'y tranche que les conditions de sécurité déjà posées aux § 1 à § 9.

- **T3 — Transport et bibliothèque : option A, `fetch` natif, aucune dépendance nouvelle.** Le SDK `resend` ajouterait une dépendance (liste de 0008, scripts d'installation, revue de son code publié) sans rien apporter que `fetch` ne fasse ; s'il lisait de lui-même une variable d'environnement ou gérait ses propres nouvelles tentatives (à constater dans son code publié, non lu ici), ce serait une lecture de clé hors de `src/server/env/**` ou un appel non compté. Avec l'option A, 0008 n'est pas amendée.
- **T1 — Stockage du compteur : table nouvelle, une ligne par jour UTC.** Le réemploi d'`action_rate_limits` est exclu par la spécification (fenêtres fixes depuis le premier appel, limiteur inchangé) ; la Sécurité est d'accord. Conditions du Tech Lead : (a) **la purge ne fait jamais échouer ni annuler la réservation** (transaction distincte, ouverte après la validation de la réservation, erreur rattrapée sans changer la décision, comme la purge du limiteur, `rate-limit.ts` l. 23-24) ; (b) **une seule tâche par cycle sur `db/migrations`** (plan, § 10). Forme retenue :
  - table `email_daily_counts` (nom : Tech Lead) : `day date PRIMARY KEY` (jour UTC calculé par la base : `(now() AT TIME ZONE 'UTC')::date`), une colonne entière par usage (`connexion`, `notification`), `CHECK (connexion >= 0 AND notification >= 0)` ; aucune adresse, aucun hachage, aucun identifiant d'organisation ;
  - **atomicité sur le total** par la ligne unique du jour : `INSERT … ON CONFLICT (day) DO NOTHING`, puis un seul `UPDATE … SET <usage> = <usage> + 1 WHERE day = <jour UTC> AND connexion + notification < $seuil RETURNING connexion + notification`, `$seuil` valant 100 pour `connexion` et 80 pour `notification` ; le verrou de ligne de l'`UPDATE` et la réévaluation de sa condition par Postgres sur la version verrouillée empêchent tout dépassement sous la concurrence ; zéro ligne rendue = refus, aucune ligne modifiée (pas de réservation partielle) ; R5 et R5b le vérifient ;
  - **rôle dédié** sans connexion (proposition `vadrouille_mail_counter`), pris par `vadrouille_app` par `SET LOCAL ROLE` dans une transaction, comme `vadrouille_limiter` (`rate-limit.ts` l. 14-17). **Création** : dans `db/bootstrap/roles.sql`, jamais par une migration — entrée `['vadrouille_mail_counter', 'false', '-1']` du tableau des rôles (à côté de `vadrouille_limiter`, l. 28) et appartenance **`WITH INHERIT FALSE, SET TRUE, ADMIN FALSE`** à `vadrouille_app`, ajoutée au `GRANT` des l. 74-75 (même type que `vadrouille_limiter`) ; ce script est exécuté une fois par base par un propriétaire (sur la base de la préversion, Neon : Samuel, `specs/B1` l. 31). **Droits**, accordés par la migration de la table : `SELECT`, `INSERT`, `UPDATE (connexion, notification)` (jamais `day`), `DELETE` ; RLS activée avec une politique pour ce seul rôle (modèle `0001_securite.sql` l. 195-196 et l. 286). **Tests et documentation** mis à jour par M2a : `tests/db/roles.test.ts` (attributs du rôle comme l. 22, `APPLICATIVE_ROLES` l. 40, droits par table comme l. 93, appartenances de `vadrouille_app` l. 206, liste des appartenances l. 237) et `db/README.md` l. 196-206 (contrôle des appartenances attendu) ;
  - **pool propre** de `vadrouille_app` (petit : 2 connexions, délai de connexion et de requête de quelques secondes, dans les 20 s de `DUREE_SOUS_VERROU_MS`), distinct du pool `verrous` de `vadrouille_auth` (l. 97, l. 359) ; réservation validée dans sa propre transaction, terminée avant l'appel du transport. Information : ces 2 connexions s'ajoutent, **par instance** de fonction, aux pools existants (`verrous` : 5 ; opérations : 10, l. 96-97) ; M1h en tient compte dans la limite de connexions de la base de la préversion ;
  - **purge** à l'écriture, après la réservation validée et dans une transaction distincte (condition (a)), `DELETE … WHERE day < <jour UTC> - 7` (borne posée par la requête ; R7 vérifie que la ligne du jour reste, et un cas montre qu'une purge en erreur laisse la réservation acceptée) ;
  - **rôle de test** de R7 (qui peut modifier `day`) créé par la préparation des tests de base, jamais par une migration ;
  - migration **additive**, une seule tâche par cycle sur `db/migrations` (plan, § 10 ; placement : CEO).
- **T2 — Noms** : au Tech Lead ; la Sécurité demande seulement que le prédicat du cas admis et `cleResend` soient deux fonctions nommées de `src/server/env/` (§ 3, § 4).
- **T4 — `email_cap_reached`** à la fin d'`API_ERROR_CODES` : aucune objection ; le code ne révèle rien d'une adresse.

## 12. Ce que la revue Sécurité de M2a vérifiera

§ 1 (conditions de l'option retenue, objet exact de l'appel ou du transport, aucune autre clé), § 2 (forme, présence, garde des tests, aucune sentinelle de forme réelle), § 3 (table de cas de R1, conditions 2 et 4 comprises), § 4 (ordre de `cleResend`, aucune réservation sur refus, événement sans valeur), § 7 (tableau, `message` jamais lu, corps borné), § 9 (chaque ligne, rien de plus sans motif), § 10 (ordre des gardes de `parseServerEnv`), et les critères R1, R2, R3, R9, R10, R12, R13. Un écart à ces conditions demande un amendement écrit de cette décision ; une exception silencieuse est un bloquant.

## 13. Décisions attendues de Samuel (non tranchées ici)

- **Q644** (transfert hors UE) : fait nouveau à lui porter : les données du compte Resend (journaux d'API avec adresse et code) sont **stockées aux États-Unis quelle que soit la région d'envoi** ; la région UE de l'étape 10 ne change que l'acheminement (§ 5). Durée de conservation non publiée dans la documentation (§ 6).
- **Q640** (domaine d'envoi) : inchangée ; la clé sera restreinte au domaine quand il existera (§ 2.7).
- **Q641** (plafond commun et seuil de 80) : inchangée ; M2a part sur la recommandation (B3d-PO-3).
- **Action S1** (compte Resend, clé, variable Vercel) : la Sécurité demande que le CEO transmette avec S1 : clé « Sending access » seulement ; variable `RESEND_API_KEY` en Preview pour la seule branche `mvp-essai`, marquée sensible, jamais en Production ; protection des déploiements active sur `mvp-essai` (condition de l'acceptation de M2-S-8, § 8) ; lecture de la durée de conservation des journaux sur le compte avant de poser la clé ; aucune autre variable `RESEND*` ni `NEXT_PUBLIC_*RESEND*` ; **rejeu de `db/bootstrap/roles.sql`** sur la base de la préversion, par un propriétaire, après la fusion de M2a et avant le premier envoi (création du rôle du compteur, § 11 T1), puis migration de la table ; sans lui, la réservation échoue fermée (`provider_error`, aucun envoi).

## 14. Questions nouvelles (à reporter par le CEO dans `QUESTIONS.md`)

1. **Tech Lead, 2026-10-28** — ~~Confirmer le § 11~~ : **répondue** dans la revue consolidée de #840 (T1 à T4 confirmés, T1 sous deux conditions, § 11). Gardée pour la numérotation ; rien à reporter.
2. **Product Owner, 2026-10-28** — Aligner `specs/B3d-envoi-reel-resend.md` sur cette décision : ligne de succès du tableau du point 5 (statut 200, corps non lu, § 1.1 point 8) ; ordre du point 1 (lecture de la clé avant la réservation, C2) ; condition `VERCEL_TARGET_ENV` et précision `VERCEL_ENV=preview` du cas admis dans le point 2 et R1 (§ 3) ; `Resend` dans le cas admis donne `forbidden`, `invalid_value` seulement en `local` et `ci` (§ 10.3) ; fait corrigé sur l'image Docker (§ 3) ; événement des refus avant transport (§ 4.2) ; lignes ajoutées 2, 5c, 7b et 8 (§ 9) ; événement `email.transport_refused` et ses raisons (§ 4.2) et succès sur le statut seul dans le tableau du point 5 et R2, R9 ; mise à jour par M2a de `docs/deploiement/variables-environnement.md` (l. 34 range encore `resend` parmi les valeurs refusées d'`EMAIL_TRANSPORT` : à réécrire selon § 10.4 ; `RESEND_API_KEY`, cas admis, `VERCEL_TARGET_ENV`) et vérification qu'`.env.example` ne pose ni la clé ni `EMAIL_TRANSPORT=resend` (R12). Ne bloque pas M2a : **cette décision prévaut** sur le texte de la spécification en attendant (même principe que 0098).
3. **CEO, 2026-10-28** — Joindre à la demande de l'action S1 les quatre points du § 13 et le fait nouveau de Q644. Ne bloque pas M2a.
4. **Tech Lead, 2026-10-28** — Si l'option B était retenue malgré la recommandation : constater sur la documentation publique de Vercel l'ouverture du port 465 sortant (§ 1.2 point 8) et la traduction des codes SMTP (§ 1.2 point 9). Sans objet avec A.

Questions existantes touchées : **Q25** (Resend) : conditions de sécurité posées, région et sous-traitant constatés (§ 5) ; décision de Samuel en attente pour le sous-traitant, la région et le transfert (Q644) ; **Q354** : inchangée ; **Q640**, **Q641** : inchangées ; **Q644** : fait nouveau (§ 5, § 13) ; questions M2-S-1 à M2-S-8 de la spécification : **répondues** ici.

## Conséquences

- M2a peut commencer après la fusion de cette décision (le § 11 est confirmé par le Tech Lead) ; sa PR renvoie au § 11 pour T1 à T4 ; après M2a seule, `EMAIL_TRANSPORT=resend` ne démarre toujours nulle part (`better-auth` refusé en `staging`, l. 403), ce que M1h lève.
- Avec l'option A, aucune dépendance nouvelle et aucune modification de 0008 ; aucune modification de `.github/workflows/` attendue (sinon porte `owner-approved`, 0035).
- Aucun envoi réel par le studio : tout est testé sur un double ; le premier envoi réel suit l'action S1 de Samuel.
- **Prérequis de base à transmettre à Samuel avec S1** : rejeu de `db/bootstrap/roles.sql` sur la base de la préversion (rôle du compteur, § 11 T1), par un propriétaire, puis la migration de la table du compteur ; M2a met à jour `tests/db/roles.test.ts` et `db/README.md`.

## Quand revoir cette décision

Si Resend change ses noms d'erreur, son format de clé, son décompte de quota (jour UTC) ou sa règle de stockage des données ; si un domaine est vérifié (étape 10 : restriction de la clé au domaine, adresse d'expédition, région) ; si une autre personne que Samuel doit recevoir des codes (M2-S-8 tombe) ; si la protection des déploiements de `mvp-essai` est retirée ; si l'option B ou le SDK `resend` sont retenus ; si la barrière de sortie (`egress.ts`) change de liste d'autorisation ; si l'hébergement quitte Vercel (cas admis fondé sur `VERCEL` et `VERCEL_ENV`) ; si les e-mails de notification (M7a, M6c) passent par ce transport (relire le tableau du § 7 et le seuil de Q641).
