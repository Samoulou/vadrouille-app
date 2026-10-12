# F13 — Photos des propositions

Rédaction : rôle **product-owner** (`.claude/agents/product-owner.md`, modèle `specs/F0-socle.md`) · Ticket : #158 · Demande de Samuel (projet Claude « Vadrouille », 2026-10-12 10:51 CEST) : « il faut qu'on trouve un moyen d'afficher les preview des photos pour les propositions ».

Rôles d'exécution : frontend (F13a), backend ou frontend selon le CEO (F13b) · Prérequis : F6 dans `main` (fait) ; **pour F13a, la décision du Tech Lead sur F13-TL-1, F13-TL-3 et F13-TL-4, écrite dans `docs/decisions/` avant le code** ; pour F13b, en plus, F13-TL-2, P0b1, la fusion de #149 (spec P0, décisions 0026 et 0027) et les réponses de Samuel à F13-Q3 et F13-Q4 · Référence : `docs/produit/cadrage-v5.md` (§ 3.3, § 6.5, § 9), `docs/handovers/frontend.md` (§ 8 « Conformité » et « Stockage », § 11, § 17 point 5), `specs/F4-carte.md` (F4-PO-9, `PlacesAttribution`), `specs/F6-presentation.md` (« Carte (`DeckCard`) », « Règles Google », « Événements de mesure », F6-PO-11, F6-Q2), `specs/P0-prototype-recherche.md` (#149 : P0b, « Aucun cache », quotas), décisions 0002, 0010 (principes 4 et 7 : `Proposal.photoUrl` chargé à la demande, suit Q6), 0027 (règle provisoire de Q5, plafonds ; jointe à #149), `QUESTIONS.md` (Q5, Q6, Q14, Q252).

## Objectif
Montrer en haut de chaque carte de la présentation (`DeckCard`, écrans 6, 6b et 8) une photo **du lieu proposé**, pour que le voyageur décide « J'aime / Pas pour moi » en voyant l'endroit, sans enfreindre la règle provisoire de Q5 (décision 0027 : aucune donnée Google dans un prompt, seul l'identifiant de lieu stocké) ni dépasser les plafonds fixés par Samuel (20 USD par mois sur Google, 100 requêtes par jour et par API). La décision 0027 et les quotas viennent de #149, non fusionnée : les chiffres de cette spécification en dépendent.

Aujourd'hui, la carte affiche toujours le bloc `muted` « Photo du lieu » et ignore `photoUrl` (F6, Q6).

## Ce qui est à Samuel et ce qui ne l'est pas
- **La source des photos est à Samuel** (Q6). **Il a choisi l'option A** (rubrique suivante).
- Restent à Samuel les **lectures juridiques** des conditions de Google (F13-Q3) et l'envoi de l'adresse IP du voyageur hors UE (F13-Q4) : cette spécification les pose, sans les trancher.
- Les détails d'affichage (cadrage, chargement, repli, place de l'attribution) sont décidés ici par le Product Owner (rubrique « Décisions »), sous réserve de F13-Q3.
- L'architecture (contrat, route, en-têtes de cache) et le remplacement d'un test relèvent du Tech Lead : ce sont des **propositions** (rubrique « Propositions au Tech Lead »), sans avis rendu à ce jour.

## Choix de Samuel (Q6, 2026-10-12 11:05 CEST)
**Option A retenue** : photos Google relues à l'affichage, jamais stockées, avec D (bloc « Photo du lieu ») en repli. Message de Samuel dans le projet Claude « Vadrouille », fil « Photos des propositions » : « go pour A photo google ». Les options B et C ne sont donc pas spécifiées ; le tableau ci-dessous reste comme trace de la comparaison.

## Options comparées (avant le choix)
Hypothèses de calcul : une présentation = 8 cartes (aperçu, D11) ; une photo par carte ; tarifs relevés le 2026-10-12 (sources en fin de rubrique) : Place Details Essentials (IDs Only), qui suffit pour le champ `photos`, gratuit et sans limite ; Place Photos, 1 000 gratuites par mois puis 7 USD pour 1 000.

