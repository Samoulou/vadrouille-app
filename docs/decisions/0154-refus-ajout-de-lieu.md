# 0154 — « Ajouter un lieu » : textes des refus, lieu introuvable ou fermé, ajout sur `mock`, lieu à soi dans la révision M1b, jour fixé par l'adresse

Statut : **acceptée**, sauf le point 2, **proposition en attente de Samuel** (Q332). Décision du **Product Owner** (détails fonctionnels, dans le cadre du cadrage) **avec l'UX/UI** (textes et forme d'un écran non maquetté, dans les règles de Ligne), « Qui décide quoi » de `docs/CONTEXT.md`. Définitive dès sa fusion, sans délai de veto (décision 0093) ; Samuel peut la remettre en cause à tout moment par une nouvelle décision. À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Rien n'est tranché ici de ce qui revient à Samuel (point 2, Q332) ni au Tech Lead (forme du contrat, tests, journal : points 1 et 4).

Date : 2026-10-31 · Décideur : Product Owner, avec l'UX/UI · Ticket : #965 · `main` relu : `325c059` · PR concernée : #964 (M5d-2, ticket #961), head `5b41cf4`, revue consolidée du même head (Tech Lead et UX/UI : changements demandés ; bloquants 1, 2 et 5, mineurs 9 et 11) · Références : addendum du 2026-10-30 de 0147 (A.3, A.4, A.5, A.6, A.7, A.8 écarts 2 et 3), `specs/M5-retouches.md` (§ 6, § 9, M5-PO-12, M5-PO-16, critère 22), `specs/F7-remplacer-ajouter-deplacer.md` (F7-PO-8, F7-PO-10, F7-PO-11), `specs/F5-sejour-journee-fiche.md` (F5-PO-16), 0018 § 12, `docs/design-system/redaction.md`, handover front § 10 · Questions : Q332 (Samuel), Q762 (seconde partie), Q765, Q770, Q771.

## Contexte

La PR #964 livre l'écran « Ajouter un lieu » (M5d-2). Pour avancer, l'agent frontend y a pris lui-même des décisions qui reviennent au Product Owner et à l'UX/UI : un texte unique réécrit pour tout `no_option`, Q771, Q762, Q765, l'absence de « Quel jour ? » et plusieurs textes nouveaux. La revue consolidée du head `5b41cf4` les refuse pour cette raison (bloquants 1 et 2, mineur 9) et demande au Product Owner d'accepter ou non les entrées non livrées (bloquant 5).

