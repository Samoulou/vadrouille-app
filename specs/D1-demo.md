# D1 — Section « Démonstration » de la page d'accueil

Rôle : frontend · Prérequis : F5a et F6 livrées dans `main` · Ticket : #56 · Référence : `docs/handovers/frontend.md` (§ 0 règles 1, 2, 8, 9 ; § 4 ; § 10 ; § 11 ; § 14), `docs/CONTEXT.md` (« Qui décide quoi »), `specs/F1-contrats-donnees-simulees.md` (règle d'import de `src/mocks`), `specs/F5-sejour-journee-fiche.md`, `specs/F6-presentation.md`, décision 0015 § 1 (`tripRoutes`).

## Objectif
Samuel, dans `#studio` : « il faut que tu présentes quand même quelque chose, beaucoup de choses sont faites mais rien n'est dispo pour test fonctionnel sur Vercel ». Les écrans 6, 6b, 11 et 12 existent sur le déploiement de `main`, mais `/` n'y mène pas. D1 ajoute à `/` une section « Démonstration », visible seulement avec l'adaptateur `mock`, qui ouvre ces parcours sur les données simulées d'Édimbourg. Aucun nouvel écran, aucune page `/dev`.

## À livrer
Section sous la promesse, sur `/`, uniquement quand l'adaptateur de données est `mock` (`DATA_ADAPTER` absent, vide ou `mock`) :

- titre de section (`h2`) « Démonstration » ;
- mention « Données simulées. Les lieux entre crochets ne sont pas vérifiés. » (style `corps-s`, `ink-soft`), placée avant les liens ;
- destination lue par l'adaptateur (`getTrip`) : « Voyage d'exemple : {destination} » ;
- liste (`ul` > `li` > `a`) de quatre liens, dans l'ordre du parcours :

| Libellé (`fr.json`) | Précision sous le libellé | Adresse |
|---|---|---|
| Tes premières propositions | J'aime / Pas pour moi, avant de débloquer | présentation du voyage `MOCK_DEMO_TRIP` (écran 6) |
| Suite du tri | Voyage débloqué | présentation du voyage débloqué (écran 6b) |
| Séjour | Le programme jour par jour | `tripRoutes("/voyages", <débloqué>).sejour()` (écran 11) |
| Jour 1 | Étapes et trajets du jour | `tripRoutes("/voyages", <débloqué>).jour(1)` (écran 12) |

Avec un autre adaptateur (`api` ou valeur inconnue), `/` reste tel qu'aujourd'hui : nom et promesse, sans erreur.

## Fichiers à créer ou modifier (proposition, le Tech Lead peut les déplacer)
- `src/adapters/index.ts` : `isMockAdapter(value = process.env.DATA_ADAPTER): boolean`, même normalisation que `getTripAdapter` (`trim`, absent ou vide = `mock`), `false` pour toute autre valeur, sans lever d'erreur ; test dans `src/adapters/index.test.ts`.
- `src/adapters/mock.ts` et `src/adapters/index.ts` : export `MOCK_DEMO_UNLOCKED_TRIP` (`{ ctx, tripId: EDIMBOURG_DEBLOQUE_TRIP_ID }`), sur le modèle de `MOCK_DEMO_TRIP` (D1-PO-3).
- `src/features/presentation/routes.ts` : `presentationRoute(tripId)` qui renvoie `/voyages/{id encodé}/presentation` (D1-PO-4), avec son test.
- `src/features/accueil/DemoSection.tsx` : composant serveur de la section ; reçoit la destination et les adresses.
- `src/app/page.tsx` : `export const dynamic = "force-dynamic"` ; lit `isMockAdapter()`, puis la destination par `getTripAdapter().getTrip(...)` ; rend `DemoSection` seulement en `mock`.
- `src/i18n/fr.json` : clés `accueil.demo.*` (titre, mention, voyage, libellés et précisions des quatre liens).
- `eslint.config.mjs` : `react/jsx-no-literals` étendu à `src/app/page.tsx` et `src/features/accueil/**`.
- `tests/unit/accueil.test.tsx`, `tests/e2e/accueil.e2e.spec.ts`, `tests/e2e/accueil.a11y.spec.ts`, `tests/visual/accueil.visual.spec.ts` et sa capture de référence.

## Critères d'acceptation
Test unitaire (`tests/unit/accueil.test.tsx`, rendu de la page avec `vi.stubEnv`) :
- [ ] `DATA_ADAPTER` absent, `""` ou `"mock"` : un `h2` « Démonstration », le texte « Données simulées » et une liste de exactement 4 liens, dans l'ordre du tableau.
- [ ] Les `href` valent `presentationRoute(MOCK_DEMO_TRIP.tripId)`, `presentationRoute(MOCK_DEMO_UNLOCKED_TRIP.tripId)`, `tripRoutes("/voyages", MOCK_DEMO_UNLOCKED_TRIP.tripId).sejour()` et `.jour(1)` ; aucun ne commence par `/dev`.
- [ ] `DATA_ADAPTER="api"` puis `"autre"` : ni section ni lien ; le nom et la promesse restent affichés ; aucune exception ; `getTripAdapter` n'est pas appelé.
- [ ] `NODE_ENV="production"` sans `VADROUILLE_DEV_PAGES` : la section est affichée (elle ne dépend pas des pages de développement).
- [ ] Le texte « Voyage d'exemple : Édimbourg » vient de l'adaptateur (aucune chaîne « Édimbourg » dans `src/app` ni `src/features/accueil`, vérifié par recherche dans le test).

