# F1 — Contrats Zod et données simulées Édimbourg

Rôle : frontend · Prérequis : F0 · Référence : `docs/handovers/frontend.md` (§ 0 règles 2 à 4, § 3, § 8, § 9, § 10 formats, § 15 F1), `docs/produit/cadrage-v5.md` (§ 2 benchmark Édimbourg, § 3.3, § 3.4, § 3.7, § 6.5, § 6.8), `docs/CONTEXT.md` (principes techniques 2 et 3), maquettes `docs/ux/maquettes/` (voir Q10)

## Objectif
Donner aux écrans une source de données unique et typée : les schémas Zod du handover § 9 dans `src/contracts`, un jeu de données simulé d'un voyage à Édimbourg dans `src/mocks`, et un adaptateur `mock` dans `src/adapters`, pour que le back-end branche plus tard l'adaptateur `api` sans toucher à l'interface.

## À livrer
- `src/contracts/trip.ts` : schémas Zod et types inférés (`z.infer`) pour `Weekday`, `Exception`, `Source`, `Stop`, `Segment`, `DayLineItem`, `Day`, `Trip`, `ChecklistItem`, `Proposal`, `Change`, avec exactement les champs du handover § 9, plus :
  - `Trip.organizationId: string` (obligatoire) : toute donnée appartient à une organisation (cadrage § 6.8, principe technique 3) ;
  - des objets stricts (`.strict()` ou équivalent) : tout champ inconnu est refusé, ce qui empêche d'y glisser des contenus Google (note, horaires, photos, coordonnées).
- Règles de validation dans les schémas :
  - heures au format `HH:MM` (00:00 à 23:59), dates ISO `AAAA-MM-JJ`, URL valides pour `Source.url` et `ChecklistItem.bookingUrl` ;
  - `Exception` limité à `toReserve | toConfirm | unconfirmed` ; au plus 2 exceptions par `Stop` (design system, Tag) ;
  - `Segment.minutes`, `Day.travelMinutes`, `Day.travelBudgetMinutes` : entiers positifs ou nuls ; `budgetPerPerson` : nombre positif ou nul, jamais une chaîne ;
  - `Proposal.option` : `1 ≤ index ≤ total ≤ 3` (cadrage § 3.4) ;
  - `Proposal.detour` obligatoire quand `travelFromPrevious.minutes > 20` (handover § 6, écran 6 ; cadrage § 3.7) ;
  - `Day.events` : uniquement des `Stop` de `kind: "event"`.