| | A. Photos Google à l'affichage | B. Wikimedia Commons | C. Banque d'images (Unsplash, Pexels) | D. Pas de photo |
|---|---|---|---|---|
| Ce qu'on voit | une vraie photo du lieu | une vraie photo du lieu, quand elle existe | une image d'ambiance, **pas le lieu** | le bloc « Photo du lieu » actuel |
| Couverture | quasi tous les lieux ancrés, restaurants et bars compris | bonne pour les monuments, faible pour les restaurants, bars, cafés | totale, mais générique | — |
| Ce qui est stocké | rien d'autre que le `placeId` : le nom de photo et l'URL sont relus à chaque affichage (Google interdit de garder le nom de photo, source 1) | un identifiant Wikidata, sans vérification déterministe décrite (aurait demandé un ancrage propre) | identifiant d'image | rien |
| Règle provisoire de Q5 | rien de Google stocké ni dans un prompt ; l'affichage hors carte Google est une **lecture juridique** (F13-Q3) | hors Google | hors Google | non concernée |
| Droits et attribution | texte « Google Maps » et auteur de la photo quand Google le fournit (source 2) ; cohabitation avec la mention du handover § 8 : F13-Q3 | licence par image (souvent CC BY-SA) | photographe et plateforme | aucune |
| Coût par présentation | 8 Place Details (IDs Only, gratuites) + 8 Place Photos | 0 | 0 | 0 |
| Dans 20 USD par mois | 1 000 photos gratuites + environ 2 850 payées, soit **environ 480 présentations par mois** | — | — | — |
| Dans 100 requêtes par jour et par API | **environ 12 présentations par jour** si le quota est compté par méthode (lecture de P0) ; **environ 6** s'il est compté pour l'API Places entière ; presque aucune, voire aucune, les jours d'exécution de P0a (90 Place Details) | sans quota Google | Unsplash démo : 50 requêtes par heure | — |
| Compte ou clé nouveaux | aucun (clé serveur existante) | aucun | un compte et une clé | aucun |
| Données personnelles hors UE | l'adresse IP du voyageur part chez Google si le navigateur charge l'image (F13-Q4) | l'adresse IP part chez Wikimedia (États-Unis) | idem chez la plateforme | aucune |
| Principe produit 2 (fiabilité) | respecté | dépend de la vérification de l'identifiant | **contraire** | respecté |

Option écartée d'office : reprendre l'image du site source (balise `og:image`) : droits d'auteur du site, aucune licence.

Sources consultées le 2026-10-12 (lecture à confirmer par Samuel pour tout ce qui est juridique, F13-Q3) :
1. Place Photos (New) : <https://developers.google.com/maps/documentation/places/web-service/place-photos> (« You cannot cache a photo name » ; `authorAttributions` à afficher quand il est présent ; `skipHttpRedirect`).
2. Règles d'affichage de Places : <https://developers.google.com/maps/documentation/places/web-service/policies> (données de Places sans carte : logo ou texte « Google Maps », ni traduit ni coupé ; photos : auteur crédité, attribution admise sur la vue agrandie d'une vignette ; lien vers Google Maps).
3. Champs et offres de Place Details : <https://developers.google.com/maps/documentation/places/web-service/data-fields> (`photos` dans Place Details Essentials (IDs Only)).
4. Grille tarifaire : <https://developers.google.com/maps/billing-and-pricing/pricing> (Place Details Essentials (IDs Only) : sans limite, sans prix ; Places API Place Details Photos : 1 000 par mois gratuites, 7 USD pour 1 000 ensuite).

## Découpage
| Tâche | Contenu | Rôle | Attend |
|---|---|---|---|
| **F13a** | Contrat et adaptateur `mock` (F13-TL-1, F13-TL-3), `DeckCard` et feuille de détail avec photo, chargement, repli et attribution ; photos **simulées** pour 3 propositions du jeu simulé ; événement `deck_photo_shown` | frontend | décision du Tech Lead sur F13-TL-1, F13-TL-3, F13-TL-4 |
| **F13b** | Option A : relecture Google côté serveur (F13-TL-2), branchée dans l'adaptateur `prototype` de P0b ; mention « Données de lieux : Google » | backend ou frontend (CEO) ; revue Sécurité | F13a, F13-TL-2, P0b1, fusion de #149, F13-Q3 et F13-Q4 |

