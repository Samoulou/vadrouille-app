# 0146 — Erratum à 0141 : message propre de `hors_table` sur l'écran 1 de `api` (M1f)

Statut : **acceptée**. Décision déléguée : **UX/UI pour les textes**, l'écran n'étant pas maquetté (`docs/CONTEXT.md`, « Qui décide quoi » ; décision 0093) ; **Tech Lead pour le code** (code d'erreur, comportement, tests, écarts de confinement). Arbitrages consolidés par le **CEO** aux revues consolidées des heads `bcaa346`, `bc43913` et `5d3b37e` de la PR #885 ; la revue du head `5d3b37e` atteste la validation des deux textes du § 1 par l'UX/UI et l'avis favorable de la Sécurité (S-859-3). Définitive dès sa fusion, **sans délai de veto** (0093). À lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment par une nouvelle décision ; le Product Owner peut réécrire les deux textes du § 1 par une PR à part.

Date : 2026-10-29 · Décideurs : UX/UI (textes), Tech Lead (code) ; arbitrages consolidés par le CEO · Ticket : #880 · PR : #885 · Plan : `docs/plans/mvp-etapes-1-9.md`, ligne M1f · Décisions lues : 0093, 0125 § 6, 0129 § 3 et § 4, 0141 § 6.3, § 8.2, § 10, § 11 et § 13.

**Ce que cette décision n'engage pas.** Aucun argent, aucun appel Google : la garde `SEUILS_AUTOCOMPLETION_VALIDES` reste `false` et le crochet `accesReelApi` rend toujours `false`. Aucune migration, aucun événement de journal nouveau, aucun test supprimé ni désactivé. `controlerVilles`, `villes-mvp.json`, B9-PO-18 et Q626 sont inchangés.

## 1. Textes (`src/i18n/fr/creation.json`, `e1.erreurs`)

- **`horsTable`** (nouveau) : « Cette ville n'est pas encore proposée. Choisis une ville voisine ou une autre destination. »
- **`paysInconnu`** (rendu neutre, pour les deux adaptateurs) : « Ce pays n'est pas encore disponible. Choisis une autre ville. » Le renvoi au « site d'essai » est retiré.

Textes validés par l'UX/UI à la revue consolidée du head `5d3b37e` ; le Product Owner peut les réécrire (question notée dans la PR #885).

## 2. Code et comportement

1. **Code d'erreur nouveau `cityNotOffered`** (`FieldError`, `src/features/creation/validation.ts`). `hors_table` ne réutilise plus `cityUnavailable` : ce message dit que la recherche ne répond pas, ce qui est faux ici. `motifIndisponible` (panne, minute, jour) n'est plus touché par `hors_table`.
2. **Sous le champ.** Quand la recherche rend `hors_table`, `DestinationVille` affiche `err.horsTable` sous le champ Destination (relié par `aria-describedby`, `aria-invalid`). Il l'annonce aussi une fois dans la région `role="status"` du champ, pour les lecteurs d'écran seulement (texte visible une seule fois). Même règle pour les autres erreurs rendues par la recherche après un choix (`err.paysInconnu`, `err.nomIncomplet`). La région d'état n'entre dans `aria-describedby` que pour la confirmation d'une ville retenue, jamais en erreur : au focus, seul le message visible est lu. Le doublon possible est en navigation virtuelle (texte visible, puis texte `sr-only` de la région d'état) ; il est à vérifier au lecteur d'écran par l'UX avant M1h.
3. **Répété par « Continuer ».** Tant que la saisie n'a pas changé (comparaison aux espaces de début et de fin près, `trim()`), « Continuer » pose `cityNotOffered`, avec le même texte, au lieu de `selectCity`. La saisie identique n'est pas renvoyée à la recherche. Une saisie différente revient à `selectCity`.
4. **Levé à la frappe.** L'erreur rendue par la recherche tombe dès que le texte change. Une erreur posée par « Continuer » reste jusqu'au choix d'une ville. C'est la même règle sur le site d'essai et sur `api`.
5. **`pays_inconnu` sur `api`** affiche `err.paysInconnu`, et non plus `cityUnavailable`.

## 3. Amendements de 0141