- `src/contracts/index.ts` : réexporte schémas et types.
- `src/mocks/edimbourg.ts` : un `Trip` complet et 8 `Proposal` (taille de l'aperçu, D11), construits d'après les maquettes :
  - 6 jours, du samedi 29 août au jeudi 3 septembre 2026 (voyage de référence du cadrage § 2 : arrivée à midi le J1, Tattoo le samedi à 21:30, une journée d'excursion dans les Highlands, une distillerie accessible en transports publics) ;
  - un `organizationId` fictif d'organisation personnelle ;
  - au moins un arrêt de chaque `kind`, un segment de chaque `mode`, un segment `estimated: true`, un temps libre, un repas, une étape `locked`, une exception de chaque type, une liste `checklist` avec au moins un élément fait, un élément à faire et un élément `sponsored` ;
  - parmi les propositions : au moins un repas avec `option`, une proposition avec trajet de plus de 20 min et son `detour`, aucune étape verrouillée ;
  - `travelBudgetMinutes` fourni par les données (jamais dans le code d'interface), valeur simulée en attendant le calibrage (Q8) ;
  - `placeId` absent ou fictif, préfixé `mock_` : aucun appel à Google n'a servi à construire le jeu ; aucune note, horaire d'ouverture, photo ou coordonnée ;
  - les contenus repris des maquettes gardent leurs crochets ; tout contenu ajouté pour compléter les 6 jours est écrit entre crochets (handover § 0, règle 2).
- `src/adapters/types.ts` : interface `TripAdapter`, chaque méthode reçoit un contexte `{ organizationId }` :
  - `getTrip(ctx, tripId): Promise<Trip | null>` ;
  - `getDay(ctx, tripId, index): Promise<Day | null>` ;
  - `listProposals(ctx, tripId): Promise<Proposal[]>`.
- `src/adapters/mock.ts` : implémentation qui lit `src/mocks/edimbourg.ts`, valide chaque sortie avec les schémas et ne renvoie rien pour une autre organisation.
- `src/adapters/index.ts` : `getTripAdapter()` choisit l'adaptateur selon la variable serveur `DATA_ADAPTER` (`mock` par défaut) ; la valeur `api` lève une erreur explicite « adaptateur api non implémenté ».
- Règle ESLint `no-restricted-imports` : `src/mocks` ne peut être importé que depuis `src/adapters` et les tests.
- Tests Vitest à côté des fichiers (`*.test.ts`).

## Critères d'acceptation
- [ ] `pnpm verify` passe.
- [ ] `TripSchema.parse(edimbourg)` et `ProposalSchema.array().parse(propositions)` réussissent (test).
- [ ] Les types exportés sont égaux aux types inférés des schémas (test `expectTypeOf`).
- [ ] Le jeu compte 6 jours, `index` de 1 à 6, dates consécutives du 2026-08-29 au 2026-09-03, `weekday` cohérent avec `date` (test).
- [ ] Chaque jour commence par un terminus `start` et finit par un terminus `end` ; entre deux arrêts ou terminus consécutifs se trouve au moins un segment ou un temps libre ; les heures ne reculent pas au fil de la journée (test : « aucun trou dans le programme »).
- [ ] Les identifiants d'étape sont uniques dans le voyage (test).
- [ ] Un `Stop` avec un champ inconnu (`rating`, `openingHours`, `photos`, `location`) est refusé par le schéma (test).
- [ ] Un `Stop` avec 3 exceptions, une exception `verified`, une heure `9:5` ou un `budgetPerPerson` en chaîne est refusé (test).
- [ ] Une `Proposal` à 25 min sans `detour` est refusée ; avec `detour`, elle est acceptée (test).
- [ ] Une `Proposal` de repas avec `option: { index: 4, total: 3 }` est refusée (test).
- [ ] Le jeu contient 8 propositions, dont aucune étape verrouillée, au moins un repas avec `option` et une proposition à plus de 20 min avec `detour` (test).
- [ ] Tout `placeId` du jeu commence par `mock_` ; aucune clé `lat`, `lng`, `location`, `rating`, `openingHours`, `photos` n'apparaît dans le jeu sérialisé (test).
- [ ] L'adaptateur `mock` renvoie le voyage pour son `organizationId` et `null` (ou une liste vide) pour toute autre organisation (test d'isolation).
- [ ] `getTripAdapter()` avec `DATA_ADAPTER=api` lève l'erreur attendue (test).
- [ ] Un import de `src/mocks` depuis `src/features` ou `src/app` fait échouer `pnpm lint` (test prévu, comme la règle anti-couleurs de F0).
- [ ] Aucun texte de montant formaté (« CHF ») dans les données : les montants sont des nombres (test).

## Hors périmètre
- Contrats des autres écrans (`TripDraft`, `Brief`, `LodgingSuggestion`, `GenerationStatus`, `PreferencePrompt`, `Offer`, `AdjustmentSummary`, `ReplacementPreview`, `PlaceSearchResult`, `MoveOptions`, `Today`, `TripSummary`, `TripReview`, `SharedTrip`) : spécifiés avec les tâches de leurs écrans.
- Adaptateur `api`, schéma de base de données, organisations et rôles côté serveur, authentification (B0, Q4).
- Coordonnées, carte et tracé (F4, Q3) ; photos (Q6).
- Formatage des dates, heures, durées et montants pour l'affichage (tâches d'écran).
- Second jeu de données (Zakynthos).
- Aucun écran ni composant.

## Questions ouvertes
- Q10 : maquettes et Dossier UX non exportés dans `docs/ux/` ; en attendant, le jeu suit le cadrage et le handover, contenus non vérifiés entre crochets, et la PR liste ce qui devra être aligné sur les maquettes (couleur de destination comprise).
- Q12 : les champs `name`, `meta` et `verifiedAt` de `Stop` et les textes `Day.title`, `Proposal.context` ; F1 reprend la forme du handover sur des données simulées, sans donnée Google.
