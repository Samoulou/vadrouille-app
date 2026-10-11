# F7 — Remplacer, Ajouter un lieu, Déplacer

Rôle : frontend · Prérequis : code de F5 (F5a, F5b, F5c) fusionné dans `main` (handover § 15 : F7 après F5) · Ticket : #52 · Référence : `docs/handovers/frontend.md` (§ 0 règles 2 à 9, § 3, § 5 `ChangeSet`, `UndoToast`, `DayBadge`, `DayLine`, `Sheet`, `StatusBanner`, `ReasonBlock`, § 6 écran 14, « Ajouter un lieu », « Déplacer une étape », critères « 14 » et « Déplacer », règles de navigation, § 7 « Annulation » et « Remplacement », § 8, § 9 `Change`, § 10 « Programme » et « Raisons de refus ou de remplacement », § 11, § 12 `replace_applied`, `replace_undone`, `place_added`, `stop_moved`, § 13, § 14 scénario « remplacer Dean Village sans toucher au dîner », § 15 F7), `docs/produit/cadrage-v5.md` (§ 3.1 écrans 13 et 14 et « Reste à maquetter », § 3.2, § 3.4 « Exemple de référence », § 3.5 bloc « Programme », § 3.7, § 4 « Voyage complet », § 6.5, § 6.6 « Révision unitaire », § 6.10 ADR 05 et 09), `docs/CONTEXT.md` (principes produit 2, 4 et 5, principes techniques 1 et 2, « Qui décide quoi »), `docs/design-system/README.md`, `docs/design-system/redaction.md`, `docs/design-system/components/Button/`, `DayBadge/`, `DayLine/`, `ReasonBlock/`, `Tag/`, `specs/F1-contrats-donnees-simulees.md`, `specs/F3-ligne-du-jour.md`, `specs/F4-carte.md`, `specs/F5-sejour-journee-fiche.md`, `specs/F6-presentation.md`, `specs/B0-handover-backend.md` (PO-5), `docs/decisions/0013-decisions-tech-lead-f3-f4-f6.md` (§ 1.4 carte simulée, § 3.2 actions injectables, § 3.3 mesure, § 3.5 `Dialog`, § 3.6 contexte), `docs/decisions/0015-decisions-tech-lead-f5.md` (§ 1 `tripRoutes`, § 2 `openMeal`, § 3 `SurpriseIdea`, § 5.3 `TripShell`, § 6 `ProgrammeActions`, § 9 `Stop.commitment`), `QUESTIONS.md` (Q5, Q12, Q14, Q49, Q59, Q63, Q67, Q71).

