# 0152 — Budget du JavaScript initial : frontières d'erreur racine allégées, textes de la plaque à part, chargement à la demande

Statut : **proposée, à confirmer par la revue**. Décision déléguée du **Tech Lead** (architecture, outillage : « Qui décide quoi » de `docs/CONTEXT.md`). Définitive dès sa fusion, **sans délai de veto** (décision 0093). À lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision.

Date : 2026-10-30 · Décideur : Tech Lead · Ticket : #949 (Q760) · Complète : 0016 § 3.1 (règle 5), 0021 § 7, 0022 § 4, 0039, 0047 · Relu : `main` `61c1855`.

Numérotation (vérifiée le 2026-10-30) : `main` va jusqu'à 0151 ; aucune branche `claude/…` n'ajoute 0152.

## Contexte
Avec M5b (#938) dans `main`, le test `budget: JavaScript initial par route` mesurait R11 (`/voyages/mock_trip_edimbourg`) et R12 (`/voyages/mock_trip_edimbourg/jour/2`) à environ 200 000 octets gzip, pour un seuil strict de 200 000 qui ne se relève pas (0016 § 3.1, 0047). M4c (#945) ne pouvait plus fusionner. Le ticket #949 demande au moins 8 000 octets de marge sur R11 et R12, sans relever le seuil, sans retirer de test ni changer l'interface.

Constats sur le build de production (Next.js 16.4, Turbopack ; Google bloqué, comme dans le test) :
1. **Frontières d'erreur racine.** `src/app/error.tsx` et `src/app/global-error.tsx` sont chargés par **toutes** les pages, chacun dans son propre bloc (6 451 et 6 602 octets gzip). Turbopack ne partage pas les modules entre ces blocs et celui de la page : chacun embarquait sa copie de `next/link` et de ses dépendances (environ 4 000 octets gzip) et de `@radix-ui/react-slot` (environ 2 200), pour les deux actions de `ErrorContent` (« Réessayer », « Retour à l'accueil »).
2. **Textes de la plaque.** `src/lib/dates.ts` lisait `messages.debloquer.plaque` : tout l'espace de noms `debloquer` (environ 1 300 octets gzip, écrans 9 et suivants) était embarqué par toute page qui affiche une date de voyage, Séjour et Journée compris (0047 § 5).

Pistes examinées et écartées :
- **`GoogleMapRenderer` à la demande dans `DayMap`** (`React.lazy`) : environ 3 000 octets de plus, mais deux tests unitaires de `DayMap.test.tsx` attendent le chargement Google après un seul tour de `act` ; ils échouent selon le temps de transformation du module. Écarté pour ne modifier aucun test ; à reprendre si une marge supplémentaire devient nécessaire (les tests attendraient alors le rendu par `waitFor`) ;
- **retirer `@radix-ui/react-slot` de `Button`** (son module reste copié dans le bloc de la mise en page du voyage) : la ligne du paquet et celle de son spécificateur dans `tests/unit/confinement/listes/` deviendraient « inutiles » et devraient être retirées ; écarté ;
- **`next/dynamic`** : spécificateur absent de la liste fermée `tests/unit/confinement/listes/specificateurs.ts` ; `React.lazy` et `import()` relatif, déjà employés (0039, `MoveSheet`, `ReportSheet`), suffisent ;
- **charger `ErrorContent` à la demande** : une page d'erreur doit s'afficher même quand le réseau vient de tomber ; un bloc à télécharger au moment de l'erreur pourrait manquer ; refusé ;
- **`ShareButton` à la demande** : environ 1 400 octets, mais le bouton est rendu au premier affichage d'un voyage débloqué ; sa frontière `Suspense` hydratée plus tard pourrait perdre un premier toucher ; écarté.

## Décision
1. **Frontières d'erreur racine sans `Button` ni `next/link`.** `ErrorContent` (rendu commun de `error.tsx` et `global-error.tsx`) n'importe plus que ses textes (`etats`), `EtatPage`, `useRouter` et les classes du bouton (`button-variants.ts`) : ni `Button` (donc ni `Slot`) ni `next/link`. « Réessayer » est un `<button type="button">` et « Retour à l'accueil » un `<a href="/">` ordinaire, avec les classes de `Button` (variantes `primary` et `text`) : mêmes éléments, mêmes classes, mêmes noms accessibles qu'avant. Le retour à l'accueil recharge la page, ce qui repart aussi d'un état propre après une erreur. La règle `@next/next/no-html-link-for-pages` y est désactivée sur cette seule ligne, avec renvoi à cette décision.
2. **Classes du bouton dans un module sans `Slot`.** `buttonVariants` passe de `Button.tsx` à `src/components/ligne/button-variants.ts`, avec `buttonClassName({ variant, size, tone }, className)` (mêmes défauts que `Button`, qui l'emploie). `Button.tsx` ré-exporte `buttonVariants` et ses types : aucun lecteur ne change. Un élément qui n'a besoin que du style du bouton importe `button-variants.ts`, jamais `Button.tsx`, quand le poids compte.
3. **Textes de la plaque à part.** Les clés `debloquer.plaque.*` deviennent l'espace de noms `plaque` (`src/i18n/fr/plaque.json`, une ligne dans `messages.ts`), contenu repris clé pour clé ; seul `src/lib/dates.ts` les lit. Aucun texte ne change.
4. **Règle générale.** Ce qui est chargé par toutes les pages (frontières d'erreur racine, mise en page racine) n'importe ni `next/link` ni un composant qui embarque une dépendance absente du bloc commun ; ce qui ne sert pas au premier rendu d'un écran (feuille ouverte par un geste, rendu qui dépend d'un état) se charge à la demande par `React.lazy(() => import("./Module"))` sous `Suspense`, comme `MoveSheet`, `ReportSheet` et `ShareSheet` (0039), avec un repli identique à l'état initial ou `null` et aucun texte nouveau ; un module de textes lu pour quelques clés par un module partagé se découpe (0047 § 5).
5. **Garde.** Le test de budget reste la garde finale ; il n'est pas modifié. Toute PR qui ajoute un import statique à une frontière d'erreur racine, à la mise en page du voyage ou à `src/lib/dates.ts` donne les chiffres du test de budget avant et après dans sa description.

## Mesures (build de production local, Google bloqué, même machine)
| Route | Avant (`main` `61c1855`) | Après | Gain |
|---|---|---|---|
| R11 `/voyages/mock_trip_edimbourg` (seuil) | 199 424 | **188 207** | 11 217 |
| R12 `/voyages/mock_trip_edimbourg/jour/2` (seuil) et Journée de T4 | 199 725 | **188 507** | 11 218 |
| R15 `/voyages/…/aujourdhui` (seuil) | 197 015 | 187 241 | 9 774 |
| R14 écran 14 (journal) | 201 187 | 189 970 | 11 217 |
| R-versions (journal) | 200 478 | 189 261 | 11 217 |
| R17 `/voyages` (journal) | 175 654 | 165 944 | 9 710 |

Les blocs propres aux deux frontières d'erreur passent de 6 451 et 6 602 octets gzip à 2 122 et 2 288 (`cva`, `EtatPage`, textes `etats`) ; le reste vient de l'espace de noms `debloquer`, que le Séjour et la Journée ne chargent plus. Toutes les pages en profitent ; les chiffres de chaque route sont dans la description de la PR. Le seuil de 200 000 octets ne change pas.

## Ce que cette décision ne tranche pas
Rien qui engage de l'argent, un compte externe ou des données personnelles. Aucune règle de Ligne, aucun texte, aucune référence visuelle ne change. Aucun test supprimé, désactivé ni modifié.
