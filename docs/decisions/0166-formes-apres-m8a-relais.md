# 0166 — Après R-D, R-B et E1 : précisions du relais des rappels (`42501`, `rappels.relay_duplicate`, `RELAY_TABLES`), renvoi de `specs/P0-suite-2.md` à 0165, tâche d'extraction de `ToggleGroup`

Statut : **proposée par l'agent tech-lead, définitive à la fusion (0093)**. C'est une décision déléguée du **Tech Lead** (architecture, bibliothèques, outillage, tests : « Qui décide quoi » de `docs/CONTEXT.md`, l. 37-43). Elle ne crée aucun choix nouveau :
- le § 1 précise 0162 sur trois points, que les revues de #1067 et #1078 ont confirmés ;
- le § 2 ajoute un renvoi à 0165 dans `specs/P0-suite-2.md` ;
- le § 3 fixe la forme d'une tâche à ouvrir.

Les verdicts de la Sécurité sont rapportés par renvoi (§ 1.4) et ne sont pas tranchés ici. **Aucune forme d'interface n'est tranchée ici** : l'ordre des liens de « Mes voyages » et le contour pointillé « envoi en cours » de M8a relèvent de l'UX/UI (`docs/CONTEXT.md` l. 39). Ils sont renvoyés à une décision de l'UX/UI, à rédiger après la fusion de #1068 (« Conséquences », point 1). Rien de ce qui revient à Samuel n'est tranché.

À lister dans la prochaine note de version (rubrique « Décisions prises par le studio »). Samuel peut la remettre en cause à tout moment, par une nouvelle décision.

Date : 2026-11-09 · Décideur : Tech Lead · Ticket : #1080 · `main` relu : `a8e6b66` (après #1077, #1078 et #1084) · Correction 1 (2026-11-09) : revue consolidée du head `9d1ba5e` de la PR #1085. Bloquants 1 à 3 : le § 1 d'origine (formes M8a) sort de la décision, sur décision du CEO, et sa tâche `ToggleGroup` devient le § 3, sans référence au code non fusionné. Mineurs 3 à 13 traités ou renvoyés (« Conséquences »).

Numérotation : `main` va jusqu'à 0165. Au 2026-11-09, aucune des PR ouvertes ne touche `docs/decisions/`, sauf celle-ci. À recontrôler au moment de la fusion, car un concurrent sur 0166 reste possible.

**Ce que cette décision n'engage pas.** Aucun code, aucun test, aucune migration, aucun réglage. Aucune dépense, aucun compte externe, aucune donnée personnelle nouvelle, aucune donnée Google.

