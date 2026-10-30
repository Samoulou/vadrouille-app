# M4-suite — Journée du changement de ville et carte à plusieurs villes

Rédaction : Product Owner · Date : 2026-10-30 · `main` relu : `702df38` (0148 fusionnée par #907) · Ticket : #913 · Plan : `docs/plans/mvp-etapes-1-9.md`, étape 4, ligne M4-suite · Revue : Tech Lead, UX/UI.

**Correction 1** (revue consolidée du head `5acbd95`, Tech Lead et UX/UI ; arbitrages du CEO) :
- bloquant 1 : « Temps libre » jusqu'au départ et dès l'arrivée connue ; la marge ne sert qu'au rangement des créneaux de l'IA, option (a) (§ 3.3, § 3.4, critère 7) ;
- bloquant 2 : bandeau de chevauchement en `role="status"`, `kind` nouveau `overlap`, décision UX/UI (§ 5, § 10.1, critères 12 et 17) ;
- bloquant 3 : disposition de la rangée de l'écran 5, décision UX/UI (§ 8.2, § 10.1) ;
- bloquant 4 : U-M4S-1 restreinte aux options (a) et (c), aucune édition de `carte.md` ni contrôle hors des deux places fixées (§ 7, § 12, § 13) ;
- mineurs 5 à 21 et cosmétiques 22 et 23 : § 2, § 3.5, § 3.6, § 4.2, § 5, § 6, § 7.3, § 9, § 9.1, § 10, § 12 et § 13 ; réponses du Tech Lead à T-M4S-1 à T-M4S-4 reportées au § 12.

**Correction 2** (revue consolidée du head `b0e258a`, Tech Lead et UX/UI ; arbitrages du CEO ; la dernière) :
- bloquant 1 : la liste fermée des attentes (§ 9.1) et la levée du paramètre de `voisins` sont sous réserve de la décision écrite du Tech Lead dans `docs/decisions/` (décision **0151**, PR `[tl]`, en cours) (§ 3.6, § 9.1, § 10, § 12) ;
- mineurs 2 à 13 : règle `openMeal` retirée ; `free` voisin comme un autre jour ; « Temps libre » jusqu'au terminus `end` (critère 7) ; M4c fusionnée avant cette spécification (§ 8.2) ; décisions UX renommées UX-M4S-A à C ; condition T-M4S-2 pour le ticket M4b ; critère 7 reformulé ; focus de l'action du bandeau ; `overflow-wrap` du bandeau ; filet `ink-soft` ; ordre des textes du bandeau ; espace insécable de l'aide seulement. T-M4S-5 acceptée : repli `conflict` retiré.

Sources :
- spécification [`M4-plusieurs-villes.md`](M4-plusieurs-villes.md) (§ 3, § 7, § 11, § 12, § 14 et § 15), dite ici « la spécification M4 » ;
- décision [`0148-m4-tl-plusieurs-villes.md`](../docs/decisions/0148-m4-tl-plusieurs-villes.md) (§ 2, § 5, § 9, § 10, § 11, § 12 et § 14 « Product Owner, pour M4-suite », points 1 à 9), dite ici « 0148 » ;
- questions Q710, Q726, Q728 et Q729 de [`QUESTIONS.md`](../QUESTIONS.md) ;
- règle de Ligne de la carte : [`docs/design-system/carte.md`](../docs/design-system/carte.md) et `src/components/ligne/StopMarker.test.tsx` ;
- « Qui décide quoi » de [`docs/CONTEXT.md`](../docs/CONTEXT.md).

**Pourquoi une spécification à part, et non une section datée de la spécification M4.** La spécification M4 a déjà cinq corrections et un report du CEO (Q703), et 0148 la complète point par point. Une section de plus allongerait un document de plus de 700 lignes, où la précédence (M4-TL, puis M4-suite, puis la spécification M4) se lirait mal. Ce document dit, règle par règle, ce qu'il garde, ce qu'il révise et ce qu'il remplace dans les deux autres. Les tâches de code qui suivent (§ 13) citent ce document, la spécification M4 et 0148. Plusieurs tâches partagent donc cette spécification : c'est la même exception à « une tâche = une spécification » que celle de M4 (Q723), à accorder par le CEO (§ 12).

**Vocabulaire** : celui de la spécification M4. Le **changement de ville** s'appelle « Vers {ville} » à l'écran, et le mot « trajet » ne nomme à l'écran que les temps de trajet entre étapes (`Day.travelMinutes`). « Engagement » est le terme de code. À l'écran, on dit « Déjà réservé » ou « réservation » (handover front-end § 10).

## Prérequis et précédence

**Cadre posé par 0148.** Cette spécification ne change :
- ni la couche : le domaine `src/domain/changement-de-ville.ts`, le cadrage `cadrerProgramme` et l'assemblage, avec les valeurs dans `moteur.json`, 0148 § 5.1 et § 9 point 6 ;
- ni la forme `transfer` (0148 § 1) ;
- ni `Trip.cities` (0148 § 6) ;
- ni la source de la durée estimée (0148 § 2) ;
- ni le forfait (0148 § 3) ;
- ni les signatures (0148 § 8).

Elle **révise des valeurs** et des **défauts techniques** (0148 § 14, points 1 à 9), et elle écrit les règles que la spécification M4 et 0148 renvoient à M4-suite. Chaque valeur est nommée avec sa clé dans la section `changementDeVille` de `src/server/config/moteur.json` (§ 2). Une seule clé existante hors de cette section est citée : `seuilTempsLibreMinutes`, confirmée sans changement.

**Précédence.** Sur un point que règle ce document, il prime sur les valeurs provisoires de la spécification M4 et sur les défauts techniques que 0148 désigne comme révisables par M4-suite (0148, en-tête « Précédence » et § 14). Sur tout le reste, 0148 prime.

**Ne bloque pas** : M4-suite ne bloque ni M4-C, ni M4a, ni M4b, ni M4c (0148 § 12). Ces tâches livrent ce que fixent la spécification M4 et 0148. Le code de M4-suite vient ensuite, dans les tâches du § 13.

**Aucun argent.** Ce document ne tranche aucune question d'argent, de prix ni de plafond (§ 12, questions Samuel 1 à 4, rappelées sans être tranchées). Il ne change pas le nombre de lieux vérifiés d'une journée de changement de ville au-delà de l'hypothèse du forfait de 0148 § 3 point 2 (4 lieux au plus, § 3.6).

**Aucun champ nouveau à la saisie** (M4-PO-7). Le seul ajout à l'écran 1 est une aide contextuelle (§ 4.2).

## 1. Contexte

- **Ce que livrent M4-C à M4c**, d'après la spécification M4 et 0148 :
  - la ligne « Vers {ville} » (élément `transfer`), à sa place ;
  - le départ saisi (premier « Billet » ou « Vol » du jour), ou le départ estimé : plus tardive des fins occupées avant 18:00, sinon 09:00 (0148 § 5.2) ;
  - le créneau occupé : jusqu'à l'arrivée saisie, ou départ + durée estimée, ou départ + 180 minutes. Pour un billet sans heure de fin, le créneau est réduit au départ (0148 § 5.3) ;
  - le rangement des créneaux de l'IA avant ou après la ligne, et le retrait de ceux qui chevauchent (0148 § 5.1 point 3) ;
  - le plafond d'activités (1, 2, 2) ;
  - une ligne « Temps libre » avant le départ quand l'écart atteint 30 minutes ;
  - aucun bandeau nouveau ;
  - la carte d'ensemble d'aujourd'hui, cadrée sur toutes les villes, comme rendu intermédiaire (spécification M4 § 15).
- **Ce qui reste ouvert** et que ce document règle :
  - les marges avant le départ et après l'arrivée ;
  - l'intervalle d'un billet sans heure de fin ;
  - le chevauchement d'un engagement avec le changement de ville ;
  - les repas et le long changement de ville ;
  - les bandeaux ;
  - le billet de musée saisi en « Billet » (Q728) ;
  - la formulation du critère 13 ;
  - la disposition de la rangée de l'écran 5 (Q726, à l'UX/UI) ;
  - la forme de la carte à plusieurs villes (à l'UX/UI, § 7).

## 2. Valeurs de `moteur.json`, section `changementDeVille` (M4S-PO-1)

Section complète après M4-suite. Les clés marquées « nouvelle » s'ajoutent à celles de 0148 § 5.1 point 5. Aucune clé n'est retirée.

```json
"changementDeVille": {
  "activitesParRythme": { "relaxed": 1, "balanced": 2, "intense": 2 },
  "departEstime": { "heureParDefaut": "10:00", "limite": "18:00", "arrondiMinutes": 15 },
  "creneauSansDureeMinutes": 180,
  "dureeEstimeeMinutes": { "min": 20, "max": 600 },
  "margesMinutes": {
    "avantDepart": { "ticket": 45, "flight": 120, "estimated": 30 },
    "apresArrivee": { "ticket": 30, "flight": 60, "estimated": 30 }
  },
  "long": { "seuilMinutes": 240, "activitesMax": 1 }
}
```

| Clé | Valeur | Statut | Règle |
|---|---|---|---|
| `activitesParRythme` | 1, 2, 2 | confirmée (0148 § 5.4) | § 3.6 |
| `departEstime.heureParDefaut` | **10:00** (au lieu de 09:00) | révisée (Q710) | § 3.1 |
| `departEstime.limite` | 18:00 | confirmée (Q710) | § 3.1 |
| `departEstime.arrondiMinutes` | 15 | nouvelle | § 3.1 |
| `creneauSansDureeMinutes` | 180 | confirmée (Q710), **étendue** au billet ou au vol sans heure de fin | § 3.2 |
| `dureeEstimeeMinutes` | 20 à 600 | confirmée (0148 § 14 point 5) | § 3.2 |
| `margesMinutes.avantDepart` | `ticket` 45, `flight` 120, `estimated` 30 | nouvelle | § 3.3 |
| `margesMinutes.apresArrivee` | `ticket` 30, `flight` 60, `estimated` 30 | nouvelle | § 3.3 |
| `long.seuilMinutes` | 240 | nouvelle | § 3.6 |
| `long.activitesMax` | 1 | nouvelle | § 3.6 |
| `seuilTempsLibreMinutes` (hors section, existante) | 30 | confirmée (0148 § 14 point 4) | § 3.4 |

Les clés `ticket`, `flight` et `estimated` reprennent les noms existants : `COMMITMENT_KINDS` de `src/contracts/values.ts` pour le billet et le vol, et `source: "estimated"` de `transfer` pour le départ estimé.

**Contrôles de la configuration** (`src/domain/configuration.ts`), en plus de ceux de 0148 § 5.1 point 5 :
- toutes les marges sont des entiers de 0 à 240 ;
- `arrondiMinutes` divise 60 ;
- `long.activitesMax` ne dépasse aucune valeur de `activitesParRythme` de la section ;
- `heureParDefaut` est dans `fenetreJour` ;
- `limite + avantDepart.estimated + arrondiMinutes + creneauSansDureeMinutes + apresArrivee.estimated` ne dépasse pas `fenetreJour.fin`. Avec les valeurs ci-dessus : 18:00 + 30 + 15 + 180 + 30 = **22:15**, sous 22:30.

## 3. Règles de planification de la journée du changement de ville

Ces règles vivent dans la couche de 0148 § 5.1. Le domaine calcule les heures. Le cadrage range et retire les créneaux de l'IA. L'assemblage écrit la ligne. Le prompt `programme` v5 en est informé par le cadre qu'il reçoit déjà (0148 § 5.1 point 2), sans champ nouveau. Le contrôle de sortie les garantit.

### 3.1 Départ estimé (M4S-PO-2, Q710)

Sans billet ni vol le jour du changement de ville, la règle de 0148 § 5.2 devient :

> **Départ estimé** = la plus tardive des fins occupées des engagements « Sortie » de ce jour qui ne dépassent pas `limite` (18:00), **plus `avantDepart.estimated` (30 minutes)**, arrondie au **quart d'heure supérieur** (`arrondiMinutes`), sans descendre sous `heureParDefaut` (**10:00**). Sans telle fin : `heureParDefaut`.

- **Fin occupée** : celle de 0148 § 5.2 (`finOccupee`), c'est-à-dire l'heure de fin saisie, sinon la durée par défaut de sa nature.
- **Raisons** :
  - 09:00 est le début de la fenêtre du jour (`fenetreJour.debut`). Un départ à cette heure ne laisse ni petit-déjeuner, ni libération de la chambre, ni bagages. 10:00 reste assez tôt pour qu'une durée de 3 à 4 heures laisse l'après-midi dans la ville d'arrivée ;
  - la marge de 30 minutes après une Sortie couvre le retour au logement pour les bagages. Le départ n'est plus placé à la minute où la Sortie finit ;
  - l'arrondi au quart d'heure évite « départ vers 12:07 (estimation) », dont la précision serait fausse.
- **Exemples** (critère 2) :

  | Engagements du jour | Départ estimé |
  |---|---|
  | aucun | 10:00 |
  | Sortie de 10:00 à 11:30 | 12:00 |
  | Sortie à 10:00 sans heure de fin (fin occupée 11:30) | 12:00 |
  | Sortie de 11:00 à 11:40 | 12:15 |
  | Sortie de 08:30 à 09:10 | 10:00 |
  | Sortie de 17:00 à 19:00 | 10:00 |
  | dîner (Sortie) à 20:00 sans heure de fin | 10:00 |
  | Sortie de 10:00 à 11:30 et dîner à 20:00 | 12:00 |
  | Sortie de 16:00 à 18:00 (fin égale à `limite`, comptée) | 18:30 |

- L'affichage ne change pas : « départ vers {heure} (estimation) » (spécification M4 § 3.3 et § 8).

### 3.2 Créneau occupé par la ligne « Vers {ville} » (M4S-PO-3)

Le créneau occupé sert à la planification. Il n'est pas affiché. Il va du **départ** à la **fin du créneau**, bornée à `fenetreJour.fin` (0148 § 5.1 point 5) :

| Départ | Fin du créneau | Changement |
|---|---|---|
| Billet ou vol avec heure de fin | `end` | aucun (0148 § 5.3) |
| **Billet ou vol sans heure de fin** | départ + `creneauSansDureeMinutes` (180) | **nouveau** : 0148 réduisait ce créneau au départ |
| Estimé, avec durée estimée | départ + `estimatedMinutes` | aucun |
| Estimé, sans durée estimée | départ + `creneauSansDureeMinutes` (180) | aucun |

- **Billet sans heure de fin** : l'affichage ne change pas. Le détail reste « {libellé}, départ à {heure}, arrivée à confirmer », et aucune heure d'arrivée ni durée n'est inventée. Les 180 minutes ne servent qu'à ne pas placer d'étape de la ville d'arrivée trop tôt. Raison : un créneau nul laissait le cadrage garder une étape de la ville d'arrivée à l'heure même du départ.
- **Durée estimée** : bornes de 20 à 600 minutes, arrondi aux 5 minutes, retrait hors bornes et « durée à confirmer », confirmés (0148 § 2 point 2, § 14 point 5). Raisons :
  - deux villes du MVP distinctes sont à plus de 20 minutes l'une de l'autre ;
  - au-delà de 10 heures, la personne prendrait un vol ou un train de nuit, hors de ce lot ;
  - une estimation hors de ces bornes est plus probablement une erreur qu'un fait.

### 3.3 Marges avant le départ et après l'arrivée (M4S-PO-4)

Les marges couvrent le chemin vers la gare ou l'aéroport, et l'arrivée au logement. Elles **ne servent qu'au rangement des créneaux de l'IA** (ci-dessous) et au départ estimé (§ 3.1). Elles **ne s'affichent pas** et ne changent pas les lignes `free` : le temps qu'elles réservent est couvert par la ligne « Temps libre » qui va jusqu'au départ et reprend dès l'arrivée connue (§ 3.4). Il n'y a donc pas de trou au sens du principe produit 4 (option (a) de la correction 1).

| Source du départ | Avant le départ (`avantDepart`) | Après l'arrivée (`apresArrivee`) |
|---|---|---|
| « Billet » (`ticket`) | 45 min | 30 min |
| « Vol » (`flight`) | 120 min | 60 min |
| Estimé (`estimated`) | 30 min | 30 min |

**Fenêtre du changement de ville** : de `départ − avantDepart` à `fin du créneau + apresArrivee`, bornée à `fenetreJour`.

Le rangement de 0148 § 5.1 point 3 (a) devient :
- **avant** la ligne, si la fin occupée du créneau est au plus `départ − avantDepart` ;
- **après** la ligne, si son `debut` est au moins `fin du créneau + apresArrivee` ;
- **retiré** sinon, comme aujourd'hui. Cela couvre un créneau dans la fenêtre, un créneau à cheval sur ses bords, et un créneau qui ne tient plus dans le jour.

Pour un départ estimé, la marge avant le départ est déjà dans le calcul du départ (§ 3.1). Elle s'applique aussi aux créneaux de l'IA : un créneau de la ville quittée finit au plus 30 minutes avant le départ.

Les marges ne s'appliquent qu'aux créneaux **de l'IA**. Un engagement n'est jamais déplacé ni retiré (0148 § 9 point 7). Son rapport au changement de ville est traité au § 3.5.

### 3.4 Pas de trou : « Temps libre » (M4S-PO-5)

- **Seuil** : `seuilTempsLibreMinutes` (30) est confirmé (0148 § 14 point 4). Un écart plus court n'a pas de ligne.
- **Avant le départ** (0148 § 5.1 point 3 (b), confirmé) : une ligne `free` va de la fin de la dernière ligne avant le départ **jusqu'au départ**, quand cet écart atteint 30 minutes. La dernière ligne est une étape, ou le terminus `start` à `fenetreJour.debut` s'il n'y a pas d'étape. Exemple : départ estimé à 10:00, aucun engagement, aucune étape avant : « Temps libre » de 09:00 à 10:00, puis la ligne « Vers {ville} » (critère 7).
- **Après l'arrivée** (nouveau) : quand l'arrivée est connue (billet ou vol avec heure de fin, ou départ estimé avec durée estimée), une ligne `free` va **de l'arrivée** jusqu'à la première ligne qui suit : une étape, ou le terminus `end` s'il n'y a aucune étape après la ligne (§ 3.8). Elle n'existe que si cet écart atteint 30 minutes.
- **Effet des marges** : un créneau de l'IA gardé finit au moins `avantDepart` avant le départ et commence au moins `apresArrivee` après l'arrivée (§ 3.3). Avec les valeurs du § 2, toutes au moins égales à 30 minutes, l'écart atteint toujours le seuil : la ligne « Temps libre » est donc toujours posée de chaque côté, sauf après une arrivée « à confirmer ». Le seuil ne joue que si une marge descend sous 30 minutes.
- **Arrivée « à confirmer »** (billet ou vol sans heure de fin, ou départ estimé sans durée) : **aucune** ligne `free` n'est posée entre la ligne « Vers {ville} » et ce qui suit. Une heure de début de « Temps libre » laisserait croire que l'arrivée est connue.
- **Créneaux retirés** (§ 3.7) : l'écart qu'ils laissent suit les mêmes règles.

### 3.5 Engagements autour du changement de ville (M4S-PO-6, Q729)

1. **Ville d'un engagement** : la règle de 0148 § 9 point 5 est **confirmée**. Une fin occupée au plus égale au départ rattache l'engagement à la ville quittée. Tout autre engagement de ce jour est rattaché à la ville d'arrivée. Cette ville n'est pas affichée.
2. **Un engagement reste un événement** (`Day.events`), rendu dans « Événements du jour » de Journée, **jamais dans la ligne du jour** (0148 § 11 point 4 ; réponse au mineur 4) :
   - il n'entre pas dans la ligne : les autres jours, les engagements sont déjà dans « Événements du jour », et la journée du changement de ville ne fait pas d'exception ;
   - un tri par heure dans la ligne du jour mêlerait des heures sûres (engagements) et des heures estimées (départ).
3. **Il n'est jamais déplacé, raccourci ni retiré.** C'est une donnée de la personne.
4. **Chevauchement.** Un engagement **chevauche** le changement de ville quand son intervalle coupe l'intervalle **affiché** de la ligne « Vers {ville} ». Les intervalles sont semi-ouverts : un engagement qui commence à l'heure exacte de l'arrivée ne chevauche pas.
   - **Intervalle de l'engagement** : `[start, end)` s'il a une heure de fin, sinon son seul `start`. À l'affichage, la configuration du serveur n'est pas lue : aucune durée par défaut n'est supposée.
   - **Intervalle de la ligne** :
     - départ saisi avec heure de fin : `[start, end)` ;
     - départ estimé avec durée estimée : `[start, start + estimatedMinutes)` ;
     - arrivée « à confirmer » (billet sans heure de fin, ou estimé sans durée) : **aucun intervalle**, donc aucun chevauchement signalé. Les 180 minutes de planification ne sont pas un fait.
   - **Les marges ne comptent pas** pour le chevauchement. Un engagement qui tombe dans une marge (Sortie à 16:50, arrivée à 16:40) n'est pas signalé. Elles sont une hypothèse de planification, pas une contrainte de la personne, et aucun bandeau ne signale une « arrivée proche » ni une « marge courte » (§ 5).
   - Un engagement qui chevauche reçoit le **bandeau de chevauchement** (§ 5). Il garde son heure et sa ville du point 1. Exemple (Q729) : Sortie de 11:30 à 12:30 et billet à 12:00. La Sortie est rattachée à la ville d'arrivée, garde son heure et reçoit le bandeau.
   - **Cas limite, engagement sans heure de fin** : le rattachement (point 1) utilise la fin occupée (`finOccupee`, durée par défaut comprise), le chevauchement seulement l'heure de début. Exemple : Sortie à 11:30 sans heure de fin et billet à 12:00. Sa fin occupée (13:00) dépasse le départ : elle est rattachée à la ville d'arrivée. Son début (11:30) précède le départ : elle ne reçoit **pas** de bandeau. C'est voulu : sans heure de fin saisie, rien ne dit qu'elle chevauche, et le bandeau ne signale que ce que la personne a écrit (critère 11).
5. **Plusieurs « Billet » ou « Vol » le même jour** : seul le premier qui commence est le changement de ville (0148 § 9 point 1). Les autres restent des engagements ordinaires, soumis au point 4.

### 3.6 Activités, long changement de ville et repas (M4S-PO-7)

1. **Activités** : au plus `activitesParRythme` de la section (1, 2, 2), confirmé (0148 § 5.4). Elles sont comptées comme dans 0148 § 5.1 point 3 (a) : visites, soirées, pauses avec lieu ; les repas ne comptent pas.
2. **Long changement de ville** : quand la durée connue du changement de ville atteint `long.seuilMinutes` (240), le nombre maximal d'activités du jour est `long.activitesMax` (1), quel que soit le rythme. La durée connue est `end − start` pour un départ saisi, ou `estimatedMinutes` pour un départ estimé.
   - Sans durée connue (créneau de 180 minutes), la journée n'est pas longue.
   - Raison : après 4 heures de route ou de train, plus les marges, une seconde visite remplit une soirée que la personne voudra plus calme. Le rythme « intense » ne change rien au fait d'arriver tard.
3. **Repas**, le jour du changement de ville :
   - au plus **un** `repas_midi` et **un** `repas_soir`. Les suivants sont retirés, dans l'ordre écrit ;
   - **aucun** `apero`. Il est retiré, et ne compte pas comme activité (0148 § 5.1 point 3 (a)) ;
   - un repas dont le créneau tombe dans la fenêtre du changement de ville est retiré par la règle générale du § 3.3 (repas pris en route). **Aucun texte** ne le remplace : la ligne « Vers {ville} » occupe ce temps ;
   - raison : l'hypothèse du forfait de 0148 § 3 point 2 (4 lieux au plus un jour de changement de ville : 2 activités, 1 déjeuner, 1 dîner) reste vraie. Ces retraits ont lieu au cadrage, **avant** la vérification, et ne coûtent aucune requête.
4. **Contexte des cartes de l'écran 6** : la règle provisoire de la spécification M4 § 7.3 (« `context` ne cite jamais un déjeuner le jour d'un changement de ville ») est **levée**. Le `transfer` arrête déjà la recherche du voisin de ce côté (0148 § 1 point 3) : un déjeuner du même côté de la ligne est un vrai voisin et peut être cité, comme un autre jour. La ligne `free` reste un voisin comme un autre jour (`voisinDe`, `src/domain/calculs.ts`, l. 61) : puisque « Temps libre » est posé de chaque côté de la ligne « Vers {ville} » dès que l'heure est connue (§ 3.4), la première étape après l'arrivée a d'ordinaire « Temps libre » pour voisin d'avant, et un déjeuner n'est cité que s'il est le voisin direct de la carte (critère 10).

