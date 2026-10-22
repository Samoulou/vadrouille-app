# E2E-essai — Une seule app, de « Créer un voyage » au programme jour par jour, sur le site d'essai

Rédaction : Product Owner · Date : 2026-10-22 · Ticket : #687 · `main` relu : `f6e9db8` · Règle de forme : décision 0123 (spécification courte, puis le code ; verdicts du Tech Lead et de la Sécurité dans la relecture de chaque PR) · Références : 0011, 0027, 0092, 0093, 0115, 0117, 0119 ; `specs/P0-programme-par-ia.md` ; `docs/handovers/frontend.md` § 6, § 10, § 11.

**Demande de Samuel** (2026-10-22 12:57 et 13:06 UTC) : tester l'app de bout en bout, « du brief de mon voyage au résultat final » ; « vadrouille doit devenir 1 seul app qui part "Créer un voyage" […] tout doit se connecter ».

## Objectif
Sur le site d'essai (préversion de `p0-reel`), Samuel touche « Créer un voyage », saisit **son** voyage, lance, suit la préparation, trie « J'aime / Pas pour moi », débloque (paiement **simulé**), puis lit son programme jour par jour dans « Mes voyages ». Sous le capot : la chaîne inversée de Rome (`p0Run`, 0115). Aucun fichier de brief à choisir, aucune page à part.

## Principe (Product Owner)
- **Une app, un adaptateur d'essai.** Sur le site d'essai, les écrans de l'app sont servis par l'adaptateur `prototype` (liste blanche `prototypeAdapterAllowed`, `src/dev/flags.ts` l. 37-45, préversion seulement), complété pour la création, l'avancement, l'aperçu et le déblocage simulé. Les écrans restent ceux de l'app, lus par `src/adapters` et `src/contracts`. L'identifiant `proto_…` n'est qu'une forme d'identifiant.
- **Pourquoi pas le modèle du MVP tout de suite** : il demande des décisions de Samuel encore ouvertes (Q538, Q551, Q556 ; `PLAFONDS_USAGE` = `null`, `src/server/config/usage.ts` l. 127 ; `BRANCHE_APPELS_REELS` = `null`, `src/server/config/generation.ts` l. 81 ; temps de trajet hors prototype, 0093 point 3) et la refonte de B7 à B9 (0115 § 5.5). Après le jugement de Samuel, l'inversion sera reportée dans le MVP et l'adaptateur d'essai disparaîtra (spécification à venir, ordre du CEO).
- **Ancienne chaîne** (`src/workflows/apercu.ts`, `complet.ts`, `recalcul.ts`) : **débranchée du parcours d'essai, non supprimée**. L'adaptateur `prototype` ne l'atteint jamais ; elle reste celle de `DATA_ADAPTER=api` (`src/adapters/api-creation-instance.ts`, `src/instrumentation.ts`, `src/server/creation/`, `src/server/generation/`), fermée aux appels réels, ses tests inchangés.
- **`/prototype/executions`** : retirée du parcours de Samuel (aucun lien depuis l'app), gardée pour les essais de référence (`rome-1`, `edimbourg-1`) et son rapport, tant que le CEO n'en décide pas autrement.
- **`RECALCUL_FIN_APERCU`** (`src/server/config/recalcul.ts` l. 13) : sans effet sur un voyage d'essai (B10b recalcule par le moteur sur une réserve que la chaîne inversée n'a pas, 0115 § 5.3) ; reste `false`.

