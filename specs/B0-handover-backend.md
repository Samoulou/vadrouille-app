# B0 — Handover back-end

Rôles : product-owner (fonctionnel) et tech-lead (architecture, Q14) · Prérequis : aucun (roadmap, ligne 6) ; s'appuie sur F1 livrée dans `main` (#11) · Ticket : #15 · Référence : `docs/produit/cadrage-v5.md` (§ 1 D4 à D14, § 3.1, § 3.3, § 3.4, § 3.7, § 4, § 6.1 à § 6.11, § 7 « Ordre de construction de la phase 1 », § 8, § 9), `docs/handovers/frontend.md` (§ 0, § 3, § 6, § 8, § 9, § 12, § 13, § 16, § 17), `src/contracts` et `src/adapters` (livrés par F1), `specs/F1-contrats-donnees-simulees.md`, `docs/decisions/0002-hebergement-vercel.md`, `docs/CONTEXT.md` (principes techniques, « Qui décide quoi »), `QUESTIONS.md` (Q2, Q3, Q4, Q5, Q6, Q8, Q9, Q14, Q17, Q22)

## Objectif
Écrire `docs/handovers/backend.md`, le pendant back-end du handover front-end : un document qui permet à des agents `backend`, `data` et `ia-recherche` de construire, après G0, l'API, la base, l'authentification, les workflows et le paiement en mode test, et de brancher l'adaptateur `api` sans toucher à l'interface ni aux contrats sans décision écrite.

B0 est une tâche de documentation. Elle ne produit ni code, ni migration, ni compte, ni clé. Elle fixe ce qui doit être décidé, par qui, et comment on vérifiera chaque bloc.

## Répartition du travail
| Partie du handover | Rédige | Décide |
|---|---|---|
| Parcours, droits d'accès, règles fonctionnelles, contenus des contrats d'écran, backlog | Product Owner | Product Owner (rubrique « Décisions » ci-dessous, puis § 15 du handover) |
| Stack, structure, schéma, RLS, intégration Better Auth, workflows, adaptateurs, répartition des champs (Q14), tests | Tech Lead | Tech Lead, par décisions écrites dans `docs/decisions/` (statut, date, décideur) |
| Comptes externes, dépenses, juridique (Q5, Q6), conservation des données, production | — | Samuel : le handover les liste dans un tableau « Engagements externes » et ne les tranche pas |

Une même PR porte le handover et les décisions du Tech Lead. Elle reçoit la revue du Tech Lead (libellé `techlead-approved`) ; le Product Owner relit la partie fonctionnelle.

## À livrer
- `docs/handovers/backend.md`, avec les sections ci-dessous, dans cet ordre.
- Une décision par choix d'architecture dans `docs/decisions/` (numéros libres suivants, 0005 et au-delà si 0004 reste la dernière), au minimum : stack serveur et versions (ORM, migrations, base de test locale), application de la RLS, intégration Better Auth, exécution durable et portabilité, répartition des champs (Q14).
- Aucun autre fichier modifié (ni `src/`, ni `STATUS.md`, ni `QUESTIONS.md`, ni `docs/roadmap.md`).

### Contenu attendu de `docs/handovers/backend.md`

**§ 0. À lire en premier.** Mission ; règles d'or du back-end, au minimum :
1. L'agent cherche, l'ancrage vérifie, le moteur planifie (cadrage § 6.2) ; aucun composant IA ne dispose d'un outil d'écriture.
2. Aucune donnée Google dans un prompt, un journal, une trace ou un jeu d'évaluation ; seul l'identifiant de lieu Google est stocké durablement.
3. Toute donnée appartient à une organisation ; l'organisation vient de la session, jamais d'un paramètre envoyé par le client.
4. Données uniquement via `src/contracts` (Zod) côté serveur comme côté interface ; aucun texte d'interface dans les données (handover front § 9).
5. Clés de test uniquement ; aucune clé ni secret dans le dépôt ; aucune mise en production.
6. Aucun stockage ni API propres à Vercel (KV, Edge Config) : Postgres pour les données (ADR 0002).
7. Toute écriture du programme est un patch sur une version identifiée (R10) ; l'historique est en ajout seulement.

