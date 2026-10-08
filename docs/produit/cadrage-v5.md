# Planificateur de voyages IA — cadrage v5

Date : 6 octobre 2026. Document de travail de Samuel Coppey. Remplace la v4.

## 0. Ce qui change par rapport à la v4

1. **Le meilleur de la destination, bien organisé.** La distance au logement n'est plus un filtre : c'est un coût, pesé selon le type d'étape. Les incontournables de la ville ou de la région qui correspondent aux envies sont proposés même loin de l'hôtel ; la proximité compte surtout pour les repas, la soirée et le temps libre (§ 3.7).
2. **Proximité mesurée au parcours du jour,** pas seulement à l'hôtel : chaque journée regroupe un ou deux secteurs, l'hôtel reste le terminus.
3. **Budget de trajet par rythme** et transparence : une étape éloignée affiche son temps de trajet et ce qui justifie le détour.
4. **« Trop loin »** rejoint les raisons de refus et de remplacement ; il ajuste la tolérance aux trajets du voyage.
5. **Logement conseillé** selon l'accès à l'ensemble du programme, et non plus selon la seule proximité.

Les décisions et le parcours de la v4 restent valables par ailleurs ; le canevas et le handover front-end sont mis à jour en conséquence.

## 1. Décisions, hypothèses et points ouverts

**Confirmé par Samuel :** application web en libre-service pour voyageurs particuliers ; compréhension de la destination, du style, des envies et de la durée ; itinéraire construit à partir d'un ou plusieurs hôtels, avec activités quotidiennes, restaurants, bars, fêtes et événements datés sur deux ou trois niveaux d'offre ; découvertes inattendues ; adaptation facile par retours positifs ou négatifs. Données trouvées par recherche web à chaque voyage, sans bibliothèque à gérer. Croissance possible par la vente aux agences de voyages. Pas d'échéance : la qualité prime sur le calendrier. Présentation cœur / pas cœur ouverte d'office, avec possibilité de passer. Logement suggéré quand il n'est pas encore choisi. Envies génériques. Ambition de revenus récurrents importants. Disponibilité : 10–20 heures par semaine. Budget : moins de 1’000 CHF hors temps personnel.

**Propositions à tester :** commencer par les voyageurs particuliers — couples francophones préparant 5–10 jours en Europe, intéressés par la gastronomie, la découverte locale et la nature ; aperçu offert puis paiement unique ; agences explorées en parallèle par entretiens. Aucune demande commerciale n'est encore démontrée.

| # | Décision | Recommandation v4 | Échéance |
|---|---|---|---|
| D1 | Nom de travail et domaine | Nécessaire pour la page d'offre ; un nom provisoire suffit | Avant la page d'offre |
| D3 | Destinations de la bêta | Toutes possibles techniquement ; communication et mesure concentrées sur 2–3 destinations choisies selon la demande | G0 |
| D4 | Ancrage des lieux, trajets et carte | **Tranché sur le principe :** Google Maps Platform, facturation suisse, aucune donnée Google dans les prompts (§ 6.5). Variante Gemini + ancrage Maps évaluée dans le prototype | Prototype phase 0 |
| D5 | Modèles par étape | Par évaluation sur le jeu de référence. Candidats : Claude Haiku 4.5 et Sonnet 5.5 ; Gemini avec ancrage Maps | Prototype phase 0, confirmé à G1 |
| D6 | Recherche web | Outil natif du fournisseur retenu en D5 ; API de recherche indépendante seulement si besoin de portabilité ou de coût | Prototype phase 0 |
| D7 | Exécution durable | **Tranché :** Vercel Workflows | — |
| D8 | Authentification | Email et code à 6 chiffres, sans mot de passe ; organisations et rôles natifs | Début phase 1 |
| D9 | Prix | Aperçu offert puis paiement unique, 19/29/39 CHF à tester ; pilote assisté à 49 puis 79 CHF ; 49–79 CHF par conseiller et par mois pour les agences | G1 / G3 |
| D10 | Pilote agence | 5 entretiens en phase 0 ; pilote avec 1–2 agences en phase 3 si l'intérêt est confirmé | G0 |
| D11 | Taille de l'aperçu | 8 propositions ; à ajuster selon la conversion et le coût | Bêta |
| D12 | Seuils d'apprentissage | 2 refus dans une catégorie → question ; 3 « j'aime » → préférence déduite ; à calibrer sur les données de bêta | Bêta |
| D13 | Direction artistique | 2–3 directions sur l'écran Journée, puis design system | Après validation des wireframes |
| D14 | Tolérance aux trajets | Pas de question supplémentaire dans le brief : compromis automatique (§ 3.7), budget de trajet par rythme, ajusté par les refus « trop loin » ; réglage explicite seulement si les tests le demandent | Bêta (calibrage) |

## 2. Promesse, concurrence et différenciation

Promesse de travail : **« Ton voyage, de l'hôtel à la soirée : quoi faire, où manger et ce qui se passe pendant ton séjour. »** Le résultat vendu est un programme utilisable : bonnes étapes, déplacements plausibles, temps libre, budget compréhensible et facilité de modification.

Concurrence grand public, vérifiée le 6 octobre 2026 : Mindtrip associe chat et carte interactive sur une base revendiquée de 11 millions de lieux et a lancé des vols avec Sabre et PayPal en 2026 [21] ; Layla est gratuit ou à 9,99 USD par mois, avec alertes de prix [22] ; Wanderlog propose une interface carte + journées [9] ; les assistants généralistes (ChatGPT, Gemini relié à Google Maps, Google AI Mode, Kayak AI) couvrent l'inspiration et les prix [21, 22]. Les planificateurs reconnaissent eux-mêmes qu'ils peuvent se tromper sur les détails et qu'un itinéraire IA reste un brouillon [23]. Une enquête Booking.com citée en 2026 montre qu'une large majorité de voyageurs veut une aide de l'IA, mais qu'une petite minorité accepte qu'elle décide seule [21] : cela conforte un produit qui propose, justifie et laisse choisir. La concurrence côté agences est traitée au § 4.

Ni la personnalisation, ni l'interface carte + onglets, ni la génération rapide ne différencient le produit. La différenciation doit être démontrée sur quatre points mesurables :

- **Fiabilité** : aucun lieu inventé ou fermé, horaires et dates sourcés et datés, incertitudes visibles.
- **Sélection** : des adresses choisies et justifiées avec leur source (« pourquoi pour toi »), pas une liste de lieux bien notés.
- **Actualité** : des événements réellement prévus pendant les dates du séjour.
- **Adaptation** : une modification locale qui respecte les engagements (réservations, horaires fixes, prestations vendues) en quelques actions.

### Benchmark concurrentiel (phase 0)

Objectif : vérifier la différenciation avant de construire et produire le matériel de la page d'offre. Charge estimée : 4–6 heures.

Protocole : soumettre trois briefs identiques à Mindtrip, Layla, Wanderlog et deux assistants généralistes. Deux briefs reprennent des voyages vécus par Samuel, dont la réalité terrain est connue : Édimbourg (29 août – 3 septembre 2026 : arrivée à midi, Tattoo le samedi à 21 h 30, excursion dans les Highlands, distillerie accessible en transports publics) et Zakynthos (été 2026). Le troisième est fictif et impose un changement d'hôtel en milieu de séjour.

Grille : lieux inexistants ou fermés ; trajets irréalistes ; contrainte horaire fixe respectée ; pertinence des restaurants (1–5) ; événements datés corrects ; nombre d'actions pour remplacer une activité en conservant le dîner. Livrable : une page de comparaison et deux ou trois captures avant/après. Le prototype de l'agent de recherche (§ 7) est ensuite évalué sur les mêmes briefs.

## 3. Expérience utilisateur

