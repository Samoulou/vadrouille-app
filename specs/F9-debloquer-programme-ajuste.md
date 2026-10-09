# F9 — Débloquer (écran 9) et Programme ajusté (écran 10)

Rôle : frontend · Prérequis : F6 (#44, fusionnée) ; voir « Prérequis vérifiables » · Ticket : #70 · Référence : `docs/handovers/frontend.md` (§ 0 règles 1 à 10, § 2, § 3, § 5 `DestinationPlate`, `Counter`, `StatusBanner`, `UndoToast`, `ChangeSet`, `Button`, § 6 écrans 6b, 9 et 10, règles de navigation et critère de l'écran 9, § 7 « Annulation », § 8, § 9 `Trip.unlocked`, `ChecklistItem`, `Change`, § 10 lignes « Paiement », « Essai gratuit », « Préférences », § 11, § 12 `paywall_viewed`, `payment_started`, `payment_succeeded`, § 14 scénario « débloquer », § 15 F9, § 16, § 17 point 2), `docs/produit/cadrage-v5.md` (§ 1 D9 et D11, § 3.1 écrans 6, 9, 10 et 17, § 3.2, § 3.3 « Recalcul par lot », § 3.5 bloc « Compte et paiement », § 4 « Produit en libre-service », § 6.4 ligne « Paiement », § 6.5 « Deux temps », § 6.8 `billing`, § 9 « Paiement confirmé côté serveur », tests de sortie « un paiement répété ne crédite pas deux fois »), `docs/CONTEXT.md` (phase 0 : aucun compte ni service payant avant G0 ; principes produit 3, 4 et 5 ; « Qui décide quoi »), `docs/design-system/README.md`, `docs/design-system/redaction.md`, `specs/F5-sejour-journee-fiche.md` (`DestinationPlate`, F5-PO-17), `specs/F6-presentation.md` (F6-PO-8, F6-PO-13, F6-PO-15), `specs/F7-remplacer-ajouter-deplacer.md`, `specs/F8-creation-compte.md` (F8-PO-17, F8-TL-9, F8-TL-10), `specs/B0-handover-backend.md` (PO-4, § 9 « Paiement en mode test »), `specs/D1-demo.md`, décisions `docs/decisions/0013` (§ 1.6, § 3.2, § 3.3, § 3.6), `0014` (§ 6), `0015` (§ 1, § 6), `0016` (§ 3, § 4.5, § 5, § 6, § 8), `0018` (règles communes, « Actions de fin d'écran », « Attente »), `QUESTIONS.md` (Q2, Q5, Q12, Q26, Q56, Q57, Q59, Q63, Q75, Q78, Q88, Q98, Q101).

Documents en revue, non fusionnés au 2026-10-09, cités pour cohérence sans en dépendre : handover back-end (PR #27, `docs/handovers/backend.md` : contrats `Offer`, `AdjustmentSummary`, « événement de paiement », table `billing`, § 9 paiement en mode test, tâche B10 « recalcul par lot ») ; décision UX/UI 0012 (PR #26 : rendu de `StatusBanner`).

Dossier UX : `docs/ux/dossier-ux.md` n'existe pas dans le dépôt (Q59) et `docs/ux/maquettes/` est vide (Q12). Les écrans 9 et 10 sont maquettés sur la page « Direction Ligne », mais sans PNG exporté : tout rendu et tout texte ci-dessous est marqué « provisoire (UX/UI) » et cède devant la maquette dès qu'elle sera exportée.

## Objectif
Livrer, sur données simulées, le passage de « Tes premières propositions » au voyage complet : l'écran 9 « Débloquer » (ce qui est inclus, prix unique, « Payer avec TWINT » ou « Payer par carte »), une redirection vers un **paiement simulé** interne, la confirmation, l'état « voyage débloqué », puis l'écran 10 « Programme ajusté » (ce qu'on a retenu, confirmé ou déduit et retirable ; ce qui a changé ; ce qui ne bouge pas ; réservations à faire). Celui qui ne paie pas garde ses premières propositions et n'est bloqué nulle part (critère de l'écran 9). Les événements de paiement du handover § 12 sont émis par l'enregistreur local de F6.

