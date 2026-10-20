# 0098 — Position de la Sécurité sur `EMAIL_TRANSPORT`, `SMTP_URL` et le transport SMTP (préalable P5, partie SMTP, de B3b-envoi)

Statut : position de la Sécurité (préalable P5 de la spécification B3, partie laissée ouverte par 0051), opposable à la revue de la PR de code de B3b-envoi ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion, sans délai de veto (décision 0093) ; Samuel peut la remettre en cause à tout moment par une nouvelle décision. Elle suit le même régime que 0051 : elle **confirme**, **amende** ou **ajoute des conditions** ; les noms de fichiers, de fonctions, de constantes et de tests restent au Tech Lead.

Date : 2026-10-19 · Rédaction : Sécurité (commit `[secu]`) · Ticket #538 (décision) · Ticket lié #435 (B3b-envoi, code) · Spécification `specs/B3b-envoi-email.md` (l. 22 « Préalable P5 », point 2 « Configuration », point 3 « Transport », question 3) · Décisions liées : 0051 (l. 7 et l. 111 renvoient ici), 0077 § 5.1, 0050 B3-TL-2, 0008 (constats de B3b-envoi), 0035 (porte `owner-approved`), 0093

Numérotation : 0096 est fusionnée (#525) ; 0097 est portée par la PR #540 (Tech Lead, B4a), ouverte ; aucun fichier ni aucune PR ouverte ne porte 0098 au 2026-10-19 (`origin/main` à `bde3682`) ; 0098 est le premier numéro libre.

Vérifié sur `origin/main` à `bde3682` : `src/server/env/index.ts` l. 287-291 (refus de présence de `EMAIL_TRANSPORT` et `SMTP_URL`, quatre environnements), `src/server/mail/enveloppe.ts` (`checkEnvelope`, fusionné par #437), `src/server/config/email.ts` (`SENDER_ADDRESS`), `docker-compose.yml` (service `mailpit`, digest épinglé), `.github/workflows/` (aucun service Mailpit dans la CI). Comportements de `new URL()` mesurés sur le Node du dépôt (section 2) ; code publié de `nodemailer` 10.0.16 relu dans `node_modules` (section 3).

**Argent, comptes, données hors UE** : rien. Aucune dépendance nouvelle (`nodemailer` 10.0.16 et l'image Mailpit sont déjà sur `main`), aucun compte, aucun service, aucune clé, aucun envoi hors de la machine. **Google** : aucune donnée Google, aucun prompt, aucune carte. **RLS** : aucune table, aucune migration. **Données personnelles** : les seules adresses qui transitent sont celles des essais (`exemple.test`) et restent sur la boucle locale, dans une base Mailpit sans volume.

## 1. Synthèse

| Sujet | Position |
|---|---|
| Liste fermée des hôtes (spec point 2) | **Confirmée** : `localhost`, `127.0.0.1`, `[::1]`, et `mailpit` en `ci` seulement. Aucune extension par variable d'environnement. L'hôte du transport est la **constante de la liste**, jamais le texte de l'URL. |
| Contrôle de la chaîne brute (spec point 2) | **Amendé et resserré** : liste blanche de caractères et forme stricte `smtp://<hôte>:<port>[/]` **avant** `new URL()`. Trois trous de la règle de la spec sont fermés (2.2). |
| Analyse par `new URL()` | **Confirmée comme second contrôle**, avec une correction de fait : pour un schéma non spécial comme `smtp:`, `hostname` n'est **pas** mis en minuscules par `URL` ; c'est notre code qui le fait (2.3). |
| Transport (spec point 3) | **Confirmé** (options explicites, jamais une chaîne) et **amendé** : trois options restrictives s'ajoutent (3.2). |
| Gardes `EMAIL_TRANSPORT` / `SMTP_URL` | **Précisées** : ordre d'évaluation, valeurs vides, `smtp` refusé sur Vercel quel que soit `VADROUILLE_ENV`, valeur jamais renvoyée (section 4). |
| Mailpit, jamais d'envoi réel | **Conditions de configuration** du service (relais interdit, boucle locale, digest) et verdict sur la CI (section 5). |
| Confinement et journal | **Verdict** sur les lignes de B3b-envoi pour `src/server/env/index.ts` et `src/server/mail/smtp.ts` (section 6). |
| Fournisseur réel | **Hors de cette décision** : tout hôte hors de la liste demande une décision nouvelle, un compte (Samuel, Q25) et le plafond Q354 (section 7). |

## 2. `SMTP_URL` : chaîne brute, analyse, liste fermée

### 2.1 Pourquoi un contrôle de forme avant l'analyse

`SMTP_URL` ne sert qu'à désigner un hôte et un port de la boucle locale. Tout le reste d'une URL (identifiants, chemin, paramètres, fragment) est du contenu que `nodemailer` ou la plateforme pourraient interpréter, et que `new URL()` normalise (efface un `?` ou un `#` vides, retire les tabulations internes, décode ou réécrit des segments). Une règle qui n'examine que le résultat de `new URL()` examine donc un texte déjà assaini : elle ne voit pas ce qu'elle a laissé passer. La règle est donc de **valider la forme avant d'analyser**, puis d'analyser pour recouper.

### 2.2 Règle sur la chaîne brute (amende le point 2 de la spécification)

Après `trim()` (et seulement `trim()`), la chaîne est **refusée** sauf si elle correspond à la forme

`smtp://` + hôte + `:` + port + (`/` facultatif), et rien d'autre,

où, **sur le texte brut** :
1. le schéma est écrit `smtp://` **en minuscules** (`SMTP://`, `smtps://`, `direct://`, `smtp:` sans barres : refusés) ;
2. l'hôte est soit `[` + chiffres hexadécimaux et `:` + `]` (IPv6), soit des lettres ASCII, des chiffres et des points ; **aucun autre caractère** n'est admis nulle part dans la chaîne : ni `@`, ni `%`, ni `\`, ni `?`, ni `#`, ni espace, ni tabulation, ni caractère de contrôle, ni caractère hors ASCII, ni second `/` ;
3. le port est écrit en chiffres, **sans zéro de tête**, de 1 à 65535 (`:0`, `:01025`, `:001025`, `:99999` refusés) ;
4. après le port, la chaîne est vide ou se termine par un unique `/`.

Les trois écarts que cette règle ferme et que celle de la spécification laissait passer, mesurés sur le Node du dépôt (`new URL()` d'une chaîne non spéciale) :
- `smtp://:@localhost:1025` : `username` et `password` sortent vides, donc la règle « identifiants vides » l'accepte alors que la chaîne porte un `@` ;
- `smtp://localhost:1025/%2e` et `smtp://127.0.0.1:1025/.` : `pathname` sort `/` (le segment est réécrit), donc la règle « chemin vide ou `/` » les accepte ;
- `smtp://localhost:001025` : le port sort `1025` ; la règle « port écrit » l'accepte alors que l'écriture est ambiguë.

Une expression régulière unique convient pour 1 à 4 ; son écriture est au Tech Lead. Toute chaîne qui échoue ici n'est **jamais** passée à `new URL()` ni à `nodemailer`.

### 2.3 Analyse et liste fermée (confirme le point 2, avec une correction de fait)

La chaîne qui a passé 2.2 est analysée par `new URL()`, qui sert de **recoupement** (défense en profondeur : il ne doit plus rien refuser que 2.2 ait laissé passer, et s'il refuse, c'est un refus). Sont exigés, tous ensemble :
1. `protocol` vaut exactement `smtp:` ;
2. `username` et `password` vides (déjà impliqué par 2.2, gardé comme recoupement) ;
3. `search` et `hash` vides ; `pathname` vaut `""` ou `/` ;
4. `port` est un entier de 1 à 65535, écrit (un port implicite est refusé : `smtp://localhost`) ;
5. `hostname`, **mis en minuscules par notre code** puis comparé **exactement** à la liste fermée :

| Hôte (minuscules) | `local` | `ci` | `staging`, `production` |
|---|---|---|---|
| `localhost` | admis | admis | refus (section 4) |
| `127.0.0.1` | admis | admis | refus |
| `[::1]` | admis | admis | refus |
| `mailpit` | **refus** | admis | refus |

**Correction de fait** : la spécification écrit « `hostname` mis en minuscules » comme si `URL` le faisait. Pour un schéma qui n'est pas spécial (`smtp:`), l'hôte est opaque : `smtp://LocalHost:1025` donne `hostname` `LocalHost`, et `smtp://127.1:1025` reste `127.1` (refusé, comme la spécification le veut). La mise en minuscules est donc **notre** étape, à tester avec `LocalHost` (accepté) et `LOCALHOST` (accepté). `smtp://[0:0:0:0:0:0:0:1]:1025` sort `[::1]` (accepté ; la forme `[::ffff:127.0.0.1]` sort `[::ffff:7f00:1]` et reste refusée, comme `localhost.` et `127.0.0.1.`).

**L'hôte du transport est la constante de la liste, pas le texte de l'URL.** Une fois l'hôte reconnu, le module d'environnement n'exporte que `{ host: <constante de la liste>, port: <entier> }` (avec `::1` sans crochets pour `[::1]`). La chaîne brute de `SMTP_URL` ne sort jamais de `src/server/env/index.ts` : ni dans le résultat de `parseServerEnv`, ni dans une erreur, ni dans un journal.

### 2.4 Ce que la liste n'est pas

- Elle n'est pas **extensible** par configuration : aucune variable (`SMTP_ALLOWED_HOSTS` ou autre), aucun joker, aucun suffixe. Y ajouter un hôte est un amendement de cette décision, revu par la Sécurité.
- `mailpit` n'est admis qu'en `ci` : c'est le nom DNS du service dans un réseau de conteneurs. Le plan de la spécification (point 6) donne `smtp://127.0.0.1:1025` pour la CI ; si aucune tâche de la CI n'utilise `mailpit`, la PR de code le **retire** de la liste (surface minimale) ; c'est une question au Tech Lead (question 2).
- Elle ne dit rien de la résolution de `localhost`. Pour `localhost`, le système d'exploitation décide ; le risque est jugé nul en `local` et en `ci` (résolution par le fichier `hosts` du poste ou du runner). On préfère `127.0.0.1` dans tous les exemples, scripts et variables de la CI.

## 3. Transport

### 3.1 Confirmé : options explicites, jamais une chaîne

Le point 3 de la spécification est confirmé : `createTransport` reçoit **un objet**, jamais une chaîne ni une option `url` (le code publié de 10.0.16 fait de `parseConnectionUrl` la voie par laquelle chaque paramètre de requête devient une option du transport, et d'un nom d'utilisateur seul une authentification). Pas de `service`, pas de `proxy`, pas de `auth`, pas de `tls`, pas de `pool`, pas de `sendmail`, pas de transport `stream`, `json` ni `ses` : seul le transport SMTP direct est construit. `logger: false` et `debug: false` restent obligatoires (la trace SMTP contient destinataire et code).

### 3.2 Amendé : trois options restrictives s'ajoutent

Aux cinq options de la spécification (`host`, `port`, `secure: false`, `logger: false`, `debug: false`), le transport reçoit en plus, et **seulement** celles-ci :
- `disableFileAccess: true` et `disableUrlAccess: true` : options de transport qui coupent la lecture de fichiers locaux et d'URL par un contenu de message (`path`, `href`). `checkEnvelope` n'admet déjà que quatre chaînes ; ces deux options sont une seconde barrière (relues dans `mailer/mail-message.js` de 10.0.16 : une option de transport ne peut être rouverte par les données du message). Raison : le message est construit avec du texte tiré de `src/i18n/fr.json` et une adresse saisie par l'utilisateur ; aucun chemin ne doit permettre à une valeur utilisateur de lire un fichier du serveur ;
- des **délais de connexion** (`connectionTimeout`, `greetingTimeout`, `socketTimeout`) de **10 secondes au plus** chacun (les défauts de la bibliothèque sont de 2 minutes, 30 secondes et 10 minutes). Raison : l'envoi est dans le chemin d'une action serveur ; une boîte de réception qui ne répond pas ne doit pas retenir la requête (échec fermé : `provider_error`, `retryable: true`, point 5 de la spécification). Les valeurs exactes sont au Tech Lead, dans ce plafond.

Le test de création du transport (E2) vérifie l'objet exact : ces options, ces valeurs, **aucune autre clé**.

### 3.3 TLS et authentification : explicitement hors de cette décision

`secure: false` sans `requireTLS` ni `ignoreTLS` est le réglage d'un SMTP en clair sur la boucle locale ; il n'a de sens que parce que l'hôte est un hôte local. **Aucun hôte distant ne peut lui être raccordé** : un fournisseur réel demandera `requireTLS`, une authentification et une validation de certificat, donc une décision nouvelle (section 7). Cette décision n'en pré-décide rien.

## 4. Gardes de `src/server/env/index.ts` (l. 287-291)

Les deux lignes de refus de présence sont **remplacées** par les règles suivantes. Elles se lisent dans cet ordre, le premier refus gagne, et **aucune valeur n'est copiée, rendue, journalisée ni jointe à une erreur** (même régime que 0051 point 6.5 : `ServerEnvError` sans `cause`, nom de la variable et code seulement).

1. **Présence** : `EMAIL_TRANSPORT` et `SMTP_URL` se lisent avec `!== undefined` d'abord. Une valeur **vide ou faite d'espaces** compte comme présente.
2. **`staging` et `production`** : la présence de l'une ou de l'autre, quelle que soit la valeur, est un refus `forbidden`. L'URL n'est alors ni analysée ni examinée. Il en va de même sur **Vercel** (`surVercel`, la fonction de 0051 point 2.2) **quel que soit `VADROUILLE_ENV`** : un déploiement Vercel qui porterait `VADROUILLE_ENV=local` ou `ci` par erreur ne démarre pas avec `EMAIL_TRANSPORT` ou `SMTP_URL`. Raison : `VADROUILLE_ENV` est une déclaration de l'opérateur ; la liste fermée limite déjà la portée à la boucle locale, mais un refus qui ne dépend pas de cette déclaration est le seul à tenir si elle est fausse.
3. **`EMAIL_TRANSPORT`** : absente → port désactivé de B3 (B3b-envoi-PO-2, inchangé) ; présente et, après `trim()`, **exactement** `smtp` (en minuscules : `SMTP`, `ses`, `resend`, valeur vide : refus `invalid_value`) → implémentation SMTP, **seulement** si `AUTH_ADAPTER=better-auth` (sinon `forbidden`) et `VADROUILLE_ENV` vaut `local` ou `ci`.
4. **`SMTP_URL`** : requise (`missing`) si `EMAIL_TRANSPORT=smtp` ; présente sans `EMAIL_TRANSPORT=smtp` (absente, ou refusée plus haut) → `forbidden`, jamais ignorée en silence ; sinon contrôlée par 2.2 puis 2.3 (`invalid_value`).
5. **Résultat** de `parseServerEnv` : `smtp: { host, port } | null`, où `host` est la constante de la liste et `port` un entier. `null` ⇔ `EMAIL_TRANSPORT` absente. Aucun autre champ ; aucun champ ne porte la chaîne brute.
6. **Aucun repli** : sans `EMAIL_TRANSPORT`, aucun envoi implicite vers Mailpit, aucun port par défaut, aucune lecture de `SMTP_URL` (B3b-envoi-PO-2). Une valeur par défaut d'`SMTP_URL` ne figure ni dans le code, ni dans `.env.example`, ni dans les scripts : l'URL de Mailpit n'est posée que par `playwright.config.ts` pour le serveur `auth` de la CI et par l'opérateur en `local`.
7. **Journal** : `SMTP_URL` et `EMAIL_TRANSPORT` restent dans la liste de noms rédigés de `src/server/log.ts` (l. 147-148). `SMTP_URL` est traitée comme un nom secret au sens de 0077 § 5.1, bien que sa valeur de phase 0 ne le soit pas : elle devient un secret dès qu'un fournisseur réel la porte, et une règle qui change à ce moment-là est une règle oubliée.

Cas de test à ajouter à E2 (critère de la spécification, `describe` propre à B3b-envoi), en plus de ceux de la spécification : `smtp://:@localhost:1025`, `smtp://localhost:1025/%2e`, `smtp://127.0.0.1:1025/.`, `smtp://localhost:001025`, `smtp://localhost:0`, `smtp://localhost:99999`, `SMTP://localhost:1025`, `smtp://local%68ost:1025`, `smtp://localhost:1025\@x.test`, `smtp://[::ffff:127.0.0.1]:1025`, `smtp://localhost.:1025`, `smtp://localhost:1025//`, chaîne avec caractère hors ASCII (`smtp://ｌocalhost:1025`) → refus en `local` comme en `ci` ; `smtp://LOCALHOST:1025` → accepté ; `EMAIL_TRANSPORT=SMTP`, `EMAIL_TRANSPORT=` (vide) et `SMTP_URL=` (vide) sans `EMAIL_TRANSPORT` → refus ; `EMAIL_TRANSPORT=smtp` avec `VADROUILLE_ENV=ci` et `VERCEL=1`, `VERCEL_ENV=preview` → refus ; valeur sentinelle de `SMTP_URL` absente de `message`, `stack`, `util.inspect` de l'erreur et du journal capturé, **pour chaque refus** ci-dessus ; le résultat de `parseServerEnv` n'a pas de champ qui contienne la sentinelle.

## 5. Mailpit seulement ; jamais d'envoi réel

1. **Aucun envoi hors de la machine, par construction** : la liste fermée ne contient que des noms qui désignent la boucle locale ou, en `ci`, un service du réseau du job. Il n'y a aucun chemin de configuration par lequel un hôte réel entre.
2. **Relais interdit dans Mailpit** : Mailpit sait relayer des messages vers un SMTP externe. Le service `mailpit` de `docker-compose.yml` et le conteneur de service de la CI **n'ont aucune option de relais** (variables `MP_SMTP_RELAY_*` et leurs équivalents en ligne de commande ; noms à confirmer sur la documentation de v1.31.4 par la PR de code). Aujourd'hui `docker-compose.yml` ne pose que `MP_DISABLE_VERSION_CHECK=1` : conforme. La PR de code liste dans sa description **toutes** les variables d'environnement et commandes du service de la CI.
3. **Image** : `axllent/mailpit:v1.31.4@sha256:b68349e3…` (digest de l'index multi-architecture, 0008) dans `docker-compose.yml` **et** dans `ci.yml`, le même digest. Tout changement de version ou de digest passe par un amendement de 0008 et la revue de la Sécurité.
4. **Réseau** : SMTP (1025) et API/interface (8025) publiés sur `127.0.0.1` dans `docker-compose.yml` (déjà le cas). Dans la CI, la publication sur la boucle locale du runner est demandée si le mécanisme du service la permet ; sinon la PR le dit et le runner (machine virtuelle jetable, sans secret de production dans le job `db`) en tient lieu : la Sécurité tranche à la revue du `ci.yml`. L'interface de Mailpit n'a pas d'authentification : elle ne doit être joignable que depuis la machine.
5. **Données** : Mailpit sans volume (base temporaire, supprimée à l'arrêt) ; adresses `exemple.test` seulement ; aucune adresse réelle dans les tests, les fixtures, les captures ni la description de la PR.
6. **`.github/workflows/ci.yml`** : toute modification passe par la porte `owner-approved` (0035). Le service ajouté n'a pas de secret ; `EMAIL_TRANSPORT` et `SMTP_URL` sont posées **en clair** dans la configuration du serveur Playwright `auth` (valeurs de la boucle locale, sans valeur secrète), jamais écrites dans `$GITHUB_ENV` ni dans un secret du dépôt (0051 point 6.4.4, inchangé).
7. **Tests de configuration** : aucun test ne démarre avec une `SMTP_URL` réelle ; aucune valeur d'hôte réel dans un fichier du dépôt (le contrôle E2 de la spécification utilise `smtp.exemple.test`, `localhost.exemple.test`, noms réservés).

## 6. Confinement et revue du code

Verdict exigé par P0c (section 5) et par 0051 point 6.7 point 7 sur les lignes que B3b-envoi ajoutera ; accepté **comme plafond**, aux conditions suivantes :
1. **`src/server/env/index.ts`** : lecture par propriété littérale de `EMAIL_TRANSPORT` et de `SMTP_URL`, **dans ce fichier seulement**. Le fichier n'importe toujours que `zod`, `server-only` et des modules de `src/server/env/**` ou `src/contracts/**` : l'analyse utilise l'objet global `URL`, **aucun import** de `node:url`, `node:net` ni `node:dns`. Aucune résolution de nom, aucune connexion.
2. **`src/server/mail/smtp.ts`** (nom : Tech Lead) : seul fichier qui importe `nodemailer` (spécificateur de la racine du paquet, forme exacte), pour **`createTransport` seulement**. Module à capacité réseau (socket TCP) : zone `src/server/mail/**`. Le chargement de la racine tire aussi, dans 10.0.16, le code du transport `sendmail` (`node:child_process`), qui n’est atteint que par l’option `sendmail` : **cette option** n’est jamais passée (3.1) ; la ligne de confinement est donc une ligne exacte pour ce fichier et ce spécificateur, et le test de création du transport (E2) est ce qui protège contre un ajout. Les lignes existantes (`nodemailer/lib/mail-composer` pour `src/server/mail/**`, `nodemailer/lib/addressparser` pour le test) restent exactes ; **aucun autre sous-chemin** de `nodemailer` (`smtp-connection`, `well-known`, `fetch`, `ses-transport`, `sendmail-transport`, `xoauth2`…) n'est admis.
3. Toute ligne au-delà de ce plafond demande un verdict écrit dans la PR de code.
4. **`import "server-only"`** en tête des deux fichiers ; le transport n'est créé qu'à l'envoi (ou une fois, paresseusement), jamais à l'import, jamais au démarrage.

La revue Sécurité de la PR de code de B3b-envoi vérifie : les sections 2.2, 2.3 (dont la mise en minuscules par notre code), 3.1, 3.2, 4 (dont les cas de test ajoutés et la sentinelle), 5.2 à 5.6 et 6 ; l'enveloppe (point 4 de la spécification) comme 0051 et la spécification l'exigent, avec `maxRecipients: 1` et l'enveloppe explicite identique à la valeur comparée ; l'absence de toute trace SMTP, adresse ou code dans les journaux (E6) ; `pnpm audit` et la liste des scripts d'installation (E1) ; `pnpm.onlyBuiltDependencies` inchangée. Un écart à cette position demande un amendement écrit ici, revu par la Sécurité ; une exception silencieuse est un bloquant.

## 7. Hors de cette décision, et conditions de levée

- **Fournisseur d'envoi réel** (domaine, SPF, DKIM, TLS exigé, authentification, sous-traitant qui reçoit des adresses e-mail, région de traitement) : Samuel (Q25), après la spécification de l'adaptateur Resend revue par la Sécurité et les données personnelles (0077 § 5.1). `better-auth` reste refusé en `staging` et `production` (B3-TL-2).
- **Plafond global d'envois** : Q354 (Samuel), préalable à la levée de Q25 ; sans objet pour Mailpit.
- **Aucun hôte hors de la liste** : un hôte de plus (même un second capteur local) est un amendement de cette décision.
- **Texte de l'e-mail** : UX/UI (B3b-envoi-PO-1) ; non touché.

## Ce que cette décision demande à la spécification

La spécification `specs/B3b-envoi-email.md` (rédaction : Product Owner) doit être alignée sur ce qui précède avant le ticket de code : point 2 (contrôle de la chaîne brute 2.2, mise en minuscules par notre code 2.3, port sans zéro de tête, valeurs vides de la section 4), point 3 (options de 3.2), critère E2 (cas ajoutés de la section 4) et la ligne « Préalable P5 » (« écrit dans 0098 »). Tant que l'alignement n'est pas fait, **cette décision prévaut** sur le texte de la spécification (même principe que 0051, secrets de B3-TL-5). Ce n'est pas un changement de périmètre : aucun critère n'est retiré, quatre cas de test et trois options de transport s'ajoutent.

## Questions nouvelles (à reporter par le CEO dans `QUESTIONS.md`)
1. **Product Owner, 2026-10-20** — Aligner `specs/B3b-envoi-email.md` (point 2, point 3, critère E2, ligne « Préalable P5 ») sur les sections 2.2, 2.3, 3.2 et 4 de cette décision. Bloque la création du ticket de code de B3b-envoi (#435) tant que le texte et la décision divergent ; la décision prévaut en attendant.
2. **Tech Lead, 2026-10-20** — (a) Une tâche de la CI utilise-t-elle l'hôte `mailpit` ? À défaut, le retirer de la liste (2.4) ; (b) valeurs des délais de 3.2 (au plus 10 s) ; (c) noms des fichiers et constantes. Ne bloque pas la décision ; (a) est à trancher avant le code de `parseServerEnv`.
3. **Tech Lead, 2026-10-20** — Relire la section 6 (lignes de confinement) et la section 3.2 (deux options d'accès de `nodemailer`, délais) en revue de cette PR : accepter, ou contester par écrit avant le ticket de code, sans trancher à la place de la Sécurité sur 2.2 à 2.4, 4 et 5.
4. **CEO, 2026-10-19** — Corriger l'état de #435 dans `STATUS.md` : le ticket disait à tort « P5 fusionné » ; P5, partie SMTP, est **cette PR** (#538) et n'est fusionnée qu'avec elle. L'ordre de B3b-envoi par rapport à B3c reste la question 4 de la spécification.

Aucune question pour Samuel : rien dans cette décision n'engage d'argent, de compte externe ni de donnée personnelle hors UE.

Questions existantes touchées : **question 9 de B3** (Sécurité, P5) : la partie `SMTP_URL` est répondue ici ; **question 3 de B3b-envoi** : répondue ; **Q25** et **Q354** (Samuel) : inchangées.

## Quand revoir cette position
Si un hôte doit entrer dans la liste (fournisseur réel, second capteur) ; si `nodemailer` passe en 10.1.x ou plus (relire `parseConnectionUrl`, `createTransport`, les options de 3.2, le chargement de la racine) ; si Mailpit change de version ou de digest ; si l'hébergement quitte Vercel (garde `surVercel` du point 4.2) ; si une `SMTP_URL` porte un jour une valeur secrète.
