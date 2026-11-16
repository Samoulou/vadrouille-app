# Préversion `mvp-essai` : la vraie app sur une branche de préversion Vercel

Décision : `docs/decisions/0169-m1h-preversion-mvp-essai.md` (M1h). Ce document dit **quoi poser, où, dans quel ordre**. Il ne contient **aucune valeur de secret** et n'en contiendra jamais : les valeurs se posent dans Vercel, à la main.

La préversion `mvp-essai` est le **seul** déploiement, hors poste et CI, où la vraie app démarre : `DATA_ADAPTER=api`, `AUTH_ADAPTER=better-auth`, génération réelle. La production n'est pas concernée et rien n'y est posé.

## 1. Ce que la préversion permet, et ce qu'elle ne permet pas encore

| Étape du parcours | État sur la préversion |
|---|---|
| « Créer un voyage », saisie du brief | Oui. La recherche de ville par autocomplétion reste fermée (Q669) : l'écran 1 garde son repli sans Google (0141 § 6.4). |
| Se connecter par code reçu par e-mail | Oui, **avec un compte Resend** (§ 5). Sans lui, aucun code ne part et personne ne peut se connecter. |
| Obtenir un vrai programme (IA, lieux vérifiés sur Google) | Oui, avec `GENERATION_APPELS_REELS=1` et les deux clés de fournisseurs. Sans lien « Site officiel » (0169 § 4). |
| Trier « J'aime / Pas pour moi », révision | Oui. Sans photos (0169 § 7). |
| Débloquer | Oui **avec des clés Stripe de test** (§ 6). Le paiement simulé est refusé sur la préversion. |
| Lire le voyage jour par jour | Oui, mais **sans temps de trajet ni positions relus sur Google** : la relecture réelle reste fermée (0169 § 7). À vérifier au premier essai. |

## 2. Variables à poser dans Vercel

Pour **chaque** ligne : *Settings → Environment Variables*, environnement **Preview**, champ *Git Branch* = **`mvp-essai`**. Jamais « Production », jamais « toutes les branches de préversion ». Les lignes « secrète » se cochent **Sensitive**.

### 2.1 Démarrage de la vraie app (obligatoires : sans elles, le serveur refuse de démarrer)

| Nom | Valeur | D'où elle vient | Secrète |
|---|---|---|---|
| `DATA_ADAPTER` | `api` | fixe | non |
| `AUTH_ADAPTER` | `better-auth` | fixe | non |
| `BETTER_AUTH_URL` | adresse stable de la préversion de branche, en `https://`, sans chemin ni barre finale | Vercel, *Deployments* → déploiement de `mvp-essai` → domaine de branche (forme `https://<projet>-git-mvp-essai-<équipe>.vercel.app`) | non |
| `APP_URL` | **la même adresse** | idem | non |
| `BETTER_AUTH_SECRET` | 32 octets aléatoires, en base64 ou en hexadécimal | à tirer sur un poste : `openssl rand -base64 32` | **oui** |
| `RATE_LIMIT_HMAC_SECRET` | 32 octets aléatoires, **différents** du précédent | `openssl rand -base64 32`, tiré une seconde fois | **oui** |
| `TRUSTED_IP_HEADER` | `x-vercel-forwarded-for` | fixe (Q401) | non |
| `VADROUILLE_DATABASE_URL` | URL de connexion Postgres du rôle `vadrouille_app` | console Neon, base du MVP, rôle `vadrouille_app` | **oui** |
| `VADROUILLE_DATABASE_URL_AUTH` | URL de connexion Postgres du rôle `vadrouille_auth` | console Neon, même base, rôle `vadrouille_auth` | **oui** |

Le serveur refuse deux secrets identiques, un secret trop court ou trivial, une URL en `http://`, et l'absence de `RATE_LIMIT_HMAC_SECRET` ou de `TRUSTED_IP_HEADER`. Le refus s'écrit dans les journaux de Vercel sous l'événement `config_invalid`, avec le **nom** de la variable et un code de règle, jamais une valeur.

### 2.2 Connexion par e-mail (action S1 du plan)

| Nom | Valeur | D'où elle vient | Secrète |
|---|---|---|---|
| `EMAIL_TRANSPORT` | `resend` | fixe | non |
| `RESEND_API_KEY` | clé `re_…` | resend.com, *API Keys* → *Create API Key*, permission **« Sending access »** seulement (0138 § 2.7) | **oui** |

