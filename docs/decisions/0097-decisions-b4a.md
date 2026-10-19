# 0097 — Décisions du Tech Lead pour B4a (B4-TL-1 à B4-TL-11 et B4-TL-13) ; B4-TL-12 rappelée

Statut : décision déléguée (architecture, bibliothèques, outillage et tests : « Qui décide quoi » de `docs/CONTEXT.md`), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; **définitive dès sa fusion**, sans délai de veto (décision 0093 § 1). Trois points demandent en plus l'avis de la Sécurité, rendu dans la revue de cette PR puis dans celle de B4a : **B4-TL-3** (une action fait signer un événement), **B4-TL-6** (limites) et les **lignes de confinement** de B4a (point 9 de la spécification). Rien ici n'engage d'argent, de compte externe ni de données personnelles hors UE.

Date : 2026-10-19 · Décideur : Tech Lead · Ticket : #531 · Spécification `specs/B4-paiement-simule.md` (« Propositions au Tech Lead et à la Sécurité », question 3 de ses « Questions ouvertes ») · Débloque : B4a (0078 § 2 et § 4 ; Q352)

Numérotation (relue le 2026-10-19 sur `origin/main` `08901cd`) : `main` porte 0001 à 0095 ; 0096 est réservé par la PR ouverte #525 ; aucune autre PR ouverte n'ajoute de fichier sous `docs/decisions/`.

## Contexte

Les propositions B4-TL-1 à B4-TL-13 n'étaient écrites nulle part. Seule B4-TL-12 est tranchée, par 0081 (B9-TL-12 point 2, option B). Samuel veut que l'application fonctionne de bout en bout au plus vite pour la tester (0093) ; cette décision retient donc, pour chaque point, la proposition de la spécification, sauf quand elle ajoute un travail sans gain (écart signalé ci-dessous). Faits relevés sur `main` `08901cd` qui comptent :

- le module d'environnement est `src/server/env/index.ts` (0050 P3 ; 0078 § « Lecture du module d'environnement »), il connaît déjà `APP_URL`, `SIMULATED_WEBHOOK_ENABLED`, `SIMULATED_WEBHOOK_SECRET` (noms, refus en `production`) et la garde de préfixe des clés `STRIPE_*` ; `withOrg`, `src/server/log.ts` et le limiteur (`src/server/rate-limit.ts`, `src/server/config/limites.ts`) sont fusionnés (B3a, B3b) ;
- le paquet `stripe` n'est pas dans `package.json` ;
- `checkouts.id` est un `uuid`, `billing.checkout_id` un `uuid` sans clé étrangère, `billing.outcome_code` un `text` sans `CHECK` (`db/schema/business.ts`) ;
- le limiteur n'a que deux espèces de règle, par adresse IP et par adresse e-mail (`RateLimitKind`) : il n'existe pas de limite « par personne » ;
- le job `db` de `ci.yml` lance déjà un projet Playwright (`auth`, `E2E_AUTH_SERVER=1`) dont les secrets sont tirés par `playwright.config.ts`.

## Décisions