## Phase 0 : ce que F9 ne fait pas
- **Aucun paiement réel** : ni compte Stripe (Q26, ouverte), ni TWINT, ni clé, ni appel réseau vers un prestataire. Le « paiement » est une page interne de l'application qui dit qu'elle est simulée et qui ne demande aucune donnée de paiement.
- **Aucun prix inventé** : le montant vient de la configuration (Q2, tranchée par Samuel le 2026-10-08 : 29 CHF pour l'instant, révisable), jamais d'une constante dans un composant, jamais du navigateur.
- **Aucun moteur** : le « recalcul au déblocage » (cadrage § 3.3) est simulé par une fonction pure sur des remplacements précalculés (F9-PO-13), sur le modèle des brouillons simulés de F7 (décision 0016 § 5) ; le programme affiché par Séjour et Journée n'est pas modifié en phase 0.
- **Aucune persistance côté navigateur** et aucun service externe (mesure locale, F6-TL-3).

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| `Trip.unlocked`, `ChecklistItem`, `Change`, adaptateur `mock`, isolation par organisation, voyages `mock_trip_edimbourg` (non débloqué, 8 propositions) et `mock_trip_edimbourg_debloque` (6b), `getRequestContext()` | F1 (#11), F6 (#44) | décision 0013 § 3.6 |
| `DeckActions` local, `PreferenceSession`, `PresentationScreen`, `DeckEnd` (lien « Débloquer » vers `/voyages/[id]/debloquer`), `src/analytics` (`events.ts`, `track.ts`), `UndoToast`, `StatusBanner`, `Counter`, `Button`, `IconButton`, `provisoire.css` | F2 (#19), F6 (#44) | `specs/F6-presentation.md` |
| `DestinationPlate` | F5c (pas encore livrée) | `specs/F5-sejour-journee-fiche.md` ; voir F9-PO-18 si F5c n'est pas fusionnée |
| `ChangeSet` et forme de `Change` amendée (`added`, `moved`, `segment.label`) | F7a (pas encore livrée) | décision 0016 § 4.5 et § 8 ; prérequis de **F9b** seulement |
| Portée et horloge des simulations côté serveur, route de contrôle `R-sim` | F8b ou F8c (F8-TL-9, pas encore livrée) | voir F9-PO-18 si elle n'existe pas au démarrage |
| Événements en `zod/mini` et imports de valeur depuis `@/contracts/values` côté client | T4 | décision 0016 § 3 ; F9 suit la forme en vigueur dans `main` au démarrage |

## Périmètre
- Écran 9 « Débloquer » : `/voyages/[id]/debloquer`.
- Page de paiement simulé et page de confirmation (routes de référence ci-dessous, F9-TL-5).
- État « voyage débloqué » du voyage simulé, par voyage (B0 PO-4), avec ses effets sur la présentation (6b), Séjour et Journée.
- Écran 10 « Programme ajusté » : `/voyages/[id]/ajuste`.
- Session de tri conservée en mémoire entre la présentation, l'écran 9, le paiement simulé, la confirmation et l'écran 10 (F9-PO-14).
- Contrats de phase 0 `Offer`, paiement et `AdjustmentSummary`, adaptateur de paiement simulé (F9-TL-1, F9-TL-2, F9-TL-7).
- Événements `paywall_viewed`, `payment_started`, `payment_succeeded`, et deux ajouts : `payment_failed`, `preference_removed` (F9-PO-16).
- Entrée « Débloquer » dans la section « Démonstration » de la page d'accueil (F9-PO-17).

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Propositions détaillées dans « Propositions au Tech Lead » ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères qui en dépendent portent la mention « sous réserve de F9-TL-x » et désignent les routes par leur nom de référence : si le Tech Lead retient une autre forme, le critère s'applique à la forme retenue sans autre changement.
- Contrats de paiement et d'offre (F9-TL-1) ; interface et implémentation simulée de l'adaptateur de paiement, garde des environnements (F9-TL-2).
- Vue « débloquée » du voyage simulé dans l'adaptateur `mock` (F9-TL-3).
- Source unique du prix et code de variante (F9-TL-4).
- Routes du paiement simulé et de la confirmation, suivi de l'état (F9-TL-5).
- Portée, horloge et durées de la simulation de paiement (F9-TL-6).
- Contrat `AdjustmentSummary` et jeu simulé de l'ajustement (F9-TL-7).
- Conservation de la session de tri entre les routes (F9-TL-8).
- Schémas des événements (F9-TL-9) ; niveau de titre de `DestinationPlate` (F9-TL-10).
- Emplacement et noms des fichiers ci-dessous.

### Routes de référence
| Nom | Route | Source |
|---|---|---|
| `R6` | `/voyages/[id]/presentation` | handover § 6 (écrans 6 et 6b) |
| `R9` | `/voyages/[id]/debloquer` | handover § 6 |
| `R9-sim` | proposée `/voyages/[id]/debloquer/paiement-simule/[paiementId]` | **sous réserve de F9-TL-5** |
| `R9-retour` | proposée `/voyages/[id]/debloquer/confirmation?paiement=[paiementId]` | **sous réserve de F9-TL-5** |
| `R10` | `/voyages/[id]/ajuste` | handover § 6 |
| `R11` | `/voyages/[id]` | handover § 6 (Séjour, F5) |
| `R-sim` | route de contrôle des simulations de F8 (tests seulement) | F8-TL-9, **sous réserve de F9-TL-6** |

`[paiementId]` est un identifiant opaque et aléatoire créé par l'adaptateur (au moins 128 bits), jamais dérivé du voyage ni de la personne.

## Fichiers à créer ou modifier (proposition)
**F9a** (écran 9, paiement simulé, état débloqué) :
- `src/contracts/billing.ts` et son test ; réexport par `src/contracts/index.ts` (F9-TL-1).
- `src/adapters/types.ts` (`PaymentAdapter`), `src/adapters/index.ts` (`getPaymentAdapter()`, variable serveur `PAYMENT_ADAPTER`, garde F9-TL-2), `src/adapters/mock-payment.ts` et son test, `src/adapters/mock.ts` (vue débloquée, F9-TL-3), `src/adapters/simulation.ts` (paiements et droits dans la portée, F9-TL-6).
- Configuration du prix (F9-TL-4), par exemple `src/config/offer.ts`, lue côté serveur seulement.
- `src/features/presentation/` : `OfferScreen.tsx` (écran 9), `PaymentSimulation.tsx` (`R9-sim`), `PaymentReturn.tsx` (`R9-retour`), `payment-actions.ts` (actions serveur `startCheckout`, `simulateCheckoutOutcome`, `getCheckoutStatus`) et leurs tests, `price.ts` (fonctions pures `formatPrice`, `accessUntil`) et son test.
- Pages : `src/app/voyages/[id]/debloquer/page.tsx`, `src/app/voyages/[id]/debloquer/paiement-simule/[paiementId]/page.tsx`, `src/app/voyages/[id]/debloquer/confirmation/page.tsx` (F9-TL-5).
- `src/analytics/events.ts` : `paywall_viewed`, `payment_started`, `payment_succeeded`, `payment_failed`, et leurs tests.
- `src/features/accueil/DemoSection.tsx` et la page d'accueil : entrée « Débloquer » (F9-PO-17).
- `src/components/ligne/DestinationPlate.tsx` et son test, seulement si F5c n'est pas fusionnée (F9-PO-18) ; prop de niveau de titre (F9-TL-10).
- `eslint.config.mjs` : `react/jsx-no-literals` et la règle de F4 contre le stockage client étendues aux nouveaux fichiers et dossiers.
- Textes dans `src/i18n/fr.json` sous `debloquer.*` ; `tests/e2e/debloquer.e2e.spec.ts`, `tests/e2e/debloquer.a11y.spec.ts`, `tests/visual/debloquer.visual.spec.ts` et leurs références ; `tests/unit/payment-guard.test.ts` (garde F9-TL-2).

**F9b** (écran 10, session de tri entre les routes) :
- `src/contracts/adjustment.ts` et son test (F9-TL-7) ; `src/mocks/edimbourg-ajustement.ts` et son test ; fonction de lecture `getAdjustmentFixtures(ctx, tripId)` exportée par `src/adapters`.
- `src/features/presentation/adjustment.ts` (fonction pure `summarizeAdjustment`) et son test ; `TripSessionProvider.tsx` (F9-TL-8) et son test ; `AdjustedScreen.tsx` et son test.
- `src/features/presentation/PresentationScreen.tsx` et `actions.ts` : session initiale lue dans le fournisseur, filtrage des catégories arrêtées en 6b (F9-PO-14).
- Page `src/app/voyages/[id]/ajuste/page.tsx` ; montage du fournisseur (F9-TL-8).
- `src/analytics/events.ts` : `preference_removed`.
- Textes sous `ajuste.*` ; `tests/e2e/ajuste.e2e.spec.ts`, `tests/e2e/ajuste.a11y.spec.ts`, `tests/visual/ajuste.visual.spec.ts`.

## Comportement

### Parcours et navigation (F9-PO-1, F9-PO-2)
- Entrée principale : « Débloquer » à la fin de « Tes premières propositions » (`DeckEnd`, F6-PO-13). Autre entrée en phase 0 : la section « Démonstration » (F9-PO-17). F9 n'ajoute pas d'entrée sur Séjour ni sur Journée (F9-Q8, liée à Q63).
- Suite : `R9` → « Payer avec TWINT » ou « Payer par carte » → `R9-sim` → `R9-retour` → `R10` → « Continuer le tri » (`R6`, écran 6b) ou « Voir le programme » (`R11`).
- « Retour » (`IconButton`, en haut à gauche) : `R9` → `R11` (niveau supérieur : le voyage) ; `R9-sim` → `R9` (vaut « Annuler ») ; `R10` → `R11`. `R9-retour` n'a pas de « Retour » pendant l'attente : il propose les liens décrits plus bas.
- Historique : `R9-sim` et `R9-retour` **remplacent** leur entrée d'historique (`router.replace`), et la réussite remplace `R9-retour` par `R10`. Le retour du navigateur depuis `R10` mène donc à `R9`, qui affiche l'état « déjà débloqué » ; il ne ramène jamais sur la page de paiement simulé.
- Titres du document (provisoires, UX/UI) : « {destination} · Débloquer », « Paiement simulé », « {destination} · Confirmation du paiement », « {destination} · Programme ajusté ». Chaque écran a exactement un titre de niveau 1.
- Toutes les navigations du parcours sont côté client (`Link`, `router.push`, `router.replace`) : c'est ce qui garde la session de tri en mémoire (F9-PO-14).

### Sans payer, rien n'est bloqué (critère de l'écran 9 ; F9-PO-2)
- `R9` montre toujours, sous les boutons de paiement, « Continuer sans débloquer » (`Button` `text`, lien vers `R11`) et la phrase « Tes premières propositions restent accessibles, même sans payer. » (provisoires, UX/UI ; « Aperçu » interdit, handover § 10).
- Après une visite de `R9`, un paiement annulé, refusé ou expiré : `R6` affiche toujours les propositions de l'aperçu, `R11` et les journées de l'aperçu restent accessibles, comme avant ; aucune page ne redirige vers `R9` d'office, aucune feuille modale ne s'impose.
- Ce que montre un voyage non débloqué au-delà de ses premières propositions reste la question Q63 (Samuel) : F9 ne change pas Séjour ni Journée (F5-PO-17 s'applique).

### Écran 9 — Débloquer (`R9`) (F9-PO-3 à F9-PO-5, F9-PO-9)
Composant serveur qui lit le voyage (`getTrip`) et l'offre (`getOffer`, F9-TL-1) par `src/adapters` avec `getRequestContext()` ; voyage inconnu ou d'une autre organisation : 404.

Voyage **non débloqué**, dans cet ordre :
1. Titre de niveau 1 « Débloquer ton voyage » (provisoire, UX/UI).
2. `DestinationPlate` : nom de la destination (pas un titre de niveau 1 ici, F9-TL-10), ligne « {début} – {fin} · {voyageurs} » au format de F5 (« sam. 29.08 – jeu. 03.09 · 2 adultes »), couleur `dest-{destinationColor}`.
3. Prix : montant de `Offer` formaté par `formatPrice` (F9-PO-4), puis « Paiement unique pour ce voyage, sans abonnement. » (provisoire).
4. « Ce qui est inclus » (titre de niveau 2) : une ligne par code de `Offer.includes`, dans l'ordre des données, textes dans `fr.json` (F9-PO-3). Valeurs provisoires reprises du cadrage § 4, en attente de Samuel (F9-Q3, liée à Q57, Q63, Q88) :
   - `allDays` : « Toutes les journées de ton voyage, du {début} au {fin} » ;
   - `mealsAndEvenings` : « Les repas et les soirées » ;
   - `events` : « Les événements pendant ton séjour » ;
   - `replacements` : « Jusqu'à {n} remplacements pour ajuster ton programme » si `Offer.replacementLimit` est présent ; sinon « Des remplacements pour ajuster ton programme », sans nombre (Q88 ouverte : aucun nombre inventé) ;
   - `checklist` : « La liste à réserver avant de partir » ;
   - `calendarAndSharing` : « Le calendrier et le partage avec tes proches » ;
   - `access` : « Accès jusqu'au {date} », où {date} = `accessUntil(trip.end, Offer.accessDaysAfterReturn)` au format « 3 octobre 2026 » (cadrage § 4 : 30 jours après le retour).
5. Boutons, en pleine largeur (décision 0018, « Actions de fin d'écran ») : « Payer avec TWINT » (`primary`), puis « Payer par carte » (`secondary`) (F9-PO-5). Libellés imposés par le handover § 10 ; aucun logo de TWINT, de Stripe ni de réseau de cartes (F9-Q5).
6. « Continuer sans débloquer » (`text`) et la phrase « Tes premières propositions restent accessibles, même sans payer. ».
7. Avec l'adaptateur de paiement simulé : mention permanente « Démonstration : le paiement est simulé, aucun montant n'est débité. » en `corps-s` `ink-soft` sous le prix (provisoire). Aucune mention légale de vente n'est rendue en phase 0 (F9-Q2, juridique).

Appui sur un bouton de paiement : l'action serveur `startCheckout({ tripId, method })` (F9-PO-7) ; pendant l'appel, les deux boutons sont désactivés et « Préparation du paiement… » est annoncé (`role="status"`) ; en cas de succès, navigation vers l'adresse renvoyée (`R9-sim` en phase 0, `router.push` ; une adresse externe de prestataire viendra avec la tâche de paiement réel). Erreur : `StatusBanner` `error` « Le paiement n'a pas pu commencer. » avec « Réessayer » ; focus inchangé.

Retour sur `R9` après un échec (paramètre `?paiement=[paiementId]` lu par la page, F9-TL-5) : `StatusBanner` en tête de contenu, annoncé (`role="alert"`) :
- refusé : « Le paiement n'a pas abouti. Aucun montant n'a été débité. » ;
- annulé : « Paiement annulé. » ;
- expiré : « Ce paiement a expiré. Tu peux recommencer. » (textes provisoires, UX/UI). Les boutons de paiement restent disponibles.

Voyage **déjà débloqué** (F9-PO-9) : titre « Ton voyage est débloqué », `DestinationPlate`, liens « Voir ce qui a changé » (`primary`, `R10`) et « Voir le programme » (`secondary`, `R11`) ; aucun prix, aucun bouton de paiement, aucun `paywall_viewed`.

### Paiement simulé (`R9-sim`) (F9-PO-6)
- Page interne, servie seulement par l'adaptateur de paiement simulé (F9-TL-2) ; avec tout autre adaptateur : 404.
- Contenu : titre « Paiement simulé » ; « Démonstration : aucun paiement n'est effectué et aucune donnée de paiement n'est demandée. » ; récapitulatif « Voyage : {destination} », « Montant : {prix} », « Moyen : TWINT » ou « Moyen : carte » ; trois boutons : « Simuler un paiement réussi » (`primary`), « Simuler un refus » (`secondary`), « Annuler » (`text`) (provisoires, UX/UI).
- **Aucun champ de saisie** (aucun `input`, `select`, `textarea`), aucun numéro de carte, aucun QR code, aucune marque d'un prestataire réel : la page ne peut pas passer pour un vrai paiement.
- Chaque bouton appelle `simulateCheckoutOutcome(paiementId, outcome)` (`succeeded`, `declined`, `cancelled`), qui joue le rôle du webhook du prestataire (B0 § 9 : le droit n'est accordé que par la confirmation du prestataire), puis remplace l'adresse : réussite → `R9-retour` ; refus ou annulation → `R9?paiement=[paiementId]`.
- Paiement inconnu, d'un autre voyage ou d'une autre organisation : 404. Paiement déjà conclu (rechargement, retour du navigateur) : l'adresse est remplacée par `R9-retour`, qui affiche l'état réel.

### Confirmation (`R9-retour`) (F9-PO-8)
- Interroge `getCheckoutStatus(paiementId)` toutes les secondes (F9-TL-5), jusqu'à un état final.
- `pending` : titre « On confirme ton paiement » et squelette immobile (décision 0018, « Attente »), annoncé une fois (`role="status"`). Après 30 s sans état final : « La confirmation prend plus de temps que prévu. Ton voyage sera débloqué dès qu'elle arrivera. » avec le lien « Voir mes premières propositions » (`R6`) ; l'interrogation continue tant que la page est ouverte (provisoires, UX/UI).
- `succeeded` (ou `duplicate`, voir F9-PO-7) : l'adresse est remplacée par `R10`.
- `declined`, `cancelled`, `expired` : l'adresse est remplacée par `R9?paiement=[paiementId]`.
- Paiement inconnu, d'un autre voyage ou d'une autre organisation : 404.

### État « voyage débloqué » (F9-PO-10)
- Le déblocage porte sur **un voyage** (B0 PO-4), sous le même identifiant : après la réussite, `getTrip` renvoie `unlocked: true` pour ce voyage, dans la portée de simulation (F9-TL-3, F9-TL-6).
- Effets visibles : `R6` devient l'écran 6b « Suite du tri » (propositions non encore triées, `StatusBanner` `generating` pour les jours en préparation, F6-PO-13) ; `R9` passe à l'état « déjà débloqué » ; `R11` lit `unlocked: true`. Le contenu servi après déblocage est celui du voyage débloqué simulé de F6 (jours 3 et 4 à trier, J6 en préparation), sous l'identifiant du voyage payé (F9-TL-3).
- Les pages qui lisent le voyage le lisent à chaque requête : aucune page ne montre un état « non débloqué » mis en cache après la réussite.
- Les voyages simulés existants gardent leur état initial hors de la portée où le paiement a eu lieu : `mock_trip_edimbourg_debloque` reste débloqué, `mock_trip_edimbourg` reste non débloqué dans toute autre portée.

### Écran 10 — Programme ajusté (`R10`) (F9-PO-11 à F9-PO-15)
Composant serveur pour la lecture (voyage, jeu simulé d'ajustement) et composant client pour le contenu, qui lit la session de tri du fournisseur (F9-TL-8). Voyage inconnu ou d'une autre organisation : 404. Voyage non débloqué : l'adresse est remplacée par `R9` (F9-PO-15).

Dans cet ordre (textes provisoires, UX/UI) :
1. Titre de niveau 1 « Ton programme ajusté », puis « Ton voyage est débloqué. » en `corps` `ink`.
2. Si un jour a `generating: true` : `StatusBanner` `generating` « Jour {n} en préparation » (un par jour, comme F6-PO-13), immobile.
3. « Ce qu'on a retenu » (titre de niveau 2) : une ligne par préférence de `AdjustmentSummary.retained` (F9-PO-12) :
   - catégorie arrêtée, confirmée (réponse « Oui » à l'écran 7) : « On arrête {catégorie} » (libellés de catégorie de F6-PO-10, `presentation.categories.*`), avec la mention « Confirmé par toi » ;
   - distance confirmée : « On reste plus près de ton hôtel », « Confirmé par toi » ;
   - préférence déduite (B10, aucune en phase 0 avec le jeu simulé, mais rendue si les données en portent) : « Plus de {catégorie} », mention « Déduit de tes J'aime », contour en pointillé comme `Chip` `inferred` ; nom accessible contenant « déduit » ;
   - chaque ligne a un bouton « Retirer » (`Button` `text` `sm`, nom accessible « Retirer : {texte de la ligne} ») ;
   - aucune préférence : « Aucune préférence retenue : on garde ton brief tel quel. ».
4. « Ce qui a changé » (titre de niveau 2) : pour chaque jour touché, dans l'ordre des jours, un titre de niveau 3 (`Day.title`, « Samedi 29 août ») puis `ChangeSet` avec les changements du jour (F9-PO-13). Aucun changement : « Tu as tout gardé : ton programme ne change pas. ». Session absente (rechargement, ouverture directe) : « Tes choix de la présentation ne sont pas conservés après un rechargement de la page. » à la place de la liste (limite de phase 0, F9-PO-14).
5. « Ce qui ne bouge pas » (titre de niveau 2) : une ligne par changement `unchanged` du résumé (étapes verrouillées et engagements des jours touchés, « {nom} à {heure} ») ; `ChangeSet` ignore `unchanged` (décision 0016 § 8), d'où cette liste à part (cadrage § 3.2 : « ce qui ne bouge pas est rappelé »).
6. Bandeau `quai` (action requise, règle d'or 6) si `AdjustmentSummary.toReserveCount` > 0 : `Counter` avec la valeur, « réservations à faire avant de partir » (singulier : « réservation à faire avant de partir ») et le lien « Voir la liste » vers `R11` (où se trouve « À faire avant de partir », F5). Rien si la valeur est 0.
7. Actions de fin d'écran (décision 0018) : « Continuer le tri » (`primary`, `R6`) s'il reste des propositions à trier (`listProposals` du voyage débloqué non vide), puis « Voir le programme » (`secondary`, `R11`) ; sans proposition à trier, « Voir le programme » seul, en `primary`.

« Retirer » (F9-PO-12) : la ligne disparaît, le résumé est recalculé par `summarizeAdjustment` (une catégorie retirée ne filtre plus la suite du tri), `UndoToast` « Préférence retirée. » avec « Annuler » pendant 5 s (`role="status"`, focus non volé, délai suspendu au focus ou au survol, une action à la fois, comme F6-PO-6) ; « Annuler » restaure l'état exact et place le focus sur le bouton « Retirer » de la ligne restaurée. Après « Retirer », le focus va sur le « Retirer » de la ligne suivante, sinon de la précédente, sinon sur le titre « Ce qu'on a retenu ». F9 n'offre pas « Modifier » (hors périmètre).

### Session de tri entre les routes (F9-PO-14)
- Les décisions et réponses de la présentation (`PreferenceSession` de F6 et décisions par proposition) vivent en mémoire dans un fournisseur client, par voyage, le temps de l'onglet (F9-TL-8). Elles survivent aux navigations côté client entre `R6`, `R9`, `R9-sim`, `R9-retour`, `R10` et `R11`, et se perdent au rechargement, comme le brouillon de F8 (F8-PO-1).
- **Même voyage, même session** : quand `R6` affiche l'écran 6b du voyage payé, la session de l'aperçu continue (amende F6-PO-8 pour ce cas : 6 et 6b d'un même voyage partagent la session ; les deux voyages simulés distincts de F6 gardent chacun la leur). Une catégorie arrêtée (« Oui ») n'est pas présentée en 6b ; une question déjà posée ne revient pas ; la question de distance déjà posée ne revient pas.
- Aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies ; aucune décision dans l'adresse. Seul `paiement=[paiementId]` apparaît dans l'adresse.

### Le serveur fait foi (F9-PO-7)
- `startCheckout` revalide son entrée par le schéma de `src/contracts` (`tripId`, `method` ∈ `twint | card`, champ inconnu refusé) avant tout appel à l'adaptateur : erreur `invalid_input` (code provisoire de F8), sans appel ni état modifié. Le montant, la devise et la variante viennent de la configuration côté serveur, jamais de l'entrée.
- L'organisation est celle de `getRequestContext()` (décision 0013 § 3.6), jamais une valeur du navigateur ; quand l'adaptateur `auth` de F8 sera branché sur les pages (B3), `startCheckout` exigera une session (`unauthenticated`), comme `createTrip` (F8-PO-17).
- Voyage inconnu ou d'une autre organisation : `not_found` (même réponse dans les deux cas). Voyage déjà débloqué : `already_unlocked`, aucun paiement créé ; l'écran passe à l'état « déjà débloqué ».
- Le droit « voyage débloqué » n'est accordé que par la confirmation simulée (`simulateCheckoutOutcome` avec `succeeded`), traitée de façon **idempotente par identifiant d'événement** : la rejouer ne crée ni second droit ni second événement. Deux paiements ouverts pour le même voyage (deux onglets) : le premier confirmé débloque ; le second, confirmé ensuite, est enregistré `duplicate`, n'accorde rien de plus et mène à `R10` (le remboursement d'un vrai doublon relève de F9-Q4).
- Un paiement simulé expire après `checkoutTtlMs` (30 min en phase 0, configuration de l'adaptateur, F9-TL-6) : sa confirmation après expiration est refusée (`expired`).
- Aucun montant ni identifiant de paiement dans un journal autre que le code d'erreur.

## Jeu simulé d'ajustement (proposition ; forme : F9-TL-7)
Pour chaque activité de l'aperçu de `mock_trip_edimbourg`, un remplacement précalculé, servi quand la personne l'a écartée (« Pas pour moi ») ; noms entre crochets, aucune catégorie `museum` (scénario du handover § 14) :

| Proposition écartée | Remplacement simulé | Catégorie du remplacement |
|---|---|---|
| `prop-j1-chateau` | « [Ruelles de l'Old Town] » | `walk` |
| `prop-j2-dean-village` | « [Salon de thé de Stockbridge] » | `tasting` |
| `prop-j2-jardin-botanique` | « [Balade du Water of Leith] » | `walk` |
| `prop-j4-arthurs-seat` | « [Jardins de Princes Street] » | `nature` |
| `prop-j5-musee-national` | « [Marché couvert de Leith] » | `nature` ou le code `market` s'il existe (F8-TL-8) |
| `prop-j5-distillerie` | « [Dégustation de Canongate] » | `tasting` |

- Changement produit : `{ type: "replaced", time: stop.start, before: stop.name, after: <remplacement> }` dans le jour de la proposition.
- Repas : « Je choisis » sur une autre option que la première produit `replaced` (option 1 → option choisie) ; « Pas pour moi » sur la dernière option ne produit pas de `Change` (le créneau reste à choisir dans la journée, F5-TL-2) ; sans décision, rien.
- `unchanged` : pour chaque jour touché, ses étapes verrouillées (J1 : « [Royal Edinburgh Military Tattoo] » à 21:30).
- `toReserveCount` : nombre de `ChecklistItem` non faits du voyage tel que l'adaptateur le renvoie (non mis à jour par les remplacements en phase 0 ; voir Q104).
- `retained` : réponses « Oui » de la session (catégorie, distance), dans l'ordre des réponses, plus les préférences déduites que le jeu porterait (aucune).

## Événements de mesure (handover § 12 ; F9-PO-16)
| Événement | Quand | Propriétés |
|---|---|---|
| `paywall_viewed` | Chaque arrivée sur `R9` d'un voyage non débloqué (y compris le retour après un échec) | `price_variant` |
| `payment_started` | `startCheckout` réussi, avant la navigation | `method: twint \| card`, `price_variant` |
| `payment_succeeded` | Première observation de `succeeded` sur `R9-retour` pour un paiement **commencé dans cet onglet** (absent après un rechargement, comme `preview_ready` de F8) | `method`, `price_variant` |
| `payment_failed` (ajout) | Arrivée sur `R9?paiement=…` après un paiement commencé dans cet onglet | `method`, `price_variant`, `reason: declined \| cancelled \| expired` |
| `preference_removed` (ajout) | « Retirer » sur l'écran 10, quand le délai d'annulation expire sans « Annuler » | `category` (code, ou `distance`), `origin: confirmed \| inferred` |

`price_variant` est un code de configuration (par exemple `chf_29`, F9-TL-4), jamais un montant libre. Aucune autre propriété : ni identifiant de voyage, de paiement ou de proposition, ni destination, ni email, ni nom de lieu. `duplicate` n'envoie pas de second `payment_succeeded`.

## Règles Google et données personnelles
- **Aucune donnée Google dans un prompt** : F9 n'appelle aucun modèle.
- **Seul l'identifiant de lieu est stockable** : F9 ne stocke rien côté navigateur ; l'état simulé (paiements, droits) vit en mémoire du processus serveur, rangé par portée de simulation, sans écriture disque.
- **Pas de données Google affichées** : aucune carte ; les noms des changements sont des noms maison du jeu simulé (`Stop.name`), jamais un `displayName` (décision 0016 § 4.5).
- **Paiement** : aucune donnée de paiement saisie ni transmise ; aucun appel réseau hors de l'origine de l'application.
- **Environnements déployés** : l'adaptateur de paiement simulé ne doit jamais servir par mégarde sur un déploiement réel (F9-TL-2, F9-Q6).

## Tests

### Unitaires (Vitest, Testing Library, axe)
- `price.ts` : `formatPrice(2900, "CHF")` rend « 29 CHF » (espace insécable acceptée), `formatPrice(2950, "CHF")` rend deux décimales ; `accessUntil("2026-09-03", 30)` vaut `2026-10-03`.
- Adaptateur de paiement simulé : création (prix de la configuration), `already_unlocked`, `not_found` pour une autre organisation, issues `succeeded`, `declined`, `cancelled`, idempotence par identifiant d'événement, `duplicate`, expiration par l'horloge injectée, isolation de deux portées, remise à zéro.
- Actions serveur : entrée hors schéma (`method: "paypal"`, champ `amount` ajouté, `tripId` vide) → `invalid_input` sans appel à l'adaptateur (espion) ; un `amount` envoyé par le navigateur n'est jamais lu.
- Garde : `getPaymentAdapter()` lève une erreur avec `NODE_ENV=production`, l'adaptateur `mock` et sans drapeau de démonstration ; ne lève pas avec le drapeau, ni hors production (F9-TL-2).
- `summarizeAdjustment` : session vide, un refus, deux refus `museum` avec « Oui », option de repas 2 choisie, dernière option refusée, retrait d'une préférence, session absente ; jamais de `Change` pour une étape verrouillée.
- `OfferScreen`, `PaymentSimulation`, `PaymentReturn`, `AdjustedScreen`, `TripSessionProvider` ; schémas des événements.

### E2E, a11y et visuel (Playwright, 390 × 844, build de production, domaines Google bloqués)
Chaque test crée sa portée de simulation et la remet à zéro (F8-TL-9, sous réserve de F9-TL-6) ; l'horloge du serveur n'avance que par `R-sim`.
- `tests/e2e/debloquer.e2e.spec.ts`, `tests/e2e/ajuste.e2e.spec.ts`.
- `tests/e2e/debloquer.a11y.spec.ts` et `tests/e2e/ajuste.a11y.spec.ts` : axe sur `R9` (non débloqué, après un refus, déjà débloqué), `R9-sim`, `R9-retour` (attente, attente longue), `R10` (avec préférences et changements, sans changement, session absente, toast).
- `tests/visual/debloquer.visual.spec.ts`, `tests/visual/ajuste.visual.spec.ts` : mêmes états ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu ou un texte non maquetté (ou maquetté sans PNG, Q12) et peut être changée par UX/UI sans nouvelle décision du Product Owner (F9-Q1). Aucune ne fixe le prix, le contenu de l'offre ni le nombre de remplacements, réservés à Samuel.
- **F9-PO-1 — Parcours.** Fin de l'aperçu → 9 → paiement simulé → confirmation → 10 → « Continuer le tri » (6b) ou « Voir le programme » ; « Retour » vers le niveau supérieur (9 → Séjour, paiement simulé → 9, 10 → Séjour) ; paiement simulé et confirmation remplacent leur entrée d'historique, la réussite remplace la confirmation par 10 : le retour du navigateur ne ramène jamais sur le paiement. Raison : cadrage § 3.1 (9 puis 10) et § 4 (« le reste du voyage se génère pendant que l'utilisateur poursuit le tri »).
- **F9-PO-2 — Rien n'est bloqué sans paiement.** « Continuer sans débloquer » et la phrase « Tes premières propositions restent accessibles, même sans payer. » toujours visibles sur 9 ; aucune redirection d'office vers 9, aucune feuille imposée ; F9 ne change pas ce que montrent Séjour et Journée d'un voyage non débloqué (Q63).
- **F9-PO-3 — Contenu de l'écran 9.** Titre, plaque, prix et « Paiement unique pour ce voyage, sans abonnement. », liste « Ce qui est inclus » par codes de `Offer.includes` (textes dans `fr.json`, aucun texte d'interface dans les données), reprise du cadrage § 4 à titre provisoire en attendant Samuel (F9-Q3) ; « remplacements » sans nombre tant que Q88 n'est pas tranchée ; date d'accès calculée (fin du voyage + `accessDaysAfterReturn`, 30 selon le cadrage).
- **F9-PO-4 — Prix.** Montant entier en centimes et devise dans `Offer`, lus dans la configuration (29 CHF, Q2), jamais en dur ni depuis le navigateur ; affichage « 29 CHF » sans décimales pour un montant rond, deux décimales sinon (`Intl.NumberFormat("fr-CH")`, handover § 9). Pas de prix barré, pas de compte à rebours, pas de mention de prix de lancement.
- **F9-PO-5 — Moyens de paiement.** « Payer avec TWINT » en `primary` puis « Payer par carte » en `secondary` (cible suisse romande, cadrage § 1 ; TWINT est un paiement unique, cadrage § 6.4) ; aucun logo de marque en phase 0 (F9-Q5).
- **F9-PO-6 — Paiement simulé.** Page interne, explicitement « simulée », sans aucun champ de saisie ni marque de prestataire, avec trois issues (réussi, refus, annuler) ; seule disponible avec l'adaptateur simulé.
- **F9-PO-7 — Le serveur fait foi.** Revalidation de l'entrée (`invalid_input`), prix et variante côté serveur, organisation par `getRequestContext()`, `not_found` identique pour un voyage inconnu ou d'une autre organisation, `already_unlocked`, droit accordé seulement par la confirmation simulée, idempotente par identifiant d'événement ; un second paiement confirmé pour un voyage déjà débloqué est `duplicate` et n'accorde rien ; expiration après 30 min (simulation).
- **F9-PO-8 — Confirmation.** Interrogation toutes les secondes ; attente annoncée, message rassurant après 30 s avec un lien vers les premières propositions ; réussite → 10 ; refus, annulation, expiration → 9 avec un bandeau qui dit qu'aucun montant n'a été débité.
- **F9-PO-9 — Voyage déjà débloqué sur 9.** Ni prix, ni bouton de paiement, ni `paywall_viewed` ; liens vers 10 et vers le programme.
- **F9-PO-10 — Déblocage par voyage.** Même identifiant, `unlocked: true` ; 6 devient 6b ; contenu après déblocage = voyage débloqué simulé de F6 ; lecture à chaque requête.
- **F9-PO-11 — Contenu de l'écran 10.** Dans l'ordre : confirmation du déblocage, jours en préparation, « Ce qu'on a retenu », « Ce qui a changé » par jour avec `ChangeSet`, « Ce qui ne bouge pas », bandeau `quai` des réservations avec lien vers la liste de Séjour (la liste à cocher reste sur Séjour, pas de second endroit pour cocher), « Continuer le tri » s'il reste des propositions, « Voir le programme ». Écran 10 sans tri ultérieur : il résume le déblocage ; le résumé de fin de 6b reste à B10 (hors périmètre).
- **F9-PO-12 — Préférences retenues.** Confirmées = réponses « Oui » de l'écran 7 (catégorie, distance) ; déduites = celles que portent les données (B10 ; aucune en phase 0), en pointillé, nom accessible avec « déduit » ; chacune a « Retirer », annulable 5 s ; retirer une catégorie la rend de nouveau présentable en 6b ; pas de « Modifier » dans F9 ; aucune généralisation silencieuse : rien n'apparaît sans réponse de la personne ou sans marque « déduit ».
- **F9-PO-13 — Changements simulés.** `summarizeAdjustment(session, fixtures, trip)` : un remplacement précalculé par activité écartée, une option de repas choisie autre que la première, les étapes verrouillées des jours touchés en `unchanged` ; le programme de Séjour et Journée n'est pas modifié en phase 0 (limite assumée, levée par B10) ; `toReserveCount` = lignes non faites de la liste, non recalculées (Q104).
- **F9-PO-14 — Session de tri entre les routes.** En mémoire de l'onglet, par voyage ; survit aux navigations côté client, pas au rechargement (message dédié sur 10) ; 6 et 6b d'un même voyage partagent la session (amende F6-PO-8 pour ce cas) : catégories arrêtées non présentées en 6b, questions non reposées. Rien dans le navigateur ni dans l'adresse, hormis `paiement`.
- **F9-PO-15 — Écran 10 d'un voyage non débloqué.** L'adresse est remplacée par 9 (il n'y a rien d'ajusté avant le déblocage, cadrage § 3.3 « recalcul au déblocage »).
- **F9-PO-16 — Événements.** Propriétés du tableau ; `paywall_viewed` sans `method` (aucun moyen choisi à l'affichage) ; ajouts `payment_failed` (mesurer les abandons, cadrage § 4 « conversion de l'aperçu en paiement ») et `preference_removed` (mesurer les corrections de préférences, principe produit 3), envoyé à l'expiration du délai d'annulation pour ne pas compter un retrait annulé ; `payment_succeeded` une fois par paiement commencé dans l'onglet.
- **F9-PO-17 — Démonstration.** La section « Démonstration » de la page d'accueil (D1) gagne une entrée « Débloquer » (« Écran 9, paiement simulé ») vers `R9` de `mock_trip_edimbourg`, seulement quand l'adaptateur de paiement simulé est autorisé (F9-TL-2). Les quatre entrées de D1 ne changent pas.
- **F9-PO-18 — Découpage proposé au CEO.** Deux PR : **F9a** écran 9, paiement simulé, confirmation, état débloqué, événements de paiement, entrée de démonstration (critères [a]) ; **F9b** écran 10, session entre les routes, 6b du voyage payé, `preference_removed` (critères [b]). F9b attend `ChangeSet` (F7a). F9a réutilise la portée de simulation de F8 si elle est fusionnée ; sinon elle la crée selon la décision du Tech Lead sur F8-TL-9, et F8 la réutilise. Même règle pour `DestinationPlate` : si F5c n'est pas fusionnée, F9a la crée selon les props et le rendu de la spécification F5, et F5c la réutilise. Le CEO ordonne les tâches pour qu'aucune paire ne modifie le même fichier en parallèle (F9-Q9).

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
Aucun de ces contrats n'existe dans `src/contracts` au 2026-10-09 ; le handover back-end en revue (#27) les nomme (`Offer`, `AdjustmentSummary`, « événement de paiement ») sans être fusionné. Les formes ci-dessous décrivent le besoin fonctionnel ; elles ne sont pas acquises.
- **F9-TL-1 — Contrats de paiement (`src/contracts/billing.ts`).** Objets stricts : `PaymentMethodSchema` (`twint | card`) ; `OfferSchema` `{ tripId, amount (entier, centimes), currency: "CHF", priceVariant, methods: PaymentMethod[], includes: OfferInclusion[], replacementLimit?: entier ≥ 0, accessDaysAfterReturn: entier ≥ 0 }`, `OfferInclusion` = codes de l'écran 9 ; `CheckoutRequestSchema` `{ tripId, method }` ; résultat `{ ok: true; checkoutId; redirectUrl } | { ok: false; error }` ; `CheckoutStatusSchema` `{ checkoutId, tripId, method, status: pending | succeeded | duplicate | declined | cancelled | expired }`. Codes d'erreur provisoires `invalid_input`, `not_found`, `already_unlocked`, `expired`, alignés sur le contrat d'erreur de F8-TL-3. Lecture de l'offre : `getOffer(ctx, tripId)` (méthode de `TripAdapter` ou de `PaymentAdapter`, au choix).
- **F9-TL-2 — Adaptateur de paiement.** `PaymentAdapter` (`getOffer`, `createCheckout`, `getCheckoutStatus`, et pour le simulé seulement `simulateOutcome`), choisi par `PAYMENT_ADAPTER` (serveur, `mock` par défaut), appelé depuis des actions serveur ; simulé en mémoire du processus, rangé par portée (F9-TL-6), sans réseau. Garde sur le modèle de F8-TL-10 : erreur au premier appel si l'adaptateur est `mock`, `NODE_ENV` vaut `production` et qu'aucun drapeau explicite n'est posé (nom proposé `VADROUILLE_DEMO_PAYMENT=1`, posé par `playwright.config.ts` ; sur les déploiements : F9-Q6). La tâche de paiement réel (Stripe Checkout, après G0 et Q26) implémente la même interface ; `redirectUrl` deviendra externe.
- **F9-TL-3 — Vue débloquée du voyage simulé.** L'adaptateur `mock` consulte les droits de la portée : un voyage débloqué par paiement est servi avec `unlocked: true` et le contenu du voyage débloqué simulé (jours, propositions des jours 3 et 4, J6 `generating: true`), sous son propre identifiant ; `mock_trip_edimbourg_debloque` inchangé. Les pages concernées sont dynamiques (aucun rendu statique ni cache de données entre requêtes).
- **F9-TL-4 — Source unique du prix.** Un module de configuration serveur (par exemple `src/config/offer.ts`) donne `amount`, `currency`, `priceVariant` (`chf_29`) et `accessDaysAfterReturn` ; seul l'adaptateur le lit ; un test vérifie qu'aucun composant, aucun fichier de `src/features` ni `fr.json` ne contient le montant (`2900`, « 29 CHF »).
- **F9-TL-5 — Routes et suivi.** `R9-sim` et `R9-retour` sous `R9` (proposition), `paiement` en paramètre d'adresse ; interrogation de `getCheckoutStatus` toutes les secondes, comme F8-TL-6 ; lignes `curl` du job `docker` : `R9-sim` répond 404 dans l'image de production sans drapeau.
- **F9-TL-6 — Simulation.** Réutiliser la portée et l'horloge de F8-TL-9 : `reset` vide paiements et droits ; `checkoutTtlMs` (30 min) et `confirmationDelayMs` (0 par défaut ; un test le règle par `R-sim` pour observer `pending`) dans la configuration de l'adaptateur. Limite de la démonstration à trancher : dans la portée par défaut, tous les visiteurs d'une instance partagent les droits (un visiteur qui paie débloque `mock_trip_edimbourg` pour les autres) et les instances ne partagent rien (décision 0002) ; proposition : un droit simulé de la portée par défaut expire après `demoUnlockTtlMs` (30 min).
- **F9-TL-7 — Ajustement.** `src/contracts/adjustment.ts` : `AdjustmentSummarySchema` `{ tripId, retained: RetainedPreference[], days: { day, changes: Change[] }[], toReserveCount, generatingDays: number[] }`, `RetainedPreference` = `{ id, origin: confirmed | inferred, subject: { kind: "category"; category; direction: "less" | "more" } | { kind: "distance" } }` ; `AdjustmentFixturesSchema` (remplacement par `proposalId` : nom, catégorie) ; lecture par `getAdjustmentFixtures(ctx, tripId)` dans `src/adapters`, sur le modèle de `getRevisionFixtures` (décision 0016 § 6 : `null` hors organisation ou hors `mock`). `summarizeAdjustment` est une fonction pure qui passera dans `src/domain` avec B10, où le serveur renverra directement `AdjustmentSummary`.
- **F9-TL-8 — Session entre les routes.** Fournisseur client monté dans un layout commun à `R6`, `R9` (et ses sous-routes), `R10` et `R11` (par exemple `src/app/voyages/[id]/layout.tsx`, ou la racine), jamais dans un layout limité à l'une d'elles ; `createLocalDeckActions` reçoit la session initiale du fournisseur et l'y réécrit ; le fournisseur garde aussi les `checkoutId` commencés dans l'onglet (règle de `payment_succeeded`).
- **F9-TL-9 — Événements.** Variantes strictes de `src/analytics/events.ts` (forme `zod/mini` si T4 est passée, décision 0016 § 3) ; `price_variant` en énumération fermée tirée de la configuration ; `reason` de `payment_failed` et `origin` de `preference_removed` en énumérations. Question liée : `payment_succeeded` serait plus fiable émis côté serveur à la confirmation ; à prévoir avec l'enregistreur réseau (Q56).
- **F9-TL-10 — `DestinationPlate`.** Prop de niveau de titre (`as?: "h1" | "h2" | "p"`, défaut `h1` pour Séjour) : sur l'écran 9 le nom n'est pas le titre de niveau 1.

## Critères d'acceptation
Transverses :
- [ ] `pnpm verify` passe, sans clé ni service externe.
- [ ] **Aucune persistance locale** : après le parcours complet (aperçu, 9, paiement simulé réussi, refusé et annulé, 10, retrait et annulation, 6b), `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` et `caches.keys()` renvoient des listes vides, aucun cookie n'est posé par l'application ; le seul paramètre d'adresse ajouté par F9 est `paiement` (test `debloquer: aucune donnée persistée côté client`) ; la règle de lint de F4 contre le stockage client couvre les nouveaux fichiers.
- [ ] Aucune requête vers un autre hôte que l'application pendant les specs de F9 (zéro requête interceptée) ; `R9-sim` ne contient aucun élément `input`, `select` ni `textarea` (test).
- [ ] Le prix affiché vient de la configuration : en changeant la configuration du test à 3900, l'écran 9 et `R9-sim` affichent « 39 CHF » ; aucun fichier de `src/features`, `src/components` ni `src/i18n/fr.json` ne contient le montant (`2900` ni « 29 CHF ») (test unitaire, sous réserve de F9-TL-4).
- [ ] axe sans violation sur chaque état listé dans « Tests » ; contour de focus 2 px `line` décalé de 2 px ; chaque élément interactif mesure au moins 44 × 44 px ; chaque écran a un seul titre de niveau 1 (Playwright).
- [ ] Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` ; tous les textes dans `fr.json` sous `debloquer.*` et `ajuste.*` ; aucun texte « Aperçu », « Acheter maintenant », « Premium », « OK », « Valider », « Supprimer » ni point d'exclamation dans ces clés ni dans le rendu ; « Payer avec TWINT » et « Payer par carte » exactement ; `react/jsx-no-literals` actif sur les nouveaux fichiers.
- [ ] Les captures 390 × 844 de chaque écran et état sont jointes à la PR ; la PR liste les rendus provisoires (F9-Q1), les choix soumis au Tech Lead et l'absence de PNG des écrans 9 et 10 (Q12).

Écran 9, paiement simulé, état débloqué [a] :
- [ ] `/voyages/mock_trip_edimbourg/debloquer` : titre « Débloquer ton voyage », plaque « Édimbourg » avec « sam. 29.08 – jeu. 03.09 · 2 adultes », prix « 29 CHF », « Paiement unique pour ce voyage, sans abonnement. », les 7 lignes « Ce qui est inclus » dans l'ordre des données, dont « Accès jusqu'au 3 octobre 2026 » et « Des remplacements pour ajuster ton programme » (sans nombre, `replacementLimit` absent) ; « Payer avec TWINT » avant « Payer par carte » ; « Continuer sans débloquer » ; mention de simulation ; un `paywall_viewed` `{ price_variant }` (test `debloquer: contenu de l'offre`).
- [ ] Avec `replacementLimit: 10` injecté dans l'offre simulée, la ligne devient « Jusqu'à 10 remplacements pour ajuster ton programme » (test unitaire).
- [ ] **Sans payer** : depuis 9, « Continuer sans débloquer » mène à `R11` ; puis `R6` affiche de nouveau les 8 propositions de l'aperçu ; après un refus simulé et une annulation simulée, même résultat ; aucune page ne redirige vers 9 sans action de la personne (test `debloquer: premières propositions accessibles sans payer`).
- [ ] « Retour » de 9 mène à `R11` ; un voyage inconnu ou d'une autre organisation répond 404 sur `R9`, `R9-sim`, `R9-retour` (tests).
- [ ] « Payer avec TWINT » : `payment_started` `{ method: "twint", price_variant }`, navigation vers `R9-sim` qui montre « Paiement simulé », « Montant : 29 CHF », « Moyen : TWINT » ; « Simuler un paiement réussi » mène à `R9-retour` puis, sans autre action, à `R10` ; un seul `payment_succeeded` `{ method: "twint", price_variant }` ; le retour du navigateur depuis `R10` mène à `R9` à l'état « Ton voyage est débloqué », sans prix ni bouton de paiement, et sans nouveau `paywall_viewed` (test `debloquer: payer avec TWINT`, sous réserve de F9-TL-5).
- [ ] « Payer par carte » puis « Simuler un refus » : retour sur `R9` avec le bandeau `role="alert"` « Le paiement n'a pas abouti. Aucun montant n'a été débité. », boutons de paiement disponibles, `payment_failed` `{ method: "card", reason: "declined" }`, voyage toujours non débloqué ; « Annuler » sur `R9-sim` : « Paiement annulé. » et `reason: "cancelled"` (test `debloquer: refus et annulation`).
- [ ] Attente : avec `confirmationDelayMs` réglé par `R-sim` (sous réserve de F9-TL-6), `R9-retour` montre « On confirme ton paiement » annoncé par `role="status"` ; après 30 s d'horloge du navigateur, le message d'attente longue et le lien vers `R6` ; une fois l'horloge de la portée avancée au-delà du délai, passage à `R10` (test `debloquer: confirmation en attente`).
- [ ] Expiration : horloge de la portée avancée de `checkoutTtlMs` + 1 s avant la confirmation ; « Simuler un paiement réussi » mène à `R9` avec « Ce paiement a expiré. Tu peux recommencer. », `payment_failed` `reason: "expired"`, voyage non débloqué (test).
- [ ] **Un paiement répété ne crédite pas deux fois** : rejouer la même confirmation n'accorde aucun second droit ni second `payment_succeeded` ; deux paiements ouverts dans deux onglets pour le même voyage, confirmés l'un après l'autre : le second est `duplicate`, mène à `R10`, sans second `payment_succeeded` ; `startCheckout` sur un voyage débloqué renvoie `already_unlocked` (tests unitaires de l'adaptateur et e2e `debloquer: un seul déblocage`).
- [ ] **Le serveur fait foi** : `startCheckout` avec `method: "paypal"`, un champ `amount` ou un `tripId` d'une autre organisation renvoie `invalid_input` ou `not_found` sans appel à l'adaptateur pour les deux premiers et sans paiement créé ; `simulateCheckoutOutcome` sur un paiement d'une autre organisation renvoie `not_found` (tests unitaires).
- [ ] Après le paiement réussi : `R6` du même voyage affiche l'écran 6b (titre « Suite du tri », `StatusBanner` « Jour 6 en préparation », propositions des jours 3 et 4) ; `getTrip` renvoie `unlocked: true` ; dans une autre portée, `mock_trip_edimbourg` reste non débloqué (tests, sous réserve de F9-TL-3).
- [ ] L'adaptateur de paiement simulé refuse de servir avec `NODE_ENV=production` sans drapeau ; `R9-sim` répond 404 dans l'image de production sans drapeau (job `docker`) ; sans adaptateur simulé autorisé, l'entrée « Débloquer » de la démonstration n'est pas rendue (tests, sous réserve de F9-TL-2).
- [ ] Section « Démonstration » : une cinquième entrée « Débloquer » mène à `/voyages/mock_trip_edimbourg/debloquer` ; les quatre entrées de D1 sont inchangées (test).
- [ ] Événements : chaque événement est validé par son schéma strict ; une propriété `tripId`, `checkoutId`, `amount` ou un texte libre est refusée (test `analytics: événements de paiement sans donnée personnelle`).

Écran 10, session entre les routes [b] :
- [ ] **Scénario du handover § 14 « débloquer »** : dans l'aperçu, « Pas pour moi » sur le château puis le musée national, « Oui » à « On arrête les musées et monuments pour ce voyage ? » ; fin, « Débloquer », « Payer avec TWINT », « Simuler un paiement réussi » ; `R10` montre « On arrête les musées et monuments » avec « Confirmé par toi » et « Retirer » ; sous « Samedi 29 août », « [Ruelles de l'Old Town] à la place de [Château d'Édimbourg] » ; sous « Mercredi 2 septembre », le remplacement du musée national ; « Ce qui ne bouge pas » contient « [Royal Edinburgh Military Tattoo] à 21:30 » ; le bandeau `quai` montre le nombre de lignes non faites de la liste du voyage et « Voir la liste » mène à `R11` ; « Continuer le tri » mène à 6b, où « [Palais de Holyrood] » (catégorie `museum`) n'est pas présenté et où la question des musées ne revient pas (test `ajuste: écarter deux musées, débloquer, voir le programme ajusté`).
- [ ] Tout gardé (aucun refus) : « Tu as tout gardé : ton programme ne change pas. », « Aucune préférence retenue : on garde ton brief tel quel. » ; option 2 du dîner du J1 choisie : un seul changement `replaced` sous « Samedi 29 août » (tests).
- [ ] « Retirer » sur « On arrête les musées et monuments » : la ligne disparaît, `UndoToast` « Préférence retirée. » `role="status"` sans déplacer le focus ailleurs que décrit, « Annuler » dans les 5 s restaure l'état exact (égalité profonde) et place le focus sur « Retirer » ; sans « Annuler », un `preference_removed` `{ category: "museum", origin: "confirmed" }` à l'expiration, puis 6b présente « [Palais de Holyrood] » (tests `ajuste: retirer une préférence`).
- [ ] Une préférence déduite injectée dans le résumé est rendue en pointillé, « Déduit de tes J'aime », nom accessible contenant « déduit » (test unitaire de `AdjustedScreen`).
- [ ] Recharger `R10` : « Tes choix de la présentation ne sont pas conservés après un rechargement de la page. » à la place de « Ce qui a changé », aucune préférence de session ; ouvrir `R10` d'un voyage non débloqué remplace l'adresse par `R9` (tests).
- [ ] `R10` sans proposition restante à trier : « Voir le programme » seul, en `primary` ; avec `generating: true` sur J6 : « Jour 6 en préparation » (tests).
- [ ] Les voyages simulés distincts de F6 gardent des sessions séparées : les critères de F6 sur `mock_trip_edimbourg_debloque` restent verts (suite e2e de F6 inchangée).

## Hors périmètre
- Paiement réel : Stripe Checkout, TWINT, webhook signé, reçu, remboursement, factures, TVA (tâche back-end après G0, Q26 ; B0 § 9).
- Mentions légales de vente et conditions (F9-Q2, Q5, Q75), logos de marque (F9-Q5).
- Test de prix 19/29/39 CHF et variantes multiples (cadrage D9 : G1/G3) : une seule variante, celle de la configuration.
- Recalcul réel par lot, préférences déduites après trois « J'aime », réduction du budget de trajet, mise à jour du programme et de la liste « À faire » par l'ajustement : B10, B11 et la tâche de Q104.
- Résumé d'ajustement à la fin de 6b, « Modifier » une préférence, entrée « Débloquer » sur Séjour, Journée ou Mes voyages (F9-Q8, Q63, F11).
- Plafond et décompte des remplacements (Q88), ce que comptent les 8 propositions (Q57), affiliation (Q78).
- Hors-ligne, envoi réel des événements (Q56), grand écran (F12), thème sombre.

## Questions ouvertes
Nouvelles questions de cette spécification (numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **F9-Q1 (UX/UI)** : rendus et textes des écrans 9 et 10 (maquettés sans PNG, Q12), de la page de paiement simulé et de la confirmation : place du prix, liste incluse, boutons de paiement, mention de simulation, bandeaux d'échec, attente longue, lignes « Ce qu'on a retenu » (confirmé, déduit), « Ce qui ne bouge pas », bandeau `quai`, titres du document. Bloque : validation visuelle de F9, pas le code.
- **F9-Q2 (Samuel, juridique)** : mentions à afficher avant le paiement (identité du vendeur, conditions de vente, droit de rétractation ou renonciation pour un contenu numérique fourni immédiatement, remboursement, TVA, reçu) et acceptation explicite éventuelle. Liée à Q5 et Q75. Bloque : le paiement réel ; pas F9 simulé.
- **F9-Q3 (Samuel, offre)** : contenu et texte exacts de « Ce qui est inclus » (F9 reprend le cadrage § 4 : toutes les journées, repas et soirées, événements, remplacements, liste à réserver, calendrier, partage, accès 30 jours après le retour) ; le calendrier et le partage ne sont pas encore construits (F10). Liée à Q57, Q63, Q88. Bloque : le texte définitif de l'écran 9, pas le code.
- **F9-Q4 (Samuel, argent)** : un second paiement réel pour un voyage déjà débloqué (deux onglets, les deux membres du couple) est-il remboursé automatiquement, et le second voyageur doit-il pouvoir payer pour le même voyage ? Bloque : la tâche de paiement réel ; F9 enregistre `duplicate` sans second droit.
- **F9-Q5 (Samuel, marque et compte externe)** : afficher les logos TWINT et des réseaux de cartes sur les boutons (règles de marque de TWINT et de Stripe) ? Bloque : rien ; F9 n'affiche aucun logo.
- **F9-Q6 (Samuel, avec le Tech Lead)** : activer le paiement simulé (drapeau `VADROUILLE_DEMO_PAYMENT=1`, F9-TL-2) sur le déploiement de démonstration de `main` (Q98) et les prévisualisations, sachant que l'état est partagé entre visiteurs d'une même instance et non partagé entre instances (F9-TL-6) ? Liée à Q101. Bloque : la démonstration de F9 sur Vercel ; pas le code ni la CI.
- **F9-Q7 (Tech Lead)** : propositions F9-TL-1 à F9-TL-10 (contrats de paiement et d'ajustement, adaptateur et garde, vue débloquée, source du prix, routes, simulation, session entre les routes, événements, niveau de titre de `DestinationPlate`). Bloque : démarrage du code si le Tech Lead veut trancher avant ; sinon confirmées à la revue.
- **F9-Q8 (Samuel, offre, liée à Q63 ; puis UX/UI)** : où d'autre proposer « Débloquer » pour celui qui a passé la présentation (Séjour, Journée d'un jour hors aperçu, Mes voyages, email) ? Bloque : rien dans F9, qui n'ajoute que l'entrée de fin d'aperçu et celle de la démonstration.
- **F9-Q9 (CEO)** : découpage F9a et F9b (F9-PO-18) et ordre avec F5c (`DestinationPlate`), F7a (`ChangeSet`), F8b ou F8c (portée de simulation) et D1 (`DemoSection.tsx`). Bloque : création des tickets de code.
- **F9-Q10 (Samuel, offre)** : après le déblocage, le voyage payé libère-t-il la règle « un aperçu actif à la fois par compte » (cadrage § 4), pour qu'on puisse commencer un autre voyage ? Bloque : B9 et la tâche de paiement réel ; pas F9.

Questions existantes qui touchent F9 (reprises sans les trancher) :
- **Q2** (Samuel, tranchée) : 29 CHF, lu dans la configuration.
- **Q57** (Samuel) : ce que comptent les 8 propositions ; F9 n'écrit aucun nombre de propositions à l'écran.
- **Q63** (Samuel) : ce que montre un voyage non débloqué au-delà de l'aperçu ; F9 ne change pas Séjour ni Journée.
- **Q88** (Samuel) : nombre de remplacements et plafond ; ligne « remplacements » sans nombre.
- **Q78** (Samuel) : affiliation ; aucun lien de réservation sponsorisé ajouté par F9.
- **Q5, Q75** (Samuel, juridique) : règles Google et mentions légales ; voir F9-Q2.
- **Q26** (Samuel) : compte Stripe en mode test avec TWINT ; l'adaptateur simulé suit l'interface que la tâche réelle implémentera.
- **Q56** (Samuel) : PostHog UE ; événements enregistrés en local.
- **Q12, Q59** (Samuel) : maquettes et Dossier UX absents ; le scénario « débloquer » est écrit sans le plan de test et lui sera confronté.
- **Q104** (Product Owner, puis CEO) : mise à jour de la liste « À faire » par une révision ; `toReserveCount` n'est pas recalculé en phase 0.

Observation pour le CEO (sans décision) : le cadrage § 4 décrit l'aperçu comme « première journée et début de la deuxième », alors que les 8 propositions simulées couvrent les jours 1, 2, 4 et 5 (F1). F9 n'en dépend pas ; à rapprocher de Q57.
