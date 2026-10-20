# 0103 — Verdict de la Sécurité sur les questions 1 à 5 de 0094 (lots 2 à 4 de l'amendement 3) et avis sur la question 6

Statut : **verdicts et exigences de la Sécurité** (« Qui décide quoi » de `docs/CONTEXT.md` : contrôle des chemins sensibles `db/`, `src/ai/`, `src/research/`, des données Google et des données personnelles), à lister dans la note de version suivante (rubrique « Décisions prises par le studio ») ; définitive dès sa fusion selon la règle en vigueur sur `main` (décision 0093) ; Samuel peut la remettre en cause à tout moment. Elle ne tranche rien de réservé à Samuel (argent, compte externe, clé, mise en production, juridique, stratégie produit) ni rien de délégué à un autre rôle : la part du CEO (questions 2 et 4) et le choix du Product Owner (question 6) restent des **questions** à la fin.

Date : 2026-10-20 · Décideur : Sécurité · Question : Q508 (`QUESTIONS.md`) · Décision examinée : `0094-amendement-3-lots-2-a-4.md` (#516, fusionnée) · Décisions liées : 0011 (§ 1, § 2, § 6, § 7), 0046 (D15 point 3, S1, S2, S4, D24, verdict P0-Q32), 0072 § 5, 0075, 0099, PR #505 (revues consolidées des heads `ecacb65`, `d9d7702` et `438a027`)

Numéro : **0103**, libre sur `main` (dernière décision fusionnée : 0101) et dans les PR ouvertes (0102 est prise par la PR #557).

État relevé : `main` à `88e7875`, le 2026-10-20. Les faits ci-dessous sont lus dans le code et dans les tests de cette révision, pas dans le texte de 0094.

## Verdicts

| Question de 0094 | Verdict | Résumé |
|---|---|---|
| 1 | **Oui sous conditions** | La table `prototype.run_secteurs` est admise : contenu fermé, écrit avant tout ancrage, sans lien avec un résultat Google. Le verdict repose sur le contenu, pas sur le nom. |
| 2 | **Oui sous conditions** (part Sécurité) | Les cinq compteurs entiers complètent 0072 § 5 ; la liste est aussi régularisée pour `deadlineStop` et `errorName` (ticket 407). Citation à la note de version : part du CEO. |
| 3 | **Oui sous conditions** | Les compteurs de jours au rapport de `p0Run`, calculés à l'affichage sur les seuls labels du programme stocké. Aucun compteur de l'agent ou du plan n'entre au rapport. |
| 4 | **Oui sous conditions** (part Sécurité) | Un mot du logement peut cesser d'être protégé **seul** s'il est un mot d'un nom du plan validé ; jamais pour deux mots du logement qui ne sont pas dans un même nom du plan. Ordre et ticket porteur : part du CEO. |
| 5 | **Oui sous conditions** | Le contrôle des nombres de `prix` et `horaires` contre le texte de la page lue, en mémoire, avec échec fermé. |
| 6 (avis seulement) | (c) favorable ; (d) neutre sous conditions ; (a) défavorable | Le choix revient au Product Owner. |

## Faits vérifiés contre `main`

1. **`prototype.run_candidates`** (`db/migrations/0003_prototype.sql`, § 4.6) : colonnes `id`, `organization_id`, `run_id`, `cle`, `candidat` (jsonb), `place_id`, `expires_at` ; `CHECK` `run_candidates_candidat_check` sur les dix clés actuelles de `CandidatSchema` ; valeurs posées par le déclencheur `run_candidates_set_values` (`id`, `organization_id`, `expires_at` = maintenant + 24 h) ; RLS activée et forcée ; politiques de `vadrouille_prototype` liées à l'uuid fixe et à `expires_at > now()` ; `INSERT` par colonnes (`run_id, cle, candidat, place_id`) et `DELETE`, aucun `UPDATE` ; purge par `prototype.purge_expired()` (liste de tables écrite en dur, remplacée par une migration chaque fois qu'une table s'ajoute : voir `0011_trajets_prototype.sql`).
2. **Garde de nom** : `tests/db/schema.test.ts` (test `schéma: aucune colonne dérivée de Google`, dernier bloc) refuse toute table de `public` et `prototype` dont le nom correspond à `(plan|work|scratch)`. `run_secteurs` ne correspond pas.
3. **Suppression des candidats** : `src/adapters/prototype-travail.ts` supprime les lignes de `run_candidates` dans `remplacerCandidats` et dans `cloreExecution` (exécution arrêtée). `ecrireProgramme` (`src/adapters/prototype-ecriture.ts`) ne les supprime pas : après `programme_ecrit`, elles restent jusqu'à l'expiration de 24 h. Voir le constat A.
4. **Journal** : `p0.research_done` (`src/server/log.ts`) admet `sectors`, `mustSees`, `mustSeesWithoutCandidate`, `candidatesGrouped`, `sectorUnknown` par `entierPositif` (entier sûr ≥ 0 ; toute autre valeur est retirée et comptée dans `dropped`), testés par `tests/unit/server/limiteur.test.ts`. La ligne est écrite par `journaliserRecherche` (`src/workflows/p0-run.ts`) à la fin de l'étape de recherche, avec des compteurs de `chercherCandidats` (`src/research/agent.ts`) calculés sur la sortie des modèles, avant toute position ou fiche. La liste contient aussi `deadlineStop` (entier) et `errorName` (`NOM_ERREUR` : 40 lettres au plus), venus du ticket 407, que 0072 § 5 ne cite pas.
5. **Rapport** : `src/server/p0/rapport.ts` est pur, calculé à l'affichage sur `ExecutionSuivie` et le contenu stocké du programme ; ses critères sont `oui` / `non` / `non relevé` ; il ne lit ni `run_candidates` ni le journal (garde `p0: run_candidates lue par aucun rapport`, `tests/unit/p0/base-prototype.test.ts`). Le texte du rapport est collé par Samuel dans `docs/produit/p0-executions.md`, **fichier d'un dépôt public** (P0S2-PO-7) : il est donc durable.
6. **Filtre des requêtes** : `requeteSansDonneeDuBrief` (`src/research/agent.ts`) refuse une requête qui contient un mot entier de 3 caractères ou plus d'un logement ou d'un libellé d'engagement, hors mots de la destination et du pays. Le plan et la recherche ne voient jamais les logements (`briefPourRecherche`, `src/ai/requetes.ts` ; test dans `tests/unit/p0/composition.test.ts` : « logements » absent des messages d'étapes `plan` et `recherche`) ; ils voient le récit (flux accepté par Samuel, Q427). Les quatre cas « quartier seul », « nom d'hôtel seul », « numéro et rue » et « cyrillique, quartier » du test y sont **voulus** : le quartier du logement est protégé comme son nom.
7. **Pages lues** : `chercherCandidats` garde le texte intégral de chaque page lue dans `pagesTexte` (mémoire, le temps de l'étape) et l'utilise déjà pour `dateConfirmee: texte !== undefined && dateMentionnee(texte, …)`. `prixParPersonneAdmis` exige un `prix` en CHF pour un montant positif mais ne vérifie pas que le montant est un nombre du texte (mineur 5 de #505, déjà noté).
8. **Contrat et base du MVP** : `StopFactsSchema` (`src/contracts/trip.ts`) a trois clés ; `STOP_FACTS_KEYS` (`db/jsonb-keys.ts`) en a trois ; `candidates_facts_check` (`db/schema/business.ts`) ferme `candidates.facts` sur ces trois clés ; la vue partagée est construite champ par champ par `src/adapters/share-projection.ts` et, côté base, par `public.shared_facts` (`0001_securite.sql`), qui émet trois clés écrites à la main. `prototype.programmes` ne ferme que les clés de premier niveau du programme (`programmes_contenu_check`). `CandidatTrouve` (`src/research/candidat-trouve.ts`) refuse déjà `facts.area` pour le MVP.
9. **Migrations** : `db/migrations/meta/_journal.json` s'arrête à `0012_creation_voyage` ; `0011_trajets_prototype` (#507, fusionnée) et `0012` sont dans `MIGRATIONS_APPROUVEES` de `.github/workflows/db-migrate.yml`. Le prochain numéro libre est **0013**.

## Décision

### Question 1 — Plan de secteurs gardé entre les étapes : `prototype.run_secteurs`

**Verdict : oui sous conditions.**

**Pourquoi c'est admissible.** 0011 § 7 garde « le plan » en mémoire et 0046 D15 point 3 écrit pour `run_candidates` « jamais de verdict, motif, compteur ni plan ». La raison est la même dans les deux textes : le plan des jours, l'ordre, les horaires, l'ensemble retenu et le rapport de validation **dépendent de l'ancrage**, donc de Google. Le plan de secteurs de 0094 § 2 est d'une autre nature : des noms issus de notre recherche web et du modèle de plan, écrits **avant** tout ancrage, qui ne contiennent ni ne dépendent d'aucune donnée Google (même régime que les `candidat` de `run_candidates`). Le verdict complète donc la phrase « jamais … plan » de 0046 D15 point 3 pour **ce contenu seulement** ; il ne l'ouvre pas au plan des jours.

**Le nom ne fait pas le verdict.** Le nom `run_secteurs` évite la garde de nom, mais le contenu reste un plan au sens ordinaire du mot. Le verdict repose donc sur les conditions de **contenu** ci-dessous, testées sur le contenu, et la garde de nom reste inchangée, sans exception. Un autre nom qui correspondrait à `(plan|work|scratch)` (la question Q508 écrit `run_plans`) serait refusé par la garde : le nom est `run_secteurs`.

**Conditions.**

1. **Contenu fermé.** Une ligne par exécution (`UNIQUE (run_id)`, clé étrangère composite `(organization_id, run_id)` vers `prototype.runs`). Colonne `secteurs` (jsonb) : un objet dont la seule clé est `secteurs`, tableau de 9 éléments au plus ; chaque élément n'a que `nom`, `voisins` (tableau de textes), `incontournables` (tableau de textes) ; longueurs bornées par `LONGUEURS_TEXTE` ; taille totale bornée (`pg_column_size`). `CHECK` en base sur les clés **à chaque niveau** (comme `run_candidates_candidat_check`, avec `db/jsonb-keys.ts`). Refusés par la base : `raison`, `requetes`, `jour`, `rang`, `ordre`, `horaire`, `retenu`, `verdict`, `lat`, `lng`, `placeId`, tout compteur. Une clé conservée que l'étape finale ne lit pas n'est pas stockée (par exemple `incontournables`, si le moteur lit le champ `incontournable` du candidat enrichi : au Tech Lead de trancher, la Sécurité demande seulement qu'une clé écrite soit une clé lue).
2. **Écrit une fois, avant tout ancrage.** L'écriture a lieu dans `etapeRecherche` (phase `recherche`), jamais plus tard, jamais modifiée (aucun `UPDATE` ; un remplacement est un `DELETE` suivi d'un `INSERT` dans une transaction, comme `remplacerCandidats`). Le contenu est une **fonction de la sortie de l'agent seule** : deux exécutions de même sortie de recherche, l'une où tout s'ancre et l'autre où rien ne s'ancre, écrivent la même ligne.
3. **Positions en mémoire seulement** (0094 § 2 point 3, confirmé) : ni centre de secteur, ni distance, ni appartenance, ni voisinage vérifié, ni affectation aux jours dans la table, dans l'état du workflow (qui reste `{ runId }`), dans un journal ou dans le rapport.
4. **Valeurs posées par la base (S1).** `id`, `organization_id` et `expires_at` (maintenant + 24 h) par déclencheur `BEFORE INSERT` qui **écrase** toute valeur fournie ; absents des droits `INSERT` par colonnes (`run_id`, `secteurs` seulement).
5. **Droits (S2, D15 point 6).** RLS activée et forcée ; politiques de `vadrouille_prototype` liées à l'**uuid fixe** (jamais `app_current_org()`) et, en lecture, à `expires_at > now()` ; `SELECT`, `INSERT` par colonnes et `DELETE` pour `vadrouille_prototype`, **aucun `UPDATE`** ; `vadrouille_fn_prototype_purge` : `SELECT (expires_at)`, `DELETE` et politiques sur les lignes expirées ; aucun droit pour `vadrouille_app`, `PUBLIC` ni aucun autre rôle ; aucun droit sur le schéma `prototype` pour `vadrouille_app` (test existant).
6. **Purge.** `prototype.purge_expired()` est **remplacée** par la même migration, sous son propriétaire `vadrouille_fn_prototype_purge`, même signature, même `search_path`, mêmes `REVOKE` et `GRANT EXECUTE` que dans `0011_trajets_prototype.sql` ; la ligne expirée est supprimée comme celles de `run_candidates`.
7. **Suppression.** La ligne est supprimée dans `cloreExecution` avec les candidats. À `programme_ecrit`, voir le constat A : la Sécurité demande que `run_candidates` et `run_secteurs` soient supprimés dans la transaction de `ecrireProgramme` ; à défaut, le plan reste au plus 24 h, lisible par `vadrouille_prototype` seul et par aucun rapport, ce qui est accepté pour `run_secteurs` (aucune donnée Google, aucun lien avec l'ancrage) et ne l'est pas pour `run_candidates` (constat A).
8. **Lecture.** Un seul module nomme la table : `src/adapters/prototype-travail.ts`, importé par `src/workflows/p0-run.ts` seul. Aucun rapport, script ni autre module de `src/` ne la nomme. La relecture est validée par le schéma du plan restreint aux clés stockées (0094 § 2 point 1) ; une ligne absente ou invalide est une erreur fermée, jamais un plan par défaut inventé (le code d'arrêt est la question 8 du Product Owner).
9. **Migration.** Un fichier (candidat enrichi et table ensemble, 0094 § 1 point 5), numéro **0013**, avec `.down.sql` et instantané `meta/`, écrit sous `SET LOCAL ROLE vadrouille_owner`, relu par la Sécurité sur la grille de `0011_trajets_prototype.sql`. Les migrations déjà fusionnées ne sont pas modifiées (leur empreinte est dans `MIGRATIONS_APPROUVEES`) : le commentaire « jamais … plan » de `0003_prototype.sql` § 4.6 reste, complété par la présente décision. L'application à la base d'essai reste une PR de workflow à part (`owner-approved` de Samuel) ou la tâche C de 0093 (décision 0099), comme 0094 § 1 point 5 le dit ; ce verdict ne l'accorde pas.
10. **Mode simulé.** Inchangé : le plan reste en mémoire (`pnpm p0`, tests). Si une condition ci-dessus ne peut pas être tenue, la table n'est pas créée et 0094 § 2 point 2 s'applique.

**Tests attendus** (en plus de ceux de 0094 § 10) :

- `base: run_secteurs, clés fermées à chaque niveau` : chaque clé refusée de la condition 1, un dixième secteur, un type erroné, une taille excessive ;
- `base: valeurs fournies par l'appelant refusées ou ignorées` étendu à `run_secteurs` (`expires_at` lointain, `organization_id` d'une autre organisation, `id` fourni) ;
- `base: vadrouille_prototype avec un autre app.organization_id ne lit ni n'écrit hors d'org_prototype` étendu ; `tests/db/roles.test.ts` : `PROTOTYPE_TABLES` et droits par table (`run_secteurs: SELECT, INSERT par colonnes, DELETE`, aucun `UPDATE`), `vadrouille_fn_prototype_purge` ;
- `schéma: aucune table de plan de travail` **inchangé, sans exception** ; `schéma: RLS activée et forcée partout` et `schéma: aucune fonction ni table du schéma prototype accessible à PUBLIC` verts avec la table ;
- `p0: plan de secteurs, clés fermées et purge` (0094 § 10) ; `p0: plan de secteurs supprimé avec une exécution arrêtée` ;
- `p0: plan de secteurs indépendant de l'ancrage` (condition 2 : même ligne avec ancrage total et nul ; aucune écriture de la table hors de `etapeRecherche`) ;
- `p0: aucune position dans le plan de secteurs, l'état du workflow, le journal ni le rapport` (sentinelles de position, condition 3) ;
- `p0: run_secteurs lue par aucun rapport` : la garde `p0: run_candidates lue par aucun rapport` étendue à la nouvelle table, avec le même module nommé (condition 8).

### Question 2 — Les cinq champs de `p0.research_done` et 0072 § 5

**Verdict : oui sous conditions** (part Sécurité). `sectors`, `mustSees`, `mustSeesWithoutCandidate`, `candidatesGrouped` et `sectorUnknown` complètent la liste fermée de 0072 § 5. Ce sont des entiers, sans nom, calculés sur la sortie des modèles avant toute position, fiche ou résultat d'ancrage (fait 4) ; aucun ne varie avec le nombre de candidats résolus ou ancrés, donc la règle de 0011 § 2 et S4 de 0046 ne sont pas touchées. Régularisation de même nature : `deadlineStop` (entier ≥ 0, fin sur échéance, ticket 407, aucune dépendance à Google) et `errorName` (nom de classe filtré par `NOM_ERREUR`) sont dans le code sans ligne de 0072 § 5 ; la présente décision les admet aux mêmes conditions.

**Conditions.**

1. La liste reste fermée : tout champ ajouté plus tard à `p0.research_done` passe par un verdict de la Sécurité. Le lot 2 n'en ajoute aucun (0094 § 9) ; un compteur de « champs retirés » du contrôle de la question 5, ou de tout autre contrôle, est un champ de plus et demande son verdict.
2. La ligne reste écrite par l'étape de recherche, avant l'ancrage, avec des valeurs de l'agent seulement.

**Tests attendus.** Existants et suffisants pour la forme : `ticket 407 : deadlineStop …` et `amendement 3 (P0S2-PO-25) : %s …` de `tests/unit/server/limiteur.test.ts`, `la liste des événements est fermée`. À ajouter : `p0: compteurs de recherche indépendants de l'ancrage` (`tests/unit/workflows/p0-run-finale.test.ts` : même sortie de recherche, ancrage total puis nul, ligne `p0.research_done` identique champ par champ).

**Part du CEO.** Citer la liste complète dans la note de version suivante (rubrique « Décisions prises par le studio »), `deadlineStop` et `errorName` compris.

### Question 3 — Compteurs de jours au rapport de `p0Run`

**Verdict : oui sous conditions.** Les trois compteurs de labels (jours à un, deux, plus de deux labels) et le compteur des jours à plus d'un changement de label sont admis au rapport d'exécution de `src/server/p0/rapport.ts`. Ils sont une fonction du **programme écrit**, que S4 admet (point (i)) et que les critères A1, A2 et A6 lisent déjà ; ils ne dépendent pas du déroulement de l'exécution au-delà de son issue. Le rapport étant copié dans un dépôt public (fait 5), les conditions sont strictes.

**Conditions.**

1. **Source unique : le contenu stocké du programme** (`facts.area` des étapes, avec les exclusions de P0S2-PO-22 : logement, événements, idée). Le rapport ne lit ni `run_candidates`, ni `run_secteurs`, ni le journal, ni une position, ni une fiche.
2. **Quatre entiers, rien d'autre** : pas de label, pas de liste par jour, pas de jour nommé. Les quatre nombres ne dépassent pas le nombre de jours du séjour.
3. **Exécution sans programme écrit : « non relevé »**, et la même valeur quelle que soit la cause d'arrêt. Jamais `0`, qui distinguerait une issue d'une autre (S4).
4. **Aucun compteur de l'agent ou du plan au rapport de `p0Run`** (`secteur_sans_jour`, secteurs, incontournables, `candidat_regroupe`, `secteur_inconnu`, `incontournable_sans_candidat`) : ils n'existent qu'en mémoire et dans le journal, et les écrire exigerait une colonne de `prototype.runs`, dont la liste est fermée (D24). Le rapport simulé (`scripts/p0/rapport.ts`, mode simulé, sans base) peut les porter ; celui de `p0Run` non, sans nouveau verdict.
5. **Aucune nouvelle colonne** de `prototype.runs`, `forfaits` ni `programmes`.

**Tests attendus.** `p0: rapport sans donnée Google` étendu (sentinelles : aucun label, nom ni position dans le texte du rapport) ; `p0: compteurs de jours égaux pour deux exécutions de même programme` (compteurs calculés du seul contenu) ; `p0: rapport d'une exécution arrêtée, compteurs « non relevé » pour chaque code d'arrêt` ; `p0: run_secteurs et run_candidates lues par aucun rapport` ; `p0: aucun compteur d'ancrage en base` (0046 D24) inchangé et vert ; `qualite: compteurs du rapport` (0094) limité à ces quatre entiers pour `p0Run`.

### Question 4 — Filtre `requeteSansDonneeDuBrief` : mot du logement qui est aussi un nom du plan

**Verdict : oui sous conditions** (part Sécurité). Le filtre protège le logement parce qu'une requête part chez le moteur de recherche du fournisseur, hors du réglage `data_collection: "deny"` (fait 6). Lever la protection d'un mot qui est **déjà** un mot d'un nom du plan ne crée aucun flux nouveau : ce mot partirait dans une requête issue du plan, que le modèle de plan a écrit **sans voir le logement**. L'exemption n'est valable que tant que cette indépendance tient.

**Conditions.**

1. **Seul le plan validé compte.** L'exemption porte sur un mot du logement qui est, après la même normalisation que le filtre (`cleRequete`), un **mot entier** d'un nom de secteur ou d'incontournable du plan lu et validé par son schéma strict. Un nom de candidat, un titre ou un extrait de résultat web, une page lue ne lèvent aucune protection. Plan refusé, illisible ou vide : aucune exemption.
2. **Un mot, pas un ensemble.** Si la requête contient plusieurs mots du même logement, elle n'est admise que si **tous** sont des mots d'un **même** nom du plan. Pour `rome-1` : « Colisée » seul et « Monti » seul passent ; « Colisée Monti » ou « Monti près Colisée » restent refusées tant que le plan n'a pas un nom qui les réunit. Les fragments qui sont une suite de mots (repli de `fragmentsProteges`), le texte entier du logement et les écritures sans espace gardent leur régime actuel.
3. **Logement seulement.** Les libellés d'engagement, le récit et les mots de lieu (destination, pays) sont inchangés. Un mot qui figure aussi dans le récit n'est pas exempté : le modèle de plan voit le récit, l'indépendance n'est alors pas établie.
4. **L'indépendance est une condition de l'exemption.** Le modèle de plan et celui de recherche ne reçoivent jamais le logement (le test de `composition.test.ts` cité au fait 6 reste vert et nommé comme garantie). Si un jour ils le reçoivent (option (a) de la question 6), l'exemption tombe : retour à la protection actuelle, et le flux est une affaire de Samuel (donnée personnelle vers un modèle dont la sortie part chez un moteur de recherche).
5. **Borné.** L'ensemble exempté est celui du plan : 9 secteurs et `min(2 × jours, cible d'activités)` incontournables au plus.
6. **Pas de nouveau journal.** Le refus ou l'admission reste compté dans `sortiesRefusees` ; aucun champ de journal, aucun nom.

Si une de ces conditions ne peut pas être tenue, le cas revient à la Sécurité ; si elle fait passer une donnée personnelle de plus vers un tiers ou hors UE, il remonte à Samuel.

**Tests attendus** (`tests/unit/p0/composition.test.ts`) : les sept cas `logement, %s : requête refusée` restent verts **sans plan** et **avec un plan qui ne contient pas le mot** ; `recherche: mot du logement présent dans un nom du plan, admis seul` (rome-1 : logement « Rione Monti (près du Colisée) », plan avec « Monti » et « Colisée » ; « Colisée horaires » et « Monti restaurants » admises) ; `recherche: deux mots du logement hors d'un même nom du plan, refusée` (« Colisée Monti restaurants ») ; `recherche: mot du logement présent dans le récit, protégé` ; `recherche: nom de candidat ou résultat web sans effet sur la protection` ; `recherche: plan refusé ou vide, aucune exemption` ; `recherche: mot entier seulement` (« rom » ne lève pas « roma » ; « romano » ne lève pas « roma »). La garde « le plan ne voit pas le logement » est conservée.

**Part du CEO** (laissée en question) : le ticket porteur et la bascule (0094 § 11 : verdict rendu avant la prise de Q-L2a, la correction entre dans Q-L2a, qui reçoit alors `src/research/agent.ts` et `tests/unit/p0/composition.test.ts`) ; aucun ticket Q-L2a n'est ouvert à la date de ce verdict. Le CEO dit aussi si l'essai rome-1 attend ce changement.

### Question 5 — Prix et horaires venus d'une page non fiable

**Verdict : oui sous conditions.** En plus du rendu en texte brut (0094 § 8, **exigé**, confirmé), l'agent retire un `prix` ou des `horaires` dont un nombre n'apparaît pas dans le texte lu de la page source. Le contrôle ne rend pas le contenu fiable (une page peut dire n'importe quoi) : il écarte les nombres que le modèle a inventés ou tirés d'une autre page.

**Conditions.**

1. **Mémoire seulement, aucune lecture de plus.** Le texte de comparaison est `pagesTexte.get(source)`, déjà tenu pour `dateConfirmee` (fait 7). Pas de nouvelle requête, pas de nouvelle page, pas de texte conservé après l'étape.
2. **Échec fermé.** Page non lue, texte absent, nombre absent : le champ est retiré (jamais gardé « par défaut »), comme `dateConfirmee` est faux sans texte. Le candidat n'est pas écarté pour autant.
3. **Extraction des nombres.** Suites de chiffres `\p{Nd}` ramenées à l'ASCII, sans zéros de tête (« 09:00 », « 9h », « 9 » se valent) ; « 12,50 », « 12.50 » et « 12 50 » donnent les nombres 12 et 50 ; tous les nombres du champ doivent figurer, chacun, comme suite de chiffres entière du texte (pas une partie d'un nombre plus long). Balayage linéaire, sans expression régulière à retour arrière (le texte d'une page est de la donnée non fiable), texte comparé borné (la borne du lecteur de pages, ou une borne explicite si le lecteur n'en a pas).
4. **Un champ sans nombre** (« gratuit », « sur réservation », « fermé le lundi ») n'est pas contrôlé par ce moyen : il garde les garde-fous actuels (`texteMaison`, `prixDitGratuit`, rendu en texte brut). `conseil` n'est pas contrôlé.
5. **`prixParPersonne`** (recommandation, mineur 5 de #505 repris) : un montant positif doit être un nombre du texte `prix` retenu. Aujourd'hui `prix: "15 CHF"` avec `prixParPersonne: 12` passe. Le Tech Lead décide s'il l'ajoute ; la Sécurité le recommande, sans le rendre bloquant.
6. **Pas de nouveau journal** (question 2, condition 1) ; les champs retirés ne sont pas comptés au journal sans verdict.
7. **Tout affichage des trois champs passe par texte brut** (nœud texte React) : ni `dangerouslySetInnerHTML`, ni lien, ni Markdown, y compris tout futur écran, export ou courriel. Test de composant de 0094 § 8 maintenu.

**Tests attendus** : `recherche: prix dont un nombre est absent de la page, retiré` ; `recherche: horaires dont un nombre est absent, retirés` ; `recherche: page non lue, prix et horaires retirés, candidat gardé` ; `recherche: « 9h30–18h » et « 09:30 – 18:00 » reconnus ; « 19 » ne l'est pas par « 119 »` ; chiffres non ASCII (`٣`, `３`) ; `recherche: texte de page très long sans nombre, contrôle linéaire` (non-régression de coût) ; prix sans nombre (« gratuit ») non contrôlé ; `tests/unit/evals/qualite.test.ts` : les fixtures d'évaluation sont mises en accord avec le contrôle, ou le test dit pourquoi un champ est retiré.

### Contrat et vue partagée (condition de Q-L4a, hors questions)

0094 § 7 ajoute `priceNote`, `hoursNote` et `tip` à `StopFactsSchema`. Du texte tiré d'une page web non fiable entre ainsi dans un contrat que le MVP partage. Conditions de la Sécurité :

1. **La vue partagée `/p/[token]` ne les expose pas** : `src/adapters/share-projection.ts` (champ par champ) et `public.shared_facts` (`0001_securite.sql`) ne sont pas modifiés ; test `partage: un voyage dont l'étape porte priceNote, hoursNote et tip ne les expose ni par la projection ni par la base`. Les exposer demande un verdict.
2. **`db/` n'est pas touché** par Q-L4a : `STOP_FACTS_KEYS` et `candidates_facts_check` restent à trois clés. Un ticket qui découvre qu'il doit modifier `db/jsonb-keys.ts` ou une migration s'arrête et le dit (revue Sécurité de `db/`). Conséquence : `CandidatTrouve` (candidats du MVP, B7) **refuse** les trois clés, comme il refuse `area` (B7-PO-11), pour qu'elles ne puissent pas atteindre `candidates.facts` ; test dans `tests/unit/recherche/candidats-lignes.test.ts` ou `src/research/candidat-trouve.test.ts`.
3. **`contientUrl`** : l'ajout de `.it`, `.va`, `.es`, `.pt`, `.nl` (0094 § 7) est une liste fermée de domaines ; elle laisse passer toute autre extension (« exemple.xyz »). Recommandation non bloquante : un motif générique « mot, point, lettres » avec ses exceptions testées (« 12.50 », « 9.30 », « Dr. Martin » ne doivent pas être pris pour des domaines). Le rendu en texte brut reste la protection principale.

### Question 6 — Avis de la Sécurité (le choix revient au Product Owner)

- **(c) comparer en mémoire les noms du plan au texte du logement par `cleDeNom` : favorable.** Aucun modèle, aucun appel, aucun flux. Conditions : le secteur trouvé est un **nom du plan** (donnée maison) et n'est ni journalisé, ni écrit dans `run_secteurs` (il se recalcule depuis le brief et le plan), ni mis dans une requête, un prompt ou le rapport ; test `p0: secteur du logement absent du journal, de la table du plan et des prompts` (sentinelle dans le texte du logement).
- **(d) ficher les jours pleins avant ceux d'arrivée et de départ : neutre sous conditions.** Pas de donnée nouvelle. Il doit laisser intacts les plafonds de fiches et d'éléments Routes de P0S2-PO-26 (test `qualite: dimensionnement sous les plafonds` vert) et n'ajouter aucun compteur au journal ni au rapport.
- **(a) donner au plan le quartier du logement : défavorable.** Une donnée du brief irait à un modèle dont la sortie sert à composer des requêtes qui partent chez le moteur de recherche du fournisseur, hors `data_collection: "deny"`. L'option défait l'indépendance sur laquelle repose la question 4 (le modèle de plan ne voit pas le logement) et la correction 2 de la PR 326. Si le Product Owner la retient, elle remonte à Samuel (donnée personnelle, flux nouveau) avant tout code.

## Constats hors questions

- **A. `run_candidates` n'est pas supprimée à la fin d'une exécution réussie.** 0046 D15 point 3 (« supprimées à la fin de l'exécution ») et S4 (l'exposition pendant l'exécution ne dépasse pas celle de `run_candidates`, « supprimées à la fin de l'exécution ») l'exigent. Le code ne le fait que pour une exécution arrêtée et au remplacement (fait 3) ; après `programme_ecrit`, les lignes, `place_id` compris (donc la différence entre candidats ancrés et non ancrés), restent 24 h. Aucun rapport ne les lit (garde de test), mais c'est un écart à une exigence écrite. Demande : supprimer `run_candidates` (et `run_secteurs`) dans la transaction de `ecrireProgramme`, avec un test `p0: candidats supprimés à l'écriture du programme`. Fichiers : `src/adapters/prototype-ecriture.ts`, hors de toute liste de 0094 ; **ticket à part** (data), non bloquant pour Q-L2a.
- **B. 0094 est en retard sur `main` sur un point.** #507 est fusionnée (la migration `0011_trajets_prototype` est sur `main` et approuvée) : la vague 1 n'attend plus que ce verdict pour les parties qui en dépendent. La migration de Q-L2a est **0013**.
- **C. Q508 nomme la table `prototype.run_plans`**, 0094 la nomme `run_secteurs`. Le verdict porte sur `run_secteurs` ; `run_plans` serait refusée par la garde de nom. À corriger dans `QUESTIONS.md` par le CEO.

## Questions restantes

1. **CEO** — Citer dans la note de version suivante la liste complète de `p0.research_done` (question 2) et la présente décision. Décider du ticket qui porte le filtre (question 4) et si l'essai rome-1 l'attend.
2. **CEO** — Ouvrir le ticket du constat A (suppression de `run_candidates` et de `run_secteurs` à l'écriture du programme) ; corriger le nom de la table dans Q508 (constat C).
3. **Tech Lead** — Dire si `incontournables` reste dans `run_secteurs` (question 1, condition 1) et si `prixParPersonne` est tenu au texte `prix` (question 5, condition 5).
4. **Product Owner** — Choisir parmi (a), (c), (d) pour le secteur du logement (question 6 de 0094) et répondre à la question 8 (plan refusé ou absent : le code d'arrêt, après le verdict de la condition 8 de la question 1). Si (a) est retenu : Samuel, par le CEO.
5. **Samuel** — Rien n'est demandé par cette décision. La question 7 de 0094 (un ou deux secteurs par jour) reste à lui ou au Product Owner ; l'application de la migration 0013 à la base d'essai reste soumise à l'`owner-approved` ou à la tâche C de 0093.

## Conséquences

- Q-L2a peut créer `prototype.run_secteurs` sous les conditions de la question 1 ; sans elles, 0094 § 2 point 2 s'applique (mode simulé seul).
- Le verdict de la question 4 est rendu avant la prise de Q-L2a : la correction du filtre entre dans Q-L2a (0094 § 11).
- Les conditions sont des exigences de la Sécurité pour la revue des PR de Q-L2a, Q-L2d, Q-L4a et Q-L4b ; une PR qui s'en écarte reçoit « changements demandés ».
- La garde `schéma: aucune table de plan de travail` n'est pas modifiée.

## Quand revoir cette décision

- Si le plan de secteurs gagne une clé (jour, rang, ordre, position) ou est écrit après l'ancrage : nouveau verdict avant le code.
- Si un modèle de plan ou de recherche reçoit le logement : la question 4 tombe.
- À l'ajout d'un champ à `p0.research_done`, au rapport de `p0Run` ou à `prototype.runs`.
- À la fin de la phase 0 (suppression du schéma `prototype`, 0046).
