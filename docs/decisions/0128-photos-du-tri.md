# 0128 — Bout en bout : photos Google sur les cartes du tri d'un voyage d'essai (exception « appel à l'affichage »)

Statut : **proposée** par le rôle front, décision déléguée du **Tech Lead** (architecture, tests : « Qui décide quoi » de `docs/CONTEXT.md`), **à valider en revue** ; définitive à sa fusion, sans délai de veto (décision 0093). **Verdict Sécurité demandé** dans la PR. La demande vient de **Samuel** (2026-10-23 15:23 UTC, fil « Routine cycle du studio ») : « ajouter les photos dans la partie j'aime et j'aime pas ». Aucune migration. Elle ne supprime ni ne désactive aucun test.

Date : 2026-10-23 · Décideur : Tech Lead (proposée par front) · Spécification : `specs/E2E-essai-bout-en-bout.md` (règles allégées de 0123) · Décisions liées : 0011, 0027, 0046 (D13, D16), 0079, 0092, 0093, 0109, 0123

## Contexte

La carte du tri (`src/components/ligne/DeckCard.tsx`) affiche un emplacement vide « Photo du lieu ». Le contrat prévoit déjà `Proposal.photoUrl`, « chargé à la demande » et absent de l'enregistrement (`src/contracts/snapshot.ts`). Depuis 0092 et 0109, le studio évite les appels Google à l'ouverture d'un voyage (temps de trajet conservés) ; une photo, elle, ne peut **pas** être conservée (conditions de Places API, ci-dessous).

## 1. L'exception (bornée)

Une photo Google est **demandée à l'affichage** pour la carte du tri **affichée** d'un voyage d'essai, et pour son détail (même demande). C'est la **seule** exception à la règle « aucun appel Google à l'affichage » ; elle ne vaut que :
- pour le tri « J'aime / Pas pour moi » (`/voyages/[id]/presentation`), une photo par carte au plus, la carte courante seulement (jamais les suivantes en avance) ;
- pour l'adaptateur `prototype` (site d'essai, préversion de `p0-reel`), derrière la **même barrière que la relecture** : garde du mode réel ouverte, cookie d'accès valide ; en production, ou sans code d'accès, aucun appel ;
- pour une étape qui a un `placeId` (le seul identifiant stocké).

## 2. Ce qui est appelé, ce qui est gardé

- **Fiche** Place Details au seul masque `photos` : SKU « Place Details Essentials (IDs Only) », le moins cher qui contient `photos` (table des champs de Places API (New), relevée le 2026-10-23 : « Photos » figure dans « Place Details Essentials (IDs Only) ») ; sans prix ni plafond gratuit.
- **Média** de la première photo du lieu : `GET /v1/<nom>/media?maxWidthPx=800&skipHttpRedirect=true` (réponse JSON `photoUri`), SKU « Places API Place Details Photos », **7 USD les 1 000**, 1 000 gratuites par mois (page de tarifs, relevée le 2026-10-23, mise à jour du 2026-10-21). Ligne ajoutée à `prototype/config/prix-google.json` (`places_details_photos`).
- La clé serveur reste dans l'en-tête `X-Goog-Api-Key` de l'enveloppe ; le navigateur reçoit l'adresse `googleusercontent.com` de l'image, sans clé.
- **Rien n'est stocké** : ni l'adresse de l'image, ni le nom de ressource de la photo (« You cannot cache a photo name », documentation Place Photos), ni l'image, ni les auteurs ; aucun journal ne les porte, aucun prompt ne les voit. La photo passe par une action serveur (`photoDuLieuEssai`), dont la réponse n'est jamais gardée en cache. Côté navigateur, seule la mémoire de la page partage la demande entre la carte et son détail, 5 minutes au plus (aucun stockage, aucun cache HTTP). Le cache HTTP propre de l'image est celui que Google pose sur `googleusercontent.com` ; nous n'en ajoutons pas (« You must not pre-fetch, cache, or store Places API content », Places API policies).

## 3. Attribution (conditions de Places API, « Places API policies »)