**Paramètre de `voisins`**, sous réserve de la décision écrite du Tech Lead dans `docs/decisions/` (décision **0151**, PR `[tl]`, en cours) : cette décision lève le paramètre « jour de changement de ville » de `voisins` prévu par 0148 § 10.1 point 3. Si elle le lève avant le début de M4b (qui n'a pas démarré), M4b n'ajoute ni ce paramètre ni l'attente correspondante du critère 14 de la spécification M4, et `voisins` ne change pas. Sinon, la tâche M4-suite-back le retire, selon cette décision.

### 3.7 Créneaux de l'IA retirés (M4S-PO-8, 0148 § 14 point 3)

- Le **retrait** est **confirmé**. Il touche les créneaux dans la fenêtre du changement de ville ou à cheval sur elle, les activités au-delà du maximum (les dernières de l'ordre écrit) et les repas en trop (§ 3.6). Il n'y a ni déplacement, ni priorité aux incontournables.
- **Raisons** :
  - un déplacement replanifierait la journée par le code. 0148 a écarté ce rôle pour la chaîne inversée (Contexte, point 1) ;
  - le prompt v5 reçoit déjà le cadre (heures, maximum) : un retrait est un écart de l'IA, que mesure M4a ;
  - la sortie n'a pas de marque « incontournable » fiable sur laquelle fonder une priorité ;
  - les créneaux retirés ne sont jamais cherchés (0148 § 5.1 point 3).
- **Aucun trou** : l'écart laissé suit le § 3.4.
- **Quand revoir** : au premier essai de Samuel, si plus d'un créneau sur cinq d'une journée de changement de ville est retiré en moyenne, d'après `compteurs.slotsRemoved`, le Product Owner revoit cette règle avec le Tech Lead (0148, « Quand revoir »).

### 3.8 Cas limites

- **Départ saisi avant `fenetreJour.debut`** (train à 07:00) : aucune étape ni « Temps libre » avant la ligne.
- **Arrivée après `fenetreJour.fin`**, ou fin du créneau bornée à `fenetreJour.fin` : aucune étape après la ligne, et la ligne finit la journée avant le terminus `end`. Ce comportement est inchangé (0148 § 5.1 point 5).
- **Arrivée connue, aucune étape après la ligne** (l'IA n'en a pas écrit, ou toutes ont été retirées) : « Temps libre » va de l'arrivée jusqu'au terminus `end`, à l'heure de ce terminus, si l'écart atteint 30 minutes (§ 3.4).
- **Voyage à une seule ville**, et jours ordinaires d'un voyage à plusieurs villes : aucune de ces règles ne s'applique.

## 4. Billet de musée ou de spectacle le jour du changement de ville (M4S-PO-9, Q728)

### 4.1 La règle du billet de trajet ne change pas

Le jour d'un changement de ville, le premier « Billet » ou « Vol » qui commence est le changement de ville (M4-PO-7, 0148 § 9 point 1). Aucune règle de plausibilité n'est ajoutée. Raisons :
- l'heure ne distingue pas un billet de musée de 10:00 à 12:00 d'un train de 10:00 à 12:00 ;
- lire le libellé (« Musée », « Train ») serait fragile et ferait dépendre la règle d'un texte libre de la personne ;
- un champ nouveau est exclu (M4-PO-7).

### 4.2 Aide contextuelle à l'écran 1, au moment de la saisie

L'erreur se corrige là où elle naît. Sous un engagement de l'écran 1, une aide s'affiche quand **toutes** ces conditions sont réunies :
- le voyage a plus d'une ville ;
- l'engagement est un « Billet » ;
- sa date est la date d'arrivée de la ville 2 ou de la ville 3 ;
- c'est **celui qui deviendra le changement de ville** : le premier « Billet » ou « Vol » de ce jour, dans l'ordre des heures puis de la saisie, par la même fonction pure que le serveur (`changement-de-ville.ts`, 0148 § 9 point 1). Un engagement dont l'heure de début n'est pas encore saisie est rangé après ceux qui en ont une, puis par ordre de saisie.

Texte (§ 6) : « Ce jour-là, tu changes de ville : ce billet sera ton transport vers {ville}. » La consigne « choisis Sortie » est déjà dans l'aide générale du billet de trajet (spécification M4 § 8) : elle n'est pas répétée.

**Forme** (décision UX/UI, § 10.1) : gabarit de l'aide existante `engagements.aide` (`corps-s`, `ink-soft`), sous le sélecteur « Type de réservation » de cet engagement, avec un `id` propre. Ni `StatusBanner`, ni `quai`, ni icône.

Comportement :
- l'aide est reliée par `aria-describedby` au sélecteur « Type de réservation » de cet engagement, **en plus** de l'aide générale du billet de trajet (spécification M4 § 7.1), dans cet ordre : aide générale, puis aide spécifique ;
- elle n'est pas une erreur et ne bloque pas l'envoi ;
- elle disparaît, avec son lien, dès qu'une condition cesse : type changé en « Sortie », date changée, ville retirée, ou billet qui n'est plus le premier ;
- un « Vol » n'a pas d'aide : un vol ce jour-là est toujours le changement de ville ;
- un engagement ajouté ne déplace pas le focus.

## 5. Bandeaux de la journée du changement de ville (M4S-PO-10)

**Un seul bandeau nouveau**, le **bandeau de chevauchement**, sur l'écran 12 (Journée) de la journée du changement de ville seulement.

- **Quand** : au moins un engagement de ce jour chevauche la ligne « Vers {ville} » au sens du § 3.5 point 4.
- **`kind` et rôle** (décision UX/UI, § 10.1) : un **`kind` nouveau `overlap`** de `StatusBanner`, en **`role="status"`**, avec le filet **`ink-soft`**, comme les autres `kind` en `status` (0012, Q13 : filet `ink` réservé à `error` et `conflict`). Rien ne bloque la personne et aucun engagement ne se modifie après la création (§ 11) : le rôle `alert`, que 0012 réserve à `error` et `conflict` quand la personne doit réagir, serait annoncé à chaque ouverture de la Journée. M4-suite-front ajoute `overlap` à `StatusBannerKind` (`src/components/ligne/StatusBanner.tsx`, rôle `status` par `statusBannerRole`, filet `bg-ink-soft` dans `RAIL_CLASSES`, avec son commentaire mis à jour) et met à jour la ligne `StatusBanner` du handover front-end § 5. Le Tech Lead a accepté ce `kind` nouveau (T-M4S-5).
- **Coupure** : le message du bandeau `overlap` passe à la ligne avec `overflow-wrap: anywhere`, pour qu'un libellé saisi sans espace ne déborde jamais (critère 17). Les autres `kind` ne changent pas.
- **Action** : le bandeau porte l'`action` de `StatusBanner`, un `Button` `text` « Voir les événements du jour », qui amène le focus sur la région « Événements du jour » de la Journée, où chaque engagement est listé avec ses heures. Cette région reçoit `tabIndex={-1}` pour pouvoir recevoir le focus, comme la liste du jour (`DAY_LIST_ID`, `JourneePanel.tsx`). Elle existe toujours quand le bandeau s'affiche, puisqu'un chevauchement suppose au moins un engagement.
- **Un bandeau par journée**, au-dessus de la ligne du jour. Ordre des bandeaux de la Journée : `generating` s'il y a lieu, puis le bandeau de chevauchement, puis le bandeau du budget de trajet (`travel`). Le bandeau de chevauchement est distinct du second, qui porte sur `Day.travelMinutes` seul (M4-PO-11).
- **Journée en préparation** (`Day.generating`) : pas de bandeau de chevauchement tant que la journée est en préparation ; sa ligne du jour n'est pas encore écrite.
- **Où il n'apparaît pas** :
  - Séjour ;
  - écrans 5 et 6 ;
  - « Pendant le voyage » (écran 15, inchangé, spécification M4 § 7.8) ;
  - vue partagée ;
  - voyage à une seule ville.
- **Calcul** : à l'affichage, par une fonction pure du domaine qui lit le `transfer` et `Day.events` de l'instantané. Aucun champ de contrat nouveau, aucune donnée stockée (forme à confirmer par le Tech Lead, T-M4S-1).
- **Aucun autre bandeau** : ni « marge courte », ni « arrivée proche », ni « horaires serrés », ni bandeau quand l'arrivée est « à confirmer ». Les marges sont des hypothèses de planification (§ 3.3), et l'incertitude est déjà dite par « à confirmer » sur la ligne. Principe produit 4 : des badges seulement pour les exceptions.

Textes au § 6.

## 6. Textes (français, revus par l'UX/UI)

Textes revus par l'UX/UI dans la revue du head `5acbd95` (mineurs 14, 16 et 22), à confirmer par sa revue de cette correction. Mêmes règles que la spécification M4 § 8 : tutoiement, phrases courtes, aucun point d'exclamation, aucun mot technique, « à confirmer » pour l'incertitude. Le mot « trajet » n'y apparaît pas. Clés au choix de la tâche de code, dans `src/i18n/fr/creation.json` et `src/i18n/fr/sejour.json`. `{libellé}` est le libellé saisi par la personne, montré à elle seule, comme dans « Événements du jour ».

| Où | Texte |
|---|---|
| Écran 1, aide sous un « Billet » qui deviendra le changement de ville (§ 4.2) | « Ce jour-là, tu changes de ville : ce billet sera ton transport vers {ville}. » |
| Journée, bandeau de chevauchement, départ saisi, un engagement | « À {heure}, « {libellé} » tombe pendant que tu te rends à {ville}. Vérifie tes horaires. » |
| Journée, bandeau de chevauchement, départ estimé, un engagement | « À {heure}, « {libellé} » tombe pendant que tu te rends à {ville}, d'après la durée estimée. Vérifie tes horaires. » |
| Journée, bandeau de chevauchement, plusieurs engagements | « {n} de tes réservations tombent pendant que tu te rends à {ville}. Vérifie tes horaires. » ; départ estimé : « {n} de tes réservations tombent pendant que tu te rends à {ville}, d'après la durée estimée. Vérifie tes horaires. » |
| Journée, action du bandeau de chevauchement | « Voir les événements du jour » |

`{heure}` est l'heure de début de l'engagement (« 11:30 »). Les deux variantes d'un engagement suivent le même ordre : l'heure, le libellé, puis la ville ; la mention « d'après la durée estimée » vient en fin de phrase. Le libellé libre est entre guillemets français, avec des espaces insécables à l'intérieur. L'espace insécable avant le deux-points ne concerne que l'aide de l'écran 1, seul texte du § 6 qui en contient un. Aucun texte existant ne change, sauf par la levée du § 3.6 point 4 : `context` peut citer un déjeuner, avec ses textes existants.

## 7. Carte à plusieurs villes : forme souhaitée, question à l'UX/UI (M4S-PO-11)

La forme visuelle revient à l'**UX/UI**, par une **décision dans `docs/decisions/`**, écrite dans une tâche à part (§ 13). Le Product Owner ne la fixe pas dans cette PR. Ce paragraphe dit **ce dont la personne a besoin**, les contraintes, et la question de règle de Ligne posée à l'UX/UI.

**Délégation de l'UX/UI** (« Qui décide quoi » de `docs/CONTEXT.md` : écrans non maquettés, **dans les règles de Ligne**) : la décision peut ajouter un élément nouveau, qu'elle décrit dans `docs/decisions/`, mais elle **n'édite pas** `docs/design-system/carte.md` et ne contredit aucune de ses règles. En particulier : aucun numéro sur un terminus ni sur un anneau `overview`, et aucun contrôle posé sur la carte hors des deux places fixées (retour en haut à gauche, partager en haut à droite). Si l'UX/UI juge l'un des deux nécessaire, la question monte à **Samuel** par le CEO (§ 12), et la tâche M4-suite-carte attend sa réponse.

**Rendu intermédiaire** : jusqu'à cette décision, celui de la spécification M4 (§ 7.4 et § 15) reste en place, et `StopMarker.test.tsx` ne change pas. **Défaut connu**, à noter dans la note de version de M4c : pour deux villes éloignées, la carte d'ensemble cadrée sur toutes les villes superpose les anneaux de chaque ville. Échéance proposée au CEO : M4-suite-UX fusionnée au plus tard au cycle de M4c, M4-suite-carte au cycle suivant.

### 7.1 Carte d'ensemble de Séjour (écran 11), 2 ou 3 villes

Besoins :
1. **Voir les villes et leur ordre.** À l'ouverture, la carte cadre toutes les villes (déjà livré par M4c). Chaque ville est reconnaissable **par son nom** (nom maison de `Trip.cities`, jamais une donnée Google) près de son logement, et l'**ordre** des villes est lisible sur la carte.
2. **Savoir à quelle ville appartient une étape.** Les étapes d'une ville forment un groupe visible, autour du logement de cette ville. La couleur n'est jamais le seul porteur de l'information (handover § 11). Le jaune `quai` est exclu (handover § 0, règle 6).
3. **Villes éloignées** (par exemple Paris puis Berlin, environ 900 km) : à l'échelle de toutes les villes, les anneaux d'une ville se superposent. La personne doit pouvoir passer d'une vue de toutes les villes à une vue cadrée sur une ville, avec un équivalent bouton (handover § 0, règle 7). Ce passage se fait par un zoom minimal, un regroupement des anneaux en un repère par ville, ou des boutons par ville placés **hors de la carte** (par exemple dans le panneau) : au choix de l'UX/UI, sans contrôle posé sur la carte hors des deux places fixées.
4. **Pas de lien entre les villes** : aucun tracé entre deux villes, comme dans la spécification M4 § 7.4. Aucune durée ni aucun itinéraire Google n'est demandé ni stocké (0011).
5. **La liste reste la source complète** : le jour par jour groupé par ville (spécification M4 § 7.5). La carte n'en est que le reflet (handover § 11).
6. **Une seule ville** : la carte ne change pas (critère 25 de la spécification M4).

**Question U-M4S-1 (numérotation, contredit la règle de Ligne)** :
- **La règle** : `docs/design-system/carte.md` dit « Vue d'ensemble du séjour : arrêts en petits anneaux de 12 px, sans numéro », et « Le terminus : carré `ink` de 24 px, coins 6 px, maison `on-line` » sans numéro. `StopMarker.test.tsx` vérifie qu'un anneau `overview` n'a pas de numéro et qu'un terminus n'affiche « jamais de numéro, même fourni ».
- **Le besoin 1** demande que l'ordre des villes se lise sur la carte. Deux formes possibles dans la délégation de l'UX/UI, qui tranche entre elles :
  - (a) une **étiquette de ville numérotée** (« 1 · Rome », « 2 · Florence ») posée près du terminus de chaque ville. Les anneaux et le terminus restent sans numéro, et `StopMarker` ne change pas. L'étiquette est un élément nouveau, décrit dans la décision, qui ne contredit aucune règle de `carte.md` ;
  - (c) **aucun numéro** : étiquette du seul nom de la ville. L'ordre se lit dans la liste sous la plaque (« Rome · Florence · Venise ») et dans le jour par jour, pas sur la carte.
- L'ancienne option (b), un numéro de ville sur le terminus, contredit « jamais de numéro » du terminus et son test : elle sort de la délégation de l'UX/UI. Elle ne peut venir que d'une réponse de Samuel (§ 12).
- *Recommandation du PO* : (a), qui répond au besoin sans toucher aux règles existantes. Avis de l'UX/UI dans la revue : (a) est cohérente avec les règles.

**Question U-M4S-2 (repères et zoom)** : forme des groupes par ville et du passage « toutes les villes » / « une ville » (besoins 2 et 3). Elle couvre le terminus de chaque ville sur la carte d'ensemble (aujourd'hui un anneau, `buildOverview`), les étiquettes, le regroupement et le zoom minimal. Aucun contrôle n'est posé sur la carte hors des deux places fixées par `carte.md` (retour en haut à gauche, partager en haut à droite) ; un contrôle par ville vit hors de la carte.

### 7.2 Carte de la Journée d'un changement de ville (écran 12)

Besoins :
1. **Deux terminus distincts** : le logement quitté (`start`) et le nouveau logement (`end`). C'est la seule journée où ils diffèrent (spécification M4 § 3.1 point 2).
2. **Numérotation continue des étapes** à travers la ligne « Vers {ville} », dans l'ordre de la ligne du jour : 1 et 2 dans la ville quittée, puis 3 dans la ville d'arrivée. La ligne « Vers {ville} » n'a pas de numéro (critère 17 de la spécification M4). Ce besoin ne contredit pas la règle de Ligne, puisque c'est une carte de jour.
3. **Tracé coupé** au `transfer` : aucun segment entre les deux villes (0148 § 7.2 point 2, livré par M4c).
4. **Villes éloignées** : un cadrage sur toute la journée réduit chaque moitié à un point. La personne voit d'abord la moitié de la journée qui la concerne, puis passe à l'autre en un geste, avec un équivalent bouton placé hors de la carte.
5. **Sélection** : toucher une étape de la liste recentre la carte sur elle. Aujourd'hui, la carte recentre « sans changer le zoom » (`GoogleMapRenderer.test.tsx`). Si l'étape est dans l'autre ville, le cadrage doit changer pour qu'on la voie.

**Question U-M4S-3** : forme du cadrage initial et du passage d'une moitié à l'autre (besoins 4 et 5), et noms accessibles des deux terminus de cette Journée (proposition : « Logement quitté » et « Nouveau logement »). *Recommandation du PO* :
- avant le départ, à l'ouverture, cadrer la moitié de la ville quittée ;
- une étape sélectionnée dans l'autre moitié recadre sur cette moitié.

L'UX/UI tranche.

### 7.3 Ce que la décision UX/UI doit contenir

- La réponse à U-M4S-1, U-M4S-2 et U-M4S-3.
- La description des éléments nouveaux (étiquette de ville, repère par ville), sans édition de `docs/design-system/carte.md`.
- La liste fermée des tests modifiés (`DayMap.test.tsx`, `GoogleMapRenderer.test.tsx`, s'il y a lieu). `StopMarker.test.tsx` ne change pas.
- Les noms accessibles des nouveaux repères (par exemple « Rome, ville 1 ») et des deux terminus de la Journée d'un changement de ville. La carte reste doublée par la liste.
- Des cibles d'au moins 44 × 44 px pour tout repère ou bouton interactif.
- Le contraste des étiquettes de ville sur `map-land` : au moins 4,5:1, vérifié par test.
- Les critères d'acceptation de M4-suite-carte, chacun vérifiable par un test.
- La conformité : les noms de villes sont des noms maison. Aucune donnée de lieu Google n'est ajoutée sur la carte. Les positions restent celles de la relecture existante, jamais écrites (0011, 0148 § 7.2 point 1).

## 8. Écran 5 : critère 13 et disposition de la rangée de jour

### 8.1 Formulation du critère 13 (M4S-PO-12, 0148 § 11 point 2 et § 14 point 6)

Le **troisième point** du critère 13 de la spécification M4 (« À 390 px, avec « Saint-Jacques-de-Compostelle » comme nom de ville… ») est **remplacé** par le critère 16 ci-dessous, qui reprend la méthode de 0148 § 11 point 2. Les autres points du critère 13 ne changent pas.

### 8.2 Disposition de la rangée (Q726) : décision UX/UI

C'est un rendu d'écran, qui revient à l'UX/UI (M4-PO-12, 0148 § 11 point 3). L'UX/UI l'a tranché dans la revue du head `5acbd95` en adoptant la recommandation du Product Owner. La décision est écrite ici (§ 10.1) et M4c l'applique :
- la légende de la ville est **au-dessus de la mini-ligne**, dans la colonne centrale ;
- la pastille et l'état du jour sont **alignés sur la mini-ligne**, pas sur la cellule entière ;
- la légende est en `corps-s`, couleur `ink-2`, `aria-hidden`. Elle passe à la ligne (`overflow-wrap`), sans troncature ; un nom à traits d'union se coupe après un trait d'union ;
- la rangée d'un voyage à une seule ville ne change pas et garde `items-center` (critère 25 de la spécification M4).

Elle respecte les contraintes techniques de 0148 § 11 point 3 et se vérifie par le critère 16.

**Si M4c est fusionnée avant cette spécification**, l'UX/UI a tranché la disposition dans la PR de M4c (0148 § 11 point 3). Si ce rendu satisfait UX-M4S-B et le critère 16, il reste en place. Sinon, M4-suite-front l'aligne sur UX-M4S-B, sans modifier les tests existants de l'écran 5 pour une seule ville (critère 25 de la spécification M4).

## 9. Critères d'acceptation

Chaque critère est vérifié par un test nommé dans la PR de la tâche qui le porte (§ 13). Composition simulée, barrière fermée ; tests de base de données en CI. Pour un voyage de Rome du 2027-05-04 au 2027-05-08, puis Florence à partir du 2027-05-06, au rythme « équilibré », sauf mention contraire. Le jour du changement de ville est J3, le 2027-05-06.

1. `M4-suite: configuration changementDeVille`.
   - `moteur.json` contient la section du § 2, valeurs exactes.
   - `src/domain/configuration.ts` refuse une configuration :
     - sans `margesMinutes`, sans `long` ou sans `departEstime.arrondiMinutes` ;
     - avec une marge négative ou supérieure à 240 ;
     - avec un `arrondiMinutes` qui ne divise pas 60 ;
     - avec un `long.activitesMax` supérieur à une valeur de `activitesParRythme` ;
     - dont la somme du § 2 dépasse `fenetreJour.fin` : par exemple `limite` à 18:30 avec les autres valeurs du § 2 (22:45, au-delà de 22:30). Les valeurs du § 2 (22:15) sont acceptées.
2. `M4-suite: départ estimé`. Sans billet ni vol le 2027-05-06, les heures du tableau du § 3.1, ligne par ligne. La ligne affiche « départ vers {heure} (estimation) », jamais l'heure seule.
3. `M4-suite: marges et rangement`.
   - Billet « Train Rome–Florence » de 15:05 à 16:40 :
     - un créneau de l'IA qui finit à 14:20 est gardé avant la ligne, et un créneau qui finit à 14:25 est retiré ;
     - un créneau qui commence à 17:10 est gardé après la ligne, et un créneau qui commence à 17:05 est retiré.
   - Vol de 15:00 à 16:30 : un créneau qui finit à 13:00 est gardé, un créneau qui finit à 13:05 est retiré. Après la ligne, 17:30 est gardé et 17:25 retiré.
   - Départ estimé à 12:00 avec 120 minutes estimées : un créneau qui finit à 11:30 est gardé, 11:35 retiré. Après la ligne, 14:30 est gardé et 14:25 retiré.
   - Aucun créneau retiré n'est cherché : le compteur de Text Search du double ne le compte pas.
4. `M4-suite: billet sans heure de fin`.
   - Billet de 15:05 sans heure de fin : un créneau qui commence à 18:35 est gardé après la ligne, et un créneau qui commence à 18:30 est retiré.
   - Le détail reste « Train Rome–Florence, départ à 15:05, arrivée à confirmer ».
   - Aucune ligne `free` n'est posée entre la ligne et l'étape suivante.
   - `transfer.end` et `transfer.estimatedMinutes` sont absents.
5. `M4-suite: départ estimé sans durée`. Départ à 10:00, sans durée estimée : un créneau qui commence à 13:30 est gardé après la ligne, et un créneau qui commence à 13:25 est retiré. La ligne affiche « durée à confirmer ».
6. `M4-suite: fin du jour`.
   - Sortie de 16:00 à 18:00 (départ estimé 18:30), avec 600 minutes estimées : aucun créneau n'est gardé après la ligne, et la durée reste affichée comme estimation, sans heure d'arrivée.
   - Billet à 07:00 de 07:00 à 08:30 : aucune étape ni « Temps libre » avant la ligne.
7. `M4-suite: temps libre`.
   - Départ estimé à 10:00, aucun engagement, aucune étape avant la ligne : une ligne `free` va de 09:00 à 10:00, juste avant la ligne « Vers Florence ». Tout intervalle d'au moins 30 minutes entre le terminus `start` et la ligne porte une ligne `free`.
   - Billet de 15:05 à 16:40, dernière étape avant la ligne finie à 13:30 : une ligne `free` va de 13:30 à 15:05. Finie à 14:20 (dernière fin gardée, § 3.3) : une ligne `free` va de 14:20 à 15:05.
   - Même billet, première étape après la ligne à 18:00 : une ligne `free` va de 16:40 à 18:00. À 17:10 (premier début gardé) : une ligne `free` va de 16:40 à 17:10.
   - Même billet, **aucune étape après la ligne** : une ligne `free` va de 16:40 jusqu'à l'heure du terminus `end`, qui la suit directement.
   - Avec une configuration de test où `avantDepart.ticket` vaut 10 : dernière étape finie à 14:40, écart de 25 minutes jusqu'à 15:05 : aucune ligne `free`.
   - Départ estimé sans durée, ou billet sans heure de fin : aucune ligne `free` juste après la ligne.
8. `M4-suite: long changement de ville`.
   - Billet de 09:00 à 14:00 (300 minutes), rythme « intense » : au plus 1 activité ce jour-là, repas non comptés. La deuxième activité de l'ordre écrit est retirée et comptée dans `compteurs.slotsRemoved`.
   - Départ estimé avec 240 minutes estimées : au plus 1 activité.
   - Départ estimé sans durée : au plus 2 activités en « équilibré », car la journée n'est pas longue.
9. `M4-suite: repas`.
   - Le jour du changement de ville, une sortie simulée avec deux `repas_midi`, un `apero` et un `repas_soir` garde le premier `repas_midi` et le `repas_soir`. Le second `repas_midi` et l'`apero` sont retirés et jamais cherchés.
   - Un `repas_midi` de 12:30 à 13:45 avec un billet de 13:00 à 15:00 est retiré.
   - Le nombre de lieux de cette journée cherchés par Text Search, logements exclus, est au plus 4.
10. `M4-suite: contexte avec déjeuner`.
    - En 6b, le jour du changement de ville, une carte de l'après-midi à Florence dont le voisin d'avant est un déjeuner à Florence a la ligne de contexte que `formatContexte` donne un autre jour.
    - Une carte dont le voisin serait de l'autre côté de la ligne n'a pas ce voisin.
    - Ce critère **remplace** la phrase « Aucun `context` d'un jour de changement de ville ne cite un déjeuner » du critère 14 de la spécification M4.
11. `M4-suite: engagement et ville`.
    - Billet à 12:00 de 12:00 à 13:30, et Sortie de 11:30 à 12:30 : `villeDeLEngagement` rend Florence pour la Sortie. La Sortie reste dans `Day.events` avec ses heures et n'entre pas dans `Day.items`.
    - Sortie de 09:30 à 11:00 : Rome.
    - Sortie à 11:30 sans heure de fin, billet à 12:00 : Florence (fin occupée 13:00), et aucun bandeau de chevauchement (§ 3.5 point 4, cas limite).
12. `M4-suite: bandeau de chevauchement`. Sur Journée, J3.
    - Billet de 12:00 à 13:30 et Sortie « Concert » de 11:30 à 12:30 : un seul `StatusBanner` `kind="overlap"` (`role="status"`) affiche « À 11:30, « Concert » tombe pendant que tu te rends à Florence. Vérifie tes horaires. ». Son filet est `ink-soft`. Après activation de son action « Voir les événements du jour », `document.activeElement` est la région « Événements du jour » (`tabIndex={-1}`).
    - Sortie de 13:30 à 14:00 (commence à l'arrivée) : aucun bandeau.
    - Sortie à 12:30 sans heure de fin : bandeau. Sortie à 11:00 sans heure de fin : aucun bandeau.
    - Sortie à 13:45 (dans la marge de 30 minutes après l'arrivée) : aucun bandeau.
    - Deux Sorties qui chevauchent : un seul bandeau, au texte « 2 de tes réservations tombent pendant que tu te rends à Florence. Vérifie tes horaires. ».
    - Départ estimé à 10:00 avec 480 minutes estimées, et Sortie de 17:00 à 19:00 (qui finit après 18:00, donc sans effet sur le départ, § 3.1) : bandeau au texte « À 17:00, « {libellé} » tombe pendant que tu te rends à Florence, d'après la durée estimée. Vérifie tes horaires. ».
    - Départ estimé sans durée, ou billet sans heure de fin : aucun bandeau, quelle que soit l'heure des engagements.
    - Le bandeau suit le bandeau `generating` et précède le bandeau `travel` quand ils sont présents. Une journée en préparation (`Day.generating`) n'a pas de bandeau de chevauchement.
    - Aucun bandeau sur J1, J2, J4 et J5, sur Séjour, sur les écrans 5 et 6, ni pour un voyage à Édimbourg seul.
13. `M4-suite: aide du billet de changement de ville`. À l'écran 1, Rome puis Florence à partir du 2027-05-06 :
    - un « Billet » daté du 2027-05-06 affiche l'aide du § 6, reliée par `aria-describedby` à son sélecteur « Type de réservation », avec l'aide générale du billet de trajet ;
    - un « Billet » daté du 2027-05-05, une « Sortie » ou un « Vol » datés du 2027-05-06 n'ont pas cette aide ;
    - deux « Billet » le 2027-05-06, à 09:00 et à 15:00 : seul celui de 09:00 a l'aide ;
    - deux « Billet » le 2027-05-06, tous deux à 09:00 : seul le premier saisi a l'aide ;
    - un « Vol » à 08:00 puis un « Billet » à 15:00 le 2027-05-06 : aucune aide, car le vol est le changement de ville ;
    - un « Billet » le 2027-05-06 sans heure de début encore saisie, et un « Billet » à 15:00 : seul celui de 15:00 a l'aide ;
    - avec Rome, Florence à partir du 2027-05-06 et Venise à partir du 2027-05-08 : un « Billet » daté du 2027-05-08 a l'aide qui nomme Venise ;
    - l'aide est en `corps-s`, `ink-soft`, sans icône ni `quai`, et `aria-describedby` cite l'aide générale avant elle ;
    - passer le type à « Sortie », changer la date ou retirer Florence fait disparaître l'aide et son lien ;
    - avec une seule ville, l'aide n'apparaît jamais ;
    - l'aide n'empêche pas l'envoi.
14. `M4-suite: aucune donnée Google`.
    - Les tests à valeurs sentinelles (`tests/unit/p0/sentinelles-google.test.ts`, `tests/unit/ia/prompts-sentinelles.test.ts`) sont rejoués : le cadre du prompt ne gagne aucune donnée Google.
    - Les textes du § 6 ne contiennent que le libellé de la personne, une heure, un nombre et un nom maison de ville.
15. `M4-suite: une seule ville et jours ordinaires inchangés`.
    - Les tests existants de l'assemblage, de Journée et de l'écran 1 passent sans modification pour Édimbourg seul.
    - Les jours ordinaires d'un voyage à deux villes n'ont ni marge, ni bandeau, ni retrait de repas.
16. `Écran 5: alignement à 390 px` (remplace le troisième point du critère 13 de la spécification M4, § 8.1). **Test écrit par M4c**, qui porte déjà le critère 13 selon la méthode de 0148 § 11 point 2. Aucune tâche de M4-suite ne le réécrit. Si M4c est fusionnée sans lui, M4-suite-front l'ajoute. Test navigateur (Playwright, `tests/e2e/`, adaptateur `mock`, fixture à deux villes hors des 62, sans `createTrip`), à 390 px de large :
    - pour chaque rangée qui porte une légende, l'écart entre les centres verticaux de la pastille, de l'état du jour et de la mini-ligne est au plus 1 px ;
    - la légende « De Saint-Jacques-de-Compostelle à Florence » occupe au moins deux hauteurs de ligne, sans troncature (`scrollWidth ≤ clientWidth`, aucun `text-overflow`) ;
    - la légende « Saint-Jacques-de-Compostelle » seule n'a ni troncature ni débordement. Elle peut tenir sur une ligne ;
    - la page n'a aucun débordement horizontal.
17. **Accessibilité** (`pnpm test:a11y` et tests de composants).
    - Axe passe sans violation sur la Journée de J3 avec le bandeau de chevauchement, et sur l'écran 1 avec l'aide du § 4.2.
    - L'aide du § 4.2 est lue avec le sélecteur, après l'aide générale. Le bandeau est en `role="status"` (`kind="overlap"`).
    - À 390 px, aucun texte du § 6 ne déborde horizontalement avec « Saint-Jacques-de-Compostelle » comme nom de ville et un libellé de 80 caractères avec des espaces.
    - À 390 px, un libellé de 80 caractères **sans espace** passe à la ligne (`overflow-wrap: anywhere`) dans le bandeau, sans débordement horizontal.
18. `pnpm verify` vert (variante du studio : `env -u GOOGLE_MAPS_SERVER_KEY SKIP_DB_TESTS=1 pnpm verify` ; tests de base de données en CI).
19. **Carte à plusieurs villes** (tâche M4-suite-carte, § 13) : **critères à fixer par la décision M4-suite-UX** (§ 7.3), qui couvre les besoins 1 à 6 du § 7.1 et 1 à 5 du § 7.2, chacun vérifiable par un test nommé. Dès maintenant, sans attendre la décision :
    - `StopMarker.test.tsx` passe sans modification ;
    - aucun tracé ne relie deux villes, et aucun marqueur n'utilise `quai` ;
    - le critère 25 de la spécification M4 (une seule ville) est rejoué sans modification.

### 9.1 Attentes existantes qui changent (liste fermée)

Aucun test n'est supprimé ni désactivé. Ces attentes, écrites par M4b ou M4c ou demandées par la spécification M4 et 0148, **changent** dans la tâche de code de M4-suite, sous réserve de la décision écrite du Tech Lead dans `docs/decisions/` (décision **0151**, PR `[tl]`, en cours), qui valide cette liste fermée. Cette spécification en donne le fond fonctionnel ; elle n'est pas la décision écrite qu'exige CLAUDE.md pour les tests.

1. Critère 8 de la spécification M4, et le test de 0148 § 10.2 qui le porte :
   - « départ vers 09:00 (estimation) » devient « départ vers **10:00** (estimation) » (sans engagement ; Sortie de 17:00 à 19:00 ; dîner à 20:00) ;
   - « départ vers 11:30 (estimation) » devient « départ vers **12:00** (estimation) » (Sortie de 10:00 à 11:30).
2. Tests nouveaux de 0148 § 10.2 :
   - « départ estimé, sortie du matin et dîner du soir » (11:30) et « … sortie sans fin » (11:30) donnent **12:00** ;
   - « créneau de l'IA retiré » : les bornes intègrent les marges (§ 3.3).
3. Critère 7 de la spécification M4, variante sans heure de fin : « Aucun créneau n'est fixé ici » devient « créneau de planification de 180 minutes, non affiché » (§ 3.2). Le texte affiché ne change pas.
4. Critère 14 de la spécification M4 : la phrase sur le déjeuner est remplacée par le critère 10 ci-dessus. Le sort du paramètre de `voisins` de 0148 § 10.1 point 3 et de son attente est fixé par la décision 0151 (§ 3.6 point 4).
5. Critère 13 de la spécification M4, troisième point : remplacé dans le texte par le critère 16, dont le test est celui de M4c (méthode de 0148 § 11 point 2). Aucune attente ne change.
6. Spécification M4 § 7.6 (« Ce lot n'ajoute aucun bandeau ») : un test qui vérifierait l'absence de tout bandeau le jour du changement de ville est remplacé par le critère 12.

Toute autre attente modifiée est un écart à justifier dans la PR qui la touche, revu par le Tech Lead.

## 10. Décisions du Product Owner

Ce sont des décisions de détail fonctionnel :
- elles sont **définitives dès la fusion** de cette spécification, sans délai de veto (décision 0093) ;
- Samuel peut les remettre en cause à tout moment par une nouvelle décision ;
- elles seront listées dans la note de version suivante (rubrique « Décisions prises par le studio »).

Elles restent dans le cadre du cadrage et de 0148. Elles ne touchent ni au prix, ni à l'argent, ni à l'architecture, ni à la forme visuelle de la carte (UX/UI). Les décisions de rendu (forme, `kind`, rôle, textes) sont des décisions **UX/UI**, écrites au § 10.1.

- **M4S-PO-1 — Valeurs de `changementDeVille`** : la section du § 2, avec trois clés nouvelles (`departEstime.arrondiMinutes`, `margesMinutes`, `long`).
- **M4S-PO-2 — Départ estimé** : `heureParDefaut` passe à **10:00**. Une marge de 30 minutes s'ajoute après la dernière Sortie finie avant 18:00, et le résultat est arrondi au quart d'heure supérieur (§ 3.1). Répond à Q710 pour le départ.
- **M4S-PO-3 — Créneau sans durée** : 180 minutes, confirmées pour le départ estimé et **étendues** au billet ou au vol sans heure de fin, pour la planification seulement. L'arrivée reste « à confirmer » (§ 3.2). Répond à Q710 pour le créneau, et à l'intervalle de la spécification M4 § 15 point 1. Bornes de 20 à 600 minutes confirmées.
- **M4S-PO-4 — Marges** : 45 et 30 minutes pour un billet, 120 et 60 pour un vol, 30 et 30 pour un départ estimé. Elles ne s'affichent pas et ne servent qu'au rangement des créneaux de l'IA et au départ estimé (§ 3.3).
- **M4S-PO-5 — Temps libre** : seuil de 30 minutes confirmé. « Temps libre » jusqu'au départ et, nouveau, dès une arrivée connue. Jamais de « Temps libre » juste après une arrivée « à confirmer » (§ 3.4).
- **M4S-PO-6 — Engagements** :
  - ville déduite par l'heure, confirmée (0148 § 9 point 5) ;
  - jamais dans la ligne du jour, jamais déplacés ;
  - chevauchement défini sur l'intervalle affiché, sans les marges (§ 3.5).
  - Répond à Q729 et au mineur 4 de 0148 § 11.
- **M4S-PO-7 — Activités, long changement de ville, repas** :
  - activités 1, 2, 2 confirmées ;
  - au plus 1 activité à partir de 240 minutes de changement de ville ;
  - au plus un déjeuner et un dîner, aucun apéro ;
  - levée de la règle provisoire du déjeuner dans `context` (§ 3.6) ; la levée du paramètre de `voisins` qui la portait est sous réserve de la décision écrite du Tech Lead dans `docs/decisions/` (décision **0151**, PR `[tl]`, en cours).
- **M4S-PO-8 — Retraits** : les créneaux de l'IA hors cadre sont retirés, dans l'ordre écrit, sans déplacement (§ 3.7). Répond à 0148 § 14 point 3.
- **M4S-PO-9 — Billet de musée** : pas de règle de plausibilité. Une aide contextuelle de l'écran 1, sans champ nouveau, signale le « Billet » qui deviendra le transport, et ses conditions d'affichage sont celles du § 4.2. Répond à Q728. Sa forme est la décision UX-M4S-C.
- **M4S-PO-10 — Bandeaux** : un seul bandeau nouveau, de chevauchement, sur la Journée du changement de ville seulement, quand un engagement chevauche la ligne au sens du § 3.5. Aucun bandeau de marge courte ni d'arrivée proche (§ 5). Son `kind`, son rôle, son action et ses textes sont la décision UX-M4S-A.
- **M4S-PO-11 — Carte à plusieurs villes** : les besoins du § 7. La forme visuelle et la numérotation reviennent à une décision UX/UI (U-M4S-1 à U-M4S-3), dans les règles de Ligne.
- **M4S-PO-12 — Critère 13** : reformulé par le critère 16 selon la méthode de 0148 § 11 point 2. La disposition de la rangée est la décision UX-M4S-B (Q726).

### 10.1 Décisions de l'UX/UI écrites dans cette spécification

L'UX/UI les a prises dans la revue du head `5acbd95` ; le Product Owner les écrit ici sans les modifier. Ce sont des décisions déléguées de l'**UX/UI** (écrans non maquettés, dans les règles de Ligne) : définitives dès la fusion, sans délai de veto (décision 0093), listées dans la note de version suivante sous l'UX/UI (rubrique « Décisions prises par le studio »).

- **UX-M4S-A — Bandeau de chevauchement** (§ 5) : `kind` nouveau `overlap` (accepté par le Tech Lead, T-M4S-5), `role="status"`, filet `ink-soft` comme les autres `kind` en `status` (aucune exception à 0012), message en `overflow-wrap: anywhere`, ajouté par M4-suite-front avec la ligne `StatusBanner` du handover front-end § 5 et le commentaire de `RAIL_CLASSES`. Action « Voir les événements du jour », qui amène le focus sur cette région (`tabIndex={-1}`). Ordre `generating`, chevauchement, `travel`. Textes du § 6.
- **UX-M4S-B — Rangée de jour de l'écran 5** (§ 8.2, Q726) : légende au-dessus de la mini-ligne dans la colonne centrale, pastille et état alignés sur la mini-ligne, légende `corps-s` `ink-2` `aria-hidden` qui passe à la ligne sans troncature, rangée à une seule ville inchangée.
- **UX-M4S-C — Aide de l'écran 1** (§ 4.2) : gabarit de `engagements.aide` (`corps-s`, `ink-soft`), `id` propre, sans `StatusBanner`, `quai` ni icône ; `aria-describedby` cite l'aide générale puis l'aide spécifique ; texte raccourci du § 6.

## 11. Hors périmètre

- Toute question d'argent, de prix, de plafond ou de durée maximale du voyage (questions Samuel 1 à 4, § 12).
- La forme visuelle de la carte et la numérotation sur la carte d'ensemble : UX/UI (§ 7). Toute modification de `docs/design-system/carte.md` : hors délégation, à Samuel (§ 12).
- Les trains de nuit et tout changement de ville qui finit le lendemain (spécification M4 § 3.3).
- Un champ de saisie du changement de ville, un nouveau type d'engagement, une modification des engagements après la création.
- Les voyages à plusieurs fuseaux (M4d).
- Les retouches (M5 : Remplacer, Déplacer, ajouter un lieu à soi) le jour du changement de ville. Leur respect de la fenêtre du changement de ville est posé au Tech Lead (T-M4S-3).
- Une source de durée autre que l'IA (table maison, Routes) : 0148 § 2, « Quand revoir ».
- « Mes voyages », la vue partagée, « Pendant le voyage » et « Après le voyage » (spécification M4 § 7.8).
- Le site d'essai, `p0Run` et le prompt v4.

## 12. Questions ouvertes, par destinataire

**Samuel** (réservées : argent, prix ; **rappelées, non tranchées**). Questions 1 à 4 de la spécification M4 § 14, inchangées :
1. plafonds d'un voyage à plusieurs villes (Q639) ;
2. même paiement unique pour 2 ou 3 villes ;
3. Q636 pour le logement de chaque ville ;
4. un voyage, un forfait, et la durée maximale, avec la réponse de 0148 § 3 (Q724).

M4-suite n'y ajoute rien. Ses règles réduisent ou laissent égal le nombre de lieux vérifiés d'une journée de changement de ville (§ 3.6, § 3.7).

**Samuel, question conditionnelle** (règles de Ligne, hors délégation de l'UX/UI ; posée seulement si l'UX/UI la déclenche dans M4-suite-UX, relayée par le CEO) : faut-il modifier `docs/design-system/carte.md` pour la carte à plusieurs villes, en mettant un numéro de ville sur le terminus (ancienne option (b)) ou en posant un contrôle sur la carte hors des deux places fixées ? *Recommandation du PO* : non ; l'option (a) et des boutons hors de la carte suffisent. Bloque alors : M4-suite-carte seulement.

**UX/UI** :
- **U-M4S-1** — Numérotation de la carte d'ensemble à plusieurs villes : forme (a) ou (c) du § 7.1, dans les règles de Ligne. *Recommandation : (a).* À trancher par une **décision dans `docs/decisions/`** (numéro réservé par le CEO), sans édition de `carte.md`, pas dans cette PR. Bloque : la tâche M4-suite-carte. Ne bloque pas M4c.
- **U-M4S-2** — Repères par ville, regroupement et zoom minimal de la carte d'ensemble (§ 7.1, besoins 2 et 3), dans la même décision, sans contrôle sur la carte hors des deux places fixées. Bloque : M4-suite-carte.
- **U-M4S-3** — Cadrage initial et passage d'une moitié à l'autre de la carte de la Journée d'un changement de ville, et noms accessibles de ses deux terminus (§ 7.2), dans la même décision. Bloque : M4-suite-carte.
- **Tranchées dans la revue** (§ 10.1) : l'ancienne U-M4S-4 (Q726, rangée de l'écran 5) devient UX-M4S-B, et l'ancienne U-M4S-5 (rôle du bandeau, textes) devient UX-M4S-A. Elles ne sont plus des prérequis.

**Tech Lead** (réponses de la revue du head `5acbd95`, reportées) :
- **T-M4S-1** — **Confirmé** : bandeau de chevauchement calculé à l'affichage par une fonction pure de `src/domain/changement-de-ville.ts`, importée par `src/features/sejour`, sans champ de contrat ni donnée stockée (§ 5).
- **T-M4S-2** — **Confirmé, avec une condition** : la détection du départ saisi est une **fonction exportée qui ne lit aucune configuration**. Les valeurs dont elle aurait besoin lui sont passées en argument par l'appelant, et le module n'importe rien de `src/server`. Ainsi l'aide de l'écran 1 (§ 4.2) l'appelle côté client sans tirer `src/server` dans le bundle. La détection n'utilise ni marge ni durée : elle ne lit que le type, la date, l'heure et l'ordre de saisie des engagements.
- **T-M4S-3** — Retouches M5 le jour du changement de ville : « Déplacer » ou l'ajout d'un lieu à soi peuvent placer une étape dans la fenêtre du changement de ville. Réponse : non bloquant ; « refuser avec le texte existant « Aucune option compatible » » est raisonnable, à reprendre avec M5.
- **T-M4S-4** — **Confirmé, non bloquant** : le type (`ticket` ou `flight`) est lu dans le brouillon à la génération et à la révision M1b ; aucune relecture plus tardive n'en a besoin. Ce n'est pas un prérequis.
- **T-M4S-5** — **Acceptée** dans la revue du head `b0e258a` : `kind` nouveau `overlap` dans `StatusBannerKind`, en `role="status"` (UX-M4S-A). Le repli `conflict` est retiré.
- **Décision 0151** (Tech Lead, PR `[tl]`, en cours ; numéro réservé par le CEO) : borne `estimatedMinutes`, liste fermée des attentes du § 9.1 complétée et validée, levée du paramètre « jour de changement de ville » de `voisins` (§ 3.6 point 4). Bloque : M4-suite-back pour ces points.

**ia-recherche** : aucune évolution obligatoire du prompt `programme` v5. Le cadre qu'il reçoit (0148 § 5.1 point 2) porte les heures et le maximum d'activités calculés avec les marges et la règle du long changement de ville. Le jeu d'évaluation de M4a ou de la tâche suivante peut mesurer :
- le taux de créneaux retirés (§ 3.7) ;
- l'absence d'`apero` le jour du changement de ville.

Non bloquant.

**CEO** :
- reporter dans `QUESTIONS.md` :
  - les questions U-M4S-1 à U-M4S-3 ;
  - T-M4S-1 à T-M4S-5, répondues par le Tech Lead ;
  - Q710, Q728 et Q729, répondues par M4S-PO-2, M4S-PO-3, M4S-PO-9 et M4S-PO-6 ;
  - Q726, tranchée par UX-M4S-B ;
  - la question conditionnelle à Samuel, seulement si M4-suite-UX la déclenche ;
- reporter dans le ticket M4b :
  - que M4b n'ajoute pas le paramètre « jour de changement de ville » de `voisins` si la décision 0151 le lève avant le début de M4b (§ 3.6 point 4) ;
  - la condition de T-M4S-2 : la fonction de détection du départ saisi de `src/domain/changement-de-ville.ts` est exportée, ne lit aucune configuration (valeurs passées en argument) et n'importe rien de `src/server`, pour que l'écran 1 l'appelle côté client ;
- placer M4-suite-UX au plus tard au cycle de M4c (§ 7, défaut connu du rendu intermédiaire) ;
- accorder l'exception à « une tâche = une spécification » pour les quatre tâches du § 13, comme Q723 pour M4 ;
- réserver un numéro de décision pour la décision UX/UI de la carte ;
- ouvrir les tickets du § 13 et les placer dans les cycles.

## 13. Découpage en tâches de code

Une tâche = une branche `claude/<id>-<slug>` = une PR. Chacune cite cette spécification, la spécification M4 et 0148. Composition simulée, barrière fermée, aucune migration, aucune variable d'environnement.

| ID | Tâche | Rôle | Prérequis | Fichiers principaux |
|---|---|---|---|---|
| **M4-suite-UX** | Décision UX/UI de la carte à plusieurs villes (U-M4S-1 à U-M4S-3, § 7.3), dans les règles de Ligne, sans édition de `carte.md`. Documentation seule | ux-ui | fusion de cette spécification ; numéro de décision réservé par le CEO | `docs/decisions/<numéro>-carte-plusieurs-villes.md` |
| **M4-suite-back** | Valeurs du § 2 et leurs contrôles. Dans le domaine : départ estimé (§ 3.1), créneau et marges (§ 3.2, § 3.3), long changement de ville (§ 3.6), fonction du chevauchement (§ 3.5, § 5). Cadrage : marges, repas, apéro, maximum du long changement de ville (§ 3.3, § 3.6, § 3.7). Assemblage : « Temps libre » jusqu'au départ et dès l'arrivée connue (§ 3.4). Tests des critères 1 à 11, 14 et 15, et attentes du § 9.1 points 1 à 3 | backend | fusion de cette spécification, de M4b, de M4-C et de la décision 0151 | `src/server/config/moteur.json`, `src/domain/configuration.ts`, `src/domain/changement-de-ville.ts`, `src/server/programme/{cadrage,assemblage}.ts`, `tests/db/`, tests unitaires associés |
| **M4-suite-front** | Bandeau de chevauchement de Journée (§ 5, UX-M4S-A), `kind` `overlap` de `StatusBanner` (filet `ink-soft`, `overflow-wrap`), ligne du handover, `tabIndex={-1}` de la région « Événements du jour », aide de l'écran 1 (§ 4.2, UX-M4S-C), textes (§ 6), attente du § 9.1 point 6. Tests des critères 12, 13 et 17 ; test du critère 16 seulement s'il manque après M4c | frontend avec UX/UI | M4-suite-back et M4c fusionnées | `src/features/sejour/JourneePanel.tsx`, `src/components/ligne/StatusBanner.tsx` et son test, `docs/handovers/frontend.md` (§ 5, ligne `StatusBanner`), `src/features/creation/`, `src/i18n/fr/{sejour,creation}.json`, `tests/e2e/` |
| **M4-suite-carte** | Carte d'ensemble à plusieurs villes et carte de la Journée d'un changement de ville, selon la décision M4-suite-UX. Tests du critère 19 | frontend avec UX/UI | M4-suite-UX et M4c fusionnées ; réponse de Samuel seulement si M4-suite-UX la déclenche (§ 12) | `src/components/carte/` (`DayMap.tsx`, `route.ts`, rendus Google et simulé), `src/features/sejour/TripShell.tsx`, `src/i18n/fr/sejour.json` ; `StopMarker` ne change pas |

**Ordre** :
- M4-suite-UX peut partir dès la fusion de cette spécification, en parallèle de M4a à M4c, et se fusionne au plus tard au cycle de M4c ;
- M4-suite-back suit M4b ;
- M4-suite-front et M4-suite-carte suivent M4c. Elles touchent des fichiers distincts, sauf `src/i18n/fr/sejour.json` : à placer dans des cycles différents, ou à fusionner dans l'ordre M4-suite-front puis M4-suite-carte.

Aucune de ces tâches ne bloque M4a, M4b ou M4c.