Test e2e (`tests/e2e/accueil.e2e.spec.ts`, build de production, 390 × 844) :
- [ ] Sur `/`, chaque lien de la liste « Démonstration » est suivi (clic, puis retour à `/`) : la réponse de la page d'arrivée a un statut 200, n'est pas la page 404 de Next.js, et l'URL est celle de l'`href`.
- [ ] Arrivées vérifiées : écran 6 montre le bouton « J'aime » ; écran 6b le titre « Suite du tri » ; Séjour la région « Programme » ; Jour 1 un titre de document qui contient « Jour 1 ».

Accessibilité et style :
- [ ] axe sur `/` sans violation (`tests/e2e/accueil.a11y.spec.ts`).
- [ ] Chaque lien mesure au moins 44 × 44 px (`boundingBox`, e2e) ; focus visible (contour 2 px `line` décalé de 2 px).
- [ ] La liste est un `ul` de 4 `li` ; chaque lien a pour nom accessible son libellé suivi de sa précision.
- [ ] Aucune couleur, taille ou rayon en dur : `pnpm lint` (règle `ligne/no-hardcoded-colors`) et tokens Ligne seulement (`text-corps`, `text-corps-s`, `text-section`, `ink`, `ink-soft`, `line`, `hairline`, `radius-control`).
- [ ] Capture de référence de `/` en 390 × 844 (`tests/visual/accueil.visual.spec.ts`).
- [ ] `pnpm verify` au vert.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
- **D1-PO-1 — Condition d'affichage.** La section dépend uniquement de l'adaptateur (`isMockAdapter()`), jamais de `NODE_ENV` ni de `VADROUILLE_DEV_PAGES`. Elle disparaît d'elle-même quand `DATA_ADAPTER=api` sera posé. Aucune page `/dev` n'est liée et `VADROUILLE_DEV_PAGES` n'est jamais posée en environnement déployé.
- **D1-PO-2 — Parcours et libellés.** Quatre liens dans l'ordre du produit : présentation (écran 6), suite du tri après déblocage (6b), Séjour (11), Jour 1 (12). Libellés du handover § 10 : « Tes premières propositions » (jamais « Aperçu »), « J'aime / Pas pour moi », « Séjour », et le titre existant « Suite du tri » de `presentation.titre.suite`. Séjour et Jour 1 ouvrent le voyage débloqué, celui qu'on voit après « Débloquer ».
- **D1-PO-3 — Identifiants.** `src/mocks` ne s'importe pas hors des adaptateurs (F1) : les identifiants viennent de `MOCK_DEMO_TRIP` et du nouvel export `MOCK_DEMO_UNLOCKED_TRIP` de `@/adapters`. Aucun identifiant en dur dans la page.
- **D1-PO-4 — Adresses.** Séjour et Jour 1 passent par `tripRoutes`. La présentation n'a pas d'adresse dans `tripRoutes` (base `/dev/voyages` sans présentation) : `presentationRoute(tripId)` est ajoutée dans `src/features/presentation/routes.ts`. Le Tech Lead peut préférer une méthode de `tripRoutes` (D1-Q2).
- **D1-PO-5 — Rendu dynamique.** `/` passe en `force-dynamic` pour lire `DATA_ADAPTER` à la requête, comme les pages du voyage.
- **D1-PO-6 — Mention.** « Données simulées. Les lieux entre crochets ne sont pas vérifiés. » : explique les crochets des jeux simulés (handover § 0 règle 2) sans badge (règle 5).

## Hors périmètre
- Nouveaux écrans, « Mes voyages » (F11), création de voyage, paiement : les liens n'ouvrent que des écrans livrés.
- Toute donnée Google : aucun appel Places, aucun identifiant de lieu affiché sur `/`.
- Mesure (PostHog) des clics de démonstration.
- Positions simulées pour le voyage débloqué (voir D1-Q3).
- Configuration Vercel, variables d'environnement, promotion ou mise en production.

## Questions ouvertes
- **D1-Q1 — Samuel.** La section sera visible sur tout déploiement en `mock`, y compris le déploiement de `main` sur Vercel (environnement que Vercel nomme « Production »). Confirmes-tu que cette adresse sert de démonstration et qu'il ne s'agit pas d'une mise en production du produit ? Ne bloque pas D1.
- **D1-Q2 — Tech Lead.** `presentationRoute` séparée ou méthode `presentation()` de `tripRoutes` (décision 0015 § 1) ? Emplacement de `isMockAdapter` et `MOCK_DEMO_UNLOCKED_TRIP` ? À trancher à la revue ; ne change pas les critères.
- **D1-Q3 — Tech Lead.** Le voyage débloqué n'a pas de positions simulées (`src/adapters/mock.ts`) : Séjour et Jour 1 du lien affichent l'état de remplacement de la carte. Faut-il lui donner les positions d'Édimbourg (tâche à part) ? Ne bloque pas D1.
