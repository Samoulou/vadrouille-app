# 0143 — Photos du tri sur `api` (M1e) : barrière B9-TL-8 sans crochet, lieu lu en base, cadence `photo-tri`, client livré par M1h ; amendements de 0128 § 1 à § 5 et de 0101 § 4

Statut : **acceptée**. Décision déléguée du **Tech Lead** (architecture, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), sur proposition du rôle front ; le **CEO** la valide (arbitrages de la revue consolidée de la PR #882, head `c89c3f5`). Définitive dès sa fusion, **sans fenêtre de veto** (0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »).

Date : 2026-10-29 · Décideur : Tech Lead (proposée par front, validée par le CEO) · Ticket : #879 · PR : #882 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 1, § 1 (b) point 5 et ligne M1e · Décisions liées : 0010, 0027, 0081 (B9-TL-8), 0093, 0101 § 4, 0128, 0136, 0141 (§ 6.2, modèle de M1f) · Verdict Sécurité : **approuvé** (revue de la PR #882, head `c89c3f5`) : ligne de confinement de `src/adapters/api-photos-instance.ts`, ordre barrière → appartenance → limiteur, action sans `placeId`, aucune donnée Google stockée.

Numérotation : 0143 est réservé par le CEO pour cette PR.

**Ce que cette décision n'engage pas.** Aucun argent, aucun compte, aucune clé, aucun appel Google : la barrière reste fermée et **aucun client des photos n'est branché sur `api`** (§ 4). Aucune migration, aucune variable d'environnement nouvelle, aucune donnée Google en base, dans un journal ou dans un prompt. Aucun test supprimé ni désactivé. Les appels payants et l'ouverture de la barrière restent réservés à Samuel (plafonds de M1h).

## Contexte

0128 autorise, pour le **site d'essai** seulement (adaptateur `prototype`), une photo Google demandée à l'affichage de la carte du tri. La ligne M1e du plan porte cette photo sur `api` : `placeId` d'une proposition du voyage de l'organisation, photo jamais stockée. M1f (0141) a fixé, pour la recherche de ville de `api`, le modèle à suivre : barrière B9-TL-8 au lieu de la garde du mode réel et du code d'accès, limiteur et compteurs de l'app au lieu de `prototype.forfaits`, et rien du chemin d'essai dans la vraie app.

## 1. Barrière : B9-TL-8, sans crochet d'accès

1. Sur `api`, chaque photo commence par `evaluerBarriere({ plafondsNonNuls: plafondsDeGenerationPoses(PLAFONDS_USAGE) })` (`src/server/generation/barriere.ts`), **sans crochet `cookieValide`**. La barrière rend donc `production` ou `simulee` partout aujourd'hui, et toute photo vaut `null`.
2. Le crochet d'accès de `api` appartient à **M1h** (0141 § 6.2 point 1). Que M1h branche `accesReelApi` ou un crochet propre aux photos, c'est M1h qui le décide ; la ligne du crochet dans `src/server/photos/api.ts` est la seule à changer.
3. La page du tri lit le même état par `photosDuTriActives()` (`src/adapters/index.ts`). Barrière fermée ou client non branché : le navigateur **n'appelle pas** l'action et l'emplacement « Photo du lieu » reste (0128 § 5).

## 2. Ordre d'une photo et appartenance

Ordre tenu par `creerPhotosApi` (`src/server/photos/api.ts`), le premier refus l'emportant (refus : `null`, sans message) :
1. barrière (§ 1) ;
2. client branché (§ 4) : refus **avant toute lecture du voyage** ;
3. **appartenance** : le lieu est le `placeId` de la proposition `proposalId` du voyage `tripId`. Il est **lu en base** par `getTripReader()` (adaptateur `api`, RLS de l'organisation de la session), parmi les cartes que l'écran montre (`lieuDeLaProposition` : aperçu, sinon propositions ; étape commune `lieuDeLaCarte` avec le site d'essai). L'action n'accepte jamais d'identifiant de lieu (`PlacePhotoRequestSchema`, strict). Autre organisation, autre voyage, carte inconnue ou sans lieu, lieu mal formé : refus, sans limiteur ni client. Test sur base : `tests/db/photos-api.test.ts` ;
4. cadence (§ 3) ;
5. client construit, une photo, contrat `PlacePhotoSchema` revalidé (hôtes Google seulement).

Le terminal est branché au démarrage (`src/instrumentation.ts` → `src/adapters/api-photos-instance.ts`, modèle de `api-tri-instance.ts`), pour que `@/adapters` n'atteigne ni `src/server/env` ni la base (test « p0: clé côté serveur seulement »).

## 3. Cadence : action `photo-tri` du limiteur, 40 par heure et par adresse IP

1. Règle `photo-tri` de `RATE_LIMITS` (`src/server/config/limites.ts`) : `{ kind: "ip", windowSeconds: 3600, threshold: 40 }`, sur `action_rate_limits` (B3-TL-6). Aucune table nouvelle, aucune migration.
2. **Même nombre** que le site d'essai (`MAX_PHOTOS_PAR_HEURE` de `src/server/p0/photos.ts`, 0128 § 4). La valeur est **recopiée** et non importée, parce que rien du chemin d'essai (`@/server/p0/**`) n'entre dans la vraie app (plan, § 0.2 point 2). Le test `tests/unit/photos/photos-api.test.ts` compare la règle à `MAX_PHOTOS_PAR_HEURE` : un changement d'un côté fait échouer le test.
3. **Portée** : F13-TL-2 dit « 40 par heure et par session ». Le limiteur n'a de règle que par adresse IP ou par e-mail, et le site d'essai compte toutes sessions confondues (0128 § 4). La portée par adresse IP est donc retenue sur `api`. Un plafond par organisation et par jour, ou un compteur durable du coût, relève de M1h (§ 4).

## 4. Client : non branché ; découpage avec M1h

1. **Sous la barrière fermée, emplacement réservé.** La fabrique du client des photos de `api` vaut `null` par défaut (`CLIENT_PAR_DEFAUT`). Aucun client n'est construit, aucune clé n'est lue, aucun appel n'a lieu.
2. **Le branchement du client et son décompte sont livrés par M1h** (ticket à ouvrir par le CEO) : composition du client Places Photos de `api` (fabrique commune des clients Google, 0100 § 5.2), port de consommation, décompte du coût hors de `prototype.forfaits`, plafond par organisation, crochet d'accès (§ 1 point 2), avec nouvelle revue Sécurité (client construit après le limiteur, clé côté serveur seulement, coût décompté, adresses limitées aux hôtes Google).
3. **Critère d'acceptation de M1h** : sur `api` avec barrière ouverte, la photo de la première proposition s'affiche avec son crédit.
4. Point à trancher avec M1h (Sécurité, mineur 11 de la revue) : la lecture du lieu recompose les propositions (`listPreviewSlots`, `listProposals`) avant le limiteur. C'est sans effet tant que la barrière est fermée ou le client non branché, puisque la lecture n'a pas lieu. M1h choisit entre lire le seul `placeId` sans recomposer et placer le limiteur en amont.

## 5. Attribution

Dès que les photos sont demandées sur `api`, la mention « Données de lieux : Google » accompagne le paquet et le détail (0128 § 3, F13-PO-5). La page passe `placesFromGoogle={isPrototypeAdapter() || photos}`, et l'écran l'impose lui-même (`placesFromGoogle || photos`, `PresentationScreen.tsx`). Le crédit de la vignette (« Google Maps · Photo : … ») et la feuille de détail sont ceux de 0128 § 3, inchangés. Test : `src/features/presentation/photos-ecran.test.tsx`.

## 6. Amendements

- **0128 § 1 à § 5**, généralisés à l'adaptateur `api` :
  - § 1 : l'exception « appel à l'affichage » vaut aussi pour le tri de `api`, derrière la barrière du § 1 ci-dessus au lieu de la garde du mode réel et du cookie d'accès ;
  - § 2 : sur `api`, rien n'est stocké non plus ; le client est celui du § 4 ;
  - § 3 : attribution du § 5 ;
  - § 4 : cadence du § 3, aucun forfait de `prototype.forfaits` sur `api` ;
  - § 5 : même repli silencieux.
  Pour le site d'essai, 0128 reste la règle, inchangée.
- **0101 § 4** (importateurs de `@/server/generation/*`, lint `ligne/creation-imports`) : entrée nominative `{ importateur: "src/server/photos/api.ts", modules: ["src/server/generation/barriere"] }` dans `IMPORTATEURS_GENERATION_PAR_MODULE`, sur le modèle de `src/server/presentation/tri.ts`. Les cas admis et refusés sont testés dans `tests/unit/lint/creation-imports-lint.test.ts`.

## Conséquences testables

- Terminal : barrière fermée sans lecture, barrière par défaut fermée même avec toutes les conditions d'environnement, client non branché refusé avant le lieu, ordre complet, lieu refusé sans limiteur, cadence, contrat, règle `photo-tri` égale à `MAX_PHOTOS_PAR_HEURE` (`tests/unit/photos/photos-api.test.ts`).
- Adaptateur : appartenance et état de l'écran (`tests/unit/adapters/photos-api.test.ts`) ; sur base, organisation A contre voyage de B : `null` sans limiteur ni client (`tests/db/photos-api.test.ts`).
- Action : chemin `api`, `placeId` refusé (`src/server/actions/photo-essai.test.ts`).
- Écran : aucune demande sous barrière fermée ; attribution avec photos (`src/features/presentation/photos-ecran.test.tsx`).
- Démarrage : `tests/unit/server/instrumentation.test.ts`.
- E2e `api`, barrière fermée : `tests/e2e/photos-api.api.spec.ts`.
- Confinement : ligne `src/adapters/api-photos-instance.ts` (`tests/unit/confinement/donnees/lignes-textes.json`), points d'injection (`tests/unit/auth/points-injection.test.ts`).