### Fichiers touchés par F13a (proposition, selon la décision du Tech Lead)
- `src/contracts/trip.ts` (retrait de `photoUrl`, nouveau `PlacePhotoSchema`), `ProposalRecordSchema` et le test `contrats: chaque champ a une seule catégorie` ;
- `src/adapters/types.ts` (`getPlacePhoto`), `src/adapters/mock.ts`, `public/mock-photos/` ;
- `src/components/ligne/DeckCard.tsx` et ses tests, la feuille de détail de F6, `src/i18n/fr.json`, `src/analytics/events.ts` ;
- documents à aligner dans la même PR : décision 0010 (principes 4 et 7), `docs/handovers/backend.md` § 5 (tableau des champs), `docs/handovers/frontend.md` (L387 `photoUrl`, § 17 point 5), `specs/F1-contrats-donnees-simulees.md` (L26, L49 : la règle « aucune clé `photos` » reste vraie), `specs/F6-presentation.md` (L77, L137, L165, L183 : renvoi à F13) et son tableau d'événements.

## Comportement (F13a et F13b)
- **Emplacement** : le bloc photo de `DeckCard` (220 px de haut, F6-Q2), pleine largeur de la carte, coins du haut de la carte. Rien ne change ailleurs sur la carte.
- **Cadrage** : l'image remplit le bloc (`object-fit: cover`), centrée ; aucune déformation.
- **Chargement** : tant que l'image n'est pas chargée, le bloc `muted` « Photo du lieu » reste visible ; l'image apparaît en fondu (150 ms ; immédiat avec `prefers-reduced-motion: reduce`). Hauteur fixe : la mise en page ne bouge pas.
- **Repli** : pas de photo, erreur de chargement, quota atteint, hors-ligne : le bloc « Photo du lieu » reste, sans message d'erreur.
- **Préchargement** : seules la carte en cours et la suivante demandent leur photo (pas les 8 d'un coup), pour ménager le quota.
- **Attribution sur la carte** : un **bandeau uni** de 24 px en bas du bloc photo, fond et texte pris dans une paire de tokens Ligne (proposition : texte `raised` sur fond `ink`, à confirmer par UX/UI), texte `text-legende` (13 px), une ligne, auteur tronqué par une ellipse. Le texte est **composé par l'interface depuis `fr.json`** à partir des données structurées de l'adaptateur (aucun texte d'interface dans les données, handover § 9) : « Google Maps · Photo : {auteur} » pour une photo Google (« Google Maps » seul si Google ne fournit pas d'auteur), « Photo simulée » pour une photo simulée. « Google Maps » n'est ni traduit (`translate="no"`) ni coupé.
- **Mention du handover § 8** : sur l'écran de présentation, dès qu'une photo Google est affichée, le composant `PlacesAttribution` de F4 rend « Données de lieux : Google » sous le paquet (F4-PO-9). Jamais sur une photo simulée. Si Samuel juge l'une des deux mentions inutile ou insuffisante, F13-Q3 l'ajuste.
- **Feuille de détail** (F6-PO-12) : la même photo en tête, plus grande, avec l'auteur en lien et un lien « Voir sur Google Maps » (`rel="noopener noreferrer"`, nouvel onglet). Le lien n'est pas sur la carte, qui est entièrement un bouton.
- **Accessibilité** : l'image est décorative pour le lecteur d'écran (`alt=""`) : le nom du lieu est déjà annoncé par la carte ; le texte du bandeau est dans la description accessible de la carte.
- **Gestes** : l'image ne capte pas le glisser (`draggable="false"`, `pointer-events: none`) ; tous les gestes de F6 restent identiques.
- **Image** : balise `<img>` simple, ou `next/image` avec `unoptimized`, pour toute photo réelle : l'optimiseur d'images de Next.js ou de Vercel garderait les photos en cache côté serveur et CDN.
- **Stockage** : aucune écriture côté client (règles Google de F6 inchangées) ; l'URL de photo n'est jamais mise dans l'adresse, un événement de mesure ou un journal.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
- **F13-PO-1** : photo sur `DeckCard` et dans la feuille de détail seulement ; la Journée, le Séjour et la Fiche étape gardent leur affichage actuel (photos ailleurs : tâche à part si Samuel le demande).
- **F13-PO-2** : repli silencieux sur le bloc « Photo du lieu » (une photo absente n'est pas une incertitude sur le lieu, donc pas de badge, principe produit 4).
- **F13-PO-3** : une seule photo par lieu, la première fournie par la source ; pas de galerie.
- **F13-PO-4** : préchargement limité à la carte en cours et à la suivante.
- **F13-PO-5** : attribution courte sur la carte, complète avec liens dans la feuille de détail ; mention « Données de lieux : Google » sous le paquet (sous réserve de F13-Q3).
- **F13-PO-6** : nouvel événement de mesure `deck_photo_shown` (`position`, `has_photo: true | false`), sans nom de lieu, `placeId` ni URL ; il sert à mesurer si la photo change le taux de « Pas pour moi » (G0, G1). **Instant** : quand la carte devient la carte en cours et que l'état de sa photo est connu (image chargée, échec, absence) ou au plus tard 3 s après ; `has_photo` vaut `true` seulement si l'image s'est affichée. **Unicité** : une fois par proposition et par session de tri ; « Annuler » qui réaffiche une carte ne le réémet pas. Ajouté au tableau des événements de F6 et au schéma strict de `src/analytics`.
- **F13-PO-7** : F13a remplace, pour le comportement visible, la règle de F6 « `photoUrl` ignorée, toujours le bloc « Photo du lieu » ». Le remplacement du test F6 `DeckCard: aucune photo affichée` est une décision du Tech Lead (F13-TL-4).

## Propositions au Tech Lead (architecture et tests, à trancher dans `docs/decisions/`)
Aucun avis du Tech Lead n'est rendu à ce jour ; les points suivants sont des propositions.
- **F13-TL-1 — Contrat.** Retirer `Proposal.photoUrl` de `ProposalSchema` (`src/contracts/trip.ts`) et de l'omission de `ProposalRecordSchema`, en amendant les principes 4 et 7 de la décision 0010 ; le remplacer par un appel d'adaptateur à la demande `getPlacePhoto(ctx: AdapterContext, tripId, proposalId)` → `PlacePhoto | null`, contexte en premier comme dans `src/adapters/types.ts`, `null` pour une proposition inconnue ou d'une autre organisation. Forme proposée, **sans texte d'interface** : `PlacePhoto = { url, width, height, provider: "google" | "simulated", authors: { name, href? }[], mapsHref? }`, objet strict.
- **F13-TL-2 — Option A, côté serveur.** Une route ou l'adaptateur `prototype` côté serveur, accessible seulement pour une proposition du voyage du demandeur (pas de `placeId` libre dans l'adresse), fait Place Details (champ `photos` seul, offre « IDs Only ») puis Place Photos avec `skipHttpRedirect=true`, et **répond en JSON `PlacePhoto`** avec `Cache-Control: private, no-store`, `dynamic = "force-dynamic"` et `fetch` en `cache: "no-store"` ; ni cache de Next.js, ni CDN, ni fichier (règles « Aucun cache » de P0b, mêmes tests). `mapsHref` vient de `photos[].googleMapsUri` (ou d'une URL Maps construite avec `query_place_id`), **jamais du champ `googleMapsUri` du lieu**, qui fait passer la requête dans une offre plus chère. **Limite par utilisateur** (proposition : 40 demandes de photo par heure et par session, à confirmer avec Sécurité), pour qu'un seul visiteur n'épuise pas le quota du jour. Selon F13-Q4 : le navigateur charge `photoUri` chez Google, ou le serveur relaie les octets de l'image sans les garder.
- **F13-TL-3 — Simulé.** Trois photos simulées dans `public/mock-photos/`, dessinées pour le test (aplats, aucune photo de tiers), WebP de 716 × 440 px, 40 Ko au plus chacune, `provider: "simulated"`, servies par `getPlacePhoto` de l'adaptateur `mock` ; le jeu simulé sérialisé ne gagne aucune clé `photos` (`src/mocks/edimbourg.test.ts` inchangé).
- **F13-TL-4 — Test F6.** Remplacer `DeckCard: aucune photo affichée` par `DeckCard: aucune photo` et `DeckCard: photo et attribution`, par une décision écrite (règle de `CLAUDE.md`).

## Critères d'acceptation (F13a)
- [ ] `ProposalSchema` n'a plus de `photoUrl` et refuse cette clé ; `ProposalRecordSchema` et le test `contrats: chaque champ a une seule catégorie` sont à jour ; `PlacePhotoSchema` refuse un champ inconnu (tests).
- [ ] `getPlacePhoto` de l'adaptateur `mock` renvoie une `PlacePhoto` valide pour les 3 propositions illustrées, `null` pour les autres, `null` pour une proposition inconnue ou une autre organisation (tests) ; aucune clé `photos` dans le jeu sérialisé (test existant inchangé).
- [ ] Avec une photo simulée, `DeckCard` affiche l'image dans le bloc de 220 px, sans déformation, et le bandeau « Photo simulée » (test `DeckCard: photo et attribution`).
- [ ] Sans photo, ou si l'image échoue (`onerror` simulé), le bloc « Photo du lieu » reste et aucun message d'erreur n'apparaît (tests `DeckCard: aucune photo` et `DeckCard: repli si l'image échoue`).
- [ ] La hauteur de la carte est la même avec et sans photo (test e2e de mise en page, 390 × 844).
- [ ] Seules la carte en cours et la suivante demandent leur photo (test qui compte les appels à l'adaptateur).
- [ ] Le glisser, les boutons et le clavier de F6 se comportent comme avant (tests e2e F6 verts).
- [ ] L'image a `alt=""` ; le texte du bandeau est dans la description accessible de la carte ; axe sans violation ; la paire de tokens du bandeau atteint 4,5:1 (test sur la paire de tokens, handover § 11).
- [ ] La feuille de détail montre la photo et l'auteur en lien `rel="noopener noreferrer"`.
- [ ] Aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies ; aucune URL de photo dans l'adresse ni dans un événement (tests de F6 étendus).
- [ ] `deck_photo_shown` suit F13-PO-6 : émis une fois par proposition et par session de tri, pas réémis après « Annuler », sans nom de lieu, `placeId` ni URL ; accepté par le schéma strict de `src/analytics` (tests).
- [ ] « Données de lieux : Google » et « Google Maps » ne s'affichent jamais avec une photo simulée (test).
- [ ] Captures de référence de `DeckCard` avec et sans photo mises à jour (workflow `visual-update`).

## Critères d'acceptation (F13b, option A)
- [ ] La relecture répond en JSON `PlacePhoto` et refuse une proposition d'un autre voyage ou d'une autre organisation (test).
- [ ] Au-delà de la limite par utilisateur (F13-TL-2), `null` sans appel à Google (test).
- [ ] Réponse `Cache-Control: private, no-store` ; aucun cache de Next.js (test sur le build de production) ; aucun nom de photo, URL ni `placeId` dans un fichier, un journal ou une trace (test de redaction).
- [ ] Quota atteint (403 ou 429 de Google), absence de photo, erreur réseau : `null`, donc repli (tests avec relecteur simulé).
- [ ] La requête Place Details ne demande que le champ `photos` (test sur le masque de champs).
- [ ] La clé `GOOGLE_MAPS_SERVER_KEY` n'est importée que par le code de relecture (règle d'import de P0, testée).
- [ ] « Google Maps » et l'auteur sont affichés quand Google les fournit ; « Données de lieux : Google » sous le paquet ; lien « Voir sur Google Maps » dans la feuille de détail (tests).
- [ ] Aucune photo réelle ne passe par l'optimiseur d'images de Next.js (test).
- [ ] Aucune photo ni donnée de photo ne part dans un prompt (P0a ne demande jamais le champ `photos`).

## Hors périmètre
Options B et C ; photos dans la Journée, le Séjour, la Fiche étape ou sur la carte géographique ; galerie ; photos d'hôtel ; génération d'images par IA ; signalement d'une photo ; mise en production (G0).

## Questions ouvertes
- **F13-Q1 (Samuel, reprend Q6)** : répondue le 2026-10-12 à 11:05 CEST : option A.
- **F13-Q2 (Samuel, argent)** : les photos partagent le quota quotidien de 100 requêtes Places avec P0a ; d'ici G0, accepter que les photos manquent les jours d'exécution de P0a, ou relever le quota Place Photos ? Bloque : rien (repli prévu).
- **F13-Q3 (Samuel, juridique, avec Q5 et Q6)** : lectures des conditions de Google, faites par le studio sans validation : (a) afficher une photo Google hors d'une carte Google est admis avec attribution (source 2) ; (b) l'attribution complète peut aller dans la feuille de détail, la carte gardant « Google Maps » et l'auteur ; (c) la mention « Données de lieux : Google » du handover § 8 s'ajoute au texte « Google Maps » demandé par Google, sans le remplacer ; (d) l'image chargée par le navigateur reste dans son cache HTTP selon les en-têtes de Google, ce que le studio ne lit pas comme une « mise en cache locale » par l'application (handover § 8). Bloque : F13b.
- **F13-Q4 (Samuel, données personnelles hors UE)** : si le navigateur charge l'image chez Google, l'adresse IP du voyageur part chez Google, hors UE (comme déjà pour la carte de F4). Alternative : le serveur relaie l'image sans la garder (bande passante Vercel en plus, IP non transmise). Recommandation du Product Owner : le chargement direct, aligné sur la carte de F4, en phase 0 seulement (P0b, poste de Samuel), à revoir avant l'ouverture au public. Bloque : F13b.