Maquettes : canevas « Planificateur de voyages IA — parcours et wireframes », 18 écrans mobiles en noir et blanc, sur l'exemple d'Édimbourg (https://claude.ai/artifact/8CSvG9DzaQ74mQz7zWmAe6). Les contenus non vérifiés y figurent entre crochets.

### 3.1 Parcours : on découvre avant de payer

| # | Écran | Rôle |
|---|---|---|
| 1 | Créer le voyage | Destination et dates ; « As-tu déjà un logement ? » (oui, ou pas encore → suggestion ou quartier) ; autres villes ; engagements déjà pris (vols, réservations, billets) |
| 2 | Brief raconté | « Raconte ton voyage en quelques phrases » ; l'IA pré-remplit voyageurs, déplacements, rythme, envies, éléments à limiter et budget par repas ; l'utilisateur vérifie ; sections facultatives repliées |
| 3 | Où loger | Si pas encore d'hôtel : le quartier le mieux relié à l'ensemble du programme (à pied pour le centre, en transport pour le reste), avec sa raison, et 3 logements ; on peut partir du quartier et choisir plus tard |
| 4 | Compte | Email et code à 6 chiffres : pas de mot de passe, pas de changement d'application |
| 5 | Aperçu prêt | Génération de l'aperçu ; présentation proposée d'office ; « Passer, voir le programme » |
| 6 | Présentation | Une carte par proposition : « J'aime » / « Pas pour moi », au bouton ou au geste ; appui pour le détail ; 8 propositions offertes |
| 7 | Confirmer une préférence | Au deuxième refus d'une même catégorie : « On arrête … pour ce voyage ? », avec raison facultative |
| 8 | Choisir un repas | Une carte par créneau ; « Option suivante » ou « Je choisis » |
| 9 | Débloquer | Ce qui est inclus, prix unique, TWINT ou carte ; l'aperçu reste accessible sans payer |
| 10 | Programme ajusté | Ce qu'on a retenu (confirmé ou déduit, annulable), ce qui a changé, réservations à faire |
| 11 | Aperçu du séjour | Carte globale, budget, « À faire avant de partir » (réservations avec lien, cases à cocher), événements, jour par jour |
| 12 | Journée | Carte et étapes, trajets, repas choisis, temps libre, événements |
| 13 | Fiche étape | Détail, source, itinéraire ; garder ou remplacer ; verrouiller ; signaler une erreur |
| 14 | Remplacer une étape | Raison (pas mon style, trop chargé, trop cher, trop loin, autre) et souhait ; proposition ; ce qui change et ce qui ne bouge pas ; appliquer ou annuler |
| 15 | Pendant le voyage | Prochaine étape, itinéraire, rappels de réservation, calendrier, lien privé |
| 16 | Après le voyage | Avis rapide par étape, adresse découverte sur place, « Retenir mes goûts » (facultatif), souvenir à partager |
| 17 | Mes voyages | Voyages à venir avec réservations restantes, aperçus non débloqués, voyages passés |
| 18 | États | Information incertaine, conflit, aucune option compatible, erreur de calcul, événement non confirmé, aucun voyage |

Reste à maquetter : page d'offre avec démo interactive, ajout d'un lieu personnel et déplacement d'une étape, vues bureau, espace agence.

### 3.2 Principes d'interface

- Mobile d'abord : carte en haut, panneau coulissant à plusieurs hauteurs, marqueurs synchronisés avec la liste, filtre par jour.
- Aucun trou dans le programme : les repas se choisissent pendant la présentation ; ce qui reste ouvert est signalé comme tel.
- Les badges ne signalent que les exceptions (« à confirmer », « à réserver », « non confirmé »). L'absence de badge vaut vérification ; la date de vérification figure dans la fiche.
- Vocabulaire constant : « J'aime » / « Pas pour moi » dans la présentation, « Garder » / « Remplacer » ailleurs ; une action garde le même nom de bout en bout.
- Rien ne change sans aperçu des effets, et ce qui ne bouge pas est rappelé.
- Les engagements (vols, réservations, billets) sont saisis avant la génération et deviennent des étapes verrouillées.
- Accessibilité : vrais boutons, cibles d'au moins 44 px, contrastes AA, information jamais portée par la seule couleur, gestes toujours doublés de boutons.

### 3.3 Présentation et apprentissage

- Ouverte d'office après la génération ; « Passer » mène directement au programme.
- Par défaut, une proposition est gardée : seul « Pas pour moi » la retire.
- Un refus retire ce lieu uniquement. Deux refus dans une même catégorie déclenchent une question ; aucune généralisation silencieuse.
- Plusieurs « J'aime » dans une même catégorie (trois, à calibrer) font remonter des propositions similaires, affichées comme « déduit » et modifiables.
- Les étapes verrouillées et les engagements ne sont pas présentés.
- Recalcul par lot, à la fin du tri ou au déblocage, sur les jours touchés : un programme cohérent plutôt qu'une suite de retouches.
- Les envies du brief et les catégories des lieux partagent le même vocabulaire : c'est ce qui permet de reconnaître que deux refus portent sur la même chose.
- Les préférences ne passent d'un voyage à l'autre qu'avec l'accord explicite de l'utilisateur (écran 16).
- La présentation complète est plafonnée (environ 15–20 cartes) et regroupée par jour.

### 3.4 Restaurants, événements et découvertes

**Restaurants.** « Petite adresse / Bonne table / Occasion spéciale » décrivent l'expérience, pas le prix ; le budget estimé par personne, la cuisine, l'ambiance et la raison de la recommandation sont affichés à part. Dans la présentation, chaque créneau propose jusqu'à 3 options successives.

**Événements.** Le bloc « Pendant ton séjour » propose concerts, fêtes locales, marchés ponctuels, soirées, festivals, rencontres sportives ou dégustations correspondant aux dates et aux envies. Le lieu permanent est distinct de son occurrence datée. Un événement n'est présenté comme confirmé qu'avec une source relue, une date, une heure locale, un lieu et un lien ; sinon il porte un badge « non confirmé ». Une édition passée ne prouve pas une prochaine édition.

**Découvertes.** « Surprends-moi » (une idée inattendue avec sa raison, sa durée et son coût) fait partie du MVP. « Sur ton chemin », « Ce soir », « Deux heures libres » et « S'il pleut » viennent ensuite. Le programme préserve des temps libres et des soirées facultatives.

Exemple de référence : « Cette visite ne me tente pas, je préfère une dégustation, mais je veux garder mon restaurant à 19 h. » Le remplacement laisse le restaurant et son horaire intacts, permet d'y arriver et signale si une réservation reste nécessaire.

### 3.5 Fonctionnalités par bloc

| Bloc | MVP | Après le MVP |
|---|---|---|
| Préparer | Logement saisi ou suggéré, plusieurs villes, engagements, brief raconté puis vérifié, contraintes | Import d'une confirmation de réservation |
| Générer | Recherche, ancrage et planification ; aperçu offert ; email « aperçu prêt » ; « Surprends-moi » | — |
| Découvrir | Présentation, confirmation des préférences, choix des repas, programme ajusté | Trier à deux |
| Programme | Aperçu du séjour, « À faire avant de partir », journée, fiche, remplacement, verrou, versions, signalement d'erreur, ajout d'un lieu personnel, déplacement d'une étape | Demande libre (« journée plus calme ») |
| Pendant le voyage | Prochaine étape, rappels, calendrier, lien privé, liens d'itinéraire | Hors ligne, « Ce soir », « Deux heures libres », « S'il pleut », vérification à J-7 |
| Après le voyage | Avis rapide, adresse découverte, mémoire des goûts sur accord | Souvenir partageable |
| Compte et paiement | Email et code, paiement unique (TWINT, carte), reçu, mes voyages, export et suppression des données | Pass annuel si le réachat est observé |
| Acquisition | Page d'offre avec démo interactive d'un voyage exemple | Programmes partagés comme vitrine |
| Qualité et exploitation | File de vérification humaine (pilote), tableau des coûts, quotas et traces, signalements | — |
| Agences | — (schéma multi-organisation prêt) | Organisations et rôles, marque blanche, prestations verrouillées, proposition en lien et PDF, facturation par siège |

### 3.6 Leviers de croissance (après le MVP)

- **Trier à deux** : chaque voyageur passe la présentation de son côté, les choix communs sont gardés. Inviter son ou sa partenaire fait entrer un nouvel utilisateur ; c'est aussi un vrai différenciant.
- **Souvenir partageable** après le voyage : la carte de ce qui a été fait, aux couleurs du produit, source d'acquisition organique.
- **Affiliation** sur la liste « À faire avant de partir », signalée comme telle, hors scénario de base.

### 3.7 Choisir et organiser : le meilleur, sans perdre son temps

On propose d'abord ce qui vaut le voyage, puis on l'organise pour limiter les trajets. Un hôtel à 45 minutes d'Arthur's Seat n'empêche pas d'y aller : la journée qui l'inclut est construite autour.

**La distance est un coût, pas un filtre.** Chaque candidat est jugé sur son adéquation aux envies et sa qualité, moins un coût de trajet dont le poids dépend du type d'étape :

| Type d'étape | Poids de la distance | Règle |
|---|---|---|
| Activité principale, incontournable | Faible | Proposée même loin du logement si elle correspond aux envies |
| Excursion | Très faible | Occupe une journée entière, trajet compris |
| Repas | Fort | Près de l'étape précédente ou suivante, sauf « Occasion spéciale » qui peut justifier un détour |
| Soirée | Fort | Près du logement du soir |
| Temps libre, « Sur ton chemin » | Très fort | Autour de l'endroit où l'on se trouve |

**Proximité au parcours, pas seulement à l'hôtel.** L'hôtel est le terminus : on en part le matin, on y revient le soir. Entre les deux, la proximité se mesure à l'étape précédente et à la suivante.

**Une journée, un ou deux secteurs.** Les incontournables sont répartis par secteur sur les jours du séjour (vieille ville, port, parc…), pour que les trajets se fassent surtout entre deux secteurs, pas à chaque étape. Les repas et la soirée sont choisis dans le secteur du jour.

**Budget de trajet par jour,** hors excursion, à calibrer en bêta : environ 1 h pour un rythme tranquille, 1 h 30 pour un rythme équilibré, 2 h 30 pour un rythme intense. Un dépassement est signalé et expliqué.

**Transparence.** Une étape à plus de 20 minutes de la précédente affiche son temps de trajet et ce qui justifie le détour : « À 45 min en bus, mais c'est le point de vue le plus connu de la ville. »

**Apprentissage.** « Trop loin » est une raison de refus et de remplacement. Deux refus « trop loin » déclenchent une question (« On reste plus près de ton hôtel ? ») ; une réponse positive réduit la tolérance aux trajets pour ce voyage, jamais en silence.

**Mesures.** Couverture des incontournables qui correspondent aux envies, temps de trajet par jour, part des refus « trop loin ».

## 4. Offre et économie

### Pilote assisté

Hypothèse : **49 CHF par voyage**, avec un brief, un programme, deux séries de retours et une vérification humaine des éléments importants. Dix dossiers au total, un ou deux simultanés au maximum. Assistance humaine affichée clairement ; date de livraison confirmée avant paiement, cible de 72 heures après un brief complet. Puis 79 CHF sur une nouvelle cohorte comparable.

Les achats de la phase 0 peuvent être des **préventes** pour des voyages de printemps, livrées pendant la bêta. Cela sépare la preuve d'achat de la capacité de livraison.

### Produit en libre-service

Le paiement intervient après la démonstration de valeur, dès le MVP.

- **Aperçu offert** : brief, logement suggéré si besoin, puis 8 propositions dans la présentation (première journée et début de la deuxième). Compte obligatoire (email et code) et un aperçu actif à la fois par compte, à calibrer, pour contenir le coût (environ 0,3–1 USD par aperçu).
- **Voyage complet** : paiement unique (TWINT ou carte) pour toutes les journées, repas et soirées, événements, ajustements jusqu'à [N] remplacements, liste à réserver, calendrier, partage et accès jusqu'à 30 jours après le retour. Le reste du voyage se génère pendant que l'utilisateur poursuit le tri.
- **Prix à tester** : 19, 29 et 39 CHF. Le pilote assisté (49 puis 79 CHF) reste l'outil de validation de la phase 0.
- Pas d'abonnement grand public tant que le réachat n'est pas observé. L'affiliation reste un revenu d'appoint, signalée comme telle, hors scénario de base.

Mesures associées : taux de passage de la présentation, taux de « pas pour moi », conversion de l'aperçu en paiement.

### Coût unitaire estimé

Tarifs publics consultés le 6 octobre 2026 [11, 12, 19, 27] ; volumes estimés, à mesurer dans le prototype.

| Poste | Hypothèse de volume | Ordre de grandeur |
|---|---|---|
| Brief (Claude Haiku 4.5 : 1 USD par million de tokens en entrée, 5 en sortie) | ~3k tokens en entrée, ~1k en sortie | ~0,01 USD |
| Recherches web (10 USD pour 1 000 recherches) | 30–60 recherches | 0,30–0,60 USD |
| Résultats et pages lues, extraction (petit modèle ; lecture de pages sans surcoût) | 150–400k tokens | 0,15–0,40 USD |
| Orchestration de l'agent (Claude Sonnet 5.5 : 2 USD par million en entrée, 10 en sortie) | ~100k en entrée, ~10k en sortie | ~0,30 USD |
| Ancrage — résolution du nom en identifiant (Text Search « IDs only ») | 60–150 requêtes | 0 (gratuit, illimité) |
| Ancrage — vérification (Place Details, 17–20 USD pour 1 000 selon les champs) | 60–150 requêtes | 1–3 USD au-delà des quotas gratuits |
| Trajets (matrice, ~5 USD pour 1 000 éléments) | 100–200 éléments | 0,5–1 USD au-delà des quotas gratuits |
| Sélection et réparation (Sonnet 5.5) | 1–2 appels | 0,10–0,20 USD |
| Révisions | ~10 actions, dont un tiers avec IA ou mini-recherche | 0,10–0,40 USD |
| **Voyage complet, à l'échelle** | | **~2,5–6 USD** |
| **Voyage complet, au pilote** (quotas Google gratuits) | | **~1–2 USD** |
| Aperçu (première journée) | | ~0,3–1 USD |

Quotas mensuels gratuits de Google, par SKU et sans mutualisation : 10 000 événements pour les SKU Essentials, 5 000 pour Pro, 1 000 pour Enterprise [11]. Les vérifications de lieux couvrent ainsi, selon les champs demandés, d'une dizaine à quelques dizaines de voyages par mois sans frais. La variante Gemini inclut 5 000 requêtes d'ancrage Maps gratuites par mois, puis 14 USD pour 1 000 [27]. Le cache de prompt (lecture à 10 % du prix d'entrée) et le traitement par lots (−50 %) réduisent encore les coûts IA [19]. Les coûts dominants au pilote restent le temps humain de vérification et l'acquisition.

### MRR : conventions

| Situation | Mesure |
|---|---|
| 100 voyages vendus à 49 CHF | 4’900 CHF de chiffre d'affaires ponctuel ; aucun MRR |
| 1’000 abonnements actifs à 120 CHF/an | 10’000 CHF de MRR normalisé |
| 100 agences × 3 conseillers × 69 CHF/mois | 20’700 CHF de MRR |

Le MRR normalisé des abonnements annuels ne correspond pas aux encaissements mensuels. Distinguer abonnés actifs, renouvellements, remises, remboursements et résiliations ; les commissions n'entrent pas dans le MRR.

Lecture : un particulier part en long voyage une à trois fois par an et dispose d'alternatives gratuites ; la vente par voyage peut produire un revenu, mais un MRR important passe plus probablement par les agences, qui planifient chaque semaine.

### Agences de voyages : axe de croissance B2B

**Produit :** un copilote de planification pour conseillers. Le conseiller saisit le brief du client, obtient un programme sourcé en quelques minutes, l'ajuste, y ajoute les prestations de l'agence, puis envoie une proposition à ses couleurs (lien et PDF). Le client consulte et commente.

**Pourquoi c'est cohérent :** même moteur et même interface ; une agence couvre toutes les destinations, ce qui confirme le choix d'une recherche par voyage plutôt qu'une bibliothèque ; un abonnement par conseiller est un revenu réellement récurrent.

**Exigences**, à prévoir dès le schéma et à construire après la bêta : organisations et rôles ; clients finaux sans compte ; marque blanche ; export PDF ; prestations de l'agence (vols, hôtels, excursions vendues, prix, notes) traitées par le moteur comme des étapes verrouillées ; historique des dossiers ; facturation par siège.

**Concurrence vérifiée :** Tern, plateforme tout-en-un (itinéraires, CRM, emails) avec IA agentique, facture environ 49 USD par siège et par mois avec un usage IA plafonné [24] et a levé 13 millions USD en 2025 [25]. Travefy couvre itinéraires, CRM, factures et commissions ; Axus est orienté collaboration avec les réceptifs [20] ; d'autres acteurs (mTrip) visent les grandes agences et les tour-opérateurs [26]. Ces outils, surtout anglophones, gèrent le dossier et les réservations ; leur IA importe et met en forme les contenus plus qu'elle ne recherche la destination.

**Positionnement recommandé :** un module spécialisé « recherche sourcée + programme jour par jour + événements datés », complémentaire de ces outils (lien et PDF aux couleurs de l'agence, intégrations plus tard), plutôt qu'un CRM concurrent. Cible de départ : agences indépendantes francophones (Suisse romande, puis France et Belgique).

**Hypothèse de prix :** 49–79 CHF par conseiller et par mois, cohérent avec le prix observé chez Tern ; essai sur des dossiers réels.

**Validation :** cinq entretiens d'agences indépendantes en phase 0 — combien de dossiers sur mesure par mois, temps passé par dossier, outils actuels, ce qui retarde l'envoi d'une proposition, budget outils, intérêt pour un essai payant. Pilote avec 1–2 agences en phase 3 si l'intérêt est confirmé.

**Hôtels :** même logique de marque blanche (« le programme de votre séjour, offert par l'hôtel »), piste secondaire non prioritaire.

## 5. Validation et ventes

Premier objectif : trouver des personnes ayant un voyage réel à préparer. Les compliments et inscriptions gratuites ne remplacent pas un achat.

**Saisonnalité :** entre octobre et décembre, les voyages préparés sont surtout des escapades urbaines, marchés de Noël et Nouvel An, riches en événements datés. Les voyages de printemps (Pâques le 28 mars 2027, Ascension le 6 mai, Pentecôte le 16 mai) se préparent surtout de janvier à mars : la bêta payante a intérêt à tomber sur cette fenêtre si le calendrier le permet. Les agences, elles, planifient toute l'année.

**Entretiens voyageurs :** comment as-tu organisé ton dernier voyage ? Qu'est-ce qui t'a pris du temps ? Qu'as-tu déjà payé pour gagner du temps ? Que reste-t-il à décider pour le prochain ? Qu'est-ce qui rendrait un programme inutilisable ? Peux-tu montrer un exemple de planning ? Présenter ensuite une offre concrète et demander une décision d'achat, sans orienter les réponses précédentes.

**Acquisition initiale :** réseau et recommandations ; forums et groupes de voyageurs francophones où les sollicitations sont autorisées ; quelques créateurs spécialisés ; pour les agences, contact direct d'agences indépendantes romandes. La page d'offre affiche un prix réel et un paiement réel, pas une simple liste d'attente. Samuel reste responsable des contacts et engagements.

**Démonstration commerciale :** un avant/après issu du benchmark — une journée trop chargée devient un programme adapté en quelques actions, avec un rendez-vous conservé.

**Seuils G0, à confirmer avant le pilote :** 30 prospects voyageurs contactés, au moins 10 échanges approfondis, au moins 5 achats ou préventes payés dont au moins 3 hors cercle proche. Côté agences, information sans condition de passage : nombre d'agences prêtes à un essai. Si l'offre ne se vend pas, modifier cible, promesse ou prix avant d'ajouter des fonctionnalités.

## 6. Architecture

### 6.1 Exigences qui pilotent l'architecture

| Exigence du projet | Conséquence |
|---|---|
| Recherche agentique de 1–3 minutes avec de nombreux appels externes, susceptibles d'échouer | Exécution durable : étapes reprenables, relances bornées, progression en temps réel |
| Fiabilité vérifiable : rien d'inventé, dates et horaires contrôlés | Séparer chercher, ancrer, planifier ; schémas stricts ; règles déterministes |
| Révisions en quelques secondes | Réserve de candidats pré-ancrés par voyage ; moteur local ; mini-recherche seulement si nécessaire |
| Carte riche, usage mobile pendant le voyage | Application web responsive installable (PWA), rendu en streaming |
| Coût variable par voyage, aperçu gratuit | Plafonds avant chaque appel, registre des coûts, modèle adapté à chaque étape, mémoire automatique |
| Voyageurs et agences | Multi-organisation, rôles et isolation dès le schéma |
| Modèles qui évoluent vite | Couche d'accès multi-fournisseurs ; choix par évaluation ; bascule en cas de panne |
| Données personnelles limitées, clients suisses et européens | Hébergement des données en région UE, sous-traitants inventoriés |
| Une personne et des agents de code | Monolithe modulaire, services managés, typage de bout en bout |

### 6.2 Principe directeur : l'agent cherche, l'ancrage vérifie, le moteur planifie

- **L'agent de recherche** trouve des candidats sur le web et les justifie avec leurs sources. Il n'écrit rien dans le programme.
- **L'ancrage** résout chaque candidat dans une API de lieux (identifiant, position, statut, horaires, niveau de prix) et relit la page source de chaque événement. Un candidat non résolu ou fermé définitivement est écarté.
- **Le modèle de sélection** choisit uniquement parmi les candidats ancrés, par identifiant.
- **Le moteur déterministe** calcule horaires, trajets, ouvertures, verrous et budget, puis valide. Toute révision est un patch appliqué à une version identifiée.

Ce découpage rend la fiabilité testable (§ 8), réduit le coût et limite les risques d'injection : aucun composant IA ne dispose d'un outil d'écriture. Aucune donnée Google n'est transmise aux modèles (§ 6.5).

### 6.3 Vue d'ensemble

```
Navigateur / PWA (mobile d'abord)
          │
          ▼
Application web
  interface · API · paiement
          │ déclenche et suit
          ▼
Workflows durables
  1 brief
  2 recherche web (agent)
  3 ancrage lieux et événements
  4 sélection (IA)
  5 planification + validation
          │
  ┌───────┼───────────────┐
  ▼       ▼               ▼
Modèles  Recherche web    Cartes
IA       + lecture pages  lieux · trajets
          │
          ▼
Postgres (UE)
  organisations · voyages · versions
  candidats · mémoire auto · coûts
```

### 6.4 Choix techniques

Chaque choix découle d'une exigence du § 6.1 ; état vérifié le 6 octobre 2026.

| Couche | Recommandation | Alternatives | Raison |
|---|---|---|---|
| Langage | TypeScript de bout en bout | Python pour l'agent | Schémas partagés entre interface, serveur et agent ; un seul outillage |
| Interface | Next.js (React), PWA | TanStack Start | Streaming, écosystème IA et cartographique le plus fourni |
| Carte | Google Maps JavaScript API | — | Les données Places ne peuvent pas être utilisées avec une carte non-Google [10] |
| Ancrage des lieux | Places API (New) : résolution par Text Search « IDs only », vérification par Place Details | Gemini avec ancrage Google Maps ; Foursquare, HERE | Couverture mondiale, statut et horaires à jour, résolution gratuite [11] |
| Trajets | Routes API, matrice de trajets (marche, voiture, transports publics) | Estimation par distance | Transports publics disponibles, 100 éléments par requête dans ce mode [12] |
| Exécution durable | Vercel Workflows | Inngest, Trigger.dev, Claude Managed Agents | Fonctions durables écrites comme du code normal, reprise après panne, intégration au SDK IA [13] |
| Accès aux modèles | AI SDK 6 (agents, sorties structurées, client MCP) + passerelle multi-fournisseurs | SDK natifs | Modèle par étape, bascule, comparaison des fournisseurs [15] |
| Recherche web | Outil natif du fournisseur retenu (chez Claude : 10 USD pour 1 000 recherches, lecture de pages sans surcoût) | Recherche ancrée de Gemini ; Brave, Exa, Tavily | Simplicité d'abord ; portabilité ensuite [19] |
| Base de données | Postgres managé en région UE (Supabase ou Neon), PostGIS, JSONB | — | Relationnel, géographique et documents versionnés au même endroit |
| Authentification | Solution avec organisations natives (Better Auth, Clerk ou WorkOS) | Tables maison | Agences sans refonte, invitations, rôles |
| Paiement | Stripe Checkout avec TWINT pour l'achat par voyage ; Stripe Billing par carte pour les abonnements | — | TWINT est un paiement unique, sans récurrence [18] |
| Observabilité | Sentry, traces IA (Langfuse ou OpenTelemetry), PostHog en région UE | Braintrust | Coût, latence et qualité par étape et par voyage |
| Hébergement | Vercel Pro, fonctions en région UE | Cloudflare, Railway | Le plan gratuit exclut tout usage commercial [17] |

### 6.5 Pipeline de génération

**Deux temps.** L'aperçu (8 propositions, cible de moins de 60 secondes) est généré avant paiement, avec son propre budget d'appels. Le reste du voyage est généré après le déblocage, en tâche de fond, pendant que l'utilisateur poursuit le tri. Les étapes ci-dessous valent pour les deux.

1. **Brief** — petit modèle, sortie structurée : voyageurs, rythme, envies, budget par repas, contraintes, questions manquantes.
2. **Plan de recherche** — déterministe avec un petit modèle : d'abord les incontournables de la ville ou de la région qui correspondent aux envies, sans filtre de distance ; puis les besoins par jour et par créneau (repas par niveau, soirées, temps libre, événements aux dates), autour des secteurs retenus ; budget d'appels du voyage.
3. **Recherche** — agent borné, en parallèle par zone et par catégorie : recherches web, lecture des pages, extraction structurée de candidats avec URL et date de source. Politique de sources : privilégier médias et guides locaux, critiques gastronomiques, sites officiels et agendas institutionnels ; pénaliser les listes génériques d'affiliation et les sources anciennes. Viser 3 à 5 fois plus de candidats que de créneaux.
4. **Ancrage** — déterministe : chaque nom trouvé est résolu en identifiant de lieu Google (Text Search « IDs only », gratuit) avec un biais géographique sur la zone du séjour, puis vérifié par Place Details (existence, position, statut d'ouverture, horaires, niveau de prix). Ces données servent au moteur et à l'affichage, jamais au modèle. Un candidat non résolu ou fermé définitivement est écarté. Événements : page source relue et date confirmée ; billetteries interrogées comme sources structurées [8].
5. **Squelette** — déterministe : logement de départ et d'arrivée, fenêtres disponibles, nombre d'activités selon le rythme, créneaux repas et soirée, répartition des secteurs par jour pour limiter les trajets, excursions sur une journée entière, budget de trajet du jour (§ 3.7).
6. **Sélection** — modèle intermédiaire, parmi les candidats ancrés uniquement, classés par adéquation et qualité moins un coût de trajet pondéré selon le type d'étape (§ 3.7), désignés par des identifiants internes et décrits par les résumés issus de la recherche web ; justification d'une ligne citant la source ; une idée « Surprends-moi ».
7. **Planification** — ordre des étapes, matrice de trajets (marche, transports publics, voiture), ouvertures, marges et temps libre.
8. **Validation** — règles R1–R10 (§ 8) ; au plus un appel de réparation ; violations restantes signalées dans l'interface.
9. **Enregistrement et affichage progressif** — version 1, rapport de validation, réserve de candidats non utilisés conservée pour les révisions.

Cibles : aperçu (première journée) en moins de 60 secondes, voyage complet en moins de 3 minutes.

**Règles Google Maps Platform appliquées (vérifiées le 6 octobre 2026) :**

- La Suisse ne figure pas dans la liste EEE de Google : avec une facturation suisse, ce sont les conditions mondiales qui s'appliquent [16]. Dans l'EEE, depuis le 8 juillet 2025, les données Places ne peuvent plus être affichées avec une carte, même Google, sauf via le Places UI Kit [16]. Ne pas déplacer la facturation vers une entité de l'EEE sans revoir l'interface.
- Les données Places peuvent être affichées sans carte, avec attribution, mais jamais avec une carte non-Google [10].
- Stockage : l'identifiant de lieu est conservable ; les coordonnées peuvent être mises en cache 30 jours au plus [10] ; les autres contenus (horaires, notes, prix) ne sont pas stockés. Le programme enregistre l'identifiant et le résultat de nos propres contrôles (« horaires compatibles, vérifiés le… ») ; la fiche détaillée d'un lieu est chargée à la demande. Le statut des données dérivées est à confirmer dans le texte officiel.
- Les conditions interdiraient d'utiliser les contenus Google pour entraîner, tester ou valider des modèles d'IA (source secondaire, à confirmer dans le texte officiel) [28] ; l'offre MCP de Google pour les LLM exige en outre un modèle qui ne met pas en cache, ne stocke pas et n'apprend pas de ces données [14]. D'où la règle d'architecture : **aucune donnée Google dans les prompts ni dans les jeux d'évaluation**. Le modèle sélectionne à partir des résumés de la recherche web et d'identifiants internes.
- Variante à évaluer : Gemini avec ancrage Google Maps natif. L'usage des données Maps y est encadré par Google, mais avec des règles de présentation strictes (pas de contenu intercalé dans le texte Google, sources Google affichées) à vérifier sur la version en vigueur [14, 29].

### 6.6 Pipeline de révision et apprentissage

Deux modes partagent le même moteur et les mêmes règles de validation.

**Tri par lot (présentation).**

1. Chaque geste crée un signal : lieu, catégorie, « j'aime » ou « pas pour moi », raison facultative. Un refus retire le lieu du brouillon.
2. Règles de généralisation : deux refus dans une catégorie déclenchent une question à l'utilisateur ; trois « j'aime » créent une préférence déduite, affichée et annulable. Seules les préférences confirmées ou affichées influencent la suite.
3. À la fin du tri ou au déblocage, recalcul des jours touchés : candidats de la réserve filtrés par les préférences, sélection, planification, validation, nouvelle version et résumé « ce qui a changé ». Une mini-recherche n'est lancée que si la réserve est épuisée.

**Révision unitaire (fiche étape).**

1. « Remplacer » ouvre le choix d'une raison (pas mon style, trop chargé, trop cher, trop loin, autre) et d'un souhait libre.
2. Les candidats viennent d'abord de la réserve du voyage, restreints au créneau, au trajet acceptable depuis les étapes voisines et au budget ; les lieux refusés sont exclus. « Trop cher », « trop chargé » et « trop loin » se résolvent par classement déterministe ; « pas mon style » et le souhait libre appellent le modèle ; une mini-recherche ciblée n'intervient que si la réserve est épuisée.
3. Le patch est appliqué à un brouillon, la journée est replanifiée et validée, puis l'aperçu des effets montre ce qui change et ce qui ne bouge pas.
4. À l'application, une nouvelle version n'est créée que si la version de base est toujours la version courante ; sinon, refus explicite et proposition de rejouer le patch.

Cibles : moins de 5 secondes depuis la réserve, moins de 45 secondes avec mini-recherche, recalcul par lot en moins de 60 secondes.

### 6.7 Mémoire automatique (pas une bibliothèque)

Personne ne la remplit, ne la corrige ni ne la maintient : elle se constitue comme sous-produit des recherches et expire seule.

- **Contenu :** identifiant de lieu Google (conservable), coordonnées pendant 30 jours au plus, nos propres résumés et étiquettes, URLs des sources, date de dernière confirmation, taux de garde et de refus par les utilisateurs (agrégés, anonymes). Aucun horaire, note ou autre contenu Google ; aucun texte recopié des sources.
- **Usage :** pour un nouveau voyage dans la même ville, les candidats récents sont réutilisés puis revérifiés via Place Details (statut, horaires) ; la recherche web complète ce qui manque.
- **Durée :** 60–90 jours pour les lieux (coordonnées rafraîchies après 30 jours) ; jusqu'à leur date pour les événements.
- **Effet :** génération plus rapide et moins chère sur les destinations fréquentes ; qualité améliorée par les retours réels.
- **Calendrier :** non requise pour le MVP ; activée en bêta si des destinations reviennent.

### 6.8 Modèle de données

Le programme est stocké comme un instantané JSON par version, validé par un schéma partagé entre interface et serveur, avec des identifiants d'étape stables entre versions. Toute donnée appartient à une organisation : un voyageur seul dispose d'une organisation personnelle.

| Entité | Contenu | Règle clé |
|---|---|---|
| organizations | personnelle ou agence ; marque blanche | toute donnée est rattachée à une organisation |
| memberships | utilisateur, organisation, rôle | rôles : propriétaire, conseiller |
| trips | organisation, créateur, client final éventuel, dates, version courante, droit d'accès | isolation par organisation |
| briefs | voyageurs, transport, rythme, envies, budget par repas, texte libre, questions | versionné |
| stays | logement ou quartier provisoire, nuits, heures d'arrivée et de départ, bagages | plusieurs par voyage |
| trip_versions | instantané, patch appliqué, rapport de validation, auteur, version parente | ajout seulement |
| research_runs | requêtes, pages lues, durée, coût, erreurs | traçabilité de chaque recherche |
| candidates | lieu ou événement trouvé pour un voyage : identifiant fournisseur, résumé maison, sources, confiance, statut d'ancrage | seuls les candidats ancrés sont sélectionnables |
| place_memory | identifiant fournisseur, résumé, étiquettes, sources, dernière confirmation, signaux de garde et de refus | expiration automatique |
| event_occurrences | lieu, début et fin, fuseau, catégorie, prix, source relue, confiance | occurrence distincte du lieu |
| feedback | cible, motif, texte, portée | jamais généralisé sans accord |
| preference_signals | voyage, lieu, catégorie, signal, raison, origine (geste, question, brief), statut (confirmé, déduit, annulé) | seules les préférences confirmées ou affichées sont utilisées |
| checklist_items | voyage, étape, type (réservation, billet), lien, statut | cochés par l'utilisateur |
| preferences | préférences explicites entre voyages | facultatives, modifiables, supprimables |
| share_links | jeton haché, expiration, révocation | non devinable, révocable |
| usage_ledger | fournisseur, unités, coût estimé, organisation, voyage | plafonds vérifiés avant chaque appel |
| billing | droits (aperçu, voyage débloqué), paiements, abonnements, sièges | idempotence par identifiant d'événement Stripe |

### 6.9 Couche IA

Point d'entrée unique pour tous les appels : prompts versionnés dans le dépôt, sorties structurées validées par schéma, identifiants de modèle en configuration. Le modèle de chaque étape est choisi par évaluation sur le jeu de référence (D5). Candidats d'octobre 2026 : Claude Haiku 4.5 (1 USD par million de tokens en entrée, 5 en sortie) pour le brief, l'extraction de pages et la classification des feedbacks ; Claude Sonnet 5.5 (2 et 10 USD) pour l'orchestration de la recherche et la sélection [19] ; Gemini avec ancrage Google Maps comme variante pour la découverte [27]. Un modèle supérieur seulement si les évaluations le justifient.

Pratiques retenues : agents bornés (nombre d'étapes et d'appels plafonné, condition d'arrêt explicite) ; cache de prompt pour les instructions stables (lecture à 10 % du prix d'entrée) ; traitement par lots à −50 % pour les évaluations [19] ; trace complète de chaque exécution (étapes, appels, tokens, coût, durée) ; vérification de plafond avant chaque appel (par voyage, organisation et jour) ; aucune donnée Google dans les prompts (§ 6.5).

### 6.10 Décisions d'architecture

| ADR | Décision | Raison | Révisable si |
|---|---|---|---|
| 01 | Monolithe modulaire TypeScript, workflows durables via Vercel Workflows | Une personne, tâches longues, aucune file d'attente à exploiter | Hébergement hors Vercel ou limite mesurée |
| 02 | L'agent cherche, l'ancrage vérifie, le moteur planifie | Fiabilité testable, coût, sécurité | — (fondateur) |
| 03 | Aucune bibliothèque gérée : recherche par voyage et mémoire automatique expirante | Demande produit, toutes destinations, agences | Qualité ou coût insuffisants sur une destination |
| 04 | Google Maps Platform pour l'ancrage, les trajets et la carte, facturé en Suisse | Qualité mondiale, transports publics, résolution gratuite | Conditions ou coûts défavorables ; variante Gemini plus performante |
| 05 | Programme versionné par patches, concurrence optimiste | Annulation, aperçu des effets, aucune perte silencieuse | — |
| 06 | Modèles interchangeables choisis par évaluation | Évolution rapide des modèles | — |
| 07 | Multi-organisation dès le schéma | Agences sans refonte | — |
| 08 | Plafonds de coût et traces par étape | Budget maîtrisé, diagnostic de qualité | — |
| 09 | Aucune donnée Google dans les prompts ni dans les évaluations | Conformité par conception, indépendance du fournisseur de modèle | Variante Gemini retenue, sous le cadre de Google |
| 10 | Génération en deux temps : aperçu, puis voyage complet après paiement | Coût de l'aperçu maîtrisé, attente masquée par le tri | — |
| 11 | Préférences explicites : aucune généralisation silencieuse, recalcul par lot | Confiance, cohérence du programme | Données de bêta montrant que les questions gênent |

### 6.11 Structure du dépôt

```
src/app         interface et routes API
src/domain      modèle, planificateur,
                validateurs, patches
src/workflows   génération, révision,
                vérification J-7
src/research    agent, politique de sources
src/grounding   lieux, trajets, événements
src/ai          prompts, schémas, modèles,
                coûts, traces
src/tenancy     organisations, rôles
db/             schéma, migrations, RLS, tests
evals/          voyages de référence, scripts
docs/           produit, architecture,
                sécurité, adr/
CLAUDE.md       instructions racine des agents
```

`src/domain` ne fait aucune entrée-sortie : il est entièrement testable sans réseau ni base.

## 7. Roadmap

Pas d'échéance : chaque phase s'achève quand sa condition de qualité est remplie, pas à une date. La validation commerciale reste en tête parce qu'elle coûte peu et oriente tout le reste. Si la disponibilité baisse, on réduit le périmètre, jamais la qualité.

| Phase | Contenu | Condition de passage |
|---|---|---|
| 0 — Valider | Benchmark sur voyages vécus ; prototype cliquable des wireframes testé avec 5 personnes ; page d'offre avec démo ; entretiens voyageurs et agences ; préventes ; 3–5 dossiers assistés ; prototype de l'agent de recherche (Claude et Gemini comparés) | **G0** : seuils du § 5 atteints ; prototype de recherche jugé exploitable sur Édimbourg ; présentation comprise sans explication par au moins 4 testeurs sur 5 |
| 1 — Construire le cœur | Tout le MVP du § 3.5 | **G1** : parcours complet sur 3 destinations ; R1–R10 verts ; aperçu en moins de 60 s ; coût conforme au § 4 ; taux de « pas pour moi » inférieur à 35 % sur le jeu de référence |
| 2 — Bêta payante | Au moins 10 voyages réels (préventes incluses), vérification humaine décroissante, mémoire automatique si des destinations reviennent, un canal d'acquisition | **G2** : au moins 8 programmes utilisables sur 10 ; 0 erreur critique livrée ; taux de « pas pour moi » inférieur à 25 % ; conversion aperçu → paiement mesurée |
| 3 — Décider le modèle | Test de prix, fonctions pendant et après le voyage, vérification à J-7, trier à deux, pilote agence si G0 l'a justifié | **G3** : libre-service, agences, les deux, pivot ou arrêt |

### Ordre de construction de la phase 1

Chaque bloc est testable seul avant de passer au suivant.

1. **Socle** : dépôt et CLAUDE.md, schéma multi-organisation et tests d'isolation, compte par email et code, paiement et webhook idempotent.
2. **Moteur sans IA** : modèle du programme, planificateur, validateurs R1–R10, visionneuse carte + journées sur des données de test.
3. **Recherche et ancrage** : agent borné, résolution des lieux, événements, traces et plafonds.
4. **Aperçu et présentation** : génération en deux temps, cartes, signaux, règles de généralisation, recalcul par lot, déblocage.
5. **Programme et révision** : aperçu du séjour, liste à réserver, journée, fiche, remplacement, verrou, versions, ajout et déplacement d'étape, export.
6. **Pendant et après** : prochaine étape, rappels, avis, mémoire des goûts sur accord.

## 8. Évaluation et qualité

**Jeu de voyages de référence :**

- Deux voyages vécus : Édimbourg et Zakynthos, dont la réalité terrain est connue.
- Les dossiers du pilote, avec l'accord des clients.
- Des cas limites : changement d'hôtel en milieu de séjour ; arrivée tardive ; dernier jour avec bagages ; événement unique à horaire fixe ; jour de fermeture hebdomadaire ; budget mixte (déjeuner économique, dîner exceptionnel) ; voyage sans voiture ; « pas de musée » comparé à un avis négatif sur un seul musée ; destination peu couverte par les sources ; aucune option compatible.
- Pour les agences : un dossier avec prestations vendues (vol, hôtel, excursion) qui doivent rester intactes.

**Règles déterministes, 100 % requis pour livrer :**

| # | Règle |
|---|---|
| R1 | Tout lieu du programme est ancré (identifiant fournisseur valide, non fermé définitivement) et possède au moins une source web |
| R2 | Aucun événement hors des dates du séjour ; tout événement « confirmé » a une page source relue mentionnant sa date |
| R3 | Les étapes verrouillées et les prestations vendues sont inchangées |
| R4 | Les horaires d'ouverture sont respectés, sinon l'étape est marquée « à confirmer » |
| R5 | Les trajets entre étapes sont faisables avec marge, sinon le conflit est signalé |
| R6 | Chaque journée part du bon logement et y revient ; le changement d'hôtel gère départ et bagages |
| R7 | Aucune suggestion (repas, soirée) n'est insérée sans choix de l'utilisateur |
| R8 | Le rythme choisi est respecté, avec un temps libre minimal |
| R9 | Le budget est calculé et distinct du niveau d'expérience |
| R10 | Un patch ne s'applique qu'à sa version de base, sinon il est refusé explicitement |

**Mesures de qualité :** taux de « pas pour moi » dans la présentation (mesure principale, cible inférieure à 25 % en bêta) ; note de pertinence de 1 à 5 par Samuel (pertinence, variété, rythme, justification, surprise) ; taux d'ancrage des candidats ; part de sources locales ou indépendantes ; taux de garde des suggestions ; couverture des incontournables qui correspondent aux envies ; temps de trajet par jour ; durée et coût par génération. Un second modèle peut repérer des incohérences mais ne remplace ni une donnée externe ni un contrôle déterministe.

Les évaluations tournent à chaque changement de prompt, de modèle ou de politique de sources, avec un plafond de coût par exécution ; les résultats sont conservés pour comparer les versions.

## 9. Sécurité, données et conformité

Priorités avant ouverture :

- Données isolées par organisation, permissions côté serveur doublées par RLS [4], tests d'isolation exécutés en CI.
- Liens de partage non devinables, hachés en base et révocables ; accès administrateur restreint avec double authentification ; secrets côté serveur ; séparation test/production ; clés Google restreintes par API et par domaine.
- Paiement confirmé côté serveur, signature des webhooks vérifiée, traitement tolérant aux doublons [5].
- Collecte minimale : ni passeport ni boîte email. Préférences modifiables, export et suppression, durée de conservation définie.
- Agent de recherche en lecture seule : recherche et lecture de pages, sans accès aux autres voyages ni aux secrets ; il ne reçoit du brief que ce qui est nécessaire.
- Contenu web traité comme des données, jamais comme des instructions ; sorties validées par schéma ; aucun outil d'écriture pour les modèles [6, 7].
- Lecture de pages via l'outil du fournisseur ou un service isolé protégé contre les requêtes vers des adresses internes (SSRF).
- Droit d'auteur : résumés rédigés par nos soins, liens vers les sources, aucune reproduction de textes.
- Plafonds applicatifs par génération, organisation et période ; budget d'appels par recherche ; limitation des requêtes ; plafonds de quotas côté Google.
- Sauvegardes avec test de restauration, retour à la version précédente, journaux sans données personnelles inutiles.

Conformité, à instruire avant commercialisation : loi suisse sur la protection des données et RGPD pour les clients de l'UE ; liste des sous-traitants dans la politique de confidentialité ; base de données en région UE ; règles Google appliquées au § 6.5, attribution Google affichée, et conditions d'utilisation répercutant les obligations de Google envers les utilisateurs finaux [10]. Conditions générales : informations indicatives et datées, réservations à la charge du voyageur, liens rémunérés signalés. Ne pas vendre de prestations combinées (transport + hébergement) pour rester hors du régime des voyages à forfait. Pour les agences : contrat de sous-traitance des données de leurs clients. Inscription au registre du commerce et TVA : seuils à vérifier.

**Tests de sortie :** un compte d'une organisation ne peut ni consulter ni modifier les voyages d'une autre ; un lien révoqué n'ouvre plus le voyage ; un paiement répété ne crédite pas deux fois ; une étape verrouillée est conservée ; une révision obsolète ne remplace pas silencieusement une version récente ; une page web contenant des instructions ne modifie pas le comportement de l'agent ; aucun prompt journalisé ne contient de donnée Google ; une erreur de fournisseur est visible et récupérable ; un dépassement de quota conserve le dernier programme valide.

## 10. Organisation des agents

### Agents du produit

| Responsabilité | Livrable | Contrôle |
|---|---|---|
| Comprendre | Brief structuré, hypothèses et questions manquantes | Schéma, correction par l'utilisateur |
| Rechercher | Candidats avec sources | Budget d'appels, politique de sources, ancrage |
| Sélectionner / réviser | Choix par identifiants ou patch | Moteur déterministe, R1–R10 |
| Vérifier | Conflits et incertitudes | Règles applicatives, contrôle humain au pilote |

Ces rôles sont des étapes d'un workflow borné ; seule la recherche est un agent outillé, avec un nombre d'appels limité.

### Agents qui construisent le produit

Workflow piloté par spécifications pour chaque fonctionnalité : spécification, plan, tâches, implémentation dans une branche, revue par un autre rôle avant fusion. Rôles : cadrage/UX, implémentation, QA et évaluation IA, sécurité et exploitation. Samuel garde les décisions produit, budget et engagement commercial.

CLAUDE.md contient le principe directeur (ADR-02), les commandes, les conventions et les interdits : aucun appel IA hors de `src/ai`, aucun lieu non ancré dans un programme, aucune requête sans organisation, aucune clé côté client, aucune migration sans politique RLS et test associé. Les détails restent dans `docs/` et ne sont chargés que lorsque la tâche les concerne.

## 11. Budget maximum proposé

Enveloppe jusqu'à la décision G3. Les dépenses commencent réellement en phase 1 : la phase 0 tient sur les offres gratuites, un domaine et quelques dollars de prototype. Total : **950 CHF**, sans obligation de dépenser la réserve.

| Poste | Plafond |
|---|---:|
| Domaine et frais initiaux | 30 CHF |
| Hébergement Vercel Pro (~4 mois) | 80 CHF |
| Base de données (plan payant pour la bêta, ~4 mois) | 100 CHF |
| Google Maps Platform au-delà des quotas gratuits | 60 CHF |
| IA et recherche web : prototype, développement, évaluations, voyages | 200 CHF |
| Traces, emails, supervision | 30 CHF |
| Tests d'acquisition et contenus | 100 CHF |
| Réserve : frais de paiement, remboursements, juridique léger, imprévus | 350 CHF |
| **Total** | **950 CHF** |

Vérifier tarifs, devises et taxes avant souscription ; réduire le périmètre si nécessaire.

## 12. Risques

| Risque | Impact | Réponse | Signal d'alerte |
|---|---|---|---|
| Les voyageurs ne paient pas face aux outils gratuits | Critique | Vendre avant de construire, benchmark, agences en parallèle | Moins de 3 achats après 30 contacts |
| Recherche web biaisée vers les adresses touristiques et les contenus optimisés pour le référencement | Qualité | Politique de sources, évaluation sur voyages vécus, signaux de garde et de refus | Pertinence moyenne < 3,5/5 |
| Évolution des conditions ou des prix de Google | Architecture, coût | ADR-09, couche d'ancrage isolée et remplaçable, plafonds de quotas | Annonce de changement de conditions |
| Données périmées (horaires, événements) | Confiance | Ancrage au moment de la génération, relecture des sources, vérification J-7 | Une erreur critique livrée |
| Coût par voyage supérieur aux estimations | Marge | Plafonds, modèles adaptés par étape, mémoire automatique | Plus de 6 USD par voyage complet |
| Aperçu offert détourné ou trop coûteux | Marge | Compte obligatoire, un aperçu actif par compte, budget d'appels dédié | Coût des aperçus supérieur à 30 % des coûts IA |
| Présentation jugée trop longue | Expérience | Plafond de cartes, regroupement par jour, « Passer » toujours visible | Taux d'abandon de la présentation supérieur à 40 % |
| Génération trop lente | Expérience | Parallélisation, affichage progressif, aperçu rapide | Plus de 3 minutes |
| Capacité de Samuel | Délais | Réduire le périmètre plutôt que la qualité, préventes pour valider sans construire | Deux semaines sous l'objectif d'heures |
| Agences déjà équipées (Tern, Travefy) | Stratégie | Positionnement complémentaire, différenciation mesurée sur leurs dossiers | Aucune agence prête à un essai après 5 entretiens |

## 13. Tableau de bord et prochaines actions

Suivre chaque semaine : heures réellement investies, prospects qualifiés (voyageurs et agences), offres faites, achats et préventes, provenance des clients, coût d'acquisition en argent et en temps, taux de passage de la présentation, taux de « pas pour moi », conversion de l'aperçu en paiement, nombre de révisions, réservations cochées, erreurs critiques, durée et coût par génération, taux d'ancrage, consommation des quotas Google, temps humain par dossier, remboursements et recommandations effectives.

**Prochaines actions, dans l'ordre :**

1. Choisir un nom de travail et son domaine (D1).
2. Lire le texte officiel des conditions Google sur l'interdiction liée à l'IA et sur les données dérivées ; créer le projet Google Cloud avec facturation suisse et plafonds de quotas.
3. Réaliser le benchmark sur Édimbourg, Zakynthos et le brief à changement d'hôtel.
4. Transformer les wireframes en prototype cliquable (présentation, déblocage, remplacement) et le tester avec 5 personnes.
5. Mettre en ligne la page d'offre avec démo, le formulaire de brief et le lien de paiement du pilote assisté.
6. Constituer la liste de 30 prospects voyageurs et tenir 5 entretiens ; lister des agences indépendantes romandes et tenir 2 entretiens.
7. Écrire le schéma JSON du programme et des signaux de préférence v0.1.
8. Lancer la direction artistique : 2–3 directions sur l'écran Journée, puis le design system (D13).

## Sources

Sources 1 à 8 : pages officielles consultées le 5 octobre 2026 (v0). Sources 10 à 29 : consultées le 6 octobre 2026 ; les sources secondaires (articles, comparatifs) sont signalées. Les cibles, prix, budgets, échéances et seuils restent nos propositions.

1. [Mindtrip — présentation de l'assistant](https://mindtrip.ai/)
2. [Layla — produit et FAQ](https://layla.ai/)
3. [Google Places — conservation des données et attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
4. [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
5. [Stripe — webhooks et sécurité](https://docs.stripe.com/webhooks)
6. [OWASP — Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
7. [OWASP — Excessive Agency](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
8. [Ticketmaster — Discovery API](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/)
9. [Wanderlog](https://wanderlog.com/) — non revérifié
10. [Google Maps Platform — conditions spécifiques aux services](https://cloud.google.com/maps-platform/terms/maps-service-terms)
11. [Google Maps Platform — grille tarifaire](https://developers.google.com/maps/billing-and-pricing/pricing)
12. [Routes API — usage et facturation](https://developers.google.com/maps/documentation/routes/usage-and-billing)
13. [Vercel Workflow — documentation](https://vercel.com/docs/workflow) ; [disponibilité générale, avril 2026](https://www.dutchitchannel.nl/news/730354/vercel-workflows-nu-officieel-beschikbaar) (secondaire)
14. [Google Maps Grounding Lite — conditions et attribution](https://developers.google.com/maps/ai/grounding-lite)
15. [AI SDK 6 — annonce Vercel](https://vercel.com/blog/ai-sdk-6)
16. [Google Maps Platform — FAQ des conditions EEE](https://developers.google.com/maps/comms/eea/faq)
17. [Vercel — conditions d'usage équitable](https://vercel.com/docs/limits/fair-use-guidelines)
18. [Stripe — TWINT](https://docs.stripe.com/payments/twint)
19. [Claude Platform — tarifs](https://platform.claude.com/docs/en/about-claude/pricing)
20. [Travefy — comparatif des logiciels d'agence 2026](https://travefy.com/blog-post/best-travel-agency-software) (secondaire, éditeur concurrent)
21. [Fast.io — outils IA de planification de voyage 2026](https://fast.io/resources/best-ai-for-travel-planning-2026/) (secondaire)
22. [Dupple — planificateurs IA testés en 2026](https://dupple.com/learn/best-ai-for-trip-planning) (secondaire)
23. [Layla — limites des planificateurs IA](https://layla.ai/es/blog/news-and-tips/can-ai-plan-my-whole-holiday)
24. [Comparatif des outils IA pour agents de voyage, dont prix de Tern](https://sagnikbhattacharya.com/blog/best-ai-tools-travel-agents) (secondaire)
25. [PhocusWire — lancement de l'IA agentique de Tern](https://www.phocuswire.com/news/technology/tern-launches-agentic-ai-travel-advisor-efficiency)
26. [mTrip — guide des constructeurs d'itinéraires 2026](https://www.mtrip.com/en/best-itinerary-builder-2026/) (secondaire, éditeur concurrent)
27. [Google Cloud — tarifs de l'ancrage Google Maps pour Gemini](https://cloud.google.com/vertex-ai/generative-ai/pricing)
28. [ConductAtlas — clause IA des conditions Google Maps Platform](https://conductatlas.com/platform/google-maps/google-maps-platform-terms-of-service/ai-and-ml-training-data-prohibition/) (secondaire)
29. [Google Cloud — conditions de l'ancrage Google Maps (archive 2025)](https://cloud.google.com/archive/terms/genai-preview-products-20250723)