### B4-TL-1 — Identifiant de paiement : l'`uuid` encodé en base64url, sans migration (écart avec la proposition)
1. `CheckoutStatus.checkoutId` (22 caractères, `CHECKOUT_ID_PATTERN`) est l'**`uuid` de `checkouts.id` encodé en base64url** (16 octets, 22 caractères, sans remplissage). Aucune colonne `public_id`, aucune migration, aucun changement de `db/`.
2. Le module `src/server/payment/identifiant.ts` expose deux fonctions pures : uuid vers identifiant public ; identifiant public vers uuid, qui **décode puis ré-encode et compare** (refus de toute forme non canonique, le dernier caractère n'ayant que 4 bits utiles) et rend `null` sinon. Toute entrée du navigateur passe par la seconde ; un identifiant non canonique est `not_found`, comme un inconnu.
3. Les métadonnées du prestataire, `PaymentEvent.checkoutId` et `billing.checkout_id` portent l'**`uuid` interne**, jamais l'identifiant public.
4. **Pourquoi l'écart** : la colonne `public_id` de la proposition ne gagne que 6 bits d'entropie (128 contre 122). L'identifiant n'est jamais une preuve d'accès : la lecture est réservée à la personne qui a commencé le paiement, sous RLS (B4-PO-7). Une migration en plus coûterait un verdict Sécurité sur `db/`, un test de migration et un index unique, pour rien.
5. **Amendement de 0020 § 1.3** : « 128 bits aléatoires » se lit « au moins 122 bits aléatoires » ; le motif `CHECKOUT_ID_PATTERN` ne change pas, l'adaptateur `mock` garde ses 128 bits. Un renvoi est ajouté en tête de 0020 par la PR de B4a.
6. Test : aller-retour sur 1 000 uuid ; refus d'un identifiant de 22 caractères non canonique, de 21 et 23 caractères, et d'un identifiant d'une autre organisation (`not_found`).

### B4-TL-2 — Signature du webhook simulé : vérification maison, pas de paquet `stripe` en B4a (écart avec la proposition)
1. **Le paquet `stripe` n'entre pas en B4a.** La spécification ne l'exige pas (elle donne la vérification maison comme autre option) ; l'ajouter en B4a ajoute un paquet à capacité réseau, une ligne de `listes/paquets.ts`, ses spécificateurs et un verdict Sécurité sur le lockfile, sans rien apporter au chemin simulé. Il entre en **B4c**, avec sa version dans un amendement de 0006 (la ligne `stripe` de 0006 l'annonce) et ses lignes de confinement (B4c point 7).
2. Format identique à Stripe : en-tête `Stripe-Signature: t=<secondes>,v1=<hex>`, HMAC-SHA-256 de `<t>.<corps brut>` avec `SIMULATED_WEBHOOK_SECRET`. Module `src/server/payment/signature.ts` (`node:crypto`, admis hors zone sensible) : `signer(corps, secret, maintenant)` et `verifier(corps, en-tête, secret, maintenant)`. Comparaison par `timingSafeEqual` après contrôle de longueur ; plusieurs valeurs `v1` admises (rotation), tout autre schéma ignoré. Le secret est passé en paramètre (injecté par la fabrique, lu seulement dans `src/server/env/payment.ts`) : jamais de `vi.stubEnv`.
3. **Tolérance de 300 s dans les deux sens** (jamais désactivée). La garde contre un horodatage futur est retenue : elle est peu coûteuse dans du code maison et A3 la teste.
4. **B4c** : la route Stripe vérifie avec `stripe.webhooks.constructEvent` ; la fonction maison reste réservée à la route simulée. Un test de B4c vérifie que `constructEvent` accepte une signature produite par `signer` (même format). Pas de duplication : deux routes, deux secrets, deux préfixes d'identifiants.

