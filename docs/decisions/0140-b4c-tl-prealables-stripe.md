# 0140 — Préalables de B4c (B4c-TL) : paquet `stripe`, webhook Stripe et sa signature, clés de test, origines admises dans `redirectUrl`, lignes de confinement, critère C7 ; amendements de 0006 et de 0020 § 1.3

Statut : **acceptée**, décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion, sans délai de veto (0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision. Les points marqués **« verdict Sécurité »** (§ 6 et § 7) sont des propositions du Tech Lead, propriétaire des listes, que la Sécurité tranche dans la revue de cette PR (question 6 de la spécification B4) ; si elle en refuse un, cette décision est amendée dans la même PR avant fusion.

Date : 2026-10-28 · Décideur : Tech Lead · Ticket : #845 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 3, tâche B4c-TL (l. 125) · Spécification : `specs/B4-paiement-simule.md`, « B4c — Mode test Stripe » (points 1 à 7, l. 109-116), critères C1 à C7 (l. 158-165), B4-PO-4 (l. 188), questions 4 et 6 (l. 248 et l. 250) · `main` relu : `033c94d`, puis `384af78` (0138 et 0139 fusionnées, documents seulement : aucune ligne de code citée ici n'a changé) · Branche lue : `claude/831-b4b-deblocage-api` (PR #836, B4b, ouverte, `techlead-approved`, head `5c2990b`) pour 0020 § 2.3 amendé par B4-TL-14 · Décisions lues : 0006, 0020, 0031 § 6, 0050, 0051, 0093, 0097 (B4-TL-1 à B4-TL-13), 0136 et 0138 (forme), 0139.

Numérotation : 0140 est réservé par le CEO (ticket #845). Relu le 2026-10-28 : `main` porte 0001 à 0139 ; aucune PR ouverte ni branche `claude/…` n'ajoute 0140.

**Ce que cette décision n'engage pas.** Aucun compte, aucune clé, aucun secret, aucun appel à l'API de Stripe : seuls le registre npm (lecture) et la documentation publique de Stripe ont été consultés (sources en fin de § 1 et § 2). Aucun argent. Aucune donnée personnelle envoyée : la session de test ne reçoit ni e-mail ni nom (§ 5). Aucun test supprimé ni désactivé : un seul cas de test change de sens, écrit ici (§ 1.3). Aucune migration. Aucune garde levée : `PAYMENT_ADAPTER=stripe` reste refusé en production (§ 3).

**Réservé à Samuel, non tranché ici** : Q26 (compte Stripe de test avec TWINT), Q353 (environnement de l'essai, pose des secrets de test, déclaration du point de terminaison chez Stripe), action S5 du plan (l. 294), Q129 (effet d'un remboursement sur le droit), mise en production et mode réel. Voir « Décisions attendues de Samuel ».

## Contexte

État de `main` (`384af78`), vérifié ligne à ligne :
- Le paquet `stripe` n'est pas dans `package.json` (0097 B4-TL-2 point 1 l'a renvoyé à B4c). L'adaptateur `stripe` lève « non implémenté » : `src/adapters/index.ts` l. 163-164 (`paymentAdapterChoice`, l. 158).
- `src/server/env/index.ts` connaît `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` et le libellé `STRIPE_*` (`VARIABLES`, l. 66-68), refuse les préfixes de production (l. 324, `PREFIXES_STRIPE_PRODUCTION`, et l. 327-335, `verifierStripe`) dans le parcours unique des noms (l. 438-446), et admet `stripe` dans `PAYMENT_ADAPTER_CHOICES` (l. 170) sans aucune garde propre (seule la branche `simulated` existe, l. 509-517).
- `src/server/env/payment.ts` ne lit pas `process.env` (l. 5-11) : il reçoit le `ServerEnv` validé et expose `webhookSimuleOuvert` (l. 18-20) et `cleWebhookSimule` (l. 23-25). Importateurs admis : `src/server/payment/composition.ts` et `src/server/routes/simulated-webhook.ts` (`eslint-rules/server-env-imports.mjs` l. 58).
- Le webhook simulé (`src/server/routes/simulated-webhook.ts`) applique l'ordre de 0097 B4-TL-11 (l. 16-29 ; prédicat l. 106-114 ; méthode, type, taille l. 116-119 ; signature l. 122-124 ; analyse l. 126-133 ; base l. 136-142), avec la vérification maison `verifier` (`src/server/payment/signature.ts` l. 63, tolérance de 300 s dans les deux sens l. 16 et l. 67, en-tête d'au plus 512 caractères l. 18). La route exporte les sept méthodes (`src/app/api/v1/webhooks/simulated/route.ts` l. 11-17).
- Le traitement est commun et paramétré par la forme attendue des identifiants : `handlePaymentEvent(deps, evenement, { formeAttendue })` (`src/server/payment/webhook.ts` l. 39-45 et l. 95), premier contrôle `provider_mismatch` (l. 55), refus de `livemode` (l. 56), idempotence par l'identifiant d'événement (`ON CONFLICT (stripe_event_id) DO NOTHING`, l. 81-83 ; événement déjà enregistré, l. 136-137). La forme simulée est `formeSimulee` (`src/server/payment/formes.ts` l. 14-15 et l. 26-28). L'analyse en `PaymentEvent` lit déjà la forme des événements de Stripe (`src/server/payment/evenement.ts` l. 13-25 et l. 37-61).
- `createCheckout` insère la ligne `checkouts`, appelle `prestataire.creerSession` puis écrit l'identifiant de session **dans la même transaction** (`src/server/payment/paiements.ts` l. 189 et l. 213-214) ; une reprise par le même `requestId` sans identifiant de session rend `provider_error` (l. 196). `redirectUrl` est toujours un chemin de l'application (`depart`, l. 127-131).
- `CheckoutStartSchema.redirectUrl` n'admet qu'un chemin (`src/contracts/billing.ts` l. 61-84), conformément à 0020 § 1.3 (l. 61-62, identiques sur `main` et sur la branche de #836).
- `src/server/actions/**` n'admet le paquet `stripe` que dans `paiement.ts` (`eslint-rules/route-handlers.mjs` l. 10-11 et l. 37 ; cas de test `tests/unit/lint/route-handlers-lint.test.ts` l. 29), selon 0006 (§ « Amendement de 0017 § 3.3 et 0020 § 11 », point 3, l. 47). Mais l'action `startCheckout` passe par l'adaptateur (`src/server/actions/paiement.ts` l. 49-56) et ne peut pas importer `@/server/env/payment` (même règle, l. 50), donc ne peut pas tenir la clé : la permission de l. 37 n'a pas d'usage.

## 1. Paquet `stripe` : version, lieux d'import, amendement de 0006

### 1.1 Version retenue : `stripe` **23.0.0**, exacte

Registre npm interrogé le 2026-10-28 (`npm view stripe dist-tags`, `npm view stripe time`, `npm view stripe@<v> engines dependencies peerDependencies peerDependenciesMeta license dist.integrity exports`) :

| Version | Publiée | Âge au 2026-10-28 | Retenue |
|---|---|---|---|
| 23.0.1 (`latest`) | 2026-10-22 | 6 jours | non : moins de deux semaines |
| **23.0.0** | **2026-10-01** | **27 jours** | **oui** : stable la plus récente d'au moins deux semaines |
| 22.6.2 | 2026-09-09 | 49 jours | repli (dernière de la majeure 22) |
| 23.1.0-beta.2, 23.1.0-alpha.4 | 2026-10-22, 2026-10-21 | — | non : préversions |

Propriétés de 23.0.0 : licence MIT ; `dependencies` vide ; aucun script `preinstall`, `install` ni `postinstall` ; `engines.node` `>=20` (le projet exige `>=22.19.0`, `package.json` l. 7) ; dépendance de pair `@types/node` `>=20`, facultative (le projet a 22.20.5, l. 70) ; intégrité `sha512-MDE2A5ZVVluYURORaZEVghSmnLJc3w6aHAlZSxDQMsOjOb3V0O6ro/CiaeFlJS4N7uIVmsg98ocRsPmUK6YfyA==` ; `exports` ne déclare que des conditions (`default`, `worker`, `browser`…), **aucun sous-chemin** : seul le spécificateur `stripe` est importable.

Règles pour B4c :
1. Installation en version **exacte** (`"stripe": "23.0.0"`, sans `^`), hors de `onlyBuiltDependencies`. La PR cite l'entrée du verrou (version et intégrité ci-dessus).
2. Si B4c ouvre sa PR à partir du **2026-11-05** (23.0.1 aura deux semaines), elle **peut** installer 23.0.1 à la place, en la notant dans la ligne de 0006 (point 1.2 ci-dessous) et dans sa description, avec son intégrité relue au registre ; aucune autre version sans nouvel amendement.
3. La version d'API de Stripe épinglée par le paquet (constante exposée par la bibliothèque) est notée par B4c dans sa description : le point de terminaison de test doit être déclaré chez Stripe avec **cette** version (« Décisions attendues de Samuel », point 3), car la forme des événements suit la version de la destination (documentation, « API versioning »).
4. Aucune option qui envoie des données sans nécessité : client créé avec `telemetry: false`, `maxNetworkRetries: 1`, délai court (proposition : 10 s), aucune `appInfo` ; `apiVersion` non surchargée (celle du paquet).

### 1.2 Lieux d'import : un seul module, `src/server/payment/stripe.ts`

Le paquet `stripe` ne s'importe que dans **`src/server/payment/stripe.ts`** (nom fixé ici), qui exporte deux fonctions et rien de la bibliothèque :
- `creerClientSessionsStripe(cle)` : rend un objet étroit `{ creerSession(parametres, cleIdempotence), adresseSession(idSession) }` (type défini dans ce module, sans type de la bibliothèque dans sa signature publique), seul lieu où un client `Stripe` est construit ;
- `verifierEvenementStripe(corps, entete, secret)` : appelle `constructEvent` avec la tolérance explicite de 300 s (§ 2.3) et rend un booléen, **sans** laisser sortir l'objet d'erreur (§ 2.3 point 4). Si la version installée expose la vérification sans clé d'API (fonction statique `Stripe.webhooks`), elle l'emploie : la route du webhook ne tient alors jamais `STRIPE_SECRET_KEY` ; sinon elle construit l'instance avec une clé factice constante, jamais avec la vraie (B4c le vérifie sur 23.0.0 et l'écrit dans sa PR).

