# 0124 — Bout en bout, lot 1 : premières propositions et déblocage simulé d'un voyage d'essai (paiement simulé sur `prototype`, cookie `__Host-p0_debloque`, règle provisoire du voyage d'essai, formes non maquettées)

Statut : **proposée** par le rôle front (PR #696, ticket #691), décision déléguée du **Tech Lead** (architecture, tests : « Qui décide quoi » de `docs/CONTEXT.md`), **à valider en revue** par le Tech Lead ; définitive à sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle n'engage ni argent (aucun prestataire de paiement, aucune API payante : le relecteur de trajets reste simulé dans les tests et l'e2e), ni compte externe, ni donnée personnelle (le cookie ne porte que des identifiants de voyage). Elle ne supprime ni ne désactive aucun test. Elle ne tranche rien de réservé à Samuel ; les choix d'interface non maquettés du § 7 sont soumis à l'UX (questions ouvertes). Le verdict Sécurité sur l'ouverture du paiement simulé à `prototype` est **approuvé** (revue consolidée de la PR #696, head `b5c86d3`).

Date : 2026-10-22 · Décideur : Tech Lead (proposée par front) · Ticket : #691 · Spécification : `specs/E2E-essai-bout-en-bout.md` (#690), lot 1 ; décision D4 de la spécification · Décisions liées : 0002, 0011, 0020 (§ 2.3, § 3), 0027, 0055 (§ 2), 0092, 0109, 0112 (§ 4), 0116 (§ 5.1), 0123

**Amende** : 0020 § 2.3 (`paymentAvailable`, § 1 ci-dessous ; le texte de 0020 est mis à jour dans la même PR). **N'amende pas** : 0011 (rien de Google n'est stocké ni mis dans un prompt ; le cookie ne contient aucun `placeId`), 0020 § 3 (la forme B reste celle de `mock` ; § 3 ci-dessous), 0055 § 2 (le cookie d'accès `__Host-p0_acces` est inchangé).

## Contexte

Le lot 1 de la spécification E2E-essai fait suivre à un voyage d'essai (`proto_…`, programme écrit par `p0Run`) le parcours de l'app : premières propositions, « J'aime / Pas pour moi », déblocage simulé, puis lecture de toutes les journées. Trois faits du code l'imposent :
- le paiement simulé n'était ouvert qu'avec `DATA_ADAPTER=mock` (0020 § 2.3) : sur `prototype`, `paymentAvailable()` était faux et `R9` répondait 404 ;
- le droit simulé vit dans la portée en mémoire du processus (`mockPaymentFor(scope)`) : il ne survit ni à un redémarrage, ni à une autre instance de préversion ;
- un programme écrit par `p0Run` ne porte aucune proposition enregistrée (`proposals: []`), contrairement aux programmes de test.

## 1. Amendement de 0020 § 2.3 : paiement simulé sur `prototype`, dans sa liste blanche

`paymentAvailable(env)` (`src/adapters/payment-guard.ts`) devient :
- faux si `PAYMENT_ADAPTER` n'est pas `mock`, ou si `isProductionDeployment(env)` est vraie (évaluée en premier, comme avant) ;
- `DATA_ADAPTER=mock` : `paymentDemoAllowed(env)` (inchangé) ;
- `DATA_ADAPTER=prototype` : `prototypeAdapterAllowed(env)` (préversion ou développement Vercel, `NODE_ENV` `development` ou `test`, ou `VADROUILLE_PROTOTYPE=1` avec `CI=true` ; jamais la production) ;
- toute autre valeur (`api`…) : faux.

Le drapeau `VADROUILLE_DEMO_PAYMENT` n'ouvre rien sur `prototype` : seule la liste blanche de l'adaptateur compte. Aucun prestataire, aucun e-mail, aucune écriture en base. Le confinement (`tests/unit/confinement/listes/process.ts`) admet le passage de `env` à `prototypeAdapterAllowed` (verdict Sécurité : approuvé, PR #696, `b5c86d3`). Tests : `tests/unit/payment-guard.test.ts` (cas `prototype` : préversion, test, CI ; production, `VERCEL_ENV=production`, `PAYMENT_ADAPTER=stripe` : faux).

## 2. État débloqué : cookie signé `__Host-p0_debloque`, sans migration

Retenu (proposition de la spécification, point « où garder l'état débloqué ») : un cookie signé, lié au code d'accès du mode réel, **sans table ni migration** (`src/server/essai/deblocage.ts`).
- **Forme** : `v1.<échéance>.<voyages>.<mac>` ; échéance en secondes Unix ; voyages = identifiants `TRIP_ID_PATTERN` triés, 20 au plus ; `mac = HMAC(K, "p0/v1/deblocage/" + organisation + "/" + échéance + "/" + voyages)`, `K = HMAC-SHA-256(code d'accès, "vadrouille/p0/deblocage/v1")`. Vérification en temps constant ; une autre organisation ne lit rien.
- **Attributs** : `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, `Max-Age` 30 jours.
- **Révocation** : l'échéance est **signée** (30 jours au plus, refusée au-delà ou si elle dépasse maintenant + 30 jours), comme le cookie d'accès ; et une **rotation du code d'accès** invalide tous les cookies d'un coup. Il n'y a pas de révocation d'un seul cookie (aucun état serveur) : c'est assumé pour un déblocage **simulé**, sans valeur marchande.
- **Écriture** : seulement par une action serveur, après un paiement simulé `succeeded` ou `duplicate` (`retenirDeblocageEssai`, appelée par `revalidateIfUnlocked` de `src/server/actions/paiement.ts`). Lecture : par `getTripReader()`, qui débloque si le droit simulé de la portée **ou** le cookie porte le voyage.
- **Garde** : la clé n'existe que garde du mode réel ouverte (`ouvertureP0(…, false)`, sans journal) ; garde fermée, rien n'est lu ni écrit et seul le droit de la portée reste. La clé est mémorisée par processus (l'environnement est figé pour un déploiement).
- **Exception à l'en-tête de `src/server/p0/acces.ts`** (« seul module » qui manipule le code et le cookie d'accès) : `deblocage.ts` ne lit jamais le code ni le cookie d'accès ; il reçoit les octets `attendu` de `ouvertureP0` et en dérive aussitôt une clé distincte, étiquetée. `acces.ts` relève du lot 2a (#689) et n'est pas modifié ici ; à sa prochaine retouche, son en-tête citera cette exception (ou exportera la dérivation).
- **Branchement** : `src/instrumentation.ts`, dans un `try` séparé de la lecture réelle ; échec : événement `essai.unlock_unavailable` (`errorName` seul).
- Tests : `src/server/essai/deblocage.test.ts` (signature, échéance, organisation, rotation, bornes ; `lire` et `retenir` avec `next/headers` et `ouvertureP0` simulés : garde ouverte ou fermée, attributs exacts) ; `tests/unit/essai-deblocage-branchement.test.ts` (`getTripReader` sur `prototype` : cookie seul, droit seul, ni l'un ni l'autre ; autre portée).

## 3. `withSimulatedUnlock` n'est pas branché sur `prototype`

Le décorateur de 0020 § 3 réécrit `Trip.unlocked` et sert la contrepartie débloquée d'un voyage `mock` (`counterpartOf`). Un voyage d'essai n'a pas de contrepartie : c'est l'adaptateur `prototype` qui sert l'aperçu ou toutes les journées selon un lecteur de déblocage (`LecteurDeblocage`) que `getTripReader()` lui passe. Le décorateur reste réservé à `mock`.

## 4. Règle provisoire du voyage d'essai (jusqu'au lot 4)

Un programme **sans proposition enregistrée** (`programme.proposals.length === 0`) est un voyage d'essai (`enParcours`, `src/adapters/prototype.ts`). C'est le **seul prédicat** : l'adaptateur l'expose par la méthode facultative `TripAdapter.isTrialTrip` (lue par `isTrialTrip` de `@/adapters`), et l'écran de présentation le reçoit dans `PresentationData.essai`. Aucun écran ne lit `isPrototypeAdapter()` pour ce parcours. Un programme de test (avec propositions) garde ses questions de préférence et n'a pas la phrase « choix sans effet ».

La règle est déduite de la forme du programme, faute d'indicateur écrit. **Le lot 4 la remplace** par un indicateur explicite écrit avec le programme ; d'ici là, un programme d'essai qui porterait des propositions serait servi comme un programme de test.

Voyage d'essai non débloqué : aperçu tiré du programme à la lecture (deux premières journées, 8 étapes au plus, aucun engagement saisi) ; seules les journées de l'aperçu sont servies par `getTrip`, `getDay`, `getDayMap`, `getTripMap` ; la relecture des trajets ne porte que sur les paires de ces journées (test exact par journée). Débloqué : toutes les journées ; `listProposals` sert la suite du tri (étapes hors aperçu).

## 5. Catégories de repli

Le programme écrit ne garde aucune catégorie : une proposition tirée d'un repas a la catégorie `restaurant`, d'une activité `heritage`. Conséquences : la répartition par catégorie de la mesure du tri (console) ne veut rien dire pour un voyage d'essai ; aucune question de catégorie n'est posée (`createLocalDeckActions({ questions: false })`). Le lot 4 ne relit **jamais** ces catégories comme des préférences : il les remplace par la catégorie écrite avec le programme.

## 6. Session de paiement en mémoire, compteurs de « Mes voyages »

- Le paiement simulé (offre, session, droit) vit dans la portée en mémoire du processus. Sur une préversion à plusieurs instances, le retour de paiement peut arriver sur une instance qui ne connaît pas la session (`not_found`, bandeau d'échec), et un redémarrage efface le droit ; le cookie du § 2 garde le déblocage déjà constaté. Accepté pour le lot 1 (préversion, un testeur). **Sortie** si le problème se voit : une session de paiement simulé **sans état**, signée comme le cookie (identifiant de voyage, organisation, échéance), à décider par amendement ; question ouverte au Tech Lead.
- « Mes voyages » (`listTrips`) compte les journées et les réservations sur le **programme entier**, même non débloqué (« 3 jours ») : le résumé annonce le voyage acheté, l'aperçu en montre le début. Écart documenté, pas aligné.

## 7. Formes non maquettées (soumises à l'UX)

- **Journées à débloquer** (Séjour, « Jour par jour ») : une ligne non interactive par journée absente, pastille réduite **non active, sans « complet »** (réservé à Déplacer), titre de la journée et mention « À débloquer » ; nom lu « Jour 3, à débloquer ». Ces lignes et le bouton « Débloquer » ne paraissent qu'avec un lien de déblocage (voyage non débloqué, routes `/voyages`, paiement simulé disponible).
- **Fin du tri** : phrase « Voyage d'essai : tes choix ne changent pas encore ton programme. » sous le titre, pour un voyage d'essai seulement. « Voyage d'essai » n'est pas dans le vocabulaire du handover § 10 (« Essai gratuit » y dit « Tes premières propositions ») ; libellé provisoire, à valider par l'UX.
- **Journée retirée** : `/voyages/<id>/jour/3` d'un voyage non débloqué répond **404**, comme une journée hors limites (aucune page « à débloquer » dédiée).

## Ce que cette décision ne tranche pas

- Les libellés et formes du § 7 (UX).
- L'indicateur explicite du voyage d'essai et les catégories écrites (lot 4).
- L'ouverture du paiement simulé en production (Samuel, Q131) : toujours fermée.

## Conséquences

- PR #696 : `src/adapters/payment-guard.ts`, `src/adapters/prototype.ts`, `src/adapters/prototype-parcours.ts`, `src/adapters/prototype-instance.ts`, `src/adapters/index.ts`, `src/adapters/types.ts`, `src/server/essai/deblocage.ts`, `src/server/actions/paiement.ts`, `src/instrumentation.ts`, `src/server/log.ts`, écrans de présentation et du Séjour, `prototype/programmes-essai/`, tests associés.
- 0020 § 2.3 renvoie à cette décision pour le cas `prototype`.

## Questions ouvertes (à reporter par le CEO dans `QUESTIONS.md`)

1. **Tech Lead** (ne bloque pas) : session de paiement simulé sans état (§ 6) — à faire avant un essai à plusieurs instances, ou plus tard ?
2. **UX** (ne bloque pas ; défaut appliqué) : forme des journées « À débloquer » et place du bouton (§ 7).
3. **UX** (ne bloque pas ; défaut appliqué) : libellé « Voyage d'essai : … » de la fin du tri, au regard du handover § 10.

## Quand revoir

- Au lot 4 : § 4 et § 5 sont remplacés.
- Si le paiement simulé échoue sur une préversion à plusieurs instances : § 6.
- À la retouche de `src/server/p0/acces.ts` : en-tête à aligner (§ 2).