Les deux se posent **ensemble**, ou pas du tout : `RESEND_API_KEY` sans `EMAIL_TRANSPORT=resend` refuse le démarrage, et l'inverse aussi. Aucune autre variable dont le nom contient `RESEND`.

### 2.3 Génération réelle

| Nom | Valeur | D'où elle vient | Secrète |
|---|---|---|---|
| `GENERATION_APPELS_REELS` | `1` | fixe. **C'est l'interrupteur** : la retirer (puis redéployer) referme tout appel payant de la génération ; l'app continue sur des données simulées. | non |
| `OPENROUTER_API_KEY` | clé OpenRouter | compte OpenRouter existant (celui de `p0-reel`) ; de préférence une clé propre à cette branche, avec sa limite de dépense | **oui** |
| `GOOGLE_MAPS_SERVER_KEY` | clé serveur Google Maps Platform (Places) | console Google Cloud (celle de `p0-reel`) ; de préférence une clé propre, restreinte à Places API (New) | **oui** |

### 2.4 Carte dans le navigateur

| Nom | Valeur | D'où elle vient | Secrète |
|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | clé du navigateur, restreinte par référent | déjà posée pour Preview si la carte s'affiche sur les autres préversions ; sinon voir `variables-environnement.md`, « Carte Google Maps » | non (publique par nature) |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | identifiant de carte | idem | non |

### 2.5 Déblocage par Stripe en mode test (action S5 du plan ; facultatif pour un premier essai jusqu'au tri)

| Nom | Valeur | D'où elle vient | Secrète |
|---|---|---|---|
| `PAYMENT_ADAPTER` | `stripe` | fixe | non |
| `STRIPE_SECRET_KEY` | `sk_test_…` ou `rk_test_…` (une clé `…_live_…` refuse le démarrage) | tableau de bord Stripe, **mode test**, *Developers → API keys* | **oui** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` | Stripe, *Developers → Webhooks*, point de terminaison `https://<adresse de mvp-essai>/api/v1/webhooks/stripe`, charge utile « Snapshot », événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` (0140) | **oui** |

Les trois se posent ensemble. Sans elles, ne pas poser `PAYMENT_ADAPTER` : l'app démarre, et le déblocage est indisponible.

### 2.6 À ne pas poser sur cette branche

`VADROUILLE_ENV` (toute valeur ferme les gardes), `SMTP_URL`, `SIMULATED_WEBHOOK_ENABLED`, `SIMULATED_WEBHOOK_SECRET`, `PAYMENT_ADAPTER=simulated`, `RELECTURES_SOURCE`, `VADROUILLE_DATABASE_URL_MIGRATOR`, `VADROUILLE_DB_ADMIN_URL`, `VADROUILLE_DEMO_AUTH`, `VADROUILLE_DEMO_PAYMENT`, `VADROUILLE_DEV_PAGES`, toute variable `BETTER_AUTH_TRUSTED_ORIGINS`, `BETTER_AUTH_TELEMETRY*`, `BETTER_AUTH_SECRETS`, `AUTH_SECRET`, et aucune variable `P0_*` (elles appartiennent à `p0-reel`).

### 2.7 Réglage du projet à vérifier

*Settings → Environment Variables → Automatically expose System Environment Variables* doit être **activé** : les gardes lisent `VERCEL`, `VERCEL_ENV` et `VERCEL_GIT_COMMIT_REF`, que Vercel pose lui-même. Désactivé, tout reste fermé.

## 3. État requis de la base

La préversion lit et écrit la base Neon du MVP (schéma principal, rôles `vadrouille_app` et `vadrouille_auth`). **L'état réel de cette base n'a pas été relevé pour écrire ce document** : le workflow ci-dessous le relève.

1. **Rôles** : `db/bootstrap/roles.sql` rejoué par un propriétaire de la base après la fusion de M2a (il crée notamment le rôle du compteur d'e-mails, 0138 § 11). Sans lui, aucun code ne part (`provider_error`).
2. **Migrations** : toutes celles de `db/migrations/` approuvées dans `MIGRATIONS_APPROUVEES` (`.github/workflows/db-migrate.yml`), soit `0000` à `0026_apres_voyage` à la date de ce document. `0027_rappels_relais` et `0028_purge_place_coordinates` attendent leur ligne d'approbation (PR `data`, verdict Sécurité, libellé `owner-approved`) ; le parcours d'essai ne les utilise pas.
3. **Comment** : workflow **`db-migrate`**, lancé à la main sur `main` (*Actions → db-migrate → Run workflow*), champ `sha_attendu` = le SHA de la tête de `main` relevé juste avant. Il n'applique que les migrations approuvées et s'arrête si le SHA ne correspond pas. C'est l'action S3 du plan.
4. **Limite de connexions** : chaque instance ouvre jusqu'à 17 connexions (10 opérations, 5 verrous, 2 compteur d'e-mails ; 0138 § 11), plus le pool de `vadrouille_app`. À rapprocher de la limite de la base Neon.

