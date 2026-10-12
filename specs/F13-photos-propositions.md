# F13 — Photos des propositions

Rédaction : rôle **product-owner** (`.claude/agents/product-owner.md`, modèle `specs/F0-socle.md`) · Ticket : #158 · Demande de Samuel (projet Claude « Vadrouille », 2026-10-12 10:51 CEST) : « il faut qu'on trouve un moyen d'afficher les preview des photos pour les propositions ».

Rôles d'exécution : frontend (F13a), backend ou frontend selon le CEO (F13b) · Prérequis : F6 dans `main` (fait) ; **F13b attend le choix de Samuel (Q6) et la fusion de #149 (spec P0, décisions 0026 et 0027)** · Référence : `docs/produit/cadrage-v5.md` (§ 3.3, § 6.5, § 9), `docs/handovers/frontend.md` (§ 8 « Conformité » et « Stockage », § 17 point 5), `specs/F6-presentation.md` (« Carte (`DeckCard`) », « Règles Google », F6-PO-11, F6-Q2), `specs/P0-prototype-recherche.md` (#149 : P0b, quotas), décisions 0002, 0010 (principes 4 et 7 : `Proposal.photoUrl` chargé à la demande, suit Q6), 0027 (règle provisoire de Q5, plafonds ; jointe à #149), `QUESTIONS.md` (Q5, Q6, Q14, Q252).

