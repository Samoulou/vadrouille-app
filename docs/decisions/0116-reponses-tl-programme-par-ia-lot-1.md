# 0116 — Programme écrit par l'IA, lot 1 : réponses du Tech Lead aux questions T1 à T7

**Ordre de fusion : #623 (0115 et `specs/P0-programme-par-ia.md`), puis cette PR #628 (0116), puis #627 (0117).** Les renvois à 0115, à la spécification et à 0117 se lisent dans leur chemin sur `main` après ces fusions : `docs/decisions/0115-programme-ecrit-par-ia-verifie-par-le-code.md`, `specs/P0-programme-par-ia.md`, `docs/decisions/0117-verdict-securite-programme-par-ia.md`.

Statut : **acceptée**, décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`), définitive dès sa fusion, sans délai de veto (décision 0093) ; à lister dans la note de version suivante (rubrique « Décisions prises par le studio »). Elle n'engage ni argent (aucun plafond relevé, `prototype/config/mode-reel.json` inchangé) ni compte externe ; elle ne supprime ni ne désactive aucun test (§ 8). **Données transmises au fournisseur de modèles** : le récit et le logement du brief partent au fournisseur de modèles dans le prompt `programme`, à la demande de Samuel du 2026-10-21 05:51 UTC (0115 § 2) ; la confirmation de l'incidence (fournisseur hors UE) est **en attente** (`QUESTIONS.md`, CEO) ; d'ici là, `p0Run` n'accepte que les briefs commités de `prototype/briefs/` (textes de test publics, `NOMS_BRIEFS`) ; le routage de la requête (`zdr`, `data_collection`) relève du verdict S5 de la Sécurité (0117), que le § 2.2 applique. Cette décision ne tranche rien de ce point, réservé à Samuel. Les contrôles de la sortie de l'IA (S1), le texte de l'IA envoyé à Google (S2), le second appel (S3), la liste fermée des compteurs (S4) et le routage (S5) relèvent du **verdict de la Sécurité**, décision **0117** : cette décision s'y aligne (§ 1, § 2.2, § 3.3, § 4, § 5, § 8) et, en cas d'écart, le verdict de la Sécurité prévaut.

Date : 2026-10-21 · Décideur : Tech Lead · Ticket : #626 · Spécification : `specs/P0-programme-par-ia.md` § 7 (ticket #622) · **Dépend de 0115** (#623, fusionnée avant celle-ci) ; **0117** (#627) fusionne après celle-ci · Décisions respectées sans amendement : 0011, 0027, 0052, 0055, 0088, 0092, 0111, 0113, 0114, 0117 · **Amende** : 0046 D13 point 5 (délai d'une requête de modèle, pour la seule étape de requête `programme`, § 2.3)
· **Correction 1** (revue de la PR #628, head `33de304`, et cadrage du CEO du 2026-10-21 06:20 UTC) : ordre de fusion, motif des données transmises, `pause` sans lieu gardée, ordre unique des créneaux, rien de dérivé de Google stocké (`toConfirm` calculé à la lecture), liste des tests réécrits.

Numérotation (relue le 2026-10-21 sur `main` `441f7a7` et sur les PR ouvertes) : `main` porte 0001 à 0114 ; #623 porte 0115 ; #613 amende 0113 en place ; #627 porte 0117 (Sécurité) ; aucune autre PR ouverte ne porte de décision.

## Contexte

Samuel a décidé le 2026-10-21 d'inverser la chaîne du prototype `p0Run` : l'IA écrit le programme complet, le code vérifie chaque lieu sur Google, ajoute les temps de trajet et affiche (0115 § 2 et § 3). La spécification du lot 1 laisse au Tech Lead sept questions (T1 à T7). Fil conducteur des réponses : **la chaîne la plus courte qui suffise à l'essai de Samuel sur `rome-1`**, en réutilisant ce qui existe (ancrage restreint à la zone, fiches, Routes, programme réduit, garde, forfait, journal) et sans migration de base au lot 1.

## 1. T1 — Format de sortie du prompt `programme` v1

**Un seul objet JSON** par réponse, lu par `lireProgramme` (nouveau, `src/ai/sorties.ts`) avec un schéma tolérant sur le modèle de 0111 (`texteCoupe`, `.catch(undefined)` pour un champ facultatif, clé inconnue ignorée). Forme v1 :

```
{
  "titre": texte,                           // facultatif
  "jours": [{
    "date": "AAAA-MM-JJ",
    "titre": texte,                         // facultatif : un ou deux quartiers
    "creneaux": [{
      "debut": "HH:MM",
      "fin": "HH:MM",                       // facultatif
      "nature": "arrivee" | "visite" | "repas_midi" | "repas_soir" | "apero" | "soiree" | "pause" | "depart",
      "lieu": texte,                        // obligatoire sauf arrivee, depart, pause
      "ville": texte,                       // facultatif : excursion hors de la destination
      "quartier": texte,                    // facultatif
      "pourquoi": texte,                    // obligatoire dès qu'il y a un lieu
      "conseil": texte, "prix": texte, "horaires": texte,   // facultatifs
      "aReserver": booléen,                 // facultatif, faux par défaut
      "incontournable": booléen             // facultatif, faux par défaut
    }]
  }],
  "bonsPlans": [texte]                      // facultatif
}
```

Précisions arrêtées :
1. **Retirés de la proposition** : `alternative` (lot 2, § 5 ; le demander dès v1 coûterait des jetons sans usage) et `aEmporter` (aucun emplacement ; l'IA peut mettre ce conseil dans `bonsPlans`). Une de ces clés renvoyée quand même est ignorée comme toute clé inconnue.
2. **Longueurs de coupe**, portées une seule fois dans `LONGUEURS_TEXTE` (`src/ai/candidat.ts`) : celles de 0117 § 1 point 2, sauf **`pourquoi` à 280** au lieu de 300, pour qu'une valeur coupée tienne dans `Stop.reason` de la forme réduite (borne `raison` existante) sans seconde coupe (0117 § 1 point 2 laisse ce choix au Tech Lead, valeur ≤ 300). Soit : `lieu` 80 (`nom`), `pourquoi` 280 (`raison`), `conseil` 160, `prix` 60, `horaires` 120, `quartier` et `ville` 60 (`secteur`, égal à `StopFacts.area`), titre du jour 80, titre du programme 120, ligne de `bonsPlans` 200. Chaque texte passe `texteMaison` sur le texte entier, puis est coupé, puis recontrôlé (0111 § 3, 0117 § 1 point 1).
3. **Bornes de quantité** de 0117 § 1 point 3, retenues telles quelles (protection de la lecture, pas règle de forme : rien n'est refusé pour cette raison) : au plus autant de journées que de jours du séjour, **30 créneaux** par journée, **20 lignes** de `bonsPlans` ; l'excédent est ignoré et compté (`slotsRemoved`, `fieldsRemoved`). `LONGUEUR_REPONSE_MAX` (256 Kio) est inchangée : un séjour de 10 jours à 30 créneaux tient dessous.
4. **Journée lisible** : `date` `AAAA-MM-JJ` comprise entre l'arrivée et le départ du brief, pas déjà lue (en cas de doublon, la première est gardée). Une journée illisible est retirée et comptée (`daysRemoved`, admis par 0117 § 4) ; une journée lisible n'est jamais retirée pour un créneau invalide (0115 § 4.4). Programme illisible ou sans aucune journée lisible : `model_output_invalid` (§ 3.4).
5. **Créneau** (0117 § 1 point 4) : `debut` qui n'est pas une heure `HH:MM` de 00:00 à 23:59, `nature` hors liste (jamais remplacée par une valeur par défaut), `lieu` absent ou refusé quand il est obligatoire, ou `pourquoi` absent ou refusé quand il y a un lieu : créneau retiré et compté (`slotsRemoved`). Un champ facultatif invalide est retiré, le créneau gardé (`fieldsRemoved`). Un booléen invalide est retiré, donc absent (aucun badge). Clés inconnues ignorées à tous les niveaux, jamais lues, y compris une clé de lieu proposée par l'IA (`placeId`, `url`, `lat`…) : le seul identifiant de lieu est celui que le code obtient de Text Search (0117 § 1 point 5).
6. **Aucun contrôle de cohérence** : ni nombre de créneaux, ni durée, ni distance, ni chevauchement d'horaires (0115 § 2 point 5) ; aucun créneau n'est retiré pour une raison absente du point 5.
7. **Un seul ordre des créneaux, l'« ordre écrit »** : l'ordre de l'IA, puis un **tri stable par `debut`** (à heure égale, l'ordre de l'IA), appliqué une seule fois, juste avant l'écriture du programme, jour par jour. La vérification (§ 4.5) parcourt les lieux dans cet ordre, les trajets (§ 3.3) relient les lieux consécutifs de cet ordre, et l'écran le montre. Cas limites, sans retrait : un `debut` postérieur à celui du créneau suivant de l'IA est simplement replacé par le tri ; une `fin` antérieure ou égale à `debut` est lue comme passant minuit (`fin` + 24 h) et **bornée à la fin du jour** : `Stop.end` vaut `23:59` (le contrat n'admet pas d'heure au-delà) ; une `fin` invalide est retirée (`fieldsRemoved`), le créneau gardé sans fin.
8. **`pause` sans lieu** : créneau **gardé**, écrit en ligne `free` (`from` = `debut`, `to` = `fin` si elle est donnée et postérieure à `debut`, sinon le `debut` du créneau suivant dans l'ordre écrit, sinon `23:59`). Aucun retrait hors de la liste du point 5.
9. Ce schéma est **propre au prototype** : il n'entre pas dans `src/contracts` (§ 6 pour ce qui en sort).

## 2. T2 — Un seul appel de modèle

1. **Option (a) retenue** : **une requête de modèle pour tout le séjour**, nature `programme` (`src/ai/couche.ts`), coût estimé `coutsEstimesMicros.requeteModele` de `mode-reel.json` (inchangé ; le coût réel est confirmé à la réponse, comme aujourd'hui). Aucune recherche web (`plugins` absent), aucun appel de réparation ni de relance (`maxRetries = 0` inchangé).
2. **Modèle et routage** : `prototype/config/modeles.json` reçoit `etapes.programme` = `deepseek/deepseek-v4.1-flash`, le modèle que la chaîne actuelle utilise déjà pour la recherche (0027 point 1, où Samuel l'a retenu pour **chercher les candidats**, pas pour écrire un programme) ; le reprendre pour la rédaction est un choix d'outillage du Tech Lead pour le lot 1, sans nouveau fournisseur et dans le plafond de 3 USD. `variantes.a` ne porte que `notation` et ne reçoit pas `programme` : les deux variantes lisent `etapes.programme`. Routage : `data_collection: "deny"` (déjà posé par le client) et `zdr: true` pour la requête `programme`, échec fermé si le routage est refusé, selon le verdict S5 de 0117 (comme 0096 § 4.1). Un autre modèle pour la rédaction : question facultative à Samuel ci-dessous, rien ne bloque.
3. **Délai de la requête** (amende 0046 D13 point 5 pour la seule nature `programme`) : une réponse de 20 à 60 créneaux est bien plus longue que les réponses actuelles, et 120 s risquent de la couper. Le délai de la requête `programme` est **300 s**, constante du code (`DELAI_REQUETE_MS` de `src/server/usage/port.ts`, nouvelle entrée `openrouterProgramme`), jamais une configuration. **Mécanisme** : `programme` est ajoutée à `ETAPES_REQUETE` (`src/ai/client.ts`) ; `RequeteModele.etape` la porte déjà jusqu'au client ; `src/ai/openrouter-client.ts` passe à `avecReservation` `DELAI_REQUETE_MS.openrouterProgramme` quand `requete.etape === "programme"`, `DELAI_REQUETE_MS.openrouter` sinon. Le test `p0: délai par requête et réservation libérée` de 0046 (`src/server/usage/registre.test.ts`) est étendu à ce cas. Les autres délais (120 s pour les autres requêtes de modèle, 10 s pour Places et Routes) sont inchangés. 300 s tiennent dans la limite de 800 s d'une étape (0075) avec la place laissée à la vérification (§ 3.3).
4. **Passage à l'option (b)** (trame puis un appel par jour) : seulement sur constat d'essai réel (sortie coupée par le délai ou par `LONGUEUR_REPONSE_MAX`, ou incohérente entre les jours), par une nouvelle décision. Pas de mécanisme préparé d'avance.

## 3. T3 — Une seule étape de travail dans `p0Run`

1. **Forme** : `etapeRecherche`, `etapeAncrage` et `etapeFinale` sont remplacées par **une seule étape** `etapeProgramme` (`"use step"`), suivie de `etapeClore` inchangée. Le workflow devient `etapeProgramme` → `etapeClore`. L'étape garde le squelette `etape()` existant : garde à l'entrée, garde d'idempotence, composition dans l'étape, état sérialisé `{ runId }` seulement, journal `p0.step_failed` à codes fermés, échéance, `maxRetries = 0`.
2. **Pourquoi une seule étape plutôt que trois** : (a) le programme de l'IA, les verdicts de vérification et les identifiants ne quittent jamais la mémoire, ce qui applique 0011 § 3 et § 7 au plus strict (le plan est construit, publié et oublié dans une seule étape) ; (b) **aucune table de travail nouvelle, aucune migration** : passer le programme brut d'une étape à l'autre exigerait une table du schéma `prototype` (clés fermées, RLS, purge) et un verdict de la Sécurité sur son contenu, pour rien, puisqu'une étape qui échoue arrête l'exécution de toute façon (`maxRetries = 0`) ; (c) aucune valeur nouvelle dans les `CHECK` de `prototype.runs`.
3. **Déroulé dans l'étape**, avec les phases **existantes** de `PHASES` (aucune nouvelle valeur ; `notation`, `raisons` et `validation` ne sont plus écrites par `p0Run` mais restent dans la liste et le `CHECK`) :
   - phase `recherche` : rédaction (une requête `programme`, § 2) et lecture tolérante (§ 1) ;
   - phase `ancrage` : vérification (logements, Text Search « IDs only » des lieux, puis leurs fiches, § 4) ; **rien n'est écrit** dans cette phase : identifiants, fiches et positions restent en mémoire jusqu'à la phase `ecriture` ;
   - phase `planification` : trajets (matrices Routes entre étapes **avec `placeId`** consécutives dans l'ordre écrit de chaque jour, § 1.7 ; mode du brief, temps conservés selon 0092, inchangé ; aucun trajet vers ni depuis une étape sans `placeId`) ;
   - phase `ecriture` : programme réduit et écriture (`ecrireProgramme`, positions dans `place_coordinates` par la seule fonction existante, 0027, 0052).
   **Réponse à la question 3 de 0117** : l'étape de vérification n'écrit **que** des `placeId`, et seulement dans le programme écrit (aucune table de travail) ; fiches et positions restent à l'étape finale, en mémoire, et les positions sont écrites par cette seule étape, **avec le programme**. `etapeProgramme` étant à la fois l'étape qui vérifie et l'étape finale qui écrit le programme, 0052 § 1.1 et 0055 § 6 s'appliquent sans changement : **0052 n'est pas amendée**. Si la vérification devient un jour une étape séparée (§ 3.6), elle n'écrira que des `placeId` (comme l'étape d'ancrage d'aujourd'hui) et les fiches resteront à l'étape finale ; écrire des fiches ou des positions plus tôt demanderait un amendement de 0052 soumis à la Sécurité.
4. **Codes** : aucun code nouveau. Une sortie illisible ou sans journée lisible lève le code interne `model_output_invalid` (déjà dans les listes fermées du journal, `src/server/log.ts`, `src/server/log-codes-arret.ts`), persisté `pipeline_failed` par `codePersiste` ; le code `programme_vide` proposé n'est pas créé et `research_empty` n'est plus levé par `p0Run`. Erreurs des fournisseurs : codes externes existants.
5. **Échéance et plafonds** : le forfait de l'exécution entière revient à l'étape (`forfaitDeLEtape` avec toutes les parts). L'échéance de l'étape reste celle d'aujourd'hui (`LIMITE_FONCTION_MS` moins `MARGE_FIN_ETAPE_MS`, soit 770 s) ; aucune marge de fin n'est ajoutée une seconde fois. La requête de modèle part en premier. Pendant la **vérification**, un appel ne part que si son délai entier tient avant l'échéance **moins une réserve de trajets** : le nombre de requêtes Routes que l'étape prévoit encore (au plus la part Routes restante) multiplié par `DELAI_REQUETE_MS.routes`, pour que la vérification ne prenne jamais le temps des trajets. Pendant les **trajets**, la règle d'échéance actuelle s'applique seule. Si un appel de vérification ne tient pas, ou si la part Text Search ou fiches est épuisée, les lieux restants sont écrits **sans `placeId`** (badge « à confirmer » calculé à la lecture, § 5.1) et comptés `unverifiedForCap` (`nonVerifiesFautePart` de la spécification, 0117 § 4 ; PPI-PO-4, étendue à l'échéance) ; si la part ou le temps de Routes manque, les trajets restants sont **sans durée** (`null`, 0092 § 4), jamais inventés. Le programme entier est toujours écrit ; `cap_reached` n'arrête plus `p0Run` pour une part de vérification ou de trajets épuisée.
6. **Quand revoir** : si l'essai réel montre des lieux non vérifiés faute de temps (compteur `unverifiedForCap` non nul alors que les parts restent), découpage en deux étapes (rédaction, puis vérification et écriture) avec une table de travail du programme brut, par une nouvelle décision et un verdict de la Sécurité sur cette table.

## 4. T4 — Vérification : Text Search par nom, une fiche par lieu

1. **Logements** : inchangés (`ancrerLogementsDuSejour`, une recherche et une fiche par logement) ; ils fixent la **zone du séjour** qui restreint toutes les recherches. Les créneaux `arrivee` et `depart` ne sont **pas** vérifiés : ils deviennent les lignes `terminus` du jour (`start`, `end`), à l'heure de l'IA, avec le libellé maison existant ; ce ne sont pas des étapes.
2. **Lieux** : un lieu = un créneau qui porte `lieu`. Requête par la fonction existante `ancrerCandidatsDansZone` (`src/grounding/ancrage-zone.ts`, algorithme unique, 0085 § 1.9), **réutilisée, jamais recopiée** (0117 § 2) : texte `« <lieu>, <ville> »` construit par le code à partir des seuls `lieu` et `ville` contrôlés et coupés (§ 1), ou `« <lieu>, <destination du brief> »` sans `ville` (la ville passe par le paramètre `destination` existant) ; aucun autre champ de l'IA dans la requête ; restriction à la zone des logements inchangée (jamais un biais), masque `id` seul, `pageSize` inchangé, premier identifiant gardé.
3. **Un lieu cité plusieurs fois** (même nom à midi et le soir, ou deux jours) : **une** recherche et **une** fiche, par la clé normalisée existante `cleDeNom` (`src/ai/sorties.ts`) du nom, avec la même ville ; chaque créneau qui le cite reçoit le même `placeId`.
4. **Fiche** : une par identifiant trouvé (fonction de fiche existante ; statut et position lus, en mémoire). Les horaires **ne sont pas évalués à la vérification** : `joursDeFermeture` (`src/server/p0/vers-moteur.ts`) n'est ni réutilisé ni extrait. Issue de la vérification, **en mémoire seulement**, jamais écrite (0011 § 2) :
   - **`placeId` écrit** : identifiant trouvé, fiche lue, pas fermé définitivement, position dans la zone. Un lieu **fermé le jour ou à l'heure du créneau** garde son `placeId` : son badge vient de la relecture des fiches à l'affichage (`aConfirmer`, 0011 § 5, 0092), comme aujourd'hui ;
   - **pas de `placeId`** : aucun identifiant dans la zone, fiche absente (`place_not_found`), position hors zone, ou fermé définitivement (`businessStatus`), ce que 0011 § 2 admet.
   Ces verdicts ne sont **ni écrits ni comptés** dans le journal, la base ou l'état (0011 § 2, 0117 § 4 : `verifies`, `introuvables`, `fermes`, `horsZone` refusés). Le rapport compte **à la lecture**, depuis le programme stocké (source unique), les étapes avec `placeId` et sans `placeId`, sans motif (0117 § 4). Compteurs du journal : les compteurs maison de 0117 § 4 (`days`, `slots`, `placesToVerify`, `daysRemoved`, `slotsRemoved`, `fieldsRemoved`, `textsCut`, `modelCalls`, `unverifiedForCap`), portés par un nouvel événement `p0.programme_written` de fin d'étape, en liste fermée (0072 § 5, 0111 § 5, 0103 § 4).
5. **Ordre et plafond** : jours dans l'ordre, lieux dans l'**ordre écrit** (§ 1.7) ; au plus **une recherche par lieu distinct** et **une fiche par identifiant distinct** (plus les logements), dans les parts du forfait (90 et 90 dans `mode-reel.json`, inchangés). Part ou temps épuisé : § 3.5.
6. **Limite connue du lot 1** : un lieu d'excursion hors de la zone du séjour (la distillerie d'`edimbourg-1`, par exemple) ressort introuvable, donc « à confirmer ». Élargir la zone pour les créneaux qui portent `ville` se décide sur constat de l'essai et demande un nouveau verdict de la Sécurité (0117 § 2 point 2 : le modèle choisirait où le code cherche).
7. **Nom Google non comparé** au nom de l'IA au lot 1 (observation de 0117 § 2) : le premier identifiant de la zone est gardé, comme aujourd'hui. Une comparaison en mémoire est admise par 0011 et sera ajoutée si l'essai montre des lieux « vérifiés » à tort.
8. **Données Google** : identifiants, statuts, horaires et positions restent dans l'étape ; seul l'identifiant d'un lieu vérifié est écrit (`placeId` de l'étape), plus la position dans `place_coordinates` (0027) et les temps de 0092. **Rien de dérivé de Google n'est stocké ni journalisé** : ni verdict, ni motif, ni compteur de verdict, ni badge `toConfirm` (jamais écrit dans le programme, `reduction.ts` le refuse déjà). Aucun nom, adresse ni horaire Google n'est écrit ni affiché hors de la carte Google ; le nom affiché est celui de l'IA (0115 § 4.3). Le texte de l'IA envoyé à Text Search suit le régime de 0117 § 2.

## 5. T5 — Lieu introuvable ou fermé

1. **Lot 1** : le lieu reste dans le programme, étape écrite **sans** `placeId`, sans position et sans trajet vers lui ni depuis lui (le trajet relie l'étape avec `placeId` précédente à la suivante). Le badge « à confirmer » (`toConfirm`) n'est **jamais écrit** : il est **calculé à la lecture** (0011 § 5) pour toute étape sans `placeId` (fait stocké que 0011 point S1 admet) et, comme aujourd'hui, pour une étape dont la relecture des fiches dit le lieu fermé au créneau. La lecture du prototype (relecture, `src/server/relecture/`) est adaptée par la PR de code pour poser ce badge sur une étape sans `placeId`. Le critère A7 se lit donc : toute étape a un `placeId` ou s'affiche « à confirmer ». Aucun remplacement, aucune valeur inventée.
2. **Lot 2 : voie (i) retenue**, l'**`alternative` nommée par l'IA dans la même sortie** (prompt `programme` v2, `alternative` contrôlée et coupée comme `lieu`), vérifiée seulement si le lieu principal échoue, après le passage de tous les lieux principaux, sous le régime de 0117 § 2 (même requête, même zone) et dans les parts restantes (une recherche et une fiche de plus par échec au plus). Rien ne retourne vers le modèle : la Sécurité l'admet sans exception (0117 § 3). La voie (ii) (second appel « remplace ces lieux ») n'est pas retenue : elle porterait un verdict dérivé de Google dans un prompt et demanderait une **décision de Samuel** étendant l'exception d'appartenance de 0011 § 1 (0117 § 3, question 2) ; elle ne serait proposée que si (i) échoue à l'essai.

## 6. T6 — Où porter `pourquoi`, `quartier`, `conseil`, `prix`, `horaires`, titre du jour et `bonsPlans`

Principe : **ce qui a déjà un champ y va au lot 1, sans PR de contrat ; le reste passe par une PR de contrat (lot 1 bis) avant d'être écrit.**

| Sortie de l'IA | Emplacement | Lot |
|---|---|---|
| `lieu` | `Stop.name` (nom maison de l'IA) | 1 |
| `pourquoi` | `Stop.reason` (280) | 1 |
| `quartier` | `StopFacts.area` (60, contenu maison, 0016 § 4.3) | 1 |
| `aReserver` | badge `toReserve` | 1 |
| `nature` | `kind` : `meal` pour `repas_midi`, `repas_soir`, `apero` (libellé « Apéro » selon PPI-PO-2) ; `activity` pour `visite`, `soiree`, `pause` avec lieu ; `arrivee` et `depart` : lignes `terminus` (§ 4.1) ; `pause` sans lieu : ligne `free`, créneau gardé (§ 1.8) | 1 |
| `debut`, `fin` | `Stop.start`, `Stop.end` (`end` facultatif dans le contrat ; minuit selon § 1.7) | 1 |
| `bonsPlans` | **`Trip.checklist`** (contrat existant) : une ligne par bon plan, `when: { type: "beforeDeparture" }`, `done: false`, `sponsored: false`, **sans** `bookingUrl`, `label` borné à **200** caractères ; la forme réduite (`src/prototype/programme-reduit.ts`, propre au prototype) admet ces lignes au lieu de `max(0)`, avec un schéma de ligne réduite qui interdit `bookingUrl` et impose `sponsored: false`. **Choix de présentation** : l'avis du Product Owner et de l'UX/UI est demandé (vocabulaire « À faire » pour un conseil) ; **condition de la PR de code** : les bons plans ne sont écrits que si la Sécurité a accepté cette ligne réduite (question ci-dessous) ; sinon ils sont lus, contrôlés, comptés et non écrits | 1 |
| `conseil`, `prix`, `horaires` | **PR de contrat** : `StopFacts.tip` (160), `StopFacts.priceNote` (60), `StopFacts.hoursNote` (120), tous facultatifs, texte maison | 1 bis |
| titre du jour | **PR de contrat** : `Day.theme` (80, facultatif, texte maison). Pas `title`, que `DaySchema` réserve au titre calculé depuis la date (E1) | 1 bis |
| titre du programme, `incontournable`, `ville` | non écrits au lot 1 ; lus pour le jeu d'évaluation (A4, A6) et les compteurs | — |

1. **PR de contrat (lot 1 bis)** : `src/contracts/trip.ts` (`StopFactsSchema`, `DaySchema`), formes dérivées (instantané, partage, forme réduite du prototype) et leurs tests, comme les PR de contrat de B2 ; aucun effet sur le MVP tant qu'il ne les remplit pas (champs absents). `Trip.tips` n'est pas créé : les bons plans passent par la liste « À faire ».
2. **Affichage** des nouveaux champs : tâche front distincte, après la PR de contrat ; la mention fixe « d'après l'IA, à vérifier sur place » (spécification § 4, PPI-PO-5) et l'écran des infos pratiques sont à l'**UX/UI** (question 2 de l'amendement 3 de `specs/P0-suite-2.md`, toujours ouverte).
3. **Sans le lot 1 bis**, le lot 1 lit `conseil`, `prix`, `horaires` et le titre du jour (comptés, contrôlés) mais ne les écrit pas ; ils sont perdus à la fin de l'étape. **Recommandation au CEO** (ordre des tâches) : faire passer la PR de contrat et l'affichage avant l'essai de Samuel, puisque sa référence de qualité (plans de Samuel) explique, conseille et donne prix et horaires. Le lot 1 n'en dépend pas pour être livré.

## 7. T7 — Modules de l'ancienne chaîne

1. **Gardés au lot 1**, non supprimés : `src/research`, la notation, le classement (`prototype/config/classement.json`), le squelette et la planification de `src/server/p0`, les prompts `plan`, `recherche`, `notation`, `raisons`, `quartier`. `p0Run` ne les importe plus ; la chaîne du MVP (B7 à B9) et ses tests continuent de s'en servir là où ils le font (0115 § 5.5).
2. **Mode simulé** de `pnpm p0` et banc de base : passent par la nouvelle chaîne avec une sortie simulée du prompt `programme` (spécification § 1 point 7).
3. **Retrait** : lot 3, après le jugement de Samuel sur l'essai de la chaîne inversée, par une décision écrite qui nomme chaque module et chaque test retiré ou réécrit.

## 8. Tests

1. **Aucun test supprimé ni désactivé.** Les tests des modules de l'ancienne chaîne (§ 7.1) restent inchangés et verts.
2. **Décision écrite de réécriture** (au sens de `CLAUDE.md`, « Jamais ») : la présente décision autorise la PR du lot 1 à **réécrire** les tests qui importent ou exercent les étapes remplacées de `p0Run` (`etapeRecherche`, `etapeAncrage`, l'ancienne `etapeFinale`), dans ces fichiers seulement :
   - `tests/unit/workflows/p0-run.test.ts` ;
   - `tests/unit/workflows/p0-run-finale.test.ts` ;
   - `tests/unit/workflows/p0-run-hors-vercel.test.ts` ;
   - `tests/support/banc-apercu.ts` et `src/workflows/apercu.test.ts` : ils portent sur le workflow `apercu` du MVP (`src/server/generation/etapes`), que 0115 § 5.5 gèle ; l'autorisation ne couvre que l'ajustement qu'imposerait un module partagé modifié par le lot 1 (par exemple `ETAPES_REQUETE`), sans changement de propriété ; s'ils ne sont pas touchés, tant mieux.
   Conditions : réécriture sur `etapeProgramme` **à propriété égale** (garde, idempotence, état `{ runId }`, journal fermé, plafonds, échéance, aucune donnée Google dans l'état) ; la PR **liste chaque test réécrit**, avec son ancien et son nouveau nom ; aucune propriété vérifiée ne disparaît ; aucun test n'est supprimé ni désactivé.
   **Tests de `p0-run.test.ts` sans équivalent direct**, et où ils vivent pendant le lot 1 :
   - « ticket 400 : recherche sans aucun lieu… arrêt pipeline_failed, rien écrit, ancrage jamais lancé » → même fichier, réécrit en `p0Run : programme sans journée lisible, arrêt pipeline_failed, rien écrit, aucun appel Google` ;
   - « ticket 400 : ligne de journal fermée de fin de recherche… » et « ticket 407 : recherche qui lève : ligne p0.research_done écrite quand même » → même fichier, réécrits sur `p0.programme_written` (ligne fermée, écrite aussi quand la rédaction lève, nom de l'erreur, jamais son message) ;
   - « ticket 407 : l'agent reçoit la vérification d'échéance de l'étape… » → propriété de l'agent, qui reste : déplacé dans `tests/unit/research/agent-echeance.test.ts`, sur `chercherCandidats` directement ;
   - « recherche : composition construite dans l'étape… candidats écrits sans placeId » et « recherche de l'essai : profil de l'essai… » → même fichier, réécrits en `programme : composition construite dans l'étape, aucune écriture avant la phase ecriture` et `programme de l'essai : profil de l'essai, une requête de modèle` ;
   - « un workflow, quatre étapes… » → `workflows: p0Run réduit à etapeProgramme puis etapeClore` (§ 8.3).
