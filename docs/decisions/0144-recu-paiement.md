# 0144 — Reçu de paiement (B4d-TL) : forme du reçu, reçu de Stripe (option B), méthodes du port, `fabriqueClientSdk`, route `R9-recu`, âge minimal de publication des paquets

Statut : **acceptée**, décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), **avec la Sécurité** (conditions du § 5.2, reprises mot pour mot de sa réponse à la question 11 de la PR #884) ; **le CEO valide** (ordre des tâches, § 7). Définitive dès sa fusion, **sans fenêtre de veto** (0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-10-29 · Décideur : Tech Lead, avec la Sécurité · Validation : CEO · Ticket : #886 · Tâche de suite : **B4e**, ticket #887 (§ 7) · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 3, ligne B4d (l. 127 : « lien vers le reçu Stripe sur l'écran de retour et dans « Mes voyages » ; avec le simulé, un reçu maison marqué « simulé » ») · `main` relu : `89e4bd5` (B4d, PR #884, fusionnée) · Revue lue : revue consolidée de #884, head `d60ecc6` (réponses aux questions 6 à 11) · Décisions lues : 0010, 0020 § 1.3 et § 5, 0081 (B9-TL-12, option B), 0093, 0097 (B4-TL-11, B4-TL-13), 0140 (§ 1.2, § 2.4, § 4, § 5, § 6).

Numérotation : relu le 2026-10-29, `main` porte 0001 à 0142 ; 0143 est pris par la PR ouverte #882 (`claude/879-m1e-photos-api`) ; aucune PR ouverte n'ajoute 0144.

**Ce que cette décision n'engage pas.** Aucun compte, aucune clé, aucun secret, aucun appel à l'API de Stripe (rien n'est appelé avant B4e, et B4e n'appelle Stripe qu'à travers le double dans les tests, la barrière de sortie n'admettant l'API de Stripe que sur une préversion : 0140 § 3 point 5). Aucun argent. Aucune donnée personnelle envoyée : le reçu de Stripe est **lu**, jamais alimenté par nous ; de la Charge lue, seul `receipt_url` est gardé (§ 5.3). Aucune migration dans cette PR (la migration est celle de B4e). Aucun test supprimé ni désactivé : un test du régime de confinement change de sens, écrit au § 6. Aucune version de dépendance changée : le verrou régénéré est identique (§ 6).

**Réservé à Samuel, non tranché ici** : Q127 (reçu ou facture ayant valeur comptable, mentions avant paiement, TVA ; le reçu simulé et le lien vers le reçu de Stripe en mode test n'en sont pas), Q26 et Q353 (compte Stripe de test, secrets, point de terminaison), mode réel et mise en production.

## Amendements (en tête, sans réécrire les anciennes décisions)

1. **0140 § 2.4** (« le retrouver demande soit l'identifiant du `payment_intent` dans `checkouts` (migration), soit un appel à l'API de Stripe depuis le webhook » ; l'appel avait été écarté pour les remboursements) : **le webhook Stripe peut appeler l'API de Stripe, pour le seul reçu**, une fois, **après** la validation de la transaction qui accorde le droit, sous un délai court, sans effet sur la réponse ni sur le droit (§ 5.3). Le traitement des remboursements et litiges de 0140 § 2.4 est inchangé (alerte seule).
2. **0140 § 2.1** (« la fabrique ne connaît aucune clé ») : inchangé ; l'appel passe par le port `PrestatairePaiement`, que la route Stripe reçoit de `composition-stripe.ts` par ses dépendances. **0140 § 6 ligne 9** (seul appelant de `cleStripe` hors des tests : `composition-stripe.ts`) reste vrai et son test reste tel quel.
3. **0140 § 5 point 0** (port `PrestatairePaiement`) : une troisième méthode, `adresseRecu`, s'ajoute à `creerSession` et `adresseSession` (§ 5.3).
4. **0140 § 6, ligne 8** (`"stripe.com"` dans les hôtes refusés) : une ligne de capacité de même modèle est due pour `https://pay.stripe.com` dans le fichier qui tient la liste fermée de l'origine du reçu (§ 5.3, point 6), ajoutée par B4e avec son verdict Sécurité.
5. **Spécification B4** (`specs/B4-paiement-simule.md` l. 18, « pas de facture ni de reçu (Q127) », et l. 236, « reçu » parmi le hors-périmètre) : la partie technique est fixée ici ; le **Product Owner** amende ces deux lignes (ticket #887, dans la PR de B4e ou une PR documentaire) pour distinguer le reçu simulé et le lien vers le reçu de Stripe en mode test, livrés par B4d et B4e selon le plan, du reçu ou de la facture comptable, qui restent à Samuel (Q127).
6. **Spécification P0c** (`specs/P0c-confinement-capacites.md` l. 58 et l. 71, « aucun fichier `.npmrc` ») : un seul `.npmrc` est admis, à la racine, au contenu exact `minimum-release-age=20160` (§ 6). `.npmrc` reste un chemin gardé (l. 308 et l. 365 de la même spécification) : la revue de cette PR demande le verdict de la Sécurité.
7. **`docs/handovers/backend.md` § 5** (ligne `Receipt.kind`, « le reçu de Stripe attend sa colonne (PR 878) ») et **§ 6** (ligne `checkouts`) : mis à jour par B4e, avec la colonne (§ 5.2).

**Erratum de 0140** : une ligne en tête de 0140 renvoie aux amendements 1 à 4 ci-dessus ; rien d'autre n'y change.

## 1. Forme du reçu (validée par l'UX, question 6 de #884)

Forme livrée par B4d et validée par l'UX sans maquette (revue consolidée de #884, réponse à Q6, sous les mineurs 1 à 4, faits) ; elle vaut pour les deux formes du reçu :
- **mention en aplat `muted` avant les détails** (pour le simulé : « Reçu de démonstration : aucun paiement réel n'a eu lieu et ce document n'a aucune valeur comptable. ») ;
- **détails en liste `dl`/`dt`/`dd` à filets** : « Voyage » (destination et dates), « Montant », « Moyen de paiement » (« TWINT » ou « Carte »), « Date », « Identifiant du paiement » (identifiant **public**, jamais un identifiant de Stripe) ;
- **liens texte** : « Voir le reçu » sous « Voir le programme » (écran 9 débloqué) et sous la ligne du voyage payé (« Mes voyages », lien à part, jamais dans le lien du voyage, nom accessible « Voir le reçu (<destination>) », cible de 44 px) ; « Retour » et « Voir le programme » sur le reçu ;
- **date à l'heure de Zurich**, avec la mention du fuseau : « 29 octobre 2026 à 14:05 (heure de Zurich) » (`Europe/Zurich`). Dérogation assumée à la règle « heure locale de la destination » du transfert frontend : un paiement n'a pas lieu à destination et le serveur ne connaît pas le fuseau de la personne ; le Product Owner la confirme (question 2 de #884, ouverte).

Les textes restent ceux de `src/i18n/fr/debloquer.json` et `mesVoyages.json`, provisoires jusqu'à la réponse du Product Owner (question 1 de #884).

## 2. Port de paiement : `getReceipt` et `listReceipts` (question 9 de #884)

1. **Aujourd'hui (B4d)** : deux méthodes **facultatives** de l'adaptateur de paiement (`src/adapters/types.ts` l. 105-107), `getReceipt(ctx, tripId)` et `listReceipts(ctx)` ; seul `simulated` les implémente ; une méthode absente vaut « aucun reçu » (404 sur `R9-recu`, aucun lien). Accord du Tech Lead.
2. **À l'arrivée de la forme `stripe` du contrat (B4e)**, les deux méthodes deviennent **obligatoires** : `simulated` et `stripe` les implémentent ; `mock` rend `not_found` pour `getReceipt` et `[]` pour `listReceipts` (aucun reçu pour les démonstrations des préversions, sauf réponse contraire du Product Owner à la question 5 de #884). Les gardes `?.` des chargeurs (`src/features/presentation/unlock-load.ts`) sont retirées dans la même PR, et un test de type échoue si une méthode manque.
3. **Contrat** : `ReceiptSchema` devient une union discriminée par `kind` (`simulated` | `stripe`), objets stricts, **jamais un champ libre** ; la forme `stripe` reprend les champs de la forme simulée et ajoute `url`, chaîne d'au plus 2048 caractères admise par la revalidation du § 5.2 (refinement Zod sur la même fonction). Chaque nouvelle clé est classée au § 5 de `docs/handovers/backend.md` (test permanent `contracts/categories`).
4. **Règle de lecture inchangée** (B4d) : sous `withOrg` (RLS), `entitlements (tripUnlocked) → billing → checkouts`, filtrée par `checkouts.created_by` = la personne (B4-PO-7) ; un droit est unique par `(organization_id, trip_id, kind)`, donc `rows[0]` sans `ORDER BY` est correct (mineur 8 de la revue, confirmé).

## 3. `fabriqueClientSdk(transport?)` (question 10 de #884)

Acceptée telle que livrée par B4d dans `src/server/payment/stripe.ts` : fabrique du client réel du SDK, mêmes options, sur un transport HTTP **de test** quand il est fourni (type dérivé du constructeur du SDK, aucune valeur de la bibliothèque exportée) ; le client de l'application garde le transport par défaut. Usage admis : les tests de `stripe.ts` (409, `idempotency_error`, `stripe-should-retry`), et ceux de `adresseRecu` en B4e. Aucun autre importateur hors des tests ; les deux importateurs de `stripe.ts` restent `composition-stripe.ts` et `stripe-webhook.ts` (0140 § 6 ligne 9).

## 4. Route `R9-recu`

Acceptée : `/voyages/[id]/debloquer/recu`, page serveur, `force-dynamic`, `noindex`, adresse écrite par le module d'adresses (`unlockRoutes(id).recu()`, 0020 § 5), inventoriée dans `tests/e2e/routes.ts` avec `status: 404` sur le serveur mesuré (adaptateur `mock`) ; page réelle éprouvée, axe compris, par le projet `api`. Sans session : écran 4, suite « Débloquer » (`R9`), sans étendre la liste blanche des suites (B3-PO-11). B4e garde cette route : le reçu de Stripe s'y affiche (§ 5.3 point 7) ; **aucune nouvelle route**.

## 5. Reçu de Stripe : option B retenue

### 5.1 Choix

`receipt_url` est un champ de la Charge, absent de `Checkout.Session` (types du SDK 23.0.0). Options de la PR #884 : (A) événement `charge.succeeded`, deux colonnes ; (B) relecture de la session par le webhook, hors transaction, une colonne ; (C) aucune conservation, relecture à chaque affichage.

Position de la Sécurité (réponse à Q11) : « Option B acceptable (hors transaction, délai court, panne sans effet sur le droit) ; option C de moindre risque ; option A à éviter. »

**Décision : option B**, sous les conditions du § 5.2. Raisons :
- le plan (l. 127) et le ticket #887 demandent de **conserver** le lien et de le rendre sur l'écran de retour et dans « Mes voyages » ; C ne conserve rien ;
- C ferait un appel à Stripe **à chaque affichage** d'un reçu, contre l'orientation de 0093 point 3 (tout est calculé une fois, puis plus d'appel pour afficher), rendrait `R9-recu` dépendant de la disponibilité de Stripe et de la barrière de sortie, et mettrait la clé d'API sur un chemin de lecture déclenché par chaque visite ; B ne l'appelle qu'une fois par paiement, depuis le webhook, dont la réponse n'en dépend pas ;
- A est écartée sur l'avis de la Sécurité : ordre d'arrivée non garanti entre `charge.succeeded` et la session, seconde colonne (`stripe_payment_intent_id`), nouveau type d'événement ;
- le risque propre de B (un lien porteur conservé en clair) est borné par les conditions de la Sécurité, toutes reprises.

C reste le **repli** si B4e rencontre un obstacle (par exemple un délai du webhook incompatible avec le délai court) : B4e s'arrête et revient au Tech Lead, qui le décide par une nouvelle décision.

### 5.2 Conditions de la Sécurité (reprises mot pour mot)

Texte de la Sécurité, revue consolidée de #884 (head `d60ecc6`), réponse à Q11, copié tel quel :

> Conditions : `CHECK` plus strict que le préfixe seul (`^https://pay\.stripe\.com/receipts/[A-Za-z0-9_%./~-]+(\?[A-Za-z0-9_%=&.~-]*)?$`) et revalidation TypeScript par liste d'origine fermée avant tout `href` ; écriture unique et `GRANT UPDATE` limité à `vadrouille_webhook` ; lien rendu seulement à `created_by`, jamais journalisé ni dans l'URL, avec `rel="noopener noreferrer"` et `referrerpolicy="no-referrer"` ; colonne ajoutée au tableau § 5 de `backend.md` ; purge couverte ; tests de base (lien hors préfixe, réécriture, droit de colonne, isolation).

Et, dans la description de #884 : « À reprendre par la tâche `data` (la migration esquissée plus haut doit prendre ce `CHECK`). » Toutes ces conditions sont **obligatoires** pour B4e ; aucune n'est assouplie ici.

### 5.3 Mise en œuvre attendue de B4e (technique, Tech Lead)

1. **Migration** (numéro suivant libre à l'ouverture de B4e : `0022` sur `main` au `89e4bd5`), forme de l'esquisse de #884 **avec le `CHECK` de la Sécurité** :
   - `ALTER TABLE public.checkouts ADD COLUMN stripe_receipt_url text;`
   - contrainte `checkouts_stripe_receipt_url_check` : `stripe_receipt_url IS NULL OR (length(stripe_receipt_url) <= 2048 AND stripe_receipt_url ~ '^https://pay\.stripe\.com/receipts/[A-Za-z0-9_%./~-]+(\?[A-Za-z0-9_%=&.~-]*)?$')` ;
   - `GRANT UPDATE (stripe_receipt_url) ON public.checkouts TO vadrouille_webhook;` et **aucun** autre droit d'écriture sur la colonne (`vadrouille_app` garde `UPDATE` sur `stripe_checkout_session_id` seulement) ;
   - **écriture unique** : le déclencheur `checkouts_session_once` (`db/migrations/0001_securite.sql` l. 95-108) est étendu, ou un déclencheur de même modèle ajouté, qui refuse de remplacer une valeur non nulle de `stripe_receipt_url` (et de la remettre à `NULL`) ;
   - migration descendante : `ALTER TABLE public.checkouts DROP COLUMN stripe_receipt_url;` (avec le déclencheur rendu à son état antérieur s'il est modifié) ;
   - les règles d'approbation des migrations en vigueur s'appliquent (0035, 0056 § 3, 0093 point 7).
2. **Port** : `adresseRecu(sessionId: string, paiement: { readonly id: string; readonly checkoutId: string; readonly tripId: string }): Promise<ResultatPrestataire<string>>`, ajoutée à `PrestatairePaiement` (`src/server/payment/paiements.ts`) et implémentée dans `creerClientSessionsStripe` (`src/server/payment/stripe.ts`) sur le modèle exact d'`adresseSession` (0140 § 5 point 3) : `checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] })` ; rend `provider_error` sauf si la session lue a `metadata.checkoutId` égal à `paiement.id`, `payment_status` `paid`, et une Charge dont `receipt_url` passe la revalidation du point 3. Même neutralisation des erreurs du SDK (liste fermée des classes, journal `payment.provider_failed` à code fixe), client construit à l'appel par `composition-stripe.ts`, barrière de sortie rejouée par `cleStripe`. **Délai court** : délai de la requête de 2 s et aucune relance automatique du SDK pour cet appel (`maxNetworkRetries: 0`), fixés dans `stripe.ts`. **Minimisation** : de la session et de la Charge développée, seul `receipt_url` est lu ; aucun autre champ (coordonnées de facturation, carte, e-mail) n'est lu, copié, rendu ni journalisé. Le simulé rend `{ ok: false, code: "provider_error", retryable: false }` (il n'a pas de reçu de prestataire).
3. **Revalidation TypeScript par origine fermée** : une seule fonction, `recuStripeAdmis(valeur: unknown): valeur is string` (nom proposé), dans le même module que la liste fermée `ORIGINES_RECU = ["https://pay.stripe.com"]` (sur le modèle d'`adressePrestataireAdmise`, 0140 § 4) : chaîne d'au plus 2048 caractères, `new URL` sans exception, `protocol` `https:`, ni `username` ni `password` ni `port`, `origin` dans la liste, et la même expression que le `CHECK`. Appelée **avant l'écriture** (point 4) **et avant tout `href`** (point 7), y compris sur une valeur relue de la base.
4. **Écriture depuis le webhook Stripe, hors transaction** : dans `src/server/routes/stripe-webhook.ts` (par ses dépendances, jamais dans la fabrique commune `webhook-commun.ts`), **après** la validation de la transaction de `handlePaymentEvent`, et seulement pour un événement de réussite (`checkoutCompleted` ou `asyncPaymentSucceeded`) dont le droit est accordé ou déjà accordé **par ce même paiement** (issue `granted`, ou suite rejouée d'un événement déjà enregistré, `webhook.ts` l. 135-137), **et** dont la colonne est encore `NULL` (relue dans la transaction) : un appel `adresseRecu`, puis une transaction courte sous `vadrouille_webhook` : `UPDATE public.checkouts SET stripe_receipt_url = $1 WHERE id = $2 AND stripe_receipt_url IS NULL`. **Panne sans effet sur le droit ni sur la réponse** (0081 option B) : toute erreur (prestataire, revalidation, base) est avalée, le webhook rend le même `200`, le droit reste accordé, la colonne reste `NULL` ; une ligne de journal à code fixe (événement `payment.receipt_unavailable`, niveau `warn`, champs : identifiant d'événement et code dans une liste fermée `provider_error`, `refused`, `db_error`), **jamais le lien**, ni l'identifiant de session, ni un message d'erreur. Aucune relance programmée : un paiement dont l'appel a échoué n'a pas de lien de reçu, sauf nouvelle livraison du même événement par Stripe (« Quand revoir »). Un second paiement du même voyage (`duplicate`) ne déclenche aucun appel.
5. **Jamais journalisé** : `src/server/log.ts` refuse toute valeur contenant `pay.stripe.com` (contrôle ajouté à `CONTROLES`, test dans `tests/unit/paiement/journal.test.ts`), et aucun champ de `LogFields` ne porte le lien.
6. **Confinement** : ligne de capacité `hote:pay.stripe.com`, forme `https://pay.stripe.com`, `nombre: 1`, dans le fichier de la liste fermée (modèle de 0140 § 6 ligne 8) ; toute autre ligne que `pnpm test` relèverait est ajoutée avec son motif et signalée dans la PR de B4e, verdict Sécurité à sa revue.
7. **Rendu** : l'adaptateur `stripe` implémente `getReceipt` et `listReceipts` (`src/adapters/stripe-payment.ts`) avec la règle du § 2 point 4 ; un paiement Stripe dont la colonne est `NULL` n'a **pas** de reçu (404 sur `R9-recu`, aucun lien). Les liens « Voir le reçu » (écran 9 débloqué, « Mes voyages ») mènent **toujours** à `R9-recu`, chemin de l'application ; **le lien de Stripe n'apparaît que dans le HTML de `R9-recu`**, rendu à la seule personne `created_by`, jamais dans une adresse de l'application, un paramètre, une redirection, un événement de mesure ni un fichier de cache. Sur `R9-recu`, forme du § 1, avec un lien texte externe vers le reçu de Stripe portant `rel="noopener noreferrer"` et `referrerpolicy="no-referrer"` ; textes (titre, mention de mode test, libellé du lien) et ouverture dans le même onglet ou non : Product Owner et UX (questions ci-dessous).
8. **Purge** : la suppression d'une organisation efface ses lignes `checkouts` (fonctions de purge, `DELETE FROM public.checkouts AS x WHERE x.organization_id = v_org`, dernière version `db/migrations/0015_recalcul_lot.sql` l. 113), donc la colonne ; un test de base l'atteste avec une valeur non nulle. Le sort de `billing` et de `checkouts` à la suppression d'un compte reste B11 (Q48).

### 5.4 Tests attendus de B4e (noms indicatifs)

Base (`tests/db/`, CI) : **lien hors préfixe** refusé par le `CHECK` (`http://pay.stripe.com/receipts/x`, `https://pay.stripe.com.example/receipts/x`, `https://pay.stripe.com/receiptsx`, `https://pay.stripe.com/receipts/` vide, `javascript:`, espace, `#fragment`, 2049 caractères) et admis pour une forme conforme avec et sans requête ; **réécriture** refusée (valeur non nulle remplacée, remise à `NULL`), première écriture admise ; **droit de colonne** : `vadrouille_app` refusé (`permission denied`), `vadrouille_webhook` admis sur cette seule colonne ; **isolation** : une autre organisation ne lit ni n'écrit la colonne (RLS) ; **purge** : colonne effacée avec l'organisation.
Unitaires et routes : `recuStripeAdmis` (mêmes cas que le `CHECK`, plus `username`, `port`, autre origine) ; `adresseRecu` sur le transport de test (`fabriqueClientSdk`) : réussite, `metadata.checkoutId` différent, `payment_status` autre que `paid`, `receipt_url` absent ou refusé, 409 et classes d'erreur, aucune relance ; webhook Stripe sur une fixture signée : le lien est conservé après l'octroi ; panne du prestataire ou de la base → `200`, droit accordé, colonne `NULL`, journal sans lien ; rejeu de l'événement avec la colonne remplie → aucun second appel, avec la colonne `NULL` → un appel ; paiement `duplicate` → aucun appel ; `R9-recu` : lien présent pour `created_by` avec `rel` et `referrerpolicy`, 404 pour un autre membre de l'organisation et pour une autre organisation ; « Mes voyages » et l'écran 9 ne contiennent jamais `pay.stripe.com` ; journal : aucune ligne ne contient `pay.stripe.com`.

## 6. Âge minimal de publication des paquets (question 7 de #884)

Réponse de la revue : garder les 59 lignes `libc:` du verrou (sortie exacte de pnpm 10.28.0 avec l'âge minimal de publication) et fixer `minimumReleaseAge` à **20160** minutes (14 jours) dans la configuration de pnpm du dépôt.

1. **Emplacement** : pnpm 10.28.0 ne lit pas `minimumReleaseAge` dans le champ `pnpm` de `package.json` (seules les clés de `getOptionsFromRootManifest` y sont lues : `onlyBuiltDependencies`, `overrides`, etc.), et le régime de confinement n'admet de toute façon que `onlyBuiltDependencies` et `overrides` dans ce champ (`analyserPackageJson`). Le réglage va donc dans un fichier **`.npmrc` à la racine**, d'une seule ligne : `minimum-release-age=20160` (`pnpm config get minimum-release-age` rend `20160`). Aucun `pnpm-workspace.yaml`, aucun `.yarnrc*`.
2. **Test du régime** (`tests/unit/confinement/depot.test.ts`) : le test « aucun fichier .npmrc, .yarnrc ou pnpm-workspace.yaml suivi » devient « aucun fichier .yarnrc ou pnpm-workspace.yaml suivi ; .npmrc seulement à la racine », et un test nouveau exige le **contenu exact** du fichier (`minimum-release-age=20160\n`) : toute autre ligne (registre, jeton, hôte, script) le fait échouer. Le test n'est ni supprimé ni désactivé ; il admet un fichier et un seul contenu, écrits ici. Verdict de la Sécurité demandé à la revue (chemin gardé).
3. **Verrou** : régénéré avec pnpm 10.28.0 (`pnpm install --lockfile-only`, résolution relue sur le registre, et une copie de contrôle par `--resolution-only`) : **identique octet pour octet** à celui de `main` ; `legacy-javascript` reste en **0.0.3** (la 0.0.4, publiée le 2026-10-23, a moins de 14 jours) ; aucune version ne change. `pnpm install --frozen-lockfile` (CI, `Dockerfile`) n'en est pas affecté ; l'image Docker ne copie pas `.npmrc` (`Dockerfile` l. 9) et n'en a pas besoin, l'installation y étant figée par le verrou.
4. **Effet** : toute résolution future (`pnpm add`, `pnpm update`, régénération du verrou) refuse une version publiée depuis moins de 14 jours. Une exception (correctif de sécurité urgent) se décide par une nouvelle décision du Tech Lead avec la Sécurité, jamais par une option en ligne de commande non écrite.

## 7. Tâche de suite : B4e (ticket #887)

**B4e — reçu Stripe** : rôle `data` (migration), puis `back` (écriture et rendu) ; prérequis : 0144 fusionnée, #884 fusionnée (fait). Livre :
1. la migration du § 5.3 point 1 et ses tests de base du § 5.4 (une seule tâche `db/migrations` par cycle) ;
2. la colonne au § 5 et au § 6 de `docs/handovers/backend.md` (`Receipt.url` : stocké, `checkouts.stripe_receipt_url` ; ligne `checkouts` : colonne, `CHECK`, écriture unique, droit de `vadrouille_webhook`) ;
3. `adresseRecu`, la revalidation, l'écriture hors transaction depuis le webhook et le journal à code fixe (§ 5.3 points 2 à 5) ;
4. la forme `stripe` de `ReceiptSchema`, les méthodes `getReceipt` et `listReceipts` rendues obligatoires (§ 2 point 2) et implémentées par l'adaptateur `stripe`, le rendu sur `R9-recu` (§ 5.3 point 7) ;
5. la ligne de confinement du § 5.3 point 6 ;
6. avec le Product Owner, l'amendement de `specs/B4-paiement-simule.md` l. 18 et l. 236 (amendement 5).

La validation du CEO porte sur cet ordre (B4e après 0144, la migration d'abord). L'essai réel du reçu de Stripe (préversion, compte de test) attend Q26, Q353 et l'ouverture des gardes de `mvp-essai` (0140 § 3 point 5).

## Questions nouvelles (2026-10-29 ; à reporter par le CEO dans `QUESTIONS.md`)

**Samuel**
- Aucune nouvelle. Rappel : Q127 (reçu ou facture comptable, mentions avant paiement) et Q26/Q353 (compte de test, secrets) restent ouvertes ; cette décision n'y répond pas.

**Product Owner**
1. Textes de `R9-recu` pour la forme `stripe` (provisoires, à valider ou remplacer) : titre « Reçu », mention en aplat « Paiement de test : aucun montant réel n'a été débité. », lien « Ouvrir le reçu de Stripe ».
2. Paiement Stripe sans lien conservé (appel échoué, § 5.3 point 4) : aucun reçu (choix de cette décision), ou reçu maison sans lien de Stripe ?
3. Lien externe vers le reçu de Stripe : même onglet ou nouvel onglet (avec l'UX) ? `rel="noopener noreferrer"` et `referrerpolicy="no-referrer"` sont exigés dans les deux cas.
4. Rappel des questions 1 à 5 de #884, encore ouvertes (textes du reçu simulé, heure de Zurich, reçu visible par `created_by` seulement, emplacement, reçu pour `mock`).

**Sécurité**
1. Verdict sur l'admission d'un `.npmrc` à la racine au contenu exact `minimum-release-age=20160` (§ 6), chemin gardé de la spécification P0c.
2. Accord sur le délai court retenu pour `adresseRecu` (2 s, aucune relance du SDK) et sur la lecture de la Charge développée en mémoire (seul `receipt_url` gardé, § 5.3 point 2).
3. Accord sur le refus, dans `src/server/log.ts`, de toute valeur contenant `pay.stripe.com` (§ 5.3 point 5).

**CEO**
1. Lister 0144 dans la note de version suivante ; reporter les questions ci-dessus.
2. Ordre : B4e (#887) après la fusion de 0144, migration d'abord ; vérifier l'interaction avec #866 (M1i, `MIGRATIONS_APPROUVEES`) si la migration de B4e doit y figurer.

## Conséquences

- Le reçu simulé est figé dans sa forme ; le reçu de Stripe suit en B4e, conservé une fois par paiement, rendu à la seule personne qui a payé.
- Le webhook Stripe fait au plus un appel à l'API de Stripe par paiement accordé, après sa transaction ; sa réponse et le droit n'en dépendent pas.
- Le dépôt refuse désormais toute version de paquet publiée depuis moins de 14 jours à la résolution.

## Quand revoir

Si la Sécurité revient sur l'option B ou sur l'une de ses conditions ; si le délai de 2 s s'avère trop court pour l'API de Stripe en mode test (paiements sans lien fréquents) : relance bornée ou repli sur l'option C, par une nouvelle décision ; si Stripe ne fournit pas `latest_charge` développée à `checkout.session.completed` pour TWINT (lien conservé au seul `asyncPaymentSucceeded`, à constater par B4e) ; avant tout mode réel (Q26, Q127) : valeur comptable du reçu, durée de conservation du lien, liste d'IP et horodatage futur du webhook (0140 « Quand revoir ») ; si un correctif de sécurité exige une version de moins de 14 jours (§ 6 point 4).

## Sources

- Revue consolidée de la PR #884 (head `d60ecc6`, 2026-10-29) et description de #884 (questions 6 à 11, migration esquissée).
- Tickets #886 et #887 (auteur Samoulou).
- pnpm 10.28.0 : `getOptionsFromRootManifest` (clés lues dans `package.json`), `pnpm config get minimum-release-age` ; `pnpm install --lockfile-only` relu le 2026-10-29.
- `main` au `89e4bd5` : `src/adapters/types.ts` l. 105-107, `src/contracts/billing.ts` l. 139-154, `src/server/payment/stripe.ts`, `src/server/payment/composition-stripe.ts`, `src/server/payment/evenement.ts` l. 13-24, `db/migrations/0001_securite.sql` l. 95-108 et l. 162-212, `tests/e2e/routes.ts` l. 151-154, `tests/unit/confinement/depot.test.ts`, `tests/unit/confinement/analyse.ts` (`analyserPackageJson`).