## Constat sur `main`, écran par écran (site d'essai)
| Étape | Marche | Manque |
|---|---|---|
| Accueil | « Créer un voyage » (`src/app/page.tsx` l. 69-71) | Section « Prototype » à part (`src/app/page.tsx` l. 62-66, 79-82) |
| Écran 1 | Formulaire en mémoire (`src/features/creation/CreateTripForm.tsx`) | Aucun contrôle « une ville, connue de la table des fuseaux » (`src/lib/fuseaux/index.ts` l. 64) |
| Écran 2 | Récit, « Remplir moi-même » (`src/features/creation/BriefStory.tsx` l. 142, 161) | `structureBrief` (l. 77) lève sur `prototype` (`src/adapters/index.ts` l. 101-102) : bandeau d'erreur. **Le récit n'est jamais transmis au lancement** (`toBrief`, `src/features/creation/validation.ts` l. 217-229 ; `TripRequestSchema`, `src/contracts/creation.ts`) |
| Écran 3 | « Continuer sans logement » (`src/features/creation/LodgingScreen.tsx` l. 137, 161, 170) | `suggestLodging` lève de même : bandeau d'erreur |
| Compte | — | Aucune session possible sur le site d'essai ; la vraie garde est le code d'accès (cookie `__Host-p0_acces`, `src/server/p0/acces.ts`), saisi seulement sur `/prototype/executions` |
| Lancement | Idempotence, erreurs (`src/features/creation/LaunchStep.tsx`) | `createTrip` exige une session (`src/server/actions/creation.ts` l. 105) puis lève sur `prototype` ; `p0Run` n'accepte qu'un fichier commité (`BRIEFS`, `src/workflows/p0-run.ts` l. 107-116 ; `choixValide`, `src/server/p0/lancement.ts` l. 64-70 ; `briefDe(execution.brief)`, `p0-run.ts` l. 444 ; `runs_brief_check`, `db/migrations/0003_prototype.sql` l. 144) |
| Écran 5 | Écran et interrogation chaque seconde (`src/features/creation/generation.ts`) | `getGenerationStatus` lève sur `prototype` : erreur « avancement illisible » (`src/app/voyages/[id]/preparation/page.tsx` l. 52-53) |
| Tes premières propositions | — | Voyage écrit débloqué et sans propositions (`src/server/p0/assemblage.ts` l. 497, 500) ; `listPreviewSlots` vide (`src/adapters/prototype.ts` l. 419-421) |
| Présentation | Tri en mémoire (F6 ; `getDeckSession` nul, `src/adapters/prototype.ts` l. 423-425) | Paquet vide (`src/features/presentation/PresentationScreen.tsx` l. 343) ; actions du tri `internal` sur `prototype` (`src/server/actions/presentation.ts` l. 15) |
| Débloquer | Écrans du paiement simulé | `paymentAvailable` exige `DATA_ADAPTER=mock` (`src/adapters/payment-guard.ts` l. 39) : 404 (`src/app/voyages/[id]/debloquer/page.tsx` l. 25), bouton masqué (`src/app/voyages/[id]/presentation/page.tsx` l. 37) |
| Séjour, Journée, Pendant le voyage, « Mes voyages » | Lecture, positions, temps conservés, « à confirmer » à la lecture, attribution Google (`src/adapters/prototype-lecture.ts`, `src/adapters/prototype.ts` l. 397-439) | Rien de bloquant |

## Du formulaire au brief de la chaîne inversée (décision D1)
Brief attendu : `BriefSchema` (`src/prototype/brief.ts` l. 36-97), exemple `prototype/briefs/rome-1.json`. Conversion par une **fonction pure** `briefDepuisFormulaire(draft, brief, recit)`.

| Brief de l'essai | Saisie de l'app | Règle |
|---|---|---|
| `destination` | `draft.destination` | recopiée ; ville absente de la table des fuseaux : refus, champ `destination` |
| `pays` | absent | table maison ville → pays, à côté de `src/lib/fuseaux/villes.json` (jamais Google, jamais demandé) |
| `fuseau` | — | `fuseauDeVille(destination)` |
| `arrivee`, `depart` | `start`, `end` | recopiées ; plus de 15 jours : refus, champ `end` |
| `heureArrivee`, `heureDepart` | engagements `flight` | règle B5-PO-7 (`heuresDeVol`, `src/domain/squelette.ts` l. 73-84) ; sans vol : `09:00` et `22:30` (`src/server/config/moteur.json` l. 6) |
| `voyageurs` | `travellers` | recopiés |
| `rythme` | `pace` | `relaxed` → `tranquille`, `balanced` → `equilibre`, `intense` → `intense` |
| `envies` | `wishes` | recopiées |
| `deplacements` | `mobility` | recopiés ; vide → `walk`, `transit` |
| `budgetRepas` | `mealBudgetPerPerson` (CHF) | ≤ 25 → 1 ; 26-60 → 2 ; > 60 → 3 ; absent → absent |
| `logements` | `draft.lodging` | `known` → nom ; `area` → `« <quartier>, <destination> »` ; `none` → `destination` ; nuits = jours du séjour |
| — | `otherCities` | une seule ville : une autre ville refuse le lancement |
| `engagements` | `commitments` | `booking` → `reservation`, `ticket` → `ticket`, `flight` → heures ci-dessus ; `label` → `libelle`, `start` → `heure` |
| `recit` | `state.story` | recopié ; e-mail ou téléphone : refus, champ du récit |
| — | `limits` (« à éviter ») | transmises au lot 5 |