**§ 1. Sources de vérité.** Tableau des documents et ordre de priorité en cas de conflit (cadrage > décisions `docs/decisions/` > handover back > handover front pour ce qui concerne les données).

**§ 2. Stack et conventions (Tech Lead).** Route handlers ou actions serveur Next.js, ORM et outil de migration, base Postgres locale pour le développement et la CI (sans compte externe), version de chaque outil (décision écrite), conventions de nommage (tables en `snake_case`, contrats en `camelCase`), gestion des variables d'environnement (serveur sans préfixe `NEXT_PUBLIC_`).

**§ 3. Structure du dépôt (partie back).** Réconcilie la structure du cadrage § 6.11 (`src/domain`, `src/workflows`, `src/research`, `src/grounding`, `src/ai`, `src/tenancy`, `db/`, `evals/`) avec celle du handover front § 3 et l'existant (`src/contracts`, `src/adapters`, `src/mocks`). Règles d'import vérifiables par ESLint, au minimum : `src/domain` sans entrée-sortie (ni réseau, ni base, ni `process.env`) ; `src/ai` n'importe jamais `src/grounding` ; `src/app` et `src/features` n'importent pas `db/` directement.

**§ 4. Contrats serveur.**
- Tableau des points d'accès : pour chaque écran du handover front § 6, la route ou l'action, la méthode, le contrat d'entrée, le contrat de sortie, le rôle requis, l'idempotence, les erreurs possibles.
- Réutilisation des schémas de F1 (`TripSchema`, `DaySchema`, `ProposalSchema`, `ChangeSchema`…) sans copie ; tout nouveau contrat est listé dans un tableau « Contrats à créer » avec la tâche qui le crée : `TripDraft`, `Brief`, `LodgingSuggestion`, `GenerationStatus`, `PreferencePrompt`, `Offer`, `AdjustmentSummary`, `ReplacementPreview`, `PlaceSearchResult`, `MoveOptions`, `Today`, `TripSummary`, `TripReview`, `SharedTrip`, plus les contrats propres au serveur (erreur commune, patch, décision de présentation, signal de préférence, événement de paiement).
- Format d'erreur commun (code stable, message non affiché tel quel, champ concerné) et correspondance avec les états du handover front (§ 6, « États »).
- Concurrence : toute écriture sur un voyage porte la version de base ; une version obsolète renvoie un conflit explicite et la proposition de rejouer (R10, cadrage § 6.6).
- Évolutions de contrats demandées par Q14 ou par les décisions ci-dessous : liste des changements, effet sur `src/mocks/edimbourg.ts` et sur les composants, tâche qui les applique.