Ce que le code permet aujourd'hui (addendum 0147, A.3, A.4, A.8) :
- le code `no_option` **ne dit pas sa cause**. Il couvre le manque de place (heure hors de la journée, chevauchement d'une étape verrouillée, trajet non relu, fin de journée, rythme ou temps libre R8, changement de ville). Il couvre aussi le lieu dont la fiche relue n'est pas `valide` (R1 : `introuvable`, `ferme_definitivement`, ou `inconnu` quand la lecture des fiches a échoué) ;
- un refus du port de relectures (Routes compris) rend `provider_error` ou `cost_cap_reached`. Un échec des **fiches** seul rend `no_option` (A.8, écart 3) ;
- un lieu fermé **temporairement** est `valide` : il est accepté (le lieu ajouté est verrouillé, R4 ne s'y applique pas) ;
- sur `api`, la recherche reste fermée par la barrière (`SEUILS_LIEUX_VALIDES = false`) jusqu'à M1h. Aucun ajout réel n'est donc possible aujourd'hui, et les refus R1 ne sont pas atteignables par une personne. Sur `mock`, seul le manque de place rend `no_option` (`src/adapters/mock-lieux.ts`) ;
- l'écran de #964 a un bandeau par refus (`refusDe`, `src/features/sejour/AjouterLieu.tsx`) et le jour est celui de l'adresse ;
- la ligne du jour n'a pas de lien « Choisir » sur un repas pas encore choisi, et l'entrée `?idee=` est ignorée (description de #964, « Ce qui reste »).

## Décision

### 1. Q770 et A.7 : un texte par cause, la cause exposée avant M1h

**Tranché : un texte par cause.** Un texte unique devrait dire « pas de place ou lieu fermé ou vérification impossible » : il ne dirait pas ce qui s'est passé, contre la règle de rédaction (« Une erreur dit ce qui s'est passé et ce qu'on peut faire »). Surtout, la personne ne ferait pas la bonne chose : elle changerait de moment pour un lieu fermé, ou de lieu pour un manque de place. Trois causes, trois gestes :
- **manque de place** : changer de moment ou de jour, même lieu ;
- **lieu introuvable ou fermé** : changer de lieu, même moment ;
- **vérification impossible** : réessayer plus tard. C'est une panne, pas un refus. L'échec de lecture des fiches se comporte donc **comme `provider_error`** : même texte, même bouton « Réessayer ». C'était le comportement prévu par 0147 § 4 point 3 (A.8, écart 3). La forme (rendre `provider_error`, ou un autre moyen) revient au Tech Lead.

**Textes définitifs** (`src/i18n/fr/sejour.json`, espace `ajouter` ; noms de clés libres, ceux de #964 gardés quand ils existent) :

| Cause | Code aujourd'hui | Texte | Action du bandeau |
|---|---|---|---|
| Manque de place (toutes les causes de A.3 et R8) | `no_option` | Pas de place à ce moment-là. Ton programme est inchangé. Choisis un autre moment ou un autre jour. | aucune |
| Lieu introuvable (fiche `introuvable`) | `no_option` (R1) | Ce lieu est introuvable. Ton programme est inchangé. Choisis un autre résultat ou cherche un autre nom. | aucune |
| Lieu fermé (fiche `ferme_definitivement`) | `no_option` (R1) | Ce lieu est fermé définitivement. Ton programme est inchangé. Choisis un autre lieu. | aucune |
| Échec de lecture des fiches (`inconnu`), et `provider_error` ou `cost_cap_reached` | `no_option` pour les fiches, sinon ces codes | Le calcul n'est pas disponible pour le moment. Ton programme est inchangé. Réessaie plus tard. | « Réessayer » |
| Trop de gestes (`rate_limited`, règle `retouche`, 60 par heure et par adresse IP) | `rate_limited` | Trop de retouches en peu de temps. Ton programme est inchangé. Réessaie dans une heure. | aucune |

Motifs des textes :
- **`no_option`, changement motivé** du texte de la spécification (« Pas de place ce jour-là, choisis un autre jour. »). L'écran propose « Quel moment ? » : le refus porte sur **un moment**, pas sur la journée. Un autre temps libre du même jour peut convenir (le moteur replanifie les étapes mobiles selon l'heure demandée). « Ce jour-là » renverrait à tort la personne vers un autre jour. « Ton programme est inchangé. » s'aligne sur les autres refus de l'écran et de la révision (`revision.aucuneOption`). Ce texte vaut à l'aperçu (« Voir l'effet ») comme à « Appliquer ». La règle de M5-PO-12 ne change pas : seul le texte change (M5-PO-16) ;
- **lieu introuvable ou fermé** : le statut vient de la fiche relue, affichée sur l'écran qui porte déjà la mention « Données de lieux : Google ». Rien n'est stocké. « Choisis un autre résultat » parce qu'un résultat introuvable est le plus souvent un résultat de recherche périmé ;
- **trop de gestes** : le texte de #964 (« Réessaie dans un moment ») promettait un délai que le limiteur ne tient pas : sa fenêtre est d'une heure (`src/server/config/limites.ts`, règle `retouche`). « Trop de retouches » plutôt que « Tu as fait… » : l'adresse IP peut être partagée (risque accepté par 0141 § 4.3), et ce texte ne doit pas accuser la personne. Pas de bouton « Réessayer » : un nouvel essai immédiat serait refusé aussi. Si la fenêtre change, le texte suit la configuration ;
- vocabulaire : « retouche », « Ton programme », « Réessayer » comme ailleurs. Aucun mot interdit (handover § 10), tutoiement, pas de point d'exclamation.

**Rendu (UX/UI)** : les trois premiers refus prennent le bandeau `StatusBanner` `noOption` de #964, avec le focus posé sur lui. Le quatrième et le cinquième prennent le bandeau `error` en `role="alert"`, comme dans #964.

**Provisoire, jusqu'à ce que le contrat dise la cause** : tout `no_option` affiche le texte du **manque de place** (ligne 1). C'est exact pour tout ce qu'une personne peut atteindre aujourd'hui : sur `mock`, seul le manque de place rend `no_option`, et sur `api` aucun ajout n'est possible tant que la barrière est fermée. **La distinction des causes est un prérequis de l'ouverture réelle de M5d (M1h).** La forme du contrat revient au Tech Lead (question 1) : une cause portée par l'erreur `no_option`, ou un code distinct, ou `provider_error` pour l'échec des fiches. Le test « étape mobile repoussée » (A.7) nommera la cause par la même tâche.

### 2. Q771 avec Q332 : lieu introuvable ou fermé refusé — **proposition, en attente de Samuel**

**Proposition** : un lieu ajouté dont la fiche relue est `introuvable` ou `ferme_definitivement` est **refusé** à l'aperçu et à l'application, sans rien écrire, avec le texte de sa cause (point 1). Il n'est pas écrit puis badgé. Un lieu fermé temporairement reste accepté, comme aujourd'hui (fiche `valide`). Ses horaires sont alors « À confirmer » par la lecture. L'échec de lecture des fiches n'est ni un refus ni une écriture : c'est une panne (point 1).

Arguments :
- **principe produit 2** (« aucun lieu inventé ou fermé ») : écrire une étape que l'on sait fermée, pour la badger aussitôt, ferait entrer dans le programme une étape fausse, connue comme telle ;
- **le refus arrive au bon moment**. La personne vient de choisir le lieu dans une liste. Un refus nommé lui permet d'en choisir un autre tout de suite. Un badge découvert plus tard demanderait un « Remplacer », donc une recherche et une version de plus ;
- **cohérent avec la recommandation de Q332** (« vérifier seulement que le lieu existe et n'est pas fermé, sans exiger de source ») : c'est exactement la portée `ajouts: "lieu"` du code (`PORTEE_R1_PAR_DEFAUT`) ;
- **la phrase de 0147 § 3 point 4 sur le badge** garde son sens pour un lieu **déjà écrit** qu'une lecture ultérieure trouverait introuvable ou fermé (A.8, écart 2) : la lecture B8b le badge, comme toute étape ;
- **contre-argument** : la personne peut savoir mieux que Google (fiche erronée). Ce cas est rare, et « Signaler une erreur » existe pour les étapes écrites. Il ne justifie pas d'écrire une étape fermée.

**Comportement provisoire, gardé par #964 sans changement** : le code actuel. Un lieu dont la fiche n'est pas `valide` rend `no_option` et rien n'est écrit (A.8, écart 2, « règle en vigueur »). Le texte affiché est celui du point 1 (provisoire, puis par cause). Si Samuel choisit l'écriture avec badge, la portée de R1 pour les ajouts et ce point sont revus par une nouvelle décision.

### 3. Q762 (seconde partie) : l'ajout sur `mock`

- **Tranché : sur `mock`, l'ajout reste en mémoire de la page.** Recharger rétablit le jeu simulé, comme le verrou et les révisions de F7 sur `mock` (F5-PO-16). Le jeu simulé n'est pas modifié. Aucun stockage du navigateur (F7 C3).
- **Second ajout le même jour : il doit s'ajouter au premier.** Aucun lieu ajouté ne disparaît de l'affichage tant que la page n'est pas rechargée. Aujourd'hui, `mock` repart du jour simulé et n'affiche que le dernier ajout (mineur 11 de la revue). Pour la personne, cela ressemble à une perte de sa saisie, et `mock` sert aux démonstrations. Le moyen revient au frontend et au Tech Lead dans la tâche M5d-3 (point 6) : par exemple, l'adaptateur `mock` garde les ajouts de la portée de simulation en mémoire du serveur simulé, jamais dans le navigateur. Le moyen ne doit pas faire de `mock` un modèle d'`api` (A.7).
- **D'ici M5d-3, la limite est acceptée dans #964**, sans changement de code, et décrite dans sa description. Un ajout sur un autre jour n'est pas touché par cette limite.
- La première partie de Q762 (terminus d'un long changement de ville à 22:30, M4-suite-back) n'est pas traitée ici et reste ouverte.

### 4. Q765 : le lieu à soi dans la révision M1b

Le cas est étroit : une révision M1b (une seule par voyage, Q613) qui arrive après un ajout, donc sur un voyage débloqué. Il n'est pas atteignable en réel tant que M5d n'est pas ouvert (M1h).

- **Trace des étapes de l'IA retirées : tranché, aucune trace propre à la personne.** Une étape de la révision qui chevauche le lieu à soi a été placée par le modèle sur un moment que la base réservait déjà au lieu à soi. C'est une proposition nouvelle, ou une étape de la base que le modèle a déplacée là. La révision ne montre à la personne que son résultat, quelle que soit l'étape qu'elle retire. Le retrait se voit, comme tout autre changement de la révision, dans « Versions du programme » : l'aperçu d'un retour compare deux instantanés (`changements()`, 0147 § 5.2). Il n'y a donc rien de plus à montrer. La trace au **journal** relève du Tech Lead (question 2).
- **Temps de trajet du lieu réinjecté : tranché, aucune durée fausse affichée.** Les segments qui touchent le lieu réinjecté sont relus, ou retirés, ou marqués estimés. Ils ne gardent jamais une durée calculée pour une autre étape (principe produit 2). Le moyen revient au Tech Lead : relecture par le port de la lecture comme l'ajout (A.1), ou retrait du segment.
- **Temps libre retiré par la réinjection : tranché, aucun trou.** Tout intervalle laissé vide est réécrit en temps libre (principe produit 4).
- **Règles R1, R2, R4 à R9 non rejouées** sur la version réinjectée : au Tech Lead (question 2).
- **Provisoire motivé** : le comportement actuel (A.6) est accepté jusqu'à la tâche de suivi **M5d-4** (backend, point 6), **prérequis de M1h**. Motif : cas étroit, inaccessible en réel avant M1h, et hors des fichiers de M5d-2 (front). Rien ne change dans #964.

### 5. Écart à F7-PO-11 : le jour est fixé par l'adresse, pas de « Quel jour ? » — **accepté**

F7 (F7c, l. 135) prévoyait un groupe « Quel jour ? » et des jours « complet », calculés d'après les moments fournis par le résultat de recherche. Sur `api`, rien ne fournit ces moments par jour. Savoir si un jour est « complet » demanderait un aperçu du moteur par jour, donc une relecture par jour, sous le forfait `relecture`. Surtout, la recherche est orientée vers la ville de la journée (M5 § 6, 0147 § 3 point 2). Dans un voyage à plusieurs villes, changer de jour après la recherche pourrait changer de ville et rendre les résultats faux.

**Décision** : l'écran ajoute au jour de l'adresse. Pour un autre jour, la personne revient à la Journée (« Retour à la Journée ») et passe par l'onglet de ce jour. Les textes le disent : refus par manque de place (point 1) et « Plus aucun moment libre ce jour-là. Choisis un autre jour, ou remplace une étape. » (#964, validé). Le reste de F7-PO-11 vaut : moment libre seulement (temps libre ou repas pas encore choisi), aucune durée saisie, aucune étape poussée hors du programme. Le jour sans moment n'est pas marqué « complet » : l'écran le dit par le texte ci-dessus.

### 6. « Choisir » d'un repas pas encore choisi, et autres entrées : tâche à part **M5d-3**

**Tranché : hors de M5d-2, dans une tâche frontend nouvelle, M5d-3 « Entrées restantes de « Ajouter un lieu » »** (nom proposé au CEO, qui ordonne les tâches). Motifs :
- l'ajout d'un lieu à un repas pas encore choisi est **déjà possible** dans #964. « Ajouter un lieu » ouvre l'écran, « Quel moment ? » propose « Déjeuner pas encore choisi » ou « Dîner pas encore choisi », et l'écran lit `?de=&repas=`. Il ne manque que le raccourci depuis la ligne du jour ;
- ce raccourci touche `DayLine`, composant de Ligne (`src/components/ligne`), hors des fichiers de M5d-2. Il demande une revue du rendu et la mise à jour de `/dev/composants` et de ses références visuelles ;
- #964 a déjà cinq bloquants en revue : l'élargir retarderait le reste.

M5d-3 contient, en liste fermée :
1. « Choisir » sur un repas pas encore choisi de la ligne du jour, voyage débloqué seulement (M5-PO-1), vers `…/ajouter?de={heure}&repas={lunch|dinner}` (F7-PO-8) ;
2. l'entrée `?idee=` (« Ajouter à ma journée » de « Surprends-moi ») : une idée n'a pas de `placeId`. Le champ « Lieu à ajouter » **et** « Nom dans ton programme » sont préremplis par `SurpriseIdea.name` (contenu maison : exception de M5-PO-10). Aucune recherche n'est lancée sans « Rechercher ». L'**omission de cette entrée dans #964 est acceptée** (bloquant 5 de la revue). Ce qu'elle bloque : le parcours « Surprends-moi » → ajout, sur `mock` comme sur `api` ;
3. le second ajout du même jour sur `mock` (point 3).

### 7. Ce que la PR #964 doit changer après la fusion de cette décision (liste fermée)

**En correction de #964** (textes et description seulement ; aucun autre changement n'est demandé par cette décision) :
1. `sejour.ajouter.pasDePlace` : « Pas de place à ce moment-là. Ton programme est inchangé. Choisis un autre moment ou un autre jour. » (point 1, texte provisoire de tout `no_option`) ;
2. `sejour.ajouter.tropDeGestes` : « Trop de retouches en peu de temps. Ton programme est inchangé. Réessaie dans une heure. ». Le bandeau `tropDeGestes` perd le bouton « Réessayer » (point 1) ;
3. les tests qui affirment ces deux textes ou ce bouton : assertions mises à jour (aucun test retiré ni désactivé) ;
4. description de #964 : la section « Décisions » renvoie à 0154 pour Q770, Q771, Q762, Q765, F7-PO-11, les entrées non livrées et les textes. Elle ne présente plus ces points comme décidés par l'agent frontend.

**Textes de #964 validés tels quels par l'UX/UI** (M5-PO-16) : `nonDebloque`, `deuxLettres`, `nomAide` (0018 § 12), `nomVide`, `nomRefuse`, `quelMoment`, `tempsLibre`, `dejeuner`, `diner`, `choisisMoment`, `aucunMoment`, `voirEffet`, `calcul`, `pret`, `revoirEffet`, `trajetsApres`, `conflit` (« Ton programme a changé entre-temps. Rien n'a été modifié. », avec « Revoir l'effet » : reformulation, pour cet écran, de la ligne « Conflit de version » du § 9), `calculIndisponible`, `tropDeVersions`, `enPreparation`, `ajoute`.

**En tâches de suivi** (ni dans #964, ni dans sa correction) :
- **cause du refus d'ajout** (Tech Lead pour la forme, puis backend et frontend) : textes par cause (introuvable, fermé), échec des fiches traité comme une panne, test « étape mobile repoussée » qui nomme la cause. Prérequis de M1h ;
- **M5d-3** (frontend) : point 6 ;
- **M5d-4** (backend) : point 4. Prérequis de M1h.

### 8. Spécification

`specs/M5-retouches.md` est mise à jour par la même PR : le texte du refus passe à celui du point 1 au § 6, au § 9, dans M5-PO-12 et au critère 22, avec un renvoi à 0154. Le § 9 reçoit aussi les textes par cause et le texte « trop de gestes ».

## Conséquences

- Q770 et Q765 sont tranchées, Q765 avec un provisoire motivé jusqu'à M5d-4. La seconde partie de Q762 est tranchée. Q771 attend Samuel avec Q332. Le CEO les reporte dans `QUESTIONS.md` (PR « chore: status »).
- La revue de #964 : les bloquants 1 et 2 et le mineur 9 se règlent par la correction du point 7 et par cette décision. Le bloquant 5 est levé par le point 6 : omissions acceptées, tâche M5d-3. Le mineur 11 est réglé par le point 3. Les autres points de la revue (critère 22 en test réel, focus au retour, `requestId`, `maxLength`, annulation sur `api`, fichiers hors liste) ne sont pas touchés par cette décision.
- L'ouverture réelle de M5d (M1h) a deux prérequis nouveaux : la cause du refus et M5d-4. Ils s'ajoutent à `undoAddPlace` (« Annuler » 5 s du premier ajout, principe produit 5), demandé par la revue de #964.
- Aucun code, aucun test, aucune donnée Google, aucun argent, aucun compte touchés par cette PR.

## Questions (à reporter par le CEO dans `QUESTIONS.md`)

**Samuel** (réservée) :
1. **Q332 et Q771** : un lieu ajouté par la personne que la relecture trouve introuvable ou fermé définitivement est-il refusé, avec un texte qui le dit (proposition du point 2, code actuel), ou écrit puis badgé ? *Recommandation : refusé.* Bloque : rien dans le code (le refus est la règle en vigueur) ; la règle définitive avant M1h.

**Tech Lead** :
1. Forme de la cause du refus d'ajout (point 1) : cause portée par `no_option`, code distinct, ou `provider_error` pour l'échec des fiches. Bloque : les textes par cause, prérequis de M1h.
2. M5d-4 (point 4) : relecture ou retrait des segments du lieu réinjecté, temps libre réécrit, règles à rejouer après la réinjection, trace au journal des étapes de l'IA retirées. Bloque : M1h.

**Sécurité** :
1. M5d-3 (point 6, entrée 2) : le nom d'une idée de « Surprends-moi » (contenu maison, aucune donnée de la personne) prérempli dans le champ de recherche et envoyé à Text Search à « Rechercher » est-il admis au regard de S2 ? Bloque : l'entrée `?idee=` de M5d-3.

**CEO** :
1. Ouvrir les tâches « cause du refus d'ajout », M5d-3 et M5d-4 (point 7) et les ordonner. Inscrire la cause du refus et M5d-4 comme prérequis de M1h.
2. Garder ouverte la première partie de Q762 (terminus à 22:30).