- **§ 6.3 point 2** : « Aucun texte nouveau ; `hors_table` réutilise `cityUnavailable` (§ 8) » devient « Un texte nouveau, `err.horsTable`, et un code nouveau, `cityNotOffered`, pour `hors_table` (0146) ; `err.paysInconnu` rendu neutre ».
- **§ 8.2, second tiret** : « l'écran pose sur le champ l'erreur existante `cityUnavailable` […], sans texte nouveau » devient « l'écran affiche `err.horsTable` sous le champ, et « Continuer » pose `cityNotOffered` tant que la saisie n'a pas changé (0146 § 2) ».
- **§ 13** : la question « Product Owner et UX : un message propre à `hors_table` » est **traitée** par ce texte provisoire. Il reste à la faire valider par le Product Owner et l'UX, avec le texte de `err.paysInconnu`, et à décider si l'aide sur la confidentialité du logement (`e1.logement.aideEssai`, 0125 § 6, site d'essai seul aujourd'hui) s'affiche aussi sur `api`.
- **§ 8 et § 9** (autres mentions de « `cityUnavailable` » ou de « sans texte nouveau » pour `hors_table`) : lire `cityNotOffered` et `err.horsTable`.
- **§ 10, ligne T20** : le titre devient « écran 1 api » › « hors_table : erreur propre sur le champ (cityNotOffered), annoncée ; limite et limite_jour : messages de 0129 ; jamais l'état accès ».

## 4. Écarts acceptés du § 11 de 0141 (revue Sécurité S-859-3, heads `bcaa346` et `bc43913`)

- **Ligne 1.** La page de l'écran 1 (`src/app/(creation)/voyages/nouveau/page.tsx`) n'est pas une entrée de `FRONTIERE_P0R3B`. Elle a une seule arête nominative, `ARETE_PAGE_VILLES_API`, vers `src/server/composition/villes-api.ts` : la page doit être sans directive, et le terminal doit porter sa propriété. L'arête est testée avant le marquage du nœud, pour ne masquer aucun autre importateur du terminal, quel que soit l'ordre du parcours (test à deux départs dans les deux ordres).
- **Ligne 8.** Exception ESLint `SERVER_PATTERN_PAGE_VILLES` pour la seule page. Seul le nom `rechercheVilleApiOuverte` est admis (`allowImportNames`). Ses limites sont testées dans `tests/unit/lint/creation-lint.test.ts`, motifs `MOCKS`, `SIMULATED_MAP` et `SIMULATION` compris.
- **Ligne 4.** Aucune ligne `specificateurs.ts` n'est posée pour `src/server/villes/compteurs.ts` ni pour `src/server/villes/recherche.ts` : l'analyseur n'y relève rien, ces fichiers sont hors zone, et une ligne non utilisée ferait échouer « aucune ligne inutile ». Pour `villes-api.ts`, il ne relève ni `@/server/composition/clients-google` ni l'import de types `@/contracts/villes`. Les motifs `COMPTEURS_AUTOCOMPLETION` et `RECHERCHE_VILLES` ne sont donc pas créés.
- **Ligne 6.** Le scan du nom `autocomplete_daily_counts` porte sur les fichiers de code analysés et sur `db/migrations/`, hors tests et `docs/` ; `db/bootstrap/roles.sql` (commentaire) et `db/README.md` sont hors de cette portée. Le garde de `SEUILS_AUTOCOMPLETION_VALIDES` relève les affectations directes, par propriété, par crochets et par `Object.assign` ou `Object.defineProperty`. `Reflect.set`, la déstructuration et les alias dynamiques restent à couvrir à M1h avec la Sécurité.

## 5. Captures

L'état corrigé ne peut pas être capturé sur `api` tel que livré : tant que la garde et le crochet sont fermés, la page ne monte pas la recherche. Les captures de `docs/ux/captures/880/` (largeur 390, page entière : de 870 à 1 090 pixels de haut, d'où le suffixe `-390-pleine-page`) ont donc deux sources :

- **Barrière fermée** (`ecran1-api-barriere-fermee-*`) : serveur `api` local, code livré.
- **Recherche montée** (`ecran1-api-recherche-*` : liste, ville non proposée, « Continuer », ville retenue) : composant `CreateTripForm recherche="api"` avec des doubles locaux des actions (suggestions fictives, aucun appel serveur ni Google). Ils ont été montés sur une route de développement **non committée**, supprimée après la prise.

Les captures sur le vrai serveur `api`, recherche ouverte, sont à fournir par M1h, quand la garde et le crochet s'ouvriront, au format 390×844 et en locale `fr-FR` (les champs de date des captures présentes sont en `mm/dd/yyyy`, locale en-US du navigateur de capture). Le message d'erreur sans marque visuelle propre (`FieldMessage`, `src/features/creation/fields.tsx`) est un motif commun antérieur, signalé à l'UX pour une règle d'erreur commune, hors du périmètre de M1f.