Documents en revue, non fusionnés au 2026-10-09, cités pour cohérence sans en dépendre : handover back-end (PR #27, `docs/handovers/backend.md` : actions `previewReplacement`, `searchPlaces`, `getMoveOptions`, `applyPatch` ; contrats `ReplacementRequest`, `ReplacementPreview`, `PlaceSearchResult`, `MoveOptions`, `TripPatch` (`replace`, `add`, `move`, `revert`), `PatchResult` ; erreurs `version_conflict`, `no_option`, `cost_cap_reached`, `rate_limited`, `provider_error` ; règle « `Stop.name` jamais écrit depuis le `displayName` Google » ; question 6 du § 17, reprise en Q49 ; tâche B11).

Maquettes : l'écran 14 est maquetté dans le canevas « Direction Ligne », mais son export PNG manque (`docs/ux/maquettes/` est vide, Q12) ; « Ajouter un lieu » et « Déplacer » ne sont pas maquettés (cadrage § 3.1, « Reste à maquetter »). Le Dossier UX n'est pas dans le dépôt (Q59). Les critères viennent du handover § 6 et § 7, du cadrage et du design system ; tout rendu ou texte non maquetté est marqué « provisoire (UX/UI) ».

## Objectif
Rendre le programme modifiable sur données simulées, sans jamais rien changer sans aperçu des effets : remplacer une étape (écran 14 : raison, souhait, proposition, « Ce qui change » et « Ce qui ne bouge pas », « Appliquer » ou « Annuler »), ajouter un lieu à un moment libre du voyage, déplacer une étape vers un autre moment ou un autre jour sans glisser. Chaque modification appliquée revient à la Journée, surligne les étapes modifiées pendant 2 secondes et reste annulable 5 secondes (`UndoToast`). Aucune persistance côté client, aucun appel de modèle, aucune donnée Google affichée, stockée ou transmise.

## Prérequis vérifiables
| Élément | Livré par | Référence |
|---|---|---|
| `TripSchema`, `DaySchema`, `StopSchema`, `ChangeSchema`, `PreferenceReasonSchema` (`notMyStyle`, `tooBusy`, `tooExpensive`, `tooFar`, `other`), adaptateur `mock`, isolation par organisation, `getRequestContext()` | F1 (#11), F6 (#44) | `src/contracts`, `src/adapters` |
| `Button`, `IconButton`, `Tag`, `Chip`, `SegmentedControl`, `StatusBanner` (dont `offline`, `noOption`, `conflict`, `error`), `/dev/composants`, règle `react/jsx-no-literals`, `provisoire.css` | F2 (#19) | `specs/F2-composants-base.md` |
| `DayBadge` (état désactivé « complet »), `DayTabs`, `DayLine`, `StopMarker` | F3 (#30) | `specs/F3-ligne-du-jour.md` |
| `DayMap` (`selectedStopId`), `PlacesAttribution`, carte simulée réservée à `src/app/dev/` | F4 (#35) | `specs/F4-carte.md`, décision 0013 § 1.4 |
| `UndoToast` et `UndoToastRegion`, module de mesure (`src/analytics/events.ts`, `track.ts`, `EVENT_REASON`), `Dialog` sur `@radix-ui/react-dialog` | F6 (#44) | `specs/F6-presentation.md`, décision 0013 § 3.3 et § 3.5 |
| `Sheet`, `TripShell` et son contexte, `tripRoutes` (`remplacer`, `ajouter`), pages `/dev/voyages/…`, Fiche étape (actions « Remplacer » et « Verrouiller »), `ProgrammeActions` (`setStopLocked`, `undo`), `getIdeasHref`, `openMeal`, `Day.surprise` (`SurpriseIdea`), type `travel` de `StatusBanner`, `travel.ts`, `Stop.commitment` | F5a, F5b, F5c (code, à venir) | `specs/F5-sejour-journee-fiche.md`, décision 0015 |

Au 2026-10-09, le code de F5 n'est pas commencé (F5a attend la décision 0015, fusionnée par #48). F7 s'appuie sur ce que F5 livre et n'y ajoute que ce qui lui est propre ; aucune PR de F7 ne démarre avant la fusion de F5c, pour éviter deux versions concurrentes de `TripShell`, de `DayLine` et de la Fiche (F7-PO-17).

## Périmètre
- Composant `ChangeSet` dans `src/components/ligne`.
- Écran 14 « Remplacer une étape » : `/voyages/[id]/jour/[n]/remplacer/[stopId]`, dans le panneau du voyage.
- Écran « Ajouter un lieu » : `/voyages/[id]/jour/[n]/ajouter`, dans le panneau du voyage, avec les paramètres facultatifs `de`, `a`, `repas` et `idee`.
- « Déplacer une étape » : feuille modale ouverte depuis la Fiche étape.
- Ajouts à la Fiche (« Déplacer »), à la Journée (« Ajouter un lieu », « Ajouter à ma journée » de « Surprends-moi », « Choisir » sur un repas pas encore choisi) et à `DayLine` (surlignage des étapes modifiées).
- Application locale des modifications, annulation 5 s, surlignage 2 s, événements `replace_applied`, `replace_undone`, `place_added`, `stop_moved`.
- Jeu simulé de révision (réserve, résultats de recherche, moments, points d'insertion), en proposition au Tech Lead pour la forme.

## Choix réservés au Tech Lead (signalés, non tranchés ici)
Propositions détaillées dans « Propositions au Tech Lead » ; le frontend les soumet dans sa PR et le Tech Lead les confirme à la revue ou par une décision dans `docs/decisions/`. Les critères d'acceptation ne dépendent pas de la forme retenue, sauf mention.
- Contrats de phase 0 de la révision et ajouts à `Change` (F7-TL-1).
- Actions de révision injectables et leur implémentation en mémoire (F7-TL-2).
- Forme et emplacement du jeu simulé de révision (F7-TL-3).
- Adresses et pages de développement (F7-TL-4).
- API de `ChangeSet` et de `DayBadge` en mode bouton (F7-TL-5).
- Mécanisme du surlignage et du toast partagé (F7-TL-6).
- Délai, abandon et horloge injectable de la demande de proposition (F7-TL-7).
- Schémas des nouveaux événements (F7-TL-8).
- Détection du hors-ligne (F7-TL-9).
- Emplacement et noms des fichiers ci-dessous.

## Fichiers à créer ou modifier (proposition)
- `src/components/ligne/ChangeSet.tsx` et son test ; `DayLine.tsx` (prop de surlignage, lien « Choisir » d'un `openMeal`) ; `DayBadge.tsx` (mode bouton, F7-TL-5) ; leurs tests.
- `src/features/sejour/revision.ts` (interface `RevisionActions`, implémentation en mémoire, fonctions pures : validation d'un brouillon, recherche simulée normalisée), `ReplaceScreen.tsx`, `AddPlaceScreen.tsx`, `MoveSheet.tsx`, `RevisionPreview.tsx` (aperçu commun : proposition, `ChangeSet`, « Ce qui ne bouge pas », bandeau de trajet, « Appliquer » / « Annuler »).
- `src/features/sejour/programme.ts` et `TripShell.tsx` (F5) : application d'un aperçu, annulation, surlignage, toast (F7-TL-2, F7-TL-6) ; `StopSheet.tsx` (bouton « Déplacer ») ; `SurpriseBlock.tsx` (« Ajouter à ma journée ») ; `JourneePanel.tsx` (« Ajouter un lieu ») ; `routes.ts` (F7-TL-4).
- `src/app/voyages/[id]/jour/[n]/remplacer/[stopId]/page.tsx`, `src/app/voyages/[id]/jour/[n]/ajouter/page.tsx` et leurs pendants sous `src/app/dev/voyages/…`.
- `src/contracts/revision.ts` (F7-TL-1) et `src/contracts/trip.ts` (`Change`) ; `src/mocks/edimbourg-revision.ts` (F7-TL-3) ; `src/adapters` (lecture du jeu simulé) ; tests de F1 mis à jour.
- `src/analytics/events.ts` : variantes `replace_applied`, `replace_undone`, `place_added`, `stop_moved` (F7-TL-8).
- `src/app/dev/composants` : section « Révision » (`ChangeSet` dans chacun de ses états, surlignage de `DayLine`, `DayBadge` en mode bouton).
- `.github/workflows/ci.yml` (job `docker`) : 404 sans `VADROUILLE_DEV_PAGES=1` pour `/dev/voyages/mock_trip_edimbourg/jour/2/remplacer/j2-dean-village` et `/dev/voyages/mock_trip_edimbourg/jour/2/ajouter`.
- `eslint.config.mjs` : `react/jsx-no-literals`, règle contre le stockage client et interdiction de la carte simulée étendues aux nouveaux fichiers.
- Textes dans `src/i18n/fr.json` sous `revision.*` ; `tests/e2e/revision.e2e.spec.ts`, `tests/e2e/revision.a11y.spec.ts`, `tests/visual/revision.visual.spec.ts` et leurs références.

## Comportement

### Règles communes aux trois modifications (F7-PO-1)
- **Aperçu obligatoire** (principe produit 5, cadrage § 3.2) : aucune modification n'est appliquée sans un aperçu qui montre « Ce qui change » et « Ce qui ne bouge pas » ; seul « Appliquer » écrit, seul « Annuler » ou « Retour » quitte sans rien changer.
- **Étapes verrouillées** : jamais remplacées, déplacées ni décalées par un remplacement, un ajout ou un déplacement (cadrage § 6.6, R3 du moteur). « Remplacer » et « Déplacer » ne sont pas proposés pour une étape verrouillée ; un aperçu qui modifierait une étape verrouillée (nom, heure ou jour) est refusé par l'implémentation et affiché comme une erreur (F7-PO-12).
- **Aucun trou** (principe produit 4) : un remplacement occupe le créneau de l'étape remplacée ; un ajout prend place dans un temps libre ou un repas pas encore choisi ; un déplacement libère un temps libre, rendu comme tel par `DayLine`. Aucune modification ne supprime une étape sans la remplacer.
- **Une modification à la fois** (handover § 7) : appliquer une nouvelle modification, ou poser un verrou, rend la précédente définitive et ferme son toast.
- **Après « Appliquer »** (handover § 6, critère 14, étendu à l'ajout et au déplacement) : retour à la Journée du jour où se trouve l'étape nouvelle ou déplacée, sans fiche ouverte (nouvelle entrée d'historique) ; les étapes modifiées (`changedStopIds`, F7-TL-1) sont surlignées 2 s ; le focus va sur le lien de l'étape nouvelle ou déplacée dans la `DayLine` ; `UndoToast` (5 s, focus non volé, délai suspendu au focus) avec « Modifié. » (remplacement, texte du handover), « Lieu ajouté. » ou « Étape déplacée. » (provisoires, UX/UI) et « Annuler ».
- **« Annuler » du toast** : rétablit l'état exact d'avant (égalité profonde de l'état du programme, F5-TL-6, opération `revert` de B0 PO-5) sans changer d'adresse ; annonce `role="status"` « Modification annulée. » (provisoire, UX/UI) ; le focus va sur le lien de l'étape d'origine si elle est dans le jour affiché (remplacement, déplacement dans le même jour), sinon sur le titre du jour (`tabindex="-1"`).
- **Surlignage** : 2 000 ms (handover § 7), porté par un attribut et un rendu visuel non porté par la seule couleur (rendu : UX/UI) ; sous `prefers-reduced-motion: reduce`, même durée, sans transition (fondu ou apparition directe).
- **Hors ligne** (handover § 13) : sur l'écran 14, « Ajouter un lieu » et la feuille « Déplacer », quand `navigator.onLine` vaut `false`, un `StatusBanner` `offline` dit « Tu es hors ligne. Modifier ton programme demande une connexion. » (provisoire, UX/UI) ; « Voir une proposition », « Rechercher », « Voir l'effet » et « Appliquer » sont désactivés (`aria-disabled="true"`, décrits par le bandeau) ; ils se réactivent au retour du réseau, sans rechargement. La règle couvre aussi le déplacement : en B11, il passe par `applyPatch` comme les deux autres (F7-PO-13).
- **Conflit** : si le programme a changé entre l'aperçu et « Appliquer » (version de base différente, F7-TL-2), rien n'est appliqué ; `StatusBanner` `conflict` « Ton programme a changé depuis cet aperçu. Rien n'a été modifié. » et « Voir un nouvel aperçu » (provisoires, UX/UI) (cadrage § 6.6, point 4 : refus explicite et proposition de rejouer).
- **Erreur** : une erreur de calcul ou de fournisseur affiche `StatusBanner` `error` « La proposition n'a pas pu être calculée. Ton programme est inchangé. » avec « Réessayer » (provisoire, UX/UI ; formulation de `redaction.md`). `cost_cap_reached` et `rate_limited` (B0, en revue) sont affichés comme cette erreur en attendant F7-Q2 (F7-PO-14).
- **Voyage non débloqué** : comme F5 (F5-PO-17), F7 offre les modifications sur ce que renvoie l'adaptateur, sans élément d'offre ni compteur ; ce qui est permis avant paiement et le plafond « jusqu'à [N] remplacements » (cadrage § 4) relèvent de Samuel (F7-Q2).

### Écran 14 — Remplacer une étape (`/voyages/[id]/jour/[n]/remplacer/[stopId]`)
**Accès et adresse** (F7-PO-2)
- Depuis « Remplacer » de la Fiche (F5-PO-10, lien déjà livré), nouvelle entrée d'historique. L'écran remplace le contenu du panneau, comme la fiche (F5-PO-8) ; la carte reste celle du jour, le marqueur de l'étape sélectionné ; le panneau passe à 55 % s'il était à 25 %.
- `stopId` absent des étapes `stop` du jour, événement de `Day.events`, terminus, `openMeal` : 404 (`notFound()`), comme un `n` invalide (F5).
- Étape verrouillée : l'écran n'affiche que son titre, « Cette étape est verrouillée. Retire le verrou depuis sa fiche pour la remplacer. » (provisoire, UX/UI) et le lien « Retour à la fiche » ; aucune raison ni action.
- Titre de niveau 1 « Remplacer {nom} » (`titre-fiche`), focus dessus à l'ouverture (`tabindex="-1"`) ; titre du document « Remplacer {nom} · Jour {n} » ; sous le titre, le moment « J{n} · {Day.title} · {start} – {end} ».
- « Retour » (`IconButton`, en haut à droite du contenu, comme « Fermer » de la fiche) et « Annuler » (voir plus bas) reviennent à la fiche de l'étape, focus sur le titre de la fiche : retour dans l'historique si l'écran a été ouvert depuis la fiche, sinon adresse remplacée par `…/jour/[n]?etape=[stopId]`.

**Raison et souhait** (cadrage § 6.6, point 1 ; handover § 6 critère 14 et § 10 ; F7-PO-3)
- Question « Pourquoi la remplacer ? » (niveau 2), un groupe de choix exclusif (`role="radiogroup"`, `SegmentedControl` ou `Chip` exclusives selon F7-TL-5) avec, dans cet ordre exact : « Pas mon style », « Trop chargé », « Trop cher », « Trop loin », « Autre raison ». Aucune raison n'est présélectionnée ; une raison est obligatoire.
- Champ « Ce que tu préfères (facultatif) » (`textarea`, 200 caractères au plus, compteur restant annoncé poliment), exemple en aide : « Par exemple : une dégustation, quelque chose à l'abri. » (provisoire, UX/UI). Le souhait n'est ni stocké côté client ni envoyé dans un événement de mesure.
- « Voir une proposition » (`Button` `primary`) : sans raison choisie, il reste actif et son activation affiche sous le groupe « Choisis une raison. » (`role="alert"`, lié au groupe par `aria-describedby`) et met le focus sur le groupe (pas de bouton désactivé sans explication).
- Changer la raison ou le souhait après une proposition retire la proposition affichée et réaffiche « Voir une proposition » : un aperçu correspond toujours à la raison et au souhait visibles.

**Attente** (handover § 6 critère 14 ; cadrage § 6.6, cibles ; F7-PO-4)
- Dès l'activation : la zone de proposition passe en `aria-busy="true"` avec un squelette (forme de la proposition, sans texte inventé), et une annonce `role="status"` « Recherche d'une proposition. » (provisoire, UX/UI).
- Après 5 000 ms sans réponse : le squelette reste, un message « On cherche autour de {nom de l'étape remplacée}. » (provisoire, UX/UI : le handover écrit « On cherche autour de … » sans dire ce qui suit) et le bouton « Arrêter » (`Button` `secondary`) apparaissent.
- « Arrêter » abandonne la demande (aucun aperçu ne s'affiche si la réponse arrive ensuite), rétablit la raison et le souhait saisis et met le focus sur « Voir une proposition ».
- Pas d'autre délai d'abandon automatique dans F7 : la cible avec mini-recherche est 45 s (cadrage § 6.6) ; le délai côté serveur relève de B11.

**Proposition et aperçu des effets** (cadrage § 3.1 écran 14, § 3.2, § 3.4 « Exemple de référence » ; F7-PO-5)
- Annonce `role="status"` « Proposition prête. » ; focus sur le nom de la proposition (niveau 2, `tabindex="-1"`).
- Bloc proposition : nom, moment « {start} – {end} », `meta`, une `Tag` par exception (dont « À réserver » : la réservation qui reste nécessaire est signalée, cadrage § 3.4), `ReasonBlock` si `reason` et `source` sont présents (comme la fiche, F5-PO-9).
- « Ce qui change » (niveau 3) : `ChangeSet` des changements de l'aperçu, dans l'ordre des données.
- « Ce qui ne bouge pas » (niveau 3) : les changements `unchanged`, une ligne « {heure} {nom} » par étape, avec ses `Tag` d'exception ; les données y listent toutes les étapes `stop` des jours touchés qui gardent leur lieu et leur heure, étapes verrouillées comprises (F7-PO-6). Le dîner de l'exemple de référence y figure avec son heure.
- Si le jour touché dépasse son budget de trajet après la modification, le bandeau de trajet de F5 (type `travel`, texte de F5-PO-6 calculé sur le brouillon) s'affiche au-dessus de « Ce qui change » (cadrage § 3.7 : un dépassement est signalé et expliqué).
- Actions : « Appliquer » (`Button` `primary`) et « Annuler » (`Button` `secondary`), vocabulaire du handover § 10. Pas de « Voir une autre proposition » dans F7 : une autre demande passe par un changement de raison ou de souhait (F7-PO-7, F7-Q2).
- **Aucune option compatible** (`no_option`) : `StatusBanner` `noOption` « Aucune option compatible pour ce créneau. Ton programme est inchangé. » (provisoire, UX/UI), focus sur le bandeau ; la raison et le souhait restent modifiables.

**Après « Appliquer »** : règles communes ; message « Modifié. » ; événement `replace_applied`. « Annuler » du toast : règles communes ; événement `replace_undone`.

### Ajouter un lieu (`/voyages/[id]/jour/[n]/ajouter`)
**Accès** (F7-PO-8)
- Lien « Idées » d'un temps libre (F5-PO-12, F5-TL-8) : `…/ajouter?de={from}&a={to}`.
- « Choisir » sur un repas pas encore choisi (`openMeal`, F5-PO-13) : lien `…/ajouter?de={time}&repas=lunch|dinner` (libellé provisoire, UX/UI ; nom accessible « Choisir le déjeuner » ou « Choisir le dîner »).
- « Ajouter un lieu » (`Button` `secondary` `sm`) sous la `DayLine` de la Journée, hors jour en préparation : `…/ajouter` sans paramètre.
- « Ajouter à ma journée » (`Button` `secondary` `sm`) dans l'idée dévoilée de « Surprends-moi » (F5-PO-5) : `…/ajouter?idee={SurpriseIdea.id}`.
- Paramètres invalides (heure hors `HH:MM`, `repas` inconnu, `idee` absente du jour) : ignorés, adresse remplacée sans eux, sans erreur. L'écran s'ouvre dans le panneau comme l'écran 14 ; titre de niveau 1 « Ajouter un lieu », focus dessus ; titre du document « Ajouter un lieu · Jour {n} » ; « Retour » et « Annuler » reviennent à la Journée, focus sur l'élément d'origine (lien « Idées », « Choisir », « Ajouter un lieu » ou « Ajouter à ma journée »).

**Recherche** (F7-PO-9)
- Champ « Lieu à ajouter » (`type="search"`, libellé visible) et bouton « Rechercher » (`Button` `primary`) ; Entrée lance la recherche. Pas de recherche à chaque frappe : une recherche réelle coûtera un appel par requête (cadrage § 4, coût unitaire ; F7-Q4).
- Moins de 2 caractères (espaces retirés) : « Écris au moins 2 lettres. » (`role="alert"`), aucune recherche.
- Résultats : liste (`<ul>`) de 5 au plus, un bouton par résultat avec le nom affiché du résultat et son secteur ; annonce `role="status"` « {n} résultats. » ; aucun résultat : « Aucun lieu trouvé. Essaie un autre nom. » (provisoire, UX/UI).
- Les résultats ne sont jamais posés sur la carte (règle d'or 3 : aucune donnée de lieu sur une carte non Google, et la carte simulée en est une) ; si un résultat vient de Google (`fromGoogle`, F7-TL-1), la mention « Données de lieux : Google » (`PlacesAttribution` de F4) est rendue sous la liste. Faux pour tout le jeu simulé.
- La requête vit en mémoire : ni dans l'adresse, ni dans un événement, ni dans un stockage.
- Avec `?idee=` : pas de recherche ; l'idée du jour est le lieu choisi (nom et `meta` de `SurpriseIdea`, contenu maison), l'écran passe directement au nom et au moment.

**Nom dans ton programme (Q49, partie Product Owner ; F7-PO-10)**
- Après le choix d'un résultat : champ obligatoire « Nom dans ton programme » (libellé visible, 1 à 80 caractères, espaces retirés aux extrémités), aide « C'est le nom qui apparaîtra dans ton programme. » (provisoire, UX/UI).
- Prérempli seulement avec un nom maison (`suggestedName`, nom trouvé par notre recherche web, F7-TL-1) ; **jamais avec le nom affiché du résultat** quand il vient de Google (`displayName`), ni par copie automatique : sans `suggestedName`, le champ est vide (handover back-end § 5, en revue : `Stop.name` n'est jamais écrit depuis le `displayName` Google). La personne peut le recopier elle-même : c'est alors sa saisie.
- Vide à la validation : « Donne un nom à ce lieu. » (`role="alert"`, lié au champ), focus sur le champ.
- Avec `?idee=` : prérempli avec `SurpriseIdea.name` (contenu maison, décision 0015 § 3), modifiable.

**Choix du moment** (handover § 6 « choix du moment » ; F7-PO-11)
- « Quel jour ? » : une `DayBadge` par jour du voyage, en mode bouton (`aria-pressed`, F7-TL-5) ; un jour sans moment possible pour ce lieu est désactivé avec la mention « complet » (DayBadge, état désactivé de F3). Présélection : le jour `n` s'il a un moment possible, sinon aucun.
- « Quel moment ? » : un choix exclusif (`role="radiogroup"`) parmi les moments possibles du jour choisi, fournis par les données (`moments` du résultat, F7-TL-1) : « Temps libre {from} – {to} » ou « Déjeuner pas encore choisi » / « Dîner pas encore choisi ». Présélection : le moment désigné par `de` et `a` (ou `de` et `repas`) s'il existe pour ce lieu, sinon aucun. On n'ajoute un lieu qu'à un moment libre : aucune étape existante n'est poussée hors du programme ; s'il n'y a plus de place, « Remplacer » reste le chemin (F7-PO-11).
- « Voir l'effet » (`Button` `primary`) : demande l'aperçu (nom saisi, lieu, moment) ; mêmes règles d'attente que l'écran 14, sans message « On cherche autour de » (la cible depuis des données déjà chargées est la même : moins de 5 s).
- Aperçu : la nouvelle étape (nom saisi, moment, `meta` calculée), « Ce qui change » (changement `added`, F7-TL-1, et effets sur les trajets), « Ce qui ne bouge pas », bandeau de trajet si dépassement, « Appliquer » / « Annuler » (comme l'écran 14).
- Après « Appliquer » : règles communes ; message « Lieu ajouté. » ; événement `place_added`. L'étape créée porte le `placeId` du résultat (seul élément Google stockable) et le nom saisi.

### Déplacer une étape (feuille sur 12 ou 13)
**Accès** (F7-PO-15)
- Bouton « Déplacer » (`Button` `secondary`) dans la Fiche, après « Remplacer » ; absent pour une étape verrouillée et pour un événement de `Day.events` (F5-PO-11). Ouvre une feuille modale (`Dialog`, décision 0013 § 3.5), titre « Déplacer {nom} » (niveau 2 dans la feuille, focus dessus), sans changer d'adresse ; Échap, « Annuler » ou « Fermer » la ferment sans rien changer, focus rendu à « Déplacer ».
- Le glisser d'une étape sur la `DayLine` n'est pas livré par F7 : le chemin par boutons est le seul, et il est complet (handover § 6 « toujours disponible sans glisser », § 11, WCAG 2.5.7). Le glisser est laissé à une tâche ultérieure, après maquette (F7-PO-16).

**Choix du jour et du point d'insertion** (handover § 6 « points d'insertion sur `DayLine` », critère « Déplacer »)
- « Vers quel jour ? » : une `DayBadge` par jour en mode bouton ; jour sans point d'insertion possible (`MoveOptions`, F7-TL-1) : désactivé avec « complet », y compris le jour d'origine quand l'étape n'y a pas d'autre place. Présélection : le jour d'origine s'il a un point, sinon aucun.
- Le jour choisi s'affiche en `DayLine` compacte (lecture seule, sans liens d'étape) avec, à chaque point d'insertion, un bouton « Placer ici » de 44 px de haut au moins, dont le nom accessible est « Placer ici, vers {heure} » (provisoire, UX/UI) ; l'étape déplacée n'y figure pas comme point.
- Choisir un point demande l'aperçu (règles d'attente de l'écran 14, sans « On cherche autour de ») et l'affiche dans la feuille : « Ce qui change » (changement `moved` « {nom} : J{a} {heure} → J{b} {heure} », effets sur les trajets), « Ce qui ne bouge pas », bandeau de trajet si dépassement, « Appliquer » / « Annuler ».
- Après « Appliquer » : la feuille se ferme ; règles communes (Journée du jour d'arrivée, surlignage, focus sur l'étape déplacée) ; message « Étape déplacée. » ; événement `stop_moved`.

### `ChangeSet` (handover § 5 ; F7-PO-5)
Liste (`<ul>`) d'une ligne par changement, rendue d'après le type, sans texte d'interface dans les données (handover § 9) :
- `replaced` : « {heure} {après} à la place de {avant} », l'ancien nom barré (`<del>`) et précédé pour les lecteurs d'écran de « avant : » (le barré ne porte jamais seul l'information) ;
- `added` (F7-TL-1) : « {heure} {nom} ajouté » (provisoire, UX/UI) ;
- `moved` : « {nom} : J{a} {heure} → J{b} {heure} » (même jour : « {nom} : {heure} → {heure} »), l'ancien moment barré avec « avant : » ;
- `segment` : « Trajet vers {nom} : {avant} → {après} » au format des durées de F3, « (estimation) » si `estimated` ;
- `budget` : « Budget du jour : environ +{n} CHF par personne » ou « environ −{n} CHF » (`Intl.NumberFormat("fr-CH")`) ; pas de ligne si `deltaPerPerson` vaut 0 ;
- `unchanged` : jamais dans « Ce qui change » ; rendu par l'aperçu dans « Ce qui ne bouge pas ».
Le composant ne connaît ni les adresses ni les actions ; textes dans `fr.json` sous `ligne.changeSet.*`.

### Ajouts à la Journée et à `DayLine`
- Surlignage des étapes dont l'identifiant est dans `changedStopIds` pendant 2 000 ms après « Appliquer » (règles communes) ; aucun surlignage après « Annuler ».
- `openMeal` : lien « Choisir » (Ajouter un lieu, ci-dessus).
- Bouton « Ajouter un lieu » sous la `DayLine` ; « Ajouter à ma journée » dans « Surprends-moi ».

## Jeu simulé de révision (proposition ; forme : F7-TL-3)
Phase 0 : aucun moteur ni réserve réelle. Les aperçus viennent de brouillons précalculés du jeu simulé, contenus entre crochets comme le reste du mock (règle d'or 2), avec des sources `https://example.org/mock/…`. Une demande sans brouillon simulé répond « aucune option compatible ». La raison et le souhait sont transmis et mesurés, mais ne changent pas la proposition simulée (aucune sélection en phase 0). Valeurs proposées, sur `mock_trip_edimbourg` et `mock_trip_edimbourg_debloque` :
- **Remplacer « [Dean Village] » (J2, 10:50 – 11:50)** : proposition « [Dégustation dans une épicerie fine de Stockbridge] », `activity`, 10:55 – 11:50, `meta` « [Stockbridge, 55 min, environ 15 CHF] », `reason` et `source`, exception `toReserve`, `fromReserve: true` ; trajets « À pied 20 min → 25 min » vers la proposition et « 15 min → 10 min » vers « [Café de Stockbridge] » ; budget du jour +15 ; « Ce qui ne bouge pas » : « [Royal Mile] » 09:15, « [Café de Stockbridge] » 12:05, « [Jardin botanique royal] » 13:25, « [Bonne table de New Town] » 19:00 (avec « À réserver ») ; `travelMinutes` inchangé (85).
- **Remplacer « [Royal Mile] » (J2)** : aucun brouillon, donc « aucune option compatible ».
- **Recherche** : « librairie » trouve « [Librairie ancienne, Stockbridge] » (`displayName`), secteur « [Stockbridge] », `suggestedName` « [Librairie ancienne de Stockbridge] », `placeId` simulé ; « galerie » trouve « [Galerie de Dundas Street] » sans `suggestedName`. Comparaison sans casse ni accents, sur le nom affiché. Moments des deux résultats : J1 16:00 – 18:30, J2 15:00 – 18:30, J4 15:30 – 18:45, J5 15:50 – 18:30 ; J3 et J6 sans moment (« complet »).
- **Ajouter « [Librairie ancienne de Stockbridge] » au J2, temps libre 15:00 – 18:30** : nouvelle étape 15:15 – 16:15 après 15 min à pied, temps libre 16:15 – 18:30, « [Bonne table de New Town] » inchangée à 19:00 ; `travelMinutes` 85 → 100 au-delà des 90 du jour, donc bandeau de trajet dans l'aperçu.
- **Déplacer « [Jardin botanique royal] » (J2, 13:25 – 15:00)** : points d'insertion J1 vers 16:15, J4 après « [Arthur's Seat] » vers 15:45, J5 vers 16:00 ; J2, J3 et J6 « complet ». Vers J4 : étape à 15:45 – 17:15, temps libre de J2 élargi à partir de la fin du déjeuner, dîners de J2 et J4 inchangés à 19:00.
- Les brouillons ne modifient jamais le Tattoo (verrouillé) ni une autre étape verrouillée (test du jeu simulé).

## Événements de mesure (handover § 12 ; F7-PO-18)
| Événement | Quand | Propriétés |
|---|---|---|
| `replace_applied` | « Appliquer » d'un remplacement, une fois l'application résolue | `reason` (`not_my_style`, `too_busy`, `too_expensive`, `too_far`, `other`, par `EVENT_REASON`), `from_reserve` (booléen de l'aperçu), `duration_ms` (entier ≥ 0 : temps entre « Voir une proposition » et l'affichage de la proposition appliquée) |
| `replace_undone` | « Annuler » du toast après un remplacement | les trois valeurs du `replace_applied` annulé |
| `place_added` | « Appliquer » d'un ajout | `method: "button"` |
| `stop_moved` | « Appliquer » d'un déplacement | `method: "button"` (`drag` réservé au glisser futur, F7-PO-16) |

Aucun événement pour « Arrêter », une recherche, l'annulation d'un ajout ou d'un déplacement (absents du § 12). Aucun nom, `placeId`, identifiant d'étape, requête de recherche ni souhait dans les propriétés : le schéma strict les refuse.

## Règles Google
- **Aucune donnée Google dans un prompt** : F7 n'appelle aucun modèle. La demande de remplacement (`ReplacementRequest`, F7-TL-1) ne porte que l'identifiant de l'étape, le code de raison, le souhait saisi par la personne et la version de base : ni nom, ni `placeId`, ni donnée de lieu. En B11, « Pas mon style » et le souhait appellent le modèle côté serveur (cadrage § 6.6) avec nos résumés et identifiants internes, jamais avec un contenu Google (ADR 09) : à vérifier par B11, rappelé ici.
- **Seul l'identifiant de lieu est stockable** : rien n'est stocké côté client (programme, raison, souhait, requête, résultats, aperçus et brouillons en mémoire) ; aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies. Une étape ajoutée garde le `placeId` du résultat et le nom saisi par la personne ; `displayName` n'est jamais recopié dans `Stop.name` (F7-PO-10). Paramètres d'adresse des écrans de F7 : `etape` (identifiant d'étape), `de` et `a` (heures), `repas` (`lunch` ou `dinner`), `idee` (identifiant interne d'idée), jamais un `placeId` ni un nom.
- **Données de lieux** : simulées en phase 0 (`fromGoogle` et `placesFromGoogle` faux) ; un résultat Google ne s'affiche qu'avec la mention « Données de lieux : Google » et jamais sur la carte simulée ni en marqueur.
- **Aucun appel Places, Routes, Directions ni Geocoding** : moments, points d'insertion et trajets viennent du jeu simulé. La source réelle de la recherche relève du Tech Lead puis de Samuel (F7-Q4).
- **Clés** : celles de F4 seulement, jamais en CI.

## Tests

### Unitaires (Vitest, Testing Library, axe)
- `ChangeSet` : chaque type de changement, « avant : » pour les lecteurs d'écran, budget nul masqué, formats.
- `revision.ts` : application et annulation (égalité profonde), refus d'un brouillon qui modifie une étape verrouillée, conflit de version, recherche normalisée (casse, accents, 2 caractères), « aucune option compatible » sans brouillon, validation du nom.
- Écran 14 avec des actions injectées et une horloge simulée : squelette, message et « Arrêter » à 5 000 ms, abandon, `noOption`, erreur, hors ligne.
- Ajouter un lieu et Déplacer avec des actions injectées : moments, jours « complet », points d'insertion, nom obligatoire, paramètres d'adresse invalides.
- Schémas des événements (propriétés refusées : nom, `placeId`, souhait).

### E2E, a11y et visuel (Playwright, 390 × 844, build de production, domaines Google bloqués)
Comme pour F5, les critères qui touchent la carte s'exécutent sur les pages `/dev/voyages/mock_trip_edimbourg…` (carte simulée) ; les autres sur `/voyages/…`. Ils s'exécutent sur `mock_trip_edimbourg` (`unlocked: false`) et ne préjugent pas de ce qu'un voyage non débloqué peut modifier (F7-Q2, Q63) : si Samuel le restreint, ils seront repris sur `mock_trip_edimbourg_debloque`.
- `tests/e2e/revision.e2e.spec.ts` ; `tests/e2e/revision.a11y.spec.ts` : axe sur l'écran 14 (raisons, attente, proposition, `noOption`, étape verrouillée), Ajouter un lieu (recherche, nom, moment, aperçu), feuille « Déplacer » (jours, points, aperçu), Journée avec surlignage et toast ; `tests/visual/revision.visual.spec.ts` : écran 14 avec proposition, Ajouter un lieu avec aperçu, feuille « Déplacer » avec points ; références régénérées selon la décision 0004.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
Une décision marquée « provisoire (UX/UI) » porte sur un rendu ou un texte non maquetté et peut être changée par UX/UI sans nouvelle décision du Product Owner (F7-Q1).
- **F7-PO-1 — Règles communes.** Aperçu obligatoire avant toute écriture ; étapes verrouillées intouchables ; aucun trou ; une modification à la fois ; après « Appliquer », Journée du jour d'arrivée, surlignage 2 s des étapes modifiées, focus sur l'étape nouvelle ou déplacée, `UndoToast` 5 s pour les trois modifications (le handover ne le nomme que pour le remplacement ; règle d'or 7 : « chaque modification est annulable 5 secondes ») ; « Annuler » rétablit l'état exact ; hors ligne, conflit et erreur explicites, programme inchangé.
- **F7-PO-2 — Écran 14 dans le panneau.** L'écran remplace le contenu du panneau, comme la fiche, carte du jour visible avec l'étape sélectionnée ; 404 pour une étape hors programme ; écran d'explication pour une étape verrouillée ; « Retour » et « Annuler » reviennent à la fiche.
- **F7-PO-3 — Raison obligatoire, souhait facultatif.** Les cinq raisons dans l'ordre du handover, aucune présélection ; souhait libre de 200 caractères au plus, jamais mesuré ni stocké côté client ; changer la raison ou le souhait invalide la proposition affichée.
- **F7-PO-4 — Attente.** Squelette immédiat, message « On cherche autour de {nom de l'étape} » et « Arrêter » à 5 s ; « Arrêter » ignore toute réponse tardive et garde la saisie ; aucun abandon automatique côté client.
- **F7-PO-5 — Aperçu et `ChangeSet`.** Proposition avec ses exceptions et sa justification sourcée ; « Ce qui change » puis « Ce qui ne bouge pas » ; bandeau de trajet calculé sur le brouillon en cas de dépassement ; formats de ligne de `ChangeSet` ci-dessus (provisoires, UX/UI).
- **F7-PO-6 — « Ce qui ne bouge pas ».** Toutes les étapes des jours touchés qui gardent lieu et heure, verrouillées comprises, avec leurs exceptions : c'est ce qui permet de vérifier « sans toucher au dîner » (handover § 14) et de voir une réservation qui reste à faire (cadrage § 3.4).
- **F7-PO-7 — Pas de « Voir une autre proposition ».** Une nouvelle demande passe par un changement de raison ou de souhait. Raison : chaque demande pourra coûter un appel de modèle ou une mini-recherche, et le plafond « [N] remplacements » n'est pas fixé (F7-Q2). À revoir après la réponse de Samuel.
- **F7-PO-8 — Entrées d'« Ajouter un lieu ».** Lien « Idées » d'un temps libre, « Choisir » d'un repas pas encore choisi, bouton « Ajouter un lieu » de la Journée, « Ajouter à ma journée » de « Surprends-moi » ; paramètres invalides ignorés sans erreur.
- **F7-PO-9 — Recherche à la demande.** Bouton « Rechercher » et Entrée, pas d'autocomplétion ; 2 caractères au moins ; 5 résultats au plus ; résultats jamais sur la carte ; requête jamais conservée.
- **F7-PO-10 — Nom d'un lieu ajouté (Q49, partie Product Owner).** Champ obligatoire « Nom dans ton programme », prérempli seulement par un nom maison (`suggestedName`, ou nom de l'idée « Surprends-moi »), jamais par le nom Google ; vide sinon. Le rendu et le texte d'aide restent à UX/UI (Q49, partie UX/UI) ; la règle juridique sous-jacente suit Q5.
- **F7-PO-11 — Ajout dans un moment libre seulement.** Moments possibles fournis par les données (temps libres et repas pas encore choisis où le lieu tient) ; jour sans moment : « complet » ; un ajout ne pousse aucune étape hors du programme. Pas de durée saisie : la durée vient de l'aperçu.
- **F7-PO-12 — Étape verrouillée.** Ni « Remplacer » ni « Déplacer » ; un aperçu qui toucherait une étape verrouillée est refusé et affiché comme une erreur, programme inchangé.
- **F7-PO-13 — Hors ligne.** Les trois modifications sont désactivées hors ligne avec un bandeau d'explication (handover § 13, étendu au déplacement qui passe aussi par `applyPatch`).
- **F7-PO-14 — Plafonds et limites.** `cost_cap_reached` et `rate_limited` s'affichent comme une erreur récupérable, sans compteur ni texte d'offre, en attendant F7-Q2.
- **F7-PO-15 — Déplacer depuis la Fiche.** Bouton « Déplacer » après « Remplacer », absent pour une étape verrouillée ou un événement ; feuille modale sans changement d'adresse ; jours sans point d'insertion « complet » ; points « Placer ici » sur la `DayLine` compacte du jour choisi ; après « Appliquer », Journée du jour d'arrivée.
- **F7-PO-16 — Pas de glisser dans F7.** Le déplacement par boutons est le chemin complet exigé par le handover (§ 6, § 11) ; le glisser sur la `DayLine` attend une maquette (cadrage § 3.1, « Reste à maquetter ») et une tâche propre ; `stop_moved.method` vaut `button` dans F7.
- **F7-PO-17 — Découpage proposé au CEO.** Trois PR successives, après la fusion de F5c : **F7a** `ChangeSet`, actions de révision, surlignage, toast partagé, écran 14, `replace_*` (critères [a]) ; **F7b** « Déplacer » (critères [b]) ; **F7c** « Ajouter un lieu », « Choisir », « Ajouter à ma journée » (critères [c]). Les critères transverses s'appliquent à chaque PR pour ce qu'elle livre. Le CEO peut les réunir.
- **F7-PO-18 — Mesure.** `duration_ms` mesure l'attente de la proposition appliquée ; `replace_undone` reprend les valeurs du `replace_applied` qu'il annule ; `method` vaut `button` ; aucun autre événement.
- **F7-PO-19 — Liste « À faire avant de partir ».** Rendu fonctionnel attendu quand le contrat le permettra (F7-Q5) : une étape remplacée ou retirée par une modification retire sa ligne de réservation non faite, une étape ajoutée avec « À réserver » ajoute la sienne, et l'aperçu le dit dans « Ce qui change ». En phase 0, F7 ne modifie pas la liste : le contrat ne relie pas une ligne à une étape.

## Propositions au Tech Lead (architecture et tests, à confirmer à la revue de la PR de code ou par une décision dans `docs/decisions/`)
- **F7-TL-1 — Contrats de phase 0 de la révision** (`src/contracts/revision.ts`, objets stricts, noms alignés sur le handover back-end en revue pour que B2 et B11 les étendent sans les renommer) :
  - `ReplacementRequest = { stopId, reason: PreferenceReason, wish?: string (≤ 200), baseVersion: number }` ;
  - `RevisionPreview = { id, kind: "replace" | "add" | "move", baseVersion, days: Day[] (brouillons des jours touchés), changes: Change[], changedStopIds: string[], proposal?: Stop, fromReserve?: boolean }` (`ReplacementPreview` du handover = `RevisionPreview` de `kind: "replace"`) ;
  - `PlaceSearchResult = { resultId, placeId?, displayName, area?, fromGoogle: boolean, suggestedName?, moments: AddMoment[] }`, avec `AddMoment = { day, kind: "free" | "openMeal", from, to, meal? }` ; `displayName` est un affichage en mémoire, jamais stocké (handover back-end § 5) ;
  - `MoveOptions = { stopId, days: { index, points: { id, time }[] }[] }`, un jour sans point valant « complet » ;
  - `Change` : nouvelle variante `{ type: "added"; time; label }` ; `moved` portant le jour (`before`/`after` = `{ day, time }` au lieu d'un texte, pour ne pas stocker de texte d'interface, handover § 9) ; `segment` portant le nom de l'étape d'arrivée (`label`) pour distinguer deux trajets ;
  - résultat d'une demande : union `{ ok: true, preview } | { ok: false, error: "noOption" | "conflict" | "lockedStop" | "error" }`.
- **F7-TL-2 — Actions de révision injectables.** Interface `RevisionActions` (`previewReplacement(request, { signal })`, `searchPlaces(query)`, `previewAdd(...)`, `getMoveOptions(stopId)`, `previewMove(stopId, pointId)`, `apply(previewId)`), toutes asynchrones comme `ProgrammeActions` (décision 0015 § 6), dont `undo()` est réutilisé. Phase 0 : implémentation en mémoire dans le navigateur, dans `TripShell`, alimentée par le jeu simulé lu côté serveur par l'adaptateur dans le layout. Elle compte une version locale (incrémentée à chaque application ou annulation, y compris un verrou), refuse un aperçu dont la version de base n'est plus courante (`conflict`) et un brouillon qui modifie une étape verrouillée (`lockedStop`) ; un brouillon simulé n'est servi que si les jours touchés n'ont pas changé depuis les données de l'adaptateur, sinon `noOption` (limite assumée de la phase 0, sans moteur). B11 la remplace par des Server Actions derrière `src/adapters` (`previewReplacement`, `searchPlaces`, `getMoveOptions`, `applyPatch` avec `replace`, `add`, `move`, `revert`).
- **F7-TL-3 — Jeu simulé.** `src/mocks/edimbourg-revision.ts`, lu seulement par `src/adapters` (règle de F1), validé par les schémas de F7-TL-1 dans les tests du mock ; méthode d'adaptateur `getRevisionFixtures(ctx, tripId)` réservée à l'adaptateur `mock`, ou autre forme au choix du Tech Lead.
- **F7-TL-4 — Adresses et pages de développement.** `tripRoutes` gagne `ajouter(n, { free?, meal?, idea? })` (heures écrites telles quelles, comme `getIdeasHref`) ; `remplacer(n, stopId)` existe déjà. Pages `/dev/voyages/[id]/jour/[n]/remplacer/[stopId]` et `/ajouter` sous la carte simulée, 404 sans `VADROUILLE_DEV_PAGES=1`, deux lignes ajoutées au job `docker`.
- **F7-TL-5 — Composants.** `ChangeSet` (`changes: Change[]`, noms déjà portés par les changements) dans `src/components/ligne`, sans adresse ni action ; `DayBadge` gagne un mode bouton (`onSelect`, `pressed`) pour les choix de jour, l'état désactivé « complet » restant celui de F3 ; choix de la raison par `SegmentedControl` (rôle `radiogroup` de F2) si ses cinq libellés tiennent à 390 px, sinon une liste de boutons radio stylés (rendu : UX/UI).
- **F7-TL-6 — Surlignage et toast partagé.** `TripShell` porte la dernière modification annulable (déjà prévue par `ProgrammeActions.undo`), les identifiants surlignés et leur échéance ; `DayLine` reçoit `highlightedStopIds` ; un seul `UndoToastRegion` monté dans `TripShell` sert le verrou de F5 et les trois modifications de F7, pour qu'une nouvelle action ferme la précédente.
- **F7-TL-7 — Attente et abandon.** Constante nommée `SLOW_PREVIEW_MS = 5000`, `AbortController` passé aux actions, horloge injectable (ou minuteurs simulés de Vitest) pour les tests ; aucun délai artificiel dans l'implémentation en mémoire hors tests.
- **F7-TL-8 — Événements.** Variantes strictes `replace_applied`, `replace_undone` (`reason: EventReasonSchema`, `from_reserve: boolean`, `duration_ms: int ≥ 0`), `place_added`, `stop_moved` (`method: "button" | "drag"`) dans `src/analytics/events.ts`, avec leurs tests.
- **F7-TL-9 — Hors ligne.** Petit crochet `useOnline()` (`navigator.onLine`, événements `online` et `offline`, rendu serveur considéré en ligne) dans `src/lib`, réutilisable par F10.

## Critères d'acceptation
Transverses :
- [ ] **C1** `pnpm verify` passe, sans clé ni Map ID.
- [ ] **C2** `…/remplacer/inconnue`, `…/remplacer/{id du concert de Day.events}`, `…/remplacer/{id}` sur un voyage d'une autre organisation, `…/jour/7/ajouter` : 404 (test `revision: 404 hors programme`).
- [ ] **C3** **Aucune persistance locale** : après le parcours complet (remplacement appliqué puis annulé, ajout appliqué, déplacement appliqué, recherche, souhait saisi), `localStorage` et `sessionStorage` sont vides, `indexedDB.databases()` et `caches.keys()` renvoient des listes vides, aucun cookie ; les seuls paramètres d'adresse rencontrés sont `etape`, `de`, `a`, `repas` et `idee`, jamais un `placeId` (valeurs `mock_place_…`), un nom, la requête ni le souhait (test `revision: aucune donnée persistée côté client`) ; la règle de lint contre le stockage client couvre les nouveaux fichiers.
- [ ] **C4** Aucune requête vers un domaine Google pendant les specs de F7 ; aucun fichier de `src/app/voyages` ni de `src/features` n'importe la carte simulée (règle de lint testée) ; les nouvelles pages `/dev/voyages/…` répondent 404 sans `VADROUILLE_DEV_PAGES=1` (test et job `docker`) ; aucun résultat de recherche n'apparaît en marqueur sur la carte simulée (test).
- [ ] **C5** Après « Appliquer » de l'ajout, l'étape créée a `name` égal au nom saisi et `placeId` égal à celui du résultat ; avec le résultat « [Galerie de Dundas Street] », le champ « Nom dans ton programme » est vide et son `value` n'est jamais égal à `displayName` sans saisie (test `ajouter: aucun nom Google recopié`).
- [ ] **C6** axe sans violation sur chaque écran et état listés dans « Tests » (`pnpm test:a11y`) ; chaque élément interactif mesure au moins 44 × 44 px ; contour de focus 2 px `line` décalé de 2 px ; un seul titre de niveau 1 par état (Playwright).
- [ ] **C7** Aucune couleur, taille ni valeur en `px` en dur hors `provisoire.css` ; tous les textes dans `fr.json` sous `revision.*` et `ligne.changeSet.*` ; aucun texte « Supprimer », « OK », « Valider », « Aperçu » ni « Vérifié » dans `fr.json` ni dans le rendu ; `react/jsx-no-literals` actif sur les nouveaux fichiers (lint et test).
- [ ] **C8** Événements : schémas stricts testés ; une propriété `name`, `placeId`, `wish` ou `query` ajoutée à l'un des quatre événements est refusée (test unitaire).
- [ ] **C9** Hors ligne (`context.setOffline(true)` après le chargement de l'écran 14, puis d'« Ajouter un lieu », puis feuille « Déplacer » ouverte) : `StatusBanner` `offline` présent, « Voir une proposition », « Rechercher », « Voir l'effet » et « Appliquer » en `aria-disabled="true"` ; de retour en ligne, réactivés sans rechargement (test `revision: hors ligne`).
- [ ] **C10** `/dev/composants` montre `ChangeSet` (chaque type, budget positif et négatif), `DayLine` avec une étape surlignée, `DayBadge` en mode bouton (choisi, non choisi, « complet ») ; captures comparées aux références (`pnpm test:visual`) ; la PR joint les captures 390 × 844, liste les rendus provisoires (F7-Q1), les choix soumis au Tech Lead (F7-TL-1 à F7-TL-9) et les ajouts au jeu simulé.

Remplacer (écran 14) [a] :
- [ ] **C11** Depuis la fiche de « [Dean Village] » (J2), « Remplacer » mène à `/voyages/mock_trip_edimbourg/jour/2/remplacer/j2-dean-village` ; titre de niveau 1 « Remplacer [Dean Village] » avec le focus ; moment « J2 · Dimanche 30 août · 10:50 – 11:50 » ; titre du document « Remplacer [Dean Village] · Jour 2 » ; marqueur de l'étape sélectionné (`aria-current="true"`) sur la carte simulée (test `remplacer: ouverture`).
- [ ] **C12** Le groupe de raisons a `role="radiogroup"` et ses options sont exactement, dans l'ordre : « Pas mon style », « Trop chargé », « Trop cher », « Trop loin », « Autre raison », aucune cochée ; « Voir une proposition » sans raison affiche « Choisis une raison. » (`role="alert"`) et met le focus sur le groupe ; le souhait refuse le 201e caractère (test `remplacer: raisons`).
- [ ] **C13** Avec des actions injectées dont la réponse ne vient pas (minuteurs simulés) : `aria-busy="true"` et squelette dès l'activation ; à 4 999 ms, ni message ni « Arrêter » ; à 5 000 ms, « On cherche autour de [Dean Village]. » et « Arrêter » ; « Arrêter » appelle l'abandon (`signal.aborted`), une réponse résolue ensuite n'affiche rien, la raison et le souhait sont conservés, le focus est sur « Voir une proposition » (test unitaire `remplacer: attente et arrêt`).
- [ ] **C14** **Scénario du handover § 14 « remplacer Dean Village sans toucher au dîner »** : raison « Pas mon style », souhait « une dégustation », « Voir une proposition » : proposition « [Dégustation dans une épicerie fine de Stockbridge] » avec le focus sur son nom, « 10:55 – 11:50 », `Tag` « À réserver », `ReasonBlock` ; « Ce qui change » contient « [Dégustation dans une épicerie fine de Stockbridge] à la place de [Dean Village] » avec « [Dean Village] » dans un `<del>`, deux lignes de trajet et « Budget du jour : environ +15 CHF par personne » ; « Ce qui ne bouge pas » contient « 19:00 [Bonne table de New Town] » avec « À réserver » et ne contient pas « [Dean Village] » ; « Appliquer » : adresse `/voyages/mock_trip_edimbourg/jour/2`, `DayLine` avec la proposition à 10:55 à la place de « [Dean Village] », « [Bonne table de New Town] » toujours à 19:00, focus sur le lien de la proposition, surlignage présent puis absent à 2 000 ms, `UndoToast` « Modifié. » `role="status"` sans déplacer le focus ; un `replace_applied` avec `reason: "not_my_style"`, `from_reserve: true` et `duration_ms` entier ≥ 0, sans autre propriété (test `remplacer: dean village sans toucher au dîner`).
- [ ] **C15** « Annuler » du toast dans les 5 s : état du programme égal (égalité profonde) à celui d'avant « Appliquer », « [Dean Village] » de retour à 10:50, annonce « Modification annulée. », focus sur le lien « [Dean Village] », un `replace_undone` avec les valeurs du `replace_applied` ; sans « Annuler », le toast disparaît à 5 000 ms et la modification reste (horloge simulée) (test `remplacer: annuler`).
- [ ] **C16** « Annuler » de l'aperçu, puis « Retour » : retour à la fiche de « [Dean Village] » (focus sur son titre), programme inchangé, aucun événement ; changer de raison après la proposition retire la proposition et réaffiche « Voir une proposition » (test `remplacer: annuler sans appliquer`).
- [ ] **C17** « [Royal Mile] » : `StatusBanner` `noOption` « Aucune option compatible pour ce créneau. Ton programme est inchangé. » avec le focus, raisons toujours modifiables ; actions injectées en erreur : bandeau `error` et « Réessayer » ; en conflit : bandeau `conflict`, rien d'appliqué ; brouillon de test qui modifie le Tattoo : erreur, programme inchangé (tests `remplacer: aucune option`, unitaires `revision: conflit`, `revision: étape verrouillée intouchable`).
- [ ] **C18** Étape verrouillée (Tattoo, J1) : `…/jour/1/remplacer/j1-tattoo` affiche « Cette étape est verrouillée. Retire le verrou depuis sa fiche pour la remplacer. » et « Retour à la fiche », sans groupe de raisons ni « Voir une proposition » ; « Retour à la fiche » mène à `…/jour/1?etape=j1-tattoo` (test `remplacer: étape verrouillée`).

Déplacer [b] :
- [ ] **C19** La fiche de « [Jardin botanique royal] » (J2) montre « Déplacer » après « Remplacer » ; celle du Tattoo et celle du concert (`Day.events`) ne le montrent pas (test).
- [ ] **C20** « Déplacer » ouvre une feuille modale (`role="dialog"`, `aria-modal="true"`) titrée « Déplacer [Jardin botanique royal] » avec le focus sur son titre, adresse inchangée ; les pastilles J2, J3 et J6 sont désactivées avec « complet », J1, J4 et J5 actives, aucune choisie ; Tab reste dans la feuille ; Échap la ferme, programme inchangé, focus sur « Déplacer » (test `déplacer: jours complets`).
- [ ] **C21** J4 choisie (`aria-pressed="true"`) : `DayLine` compacte de J4 avec un bouton « Placer ici, vers 15:45 » d'au moins 44 px de haut ; l'activer affiche l'aperçu avec « [Jardin botanique royal] : J2 13:25 → J4 15:45 » (« J2 13:25 » barré, « avant : » lu) et « Ce qui ne bouge pas » avec les dîners ; aucune étape n'a été déplacée par glisser : tout le parcours se fait au clavier (test `déplacer: sans glisser`).
- [ ] **C22** « Appliquer » : feuille fermée, adresse `/voyages/mock_trip_edimbourg/jour/4`, « [Jardin botanique royal] » à 15:45 dans la `DayLine` de J4 avec le focus et le surlignage, J2 ne le contient plus et garde « [Bonne table de New Town] » à 19:00 ; `UndoToast` « Étape déplacée. » ; un `stop_moved` `{ method: "button" }` ; « Annuler » du toast : programme d'avant (égalité profonde), focus sur le titre de J4 (test `déplacer: appliquer et annuler`).

Ajouter un lieu [c] :
- [ ] **C23** Le lien « Idées » du temps libre de J2 mène à `/voyages/mock_trip_edimbourg/jour/2/ajouter?de=15:00&a=18:30` ; titre de niveau 1 « Ajouter un lieu » avec le focus ; titre du document « Ajouter un lieu · Jour 2 » ; « Retour » rend le focus au lien « Idées » ; `?de=25:00` est retiré de l'adresse sans erreur (test `ajouter: ouverture`).
- [ ] **C24** « l » puis « Rechercher » : « Écris au moins 2 lettres. », aucune recherche (actions injectées non appelées) ; « Librairie » : un résultat « [Librairie ancienne, Stockbridge] » avec « [Stockbridge] », annonce « 1 résultat. » ; « zzz » : « Aucun lieu trouvé. Essaie un autre nom. » ; aucune recherche n'est lancée à la frappe (test `ajouter: recherche`).
- [ ] **C25** Choisir « [Librairie ancienne, Stockbridge] » : « Nom dans ton programme » prérempli « [Librairie ancienne de Stockbridge] » ; J3 et J6 « complet » ; J2 choisie et « Temps libre 15:00 – 18:30 » coché d'après l'adresse ; vider le nom puis « Voir l'effet » : « Donne un nom à ce lieu. » et focus sur le champ (test `ajouter: nom et moment`).
- [ ] **C26** « Voir l'effet » : aperçu avec « 15:15 [Librairie ancienne de Stockbridge] ajouté », bandeau de trajet « 1 h 40 de trajet ce jour, au-delà des 1 h 30 prévues pour ton rythme. », « 19:00 [Bonne table de New Town] » dans « Ce qui ne bouge pas » ; « Appliquer » : `/voyages/mock_trip_edimbourg/jour/2`, nouvelle étape à 15:15 avec le focus et le surlignage, temps libre « 16:15 – 18:30 », bandeau de trajet de J2 désormais affiché, `UndoToast` « Lieu ajouté. », un `place_added` `{ method: "button" }` ; « Annuler » : programme d'avant, focus sur le titre de J2 (test `ajouter: appliquer et annuler`).
- [ ] **C27** « Surprends-moi » de J2 : l'idée dévoilée a « Ajouter à ma journée », qui mène à `…/jour/2/ajouter?idee={id}` avec le nom prérempli par le nom de l'idée et sans champ de recherche ; un jour de test avec un `openMeal` dîner rend le lien « Choisir » (nom accessible « Choisir le dîner ») vers `…/ajouter?de={heure}&repas=dinner`, et le moment « Dîner pas encore choisi » y est présélectionné si le résultat le propose (tests unitaires et e2e).

## Hors périmètre
- Glisser une étape sur la `DayLine` (F7-PO-16) ; « Voir une autre proposition » (F7-PO-7) ; ajout d'un événement de « Pendant ton séjour » au programme ; demande libre (« journée plus calme », après le MVP, cadrage § 3.5).
- « Garder » sur la fiche (Q67, Samuel) ; déverrouillage d'un engagement (Q71).
- Modification de la liste « À faire avant de partir » par une révision (F7-PO-19, F7-Q5).
- Question de préférence déclenchée par les raisons de remplacement (F7-Q3) ; plafond « [N] remplacements » et tout élément d'offre (F7-Q2).
- Moteur, réserve réelle, mini-recherche, recherche de lieux réelle, `applyPatch`, versions et conflits serveur : B11 et adaptateur `api`.
- Mise à jour de la carte par l'aperçu (la carte montre le programme appliqué, pas le brouillon) ; grand écran (F12) ; hors-ligne PWA complet (F10) ; thème sombre.
- Écran 10 « Programme ajusté » : F9.

## Questions ouvertes
Nouvelles questions de cette spécification (numéros définitifs attribués par le CEO dans `QUESTIONS.md`) :
- **F7-Q1 (UX/UI)** : rendus et textes non maquettés : mise en page de l'écran 14 (maquetté, mais PNG absent, Q12), « Ajouter un lieu » et « Déplacer » (non maquettés), `ChangeSet`, surlignage de 2 s, choix de la raison, `DayBadge` en mode bouton, points « Placer ici », mention « complet » du jour d'origine, textes provisoires de F7-PO-1 à F7-PO-15, et partie UX/UI de Q49 (champ « Nom dans ton programme »). Bloque : validation visuelle de F7, pas le code.
- **F7-Q2 (Samuel)** : offre « ajustements jusqu'à [N] remplacements » (cadrage § 4) : valeur de N ; ajouts, déplacements et annulations comptent-ils ; que voit la personne au-delà (et le cas `cost_cap_reached`) ; un voyage non débloqué peut-il remplacer, ajouter ou déplacer (lié à Q63) ; faut-il « Voir une autre proposition » (F7-PO-7) ? Touche l'offre et l'argent. Bloque : l'affichage du plafond et des limites, et la reprise des critères sur le voyage débloqué ; pas le code de F7.
- **F7-Q3 (Samuel)** : les raisons de remplacement comptent-elles dans la règle « deux refus dans une catégorie déclenchent une question », et deux remplacements « Trop loin » déclenchent-ils la question « On reste plus près de ton hôtel ? » (cadrage § 3.3, § 3.7 « Apprentissage ») ? Touche le principe d'apprentissage. Bloque : le comportement de B10 et B11 ; pas F7, qui ne pose aucune question de préférence.
- **F7-Q4 (Tech Lead, puis Samuel pour la partie Google)** : source réelle de la recherche « Ajouter un lieu » (Text Search, Autocomplete de Google Places, ou notre recherche web), coût par requête, et conditions d'affichage du `displayName` avec attribution (Q5, juridique ; cadrage § 6.5 sur l'EEE). Bloque : la recherche réelle de B11 ; pas F7 sur données simulées.
- **F7-Q5 (Tech Lead)** : relier une ligne de `ChecklistItem` à son étape dans le contrat (comme `checklist_items.étape` du cadrage § 6.8), pour appliquer F7-PO-19. Bloque : F7-PO-19 ; rien dans F7.
- **F7-Q6 (Tech Lead)** : propositions F7-TL-1 à F7-TL-9 (contrats de révision et variantes de `Change`, `RevisionActions` en mémoire, jeu simulé, adresses et pages `/dev`, `ChangeSet` et `DayBadge` en mode bouton, surlignage et toast partagé, attente et abandon, événements, `useOnline`). Bloque : le démarrage du code si le Tech Lead veut trancher avant ; sinon confirmées à la revue.
- **F7-Q7 (CEO)** : découpage F7a, F7b, F7c (F7-PO-17) et place après F5c dans l'ordre des tâches, en tenant compte de F8 (fichiers partagés : `src/contracts`, `src/adapters`, `fr.json`). Bloque : création des tickets de code.

Questions existantes qui touchent F7 :
- Q49 : partie Product Owner tranchée ici (F7-PO-10) ; partie UX/UI incluse dans F7-Q1.
- Q5 et Q14 : origine et conservation des données de lieux ; F7 n'affiche que des données simulées et ne stocke que `placeId`.
- Q63 et Q67 : contenu d'un voyage non débloqué et « Garder » ; F7 n'en préjuge pas.
- Q71 : déverrouillage d'un engagement ; F7 traite toute étape verrouillée comme intouchable.
- Q12 et Q59 : maquettes et Dossier UX absents.
- Q8 : budgets de trajet lus dans les données, jamais en dur (bandeau de l'aperçu).