### B4-TL-3 — Forme du prestataire simulé (proposition retenue ; avis de la Sécurité demandé)
1. `simulateCheckoutOutcome` appelle, par l'adaptateur `simulated`, `src/server/payment/simulated-provider.ts`, qui construit l'événement (B4-PO-3), le signe (B4-TL-2) et le livre par un **transport injecté** : en application, `POST` HTTP vers `APP_URL` + `/api/v1/webhooks/simulated` ; dans les tests de `pnpm test:db`, appel direct du gestionnaire de `src/server/routes/simulated-webhook.ts` avec une `Request` construite (même corps brut, mêmes en-têtes ; A22).
2. Transport HTTP : chemin fixe, adresse prise dans `APP_URL` validé par `src/server/env` (jamais dans la requête), `redirect: "error"`, délai de 5 s (`AbortSignal.timeout`), aucun cookie, aucun en-tête reçu retransmis ; seul le statut `200` est un succès. Tout autre statut, une erreur réseau ou un dépassement donne `provider_error` (`retryable: true`) et laisse le paiement `pending`.
3. **Garde-fous du pouvoir de faire signer** (à valider par la Sécurité) : le prestataire n'existe que si le webhook simulé est ouvert (même prédicat que la route, B4-TL-7, défini une seule fois dans `src/server/env/payment.ts`) ; il ne signe que pour un paiement `pending`, de la personne connectée, de son organisation, avec le montant et la devise de l'instantané ; il refuse une réussite pour un paiement expiré ; il émet toujours `livemode = false`, un identifiant de session et d'événement simulés (B4-TL-10), et rejoue le même événement pour la même issue (B4-PO-11).
4. **Pourquoi pas un route handler de prestataire à part** (l'autre option) : une route de plus à garder fermée, un formulaire de plus dans `R9-sim`, donc une surface plus large pour le même résultat.
5. Le secret n'est jamais lu hors de `src/server/env/payment.ts` ; `src/server/actions/**` n'importe ni ce module ni `src/server/routes/*` (règle de lint de B4a point 7).

### B4-TL-4 — Concurrence sur un même voyage (proposition retenue)
Dans la transaction unique du webhook, sous `SET LOCAL ROLE vadrouille_webhook`, dans cet ordre : (1) `checkout_organization` puis `app.organization_id` ; (2) **`pg_advisory_xact_lock(hashtextextended('entitlement:' || <trip_id>, 0))`** ; (3) lecture de la ligne `billing` de l'événement : si elle existe, rien n'est écrit et l'issue enregistrée sert à l'étape « suite » ; (4) contrôles du handover § 9 ; (5) lecture du droit ; (6) insertion de `billing` avec son `outcome` ; (7) mise à jour de `checkouts.status` ; (8) insertion du droit (avec `billing_id`) si `granted`. Une session inconnue ne prend aucun verrou et n'écrit rien. Aucun droit de table nouveau (la fonction est exécutable par défaut ; A12 le vérifie avec deux connexions). Le verrou ne sérialise que les événements d'un même voyage ; une collision de hachage ne fait que sérialiser deux voyages. L'unicité de `entitlements` reste le filet : une violation fait annuler la transaction (500, relivraison).

### B4-TL-5 — Emplacement (proposition retenue)
`src/server/payment/` (cas d'usage `createCheckout`, `handlePaymentEvent`, `getCheckoutStatus`, `getEntitlement`, `identifiant.ts`, `signature.ts`, `simulated-provider.ts`, analyse en `PaymentEvent`) ; `src/server/routes/simulated-webhook.ts` (puis `stripe-webhook.ts` en B4c) ; `src/server/env/payment.ts` ; `PaymentEventSchema` dans `src/contracts/billing.ts`, jamais importé par `src/features` ni `src/components` (règle de lint ajoutée par B4a) ; adaptateur `src/adapters/simulated-payment.ts`, fabrique `createSimulatedPaymentAdapter(dépendances)` (base, horloge, prestataire, secret injectés). Les cas d'usage reçoivent leurs dépendances en paramètres : les tests de `pnpm test:db` n'ont besoin ni de serveur ni de variables d'environnement.

### B4-TL-6 — Limites (proposition retenue sur la taille, ajustée sur le limiteur ; avis de la Sécurité demandé)
1. **Corps du webhook** : 64 Kio au plus, `Content-Length` contrôlé puis corps lu en flux et coupé au-delà (413 avant toute vérification de signature) ; `Content-Type: application/json` exigé (sinon 400).
2. **Limiteur des actions** : deux règles de `src/server/config/limites.ts`, espèce **IP** (le limiteur n'a pas de règle « par personne », l'étendre est hors de B4a) : `payment-start` (20 par heure) et `payment-simulate` (60 par heure). Chaque appel est décompté, « Réessayer » comprise, car le limiteur passe avant toute lecture en base. Les seuils sont plus larges que les 10 par heure de la proposition : ces chemins n'existent qu'en local et en CI, et Samuel doit pouvoir enchaîner les essais ; **les seuils réels pour `stripe` restent à Q86** et sont revus en B4c.
3. **Aucun limiteur sur le webhook** : il est fermé hors local et CI, authentifié par sa signature, et une signature fausse coûte un calcul HMAC sans toucher la base.

### B4-TL-7 — Gardes d'environnement (proposition retenue)
Dans `src/server/env/index.ts`, testées dans `env: gardes de configuration` (valeurs en clés d'objet, jamais `vi.stubEnv` d'un nom secret) :
- `PAYMENT_ADAPTER` présent et hors `mock`, `simulated`, `stripe` : refus de démarrer ; absent : comportement actuel de `payment-guard.ts`, inchangé ;
- `SIMULATED_WEBHOOK_ENABLED` vaut `true` (insensible à la casse et aux espaces, comme la garde de B3a) : refusé en `production` **et en `staging`** tant que Q131 n'est pas tranchée ;
- **webhook simulé ouvert** = `SIMULATED_WEBHOOK_ENABLED` vaut exactement `true` (ni `TRUE`, ni `1`, ni ` true`) **et** `PAYMENT_ADAPTER` vaut `simulated` **et** l'environnement serveur est `local` ou `ci` ; sinon la route répond `404` sans refus de démarrer ;
- `PAYMENT_ADAPTER=simulated` refusé sans webhook simulé ouvert, sans `DATA_ADAPTER=api`, sans `AUTH_ADAPTER=better-auth`, sans `APP_URL` ; le secret `SIMULATED_WEBHOOK_SECRET` doit faire au moins 32 octets (mesure de B3-TL-5) quand le webhook est ouvert ;
- `PAYMENT_ADAPTER=stripe` : gardes posées par B4c (clés de test, `APP_URL` en `https://`).
Aucun message ne contient la valeur reçue (déjà la règle du module).

### B4-TL-8 — CI et drapeaux : B4a ne touche pas aux workflows (écart avec la proposition)
1. Tests de base de B4a dans le **job `db` existant** ; le secret est tiré au hasard par la mise en place des tests et passé par injection.
2. **B4a ne modifie aucun fichier de `.github/workflows/`.** La partie « job `docker` » de A10 (404 sans drapeau sur l'image de production ; refus de démarrer avec `-e SIMULATED_WEBHOOK_ENABLED=true`) passe à **B4b**, qui modifie déjà un workflow sous `owner-approved` (0035). Raison : B4a n'attend ainsi pas le libellé de Samuel pour fusionner. Les mêmes comportements sont couverts en B4a par les tests de gardes (refus de démarrer) et par le test du gestionnaire (404 fermé par défaut, A10 sans la partie `docker`).
3. **A26** en B4a : **aucune exception** ; aucun fichier versionné (Dockerfile, `vercel.json`, `.env*`, workflows, compose, `next.config.*`) ne contient `SIMULATED_WEBHOOK_ENABLED` ni `SIMULATED_WEBHOOK_SECRET`. L'exception « ligne `docker run` du job `docker` » entre avec B4b.
4. **B4b** : le scénario de bout en bout tourne dans le projet Playwright du job `db` (le mécanisme `E2E_AUTH_SERVER` de B3c lance déjà l'application par `playwright.config.ts`, ce que la spécification B4b point 4 posait comme condition) ; `playwright.config.ts` pose `SIMULATED_WEBHOOK_ENABLED=true` et un secret tiré par `crypto.randomBytes(32)` seulement si `PAYMENT_ADAPTER=simulated` ; le workflow ne pose que les choix d'adaptateurs. B4b vérifie cette condition à son ticket.

### B4-TL-9 — Suite de contrat commune (proposition retenue, emplacement précisé)
`tests/support/payment-contract.ts` (hors de `src/`, donc jamais dans le paquet de l'application), sur le modèle de `tests/db/auth-contrat.test.ts` : une fonction paramétrée par une fabrique d'adaptateur et par une façon de « livrer » une issue. `mock` : simulateur en mémoire, dans `pnpm test` ; `simulated` : prestataire simulé avec le transport de test de B4-TL-3, dans `pnpm test:db` (nouveau `tests/db/paiement-contrat.test.ts`) ; `stripe` : double du client en B4c. Cas : ceux de A18. Le fichier ne finit pas par `.test.ts` : il n'est exécuté que par ses appelants.

### B4-TL-10 — Identifiants simulés (proposition retenue)
1. Préfixes : session `cs_sim_`, événement `evt_sim_`. Formes : session `^cs_sim_[A-Za-z0-9_-]{22,64}$` (tirage aléatoire de 16 octets ou plus, base64url) ; événement `^evt_sim_[0-9a-f]{32}$`, qui est **déterministe** : les 32 premiers caractères hexadécimaux du SHA-256 de `<uuid du paiement>:<issue>`, pour que rejouer une issue réémette le même événement (B4-PO-11) et qu'une autre issue en donne un autre.
2. Le webhook simulé refuse un identifiant de session ou d'événement sans la bonne forme : ligne `billing` `rejected` avec le code `provider_mismatch` si la session est connue, sinon traitement d'une session inconnue (A17). Le webhook Stripe de B4c refuse l'inverse (C7). Pas de colonne `provider` : aucune migration.

### B4-TL-11 — Réponses des webhooks (proposition retenue ; corps précisés)
`200` pour tout événement vérifié et traité (accordé, déjà accordé, ignoré, refusé par un contrôle, session inconnue) ; `400` pour une signature absente, invalide ou hors tolérance, un type de contenu autre que `application/json`, un corps signé illisible ou non analysable ; `404` webhook fermé ; `405` autre méthode (avec `Allow: POST`) ; `413` corps trop gros ; `500` pour une panne (base indisponible, transaction annulée), pour que le prestataire relivre. Corps **constants** : `200` donne `{"received":true}` ; `400`, `405`, `413`, `500` donnent `{"error":"invalid_request"}`, `{"error":"method_not_allowed"}`, `{"error":"payload_too_large"}`, `{"error":"server_error"}` ; `404` a un corps vide ; toutes les réponses portent `Cache-Control: no-store`. L'identité du `404` fermé avec celui d'une adresse inconnue se limite au **statut** (le corps de la page 404 de Next n'est pas reproduit) : A10 compare les statuts. Échec de la suite : voir B4-TL-12. Test A24.

### B4-TL-12 — Déjà tranchée par 0081 (B9-TL-12 point 2, option B) ; rappel pour B4a
Le webhook répond `200` dès que la transaction du droit est validée, même si la suite échoue. Forme du point d'appel : une fonction unique « voyage débloqué », qui ne reçoit que les identifiants du droit, du voyage et de l'organisation, appelée **hors de la transaction** après sa validation, après `granted` comme après `alreadyGranted`, et aussi pour un événement déjà enregistré `granted` ou `alreadyGranted` (reprise idempotente) ; jamais pour `ignored` ni `rejected`. Elle fait 3 relances internes (démarrages sans appel payant, handover § 8), journalise un échec par son seul code, et ne fait rien jusqu'à B9d. Elle s'exécute dans le contexte système de l'organisation défini par 0081 (B9-TL-12 point 3). **A8 s'écrit ainsi** : suite en échec injecté lors de la première livraison → droit et ligne `granted` validés, réponse `200` ; la livraison suivante du même événement n'écrit rien, rappelle la suite avec le même identifiant de droit et répond `200` ; même cas pour `alreadyGranted`. La reprise par réconciliation est testée par B9d.

### B4-TL-13 — Forme des alertes (proposition retenue, niveau précisé)
1. Une alerte est une ligne du journal de `src/server/log.ts`, événement **`payment.alert`**, niveau **`error`** (le journal n'a pas de niveau `alert` ; en créer un est hors de B4a). Champs, seuls admis, chacun filtré par son motif comme le reste du journal : `eventId` (forme simulée ou `evt_[A-Za-z0-9]{1,255}`), `eventType` (le `type` normalisé de `PaymentEvent`, énumération fermée), `code` (liste ci-dessous), `checkoutId` (`uuid` interne, si connu). Aucun e-mail, nom, adresse IP, corps d'événement, en-tête de signature ni secret (B4-PO-12, A19).
2. Codes : `unknown_checkout`, `livemode`, `payment_status`, `amount_mismatch`, `currency_mismatch`, `session_mismatch`, `checkout_mismatch`, `trip_mismatch`, `provider_mismatch`, `duplicate_payment`, `paid_after_failure`, `refund`, `dispute`. Les codes de contrôle sont aussi ceux de `billing.outcome_code` (colonne `text` sans `CHECK` : pas de migration).
3. Un échec de la suite est l'événement `payment.followup_failed` (niveau `warn`, champ `code` seulement), pas une alerte.
4. Les deux événements et les champs nouveaux entrent dans `LOG_EVENTS` et la liste blanche de `log.ts`, avec leur test.

## Corrections de la spécification et du handover (appliquées par la PR de B4a)
- **A3** : s'ajoute le cas de l'horodatage futur (+301 s refusé, +299 s accepté), la garde étant retenue (B4-TL-2 point 3).
- **A8** : forme de B4-TL-12 ci-dessus. **A10** : sa partie `docker` passe à B4b. **A26** : sans exception en B4a.
- **A21 et B4a point 5** : `src/server/env/index.ts` pour `src/server/env.ts` ; `APP_URL` existe déjà.
- **B4a point 9** : pas de ligne `identifiant:fetch` pour le paquet `stripe` ni de ligne de paquet ; la ligne `identifiant:fetch` du transport reste (B4-TL-3) ; pas de ligne de `ci.yml`.
- **Critère commun** : « aucune dépendance nouvelle hors du paquet `stripe` » se lit « aucune dépendance nouvelle en B4a ».
- **Handover § 9 et § 4** : traiter `async_payment_failed` et `expired` pour le statut seulement (écart 5) ; retirer `payment_failed` de la ligne « 9 Débloquer » et du tableau des états (écart 6).
- La PR de B4a liste ces corrections comme écarts, selon le critère commun de la spécification.

## Ce qui n'est pas tranché ici
- **B4-TL-14** (amendement de 0020 § 2.3 et § 3) : avant B4b seulement.
- **Avis de la Sécurité** (question 6 de la spécification) : B4-TL-3 (pouvoir de faire signer un événement, garde-fous du point 3), B4-TL-6 (limites, seuils par IP, absence de limiteur sur le webhook), forme de la réponse `404`, puis le verdict sur chaque ligne de confinement de B4a dans la revue de sa PR.
- **Samuel** : Q131 (ouvrir le paiement simulé sur une préversion : fermé jusque-là), Q86 (seuils réels du limiteur), Q26 (compte Stripe de test, B4c), Q129 (effet d'un remboursement sur le droit, B4c) ; aucune ne bloque B4a.
- **CEO** : destination des alertes de paiement (question 5 de la spécification), avant B4c.

## Conséquences
- B4a peut être ticketée dès la fusion de cette décision, avec l'avis de la Sécurité sur B4-TL-3 et B4-TL-6 rendu à la revue de cette PR ; la condition « B4-TL-1 à B4-TL-13 écrites » de 0078 § 2 est remplie. Q352 est tranchée côté Tech Lead.
- B4a n'ajoute **aucune dépendance**, **aucune migration** et ne touche pas à `.github/workflows/` : ses lignes de confinement se limitent aux lectures non secrètes de `process.env`, à la lecture de `SIMULATED_WEBHOOK_SECRET` dans `src/server/env/payment.ts`, aux textes de ce nom hors de `src/server/env/` et à `identifiant:fetch` du transport.
- B4c ajoute `stripe` (amendement de 0006), `STRIPE_*` et la vérification par `constructEvent`.
- 0020 § 1.3 reçoit son amendement (B4-TL-1 point 5) par la PR de B4a.

## Quand revoir
Si la Sécurité refuse B4-TL-3 (repli : route de prestataire à part, ou transport direct sans HTTP) ; si le limiteur gagne une règle par personne ; si Q131 ouvre le paiement simulé sur une préversion (B4-TL-7, staging) ; si B4c montre que la vérification maison et `constructEvent` divergent.