## Lots de code (ordre proposé au CEO)
Chaque lot est **une PR** et change quelque chose que Samuel peut cliquer. Les lots 1 et 2 ne touchent **aucun** fichier de #689 (`src/server/p0/`, `src/workflows/p0-run.ts`, `src/research/fetch-page.ts`, `src/ai/prompts/programme.ts`) et peuvent partir maintenant ; les lots 3 à 5 attendent la fusion de #689 et ne partagent jamais un cycle entre eux.

### Lot 1 — Tes premières propositions, présentation et déblocage simulé sur un voyage d'essai (front et back ; peut partir maintenant)
- **Objectif** : un voyage d'essai déjà écrit s'ouvre comme un voyage de l'app non débloqué : premières propositions, « J'aime / Pas pour moi », « Débloquer » avec paiement simulé, puis Séjour et Journées complets.
- **Fichiers** : `src/adapters/prototype.ts` (voyage lu `unlocked: false` tant que non débloqué ; `listPreviewSlots` et `listProposals` tirés du programme stocké à la lecture), `src/adapters/payment-guard.ts` et `src/adapters/index.ts` (paiement simulé admis avec `prototype` sur le site d'essai, jamais en production), `src/app/voyages/[id]/debloquer/*`, `src/app/voyages/[id]/presentation/page.tsx`, `src/features/presentation/*` (texte de fin du tri, D4), `src/i18n/fr/*`, tests unitaires, e2e 390 × 844, axe.
- **Critères** :
  1. Avant déblocage : `getTrip` rend `unlocked: false` ; l'aperçu compte **8 étapes au plus**, la première journée puis le début de la deuxième, dans l'ordre du programme (cadrage D11) ; seuls ses jours sont lisibles, les autres sont présentés comme à débloquer.
  2. « J'aime / Pas pour moi » trie en mémoire (F6) ; la fin du tri dit que les choix ne changent pas encore le programme (D4).
  3. Le paiement simulé n'appelle aucun prestataire ni n'envoie d'e-mail ; après lui, `unlocked: true`, toutes les journées, et l'état survit à un rechargement.
  4. `paymentAvailable` reste faux en production et hors de la liste blanche de `prototype` (test).
  5. Rien d'écrit en base sur la lecture ; aucun appel Google ni IA de plus que la lecture actuelle.
- **Points à trancher dans la relecture du code** : où garder l'état « débloqué » (cookie de l'essai, ou table `prototype` avec migration) — proposition : cookie signé lié au code d'accès, sans migration ; branchement de `withSimulatedUnlock` (`src/adapters/mock-unlock.ts`) sur `prototype` ; verdict de la Sécurité sur le paiement simulé hors `mock`.
- **À tester par Samuel** : ouvrir un voyage de Rome dans « Mes voyages », voir tes premières propositions, trier, toucher « Débloquer », payer en simulé, puis lire toutes les journées.

### Lot 2 — La saisie sans détour sur le site d'essai (front ; peut partir maintenant)
- **Objectif** : de l'accueil au lancement, aucune erreur ni autre page ; le code d'accès se saisit dans le parcours.
- **Fichiers** : `src/app/page.tsx` (section « Prototype » retirée), `src/features/creation/BriefStory.tsx`, `LodgingScreen.tsx`, `CreateTripForm.tsx`, `validation.ts`, `LaunchStep.tsx`, `src/server/actions/creation.ts` (`structureBrief` et `suggestLodging` fermés **sans appel** sur `prototype`), saisie du code d'accès réutilisant `src/features/prototype/SaisieCodeAcces.tsx` avec retour au lancement, `src/i18n/fr/*`, tests.
- **Critères** :
  1. Écran 2 : sur le site d'essai, le bouton principal mène à la vérification avec le récit gardé, sans bandeau ; écran 3 : « Pas encore » propose « Continuer sans logement » sans bandeau (D2).
  2. Écran 1 : une autre ville ou une ville hors table est refusée au champ, avec un message.
  3. `structureBrief` et `suggestLodging` sur `prototype` : zéro appel de modèle et de Google (client simulé).
  4. Sans cookie d'accès valide, `R-lancer` mène à la saisie du code puis revient, brouillon gardé (D3).
  5. Tant que le lot 3 n'est pas fusionné, `R-lancer` affiche « Le lancement depuis l'app arrive bientôt » au lieu d'une erreur.
