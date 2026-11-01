# M8 — Après le voyage sur la vraie app : avis rapide, adresse découverte, mémoire des goûts

Rédaction : Product Owner · Date : 2026-11-01 · `main` relu : `0c43fdf` · Ticket : #1025 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 8, ligne M8-spec (§ 8 (c)) · Rôles des tâches qui suivent : tech-lead et sécurité (M8-TL), backend avec frontend (M8-C, M8a, M8b, M8c-1), data (M8-D), backend avec ia-recherche (M8c-2), UX/UI (rendus et textes) · Revue : Tech Lead, Sécurité, UX/UI.

Références : `specs/F11-mes-voyages-apres-etats.md` (écran 16, F11-PO-7 à F11-PO-16, « Règles Google et données personnelles »), décision 0021 (§ 1.3 forme commune des préférences, `TripReview`, `DiscoveredPlace`, `ReviewActions`), 0147 (§ 6.1 `Stop.addedBy`, § 12 S4 point 2 « Prompts : jamais dans ce lot »), 0154 et 0155 (refus et annulation d'un ajout), 0157 (§ 1.7 point 5 et § 1.8 : accord et retrait des rappels, modèle de l'accord révocable), 0158 (forme d'une décision Sécurité avec Tech Lead), 0011 et 0027 (règles Google), 0093 (décisions déléguées définitives à la fusion), `docs/handovers/backend.md` (lignes `feedback`, `preference_signals`, `preferences` du § 6 ; `TripReview` ; correspondance `PreferenceSignal` → `RetainedPreference` ; ligne B12 du § 10), `docs/handovers/frontend.md` (§ 6 ligne « Après le voyage » `/voyages/[id]/retour`, § 10 vocabulaire, § 12 mesure, § 13 hors ligne), `specs/M5-retouches.md` (§ 6 lieu à soi, M5-PO-10, M5-PO-12), `specs/M6-pendant-le-voyage-api.md` (modèle de forme), `QUESTIONS.md` (Q5, Q27, Q48, Q56, Q149, Q150, Q151, Q717).

**Prérequis, dans cet ordre** :
1. cette spécification fusionnée ;
2. **décision du Tech Lead M8-TL**, qui répond aux questions T1 à T8 du § 10, avec l'**avis de la Sécurité** sur S1 à S6 (dans sa revue ou par une décision à part) ;
3. M8-C (contrats) et M8-D (migration), en parallèle ;
4. M8a, puis M8b et M8c-1 (l'une après l'autre : même écran), puis M8c-2 (§ 6).

Si la décision M8-TL change un point de cette spécification, elle prime pour ce point.

**Exception à « une tâche = une spécification »** (`CLAUDE.md`) : les tâches du § 6 partagent cette spécification, chacune sur sa branche et dans sa PR, comme M5 (0147 § 14) et M6. Le CEO l'accorde ou la refuse (question C1 du § 10).

**Écarts relevés dans les documents**, sans effet sur le fond, soumis au Tech Lead ou à la Sécurité (§ 10) :
- **L'écran 16 n'existe pas.** F11b (écran « Après le voyage », `/voyages/[id]/retour`) n'a jamais été livrée : aucune route `src/app/voyages/[id]/retour`, aucun `TripReview`, `getTripReview`, `ReviewActions` dans `src/` (recherche du 2026-11-01). M8a la construit, pour `mock` et `api` (§ 2).
- **Contrats de 0021 § 1.3 absents.** `PreferenceSubject`, `RetainedPreference`, `preferenceKey` et `src/contracts/preference.ts` n'existent pas (aucune occurrence dans `src/`), alors que le handover les donne à « F9b ou F11b ». M8-C les crée (T2).
- **`feedback` n'est plus la table de l'avis.** Le plan (§ 8 (a)) et le ticket parlent de l'avis « table `feedback` ». Depuis la migration 0022 (M5-D), `feedback` porte les **signalements** : motif fermé `closed`, `hours`, `wrongPlace`, `price`, `other` (`db/schema/business.ts`, l. 487 et l. 523), jamais modifiée (`REVOKE UPDATE`, `db/migrations/0022_feedback_signalements.sql`, l. 60), « aucune lecture par le studio au MVP » (handover, ligne `feedback`). Un avis rapide se change à tout moment (F11-PO-10) : T1.
- **`preferences` sans contraintes.** La table de B1 (`db/schema/business.ts`, l. 700-715) n'a que `category`, `value`, `consented_at` : aucun `CHECK`, aucune origine (confirmé, déduit), aucun voyage d'origine (« Retenu après {destination} », F11-PO-13), aucune unicité (« un goût déjà retenu n'est pas retenu deux fois », F11-PO-12). `vadrouille_app` y a `SELECT, INSERT, UPDATE, DELETE` (`db/migrations/0001_securite.sql`, l. 157). M8-D la durcit (T3, S2).
- **Aucun signal `inferred` ni `travelReduction` n'est écrit sur `api`.** Aucun code de `src/server` n'écrit le statut `inferred` (seule occurrence : la liste `PREFERENCE_SIGNAL_STATUSES`, `src/contracts/values.ts`, l. 45) ni le signal `travelReduction` (B10f non faite). Les candidats « déduits » et « distance » se calculent donc à la lecture (§ 5.1), et le candidat « distance » n'apparaîtra sur `api` qu'avec B10f.
- **Adresse découverte : deux textes.** F11-PO-11 décrit une liste à part (nom saisi, jour facultatif, sans recherche, hors du programme). Le plan (§ 8 (b)) et 0147 § 6.1 (« M8b étendra la valeur (`"discovered"`) sans nouvelle forme », repris en commentaire dans `src/contracts/trip.ts`, l. 141) en font un **lieu à soi de M5d marqué « découvert »**. Cette spécification retient la seconde (§ 4, M8-PO-6) et amende F11-PO-11 ; l'autre reste ouverte au Tech Lead (T4).
- **`addedBy === "person"` est testé à huit endroits.** `src/domain/patch.ts` (l. 628, l. 706), `src/domain/signalement.ts` (l. 25), `src/server/programme/revision.ts` (l. 78 : filtre des étapes envoyées au modèle), `src/server/generation/etapes-revision.ts` (l. 381 : remise des lieux à soi après la révision), `src/server/lieux/ajout.ts` (l. 122), `src/features/sejour/StopSheet.tsx` (l. 148), `src/adapters/mock-lieux.ts`. Une valeur nouvelle qui ne serait pas reprise partout ferait **entrer un nom saisi dans un prompt** (revision.ts l. 78) ou perdre l'étape à la révision : § 4.3, critère M8b-3.
- **Numéros de questions de F11.** F11 numérotait ses questions Q160 à Q168 à titre provisoire ; `QUESTIONS.md` les a enregistrées sous Q149 à Q156. Cette spécification cite les numéros de `QUESTIONS.md`.

---

## 1. Contexte

Ce qui existe, relevé sur `0c43fdf` :

| Sujet | Contrat et base | Écrans | Vraie app (`api`) |
|---|---|---|---|
| Avis rapide | Aucun contrat ; `feedback` réservée aux signalements depuis 0022 | Aucun (F11b non livrée) | Rien |
| Adresse découverte | `Stop.addedBy: z.literal("person").optional()` (`src/contracts/trip.ts`, l. 143) ; recherche `searchPlaces`, aperçu, application et annulation d'un ajout (`src/server/actions/lieux.ts`, `src/server/lieux/`) ; limiteur `lieu-recherche` (`src/server/config/limites.ts`, l. 62) ; seuils fermés (`SEUILS_LIEUX_VALIDES = false`, `src/server/config/lieux.ts`, l. 34) | Écran « Ajouter un lieu » (`…/jour/[n]/ajouter`, M5d-2) ; fiche « Ajouté par toi. » (`StopSheet.tsx`, l. 148) | Lieu à soi livré par M5d-1 à M5d-6 (dernier : `2513fa3`, #996) |
| Goûts | Table `preference_signals` (signaux du tri, statuts `confirmed`, `inferred`, `cancelled`) ; table `preferences` (B1, sans contrainte) ; `categoriesArretees` (`src/domain/preferences.ts`, l. 115) | Aucun (F11b non livrée) ; « Mes voyages » (`src/features/compte/TripsScreen.tsx`) sans section de goûts | Signaux écrits par le tri (B10a) ; rien ne lit `preferences` |
| Brief et prompt | `BriefSchema.wishes` et `.limits` (`src/contracts/creation.ts`, l. 192-202) ; entrée `programme` : `envies`, `aEviter` (`src/ai/entrees.ts`, l. 188-202), remplies depuis le brief (`src/server/programme/brief.ts`, l. 139-140) ; aucune entrée pour la distance | Écran 2 « Vérification » (`src/features/creation/BriefReview.tsx`) | La chaîne inversée lit le brief du voyage seul |

Trois faits pèsent sur la suite :
1. **Q150 est tranchée sur le principe** (Samuel, 2026-10-11) : consentement **explicite et révocable** ; les **durées de conservation** attendent la revue juridique (Q5). Le code peut se faire ; l'ouverture à d'autres personnes que Samuel attend l'action S6 du plan (§ 11).
2. **Q151 est tranchée** : les avis après le voyage sont « à usage interne uniquement ». Ils ne produisent donc **aucun** goût, ne changent aucun programme et ne vont dans aucun prompt (M8-PO-4).
3. **Q149 est tranchée en partie** : au-delà de 30 jours après le retour, le voyage reste en lecture seule. Reste ouverte (Samuel) : un voyage jamais débloqué a-t-il « Après le voyage » ? Cette spécification applique la règle prudente (voyage débloqué seulement, M8-PO-2) et repose la question (Samuel, question 3).

## 2. Ce que la personne voit, tâche par tâche

| Tâche | Ce que Samuel voit sur la vraie app (adaptateur `api`) |
|---|---|
| **M8a — Avis rapide** | Le dernier jour de son voyage, « Mes voyages » et l'écran « Aujourd'hui » lui proposent « Donner ton avis ». L'écran « Après le voyage » liste ses étapes jour par jour ; pour chacune il touche « J'ai aimé », « Pas pour moi » ou « Pas fait ». Il recharge la page : ses avis sont là. Plus de 30 jours après son retour, il les voit encore, sans pouvoir les changer. |
| **M8b — Adresse découverte** | Pendant son voyage, dans la Journée d'aujourd'hui (ou d'un jour passé), il ajoute un lieu trouvé sur place par « Ajouter un lieu », comme un lieu à soi. La fiche dit « Découvert sur place. ». Après le voyage, l'écran « Après le voyage » les liste sous « Adresses découvertes », et il peut leur donner un avis comme aux autres étapes. |
| **M8c-1 — Retenir mes goûts** | Sous ses avis, « Retenir mes goûts » lui propose, toutes décochées, les préférences tirées de son tri (« Tu préfères éviter les musées et monuments », « Tu aimes les dégustations », déduit). Il en coche deux, « Retenir ces goûts ». Dans « Mes voyages », « Tes goûts retenus » les liste ; « Retirer » en retire un (annulable 5 s), « Retirer tous mes goûts » les retire tous. |
| **M8c-2 — Goûts proposés au voyage suivant** | Il crée un nouveau voyage. À l'écran 2 (« Vérification »), un bloc « Tes goûts retenus » lui propose ses goûts, décochés. Il coche « Tu préfères éviter les musées et monuments » : la catégorie s'ajoute à « À éviter » de ce voyage, et le programme écrit par l'IA en tient compte. Il ne coche rien : rien ne change. |

---

## 3. Avis rapide sur `api` (M8a)

### 3.1 Accès à l'écran 16

1. **Adresse** : `/voyages/[id]/retour` (handover front § 6, ligne « Après le voyage » ; méthode de `tripRoutes` : Tech Lead, T5). Inscrite à `tests/e2e/routes.ts`.
2. **Session et personne** : sur `api`, session `better-auth` vérifiée (sinon la page de connexion, comme le Séjour) ; voyage de l'organisation de la session, sinon 404. Lecture et écriture réservées à **la personne propriétaire du voyage** (`trips.created_by`, `db/schema/business.ts`, l. 77), comme M6 (M6-PO-2) : un autre membre reçoit `not_found` sur toute écriture. Au MVP, l'organisation n'a qu'une personne.
3. **Voyage débloqué seulement** (`Trip.unlocked`, `src/contracts/trip.ts`, l. 378), en attendant la réponse de Samuel au reste de Q149 (question 3) : sinon 404, et aucun lien « Donner ton avis ».
4. **Dates** (F11-PO-6, F11-PO-8), à la date locale de la destination (`trip.timeZone`) :
   - avant le dernier jour : « Ton voyage n'est pas terminé… » et « Voir le séjour », rien d'autre (F11-PO-8) ;
   - du dernier jour jusqu'à `accessUntil(trip.end, accessDaysAfterReturn)` compris (`src/lib/dates.ts`, l. 98 ; `src/server/config/offer.ts`, l. 23 : 30 jours) : écran complet, modifiable ;
   - après : **lecture seule** (Q149) : avis, adresses et goûts déjà retenus affichés, sans aucune action d'écriture (boutons absents, serveur qui refuse par `not_found`), avec le texte du § 7.
5. **Liens** (F11-PO-7, F11-PO-9) : « Donner ton avis » dans « Mes voyages » (ligne du voyage, à partir du dernier jour, lien distinct, jamais imbriqué) et dans l'état « Ton voyage est terminé » de l'écran 15 (`src/features/voyage/TodayScreen.tsx`). Aucun bandeau, aucune notification, aucun e-mail.

### 3.2 Étapes à évaluer

1. **Une ligne par étape** de la **version courante** (F11-PO-10) : activité, repas, événement placé dans le programme, lieu à soi et adresse découverte compris ; ni terminus, ni segment, ni temps libre, ni repas pas encore choisi, ni événement hors programme, ni journée en préparation. Fonction pure (`src/domain/`, nom : Tech Lead), testée sur ces cas.
2. **Trois choix exclusifs** « J'ai aimé », « Pas pour moi », « Pas fait », sans valeur au départ, modifiables à tout moment, sans « Annuler » (le choix s'annule lui-même, F11-PO-10). Ni note chiffrée, ni texte libre, ni raison (collecte minimale, cadrage § 9).
3. **Effacer son avis** : toucher à nouveau le choix actif le retire (l'étape revient sans avis). Raison : une donnée personnelle donnée par erreur doit pouvoir disparaître sans passer par la suppression du compte. Rendu : UX/UI (U1).
4. **Enregistrement immédiat**, un appel par geste, idempotent (`requestId`). Le dernier geste l'emporte. Rien n'est gardé dans le navigateur (ni `localStorage`, ni `sessionStorage`, ni l'adresse) ; la mention de démonstration de F11 (« tes avis ne sont pas conservés après un rechargement ») ne s'affiche pas sur `api` (elle reste sur `mock`).
5. **Identité d'un avis** : voyage, identifiant d'étape (`Stop.id`) **et** `placeId` de l'étape dans la version courante (les identifiants d'étape sont réutilisés d'une version à l'autre : 0142 § 5.1, même raison que `feedback_stop_dedup_idx`). Une étape remplacée après un avis (autre `placeId`) revient sans avis. Le `placeId` est la seule donnée Google de la ligne (0011).
6. **Hors ligne** (handover § 13) : bandeau « Tu es hors ligne… », choix en `aria-disabled="true"`, avis déjà donnés affichés.
7. **Erreur d'écriture** : le choix revient à son état d'avant, texte du § 7 avec « Réessayer » ; jamais un avis affiché comme enregistré s'il ne l'est pas.

### 3.3 Données (forme : Tech Lead, T1)

Proposition du Product Owner : une table propre, `stop_reviews` (organisation, voyage, `stop_id`, `place_id`, `rating` ∈ `liked`, `disliked`, `notDone`, `created_by`, `updated_at`, `request_id`), une ligne par `(organisation, voyage, stop_id, COALESCE(place_id, ''))`, **modifiable** (`UPDATE (rating, updated_at, request_id)`) et **supprimable** par la personne (effacer son avis, § 3.2 point 3), RLS par organisation, vidée par `purge_organization_data`. Raison de ne pas étendre `feedback` : un signalement n'est jamais modifié et n'est lu par personne ; un avis se change et s'efface. Aucun nom, aucun texte.

### 3.4 Usage des avis (Q151)

« Usage interne uniquement » (Samuel). M8 n'en fait **rien d'autre que les garder et les montrer à la personne** : aucun goût n'est déduit des avis (§ 5.1), aucun programme ne change, aucun modèle ne les reçoit, aucun écran du studio ne les lit. Une lecture interne (agrégats par catégorie, par exemple) demandera sa propre tâche et l'avis de la Sécurité (S5).

---

## 4. Adresse découverte (M8b)

### 4.1 Ce que c'est (M8-PO-6)

Un **lieu à soi** (M5d) ajouté **sur place** : même écran « Ajouter un lieu », même recherche (`searchPlaces` → `placeId`), même nom **saisi** par la personne (M5-PO-10 : jamais le nom Google), même moment libre et même aperçu, même verrou, même « Annuler » (`undoAddPlace`). Seule différence : la marque `addedBy: "discovered"` au lieu de `"person"`.

**Règle de la marque, calculée par le serveur** (aucun champ nouveau dans `AddPlaceRequest`, aucune case à cocher) : un ajout est « découvert » si, au moment de l'application, la date locale de la destination est **entre le premier et le dernier jour du voyage** (bornes comprises) **et** que la journée visée est **aujourd'hui ou un jour passé**. Sinon (avant le voyage, ou pour un jour à venir), `"person"` comme aujourd'hui. Exemple d'Édimbourg (2026-08-29 au 2026-09-03, `Europe/London`) : ajout le 2026-08-31 pour J3 (31.08) ou J2 → `discovered` ; le même jour pour J4 → `person` ; le 2026-08-20 pour J1 → `person`.

Raisons : « la personne note un lieu trouvé sur place » (plan § 8 (b)) ; un ajout pour demain est une préparation, pas une découverte ; aucune question de plus à la personne. La forme (valeur de `addedBy`, ou champ à part) est confirmée par le Tech Lead (T4).

**Après le dernier jour**, on n'ajoute plus d'adresse découverte : l'écran 16 liste celles du voyage, sans formulaire (F11-PO-11 amendée, M8-PO-6). Raison : le lieu à soi exige un moment libre de la journée et une recherche Google payante ; un carnet d'adresses hors du programme serait une autre fonction (hors périmètre, § 9).

### 4.2 Ce que la personne voit

1. **Fiche** : « Découvert sur place. » au lieu de « Ajouté par toi. » (`StopSheet.tsx`, l. 148).
2. **Écran 16**, section « Adresses découvertes » (titre de niveau 2), après « Tes étapes » : une ligne par étape `discovered` de la version courante, dans l'ordre du programme, « {nom} · Jour {n} » ; sans adresse Google, sans carte. Ces étapes ont aussi leur ligne d'avis dans « Tes étapes » (§ 3.2). Aucune adresse : « Aucune adresse découverte pendant ce voyage. »
3. **Vue partagée** : inchangée (`addedBy` n'est pas dans la liste blanche de `shared_stop`, 0147 § 6.1).
4. **Calendrier** (M6b) : une adresse découverte est une étape comme une autre.

### 4.3 Un lieu découvert est un lieu à soi partout

Toute règle écrite pour `addedBy: "person"` vaut pour `"discovered"`. M8b remplace chaque test d'égalité par un prédicat commun (par exemple `estLieuASoi(stop)`, `src/domain/`) aux endroits listés en tête (« Écarts », dernier tiret), en particulier :
- **prompts** : `src/server/programme/revision.ts` (l. 78) retire aussi les étapes `discovered` de toute entrée de modèle (0147 § 12 S4 point 2) ;
- **révision** : `src/server/generation/etapes-revision.ts` (l. 381) les remet telles quelles ;
- **signalement** : `src/domain/signalement.ts` (l. 25), une adresse découverte ne se signale pas ;
- **ajouts du moteur** : `src/domain/patch.ts` (l. 628).

### 4.4 Données

Aucune migration : la marque vit dans l'instantané (`trip_versions`), comme `"person"` (0147 § 6.1). Seul `placeId` est stocké (0011).

---

## 5. Mémoire des goûts (M8c), sur accord explicite et révocable (Q150)

### 5.1 Candidats (M8-PO-7)

Calculés par le serveur à la lecture de l'écran 16, fonction pure de `src/domain/` sur les signaux **actifs** (statut différent de `cancelled`) de `preference_signals` **de ce voyage**, selon la correspondance du handover (« Correspondance `PreferenceSignal` → `RetainedPreference` ») :
- **« Tu préfères éviter {catégorie} »**, origine **confirmé** : un `answerYes` actif à la question de catégorie (`categoriesArretees`, `src/domain/preferences.ts`, l. 115) ;
- **« Tu aimes {catégorie} »**, origine **déduit** : au moins **trois** `like` ou `choose` actifs sur des cartes de cette catégorie (règle « trois « j'aime » déduits » du handover), sauf si la même catégorie est « à éviter » confirmée ;
- **« Tu préfères rester près de ton hôtel »**, origine confirmé : un `travelReduction` actif (aucun sur `api` avant B10f).

Jamais à partir des avis (Q151), des adresses découvertes, du brief ni d'un `placeId`. Un candidat déjà retenu (même sujet, même sens : `preferenceKey`) est affiché coché, désactivé, « Déjà retenu » (F11-PO-12). Aucun candidat : « Aucun goût à retenir pour ce voyage. ».

### 5.2 Accord

1. **Opt-in** (F11-PO-12, principe produit 3) : cases toutes décochées, bouton « Retenir ces goûts » ; rien sans une case cochée. Le texte au-dessus des cases est le **texte d'accord** : il dit ce qui est gardé, à quoi cela sert, comment le retirer, et **combien de temps** (durée : Samuel, question 1). Tant que Samuel n'a pas validé le texte et la durée (action S6), la fonction ne s'ouvre à aucune autre personne que Samuel (plan § 11 ; § 6, M8c-1).
2. **Par personne** : un goût retenu appartient à la personne (`preferences.user_id`), pas au voyage ni à l'organisation entière ; il est proposé dans les voyages **qu'elle crée ensuite dans la même organisation**.
3. **Enregistrement** : sujet (catégorie et sens, ou distance), origine (confirmé, déduit), voyage d'origine (pour « Retenu après {destination} »), instant de l'accord. **Rien d'autre** : ni nom d'étape, ni `placeId`, ni texte, ni destination recopiée (la destination se relit sur le voyage d'origine ; voyage supprimé : « Retenu après un voyage »).
4. **Un geste de retenue n'est pas limité** au-delà du limiteur commun des actions (valeur : Sécurité, S3) ; le nombre de goûts d'une personne est borné par construction (8 catégories × 2 sens + la distance).

### 5.3 Retrait (révocable)

1. **« Tes goûts retenus »** dans « Mes voyages » (F11-PO-13) : une ligne par goût, « Retenu après {destination} », « Retirer » (annulable 5 s, principe produit 5).
2. **« Retirer tous mes goûts »** sous la liste, avec confirmation. Raison : retirer doit être aussi simple que donner (RGPD art. 7 (3), même principe que 0157 § 1.7 point 5) ; l'accord se donne en un geste pour plusieurs goûts.
3. **Effet** : le goût est **supprimé** (pas seulement marqué), immédiatement ; il n'est plus proposé, y compris dans un brief ouvert dans un autre onglet (la proposition est relue à l'affichage de l'écran 2 et refusée côté serveur si le goût n'existe plus, § 5.4 point 4). « Annuler » dans les 5 s le rétablit à l'identique (sujet, origine, voyage d'origine) ; ce que devient l'instant d'accord (l'ancien, ou celui de l'annulation) : Sécurité, S2.
4. **Jamais refusé** : un retrait ne passe par aucune limite qui pourrait le refuser, ne dépend ni du déblocage ni des 30 jours, et réussit même si le voyage d'origine n'existe plus (comme le retrait d'un accord de rappel, 0157 § 1.7 point 5).
5. **Suppression du compte** (M9) et purge de l'organisation : `purge_organization_data` supprime déjà `preferences` (`db/migrations/0024_rappels.sql`, l. 218) ; à garder dans toute redéfinition.

### 5.4 Goûts proposés au voyage suivant (M8c-2)

1. **Où** : écran 2 « Vérification » du brief (`BriefReview.tsx`), bloc « Tes goûts retenus », **seulement** si la personne est connectée à ce moment-là et a au moins un goût retenu. Sinon le bloc n'existe pas (pas de texte de remplacement). Le site d'essai (`prototype`) n'est pas concerné (plan § 10).
2. **Proposés, jamais appliqués d'office** (texte promis par F11-PO-12) : une case par goût, **décochée**. Cocher « Tu aimes {cat.} » ajoute la catégorie aux envies (`wishes`) ; « Tu préfères éviter {cat.} » l'ajoute à « À éviter » (`limits`). Le champ ainsi rempli compte comme **saisi** par la personne (il n'entre pas dans `inferredFields`). Décocher le retire.
3. **Conflits** : un goût déjà vrai dans le brief (catégorie déjà dans les envies, ou déjà « à éviter ») s'affiche coché et désactivé, « Déjà dans ce voyage » ; un goût contraire au brief (catégorie « à éviter » retenue alors qu'elle est dans les envies de ce voyage, ou l'inverse) s'affiche décoché et désactivé, « Contraire à ce voyage » : **le brief du voyage l'emporte** (aucune généralisation silencieuse, principe produit 3).
4. **Contrôle serveur** : à la création du voyage, le serveur ne fait **aucune** fusion lui-même ; il reçoit le brief final comme aujourd'hui (`TripRequest`). Les goûts n'entrent dans le voyage que par les cases cochées par la personne. Aucune ligne n'est écrite dans `preference_signals` du nouveau voyage.
5. **Prompt `programme`** : les catégories arrivent par les champs existants `envies` et `aEviter` (`src/server/programme/brief.ts`, l. 139-140 ; `src/ai/entrees.ts`, l. 196-199) : **aucun champ nouveau, aucune version de prompt** pour elles. Le goût « distance » n'a aucun champ dans le brief ni dans l'entrée : soit un champ facultatif nouveau (par exemple `resterPresDuLogement: true`) dans l'entrée `programme` v5 et son texte de prompt (ia-recherche), soit il n'est pas proposé à l'écran 2 (seulement listé et retirable) : Tech Lead, T7. Recommandation du Product Owner : ne pas le proposer dans M8c-2, faute de source sur `api` avant B10f.
6. **Jamais une donnée Google** (`CLAUDE.md`, 0011) : l'entrée du modèle ne reçoit que des codes de `CATEGORIES` (et, selon T7, un booléen). Ni `placeId`, ni nom de lieu, ni nom d'étape, ni nom saisi, ni adresse découverte, ni avis. Test à sentinelles (critère M8c-2-5).

---

## 6. Découpage des tâches, fichiers, critères, tests

Composition simulée partout, barrière fermée, aucun appel payant, tests de base de données en CI. Les noms de fichiers sont des propositions : la décision M8-TL et l'analyseur de confinement font foi. Voyage de référence : Édimbourg débloqué, 2026-08-29 au 2026-09-03, `Europe/London`, horloge injectée.

| ID | Tâche | Rôle | Prérequis | Interdit dans le même cycle |
|---|---|---|---|---|
| **M8-TL** | Décision : T1 à T8, avis S1 à S6 | tech-lead, securite | cette spécification | — |
| **M8-C** | PR de contrat (0147 § 14) : `src/contracts/preference.ts` (0021 § 1.3), avis, `TripReview` complété, `addedBy` étendu (selon T4), événements de F11-PO-16 ; aucun cas d'usage | backend avec frontend | M8-TL | une tâche qui touche `src/contracts` ou `src/analytics/events.ts` |
| **M8-D** | Migration : table des avis (T1), `preferences` durcie (T3) ; RLS, droits, purge, `.down.sql` | data | M8-TL | toute autre tâche `db/migrations` (plan § 10) |
| **M8a** | Écran 16 et avis rapide (§ 3), `mock` et `api` ; liens « Donner ton avis » | frontend avec backend | M8-C, M8-D | M8b, M8c-1 (même écran) ; une tâche qui touche `TripsScreen.tsx` ou `TodayScreen.tsx` |
| **M8b** | Adresse découverte (§ 4) | backend avec frontend | M8a, M5d (fusionnée) | M8c-1 ; une tâche qui touche `src/server/lieux/`, `src/server/programme/revision.ts`, `src/server/generation/etapes-revision.ts` ou `StopSheet.tsx` |
| **M8c-1** | Retenir et retirer ses goûts (§ 5.1 à § 5.3) | backend avec frontend | M8a, M8-D ; **S2 de la Sécurité** | M8b ; une tâche qui touche `TripsScreen.tsx` |
| **M8c-2** | Goûts proposés à l'écran 2 et transmis au prompt (§ 5.4) | backend avec frontend ; ia-recherche si T7 retient un champ « distance » | M8c-1, T7 | une tâche qui touche `src/features/creation/` ou `src/ai/entrees.ts` |

Ordre proposé : M8-TL ; M8-C et M8-D en parallèle ; M8a ; M8b puis M8c-1 (ou l'inverse) ; M8c-2. **Ouverture à d'autres personnes que Samuel** (pas le code) : après l'action S6 (textes et durées, question 1 à Samuel).

### 6.1 M8-C — Contrats

**Fichiers** : `src/contracts/preference.ts` (nouveau : `PREFERENCE_DIRECTIONS`, `PREFERENCE_ORIGINS`, `PreferenceSubjectSchema`, `RetainedPreferenceSchema`, `preferenceKey`, 0021 § 1.3) ; `src/contracts/review.ts` (nouveau, nom : Tech Lead : `STOP_RATINGS = ["liked", "disliked", "notDone"]`, demande d'avis `{ tripId, stopId, rating | null, requestId }`, `TripReviewSchema` complété : étapes et leur avis, candidats, goûts déjà retenus, `readOnly`) ; `src/contracts/trip.ts` (`addedBy`, selon T4) ; `src/contracts/values.ts` ; `src/contracts/index.ts` ; `src/analytics/events.ts` (quatre événements de F11-PO-16) ; `docs/handovers/backend.md` (lignes de contrats du § 4 et catégories de champs) ; `tests/unit/contracts/categories.test.ts`.

**Critères** : 1. `preferenceKey` stable (`category:museum:less`, `distance`) et `RetainedPreference.id === preferenceKey(subject)` (raffinement testé). 2. Les schémas sont stricts : un `placeId`, un nom, un texte libre ou une clé inconnue sont refusés (tests). 3. `StopSchema` accepte `addedBy: "discovered"` (selon T4) ; le test existant `src/contracts/retouches.test.ts` l. 93 (« `discovered` refusé ») est **modifié** par cette PR sous la présente spécification et la décision M8-TL, jamais retiré sans elles. 4. Les quatre événements refusent un identifiant, un nom, une destination, un texte libre. 5. `contrats: chaque champ a une seule catégorie` vert.

### 6.2 M8-D — Migration

**Fichiers** : `db/schema/business.ts` ; `db/migrations/<n>_apres_voyage.sql` et `.down.sql` (numéro libre à la PR) ; `db/migrations/meta/_journal.json` ; `tests/db/apres-voyage.test.ts` (nouveau) ; `tests/db/roles.test.ts` ; `tests/unit/db/` (comparaison des valeurs fermées avec `src/contracts/values.ts`, comme `migration-feedback.test.ts`).

**Critères** : 1. Table des avis (forme T1) : RLS activée et forcée, isolation entre deux organisations, unicité par étape et `placeId`, `CHECK` des valeurs de `STOP_RATINGS`, aucune colonne de texte. 2. `preferences` (forme T3) : `CHECK` du sujet (catégorie de `CATEGORIES` et sens `more`/`less`, ou distance), origine, voyage d'origine **sans** clé étrangère bloquante (`ON DELETE SET NULL` ou équivalent : un goût survit au voyage), unicité `(organization_id, user_id, sujet)`. 3. Droits de `vadrouille_app` minimaux (forme T3, S1) ; `purge_organization_data` supprime les deux tables. 4. `schéma: RLS activée et forcée partout` et `schéma: aucune colonne de contenu Google` verts sans exception nouvelle. 5. `.down.sql` fourni et testé (`migrations-retour-arriere`).

### 6.3 M8a — Écran 16 et avis rapide

**Fichiers** : `src/app/voyages/[id]/retour/page.tsx` (nouveau ; groupe : T5) ; `src/features/voyage/ReviewScreen.tsx` et `review.ts` (nouveaux, fonction pure des étapes à évaluer) ; `src/features/sejour/routes.ts` (méthode de `R16`, T5) ; `src/features/compte/TripsScreen.tsx` (lien) ; `src/features/voyage/TodayScreen.tsx` (lien de l'état « terminé ») ; `src/server/actions/avis.ts`, `src/server/avis/` (nouveaux) ; `src/adapters/` (lecture `getTripReview` pour `mock` et `api`, forme 0021) ; `src/server/config/limites.ts` (limite `avis`, S3) ; `src/i18n/fr/apres.json` (nouveau) ; `tests/e2e/routes.ts` ; `tests/e2e/apres-voyage.e2e.spec.ts` (`mock`), `tests/e2e/apres-voyage-api.api.spec.ts` ; `tests/e2e/apres-voyage.a11y.spec.ts` ; `tests/db/avis.test.ts`.

**Critères d'acceptation** :
1. Avant le dernier jour (2026-09-02 à 23:59, heure de Londres) : seulement « Ton voyage n'est pas terminé… » et « Voir le séjour » ; le 2026-09-03 à 00:00 : écran complet.
2. Une ligne par étape à évaluer (§ 3.2 point 1) : ni terminus, temps libre, `openMeal`, événement hors programme, journée `generating` (test unitaire de `review.ts`).
3. Choisir « J'ai aimé », recharger : le choix est là (base). Le changer : une seule ligne, dernière valeur. Toucher le choix actif : l'avis disparaît, ligne supprimée.
4. Une étape dont le `placeId` change (remplacement) revient sans avis ; l'ancien avis reste en base sous l'ancien `placeId`, invisible.
5. Sans session (`api`) : page de connexion ; autre organisation ou voyage inconnu : 404 ; membre non propriétaire : écriture refusée `not_found`, rien d'écrit.
6. Voyage non débloqué : 404 et aucun lien « Donner ton avis » (jusqu'à la réponse à la question 3 de Samuel).
7. Le 2026-10-03 (dernier jour de `accessUntil`) : modifiable ; le 2026-10-04 : lecture seule, texte du § 7, aucun bouton d'écriture, et l'action serveur refuse (`not_found`), rien d'écrit.
8. Rejouer la même demande (`requestId`) ne double rien.
9. Aucune valeur sentinelle de nom d'étape, de `placeId` ni de texte dans le journal, les événements, l'adresse ou le stockage du navigateur (`avis: aucune donnée personnelle hors de la base`).
10. Événement `stop_reviewed` (propriétés de F11-PO-16 seulement).
11. « Donner ton avis » dans « Mes voyages » à partir du dernier jour, jamais avant ; dans l'écran 15 à l'état « terminé ».
12. Hors ligne : bandeau, choix `aria-disabled="true"` ; cibles ≥ 44 px ; axe sans violation ; nom accessible du groupe « Ton avis sur {nom} ».
13. `mock` : comportement de F11 (mémoire de l'onglet, mention de démonstration) ; les tests existants de « Mes voyages » restent verts sans modification.

**Tests** : unitaires (`review.ts`, dates, lecture seule) ; base (`tests/db/avis.test.ts` : critères 3, 4, 5, 7, 8) ; bout en bout `mock` et `api` (critères 1, 3, 11) ; a11y.

### 6.4 M8b — Adresse découverte

**Fichiers** : `src/domain/lieu-a-soi.ts` (nouveau, prédicat commun et règle de la marque) ; `src/domain/patch.ts`, `src/domain/signalement.ts` ; `src/server/lieux/ajout.ts` (marque calculée, horloge injectée) ; `src/server/programme/revision.ts` ; `src/server/generation/etapes-revision.ts` ; `src/adapters/mock-lieux.ts` ; `src/features/sejour/StopSheet.tsx` ; `src/features/voyage/ReviewScreen.tsx` (section) ; `src/i18n/fr/sejour.json`, `src/i18n/fr/apres.json` ; `tests/unit/ia/prompts-sentinelles.test.ts` (étendu) ; `tests/db/lieux.test.ts` ou équivalent.

**Critères d'acceptation** :
1. Règle de la marque (§ 4.1) : les trois cas d'Édimbourg (J3 le 31.08 → `discovered`, J4 le 31.08 → `person`, J1 le 20.08 → `person`), bornes du premier et du dernier jour, fuseau (appareil à Zurich, destination à Londres, autour de minuit).
2. La marque est calculée par le serveur : une demande qui tenterait de la fournir est refusée par le schéma strict (`AddPlaceRequestSchema` inchangé).
3. **Prompts** : une adresse découverte au nom `SENTINELLE-NOM-DECOUVERT-M8B` n'apparaît dans aucune requête de modèle (révision M1b, voyage complet M1c) ; elle est remise telle quelle après une révision (même test que pour `"person"`).
4. Fiche : « Découvert sur place. » ; un lieu à soi `"person"` garde « Ajouté par toi. ».
5. Une adresse découverte ne se signale pas (comme un lieu à soi) ; elle s'annule par `undoAddPlace` (5 s) ; elle survit à un `revert` vers une version qui la contient.
6. Écran 16 : section « Adresses découvertes » avec « {nom} · Jour {n} », et une ligne d'avis dans « Tes étapes » ; aucune adresse : texte du § 7 ; aucune donnée Google affichée (ni nom Google, ni adresse).
7. Vue partagée et calendrier : inchangés (tests existants verts).
8. Aucun test existant retiré ; ceux qui vérifient `"person"` restent et sont complétés pour `"discovered"`.

### 6.5 M8c-1 — Retenir et retirer ses goûts

**Fichiers** : `src/domain/gouts.ts` (nouveau, candidats § 5.1) ; `src/server/gouts/` (nouveau : retenir, retirer, tout retirer, lire) ; `src/server/actions/gouts.ts` (nouveau) ; `src/features/voyage/ReviewScreen.tsx` (section « Retenir mes goûts ») ; `src/features/compte/TripsScreen.tsx` et un composant `RetainedTastes.tsx` ; `src/adapters/` ; `src/server/config/limites.ts` (S3) ; `src/i18n/fr/apres.json`, `src/i18n/fr/compte.json` ; `tests/db/gouts.test.ts` ; `tests/e2e/gouts-api.api.spec.ts`.

**Critères d'acceptation** :
1. Candidats (unitaires) : `answerYes` actif → « éviter », confirmé ; trois `like`/`choose` actifs d'une catégorie → « aimer », déduit ; deux → rien ; un signal annulé ne compte pas ; « aimer » et « éviter » de la même catégorie : seul « éviter » ; aucun candidat tiré d'un avis.
2. Cases décochées au départ ; « Retenir ces goûts » sans case : message, rien écrit ; avec cases : une ligne par goût, instant de l'accord, origine, voyage d'origine ; aucune autre colonne remplie (test `goûts: aucune donnée Google ni texte en base`, sentinelles dans les signaux et le voyage).
3. Un goût déjà retenu : coché, désactivé, « Déjà retenu » ; le retenir de nouveau n'écrit rien (unicité).
4. « Mes voyages » : section listée avec « Retenu après {destination} » ; « Retirer » supprime la ligne ; « Annuler » dans les 5 s la rétablit (sujet, origine, voyage) ; « Retirer tous mes goûts » après confirmation : plus aucune ligne pour cette personne.
5. Retrait **jamais refusé** : limiteur simulé en panne, voyage d'origine supprimé, voyage non débloqué ou à plus de 30 jours : le retrait réussit.
6. Isolation : les goûts d'une personne ne sont ni lus ni retirés par une autre personne ou une autre organisation (`not_found` sans distinguer les cas).
7. Lecture seule de l'écran 16 (après `accessUntil`) : « Retenir ces goûts » absent ; le retrait dans « Mes voyages » reste possible.
8. Événements `tastes_retained` et `taste_removed` (F11-PO-16).
9. Hors ligne, a11y, focus après « Retirer » (règles de F11-PO-13).

### 6.6 M8c-2 — Goûts proposés au voyage suivant

**Fichiers** : `src/features/creation/BriefReview.tsx` et un composant `GoutsRetenus.tsx` ; lecture des goûts de la personne (action serveur, forme T6) ; `src/i18n/fr/creation.json` ; si T7 retient la distance : `src/ai/entrees.ts`, `src/ai/prompts/programme.ts` (version nouvelle), `src/server/programme/brief.ts`, `tests/unit/ia/prompts-versionnes.test.ts` ; `tests/unit/ia/prompts-sentinelles.test.ts` ; `tests/e2e/creation-gouts-api.api.spec.ts`.

**Critères d'acceptation** :
1. Sans goût retenu, ou sans session : aucun bloc, écran 2 inchangé (tests existants verts sans modification).
2. Avec goûts : cases décochées ; cocher « éviter musées » ajoute `museum` à `limits` ; décocher le retire ; `inferredFields` ne contient pas `limits` du fait de ce geste.
3. Conflits : « Déjà dans ce voyage » et « Contraire à ce voyage » (§ 5.4 point 3).
4. Un goût retiré dans un autre onglet n'est plus proposé au rechargement de l'écran 2.
5. **Prompt** : avec un goût retenu coché, l'entrée `programme` contient le code de catégorie dans `aEviter` (ou `envies`) et rien d'autre de nouveau ; avec des sentinelles dans le voyage d'origine (noms d'étapes, `placeId`, nom d'une adresse découverte), aucune n'apparaît dans la requête (`prompts-sentinelles` étendu).
6. Sans case cochée : l'entrée `programme` est identique à celle d'aujourd'hui pour le même brief (test d'égalité).
7. Aucune écriture dans `preference_signals` du nouveau voyage.

---

## 7. Textes proposés (français, **à valider par l'UX/UI**)

Les textes de F11 (écran 16, « Tes goûts retenus ») restent, sauf ceux de ce paragraphe. Tutoiement, phrases courtes, sans point d'exclamation (handover front § 10).

**Écran 16 (M8a)** :
- Lecture seule : « Ton voyage est terminé depuis plus de 30 jours. Tes avis restent visibles, mais ne se modifient plus. »
- Erreur d'écriture : « Impossible d'enregistrer ton avis pour le moment. » avec « Réessayer ».
- Hors ligne : « Tu es hors ligne. Ton avis sera possible dès le retour du réseau. » (F11).
- Lien : « Donner ton avis » (F11).

**Adresse découverte (M8b)** :
- Fiche : « Découvert sur place. »
- Section : « Adresses découvertes » ; sous-titre : « Les lieux que tu as ajoutés pendant ton voyage. »
- Aucune : « Aucune adresse découverte pendant ce voyage. »
- Ligne : « {nom} · Jour {n} »

**Retenir mes goûts (M8c-1)** — texte d'accord, **durée à fixer par Samuel** :
- « Facultatif. Si tu les retiens, on te les proposera quand tu prépareras ton prochain voyage, sans les appliquer d'office. On les garde {durée}, tant que tu ne les retires pas. Tu peux les retirer à tout moment dans Mes voyages. »
- Bouton : « Retenir ces goûts » ; annonce : « {n} goûts retenus. » (F11).
- « Mes voyages » : « Retirer tous mes goûts » ; confirmation : « Retirer tous tes goûts retenus ? Ils ne seront plus proposés. » avec « Tout retirer » et « Garder » ; annonce : « Tous tes goûts sont retirés. »
- Erreur : « Impossible de retenir tes goûts pour le moment. » avec « Réessayer » ; retrait : « Impossible de retirer ce goût pour le moment. » avec « Réessayer ».

**Écran 2 (M8c-2)** :
- Titre : « Tes goûts retenus »
- Sous le titre : « Retenus après tes voyages précédents. Coche ceux qui valent pour ce voyage. »
- États : « Déjà dans ce voyage » ; « Contraire à ce voyage »

---

## 8. Décisions du Product Owner

**À confirmer par la revue** (Tech Lead, Sécurité, UX/UI) ; définitives dès la fusion de cette spécification, sans délai de veto (0093), et listées dans la note de version suivante. Samuel peut les remettre en cause à tout moment par une nouvelle décision. Elles ne tranchent rien de réservé à Samuel (texte d'accord, durées, Q149 pour les voyages non débloqués), au Tech Lead (formes, T1 à T8), à la Sécurité (S1 à S6) ni à l'UX/UI (rendus, textes).

- **M8-PO-1 — Découpage.** M8-TL, M8-C, M8-D, M8a, M8b, M8c-1, M8c-2 (§ 6), une spécification pour toutes, sous réserve du CEO (C1). M8c du plan est coupée en deux : retenir et retirer (M8c-1), proposer et transmettre (M8c-2).
- **M8-PO-2 — Accès à l'écran 16.** Personne propriétaire, voyage débloqué (règle prudente en attendant Samuel, question 3), à partir du dernier jour ; lecture seule après `accessUntil(trip.end, 30)` (lecture de Q149).
- **M8-PO-3 — Avis rapide persistant.** Trois choix, modifiables, effaçables, un par étape et `placeId` ; enregistrés à chaque geste ; ni note, ni texte, ni raison.
- **M8-PO-4 — Avis à usage interne (Q151).** Aucun goût, aucun programme, aucun prompt, aucun écran du studio n'en dépend dans M8.
- **M8-PO-5 — Table propre pour les avis** (proposition, forme : T1) plutôt que `feedback`, réservée aux signalements.
- **M8-PO-6 — Adresse découverte = lieu à soi ajouté sur place.** Marque calculée par le serveur (pendant le voyage, pour aujourd'hui ou un jour passé), sans question de plus ; listée sur l'écran 16 ; plus d'ajout après le dernier jour. **Amende F11-PO-11** (liste à part, nom seul) pour `api` ; `mock` garde F11-PO-11 jusqu'à une tâche qui l'aligne. Forme : T4.
- **M8-PO-7 — Candidats de goûts.** Tirés des seuls signaux actifs du tri de ce voyage (« éviter » confirmé, « aimer » déduit à partir de trois, distance) ; jamais des avis ni d'une donnée Google.
- **M8-PO-8 — Goûts par personne, accord par geste, retrait toujours possible.** Retirer un goût ou tous, sans limite qui refuse, même après la fin d'accès au voyage ; un goût retiré est supprimé.
- **M8-PO-9 — Proposés, jamais appliqués d'office.** À l'écran 2, cases décochées ; une case cochée devient une saisie de la personne dans `wishes` ou `limits` ; le brief du voyage l'emporte en cas de conflit.
- **M8-PO-10 — Aucun champ de prompt nouveau pour les catégories.** Elles passent par `envies` et `aEviter` ; la distance attend T7 (recommandation : pas dans M8c-2).
- **M8-PO-11 — Événements.** Les quatre de F11-PO-16, sans ajout ; envoyés par le port de mesure existant, sans changement de Q56.
- **M8-PO-12 — Réponse à Q717** (question au Product Owner) : le prérequis « M5d » du plan pour M8-spec et M8b désigne **tout M5d** (M5d-1 à M5d-6) ; toutes sont fusionnées (M5d-1 `38b68f3` et suivants, M5d-2 `74174aa`, M5d-6 `2513fa3`), le prérequis est rempli. Le plan n'est pas modifié ici.

## 9. Hors périmètre

- Souvenir partageable (Q152 : après le MVP).
- Carnet d'adresses hors du programme, ajout d'une adresse découverte après le voyage, adresses découvertes réutilisées dans un autre voyage.
- Toute lecture des avis par le studio (agrégats, tableaux) ; tout usage des avis pour la génération.
- Mémoire automatique (cadrage § 6.7), goûts appliqués sans accord, goûts partagés entre personnes d'une organisation.
- Goûts autres que catégories et distance (rythme, budget des repas, déplacements).
- Écran de compte, export et suppression des données (M9) ; e-mail après le voyage.
- Site d'essai (`prototype`) : aucune tâche (plan § 10).

---

## 10. Questions, par destinataire

Rien n'est tranché ici à la place de leur destinataire. Le CEO les reporte dans `QUESTIONS.md`.

**Samuel** (réservées : juridique, données personnelles, offre) :
1. **Texte d'accord et durées de conservation** (Q150, Q27, Q5 ; action S6 du plan). (a) Le texte d'accord du § 7 (« Retenir mes goûts ») convient-il, et faut-il un consentement distinct au sens de la nLPD et du RGPD ? (b) Combien de temps garder un goût retenu (proposition : tant que la personne ne le retire pas et que son compte existe, avec effacement après 24 mois sans voyage créé) ? (c) Combien de temps garder les avis rapides (proposition : comme le voyage) ? (d) Les adresses découvertes suivent le programme du voyage (Q27). Bloque : l'ouverture de M8c à d'autres personnes que Samuel (action S6), pas le code.
2. **Q5 (juridique, règles Google)** : un goût retenu est une donnée maison (code de catégorie et sens), tirée de gestes de la personne sur des propositions dont les lieux viennent de Google. Le studio le lit comme une donnée maison, hors de 0011 ; à confirmer par la validation juridique de Q5. Bloque : rien avant la production.
3. **Q149 (reste)** : un voyage **jamais débloqué** a-t-il « Après le voyage » (avis sur les seules propositions vues, goûts du tri de l'aperçu) ? Recommandation du Product Owner : non au MVP (le tri de l'aperçu nourrit déjà ses candidats s'il est débloqué plus tard). Bloque : rien (règle prudente appliquée).
4. **Usage interne des avis (Q151)** : « interne » permet-il au studio de lire des agrégats sans nom (par exemple « Pas pour moi » par catégorie), et à partir de quand ? Bloque : une tâche future, pas M8.

**Tech Lead** (décision M8-TL) :
1. **T1 — Stockage des avis** : table propre (§ 3.3, recommandation) ou `feedback` étendue ; droits (`UPDATE`, `DELETE`), clé d'unicité avec `placeId`, idempotence.
2. **T2 — Contrats** : `preference.ts` de 0021 § 1.3 repris tel quel ou amendé ; forme de `TripReview` sur `api` (étapes, avis, candidats, goûts retenus, `readOnly`) ; `getTripReview` reste une fonction à part (0021) ou devient une méthode d'adaptateur.
3. **T3 — `preferences`** : colonnes ajoutées (origine, voyage d'origine, sujet) ou table nouvelle ; `CHECK` ; unicité ; droits réduits (`SELECT`, `INSERT`, `DELETE` ; `UPDATE` retiré ?) ; comportement à la suppression du voyage d'origine.
4. **T4 — Marque d'une adresse découverte** : `addedBy: "discovered"` (0147 § 6.1, recommandation) ou un champ à part ; prédicat commun et liste des endroits à reprendre (« Écarts ») ; horloge de la règle (date locale de la destination, au moment de l'application).
5. **T5 — Adresse de l'écran 16** : groupe de routes (`(programme)` ou à part), méthode de `tripRoutes` (F11-TL-6), page serveur et lecture.
6. **T6 — Lecture des goûts à l'écran 2** : action serveur appelée par le client, ou lecture serveur de la page ; écran 2 sans session (connexion après le brief) : rien n'est proposé.
7. **T7 — Goût « distance » dans le prompt** : champ facultatif nouveau dans l'entrée `programme` v5 et nouvelle version de prompt (avec ia-recherche), ou rien dans M8c-2 (recommandation).
8. **T8 — Calcul des candidats** : fonction pure sur les signaux lus par `src/server/generation/signaux.ts` (module unique de lecture des signaux) ou lecture propre ; seuil « trois » en configuration.

**Sécurité** :
1. **S1 — Droits** de `vadrouille_app` sur la table des avis et sur `preferences` (avec T1 et T3).
2. **S2 — Preuve de l'accord** : un goût retiré est supprimé (pas d'historique) ; faut-il garder une trace de l'accord et du retrait, sans le goût (comme `reminder_consents`, 0157 § 1.8) ? Instant d'accord après « Annuler ».
3. **S3 — Limites** : `avis` (proposition : 120 gestes par heure et par adresse IP), `gouts` (20 par heure et par adresse IP, retrait compté mais jamais refusé).
4. **S4 — Prompt** : confirmer que des codes de catégorie retenus après un voyage précédent, passés par `envies` et `aEviter`, ne demandent ni verdict nouveau ni test autre que les sentinelles (0117 S5, 0149 § 1.3).
5. **S5 — Avis à usage interne** : conditions d'une future lecture d'agrégats par le studio (avec la question 4 à Samuel).
6. **S6 — Marque « découvert » calculée** : la règle de date ne s'appuie que sur l'horloge du serveur et le fuseau du voyage, jamais sur une valeur du client ; à confirmer.

**UX/UI** :
1. **U1 — Choix d'avis** : composant (par exemple `SegmentedControl` sans valeur initiale), effacement par un second appui, lecture seule.
2. **U2 — Section « Adresses découvertes »** et texte de la fiche.
3. **U3 — « Retenir mes goûts »**, « Tes goûts retenus », « Retirer tous mes goûts » et sa confirmation.
4. **U4 — Bloc « Tes goûts retenus » de l'écran 2** : place dans `BriefReview`, cases et états « Déjà dans ce voyage », « Contraire à ce voyage ».
5. **U5 — Textes du § 7.**

**CEO** :
1. **C1 — Exception « une spécification, plusieurs tâches »** pour les sept tâches du § 6 ; ordre (une seule tâche `db/migrations` par cycle ; M8a avant M8b et M8c-1, qui partagent l'écran 16).