## 4. Ordre des gestes

1. Fusionner la PR de M1h dans `main` (CI verte, Tech Lead, Sécurité).
2. Base : rejouer `roles.sql` si ce n'est pas fait, puis lancer `db-migrate` sur `main` (§ 3).
3. Vercel : poser les variables du § 2.1, puis 2.2, 2.3 et 2.4 (et 2.5 si les clés Stripe de test existent), toutes en **Preview**, branche **`mvp-essai`**. Vérifier le réglage du § 2.7.
4. Créer la branche `mvp-essai` depuis `main` et la pousser (Release, comme `p0-reel`). Vercel la construit (`scripts/vercel/ignore-build.sh`).
5. Relever l'adresse de la préversion de branche. Si elle diffère de celle posée dans `BETTER_AUTH_URL` et `APP_URL`, corriger les deux et **redéployer** (une variable modifiée ne vaut que pour le déploiement suivant).
6. Si Stripe : déclarer le point de terminaison du webhook avec cette adresse (§ 2.5), poser son secret, redéployer.
7. Ouvrir l'adresse, « Créer un voyage », se connecter, lancer la génération.

**Mettre `mvp-essai` à jour** : fusionner `main` dans `mvp-essai` par une PR (comme `p0-reel`). Chaque poussée compte dans les 100 déploiements par jour de l'offre gratuite (0163).

## 5. Se connecter sans compte Resend

Il n'existe **pas** d'autre voie sûre aujourd'hui :

- la connexion simulée (`AUTH_ADAPTER=mock`) accepte un code connu de tous et ne crée aucune organisation : l'adaptateur `api` la refuse (0086 § 2.1) ;
- le transport SMTP n'admet que la boucle locale (Mailpit, `localhost`), et il est refusé sur Vercel (0098 § 2.3) ;
- sans `EMAIL_TRANSPORT`, le port d'envoi est désactivé : aucun e-mail ne part, donc aucun code n'arrive.

La voie la plus courte reste donc l'action S1 : créer le compte Resend (offre gratuite, une dizaine de minutes), créer une clé « Sending access », la poser (§ 2.2). Sans domaine vérifié, Resend n'envoie qu'à l'adresse du titulaire du compte : c'est suffisant pour l'essai de Samuel (Q640), et c'est aussi ce qui limite aujourd'hui qui peut se connecter (0169 § 5.3).

## 6. Dépense maximale

| Plafond | Valeur |
|---|---|
| IA par voyage (programme et révision) | 2 USD |
| Par organisation et par jour, tous fournisseurs | 10 USD |
| Actions sans compte, par jour | 5 USD |
| Google, par mois (toutes organisations) | 20 USD |
| Modèles, par mois (toutes organisations) | 40 USD |

Les plafonds sont dans le code (`src/server/config/usage.ts`) : les changer demande une PR. Les limites de dépense des consoles OpenRouter et Google Cloud restent le second filet (Q838).

## 7. Refermer

- **Tout appel payant** : retirer `GENERATION_APPELS_REELS` de la branche, redéployer.
- **Toute la préversion** : supprimer la branche `mvp-essai` (Vercel retire son domaine de branche), ou retirer `AUTH_ADAPTER` (le serveur ne sert plus la vraie app).
- **Les clés** : les révoquer dans leurs consoles (Resend, OpenRouter, Google, Stripe), puis retirer les variables.

## 8. La préversion est publique

Sur l'offre gratuite de Vercel, les préversions n'ont pas de protection des déploiements (0163) : toute personne qui connaît l'adresse l'atteint. Ce qui la protège : la connexion par code (seule l'adresse de Samuel en reçoit, tant qu'aucun domaine n'est vérifié), les limiteurs par adresse IP, et les plafonds du § 6. Ne pas diffuser l'adresse. Avant tout autre testeur : 0169, « Quand revoir ».
