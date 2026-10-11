# 0020 — Décisions du Tech Lead pour F9 (Débloquer, paiement simulé, Programme ajusté)

Statut : décision déléguée, définitive sans veto de Samuel sous 2 jours (avant le 2026-10-11) ; à lister dans la note de version suivante, rubrique « Décisions prises par le studio » · Date : 2026-10-09 · Décideur : Tech Lead (architecture, bibliothèques, outillage, tests ; délégation « Qui décide quoi » de `docs/CONTEXT.md`) · Ticket #78

Numérotation : 0006 à 0012 sont réservés par #26 et #27, 0017 par #65 et 0019 par #72 (en revue). Si l'une d'elles change de numéro, le CEO le signale avant de fusionner cette PR.

## Contexte
Une question déléguée au Tech Lead est ouverte :
- **Q132** (F9-Q7) : propositions F9-TL-1 à F9-TL-11 de `specs/F9-debloquer-programme-ajuste.md` (fusionnée par #73), à trancher avant le code de F9a. Elle comprend le choix entre les formes A et B de F9-TL-3 et, avec la correction 1 de #73, F9-TL-11 (emplacement des actions serveur).
- **Observation de la correction 1 de #73** : les actions serveur de F8 sont prévues par la spécification F8 dans `src/features/creation/actions.ts` et `src/features/compte/actions.ts`, où la règle 4 de la décision 0016 § 3.1 interdit `zod` et les imports de valeur depuis `@/contracts`. Elle est tranchée au § 11.

Le code de F9 est découpé en deux PR (F9-PO-18 ; Q134, tranchée par le CEO) : **F9a** (écran 9, paiement simulé, confirmation, état débloqué) puis **F9b** (écran 10 et session de tri entre les routes, après F7a). Pour chaque décision, la PR qui l'applique est indiquée. Chaque PR ne crée que ce qu'elle utilise.

Cette décision s'appuie sur les décisions 0013, 0015 et 0016, et les amende là où c'est dit (§ 11 : 0016 § 3.1, règle 4). Elle est écrite pour rester cohérente avec deux décisions **en revue**, sans en dépendre :
- **0017** (#65, F8) : emplacement des actions serveur (§ 3.3), contrat d'erreur (§ 4), portée et horloge des simulations (§ 10), garde des environnements (§ 11), règle des modules d'adresses (§ 12). Là où F9 a besoin de la même chose, la présente décision la fixe **dans les mêmes termes** et précise quelle PR la crée si 0017 n'est pas encore appliquée. Si 0017 est amendée avant sa fusion sur l'un de ces points, la décision fusionnée en second s'aligne sur l'autre par un amendement écrit, sur signalement du relecteur.
- **0019** (#72) : sans recouvrement avec F9.

Elle renvoie au handover back-end (#27, en revue : `Offer`, `AdjustmentSummary`, « événement de paiement », table `billing`) sans le présupposer accepté.

Hors de cette décision :
- **Samuel** : mentions avant paiement (Q127), texte et contenu de « Ce qui est inclus » (Q128), remboursement d'un second paiement réel (Q129), logos (Q130), ouverture du paiement simulé sur un déploiement Vercel (Q131), autres entrées « Débloquer » (Q133), règle « un aperçu actif » après déblocage (Q135), compte Stripe et TWINT (Q26), compte PostHog (Q56). Aucune décision ci-dessous ne fixe un prix, le contenu de l'offre, un plafond de remplacements ni un réglage d'environnement externe ;
- **UX/UI** : rendus et textes provisoires (Q126) ;
- **Product Owner** : comportement fonctionnel ;
- **CEO** : ordre des tâches (Q134).

**Aucune nouvelle dépendance** : `crypto.randomBytes` (Node), `zod` 4.6.5 et `zod/mini` sont déjà disponibles ; le paquet `server-only` n'est **pas** ajouté (la frontière serveur est tenue par le lint du § 11). `docs/decisions/0003-versions.md` ne change pas. Aucune de ces décisions n'engage d'argent, de compte externe ni de donnée personnelle hors UE : F9 n'envoie rien hors du processus de l'application.

**Principe « l'agent cherche, l'ancrage vérifie, le moteur planifie »** : F9 ne cherche ni ne planifie rien. Le prix vient de la configuration serveur, le droit « voyage débloqué » n'est accordé que par la confirmation (simulée) du prestataire, et l'ajustement est un jeu précalculé, servi par une fonction pure qui passera dans `src/domain` avec B10, où le moteur le calculera.

## Décisions

### 1. F9-TL-1 — Contrats de paiement (`src/contracts/billing.ts`)
**Retenue, précisée.** `src/contracts/billing.ts`, réexporté par `src/contracts/index.ts`. Tous les objets sont stricts (`z.strictObject`). Les noms suivent le handover back-end (#27, en revue) pour que la tâche de paiement réel les étende sans les renommer. Aucun texte d'interface dans les données.

#### 1.1 Valeurs (`src/contracts/values.ts`, sans `zod`, 0016 § 3.1 règle 1)
- `PRICE_VARIANTS = ["chf_29"] as const` (§ 4) ;
- `CURRENCIES = ["CHF"] as const` ;
- `PAYMENT_METHODS = ["twint", "card"] as const` ;
- `OFFER_INCLUSIONS = ["allDays", "mealsAndEvenings", "events", "replacements", "checklist", "calendarAndSharing", "access"] as const` : la liste **des codes possibles**. Ce que l'offre inclut vraiment est dans la configuration (§ 4) et relève de Samuel (Q128). Le client lit cette liste pour typer la table des textes (`Record<OfferInclusion, string>`), et un test vérifie que `fr.json` a un texte pour chaque code ;
- `CHECKOUT_STATUSES = ["pending", "succeeded", "duplicate", "declined", "cancelled", "expired"] as const` et `CHECKOUT_FAILURES = ["declined", "cancelled", "expired"] as const` ;
- `CHECKOUT_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/` (§ 1.3) ;
- `TRIP_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/`, la règle d'identifiant de 0017 § 1. Si F8a l'a déjà posée sous un autre nom dans `values.ts`, F9a la réutilise sans seconde copie.

Les schémas en dérivent (`PriceVariantSchema = z.enum(PRICE_VARIANTS)`, etc.) : il n'y a pas de seconde copie.

#### 1.2 Offre
- `OfferSchema = { tripId, amount, currency, priceVariant, methods, includes, replacementLimit?, accessDaysAfterReturn }` :
  - `amount` : entier **strictement positif**, en centimes (unité mineure) ;
  - `currency` : `z.enum(CURRENCIES)` ;
  - `methods` : 1 à 2 éléments de `PAYMENT_METHODS`, sans doublon, dans l'ordre d'affichage ;
  - `includes` : 0 à 7 éléments de `OFFER_INCLUSIONS`, sans doublon, dans l'ordre d'affichage ;
  - `replacementLimit` : entier ≥ 0, absent tant que Q88 n'est pas tranchée ;
  - `accessDaysAfterReturn` : entier de 0 à 365.
- **Lecture** : `PaymentAdapter.getOffer(ctx, tripId)` (§ 2), et non `TripAdapter`. L'offre est une donnée commerciale, que le paiement réel tirera du catalogue du prestataire ou de la configuration, pas du voyage ; `TripAdapter` reste un pur accès aux voyages (0013 § 3.6).

#### 1.3 Paiement
- `CheckoutRequestSchema = { tripId, method }`, `tripId` conforme à `TRIP_ID_PATTERN`. Champ inconnu refusé (objet strict) : un `amount` envoyé par le navigateur fait échouer la validation et n'est jamais lu.
- `CheckoutStartSchema = { checkoutId, redirectUrl }`.
  - En phase 0, `redirectUrl` est un **chemin de l'application** : il commence par `/`, pas par `//` ni `/\`, et il est construit par le module d'adresses du § 5. Raffinement du schéma, testé (`//evil.example`, `/\evil`, `https://…` refusés).
  - La tâche de paiement réel élargira ce raffinement à une liste fermée d'origines du prestataire, par amendement de cette décision ; jamais une adresse libre.
- `checkoutId` : identifiant **opaque et aléatoire**, `crypto.randomBytes(16).toString("base64url")` (128 bits, 22 caractères). Il n'est dérivé ni du voyage ni de la personne. `crypto.randomUUID()` n'est pas retenu : 122 bits aléatoires seulement, sous le minimum de la spécification.
- `CheckoutStatusSchema = { checkoutId, tripId, method, status, priceVariant, amount, currency }`. `priceVariant`, `amount` et `currency` sont un instantané pris à la création du paiement : `R9-sim` affiche le montant du paiement en cours, et l'écran envoie `price_variant` sans lire la configuration.
- **Résultats** : le format d'erreur commun de 0017 § 4, `Result<T> = { ok: true; value: T } | { ok: false; error: ApiError }`, avec :
  - `startCheckout` : `Result<CheckoutStart>` ;
  - `simulateCheckoutOutcome` et `getCheckoutStatus` : `Result<CheckoutStatus>`.
- **Codes d'erreur** (ajoutés à `API_ERROR_CODES`, en `snake_case`) :
  - `validation_failed` (et non `invalid_input` : renommage de 0017 § 4, même raison : c'est le nom du handover). La spécification écrit `invalid_input` « code provisoire de F8 » : elle suit donc le renommage, sans changement de texte, de comportement ni de critère ;
  - `not_found` (voyage ou paiement inconnu, d'une autre organisation, ou paiement indisponible, F9-PO-19) ;
  - `already_unlocked` ;
  - `unauthenticated` viendra avec B3 (F9-PO-7), comme pour `createTrip`.
- **L'expiration n'est pas un code d'erreur.** Un paiement resté sans issue au-delà de `checkoutTtlMs` passe à l'état `expired` ; une confirmation reçue ensuite renvoie `{ ok: true; value: { status: "expired", … } }` sans rien accorder. L'écran traite donc refus, annulation et expiration par le même chemin (l'état final), sans cas d'erreur à part. La spécification, qui écrit « sa confirmation est refusée (`expired`) », est satisfaite : la confirmation n'accorde rien et l'état est `expired`.
- **Si 0017 n'est pas encore appliquée** au démarrage de F9a : F9a crée `src/contracts/errors.ts` et `API_ERROR_CODES` dans la forme de 0017 § 4, avec ses seuls codes ; F8a ajoute les siens sans renommer. Les deux PR ne sont jamais dans le même cycle (Q134).
- PR : **F9a**.

### 2. F9-TL-2 — Adaptateur de paiement, simulateur et garde
**Retenue, renforcée** : garde alignée sur 0017 § 11, idempotence par machine d'états.

#### 2.1 Interfaces (`src/adapters/types.ts`)
- `PaymentAdapter`, commun au simulé et au futur réel :
  - `getOffer(ctx, tripId): Promise<Result<Offer>>` ;
  - `createCheckout(ctx, request: CheckoutRequest): Promise<Result<CheckoutStart>>` ;
  - `getCheckoutStatus(ctx, checkoutId): Promise<Result<CheckoutStatus>>` ;
  - `getEntitlement(ctx, tripId): Promise<{ unlocked: boolean }>` : le droit « voyage débloqué » acquis par paiement, lu par la composition du § 3.
- `PaymentSimulator`, **interface séparée**, implémentée seulement par le simulé : `simulateOutcome(ctx, checkoutId, outcome: "succeeded" | "declined" | "cancelled"): Promise<Result<CheckoutStatus>>`. Elle joue le rôle du webhook du prestataire. Pas de méthode facultative sur `PaymentAdapter` : l'adaptateur réel n'a pas à savoir qu'une simulation existe.
- Chaque méthode applique l'isolation par organisation : un voyage ou un paiement d'une autre organisation donne `not_found`, exactement comme un inconnu.

#### 2.2 Implémentation simulée (`src/adapters/mock-payment.ts`)
- Fabrique `createMockPaymentAdapter({ offer, trips, now, store, checkoutTtlMs, confirmationDelayMs })`, qui renvoie un objet implémentant les deux interfaces :
  - `offer` : la configuration du § 4, injectée (jamais importée par le module) ;
  - `trips` : un `TripAdapter` en lecture, pour vérifier l'existence et l'organisation du voyage ;
  - `now` : l'horloge de la portée (§ 6) ; le module n'appelle jamais `Date.now()` (règle de lint de 0017 § 10.1, étendue à ce fichier) ;
  - `store` : l'état de la portée (§ 6).
- Sans réseau, sans écriture disque, sans `console.*`. Chaque sortie est validée par son schéma, comme `mockTripAdapter`.
- **Machine d'états** d'un paiement : `pending` → un seul état final (`succeeded`, `duplicate`, `declined`, `cancelled`, `expired`). C'est elle qui porte l'idempotence demandée par F9-PO-7 :
  - une issue reçue pour un paiement déjà dans un état final ne change rien et renvoie l'état existant. Rejouer la même confirmation n'accorde donc ni second droit ni second `payment_succeeded` ;
  - `succeeded` sur un voyage **déjà débloqué** par un autre paiement donne `duplicate`, sans droit supplémentaire ;
  - la transition et l'écriture du droit se font dans le même bloc synchrone, **sans `await` entre la lecture et l'écriture** : deux appels concurrents dans le même processus ne peuvent pas accorder deux fois ;
  - `createCheckout` sur un voyage débloqué (par les données ou par un droit) renvoie `already_unlocked` sans créer de paiement.
- La proposition « clé d'idempotence par identifiant d'événement » n'est pas retenue pour le simulé : la machine d'états suffit et se teste directement. **La tâche de paiement réel** ajoutera la déduplication par identifiant d'événement du prestataire, en plus de la machine d'états, parce qu'un webhook réel peut arriver plusieurs fois et dans le désordre.
- **Délai et expiration, évalués à la lecture** (horloge de la portée) :
  - `simulateOutcome` enregistre l'issue avec son instant ; avec `confirmationDelayMs` > 0, le paiement reste `pending` jusqu'à `instant + confirmationDelayMs`, puis l'issue s'applique (droit compris) au premier accès qui le constate ;
  - un paiement sans issue enregistrée à `création + checkoutTtlMs` est `expired` ; une issue reçue après ne change rien. Une issue enregistrée avant l'échéance s'applique même si son délai la dépasse (le prestataire a confirmé à temps).
  - L'application différée passe par la même fonction de transition que l'application immédiate : une seule règle.

#### 2.3 Choix et garde (`src/adapters/index.ts`, `src/adapters/payment-guard.ts`)
- **Choix** : variable serveur `PAYMENT_ADAPTER` (sans préfixe `NEXT_PUBLIC_`), normalisée par `adapterChoice` (absente ou vide = `mock`). Valeurs : `mock` ; `stripe` est réservé à la tâche de paiement réel et lève « non implémenté » d'ici là ; toute autre valeur lève une erreur.
- **`paymentDemoAllowed(env)`**, fonction pure, **fermée par défaut**, sur le modèle de 0017 § 11.2 :
  - **toujours faux** si `isProductionDeployment(env)` est vrai (`VADROUILLE_ENV=production`, posé par le `Dockerfile`, ou `VERCEL_ENV=production`), quels que soient `NODE_ENV` et le drapeau ;
  - sinon vrai **seulement** si `NODE_ENV` vaut `development` ou `test`, ou si `VADROUILLE_DEMO_PAYMENT` vaut exactement `1`.
  
  C'est plus strict que la proposition de la spécification (« faux si `mock`, `NODE_ENV=production` et pas de drapeau ») : un drapeau mal posé ne peut ouvrir le paiement simulé ni sur la production Vercel ni sur une image de production. Ouvrir le paiement simulé sur un déploiement de production demande la décision de Samuel (Q131) **puis** un amendement écrit de cette décision ; une variable ne suffit pas.
- **`paymentAvailable(env)`** = `PAYMENT_ADAPTER` vaut `mock` **et** `paymentDemoAllowed(env)` **et** `isMockAdapter(DATA_ADAPTER)`. La dernière condition garantit que `getRequestContext()` ne lèvera pas : sans elle, une page de paiement pourrait répondre 500. C'est la seule fonction que consultent les pages, les actions, `DeckEnd` (par sa page) et la section « Démonstration ».
- **Ordre** : les pages `R9`, `R9-sim`, `R9-retour` et les trois actions consultent `paymentAvailable()` **en premier**, avant toute lecture (contexte, portée, adaptateur), et répondent `notFound()` ou `not_found`.
- **Filets de sécurité** :
  - `getPaymentAdapter()` lève une erreur si `paymentAvailable()` est faux (jamais atteint par une page, testé) ;
  - `getPaymentSimulator()` renvoie `null` si l'adaptateur n'est pas le simulé autorisé, et les actions répondent alors `not_found`.
- `isProductionDeployment(env)` est celui de 0017 § 11.0 (`src/dev/flags.ts`). **Si F8b ne l'a pas encore livré**, F9a le crée dans cette forme, avec `VADROUILLE_ENV=production` dans l'étape d'exécution du `Dockerfile`, et F8b le réutilise. Les deux PR ne sont jamais dans le même cycle.
- **Configuration versionnée** : `VADROUILLE_DEMO_PAYMENT` s'ajoute aux drapeaux que `tests/unit/dev-pages-env.test.ts` (0017 § 11.3) interdit dans `Dockerfile`, `vercel.json`, `.env*` suivis, `.github/workflows/*`, fichiers compose et `next.config.*`. Seul `playwright.config.ts` le pose (`webServer.env`). Si ce test n'existe pas encore, F9a le crée pour ce drapeau.
- **Tests** (`tests/unit/payment-guard.test.ts`) : la table de `paymentDemoAllowed` (`NODE_ENV` absent, vide, inconnu, `production` sans drapeau : faux ; `development`, `test` : vrai ; drapeau `1` : vrai ; `true`, ` 1` : faux ; `VERCEL_ENV=production` ou `VADROUILLE_ENV=production`, avec le drapeau et avec `NODE_ENV=development` : faux) ; `paymentAvailable` faux avec `DATA_ADAPTER=api` ou `PAYMENT_ADAPTER` autre que `mock` ; pages en `notFound()` et actions en `not_found` **sans appel** à l'adaptateur ni à `getRequestContext` (espions).
- PR : **F9a**.

### 3. F9-TL-3 — Vue débloquée du voyage simulé : forme B
**Décision : forme B, composition au-dessus des adaptateurs. La forme A n'est pas retenue.**

- **Raisons** :
  - l'adaptateur `mock` reste un jeu de données pur et sans état (0013 § 3.6) ; ses tests, et ceux de F5, F6 et F7 qui l'utilisent, ne changent pas ;
  - `TripAdapter` n'est pas couplé à `PaymentAdapter` ;
  - la composition n'existe que pour la simulation : avec un back-end réel, `Trip.unlocked` est écrit en base par la confirmation du paiement, et `getTrip` le renvoie tel quel. Elle disparaît alors sans changer les pages ;
  - sans paiement simulé disponible (§ 2.3), elle renvoie l'adaptateur de base, inchangé : l'image de production ne lit aucun droit simulé.
- **Forme** : un décorateur de `TripAdapter`, et non une fonction à part pour `getTrip` seulement, parce que 6b, Séjour, Journée et la carte lisent aussi `getDay`, `listProposals`, `getDayMap` et `getTripMap`.
  - `getTripReader(options?: { scope })`, exporté par `src/adapters`, renvoie un `TripAdapter` :
    - si `paymentAvailable()` est faux, ou si l'adaptateur de paiement n'est pas le simulé : `getTripAdapter()` tel quel ;
    - sinon, `withSimulatedUnlock(base, entitlements, counterpartOf)` (`src/adapters/mock-unlock.ts`).
  - Pour un voyage **non débloqué** dans les données et **débloqué par un droit** de la portée, chaque méthode renvoie le contenu de son **pendant débloqué** (`counterpartOf("mock_trip_edimbourg") = "mock_trip_edimbourg_debloque"`, table exportée par `src/adapters/mock.ts` à côté de `MOCK_DEMO_UNLOCKED_TRIP`), **réétiqueté** sous l'identifiant payé : `Trip.id`, `unlocked: true`, `Proposal.tripId` et `DayMap.tripId`. Toute autre donnée est celle du pendant.
  - La sortie réétiquetée repasse par `TripSchema`, `ProposalSchema`, `DayMapSchema` et `validateDayMap` (0013 § 1.2), comme toute sortie d'adaptateur.
  - Un voyage débloqué sans pendant connu garde son contenu, avec `unlocked: true`.
  - Un voyage débloqué dans les données (`mock_trip_edimbourg_debloque`) n'est jamais modifié.
- **Lecteurs** : les pages `R6`, `R9`, `R10`, `R11`, la Journée, la Fiche étape et le layout `(programme)` lisent par `getTripReader()` au lieu de `getTripAdapter()`. `getTripAdapter()` reste l'accès de base (tests de l'adaptateur, page d'accueil). **Point de revue** : après F9a, aucune page du voyage n'appelle `getTripAdapter()` directement.
- **Aucun état périmé** (critère « aucun cache entre requêtes ») :
  - les pages qui lisent par `getTripReader()` sont dynamiques : la lecture de la portée par `headers()` (0017 § 10.2) suffit à le garantir, et la PR le vérifie dans la sortie de `next build` (aucune de ces routes n'est marquée statique) ;
  - côté client, l'action serveur qui constate le passage à `succeeded` ou `duplicate` (`simulateCheckoutOutcome`, ou `getCheckoutStatus` quand le délai expire) appelle `revalidatePath(<adresse du voyage>, "layout")`, ce qui invalide le cache du routeur client pour le voyage. Le test e2e `debloquer: aucun état périmé après le paiement` le vérifie par `Link` et par le retour du navigateur. S'il échoue sur le retour du navigateur, `PaymentReturn` ajoute `router.refresh()` avant `router.replace` ; c'est le seul complément autorisé sans amendement.
- **Tests** : identifiants de propositions et d'étapes des deux voyages disjoints (déjà exigé) ; réétiquetage (aucun `mock_trip_edimbourg_debloque` dans la sortie, `validateDayMap` vide) ; isolation de deux portées ; sans paiement disponible, `getTripReader()` est l'adaptateur de base (identité).
- **Positions du voyage débloqué** : elles dépendent de T6 (0017 § 13). Avant T6, `getDayMap` du pendant renvoie `null` et l'écran garde l'état de remplacement ; aucun critère de F9 ne porte sur la carte.
- PR : **F9a**.

### 4. F9-TL-4 — Source unique du prix
**Retenue, précisée sur l'emplacement de la configuration.**

- **Codes** : `PRICE_VARIANTS` dans `@/contracts/values` (§ 1.1), d'où dérivent `PriceVariantSchema` (`billing.ts`) et `price_variant` dans `src/analytics/events.ts`. Ajouter un code est un changement de contrat, qui suit une décision de prix de Samuel.
- **Configuration** : `src/server/config/offer.ts`, et non `src/config/offer.ts`.
  - Raison : `src/config/site.ts` est lu par le client (`PRODUCT_NAME`) ; un module serveur dans le même dossier ne se distinguerait que par son nom. Sous `src/server/`, la règle du § 11 interdit son import depuis `src/components`, `src/features`, `src/app` et `src/lib` (seul `@/server/actions/*` y est permis) : « jamais importé par du code client » est vérifié par le lint, sans dépendance `server-only`.
  - Contenu : `{ amount: 2900, currency: "CHF", priceVariant: "chf_29", methods: ["twint", "card"], includes: [les 7 codes de la spécification, dans son ordre], accessDaysAfterReturn: 30 }`, sans `replacementLimit` (Q88). Validé au chargement par un schéma strict `OfferConfigSchema` (l'`Offer` sans `tripId`), avec son test. **Ces valeurs sont des reprises** (Q2 pour le prix ; cadrage § 4 pour l'inclus et la durée, en attente de Samuel, Q128) : le Tech Lead n'en fixe aucune.
- **Point d'injection** : `getPaymentAdapter()` passe `src/server/config/offer.ts` à `createMockPaymentAdapter` ; les tests passent leur propre configuration (`amount: 3900`, `replacementLimit: 10`, offre sans `calendarAndSharing`).
- **Balayage** : un test vérifie qu'aucun fichier de `src/features`, `src/components`, `src/analytics` ni `src/i18n/fr.json` ne contient `2900` ni « 29 CHF » (espace normale ou insécable), **fichiers `*.test.*` exclus**.
- PR : **F9a**.

### 5. F9-TL-5 — Routes et suivi
**Retenue, précisée.**

- **Routes** : `R9-sim` = `/voyages/[id]/debloquer/paiement-simule/[paiementId]` et `R9-retour` = `/voyages/[id]/debloquer/confirmation?paiement=[paiementId]`, comme proposé. Elles sont hors du groupe `(programme)` : ni carte ni panneau.
- **Module d'adresses unique** (règle de 0017 § 12 et 0016 § 7 : le module qui écrit une adresse est celui qui la relit) : `src/features/presentation/routes.ts` gagne `unlockRoutes(tripId)`, avec `debloquer(paiementId?)`, `paiementSimule(paiementId)`, `confirmation(paiementId)` et, en F9b, `ajuste()`. Il gagne aussi `parsePaiementParam(value): string | null`, fonction pure qui renvoie l'identifiant s'il respecte `CHECKOUT_ID_PATTERN`, sinon `null` (tableau, valeur vide, caractère hors motif). Identifiants encodés ; tests dans les deux sens.
  - `DeckEnd` remplace sa concaténation `` `${programme}/debloquer` `` par `unlockRoutes(tripId).debloquer()`. **Point de revue** : aucune adresse du parcours n'est concaténée ailleurs.
  - Les actions de `src/server/actions/paiement.ts` construisent `redirectUrl` par ce même module (fonction pure, sans `zod`, importable côté serveur).
- **Suivi** (`PaymentReturn`) :
  - état initial rendu côté serveur par la page ;
  - puis chaîne de `setTimeout` relancée à la réponse, jamais `setInterval` : deux appels ne se chevauchent jamais (0017 § 9) ;
  - constantes nommées dans `src/features/presentation/payment-polling.ts` : `CHECKOUT_POLL_FAST_MS = 1000`, `CHECKOUT_POLL_SLOW_MS = 5000`, `CHECKOUT_POLL_SLOWDOWN_AFTER_MS = 30_000`, `CHECKOUT_POLL_STOP_AFTER_MS = 600_000`, et une fonction pure `nextPollDelay(elapsedMs): number | null` testée seule ;
  - arrêt dans un état final, au démontage et après 10 min ; « Vérifier de nouveau » relance un cycle complet (elapsed remis à 0) ;
  - horloge injectable (`performance.now` par défaut) ; tests avec `vi.useFakeTimers`.
- **Job `docker`** (image de production, sans drapeau) : `curl` attend 404 sur `R9`, `R9-sim` (avec un identifiant bien formé de 22 caractères) et `R9-retour` de `mock_trip_edimbourg`, et vérifie que la page d'accueil ne contient pas `/debloquer`. Une ligne de plus lance le conteneur avec `-e VADROUILLE_DEMO_PAYMENT=1` et attend toujours 404 sur `R9` : c'est `VADROUILLE_ENV=production` qui ferme (§ 2.3).
- PR : **F9a** (`ajuste()` en **F9b**).

### 6. F9-TL-6 — Portée, horloge et durées de la simulation
**Retenue, précisée.**

- **Portée et horloge** : celles de 0017 § 10 (`src/adapters/simulation.ts`, `getSimulationScope()`, en-tête `x-vadrouille-simulation` lu seulement si `devPagesEnabled()`, `R-sim`). **Si F8b ne les a pas livrées** au démarrage de F9a, F9a les crée dans la forme de 0017 § 10 (sans la partie `auth`), et F8b les réutilise.
- **État de paiement de chaque portée** : les paiements (identifiant, organisation, voyage, moyen, instantané du prix, instant de création, issue et son instant) et les droits (organisation, voyage, instant). Rien d'autre : ni email, ni nom, ni adresse IP. `reset` vide paiements et droits.
- **Bornes** (avec celles de 0017 § 10.4) : 50 paiements et 20 droits au plus par portée ; au-delà, le plus ancien est retiré. Un paiement retiré devient `not_found`, ce qui est acceptable en simulation.
- **Durées** dans la configuration de l'adaptateur (`src/adapters/index.ts`), constantes nommées :
  - `checkoutTtlMs = 30 * 60_000` ;
  - `confirmationDelayMs = 0` par défaut ;
  - `demoUnlockTtlMs = 30 * 60_000`, **retenu pour la seule portée par défaut** : un droit simulé y expire après 30 min. Dans la portée par défaut, tous les visiteurs d'une instance partagent les droits ; sans expiration, le premier paiement simulé débloquerait la démonstration pour tous, jusqu'au redémarrage. Les portées explicites (tests) n'expirent pas, pour rester déterministes.
- **`R-sim`** : le schéma strict du corps (0017 § 10.5) gagne `{ action: "configurePayment"; confirmationDelayMs: entier de 0 à 600 000 }`, propre à la portée explicite et remis à 0 par `reset`. Les autres réponses de `R-sim` (404, 415, 413, 400) ne changent pas.
- **Limite assumée** (spécification, F9-Q6, Q131) : l'état vit en mémoire du processus ; les instances ne partagent rien (décision 0002 : aucun stockage propre à Vercel). Sur Vercel, un paiement peut paraître inconnu d'une requête à l'autre. La démonstration du paiement n'est fiable qu'en local, en CI et dans l'image `docker` tant que Q131 n'est pas tranchée ; la PR F9a le rappelle.
- PR : **F9a**.

### 7. F9-TL-7 — Contrat d'ajustement et jeu simulé
**Retenue, précisée.**

- `src/contracts/adjustment.ts`, réexporté par `src/contracts/index.ts`, objets stricts :
  - `AdjustmentSummarySchema = { tripId, retained: RetainedPreference[], days: { day; changes: Change[] }[], toReserveCount, generatingDays }`, où `day` est un entier ≥ 1, `days` est trié par `day` sans doublon, `toReserveCount` est un entier ≥ 0 et `generatingDays` une liste d'entiers ≥ 1 sans doublon ;
  - `RetainedPreference = { id; origin: "confirmed" | "inferred"; subject }`, avec `subject` égal à `{ kind: "category"; category: Category; direction: "less" | "more" }` ou à `{ kind: "distance" }`. `id` est stable pour une même préférence (par exemple `category:museum:less`, `distance`) : « Retirer » et « Annuler » s'y réfèrent ;
  - `Change` est celui de `src/contracts/trip.ts` dans sa forme de 0016 § 4.5 (F7a). Les noms sont des noms maison, jamais un `displayName`.
- **Jeu simulé** : `AdjustmentFixturesSchema` et `src/mocks/edimbourg-ajustement.ts`.
  - Le jeu est **autonome** : pour chaque proposition de l'aperçu, il porte le jour, l'heure et le nom de l'étape écartée et, pour une activité, le remplacement (nom, catégorie) ; pour un repas, les options ; pour chaque jour, ses étapes verrouillées (`unchanged`). `summarizeAdjustment` n'a donc pas besoin du voyage non débloqué, que `getTripReader()` ne sert plus après le paiement (§ 3).
  - Ces données sont **dérivées** du voyage d'Édimbourg par une fonction de `src/mocks` (comme le voyage débloqué, 0013 § 3.6), et non recopiées. Seuls les remplacements (tableau de la spécification) sont écrits à la main.
  - Tests : chaque `proposalId` désigne une proposition de l'aperçu ; aucun remplacement de catégorie `museum` ; aucun `Change` sur une étape verrouillée ; aucun `placeId` dans un `Change`.
- **Lecture** : `getAdjustmentFixtures(ctx, tripId): Promise<AdjustmentFixtures | null>`, exportée par `src/adapters`, **pas** une méthode de `TripAdapter` (même raison que `getRevisionFixtures`, 0016 § 6). `null` pour un voyage inconnu ou d'une autre organisation, et hors adaptateur `mock`.
- **`summarizeAdjustment(session, fixtures, trip)`** : fonction pure de `src/features/presentation/adjustment.ts`, qui n'importe que des types de `@/contracts` et des valeurs de `@/contracts/values`. `trip` est le voyage lu par `getTripReader()` (débloqué), pour `toReserveCount` et `generatingDays`. En B10, elle passe dans `src/domain` et le serveur renvoie directement `AdjustmentSummary` ; l'écran ne change pas.
- PR : **F9b**.

### 8. F9-TL-8 — Session entre les routes
**Retenue, précisée.**

- **Layout** `src/app/voyages/[id]/layout.tsx` (à créer), commun à `R6`, `R9` et ses sous-routes, `R10`, `R11` et la Journée. Il ne monte **que** le fournisseur : ni `TripShell`, ni lecture de données, ni dépendance. Il ne contredit pas 0016 § 1.1 : le groupe `(programme)` garde seul la carte et le panneau.
- **Fournisseur** `TripSessionProvider`, composant client, dans `src/features/voyage/` (il sert la présentation, le paiement et l'écran 10, et `src/features/voyage/` est le dossier partagé du voyage). Réducteur pur à part (`trip-session.ts`), testé sans React.
  - L'état est **rangé par `tripId`** (`Map` en mémoire de l'onglet), même si le layout est remonté à chaque changement d'identifiant : deux voyages ne partagent jamais d'état, quoi qu'il arrive au montage.
  - **F9a** : paiements commencés dans l'onglet, `{ checkoutId, method, reported: "succeeded" | "failed" | null }`. `payment_succeeded` et `payment_failed` ne sont envoyés que pour un `checkoutId` présent et pas encore rapporté ; `duplicate` marque le paiement comme rapporté sans envoyer de second `payment_succeeded`.
  - **F9b** : la session de tri (`PreferenceSession` et décisions par proposition). `createLocalDeckActions` la reçoit comme session initiale et y réécrit par un rappel, sans seconde source de vérité.
- **Aucun stockage** : ni `localStorage`, ni `sessionStorage`, ni IndexedDB, ni Cache Storage, ni cookie ; la règle de lint de F4 contre le stockage client couvre `src/features/voyage/` et le nouveau layout.
- **Budget** : le fournisseur entre dans le JavaScript initial de la Journée. Le test `budget: JavaScript initial de la Journée` (0016 § 3.1 règle 5) reste strictement sous 200 000 octets ; la PR F9a donne la mesure avant et après. Si T4 n'est pas fusionnée, la PR mesure selon la même méthode et le dit.
- PR : **F9a** (forme minimale), **F9b** (session de tri).

### 9. F9-TL-9 — Événements
**Retenue.**

- Variantes strictes de `src/analytics/events.ts` : `paywall_viewed { price_variant }`, `payment_started { method, price_variant }`, `payment_succeeded { method, price_variant }`, `payment_failed { method, price_variant, reason }` en **F9a** ; `preference_removed { category, origin }` en **F9b**.
  - `price_variant` : énumération tirée de `PRICE_VARIANTS` (`@/contracts/values`), jamais de la configuration serveur ; `method` de `PAYMENT_METHODS` ; `reason` de `CHECKOUT_FAILURES` ; `origin` : `confirmed | inferred` ; `category` : `CategorySchema` ou `"distance"`, comme `preference_prompt_answered`.
  - Forme : `zod/mini` si T4 est fusionnée (0016 § 3.1 règle 3) ; sinon la forme en vigueur dans `main`, que T4 réécrit.
  - Tests : refus de `tripId`, `checkoutId`, `amount`, d'un `price_variant` hors liste et d'un texte libre.
- **Émission côté serveur** : `payment_succeeded` émis par le navigateur n'est fiable qu'en phase 0 (pas d'envoi réel). Quand l'enregistreur réseau existera (Q56) et avec la tâche de paiement réel, l'événement de référence sera émis **par le serveur**, à la confirmation du prestataire, une fois par paiement (même machine d'états, § 2.2) ; la variante client sera alors retirée ou renommée par cette tâche, sans double comptage.
- PR : **F9a**, **F9b**.

### 10. F9-TL-10 — Niveau de titre de `DestinationPlate`
**Retenue** : prop `as?: "h1" | "h2" | "p"`, `h1` par défaut (Séjour, F5). Sur l'écran 9 (non débloqué et déjà débloqué), la plaque utilise `as="p"` : elle identifie le voyage sous le titre de niveau 1 et n'ouvre pas de section, et « Ce qui est inclus » reste le seul titre de niveau 2 qui suit. Le rendu visuel ne dépend pas de la balise. Test : un seul `h1` par écran (déjà exigé). La PR qui crée `DestinationPlate` (F5c, ou F9a selon F9-PO-18) l'inclut ; l'autre la réutilise.

### 11. F9-TL-11 et observation de #73 — Emplacement des actions serveur (amende 0016 § 3.1, règle 4)
**Décision : toutes les actions serveur du produit vivent dans `src/server/actions/`, jamais dans `src/features/`. Cela vaut pour F9 et pour F8.**

- **F9** : `src/server/actions/paiement.ts`, qui commence par `"use server"` et exporte `startCheckout`, `simulateCheckoutOutcome` et `getCheckoutStatus`. Ses tests sont dans le même dossier. Les composants client de `src/features/presentation/` l'importent comme références d'actions.
- **F8 (observation de #73)** : `src/server/actions/creation.ts` et `src/server/actions/compte.ts`, et non `src/features/creation/actions.ts` ni `src/features/compte/actions.ts`. C'est la décision de 0017 § 3.3, en revue ; la présente décision la reprend pour qu'elle tienne même si #65 est fusionnée après celle-ci ou modifiée sur un autre point. La spécification F8 est remplacée sur ce seul point.
- **`src/features/presentation/actions.ts` n'est pas concerné** : c'est l'implémentation locale de `DeckActions` (0013 § 3.2), du code client sans `zod`, et non une action serveur.
- **Raisons** :
  - les actions revalident leur entrée par les schémas de `src/contracts` (le serveur fait foi, F9-PO-7) : elles ont besoin de `zod` et des imports de valeur que la règle 4 interdit dans `src/features/**` ;
  - une exemption par fichier dans `src/features` mêlerait dans un même dossier du code client et du code qui ne doit jamais l'être ; sous `src/server`, la frontière se voit au chemin ;
  - c'est le dossier `src/server` du handover back-end (#27, en revue), où B6 et suivants placent leurs actions.
- **Amendement de 0016 § 3.1, règle 4** (mêmes termes que 0017 § 3.3) :
  - la liste des dossiers de la règle ne change pas, et `src/server/**` n'y est pas soumis ;
  - règle ajoutée : dans `src/components/**`, `src/features/**`, `src/app/**` et `src/lib/**`, un import de `@/server/*` n'est permis que vers `@/server/actions/*`. Tout autre module de `src/server` (`parse-input.ts`, `config/offer.ts`) y est refusé ;
  - `tests/unit/lint/` le teste : un import de `@/server/actions/paiement` depuis `src/features/presentation` passe ; un import de `@/server/config/offer`, de `@/server/parse-input` ou de `zod` depuis ce dossier est refusé ; les interdictions précédentes tiennent toujours (point d'attention de 0015 § 1 sur la configuration plate) ;
  - un test vérifie que chaque fichier de `src/server/actions/` (hors `*.test.*`) commence par la directive `"use server"` ;
  - **la première PR** qui crée `src/server/` (F8a ou F9a) livre la règle, ses tests et `src/server/parse-input.ts` (0017 § 3.4 : échec traduit en `validation_failed`, `field` construit sans la clé ni la valeur reçues) ; la seconde les réutilise.
- **Ordre des contrôles** des actions de paiement :
  1. `paymentAvailable()` ; sinon `not_found`, sans rien lire ni modifier ;
  2. (B3) session ; sinon `unauthenticated` ;
  3. `parseInput` de l'entrée reçue en `unknown` ; sinon `validation_failed`, sans appel à l'adaptateur ;
  4. contexte par `getRequestContext()` (jamais une valeur du navigateur), portée par `getSimulationScope()`, puis appel de l'adaptateur.
  
  Entrées : `startCheckout(CheckoutRequest)`, `simulateCheckoutOutcome({ checkoutId; outcome })`, `getCheckoutStatus({ checkoutId })`, `checkoutId` conforme à `CHECKOUT_ID_PATTERN`.
- **Paramètre `paiement`** : lu et validé **côté serveur**, dans les composants serveur de `src/app/voyages/[id]/debloquer/`, par `parsePaiementParam` (§ 5) puis par l'adaptateur (organisation, voyage, état final d'échec, F9-PO-20). La page passe au client un état déjà résolu (`failure: "declined" | "cancelled" | "expired" | null`), jamais l'identifiant à interpréter. Hors des cas d'échec, l'état est `null` et le rendu est identique à celui sans paramètre.
- **Journal** : aucun `console.*` dans `src/server/actions/paiement.ts`, `src/adapters/mock-payment.ts` et `src/adapters/mock-unlock.ts` (`no-console`, avec son test) ; un journal éventuel ne porte que le code d'erreur.
- PR : **F9a** pour le paiement ; **F8a, F8b, F8c** pour la création et le compte.

## Conséquences
- **F9a** :
  - `src/contracts/values.ts` (§ 1.1), `src/contracts/billing.ts` et son test ; `errors.ts` et `API_ERROR_CODES` si F8a ne les a pas créés (§ 1.3) ;
  - `PaymentAdapter`, `PaymentSimulator`, `mock-payment.ts` (machine d'états, délai, expiration), `payment-guard.ts` (`paymentDemoAllowed`, `paymentAvailable`), `getPaymentAdapter`, `getPaymentSimulator` ; `isProductionDeployment` et `VADROUILLE_ENV=production` dans le `Dockerfile` si F8b ne les a pas livrés ;
  - `getTripReader`, `mock-unlock.ts`, `counterpartOf` ; pages du voyage passées à `getTripReader()` ; `revalidatePath` à la réussite ;
  - `src/server/config/offer.ts` et son schéma ; test de balayage du montant ;
  - `unlockRoutes`, `parsePaiementParam`, `DeckEnd` sans concaténation, `payment-polling.ts` ;
  - `simulation.ts` et `R-sim` si F8b ne les a pas livrés, avec `configurePayment` ;
  - layout `src/app/voyages/[id]/layout.tsx` et `TripSessionProvider` minimal ; mesure du budget avant et après ;
  - événements de paiement ; `DestinationPlate` avec `as` si F5c n'est pas fusionnée ;
  - `src/server/actions/paiement.ts`, règle de lint sur `@/server/*` et `parse-input.ts` si F8a ne les a pas livrés ; `dev-pages-env.test.ts` étendu à `VADROUILLE_DEMO_PAYMENT` ;
  - lignes `docker` du § 5.
- **F9b** : `adjustment.ts` (contrat), jeu simulé dérivé et `getAdjustmentFixtures`, `summarizeAdjustment`, session de tri dans le fournisseur, `unlockRoutes(…).ajuste()`, `preference_removed`.
- **F8a, F8b, F8c** : actions dans `src/server/actions/` (§ 11), comme 0017 § 3.3.
- **Spécification F9** : ses critères ne changent pas. Sa prochaine mise à jour (Product Owner) pourra renvoyer à cette décision pour `validation_failed` au lieu de `invalid_input` (§ 1.3), l'expiration en état et non en code d'erreur (§ 1.3), la forme `Result<T>` (§ 1.3), `src/server/config/offer.ts` au lieu de `src/config/offer.ts` (§ 4), `src/server/actions/paiement.ts` au lieu de `src/server/payment-actions.ts` (§ 11), `TripSessionProvider` dans `src/features/voyage/` (§ 8), la forme B (§ 3) et `as="p"` (§ 10).
- **Spécification F8** : l'emplacement des actions (§ 11) remplace `src/features/creation/actions.ts` et `src/features/compte/actions.ts`.
- **B0 (#27)**, à répercuter par son relecteur si #27 est fusionnée après celle-ci, sinon par la tâche de paiement réel : `Offer` lu par `PaymentAdapter` ; `CheckoutStatus` et ses états, dont `duplicate` ; droits dans la table `billing` ; déduplication des webhooks par identifiant d'événement **et** machine d'états (§ 2.2) ; `payment_succeeded` émis par le serveur (§ 9) ; `redirectUrl` limité à une liste fermée d'origines (§ 1.3).
- **Tâche de paiement réel** (après G0 et Q26) : implémente `PaymentAdapter` ; ne réutilise ni `PaymentSimulator`, ni `mock-unlock.ts`, ni l'état en mémoire.
- **Tâches induites** : aucune nouvelle tâche. Tout ce qui précède entre dans F9a et F9b, ou dans F8 déjà prévue.
- **Revue** des PR F9a et F9b : le Tech Lead vérifie leur conformité à cette décision. Un écart demande un amendement écrit ici, pas une exception silencieuse.

## Questions liées
**Nouvelles questions** (numéros provisoires ; le CEO attribue les numéros définitifs dans `QUESTIONS.md`) :
- **Q150 (Product Owner)** : aligner la spécification F9 sur cette décision à sa prochaine mise à jour (liste des points dans « Conséquences », « Spécification F9 »), et la spécification F8 sur l'emplacement des actions (§ 11). **Bloque** : rien ; d'ici là, cette décision prime et les PR F9a et F9b la citent.
- **Q151 (Sécurité)** : avis sur la garde du paiement simulé (§ 2.3), sur le raffinement de `redirectUrl` (§ 1.3) et sur la lecture du paramètre `paiement` (§ 11, F9-PO-20), à rendre à la revue de F9a. **Bloque** : la fusion de F9a si la Sécurité demande une correction, pas son démarrage.

**Questions déjà ouvertes, rappelées** (non tranchées ici) :
- **Q131** (Samuel, avec le Tech Lead) : ouverture du paiement simulé sur Vercel. La garde (§ 2.3) refuse en tout cas tout déploiement de production (`VADROUILLE_ENV` ou `VERCEL_ENV` à `production`) tant que cette décision n'est pas amendée après sa réponse. Limite à connaître : l'état est partagé entre visiteurs d'une instance et non partagé entre instances (§ 6) ; un droit simulé de la portée par défaut expire après 30 min.
- **Q127, Q128, Q129, Q130, Q133, Q135** (Samuel) : aucune décision technique ici n'en préjuge. La configuration de phase 0 (§ 4) reprend le cadrage sans trancher Q128.
- **Q26** (Samuel, compte Stripe en mode test avec TWINT) et **Q56** (Samuel, PostHog UE) : conditionnent la tâche de paiement réel et l'émission serveur de `payment_succeeded` (§ 9).
- **Q88** (Samuel) : `replacementLimit` absent de la configuration.
- **Q126** (UX/UI) : rendus et textes provisoires de F9.
