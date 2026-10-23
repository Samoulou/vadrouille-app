# 0129 — Écran 1 du site d'essai : la ville se choisit dans les suggestions Google (Autocomplete), plafond persistant, destination bornée

Statut : **proposée** par le rôle front-end (PR #732, branche `claude/e2e-ville-libre`), décision déléguée du **Tech Lead** (architecture, contrats, tests, « Qui décide quoi » de `docs/CONTEXT.md`) ; acceptée par l'approbation du Tech Lead dans la revue de la PR #732, avec le verdict de la **Sécurité** sur les points du § 9 ; **définitive à sa fusion**, sans délai de veto (décision 0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle ne supprime ni ne désactive aucun test.

**Correction 1** (revue consolidée de la PR #732, head `aa77422`, Tech Lead, Sécurité et UX) : cette décision répond au bloquant 1 et porte les choix des bloquants 2, 3, 5 et 8 et des mineurs 10, 15, 16, 17, 18, 20, 21 et 22.

Date : 2026-10-23 · Décideur : Tech Lead (proposée par front-end) · PR : #732 · Spécifications : `specs/E2E-essai-bout-en-bout.md`, `specs/F8-creation-compte.md` · Décisions liées : 0011, 0016 (§ 12), 0027 (§ 2), 0046 (D13), 0055 (§ 2 point 5), 0071, 0081, 0093, 0100 (§ 5.2), 0108, 0125 (§ 3)

Numérotation : `main` porte 0001 à 0127 ; la PR #731 (photos du tri, ouverte) réserve 0128. 0129 est le numéro libre suivant.

## Contexte

Le site d'essai n'acceptait que les 62 villes de la table maison `src/lib/fuseaux/villes.json`. Samuel, dans le fil « Routine cycle du studio » du projet, le 2026-10-23 :

- 14:44 UTC : « pourquoi je peux pas mettre n'importe quelle ville ? » ;
- **15:17 UTC** : « en fait ce qu'on peut faire pur chercher la ville c'est un autocomplete avec google maps et on sélectionne » (message `cmsg_0174CRqum9q8GNfZHmNHcYvRYCVZn2oGk6fQoKTvYHtNrG`) ;
- **15:23 UTC** : « permettre la selectiono de TOUTEs les villes de la planete a partir d'un autocopmlete google au dbéut » (message `cmsg_0174CRqum9q8GNfZHmNHcYvRQVxVZcmnRoUr3YN4XzvcTT`).

La demande porte sur l'écran 1 du **site d'essai** (adaptateur `prototype`) seulement. Le MVP (`mock`, `api`) ne change pas.

## 1. Ce que la décision lève et amende

1. **Lève 0016 § 12** (« Pas d'Autocomplete ») **et F8-PO-14** (« Destination […] sans autocomplétion ») **pour l'écran 1 du site d'essai seulement**. Le motif de 0016 § 12 (un appel Google à chaque frappe) est traité ici : une recherche par pause de frappe, au moins 2 caractères, un jeton de session, et le plafond persistant du § 3. La recherche « Ajouter un lieu » (B11) reste régie par 0016 § 12.
2. **Amende 0100 § 5.2 et 0108** : la fabrique commune des clients Google (`src/server/composition/clients-google.ts`) a un troisième importateur hors des tests, `src/server/composition/villes.ts`. Il n'importe pas `@/server/relecture`. Ce sont `IMPORTATEURS_CLIENTS_GOOGLE` de `eslint-rules/grounding-imports.mjs`, `tests/unit/lint/grounding-lint.test.ts`, `tests/unit/p0/composition.test.ts` et les lignes nominatives `COMPOSITION_VILLES` de `tests/unit/confinement/listes/specificateurs.ts`. `src/instrumentation.ts` reste le seul importateur de `@/server/composition/lecture` (0108).
3. **Méthode facturée `places_autocomplete`** ajoutée à `METHODES` (`src/server/usage/port.ts`). Aucun forfait d'exécution n'en porte : le registre en mémoire la refuse toujours (`registre.ts`). Ce refus est un garde-fou, pas du code mort : il empêche un client d'exécution d'appeler Autocomplete.
4. **Deux SKU** dans `prototype/config/prix-google.json` (relevé du 2026-10-23) :
   - `places_autocomplete_requests` : 2,83 USD les 1 000, 10 000 gratuits par mois ;
   - `places_autocomplete_session_usage` : 0 USD, sans tranche gratuite (`gratuitParMois: null`, admis par le schéma, test `cout-google.test.ts`).
   La fiche du choix est facturée en `places_details_essentials` (5 USD les 1 000, 10 000 gratuits par mois), masque fermé `id,addressComponents,location`.
5. **Contrat** : `TripDraft.destinationRegion` (`src/contracts/creation.ts`), facultatif, par addition : `{ placeId, country, timeZone }`. Il est lu par l'adaptateur `prototype` seulement ; `mock` et `api` l'ignorent.
6. **Frontière de P0r3b** (`tests/unit/p0/imports.test.ts`) :
   - une **entrée** `src/server/actions/villes-essai.ts`, admise si son prologue porte `"use server"` ;
   - un **terminal** `src/server/composition/villes.ts`, admis sans être parcouru, au-delà d'une entrée admise seulement, s'il importe `server-only`, ne porte aucune directive, et si ses imports exécutés sont exactement ceux d'`IMPORTS_TERMINAL_VILLES` (test négatif sur le dépôt réel).
   Le test « clé côté serveur seulement » ne parcourt donc plus la chaîne `villes.ts` → `clients-google.ts` → `places-client.ts` → `src/server/env` (mineur 17). C'est accepté : la chaîne est bornée par nom, `server-only` ferait échouer la construction d'un paquet client, et ce sont les mêmes règles que le terminal `src/workflows/index.ts` (P0r3d).

## 2. Parcours

1. La personne tape au moins 2 caractères. Après une pause, l'action `suggererVillesEssai` appelle Autocomplete (New), filtré sur `(cities)`, en français, avec un jeton de session créé par le navigateur.
2. Les suggestions (textes Google) s'affichent dans une liste ARIA (combobox), avec l'attribution « Google Maps » (§ 5). Elles ne sont ni stockées ni journalisées, et ne partent jamais vers un modèle.
3. Au choix, l'action `choisirVilleEssai` lit la fiche Essentials dans la même session (ce qui clôt la session). Seuls le code ISO du pays et la position sont lus, en mémoire.
4. Le serveur rend au navigateur des **valeurs maison** seulement, plus le `placeId` :
   - le code et le nom français du pays, de la table `pays.json` ;
   - le fuseau de la table : celui de la ville si `villes.json` la connaît dans ce pays, sinon le seul fuseau du pays, sinon le fuseau du repère maison le plus proche de la position ;
   - le nom maison de la ville, s'il existe.
5. Si la recherche ne répond pas (garde du mode réel fermée, base indisponible, migration 0019 absente, panne Google), l'écran se replie sur la table maison des villes, comme avant.

Les deux actions passent par la **même barrière que le lancement** : garde du mode réel ouverte (`ouvertureP0`, jamais en production) et cookie d'accès valide (`__Host-p0_acces`). Sans cookie, l'écran ouvre la saisie du code.

## 3. Plafond persistant (bloquant 2, voie a)

Le port en mémoire du head `aa77422` bornait chaque action à un appel, mais rien ne bornait le nombre d'actions. Désormais, **avant tout appel Google**, chaque action réserve une ligne dans `prototype.forfaits`, comme les autres forfaits du site d'essai.

1. **Migration 0019** (`db/migrations/0019_recherche_ville_prototype.sql`, retour arrière dans `.down.sql`) :
   - nature `ville` admise ; comme `relecture`, sans exécution ni coût de modèle ;
   - colonne `autocomplete_requests` : 1 pour une ligne de suggestions, 0 ailleurs ; la fiche du choix compte 1 dans `place_details_requests` ;
   - colonne `acces_empreinte`, exigée pour `ville` seulement, au format hexadécimal de 64 caractères ;
   - index partiel pour le débit par cookie ;
   - `INSERT` de ces deux colonnes pour `vadrouille_prototype`.
   Aucune donnée Google en base : ni `placeId`, ni texte, ni position.
2. **Réservation** (`reserverVille`, `src/server/usage/neon.ts`) : même transaction, même contexte d'organisation et même verrou consultatif que les autres forfaits. Elle lit les sommes du jour de quota Google (`prototype.quota_day_at`, Pacifique) et le nombre de lignes du même cookie dans la dernière minute, puis :
   - au-delà du débit du cookie : refus `ville_debit_atteint` ;
   - au-delà du plafond du jour de l'action : refus `ville_jour_atteint` ;
   - sinon : insertion et `COMMIT`.
   Un refus n'écrit rien (`ROLLBACK`). L'écran affiche « Trop de recherches de villes pour le moment. Réessaie dans une minute. ».
3. **Échec fermé** : base injoignable, requête en erreur, somme illisible ou migration 0019 non appliquée (colonne absente, `42703`) donnent `usage_unavailable`. La recherche rend « indisponible » et **aucun appel Google ne suit**. L'écran se replie sur la table des villes.
4. **Limites** (`LIMITES_VILLE`, `src/server/composition/villes.ts`) :
   - **150 suggestions** par jour de quota ;
   - **40 choix** par jour de quota ;
   - **20 actions par cookie d'accès et par minute** glissante.

   Coût au prix plein, sans tranche gratuite : un jour au plafond coûte 150 × 0,00283 + 40 × 0,005 = **0,6245 USD**, soit **19,36 USD** sur un mois de 31 jours. La recherche seule reste donc sous **20 USD par mois sur Google** (0027 § 2), même sans les tranches gratuites. Dans les tranches gratuites (10 000 par mois pour chaque SKU, soit au plus 4 650 suggestions et 1 240 fiches par mois ici), la facture est de 0 USD. Ces limites dépassent largement l'usage d'un testeur : un choix demande en général 2 à 4 recherches.
5. **Comptage** : le coût de chaque action, au prix plein de la table, est écrit dans `google_cost_micros`. Il entre donc dans le décompte existant du mois Google et de l'enveloppe des forfaits (`SQL_SOMMES`), à côté des exécutions. Depuis 0071, ce décompte ne refuse plus de lancement (`LIMITES_PROTOTYPE` infinies). Le plafond propre de la recherche est le point 4.
6. **Empreinte du cookie** (`empreinteCookieAcces`, `src/server/p0/acces.ts`) : HMAC-SHA-256 du cookie sous une clé dérivée du code d'accès (étiquette `vadrouille/p0/empreinte-cookie/v1`). Ni le cookie, ni le code, ni une adresse IP ne sont stockés. Deux cookies valides donnent deux empreintes, donc deux débits.
7. **Approbation** : 0019 n'est appliquée en préversion qu'après l'ajout de sa ligne à `MIGRATIONS_APPROUVEES` (`.github/workflows/db-migrate.yml`), par une PR de workflow à part, approuvée par Samuel (`owner-approved`, 0035, 0056 § 3). Avant cela, la recherche reste fermée (point 3) et l'écran se comporte comme sur `main`.
8. **Argent** : ces limites tiennent dans le plafond de 20 USD par mois que Samuel a fixé (0027 § 2). Elles n'engagent donc pas de dépense nouvelle. Changer leurs valeurs ne touche que `LIMITES_VILLE` ; les relever au-delà de ce plafond est une décision de Samuel. Poser aussi un quota Autocomplete dans la console Google est une question à Samuel, **non bloquante**.

## 4. Destination envoyée au brief (bloquant 3) et statut de la région (bloquant 5)

1. **Région déclarée par le client, bornée par les tables.** À la création, le serveur ne revérifie pas le `placeId` auprès de Google : rien ne prouve que le `placeId` désigne la destination. `destinationRegion` est **déclarée par le client** et **bornée par les tables** maison :
   - le pays doit être un code de `pays.json` ;
   - le fuseau doit appartenir à la liste fermée de ce pays (`fuseauDuPays`) ;
   - le brief reçoit le nom et le fuseau de la table, jamais la chaîne reçue.
   Un client forgé peut donc associer une destination à un autre pays de la table (Paris et VN, par exemple). Le pire effet est un programme décalé de fuseau, pour son seul auteur, derrière le code d'accès. Le `placeId` n'entre ni dans le brief, ni dans `trips`, `briefs` ou `prototype.run_briefs` : il n'est **pas conservé** (handover back-end § 5, lignes `DestinationRegion.*` corrigées ; la catégorie reste `calculé`, seule admise avec `stocké` et `chargé à la demande` par le test permanent `tests/unit/contracts/categories.test.ts`, et chaque ligne commence par « Déclaré par le client »).
2. **Destination** (`briefDepuisFormulaire`, `src/server/p0/depuis-formulaire.ts`), quand une région est présente :
   - si la table des villes connaît le texte tapé **dans ce pays**, la destination est le **nom maison** (« valencia » en Espagne donne « Valence ») ;
   - sinon, c'est le texte tapé, **filtré** par `DESTINATION_ESSAI_MOTIF` (`src/contracts/values.ts`) : une lettre Unicode d'abord, puis lettres, marques diacritiques, espaces, apostrophes (droite et typographique), tirets et points, **80 caractères au plus**, espaces répétés réduits à un seul ;
   - tout autre texte est refusé sur `draft.destination`, avant toute réservation.
   Sans région (repli), la destination reste une clé de la table des villes, donc déjà bornée.
3. **Pourquoi un filtre plutôt que le nom maison seul.** Le nom maison seul refuserait toute ville hors des 62 de la table, ce qui annulerait la demande de Samuel. Le filtre ne laisse pas passer de chiffres, de ponctuation de phrase (`:`, `;`, `?`, `!`), de chevrons, de parenthèses, d'adresse web ni de retour à la ligne. Un texte de 80 lettres peut encore porter quelques mots, mais le brief les place dans le champ `destination` d'un objet validé par `BriefSchema`, et c'est le texte de la personne elle-même, pour son propre programme, derrière le code d'accès. Le texte Google (libellé de la suggestion) n'est jamais envoyé : c'est le texte tapé qui part, comme annoncé à Samuel le 2026-10-23 à 15:17 UTC.
4. **Écart avec 0125 § 3** : 0125 refusait toute destination absente de la table des fuseaux ou des pays. Avec une région bornée par les tables, une ville hors de la table est désormais admise, sous le filtre du point 2.
5. **Côté navigateur** (`validateTrip`, `src/features/creation/validation.ts`), le même filtre donne le message « Écris le nom de ta ville avec des lettres seulement, sans chiffres ni symboles. » (code `cityCharacters`). Le serveur reste la référence.
6. Tests : client forgé (`tests/unit/p0/depuis-formulaire.test.ts`, textes refusés et textes admis comme « Hội An », « St. Louis », « L'Aquila », « 東京 »), nom maison substitué, et `validation.test.ts`.

## 5. Interface (bloquants 6 à 8, mineurs 10 à 15)

1. **Choix confirmé** (bloquant 8). Au choix, le champ prend le **nom maison** de la ville, ou, hors de la table, le **texte tapé** (jamais le libellé Google). Sous le champ, une confirmation visible, en `text-corps-s font-semibold text-ink`, nomme la ville : « Ville retenue : Valence (Espagne, Espagne continentale et Baléares (Madrid)). » ou « Ville retenue : Hoi An (Viêt Nam). ». Elle est reliée au champ par `aria-describedby`. Un nom tapé incomplet hors de la table (« Hoi » pour « Hội An ») reste refusé : le nom complet est demandé, puisque c'est lui qui part au programme.
2. **États visibles** (bloquant 6) : recherche, aucune ville, indisponible, plafond atteint et accès s'affichent en flux sous le champ (`text-corps-s text-ink-soft`), dans une région `role="status"` stable. Elle est masquée (`empty:sr-only`) seulement quand elle est vide. Quand le champ porte une erreur, la région d'état se tait, pour ne pas répéter le même message. Le doublon `erreurs.villeIndisponible` est retiré au profit de `ville.indisponible` (mineur 14).
3. **Option active** (bloquant 7) : `bg-muted` et un contour `line` de 2 px à l'intérieur (`outline-2 -outline-offset-2 outline-line`, handover front-end § 4.2). Chaque option a la hauteur de la cible tactile (`min-h-(--touch-target)`).
4. **Liste fermée absente** (mineur 11) : la liste n'est rendue que lorsqu'elle est ouverte, et `aria-controls` n'est posé qu'alors.
5. **Champ hors du formulaire** (mineur 12) : documenté en tête de `CreateTripForm.tsx`. Ordre de lecture : champ, état, liste, attribution. Entrée choisit l'option active sans soumettre. Après la saisie du code, le focus revient au champ (`focusField("destination")`). Le résumé d'erreurs vise l'identifiant `destination`.
6. **Espacements** (mineur 15) : `py-1`, `px-4`, `gap-2` sont des pas de l'échelle de 4 px de Tailwind, ceux qu'utilisent déjà les composants Ligne (`Chip` en `px-4`, `ActionBanner` en `gap-2`). Aucune valeur arbitraire.
7. **Attribution** (mineur 10). Les règles de Google pour des données Places montrées sans carte Google (page « Places API Policies », lue le 2026-10-23) exigent le logo Google Maps, ou, quand l'interface manque de place, le texte **« Google Maps »** : non traduit (`translate="no"`), sans retour à la ligne, police sans empattement de poids 400, de 12 à 16 px, contraste d'au moins 4,5:1. Il doit être placé en haut ou en bas du contenu, dans le même conteneur. Le site d'essai suit ce texte, et non « Données de lieux : Google » du handover front-end § 8 : pour les suggestions Places, la règle de Google prime. Le handover § 8 reste valable pour les autres données de lieux. Le texte est en `text-legende` (13 px, poids 400), `whitespace-nowrap`, `text-ink-soft`, en bas de la liste. L'attribution n'est montrée **que pendant que des suggestions sont visibles** : liste fermée, aucune donnée Google n'est à l'écran. **Écart restant** : la règle de Google cite les couleurs #1F1F1F, #5E5E5E ou blanc, alors que `ink-soft` vaut #475467 (contraste conforme, nuance différente). C'est à trancher par l'UX (jeton dédié ou `ink`), voir les suites.
8. **Captures** (bloquant 9) : 390 × 844, sur doubles, dans `docs/ux/captures/0129/`.

## 6. Tests et ce que l'e2e couvre

- **Unitaires** :
  - barrière, revalidation des entrées, statuts, nom maison et fuseaux (`tests/unit/composition/villes.test.ts`) ;
  - plafond persistant : « Nème appel refusé sans appel Google », débit, échec fermé, empreinte, coût au prix plein, et limites sous 20 USD par mois ;
  - `reserverVille` sur base simulée (`src/server/usage/neon-ville.test.ts`) ;
  - motifs recopiés tenus égaux (`PLACE_ID_MOTIF` et `PLACE_ID_GOOGLE`, `JETON_SESSION_MOTIF` et `JETON_SESSION`, mineur 16), dans `places-client.test.ts` ;
  - cas limites de `fuseauParPosition` (mineur 19 : El Paso, Detroit, Indianapolis, Amarillo…, avec deux repères maison ajoutés pour le Texas du nord à l'heure du Centre) ;
  - composant (`CreateTripForm.test.tsx`).
- **Base** (`tests/db/forfait-ville.test.ts`, colonnes et droits de `prototype.test.ts` et `roles.test.ts`) : lignes `ville` posées par la base, plafond du jour, débit par cookie, échec fermé, contraintes de 0019.
- **Bout en bout** (`tests/e2e/essai-creation.e2e.spec.ts`) : le serveur d'e2e a la garde du mode réel fermée. **L'e2e ne couvre donc que le repli** (recherche « indisponible », sans aucun appel Google, puis ville de la table admise). La recherche réelle est « À tester par Samuel » sur le site d'essai, une fois 0019 approuvée et appliquée.

## 7. Spécifications

Cette décision **prime** sur `specs/E2E-essai-bout-en-bout.md` (lignes 21, 37 à 39, 73 et 115 : « ville connue de la table ») et sur `specs/F8-creation-compte.md` (ligne 126 : « sans autocomplétion », F8-PO-14) pour l'écran 1 du site d'essai, **jusqu'à leur amendement par le Product Owner** (destinataire nommé dans la PR #732). Le MVP garde F8-PO-14.

## 8. Tables maison (mineur 22)

`src/lib/fuseaux/pays.json` (noms français, fuseaux IANA, régions lisibles, repères) et `src/lib/fuseaux/villes.json` sont écrits par le studio, à la main, à partir de connaissances générales (noms de pays et de villes, fuseaux de la base IANA, positions arrondies de villes). Ils ne contiennent aucune donnée Google et ne reprennent aucune base sous licence. Chaque fuseau est contrôlé par `Intl` dans les tests.

## 9. Sécurité

Points soumis au verdict de la Sécurité, à rendre dans la revue de la correction 1 de la PR #732 (position du Tech Lead : favorable sur chacun) ; un refus rouvre cette décision.

1. Barrière du lancement réutilisée, sans journal `p0.guard_closed` sur ces actions (mineur 21 : la recherche part à chaque pause de frappe, et le lancement journalise déjà).
2. Dépense bornée avant l'appel, en base, avec échec fermé (§ 3).
3. Destination bornée côté serveur (§ 4).
4. Aucune donnée Google conservée ni envoyée à un modèle : seul le `placeId` transite, et il n'est pas conservé.

Le jeton de session vient du navigateur et le serveur ne le suit pas. Le `placeId` n'est pas authentifié : il **ne sert jamais de preuve** (mineur 21).

## Suites (non bloquantes)

- **17** : frontière de P0r3b, terminal non parcouru (§ 1 point 6). Accepté par cette décision ; à revoir si `villes.ts` gagne un import.
- **18** : `listeDesPays`, `codePaysDeVille` et `fuseauxDesPays` (`src/lib/fuseaux/index.ts`) ne servent qu'aux tests, et leur commentaire « liste Pays de l'écran 1 » est périmé. `distanceKm` duplique `src/grounding/zone.ts`. Nettoyage à faire dans une PR à part.
- **20** : `onBlur` ferme la liste ; le parcours tactile (toucher une option) n'est testé qu'en `fireEvent.click`. Un test Playwright tactile est à ajouter quand la recherche réelle sera testable.
- **21** : journal d'audit de la recherche (sans donnée Google ni saisie), et suivi du jeton de session côté serveur, si la Sécurité les demande.
- **Attribution** (§ 5 point 7) : couleur exacte de Google (#5E5E5E ou #1F1F1F), à trancher par l'UX.
- **Samuel** : PR de workflow pour la ligne 0019 de `MIGRATIONS_APPROUVEES` (bloquante pour la recherche réelle, pas pour la fusion) ; quota Autocomplete dans la console Google (non bloquant).

## Quand revoir cette décision

Si Samuel change le plafond Google ; si la Sécurité refuse un point du § 9 ; si le Product Owner amende les spécifications autrement ; si la recherche réelle montre des limites trop basses ou trop hautes ; si le MVP veut la même recherche (alors F8-PO-14 et 0016 § 12 sont à revoir pour `api`).