- **Points à trancher dans la relecture** : libellés et place de la saisie du code (UX/UI).
- **À tester par Samuel** : de l'accueil, « Créer un voyage », remplir les écrans 1 à 3 sans message d'erreur ni détour, jusqu'au lancement.

### Lot 3 — Mon brief lance le programme (data, back, front ; après #689)
- **Objectif** : le lancement de l'app démarre `p0Run` sur le brief saisi et mène à l'écran 5, qui suit la préparation jusqu'au voyage.
- **Fichiers** : migration du schéma `prototype` (brief saisi lié à l'exécution, purgé avec elle, politiques `org_prototype`, `runs_brief_check` amendé, migration inverse) ; module pur de conversion (tableau ci-dessus) et table des pays ; `src/contracts/creation.ts` (récit porté par `TripRequest`) ; `src/adapters/index.ts` et un `CreationAdapter` `prototype` (`createTrip`, `getGenerationStatus`) ; `src/server/p0/lancement.ts` (point d'entrée commun avec `/prototype/executions`, même garde : code d'accès, `P0RUN_COMPLET`, verrou S8, réservation, `briefTientDansLeMode`) ; `src/workflows/p0-run.ts` (lecture du brief saisi) ; `src/features/creation/LaunchStep.tsx` (vers l'écran 5) ; tests `tests/db/` et unitaires.
- **Critères** :
  1. Conversion : le brouillon de Rome (Rome, 04 au 08.05.2027, 2 adultes, `balanced`, envies et récit de `rome-1.json`, quartier « Rione Monti », sans vol) donne `rome-1.json` sauf les heures (`09:00`, `22:30`) et `pays` (table) ; chaque refus du tableau rend son champ, **sans réservation**.
  2. Une exécution porte un nom de fichier admis **ou** un brief saisi, jamais les deux ni aucun ; la purge supprime le brief avec l'exécution ; le brief et le récit ne sont dans aucun journal.
  3. Sans code d'accès valide ou garde fermée (production, autre branche, `P0_REAL_RUNS` absent) : refus sans connexion à la base. Nature `essai` (fusible 2 USD, 0093).
  4. La requête `programme` reçoit le récit entre les bornes de données, `zdr: true` (0117 S5) ; test canari « aucune donnée Google dans le prompt » vert avec un brief saisi.
  5. Écran 5 : `en_cours` → en préparation ; `programme_ecrit` → prêt, « Voir mes propositions » et « Passer, voir le programme » ; `arretee` → échec, « Réessayer » (une exécution sans programme ne compte jamais, 0093 point 2) ; autre organisation ou inconnu → `not_found`.
  6. Les essais `rome-1` depuis `/prototype/executions` marchent comme avant.
- **Points à trancher dans la relecture** : forme du brief saisi (table liée ou colonne) ; identifiant du voyage connu au lancement (aujourd'hui calculé à l'écriture, `p0-run.ts` l. 703) ; correspondance phases → `GenerationStatus` ; verdict de la Sécurité sur le stockage du récit de Samuel (la règle « briefs commités seulement » de 0115 et 0117 § 5 point 3 devient « brief saisi sous code d'accès, site d'essai ») et sur les noms de l'IA envoyés à Text Search avec un récit réel (0117 § 2).
- **À tester par Samuel** : saisir ton propre voyage, lancer, suivre l'écran 5, puis ouvrir tes premières propositions et ton programme.

### Lot 4 — « Pas pour moi » change le programme (ia, back ; après le lot 3)
- **Objectif** : à la fin du tri (ou au déblocage), une rédaction de **révision** reçoit les textes de l'IA du programme et les choix de la personne, puis la même vérification Google et les mêmes trajets ; une nouvelle version remplace la précédente.
- **Fichiers** : nouveau prompt versionné dans `src/ai/prompts/`, `src/workflows/p0-run.ts` (ou un workflow voisin), `src/adapters/prototype.ts`, `src/features/presentation/*` (le texte du lot 1, critère 2, disparaît), tests, jeu d'évaluation hors réseau.
- **Critères** : l'entrée de la révision ne contient que des textes de l'IA et des choix : aucun `placeId`, position, temps, badge ni verdict d'ancrage (test canari) ; une étape « Pas pour moi » est absente de la nouvelle version ; coût compté dans le fusible fixé par Samuel (question 1).
- **Points à trancher dans la relecture** : révision comme nouvelle exécution liée au programme ou étape d'une exécution ; verdict de la Sécurité sur l'entrée (sans exception à 0011 § 1, 0117 § 3 voie (i) par analogie).
- **À tester par Samuel** : dire « Pas pour moi » à une étape de tes premières propositions et la voir remplacée dans ton programme.