- Sur la carte : « Photo : <auteurs> · Google Maps » sous forme de vignette sur la photo (texte, la carte est un bouton : aucun lien n'y est admis), annoncée par `aria-describedby`.
- Dans le détail (feuille ouverte par la carte) : la photo en grand, chaque auteur **lié à son profil** (`authorAttributions[].uri`) et « voir sur Google Maps » lié à la photo source (`googleMapsUri`) : « end-users must always have access to view the individual source photo […] on Google Maps » ; la version agrandie porte l'attribution complète. Liens gardés seulement en `https` sur un hôte Google.
- Texte alternatif : « Photo de <nom de l'étape> » ; le nom est le nôtre (`Stop.name`, nom maison), jamais une donnée Google.

## 4. Coût et décompte

Chaque photo réserve un **forfait** de nature `relecture` dans `prototype.forfaits` (`forfaitPhoto` : deux fiches au prix plein, 0,007 USD), par `reserverRelecture`, sous les limites du prototype (`LIMITES_PROTOTYPE`, levées par 0071) ; le registre en mémoire borne les appels à ces deux fiches. Aucun contrôle de la purge (0046 D16 point 8 protège ce qui est stocké ; une photo ne l'est pas). Ces appels sont **hors du fusible d'une exécution** (ils ont lieu à l'affichage, comme les relectures) mais **comptés** dans le décompte Google du prototype. Coût par voyage pour un tri de N cartes avec photo : N × 0,007 USD au prix plein (8 cartes : 0,056 USD ; 30 : 0,21 USD), nul tant que le mois reste sous 1 000 photos gratuites. Une carte revue (annulation, retour) dans les 5 minutes ne redemande rien.

## 5. Dégradation

Garde fermée, sans session, aucune photo, 404 du lieu, quota ou erreur Google, réponse mal formée, image qui ne charge pas : la carte garde son emplacement « Photo du lieu », sans message. La photo occupe la même boîte que l'emplacement (hauteur fixe) : aucun saut de mise en page.

## 6. Architecture (Tech Lead)

- `src/grounding/places-client.ts` : `createPlacesPhotosClient` (deux masques fermés, contrôle du nom de la photo et des hôtes) ; `src/server/composition/p0-reel.ts` : `composerPhotos` (garde de relecture exigée) ; `src/server/p0/photos.ts` : garde, réservation, appel, contrat — troisième importateur admis de la composition, importé par `src/instrumentation.ts` seul (test `tests/unit/p0/composition.test.ts`, liste étendue) ; `src/adapters/prototype-instance.ts` : `brancherPhotosEssai` ; `src/adapters/index.ts` : `photoLieuEssai` ; action `src/server/actions/photo-essai.ts` (`photoDuLieuEssai`, entrée stricte) ; `src/features/presentation/photo.ts` (demande à l'affichage ; le client n'appelle pas `fetch`, règle de confinement) ; `DeckCard` et `ProposalDetailSheet` (affichage).
- L'action ne lit pas le voyage (une lecture coûterait des relectures) : le `placeId` est contrôlé par sa forme ; la garde (code d'accès) borne qui peut demander une photo. Point soumis au verdict de la Sécurité.

## Conséquences testables

- client : masques et SKU exacts, clé en en-tête seulement, `skipHttpRedirect`, aucun second appel sans photo, nom de photo d'un autre lieu refusé, hôte d'image autre que `googleusercontent.com` refusé, liens non Google écartés (`src/grounding/places-client.test.ts`) ;
- action et adaptateur : fermés hors prototype, hors organisation de l'essai, entrée mal formée (`src/server/actions/photo-essai.test.ts`, `tests/unit/adapters/photos-essai.test.ts`) ;
- service : garde fermée et cookie absent sans connexion ni appel, refus de réservation sans appel, erreur du client sans levée ni donnée journalisée (`tests/unit/p0/photos.test.ts`) ;
- affichage : emplacement sans photo, photo et crédit annoncé, image en échec, lien vers le profil et Google Maps dans le détail (`src/components/ligne/DeckCard.test.tsx`, `src/features/presentation/sheets.test.tsx`, `src/features/presentation/photo.test.ts`) ;
- structure : composition, masques, SKU de la table, journal fermé (listes d'égalité étendues : `tests/unit/p0/composition.test.ts`, `tests/unit/p0/base-prototype.test.ts`, `src/server/usage/cout-google.test.ts`, `tests/unit/server/limiteur.test.ts`).