3. **Tests nouveaux** : ceux de la spécification § 5 (A1 à A12), plus :
   - `programme: délai de la requête programme à 300 s, autres délais inchangés` ;
   - `programme: une seule requête de modèle par exécution, sans recherche web` ;
   - `p0: un lieu cité deux fois, une recherche et une fiche` ;
   - `p0: lieu fermé définitivement, écrit sans placeId ni position, à confirmer à la lecture` ;
   - `p0: lieu fermé le jour du créneau, placeId gardé, à confirmer à la lecture par la relecture` ;
   - `p0: aucun toConfirm ni verdict écrit dans le programme ni dans le journal` ;
   - `p0: échéance proche, réserve de trajets tenue, lieux restants sans placeId et programme entier écrit` ;
   - `programme: ordre écrit unique, debut hors ordre trié, fin avant debut bornée à 23:59, vérification et trajets dans l'ordre écrit` ;
   - `programme: pause sans lieu gardée en ligne free bornée par le créneau suivant` ;
   - `p0: arrivée et départ en terminus, jamais vérifiés` ;
   - `p0: bons plans en lignes À faire, sans bookingUrl ni sponsored` ;
   - ceux de 0117 (Conséquences) : clé de lieu proposée par l'IA ignorée ; domaine coupé refusé ; bornes de quantité ; requête des seuls lieu et ville, zone restreinte ; aucun compteur de verdict dans le journal ;
   - `workflows: p0Run réduit à etapeProgramme puis etapeClore` (remplace l'assertion de l'ordre des étapes).