Importateurs de `stripe.ts` hors des tests : `src/server/payment/composition-stripe.ts` (composition de l'adaptateur, § 5) et `src/server/routes/stripe-webhook.ts` (§ 2), et eux seuls (test du dépôt, § 6 ligne 9). Les tests n'importent `stripe` que par `tests/support/stripe-evenements.ts` (signature de test par la fonction de la bibliothèque, critère C3). Ni `src/server/actions/`, ni `src/adapters/`, ni `src/app/`, ni `src/features/`, ni `src/components/` n'importent le paquet. C'est **plus étroit** que B4c point 1 (`src/server/payment`, `src/server/routes`, `src/server/actions/paiement.ts`) : la spécification fixe un plafond, B4c le resserre (écart signalé au § 10).

### 1.3 Amendement de 0006 (appliqué par la PR de B4c)

**(a) Tableau « Décision », ligne `stripe`, l. 31.**

Avant :
> | `stripe`, SDK de modèles (`ai`, `@ai-sdk/*`) | fixées par B4 et B7 | Chaque tâche note la version retenue dans un amendement de cette décision |

Après :
> | `stripe` | 23.0.0, exacte (B4c ; décision 0140 § 1.1 ; 23.0.1 admise à partir du 2026-11-05, notée ici si B4c la prend) | Importé par `src/server/payment/stripe.ts` seulement (0140 § 1.2) |
> | SDK de modèles (`ai`, `@ai-sdk/*`) | fixées par B7 | Chaque tâche note la version retenue dans un amendement de cette décision (P0r1 : voir « Amendement P0r1 ») |

**(b) § « Amendement de 0017 § 3.3 et 0020 § 11 », point 3, l. 47.**

Avant :
> … Dans `src/server/actions/**` sont interdits `@/server/routes/*`, `@/server/env/payment`, les identifiants `constructEvent`, `STRIPE_WEBHOOK_SECRET` et `SIMULATED_WEBHOOK_SECRET`, et le paquet `stripe` hors de `src/server/actions/paiement.ts` (création de la session de paiement seulement) ;

Après :
> … Dans `src/server/actions/**` sont interdits `@/server/routes/*`, `@/server/env/payment`, les identifiants `constructEvent`, `STRIPE_WEBHOOK_SECRET` et `SIMULATED_WEBHOOK_SECRET`, et le paquet `stripe` **dans tout fichier, `paiement.ts` compris** (amendé par 0140 § 1.2 : la session est créée par l'adaptateur, depuis `src/server/payment/stripe.ts`, seul importateur du paquet) ;

Conséquence de code (B4c) : `eslint-rules/route-handlers.mjs` l. 37 refuse `stripe` dans tout `src/server/actions/**` (le message `stripe`, l. 54, suit) ; dans `tests/unit/lint/route-handlers-lint.test.ts`, le cas `["src/server/actions/paiement.ts", "stripe"]` passe de la liste « peut importer » (l. 29) à la liste « ne peut pas importer » (l. 49-53). Ce n'est ni une suppression ni une désactivation : le cas reste, son attendu s'inverse, par cette décision.

**(c) § « Modules d'environnement par dossier », l. 60.** Inchangé sur le fond (« `src/server/env/payment.ts` (secrets Stripe et du webhook simulé, importable par `src/server/routes` et `src/server/payment` seulement) ») ; B4c ajoute en fin de phrase : « ; il lit `STRIPE_SECRET_KEY` (après la barrière de sortie) et `STRIPE_WEBHOOK_SECRET` à l'appel (0140 § 3) ».

## 2. Webhook `/api/v1/webhooks/stripe`

### 2.1 Emplacement et réutilisation

- `src/app/api/v1/webhooks/stripe/route.ts` → `src/server/routes/stripe-webhook.ts` (B4c point 5 ; 0097 B4-TL-5), sur le modèle exact du simulé : `export const dynamic = "force-dynamic"` et les **sept méthodes** exportées vers le même gestionnaire (`route.ts` simulé l. 9-17), pour que la route fermée réponde `404` à toute méthode.
- **Aucune duplication de l'ordre des contrôles.** B4c extrait de `creerWebhookSimule` (`simulated-webhook.ts` l. 101-144) une fabrique commune, `creerWebhook({ lireConfiguration, verifierSignature, formeAttendue, creerDependances, … })`, dans `src/server/routes/webhook-commun.ts` (nom proposé) : prédicat, `405`, type de média, lecture en flux à 64 Kio (`lireCorps`, l. 50-68), signature, analyse (`analyserEvenement`), base (`handlePaymentEvent`), corps constants et `Cache-Control: no-store` (l. 35-42). `simulated-webhook.ts` et `stripe-webhook.ts` ne gardent que leur configuration. Les tests A10 et A24 du simulé restent tels quels et doivent rester verts sur la fabrique commune (non-régression).
- Ce qui diffère pour Stripe :

| Étape (0097 B4-TL-11) | Webhook simulé | Webhook Stripe |
|---|---|---|
| 1. ouvert | `webhookSimuleOuvert` (`env/payment.ts` l. 18-20) | `webhookStripeOuvert(env)` : `env.paymentAdapter === "stripe"` (B4c point 5) ; configuration invalide = `404` et ligne `payment.webhook_config_invalid`, comme l. 106-113 |
| 5. signature | `verifier` maison (clé en octets) | `verifierEvenementStripe(corps, entete, secretWebhookStripe())` (§ 2.3) ; le secret n'est lu qu'ici |
| 7. forme attendue | `formeSimulee` (`formes.ts` l. 26-28) | `formeStripe` (§ 8, critère C7) |

### 2.2 Réponses HTTP

Identiques à 0097 B4-TL-11 point 2, sans exception : `200` `{"received":true}` pour tout événement vérifié et traité (accordé, déjà accordé, ignoré, refusé par un contrôle, session inconnue, identifiant simulé) ; `400` `{"error":"invalid_request"}` (signature absente, fausse ou hors tolérance, en-tête de plus de 512 caractères, type de média autre que `application/json`, corps signé illisible) ; `404` corps vide (fermé) ; `405` avec `Allow: POST` ; `413` ; `500` `{"error":"server_error"}` sur une panne de base seulement. 0081 (B9-TL-12, option B, rappelée par 0097 B4-TL-12) s'applique : la réponse ne dépend pas de la suite.

Lecture de la documentation de Stripe (sources ci-dessous) : toute réponse hors `2xx` est un échec relivré ; en mode test, Stripe relivre **trois fois sur quelques heures** ; en mode réel, **jusqu'à trois jours** avec recul exponentiel ; une redirection `3xx` est un échec. Cela répond à la question laissée par B4-TL-12 option A (« durée de relivraison … à vérifier par B4c ») : l'option B retenue par 0081 évite les `500` prolongés ; un `500` ne survient que sur panne de base, et la relivraison est voulue (B4-PO-13). La règle de désactivation d'un point de terminaison n'est pas décrite par les pages lues : elle n'est pas présumée (« Quand revoir »).

### 2.3 Vérification de la signature

Format (documentation, « Verify webhook signatures manually ») : en-tête `Stripe-Signature: t=<secondes>,v1=<hex>[,v1=…][,v0=…]` ; seul le schéma `v1` compte (`v0` est une fausse signature des événements de test, à ignorer contre la rétrogradation) ; `v1` = HMAC-SHA-256, clé = le secret `whsec_…` du point de terminaison, message = `<t>` + `.` + corps brut ; comparaison à temps constant ; plusieurs `v1` pendant la rotation d'un secret (jusqu'à 24 h). C'est le format de 0097 B4-TL-2 point 2.

1. **Corps brut** : `verifierEvenementStripe` reçoit les **octets** lus par `lireCorps` (jamais `request.json()` ni une chaîne réencodée), passés tels quels (`Buffer`) à `constructEvent`. La documentation l'exige (« Stripe requires the raw body of the request »).
2. **Tolérance : 300 s, passée explicitement** (valeur par défaut des bibliothèques, « default tolerance of 5 minutes ») ; jamais `0` (la documentation : « Don't use a tolerance value of `0`. Using a tolerance value of `0` disables the recency check entirely »). La garde contre un horodatage **futur** de 0097 B4-TL-2 point 3 n'est **pas** reprise sur la route Stripe : la vérification de la bibliothèque ne compare que l'âge (lecture de 0097 B4-TL-2 ; B4c le constate par un test sur 23.0.0, § 9 T4) et un horodatage futur exige le secret ; une garde maison réintroduirait du code maison sur le chemin Stripe, contre le choix de 0097 B4-TL-2 point 4. Écart assumé entre les deux routes, borné par T4.
3. **Rejeu** : la tolérance borne la fenêtre ; à l'intérieur, l'idempotence par identifiant d'événement fait qu'un rejeu n'écrit rien et n'accorde rien de plus (`webhook.ts` l. 81-83 et l. 136-137 ; A1 rejoué). Stripe signe chaque nouvelle livraison avec un nouvel horodatage (documentation), donc une relivraison légitime n'est jamais refusée pour son âge.
4. **Aucune fuite par l'erreur** : l'erreur levée par `constructEvent` porte l'en-tête et le corps reçus. `verifierEvenementStripe` l'attrape **sans la lier ni la journaliser** (`catch {}`), ne la relance pas et rend `false` ; la route répond `400` sans journal (comme le simulé, l. 124). Test T5 (A19 étendu).
5. **Plafond d'en-tête avant tout calcul** : un en-tête `Stripe-Signature` absent ou de plus de 512 caractères (`LONGUEUR_MAX_ENTETE`, `signature.ts` l. 18, réutilisée) donne `400` sans appeler `constructEvent` (espion). Aucun autre analyseur maison de l'en-tête.
6. **Liste d'adresses IP de Stripe** : non retenue en B4c. La documentation la recommande en plus de la signature ; elle demande une règle de pare-feu ou un en-tête d'IP de confiance sur la préversion (réglage de compte Vercel : Samuel) et une liste à tenir à jour. La signature suffit au mode test ; à revoir avant tout mode réel (« Quand revoir »).

### 2.4 Idempotence et événements traités

- Idempotence : par l'identifiant d'événement, **ligne `billing`** unique (`stripe_event_id`, `webhook.ts` l. 81-83), déjà en place ; rien à ajouter. Deux événements distincts pour le même objet (cas signalé par la documentation) sont traités comme deux événements : le droit reste unique par le verrou du voyage et l'unicité de `entitlements` (`webhook.ts` l. 123 et l. 180-185 ; A11, A12).
- Types : ceux de `evenement.ts` l. 13-25, inchangés (B4c point 5). Ordre non garanti par Stripe : déjà couvert (A14, `paid_after_failure`).
- **Remboursement et litige** : B4c point 5 demande de les enregistrer `ignored` avec alerte. Un événement `charge.*` ou `refund.*` ne porte pas la session Checkout (`analyserEvenement` ne lit la session que pour `checkout.session.*`, l. 48) : le retrouver demande soit l'identifiant du `payment_intent` dans `checkouts` (migration), soit un appel à l'API de Stripe depuis le webhook. **Décision : B4c garde le traitement de 0097 (alerte `refund` ou `dispute` seule, sans ligne, `webhook.ts` l. 99 et l. 106-108)** ; l'enregistrement attend la transcription de Q129, qui dira ce qu'il doit déclencher. Écart signalé au § 10.

## 3. Clés de test : ce qui est exigé, ce qui existe, ce qui manque

**Ce qui existe** (`src/server/env/index.ts`) :
- l. 324 : `const PREFIXES_STRIPE_PRODUCTION = ["sk_live_", "pk_live_", "rk_live_"] as const;`
- l. 329-330 : `const normalisee = valeur.trim().toLowerCase();` puis `if (PREFIXES_STRIPE_PRODUCTION.some((prefixe) => normalisee.startsWith(prefixe))) throw new ServerEnvError(variable, "production_prefix");` — **c'est la ligne qui refuse `sk_live`**, dans tous les environnements, pour toute variable `STRIPE_*` présente (parcours l. 438-446) ; testé par `tests/unit/server/env.test.ts` l. 316-327 (`sk_live_`, ` SK_LIVE_`, `rk_live_`, `pk_live_`, une autre `STRIPE_*`) et par le job `docker` (`.github/workflows/ci.yml` l. 322).
- l. 331-333 : `STRIPE_SECRET_KEY` présente qui ne commence pas par `sk_test_` ni `rk_test_` → `invalid_value` (test l. 331-332).

**Ce qui manque** (ajouté par B4c dans `src/server/env/index.ts`, testé dans `env: gardes de configuration`, valeurs en clés d'objet, jamais `vi.stubEnv` d'un nom secret) :
1. **Forme stricte de la clé secrète** : `^(sk|rk)_test_[A-Za-z0-9]{16,255}$`, sans `trim()` (aujourd'hui `sk_test_` suivi d'espaces ou d'un retour à la ligne passe, l. 331) ; refus `invalid_value`.
2. **`STRIPE_WEBHOOK_SECRET` n'a aucune garde de forme** : il ne relève que du libellé `STRIPE_*` (l. 328) et du seul contrôle des préfixes de production. B4c l'ajoute à `VARIABLES` (l. 66-68) et à la liste de `src/server/log.ts` (l. 285-287, test d'égalité), avec la forme `^whsec_[A-Za-z0-9+/=_-]{24,128}$` (les secrets du tableau de bord et de la CLI commencent par `whsec_`, documentation) ; refus `invalid_value`. **Limite** : un secret de signature de test et un secret réel ont la même forme ; rien ne les distingue au démarrage. La protection contre un événement réel est le refus de `livemode` (`webhook.ts` l. 56, code `livemode`, A6) ; elle est rappelée par C3.
3. **Garde de `PAYMENT_ADAPTER=stripe`**, absente aujourd'hui (seule la branche `simulated`, l. 509-517) : refus de démarrer en `production` (`forbidden`, jusqu'à une décision de Samuel sur le mode réel) ; `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` présents et conformes (`missing` sinon) ; `DATA_ADAPTER=api` ; `AUTH_ADAPTER=better-auth` ; `APP_URL` présente, en `https://` hors `local` et `ci` (0097 B4-TL-7, dernier tiret) ; `RATE_LIMIT_HMAC_SECRET` présent (le limiteur de `startCheckout` échouerait fermé). `SIMULATED_WEBHOOK_ENABLED` vrai avec `PAYMENT_ADAPTER=stripe` : refus (`forbidden`), pour qu'aucune configuration n'ouvre les deux webhooks.
4. **Aucune clé dans `ServerEnv`** : `parseServerEnv` contrôle présence et forme, mais ne range ni la clé ni le secret dans l'objet rendu (modèle de 0138 § 9 ligne 5a). Ils sont lus **à l'appel** par `src/server/env/payment.ts` (B4c point 7) : `cleStripe(env = process.env, execArgv?)` appelle **d'abord** `verifierSortie` (`src/server/env/egress.ts` l. 257), comme `lireCleOpenRouter` (`src/server/env/ai.ts` l. 17-23) et `cleResend` (0138 § 4), puis relit et recontrôle la forme ; `secretWebhookStripe(env = process.env)` relit et recontrôle `STRIPE_WEBHOOK_SECRET` (pas de barrière de sortie : rien ne sort). Résultats fermés `{ ok: false, code }`, jamais une exception qui porte une valeur. Le commentaire de tête de `payment.ts` (l. 5-11, « Ne lit pas `process.env` ») est corrigé en conséquence ; `cleWebhookSimule` reste inchangé (0097 B4-TL-3 point 5).
5. **Conséquence de la barrière de sortie** (à confirmer par la Sécurité, § 7) : elle n'admet que `VERCEL_ENV` `preview` ou `development` (`egress.ts` l. 23 et l. 289) ; l'API de Stripe n'est donc appelable que sur une préversion Vercel, jamais en `local` ni en `ci` (les tests passent par le double, C1). Or `AUTH_ADAPTER=better-auth` n'est admis qu'en `local` et `ci` (`src/adapters/index.ts` l. 136-139 ; `src/server/env/index.ts` l. 493). **L'essai C6 n'est donc possible qu'après l'ouverture des gardes de `mvp-essai`** (M1h, plan l. 306 ; 0077 § 5.1, 0086 § 2.1) : cela ne bloque pas le code de B4c, seulement C6 (noté pour le CEO, « Questions nouvelles »).

## 4. Amendement de 0020 § 1.3 (origines du prestataire dans `redirectUrl`)

Texte écrit dans 0020 par la PR de B4c (après la fusion de #836, qui modifie aussi 0020, pour éviter un conflit), avec un renvoi en tête de 0020.

Avant (0020 § 1.3, l. 61-62) :
> - En phase 0, `redirectUrl` est un **chemin de l'application** : il commence par `/`, pas par `//` ni `/\`, et il est construit par le module d'adresses du § 5. Raffinement du schéma, testé (`//evil.example`, `/\evil`, `https://…` refusés).
> - La tâche de paiement réel élargira ce raffinement à une liste fermée d'origines du prestataire, par amendement de cette décision ; jamais une adresse libre.

Après :
> - `redirectUrl` est un **chemin de l'application** : il commence par `/`, pas par `//` ni `/\`, et il est construit par le module d'adresses du § 5. Raffinement du schéma, testé (`//evil.example`, `/\evil` refusés). Adaptateurs `mock` et `simulated`.
> - **Amendement B4c (décision 0140 § 4)** : `redirectUrl` peut aussi être une **adresse du prestataire**, seulement si toutes ces conditions tiennent : (1) au plus 2048 caractères, sans espace, caractère de contrôle ni antislash ; (2) `new URL(valeur)` réussit **sans base** ; (3) `protocol` vaut exactement `https:` ; (4) `origin` est **exactement** un élément de la liste fermée `ORIGINES_PRESTATAIRE = ["https://checkout.stripe.com"]` (`src/contracts/billing.ts`), ce qui exclut un port, un sous-domaine, une autre casse résolue autrement et toute autre origine de Stripe ; (5) `username` et `password` vides ; (6) la valeur est rendue **telle quelle** (chemin, requête et fragment de la session compris : l'adresse rendue par Stripe porte un fragment). Aucune autre origine, aucune adresse libre ; ajouter une origine demande un amendement de cette décision. Seul l'adaptateur `stripe` produit une adresse absolue ; il la prend dans la réponse de Stripe (champ `url` de la session), jamais dans la requête. Tests de refus : `https://checkout.stripe.com.evil.example/…`, `https://evil.example/?https://checkout.stripe.com`, `http://checkout.stripe.com/…`, `https://checkout.stripe.com:444/…`, `https://user@checkout.stripe.com/…`, `https://dashboard.stripe.com/…`, `https://CHECKOUT.stripe.com` accepté seulement si l'origine analysée est exactement celle de la liste, `//checkout.stripe.com/…`, `javascript:…`, une adresse de 2049 caractères ; acceptés : `https://checkout.stripe.com/c/pay/cs_test_…#…` et les chemins actuels.

Le commentaire de `src/contracts/billing.ts` l. 61-66 suit. Côté navigateur, `OfferScreen` appelle `router.push(redirectUrl)` (`src/features/presentation/OfferScreen.tsx` l. 166) ; le routeur de Next traite une adresse externe par une navigation complète. B4c le vérifie par un test de `OfferScreen` avec une adresse absolue valide (appel reçu tel quel) ; si la navigation n'est pas complète, B4c remplace l'appel par `window.location.assign` pour une adresse absolue seulement, sans changement de texte ni de rendu, et le signale (modification de `src/features`, hors du seul backend).

## 5. Création de la session Stripe (adaptateur `stripe`, B4c point 2)

Précisions techniques nécessaires aux critères C1, C5 et A15 sur `stripe` :
1. **Adaptateur** `src/adapters/stripe-payment.ts` (fabrique `createStripePaymentAdapter(dépendances)`, sur le modèle de `simulated-payment.ts`) ; il ne connaît que l'interface étroite de § 1.2, injectée : un **double** en test (C1, A22), le client réel par `src/server/payment/composition-stripe.ts` (seul appelant de `cleStripe` hors tests), branché comme le simulé par B4b (`src/adapters/simulated-payment-instance.ts` et `src/instrumentation.ts` sur la branche de #836). `getPaymentAdapter()` accepte `stripe` (fin du « non implémenté » de `src/adapters/index.ts` l. 163-164) ; `paymentAvailable()` gagne une branche `stripe` sur le modèle de B4-TL-14 (jamais vrai si `isProductionDeployment`), amendement de 0020 § 2.3 écrit par B4c ; `getPaymentSimulator()` rend `null` pour `stripe`.
2. **La ligne `checkouts` est validée avant l'appel à Stripe** (B4c point 2) : B4c sépare la transaction de `createCheckout` (`paiements.ts` l. 189-216) en trois temps : (a) transaction d'insertion validée ; (b) appel à Stripe **hors transaction** ; (c) transaction courte `UPDATE checkouts SET stripe_checkout_session_id = $1 WHERE id = $2 AND stripe_checkout_session_id IS NULL` (écrit une seule fois). Le chemin simulé garde la même forme (pas deux chemins), ses tests restant verts.
3. **Idempotence vers Stripe** : clé d'idempotence `checkout:<uuid interne du paiement>`, pour qu'une reprise après une panne entre (a) et (c) recrée la **même** session. Reprise par le même `requestId` : session absente → appel (b) avec la même clé puis (c), au lieu du `provider_error` actuel (l. 196) ; session présente → `adresseSession(id)` (lecture de la session pour son `url`, aucune migration), puis `redirectUrl`. Session expirée ou sans `url` : `provider_error` (`retryable: false`), l'écran propose un nouveau paiement (comportement F9 existant).
4. **Paramètres** (C5) : `mode: "payment"` ; un `line_items` en `price_data` (`currency` en minuscules et `unit_amount` = instantané de la ligne, nom du produit constant sans donnée de la personne), `quantity: 1` ; `payment_method_types` = les moyens de l'offre (`src/server/config/offer.ts` l. 21 : `twint`, `card` ; TWINT n'accepte que le CHF, documentation) ; `metadata.checkoutId` = l'`uuid` interne (contrôle `checkout_mismatch`, `webhook.ts` l. 58) ; `client_reference_id` absent ; ni `customer`, ni `customer_email` ; `success_url` et `cancel_url` construits depuis `APP_URL` par le module d'adresses (B4c point 3, C2) ; **`expires_at` = création de la ligne + 30 min + 120 s**. Raison de la marge : la documentation fixe le minimum à 30 min **après la création de la session chez Stripe** (« anywhere from 30 minutes to 24 hours after Checkout Session creation »), qui suit la création de la ligne ; sans marge, l'appel serait refusé. La durée de vie affichée reste 30 min (B4-PO-4 inchangée) ; un paiement encaissé dans les 120 s de marge suit A14 (`paid_after_failure`, droit accordé). Proposition au Product Owner, sans changement de B4-PO-4 (§ 10).
5. Aucune donnée de la personne n'est lue de l'événement (déjà la règle d’`evenement.ts` l. 8-9) ni journalisée.

## 6. Lignes de confinement attendues de B4c (point 7) — verdict Sécurité à la revue

`tests/unit/confinement/` (régime P0c). Formes à recopier par B4c, noms de fichiers ceux de § 1.2 et § 5. Toute autre ligne que `pnpm test` relèverait est ajoutée avec son motif, signalée dans la PR de B4c et jugée à sa revue.

| # | Fichier du régime | Forme exacte proposée | Verdict |
|---|---|---|---|
| 1 | `listes/paquets.ts` | `{ paquet: "stripe", usage: "SDK de Stripe en mode test (B4c, décision 0140 § 1) : création de la session Checkout et vérification de signature du webhook Stripe, importé par src/server/payment/stripe.ts seulement ; module à capacité", verdict: "B4c (décision 0140 § 1.1 et § 6) ; verdict Sécurité à rendre dans la PR, qui cite le lockfile : version exacte 23.0.0, intégrité sha512-MDE2A5ZVVluYURORaZEVghSmnLJc3w6aHAlZSxDQMsOjOb3V0O6ro/CiaeFlJS4N7uIVmsg98ocRsPmUK6YfyA==, aucune dépendance, aucun script d'installation, hors de onlyBuiltDependencies" }` | à rendre |
| 2A | `donnees/refus.json`, `paquetsCapacite` (si § 7 option A) | ajouter `"stripe"` | à rendre (§ 7) |
| 3A | `listes/capacites.ts` (option A) | `{ fichier: "src/server/payment/stripe.ts", portee: "application", usage: "client Stripe en mode test (B4c) : création de session Checkout (appel HTTPS à l'API de Stripe, clé lue par cleStripe après la barrière de sortie, délai court, télémétrie coupée) et vérification de signature (constructEvent, tolérance 300 s). Justification côté serveur : module server-only, importé hors des tests par composition-stripe.ts et stripe-webhook.ts seulement (ligne 9)", capacites: [{ capacite: "module:stripe", formes: ["default"], nombre: 1 }], ecart: "module à capacité réseau de B4c (décision 0140 § 1.2) : verdict Sécurité à rendre" }` et `{ fichier: "tests/support/stripe-evenements.ts", portee: "test", usage: "signature d'événements de test par la fonction de test de la bibliothèque (critère C3) ; aucun client, aucun appel réseau", capacites: [{ capacite: "module:stripe", formes: ["default"], nombre: 1 }], ecart: "B4c (0140 § 9) : verdict Sécurité à rendre" }` | à rendre |
| 3B | `listes/specificateurs.ts` (si § 7 option B) | `{ specificateur: "stripe", zones: ["src/server/payment/stripe.ts", "tests/support/stripe-evenements.ts"], sousChemins: "exacts" }` ; aucun sous-chemin (le paquet n'en exporte pas) | à rendre |
| 4 | `donnees/lectures-env-secretes.json` | nouvelle ligne `{ "fichier": "src/server/env/payment.ts", "noms": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"], "motif": "B4c (décision 0140 § 3 point 4) : lecture à l'appel par cleStripe (après verifierSortie) et secretWebhookStripe, forme refaite, valeurs jamais rendues hors du résultat fermé, copiées dans ServerEnv, journalisées ni jointes à une erreur ; verdict Sécurité à rendre" }` | à rendre |
| 5 | `donnees/lectures-env-secretes.json`, ligne existante de `src/server/env/index.ts` (l. 51-58 du fichier de données) | ajouter `"STRIPE_SECRET_KEY"` et `"STRIPE_WEBHOOK_SECRET"` à `noms` ; motif complété : « B4c (0140 § 3) : présence et forme quand PAYMENT_ADAPTER=stripe, jamais un champ de ServerEnv » | à rendre |
| 6 | `listes/process.ts`, `ENV_ENTIER` | `{ fichier: "src/server/env/payment.ts", formes: ["defaut:cleStripe", "defaut:secretWebhookStripe", "argument:verifierSortie"] }`, commentaire « B4c, décision 0140 § 3 : environnement lu à l'appel, passé entier à la barrière de sortie » (modèle : `src/server/env/ai.ts`, l. 314 de `process.ts`) | à rendre |
| 7 | `donnees/lignes-textes.json`, formes `secret:` | **aucune attendue** : hors de `src/server/env/`, `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` ne s'écrivent qu'en clés d'objet (comme `eslint-rules/route-handlers.mjs` l. 23, `src/server/log.ts` l. 285-287, `NOM` de `tests/unit/server/env.test.ts` l. 32) ; tout texte qui les contiendrait demande une ligne `{ "fichier": …, "portee": …, "usage": …, "capacites": [{ "capacite": "secret:STRIPE_WEBHOOK_SECRET", "formes": ["<texte exact>"] }], "ecart": "B4c (0140 § 6) ; verdict Sécurité à rendre" }` | à rendre |
| 8 | `donnees/refus.json`, `hotes` | proposition : ajouter `"stripe.com"` (couvre `checkout.stripe.com` et `api.stripe.com`, modèle `resend.com` de 0138 § 9 ligne 1) ; **pas** de fragment `stripe` (texte légitime : colonnes `stripe_event_id`, `ENTETE_SIGNATURE`, choix `stripe`). Conséquence : `{ "fichier": "src/contracts/billing.ts", "portee": "application", "usage": "liste fermée des origines du prestataire admises dans redirectUrl (0020 § 1.3 amendé par 0140 § 4) ; aucun appel", "capacites": [{ "capacite": "hote:checkout.stripe.com", "formes": ["https://checkout.stripe.com"], "nombre": 1 }], "ecart": "B4c (0140 § 4) ; verdict Sécurité à rendre" }` ; les tests importent la constante, ou ont chacun leur ligne `portee: "test"` avec le nombre exact | à rendre |
| 9 | `tests/unit/confinement/depot.test.ts` | deux tests sur le modèle de ceux de `nodemailer` et de 0138 § 9 ligne 7b : hors des tests, `src/server/payment/stripe.ts` n'a que deux importateurs (`composition-stripe.ts`, `stripe-webhook.ts`) ; hors des tests, `cleStripe(` n'est appelé que par `composition-stripe.ts` | à rendre |
| 10 | `eslint-rules/server-env-imports.mjs` | entrée `payment` (l. 58) : ajouter `src/server/payment/composition-stripe.ts` et `src/server/routes/stripe-webhook.ts` ; entrée `index` (l. 47-56) : ces deux mêmes fichiers (ils lisent `serverEnv()`) ; tests dans `tests/unit/lint/server-env-imports-lint.test.ts` | à rendre |
| 11 | `eslint-rules/route-handlers.mjs` | § 1.3 (b) : `stripe` refusé dans tout `src/server/actions/**` ; cas de test déplacé | à rendre |

Les lignes des noms secrets du webhook simulé (B4a) ne changent pas.

## 7. Classement de `stripe` parmi les paquets à capacité (question 6) — la Sécurité tranche

- **Option A (proposée par le Tech Lead)** : `stripe` entre dans `paquetsCapacite` (§ 6 lignes 2A et 3A). Raison : son client ouvre des connexions HTTPS vers l'API de Stripe avec une clé secrète, comme `ai`, `undici` et `pg` déjà classés (`donnees/refus.json` l. 43-50) ; le classement impose une ligne `module:stripe` par fichier importateur, avec usage, nombre et verdict, et fait échouer tout nouvel importateur, ce qui tient § 1.2 par le régime et pas seulement par le lint.
- **Option B** : non classé, confiné par spécificateurs **exacts** (§ 6 ligne 3B), sur le modèle de `nodemailer` (`listes/specificateurs.ts` l. 116-118), qui a une capacité réseau sans être dans `paquetsCapacite`.
- Dans les deux cas : la barrière de sortie s'applique à la clé (§ 3 point 4), le test du dépôt (ligne 9) borne les importateurs, et aucun test n'appelle le réseau (A22 étendu : le double remplace le client ; `fetch`, `http` et `https` espionnés).
- Demandé aussi à la Sécurité : confirmer que la barrière de sortie doit s'appliquer à `cleStripe` (§ 3 point 5) malgré sa conséquence sur l'essai en `local`, et dire si la vérification de signature (§ 2.3) doit, comme proposé, se faire sans clé d'API.

## 8. Critère C7 : le webhook Stripe refuse un identifiant simulé

1. `formeStripe(eventId, sessionId)` dans `src/server/payment/formes.ts` : vrai seulement si `eventId` correspond à `^evt_[A-Za-z0-9]{1,255}$` **et n'a pas** la forme simulée (`EVENEMENT_SIMULE`, l. 15), et si `sessionId` (s'il est présent) correspond à `^cs_test_[A-Za-z0-9]{1,255}$` **et n'a pas** la forme simulée (`SESSION_SIMULEE`, l. 14). La forme d'événement est celle déjà admise par le journal (`src/server/log.ts` l. 624) ; `cs_test_` seulement : une session `cs_live_` n'a rien à faire en mode test (elle échouerait aussi à `livemode`). Les deux exclusions explicites rendent le refus indépendant des motifs (un `evt_sim_…` ne passe jamais `formeStripe`, même si un motif s'élargit) ; test de réciprocité : aucun identifiant n'est admis à la fois par `formeSimulee` et `formeStripe`.
2. Traitement : celui de A17 inversé, par le même code : événement correctement signé pour la route Stripe, identifiant d'événement ou de session simulé → `provider_mismatch` (`webhook.ts` l. 55) : ligne `billing` `rejected` avec ce code et une alerte si la session est connue ; sinon traitement d'une session inconnue (A9, `unknown_checkout`, aucune écriture) ; réponse `200` ; aucun droit. Pas de colonne `provider` (0097 B4-TL-10 point 2).
3. Test C7, deux cas au moins (`pnpm test:db`) : (a) `checkouts` posée par le test avec une session `cs_sim_…`, événement `checkout.session.completed` payé, signé pour la route Stripe, `id` `evt_…` valide → `rejected`/`provider_mismatch`, aucun droit, `200` ; (b) même session, `id` `evt_sim_…` → même résultat ; (c) session `cs_test_…` connue, `id` `evt_sim_…` → `provider_mismatch` ; (d) session simulée inconnue → aucune ligne, alerte `unknown_checkout`, `200`.

## 9. Tests attendus de B4c (noms)

En plus de C1 à C7 de la spécification, chacun nommé dans la PR :
- **C1** `adaptateurs: stripe passe la suite de contrat paiement` (`tests/support/payment-contract.ts`, 0097 B4-TL-9) avec le double du client ; aucun appel réseau.
- **C2** `paiement: adresses de retour construites depuis APP_URL` (`Host` et `X-Forwarded-Host` forgés).
- **C3** `paiement (stripe): signature invalide refusée sans écriture` (A2), `paiement (stripe): horodatage hors tolérance refusé` (A3, passé seulement : −301 s refusé, −299 s accepté), `paiement (stripe): contrôles incohérents n'accordent rien` (A6, dont `livemode = true` → `rejected`/`livemode`), `paiement (stripe): une panne entre l'enregistrement et le droit ne perd pas le paiement` (A7), `paiement (stripe): session inconnue` (A9), `paiement (stripe): second paiement` (A11), `paiement (stripe): un événement rejoué ne crédite pas deux fois` (A1) ; événements signés par `tests/support/stripe-evenements.ts` ; clé au préfixe de production → refus de démarrer (rappel `env.test.ts` l. 316-327).
- **C4** `contrats: redirectUrl n'admet que l'origine de la liste fermée` (cas du § 4).
- **C5** `paiement: paramètres de la session Stripe` (§ 5 point 4 sur le double : montant, devise, moyens, métadonnée, ni e-mail ni client, `expires_at` = création + 1920 s, clé d'idempotence).
- **C7** `paiement: le webhook Stripe refuse un identifiant simulé` (§ 8 point 3) et `paiement: formes simulée et Stripe disjointes`.
- **T1** `paiement: webhook Stripe fermé hors PAYMENT_ADAPTER=stripe` (`404` pour les sept méthodes, sans lecture du corps ni du secret ; configuration invalide = `404` et ligne `payment.webhook_config_invalid`).
- **T2** `paiement: réponses du webhook Stripe` (A24 rejoué : `405`, `413` sans vérification, `400` type de média, `400` en-tête absent ou de plus de 512 caractères sans appel à `constructEvent`, corps signé illisible ; corps constants).
- **T3** `paiement: constructEvent accepte une signature de signer` (test croisé de 0097 B4-TL-2 point 4, clé construite en octets ASCII 0x21-0x7e, chaîne et octets égaux).
- **T4** `paiement: tolérance de la vérification Stripe` (300 s passée explicitement ; constat du comportement de 23.0.0 sur un horodatage futur, écrit dans le test).
- **T5** `paiement: aucune donnée de l'erreur de vérification Stripe n'est journalisée` (A19 étendu : sortie capturée pendant T2 et C3 ; ni en-tête, ni corps, ni secret).
- **T6** `paiement: la ligne checkouts précède l'appel à Stripe` (panne injectée après l'appel au double et avant l'écriture de la session ; reprise par le même `requestId` → même clé d'idempotence, une seule session écrite ; A15 sur `stripe`).
- **T7** `env: gardes de configuration` étendu (§ 3 points 1 à 3) et `env: clés Stripe lues à l'appel après la barrière de sortie` (`cleStripe` refuse hors préversion, sans valeur dans le résultat).
- **T8** `paymentAvailable()` et `getTripReader()` pour `stripe` (lignes ajoutées à `tests/unit/payment-guard.test.ts` et aux tests de l'index des adaptateurs, sans retirer de ligne).
- **Lint et confinement** : `tests/unit/lint/route-handlers-lint.test.ts` (§ 1.3 b et route Stripe), `tests/unit/lint/server-env-imports-lint.test.ts` (§ 6 ligne 10), suite `tests/unit/confinement/` verte avec les lignes du § 6 ; A10 et A24 du simulé verts sur la fabrique commune.

## 10. Écarts à la spécification B4 (corrections appliquées par la PR de B4c)

- **B4c point 1** : `stripe` importé par `src/server/payment/stripe.ts` seulement, et plus dans `src/server/actions/paiement.ts` (§ 1.2, § 1.3 b).
- **B4c point 5** : remboursement et litige restent en alerte seule, sans ligne `billing`, jusqu'à Q129 (§ 2.4).
- **B4c point 7** : « zone étendue à `src/server/actions/paiement.ts` » est retiré (§ 1.2) ; les deux noms secrets sont lus dans `src/server/env/payment.ts` **et** contrôlés en présence et forme dans `src/server/env/index.ts` (§ 6 lignes 4 et 5).
- **B4-PO-4** : `expires_at` = création + 30 min + 120 s (§ 5 point 4 ; minimum de Stripe vérifié). La durée de vie affichée et le calcul de `expired` restent à 30 min : proposition au Product Owner, qui peut la refuser dans la revue de B4c.
- **C3** : A3 rejoué sur le passé seulement (§ 2.3 point 2).

## 11. Ce que la revue de la Sécurité doit rendre sur cette PR

Verdict sur chaque ligne du § 6 (forme, à confirmer au head de la PR de B4c) ; choix A ou B du § 7 ; application de la barrière de sortie à `cleStripe` et vérification sans clé d'API (§ 7, dernier point) ; non-adoption de la liste d'adresses IP de Stripe en mode test (§ 2.3 point 6) ; absence de garde contre un horodatage futur sur la route Stripe (§ 2.3 point 2).

## Questions nouvelles (2026-10-28, à reporter par le CEO dans `QUESTIONS.md`)

1. **Samuel** (complète Q353 et S5) — La préversion `mvp-essai` est-elle protégée par la protection des déploiements de Vercel ? Si oui, Stripe recevra une réponse `401` sur `/api/v1/webhooks/stripe` et l'essai C6 échouera : il faut soit un jeton de contournement pour l'automatisation dans l'adresse déclarée chez Stripe, soit lever la protection sur cette route (réglages de compte Vercel). Bloque C6, pas le code de B4c.
2. **CEO** — L'essai C6 demande `AUTH_ADAPTER=better-auth` sur la préversion, aujourd'hui refusé hors `local` et `ci` (§ 3 point 5) : C6 suit donc l'ouverture des gardes de `mvp-essai` (M1h) en plus de S5. Ordre à refléter dans le plan (S5 et C6 après M1h). Ne bloque pas B4c.
3. **Product Owner** — Marge de 120 s sur `expires_at` (§ 5 point 4, § 10) : accord ou autre forme dans la revue de B4c.

## Décisions attendues de Samuel (non tranchées ici)

1. **Q26** : ouvrir le compte Stripe suisse en **mode test** et y activer TWINT (plan, S5). Noté de la documentation de TWINT : la capacité TWINT reste `pending` tant que les exigences d'inscription de TWINT ne sont pas vérifiées, dont un site joignable **non protégé par mot de passe** et des mentions légales (nom, adresse, contact) ; cela peut retarder le paiement de test par TWINT (le paiement par carte n'en dépend pas).
2. **Q353** : environnement de l'essai (le plan propose la préversion `mvp-essai`) ; qui pose `STRIPE_SECRET_KEY` (`sk_test_…` ou `rk_test_…`) et `STRIPE_WEBHOOK_SECRET` (`whsec_…`) dans Vercel, sans jamais afficher de valeur ; déclaration du point de terminaison chez Stripe.
3. **S5** (à faire quand B4c est fusionnée) : déclarer le point de terminaison `https://<adresse de mvp-essai>/api/v1/webhooks/stripe` (adresse donnée par le CEO) en charge utile **« Snapshot »** (le tableau de bord recommande « Thin », que le webhook ne lit pas), avec la **version d'API notée par B4c** (§ 1.1 point 3), et seulement les types `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` (et, si Samuel le souhaite pour les alertes, `charge.refunded`, `charge.dispute.created`) ; question 1 ci-dessus sur la protection de la préversion.
4. **Q129** : effet d'un remboursement sur le droit (et donc l'enregistrement des remboursements, § 2.4).
5. Mode réel, clés de production, liste d'adresses IP, mise en production : hors de B4c.

## Conséquences

- B4c peut être codée et testée sans compte ni clé, sur le double du client et des événements signés de test ; seule C6 attend Q26, Q353, S5 et M1h.
- B4c ajoute `stripe` 23.0.0 (0006 amendée, § 1.3), `src/server/payment/stripe.ts`, `composition-stripe.ts`, `src/adapters/stripe-payment.ts`, `src/server/routes/stripe-webhook.ts`, `webhook-commun.ts`, la route, `formeStripe`, les gardes de § 3, l'amendement de 0020 § 1.3 (§ 4) et § 2.3 (branche `stripe` de `paymentAvailable`), et les lignes du § 6 avec le verdict de la Sécurité.
- `createCheckout` est découpé en trois temps (§ 5 point 2) pour les deux adaptateurs serveur.
- Un cas de `tests/unit/lint/route-handlers-lint.test.ts` change d'attendu (§ 1.3 b), par cette décision.
- La note de version suivante liste cette décision.

## Quand revoir

Si la Sécurité choisit l'option B du § 7 ou refuse la barrière de sortie sur `cleStripe` ; si 23.0.0 ne permet pas la vérification sans clé d'API ou l'injection d'horloge prévues (§ 1.2, § 9 T4) ; si `constructEvent` et la vérification maison divergent (test croisé T3) ; si Stripe désactive le point de terminaison de test après des échecs (règle non lue dans la documentation consultée) ; si Q129 demande l'enregistrement des remboursements (migration `payment_intent` ou appel à l'API, § 2.4) ; avant tout mode réel (liste d'adresses IP, refus de production levé, garde de l'horodatage futur, origines de `redirectUrl`).

## Sources

- Registre npm, `stripe` : `npm view stripe dist-tags --json`, `npm view stripe time --json`, `npm view stripe@23.0.0 …` (2026-10-28).
- Documentation de Stripe, lue le 2026-10-28 : https://docs.stripe.com/webhooks (signature, `t=` et `v1=`, HMAC-SHA-256, tolérance de 5 minutes, valeur `0` interdite, corps brut, relivraisons de test et de réel, `3xx` en échec, doublons, ordre, version d'API des événements) ; https://docs.stripe.com/webhooks/signature (page « Manage webhook endpoints » : secrets `whsec_`, rotation, `2xx` sur un doublon) ; https://docs.stripe.com/api/checkout/sessions/create (`expires_at` de 30 minutes à 24 heures, `url`, `client_reference_id`, `metadata`, `success_url`, `cancel_url`) ; https://docs.stripe.com/payments/twint (CHF seulement, notification immédiate, exigences d'inscription, remboursements et litiges).
