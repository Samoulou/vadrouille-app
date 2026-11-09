# 0166 — Formes consignées après M8a, R-D et R-B : ordre des liens de « Mes voyages », contour pointillé « envoi en cours », `ToggleGroup`, `42501` au relais, `rappels.relay_duplicate`, `RELAY_TABLES`, essais du code d'accès

Statut : **proposée par l'agent tech-lead, définitive à la fusion (0093)**. Elle ne crée aucun choix nouveau. Elle écrit ce que les revues consolidées de quatre PR ont confirmé ou renvoyé « à une décision ».
- **§ 1** (formes d'interface de M8a) : le choix de forme revient à l'**UX/UI** (écrans non maquettés, dans les règles de Ligne : « Qui décide quoi » de `docs/CONTEXT.md`, l. 39). Le Tech Lead l'inscrit à la demande de la revue (mineur 6 du head `b2c6060` de #1068). Ces formes sont **proposées par l'agent tech-lead, définitives à la fusion (0093)**, et la revue UX/UI de cette PR les valide.
- **§ 2** (relais des rappels) : décision déléguée du **Tech Lead** (architecture, tests). Elle précise 0162 sur un seul cas et y ajoute un nom de constante. Les verdicts de la Sécurité sont rapportés par renvoi, pas tranchés ici.
- **§ 3** : renvoi seul, 0165 prime déjà.

Rien de ce qui revient à Samuel ni à la Sécurité n'est tranché. À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment, par une nouvelle décision.

Date : 2026-11-09 · Décideur : Tech Lead (§ 2, § 3) ; UX/UI pour la forme du § 1, proposée par l'agent tech-lead · Ticket : #1080 · `main` relu : `ea950a5` (après #1077 et #1078)

Numérotation : `main` va jusqu'à 0165. Aucune des PR ouvertes au 2026-11-09 (#1065, #1068, #1082) ne touche `docs/decisions/`. 0166 est libre.

**Ce que cette décision n'engage pas.** Aucun code, aucun test, aucune migration, aucun réglage. Aucune dépense, aucun compte externe, aucune donnée personnelle nouvelle, aucune donnée Google.

Sources vérifiées (commentaires de Samoulou commençant par « ## Revue consolidée ») :
- #1068 (M8a, ouverte) : heads `001c21e` (mineurs 2 et 12) et `b2c6060` (mineurs 5 et 6). Code relu au head `b2c6060`.
- #1078 (R-B, fusionnée, `ea950a5`) : head `fb9bbd4` (réponses 1 et 2, mineur 4).
- #1067 (R-D, fusionnée) : heads `c9d2ba1` et `d4523c2` (verdict S-R1 à S-R6, mineurs 2 et 4).
- #1077 (E1, fusionnée) : head `fc8ec3a` (mineur 2).
- #1057 (M8-D, fusionnée) : head `dd23bce` (verdict S1).
- #1066 (amendement de 0160 après M8-D, fusionnée).

## Décision

### 1. M8a : formes d'interface (proposées par l'agent tech-lead, définitives à la fusion, 0093 ; choix de l'UX/UI)

#### 1.1 Ordre des liens d'une ligne de « Mes voyages »

Une ligne de « Mes voyages » contient au plus trois liens, dans cet ordre :
1. **Le voyage** (plaque, destination, dates). C'est le seul lien à nom long, et la tabulation l'atteint en premier.
2. **« Donner ton avis »** (`aria-label` « Donner ton avis ({destination}) »). C'est le geste propre au voyage terminé (écran 16).
3. **« Voir le reçu »** (`aria-label` « Voir le reçu ({destination}) »). C'est un document (B4d).

Chacun est un lien distinct, jamais imbriqué dans celui du voyage.

Sources : mineur 15 du head `0823da5`, mineur 12 du head `001c21e` et mineur 6 du head `b2c6060` de #1068. L'ordre est écrit aujourd'hui en commentaire seulement (`src/features/compte/TripsScreen.tsx` l. 72-77 au head `b2c6060`) et suivi par le rendu (même fichier, l. 100-135). `tests/e2e/mes-voyages.e2e.spec.ts` (l. 78-84 au même head) vérifie l'ordre voyage puis avis. Aucun voyage de ce cas n'a de reçu, l'ordre avis puis reçu n'y est donc pas vérifié (voir § 4).

#### 1.2 Contour pointillé `ink-soft` pour « envoi en cours » (dérogation d'usage)

Ailleurs dans Ligne, un contour pointillé signale une information à vérifier :
- « À confirmer » et « Non confirmé » (`Tag`, pointillé `ink` : `docs/design-system/components/Tag/README.md` l. 8 ; `src/components/ligne/Tag.tsx` l. 16-17) ;
- « déduit » (`Chip` `inferred`, `SegmentedControl` déduit, pointillé `ink`) ;
- la marche (rail pointillé, `docs/design-system/README.md` l. 52 et l. 70).

Sur l'écran 16, le groupe de choix d'une étape dont l'avis part prend un contour pointillé `ink-soft` (`outline-(length:--ligne-trait-controle) outline-ink-soft outline-dashed`, `ReviewScreen.tsx` l. 88-90 au head `b2c6060`). Ce contour signifie **« envoi en cours »**. C'est un second sens du pointillé.

Il est admis à trois conditions :
- **toujours avec le texte** « Enregistrement… » sous l'étape (`apres.json`, clé `enregistrement`), car l'information ne repose jamais sur le seul trait (`docs/design-system/README.md` l. 70) ;
- avec `aria-busy` sur le groupe ;
- avec l'annonce `role="status"` « Avis enregistré. » ou « Avis effacé. » à la réponse.

Les libellés ne sont pas atténués, les contrastes restent ceux du rail (mineur 5 du head `001c21e`). Le contour est en `ink-soft`, pas en `ink` : il ne se confond pas avec « À confirmer ».

Source : mineur 5 du head `b2c6060` de #1068 (« acceptable avec "Enregistrement…", à consigner comme dérogation d'usage »). La dérogation vaut pour ce seul usage. Tout autre emploi du pointillé pour un état d'attente demande une décision de l'UX/UI.

#### 1.3 `ToggleGroup` : tâche à ouvrir plus tard, sans variante effaçable de `SegmentedControl`

Le `ChoiceGroup` local de `ReviewScreen.tsx` (l. 67-121 au head `b2c6060`) reste en place. C'est un groupe de trois boutons `aria-pressed`, effaçable par un second appui. L'écart à 0018 est acté au § 7 de `specs/M8-apres-le-voyage-api.md` par #1068. Mineur 2 du head `001c21e`, UX/UI, gravité 2.

**Pas de variante « effaçable » de `SegmentedControl`.** Cette piste, proposée au mineur 15 du head `0823da5`, est retirée par le mineur 2 du head `001c21e`. `SegmentedControl` reste un choix exclusif au sens de 0018.

Tâche que le CEO ouvrira après la fusion de #1068, au moment qu'il choisit : `[front]` « Extraire `ToggleGroup` dans `src/components/ligne` ». Elle livre :
- le composant, sorti du `ChoiceGroup` (boutons `aria-pressed`, effaçable, rendu « envoi en cours » du § 1.2 et rendu hors ligne de `ReviewScreen.tsx` l. 106-114) ;
- son test dans `src/components/ligne` ;
- une ligne au tableau des composants du handover frontend (§ 5) ;
- `ReviewScreen.tsx` qui l'utilise.

La tâche ne duplique aucune logique de flèches. Si un déplacement au clavier est voulu, il vient du code existant de Ligne, sans copie. La tâche ne change ni texte ni comportement de l'écran 16.

### 2. Relais des rappels (R-D, R-B) : précisions de 0162 (Tech Lead)

#### 2.1 `42501` à l'insertion de `reminder_relays` : `fin` seulement si la relecture confirme le retrait

**Précise** 0162 § 3 point 2.4 et § 4 S-R2, sur ce seul cas. Ce n'est pas un amendement de fond.

0162 § 3 point 2.4 classait tout `42501` en `panne`. Or, une réclamation sur un accord retiré échoue en `42501` même avec `ON CONFLICT DO NOTHING`, car le `WITH CHECK` passe avant la détection du conflit (mineur 2 de #1067, `tests/db/rappels-relais.test.ts` l. 370-379). Ce cas est donc attendu quand l'accord est retiré entre la lecture et l'insertion.

Règle, telle que livrée par R-B (`src/server/rappels/relais.ts` l. 27-33 et l. 94-100) :
- `42501` à l'insertion : l'accord est relu (`SQL_ACCORD`) dans une **nouvelle** transaction de `withOrg` ;
- accord plus actif → **`fin`** (fin de chaîne légitime, sans journal, non comptée comme un essai) ;
- accord encore actif (droit retiré, par exemple après la descente de 0027), ou relecture en échec → **`panne`** (`rappels.relay_failed`, nom seul, compté dans `RELAIS_ESSAIS_MAX`) ;
- toute autre erreur reste en `panne`, comme dans 0162.

Source : réponse 1 de la revue du head `fb9bbd4` de #1078 (« confirmé »). Le commentaire de `relais.ts` l. 29-30 dit « amende », alors que « précise » est le mot juste (mineur 1 de la même revue). Il sera corrigé à la prochaine PR qui touche le fichier. Cette PR ne touche pas `src/`.

#### 2.2 `rappels.relay_duplicate` est écrit dans l'étape de réclamation

L'événement `rappels.relay_duplicate` (nom seul, niveau `info`) est écrit **dans** `etapeReclamationRelais` (`src/workflows/rappels.ts` l. 70-80), pas dans le corps de `rappelsVeille`. Le corps du workflow est rejoué, une étape ne l'est pas : une seule ligne est écrite par réclamation. Le workflow compte donc quatre `"use step"` (0162 § 6.2 point 2).

Source : réponse 2 de la revue du head `fb9bbd4` de #1078 (« confirmé »). Cela précise 0162 § 3 point 3, qui n'indiquait pas où l'événement est écrit.

#### 2.3 `RELAY_TABLES` au lieu d'un ajout à `REMINDER_TABLES`

`tests/db/helpers.ts` déclare `RELAY_TABLES = ["reminder_relays"]` (l. 159-166). `REMINDER_TABLES` reste `["reminder_consents", "reminder_sends"]` (l. 149). Raison : les cas de `tests/db/rappels.test.ts` décrivent les deux tables de 0024 telles quelles. `reminder_relays` est hors du peuplement commun, comme les rappels (clé `NO ACTION` vers les accords). `tests/db/roles.test.ts` (l. 141, 222, 469) l'ajoute aux listes de droits et de purge.

**Remplace** la mention de `REMINDER_TABLES` en 0162 § 6.1 (« `tests/db/helpers.ts` (`REMINDER_TABLES`, l. 149) »). Une table nouvelle des rappels qui n'est pas une table de 0024 suit le modèle de `RELAY_TABLES` (ou de `REVIEW_TABLES`).

Source : question 1 de la revue du head `c9d2ba1` de #1067 (« confirmé ») et mineur 4 (« consigner `RELAY_TABLES` dans la prochaine décision ou note de version »).

#### 2.4 Verdicts de la Sécurité rapportés (rien n'est tranché ici)

- **S-R1 à S-R6** (0162 § 4, migration 0027) : **OK** avec les valeurs posées, d'après les revues consolidées des heads `c9d2ba1` et `d4523c2` de #1067. Valeurs posées :
  - `SELECT` de table ;
  - `EXISTS` par personne, avec `withdrawn_at IS NULL` à l'insertion ;
  - aucun déclencheur ;
  - conservation jusqu'à la purge du compte ;
  - borne lâche `^wrun_[0-9A-Za-z]{1,59}$` ;
  - ordre de purge relais → envois → accords.

  À la revue du head `c9d2ba1`, la Sécurité n'avait relu ni les deux fichiers de tests ni le cliché. Elle les a relus à la revue du head `d4523c2`. Le mineur 1 (`SELECT` par colonnes, « non exigé ») reste une option.
- **S1** (0160 § 2.1, migration 0026) : **favorable**, sous réserve des mineurs 1 à 3 (revue consolidée du head `dd23bce` de #1057). Ces mineurs sont consignés par l'amendement de 0160 (PR #1066, point 4).

Le handover backend reprend ces deux verdicts au § 6 (voir « Textes amendés »).

### 3. Essais du code d'accès : `specs/P0-suite-2.md` renvoie à 0165

`specs/P0-suite-2.md` l. 151 et l. 290 disent encore « 5 essais par heure ». Depuis 0165 § 1.2 (forme d'E1, confirmée par la Sécurité dans #1072, livrée par #1077) :
- seuls les **refus** sont comptés, 5 par heure glissante ;
- le bon code est comparé d'abord et n'est jamais refusé par le compte.

0165 (« Textes amendés ») dit déjà que la décision prime. Cette PR ajoute une ligne de renvoi en italique sous chacune des deux lignes, sur le modèle du renvoi à 0111 (`specs/P0-suite-2.md` l. 428 avant cette PR). Le texte du Product Owner n'est pas réécrit. Le titre du critère `p0: jeton limité à 5 essais par heure…` reste, il désigne désormais les refus (0165).

Source : mineur 2 de la revue du head `fc8ec3a` de #1077 (« une ligne d'amendement est facultative »). Elle est jugée utile : un lecteur de la spécification ne voit pas 0165 sans elle.

## Textes amendés (par renvoi, sans les réécrire)

- **0162 § 3 point 2.4 et § 4 S-R2** : précisés par le § 2.1. **0162 § 3 point 3** : précisé par le § 2.2. **0162 § 6.1** : `REMINDER_TABLES` y devient `RELAY_TABLES` (§ 2.3).
- **`specs/P0-suite-2.md`** l. 151 et l. 290 (numéros d'avant cette PR) : une ligne de renvoi à 0165 sous chacune (§ 3).
- **`docs/handovers/backend.md`**, § 6, puce « Après le voyage » (migration 0026) : « verdict de la Sécurité attendu » devient le verdict S1 favorable, avec sa référence (§ 2.4).
- **`docs/handovers/backend.md`**, § 6, puce « Relais des rappels » (migration 0027) :
  - « verdict de la Sécurité attendu » devient S-R1 à S-R6 confirmées, avec leur référence ;
  - la phrase « Le § 8.7 … est mis à jour par R-B, pas par R-D » est remplacée par un renvoi au § 8.7, mis à jour par R-B (#1078). Mineur 4 de la revue du head `fb9bbd4`.
  - le refus `42501` renvoie au § 2.1.

**Non modifiés par cette PR** : les autres mentions « verdict de la Sécurité attendu » de 0026 et 0027.
- `db/migrations/0026_apres_voyage.sql` l. 2 et `db/migrations/0027_rappels_relais.sql` l. 2 : modifier une migration change son empreinte.
- `db/README.md` l. 120-121 ;
- `tests/db/roles.test.ts` l. 68 et l. 88 ;
- `tests/db/rappels-relais.test.ts` l. 13 ;
- `tests/db/apres-voyage.test.ts` l. 13.

Voir § 4.

## Conséquences et suites (pour le CEO)

1. Ticket `[front]` `ToggleGroup` (§ 1.3), après la fusion de #1068.
2. Petit ticket `[data]` de commentaires : remplacer « verdict de la Sécurité attendu » par le verdict et sa référence dans `db/README.md` (l. 120-121), `tests/db/roles.test.ts` (l. 68, l. 88), `tests/db/rappels-relais.test.ts` (l. 13) et `tests/db/apres-voyage.test.ts` (l. 13). **Jamais dans les fichiers de migration** : l'empreinte de 0026 et de 0027 ne doit pas changer.
3. À la prochaine PR qui touche `src/server/rappels/relais.ts` : « amende » devient « précise » (l. 30). Mineur 1 de la revue du head `fb9bbd4` de #1078.
4. Facultatif, au prochain ticket `[front]` qui touche « Mes voyages » : un cas e2e ou unitaire avec un voyage terminé **et** un reçu, qui vérifie l'ordre avis puis reçu (§ 1.1).

## Quand revoir

- Si Ligne gagne un état d'attente commun (composant ou jeton) : il remplace le pointillé du § 1.2.
- À l'extraction de `ToggleGroup` (§ 1.3) : l'écart à 0018 du § 7 de `specs/M8-apres-le-voyage-api.md` s'applique au composant, plus seulement à l'écran 16.
- Si la Sécurité revient sur S-R2 (condition `withdrawn_at IS NULL` à l'insertion) : le cas du § 2.1 disparaît.