4. Les seuils de la spécification § 5 (20:30, 3 h, 2 sur 3, 5 sur 6) vont dans la configuration du **jeu d'évaluation** (`evals/`), jamais dans le prompt ni le code de production (PPI-PO-3).

## Questions nouvelles

- **Sécurité** (revue de la PR de code) : la ligne « À faire » de la forme réduite, sans `bookingUrl` et à `sponsored: false`, portant un texte de `bonsPlans` contrôlé selon 0117 § 1, convient-elle à l'affichage sûr (§ 6) ? Elle n'est pas couverte par 0117. Bloque seulement l'écriture des bons plans du lot 1.
- **Product Owner et UX/UI** : les bons plans en lignes « À faire » (avant le départ) vous conviennent-ils comme présentation au lot 1 (§ 6) ? Ne bloque pas le lot 1.
- **Samuel** (par le CEO, facultative, ne bloque rien) : le prompt `programme` reprend le modèle de la recherche actuelle (`deepseek/deepseek-v4.1-flash`, que tu as retenu en 0027 pour chercher les candidats). Veux-tu en essayer un autre pour la rédaction du programme, dans le même plafond de 3 USD par exécution ? Recommandation : juger d'abord l'essai avec ce modèle.
- **Samuel** (par le CEO, déjà posée par le CEO le 2026-10-21 06:20 UTC, rappelée) : confirmation de l'envoi du récit et du logement au fournisseur de modèles hors UE ; d'ici là, briefs commités seulement.
- **CEO** (ordre des tâches) : placer la PR de contrat (lot 1 bis) et l'affichage des infos pratiques avant l'essai de Samuel (§ 6.3).

## Conséquences

- La PR de code du lot 1 cite T1 à T4 et T7 d'ici, et les verdicts S1, S2 et S4 de la Sécurité (0117) ; elle n'ajoute ni migration, ni phase, ni code d'arrêt, ni variable d'environnement.
- `docs/CONTEXT.md` n'est pas modifié (0115, en tête).
- **Quand revoir** : après le premier essai réel de la chaîne inversée sur `rome-1` et `edimbourg-1` ; points à relire en priorité : délai et longueur de la réponse (§ 2.4), lieux non vérifiés faute de temps (§ 3.6), excursions (§ 4.6), nom Google non comparé (§ 4.7).