### Lot 5 — « À éviter » transmis à l'IA (ia ; après #689, peut passer avant le lot 4)
- **Objectif** : toutes les saisies vont à l'IA (demande de Samuel, 0115 § 2) : les catégories « à éviter » entrent dans l'entrée du prompt `programme`.
- **Fichiers** : `src/ai/prompts/programme.ts` (nouvelle version), `src/prototype/brief.ts`, `src/server/p0/vers-couche-ia.ts`, conversion du lot 3, `evals/programme/`, tests.
- **Critères** : l'entrée porte `aEviter` quand la personne en saisit, absent sinon ; test canari vert ; le jeu d'évaluation mesure qu'aucune étape ne relève d'une catégorie « à éviter ».
- **À tester par Samuel** : cocher une catégorie « à éviter », lancer, et ne plus la trouver dans ton programme.

## Règles qui valent pour tous les lots
Aucune donnée Google dans un prompt ; rien de Google stocké hors `placeId`, sauf les coordonnées 30 jours (`place_coordinates`, 0027) et les temps de trajet du programme dans le schéma `prototype` (0092) ; carte Google seulement. Le studio ne lance aucun appel payant (essais simulés seulement) ; Samuel seul lance un essai réel. Rien en production. Vocabulaire du handover (§ 10) : « J'aime / Pas pour moi », « Débloquer », « Tes premières propositions », « À confirmer ». e2e mobile 390 × 844 et axe pour chaque écran touché.

## Hors périmètre
Production ; vrai paiement, vrai e-mail, vraie connexion ; ouverture de l'ancienne chaîne en préversion (Q538, Q551, Q556 sans objet pour ce test) ; plusieurs villes ; suggestion de logement et structuration du récit sur le site d'essai ; « Remplacer une étape », « Ajouter un lieu », « Surprends-moi », partage sur un voyage d'essai.

## Décisions (Product Owner, définitives dès la fusion, 0093)
- **D1** Conversion du formulaire vers le brief de l'essai : tableau ci-dessus (heures par défaut `09:00` et `22:30`, seuils du budget, logement `none` = la destination, déplacements vides = marche et transports, pays par table maison). Une seule ville, connue de la table ; 15 jours au plus.
- **D2** Sur le site d'essai, ni structuration du récit ni suggestion de logement : aucun appel, aucun bandeau ; le récit va tel quel à l'IA.
- **D3** Sur le site d'essai, le code d'accès tient lieu de compte ; il est demandé dans le parcours.
- **D4** Le voyage d'essai suit le parcours de l'app : non débloqué jusqu'au déblocage simulé, aperçu de 8 étapes au plus (jour 1 puis jour 2), présentation, déblocage, journées. Le programme est écrit entier dès le lancement (site d'essai seulement). Tant que le lot 4 n'est pas livré, la fin du tri dit que les choix ne changent pas encore le programme.
- **D5** Le recalcul de B10b et `RECALCUL_FIN_APERCU` ne s'appliquent pas aux voyages d'essai ; l'effet du tri y passe par une révision écrite par l'IA (lot 4).
- **D6** L'ancienne chaîne est débranchée du parcours d'essai, non supprimée ; `/prototype/executions` reste hors parcours pour les essais de référence.

## Questions (par destinataire, ne bloquent pas les lots 1 à 3)
**Samuel**
1. Une révision après le tri (lot 4) est un nouvel appel payant déclenché par ton tri : elle compte dans le même fusible de 2 USD que l'essai, ou a-t-elle le sien ? Recommandation : le même fusible. Bloque le lot 4.
2. Pour le MVP, l'aperçu avant paiement reste-t-il généré à part (coût contenu, cadrage D11 et « deux temps »), ou la chaîne inversée peut-elle écrire tout le voyage avant le paiement ? Ne bloque rien ici (site d'essai : voyage entier, D4).

**CEO** : ordre des lots ; sort final de `/prototype/executions` ; Q538, Q551, Q556 marquées sans objet pour ce test, gardées pour le report dans le MVP.