## Objectif
Montrer en haut de chaque carte de la présentation (`DeckCard`, écrans 6, 6b et 8) une photo **du lieu proposé**, pour que le voyageur décide « J'aime / Pas pour moi » en voyant l'endroit, sans enfreindre la règle provisoire de Q5 (décision 0027 : aucune donnée Google dans un prompt, seul l'identifiant de lieu stocké) ni dépasser les plafonds fixés par Samuel (20 USD par mois sur Google, 100 requêtes par jour et par API).

Aujourd'hui, la carte affiche toujours le bloc `muted` « Photo du lieu » et ignore `photoUrl` (F6, Q6).

## Ce qui est à Samuel et ce qui ne l'est pas
- **Le choix de la source des photos est à Samuel** (Q6 : conditions Google et droits des photos, donc juridique ; l'option A consomme le budget Google). Cette spécification compare les options et en recommande une ; elle ne tranche pas.
- Les détails d'affichage (cadrage, état de chargement, repli, attribution à l'écran) sont décidés ici par le Product Owner (rubrique « Décisions »).
- L'architecture (route serveur, forme du contrat, en-têtes de cache) est proposée au Tech Lead (rubrique « Propositions au Tech Lead »).

## Options comparées
Hypothèses de calcul : une présentation = 8 cartes (aperçu, D11) ; une photo par carte ; tarifs Google relevés le 2026-10-12 sur la grille officielle (Place Details Essentials (IDs Only) : gratuit, sans limite ; Place Photos : 1 000 gratuites par mois, puis 7 USD pour 1 000).

| | A. Photos Google à l'affichage | B. Wikimedia Commons | C. Banque d'images (Unsplash, Pexels) | D. Pas de photo |
|---|---|---|---|---|
| Ce qu'on voit | une vraie photo du lieu (souvent prise par des visiteurs) | une vraie photo du lieu, quand elle existe | une image d'ambiance, **pas le lieu** | le bloc « Photo du lieu » actuel |
| Couverture | quasi tous les lieux ancrés, restaurants et bars compris | bonne pour les monuments et musées (les 10 incontournables d'Édimbourg), faible pour les restaurants, bars, cafés : environ la moitié des cartes sans photo | totale, mais générique | — |
| Ce qui est stocké | rien d'autre que le `placeId` : le nom de photo et l'URL sont relus à chaque affichage, jamais gardés (Google interdit de garder le nom de photo) | l'identifiant Wikidata du lieu (donnée ouverte, trouvée par l'agent sur le web) ; l'image elle-même n'est pas copiée | identifiant d'image | rien |
| Règle provisoire de Q5 | compatible : rien de Google stocké, rien dans un prompt ; affichage hors carte Google avec attribution (cadrage § 6.5, handover § 8) | hors Google : non concernée | hors Google | non concernée |
| Droits et attribution | logo ou texte « Google Maps » + auteur de la photo (`authorAttributions`) quand Google le fournit ; lien vers la photo sur Google Maps (`photos[].googleMapsUri`) (règles Places consultées le 2026-10-12) | licence par image (souvent CC BY-SA) : auteur, licence et lien affichés ; vérifiable image par image | attribution du photographe et de la plateforme ; conditions de l'API | aucune |
| Coût par présentation | 8 Place Details (IDs Only, gratuites) + 8 Place Photos | 0 | 0 | 0 |
| Dans 20 USD par mois | 1 000 photos gratuites + environ 2 850 payées, soit **environ 480 présentations par mois** | illimité | illimité dans les limites de l'API | — |
| Dans 100 requêtes par jour et par API | **environ 12 présentations par jour** si Google compte le quota par méthode (lecture de P0) ; **environ 6** s'il le compte pour l'API Places entière (Details + Photos) ; presque aucune, voire aucune, les jours d'exécution de P0a (90 Place Details) | sans quota Google | Unsplash démo : 50 requêtes par heure | — |
| Compte ou clé nouveaux | aucun (clé serveur existante, Places API (New)) | aucun | **un compte et une clé** (à Samuel) | aucun |
| Principe produit 2 (fiabilité) | respecté | respecté si l'identifiant Wikidata est vérifié | **contraire** : montrer une autre rue ou un autre plat que le lieu induit en erreur | respecté |
| Travail | F13a + F13b (route serveur, attribution) | F13a + F13b + étape de l'agent (P0a) pour trouver l'identifiant Wikidata | F13a + F13b + compte | aucun |

Option écartée d'office : reprendre l'image du site source (balise `og:image`) : droits d'auteur du site, aucune licence.

## Recommandation du Product Owner
**A, photos Google relues à l'affichage, avec D en repli** : c'est la seule option qui montre le vrai lieu pour les repas (environ la moitié des cartes, cadrage § 4) ; elle ne stocke rien de Google et coûte au plus le plafond déjà fixé. Quand le quota du jour est atteint, qu'un lieu n'a pas de photo ou que Google ne répond pas, la carte montre le bloc « Photo du lieu », sans message d'erreur.

Limite à connaître : en phase 0, la photo ne peut s'afficher qu'avec de vrais `placeId`, donc dans P0b (programmes réels, poste de Samuel). La démonstration Vercel, sur données simulées, garde des photos simulées (F13a).

Si Samuel préfère ne pas dépendre de Google pour les photos : **B avec D en repli**, en acceptant les cartes de repas sans photo.

## Découpage
| Tâche | Contenu | Rôle | Attend |
|---|---|---|---|
| **F13a** | `DeckCard` affiche une photo quand l'adaptateur en fournit une, avec cadrage, chargement, repli et zone d'attribution ; l'adaptateur `mock` fournit des photos **simulées** (images fabriquées pour le test, dans le dépôt, sans droits de tiers) pour 2 à 3 propositions du jeu simulé, les autres restent sans photo | frontend | rien : indépendant du choix de Samuel |
| **F13b** | Source réelle choisie par Samuel : pour A, route serveur de photo (relecture Google, aucun cache) et branchement dans l'adaptateur `prototype` de P0b ; pour B, identifiant Wikidata dans le programme (P0a) et lecture Commons | backend ou frontend (CEO) ; revue Sécurité | Q6 (Samuel), décision du Tech Lead F13-TL-1 à F13-TL-3, P0b1 |

## Comportement (F13a, toutes options)
- **Emplacement** : le bloc photo de `DeckCard` (220 px de haut, F6-Q2), pleine largeur de la carte, coins du haut de la carte. Rien ne change ailleurs sur la carte.
- **Cadrage** : l'image remplit le bloc (`object-fit: cover`), centrée ; aucune déformation.
- **Chargement** : tant que l'image n'est pas chargée, le bloc `muted` « Photo du lieu » reste visible ; l'image apparaît en fondu (150 ms ; immédiat avec `prefers-reduced-motion: reduce`). La mise en page ne bouge pas (hauteur fixe).
- **Repli** : pas de photo, erreur de chargement, quota atteint, hors-ligne : le bloc « Photo du lieu » reste, sans message d'erreur.
- **Préchargement** : seules la carte en cours et la suivante demandent leur photo (pas les 8 d'un coup), pour ménager le quota.
- **Attribution** : une ligne en bas du bloc photo, sur un voile assurant un contraste d'au moins 4,5:1, **composée par l'interface depuis `fr.json`** à partir des données structurées de l'adaptateur (aucun texte d'interface dans les données, handover § 9) : par exemple « Google Maps · Photo : {auteur} » pour A, « {auteur}, {licence} » pour B. Une photo simulée n'affiche jamais « Google Maps ». Le texte « Google Maps » n'est ni traduit (`translate="no"`), ni coupé sur deux lignes. Le lien d'auteur ou de licence n'est pas sur la carte (la carte entière est un bouton) : il est dans la feuille de détail.
- **Feuille de détail** (F6-PO-12) : la même photo en tête, plus grande, avec l'attribution complète en liens (`rel="noopener noreferrer"`, nouvel onglet) et, pour A, un lien « Voir sur Google Maps ».
- **Accessibilité** : l'image est décorative pour le lecteur d'écran (`alt=""`) : le nom du lieu est déjà annoncé par la carte ; l'attribution est lue dans la description accessible de la carte.
- **Gestes** : l'image ne capte pas le glisser (`draggable="false"`, `pointer-events: none`) ; tous les gestes de F6 restent identiques.
- **Image** : balise `<img>` simple, ou `next/image` avec `unoptimized`, pour toute photo réelle : l'optimiseur d'images de Next.js ou de Vercel garderait les photos en cache côté serveur et CDN.
- **Stockage** : aucune écriture côté client (règles Google de F6 inchangées) ; l'URL de photo n'est jamais mise dans l'adresse, un événement de mesure ou un journal.

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
- **F13-PO-1** : photo sur `DeckCard` et dans la feuille de détail seulement ; la Journée, le Séjour et la Fiche étape gardent leur affichage actuel (photos ailleurs : tâche à part si Samuel le demande).
- **F13-PO-2** : repli silencieux sur le bloc « Photo du lieu » (une photo absente n'est pas une incertitude sur le lieu, donc pas de badge, principe produit 4).
- **F13-PO-3** : une seule photo par lieu, la première fournie par la source ; pas de galerie.
- **F13-PO-4** : préchargement limité à la carte en cours et à la suivante.
- **F13-PO-5** : attribution courte sur la carte, complète avec liens dans la feuille de détail (les règles Places admettent l'attribution sur la vue agrandie quand la vignette est réduite).
- **F13-PO-6** : nouvel événement de mesure `deck_photo_shown` (`position`, `has_photo: true | false`), sans nom de lieu, `placeId` ni URL ; il sert à mesurer si la photo change le taux de « Pas pour moi » (G0, G1).
- **F13-PO-7** : F13a remplace la règle de F6 « `photoUrl` ignorée, toujours le bloc « Photo du lieu » » et le test F6 `DeckCard: aucune photo affichée` (remplacé par `DeckCard: aucune photo` et `DeckCard: photo et attribution`). Le changement de test est consigné dans une décision de `docs/decisions/`, jointe à la PR de F13a (règle de `CLAUDE.md`).

## Propositions au Tech Lead (architecture, à trancher dans `docs/decisions/` ou à la revue de F13b)
- **F13-TL-1 — Contrat.** Retirer `Proposal.photoUrl` de `ProposalSchema` (`src/contracts/trip.ts`) et de l'omission de `ProposalRecordSchema`, en amendant les principes 4 et 7 de la décision 0010 ; le remplacer par un appel d'adaptateur à la demande `getPlacePhoto(ctx: AdapterContext, tripId, proposalId)` → `PlacePhoto | null`, contexte en premier comme dans `src/adapters/types.ts`. Forme proposée, **sans texte d'interface** : `PlacePhoto = { url, width, height, provider: "google" | "wikimedia" | "simulated", authors: { name, href? }[], license?, mapsHref? }` ; l'interface compose l'attribution depuis `fr.json`.
- **F13-TL-2 — Option A, côté serveur.** Une route ou l'adaptateur `prototype` côté serveur, accessible seulement pour une proposition du voyage du demandeur (pas de `placeId` libre dans l'adresse : sinon n'importe qui épuise le quota), fait Place Details (champ `photos` seul, offre « IDs Only » gratuite) puis Place Photos avec `skipHttpRedirect=true`, et **répond en JSON `PlacePhoto`** (une redirection ne porterait pas l'attribution, et un second appel doublerait le quota), avec `Cache-Control: private, no-store`, `dynamic = "force-dynamic"` et `fetch` en `cache: "no-store"` ; ni cache de Next.js, ni CDN, ni fichier (règles « Aucun cache » de P0b, mêmes tests : recherche statique et e2e sur le build de production). Le navigateur charge ensuite `photoUri` directement chez Google. `mapsHref` vient de `photos[].googleMapsUri` (ou d'une URL Maps construite avec `query_place_id`) ; **jamais le champ `googleMapsUri` du lieu**, qui fait passer la requête dans une offre payante plus chère. La clé serveur ne sort jamais du serveur.
- **F13-TL-3 — Simulé.** Les photos simulées de F13a vivent dans `public/mock-photos/` (fabriquées pour le test, licence du dépôt), `provider: "simulated"`, et passent par le même appel d'adaptateur, pour que F13b ne touche pas `DeckCard`.

Avis du Tech Lead (relecture du 2026-10-12, avant la PR) : F13-TL-1 et F13-TL-3 acceptés avec les ajustements ci-dessus ; F13-TL-2 corrigé (JSON plutôt que redirection, `googleMapsUri` de la photo, `unoptimized`). Décision écrite dans `docs/decisions/` avec la PR de F13a.

## Critères d'acceptation (F13a)
- [ ] Avec une photo simulée, `DeckCard` affiche l'image dans le bloc de 220 px, sans déformation, et la ligne d'attribution (test `DeckCard: photo et attribution`).
- [ ] Sans photo, ou si l'image échoue (`onerror` simulé), le bloc « Photo du lieu » reste et aucun message d'erreur n'apparaît (tests `DeckCard: aucune photo` et `DeckCard: repli si l'image échoue`).
- [ ] La hauteur de la carte est la même avec et sans photo (test e2e de mise en page, 390 × 844).
- [ ] Seules la carte en cours et la suivante demandent leur photo (test qui compte les appels à l'adaptateur).
- [ ] Le glisser, les boutons et le clavier de F6 se comportent comme avant (tests e2e F6 inchangés et verts).
- [ ] L'image a `alt=""` ; l'attribution est dans la description accessible de la carte ; axe sans violation ; contraste de la ligne d'attribution d'au moins 4,5:1.
- [ ] La feuille de détail montre la photo et l'attribution complète en liens `rel="noopener noreferrer"`.
- [ ] Aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB, Cache Storage ni cookies ; aucune URL de photo dans l'adresse ni dans un événement (tests existants de F6 étendus).
- [ ] `deck_photo_shown` est émis une fois par carte affichée, sans nom de lieu, `placeId` ni URL.
- [ ] Captures de référence de `DeckCard` avec et sans photo mises à jour (workflow `visual-update`).

## Critères d'acceptation (F13b, option A, si Samuel la retient)
- [ ] La route répond en JSON `PlacePhoto` et refuse une proposition d'un autre voyage ou d'une autre organisation (test).
- [ ] Réponse `Cache-Control: private, no-store` ; aucun cache de Next.js (test sur le build de production) ; aucun nom de photo, URL ni `placeId` dans un fichier, un journal ou une trace (test de redaction).
- [ ] Quota atteint (403 ou 429 de Google), absence de photo, erreur réseau : `null`, donc repli (tests avec relecteur simulé).
- [ ] La clé `GOOGLE_MAPS_SERVER_KEY` n'est importée que par le code de relecture (règle d'import de P0, testée).
- [ ] « Google Maps » et l'auteur sont affichés quand Google les fournit ; lien « Voir sur Google Maps » (depuis `photos[].googleMapsUri`) dans la feuille de détail ; la requête Place Details ne demande que le champ `photos`.
- [ ] Aucune photo réelle ne passe par l'optimiseur d'images de Next.js (test).
- [ ] Aucune photo ni donnée de photo ne part dans un prompt (P0a ne demande jamais le champ `photos`).

## Hors périmètre
Photos dans la Journée, le Séjour, la Fiche étape ou sur la carte géographique ; galerie ; photos d'hôtel ; génération d'images par IA ; signalement d'une photo ; mise en production (G0).

## Questions ouvertes
- **F13-Q1 (Samuel, reprend Q6)** : source des photos des propositions. A (Google à l'affichage, recommandé), B (Wikimedia Commons), C (banque d'images, déconseillé) ou D (pas de photo). Bloque F13b seulement ; F13a peut démarrer.
- **F13-Q2 (Samuel, si A)** : les photos partagent le quota quotidien de 100 requêtes Places avec P0a ; d'ici G0, accepter que les photos manquent les jours d'exécution de P0a, ou relever le quota Place Photos (argent) ?
- **F13-Q3 (Samuel, juridique, avec Q6)** : l'image chargée depuis Google reste dans le cache HTTP du navigateur selon les en-têtes de Google. Est-ce compatible avec « pas de mise en cache locale des photos Google » (handover § 8), puisque l'application n'écrit rien elle-même ? Recommandation de Sécurité et du Tech Lead, à confirmer par Samuel : oui.
