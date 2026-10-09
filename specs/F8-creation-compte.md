# F8 — Création du voyage (écrans 1 à 5) et connexion

Rôle : frontend · Prérequis : F2 (#19) livrée dans `main` (handover § 15) ; voir « Prérequis vérifiables » · Ticket : #47 · Référence : `docs/handovers/frontend.md` (§ 0 règles 1 à 10, § 2, § 3, § 5 `Button`, `IconButton`, `Chip`, `SegmentedControl`, `OtpInput`, `StatusBanner`, § 6 écrans 1 à 5 et règles de navigation, § 7 « Génération » et « Mouvement réduit », § 8, § 9, § 10, § 11, § 12 `brief_completed` et `preview_ready`, § 14 scénarios « créer un voyage sans hôtel » et « corriger le brief », § 15 F8, § 17 points 3 et 4), `docs/produit/cadrage-v5.md` (§ 1 D8 et D14, § 3.1 écrans 1 à 5, § 3.2, § 3.3, § 3.5 blocs « Préparer », « Générer », « Compte et paiement », § 3.7, § 4 « Produit en libre-service », § 6.5 étape 1 et règles Google, § 6.8 `briefs` et `stays`, § 9), `docs/CONTEXT.md` (phase 0, principes produit 2, 3 et 5, principes techniques 2 et 3, « Qui décide quoi »), `docs/design-system/README.md`, `docs/design-system/redaction.md`, `specs/F1-contrats-donnees-simulees.md`, `specs/F2-composants-base.md`, `specs/F4-carte.md`, `specs/F5-sejour-journee-fiche.md`, `specs/F6-presentation.md`, `specs/B0-handover-backend.md` (PO-3, PO-6), `docs/decisions/0013-decisions-tech-lead-f3-f4-f6.md` (§ 1.4 carte simulée, § 1.6 pages de développement, § 3.1 `CategorySchema`, § 3.3 module de mesure, § 3.6 `getRequestContext()`), `QUESTIONS.md` (Q4, Q5, Q12, Q25, Q27, Q30, Q35, Q39, Q45, Q59).

Documents en revue, non fusionnés au 2026-10-09, cités pour cohérence sans en dépendre : handover back-end (PR #27, `docs/handovers/backend.md` : § 1 conflit C6 « aucune donnée persistée avant le compte », § 4 lignes des écrans 1 à 5, actions `structureBrief`, `suggestLodging`, `createTrip`, `getGenerationStatus`, contrats `TripDraft`, `Brief`, `BriefRequest`, `TripRequest`, `LodgingSuggestion`, `GenerationStatus`, `AuthAdapter`, codes d'erreur, § 7 connexion par code (10 min, 3 essais, réponse identique pour une adresse connue ou inconnue), tâches B3 et B9) ; décision UX/UI 0012 (PR #26 : rendu de `Chip` déduite, d'`OtpInput` et de `StatusBanner`, textes d'`OtpInput` de Q30) ; code de F6 (PR #44 : `src/analytics`, `getRequestContext()`, `src/contracts/category.ts`).

Dossier UX : `docs/ux/dossier-ux.md` n'existe pas dans le dépôt (Q59) et `docs/ux/maquettes/` est vide (Q12). Le plan de test du Dossier UX, que reprennent les scénarios « créer un voyage sans hôtel » et « corriger le brief » (handover § 14), n'est pas disponible : les scénarios ci-dessous sont écrits d'après le handover § 6 et le cadrage § 3.1, et seront confrontés au plan de test quand Samuel l'aura exporté. Tout rendu et tout texte non maquetté est marqué « provisoire (UX/UI) ».

## Objectif
Livrer, sur données simulées, le parcours qui mène d'une envie de voyage aux premières propositions : créer le voyage (1), raconter puis vérifier le brief (2), choisir où loger quand on n'a pas encore d'hôtel (3), se connecter par email et code à 6 chiffres (4), suivre la préparation des propositions (5). Aucun compte réel, aucun envoi de code, aucun appel à un modèle ni à Google : toutes les réponses viennent d'adaptateurs simulés derrière `src/adapters`, et rien n'est conservé côté client.

## Phase 0 : ce que F8 ne fait pas
- **Aucun compte ni envoi réel** : l'adaptateur `auth` simulé n'envoie aucun email et ne crée aucun compte ; le fournisseur d'envoi des codes relève de Samuel (Q25, ouverte) et l'intégration Better Auth de B3 (après G0).
- **Aucun appel à un modèle** : `structureBrief` simulé renvoie un brief préparé ; aucun récit n'est envoyé à un service externe.
- **Aucune donnée Google** : ni autocomplétion de destination ou d'hôtel par Places, ni nom de lieu Google dans un brief ou une requête ; la mini-carte de l'écran 3 suit les règles de F4 (carte Google ou état de remplacement, carte simulée réservée aux pages de développement).
- **Aucun service externe** : ni email, ni mesure envoyée sur le réseau (le module de F6 enregistre en local), ni paiement.

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| `Button`, `IconButton`, `Chip` (`inferred`), `SegmentedControl`, `OtpInput` (`length`, `onComplete`, `label`, collage, `autocomplete="one-time-code"`), `StatusBanner`, `/dev/composants`, test de contraste, `provisoire.css`, règle `react/jsx-no-literals` | F2 (#19, fusionnée) | `specs/F2-composants-base.md` |
| Contrats `Trip`, adaptateur `mock`, isolation par organisation, voyage `mock_trip_edimbourg` (29.08 – 03.09.2026, 2 adultes), règle « `src/mocks` importé seulement depuis `src/adapters` et les tests » | F1 (#11) | `specs/F1-contrats-donnees-simulees.md` |
| `CarteProvider`, état « configuration absente », carte simulée réservée à `src/app/dev/`, règle de lint contre le stockage client | F4 (#35) | `specs/F4-carte.md`, décision 0013 § 1.4 |
| Module de mesure `src/analytics` (`events.ts`, `track.ts`, enregistreur local), `getRequestContext()`, `CategorySchema` | F6 (code, PR #44, en revue) | décision 0013 § 3.1, § 3.3, § 3.6 |
| Cibles des liens de l'écran 5 : `/voyages/[id]/presentation` (F6) et `/voyages/[id]` (F5) | F6, F5 | peuvent répondre 404 tant qu'elles ne sont pas livrées |

Comme pour F5 (F5-PO-18), le code de F8 qui touche `src/analytics`, `getRequestContext()` ou `CategorySchema` démarre après la fusion du code de F6, pour éviter deux versions concurrentes (F8-PO-16).

## Périmètre
- Écran 1 « Créer le voyage » : `/voyages/nouveau`.
- Écran 2 « Brief raconté » puis vérifié : `/voyages/nouveau/brief`.
- Écran 3 « Où loger » : route à confirmer (F8-TL-1), proposée `/voyages/nouveau/logement`.
- Écran 4 « Compte » : `/connexion?suite=…` (connexion par code ; aucune autre page de compte).
- Écran 5 « Propositions prêtes » : `/voyages/[id]/preparation`.
- Brouillon de création en mémoire, partagé par les écrans 1 à 4 (F8-PO-1).
- Adaptateurs simulés : création (`structureBrief`, `suggestLodging`, `createTrip`, `getGenerationStatus`) et `auth` (`requestCode`, `verifyCode`, `getSession`) ; contrats de phase 0 correspondants (F8-TL-2, F8-TL-3).
- Ajout d'une marque « déduit » à `SegmentedControl` (F8-TL-4) et de l'état invalide d'`OtpInput` s'il manque (décision 0012, en revue).
- Événements `brief_completed` et `preview_ready`.

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Propositions détaillées dans « Propositions au Tech Lead » ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères d'acceptation ne dépendent pas de la forme retenue, sauf mention.
- Route de l'écran 3 avant l'existence du voyage (F8-TL-1).
- Contrats de phase 0 `TripDraft`, `Brief`, `LodgingSuggestion`, `GenerationStatus` et leur place dans `src/contracts` (F8-TL-2).
- Interfaces d'adaptateur `CreationAdapter` et `AuthAdapter`, simulées en phase 0 (F8-TL-3).
- Marque « déduit » sur `SegmentedControl` et sur les champs numériques (F8-TL-4).
- Fournisseur du brouillon en mémoire et garde des étapes (F8-TL-5).
- Suivi de la génération : interrogation périodique ou flux (F8-TL-6).
- Mini-carte de zone de l'écran 3 (F8-TL-7).
- Codes de catégorie des envies (F8-TL-8, amende la décision 0013 § 3.1).
- Emplacement et noms des fichiers ci-dessous.

## Fichiers à créer ou modifier (proposition)
- `src/features/creation/` : `DraftProvider.tsx` (brouillon en mémoire, F8-TL-5), `CreateTripForm.tsx` (écran 1), `BriefStory.tsx` et `BriefReview.tsx` (écran 2), `LodgingStep.tsx` (écran 3), `PreparationView.tsx` (écran 5), `validation.ts` (fonctions pures : dates, villes, engagements, brief), `brief-fields.ts` (champs déduits, comptes de `brief_completed`).
- `src/features/compte/` : `SignInForm.tsx` (écran 4), `suite.ts` (validation pure du paramètre `suite`).
- `src/app/voyages/nouveau/page.tsx`, `src/app/voyages/nouveau/brief/page.tsx`, `src/app/voyages/nouveau/logement/page.tsx` (F8-TL-1), `src/app/voyages/nouveau/layout.tsx`, `src/app/connexion/page.tsx`, `src/app/voyages/[id]/preparation/page.tsx` (composant serveur : `getRequestContext()`, `notFound()` hors organisation).
- `src/app/dev/voyages/nouveau/logement/…` : écran 3 avec la carte simulée sous `CarteProvider` (F8-TL-7, décision 0013 § 1.4).
- `src/contracts/creation.ts` (F8-TL-2) et son test ; réexport par `src/contracts/index.ts` ; `src/contracts/category.ts` (F8-TL-8).
- `src/adapters/types.ts`, `src/adapters/index.ts` (`getCreationAdapter()`, `getAuthAdapter()`, variables serveur `DATA_ADAPTER` et `AUTH_ADAPTER`), `src/adapters/mock-creation.ts`, `src/adapters/mock-auth.ts` et leurs tests ; `src/mocks/creation-edimbourg.ts` (brief, suggestion de logement, étapes de génération simulés).
- `src/components/ligne/SegmentedControl.tsx` et son test (F8-TL-4) ; `src/components/ligne/OtpInput.tsx` et son test (état invalide, décision 0012).
- `src/analytics/events.ts` (livré par F6) : variantes strictes `brief_completed` et `preview_ready`, et leurs tests.
- `eslint.config.mjs` : `react/jsx-no-literals` et la règle de F4 contre le stockage client étendues à `src/features/creation`, `src/features/compte`, `src/app/voyages/nouveau`, `src/app/connexion` ; interdiction d'importer la carte simulée depuis ces dossiers.
- `.github/workflows/ci.yml` : vérification du 404 de `/dev/voyages/nouveau/logement` sans `VADROUILLE_DEV_PAGES=1` dans le job `docker` (décision 0013 § 1.6).
- `src/app/dev/composants` : `SegmentedControl` déduit, `OtpInput` invalide.
- Textes dans `src/i18n/fr.json` sous `creation.*` et `connexion.*` ; `tests/e2e/creation.e2e.spec.ts`, `tests/e2e/connexion.e2e.spec.ts`, `tests/e2e/creation.a11y.spec.ts`, `tests/visual/creation.visual.spec.ts` et leurs références.

## Comportement

### Parcours et navigation (F8-PO-1, F8-PO-2)
- Ordre : 1 → 2 → 3 (seulement si au moins une ville a la réponse « Pas encore » au logement) → 4 → 5. Une personne déjà connectée (session renvoyée par l'adaptateur `auth`) saute l'écran 4 ; en phase 0, l'adaptateur simulé ne renvoie de session qu'après une vérification réussie dans le même onglet.
- « Retour » (`IconButton`, en haut à gauche) mène au niveau supérieur : 2 → 1, 3 → 2, 4 → l'écran qui l'a appelé (le chemin de `suite` d'origine, ou `/voyages`), 1 → `/voyages` (Mes voyages, F11, 404 d'ici là). Le retour du navigateur fait de même. Revenir en arrière garde tout ce qui a été saisi.
- L'écran 5 n'a pas de retour vers la création : le voyage existe ; « Retour » mène à `/voyages`.
- Titre du document : « Nouveau voyage · Destination et dates », « Nouveau voyage · Ton brief », « Nouveau voyage · Où loger », « Connexion », « {destination} · Préparation » (provisoire, UX/UI). Chaque écran a exactement un titre de niveau 1.
- Brouillon absent (rechargement, ouverture directe de `/voyages/nouveau/brief` ou de l'écran 3) : l'adresse est remplacée par `/voyages/nouveau`, et une annonce `role="status"` dit « Ton brouillon n'a pas été conservé. Recommence à partir de la destination. » (provisoire, UX/UI).
- Validation d'un formulaire : au bouton principal seulement (pas d'erreur pendant la frappe) ; chaque champ invalide porte `aria-invalid="true"` et un message relié par `aria-describedby` ; le focus va sur le premier champ invalide ; aucun texte d'erreur porté par la seule couleur.

### Écran 1 — Créer le voyage (`/voyages/nouveau`) (F8-PO-3)
Titre « Ton voyage » (niveau 1, provisoire). Champs, dans cet ordre (cadrage § 3.1, écran 1) :
1. **Destination** (obligatoire) : champ texte libre, 2 à 80 caractères, sans autocomplétion (aucune donnée Google, F8-PO-14).
2. **Dates** (obligatoires) : date d'arrivée et date de départ (`<input type="date">` ou équivalent, au choix du frontend), affichées au format « sam. 29.08 » dans les récapitulatifs. Règles : arrivée au plus tôt aujourd'hui (heure locale de l'appareil) ; départ après l'arrivée (au moins une nuit). Aucune durée maximale n'est imposée dans F8 (F8-Q3).
3. **« As-tu déjà un logement ? »** (obligatoire, `SegmentedControl` « Oui » / « Un quartier » / « Pas encore ») ; « Oui » ouvre un champ « Nom ou adresse du logement » (texte libre, 2 à 120 caractères) ; « Un quartier » ouvre « Quartier » (texte libre, 2 à 80 caractères) ; « Pas encore » n'ouvre rien et mène à l'écran 3.
4. **Autres villes** (facultatif, replié sous un bouton « Ajouter une ville ») : chaque ville a un nom, une date d'arrivée et une date de départ comprises dans les dates du voyage, sans chevauchement avec les autres villes, et sa propre question de logement. La première ville est la destination ; ses dates vont de l'arrivée du voyage à l'arrivée dans la ville suivante. « Retirer » enlève une ville (pas de « Supprimer », handover § 10). Au plus 4 villes en tout (provisoire, F8-PO-3).
5. **Engagements déjà pris** (facultatif, replié sous « Ajouter un engagement ») : type (« Vol », « Réservation », « Billet »), libellé (texte libre, 2 à 80 caractères), date (dans les dates du voyage), heure de début, heure de fin facultative (après le début). Au plus 10 engagements. Texte d'aide : « Ils seront gardés tels quels dans ton programme. » (provisoire, UX/UI ; cadrage § 3.2 : les engagements deviennent des étapes verrouillées).
- Bouton principal « Continuer » (`Button` `primary` `md`) : valide, enregistre dans le brouillon, mène à l'écran 2. Aucun appel serveur à cet écran (B0 en revue, ligne de l'écran 1).

### Écran 2 — Brief raconté puis vérifié (`/voyages/nouveau/brief`) (F8-PO-4 à F8-PO-7)
Deux états sur la même route, sans changement d'adresse (le récit ne passe jamais dans l'adresse).

**Récit.**
- Titre « Raconte ton voyage en quelques phrases » (niveau 1, cadrage § 3.1). Zone de texte nommée par ce titre, 1 000 caractères au plus, avec un compteur « {n} sur 1 000 caractères » (annoncé seulement à 900 et à 1 000, `aria-live="polite"`).
- Texte d'aide (provisoire, UX/UI) : « Qui part, ce qui vous fait envie, ce que vous préférez éviter, votre budget pour les repas. »
- « Préparer mon brief » (`primary`) : récit d'au moins 20 caractères, sinon erreur « Écris au moins une phrase, ou remplis le brief toi-même. » ; appelle `structureBrief` (simulé) ; pendant l'attente, le bouton est désactivé et une annonce `role="status"` dit « On prépare ton brief… » ; à la réponse, l'état « Vérification » s'affiche et le focus va sur son titre.
- « Remplir moi-même » (`text`) : passe à l'état « Vérification » sans appel et sans aucun champ déduit (F8-PO-4).
- Erreurs de `structureBrief` (codes du handover back-end en revue) : `rate_limited`, `cost_cap_reached`, `provider_error` → `StatusBanner` `error` « Impossible de préparer ton brief pour le moment. Tu peux le remplir toi-même. » avec « Réessayer » et « Remplir moi-même » ; le récit est conservé (provisoire, UX/UI).

**Vérification** (F8-PO-5).
- Titre « Vérifie ton brief » (niveau 1). Phrase d'aide visible si au moins un champ est déduit : « En pointillé : ce qu'on a compris de ton récit. Touche pour corriger. » (provisoire, UX/UI).
- Sections toujours ouvertes, dans cet ordre :
  1. **Voyageurs** : adultes (1 à 9) et enfants (0 à 9), chacun avec un champ numérique et deux `IconButton` « Retirer un adulte » / « Ajouter un adulte » (et équivalents pour les enfants) de 44 px.
  2. **Rythme** : `SegmentedControl` « Tranquille » / « Équilibré » / « Intense » (cadrage § 3.7) ; aucun choix par défaut si le rythme n'est pas déduit, et il est obligatoire.
  3. **Envies** : une `Chip` par envie du vocabulaire de F8-PO-6 ; au moins une envie choisie.
- Sections facultatives, repliées par défaut (bouton de section `aria-expanded`, cadrage § 3.1 « sections facultatives repliées »), **sauf si elles contiennent un champ déduit**, auquel cas elles sont ouvertes d'office, pour qu'aucune déduction ne reste cachée (F8-PO-5) :
  4. **Déplacements** : `Chip` « À pied », « Transports publics », « Voiture » (choix multiple ; libellés provisoires, Q37) ;
  5. **À limiter** : une `Chip` par envie du même vocabulaire ; une envie choisie dans « Envies » est désactivée dans « À limiter » et inversement, avec l'explication « Déjà dans tes envies » ou « Déjà à limiter » reliée par `aria-describedby` ;
  6. **Budget par repas** : champ numérique facultatif « Environ … CHF par personne et par repas » (entier de 5 à 500), formaté par `Intl.NumberFormat("fr-CH")` dans les récapitulatifs.
- Un en-tête de section repliée qui ne contient aucune valeur indique « Facultatif » ; qui en contient, leur résumé (« À pied, Transports publics »).
- **Champ déduit** : rendu en pointillé (`Chip` `inferred` selon la décision 0012 en revue ; `SegmentedControl` et champs numériques selon F8-TL-4), avec la mention « déduit de ton récit » dans son nom accessible (`aria-describedby`). Le pointillé n'est jamais la seule information.
- **Toucher une `Chip` déduite (Q35, F8-PO-7)** : bascule son état comme toute `Chip` (`aria-pressed` suit) et retire la marque « déduit » : la valeur devient un choix de la personne. Une `Chip` déduite choisie, touchée, est donc retirée ; touchée de nouveau, elle est choisie en aplat `line` (choix de la personne). Il n'existe pas de geste « confirmer » distinct : « Continuer » accepte tels quels les champs encore marqués déduits, qui restent déduits dans le brief (`inferredFields`) et pourront être affichés comme tels plus loin (écran 10, cadrage § 3.1). Même règle pour `SegmentedControl` (choisir une autre option retire la marque ; l'option déduite déjà choisie n'a pas d'autre effet) et pour les champs numériques (modifier la valeur retire la marque).
- « Récit » (`text`) revient à l'état « Récit » avec le texte conservé ; un nouvel appel à « Préparer mon brief » remplace les champs déduits et conserve les champs modifiés par la personne (F8-PO-5).
- « Continuer » (`primary`) : valide (rythme choisi, au moins une envie, au moins un adulte), enregistre le brief dans le brouillon, envoie `brief_completed`, mène à l'écran 3 si une ville attend un logement, sinon à l'écran 4 (ou 5 si une session existe).

### Écran 3 — Où loger (F8-TL-1, proposé `/voyages/nouveau/logement`) (F8-PO-8)
- Affiché une fois par ville dont la réponse est « Pas encore », dans l'ordre des villes ; titre « Où loger à {ville} » (niveau 1).
- Appel `suggestLodging` (simulé) à l'arrivée ; attente annoncée « On cherche le quartier le mieux placé… » (`role="status"`).
- Contenu (cadrage § 3.1, écran 3), dans cet ordre :
  1. **Quartier conseillé** : nom (niveau 2), raison maison d'une ligne (« Le mieux relié à l'ensemble de ton programme : à pied pour le centre, en transports publics pour le reste » est l'exemple du cadrage, le texte réel vient des données), mini-carte de la zone (F8-TL-7) ;
  2. **Jusqu'à 3 logements** dans ce quartier : nom (maison, entre crochets dans le jeu simulé), une ligne `meta` maison, et un bouton « Choisir ce logement » (`secondary`) par logement ;
  3. « Partir du quartier, choisir plus tard » (`primary`) : retient le quartier comme logement provisoire de la ville.
- Choisir un logement ou le quartier enregistre le choix dans le brouillon et passe à la ville suivante sans logement, puis à l'écran 4 (ou 5). Aucun lien de réservation ni prix de logement dans F8 (F8-Q5) ; aucune photo (Q6).
- `no_option` : « Aucun quartier à te proposer pour l'instant. » (provisoire) et « Continuer sans logement » qui retient « pas encore » pour la ville ; autres erreurs : comme à l'écran 2, avec « Réessayer » et « Continuer sans logement ».
- La mini-carte n'est jamais la seule source d'information : le nom du quartier et sa raison sont dans le texte.

### Écran 4 — Compte (`/connexion?suite=…`) (F8-PO-9 à F8-PO-11)
- Titre « Connecte-toi pour recevoir tes propositions » quand `suite` vient de la création, « Connexion » sinon (niveau 1, provisoire). Phrase d'aide : « Pas de mot de passe : on t'envoie un code à 6 chiffres. » (cadrage D8, provisoire).
- **Étape email** : champ « Ton adresse email » (`type="email"`, `autocomplete="email"`, `inputmode="email"`), validation de forme seulement (un `@`, un domaine avec un point, 254 caractères au plus) ; « Recevoir un code » (`primary`) appelle `requestCode`. La réponse est la même pour une adresse connue ou inconnue.
- **Étape code** : texte « Code envoyé à {email}. Il est valable 10 minutes. » (durée lue dans la configuration de l'adaptateur, jamais en dur ; provisoire, UX/UI) ; `OtpInput` `length=6` avec le libellé visible « Code reçu par email » passé en `label` (décision 0012, Q30) ; le focus va sur le premier chiffre ; la vérification part d'elle-même quand le sixième chiffre est saisi (`onComplete`) — pas de bouton « Valider » ; « Renvoyer le code » (`text`) ; « Changer d'adresse » (`text`) revient à l'étape email avec l'adresse conservée.
- Pendant la vérification, les cases sont désactivées et une annonce `role="status"` dit « Vérification du code… ».
- **Erreurs** (codes du handover back-end en revue ; textes provisoires, UX/UI) : `invalid_code` → « Ce code ne correspond pas. Vérifie-le ou demande un nouveau code. », cases vidées, `aria-invalid`, focus sur la première case ; `code_expired` → « Ce code a expiré. Demande un nouveau code. » ; `too_many_attempts` → « Trop d'essais. Demande un nouveau code. », cases désactivées jusqu'au renvoi ; `rate_limited` (envoi) → « Trop de demandes. Réessaie dans quelques minutes. » ; message relié au groupe par `aria-describedby` et annoncé (`role="alert"`).
- **Réussite** : l'adaptateur renvoie une session simulée ; l'adresse est remplacée par la cible de `suite` (pas de nouvelle entrée d'historique : le retour du navigateur ne ramène pas au formulaire de code).
- **Paramètre `suite`** (F8-PO-10) : accepté seulement s'il est un chemin interne qui commence par `/` (et pas par `//` ni `/\`), sans schéma ni hôte, après décodage ; sinon `/voyages`. Il ne contient jamais l'email, le récit ni aucune donnée du brouillon.
- Depuis la création, `suite` vaut `/voyages/nouveau/lancer` (F8-TL-5) : cette étape sans écran appelle `createTrip` avec le brouillon et un `requestId` créé une seule fois par brouillon, puis remplace l'adresse par `/voyages/{id}/preparation`. Un second appel avec le même `requestId` renvoie le même voyage (idempotence). Erreur `active_preview_exists` (un aperçu actif à la fois par compte, cadrage § 4) : « Tu as déjà des propositions en préparation. » avec un lien vers ce voyage (provisoire) ; autres erreurs : `StatusBanner` `error` avec « Réessayer », brouillon conservé.
- Mentions légales à la création du compte (politique de confidentialité, conditions) : non rendues dans F8 (F8-Q2).

### Écran 5 — Propositions prêtes (`/voyages/[id]/preparation`) (F8-PO-12, F8-PO-13)
- Composant serveur qui lit le voyage par `getTripAdapter()` avec `getRequestContext()` ; voyage inconnu ou d'une autre organisation : 404.
- Titre « On prépare tes premières propositions » puis, une fois prêtes, « Tes premières propositions sont prêtes » (niveau 1, provisoire ; « Aperçu » interdit, handover § 10). `DestinationPlate` n'est pas requise (F5).
- **Progression** (handover § 7 « Génération ») : une mini-ligne par jour couvert par les premières propositions (J1 et J2 dans le jeu simulé, cadrage § 4 « première journée et début de la deuxième »), avec sa pastille « J{n} » et son état : « En préparation », puis « Jour {n} prêt ». La mini-ligne se dessine, puis un anneau par proposition prête apparaît ; aucun nom de lieu n'y figure (les propositions se découvrent dans la présentation). Sous `prefers-reduced-motion: reduce` : fondus seulement, pas de tracé animé. Chaque passage à « Jour {n} prêt » est annoncé une fois (`role="status"`), sans voler le focus (décision 0012 : l'écran porte le message, `StatusBanner` `generating` reste immobile).
- Compteur textuel « {ready} propositions prêtes sur {expected} » (provisoire).
- **Prêtes** (`ready` = `expected`, ou phase terminée) : « Voir mes propositions » (`primary`, lien vers `/voyages/[id]/presentation`, F6) et « Passer, voir le programme » (`text`, lien vers `/voyages/[id]`, F5) (cadrage § 3.1 et § 3.3) ; le focus reste où il est ; pas de redirection automatique (la présentation est proposée d'office, pas imposée).
- **Aperçu incomplet** (B0 PO-6) : si la génération se termine avec `ready` < `expected`, l'écran affiche ce qui est prêt et `StatusBanner` `noOption` « {expected − ready} propositions n'ont pas trouvé de lieu compatible. » (provisoire) ; les deux liens restent disponibles.
- **Erreur** (`retryable: true`) : `StatusBanner` `error` « La préparation s'est interrompue. » avec « Réessayer » ; `retryable: false` (plafond atteint) : même bandeau sans « Réessayer », avec « Voir mes voyages » (provisoire).
- Fermer l'onglet ou recharger ne perd rien : l'état vient de l'adaptateur. L'email « propositions prêtes » n'est pas envoyé (Q25).

## Événements de mesure (handover § 12)
| Événement | Quand | Propriétés |
|---|---|---|
| `brief_completed` | « Continuer » réussi à l'état « Vérification » de l'écran 2 | `inferred_fields_count` : nombre de champs déduits à l'affichage de la vérification ; `edited_fields_count` : nombre de ces champs que la personne a modifiés (un champ compte une fois) |
| `preview_ready` | Première fois que l'écran 5 voit l'état « prêt » ou « aperçu incomplet » pour ce voyage, dans cet onglet | `duration_ms` : de l'appel à `createTrip` à cet état, mesuré dans le navigateur ; absent si la page a été rechargée entre-temps (F8-PO-15) |

Aucune autre propriété : ni email, ni récit, ni destination, ni identifiant de voyage. « Un champ » (F8-PO-15) : voyageurs (adultes et enfants comptent pour un champ), rythme, envies, déplacements, à limiter, budget par repas — 6 au plus.

## Règles Google et données personnelles
- **Aucune donnée Google dans un prompt** : F8 n'appelle aucun modèle en phase 0. Pour la suite, la destination, le nom du logement, le quartier et les libellés d'engagement sont saisis librement par la personne ; aucune autocomplétion Places ne les remplit, pour qu'aucun nom Google n'entre dans `BriefRequest` ni `TripRequest` (F8-PO-14 ; une autocomplétion future relève de F8-Q4).
- **Seul l'identifiant de lieu est stockable** : `LodgingSuggestion` ne porte, en fait de lieu, que des identifiants et des noms maison (B0 en revue) ; F8 ne stocke rien côté client.
- **Données de lieux sur une carte non Google** : la mini-carte de l'écran 3 est une carte Google (F4) ou l'état de remplacement ; la carte simulée ne s'importe que depuis `src/app/dev/` et les tests (décision 0013 § 1.4).
- **Aucune persistance côté client** (F8-PO-1) : brouillon, récit, email, code et session simulée vivent en mémoire ; aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies ; les seuls paramètres d'adresse de F8 sont `suite` (chemin interne) sur `/connexion`.
- **Données personnelles** : l'email et le récit ne sont ni journalisés (`console`), ni envoyés dans un événement, ni placés dans l'adresse, ni rendus ailleurs que dans leur champ et dans « Code envoyé à {email} ». Le code de connexion simulé n'est jamais affiché par l'interface.

## Tests

### Unitaires (Vitest, Testing Library, axe)
- `validation.ts` : destination, dates (passé refusé, départ après l'arrivée), villes (dans les dates, sans chevauchement, 4 au plus), engagements (dans les dates, fin après début, 10 au plus), brief (rythme, envie, adultes).
- `suite.ts` : accepte `/voyages/nouveau/lancer` ; refuse `https://exemple.org`, `//exemple.org`, `/\exemple.org`, `javascript:…`, `%2F%2Fexemple.org`, chaîne vide ; repli `/voyages`.
- `brief-fields.ts` : comptes de `brief_completed` (aucun champ déduit avec « Remplir moi-même », un champ modifié deux fois compte une fois, un champ déduit non touché compte 0).
- Adaptateurs simulés : `structureBrief`, `suggestLodging` (ville du jeu simulé et ville inconnue → `no_option`), `createTrip` (idempotence par `requestId`), `getGenerationStatus` (suite d'états, aperçu incomplet, erreur), `auth` (code valable, `invalid_code`, 3 essais puis `too_many_attempts`, expiration à 10 min en horloge simulée, renvoi limité, réponse identique pour deux adresses) ; validation par les schémas de `src/contracts`.
- `SegmentedControl` déduit, `OtpInput` invalide, écrans avec les adaptateurs simulés.

### E2E, a11y et visuel (Playwright, 390 × 844, build de production, domaines Google bloqués)
Brief simulé (jeu de test, d'après le voyage d'Édimbourg du cadrage § 2) : 2 adultes, rythme « Équilibré », envies « Nature », « Dégustations », « Restaurants », déplacements « À pied » et « Transports publics », tous déduits ; ni limite ni budget par repas. L'horloge du navigateur est fixée au 2026-08-01 (`page.clock`), pour que les dates du jeu simulé (29.08 – 03.09.2026) soient à venir. Le code simulé valable et les codes d'erreur simulés sont des constantes de `src/mocks`, importées par les tests seulement. Les critères qui touchent la mini-carte s'exécutent sur `/dev/voyages/nouveau/logement` (carte simulée) ; sur la route produit, la CI affiche l'état « configuration absente » de F4.
- `tests/e2e/creation.e2e.spec.ts`, `tests/e2e/connexion.e2e.spec.ts`.
- `tests/e2e/creation.a11y.spec.ts` : axe sur l'écran 1 (vide, avec erreurs, avec une ville et un engagement), l'écran 2 (récit, vérification avec champs déduits, sections repliées), l'écran 3, l'écran 4 (email, code, code invalide), l'écran 5 (en préparation, prêt, incomplet, erreur).
- `tests/visual/creation.visual.spec.ts` : mêmes états ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu ou un texte non maquetté et peut être changée par UX/UI sans nouvelle décision du Product Owner (F8-Q1).
- **F8-PO-1 — Brouillon en mémoire, aucune persistance en phase 0.** Le brouillon des écrans 1 à 4 vit en mémoire dans le navigateur, le temps de l'onglet ; un rechargement le perd, avec l'annonce et le retour à l'écran 1 décrits plus haut. Rien n'est écrit côté client. Le handover back-end en revue (C6) prévoit un brouillon « conservé dans le navigateur » jusqu'à la connexion : s'il désigne un stockage (`sessionStorage`…), ce choix relève du Tech Lead et de la sécurité (le récit est une donnée personnelle) et n'est pas pris ici (F8-TL-5, F8-Q6).
- **F8-PO-2 — Parcours.** Ordre 1, 2, 3 (si une ville attend un logement), 4 (si aucune session), 5 ; retour toujours vers le niveau supérieur, saisies conservées ; pas de retour vers la création depuis l'écran 5 ; validation au bouton principal, focus sur le premier champ invalide.
- **F8-PO-3 — Contenu de l'écran 1.** Destination en texte libre ; dates obligatoires, arrivée à partir d'aujourd'hui, au moins une nuit ; logement « Oui » / « Un quartier » / « Pas encore » (cadrage : « oui, ou pas encore → suggestion ou quartier ») ; jusqu'à 4 villes, chacune avec ses dates et sa réponse de logement (cadrage § 3.5 « plusieurs villes », § 6.8 `stays`) ; jusqu'à 10 engagements typés « Vol », « Réservation », « Billet » avec date et heure, qui deviendront des étapes verrouillées (cadrage § 3.2). Les plafonds de 4 villes et 10 engagements sont provisoires, révisables au vu des tests.
- **F8-PO-4 — Récit facultatif.** « Remplir moi-même » ouvre la vérification sans déduction ; le récit fait au plus 1 000 caractères et au moins 20 pour être structuré (coût par appel borné, Q39, Q45) ; il ne passe jamais dans l'adresse.
- **F8-PO-5 — Vérification du brief.** Voyageurs, rythme et envies toujours visibles ; déplacements, à limiter et budget par repas repliés, sauf s'ils contiennent une déduction (aucune déduction cachée, principe produit 3) ; un nouveau passage par le récit remplace les déductions et garde les corrections de la personne.
- **F8-PO-6 — Vocabulaire des envies.** Les envies et les éléments à limiter partagent un seul vocabulaire, celui des catégories des propositions (cadrage § 3.3 : « les envies du brief et les catégories des lieux partagent le même vocabulaire »), source unique `CategorySchema` (décision 0013 § 3.1). Liste fonctionnelle retenue pour le MVP, tirée du cadrage (§ 1 « restaurants, bars, fêtes et événements », § 1 « gastronomie, découverte locale et nature ») et des cinq codes de F6 : « Musées », « Balades en ville », « Nature », « Dégustations », « Restaurants », « Patrimoine et monuments », « Marchés », « Bars et soirées » (libellés provisoires, UX/UI). Les codes de contrat relèvent du Tech Lead (F8-TL-8).
- **F8-PO-7 — Toucher une `Chip` déduite (Q35).** Le toucher bascule la `Chip` comme toute autre (`aria-pressed` reste fidèle à l'état) et retire la marque « déduit » : la valeur devient un choix de la personne. Pas de geste « confirmer » séparé : une valeur déduite visible et non touchée est acceptée par « Continuer », reste marquée déduite dans le brief et pourra être retirée plus tard (écran 10). Raisons : une chip choisie qui resterait choisie au toucher contredirait `aria-pressed` ; la déduction est toujours visible (pointillé et nom accessible), donc jamais silencieuse ; un geste de confirmation par champ alourdirait la vérification sans information nouvelle. Même règle pour `SegmentedControl` et les champs numériques.
- **F8-PO-8 — Où loger.** Un écran par ville sans logement ; quartier conseillé avec sa raison et sa mini-carte, puis jusqu'à 3 logements ; « Partir du quartier, choisir plus tard » en action principale, puisque le cadrage permet de « partir du quartier et choisir plus tard » ; ni prix, ni photo, ni lien de réservation dans F8.
- **F8-PO-9 — Connexion.** Email puis code sur le même écran, vérification automatique au sixième chiffre, « Renvoyer le code » et « Changer d'adresse » ; réponse identique pour une adresse connue ou inconnue ; messages d'erreur distincts pour code faux, expiré, trop d'essais et trop de demandes ; durée de validité affichée depuis la configuration.
- **F8-PO-10 — Paramètre `suite`.** Chemin interne seulement, repli `/voyages` ; aucune donnée personnelle dans l'adresse ; l'adresse de connexion est remplacée à la réussite.
- **F8-PO-11 — Création du voyage après connexion.** Le voyage n'est créé qu'une fois la session obtenue (cadrage § 4 « compte obligatoire ») ; un `requestId` par brouillon rend la création idempotente ; « un aperçu actif à la fois » renvoie au voyage existant.
- **F8-PO-12 — Écran 5.** Progression par jour couvert par les premières propositions, sans nom de lieu ; deux sorties, « Voir mes propositions » et « Passer, voir le programme », sans redirection automatique ; aperçu incomplet affiché tel quel (B0 PO-6) ; erreurs avec ou sans « Réessayer » selon `retryable`.
- **F8-PO-13 — Simulation de phase 0.** Le jeu simulé ne connaît qu'Édimbourg (« Édimbourg », « Edimbourg » ou « Edinburgh », sans tenir compte de la casse ni des accents) : `structureBrief` renvoie un brief préparé quel que soit le récit (il ne l'analyse pas) ; `suggestLodging` renvoie une suggestion pour Édimbourg et `no_option` pour toute autre ville ; `createTrip` renvoie `mock_trip_edimbourg`, dont le contenu ne reflète pas le brouillon saisi ; `getGenerationStatus` déroule une suite d'états fixe. Ces limites sont propres à la phase 0 et ne décrivent pas le produit.
- **F8-PO-14 — Saisie libre, sans Google.** Destination, logement, quartier et engagements sont saisis en texte libre ; aucune autocomplétion Places en F8.
- **F8-PO-15 — Mesure.** Définition des « champs » de `brief_completed` (6 au plus) et de la durée de `preview_ready` (depuis `createTrip`, dans l'onglet ; propriété absente après un rechargement plutôt qu'une valeur fausse).
- **F8-PO-16 — Découpage proposé au CEO.** Trois PR successives : **F8a** écrans 1 et 2, brouillon, `SegmentedControl` déduit, `brief_completed` (critères [a]) ; **F8b** écrans 3 et 4, adaptateur `auth` simulé, `OtpInput` invalide (critères [b]) ; **F8c** lancement et écran 5, `preview_ready` (critères [c]). Les critères transverses s'appliquent à chaque PR pour ce qu'elle livre. Le code qui touche `src/analytics` ou `getRequestContext()` démarre après la fusion du code de F6 (#44).

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
- **F8-TL-1 — Route de l'écran 3.** Le handover § 6 place l'écran 3 sur `/voyages/[id]/logement`, alors qu'aucun voyage n'existe avant la connexion (écran 4, et C6 du handover back-end en revue). Proposition : `/voyages/nouveau/logement`, sous la même mise en page que les écrans 1 et 2. `/voyages/[id]/logement` reste disponible pour changer de logement après coup (hors F8).
- **F8-TL-2 — Contrats de phase 0.** Dans `src/contracts/creation.ts`, schémas Zod stricts `TripDraftSchema` (destination, `start`, `end`, villes avec dates et logement `{ kind: "known"; label } | { kind: "area"; label } | { kind: "none" } | { kind: "suggested"; lodgingId | areaId }`, engagements `{ kind: "flight" | "booking" | "ticket"; label; date; start; end? }`), `BriefSchema` (`travellers`, `pace: "relaxed" | "balanced" | "intense"`, `wishes` et `limits` en `Category[]`, `mobility: ("walk" | "transit" | "car")[]`, `mealBudgetPerPerson?`, `inferredFields`), `LodgingSuggestionSchema` (quartier : identifiant, nom maison, raison maison ; jusqu'à 3 logements : identifiant, `placeId?`, nom maison, `meta` maison), `GenerationStatusSchema` (phase, jours prêts, `expected`, `ready`, raison d'arrêt, `retryable`), alignés sur les noms du handover back-end en revue (B9 les complète sans les renommer). Aucun texte d'interface dans ces données.
- **F8-TL-3 — Adaptateurs.** `CreationAdapter` (`structureBrief`, `suggestLodging`, `createTrip`, `getGenerationStatus`) et `AuthAdapter` (`requestCode`, `verifyCode`, `getSession`, `signOut`), choisis par `DATA_ADAPTER` et `AUTH_ADAPTER` (variables serveur), appelés depuis des actions serveur ; implémentations `mock` en mémoire du processus serveur, sans réseau, sans écriture disque ; erreurs au format commun du handover back-end (code stable, champ). L'adaptateur `auth` simulé lit sa durée de validité (10 min) et son nombre d'essais (3) dans sa configuration ; il ne pose aucun cookie : en phase 0, les pages après connexion prennent le contexte de `getRequestContext()` (décision 0013 § 3.6), et la garde de session arrive avec B3.
- **F8-TL-4 — Marque « déduit » hors `Chip`.** Prop `inferredValue?: T` sur `SegmentedControl` (contour pointillé `ink` sur l'option déduite tant qu'elle est choisie et non touchée) et prop `inferred` sur le champ numérique du brief ; rendu à confirmer par UX/UI (F8-Q1).
- **F8-TL-5 — Brouillon et lancement.** Fournisseur React client monté dans `src/app/layout.tsx` (ou un groupe de routes commun à `/voyages/nouveau` et `/connexion`), réducteur pur testé ; étape sans écran `/voyages/nouveau/lancer` qui appelle `createTrip` puis remplace l'adresse. Alternative : brouillon dans `sessionStorage` (C6 du handover back-end) ; écartée ici en phase 0 pour ne pas stocker le récit côté client.
- **F8-TL-6 — Suivi de la génération.** En phase 0, interrogation de `getGenerationStatus` toutes les secondes, arrêtée dans un état final ; le flux `/api/v1/trips/[id]/generation` du handover back-end en revue remplacera l'interrogation sans changer l'écran.
- **F8-TL-7 — Mini-carte de zone.** Composant `AreaMap` dans `src/components/carte`, sur `CarteProvider` : centre et rayon de la zone (données maison du quartier), sans marqueur de logement en phase 0 ; carte simulée seulement sur `/dev/voyages/nouveau/logement`.
- **F8-TL-8 — Codes des envies.** Étendre `CategorySchema` avec trois codes pour les envies de F8-PO-6 : `heritage`, `market`, `nightlife` (les cinq de F6 restent : `museum`, `walk`, `nature`, `tasting`, `restaurant`), libellés dans `fr.json`. Amende la décision 0013 § 3.1, qui prévoyait cet alignement « quand F8 et B9 le fixeront ».

## Critères d'acceptation
Transverses :
- [ ] `pnpm verify` passe, sans clé ni service externe.
- [ ] **Aucune persistance locale** : après le parcours complet (écrans 1 à 5, erreurs de code comprises), `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` et `caches.keys()` renvoient des listes vides, aucun cookie n'est posé ; l'email, le récit et le code n'apparaissent dans aucune adresse visitée, ni dans aucun événement enregistré, ni dans la console (test `creation: aucune donnée persistée ni exposée`) ; la règle de lint de F4 contre le stockage client couvre les nouveaux dossiers.
- [ ] Aucune requête réseau hors de l'origine de l'application pendant les specs de F8 (domaines Google bloqués, zéro requête vers un autre hôte) ; aucun fichier de `src/features/creation`, `src/features/compte`, `src/app/voyages/nouveau` ni `src/app/connexion` n'importe la carte simulée ni `src/mocks` ; `/dev/voyages/nouveau/logement` répond 404 en build de production sans `VADROUILLE_DEV_PAGES=1` (test et job `docker`).
- [ ] axe sans violation sur chaque état listé dans « Tests » ; contour de focus 2 px `line` décalé de 2 px ; chaque élément interactif mesure au moins 44 × 44 px ; chaque écran a un seul titre de niveau 1 (Playwright).
- [ ] Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` ; tous les textes dans `fr.json` sous `creation.*` et `connexion.*` ; aucun texte « Aperçu », « Supprimer », « OK », « Valider » ni point d'exclamation dans `fr.json` ni dans le rendu ; `react/jsx-no-literals` actif sur les nouveaux fichiers (lint et test).
- [ ] Les captures 390 × 844 de chaque écran et état sont jointes à la PR ; la PR liste les rendus provisoires (F8-Q1), les choix soumis au Tech Lead (F8-TL-1 à F8-TL-8) et l'absence de maquette (Q12).

Écrans 1 et 2 [a] :
- [ ] **Créer un voyage sans hôtel** (scénario du handover § 14, partie création) : saisir « Édimbourg », 29.08.2026 – 03.09.2026, « Pas encore », un engagement « Billet » « [Tattoo] » le 29.08 à 21:30 ; « Continuer » mène à `/voyages/nouveau/brief` (test `creation: créer un voyage sans hôtel`).
- [ ] Écran 1, « Continuer » sans rien saisir : messages sur la destination, les dates et le logement, `aria-invalid="true"`, focus sur la destination ; arrivée au 31.07.2026 (passé) refusée ; départ égal à l'arrivée refusé ; engagement hors des dates refusé ; une 5e ville et un 11e engagement ne peuvent pas être ajoutés (tests).
- [ ] « Retour » depuis l'écran 2 revient à l'écran 1 avec toutes les saisies ; recharger l'écran 2 ramène à `/voyages/nouveau` avec l'annonce « Ton brouillon n'a pas été conservé. » (test `creation: brouillon en mémoire`).
- [ ] Récit de moins de 20 caractères : erreur et aucun appel ; récit simulé valide : « Préparer mon brief » affiche la vérification, focus sur « Vérifie ton brief » ; le compteur bloque la saisie à 1 000 caractères (test).
- [ ] Vérification avec le brief simulé : les champs déduits sont en pointillé et leur nom accessible contient « déduit de ton récit » ; une section facultative qui contient une déduction est ouverte (`aria-expanded="true"`), « Déplacements » (déduits) est ouverte, « À limiter » et « Budget par repas » sont repliées (test `brief: déductions visibles`).
- [ ] **Corriger le brief** (scénario du handover § 14) : toucher la `Chip` déduite choisie « Dégustations » la retire (`aria-pressed="false"`, plus de pointillé, plus de mention « déduit ») ; la toucher de nouveau la choisit en aplat `line` sans pointillé ; changer le rythme déduit retire sa marque ; « Continuer » enregistre un `brief_completed` avec `inferred_fields_count` = 4 (voyageurs, rythme, envies, déplacements) et `edited_fields_count` = 2 (envies, rythme) (test `brief: corriger une déduction`).
- [ ] « Remplir moi-même » : aucun champ déduit, aucun pointillé, rythme sans choix ; « Continuer » sans rythme ni envie : erreurs, focus sur le rythme ; un `brief_completed` avec `inferred_fields_count` = 0 après correction (test).
- [ ] Une envie choisie est désactivée dans « À limiter » avec « Déjà dans tes envies » (test).
- [ ] Erreur simulée de `structureBrief` : bandeau `role="alert"` avec « Réessayer » et « Remplir moi-même », récit conservé (test).

Écrans 3 et 4 [b] :
- [ ] Après le brief d'un voyage « Pas encore », l'écran 3 montre le quartier conseillé (niveau 2), sa raison, au plus 3 logements avec « Choisir ce logement », et « Partir du quartier, choisir plus tard » ; sur `/voyages/nouveau/logement` en CI, l'état « configuration absente » de F4 remplace la mini-carte et le quartier reste lisible ; sur la page de développement, la carte simulée affiche la zone (test `logement: quartier et logements`).
- [ ] Une ville inconnue du jeu simulé : « Aucun quartier à te proposer pour l'instant. » et « Continuer sans logement » ; un voyage avec logement « Oui » ne passe pas par l'écran 3 (tests).
- [ ] Écran 4 depuis la création : `/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer` ; email invalide refusé sans appel ; « Recevoir un code » affiche « Code envoyé à {email} », focus sur « Chiffre 1 sur 6 », le groupe s'appelle « Code reçu par email » ; coller le code simulé valable lance la vérification sans bouton et mène à `/voyages/mock_trip_edimbourg/preparation` ; le retour du navigateur ne ramène pas au formulaire de code (test `connexion: code à 6 chiffres`).
- [ ] Code faux : message `role="alert"` relié au groupe, `aria-invalid="true"` sur les cases, cases vidées, focus sur la première ; au 3e code faux : « Trop d'essais. », cases désactivées jusqu'à « Renvoyer le code » ; code expiré (horloge avancée de 10 min) : « Ce code a expiré. » ; trop de demandes de code : « Trop de demandes. » (test `connexion: erreurs du code`).
- [ ] Deux adresses, l'une « connue » du jeu simulé, l'autre non : même texte et même état après « Recevoir un code » (test).
- [ ] `suite` vaut `https://exemple.org`, `//exemple.org`, `/\exemple.org` ou `javascript:alert(1)` : après connexion, l'adresse est `/voyages` (test `connexion: suite interne seulement`).
- [ ] « Changer d'adresse » revient à l'étape email avec l'adresse conservée (test).

Lancement et écran 5 [c] :
- [ ] Après connexion depuis la création, un seul appel `createTrip` ; deux déclenchements du lancement pour le même brouillon (double appui, nouvelle tentative après une erreur) ne créent pas un second voyage (test unitaire d'idempotence par `requestId`) ; `active_preview_exists` simulé affiche le lien vers le voyage existant (test).
- [ ] `/voyages/mock_trip_edimbourg/preparation` avec l'horloge simulée : « En préparation » pour J1 et J2, puis annonce « Jour 1 prêt », puis « Jour 2 prêt », compteur jusqu'à « 8 propositions prêtes sur 8 », titre « Tes premières propositions sont prêtes », liens « Voir mes propositions » (`/voyages/mock_trip_edimbourg/presentation`) et « Passer, voir le programme » (`/voyages/mock_trip_edimbourg`) ; aucune redirection automatique ; le focus n'a pas bougé ; aucun nom de lieu n'est rendu (test `preparation: progression et sorties`).
- [ ] Un `preview_ready` avec `duration_ms` positif après un parcours complet ; aucun `preview_ready` en double au retour sur l'écran ; après rechargement de l'écran 5, `preview_ready` sans `duration_ms` (test).
- [ ] Aperçu incomplet simulé (6 sur 8) : bandeau `noOption` « 2 propositions n'ont pas trouvé de lieu compatible. » et les deux liens ; erreur `retryable: true` : « Réessayer » relance le suivi ; `retryable: false` : pas de « Réessayer » (tests).
- [ ] `prefers-reduced-motion: reduce` : aucune animation de tracé calculée sur les mini-lignes (Playwright).
- [ ] Voyage inconnu ou d'une autre organisation : 404 (test).

## Hors périmètre
- Connexion réelle (Better Auth, envoi d'emails, cookies de session, garde des routes), déconnexion et page de compte (export et suppression des données) : B3, B11 et F11.
- Génération réelle, structuration du brief par un modèle, suggestion de logement réelle, email « propositions prêtes » : B7, B9 ; Q25 pour l'envoi.
- Autocomplétion de destination ou de logement (F8-Q4), photos (Q6), prix et liens de réservation de logement (F8-Q5).
- Changement de logement après création (`/voyages/[id]/logement`), modification du brief après génération.
- Présentation (F6), Séjour (F5), Mes voyages (F11), mise en page grand écran (F12, Q7), thème sombre.

## Questions ouvertes
Nouvelles questions de cette spécification (numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **F8-Q1 (UX/UI)** : rendus et textes non maquettés des écrans 1 à 5 : formulaire de l'écran 1 (villes, engagements, champs de date), récit et compteur, vérification (sections repliées, résumé d'en-tête, marque « déduit » sur `SegmentedControl` et champs numériques, F8-TL-4), écran 3 (quartier, logements, mini-carte), connexion (titres, aide, messages d'erreur), écran 5 (mini-lignes, tracé, compteur, bandeaux), titres du document, libellés des envies (F8-PO-6). Bloque : validation visuelle de F8, pas le code.
- **F8-Q2 (Samuel, juridique)** : quelles mentions afficher à la création du compte (politique de confidentialité, conditions d'utilisation, sous-traitants, âge minimal) et faut-il une acceptation explicite ? Liée à Q27 et au cadrage § 9. Bloque : la mise en service de la connexion réelle (B3) ; pas F8 sur données simulées.
- **F8-Q3 (Samuel, offre)** : durée maximale d'un voyage (le « voyage complet » payé couvre « toutes les journées » ; cible 5 à 10 jours ; le coût augmente avec la durée, Q39) et nombre maximal de villes. Bloque : la règle de validation des dates ; F8 n'impose aucune durée maximale et plafonne provisoirement à 4 villes.
- **F8-Q4 (Tech Lead, puis Samuel pour la partie juridique Q5)** : la destination et le logement doivent-ils être reconnus (autocomplétion, résolution en `placeId`) ? Avec Places, le nom choisi serait une donnée Google qui ne doit pas entrer dans `BriefRequest` ni dans un prompt ; une source non Google aurait d'autres conditions. Bloque : rien dans F8 (saisie libre) ; la résolution du logement saisi relève de B9.
- **F8-Q5 (Samuel, offre)** : l'écran 3 affiche-t-il un prix indicatif et un lien de réservation par logement (affiliation « signalée comme telle », cadrage § 3.6 et § 4) ? Bloque : rien dans F8, qui n'en affiche pas.
- **F8-Q6 (Tech Lead, Sécurité)** : brouillon (récit compris) avant la connexion : mémoire de l'onglet (F8-PO-1) ou stockage navigateur (C6 du handover back-end en revue) ? Le stockage survivrait au rechargement mais garderait un récit personnel sur l'appareil. Bloque : rien en phase 0.
- **F8-Q7 (Tech Lead)** : propositions F8-TL-1 à F8-TL-8 (route de l'écran 3, contrats de phase 0, `CreationAdapter` et `AuthAdapter`, marque « déduit » de `SegmentedControl`, brouillon et lancement, interrogation de la génération, `AreaMap`, codes `heritage`, `market`, `nightlife`). Bloque : démarrage du code si le Tech Lead veut trancher avant ; sinon confirmées à la revue.
- **F8-Q8 (CEO)** : découpage F8a, F8b, F8c (F8-PO-16) et ordre avec le code de F6 (#44). Bloque : création des tickets de code.

Questions existantes qui touchent F8 (reprises sans les trancher, sauf Q35) :
- **Q35 (Product Owner)** : tranchée ici (F8-PO-7).
- **Q25 (Samuel)** : fournisseur d'envoi des codes ; F8 n'envoie rien, l'adaptateur `auth` simulé suit le contrat que B3 implémentera.
- **Q12 et Q59 (Samuel)** : maquettes et Dossier UX absents ; les scénarios « créer un voyage sans hôtel » et « corriger le brief » sont écrits sans le plan de test du Dossier UX et seront confrontés à lui.
- **Q30 (UX/UI)** : textes d'`OtpInput` ; décision proposée dans la décision 0012 (#26, en revue) ; F8 passe un libellé visible en `label` comme elle le prévoit, sans trancher le texte par défaut.
- Q4 : Better Auth (Samuel) ; Q27 : durées de conservation des briefs et comptes (Samuel) ; Q39 et Q45 : plafonds de coût et des actions sans compte (Samuel) ; Q5 : règles Google (Samuel) ; Q37 : libellé « Transports publics » (Samuel) ; Q13 : rendu des composants de F2 (UX/UI, décision 0012 en revue).