**§ 5. Répartition des champs : stockés, chargés à la demande, calculés (Q14, Tech Lead).** Un tableau couvre **chaque champ** de chaque schéma exporté par `src/contracts` et lui attribue une seule catégorie :
- *stocké* : contenu maison (résumé rédigé par nous, résultat de nos contrôles datés, choix de l'utilisateur) ou identifiant de lieu ;
- *chargé à la demande* : contenu Google obtenu côté serveur à l'affichage, jamais persisté, affiché sur la carte Google ou avec la mention d'attribution ;
- *calculé* : par le moteur (`src/domain`) ou par l'interface (formatage).

Le tableau tranche au minimum `Stop.name`, `Stop.meta`, `Stop.verifiedAt`, `Stop.placeId`, `Day.title`, `Day.weekday`, `Day.travelMinutes`, `Day.travelBudgetMinutes`, `Segment.minutes`, `Proposal.context`, `Proposal.photoUrl` (suit Q6) et `ChecklistItem.when` (voir la décision PO-2). Il dit pour les durées de trajet issues de Routes API et pour les coordonnées (cache de 30 jours au plus, cadrage § 6.5) ce qui est conservé et combien de temps. Ce qui dépend de l'interprétation juridique des « données dérivées » est marqué « provisoire, suit Q5 ».

**§ 6. Schéma Postgres multi-organisation (Tech Lead).**
- Tables du cadrage § 6.8 (`organizations`, `memberships`, `trips`, `briefs`, `stays`, `trip_versions`, `research_runs`, `candidates`, `event_occurrences`, `feedback`, `preference_signals`, `checklist_items`, `preferences`, `share_links`, `usage_ledger`, `billing`) et tables de Better Auth ; `place_memory` décrite mais marquée « bêta » (cadrage § 6.7).
- Pour chaque table : colonnes, clés, `organization_id NOT NULL` (sauf tables d'authentification justifiées), index, politique RLS, données personnelles oui ou non.
- RLS : activée et forcée sur toutes les tables métier ; rôle applicatif sans `BYPASSRLS` ni propriété des tables ; mécanisme qui transmet l'organisation de la session à la base ; permissions serveur doublées par la RLS (cadrage § 9).
- `trip_versions` en ajout seulement (aucune mise à jour ni suppression autorisée par la base), instantané JSONB validé par `TripSchema`, identifiants d'étape stables entre versions, version parente, patch, rapport de validation, auteur.
- `share_links` : jeton haché, expiration, révocation. `billing` : idempotence par identifiant d'événement Stripe (contrainte d'unicité).
- Liste des colonnes interdites (aucune colonne pour note, avis, horaires d'ouverture, photo, téléphone, adresse ou niveau de prix Google) ; coordonnées seulement si le § 5 le prévoit, avec date d'expiration.
- Région UE de la base (exigence) ; le choix du fournisseur et le compte relèvent de Samuel (tableau « Engagements externes »).

**§ 7. Authentification et organisations (Better Auth, Q4 tranchée par Samuel).** Intégration conçue par le Tech Lead :
- connexion par email et code à 6 chiffres, sans mot de passe (cadrage D8, écran 4) : greffon Better Auth retenu, durée de validité du code, nombre d'essais, limitation des envois ;
- organisations et rôles natifs : correspondance avec `propriétaire` et `conseiller` (cadrage § 6.8) ; organisation personnelle créée à la première connexion (décision PO-3) ; organisation active de la session ;
- passage de la session à `AdapterContext` (`src/adapters/types.ts`) et à la RLS ;
- adaptateur `auth` pour le front (handover front § 17, point 3) ;
- envoi des emails : en local et en CI, transport de test sans fournisseur externe ; le fournisseur réel relève de Samuel ;
- accès administrateur avec double authentification (cadrage § 9), décrit mais hors MVP si le Tech Lead le juge ainsi.

**§ 8. Workflows durables (Tech Lead pour l'exécution, Product Owner pour les règles).** Un tableau d'étapes par workflow, avec pour chaque étape : type (déterministe, IA, appel externe), contrat d'entrée et de sortie, présence de données Google (oui ou non : « oui » interdit pour une étape IA), plafond de coût vérifié avant l'appel (`usage_ledger`), relances bornées, idempotence, état publié dans `GenerationStatus`. Workflows couverts :
1. **Recherche et génération de l'aperçu** (cadrage § 6.5, étapes 1 à 9) : 8 propositions, cible de moins de 60 s, budget d'appels propre ;
2. **Ancrage** : résolution « IDs only » puis vérification Place Details, côté serveur, avec la clé serveur Places/Routes (prévue avec P0, Q3) ; candidat non résolu ou fermé définitivement écarté ;
3. **Planification et validation** : moteur `src/domain`, règles R1 à R10 (cadrage § 8), au plus un appel de réparation ;
4. **Génération du voyage complet** après déblocage, en tâche de fond ;
5. **Recalcul par lot** après la présentation et **révision unitaire** (cadrage § 6.6), avec les cibles de durée (moins de 5 s depuis la réserve) ;
6. **Paiement en mode test** (§ 9 ci-dessous).

Exécution durable : Vercel Workflows (cadrage D7) isolé derrière `src/workflows`, portabilité selon ADR 0002 (où vit l'état des étapes, comment le remplacer hors Vercel, région de cet état). Le prototype P0 (ia-recherche) alimente ce chapitre sans être recopié.

**§ 9. Paiement en mode test.** Stripe Checkout, TWINT et carte (cadrage § 6.4) : création de la session côté serveur, prix lu dans la configuration (29 CHF, Q2, jamais en dur), montants en centimes et devise CHF dans les données, webhook à signature vérifiée, traitement idempotent par identifiant d'événement, droit « voyage débloqué » accordé seulement par le webhook. Clés de test uniquement, et seulement quand Samuel aura ouvert le compte. Jusque-là, un adaptateur de paiement simulé (celui de F9) suit le même contrat.

**§ 10. Règles Google.** Reprise du cadrage § 6.5 et du handover front § 8, chaque règle avec le test qui la vérifie :
- seul `placeId` est stocké durablement (test de schéma : aucune colonne interdite) ;
- aucun prompt ne contient de donnée Google : le constructeur de prompts n'accepte que des types maison (identifiants internes et résumés de la recherche web), et un test parcourt les prompts journalisés ;
- aucun jeu d'évaluation (`evals/`) ne contient de donnée Google ;
- données de lieux affichées seulement avec la carte Google ou la mention « Données de lieux : Google » ;
- clé serveur distincte de la clé navigateur, restreinte par API ;
- statut des données dérivées : « provisoire, suit Q5 ».

**§ 11. Adaptateurs `src/adapters`.** Adaptateur `api` qui implémente `TripAdapter` (et ses extensions) ; adaptateurs `auth` et `payment` ; choix par `DATA_ADAPTER` et variables équivalentes ; une même suite de tests de contrat exécutée sur `mock` et sur `api` (isolation par organisation comprise).

**§ 12. Sécurité et conformité.** Chaque « test de sortie » du cadrage § 9 rattaché à une tâche du backlog ; contenu web traité comme des données ; lecture de pages protégée contre la SSRF ; journaux sans données personnelles inutiles ; inventaire des données personnelles par table ; durées de conservation renvoyées à Samuel.

**§ 13. Observabilité et coûts.** `usage_ledger`, plafonds par génération, organisation et jour, traces par étape ; services externes (Sentry, traces IA, PostHog UE) listés dans les engagements externes, non ouverts.

**§ 14. Engagements externes.** Tableau : service, usage, région des données, coût, statut « à décider par Samuel ». Au minimum : Postgres UE (Supabase ou Neon), envoi d'emails, Stripe (mode test), clé serveur Places/Routes, fournisseurs de modèles, Vercel Pro et Workflows, observabilité.

**§ 15. Décisions et backlog.** Rappel des décisions de cette spécification et de celles du Tech Lead ; backlog ordonné `B1`, `B2`… aligné sur l'« Ordre de construction de la phase 1 » du cadrage § 7 (socle : schéma et tests d'isolation, compte, paiement et webhook ; puis moteur sans IA ; recherche et ancrage ; aperçu ; révision), avec rôle, prérequis (tâches et questions) et critères d'acceptation. Chaque tâche porte la mention « après G0 ».

**§ 16. Hors périmètre** et **§ 17. Questions ouvertes** (sans les trancher).

## Décisions (Product Owner, définitives sans veto de Samuel sous 2 jours)
- **PO-1 — Budget de trajet par rythme (Q8).** Valeurs de départ, hors excursion : 60 min par jour pour un rythme tranquille, 90 min pour un rythme équilibré, 150 min pour un rythme intense (cadrage § 3.7). Elles sont lues dans une configuration serveur, recopiées dans `Day.travelBudgetMinutes`, jamais codées dans l'interface ni dans le moteur. Une réponse « oui » à « On reste plus près de ton hôtel ? » réduit le budget du voyage d'un quart (arrondi aux 5 min), une seule fois par voyage, de façon visible et annulable. Calibrage en bêta.
- **PO-2 — Moment d'un élément « À faire avant de partir » (Q22).** Un élément de la liste a un moment d'un de ces trois genres : une date limite (date ISO, par exemple la date d'ouverture d'une billetterie), « avant le départ » (sans date), ou un jour du voyage (indice du jour, avec « à l'arrivée » pour le J1). Les données portent ce moment sous forme structurée ; les libellés (« la veille », « à l'arrivée », « avant le 15.08 ») sont produits par l'interface. La forme exacte du contrat est fixée par le Tech Lead au § 5 ; F1 garde son texte libre en attendant.
- **PO-3 — Organisation personnelle.** À la première connexion, une organisation personnelle est créée ; la personne en est propriétaire. Au MVP, l'interface ne montre ni nom d'organisation ni sélecteur ; l'espace agence reste hors périmètre.
- **PO-4 — Déblocage par voyage.** Le paiement débloque un voyage, pas un compte. Les 8 propositions offertes restent accessibles sans paiement (handover front, écran 9). Un second paiement du même voyage ne crée pas un second droit.
- **PO-5 — Annuler.** Annuler une modification (5 secondes) crée une nouvelle version identique à la précédente ; aucune version n'est supprimée.
- **PO-6 — Aperçu incomplet.** Si moins de 8 propositions sont ancrées, l'aperçu montre celles qui existent et un état « aucune option compatible » pour le reste ; il n'est jamais complété par un lieu non ancré (R1).
- **PO-7 — Lien privé.** Un lien privé est en lecture seule, valable jusqu'à 30 jours après la fin du voyage, révocable ; en créer un nouveau révoque le précédent.

## Critères d'acceptation
Chaque critère se vérifie par une commande ou par une lecture ciblée, notée dans la PR de B0.
- [ ] `docs/handovers/backend.md` existe et contient les sections § 0 à § 17 dans l'ordre ci-dessus (`grep -n '^## ' docs/handovers/backend.md`).
- [ ] Chaque contrat cité au § 4 est exporté par `src/contracts/index.ts` ou figure dans le tableau « Contrats à créer » avec sa tâche (vérification par script : liste des noms en `PascalCase` du § 4 comparée aux exports).
- [ ] Le tableau du § 5 compte une ligne par champ de chaque schéma exporté par `src/contracts` (vérification par script qui lit les formes Zod et cherche `Schéma.champ` dans le tableau), chacune avec une seule catégorie ; les champs de Q14 cités ci-dessus sont tranchés.
- [ ] Chaque table métier du § 6 a `organization_id NOT NULL` et une politique RLS décrite ; toute exception est justifiée.
- [ ] Le § 6 interdit nommément les colonnes de contenu Google ; aucune colonne `rating`, `opening_hours`, `photos`, `phone`, `price_level` ou équivalent n'apparaît dans le schéma décrit.
- [ ] Chaque workflow du § 8 a son tableau d'étapes ; aucune étape de type IA n'a « oui » dans la colonne « données Google ».
- [ ] Chaque règle du § 10 et chaque test de sortie du cadrage § 9 est rattaché à un test nommé et à une tâche du backlog.
- [ ] Le § 7 décrit la connexion par code à 6 chiffres, les rôles `propriétaire` et `conseiller`, la création de l'organisation personnelle et le passage de l'organisation de la session à `AdapterContext` et à la RLS.
- [ ] Le § 9 n'accorde le droit « voyage débloqué » que par le webhook signé, idempotent par identifiant d'événement ; le prix vient de la configuration.
- [ ] Chaque décision du Tech Lead est un fichier de `docs/decisions/` avec statut, date et décideur.
- [ ] Le tableau du § 14 liste au moins les sept engagements cités, tous au statut « à décider par Samuel » ; aucun compte n'a été ouvert pour B0.
- [ ] KV et Edge Config n'apparaissent que comme interdits (`grep -n -i 'kv\|edge config' docs/handovers/backend.md`).
- [ ] Aucun secret ni clé dans le document (`grep -n -E 'sk_(test|live)_|AIza|whsec_' docs/handovers/backend.md` ne renvoie rien).
- [ ] Toutes les tâches du backlog du § 15 portent la mention « après G0 », un rôle, des prérequis et des critères.
- [ ] Les décisions PO-1 à PO-7 sont reprises au § 15 ; aucune question réservée à Samuel (Q5, Q6, Q9, comptes, dépenses, conservation des données) n'est tranchée.
- [ ] La CI (documentation seule) est verte et la PR porte `techlead-approved`.

## Hors périmètre
- Tout code (`src/`, `db/`, migrations, workflows, adaptateur `api`) : tâches B1 et suivantes, après G0 (roadmap : le CEO ne dépasse pas la ligne 6 en phase 0).
- Ouverture de tout compte ou service payant (base, emails, Stripe, Google, modèles, observabilité, Vercel Pro) ; toute clé, même de test, tant que Samuel ne l'a pas fournie ; toute mise en production.
- Vercel KV, Edge Config et toute API propre à Vercel dans le code métier (ADR 0002).
- La réponse juridique aux règles Google (Q5) et aux photos (Q6) ; les prix (Q2 tranchée, révisable par Samuel) ; les durées de conservation des données.
- Le contenu du prototype de recherche (P0, rôle ia-recherche) ; la mémoire automatique (bêta) ; la vérification à J-7, l'espace agence, la marque blanche (phase 3).
- Les modifications de `src/contracts` et de `src/mocks` qu'entraîneront Q14 et PO-2 : décrites dans B0, appliquées par une tâche suivante.

## Questions ouvertes
- Q4 : tranchée par Samuel (Better Auth) ; B0 en conçoit l'intégration.
- Q5 (Samuel, juridique) : statut des données dérivées et de l'interdiction liée à l'IA ; les lignes concernées des § 5 et § 10 restent « provisoires ».
- Q6 (Samuel) : source des photos ; `Proposal.photoUrl` reste « provisoire » au § 5.
- Q9 (Samuel) : clé Gemini de P0 ; le § 8 ne dépend pas de son issue.
- Q14 (Tech Lead) : tranchée dans B0, § 5.
- Q8 et Q22 (Product Owner) : tranchées ci-dessus (PO-1, PO-2).
- Q17 (Product Owner, partie données) : la représentation d'un repas « pas encore choisi », de `locked` et de `kind: "event"` sera fixée avec la spécification de F5 ; le § 4 réserve la place dans les contrats sans la trancher.
- Nouvelles questions (numérotées par le CEO dans `QUESTIONS.md`) :
  1. Samuel — fournisseur Postgres en région UE (Supabase ou Neon) et ouverture du compte : bloque B1 hors poste local, pas B0.
  2. Samuel — fournisseur d'envoi des codes de connexion (compte externe, sous-traitant de données personnelles) : bloque la connexion réelle, pas B0.
  3. Samuel — compte Stripe en mode test avec TWINT : bloque le paiement de test, pas B0 (adaptateur simulé en attendant).
  4. Samuel — durées de conservation des voyages, briefs et comptes (cadrage § 9 « durée de conservation définie ») : bloque la purge et la politique de confidentialité.
  5. Tech Lead, puis Samuel si l'état sort de l'UE — région de stockage de l'état des Vercel Workflows, qui contient le brief (données personnelles) : bloque le choix final d'exécution durable au § 8.