Sources vérifiées (commentaires de Samoulou commençant par « ## Revue consolidée ») :
- #1078 (R-B, fusionnée, `ea950a5`) : head `fb9bbd4`, réponses 1 et 2, mineurs 1 et 4.
- #1067 (R-D, fusionnée) : heads `c9d2ba1` et `d4523c2`, verdict S-R1 à S-R6, question 1, mineurs 2 et 4.
- #1077 (E1, fusionnée) : head `fc8ec3a`, mineur 2.
- #1057 (M8-D, fusionnée) : head `dd23bce`, verdict S1.
- #1066 : amendement de 0160, fusionnée.
- #1068 (M8a, **ouverte**, head `b2c6060` au 2026-11-09) : head `001c21e`, mineur 2. Seule source du § 3.

## Décision

### 1. Relais des rappels (R-D, R-B) : précisions de 0162

#### 1.1 `42501` à l'insertion de `reminder_relays` : `fin` seulement si la relecture confirme le retrait

Ce point **précise** 0162 § 3 point 2.4 et § 4 S-R2, sur ce seul cas.

0162 § 3 point 2.4 classait tout `42501` en `panne`. Or, une réclamation sur un accord retiré échoue en `42501` même avec `ON CONFLICT DO NOTHING`, car le `WITH CHECK` passe avant la détection du conflit (mineur 2 de #1067 ; `tests/db/rappels-relais.test.ts` l. 370-379). Ce cas est donc attendu quand l'accord est retiré entre la lecture et l'insertion.

Règle, telle que R-B l'a livrée sur `main` (`src/server/rappels/relais.ts` l. 27-33 et l. 94-100) :
- `42501` à l'insertion : l'accord est relu (`SQL_ACCORD`) dans une **nouvelle** transaction de `withOrg` ;
- accord plus actif → **`fin`** : fin de chaîne légitime, sans journal, non comptée comme un essai ;
- accord encore actif (droit retiré, par exemple après la descente de 0027) ou relecture en échec → **`panne`** : `rappels.relay_failed`, nom seul, compté dans `RELAIS_ESSAIS_MAX` ;
- toute autre erreur reste en `panne`, comme dans 0162.

Source : réponse 1 de la revue du head `fb9bbd4` de #1078 (« confirmé »).

Le commentaire de `relais.ts` l. 29-30 dit « amende », alors que « précise » est le mot juste (mineur 1 de la même revue). Il sera corrigé à la prochaine PR qui touche ce fichier, car cette PR ne touche pas `src/`.

#### 1.2 `rappels.relay_duplicate` est écrit dans l'étape de réclamation

Ce point **précise** 0162 § 3 point 3, qui ne disait pas où l'événement est écrit.

L'événement `rappels.relay_duplicate` (nom seul, niveau `info`) est écrit **dans** `etapeReclamationRelais` (`src/workflows/rappels.ts` l. 70-80), pas dans le corps de `rappelsVeille`. Le corps du workflow est rejoué ; l'étape ne l'est pas. Chaque réclamation n'écrit donc qu'une ligne. Le workflow compte quatre `"use step"` sur `main` (0162 § 6.2 point 2).

Source : réponse 2 de la revue du head `fb9bbd4` de #1078 (« confirmé »).

#### 1.3 `RELAY_TABLES` pour `reminder_relays`

Ce point **précise** 0162 § 6.1 pour la seule table `reminder_relays`.

`tests/db/helpers.ts` déclare `RELAY_TABLES = ["reminder_relays"]` (l. 159-166). `REMINDER_TABLES` reste `["reminder_consents", "reminder_sends"]` (l. 149) et reste valable partout où 0162 § 6.1 parle de ces deux tables.

Raisons :
- les cas de `tests/db/rappels.test.ts` décrivent les deux tables de 0024 telles quelles ;
- `reminder_relays` est hors du peuplement commun, comme les rappels (clé `NO ACTION` vers les accords).

`tests/db/roles.test.ts` (l. 141, 222, 469) ajoute `RELAY_TABLES` aux listes de droits et de purge. Une table nouvelle des rappels qui n'est pas une table de 0024 suit le modèle de `RELAY_TABLES` (ou de `REVIEW_TABLES`).

Source : question 1 de la revue du head `c9d2ba1` de #1067 (« confirmé ») et mineur 4 (« consigner `RELAY_TABLES` dans la prochaine décision ou note de version »).

#### 1.4 Verdicts de la Sécurité rapportés (rien n'est tranché ici)

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

### 2. Essais du code d'accès : `specs/P0-suite-2.md` renvoie à 0165

`specs/P0-suite-2.md` l. 151 et l. 290 (numéros d'avant cette PR) disent encore « 5 essais par heure ». 0165 a changé cette règle : forme d'E1 au § 1.2, confirmée par la Sécurité dans #1072, livrée par #1077.

0165 (« Textes amendés ») dit déjà que la décision prime. Cette PR ajoute, sous chacune des deux lignes, une ligne de renvoi en italique qui cite 0165 mot pour mot (§ 1.3 et « Textes amendés »). Le modèle est le renvoi à 0111 (`specs/P0-suite-2.md` l. 428 d'avant cette PR). Le texte du Product Owner n'est pas réécrit. Le titre du critère `p0: jeton limité à 5 essais par heure…` reste ; il désigne désormais les refus (0165).

Source : mineur 2 de la revue du head `fc8ec3a` de #1077 (« une ligne d'amendement est facultative »). Je la juge utile, car sans elle un lecteur de la spécification ne voit pas 0165.

### 3. Tâche d'extraction de `ToggleGroup` (Tech Lead : forme d'une tâche, à ouvrir après la fusion de #1068)

Source : mineur 2 de la revue du head `001c21e` de #1068 (UX/UI, gravité 2). Le premier point a été validé par la revue UX/UI du head `9d1ba5e` de cette PR. Le reste ne vaut qu'une fois #1068 fusionnée, et sur le texte de `main` à ce moment-là. Rien ici ne décrit le code de #1068 comme existant.

1. **Pas de variante « effaçable » de `SegmentedControl`.** `SegmentedControl` reste un choix exclusif au sens de 0018 (« Choix exclusif et action », l. 100-103 : `radiogroup`, jamais `aria-pressed`).
2. **Ticket `[front]` « Extraire `ToggleGroup` dans `src/components/ligne` »**, que le CEO ouvrira après la fusion de #1068. Il extrait le groupe de choix de l'avis rapide de l'écran 16 (fonction `ChoiceGroup` de `ReviewScreen`) dans un composant de Ligne, sans changer de texte ni de comportement. Il livre :
   - le composant et son test dans `src/components/ligne` ;
   - l'écran 16 qui l'utilise ;
   - une ligne au tableau des composants du handover frontend (§ 5).
3. **Accessibilité du composant.** Elle reprend sans l'élargir l'écart à 0018 que #1068 acte au § 7 de `specs/M8-apres-le-voyage-api.md`. Si #1068 fusionne sans cet écart, le ticket attend une décision de l'UX/UI. La ligne du handover écrit :
   - un `role="group"` nommé (`aria-label`) ;
   - des boutons `aria-pressed`, au plus un pressé ;
   - un second appui sur le bouton pressé efface le choix, et l'effacement est annoncé par une région `role="status"` (le texte vient de l'écran appelant).

   C'est une **dérogation limitée** à 0018 : un groupe exclusif **et effaçable**, parce qu'un radio natif ne se décoche pas. L'alternative conforme (`SegmentedControl` en `radiogroup` plus un bouton texte « Effacer mon avis ») n'est pas celle que l'UX/UI a retenue dans #1068, où elle a validé l'écart (revue du head `b2c6060`). La réexaminer relève de l'UX/UI, pas du ticket. **`aria-pressed` n'y vaut pas précédent** pour un autre choix exclusif.
4. **0018 n'est pas modifiée par le ticket.** Si l'UX/UI veut que d'autres écrans emploient `ToggleGroup`, elle précise 0018 par une décision à elle, au moment de l'extraction ou après.
5. **Tokens et icônes existants seulement**. Un token nouveau relève de 0018 l. 22 et du tableau `provisoire.css`. Le ticket n'ajoute aucune fiche à `docs/design-system/components/`, car le design system n'est pas modifié. Il ne duplique aucune logique de flèches. Si un déplacement au clavier est voulu, il vient du code existant de Ligne, sans copie.
6. Les états hors ligne et « envoi en cours » du composant suivent le rendu de l'écran 16 tel que `main` l'aura après #1068, **et la décision UX/UI du point 1 des « Conséquences »** pour le contour pointillé.

## Textes amendés (par renvoi, sans les réécrire)

- **0162 § 3 point 2.4 et § 4 S-R2** : précisés par le § 1.1.
- **0162 § 3 point 3** : précisé par le § 1.2.
- **0162 § 6.1** : précisé par le § 1.3, pour la seule table `reminder_relays`, qui relève de `RELAY_TABLES`. `REMINDER_TABLES` y reste juste pour `reminder_consents` et `reminder_sends`.
- **`specs/P0-suite-2.md`** l. 151 et l. 290 (numéros d'avant cette PR) : une ligne de renvoi à 0165 sous chacune (§ 2).
- **`docs/handovers/backend.md`**, § 6, puce « Après le voyage » (migration 0026) : « verdict de la Sécurité attendu » devient le verdict S1 favorable, avec sa référence (§ 1.4).
- **`docs/handovers/backend.md`**, § 6, puce « Relais des rappels » (migration 0027) :
  - « verdict de la Sécurité attendu » devient S-R1 à S-R6 confirmées, avec leur référence ;
  - le refus `42501` renvoie au § 1.1 ;
  - la phrase historique « Le § 8.7 … est mis à jour par R-B, pas par R-D » (mineur 4 de la revue du head `fb9bbd4`) est remplacée par un renvoi au § 8, sous-section « 7. Rappels la veille » : ligne « Réclamation du relais » du tableau et puce « Relais réclamé en base », mises à jour par #1078.

**Non modifiés par cette PR** : les autres mentions « verdict de la Sécurité attendu » de 0026 et 0027. Elles se trouvent dans :
- `db/migrations/0026_apres_voyage.sql` l. 2 et `db/migrations/0027_rappels_relais.sql` l. 2 ;
- `db/README.md` l. 120-121 ;
- `tests/db/roles.test.ts` l. 68 et l. 88 ;
- `tests/db/rappels-relais.test.ts` l. 13 ;
- `tests/db/apres-voyage.test.ts` l. 13.

Voir « Conséquences », point 3.

## Conséquences et suites (pour le CEO)

1. **Décision UX/UI à rédiger après la fusion de #1068** (rôle `ux-ui`, sur le code de `main`). Elle porte sur l'ordre des liens d'une ligne de « Mes voyages » et sur le contour pointillé `ink-soft` « envoi en cours » de l'écran 16. Elle cite :
   - 0012 l. 60 : « Sur un contour, le pointillé a dans Ligne un seul sens, "incertain, à confirmer" » ;
   - 0018 l. 100-103 (« Choix exclusif et action ») ;
   - pour le pointillé, la revue du head `9d1ba5e` de #1085. Selon cette revue, un second sens du pointillé sortirait de la délégation de l'UX/UI (« dans les règles de Ligne ») et relèverait de Samuel ; « Enregistrement… » en `role="status"` avec `aria-busy` suffirait (0018, « Attente »).

   Elle reprend aussi les mineurs UX/UI de cette revue qui portaient sur l'ancien § 1 :
   - dire si « Enregistrement… » est dans la région `role="status"`, et si les boutons restent actifs pendant l'envoi (un second appui pourrait effacer l'avis à tort) ;
   - pour les trois liens, garder pour chacun la cible tactile de 44 px (`touch-target`, `docs/design-system/README.md` l. 69), sans recouvrement, avec un ordre visuel égal à l'ordre du DOM ; les libellés vivent dans `src/i18n/fr/mesVoyages.json` ;
   - séparer « contour » et « rail » dans la liste des usages du pointillé (le README place le rail dans « La ligne du jour ») ;
   - citer le code par nom de fonction (`TripRow`, `ChoiceGroup`) plutôt que par numéro de ligne.
2. Ticket `[front]` `ToggleGroup` (§ 3), après la fusion de #1068 et après la décision du point 1.
3. Petit ticket `[data]` de commentaires. Il remplace « verdict de la Sécurité attendu » par le verdict et sa référence dans `db/README.md` (l. 120-121), `tests/db/roles.test.ts` (l. 68, l. 88), `tests/db/rappels-relais.test.ts` (l. 13) et `tests/db/apres-voyage.test.ts` (l. 13).

   **Jamais dans les fichiers de migration.** L'empreinte se vérifie par `sha256sum db/migrations/0026_apres_voyage.sql db/migrations/0027_rappels_relais.sql`, avant et après la PR. La valeur doit rester celle de la description de #1057 et de l'amendement de 0160 pour 0026 (`1ac33b56…8902`), et celle de la revue du head `c9d2ba1` de #1067 pour 0027 (`687d370a…0ef77`). Une fois ajoutée, la ligne `MIGRATIONS_APPROUVEES` de `.github/workflows/db-migrate.yml` doit porter les mêmes valeurs ; le workflow la vérifie par `sha256sum`, l. 154. Vérifié pour les deux fichiers sur `a8e6b66`.
4. À la prochaine PR qui touche `src/server/rappels/relais.ts` : « amende » devient « précise » (l. 30). Mineur 1 de la revue du head `fb9bbd4` de #1078.

## Quand revoir

- À l'extraction de `ToggleGroup` (§ 3) : si l'UX/UI étend l'emploi du composant, elle précise 0018 (§ 3 point 4).
- Si la Sécurité revient sur S-R2 (condition `withdrawn_at IS NULL` à l'insertion) : le cas du § 1.1 disparaît.
